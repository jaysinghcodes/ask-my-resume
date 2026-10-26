/**
 * The built knowledge base for the chat function (T7): kb/kb.json and the search_docs
 * index in kb/docs-index.json, both written by `npm run kb:build`. Loaded once per
 * instance with require, so the Vercel file tracer bundles both files.
 */

import { createRequire } from "module";
import { loadDocsIndex } from "./docs-index.js";

const require = createRequire(import.meta.url);

/**
 * @typedef {Record<string, any>} KbRecord
 * @typedef {"profile" | "role" | "bullet" | "project" | "skill" | "education" | "achievement" | "certification" | "faq" | "doc" | "source"} RecordKind
 * @typedef {{ kind: RecordKind, record: KbRecord }} IndexedRecord
 */

/** @type {Record<string, any> | null} */
let kbCache = null;
/** @type {import("minisearch").default | null} */
let indexCache = null;
/** @type {Map<string, IndexedRecord> | null} */
let recordsCache = null;

/** @returns {Record<string, any>} */
export function getKb() {
  if (!kbCache) kbCache = require("../kb/kb.json");
  return /** @type {Record<string, any>} */ (kbCache);
}

/** @returns {import("minisearch").default} */
export function getDocsIndex() {
  if (!indexCache) indexCache = loadDocsIndex(JSON.stringify(require("../kb/docs-index.json")));
  return indexCache;
}

/** Collections in kb.json and the kind of record each holds. */
const COLLECTIONS = /** @type {const} */ ([
  ["roles", "role"],
  ["bullets", "bullet"],
  ["projects", "project"],
  ["skills", "skill"],
  ["education", "education"],
  ["achievements", "achievement"],
  ["certifications", "certification"],
  ["faqs", "faq"],
  ["docs", "doc"],
  ["sources", "source"],
]);

/**
 * Every public KB record by id. Only these ids are real cites.
 * @returns {Map<string, IndexedRecord>}
 */
export function getRecords() {
  if (recordsCache) return recordsCache;
  const kb = getKb();
  /** @type {Map<string, IndexedRecord>} */
  const records = new Map();
  if (kb.profile?.id) records.set(kb.profile.id, { kind: "profile", record: kb.profile });
  for (const [key, kind] of COLLECTIONS) {
    for (const record of Array.isArray(kb[key]) ? kb[key] : []) {
      if (record && typeof record.id === "string" && record.public !== false) records.set(record.id, { kind, record });
    }
  }
  recordsCache = records;
  return records;
}

/** @returns {string[]} */
export function recordIds() {
  return [...getRecords().keys()];
}

/**
 * True when a record's only source is the older resume Jay approved (cited as "Earlier resume").
 * @param {KbRecord} record
 */
export function isEarlierResume(record) {
  const sources = Array.isArray(record.source) ? record.source : [record.source];
  const texts = sources.filter((value) => typeof value === "string");
  return texts.some((value) => value.startsWith("resume_2024")) && !texts.some((value) => value.startsWith("resume_2026"));
}

/** For tests: drop the cached KB so a rebuilt kb.json is read again. */
export function resetKbCache() {
  kbCache = null;
  indexCache = null;
  recordsCache = null;
}
