import React from "react";
import ReactDOM from "react-dom/client";
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
import App from "./App.jsx";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing root element");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
