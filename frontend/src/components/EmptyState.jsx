import { Box, Button, Stack, Typography } from "@mui/material";
import { SUGGESTED_QUESTIONS } from "../config/constants";

export function EmptyState({ onAsk }) {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      sx={{
        textAlign: "center",
        gap: { xs: 2.5, sm: 3 },
        py: { xs: 3, sm: 4 },
        px: { xs: 1.5, sm: 2 },
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      <Typography sx={{ fontSize: 48, lineHeight: 1 }}>⚡</Typography>
      <Stack spacing={1.5} alignItems="center">
        <Typography
          variant="h2"
          sx={{
            fontSize: { xs: 18, sm: 22 },
            fontWeight: 700,
            color: "text.primary",
            px: 1,
          }}
        >
          Ask me anything about Jay
        </Typography>
        <Typography
          variant="body2"
          sx={{
            maxWidth: 380,
            width: "100%",
            color: "text.secondary",
            lineHeight: 1.6,
            fontSize: { xs: "0.75rem", sm: "0.8125rem" },
          }}
        >
          Powered by Claude + MCP. Ask about his skills, experience, or whether
          he'd be a good fit for your team.
        </Typography>
      </Stack>
      <Stack
        direction="row"
        flexWrap="wrap"
        gap={1}
        justifyContent="center"
        sx={{ maxWidth: 580, width: "100%", px: 0.5 }}
      >
        {SUGGESTED_QUESTIONS.map((q) => (
          <Button
            key={q}
            variant="outlined"
            size="small"
            onClick={() => onAsk(q)}
            sx={{
              borderColor: "divider",
              color: "text.secondary",
              fontSize: { xs: 11, sm: 12 },
              py: 1,
              px: 1.5,
              "&:hover": {
                borderColor: "primary.main",
                color: "primary.main",
                bgcolor: "action.hover",
              },
            }}
          >
            {q}
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}
