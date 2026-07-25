import type { AttemptEvent } from "./types.ts";

export interface SprintResultSummary {
  accuracyPercent: number;
  attemptCount: number;
  unclear: {
    slowMarkedCount: number;
    timedOutMarkedCount: number;
    userMarkedCount: number;
  };
  review: {
    addedCount: number;
    mistakeCount: number;
    timedOutCount: number;
  };
}

export function buildSprintResultSummary(
  result: {
    correctCount: number;
    mistakeCount: number;
  },
  attempts: readonly AttemptEvent[]
): SprintResultSummary {
  const sprintAttempts = attempts.filter((attempt) => attempt.source === "sprint");
  const unclearAttempts = sprintAttempts.filter((attempt) => attempt.unclear === true);
  const slowMarkedCount = unclearAttempts.filter(
    (attempt) => attempt.timingStatus === "slow"
  ).length;
  const timedOutMarkedCount = unclearAttempts.filter(
    (attempt) => attempt.timingStatus === "timed_out"
  ).length;
  const timedOutCount = sprintAttempts.filter(
    (attempt) => attempt.result === "timed_out"
  ).length;

  return {
    accuracyPercent: Math.round(
      (result.correctCount / Math.max(1, sprintAttempts.length)) * 100
    ),
    attemptCount: sprintAttempts.length,
    unclear: {
      slowMarkedCount,
      timedOutMarkedCount,
      userMarkedCount: unclearAttempts.length - slowMarkedCount - timedOutMarkedCount
    },
    review: {
      addedCount: result.mistakeCount + timedOutCount,
      mistakeCount: result.mistakeCount,
      timedOutCount
    }
  };
}
