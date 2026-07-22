import {
  abandonSprint as abandonSprintCore,
  applySprintRatingChange,
  archivePracticeRun,
  assertValidManualRating,
  buildSprintConfig,
  clonePracticeRun,
  createCustomPracticeRun,
  createDefaultRating,
  DEFAULT_RATING_DEVIATION,
  DEFAULT_VOLATILITY,
  normalizeThemeSelection,
  practiceRunSprintConfig,
  reorderPracticeRuns,
  restorePracticeRun,
  pauseSprint as pauseSprintCore,
  reviewDayFor,
  resumeSprint as resumeSprintCore,
  serializeSprintView,
  startSprint,
  submitSprintMove
} from "../../core/src/index.ts";
import type {
  AttemptEvent,
  AttemptResult,
  CustomSprintConfigRecord,
  HistoryQuery,
  HistoryView,
  Puzzle,
  PracticeRunRecord,
  RatingRecord,
  ReviewContext,
  ReviewQueueItem,
  ReviewQueueState,
  ReviewScheduleRemoval,
  SessionMistakeReviewItem,
  SprintConfig,
  SprintMode,
  SprintState
} from "../../core/src/index.ts";
import type { AttemptHistoryRow, HistoryFilter } from "./query-types.ts";
import type {
  ClearLocalHistoryResult,
  ExportedSprintSession,
  LocalDataImport,
  LocalDataImportResult,
  LocalDataExport,
  PracticeSettings,
  PracticeStore,
  ReviewQueueDuePromotionResult,
  ReviewReminderPreference
} from "./practice-store.ts";
import type { ReviewReminderSettings } from "../../core/src/index.ts";
import { reconcileRatingWithSprintSessions } from "./rating-history.ts";

const MANUAL_RATING_DEVIATION_CAP = 100;

export interface StartSprintCommand {
  mode: SprintMode;
  durationSeconds?: number;
  perPuzzleSeconds?: number;
  targetCorrect?: number;
  maxMistakes?: number;
  themes?: string[];
  /** @deprecated Accept legacy callers, then normalize to themes. */
  theme?: string;
  minRating?: number;
  maxRating?: number;
  puzzleSelectionSeed?: string | number;
  persistCustomConfig?: boolean;
  practiceRunId?: string;
}

export interface CreatePracticeRunCommand {
  id?: string;
  name: string;
  mode: "custom" | "arrow_duel";
  durationSeconds: number;
  perPuzzleSeconds: number;
  targetCorrect?: number;
  maxMistakes?: number;
  themes?: string[];
  initialRating: number;
}

export class PracticeRunAvailabilityError extends Error {
  constructor() {
    super("No eligible puzzles are available for this Practice Run");
    this.name = "PracticeRunAvailabilityError";
  }
}

export interface RecordReviewAttemptCommand extends ReviewContext {
  result: AttemptResult;
  submittedMove: string;
  expectedMove: string;
  startedAt?: string;
  arrowDuelCandidateOrder?: string[];
}

export interface CompletedReviewItem {
  attempt: AttemptHistoryRow;
  puzzle: Puzzle;
}

export class PracticeService {
  private activeSprint: SprintState | undefined;
  private puzzleSelectionScopeIds: string[] | undefined;
  private readonly store: PracticeStore;

  constructor(store: PracticeStore) {
    this.store = store;
    this.reconcilePersistedRatings();
  }

  startSprint(command: StartSprintCommand, now = new Date().toISOString()): SprintState {
    if (this.activeSprint && (this.activeSprint.status === "active" || this.activeSprint.status === "paused")) {
      throw new Error("Cannot start a new sprint while another sprint is active");
    }
    const practiceRun = command.practiceRunId === undefined
      ? undefined
      : this.requirePracticeRun(command.practiceRunId, false);
    const config = this.resolveSprintConfig(command, practiceRun);
    const rating = this.store.getRating(config.ratingKey);
    const puzzles = this.store.selectPuzzles(this.puzzleFilterForCommand(command, config, rating.rating));
    if (puzzles.length === 0) {
      throw new Error("No eligible puzzles are available for this sprint");
    }

    const coreSprint = startSprint({
      config,
      puzzles,
      ratingBefore: rating.rating,
      ratingBeforeRecord: rating,
      now
    });
    const sprint: SprintState = practiceRun
      ? {
          ...coreSprint,
          run: { id: practiceRun.id, kind: practiceRun.kind, name: practiceRun.name }
        }
      : coreSprint;
    this.activeSprint = sprint;
    this.store.transaction(() => {
      if (command.persistCustomConfig) {
        const previousConfig = this.store.listCustomSprintConfigs().find((record) => record.id === customSprintConfigId(config));
        this.store.saveCustomSprintConfig(buildCustomSprintConfigRecord({
          config,
          lastStartedAt: now,
          ...(previousConfig ? { previous: previousConfig } : {})
        }));
      }
      this.store.createSprintSession(sprint);
    });
    return sprint;
  }

  submitMove(move: string, now = new Date().toISOString()): {
    state: SprintState;
    feedback?: unknown;
    attempt?: AttemptEvent;
  } {
    if (!this.activeSprint) {
      throw new Error("No active sprint");
    }
    const previousSprint = this.activeSprint;
    const result = submitSprintMove(previousSprint, move, now);
    let attemptToReturn = result.attempt;

    if (result.attempt) {
      const attempt =
        result.state.ratingAfter === undefined
          ? result.attempt
          : { ...result.attempt, ratingAfter: result.state.ratingAfter };
      attemptToReturn = attempt;
    }

    this.store.transaction(() => {
      if (attemptToReturn) {
        this.store.recordAttempt(attemptToReturn);
        if (attemptToReturn.result === "wrong") {
          this.store.scheduleMistakeReview(reviewContextFromAttempt(attemptToReturn), attemptToReturn.completedAt);
        }
      }

      if (!isOpenSprint(result.state)) {
        this.persistCompletedSprint(result.state);
      }
    });

    if (isOpenSprint(result.state)) {
      this.activeSprint = result.state;
    } else {
      this.activeSprint = undefined;
    }

    const response: {
      state: SprintState;
      feedback?: unknown;
      attempt?: AttemptEvent;
    } = {
      state: result.state
    };
    if (result.feedback !== undefined) {
      response.feedback = result.feedback;
    }
    if (attemptToReturn !== undefined) {
      response.attempt = attemptToReturn;
    }
    return response;
  }

  abandonSprint(now = new Date().toISOString()): SprintState {
    if (!this.activeSprint) {
      throw new Error("No active sprint");
    }
    const completed = abandonSprintCore(this.activeSprint, now);
    this.store.transaction(() => {
      this.persistCompletedSprint(completed);
    });
    this.activeSprint = undefined;
    return completed;
  }

  pauseSprint(now = new Date().toISOString()): SprintState {
    if (!this.activeSprint) {
      throw new Error("No active sprint");
    }
    const paused = pauseSprintCore(this.activeSprint, now);
    if (isOpenSprint(paused)) {
      this.activeSprint = paused;
      this.store.updateSprintSession(paused);
    } else {
      this.activeSprint = undefined;
      this.persistCompletedSprint(paused);
    }
    return paused;
  }

  resumeSprint(now = new Date().toISOString()): SprintState {
    if (!this.activeSprint) {
      throw new Error("No active sprint");
    }
    const resumed = resumeSprintCore(this.activeSprint, now);
    this.activeSprint = resumed;
    this.store.updateSprintSession(resumed);
    return resumed;
  }

  getState(): unknown {
    return this.activeSprint ? serializeSprintView(this.activeSprint) : null;
  }

  getActiveSprint(): SprintState | undefined {
    return this.activeSprint;
  }

  listHistory(filter: HistoryFilter = {}): AttemptHistoryRow[] {
    return this.store.listAttempts(filter);
  }

  setAttemptUnclear(attemptId: string, unclear: boolean, updatedAt = new Date().toISOString()): AttemptHistoryRow {
    return this.store.setAttemptUnclear(attemptId, unclear, updatedAt);
  }

  listCompletedReviewsForDay(now = new Date().toISOString()): CompletedReviewItem[] {
    const reviewDay = reviewDayFor(now);
    const conservativeSince = new Date(new Date(now).getTime() - 36 * 60 * 60 * 1000).toISOString();
    return this.store
      .listAttempts({ source: "scheduled_review", since: conservativeSince })
      .filter((attempt) => reviewDayFor(attempt.completedAt) === reviewDay)
      .map((attempt) => {
        const puzzle = this.store.getPuzzle(attempt.puzzleId);
        return puzzle ? { attempt, puzzle } : undefined;
      })
      .filter((item): item is CompletedReviewItem => Boolean(item));
  }

  exportLocalData(): LocalDataExport {
    return this.store.exportLocalData();
  }

  importLocalData(data: LocalDataImport): LocalDataImportResult {
    const result = this.store.importLocalData(data);
    return {
      ...result,
      ratings: result.ratings + this.reconcilePersistedRatings()
    };
  }

  clearLocalHistory(): ClearLocalHistoryResult {
    return this.store.transaction(() => this.store.clearLocalHistory());
  }

  getDueReviews(now = new Date().toISOString()): ReviewQueueState[] {
    return this.store.getDueReviews(now);
  }

  listReviewQueue(): ReviewQueueState[] {
    return this.store.listReviewQueue();
  }

  pruneOrphanedReviewQueue(): number {
    return this.store.transaction(() => this.store.pruneOrphanedReviewQueue());
  }

  promoteNextFutureReviewsToDue(now = new Date().toISOString()): ReviewQueueDuePromotionResult {
    return this.store.transaction(() => this.store.promoteNextFutureReviewsToDue(now));
  }

  getDueReviewItems(now = new Date().toISOString()): ReviewQueueItem[] {
    return this.store.getDueReviewItems(now);
  }

  getSessionMistakeReview(sessionId: string): SessionMistakeReviewItem[] {
    return this.store.getSessionMistakeReview(sessionId);
  }

  getPuzzle(id: string): Puzzle | undefined {
    return this.store.getPuzzle(id);
  }

  getHistoryView(query: HistoryQuery): HistoryView {
    return this.store.getHistoryView(query);
  }

  enrollReview(
    context: ReviewContext,
    now = new Date().toISOString(),
    initiatingAttemptId?: string
  ): ReviewQueueState {
    return this.store.transaction(() => this.store.enrollReview(context, now, initiatingAttemptId));
  }

  removeReview(context: ReviewContext, now = new Date().toISOString()): ReviewScheduleRemoval {
    return this.store.transaction(() => this.store.removeReview(context, now));
  }

  getReviewQueueState(context: ReviewContext): ReviewQueueState | undefined {
    return this.store.getReviewQueueState(context);
  }

  getRating(ratingKey: string): RatingRecord {
    return this.store.getRating(ratingKey);
  }

  listSprintSessions(): ExportedSprintSession[] {
    return this.store.listSprintSessions();
  }

  listRatings(): RatingRecord[] {
    return this.store.listRatings();
  }

  listPlayedRatings(): RatingRecord[] {
    return this.store.listPlayedRatings();
  }

  listCustomSprintConfigs() {
    return this.store.listCustomSprintConfigs();
  }

  listPracticeRuns(): PracticeRunRecord[] {
    return this.store.listPracticeRuns().map(clonePracticeRun);
  }

  createPracticeRun(
    command: CreatePracticeRunCommand,
    now = new Date().toISOString()
  ): PracticeRunRecord {
    assertValidManualRating(command.initialRating);
    const existingRuns = this.store.listPracticeRuns();
    const activeCount = existingRuns.filter((run) => !run.archived).length;
    const run = createCustomPracticeRun({
      id: command.id ?? generatePracticeRunId(),
      name: command.name,
      mode: command.mode,
      durationSeconds: command.durationSeconds,
      perPuzzleSeconds: command.perPuzzleSeconds,
      targetCorrect: command.targetCorrect ?? Math.floor(command.durationSeconds / command.perPuzzleSeconds),
      maxMistakes: command.maxMistakes ?? 3,
      ...(command.themes === undefined ? {} : { themes: command.themes }),
      homeOrder: activeCount,
      updatedAt: now,
      existingRuns
    });
    if (!this.canCreatePracticeRun(command)) {
      throw new PracticeRunAvailabilityError();
    }
    this.store.transaction(() => {
      this.store.savePracticeRun(run);
      this.store.saveRating({
        ...createDefaultRating(run.ratingKey),
        rating: command.initialRating
      });
    });
    return clonePracticeRun(run);
  }

  reorderPracticeRun(runId: string, targetRunId: string, now = new Date().toISOString()): PracticeRunRecord[] {
    this.requirePracticeRun(runId, false);
    this.requirePracticeRun(targetRunId, false);
    return this.savePracticeRunCatalog(
      reorderPracticeRuns(this.store.listPracticeRuns(), runId, targetRunId, now)
    );
  }

  archivePracticeRun(runId: string, now = new Date().toISOString()): PracticeRunRecord[] {
    this.requirePracticeRun(runId, false);
    return this.savePracticeRunCatalog(archivePracticeRun(this.store.listPracticeRuns(), runId, now));
  }

  restorePracticeRun(runId: string, now = new Date().toISOString()): PracticeRunRecord[] {
    this.requirePracticeRun(runId, true);
    return this.savePracticeRunCatalog(restorePracticeRun(this.store.listPracticeRuns(), runId, now));
  }

  setPracticeRunRating(runId: string, rating: number): RatingRecord {
    const run = this.requirePracticeRun(runId);
    const current = this.store.getRating(run.ratingKey);
    return current.rating === rating ? current : this.setRating(run.ratingKey, rating);
  }

  getActivePracticeRun(runId: string): PracticeRunRecord {
    return clonePracticeRun(this.requirePracticeRun(runId, false));
  }

  getSettings(): PracticeSettings {
    return this.store.getSettings();
  }

  saveSettings(settings: PracticeSettings): PracticeSettings {
    this.store.saveSettings(settings);
    return this.store.getSettings();
  }

  getReviewReminderPreference(): ReviewReminderPreference {
    return this.store.getReviewReminderPreference();
  }

  saveReviewReminderPreference(preference: ReviewReminderPreference): ReviewReminderPreference {
    return this.store.saveReviewReminderPreference(preference);
  }

  getReviewReminderSettings(): ReviewReminderSettings {
    return this.store.getReviewReminderSettings();
  }

  countEligibleSprintPuzzles(
    command: StartSprintCommand,
    maximum = Number.MAX_SAFE_INTEGER
  ): number {
    const practiceRun = command.practiceRunId === undefined
      ? undefined
      : this.requirePracticeRun(command.practiceRunId, false);
    const config = this.resolveSprintConfig(command, practiceRun);
    const rating = this.store.getRating(config.ratingKey);
    return this.store.countPuzzles({
      ...this.puzzleFilterForCommand(command, config, rating.rating),
      limit: maximum
    });
  }

  countEligiblePracticeRunPuzzles(
    command: CreatePracticeRunCommand,
    maximum = Number.MAX_SAFE_INTEGER
  ): number {
    assertValidManualRating(command.initialRating);
    const config = this.sprintConfigForCommand(command);
    return this.store.countPuzzles({
      ...this.puzzleFilterForCommand(command, config, command.initialRating),
      limit: maximum
    });
  }

  canCreatePracticeRun(command: CreatePracticeRunCommand): boolean {
    return this.countEligiblePracticeRunPuzzles(command, 1) > 0;
  }

  resetRating(ratingKey: string): unknown {
    return this.store.resetRating(ratingKey);
  }

  setRating(ratingKey: string, rating: number): RatingRecord {
    assertValidManualRating(rating);
    const current = this.store.getRating(ratingKey);
    const next: RatingRecord = {
      ...current,
      generation: current.generation + 1,
      games: 0,
      rating,
      ratingDeviation: Math.min(
        current.ratingDeviation ?? DEFAULT_RATING_DEVIATION,
        MANUAL_RATING_DEVIATION_CAP
      )
    };
    this.store.saveRating(next);
    return next;
  }

  private requirePracticeRun(runId: string, archived?: boolean): PracticeRunRecord {
    const run = this.store.listPracticeRuns().find((candidate) => candidate.id === runId);
    if (!run || (archived !== undefined && run.archived !== archived)) {
      throw new Error(`Practice Run ${runId} is not available`);
    }
    return run;
  }

  private savePracticeRunCatalog(nextRuns: readonly PracticeRunRecord[]): PracticeRunRecord[] {
    const previous = new Map(this.store.listPracticeRuns().map((run) => [run.id, run]));
    this.store.transaction(() => {
      for (const run of nextRuns) {
        if (JSON.stringify(previous.get(run.id)) !== JSON.stringify(run)) {
          this.store.savePracticeRun(run);
        }
      }
    });
    return this.listPracticeRuns();
  }

  recordReviewAttempt(command: RecordReviewAttemptCommand, now = new Date().toISOString()): {
    attempt: AttemptEvent;
    review: ReviewQueueState;
  } {
    const completedAt = new Date(now).toISOString();
    const rating = this.store.getRating(command.ratingKey);
    const attempt: AttemptEvent = {
      id: generateReviewAttemptId(command.puzzleId, completedAt),
      source: "scheduled_review",
      sessionId: generateReviewSessionId(command.puzzleId, completedAt),
      puzzleId: command.puzzleId,
      mode: command.mode,
      ratingKey: command.ratingKey,
      result: command.result,
      submittedMove: command.submittedMove,
      expectedMove: command.expectedMove,
      startedAt: command.startedAt ?? completedAt,
      completedAt,
      ratingBefore: rating.rating,
      ...(command.arrowDuelCandidateOrder === undefined ? {} : { arrowDuelCandidateOrder: [...command.arrowDuelCandidateOrder] })
    };
    let review!: ReviewQueueState;
    this.store.transaction(() => {
      this.store.recordAttempt(attempt);
      review = this.store.recordReviewResult(command, command.result, completedAt);
    });
    return { attempt, review };
  }

  recordReviewResult(context: ReviewContext, result: AttemptResult, now = new Date().toISOString()): ReviewQueueState {
    return this.store.recordReviewResult(context, result, now);
  }

  loadFixturePuzzles(puzzles: Puzzle[]): void {
    this.store.seedPuzzles(puzzles);
  }

  setPuzzleSelectionScope(puzzles: Puzzle[] | undefined): void {
    if (puzzles === undefined) {
      this.setPuzzleSelectionScopeIds(undefined);
      return;
    }
    this.store.seedPuzzles(puzzles);
    this.setPuzzleSelectionScopeIds(puzzles.map((puzzle) => puzzle.id));
  }

  setPuzzleSelectionScopeIds(puzzleIds: string[] | undefined): void {
    this.puzzleSelectionScopeIds = puzzleIds;
  }

  private sprintConfigForCommand(command: StartSprintCommand): SprintConfig {
    const configInput: {
      mode: SprintMode;
      durationSeconds: number;
      perPuzzleSeconds: number;
      targetCorrect?: number;
      maxMistakes?: number;
      themes?: string[];
    } = {
      mode: command.mode,
      durationSeconds: command.durationSeconds ?? 5 * 60,
      perPuzzleSeconds: command.perPuzzleSeconds ?? defaultPerPuzzleSeconds(command.mode)
    };
    if (command.targetCorrect !== undefined) {
      configInput.targetCorrect = command.targetCorrect;
    }
    if (command.maxMistakes !== undefined) {
      configInput.maxMistakes = command.maxMistakes;
    }
    const themes = normalizeThemeSelection([
      ...(command.themes ?? []),
      ...(command.theme === undefined ? [] : [command.theme])
    ]);
    if (themes.length > 0) {
      configInput.themes = themes;
    }
    return buildSprintConfig(configInput);
  }

  private resolveSprintConfig(
    command: StartSprintCommand,
    practiceRun: PracticeRunRecord | undefined
  ): SprintConfig {
    const storedRunConfig = practiceRun ? practiceRunSprintConfig(practiceRun) : undefined;
    return storedRunConfig
      ? {
          ...storedRunConfig,
          ...(command.targetCorrect === undefined ? {} : { targetCorrect: command.targetCorrect })
        }
      : this.sprintConfigForCommand(command);
  }

  private puzzleFilterForCommand(command: StartSprintCommand, config: SprintConfig, rating: number): {
    mode: SprintMode;
    limit: number;
    rating?: number;
    minRating?: number;
    maxRating?: number;
    themes?: string[];
    includeIds?: string[];
    randomSeed?: string | number;
  } {
    const puzzleFilter: {
      mode: SprintMode;
      limit: number;
      rating?: number;
      minRating?: number;
      maxRating?: number;
      themes?: string[];
      includeIds?: string[];
      randomSeed?: string | number;
    } = {
      mode: config.mode,
      limit: Math.max(config.targetCorrect + config.maxMistakes, config.targetCorrect),
      rating
    };
    if (command.minRating !== undefined) {
      puzzleFilter.minRating = command.minRating;
    }
    if (command.maxRating !== undefined) {
      puzzleFilter.maxRating = command.maxRating;
    }
    if (config.themes !== undefined) {
      puzzleFilter.themes = [...config.themes];
    }
    if (this.puzzleSelectionScopeIds !== undefined) {
      puzzleFilter.includeIds = this.puzzleSelectionScopeIds;
    }
    if (command.puzzleSelectionSeed !== undefined) {
      puzzleFilter.randomSeed = command.puzzleSelectionSeed;
    }
    return puzzleFilter;
  }

  private persistCompletedSprint(state: SprintState): void {
    this.store.updateSprintSession(state);
    if (state.ratingAfter !== undefined) {
      const rating = this.store.getRating(state.config.ratingKey);
      this.store.saveRating(applySprintRatingChange(rating, {
        ratingBefore: state.ratingBefore,
        ratingAfter: state.ratingAfter,
        ratingChange: state.ratingAfter - state.ratingBefore,
        ratingDeviationBefore: state.ratingDeviationBefore ?? rating.ratingDeviation ?? DEFAULT_RATING_DEVIATION,
        ratingDeviationAfter: state.ratingDeviationAfter ?? rating.ratingDeviation ?? DEFAULT_RATING_DEVIATION,
        volatilityBefore: state.volatilityBefore ?? rating.volatility ?? DEFAULT_VOLATILITY,
        volatilityAfter: state.volatilityAfter ?? rating.volatility ?? DEFAULT_VOLATILITY
      }));
    }
  }

  private reconcilePersistedRatings(): number {
    const sprintSessions = this.store.listSprintSessions();
    let repaired = 0;
    this.store.transaction(() => {
      for (const rating of this.store.listRatings()) {
        const next = reconcileRatingWithSprintSessions(rating, sprintSessions);
        if (!sameRatingRecord(rating, next)) {
          this.store.saveRating(next);
          repaired += 1;
        }
      }
    });
    return repaired;
  }
}

export function sprintView(state: SprintState): unknown {
  return serializeSprintView(state);
}

function sameRatingRecord(left: RatingRecord, right: RatingRecord): boolean {
  return left.key === right.key &&
    left.generation === right.generation &&
    left.rating === right.rating &&
    left.games === right.games &&
    left.ratingDeviation === right.ratingDeviation &&
    left.volatility === right.volatility;
}

function defaultPerPuzzleSeconds(mode: SprintMode): number {
  if (mode === "blitz") {
    return 10;
  }
  if (mode === "arrow_duel") {
    return 30;
  }
  return 20;
}

function isOpenSprint(state: SprintState): boolean {
  return state.status === "active" || state.status === "paused";
}

function buildCustomSprintConfigRecord(input: {
  config: SprintConfig;
  lastStartedAt: string;
  previous?: CustomSprintConfigRecord;
}): CustomSprintConfigRecord {
  return {
    id: customSprintConfigId(input.config),
    mode: input.config.mode,
    ratingKey: input.config.ratingKey,
    durationSeconds: input.config.durationSeconds,
    perPuzzleSeconds: input.config.perPuzzleSeconds,
    targetCorrect: input.config.targetCorrect,
    maxMistakes: input.config.maxMistakes,
    ...(input.config.themes === undefined ? {} : { themes: [...input.config.themes] }),
    lastStartedAt: input.lastStartedAt,
    playCount: (input.previous?.playCount ?? 0) + 1
  };
}

function customSprintConfigId(config: SprintConfig): string {
  const themes = normalizeThemeSelection(config.themes);
  return [
    "custom",
    config.mode,
    config.durationSeconds,
    config.perPuzzleSeconds,
    themes.length > 0 ? themes.join("+") : "mixed"
  ].join("-");
}

function generatePracticeRunId(): string {
  const runtime = globalThis as typeof globalThis & { crypto?: { randomUUID?: () => string } };
  const randomUuid = runtime.crypto?.randomUUID;
  if (typeof randomUuid === "function") {
    return randomUuid.call(runtime.crypto);
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function fixtureNeedsAtLeast(config: SprintConfig): number {
  return Math.max(config.targetCorrect + config.maxMistakes, config.targetCorrect);
}

function reviewContextFromAttempt(attempt: AttemptEvent): ReviewContext {
  return {
    puzzleId: attempt.puzzleId,
    mode: attempt.mode,
    ratingKey: attempt.ratingKey
  };
}

function generateReviewAttemptId(puzzleId: string, completedAt: string): string {
  return `review-attempt:${puzzleId}:${completedAt}`;
}

function generateReviewSessionId(puzzleId: string, completedAt: string): string {
  return `review-session:${puzzleId}:${completedAt}`;
}
