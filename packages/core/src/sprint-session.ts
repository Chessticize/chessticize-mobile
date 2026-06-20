import type {
  AttemptEvent,
  CurrentPuzzleState,
  Puzzle,
  PuzzleFeedback,
  SprintCommandResult,
  SprintConfig,
  SprintEndReason,
  SprintState
} from "./types.ts";
import { calculateRatingUpdate } from "./ratings.ts";
import { beginArrowDuelPuzzle, beginLinePuzzle, submitArrowDuelChoice, submitLineMove } from "./puzzle-session.ts";

export function startSprint(input: {
  id?: string;
  config: SprintConfig;
  puzzles: Puzzle[];
  ratingBefore: number;
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
    currentPuzzleDeadlineAt: puzzleDeadlineAt(startedAt.toISOString(), input.config, deadlineAt),
    correctCount: 0,
    mistakeCount: 0,
    currentPuzzleIndex: 0,
    puzzles: input.puzzles,
    ratingBefore: input.ratingBefore
  };
  return {
    ...state,
    currentPuzzle: buildCurrentPuzzle(input.config.mode, input.puzzles[0], 0)
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
  if (isCurrentPuzzleExpired(timedState, now)) {
    return applyPuzzleFeedback(timedState, buildTimeoutFeedback(timedState.currentPuzzle), now);
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

export function abandonSprint(state: SprintState, now: string): SprintState {
  return completeSprint(state, "failed", "abandoned", now);
}

export function serializeSprintView(state: SprintState): unknown {
  return {
    id: state.id,
    mode: state.config.mode,
    status: state.status,
    startedAt: state.startedAt,
    deadlineAt: state.deadlineAt,
    completedAt: state.completedAt,
    endReason: state.endReason,
    correctCount: state.correctCount,
    mistakeCount: state.mistakeCount,
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

  if (feedback.result === "correct" && !feedback.puzzleSolved) {
    return { state, feedback };
  }

  const attempt = buildAttemptEvent(state, feedback, now);
  const nextCorrectCount = state.correctCount + (feedback.result === "correct" ? 1 : 0);
  const nextMistakeCount = state.mistakeCount + (feedback.result === "wrong" ? 1 : 0);
  const updated: SprintState = {
    ...state,
    correctCount: nextCorrectCount,
    mistakeCount: nextMistakeCount
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
      state: completeSprintWithRating(updated, "failed", "puzzles_exhausted", now),
      feedback,
      attempt
    };
  }

  return {
    state: {
      ...updated,
      currentPuzzleIndex: nextPuzzleIndex,
      currentPuzzleStartedAt: new Date(now).toISOString(),
      currentPuzzleDeadlineAt: puzzleDeadlineAt(now, state.config, state.deadlineAt),
      currentPuzzle: buildCurrentPuzzle(state.config.mode, state.puzzles[nextPuzzleIndex], nextPuzzleIndex)
    },
    feedback,
    attempt
  };
}

function buildAttemptEvent(state: SprintState, feedback: PuzzleFeedback, now: string): AttemptEvent {
  if (!state.currentPuzzle) {
    throw new Error("Cannot build attempt without current puzzle");
  }
  return {
    id: generateId(),
    sessionId: state.id,
    puzzleId: state.currentPuzzle.puzzle.id,
    mode: state.config.mode,
    result: feedback.result,
    submittedMove: feedback.submittedMove,
    expectedMove: feedback.expectedMove,
    startedAt: state.startedAt,
    completedAt: new Date(now).toISOString(),
    ratingBefore: state.ratingBefore
  };
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

function isCurrentPuzzleExpired(state: SprintState, now: string): boolean {
  return Boolean(
    state.currentPuzzleDeadlineAt &&
      new Date(now).getTime() > new Date(state.currentPuzzleDeadlineAt).getTime()
  );
}

function buildTimeoutFeedback(currentPuzzle: CurrentPuzzleState): PuzzleFeedback {
  const expectedMove = currentPuzzle.kind === "arrow_duel"
    ? currentPuzzle.correctMove
    : currentPuzzle.puzzle.solutionMoves[currentPuzzle.cursor];
  if (!expectedMove) {
    throw new Error("Cannot time out puzzle without an expected move");
  }
  return {
    result: "wrong",
    puzzleSolved: false,
    submittedMove: "__timeout__",
    expectedMove,
    autoPlayedMoves: [],
    currentFen: currentPuzzle.currentFen
  };
}

function completeSprintWithRating(
  state: SprintState,
  status: "won" | "failed",
  reason: SprintEndReason,
  now: string
): SprintState {
  const opponentRating = averagePuzzleRating(state.puzzles.slice(0, Math.max(1, state.currentPuzzleIndex + 1)));
  const ratingAfter = calculateRatingUpdate({
    currentRating: state.ratingBefore,
    opponentRating,
    score: status === "won" ? 1 : 0
  });
  return completeSprint({ ...state, ratingAfter }, status, reason, now);
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

function averagePuzzleRating(puzzles: Puzzle[]): number {
  const total = puzzles.reduce((sum, puzzle) => sum + puzzle.rating, 0);
  return Math.round(total / puzzles.length);
}

function buildCurrentPuzzle(mode: SprintConfig["mode"], puzzle: Puzzle | undefined, seed: number): CurrentPuzzleState {
  if (!puzzle) {
    throw new Error("No puzzle available");
  }
  if (mode === "arrow_duel") {
    return beginArrowDuelPuzzle(puzzle, seed);
  }
  return beginLinePuzzle(puzzle);
}

function puzzleDeadlineAt(startedAt: string, config: SprintConfig, sprintDeadlineAt: string): string {
  const candidate = new Date(new Date(startedAt).getTime() + config.perPuzzleSeconds * 1000);
  const sprintDeadline = new Date(sprintDeadlineAt);
  return new Date(Math.min(candidate.getTime(), sprintDeadline.getTime())).toISOString();
}

function generateId(): string {
  const cryptoLike = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoLike?.randomUUID) {
    return cryptoLike.randomUUID();
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
