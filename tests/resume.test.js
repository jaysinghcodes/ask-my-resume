import { describe, expect, it } from "vitest";
import { getResumeText, loadResume, resolveResumePath } from "../lib/resume.js";

describe("resume loader", () => {
  it("reads the phone free Oct 2026 resume PDF", async () => {
    const filePath = resolveResumePath();
    expect(filePath).toMatch(/frontend\/public\/Jay-Singh-Resume-Oct-2026\.pdf$/);
    const text = await loadResume(filePath);
    expect(text.length).toBeGreaterThan(100);
    expect(getResumeText()).toBe(text);
    expect(text).toMatch(/SINGH/);
    expect(text).toMatch(/CapTech/);
  });
});
