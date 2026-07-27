import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  opendir,
  readFile,
  stat,
  writeFile
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  isCanonicalProgressSyncSnapshot
} from "../packages/storage/src/local-data-export-validation.ts";

const MAX_CANDIDATE_BYTES = 64 * 1024 * 1024;

export function parseExtractionArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value`);
    }
    if (values.has(argument)) {
      throw new Error(`${argument} may only be provided once`);
    }
    values.set(argument, value);
    index += 1;
  }
  const required = (key) => {
    const value = values.get(key);
    if (!value) throw new Error(`${key} is required`);
    return resolve(value);
  };
  const allowed = new Set(["--container", "--output"]);
  for (const key of values.keys()) {
    if (!allowed.has(key)) throw new Error(`Unexpected argument ${key}`);
  }
  return {
    containerPath: required("--container"),
    outputPath: required("--output")
  };
}

export async function extractLatestTacticalProfileProgress(options) {
  if (!existsSync(options.containerPath)) {
    throw new Error(`App container not found: ${options.containerPath}`);
  }
  const cloudKitRoots = [
    join(options.containerPath, "Library", "Caches", "CloudKit"),
    join(options.containerPath, "AppData", "Library", "Caches", "CloudKit")
  ].filter((path) => existsSync(path));
  if (cloudKitRoots.length === 0) {
    throw new Error("App container has no CloudKit cache directory");
  }

  const candidates = [];
  for (const root of cloudKitRoots) {
    for await (const path of walkRegularFiles(root)) {
      const candidate = await readProgressSnapshot(path);
      if (candidate) candidates.push(candidate);
    }
  }
  if (candidates.length === 0) {
    throw new Error("No canonical LocalDataExport snapshot found in the app container");
  }

  const distinctByHash = new Map();
  for (const candidate of candidates) {
    const existing = distinctByHash.get(candidate.hash);
    if (!existing || candidate.updatedAtMs > existing.updatedAtMs) {
      distinctByHash.set(candidate.hash, candidate);
    }
  }
  const distinct = [...distinctByHash.values()];
  const latestUpdatedAtMs = Math.max(...distinct.map((candidate) => candidate.updatedAtMs));
  const latest = distinct.filter(
    (candidate) => candidate.updatedAtMs === latestUpdatedAtMs
  );
  if (latest.length !== 1) {
    throw new Error(
      "Multiple distinct progress snapshots share the latest updatedAt; " +
      "refusing to choose one implicitly"
    );
  }

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(
    options.outputPath,
    `${JSON.stringify(latest[0].data, null, 2)}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 }
  );
  return {
    outputPath: options.outputPath,
    discoveredSnapshotCount: candidates.length,
    distinctSnapshotCount: distinct.length,
    attemptCount: latest[0].data.attempts.length,
    sprintSessionCount: latest[0].data.sprintSessions.length
  };
}

async function readProgressSnapshot(path) {
  const file = await stat(path);
  if (!file.isFile() || file.size <= 0 || file.size > MAX_CANDIDATE_BYTES) {
    return undefined;
  }
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
  if (
    !isCanonicalProgressSyncSnapshot(parsed)
  ) {
    return undefined;
  }
  const updatedAtMs = Date.parse(parsed.updatedAt);
  if (!Number.isFinite(updatedAtMs)) return undefined;
  return {
    data: parsed.data,
    hash: canonicalHash(parsed.data),
    updatedAtMs
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalHash(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function* walkRegularFiles(root) {
  const directory = await opendir(root);
  for await (const entry of directory) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walkRegularFiles(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

async function main() {
  const options = parseExtractionArguments(process.argv.slice(2));
  const result = await extractLatestTacticalProfileProgress(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
