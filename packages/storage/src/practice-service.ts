import {
  abandonSprint as abandonSprintCore,
  buildSprintConfig,
  pauseSprint as pauseSprintCore,
  RATING_FLOOR,
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
  RatingRecord,
  ReviewContext,
  ReviewQueueItem,
  ReviewQueueState,
  SessionMistakeReviewItem,
  SprintConfig,
  SprintMode,
  SprintState
} from "../../core/src/index.ts";
import type { HistoryFilter } from "./query-types.ts";
import type { ClearLocalHistoryResult, LocalDataExport, PracticeSettings, PracticeStore } from "./practice-store.ts";

export interface StartSprintCommand {
  mode: SprintMode;
  durationSeconds?: number;
  perPuzzleSeconds?: number;
  targetCorrect?: number;
  maxMistakes?: number;
  theme?: string;
  minRating?: number;
  maxRating?: number;
  puzzleSelectionSeed?: string | number;
  persistCustomConfig?: boolean;
}

export interface RecordReviewAttemptCommand extends ReviewContext {
  result: AttemptResult;
  submittedMove: string;
  expectedMove: string;
  startedAt?: string;
}

export class PracticeService {
  private activeSprint: SprintState | undefined;
  private puzzleSelectionScopeIds: string[] | undefined;
  private readonly store: PracticeStore;

  constructor(store: PracticeStore) {
    this.store = store;
  }

  startSprint(command: StartSprintCommand, now = new Date().toISOString()): SprintState {
    if (this.activeSprint && (this.activeSprint.status === "active" || this.activeSprint.status === "paused")) {
      throw new Error("Cannot start a new sprint while another sprint is active");
    }
    const config = this.sprintConfigForCommand(command);
    const rating = this.store.getRating(config.ratingKey);
    const puzzles = this.store.selectPuzzles(this.puzzleFilterForCommand(command, config, rating.rating));
    if (puzzles.length === 0) {
      throw new Error("No eligible puzzles are available for this sprint");
    }

    const sprint = startSprint({
      config,
      puzzles,
      ratingBefore: rating.rating,
      now
    });
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

  listHistory(filter: HistoryFilter = {}): unknown {
    return this.store.listAttempts(filter);
  }

  exportLocalData(): LocalDataExport {
    return this.store.exportLocalData();
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

  getRating(ratingKey: string): RatingRecord {
    return this.store.getRating(ratingKey);
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

  getSettings(): PracticeSettings {
    return this.store.getSettings();
  }

  saveSettings(settings: PracticeSettings): PracticeSettings {
    this.store.saveSettings(settings);
    return this.store.getSettings();
  }

  countEligibleSprintPuzzles(command: StartSprintCommand): number {
    const config = this.sprintConfigForCommand(command);
    const rating = this.store.getRating(config.ratingKey);
    return this.store.selectPuzzles({
      ...this.puzzleFilterForCommand(command, config, rating.rating),
      limit: Number.MAX_SAFE_INTEGER
    }).length;
  }

  resetRating(ratingKey: string): unknown {
    return this.store.resetRating(ratingKey);
  }

  setRating(ratingKey: string, rating: number): RatingRecord {
    if (!Number.isInteger(rating)) {
      throw new Error("Rating must be an integer");
    }
    if (rating < RATING_FLOOR) {
      throw new Error(`Rating must be at least ${RATING_FLOOR}`);
    }
    const current = this.store.getRating(ratingKey);
    const next: RatingRecord = {
      ...current,
      generation: current.generation + 1,
      rating
    };
    this.store.saveRating(next);
    return next;
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
      ratingBefore: rating.rating
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
      theme?: string;
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
    if (command.theme !== undefined) {
      configInput.theme = command.theme;
    }
    return buildSprintConfig(configInput);
  }

  private puzzleFilterForCommand(command: StartSprintCommand, config: SprintConfig, rating: number): {
    mode: SprintMode;
    limit: number;
    rating?: number;
    minRating?: number;
    maxRating?: number;
    theme?: string;
    includeIds?: string[];
    randomSeed?: string | number;
  } {
    const puzzleFilter: {
      mode: SprintMode;
      limit: number;
      rating?: number;
      minRating?: number;
      maxRating?: number;
      theme?: string;
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
    if (command.theme !== undefined) {
      puzzleFilter.theme = command.theme;
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
      this.store.saveRating({
        ...rating,
        rating: state.ratingAfter,
        games: rating.games + 1
      });
    }
  }
}

export function sprintView(state: SprintState): unknown {
  return serializeSprintView(state);
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
    ...(input.config.theme ? { theme: input.config.theme } : {}),
    lastStartedAt: input.lastStartedAt,
    playCount: (input.previous?.playCount ?? 0) + 1
  };
}

function customSprintConfigId(config: SprintConfig): string {
  return [
    "custom",
    config.mode,
    config.durationSeconds,
    config.perPuzzleSeconds,
    config.theme ?? "mixed"
  ].join("-");
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
