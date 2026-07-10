import { Chess } from "chess.js";

// Pure decision logic for the practice-board premove window: while the
// opponent reply animates, the board stays interactive and user move intents
// are queued, then replayed once the reply settles. This module owns the
// queue/replace/replay decisions so they stay Node-testable; the screen maps
// the returned actions onto board and service calls.

export type BoardInputLockMode = "hard" | "premove";

export type PremoveQueueInput = {
  lockMode: BoardInputLockMode;
  // Current puzzle id when a sprint is active, otherwise null.
  activePuzzleId: string | null;
  // Puzzle id bound to the board callback that produced the move.
  contextPuzzleId: string | null;
  // Position after the opponent reply (the puzzle's current fen).
  replyFen: string | null;
  move: string;
  // True when the move arrived through onMove: the board validated it against
  // its internal position and already applied it.
  boardApplied: boolean;
};

export type PremoveQueueDecision =
  // Window closed or wrong puzzle — fall through to hard-lock handling.
  | { action: "not-open" }
  // Junk intent (illegal against the reply position): swallow it without
  // evicting a previously queued premove or touching the animating board.
  | { action: "ignore"; reason: "illegal-intent" }
  | { action: "queue"; move: string };

export function decidePremoveQueue(input: PremoveQueueInput): PremoveQueueDecision {
  if (input.lockMode !== "premove") {
    return { action: "not-open" };
  }
  if (!input.activePuzzleId || input.contextPuzzleId !== input.activePuzzleId) {
    return { action: "not-open" };
  }
  const move = normalizeUci(input.move);
  if (input.boardApplied) {
    // The board holds this move internally, so it must reach the replay step
    // either to be dispatched or to be rewound — never silently dropped.
    return { action: "queue", move };
  }
  if (!isPlayableIntent(input.replyFen, move)) {
    return { action: "ignore", reason: "illegal-intent" };
  }
  return { action: "queue", move };
}

export type PremoveReplayInput = {
  pending: { puzzleId: string; move: string; boardApplied: boolean } | null;
  // Current puzzle id when a sprint is active, otherwise null.
  activePuzzleId: string | null;
  replyFen: string | null;
  // The board's internal fen at replay time; null when unavailable.
  boardFenNow: string | null;
};

export type PremoveReplayPlan =
  | { action: "none" }
  | { action: "drop"; reason: "stale" | "not-legal"; resetFen: string | null }
  // The board already applied the move; re-sync sprites to appliedFen and
  // re-dispatch the stored move result through the normal submit path.
  | { action: "dispatch-result"; appliedFen: string }
  // Play the move through the board. resyncFen non-null means the board
  // diverged from the reply position and must be reset before playing.
  // appliedFen is null for bare promotion intents (the board's promotion
  // dialog collects the piece during the replay).
  | { action: "play"; move: string; appliedFen: string | null; resyncFen: string | null };

export function planPremoveReplay(input: PremoveReplayInput): PremoveReplayPlan {
  const pending = input.pending;
  if (!pending) {
    return { action: "none" };
  }
  if (!input.activePuzzleId || pending.puzzleId !== input.activePuzzleId) {
    return { action: "drop", reason: "stale", resetFen: null };
  }
  const replyFen = input.replyFen;
  const appliedFen = replyFen ? fenAfterMove(replyFen, pending.move) : null;
  if (pending.boardApplied) {
    if (!appliedFen) {
      return { action: "drop", reason: "not-legal", resetFen: replyFen };
    }
    return { action: "dispatch-result", appliedFen };
  }
  if (!appliedFen && !isBarePromotionIntent(replyFen, pending.move)) {
    return { action: "drop", reason: "not-legal", resetFen: replyFen };
  }
  const boardInSync = !input.boardFenNow || !replyFen ||
    canonicalFen(input.boardFenNow) === canonicalFen(replyFen);
  return {
    action: "play",
    move: pending.move,
    appliedFen,
    resyncFen: boardInSync ? null : replyFen
  };
}

export function isPlayableIntent(replyFen: string | null, move: string): boolean {
  if (!replyFen) {
    return false;
  }
  if (fenAfterMove(replyFen, move)) {
    return true;
  }
  return isBarePromotionIntent(replyFen, move);
}

// A 4-char intent whose move only becomes legal with a promotion piece: the
// choice is collected by the board's promotion dialog at replay time, so
// legality is probed with a queen.
function isBarePromotionIntent(replyFen: string | null, move: string): boolean {
  return move.length === 4 && replyFen !== null && fenAfterMove(replyFen, `${move}q`) !== null;
}

export function normalizeUci(move: string): string {
  return move.trim().toLowerCase();
}

export function fenAfterMove(fen: string, move: string): string | null {
  try {
    const chess = new Chess(fen);
    const normalized = normalizeUci(move);
    const played = chess.move({
      from: normalized.slice(0, 2),
      to: normalized.slice(2, 4),
      ...(normalized.length > 4 ? { promotion: normalized.slice(4, 5) } : {})
    });
    return played ? chess.fen() : null;
  } catch {
    return null;
  }
}

export function fenAfterMoves(fen: string, moves: string[]): string | null {
  let currentFen: string | null = fen;
  for (const move of moves) {
    if (!currentFen) {
      return null;
    }
    currentFen = fenAfterMove(currentFen, move);
  }
  return currentFen;
}

export function canonicalFen(fen: string): string {
  return fen.trim().split(/\s+/).join(" ");
}
