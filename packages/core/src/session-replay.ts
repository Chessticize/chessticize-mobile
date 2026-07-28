import { isAttemptMarkedUnclear } from "./attempt-clarity.ts";
import { reviewContextKey } from "./review-schedule-change.ts";
import type {
  AttemptEvent,
  Puzzle,
  ReviewQueueState,
  SessionReplayItem
} from "./types.ts";

export function buildSessionReplay(input: {
  sessionId: string;
  attempts: AttemptEvent[];
  puzzles: Puzzle[];
  reviewQueue: ReviewQueueState[];
}): SessionReplayItem[] {
  const puzzleById = new Map(input.puzzles.map((puzzle) => [puzzle.id, puzzle]));
  const reviewContextKeys = new Set(input.reviewQueue.map(reviewContextKey));
  const seenAttemptIds = new Set<string>();
  const items: SessionReplayItem[] = [];

  const attempts = [...input.attempts].sort(
    (left, right) => left.completedAt.localeCompare(right.completedAt) || left.id.localeCompare(right.id)
  );

  for (const attempt of attempts) {
    if (
      attempt.source !== "sprint" ||
      attempt.sessionId !== input.sessionId ||
      seenAttemptIds.has(attempt.id)
    ) {
      continue;
    }
    seenAttemptIds.add(attempt.id);

    const inReview = reviewContextKeys.has(reviewContextKey(attempt));
    if (!isAttemptMarkedUnclear(attempt) && !inReview) {
      continue;
    }
    const puzzle = puzzleById.get(attempt.puzzleId);
    if (!puzzle) {
      continue;
    }
    items.push({ puzzle, attempt, inReview });
  }

  return items;
}
