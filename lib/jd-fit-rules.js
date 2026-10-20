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

/** Words that mark a short line as a heading of its own, not an intro sentence. */
const HEADING_HINT =
  /\b(gaps?|missing|lack\w*|weak\w*|concerns?|risks?|improv\w*|grow\w*|develop\w*|fit|caveats?|limitations?|shortfalls?|unmatched|absent|unknown|other|additional|notes?|consider\w*|areas?|summary|verdict|recommendation)\b/i;

/**
 * Walk a JD fit answer the way a structured parser would (Atlas ruling, PR #30 r3).
 * Cites are stripped first, then each line is one of:
 *   heading: an allowed heading (with any inline items after its colon);
 *   item: a bullet or numbered item;
 *   intro: an uncited plain sentence (4 words or more, no markdown, no heading words),
 *     dropped on its own (Atlas r3 point 3);
 *   unknown: any other uncited line, or a cited line that starts a block (a markdown
 *     heading, a bold line, a line ending in a colon, a table or html line, or a line
 *     followed by bullets), so "Not a fit [id]" is an unknown heading (Atlas r3 point 1);
 *   item: also a cited plain line that starts no block, so a cited item under an
 *     allowed heading is never dropped for its formatting.
 * An uncited numbered line followed by a bullet is a numbered heading, so it is unknown.
 * @param {string} text
 * @param {RegExp} citePattern global pattern matching one cite
 * @returns {Array<{ kind: "heading", heading: string } | { kind: "item", text: string, indent: string, numbered: boolean, cited: boolean } | { kind: "intro" | "unknown", text: string }>}
 */
export function walkJdFit(text, citePattern) {
  const lines = String(text ?? "").split("\n");
  /** @type {ReturnType<typeof walkJdFit>} */
  const out = [];
  const strip = (/** @type {string} */ value) => value.replace(citePattern, "").replace(/\s+([.,;:!?])/g, "$1").trim();
  const isCited = (/** @type {string} */ value) => {
    citePattern.lastIndex = 0;
    const found = citePattern.test(value);
    citePattern.lastIndex = 0;
    return found;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.trim();
    if (!line) continue;
    const plain = strip(line);
    const allowed = parseAllowed(plain);
    if (allowed) {
      out.push({ kind: "heading", heading: allowed.heading });
      if (allowed.rest) {
        // Keep the cites with the inline items: they follow the colon in the raw line.
        const colon = line.indexOf(":");
        const rest = colon >= 0 ? line.slice(colon + 1).replace(/^\s*(?:\*\*|__|\*|_)\s*/, "").trim() : allowed.rest;
        out.push({ kind: "item", text: rest, indent: "", numbered: false, cited: isCited(rest) });
      }
      continue;
    }
    const item = ITEM.exec(raw);
    if (item) {
      const cited = isCited(item[4]);
      if (item[3] && !cited) {
        const next = lines.slice(index + 1).find((value) => value.trim());
        const nextItem = next ? ITEM.exec(next) : null;
        if (nextItem && nextItem[2] && nextItem[1].length <= item[1].length) {
          out.push({ kind: "unknown", text: strip(item[4]) });
          continue;
        }
      }
      out.push({ kind: "item", text: item[4], indent: item[1], numbered: Boolean(item[3]), cited });
      continue;
    }
    const words = plain.split(/\s+/).filter(Boolean);
    const cited = isCited(line);
    const intro =
      !cited && words.length >= 4 && /^[A-Za-z]/.test(plain) && !/[*_#<>|`]/.test(plain) && !HEADING_HINT.test(plain);
    if (intro) {
      // Atlas r3 point 3: an uncited intro line drops only itself.
      out.push({ kind: "intro", text: plain });
      continue;
    }
    if (!cited) {
      out.push({ kind: "unknown", text: plain });
      continue;
    }
    // Atlas r3 point 1: a cited line that starts a block is still a heading.
    const next = lines.slice(index + 1).find((value) => value.trim());
    const startsBlock =
      /^#{1,7}(\s|$)/.test(line) ||
      /^(\*\*|__|\*|_)\S/.test(line) ||
      /:$/.test(plain) ||
      /[<|]/.test(plain) ||
      Boolean(next && ITEM.test(next));
    if (startsBlock) out.push({ kind: "unknown", text: plain });
    // A cited plain line under an allowed heading is an item; formatting never drops it.
    else out.push({ kind: "item", text: line, indent: "", numbered: false, cited });
  }
  return out;
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
