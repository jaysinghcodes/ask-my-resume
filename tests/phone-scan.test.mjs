import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { findPhoneHits, parseAllowlist, shouldSkipRepoPath } from "../scripts/phone-scan.mjs";
import { buildTinyPdf } from "../scripts/tiny-pdf.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(root, "tests/fixtures/phone-scan");
const scanner = path.join(root, "scripts/phone-scan.mjs");

function us(sep = "-") {
  return ["555", "555", "0123"].join(sep);
}

function runScan(args) {
  return spawnSync(process.execPath, [scanner, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function assertHit(text) {
  const hits = findPhoneHits(text);
  assert.equal(hits.length, 1, "expected one phone hit");
  assert.equal(hits[0].line, 1);
  assert.equal(Object.hasOwn(hits[0], "line"), true);
}

function assertClean(text) {
  assert.deepEqual(
    findPhoneHits(text).map((hit) => hit.line),
    [],
  );
}

test("separated, bare, tel, and bracket forms are phone hits", () => {
  const area = "555";
  const mid = "555";
  const last = "0123";
  assertHit(us("-"));
  assertHit(us("."));
  assertHit(us(" "));
  assertHit(us("   "));
  assertHit(us("\u00a0"));
  assertHit(us("\u00a0\u00a0"));
  assertHit(`(${area}) ${mid}-${last}`);
  assertHit(`(${area})${mid} ${last}`);
  assertHit(`(${area})${mid}-${last}`);
  assertHit(us(""));
  assertHit(`1${us("")}`);
  assertHit(`+1${us("")}`);
  assertHit(`+1 ${us(" ")}`);
  assertHit(`+1-${us("-")}`);
  assertHit(`tel:${us("")}`);
  assertHit(`tel:+1-${us("-")}`);
  assertHit(`tel: (${area}) ${mid}-${last}`);
  assertHit(`${us("-")}${"4"}`);
});

test("international +44 and +91 forms are phone hits", () => {
  assertHit(`+44 ${us(" ")}`);
  assertHit(`+44.${us(".")}`);
  assertHit(`+44-${us("-")}`);
  assertHit(`+44 (${"555"}) ${"555"}-${"0123"}`);
  assertHit(`+44${us("")}`);
  assertHit(`+91 ${"55555"} ${"50123"}`);
  assertHit(`+91-${us("-")}`);
  assertHit(`+91 (${"555"}) ${"555"}-${"0123"}`);
  assertHit(`+91${us("")}`);
  assertHit(`+91 ${us(" ")} ${"555"}`);
});

test("hashes, UUIDs, ISO dates, and short numbers are not phone hits", () => {
  const samples = [
    "2024",
    "2026",
    "1999",
    "2024-10-20",
    "2026-10-20T01:53:00Z",
    "10/20/2026",
    "2026.10.20",
    "1.2.3",
    "v16.14.0",
    "^11.14.0",
    "7.3.8",
    "43aff81936cc627f6e3959879246fa6d0e1ca171",
    "550e8400-e29b-41d4-a716-446655440000",
    "9".repeat(9),
    "+1234567",
    "test@example.com",
    "port 3001",
    "build 8946",
    "192.168.1.1",
  ];
  for (const sample of samples) assertClean(sample);
});

test("fullwidth, zero width, five and five, extension, and 00 prefix fail", () => {
  const fullwidth = String.fromCodePoint(...[0xff15, 0xff15, 0xff15, 0xff15, 0xff15, 0xff15, 0xff10, 0xff11, 0xff12, 0xff13]);
  const arabic = String.fromCodePoint(...Array.from({ length: 10 }, () => 0x0665));
  const zw = `${"55555"}\u200b${"50123"}`;
  assertHit(fullwidth);
  assertHit(arabic);
  assertHit(zw);
  assertHit(["55555", "50123"].join(" "));
  assertHit(["55555", "50123"].join("-"));
  assertHit(`${us("-")}x${"99"}`);
  assertHit(`x${us("")}`);
  assertHit(["00", "44", "555", "555", "0123"].join(" "));
  assertClean("9".repeat(8));
  assertClean(["44", "555", "018"].join(" "));
  assertHit("9".repeat(10));
  assertHit("9".repeat(16));
  assertHit("9".repeat(40));
  assertClean(`abc${"9".repeat(10)}def`);
});

test("an allowlisted exact token is kept", () => {
  const token = ["1234", "5678", "9012"].join("-");
  assertHit(token);
  assert.deepEqual(findPhoneHits(token, [token]).map((hit) => hit.line), []);
});

test("allowlist lines need a reason", () => {
  const parsed = parseAllowlist("# note\n\nno-reason-here\n");
  assert.deepEqual(parsed.errors, [3]);
  assert.deepEqual(parsed.tokens, []);
  const ok = parseAllowlist("1234\torder id in a fixture comment\n");
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.tokens.length, 1);
});

test("non breaking spaces and repeated spaces normalize before matching", () => {
  const nbsp = "\u00a0";
  const text = `note\n${["555", "555", "0123"].join(nbsp + nbsp)}\n`;
  const hits = findPhoneHits(text);
  assert.deepEqual(
    hits.map((hit) => hit.line),
    [2],
  );
});

function assertFixtureFails(name) {
  const file = path.join(fixtures, name);
  const result = runScan([file]);
  const base = path.posix.basename(name);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, new RegExp(`${base}:\\d+`));
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /555/);
  const nonempty = fs
    .readFileSync(file, "utf8")
    .split(/\n/)
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter((entry) => entry.line !== "");
  const reported = [...result.stdout.matchAll(new RegExp(`${base}:(\\d+)`, "g"))].map((match) =>
    Number(match[1]),
  );
  assert.deepEqual(
    reported,
    nonempty.map((entry) => entry.number),
  );
}

test("bad text fixture fails and prints only path and line", () => {
  assertFixtureFails("bad/numbers.txt");
});

test("plus 44 and plus 91 fixtures fail the scan", () => {
  assertFixtureFails("bad/plus44.txt");
  assertFixtureFails("bad/plus91.txt");
});

test("normalized fixtures fail the scan", () => {
  assertFixtureFails("bad/normalized.txt");
});

test("hex edges and html entities fail", () => {
  const file = path.join(fixtures, "bad/edges.txt");
  const lines = fs.readFileSync(file, "utf8").split(/\n/).filter((line) => line.trim() !== "");
  for (const line of lines) assertHit(line);
  assertFixtureFails("bad/edges.txt");
});

test("clean fixture passes", () => {
  const result = runScan([path.join(fixtures, "clean/clean.txt")]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /no phone numbers/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /555/);
});

test("generated PDF fixture with a fake number fails", () => {
  const committed = path.join(fixtures, "bad/number.pdf");
  const generated = path.join(os.tmpdir(), "phone-scan-bad.pdf");
  fs.writeFileSync(generated, buildTinyPdf(`Call ${us("-")} today`));
  for (const file of [committed, generated]) {
    const result = runScan([file]);
    assert.notEqual(result.status, 0, file);
    assert.match(result.stdout, /\.pdf:\d+/);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /555/);
  }
});

test("clean PDF fixture passes", () => {
  const result = runScan([path.join(fixtures, "clean/note.pdf")]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /no phone numbers/);
});

test("repo scan skips fixtures, lockfiles, and node_modules", () => {
  assert.equal(shouldSkipRepoPath("tests/fixtures/phone-scan/bad/numbers.txt"), true);
  assert.equal(shouldSkipRepoPath("frontend/package-lock.json"), true);
  assert.equal(shouldSkipRepoPath("mcp-server/node_modules/express/index.js"), true);
  assert.equal(shouldSkipRepoPath("frontend/public/Jay-Singh-Resume-Oct-2026.pdf"), false);
  assert.equal(
    shouldSkipRepoPath("tests/fixtures/phone-scan/bad/numbers.txt", { explicit: true }),
    false,
  );
});

test("default repo scan passes", () => {
  const result = runScan([]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /no phone numbers/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /555/);
});
