const LINK_ORDER = ["Email", "LinkedIn", "GitHub", "Resume"];

/**
 * @param {unknown} profile
 * @returns {{
 *   blurb: string,
 *   location: string,
 *   workPreferences: string,
 *   links: { label: string, url: string, display: string }[],
 * }}
 */
export function contactFromProfile(profile) {
  const record = profile && typeof profile === "object" ? /** @type {Record<string, unknown>} */ (profile) : {};
  const links = Array.isArray(record.links) ? record.links : [];
  return {
    blurb: textField(record, "contact_blurb"),
    location: textField(record, "location"),
    workPreferences: textField(record, "work_preferences"),
    links: LINK_ORDER.flatMap((label) => {
      const link = links.find((item) => isRecord(item) && item.label === label);
      if (!isRecord(link)) return [];
      const url = textField(link, "url");
      const display = textField(link, "display");
      if (!url || !display) return [];
      return [{ label, url, display }];
    }),
  };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return Boolean(value) && typeof value === "object";
}

/**
 * @param {Record<string, unknown>} record
 * @param {string} key
 */
function textField(record, key) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}
