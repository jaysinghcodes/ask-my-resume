import { Box } from "@mui/material";

const avatarSx = {
  width: 28,
  height: 28,
  borderRadius: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 700,
  flexShrink: 0,
  fontFamily: '"DM Sans", sans-serif',
};

/**
 * Reusable avatar for chat messages (user or assistant).
 */
export function MessageAvatar({ role }) {
  const isUser = role === "user";
  return (
    <Box
      sx={{
        ...avatarSx,
        mt: 0.25,
        ...(isUser
          ? { bgcolor: "divider", color: "text.primary" }
          : { bgcolor: "primary.main", color: "primary.contrastText" }),
      }}
    >
      {isUser ? "YOU" : "AI"}
    </Box>
  );
}
