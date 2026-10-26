/**
 * Normalize keys and values before the phone and banned term checks.
 *
 * Order: NFKC, strip Unicode Cf, map decimal digits to ASCII, full case fold,
 * then the UTS #39 confusable skeleton. ASCII digits are not run through the
 * skeleton: confusables.txt maps 0 to O and 1 to l, which would hide a phone
 * number. Every other confusable still maps. The tables are the official
 * Unicode 18.0 files, license in each file header.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "unicode");

const SPACE = /[\t\n\r\f\v \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+/g;

const DASH = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;

/** @type {Map<string, string>} */
const caseFoldMap = loadCaseFold(fs.readFileSync(path.join(DATA_DIR, "CaseFolding.txt"), "utf8"));

/** @type {Map<string, string>} */
const confusableMap = loadConfusables(fs.readFileSync(path.join(DATA_DIR, "confusables.txt"), "utf8"));

/** @type {Map<string, string>} */
const decimalDigitMap = loadDecimalDigits(fs.readFileSync(path.join(DATA_DIR, "DerivedNumericValues.txt"), "utf8"));

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeText(raw) {
  const text = typeof raw === "number" ? String(raw) : String(raw ?? "");
  if (!text) return "";
  const compatible = foldDashes(foldDecimalDigits(text.normalize("NFKC").replace(/\p{Cf}/gu, "")));
  return caseFold(skeleton(caseFold(compatible)));
}

/**
 * The same steps without case folding, for checks that need upper case,
 * such as vanity phone numbers. The skeleton still maps confusables.
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeCasedText(raw) {
  const text = typeof raw === "number" ? String(raw) : String(raw ?? "");
  if (!text) return "";
  return skeleton(foldDashes(foldDecimalDigits(text.normalize("NFKC").replace(/\p{Cf}/gu, ""))));
}

/**
 * Collapse every whitespace run to one space.
 * @param {string} text
 * @returns {string}
 */
export function collapseSpace(text) {
  return text.replace(SPACE, " ");
}

/**
 * @param {string} text
 * @returns {string}
 */
export function removeSpace(text) {
  return text.replace(SPACE, "");
}

/**
 * @param {string} text
 * @returns {string}
 */
function foldDashes(text) {
  return text.replace(DASH, "-");
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
function caseFold(text) {
  let out = "";
  for (const ch of text) out += caseFoldMap.get(ch) ?? ch;
  return out;
}

/**
 * @param {string} text
 * @returns {string}
 */
function skeleton(text) {
  let mapped = "";
  for (const ch of text.normalize("NFD")) mapped += confusableMap.get(ch) ?? ch;
  return mapped.normalize("NFD");
}

/**
 * @param {string} text
 * @returns {Map<string, string>}
 */
function loadCaseFold(text) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(";");
    if (parts.length < 3) continue;
    const status = parts[1].trim();
    if (status !== "C" && status !== "F") continue;
    map.set(codePoint(parts[0]), codesToString(parts[2]));
  }
  return map;
}

/**
 * @param {string} text
 * @returns {Map<string, string>}
 */
function loadConfusables(text) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(";");
    if (parts.length < 2) continue;
    const src = codesToString(parts[0]);
    if ([...src].length !== 1) continue;
    // Leave ASCII digits as digits so a phone number is still a digit run.
    if (src >= "0" && src <= "9") continue;
    map.set(src, codesToString(parts[1]));
  }
  return map;
}

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
 * @param {string} field
 * @returns {string}
 */
function codesToString(field) {
  const pieces = field.trim().split(/\s+/).filter(Boolean);
  return pieces.map((hex) => String.fromCodePoint(Number.parseInt(hex, 16))).join("");
}
