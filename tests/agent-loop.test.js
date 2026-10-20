import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import { MAX_TOOL_ROUNDS, ToolRoundLimitError, runAgenticLoop } from "../lib/claude.js";

/**
 * @param {string} id
 */
function toolUseResponse(id) {
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
    const create = vi.fn(async (body) => {
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
      return toolUseResponse(`tool_${calls}`);
    });
    const client = { messages: { create } };

    await expect(
      runAgenticLoop(/** @type {any} */ (client), {
        systemPrompt: "system",
        messages: [{ role: "user", content: "Tell me about his AWS work" }],
        model: "model-from-env",
      }),
    ).rejects.toBeInstanceOf(ToolRoundLimitError);

    expect(create).toHaveBeenCalledTimes(5);
    expect(seen[0].model).toBe("model-from-env");
    expect(seen[0].lastRole).toBe("user");
    expect(seen[1].lastRole).toBe("user");
    expect(seen[1].lastToolId).toBe("tool_1");
    expect(seen[4].lastToolId).toBe("tool_4");
  });

  it("returns the answer when the model stops using tools", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(toolUseResponse("tool_1"))
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Jay has AWS experience." }],
      });
    const client = { messages: { create } };

    const result = await runAgenticLoop(/** @type {any} */ (client), {
      systemPrompt: "system",
      messages: [{ role: "user", content: "Skills?" }],
      model: "model-from-env",
    });

    expect(result).toBe("Jay has AWS experience.");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("rejects a missing model and does not call Claude", async () => {
    const create = vi.fn();
    const client = { messages: { create } };

    await expect(
      runAgenticLoop(/** @type {any} */ (client), {
        systemPrompt: "system",
        messages: [{ role: "user", content: "Hi" }],
        model: "",
      }),
    ).rejects.toThrow(/MODEL_ID/);
    expect(create).not.toHaveBeenCalled();
  });

  it("has no hardcoded model id", () => {
    const source = fs.readFileSync(new URL("../lib/claude.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/claude-/);
    expect(source).not.toMatch(/DEFAULT_MODEL/);
  });
});
