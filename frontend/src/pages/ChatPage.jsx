import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "../config/constants";
import { knowledgeBase } from "../data/knowledgeBase";
import { streamChat } from "../ask/askClient.js";
import {
  ASK_COPY,
  atMessageCap,
  buildChatBody,
  featuredChips,
  friendlyError,
  historyFor,
  normalizeSources,
} from "../ask/askModel.js";
import { AskAnswer } from "../components/AskAnswer";
import { JdFitForm } from "../components/JdFitForm";
import { ReadingColumn } from "../components/ReadingColumn";
import { registerAskHandler } from "../components/askAbout";

/**
 * @typedef {{
 *   id: string,
 *   question: string,
 *   mode?: "jd_fit",
 *   scope?: { type: "role" | "project", id: string },
 *   answer: string,
 *   sources: import("../ask/askModel.js").Source[] | null,
 *   status: string,
 *   state: "waiting" | "streaming" | "done" | "error",
 *   error: string,
 * }} Turn
 */

const CHIPS = featuredChips(/** @type {{ faqs?: unknown }} */ (/** @type {unknown} */ (knowledgeBase)));
let turnSeq = 0;

/**
 * The Ask Jay section: one soft card with the input, recruiter chips and the thread.
 * @param {{ id?: string }} props
 */
export function ChatPage({ id = "ask" }) {
  const [turns, setTurns] = useState(/** @type {Turn[]} */ ([]));
  const [input, setInput] = useState("");
  const [jdOpen, setJdOpen] = useState(false);
  const turnsRef = useRef(turns);
  const abortRef = useRef(/** @type {AbortController | null} */ (null));
  const inputRef = useRef(/** @type {HTMLTextAreaElement | null} */ (null));
  const jdLinkRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const restartRef = useRef(/** @type {HTMLButtonElement | null} */ (null));

  const busy = turns.some((turn) => turn.state === "waiting" || turn.state === "streaming");
  const capped = atMessageCap(turns);

  /** @param {(current: Turn[]) => Turn[]} update */
  const updateTurns = useCallback((update) => {
    setTurns((current) => {
      const next = update(current);
      turnsRef.current = next;
      return next;
    });
  }, []);

  /**
   * @param {string} turnId
   * @param {(turn: Turn) => Turn} change
   */
  const patchTurn = useCallback(
    (turnId, change) => {
      updateTurns((current) => current.map((turn) => (turn.id === turnId ? change(turn) : turn)));
    },
    [updateTurns],
  );

  /** @param {Turn} turn */
  const run = useCallback(
    (turn) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const earlier = turnsRef.current.filter((item) => item.id !== turn.id && item.state === "done");
      const body = buildChatBody(
        { messages: historyFor(earlier, turn.question), mode: turn.mode, scope: turn.scope },
        /** @type {import("../ask/askModel.js").AskKb} */ (/** @type {unknown} */ (knowledgeBase)),
      );

      streamChat({
        url: `${API_URL}/chat`,
        body,
        signal: controller.signal,
        onEvent: (event, data) => {
          if (event === "status" && typeof data.text === "string" && data.text.trim()) {
            const text = data.text.trim();
            patchTurn(turn.id, (item) => ({ ...item, status: text }));
          } else if (event === "delta" && typeof data.text === "string" && data.text) {
            const text = data.text;
            patchTurn(turn.id, (item) => ({
              ...item,
              state: "streaming",
              status: "",
              answer: item.answer + text,
            }));
          } else if (event === "sources") {
            const sources = normalizeSources(data.sources);
            patchTurn(turn.id, (item) => ({ ...item, sources }));
          } else if (event === "done") {
            patchTurn(turn.id, (item) =>
              item.answer.trim()
                ? { ...item, state: "done", status: "", sources: item.sources ?? [] }
                : { ...item, state: "error", status: "", error: friendlyError("server") },
            );
          } else if (event === "error") {
            patchTurn(turn.id, (item) => ({
              ...item,
              state: "error",
              status: "",
              answer: "",
              sources: null,
              error: friendlyError(data.code),
            }));
          }
        },
      });
    },
    [patchTurn],
  );

  /**
   * @param {string} text
   * @param {{ mode?: "jd_fit", scope?: Turn["scope"] }} [options]
   * @returns {boolean}
   */
  const send = useCallback(
    (text, options = {}) => {
      const question = text.trim();
      const current = turnsRef.current;
      const inFlight = current.some((turn) => turn.state === "waiting" || turn.state === "streaming");
      if (!question || inFlight || atMessageCap(current)) return false;
      turnSeq += 1;
      /** @type {Turn} */
      const turn = {
        id: `ask-turn-${turnSeq}`,
        question,
        mode: options.mode,
        scope: options.scope,
        answer: "",
        sources: null,
        status: ASK_COPY.waiting,
        state: "waiting",
        error: "",
      };
      updateTurns((list) => [...list.filter((item) => item.state !== "error"), turn]);
      run(turn);
      return true;
    },
    [run, updateTurns],
  );

  function restart() {
    abortRef.current?.abort();
    updateTurns(() => []);
    setInput("");
    setJdOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  /** @param {Turn} turn */
  function retry(turn) {
    if (busy) return;
    const fresh = { ...turn, answer: "", sources: null, status: ASK_COPY.waiting, state: "waiting", error: "" };
    patchTurn(turn.id, () => /** @type {Turn} */ (fresh));
    run(/** @type {Turn} */ (fresh));
  }

  /** @param {Turn} turn */
  function dismiss(turn) {
    updateTurns((list) => list.filter((item) => item.id !== turn.id));
    inputRef.current?.focus({ preventScroll: true });
  }

  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    const unregister = registerAskHandler(({ question, scope }) => {
      if (atMessageCap(turnsRef.current)) {
        abortRef.current?.abort();
        updateTurns(() => []);
      }
      setJdOpen(false);
      const sent = sendRef.current(question, { scope });
      setInput(sent ? "" : question);
      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    });
    return () => {
      unregister();
      abortRef.current?.abort();
    };
  }, [updateTurns]);

  useEffect(() => {
    if (capped) restartRef.current?.focus({ preventScroll: true });
  }, [capped]);

  function resizeInput() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  function submitInput() {
    if (!input.trim()) {
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    if (send(input)) {
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
    }
  }

  return (
    <section id={id} className="ask-section">
      <ReadingColumn>
        <p className="kicker">{ASK_COPY.kicker}</p>
        <h2 tabIndex={-1}>{ASK_COPY.title}</h2>
        <p className="ask-sub">{ASK_COPY.sub}</p>

        <div className="ask-card">
          {capped ? (
            <div className="ask-cap">
              <p>{ASK_COPY.capNote}</p>
              <button ref={restartRef} type="button" className="ask-go" onClick={restart}>
                {ASK_COPY.restart}
              </button>
            </div>
          ) : jdOpen ? (
            <JdFitForm
              busy={busy}
              onCancel={() => {
                setJdOpen(false);
                requestAnimationFrame(() => jdLinkRef.current?.focus({ preventScroll: true }));
              }}
              onSubmit={(text) => {
                if (send(text, { mode: "jd_fit" })) {
                  setJdOpen(false);
                  requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
                }
              }}
            />
          ) : (
            <form
              className="ask-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitInput();
              }}
            >
              <textarea
                id="ask-input"
                ref={inputRef}
                rows={1}
                value={input}
                placeholder={ASK_COPY.placeholder}
                aria-label={ASK_COPY.placeholder}
                onChange={(event) => {
                  setInput(event.target.value);
                  resizeInput();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitInput();
                  }
                }}
              />
              <button className="ask-go" type="submit" disabled={busy}>
                {ASK_COPY.ask}
              </button>
            </form>
          )}

          {capped ? null : (
            <div className="chips" role="group" aria-label={ASK_COPY.chipsLabel}>
              {CHIPS.map((question) => (
                <button key={question} type="button" disabled={busy} onClick={() => send(question)}>
                  {question}
                </button>
              ))}
            </div>
          )}

          <div className="convo" aria-live="polite" aria-busy={busy}>
            {turns.map((turn) => (
              <article key={turn.id} className="turn">
                {turn.mode === "jd_fit" ? (
                  <>
                    <p className="turn-q">{ASK_COPY.jdQuestion}</p>
                    <details className="turn-jd">
                      <summary>{ASK_COPY.jdShow}</summary>
                      <p>{turn.question}</p>
                    </details>
                  </>
                ) : (
                  <p className="turn-q">{turn.question}</p>
                )}
                {turn.answer ? (
                  <AskAnswer
                    turnId={turn.id}
                    text={turn.answer}
                    sources={turn.sources}
                    streaming={turn.state !== "done"}
                    jdFit={turn.mode === "jd_fit"}
                  />
                ) : null}
                {turn.status && (turn.state === "waiting" || turn.state === "streaming") ? (
                  <p className="ask-status">{turn.status}</p>
                ) : null}
                {turn.state === "error" ? (
                  <div className="ask-error" role="alert">
                    <p>{turn.error}</p>
                    <button type="button" className="ask-retry" onClick={() => retry(turn)} disabled={busy}>
                      {ASK_COPY.retry}
                    </button>
                    <button type="button" className="ask-dismiss" onClick={() => dismiss(turn)}>
                      {ASK_COPY.dismiss}
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          {capped || jdOpen ? null : (
            <div className="ask-foot">
              <button ref={jdLinkRef} type="button" className="ask-jd-link" onClick={() => setJdOpen(true)}>
                {ASK_COPY.jdLink}
              </button>
            </div>
          )}
        </div>
      </ReadingColumn>
    </section>
  );
}
