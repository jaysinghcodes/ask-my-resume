import { useEffect, useRef, useState } from "react";
import { API_URL, CHAT_ERROR_MESSAGE, SUGGESTED_QUESTIONS } from "../config/constants";
import { toApiMessages } from "../chatHistory";
import { Message } from "../components/Message";
import { ReadingColumn } from "../components/ReadingColumn";

/**
 * @typedef {{ role: string, content: string }} ChatMessage
 */

const RATE_LIMITED_MESSAGE =
  "You've asked a lot of questions in a short time. Try again in a few minutes, or email jaggys44@gmail.com.";

/**
 * @param {string} block
 * @param {(event: string, data: Record<string, unknown>) => void} onEvent
 */
function dispatchEvent(block, onEvent) {
  let event = "message";
  /** @type {string[]} */
  const dataLines = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return;
  try {
    const data = JSON.parse(dataLines.join("\n"));
    if (!data || typeof data !== "object") return;
    onEvent(event, data);
  } catch {
    // A bad event is ignored. The caller shows the friendly server message if no answer arrives.
  }
}

/**
 * @param {string} buffer
 * @param {(event: string, data: Record<string, unknown>) => void} onEvent
 * @returns {string}
 */
function consumeEvents(buffer, onEvent) {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) dispatchEvent(part, onEvent);
  return rest;
}

/**
 * @param {Response} response
 * @param {(event: string, data: Record<string, unknown>) => void} onEvent
 */
async function readEventStream(response, onEvent) {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = consumeEvents(buffer, onEvent);
  }
  buffer += decoder.decode();
  if (buffer.trim()) dispatchEvent(buffer, onEvent);
}

export function ChatPage({ id = "ask" }) {
  const [messages, setMessages] = useState(/** @type {ChatMessage[]} */ ([]));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const messagesEndRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const inputRef = useRef(/** @type {HTMLTextAreaElement | null} */ (null));
  const abortRef = useRef(/** @type {AbortController | null} */ (null));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, status, error]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function resizeInput() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  /**
   * @param {string} text
   */
  function appendAnswer(text) {
    setMessages((current) => {
      const next = current.slice();
      const last = next[next.length - 1];
      if (last && last.role === "ai") {
        next[next.length - 1] = { role: "ai", content: last.content + text };
        return next;
      }
      next.push({ role: "ai", content: text });
      return next;
    });
  }

  /**
   * @param {ChatMessage[]} history
   */
  async function requestAnswer(history) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setStatus("Looking that up.");
    setLoading(true);
    let answer = "";
    let sawError = false;

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toApiMessages(history) }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        setMessages(history);
        setError(res.status === 429 ? RATE_LIMITED_MESSAGE : CHAT_ERROR_MESSAGE);
        return;
      }

      await readEventStream(res, (event, data) => {
        if (controller.signal.aborted) return;
        if (event === "status" && typeof data.text === "string" && data.text.trim()) {
          setStatus(data.text);
          return;
        }
        if (event === "delta" && typeof data.text === "string" && data.text) {
          answer += data.text;
          setStatus("");
          appendAnswer(data.text);
          return;
        }
        if (event === "error") {
          sawError = true;
          const text = typeof data.text === "string" ? data.text.trim() : "";
          setError(text || CHAT_ERROR_MESSAGE);
        }
      });

      if (controller.signal.aborted) return;
      if (sawError || answer.trim() === "") {
        setMessages(history);
        if (!sawError) setError(CHAT_ERROR_MESSAGE);
      }
    } catch {
      if (controller.signal.aborted) return;
      setMessages(history);
      setError(CHAT_ERROR_MESSAGE);
    } finally {
      if (abortRef.current === controller) {
        setStatus("");
        setLoading(false);
      }
    }
  }

  function sendMessage(text) {
    const question = text.trim();
    if (!question || loading) return;

    const newMessages = [...messages, { role: "user", content: question }];
    setMessages(newMessages);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    requestAnswer(newMessages);
  }

  function retry() {
    if (loading || messages.length === 0) return;
    requestAnswer(messages);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const showThread = messages.length > 0 || loading || Boolean(error);

  return (
    <section id={id} className="ask-section">
      <ReadingColumn>
      <p className="kicker">Ask Jay</p>
      <h1 tabIndex={-1}>Ask about my experience</h1>
      <p className="ask-sub">
        An assistant that answers from my resume, project docs and repos, and cites where each
        answer came from.
      </p>

      <div className="ask-card">
        <form
          className="ask-form"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage(input);
          }}
        >
          <textarea
            id="ask-input"
            ref={inputRef}
            rows={1}
            value={input}
            placeholder="Ask about a role, a project, or paste a job description"
            aria-label="Ask about a role, a project, or paste a job description"
            disabled={loading}
            onChange={(event) => {
              setInput(event.target.value);
              resizeInput();
            }}
            onKeyDown={handleKeyDown}
          />
          <button className="ask-go" type="submit" disabled={loading || input.trim() === ""}>
            Ask
          </button>
        </form>

        <div className="chips">
          {SUGGESTED_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              disabled={loading}
              onClick={() => sendMessage(question)}
            >
              {question}
            </button>
          ))}
        </div>

        {showThread && (
          <div className="convo">
            {messages.map((message, index) => (
              <Message key={`${message.role}-${index}`} role={message.role} content={message.content} />
            ))}
            {loading && status ? (
              <p className="ask-status" aria-live="polite">
                {status}
              </p>
            ) : null}
            {error && (
              <div className="ask-error" role="alert">
                <p>{error}</p>
                <button type="button" className="ask-retry" onClick={retry} disabled={loading}>
                  Try again
                </button>
                <button type="button" className="ask-dismiss" onClick={() => setError("")}>
                  Dismiss
                </button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        <div className="ask-foot">Answers are grounded in the resume.</div>
      </div>
      </ReadingColumn>
    </section>
  );
}
