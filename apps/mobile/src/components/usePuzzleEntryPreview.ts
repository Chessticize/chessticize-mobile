import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChessboardRef } from "react-native-chessboard";
import type { CurrentPuzzleState } from "../../../../packages/core/src/index.ts";
import type { PieceSymbol, Square } from "chess.js";
import {
  puzzleEntryPreviewPlan,
  schedulePuzzleEntryPreview
} from "./puzzleEntryPreview.ts";
import {
  boardMoveToUci,
  consumeSuppressedBoardMove,
  type UciBoardMove
} from "./boardMoveSuppression.ts";
import { isPromiseLike } from "./promiseLike.ts";

export function usePuzzleEntryPreview({
  boardRef,
  currentPuzzle,
  entryKey,
  onLastMove,
  suppressedMovesRef
}: {
  boardRef: { current: ChessboardRef | null };
  currentPuzzle: CurrentPuzzleState | undefined;
  entryKey: string | null;
  onLastMove: (move: UciBoardMove | null) => void;
  suppressedMovesRef: { current: string[] };
}): {
  displayFen: string | null;
  locked: boolean;
  replay: () => void;
} {
  const [completedKey, setCompletedKey] = useState<string | null>(null);
  const [replayToken, setReplayToken] = useState(0);
  const onLastMoveRef = useRef(onLastMove);
  onLastMoveRef.current = onLastMove;
  const plan = useMemo(
    () => entryKey ? puzzleEntryPreviewPlan(currentPuzzle) : null,
    [currentPuzzle, entryKey]
  );
  const previewKey = plan && entryKey ? `${entryKey}:${replayToken}` : null;
  const locked = Boolean(previewKey && completedKey !== previewKey);

  useEffect(() => {
    if (!locked || !plan || !previewKey) {
      return;
    }

    onLastMoveRef.current(null);
    return schedulePuzzleEntryPreview({
      plan,
      playMove: (move) => {
        const board = boardRef.current;
        if (!board) {
          return undefined;
        }
        const suppressedMove = boardMoveToUci(move);
        suppressedMovesRef.current.push(suppressedMove);
        const played = board.move({
          from: move.from as Square,
          to: move.to as Square,
          ...(move.promotion ? { promotion: move.promotion as PieceSymbol } : {})
        });
        if (isPromiseLike(played)) {
          return played.then((resolvedMove) => {
            if (!resolvedMove) {
              consumeSuppressedBoardMove(suppressedMove, suppressedMovesRef.current);
            }
            return resolvedMove;
          });
        }
        if (!played) {
          consumeSuppressedBoardMove(suppressedMove, suppressedMovesRef.current);
        }
        return played;
      },
      onComplete: (played) => {
        if (!played) {
          boardRef.current?.resetBoard(plan.finalFen);
        }
        onLastMoveRef.current(plan.move);
        setCompletedKey(previewKey);
      }
    });
  }, [boardRef, locked, plan, previewKey, suppressedMovesRef]);

  return {
    displayFen: locked && plan ? plan.initialFen : null,
    locked,
    replay: useCallback(() => setReplayToken((token) => token + 1), [])
  };
}
