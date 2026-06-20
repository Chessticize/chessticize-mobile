import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PracticeService, SQLiteStore } from "../src/index.ts";
import type { Puzzle } from "../../core/src/index.ts";

test("SQLite store seeds fixture puzzles and filters Arrow Duel eligibility", async () => {
  const store = await seededStore();
  try {
    assert.equal(store.countPuzzles(), 4);
    assert.equal(store.getPuzzle("00008")?.stockfishBestMove, "b2b1");

    const arrowPuzzles = store.selectPuzzles({ mode: "arrow_duel", limit: 10 });
    assert.equal(arrowPuzzles.length, 4);
    assert.equal(arrowPuzzles[0]?.id, "000hf");

    const themePuzzles = store.selectPuzzles({ mode: "standard", limit: 10, theme: "hangingPiece" });
    assert.deepEqual(themePuzzles.map((puzzle) => puzzle.id), ["00008"]);
  } finally {
    store.close();
  }
});

test("SQLite store does not select duplicate puzzle positions for one sprint", async () => {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const puzzles = await loadFixturePuzzles();
  try {
    store.seedPuzzles([
      puzzles[0] as Puzzle,
      { ...(puzzles[0] as Puzzle), id: "00008-copy" },
      puzzles[1] as Puzzle
    ]);

    const selected = store.selectPuzzles({ mode: "standard", limit: 3 });

    assert.deepEqual(selected.map((puzzle) => puzzle.id), ["000hf", "00008"]);
  } finally {
    store.close();
  }
});

test("PracticeService exposes the current rating for the selected sprint run", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    assert.equal(service.getRating("standard 5/20").rating, 600);

    const reset = service.resetRating("standard 5/20") as { generation: number; rating: number };

    assert.equal(reset.rating, 600);
    assert.equal(service.getRating("standard 5/20").generation, 1);
  } finally {
    store.close();
  }
});

test("SQLite review result updates expand and contract the persisted review schedule", async () => {
  const store = await seededStore();
  try {
    store.scheduleMistakeReview("00008", "2026-06-20T00:00:00.000Z");

    const success = store.recordReviewResult("00008", "correct", "2026-06-21T00:00:00.000Z");
    assert.equal(success.dueAt, "2026-06-24T00:00:00.000Z");
    assert.equal(success.successStreak, 1);

    const wrong = store.recordReviewResult("00008", "wrong", "2026-06-22T00:00:00.000Z");
    assert.equal(wrong.dueAt, "2026-06-22T06:00:00.000Z");
    assert.equal(wrong.successStreak, 0);
    assert.equal(wrong.lapseCount, 2);
  } finally {
    store.close();
  }
});

test("SQLite review result without an existing queue row is counted once", async () => {
  const store = await seededStore();
  try {
    const wrong = store.recordReviewResult("00008", "wrong", "2026-06-20T00:00:00.000Z");
    assert.equal(wrong.reviewCount, 1);
    assert.equal(wrong.lapseCount, 1);
    assert.equal(wrong.dueAt, "2026-06-21T00:00:00.000Z");

    const correct = store.recordReviewResult("000hf", "correct", "2026-06-20T00:00:00.000Z");
    assert.equal(correct.reviewCount, 1);
    assert.equal(correct.successStreak, 1);
    assert.equal(correct.dueAt, "2026-06-23T00:00:00.000Z");
  } finally {
    store.close();
  }
});

test("SQLite transaction rolls back partial writes", async () => {
  const store = await seededStore();
  try {
    assert.throws(() => {
      store.transaction(() => {
        store.resetRating("standard 5/20");
        throw new Error("boom");
      });
    }, /boom/);

    assert.equal(store.getRating("standard 5/20").generation, 0);
  } finally {
    store.close();
  }
});

test("PracticeService persists wrong attempts, history filters, review queue, and rating reset generations", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 3 },
      "2026-06-20T00:00:00.000Z"
    );
    const result = service.submitMove("e6e8", "2026-06-20T00:00:05.000Z");
    assert.equal(result.attempt?.result, "wrong");

    const wrongHistory = store.listAttempts({
      result: "wrong",
      since: "2026-06-19T00:00:00.000Z"
    });
    assert.equal(wrongHistory.length, 1);
    assert.equal(wrongHistory[0]?.puzzleId, "000hf");

    const futureDue = store.getDueReviews("2026-06-22T00:00:00.000Z");
    assert.equal(futureDue.length, 1);
    assert.equal(futureDue[0]?.puzzleId, "000hf");

    const rating = store.getRating("standard 5/20");
    const reset = store.resetRating("standard 5/20");
    assert.equal(reset.generation, rating.generation + 1);
    assert.equal(store.listAttempts({ result: "wrong" }).length, 1);
  } finally {
    store.close();
  }
});

test("PracticeService rejects starting a second sprint while one is active", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 3 },
      "2026-06-20T00:00:00.000Z"
    );

    assert.throws(
      () =>
        service.startSprint(
          { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 3 },
          "2026-06-20T00:00:01.000Z"
        ),
      /another sprint is active/
    );
  } finally {
    store.close();
  }
});

test("PracticeService records a completed sprint and persists updated ELO", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    let sprint = service.startSprint(
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
    assert.equal(sprint.currentPuzzle?.puzzle.id, "00008");

    let result = service.submitMove("e6e7", "2026-06-20T00:00:05.000Z");
    assert.equal(result.state.status, "active");
    result = service.submitMove("b3c1", "2026-06-20T00:00:10.000Z");
    assert.equal(result.state.status, "active");
    result = service.submitMove("h6c1", "2026-06-20T00:00:15.000Z");
    assert.equal(result.state.status, "won");

    const rating = store.getRating("hangingPiece standard 5/20");
    assert.ok(rating.rating > 600);
    assert.equal(rating.games, 1);
  } finally {
    store.close();
  }
});

async function seededStore(): Promise<SQLiteStore> {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  store.seedPuzzles(await loadFixturePuzzles());
  return store;
}

async function loadFixturePuzzles(): Promise<Puzzle[]> {
  const contents = await readFile(resolve("fixtures/puzzles/presolved-sample.json"), "utf8");
  return JSON.parse(contents) as Puzzle[];
}
