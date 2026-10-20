/**
 * Copy check for the built site (T13). Scans all rendered copy:
 *   frontend/dist/index.html: the prerendered home page, the meta tags and the Person JSON LD,
 *   frontend/dist-copy/*.html: the server render of every route (home, /about, /contact,
 *     the 404 page), of ContactPage and of the open menu sheet, written by the build's
 *     prerender step,
 *   frontend/src: copy that only shows after an interaction (menu, chat states, errors,
 *     route titles), read from JSX text, copy attributes and prose string literals,
 * for:
 *   dash punctuation (em or en dash, a spaced hyphen, a double hyphen),
 *   arrows (Unicode arrows, "->", "<-", "=>"),
 *   phone numbers (the same rule as scripts/phone-scan.mjs),
 *   KB_BANNED_TERMS (comma separated, from the environment; skipped when unset).
 * HTML entities are decoded first, repeatedly, so "&larr;", "&rarr;", "&mdash;" and a
 * double encoded "&amp;rarr;" count like a literal arrow or dash.
 * Output names the file, the rule and the item number only, never the matched text,
 * so a banned term is not echoed into CI logs.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "html-entities";
import ts from "typescript";
import { findPhoneHits } from "./phone-scan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_FILES = ["frontend/dist/index.html"];
const COPY_DIR = "frontend/dist-copy";
const SOURCE_DIR = "frontend/src";
/** The snapshots the prerender step must write. A missing one fails the check. */
export const REQUIRED_SNAPSHOTS = ["home.html", "about.html", "contact.html", "not-found.html", "contact-page.html", "menu-open.html"];

/**
 * Decode HTML entities until nothing changes, so double (or deeper) encoded entities
 * such as "&amp;larr;" come out as the character they stand for.
 * @param {string} value
 * @returns {string}
 */
export function decodeAll(value) {
  let current = value;
  for (let round = 0; round < 5; round += 1) {
    const next = decode(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

const ENTITY = /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;

const DASH = /[\u2012-\u2015\u2E3A\u2E3B\uFE58\uFE63\uFF0D]|\s-\s|--/;
const ARROW = /[\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F\u2B00-\u2B4F]|->|<-|=>/;
const COPY_ATTRS = ["content", "alt", "aria-label", "title", "placeholder"];

/**
 * Pull every piece of visitor or crawler facing copy out of an HTML document:
 * text nodes, copy attributes, the title, and each string value in JSON LD.
 * Scripts and styles are skipped, apart from JSON LD.
 * @param {string} html
 * @returns {string[]}
 */
export function extractCopy(html) {
  /** @type {string[]} */
  const out = [];
  for (const match of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    collectJsonStrings(JSON.parse(match[1]), out);
  }
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of body.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const attrs = tag[2];
    for (const name of COPY_ATTRS) {
      const value = new RegExp(`\\s${name}="([^"]*)"`, "i").exec(attrs);
      if (!value) continue;
      if (name === "content" && !/\s(name|property)="(description|og:[a-z:]+|twitter:[a-z:]+)"/i.test(attrs)) continue;
      if (name === "content" && /^https?:\/\//.test(value[1])) continue;
      out.push(decodeAll(value[1]));
    }
  }
  for (const text of body.replace(/<[^>]+>/g, "\n").split("\n")) {
    const value = decodeAll(text).trim();
    if (value) out.push(value);
  }
  return out;
}

/**
 * @param {unknown} value
 * @param {string[]} out
 */
function collectJsonStrings(value, out) {
  if (typeof value === "string") {
    if (!/^https?:\/\//.test(value)) out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectJsonStrings(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectJsonStrings(item, out);
  }
}

/** Calls whose string arguments are code, not copy. */
const CODE_CALLS = /^(querySelector|querySelectorAll|getElementById|matchMedia|closest|addEventListener|removeEventListener|setAttribute|getAttribute|hasAttribute|removeAttribute|createElement|fetch|require|Error|TypeError|RegExp)$/;
/** JSX attributes whose values are code, not copy. */
const CODE_ATTRS = /^(className|id|href|to|src|srcSet|type|rel|target|role|name|htmlFor|key|lang|loading|decoding|fetchpriority|fetchPriority|autoComplete|inputMode|method|tabIndex|width|height|sizes|style|data-[\w-]+|aria-(controls|describedby|labelledby|live|expanded|hidden|current|haspopup|modal|busy))$/;

/**
 * Copy written in the page source: JSX text, copy attributes and prose string literals,
 * read with the TypeScript parser so code is never mistaken for copy.
 * A string literal counts as copy when it has a letter and a space and is not a URL,
 * a path, a class list, a selector or a media query.
 * @param {string} source
 * @param {string} [fileName]
 * @returns {string[]}
 */
export function extractSourceCopy(source, fileName = "file.jsx") {
  /** @type {string[]} */
  const out = [];
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  /** @param {import("typescript").Node} node */
  const skip = (node) => {
    const parent = node.parent;
    if (!parent) return false;
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return true;
    if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
    if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
      const callee = parent.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
      if (CODE_CALLS.test(name)) return true;
    }
    if (ts.isBinaryExpression(parent) && /^(===|!==|==|!=)$/.test(parent.operatorToken.getText())) return true;
    if (ts.isCaseClause(parent)) return true;
    let up = parent;
    while (up && !ts.isJsxAttribute(up) && !ts.isStatement(up)) up = up.parent;
    if (up && ts.isJsxAttribute(up) && CODE_ATTRS.test(up.name.getText())) return true;
    return false;
  };
  /** @param {import("typescript").Node} node */
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      // The JSX compiler decodes entities in JSX text, so "&larr; Close" renders an arrow.
      const text = decodeAll(node.text).replace(/\s+/g, " ").trim();
      if (/[A-Za-z]/.test(text) || (ENTITY.test(node.text) && text)) out.push(text);
    } else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const raw = node.initializer.text;
      if (COPY_ATTRS.includes(node.name.getText())) out.push(decodeAll(raw));
      else if (!CODE_ATTRS.test(node.name.getText()) && (isProse(raw) || ENTITY.test(raw))) out.push(decodeAll(raw));
      return;
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !skip(node)) {
      // An entity in a string literal is copy too: React prints it as is, so it shows up
      // double encoded in the HTML ("&amp;rarr;") and the check reads it as the arrow.
      if (isProse(node.text) || ENTITY.test(node.text)) out.push(decodeAll(node.text));
    } else if (ts.isTemplateExpression(node) && !skip(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ");
      if (isProse(parts) || ENTITY.test(parts)) out.push(decodeAll(parts));
    } else if (ts.isRegularExpressionLiteral(node)) {
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

/**
 * @param {string} value
 */
function isProse(value) {
  const text = value.trim();
  if (!/[A-Za-z]{2}/.test(text) || !/\s/.test(text)) return false;
  if (/^(https?:|mailto:|tel:|\/|#|\.|\(|\[|<|@media)/.test(text)) return false;
  if (/^[a-z0-9_-]+(\s+[a-z0-9_-]+)*$/.test(text) && /-/.test(text)) return false; // class lists
  return true;
}

/**
 * @param {string} dir
 * @returns {string[]} source files under dir
 */
function sourceFiles(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (/\.(jsx?|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(full);
  }
  return files.sort();
}

/**
 * @param {string | undefined} raw
 * @returns {string[]}
 */
export function parseBannedTerms(raw) {
  if (typeof raw !== "string") return [];
  let value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {string[]} items
 * @param {string[]} banned
 * @returns {{ item: number, rule: "dash" | "arrow" | "phone" | "banned" }[]}
 */
export function checkCopy(items, banned = []) {
  /** @type {{ item: number, rule: "dash" | "arrow" | "phone" | "banned" }[]} */
  const issues = [];
  items.forEach((text, index) => {
    const item = index + 1;
    if (DASH.test(text)) issues.push({ item, rule: "dash" });
    if (ARROW.test(text)) issues.push({ item, rule: "arrow" });
    if (findPhoneHits(text).length > 0) issues.push({ item, rule: "phone" });
    const lower = text.toLowerCase();
    if (banned.some((term) => lower.includes(term))) issues.push({ item, rule: "banned" });
  });
  return issues;
}

/**
 * @param {{ files?: string[], copyDir?: string, sourceDir?: string, env?: NodeJS.ProcessEnv, base?: string }} [options]
 * @returns {number} 0 clean, 1 a rule hit, 2 a file is missing
 */
export function main(options = {}) {
  const base = options.base ?? root;
  const env = options.env ?? process.env;
  const banned = parseBannedTerms(env.KB_BANNED_TERMS);
  if (banned.length === 0) console.log("KB_BANNED_TERMS is unset. Banned term check skipped.");
  const copyDir = options.copyDir ?? COPY_DIR;
  /** @type {{ rel: string, items: string[] }[]} */
  const targets = [];
  for (const rel of options.files ?? DEFAULT_FILES) {
    const absolute = path.resolve(base, rel);
    if (!fs.existsSync(absolute)) {
      console.error(`copy check: ${rel} is missing. Run the build first.`);
      return 2;
    }
    targets.push({ rel, items: extractCopy(fs.readFileSync(absolute, "utf8")) });
  }
  for (const name of REQUIRED_SNAPSHOTS) {
    const rel = path.join(copyDir, name);
    const absolute = path.resolve(base, rel);
    if (!fs.existsSync(absolute)) {
      console.error(`copy check: ${rel} is missing. Run the build first.`);
      return 2;
    }
    targets.push({ rel, items: extractCopy(fs.readFileSync(absolute, "utf8")) });
  }
  const sourceDir = path.resolve(base, options.sourceDir ?? SOURCE_DIR);
  for (const file of sourceFiles(sourceDir)) {
    targets.push({ rel: path.relative(base, file), items: extractSourceCopy(fs.readFileSync(file, "utf8"), file) });
  }
  let failed = false;
  let total = 0;
  for (const { rel, items } of targets) {
    total += items.length;
    const issues = checkCopy(items, banned);
    for (const issue of issues) console.log(`${rel}: ${issue.rule} in copy item ${issue.item}`);
    if (issues.length) failed = true;
  }
  if (!failed) console.log(`copy check: ${targets.length} files, ${total} items, clean`);
  return failed ? 1 : 0;
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const args = process.argv.slice(2);
  process.exit(main(args.length ? { files: args } : {}));
}
