import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const scenes = [
  "app-store-01-practice-tab",
  "app-store-02-review-tab",
  "app-store-03-history-tab",
  "app-store-04-settings-tab",
  "app-store-05-standard-sprint",
  "app-store-06-arrow-duel"
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
    { id: "iphone-6.9", width: 1290, height: 2796 },
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

function runAudit(root: string) {
  return spawnSync(
    process.execPath,
    ["scripts/app-store-screenshot-audit.mjs", "--json", "--root", root],
    {
      cwd: resolve("."),
      encoding: "utf8"
    }
  );
}

test("App Store screenshot audit accepts complete iPhone and iPad portrait sets", () => {
  const root = mkdtempSync(join(tmpdir(), "chessticize-screenshots-"));
  try {
    writeScreenshotSet(root);
    const result = runAudit(root);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);

    assert.equal(payload.status, "pass");
    assert.equal(payload.summary.failed, 0);
    assert.equal(payload.expectedScenes.length, 6);
    assert.equal(payload.groups.length, 3);
    assert.deepEqual(
      payload.groups.map((group: { group: string }) => group.group),
      ["iphone-6.9", "iphone-6.1", "ipad-13"]
    );
    assert.equal(payload.groups[0].images.length, 6);
    assert.equal(payload.groups[1].images.length, 6);
    assert.equal(payload.groups[2].images.length, 6);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("App Store screenshot audit rejects screenshots with unsupported dimensions", () => {
  const root = mkdtempSync(join(tmpdir(), "chessticize-screenshots-"));
  try {
    writeScreenshotSet(root);
    writeFileSync(
      join(root, "iphone-6.1", "app-store-06-arrow-duel.png"),
      pngFixture(1000, 1000)
    );

    const result = runAudit(root);
    assert.notEqual(result.status, 0);
    const payload = JSON.parse(result.stdout);

    assert.equal(payload.status, "fail");
    const dimensionCheck = payload.checks.find(
      (entry: { name: string }) => entry.name === "6.1-inch iPhone screenshots use accepted portrait dimensions"
    );
    assert.equal(dimensionCheck.status, "fail");
    assert.match(dimensionCheck.detail, /app-store-06-arrow-duel\.png: 1000x1000/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
