import type { PuzzleTimingPolicy, SprintConfig, SprintMode } from "./types.ts";
import { namedThemesForSelection } from "./theme-catalog.ts";

const DEFAULT_DURATION_SECONDS = 5 * 60;
export const PUZZLE_TIMING_MIN_SECONDS = 10;
export const PUZZLE_TIMING_MAX_SECONDS = 180;
export const PUZZLE_TIMING_STEP_SECONDS = 5;
export const PUZZLE_TIMING_MIN_GAP_SECONDS = 5;

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
  puzzleTiming?: PuzzleTimingPolicy;
  targetCorrect?: number;
  maxMistakes?: number;
  themes?: readonly string[];
  maxAttempts?: number;
  ratingPolicy?: SprintConfig["ratingPolicy"];
  tacticalFocus?: SprintConfig["tacticalFocus"];
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
  if (
    input.maxAttempts !== undefined &&
    (!Number.isInteger(input.maxAttempts) || input.maxAttempts <= 0)
  ) {
    throw new Error("maxAttempts must be a positive integer");
  }
  if (input.tacticalFocus !== undefined && input.ratingPolicy !== "unrated") {
    throw new Error("Tactical Focus Runs must be unrated");
  }
  const tacticalFocusThemes = input.tacticalFocus === undefined
    ? undefined
    : validateTacticalFocus(input.mode, input.maxAttempts, input.tacticalFocus);

  const selectedThemes = namedThemesForSelection(input.themes);
  const puzzleTiming = resolvePuzzleTimingPolicy(
    input.puzzleTiming,
    input.perPuzzleSeconds
  );
  const ratingKey = ratingKeyForConfig({
    mode: input.mode,
    durationSeconds: input.durationSeconds,
    perPuzzleSeconds: input.perPuzzleSeconds,
    themes: selectedThemes
  });

  return {
    mode: input.mode,
    durationSeconds: input.durationSeconds,
    perPuzzleSeconds: input.perPuzzleSeconds,
    puzzleTiming,
    targetCorrect,
    maxMistakes,
    ratingKey,
    ...(selectedThemes.length === 0 ? {} : { themes: selectedThemes }),
    ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
    ...(input.ratingPolicy === undefined ? {} : { ratingPolicy: input.ratingPolicy }),
    ...(input.tacticalFocus === undefined
      ? {}
      : {
          tacticalFocus: {
            ...input.tacticalFocus,
            themes: [...(tacticalFocusThemes ?? [])]
          }
        })
  };
}

function validateTacticalFocus(
  mode: SprintMode,
  maxAttempts: number | undefined,
  focus: NonNullable<SprintConfig["tacticalFocus"]>
): string[] {
  const themes = [...new Set(
    focus.themes.map((theme) => theme.trim()).filter((theme) => theme.length > 0)
  )];
  if (themes.length < 1 || themes.length > 2) {
    throw new Error("Tactical Focus Runs require one or two distinct themes");
  }
  if (
    !Number.isInteger(focus.mixedControlCount) ||
    focus.mixedControlCount <= 0 ||
    maxAttempts === undefined ||
    focus.mixedControlCount >= maxAttempts
  ) {
    throw new Error("Tactical Focus Runs require a bounded mixed allocation");
  }
  if (
    !Number.isFinite(focus.ratingAnchor) ||
    !Number.isFinite(focus.minRating) ||
    !Number.isFinite(focus.maxRating) ||
    focus.minRating > focus.ratingAnchor ||
    focus.ratingAnchor > focus.maxRating
  ) {
    throw new Error("Tactical Focus Rating bounds must contain the anchor");
  }
  const expectedTaskFamily = mode === "arrow_duel" ? "arrow_duel" : "line";
  if (focus.taskFamily !== expectedTaskFamily) {
    throw new Error("Tactical Focus task family must match the Run mode");
  }
  return themes;
}

export function defaultPuzzleTimingPolicy(perPuzzleSeconds: number): PuzzleTimingPolicy {
  if (!Number.isInteger(perPuzzleSeconds) || perPuzzleSeconds <= 0) {
    throw new Error("perPuzzleSeconds must be a positive integer");
  }
  const slowAfterSeconds = normalizeDefaultPuzzleTimingSeconds(
    perPuzzleSeconds * 2,
    PUZZLE_TIMING_MAX_SECONDS - PUZZLE_TIMING_MIN_GAP_SECONDS
  );
  const timeoutAfterSeconds = Math.max(
    slowAfterSeconds + PUZZLE_TIMING_MIN_GAP_SECONDS,
    normalizeDefaultPuzzleTimingSeconds(
      perPuzzleSeconds * 3,
      PUZZLE_TIMING_MAX_SECONDS
    )
  );
  return validatePuzzleTimingPolicy({
    slowAfterSeconds,
    timeoutAfterSeconds
  });
}

export function resolvePuzzleTimingPolicy(
  puzzleTiming: PuzzleTimingPolicy | undefined,
  perPuzzleSeconds: number
): PuzzleTimingPolicy {
  return puzzleTiming === undefined
    ? defaultPuzzleTimingPolicy(perPuzzleSeconds)
    : validatePuzzleTimingPolicy(puzzleTiming);
}

export function validatePuzzleTimingPolicy(
  puzzleTiming: PuzzleTimingPolicy
): PuzzleTimingPolicy {
  const slowAfterSeconds = validateOptionalPuzzleTimingSeconds(
    "slowAfterSeconds",
    puzzleTiming.slowAfterSeconds
  );
  const timeoutAfterSeconds = validateOptionalPuzzleTimingSeconds(
    "timeoutAfterSeconds",
    puzzleTiming.timeoutAfterSeconds
  );
  if (
    slowAfterSeconds !== null &&
    timeoutAfterSeconds !== null &&
    timeoutAfterSeconds - slowAfterSeconds < PUZZLE_TIMING_MIN_GAP_SECONDS
  ) {
    throw new Error(
      `timeoutAfterSeconds must be at least ${PUZZLE_TIMING_MIN_GAP_SECONDS} seconds after slowAfterSeconds`
    );
  }
  return { slowAfterSeconds, timeoutAfterSeconds };
}

function validateOptionalPuzzleTimingSeconds(
  label: keyof PuzzleTimingPolicy,
  value: number | null
): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be a whole number of seconds`);
  }
  if (value < PUZZLE_TIMING_MIN_SECONDS || value > PUZZLE_TIMING_MAX_SECONDS) {
    throw new Error(
      `${label} must be between ${PUZZLE_TIMING_MIN_SECONDS} and ${PUZZLE_TIMING_MAX_SECONDS} seconds`
    );
  }
  if (value % PUZZLE_TIMING_STEP_SECONDS !== 0) {
    throw new Error(`${label} must use ${PUZZLE_TIMING_STEP_SECONDS}-second increments`);
  }
  return value;
}

function normalizeDefaultPuzzleTimingSeconds(
  value: number,
  maximum: number
): number {
  const roundedUp =
    Math.ceil(value / PUZZLE_TIMING_STEP_SECONDS) * PUZZLE_TIMING_STEP_SECONDS;
  return Math.min(maximum, Math.max(PUZZLE_TIMING_MIN_SECONDS, roundedUp));
}

export function ratingKeyForConfig(input: {
  mode: SprintMode;
  durationSeconds: number;
  perPuzzleSeconds: number;
  themes?: readonly string[];
}): string {
  const minutes = formatDurationMinutes(input.durationSeconds);
  const selectedThemes = namedThemesForSelection(input.themes);
  const themePrefix = selectedThemes.length > 0 ? `${selectedThemes.join("+")} ` : "";
  return `${themePrefix}${input.mode} ${minutes}/${input.perPuzzleSeconds}`;
}

function formatDurationMinutes(durationSeconds: number): string {
  if (durationSeconds % 60 === 0) {
    return String(durationSeconds / 60);
  }
  return `${durationSeconds}s`;
}
