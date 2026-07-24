import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function runAudit(args: string[] = []) {
  return spawnSync(
    process.execPath,
    ["scripts/app-store-third-party-audit.mjs", "--json", ...args],
    {
      cwd: resolve("."),
      encoding: "utf8"
    }
  );
}

test("third-party audit validates notices against the release lockfile", () => {
  const result = runAudit();

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.status, "pass");
  assert.equal(payload.summary.failed, 0);

  const checkNames = new Set(payload.checks.map((entry: { name: string }) => entry.name));
  assert.ok(checkNames.has("Runtime notice table matches direct runtime dependencies"));
  assert.ok(checkNames.has("Runtime notice versions match pnpm-lock.yaml"));
  assert.ok(checkNames.has("Patched chessboard package is disclosed"));
  assert.ok(checkNames.has("Patched React Native package is disclosed"));
  assert.ok(checkNames.has("Stockfish notice matches bundled source and pod metadata"));
  assert.ok(checkNames.has("Stockfish NNUE files are disclosed and present"));
  assert.ok(checkNames.has("Lichess puzzle data notice matches bundled manifest"));
});

test("third-party audit rejects stale notice versions", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "chessticize-notices-"));
  const tempNoticesPath = join(tempDir, "THIRD_PARTY_NOTICES.md");
  const notices = readFileSync(resolve("THIRD_PARTY_NOTICES.md"), "utf8");
  writeFileSync(
    tempNoticesPath,
    notices.replace("| `chess.js` | `1.4.0` |", "| `chess.js` | `9.9.9` |")
  );

  try {
    const result = runAudit(["--notices", tempNoticesPath]);
    assert.notEqual(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.status, "fail");

    const versionCheck = payload.checks.find(
      (entry: { name: string }) => entry.name === "Runtime notice versions match pnpm-lock.yaml"
    );
    assert.equal(versionCheck.status, "fail");
    assert.match(versionCheck.detail, /chess\.js: notices=9\.9\.9, lock=1\.4\.0/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
