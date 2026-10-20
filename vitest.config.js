import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const frontendModules = path.join(rootDir, "frontend/node_modules");

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: [
      { find: "react-dom", replacement: path.join(frontendModules, "react-dom") },
      { find: "react", replacement: path.join(frontendModules, "react") },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
  },
});
