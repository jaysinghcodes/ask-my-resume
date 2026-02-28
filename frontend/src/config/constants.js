/**
 * App-wide constants and config.
 */

export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "/api" : "http://localhost:3001");

export const SUGGESTED_QUESTIONS = [
  "What are Jay's strongest technical skills?",
  "Tell me about his work at CapTech",
  "What projects has he built?",
  "Is he a good fit for a backend role?",
  "What cloud platforms does he know?",
];

export const BACKEND_ERROR_HINT =
  "Start the backend with: cd mcp-server && npm install && npm start";

export const CONTACT_LINKS = [
  {
    label: "LinkedIn",
    href: "https://linkedin.com/in/j-singh19",
    description: "Connect professionally",
  },
  {
    label: "GitHub",
    href: "https://github.com/jaysinghcodes",
    description: "See projects and code",
  },
  {
    label: "Email",
    href: "mailto:jaggys44@gmail.com",
    description: "Reach out directly",
  },
];

export const ROUTES = {
  HOME: "/",
  ABOUT: "/about",
  CONTACT: "/contact",
};

export const NAV_ITEMS = [
  { path: "/", label: "Chat" },
  { path: "/about", label: "About" },
  { path: "/contact", label: "Contact" },
];

export const ABOUT_TECH_STACK = [
  "React",
  "Vite",
  "Material UI",
  "React Router",
  "Node.js",
  "Express",
  "Anthropic SDK (Claude)",
  "MCP (Model Context Protocol)",
  "GitHub Actions",
  "Render",
  "GitHub Pages",
];
