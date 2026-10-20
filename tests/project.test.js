import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {string} dir
 * @returns {string}
 */
function readTree(dir) {
  /** @type {string[]} */
  const chunks = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      chunks.push(readTree(full));
    } else if (/\.(js|jsx|md|json|example)$/.test(entry.name)) {
      chunks.push(fs.readFileSync(full, "utf8"));
    }
  }
  return chunks.join("\n");
}

describe("project checklist", () => {
  it("keeps the friendly error and drops the old backend hints from the UI", () => {
    const ui = readTree(path.join(root, "frontend", "src"));
    expect(ui).toContain("Something went wrong getting that answer. Try again.");
    expect(ui).toContain("Try again");
    expect(ui).not.toContain("BACKEND_ERROR_HINT");
    expect(ui).not.toContain("Start the backend");
    expect(ui).not.toContain("Backend offline");
    expect(ui).not.toContain("VITE_API_URL");
    expect(ui).not.toContain("/ask-my-resume");
    expect(ui).not.toContain("backendOk");
    expect(ui).not.toContain("/health");
  });

  it("removes the Pages base path from the Vite config", () => {
    const vite = fs.readFileSync(path.join(root, "frontend", "vite.config.js"), "utf8");
    const app = fs.readFileSync(path.join(root, "frontend", "src", "App.jsx"), "utf8");
    expect(vite).not.toContain("/ask-my-resume");
    expect(app).not.toContain("basename");
    expect(vite).toContain('target: "http://127.0.0.1:3000"');
  });

  it("configures one Vercel project for the Vite app and the functions", () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
    expect(vercel.buildCommand).toBe("npm run build");
    expect(vercel.outputDirectory).toBe("frontend/dist");
    expect(vercel.fluid).toBe(true);
    expect(vercel.functions["api/chat.js"].maxDuration).toBe(60);
    expect(vercel.functions["api/health.js"].maxDuration).toBe(60);
    expect(vercel.functions["api/chat.js"].includeFiles).toBe("mcp-server/resume.pdf");
    expect(vercel.rewrites).toEqual([
      { source: "/((?!api/).*)", destination: "/index.html" },
    ]);
  });

  it("lists the Anthropic workspace, key, and spend limit as Jay's first step", () => {
    const setup = fs.readFileSync(path.join(root, "docs", "SETUP.md"), "utf8");
    const anthropic = setup.indexOf("## 1. Anthropic workspace, key, and spend limit");
    const vercel = setup.indexOf("## 2. Vercel project");
    expect(anthropic).toBeGreaterThan(-1);
    expect(vercel).toBeGreaterThan(anthropic);
    expect(setup).toContain("$10");
    expect(setup).toContain("ask-jay");
    expect(setup).toContain("same account as Cleat");
    expect(setup).toMatch(/Production and for Preview/);
    expect(setup).toContain("root `lib/`");
    expect(setup).not.toMatch(/[—–→←↓↑⇒]/);
  });

  it("runs lint, typecheck, test, and build in CI and leaves the Pages workflow alone", () => {
    const ci = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
    const deploy = fs.readFileSync(
      path.join(root, ".github", "workflows", "deploy.yml"),
      "utf8",
    );
    expect(ci).toContain("npm run lint");
    expect(ci).toContain("npm run typecheck");
    expect(ci).toContain("npm test");
    expect(ci).toContain("npm run build");
    expect(ci).toContain("pull_request");
    expect(deploy).toContain("Deploy Frontend to GitHub Pages");
    expect(deploy).toContain("VITE_API_URL");
  });

  it("replaces the env examples and removes the Express server entry", () => {
    const example = fs.readFileSync(path.join(root, ".env.example"), "utf8");
    expect(example).toContain("ANTHROPIC_API_KEY");
    expect(example).toContain("MODEL_ID");
    expect(example).not.toContain("VITE_API_URL");
    expect(example).not.toContain("PORT=");
    expect(fs.existsSync(path.join(root, "frontend", ".env.example"))).toBe(false);
    expect(fs.existsSync(path.join(root, "mcp-server", ".env.example"))).toBe(false);
    expect(fs.existsSync(path.join(root, "mcp-server", "index.js"))).toBe(false);
    expect(fs.existsSync(path.join(root, "mcp-server", "routes"))).toBe(false);
    expect(fs.existsSync(path.join(root, "mcp-server", "resume.pdf"))).toBe(true);
    const serverPackage = fs.existsSync(path.join(root, "mcp-server", "package.json"))
      ? fs.readFileSync(path.join(root, "mcp-server", "package.json"), "utf8")
      : "";
    expect(serverPackage).not.toMatch(/express|cors|dotenv/);
  });
});