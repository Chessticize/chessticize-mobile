import { buildSessionMistakeReview } from "../../core/src/index.ts";
import type {
  AppReviewRequestAttempt,
  AttemptEvent,
  AttemptResult,
  CustomSprintConfigRecord,
  ExtractedGamePuzzle,
  HistoryQuery,
  HistoryView,
  ImportedGameDraft,
  Puzzle,
  PracticeRunRecord,
  RatingRecord,
  ReviewContext,
  ReviewQueueItem,
  ReviewQueueState,
  ReviewScheduleRemoval,
  SessionMistakeReviewItem,
  SprintState,
  SurvivalBestRecord,
  SurvivalPreferences
} from "../../core/src/index.ts";
import { CompositePuzzleSource } from "./composite-puzzle-source.ts";
import type {
  GameListFilter,
  LinkedGameAccount,
  LinkedGameAccountPlatform,
  ReplaceGameUserPuzzlesMeta,
  SaveGamePlyEvaluationsStatusUpdate,
  StoredGamePlyEval,
  StoredImportedGame,
  StoredUserPuzzle,
  UpsertImportedGamesResult,
  UserPuzzleFilter
} from "./game-review-store.ts";
import type { AttemptHistoryRow, HistoryFilter, PuzzleSelectionFilter } from "./query-types.ts";
import type {
  ClearSyncedHistoryResult,
  ExportedSprintSession,
  LocalDataImport,
  LocalDataImportObserver,
  LocalDataImportResult,
  LocalDataExport,
  PracticeSettings,
  PracticeStore,
  ReviewQueueDuePromotionResult,
  ReviewReminderPreference
} from "./practice-store.ts";
import type { ReviewReminderSettings } from "../../core/src/index.ts";
import type { PuzzleSource } from "./puzzle-source.ts";
import type { SurvivalPuzzleBatch, SurvivalPuzzleBatchInput } from "./puzzle-source.ts";
import type { ProgressV2Persistence } from "./progress-v2-persistence.ts";

export class PackBackedPracticeStore implements PracticeStore {
  private readonly userStore: PracticeStore;
  private readonly puzzleSource: PuzzleSource;

  constructor(userStore: PracticeStore, puzzleSource: PuzzleSource) {
    this.userStore = userStore;
    this.puzzleSource = puzzleSource;
  }

  get progressV2(): ProgressV2Persistence {
    const persistence = this.userStore.progressV2;
    if (!persistence) {
      throw new Error("Progress V2 persistence is unavailable for the user store");
    }
    return persistence;
  }

  seedPuzzles(puzzles: Puzzle[]): void {
    this.userStore.seedPuzzles(puzzles);
  }

  countPuzzles(filter?: PuzzleSelectionFilter): number {
    if (filter === undefined) {
      return this.puzzleSource.countPuzzles();
    }
    if (filter.source === "user_game") {
      return this.puzzleSource instanceof CompositePuzzleSource
        ? this.puzzleSource.countPuzzles(filter)
        : this.userStore.countPuzzles(filter);
    }
    if (filter.source === "all") {
      if (this.puzzleSource instanceof CompositePuzzleSource) {
        return this.puzzleSource.countPuzzles(filter);
      }
      return this.selectPuzzles(filter).length;
    }
    const localScopeIsSeeded = this.scopeIsFullySeeded(filter.includeIds);
    return localScopeIsSeeded
      ? this.userStore.countPuzzles(filter)
      : this.puzzleSource.countPuzzles(filter);
  }

  /**
   * A scope is served locally only when the user store holds all of it (a
   * loaded fixture). Practice seeds the puzzles it serves, so a pack-wide scope
   * is often partly present locally; that must not shrink the scope to the few
   * puzzles the player happened to see.
   */
  private scopeIsFullySeeded(includeIds: readonly string[] | undefined): boolean {
    return includeIds !== undefined &&
      includeIds.length > 0 &&
      includeIds.every((id) => this.userStore.getPuzzle(id) !== undefined);
  }

  getPuzzle(id: string): Puzzle | undefined {
    const cached = this.userStore.getPuzzle(id);
    if (cached) {
      if (cached.arrowDuelRating === undefined && cached.source !== "user_game") {
        const fresh = this.puzzleSource.getPuzzle(id);
        if (fresh?.arrowDuelRating !== undefined) {
          return { ...cached, arrowDuelRating: fresh.arrowDuelRating };
        }
      }
      return cached;
    }
    return this.puzzleSource.getPuzzle(id);
  }

  selectPuzzles(filter: PuzzleSelectionFilter): Puzzle[] {
    if (filter.source === "user_game") {
      const puzzles = this.puzzleSource instanceof CompositePuzzleSource
        ? this.puzzleSource.selectPuzzles(filter)
        : this.userStore.selectPuzzles(filter);
      if (puzzles.length > 0) {
        this.userStore.seedPuzzles(puzzles);
      }
      return puzzles;
    }
    if (filter.source === "all") {
      const puzzles = this.puzzleSource instanceof CompositePuzzleSource
        ? this.puzzleSource.selectPuzzles(filter)
        : new CompositePuzzleSource(this.puzzleSource, this.userStore).selectPuzzles(filter);
      if (puzzles.length > 0) {
        this.userStore.seedPuzzles(puzzles);
      }
      return puzzles;
    }
    const localScopeIsSeeded = this.scopeIsFullySeeded(filter.includeIds);
    const localScopedPuzzles = localScopeIsSeeded ? this.userStore.selectPuzzles(filter) : [];
    const puzzles = localScopeIsSeeded ? localScopedPuzzles : this.puzzleSource.selectPuzzles(filter);
    if (puzzles.length > 0) {
      this.userStore.seedPuzzles(puzzles);
    }
    return puzzles;
  }

  countSurvivalPuzzles(
    input: Pick<SurvivalPuzzleBatchInput, "challengeType" | "level">
  ): number {
    return this.puzzleSource.countSurvivalPuzzles(input);
  }

  selectSurvivalPuzzleBatch(input: SurvivalPuzzleBatchInput): SurvivalPuzzleBatch {
    const batch = this.puzzleSource.selectSurvivalPuzzleBatch(input);
    if (batch.puzzles.length > 0) {
      this.userStore.seedPuzzles(batch.puzzles);
    }
    return batch;
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

  savePracticeRun(run: PracticeRunRecord): void {
    this.userStore.savePracticeRun(run);
  }

  listPracticeRuns(): PracticeRunRecord[] {
    return this.userStore.listPracticeRuns();
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

  getAppReviewRequestAttempt(): AppReviewRequestAttempt | undefined {
    return this.userStore.getAppReviewRequestAttempt();
  }

  saveAppReviewRequestAttempt(
    attempt: AppReviewRequestAttempt
  ): AppReviewRequestAttempt {
    return this.userStore.saveAppReviewRequestAttempt(attempt);
  }

  createSprintSession(state: SprintState): void {
    this.userStore.createSprintSession(state);
  }

  updateSprintSession(state: SprintState): void {
    this.userStore.updateSprintSession(state);
  }

  getResumableSurvivalSprint(id: string): SprintState | undefined {
    return this.userStore.getResumableSurvivalSprint(id);
  }

  listResumableSurvivalSprints(): SprintState[] {
    return this.userStore.listResumableSurvivalSprints();
  }

  listResumableFocusedSprints(): SprintState[] {
    return this.userStore.listResumableFocusedSprints();
  }

  listSurvivalBests(): SurvivalBestRecord[] {
    return this.userStore.listSurvivalBests();
  }

  saveSurvivalBest(record: SurvivalBestRecord): void {
    this.userStore.saveSurvivalBest(record);
  }

  getSurvivalPreferences(): SurvivalPreferences {
    return this.userStore.getSurvivalPreferences();
  }

  saveSurvivalPreferences(preferences: SurvivalPreferences): void {
    this.userStore.saveSurvivalPreferences(preferences);
  }

  recordAttempt(attempt: AttemptEvent): void {
    this.userStore.recordAttempt(attempt);
  }

  setAttemptUnclear(attemptId: string, unclear: boolean, updatedAt: string): AttemptHistoryRow {
    return this.userStore.setAttemptUnclear(attemptId, unclear, updatedAt);
  }

  getAttempt(attemptId: string): AttemptHistoryRow | undefined {
    return this.userStore.getAttempt(attemptId);
  }

  countAttempts(filter?: HistoryFilter): number {
    return this.userStore.countAttempts(filter);
  }

  listAttempts(filter?: HistoryFilter): AttemptHistoryRow[] {
    return this.userStore.listAttempts(filter);
  }

  getPracticeProgressSummary(nowMs: number, ratingKey: string) {
    return this.userStore.getPracticeProgressSummary(nowMs, ratingKey);
  }

  listPracticeRatingActivity() {
    return this.userStore.listPracticeRatingActivity();
  }

  hasPlayedRatingKey(ratingKey: string): boolean {
    return this.userStore.hasPlayedRatingKey(ratingKey);
  }

  listSprintSessions(): ExportedSprintSession[] {
    return this.userStore.listSprintSessions();
  }

  listSurvivalSessions(): ExportedSprintSession[] {
    return this.userStore.listSurvivalSessions();
  }

  getSprintSessions(ids: readonly string[]): ExportedSprintSession[] {
    return this.userStore.getSprintSessions(ids);
  }

  listLatestTerminalFocusedSprintSessions(): ExportedSprintSession[] {
    return this.userStore.listLatestTerminalFocusedSprintSessions();
  }

  listSprintAttemptUtcDays(sessionIds: readonly string[]): string[] {
    return this.userStore.listSprintAttemptUtcDays(sessionIds);
  }

  getTacticalProfileSourceRevision(): number {
    return this.userStore.getTacticalProfileSourceRevision();
  }

  exportLocalData(): LocalDataExport {
    return this.userStore.exportLocalData();
  }

  importLocalData(
    data: LocalDataImport,
    observer?: LocalDataImportObserver
  ): LocalDataImportResult {
    const referencedPuzzleIds = new Set([
      ...data.attempts.map((attempt) => attempt.puzzleId),
      ...data.reviewQueue.map((review) => review.puzzleId),
      ...(data.reviewRemovals ?? []).map((removal) => removal.puzzleId)
    ]);
    const missingReferencedPuzzles = [...referencedPuzzleIds]
      .filter((puzzleId) => this.userStore.getPuzzle(puzzleId) === undefined)
      .map((puzzleId) => this.puzzleSource.getPuzzle(puzzleId))
      .filter((puzzle): puzzle is Puzzle => puzzle !== undefined);
    if (missingReferencedPuzzles.length > 0) {
      this.userStore.seedPuzzles(missingReferencedPuzzles);
    }
    return this.userStore.importLocalData(data, observer);
  }

  clearSyncedHistory(now: string): ClearSyncedHistoryResult {
    return this.userStore.clearSyncedHistory(now);
  }

  getSessionMistakeReview(sessionId: string): SessionMistakeReviewItem[] {
    const attempts = this.userStore
      .listAttempts({ sessionId })
      .map(attemptEventFromHistoryRow);
    const puzzles = attempts
      .map((attempt) => this.getPuzzle(attempt.puzzleId))
      .filter((puzzle): puzzle is Puzzle => Boolean(puzzle));
    return buildSessionMistakeReview({ sessionId, attempts, puzzles });
  }

  scheduleMistakeReview(context: ReviewContext, now: string): ReviewQueueState {
    return this.userStore.scheduleMistakeReview(context, now);
  }

  enrollReview(
    context: ReviewContext,
    now: string,
    initiatingAttemptId?: string,
    timeZone?: string
  ): ReviewQueueState {
    return this.userStore.enrollReview(context, now, initiatingAttemptId, timeZone);
  }

  removeReview(context: ReviewContext, now: string): ReviewScheduleRemoval {
    return this.userStore.removeReview(context, now);
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

  promoteNextFutureReviewsToDue(now: string): ReviewQueueDuePromotionResult {
    return this.userStore.promoteNextFutureReviewsToDue(now);
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

  listLinkedAccounts(): LinkedGameAccount[] {
    return this.userStore.listLinkedAccounts();
  }

  upsertLinkedAccount(
    account: Omit<LinkedGameAccount, "createdAt"> & { createdAt?: string }
  ): LinkedGameAccount {
    return this.userStore.upsertLinkedAccount(account);
  }

  removeLinkedAccount(platform: LinkedGameAccountPlatform, username: string): void {
    this.userStore.removeLinkedAccount(platform, username);
  }

  upsertImportedGames(
    games: readonly ImportedGameDraft[],
    nowIso?: string
  ): UpsertImportedGamesResult {
    return this.userStore.upsertImportedGames(games, nowIso);
  }

  listImportedGames(filter?: GameListFilter): StoredImportedGame[] {
    return this.userStore.listImportedGames(filter);
  }

  countImportedGames(filter?: Omit<GameListFilter, "limit" | "offset">): number {
    return this.userStore.countImportedGames(filter);
  }

  getImportedGame(gameId: string): StoredImportedGame | undefined {
    return this.userStore.getImportedGame(gameId);
  }

  deleteImportedGame(gameId: string): void {
    this.userStore.deleteImportedGame(gameId);
  }

  saveGamePlyEvaluations(
    gameId: string,
    evals: readonly StoredGamePlyEval[],
    statusUpdate: SaveGamePlyEvaluationsStatusUpdate
  ): void {
    this.userStore.saveGamePlyEvaluations(gameId, evals, statusUpdate);
  }

  listGamePlyEvaluations(gameId: string): StoredGamePlyEval[] {
    return this.userStore.listGamePlyEvaluations(gameId);
  }

  replaceGameUserPuzzles(
    gameId: string,
    puzzles: readonly ExtractedGamePuzzle[],
    gameMeta: ReplaceGameUserPuzzlesMeta
  ): StoredUserPuzzle[] {
    return this.userStore.replaceGameUserPuzzles(gameId, puzzles, gameMeta);
  }

  listUserPuzzles(filter?: UserPuzzleFilter): StoredUserPuzzle[] {
    return this.userStore.listUserPuzzles(filter);
  }

  countUserPuzzles(filter?: Omit<UserPuzzleFilter, "limit">): number {
    return this.userStore.countUserPuzzles(filter);
  }

  getUserPuzzle(puzzleId: string): StoredUserPuzzle | undefined {
    return this.userStore.getUserPuzzle(puzzleId);
  }

  updateUserPuzzleRating(
    puzzleId: string,
    rating: number,
    ratingSource: StoredUserPuzzle["ratingSource"]
  ): void {
    if (ratingSource !== undefined) {
      this.userStore.updateUserPuzzleRating(puzzleId, rating, ratingSource);
    }
  }

  archiveUserPuzzle(puzzleId: string, archived?: boolean): void {
    this.userStore.archiveUserPuzzle(puzzleId, archived);
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
    ...(row.submittedMove === undefined ? {} : { submittedMove: row.submittedMove }),
    expectedMove: row.expectedMove,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    ...(row.elapsedMs === undefined ? {} : { elapsedMs: row.elapsedMs }),
    ...(row.timingStatus === undefined ? {} : { timingStatus: row.timingStatus }),
    ratingBefore: row.ratingBefore,
    ...(row.ratingAfter === undefined ? {} : { ratingAfter: row.ratingAfter }),
    ...(row.arrowDuelCandidateOrder === undefined ? {} : { arrowDuelCandidateOrder: row.arrowDuelCandidateOrder }),
    ...(row.unclearUpdatedAt === undefined
      ? {}
      : { unclear: Boolean(row.unclear), unclearUpdatedAt: row.unclearUpdatedAt })
  };
}
