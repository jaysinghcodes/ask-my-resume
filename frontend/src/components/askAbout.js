import { knowledgeBase } from "../data/knowledgeBase";
import { askTarget } from "../ask/askModel.js";

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
 * @typedef {{ question: string, scope?: { type: "role" | "project", id: string } }} AskRequest
 * @typedef {(request: AskRequest) => void} AskHandler
 */

/** @type {AskHandler | null} */
let handler = null;

/**
 * The Ask card registers here while it is mounted, so deep links can send through it.
 * @param {AskHandler | null} next
 * @returns {() => void} Unregister.
 */
export function registerAskHandler(next) {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

/**
 * Scroll to the Ask card, prefill the question and send it with its scope.
 * Role and project buttons call this with a KB id or `{ type, id, label }`.
 * Without a mounted card it only prefills the input.
 * @param {string | import("../ask/askModel.js").AskTarget} target
 * @param {AskDocument | Document | undefined} [doc]
 * @returns {string} The question.
 */
export function askAbout(target, doc = /** @type {AskDocument | undefined} */ (globalThis.document)) {
  const request = askTarget(target, knowledgeBase);
  const { question } = request;
  if (!question || !doc) return question;

  const ask = doc.getElementById?.("ask") || null;
  const behavior = prefersReducedMotion(doc) ? "auto" : "smooth";
  if (ask?.scrollIntoView) ask.scrollIntoView({ behavior, block: "start" });
  rememberAskHash();

  if (handler) {
    handler(request);
    return question;
  }

  const input =
    ask?.querySelector?.("textarea") ||
    doc.querySelector?.("#ask textarea, .ask-section textarea") ||
    null;
  if (input) fillAskInput(/** @type {AskNode} */ (input), question);
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
  historyRef.replaceState(historyRef.state, "", `${locationRef.pathname}${locationRef.search}#ask`);
}
