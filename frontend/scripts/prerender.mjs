// Put the server rendered home page into dist/index.html so the hero paints before the script runs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderNotFoundHead } from "./not-found-head.mjs";

process.env.NODE_ENV ??= "production";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const server = path.join(root, "dist-ssr", "entry-server.js");

const { renderHome, renderCopySnapshots } = await import(pathToFileURL(server).href);
const html = renderHome();
const indexPath = path.join(dist, "index.html");
const template = fs.readFileSync(indexPath, "utf8");
const marker = '<div id="root"><!--app-html--></div>';
if (!template.includes(marker)) throw new Error("prerender: root marker missing from dist/index.html");
// Inline the one small stylesheet so the first paint does not wait on a second request.
/** @param {string} doc */
const inlineCss = (doc) =>
  doc.replace(/<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"[^>]*>/g, (_tag, href) => {
    const css = fs.readFileSync(path.join(dist, href), "utf8");
    return `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
  });
fs.writeFileSync(indexPath, inlineCss(template.replace(marker, `<div id="root" data-prerendered="">${html}</div>`)));

// Vercel serves dist/404.html with HTTP 404 for any path that is not a file or a rewrite.
// It is the app shell with an empty root, so the client router renders the in-app 404 page.
const notFound = renderNotFoundHead(template).replace(marker, '<div id="root"></div>');
fs.writeFileSync(path.join(dist, "404.html"), inlineCss(notFound));

// Server rendered copy of every route for scripts/copy-check.mjs. Kept out of dist so it never deploys.
const copyDir = path.join(root, "dist-copy");
fs.rmSync(copyDir, { recursive: true, force: true });
fs.mkdirSync(copyDir, { recursive: true });
for (const [name, markup] of Object.entries(renderCopySnapshots())) {
  fs.writeFileSync(path.join(copyDir, name), `<!doctype html><html><body>${markup}</body></html>`);
}
fs.rmSync(path.join(root, "dist-ssr"), { recursive: true, force: true });
console.log(`prerender: wrote ${html.length} characters of home page markup`);
