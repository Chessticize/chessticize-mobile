import {
  defaultPuzzleTimingPolicy,
  PUZZLE_TIMING_MAX_SECONDS,
  PUZZLE_TIMING_MIN_GAP_SECONDS,
  PUZZLE_TIMING_MIN_SECONDS,
  PUZZLE_TIMING_STEP_SECONDS,
  validatePuzzleTimingPolicy
} from "../../../../packages/core/src/index.ts";
import type { PuzzleTimingPolicy } from "../../../../packages/core/src/index.ts";

export type PuzzleTimingEditorAction =
  | { type: "set-slow"; seconds: number }
  | { type: "set-timeout"; seconds: number }
  | { type: "toggle-slow" }
  | { type: "toggle-timeout" };

export interface PuzzleTimingEditorState {
  policy: PuzzleTimingPolicy;
  slowDisplaySeconds: number;
  slowMaximumSeconds: number;
  timeoutDisplaySeconds: number;
  timeoutMinimumSeconds: number;
}

export function puzzleTimingEditorState(
  puzzleTiming: PuzzleTimingPolicy | undefined,
  perPuzzleSeconds: number
): PuzzleTimingEditorState {
  const defaults = defaultPuzzleTimingPolicy(perPuzzleSeconds);
  const policy = puzzleTiming ?? defaults;
  const slowDisplaySeconds = policy.slowAfterSeconds
    ?? enabledSlowSeconds(defaults.slowAfterSeconds, policy.timeoutAfterSeconds);
  const timeoutDisplaySeconds = policy.timeoutAfterSeconds
    ?? enabledTimeoutSeconds(defaults.timeoutAfterSeconds, policy.slowAfterSeconds);

  return {
    policy,
    slowDisplaySeconds,
    slowMaximumSeconds: policy.timeoutAfterSeconds === null
      ? PUZZLE_TIMING_MAX_SECONDS
      : Math.max(PUZZLE_TIMING_MIN_SECONDS, policy.timeoutAfterSeconds - PUZZLE_TIMING_MIN_GAP_SECONDS),
    timeoutDisplaySeconds,
    timeoutMinimumSeconds: policy.slowAfterSeconds === null
      ? PUZZLE_TIMING_MIN_SECONDS
      : Math.min(PUZZLE_TIMING_MAX_SECONDS, policy.slowAfterSeconds + PUZZLE_TIMING_MIN_GAP_SECONDS)
  };
}

export function updatePuzzleTimingFromEditor(
  puzzleTiming: PuzzleTimingPolicy | undefined,
  perPuzzleSeconds: number,
  action: PuzzleTimingEditorAction
): PuzzleTimingPolicy {
  const editor = puzzleTimingEditorState(puzzleTiming, perPuzzleSeconds);
  const current = editor.policy;

  switch (action.type) {
    case "set-slow":
      return validatePuzzleTimingPolicy({
        ...current,
        slowAfterSeconds: clampToStep(
          action.seconds,
          PUZZLE_TIMING_MIN_SECONDS,
          editor.slowMaximumSeconds
        )
      });
    case "set-timeout":
      return validatePuzzleTimingPolicy({
        ...current,
        timeoutAfterSeconds: clampToStep(
          action.seconds,
          editor.timeoutMinimumSeconds,
          PUZZLE_TIMING_MAX_SECONDS
        )
      });
    case "toggle-slow":
      if (current.slowAfterSeconds !== null) {
        return { ...current, slowAfterSeconds: null };
      }
      return validatePuzzleTimingPolicy({
        slowAfterSeconds: editor.slowDisplaySeconds,
        timeoutAfterSeconds: current.timeoutAfterSeconds === null
          ? null
          : Math.max(
            current.timeoutAfterSeconds,
            editor.slowDisplaySeconds + PUZZLE_TIMING_MIN_GAP_SECONDS
          )
      });
    case "toggle-timeout":
      if (current.timeoutAfterSeconds !== null) {
        return { ...current, timeoutAfterSeconds: null };
      }
      return validatePuzzleTimingPolicy({
        slowAfterSeconds: current.slowAfterSeconds === null
          ? null
          : Math.min(
            current.slowAfterSeconds,
            editor.timeoutDisplaySeconds - PUZZLE_TIMING_MIN_GAP_SECONDS
          ),
        timeoutAfterSeconds: editor.timeoutDisplaySeconds
      });
  }
}

function enabledSlowSeconds(
  defaultSeconds: number | null,
  timeoutAfterSeconds: number | null
): number {
  const preferred = defaultSeconds ?? PUZZLE_TIMING_MIN_SECONDS;
  if (timeoutAfterSeconds === null) {
    return preferred;
  }
  return Math.max(
    PUZZLE_TIMING_MIN_SECONDS,
    Math.min(preferred, timeoutAfterSeconds - PUZZLE_TIMING_MIN_GAP_SECONDS)
  );
}

function enabledTimeoutSeconds(
  defaultSeconds: number | null,
  slowAfterSeconds: number | null
): number {
  const preferred = defaultSeconds ?? PUZZLE_TIMING_MAX_SECONDS;
  if (slowAfterSeconds === null) {
    return preferred;
  }
  return Math.min(
    PUZZLE_TIMING_MAX_SECONDS,
    Math.max(preferred, slowAfterSeconds + PUZZLE_TIMING_MIN_GAP_SECONDS)
  );
}

function clampToStep(value: number, minimum: number, maximum: number): number {
  const rounded = Math.round(value / PUZZLE_TIMING_STEP_SECONDS) * PUZZLE_TIMING_STEP_SECONDS;
  return Math.min(maximum, Math.max(minimum, rounded));
}
