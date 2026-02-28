/**
 * Chat API route: POST /chat
 */

import { createClient, runAgenticLoop } from "../lib/claude.js";
import { SYSTEM_PROMPT } from "../lib/prompts.js";

export function registerChatRoute(app) {
  app.post("/chat", async (req, res) => {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    try {
      const client = createClient();
      const response = await runAgenticLoop(client, {
        systemPrompt: SYSTEM_PROMPT,
        messages,
      });
      res.json({ response });
    } catch (err) {
      console.error("Claude API error:", err.message);
      res.status(500).json({ error: "Failed to get response from Claude" });
    }
  });
}
