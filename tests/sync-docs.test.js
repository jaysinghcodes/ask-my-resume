import { describe, expect, it } from "vitest";
import { literalCodeSegments, normalizeDocText, proseDashIssues } from "../lib/doc-text.js";

describe("doc text", () => {
  it("keeps a code span byte for byte and removes dashes and arrows from prose", () => {
    const span = "`gpt-4o-mini`";
    const source = `Call ${span} for the draft. Ship cloud-native code -> production.`;
    const out = normalizeDocText(source);

    expect(out).toContain(span);
    expect(literalCodeSegments(source)).toEqual([span]);
    expect(out.includes(span)).toBe(true);
    expect(out).not.toContain("cloud-native");
    expect(out).not.toContain("->");
    expect(out).toContain("cloud native");
    expect(out).toContain(" to ");
    expect(proseDashIssues(out)).toEqual([]);
  });

  it("keeps a fenced block byte for byte and removes dashes and arrows from prose", () => {
    const fence = "```bash\ncurl -H 'x-ingest-token: demo' --fail\n```";
    const source = `The well-known install <= this block.\n\n${fence}\n\nThen stop.`;
    const out = normalizeDocText(source);

    expect(out).toContain(fence);
    expect(literalCodeSegments(source)).toEqual([fence]);
    expect(out).not.toContain("well-known");
    expect(out).not.toContain("<=");
    expect(out).toContain("well known");
    expect(out).toContain("at most");
    expect(proseDashIssues(out)).toEqual([]);
  });
});
