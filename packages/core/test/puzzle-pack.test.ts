import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildPuzzlePackManifest } from "../src/index.ts";
import type { Puzzle, PuzzlePackManifest } from "../src/index.ts";

test("bundled core puzzle pack manifest matches the shipped puzzle artifact", () => {
  const manifest = readBundledManifest();
  if (manifest.format === "sqlite") {
    const summary = readSqlitePackSummary();

    assert.equal(manifest.puzzleCount, summary.puzzleCount);
    assert.equal(manifest.arrowDuelCount, manifest.puzzleCount);
    assert.equal(manifest.rating.min, summary.minRating);
    assert.equal(manifest.rating.max, summary.maxRating);
    assert.equal(manifest.packFileBytes, summary.bytes);
    assert.equal(manifest.packFileHash, `sha256:${summary.sha256}`);
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

function readSqlitePackSummary(): { puzzleCount: number; minRating: number; maxRating: number; bytes: number; sha256: string } {
  const path = resolve("fixtures/puzzles/bundled-core-pack.sqlite");
  const db = new DatabaseSync(path);
  try {
    const row = db.prepare("SELECT COUNT(*) AS puzzleCount, MIN(rating) AS minRating, MAX(rating) AS maxRating FROM puzzles").get() as {
      puzzleCount: number;
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
