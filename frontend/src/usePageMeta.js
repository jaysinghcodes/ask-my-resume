import { useEffect } from "react";
import { knowledgeBase } from "./data/knowledgeBase";
import { ROUTE_META, siteDescription } from "./seo.js";

/**
 * Set the document title and meta description for the current route.
 * @param {keyof typeof ROUTE_META} key
 */
export function usePageMeta(key) {
  useEffect(() => {
    const meta = ROUTE_META[key];
    if (!meta) return;
    document.title = meta.title;
    const description = meta.description ?? siteDescription(knowledgeBase.profile);
    const tag = document.querySelector('meta[name="description"]');
    if (tag && description) tag.setAttribute("content", description);
  }, [key]);
}
