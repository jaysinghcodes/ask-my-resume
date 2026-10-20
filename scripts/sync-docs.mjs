/**
 * Fetch Cleat and Mission Control docs at pinned commits and chunk them by heading.
 *
 * Pins are the main SHAs on Oct 20, 2026.
 * Cleat: 43aff81936cc627f6e3959879246fa6d0e1ca171
 * Mission Control: 7f1c19038f46e9ffd43147afbe705fc4da7c74d5
 *
 * Chunk headings, titles, and text keep inline code spans and fenced code blocks
 * byte for byte. Dashes and arrows are removed only from the prose around them.
 * URLs are left intact. Run from the repo root:
 * node scripts/sync-docs.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeDocText, proseDashIssues } from "../lib/doc-text.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(root, "kb", "docs");

const CLEAT = "43aff81936cc627f6e3959879246fa6d0e1ca171";
const MISSION_CONTROL = "7f1c19038f46e9ffd43147afbe705fc4da7c74d5";

const SOURCES = [
  {
    project: "Cleat",
    repo: "Cleat",
    sha: CLEAT,
    asOf: "2026-10-14",
    file: "README.md",
    title: "README",
    out: "cleat-readme.json",
  },
  {
    project: "Cleat",
    repo: "Cleat",
    sha: CLEAT,
    asOf: "2026-10-14",
    file: "docs/architecture.md",
    title: "Architecture",
    out: "cleat-architecture.json",
  },
  {
    project: "Cleat",
    repo: "Cleat",
    sha: CLEAT,
    asOf: "2026-10-14",
    file: "docs/demo-script.md",
    title: "Demo script",
    out: "cleat-demo-script.json",
  },
  {
    project: "Mission Control",
    repo: "Mission-Control",
    sha: MISSION_CONTROL,
    asOf: "2026-10-20",
    file: "README.md",
    title: "README",
    out: "mission-control-readme.json",
  },
  {
    project: "Mission Control",
    repo: "Mission-Control",
    sha: MISSION_CONTROL,
    asOf: "2026-10-20",
    file: "docs/API.md",
    title: "API",
    out: "mission-control-api.json",
  },
  {
    project: "Mission Control",
    repo: "Mission-Control",
    sha: MISSION_CONTROL,
    asOf: "2026-10-20",
    file: "docs/STACK.md",
    title: "Stack",
    out: "mission-control-stack.json",
  },
  {
    project: "Mission Control",
    repo: "Mission-Control",
    sha: MISSION_CONTROL,
    asOf: "2026-10-20",
    file: "docs/SECURITY.md",
    title: "Security",
    out: "mission-control-security.json",
  },
  {
    project: "Mission Control",
    repo: "Mission-Control",
    sha: MISSION_CONTROL,
    asOf: "2026-10-20",
    file: "docs/OPENCLAW_ONBOARDING.md",
    title: "OpenClaw onboarding",
    out: "mission-control-onboarding.json",
  },
];

const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/;

/**
 * @param {string} repo
 * @param {string} sha
 * @param {string} file
 * @returns {Promise<string>}
 */
async function fetchDoc(repo, sha, file) {
  const url = `https://raw.githubusercontent.com/jaysinghcodes/${repo}/${sha}/${file}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch failed ${response.status} ${url}`);
  }
  return response.text();
}

/**
 * @param {string} markdown
 * @returns {{ heading: string, text: string }[]}
 */
function chunkByHeading(markdown) {
  /** @type {{ heading: string, text: string }[]} */
  const sections = [];
  let heading = "";
  /** @type {string[]} */
  let buf = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) sections.push({ heading, text });
    buf = [];
  };
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (match) {
      flush();
      heading = match[2].trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * @param {string} value
 * @returns {string}
 */
function slug(value) {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "section";
}

/**
 * @param {(typeof SOURCES)[number]} source
 * @param {string} markdown
 * @returns {Record<string, unknown>[]}
 */
function toRecords(source, markdown) {
  const blob = `https://github.com/jaysinghcodes/${source.repo}/blob/${source.sha}/${source.file}`;
  const fileSlug = source.out.replace(/\.json$/, "");
  /** @type {Set<string>} */
  const used = new Set();
  /** @type {Record<string, unknown>[]} */
  const records = [];
  for (const section of chunkByHeading(markdown)) {
    const heading = normalizeDocText(section.heading || "Introduction");
    const title = normalizeDocText(source.title);
    const text = normalizeDocText(section.text);
    const issues = [
      ...proseDashIssues(heading).map((issue) => `heading ${issue}`),
      ...proseDashIssues(title).map((issue) => `title ${issue}`),
      ...proseDashIssues(text).map((issue) => `text ${issue}`),
    ];
    if (issues.length > 0) {
      throw new Error(`${source.file} ${heading}: ${issues.join(", ")}`);
    }
    if (PHONE.test(text) || PHONE.test(heading) || PHONE.test(title)) {
      throw new Error(`${source.file} ${heading}: phone number`);
    }
    let id = `doc-${fileSlug}-${slug(heading)}`;
    let n = 2;
    while (used.has(id)) {
      id = `doc-${fileSlug}-${slug(heading)}-${n}`;
      n += 1;
    }
    used.add(id);
    records.push({
      id,
      project: source.project,
      title,
      heading,
      text,
      url: blob,
      source: blob,
      as_of: source.asOf,
      confidence: "verified",
      public: true,
      notes: `Chunked by heading from ${source.repo} ${source.file} at ${source.sha}.`,
    });
  }
  return records;
}

fs.mkdirSync(docsDir, { recursive: true });
const keep = new Set(SOURCES.map((source) => source.out));
for (const entry of fs.readdirSync(docsDir)) {
  if (entry.startsWith(".")) continue;
  if (!keep.has(entry)) fs.rmSync(path.join(docsDir, entry));
}

let count = 0;
for (const source of SOURCES) {
  const markdown = await fetchDoc(source.repo, source.sha, source.file);
  const records = toRecords(source, markdown);
  if (records.length === 0) throw new Error(`no chunks for ${source.file}`);
  const full = path.join(docsDir, source.out);
  fs.writeFileSync(full, `${JSON.stringify(records, null, 2)}\n`);
  count += records.length;
  console.log(`${source.out}: ${records.length} chunks`);
}
console.log(`Wrote ${count} chunks to kb/docs`);
