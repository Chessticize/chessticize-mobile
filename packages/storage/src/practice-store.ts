import type {
  AttemptEvent,
  AttemptResult,
  Puzzle,
  RatingRecord,
  ReviewContext,
  ReviewQueueItem,
  ReviewQueueState,
  SessionMistakeReviewItem,
  SprintState
} from "../../core/src/index.ts";
import type { HistoryQuery, HistoryView } from "../../core/src/index.ts";
import type { AttemptHistoryRow, HistoryFilter, PuzzleSelectionFilter } from "./query-types.ts";

export interface PracticeStore {
  seedPuzzles(puzzles: Puzzle[]): void;
  countPuzzles(): number;
  getPuzzle(id: string): Puzzle | undefined;
  selectPuzzles(filter: PuzzleSelectionFilter): Puzzle[];
  getRating(key: string): RatingRecord;
  listRatings(): RatingRecord[];
  listPlayedRatings(): RatingRecord[];
  saveRating(record: RatingRecord): void;
  resetRating(key: string): RatingRecord;
  createSprintSession(state: SprintState): void;
  updateSprintSession(state: SprintState): void;
  recordAttempt(attempt: AttemptEvent): void;
  listAttempts(filter?: HistoryFilter): AttemptHistoryRow[];
  getSessionMistakeReview(sessionId: string): SessionMistakeReviewItem[];
  scheduleMistakeReview(context: ReviewContext, now: string): ReviewQueueState;
  recordReviewResult(context: ReviewContext, result: AttemptResult, now: string): ReviewQueueState;
  getReviewQueueState(context: ReviewContext): ReviewQueueState | undefined;
  getDueReviews(now: string): ReviewQueueState[];
  getDueReviewItems(now: string): ReviewQueueItem[];
  getHistoryView(query: HistoryQuery): HistoryView;
  transaction<T>(work: () => T): T;
}
