/**
 * Scan committed text files and PDFs for phone numbers.
 *
 * Stay in sync with the PHONE rule in lib/kb-build.js from PR #18 (not on main yet):
 * separated 3 3 4 forms, with an optional leading country code.
 * This repo scan also covers the CI forms from issue #19:
 * unseparated 10 digit runs with an optional leading 1 or +1,
 * tel links, an opening bracket with no space after it,
 * international numbers (a leading + and 8 to 15 digits),
 * and runs of 10 or more digits in phone shapes.
 * Whitespace runs, including non breaking spaces, collapse to one space
 * before matching. Years, dates, versions, SHAs, and long ids are not flagged.
 * Output is file path and line number only. Matched text is never printed.
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE_DIR = "tests/fixtures/phone-scan";

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

/**
 * @param {string} ch
 * @returns {boolean}
 */
function isWhitespace(ch) {
  return /[\s\u00a0\u2007\u202f]/u.test(ch);
}

/**
 * Collapse whitespace runs to one space. Newlines stay mapped so a hit can
 * report the original line.
 * @param {string} input
 * @returns {{ text: string, lines: number[] }}
 */
export function normalizeForScan(input) {
  const source = String(input).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let text = "";
  /** @type {number[]} */
  const lines = [];
  let line = 1;
  let pending = false;
  let pendingLine = 1;

  for (const ch of source) {
    if (ch === "\n") line += 1;
    if (isWhitespace(ch)) {
      if (!pending) pendingLine = line;
      pending = true;
      continue;
    }
    if (pending && text.length > 0) {
      text += " ";
      lines.push(pendingLine);
    }
    pending = false;
    text += ch;
    lines.push(line);
  }

  return { text, lines };
}

/**
 * @param {string} token
 * @returns {boolean}
 */
function looksLikeDate(token) {
  const value = token.trim().replace(/^\+/, "");
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(value)) return true;
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(value)) return true;
  if (/^(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(value)) return true;
  return false;
}

/**
 * @param {string} token
 * @returns {boolean}
 */
function looksLikeVersion(token) {
  const value = token.trim().replace(/^[vV]/, "");
  if (!/^\d+(?:\.\d+){1,3}$/.test(value)) return false;
  if (/^\d{3}\.\d{3}\.\d{4}$/.test(value)) return false;
  return true;
}

/**
 * @param {string} token
 * @returns {boolean}
 */
function looksLikeIpv4(token) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(token)) return false;
  return token.split(".").every((part) => {
    const n = Number(part);
    return n <= 255;
  });
}

/**
 * @param {string} token
 * @returns {number}
 */
function digitCount(token) {
  return token.replace(/\D/g, "").length;
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
function isInternational(raw) {
  if (!raw.startsWith("+")) return false;
  const count = digitCount(raw);
  if (count < 8 || count > 15) return false;
  if (looksLikeDate(raw) || looksLikeVersion(raw)) return false;
  return /^\+\d(?:[\s().-]*\d)+$/.test(raw) || /^\+\d(?:[\s().-]*\d)*$/.test(raw);
}

/**
 * Separated NANP, including a bracket with no space before the next digits.
 * Optional leading 1 or +1. Also accepts a longer phone shaped tail up to 15 digits.
 * @param {string} raw
 * @returns {boolean}
 */
function isSeparatedPhone(raw) {
  if (looksLikeDate(raw) || looksLikeVersion(raw) || looksLikeIpv4(raw)) return false;
  const count = digitCount(raw);
  if (count < 10 || count > 15) return false;
  if (/^(?:\+?1[\s.-])?(?:\(\d{3}\)[\s.-]?|\d{3}[\s.-])\d{3}[\s.-]\d{4,6}$/.test(raw)) return true;
  if (/^\(\d{2,4}\)[\s.-]?\d{2,5}[\s.-]\d{3,6}$/.test(raw)) return true;
  return false;
}

/**
 * Unseparated 10 digits, or 11 digits with a leading 1. Longer bare runs are ids.
 * @param {string} raw
 * @returns {boolean}
 */
function isBarePhone(raw) {
  if (/^\d{10}$/.test(raw)) return true;
  if (/^1\d{10}$/.test(raw)) return true;
  if (/^\+1\d{10}$/.test(raw)) return true;
  return false;
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
function isTel(raw) {
  const match = raw.match(/^tel:\s*(\+?\(?\d[\d\s().-]*\d)$/i);
  if (!match) return false;
  const count = digitCount(match[1]);
  if (count < 8 || count > 15) return false;
  if (looksLikeDate(match[1]) || looksLikeIpv4(match[1])) return false;
  return true;
}

/**
 * @param {string} text
 * @returns {{ line: number, rule: string }[]}
 */
export function findPhoneHits(text) {
  const normalized = normalizeForScan(text);
  /** @type {Map<number, string>} */
  const byLine = new Map();

  /**
   * @param {number} index
   * @param {string} rule
   */
  function add(index, rule) {
    const line = normalized.lines[index] || 1;
    if (!byLine.has(line)) byLine.set(line, rule);
  }

  const checks = [
    {
      rule: "tel",
      re: /\btel:\s*\+?\(?\d(?:[\s().-]*\d){7,14}(?!\d)/gi,
      accept: isTel,
    },
    {
      rule: "intl",
      re: /(?<![A-Za-z0-9])\+\d(?:[\s().-]*\d){7,14}(?![A-Za-z0-9])/g,
      accept: isInternational,
    },
    {
      rule: "separated",
      re: /(?<![A-Za-z0-9])(?:\+?1[\s.-])?(?:\(\d{3}\)[\s.-]?|\d{3}[\s.-])\d{3}[\s.-]\d{4,6}(?![A-Za-z0-9])/g,
      accept: isSeparatedPhone,
    },
    {
      rule: "paren",
      re: /(?<![A-Za-z0-9])\(\d{2,4}\)[\s.-]?\d{2,5}[\s.-]\d{3,6}(?![A-Za-z0-9])/g,
      accept: isSeparatedPhone,
    },
    {
      rule: "bare",
      re: /(?<![A-Za-z0-9])(?:\+1|1)?\d{10}(?![A-Za-z0-9])/g,
      accept: isBarePhone,
    },
  ];

  for (const check of checks) {
    for (const match of normalized.text.matchAll(check.re)) {
      if (!check.accept(match[0])) continue;
      add(match.index ?? 0, check.rule);
    }
  }

  return [...byLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([line, rule]) => ({ line, rule }));
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
  return false;
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
function looksBinary(file) {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(8000);
    const n = fs.readSync(fd, buf, 0, 8000, 0);
    return buf.subarray(0, n).includes(0);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * @param {string} file
 * @returns {{ line: number, rule: string }[]}
 */
export function scanFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (SKIP_EXT.has(ext)) return [];
  if (ext === ".pdf") return findPhoneHits(readPdfText(file));
  if (looksBinary(file)) return [];
  return findPhoneHits(fs.readFileSync(file, "utf8"));
}

/**
 * @param {string} root
 * @returns {string[]}
 */
function gitFiles(root) {
  const out = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: root,
      encoding: "utf8",
    },
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
 * @param {string[]} argv
 * @returns {number}
 */
export function main(argv = process.argv.slice(2)) {
  const root = repoRoot();
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

  /** @type {{ file: string, line: number, rule: string }[]} */
  const hits = [];
  for (const rel of rels) {
    const absolute = path.join(root, rel);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
    let found;
    try {
      found = scanFile(absolute);
    } catch (err) {
      const message = err instanceof Error ? err.message : "scan failed";
      console.error(message);
      return 2;
    }
    for (const hit of found) {
      hits.push({ file: rel, line: hit.line, rule: hit.rule });
    }
  }

  const debug = process.env.PHONE_SCAN_DEBUG === "1";
  if (hits.length === 0) {
    console.log(`scanned ${rels.length} files, no phone numbers`);
    return 0;
  }

  for (const hit of hits) {
    if (debug) console.log(`${hit.file}:${hit.line} ${hit.rule}`);
    else console.log(`${hit.file}:${hit.line}`);
  }
  return 1;
}

/**
 * @returns {string}
 */
function repoRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return process.cwd();
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  process.exit(main());
}
