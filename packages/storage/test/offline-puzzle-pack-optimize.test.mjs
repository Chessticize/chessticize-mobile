import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  CORE_PACK_THEME_CATALOG,
  INDEXED_CORE_PACK_THEMES
} from "../../../scripts/offline-puzzle-pack-schema.mjs";
import {
  optimizeOfflinePuzzlePack
} from "../../../scripts/optimize-offline-puzzle-pack.mjs";
import {
  initializeDatabase,
  main as generateOfflinePuzzlePack,
  sha256File,
  sha256Text,
  stableJson,
  writeSelectedPack
} from "../../../scripts/generate-offline-puzzle-fixture.mjs";
import {
  NodeSqliteDatabase,
  SQLitePuzzlePackSource
} from "../src/index.ts";

const PACK_FEN = "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - -";
const MOVES = "f2g3 e6e7 b2b1 b3c1 b1c1 h6c1";

test("fresh Core Pack generation writes the optimized stable-theme schema", () => {
  const db = new DatabaseSync(":memory:");
  try {
    initializeDatabase(db);
    writeSelectedPack(db, [
      generatedPuzzle("fresh-hanging", 900, ["endgame", "hangingPiece"]),
      generatedPuzzle("fresh-fork", 1100, ["crushing", "fork"]),
      generatedPuzzle("fresh-no-indexed-theme", 1300, ["endgame"])
    ]);

    assert.deepEqual(
      db.prepare("SELECT id, name FROM themes ORDER BY id").all()
        .map((row) => ({ ...row })),
      CORE_PACK_THEME_CATALOG
    );
    assert.deepEqual(
      db.prepare(`
        SELECT puzzles.id, themes.name, puzzle_themes.rating
        FROM puzzle_themes
        JOIN puzzles ON puzzles.id = puzzle_themes.puzzle_id
        JOIN themes ON themes.id = puzzle_themes.theme_id
        ORDER BY puzzles.id
      `).all().map((row) => ({ ...row })),
      [
        { id: "fresh-fork", name: "fork", rating: 1100 },
        { id: "fresh-hanging", name: "hangingPiece", rating: 900 }
      ]
    );
    assert.match(
      db.prepare(`
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = 'puzzle_themes'
      `).get().sql,
      /WITHOUT ROWID$/u
    );
  } finally {
    db.close();
  }
});

test("optimizes the Core Pack relation index without renumbering the theme catalog", async (t) => {
  const fixture = await createLegacyPackFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const report = await optimizeOfflinePuzzlePack({
    packPath: fixture.packPath,
    manifestPath: fixture.manifestPath,
    buildDate: "2026-07-30",
    maxRating: 2200,
    log: () => {}
  });

  assert.equal(report.beforePuzzleCount, 3);
  assert.equal(report.afterPuzzleCount, 3);
  assert.equal(report.beforePuzzleThemeRelationCount, 6);
  assert.equal(report.afterPuzzleThemeRelationCount, 2);
  assert.equal(report.themeCatalogCount, 62);
  assert.equal(report.indexedThemeCount, 24);
  assert.equal(
    report.arrowDuelValidation,
    "reused-from-verified-input"
  );
  assert.equal(report.integrityCheck, "ok");

  const db = new DatabaseSync(fixture.packPath, { readOnly: true });
  try {
    const tableSql = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'puzzle_themes'"
    ).get().sql;
    assert.match(tableSql, /WITHOUT ROWID$/u);
    assert.deepEqual(
      db.prepare("SELECT id, name FROM themes ORDER BY id").all().map((row) => ({ ...row })),
      CORE_PACK_THEME_CATALOG
    );
    assert.deepEqual(
      db.prepare(`
        SELECT DISTINCT themes.name
        FROM puzzle_themes
        JOIN themes ON themes.id = puzzle_themes.theme_id
        ORDER BY themes.name
      `).all().map((row) => row.name),
      [...INDEXED_CORE_PACK_THEMES].sort()
        .filter((theme) => theme === "fork" || theme === "hangingPiece")
    );
    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM puzzle_themes
        JOIN themes ON themes.id = puzzle_themes.theme_id
        WHERE themes.name = 'endgame'
      `).get().count,
      0
    );
    assert.equal(
      db.prepare("SELECT id FROM themes WHERE name = 'endgame'").get().id,
      20
    );
    assert.equal(
      db.prepare("SELECT id FROM themes WHERE name = 'hangingPiece'").get().id,
      25
    );

    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(db), {
      arrowDuelEligibility: "all"
    });
    assert.deepEqual(
      source.selectPuzzles({
        mode: "standard",
        limit: 10,
        themes: ["endgame"]
      }),
      []
    );
    assert.deepEqual(
      source.selectPuzzles({
        mode: "standard",
        limit: 10,
        themes: ["hangingPiece"]
      }).map((puzzle) => puzzle.id),
      ["with-hanging"]
    );
    assert.deepEqual(source.getPuzzle("endgame-only")?.themes, []);
  } finally {
    db.close();
  }

  const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
  assert.equal(manifest.buildDate, "2026-07-30");
  assert.equal(manifest.puzzleCount, 3);
  assert.equal(manifest.arrowDuelCount, 3);
  assert.deepEqual(manifest.themes, ["fork", "hangingPiece"]);
  assert.deepEqual(manifest.themeCounts, { fork: 1, hangingPiece: 1 });
  assert.deepEqual(manifest.matePatternCounts, { anastasiaMate: 1 });
  assert.deepEqual(
    manifest.ratingBuckets.find((bucket) => bucket.minRating === 900)
      ?.matePatternCounts,
    { anastasiaMate: 1 }
  );
  assert.equal(manifest.packFileBytes, (await stat(fixture.packPath)).size);
  assert.equal(manifest.packFileHash, `sha256:${await sha256File(fixture.packPath)}`);
  assert.equal(
    manifest.manifestHash,
    `sha256:${sha256Text(stableJson({ ...manifest, manifestHash: "" }))}`
  );

  const firstPackHash = await sha256File(fixture.packPath);
  const repeated = await optimizeOfflinePuzzlePack({
    packPath: fixture.packPath,
    manifestPath: fixture.manifestPath,
    buildDate: "2026-07-30",
    maxRating: 2200,
    log: () => {}
  });
  assert.equal(repeated.beforePuzzleThemeRelationCount, 2);
  assert.equal(repeated.afterPuzzleThemeRelationCount, 2);
  assert.equal(repeated.packFileHash, `sha256:${firstPackHash}`);
  assert.equal(await sha256File(fixture.packPath), firstPackHash);
});

test("manifest-only rebuild preserves verified mate-pattern provenance", async (t) => {
  const fixture = await createLegacyPackFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  await optimizeOfflinePuzzlePack({
    packPath: fixture.packPath,
    manifestPath: fixture.manifestPath,
    buildDate: "2026-07-30",
    maxRating: 2200,
    log: () => {}
  });
  await generateOfflinePuzzlePack([
    "--output",
    fixture.packPath,
    "--manifest",
    fixture.manifestPath,
    "--target-count",
    "3",
    "--max-rating",
    "2200",
    "--manifest-only"
  ]);

  const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
  assert.deepEqual(manifest.matePatternCounts, { anastasiaMate: 1 });
  assert.deepEqual(
    manifest.ratingBuckets.find((bucket) => bucket.minRating === 900)
      ?.matePatternCounts,
    { anastasiaMate: 1 }
  );
  assert.equal(
    manifest.manifestHash,
    `sha256:${sha256Text(stableJson({ ...manifest, manifestHash: "" }))}`
  );
});

test("manifest-only rebuild rejects incomplete bucket provenance without rewriting", async (t) => {
  const fixture = await createLegacyPackFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  await optimizeOfflinePuzzlePack({
    packPath: fixture.packPath,
    manifestPath: fixture.manifestPath,
    buildDate: "2026-07-30",
    maxRating: 2200,
    log: () => {}
  });
  const incompleteManifest =
    JSON.parse(await readFile(fixture.manifestPath, "utf8"));
  incompleteManifest.ratingBuckets =
    incompleteManifest.ratingBuckets.filter(
      (bucket) => bucket.minRating !== 900
    );
  incompleteManifest.manifestHash =
    `sha256:${sha256Text(stableJson({
      ...incompleteManifest,
      manifestHash: ""
    }))}`;
  const incompleteManifestText =
    `${JSON.stringify(incompleteManifest, null, 2)}\n`;
  await writeFile(fixture.manifestPath, incompleteManifestText);

  await assert.rejects(
    generateOfflinePuzzlePack([
      "--output",
      fixture.packPath,
      "--manifest",
      fixture.manifestPath,
      "--target-count",
      "3",
      "--max-rating",
      "2200",
      "--manifest-only"
    ]),
    /missing mate-pattern provenance for rating bucket 900/u
  );
  assert.equal(
    await readFile(fixture.manifestPath, "utf8"),
    incompleteManifestText
  );
});

test("preserves the verified artifact pair when manifest backup fails", async (t) => {
  const fixture = await createLegacyPackFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const originalPack = await readFile(fixture.packPath);
  const originalManifest = await readFile(fixture.manifestPath);
  let renameCallCount = 0;

  await assert.rejects(
    optimizeOfflinePuzzlePack({
      packPath: fixture.packPath,
      manifestPath: fixture.manifestPath,
      buildDate: "2026-07-30",
      maxRating: 2200,
      log: () => {},
      fileSystem: {
        rename: async (source, destination) => {
          renameCallCount += 1;
          if (renameCallCount === 2) {
            throw new Error("injected manifest backup failure");
          }
          await rename(source, destination);
        },
        rm
      }
    }),
    /injected manifest backup failure/u
  );

  assert.deepEqual(await readFile(fixture.packPath), originalPack);
  assert.deepEqual(await readFile(fixture.manifestPath), originalManifest);
});

async function createLegacyPackFixture() {
  const root = await mkdtemp(join(tmpdir(), "chessticize-pack-optimize-"));
  const packPath = join(root, "bundled-core-pack.sqlite");
  const manifestPath = join(root, "bundled-core-pack.manifest.json");
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
      );
      CREATE INDEX puzzles_rating_idx ON puzzles(rating, id);
      CREATE INDEX puzzle_themes_theme_rating_idx
        ON puzzle_themes(theme_id, rating, puzzle_id);
    `);
    const insertTheme = db.prepare("INSERT INTO themes (id, name) VALUES (?, ?)");
    for (const theme of CORE_PACK_THEME_CATALOG) {
      insertTheme.run(theme.id, theme.name);
    }
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
    for (const [id, rating] of [
      ["with-hanging", 900],
      ["endgame-only", 1000],
      ["with-fork", 1100]
    ]) {
      insertPuzzle.run(id, PACK_FEN, MOVES, rating, 77, -450, "b2b1", 683);
    }
    const themeId = (name) =>
      db.prepare("SELECT id FROM themes WHERE name = ?").get(name).id;
    const insertRelation = db.prepare(
      "INSERT INTO puzzle_themes (puzzle_id, theme_id, rating) VALUES (?, ?, ?)"
    );
    insertRelation.run("with-hanging", themeId("hangingPiece"), 900);
    insertRelation.run("with-hanging", themeId("endgame"), 900);
    insertRelation.run("with-hanging", themeId("anastasiaMate"), 900);
    insertRelation.run("endgame-only", themeId("endgame"), 1000);
    insertRelation.run("with-fork", themeId("fork"), 1100);
    insertRelation.run("with-fork", themeId("crushing"), 1100);
  } finally {
    db.close();
  }

  const packFileBytes = (await stat(packPath)).size;
  const packFileHash = `sha256:${await sha256File(packPath)}`;
  const manifest = {
    id: "core",
    title: "Core Pack",
    buildDate: "2026-07-26",
    source: "Lichess puzzle database",
    sourceLicense: "CC0",
    sourceSnapshotDate: "2025-07-24",
    presolve: "Chessticize depth-20 Stockfish presolve",
    presolveDepth: 20,
    licenseNote: "Derived from Lichess puzzle data with Chessticize presolve metadata.",
    manifestHash: "pending",
    packFileHash,
    packFileBytes,
    format: "sqlite",
    seed: "test-seed",
    targetPuzzleCount: 3,
    puzzleCount: 3,
    rating: { min: 900, max: 1100 },
    themes: [
      "anastasiaMate",
      "crushing",
      "endgame",
      "fork",
      "hangingPiece"
    ],
    themeCounts: {
      anastasiaMate: 1,
      crushing: 1,
      endgame: 2,
      fork: 1,
      hangingPiece: 1
    },
    ratingBuckets: [
      {
        minRating: 900,
        maxRating: 999,
        puzzleCount: 1,
        themeCounts: {
          anastasiaMate: 1,
          endgame: 1,
          hangingPiece: 1
        },
        matePatternCounts: { anastasiaMate: 1 }
      },
      {
        minRating: 1000,
        maxRating: 1099,
        puzzleCount: 1,
        themeCounts: { endgame: 1 },
        matePatternCounts: {}
      },
      {
        minRating: 1100,
        maxRating: 1199,
        puzzleCount: 1,
        themeCounts: { crushing: 1, fork: 1 },
        matePatternCounts: {}
      }
    ],
    matePatternCounts: { anastasiaMate: 1 },
    arrowDuelCount: 3
  };
  manifest.manifestHash =
    `sha256:${sha256Text(stableJson({ ...manifest, manifestHash: "" }))}`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, packPath, manifestPath };
}

function generatedPuzzle(id, rating, themes) {
  return {
    id,
    initialFen: `${PACK_FEN} 0 1`,
    solutionMoves: MOVES.split(" "),
    rating,
    ratingDeviation: 77,
    popularity: 100,
    nbPlays: 1000,
    themes,
    openingTags: [],
    source: "lichess",
    stockfishEval: -450,
    stockfishBestMove: "b2b1",
    stockfishEvalAfterFirstMove: 683
  };
}
