// Put the server rendered home page into dist/index.html so the hero paints before the script runs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NODE_ENV ??= "production";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const server = path.join(root, "dist-ssr", "entry-server.js");

const { renderHome } = await import(pathToFileURL(server).href);
const html = renderHome();
const indexPath = path.join(dist, "index.html");
const template = fs.readFileSync(indexPath, "utf8");
const marker = '<div id="root"><!--app-html--></div>';
if (!template.includes(marker)) throw new Error("prerender: root marker missing from dist/index.html");
let page = template.replace(marker, `<div id="root" data-prerendered="">${html}</div>`);

// Inline the one small stylesheet so the first paint does not wait on a second request.
page = page.replace(/<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"[^>]*>/g, (_tag, href) => {
  const css = fs.readFileSync(path.join(dist, href), "utf8");
  return `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
});
fs.writeFileSync(indexPath, page);
fs.rmSync(path.join(root, "dist-ssr"), { recursive: true, force: true });
console.log(`prerender: wrote ${html.length} characters of home page markup`);
