// Head for dist/404.html: the 404 title and description, robots noindex and no canonical.
import { ROUTE_META } from "../src/seo.js";

/** @param {string} value */
const escapeAttr = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * Turn the built index.html template into the head of the 404 page.
 * @param {string} template
 * @returns {string}
 */
export function renderNotFoundHead(template) {
  const meta = ROUTE_META.notFound;
  let doc = template.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(meta.title)}</title>`);
  doc = doc.replace(/\s*<link rel="canonical"[^>]*>/g, "");
  if (meta.description) {
    doc = doc.replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeAttr(meta.description)}$2`);
  }
  if (!/<meta name="robots"/.test(doc)) doc = doc.replace("</head>", '  <meta name="robots" content="noindex" />\n  </head>');
  return doc;
}
