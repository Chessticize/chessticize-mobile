import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const scenes = [
  "app-store-01-practice-tab",
  "app-store-02-review-tab",
  "app-store-03-history-tab",
  "app-store-04-settings-tab",
  "app-store-05-standard-sprint",
  "app-store-06-arrow-duel",
  "app-store-07-custom-setup",
  "app-store-08-review-session"
];

function pngFixture(width: number, height: number) {
  const buffer = Buffer.alloc(33);
  buffer.write("89504e470d0a1a0a", 0, "hex");
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 6;
  buffer[26] = 0;
  buffer[27] = 0;
  buffer[28] = 0;
  return buffer;
}

function writeScreenshotSet(root: string) {
  const groups = [
    { id: "iphone-6.9", width: 1320, height: 2868 },
    { id: "iphone-6.1", width: 1170, height: 2532 },
    { id: "ipad-13", width: 2064, height: 2752 }
  ];

  for (const group of groups) {
    const groupDir = join(root, group.id);
    mkdirSync(groupDir, { recursive: true });
    for (const scene of scenes) {
      writeFileSync(join(groupDir, `${scene}.png`), pngFixture(group.width, group.height));
    }
  }
}

function writeSigningFixture(root: string) {
  const fixture = join(root, "signing-readiness.json");
  writeFileSync(
    fixture,
    `${JSON.stringify(
      {
        teamId: "ABCDE12345",
        xcodebuild: {
          status: 0,
          stdout: "Xcode 16.4\nBuild version 16F6\n",
          stderr: ""
        },
        security: {
          status: 0,
          stdout:
            '  1) ABCDEF123456 "Apple Distribution: Example, Inc. (ABCDE12345)"\n     1 valid identities found\n',
          stderr: ""
        }
      },
      null,
      2
    )}\n`
  );
  return fixture;
}

function runEvidence(args: string[], signingFixture: string) {
  return spawnSync(
    process.execPath,
    ["scripts/app-store-testflight-evidence.mjs", "--json", ...args],
    {
      cwd: resolve("."),
      encoding: "utf8",
      env: {
        ...process.env,
        CHESSTICIZE_SIGNING_READINESS_FIXTURE: signingFixture
      }
    }
  );
}

test("TestFlight evidence CLI writes validator outputs and a release summary", (t) => {
  const puzzleManifest = JSON.parse(readFileSync(resolve("fixtures/puzzles/bundled-core-pack.manifest.json"), "utf8")) as {
    format?: "json" | "sqlite";
  };
  if (puzzleManifest.format === "sqlite" && !existsSync(resolve("fixtures/puzzles/bundled-core-pack.sqlite"))) {
    t.skip("core pack artifact not fetched; run pnpm fetch:core-pack before generating TestFlight evidence");
    return;
  }
  const tempDir = mkdtempSync(join(tmpdir(), "chessticize-testflight-evidence-"));
  const output = join(tempDir, "evidence");
  const screenshots = join(tempDir, "screenshots");
  try {
    writeScreenshotSet(screenshots);
    const signingFixture = writeSigningFixture(tempDir);
    const result = runEvidence([
      "--allow-dirty",
      "--output",
      output,
      "--screenshot-root",
      screenshots
    ], signingFixture);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout);

    assert.equal(summary.schema, "chessticize-mobile.testflight-evidence.v1");
    assert.equal(summary.status, "pass");
    assert.equal(summary.outputDir, output);
    assert.equal(summary.screenshotAuditIncluded, true);
    assert.equal(summary.screenshotRoot, screenshots);
    assert.equal(summary.screenshotRootExists, true);
    assert.equal(summary.commands.length, 5);
    assert.deepEqual(
      summary.commands.map((entry: { name: string }) => entry.name),
      ["preflight", "third-party-audit", "signing-readiness", "release-manifest", "screenshot-audit"]
    );
    assert.ok(summary.manualGates.some((gate: string) => gate.includes("physical iPhone")));

    const persisted = JSON.parse(readFileSync(join(output, "summary.json"), "utf8"));
    assert.equal(persisted.status, "pass");
    assert.match(readFileSync(join(output, "README.md"), "utf8"), /automatable release evidence only/);
    assert.equal(JSON.parse(readFileSync(join(output, "preflight.json"), "utf8")).status, "pass");
    assert.equal(JSON.parse(readFileSync(join(output, "third-party-audit.json"), "utf8")).status, "pass");
    assert.equal(JSON.parse(readFileSync(join(output, "signing-readiness.json"), "utf8")).status, "pass");
    assert.equal(JSON.parse(readFileSync(join(output, "screenshot-audit.json"), "utf8")).status, "pass");
    assert.equal(
      JSON.parse(readFileSync(join(output, "release-manifest.json"), "utf8")).releaseTagSuggestion,
      "ios-v1.1.0-build-2"
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("TestFlight evidence CLI fails when an included screenshot audit fails", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "chessticize-testflight-evidence-"));
  const output = join(tempDir, "evidence");
  const screenshots = join(tempDir, "screenshots");
  try {
    writeScreenshotSet(screenshots);
    const signingFixture = writeSigningFixture(tempDir);
    writeFileSync(
      join(screenshots, "iphone-6.1", "app-store-05-standard-sprint.png"),
      pngFixture(1000, 1000)
    );

    const result = runEvidence([
      "--allow-dirty",
      "--output",
      output,
      "--screenshot-root",
      screenshots
    ], signingFixture);

    assert.notEqual(result.status, 0);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.status, "fail");
    const screenshotEntry = summary.commands.find(
      (entry: { name: string }) => entry.name === "screenshot-audit"
    );
    assert.equal(screenshotEntry.status, "fail");
    assert.equal(JSON.parse(readFileSync(join(output, "screenshot-audit.json"), "utf8")).status, "fail");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
