import test from "node:test";
import assert from "node:assert/strict";
import { buildSessionReplay } from "../src/index.ts";
import type {
  AttemptEvent,
  Puzzle,
  ReviewQueueState
} from "../src/index.ts";

test("buildSessionReplay returns one ordered item for each Unclear or in-Review Sprint attempt", () => {
  const sharedContext = review({
    puzzleId: "p2",
    mode: "standard",
    ratingKey: "standard 5/20"
  });
  const items = buildSessionReplay({
    sessionId: "s1",
    attempts: [
      attempt({
        id: "review-only",
        puzzleId: "p3",
        completedAt: "2026-06-20T00:00:30.000Z"
      }),
      attempt({
        id: "both",
        puzzleId: "p2",
        unclear: true,
        completedAt: "2026-06-20T00:00:20.000Z"
      }),
      attempt({
        id: "unclear-only",
        puzzleId: "p1",
        unclear: true,
        completedAt: "2026-06-20T00:00:10.000Z"
      }),
      attempt({
        id: "neither",
        puzzleId: "p4",
        completedAt: "2026-06-20T00:00:40.000Z"
      })
    ],
    puzzles: [puzzle("p1"), puzzle("p2"), puzzle("p3"), puzzle("p4")],
    reviewQueue: [
      sharedContext,
      review({
        puzzleId: "p3",
        mode: "standard",
        ratingKey: "standard 5/20"
      })
    ]
  });

  assert.deepEqual(
    items.map((item) => [item.attempt.id, item.inReview]),
    [
      ["unclear-only", false],
      ["both", true],
      ["review-only", true]
    ]
  );
});

test("buildSessionReplay matches Review membership by exact puzzle, mode, and Rating context", () => {
  const items = buildSessionReplay({
    sessionId: "s1",
    attempts: [
      attempt({ id: "mode-mismatch", puzzleId: "p1", mode: "blitz" }),
      attempt({ id: "rating-mismatch", puzzleId: "p2", ratingKey: "standard 3/10" }),
      attempt({ id: "exact", puzzleId: "p3" })
    ],
    puzzles: [puzzle("p1"), puzzle("p2"), puzzle("p3")],
    reviewQueue: [
      review({ puzzleId: "p1", mode: "standard", ratingKey: "standard 5/20" }),
      review({ puzzleId: "p2", mode: "standard", ratingKey: "standard 5/20" }),
      review({ puzzleId: "p3", mode: "standard", ratingKey: "standard 5/20" })
    ]
  });

  assert.deepEqual(items.map((item) => item.attempt.id), ["exact"]);
});

test("buildSessionReplay ignores invalid Unclear flags and attempts outside the requested Sprint", () => {
  const items = buildSessionReplay({
    sessionId: "s1",
    attempts: [
      attempt({ id: "wrong-unclear", puzzleId: "p1", result: "wrong", unclear: true }),
      attempt({ id: "other-session", puzzleId: "p2", sessionId: "other", unclear: true }),
      attempt({ id: "scheduled-review", puzzleId: "p3", source: "scheduled_review", unclear: true }),
      attempt({ id: "missing-puzzle", puzzleId: "missing", unclear: true })
    ],
    puzzles: [puzzle("p1"), puzzle("p2"), puzzle("p3")],
    reviewQueue: []
  });

  assert.deepEqual(items, []);
});

test("buildSessionReplay de-duplicates repeated attempt rows without collapsing distinct attempts", () => {
  const first = attempt({
    id: "same-attempt",
    puzzleId: "p1",
    unclear: true,
    completedAt: "2026-06-20T00:00:10.000Z"
  });
  const items = buildSessionReplay({
    sessionId: "s1",
    attempts: [
      first,
      { ...first },
      attempt({
        id: "later-attempt",
        puzzleId: "p1",
        unclear: true,
        completedAt: "2026-06-20T00:00:20.000Z"
      })
    ],
    puzzles: [puzzle("p1")],
    reviewQueue: []
  });

  assert.deepEqual(items.map((item) => item.attempt.id), ["same-attempt", "later-attempt"]);
});

function attempt(
  input: Partial<AttemptEvent> & Pick<AttemptEvent, "id" | "puzzleId">
): AttemptEvent {
  return {
    id: input.id,
    source: input.source ?? "sprint",
    sessionId: input.sessionId ?? "s1",
    puzzleId: input.puzzleId,
    mode: input.mode ?? "standard",
    ratingKey: input.ratingKey ?? "standard 5/20",
    result: input.result ?? "correct",
    submittedMove: "a1a2",
    expectedMove: "a1a2",
    startedAt: input.startedAt ?? "2026-06-20T00:00:00.000Z",
    completedAt: input.completedAt ?? "2026-06-20T00:00:10.000Z",
    ratingBefore: input.ratingBefore ?? 600,
    ...(input.unclear === undefined ? {} : { unclear: input.unclear })
  };
}

function review(
  context: Pick<ReviewQueueState, "puzzleId" | "mode" | "ratingKey">
): ReviewQueueState {
  return {
    ...context,
    dueDay: "2026-06-21",
    intervalDays: 1,
    reviewCount: 0,
    successStreak: 0,
    lapseCount: 0,
    lastResult: null,
    lastReviewedAt: null,
    enrolledAt: "2026-06-20T00:00:00.000Z"
  };
}

function puzzle(id: string): Puzzle {
  return {
    id,
    initialFen: "8/8/8/8/8/8/8/K6k w - - 0 1",
    solutionMoves: ["a1a2"],
    rating: 900,
    themes: [],
    source: "lichess"
  };
}
