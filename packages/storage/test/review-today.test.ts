import test from "node:test";
import assert from "node:assert/strict";
import type {
  Puzzle,
  ReviewQueueState
} from "../../core/src/index.ts";
import {
  buildReviewTodayPresentation,
  filterReviewTodayPresentation,
  type CompletedReviewItem
} from "../src/review-today.ts";
import type { AttemptHistoryRow } from "../src/query-types.ts";

process.env.TZ = "UTC";

const NOW = "2026-07-18T18:00:00.000Z";
const PUZZLE: Puzzle = {
  id: "review-one",
  initialFen: "8/8/8/8/8/8/8/K6k w - - 0 1",
  solutionMoves: ["a1a2"],
  rating: 1000,
  themes: ["endgame"],
  source: "synthetic"
};

test("Review Today derives attempts, misses, and retry activity from matching history", () => {
  const context = reviewState({
    puzzleId: PUZZLE.id,
    mode: "arrow_duel",
    ratingKey: "arrow_duel 5/30",
    dueDay: "2026-07-18",
    reviewCount: 2,
    lastReviewedAt: "2026-07-15T15:00:08.000Z"
  });
  const presentation = buildReviewTodayPresentation({
    now: NOW,
    dueItems: [{ puzzle: PUZZLE, review: context }],
    completedItems: [],
    reviews: [context],
    attempts: [
      attempt("initial-miss", "sprint", "wrong", "2026-07-13T12:00:00.000Z", context),
      attempt("failed-retry", "scheduled_review", "wrong", "2026-07-14T15:00:08.000Z", context),
      attempt("successful-retry", "scheduled_review", "correct", "2026-07-15T15:00:08.000Z", context)
    ]
  });

  assert.deepEqual(presentation.dueItems[0]?.history, {
    attemptCount: 3,
    missCount: 2,
    activity: {
      kind: "last_retry",
      at: "2026-07-15T15:00:08.000Z"
    }
  });
  assert.equal(presentation.dueItems[0]?.overdue, false);
});

test("Review Today reports the first miss when a scheduled item has never been retried", () => {
  const context = reviewState({
    puzzleId: PUZZLE.id,
    dueDay: "2026-07-18",
    lastReviewedAt: "2026-07-17T12:00:00.000Z"
  });
  const presentation = buildReviewTodayPresentation({
    now: NOW,
    dueItems: [{ puzzle: PUZZLE, review: context }],
    completedItems: [],
    reviews: [context],
    attempts: [attempt("first-miss", "sprint", "timed_out", "2026-07-17T12:00:00.000Z", context)]
  });

  assert.deepEqual(presentation.dueItems[0]?.history, {
    attemptCount: 1,
    missCount: 1,
    activity: {
      kind: "first_missed",
      at: "2026-07-17T12:00:00.000Z"
    }
  });
});

test("Review Today preserves whether a review completed today had already become overdue", () => {
  const context = reviewState({
    puzzleId: PUZZLE.id,
    dueDay: "2026-07-19",
    reviewCount: 2,
    lastReviewedAt: "2026-07-18T15:00:08.000Z"
  });
  const completedAttempt = attempt(
    "overdue-completion",
    "scheduled_review",
    "correct",
    "2026-07-18T15:00:08.000Z",
    context
  );
  const completedItem: CompletedReviewItem = { attempt: completedAttempt, puzzle: PUZZLE };
  const presentation = buildReviewTodayPresentation({
    now: NOW,
    dueItems: [],
    completedItems: [completedItem],
    reviews: [],
    attempts: [
      attempt("initial-miss", "sprint", "wrong", "2026-07-13T12:00:00.000Z", context),
      attempt("failed-retry", "scheduled_review", "wrong", "2026-07-14T15:00:08.000Z", context),
      completedAttempt
    ]
  });

  assert.equal(presentation.completedItems[0]?.overdue, true);
  assert.deepEqual(presentation.completedItems[0]?.history, {
    attemptCount: 3,
    missCount: 2,
    activity: {
      kind: "last_retry",
      at: "2026-07-18T15:00:08.000Z"
    }
  });
  assert.equal(
    filterReviewTodayPresentation(presentation, "overdue").completedItems[0]?.item.attempt.id,
    "overdue-completion"
  );
});

test("Review Today applies the same four quick filters to due and completed sections", () => {
  const standardReview = reviewState({ puzzleId: "standard", dueDay: "2026-07-17" });
  const arrowReview = reviewState({
    puzzleId: "arrow",
    mode: "arrow_duel",
    ratingKey: "arrow_duel 5/30",
    dueDay: "2026-07-18"
  });
  const standardPuzzle = { ...PUZZLE, id: "standard" };
  const arrowPuzzle = { ...PUZZLE, id: "arrow" };
  const completedAttempt = attempt(
    "completed-arrow",
    "scheduled_review",
    "correct",
    "2026-07-18T15:00:08.000Z",
    arrowReview
  );
  const presentation = buildReviewTodayPresentation({
    now: NOW,
    dueItems: [
      { puzzle: standardPuzzle, review: standardReview },
      { puzzle: arrowPuzzle, review: arrowReview }
    ],
    completedItems: [{ puzzle: arrowPuzzle, attempt: completedAttempt }],
    reviews: [standardReview, arrowReview],
    attempts: [
      attempt("standard-miss-1", "sprint", "wrong", "2026-07-15T12:00:00.000Z", standardReview),
      attempt("standard-miss-2", "sprint", "wrong", "2026-07-16T12:00:00.000Z", standardReview),
      attempt("arrow-miss", "sprint", "wrong", "2026-07-17T12:00:00.000Z", arrowReview),
      completedAttempt
    ]
  });

  assert.deepEqual(
    filterReviewTodayPresentation(presentation, "all").dueItems.map((entry) => entry.item.puzzle.id),
    ["standard", "arrow"]
  );
  assert.deepEqual(
    filterReviewTodayPresentation(presentation, "overdue").dueItems.map((entry) => entry.item.puzzle.id),
    ["standard"]
  );
  assert.deepEqual(
    filterReviewTodayPresentation(presentation, "missed_twice").dueItems.map((entry) => entry.item.puzzle.id),
    ["standard"]
  );
  assert.deepEqual(
    filterReviewTodayPresentation(presentation, "arrow_duel").dueItems.map((entry) => entry.item.puzzle.id),
    ["arrow"]
  );
  assert.deepEqual(
    filterReviewTodayPresentation(presentation, "arrow_duel").completedItems.map((entry) => entry.item.puzzle.id),
    ["arrow"]
  );
});

function reviewState(overrides: Partial<ReviewQueueState>): ReviewQueueState {
  return {
    puzzleId: PUZZLE.id,
    mode: "standard",
    ratingKey: "standard 5/20",
    dueDay: "2026-07-18",
    intervalDays: 1,
    reviewCount: 0,
    successStreak: 0,
    lapseCount: 0,
    lastResult: "wrong",
    lastReviewedAt: "2026-07-17T12:00:00.000Z",
    ...overrides
  };
}

function attempt(
  id: string,
  source: AttemptHistoryRow["source"],
  result: AttemptHistoryRow["result"],
  completedAt: string,
  context: Pick<ReviewQueueState, "puzzleId" | "mode" | "ratingKey">
): AttemptHistoryRow {
  return {
    id,
    source,
    sessionId: `${source}-${id}`,
    puzzleId: context.puzzleId,
    mode: context.mode,
    ratingKey: context.ratingKey,
    result,
    expectedMove: "a1a2",
    startedAt: new Date(new Date(completedAt).getTime() - 5_000).toISOString(),
    completedAt,
    ratingBefore: 1000
  };
}
