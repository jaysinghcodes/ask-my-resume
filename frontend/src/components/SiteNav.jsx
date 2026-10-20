import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { RESUME_HREF } from "../config/constants";
import { navItems } from "../nav-items";
import { HOME_SECTIONS } from "../sections";
import { MobileMenu } from "./MobileMenu";
import { scrollToId } from "./ScrollToHash";

const LINKS = navItems(HOME_SECTIONS);

/**
 * @param {HTMLElement} node
 */
function visibleRatio(node) {
  const rect = node.getBoundingClientRect();
  const viewTop = 72;
  const viewBottom = window.innerHeight * 0.65;
  const top = Math.max(rect.top, viewTop);
  const bottom = Math.min(rect.bottom, viewBottom);
  return Math.max(0, bottom - top);
}

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(/** @type {string | null} */ (null));
  const location = useLocation();
  const menuButtonRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const wasOpen = useRef(false);
  const restoreFocus = useRef(false);

  const currentId = location.pathname === "/contact" ? "contact" : location.pathname === "/" ? activeId : null;

  useLayoutEffect(() => {
    if (location.pathname !== "/") {
      setActiveId(null);
      return undefined;
    }

    const nodes = HOME_SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (node) => node instanceof HTMLElement,
    );
    if (nodes.length === 0) {
      setActiveId(null);
      return undefined;
    }

    const order = new Map(HOME_SECTIONS.map((section, index) => [section.id, index]));
    /** @type {Map<string, number>} */
    const ratios = new Map();

    function pick() {
      let best = /** @type {string | null} */ (null);
      let bestRatio = 0;
      for (const [id, ratio] of ratios) {
        const better =
          ratio > bestRatio ||
          (ratio === bestRatio && best !== null && (order.get(id) ?? 0) < (order.get(best) ?? 0));
        if (better) {
          best = id;
          bestRatio = ratio;
        }
      }
      setActiveId(best);
    }

    for (const node of nodes) ratios.set(node.id, visibleRatio(node));
    pick();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        pick();
      },
      {
        rootMargin: "-72px 0px -35% 0px",
        threshold: [0, 0.15, 0.4, 0.75, 1],
      },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [location.pathname, location.hash]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return undefined;
    }
    if (wasOpen.current && restoreFocus.current) {
      menuButtonRef.current?.focus();
    }
    wasOpen.current = false;
    restoreFocus.current = false;
    return undefined;
  }, [open]);

  const onClose = useCallback((restore) => {
    restoreFocus.current = restore;
    setOpen(false);
  }, []);

  function onLinkClick(event, item) {
    const hash = `#${item.id}`;
    if (item.to === `/#${item.id}` && location.pathname === "/" && location.hash === hash) {
      event.preventDefault();
      scrollToId(item.id);
    }
    onClose(false);
  }

  return (
    <header className="nav">
      <div className="wide nav-inner">
        <Link className="wordmark" to={{ pathname: "/", hash: "" }}>
          Jay Singh
        </Link>
        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((item) => (
            <Link
              key={item.id}
              to={item.to}
              aria-current={item.id === currentId ? (item.to.startsWith("/#") ? "location" : "page") : undefined}
              onClick={(event) => onLinkClick(event, item)}
            >
              {item.label}
            </Link>
          ))}
          <a className="nav-resume" href={RESUME_HREF} target="_blank" rel="noopener noreferrer">
            Resume
          </a>
        </nav>
        <button
          ref={menuButtonRef}
          type="button"
          className="menu-button"
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen(true)}
        >
          Menu
        </button>
      </div>
      <MobileMenu
        open={open}
        currentId={currentId}
        onClose={onClose}
        onLinkClick={onLinkClick}
        links={LINKS}
        resumeHref={RESUME_HREF}
      />
    </header>
  );
}
