import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function writeFixture(payload: unknown) {
  const tempDir = mkdtempSync(join(tmpdir(), "chessticize-signing-readiness-"));
  const fixture = join(tempDir, "fixture.json");
  writeFileSync(fixture, `${JSON.stringify(payload, null, 2)}\n`);
  return { tempDir, fixture };
}

function runSigningReadiness(fixture: string) {
  return spawnSync(
    process.execPath,
    ["scripts/app-store-signing-readiness.mjs", "--json"],
    {
      cwd: resolve("."),
      encoding: "utf8",
      env: {
        ...process.env,
        CHESSTICIZE_SIGNING_READINESS_FIXTURE: fixture
      }
    }
  );
}

test("App Store signing readiness passes with a team, Xcode, and distribution identity", () => {
  const { tempDir, fixture } = writeFixture({
    teamId: "ABCDE12345",
    xcodebuild: {
      status: 0,
      stdout: "Xcode 16.4\nBuild version 16F6\n",
      stderr: ""
    },
    security: {
      status: 0,
      stdout: '  1) ABCDEF123456 "Apple Distribution: Example, Inc. (ABCDE12345)"\n     1 valid identities found\n',
      stderr: ""
    }
  });

  try {
    const result = runSigningReadiness(fixture);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);

    assert.equal(payload.schema, "chessticize-mobile.app-store-signing-readiness.v1");
    assert.equal(payload.status, "pass");
    assert.equal(payload.probeSource, "fixture");
    assert.equal(payload.probes.team, "valid");
    assert.equal(payload.probes.xcodeVersion, "Xcode 16.4");
    assert.equal(payload.probes.validSigningIdentities, 1);
    assert.equal(payload.probes.appleDistributionIdentities, 1);
    assert.equal(payload.summary.failed, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("App Store signing readiness fails when signing team and identities are missing", () => {
  const { tempDir, fixture } = writeFixture({
    teamId: "",
    xcodebuild: {
      status: 0,
      stdout: "Xcode 16.4\nBuild version 16F6\n",
      stderr: ""
    },
    security: {
      status: 0,
      stdout: "     0 valid identities found\n",
      stderr: ""
    }
  });

  try {
    const result = runSigningReadiness(fixture);
    assert.notEqual(result.status, 0);
    const payload = JSON.parse(result.stdout);

    assert.equal(payload.status, "fail");
    assert.equal(payload.probes.team, "missing");
    assert.equal(payload.probes.validSigningIdentities, 0);
    assert.equal(payload.probes.appleDistributionIdentities, 0);
    assert.ok(
      payload.checks.some(
        (entry: { name: string; status: string }) =>
          entry.name === "Apple development team is configured" && entry.status === "fail"
      )
    );
    assert.ok(
      payload.checks.some(
        (entry: { name: string; status: string }) =>
          entry.name === "Apple distribution identity is available" && entry.status === "fail"
      )
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
