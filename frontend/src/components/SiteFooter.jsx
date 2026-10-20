import { builtAt } from "virtual:kb";
import { formatBuiltAt } from "../format-built-at";

export function SiteFooter() {
  const updated = formatBuiltAt(builtAt);

  return (
    <footer className="site-footer">
      <div className="wide">
        <span>© 2026 Jagteshwar (Jay) Singh</span>
        {updated ? <span>Knowledge base updated {updated}</span> : null}
      </div>
    </footer>
  );
}
