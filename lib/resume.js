/**
 * Resume loading and access. Caches PDF text in memory.
 * The PDF stays at mcp-server/resume.pdf until a later ticket replaces it.
 * This file lives in the repo root lib/ directory, so the default path
 * walks up to that PDF.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let resumeText = "";

/**
 * Locations checked when the caller does not pass a path.
 * process.cwd() covers the Vercel function bundle (includeFiles).
 * The path next to this module covers local tests and vercel dev.
 * @returns {string[]}
 */
function resumeCandidates() {
  return [
    path.join(__dirname, "..", "mcp-server", "resume.pdf"),
    path.join(process.cwd(), "mcp-server", "resume.pdf"),
  ];
}

/**
 * @param {string} [resumePath]
 * @returns {string}
 */
export function resolveResumePath(resumePath) {
  if (resumePath) return resumePath;
  for (const candidate of resumeCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return resumeCandidates()[0];
}

/**
 * @param {string} [resumePath]
 * @returns {Promise<string>}
 */
export async function loadResume(resumePath = resolveResumePath()) {
  const pdfBuffer = fs.readFileSync(resumePath);
  const data = await pdfParse(pdfBuffer);
  resumeText = data.text;
  return resumeText;
}

/**
 * @returns {string}
 */
export function getResumeText() {
  return resumeText;
}
