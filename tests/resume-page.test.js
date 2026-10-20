import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { askAbout } from "../frontend/src/components/askAbout.js";
import { copyText } from "../frontend/src/components/copyText.js";
import { HomeResume } from "../frontend/src/components/HomeResume.jsx";
import * as constants from "../frontend/src/config/constants.js";
import { navItems } from "../frontend/src/nav-items.js";
import {
  buildResumePage,
  questionForTopic,
  skillGroups,
} from "../frontend/src/resume/pageModel.js";
import { HOME_SECTIONS } from "../frontend/src/sections.js";
import { buildKnowledgeBase } from "../lib/kb-build.js";
import { proseDashIssues } from "../lib/doc-text.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadKb() {
  const result = buildKnowledgeBase({
    kbDir: path.join(root, "kb"),
    outPath: path.join(root, "kb", "kb.json"),
    env: {},
    now: "2026-10-20T12:00:00.000Z",
  });
  if (!result.ok || !result.kb) {
    throw new Error(result.errors.join("\n"));
  }
  return result.kb;
}

const kb = loadKb();
/** @type {import("../frontend/src/resume/pageModel.js").KnowledgeBase} */
const resumeKb = /** @type {any} */ (kb);
const page = buildResumePage(resumeKb);
const render = /** @type {any} */ (createElement);
const html = renderToStaticMarkup(render(HomeResume, { knowledgeBase: resumeKb }));

function maskLinks(text) {
  if (text.startsWith("/") || /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(text)) return " ";
  return text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b[\w.-]+\.\w{2,}\/\S+/g, " ");
}

function visibleText(markup) {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("resume page", () => {
  it("registers the nav sections that make the tabs real", () => {
    const items = navItems(HOME_SECTIONS);
    expect(items.map((section) => section.label)).toEqual([
      "Experience",
      "Projects",
      "Ask Jay",
      "Contact",
    ]);
    expect(items.map((section) => section.to)).toEqual([
      "/#experience",
      "/#projects",
      "/#ask",
      "/#contact",
    ]);

    const nav = fs.readFileSync(path.join(root, "frontend/src/components/SiteNav.jsx"), "utf8");
    expect(nav).toContain("HOME_SECTIONS");
    expect(nav).toContain("RESUME_HREF");
    const app = fs.readFileSync(path.join(root, "frontend/src/App.jsx"), "utf8");
    expect(app).toContain("<ScrollToHash />");
    expect(app).toContain('hash: "contact"');
  });

  it("renders four roles in reverse order with page bullets only", () => {
    expect(page.experience.map((role) => role.id)).toEqual([
      "role-captech-consultant",
      "role-procrewz-salesforce-intern",
      "role-captech-intern",
      "role-osu-wexner",
    ]);
    expect(page.experience.map((role) => role.dates)).toEqual([
      "Sep 2024 to present",
      "May 2024 to Aug 2024",
      "May 2023 to Aug 2023",
      "Jan 2023 to May 2023",
    ]);
    expect(page.experience[0].employerLine).toBe("CapTech Consulting · Chicago, IL");
    expect(page.experience[3].title).toBe("Full Stack Student Developer");
    expect(page.experience[3].employerLine).toBe("OSU Wexner Medical Center · Columbus, OH");

    const shown = kb.bullets.filter((bullet) => bullet.show_on_page);
    expect(page.experience.flatMap((role) => role.bullets).map((bullet) => bullet.text)).toEqual(
      shown.map((bullet) => bullet.display_text),
    );
    expect(html.match(/<li>/g)).toHaveLength(11);
    expect(html).toContain('id="experience"');
    expect(html).toContain('id="role-osu-wexner"');
    for (const id of [
      "role-captech-consultant",
      "role-procrewz-salesforce-intern",
      "role-captech-intern",
      "role-osu-wexner",
      "project-cleat",
      "project-mission-control",
      "project-ask-my-resume",
    ]) {
      const tag = html.match(new RegExp(`<article\\b[^>]*\\bid="${id}"[^>]*>`));
      expect(tag, id).toBeTruthy();
      expect(tag?.[0]).toContain('tabindex="-1"');
    }
    const css = fs.readFileSync(path.join(root, "frontend/src/styles/resume.css"), "utf8");
    expect(css).toMatch(/\.role\s*\{[^}]*scroll-margin-top:\s*calc\(var\(--nav-h\)/s);
    expect(css).toMatch(/\.project-card\s*\{[^}]*scroll-margin-top:\s*calc\(var\(--nav-h\)/s);
    expect(css).toMatch(/\.role li\s*\{[^}]*font-size:\s*17\.5px;[^}]*line-height:\s*1\.6;/s);
    expect(css).toMatch(/\.role li\s*\{[^}]*font-size:\s*17px;/s);
    expect(html).toContain("Ask about this role");
    expect(html).not.toContain("Supported production systems using Splunk");
    expect(html).not.toContain("contractor onboarding");
    expect(html).not.toContain("natural language chatbot");
  });

  it("renders the three featured project cards from the knowledge base", () => {
    expect(page.projects.map((project) => project.name)).toEqual([
      "Cleat",
      "Mission Control",
      "Ask Jay",
    ]);
    expect(visibleText(html)).toContain("105 message labeled eval set · 148 unit tests");
    expect(visibleText(html)).toContain("207 test cases across 37 test files");
    expect(visibleText(html)).toContain("Cited answers · streaming · rate limited");
    expect(html).toContain('id="project-cleat"');
    expect(html).toContain('id="project-mission-control"');
    expect(html).toContain('id="project-ask-my-resume"');
    expect(html).toContain('href="https://cleat-cyan.vercel.app"');
    expect(html).toContain('href="https://github.com/jaysinghcodes/Cleat"');
    expect(html).toContain('href="https://github.com/jaysinghcodes/Mission-Control"');
    expect(html).toContain("https://github.com/jaysinghcodes/ask-my-resume/blob/main/README.md#how-it-works");
    expect(html).not.toContain("jaysinghcodes.github.io");
    expect(html).not.toContain("DermAI");
    expect(html).not.toContain("Donor Outreach");
    expect(html).toContain('alt="Cleat trainer inbox"');
    expect(html).toContain('alt="Mission Control office view"');
    expect(html).toContain('alt="Ask Jay chat"');
    expect(html).toContain('src="/projects/cleat.webp"');
    expect(html).toContain('src="/projects/mc.webp"');
    expect(html).toContain('src="/projects/askjay.webp"');
    expect(html).toContain('width="1440"');
    expect(html).toContain('height="960"');
    expect(html).toContain('height="900"');
    expect(html).toContain('height="778"');
    expect(html.match(/loading="lazy"/g)).toHaveLength(3);
    expect(html).toContain("Ask about Cleat");
    expect(html).toContain("Ask about Mission Control");
    expect(html).toContain("How it works");
    expect(html).not.toContain("Ask about Ask Jay");
  });

  it("keeps project images as small WebP files", () => {
    for (const name of ["cleat.webp", "mc.webp", "askjay.webp"]) {
      const bytes = fs.readFileSync(path.join(root, "frontend/public/projects", name));
      expect(bytes.length).toBeGreaterThan(32);
      expect(bytes.length).toBeLessThan(150 * 1024);
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    }
  });

  it("groups resume skills and writes the education line", () => {
    expect(page.skills.map((group) => group.group)).toEqual([
      "Languages",
      "AI and data",
      "Cloud and frameworks",
    ]);
    expect(page.skills[0].skills).toEqual([
      "Python",
      "TypeScript",
      "JavaScript",
      "SQL",
      "Java",
      "Go",
      "HTML and CSS",
      "YAML",
    ]);
    expect(page.skills[1].skills).toEqual([
      "Claude API (Anthropic SDK)",
      "OpenAI API",
      "MCP (Model Context Protocol)",
      "RAG",
      "Vector embeddings",
      "pgvector",
      "LLM evals",
      "Agentic workflows",
      "Databricks",
      "Snowflake",
      "PostgreSQL",
      "Pandas",
    ]);
    expect(page.skills[2].skills).toEqual([
      "AWS (Lambda, Fargate, ECS, SQS, SNS, RDS)",
      "Docker",
      "GitHub Actions",
      "Vercel",
      "Supabase",
      "React",
      "Next.js",
      "React Native",
      "Node.js",
      "NestJS",
      "Express",
      "Prisma",
      "Spring Boot",
      "GraphQL",
    ]);
    const shuffled = skillGroups(/** @type {any} */ ({
      skills: [
        { group: "Languages", display_name: "Go", on_resume: true, confidence: "verified", public: true },
        { group: "Languages", display_name: "YAML", on_resume: true, confidence: "verified", public: true },
        { group: "Languages", display_name: "C", on_resume: true, confidence: "unsure", public: true },
        { group: "Languages", display_name: "Python", on_resume: true, confidence: "verified", public: true },
        { group: "Languages", display_name: "TypeScript", on_resume: true, confidence: "verified", public: true },
      ],
    }));
    expect(shuffled.map((group) => group.skills)).toEqual([["Python", "TypeScript", "Go", "YAML"]]);
    expect(page.skills.flatMap((group) => group.skills)).not.toContain("C");
    expect(page.skills.flatMap((group) => group.skills)).not.toContain("PyTorch");
    expect(page.skills.flatMap((group) => group.skills)).not.toContain("New Relic");
    expect(page.skills.flatMap((group) => group.skills)).not.toContain("Splunk");
    expect(page.skills.flatMap((group) => group.skills)).not.toContain("Salesforce and Apex");
    expect(page.skills.flatMap((group) => group.skills)).not.toContain("AI safety guardrails");
    if (!page.education) throw new Error("missing education");
    expect(page.education.heading).toBe("B.S. Computer Science and Engineering");
    expect(page.education.detail).toBe("The Ohio State University · Columbus, OH · Class of 2024");
    expect(page.education.activities).toBe(
      "Secretary, Buckeye Bhangra. Ambassador, Hack OHI/O and the Sikh Student Association.",
    );
    expect(html).toContain('id="skills"');
    expect(html).toContain('id="education-osu"');
    expect(html).not.toContain("IAYP");
    expect(html).not.toContain("Hyrox");
  });

  it("replaces contact links with profile.links and a sibling Copy button", () => {
    expect(constants).not.toHaveProperty("CONTACT_LINKS");
    expect(page.contact.rows.map((row) => [row.label, row.value])).toEqual([
      ["Email", "jaggys44@gmail.com"],
      ["LinkedIn", "linkedin.com/in/j-singh19"],
      ["GitHub", "github.com/jaysinghcodes"],
      ["Resume", "Download PDF"],
    ]);
    expect(page.contact.blurb).toBe(
      "Recruiters, hiring managers, and anyone curious about working together, reach out anytime.",
    );
    expect(page.contact.closing).toBe(
      "Based in Chicago, IL · Open to remote and relocation for the right role.",
    );
    expect(page.contact.email).toBe("jaggys44@gmail.com");
    expect(html).toContain('id="contact"');
    expect(html).toContain('href="mailto:jaggys44@gmail.com"');
    expect(html).not.toContain("Email below");
    expect(html).not.toContain("\u2014");
    expect(html).not.toContain("\u2013");
    expect(html.toLowerCase()).not.toContain("phone");
    expect(html.toLowerCase()).not.toContain("founder");

    const emailAt = html.indexOf('href="mailto:jaggys44@gmail.com"');
    const emailRow = html.slice(emailAt, html.indexOf("contact-note"));
    expect(emailRow.indexOf("<button")).toBeGreaterThan(emailRow.indexOf("</a>"));
    expect(emailRow).not.toMatch(/<a[^>]*>[\s\S]*<button/);

    const contactPage = fs.readFileSync(path.join(root, "frontend/src/pages/ContactPage.jsx"), "utf8");
    const app = fs.readFileSync(path.join(root, "frontend/src/App.jsx"), "utf8");
    expect(app).toContain('hash: "contact"');
    expect(contactPage).not.toContain("CONTACT_LINKS");
    expect(contactPage).not.toContain("\u2014");
    expect(contactPage).not.toContain("Email below");

    const css = fs.readFileSync(path.join(root, "frontend/src/styles/resume.css"), "utf8");
    expect(css).toMatch(/\.contact-row a:focus-visible/);
    expect(css).toMatch(/\.copy-email:focus-visible/);
    expect(css).toContain("outline: 2px solid var(--ink)");
  });

  it("asks a scoped question and prefills the chat input", () => {
    expect(questionForTopic("role-captech-consultant", resumeKb)).toBe(
      "Tell me about Jay's Software Engineer Consultant role at CapTech Consulting.",
    );
    expect(questionForTopic("project-cleat", resumeKb)).toBe("Tell me about Cleat.");
    expect(questionForTopic("project-mission-control", resumeKb)).toBe("Tell me about Mission Control.");

    const textarea = new TextArea();
    const ask = {
      scrollIntoView() {
        this.scrolled = true;
      },
      querySelector(selector) {
        return selector === "textarea" ? textarea : null;
      },
    };
    const doc = {
      getElementById(id) {
        return id === "ask" ? ask : null;
      },
      querySelector() {
        return textarea;
      },
    };
    const question = askAbout("role-osu-wexner", doc);
    expect(question).toBe(
      "Tell me about Jay's Full Stack Student Developer role at OSU Wexner Medical Center.",
    );
    expect(ask.scrolled).toBe(true);
    expect(textarea.value).toBe(question);
    expect(textarea.focused).toBe(true);
    expect(textarea.events.map((event) => event.type)).toEqual(["input"]);
  });

  it("copies the email address", async () => {
    const writes = [];
    await expect(copyText("jaggys44@gmail.com", {
      writeText: async (value) => {
        writes.push(value);
      },
    })).resolves.toBe(true);
    expect(writes).toEqual(["jaggys44@gmail.com"]);

    await expect(copyText("jaggys44@gmail.com", {
      writeText: async () => {
        throw new Error("blocked");
      },
    })).resolves.toBe(false);
  });

  it("keeps new copy free of dash punctuation and arrows", () => {
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
    expect(readme).toMatch(/^## How it works$/m);
    const section = readme.split(/^## How it works$/m)[1].split(/^## /m)[0];
    expect(proseDashIssues(section)).toEqual([]);

    const strings = [];
    collectStrings(page, strings);
    for (const text of strings) {
      expect(proseDashIssues(maskLinks(text)), text).toEqual([]);
    }
    expect(proseDashIssues(maskLinks(visibleText(html)))).toEqual([]);
  });

  it("mounts the sections on the home page and gives the ask card an id", () => {
    const app = fs.readFileSync(path.join(root, "frontend/src/App.jsx"), "utf8");
    const sections = fs.readFileSync(path.join(root, "frontend/src/sections.js"), "utf8");
    expect(app).toContain("<HomePage />");
    expect(app).toContain("<ScrollToHash />");
    expect(app).toContain('hash: "ask"');
    expect(app).toContain("<NotFoundPage />");
    expect(sections).toContain("ExperienceSection");
    expect(sections).toContain("ProjectsSection");
    expect(sections).toContain("ContactSection");
    const chat = fs.readFileSync(path.join(root, "frontend/src/pages/ChatPage.jsx"), "utf8");
    expect(chat).toContain("id={id}");
    expect(chat).toContain('className="ask-section"');
  });
});

class TextArea {
  constructor() {
    this.stored = "";
    this.events = [];
    this.focused = false;
  }

  get value() {
    return this.stored;
  }

  set value(next) {
    this.stored = next;
  }

  focus() {
    this.focused = true;
  }

  dispatchEvent(event) {
    this.events.push(event);
  }
}

function collectStrings(value, out) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectStrings(item, out));
  }
}
