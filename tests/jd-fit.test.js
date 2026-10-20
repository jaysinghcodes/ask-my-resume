import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import kb from "../kb/kb.json";
import {
  JD_FIT_ANSWER_SCHEMA,
  JD_FIT_PROMPT,
  JD_FIT_SECTIONS,
  checkJdFitAnswer,
  parseJdFitAnswer,
  renderedJdFit,
} from "../lib/jd-fit.js";
import { JD_FIT_SECTIONS as PAGE_SECTIONS, layoutAnswer, normalizeSources } from "../frontend/src/ask/askModel.js";
import { allowedJdHeading, reportsMissing, traceJdFit } from "../lib/jd-fit-rules.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(fs.readFileSync(path.join(root, "evals/jd-fit.cases.json"), "utf8")).cases;
const sourceIds = [
  ...kb.bullets.map((/** @type {{ id: string }} */ b) => b.id),
  ...kb.projects.map((/** @type {{ id: string }} */ p) => p.id),
  ...kb.roles.map((/** @type {{ id: string }} */ r) => r.id),
];

describe("JD fit prompt and answer shape", () => {
  it("uses Strong matches, Partial matches and Closest experience, on the page too", () => {
    expect(JD_FIT_SECTIONS).toEqual(["Strong matches", "Partial matches", "Closest experience"]);
    expect(PAGE_SECTIONS).toEqual(JD_FIT_SECTIONS);
    expect(JD_FIT_ANSWER_SCHEMA.properties.sections.items.properties.heading.enum).toEqual(JD_FIT_SECTIONS);
  });

  it("tells the model to name the closest real skill, omit unrelated ones and never report gaps", () => {
    for (const section of JD_FIT_SECTIONS) expect(JD_FIT_PROMPT).toContain(`\n${section}\n`);
    expect(JD_FIT_PROMPT).toContain("Kubernetes: container orchestration with AWS ECS [bullet-captech-consultant-4]");
    expect(JD_FIT_PROMPT).toMatch(/genuinely related to a requirement, leave that requirement out entirely/);
    expect(JD_FIT_PROMPT).toMatch(/Never add a Gaps, Missing or Weaknesses section/);
    expect(JD_FIT_PROMPT).toMatch(/Never invent a skill/);
    expect(JD_FIT_PROMPT).not.toMatch(/^Gaps$/m);
    expect(JD_FIT_PROMPT).not.toMatch(/[\u2012-\u2015\u2190-\u21FF]|\s-\s|->|=>/);
  });

  it("cites a real KB record for the Kubernetes example", () => {
    const bullet = kb.bullets.find((/** @type {{ id: string }} */ b) => b.id === "bullet-captech-consultant-4");
    expect(bullet?.display_text).toMatch(/ECS/);
  });

  it("parses sections and items", () => {
    expect(parseJdFitAnswer("Strong matches\n- AWS [a]\n\nClosest experience\n- K8s: ECS [b]")).toEqual([
      { heading: "Strong matches", items: ["AWS [a]"] },
      { heading: "Closest experience", items: ["K8s: ECS [b]"] },
    ]);
  });
});

describe("JD fit evals", () => {
  for (const evalCase of cases) {
    it(`${evalCase.id}: the good answer passes`, () => {
      expect(checkJdFitAnswer(evalCase.good_answer, { sourceIds, omit: evalCase.expect.omit })).toEqual([]);
      for (const [requirement, source] of Object.entries(evalCase.expect.closest)) {
        expect(evalCase.good_answer).toMatch(new RegExp(`${requirement}: [^\\n]+\\[${source}\\]`));
        expect(sourceIds).toContain(source);
      }
    });

    it(`${evalCase.id}: every bad answer is caught`, () => {
      for (const bad of evalCase.bad_answers) {
        expect(checkJdFitAnswer(bad, { sourceIds, omit: evalCase.expect.omit }), bad).not.toEqual([]);
      }
    });
  }

  it("Sentinel r2 probes: each bad case is flagged for the right reason", () => {
    const opts = { sourceIds, omit: ["CPA", "Certified public accountant"] };
    const C4 = "[bullet-captech-consultant-4]";
    /** @type {[string, string][]} */
    const expected = [
      [`Strong matches\n- AWS ${C4}\n\nGaps\n- Kafka`, 'unexpected section "Gaps"'],
      [`## Strong matches\n- AWS ${C4}\n\n## Gaps:\n- Kafka`, 'unexpected section "Gaps"'],
      [`**Strong matches**\n- AWS ${C4}\n**Gaps:** Kafka, Rust`, 'unexpected section "Gaps"'],
      [`Strong matches\n- AWS ${C4}\nGaps.\n- Kafka ${C4}`, 'unexpected section "Gaps"'],
      [`Strong matches\n- AWS ${C4}\n\nGap analysis\n- Kafka\n- Rust`, 'unexpected section "Gap analysis"'],
      [`Strong matches\n- AWS ${C4}\n\nWeaknesses\n- Kafka`, 'unexpected section "Weaknesses"'],
      [`Strong matches\n- AWS ${C4}\n\nweakness\n- Kafka ${C4}`, 'unexpected section "weakness"'],
      [`Strong matches\n- AWS ${C4}\n\nAreas to grow\n- Kafka ${C4}`, 'unexpected section "Areas to grow"'],
      [`Strong matches\n- AWS ${C4}\n\nDevelopment areas\n- Kafka ${C4}`, 'unexpected section "Development areas"'],
      [`Strong matches\n- AWS ${C4}\n\nMissing skills\n- Kafka ${C4}`, 'unexpected section "Missing skills"'],
      [`Strong matches\n- AWS ${C4}\n\nNot a fit\n- Kafka ${C4}`, 'unexpected section "Not a fit"'],
      ["Strong matches\n- Kafka\n- Rust", "uncited item in Strong matches"],
      [`Partial matches\n- Go ${C4}\n- Rust`, "uncited item in Partial matches"],
      [`Partial matches\n- He has never used Kafka ${C4}`, "gap or missing wording"],
      [`Partial matches\n- Not familiar with Kafka yet ${C4}`, "gap or missing wording"],
      [`Partial matches\n- Without Kafka experience, he used AWS SQS ${C4}`, "gap or missing wording"],
      [`Partial matches\n- Kafka is not listed in his experience ${C4}`, "gap or missing wording"],
      [`Partial matches\n- Kafka is absent from his background ${C4}`, "gap or missing wording"],
      [`Closest experience\n- Kafka: none ${C4}`, "gap or missing wording"],
      [`Closest experience\n- Kafka: N/A ${C4}`, "gap or missing wording"],
      [`Closest experience\n- None ${C4}`, "gap or missing wording"],
      [`Closest experience\n- N/A ${C4}`, "gap or missing wording"],
      ["", "empty answer"],
      ["Strong matches\n\nClosest experience", "empty answer"],
      ["Strong matches\n- AWS [docs](https://example.com)", "uncited item in Strong matches"],
      ["Strong matches\n- AWS (bullet-captech-consultant-4)", "uncited item in Strong matches"],
      ["Strong matches\n- AWS [bullet-captech-consultant-99]", "unknown source bullet-captech-consultant-99"],
    ];
    for (const [text, problem] of expected) expect(checkJdFitAnswer(text, opts), text).toContain(problem);
    for (const good of [
      "Strong matches\n1. AWS Lambda [bullet-captech-consultant-3]",
      "### Strong matches:\n- AWS [bullet-captech-consultant-3]",
    ]) {
      expect(checkJdFitAnswer(good, opts), good).toEqual([]);
    }
  });

  it("Atlas r3: cited unknown headings and bare numbers are flagged, robust headings pass", () => {
    const opts = { sourceIds };
    const C4 = "[bullet-captech-consultant-4]";
    expect(checkJdFitAnswer(`Strong matches\n- AWS ${C4}\n\nNot a fit [role-osu-wexner]\n- Kafka: used SQS instead [project-cleat]`, opts)).toContain('unexpected section "Not a fit"');
    expect(checkJdFitAnswer(`Strong matches\n- AWS ${C4}\n\nConcerns: [role-osu-wexner]\n- Kafka: used SQS instead [project-cleat]`, opts)).toContain('unexpected section "Concerns"');
    expect(checkJdFitAnswer("Strong matches\n- AWS [1]")).toContain("uncited item in Strong matches");
    expect(checkJdFitAnswer(`Overall a solid fit ${C4}.\n\nStrong matches\n- AWS ${C4}`, opts)).toContain('unexpected section "Overall a solid fit"');
    expect(checkJdFitAnswer(`- AWS ${C4}\n\nStrong matches\n- Go ${C4}`, opts)).toContain("text before the first heading");
    for (const good of [
      `Strong matches (2)\n- AWS ${C4}\n- Go [project-cleat]`,
      `**Strong matches:** AWS ${C4}`,
      `## strong matches\n- AWS ${C4}`,
    ]) {
      expect(checkJdFitAnswer(good, opts), good).toEqual([]);
    }
  });

  describe("shared JD fit fixtures (Atlas ruling, PR #30 r4): the checker gives exactly these items", () => {
    const shared = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/jd-fit-shared.json"), "utf8"));
    const ids = /** @type {Record<string, string>} */ (shared.ids);
    /** @param {string} text */
    const fill = (text) => text.replace(/\{(\w+)\}/g, (_m, key) => `[${ids[key]}]`);
    /** @param {string} value */
    const norm = (value) =>
      value.replace(/\[[A-Za-z][\w.:-]{0,79}\](?!\()/g, "").replace(/\*\*|__/g, "").replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
    for (const fixture of shared.fixtures) {
      it(`${fixture.id} (${fixture.rule})`, () => {
        const text = fill(fixture.text);
        const got = renderedJdFit(text, { sourceIds }).map((section) => ({ heading: section.heading, items: section.items.map((item) => norm(item.text)) }));
        expect(got).toEqual(fixture.sections);
        const problems = checkJdFitAnswer(text, { sourceIds });
        if (fixture.checker === "pass") expect(problems, fixture.id).toEqual([]);
        else expect(problems.length, fixture.id).toBeGreaterThan(0);
      });
    }
  });

  it("never passes an answer whose bullets the page drops (r5 QA F1)", () => {
    const shared = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/jd-fit-shared.json"), "utf8"));
    const ids = /** @type {Record<string, string>} */ (shared.ids);
    const texts = [
      ...shared.fixtures.map((/** @type {{ text: string }} */ f) => f.text.replace(/\{(\w+)\}/g, (_m, key) => `[${ids[key]}]`)),
      ...cases.flatMap((evalCase) => [evalCase.good_answer, ...evalCase.bad_answers]),
    ];
    for (const text of texts) {
      const trace = traceJdFit(text, /\[([A-Za-z][\w.:-]{0,79})\](?!\()/g, (id) => sourceIds.includes(id));
      if (checkJdFitAnswer(text, { sourceIds }).length === 0) {
        expect(trace.dropped, text).toEqual([]);
        expect(trace.closers, text).toEqual([]);
      }
    }
    expect(parseJdFitAnswer("> Strong matches\n- AWS [bullet-captech-consultant-4]", { sourceIds })).toEqual([]);
    expect(checkJdFitAnswer("> Strong matches\n- AWS [bullet-captech-consultant-4]", { sourceIds })).toContain(
      'item dropped after "> Strong matches": AWS',
    );
  });

  it("page and checker import the same parser", () => {
    const page = fs.readFileSync(path.join(root, "frontend/src/ask/askModel.js"), "utf8");
    const checker = fs.readFileSync(path.join(root, "lib/jd-fit.js"), "utf8");
    expect(page).toMatch(/import \{[^}]*\brenderJdFit\b[^}]*\} from "\.\.\/\.\.\/\.\.\/lib\/jd-fit-rules\.js"/);
    expect(checker).toMatch(/import \{[^}]*\brenderJdFit\b[^}]*\btraceJdFit\b[^}]*\} from "\.\/jd-fit-rules\.js"/);
    // The checker counts items only through the shared trace, never through its own walk.
    expect(checker).not.toMatch(/\bwalkJdFit\b/);
    expect(page).not.toMatch(/function walkJdFit|HEADING_HINT/);
  });

  it("shares one rules module with the page", () => {
    expect(fs.readFileSync(path.join(root, "lib/jd-fit.js"), "utf8")).toContain('from "./jd-fit-rules.js"');
    expect(fs.readFileSync(path.join(root, "frontend/src/ask/askModel.js"), "utf8")).toContain('from "../../../lib/jd-fit-rules.js"');
    expect(reportsMissing("Kafka: N/A")).toBe(true);
    expect(reportsMissing("Kubernetes: container orchestration with AWS ECS")).toBe(false);
    expect(allowedJdHeading("### closest experience:")).toBe("Closest experience");
    expect(allowedJdHeading("Gap analysis")).toBe(null);
  });

  it("renders no bad eval answer with an unknown heading or an uncited item", () => {
    const page = normalizeSources(sourceIds.map((id) => ({ id, label: id, href: "#x" })));
    for (const evalCase of cases) {
      for (const bad of evalCase.bad_answers) {
        const { blocks } = layoutAnswer(bad, page, { jdFit: true });
        for (const block of blocks) {
          if (block.type === "heading") expect(JD_FIT_SECTIONS, bad).toContain(block.inline.map((p) => ("text" in p ? p.text : "")).join(""));
          const groups = "items" in block ? block.items : block.type === "heading" ? [] : [block.inline];
          for (const parts of groups) expect(parts.some((p) => p.type === "cite"), bad).toBe(true);
        }
        expect(JSON.stringify(blocks), bad).not.toMatch(/gap|weakness|areas to grow|development areas|missing|not a fit/i);
      }
    }
  });

  it("flags gap wording, uncited items, invented sources and unrelated requirements", () => {
    const opts = { sourceIds, omit: ["CPA"] };
    expect(checkJdFitAnswer("Gaps\n- Kafka [bullet-captech-consultant-4]", opts)).toEqual(
      expect.arrayContaining(['unexpected section "Gaps"', "gap or missing wording"]),
    );
    expect(checkJdFitAnswer("Strong matches\n- Kafka is missing [bullet-captech-consultant-4]", opts)).toContain("gap or missing wording");
    expect(checkJdFitAnswer("Strong matches\n- AWS", opts)).toContain("uncited item in Strong matches");
    expect(checkJdFitAnswer("Strong matches\n- AWS [not-real]", opts)).toContain("unknown source not-real");
    expect(checkJdFitAnswer("Closest experience\n- CPA: finance work [bullet-captech-consultant-2]", opts)).toContain(
      'unrelated requirement "CPA" is mentioned',
    );
    expect(checkJdFitAnswer("Closest experience\n- containers with ECS [bullet-captech-consultant-4]", opts)).toContain(
      'closest experience item is not "Requirement: closest skill"',
    );
  });
});
