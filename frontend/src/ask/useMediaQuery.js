import { useCallback, useSyncExternalStore } from "react";

/**
 * True while the media query matches. Server render and hydration read true, then the
 * client switches to the live value. The Ask input's narrow query means the prerendered
 * home page ships the short placeholder, which fits at every width, so nothing is cut
 * off before the app hydrates (#22 QA); wide screens swap to the full copy after.
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
    () => true,
  );
}
