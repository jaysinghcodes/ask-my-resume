/**
 * MCP Server entry point.
 * Composes Express app with config, resume loader, and routes.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { PORT } from "./lib/config.js";
import { loadResume } from "./lib/resume.js";
import { registerChatRoute } from "./routes/chat.js";
import { registerHealthRoute } from "./routes/health.js";

const app = express();

app.use(cors());
app.use(express.json());

registerHealthRoute(app);
registerChatRoute(app);

async function start() {
  try {
    await loadResume();
    console.log("✅ Resume loaded successfully");
  } catch (err) {
    console.error("❌ Failed to load resume:", err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`🚀 MCP Server running on port ${PORT}`);
  });
}

start();
