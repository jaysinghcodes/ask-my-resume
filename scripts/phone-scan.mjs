/**
 * Repo phone scan. Stay in sync with the phone bar in lib/kb-build.js
 * from PR #18 (issue #3, not on main yet).
 *
 * Normalize each character with NFKC, strip Unicode Cf, fold Arabic Indic
 * digits to ASCII (NFKC leaves them unchanged), and map U+2010 to U+2015
 * and U+2212 to an ASCII hyphen. Collapse whitespace, then drop separators
 * that sit between digits (space, dash, dot, slash, underscore, comma,
 * parentheses). A run of 10 to 15 digits fails, with or without a leading
 * + or 00. A neighboring letter or x does not exempt that run. tel links
 * fail the same way. Hex hashes of 7 to 40 characters that contain a letter,
 * UUIDs, ISO dates, and exact tokens in scripts/phone-scan-allowlist.txt
 * are kept. Output is the file path and line number only.
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE_DIR = "tests/fixtures/phone-scan";
const ALLOWLIST_REL = "scripts/phone-scan-allowlist.txt";

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
const HEX_HASH = /(?<![0-9a-fA-F])[0-9a-fA-F]{7,40}(?![0-9a-fA-F])/g;
const PHONE_RUN = /(?<!\d)(?:\+|00)?\d{10,15}(?!\d)/g;
const SEPARATOR = /(?<=\d)[ \t./\\_,()\-\u2010-\u2015\u2212]+(?=\d)/g;

/**
 * @param {string} ch
 * @returns {string}
 */
function foldChar(ch) {
  if (/\p{Cf}/u.test(ch)) return "";
  let next = ch.normalize("NFKC").replace(/\p{Cf}/gu, "");
  next = next.replace(/[\u2010-\u2015\u2212]/g, "-");
  let folded = "";
  for (const part of next) {
    const cp = part.codePointAt(0) ?? 0;
    if (cp >= 0x0660 && cp <= 0x0669) folded += String(cp - 0x0660);
    else if (cp >= 0x06f0 && cp <= 0x06f9) folded += String(cp - 0x06f0);
    else if (/\p{Zs}/u.test(part) || part === "\n" || part === "\t") folded += " ";
    else folded += part;
  }
  return folded;
}

/**
 * @param {string} input
 * @returns {{ ch: string, line: number }[]}
 */
export function normalizeChars(input) {
  const source = String(input).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  /** @type {{ ch: string, line: number }[]} */
  const out = [];
  let line = 1;
  const units = [...source];
  for (let i = 0; i < units.length; i += 1) {
    const ch = units[i];
    if (ch === "\n") {
      line += 1;
      out.push({ ch: "\n", line });
      continue;
    }
    if (ch === "%" && i + 2 < units.length && /^[0-9a-fA-F]$/.test(units[i + 1]) && /^[0-9a-fA-F]$/.test(units[i + 2])) {
      const decoded = String.fromCharCode(Number.parseInt(units[i + 1] + units[i + 2], 16));
      i += 2;
      for (const part of foldChar(decoded)) out.push({ ch: part, line });
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
 * @param {string} text
 * @param {string[]} [allowed]
 * @returns {{ line: number, rule: string }[]}
 */
export function findPhoneHits(text, allowed = []) {
  let items = normalizeChars(text);
  items = blankMatches(items, ISO_DATE);
  items = blankMatches(items, UUID_TOKEN);
  items = blankMatches(items, HEX_HASH, (token) => /[a-fA-F]/.test(token));
  for (const token of allowed) items = blankToken(items, token);
  items = dropSeparators(items);

  const body = items.map((item) => item.ch).join("");
  /** @type {Map<number, string>} */
  const byLine = new Map();
  PHONE_RUN.lastIndex = 0;
  for (const match of body.matchAll(PHONE_RUN)) {
    const start = match.index ?? 0;
    const line = items[start]?.line || 1;
    if (!byLine.has(line)) byLine.set(line, "digits");
  }
  return [...byLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([line, rule]) => ({ line, rule }));
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
  return false;
}

/**
 * @param {string} file
 * @param {string[]} allowed
 * @returns {{ line: number, rule: string }[]}
 */
export function scanFile(file, allowed = []) {
  const ext = path.extname(file).toLowerCase();
  if (SKIP_EXT.has(ext)) return [];
  if (ext === ".pdf") return findPhoneHits(readPdfText(file), allowed);
  if (looksBinary(file)) return [];
  return findPhoneHits(fs.readFileSync(file, "utf8"), allowed);
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
