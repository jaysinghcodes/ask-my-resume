import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";

const LINKS = [
  { to: "/#experience", label: "Experience" },
  { to: "/#projects", label: "Projects" },
  { to: "/", label: "Ask Jay", match: "/" },
  { to: "/contact", label: "Contact", match: "/contact" },
];

/**
 * @param {ParentNode} root
 * @returns {HTMLElement[]}
 */
function focusable(root) {
  return /** @type {HTMLElement[]} */ ([
    ...root.querySelectorAll("a[href], button:not([disabled])"),
  ]);
}

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const menuButtonRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const wasOpen = useRef(false);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) menuButtonRef.current?.focus();
      wasOpen.current = false;
      return undefined;
    }

    wasOpen.current = true;
    const panel = panelRef.current;
    const first = panel ? focusable(panel)[0] : null;
    (first ?? panel)?.focus();

    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = focusable(panelRef.current);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      const inside = panelRef.current.contains(active);
      if (event.shiftKey && (active === firstItem || !inside)) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && (active === lastItem || !inside)) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  const sheet =
    open &&
    createPortal(
      <div className="sheet" onClick={close}>
        <div
          ref={panelRef}
          id="site-menu"
          className="sheet-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" className="sheet-close" onClick={close}>
            Close
          </button>
          {LINKS.map((item) => (
            <Link key={item.label} to={item.to} onClick={close}>
              {item.label}
            </Link>
          ))}
          <span className="nav-resume">Resume</span>
        </div>
      </div>,
      document.body,
    );

  return (
    <header className="nav">
      <div className="wide nav-inner">
        <Link className="wordmark" to="/">
          Jay Singh
        </Link>
        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              aria-current={item.match === location.pathname ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
          <span className="moon" aria-hidden="true" />
          <span className="nav-resume">Resume</span>
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
      {sheet}
    </header>
  );
}
