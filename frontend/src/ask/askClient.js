import { readSse } from "./sse.js";

/**
 * @typedef {{ role: "user" | "assistant", content: string }} ApiMessage
 * @typedef {{ type: "role" | "project", id: string }} AskScope
 * @typedef {{ messages: ApiMessage[], scope?: AskScope, mode?: "jd_fit" }} ChatBody
 * @typedef {(event: string, data: Record<string, unknown>) => void} ChatHandler
 */

/**
 * POST a question and report T2 events to `onEvent`.
 * A streamed answer (text/event-stream) is read event by event. A JSON reply from the
 * T1 backend is turned into the same events, so the card works before and after T2.
 * The stream always ends in `done` or `error`. An error carries only a code.
 * @param {{
 *   url: string,
 *   body: ChatBody,
 *   onEvent: ChatHandler,
 *   signal?: AbortSignal,
 *   fetchImpl?: typeof fetch,
 * }} options
 */
export async function streamChat({ url, body, onEvent, signal, fetchImpl }) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  let finished = false;
  /** @type {ChatHandler} */
  const emit = (event, data) => {
    if (finished || signal?.aborted) return;
    if (event === "done" || event === "error") finished = true;
    onEvent(event, data);
  };

  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream") && res.body) {
      await readSse(res.body, emit);
    } else {
      /** @type {Record<string, unknown> | null} */
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      const answer = data && typeof data.response === "string" ? data.response : "";
      if (res.ok && answer.trim()) {
        emit("delta", { text: answer });
        emit("sources", { sources: Array.isArray(data?.sources) ? data.sources : [] });
        emit("done", {});
      } else {
        const code = data && typeof data.code === "string" ? data.code : "";
        emit("error", { code: code || (res.status === 429 ? "rate_limited" : "server") });
      }
    }
  } catch {
    if (signal?.aborted) return;
    emit("error", { code: "server" });
  }
  emit("error", { code: "server" });
}
