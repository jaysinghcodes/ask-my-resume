/**
 * POST /api/chat request handling, shared by the Vercel function and tests.
 * Missing configuration and upstream failures both return the same friendly error.
 * The response never includes a CORS header. The page is on the same origin.
 */

import { createClient, runAgenticLoop } from "./claude.js";
import { isConfigured, requireApiKey, requireModelId } from "./config.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { getResumeText, loadResume } from "./resume.js";

export const FRIENDLY_CHAT_ERROR =
  "Something went wrong getting that answer. Try again.";

/**
 * @param {number} status
 * @returns {Response}
 */
function jsonError(status) {
  return Response.json({ error: FRIENDLY_CHAT_ERROR }, { status });
}

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function postChat(request) {
  /** @type {{ messages?: unknown }} */
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400);
  }

  const messages = body?.messages;
  if (!Array.isArray(messages)) {
    return jsonError(400);
  }

  if (!isConfigured()) {
    return jsonError(503);
  }

  try {
    if (!getResumeText()) {
      await loadResume();
    }
    const client = createClient(requireApiKey());
    const response = await runAgenticLoop(client, {
      systemPrompt: SYSTEM_PROMPT,
      messages,
      model: requireModelId(),
    });
    if (typeof response !== "string" || response.trim() === "") {
      return jsonError(500);
    }
    return Response.json({ response });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat request failed";
    console.error("Chat error:", message);
    return jsonError(500);
  }
}
