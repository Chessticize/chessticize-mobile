import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const scenes = [
  "app-store-01-practice-home",
  "app-store-02-standard-sprint",
  "app-store-03-arrow-duel",
  "app-store-04-sprint-results",
  "app-store-05-mistake-review-analysis",
  "app-store-06-history"
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
    { id: "iphone-6.1", width: 1170, height: 2532 }
  ];

  for (const group of groups) {
    const groupDir = join(root, group.id);
    mkdirSync(groupDir, { recursive: true });
    for (const scene of scenes) {
      writeFileSync(join(groupDir, `${scene}.png`), pngFixture(group.width, group.height));
    }
  }
}

function runEvidence(args: string[]) {
  return spawnSync(
    process.execPath,
    ["scripts/app-store-testflight-evidence.mjs", "--json", ...args],
    {
      cwd: resolve("."),
      encoding: "utf8"
    }
  );
}

test("TestFlight evidence CLI writes validator outputs and a release summary", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "chessticize-testflight-evidence-"));
  const output = join(tempDir, "evidence");
  const screenshots = join(tempDir, "screenshots");
  try {
    writeScreenshotSet(screenshots);
    const result = runEvidence([
      "--allow-dirty",
      "--output",
      output,
      "--screenshot-root",
      screenshots
    ]);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout);

    assert.equal(summary.schema, "chessticize-mobile.testflight-evidence.v1");
    assert.equal(summary.status, "pass");
    assert.equal(summary.outputDir, output);
    assert.equal(summary.screenshotAuditIncluded, true);
    assert.equal(summary.screenshotRoot, screenshots);
    assert.equal(summary.screenshotRootExists, true);
    assert.equal(summary.commands.length, 4);
    assert.deepEqual(
      summary.commands.map((entry: { name: string }) => entry.name),
      ["preflight", "third-party-audit", "release-manifest", "screenshot-audit"]
    );
    assert.ok(summary.manualGates.some((gate: string) => gate.includes("physical iPhone")));

    const persisted = JSON.parse(readFileSync(join(output, "summary.json"), "utf8"));
    assert.equal(persisted.status, "pass");
    assert.match(readFileSync(join(output, "README.md"), "utf8"), /automatable release evidence only/);
    assert.equal(JSON.parse(readFileSync(join(output, "preflight.json"), "utf8")).status, "pass");
    assert.equal(JSON.parse(readFileSync(join(output, "third-party-audit.json"), "utf8")).status, "pass");
    assert.equal(JSON.parse(readFileSync(join(output, "screenshot-audit.json"), "utf8")).status, "pass");
    assert.equal(
      JSON.parse(readFileSync(join(output, "release-manifest.json"), "utf8")).releaseTagSuggestion,
      "ios-v1.0.0-build-1"
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
    writeFileSync(
      join(screenshots, "iphone-6.1", "app-store-02-standard-sprint.png"),
      pngFixture(1000, 1000)
    );

    const result = runEvidence([
      "--allow-dirty",
      "--output",
      output,
      "--screenshot-root",
      screenshots
    ]);

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
