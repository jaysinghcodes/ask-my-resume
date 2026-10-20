import { knowledgeBase } from "../data/knowledgeBase";
import { questionForTopic } from "../resume/pageModel";

/**
 * @typedef {Object} AskNode
 * @property {string} [value]
 * @property {(options?: ScrollIntoViewOptions) => void} [scrollIntoView]
 * @property {(selector: string) => AskNode | null} [querySelector]
 * @property {(event: Event | { type: string, bubbles?: boolean }) => void} [dispatchEvent]
 * @property {(options?: FocusOptions) => void} [focus]
 * @property {(start: number, end: number) => void} [setSelectionRange]
 */

/**
 * @typedef {Object} AskDocument
 * @property {(id: string) => AskNode | null} [getElementById]
 * @property {(selector: string) => AskNode | null} [querySelector]
 * @property {{ matchMedia?: (query: string) => { matches?: boolean } }} [defaultView]
 */

/**
 * Scroll to the Ask card, prefill the chat input, and focus it.
 * T11 replaces this helper. Call sites pass a knowledge base id.
 * @param {string} topic
 * @param {AskDocument | Document | undefined} [doc]
 * @returns {string}
 */
export function askAbout(topic, doc = /** @type {AskDocument | undefined} */ (globalThis.document)) {
  const question = questionForTopic(topic, knowledgeBase);
  if (!question || !doc) return question;

  const ask = doc.getElementById?.("ask") || null;
  const input =
    ask?.querySelector?.("textarea") ||
    doc.querySelector?.("#ask textarea, .ask-section textarea") ||
    null;
  const behavior = prefersReducedMotion(doc) ? "auto" : "smooth";
  if (ask?.scrollIntoView) ask.scrollIntoView({ behavior, block: "start" });
  else if (input?.scrollIntoView) input.scrollIntoView({ behavior, block: "center" });

  if (input) fillAskInput(/** @type {AskNode} */ (input), question);
  rememberAskHash();
  return question;
}

/**
 * @param {AskDocument | Document} doc
 * @returns {boolean}
 */
function prefersReducedMotion(doc) {
  const view = /** @type {AskDocument} */ (doc).defaultView;
  return Boolean(view?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

/**
 * @param {AskNode} input
 * @param {string} question
 */
function fillAskInput(input, question) {
  const prototype = Object.getPrototypeOf(input);
  const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : undefined;
  if (descriptor?.set) descriptor.set.call(input, question);
  else input.value = question;

  input.dispatchEvent?.(inputEvent());
  if (typeof input.setSelectionRange === "function") {
    input.setSelectionRange(question.length, question.length);
  }
  if (typeof input.focus === "function") {
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
  }
}

/**
 * @returns {Event | { type: string, bubbles: boolean }}
 */
function inputEvent() {
  if (typeof globalThis.Event === "function") {
    return new globalThis.Event("input", { bubbles: true });
  }
  return { type: "input", bubbles: true };
}

function rememberAskHash() {
  const locationRef = globalThis.location;
  const historyRef = globalThis.history;
  if (!locationRef || typeof historyRef?.replaceState !== "function") return;
  if (locationRef.hash === "#ask") return;
  historyRef.replaceState(null, "", `${locationRef.pathname}${locationRef.search}#ask`);
}
