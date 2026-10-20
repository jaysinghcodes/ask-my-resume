/** Client history window sent to POST /api/chat. The on screen thread stays whole. */
export const CHAT_MAX_HISTORY = 12;

/**
 * @param {{ role: string, content: string }[]} history
 * @returns {{ role: string, content: string }[]}
 */
export function toApiMessages(history) {
  const mapped = history
    .filter((message) => message.content.trim() !== "")
    .map((message) => ({
      role: message.role === "ai" ? "assistant" : message.role,
      content: message.content,
    }));
  const recent = mapped.slice(-CHAT_MAX_HISTORY);
  while (recent.length > 0 && recent[0]?.role !== "user") {
    recent.shift();
  }
  return recent;
}
