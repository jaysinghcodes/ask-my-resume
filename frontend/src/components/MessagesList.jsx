import { Box, Stack } from "@mui/material";
import { Message } from "./Message";
import { MessageAvatar } from "./MessageAvatar";
import { TypingIndicator } from "./TypingIndicator";

export function MessagesList({ messages, loading, messagesEndRef }) {
  return (
    <>
      {messages.length > 0 && (
        <Stack
          direction="row"
          alignItems="center"
          gap={1.5}
          sx={{
            color: "text.secondary",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            my: 1.5,
            "&::before, &::after": {
              content: '""',
              flex: 1,
              height: 1,
              bgcolor: "divider",
            },
          }}
        >
          conversation
        </Stack>
      )}
      {messages.map((m, i) => (
        <Message key={i} role={m.role} content={m.content} />
      ))}
      {loading && (
        <Stack direction="row" spacing={1.5} sx={{ mb: 2.5, minWidth: 0 }}>
          <MessageAvatar role="ai" />
          <Box
            sx={{
              px: { xs: 1.5, sm: 2 },
              py: 1.5,
              borderRadius: 1,
              flex: 1,
              minWidth: 0,
              bgcolor: "rgba(212, 196, 176, 0.08)",
              border: "1px solid",
              borderColor: "rgba(212, 196, 176, 0.2)",
            }}
          >
            <TypingIndicator />
          </Box>
        </Stack>
      )}
      <div ref={messagesEndRef} />
    </>
  );
}
