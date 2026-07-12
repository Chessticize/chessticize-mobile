// Behavioral regression tests for the patched react-native-chessboard move
// executor (issues #152 / #156). They drive the real createMoveExecutor with
// a real chess.js instance and controllable fake shared values / springs, so
// the timing bugs behind the "fast second move" freezes reproduce in Node:
//
// - The sprite slots must migrate to the destination square the moment the
//   move executes, not when the glide animation settles. The old executor
//   parked the piece in the origin slot for ~200ms, so re-grabbing a
//   just-moved piece found an empty square and interrupted glides left the
//   sprite on the wrong slot.
// - Cancelling the glide mid-flight (a drag write, a board reset) must leave
//   the slots consistent with chess.js and still resolve the move's
//   animation-complete callback.
//
// These tests fail against the pre-#157 executor and pass after it.

jest.mock("react-native-reanimated", () => ({
  // The executor only calls withSpring at move time; tests decide when (and
  // whether) each spring settles via the fake shared values below.
  withSpring: (target, _config, callback) => ({ __spring: true, target, callback })
}));

jest.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn, ...args) => fn(...args)
}));

const { Chess } = require("chess.js");
const { createMoveExecutor } = require("react-native-chessboard/lib/commonjs/state/move-executor");
const { squareToPosition } = require("react-native-chessboard/lib/commonjs/state/use-board-state");

const PIECE_SIZE = 50;
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

// Mirrors reanimated semantics closely enough for the executor: a plain
// write cancels a running animation (its callback fires with finished =
// false), starting a new animation cancels the previous one, and settle()
// completes the pending animation like a spring reaching its target.
function fakeSharedValue(initial) {
  const sv = {
    current: initial,
    pending: null,
    get: () => sv.current,
    set: (next) => {
      if (next && typeof next === "object" && next.__spring) {
        const cancelled = sv.pending;
        sv.pending = { target: next.target, callback: next.callback };
        if (cancelled && cancelled.callback) {
          cancelled.callback(false);
        }
        return;
      }
      const cancelled = sv.pending;
      sv.pending = null;
      sv.current = next;
      if (cancelled && cancelled.callback) {
        cancelled.callback(false);
      }
    },
    settle: () => {
      const pending = sv.pending;
      if (!pending) {
        return;
      }
      sv.pending = null;
      sv.current = pending.target;
      if (pending.callback) {
        pending.callback(true);
      }
    }
  };
  return sv;
}

function pieceCodeAt(chess, square) {
  const piece = chess.get(square);
  return piece ? `${piece.color}${piece.type}` : null;
}

function createFakeBoardState(chess) {
  const squares = {};
  const highlights = {};
  for (const file of FILES) {
    for (let rank = 1; rank <= 8; rank += 1) {
      const square = `${file}${rank}`;
      const pos = squareToPosition(square, PIECE_SIZE, false);
      squares[square] = {
        piece: fakeSharedValue(pieceCodeAt(chess, square)),
        translateX: fakeSharedValue(pos.x),
        translateY: fakeSharedValue(pos.y),
        scale: fakeSharedValue(1),
        zIndex: fakeSharedValue(0),
        lastMove: fakeSharedValue(false),
        inCheck: fakeSharedValue(false)
      };
      highlights[square] = { color: fakeSharedValue(null) };
    }
  }
  return {
    squares,
    highlights,
    turn: fakeSharedValue(chess.turn()),
    selectedSquare: fakeSharedValue(null),
    validMoves: fakeSharedValue([]),
    lastMove: fakeSharedValue(null),
    isCheck: fakeSharedValue(false),
    kingInCheckSquare: fakeSharedValue(null)
  };
}

function createExecutor(fen) {
  const chess = fen ? new Chess(fen) : new Chess();
  const boardState = createFakeBoardState(chess);
  const onMove = jest.fn();
  const executor = createMoveExecutor(
    chess,
    boardState,
    {
      pieceSize: PIECE_SIZE,
      flipped: false,
      animations: { move: {}, scale: {}, snapBack: {} }
    },
    { onMove }
  );
  return { chess, boardState, executor, onMove };
}

function expectSlotsMatchChess(chess, boardState) {
  for (const file of FILES) {
    for (let rank = 1; rank <= 8; rank += 1) {
      const square = `${file}${rank}`;
      expect(`${square}:${boardState.squares[square].piece.get()}`).toBe(
        `${square}:${pieceCodeAt(chess, square)}`
      );
    }
  }
}

describe("react-native-chessboard move executor behavior", () => {
  it("migrates the piece to its destination slot the moment the move executes", () => {
    const { chess, boardState, executor } = createExecutor();

    const move = executor.executeMove("e2", "e4");
    expect(move).toBeTruthy();

    // No spring has settled yet — this is the window where a fast player
    // re-grabs the just-moved piece. The destination slot must already hold
    // it (the pan gesture reads squares[to].piece on touch-down) and the
    // origin slot must be free, exactly matching chess.js.
    const e2 = boardState.squares.e2;
    const e4 = boardState.squares.e4;
    expect(e4.piece.get()).toBe("wp");
    expect(e2.piece.get()).toBeNull();
    expectSlotsMatchChess(chess, boardState);

    // The glide renders from the destination slot: it starts at the origin
    // square's position, raised, with springs pending toward its own square.
    const e2Pos = squareToPosition("e2", PIECE_SIZE, false);
    const e4Pos = squareToPosition("e4", PIECE_SIZE, false);
    expect(e4.translateX.get()).toBe(e2Pos.x);
    expect(e4.translateY.get()).toBe(e2Pos.y);
    expect(e4.zIndex.get()).toBe(100);
    expect(e4.translateY.pending?.target).toBe(e4Pos.y);

    // The origin slot is immediately reusable for its next occupant.
    expect(e2.translateX.get()).toBe(e2Pos.x);
    expect(e2.translateY.get()).toBe(e2Pos.y);
    expect(e2.zIndex.get()).toBe(0);
  });

  it("lowers the piece and reports completion when the glide settles", () => {
    const { boardState, executor } = createExecutor();
    const onAnimationComplete = jest.fn();

    executor.executeMove("e2", "e4", undefined, onAnimationComplete);
    expect(onAnimationComplete).not.toHaveBeenCalled();

    boardState.squares.e4.translateX.settle();
    boardState.squares.e4.translateY.settle();

    const e4Pos = squareToPosition("e4", PIECE_SIZE, false);
    expect(boardState.squares.e4.translateX.get()).toBe(e4Pos.x);
    expect(boardState.squares.e4.translateY.get()).toBe(e4Pos.y);
    expect(boardState.squares.e4.zIndex.get()).toBe(0);
    expect(boardState.squares.e4.piece.get()).toBe("wp");
    expect(onAnimationComplete).toHaveBeenCalledTimes(1);
  });

  it("keeps slots consistent with chess when the glide is cancelled mid-flight", () => {
    const { chess, boardState, executor } = createExecutor();
    const onAnimationComplete = jest.fn();

    executor.executeMove("e2", "e4", undefined, onAnimationComplete);

    // A drag write or board reset lands on the gliding square before the
    // spring settles: plain writes cancel both axes (finished = false).
    const e4Pos = squareToPosition("e4", PIECE_SIZE, false);
    boardState.squares.e4.translateX.set(e4Pos.x);
    boardState.squares.e4.translateY.set(e4Pos.y);

    // The interruption must not desync the board: the piece already lives in
    // its destination slot, and whoever awaited the move is unblocked.
    expect(boardState.squares.e4.piece.get()).toBe("wp");
    expect(boardState.squares.e2.piece.get()).toBeNull();
    expectSlotsMatchChess(chess, boardState);
    expect(onAnimationComplete).toHaveBeenCalledTimes(1);
  });

  it("resolves a capture into the destination slot immediately", () => {
    const { chess, boardState, executor } = createExecutor(
      "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"
    );

    const move = executor.executeMove("e4", "d5");
    expect(move?.captured).toBe("p");

    // The captured pawn is gone and the capturing pawn owns the slot before
    // any animation settles.
    expect(boardState.squares.d5.piece.get()).toBe("wp");
    expect(boardState.squares.e4.piece.get()).toBeNull();
    expectSlotsMatchChess(chess, boardState);
  });

  it("migrates the castling rook slot at move time", () => {
    const { chess, boardState, executor } = createExecutor(
      "rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4"
    );

    executor.executeMove("e1", "g1");

    // King and rook both live in their destination slots immediately.
    expect(boardState.squares.g1.piece.get()).toBe("wk");
    expect(boardState.squares.f1.piece.get()).toBe("wr");
    expect(boardState.squares.h1.piece.get()).toBeNull();
    expect(boardState.squares.e1.piece.get()).toBeNull();
    expectSlotsMatchChess(chess, boardState);

    // The rook glides in from its origin square.
    const h1Pos = squareToPosition("h1", PIECE_SIZE, false);
    const f1Pos = squareToPosition("f1", PIECE_SIZE, false);
    expect(boardState.squares.f1.translateX.get()).toBe(h1Pos.x);
    expect(boardState.squares.f1.translateX.pending?.target).toBe(f1Pos.x);
  });

  it("clears the bypassed pawn immediately on en passant", () => {
    const { chess, boardState, executor } = createExecutor(
      "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3"
    );

    const move = executor.executeMove("e5", "f6");
    expect(move?.flags).toContain("e");

    expect(boardState.squares.f6.piece.get()).toBe("wp");
    expect(boardState.squares.f5.piece.get()).toBeNull();
    expect(boardState.squares.e5.piece.get()).toBeNull();
    expectSlotsMatchChess(chess, boardState);
  });
});
