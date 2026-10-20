/**
 * Display copy for project docs.
 * Inline code spans and fenced code blocks stay byte for byte.
 * Dashes and arrows are removed only from the prose around them.
 */

const CODE = /```[\s\S]*?```|``[^`\n]*``|`[^`\n]+`/g;
const URL_PATTERN = /https?:\/\/[^\s<>\])"']+/gi;
const COMPOUND_HYPHEN = /[A-Za-z][A-Za-z0-9]*-[A-Za-z0-9]+/;

/**
 * @param {string} raw
 * @returns {string}
 */
export function stripLiteralCode(raw) {
  return raw.replace(CODE, " ");
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
export function literalCodeSegments(raw) {
  return raw.match(CODE) || [];
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeDocText(raw) {
  /** @type {string[]} */
  const saved = [];
  const stash = (/** @type {string} */ match) => {
    const token = `\uE000${saved.length}\uE001`;
    saved.push(match);
    return token;
  };
  let text = raw.replace(CODE, stash);
  text = text.replace(URL_PATTERN, stash);
  text = normalizeProse(text);
  for (let i = saved.length - 1; i >= 0; i -= 1) {
    text = text.replaceAll(`\uE000${i}\uE001`, () => saved[i]);
  }
  return text;
}

/**
 * Dash and arrow issues in prose. Code spans, fenced blocks, and URLs are ignored.
 * @param {string} raw
 * @returns {string[]}
 */
export function proseDashIssues(raw) {
  URL_PATTERN.lastIndex = 0;
  const text = stripLiteralCode(raw).replace(URL_PATTERN, " ");
  /** @type {string[]} */
  const issues = [];
  if (text.includes("\u2014")) issues.push("em dash");
  if (text.includes("\u2013")) issues.push("en dash");
  if (text.includes("\u2012")) issues.push("figure dash");
  if (text.includes("\u2015")) issues.push("horizontal bar");
  if (/\s-\s/.test(text)) issues.push("spaced hyphen");
  if (COMPOUND_HYPHEN.test(text)) issues.push("hyphen joining two words");
  if (hasArrow(text)) issues.push("arrow");
  return issues;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeProse(raw) {
  let text = raw;
  text = text.replaceAll("-->", " to ");
  text = text.replaceAll("<=", " at most ");
  text = text.replaceAll("=>", " to ");
  text = text.replaceAll("<-", " from ");
  text = text.replaceAll("->", " to ");
  text = text.replace(/[\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F]/g, " to ");
  text = text.replaceAll("\u2014", ", ");
  text = text.replaceAll("\u2013", " to ");
  text = text.replaceAll("\u2012", " ");
  text = text.replaceAll("\u2015", " ");
  text = text.replace(/\s-\s/g, ", ");
  text = text.replace(/(?<=[A-Za-z0-9])-(?=[A-Za-z0-9])/g, " ");
  text = text.replace(/[ ]{2,}/g, " ");
  return text;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function hasArrow(text) {
  const forms = ["-" + ">", "=" + ">", "<" + "-", "<" + "="];
  if (forms.some((form) => text.includes(form))) return true;
  return /[\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F]/.test(text);
}
