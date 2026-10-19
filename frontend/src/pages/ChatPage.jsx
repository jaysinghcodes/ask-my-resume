import { useState, useRef, useEffect } from "react";
import { Box } from "@mui/material";
import { API_URL, CHAT_ERROR_MESSAGE } from "../config/constants";
import { ChatHeader, EmptyState, ChatInput, MessagesList } from "../components";

/**
 * @typedef {{ role: string, content: string }} ChatMessage
 */

export function ChatPage() {
  const [messages, setMessages] = useState(/** @type {ChatMessage[]} */ ([]));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        width: "100%",
        maxWidth: 860,
        mx: "auto",
        px: { xs: 1.5, sm: 2 },
        pt: 1,
        pb: { xs: 2, sm: 0 },
        boxSizing: "border-box",
        minWidth: 0,
      }}
    >
      <ChatHeader />

      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          overflowX: "hidden",
          py: { xs: 2, sm: 3 },
          minHeight: 0,
          WebkitOverflowScrolling: "touch",
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-track": { background: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            bgcolor: "divider",
            borderRadius: 2,
          },
        }}
      >
        {messages.length === 0 && !loading ? (
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <Box sx={{ flex: 1, minHeight: 24 }} />
            <EmptyState onAsk={sendMessage} />
          </Box>
        ) : (
          <MessagesList
            messages={messages}
            loading={loading}
            messagesEndRef={messagesEndRef}
          />
        )}
      </Box>

      <ChatInput
        value={input}
        onChange={setInput}
        onSend={sendMessage}
        onKeyDown={handleKeyDown}
        loading={loading}
        error={error}
        onRetry={retry}
        onDismissError={() => setError("")}
      />
    </Box>
  );
}
