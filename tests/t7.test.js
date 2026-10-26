import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** @type {{ calls: any[], scripts: Array<Array<{ text?: string, tool?: { name: string, input: object } }>> }} */
const fake = { calls: [], scripts: [] };

/**
 * A mocked Claude client: each messages.stream call plays the next scripted round,
 * streaming its text in small chunks, then a tool_use or end_turn.
 */
function fakeClient() {
  return {
    messages: {
      stream: vi.fn((params) => {
        fake.calls.push(JSON.parse(JSON.stringify(params)));
        const round = fake.scripts.shift() ?? [{ text: "" }];
        /** @type {((delta: string) => void) | null} */
        let onText = null;
        return {
          on(event, listener) {
            if (event === "text") onText = listener;
            return this;
          },
          async finalMessage() {
            const content = [];
            for (const [index, step] of round.entries()) {
              if (step.text) {
                for (const chunk of step.text.match(/[\s\S]{1,7}/g) ?? []) onText?.(chunk);
                content.push({ type: "text", text: step.text });
              }
              if (step.tool) content.push({ type: "tool_use", id: `tool_${fake.calls.length}_${index}`, name: step.tool.name, input: step.tool.input });
            }
            return { stop_reason: content.some((block) => block.type === "tool_use") ? "tool_use" : "end_turn", content };
          },
        };
      }),
    },
  };
}

vi.mock("../lib/claude.js", async () => {
  const actual = await vi.importActual("../lib/claude.js");
  return { ...actual, createClient: vi.fn(() => fakeClient()) };
});

import { POST } from "../api/chat.js";
import { JD_FIT_STATUS, finalJdFitAnswer } from "../lib/chat.js";
import { JD_FIT_PROMPT, checkJdFitAnswer } from "../lib/jd-fit.js";
import { getKb, recordIds } from "../lib/kb-data.js";
import { readCaps, resetLimitState, validateChatBody } from "../lib/limits.js";
import { SYSTEM_PROMPT, buildSystem } from "../lib/prompts.js";
import { createDashNet, sourceFor, sourcesForAnswer } from "../lib/sources.js";
import { TOOLS, executeTool, getRecord, searchDocs } from "../lib/tools.js";

const ENV_KEYS = ["ANTHROPIC_API_KEY", "MODEL_ID", "IP_SALT", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "ALLOWED_ORIGINS", "NODE_ENV"];
/** @type {Record<string, string | undefined>} */
const saved = {};

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.MODEL_ID = "model-from-env";
  process.env.IP_SALT = "test-salt";
  resetLimitState();
  fake.calls = [];
  fake.scripts = [];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

/** @param {unknown} body */
async function ask(body) {
  const response = await POST(
    new Request("http://127.0.0.1/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  );
  const text = await response.text();
  const events = text
    .split("\n\n")
    .filter((block) => block.trim() !== "")
    .map((block) => {
      const event = block.match(/^event: (.*)$/m)?.[1] ?? "message";
      const data = JSON.parse(block.match(/^data: (.*)$/m)?.[1] ?? "null");
      return { event, data };
    });
  return { status: response.status, events, answer: events.filter((e) => e.event === "delta").map((e) => e.data.text).join("") };
}

const user = (content) => [{ role: "user", content }];
const caps = readCaps({});

describe("request validator (T7, #6)", () => {
  /** @param {unknown} body */
  const check = (body) => validateChatBody(body, caps);

  it("accepts a role scope and a project scope that exist in the KB", () => {
    expect(check({ messages: user("Hi"), scope: { type: "role", id: "role-captech-consultant" } })).toMatchObject({ ok: true, scope: { type: "role", id: "role-captech-consultant" } });
    expect(check({ messages: user("Hi"), scope: { type: "project", id: "project-cleat" } })).toMatchObject({ ok: true, scope: { type: "project", id: "project-cleat" } });
    expect(check({ messages: user("Hi"), mode: "jd_fit" })).toMatchObject({ ok: true, mode: "jd_fit" });
  });

  it.each([
    ["an unknown scope id", { messages: user("Hi"), scope: { type: "role", id: "role-made-up" } }],
    ["a project id with type role", { messages: user("Hi"), scope: { type: "role", id: "project-cleat" } }],
    ["a role id with type project", { messages: user("Hi"), scope: { type: "project", id: "role-captech-consultant" } }],
    ["a bullet id as a scope", { messages: user("Hi"), scope: { type: "role", id: "bullet-captech-consultant-4" } }],
    ["an extra scope key", { messages: user("Hi"), scope: { type: "project", id: "project-cleat", name: "Cleat" } }],
    ["another mode", { messages: user("Hi"), mode: "summary" }],
    ["mode and scope together", { messages: user("Hi"), mode: "jd_fit", scope: { type: "project", id: "project-cleat" } }],
    ["an unknown top level field", { messages: user("Hi"), stream: true }],
  ])("rejects %s as invalid", (_name, body) => {
    expect(check(body)).toEqual({ ok: false, code: "invalid" });
  });

  it("gives the T2 length error for a job description over 8k characters", () => {
    expect(caps.maxMessageChars).toBe(8000);
    expect(check({ messages: user("a".repeat(8001)), mode: "jd_fit" })).toEqual({ ok: false, code: "too_long" });
    expect(check({ messages: user("a".repeat(8000)), mode: "jd_fit" })).toMatchObject({ ok: true });
  });

  it("returns the too_long SSE error over HTTP for a long job description", async () => {
    const { status, events } = await ask({ messages: user("a".repeat(8001)), mode: "jd_fit" });
    expect(status).toBe(400);
    expect(events).toEqual([{ event: "error", data: expect.objectContaining({ code: "too_long" }) }]);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("citation labels and links", () => {
  it("labels a resume bullet with employer, title and bullet number, linking the role", () => {
    expect(sourceFor("bullet-captech-consultant-4")).toEqual({
      id: "bullet-captech-consultant-4",
      label: "Resume · CapTech Consulting, Software Engineer Consultant · bullet 4",
      href: "#role-captech-consultant",
    });
  });

  it("labels earlier resume bullets as Earlier resume", () => {
    for (const id of ["bullet-captech-consultant-support", "bullet-captech-consultant-onboarding", "bullet-captech-intern-chatbot"]) {
      expect(sourceFor(id)?.label).toMatch(/^Earlier resume · CapTech Consulting$/);
    }
  });

  it("labels a doc chunk with project and doc title, linking its GitHub URL", () => {
    const source = sourceFor("doc-cleat-architecture-1-one-liner-stack");
    expect(source?.label).toBe("Cleat · architecture doc");
    expect(source?.href).toMatch(/^https:\/\/github\.com\/jaysinghcodes\/Cleat\/blob\//);
    const api = getKb().docs.find((doc) => doc.project === "Mission Control" && doc.title === "API");
    expect(sourceFor(api.id)?.label).toBe("Mission Control · API doc");
  });

  it("links roles, projects, skills and education to page anchors", () => {
    expect(sourceFor("role-captech-consultant")).toMatchObject({ label: "Resume · CapTech Consulting, Software Engineer Consultant", href: "#role-captech-consultant" });
    expect(sourceFor("project-cleat")).toMatchObject({ label: "Cleat · project", href: "#project-cleat" });
    expect(sourceFor("skill-python")?.href).toBe("#skills");
    expect(sourceFor("education-osu")?.href).toBe("#education-osu");
  });

  it("maps cites to sources in first cite order and drops unknown ids", () => {
    const text = "Jay ships agents [bullet-captech-consultant-4]. Cleat runs a gate [doc-cleat-architecture-1-one-liner-stack][made-up-id]. Again [bullet-captech-consultant-4]. A footnote [1] and a link [x](https://a.b).";
    expect(sourcesForAnswer(text).map((s) => s.id)).toEqual(["bullet-captech-consultant-4", "doc-cleat-architecture-1-one-liner-stack"]);
  });

  it("every source label and the behavior prompt are free of dash punctuation and arrows", () => {
    const labels = recordIds().map((id) => sourceFor(id)?.label ?? "");
    for (const text of [...labels, SYSTEM_PROMPT]) expect(text).not.toMatch(/[\u2012-\u2015\u2190-\u21FF]|\s-\s|--|->|=>/);
  });
});

describe("dash safety net", () => {
  it("turns em and en dashes into a comma and a space", () => {
    const net = createDashNet();
    expect(net("Jay built Cleat \u2014 a scheduling tool, 2023\u20132024.")).toBe("Jay built Cleat, a scheduling tool, 2023, 2024.");
  });

  it("does not leave a double space when the dash ends a chunk", () => {
    const net = createDashNet();
    const out = ["Cleat \u2014", "  a tool", " that works"].map(net).join("");
    expect(out).toBe("Cleat, a tool that works");
  });

  it("applies to the streamed answer", async () => {
    fake.scripts.push([{ text: "Jay builds agents \u2014 in production [bullet-captech-consultant-4]." }]);
    const { answer } = await ask({ messages: user("What does Jay build?") });
    expect(answer).toBe("Jay builds agents, in production [bullet-captech-consultant-4].");
  });
});

describe("tools", () => {
  it("offers search_docs and get_record, and no resume tool", () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual(["search_docs", "get_record"]);
  });

  it("search_docs finds doc chunks and can filter to one project by name or id", () => {
    const all = searchDocs("architecture");
    expect(all.length).toBeGreaterThan(0);
    expect(all.length).toBeLessThanOrEqual(5);
    for (const project of ["Mission Control", "project-mission-control"]) {
      const hits = searchDocs("agent", { project });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.every((hit) => hit.project === "Mission Control")).toBe(true);
    }
    expect(searchDocs("architecture", { project: "project-made-up" })).toEqual([]);
  });

  it("a project scope forces search_docs onto that project", () => {
    const hits = JSON.parse(executeTool("search_docs", { query: "architecture", project: "Mission Control" }, { scope: { type: "project", id: "project-cleat" } }));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.project === "Cleat")).toBe(true);
  });

  it("get_record returns a story only when story_public is true, and no provenance", () => {
    const open = getRecord("bullet-captech-consultant-4");
    expect(open?.story).toBeTruthy();
    const closed = getRecord("bullet-procrewz-1");
    expect(closed).toBeTruthy();
    expect(closed).not.toHaveProperty("story");
    for (const key of ["source", "as_of", "story_public", "resume_text"]) expect(open).not.toHaveProperty(key);
    expect(executeTool("get_record", { id: "nope" })).toBe("No record with that id.");
  });

  it("a scoped ask passes the scope to the tool loop and filters search_docs", async () => {
    fake.scripts.push([{ tool: { name: "search_docs", input: { query: "architecture", project: "Mission Control" } } }]);
    fake.scripts.push([{ text: "Cleat is built on a locked stack [doc-cleat-architecture-1-one-liner-stack]." }]);
    const { events } = await ask({ messages: user("How is it built?"), scope: { type: "project", id: "project-cleat" } });
    expect(events[0]).toEqual({ event: "status", data: { text: "Searching project docs" } });
    const toolResult = fake.calls[1].messages.at(-1).content[0].content;
    expect(JSON.parse(toolResult).every((hit) => hit.project === "Cleat")).toBe(true);
    expect(fake.calls[0].system.at(-1).text).toContain("scoped to one project: Cleat [project-cleat]");
  });
});

describe("system blocks", () => {
  it("sends behavior, then the cached core KB, with tools", async () => {
    fake.scripts.push([{ text: "Jay is a consultant [role-captech-consultant]." }]);
    await ask({ messages: user("Who is Jay?") });
    const [call] = fake.calls;
    expect(call.system).toHaveLength(2);
    expect(call.system[0].text).toBe(SYSTEM_PROMPT);
    expect(call.system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(call.tools.map((tool) => tool.name)).toEqual(["search_docs", "get_record"]);
  });

  it("the core KB block has profile, roles, bullets, skills, education, achievements and faqs, without private wording", () => {
    const kbText = buildSystem()[1].text;
    const json = JSON.parse(kbText.split("\n")[1]);
    expect(Object.keys(json)).toEqual(["profile", "roles", "bullets", "skills", "education", "achievements", "faqs"]);
    expect(kbText).not.toContain('"story"');
    expect(kbText).not.toContain('"resume_text"');
    expect(kbText).not.toContain('"docs"');
    expect(json.bullets.find((b) => b.id === "bullet-captech-intern-chatbot").earlier_resume).toBe(true);
    expect(kbText).toContain("Jay's rules for what never to say");
    expect(getKb().never_say.length).toBeGreaterThan(0);
  });

  it("mode jd_fit adds the existing JD_FIT_PROMPT and no scope note", () => {
    const blocks = buildSystem({ mode: "jd_fit" });
    expect(blocks).toHaveLength(3);
    expect(blocks[2].text).toBe(JD_FIT_PROMPT);
  });

  it("a role scope adds a note naming the role", () => {
    const blocks = buildSystem({ scope: { type: "role", id: "role-captech-consultant" } });
    expect(blocks[2].text).toContain("Software Engineer Consultant at CapTech Consulting [role-captech-consultant]");
  });
});

describe("sources event", () => {
  it("sends labeled sources for known cites and drops unknown ids", async () => {
    fake.scripts.push([{ text: "Jay ships agents [bullet-captech-consultant-4] and more [ghost-record]." }]);
    const { events } = await ask({ messages: user("Agents?") });
    const sources = events.find((e) => e.event === "sources")?.data.sources;
    expect(sources).toEqual([
      { id: "bullet-captech-consultant-4", label: "Resume · CapTech Consulting, Software Engineer Consultant · bullet 4", href: "#role-captech-consultant" },
    ]);
    expect(events.at(-1)).toEqual({ event: "done", data: {} });
  });
});

const GOOD_JD = `Strong matches
- AWS delivery at scale [bullet-captech-consultant-4]

Partial matches
- Python services [skill-python]

Closest experience
- Kubernetes: container work on ECS [bullet-captech-consultant-1]`;

describe("JD fit (mode jd_fit)", () => {
  it("buffers the answer, checks it and sends it once with sources", async () => {
    expect(checkJdFitAnswer(GOOD_JD, { sourceIds: recordIds() })).toEqual([]);
    fake.scripts.push([{ text: GOOD_JD }]);
    const { events } = await ask({ messages: user("Senior engineer, AWS, Python, Kubernetes"), mode: "jd_fit" });
    expect(fake.calls[0].system.at(-1).text).toBe(JD_FIT_PROMPT);
    expect(events.map((e) => e.event)).toEqual(["status", "delta", "sources", "done"]);
    expect(events[0].data.text).toBe(JD_FIT_STATUS);
    expect(events[1].data.text).toBe(GOOD_JD);
    expect(events[2].data.sources.map((s) => s.id)).toEqual(["bullet-captech-consultant-4", "skill-python", "bullet-captech-consultant-1"]);
  });

  it("a failing answer is sent as what the shared parser renders, with sources for what remains (path a)", async () => {
    const bad = `Here is the fit.\n\n${GOOD_JD}\n- Go services\n\nGaps\n- Kafka [ghost-record]`;
    expect(checkJdFitAnswer(bad, { sourceIds: recordIds() }).length).toBeGreaterThan(0);
    fake.scripts.push([{ text: bad }]);
    const { events, answer } = await ask({ messages: user("JD text"), mode: "jd_fit" });
    expect(answer).not.toContain("Here is the fit");
    expect(answer).not.toContain("Gaps");
    expect(answer).not.toContain("Go services");
    expect(answer).toContain("Strong matches\n- AWS delivery at scale [bullet-captech-consultant-4]");
    expect(checkJdFitAnswer(answer, { sourceIds: recordIds() })).toEqual([]);
    expect(events.find((e) => e.event === "sources")?.data.sources.map((s) => s.id)).not.toContain("ghost-record");
    expect(events.at(-1)?.event).toBe("done");
  });

  it("an answer with nothing renderable sends the server error (empty state is a follow-up)", async () => {
    expect(finalJdFitAnswer("No cited matches here.", recordIds()).text).toBe("");
    fake.scripts.push([{ text: "I could not find anything relevant." }]);
    const { events } = await ask({ messages: user("JD text"), mode: "jd_fit" });
    expect(events.at(-1)).toEqual({ event: "error", data: expect.objectContaining({ code: "server" }) });
    expect(events.some((e) => e.event === "delta")).toBe(false);
  });
});
