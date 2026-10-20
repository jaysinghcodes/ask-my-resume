import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { AppRoutes } from "./App.jsx";
import { MobileMenu, PageShell } from "./components";
import { NAV_LINKS } from "./components/SiteNav";
import { RESUME_HREF } from "./config/constants";
import { ContactPage } from "./pages";

/** Render the home page to HTML for the build's prerender step. */
export function renderHome() {
  return renderToString(
    <StaticRouter location="/">
      <AppRoutes />
    </StaticRouter>,
  );
}

/** The routes the copy check renders. /about and /contact redirect on the client. */
export const COPY_ROUTES = ["/", "/about", "/contact", "/no-such-page"];

/**
 * Render every route, plus ContactPage on its own (it shows when contact is not on home)
 * and the menu sheet open (it only renders after a click), so the copy check can scan
 * the copy of each one.
 * @returns {Record<string, string>} file name to HTML
 */
export function renderCopySnapshots() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const route of COPY_ROUTES) {
    const name = route === "/" ? "home" : route === "/no-such-page" ? "not-found" : route.slice(1);
    out[`${name}.html`] = renderToString(
      <StaticRouter location={route}>
        <AppRoutes />
      </StaticRouter>,
    );
  }
  out["contact-page.html"] = renderToString(
    <StaticRouter location="/contact">
      <PageShell>
        <ContactPage />
      </PageShell>
    </StaticRouter>,
  );
  const noop = () => {};
  out["menu-open.html"] = renderToString(
    <StaticRouter location="/">
      <MobileMenu open inline currentId={null} onClose={noop} onLinkClick={noop} links={NAV_LINKS} resumeHref={RESUME_HREF} />
    </StaticRouter>,
  );
  return out;
}
