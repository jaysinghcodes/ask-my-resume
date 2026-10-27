import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import {
  MAX_TOOL_ROUNDS,
  ToolRoundLimitError,
  runAgenticLoop,
  statusTextForTool,
  streamAgenticLoop,
} from "../lib/claude.js";
import { SYSTEM_PROMPT } from "../lib/prompts.js";

/**
 * @param {string} id
 * @param {string} [preamble]
 */
function toolStream(id, preamble = "") {
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
      if (preamble) this._onText?.(preamble);
      /** @type {Array<{ type: string, text?: string, id?: string, name?: string, input?: { query: string } }>} */
      const content = [];
      if (preamble) content.push({ type: "text", text: preamble });
      content.push({
        type: "tool_use",
        id,
        name: "search_docs",
        input: { query: "skills" },
      });
      return {
        stop_reason: "tool_use",
        content,
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

  it("emits the first delta well before the answer is done", async () => {
    const gapMs = 150;
    const stream = vi.fn(() => {
      const deltas = ["Jay ", "has ", "AWS experience."];
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
            if (index > 0) await new Promise((resolve) => setTimeout(resolve, gapMs));
            const delta = deltas[index] ?? "";
            parts.push(delta);
            this._onText?.(delta);
          }
          return {
            stop_reason: "end_turn",
            content: [{ type: "text", text: parts.join("") }],
          };
        },
      };
    });
    /** @type {import("../lib/claude.js").StreamPart[]} */
    const parts = [];
    const started = performance.now();
    let firstDeltaAt = 0;
    let settled = false;
    const pending = streamAgenticLoop(
      /** @type {any} */ ({ messages: { stream } }),
      {
        systemPrompt: "system",
        messages: [{ role: "user", content: "Skills?" }],
        model: "model-from-env",
      },
      (part) => {
        if (part.type === "delta" && firstDeltaAt === 0) firstDeltaAt = performance.now();
        parts.push(part);
      },
    ).then((value) => {
      settled = true;
      return value;
    });

    await vi.waitFor(() => {
      expect(parts[0]).toEqual({ type: "delta", text: "Jay " });
    });
    expect(firstDeltaAt - started).toBeLessThan(100);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(settled).toBe(false);
    expect(parts.map((part) => part.text).join("")).not.toContain("AWS experience.");
    await expect(pending).resolves.toBe("Jay has AWS experience.");
    const doneAt = performance.now();
    expect(doneAt - firstDeltaAt).toBeGreaterThan(gapMs);
    expect(parts.filter((part) => part.type === "delta").map((part) => part.text)).toEqual([
      "Jay ",
      "has ",
      "AWS experience.",
    ]);
  });

  it("starts the final answer with a separator after text written before a tool call", async () => {
    const preamble = "Let me check the resume.";
    const stream = vi
      .fn()
      .mockImplementationOnce(() => toolStream("tool_1", preamble))
      .mockImplementationOnce(() => textStream(["The resume lists AWS."]));
    /** @type {import("../lib/claude.js").StreamPart[]} */
    const parts = [];
    const result = await streamAgenticLoop(
      /** @type {any} */ ({ messages: { stream } }),
      {
        systemPrompt: "system",
        messages: [{ role: "user", content: "Skills?" }],
        model: "model-from-env",
      },
      (part) => parts.push(part),
    );

    const deltas = parts.filter((part) => part.type === "delta").map((part) => part.text);
    expect(deltas[0]).toBe(preamble);
    expect(deltas.join("")).toBe(`${preamble}\n\nThe resume lists AWS.`);
    expect(result).toBe("\n\nThe resume lists AWS.");
    expect(parts.filter((part) => part.type === "status")).toEqual([
      { type: "status", text: "Searching project docs" },
    ]);
    expect(JSON.stringify(parts)).not.toContain("discard");
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
      expect(parts.some((part) => part.type === "delta" && part.text === "Grounded ")).toBe(true);
    });
    expect(parts[0]).toEqual({ type: "status", text: "Searching project docs" });
    expect(parts.map((part) => part.text).join("")).not.toContain("answer.");
    expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({ model: "model-from-env", max_tokens: 128 }),
      undefined,
    );
    release();
    await pending;
    expect(parts.map((part) => part.text).join("")).toContain("Grounded answer.");
    expect(parts.filter((part) => part.type === "delta").map((part) => part.text).join("")).toBe(
      "Grounded answer.",
    );
  });

  it("does not return preamble text when the tool cap is reached", async () => {
    let calls = 0;
    const preamble = "Let me check the resume.";
    const stream = vi.fn(() => {
      calls += 1;
      if (calls > MAX_TOOL_ROUNDS) throw new Error("loop continued past 5 tool rounds");
      return toolStream(`tool_${calls}`, preamble);
    });
    /** @type {import("../lib/claude.js").StreamPart[]} */
    const parts = [];
    await expect(
      streamAgenticLoop(
        /** @type {any} */ ({ messages: { stream } }),
        {
          systemPrompt: "system",
          messages: [{ role: "user", content: "Skills?" }],
          model: "model-from-env",
        },
        (part) => parts.push(part),
      ),
    ).rejects.toBeInstanceOf(ToolRoundLimitError);
    expect(stream).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
    expect(parts.filter((part) => part.type === "delta").map((part) => part.text).join("")).toContain(
      preamble,
    );
    expect(parts.filter((part) => part.type === "status")).toHaveLength(MAX_TOOL_ROUNDS);
  });

  it("tells the model to call tools without narrating first", () => {
    expect(SYSTEM_PROMPT).toContain("Call tools without narrating first.");
    expect(SYSTEM_PROMPT).toContain("Do not write text before a tool call");
  });

  it("names project doc search for search_docs and a record read for get_record", () => {
    expect(statusTextForTool("search_docs")).toBe("Searching project docs");
    expect(statusTextForTool("get_record")).toBe("Reading the record");
  });
});
