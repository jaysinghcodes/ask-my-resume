import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import kb from "../kb/kb.json";
import {
  ASK_COPY,
  FRIENDLY,
  JD_FIT_SECTIONS,
  jdFitBlocks,
  JD_MAX_CHARS,
  MAX_THREAD_MESSAGES,
  askTarget,
  buildChatBody,
  atMessageCap,
  featuredChips,
  friendlyError,
  historyFor,
  jdCounter,
  layoutAnswer,
  normalizeSources,
  safeHref,
} from "../frontend/src/ask/askModel.js";
import { consumeSse, parseSseBlock } from "../frontend/src/ask/sse.js";
import { streamChat } from "../frontend/src/ask/askClient.js";
import { focusTargetFor, resetFocusToTop, scrollToId } from "../frontend/src/components/ScrollToHash.jsx";
import { askAbout, registerAskHandler } from "../frontend/src/components/askAbout.js";
import { AskAnswer } from "../frontend/src/components/AskAnswer.jsx";
import { ChatPage } from "../frontend/src/pages/ChatPage.jsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** @param {unknown} value @returns {any} */
const loose = (value) => value;
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const DASH_OR_ARROW = /[\u2012-\u2015\u2190-\u21ff\u27f5-\u27ff]|\s-\s|->|=>/;

function render(element) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, element));
}

function sseResponse(chunks, status = 200) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "Content-Type": "text/event-stream" } });
}

async function collect(response) {
  const events = [];
  await streamChat({
    url: "/api/chat",
    body: { messages: [{ role: "user", content: "hi" }] },
    fetchImpl: async () => response,
    onEvent: (event, data) => events.push([event, data]),
  });
  return events;
}

describe("Ask card copy and chips", () => {
  it("uses the first four featured FAQs from the KB as chips", () => {
    const featured = kb.faqs.filter((faq) => faq.featured).map((faq) => faq.question);
    expect(featuredChips(kb)).toEqual(featured.slice(0, 4));
    expect(featuredChips(kb)).toHaveLength(4);
    expect(featuredChips({})).toEqual([]);
  });

  it("keeps all card copy free of dashes, arrows and emoji", () => {
    for (const text of [...Object.values(ASK_COPY), ...Object.values(FRIENDLY)]) {
      expect(DASH_OR_ARROW.test(text), text).toBe(false);
      expect(/\p{Extended_Pictographic}/u.test(text), text).toBe(false);
    }
    expect(ASK_COPY.title).toBe("Ask about my experience");
    expect(ASK_COPY.placeholder).toBe("Ask about a role, a project, or paste a job description");
  });

  it("maps T2 error codes to the friendly text and never shows a raw code", () => {
    expect(friendlyError("rate_limited")).toBe(FRIENDLY.rate_limited);
    expect(friendlyError("daily_cap")).toBe(FRIENDLY.daily_cap);
    expect(friendlyError("ECONNRESET")).toBe(FRIENDLY.server);
    expect(friendlyError(undefined)).toBe(FRIENDLY.server);
  });

  it("counts the job description up to 8,000 and no further", () => {
    expect(JD_MAX_CHARS).toBe(8000);
    expect(jdCounter(12)).toBe("12 of 8,000 characters");
    expect(jdCounter(9000)).toBe("8,000 of 8,000 characters");
  });
});

describe("thread and history", () => {
  const done = (n) =>
    Array.from({ length: n }, (_, i) => ({ question: `q${i}`, answer: `a${i}`, state: "done" }));

  it("hits the 12 message cap after six answered turns", () => {
    expect(MAX_THREAD_MESSAGES).toBe(12);
    expect(atMessageCap(done(5))).toBe(false);
    expect(atMessageCap(done(6))).toBe(true);
  });

  it("sends history as user and assistant pairs, newest last, starting with a user turn", () => {
    const messages = historyFor(done(6), "next");
    expect(messages.length).toBeLessThanOrEqual(12);
    expect(messages[0].role).toBe("user");
    expect(messages.at(-1)).toEqual({ role: "user", content: "next" });
    expect(messages.every((m) => m.role === "user" || m.role === "assistant")).toBe(true);
  });
});

describe("citations and sources", () => {
  const sources = [
    { id: "bullet-captech-consultant-4", label: "Resume · CapTech Consulting · bullet 4", href: "#role-captech-consultant" },
    { id: "doc-cleat-arch", label: "Cleat · architecture doc", url: "https://github.com/jaysinghcodes/cleat" },
  ];

  it("numbers record id markers by first use and lists them as Sources", () => {
    const text = "Cut cost 75% [bullet-captech-consultant-4]. Built Cleat [doc-cleat-arch]. Again [bullet-captech-consultant-4].";
    const layout = layoutAnswer(text, normalizeSources(sources));
    const cites = loose(layout.blocks[0]).inline.filter((part) => part.type === "cite").map((part) => part.n);
    expect(cites).toEqual([1, 2, 1]);
    expect(layout.sources.map((s) => [s.n, s.href])).toEqual([
      [1, "#role-captech-consultant"],
      [2, "https://github.com/jaysinghcodes/cleat"],
    ]);
  });

  it("drops a marker with no matching source once sources arrive", () => {
    const layout = layoutAnswer("Claim [made-up-id].", normalizeSources(sources.slice(0, 1)));
    expect(loose(layout.blocks[0]).inline.some((part) => part.type === "cite")).toBe(false);
    expect(loose(layout.blocks[0]).inline.map((p) => p.text).join("")).toBe("Claim.");
  });

  it("hides a half received marker while streaming", () => {
    const layout = layoutAnswer("Jay built it [bullet-capt", null, { streaming: true });
    expect(loose(layout.blocks[0]).inline.map((p) => p.text).join("")).toBe("Jay built it");
  });

  it("lays out the three JD fit parts as headings, with Closest experience and no Gaps", () => {
    const text = "Strong matches\n- AWS [1]\n\nPartial matches\n- Go [1]\n\nClosest experience\n- Kubernetes: container orchestration with AWS ECS [1]";
    const layout = layoutAnswer(text, normalizeSources(sources), { jdFit: true });
    const headings = layout.blocks.filter((b) => b.type === "heading").map((b) => loose(b).inline[0].text);
    expect(headings).toEqual(["Strong matches", "Partial matches", "Closest experience"]);
    expect(JD_FIT_SECTIONS).toEqual(headings);
    const closest = loose(layout.blocks.at(-1)).items[0];
    expect(closest.map((p) => p.text ?? `^${p.n}`).join("")).toBe("Kubernetes: container orchestration with AWS ECS^1");
  });

  it("never shows a Gaps section or missing wording in a JD fit answer", () => {
    const text = [
      "Strong matches",
      "- AWS Lambda services [1]",
      "- Kotlin is missing from his resume [1]",
      "",
      "Closest experience",
      "- Kubernetes: container orchestration with AWS ECS [1]",
      "- Kafka: event streaming",
      "",
      "Gaps",
      "- Kotlin",
      "- Rust",
      "",
      "Missing skills",
      "- Scala",
      "",
      "He has no experience with Elixir.",
    ].join("\n");
    const layout = layoutAnswer(text, normalizeSources(sources), { jdFit: true });
    const flat = JSON.stringify(layout.blocks);
    for (const word of ["Gaps", "Missing", "missing", "Kotlin", "Rust", "Scala", "Kafka", "Elixir", "no experience"]) {
      expect(flat, word).not.toContain(word);
    }
    expect(layout.blocks.filter((b) => b.type === "heading").map((b) => loose(b).inline[0].text)).toEqual([
      "Strong matches",
      "Closest experience",
    ]);
    const html = render(createElement(AskAnswer, { turnId: "t9", text, sources: normalizeSources(sources), streaming: false, jdFit: true }));
    expect(html).not.toMatch(/gaps|missing|kotlin|kafka/i);
    expect(html).toContain("Closest experience");
  });

  it("drops a heading left empty after the JD fit rules", () => {
    const blocks = jdFitBlocks(layoutAnswer("Closest experience\n- Kafka: event streaming\n\nStrong matches\n- AWS [1]", normalizeSources(sources)).blocks);
    expect(blocks.map((b) => b.type)).toEqual(["heading", "ul"]);
    expect(loose(blocks[0]).inline[0].text).toBe("Strong matches");
  });

  it("leaves normal answers alone", () => {
    const layout = layoutAnswer("Gaps\n- none [1]", normalizeSources(sources));
    expect(layout.blocks.map((b) => b.type)).toEqual(["heading", "ul"]);
  });

  it("lists only cited sources, numbered by first citation", () => {
    const three = normalizeSources([
      ...sources,
      { id: "bullet-captech-consultant-1", label: "Resume · CapTech Consulting · bullet 1", href: "#role-captech-consultant" },
    ]);
    const layout = layoutAnswer("Built Cleat [doc-cleat-arch]. Cut cost 75% [bullet-captech-consultant-4].", three);
    expect(layout.sources.map((s) => [s.n, s.label])).toEqual([
      [1, "Cleat · architecture doc"],
      [2, "Resume · CapTech Consulting · bullet 4"],
    ]);
    const numeric = layoutAnswer("Migrated to AWS [3]. Cut cost 75% [1]. Again [3].", three);
    expect(numeric.sources.map((s) => s.label)).toEqual(["Resume · CapTech Consulting · bullet 1", "Resume · CapTech Consulting · bullet 4"]);
    const cites = loose(numeric.blocks[0]).inline.filter((p) => p.type === "cite").map((p) => p.n);
    expect(cites).toEqual([1, 2, 1]);
    expect(layoutAnswer("No citations here.", three).sources).toEqual([]);
  });

  it("attaches the superscript to the word or punctuation before it with no space", () => {
    /** @param {string} text */
    const flat = (text) =>
      loose(layoutAnswer(text, normalizeSources(sources)).blocks[0])
        .inline.map((p) => (p.type === "cite" ? `^${p.n}` : p.text))
        .join("");
    expect(flat("Cut cost 75% [bullet-captech-consultant-4].")).toBe("Cut cost 75%.^1");
    expect(flat("Cut cost 75%.[bullet-captech-consultant-4]")).toBe("Cut cost 75%.^1");
    expect(flat("Cut cost 75%[bullet-captech-consultant-4], then more.")).toBe("Cut cost 75%,^1 then more.");
    expect(flat("Two sources [bullet-captech-consultant-4] [doc-cleat-arch].")).toBe("Two sources.^1^2");
    expect(flat("Ends here [doc-cleat-arch]")).toBe("Ends here^1");
    const html = render(createElement(AskAnswer, { turnId: "t2", text: "Cut cost 75% [bullet-captech-consultant-4].", sources: normalizeSources(sources), streaming: false }));
    expect(html).toContain('<span>Cut cost 75%.</span><sup class="cite">');
    const css = read("frontend/src/styles/ask.css");
    expect(css).toMatch(/\.turn-a sup \{[^}]*margin-left: 0;/);
    expect(css).toMatch(/\.turn-a sup a \{[^}]*padding: 0 1px 0 0;/);
  });

  it("keeps only page anchors and https links", () => {
    expect(safeHref("#project-cleat")).toBe("#project-cleat");
    expect(safeHref("https://github.com/x")).toBe("https://github.com/x");
    expect(safeHref("javascript:alert(1)")).toBe("");
    expect(safeHref("http://example.com")).toBe("");
  });

  it("renders clay superscripts that link to their Sources entry, and Sources that link out", () => {
    const html = render(
      createElement(AskAnswer, {
        turnId: "t1",
        text: "Cut cost 75% [bullet-captech-consultant-4]. Built Cleat [doc-cleat-arch].",
        sources: normalizeSources(sources),
        streaming: false,
      }),
    );
    expect(html).toContain('<sup class="cite"><a href="#t1-src-1" aria-label="Source 1">1</a></sup>');
    expect(html).toContain('id="t1-src-1"');
    expect(html).toContain('href="/#role-captech-consultant"');
    expect(html).toContain('href="https://github.com/jaysinghcodes/cleat"');
  });
});

describe("SSE client", () => {
  it("parses events split across chunks", () => {
    const events = [];
    let rest = consumeSse('event: status\ndata: {"text":"Searching project docs"}\n\nevent: del', (e, d) => events.push([e, d]));
    rest = consumeSse(`${rest}ta\ndata: {"text":"Hi"}\n\n`, (e, d) => events.push([e, d]));
    expect(rest).toBe("");
    expect(events).toEqual([
      ["status", { text: "Searching project docs" }],
      ["delta", { text: "Hi" }],
    ]);
    expect(parseSseBlock(": keep alive")).toBeNull();
  });

  it("handles every T2 event from a streamed response", async () => {
    const events = await collect(
      sseResponse([
        'event: status\ndata: {"text":"Searching project docs"}\n\n',
        'event: delta\ndata: {"text":"Jay "}\n\nevent: delta\ndata: {"text":"built it."}\n\n',
        'event: sources\ndata: {"sources":[]}\n\nevent: done\ndata: {}\n\n',
      ]),
    );
    expect(events.map(([e]) => e)).toEqual(["status", "delta", "delta", "sources", "done"]);
  });

  it("passes a T2 error event through with its code", async () => {
    const events = await collect(
      sseResponse(['event: error\ndata: {"code":"rate_limited","text":"x"}\n\n'], 429),
    );
    expect(events).toEqual([["error", { code: "rate_limited", text: "x" }]]);
  });

  it("turns the T1 JSON reply into the same events", async () => {
    const events = await collect(Response.json({ response: "Answer [1]" }));
    expect(events.map(([e]) => e)).toEqual(["delta", "sources", "done"]);
    const failed = await collect(Response.json({ error: "boom" }, { status: 500 }));
    expect(failed).toEqual([["error", { code: "server" }]]);
  });

  it("ends in an error when the stream closes without done", async () => {
    const events = await collect(sseResponse(['event: delta\ndata: {"text":"half"}\n\n']));
    expect(events.at(-1)).toEqual(["error", { code: "server" }]);
  });

  it("reports a network failure as the friendly server error", async () => {
    const events = [];
    await streamChat({
      url: "/api/chat",
      body: { messages: [] },
      fetchImpl: async () => {
        throw new Error("offline");
      },
      onEvent: (event, data) => events.push([event, data]),
    });
    expect(events).toEqual([["error", { code: "server" }]]);
  });
});

describe("askAbout deep links", () => {
  it("builds the role and project questions with their scope", () => {
    expect(askTarget({ type: "role", id: "role-captech-consultant", label: "x" }, kb)).toEqual({
      question: "Tell me about his time at CapTech Consulting as Software Engineer Consultant",
      scope: { type: "role", id: "role-captech-consultant" },
    });
    expect(askTarget("project-cleat", kb)).toEqual({
      question: "Tell me about his work on Cleat",
      scope: { type: "project", id: "project-cleat" },
    });
  });

  it("sends through the mounted card with the scope", () => {
    const calls = [];
    const unregister = registerAskHandler((request) => calls.push(request));
    const doc = { getElementById: () => ({ scrollIntoView() {} }) };
    askAbout({ type: "project", id: "project-mission-control" }, doc);
    unregister();
    expect(calls).toEqual([
      { question: "Tell me about his work on Mission Control", scope: { type: "project", id: "project-mission-control" } },
    ]);
  });
});

describe("hash focus", () => {
  function node(attrs = {}, children = {}) {
    return {
      focused: false,
      attrs,
      getAttribute(name) {
        return name in this.attrs ? this.attrs[name] : null;
      },
      querySelector(selector) {
        return children[selector] ?? null;
      },
      focus(options) {
        this.focused = true;
        this.options = options;
      },
      scrollIntoView() {
        this.scrolled = true;
      },
    };
  }

  it("focuses a role article with only an h3 on a cold load of /#role-osu-wexner", () => {
    const article = node({ tabindex: "-1" });
    const doc = {
      getElementById: (id) => (id === "role-osu-wexner" ? article : null),
      defaultView: { matchMedia: () => ({ matches: false }) },
    };
    scrollToId("role-osu-wexner", "", loose(doc));
    expect(article.scrolled).toBe(true);
    expect(article.focused).toBe(true);
    expect(article.options).toEqual({ preventScroll: true });
  });

  it("still prefers the preferred node, then an h1 or h2", () => {
    const heading = node();
    const preferred = node();
    expect(focusTargetFor(loose(node({ tabindex: "-1" }, { "h1, h2": heading })), null)).toBe(heading);
    expect(focusTargetFor(loose(node({}, { "h1, h2": heading })), loose(preferred))).toBe(preferred);
    expect(focusTargetFor(loose(node()), null)).toBeNull();
  });

  it("moves focus off the chat input to the hero heading when Back returns to the top", () => {
    const input = node();
    const h1 = node({ tabindex: "-1" });
    const main = { querySelector: (s) => (s === "h1" ? h1 : null), contains: (n) => n === input };
    resetFocusToTop(loose({ activeElement: input, querySelector: () => main }));
    expect(h1.focused).toBe(true);
  });
});

describe("Ask section markup", () => {
  it("renders the restyled card with labels and a live answer region", () => {
    const html = render(createElement(ChatPage, { id: "ask" }));
    expect(html).toContain('id="ask"');
    expect(html).toContain("<h2");
    expect(html).toContain('id="ask-input"');
    expect(html).toContain('aria-label="Ask about a role, a project, or paste a job description"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="Suggested questions"');
    expect(html).toContain("Check fit against a job description");
    for (const chip of featuredChips(kb)) {
      expect(html).toContain(chip.replace("$", "$"));
    }
    expect(html).not.toContain("Sample answer");
    expect(html).not.toContain("\u26a1");
    expect(/\p{Extended_Pictographic}/u.test(html)).toBe(false);
  });

  it("removes the old chat pieces and the hardcoded chips", () => {
    for (const file of ["MessageAvatar.jsx", "TypingIndicator.jsx", "ChatHeader.jsx", "Message.jsx", "ChatInput.jsx", "MessagesList.jsx", "EmptyState.jsx"]) {
      expect(fs.existsSync(path.join(root, "frontend/src/components", file)), file).toBe(false);
    }
    expect(read("frontend/src/config/constants.js")).not.toContain("SUGGESTED_QUESTIONS");
    const css = read("frontend/src/styles/ask.css");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("animation: none");
  });
});

describe("request bodies (T7 request contract)", () => {
  /** @type {{ role: "user" | "assistant", content: string }[]} */
  const q = [{ role: "user", content: "Tell me about his AWS work" }];

  async function sent(body) {
    let init;
    await streamChat({
      url: "/api/chat",
      body,
      fetchImpl: async (_url, options) => {
        init = options;
        return Response.json({ response: "ok" });
      },
      onEvent: () => {},
    });
    return JSON.parse(loose(init).body);
  }

  it("sends only messages for a plain question or chip", async () => {
    expect(await sent(buildChatBody({ messages: q }, kb))).toEqual({ messages: q });
    expect(Object.keys(await sent(buildChatBody({ messages: q }, kb)))).toEqual(["messages"]);
  });

  it("sends messages and an exact role or project scope", async () => {
    expect(await sent(buildChatBody({ messages: q, scope: { type: "role", id: "role-osu-wexner", label: "x" } }, kb))).toEqual({
      messages: q,
      scope: { type: "role", id: "role-osu-wexner" },
    });
    expect(await sent(buildChatBody({ messages: q, scope: { type: "project", id: "project-cleat" } }, kb))).toEqual({
      messages: q,
      scope: { type: "project", id: "project-cleat" },
    });
  });

  it("drops a scope with an unknown id or a type that does not match", () => {
    expect(buildChatBody({ messages: q, scope: { type: "role", id: "project-cleat" } }, kb)).toEqual({ messages: q });
    expect(buildChatBody({ messages: q, scope: { type: "project", id: "project-nope" } }, kb)).toEqual({ messages: q });
    expect(buildChatBody({ messages: q, scope: { type: "skill", id: "skill-aws" } }, kb)).toEqual({ messages: q });
  });

  it("sends jd_fit with the description capped at 8,000 and never with a scope", async () => {
    /** @type {{ role: "user" | "assistant", content: string }[]} */
    const jd = [{ role: "user", content: "x".repeat(9000) }];
    const body = await sent(
      buildChatBody({ messages: jd, mode: "jd_fit", scope: { type: "role", id: "role-osu-wexner" } }, kb),
    );
    expect(Object.keys(body).sort()).toEqual(["messages", "mode"]);
    expect(body.mode).toBe("jd_fit");
    expect(body.messages[0].content).toHaveLength(8000);
  });

  it("ignores any other mode value", () => {
    expect(buildChatBody({ messages: q, mode: "summary" }, kb)).toEqual({ messages: q });
  });

  it("builds deep link bodies from askAbout targets", () => {
    const role = askTarget({ type: "role", id: "role-captech-consultant", label: "CapTech" }, kb);
    expect(buildChatBody({ messages: [{ role: "user", content: role.question }], scope: role.scope }, loose(kb))).toEqual({
      messages: [{ role: "user", content: "Tell me about his time at CapTech Consulting as Software Engineer Consultant" }],
      scope: { type: "role", id: "role-captech-consultant" },
    });
  });

  it("routes every card request through buildChatBody", () => {
    const page = read("frontend/src/pages/ChatPage.jsx");
    expect(page).toContain("buildChatBody(");
    expect(page).not.toMatch(/body\.(scope|mode)\s*=/);
  });
});
