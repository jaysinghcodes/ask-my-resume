/**
 * Keyword index over the kb/docs chunks for the search_docs tool (T7). MiniSearch, no
 * embeddings and no vector service. scripts/build-kb.js writes the index to
 * kb/docs-index.json at build time; the chat function loads it from there.
 */

import MiniSearch from "minisearch";

/** @typedef {{ id: string, project: string, title: string, heading: string, text: string, url: string }} DocChunk */

/**
 * Shared by the build and the loader, so a saved index always loads.
 * @type {import("minisearch").Options<DocChunk>}
 */
export const DOCS_INDEX_OPTIONS = {
  idField: "id",
  fields: ["title", "heading", "text", "project"],
  storeFields: ["project", "title", "heading", "url"],
  searchOptions: { boost: { heading: 2, title: 1.5 }, prefix: true, fuzzy: 0.2, combineWith: "OR" },
};

/**
 * @param {DocChunk[]} docs
 * @returns {MiniSearch}
 */
export function buildDocsIndex(docs) {
  const index = new MiniSearch(DOCS_INDEX_OPTIONS);
  index.addAll(docs.map((doc) => ({ id: doc.id, project: doc.project, title: doc.title, heading: doc.heading, text: doc.text, url: doc.url })));
  return index;
}

/**
 * @param {string} json from JSON.stringify(index)
 * @returns {MiniSearch}
 */
export function loadDocsIndex(json) {
  return MiniSearch.loadJSON(json, DOCS_INDEX_OPTIONS);
}
