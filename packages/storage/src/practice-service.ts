import {
  abandonSprint as abandonSprintCore,
  buildSprintConfig,
  serializeSprintView,
  startSprint,
  submitSprintMove
} from "../../core/src/index.ts";
import type {
  AttemptEvent,
  Puzzle,
  RatingRecord,
  SprintConfig,
  SprintMode,
  SprintState
} from "../../core/src/index.ts";
import type { HistoryFilter } from "./query-types.ts";
import type { PracticeStore } from "./practice-store.ts";

export interface StartSprintCommand {
  mode: SprintMode;
  durationSeconds?: number;
  perPuzzleSeconds?: number;
  targetCorrect?: number;
  maxMistakes?: number;
  theme?: string;
  minRating?: number;
  maxRating?: number;
}

export class PracticeService {
  private activeSprint: SprintState | undefined;
  private readonly store: PracticeStore;

  constructor(store: PracticeStore) {
    this.store = store;
  }

  startSprint(command: StartSprintCommand, now = new Date().toISOString()): SprintState {
    if (this.activeSprint?.status === "active") {
      throw new Error("Cannot start a new sprint while another sprint is active");
    }
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
    const config = buildSprintConfig(configInput);
    const rating = this.store.getRating(config.ratingKey);
    const puzzleFilter: {
      mode: SprintMode;
      limit: number;
      minRating?: number;
      maxRating?: number;
      theme?: string;
    } = {
      mode: config.mode,
      limit: Math.max(config.targetCorrect + config.maxMistakes, config.targetCorrect)
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
    const puzzles = this.store.selectPuzzles(puzzleFilter);
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
    this.store.createSprintSession(sprint);
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
          this.store.scheduleMistakeReview(attemptToReturn.puzzleId, attemptToReturn.completedAt);
        }
      }

      if (result.state.status !== "active") {
        this.persistCompletedSprint(result.state);
      }
    });

    if (result.state.status === "active") {
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

  getState(): unknown {
    return this.activeSprint ? serializeSprintView(this.activeSprint) : null;
  }

  listHistory(filter: HistoryFilter = {}): unknown {
    return this.store.listAttempts(filter);
  }

  getDueReviews(now = new Date().toISOString()): unknown {
    return this.store.getDueReviews(now);
  }

  getRating(ratingKey: string): RatingRecord {
    return this.store.getRating(ratingKey);
  }

  resetRating(ratingKey: string): unknown {
    return this.store.resetRating(ratingKey);
  }

  loadFixturePuzzles(puzzles: Puzzle[]): void {
    this.store.seedPuzzles(puzzles);
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

export function fixtureNeedsAtLeast(config: SprintConfig): number {
  return Math.max(config.targetCorrect + config.maxMistakes, config.targetCorrect);
}
