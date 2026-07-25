import type { AttemptEvent } from "./types.ts";

export function isUnclearAttemptEligible(
  attempt: Pick<AttemptEvent, "source" | "result" | "mode">
): boolean {
  return attempt.source === "sprint" &&
    (attempt.result === "correct" || attempt.result === "timed_out");
}

export function updateAttemptUnclearState(
  attempt: AttemptEvent,
  unclear: boolean,
  updatedAt: string
): AttemptEvent {
  if (!isUnclearAttemptEligible(attempt)) {
    throw new Error("Only correct or timed-out sprint attempts can be marked unclear");
  }
  const updatedAtDate = new Date(updatedAt);
  if (Number.isNaN(updatedAtDate.getTime())) {
    throw new Error("updatedAt must be a valid ISO timestamp");
  }
  if (Boolean(attempt.unclear) === unclear) {
    return attempt;
  }
  return {
    ...attempt,
    unclear,
    unclearUpdatedAt: updatedAtDate.toISOString()
  };
}
