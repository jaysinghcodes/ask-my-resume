/**
 * Shared section shell for the homepage anchors.
 * T10 and T12 fill `children` without changing the column, id, or heading.
 * @param {{
 *   id: string,
 *   width?: "reading" | "wide",
 *   kicker?: string,
 *   title: string,
 *   lede?: string,
 *   className?: string,
 *   children?: import("react").ReactNode,
 * }} props
 */
export function Section({
  id,
  width = "reading",
  kicker,
  title,
  lede,
  className = "",
  children,
}) {
  const column = width === "wide" ? "wide" : "reading";
  const sectionClass = className ? `section ${className}` : "section";

  return (
    <section id={id} className={sectionClass}>
      <div className={column}>
        {kicker ? <p className="kicker">{kicker}</p> : null}
        <h2 tabIndex={-1}>{title}</h2>
        {lede ? <p className="sub">{lede}</p> : null}
        {children}
      </div>
    </section>
  );
}
