#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const SOURCE_PACK_SCHEMA_VERSION = 2;
const OUTPUT_PACK_SCHEMA_VERSION = 2;
const COMPACT_ARTIFACT_NAME = "arrow-duel-routes-d16-mpv2.compact.sqlite";
const RELEASE_MANIFEST_NAME = "manifest.json";
const DIFFICULTY_INDEX_NAME = "puzzles_arrow_duel_positive_difficulty_idx";
const DIFFICULTY_INDEX_PREDICATE = "arrow_duel_difficulty BETWEEN 1 AND 4";

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const report = await addArrowDuelDifficultyToCorePack({
    sourcePackPath: resolve(options.sourcePack),
    sourceManifestPath: resolve(options.sourceManifest),
    metricsDirectory: resolve(options.metricsDirectory),
    outputPackPath: resolve(options.outputPack),
    outputManifestPath: resolve(options.outputManifest),
    buildDate: options.buildDate,
    createIndex: options.createIndex
  });
  console.log(JSON.stringify(report, null, 2));
}

export async function addArrowDuelDifficultyToCorePack(input) {
  const sourcePackPath = resolve(input.sourcePackPath);
  const sourceManifestPath = resolve(input.sourceManifestPath);
  const metricsDirectory = resolve(input.metricsDirectory);
  const outputPackPath = resolve(input.outputPackPath);
  const outputManifestPath = resolve(input.outputManifestPath);
  if (sourcePackPath === outputPackPath) {
    throw new Error("Arrow Duel difficulty integration requires a new output pack path");
  }
  if (sourceManifestPath === outputManifestPath) {
    throw new Error("Arrow Duel difficulty integration requires a new output manifest path");
  }

  const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
  const releaseManifestPath = join(metricsDirectory, RELEASE_MANIFEST_NAME);
  const compactPath = join(metricsDirectory, COMPACT_ARTIFACT_NAME);
  const releaseManifest = JSON.parse(await readFile(releaseManifestPath, "utf8"));
  await verifyInputs({
    sourcePackPath,
    sourceManifest,
    compactPath,
    releaseManifest
  });

  await mkdir(dirname(outputPackPath), { recursive: true });
  await mkdir(dirname(outputManifestPath), { recursive: true });
  const token = `${process.pid}-${Date.now()}`;
  const temporaryPackPath = `${outputPackPath}.difficulty-${token}.tmp`;
  const temporaryManifestPath = `${outputManifestPath}.difficulty-${token}.tmp`;
  let installed = false;
  try {
    await copyFile(sourcePackPath, temporaryPackPath);
    const integration = integrateDifficulty(
      temporaryPackPath,
      compactPath,
      input.createIndex !== false
    );
    const packFileBytes = (await stat(temporaryPackPath)).size;
    const packFileHash = `sha256:${await sha256File(temporaryPackPath)}`;
    const difficultyManifest = buildDifficultyManifest(releaseManifest, integration);
    const manifest = {
      ...sourceManifest,
      buildDate: input.buildDate,
      packFileHash,
      packFileBytes,
      packSchemaVersion: OUTPUT_PACK_SCHEMA_VERSION,
      arrowDuelDifficulty: difficultyManifest,
      manifestHash: "pending"
    };
    manifest.manifestHash = `sha256:${sha256Text(stableJson({ ...manifest, manifestHash: "" }))}`;
    await writeFile(temporaryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await rm(outputPackPath, { force: true });
    await rm(outputManifestPath, { force: true });
    await rename(temporaryPackPath, outputPackPath);
    await rename(temporaryManifestPath, outputManifestPath);
    installed = true;
    return {
      sourcePackPath,
      outputPackPath,
      outputManifestPath,
      ...integration,
      packFileBytes,
      packFileHash,
      manifestHash: manifest.manifestHash
    };
  } finally {
    if (!installed) {
      await rm(temporaryPackPath, { force: true });
      await rm(temporaryManifestPath, { force: true });
    }
  }
}

async function verifyInputs(input) {
  const sourceBytes = (await stat(input.sourcePackPath)).size;
  if (sourceBytes !== input.sourceManifest.packFileBytes) {
    throw new Error(
      `Source pack size ${sourceBytes} does not match manifest ${input.sourceManifest.packFileBytes}`
    );
  }
  const sourceHash = await sha256File(input.sourcePackPath);
  const expectedSourceHash = stripSha256(input.sourceManifest.packFileHash);
  if (sourceHash !== expectedSourceHash) {
    throw new Error(`Source pack SHA-256 ${sourceHash} does not match manifest ${expectedSourceHash}`);
  }
  const analysis = input.releaseManifest.analysis;
  if (sourceHash !== analysis?.input?.sha256) {
    throw new Error(
      `Arrow Duel metrics were produced from ${analysis?.input?.sha256 ?? "an unknown input"}, not ${sourceHash}`
    );
  }
  const compactArtifact = input.releaseManifest.artifacts?.find(
    (artifact) => artifact.name === COMPACT_ARTIFACT_NAME
  );
  if (!compactArtifact) {
    throw new Error(`Release manifest does not declare ${COMPACT_ARTIFACT_NAME}`);
  }
  const compactBytes = (await stat(input.compactPath)).size;
  if (compactBytes !== compactArtifact.bytes) {
    throw new Error(`Compact metric size ${compactBytes} does not match release manifest ${compactArtifact.bytes}`);
  }
  const compactHash = await sha256File(input.compactPath);
  if (compactHash !== compactArtifact.sha256) {
    throw new Error(`Compact metric SHA-256 ${compactHash} does not match release manifest ${compactArtifact.sha256}`);
  }
}

function integrateDifficulty(packPath, compactPath, createIndex) {
  const db = new DatabaseSync(packPath);
  const metrics = new DatabaseSync(compactPath, { readOnly: true });
  let transactionOpen = false;
  try {
    assertSourcePack(db);
    const metadata = Object.fromEntries(
      metrics.prepare("SELECT key, value FROM compact_metadata").all().map((row) => [row.key, row.value])
    );
    const puzzleCount = db.prepare("SELECT COUNT(*) AS count FROM puzzles").get().count;
    if (Number(metadata.input_puzzle_count) !== puzzleCount) {
      throw new Error(
        `Compact metrics cover ${metadata.input_puzzle_count} rows, but the Core Pack has ${puzzleCount}`
      );
    }
    const definition = metrics.prepare(
      "SELECT key, bit_width FROM arrow_duel_metric_definitions WHERE id = 1"
    ).get();
    if (definition?.key !== "top_move_unique_plies" || definition.bit_width !== 4) {
      throw new Error(`Unsupported Arrow Duel metric definition ${JSON.stringify(definition ?? null)}`);
    }

    db.exec("PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA temp_store = MEMORY");
    db.exec(
      "ALTER TABLE puzzles ADD COLUMN arrow_duel_difficulty INTEGER " +
      "CHECK (arrow_duel_difficulty IS NULL OR arrow_duel_difficulty BETWEEN 0 AND 4)"
    );
    const update = db.prepare(
      "UPDATE puzzles SET arrow_duel_difficulty = ? WHERE rowid = ?"
    );
    const counts = { unavailable: 0, "0": 0, "1": 0, "2": 0, "3": 0, "4+": 0 };
    let expectedChunkId = 0;
    let expectedRowid = 1;
    db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    for (const chunk of metrics.prepare(
      "SELECT chunk_id, first_puzzle_rowid, puzzle_count, packed_metrics " +
      "FROM arrow_duel_route_metric_chunks ORDER BY chunk_id"
    ).iterate()) {
      if (chunk.chunk_id !== expectedChunkId || chunk.first_puzzle_rowid !== expectedRowid) {
        throw new Error(`Non-contiguous compact metric chunk ${chunk.chunk_id}`);
      }
      const packed = binaryBytes(chunk.packed_metrics);
      if (packed.length !== Math.ceil(chunk.puzzle_count / 2)) {
        throw new Error(`Compact metric chunk ${chunk.chunk_id} has an invalid byte length`);
      }
      for (let offset = 0; offset < chunk.puzzle_count; offset += 1) {
        const packedByte = packed[Math.floor(offset / 2)];
        const raw = offset % 2 === 0 ? packedByte & 0x0f : packedByte >>> 4;
        if (raw > 11) {
          throw new Error(`Reserved Arrow Duel metric code ${raw} at rowid ${expectedRowid + offset}`);
        }
        const difficulty = raw === 0 ? null : Math.min(Math.floor((raw - 1) / 2), 4);
        const rowid = expectedRowid + offset;
        if (update.run(difficulty, rowid).changes !== 1) {
          throw new Error(`Compact metric rowid ${rowid} is missing from the Core Pack`);
        }
        counts[difficulty === null ? "unavailable" : difficulty === 4 ? "4+" : String(difficulty)] += 1;
      }
      expectedChunkId += 1;
      expectedRowid += chunk.puzzle_count;
    }
    if (expectedRowid - 1 !== puzzleCount) {
      throw new Error(`Compact metrics ended after ${expectedRowid - 1}/${puzzleCount} puzzle rows`);
    }
    if (createIndex) {
      db.exec(
        `CREATE INDEX ${DIFFICULTY_INDEX_NAME} ` +
        "ON puzzles(arrow_duel_difficulty, rating, id) " +
        `WHERE ${DIFFICULTY_INDEX_PREDICATE}`
      );
    }
    db.exec("COMMIT");
    transactionOpen = false;
    db.exec("VACUUM; ANALYZE");
    const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
    if (integrity !== "ok") {
      throw new Error(`Difficulty-enriched Core Pack failed PRAGMA integrity_check: ${integrity}`);
    }
    const databaseCounts = {
      unavailable: 0,
      "0": 0,
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      ...Object.fromEntries(db.prepare(
        "SELECT COALESCE(CAST(arrow_duel_difficulty AS TEXT), 'unavailable') AS bucket, " +
        "COUNT(*) AS count FROM puzzles GROUP BY arrow_duel_difficulty"
      ).all().map((row) => [row.bucket, row.count]))
    };
    const expectedDatabaseCounts = {
      unavailable: counts.unavailable,
      "0": counts["0"],
      "1": counts["1"],
      "2": counts["2"],
      "3": counts["3"],
      "4": counts["4+"]
    };
    if (stableJson(databaseCounts) !== stableJson(expectedDatabaseCounts)) {
      throw new Error(
        `Stored difficulty counts ${JSON.stringify(databaseCounts)} differ from decoded metrics ${JSON.stringify(expectedDatabaseCounts)}`
      );
    }
    return {
      puzzleCount,
      difficultyCounts: counts,
      createIndex,
      indexName: createIndex ? DIFFICULTY_INDEX_NAME : null,
      integrityCheck: integrity
    };
  } catch (error) {
    if (transactionOpen) {
      db.exec("ROLLBACK");
    }
    throw error;
  } finally {
    metrics.close();
    db.close();
  }
}

function assertSourcePack(db) {
  const format = db.prepare("SELECT * FROM pack_format WHERE id = 1").get();
  if (
    format?.format_id !== "chessticize-core-pack" ||
    format.pack_schema_version !== SOURCE_PACK_SCHEMA_VERSION ||
    format.position_codec !== "chessticize-position" ||
    format.position_codec_version !== 1 ||
    format.move_codec !== "chessticize-uci16" ||
    format.move_codec_version !== 1
  ) {
    throw new Error(`Unsupported source Core Pack format ${JSON.stringify(format ?? null)}`);
  }
  const columns = new Set(db.prepare("PRAGMA table_info(puzzles)").all().map((row) => row.name));
  if (columns.has("arrow_duel_difficulty")) {
    throw new Error("Source Core Pack already contains Arrow Duel difficulty");
  }
  const rowids = db.prepare(
    "SELECT COUNT(*) AS count, MIN(rowid) AS minimum, MAX(rowid) AS maximum FROM puzzles"
  ).get();
  if (rowids.minimum !== 1 || rowids.maximum !== rowids.count) {
    throw new Error("Source Core Pack puzzle rowids must be contiguous from 1");
  }
}

function buildDifficultyManifest(releaseManifest, integration) {
  const analysis = releaseManifest.analysis;
  return {
    schemaVersion: 1,
    column: "arrow_duel_difficulty",
    values: ["0", "1", "2", "3", "4+"],
    definition:
      "Puzzle-side forced follow-up moves after the displayed correct Arrow Duel move; 4 stores the censored 4+ bucket.",
    unavailableCount: integration.difficultyCounts.unavailable,
    counts: {
      "0": integration.difficultyCounts["0"],
      "1": integration.difficultyCounts["1"],
      "2": integration.difficultyCounts["2"],
      "3": integration.difficultyCounts["3"],
      "4+": integration.difficultyCounts["4+"]
    },
    index: integration.indexName,
    sourceRelease: {
      repository: releaseManifest.release.repository,
      tag: releaseManifest.release.tag,
      compactArtifact: COMPACT_ARTIFACT_NAME,
      compactSha256: releaseManifest.artifacts.find(
        (artifact) => artifact.name === COMPACT_ARTIFACT_NAME
      ).sha256
    },
    engine: {
      name: analysis.engine.name,
      depth: analysis.engine.depth,
      multiPv: analysis.engine.multiPv,
      evaluationToleranceCp: analysis.engine.evaluationToleranceCp,
      maximumSearchedPlies: analysis.metric.maximumSearchedPlies
    }
  };
}

function binaryBytes(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  throw new Error("SQLite returned a non-binary compact metric payload");
}

function stripSha256(value) {
  return typeof value === "string" && value.startsWith("sha256:")
    ? value.slice("sha256:".length)
    : value;
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  return JSON.stringify(sortObject(value));
}

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortObject(item)])
    );
  }
  return value;
}

function parseArgs(argv) {
  const values = {
    sourcePack: "fixtures/puzzles/bundled-core-pack.sqlite",
    sourceManifest: "fixtures/puzzles/bundled-core-pack.manifest.json",
    metricsDirectory: "scratch/arrow-duel-release-staging",
    outputPack: "scratch/core-pack-v6/bundled-core-pack.sqlite",
    outputManifest: "scratch/core-pack-v6/bundled-core-pack.manifest.json",
    buildDate: new Date().toISOString().slice(0, 10),
    createIndex: true
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "--with-index") {
      values.createIndex = true;
      continue;
    }
    if (argument === "--without-index") {
      values.createIndex = false;
      continue;
    }
    const key = {
      "--source-pack": "sourcePack",
      "--source-manifest": "sourceManifest",
      "--metrics-directory": "metricsDirectory",
      "--output-pack": "outputPack",
      "--output-manifest": "outputManifest",
      "--build-date": "buildDate"
    }[argument];
    if (!key || !next) {
      throw new Error(`Unknown or incomplete argument ${argument}`);
    }
    values[key] = next;
    index += 1;
  }
  return values;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  DIFFICULTY_INDEX_PREDICATE,
  DIFFICULTY_INDEX_NAME,
  OUTPUT_PACK_SCHEMA_VERSION
};
