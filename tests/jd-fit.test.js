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
} from "../lib/jd-fit.js";
import { JD_FIT_SECTIONS as PAGE_SECTIONS } from "../frontend/src/ask/askModel.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(fs.readFileSync(path.join(root, "evals/jd-fit.cases.json"), "utf8")).cases;
const sourceIds = [
  ...kb.bullets.map((/** @type {{ id: string }} */ b) => b.id),
  ...kb.projects.map((/** @type {{ id: string }} */ p) => p.id),
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
