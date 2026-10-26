import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/claude.js", () => ({
  createClient: vi.fn(() => ({ messages: { stream: vi.fn() } })),
  streamAgenticLoop: vi.fn(async (_client, _options, emit) => {
    emit({ type: "delta", text: "Grounded answer" });
    return "Grounded answer";
  }),
}));

vi.mock("../lib/resume.js", () => ({
  loadResume: vi.fn(async () => "resume text"),
  getResumeText: vi.fn(() => "resume text"),
}));

import { POST } from "../api/chat.js";
import { toApiMessages } from "../frontend/src/chatHistory.js";
import { FRIENDLY_CHAT_ERROR, formatSse } from "../lib/chat.js";
import { createClient, streamAgenticLoop } from "../lib/claude.js";
import { FRIENDLY, resetLimitState } from "../lib/limits.js";
import { loadResume } from "../lib/resume.js";

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "MODEL_ID",
  "CHAT_MAX_HISTORY",
  "CHAT_MAX_MESSAGE_CHARS",
  "CHAT_PER_IP_DAILY",
  "CHAT_SITE_DAILY",
  "CHAT_MAX_OUTPUT_TOKENS",
  "CHAT_REQUEST_TIMEOUT_SECONDS",
  "CHAT_MAX_TOOL_ROUNDS",
  "IP_HASH_SALT",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_BRANCH_URL",
  "ALLOWED_ORIGINS",
];

/**
 * @param {string} name
 * @param {string | undefined} value
 */
function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

/**
 * @param {unknown} body
 * @param {Record<string, string>} [headers]
 */
function chatRequest(body, headers = {}) {
  return new Request("http://127.0.0.1/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/**
 * @param {Response} response
 */
async function readEvents(response) {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((block) => block.trim() !== "")
    .map((block) => {
      let event = "message";
      const dataLines = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      return { event, data: JSON.parse(dataLines.join("\n")) };
    });
}

describe("POST /api/chat", () => {
  /** @type {Record<string, string | undefined>} */
  let previous;

  beforeEach(() => {
    previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of ENV_KEYS) delete process.env[key];
    resetLimitState();
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const key of ENV_KEYS) restore(key, previous[key]);
    vi.restoreAllMocks();
    resetLimitState();
  });

  it("returns the friendly server event when MODEL_ID is missing and does not call Claude", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const response = await POST(chatRequest({ messages: [{ role: "user", content: "Hi" }] }));
    const events = await readEvents(response);

    expect(response.status).toBe(503);
    expect(events).toEqual([{ event: "error", data: { code: "server", text: FRIENDLY.server } }]);
    expect(events[0]?.data.text).toBe(FRIENDLY_CHAT_ERROR);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(createClient).not.toHaveBeenCalled();
    expect(streamAgenticLoop).not.toHaveBeenCalled();
  });

  it("returns the friendly server event when ANTHROPIC_API_KEY is missing and does not call Claude", async () => {
    process.env.MODEL_ID = "model-from-env";
    const response = await POST(chatRequest({ messages: [{ role: "user", content: "Hi" }] }));
    const events = await readEvents(response);

    expect(response.status).toBe(503);
    expect(events).toEqual([{ event: "error", data: { code: "server", text: FRIENDLY.server } }]);
    expect(createClient).not.toHaveBeenCalled();
    expect(streamAgenticLoop).not.toHaveBeenCalled();
  });

  it("returns the friendly server event when both variables are missing", async () => {
    const response = await POST(chatRequest({ messages: [{ role: "user", content: "Hi" }] }));
    expect(response.status).toBe(503);
    expect(await readEvents(response)).toEqual([
      { event: "error", data: { code: "server", text: FRIENDLY.server } },
    ]);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("streams deltas, an empty source list, and done when configured", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.MODEL_ID = "model-from-env";
    const response = await POST(chatRequest({ messages: [{ role: "user", content: "Skills?" }] }));
    const events = await readEvents(response);

    expect(response.status).toBe(200);
    expect(events).toEqual([
      { event: "delta", data: { text: "Grounded answer" } },
      { event: "sources", data: { sources: [] } },
      { event: "done", data: {} },
    ]);
    expect(formatSse("done", {})).toBe("event: done\ndata: {}\n\n");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(loadResume).not.toHaveBeenCalled();
    expect(createClient).toHaveBeenCalledWith("test-key");
    expect(streamAgenticLoop).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        model: "model-from-env",
        maxTokens: 1024,
        maxToolRounds: 5,
        signal: expect.any(AbortSignal),
      }),
      expect.any(Function),
    );
  });

  it("flushes the first delta before the answer is finished", async () => {
    /** @type {(value?: void) => void} */
    let release = () => {};
    const hold = new Promise((resolve) => {
      release = resolve;
    });
    /** @type {import("vitest").Mock} */ (streamAgenticLoop).mockImplementationOnce(
      async (_client, _options, emit) => {
        emit({ type: "status", text: "Searching the resume" });
        emit({ type: "delta", text: "Jay " });
        await hold;
        emit({ type: "delta", text: "builds cloud systems." });
        return "Jay builds cloud systems.";
      },
    );

    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.MODEL_ID = "model-from-env";
    const response = await POST(chatRequest({ messages: [{ role: "user", content: "Skills?" }] }));
    const reader = response.body?.getReader();
    expect(reader).toBeTruthy();
    const decoder = new TextDecoder();
    let text = "";
    const early = (async () => {
      while (!text.includes("event: delta")) {
        const next = await reader?.read();
        if (!next || next.done) break;
        text += decoder.decode(next.value, { stream: true });
      }
    })();
    const winner = await Promise.race([
      early.then(() => "data"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 1000)),
    ]);

    expect(winner).toBe("data");
    expect(text).toContain("Searching the resume");
    expect(text).toContain("Jay ");
    expect(text).not.toContain("builds cloud systems.");
    release();
    while (true) {
      const next = await reader?.read();
      if (!next || next.done) break;
      text += decoder.decode(next.value, { stream: true });
    }
    expect(text).toContain("builds cloud systems.");
    expect(text).toContain("event: sources");
    expect(text).toContain('"sources":[]');
    expect(text).toContain("event: done");
  });

  it("returns the friendly server event when a capped tool loop has no text", async () => {
    const actual = await vi.importActual("../lib/claude.js");
    let calls = 0;
    const stream = vi.fn(() => {
      calls += 1;
      if (calls > 5) throw new Error("loop continued past 5 tool rounds");
      return {
        on() {
          return this;
        },
        async finalMessage() {
          return {
            stop_reason: "tool_use",
            content: [
              {
                type: "tool_use",
                id: `tool_${calls}`,
                name: "search_resume",
                input: { query: "skills" },
              },
            ],
          };
        },
      };
    });
    /** @type {import("vitest").Mock} */ (createClient).mockImplementationOnce(() => ({
      messages: { stream },
    }));
    /** @type {import("vitest").Mock} */ (streamAgenticLoop).mockImplementationOnce(
      /** @type {any} */ (actual).streamAgenticLoop,
    );

    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.MODEL_ID = "model-from-env";
    const response = await POST(chatRequest({ messages: [{ role: "user", content: "Hi" }] }));
    const events = await readEvents(response);

    expect(stream).toHaveBeenCalledTimes(5);
    expect(response.status).toBe(200);
    expect(events.filter((event) => event.event === "status")).toHaveLength(5);
    expect(events.at(-1)).toEqual({ event: "error", data: { code: "server", text: FRIENDLY.server } });
    expect(events.some((event) => event.event === "done" || event.event === "delta")).toBe(false);
    expect(JSON.stringify(events)).not.toContain("Tool round limit");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects a bad body with invalid and does not leak a stack", async () => {
    const response = await POST(chatRequest({ nope: true }));
    const events = await readEvents(response);
    expect(response.status).toBe(400);
    expect(events).toEqual([{ event: "error", data: { code: "invalid", text: FRIENDLY.invalid } }]);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("stops a second question from the same IP at the per IP cap", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.MODEL_ID = "model-from-env";
    process.env.CHAT_PER_IP_DAILY = "1";
    process.env.IP_HASH_SALT = "salt";
    const headers = { "x-forwarded-for": "203.0.113.55" };
    const body = { messages: [{ role: "user", content: "Hi" }] };

    const first = await POST(chatRequest(body, headers));
    expect(first.status).toBe(200);
    await first.text();

    const second = await POST(chatRequest(body, headers));
    const events = await readEvents(second);
    expect(second.status).toBe(429);
    expect(events).toEqual([
      { event: "error", data: { code: "rate_limited", text: FRIENDLY.rate_limited } },
    ]);
    expect(streamAgenticLoop).toHaveBeenCalledTimes(1);
    const logged = vi.mocked(console.error).mock.calls.concat(vi.mocked(console.warn).mock.calls);
    expect(JSON.stringify(logged)).not.toContain("203.0.113.55");
  });

  it("stops at the site daily cap", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.MODEL_ID = "model-from-env";
    process.env.CHAT_SITE_DAILY = "1";
    process.env.CHAT_PER_IP_DAILY = "30";
    process.env.IP_HASH_SALT = "salt";
    const body = { messages: [{ role: "user", content: "Hi" }] };

    const first = await POST(chatRequest(body, { "x-forwarded-for": "203.0.113.10" }));
    expect(first.status).toBe(200);
    await first.text();
    const second = await POST(chatRequest(body, { "x-forwarded-for": "203.0.113.11" }));
    const events = await readEvents(second);
    expect(second.status).toBe(429);
    expect(events[0]?.data.code).toBe("daily_cap");
    expect(events[0]?.data.text).toBe(FRIENDLY.daily_cap);
  });

  it("aborts the upstream model call when the client cancels", async () => {
    const actual = await vi.importActual("../lib/claude.js");
    /** @type {AbortSignal | undefined} */
    let upstream;
    const stream = vi.fn((_body, options) => {
      upstream = options?.signal;
      return {
        on() {
          return this;
        },
        finalMessage() {
          return new Promise((_resolve, reject) => {
            const requestSignal = options?.signal;
            if (!requestSignal) {
              reject(new Error("missing signal"));
              return;
            }
            if (requestSignal.aborted) {
              reject(requestSignal.reason ?? new Error("aborted"));
              return;
            }
            requestSignal.addEventListener(
              "abort",
              () => {
                reject(requestSignal.reason ?? new Error("aborted"));
              },
              { once: true },
            );
          });
        },
      };
    });
    /** @type {import("vitest").Mock} */ (createClient).mockImplementationOnce(() => ({
      messages: { stream },
    }));
    /** @type {import("vitest").Mock} */ (streamAgenticLoop).mockImplementationOnce(
      /** @type {any} */ (actual).streamAgenticLoop,
    );

    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.MODEL_ID = "model-from-env";
    process.env.IP_HASH_SALT = "salt";
    const response = await POST(chatRequest({ messages: [{ role: "user", content: "Hi" }] }));
    const reader = response.body?.getReader();
    expect(reader).toBeTruthy();
    await vi.waitFor(() => {
      expect(stream).toHaveBeenCalledTimes(1);
    });
    await reader?.cancel();
    await vi.waitFor(() => {
      expect(upstream?.aborted).toBe(true);
    });
    expect(stream).toHaveBeenCalledTimes(1);
    const logged = vi.mocked(console.error).mock.calls.map((call) => String(call[0]));
    expect(logged).not.toContain("Chat error");
    expect(logged).not.toContain("Chat request timed out");
  });

  it("ends a timed out answer with the server error and no done", async () => {
    const actual = await vi.importActual("../lib/claude.js");
    /** @type {AbortSignal | undefined} */
    let upstream;
    let writes = 0;
    const chunks = ["Jay ", "builds ", "cloud ", "platforms ", "and ", "more."];
    const stream = vi.fn((_body, options) => {
      upstream = options?.signal;
      return {
        /** @type {((delta: string) => void) | null} */
        _onText: null,
        /**
         * @param {string} event
         * @param {(delta: string) => void} listener
         */
        on(event, listener) {
          if (event === "text") this._onText = listener;
          return this;
        },
        finalMessage() {
          const requestSignal = options?.signal;
          return new Promise((resolve, reject) => {
            if (!requestSignal) {
              reject(new Error("missing signal"));
              return;
            }
            let index = 0;
            let settled = false;
            /** @type {ReturnType<typeof setInterval> | undefined} */
            let timer;
            const finish = (aborted) => {
              if (settled) return;
              settled = true;
              if (timer) clearInterval(timer);
              if (aborted) reject(requestSignal.reason ?? new Error("aborted"));
              else {
                resolve({
                  stop_reason: "end_turn",
                  content: [{ type: "text", text: chunks.join("") }],
                });
              }
            };
            const send = () => {
              if (requestSignal.aborted) {
                finish(true);
                return;
              }
              const chunk = chunks[index];
              if (!chunk) {
                finish(false);
                return;
              }
              index += 1;
              writes += 1;
              this._onText?.(chunk);
            };
            send();
            timer = setInterval(send, 400);
            requestSignal.addEventListener("abort", () => finish(true), { once: true });
          });
        },
      };
    });
    /** @type {import("vitest").Mock} */ (createClient).mockImplementationOnce(() => ({
      messages: { stream },
    }));
    /** @type {import("vitest").Mock} */ (streamAgenticLoop).mockImplementationOnce(
      /** @type {any} */ (actual).streamAgenticLoop,
    );

    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.MODEL_ID = "model-from-env";
    process.env.IP_HASH_SALT = "salt";
    process.env.CHAT_REQUEST_TIMEOUT_SECONDS = "1";
    const response = await POST(chatRequest({ messages: [{ role: "user", content: "Hello" }] }));
    const events = await readEvents(response);

    expect(events.some((event) => event.event === "delta")).toBe(true);
    expect(events.at(-1)).toEqual({
      event: "error",
      data: { code: "server", text: FRIENDLY.server },
    });
    expect(events.some((event) => event.event === "done" || event.event === "sources")).toBe(false);
    expect(events.filter((event) => event.event === "error")).toHaveLength(1);
    expect(upstream?.aborted).toBe(true);
    expect(writes).toBeGreaterThan(0);
    expect(writes).toBeLessThan(chunks.length);
    expect(vi.mocked(console.error).mock.calls.map((call) => String(call[0]))).toEqual([
      "Chat request timed out",
    ]);
  });

  it("answers question 7 from the history window that starts on a user turn", async () => {
    /** @type {{ role: string, content: string }[]} */
    const history = [];
    for (let index = 1; index <= 6; index += 1) {
      history.push({ role: "user", content: `Question ${index}` });
      history.push({ role: "ai", content: `Answer ${index}` });
    }
    history.push({ role: "user", content: "Question 7" });
    const snapshot = history.map((message) => ({ ...message }));
    const payload = toApiMessages(history);

    expect(history).toEqual(snapshot);
    expect(history).toHaveLength(13);
    expect(payload.length).toBeLessThanOrEqual(12);
    expect(payload[0]?.role).toBe("user");
    expect(payload.at(-1)).toEqual({ role: "user", content: "Question 7" });
    expect(payload.some((message) => message.role === "ai")).toBe(false);

    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.MODEL_ID = "model-from-env";
    process.env.IP_HASH_SALT = "salt";
    const response = await POST(chatRequest({ messages: payload }));
    const events = await readEvents(response);
    expect(response.status).toBe(200);
    expect(events.some((event) => event.event === "delta")).toBe(true);
    expect(events.at(-1)?.event).toBe("done");
    expect(events.some((event) => event.event === "error")).toBe(false);
    expect(streamAgenticLoop).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ messages: payload }),
      expect.any(Function),
    );
  });
});
