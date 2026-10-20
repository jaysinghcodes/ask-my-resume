import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

const LINKS = [
  { to: "/#experience", label: "Experience" },
  { to: "/#projects", label: "Projects" },
  { to: "/", label: "Ask Jay", match: "/" },
  { to: "/contact", label: "Contact", match: "/contact" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

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
          type="button"
          className="menu-button"
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen(true)}
        >
          Menu
        </button>
      </div>
      <div
        className="sheet"
        id="site-menu"
        hidden={!open}
        onClick={() => setOpen(false)}
      >
        <div
          className="sheet-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" className="sheet-close" onClick={() => setOpen(false)}>
            Close
          </button>
          {LINKS.map((item) => (
            <Link key={item.label} to={item.to}>
              {item.label}
            </Link>
          ))}
          <span className="nav-resume">Resume</span>
        </div>
      </div>
    </header>
  );
}
