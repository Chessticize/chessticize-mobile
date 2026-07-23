import type { CurrentPuzzleState } from "../../../../packages/core/src/index.ts";
import { canonicalFen, fenAfterMove, normalizeUci } from "../backend/premove.ts";
import { isPromiseLike } from "./promiseLike.ts";

export const PUZZLE_ENTRY_PREVIEW_DELAY_MS = 350;

export type PuzzleEntryPreviewMove = {
  from: string;
  to: string;
  promotion?: string;
};

export type PuzzleEntryPreviewPlan = {
  finalFen: string;
  initialFen: string;
  move: PuzzleEntryPreviewMove;
  moveUci: string;
  puzzleId: string;
};

export function puzzleEntryPreviewPlan(
  currentPuzzle: CurrentPuzzleState | undefined
): PuzzleEntryPreviewPlan | null {
  if (!currentPuzzle || currentPuzzle.kind !== "line") {
    return null;
  }

  const moveUci = currentPuzzle.puzzle.solutionMoves[0];
  const firstPlayedMove = currentPuzzle.playedMoves[0];
  if (
    !moveUci
    || !firstPlayedMove
    || currentPuzzle.cursor !== 1
    || currentPuzzle.playedMoves.length !== 1
    || normalizeUci(firstPlayedMove) !== normalizeUci(moveUci)
  ) {
    return null;
  }

  const finalFen = fenAfterMove(currentPuzzle.puzzle.initialFen, moveUci);
  if (!finalFen || canonicalFen(finalFen) !== canonicalFen(currentPuzzle.currentFen)) {
    return null;
  }

  return {
    finalFen,
    initialFen: currentPuzzle.puzzle.initialFen,
    move: parsePreviewMove(moveUci),
    moveUci,
    puzzleId: currentPuzzle.puzzle.id
  };
}

export function schedulePuzzleEntryPreview({
  delayMs = PUZZLE_ENTRY_PREVIEW_DELAY_MS,
  onComplete,
  plan,
  playMove
}: {
  delayMs?: number;
  onComplete: (played: boolean) => void;
  plan: PuzzleEntryPreviewPlan;
  playMove: (move: PuzzleEntryPreviewMove) => unknown | PromiseLike<unknown>;
}): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timer = null;
    const finish = (played: boolean) => {
      if (!cancelled) {
        onComplete(played);
      }
    };
    try {
      const result = playMove(plan.move);
      if (isPromiseLike(result)) {
        void result.then(
          (played) => finish(Boolean(played)),
          () => finish(false)
        );
      } else {
        finish(Boolean(result));
      }
    } catch {
      finish(false);
    }
  }, delayMs);

  return () => {
    cancelled = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

function parsePreviewMove(move: string): PuzzleEntryPreviewMove {
  return {
    from: move.slice(0, 2),
    to: move.slice(2, 4),
    ...(move.length > 4 ? { promotion: move.slice(4, 5) } : {})
  };
}
