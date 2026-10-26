import { useEffect, useRef, useState } from "react";
import { ASK_COPY, JD_MAX_CHARS, jdCounter } from "../ask/askModel.js";

/**
 * The larger text area for a pasted job description. The counter stops at 8,000.
 * @param {{ busy: boolean, onSubmit: (text: string) => void, onCancel: () => void }} props
 */
export function JdFitForm({ busy, onSubmit, onCancel }) {
  const [text, setText] = useState("");
  const areaRef = useRef(/** @type {HTMLTextAreaElement | null} */ (null));

  useEffect(() => {
    areaRef.current?.focus({ preventScroll: true });
  }, []);

  const ready = text.trim() !== "" && !busy;

  return (
    <form
      className="ask-form ask-jd"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSubmit(text.trim());
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <label className="jd-label" htmlFor="ask-jd-input">
        {ASK_COPY.jdLabel}
      </label>
      <textarea
        id="ask-jd-input"
        ref={areaRef}
        rows={8}
        maxLength={JD_MAX_CHARS}
        value={text}
        aria-describedby="ask-jd-count"
        onChange={(event) => setText(event.target.value.slice(0, JD_MAX_CHARS))}
      />
      <div className="jd-row">
        <span id="ask-jd-count" className="jd-count">
          {jdCounter(text.length)}
        </span>
        <button type="button" className="ask-ghost" onClick={onCancel}>
          {ASK_COPY.jdCancel}
        </button>
        <button className="ask-go" type="submit" disabled={!ready}>
          {ASK_COPY.jdSubmit}
        </button>
      </div>
    </form>
  );
}
