import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PracticeService, SQLiteStore } from "../src/index.ts";
import type { Puzzle, ReviewContext } from "../../core/src/index.ts";

test("SQLite store seeds fixture puzzles and filters Arrow Duel eligibility", async () => {
  const store = await seededStore();
  try {
    assert.equal(store.countPuzzles(), 4);
    assert.equal(store.getPuzzle("00008")?.stockfishBestMove, "b2b1");

    const arrowPuzzles = store.selectPuzzles({ mode: "arrow_duel", limit: 10 });
    assert.deepEqual(arrowPuzzles.map((puzzle) => puzzle.id).sort(), ["00008", "0018S", "001h8"]);

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
      {
        ...(puzzles[0] as Puzzle),
        id: "00008-copy",
        initialFen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 37 91"
      },
      puzzles[1] as Puzzle
    ]);

    const selected = store.selectPuzzles({ mode: "standard", limit: 3 });

    assert.deepEqual(selected.map((puzzle) => puzzle.id), ["000hf", "00008"]);
  } finally {
    store.close();
  }
});

test("PracticeService selects SQLite sprint puzzles from the current run ELO window", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    store.saveRating({ key: "standard 5/20", generation: 0, rating: 1800, games: 3 });

    const sprint = service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 1, maxMistakes: 3 },
      "2026-06-20T00:00:00.000Z"
    );

    assert.equal(sprint.currentPuzzle?.puzzle.id, "00008");
  } finally {
    store.close();
  }
});

test("PracticeService exposes current-session mistake review items from SQLite history", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
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
  } finally {
    store.close();
  }
});

test("PracticeService builds SQLite history view for a required time range and rating key", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
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

    assert.deepEqual(
      view.ratingKeys.map((rating) => rating.key),
      ["standard 5/20"]
    );
    assert.deepEqual(
      service.listPlayedRatings().map((rating) => rating.key),
      ["standard 5/20"]
    );
    assert.equal(view.attempts.length, 1);
    assert.equal(view.attempts[0]?.ratingKey, "standard 5/20");
    assert.equal(view.attempts[0]?.puzzleId, "000hf");
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

    const oppositeSide = view.attempts[0]?.side === "white" ? "black" : "white";
    assert.equal(service.getHistoryView({ ...view.query, side: oppositeSide }).attempts.length, 0);
    assert.equal(service.getDueReviewItems("2026-06-21T00:00:05.000Z")[0]?.puzzle.id, "000hf");

    service.recordReviewAttempt({
      puzzleId: "000hf",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "c4b5",
      expectedMove: "c4b5",
      startedAt: "2026-06-21T00:00:00.000Z"
    }, "2026-06-21T00:00:05.000Z");
    assert.equal(store.listAttempts({ source: "scheduled_review", result: "correct" }).length, 1);

    service.resetRating("standard 5/20");
    assert.deepEqual(
      service.listPlayedRatings().map((rating) => rating.key),
      ["standard 5/20"]
    );
  } finally {
    store.close();
  }
});

test("PracticeService records official SQLite reviews in history without mixing queue contexts", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
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

    store.recordReviewResult({ puzzleId: "000hf", mode: "arrow_duel", ratingKey: "arrow duel 5/30" }, "wrong", "2026-06-21T00:01:00.000Z");
    assert.deepEqual(
      store.getDueReviews("2026-06-25T00:00:00.000Z").map((review) => `${review.puzzleId}:${review.mode}:${review.ratingKey}`).sort(),
      ["000hf:arrow_duel:arrow duel 5/30", "000hf:standard:standard 5/20"]
    );
  } finally {
    store.close();
  }
});

test("PracticeService pages SQLite history over all available sprint attempts", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
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
    const context = reviewContext("00008");
    store.scheduleMistakeReview(context, "2026-06-20T00:00:00.000Z");

    const success = store.recordReviewResult(context, "correct", "2026-06-21T00:00:00.000Z");
    assert.equal(success.dueAt, "2026-06-24T00:00:00.000Z");
    assert.equal(success.successStreak, 1);

    const wrong = store.recordReviewResult(context, "wrong", "2026-06-22T00:00:00.000Z");
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
    const wrong = store.recordReviewResult(reviewContext("00008"), "wrong", "2026-06-20T00:00:00.000Z");
    assert.equal(wrong.reviewCount, 1);
    assert.equal(wrong.lapseCount, 1);
    assert.equal(wrong.dueAt, "2026-06-21T00:00:00.000Z");

    const correct = store.recordReviewResult(reviewContext("000hf"), "correct", "2026-06-20T00:00:00.000Z");
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
    const result = service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
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

function reviewContext(puzzleId: string): ReviewContext {
  return {
    puzzleId,
    mode: "standard",
    ratingKey: "standard 5/20"
  };
}
