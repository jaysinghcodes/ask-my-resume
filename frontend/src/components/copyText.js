/**
 * Copy plain text. Returns true when the clipboard received it.
 * @param {string} text
 * @param {{ writeText?: (value: string) => Promise<void> } | null | undefined} [clipboard]
 * @returns {Promise<boolean>}
 */
export async function copyText(text, clipboard = globalThis.navigator?.clipboard) {
  if (clipboard && typeof clipboard.writeText === "function") {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the selection copy below.
    }
  }
  return copyWithSelection(text);
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function copyWithSelection(text) {
  const doc = globalThis.document;
  if (!doc?.body || typeof doc.createElement !== "function" || typeof doc.execCommand !== "function") {
    return false;
  }
  const area = doc.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "0";
  area.style.top = "0";
  area.style.opacity = "0";
  doc.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = doc.execCommand("copy");
  } catch {
    copied = false;
  }
  doc.body.removeChild(area);
  return copied;
}
