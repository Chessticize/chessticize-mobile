import type {
  ArrowDuelState,
  PuzzleFeedback,
  SprintState
} from "../../../../packages/core/src/index.ts";

export type ArrowDuelReplyChallengePhase =
  | "choice"
  | "reply";

export type ArrowDuelReplyChallengePreviewCompletion = {
  expectedMove: string;
  feedback: PuzzleFeedback | null;
  nextState: SprintState;
  puzzleElapsedSeconds?: number;
  result: "correct" | "timed_out" | "wrong";
  submittedFen: string;
  submittedMove: string | null;
  submittedMoveFen: string | null;
};

export type ArrowDuelReplyChallengePreviewTransition = {
  boardAction: "commit" | "none" | "reset";
  boardFen?: string | null;
  completion?: ArrowDuelReplyChallengePreviewCompletion;
  feedbackMoves?: readonly {
    actor: "opponent" | "user";
    move: string;
    preMoveFen: string | null;
  }[];
  lastMove?: string | null;
  phase: ArrowDuelReplyChallengePhase;
  resetReason?: string;
};

export type ArrowDuelReplyChallengeDesignPreview = {
  autoTimeoutMs?: number;
  enabled: boolean;
  replySeconds?: number;
  resolveMove?: (input: {
    boardFen: string | null;
    move: string;
    phase: ArrowDuelReplyChallengePhase;
    puzzle: ArrowDuelState;
    resultFen: string | null;
  }) => ArrowDuelReplyChallengePreviewTransition;
  resolveTimeout?: (input: {
    boardFen: string | null;
    phase: ArrowDuelReplyChallengePhase;
    puzzleElapsedSeconds: number;
    puzzle: ArrowDuelState;
  }) => ArrowDuelReplyChallengePreviewTransition;
};
