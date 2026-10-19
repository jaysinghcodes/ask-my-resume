import { describe, expect, it } from "vitest";
import { getResumeText, loadResume, resolveResumePath } from "../lib/resume.js";

describe("resume loader", () => {
  it("reads mcp-server/resume.pdf", async () => {
    const filePath = resolveResumePath();
    expect(filePath).toMatch(/mcp-server\/resume\.pdf$/);
    const text = await loadResume(filePath);
    expect(text.length).toBeGreaterThan(100);
    expect(getResumeText()).toBe(text);
    expect(text).toMatch(/SINGH/);
    expect(text).toMatch(/CapTech/);
  });
});
