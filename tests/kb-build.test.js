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
  it("writes kb.json from the seeded knowledge base", () => {
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
    if (!kb.profile) throw new Error("missing profile");
    expect(kb.profile.headline).toBe("AI native software engineer.");
    expect(kb.profile.availability).toBe("Open to new roles");
    expect(kb.roles).toHaveLength(4);
    const pageBullets = kb.bullets.filter((bullet) => bullet.show_on_page);
    expect(pageBullets).toHaveLength(11);
    expect(kb.projects.filter((project) => project.featured).map((project) => project.name)).toEqual([
      "Cleat",
      "Mission Control",
      "Ask Jay",
    ]);
    expect([...new Set(kb.skills.map((skill) => skill.group))]).toEqual([
      "Languages",
      "AI and data",
      "Cloud and frameworks",
    ]);
    expect(kb.education).toHaveLength(1);
    expect(kb.docs.length).toBeGreaterThan(0);
    const older = kb.bullets.filter((bullet) => bullet.source === "resume_2024");
    expect(older).toHaveLength(3);
    expect(older.every((bullet) => bullet.show_on_page === false)).toBe(true);
    const iayp = kb.achievements.find((item) => item.id === "achievement-iayp");
    if (!iayp) throw new Error("missing iayp");
    expect(iayp.source).toBe("resume_2024");
    expect(iayp.show_on_page).toBe(false);
    expect(kb.certifications).toEqual([]);
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

  it.each([
    ["double space", "Talked with Acme  Bank today."],
    ["non breaking space", `Talked with Acme${"\u00A0"}Bank today.`],
    ["em space", `Talked with Acme${"\u2003"}Bank today.`],
  ])("fails a banned term hidden by a %s", (_label, displayText) => {
    const dir = tempKb({
      "bullets.json": [bullet({ display_text: displayText })],
    });
    const result = build(dir, { KB_BANNED_TERMS: "Acme Bank" });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(
      /kb\/bullets\.json id=bullet-1 field=display_text: banned term/,
    );
    expect(outputMissing(dir)).toBe(true);
  });

  it("fails a banned term used as a key", () => {
    const dir = tempKb({
      "bullets.json": [bullet({ "Acme Bank": "alias" })],
    });
    const result = build(dir, { KB_BANNED_TERMS: "Acme Bank" });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(
      /kb\/bullets\.json id=bullet-1 field=Acme Bank: banned term/,
    );
    expect(outputMissing(dir)).toBe(true);
  });

  it("fails a banned term on an unsure record", () => {
    const dir = tempKb({
      "bullets.json": [bullet({
        confidence: "unsure",
        display_text: "Worked with Acme Bank.",
      })],
    });
    const result = build(dir, { KB_BANNED_TERMS: "Acme Bank" });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/field=display_text: banned term/);
    expect(outputMissing(dir)).toBe(true);
  });

  it("treats the env example placeholder as an unset banned term list", () => {
    const example = fs.readFileSync(path.join(root, ".env.example"), "utf8");
    const match = example.match(/^KB_BANNED_TERMS=(.+)$/m);
    if (!match) throw new Error("expected KB_BANNED_TERMS in .env.example");
    const placeholder = match[1];

    const skipped = build(tempKb({
      "bullets.json": [bullet({ display_text: `Mention ${placeholder} in public.` })],
    }), { KB_BANNED_TERMS: placeholder });
    expect(skipped.ok).toBe(true);
    expect(skipped.warnings.join("\n")).toMatch(/KB_BANNED_TERMS is unset/);

    const stillBanned = build(tempKb({
      "bullets.json": [bullet({ display_text: "Worked with Acme Bank." })],
    }), { KB_BANNED_TERMS: `${placeholder}, Acme Bank` });
    expect(stillBanned.ok).toBe(false);
    expect(stillBanned.errors.join("\n")).toMatch(/field=display_text: banned term/);
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
    const dir = tempKb({
      "bullets.json": [bullet({
        resume_text: `Call ${fakePhone()} tomorrow.`,
        display_text: "Shipped the service.",
      })],
    });
    const result = build(dir);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(
      /kb\/bullets\.json id=bullet-1 field=resume_text: phone number/,
    );
    expect(outputMissing(dir)).toBe(true);
  });

  it("fails a phone number pattern on a private record too", () => {
    const dir = tempKb({
      "bullets.json": [bullet({
        public: false,
        notes: `Reach ${fakePhone()}`,
      })],
    });
    const result = build(dir);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/field=notes: phone number/);
    expect(outputMissing(dir)).toBe(true);
  });

  it.each([
    ["bare digits", () => digitGroups().join("")],
    ["leading 1", () => `1${digitGroups().join("")}`],
    ["compact plus 1", () => `${plusMark()}1${digitGroups().join("")}`],
    ["tel compact", () => `tel:${plusMark()}1${digitGroups().join("")}`],
    ["tel bare", () => `tel:${digitGroups().join("")}`],
    ["tel with spaces", () => `tel: ${plusMark()}44 ${ukGroups().join(" ")}`],
    ["paren without a space", () => `(${digitGroups()[0]})${digitGroups()[1]} ${digitGroups()[2]}`],
    ["paren compact", () => `(${digitGroups()[0]})${digitGroups()[1]}${digitGroups()[2]}`],
    ["dots", () => digitGroups().join(".")],
    ["spaces", () => digitGroups().join(" ")],
    ["hyphens", () => digitGroups().join("-")],
    ["paren with a space", () => `(${digitGroups()[0]}) ${digitGroups()[1]}-${digitGroups()[2]}`],
    ["plus 44 spaced", () => `${plusMark()}44 ${ukGroups().join(" ")}`],
    ["plus 91 spaced", () => `${plusMark()}91 ${inGroups().join(" ")}`],
    ["plus 44 compact", () => `${plusMark()}44${ukGroups().join("")}`],
    ["plus 44 dotted", () => `${plusMark()}44.${ukGroups().join(".")}`],
    ["plus 44 paren", () => `${plusMark()}44 (${digitGroups()[0]}) ${digitGroups()[1]} ${digitGroups()[2]}`],
    ["non breaking space", () => digitGroups().join("\u00A0")],
  ])("fails a %s phone form and does not write kb.json", (_label, makeText) => {
    const dir = tempKb({
      "bullets.json": [bullet({
        display_text: `Call ${makeText()} today.`,
      })],
    });
    fs.mkdirSync(path.join(dir, "out"), { recursive: true });
    fs.writeFileSync(path.join(dir, "out", "kb.json"), "{}\n");
    const result = build(dir);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(
      /kb\/bullets\.json id=bullet-1 field=display_text: phone number/,
    );
    expect(outputMissing(dir)).toBe(true);
  });

  it("fails a phone number nested in a metric label", () => {
    const dir = tempKb({
      "bullets.json": [bullet({
        metrics: [{ label: `Call ${digitGroups().join("-")}`, value: "1" }],
      })],
    });
    const result = build(dir);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/field=metrics\[0\]\.label: phone number/);
    expect(outputMissing(dir)).toBe(true);
  });

  it("passes a commit SHA in a doc url and in text", () => {
    const sha = "43aff81936cc627f6e3959879246fa6d0e1ca171";
    const spacedId = "d1000000 0000 4000 8000 000000000001";
    const hyphenId = ["d1000000", "0000", "4000", "8000", "000000000001"].join("-");
    const url = `https://github.com/jaysinghcodes/Cleat/blob/${sha}/docs/architecture.md`;
    const text = `Pinned at ${sha}. Demo org ${spacedId} stays on.`;
    const result = build(tempKb({
      "docs/cleat.json": [record({
        id: "doc-cleat-architecture",
        confidence: "verified",
        public: true,
        source: url,
        project: "cleat",
        title: "Architecture",
        heading: "Stack",
        text,
        url,
        notes: `Chunked by heading from Cleat docs/architecture.md at ${sha}. Org ${hyphenId}.`,
      })],
    }));

    expect(result.ok).toBe(true);
    const doc = requireKb(result).docs[0];
    expect(doc.url).toBe(url);
    expect(doc.text).toBe(text);
    expect(doc.confidence).toBe("verified");
    expect(doc.public).toBe(true);
    expect(doc.source).toBe(url);
  });

  it("passes years, dates, and ids that are not phone numbers", () => {
    const result = build(tempKb({
      "bullets.json": [bullet({
        id: "rec-12345678",
        as_of: "2026-10-18",
        display_text: "Class of 2024. On 2026-10-18 and 2026-10-19 the launch shipped. Logged 2026-10-19T21:07:00Z.",
        resume_text: "Shipped in 2026. Room 5555. Build abc1234.",
        story: { context: "Ticket 123456789 closed." },
        metrics: [{ value: 2026, label: "year" }, { value: 75, label: "share" }],
      })],
    }), { KB_BANNED_TERMS: "Acme Bank" });

    expect(result.ok).toBe(true);
    expect(requireKb(result).bullets[0].id).toBe("rec-12345678");
  });

  it("passes an allowlisted id and still fails a different phone number", () => {
    const allowedId = ["1234567", "890123"].join("");
    const listed = build(tempKb({
      "phone-allowlist.txt": `${allowedId}\tfixture id, not a phone number\n`,
      "bullets.json": [bullet({ display_text: `Ref ${allowedId} is public.` })],
    }));
    expect(listed.ok).toBe(true);

    const stillPhone = build(tempKb({
      "phone-allowlist.txt": `${allowedId}\tfixture id, not a phone number\n`,
      "bullets.json": [bullet({ display_text: `Call ${digitGroups().join(" ")} today.` })],
    }));
    expect(stillPhone.ok).toBe(false);
    expect(stillPhone.errors.join("\n")).toMatch(/field=display_text: phone number/);
  });

  it("passes a short plus code that is not an international number", () => {
    const result = build(tempKb({
      "bullets.json": [bullet({
        display_text: `Extension ${plusMark()}445555 is an internal code.`,
      })],
    }));

    expect(result.ok).toBe(true);
  });

  it.each([
    ["resume_text", "resume_text"],
    ["notes", "notes"],
    ["display_text", "display_text"],
  ])("fails unicode dashes in %s", (label, field) => {
    for (const code of [0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212]) {
      const dash = String.fromCodePoint(code);
      const dir = tempKb({
        "bullets.json": [bullet({
          [field]: `Call ${digitGroups().join(dash)} today.`,
        })],
      });
      const result = build(dir);
      expect(result.ok, label).toBe(false);
      expect(result.errors.join("\n")).toMatch(new RegExp(`field=${field}: phone number`));
      expect(outputMissing(dir)).toBe(true);
    }
  });

  it("fails a phone number used as a key", () => {
    const key = ["555", "555", "0123"].join("");
    const dir = tempKb({
      "bullets.json": [bullet({
        story: { [key]: "call" },
      })],
    });
    const result = build(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(new RegExp(`field=story\\.${key}: phone number`));
    expect(outputMissing(dir)).toBe(true);

    const spacedKey = `${plusMark()}1 ${digitGroups().join(" ")}`;
    const parenKey = `(${digitGroups()[0]}) ${digitGroups()[1]}-${digitGroups()[2]}`;
    for (const phoneKey of [spacedKey, parenKey]) {
      const nested = build(tempKb({
        "bullets.json": [bullet({
          metrics: [{ [phoneKey]: "call", value: "1" }],
        })],
      }));
      expect(nested.ok).toBe(false);
      expect(nested.errors.join("\n")).toMatch(/field=metrics\[0\].*: phone number/);
    }
  });

  it("fails a phone number stored as a JSON number", () => {
    const ten = Number(["555", "555", "0123"].join(""));
    const eleven = Number(`1${["555", "555", "0123"].join("")}`);
    const metric = tempKb({
      "bullets.json": [bullet({ metrics: [{ value: ten }] })],
    });
    const metricResult = build(metric);
    expect(metricResult.ok).toBe(false);
    expect(metricResult.errors.join("\n")).toMatch(/field=metrics\[0\]\.value: phone number/);
    expect(outputMissing(metric)).toBe(true);

    const profile = tempKb({
      "profile.json": record({
        id: "profile",
        full_name: "Jay Singh",
        contact_number: eleven,
      }),
    });
    const profileResult = build(profile);
    expect(profileResult.ok).toBe(false);
    expect(profileResult.errors.join("\n")).toMatch(/field=contact_number: phone number/);
    expect(outputMissing(profile)).toBe(true);
  });

  it.each([
    ["slashes", () => digitGroups().join("/")],
    ["underscores", () => digitGroups().join("_")],
    ["commas", () => digitGroups().join(",")],
    ["a space between every digit", () => digitGroups().join("").split("").join(" ")],
    ["a dot between every digit", () => digitGroups().join("").split("").join(".")],
    ["uneven hyphen", () => `${digitGroups()[0]}-${digitGroups()[1]}${digitGroups()[2]}`],
    ["uneven space", () => `${digitGroups()[0]} ${digitGroups()[1]}${digitGroups()[2]}`],
    ["trailing group", () => `${digitGroups()[0]}${digitGroups()[1]}-${digitGroups()[2]}`],
    ["glued extension", () => `${digitGroups().join("-")}x12`],
    ["glued letters", () => `call${digitGroups().join("")}`],
    ["fullwidth digits", () => fullwidthDigits(digitGroups().join(""))],
    ["arabic indic digits", () => indicDigits(digitGroups().join(""), 0x0660)],
    ["extended arabic indic digits", () => indicDigits(digitGroups().join(""), 0x06F0)],
    ["fullwidth plus", () => `\uFF0B${fullwidthDigits(`1${digitGroups().join("")}`)}`],
    ["fullwidth brackets", () => `\uFF08${fullwidthDigits(digitGroups()[0])}\uFF09${fullwidthDigits(digitGroups()[1])}-${fullwidthDigits(digitGroups()[2])}`],
    ["zero width space", () => digitGroups().join("\u200B")],
    ["soft hyphen", () => digitGroups().join("\u00AD")],
    ["percent encoded tel", () => `tel:%2B1${digitGroups().join("")}`],
    ["uk national", () => ["020", "7946", "0958"].join(" ")],
    ["uk mobile", () => ["07700", "900123"].join(" ")],
    ["india national", () => ["98765", "43210"].join(" ")],
    ["idd prefix", () => ["0044", "20", "7946", "0958"].join(" ")],
    ["nbsp entity", () => ["555", "555", "0123"].join("&nbsp;")],
    ["decimal entity", () => ["555", "555", "0123"].join("&#160;")],
    ["hex entity", () => ["555", "555", "0123"].join("&#xA0;")],
    ["letters after the digits", () => `${["555", "555", "0123"].join("")}call`],
    ["glued ext word", () => `${["555", "555", "0123"].join("")}ext 12`],
    ["hyphen groups then abc", () => `${["555", "555", "0123"].join("-")}abc`],
    ["plus then a trailing letter", () => `${plusMark()}1${["555", "555", "0123"].join("")}a`],
    ["hex letter after the digits", () => `${["555", "555", "0123"].join("")}e`],
    ["hex letter before the digits", () => `cafe${["555", "555", "0123"].join("")}`],
    ["two numbers joined by a comma", () => `${["555", "555", "0123"].join("-")}, ${["555", "555", "0199"].join("-")}`],
  ])("fails a %s phone bypass", (_label, makeText) => {
    const dir = tempKb({
      "bullets.json": [bullet({ display_text: `Call ${makeText()} today.` })],
    });
    const result = build(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/field=display_text: phone number/);
    expect(outputMissing(dir)).toBe(true);
  });

  it.each([
    ["no space", "Worked with AcmeBank today."],
    ["zero width space", `Worked with Acme${"\u200B"}Bank today.`],
    ["soft hyphen", `Worked with Acme${"\u00AD"}Bank today.`],
    ["cyrillic a", `Worked with Acme B${"\u0430"}nk today.`],
    ["cyrillic capital a", `Worked with ${"\u0410"}cme Bank today.`],
    ["fullwidth letters", `Worked with ${fullwidthLetters("Acme Bank")} today.`],
  ])("fails a banned term hidden by %s", (_label, displayText) => {
    const dir = tempKb({
      "bullets.json": [bullet({ display_text: displayText })],
    });
    const result = build(dir, { KB_BANNED_TERMS: "Acme Bank" });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/field=display_text: banned term/);
    expect(outputMissing(dir)).toBe(true);
  });

  it("fails a phone number on an unsure record", () => {
    const dir = tempKb({
      "bullets.json": [bullet({
        confidence: "unsure",
        display_text: `Call ${digitGroups().join(" ")} today.`,
      })],
    });
    const result = build(dir);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/field=display_text: phone number/);
    expect(outputMissing(dir)).toBe(true);
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

  it.each([
    ["Phone", () => bullet({ Phone: "hidden" }), /field=Phone: phone fields are not allowed/],
    ["phone_number", () => bullet({ phone_number: "hidden" }), /field=phone_number: phone fields are not allowed/],
    ["contact.mobile", () => bullet({ contact: { mobile: "hidden" } }), /field=contact\.mobile: mobile fields are not allowed/],
  ])("rejects a %s key and does not write kb.json", (_label, makeBullet, pattern) => {
    const dir = tempKb({ "bullets.json": [makeBullet()] });
    const result = build(dir);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(pattern);
    expect(outputMissing(dir)).toBe(true);
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
    expect(setup).toMatch(/kb-build\.js/);
    expect(setup).toMatch(/UTC calendar date/);

    const phoneAllow = fs.readFileSync(path.join(root, "kb/phone-allowlist.txt"), "utf8");
    for (const line of phoneAllow.split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith("#")) continue;
      expect(line).toMatch(/\S.*\t\S/);
    }
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

function digitGroups() {
  return ["555", "555", "5555"];
}

function ukGroups() {
  return ["5555", "555555"];
}

function inGroups() {
  return ["55555", "55555"];
}

function plusMark() {
  return "+";
}

/**
 * @param {string} ascii
 */
function fullwidthDigits(ascii) {
  return [...ascii].map((ch) => {
    if (ch < "0" || ch > "9") return ch;
    return String.fromCodePoint(0xFF10 + Number(ch));
  }).join("");
}

/**
 * @param {string} ascii
 * @param {number} zero
 */
function indicDigits(ascii, zero) {
  return [...ascii].map((ch) => {
    if (ch < "0" || ch > "9") return ch;
    return String.fromCodePoint(zero + Number(ch));
  }).join("");
}

/**
 * @param {string} ascii
 */
function fullwidthLetters(ascii) {
  return [...ascii].map((ch) => {
    if (ch >= "A" && ch <= "Z") return String.fromCodePoint(0xFF21 + ch.charCodeAt(0) - 65);
    if (ch >= "a" && ch <= "z") return String.fromCodePoint(0xFF41 + ch.charCodeAt(0) - 97);
    return ch;
  }).join("");
}

/**
 * @param {string} dir
 */
function outputMissing(dir) {
  return !fs.existsSync(path.join(dir, "out", "kb.json"));
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
