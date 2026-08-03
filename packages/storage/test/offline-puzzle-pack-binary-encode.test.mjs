import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  encodeOfflinePuzzlePack
} from "../../../scripts/encode-offline-puzzle-pack.mjs";
import {
  sha256File,
  sha256Text,
  stableJson
} from "../../../scripts/generate-offline-puzzle-fixture.mjs";
import {
  NodeSqliteDatabase,
  SQLitePuzzlePackSource
} from "../src/index.ts";

const PUZZLES = [
  {
    id: "binary-1",
    initialFen: "r3k2r/ppp2ppp/8/3p4/4P3/8/PPP2PPP/R3K2R b Kq e3 0 1",
    solutionMoves: ["e8g8", "e1c1"],
    rating: 900,
    ratingDeviation: 77,
    stockfishEval: -42,
    stockfishBestMove: "e8g8",
    stockfishEvalAfterFirstMove: 91,
    themes: ["fork"]
  },
  {
    id: "binary-2",
    initialFen: "4k3/R3P3/1p3Kpp/2p5/2P5/1r6/4p1P1/8 b - - 0 1",
    solutionMoves: ["b3e3", "e7e8q"],
    rating: 1100,
    ratingDeviation: 80,
    stockfishEval: -483,
    stockfishBestMove: "e2e1r",
    stockfishEvalAfterFirstMove: 654,
    themes: ["promotion"]
  }
];

test("encodes a verified TEXT Core Pack as an atomic, versioned binary artifact", async (t) => {
  const fixture = await createLegacyFixture(PUZZLES);
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const before = readPublicPuzzles(fixture.packPath);

  const report = await encodeOfflinePuzzlePack({
    packPath: fixture.packPath,
    manifestPath: fixture.manifestPath,
    buildDate: "2026-08-03",
    maxRating: 2200,
    log: () => {}
  });

  assert.equal(report.puzzleCount, PUZZLES.length);
  assert.equal(report.semanticRoundTrips, PUZZLES.length);
  assert.match(report.semanticHash, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(report.integrityCheck, "ok");
  assert.deepEqual(readPublicPuzzles(fixture.packPath), before);

  const db = new DatabaseSync(fixture.packPath, { readOnly: true });
  try {
    assert.deepEqual(
      {
        ...db.prepare(`
          SELECT
            typeof(initial_fen) AS initial_fen_type,
            typeof(solution_moves) AS solution_moves_type,
            typeof(stockfish_bestmove) AS stockfish_bestmove_type
          FROM puzzles
          LIMIT 1
        `).get()
      },
      {
        initial_fen_type: "blob",
        solution_moves_type: "blob",
        stockfish_bestmove_type: "blob"
      }
    );
    assert.deepEqual(
      { ...db.prepare("SELECT * FROM pack_format").get() },
      {
        id: 1,
        format_id: "chessticize-core-pack",
        pack_schema_version: 2,
        position_codec: "chessticize-position",
        position_codec_version: 1,
        move_codec: "chessticize-uci16",
        move_codec_version: 1
      }
    );
  } finally {
    db.close();
  }

  const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
  assert.equal(manifest.buildDate, "2026-08-03");
  assert.equal(manifest.packSchemaVersion, 2);
  assert.deepEqual(manifest.positionCodec, {
    name: "chessticize-position",
    version: 1
  });
  assert.deepEqual(manifest.moveCodec, {
    name: "chessticize-uci16",
    version: 1
  });
  assert.equal(manifest.packFileBytes, (await stat(fixture.packPath)).size);
  assert.equal(
    manifest.packFileHash,
    `sha256:${await sha256File(fixture.packPath)}`
  );
  assert.equal(
    manifest.manifestHash,
    `sha256:${sha256Text(stableJson({ ...manifest, manifestHash: "" }))}`
  );
});

test("keeps the verified artifact pair unchanged when binary encoding fails", async (t) => {
  const fixture = await createLegacyFixture([
    { ...PUZZLES[0], solutionMoves: ["not-uci"] }
  ]);
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const packHash = await sha256File(fixture.packPath);
  const manifestText = await readFile(fixture.manifestPath, "utf8");

  await assert.rejects(
    encodeOfflinePuzzlePack({
      packPath: fixture.packPath,
      manifestPath: fixture.manifestPath,
      buildDate: "2026-08-03",
      maxRating: 2200,
      log: () => {}
    }),
    /Invalid UCI move/u
  );

  assert.equal(await sha256File(fixture.packPath), packHash);
  assert.equal(await readFile(fixture.manifestPath, "utf8"), manifestText);
});

async function createLegacyFixture(puzzles) {
  const root = await mkdtemp(join(tmpdir(), "chessticize-pack-binary-"));
  const packPath = join(root, "bundled-core-pack.sqlite");
  const manifestPath = join(root, "bundled-core-pack.manifest.json");
  const themeIds = new Map();
  const db = new DatabaseSync(packPath);
  try {
    db.exec(`
      CREATE TABLE puzzles (
        id TEXT PRIMARY KEY,
        initial_fen TEXT NOT NULL,
        solution_moves TEXT NOT NULL,
        rating INTEGER NOT NULL,
        rating_deviation INTEGER NOT NULL,
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
      ) WITHOUT ROWID;
      CREATE INDEX puzzles_rating_idx ON puzzles(rating, id);
      CREATE INDEX puzzle_themes_theme_rating_idx
        ON puzzle_themes(theme_id, rating, puzzle_id);
    `);
    const insertPuzzle = db.prepare(`
      INSERT INTO puzzles (
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
    const insertTheme = db.prepare("INSERT INTO themes (name) VALUES (?)");
    const insertPuzzleTheme = db.prepare(`
      INSERT INTO puzzle_themes (puzzle_id, theme_id, rating)
      VALUES (?, ?, ?)
    `);
    for (const theme of [...new Set(puzzles.flatMap((puzzle) => puzzle.themes))]) {
      themeIds.set(theme, Number(insertTheme.run(theme).lastInsertRowid));
    }
    for (const puzzle of puzzles) {
      insertPuzzle.run(
        puzzle.id,
        puzzle.initialFen.split(/\s+/u).slice(0, 4).join(" "),
        puzzle.solutionMoves.join(" "),
        puzzle.rating,
        puzzle.ratingDeviation,
        puzzle.stockfishEval,
        puzzle.stockfishBestMove,
        puzzle.stockfishEvalAfterFirstMove
      );
      for (const theme of puzzle.themes) {
        insertPuzzleTheme.run(puzzle.id, themeIds.get(theme), puzzle.rating);
      }
    }
  } finally {
    db.close();
  }

  const packFileBytes = (await stat(packPath)).size;
  const packFileHash = `sha256:${await sha256File(packPath)}`;
  const manifest = {
    id: "core",
    title: "Core Pack",
    buildDate: "2026-07-30",
    source: "Lichess puzzle database",
    sourceLicense: "CC0",
    sourceSnapshotDate: "2025-07-24",
    presolve: "Chessticize depth-20 Stockfish presolve",
    presolveDepth: 20,
    licenseNote:
      "Derived from Lichess puzzle data with Chessticize presolve metadata.",
    manifestHash: "pending",
    packFileHash,
    packFileBytes,
    format: "sqlite",
    seed: "test-seed",
    targetPuzzleCount: puzzles.length,
    puzzleCount: puzzles.length,
    rating: {
      min: Math.min(...puzzles.map((puzzle) => puzzle.rating)),
      max: Math.max(...puzzles.map((puzzle) => puzzle.rating))
    },
    themes: [...themeIds.keys()].sort(),
    themeCounts: Object.fromEntries(
      [...themeIds.keys()].sort().map((theme) => [
        theme,
        puzzles.filter((puzzle) => puzzle.themes.includes(theme)).length
      ])
    ),
    ratingBuckets: [],
    matePatternCounts: {},
    tacticalAnalysis: {
      schemaVersion: 1,
      puzzleRatingDeviation: true,
      featureHash: `sha256:${"0".repeat(64)}`
    },
    arrowDuelCount: puzzles.length
  };
  manifest.manifestHash =
    `sha256:${sha256Text(stableJson({ ...manifest, manifestHash: "" }))}`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, packPath, manifestPath };
}

function readPublicPuzzles(packPath) {
  const db = new DatabaseSync(packPath, { readOnly: true });
  try {
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(db));
    return PUZZLES.flatMap((puzzle) => {
      const actual = source.getPuzzle(puzzle.id);
      return actual ? [actual] : [];
    });
  } finally {
    db.close();
  }
}
