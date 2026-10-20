/**
 * POST /api/chat request handling, shared by the Vercel function and tests.
 *
 * SSE contract (T7 and T11 build on these events):
 *   event: status    data: {"text":"Searching project docs"}
 *   event: delta     data: {"text":"final answer chunk"}
 *   event: sources   data: {"sources":[]}
 *   event: done      data: {}
 *   event: error     data: {"code":"rate_limited|daily_cap|too_long|invalid|server","text":"..."}
 *
 * A foreign Origin returns HTTP 403 and {"code":"forbidden"}.
 * The response never includes a CORS header. The page is on the same origin.
 * Missing configuration and upstream failures both use the friendly server text.
 * The browser never receives a stack trace.
 */

import { createClient, streamAgenticLoop } from "./claude.js";
import { isConfigured, requireApiKey, requireModelId } from "./config.js";
import {
  FRIENDLY,
  clientIp,
  consumeQuota,
  createCounterStore,
  hashIp,
  isAllowedOrigin,
  readCaps,
  resolveIpSalt,
  validateChatBody,
} from "./limits.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { getResumeText, loadResume } from "./resume.js";

export const FRIENDLY_CHAT_ERROR = FRIENDLY.server;

/**
 * @param {string} event
 * @param {unknown} data
 * @returns {string}
 */
export function formatSse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/**
 * @param {number} status
 * @param {keyof typeof FRIENDLY} code
 * @returns {Response}
 */
function sseError(status, code) {
  return new Response(formatSse("error", { code, text: FRIENDLY[code] }), {
    status,
    headers: SSE_HEADERS,
  });
}

/**
 * @param {Request} request
 * @param {{ env?: NodeJS.ProcessEnv }} [deps]
 * @returns {Promise<Response>}
 */
export async function postChat(request, deps = {}) {
  const env = deps.env ?? process.env;
  if (!isAllowedOrigin(request.headers.get("origin"), env)) {
    return Response.json({ code: "forbidden" }, { status: 403 });
  }

  /** @type {unknown} */
  let body;
  try {
    body = await request.json();
  } catch {
    return sseError(400, "invalid");
  }

  const caps = readCaps(env);
  const validated = validateChatBody(body, caps);
  if (!validated.ok) {
    return sseError(400, validated.code);
  }

  if (!isConfigured(env)) {
    return sseError(503, "server");
  }

  const saltState = resolveIpSalt(env);
  if (!saltState.ok) {
    return sseError(503, "server");
  }

  try {
    const store = createCounterStore(env);
    const quota = await consumeQuota({
      ipHash: hashIp(clientIp(request), saltState.salt),
      store,
      caps,
    });
    if (!quota.ok) {
      return sseError(429, quota.code);
    }
  } catch {
    console.error("Rate limit counter failed");
    return sseError(500, "server");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      /** @type {boolean} */
      let closed = false;
      /**
       * @param {string} event
       * @param {unknown} data
       */
      const emit = (event, data) => {
        if (closed) return;
        controller.enqueue(encoder.encode(formatSse(event, data)));
      };
      try {
        if (!getResumeText()) {
          await loadResume();
        }
        const client = createClient(requireApiKey(env));
        const signal = AbortSignal.timeout(caps.requestTimeoutSeconds * 1000);
        const answer = await streamAgenticLoop(
          client,
          {
            systemPrompt: SYSTEM_PROMPT,
            messages: validated.messages,
            model: requireModelId(env),
            maxTokens: caps.maxOutputTokens,
            maxToolRounds: caps.maxToolRounds,
            signal,
          },
          (part) => {
            if (part.type === "delta") emit("delta", { text: part.text });
            else emit("status", { text: part.text });
          },
        );
        if (typeof answer !== "string" || answer.trim() === "") {
          emit("error", { code: "server", text: FRIENDLY.server });
          return;
        }
        emit("sources", { sources: [] });
        emit("done", {});
      } catch {
        console.error("Chat error");
        emit("error", { code: "server", text: FRIENDLY.server });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // The stream is already closed.
        }
      }
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
