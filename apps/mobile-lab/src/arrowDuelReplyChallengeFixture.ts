import { Chess } from "chess.js";
import type { PuzzleFeedback } from "../../../packages/core/src/index.ts";
import type { PracticeService } from "../../../packages/storage/src/practice-service.ts";
import type {
  ArrowDuelReplyChallengeDesignPreview,
  ArrowDuelReplyChallengePreviewCompletion,
  ArrowDuelReplyChallengePreviewTransition
} from "../../mobile/src/components/arrowDuelReplyChallengePreview.ts";
import {
  fenAfterMove,
  normalizeUci
} from "../../mobile/src/backend/premove.ts";

type ResolveMove = NonNullable<ArrowDuelReplyChallengeDesignPreview["resolveMove"]>;
type ResolveMoveInput = Parameters<ResolveMove>[0];
type ResolveTimeout = NonNullable<ArrowDuelReplyChallengeDesignPreview["resolveTimeout"]>;
type ResolveTimeoutInput = Parameters<ResolveTimeout>[0];

export function createArrowDuelReplyChallengeFixture(
  service: PracticeService,
  nowIso: () => string
): Pick<ArrowDuelReplyChallengeDesignPreview, "resolveMove" | "resolveTimeout"> {
  return {
    resolveMove: (input) => resolveMove(input, service, nowIso),
    resolveTimeout: (input) => resolveTimeout(input, service, nowIso)
  };
}

function resolveMove(
  { boardFen, move, phase, puzzle, resultFen }: ResolveMoveInput,
  service: PracticeService,
  nowIso: () => string
): ArrowDuelReplyChallengePreviewTransition {
  if (phase === "choice") {
    if (!puzzle.candidates.some((candidate) => normalizeUci(candidate) === normalizeUci(move))) {
      return resetTransition(
        phase,
        puzzle.currentFen,
        "arrow-duel-reply-preview-non-candidate"
      );
    }
    if (normalizeUci(move) !== normalizeUci(puzzle.correctMove)) {
      const submittedMoveFen = resultFen
        ?? fenAfterMove(puzzle.currentFen, move)
        ?? puzzle.currentFen;
      return {
        boardAction: "commit",
        boardFen: submittedMoveFen,
        completion: completePreview(
          service,
          nowIso,
          puzzle.wrongMove,
          {
            expectedMove: puzzle.correctMove,
            result: "wrong",
            submittedFen: puzzle.currentFen,
            submittedMove: move,
            submittedMoveFen
          }
        ),
        feedbackMoves: [{ actor: "user", move, preMoveFen: puzzle.currentFen }],
        lastMove: move,
        phase: "choice"
      };
    }
    const replyFen = fenAfterMove(puzzle.currentFen, puzzle.wrongMove);
    if (!replyFen) {
      return resetTransition(
        phase,
        puzzle.currentFen,
        "arrow-duel-reply-preview-invalid-line"
      );
    }
    if (hasNoLegalReply(replyFen)) {
      const submittedMoveFen = resultFen ?? puzzle.currentFen;
      return {
        boardAction: "commit",
        boardFen: submittedMoveFen,
        completion: completePreview(
          service,
          nowIso,
          puzzle.correctMove,
          {
            expectedMove: puzzle.correctMove,
            result: "correct",
            submittedFen: puzzle.currentFen,
            submittedMove: move,
            submittedMoveFen
          }
        ),
        feedbackMoves: [{ actor: "user", move, preMoveFen: puzzle.currentFen }],
        lastMove: move,
        phase: "choice"
      };
    }
    return {
      boardAction: "reset",
      boardFen: replyFen,
      feedbackMoves: [
        { actor: "user", move, preMoveFen: puzzle.currentFen },
        { actor: "opponent", move: puzzle.wrongMove, preMoveFen: puzzle.currentFen }
      ],
      lastMove: puzzle.wrongMove,
      phase: "reply",
      resetReason: "arrow-duel-reply-preview-handoff"
    };
  }

  const submittedFen = boardFen ?? puzzle.currentFen;
  const expectedReply = puzzle.puzzle.solutionMoves[1] ?? puzzle.correctMove;
  const accepted = normalizeUci(move) === normalizeUci(expectedReply)
    || isImmediateCheckmate(resultFen);
  const submittedMoveFen = resultFen ?? submittedFen;
  return {
    boardAction: "commit",
    boardFen: submittedMoveFen,
    completion: completePreview(
      service,
      nowIso,
      accepted ? puzzle.correctMove : puzzle.wrongMove,
      {
        expectedMove: expectedReply,
        result: accepted ? "correct" : "wrong",
        submittedFen,
        submittedMove: move,
        submittedMoveFen
      }
    ),
    feedbackMoves: [{ actor: "user", move, preMoveFen: submittedFen }],
    lastMove: move,
    phase: "choice"
  };
}

function resolveTimeout(
  { boardFen, phase, puzzle, puzzleElapsedSeconds }: ResolveTimeoutInput,
  service: PracticeService,
  nowIso: () => string
): ArrowDuelReplyChallengePreviewTransition {
  if (phase !== "reply") {
    return { boardAction: "none", phase };
  }
  const submittedFen = boardFen ?? puzzle.currentFen;
  return {
    boardAction: "none",
    completion: completePreview(
      service,
      nowIso,
      puzzle.wrongMove,
      {
        expectedMove: puzzle.puzzle.solutionMoves[1] ?? puzzle.correctMove,
        puzzleElapsedSeconds,
        result: "timed_out",
        submittedFen,
        submittedMove: null,
        submittedMoveFen: null
      }
    ),
    phase: "choice"
  };
}

function completePreview(
  service: PracticeService,
  nowIso: () => string,
  proxyMove: string,
  presentation: Omit<ArrowDuelReplyChallengePreviewCompletion, "feedback" | "nextState">
): ArrowDuelReplyChallengePreviewCompletion {
  const result = service.submitMove(proxyMove, nowIso());
  return {
    ...presentation,
    feedback: (result.feedback as PuzzleFeedback | null) ?? null,
    nextState: result.state
  };
}

function resetTransition(
  phase: ArrowDuelReplyChallengePreviewTransition["phase"],
  boardFen: string | null,
  resetReason: string
): ArrowDuelReplyChallengePreviewTransition {
  return {
    boardAction: "reset",
    boardFen,
    phase,
    resetReason
  };
}

function isImmediateCheckmate(fen: string | null): boolean {
  if (!fen) {
    return false;
  }
  try {
    return new Chess(fen).isCheckmate();
  } catch {
    return false;
  }
}

function hasNoLegalReply(fen: string): boolean {
  try {
    return new Chess(fen).moves().length === 0;
  } catch {
    return false;
  }
}
