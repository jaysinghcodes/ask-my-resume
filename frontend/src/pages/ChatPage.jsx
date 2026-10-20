import { useEffect, useRef, useState } from "react";
import { API_URL, CHAT_ERROR_MESSAGE, SUGGESTED_QUESTIONS } from "../config/constants";
import { Message } from "../components/Message";
import { ReadingColumn } from "../components/ReadingColumn";

/**
 * @typedef {{ role: string, content: string }} ChatMessage
 */

export function ChatPage({ id = "ask" }) {
  const [messages, setMessages] = useState(/** @type {ChatMessage[]} */ ([]));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const inputRef = useRef(/** @type {HTMLTextAreaElement | null} */ (null));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, error]);

  function resizeInput() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  async function requestAnswer(history) {
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) throw new Error("chat failed");
      const data = await res.json();
      if (typeof data.response !== "string" || data.response.trim() === "") {
        throw new Error("chat failed");
      }

      setMessages([...history, { role: "ai", content: data.response }]);
    } catch {
      setError(CHAT_ERROR_MESSAGE);
    } finally {
      setLoading(false);
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
            {loading && <p className="ask-status">Looking that up.</p>}
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
