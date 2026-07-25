import {
  clonePracticeRun,
  defaultPuzzleTimingPolicy
} from "../../core/src/index.ts";
import type {
  PracticeRunRecord,
  PuzzleTimingPolicy
} from "../../core/src/index.ts";

export function compatiblePracticeRun(
  run: PracticeRunRecord,
  fallbackPuzzleTiming?: PuzzleTimingPolicy
): PracticeRunRecord {
  const cloned = clonePracticeRun(run);
  return {
    ...cloned,
    puzzleTiming: cloned.puzzleTiming === undefined
      ? fallbackPuzzleTiming === undefined
        ? defaultPuzzleTimingPolicy(cloned.perPuzzleSeconds)
        : { ...fallbackPuzzleTiming }
      : { ...cloned.puzzleTiming }
  };
}

export function compatiblePracticeRunMergeInputs(
  localRuns: readonly PracticeRunRecord[],
  incomingRuns: readonly PracticeRunRecord[]
): {
  localRuns: PracticeRunRecord[];
  incomingRuns: PracticeRunRecord[];
} {
  const localById = new Map(localRuns.map((run) => [run.id, run]));
  const incomingById = new Map(incomingRuns.map((run) => [run.id, run]));
  return {
    localRuns: localRuns.map((run) =>
      compatiblePracticeRun(run, incomingById.get(run.id)?.puzzleTiming)
    ),
    incomingRuns: incomingRuns.map((run) =>
      compatiblePracticeRun(run, localById.get(run.id)?.puzzleTiming)
    )
  };
}
