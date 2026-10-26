/**
 * Validate kb/ and write the public kb.json.
 * The Vite app and the functions both import kb/kb.json.
 *
 * Every record needs id, source, as_of, confidence, public, and notes.
 * source is a non empty string or a non empty array of strings.
 * An empty source is a missing source.
 * Bullets also need resume_text, display_text, metrics, skills, story, and show_on_page.
 *
 * Public output leaves out records with public set to false or confidence unsure.
 * It also drops nested objects with public set to false, and any field named
 * notes, private, private_notes, or level_internal.
 * open_questions.json is validated and is never copied into kb.json.
 * Phone checks normalize every key and value, then reject a run of 10 or more digits.
 * Look alike letters, spelled digits and vanity numbers count, per lib/phone-rules.js.
 * A number split across two fields is out of scope.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import { decode } from "html-entities";
import { collapseSpace, normalizeCasedText, normalizeText, removeSpace } from "./text-normalize.js";
import {
  ISO_DATE_SOURCE,
  SEPARATOR_CLASS,
  SPELLED_DIGITS,
  UUID_SOURCE,
  findVanity,
  isRealCalendarDate,
  isValidUuid,
  mapLetterDigits,
  spelledToDigits,
} from "./phone-rules.js";
import { stripLiteralCode } from "./doc-text.js";

const SCHEMA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../kb/schema");

const STRIP_KEYS = new Set(["level_internal", "notes", "private_notes", "private"]);

const DISPLAY_KEYS = new Set([
  "display_text",
  "summary",
  "summary_third_person",
  "answer",
  "one_liner",
  "headline",
  "headline_support",
  "display_name",
  "preferred_name",
  "full_name",
  "availability",
  "work_preferences",
  "contact_blurb",
  "growth_area",
  "work_authorization",
  "location",
  "timezone",
  "description",
  "question",
  "rule",
  "suggested_redirect",
  "title",
  "name",
  "problem",
  "approach",
  "decisions",
  "result",
  "jay_owned",
  "team",
  "interview_answer",
  "what_jay_built",
  "architecture",
  "learned",
  "scope",
  "worked_with",
  "why_joined_or_left",
  "client_description",
  "text",
  "alt",
  "label",
  "quote",
  "principle",
  "display",
  "credit",
  "key_decisions",
  "honors",
  "activities",
  "outside_work",
  "employer",
  "school",
  "degree",
  "field",
  "heading",
  "body",
  "value",
]);

const TERM_PLACEHOLDER = "your_terms_here";

const ISO_DATE = new RegExp(ISO_DATE_SOURCE, "gi");

const UUID_TOKEN = new RegExp(UUID_SOURCE, "gi");

/** Normalized text folds O to o and I to i, so i stands in for I here. */
const LETTER_DIGITS = { o: "0", l: "1", i: "1" };

const COMPOUND_HYPHEN = /[A-Za-z][A-Za-z0-9]*-[A-Za-z0-9]+/;

const URL_PATTERN = /https?:\/\/[^\s<>\])"']+/gi;

/** @type {Ajv | null} */
let compiled = null;

/**
 * @typedef {Object} SchemaError
 * @property {string} [instancePath]
 * @property {string} [keyword]
 * @property {string} [message]
 * @property {string} [propertyName]
 * @property {Record<string, unknown>} [params]
 */

/**
 * @typedef {Object} LabeledRecord
 * @property {string} label
 * @property {Record<string, unknown>} record
 */

/**
 * @typedef {Object} KnowledgeBase
 * @property {{ built_at: string }} meta
 * @property {Record<string, unknown> | null} profile
 * @property {Record<string, unknown>[]} roles
 * @property {Record<string, unknown>[]} bullets
 * @property {Record<string, unknown>[]} projects
 * @property {Record<string, unknown>[]} skills
 * @property {Record<string, unknown>[]} education
 * @property {Record<string, unknown>[]} achievements
 * @property {Record<string, unknown>[]} certifications
 * @property {string} values
 * @property {Record<string, unknown>[]} faqs
 * @property {Record<string, unknown>[]} never_say
 * @property {Record<string, unknown>[]} docs
 * @property {Record<string, unknown>[]} sources
 */

/**
 * @typedef {Object} SourceData
 * @property {unknown} profile
 * @property {unknown} roles
 * @property {unknown} bullets
 * @property {unknown} projects
 * @property {unknown} skills
 * @property {unknown} education
 * @property {unknown} achievements
 * @property {unknown} certifications
 * @property {unknown} faqs
 * @property {unknown} neverSay
 * @property {string} values
 * @property {LabeledRecord[]} docs
 * @property {unknown[]} openQuestions
 * @property {unknown} allowlist
 * @property {unknown} sources
 */

/**
 * @typedef {Object} BuildResult
 * @property {boolean} ok
 * @property {string[]} warnings
 * @property {string[]} errors
 * @property {KnowledgeBase | null} kb
 */

/**
 * @param {{ kbDir: string, outPath: string, env?: NodeJS.ProcessEnv, now?: string }} options
 * @returns {BuildResult}
 */
export function buildKnowledgeBase(options) {
  const warnings = [];
  const errors = [];
  const env = options.env || {};
  const terms = readBannedTerms(env, warnings);
  const data = readSources(options.kbDir, errors);
  const phrases = readPhrases(data.allowlist);

  validateSources(data, errors);
  checkRecords(data, errors);
  const phoneAllow = readPhoneAllowlist(options.kbDir, errors);
  checkPhones(data, phoneAllow, errors);
  checkDisplay(data, phrases, errors);
  checkBannedTerms(data, terms, errors);

  if (errors.length > 0) {
    removeOutput(options.outPath);
    return { ok: false, warnings, errors, kb: null };
  }

  const builtAt = builtAtFrom(options.now, errors);
  if (errors.length > 0) {
    removeOutput(options.outPath);
    return { ok: false, warnings, errors, kb: null };
  }

  const kb = publish(data, builtAt);
  writeOutput(options.outPath, kb);
  return { ok: true, warnings, errors, kb };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string[]} warnings
 * @returns {string[]}
 */
function readBannedTerms(env, warnings) {
  const value = env.KB_BANNED_TERMS;
  if (typeof value !== "string" || value.trim() === "") {
    warnings.push("KB_BANNED_TERMS is unset. Banned term check skipped.");
    return [];
  }
  let raw = value.trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1);
  }
  const terms = raw
    .split(",")
    .map((term) => term.trim())
    .filter((term) => term && term !== TERM_PLACEHOLDER);
  if (terms.length === 0) {
    warnings.push("KB_BANNED_TERMS is unset. Banned term check skipped.");
  }
  return terms;
}

/**
 * @param {string} kbDir
 * @param {string[]} errors
 * @returns {SourceData}
 */
function readSources(kbDir, errors) {
  return {
    profile: readRequiredJson(kbDir, "profile.json", errors),
    roles: readRequiredJson(kbDir, "roles.json", errors),
    bullets: readRequiredJson(kbDir, "bullets.json", errors),
    projects: readRequiredJson(kbDir, "projects.json", errors),
    skills: readRequiredJson(kbDir, "skills.json", errors),
    education: readRequiredJson(kbDir, "education.json", errors),
    achievements: readRequiredJson(kbDir, "achievements.json", errors),
    certifications: readRequiredJson(kbDir, "certifications.json", errors),
    faqs: readRequiredJson(kbDir, "faqs.json", errors),
    neverSay: readRequiredJson(kbDir, "never_say.json", errors),
    values: readValues(kbDir, errors),
    docs: readDocs(kbDir, errors),
    openQuestions: readOpenQuestions(kbDir, errors),
    allowlist: readAllowlist(kbDir, errors),
    sources: readSourcesFile(kbDir, errors),
  };
}

/**
 * @param {string} kbDir
 * @param {string} name
 * @param {string[]} errors
 * @returns {unknown}
 */
function readRequiredJson(kbDir, name, errors) {
  const label = `kb/${name}`;
  const full = path.join(kbDir, name);
  if (!fs.existsSync(full)) {
    errors.push(`${label}: file is missing`);
    return undefined;
  }
  return readJsonFile(full, label, errors);
}

/**
 * @param {string} full
 * @param {string} label
 * @param {string[]} errors
 * @returns {unknown}
 */
function readJsonFile(full, label, errors) {
  const text = fs.readFileSync(full, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    errors.push(`${label}: invalid JSON`);
    return undefined;
  }
}

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
function listOf(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * @param {string} kbDir
 * @param {string[]} errors
 * @returns {string}
 */
function readValues(kbDir, errors) {
  const full = path.join(kbDir, "values.md");
  if (!fs.existsSync(full)) {
    errors.push("kb/values.md: file is missing");
    return "";
  }
  return fs.readFileSync(full, "utf8");
}

/**
 * @param {string} kbDir
 * @param {string[]} errors
 * @returns {unknown}
 */
function readAllowlist(kbDir, errors) {
  const full = path.join(kbDir, "allowlist.json");
  if (!fs.existsSync(full)) {
    errors.push("kb/allowlist.json: file is missing");
    return undefined;
  }
  return readJsonFile(full, "kb/allowlist.json", errors);
}

/**
 * @param {unknown} allowlist
 * @returns {string[]}
 */
function readPhrases(allowlist) {
  if (!allowlist || typeof allowlist !== "object" || Array.isArray(allowlist)) return [];
  const phrases = /** @type {{ phrases?: unknown }} */ (allowlist).phrases;
  if (!Array.isArray(phrases)) return [];
  return phrases.filter((item) => typeof item === "string" && item.length > 0);
}

/**
 * @param {string} kbDir
 * @param {string[]} errors
 * @returns {LabeledRecord[]}
 */
function readDocs(kbDir, errors) {
  const docsDir = path.join(kbDir, "docs");
  if (!fs.existsSync(docsDir)) return [];
  /** @type {string[]} */
  const files = [];
  collectJson(docsDir, files);
  files.sort();
  /** @type {LabeledRecord[]} */
  const labeled = [];
  for (const file of files) {
    const rel = path.relative(kbDir, file).split(path.sep).join("/");
    const label = `kb/${rel}`;
    const data = readJsonFile(file, label, errors);
    if (data === undefined) continue;
    validateJson(label, "https://ask-jay.local/schema/docs.json", data, errors);
    pushRecords(labeled, label, data);
  }
  return labeled;
}

/**
 * @param {string} dir
 * @param {string[]} files
 */
function collectJson(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJson(full, files);
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(full);
  }
}

/**
 * @param {string} kbDir
 * @param {string[]} errors
 * @returns {unknown}
 */
function readSourcesFile(kbDir, errors) {
  const full = path.join(kbDir, "sources.json");
  if (!fs.existsSync(full)) return [];
  const data = readJsonFile(full, "kb/sources.json", errors);
  return data === undefined ? [] : data;
}

/**
 * @param {string} kbDir
 * @param {string[]} errors
 * @returns {unknown[]}
 */
function readOpenQuestions(kbDir, errors) {
  const full = path.join(kbDir, "open_questions.json");
  if (!fs.existsSync(full)) return [];
  const data = readJsonFile(full, "kb/open_questions.json", errors);
  if (data === undefined) return [];
  validateJson("kb/open_questions.json", "https://ask-jay.local/schema/open_questions.json", data, errors);
  return Array.isArray(data) ? data : [];
}

/**
 * @param {SourceData} data
 * @param {string[]} errors
 */
function validateSources(data, errors) {
  validateJson("kb/profile.json", "https://ask-jay.local/schema/profile.json", data.profile, errors);
  validateJson("kb/roles.json", "https://ask-jay.local/schema/roles.json", data.roles, errors);
  validateJson("kb/bullets.json", "https://ask-jay.local/schema/bullets.json", data.bullets, errors);
  validateJson("kb/projects.json", "https://ask-jay.local/schema/projects.json", data.projects, errors);
  validateJson("kb/skills.json", "https://ask-jay.local/schema/skills.json", data.skills, errors);
  validateJson("kb/education.json", "https://ask-jay.local/schema/education.json", data.education, errors);
  validateJson("kb/achievements.json", "https://ask-jay.local/schema/achievements.json", data.achievements, errors);
  validateJson("kb/certifications.json", "https://ask-jay.local/schema/certifications.json", data.certifications, errors);
  validateJson("kb/faqs.json", "https://ask-jay.local/schema/faqs.json", data.faqs, errors);
  validateJson("kb/never_say.json", "https://ask-jay.local/schema/never_say.json", data.neverSay, errors);
  if (data.allowlist !== undefined) {
    validateJson("kb/allowlist.json", "https://ask-jay.local/schema/allowlist.json", data.allowlist, errors);
  }
  validateJson("kb/sources.json", "https://ask-jay.local/schema/sources.json", data.sources, errors);
}

/**
 * @param {string} label
 * @param {string} schemaId
 * @param {unknown} data
 * @param {string[]} errors
 */
function validateJson(label, schemaId, data, errors) {
  if (data === undefined) return;
  const validate = getAjv().getSchema(schemaId);
  if (!validate) {
    errors.push(`${label}: missing schema ${schemaId}`);
    return;
  }
  if (validate(data)) return;
  errors.push(...formatSchemaErrors(label, data, validate.errors || []));
}

/**
 * @returns {Ajv}
 */
function getAjv() {
  if (compiled) return compiled;
  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: true });
  for (const name of fs.readdirSync(SCHEMA_DIR)) {
    if (!name.endsWith(".json")) continue;
    const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), "utf8"));
    ajv.addSchema(schema);
  }
  compiled = ajv;
  return ajv;
}

/**
 * @param {string} label
 * @param {unknown} data
 * @param {SchemaError[]} schemaErrors
 * @returns {string[]}
 */
function formatSchemaErrors(label, data, schemaErrors) {
  /** @type {string[]} */
  const lines = [];
  const seen = new Set();
  for (const error of schemaErrors) {
    if (error.keyword === "if" || error.keyword === "not") continue;
    if (isSourceSchemaError(error)) continue;
    const propertyName = error.propertyName || stringParam(error.params, "propertyName");
    const id = nearestId(data, error.instancePath || "");
    let field = pointerField(error.instancePath || "");
    if (error.keyword === "propertyNames" || propertyName) {
      if (propertyName) field = field ? `${field}.${propertyName}` : propertyName;
      field = field.replace(/^(?:\[\d+\]\.?)+/, "");
      const reason = /mobile/i.test(propertyName) && !/phone/i.test(propertyName)
        ? "mobile fields are not allowed"
        : "phone fields are not allowed";
      const line = `${label} id=${id} field=${field || "(root)"}: ${reason}`;
      if (!seen.has(line)) {
        seen.add(line);
        lines.push(line);
      }
      continue;
    }
    const missing = stringParam(error.params, "missingProperty");
    if (error.keyword === "required" && missing) {
      field = field ? `${field}.${missing}` : missing;
    }
    field = field.replace(/^(?:\[\d+\]\.?)+/, "");
    const line = `${label} id=${id} field=${field || "(root)"}: ${error.message || "invalid"}`;
    if (!seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }
  return lines;
}

/**
 * @param {SchemaError} error
 * @returns {boolean}
 */
function isSourceSchemaError(error) {
  if (stringParam(error.params, "missingProperty") === "source") return true;
  const instancePath = error.instancePath || "";
  return instancePath === "/source" || instancePath.endsWith("/source");
}

/**
 * @param {Record<string, unknown> | undefined} params
 * @param {string} key
 * @returns {string}
 */
function stringParam(params, key) {
  const value = params?.[key];
  return typeof value === "string" ? value : "";
}

/**
 * @param {string} instancePath
 * @returns {string}
 */
function pointerField(instancePath) {
  const parts = instancePath.split("/").filter(Boolean).map(decodePointer);
  let field = "";
  for (const part of parts) {
    if (/^\d+$/.test(part)) field += `[${part}]`;
    else field = field ? `${field}.${part}` : part;
  }
  return field;
}

/**
 * @param {string} part
 * @returns {string}
 */
function decodePointer(part) {
  return part.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * @param {unknown} data
 * @param {string} instancePath
 * @returns {string}
 */
function nearestId(data, instancePath) {
  let id = idOf(data);
  let node = data;
  for (const part of instancePath.split("/").filter(Boolean).map(decodePointer)) {
    if (!node || typeof node !== "object") break;
    node = /** @type {Record<string, unknown>} */ (node)[part];
    const next = idOf(node);
    if (next) id = next;
  }
  return id || "(missing)";
}

/**
 * @param {unknown} node
 * @returns {string}
 */
function idOf(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return "";
  const id = /** @type {{ id?: unknown }} */ (node).id;
  return typeof id === "string" && id.trim() ? id : "";
}

/**
 * @param {SourceData} data
 * @param {string[]} errors
 */
function checkRecords(data, errors) {
  if (isRecord(data.profile)) checkSource("kb/profile.json", data.profile, errors);
  for (const [label, records] of collections(data)) {
    for (const record of records) {
      if (isRecord(record)) checkSource(label, record, errors);
    }
  }
  for (const entry of data.docs) checkSource(entry.label, entry.record, errors);
  for (const record of data.openQuestions) {
    if (isRecord(record)) checkSource("kb/open_questions.json", record, errors);
  }
  checkSkillEvidence(data, errors);
}

/**
 * A verified skill needs at least one evidence id. Unsure skills may omit it.
 * @param {SourceData} data
 * @param {string[]} errors
 */
function checkSkillEvidence(data, errors) {
  for (const record of listOf(data.skills)) {
    if (!isRecord(record) || record.confidence !== "verified") continue;
    const ids = record.evidence_ids;
    const present = Array.isArray(ids) && ids.some((id) => typeof id === "string" && id.trim() !== "");
    if (present) continue;
    const id = idOf(record) || "(missing)";
    errors.push(`kb/skills.json id=${id} field=evidence_ids: missing evidence`);
  }
}

/**
 * @param {string} label
 * @param {Record<string, unknown>} record
 * @param {string[]} errors
 */
function checkSource(label, record, errors) {
  if (!sourceMissing(record.source)) return;
  const id = idOf(record) || "(missing)";
  errors.push(`${label} id=${id} field=source: missing source`);
}

/**
 * @param {unknown} source
 * @returns {boolean}
 */
function sourceMissing(source) {
  if (typeof source === "string") return source.trim() === "";
  if (Array.isArray(source)) {
    if (source.length === 0) return true;
    return source.some((item) => typeof item !== "string" || item.trim() === "");
  }
  return true;
}

/**
 * @param {string} kbDir
 * @param {string[]} errors
 * @returns {string[]}
 */
function readPhoneAllowlist(kbDir, errors) {
  const full = path.join(kbDir, "phone-allowlist.txt");
  if (!fs.existsSync(full)) return [];
  /** @type {string[]} */
  const tokens = [];
  fs.readFileSync(full, "utf8").split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const tab = line.indexOf("\t");
    const token = tab === -1 ? "" : line.slice(0, tab).trim();
    const reason = tab === -1 ? "" : line.slice(tab + 1).trim();
    if (!token || !reason) {
      errors.push(`kb/phone-allowlist.txt line ${index + 1}: missing reason`);
      return;
    }
    tokens.push(token);
  });
  return tokens;
}

/**
 * A phone number split across two fields or two array items is out of scope.
 * @param {SourceData} data
 * @param {string[]} allowTokens
 * @param {string[]} errors
 */
function checkPhones(data, allowTokens, errors) {
  const allowed = allowTokens.map((token) => collapseSpace(normalizeText(token))).filter(Boolean);
  if (isRecord(data.profile)) checkPhoneRecord("kb/profile.json", data.profile, allowed, errors);
  else if (data.profile !== null && data.profile !== undefined) {
    checkPhoneValue("kb/profile.json", "(missing)", "", data.profile, allowed, errors);
  }
  for (const [label, records] of collections(data)) {
    records.forEach((record, index) => {
      if (isRecord(record)) checkPhoneRecord(label, record, allowed, errors);
      else checkPhoneValue(label, "(missing)", `[${index}]`, record, allowed, errors);
    });
  }
  for (const entry of data.docs) checkPhoneRecord(entry.label, entry.record, allowed, errors);
  for (const record of data.openQuestions) {
    if (isRecord(record)) checkPhoneRecord("kb/open_questions.json", record, allowed, errors);
  }
  if (containsPhone(data.values, allowed)) {
    errors.push("kb/values.md id=values field=body: phone number");
  }
  checkPhoneValue("kb/allowlist.json", "allowlist", "", data.allowlist, allowed, errors);
}

/**
 * @param {string} label
 * @param {Record<string, unknown>} record
 * @param {string[]} allowed
 * @param {string[]} errors
 */
function checkPhoneRecord(label, record, allowed, errors) {
  const id = idOf(record) || "(missing)";
  checkPhoneValue(label, id, "", record, allowed, errors);
}

/**
 * @param {string} label
 * @param {string} id
 * @param {string} pathName
 * @param {unknown} value
 * @param {string[]} allowed
 * @param {string[]} errors
 */
function checkPhoneValue(label, id, pathName, value, allowed, errors) {
  walkStrings(value, pathName, (field, text) => {
    if (!containsPhone(text, allowed)) return;
    errors.push(`${label} id=${id} field=${field || "(root)"}: phone number`);
  });
}

/**
 * @param {string} raw
 * @param {string[]} allowed
 * @returns {boolean}
 */
function containsPhone(raw, allowed) {
  if (!raw) return false;
  // Decode before the skeleton. confusables.txt rewrites "%" and "&", and maps
  // a pipe to l, so a pipe becomes a middle dot first to stay a separator.
  const decoded = decodeHtmlEntities(decodePercents(String(raw))).normalize("NFKC").replace(/\|/g, "\u00B7");
  if (findVanity(normalizeCasedText(decoded)).length > 0) return true;
  let text = maskStructured(collapseSpace(normalizeText(decoded)), allowed);
  text = text.replace(SPELLED_DIGITS, spelledToDigits);
  text = mapLetterDigits(text, LETTER_DIGITS);
  text = dropSingleSeparators(text);
  text = maskSafeHexHashes(text);
  return /(?<!\d)\d{10,}(?!\d)/.test(text);
}

/**
 * @param {string} text
 * @returns {string}
 */
function decodePercents(text) {
  return text.replace(/%([0-9a-f]{2})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

/**
 * @param {string} text
 * @returns {string}
 */
function decodeHtmlEntities(text) {
  return decode(text);
}

/**
 * Drop valid UUIDs, real calendar dates, and exact allowlisted tokens before
 * separators join digits. A UUID or date shape that is not valid stays.
 * @param {string} text
 * @param {string[]} allowed
 * @returns {string}
 */
function maskStructured(text, allowed) {
  let next = text
    .replace(ISO_DATE, (token) => (isRealCalendarDate(token) ? " " : token))
    .replace(UUID_TOKEN, (token) => (isValidUuid(token) ? " " : token));
  for (const token of allowed) {
    if (!token) continue;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`(?<![0-9a-z])${escaped}(?![0-9a-z])`, "g"), " ");
  }
  return next;
}

/**
 * A hex hash is a whole token of 7 to 40 hex characters with a letter.
 * A run of 10 or more digits at the start or end still fails.
 * @param {string} text
 * @returns {string}
 */
function maskSafeHexHashes(text) {
  return text.replace(/(?<![0-9a-z])[0-9a-f]{7,40}(?![0-9a-z])/g, (token) => {
    if (!/[a-f]/.test(token)) return token;
    if (/^\d{10,}/.test(token) || /\d{10,}$/.test(token)) return token;
    return " ";
  });
}

/**
 * Remove separators that sit between two digits, including a short run of them, and repeat.
 * @param {string} text
 * @returns {string}
 */
function dropSingleSeparators(text) {
  const separator = new RegExp(`(\\d)[${SEPARATOR_CLASS}]+(\\d)`, "g");
  let prev = "";
  let next = text;
  while (next !== prev) {
    prev = next;
    next = prev.replace(separator, "$1$2");
  }
  return next;
}

/**
 * @param {SourceData} data
 * @param {string[]} phrases
 * @param {string[]} errors
 */
function checkDisplay(data, phrases, errors) {
  if (isRecord(data.profile)) {
    walkDisplay(data.profile, "", (field, text) => {
      reportPunctuation("kb/profile.json", idOf(data.profile) || "(missing)", field, text, phrases, errors, false);
    });
  }
  for (const [label, records] of collections(data)) {
    for (const record of records) {
      if (!isRecord(record)) continue;
      const id = idOf(record) || "(missing)";
      walkDisplay(record, "", (field, text) => {
        reportPunctuation(label, id, field, text, phrases, errors, false);
      });
    }
  }
  for (const entry of data.docs) {
    const id = idOf(entry.record) || "(missing)";
    walkDisplay(entry.record, "", (field, text) => {
      reportPunctuation(entry.label, id, field, text, phrases, errors, true);
    });
  }
  reportPunctuation("kb/values.md", "values", "body", data.values, phrases, errors, false);
}

/**
 * @param {string} label
 * @param {string} id
 * @param {string} field
 * @param {string} text
 * @param {string[]} phrases
 * @param {string[]} errors
 * @param {boolean} keepCode
 */
function reportPunctuation(label, id, field, text, phrases, errors, keepCode) {
  for (const issue of punctuationIssues(text, phrases, keepCode)) {
    errors.push(`${label} id=${id} field=${field}: ${issue}`);
  }
}

/**
 * @param {unknown} value
 * @param {string} pathName
 * @param {(field: string, text: string) => void} onText
 */
function walkDisplay(value, pathName, onText) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkDisplay(item, `${pathName}[${index}]`, onText));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "resume_text") continue;
    const childPath = pathName ? `${pathName}.${key}` : key;
    if (key === "story") {
      walkStory(child, childPath, onText);
      continue;
    }
    if (DISPLAY_KEYS.has(key)) {
      collectDisplay(child, childPath, onText);
      continue;
    }
    if (child && typeof child === "object") walkDisplay(child, childPath, onText);
  }
}

/**
 * @param {unknown} value
 * @param {string} pathName
 * @param {(field: string, text: string) => void} onText
 */
function collectDisplay(value, pathName, onText) {
  if (typeof value === "string") {
    onText(pathName, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectDisplay(item, `${pathName}[${index}]`, onText));
    return;
  }
  if (value && typeof value === "object") walkDisplay(value, pathName, onText);
}

/**
 * @param {unknown} value
 * @param {string} pathName
 * @param {(field: string, text: string) => void} onText
 */
function walkStory(value, pathName, onText) {
  if (typeof value === "string") {
    onText(pathName, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStory(item, `${pathName}[${index}]`, onText));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "resume_text") continue;
    walkStory(child, `${pathName}.${key}`, onText);
  }
}

/**
 * @param {string} raw
 * @param {string[]} phrases
 * @param {boolean} keepCode
 * @returns {string[]}
 */
function punctuationIssues(raw, phrases, keepCode) {
  const visible = keepCode ? stripLiteralCode(raw) : raw;
  const text = stripExempt(visible, phrases);
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
 * @param {string} text
 * @returns {boolean}
 */
function hasArrow(text) {
  const forms = ["-" + ">", "=" + ">", "<" + "-", "<" + "="];
  if (forms.some((form) => text.includes(form))) return true;
  return /[\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F]/.test(text);
}

/**
 * @param {string} raw
 * @param {string[]} phrases
 * @returns {string}
 */
function stripExempt(raw, phrases) {
  URL_PATTERN.lastIndex = 0;
  let text = raw.replace(URL_PATTERN, " ");
  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  for (const phrase of sorted) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(escaped, "gi"), " ");
  }
  return text;
}

/**
 * @param {SourceData} data
 * @param {string[]} terms
 * @param {string[]} errors
 */
function checkBannedTerms(data, terms, errors) {
  if (terms.length === 0) return;
  if (isRecord(data.profile)) checkBannedRecord("kb/profile.json", data.profile, terms, errors);
  for (const [label, records] of collections(data)) {
    for (const record of records) {
      if (isRecord(record)) checkBannedRecord(label, record, terms, errors);
    }
  }
  for (const entry of data.docs) checkBannedRecord(entry.label, entry.record, terms, errors);
  for (const record of data.openQuestions) {
    if (isRecord(record)) checkBannedRecord("kb/open_questions.json", record, terms, errors);
  }
  reportBanned("kb/values.md", "values", "body", data.values, terms, errors);
}

/**
 * @param {string} label
 * @param {Record<string, unknown>} record
 * @param {string[]} terms
 * @param {string[]} errors
 */
function checkBannedRecord(label, record, terms, errors) {
  if (record.public === false) return;
  const id = idOf(record) || "(missing)";
  walkBanned(
    record,
    "",
    (field, text) => {
      reportBanned(label, id, field, text, terms, errors);
    },
    (field, key) => {
      reportBanned(label, id, field, key, terms, errors);
    },
  );
}

/**
 * @param {string} label
 * @param {string} id
 * @param {string} field
 * @param {string} text
 * @param {string[]} terms
 * @param {string[]} errors
 */
function reportBanned(label, id, field, text, terms, errors) {
  const collapsedHay = collapseSpace(normalizeText(text));
  const tightHay = removeSpace(collapsedHay);
  for (const term of terms) {
    const collapsedNeedle = collapseSpace(normalizeText(term));
    const tightNeedle = removeSpace(collapsedNeedle);
    const collapsedHit = collapsedNeedle && collapsedHay.includes(collapsedNeedle);
    const tightHit = tightNeedle && tightHay.includes(tightNeedle);
    if (collapsedHit || tightHit) {
      errors.push(`${label} id=${id} field=${field || "(root)"}: banned term`);
      return;
    }
  }
}

/**
 * @param {unknown} value
 * @param {string} pathName
 * @param {(field: string, text: string) => void} onText
 * @param {(field: string, key: string) => void} [onKey]
 */
function walkBanned(value, pathName, onText, onKey) {
  if (typeof value === "string" || typeof value === "number") {
    onText(pathName, typeof value === "number" ? String(value) : value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (isNonPublicObject(item)) return;
      walkBanned(item, `${pathName}[${index}]`, onText, onKey);
    });
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const next = pathName ? `${pathName}.${key}` : key;
    if (onKey) onKey(next, key);
    if (isNonPublicObject(child)) continue;
    walkBanned(child, next, onText, onKey);
  }
}

/**
 * @param {unknown} value
 * @param {string} pathName
 * @param {(field: string, text: string) => void} onText
 */
function walkStrings(value, pathName, onText) {
  if (typeof value === "string" || typeof value === "number") {
    onText(pathName, typeof value === "number" ? String(value) : value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, `${pathName}[${index}]`, onText));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const next = pathName ? `${pathName}.${key}` : key;
    onText(next, key);
    walkStrings(child, next, onText);
  }
}

/**
 * @param {SourceData} data
 * @returns {[string, unknown[]][]}
 */
function collections(data) {
  return [
    ["kb/roles.json", listOf(data.roles)],
    ["kb/bullets.json", listOf(data.bullets)],
    ["kb/projects.json", listOf(data.projects)],
    ["kb/skills.json", listOf(data.skills)],
    ["kb/education.json", listOf(data.education)],
    ["kb/achievements.json", listOf(data.achievements)],
    ["kb/certifications.json", listOf(data.certifications)],
    ["kb/faqs.json", listOf(data.faqs)],
    ["kb/never_say.json", listOf(data.neverSay)],
    ["kb/sources.json", listOf(data.sources)],
  ];
}

/**
 * @param {LabeledRecord[]} labeled
 * @param {string} label
 * @param {unknown} data
 */
function pushRecords(labeled, label, data) {
  const records = Array.isArray(data) ? data : [data];
  for (const record of records) {
    if (isRecord(record)) labeled.push({ label, record });
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonPublicObject(value) {
  return isRecord(value) && value.public === false;
}

/**
 * @param {string | undefined} now
 * @param {string[]} errors
 * @returns {string}
 */
function builtAtFrom(now, errors) {
  // meta.built_at is the UTC calendar date.
  const date = now ? new Date(now) : new Date();
  if (Number.isNaN(date.getTime())) {
    errors.push("kb.json id=meta field=built_at: invalid build date");
    return "";
  }
  return date.toISOString().slice(0, 10);
}

/**
 * @param {SourceData} data
 * @param {string} builtAt
 * @returns {KnowledgeBase}
 */
function publish(data, builtAt) {
  return {
    meta: { built_at: builtAt },
    profile: publishRecord(data.profile),
    roles: publishList(listOf(data.roles)),
    bullets: publishList(listOf(data.bullets)),
    projects: publishList(listOf(data.projects)),
    skills: publishList(listOf(data.skills)),
    education: publishList(listOf(data.education)),
    achievements: publishList(listOf(data.achievements)),
    certifications: publishList(listOf(data.certifications)),
    values: data.values,
    faqs: publishList(listOf(data.faqs)),
    never_say: publishList(listOf(data.neverSay)),
    docs: data.docs.map((entry) => publishRecord(entry.record)).filter(isPublicRecord),
    sources: publishList(listOf(data.sources)),
  };
}

/**
 * @param {Record<string, unknown> | null} record
 * @returns {record is Record<string, unknown>}
 */
function isPublicRecord(record) {
  return record !== null;
}

/**
 * @param {unknown} record
 * @returns {Record<string, unknown> | null}
 */
function publishRecord(record) {
  if (record == null) return null;
  if (!isRecord(record)) return null;
  if (record.public === false || record.confidence === "unsure") return null;
  const stripped = stripValue(record);
  if (!isRecord(stripped)) return null;
  return stripped;
}

/**
 * @param {unknown[]} records
 * @returns {Record<string, unknown>[]}
 */
function publishList(records) {
  /** @type {Record<string, unknown>[]} */
  const out = [];
  for (const record of records) {
    const next = publishRecord(record);
    if (next) out.push(next);
  }
  return out;
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function stripValue(value) {
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      if (isNonPublicObject(item)) continue;
      out.push(stripValue(item));
    }
    return out;
  }
  if (isRecord(value)) {
    if (value.public === false) return undefined;
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (STRIP_KEYS.has(key)) continue;
      const next = stripValue(child);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return value;
}

/**
 * @param {string} outPath
 * @param {KnowledgeBase} kb
 */
function writeOutput(outPath, kb) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(kb, null, 2)}\n`);
}

/**
 * @param {string} outPath
 */
function removeOutput(outPath) {
  if (outPath && fs.existsSync(outPath)) fs.rmSync(outPath);
}
