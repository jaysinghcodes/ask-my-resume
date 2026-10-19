/**
 * MCP-style tool definitions and execution for Claude.
 */

import { getResumeText } from "./resume.js";

/** @type {import("@anthropic-ai/sdk").Anthropic.Tool[]} */
export const TOOLS = [
  {
    name: "search_resume",
    description:
      "Search and retrieve information from Jay Singh's resume. Use this to answer any questions about his skills, experience, education, or projects.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The specific information to look up from the resume (e.g. 'work experience', 'technical skills', 'education', 'projects')",
        },
      },
      required: ["query"],
    },
  },
];

/**
 * Execute a tool by name with the given input.
 * @param {string} name
 * @param {unknown} [input]
 * @returns {string} Tool result content.
 */
export function executeTool(name, input) {
  if (name === "search_resume") {
    const text = getResumeText();
    const query =
      input &&
      typeof input === "object" &&
      "query" in input &&
      typeof input.query === "string"
        ? input.query
        : "";
    return `Here is Jay's full resume content:\n\n${text}\n\nQuery: ${query}`;
  }
  return "";
}
