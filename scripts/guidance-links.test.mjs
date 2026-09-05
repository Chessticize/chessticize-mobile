import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { validateGuidanceLinks } from "./lib/guidance-links.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "guidance-links-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "docs"));
  writeFileSync(path.join(root, "docs", "policy.md"), "# Policy\n");
  return root;
}

test("routing prose can change while links still resolve relative to each document", t => {
  const root = fixture(t);
  writeFileSync(path.join(root, "AGENTS.md"), "[Choose tests](docs/policy.md#policy)\n");
  writeFileSync(path.join(root, "docs", "guide.md"), "[Home](../AGENTS.md)\n[Web](https://example.com)\n[Here](#local)\n");
  assert.deepEqual(validateGuidanceLinks(root, ["AGENTS.md", "docs/guide.md"]), []);
  writeFileSync(path.join(root, "AGENTS.md"), "Different wording: [Validation](docs/policy.md).\n");
  assert.deepEqual(validateGuidanceLinks(root, ["AGENTS.md"]), []);
});

test("a missing policy target reports the referring document and target", t => {
  const root = fixture(t);
  writeFileSync(path.join(root, "AGENTS.md"), "[Tests](docs/missing.md)");
  assert.deepEqual(validateGuidanceLinks(root, ["AGENTS.md"]), [
    "AGENTS.md: missing local link docs/missing.md"
  ]);
});

test("code examples do not introduce live links and encoded file names are supported", t => {
  const root = fixture(t);
  writeFileSync(path.join(root, "docs", "policy notes.md"), "# Notes");
  writeFileSync(path.join(root, "AGENTS.md"), "```md\n[Example](missing.md)\n```\n[Notes](docs/policy%20notes.md)\n");
  assert.deepEqual(validateGuidanceLinks(root, ["AGENTS.md"]), []);
});

test("a missing entry point cannot silently pass", t => {
  const root = fixture(t);
  assert.deepEqual(validateGuidanceLinks(root, ["AGENTS.md"]), ["AGENTS.md: missing guidance document"]);
});
