import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Puzzle } from "../../core/src/index.ts";
import {
  NodeSqliteDatabase,
  PackBackedPracticeStore,
  PracticeService,
  SQLitePuzzlePackSource,
  SQLiteStore
} from "../src/index.ts";

test("SQLitePuzzlePackSource selects puzzles from a read-only pack schema", async () => {
  const packDb = buildPackDatabase(await loadFixturePuzzles());
  try {
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb));

    assert.equal(source.countPuzzles(), 4);
    assert.equal(source.getPuzzle("00008")?.stockfishBestMove, "b2b1");
    assert.equal(source.getPuzzle("00008")?.initialFen.split(" ").length, 6);
    assert.deepEqual(
      source.selectPuzzles({ mode: "standard", limit: 10, themes: ["hangingPiece"] }).map((puzzle) => puzzle.id),
      ["00008"]
    );
    assert.deepEqual(
      source.selectPuzzles({ mode: "standard", limit: 10, themes: ["mate", "hangingPiece"] }).map((puzzle) => puzzle.id),
      ["00008", "000hf"]
    );
    assert.equal(source.countPuzzles({ mode: "standard", limit: 1, themes: ["mate", "hangingPiece"] }), 1);
    assert.equal(source.countPuzzles({ mode: "standard", limit: 10, themes: ["mate", "hangingPiece"] }), 2);
    assert.deepEqual(
      source.selectPuzzles({ mode: "arrow_duel", limit: 10 }).map((puzzle) => puzzle.id).sort(),
      ["00008", "0018S", "001h8"]
    );
    assert.deepEqual(
      source.selectPuzzles({
        mode: "standard",
        limit: 1,
        includeIds: ["00008", ...Array.from({ length: 40_000 }, (_, index) => `missing-${index}`)]
      }).map((puzzle) => puzzle.id),
      ["00008"]
    );
  } finally {
    packDb.close();
  }
});

test("SQLitePuzzlePackSource skips repeated Arrow Duel validation for a manifest-validated pack", async () => {
  const puzzles = await loadFixturePuzzles();
  const packDb = buildPackDatabase(puzzles);
  try {
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb), {
      allPuzzlesArrowDuelEligible: true
    });

    assert.deepEqual(
      source.selectPuzzles({ mode: "arrow_duel", limit: 10 }).map((puzzle) => puzzle.id).sort(),
      puzzles.map((puzzle) => puzzle.id).sort()
    );
  } finally {
    packDb.close();
  }
});

test("SQLitePuzzlePackSource preserves themed candidate results while using the composite theme index", async () => {
  const packDb = buildPackDatabase(await loadFixturePuzzles());
  try {
    const nodeDb = new NodeSqliteDatabase(packDb);
    const preparedSql: string[] = [];
    const source = new SQLitePuzzlePackSource({
      exec: (sql) => nodeDb.exec(sql),
      prepare: (sql) => {
        preparedSql.push(sql);
        return nodeDb.prepare(sql);
      }
    });
    const themeId = (packDb.prepare("SELECT id FROM themes WHERE name = ?").get("crushing") as { id: number }).id;
    const legacyIds = (packDb
      .prepare(
        `SELECT puzzles.id
         FROM puzzle_themes
         JOIN puzzles ON puzzles.id = puzzle_themes.puzzle_id
         WHERE puzzle_themes.theme_id = ?
           AND puzzles.rating >= ?
           AND puzzles.rating <= ?
         ORDER BY puzzles.rating ASC, puzzles.id ASC
         LIMIT ?`
      )
      .all(themeId, 1700, 1900, 10) as Array<{ id: string }>).map((row) => row.id);

    const selectedIds = source
      .selectPuzzles({ mode: "standard", limit: 10, themes: ["crushing"], minRating: 1700, maxRating: 1900 })
      .map((puzzle) => puzzle.id);

    assert.deepEqual(selectedIds, legacyIds);
    const candidateSql = preparedSql.find((sql) => sql.includes("FROM puzzle_themes JOIN puzzles"));
    assert.ok(candidateSql);
    assert.match(candidateSql, /puzzle_themes\.rating >= \?/);
    assert.match(candidateSql, /ORDER BY puzzle_themes\.rating ASC, puzzle_themes\.puzzle_id ASC/);
    const plan = packDb.prepare(`EXPLAIN QUERY PLAN ${candidateSql}`).all(themeId, 1700, 1900, 10) as Array<{ detail: string }>;
    assert.ok(plan.some((row) => row.detail.includes("puzzle_themes_theme_rating_idx") && row.detail.includes("rating>?")));
    assert.ok(plan.every((row) => !row.detail.includes("TEMP B-TREE")));
  } finally {
    packDb.close();
  }
});

test("SQLitePuzzlePackSource merges indexed theme scans for OR matching without duplicate puzzles", async () => {
  const packDb = buildPackDatabase(await loadFixturePuzzles());
  try {
    const nodeDb = new NodeSqliteDatabase(packDb);
    const preparedSql: string[] = [];
    const source = new SQLitePuzzlePackSource({
      exec: (sql) => nodeDb.exec(sql),
      prepare: (sql) => {
        preparedSql.push(sql);
        return nodeDb.prepare(sql);
      }
    });

    const selected = source.selectPuzzles({
      mode: "standard",
      limit: 10,
      themes: ["middlegame", "crushing", "hangingPiece"],
      minRating: 1700,
      maxRating: 1900
    });

    assert.deepEqual(selected.map((puzzle) => puzzle.id), ["00008", "001h8"]);
    assert.equal(new Set(selected.map((puzzle) => puzzle.id)).size, selected.length);
    const candidateSql = preparedSql.filter((sql) => sql.includes("FROM puzzle_themes JOIN puzzles"));
    assert.equal(candidateSql.length, 3);
    assert.ok(candidateSql.every((sql) => /puzzle_themes\.theme_id = \?/.test(sql)));
    const themeIds = ["crushing", "hangingPiece", "middlegame"].map((theme) =>
      (packDb.prepare("SELECT id FROM themes WHERE name = ?").get(theme) as { id: number }).id
    );
    for (const [index, sql] of candidateSql.entries()) {
      const plan = packDb.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(themeIds[index], 1700, 1900, 10) as Array<{ detail: string }>;
      assert.ok(plan.some((row) => row.detail.includes("puzzle_themes_theme_rating_idx") && row.detail.includes("rating>?")));
      assert.ok(plan.every((row) => !row.detail.includes("TEMP B-TREE")));
    }
  } finally {
    packDb.close();
  }
});

test("SQLitePuzzlePackSource fairly merges selected themes before filling from common themes", () => {
  const packDb = buildPackDatabase([
    selectionPuzzle("common-low", 800, ["fork"]),
    selectionPuzzle("common-next", 810, ["fork"]),
    selectionPuzzle("rare", 1200, ["pin"])
  ]);
  try {
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb), {
      allPuzzlesArrowDuelEligible: true
    });

    const selected = source.selectPuzzles({
      mode: "standard",
      limit: 2,
      themes: ["fork", "pin"],
      minRating: 600,
      maxRating: 2200
    });

    assert.deepEqual(selected.map((puzzle) => puzzle.id), ["common-low", "rare"]);
    assert.equal(new Set(selected.map((puzzle) => puzzle.id)).size, selected.length);
  } finally {
    packDb.close();
  }
});

test("PackBackedPracticeStore queries pack puzzles without preloading the user database", async () => {
  const packDb = buildPackDatabase(await loadFixturePuzzles());
  const userStore = new SQLiteStore(":memory:");
  try {
    userStore.migrate();
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb));
    const store = new PackBackedPracticeStore(userStore, source);
    const service = new PracticeService(store);

    assert.equal(userStore.countPuzzles(), 0);
    const sprint = service.startSprint(
      {
        mode: "standard",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        targetCorrect: 1,
        maxMistakes: 3,
        themes: ["hangingPiece"]
      },
      "2026-06-20T00:00:00.000Z"
    );

    assert.equal(sprint.currentPuzzle?.puzzle.id, "00008");
    assert.equal(userStore.countPuzzles(), 1);
    service.submitMove("e6e7", "2026-06-20T00:00:05.000Z");
    service.submitMove("b3c1", "2026-06-20T00:00:10.000Z");
    service.submitMove("h6c1", "2026-06-20T00:00:15.000Z");

    const history = service.getHistoryView({
      now: "2026-06-21T00:00:00.000Z",
      timeRange: "max",
      ratingKey: "hangingPiece standard 5/20"
    });
    assert.equal(history.attempts.length, 1);
    assert.equal(history.attempts[0]?.puzzleId, "00008");
    assert.deepEqual(history.availableThemes, ["hangingPiece"]);
  } finally {
    userStore.close();
    packDb.close();
  }
});

test("Android Standard Practice seed follows the maintained tracked pack solution", async () => {
  const fixture = await loadAndroidStandardPracticeFixture();
  const packDb = buildPackDatabase([fixture.puzzle]);
  const userStore = new SQLiteStore(":memory:");
  try {
    userStore.migrate();
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb));
    const service = new PracticeService(new PackBackedPracticeStore(userStore, source));

    const sprint = service.startSprint(
      {
        mode: "standard",
        durationSeconds: 300,
        targetCorrect: fixture.targetCorrect,
        puzzleSelectionSeed: fixture.puzzleSelectionSeed
      },
      "2026-07-14T12:00:00.000Z"
    );

    assert.equal(sprint.currentPuzzle?.puzzle.id, fixture.puzzle.id);
    assert.deepEqual(sprint.currentPuzzle?.puzzle.solutionMoves, fixture.puzzle.solutionMoves);

    service.submitMove(fixture.userMoves[0], "2026-07-14T12:00:01.000Z");
    const result = service.submitMove(fixture.userMoves[1], "2026-07-14T12:00:02.000Z");

    assert.equal(result.state.status, "won");
    assert.equal(result.attempt?.result, "correct");
    assert.equal(result.state.ratingAfter, fixture.expectedRatingAfter);
  } finally {
    userStore.close();
    packDb.close();
  }
});

test("Android Arrow Duel seed completes through the shared pack-backed service", async () => {
  const fixture = await loadAndroidArrowDuelFixture();
  const packDb = buildPackDatabase([fixture.puzzle]);
  const userStore = new SQLiteStore(":memory:");
  try {
    userStore.migrate();
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb));
    const service = new PracticeService(new PackBackedPracticeStore(userStore, source));

    const sprint = service.startSprint(
      {
        mode: "arrow_duel",
        durationSeconds: 300,
        perPuzzleSeconds: 30,
        targetCorrect: fixture.targetCorrect,
        puzzleSelectionSeed: fixture.puzzleSelectionSeed
      },
      "2026-07-16T12:00:00.000Z"
    );

    assert.equal(sprint.currentPuzzle?.kind, "arrow_duel");
    assert.equal(sprint.currentPuzzle?.puzzle.id, fixture.puzzle.id);
    assert.deepEqual(
      [...(sprint.currentPuzzle?.kind === "arrow_duel" ? sprint.currentPuzzle.candidates : [])].sort(),
      [...fixture.candidates].sort()
    );

    const result = service.submitMove(fixture.correctMove, "2026-07-16T12:00:01.000Z");

    assert.equal(result.state.status, "won");
    assert.equal(result.attempt?.result, "correct");
    assert.equal(result.state.ratingAfter, fixture.expectedRatingAfter);
    assert.deepEqual(
      [...(result.attempt?.arrowDuelCandidateOrder ?? [])].sort(),
      [...fixture.candidates].sort()
    );
  } finally {
    userStore.close();
    packDb.close();
  }
});

test("PackBackedPracticeStore honors locally seeded scoped puzzle sources before the pack", async () => {
  const puzzles = await loadFixturePuzzles();
  const localPuzzle = puzzles[0] as Puzzle;
  const packDb = buildPackDatabase(puzzles.slice(1));
  const userStore = new SQLiteStore(":memory:");
  try {
    userStore.migrate();
    userStore.seedPuzzles([localPuzzle]);
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb));
    const store = new PackBackedPracticeStore(userStore, source);

    assert.deepEqual(
      store.selectPuzzles({
        mode: "standard",
        limit: 1,
        rating: localPuzzle.rating,
        includeIds: [localPuzzle.id]
      }).map((puzzle) => puzzle.id),
      [localPuzzle.id]
    );
  } finally {
    userStore.close();
    packDb.close();
  }
});

test("PackBackedPracticeStore treats seeded includeIds as a local source scope", async () => {
  const puzzles = await loadFixturePuzzles();
  const localPuzzle = puzzles[0] as Puzzle;
  const packPuzzle = { ...(puzzles[1] as Puzzle), id: localPuzzle.id };
  const packDb = buildPackDatabase([packPuzzle]);
  const userStore = new SQLiteStore(":memory:");
  try {
    userStore.migrate();
    userStore.seedPuzzles([localPuzzle]);
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb));
    const store = new PackBackedPracticeStore(userStore, source);

    assert.deepEqual(
      store.selectPuzzles({
        mode: "standard",
        limit: 1,
        themes: ["mate"],
        includeIds: [localPuzzle.id]
      }),
      []
    );
  } finally {
    userStore.close();
    packDb.close();
  }
});

function buildPackDatabase(puzzles: Puzzle[]): DatabaseSync {
  const db = new DatabaseSync(":memory:");
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
  const insertThemeName = db.prepare("INSERT INTO themes (name) VALUES (?)");
  const insertTheme = db.prepare("INSERT INTO puzzle_themes (puzzle_id, theme_id, rating) VALUES (?, ?, ?)");
  db.exec("BEGIN IMMEDIATE");
  try {
    const themeIds = new Map<string, number>();
    for (const theme of [...new Set(puzzles.flatMap((puzzle) => puzzle.themes))].sort((left, right) => left.localeCompare(right))) {
      const result = insertThemeName.run(theme);
      themeIds.set(theme, Number(result.lastInsertRowid));
    }
    for (const puzzle of puzzles) {
      insertPuzzle.run(
        puzzle.id,
        puzzle.initialFen.split(/\s+/).slice(0, 4).join(" "),
        puzzle.solutionMoves.join(" "),
        puzzle.rating,
        puzzle.stockfishEval ?? 0,
        puzzle.stockfishBestMove ?? "",
        puzzle.stockfishEvalAfterFirstMove ?? 0
      );
      for (const theme of puzzle.themes) {
        insertTheme.run(puzzle.id, themeIds.get(theme), puzzle.rating);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return db;
}

function selectionPuzzle(id: string, rating: number, themes: string[]): Puzzle {
  const initialFen = id === "common-next"
    ? "8/8/8/8/8/8/3K4/6k1 w - - 0 1"
    : id === "rare"
      ? "8/8/8/8/8/8/2K5/6k1 w - - 0 1"
      : "8/8/8/8/8/8/4K3/6k1 w - - 0 1";
  return {
    id,
    initialFen,
    solutionMoves: ["e2e3"],
    rating,
    themes,
    source: "synthetic",
    stockfishEval: 0,
    stockfishBestMove: "e2e3",
    stockfishEvalAfterFirstMove: 0
  };
}

async function loadFixturePuzzles(): Promise<Puzzle[]> {
  return JSON.parse(await readFile(resolve("fixtures/puzzles/presolved-sample.json"), "utf8")) as Puzzle[];
}

interface AndroidStandardPracticeFixture {
  puzzleSelectionSeed: string;
  targetCorrect: number;
  puzzle: Puzzle & { solutionMoves: [string, string, string, string] };
  userMoves: [string, string];
  expectedRatingAfter: number;
}

async function loadAndroidStandardPracticeFixture(): Promise<AndroidStandardPracticeFixture> {
  return JSON.parse(
    await readFile(resolve("fixtures/puzzles/android-standard-practice.fixture.json"), "utf8")
  ) as AndroidStandardPracticeFixture;
}

interface AndroidArrowDuelFixture {
  puzzleSelectionSeed: string;
  targetCorrect: number;
  puzzle: Puzzle;
  candidates: [string, string];
  wrongMove: string;
  correctMove: string;
  expectedRatingAfter: number;
}

async function loadAndroidArrowDuelFixture(): Promise<AndroidArrowDuelFixture> {
  return JSON.parse(
    await readFile(resolve("fixtures/puzzles/android-arrow-duel.fixture.json"), "utf8")
  ) as AndroidArrowDuelFixture;
}
