import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Puzzle } from "../../core/src/index.ts";
import {
  CORE_PACK_FORMAT_ID,
  CORE_PACK_MOVE_CODEC,
  CORE_PACK_MOVE_CODEC_VERSION,
  CORE_PACK_POSITION_CODEC,
  CORE_PACK_POSITION_CODEC_VERSION,
  CORE_PACK_SCHEMA_VERSION,
  encodePuzzlePosition,
  encodeUciMove,
  encodeUciMoveLine
} from "../src/puzzle-pack-binary-codec.ts";
import {
  NodeSqliteDatabase,
  PackBackedPracticeStore,
  PracticeService,
  SQLitePuzzlePackSource,
  SQLiteStore
} from "../src/index.ts";

test("SQLitePuzzlePackSource reads a versioned binary pack through its existing public contract", async () => {
  const puzzles = await loadFixturePuzzles();
  const packDb = buildBinaryPackDatabase(puzzles);
  try {
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb));
    const expected = puzzles.find((puzzle) => puzzle.id === "00008");
    const actual = source.getPuzzle("00008");

    assert.ok(expected);
    assert.ok(actual);
    assert.equal(
      actual.initialFen,
      `${expected.initialFen.split(/\s+/u).slice(0, 4).join(" ")} 0 1`
    );
    assert.deepEqual(actual.solutionMoves, expected.solutionMoves);
    assert.equal(actual.stockfishBestMove, expected.stockfishBestMove);
    assert.deepEqual(
      source.selectPuzzles({
        mode: "standard",
        limit: 10,
        themes: ["hangingPiece"]
      }).map((puzzle) => puzzle.id),
      ["00008"]
    );
  } finally {
    packDb.close();
  }
});

test("SQLitePuzzlePackSource rejects unknown binary pack versions before hydration", async () => {
  const packDb = buildBinaryPackDatabase(await loadFixturePuzzles());
  try {
    packDb.prepare(
      "UPDATE pack_format SET position_codec_version = ? WHERE id = 1"
    ).run(CORE_PACK_POSITION_CODEC_VERSION + 1);

    assert.throws(
      () => new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb)),
      /Unsupported puzzle pack format/u
    );
  } finally {
    packDb.close();
  }
});

test("SQLitePuzzlePackSource rejects a cached pack missing an app-required puzzle column", async () => {
  const packDb = buildPackDatabase(await loadFixturePuzzles());
  try {
    packDb.exec("ALTER TABLE puzzles DROP COLUMN arrow_duel_difficulty");

    assert.throws(
      () => new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb), {
        requiredPuzzleColumns: ["arrow_duel_difficulty"]
      }),
      /Puzzle pack is missing required puzzles columns: arrow_duel_difficulty/u
    );
  } finally {
    packDb.close();
  }
});

test("SQLitePuzzlePackSource rejects a corrupt binary row instead of returning partial puzzle data", async () => {
  const packDb = buildBinaryPackDatabase(await loadFixturePuzzles());
  try {
    packDb.prepare("UPDATE puzzles SET initial_fen = ? WHERE id = ?").run(
      Uint8Array.from([0x01]),
      "00008"
    );
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb));

    assert.throws(
      () => source.getPuzzle("00008"),
      /position payload length/u
    );
  } finally {
    packDb.close();
  }
});

test("SQLitePuzzlePackSource selects puzzles from a read-only pack schema", async () => {
  const packDb = buildPackDatabase(await loadFixturePuzzles());
  try {
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb));

    assert.equal(source.countPuzzles(), 4);
    assert.equal(source.getPuzzle("00008")?.stockfishBestMove, "b2b1");
    assert.equal(source.getPuzzle("00008")?.ratingDeviation, 77);
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

test("SQLitePuzzlePackSource filters compact Arrow Duel difficulty buckets", async () => {
  const puzzles = (await loadFixturePuzzles()).map((puzzle, index) => ({
    ...puzzle,
    ...(index === 0
      ? { arrowDuelDifficulty: 0 as const }
      : index === 1
        ? { arrowDuelDifficulty: 1 as const }
        : index === 2
          ? { arrowDuelDifficulty: 4 as const }
          : {})
  }));
  const packDb = buildPackDatabase(puzzles);
  try {
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb), {
      arrowDuelEligibility: "all"
    });
    assert.equal(source.getPuzzle(puzzles[2]!.id)?.arrowDuelDifficulty, 4);
    assert.deepEqual(
      source.selectPuzzles({
        mode: "arrow_duel",
        limit: 10,
        arrowDuelDifficulties: [1, 4]
      }).map((puzzle) => puzzle.arrowDuelDifficulty),
      [1, 4]
    );
    assert.equal(source.countPuzzles({
      mode: "arrow_duel",
      limit: 10,
      arrowDuelDifficulties: [4]
    }), 1);
    assert.equal(
      source.selectPuzzles({ mode: "arrow_duel", limit: 10 }).length,
      puzzles.length,
      "the default all-bucket selection must not exclude legacy NULL rows"
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
      arrowDuelEligibility: "all"
    });

    assert.deepEqual(
      source.selectPuzzles({ mode: "arrow_duel", limit: 10 }).map((puzzle) => puzzle.id).sort(),
      puzzles.map((puzzle) => puzzle.id).sort()
    );
  } finally {
    packDb.close();
  }
});

test("SQLitePuzzlePackSource keeps promotion puzzles in Standard but excludes them from Arrow Duel", () => {
  const standardPuzzle = arrowDuelPuzzle({
    id: "standard-arrow-duel",
    initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
    solutionMoves: ["d7d5"],
    stockfishBestMove: "e7e5",
    stockfishEval: 50,
    stockfishEvalAfterFirstMove: 300
  });
  const promotionPuzzle = arrowDuelPuzzle({
    id: "promotion-standard-only",
    initialFen: "4k3/R3P3/1p3Kpp/2p5/2P5/1r6/4p1P1/8 b - - 0 1",
    solutionMoves: ["b3e3"],
    stockfishBestMove: "e2e1r",
    stockfishEval: -483,
    stockfishEvalAfterFirstMove: 654
  });
  const packDb = buildPackDatabase([standardPuzzle, promotionPuzzle]);
  try {
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb));

    assert.deepEqual(
      source.selectPuzzles({ mode: "standard", limit: 10 }).map((puzzle) => puzzle.id).sort(),
      [promotionPuzzle.id, standardPuzzle.id].sort()
    );
    assert.deepEqual(
      source.selectPuzzles({ mode: "arrow_duel", limit: 10 }).map((puzzle) => puzzle.id),
      [standardPuzzle.id]
    );
  } finally {
    packDb.close();
  }
});

test("SQLitePuzzlePackSource preserves the manifest fast path while filtering promotion candidates", () => {
  const manifestQualifiedPuzzle = selectionPuzzle("manifest-qualified", 1500, ["fork"]);
  const promotionPuzzle = arrowDuelPuzzle({
    id: "manifest-promotion",
    initialFen: "4k3/R3P3/1p3Kpp/2p5/2P5/1r6/4p1P1/8 b - - 0 1",
    solutionMoves: ["b3e3"],
    stockfishBestMove: "e2e1r",
    stockfishEval: -483,
    stockfishEvalAfterFirstMove: 654
  });
  const excludedThemePromotionPuzzle = {
    ...promotionPuzzle,
    id: "pin-theme-promotion",
    themes: ["pin"]
  };
  const packDb = buildPackDatabase([
    manifestQualifiedPuzzle,
    promotionPuzzle,
    excludedThemePromotionPuzzle
  ]);
  try {
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb), {
      arrowDuelEligibility: "all_non_promotion"
    });

    assert.deepEqual(
      source.selectPuzzles({ mode: "arrow_duel", limit: 10 }).map((puzzle) => puzzle.id),
      [manifestQualifiedPuzzle.id]
    );
    assert.equal(source.countPuzzles({ mode: "arrow_duel", limit: 10 }), 1);
    assert.deepEqual(
      source.selectPuzzlesExcludingThemes(
        { mode: "arrow_duel", limit: 1 },
        ["pin"]
      ).map((puzzle) => puzzle.id),
      [manifestQualifiedPuzzle.id],
      "promotion filtering must continue beyond the first mixed-control candidate"
    );

    const largeIncludeIds = [
      manifestQualifiedPuzzle.id,
      promotionPuzzle.id,
      ...Array.from({ length: 900 }, (_, index) => `missing-${index}`)
    ];
    assert.deepEqual(
      source.selectPuzzles({
        mode: "arrow_duel",
        limit: 10,
        includeIds: largeIncludeIds
      }).map((puzzle) => puzzle.id),
      [manifestQualifiedPuzzle.id],
      "the large include-id path must retain the promotion exclusion"
    );
    assert.deepEqual(
      source.selectPuzzlesExcludingThemes(
        {
          mode: "arrow_duel",
          limit: 10,
          includeIds: largeIncludeIds
        },
        ["pin"]
      ).map((puzzle) => puzzle.id),
      [manifestQualifiedPuzzle.id],
      "the Tactical Profile exclusion path must retain the promotion exclusion"
    );
  } finally {
    packDb.close();
  }
});

test("SQLitePuzzlePackSource treats the All theme sentinel as unrestricted", async () => {
  const packDb = buildPackDatabase(await loadFixturePuzzles());
  try {
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb));

    const unrestrictedIds = source
      .selectPuzzles({ mode: "standard", limit: 10, themes: [] })
      .map((puzzle) => puzzle.id);
    const allThemeIds = source
      .selectPuzzles({ mode: "standard", limit: 10, themes: ["mixed"] })
      .map((puzzle) => puzzle.id);

    assert.deepEqual(allThemeIds, unrestrictedIds);
    assert.equal(
      source.countPuzzles({ mode: "standard", limit: 10, themes: ["mixed"] }),
      source.countPuzzles({ mode: "standard", limit: 10, themes: [] })
    );
  } finally {
    packDb.close();
  }
});

test("SQLitePuzzlePackSource batch-reads immutable Tactical Profile features", () => {
  const packDb = buildPackDatabase([
    tacticalSelectionPuzzle("batch-1", ["fork"]),
    tacticalSelectionPuzzle("batch-2", ["pin"])
  ]);
  try {
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb));
    assert.deepEqual(
      source.getPuzzles(["batch-2", "missing", "batch-1", "batch-2"]).map((puzzle) => [
        puzzle.id,
        puzzle.ratingDeviation,
        puzzle.themes
      ]),
      [
        ["batch-2", 80, ["pin"]],
        ["batch-1", 80, ["fork"]]
      ]
    );
  } finally {
    packDb.close();
  }
});

test("SQLitePuzzlePackSource exact mixed quota excludes every focused theme", () => {
  const packDb = buildPackDatabase([
    tacticalSelectionPuzzle("fork-only", ["fork"]),
    tacticalSelectionPuzzle("pin-only", ["pin"]),
    tacticalSelectionPuzzle("overlap", ["fork", "sacrifice"]),
    tacticalSelectionPuzzle("mixed-1", ["sacrifice"]),
    tacticalSelectionPuzzle("mixed-2", ["deflection"])
  ]);
  try {
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb));
    assert.deepEqual(
      source.selectPuzzlesExcludingThemes({
        mode: "standard",
        minRating: 800,
        maxRating: 1000,
        limit: 2
      }, ["fork", "pin"]).map((puzzle) => puzzle.id),
      ["mixed-1", "mixed-2"]
    );
  } finally {
    packDb.close();
  }
});

test("SQLitePuzzlePackSource resolves nested Rating bands in one deep selection", () => {
  const ratedPuzzle = (
    id: string,
    themes: string[],
    rating: number
  ): Puzzle => ({
    ...tacticalSelectionPuzzle(id, themes),
    rating
  });
  const packDb = buildPackDatabase([
    ratedPuzzle("fork-narrow-a", ["fork"], 850),
    ratedPuzzle("fork-narrow-b", ["fork"], 950),
    ratedPuzzle("fork-wide", ["fork"], 1_050),
    ratedPuzzle("mixed-narrow-a", ["sacrifice"], 850),
    ratedPuzzle("mixed-narrow-b", ["deflection"], 950),
    ratedPuzzle("mixed-wide", ["clearance"], 1_050)
  ]);
  try {
    const source = new SQLitePuzzlePackSource(
      new NodeSqliteDatabase(packDb),
      { candidateMultiplier: 2, candidateFloor: 5 }
    );
    const focused = source.selectPuzzlesForRatingBands({
      filter: {
        mode: "standard",
        limit: 3,
        themes: ["fork"],
        randomSeed: "nested-bands"
      },
      ratingAnchor: 900,
      halfWidths: [100, 200]
    });
    const mixed = source.selectPuzzlesForRatingBands({
      filter: {
        mode: "standard",
        limit: 3,
        randomSeed: "nested-bands-mixed"
      },
      ratingAnchor: 900,
      halfWidths: [100, 200],
      excludedThemes: ["fork"]
    });

    assert.deepEqual(
      focused.map((selection) => [
        selection.halfWidth,
        selection.puzzles.length
      ]),
      [[100, 2], [200, 3]]
    );
    assert.deepEqual(
      mixed.map((selection) => [
        selection.halfWidth,
        selection.puzzles.length
      ]),
      [[100, 2], [200, 3]]
    );
    assert.ok(
      mixed.every((selection) =>
        selection.puzzles.every(
          (puzzle) => !puzzle.themes.includes("fork")
        )
      )
    );
  } finally {
    packDb.close();
  }
});

test("SQLitePuzzlePackSource fills mixed quota beyond a large recent-id exclusion set", () => {
  const excluded = Array.from({ length: 1_000 }, (_, index) =>
    tacticalSelectionPuzzle(`excluded-${String(index).padStart(4, "0")}`, ["sacrifice"])
  );
  const available = Array.from({ length: 10 }, (_, index) =>
    tacticalSelectionPuzzle(`survivor-${String(index).padStart(2, "0")}`, ["deflection"])
  );
  const packDb = buildPackDatabase([...excluded, ...available]);
  try {
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb), {
      candidateMultiplier: 2,
      candidateFloor: 5
    });
    const selected = source.selectPuzzlesExcludingThemes({
      mode: "standard",
      minRating: 800,
      maxRating: 1_000,
      limit: 5,
      excludeIds: excluded.map((puzzle) => puzzle.id),
      randomSeed: "large-history"
    }, ["fork"]);

    assert.equal(selected.length, 5);
    assert.ok(selected.every((puzzle) => puzzle.id.startsWith("survivor-")));
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
    const candidateSql = preparedSql.find((sql) => sql.includes("ORDER BY puzzle_themes.rating ASC"));
    assert.ok(candidateSql);
    assert.match(candidateSql, /puzzle_themes\.rating >= \?/);
    assert.match(candidateSql, /ORDER BY puzzle_themes\.rating ASC, puzzle_themes\.puzzle_id ASC/);
    assert.doesNotMatch(candidateSql, /JOIN puzzles/);
    const plan = packDb.prepare(`EXPLAIN QUERY PLAN ${candidateSql}`).all(themeId, 1700, 1900, 10) as Array<{ detail: string }>;
    assert.ok(plan.some((row) => row.detail.includes("puzzle_themes_theme_rating_idx") && row.detail.includes("rating>?")));
    assert.ok(plan.every((row) => !row.detail.includes("SEARCH puzzles")));
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
    const candidateSql = preparedSql.filter((sql) => sql.includes("ORDER BY puzzle_themes.rating ASC"));
    assert.equal(candidateSql.length, 3);
    assert.ok(candidateSql.every((sql) => /puzzle_themes\.theme_id = \?/.test(sql)));
    assert.ok(candidateSql.every((sql) => !/JOIN puzzles/.test(sql)));
    const themeIds = ["crushing", "hangingPiece", "middlegame"].map((theme) =>
      (packDb.prepare("SELECT id FROM themes WHERE name = ?").get(theme) as { id: number }).id
    );
    for (const [index, sql] of candidateSql.entries()) {
      const plan = packDb.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(themeIds[index], 1700, 1900, 10) as Array<{ detail: string }>;
      assert.ok(plan.some((row) => row.detail.includes("puzzle_themes_theme_rating_idx") && row.detail.includes("rating>?")));
      assert.ok(plan.every((row) => !row.detail.includes("SEARCH puzzles")));
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
      arrowDuelEligibility: "all"
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

test("SQLitePuzzlePackSource seeded selection reaches beyond one fixed candidate prefix", () => {
  const packDb = buildPackDatabase(
    Array.from({ length: 2_000 }, (_, index) =>
      samplingPuzzle(index, index % 2 === 0 ? ["fork", "middlegame"] : ["middlegame"])
    )
  );
  try {
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb), {
      arrowDuelEligibility: "all"
    });
    const selectForSeed = (randomSeed: string, themes?: string[]): string[] =>
      source.selectPuzzles({
        mode: "standard",
        limit: 18,
        minRating: 1400,
        maxRating: 1600,
        ...(themes === undefined ? {} : { themes }),
        randomSeed
      }).map((puzzle) => puzzle.id);
    const selectedAcrossSeeds = (themes?: string[]): Set<string> => new Set(
      Array.from({ length: 32 }, (_, seedIndex) => {
        const selected = selectForSeed(`run-${seedIndex}`, themes);
        assert.equal(selected.length, 18);
        assert.equal(new Set(selected).size, selected.length);
        return selected;
      }).flat()
    );

    assert.deepEqual(
      selectForSeed("repeatable-run", ["fork"]),
      selectForSeed("repeatable-run", ["fork"]),
      "the same seed and filter should remain deterministic"
    );

    const unrestricted = selectedAcrossSeeds();
    assert.ok(
      [...unrestricted].some((id) => Number(id.slice("sample-".length)) >= 900),
      "different seeds should reach eligible puzzles beyond the first 900 rows"
    );

    const fork = selectedAcrossSeeds(["fork"]);
    assert.ok(
      [...fork].some((id) => Number(id.slice("sample-".length)) >= 1800),
      "themed selection should reach beyond the first 900 matching theme rows"
    );
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

test("PackBackedPracticeStore includes Timeout in post-session mistake Review", async () => {
  const packDb = buildPackDatabase(await loadFixturePuzzles());
  const userStore = new SQLiteStore(":memory:");
  try {
    userStore.migrate();
    const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(packDb), {
      arrowDuelEligibility: "all"
    });
    const service = new PracticeService(new PackBackedPracticeStore(userStore, source));
    const sprint = service.startSprint({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 2,
      maxMistakes: 3,
      puzzleSelectionSeed: "pack-timeout"
    }, "2026-07-25T00:00:00.000Z");
    const timedOutPuzzleId = sprint.currentPuzzle?.puzzle.id;

    const timedOut = service.advanceSprintTime("2026-07-25T00:01:00.000Z");

    assert.equal(timedOut.attempt?.result, "timed_out");
    assert.deepEqual(
      service.getSessionMistakeReview(sprint.id).map((item) => item.puzzle.id),
      [timedOutPuzzleId]
    );
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

    const choice = service.submitMove(fixture.correctMove, "2026-07-16T12:00:01.000Z");
    assert.equal(choice.attempt, undefined);
    assert.equal(choice.state.currentPuzzle?.kind, "arrow_duel");
    assert.equal(choice.state.currentPuzzle?.phase, "reply_handoff");
    service.beginArrowDuelReply("2026-07-16T12:00:02.000Z");
    const result = service.submitMove(
      fixture.puzzle.solutionMoves[1]!,
      "2026-07-16T12:00:03.000Z"
    );

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
      rating_deviation INTEGER NOT NULL,
      stockfish_eval REAL NOT NULL,
      stockfish_bestmove TEXT NOT NULL,
      stockfish_eval_after_first_move REAL NOT NULL,
      arrow_duel_difficulty INTEGER
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
      rating_deviation,
      stockfish_eval,
      stockfish_bestmove,
      stockfish_eval_after_first_move,
      arrow_duel_difficulty
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        puzzle.ratingDeviation ?? 100,
        puzzle.stockfishEval ?? 0,
        puzzle.stockfishBestMove ?? "",
        puzzle.stockfishEvalAfterFirstMove ?? 0,
        puzzle.arrowDuelDifficulty ?? null
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

function buildBinaryPackDatabase(puzzles: Puzzle[]): DatabaseSync {
  const db = buildPackDatabase(puzzles);
  db.exec(`
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
  const update = db.prepare(`
    UPDATE puzzles
    SET initial_fen = ?, solution_moves = ?, stockfish_bestmove = ?
    WHERE id = ?
  `);
  for (const puzzle of puzzles) {
    update.run(
      encodePuzzlePosition(puzzle.initialFen),
      encodeUciMoveLine(puzzle.solutionMoves),
      encodeUciMove(puzzle.stockfishBestMove ?? ""),
      puzzle.id
    );
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

function tacticalSelectionPuzzle(id: string, themes: string[]): Puzzle {
  return {
    id,
    initialFen: "8/8/8/8/8/8/4K3/6k1 w - - 0 1",
    solutionMoves: ["e2e3"],
    rating: 900,
    ratingDeviation: 80,
    themes,
    source: "synthetic",
    stockfishEval: 0,
    stockfishBestMove: id,
    stockfishEvalAfterFirstMove: 0
  };
}

function arrowDuelPuzzle(
  overrides: Pick<
    Puzzle,
    | "id"
    | "initialFen"
    | "solutionMoves"
    | "stockfishBestMove"
    | "stockfishEval"
    | "stockfishEvalAfterFirstMove"
  >
): Puzzle {
  return {
    ...overrides,
    rating: 1500,
    themes: ["tactics"],
    source: "synthetic"
  };
}

function samplingPuzzle(index: number, themes: string[]): Puzzle {
  return {
    id: `sample-${index.toString().padStart(4, "0")}`,
    initialFen: `synthetic-position-${index}`,
    solutionMoves: ["a2a3"],
    rating: 1500,
    themes,
    source: "synthetic",
    stockfishEval: 0,
    stockfishBestMove: "a2a4",
    stockfishEvalAfterFirstMove: 300
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
