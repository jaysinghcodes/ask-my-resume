/**
 * MCP-style tool definitions and execution for Claude.
 */

import { getResumeText } from "./resume.js";

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
 * @returns {string} Tool result content.
 */
export function executeTool(name, input) {
  if (name === "search_resume") {
    const text = getResumeText();
    return `Here is Jay's full resume content:\n\n${text}\n\nQuery: ${input.query}`;
  }
  return "";
}
