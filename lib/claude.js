/**
 * Anthropic Claude client and agentic loop (tool use).
 * MODEL_ID is required. This module does not pick a model on its own.
 * Model calls use the SDK streaming API. Text deltas are the final answer
 * text. A status line is emitted while a tool runs.
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
 * @typedef {{ type: "delta", text: string } | { type: "status", text: string }} StreamPart
 */

/**
 * Short progress text while a tool runs.
 * @param {string} name
 * @returns {string}
 */
export function statusTextForTool(name) {
  if (name === "search_resume") return "Searching the resume";
  return "Searching project docs";
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
 * @param {string} streamed
 * @param {string} finalText
 * @param {(part: StreamPart) => void} emit
 * @returns {string}
 */
function emitUnsentText(streamed, finalText, emit) {
  if (!finalText) return streamed;
  if (!streamed) {
    emit({ type: "delta", text: finalText });
    return finalText;
  }
  if (finalText.startsWith(streamed) && finalText.length > streamed.length) {
    emit({ type: "delta", text: finalText.slice(streamed.length) });
    return finalText;
  }
  return streamed;
}

/**
 * Run the agentic loop on the SDK streaming API.
 * At most maxToolRounds tool rounds run. The next model call is not made after that cap.
 * @param {Anthropic} client
 * @param {object} options
 * @param {string} options.systemPrompt
 * @param {Anthropic.MessageParam[]} options.messages
 * @param {string} options.model
 * @param {number} [options.maxTokens]
 * @param {number} [options.maxToolRounds]
 * @param {AbortSignal} [options.signal]
 * @param {(part: StreamPart) => void} emit
 * @returns {Promise<string>} Final assistant text.
 * @throws {ToolRoundLimitError} When the tool cap is reached with no answer text.
 */
export async function streamAgenticLoop(
  client,
  { systemPrompt, messages, model, maxTokens = DEFAULT_MAX_TOKENS, maxToolRounds = MAX_TOOL_ROUNDS, signal },
  emit,
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
    const stream = client.messages.stream(
      {
        model: modelId,
        max_tokens: maxTokens,
        system: systemPrompt,
        tools: TOOLS,
        messages: currentMessages,
      },
      signal ? { signal } : undefined,
    );

    let streamed = "";
    stream.on("text", (delta) => {
      if (typeof delta !== "string" || delta.length === 0) return;
      streamed += delta;
      emit({ type: "delta", text: delta });
    });

    const response = await stream.finalMessage();

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
          emit({ type: "status", text: statusTextForTool(block.name) });
          const result = executeTool(block.name, block.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      currentMessages.push({ role: "user", content: toolResults });

      if (toolRounds >= maxToolRounds) {
        finalResponse = textFromResponse(response) || streamed;
        if (!finalResponse.trim()) {
          throw new ToolRoundLimitError();
        }
        break;
      }
      continue;
    }

    finalResponse = emitUnsentText(streamed, textFromResponse(response), emit);
    break;
  }

  return finalResponse;
}

/**
 * Collect the streamed answer into one string.
 * @param {Anthropic} client
 * @param {object} options
 * @param {string} options.systemPrompt
 * @param {Anthropic.MessageParam[]} options.messages
 * @param {string} options.model
 * @param {number} [options.maxTokens]
 * @param {number} [options.maxToolRounds]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<string>}
 */
export async function runAgenticLoop(client, options) {
  return streamAgenticLoop(client, options, () => {});
}
