#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(
    "Usage: collect-release-delta.mjs --base <git-ref> --head <git-ref> [--output <path>]\n"
  );
  process.exit(0);
}
if (!args.base || !args.head) {
  throw new Error("--base and --head are required");
}

const base = git(["rev-parse", "--verify", `${args.base}^{commit}`]).trim();
const head = git(["rev-parse", "--verify", `${args.head}^{commit}`]).trim();
try {
  git(["merge-base", "--is-ancestor", base, head]);
} catch {
  throw new Error(`Baseline ${base} is not an ancestor of target ${head}`);
}

const commits = lines(
  git(["log", "--first-parent", "--reverse", "--format=%H%x09%s", `${base}..${head}`])
).map((line) => {
  const [sha, ...subjectParts] = line.split("\t");
  const subject = subjectParts.join("\t");
  const match = subject.match(/\(#(\d+)\)$/);
  return {
    sha,
    subject,
    ...(match ? { pullRequest: Number(match[1]) } : {})
  };
});

const changedFiles = lines(git(["diff", "--name-status", base, head])).map((line) => {
  const [status, ...pathParts] = line.split("\t");
  return { status, path: pathParts.at(-1) };
});
const paths = changedFiles.map((entry) => entry.path);
const groups = {
  mobileRuntime: matching(paths, [
    /^apps\/mobile\/src\//,
    /^packages\/core\/src\//,
    /^packages\/storage\/src\//
  ]),
  iosNative: matching(paths, [/^apps\/mobile\/ios\//]),
  androidNative: matching(paths, [/^apps\/mobile\/android\//]),
  persistenceOrMigration: matching(paths, [
    /^packages\/storage\//,
    /schema-snapshots/,
    /migration/
  ]),
  interactionLab: matching(paths, [/^apps\/mobile-lab\//]),
  nativeE2E: matching(paths, [/^apps\/mobile\/e2e\//]),
  releaseOrWorkflow: matching(paths, [
    /^\.github\/workflows\//,
    /^docs\/.*RELEASE/,
    /^docs\/APP_STORE/,
    /^scripts\/app-store/,
    /^\.codex\/skills\//
  ])
};

const result = {
  generatedAt: new Date().toISOString(),
  baseline: base,
  target: head,
  targetTree: git(["rev-parse", `${head}^{tree}`]).trim(),
  commitCount: commits.length,
  commits,
  changedFileCount: changedFiles.length,
  changedFiles,
  groups,
  riskHints: {
    hasMobileRuntimeChanges: groups.mobileRuntime.length > 0,
    hasIosNativeChanges: groups.iosNative.length > 0,
    hasAndroidNativeChanges: groups.androidNative.length > 0,
    hasPersistenceOrMigrationChanges: groups.persistenceOrMigration.length > 0,
    hasNativeE2EChanges: groups.nativeE2E.length > 0
  }
};

const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (args.output) {
  writeFileSync(args.output, serialized, "utf8");
} else {
  process.stdout.write(serialized);
}

function git(gitArgs) {
  return execFileSync("git", gitArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function lines(value) {
  return value.trim() === "" ? [] : value.trimEnd().split("\n");
}

function matching(pathsToClassify, patterns) {
  return pathsToClassify.filter((path) => patterns.some((pattern) => pattern.test(path)));
}

function parseArgs(argv) {
  const parsed = { base: undefined, head: undefined, output: undefined, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      parsed.help = true;
      continue;
    }
    if (arg !== "--base" && arg !== "--head" && arg !== "--output") {
      throw new Error(`Unknown argument: ${arg}`);
    }
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`${arg} requires a value`);
    }
    parsed[arg.slice(2)] = value;
    index += 1;
  }
  return parsed;
}
