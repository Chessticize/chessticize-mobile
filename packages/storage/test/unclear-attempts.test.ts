import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.TZ = "UTC";

import { MemoryStore, PracticeService, SQLiteStore } from "../src/index.ts";
import type { AttemptEvent, Puzzle } from "../../core/src/index.ts";

test("MemoryStore persists reversible Unclear markers and duplicate-safe manual Review enrollment", () => {
  const store = new MemoryStore();
  const service = new PracticeService(store);
  service.setPuzzleSelectionScope([unclearPuzzle()]);
  store.recordAttempt(forgedScheduledReviewMarker("memory-forged-marker"));
  assert.equal(
    store.listAttempts().find((attempt) => attempt.id === "memory-forged-marker")?.unclear,
    undefined
  );
  const attemptId = completeCorrectStandardAttempt(service);

  const marked = service.setAttemptUnclear(attemptId, true, "2026-07-17T12:00:00.000Z");
  const markedAgain = service.setAttemptUnclear(attemptId, true, "2026-07-17T13:00:00.000Z");
  assert.equal(marked.unclear, true);
  assert.equal(markedAgain.unclearUpdatedAt, "2026-07-17T12:00:00.000Z");
  assert.deepEqual(unclearAttemptIds(service), [attemptId]);

  const context = { puzzleId: "unclear-puzzle", mode: "standard" as const, ratingKey: "standard 5/20" };
  const enrolled = service.enrollReview(context, "2026-07-17T23:30:00.000Z");
  const enrolledAgain = service.enrollReview(context, "2026-07-18T23:30:00.000Z");
  assert.deepEqual(enrolled, enrolledAgain);
  assert.equal(enrolled.dueDay, "2026-07-18");
  assert.equal(enrolled.lastResult, null);
  assert.equal(enrolled.lastReviewedAt, null);
  assert.equal(enrolled.enrolledAt, "2026-07-17T23:30:00.000Z");
  const alternateContext = { puzzleId: "unclear-puzzle", mode: "custom" as const, ratingKey: "fork custom 5/20" };
  service.enrollReview(alternateContext, "2026-07-17T23:30:00.000Z");
  assert.notDeepEqual(service.getReviewQueueState(alternateContext), service.getReviewQueueState(context));
  assert.equal(service.listReviewQueue().length, 2);

  service.setAttemptUnclear(attemptId, false, "2026-07-17T14:00:00.000Z");
  assert.deepEqual(unclearAttemptIds(service), []);
  assert.equal(service.getHistoryView({
    now: "2026-07-18T00:00:00.000Z",
    timeRange: "max"
  }).unclearCount, 0);
});

test("SQLite reopens marked attempts, manual enrollments, and cleared marker state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-unclear-attempt-"));
  const databasePath = join(directory, "practice.sqlite");
  let store: SQLiteStore | undefined;
  try {
    store = new SQLiteStore(databasePath);
    store.migrate();
    let service = new PracticeService(store);
    service.setPuzzleSelectionScope([unclearPuzzle()]);
    store.recordAttempt(forgedScheduledReviewMarker("sqlite-forged-marker"));
    assert.equal(
      store.listAttempts().find((attempt) => attempt.id === "sqlite-forged-marker")?.unclear,
      undefined
    );
    const attemptId = completeCorrectStandardAttempt(service);
    service.setAttemptUnclear(attemptId, true, "2026-07-17T12:00:00.000Z");
    service.enrollReview(
      { puzzleId: "unclear-puzzle", mode: "standard", ratingKey: "standard 5/20" },
      "2026-07-17T23:30:00.000Z"
    );
    store.close();

    store = new SQLiteStore(databasePath);
    store.migrate();
    service = new PracticeService(store);
    assert.deepEqual(unclearAttemptIds(service), [attemptId]);
    assert.equal(service.listReviewQueue()[0]?.enrolledAt, "2026-07-17T23:30:00.000Z");

    const scheduled = service.recordReviewAttempt({
      puzzleId: "unclear-puzzle",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e2e6",
      expectedMove: "e2e6",
      startedAt: "2026-07-18T12:00:00.000Z"
    }, "2026-07-18T12:00:05.000Z");
    assert.equal(scheduled.review.reviewCount, 1);
    assert.equal(scheduled.review.lastResult, "correct");
    assert.equal(scheduled.review.lastReviewedAt, "2026-07-18T12:00:05.000Z");
    assert.throws(
      () => service.setAttemptUnclear(scheduled.attempt.id, true, "2026-07-18T12:01:00.000Z"),
      /Only correct sprint attempts can be marked unclear/
    );

    service.setAttemptUnclear(attemptId, false, "2026-07-17T14:00:00.000Z");
    store.close();

    store = new SQLiteStore(databasePath);
    store.migrate();
    service = new PracticeService(store);
    assert.deepEqual(unclearAttemptIds(service), []);
    const persisted = service.listHistory().find((attempt) => attempt.id === attemptId);
    assert.equal(persisted?.unclear, false);
    assert.equal(persisted?.unclearUpdatedAt, "2026-07-17T14:00:00.000Z");
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

function completeCorrectStandardAttempt(service: PracticeService): string {
  service.startSprint(
    { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 1, maxMistakes: 3 },
    "2026-07-17T11:59:50.000Z"
  );
  service.submitMove("e2e6", "2026-07-17T11:59:55.000Z");
  const result = service.submitMove("e6f7", "2026-07-17T12:00:00.000Z");
  assert.equal(result.attempt?.result, "correct");
  assert.equal(result.attempt?.source, "sprint");
  return result.attempt?.id ?? assert.fail("expected a completed attempt");
}

function unclearAttemptIds(service: PracticeService): string[] {
  const history = service.getHistoryView({
    now: "2026-07-18T00:00:00.000Z",
    timeRange: "max",
    unclear: true
  });
  assert.equal(history.unclearCount, history.attempts.length);
  return history.attempts.map((attempt) => attempt.id);
}

function unclearPuzzle(): Puzzle {
  return {
    id: "unclear-puzzle",
    initialFen: "r1bqk2r/pp1nbNp1/2p1p2p/8/2BP4/1PN3P1/P3QP1P/3R1RK1 b kq - 0 19",
    solutionMoves: ["e8f7", "e2e6", "f7f8", "e6f7"],
    rating: 1485,
    themes: ["mate", "mateIn2", "middlegame", "short"],
    source: "synthetic"
  };
}

function forgedScheduledReviewMarker(id: string): AttemptEvent {
  return {
    id,
    source: "scheduled_review",
    sessionId: `${id}-session`,
    puzzleId: "unclear-puzzle",
    mode: "standard",
    ratingKey: "standard 5/20",
    result: "correct",
    submittedMove: "e6f7",
    expectedMove: "e6f7",
    startedAt: "2026-07-17T12:00:00.000Z",
    completedAt: "2026-07-17T12:00:05.000Z",
    ratingBefore: 1200,
    ratingAfter: 1200,
    unclear: true,
    unclearUpdatedAt: "2026-07-17T12:00:06.000Z"
  };
}
