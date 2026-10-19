import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    constructor() {
      throw new Error("Claude client constructed");
    }
  },
}));

import { GET } from "../api/health.js";

describe("GET /api/health", () => {
  /** @type {string | undefined} */
  let previousKey;
  /** @type {string | undefined} */
  let previousModel;

  beforeEach(() => {
    previousKey = process.env.ANTHROPIC_API_KEY;
    previousModel = process.env.MODEL_ID;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.MODEL_ID;
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    restore("ANTHROPIC_API_KEY", previousKey);
    restore("MODEL_ID", previousModel);
    vi.restoreAllMocks();
  });

  it("reports configured false when MODEL_ID is unset and does not call Claude", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok", configured: false });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("reports configured false when the API key is unset and does not call Claude", async () => {
    process.env.MODEL_ID = "model-from-env";
    const response = await GET();

    expect(await response.json()).toEqual({ status: "ok", configured: false });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("reports configured true without calling Claude", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.MODEL_ID = "model-from-env";
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", configured: true });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does not import the Claude client", () => {
    const health = fs.readFileSync(new URL("../api/health.js", import.meta.url), "utf8");
    const config = fs.readFileSync(new URL("../lib/config.js", import.meta.url), "utf8");
    const healthImports = health
      .split("\n")
      .filter((line) => line.startsWith("import "))
      .join("\n");
    expect(healthImports).toBe('import { isConfigured } from "../lib/config.js";');
    expect(healthImports).not.toMatch(/anthropic|claude|runAgenticLoop|createClient/i);
    expect(config).not.toMatch(/from ["'].*anthropic|from ["'].*claude/i);
  });
});

/**
 * @param {string} name
 * @param {string | undefined} value
 */
function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
