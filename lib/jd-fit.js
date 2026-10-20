/**
 * JD fit: the prompt, the answer shape and an answer check (Jay's ruling on #30).
 * The page sends `mode: "jd_fit"` (T7 request contract). The T7 server side wires
 * JD_FIT_PROMPT into the system prompt for that mode and can run checkJdFitAnswer on
 * the finished answer. The page applies the same rules when it lays the answer out.
 */

import { JD_FIT_SECTIONS, allowedJdHeading, reportsMissing } from "./jd-fit-rules.js";

/** Section headings, in order. There is never a Gaps section. Shared with the page. */
export { JD_FIT_SECTIONS };

export const JD_FIT_PROMPT = `The visitor pasted a job description. Compare it with Jay's experience using only the knowledge base, and cite every claim.

Answer in exactly these sections, each heading on its own line, followed by short bullets. Leave out a section that would be empty.

Strong matches
One bullet per requirement Jay clearly meets, with the evidence and a citation.

Partial matches
One bullet per requirement Jay meets in part, saying what he has done, with a citation.

Closest experience
For a requirement with no direct match, write the requirement, a colon, then the most similar real skill or work from the knowledge base, with a citation. Example: "Kubernetes: container orchestration with AWS ECS [bullet-captech-consultant-4]".
If nothing in the knowledge base is genuinely related to a requirement, leave that requirement out entirely.

Rules:
Never add a Gaps, Missing or Weaknesses section.
Never say a skill is missing, lacking, absent or not on the resume, and never use the word gap.
Never invent a skill, a tool or experience. Every bullet needs a citation to a real source.
No dash punctuation and no arrows.`;

/**
 * The answer shape the page expects, for the T7 schema and evals.
 * Each item is "text [source-id]"; Closest experience items are "Requirement: closest real skill [source-id]".
 */
export const JD_FIT_ANSWER_SCHEMA = {
  type: "object",
  required: ["sections"],
  additionalProperties: false,
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        required: ["heading", "items"],
        additionalProperties: false,
        properties: {
          heading: { enum: JD_FIT_SECTIONS },
          items: {
            type: "array",
            minItems: 1,
            items: { type: "string", pattern: "\\[[A-Za-z0-9][\\w.:-]{0,79}\\]" },
          },
        },
      },
    },
  },
};

const MARKER = /\[([A-Za-z0-9][\w.:-]{0,79})\](?!\()/g;
const MARKER_TEST = /\[[A-Za-z0-9][\w.:-]{0,79}\](?!\()/;
const DASH_OR_ARROW = /[\u2012-\u2015\u2190-\u21FF]|\s-\s|--|->|=>/;

/**
 * Parse a JD fit answer into sections of bullet items.
 * @param {string} text
 * @returns {{ heading: string, items: string[] }[]}
 */
export function parseJdFitAnswer(text) {
  /** @type {{ heading: string, items: string[] }[]} */
  const sections = [];
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const isItem = /^\s*(?:[-*\u2022]|\d+[.)])\s+/.test(line);
    const allowed = allowedJdHeading(line);
    const label = /^\*\*([^*]+)\*\*:?\s*(.*)$/.exec(line);
    if (allowed) {
      sections.push({ heading: allowed, items: [] });
      continue;
    }
    if (!isItem && label && !allowedJdHeading(label[1])) {
      sections.push({ heading: label[1].replace(/[:.\s]+$/, ""), items: label[2] ? [label[2]] : [] });
      continue;
    }
    if (!isItem && !MARKER_TEST.test(line)) {
      sections.push({ heading: line.replace(/^#{1,6}\s+/, "").replace(/\*\*/g, "").replace(/[\s:.!?]+$/, "").trim(), items: [] });
      continue;
    }
    const item = line.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s+/, "");
    if (!sections.length) sections.push({ heading: "", items: [] });
    sections[sections.length - 1].items.push(item);
  }
  return sections;
}

/**
 * Check a JD fit answer against the ruling.
 * @param {string} text
 * @param {{ sourceIds?: string[], omit?: string[] }} [options]
 *   sourceIds: the real source ids; a citation to anything else counts as invented.
 *   omit: requirements with nothing related in the knowledge base; they must not appear.
 * @returns {string[]} problems, empty when the answer passes
 */
export function checkJdFitAnswer(text, options = {}) {
  /** @type {string[]} */
  const problems = [];
  const sections = parseJdFitAnswer(text);
  if (sections.every((section) => section.items.length === 0)) problems.push("empty answer");
  for (const section of sections) {
    if (!JD_FIT_SECTIONS.includes(section.heading)) problems.push(`unexpected section "${section.heading}"`);
    for (const item of section.items) {
      const cites = [...item.matchAll(MARKER)].map((m) => m[1]);
      if (cites.length === 0) problems.push(`uncited item in ${section.heading}`);
      if (reportsMissing(item.replace(MARKER, ""))) problems.push("gap or missing wording");
      if (options.sourceIds) {
        for (const id of cites) if (!options.sourceIds.includes(id)) problems.push(`unknown source ${id}`);
      }
      if (section.heading === "Closest experience" && !/^[^:[]{1,60}:\s+\S/.test(item)) {
        problems.push("closest experience item is not \"Requirement: closest skill\"");
      }
    }
  }
  for (const section of sections) {
    if (reportsMissing(section.heading) && !problems.includes("gap or missing wording")) problems.push("gap or missing wording");
  }
  const copy = String(text ?? "").replace(/^\s*[-*\u2022]\s+/gm, "");
  if (DASH_OR_ARROW.test(copy)) problems.push("dash or arrow");
  const lower = String(text).toLowerCase();
  for (const term of options.omit || []) {
    if (lower.includes(term.toLowerCase())) problems.push(`unrelated requirement "${term}" is mentioned`);
  }
  return problems;
}
