import type {
  AttemptEvent,
  CurrentPuzzleState,
  Puzzle,
  PuzzleFeedback,
  RatingRecord,
  SprintCommandResult,
  SprintConfig,
  SprintEndReason,
  SprintState
} from "./types.ts";
import { calculateSprintRatingChange, DEFAULT_RATING_DEVIATION, DEFAULT_VOLATILITY } from "./ratings.ts";
import { beginArrowDuelPuzzle, beginLinePuzzle, submitArrowDuelChoice, submitLineMove } from "./puzzle-session.ts";

export function startSprint(input: {
  id?: string;
  config: SprintConfig;
  puzzles: Puzzle[];
  ratingBefore: number;
  ratingBeforeRecord?: RatingRecord;
  now: string;
}): SprintState {
  if (input.puzzles.length === 0) {
    throw new Error("Cannot start a sprint without puzzles");
  }
  const startedAt = new Date(input.now);
  const deadlineAt = new Date(startedAt.getTime() + input.config.durationSeconds * 1000).toISOString();
  const state: SprintState = {
    id: input.id ?? generateId(),
    config: input.config,
    status: "active",
    startedAt: startedAt.toISOString(),
    deadlineAt,
    currentPuzzleStartedAt: startedAt.toISOString(),
    correctCount: 0,
    mistakeCount: 0,
    currentStreak: 0,
    bestStreak: 0,
    hasUserSubmittedMove: false,
    currentPuzzleIndex: 0,
    puzzles: input.puzzles,
    ratingBefore: input.ratingBefore,
    ratingGamesBefore: input.ratingBeforeRecord?.games ?? 0,
    ratingDeviationBefore: input.ratingBeforeRecord?.ratingDeviation ?? DEFAULT_RATING_DEVIATION,
    volatilityBefore: input.ratingBeforeRecord?.volatility ?? DEFAULT_VOLATILITY
  };
  return {
    ...state,
    currentPuzzle: buildCurrentPuzzle(input.config.mode, input.puzzles[0], candidateSeed(state, 0))
  };
}

export function submitSprintMove(state: SprintState, move: string, now: string): SprintCommandResult {
  const timedState = failIfExpired(state, now);
  if (timedState.status !== "active") {
    return { state: timedState };
  }
  if (!timedState.currentPuzzle) {
    throw new Error("Sprint has no current puzzle");
  }
  if (timedState.currentPuzzle.kind === "arrow_duel") {
    const { state: puzzleState, feedback } = submitArrowDuelChoice(timedState.currentPuzzle, move);
    return applyPuzzleFeedback(
      {
        ...timedState,
        currentPuzzle: puzzleState
      },
      feedback,
      now
    );
  }

  const { state: puzzleState, feedback } = submitLineMove(timedState.currentPuzzle, move);
  return applyPuzzleFeedback(
    {
      ...timedState,
      currentPuzzle: puzzleState
    },
    feedback,
    now
  );
}

export function pauseSprint(state: SprintState, now: string): SprintState {
  const timedState = failIfExpired(state, now);
  if (timedState.status !== "active") {
    return timedState;
  }
  return {
    ...timedState,
    status: "paused",
    pausedAt: new Date(now).toISOString()
  };
}

export function resumeSprint(state: SprintState, now: string): SprintState {
  if (state.status !== "paused") {
    return state;
  }
  const pausedAt = state.pausedAt ? new Date(state.pausedAt).getTime() : new Date(now).getTime();
  const resumedAt = new Date(now).getTime();
  const pausedMs = Math.max(0, resumedAt - pausedAt);
  const {
    pausedAt: _pausedAt,
    ...withoutPausedAt
  } = state;
  return {
    ...withoutPausedAt,
    status: "active",
    deadlineAt: shiftIso(state.deadlineAt, pausedMs),
    ...(state.currentPuzzleDeadlineAt ? { currentPuzzleDeadlineAt: shiftIso(state.currentPuzzleDeadlineAt, pausedMs) } : {}),
    totalPausedMs: (state.totalPausedMs ?? 0) + pausedMs
  };
}

export function abandonSprint(state: SprintState, now: string): SprintState {
  if (!state.hasUserSubmittedMove) {
    return completeSprint(state, "abandoned", "abandoned", now);
  }
  return completeSprintWithRating(state, "failed", "abandoned", now);
}

export function serializeSprintView(state: SprintState): unknown {
  return {
    id: state.id,
    mode: state.config.mode,
    status: state.status,
    startedAt: state.startedAt,
    deadlineAt: state.deadlineAt,
    pausedAt: state.pausedAt,
    totalPausedMs: state.totalPausedMs ?? 0,
    completedAt: state.completedAt,
    endReason: state.endReason,
    correctCount: state.correctCount,
    mistakeCount: state.mistakeCount,
    currentStreak: state.currentStreak,
    bestStreak: state.bestStreak,
    hasUserSubmittedMove: state.hasUserSubmittedMove,
    targetCorrect: state.config.targetCorrect,
    maxMistakes: state.config.maxMistakes,
    ratingKey: state.config.ratingKey,
    ratingBefore: state.ratingBefore,
    ratingAfter: state.ratingAfter,
    currentPuzzleStartedAt: state.currentPuzzleStartedAt,
    currentPuzzleDeadlineAt: state.currentPuzzleDeadlineAt,
    currentPuzzle: state.currentPuzzle ? serializeCurrentPuzzleView(state.currentPuzzle) : null
  };
}

export function serializeCurrentPuzzleView(currentPuzzle: CurrentPuzzleState): unknown {
  if (currentPuzzle.kind === "arrow_duel") {
    return {
      kind: currentPuzzle.kind,
      puzzleId: currentPuzzle.puzzle.id,
      currentFen: currentPuzzle.currentFen,
      rating: currentPuzzle.puzzle.rating,
      themes: currentPuzzle.puzzle.themes,
      candidates: currentPuzzle.candidates,
      selectedMove: currentPuzzle.selectedMove,
      solved: currentPuzzle.solved
    };
  }
  return {
    kind: currentPuzzle.kind,
    puzzleId: currentPuzzle.puzzle.id,
    currentFen: currentPuzzle.currentFen,
    rating: currentPuzzle.puzzle.rating,
    themes: currentPuzzle.puzzle.themes,
    playedMoves: currentPuzzle.playedMoves,
    userMoveNumber: Math.ceil(currentPuzzle.cursor / 2),
    solved: currentPuzzle.solved
  };
}

function applyPuzzleFeedback(state: SprintState, feedback: PuzzleFeedback, now: string): SprintCommandResult {
  if (!state.currentPuzzle) {
    throw new Error("Sprint has no current puzzle");
  }
  const stateWithSubmittedMove: SprintState = {
    ...state,
    hasUserSubmittedMove: true
  };

  if (feedback.result === "correct" && !feedback.puzzleSolved) {
    return { state: stateWithSubmittedMove, feedback };
  }

  const attempt = buildAttemptEvent(stateWithSubmittedMove, feedback, now);
  const nextCorrectCount = state.correctCount + (feedback.result === "correct" ? 1 : 0);
  const nextMistakeCount = state.mistakeCount + (feedback.result === "wrong" ? 1 : 0);
  const nextCurrentStreak = feedback.result === "correct" ? state.currentStreak + 1 : 0;
  const nextBestStreak = Math.max(state.bestStreak, nextCurrentStreak);
  const updated: SprintState = {
    ...stateWithSubmittedMove,
    correctCount: nextCorrectCount,
    mistakeCount: nextMistakeCount,
    currentStreak: nextCurrentStreak,
    bestStreak: nextBestStreak
  };

  if (nextCorrectCount >= state.config.targetCorrect) {
    return {
      state: completeSprintWithRating(updated, "won", "target_reached", now),
      feedback,
      attempt
    };
  }

  if (nextMistakeCount >= state.config.maxMistakes) {
    return {
      state: completeSprintWithRating(updated, "failed", "max_mistakes", now),
      feedback,
      attempt
    };
  }

  const nextPuzzleIndex = state.currentPuzzleIndex + 1;
  if (nextPuzzleIndex >= state.puzzles.length) {
    return {
      state: completeSprintWithRating(updated, "won", "puzzles_exhausted", now),
      feedback,
      attempt
    };
  }

  return {
    state: {
      ...updated,
      currentPuzzleIndex: nextPuzzleIndex,
      currentPuzzleStartedAt: new Date(now).toISOString(),
      currentPuzzle: buildCurrentPuzzle(state.config.mode, state.puzzles[nextPuzzleIndex], candidateSeed(state, nextPuzzleIndex))
    },
    feedback,
    attempt
  };
}

function buildAttemptEvent(state: SprintState, feedback: PuzzleFeedback, now: string): AttemptEvent {
  if (!state.currentPuzzle) {
    throw new Error("Cannot build attempt without current puzzle");
  }
  const attempt: AttemptEvent = {
    id: generateId(),
    source: "sprint",
    sessionId: state.id,
    puzzleId: state.currentPuzzle.puzzle.id,
    mode: state.config.mode,
    ratingKey: state.config.ratingKey,
    result: feedback.result,
    submittedMove: feedback.submittedMove,
    expectedMove: feedback.expectedMove,
    startedAt: state.startedAt,
    completedAt: new Date(now).toISOString(),
    ratingBefore: state.ratingBefore
  };
  if (state.currentPuzzle.kind === "arrow_duel") {
    attempt.arrowDuelCandidateOrder = [...state.currentPuzzle.candidates];
  }
  return attempt;
}

function failIfExpired(state: SprintState, now: string): SprintState {
  if (state.status !== "active") {
    return state;
  }
  if (new Date(now).getTime() <= new Date(state.deadlineAt).getTime()) {
    return state;
  }
  return completeSprintWithRating(state, "failed", "time_expired", now);
}

function completeSprintWithRating(
  state: SprintState,
  status: "won" | "failed",
  reason: SprintEndReason,
  now: string
): SprintState {
  const ratingChange = calculateSprintRatingChange({
    rating: {
      rating: state.ratingBefore,
      ratingDeviation: state.ratingDeviationBefore,
      volatility: state.volatilityBefore,
      games: state.ratingGamesBefore ?? 0
    },
    won: status === "won"
  });
  return completeSprint({
    ...state,
    ratingAfter: ratingChange.ratingAfter,
    ratingDeviationAfter: ratingChange.ratingDeviationAfter,
    volatilityAfter: ratingChange.volatilityAfter
  }, status, reason, now);
}

function completeSprint(
  state: SprintState,
  status: "won" | "failed" | "abandoned",
  reason: SprintEndReason,
  now: string
): SprintState {
  const {
    currentPuzzle: _currentPuzzle,
    currentPuzzleStartedAt: _currentPuzzleStartedAt,
    currentPuzzleDeadlineAt: _currentPuzzleDeadlineAt,
    ...withoutActivePuzzle
  } = state;
  return {
    ...withoutActivePuzzle,
    status,
    endReason: reason,
    completedAt: new Date(now).toISOString()
  };
}

function buildCurrentPuzzle(mode: SprintConfig["mode"], puzzle: Puzzle | undefined, seed: string): CurrentPuzzleState {
  if (!puzzle) {
    throw new Error("No puzzle available");
  }
  if (mode === "arrow_duel") {
    return beginArrowDuelPuzzle(puzzle, seed);
  }
  return beginLinePuzzle(puzzle);
}

function candidateSeed(state: SprintState, puzzleIndex: number): string {
  const puzzle = state.puzzles[puzzleIndex];
  return `${state.id}:${puzzle?.id ?? "missing"}:${puzzleIndex}`;
}

function shiftIso(iso: string, deltaMs: number): string {
  return new Date(new Date(iso).getTime() + deltaMs).toISOString();
}

function generateId(): string {
  const cryptoLike = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoLike?.randomUUID) {
    return cryptoLike.randomUUID();
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
