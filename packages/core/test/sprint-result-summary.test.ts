import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSprintResultSummary,
  type AttemptEvent
} from "../src/index.ts";

const baseAttempt = {
  source: "sprint",
  sessionId: "session-1",
  mode: "standard",
  ratingKey: "standard 5/20",
  submittedMove: "e2e4",
  expectedMove: "e2e4",
  startedAt: "2026-07-25T12:00:00.000Z",
  ratingBefore: 600
} as const;

test("Sprint result summary counts wrong and timed-out attempts once as mistakes", () => {
  const attempts: AttemptEvent[] = [
    {
      ...baseAttempt,
      id: "correct",
      puzzleId: "p1",
      result: "correct",
      completedAt: "2026-07-25T12:00:10.000Z"
    },
    {
      ...baseAttempt,
      id: "slow-wrong",
      puzzleId: "p2",
      result: "wrong",
      completedAt: "2026-07-25T12:00:50.000Z",
      timingStatus: "slow",
      unclear: true,
      unclearUpdatedAt: "2026-07-25T12:00:50.000Z"
    },
    {
      ...baseAttempt,
      id: "timed-out",
      puzzleId: "p3",
      result: "timed_out",
      completedAt: "2026-07-25T12:01:50.000Z",
      timingStatus: "timed_out",
      unclear: true,
      unclearUpdatedAt: "2026-07-25T12:01:50.000Z"
    },
    {
      ...baseAttempt,
      id: "user-marked",
      puzzleId: "p4",
      result: "correct",
      completedAt: "2026-07-25T12:02:00.000Z",
      unclear: true,
      unclearUpdatedAt: "2026-07-25T12:02:00.000Z"
    }
  ];

  assert.deepEqual(
    buildSprintResultSummary({ correctCount: 2, mistakeCount: 2 }, attempts),
    {
      accuracyPercent: 50,
      attemptCount: 4,
      unclear: {
        slowMarkedCount: 1,
        timedOutMarkedCount: 1,
        userMarkedCount: 1
      },
      review: {
        addedCount: 2,
        mistakeCount: 2,
        timedOutCount: 1
      }
    }
  );
});
