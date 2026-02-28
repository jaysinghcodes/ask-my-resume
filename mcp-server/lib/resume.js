/**
 * Resume loading and access. Caches PDF text in memory.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let resumeText = "";

export async function loadResume(resumePath = path.join(__dirname, "..", "resume.pdf")) {
  const pdfBuffer = fs.readFileSync(resumePath);
  const data = await pdfParse(pdfBuffer);
  resumeText = data.text;
  return resumeText;
}

export function getResumeText() {
  return resumeText;
}
