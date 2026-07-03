import type {
  AttemptEvent,
  AttemptResult,
  CustomSprintConfigRecord,
  Puzzle,
  RatingRecord,
  ReviewContext,
  ReviewQueueItem,
  ReviewQueueState,
  SessionMistakeReviewItem,
  SprintMode,
  SprintState
} from "../../core/src/index.ts";
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
  startedAt: string;
  completedAt?: string;
  status: SprintState["status"];
  correctCount: number;
  mistakeCount: number;
  ratingBefore: number;
  ratingAfter?: number;
}

export interface LocalDataExport {
  schemaVersion: 1;
  settings: PracticeSettings;
  ratings: RatingRecord[];
  attempts: AttemptHistoryRow[];
  reviewQueue: ReviewQueueState[];
  sprintSessions: ExportedSprintSession[];
}

export interface PracticeSettings {
  sync: {
    iCloudEnabled: boolean;
    uploadAllowed: boolean;
  };
  notifications: {
    reviewReminder: ReviewReminderPreference;
  };
}

export type ReviewReminderPreference =
  | { mode: "smart" }
  | { mode: "fixed"; fixedLocalTime: string }
  | { mode: "off" };

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
  listAttempts(filter?: HistoryFilter): AttemptHistoryRow[];
  exportLocalData(): LocalDataExport;
  clearLocalHistory(): ClearLocalHistoryResult;
  getSessionMistakeReview(sessionId: string): SessionMistakeReviewItem[];
  scheduleMistakeReview(context: ReviewContext, now: string): ReviewQueueState;
  recordReviewResult(context: ReviewContext, result: AttemptResult, now: string): ReviewQueueState;
  getReviewQueueState(context: ReviewContext): ReviewQueueState | undefined;
  listReviewQueue(): ReviewQueueState[];
  pruneOrphanedReviewQueue(): number;
  getDueReviews(now: string): ReviewQueueState[];
  getDueReviewItems(now: string): ReviewQueueItem[];
  getHistoryView(query: HistoryQuery): HistoryView;
  transaction<T>(work: () => T): T;
}
