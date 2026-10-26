/**
 * POST /api/chat request handling, shared by the Vercel function and tests.
 *
 * SSE contract (T7 and T11 build on these events):
 *   event: status    data: {"text":"Searching project docs"}
 *   event: delta     data: {"text":"answer chunk"}
 *   event: sources   data: {"sources":[{"id":"bullet-...","label":"Resume · ...","href":"#role-..."}]}
 *   event: done      data: {}
 *   event: error     data: {"code":"rate_limited|daily_cap|too_long|invalid|server","text":"..."}
 *
 * A foreign Origin returns HTTP 403 and {"code":"forbidden"}.
 * The response never includes a CORS header. The page is on the same origin.
 * Missing configuration and upstream failures both use the friendly server text.
 * The browser never receives a stack trace.
 *
 * T7: the system is the behavior prompt, the cached core KB block, then the JD fit
 * prompt (mode jd_fit) or a scope note. Each [record id] cite in the answer becomes a
 * source; unknown ids are dropped. Em and en dashes become a comma and a space. A JD fit
 * answer is buffered and checked with checkJdFitAnswer before it is sent; on a failure
 * the server sends only what the page's shared parser renders (path a).
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
import { checkJdFitAnswer, renderedJdFit } from "./jd-fit.js";
import { recordIds } from "./kb-data.js";
import { buildSystem } from "./prompts.js";
import { createDashNet, sourcesForAnswer } from "./sources.js";

export const FRIENDLY_CHAT_ERROR = FRIENDLY.server;

/**
 * @param {string} event
 * @param {unknown} data
 * @returns {string}
 */
export function formatSse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Status line while a JD fit answer is buffered and checked. */
export const JD_FIT_STATUS = "Comparing the job description";

/**
 * The JD fit answer to send. A passing answer goes out as written. A failing one is
 * rebuilt from what the page's shared parser renders: the allowed sections and their
 * cited items, with cites to real records kept (path a, #6). An empty string means
 * nothing renderable is left.
 * @param {string} text
 * @param {string[]} sourceIds
 * @returns {{ text: string, problems: string[] }}
 */
export function finalJdFitAnswer(text, sourceIds) {
  const problems = checkJdFitAnswer(text, { sourceIds });
  if (problems.length === 0) return { text, problems };
  const sections = renderedJdFit(text, { sourceIds }).filter((section) => section.items.length > 0);
  const rebuilt = sections
    .map((section) => [section.heading, ...section.items.map((item) => `- ${item.text}`)].join("\n"))
    .join("\n\n");
  return { text: rebuilt, problems };
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
  const clientGone = new AbortController();
  const timeoutSignal = AbortSignal.timeout(caps.requestTimeoutSeconds * 1000);
  const signal = AbortSignal.any([timeoutSignal, clientGone.signal]);
  const stream = new ReadableStream({
    async start(controller) {
      /** @type {boolean} */
      let closed = false;
      let timeoutReported = false;
      const reportTimeout = () => {
        if (closed || clientGone.signal.aborted || timeoutReported) return;
        timeoutReported = true;
        console.error("Chat request timed out");
        try {
          controller.enqueue(
            encoder.encode(formatSse("error", { code: "server", text: FRIENDLY.server })),
          );
        } catch {
          closed = true;
          clientGone.abort();
        }
      };
      /**
       * @param {string} event
       * @param {unknown} data
       */
      const emit = (event, data) => {
        if (closed || clientGone.signal.aborted) return;
        if (timeoutSignal.aborted) {
          reportTimeout();
          return;
        }
        try {
          controller.enqueue(encoder.encode(formatSse(event, data)));
        } catch {
          closed = true;
          clientGone.abort();
        }
      };
      try {
        const jdFit = validated.mode === "jd_fit";
        const dashNet = createDashNet();
        let sent = "";
        const client = createClient(requireApiKey(env));
        if (jdFit) emit("status", { text: JD_FIT_STATUS });
        const answer = await streamAgenticLoop(
          client,
          {
            systemPrompt: buildSystem({ scope: validated.scope, mode: validated.mode }),
            messages: validated.messages,
            model: requireModelId(env),
            maxTokens: caps.maxOutputTokens,
            maxToolRounds: caps.maxToolRounds,
            signal,
            toolContext: { scope: validated.scope },
          },
          (part) => {
            if (part.type !== "delta") {
              if (!jdFit) emit("status", { text: part.text });
              return;
            }
            const text = dashNet(part.text);
            sent += text;
            if (!jdFit && text) emit("delta", { text });
          },
        );
        if (clientGone.signal.aborted) return;
        if (timeoutSignal.aborted) {
          reportTimeout();
          return;
        }
        if (typeof answer !== "string" || answer.trim() === "" || sent.trim() === "") {
          emit("error", { code: "server", text: FRIENDLY.server });
          return;
        }
        if (jdFit) {
          const checked = finalJdFitAnswer(sent, recordIds());
          if (checked.problems.length) console.error(`JD fit check failed: ${checked.problems.length} problem(s)`);
          if (checked.text.trim() === "") {
            emit("error", { code: "server", text: FRIENDLY.server });
            return;
          }
          sent = checked.text;
          emit("delta", { text: sent });
        }
        emit("sources", { sources: sourcesForAnswer(sent) });
        emit("done", {});
      } catch {
        if (clientGone.signal.aborted || closed) return;
        if (timeoutSignal.aborted) {
          reportTimeout();
          return;
        }
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
    cancel() {
      clientGone.abort();
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
