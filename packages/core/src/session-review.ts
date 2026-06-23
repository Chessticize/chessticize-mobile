import type { AttemptEvent, Puzzle, SessionMistakeReviewItem } from "./types.ts";

export function buildSessionMistakeReview(input: {
  sessionId: string;
  attempts: AttemptEvent[];
  puzzles: Puzzle[];
}): SessionMistakeReviewItem[] {
  const puzzleById = new Map(input.puzzles.map((puzzle) => [puzzle.id, puzzle]));
  const seenPuzzleIds = new Set<string>();
  const items: SessionMistakeReviewItem[] = [];

  const attempts = [...input.attempts].sort(
    (left, right) => left.completedAt.localeCompare(right.completedAt) || left.id.localeCompare(right.id)
  );

  for (const attempt of attempts) {
    if (attempt.sessionId !== input.sessionId || attempt.result !== "wrong" || seenPuzzleIds.has(attempt.puzzleId)) {
      continue;
    }
    const puzzle = puzzleById.get(attempt.puzzleId);
    if (!puzzle) {
      continue;
    }
    seenPuzzleIds.add(attempt.puzzleId);
    items.push({ puzzle, attempt });
  }

  return items;
}
