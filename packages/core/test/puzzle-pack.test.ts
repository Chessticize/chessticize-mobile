import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  buildPuzzlePackManifest,
  SERVER_CURATED_THEMES,
  tacticalThemeFrequencyAtRating,
  tacticalThemeInventoryUpperBound
} from "../src/index.ts";
import type { Puzzle, PuzzlePackManifest } from "../src/index.ts";

test("bundled core puzzle pack manifest matches the shipped puzzle artifact", (t) => {
  const manifest = readBundledManifest();
  if (manifest.format === "sqlite") {
    if (!existsSync(resolve("fixtures/puzzles/bundled-core-pack.sqlite"))) {
      t.skip("core pack artifact not fetched; run pnpm fetch:core-pack (Mobile iOS CI verifies the real artifact)");
      return;
    }
    const summary = readSqlitePackSummary();

    assert.equal(manifest.puzzleCount, summary.puzzleCount);
    assert.equal(manifest.arrowDuelCount, summary.arrowDuelCount);
    assert.equal(manifest.rating.min, summary.minRating);
    assert.equal(manifest.rating.max, summary.maxRating);
    assert.equal(manifest.packFileBytes, summary.bytes);
    assert.equal(manifest.packFileHash, `sha256:${summary.sha256}`);
    assert.equal(manifest.manifestHash, hashManifest(manifest));
    assert.ok(manifest.seed);
    assert.ok(manifest.ratingBuckets?.length);
    assert.ok(manifest.themeCounts && Object.keys(manifest.themeCounts).length > 0);
    assert.equal(manifest.tacticalAnalysis?.puzzleRatingDeviation, true);
    assert.match(manifest.tacticalAnalysis?.featureHash ?? "", /^sha256:[a-f0-9]{64}$/);
    assert.equal(summary.missingRatingDeviationCount, 0);
    assert.equal(summary.themeCatalogCount, 62);
    assert.equal(summary.endgameThemeId, 20);
    assert.equal(summary.hangingPieceThemeId, 25);
    assert.equal(summary.endgameRelationCount, 0);
    assert.ok(summary.hangingPieceRelationCount > 0);
    assert.equal(summary.relationRatingMismatchCount, 0);
    assert.match(summary.puzzleThemesTableSql, /WITHOUT ROWID$/u);
    assert.deepEqual(
      summary.indexedThemes,
      [...SERVER_CURATED_THEMES].sort()
    );
    assert.deepEqual(manifest.themes, [...SERVER_CURATED_THEMES].sort());
    return;
  }

  const puzzles = readBundledPuzzles();
  const rebuilt = buildPuzzlePackManifest(puzzles, {
    id: manifest.id,
    title: manifest.title,
    buildDate: manifest.buildDate,
    source: manifest.source,
    sourceLicense: manifest.sourceLicense,
    presolve: manifest.presolve,
    licenseNote: manifest.licenseNote,
    manifestHash: manifest.manifestHash
  });

  assert.equal(puzzles.length, 3000);
  assert.equal(manifest.puzzleCount, puzzles.length);
  assert.equal(manifest.rating.min, 600);
  assert.equal(manifest.rating.max, 1600);
  assert.ok(manifest.arrowDuelCount >= 2000);
  assert.ok(manifest.themes.includes("mate"));
  assert.ok(manifest.themes.includes("endgame"));
  assert.ok(manifest.manifestHash.startsWith("sha256:"));
  assert.deepEqual(manifest, rebuilt);
});

test("Tactical Profile frequencies follow the nearest current-Rating bucket", () => {
  const manifest = analysisManifest();

  assert.deepEqual(
    tacticalThemeFrequencyAtRating(manifest, "line", 950),
    { fork: 0.2, pin: 0.05 }
  );
  assert.deepEqual(
    tacticalThemeFrequencyAtRating(manifest, "line", 1_075),
    { fork: 0.05, pin: 0.25 }
  );
  assert.deepEqual(
    tacticalThemeFrequencyAtRating(manifest, "arrow_duel", 1_075),
    { fork: 0.05, pin: 0.25 }
  );
  assert.deepEqual(
    tacticalThemeFrequencyAtRating(
      { ...manifest, arrowDuelCount: manifest.puzzleCount - 1 },
      "arrow_duel",
      1_075
    ),
    {},
    "a partial Arrow Duel inventory needs explicit task-family bucket counts"
  );
});

test("Tactical Profile inventory preflight is a conservative bucket upper bound", () => {
  const manifest = analysisManifest();

  assert.deepEqual(
    tacticalThemeInventoryUpperBound(
      manifest,
      "line",
      975,
      1_025,
      ["fork", "pin", "fork"]
    ),
    {
      availableByTheme: { fork: 25, pin: 30 },
      puzzleCount: 200
    }
  );
  assert.equal(
    tacticalThemeInventoryUpperBound(
      { ...manifest, arrowDuelCount: 50 },
      "arrow_duel",
      900,
      1_099,
      ["fork"]
    ),
    undefined
  );
});

function readBundledPuzzles(): Puzzle[] {
  return JSON.parse(readFileSync(resolve("fixtures/puzzles/bundled-core-pack.json"), "utf8")) as Puzzle[];
}

function readBundledManifest(): PuzzlePackManifest {
  return JSON.parse(readFileSync(resolve("fixtures/puzzles/bundled-core-pack.manifest.json"), "utf8")) as PuzzlePackManifest;
}

function hashManifest(manifest: PuzzlePackManifest): string {
  const canonical = stableJson({ ...manifest, manifestHash: "" });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJsonValue(item)])
    );
  }
  return value;
}

function readSqlitePackSummary(): {
  puzzleCount: number;
  arrowDuelCount: number;
  minRating: number;
  maxRating: number;
  missingRatingDeviationCount: number;
  themeCatalogCount: number;
  endgameThemeId: number;
  hangingPieceThemeId: number;
  endgameRelationCount: number;
  hangingPieceRelationCount: number;
  relationRatingMismatchCount: number;
  puzzleThemesTableSql: string;
  indexedThemes: string[];
  bytes: number;
  sha256: string;
} {
  const path = resolve("fixtures/puzzles/bundled-core-pack.sqlite");
  const db = new DatabaseSync(path);
  try {
    const row = db.prepare(`
      SELECT
        COUNT(*) AS puzzleCount,
        SUM(
          CASE
            WHEN typeof(stockfish_bestmove) = 'blob'
              AND typeof(solution_moves) = 'blob'
              AND SUBSTR(HEX(stockfish_bestmove), 3, 1) = '0'
              AND SUBSTR(HEX(solution_moves), 3, 1) = '0'
            THEN 1
            WHEN typeof(stockfish_bestmove) = 'text'
              AND typeof(solution_moves) = 'text'
              AND LENGTH(TRIM(stockfish_bestmove)) = 4
              AND LENGTH(SUBSTR(TRIM(solution_moves), 1, INSTR(TRIM(solution_moves) || ' ', ' ') - 1)) = 4
            THEN 1
            ELSE 0
          END
        ) AS arrowDuelCount,
        MIN(rating) AS minRating,
        MAX(rating) AS maxRating,
        SUM(CASE WHEN rating_deviation IS NULL THEN 1 ELSE 0 END) AS missingRatingDeviationCount
      FROM puzzles
    `).get() as {
      puzzleCount: number;
      arrowDuelCount: number;
      minRating: number;
      maxRating: number;
      missingRatingDeviationCount: number;
    };
    const bytes = readFileSync(path);
    const themeId = db.prepare(
      "SELECT id FROM themes WHERE name = ?"
    );
    return {
      ...row,
      themeCatalogCount: (db.prepare(
        "SELECT COUNT(*) AS count FROM themes"
      ).get() as { count: number }).count,
      endgameThemeId: (themeId.get("endgame") as { id: number }).id,
      hangingPieceThemeId:
        (themeId.get("hangingPiece") as { id: number }).id,
      endgameRelationCount: (db.prepare(`
        SELECT COUNT(*) AS count
        FROM puzzle_themes
        WHERE theme_id = ?
      `).get((themeId.get("endgame") as { id: number }).id) as {
        count: number;
      }).count,
      hangingPieceRelationCount: (db.prepare(`
        SELECT COUNT(*) AS count
        FROM puzzle_themes
        WHERE theme_id = ?
      `).get((themeId.get("hangingPiece") as { id: number }).id) as {
        count: number;
      }).count,
      relationRatingMismatchCount: (db.prepare(`
        SELECT COUNT(*) AS count
        FROM puzzle_themes
        JOIN puzzles ON puzzles.id = puzzle_themes.puzzle_id
        WHERE puzzle_themes.rating <> puzzles.rating
      `).get() as { count: number }).count,
      puzzleThemesTableSql: (db.prepare(`
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = 'puzzle_themes'
      `).get() as { sql: string }).sql,
      indexedThemes: (db.prepare(`
        SELECT DISTINCT themes.name
        FROM puzzle_themes
        JOIN themes ON themes.id = puzzle_themes.theme_id
        ORDER BY themes.name
      `).all() as Array<{ name: string }>).map((theme) => theme.name),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex")
    };
  } finally {
    db.close();
  }
}

function analysisManifest(): PuzzlePackManifest {
  return {
    id: "analysis-pack",
    title: "Analysis pack",
    buildDate: "2026-07-26",
    source: "test",
    sourceLicense: "test",
    presolve: "test",
    licenseNote: "test",
    manifestHash: "sha256:test",
    puzzleCount: 200,
    rating: { min: 900, max: 1_099 },
    themes: ["fork", "pin"],
    themeCounts: { fork: 25, pin: 30 },
    ratingBuckets: [
      {
        minRating: 900,
        maxRating: 999,
        puzzleCount: 100,
        themeCounts: { fork: 20, pin: 5 },
        matePatternCounts: {}
      },
      {
        minRating: 1_000,
        maxRating: 1_099,
        puzzleCount: 100,
        themeCounts: { fork: 5, pin: 25 },
        matePatternCounts: {}
      }
    ],
    arrowDuelCount: 200
  };
}
