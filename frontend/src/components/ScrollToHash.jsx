import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * The hero button sets this so the chat input is focused after the scroll.
 * Nav links do not, so they still focus the section heading.
 * @param {unknown} state
 * @returns {string}
 */
export function focusIdFromState(state) {
  if (!state || typeof state !== "object" || !("focus" in state)) return "";
  const focus = /** @type {{ focus?: unknown }} */ (state).focus;
  return focus === "ask-input" ? "ask-input" : "";
}

/**
 * @typedef {{
 *   focus?: (options?: FocusOptions) => void,
 *   blur?: () => void,
 *   getAttribute?: (name: string) => string | null,
 *   querySelector?: (selector: string) => FocusNode | null,
 *   contains?: (node: unknown) => boolean,
 *   scrollIntoView?: (options?: ScrollIntoViewOptions) => void,
 * }} FocusNode
 */

/**
 * Pick what gets focus after a hash move: the preferred element, else an h1 or h2 inside
 * the target, else the target itself when it has tabIndex -1 (role and project blocks
 * only have an h3).
 * @param {FocusNode} target
 * @param {FocusNode | null} [preferred]
 * @returns {FocusNode | null}
 */
export function focusTargetFor(target, preferred) {
  if (preferred && typeof preferred.focus === "function") return preferred;
  const heading = target.querySelector?.("h1, h2") ?? null;
  if (heading && typeof heading.focus === "function") return heading;
  if (target.getAttribute?.("tabindex") === "-1" && typeof target.focus === "function") return target;
  return null;
}

/**
 * @param {string} id
 * @param {string} [focusId]
 * @param {Document} [doc]
 */
export function scrollToId(id, focusId, doc = document) {
  const target = /** @type {FocusNode | null} */ (doc.getElementById(id));
  if (!target) return;
  const view = doc.defaultView;
  const reduce = Boolean(view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  target.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
  const preferred = focusId ? /** @type {FocusNode | null} */ (doc.getElementById(focusId)) : null;
  const node = focusTargetFor(target, preferred);
  node?.focus?.({ preventScroll: true });
}

/**
 * Back (or any move) to the page top leaves focus inside a section further down, such as
 * the chat input. Move it to the page heading so the next Tab starts from the top.
 * @param {Document} [doc]
 */
export function resetFocusToTop(doc = document) {
  const active = /** @type {FocusNode | null} */ (doc.activeElement);
  const main = /** @type {FocusNode | null} */ (doc.querySelector("main"));
  if (!active || !main || active === main || !main.contains?.(active)) return;
  const heading = main.querySelector?.("h1") ?? null;
  if (heading && heading !== active && heading.getAttribute?.("tabindex") === "-1") {
    heading.focus?.({ preventScroll: true });
    return;
  }
  active.blur?.();
}

function scrollToTop() {
  const root = document.scrollingElement || document.documentElement;
  if (root) root.scrollTop = 0;
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

export function ScrollToHash() {
  const { hash, pathname, state } = useLocation();
  const previousHash = useRef(hash);

  useLayoutEffect(() => {
    const hadHash = previousHash.current !== "";
    previousHash.current = hash;
    if (!hash) {
      if (hadHash) resetFocusToTop();
      scrollToTop();
      const frame = requestAnimationFrame(scrollToTop);
      const soon = window.setTimeout(scrollToTop, 0);
      const later = window.setTimeout(scrollToTop, 80);
      return () => {
        cancelAnimationFrame(frame);
        window.clearTimeout(soon);
        window.clearTimeout(later);
      };
    }
    const id = decodeURIComponent(hash.slice(1));
    scrollToId(id, id === "ask" ? focusIdFromState(state) : "");
    return undefined;
  }, [hash, pathname, state]);

  return null;
}
