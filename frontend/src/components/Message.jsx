import { Box, Stack, useTheme } from "@mui/material";
import { MessageAvatar } from "./MessageAvatar";

export function Message({ role, content }) {
  const theme = useTheme();
  const isUser = role === "user";
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        mb: 2.5,
        minWidth: 0,
        animation: "fadeIn 0.2s ease",
        "@keyframes fadeIn": {
          from: { opacity: 0, transform: "translateY(6px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      }}
    >
      <MessageAvatar role={role} />
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          px: { xs: 1.5, sm: 2 },
          py: 1.5,
          borderRadius: 1,
          fontSize: { xs: 13, sm: 14 },
          lineHeight: 1.7,
          overflowWrap: "break-word",
          wordBreak: "break-word",
          ...(isUser
            ? {
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
              }
            : {
                bgcolor: "rgba(212, 196, 176, 0.08)",
                border: "1px solid",
                borderColor: "rgba(212, 196, 176, 0.2)",
                color: theme.palette.primary.light,
              }),
        }}
      >
        {content}
      </Box>
    </Stack>
  );
}
