import { useEffect } from "react";
import { knowledgeBase } from "./data/knowledgeBase";
import { ROUTE_META, SITE_URL, siteDescription } from "./seo.js";

/**
 * Apply a route's head values to a document: title, meta description, and for a
 * noindex route (the 404 page) a robots noindex tag with the canonical removed.
 * Returns a function that puts the canonical back and drops the noindex tag.
 * @param {Document} doc
 * @param {{ title: string, description?: string, noindex?: boolean }} meta
 * @param {string} fallbackDescription
 * @returns {() => void}
 */
export function applyPageMeta(doc, meta, fallbackDescription) {
  doc.title = meta.title;
  const description = meta.description ?? fallbackDescription;
  const tag = doc.querySelector('meta[name="description"]');
  if (tag && description) tag.setAttribute("content", description);
  if (!meta.noindex) return () => {};
  const canonical = doc.querySelector('link[rel="canonical"]');
  canonical?.remove();
  let robots = doc.querySelector('meta[name="robots"]');
  if (!robots) {
    robots = doc.createElement("meta");
    robots.setAttribute("name", "robots");
    doc.head.appendChild(robots);
  }
  robots.setAttribute("content", "noindex");
  return () => {
    doc.querySelector('meta[name="robots"]')?.remove();
    if (!doc.querySelector('link[rel="canonical"]')) {
      const link = canonical ?? doc.createElement("link");
      link.setAttribute("rel", "canonical");
      link.setAttribute("href", `${SITE_URL}/`);
      doc.head.appendChild(link);
    }
  };
}

/**
 * Set the document head for the current route.
 * @param {keyof typeof ROUTE_META} key
 */
export function usePageMeta(key) {
  useEffect(() => {
    const meta = ROUTE_META[key];
    if (!meta) return undefined;
    return applyPageMeta(document, meta, siteDescription(knowledgeBase.profile));
  }, [key]);
}
