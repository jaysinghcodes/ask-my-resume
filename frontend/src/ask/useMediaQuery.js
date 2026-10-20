import { useCallback, useSyncExternalStore } from "react";

/**
 * True while the media query matches. Server render and hydration read false,
 * then the client switches to the live value, so prerendered markup still matches.
 * @param {string} query
 * @returns {boolean}
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (/** @type {() => void} */ onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}
