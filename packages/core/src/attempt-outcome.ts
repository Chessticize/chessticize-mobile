import type { AttemptOutcome } from "./types.ts";

export const ATTEMPT_MISTAKE_OUTCOMES = ["wrong", "timed_out"] as const satisfies readonly AttemptOutcome[];

export function isAttemptMistake(
  result: AttemptOutcome
): result is (typeof ATTEMPT_MISTAKE_OUTCOMES)[number] {
  return result === "wrong" || result === "timed_out";
}
