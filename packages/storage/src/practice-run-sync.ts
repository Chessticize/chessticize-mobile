import {
  clonePracticeRun,
  defaultPuzzleTimingPolicy,
  resolveOpponentReplyConfig
} from "../../core/src/index.ts";
import type {
  OpponentReplyConfig,
  PracticeRunRecord,
  PuzzleTimingPolicy
} from "../../core/src/index.ts";

export function compatiblePracticeRun(
  run: PracticeRunRecord,
  fallbackPuzzleTiming?: PuzzleTimingPolicy,
  fallbackOpponentReply?: OpponentReplyConfig
): PracticeRunRecord {
  const cloned = clonePracticeRun(run);
  const opponentReply = resolveOpponentReplyConfig(
    cloned.mode,
    cloned.opponentReply ?? fallbackOpponentReply
  );
  return {
    ...cloned,
    ...(opponentReply === undefined ? {} : { opponentReply }),
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
      compatiblePracticeRun(
        run,
        incomingById.get(run.id)?.puzzleTiming,
        incomingById.get(run.id)?.opponentReply
      )
    ),
    incomingRuns: incomingRuns.map((run) =>
      compatiblePracticeRun(
        run,
        localById.get(run.id)?.puzzleTiming,
        localById.get(run.id)?.opponentReply
      )
    )
  };
}
