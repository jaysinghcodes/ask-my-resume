import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "../lib/prompts.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = JSON.parse(fs.readFileSync(path.join(root, "kb/profile.json"), "utf8"));

describe("chat bio and system prompt match the forward deployed hero", () => {
  it("the third person bio calls Jay a forward deployed engineer", () => {
    expect(profile.summary_third_person).toMatch(/^AI native forward deployed engineer building /);
    expect(profile.summary_third_person).not.toMatch(/^Software engineer/);
    expect(profile.summary_third_person).toContain("Based in Chicago, IL.");
  });

  it("the CapTech title stays Software Engineer Consultant", () => {
    expect(profile.current_role.title).toBe("Software Engineer Consultant");
    expect(SYSTEM_PROMPT).toContain("Software Engineer Consultant");
  });

  it("the system prompt presents Jay as a forward deployed engineer", () => {
    expect(SYSTEM_PROMPT).toContain("Jay is an AI native forward deployed engineer");
    expect(SYSTEM_PROMPT).toContain("works directly with clients");
    expect(SYSTEM_PROMPT).toContain("search_resume");
  });
});
