/**
 * Repo phone scan. Stay in sync with the phone bar in lib/kb-build.js
 * from PR #18 (issue #3, not on main yet).
 *
 * Decode percent escapes, then HTML entities (&nbsp;, &#160;, &#xA0;, and
 * other named entities). Normalize each character with NFKC, strip Unicode
 * Cf, fold every Unicode decimal digit to ASCII from DerivedNumericValues,
 * and map U+2010 to U+2015 and U+2212 to an ASCII hyphen. Within a line,
 * whitespace matches collapseSpace in lib/text-normalize.js (tab, form
 * feed, vertical tab, U+2028, U+2029, and the Unicode spaces). Line
 * breaks are LF, CRLF, and CR. Digit groups on separate lines do not join.
 * Drop separators that sit between digits (space, dash, dot, slash,
 * underscore, comma, parentheses), then fail any run of 10 or more digits.
 * A neighboring letter or x does not exempt that run. tel links fail the
 * same way. A hex hash of 7 to 40 characters is kept only when it contains
 * a letter and every long digit run sits strictly inside the token. UUIDs,
 * ISO dates, and exact tokens in scripts/phone-scan-allowlist.txt are kept.
 * UTF-16 LE, UTF-16 BE, and UTF-8 files with a BOM are decoded and scanned.
 * Output is the file path and line number only.
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "html-entities";

const FIXTURE_DIR = "tests/fixtures/phone-scan";
const UNICODE_DATA_FILE = "scripts/unicode/DerivedNumericValues.txt";
const ALLOWLIST_REL = "scripts/phone-scan-allowlist.txt";
const DECIMAL_DIGITS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "unicode",
  "DerivedNumericValues.txt",
);

/**
 * Same character set as collapseSpace in lib/text-normalize.js, without LF
 * and CR. U+2028 and U+2029 are inline spaces. LF, CRLF, and CR stay as
 * line breaks so digit groups on separate lines do not join.
 */
const INLINE_SPACE = /[\t\f\v \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]/;

const LOCKFILE_BASENAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "npm-shrinkwrap.json",
  "bun.lock",
  "bun.lockb",
]);

const SKIP_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".zip",
  ".gz",
  ".br",
  ".mp4",
  ".webm",
  ".lockb",
]);

const ISO_DATE = /(?<!\d)\d{4}-\d{2}-\d{2}(?:[tT]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[zZ]|[+-]\d{2}:?\d{2})?)?(?!\d)/g;
const UUID_TOKEN = /(?<![0-9a-fA-F])[0-9a-fA-F]{8}[-\s][0-9a-fA-F]{4}[-\s][0-9a-fA-F]{4}[-\s][0-9a-fA-F]{4}[-\s][0-9a-fA-F]{12}(?![0-9a-fA-F])/g;
const HEX_HASH = /(?<![0-9A-Za-z])[0-9a-fA-F]{7,40}(?![0-9A-Za-z])/g;
const PHONE_RUN = /(?<!\d)\d{10,}(?!\d)/g;
const SEPARATOR = /(?<=\d)[ \t./\\_,()\-\u2010-\u2015\u2212]+(?=\d)/g;

/**
 * @param {string} text
 * @returns {string}
 */
function decodePercents(text) {
  return text.replace(/%([0-9a-fA-F]{2})/g, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

/** @type {Map<string, string>} */
const decimalDigitMap = loadDecimalDigits(fs.readFileSync(DECIMAL_DIGITS_PATH, "utf8"));

/**
 * @param {string} text
 * @returns {Map<string, string>}
 */
function loadDecimalDigits(text) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const line of text.split("\n")) {
    if (!line.includes("# Nd")) continue;
    const parts = line.split(";");
    const integer = (parts[3] || "").split("#")[0].trim();
    if (!/^\d$/.test(integer)) continue;
    map.set(codePoint(parts[0]), integer);
  }
  return map;
}

/**
 * @param {string} field
 * @returns {string}
 */
function codePoint(field) {
  return String.fromCodePoint(Number.parseInt(field.trim(), 16));
}

/**
 * @param {string} text
 * @returns {string}
 */
function foldDecimalDigits(text) {
  let out = "";
  for (const ch of text) out += decimalDigitMap.get(ch) ?? ch;
  return out;
}

/**
 * @param {string} text
 * @returns {string}
 */
function foldDashes(text) {
  return text.replace(/[\u2010-\u2015\u2212]/g, "-");
}

/**
 * @param {string} text
 * @returns {string}
 */
function breakLines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * @param {string} ch
 * @returns {string}
 */
function foldChar(ch) {
  if (/\p{Cf}/u.test(ch)) return "";
  const next = foldDashes(foldDecimalDigits(ch.normalize("NFKC").replace(/\p{Cf}/gu, "")));
  let folded = "";
  for (const part of next) {
    if (INLINE_SPACE.test(part)) folded += " ";
    else folded += part;
  }
  return folded;
}

/**
 * @param {string} input
 * @returns {{ ch: string, line: number }[]}
 */
export function normalizeChars(input) {
  const source = breakLines(decode(decodePercents(breakLines(String(input)))));
  /** @type {{ ch: string, line: number }[]} */
  const out = [];
  let line = 1;
  for (const ch of source) {
    if (ch === "\n") {
      line += 1;
      out.push({ ch: "\n", line });
      continue;
    }
    for (const part of foldChar(ch)) out.push({ ch: part, line });
  }

  /** @type {{ ch: string, line: number }[]} */
  const collapsed = [];
  for (const item of out) {
    const prev = collapsed[collapsed.length - 1];
    if (item.ch === " " && prev && prev.ch === " ") continue;
    collapsed.push(item);
  }
  return collapsed;
}

/**
 * @param {{ ch: string, line: number }[]} items
 * @param {RegExp} regex
 * @param {(token: string) => boolean} [accept]
 * @returns {{ ch: string, line: number }[]}
 */
function blankMatches(items, regex, accept) {
  const text = items.map((item) => item.ch).join("");
  const copy = items.map((item) => ({ ch: item.ch, line: item.line }));
  regex.lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    if (accept && !accept(match[0])) continue;
    const start = match.index ?? 0;
    for (let i = start; i < start + match[0].length; i += 1) {
      copy[i] = { ch: "a", line: copy[i].line };
    }
  }
  return copy;
}

/**
 * @param {{ ch: string, line: number }[]} items
 * @param {string} token
 * @returns {{ ch: string, line: number }[]}
 */
function blankToken(items, token) {
  if (!token) return items;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return blankMatches(items, new RegExp(`(?<![0-9A-Za-z])${escaped}(?![0-9A-Za-z])`, "g"));
}

/**
 * @param {{ ch: string, line: number }[]} items
 * @returns {{ ch: string, line: number }[]}
 */
function dropSeparators(items) {
  let current = items;
  let prev = "";
  let next = current.map((item) => item.ch).join("");
  while (next !== prev) {
    prev = next;
    /** @type {{ ch: string, line: number }[]} */
    const kept = [];
    let last = 0;
    SEPARATOR.lastIndex = 0;
    for (const match of next.matchAll(SEPARATOR)) {
      const start = match.index ?? 0;
      kept.push(...current.slice(last, start));
      last = start + match[0].length;
    }
    kept.push(...current.slice(last));
    current = kept;
    next = current.map((item) => item.ch).join("");
  }
  return current;
}

/**
 * A whole hex token of 7 to 40 characters with a letter.
 * A run of 10 or more digits at the start or end stays visible.
 * @param {string} token
 * @returns {boolean}
 */
function isSafeHexHash(token) {
  if (!/[a-fA-F]/.test(token)) return false;
  if (/^\d{10,}/.test(token) || /\d{10,}$/.test(token)) return false;
  return true;
}

/**
 * @param {string} text
 * @param {string[]} [allowed]
 * @returns {{ line: number, rule: string }[]}
 */
/**
 * @param {string} text
 * @param {string[]} [allowed]
 * @returns {{ line: number, digits: string }[]}
 */
function collectPhoneHits(text, allowed = []) {
  let items = normalizeChars(text);
  items = blankMatches(items, ISO_DATE);
  items = blankMatches(items, UUID_TOKEN);
  for (const token of allowed) items = blankToken(items, token);
  items = dropSeparators(items);
  items = blankMatches(items, HEX_HASH, isSafeHexHash);

  const body = items.map((item) => item.ch).join("");
  /** @type {{ line: number, digits: string }[]} */
  const hits = [];
  PHONE_RUN.lastIndex = 0;
  for (const match of body.matchAll(PHONE_RUN)) {
    const start = match.index ?? 0;
    const line = items[start]?.line || 1;
    hits.push({ line, digits: match[0] });
  }
  return hits;
}

/**
 * @param {string} text
 * @param {string[]} [allowed]
 * @returns {{ line: number, rule: string }[]}
 */
export function findPhoneHits(text, allowed = []) {
  /** @type {Map<number, string>} */
  const byLine = new Map();
  for (const hit of collectPhoneHits(text, allowed)) {
    if (!byLine.has(hit.line)) byLine.set(hit.line, "digits");
  }
  return [...byLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([line, rule]) => ({ line, rule }));
}

/**
 * Digit runs the scanner would flag. Used to check fixtures stay fictional.
 * @param {string} text
 * @returns {string[]}
 */
export function phoneDigitRuns(text) {
  return collectPhoneHits(text).map((hit) => hit.digits);
}

/**
 * @param {string} fileText
 * @returns {{ tokens: string[], errors: number[] }}
 */
export function parseAllowlist(fileText) {
  /** @type {string[]} */
  const tokens = [];
  /** @type {number[]} */
  const errors = [];
  fileText.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const tab = line.indexOf("\t");
    const token = tab === -1 ? "" : line.slice(0, tab).trim();
    const reason = tab === -1 ? "" : line.slice(tab + 1).trim();
    if (!token || !reason) {
      errors.push(index + 1);
      return;
    }
    tokens.push(normalizeChars(token).map((item) => item.ch).join("").trim());
  });
  return { tokens, errors };
}

/**
 * @param {string} rel
 * @param {{ explicit?: boolean }} [options]
 * @returns {boolean}
 */
export function shouldSkipRepoPath(rel, options = {}) {
  const norm = rel.split(path.sep).join("/");
  if (norm === "" || norm === ".") return false;
  const parts = norm.split("/");
  if (parts.includes("node_modules") || parts.includes(".git")) return true;
  if (LOCKFILE_BASENAMES.has(path.posix.basename(norm))) return true;
  if (!options.explicit && (norm === FIXTURE_DIR || norm.startsWith(`${FIXTURE_DIR}/`))) return true;
  // The Unicode data file holds large numeric values. The loader still reads it.
  if (!options.explicit && norm === UNICODE_DATA_FILE) return true;
  return false;
}

/**
 * @param {string} file
 * @param {string[]} allowed
 * @returns {{ line: number, rule: string }[]}
 */
export function scanFile(file, allowed = []) {
  const text = readScanText(file);
  if (text === null) return [];
  return findPhoneHits(text, allowed);
}

/**
 * @param {string} file
 * @returns {string | null}
 */
export function readScanText(file) {
  const ext = path.extname(file).toLowerCase();
  if (SKIP_EXT.has(ext)) return null;
  if (ext === ".pdf") return readPdfText(file);
  return readTextFile(file);
}

/**
 * @param {string} file
 * @returns {string}
 */
function readPdfText(file) {
  const result = spawnSync("pdftotext", ["-enc", "UTF-8", file, "-"], {
    encoding: "buffer",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error && /** @type {NodeJS.ErrnoException} */ (result.error).code === "ENOENT") {
    throw new Error("pdftotext is required. Install poppler-utils.");
  }
  if (result.status !== 0) {
    throw new Error(`pdftotext failed for ${file}`);
  }
  return (result.stdout || Buffer.alloc(0)).toString("utf8");
}

/**
 * @param {string} file
 * @returns {boolean}
 */
/**
 * BOM text is scanned. A NUL in the first 8000 bytes, with no BOM, stays binary.
 * @param {string} file
 * @returns {string | null}
 */
function readTextFile(file) {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(8000);
    const n = fs.readSync(fd, head, 0, 8000, 0);
    const prefix = head.subarray(0, n);
    if (hasUtf16Bom(prefix)) return decodeUtf16File(file, prefix[0] === 0xff ? "le" : "be");
    if (prefix.includes(0)) return null;
  } finally {
    fs.closeSync(fd);
  }
  const buf = fs.readFileSync(file);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf8");
  }
  return buf.toString("utf8");
}

/**
 * @param {Buffer} prefix
 * @returns {boolean}
 */
function hasUtf16Bom(prefix) {
  if (prefix.length < 2) return false;
  const le = prefix[0] === 0xff && prefix[1] === 0xfe;
  const be = prefix[0] === 0xfe && prefix[1] === 0xff;
  return le || be;
}

/**
 * @param {string} file
 * @param {"le" | "be"} endian
 * @returns {string}
 */
function decodeUtf16File(file, endian) {
  const buf = fs.readFileSync(file);
  const body = Buffer.from(buf.subarray(2));
  if (endian === "be") body.swap16();
  return body.toString("utf16le");
}

/**
 * @param {string} root
 * @returns {string[]}
 */
function gitFiles(root) {
  const out = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8" },
  );
  return out.split("\0").filter(Boolean);
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walkFiles(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

/**
 * @param {string} target
 * @returns {string[]}
 */
function explicitFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return walkFiles(target);
}

/**
 * @param {string} root
 * @param {string} file
 * @returns {string}
 */
function toRel(root, file) {
  const rel = path.relative(root, file);
  return rel.split(path.sep).join("/");
}

/**
 * @returns {string}
 */
function repoRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  } catch {
    return process.cwd();
  }
}

/**
 * @param {string[]} argv
 * @returns {number}
 */
export function main(argv = process.argv.slice(2)) {
  const root = repoRoot();
  const allowPath = path.join(root, ALLOWLIST_REL);
  const allowText = fs.existsSync(allowPath) ? fs.readFileSync(allowPath, "utf8") : "";
  const allow = parseAllowlist(allowText);
  if (allow.errors.length > 0) {
    for (const line of allow.errors) console.log(`${ALLOWLIST_REL}:${line}`);
    return 2;
  }

  const explicit = argv.length > 0;
  /** @type {string[]} */
  const rels = [];
  if (!explicit) {
    for (const rel of gitFiles(root)) {
      if (shouldSkipRepoPath(rel, { explicit: false })) continue;
      rels.push(rel);
    }
  } else {
    for (const arg of argv) {
      const absolute = path.resolve(root, arg);
      for (const file of explicitFiles(absolute)) {
        const rel = toRel(root, file);
        if (shouldSkipRepoPath(rel, { explicit: true })) continue;
        rels.push(rel);
      }
    }
  }

  /** @type {{ file: string, line: number }[]} */
  const hits = [];
  for (const rel of rels) {
    const absolute = path.join(root, rel);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
    let found;
    try {
      found = scanFile(absolute, allow.tokens);
    } catch (err) {
      const message = err instanceof Error ? err.message : "scan failed";
      console.error(message);
      return 2;
    }
    for (const hit of found) hits.push({ file: rel, line: hit.line });
  }

  if (hits.length === 0) {
    console.log(`scanned ${rels.length} files, no phone numbers`);
    return 0;
  }
  for (const hit of hits) console.log(`${hit.file}:${hit.line}`);
  return 1;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) process.exit(main());
