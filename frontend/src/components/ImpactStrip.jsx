/**
 * Four impact numbers. Values, descriptions, and tags come from bullet metrics.
 * @param {{ items: { order: number, value: string, label: string, tags: string }[] }} props
 */
export function ImpactStrip({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <ul className="impact">
      {items.map((item) => (
        <li key={item.order}>
          <b className="impact-value">{item.value}</b>
          {item.label ? <p className="impact-label">{item.label}</p> : null}
          {item.tags ? <small className="impact-tags">{item.tags}</small> : null}
        </li>
      ))}
    </ul>
  );
}
