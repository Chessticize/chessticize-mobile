import { buildSessionMistakeReview } from "../../core/src/index.ts";
import type {
  AttemptEvent,
  AttemptResult,
  CustomSprintConfigRecord,
  HistoryQuery,
  HistoryView,
  Puzzle,
  RatingRecord,
  ReviewContext,
  ReviewQueueItem,
  ReviewQueueState,
  SessionMistakeReviewItem,
  SprintState
} from "../../core/src/index.ts";
import type { AttemptHistoryRow, HistoryFilter, PuzzleSelectionFilter } from "./query-types.ts";
import type {
  ClearLocalHistoryResult,
  LocalDataExport,
  PracticeSettings,
  PracticeStore,
  ReviewReminderPreference
} from "./practice-store.ts";
import type { ReviewReminderSettings } from "../../core/src/index.ts";
import type { PuzzleSource } from "./puzzle-source.ts";

export class PackBackedPracticeStore implements PracticeStore {
  private readonly userStore: PracticeStore;
  private readonly puzzleSource: PuzzleSource;

  constructor(userStore: PracticeStore, puzzleSource: PuzzleSource) {
    this.userStore = userStore;
    this.puzzleSource = puzzleSource;
  }

  seedPuzzles(puzzles: Puzzle[]): void {
    this.userStore.seedPuzzles(puzzles);
  }

  countPuzzles(): number {
    return this.puzzleSource.countPuzzles();
  }

  getPuzzle(id: string): Puzzle | undefined {
    return this.userStore.getPuzzle(id) ?? this.puzzleSource.getPuzzle(id);
  }

  selectPuzzles(filter: PuzzleSelectionFilter): Puzzle[] {
    const localScopeIsSeeded = filter.includeIds?.some((id) => this.userStore.getPuzzle(id) !== undefined) ?? false;
    const localScopedPuzzles = localScopeIsSeeded ? this.userStore.selectPuzzles(filter) : [];
    const puzzles = localScopeIsSeeded ? localScopedPuzzles : this.puzzleSource.selectPuzzles(filter);
    if (puzzles.length > 0) {
      this.userStore.seedPuzzles(puzzles);
    }
    return puzzles;
  }

  getRating(key: string): RatingRecord {
    return this.userStore.getRating(key);
  }

  listRatings(): RatingRecord[] {
    return this.userStore.listRatings();
  }

  listPlayedRatings(): RatingRecord[] {
    return this.userStore.listPlayedRatings();
  }

  saveRating(record: RatingRecord): void {
    this.userStore.saveRating(record);
  }

  resetRating(key: string): RatingRecord {
    return this.userStore.resetRating(key);
  }

  saveCustomSprintConfig(config: CustomSprintConfigRecord): void {
    this.userStore.saveCustomSprintConfig(config);
  }

  listCustomSprintConfigs(): CustomSprintConfigRecord[] {
    return this.userStore.listCustomSprintConfigs();
  }

  getSettings(): PracticeSettings {
    return this.userStore.getSettings();
  }

  saveSettings(settings: PracticeSettings): void {
    this.userStore.saveSettings(settings);
  }

  getReviewReminderPreference(): ReviewReminderPreference {
    return this.userStore.getReviewReminderPreference();
  }

  saveReviewReminderPreference(preference: ReviewReminderPreference): ReviewReminderPreference {
    return this.userStore.saveReviewReminderPreference(preference);
  }

  getReviewReminderSettings(): ReviewReminderSettings {
    return this.userStore.getReviewReminderSettings();
  }

  createSprintSession(state: SprintState): void {
    this.userStore.createSprintSession(state);
  }

  updateSprintSession(state: SprintState): void {
    this.userStore.updateSprintSession(state);
  }

  recordAttempt(attempt: AttemptEvent): void {
    this.userStore.recordAttempt(attempt);
  }

  listAttempts(filter?: HistoryFilter): AttemptHistoryRow[] {
    return this.userStore.listAttempts(filter);
  }

  exportLocalData(): LocalDataExport {
    return this.userStore.exportLocalData();
  }

  clearLocalHistory(): ClearLocalHistoryResult {
    return this.userStore.clearLocalHistory();
  }

  getSessionMistakeReview(sessionId: string): SessionMistakeReviewItem[] {
    const attempts = this.userStore.listAttempts({ sessionId, result: "wrong" }).map(attemptEventFromHistoryRow);
    const puzzles = attempts
      .map((attempt) => this.getPuzzle(attempt.puzzleId))
      .filter((puzzle): puzzle is Puzzle => Boolean(puzzle));
    return buildSessionMistakeReview({ sessionId, attempts, puzzles });
  }

  scheduleMistakeReview(context: ReviewContext, now: string): ReviewQueueState {
    return this.userStore.scheduleMistakeReview(context, now);
  }

  recordReviewResult(context: ReviewContext, result: AttemptResult, now: string): ReviewQueueState {
    return this.userStore.recordReviewResult(context, result, now);
  }

  getReviewQueueState(context: ReviewContext): ReviewQueueState | undefined {
    return this.userStore.getReviewQueueState(context);
  }

  listReviewQueue(): ReviewQueueState[] {
    return this.userStore.listReviewQueue();
  }

  pruneOrphanedReviewQueue(): number {
    return this.userStore.pruneOrphanedReviewQueue();
  }

  getDueReviews(now: string): ReviewQueueState[] {
    return this.userStore.getDueReviews(now);
  }

  getDueReviewItems(now: string): ReviewQueueItem[] {
    return this.getDueReviews(now)
      .map((review) => {
        const puzzle = this.getPuzzle(review.puzzleId);
        return puzzle ? { puzzle, review } : undefined;
      })
      .filter((item): item is ReviewQueueItem => Boolean(item));
  }

  getHistoryView(query: HistoryQuery): HistoryView {
    return this.userStore.getHistoryView(query);
  }

  transaction<T>(work: () => T): T {
    return this.userStore.transaction(work);
  }
}

function attemptEventFromHistoryRow(row: AttemptHistoryRow): AttemptEvent {
  return {
    id: row.id,
    source: row.source,
    sessionId: row.sessionId,
    puzzleId: row.puzzleId,
    mode: row.mode,
    ratingKey: row.ratingKey,
    result: row.result,
    submittedMove: row.submittedMove,
    expectedMove: row.expectedMove,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    ratingBefore: row.ratingBefore,
    ...(row.ratingAfter === undefined ? {} : { ratingAfter: row.ratingAfter }),
    ...(row.arrowDuelCandidateOrder === undefined ? {} : { arrowDuelCandidateOrder: row.arrowDuelCandidateOrder })
  };
}
