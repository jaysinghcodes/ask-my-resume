import { useState, useRef, useEffect } from "react";
import { Box } from "@mui/material";
import { API_URL, BACKEND_ERROR_HINT } from "../config/constants";
import { ChatHeader, EmptyState, ChatInput, MessagesList } from "../components";

export function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [backendOk, setBackendOk] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/health`)
      .then((r) => (r.ok ? true : false))
      .then((ok) => {
        if (!cancelled) setBackendOk(ok);
      })
      .catch(() => {
        if (!cancelled) setBackendOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function sendMessage(text) {
    const question = text.trim();
    if (!question || loading) return;

    setError("");
    const newMessages = [...messages, { role: "user", content: question }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();

      setMessages([...newMessages, { role: "ai", content: data.response }]);
    } catch (err) {
      const parts = [
        "Couldn't reach the server.",
        backendOk === false ? BACKEND_ERROR_HINT : "",
        err?.message || "",
      ].filter(Boolean);
      setError(parts.join(" "));
    } finally {
      setLoading(false);
    }
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
      <ChatHeader backendOk={backendOk} />

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
        onDismissError={() => setError("")}
      />
    </Box>
  );
}
