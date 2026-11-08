import type { AttemptEvent } from "./types.ts";
import { isAttemptMistake } from "./attempt-outcome.ts";
import { isAttemptMarkedUnclear } from "./attempt-clarity.ts";

export interface SprintResultSummary {
  accuracyPercent: number;
  attemptCount: number;
  /**
   * Geometric mean of correct solve times in seconds, the same statistic the
   * Profile uses for usual pace. Undefined without a timed correct solve.
   */
  averageSolveSeconds?: number;
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
  const scoredSprintAttempts = sprintAttempts.filter(
    (attempt) => attempt.result !== "incomplete"
  );
  const unclearAttempts = sprintAttempts.filter(
    (attempt) => isAttemptMarkedUnclear(attempt)
  );
  const slowMarkedCount = unclearAttempts.filter(
    (attempt) => attempt.timingStatus === "slow"
  ).length;
  const timedOutMarkedCount = unclearAttempts.filter(
    (attempt) => attempt.timingStatus === "timed_out"
  ).length;
  const timedOutCount = sprintAttempts.filter(
    (attempt) => attempt.result === "timed_out"
  ).length;
  const mistakeCount = sprintAttempts.filter(
    (attempt) => isAttemptMistake(attempt.result)
  ).length;

  const solveSeconds = scoredSprintAttempts
    .filter((attempt) => attempt.result === "correct")
    .map((attempt) => attempt.elapsedMs)
    .filter((elapsedMs): elapsedMs is number =>
      typeof elapsedMs === "number" && Number.isFinite(elapsedMs) && elapsedMs > 0
    )
    .map((elapsedMs) => elapsedMs / 1000);

  return {
    ...(solveSeconds.length === 0
      ? {}
      : {
          averageSolveSeconds: Math.exp(
            solveSeconds.reduce((sum, seconds) => sum + Math.log(seconds), 0) /
              solveSeconds.length
          )
        }),
    accuracyPercent: Math.round(
      (result.correctCount / Math.max(1, scoredSprintAttempts.length)) * 100
    ),
    attemptCount: scoredSprintAttempts.length,
    unclear: {
      slowMarkedCount,
      timedOutMarkedCount,
      userMarkedCount: unclearAttempts.length - slowMarkedCount - timedOutMarkedCount
    },
    review: {
      addedCount: mistakeCount,
      mistakeCount,
      timedOutCount
    }
  };
}
