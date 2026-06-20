import type { SprintConfig, SprintMode } from "./types.ts";

const DEFAULT_DURATION_SECONDS = 5 * 60;

export function defaultSprintConfig(mode: SprintMode): SprintConfig {
  if (mode === "standard") {
    return buildSprintConfig({ mode, durationSeconds: DEFAULT_DURATION_SECONDS, perPuzzleSeconds: 20 });
  }
  if (mode === "blitz") {
    return buildSprintConfig({ mode, durationSeconds: DEFAULT_DURATION_SECONDS, perPuzzleSeconds: 10 });
  }
  if (mode === "arrow_duel") {
    return buildSprintConfig({ mode, durationSeconds: DEFAULT_DURATION_SECONDS, perPuzzleSeconds: 30 });
  }
  return buildSprintConfig({ mode, durationSeconds: DEFAULT_DURATION_SECONDS, perPuzzleSeconds: 20 });
}

export function buildSprintConfig(input: {
  mode: SprintMode;
  durationSeconds: number;
  perPuzzleSeconds: number;
  targetCorrect?: number;
  maxMistakes?: number;
  theme?: string;
}): SprintConfig {
  if (!Number.isInteger(input.durationSeconds) || input.durationSeconds <= 0) {
    throw new Error("durationSeconds must be a positive integer");
  }
  if (!Number.isInteger(input.perPuzzleSeconds) || input.perPuzzleSeconds <= 0) {
    throw new Error("perPuzzleSeconds must be a positive integer");
  }
  const targetCorrect = input.targetCorrect ?? Math.floor(input.durationSeconds / input.perPuzzleSeconds);
  if (!Number.isInteger(targetCorrect) || targetCorrect <= 0) {
    throw new Error("targetCorrect must be a positive integer");
  }
  const maxMistakes = input.maxMistakes ?? 3;
  if (!Number.isInteger(maxMistakes) || maxMistakes <= 0) {
    throw new Error("maxMistakes must be a positive integer");
  }

  const ratingKeyInput: {
    mode: SprintMode;
    durationSeconds: number;
    perPuzzleSeconds: number;
    theme?: string;
  } = {
    mode: input.mode,
    durationSeconds: input.durationSeconds,
    perPuzzleSeconds: input.perPuzzleSeconds
  };
  if (input.theme) {
    ratingKeyInput.theme = input.theme;
  }
  const ratingKey = ratingKeyForConfig(ratingKeyInput);

  return {
    mode: input.mode,
    durationSeconds: input.durationSeconds,
    perPuzzleSeconds: input.perPuzzleSeconds,
    targetCorrect,
    maxMistakes,
    ratingKey,
    ...(input.theme ? { theme: input.theme } : {})
  };
}

export function ratingKeyForConfig(input: {
  mode: SprintMode;
  durationSeconds: number;
  perPuzzleSeconds: number;
  theme?: string;
}): string {
  const minutes = formatDurationMinutes(input.durationSeconds);
  const themePrefix = input.theme ? `${input.theme} ` : "";
  return `${themePrefix}${input.mode} ${minutes}/${input.perPuzzleSeconds}`;
}

function formatDurationMinutes(durationSeconds: number): string {
  if (durationSeconds % 60 === 0) {
    return String(durationSeconds / 60);
  }
  return `${durationSeconds}s`;
}
