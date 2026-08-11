import type {
  Puzzle,
  RatingRecord,
  SprintState,
  SurvivalChallengeType,
  SurvivalLevel,
  SurvivalSprintConfig
} from "./types.ts";
import { startSprint } from "./sprint-session.ts";

export const SURVIVAL_RULE_VERSION = 1;
export const SURVIVAL_MAX_MISTAKES = 3;
export const SURVIVAL_PUZZLE_BATCH_SIZE = 32;

export const SURVIVAL_LEVELS: readonly SurvivalLevel[] = Object.freeze(
  Array.from({ length: 16 }, (_, index) => {
    const minRating = 600 + index * 100;
    return Object.freeze({
      minRating,
      maxRating: minRating === 2100 ? 2200 : minRating + 99
    });
  })
);

export interface StartSurvivalInput {
  id?: string;
  challengeType: SurvivalChallengeType;
  level: SurvivalLevel;
  ratingSourceRunId: string;
  ratingSource: RatingRecord;
  packVersion: number;
  packHash: string;
  eligibleCount: number;
  selectionSeed: string;
  initialPuzzles: Puzzle[];
  selectionStartPuzzleId: string;
  selectionCursorPuzzleId: string;
  selectionWrapped: boolean;
  poolExhaustedAfterBuffer: boolean;
  bestBefore: number | null;
  now: string;
}

export function survivalLevelForRating(rating: number): SurvivalLevel {
  if (!Number.isFinite(rating)) {
    throw new Error("Survival Rating must be finite");
  }
  const clamped = Math.min(2200, Math.max(600, Math.trunc(rating)));
  const minRating = Math.min(2100, Math.floor(clamped / 100) * 100);
  const level = SURVIVAL_LEVELS.find((candidate) => candidate.minRating === minRating);
  if (!level) {
    throw new Error(`Unsupported Survival level for Rating ${rating}`);
  }
  return { ...level };
}

export function assertSurvivalLevel(level: SurvivalLevel): SurvivalLevel {
  const supported = SURVIVAL_LEVELS.find((candidate) => (
    candidate.minRating === level.minRating && candidate.maxRating === level.maxRating
  ));
  if (!supported) {
    throw new Error(`Unsupported Survival level ${level.minRating}-${level.maxRating}`);
  }
  return { ...supported };
}

export function survivalRunKey(input: {
  challengeType: SurvivalChallengeType;
  level: SurvivalLevel;
  ruleVersion?: number;
}): string {
  const level = assertSurvivalLevel(input.level);
  const ruleVersion = input.ruleVersion ?? SURVIVAL_RULE_VERSION;
  if (!Number.isSafeInteger(ruleVersion) || ruleVersion < 1) {
    throw new Error("Survival rule version must be a positive integer");
  }
  return `${input.challengeType}:${level.minRating}:${level.maxRating}:v${ruleVersion}`;
}

export function startSurvival(input: StartSurvivalInput): SprintState {
  const level = assertSurvivalLevel(input.level);
  if (!Number.isSafeInteger(input.eligibleCount) || input.eligibleCount < 1) {
    throw new Error("Survival requires a positive eligible puzzle count");
  }
  if (input.initialPuzzles.length < 1) {
    throw new Error("Survival requires an initial puzzle batch");
  }
  if (input.initialPuzzles.length > SURVIVAL_PUZZLE_BATCH_SIZE) {
    throw new Error("Survival initial puzzle batch exceeds the bounded batch size");
  }
  if (input.initialPuzzles.length > input.eligibleCount) {
    throw new Error("Survival initial puzzle batch exceeds the eligible pool snapshot");
  }
  assertUniquePuzzleIds(input.initialPuzzles);
  const challengeType = input.challengeType;
  const survival: SurvivalSprintConfig = {
    challengeType,
    ruleVersion: SURVIVAL_RULE_VERSION,
    minRating: level.minRating,
    maxRating: level.maxRating,
    ratingSourceRunId: input.ratingSourceRunId,
    ratingSourceRating: input.ratingSource.rating,
    ratingSourceGeneration: input.ratingSource.generation,
    ...(input.ratingSource.ratingDeviation === undefined
      ? {}
      : { ratingSourceDeviation: input.ratingSource.ratingDeviation }),
    packVersion: input.packVersion,
    packHash: input.packHash,
    eligibleCount: input.eligibleCount,
    selectionSeed: input.selectionSeed
  };
  const state = startSprint({
    ...(input.id === undefined ? {} : { id: input.id }),
    config: {
      mode: challengeType === "arrow_duel" ? "arrow_duel" : "standard",
      durationSeconds: 1,
      perPuzzleSeconds: 1,
      puzzleTiming: {
        slowAfterSeconds: null,
        timeoutAfterSeconds: null
      },
      targetCorrect: input.eligibleCount,
      maxMistakes: SURVIVAL_MAX_MISTAKES,
      ratingKey: input.ratingSource.key,
      ratingPolicy: "unrated",
      ...(challengeType === "arrow_duel"
        ? { opponentReply: { enabled: true, seconds: 1 } }
        : {}),
      survival
    },
    puzzles: [...input.initialPuzzles],
    ratingBefore: input.ratingSource.rating,
    ratingBeforeRecord: input.ratingSource,
    now: input.now
  });
  return {
    ...state,
    survival: {
      selectionStartPuzzleId: input.selectionStartPuzzleId,
      selectionCursorPuzzleId: input.selectionCursorPuzzleId,
      selectionWrapped: input.selectionWrapped,
      poolExhaustedAfterBuffer: input.poolExhaustedAfterBuffer,
      loadedPuzzleCount: input.initialPuzzles.length,
      consumedPuzzleCount: 0,
      pauseCount: 0,
      sittings: 1,
      lastTouchedAt: new Date(input.now).toISOString(),
      bestBefore: input.bestBefore
    }
  };
}

export function appendSurvivalPuzzleBatch(input: {
  state: SprintState;
  puzzles: readonly Puzzle[];
  selectionCursorPuzzleId: string;
  selectionWrapped: boolean;
  poolExhaustedAfterBuffer: boolean;
  now: string;
}): SprintState {
  const progress = requireSurvivalProgress(input.state);
  if (input.state.status !== "active") {
    throw new Error("Only an active Survival Run can refill puzzles");
  }
  if (input.puzzles.length > SURVIVAL_PUZZLE_BATCH_SIZE) {
    throw new Error("Survival refill exceeds the bounded batch size");
  }
  assertUniquePuzzleIds([...input.state.puzzles, ...input.puzzles]);
  const loadedPuzzleCount = progress.loadedPuzzleCount + input.puzzles.length;
  if (loadedPuzzleCount > input.state.config.survival!.eligibleCount) {
    throw new Error("Survival refill exceeds the eligible pool snapshot");
  }
  return {
    ...input.state,
    puzzles: [...input.state.puzzles, ...input.puzzles],
    survival: {
      ...progress,
      selectionCursorPuzzleId: input.selectionCursorPuzzleId,
      selectionWrapped: input.selectionWrapped,
      poolExhaustedAfterBuffer: input.poolExhaustedAfterBuffer,
      loadedPuzzleCount,
      lastTouchedAt: new Date(input.now).toISOString()
    }
  };
}

export function compactSurvivalPuzzleBuffer(
  state: SprintState,
  now: string,
  consumedPuzzle: boolean
): SprintState {
  const progress = requireSurvivalProgress(state);
  if (state.status !== "active" || !state.currentPuzzle) {
    return touchSurvivalState(state, now, consumedPuzzle);
  }
  const remaining = state.puzzles.slice(state.currentPuzzleIndex);
  if (remaining.length < 1 || remaining[0]?.id !== state.currentPuzzle.puzzle.id) {
    throw new Error("Survival puzzle buffer no longer matches the active puzzle");
  }
  return {
    ...state,
    currentPuzzleIndex: 0,
    puzzles: remaining,
    survival: {
      ...progress,
      consumedPuzzleCount: progress.consumedPuzzleCount + Number(consumedPuzzle),
      lastTouchedAt: new Date(now).toISOString()
    }
  };
}

export function touchSurvivalState(
  state: SprintState,
  now: string,
  consumedPuzzle = false
): SprintState {
  const progress = requireSurvivalProgress(state);
  return {
    ...state,
    survival: {
      ...progress,
      consumedPuzzleCount: progress.consumedPuzzleCount + Number(consumedPuzzle),
      lastTouchedAt: new Date(now).toISOString()
    }
  };
}

export function beginSurvivalSitting(state: SprintState, now: string): SprintState {
  const progress = requireSurvivalProgress(state);
  return {
    ...state,
    survival: {
      ...progress,
      sittings: progress.sittings + 1,
      lastTouchedAt: new Date(now).toISOString()
    }
  };
}

export function isSurvivalSprint(state: Pick<SprintState, "config">): boolean {
  return state.config.survival !== undefined;
}

function requireSurvivalProgress(state: SprintState): NonNullable<SprintState["survival"]> {
  if (!state.config.survival || !state.survival) {
    throw new Error("Sprint is not a Survival Run");
  }
  return state.survival;
}

function assertUniquePuzzleIds(puzzles: readonly Puzzle[]): void {
  const ids = new Set<string>();
  for (const puzzle of puzzles) {
    if (ids.has(puzzle.id)) {
      throw new Error(`Survival puzzle ${puzzle.id} was selected more than once`);
    }
    ids.add(puzzle.id);
  }
}
