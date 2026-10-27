/**
 * Citations for chat answers (T7). The model ends each claim with [record id]. This
 * module maps ids to the labels and link targets the page shows in its Sources list,
 * drops any id that is not a public KB record, and holds the dash safety net.
 */

import { getRecords, isEarlierResume } from "./kb-data.js";

/** A KB id cite. A bare number like [1] is not a cite (Atlas ruling, PR #30 r3). */
export const CITE_PATTERN = /\[([A-Za-z][\w.:-]{0,79})\](?!\()/g;

/** @typedef {{ id: string, label: string, href?: string }} AnswerSource */

/**
 * A doc title in label case: plain capitalized words go lower case ("Architecture" to
 * "architecture"), while acronyms and names like API, README and OpenClaw stay as written.
 * @param {string | undefined} value
 */
function lower(value) {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .map((word) => (/^[A-Z][a-z]+$/.test(word) ? word.toLowerCase() : word))
    .join(" ");
}

/**
 * The Sources label and link for one record id, or null when the id is not a public record.
 * @param {string} id
 * @returns {AnswerSource | null}
 */
export function sourceFor(id) {
  const records = getRecords();
  const entry = records.get(id);
  if (!entry) return null;
  const { kind, record } = entry;
  /** @param {string} roleId */
  const roleOf = (roleId) => records.get(roleId)?.record ?? {};
  switch (kind) {
    case "bullet": {
      const role = roleOf(record.role_id);
      if (isEarlierResume(record)) return { id, label: `Earlier resume · ${role.employer}`, href: `#${record.role_id}` };
      return { id, label: `Resume · ${role.employer}, ${role.title} · bullet ${record.order}`, href: `#${record.role_id}` };
    }
    case "role":
      if (isEarlierResume(record)) return { id, label: `Earlier resume · ${record.employer}`, href: `#${id}` };
      return { id, label: `Resume · ${record.employer}, ${record.title}`, href: `#${id}` };
    case "project":
      return { id, label: `${record.name} · project`, href: `#${id}` };
    case "doc":
      return { id, label: `${record.project} · ${lower(record.title)} doc`, href: record.url };
    case "skill":
      return { id, label: `Resume · skills · ${record.display_name || record.name}`, href: "#skills" };
    case "education":
      return { id, label: `Resume · ${record.school}`, href: `#${id}` };
    case "achievement":
      return { id, label: `Achievement · ${record.title}` };
    case "certification":
      return { id, label: `Certification · ${record.name || record.title || id}` };
    case "faq":
      return { id, label: `Jay's answers · ${record.question}` };
    case "profile":
      return { id, label: "Profile" };
    case "source":
      return { id, label: record.title || "Resume" };
    default:
      return null;
  }
}

/** @typedef {{ type: "role" | "project", id: string }} AnswerScope */

/**
 * The record ids a scoped answer may cite (Atlas ruling, PR #34 product calls 1).
 * A role scope: the role, its bullets, and skills or achievements whose evidence points
 * at them. A project scope: the project, its doc chunks, and skills or achievements whose
 * evidence points at it.
 * @param {AnswerScope} scope
 * @returns {Set<string>}
 */
export function scopeIds(scope) {
  const records = getRecords();
  const target = records.get(scope.id);
  /** @type {Set<string>} */
  const ids = new Set();
  if (!target || target.kind !== scope.type) return ids;
  ids.add(scope.id);
  for (const [id, { kind, record }] of records) {
    if (scope.type === "role" && kind === "bullet" && record.role_id === scope.id) ids.add(id);
    if (scope.type === "project" && kind === "doc" && record.project === target.record.name) ids.add(id);
  }
  for (const [id, { kind, record }] of records) {
    const links = kind === "skill" ? record.evidence_ids : kind === "achievement" ? record.related_ids : null;
    if (Array.isArray(links) && links.some((link) => ids.has(link))) ids.add(id);
  }
  return ids;
}

/**
 * Whether an answer may cite this id: a public record, and inside the scope when the
 * request has one. Unknown and off scope ids are dropped the same way.
 * @param {AnswerScope} [scope]
 * @returns {(id: string) => boolean}
 */
export function citeAllowed(scope) {
  const records = getRecords();
  const inScope = scope ? scopeIds(scope) : null;
  return (id) => records.has(id) && (!inScope || inScope.has(id));
}

/**
 * Remove the cite markers an answer may not use, with the space before each one.
 * @param {string} text
 * @param {(id: string) => boolean} allowed
 */
export function stripCites(text, allowed) {
  const filter = createCiteFilter(allowed);
  return filter.push(String(text ?? "")) + filter.flush();
}

const CITE_AT = /^\[([A-Za-z][\w.:-]{0,79})\]/;
const CITE_PREFIX = /^\[(?:[A-Za-z][\w.:-]{0,79}\]?)?$/;

/**
 * A streaming filter that drops cite markers the answer may not use. It holds back a
 * possible marker (and the whitespace before it) until it can tell, so a marker split
 * across deltas is still caught. [x](url) is a link, not a cite, and is left alone.
 * @param {(id: string) => boolean} allowed
 * @returns {{ push: (text: string) => string, flush: () => string }}
 */
export function createCiteFilter(allowed) {
  let pending = "";
  let space = "";
  /**
   * @param {boolean} final
   */
  const run = (final) => {
    let out = "";
    let rest = pending;
    pending = "";
    /** @param {string} text */
    const plain = (text) => {
      if (!text) return;
      const trailing = text.match(/\s*$/)?.[0] ?? "";
      const body = text.slice(0, text.length - trailing.length);
      if (body) {
        out += space + body;
        space = trailing;
      } else {
        space += trailing;
      }
    };
    while (rest) {
      const open = rest.indexOf("[");
      if (open === -1) {
        plain(rest);
        break;
      }
      plain(rest.slice(0, open));
      rest = rest.slice(open);
      const match = rest.match(CITE_AT);
      if (match) {
        const after = rest.charAt(match[0].length);
        if (!after && !final) {
          pending = rest;
          break;
        }
        if (after === "(") {
          plain("[");
          rest = rest.slice(1);
          continue;
        }
        if (allowed(match[1])) {
          out += space + match[0];
          space = "";
        } else {
          space = "";
        }
        rest = rest.slice(match[0].length);
        continue;
      }
      if (!final && CITE_PREFIX.test(rest)) {
        pending = rest;
        break;
      }
      plain("[");
      rest = rest.slice(1);
    }
    return out;
  };
  return {
    push(text) {
      pending += String(text ?? "");
      return run(false);
    },
    flush() {
      const out = run(true);
      const tail = space;
      space = "";
      return out + tail;
    },
  };
}

/**
 * Sources for a finished answer, in order of first citation. Unknown ids are dropped,
 * and so are ids outside the request scope when there is one.
 * @param {string} text
 * @param {{ scope?: AnswerScope }} [options]
 * @returns {AnswerSource[]}
 */
export function sourcesForAnswer(text, options = {}) {
  const allowed = citeAllowed(options.scope);
  /** @type {AnswerSource[]} */
  const out = [];
  const seen = new Set();
  for (const match of String(text ?? "").matchAll(CITE_PATTERN)) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    if (!allowed(id)) continue;
    const source = sourceFor(id);
    if (source) out.push(source);
  }
  return out;
}

const DASH = /\s*[\u2013\u2014]\s*/g;

/**
 * The stream's dash safety net (#6 ruling): an em or en dash becomes a comma and a
 * space. It works on deltas, so a dash at the end of one chunk and the space at the
 * start of the next don't leave a double space. T8 measures the model before this step.
 * @returns {(text: string) => string}
 */
export function createDashNet() {
  let afterDash = false;
  return (text) => {
    let out = String(text ?? "");
    if (afterDash) out = out.replace(/^\s+/, "");
    if (!out) return out;
    out = out.replace(DASH, ", ");
    afterDash = /, $/.test(out) && /[\u2013\u2014]\s*$/.test(text);
    return out;
  };
}
