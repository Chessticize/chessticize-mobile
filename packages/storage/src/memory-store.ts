import {
  createDefaultRating,
  resetRating as resetRatingRecord,
  scheduleMistake,
  scheduleReview
} from "../../core/src/index.ts";
import type {
  AttemptEvent,
  AttemptResult,
  Puzzle,
  RatingRecord,
  ReviewQueueState,
  SprintState
} from "../../core/src/index.ts";
import type { AttemptHistoryRow, HistoryFilter, PuzzleSelectionFilter } from "./query-types.ts";
import type { PracticeStore } from "./practice-store.ts";
import { selectUniquePuzzles } from "./puzzle-selection.ts";

export class MemoryStore implements PracticeStore {
  private readonly puzzles = new Map<string, Puzzle>();
  private readonly ratings = new Map<string, RatingRecord>();
  private readonly sessions = new Map<string, SprintState>();
  private readonly attempts: AttemptEvent[] = [];
  private readonly reviewQueue = new Map<string, ReviewQueueState>();

  seedPuzzles(puzzles: Puzzle[]): void {
    for (const puzzle of puzzles) {
      this.puzzles.set(puzzle.id, puzzle);
    }
  }

  countPuzzles(): number {
    return this.puzzles.size;
  }

  getPuzzle(id: string): Puzzle | undefined {
    return this.puzzles.get(id);
  }

  selectPuzzles(filter: PuzzleSelectionFilter): Puzzle[] {
    return selectUniquePuzzles({
      puzzles: [...this.puzzles.values()].sort((left, right) => left.rating - right.rating || left.id.localeCompare(right.id)),
      mode: filter.mode,
      limit: filter.limit,
      ...(filter.minRating === undefined ? {} : { minRating: filter.minRating }),
      ...(filter.maxRating === undefined ? {} : { maxRating: filter.maxRating }),
      ...(filter.theme === undefined ? {} : { theme: filter.theme })
    });
  }

  getRating(key: string): RatingRecord {
    const existing = this.ratings.get(key);
    if (existing) {
      return existing;
    }
    const created = createDefaultRating(key);
    this.ratings.set(key, created);
    return created;
  }

  saveRating(record: RatingRecord): void {
    this.ratings.set(record.key, record);
  }

  resetRating(key: string): RatingRecord {
    const next = resetRatingRecord(this.getRating(key));
    this.saveRating(next);
    return next;
  }

  createSprintSession(state: SprintState): void {
    this.sessions.set(state.id, state);
  }

  updateSprintSession(state: SprintState): void {
    this.sessions.set(state.id, state);
  }

  recordAttempt(attempt: AttemptEvent): void {
    this.attempts.push(attempt);
  }

  listAttempts(filter: HistoryFilter = {}): AttemptHistoryRow[] {
    return this.attempts
      .filter((attempt) => !filter.result || attempt.result === filter.result)
      .filter((attempt) => !filter.mode || attempt.mode === filter.mode)
      .filter((attempt) => !filter.since || attempt.completedAt >= filter.since)
      .filter((attempt) => !filter.puzzleId || attempt.puzzleId === filter.puzzleId)
      .map((attempt) => ({
        id: attempt.id,
        sessionId: attempt.sessionId,
        puzzleId: attempt.puzzleId,
        mode: attempt.mode,
        result: attempt.result,
        submittedMove: attempt.submittedMove,
        expectedMove: attempt.expectedMove,
        completedAt: attempt.completedAt,
        ratingBefore: attempt.ratingBefore,
        ...(attempt.ratingAfter === undefined ? {} : { ratingAfter: attempt.ratingAfter })
      }))
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt) || right.id.localeCompare(left.id));
  }

  scheduleMistakeReview(puzzleId: string, now: string): ReviewQueueState {
    const previous = this.getReviewQueueState(puzzleId);
    const next = previous ? scheduleReview({ previous, result: "wrong", now }) : scheduleMistake(puzzleId, now);
    this.reviewQueue.set(puzzleId, next);
    return next;
  }

  recordReviewResult(puzzleId: string, result: AttemptResult, now: string): ReviewQueueState {
    const previous = this.getReviewQueueState(puzzleId);
    const next = previous ? scheduleReview({ previous, result, now }) : { ...scheduleReview({ result, now }), puzzleId };
    this.reviewQueue.set(puzzleId, next);
    return next;
  }

  getReviewQueueState(puzzleId: string): ReviewQueueState | undefined {
    return this.reviewQueue.get(puzzleId);
  }

  getDueReviews(now: string): ReviewQueueState[] {
    return [...this.reviewQueue.values()]
      .filter((review) => review.dueAt <= now)
      .sort((left, right) => left.dueAt.localeCompare(right.dueAt) || left.puzzleId.localeCompare(right.puzzleId));
  }

  transaction<T>(work: () => T): T {
    return work();
  }
}
