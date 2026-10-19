import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/claude.js", () => ({
  createClient: vi.fn(() => ({ messages: { create: vi.fn() } })),
  runAgenticLoop: vi.fn(async () => "Grounded answer"),
}));

vi.mock("../lib/resume.js", () => ({
  loadResume: vi.fn(async () => "resume text"),
  getResumeText: vi.fn(() => "resume text"),
}));

import { POST } from "../api/chat.js";
import { FRIENDLY_CHAT_ERROR } from "../lib/chat.js";
import { createClient, runAgenticLoop } from "../lib/claude.js";
import { loadResume } from "../lib/resume.js";

/**
 * @param {string} name
 * @param {string | undefined} value
 */
function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const FRIENDLY = "Something went wrong getting that answer. Try again.";

/**
 * @param {unknown} body
 */
function chatRequest(body) {
  return new Request("http://127.0.0.1/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  /** @type {string | undefined} */
  let previousKey;
  /** @type {string | undefined} */
  let previousModel;

  beforeEach(() => {
    previousKey = process.env.ANTHROPIC_API_KEY;
    previousModel = process.env.MODEL_ID;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.MODEL_ID;
    vi.clearAllMocks();
  });

  afterEach(() => {
    restore("ANTHROPIC_API_KEY", previousKey);
    restore("MODEL_ID", previousModel);
  });

  it("returns the friendly error when MODEL_ID is missing and does not call Claude", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const response = await POST(
      chatRequest({ messages: [{ role: "user", content: "Hi" }] }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: FRIENDLY });
    expect(body.error).toBe(FRIENDLY_CHAT_ERROR);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
    expect(runAgenticLoop).not.toHaveBeenCalled();
  });

  it("returns the friendly error when ANTHROPIC_API_KEY is missing and does not call Claude", async () => {
    process.env.MODEL_ID = "model-from-env";
    const response = await POST(
      chatRequest({ messages: [{ role: "user", content: "Hi" }] }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: FRIENDLY });
    expect(createClient).not.toHaveBeenCalled();
    expect(runAgenticLoop).not.toHaveBeenCalled();
  });

  it("returns the friendly error when both variables are missing", async () => {
    const response = await POST(
      chatRequest({ messages: [{ role: "user", content: "Hi" }] }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: FRIENDLY });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("calls the loop with MODEL_ID when configured", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.MODEL_ID = "model-from-env";
    const response = await POST(
      chatRequest({ messages: [{ role: "user", content: "Skills?" }] }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ response: "Grounded answer" });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(loadResume).not.toHaveBeenCalled();
    expect(createClient).toHaveBeenCalledWith("test-key");
    expect(runAgenticLoop).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ model: "model-from-env" }),
    );
  });

  it("returns the friendly error for a bad body", async () => {
    const response = await POST(chatRequest({ nope: true }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: FRIENDLY });
    expect(createClient).not.toHaveBeenCalled();
  });
});
