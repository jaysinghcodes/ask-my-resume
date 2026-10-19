/**
 * POST /api/chat
 * Node.js Vercel Function on Fluid compute. JSON in, JSON out.
 * Streaming is a later ticket.
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
