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

const ITEM = /^(\s*)(?:([-*+\u2022\u25e6\u25aa\u2023])|(\d+[.)]))\s+(.*)$/;
/** A setext underline or a thematic break: three or more of one of - = * _. */
const SETEXT_UNDERLINE = /^(?:-{3,}|={3,}|\*{3,}|_{3,})$/;
const BARE_NUMBER = /\[\d+\](?!\()/g;
const ALLOWED_LINE = new RegExp(
  `^(?:#{1,6}\\s+)?(?:\\*\\*|__|\\*|_)?(${JD_FIT_SECTIONS.join("|")})(?:\\s*\\(\\d+\\))?\\s*([:.])?\\s*(?:\\*\\*|__|\\*|_)?\\s*([:.])?\\s*(.*)$`,
  "i",
);

/**
 * The allowed heading a line names, or null, ignoring cites (pass the line with them
 * stripped). Case, markdown (# to ######, **, __, *, _), a count like "(2)" and trailing
 * colons or periods are ignored, so "### Strong matches:" and "Strong matches (2)" are
 * "Strong matches". A bullet is never a heading.
 * @param {string} line
 * @returns {string | null}
 */
export function allowedJdHeading(line) {
  const parsed = parseAllowed(String(line).trim());
  return parsed && !parsed.rest ? parsed.heading : null;
}

/**
 * @param {string} line trimmed, cites stripped
 * @returns {{ heading: string, rest: string } | null}
 */
function parseAllowed(line) {
  if (ITEM.test(line)) return null;
  const match = ALLOWED_LINE.exec(line);
  if (!match) return null;
  const heading = JD_FIT_SECTIONS.find((section) => section.toLowerCase() === match[1].toLowerCase()) ?? null;
  const rest = match[4].trim();
  // Text after the heading only counts as inline items after a colon ("**Strong matches:** AWS").
  if (rest && !(match[2] === ":" || match[3] === ":")) return null;
  return heading ? { heading, rest } : null;
}

/**
 * @typedef {{ kind: "heading", heading: string }
 *   | { kind: "item", text: string, indent: string, numbered: boolean, open: boolean }
 *   | { kind: "closer", text: string }} JdFitLine
 * @typedef {{ heading: string, items: { text: string, indent: string, numbered: boolean }[] }} JdFitSection
 */

/**
 * The one JD fit parser, shared by the page (jdFitText in frontend/src/ask/askModel.js)
 * and the T7 checker (lib/jd-fit.js). It fails closed (Atlas ruling, PR #30 r4):
 *   an allowed heading opens a section (r3 tolerance: case, # level, bold, a trailing
 *     colon or period, a trailing count, a bare [1]); "**Strong matches:** AWS [id]" is
 *     the heading plus one item;
 *   a bullet or numbered line is an item of the open section, if there is one;
 *   a numbered line with a bullet right under it (at any level) is a heading,
 *     cited or not, so it closes the section;
 *   any other line closes the section, cited or not: a plain sentence, a line ending in
 *     a colon, "Not a fit [id]", a cited plain line, the line above a setext underline.
 *     It never renders, and nothing renders until the next allowed heading;
 *   blank lines and setext underlines or thematic breaks (---, ===, ***) are markup.
 * CRLF and lone CR are read as LF.
 * @param {string} text
 * @param {RegExp} citePattern global pattern matching one cite
 * @returns {JdFitLine[]}
 */
export function walkJdFit(text, citePattern) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  /** @type {JdFitLine[]} */
  const out = [];
  // A bare number like [1] is not a cite (Atlas r3 point 2), so it is ignored when a line
  // is matched against the allowlist: "Strong matches [1]" is "Strong matches".
  const strip = (/** @type {string} */ value) =>
    value.replace(citePattern, "").replace(BARE_NUMBER, "").replace(/\s+([.,;:!?])/g, "$1").trim();
  let open = false;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.trim();
    if (!line || SETEXT_UNDERLINE.test(line)) continue;
    const plain = strip(line);
    const allowed = parseAllowed(plain);
    if (allowed) {
      out.push({ kind: "heading", heading: allowed.heading });
      open = true;
      if (allowed.rest) {
        // Keep the cites with the inline item: they follow the colon in the raw line.
        const colon = line.indexOf(":");
        const rest = colon >= 0 ? line.slice(colon + 1).replace(/^\s*(?:\*\*|__|\*|_)\s*/, "").trim() : allowed.rest;
        out.push({ kind: "item", text: rest, indent: "", numbered: false, open });
      }
      continue;
    }
    const item = ITEM.exec(raw);
    if (item && item[3]) {
      const next = lines.slice(index + 1).find((value) => value.trim());
      const nextItem = next ? ITEM.exec(next) : null;
      // Any bullet right under it, nested or not: fail closed (Atlas r4 point 3).
      if (nextItem && nextItem[2]) item.length = 0;
    }
    if (item && item.length) {
      out.push({ kind: "item", text: item[4], indent: item[1], numbered: Boolean(item[3]), open });
      continue;
    }
    out.push({ kind: "closer", text: plain });
    open = false;
  }
  return out;
}

/**
 * What the page renders: the allowed sections in order, each with its items that have a
 * valid cite and don't report a missing skill. Empty sections are left out.
 * @param {string} text
 * @param {RegExp} citePattern global pattern matching one cite, group 1 the cite key
 * @param {(key: string) => boolean} [isValid] whether a cite key is a real source
 * @returns {JdFitSection[]}
 */
export function renderJdFit(text, citePattern, isValid = () => true) {
  /** @type {JdFitSection[]} */
  const sections = [];
  /** @type {JdFitSection | null} */
  let current = null;
  for (const line of walkJdFit(text, citePattern)) {
    if (line.kind === "heading") {
      current = { heading: line.heading, items: [] };
      sections.push(current);
    } else if (line.kind === "closer") {
      current = null;
    } else if (line.open && current) {
      const keys = [...line.text.matchAll(citePattern)].map((match) => match[1]);
      if (!keys.some(isValid)) continue;
      if (reportsMissing(line.text.replace(citePattern, "").replace(BARE_NUMBER, ""))) continue;
      // A bare [1] is not a cite and never shows on the page, so it isn't item text either.
      current.items.push({ text: line.text.replace(BARE_NUMBER, "").replace(/\s+([.,;:!?])/g, "$1").trim(), indent: line.indent, numbered: line.numbered });
    }
  }
  return sections.filter((section) => section.items.length > 0);
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
