/**
 * Anthropic Claude client and agentic loop (tool use).
 * MODEL_ID is required. This module does not pick a model on its own.
 */

import Anthropic from "@anthropic-ai/sdk";
import { requireApiKey } from "./config.js";
import { TOOLS, executeTool } from "./tools.js";

const DEFAULT_MAX_TOKENS = 1024;

/** Hard stop so a tool use response cannot loop forever. */
export const MAX_TOOL_ROUNDS = 5;

/** Thrown when the tool cap is hit and the model produced no answer text. */
export class ToolRoundLimitError extends Error {
  constructor() {
    super("Tool round limit reached");
    this.name = "ToolRoundLimitError";
  }
}

/**
 * Create an Anthropic client from env.
 * @param {string} [apiKey]
 * @returns {Anthropic}
 */
export function createClient(apiKey = requireApiKey()) {
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }
  return new Anthropic({ apiKey });
}

/**
 * @param {{ content?: Array<{ type?: string, text?: string }> }} response
 * @returns {string}
 */
function textFromResponse(response) {
  const blocks = Array.isArray(response?.content) ? response.content : [];
  return blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

/**
 * Run the agentic loop: call Claude until it stops using tools, then return the final text.
 * At most MAX_TOOL_ROUNDS tool rounds run. The next model call is not made after that cap.
 * @param {Anthropic} client - Anthropic client
 * @param {object} options
 * @param {string} options.systemPrompt
 * @param {Anthropic.MessageParam[]} options.messages
 * @param {string} options.model - Required model id. No fallback.
 * @param {number} [options.maxTokens]
 * @returns {Promise<string>} Final assistant text response.
 * @throws {ToolRoundLimitError} When the tool cap is reached with no answer text.
 */
export async function runAgenticLoop(
  client,
  { systemPrompt, messages, model, maxTokens = DEFAULT_MAX_TOKENS },
) {
  if (!model || typeof model !== "string" || !model.trim()) {
    throw new Error("Missing MODEL_ID");
  }

  const modelId = model.trim();
  /** @type {Anthropic.MessageParam[]} */
  let currentMessages = [...messages];
  let finalResponse = "";
  let toolRounds = 0;

  while (true) {
    const response = await client.messages.create({
      model: modelId,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools: TOOLS,
      messages: currentMessages,
    });

    if (response.stop_reason === "tool_use") {
      toolRounds += 1;

      currentMessages.push({
        role: "assistant",
        content: response.content,
      });

      /** @type {Anthropic.ToolResultBlockParam[]} */
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

      if (toolRounds >= MAX_TOOL_ROUNDS) {
        finalResponse = textFromResponse(response);
        if (!finalResponse.trim()) {
          throw new ToolRoundLimitError();
        }
        break;
      }
      continue;
    }

    finalResponse = textFromResponse(response);
    break;
  }

  return finalResponse;
}
