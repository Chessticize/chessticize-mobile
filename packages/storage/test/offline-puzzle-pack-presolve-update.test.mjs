import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  sha256File,
  sha256Text,
  stableJson
} from "../../../scripts/generate-offline-puzzle-fixture.mjs";
import { updateOfflinePuzzlePackPresolve } from "../../../scripts/update-offline-puzzle-pack-presolve.mjs";

const FULL_FEN = "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24";
const PACK_FEN = "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - -";
const MOVES = "f2g3 e6e7 b2b1 b3c1 b1c1 h6c1";
const ORIGINAL_PRESOLVE = {
  stockfishEval: -450,
  stockfishBestMove: "b2b1",
  stockfishEvalAfterFirstMove: 683
};

test("updates retained IDs from depth 20 and removes puzzles that stop qualifying", async (t) => {
  const fixture = await createFixture({
    packIds: ["00008", "00009", "0000A"],
    sourceRows: [
      sourceRow("00008", -453, "b2b1", 693),
      sourceRow("00009", -453, "f2g3", 693),
      sourceRow("0000A", -450, "b2b1", 683)
    ]
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const report = await updateOfflinePuzzlePackPresolve({
    sourcePath: fixture.sourcePath,
    packPath: fixture.packPath,
    manifestPath: fixture.manifestPath,
    buildDate: "2026-07-10",
    sourceSnapshotDate: "2025-07-24",
    presolveDepth: 20,
    maxRating: 2200,
    log: () => {}
  });

  assert.equal(report.beforePuzzleCount, 3);
  assert.equal(report.matchedSourceRows, 3);
  assert.equal(report.changedRows, 2);
  assert.equal(report.updatedRows, 1);
  assert.equal(report.unchangedRows, 1);
  assert.equal(report.removedRows, 1);
  assert.deepEqual(report.changedFields, {
    stockfishEval: 2,
    stockfishBestMove: 1,
    stockfishEvalAfterFirstMove: 2
  });
  assert.deepEqual(report.removedPuzzleIdSample, ["00009"]);
  assert.equal(report.afterPuzzleCount, 2);
  assert.equal(report.arrowDuelEligibleAfterUpdate, 2);
  assert.equal(report.integrityCheck, "ok");

  const db = new DatabaseSync(fixture.packPath, { readOnly: true });
  try {
    assert.deepEqual({ ...db.prepare("SELECT * FROM puzzles WHERE id = ?").get("00008") }, {
      id: "00008",
      initial_fen: PACK_FEN,
      solution_moves: MOVES,
      rating: 1798,
      stockfish_eval: -453,
      stockfish_bestmove: "b2b1",
      stockfish_eval_after_first_move: 693
    });
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM puzzles WHERE id = ?").get("00009").count, 0);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM puzzle_themes WHERE puzzle_id = ?").get("00009").count,
      0
    );
    assert.deepEqual({ ...db.prepare("SELECT * FROM puzzles WHERE id = ?").get("0000A") }, {
      id: "0000A",
      initial_fen: PACK_FEN,
      solution_moves: MOVES,
      rating: 1798,
      stockfish_eval: ORIGINAL_PRESOLVE.stockfishEval,
      stockfish_bestmove: ORIGINAL_PRESOLVE.stockfishBestMove,
      stockfish_eval_after_first_move: ORIGINAL_PRESOLVE.stockfishEvalAfterFirstMove
    });
  } finally {
    db.close();
  }

  const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
  assert.equal(manifest.presolveDepth, 20);
  assert.equal(manifest.presolve, "Chessticize depth-20 Stockfish presolve");
  assert.equal(manifest.sourceSnapshotDate, "2025-07-24");
  assert.equal(manifest.puzzleCount, 2);
  assert.equal(manifest.arrowDuelCount, 2);
  assert.equal(manifest.targetPuzzleCount, 3);
  assert.equal(manifest.packFileHash, `sha256:${await sha256File(fixture.packPath)}`);
  assert.equal(manifest.packFileBytes, (await stat(fixture.packPath)).size);
  assert.equal(
    manifest.manifestHash,
    `sha256:${sha256Text(stableJson({ ...manifest, manifestHash: "" }))}`
  );
});

test("leaves the original artifact and manifest untouched when the depth-20 source is incomplete", async (t) => {
  const fixture = await createFixture({
    packIds: ["00008", "00009"],
    sourceRows: [sourceRow("00008", -453, "b2b1", 693)]
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const beforePackHash = await sha256File(fixture.packPath);
  const beforeManifest = await readFile(fixture.manifestPath, "utf8");

  await assert.rejects(
    updateOfflinePuzzlePackPresolve({
      sourcePath: fixture.sourcePath,
      packPath: fixture.packPath,
      manifestPath: fixture.manifestPath,
      buildDate: "2026-07-10",
      sourceSnapshotDate: "2025-07-24",
      presolveDepth: 20,
      maxRating: 2200,
      log: () => {}
    }),
    /source is missing 1 pack puzzle IDs/u
  );

  assert.equal(await sha256File(fixture.packPath), beforePackHash);
  assert.equal(await readFile(fixture.manifestPath, "utf8"), beforeManifest);
});

test("rejects source identity changes without touching the original artifact", async (t) => {
  const mismatchedRow = sourceRow("00008", -453, "b2b1", 693).replace(",1798,", ",1799,");
  const fixture = await createFixture({
    packIds: ["00008"],
    sourceRows: [mismatchedRow]
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const beforePackHash = await sha256File(fixture.packPath);
  const beforeManifest = await readFile(fixture.manifestPath, "utf8");

  await assert.rejects(
    updateOfflinePuzzlePackPresolve({
      sourcePath: fixture.sourcePath,
      packPath: fixture.packPath,
      manifestPath: fixture.manifestPath,
      buildDate: "2026-07-10",
      sourceSnapshotDate: "2025-07-24",
      presolveDepth: 20,
      maxRating: 2200,
      log: () => {}
    }),
    /Source identity mismatch for 00008/u
  );

  assert.equal(await sha256File(fixture.packPath), beforePackHash);
  assert.equal(await readFile(fixture.manifestPath, "utf8"), beforeManifest);
});

async function createFixture(input) {
  const root = await mkdtemp(join(tmpdir(), "chessticize-presolve-update-"));
  const sourcePath = join(root, "presolved");
  const packPath = join(root, "bundled-core-pack.sqlite");
  const manifestPath = join(root, "bundled-core-pack.manifest.json");
  await mkdir(sourcePath);

  const db = new DatabaseSync(packPath);
  try {
    db.exec(`
      CREATE TABLE puzzles (
        id TEXT PRIMARY KEY,
        initial_fen TEXT NOT NULL,
        solution_moves TEXT NOT NULL,
        rating INTEGER NOT NULL,
        stockfish_eval REAL NOT NULL,
        stockfish_bestmove TEXT NOT NULL,
        stockfish_eval_after_first_move REAL NOT NULL
      );
      CREATE TABLE themes (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );
      CREATE TABLE puzzle_themes (
        puzzle_id TEXT NOT NULL,
        theme_id INTEGER NOT NULL,
        rating INTEGER NOT NULL,
        PRIMARY KEY (puzzle_id, theme_id)
      );
      CREATE INDEX puzzles_rating_idx ON puzzles(rating, id);
      CREATE INDEX puzzle_themes_theme_rating_idx ON puzzle_themes(theme_id, rating, puzzle_id);
      INSERT INTO themes (id, name) VALUES (1, 'crushing');
    `);
    const insertPuzzle = db.prepare(`
      INSERT INTO puzzles (
        id,
        initial_fen,
        solution_moves,
        rating,
        stockfish_eval,
        stockfish_bestmove,
        stockfish_eval_after_first_move
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertTheme = db.prepare(
      "INSERT INTO puzzle_themes (puzzle_id, theme_id, rating) VALUES (?, 1, 1798)"
    );
    for (const id of input.packIds) {
      insertPuzzle.run(
        id,
        PACK_FEN,
        MOVES,
        1798,
        ORIGINAL_PRESOLVE.stockfishEval,
        ORIGINAL_PRESOLVE.stockfishBestMove,
        ORIGINAL_PRESOLVE.stockfishEvalAfterFirstMove
      );
      insertTheme.run(id);
    }
  } finally {
    db.close();
  }

  const packFileBytes = (await stat(packPath)).size;
  const packFileHash = `sha256:${await sha256File(packPath)}`;
  await writeFile(manifestPath, `${JSON.stringify({
    id: "core",
    title: "Core Pack",
    buildDate: "2026-07-04",
    source: "Lichess puzzle database",
    sourceLicense: "CC0",
    sourceSnapshotDate: "2026-07-04",
    presolve: "Chessticize depth-16 Stockfish presolve",
    presolveDepth: 16,
    licenseNote: "Derived from Lichess puzzle data with Chessticize presolve metadata.",
    manifestHash: "sha256:test",
    packFileHash,
    packFileBytes,
    format: "sqlite",
    seed: "test-seed",
    targetPuzzleCount: input.packIds.length
  }, null, 2)}\n`);

  const header = [
    "PuzzleId",
    "FEN",
    "Moves",
    "Rating",
    "RatingDeviation",
    "Popularity",
    "NbPlays",
    "Themes",
    "GameUrl",
    "OpeningTags",
    "stockfish_eval",
    "stockfish_bestmove",
    "stockfish_eval_after_first_move"
  ].join(",");
  await writeFile(join(sourcePath, "split_1.csv"), `${header}\n${input.sourceRows.join("\n")}\n`);

  return { root, sourcePath, packPath, manifestPath };
}

function sourceRow(id, stockfishEval, stockfishBestMove, stockfishEvalAfterFirstMove) {
  return [
    id,
    FULL_FEN,
    MOVES,
    1798,
    77,
    95,
    8020,
    "crushing",
    `https://lichess.org/${id}`,
    "",
    stockfishEval,
    stockfishBestMove,
    stockfishEvalAfterFirstMove
  ].join(",");
}
