import { SiteFooter } from "./SiteFooter";
import { SiteNav } from "./SiteNav";

export function PageShell({ children }) {
  return (
    <div className="page">
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
