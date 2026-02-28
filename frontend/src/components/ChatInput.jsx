import { useRef } from "react";
import {
  Box,
  TextField,
  Stack,
  Alert,
  IconButton,
  Typography,
} from "@mui/material";
import SendRoundedIcon from "@mui/icons-material/SendRounded";

export function ChatInput({
  value,
  onChange,
  onSend,
  onKeyDown,
  loading,
  error,
  onDismissError,
}) {
  const textareaRef = useRef(null);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  function handleChange(e) {
    onChange(e.target.value);
    setTimeout(autoResize, 0);
  }

  function handleSend() {
    onSend(value);
    if (textareaRef.current) textareaRef.current.style.height = "48px";
  }

  return (
    <Box
      sx={{
        borderTop: 1,
        borderColor: "divider",
        py: { xs: 1.5, sm: 2 },
        flexShrink: 0,
        minWidth: 0,
      }}
    >
      {error && (
        <Alert severity="error" onClose={onDismissError} sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}
      <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ minWidth: 0 }}>
        <TextField
          inputRef={textareaRef}
          multiline
          maxRows={6}
          fullWidth
          placeholder="Ask about Jay's experience, skills, projects..."
          value={value}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          disabled={loading}
          variant="outlined"
          size="small"
          minRows={1}
          sx={{
            minWidth: 0,
            flex: 1,
            "& .MuiOutlinedInput-root": {
              minHeight: 48,
              alignItems: "flex-end",
              "& textarea": {
                py: 1.5,
                px: { xs: 1.5, sm: 2 },
                fontSize: { xs: 16, sm: 14 },
                lineHeight: 1.5,
              },
            },
          }}
        />
        <IconButton
          onClick={handleSend}
          disabled={!value.trim() || loading}
          aria-label="Send"
          sx={{
            width: 48,
            height: 48,
            minWidth: 48,
            flexShrink: 0,
            bgcolor: "primary.main",
            color: "primary.contrastText",
            "&:hover": {
              bgcolor: "primary.light",
              color: "primary.contrastText",
            },
            "&:disabled": {
              bgcolor: "action.disabledBackground",
              color: "action.disabled",
            },
          }}
        >
          <SendRoundedIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Typography
        variant="caption"
        sx={{ display: "block", mt: 1, color: "text.secondary" }}
      >
        ↵ Enter to send · Shift+↵ for new line
      </Typography>
    </Box>
  );
}
