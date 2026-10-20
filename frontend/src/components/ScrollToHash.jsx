import { useLayoutEffect } from "react";
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
 * @param {string} id
 * @param {string} [focusId]
 */
export function scrollToId(id, focusId) {
  const target = document.getElementById(id);
  if (!target) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  const preferred = focusId ? document.getElementById(focusId) : null;
  const node = preferred instanceof HTMLElement ? preferred : target.querySelector("h1, h2");
  if (node instanceof HTMLElement) node.focus({ preventScroll: true });
}

function scrollToTop() {
  const root = document.scrollingElement || document.documentElement;
  if (root) root.scrollTop = 0;
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

export function ScrollToHash() {
  const { hash, pathname, state } = useLocation();

  useLayoutEffect(() => {
    if (!hash) {
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
