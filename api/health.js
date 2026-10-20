/**
 * GET /api/health
 * Monitoring only. This function does not import the Claude client and never calls Claude.
 */

import { isConfigured } from "../lib/config.js";

export const maxDuration = 60;

/**
 * @returns {Response}
 */
export function GET() {
  return Response.json({
    status: "ok",
    configured: isConfigured(),
  });
}
