import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import {
  MAX_TOOL_ROUNDS,
  ToolRoundLimitError,
  runAgenticLoop,
  statusTextForTool,
  streamAgenticLoop,
} from "../lib/claude.js";

/**
 * @param {string} id
 */
function toolStream(id) {
  return {
    /** @param {string} _event @param {unknown} _listener */
    on(_event, _listener) {
      return this;
    },
    async finalMessage() {
      return {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id,
            name: "search_resume",
            input: { query: "skills" },
          },
        ],
      };
    },
  };
}

/**
 * @param {string[]} deltas
 * @param {Promise<void>} [holdAfterFirst]
 */
function textStream(deltas, holdAfterFirst) {
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
    async finalMessage() {
      /** @type {string[]} */
      const parts = [];
      for (let index = 0; index < deltas.length; index += 1) {
        const delta = deltas[index] ?? "";
        parts.push(delta);
        this._onText?.(delta);
        if (index === 0 && holdAfterFirst) await holdAfterFirst;
      }
      return {
        stop_reason: "end_turn",
        content: [{ type: "text", text: parts.join("") }],
      };
    },
  };
}

describe("runAgenticLoop", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("stops after 5 tool rounds and does not call the model again", async () => {
    expect(MAX_TOOL_ROUNDS).toBe(5);
    let calls = 0;
    /** @type {Array<{ model: string, lastRole: string, lastToolId: string }>} */
    const seen = [];
    const stream = vi.fn((body) => {
      calls += 1;
      if (calls > MAX_TOOL_ROUNDS) {
        throw new Error("loop continued past 5 tool rounds");
      }
      const messages = body.messages;
      const last = messages[messages.length - 1];
      const lastContent = Array.isArray(last.content) ? last.content[0] : null;
      seen.push({
        model: body.model,
        lastRole: last.role,
        lastToolId: lastContent && lastContent.tool_use_id ? lastContent.tool_use_id : "",
      });
      return toolStream(`tool_${calls}`);
    });
    const client = { messages: { stream } };

    await expect(
      runAgenticLoop(/** @type {any} */ (client), {
        systemPrompt: "system",
        messages: [{ role: "user", content: "Tell me about his AWS work" }],
        model: "model-from-env",
      }),
    ).rejects.toBeInstanceOf(ToolRoundLimitError);

    expect(stream).toHaveBeenCalledTimes(5);
    expect(seen[0]?.model).toBe("model-from-env");
    expect(seen[0]?.lastRole).toBe("user");
    expect(seen[1]?.lastRole).toBe("user");
    expect(seen[1]?.lastToolId).toBe("tool_1");
    expect(seen[4]?.lastToolId).toBe("tool_4");
  });

  it("returns the answer when the model stops using tools", async () => {
    const stream = vi
      .fn()
      .mockImplementationOnce(() => toolStream("tool_1"))
      .mockImplementationOnce(() => textStream(["Jay has AWS experience."]));
    const client = { messages: { stream } };

    const result = await runAgenticLoop(/** @type {any} */ (client), {
      systemPrompt: "system",
      messages: [{ role: "user", content: "Skills?" }],
      model: "model-from-env",
    });

    expect(result).toBe("Jay has AWS experience.");
    expect(stream).toHaveBeenCalledTimes(2);
  });

  it("rejects a missing model and does not call Claude", async () => {
    const stream = vi.fn();
    const client = { messages: { stream } };

    await expect(
      runAgenticLoop(/** @type {any} */ (client), {
        systemPrompt: "system",
        messages: [{ role: "user", content: "Hi" }],
        model: "",
      }),
    ).rejects.toThrow(/MODEL_ID/);
    expect(stream).not.toHaveBeenCalled();
  });

  it("has no hardcoded model id", () => {
    const source = fs.readFileSync(new URL("../lib/claude.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/claude-/);
    expect(source).not.toMatch(/DEFAULT_MODEL/);
  });
});

describe("streamAgenticLoop", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("emits text deltas before the answer finishes and does not repeat them", async () => {
    /** @type {(value?: void) => void} */
    let release = () => {};
    const hold = new Promise((resolve) => {
      release = resolve;
    });
    const stream = vi.fn(() => textStream(["Jay ", "has AWS experience."], hold));
    /** @type {import("../lib/claude.js").StreamPart[]} */
    const parts = [];
    const pending = streamAgenticLoop(
      /** @type {any} */ ({ messages: { stream } }),
      {
        systemPrompt: "system",
        messages: [{ role: "user", content: "Skills?" }],
        model: "model-from-env",
      },
      (part) => parts.push(part),
    );

    await vi.waitFor(() => {
      expect(parts).toEqual([{ type: "delta", text: "Jay " }]);
    });
    release();
    await expect(pending).resolves.toBe("Jay has AWS experience.");
    expect(parts).toEqual([
      { type: "delta", text: "Jay " },
      { type: "delta", text: "has AWS experience." },
    ]);
  });

  it("emits status while a tool runs, then streams the final text", async () => {
    /** @type {(value?: void) => void} */
    let release = () => {};
    const hold = new Promise((resolve) => {
      release = resolve;
    });
    const stream = vi
      .fn()
      .mockImplementationOnce(() => toolStream("tool_1"))
      .mockImplementationOnce(() => textStream(["Grounded ", "answer."], hold));
    /** @type {import("../lib/claude.js").StreamPart[]} */
    const parts = [];
    const pending = streamAgenticLoop(
      /** @type {any} */ ({ messages: { stream } }),
      {
        systemPrompt: "system",
        messages: [{ role: "user", content: "Skills?" }],
        model: "model-from-env",
        maxTokens: 128,
        maxToolRounds: 5,
      },
      (part) => parts.push(part),
    );

    await vi.waitFor(() => {
      expect(parts.some((part) => part.type === "delta")).toBe(true);
    });
    expect(parts[0]).toEqual({ type: "status", text: "Searching the resume" });
    expect(parts.map((part) => ("text" in part ? part.text : "")).join("")).not.toContain("answer.");
    expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({ model: "model-from-env", max_tokens: 128 }),
      undefined,
    );
    release();
    await pending;
    expect(parts.map((part) => part.text).join("")).toContain("Grounded answer.");
  });

  it("names project doc search for a tool other than the resume", () => {
    expect(statusTextForTool("search_docs")).toBe("Searching project docs");
  });
});
