#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStockfishArtifacts } from "./lib/stockfish-artifacts.mjs";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function parseArgs(argv) {
  const options = {
    json: false,
    noticesPath: "THIRD_PARTY_NOTICES.md"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--notices") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--notices requires a path");
      }
      options.noticesPath = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function repoPath(path) {
  return join(repoRoot, path);
}

function readText(path) {
  return readFileSync(repoPath(path), "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function fileExists(path) {
  return existsSync(repoPath(path));
}

function readMaybeOverride(path) {
  const resolved = isAbsolute(path) ? path : resolve(repoRoot, path);
  return readFileSync(resolved, "utf8");
}

function stripYamlKey(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function baseVersion(rawVersion) {
  return rawVersion.split("(")[0].trim();
}

function extractImporterDependencies(lockfile, importerName) {
  const lines = lockfile.split(/\r?\n/);
  const importerHeader = `  ${importerName}:`;
  const dependencies = new Map();
  let inImporter = false;
  let inDependencies = false;
  let currentDependency = null;

  for (const line of lines) {
    if (!inImporter) {
      if (line === importerHeader) {
        inImporter = true;
      }
      continue;
    }

    if (/^  \S.*:\s*$/.test(line)) {
      break;
    }

    if (line === "    dependencies:") {
      inDependencies = true;
      continue;
    }

    if (inDependencies && /^    \S/.test(line)) {
      break;
    }

    if (!inDependencies) {
      continue;
    }

    const dependencyMatch = line.match(/^      (.+):$/);
    if (dependencyMatch) {
      currentDependency = stripYamlKey(dependencyMatch[1]);
      continue;
    }

    const versionMatch = line.match(/^        version: (.+)$/);
    if (versionMatch && currentDependency) {
      dependencies.set(currentDependency, baseVersion(versionMatch[1]));
      currentDependency = null;
    }
  }

  return dependencies;
}

function extractNoticeRows(notices) {
  const rows = new Map();
  const tableRowPattern = /^\| `([^`]+)` \| `([^`]+)` \| ([^|]+) \| ([^|]+) \|$/gm;
  for (const match of notices.matchAll(tableRowPattern)) {
    rows.set(match[1], {
      packageName: match[1],
      version: match[2],
      license: match[3].trim(),
      source: match[4].trim()
    });
  }
  return rows;
}

function check(checks, name, passed, detail) {
  checks.push({
    name,
    status: passed ? "pass" : "fail",
    detail
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const notices = readMaybeOverride(options.noticesPath);
  const rootPackage = readJson("package.json");
  const mobilePackage = readJson("apps/mobile/package.json");
  const lockfile = readText("pnpm-lock.yaml");
  const puzzleManifest = readJson("fixtures/puzzles/bundled-core-pack.manifest.json");
  const stockfishArtifacts = loadStockfishArtifacts(repoRoot);
  const stockfishPodspec = readText(stockfishArtifacts.podspecPath);
  const stockfishReadme = readText(stockfishArtifacts.readmePath);
  const noticeRows = extractNoticeRows(notices);
  const lockDependencies = new Map([
    ...extractImporterDependencies(lockfile, "."),
    ...extractImporterDependencies(lockfile, "apps/mobile")
  ]);
  const runtimeDependencies = Array.from(new Set([
    ...Object.keys(rootPackage.dependencies ?? {}),
    ...Object.keys(mobilePackage.dependencies ?? {})
  ])).sort();

  const checks = [];
  const missingNoticeRows = runtimeDependencies.filter((dependency) => !noticeRows.has(dependency));
  const staleNoticeRows = Array.from(noticeRows.keys()).filter((dependency) => !runtimeDependencies.includes(dependency));
  const missingLockEntries = runtimeDependencies.filter((dependency) => !lockDependencies.has(dependency));
  const versionMismatches = runtimeDependencies
    .filter((dependency) => noticeRows.has(dependency) && lockDependencies.has(dependency))
    .filter((dependency) => noticeRows.get(dependency).version !== lockDependencies.get(dependency))
    .map((dependency) => `${dependency}: notices=${noticeRows.get(dependency).version}, lock=${lockDependencies.get(dependency)}`);
  const incompleteNoticeRows = Array.from(noticeRows.values())
    .filter((row) => !row.license || !row.source.startsWith("https://"))
    .map((row) => row.packageName);

  check(
    checks,
    "Runtime notice table matches direct runtime dependencies",
    missingNoticeRows.length === 0 && staleNoticeRows.length === 0,
    `Missing notice rows: ${missingNoticeRows.join(", ") || "none"}; stale notice rows: ${staleNoticeRows.join(", ") || "none"}.`
  );
  check(
    checks,
    "Runtime notice versions match pnpm-lock.yaml",
    missingLockEntries.length === 0 && versionMismatches.length === 0,
    `Missing lock entries: ${missingLockEntries.join(", ") || "none"}; version mismatches: ${versionMismatches.join("; ") || "none"}.`
  );
  check(
    checks,
    "Runtime notice rows include licenses and public sources",
    incompleteNoticeRows.length === 0,
    `Rows with missing license or non-HTTPS source: ${incompleteNoticeRows.join(", ") || "none"}.`
  );
  check(
    checks,
    "Patched chessboard package is disclosed",
    /^  react-native-chessboard@0\.2\.0: [0-9a-f]+$/m.test(lockfile) &&
      notices.includes("patches/react-native-chessboard@0.2.0.patch"),
    "The notice must disclose the local react-native-chessboard patch that is active in pnpm-lock.yaml."
  );

  check(
    checks,
    "Stockfish notice matches bundled source and pod metadata",
    notices.includes("Version shipped: Stockfish 18") &&
      notices.includes("Upstream release tag: `sf_18`") &&
      notices.includes("Upstream tag commit: `cb3d4ee9b47d0c5aae855b12379378ea1439675c`") &&
      notices.includes("Package version: `ChessticizeStockfish` pod `18.0.0`") &&
      stockfishArtifacts.metadata.podVersion === "18.0.0" &&
      stockfishPodspec.includes('stockfish-artifacts.json') &&
      fileExists(stockfishArtifacts.sourceSentinelPath) &&
      fileExists(stockfishArtifacts.licensePath) &&
      fileExists(stockfishArtifacts.authorsPath),
    "The notice must match the bundled Stockfish source, pod version, GPL license, and authors artifacts."
  );
  check(
    checks,
    "Stockfish NNUE files are disclosed and present",
    stockfishArtifacts.nnuePaths.every((path) => notices.includes(path) && fileExists(path)) &&
      stockfishReadme.includes("Open Database License"),
    "The notice must list each bundled NNUE file and preserve Stockfish's ODbL acknowledgement."
  );
  check(
    checks,
    "Lichess puzzle data notice matches bundled manifest",
    puzzleManifest.source === "Lichess puzzle database" &&
      puzzleManifest.sourceLicense === "CC0" &&
      notices.includes("Name: Lichess puzzle database") &&
      notices.includes("License: CC0") &&
      notices.includes("https://database.lichess.org/#puzzles"),
    "The notice must match the bundled puzzle manifest's Lichess/CC0 source declaration."
  );

  const failed = checks.filter((entry) => entry.status === "fail");
  const result = {
    status: failed.length === 0 ? "pass" : "fail",
    summary: {
      passed: checks.length - failed.length,
      failed: failed.length
    },
    checks
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    console.log("Third-party notice audit");
    for (const entry of checks) {
      console.log(`${entry.status === "pass" ? "PASS" : "FAIL"} ${entry.name}`);
      if (entry.status === "fail") {
        console.log(`  ${entry.detail}`);
      }
    }
    console.log("");
    console.log(`Summary: ${result.summary.passed} passed, ${result.summary.failed} failed.`);
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
