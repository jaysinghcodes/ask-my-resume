import { Box, Typography, Paper, Stack } from "@mui/material";
import { ABOUT_TECH_STACK } from "../config/constants";

const codeBlockSx = {
  p: { xs: 2, sm: 3 },
  bgcolor: "background.paper",
  borderColor: "divider",
  fontFamily: "monospace",
  overflowX: "auto",
  overflowY: "hidden",
  maxWidth: "100%",
  WebkitOverflowScrolling: "touch",
  "& pre": {
    m: 0,
    whiteSpace: "pre",
    display: "block",
    fontSize: { xs: 10, sm: 11, md: 12 },
    lineHeight: 1.7,
  },
};

export function AboutPage() {
  return (
    <Box
      sx={{
        maxWidth: 720,
        width: "100%",
        mx: "auto",
        px: { xs: 1.5, sm: 2 },
        py: { xs: 3, sm: 4 },
        pt: { xs: 7, sm: 8 },
        pb: { xs: 4, sm: 5 },
        boxSizing: "border-box",
      }}
    >
      <Typography
        variant="h1"
        sx={{
          fontSize: { xs: 24, sm: 28, md: 36 },
          mb: 1,
          "& span": { color: "primary.main" },
        }}
      >
        About <span>Ask Jay</span>
      </Typography>
      <Typography variant="body2" sx={{ mb: 4, color: "text.secondary" }}>
        AI-powered resume assistant · Built by Jay Singh
      </Typography>

      <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.8 }}>
        Instead of a static resume PDF, this project lets recruiters and hiring
        managers have a real conversation about Jay's background. Ask about
        skills, experience, projects, or fit for a role — Claude uses an MCP
        tool to search his actual resume and give grounded, specific answers.
      </Typography>

      <Typography
        variant="h2"
        sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 700, mb: 2, mt: 4 }}
      >
        Tech stack
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={1.5} sx={{ mb: 4 }}>
        {ABOUT_TECH_STACK.map((tech) => (
          <Paper
            key={tech}
            variant="outlined"
            sx={{
              px: 1.5,
              py: 0.75,
              fontSize: { xs: 12, sm: 13 },
              bgcolor: "background.paper",
              borderColor: "divider",
            }}
          >
            {tech}
          </Paper>
        ))}
      </Stack>

      <Typography
        variant="h2"
        sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 700, mb: 2, mt: 4 }}
      >
        Architecture
      </Typography>
      <Paper variant="outlined" sx={codeBlockSx}>
        <Box component="pre">
          {`resume.pdf
    ↓
MCP Server (Node.js/Express)   ← defines "search_resume" tool
    ↑
Claude API (claude-sonnet)    ← calls the tool, forms responses
    ↑
React Frontend (Vite)         ← chat UI, hosted on GitHub Pages`}
        </Box>
      </Paper>

      <Typography variant="body2" sx={{ mt: 2, color: "text.secondary" }}>
        The MCP server loads the resume PDF, exposes a single tool (
        <code>search_resume</code>), and runs an agentic loop: Claude decides
        when to call the tool, gets the resume content, and synthesizes answers.
      </Typography>

      <Typography
        variant="h2"
        sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 700, mb: 2, mt: 4 }}
      >
        Project structure
      </Typography>
      <Paper variant="outlined" sx={codeBlockSx}>
        <Box component="pre">
          {`ask-my-resume/
├── .github/workflows/deploy.yml
├── mcp-server/
│   ├── index.js
│   ├── resume.pdf
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── config/constants.js
    │   ├── components/
    │   ├── pages/
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── theme.js
    ├── index.html
    └── package.json`}
        </Box>
      </Paper>
    </Box>
  );
}
