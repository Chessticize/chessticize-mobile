import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SQLitePuzzlePackSource } from "../packages/storage/src/sqlite-puzzle-pack-source.ts";
import { NodeSqliteDatabase } from "../packages/storage/src/sqlite-store.ts";

const packPath = resolve(process.argv[2] ?? "fixtures/puzzles/bundled-core-pack.sqlite");
const iterations = Number.parseInt(process.env.BENCHMARK_ITERATIONS ?? "50", 10);
const limit = 18;
const rating = 1500;
const cases = [
  { name: "one-theme", themes: ["fork"] },
  { name: "five-themes", themes: ["mate", "endgame", "fork", "pin", "skewer"] }
];

if (!existsSync(packPath)) {
  throw new Error(`Puzzle pack not found at ${packPath}. Run pnpm fetch:core-pack first.`);
}
if (!Number.isInteger(iterations) || iterations < 1) {
  throw new Error("BENCHMARK_ITERATIONS must be a positive integer");
}

const database = new DatabaseSync(packPath, { readOnly: true });
try {
  const source = new SQLitePuzzlePackSource(new NodeSqliteDatabase(database), {
    allPuzzlesArrowDuelEligible: true
  });
  const results = cases.map((benchmarkCase) => benchmarkSelection(source, benchmarkCase));
  const oneTheme = results[0];
  const fiveThemes = results[1];
  const plan = indexedThemePlan(database, cases[1].themes[0]);

  process.stdout.write(`${JSON.stringify({
    packPath,
    puzzleCount: source.countPuzzles(),
    iterations,
    input: { limit, rating },
    results,
    fiveToOneMedianRatio: round(fiveThemes.selection.medianMs / oneTheme.selection.medianMs),
    queryPlan: {
      usesCompositeThemeIndex: plan.some((detail) => detail.includes("puzzle_themes_theme_rating_idx")),
      usesTemporarySort: plan.some((detail) => detail.includes("TEMP B-TREE")),
      details: plan
    }
  }, null, 2)}\n`);
} finally {
  database.close();
}

function benchmarkSelection(source, benchmarkCase) {
  for (let index = 0; index < 5; index += 1) {
    select(source, benchmarkCase, `warm-${index}`);
  }
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    const puzzles = select(source, benchmarkCase, `sample-${index}`);
    samples.push(performance.now() - startedAt);
    if (puzzles.length !== limit) {
      throw new Error(`${benchmarkCase.name} returned ${puzzles.length} puzzles; expected ${limit}`);
    }
  }
  samples.sort((left, right) => left - right);

  const countStartedAt = performance.now();
  const availability = source.countPuzzles({
    mode: "custom",
    limit,
    rating,
    themes: benchmarkCase.themes
  });
  const countMs = performance.now() - countStartedAt;

  return {
    name: benchmarkCase.name,
    themes: benchmarkCase.themes,
    selection: {
      medianMs: round(percentile(samples, 0.5)),
      p95Ms: round(percentile(samples, 0.95)),
      minMs: round(samples[0]),
      maxMs: round(samples.at(-1))
    },
    cappedAvailability: {
      count: availability,
      maximum: limit,
      durationMs: round(countMs)
    }
  };
}

function select(source, benchmarkCase, randomSeed) {
  return source.selectPuzzles({
    mode: "custom",
    limit,
    rating,
    themes: benchmarkCase.themes,
    randomSeed
  });
}

function indexedThemePlan(database, theme) {
  const themeId = database.prepare("SELECT id FROM themes WHERE name = ?").get(theme)?.id;
  if (themeId === undefined) {
    throw new Error(`Theme ${theme} is missing from the puzzle pack`);
  }
  return database.prepare(`
    EXPLAIN QUERY PLAN
    SELECT puzzles.*
    FROM puzzle_themes JOIN puzzles ON puzzles.id = puzzle_themes.puzzle_id
    WHERE puzzle_themes.theme_id = ?
      AND puzzle_themes.rating >= ?
      AND puzzle_themes.rating <= ?
    ORDER BY puzzle_themes.rating ASC, puzzle_themes.puzzle_id ASC
    LIMIT ?
  `).all(themeId, rating - 100, rating + 100, limit * 50).map((row) => row.detail);
}

function percentile(sorted, percentileValue) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)];
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
