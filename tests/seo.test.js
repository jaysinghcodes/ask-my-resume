import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import profile from "../kb/profile.json";
import {
  OG_IMAGE,
  ROUTE_META,
  SITE_TITLE,
  SITE_URL,
  personJsonLd,
  seoHeadHtml,
  siteDescription,
} from "../frontend/src/seo.js";
import { canHydrate } from "../frontend/src/can-hydrate.js";
import { checkCopy, extractCopy, parseBannedTerms } from "../scripts/copy-check.mjs";
import { BROWSER_KB_OMIT, browserKb } from "../frontend/vite.config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @param {string} rel */
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/** @param {any} value */
function loose(value) {
  return value;
}

const DASH_OR_ARROW = /[\u2012-\u2015\u2190-\u21FF]|\s-\s|--|->|=>/;

describe("seo head", () => {
  it("uses the profile summary as the description", () => {
    expect(siteDescription(profile)).toBe(String(profile.summary).replace(/\s+/g, " ").trim());
    expect(siteDescription(profile).length).toBeGreaterThan(50);
    expect(siteDescription(profile).length).toBeLessThanOrEqual(160);
    expect(siteDescription(null)).toBe("");
  });

  it("builds a Person JSON LD with no telephone", () => {
    const person = loose(personJsonLd(profile));
    expect(person["@type"]).toBe("Person");
    expect(person.url).toBe(`${SITE_URL}/`);
    expect(person.image).toBe(`${SITE_URL}${OG_IMAGE.path}`);
    expect(person.name).toBe(profile.display_name || profile.full_name);
    expect(person.jobTitle).toBe(profile.current_role.title);
    expect(person.worksFor).toEqual({ "@type": "Organization", name: profile.current_role.employer });
    expect(person.address.addressCountry).toBe("US");
    for (const url of person.sameAs) expect(url).toMatch(/^https:\/\/(www\.)?(linkedin|github)\.com\//);
    const text = JSON.stringify(person);
    expect(text).not.toMatch(/telephone/i);
    expect(text).not.toMatch(/\+?1?[\s.(]*\d{3}[\s.)]*\d{3}[\s.]*\d{4}/);
  });

  it("drops private and non https links from sameAs", () => {
    const person = loose(
      personJsonLd({
        links: [
          { url: "https://github.com/jaysinghcodes" },
          { url: "https://www.linkedin.com/in/x", public: false },
          { url: "mailto:a@b.c" },
          { url: "http://github.com/x" },
        ],
      }),
    );
    expect(person.sameAs).toEqual(["https://github.com/jaysinghcodes"]);
    expect(loose(personJsonLd(null)).name).toBe("Jay Singh");
  });

  it("emits the canonical, icons, og and twitter tags", () => {
    const head = seoHeadHtml(profile);
    expect(head).toContain(`<link rel="canonical" href="${SITE_URL}/" />`);
    expect(head).toContain('<meta property="og:image" content="https://ask-jay.vercel.app/og-image.png" />');
    expect(head).toContain('<meta property="og:image:width" content="1200" />');
    expect(head).toContain('<meta property="og:image:height" content="630" />');
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(head).toContain('href="/favicon.ico"');
    expect(head).toContain('href="/apple-touch-icon.png"');
    expect(head).toContain('<script type="application/ld+json">');
  });

  it("escapes markup in the head values", () => {
    const head = seoHeadHtml({ summary: 'a "b" <c> & d', display_name: "</script><x>" });
    expect(head).toContain('content="a &quot;b&quot; &lt;c> &amp; d"');
    expect(head).not.toContain("</script><x>");
  });

  it("keeps titles and descriptions free of dashes and arrows", () => {
    const values = [SITE_TITLE, OG_IMAGE.alt, siteDescription(profile)];
    for (const meta of Object.values(ROUTE_META)) values.push(meta.title, meta.description ?? "");
    for (const value of values) expect(value).not.toMatch(DASH_OR_ARROW);
    expect(ROUTE_META.home.title).toBe(SITE_TITLE);
    expect(ROUTE_META.notFound.title).toBe("Page not found · Jay Singh");
    expect(ROUTE_META.contact.title).toBe("Contact · Jay Singh");
  });
});

describe("copy check", () => {
  it("extracts text, copy attributes and JSON LD strings but not URLs or scripts", () => {
    const html = [
      '<head><title>Hi there</title><meta name="description" content="Desc here" />',
      '<meta property="og:url" content="https://x.test/" /><meta charset="utf-8" content="skip" />',
      '<script type="application/ld+json">{"name":"Jay","url":"https://x.test/"}</script>',
      "<script>var a = 1 -> 2;</script><style>a{b:c}</style></head>",
      '<body><img alt="Photo" /><button aria-label="Open menu">Go</button><!-- a -- b --></body>',
    ].join("");
    const items = extractCopy(html);
    expect(items).toEqual(expect.arrayContaining(["Jay", "Desc here", "Photo", "Open menu", "Go", "Hi there"]));
    expect(items).not.toContain("https://x.test/");
    expect(items).not.toContain("skip");
    expect(items.join(" ")).not.toContain("->");
  });

  it("flags dashes, arrows, phones and banned terms by item number", () => {
    const items = [
      "Clean copy, no issues.",
      "Built it \u2014 shipped it",
      "Then \u2192 done",
      `Call ${["312", "555", "0199"].join(" ")}`,
      "Worked for SecretCo",
      "a - b",
      "x -> y",
      "Well-known compound words are fine",
    ];
    const issues = checkCopy(items, parseBannedTerms('"secretco, other"'));
    expect(issues).toEqual([
      { item: 2, rule: "dash" },
      { item: 3, rule: "arrow" },
      { item: 4, rule: "phone" },
      { item: 5, rule: "banned" },
      { item: 6, rule: "dash" },
      { item: 7, rule: "arrow" },
    ]);
  });

  it("parses banned terms and skips when unset", () => {
    expect(parseBannedTerms(undefined)).toEqual([]);
    expect(parseBannedTerms(" A, ,b ")).toEqual(["a", "b"]);
    expect(parseBannedTerms("'c'")).toEqual(["c"]);
  });

  it("finds no issues in the head the build injects", () => {
    expect(checkCopy(extractCopy(`<head>${seoHeadHtml(profile)}</head>`))).toEqual([]);
  });
});

describe("crawler files", () => {
  it("allows the site, blocks the API and points to the sitemap", () => {
    const robots = read("frontend/public/robots.txt");
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).toMatch(/^Disallow: \/api\/$/m);
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });

  it("lists only the home page in the sitemap", () => {
    const sitemap = read("frontend/public/sitemap.xml");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([`${SITE_URL}/`]);
  });

  it("keeps static files out of the SPA rewrite", () => {
    const vercel = JSON.parse(read("vercel.json"));
    const re = new RegExp(`^${vercel.rewrites[0].source}$`);
    for (const file of ["/robots.txt", "/sitemap.xml", "/favicon.ico", "/og-image.png", "/icon.svg", "/apple-touch-icon.png", "/assets/a.js", "/api/chat"]) {
      expect(re.test(file), file).toBe(false);
    }
    for (const route of ["/", "/contact", "/about", "/nope"]) expect(re.test(route), route).toBe(true);
  });

  it("ships a 1200 by 630 PNG preview and real icons", () => {
    const png = fs.readFileSync(path.join(root, "frontend/public/og-image.png"));
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(png.length).toBeLessThan(300 * 1024);
    const ico = fs.readFileSync(path.join(root, "frontend/public/favicon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBeGreaterThanOrEqual(2);
    const touch = fs.readFileSync(path.join(root, "frontend/public/apple-touch-icon.png"));
    expect(touch.readUInt32BE(16)).toBe(180);
    expect(read("frontend/public/icon.svg")).toContain("<svg");
  });
});

describe("prerender and accessibility shell", () => {
  it("renders a skip link before the nav that targets a focusable main", () => {
    // PageShell pulls the footer's virtual:kb module, so check the source; the click through
    // and kbd12 runs check the rendered page.
    const src = read("frontend/src/components/PageShell.jsx");
    const skip = src.indexOf('<a className="skip-link" href="#main">');
    expect(skip).toBeGreaterThan(-1);
    expect(skip).toBeLessThan(src.indexOf("<SiteNav />"));
    expect(src).toContain("Skip to content");
    expect(src).toContain('<main id="main" tabIndex={-1}>');
  });

  it("styles the skip link off screen until focused", () => {
    const css = read("frontend/src/styles/shell.css");
    expect(css).toMatch(/\.skip-link\s*\{[^}]*translateY\(-160%\)/);
    expect(css).toMatch(/\.skip-link:focus[^{]*\{[^}]*transform:\s*none/);
  });

  it("marks the head and root for the build", () => {
    const html = read("frontend/index.html");
    expect(html).toContain("<!-- seo-head -->");
    expect(html).toContain('<div id="root"><!--app-html--></div>');
    expect(html).toContain('if (location.pathname !== "/") document.getElementById("root").textContent = "";');
  });

  it("hydrates only the prerendered home page with no hash", () => {
    const pre = { hasAttribute: (/** @type {string} */ name) => name === "data-prerendered" };
    const plain = { hasAttribute: () => false };
    expect(canHydrate(pre, { pathname: "/", hash: "" })).toBe(true);
    expect(canHydrate(pre, { pathname: "/", hash: "#projects" })).toBe(false);
    expect(canHydrate(pre, { pathname: "/contact", hash: "" })).toBe(false);
    expect(canHydrate(plain, { pathname: "/", hash: "" })).toBe(false);
  });

  it("leaves doc chunks and the never say list out of the browser KB", () => {
    expect(BROWSER_KB_OMIT).toEqual(["docs", "never_say"]);
    const plugin = loose(browserKb());
    const kbPath = path.join(root, "kb", "kb.json");
    const importer = path.join(root, "frontend/src/App.jsx");
    expect(plugin.resolveId("../../kb/kb.json", importer)).toBe("\0browser-kb");
    expect(plugin.resolveId("./other.json", importer)).toBe(null);
    const code = plugin.load.call({ addWatchFile() {} }, "\0browser-kb");
    const kb = JSON.parse(code.replace(/^export default /, "").replace(/;$/, ""));
    const full = JSON.parse(fs.readFileSync(kbPath, "utf8"));
    for (const key of BROWSER_KB_OMIT) expect(kb).not.toHaveProperty(key);
    expect(kb.profile).toEqual(full.profile);
  });
});
