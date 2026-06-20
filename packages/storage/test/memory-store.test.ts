import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MemoryStore, PracticeService } from "../src/index.ts";
import type { Puzzle } from "../../core/src/index.ts";

test("MemoryStore supports the practice service contract used by the mobile POC", async () => {
  const store = new MemoryStore();
  store.seedPuzzles(await loadFixturePuzzles());
  const service = new PracticeService(store);

  assert.equal(store.countPuzzles(), 4);
  assert.equal(store.getPuzzle("00008")?.stockfishBestMove, "b2b1");
  assert.deepEqual(
    store.selectPuzzles({ mode: "standard", limit: 10, theme: "hangingPiece" }).map((puzzle) => puzzle.id),
    ["00008"]
  );

  service.startSprint(
    {
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 1,
      maxMistakes: 3,
      theme: "hangingPiece"
    },
    "2026-06-20T00:00:00.000Z"
  );
  service.submitMove("e6e7", "2026-06-20T00:00:05.000Z");
  service.submitMove("b3c1", "2026-06-20T00:00:10.000Z");
  const result = service.submitMove("h6c1", "2026-06-20T00:00:15.000Z");

  assert.equal(result.state.status, "won");
  assert.ok((result.state.ratingAfter ?? 0) > 600);
  assert.equal(store.getRating("hangingPiece standard 5/20").games, 1);
  assert.equal(store.listAttempts({ result: "correct" }).length, 1);
});

test("MemoryStore records due reviews for wrong Arrow Duel choices", async () => {
  const store = new MemoryStore();
  store.seedPuzzles(await loadFixturePuzzles());
  const service = new PracticeService(store);

  service.startSprint(
    {
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 1,
      maxMistakes: 3,
      minRating: 1700,
      maxRating: 1800
    },
    "2026-06-20T00:00:00.000Z"
  );
  service.submitMove("f2g3", "2026-06-20T00:00:05.000Z");

  const reviews = store.getDueReviews("2026-06-22T00:00:00.000Z");
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0]?.puzzleId, "00008");
  assert.equal(reviews[0]?.lastResult, "wrong");
});

async function loadFixturePuzzles(): Promise<Puzzle[]> {
  const contents = await readFile(resolve("fixtures/puzzles/presolved-sample.json"), "utf8");
  return JSON.parse(contents) as Puzzle[];
}
