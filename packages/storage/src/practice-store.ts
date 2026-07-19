import type {
  AttemptEvent,
  AttemptResult,
  CustomSprintConfigRecord,
  Puzzle,
  RatingRecord,
  ReviewContext,
  ReviewQueueItem,
  ReviewQueueState,
  ReviewScheduleRemoval,
  SessionMistakeReviewItem,
  SprintMode,
  SprintState
} from "../../core/src/index.ts";
import { isReviewDay, reviewDayFor } from "../../core/src/index.ts";
import type { HistoryQuery, HistoryView, ReviewReminderSettings } from "../../core/src/index.ts";
import type { AttemptHistoryRow, HistoryFilter, PuzzleSelectionFilter } from "./query-types.ts";

export interface ClearLocalHistoryResult {
  attempts: number;
  reviewEvents: number;
  reviewQueue: number;
  sprintSessions: number;
}

export interface ExportedSprintSession {
  id: string;
  mode: SprintMode;
  ratingKey: string;
  ratingGeneration?: number;
  startedAt: string;
  completedAt?: string;
  status: SprintState["status"];
  correctCount: number;
  mistakeCount: number;
  ratingBefore: number;
  ratingAfter?: number;
}

export interface LegacyReviewQueueState extends Omit<ReviewQueueState, "dueDay" | "intervalDays"> {
  dueAt: string;
  intervalHours: number;
}

export interface ExportedReviewQueueState extends ReviewQueueState {
  dueAt: string;
  intervalHours: number;
}

export interface LocalDataExport {
  schemaVersion: 1;
  settings: PracticeSettings;
  ratings: RatingRecord[];
  attempts: AttemptHistoryRow[];
  reviewQueue: ExportedReviewQueueState[];
  reviewRemovals?: ReviewScheduleRemoval[];
  sprintSessions: ExportedSprintSession[];
}

export interface LocalDataImport extends Omit<LocalDataExport, "reviewQueue"> {
  reviewQueue: Array<ReviewQueueState | ExportedReviewQueueState | LegacyReviewQueueState>;
}

export interface LocalDataImportResult {
  ratings: number;
  attempts: number;
  reviewQueue: number;
  sprintSessions: number;
}

export interface PracticeSettings {
  sync: {
    iCloudEnabled: boolean;
  };
  notifications: {
    reviewReminder: ReviewReminderPreference;
  };
}

export type ReviewReminderPreference =
  | { mode: "smart" }
  | { mode: "fixed"; fixedLocalTime: string }
  | { mode: "off" };

export interface ReviewQueueDuePromotionResult {
  promotedCount: number;
  promotedDate?: string;
  dueDay?: string;
}

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
  saveCustomSprintConfig(config: CustomSprintConfigRecord): void;
  listCustomSprintConfigs(): CustomSprintConfigRecord[];
  getSettings(): PracticeSettings;
  saveSettings(settings: PracticeSettings): void;
  getReviewReminderPreference(): ReviewReminderPreference;
  saveReviewReminderPreference(preference: ReviewReminderPreference): ReviewReminderPreference;
  getReviewReminderSettings(): ReviewReminderSettings;
  createSprintSession(state: SprintState): void;
  updateSprintSession(state: SprintState): void;
  recordAttempt(attempt: AttemptEvent): void;
  setAttemptUnclear(attemptId: string, unclear: boolean, updatedAt: string): AttemptHistoryRow;
  listAttempts(filter?: HistoryFilter): AttemptHistoryRow[];
  listSprintSessions(): ExportedSprintSession[];
  exportLocalData(): LocalDataExport;
  importLocalData(data: LocalDataImport): LocalDataImportResult;
  clearLocalHistory(): ClearLocalHistoryResult;
  getSessionMistakeReview(sessionId: string): SessionMistakeReviewItem[];
  scheduleMistakeReview(context: ReviewContext, now: string): ReviewQueueState;
  enrollReview(context: ReviewContext, now: string, initiatingAttemptId?: string): ReviewQueueState;
  removeReview(context: ReviewContext, now: string): ReviewScheduleRemoval;
  recordReviewResult(context: ReviewContext, result: AttemptResult, now: string): ReviewQueueState;
  getReviewQueueState(context: ReviewContext): ReviewQueueState | undefined;
  listReviewQueue(): ReviewQueueState[];
  pruneOrphanedReviewQueue(): number;
  promoteNextFutureReviewsToDue(now: string): ReviewQueueDuePromotionResult;
  getDueReviews(now: string): ReviewQueueState[];
  getDueReviewItems(now: string): ReviewQueueItem[];
  getHistoryView(query: HistoryQuery): HistoryView;
  transaction<T>(work: () => T): T;
}

export function exportReviewQueueState(review: ReviewQueueState): ExportedReviewQueueState {
  const [year, month, day] = review.dueDay.split("-").map(Number);
  const dueAt = new Date(year!, month! - 1, day!, 4, 0, 0, 0).toISOString();
  return {
    ...review,
    dueAt,
    intervalHours: review.intervalDays * 24
  };
}

export function normalizeImportedReviewQueueState(
  review: ReviewQueueState | ExportedReviewQueueState | LegacyReviewQueueState
): ReviewQueueState {
  if ("dueDay" in review && "intervalDays" in review && isReviewDay(review.dueDay)) {
    return {
      puzzleId: review.puzzleId,
      mode: review.mode,
      ratingKey: review.ratingKey,
      dueDay: review.dueDay,
      intervalDays: review.intervalDays,
      reviewCount: review.reviewCount,
      successStreak: review.successStreak,
      lapseCount: review.lapseCount,
      lastResult: review.lastResult,
      lastReviewedAt: review.lastReviewedAt,
      ...(review.enrolledAt === undefined ? {} : { enrolledAt: review.enrolledAt })
    };
  }
  if (!("dueAt" in review) || !("intervalHours" in review)) {
    throw new Error("Imported review queue entry has no valid due date");
  }
  return {
    puzzleId: review.puzzleId,
    mode: review.mode,
    ratingKey: review.ratingKey,
    dueDay: reviewDayFor(review.dueAt),
    intervalDays: Math.max(1, Math.ceil(review.intervalHours / 24)),
    reviewCount: review.reviewCount,
    successStreak: review.successStreak,
    lapseCount: review.lapseCount,
    lastResult: review.lastResult,
    lastReviewedAt: review.lastReviewedAt,
    ...(review.enrolledAt === undefined ? {} : { enrolledAt: review.enrolledAt })
  };
}
