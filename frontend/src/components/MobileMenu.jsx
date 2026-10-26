import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

/**
 * @param {ParentNode} root
 * @returns {HTMLElement[]}
 */
function focusable(root) {
  return /** @type {HTMLElement[]} */ ([
    ...root.querySelectorAll("a[href], button:not([disabled])"),
  ]);
}

/**
 * @param {{
 *   open: boolean,
 *   currentId: string | null,
 *   onClose: (restoreFocus: boolean) => void,
 *   onLinkClick: (
 *     event: import("react").MouseEvent<HTMLAnchorElement>,
 *     item: { id: string, to: string },
 *   ) => void,
 *   links: { id: string, to: string, label: string }[],
 *   resumeHref: string,
 *   inline?: boolean,
 * }} props `inline` renders in place instead of a portal (the build's copy snapshot).
 */
export function MobileMenu({ open, currentId, onClose, onLinkClick, links, resumeHref, inline = false }) {
  const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    if (!open) return undefined;

    const panel = panelRef.current;
    const first = panel ? focusable(panel)[0] : null;
    (first ?? panel)?.focus();

    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose(true);
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
  }, [open, onClose]);

  if (!open) return null;

  const sheet = (
    <div className="sheet" onClick={() => onClose(true)}>
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
        <button type="button" className="sheet-close" onClick={() => onClose(true)}>
          Close
        </button>
        {links.map((item) => (
          <Link
            key={item.id}
            to={item.to}
            aria-current={
              item.id === currentId ? (item.to.startsWith("/#") ? "location" : "page") : undefined
            }
            onClick={(event) => onLinkClick(event, item)}
          >
            {item.label}
          </Link>
        ))}
        <a
          className="nav-resume"
          href={resumeHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onClose(false)}
        >
          Resume
        </a>
      </div>
    </div>
  );
  return inline ? sheet : createPortal(sheet, document.body);
}
