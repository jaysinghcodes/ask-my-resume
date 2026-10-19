/**
 * App-wide constants and config.
 */

export const API_URL = "/api";

export const CHAT_ERROR_MESSAGE =
  "Something went wrong getting that answer. Try again.";

export const SUGGESTED_QUESTIONS = [
  "What are Jay's strongest technical skills?",
  "Tell me about his work at CapTech",
  "What projects has he built?",
  "Is he a good fit for a backend role?",
  "What cloud platforms does he know?",
];

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
