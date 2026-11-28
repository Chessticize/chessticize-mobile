import { useEffect, useRef } from "react";
import {
  EngineSearchAbortedError,
  estimateGamePuzzleDifficulty,
  type ManagedHumanPolicyModel,
  type PuzzleExtractionEngine
} from "../../../../../packages/core/src/index.ts";
import type {
  GameReviewStore,
  StoredUserPuzzle
} from "../../../../../packages/storage/src/game-review-store.ts";
import { createNativeHumanPolicyModel } from "../../platform/nativeHumanPolicy.ts";

export interface UseUserPuzzleDifficultyBackfillOptions {
  store: GameReviewStore;
  puzzles: readonly StoredUserPuzzle[];
  getEngine: () => PuzzleExtractionEngine | null;
  paused?: boolean;
  humanPolicy?: ManagedHumanPolicyModel | null;
  onPuzzleRated?: () => void;
}

/**
 * Determine whether an already-stored personal game puzzle needs its difficulty
 * rating computed (or upgraded from fallback `sf_heuristic_v1` to `maia2_sf_v1`).
 */
export function needsDifficultyBackfill(
  puzzle: Pick<StoredUserPuzzle, "ratingSource" | "archived">,
  hasHumanPolicy: boolean
): boolean {
  if (puzzle.archived) {
    return false;
  }
  if (!puzzle.ratingSource || puzzle.ratingSource === "game_anchor") {
    return true;
  }
  return hasHumanPolicy && puzzle.ratingSource === "sf_heuristic_v1";
}

/**
 * Quietly computes offline difficulty ratings for any existing personal game
 * puzzles that were extracted before difficulty estimation (or before Maia-2
 * was bundled), without re-analyzing entire games.
 */
export function useUserPuzzleDifficultyBackfill({
  store,
  puzzles,
  getEngine,
  paused = false,
  humanPolicy,
  onPuzzleRated
}: UseUserPuzzleDifficultyBackfillOptions): void {
  const attemptedIdsRef = useRef<Set<string>>(new Set());
  const runningRef = useRef(false);
  const onPuzzleRatedRef = useRef(onPuzzleRated);
  onPuzzleRatedRef.current = onPuzzleRated;
  const getEngineRef = useRef(getEngine);
  getEngineRef.current = getEngine;
  const humanPolicyPropRef = useRef(humanPolicy);
  humanPolicyPropRef.current = humanPolicy;

  const candidateKey = puzzles
    .filter((p) => !p.archived && (!p.ratingSource || p.ratingSource === "game_anchor" || p.ratingSource === "sf_heuristic_v1"))
    .map((p) => `${p.id}:${p.ratingSource ?? "none"}`)
    .join("|");

  useEffect(() => {
    if (paused || runningRef.current || candidateKey.length === 0) {
      return;
    }

    const engine = getEngineRef.current();
    if (!engine) {
      return;
    }

    const activeHumanPolicy =
      humanPolicyPropRef.current !== undefined
        ? humanPolicyPropRef.current
        : createNativeHumanPolicyModel();

    const targets = puzzles.filter(
      (puzzle) =>
        !attemptedIdsRef.current.has(puzzle.id) &&
        needsDifficultyBackfill(puzzle, activeHumanPolicy !== null)
    );
    if (targets.length === 0) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    runningRef.current = true;

    const run = async (): Promise<void> => {
      try {
        for (const puzzle of targets) {
          if (cancelled || controller.signal.aborted) {
            break;
          }
          attemptedIdsRef.current.add(puzzle.id);

          const arrowDuel =
            puzzle.puzzleKind === "arrow_duel" &&
            puzzle.stockfishBestMove &&
            puzzle.solutionMoves[0]
              ? {
                  bestMove: puzzle.stockfishBestMove,
                  blunderMove: puzzle.solutionMoves[0],
                  bestEvalWhite: puzzle.stockfishEval ?? 0,
                  blunderEvalWhite: puzzle.stockfishEvalAfterFirstMove ?? 0,
                  punishmentLine: puzzle.punishmentLine ?? [],
                  decisionFen: puzzle.initialFen
                }
              : undefined;

          try {
            const estimate = await estimateGamePuzzleDifficulty(
              {
                puzzleKind: puzzle.puzzleKind,
                initialFen: puzzle.initialFen,
                solutionMoves: puzzle.solutionMoves,
                ...(arrowDuel ? { arrowDuel } : {})
              },
              engine,
              {
                ...(activeHumanPolicy ? { humanPolicy: activeHumanPolicy } : {}),
                signal: controller.signal
              }
            );
            if (cancelled || controller.signal.aborted) {
              break;
            }
            store.updateUserPuzzleRating(puzzle.id, estimate.rating, estimate.ratingSource);
            onPuzzleRatedRef.current?.();
          } catch (error) {
            const isAbort =
              cancelled ||
              controller.signal.aborted ||
              error instanceof EngineSearchAbortedError ||
              (error instanceof Error && error.name === "AbortError");
            if (isAbort) {
              // Allow retrying this puzzle later if interrupted by batch analysis or unmount.
              attemptedIdsRef.current.delete(puzzle.id);
              break;
            }
          }
        }
      } finally {
        runningRef.current = false;
        void activeHumanPolicy?.unload();
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [candidateKey, paused, puzzles, store]);
}
