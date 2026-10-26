import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { contactFromProfile } from "./src/contact-from-kb.js";
import { seoHeadHtml } from "./src/seo.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kbPath = path.join(repoRoot, "kb", "kb.json");

function kbMeta() {
  return {
    name: "kb-meta",
    resolveId(id) {
      if (id === "virtual:kb") return "\0virtual:kb";
      return null;
    },
    load(id) {
      if (id !== "\0virtual:kb") return null;
      this.addWatchFile(kbPath);
      let builtAt = "";
      let contact = contactFromProfile(null);
      try {
        const kb = JSON.parse(fs.readFileSync(kbPath, "utf8"));
        if (kb && kb.meta && typeof kb.meta.built_at === "string") {
          builtAt = kb.meta.built_at;
        }
        contact = contactFromProfile(kb && kb.profile);
      } catch {
        builtAt = "";
        contact = contactFromProfile(null);
      }
      return [
        `export const builtAt = ${JSON.stringify(builtAt)};`,
        `export const contact = ${JSON.stringify(contact)};`,
      ].join("\n");
    },
  };
}

// The page never reads doc chunks or the never say list, so they stay out of the bundle.
export const BROWSER_KB_OMIT = ["docs", "never_say"];

/** @returns {import("vite").Plugin} */
export function browserKb() {
  return {
    name: "browser-kb",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !source.endsWith("kb.json")) return null;
      return path.resolve(path.dirname(importer), source) === kbPath ? "\0browser-kb" : null;
    },
    load(id) {
      if (id !== "\0browser-kb") return null;
      this.addWatchFile(kbPath);
      const kb = JSON.parse(fs.readFileSync(kbPath, "utf8"));
      for (const key of BROWSER_KB_OMIT) delete kb[key];
      return `export default ${JSON.stringify(kb)};`;
    },
  };
}

function seoHead() {
  return {
    name: "seo-head",
    transformIndexHtml(html) {
      const kb = JSON.parse(fs.readFileSync(kbPath, "utf8"));
      return html.replace("<!-- seo-head -->", seoHeadHtml(kb.profile));
    },
  };
}

export default defineConfig({
  plugins: [browserKb(), react(), kbMeta(), seoHead()],
  server: {
    fs: {
      allow: [repoRoot],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
});
