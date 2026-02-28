import { Box, Stack, useTheme } from "@mui/material";

export function TypingIndicator() {
  const theme = useTheme();
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ py: 0.5 }}>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            bgcolor: theme.palette.primary.main,
            animation: "typingBounce 1.2s infinite",
            animationDelay: `${i * 0.2}s`,
            "@keyframes typingBounce": {
              "0%, 60%, 100%": { transform: "translateY(0)", opacity: 0.4 },
              "30%": { transform: "translateY(-5px)", opacity: 1 },
            },
          }}
        />
      ))}
    </Stack>
  );
}
