#!/usr/bin/env node
import { copyFile, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { isServerCompatibleArrowDuelPuzzle } from "../packages/core/src/index.ts";
import {
  buildSqliteManifest,
  listCsvFiles,
  readCsvFile,
  sha256File,
  sha256Text,
  stableJson
} from "./generate-offline-puzzle-fixture.mjs";

const DEFAULT_SOURCE = "../lichess-presolve/presolved";
const DEFAULT_PACK = "fixtures/puzzles/bundled-core-pack.sqlite";
const DEFAULT_MANIFEST = "fixtures/puzzles/bundled-core-pack.manifest.json";
const DEFAULT_BUILD_DATE = new Date().toISOString().slice(0, 10);
const DEFAULT_SOURCE_SNAPSHOT_DATE = "2025-07-24";
const DEFAULT_PRESOLVE_DEPTH = 20;
const DEFAULT_MAX_RATING = 2200;
const REMOVED_ID_SAMPLE_LIMIT = 100;

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const report = await updateOfflinePuzzlePackPresolve({
    sourcePath: resolve(options.source),
    packPath: resolve(options.pack),
    manifestPath: resolve(options.manifest),
    buildDate: options.buildDate,
    sourceSnapshotDate: options.sourceSnapshotDate,
    presolveDepth: options.presolveDepth,
    maxRating: options.maxRating
  });

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.report) {
    await writeFile(resolve(options.report), output);
    console.log(`Wrote update report to ${resolve(options.report)}`);
  }
  console.log(output.trimEnd());
}

async function updateOfflinePuzzlePackPresolve(input) {
  const sourcePath = resolve(input.sourcePath);
  const packPath = resolve(input.packPath);
  const manifestPath = resolve(input.manifestPath);
  const log = input.log ?? console.log;
  const priorManifest = JSON.parse(await readFile(manifestPath, "utf8"));

  await verifyArtifactMatchesManifest(packPath, priorManifest);

  const token = `${process.pid}-${Date.now()}`;
  const temporaryPackPath = `${packPath}.presolve-update-${token}.tmp`;
  const temporaryManifestPath = `${manifestPath}.presolve-update-${token}.tmp`;
  let installed = false;

  try {
    await copyFile(packPath, temporaryPackPath);
    const update = await updatePackDatabase(temporaryPackPath, sourcePath, input.presolveDepth, log);
    const integrity = readIntegrityCheck(temporaryPackPath);
    if (integrity !== "ok") {
      throw new Error(`Updated pack failed PRAGMA integrity_check: ${integrity}`);
    }

    const packFileBytes = (await stat(temporaryPackPath)).size;
    const packFileHash = `sha256:${await sha256File(temporaryPackPath)}`;
    const manifest = buildSqliteManifest(temporaryPackPath, {
      id: priorManifest.id,
      title: priorManifest.title,
      buildDate: input.buildDate,
      source: priorManifest.source,
      sourceLicense: priorManifest.sourceLicense,
      sourceSnapshotDate: input.sourceSnapshotDate,
      presolve: `Chessticize depth-${input.presolveDepth} Stockfish presolve`,
      presolveDepth: input.presolveDepth,
      licenseNote: priorManifest.licenseNote,
      format: priorManifest.format ?? "sqlite",
      seed: priorManifest.seed,
      targetPuzzleCount: priorManifest.targetPuzzleCount ?? update.beforePuzzleCount,
      packFileBytes,
      packFileHash,
      manifestHash: "pending"
    }, { maxRating: input.maxRating });
    manifest.manifestHash = `sha256:${sha256Text(stableJson({ ...manifest, manifestHash: "" }))}`;
    await writeFile(temporaryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await installArtifactPair({
      packPath,
      manifestPath,
      temporaryPackPath,
      temporaryManifestPath,
      token
    });
    installed = true;

    return {
      sourcePath,
      presolveDepth: input.presolveDepth,
      beforePuzzleCount: update.beforePuzzleCount,
      matchedSourceRows: update.matchedSourceRows,
      changedRows: update.changedRows,
      unchangedRows: update.unchangedRows,
      updatedRows: update.updatedRows,
      removedRows: update.removedRows,
      changedFields: update.changedFields,
      removedPuzzleIdSample: update.removedPuzzleIdSample,
      afterPuzzleCount: manifest.puzzleCount,
      arrowDuelEligibleAfterUpdate: manifest.arrowDuelCount,
      integrityCheck: integrity,
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

async function verifyArtifactMatchesManifest(packPath, manifest) {
  const bytes = (await stat(packPath)).size;
  const expectedBytes = manifest.packFileBytes;
  if (expectedBytes !== undefined && bytes !== expectedBytes) {
    throw new Error(`Pack size ${bytes} does not match manifest packFileBytes ${expectedBytes}`);
  }

  const hash = `sha256:${await sha256File(packPath)}`;
  const expectedHash = manifest.packFileHash;
  if (expectedHash && hash !== expectedHash) {
    throw new Error(`Pack hash ${hash} does not match manifest packFileHash ${expectedHash}`);
  }
}

async function updatePackDatabase(packPath, sourcePath, presolveDepth, log) {
  const db = new DatabaseSync(packPath);
  let transactionOpen = false;
  try {
    assertPackSchema(db);
    db.exec("PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA temp_store = MEMORY");

    const remainingPuzzleIds = new Set();
    for (const row of db.prepare("SELECT id FROM puzzles ORDER BY id ASC").iterate()) {
      remainingPuzzleIds.add(row.id);
    }
    const beforePuzzleCount = remainingPuzzleIds.size;
    const selectPuzzle = db.prepare(`
      SELECT
        id,
        initial_fen,
        solution_moves,
        rating,
        stockfish_eval,
        stockfish_bestmove,
        stockfish_eval_after_first_move
      FROM puzzles
      WHERE id = ?
    `);
    const updatePuzzle = db.prepare(`
      UPDATE puzzles
      SET
        stockfish_eval = ?,
        stockfish_bestmove = ?,
        stockfish_eval_after_first_move = ?
      WHERE id = ?
    `);
    const deletePuzzleThemes = db.prepare("DELETE FROM puzzle_themes WHERE puzzle_id = ?");
    const deletePuzzle = db.prepare("DELETE FROM puzzles WHERE id = ?");
    const changedFields = {
      stockfishEval: 0,
      stockfishBestMove: 0,
      stockfishEvalAfterFirstMove: 0
    };
    const removedPuzzleIdSample = [];
    let matchedSourceRows = 0;
    let changedRows = 0;
    let unchangedRows = 0;
    let updatedRows = 0;
    let removedRows = 0;

    db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    for (const filePath of await listCsvFiles(sourcePath)) {
      const beforeFileMatches = matchedSourceRows;
      await readCsvFile(filePath, (sourceRow) => {
        const id = sourceRow.PuzzleId;
        if (!id || !remainingPuzzleIds.has(id)) {
          return;
        }
        remainingPuzzleIds.delete(id);
        matchedSourceRows += 1;

        const existing = selectPuzzle.get(id);
        if (!existing) {
          throw new Error(`Pack puzzle ${id} disappeared during the update`);
        }
        assertSameSourcePuzzle(existing, sourceRow);

        const stockfishEval = parseOptionalNumber(sourceRow.stockfish_eval, "stockfish_eval", id);
        const stockfishBestMove = sourceRow.stockfish_bestmove?.trim() || undefined;
        const stockfishEvalAfterFirstMove = parseOptionalNumber(
          sourceRow.stockfish_eval_after_first_move,
          "stockfish_eval_after_first_move",
          id
        );
        const evalChanged = stockfishEval !== existing.stockfish_eval;
        const bestMoveChanged = stockfishBestMove !== existing.stockfish_bestmove;
        const evalAfterChanged = stockfishEvalAfterFirstMove !== existing.stockfish_eval_after_first_move;
        const changed = evalChanged || bestMoveChanged || evalAfterChanged;

        if (evalChanged) {
          changedFields.stockfishEval += 1;
        }
        if (bestMoveChanged) {
          changedFields.stockfishBestMove += 1;
        }
        if (evalAfterChanged) {
          changedFields.stockfishEvalAfterFirstMove += 1;
        }
        if (changed) {
          changedRows += 1;
        }

        const puzzle = {
          id,
          initialFen: expandFen(existing.initial_fen),
          solutionMoves: splitWords(existing.solution_moves),
          rating: existing.rating,
          themes: [],
          source: "lichess",
          stockfishEval,
          stockfishBestMove,
          stockfishEvalAfterFirstMove
        };
        if (!isServerCompatibleArrowDuelPuzzle(puzzle)) {
          deletePuzzleThemes.run(id);
          deletePuzzle.run(id);
          removedRows += 1;
          if (removedPuzzleIdSample.length < REMOVED_ID_SAMPLE_LIMIT) {
            removedPuzzleIdSample.push(id);
          }
          return;
        }

        if (changed) {
          updatePuzzle.run(stockfishEval, stockfishBestMove, stockfishEvalAfterFirstMove, id);
          updatedRows += 1;
        } else {
          unchangedRows += 1;
        }
      });
      log(
        `Scanned ${filePath}; matched=${matchedSourceRows - beforeFileMatches}; ` +
        `totalMatched=${matchedSourceRows}/${beforePuzzleCount}; changed=${changedRows}; removed=${removedRows}`
      );
    }

    if (remainingPuzzleIds.size > 0) {
      const sample = [...remainingPuzzleIds].slice(0, 20).join(", ");
      throw new Error(
        `Depth-${presolveDepth} source is missing ${remainingPuzzleIds.size} pack puzzle IDs; sample: ${sample}`
      );
    }

    if (removedRows > 0) {
      db.prepare(`
        DELETE FROM themes
        WHERE NOT EXISTS (
          SELECT 1 FROM puzzle_themes WHERE puzzle_themes.theme_id = themes.id
        )
      `).run();
    }
    db.exec("COMMIT");
    transactionOpen = false;
    if (removedRows > 0) {
      db.exec("VACUUM");
    }

    return {
      beforePuzzleCount,
      matchedSourceRows,
      changedRows,
      unchangedRows,
      updatedRows,
      removedRows,
      changedFields,
      removedPuzzleIdSample
    };
  } finally {
    if (transactionOpen) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // The temporary database is discarded by the caller after any failure.
      }
    }
    db.close();
  }
}

function assertPackSchema(db) {
  const required = new Set([
    "id",
    "initial_fen",
    "solution_moves",
    "rating",
    "stockfish_eval",
    "stockfish_bestmove",
    "stockfish_eval_after_first_move"
  ]);
  for (const row of db.prepare("PRAGMA table_info(puzzles)").all()) {
    required.delete(row.name);
  }
  if (required.size > 0) {
    throw new Error(`Puzzle pack is missing required columns: ${[...required].join(", ")}`);
  }
}

function assertSameSourcePuzzle(existing, sourceRow) {
  const sourceFen = canonicalPositionFen(sourceRow.FEN ?? "");
  const sourceMoves = splitWords(sourceRow.Moves).join(" ");
  const sourceRating = parseRequiredNumber(sourceRow.Rating, "Rating", existing.id);
  if (
    sourceFen !== existing.initial_fen ||
    sourceMoves !== existing.solution_moves ||
    sourceRating !== existing.rating
  ) {
    throw new Error(
      `Source identity mismatch for ${existing.id}; targeted presolve updates may not change FEN, moves, or rating`
    );
  }
}

function parseOptionalNumber(value, label, id) {
  if (value === undefined || value === "") {
    return undefined;
  }
  return parseRequiredNumber(value, label, id);
}

function parseRequiredNumber(value, label, id) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label} for ${id}: ${value}`);
  }
  return parsed;
}

function canonicalPositionFen(fen) {
  return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

function expandFen(fen) {
  const fields = fen.trim().split(/\s+/);
  return fields.length === 4 ? `${fields.join(" ")} 0 1` : fields.join(" ");
}

function splitWords(value) {
  return value ? value.trim().split(/\s+/).filter(Boolean) : [];
}

function readIntegrityCheck(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db.prepare("PRAGMA integrity_check").get().integrity_check;
  } finally {
    db.close();
  }
}

async function installArtifactPair(input) {
  const packBackupPath = `${input.packPath}.presolve-backup-${input.token}`;
  const manifestBackupPath = `${input.manifestPath}.presolve-backup-${input.token}`;
  let packBackedUp = false;
  let manifestBackedUp = false;
  try {
    await rename(input.packPath, packBackupPath);
    packBackedUp = true;
    await rename(input.manifestPath, manifestBackupPath);
    manifestBackedUp = true;
    await rename(input.temporaryPackPath, input.packPath);
    await rename(input.temporaryManifestPath, input.manifestPath);
  } catch (error) {
    await rm(input.packPath, { force: true });
    await rm(input.manifestPath, { force: true });
    if (packBackedUp) {
      await rename(packBackupPath, input.packPath);
    }
    if (manifestBackedUp) {
      await rename(manifestBackupPath, input.manifestPath);
    }
    throw error;
  }
  await rm(packBackupPath, { force: true });
  await rm(manifestBackupPath, { force: true });
}

function parseArgs(argv) {
  const options = {
    source: DEFAULT_SOURCE,
    pack: DEFAULT_PACK,
    manifest: DEFAULT_MANIFEST,
    buildDate: DEFAULT_BUILD_DATE,
    sourceSnapshotDate: DEFAULT_SOURCE_SNAPSHOT_DATE,
    presolveDepth: DEFAULT_PRESOLVE_DEPTH,
    maxRating: DEFAULT_MAX_RATING,
    report: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") {
      options.source = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--pack") {
      options.pack = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--manifest") {
      options.manifest = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--build-date") {
      options.buildDate = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--source-snapshot-date") {
      options.sourceSnapshotDate = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--presolve-depth") {
      options.presolveDepth = parsePositiveInteger(requiredValue(argv, index), "presolve-depth");
      index += 1;
    } else if (arg === "--max-rating") {
      options.maxRating = parsePositiveInteger(requiredValue(argv, index), "max-rating");
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}

export { main, updateOfflinePuzzlePackPresolve };
