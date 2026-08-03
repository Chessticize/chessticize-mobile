#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import {
  CORE_PACK_FORMAT_ID,
  CORE_PACK_MOVE_CODEC,
  CORE_PACK_MOVE_CODEC_VERSION,
  CORE_PACK_POSITION_CODEC,
  CORE_PACK_POSITION_CODEC_VERSION,
  CORE_PACK_SCHEMA_VERSION,
  decodePuzzlePosition,
  decodeUciMove,
  decodeUciMoveLine,
  encodePuzzlePosition,
  encodeUciMove,
  encodeUciMoveLine
} from "../packages/storage/src/puzzle-pack-binary-codec.ts";
import {
  buildSqliteManifest,
  readPackRowEncoding,
  sha256File,
  sha256Text,
  stableJson
} from "./generate-offline-puzzle-fixture.mjs";
import { installArtifactPair } from "./offline-puzzle-pack-artifact.mjs";

const DEFAULT_PACK = "fixtures/puzzles/bundled-core-pack.sqlite";
const DEFAULT_MANIFEST = "fixtures/puzzles/bundled-core-pack.manifest.json";
const DEFAULT_BUILD_DATE = new Date().toISOString().slice(0, 10);
const DEFAULT_MAX_RATING = 2200;

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const report = await encodeOfflinePuzzlePack({
    packPath: resolve(options.pack),
    manifestPath: resolve(options.manifest),
    buildDate: options.buildDate,
    maxRating: options.maxRating
  });
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.report) {
    await writeFile(resolve(options.report), output);
    console.log(`Wrote binary encoding report to ${resolve(options.report)}`);
  }
  console.log(output.trimEnd());
}

async function encodeOfflinePuzzlePack(input) {
  const packPath = resolve(input.packPath);
  const manifestPath = resolve(input.manifestPath);
  const log = input.log ?? console.log;
  const priorManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await verifyArtifactMatchesManifest(packPath, priorManifest);
  assertVerifiedManifestCounts(priorManifest);

  const token = `${process.pid}-${Date.now()}`;
  const temporaryPackPath = `${packPath}.binary-${token}.tmp`;
  const temporaryManifestPath = `${manifestPath}.binary-${token}.tmp`;
  let installed = false;
  try {
    await copyFile(packPath, temporaryPackPath);
    const beforePackFileBytes = (await stat(temporaryPackPath)).size;
    const encoded = encodePackDatabase(temporaryPackPath, log);
    if (encoded.puzzleCount !== priorManifest.puzzleCount) {
      throw new Error(
        `Core Pack contains ${encoded.puzzleCount} puzzles but its manifest ` +
        `records ${priorManifest.puzzleCount}`
      );
    }

    const packFileBytes = (await stat(temporaryPackPath)).size;
    const packFileHash = `sha256:${await sha256File(temporaryPackPath)}`;
    const manifest = buildSqliteManifest(temporaryPackPath, {
      id: priorManifest.id,
      title: priorManifest.title,
      buildDate: input.buildDate,
      source: priorManifest.source,
      sourceLicense: priorManifest.sourceLicense,
      sourceSnapshotDate: priorManifest.sourceSnapshotDate,
      presolve: priorManifest.presolve,
      presolveDepth: priorManifest.presolveDepth,
      licenseNote: priorManifest.licenseNote,
      format: "sqlite",
      seed: priorManifest.seed,
      targetPuzzleCount:
        priorManifest.targetPuzzleCount ?? encoded.puzzleCount,
      packFileBytes,
      packFileHash,
      manifestHash: "pending"
    }, {
      maxRating: input.maxRating,
      knownArrowDuelCount: priorManifest.arrowDuelCount,
      knownMatePatternCounts: priorManifest.matePatternCounts,
      knownRatingBucketMatePatternCounts: new Map(
        (priorManifest.ratingBuckets ?? []).map((bucket) => [
          bucket.minRating,
          bucket.matePatternCounts ?? {}
        ])
      )
    });
    manifest.manifestHash =
      `sha256:${sha256Text(stableJson({ ...manifest, manifestHash: "" }))}`;
    await writeFile(
      temporaryManifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`
    );

    await installArtifactPair({
      packPath,
      manifestPath,
      temporaryPackPath,
      temporaryManifestPath,
      token,
      backupLabel: "binary",
      fileSystem: input.fileSystem
    });
    installed = true;

    return {
      puzzleCount: encoded.puzzleCount,
      semanticRoundTrips: encoded.semanticRoundTrips,
      semanticHash: `sha256:${encoded.semanticHash}`,
      beforePackFileBytes,
      packFileBytes,
      bytesSaved: beforePackFileBytes - packFileBytes,
      packFileHash,
      manifestHash: manifest.manifestHash,
      integrityCheck: encoded.integrityCheck
    };
  } finally {
    if (!installed) {
      await rm(temporaryPackPath, { force: true });
      await rm(temporaryManifestPath, { force: true });
    }
  }
}

function encodePackDatabase(packPath, log) {
  const db = new DatabaseSync(packPath);
  let transactionOpen = false;
  try {
    assertLegacyTextPack(db);
    const before = semanticDigest(db, "legacy-text");
    db.exec(`
      PRAGMA journal_mode = OFF;
      PRAGMA synchronous = OFF;
      PRAGMA temp_store = MEMORY;
      BEGIN IMMEDIATE;
      CREATE TABLE puzzles_binary (
        id TEXT PRIMARY KEY,
        initial_fen BLOB NOT NULL,
        solution_moves BLOB NOT NULL,
        rating INTEGER NOT NULL,
        rating_deviation INTEGER NOT NULL,
        stockfish_eval REAL NOT NULL,
        stockfish_bestmove BLOB NOT NULL,
        stockfish_eval_after_first_move REAL NOT NULL
      );
    `);
    transactionOpen = true;
    const insert = db.prepare(`
      INSERT INTO puzzles_binary (
        id,
        initial_fen,
        solution_moves,
        rating,
        rating_deviation,
        stockfish_eval,
        stockfish_bestmove,
        stockfish_eval_after_first_move
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let semanticRoundTrips = 0;
    for (const row of db.prepare(`
      SELECT
        id,
        initial_fen,
        solution_moves,
        rating,
        rating_deviation,
        stockfish_eval,
        stockfish_bestmove,
        stockfish_eval_after_first_move
      FROM puzzles
      ORDER BY id
    `).iterate()) {
      const position = compactFen(row.initial_fen);
      const solutionMoves = splitWords(row.solution_moves);
      const bestMove = normalizedMove(row.stockfish_bestmove);
      const encodedPosition = encodePuzzlePosition(position);
      const encodedSolution = encodeUciMoveLine(solutionMoves);
      const encodedBestMove = encodeUciMove(bestMove);
      if (
        decodePuzzlePosition(encodedPosition) !== position ||
        !sameStrings(decodeUciMoveLine(encodedSolution), solutionMoves) ||
        decodeUciMove(encodedBestMove) !== bestMove
      ) {
        throw new Error(`Binary round trip changed puzzle ${row.id}`);
      }
      insert.run(
        row.id,
        encodedPosition,
        encodedSolution,
        row.rating,
        row.rating_deviation,
        row.stockfish_eval,
        encodedBestMove,
        row.stockfish_eval_after_first_move
      );
      semanticRoundTrips += 1;
      if (semanticRoundTrips % 100000 === 0) {
        log(`Binary round-tripped ${semanticRoundTrips} pack puzzles`);
      }
    }

    db.exec(`
      DROP INDEX IF EXISTS puzzles_rating_idx;
      DROP TABLE puzzles;
      ALTER TABLE puzzles_binary RENAME TO puzzles;
      CREATE INDEX puzzles_rating_idx ON puzzles(rating, id);
      CREATE TABLE pack_format (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        format_id TEXT NOT NULL,
        pack_schema_version INTEGER NOT NULL,
        position_codec TEXT NOT NULL,
        position_codec_version INTEGER NOT NULL,
        move_codec TEXT NOT NULL,
        move_codec_version INTEGER NOT NULL
      );
    `);
    db.prepare(`
      INSERT INTO pack_format (
        id,
        format_id,
        pack_schema_version,
        position_codec,
        position_codec_version,
        move_codec,
        move_codec_version
      ) VALUES (1, ?, ?, ?, ?, ?, ?)
    `).run(
      CORE_PACK_FORMAT_ID,
      CORE_PACK_SCHEMA_VERSION,
      CORE_PACK_POSITION_CODEC,
      CORE_PACK_POSITION_CODEC_VERSION,
      CORE_PACK_MOVE_CODEC,
      CORE_PACK_MOVE_CODEC_VERSION
    );
    db.exec("COMMIT");
    transactionOpen = false;
    db.exec("VACUUM");
    db.exec("ANALYZE");

    const after = semanticDigest(db, "binary-v1");
    if (after.puzzleCount !== before.puzzleCount) {
      throw new Error(
        `Binary encoding changed puzzle count from ${before.puzzleCount} ` +
        `to ${after.puzzleCount}`
      );
    }
    if (after.semanticHash !== before.semanticHash) {
      throw new Error(
        `Binary encoding changed semantic hash from ${before.semanticHash} ` +
        `to ${after.semanticHash}`
      );
    }
    const integrityCheck = db.prepare("PRAGMA integrity_check").get()
      .integrity_check;
    if (integrityCheck !== "ok") {
      throw new Error(
        `Binary Core Pack failed PRAGMA integrity_check: ${integrityCheck}`
      );
    }
    return {
      puzzleCount: after.puzzleCount,
      semanticRoundTrips,
      semanticHash: after.semanticHash,
      integrityCheck
    };
  } finally {
    if (transactionOpen) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // The caller discards the temporary database after any failure.
      }
    }
    db.close();
  }
}

function semanticDigest(db, encoding) {
  const hash = createHash("sha256");
  let puzzleCount = 0;
  for (const row of db.prepare(`
    SELECT
      id,
      initial_fen,
      solution_moves,
      rating,
      rating_deviation,
      stockfish_eval,
      stockfish_bestmove,
      stockfish_eval_after_first_move
    FROM puzzles
    ORDER BY id
  `).iterate()) {
    const semanticRow = encoding === "binary-v1"
      ? [
          row.id,
          decodePuzzlePosition(row.initial_fen),
          decodeUciMoveLine(row.solution_moves),
          row.rating,
          row.rating_deviation,
          row.stockfish_eval,
          decodeUciMove(row.stockfish_bestmove),
          row.stockfish_eval_after_first_move
        ]
      : [
          row.id,
          compactFen(row.initial_fen),
          splitWords(row.solution_moves),
          row.rating,
          row.rating_deviation,
          row.stockfish_eval,
          normalizedMove(row.stockfish_bestmove),
          row.stockfish_eval_after_first_move
        ];
    updateLengthPrefixed(hash, JSON.stringify(semanticRow));
    puzzleCount += 1;
  }
  for (const row of db.prepare(`
    SELECT puzzle_id, theme_id, rating
    FROM puzzle_themes
    ORDER BY puzzle_id, theme_id
  `).iterate()) {
    updateLengthPrefixed(
      hash,
      JSON.stringify([row.puzzle_id, row.theme_id, row.rating])
    );
  }
  return { puzzleCount, semanticHash: hash.digest("hex") };
}

function updateLengthPrefixed(hash, value) {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32LE(bytes.length);
  hash.update(length);
  hash.update(bytes);
}

function assertLegacyTextPack(db) {
  if (readPackRowEncoding(db) !== "legacy-text") {
    throw new Error("Core Pack already uses the supported binary format");
  }
  for (const table of ["puzzles", "themes", "puzzle_themes"]) {
    if (!db.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `).get(table)) {
      throw new Error(`Core Pack is missing required table ${table}`);
    }
  }
  const types = db.prepare(`
    SELECT
      typeof(initial_fen) AS initial_fen_type,
      typeof(solution_moves) AS solution_moves_type,
      typeof(stockfish_bestmove) AS stockfish_bestmove_type
    FROM puzzles
    LIMIT 1
  `).get();
  if (
    types?.initial_fen_type !== "text" ||
    types.solution_moves_type !== "text" ||
    types.stockfish_bestmove_type !== "text"
  ) {
    throw new Error("Legacy Core Pack payload columns must contain TEXT rows");
  }
}

async function verifyArtifactMatchesManifest(packPath, manifest) {
  const expectedManifestHash =
    `sha256:${sha256Text(stableJson({ ...manifest, manifestHash: "" }))}`;
  if (manifest.manifestHash !== expectedManifestHash) {
    throw new Error(
      `Manifest hash ${manifest.manifestHash} does not match ` +
      expectedManifestHash
    );
  }
  const bytes = (await stat(packPath)).size;
  if (manifest.packFileBytes !== bytes) {
    throw new Error(
      `Pack size ${bytes} does not match manifest packFileBytes ` +
      `${manifest.packFileBytes}`
    );
  }
  const hash = `sha256:${await sha256File(packPath)}`;
  if (manifest.packFileHash !== hash) {
    throw new Error(
      `Pack hash ${hash} does not match manifest packFileHash ` +
      `${manifest.packFileHash}`
    );
  }
}

function assertVerifiedManifestCounts(manifest) {
  if (
    !Number.isInteger(manifest.puzzleCount) ||
    manifest.puzzleCount < 1 ||
    !Number.isInteger(manifest.arrowDuelCount) ||
    manifest.arrowDuelCount < 0 ||
    manifest.arrowDuelCount > manifest.puzzleCount
  ) {
    throw new Error(
      "Core Pack binary encoding requires valid puzzle and Arrow Duel counts"
    );
  }
}

function compactFen(value) {
  if (typeof value !== "string") {
    throw new Error("Legacy Core Pack position is not TEXT");
  }
  const fields = value.trim().split(/\s+/u);
  if (fields.length !== 4 && fields.length !== 6) {
    throw new Error(`Invalid legacy FEN field count ${fields.length}`);
  }
  return fields.slice(0, 4).join(" ");
}

function splitWords(value) {
  if (typeof value !== "string") {
    throw new Error("Legacy Core Pack move line is not TEXT");
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/u) : [];
}

function normalizedMove(value) {
  if (typeof value !== "string") {
    throw new Error("Legacy Core Pack best move is not TEXT");
  }
  return value.trim();
}

function sameStrings(left, right) {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function parseArgs(argv) {
  const options = {
    pack: DEFAULT_PACK,
    manifest: DEFAULT_MANIFEST,
    buildDate: DEFAULT_BUILD_DATE,
    maxRating: DEFAULT_MAX_RATING,
    report: undefined
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--pack") {
      options.pack = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--manifest") {
      options.manifest = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--build-date") {
      options.buildDate = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--max-rating") {
      options.maxRating = parsePositiveInteger(
        requiredValue(argv, index),
        "max-rating"
      );
      index += 1;
    } else if (arg === "--report") {
      options.report = requiredValue(argv, index);
      index += 1;
    } else if (arg !== "--") {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function requiredValue(argv, index) {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${argv[index]}`);
  }
  return value;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}

export {
  encodeOfflinePuzzlePack,
  main
};
