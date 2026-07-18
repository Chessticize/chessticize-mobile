import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.TZ = "UTC";

import { MemoryStore, PracticeService, SQLiteStore } from "../src/index.ts";
import { defaultSprintConfig } from "../../core/src/index.ts";
import type { AttemptEvent, Puzzle, ReviewContext, SprintState } from "../../core/src/index.ts";

const CONTEXT: ReviewContext = {
  puzzleId: "review-control-puzzle",
  mode: "standard",
  ratingKey: "standard 5/20"
};
const ALTERNATE_CONTEXT: ReviewContext = {
  puzzleId: "review-control-puzzle",
  mode: "custom",
  ratingKey: "fork custom 5/20"
};

test("MemoryStore atomically enrolls one Unclear Attempt and preserves other markers", () => {
  const store = seededMemoryStore();
  const service = new PracticeService(store);
  store.recordAttempt(correctAttempt("initiating-attempt"));
  store.recordAttempt(correctAttempt("other-attempt"));
  service.setAttemptUnclear("initiating-attempt", true, "2026-07-17T12:00:00.000Z");
  service.setAttemptUnclear("other-attempt", true, "2026-07-17T12:00:01.000Z");

  const enrolled = service.enrollReview(CONTEXT, "2026-07-17T12:01:00.000Z", "initiating-attempt");

  assert.equal(enrolled.dueDay, "2026-07-18");
  assert.equal(service.listHistory().find((attempt) => attempt.id === "initiating-attempt")?.unclear, false);
  assert.equal(
    service.listHistory().find((attempt) => attempt.id === "initiating-attempt")?.unclearUpdatedAt,
    "2026-07-17T12:01:00.000Z"
  );
  assert.equal(service.listHistory().find((attempt) => attempt.id === "other-attempt")?.unclear, true);

  const duplicate = service.enrollReview(CONTEXT, "2026-07-17T12:02:00.000Z", "initiating-attempt");
  assert.deepEqual(duplicate, enrolled);
  assert.equal(service.listReviewQueue().length, 1);
});

test("MemoryStore rejects a mismatched initiating attempt without changing either state", () => {
  const store = seededMemoryStore();
  const service = new PracticeService(store);
  store.recordAttempt(correctAttempt("wrong-context", ALTERNATE_CONTEXT));
  service.setAttemptUnclear("wrong-context", true, "2026-07-17T12:00:00.000Z");

  assert.throws(
    () => service.enrollReview(CONTEXT, "2026-07-17T12:01:00.000Z", "wrong-context"),
    /same Review Context/
  );
  assert.equal(service.getReviewQueueState(CONTEXT), undefined);
  assert.equal(service.listHistory().find((attempt) => attempt.id === "wrong-context")?.unclear, true);
});

test("MemoryStore removes only one exact context, preserves History, and permits later enrollment", () => {
  const store = seededMemoryStore();
  const service = new PracticeService(store);
  store.recordAttempt(correctAttempt("preserved-attempt"));
  service.enrollReview(CONTEXT, "2026-07-17T12:00:00.000Z");
  service.enrollReview(ALTERNATE_CONTEXT, "2026-07-17T12:00:00.000Z");

  const removed = service.removeReview(CONTEXT, "2026-07-17T12:01:00.000Z");
  const removedAgain = service.removeReview(CONTEXT, "2026-07-17T12:02:00.000Z");

  assert.deepEqual(removedAgain, removed);
  assert.equal(service.getReviewQueueState(CONTEXT), undefined);
  assert.ok(service.getReviewQueueState(ALTERNATE_CONTEXT));
  assert.equal(service.listHistory().some((attempt) => attempt.id === "preserved-attempt"), true);
  assert.deepEqual(service.exportLocalData().reviewRemovals, [removed]);

  const reenrolled = service.enrollReview(CONTEXT, "2026-07-17T12:03:00.000Z");
  assert.equal(reenrolled.dueDay, "2026-07-18");
  assert.deepEqual(service.exportLocalData().reviewRemovals, []);
  assert.equal(service.listReviewQueue().length, 2);
});

test("SQLite commits enrollment and initiating-marker clear together and reopens removal tombstones", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-review-control-"));
  const databasePath = join(directory, "practice.sqlite");
  let store: SQLiteStore | undefined;
  try {
    store = new SQLiteStore(databasePath);
    store.migrate();
    store.seedPuzzles([reviewControlPuzzle()]);
    recordSQLiteAttempt(store, correctAttempt("sqlite-initiating"));
    let service = new PracticeService(store);
    service.setAttemptUnclear("sqlite-initiating", true, "2026-07-17T12:00:00.000Z");
    service.enrollReview(CONTEXT, "2026-07-17T12:01:00.000Z", "sqlite-initiating");
    assert.equal(service.listHistory()[0]?.unclear, false);
    const removed = service.removeReview(CONTEXT, "2026-07-17T12:02:00.000Z");
    store.close();

    store = new SQLiteStore(databasePath);
    store.migrate();
    service = new PracticeService(store);
    assert.equal(service.getReviewQueueState(CONTEXT), undefined);
    assert.deepEqual(service.exportLocalData().reviewRemovals, [removed]);
    assert.equal(service.listHistory().some((attempt) => attempt.id === "sqlite-initiating"), true);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite rolls back both sides when atomic enrollment or removal fails", () => {
  const store = new SQLiteStore(":memory:");
  try {
    store.migrate();
    store.seedPuzzles([reviewControlPuzzle()]);
    recordSQLiteAttempt(store, correctAttempt("sqlite-failure"));
    const service = new PracticeService(store);
    service.setAttemptUnclear("sqlite-failure", true, "2026-07-17T12:00:00.000Z");
    store.db.exec(`
      CREATE TRIGGER fail_review_enrollment_clear
      BEFORE UPDATE OF unclear ON attempts
      BEGIN
        SELECT RAISE(ABORT, 'forced enrollment failure');
      END;
    `);
    assert.throws(
      () => service.enrollReview(CONTEXT, "2026-07-17T12:01:00.000Z", "sqlite-failure"),
      /forced enrollment failure/
    );
    assert.equal(service.getReviewQueueState(CONTEXT), undefined);
    assert.equal(service.listHistory()[0]?.unclear, true);
    store.db.exec("DROP TRIGGER fail_review_enrollment_clear");

    service.enrollReview(CONTEXT, "2026-07-17T12:02:00.000Z");
    store.db.exec(`
      CREATE TRIGGER fail_review_removal
      BEFORE DELETE ON review_queue
      BEGIN
        SELECT RAISE(ABORT, 'forced removal failure');
      END;
    `);
    assert.throws(
      () => service.removeReview(CONTEXT, "2026-07-17T12:03:00.000Z"),
      /forced removal failure/
    );
    assert.ok(service.getReviewQueueState(CONTEXT));
    assert.deepEqual(service.exportLocalData().reviewRemovals, []);
  } finally {
    store.close();
  }
});

function seededMemoryStore(): MemoryStore {
  const store = new MemoryStore();
  store.seedPuzzles([reviewControlPuzzle()]);
  return store;
}

function correctAttempt(id: string, context: ReviewContext = CONTEXT): AttemptEvent {
  return {
    id,
    source: "sprint",
    sessionId: `${id}-session`,
    ...context,
    result: "correct",
    submittedMove: "e6f7",
    expectedMove: "e6f7",
    startedAt: "2026-07-17T11:59:55.000Z",
    completedAt: "2026-07-17T12:00:00.000Z",
    ratingBefore: 600
  };
}

function recordSQLiteAttempt(store: SQLiteStore, attempt: AttemptEvent): void {
  const config = {
    ...defaultSprintConfig(attempt.mode),
    ratingKey: attempt.ratingKey
  };
  const session: SprintState = {
    id: attempt.sessionId,
    config,
    status: "won",
    startedAt: attempt.startedAt,
    deadlineAt: attempt.completedAt,
    completedAt: attempt.completedAt,
    correctCount: 1,
    mistakeCount: 0,
    currentStreak: 1,
    bestStreak: 1,
    hasUserSubmittedMove: true,
    currentPuzzleIndex: 1,
    puzzles: [reviewControlPuzzle()],
    ratingBefore: attempt.ratingBefore,
    ratingAfter: attempt.ratingAfter ?? attempt.ratingBefore
  };
  store.createSprintSession(session);
  store.recordAttempt(attempt);
}

function reviewControlPuzzle(): Puzzle {
  return {
    id: CONTEXT.puzzleId,
    initialFen: "r1bqk2r/pp1nbNp1/2p1p2p/8/2BP4/1PN3P1/P3QP1P/3R1RK1 b kq - 0 19",
    solutionMoves: ["e8f7", "e2e6", "f7f8", "e6f7"],
    rating: 1485,
    themes: ["mate", "mateIn2", "middlegame", "short"],
    source: "synthetic"
  };
}
