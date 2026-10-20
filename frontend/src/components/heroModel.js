/**
 * Hero copy and impact values, read from knowledge base records.
 * Impact rows are the bullet metrics that carry impact_order.
 */

/**
 * @typedef {Object} ProfileLink
 * @property {string} [label]
 * @property {string} [url]
 * @property {boolean} [public]
 */

/**
 * @typedef {Object} HeroProfile
 * @property {string} [headline]
 * @property {string} [headline_support]
 * @property {string} [summary]
 * @property {string} [location]
 * @property {string} [availability]
 * @property {string} [work_preferences]
 * @property {{ title?: string, employer?: string }} [current_role]
 * @property {{ path?: string, path_2x?: string, alt?: string, width?: number, height?: number }} [photo]
 * @property {ProfileLink[]} [links]
 */

/**
 * @typedef {Object} Metric
 * @property {string} [display]
 * @property {string} [value]
 * @property {string} [unit]
 * @property {string} [label]
 * @property {string} [meaning]
 * @property {string} [tags]
 * @property {number} [impact_order]
 * @property {boolean} [public]
 */

/**
 * @typedef {Object} Bullet
 * @property {boolean} [public]
 * @property {string} [confidence]
 * @property {Metric[]} [metrics]
 */

/**
 * @typedef {Object} ImpactItem
 * @property {number} order
 * @property {string} value
 * @property {string} label
 * @property {string} tags
 */

export const RESUME_HREF = "/Jay-Singh-Resume-Oct-2026.pdf";
export const EMAIL_HREF = "mailto:jaggys44@gmail.com";

/**
 * @param {HeroProfile | null | undefined} profile
 * @param {string} label
 * @returns {string}
 */
export function linkUrl(profile, label) {
  const links = profile && Array.isArray(profile.links) ? profile.links : [];
  const match = links.find((item) => item && item.public !== false && item.label === label && item.url);
  return match && match.url ? String(match.url) : "";
}

/**
 * @param {HeroProfile | null | undefined} profile
 */
export function heroContent(profile) {
  const data = profile || {};
  const role = data.current_role || {};
  const photo = data.photo || {};
  return {
    headline: data.headline || "",
    headlineSupport: data.headline_support || "",
    lede: data.summary || "",
    title: role.title || "",
    employer: role.employer || "",
    location: data.location || "",
    availability: data.availability || "",
    workPreferences: data.work_preferences || "",
    photo: {
      src: photo.path || "",
      src2x: photo.path_2x || "",
      alt: photo.alt || "",
      width: Number(photo.width) || 72,
      height: Number(photo.height) || 72,
    },
    resumeHref: linkUrl(data, "Resume") || RESUME_HREF,
    emailHref: linkUrl(data, "Email") || EMAIL_HREF,
  };
}

/**
 * @param {Bullet[] | null | undefined} bullets
 * @returns {ImpactItem[]}
 */
export function impactItems(bullets) {
  /** @type {ImpactItem[]} */
  const items = [];
  for (const bullet of bullets || []) {
    if (!bullet || bullet.public === false || bullet.confidence === "unsure") continue;
    for (const metric of bullet.metrics || []) {
      if (!metric || metric.public === false) continue;
      if (typeof metric.impact_order !== "number") continue;
      const value = metric.display || metric.value || "";
      if (!value) continue;
      items.push({
        order: metric.impact_order,
        value: String(value),
        label: String(metric.label || metric.meaning || ""),
        tags: String(metric.tags || ""),
      });
    }
  }
  items.sort((a, b) => a.order - b.order);
  return items;
}
