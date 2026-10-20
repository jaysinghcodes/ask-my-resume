import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import profile from "../kb/profile.json";
import bullets from "../kb/bullets.json";
import { Hero } from "../frontend/src/components/Hero.jsx";
import { ImpactStrip } from "../frontend/src/components/ImpactStrip.jsx";
import { heroContent, impactItems } from "../frontend/src/components/heroModel.js";
import { focusIdFromState } from "../frontend/src/components/ScrollToHash.jsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const IMPACT = [
  {
    value: "9 mo to 1 wk",
    label: "Product launch timelines on a core banking modernization",
    tags: "CapTech · Top 10 U.S. bank",
  },
  {
    value: "$7.8M",
    label: "Projected annual value from data standardization",
    tags: "Databricks · Snowflake",
  },
  {
    value: "75%",
    label: "Lower infrastructure cost after 6 months of New Relic analysis",
    tags: "AWS ECS · DB throughput",
  },
  {
    value: "80%",
    label: "Of the organization impacted by the AWS migration",
    tags: "Cloud native services",
  },
];

function html(element) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, element));
}

/**
 * @param {Buffer} buf
 */
function webpSize(buf) {
  const tag = buf.toString("ascii", 12, 16);
  if (tag === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (tag === "VP8 ") {
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    };
  }
  throw new Error(`unsupported webp chunk ${tag}`);
}

describe("hero content from the knowledge base", () => {
  it("reads headline option A, the lede, and the status line from profile", () => {
    const content = heroContent(profile);
    expect(content.headline).toBe("AI native software engineer.");
    expect(content.headlineSupport).toBe("Cloud platforms, data infrastructure and production AI.");
    expect(content.lede).toBe(
      "I ship end to end, from architecture through deployment and operations, across fintech and large scale enterprise environments.",
    );
    expect(content.title).toBe("Software Engineer Consultant");
    expect(content.employer).toBe("CapTech Consulting");
    expect(content.location).toBe("Chicago, IL");
    expect(content.availability).toBe("Open to new roles");
    expect(content.workPreferences).toBe("Open to remote and relocation for the right role.");
    expect(content.resumeHref).toBe("/Jay-Singh-Resume-Oct-2026.pdf");
    expect(content.emailHref).toBe("mailto:jaggys44@gmail.com");
    expect(content.photo).toMatchObject({
      src: "/jay-singh-72.webp",
      src2x: "/jay-singh-144.webp",
      alt: "Jay Singh",
      width: 72,
      height: 72,
    });
  });

  it("changes the headline when profile.headline changes", () => {
    const changed = heroContent({ ...profile, headline: "Platform engineer." });
    expect(changed.headline).toBe("Platform engineer.");
    const markup = html(createElement(Hero, { profile: { ...profile, headline: "Platform engineer." } }));
    expect(markup).toContain("Platform engineer.");
    expect(markup).not.toContain("AI native software engineer.");
  });

  it("uses the planned resume and email paths when the profile links are missing", () => {
    const content = heroContent({ ...profile, links: [] });
    expect(content.resumeHref).toBe("/Jay-Singh-Resume-Oct-2026.pdf");
    expect(content.emailHref).toBe("mailto:jaggys44@gmail.com");
  });

  it("selects the four impact metrics in mockup order", () => {
    const items = impactItems(bullets);
    expect(items.map(({ value, label, tags }) => ({ value, label, tags }))).toEqual(IMPACT);
  });

  it("follows a changed impact display and skips metrics that are not on the strip", () => {
    const items = impactItems([
      {
        public: true,
        confidence: "verified",
        metrics: [
          { value: "50", unit: "percent", display: "50%", impact_order: 9, public: false },
          { value: "2", display: "should not show" },
          { display: "12 days", label: "Shorter review", tags: "Internal", impact_order: 1 },
        ],
      },
      {
        public: true,
        confidence: "unsure",
        metrics: [{ display: "hidden", impact_order: 2 }],
      },
    ]);
    expect(items).toEqual([
      { order: 1, value: "12 days", label: "Shorter review", tags: "Internal" },
    ]);
  });
});

describe("Hero markup", () => {
  const markup = html(createElement(Hero));

  it("shows the headshot, status, and three buttons", () => {
    expect(markup).toContain('class="hero-photo"');
    expect(markup).toContain('src="/jay-singh-72.webp"');
    expect(markup).toContain('srcSet="/jay-singh-72.webp 1x, /jay-singh-144.webp 2x"');
    expect(markup).toContain('alt="Jay Singh"');
    expect(markup).toContain('width="72"');
    expect(markup).toContain('height="72"');
    expect(markup).not.toContain("loading=");
    expect(markup).toContain('fetchpriority="high"');
    expect(markup).toContain("AI native software engineer.");
    expect(markup).toContain("Cloud platforms, data infrastructure and production AI.");
    expect(markup).toContain("<b>Software Engineer Consultant</b> at CapTech Consulting");
    expect(markup).toContain("Chicago, IL");
    expect(markup).toContain("Open to new roles");
    expect(markup).toContain("Open to remote and relocation for the right role.");
    expect(markup).toContain('class="hero-dot"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('href="/Jay-Singh-Resume-Oct-2026.pdf"');
    expect(markup).toContain("download");
    expect(markup).toContain(">Download resume<");
    expect(markup).toContain('href="/#ask"');
    expect(markup).toContain(">Ask Jay a question<");
    expect(markup).toContain('href="mailto:jaggys44@gmail.com"');
    expect(markup).toContain(">Email me<");
    for (const item of IMPACT) {
      expect(markup).toContain(item.value);
      expect(markup).toContain(item.label);
      expect(markup).toContain(item.tags);
    }
  });

  it("keeps dash punctuation, arrows, and phone numbers out of the hero", () => {
    expect(markup).not.toMatch(/[—–→←↓↑⇒]/);
    expect(markup).not.toMatch(/\s-\s/);
    expect(markup).not.toMatch(/\d{3}[-.\s]\d{3}[-.\s]\d{4}/);
  });

  it("does not hardcode the headline or impact values in the components", () => {
    const hero = fs.readFileSync(path.join(root, "frontend/src/components/Hero.jsx"), "utf8");
    const strip = fs.readFileSync(path.join(root, "frontend/src/components/ImpactStrip.jsx"), "utf8");
    const model = fs.readFileSync(path.join(root, "frontend/src/components/heroModel.js"), "utf8");
    const combined = `${hero}\n${strip}\n${model}`;
    expect(combined).not.toContain("AI native software engineer");
    expect(combined).not.toContain("9 mo to 1 wk");
    expect(combined).not.toContain("$7.8M");
    expect(combined).not.toContain("CapTech Consulting");
  });

  it("renders nothing for an empty impact list", () => {
    expect(html(createElement(ImpactStrip, { items: [] }))).toBe("");
  });
});

describe("impact value CSS", () => {
  const css = fs.readFileSync(path.join(root, "frontend/src/styles/hero.css"), "utf8");

  it("keeps every value on one line at the same size", () => {
    const block = css.slice(css.indexOf(".impact-value"), css.indexOf(".impact-label"));
    expect(block).toContain("white-space: nowrap");
    expect(block).toContain("font-size: 21px");
    expect(css).toContain("font-size: 24px");
    expect(block).not.toContain("ellipsis");
    expect(css).not.toMatch(/\.impact li:first-child \.impact-value/);
  });
});

describe("headshot files", () => {
  it("exports Jay's photo at 72 and 144", () => {
    const small = fs.readFileSync(path.join(root, "frontend/public/jay-singh-72.webp"));
    const large = fs.readFileSync(path.join(root, "frontend/public/jay-singh-144.webp"));
    expect(small.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(large.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(webpSize(small)).toEqual({ width: 72, height: 72 });
    expect(webpSize(large)).toEqual({ width: 144, height: 144 });
  });
});

describe("Ask Jay a question", () => {
  it("routes to #ask through the router and asks ScrollToHash to focus the input", () => {
    const hero = fs.readFileSync(path.join(root, "frontend/src/components/Hero.jsx"), "utf8");
    const model = fs.readFileSync(path.join(root, "frontend/src/components/heroModel.js"), "utf8");
    const scroll = fs.readFileSync(path.join(root, "frontend/src/components/ScrollToHash.jsx"), "utf8");
    const nav = fs.readFileSync(path.join(root, "frontend/src/components/SiteNav.jsx"), "utf8");
    expect(hero).toContain('to={{ hash: "ask" }}');
    expect(hero).toContain('state={{ focus: "ask-input" }}');
    expect(hero).not.toContain("focusAskInput");
    expect(model).not.toContain("pushState");
    expect(scroll).toContain('focus === "ask-input"');
    expect(scroll).toContain('id === "ask"');
    expect(scroll).toContain('querySelector("h1, h2")');
    expect(nav).toContain("scrollToId(item.id)");
    expect(focusIdFromState({ focus: "ask-input" })).toBe("ask-input");
    expect(focusIdFromState(null)).toBe("");
    expect(focusIdFromState({ focus: "heading" })).toBe("");
  });
});

describe("ask target", () => {
  it("marks the chat section and input so the hero button can focus them", () => {
    const page = fs.readFileSync(path.join(root, "frontend/src/pages/ChatPage.jsx"), "utf8");
    expect(page).toContain('id = "ask"');
    expect(page).toContain('id="ask-input"');
    expect(page).toContain("<section");
  });

  it("renders the hero above the home sections", () => {
    const home = fs.readFileSync(path.join(root, "frontend/src/pages/HomePage.jsx"), "utf8");
    expect(home.indexOf("<Hero")).toBeGreaterThan(-1);
    expect(home.indexOf("<Hero")).toBeLessThan(home.indexOf("HOME_SECTIONS.map"));
  });
});
