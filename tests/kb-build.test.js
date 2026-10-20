import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it } from "vitest";
import { buildKnowledgeBase } from "../lib/kb-build.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temps = [];

afterEach(() => {
  while (temps.length > 0) {
    const dir = temps.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("knowledge base build", () => {
  it("writes kb.json from the empty files", () => {
    const outDir = makeTemp();
    const outPath = path.join(outDir, "kb.json");
    const result = buildKnowledgeBase({
      kbDir: path.join(root, "kb"),
      outPath,
      env: {},
      now: "2026-10-20T12:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    expect(result.warnings.join("\n")).toMatch(/KB_BANNED_TERMS is unset/);
    const kb = requireKb(result);
    expect(kb.meta.built_at).toBe("2026-10-20");
    expect(kb.profile).toBeNull();
    expect(kb.roles).toEqual([]);
    expect(kb.bullets).toEqual([]);
    expect(kb.projects).toEqual([]);
    expect(kb.skills).toEqual([]);
    expect(kb.education).toEqual([]);
    expect(kb.achievements).toEqual([]);
    expect(kb.certifications).toEqual([]);
    expect(kb.faqs).toEqual([]);
    expect(kb.never_say).toEqual([]);
    expect(kb.docs).toEqual([]);
    expect(kb.values).toBe(fs.readFileSync(path.join(root, "kb/values.md"), "utf8"));
    expect(kb).not.toHaveProperty("open_questions");
    expect(JSON.parse(fs.readFileSync(outPath, "utf8"))).toEqual(kb);
  });

  it("warns and still passes when KB_BANNED_TERMS is blank", () => {
    const result = build(tempKb({
      "bullets.json": [bullet({ display_text: "Met Acme Bank" })],
    }), { KB_BANNED_TERMS: "   " });

    expect(result.ok).toBe(true);
    expect(result.warnings.join("\n")).toMatch(/KB_BANNED_TERMS is unset/);
    expect(requireKb(result).bullets).toHaveLength(1);
  });

  it.each([
    ["em dash", `Ship ${"\u2014"} fast`, "em dash"],
    ["en dash", `Ship ${"\u2013"} fast`, "en dash"],
    ["figure dash", `Ship ${"\u2012"} fast`, "figure dash"],
    ["horizontal bar", `Ship ${"\u2015"} fast`, "horizontal bar"],
    ["spaced hyphen", "Ship - fast", "spaced hyphen"],
    ["hyphenated compound", "cloud-native", "hyphen joining two words"],
    ["ascii arrow", `Ship ${"-" + ">"} fast`, "arrow"],
    ["fat arrow", `Ship ${"=" + ">"} fast`, "arrow"],
    ["left arrow", `Ship ${"<" + "-"} fast`, "arrow"],
    ["unicode arrow", `Ship ${"\u2192"} fast`, "arrow"],
  ])("%s in a display field fails and names the file, id, and field", (_label, displayText, reason) => {
    const result = build(tempKb({
      "bullets.json": [bullet({ display_text: displayText })],
    }));

    expect(result.ok).toBe(false);
    const line = result.errors.find((error) => error.includes("display_text"));
    expect(line).toMatch(/kb\/bullets\.json/);
    expect(line).toMatch(/id=bullet-1/);
    expect(line).toMatch(/field=display_text/);
    expect(line).toMatch(new RegExp(reason));
  });

  it("fails a story field and names the nested field", () => {
    const result = build(tempKb({
      "bullets.json": [bullet({
        story: { context: `Then ${"\u2014"} now` },
      })],
    }));

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(
      /kb\/bullets\.json id=bullet-1 field=story\.context: em dash/,
    );
  });

  it("leaves resume text unchecked for dash punctuation", () => {
    const result = build(tempKb({
      "bullets.json": [bullet({
        resume_text: `cloud-native ${"\u2014"} ${"-" + ">"} done`,
        display_text: "Shipped the service.",
      })],
    }));

    expect(result.ok).toBe(true);
  });

  it("ignores dashes and arrows inside a URL", () => {
    const result = build(tempKb({
      "bullets.json": [bullet({
        display_text: `See https://example.com/cloud-native/a${"-" + ">"}b for the writeup.`,
      })],
    }));

    expect(result.ok).toBe(true);
  });

  it("ignores an allowlisted phrase and still flags an arrow beside it", () => {
    const allowed = build(tempKb({
      "allowlist.json": { phrases: ["cloud-native"] },
      "bullets.json": [bullet({ display_text: "Built a cloud-native service." })],
    }));
    expect(allowed.ok).toBe(true);

    const flagged = build(tempKb({
      "allowlist.json": { phrases: ["cloud-native"] },
      "bullets.json": [bullet({
        display_text: `Built a cloud-native service ${"-" + ">"} next`,
      })],
    }));
    expect(flagged.ok).toBe(false);
    expect(flagged.errors.join("\n")).toMatch(/field=display_text: arrow/);
  });

  it("fails values markdown that contains an em dash", () => {
    const result = build(tempKb({
      "values.md": `# Values\nPlain words ${"\u2014"} more\n`,
    }));

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/kb\/values\.md id=values field=body: em dash/);
  });

  it.each([
    ["missing", () => omit(bullet(), "source")],
    ["empty string", () => bullet({ source: "" })],
    ["blank string", () => bullet({ source: "   " })],
    ["empty array", () => bullet({ source: [] })],
    ["blank item", () => bullet({ source: ["resume", " "] })],
  ])("a record with a %s source fails the build", (_label, makeBullet) => {
    const result = build(tempKb({ "bullets.json": [makeBullet()] }));

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(
      /kb\/bullets\.json id=bullet-1 field=source: missing source/,
    );
  });

  it("accepts source as a non empty string or a non empty array of strings", () => {
    const result = build(tempKb({
      "bullets.json": [
        bullet({ id: "bullet-1", source: "resume" }),
        bullet({ id: "bullet-2", source: ["resume", "notes"] }),
      ],
    }));

    expect(result.ok).toBe(true);
    expect(requireKb(result).bullets).toHaveLength(2);
  });

  it("fails a banned term in a public field and allows it on a private record", () => {
    const terms = { KB_BANNED_TERMS: "Acme Bank, Globex" };
    const leaked = build(tempKb({
      "bullets.json": [bullet({ display_text: "Worked with Acme Bank." })],
    }), terms);

    expect(leaked.ok).toBe(false);
    expect(leaked.warnings).toEqual([]);
    expect(leaked.errors.join("\n")).toMatch(
      /kb\/bullets\.json id=bullet-1 field=display_text: banned term/,
    );

    const hidden = build(tempKb({
      "bullets.json": [bullet({
        public: false,
        display_text: "Worked with Acme Bank and Globex.",
        notes: "Acme Bank",
      })],
    }), terms);

    expect(hidden.ok).toBe(true);
    expect(requireKb(hidden).bullets).toEqual([]);
  });

  it("matches banned terms without case sensitivity, including inside notes", () => {
    const result = build(tempKb({
      "faqs.json": [record({
        id: "faq-1",
        question: "Who was the client?",
        answer: "A bank.",
        notes: "globex internal",
      })],
    }), { KB_BANNED_TERMS: "Acme Bank, Globex" });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/kb\/faqs\.json id=faq-1 field=notes: banned term/);
  });

  it("does not fail a banned term that only sits on a nested private object", () => {
    const result = build(tempKb({
      "projects.json": [record({
        id: "project-1",
        name: "Side project",
        one_liner: "A public line.",
        built_with_note: { public: false, text: "Acme Bank helped." },
      })],
    }), { KB_BANNED_TERMS: "Acme Bank, Globex" });

    expect(result.ok).toBe(true);
    const kb = requireKb(result);
    expect(JSON.stringify(kb)).not.toMatch(/Acme Bank/);
    expect(kb.projects[0].one_liner).toBe("A public line.");
    expect(kb.projects[0]).not.toHaveProperty("built_with_note");
  });

  it("fails a phone number pattern in a public field", () => {
    const result = build(tempKb({
      "bullets.json": [bullet({
        resume_text: `Call ${fakePhone()} tomorrow.`,
        display_text: "Shipped the service.",
      })],
    }));

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(
      /kb\/bullets\.json id=bullet-1 field=resume_text: phone number/,
    );
  });

  it("fails a phone number pattern on a private record too", () => {
    const result = build(tempKb({
      "bullets.json": [bullet({
        public: false,
        notes: `Reach ${fakePhone()}`,
      })],
    }));

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/field=notes: phone number/);
  });

  it("rejects a phone field anywhere in the schema", () => {
    const top = build(tempKb({
      "bullets.json": [bullet({ phone: "hidden" })],
    }));
    expect(top.ok).toBe(false);
    expect(top.errors.join("\n")).toMatch(
      /kb\/bullets\.json id=bullet-1 field=phone: phone fields are not allowed/,
    );

    const nested = build(tempKb({
      "profile.json": record({
        id: "profile",
        full_name: "Jay Singh",
        private: { phone: "hidden" },
      }),
    }));
    expect(nested.ok).toBe(false);
    expect(nested.errors.join("\n")).toMatch(
      /kb\/profile\.json id=profile field=private\.phone: phone fields are not allowed/,
    );

    const story = build(tempKb({
      "bullets.json": [bullet({ story: { context: "Fine", phone: "hidden" } })],
    }));
    expect(story.ok).toBe(false);
    expect(story.errors.join("\n")).toMatch(/field=story\.phone: phone fields are not allowed/);
  });

  it("leaves unsure and private records out of kb.json", () => {
    const result = build(tempKb({
      "bullets.json": [
        bullet({ id: "public-bullet", display_text: "Shown on the page." }),
        bullet({ id: "private-bullet", public: false, display_text: "Agent only." }),
        bullet({ id: "unsure-bullet", confidence: "unsure", display_text: "Not confirmed." }),
      ],
      "profile.json": record({
        id: "profile",
        confidence: "unsure",
        headline: "AI native software engineer.",
      }),
    }));

    expect(result.ok).toBe(true);
    const kb = requireKb(result);
    expect(kb.profile).toBeNull();
    expect(kb.bullets.map((item) => item.id)).toEqual(["public-bullet"]);
    const serialized = JSON.stringify(kb);
    expect(serialized).not.toMatch(/Agent only/);
    expect(serialized).not.toMatch(/Not confirmed/);
  });

  it("drops private nested objects and private fields from public output", () => {
    const result = build(tempKb({
      "projects.json": [record({
        id: "project-1",
        name: "Side project",
        one_liner: "A public line.",
        notes: "internal note",
        level_internal: "senior",
        private_notes: { text: "secret text", public: true },
        private: { detail: "hidden detail" },
        story_public: true,
        built_with_note: { public: false, text: "drop this object" },
        shown_note: { public: true, text: "keep this", notes: "drop this note" },
        metrics: [
          { value: "75%", public: false, label: "hidden metric" },
          { value: "80%", label: "shown metric" },
        ],
      })],
      "skills.json": [record({
        id: "skill-1",
        name: "Python",
        display_name: "Python",
        level_internal: "deep",
      })],
    }));

    expect(result.ok).toBe(true);
    const kb = requireKb(result);
    const project = kb.projects[0];
    const keys = keysOf(kb);
    for (const key of ["notes", "level_internal", "private_notes", "private"]) {
      expect(keys.has(key)).toBe(false);
    }
    expect(project.story_public).toBe(true);
    expect(project.one_liner).toBe("A public line.");
    expect(project.shown_note).toEqual({ public: true, text: "keep this" });
    expect(project).not.toHaveProperty("built_with_note");
    expect(project.metrics).toEqual([{ value: "80%", label: "shown metric" }]);
    expect(kb.skills[0]).not.toHaveProperty("level_internal");
    expect(kb.skills[0].display_name).toBe("Python");

    const serialized = JSON.stringify(kb);
    expect(serialized).not.toMatch(/internal note/);
    expect(serialized).not.toMatch(/secret text/);
    expect(serialized).not.toMatch(/hidden detail/);
    expect(serialized).not.toMatch(/drop this object/);
    expect(serialized).not.toMatch(/drop this note/);
    expect(serialized).not.toMatch(/hidden metric/);
    expect(serialized).toMatch(/keep this/);
  });

  it("validates open questions and never copies them into kb.json", () => {
    const present = build(tempKb({
      "open_questions.json": [record({
        id: "oq-1",
        question: "Which month was that?",
        affects: "dates",
        answer: "Not sure yet",
        status: "open",
        resolved_on: "",
      })],
    }));
    expect(present.ok).toBe(true);
    const presentKb = requireKb(present);
    expect(presentKb).not.toHaveProperty("open_questions");
    expect(JSON.stringify(presentKb)).not.toMatch(/Which month was that/);

    const invalid = build(tempKb({
      "open_questions.json": [{ id: "oq-1" }],
    }));
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join("\n")).toMatch(/kb\/open_questions\.json/);

    const omitted = build(tempKb({ "open_questions.json": undefined }));
    expect(omitted.ok).toBe(true);
    expect(requireKb(omitted)).not.toHaveProperty("open_questions");
  });

  it("keeps extra fields such as story_public", () => {
    const result = build(tempKb({
      "bullets.json": [bullet({ story_public: false, story_confidence: "verified" })],
    }));

    expect(result.ok).toBe(true);
    const kb = requireKb(result);
    expect(kb.bullets[0].story_public).toBe(false);
    expect(kb.bullets[0].story_confidence).toBe("verified");
  });

  it("publishes public doc chunks and leaves private chunks out", () => {
    const result = build(tempKb({
      "docs/cleat.json": [
        record({
          id: "doc-cleat",
          project: "cleat",
          title: "Architecture",
          text: "How the pieces fit.",
          url: "https://example.com/cleat",
        }),
        record({
          id: "doc-hidden",
          public: false,
          title: "Notes",
          text: "Keep this chunk out.",
        }),
      ],
    }));

    expect(result.ok).toBe(true);
    const docs = requireKb(result).docs;
    expect(docs.map((item) => item.id)).toEqual(["doc-cleat"]);
    expect(JSON.stringify(docs)).not.toMatch(/Keep this chunk out/);
  });

  it("has no founder or venture schema", () => {
    const schemaDir = path.join(root, "kb/schema");
    const names = fs.readdirSync(schemaDir);
    expect(names.join("\n").toLowerCase()).not.toMatch(/venture|founder/);
    for (const name of names) {
      const text = fs.readFileSync(path.join(schemaDir, name), "utf8").toLowerCase();
      expect(text).not.toMatch(/venture|founder/);
    }
    expect(fs.existsSync(path.join(root, "kb/ventures.json"))).toBe(false);
  });

  it("wires the knowledge base build into npm run build and ci", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    expect(pkg.scripts["kb:build"]).toMatch(/build-kb/);
    expect(pkg.scripts.build).toMatch(/kb:build/);
    expect(pkg.dependencies.ajv).toBeTruthy();

    const ci = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toMatch(/npm run kb:build/);
    expect(ci).toMatch(/KB_BANNED_TERMS/);

    const example = fs.readFileSync(path.join(root, ".env.example"), "utf8");
    expect(example).toMatch(/^KB_BANNED_TERMS=.+$/m);

    const setup = fs.readFileSync(path.join(root, "docs/SETUP.md"), "utf8");
    expect(setup).toMatch(/KB_BANNED_TERMS/);
    expect(setup).toMatch(/GitHub Actions/);
    expect(setup).toMatch(/Vercel/);
    expect(setup).toMatch(/\.env/);
  });
});

/**
 * @param {Record<string, unknown>} [overrides]
 */
function record(overrides = {}) {
  return {
    id: "rec-1",
    source: "resume",
    as_of: "2026-10-18",
    confidence: "verified",
    public: true,
    notes: "",
    ...overrides,
  };
}

/**
 * @param {Record<string, unknown>} [overrides]
 */
function bullet(overrides = {}) {
  return record({
    id: "bullet-1",
    role_id: "role-1",
    order: 1,
    resume_text: "Shipped the service.",
    display_text: "Shipped the service.",
    metrics: [],
    skills: [],
    story: {},
    show_on_page: true,
    ...overrides,
  });
}

/**
 * @param {Record<string, unknown>} value
 * @param {string} key
 */
function omit(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function fakePhone() {
  return ["555", "010", "0199"].join("-");
}

/**
 * @param {Record<string, unknown>} files
 */
function tempKb(files) {
  const dir = makeTemp();
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  /** @type {Record<string, unknown>} */
  const defaults = {
    "profile.json": null,
    "roles.json": [],
    "bullets.json": [],
    "projects.json": [],
    "skills.json": [],
    "education.json": [],
    "achievements.json": [],
    "certifications.json": [],
    "faqs.json": [],
    "never_say.json": [],
    "open_questions.json": [],
    "allowlist.json": { phrases: [] },
    "values.md": "# Values\n",
  };
  const merged = { ...defaults, ...files };
  for (const [name, content] of Object.entries(merged)) {
    if (content === undefined) continue;
    const target = path.join(dir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const text = typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`;
    fs.writeFileSync(target, text);
  }
  return dir;
}

/**
 * @param {string} dir
 * @param {NodeJS.ProcessEnv} [env]
 */
function build(dir, env = {}) {
  return buildKnowledgeBase({
    kbDir: dir,
    outPath: path.join(dir, "out", "kb.json"),
    env,
    now: "2026-10-20T00:00:00.000Z",
  });
}

/**
 * @param {{ ok: boolean, kb: { meta: { built_at: string }, profile: Record<string, unknown> | null, roles: Record<string, unknown>[], bullets: Record<string, unknown>[], projects: Record<string, unknown>[], skills: Record<string, unknown>[], education: Record<string, unknown>[], achievements: Record<string, unknown>[], certifications: Record<string, unknown>[], values: string, faqs: Record<string, unknown>[], never_say: Record<string, unknown>[], docs: Record<string, unknown>[] } | null }} result
 */
function requireKb(result) {
  if (!result.ok || !result.kb) throw new Error("expected a public kb.json");
  return result.kb;
}

function makeTemp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-build-"));
  temps.push(dir);
  return dir;
}

/**
 * @param {unknown} value
 * @param {Set<string>} [found]
 * @returns {Set<string>}
 */
function keysOf(value, found = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      found.add(key);
      keysOf(child, found);
    }
  }
  return found;
}
