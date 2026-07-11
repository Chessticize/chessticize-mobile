import { Chess } from "chess.js";
import {
  canonicalFen,
  decidePremoveQueue,
  fenAfterMove,
  isPlayableIntent,
  planPremoveReplay
} from "../src/backend/premove";

const START_FEN = new Chess().fen();
// White queen on e2 mirrors the standard-sequence fixture shape: e2e6 is
// legal, d8a8 (black rook squares) can never be a white move.
const REPLY_FEN = "r3k3/5p2/8/8/8/8/4Q3/4K3 w - - 0 1";
const PROMOTION_FEN = "4k3/6P1/8/8/8/8/8/4K3 w - - 0 1";

describe("decidePremoveQueue", () => {
  const base = {
    lockMode: "premove" as const,
    activePuzzleId: "p1",
    contextPuzzleId: "p1",
    replyFen: REPLY_FEN,
    boardApplied: false
  };

  it("is closed outside the premove window", () => {
    expect(decidePremoveQueue({ ...base, move: "e2e6", lockMode: "hard" })).toEqual({ action: "not-open" });
  });

  it("is closed without an active puzzle or for a mismatched context", () => {
    expect(decidePremoveQueue({ ...base, move: "e2e6", activePuzzleId: null })).toEqual({ action: "not-open" });
    expect(decidePremoveQueue({ ...base, move: "e2e6", contextPuzzleId: "p2" })).toEqual({ action: "not-open" });
  });

  it("queues a playable intent with the move normalized", () => {
    expect(decidePremoveQueue({ ...base, move: " E2E6 " })).toEqual({ action: "queue", move: "e2e6" });
  });

  it("swallows junk intents instead of queueing them", () => {
    expect(decidePremoveQueue({ ...base, move: "d8a8" })).toEqual({ action: "ignore", reason: "illegal-intent" });
  });

  it("always queues board-applied moves so the replay can reconcile the board", () => {
    expect(decidePremoveQueue({ ...base, move: "d8a8", boardApplied: true })).toEqual({ action: "queue", move: "d8a8" });
  });

  it("queues a bare promotion intent", () => {
    expect(decidePremoveQueue({ ...base, replyFen: PROMOTION_FEN, move: "g7g8" })).toEqual({ action: "queue", move: "g7g8" });
  });
});

describe("planPremoveReplay", () => {
  const pendingBoard = { puzzleId: "p1", move: "e2e6", boardApplied: false };
  const boardApplied = { puzzleId: "p1", move: "e2e6", boardApplied: true };
  const base = {
    activePuzzleId: "p1",
    replyFen: REPLY_FEN,
    boardFenNow: REPLY_FEN
  };

  it("does nothing without a pending intent", () => {
    expect(planPremoveReplay({ ...base, pending: null })).toEqual({ action: "none" });
  });

  it("drops stale intents without touching the board", () => {
    expect(planPremoveReplay({ ...base, pending: pendingBoard, activePuzzleId: null }))
      .toEqual({ action: "drop", reason: "stale", resetFen: null });
    expect(planPremoveReplay({ ...base, pending: { ...pendingBoard, puzzleId: "p0" } }))
      .toEqual({ action: "drop", reason: "stale", resetFen: null });
  });

  it("dispatches a board-applied move that is legal in the reply position", () => {
    const plan = planPremoveReplay({ ...base, pending: boardApplied });
    expect(plan).toEqual({ action: "dispatch-result", appliedFen: fenAfterMove(REPLY_FEN, "e2e6") });
  });

  it("rewinds a board-applied move that is illegal in the reply position", () => {
    expect(planPremoveReplay({ ...base, pending: { ...boardApplied, move: "d8a8" } }))
      .toEqual({ action: "drop", reason: "not-legal", resetFen: REPLY_FEN });
  });

  it("plays a pending intent when the board matches the reply position", () => {
    expect(planPremoveReplay({ ...base, pending: pendingBoard })).toEqual({
      action: "play",
      move: "e2e6",
      appliedFen: fenAfterMove(REPLY_FEN, "e2e6"),
      resyncFen: null
    });
  });

  it("re-syncs a diverged board before playing", () => {
    const plan = planPremoveReplay({ ...base, pending: pendingBoard, boardFenNow: START_FEN });
    expect(plan).toEqual({
      action: "play",
      move: "e2e6",
      appliedFen: fenAfterMove(REPLY_FEN, "e2e6"),
      resyncFen: REPLY_FEN
    });
  });

  it("assumes the board is in sync when its state is unavailable", () => {
    const plan = planPremoveReplay({ ...base, pending: pendingBoard, boardFenNow: null });
    expect(plan).toMatchObject({ action: "play", resyncFen: null });
  });

  it("drops pending intents that are illegal in the reply position", () => {
    expect(planPremoveReplay({ ...base, pending: { ...pendingBoard, move: "d8a8" } }))
      .toEqual({ action: "drop", reason: "not-legal", resetFen: REPLY_FEN });
  });

  it("plays a bare promotion intent without a precomputed fen", () => {
    const plan = planPremoveReplay({
      ...base,
      replyFen: PROMOTION_FEN,
      boardFenNow: PROMOTION_FEN,
      pending: { puzzleId: "p1", move: "g7g8", boardApplied: false }
    });
    expect(plan).toEqual({ action: "play", move: "g7g8", appliedFen: null, resyncFen: null });
  });
});

describe("fen helpers", () => {
  it("treats formatting-only fen differences as equal positions", () => {
    expect(canonicalFen(`  ${REPLY_FEN.replace(" ", "  ")} `)).toBe(REPLY_FEN);
  });

  it("accepts promotion intents only when a promoted move is legal", () => {
    expect(isPlayableIntent(PROMOTION_FEN, "g7g8")).toBe(true);
    expect(isPlayableIntent(PROMOTION_FEN, "e1e2")).toBe(true);
    expect(isPlayableIntent(PROMOTION_FEN, "d8a8")).toBe(false);
    expect(isPlayableIntent(null, "e2e4")).toBe(false);
  });
});
