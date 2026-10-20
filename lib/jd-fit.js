/**
 * JD fit: the prompt, the answer shape and an answer check (Jay's ruling on #30).
 * The page sends `mode: "jd_fit"` (T7 request contract). The T7 server side wires
 * JD_FIT_PROMPT into the system prompt for that mode and can run checkJdFitAnswer on
 * the finished answer. The page applies the same rules when it lays the answer out.
 */

import { JD_FIT_SECTIONS, allowedJdHeading, renderJdFit, reportsMissing, traceJdFit } from "./jd-fit-rules.js";

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

/** A KB source id cite. A bare number like [1] is not a cite (Atlas ruling, PR #30 r3). */
const MARKER = /\[([A-Za-z][\w.:-]{0,79})\](?!\()/g;
const DASH_OR_ARROW = /[\u2012-\u2015\u2190-\u21FF]|\s-\s|--|->|=>/;

/**
 * The sections and item texts the page renders for a JD fit answer, from the shared
 * parser. A thin wrapper over renderJdFit, kept for the T7 schema and evals.
 * @param {string} text
 * @param {{ sourceIds?: string[] }} [options]
 * @returns {{ heading: string, items: string[] }[]}
 */
export function parseJdFitAnswer(text, options = {}) {
  return renderedJdFit(text, options).map((section) => ({ heading: section.heading, items: section.items.map((item) => item.text) }));
}

/**
 * A short name for a line that closed a section, for the problem list.
 * @param {string} text
 */
function closerName(text) {
  return text.replace(/^\d+[.)]\s+/, "").replace(/^#{1,7}\s*/, "").replace(/^>\s*/, "").replace(/[*_]/g, "").split(":")[0].replace(/[\s.!?]+$/, "").trim();
}

/**
 * What the page renders for this answer, from the same parser the page uses: the
 * allowed sections with their cited items. With sourceIds, only those ids count as cites.
 * @param {string} text
 * @param {{ sourceIds?: string[] }} [options]
 * @returns {import("./jd-fit-rules.js").JdFitSection[]}
 */
export function renderedJdFit(text, options = {}) {
  const ids = options.sourceIds;
  return renderJdFit(text, MARKER, ids ? (id) => ids.includes(id) : undefined);
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
  /** @param {string} problem */
  const add = (problem) => {
    if (!problems.includes(problem)) problems.push(problem);
  };
  const ids = options.sourceIds;
  // The checker reads the same trace the page renders from (Atlas r4 point 4): it counts
  // only the items the page shows and flags every bullet the page dropped.
  const { sections, dropped, closers } = traceJdFit(text, MARKER, ids ? (id) => ids.includes(id) : undefined);
  if (sections.length === 0) add("empty answer");
  for (const closer of closers) {
    const name = closerName(closer);
    if (reportsMissing(closer) || reportsMissing(name)) add("gap or missing wording");
    // "> Strong matches" or "####### Strong matches" names an allowed heading, but the page
    // reads it as a closer, so it is not a heading.
    if (allowedJdHeading(name)) add(`"${closer}" is not a heading the page renders`);
    else add(`unexpected section "${name}"`);
  }
  for (const drop of dropped) {
    const cites = [...drop.text.matchAll(MARKER)].map((m) => m[1]);
    if (drop.reason === "before the first heading") add("text before the first heading");
    else if (drop.reason === "after a closer") add(`item dropped after "${drop.closer}": ${drop.text.replace(MARKER, "").trim()}`);
    else if (drop.reason === "missing wording") add("gap or missing wording");
    else if (cites.length === 0) add(`uncited item in ${drop.section}`);
    else if (ids) for (const id of cites) if (!ids.includes(id)) add(`unknown source ${id}`);
  }
  for (const section of sections) {
    for (const item of section.items) {
      if (ids) {
        for (const match of item.text.matchAll(MARKER)) if (!ids.includes(match[1])) add(`unknown source ${match[1]}`);
      }
      // "Kubernetes: ..." or the bold label form "**Kubernetes:** ...", which the page renders.
      if (section.heading === "Closest experience" && !/^[^:[]{1,60}:\s+\S/.test(item.text.replace(/\*\*|__/g, ""))) {
        add("closest experience item is not \"Requirement: closest skill\"");
      }
    }
  }
  // Bullet markers and setext underlines are markup, not copy.
  const copy = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*(?:-{3,}|={3,}|\*{3,}|_{3,})\s*$/gm, "")
    .replace(/^\s*[-*\u2022]\s+/gm, "");
  if (DASH_OR_ARROW.test(copy)) problems.push("dash or arrow");
  const lower = String(text).toLowerCase();
  for (const term of options.omit || []) {
    if (lower.includes(term.toLowerCase())) problems.push(`unrelated requirement "${term}" is mentioned`);
  }
  return problems;
}
