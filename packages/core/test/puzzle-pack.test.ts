import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildPuzzlePackManifest } from "../src/index.ts";
import type { Puzzle, PuzzlePackManifest } from "../src/index.ts";

test("bundled core puzzle pack manifest matches the shipped puzzle artifact", () => {
  const puzzles = readBundledPuzzles();
  const manifest = readBundledManifest();
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
