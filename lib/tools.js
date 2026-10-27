/**
 * Tools for the Ask Jay agent (T7): search_docs over the kb/docs chunks and get_record
 * for one full KB record. The core KB rides in the cached system block, so these are
 * for project docs and for a record's full story.
 */

import { getDocsIndex, getKb, getRecords } from "./kb-data.js";

/** @type {import("@anthropic-ai/sdk").Anthropic.Tool[]} */
export const TOOLS = [
  {
    name: "search_docs",
    description:
      "Keyword search over Jay's project docs (architecture, readmes, API, security, demo scripts). Returns the best matching chunks with their record ids for citing. Use it for project details that are not in the knowledge base block.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords to look up, for example \"confidence gate\" or \"auth\"." },
        project: { type: "string", description: "Optional project name or id to search only that project, for example \"Cleat\" or \"project-cleat\"." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_record",
    description: "Return one knowledge base record in full by its id, including its story when Jay made it public.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", description: "A record id, for example \"bullet-captech-consultant-4\"." } },
      required: ["id"],
    },
  },
];

/** How many doc chunks search_docs returns, and how much text from each. */
export const SEARCH_LIMIT = 5;
const CHUNK_CHARS = 1500;

/** Fields that are provenance or private wording, never shown to the model. */
const HIDDEN_KEYS = new Set(["confidence", "as_of", "source", "sources", "public", "show_on_page", "story_confidence", "story_sources", "story_public", "resume_text", "level_public"]);

/**
 * @typedef {{ scope?: { type: "role" | "project", id: string } }} ToolContext
 */

/**
 * The project name a project id or name refers to, or "" when it names nothing.
 * @param {string} value
 */
export function projectName(value) {
  const wanted = String(value ?? "").trim().toLowerCase();
  if (!wanted) return "";
  const projects = /** @type {{ id: string, name: string }[]} */ (getKb().projects ?? []);
  const match = projects.find((project) => project.id.toLowerCase() === wanted || project.name.toLowerCase() === wanted);
  return match ? match.name : "";
}

/**
 * @param {string} query
 * @param {{ project?: string }} [options] a project name or id; a scope filter wins
 * @returns {{ id: string, project: string, title: string, heading: string, url: string, text: string }[]}
 */
export function searchDocs(query, options = {}) {
  const project = options.project ? projectName(options.project) : "";
  if (options.project && !project) return [];
  const docs = new Map((getKb().docs ?? []).map((/** @type {any} */ doc) => [doc.id, doc]));
  const hits = getDocsIndex().search(String(query ?? ""), project ? { filter: (result) => result.project === project } : {});
  return hits.slice(0, SEARCH_LIMIT).map((hit) => {
    const doc = docs.get(hit.id) ?? {};
    return { id: hit.id, project: doc.project, title: doc.title, heading: doc.heading, url: doc.url, text: String(doc.text ?? "").slice(0, CHUNK_CHARS) };
  });
}

/**
 * One public record, without provenance fields. A bullet's story is included only when
 * story_public is true.
 * @param {string} id
 * @returns {Record<string, unknown> | null}
 */
export function getRecord(id) {
  const entry = getRecords().get(String(id ?? ""));
  if (!entry) return null;
  /** @type {Record<string, unknown>} */
  const out = { kind: entry.kind };
  for (const [key, value] of Object.entries(entry.record)) {
    if (HIDDEN_KEYS.has(key)) continue;
    if (key === "story" && entry.record.story_public !== true) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Execute a tool by name. A project scope forces search_docs onto that project.
 * @param {string} name
 * @param {unknown} [input]
 * @param {ToolContext} [context]
 * @returns {string} Tool result content.
 */
export function executeTool(name, input, context = {}) {
  const args = /** @type {Record<string, unknown>} */ (input && typeof input === "object" ? input : {});
  if (name === "search_docs") {
    const scoped = context.scope?.type === "project" ? context.scope.id : "";
    const project = scoped || (typeof args.project === "string" ? args.project : "");
    const hits = searchDocs(typeof args.query === "string" ? args.query : "", { project });
    if (!hits.length) return "No matching project docs.";
    return JSON.stringify(hits);
  }
  if (name === "get_record") {
    const record = getRecord(typeof args.id === "string" ? args.id : "");
    return record ? JSON.stringify(record) : "No record with that id.";
  }
  return "Unknown tool.";
}
