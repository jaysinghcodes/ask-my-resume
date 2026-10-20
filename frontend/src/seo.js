/**
 * Head tags for search and link previews, built from the KB profile.
 * Used by the Vite build (index.html) and by the pages (title and description per route).
 */

/** The production URL from T1. */
export const SITE_URL = "https://ask-jay.vercel.app";

export const SITE_TITLE = "Jay Singh · AI native software engineer";

export const OG_IMAGE = {
  path: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "Jay Singh, AI native software engineer",
};

/**
 * @typedef {{
 *   full_name?: string,
 *   display_name?: string,
 *   summary?: string,
 *   current_role?: { title?: string, employer?: string },
 *   location?: string,
 *   links?: { label?: string, url?: string, public?: boolean }[],
 * }} Profile
 */

/**
 * @param {Profile | null | undefined} profile
 * @returns {string}
 */
export function siteDescription(profile) {
  return String(profile?.summary ?? "").replace(/\s+/g, " ").trim();
}

/** @type {Record<string, { title: string, description?: string }>} */
export const ROUTE_META = {
  home: { title: SITE_TITLE },
  contact: { title: "Contact · Jay Singh", description: "Email, LinkedIn and GitHub for Jay Singh." },
  notFound: { title: "Page not found · Jay Singh", description: "That page doesn't exist." },
};

/**
 * Person JSON LD. No telephone, ever.
 * @param {Profile | null | undefined} profile
 */
export function personJsonLd(profile) {
  const links = (profile?.links || []).filter((link) => link.public !== false && typeof link.url === "string");
  const sameAs = links
    .map((link) => /** @type {string} */ (link.url))
    .filter((url) => /^https:\/\/(www\.)?(linkedin\.com|github\.com)\//.test(url));
  const [city, region] = String(profile?.location ?? "").split(",").map((part) => part.trim());
  /** @type {Record<string, unknown>} */
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile?.display_name || profile?.full_name || "Jay Singh",
    url: `${SITE_URL}/`,
    image: `${SITE_URL}${OG_IMAGE.path}`,
  };
  if (profile?.current_role?.title) person.jobTitle = profile.current_role.title;
  if (profile?.current_role?.employer) {
    person.worksFor = { "@type": "Organization", name: profile.current_role.employer };
  }
  if (city) {
    person.address = {
      "@type": "PostalAddress",
      addressLocality: city,
      ...(region ? { addressRegion: region } : {}),
      addressCountry: "US",
    };
  }
  if (sameAs.length) person.sameAs = sameAs;
  return person;
}

/**
 * @param {string} value
 */
function attr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * The head tags as an HTML string.
 * @param {Profile | null | undefined} profile
 * @returns {string}
 */
export function seoHeadHtml(profile) {
  const description = siteDescription(profile);
  const image = `${SITE_URL}${OG_IMAGE.path}`;
  const json = JSON.stringify(personJsonLd(profile)).replace(/</g, "\\u003c");
  return [
    `<meta name="description" content="${attr(description)}" />`,
    `<link rel="canonical" href="${SITE_URL}/" />`,
    `<link rel="icon" href="/favicon.ico" sizes="32x32" />`,
    `<link rel="icon" href="/icon.svg" type="image/svg+xml" />`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Jay Singh" />`,
    `<meta property="og:title" content="${attr(SITE_TITLE)}" />`,
    `<meta property="og:description" content="${attr(description)}" />`,
    `<meta property="og:url" content="${SITE_URL}/" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="${OG_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${attr(OG_IMAGE.alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${attr(SITE_TITLE)}" />`,
    `<meta name="twitter:description" content="${attr(description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta name="twitter:image:alt" content="${attr(OG_IMAGE.alt)}" />`,
    `<script type="application/ld+json">${json}</script>`,
  ].join("\n    ");
}
