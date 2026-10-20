import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { contactFromProfile } from "./src/contact-from-kb.js";

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

export default defineConfig({
  plugins: [react(), kbMeta()],
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
