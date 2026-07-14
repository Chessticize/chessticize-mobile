import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  APPROVED_RUNTIME_DEPENDENCIES,
  auditMobileDataEgress
} from "./lib/mobile-data-egress-audit.mjs";

test("mobile data-egress audit rejects gameplay network emission", () => {
  const repoRoot = buildAuditFixture();
  writeFixtureFile(
    repoRoot,
    "apps/mobile/src/gameplayUpload.ts",
    "export async function uploadAttempt(attempt) { return fetch('https://example.invalid', { method: 'POST', body: JSON.stringify(attempt) }); }\n"
  );

  const result = auditMobileDataEgress({ repoRoot });

  assert.equal(result.status, "fail");
  assert.ok(result.findings.some((finding) =>
    finding.path === "apps/mobile/src/gameplayUpload.ts" && finding.kind === "network-primitive"
  ));
});

test("mobile data-egress audit rejects unreviewed runtime transports from package and lock state", () => {
  const repoRoot = buildAuditFixture({ extraMobileDependency: "example-network-client" });

  const result = auditMobileDataEgress({ repoRoot });

  assert.equal(result.status, "fail");
  assert.ok(result.findings.some((finding) =>
    finding.path === "apps/mobile/package.json" && finding.kind === "runtime-dependency"
  ));
  assert.ok(result.findings.some((finding) =>
    finding.path === "pnpm-lock.yaml" && finding.kind === "runtime-dependency"
  ));
});

test("mobile data-egress audit rejects native network primitives", () => {
  const repoRoot = buildAuditFixture();
  writeFixtureFile(
    repoRoot,
    "apps/mobile/android/app/src/main/java/com/chessticize/mobile/GameplayUpload.kt",
    "package com.chessticize.mobile\nimport java.net.HttpURLConnection\n"
  );

  const result = auditMobileDataEgress({ repoRoot });

  assert.equal(result.status, "fail");
  assert.ok(result.findings.some((finding) =>
    finding.path.endsWith("GameplayUpload.kt") && finding.kind === "network-primitive"
  ));
});

test("mobile data-egress audit accepts reviewed dependencies and local-only gameplay code", () => {
  const repoRoot = buildAuditFixture();
  writeFixtureFile(
    repoRoot,
    "apps/mobile/src/practice.ts",
    "export function recordAttempt(store, attempt) { store.recordAttempt(attempt); }\n"
  );

  const result = auditMobileDataEgress({ repoRoot });

  assert.equal(result.status, "pass", JSON.stringify(result.findings, null, 2));
  assert.deepEqual(result.findings, []);
});

function buildAuditFixture({ extraMobileDependency } = {}) {
  const repoRoot = mkdtempSync(join(tmpdir(), "chessticize-egress-audit-"));
  const rootDependencies = dependencyRecord(APPROVED_RUNTIME_DEPENDENCIES["."]);
  const mobileDependencies = dependencyRecord(APPROVED_RUNTIME_DEPENDENCIES["apps/mobile"]);
  if (extraMobileDependency) {
    mobileDependencies[extraMobileDependency] = "1.0.0";
  }

  writeFixtureFile(repoRoot, "package.json", `${JSON.stringify({ dependencies: rootDependencies })}\n`);
  writeFixtureFile(
    repoRoot,
    "apps/mobile/package.json",
    `${JSON.stringify({ dependencies: mobileDependencies })}\n`
  );
  writeFixtureFile(
    repoRoot,
    "pnpm-lock.yaml",
    lockfileFor({ rootDependencies, mobileDependencies })
  );
  return repoRoot;
}

function dependencyRecord(names) {
  return Object.fromEntries(names.map((name) => [name, "1.0.0"]));
}

function lockfileFor({ rootDependencies, mobileDependencies }) {
  return [
    "lockfileVersion: '9.0'",
    "",
    "importers:",
    "",
    importerBlock(".", rootDependencies),
    "",
    importerBlock("apps/mobile", mobileDependencies),
    ""
  ].join("\n");
}

function importerBlock(name, dependencies) {
  return [
    `  ${name}:`,
    "    dependencies:",
    ...Object.keys(dependencies).sort().flatMap((dependency) => [
      `      '${dependency}':`,
      "        specifier: 1.0.0",
      "        version: 1.0.0"
    ])
  ].join("\n");
}

function writeFixtureFile(repoRoot, relativePath, contents) {
  const path = join(repoRoot, relativePath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, contents);
}
