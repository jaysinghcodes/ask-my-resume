import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * @param {string} id
 */
export function scrollToId(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  const heading = target.querySelector("h1, h2");
  if (heading instanceof HTMLElement) heading.focus({ preventScroll: true });
}

export function ScrollToHash() {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0 });
      return;
    }
    scrollToId(decodeURIComponent(hash.slice(1)));
  }, [hash, pathname]);

  return null;
}
