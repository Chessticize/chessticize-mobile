import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildPuzzlePackManifest } from "../src/index.ts";
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
            WHEN LENGTH(TRIM(stockfish_bestmove)) = 4
              AND LENGTH(SUBSTR(TRIM(solution_moves), 1, INSTR(TRIM(solution_moves) || ' ', ' ') - 1)) = 4
            THEN 1
            ELSE 0
          END
        ) AS arrowDuelCount,
        MIN(rating) AS minRating,
        MAX(rating) AS maxRating
      FROM puzzles
    `).get() as {
      puzzleCount: number;
      arrowDuelCount: number;
      minRating: number;
      maxRating: number;
    };
    const bytes = readFileSync(path);
    return {
      ...row,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex")
    };
  } finally {
    db.close();
  }
}
