#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const defaultEvidenceRoot = "scratch/testflight-qa";

function parseArgs(argv) {
  const options = {
    allowDirty: false,
    json: false,
    output: null,
    screenshotRoot: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--allow-dirty") {
      options.allowDirty = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--output") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--output requires an evidence directory path");
      }
      options.output = value;
      index += 1;
    } else if (arg === "--screenshot-root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--screenshot-root requires a screenshot directory path");
      }
      options.screenshotRoot = value;
      index += 1;
    } else if (arg === "--") {
      continue;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function resolvePath(path) {
  return isAbsolute(path) ? path : resolve(repoRoot, path);
}

function evidenceDirectory(output) {
  if (output) {
    return resolvePath(output);
  }
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/u, "Z");
  return resolvePath(join(defaultEvidenceRoot, stamp));
}

function runNodeScript(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  return {
    script,
    args,
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function parseJsonOutput(command) {
  try {
    return JSON.parse(command.stdout || "{}");
  } catch {
    return null;
  }
}

function writeJson(path, payload) {
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeCommandArtifacts(outputDir, name, command) {
  const payload = parseJsonOutput(command);
  writeJson(join(outputDir, `${name}.command.json`), command);
  if (payload) {
    writeJson(join(outputDir, `${name}.json`), payload);
  } else {
    writeFileSync(join(outputDir, `${name}.stdout.txt`), command.stdout);
  }
  if (command.stderr) {
    writeFileSync(join(outputDir, `${name}.stderr.txt`), command.stderr);
  }
  return payload;
}

function commandSummary(name, command, payload) {
  return {
    name,
    status: command.status === 0 && payload?.status !== "fail" ? "pass" : "fail",
    exitCode: command.status,
    payloadStatus: payload?.status ?? null,
    summary: payload?.summary ?? null
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputDir = evidenceDirectory(options.output);
  mkdirSync(outputDir, { recursive: true });

  const commands = [
    {
      name: "preflight",
      script: "scripts/app-store-preflight.mjs",
      args: ["--json"]
    },
    {
      name: "third-party-audit",
      script: "scripts/app-store-third-party-audit.mjs",
      args: ["--json"]
    },
    {
      name: "release-manifest",
      script: "scripts/app-store-release-manifest.mjs",
      args: options.allowDirty ? ["--allow-dirty"] : []
    }
  ];

  if (options.screenshotRoot) {
    commands.push({
      name: "screenshot-audit",
      script: "scripts/app-store-screenshot-audit.mjs",
      args: ["--json", "--root", options.screenshotRoot]
    });
  }

  const entries = [];
  for (const commandSpec of commands) {
    const command = runNodeScript(commandSpec.script, commandSpec.args);
    const payload = writeCommandArtifacts(outputDir, commandSpec.name, command);
    entries.push({
      ...commandSummary(commandSpec.name, command, payload),
      artifact: `${commandSpec.name}.json`,
      commandArtifact: `${commandSpec.name}.command.json`
    });
  }

  const failed = entries.filter((entry) => entry.status === "fail");
  const releaseManifest = parseJsonOutput(
    runNodeScript("scripts/app-store-release-manifest.mjs", ["--allow-dirty"])
  );
  const dirty = releaseManifest?.dirty ?? null;
  const screenshotAuditIncluded = Boolean(options.screenshotRoot);
  const screenshotRootExists = options.screenshotRoot ? existsSync(resolvePath(options.screenshotRoot)) : false;

  const manualGates = [
    "Upload the build to App Store Connect.",
    "Distribute the uploaded build to the Internal 1.0 QA TestFlight group.",
    "Install the TestFlight build on a physical iPhone.",
    "Run the physical-device checklist in docs/TESTFLIGHT_QA.md.",
    "Fill docs/TESTFLIGHT_QA.md with exact build, device, tester, result, and evidence location."
  ];

  const summary = {
    schema: "chessticize-mobile.testflight-evidence.v1",
    status: failed.length === 0 ? "pass" : "fail",
    outputDir,
    generatedAt: new Date().toISOString(),
    allowDirty: options.allowDirty,
    dirty,
    screenshotAuditIncluded,
    screenshotRoot: options.screenshotRoot ? resolvePath(options.screenshotRoot) : null,
    screenshotRootExists,
    releaseReady: failed.length === 0 && dirty === false && screenshotAuditIncluded,
    commands: entries,
    manualGates
  };

  writeJson(join(outputDir, "summary.json"), summary);
  writeFileSync(
    join(outputDir, "README.md"),
    [
      "# TestFlight Evidence Bundle",
      "",
      `Generated: ${summary.generatedAt}`,
      `Status: ${summary.status}`,
      `Release-ready local evidence: ${summary.releaseReady ? "yes" : "no"}`,
      "",
      "This bundle contains automatable release evidence only. It does not prove",
      "the App Store Connect upload, TestFlight distribution, or physical-device",
      "QA pass until those manual gates are completed and recorded in",
      "`docs/TESTFLIGHT_QA.md`.",
      "",
      "## Files",
      "",
      "- `summary.json` - command summary and remaining manual gates.",
      "- `preflight.json` - App Store preflight result.",
      "- `third-party-audit.json` - release notice audit result.",
      "- `release-manifest.json` - exact source manifest for the candidate build.",
      screenshotAuditIncluded
        ? "- `screenshot-audit.json` - final screenshot export audit result."
        : "- Screenshot audit was not included; pass `--screenshot-root` after final export.",
      ""
    ].join("\n")
  );

  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    console.log("TestFlight evidence bundle");
    console.log(`Output: ${outputDir}`);
    for (const entry of entries) {
      console.log(`${entry.status === "pass" ? "PASS" : "FAIL"} ${entry.name}`);
    }
    console.log(`Release-ready local evidence: ${summary.releaseReady ? "yes" : "no"}`);
    console.log("Manual gates still required: App Store Connect upload, TestFlight distribution, physical-device QA.");
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
