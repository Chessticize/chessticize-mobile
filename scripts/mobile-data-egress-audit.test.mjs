import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ALLOWLISTED_PUBLIC_GAME_IMPORT_CLIENT_PATH,
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

test("mobile data-egress audit rejects network primitives in application entrypoints and native runtime sources", () => {
  const repoRoot = buildAuditFixture();
  writeFixtureFile(
    repoRoot,
    "apps/mobile/index.js",
    "export function uploadFromEntrypoint() { return fetch('https://example.invalid'); }\n"
  );
  writeFixtureFile(
    repoRoot,
    "apps/mobile/android/app/src/main/java/com/chessticize/mobile/GameplayUpload.kt",
    "package com.chessticize.mobile\nimport java.net.HttpURLConnection\n"
  );
  writeFixtureFile(
    repoRoot,
    "apps/mobile/ios/StockfishEngine/Native/NativeStockfishEngine.mm",
    "void uploadFromEngine() { NSURLSession *session = [NSURLSession sharedSession]; }\n"
  );

  const result = auditMobileDataEgress({ repoRoot });

  assert.equal(result.status, "fail");
  for (const expectedPath of [
    "apps/mobile/index.js",
    "apps/mobile/android/app/src/main/java/com/chessticize/mobile/GameplayUpload.kt",
    "apps/mobile/ios/StockfishEngine/Native/NativeStockfishEngine.mm"
  ]) {
    assert.ok(
      result.findings.some((finding) =>
        finding.path === expectedPath && finding.kind === "network-primitive"
      ),
      `Expected a network-primitive finding for ${expectedPath}: ${JSON.stringify(result.findings, null, 2)}`
    );
  }
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

test("mobile data-egress audit deliberately excludes vendor, build, generated, and test-only sources", () => {
  const repoRoot = buildAuditFixture();
  const excludedSources = [
    "apps/mobile/native/stockfish/Stockfish/src/vendor-transport.cpp",
    "apps/mobile/ios/build/GeneratedTransport.mm",
    "apps/mobile/src/generated/transport.ts",
    "apps/mobile/__tests__/transport.test.ts"
  ];
  for (const path of excludedSources) {
    writeFixtureFile(repoRoot, path, "export function excludedTransport() { return fetch('https://example.invalid'); }\n");
  }

  const result = auditMobileDataEgress({ repoRoot });

  assert.equal(result.status, "pass", JSON.stringify(result.findings, null, 2));
  assert.deepEqual(result.findings, []);
});

test("required Core CI runs the tooling regressions and live data-egress audit", () => {
  const repoRoot = join(import.meta.dirname, "..");
  const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const workflow = readFileSync(join(repoRoot, ".github/workflows/core.yml"), "utf8");

  assert.equal(
    packageJson.scripts["test:tooling"],
    "node --test scripts/*.test.mjs && pnpm mobile:data-egress-audit"
  );
  assert.match(workflow, /- name: Tooling and audit regressions\s+run: pnpm test:tooling/u);
  assert.match(workflow, /- "scripts\/\*\*"/u);
  assert.match(workflow, /- "apps\/mobile\/\*\*"/u);
});

test("mobile data-egress audit passes on the live repository with the narrow allowlisted game import client", () => {
  const repoRoot = join(import.meta.dirname, "..");
  const result = auditMobileDataEgress({ repoRoot });

  assert.equal(result.status, "pass", JSON.stringify(result.findings, null, 2));
  assert.deepEqual(result.findings, []);
});

test("mobile data-egress audit allows fetch only in publicGameImportClient.ts and still rejects fetch elsewhere", () => {
  const repoRoot = buildAuditFixture();
  const realClientSource = readFileSync(
    join(import.meta.dirname, "..", ALLOWLISTED_PUBLIC_GAME_IMPORT_CLIENT_PATH),
    "utf8"
  );
  writeFixtureFile(repoRoot, ALLOWLISTED_PUBLIC_GAME_IMPORT_CLIENT_PATH, realClientSource);

  const passing = auditMobileDataEgress({ repoRoot });
  assert.equal(passing.status, "pass", JSON.stringify(passing.findings, null, 2));

  writeFixtureFile(
    repoRoot,
    "apps/mobile/src/platform/otherClient.ts",
    "export async function sneaky() { return fetch('https://api.chess.com/pub/player/x/games/archives'); }\n"
  );

  const failing = auditMobileDataEgress({ repoRoot });
  assert.equal(failing.status, "fail");
  assert.ok(failing.findings.some((finding) =>
    finding.path === "apps/mobile/src/platform/otherClient.ts" && finding.kind === "network-primitive"
  ));
});

test("mobile data-egress audit fails if publicGameImportClient.ts weakens its host allowlist, credentials omit, or uses another transport", () => {
  const realClientSource = readFileSync(
    join(import.meta.dirname, "..", ALLOWLISTED_PUBLIC_GAME_IMPORT_CLIENT_PATH),
    "utf8"
  );

  const tamperedVariants = [
    {
      name: "removes api.chess.com from allowlist",
      source: realClientSource.replaceAll("api.chess.com", "example.invalid"),
      expectedKind: "egress-allowlist"
    },
    {
      name: "removes lichess.org from allowlist",
      source: realClientSource.replaceAll("lichess.org", "example.invalid"),
      expectedKind: "egress-allowlist"
    },
    {
      name: "adds an unapproved host to allowlist",
      source: realClientSource.replace(
        '{ hostname: "lichess.org", pathPrefix: "/api/" }',
        '{ hostname: "lichess.org", pathPrefix: "/api/" }, { hostname: "telemetry.example", pathPrefix: "/api/" }'
      ),
      expectedKind: "egress-allowlist"
    },
    {
      name: "removes credentials omit",
      source: realClientSource.replace('credentials: "omit"', 'credentials: "include"'),
      expectedKind: "egress-allowlist"
    },
    {
      name: "adds non-fetch network transport inside allowlisted file",
      source: `${realClientSource}\nexport function badSocket() { return new WebSocket("wss://example.invalid"); }\n`,
      expectedKind: "network-primitive"
    }
  ];

  for (const variant of tamperedVariants) {
    const repoRoot = buildAuditFixture();
    writeFixtureFile(repoRoot, ALLOWLISTED_PUBLIC_GAME_IMPORT_CLIENT_PATH, variant.source);
    const result = auditMobileDataEgress({ repoRoot });

    assert.equal(result.status, "fail", `Expected audit failure when client ${variant.name}`);
    assert.ok(
      result.findings.some(
        (finding) =>
          finding.path === ALLOWLISTED_PUBLIC_GAME_IMPORT_CLIENT_PATH &&
          finding.kind === variant.expectedKind
      ),
      `Expected ${variant.expectedKind} finding when client ${variant.name}: ${JSON.stringify(result.findings, null, 2)}`
    );
  }
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
