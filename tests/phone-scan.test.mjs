import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { allowTokens, findPhoneHits, parseAllowlist, phoneDigitRuns, readScanText, shouldSkipRepoPath } from "../scripts/phone-scan.mjs";
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
  assert.equal(ok.byPath.size, 0);
});

test("a path scoped allowlist token stays in that file", () => {
  const id = `${"0".repeat(11)}1`;
  const parsed = parseAllowlist(`tests/kb-build.test.js ${id} # demo org id fragment in a kb test\n`);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.tokens, []);
  const packed = `Call ${["21455", id, "50123"].join(" ")}`;
  assert.equal(findPhoneHits(packed, allowTokens(parsed, "README.md")).length, 1);
  assert.equal(findPhoneHits(packed, allowTokens(parsed, "tests/kb-build.test.js")).length, 0);
  assert.equal(findPhoneHits(id, allowTokens(parsed, "tests/kb-build.test.js")).length, 0);
  assert.equal(findPhoneHits(id, allowTokens(parsed, "scripts/phone-scan-allowlist.txt")).length, 0);
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
  assert.equal(shouldSkipRepoPath("scripts/unicode/DerivedNumericValues.txt"), true);
  assert.equal(shouldSkipRepoPath("lib/unicode/DerivedNumericValues.txt"), true);
  assert.equal(shouldSkipRepoPath("lib/unicode/CaseFolding.txt"), true);
  assert.equal(shouldSkipRepoPath("lib/unicode/confusables.txt"), true);
  assert.equal(shouldSkipRepoPath("scripts/unicode/notes.txt"), false);
  assert.equal(shouldSkipRepoPath("lib/unicode/notes.txt"), false);
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

function scriptDigits(zero) {
  const head = "5".repeat(6);
  const tail = "0123";
  return [...`${head}${tail}`].map((digit) => String.fromCodePoint(zero + Number(digit))).join("");
}

test("devanagari, bengali, thai, and nko digits fail", () => {
  assertHit(scriptDigits(0x0966));
  assertHit(scriptDigits(0x09e6));
  assertHit(scriptDigits(0x0e50));
  assertHit(scriptDigits(0x07c0));
  assertFixtureFails("bad/digits.txt");
});

test("form feed and vertical tab join digits inside a line", () => {
  assertHit(["555", "555", "0123"].join("\f"));
  assertHit(["555", "555", "0123"].join("\v"));
  assertFixtureFails("bad/inline-space.txt");
});

test("digit groups on consecutive lines do not fail", () => {
  const groups = ["555", "555", "0123"];
  assertClean(groups.join("\n"));
  assertClean(groups.join("\r\n"));
  assertClean(groups.join("\r"));
  assertHit(groups.join("\u2028"));
  assertHit(groups.join("\u2029"));
  const result = runScan([path.join(fixtures, "clean/line-breaks.txt")]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /no phone numbers/);
});

test("a line separator before a hit keeps the reported line", () => {
  const call = ["555", "555", "0123"].join(" ");
  const cases = [
    { text: `intro\u2028still line one\nCall ${call}\n`, line: 2 },
    { text: `intro\u2029still line one\nCall ${call}\n`, line: 2 },
    { text: `intro\u2028mid\u2029tail\nCall ${call}\n`, line: 2 },
    { text: `one\rtwo\r\nthree\nCall ${call}\n`, line: 3 },
  ];
  cases.forEach((entry, index) => {
    const file = path.join(os.tmpdir(), `phone-scan-line-${index}.txt`);
    fs.writeFileSync(file, entry.text);
    const result = runScan([file]);
    const base = path.basename(file);
    assert.match(result.stdout, new RegExp(`${base}:${entry.line}\\n`));
    assert.doesNotMatch(result.stdout, new RegExp(`${base}:${entry.line + 1}\\b`));
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /555/);
  });
});

test("an emoji before a number on the same line is a phone hit", () => {
  assertHit(`\u{1F4DE} ${us("-")}`);
  const file = path.join(os.tmpdir(), "phone-scan-emoji-same-line.txt");
  fs.writeFileSync(file, `\u{1F4DE} ${us("-")}\n`);
  const result = runScan([file]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, new RegExp(`${path.basename(file)}:1\\n`));
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /555/);
});

test("an emoji on an earlier line does not hide a phone hit", () => {
  const call = ["555", "555", "0123"].join(" ");
  const hits = findPhoneHits(`note \u{1F680}\nCall ${call}\n`);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 2);
});

test("many astral characters before a final hit stay a phone hit", () => {
  const call = ["555", "555", "0123"].join(" ");
  const rocket = "\u{1F680}";
  const lines = Array.from({ length: 10 }, () => `note ${rocket}`);
  const prefix = `${"\u{20000}".repeat(40)}${"\u{100000}".repeat(20)}`;
  const hits = findPhoneHits(`${lines.join("\n")}\n${prefix}Call ${call}\n`);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 11);
});

test("an explicit path resolves from the working directory", () => {
  const result = spawnSync(process.execPath, [scanner, "fixtures/phone-scan/clean/clean.txt"], {
    cwd: path.join(root, "tests"),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /no phone numbers/);
  assert.doesNotMatch(result.stderr, /ENOENT/);
});

test("a large file scans without a stack overflow", () => {
  const line = "note\n";
  const count = Math.ceil((1024 * 1024) / line.length);
  const clean = path.join(os.tmpdir(), "phone-scan-large-clean.txt");
  fs.writeFileSync(clean, line.repeat(count));
  assert.ok(fs.statSync(clean).size >= 1024 * 1024);
  const cleanResult = runScan([clean]);
  assert.equal(cleanResult.status, 0, cleanResult.stderr);

  const phone = ["555", "555", "0123"].join(" ");
  const dirty = path.join(os.tmpdir(), "phone-scan-large-hit.txt");
  fs.writeFileSync(dirty, `${line.repeat(count)}Call ${phone}\n`);
  assert.ok(fs.statSync(dirty).size >= 1024 * 1024);
  const dirtyResult = runScan([dirty]);
  assert.equal(dirtyResult.status, 1);
  assert.match(dirtyResult.stdout, new RegExp(`${path.basename(dirty)}:${count + 1}\\n`));
  assert.doesNotMatch(`${dirtyResult.stdout}\n${dirtyResult.stderr}`, /555|Maximum call stack/);

  const data = path.join(root, "scripts/unicode/DerivedNumericValues.txt");
  const dataResult = runScan([data]);
  assert.ok(dataResult.status === 0 || dataResult.status === 1);
  assert.doesNotMatch(dataResult.stderr, /Maximum call stack/);
});

test("utf-16 and utf-8 bom fixtures fail the scan", () => {
  for (const name of ["bad/utf16le.txt", "bad/utf16be.txt", "bad/utf8bom.txt"]) {
    const result = runScan([path.join(fixtures, name)]);
    assert.notEqual(result.status, 0, name);
    assert.match(result.stdout, /\.txt:\d+/);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /555/);
  }
});

test("a binary file without a bom is skipped", () => {
  const file = path.join(os.tmpdir(), "phone-scan-binary.bin");
  const digits = ["555", "555", "0123"].join("");
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`Call ${digits}`, "utf8"), Buffer.from([0])]));
  const result = runScan([file]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /no phone numbers/);
});

function isFictionalPhone(digits) {
  if (/^(?:1|44|91)?\d{3}555\d{4}$/.test(digits)) return true;
  if (/^01632\d{6}$/.test(digits)) return true;
  if (/^4401632\d{6}$/.test(digits)) return true;
  if (/^441632960\d{3}$/.test(digits)) return true;
  if (/^07700900\d{3}$/.test(digits)) return true;
  if (/^447700900\d{3}$/.test(digits)) return true;
  return false;
}

test("fictional 555 is the exchange", () => {
  const exchange = ["214", "555", "0123"].join("");
  const other = "0".repeat(10);
  const area = ["555", "123", "4567"].join("");
  const line = ["212", "123", "5555"].join("");
  assert.equal(isFictionalPhone(exchange), true);
  assert.equal(isFictionalPhone(["1", exchange].join("")), true);
  assert.equal(isFictionalPhone(["44", exchange].join("")), true);
  assert.equal(isFictionalPhone(["91", exchange].join("")), true);
  assert.equal(isFictionalPhone(["01632", "960000"].join("")), true);
  assert.equal(isFictionalPhone(["44", "01632", "960000"].join("")), true);
  assert.equal(isFictionalPhone(["44", "1632", "960000"].join("")), true);
  assert.equal(isFictionalPhone(["44", "1632", "960999"].join("")), true);
  assert.equal(isFictionalPhone(["44", "1632", "959999"].join("")), false);
  assert.equal(isFictionalPhone(["44", "1632", "961000"].join("")), false);
  const intlDrama = phoneDigitRuns(`+44 ${["1632", "960123"].join(" ")}`);
  assert.equal(intlDrama.length, 1);
  assert.equal(isFictionalPhone(intlDrama[0]), true);
  assert.equal(isFictionalPhone(["07700900", "123"].join("")), true);
  assert.equal(isFictionalPhone(["447700900", "123"].join("")), true);
  assert.equal(isFictionalPhone(area), false);
  assert.equal(isFictionalPhone(line), false);
  assert.equal(isFictionalPhone(other), false);

  function assertJoinedRunRejected(label, text) {
    const runs = phoneDigitRuns(text);
    assert.equal(runs.length, 1, label);
    assert.equal(isFictionalPhone(runs[0]), false, label);
  }
  assertJoinedRunRejected("packed", `Call ${exchange}${other}`);
  assertJoinedRunRejected("reversed", `Call ${other}${exchange}`);
  assertJoinedRunRejected("space", `Call ${exchange} ${other}`);
  assertJoinedRunRejected("dash", `Call ${exchange}-${other}`);
  assertJoinedRunRejected("word", `Call${exchange}${other}now`);
});

test("issue #23: pipe, colon, tilde, middle dot, and bullet separate digits", () => {
  for (const sep of ["|", ":", "~", "\u00B7", "\u2022", " | ", "\uFF5C"]) assertHit(us(sep));
});

test("issue #23: O, o, l, and I inside a digit run count as digits", () => {
  assertHit(us("-").replace("0123", "O123"));
  assertHit(us("-").replace("0123", "o123"));
  assertHit(us("-").replace("0123", "0l23"));
  assertHit(us("-").replace("0123", "0I23"));
  assertClean("Python3, i18n, log4j, and l10n shipped.");
});

test("issue #23: vanity numbers and spelled digits fail", () => {
  const word = ["FLOW", "ERS"].join("");
  assertHit(["1", "800", word].join("-"));
  assertHit(["1", "800", word].join(" "));
  assertHit(["800", word].join(" "));
  assertHit(["1", "800", "GOT", "JUNK"].join("-"));
  const words = ["five", "five", "five", "five", "five", "five", "zero", "one", "two", "three"];
  assertHit(words.join(" "));
  assertHit(words.join(""));
  assertHit(`one ${["555", "555", "012"].join(" ")}`);
  assertClean(words.slice(0, 9).join(" "));
  assertClean("HTTP 500 INTERNAL SERVER ERROR");
  assertClean(["123", "abcdef0"].join(""));
});

test("issue #23: UUID and date shapes are kept only when valid", () => {
  assertHit(["55555501", "2312", "3412", "3412", "3412" + "34123412"].join("-"));
  assertHit(`${["5555", "55", "01"].join("-")} 23`);
  assertHit(`${["2023", "02", "29"].join("-")} 1234`);
  assertClean(["550e8400", "e29b", "41d4", "a716", "4466" + "55440000"].join("-"));
  assertClean(["00000000", "0000", "0000", "0000", "0000" + "00000000"].join("-"));
  assertClean(`${["2024", "02", "29"].join("-")}T23:59:59Z`);
});

test("issue #23: year list and ISBN are allowlisted, not special cased", () => {
  const years = `from ${["2019", "2020", "2021"].join(" ")}`;
  const isbn = ["978", "3", "16", "148410", "0"].join("-");
  assertHit(years);
  assertHit(isbn);
  const parsed = parseAllowlist(fs.readFileSync(path.join(root, "scripts/phone-scan-allowlist.txt"), "utf8"));
  assert.deepEqual(parsed.errors, []);
  const tokens = allowTokens(parsed, "README.md");
  assert.deepEqual(findPhoneHits(years, tokens), []);
  assert.deepEqual(findPhoneHits(isbn, tokens), []);
  assert.equal(findPhoneHits(us(":"), tokens).length, 1);
});

function fixtureFiles(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...fixtureFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

test("fixture phone numbers stay in the fictional range", () => {
  const files = fixtureFiles(fixtures);
  assert.ok(files.length > 0);
  for (const file of files) {
    const text = readScanText(file);
    if (text === null) continue;
    for (const digits of phoneDigitRuns(text)) {
      assert.equal(isFictionalPhone(digits), true, path.relative(root, file));
    }
  }
});

test("private pdf names are ignored and the public pdf is not", () => {
  function ignorePattern(rel) {
    const result = spawnSync("git", ["check-ignore", "-v", "--no-index", "--", rel], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.status !== 0) return "";
    const matched = result.stdout.match(/:\d+:(.*)\t/);
    return matched ? matched[1] : "";
  }
  assert.equal(ignorePattern("mcp-server/x/a.PDF").startsWith("!"), false);
  assert.notEqual(ignorePattern("mcp-server/x/a.PDF"), "");
  assert.equal(ignorePattern("Jay_RESUME.pdf").startsWith("!"), false);
  assert.notEqual(ignorePattern("Jay_RESUME.pdf"), "");
  assert.equal(ignorePattern("frontend/public/Jay-Singh-Resume-Oct-2026.pdf").startsWith("!"), true);
});
