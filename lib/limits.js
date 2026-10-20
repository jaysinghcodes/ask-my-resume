/**
 * Chat caps, origin check, and rate limit counters.
 * Visitor IPs are hashed with a salt before they touch a counter.
 * The stored key expires after 24 hours. The raw IP is never written.
 */

import { createHash, randomBytes } from "crypto";
import { readEnv } from "./config.js";

export const IP_TTL_SECONDS = 24 * 60 * 60;

export const FRIENDLY = {
  rate_limited:
    "You've asked a lot of questions in a short time. Try again in a few minutes, or email jaggys44@gmail.com.",
  daily_cap:
    "Ask Jay has reached its limit for today. Email jaggys44@gmail.com and Jay will get back to you.",
  too_long:
    "That's longer than Ask Jay can read. Trim it to about 8,000 characters and try again.",
  server: "Something went wrong getting that answer. Try again.",
  invalid: "Ask Jay could not read that message. Try again.",
};

/** @typedef {"rate_limited" | "daily_cap" | "too_long" | "invalid" | "server"} LimitCode */

/**
 * @typedef {{
 *   incr: (key: string) => Promise<number>,
 *   expire: (key: string, seconds: number) => Promise<unknown>,
 * }} CounterStore
 */

/**
 * @typedef {{
 *   maxHistory: number,
 *   maxMessageChars: number,
 *   perIpDaily: number,
 *   siteDaily: number,
 *   maxOutputTokens: number,
 *   requestTimeoutSeconds: number,
 *   maxToolRounds: number,
 * }} ChatCaps
 */

/** @type {Map<string, { count: number, expiresAt: number }>} */
const memoryCounters = new Map();

let fallbackLogged = false;
let ephemeralSalt = "";

/**
 * Clear process local counter state. Tests use this between cases.
 */
export function resetLimitState() {
  memoryCounters.clear();
  fallbackLogged = false;
  ephemeralSalt = "";
}

/**
 * @param {string} key
 * @returns {{ count: number, expiresAt: number } | null}
 */
export function inspectMemory(key) {
  const row = memoryCounters.get(key);
  if (!row) return null;
  return { count: row.count, expiresAt: row.expiresAt };
}

/**
 * @param {string} name
 * @param {number} fallback
 * @param {NodeJS.ProcessEnv} env
 * @returns {number}
 */
function positiveInt(name, fallback, env) {
  const raw = readEnv(name, env);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return fallback;
  return value;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {ChatCaps}
 */
export function readCaps(env = process.env) {
  return {
    maxHistory: positiveInt("CHAT_MAX_HISTORY", 12, env),
    maxMessageChars: positiveInt("CHAT_MAX_MESSAGE_CHARS", 8000, env),
    perIpDaily: positiveInt("CHAT_PER_IP_DAILY", 30, env),
    siteDaily: positiveInt("CHAT_SITE_DAILY", 500, env),
    maxOutputTokens: positiveInt("CHAT_MAX_OUTPUT_TOKENS", 1024, env),
    requestTimeoutSeconds: positiveInt("CHAT_REQUEST_TIMEOUT_SECONDS", 60, env),
    maxToolRounds: positiveInt("CHAT_MAX_TOOL_ROUNDS", 5, env),
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function ipSalt(env = process.env) {
  const salt = readEnv("IP_HASH_SALT", env);
  if (salt) return salt;
  if (!ephemeralSalt) ephemeralSalt = randomBytes(32).toString("hex");
  return ephemeralSalt;
}

/**
 * Salted hash of a visitor IP. The raw IP is not part of the result.
 * @param {string} ip
 * @param {string} salt
 * @returns {string}
 */
export function hashIp(ip, salt) {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/**
 * @param {Request} request
 * @returns {string}
 */
export function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim() ?? "";
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  return "unknown";
}

/**
 * @param {string} value
 * @returns {string}
 */
function hostFrom(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const withProtocol = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {boolean}
 */
function isDeployed(env) {
  return env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
}

/**
 * @param {string} host
 * @returns {boolean}
 */
function isLocalHost(host) {
  return (
    host === "localhost" ||
    host.startsWith("localhost:") ||
    host === "127.0.0.1" ||
    host.startsWith("127.0.0.1:")
  );
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {Set<string>}
 */
function allowedHosts(env) {
  /** @type {Set<string>} */
  const hosts = new Set();
  for (const name of ["VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL", "VERCEL_BRANCH_URL"]) {
    const host = hostFrom(readEnv(name, env));
    if (host) hosts.add(host);
  }
  const extra = readEnv("ALLOWED_ORIGINS", env);
  if (extra) {
    for (const part of extra.split(",")) {
      const host = hostFrom(part);
      if (host) hosts.add(host);
    }
  }
  return hosts;
}

/**
 * Preview hosts for this project look like "<slug>-<rest>.vercel.app".
 * @param {string} host
 * @param {NodeJS.ProcessEnv} env
 * @returns {boolean}
 */
function isProjectPreviewHost(host, env) {
  const production = hostFrom(readEnv("VERCEL_PROJECT_PRODUCTION_URL", env));
  if (!production.endsWith(".vercel.app")) return false;
  const slug = production.slice(0, -".vercel.app".length);
  if (!slug || !host.endsWith(".vercel.app")) return false;
  return host === `${slug}.vercel.app` || host.startsWith(`${slug}-`);
}

/**
 * True when Origin is the production URL, a preview URL of this project,
 * or a local origin while the function is not deployed.
 * A missing Origin is allowed only outside production and preview.
 * @param {string | null} origin
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isAllowedOrigin(origin, env = process.env) {
  if (typeof origin !== "string" || origin.trim() === "" || origin === "null") {
    return !isDeployed(env);
  }
  let host = "";
  try {
    const url = new URL(origin);
    if (url.username || url.password) return false;
    host = url.host.toLowerCase();
  } catch {
    return false;
  }
  if (allowedHosts(env).has(host)) return true;
  if (isProjectPreviewHost(host, env)) return true;
  if (!isDeployed(env) && isLocalHost(host)) return true;
  return false;
}

/**
 * @param {unknown} body
 * @param {ChatCaps} caps
 * @returns {{ ok: true, messages: { role: "user" | "assistant", content: string }[] } | { ok: false, code: "too_long" | "invalid" }}
 */
export function validateChatBody(body, caps) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, code: "invalid" };
  }
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "messages") {
    return { ok: false, code: "invalid" };
  }
  const messages = /** @type {{ messages?: unknown }} */ (body).messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, code: "invalid" };
  }
  if (messages.length > caps.maxHistory) {
    return { ok: false, code: "too_long" };
  }

  /** @type {{ role: "user" | "assistant", content: string }[]} */
  const clean = [];
  for (const message of messages) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return { ok: false, code: "invalid" };
    }
    const messageKeys = Object.keys(message);
    if (messageKeys.length !== 2 || messageKeys.some((key) => key !== "role" && key !== "content")) {
      return { ok: false, code: "invalid" };
    }
    const role = /** @type {{ role?: unknown, content?: unknown }} */ (message).role;
    const content = /** @type {{ role?: unknown, content?: unknown }} */ (message).content;
    if (role !== "user" && role !== "assistant") {
      return { ok: false, code: "invalid" };
    }
    if (typeof content !== "string") {
      return { ok: false, code: "invalid" };
    }
    if (content.length > caps.maxMessageChars) {
      return { ok: false, code: "too_long" };
    }
    clean.push({ role, content });
  }
  return { ok: true, messages: clean };
}

/**
 * In memory counters for local development and tests.
 * @returns {CounterStore}
 */
function memoryStore() {
  return {
    async incr(key) {
      const now = Date.now();
      const row = memoryCounters.get(key);
      if (!row || (row.expiresAt > 0 && row.expiresAt <= now)) {
        memoryCounters.set(key, { count: 1, expiresAt: 0 });
        return 1;
      }
      row.count += 1;
      return row.count;
    },
    async expire(key, seconds) {
      const row = memoryCounters.get(key);
      if (!row) return 0;
      if (row.expiresAt > Date.now()) return 0;
      row.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },
  };
}

/**
 * @param {string} base
 * @param {string} token
 * @param {string[]} command
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<unknown>}
 */
async function redisCommand(base, token, command, fetchImpl) {
  const response = await fetchImpl(base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) {
    throw new Error("Redis command failed");
  }
  const payload = await response.json();
  if (!payload || typeof payload !== "object" || "error" in payload) {
    throw new Error("Redis command failed");
  }
  return /** @type {{ result?: unknown }} */ (payload).result;
}

/**
 * @param {string} url
 * @param {string} token
 * @param {typeof fetch} fetchImpl
 * @returns {CounterStore}
 */
export function upstashStore(url, token, fetchImpl = fetch) {
  const base = url.replace(/\/$/, "");
  return {
    async incr(key) {
      const result = await redisCommand(base, token, ["INCR", key], fetchImpl);
      const count = Number(result);
      if (!Number.isFinite(count)) throw new Error("Redis command failed");
      return count;
    },
    async expire(key, seconds) {
      await redisCommand(base, token, ["EXPIRE", key, String(seconds), "NX"], fetchImpl);
    },
  };
}

/**
 * Redis when both Marketplace variables are set, otherwise in memory counters.
 * The fallback log is written once per process.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {typeof fetch} [fetchImpl]
 * @returns {CounterStore}
 */
export function createCounterStore(env = process.env, fetchImpl = fetch) {
  const url = readEnv("UPSTASH_REDIS_REST_URL", env);
  const token = readEnv("UPSTASH_REDIS_REST_TOKEN", env);
  if (url && token) return upstashStore(url, token, fetchImpl);
  if (!fallbackLogged) {
    console.warn("Upstash Redis env vars are absent. Using in memory rate limit counters.");
    fallbackLogged = true;
  }
  return memoryStore();
}

/**
 * Count one question against the per IP cap and the site cap.
 * Keys contain the salted hash, never the raw IP.
 * @param {{ ipHash: string, store: CounterStore, caps: ChatCaps, now?: Date }} options
 * @returns {Promise<{ ok: true, ipKey: string, siteKey: string } | { ok: false, code: "rate_limited" | "daily_cap" }>}
 */
export async function consumeQuota({ ipHash, store, caps, now = new Date() }) {
  const day = now.toISOString().slice(0, 10);
  const ipKey = `chat:ip:${ipHash}:${day}`;
  const siteKey = `chat:site:${day}`;
  const ipCount = await store.incr(ipKey);
  await store.expire(ipKey, IP_TTL_SECONDS);
  if (ipCount > caps.perIpDaily) {
    return { ok: false, code: "rate_limited" };
  }
  const siteCount = await store.incr(siteKey);
  await store.expire(siteKey, IP_TTL_SECONDS);
  if (siteCount > caps.siteDaily) {
    return { ok: false, code: "daily_cap" };
  }
  return { ok: true, ipKey, siteKey };
}
