/**
 * Pure helpers for the Ask Jay card: copy, chips, history, citations and answer layout.
 * Nothing here touches the DOM, so the tests can cover it directly.
 */

import { JD_FIT_SECTIONS, renderJdFit } from "../../../lib/jd-fit-rules.js";

export { JD_FIT_SECTIONS };

/** Messages on screen before the input is replaced by "Start a new conversation". */
export const MAX_THREAD_MESSAGES = 12;

/** The T2 cap on one message. The job description counter stops here. */
export const JD_MAX_CHARS = 8000;

export const ASK_COPY = {
  kicker: "Ask Jay",
  title: "Ask about my experience",
  sub: "An assistant that answers from my resume, project docs and repos, and cites where each answer came from.",
  placeholder: "Ask about a role, a project, or paste a job description",
  placeholderShort: "Ask about a role or a project",
  ask: "Ask",
  waiting: "Looking that up",
  sources: "Sources",
  retry: "Try again",
  dismiss: "Dismiss",
  restart: "Start a new conversation",
  capNote: "This conversation has reached its limit.",
  jdLink: "Check fit against a job description",
  jdLabel: "Paste a job description",
  jdSubmit: "Check fit",
  jdCancel: "Cancel",
  jdQuestion: "Check fit against this job description",
  jdShow: "Show the job description",
  chipsLabel: "Suggested questions",
};

/** Below 360px the full placeholder wraps to three lines and clips, so the input shows the short one (#22). */
export const NARROW_INPUT_QUERY = "(max-width: 359px)";

/**
 * @param {boolean} narrow true when NARROW_INPUT_QUERY matches
 * @returns {string}
 */
export function askPlaceholder(narrow) {
  return narrow ? ASK_COPY.placeholderShort : ASK_COPY.placeholder;
}

/** Friendly error text from T2, keyed by error code. Nothing technical reaches the page. */
export const FRIENDLY = {
  rate_limited:
    "You've asked a lot of questions in a short time. Try again in a few minutes, or email jaggys44@gmail.com.",
  daily_cap:
    "Ask Jay has reached its limit for today. Email jaggys44@gmail.com and Jay will get back to you.",
  too_long: "That's longer than Ask Jay can read. Trim it to about 8,000 characters and try again.",
  server: "Something went wrong getting that answer. Try again.",
  invalid: "Ask Jay could not read that message. Try again.",
};

/**
 * @param {unknown} code
 * @returns {string}
 */
export function friendlyError(code) {
  const key = typeof code === "string" && code in FRIENDLY ? code : "server";
  return FRIENDLY[/** @type {keyof typeof FRIENDLY} */ (key)];
}

/**
 * The first four featured FAQs, in KB order.
 * @param {{ faqs?: unknown }} kb
 * @returns {string[]}
 */
export function featuredChips(kb) {
  const faqs = /** @type {{ question?: string, featured?: boolean }[]} */ (
    Array.isArray(kb.faqs) ? kb.faqs : []
  );
  return faqs
    .filter((faq) => faq.featured && typeof faq.question === "string" && faq.question.trim())
    .slice(0, 4)
    .map((faq) => /** @type {string} */ (faq.question));
}

/**
 * @param {number} count
 * @returns {string}
 */
export function jdCounter(count) {
  const n = Math.min(Math.max(0, count), JD_MAX_CHARS);
  return `${n.toLocaleString("en-US")} of ${JD_MAX_CHARS.toLocaleString("en-US")} characters`;
}

/**
 * @typedef {{ question: string, answer: string, state: string }} TurnLike
 */

/**
 * Messages on screen: each finished turn is a question and an answer.
 * @param {TurnLike[]} turns
 * @returns {number}
 */
export function threadMessageCount(turns) {
  return turns.filter((turn) => turn.state === "done").length * 2;
}

/**
 * @param {TurnLike[]} turns
 * @returns {boolean}
 */
export function atMessageCap(turns) {
  return threadMessageCount(turns) >= MAX_THREAD_MESSAGES;
}

/**
 * Build the API history: finished turns, then the new question, capped at the T2 window
 * and starting with a user message.
 * @param {TurnLike[]} done
 * @param {string} question
 * @returns {{ role: "user" | "assistant", content: string }[]}
 */
export function historyFor(done, question) {
  /** @type {{ role: "user" | "assistant", content: string }[]} */
  const messages = [];
  for (const turn of done) {
    if (turn.state !== "done" || !turn.answer.trim()) continue;
    messages.push({ role: "user", content: turn.question });
    messages.push({ role: "assistant", content: turn.answer });
  }
  messages.push({ role: "user", content: question });
  const recent = messages.slice(-MAX_THREAD_MESSAGES);
  while (recent.length > 0 && recent[0]?.role !== "user") recent.shift();
  return recent;
}

/**
 * @typedef {{ id?: string, label: string, href?: string }} Source
 */

/**
 * Keep sources with a label. Links are kept only for page anchors and https URLs.
 * @param {unknown} raw
 * @returns {Source[]}
 */
export function normalizeSources(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {Source[]} */
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = /** @type {Record<string, unknown>} */ (item);
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!label) continue;
    const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : undefined;
    const rawHref =
      typeof record.href === "string" ? record.href : typeof record.url === "string" ? record.url : "";
    const href = safeHref(rawHref.trim());
    out.push({ id, label, href: href || undefined });
  }
  return out;
}

/**
 * @param {string} href
 * @returns {string}
 */
export function safeHref(href) {
  if (/^#[A-Za-z][\w-]*$/.test(href)) return href;
  if (/^https:\/\/[^\s"'<>]+$/.test(href)) return href;
  return "";
}

/** `[bullet-captech-consultant-4]` or `[project-cleat]`, not a markdown link. A bare `[1]` is matched only to drop it. */
const MARKER = /\[([A-Za-z0-9][\w.:-]{0,79})\](?!\()/g;
const PARTIAL_MARKER = /\[[A-Za-z0-9][\w.:-]{0,79}$/;
const CITE = "\u0000";

/**
 * @typedef {{ type: "text", text: string } | { type: "strong", text: string } | { type: "cite", n: number }} Inline
 * @typedef {{ type: "heading" | "p", inline: Inline[] } | { type: "ul" | "ol", items: Inline[][] }} Block
 * @typedef {{ n: number, label: string, href?: string }} NumberedSource
 */

/**
 * Number the citations in an answer and lay it out in blocks.
 * Markers are numbered in the order they first appear. Only a KB source id is a cite: a
 * bare number like [1] is dropped and never linked (Atlas ruling, PR #30 r3). Once sources have arrived, a marker that matches no source
 * is dropped, and a source that is never cited is left out of the list.
 * A superscript attaches to the word or punctuation before it with no space, and moves
 * after punctuation that directly follows it: "75% [id]." reads "75%.¹".
 * While streaming, a half received marker at the end is hidden.
 * @param {string} text
 * @param {Source[] | null} sources `null` while the sources event has not arrived.
 * @param {{ streaming?: boolean, jdFit?: boolean }} [options] `jdFit` applies the JD fit rules (see jdFitText).
 * @returns {{ blocks: Block[], sources: NumberedSource[] }}
 */
export function layoutAnswer(text, sources, options = {}) {
  let body = String(text ?? "");
  if (options.streaming) body = body.replace(PARTIAL_MARKER, "");
  const known = sources ?? null;
  /** @type {Map<string, number>} */
  const numbers = new Map();
  /** @type {NumberedSource[]} */
  const list = [];

  /**
   * @param {string} key
   * @param {Source | undefined} source
   * @returns {number}
   */
  const numberFor = (key, source) => {
    const existing = numbers.get(key);
    if (existing) return existing;
    const n = numbers.size + 1;
    numbers.set(key, n);
    if (source) list.push({ n, label: source.label, href: source.href });
    return n;
  };

  const marked = body.replace(MARKER, (_match, token) => {
    /** @type {Source | undefined} */
    let source;
    let key = "";
    // Only a KB source id is a cite (Atlas ruling, PR #30 r3). A bare number is dropped.
    if (/^\d+$/.test(token)) return "";
    const index = known ? known.findIndex((item) => item.id === token) : -1;
    source = index >= 0 && known ? known[index] : undefined;
    key = source ? sourceKey(source, index) : `id:${token}`;
    if (known && !source) return "";
    return `${CITE}${numberFor(key, source)}${CITE}`;
  });

  // Only cited sources are listed, numbered by first citation so they match the superscripts.
  let attached = attachCites(tidy(marked));
  let sourcesOut = list;
  if (options.jdFit) {
    // Drop what the JD fit rules drop, then renumber what is left by first citation.
    attached = jdFitText(attached);
    /** @type {Map<number, number>} */
    const renumber = new Map();
    attached = attached.replace(CITE_ONE, (_match, n) => {
      const old = Number(n);
      if (!renumber.has(old)) renumber.set(old, renumber.size + 1);
      return `${CITE}${renumber.get(old)}${CITE}`;
    });
    sourcesOut = [];
    for (const [old, n] of renumber) {
      const source = list.find((item) => item.n === old);
      if (source) sourcesOut.push({ ...source, n });
    }
  }
  return { blocks: toBlocks(attached), sources: sourcesOut };
}

/**
 * @param {Source} source
 * @param {number} index
 */
function sourceKey(source, index) {
  return source.id ? `id:${source.id}` : `n:${index + 1}`;
}

/**
 * Remove the space a dropped marker leaves before punctuation.
 * @param {string} text
 */
function tidy(text) {
  return text.replace(/[ \t]+([.,;:!?])/g, "$1");
}

/**
 * Pull each run of superscripts onto the text before it and after any punctuation that
 * follows it, so "75% [id]." and "75%[id]." both read "75%.¹". Line breaks are kept.
 * @param {string} text
 */
function attachCites(text) {
  return text.replace(CITE_RUN, (_match, cites, punct) => `${punct}${cites.replace(/[ \t]+/g, "")}`);
}

const CITE_ONE = new RegExp(`${CITE}(\\d+)${CITE}`, "g");
const CITE_RUN = new RegExp(`[ \\t]*((?:[ \\t]*${CITE}\\d+${CITE})+)([.,;:!?]*)`, "g");

const HEADING = /^(?:#{1,4}\s+)?(?:\*\*)?([^*\n]{1,60}?)(?:\*\*)?:?$/;
const JD_HEADINGS = /^(strong matches|partial matches|closest experience)$/i;

const BULLET = /^\s*[-*\u2022]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

/**
 * @param {string} line
 * @returns {string | null}
 */
function headingText(line) {
  const trimmed = line.trim();
  if (/^#{1,4}\s+\S/.test(trimmed)) return trimmed.replace(/^#{1,4}\s+/, "").replace(/\*\*/g, "");
  const match = HEADING.exec(trimmed);
  if (match && JD_HEADINGS.test(match[1].trim())) return match[1].trim();
  return null;
}

/**
 * The JD fit rules on the page: renderJdFit from lib/jd-fit-rules.js, the one parser the
 * T7 checker uses too (Atlas ruling, PR #30 r4: fail closed). Only bullet or numbered
 * items with a cite, under an allowed heading, render; any other line closes its section.
 * @param {string} text the answer with cite markers in place
 * @returns {string}
 */
export function jdFitText(text) {
  /** @type {string[]} */
  const out = [];
  for (const section of renderJdFit(text, CITE_ONE)) {
    out.push("", section.heading, "");
    for (const item of section.items) out.push(`${item.indent}${item.numbered ? "1. " : "- "}${item.text}`);
  }
  return out.join("\n");
}

/**
 * @param {string} text
 * @returns {Block[]}
 */
function toBlocks(text) {
  /** @type {Block[]} */
  const blocks = [];
  /** @type {string[]} */
  let para = [];
  /** @type {{ type: "ul" | "ol", items: Inline[][] } | null} */
  let list = null;

  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", inline: inline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const heading = headingText(line);
    if (heading) {
      flushPara();
      flushList();
      blocks.push({ type: "heading", inline: inline(heading) });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flushPara();
      const type = bullet ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(inline(/** @type {RegExpExecArray} */ (bullet || numbered)[1]));
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}

/**
 * @param {string} text
 * @returns {Inline[]}
 */
function inline(text) {
  /** @type {Inline[]} */
  const out = [];
  const parts = text.split(CITE);
  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      out.push({ type: "cite", n: Number(part) });
      return;
    }
    const pieces = part.split(/\*\*([^*]+)\*\*/);
    pieces.forEach((piece, pieceIndex) => {
      if (!piece) return;
      out.push(pieceIndex % 2 === 1 ? { type: "strong", text: piece } : { type: "text", text: piece });
    });
  });
  return out;
}

/**
 * @typedef {{ id?: string, type?: "role" | "project", label?: string }} AskTarget
 * @typedef {{
 *   roles?: { id: string, title?: string, employer?: string }[],
 *   projects?: { id: string, name?: string }[],
 * }} AskKb
 */

/**
 * Turn a deep link target into the question to ask and the scope to send.
 * Accepts a KB id or `{ type, id, label }`. Anything else is asked as written.
 * @param {string | AskTarget} target
 * @param {AskKb} kb
 * @returns {{ question: string, scope?: { type: "role" | "project", id: string } }}
 */
export function askTarget(target, kb) {
  const given = typeof target === "string" ? { id: target } : target || {};
  const id = String(given.id ?? "").trim();
  if (!id) return { question: "" };
  const role = given.type !== "project" ? (kb.roles || []).find((item) => item.id === id) : undefined;
  if (role) {
    return {
      question: `Tell me about his time at ${role.employer} as ${role.title}`,
      scope: { type: "role", id },
    };
  }
  const project = given.type !== "role" ? (kb.projects || []).find((item) => item.id === id) : undefined;
  if (project) {
    const name = given.label?.trim() || project.name;
    return { question: `Tell me about his work on ${name}`, scope: { type: "project", id } };
  }
  if (given.type === "role" || given.type === "project") {
    const label = given.label?.trim();
    return label ? { question: `Tell me about ${label}`, scope: { type: given.type, id } } : { question: "" };
  }
  return { question: /[.?!]$/.test(id) ? id : `Tell me about ${id}.` };
}

/**
 * The /api/chat request body, per the T7 request contract.
 * `messages` is always sent. `mode` is only ever "jd_fit". `scope` is exactly
 * `{ type, id }` with a role or project id from the KB whose type matches.
 * The two are never sent together, and no other field is added.
 * @param {{
 *   messages: { role: "user" | "assistant", content: string }[],
 *   mode?: unknown,
 *   scope?: unknown,
 * }} request
 * @param {AskKb} kb
 * @returns {{ messages: { role: "user" | "assistant", content: string }[], mode?: "jd_fit", scope?: { type: "role" | "project", id: string } }}
 */
export function buildChatBody({ messages, mode, scope }, kb) {
  if (mode === "jd_fit") {
    const capped = messages.map((message, index) =>
      index === messages.length - 1 && message.role === "user"
        ? { role: message.role, content: message.content.slice(0, JD_MAX_CHARS) }
        : message,
    );
    return { messages: capped, mode: "jd_fit" };
  }
  const clean = cleanScope(scope, kb);
  return clean ? { messages, scope: clean } : { messages };
}

/**
 * @param {unknown} scope
 * @param {AskKb} kb
 * @returns {{ type: "role" | "project", id: string } | null}
 */
function cleanScope(scope, kb) {
  if (!scope || typeof scope !== "object") return null;
  const { type, id } = /** @type {{ type?: unknown, id?: unknown }} */ (scope);
  if (typeof id !== "string") return null;
  if (type === "role" && (kb.roles || []).some((item) => item.id === id)) return { type, id };
  if (type === "project" && (kb.projects || []).some((item) => item.id === id)) return { type, id };
  return null;
}
