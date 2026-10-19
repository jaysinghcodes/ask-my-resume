import { Box, Typography } from "@mui/material";

export function ChatHeader() {
  return (
    <Box
      component="header"
      sx={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        py: { xs: "24px 16px", sm: "32px 24px" },
        borderBottom: 1,
        borderColor: "divider",
        flexShrink: 0,
        minWidth: 0,
      }}
    >
      <Box>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            mb: 0.75,
            letterSpacing: "0.2em",
            color: "primary.main",
          }}
        >
          AI Resume Assistant
        </Typography>
        <Typography
          variant="h1"
          sx={{
            fontSize: { xs: 24, sm: 40, md: 48 },
            wordBreak: "break-word",
            "& span": { color: "primary.main" },
          }}
        >
          Ask <span>Jay.</span>
        </Typography>
      </Box>
    </Box>
  );
}
