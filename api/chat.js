/**
 * POST /api/chat
 * Node.js Vercel Function on Fluid compute.
 * Server sent events: status, delta, sources, done, and error.
 */

import { postChat } from "../lib/chat.js";

export const maxDuration = 60;

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export function POST(request) {
  return postChat(request);
}
