import { Link } from "react-router-dom";
import { ASK_COPY, layoutAnswer } from "../ask/askModel.js";

/**
 * @param {string} id
 */
function focusSource(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  target.focus({ preventScroll: true });
}

/**
 * @param {{ parts: import("../ask/askModel.js").Inline[], turnId: string, linked: boolean }} props
 */
function InlineText({ parts, turnId, linked }) {
  return parts.map((part, index) => {
    if (part.type === "strong") return <strong key={index}>{part.text}</strong>;
    if (part.type === "text") return <span key={index}>{part.text}</span>;
    const target = `${turnId}-src-${part.n}`;
    return (
      <sup key={index} className="cite">
        {linked ? (
          <a
            href={`#${target}`}
            aria-label={`Source ${part.n}`}
            onClick={(event) => {
              event.preventDefault();
              focusSource(target);
            }}
          >
            {part.n}
          </a>
        ) : (
          part.n
        )}
      </sup>
    );
  });
}

/**
 * @param {{ source: import("../ask/askModel.js").NumberedSource }} props
 */
function SourceLabel({ source }) {
  const href = source.href;
  if (!href) return <span>{source.label}</span>;
  if (href.startsWith("#")) {
    return (
      <Link to={{ hash: href.slice(1) }} className="src-link">
        {source.label}
      </Link>
    );
  }
  return (
    <a className="src-link" href={href} target="_blank" rel="noopener noreferrer">
      {source.label}
    </a>
  );
}

/**
 * A streamed or finished answer with superscript citations and its Sources list.
 * @param {{
 *   turnId: string,
 *   text: string,
 *   sources: import("../ask/askModel.js").Source[] | null,
 *   streaming: boolean,
 * }} props
 */
export function AskAnswer({ turnId, text, sources, streaming }) {
  const layout = layoutAnswer(text, sources, { streaming });
  const linked = !streaming && layout.sources.length > 0;
  return (
    <div className="turn-a">
      {layout.blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h3 key={index} className="ans-h">
              <InlineText parts={block.inline} turnId={turnId} linked={linked} />
            </h3>
          );
        }
        if (block.type === "ul" || block.type === "ol") {
          const List = block.type;
          return (
            <List key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <InlineText parts={item} turnId={turnId} linked={linked} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={index}>
            <InlineText parts={"inline" in block ? block.inline : []} turnId={turnId} linked={linked} />
          </p>
        );
      })}
      {!streaming && layout.sources.length > 0 ? (
        <div className="srcs">
          <h3 className="srcs-h visually-hidden">{ASK_COPY.sources}</h3>
          <ol>
            {layout.sources.map((source) => (
              <li key={source.n} id={`${turnId}-src-${source.n}`} tabIndex={-1} className="src">
                <i aria-hidden="true">{source.n}</i>
                <SourceLabel source={source} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
