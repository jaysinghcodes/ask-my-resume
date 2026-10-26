/**
 * Server sent events reader for POST /api/chat.
 * The T2 contract sends `status`, `delta`, `sources`, `done` and `error` events,
 * each with one JSON `data` line.
 */

/**
 * @typedef {(event: string, data: Record<string, unknown>) => void} SseHandler
 */

/**
 * Parse one event block. Comments and blocks without data are skipped.
 * A block whose data is not a JSON object is ignored.
 * @param {string} block
 * @returns {{ event: string, data: Record<string, unknown> } | null}
 */
export function parseSseBlock(block) {
  let event = "message";
  /** @type {string[]} */
  const dataLines = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
  }
  if (dataLines.length === 0) return null;
  try {
    const data = JSON.parse(dataLines.join("\n"));
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return { event, data };
  } catch {
    return null;
  }
}

/**
 * Feed text into the buffer and dispatch every complete event.
 * @param {string} buffer
 * @param {SseHandler} onEvent
 * @returns {string} The incomplete tail to keep for the next chunk.
 */
export function consumeSse(buffer, onEvent) {
  const parts = buffer.replace(/\r\n?/g, "\n").split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const parsed = parseSseBlock(part);
    if (parsed) onEvent(parsed.event, parsed.data);
  }
  return rest;
}

/**
 * Read a streamed response to the end.
 * @param {ReadableStream<Uint8Array>} body
 * @param {SseHandler} onEvent
 */
export async function readSse(body, onEvent) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer = consumeSse(buffer + decoder.decode(value, { stream: true }), onEvent);
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeSse(`${buffer}\n\n`, onEvent);
}
