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

  const sprint = service.startSprint(
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
  assert.equal(service.getActiveSprint()?.id, sprint.id);
  service.submitMove("e6e7", "2026-06-20T00:00:05.000Z");
  service.submitMove("b3c1", "2026-06-20T00:00:10.000Z");
  const result = service.submitMove("h6c1", "2026-06-20T00:00:15.000Z");

  assert.equal(result.state.status, "won");
  assert.equal(service.getActiveSprint(), undefined);
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

test("MemoryStore does not select duplicate puzzle positions for one sprint", async () => {
  const store = new MemoryStore();
  const puzzles = await loadFixturePuzzles();
  store.seedPuzzles([
    puzzles[0] as Puzzle,
    {
      ...(puzzles[0] as Puzzle),
      id: "00008-copy",
      initialFen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 37 91"
    },
    puzzles[1] as Puzzle
  ]);

  const selected = store.selectPuzzles({ mode: "standard", limit: 3 });

  assert.deepEqual(selected.map((puzzle) => puzzle.id), ["000hf", "00008"]);
});

test("MemoryStore supports deterministic seeded random puzzle selection", () => {
  const store = new MemoryStore();
  store.seedPuzzles(Array.from({ length: 12 }, (_, index) => simplePuzzle(`random-${index.toString().padStart(2, "0")}`)));

  assert.deepEqual(
    store.selectPuzzles({ mode: "standard", limit: 5 }).map((puzzle) => puzzle.id),
    ["random-00", "random-01", "random-02", "random-03", "random-04"]
  );

  const firstSeed = store.selectPuzzles({ mode: "standard", limit: 5, randomSeed: "seed-a" }).map((puzzle) => puzzle.id);
  const sameSeed = store.selectPuzzles({ mode: "standard", limit: 5, randomSeed: "seed-a" }).map((puzzle) => puzzle.id);
  const differentSeed = store.selectPuzzles({ mode: "standard", limit: 5, randomSeed: "seed-b" }).map((puzzle) => puzzle.id);

  assert.deepEqual(firstSeed, sameSeed);
  assert.notDeepEqual(firstSeed, differentSeed);
});

test("PracticeService selects standard sprint puzzles from the current run ELO window", async () => {
  const store = new MemoryStore();
  store.seedPuzzles(await loadFixturePuzzles());
  store.saveRating({ key: "standard 5/20", generation: 0, rating: 1800, games: 3 });
  const service = new PracticeService(store);

  const sprint = service.startSprint(
    { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 1, maxMistakes: 3 },
    "2026-06-20T00:00:00.000Z"
  );

  assert.equal(sprint.currentPuzzle?.puzzle.id, "00008");
});

test("PracticeService exposes current-session mistake review items from MemoryStore", async () => {
  const store = new MemoryStore();
  store.seedPuzzles(await loadFixturePuzzles());
  const service = new PracticeService(store);

  const sprint = service.startSprint(
    { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
    "2026-06-20T00:00:00.000Z"
  );
  const result = service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");

  assert.equal(result.state.status, "failed");
  assert.equal(store.listAttempts({ sessionId: sprint.id, result: "wrong" }).length, 1);
  const review = service.getSessionMistakeReview(sprint.id);
  assert.equal(review.length, 1);
  assert.equal(review[0]?.puzzle.id, "000hf");
  assert.equal(review[0]?.attempt.submittedMove, "c4b5");
});

test("PracticeService builds MemoryStore history view for a required time range and rating key", async () => {
  const store = new MemoryStore();
  store.seedPuzzles(await loadFixturePuzzles());
  const service = new PracticeService(store);

  assert.deepEqual(service.listPlayedRatings(), []);

  service.startSprint(
    { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
    "2026-06-20T00:00:00.000Z"
  );
  service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");

  const view = service.getHistoryView({
    now: "2026-06-21T00:00:00.000Z",
    timeRange: "7d",
    ratingKey: "standard 5/20",
    result: "wrong",
    theme: "mate"
  });

  assert.equal(view.attempts.length, 1);
  assert.equal(view.attempts[0]?.ratingKey, "standard 5/20");
  assert.equal(view.attempts[0]?.puzzleId, "000hf");
  assert.equal(view.attempts[0]?.puzzleRating, 1485);
  assert.equal(service.getHistoryView({ ...view.query, maxRating: 1485 }).attempts.length, 1);
  assert.equal(service.getHistoryView({ ...view.query, minRating: 1486 }).attempts.length, 0);
  assert.ok(view.availableThemes.includes("mate"));
  assert.equal(view.elo.length, 1);
  assert.deepEqual(view.puzzleStats, [
    {
      puzzleId: "000hf",
      correctCount: 0,
      wrongCount: 1,
      lastWrongAt: "2026-06-20T00:00:05.000Z",
      nextReviewAt: "2026-06-21T00:00:05.000Z"
    }
  ]);

  assert.deepEqual(
    service.listPlayedRatings().map((rating) => rating.key),
    ["standard 5/20"]
  );
  service.resetRating("standard 5/20");
  assert.deepEqual(
    service.listPlayedRatings().map((rating) => rating.key),
    ["standard 5/20"]
  );
  assert.equal(service.getHistoryView({ ...view.query, side: view.attempts[0]?.side === "white" ? "black" : "white" }).attempts.length, 0);
  assert.equal(service.getDueReviewItems("2026-06-21T00:00:05.000Z")[0]?.puzzle.id, "000hf");
});

test("PracticeService clears MemoryStore local history without resetting ratings or puzzles", async () => {
  const store = new MemoryStore();
  store.seedPuzzles(await loadFixturePuzzles());
  const service = new PracticeService(store);

  service.startSprint(
    { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
    "2026-06-20T00:00:00.000Z"
  );
  service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");

  assert.equal(store.countPuzzles(), 4);
  assert.equal((service.listHistory({ result: "wrong" }) as unknown[]).length, 1);
  assert.equal(service.getDueReviewItems("2026-06-21T00:00:05.000Z").length, 1);
  const exported = service.exportLocalData();
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.attempts.length, 1);
  assert.equal(exported.reviewQueue.length, 1);
  assert.equal(exported.sprintSessions.length, 1);
  assert.deepEqual(exported.ratings.map((rating) => rating.key), ["standard 5/20"]);
  const ratingBefore = service.getRating("standard 5/20");

  const result = service.clearLocalHistory();

  assert.deepEqual(result, {
    attempts: 1,
    reviewEvents: 0,
    reviewQueue: 1,
    sprintSessions: 1
  });
  assert.equal(store.countPuzzles(), 4);
  assert.deepEqual(service.listHistory(), []);
  assert.deepEqual(service.getDueReviewItems("2026-06-21T00:00:05.000Z"), []);
  assert.deepEqual(service.getHistoryView({
    now: "2026-06-21T00:00:00.000Z",
    timeRange: "max",
    ratingKey: "standard 5/20"
  }).attempts, []);
  assert.deepEqual(service.getRating("standard 5/20"), ratingBefore);
});

test("PracticeService manually adjusts MemoryStore ratings behind the service boundary", async () => {
  const store = new MemoryStore();
  const service = new PracticeService(store);

  const adjusted = service.setRating("standard 5/20", 725);

  assert.equal(adjusted.rating, 725);
  assert.equal(adjusted.generation, 1);
  assert.equal(service.getRating("standard 5/20").rating, 725);
  assert.throws(() => service.setRating("standard 5/20", 599), /at least 600/);
  assert.throws(() => service.setRating("standard 5/20", 700.5), /integer/);
});

test("PracticeService records official MemoryStore reviews in history without mixing queue contexts", async () => {
  const store = new MemoryStore();
  store.seedPuzzles(await loadFixturePuzzles());
  const service = new PracticeService(store);

  service.startSprint(
    { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
    "2026-06-20T00:00:00.000Z"
  );
  service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");

  service.recordReviewAttempt({
    puzzleId: "000hf",
    mode: "standard",
    ratingKey: "standard 5/20",
    result: "correct",
    submittedMove: "c4b5",
    expectedMove: "c4b5",
    startedAt: "2026-06-21T00:00:00.000Z"
  }, "2026-06-21T00:00:05.000Z");

  const all = service.getHistoryView({
    now: "2026-06-22T00:00:00.000Z",
    timeRange: "7d",
    ratingKey: "standard 5/20"
  });
  assert.deepEqual(all.attempts.map((attempt) => attempt.source), ["scheduled_review", "sprint"]);
  assert.deepEqual(
    service.getHistoryView({ ...all.query, source: "scheduled_review" }).attempts.map((attempt) => attempt.result),
    ["correct"]
  );
  assert.deepEqual(
    service.getHistoryView({ ...all.query, source: "sprint" }).attempts.map((attempt) => attempt.result),
    ["wrong"]
  );
  assert.deepEqual(all.puzzleStats, [
    {
      puzzleId: "000hf",
      correctCount: 1,
      wrongCount: 1,
      lastWrongAt: "2026-06-20T00:00:05.000Z",
      nextReviewAt: "2026-06-24T00:00:05.000Z"
    }
  ]);

  store.recordReviewResult({ puzzleId: "000hf", mode: "arrow_duel", ratingKey: "arrow duel 5/30" }, "wrong", "2026-06-21T00:01:00.000Z");
  assert.deepEqual(
    store.getDueReviews("2026-06-25T00:00:00.000Z").map((review) => `${review.puzzleId}:${review.mode}:${review.ratingKey}`).sort(),
    ["000hf:arrow_duel:arrow duel 5/30", "000hf:standard:standard 5/20"]
  );
});

test("PracticeService pages MemoryStore history over all available sprint attempts", async () => {
  const store = new MemoryStore();
  store.seedPuzzles(await loadFixturePuzzles());
  const service = new PracticeService(store);

  service.startSprint(
    { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
    "2026-05-20T00:00:00.000Z"
  );
  service.submitMove("c4b5", "2026-05-20T00:00:05.000Z");
  service.startSprint(
    { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
    "2026-06-20T00:00:00.000Z"
  );
  service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");

  const firstPage = service.getHistoryView({
    now: "2026-06-21T00:00:00.000Z",
    timeRange: "max",
    ratingKey: "standard 5/20",
    page: { limit: 1 }
  });
  assert.deepEqual(firstPage.page, {
    limit: 1,
    offset: 0,
    total: 2,
    hasMore: true
  });
  assert.equal(firstPage.attempts.length, 1);
  assert.equal(firstPage.attempts[0]?.completedAt, "2026-06-20T00:00:05.000Z");

  const secondPage = service.getHistoryView({
    ...firstPage.query,
    page: { limit: 1, offset: 1 }
  });
  assert.deepEqual(secondPage.page, {
    limit: 1,
    offset: 1,
    total: 2,
    hasMore: false
  });
  assert.equal(secondPage.attempts[0]?.completedAt, "2026-05-20T00:00:05.000Z");
});

async function loadFixturePuzzles(): Promise<Puzzle[]> {
  const contents = await readFile(resolve("fixtures/puzzles/presolved-sample.json"), "utf8");
  return JSON.parse(contents) as Puzzle[];
}

function simplePuzzle(id: string): Puzzle {
  const index = Number(id.slice(-2));
  const file = index % 8;
  const rank = index < 8 ? 2 : 3;
  return {
    id,
    initialFen: fenWithWhitePawn(file, rank),
    solutionMoves: ["e2e4"],
    rating: 600,
    themes: ["test"],
    source: "lichess",
    stockfishBestMove: "e2e4"
  };
}

function fenWithWhitePawn(file: number, rank: number): string {
  const rows = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => "1"));
  rows[0]![4] = "k";
  rows[7]![4] = "K";
  rows[8 - rank]![file] = "P";
  return `${rows.map(compactFenRow).join("/")} w - - 0 1`;
}

function compactFenRow(row: string[]): string {
  let output = "";
  let empty = 0;
  for (const cell of row) {
    if (cell === "1") {
      empty += 1;
      continue;
    }
    if (empty > 0) {
      output += String(empty);
      empty = 0;
    }
    output += cell;
  }
  return output + (empty > 0 ? String(empty) : "");
}
