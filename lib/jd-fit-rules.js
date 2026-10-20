/**
 * JD fit rules shared by the page (frontend/src/ask/askModel.js) and the server side
 * check (lib/jd-fit.js), so the two can never drift apart. Pure, no imports.
 *
 * Atlas's ruling (Oct 20 2026, PR #30 r2): the page renders only the three allowed
 * headings; any other heading is dropped with all its bullets, whatever its name; any
 * item without a valid cite is dropped in every section. Missing skill wording belongs
 * to the T7 prompt and checker, and the list below stays as an extra filter.
 */

/** The only JD fit headings, in order. */
export const JD_FIT_SECTIONS = ["Strong matches", "Partial matches", "Closest experience"];

/**
 * The allowed heading a line names, or null. Case, markdown (#, **) and trailing
 * punctuation are ignored, so "### Strong matches:" is "Strong matches".
 * @param {string} line
 * @returns {string | null}
 */
export function allowedJdHeading(line) {
  const name = String(line)
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*|__/g, "")
    .replace(/[\s:.!?]+$/, "")
    .trim()
    .toLowerCase();
  return JD_FIT_SECTIONS.find((section) => section.toLowerCase() === name) ?? null;
}

/** Wording that reports a missing skill or a gap. */
export const MISSING_WORDING = new RegExp(
  [
    "\\bgaps?\\b",
    "\\bmissing\\b",
    "\\black(?:s|ing)?\\b",
    "\\babsent\\b",
    "\\bweakness(?:es)?\\b",
    "\\bareas? to (?:grow|improve)\\b",
    "\\bdevelopment areas?\\b",
    "\\bno (?:direct |hands on |prior )?experience\\b",
    "\\bwithout (?:any )?(?:\\w+ ){1,3}experience\\b",
    "\\bnever (?:used|worked)\\b",
    "\\bhas(?:n't| not)? (?:never )?(?:used|worked with)\\b",
    "\\bnot (?:yet )?familiar\\b",
    "\\bunfamiliar\\b",
    "\\bdoes(?:n't| not) have\\b",
    "\\bnot (?:listed |mentioned |shown |found )?(?:in|on) (?:the |his )?(?:knowledge base|kb|resume|experience|background)\\b",
  ].join("|"),
  "i",
);

/** "Kafka: none", "Kafka: N/A", or an item that is only none or N/A. */
const NONE_ITEM = /(?::\s*|^\s*)(?:none|n\/a|nothing|not applicable)\s*[.!]?\s*$/i;

/**
 * True when an item or line reports a missing skill. Pass the text without cite markers.
 * @param {string} text
 */
export function reportsMissing(text) {
  return MISSING_WORDING.test(text) || NONE_ITEM.test(text.trim());
}
