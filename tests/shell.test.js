import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { formatBuiltAt } from "../frontend/src/format-built-at.js";
import { contactFromProfile } from "../frontend/src/contact-from-kb.js";
import { contactSectionMounted, navItems } from "../frontend/src/nav-items.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("layout shell", () => {
  it("formats the knowledge base build date without a numeric dash", () => {
    expect(formatBuiltAt("2026-10-18")).toBe("Oct 18, 2026");
    expect(formatBuiltAt("2026-10-20")).toBe("Oct 20, 2026");
    expect(formatBuiltAt("")).toBe("");
    expect(formatBuiltAt("2026-02-31")).toBe("");
  });

  it("links only mounted sections and keeps contact on its route", () => {
    const askOnly = [{ id: "ask", label: "Ask Jay", order: 30 }];
    expect(navItems(askOnly)).toEqual([
      { id: "ask", label: "Ask Jay", to: "/#ask", order: 30 },
      { id: "contact", label: "Contact", to: "/contact", order: 40 },
    ]);
    expect(contactSectionMounted(askOnly)).toBe(false);

    const withSections = [
      { id: "experience", label: "Experience", order: 10 },
      { id: "projects", label: "Projects", order: 20 },
      { id: "ask", label: "Ask Jay", order: 30 },
      { id: "contact", label: "Contact", order: 40 },
    ];
    expect(navItems(withSections).map((item) => item.to)).toEqual([
      "/#experience",
      "/#projects",
      "/#ask",
      "/#contact",
    ]);
    expect(contactSectionMounted(withSections)).toBe(true);

    const home = read("frontend/src/sections.js");
    expect(home).toContain('id: "ask"');
    expect(home).toContain('id: "experience"');
    expect(home).toContain('id: "projects"');
    expect(home).toContain('id: "contact"');
  });

  it("builds the contact list from public profile links", () => {
    const contact = contactFromProfile({
      contact_blurb: "Reach out anytime.",
      location: "Chicago, IL",
      work_preferences: "Open to remote and relocation for the right role.",
      links: [
        { label: "Ask Jay", url: "https://example.com", display: "Site" },
        { label: "Resume", url: "/Jay-Singh-Resume-Oct-2026.pdf", display: "Download PDF" },
        { label: "Email", url: "mailto:person@example.com", display: "person@example.com" },
        { label: "GitHub", url: "https://github.com/example", display: "github.com/example" },
        { label: "LinkedIn", url: "https://linkedin.com/in/example", display: "linkedin.com/in/example" },
      ],
    });
    expect(contact.links.map((link) => link.label)).toEqual([
      "Email",
      "LinkedIn",
      "GitHub",
      "Resume",
    ]);
    expect(contact.blurb).toBe("Reach out anytime.");
    expect(contactFromProfile(null).links).toEqual([]);
  });

  it("points resume at the pdf, redirects about, and keeps a real contact page", () => {
    const nav = read("frontend/src/components/SiteNav.jsx");
    const menu = read("frontend/src/components/MobileMenu.jsx");
    const app = read("frontend/src/App.jsx");
    const missing = read("frontend/src/pages/NotFoundPage.jsx");
    const constants = read("frontend/src/config/constants.js");
    const footer = read("frontend/src/components/SiteFooter.jsx");

    expect(nav).toContain('target="_blank"');
    expect(nav).toContain("RESUME_HREF");
    expect(nav).not.toContain("moon");
    expect(menu).toContain('target="_blank"');
    expect(menu).toContain('rel="noopener noreferrer"');
    expect(constants).toContain('"/Jay-Singh-Resume-Oct-2026.pdf"');
    expect(constants).not.toContain("NAV_ITEMS");
    expect(constants).not.toContain("ABOUT_TECH_STACK");
    expect(constants).not.toContain("ROUTES");
    expect(app).toContain('path="/about"');
    expect(app).toContain('hash: "ask"');
    expect(app).toContain("<ContactPage />");
    expect(app).toContain("<NotFoundPage />");
    expect(missing).toContain("That page doesn't exist.");
    expect(missing).toContain('to="/"');
    expect(missing).toContain('to="/contact"');
    expect(footer).toContain("Knowledge base updated");
    expect(fs.existsSync(path.join(root, "frontend", "src", "pages", "AboutPage.jsx"))).toBe(false);
    expect(fs.existsSync(path.join(root, "frontend", "src", "components", "ExperienceSection.jsx"))).toBe(
      true,
    );
  });

  it("serves type from the site origin and drops MUI", () => {
    const html = read("frontend/index.html");
    const main = read("frontend/src/main.jsx");
    const ui = fs
      .readdirSync(path.join(root, "frontend", "src"), { recursive: true })
      .filter((name) => String(name).endsWith(".jsx") || String(name).endsWith(".js"))
      .map((name) => read(path.join("frontend", "src", String(name))))
      .join("\n");

    expect(html).toContain("Jay Singh · AI native software engineer");
    expect(html).toContain('name="viewport"');
    // T13: font preloads competed with the first paint on mobile, so fonts load from the inlined CSS.
    expect(html).not.toContain('as="font"');
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
    expect(main).toContain("@fontsource/source-serif-4/latin-400.css");
    expect(main).toContain("@fontsource/inter/latin-400.css");
    const shell = read("frontend/src/styles/shell.css");
    expect(shell).toContain("font-size: 18px;");
    expect(shell).toContain("line-height: 1.65;");
    expect(shell).toContain("font-size: 19px;");
    expect(shell).toContain("padding-top: 48px;");
    expect(shell).toContain("padding-bottom: 64px;");
    expect(shell).not.toContain("padding: 48px 0 64px;");
    expect(main).toContain("@fontsource/jetbrains-mono/latin-400.css");
    expect(main).not.toContain("@mui/material");
    expect(ui).not.toContain("@mui/material");
    expect(ui).not.toContain("@mui/icons-material");
    expect(ui).not.toContain("moon");
    expect(fs.existsSync(path.join(root, "frontend", "src", "theme.js"))).toBe(false);
    expect(fs.existsSync(path.join(root, "frontend", "src", "pages", "ContactPage.jsx"))).toBe(true);
  });
});
