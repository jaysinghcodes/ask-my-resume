/**
 * The build prerenders the home page into #root. Hydrate only where that markup matches:
 * the home path with no hash. Anywhere else the client clears #root and renders fresh.
 * @param {{ hasAttribute(name: string): boolean }} el
 * @param {{ pathname: string, hash: string }} location
 */
export function canHydrate(el, location) {
  return el.hasAttribute("data-prerendered") && location.pathname === "/" && location.hash === "";
}
