/**
 * Citations for chat answers (T7). The model ends each claim with [record id]. This
 * module maps ids to the labels and link targets the page shows in its Sources list,
 * drops any id that is not a public KB record, and holds the dash safety net.
 */

import { getRecords, isEarlierResume } from "./kb-data.js";

/** A KB id cite. A bare number like [1] is not a cite (Atlas ruling, PR #30 r3). */
export const CITE_PATTERN = /\[([A-Za-z][\w.:-]{0,79})\](?!\()/g;

/** @typedef {{ id: string, label: string, href?: string }} AnswerSource */

/**
 * A doc title in label case: plain capitalized words go lower case ("Architecture" to
 * "architecture"), while acronyms and names like API, README and OpenClaw stay as written.
 * @param {string | undefined} value
 */
function lower(value) {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .map((word) => (/^[A-Z][a-z]+$/.test(word) ? word.toLowerCase() : word))
    .join(" ");
}

/**
 * The Sources label and link for one record id, or null when the id is not a public record.
 * @param {string} id
 * @returns {AnswerSource | null}
 */
export function sourceFor(id) {
  const records = getRecords();
  const entry = records.get(id);
  if (!entry) return null;
  const { kind, record } = entry;
  /** @param {string} roleId */
  const roleOf = (roleId) => records.get(roleId)?.record ?? {};
  switch (kind) {
    case "bullet": {
      const role = roleOf(record.role_id);
      if (isEarlierResume(record)) return { id, label: `Earlier resume · ${role.employer}`, href: `#${record.role_id}` };
      return { id, label: `Resume · ${role.employer}, ${role.title} · bullet ${record.order}`, href: `#${record.role_id}` };
    }
    case "role":
      if (isEarlierResume(record)) return { id, label: `Earlier resume · ${record.employer}`, href: `#${id}` };
      return { id, label: `Resume · ${record.employer}, ${record.title}`, href: `#${id}` };
    case "project":
      return { id, label: `${record.name} · project`, href: `#${id}` };
    case "doc":
      return { id, label: `${record.project} · ${lower(record.title)} doc`, href: record.url };
    case "skill":
      return { id, label: `Resume · skills · ${record.display_name || record.name}`, href: "#skills" };
    case "education":
      return { id, label: `Resume · ${record.school}`, href: `#${id}` };
    case "achievement":
      return { id, label: `Achievement · ${record.title}` };
    case "certification":
      return { id, label: `Certification · ${record.name || record.title || id}` };
    case "faq":
      return { id, label: `Jay's answers · ${record.question}` };
    case "profile":
      return { id, label: "Profile" };
    case "source":
      return { id, label: record.title || "Resume" };
    default:
      return null;
  }
}

/**
 * Sources for a finished answer, in order of first citation. Unknown ids are dropped.
 * @param {string} text
 * @returns {AnswerSource[]}
 */
export function sourcesForAnswer(text) {
  /** @type {AnswerSource[]} */
  const out = [];
  const seen = new Set();
  for (const match of String(text ?? "").matchAll(CITE_PATTERN)) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const source = sourceFor(id);
    if (source) out.push(source);
  }
  return out;
}

const DASH = /\s*[\u2013\u2014]\s*/g;

/**
 * The stream's dash safety net (#6 ruling): an em or en dash becomes a comma and a
 * space. It works on deltas, so a dash at the end of one chunk and the space at the
 * start of the next don't leave a double space. T8 measures the model before this step.
 * @returns {(text: string) => string}
 */
export function createDashNet() {
  let afterDash = false;
  return (text) => {
    let out = String(text ?? "");
    if (afterDash) out = out.replace(/^\s+/, "");
    if (!out) return out;
    out = out.replace(DASH, ", ");
    afterDash = /, $/.test(out) && /[\u2013\u2014]\s*$/.test(text);
    return out;
  };
}
