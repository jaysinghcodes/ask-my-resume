/**
 * Shared phone rule pieces for lib/kb-build.js and scripts/phone-scan.mjs.
 *
 * Issue #23 rulings:
 * 1. Pipe, colon, tilde, middle dot (U+00B7) and bullet (U+2022) are
 *    separators between digits, next to space, dashes, dot, slash,
 *    backslash, underscore, comma and parentheses.
 * 2. Letters standing in for digits inside a digit run map to digits:
 *    O and o to 0, l and I to 1. Vanity numbers (a toll free prefix and a
 *    word) fail, and spelled out digits count as digits.
 * 3. A UUID shape or an ISO date shape is kept only when it is a valid UUID
 *    or a real calendar date. Otherwise its digits go through the phone rule.
 * 4. Year lists and ISBNs are handled by the reviewed allowlist only.
 *
 * Every helper keeps one output character per input character, except
 * spelledDigitMatches, which callers use to swap a whole word for one digit.
 */

/** Regex class body for every separator that is dropped between digits. */
export const SEPARATOR_CLASS = " \\t./\\\\_,()\\-\\u2010-\\u2015\\u2212|:~\\u00B7\\u2022";

/**
 * ISO date with an optional time. The time fields only match in range, so an
 * impossible time is left visible. The date itself is checked by isRealCalendarDate.
 */
export const ISO_DATE_SOURCE =
  "(?<!\\d)\\d{4}-\\d{2}-\\d{2}(?:t(?:[01]\\d|2[0-3]):[0-5]\\d(?::(?:[0-5]\\d|60)(?:\\.\\d+)?)?(?:z|[+-](?:[01]\\d|2[0-3]):?[0-5]\\d)?)?(?!\\d)";

/** Five hex groups in UUID shape, joined by a hyphen or whitespace. */
export const UUID_SOURCE =
  "(?<![0-9a-f])[0-9a-f]{8}[-\\s][0-9a-f]{4}[-\\s][0-9a-f]{4}[-\\s][0-9a-f]{4}[-\\s][0-9a-f]{12}(?![0-9a-f])";

const SPELLED = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** A whole word made only of spelled digits, such as five or fivefive. */
export const SPELLED_DIGITS = new RegExp(`(?<![a-z])(?:${SPELLED.join("|")})+(?![a-z])`, "gi");

const SPELLED_ONE = new RegExp(SPELLED.join("|"), "gi");

/**
 * A vanity number: an optional 1 country code, a three digit area code, then
 * seven upper case letters or digits with at least one letter, as one word or
 * split three and four. Matched on case kept text so ordinary words stay out.
 * l is in the letter set because the confusable skeleton turns I into l.
 */
const SEP = `[${SEPARATOR_CLASS}]{0,2}`;
const VANITY = new RegExp(
  `(?<![0-9A-Za-z])(?:(?:\\+|00)?1${SEP})?(?:\\(\\d{3}\\)|\\d{3})${SEP}` +
    `(?:(?=[0-9A-Zl]{0,6}[A-Zl])[0-9A-Zl]{7}|(?=[0-9A-Zl]{0,2}[A-Zl]|[0-9A-Zl]{3}${SEP}[0-9A-Zl]{0,3}[A-Zl])[0-9A-Zl]{3}${SEP}[0-9A-Zl]{4})` +
    `(?![0-9A-Za-z])`,
  "g",
);

/**
 * @param {string} token an ISO_DATE_SOURCE match
 * @returns {boolean}
 */
export function isRealCalendarDate(token) {
  const year = Number(token.slice(0, 4));
  const month = Number(token.slice(5, 7));
  const day = Number(token.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  // Day 0 of the next month is the last day of this month.
  const last = new Date(Date.UTC(2000, month, 0));
  last.setUTCFullYear(year, month, 0);
  return day <= last.getUTCDate();
}

/**
 * RFC 9562: version 1 to 8 and variant 8, 9, a or b, plus the nil and max UUIDs.
 * @param {string} token a UUID_SOURCE match
 * @returns {boolean}
 */
export function isValidUuid(token) {
  const hex = token.replace(/[-\s]/g, "").toLowerCase();
  if (/^0{32}$/.test(hex) || /^f{32}$/.test(hex)) return true;
  return /^[1-8]$/.test(hex[12]) && /^[89ab]$/.test(hex[16]);
}

/**
 * Map look alike letters to digits inside every run of digits and those
 * letters that holds at least one digit.
 * @param {string} text
 * @param {Record<string, string>} letters for example { o: "0", l: "1" }
 * @returns {string}
 */
export function mapLetterDigits(text, letters) {
  const set = Object.keys(letters).join("");
  const run = new RegExp(`[0-9${set}]*\\d[0-9${set}]*`, "g");
  return text.replace(run, (match) => {
    let out = "";
    for (const ch of match) out += letters[ch] ?? ch;
    return out;
  });
}

/**
 * @param {string} word a SPELLED_DIGITS match
 * @returns {string}
 */
export function spelledToDigits(word) {
  return word.replace(SPELLED_ONE, (part) => String(SPELLED.indexOf(part.toLowerCase())));
}

/**
 * Start offsets of vanity numbers in case kept text. A whole hex token is skipped.
 * @param {string} text
 * @returns {number[]}
 */
export function findVanity(text) {
  /** @type {number[]} */
  const hits = [];
  VANITY.lastIndex = 0;
  for (const match of text.matchAll(VANITY)) {
    const bare = match[0].replace(new RegExp(`[${SEPARATOR_CLASS}+]`, "g"), "");
    if (/^[0-9a-f]+$/i.test(bare)) continue;
    hits.push(match.index ?? 0);
  }
  return hits;
}
