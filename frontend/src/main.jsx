import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "@fontsource/source-serif-4/latin-400.css";
import "@fontsource/source-serif-4/latin-600.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "./styles/tokens.css";
import "./styles/shell.css";
import "./styles/ask.css";
import "./styles/resume.css";
import App from "./App.jsx";
import { canHydrate } from "./can-hydrate.js";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing root element");
}

const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// The build prerenders the home page into #root so the hero paints before the script runs.
// Hydrate it only where it matches: the home path with no hash. Anywhere else, render fresh.
if (canHydrate(root, window.location)) {
  hydrateRoot(root, app);
} else {
  root.textContent = "";
  createRoot(root).render(app);
}
