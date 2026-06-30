import test from "node:test";
import assert from "node:assert/strict";
import { buildSessionMistakeReview } from "../src/index.ts";
import type { AttemptEvent, Puzzle } from "../src/index.ts";

test("buildSessionMistakeReview returns unique wrong puzzles for one session in play order", () => {
  const items = buildSessionMistakeReview({
    sessionId: "s1",
    attempts: [
      attempt({ id: "a3", sessionId: "s1", puzzleId: "p2", result: "wrong", completedAt: "2026-06-20T00:00:20.000Z" }),
      attempt({ id: "a1", sessionId: "s1", puzzleId: "p1", result: "wrong", completedAt: "2026-06-20T00:00:10.000Z" }),
      attempt({ id: "a2", sessionId: "s1", puzzleId: "p1", result: "wrong", completedAt: "2026-06-20T00:00:12.000Z" }),
      attempt({ id: "a4", sessionId: "s1", puzzleId: "p3", result: "correct", completedAt: "2026-06-20T00:00:30.000Z" }),
      attempt({ id: "a5", sessionId: "other", puzzleId: "p4", result: "wrong", completedAt: "2026-06-20T00:00:40.000Z" })
    ],
    puzzles: [puzzle("p1"), puzzle("p2"), puzzle("p3"), puzzle("p4")]
  });

  assert.deepEqual(
    items.map((item) => [item.puzzle.id, item.attempt.id]),
    [
      ["p1", "a1"],
      ["p2", "a3"]
    ]
  );
});

function attempt(input: {
  id: string;
  sessionId: string;
  puzzleId: string;
  result: "correct" | "wrong";
  completedAt: string;
}): AttemptEvent {
  return {
    id: input.id,
    source: "sprint",
    sessionId: input.sessionId,
    puzzleId: input.puzzleId,
    mode: "standard",
    ratingKey: "standard 5/20",
    result: input.result,
    submittedMove: "a1a2",
    expectedMove: "a1a3",
    startedAt: "2026-06-20T00:00:00.000Z",
    completedAt: input.completedAt,
    ratingBefore: 600
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
