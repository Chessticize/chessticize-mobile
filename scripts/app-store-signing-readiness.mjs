#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const teamPattern = /^[A-Z0-9]{10}$/u;
const outputJson = process.argv.includes("--json");
const allowUnready = process.argv.includes("--allow-unready");

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8"
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function loadFixture() {
  const fixturePath = process.env.CHESSTICIZE_SIGNING_READINESS_FIXTURE;
  if (!fixturePath) {
    return null;
  }
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}

function identitySummary(output) {
  const identityNames = Array.from(
    output.matchAll(/^\s*\d+\)\s+[0-9A-Fa-f]+\s+"([^"]+)"/gmu),
    (match) => match[1]
  );
  const explicitValidCount = output.match(/(\d+)\s+valid identities found/u);
  const validIdentities = explicitValidCount ? Number(explicitValidCount[1]) : identityNames.length;
  const distributionIdentities = identityNames.filter((name) =>
    /\b(?:Apple|iPhone) Distribution:/u.test(name)
  ).length;

  return {
    validIdentities,
    distributionIdentities
  };
}

function check(name, passed, detail) {
  return {
    name,
    status: passed ? "pass" : "fail",
    detail
  };
}

function buildResult() {
  const fixture = loadFixture();
  const probeSource = fixture ? "fixture" : "local";
  const teamId = fixture?.teamId ?? process.env.APPLE_DEVELOPMENT_TEAM ?? "";
  const xcodebuild = fixture?.xcodebuild ?? run("xcodebuild", ["-version"]);
  const security = fixture?.security ?? run("security", ["find-identity", "-v", "-p", "codesigning"]);
  const identities = identitySummary(security.stdout);
  const xcodeVersion = xcodebuild.stdout.split(/\r?\n/u).find(Boolean) ?? null;
  const teamState = teamId ? (teamPattern.test(teamId) ? "valid" : "invalid") : "missing";

  const checks = [
    check(
      "Apple development team is configured",
      teamState === "valid",
      teamState === "valid"
        ? "APPLE_DEVELOPMENT_TEAM is set to a 10-character Team ID."
        : "Set APPLE_DEVELOPMENT_TEAM to the 10-character Apple Developer Team ID before archiving."
    ),
    check(
      "Xcode command line tools are available",
      xcodebuild.status === 0 && xcodebuild.stdout.includes("Xcode"),
      xcodebuild.status === 0
        ? `xcodebuild reported ${xcodeVersion ?? "an unknown version"}.`
        : xcodebuild.stderr || xcodebuild.stdout || "xcodebuild did not run successfully."
    ),
    check(
      "Code signing identities are available",
      security.status === 0 && identities.validIdentities > 0,
      `${identities.validIdentities} valid code-signing identities found.`
    ),
    check(
      "Apple distribution identity is available",
      security.status === 0 && identities.distributionIdentities > 0,
      `${identities.distributionIdentities} Apple distribution identities found.`
    )
  ];
  const failed = checks.filter((entry) => entry.status === "fail");

  return {
    schema: "chessticize-mobile.app-store-signing-readiness.v1",
    status: failed.length === 0 ? "pass" : "fail",
    probeSource,
    probes: {
      team: teamState,
      xcodeVersion,
      validSigningIdentities: identities.validIdentities,
      appleDistributionIdentities: identities.distributionIdentities
    },
    checks,
    summary: {
      passed: checks.length - failed.length,
      failed: failed.length
    },
    nextStep:
      failed.length === 0
        ? "Run the signed archive command in docs/APP_STORE_UPLOAD.md."
        : "Fix the failed signing checks, then rerun pnpm app-store:signing-readiness."
  };
}

try {
  const result = buildResult();
  if (outputJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    console.log("App Store signing readiness");
    for (const entry of result.checks) {
      console.log(`${entry.status === "pass" ? "PASS" : "FAIL"} ${entry.name}`);
      if (entry.status === "fail") {
        console.log(`  ${entry.detail}`);
      }
    }
    console.log("");
    console.log(`Summary: ${result.summary.passed} passed, ${result.summary.failed} failed.`);
    console.log(result.nextStep);
  }

  if (result.status === "fail" && !allowUnready) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
