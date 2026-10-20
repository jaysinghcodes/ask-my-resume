/**
 * Copy check for the built site (T13). Scans frontend/dist/index.html, which holds the
 * prerendered home page, the meta tags and the Person JSON LD, for:
 *   dash punctuation (em or en dash, a spaced hyphen, a double hyphen),
 *   arrows (Unicode arrows, "->", "<-", "=>"),
 *   phone numbers (the same rule as scripts/phone-scan.mjs),
 *   KB_BANNED_TERMS (comma separated, from the environment; skipped when unset).
 * Output names the file, the rule and the item number only, never the matched text,
 * so a banned term is not echoed into CI logs.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "html-entities";
import { findPhoneHits } from "./phone-scan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_FILES = ["frontend/dist/index.html"];

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
      out.push(decode(value[1]));
    }
  }
  for (const text of body.replace(/<[^>]+>/g, "\n").split("\n")) {
    const value = decode(text).trim();
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
 * @param {string[]} [files]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function main(files = DEFAULT_FILES, env = process.env) {
  const banned = parseBannedTerms(env.KB_BANNED_TERMS);
  if (banned.length === 0) console.log("KB_BANNED_TERMS is unset. Banned term check skipped.");
  let failed = false;
  for (const rel of files) {
    const absolute = path.resolve(root, rel);
    if (!fs.existsSync(absolute)) {
      console.error(`copy check: ${rel} is missing. Run the build first.`);
      return 2;
    }
    const items = extractCopy(fs.readFileSync(absolute, "utf8"));
    const issues = checkCopy(items, banned);
    for (const issue of issues) console.log(`${rel}: ${issue.rule} in copy item ${issue.item}`);
    if (issues.length) failed = true;
    else console.log(`copy check: ${rel}, ${items.length} items, clean`);
  }
  return failed ? 1 : 0;
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) process.exit(main(process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FILES));
