/**
 * Validate kb/ and write kb/kb.json.
 * Loads .env when KB_BANNED_TERMS is not already set in the environment.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildKnowledgeBase } from "../lib/kb-build.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
loadEnvFile(path.join(root, ".env"), env);

const result = buildKnowledgeBase({
  kbDir: path.join(root, "kb"),
  outPath: path.join(root, "kb", "kb.json"),
  env,
});

for (const warning of result.warnings) console.warn(warning);
if (!result.ok) {
  for (const error of result.errors) console.error(error);
  process.exit(1);
}

console.log("Wrote kb/kb.json");

/**
 * @param {string} file
 * @param {NodeJS.ProcessEnv} target
 */
function loadEnvFile(file, target) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (target[key] === undefined) target[key] = value;
  }
}
