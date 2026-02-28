/**
 * Anthropic Claude client and agentic loop (tool use).
 */

import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, executeTool } from "./tools.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Create an Anthropic client from env.
 */
export function createClient(apiKey = process.env.ANTHROPIC_API_KEY) {
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }
  return new Anthropic({ apiKey });
}

/**
 * Run the agentic loop: call Claude until it stops using tools, then return the final text.
 * @param {Anthropic} client - Anthropic client
 * @param {object} options - { systemPrompt, messages, model?, maxTokens? }
 * @returns {Promise<string>} Final assistant text response.
 */
export async function runAgenticLoop(client, { systemPrompt, messages, model = DEFAULT_MODEL, maxTokens = DEFAULT_MAX_TOKENS }) {
  let currentMessages = [...messages];
  let finalResponse = "";

  while (true) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools: TOOLS,
      messages: currentMessages,
    });

    if (response.stop_reason === "tool_use") {
      const assistantMessage = {
        role: "assistant",
        content: response.content,
      };
      currentMessages.push(assistantMessage);

      const toolResults = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = executeTool(block.name, block.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      currentMessages.push({ role: "user", content: toolResults });
      continue;
    }

    finalResponse = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    break;
  }

  return finalResponse;
}
