import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT, buildSystem, coreKbText } from "../lib/prompts.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = JSON.parse(fs.readFileSync(path.join(root, "kb/profile.json"), "utf8"));

describe("chat bio matches the forward deployed hero (T7: the KB block carries the facts)", () => {
  it("the third person bio calls Jay a forward deployed engineer", () => {
    expect(profile.summary_third_person).toMatch(/^AI native forward deployed engineer building /);
    expect(profile.summary_third_person).not.toMatch(/^Software engineer/);
    expect(profile.summary_third_person).toContain("Based in Chicago, IL.");
  });

  it("the CapTech title stays Software Engineer Consultant in the KB block", () => {
    expect(profile.current_role.title).toBe("Software Engineer Consultant");
    expect(coreKbText()).toContain("Software Engineer Consultant");
  });

  it("the cached KB block presents Jay as a forward deployed engineer", () => {
    const kb = coreKbText();
    expect(kb).toContain("AI native forward deployed engineer");
    expect(kb).toContain("working directly with clients");
    const blocks = buildSystem();
    expect(blocks[1].text).toBe(kb);
    expect(blocks[1].cache_control).toEqual({ type: "ephemeral" });
  });

  it("the behavior prompt carries no resume facts", () => {
    for (const fact of ["forward deployed", "CapTech", "Software Engineer Consultant", "Chicago", "Ohio State", "$", "%", "Cleat", "Mission Control"]) {
      expect(SYSTEM_PROMPT).not.toContain(fact);
    }
    expect(SYSTEM_PROMPT).not.toMatch(/\b20\d\d\b/);
  });
});
