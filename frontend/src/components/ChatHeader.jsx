import { Box, Typography } from "@mui/material";

export function ChatHeader({ backendOk }) {
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
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            mb: 0.75,
            letterSpacing: "0.2em",
            color: backendOk === false ? "error.main" : "primary.main",
          }}
        >
          <Box
            component="span"
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              bgcolor: backendOk === false ? "error.main" : "primary.main",
              animation: backendOk === false ? "none" : "pulse 2s infinite",
              "@keyframes pulse": {
                "0%, 100%": { opacity: 1 },
                "50%": { opacity: 0.3 },
              },
            }}
          />
          {backendOk === false ? "Backend offline" : "AI Resume Assistant"}
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
