import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ASK_COPY, NARROW_INPUT_QUERY, askPlaceholder } from "../frontend/src/ask/askModel.js";
import { ChatPage } from "../frontend/src/pages/ChatPage.jsx";

const DASH_OR_ARROW = /[\u2012-\u2015\u2190-\u21FF]|\s-\s|--|->|=>/;

describe("short Ask placeholder below 360px (#22)", () => {
  it("keeps the full copy at 360 and up and swaps below", () => {
    expect(NARROW_INPUT_QUERY).toBe("(max-width: 359px)");
    expect(askPlaceholder(false)).toBe("Ask about a role, a project, or paste a job description");
    expect(askPlaceholder(true)).toBe("Ask about a role or a project");
  });

  it("keeps the short copy short and clean", () => {
    expect(ASK_COPY.placeholderShort.length).toBeLessThanOrEqual(30);
    expect(ASK_COPY.placeholderShort.length).toBeLessThan(ASK_COPY.placeholder.length);
    expect(ASK_COPY.placeholderShort).not.toMatch(DASH_OR_ARROW);
    expect(ASK_COPY.placeholder).not.toMatch(DASH_OR_ARROW);
  });

  it("renders the full placeholder on the server so hydration matches", () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ChatPage, { id: "ask" })));
    expect(html).toContain(`placeholder="${ASK_COPY.placeholder}"`);
    expect(html).toContain(`aria-label="${ASK_COPY.placeholder}"`);
    expect(html).not.toContain(ASK_COPY.placeholderShort);
  });
});
