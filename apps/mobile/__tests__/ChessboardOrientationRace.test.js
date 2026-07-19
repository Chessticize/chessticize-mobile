// Regression coverage for the Android cross-puzzle orientation race. These
// tests render the real react-native-chessboard state hook and drive its real
// resetBoard implementation. SharedValue writes are deliberately committed
// later, matching the Android scheduling window where JS can observe the
// previous value before queued native writes land.

jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const queuedWrites = [];

  function mutable(initial) {
    const value = {
      current: initial,
      get: () => value.current,
      set: (next) => {
        queuedWrites.push(() => {
          value.current = next;
        });
      }
    };
    return value;
  }

  return {
    makeMutable: mutable,
    useSharedValue: (initial) => {
      const ref = React.useRef(null);
      if (ref.current === null) {
        ref.current = mutable(initial);
      }
      return ref.current;
    },
    withSpring: (target) => target,
    __flushSharedValueWrites: () => {
      while (queuedWrites.length > 0) {
        queuedWrites.shift()();
      }
    }
  };
});

jest.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn, ...args) => fn(...args)
}));

const React = require("react");
const TestRenderer = require("react-test-renderer");
const { act } = TestRenderer;
const { createMoveExecutor } = require("react-native-chessboard/lib/commonjs/state/move-executor");
const { useBoardState } = require("react-native-chessboard/lib/commonjs/state/use-board-state");
const { __flushSharedValueWrites } = require("react-native-reanimated");

const PIECE_SIZE = 10;
const OLD_UNFLIPPED_FEN = "8/p2R1nkp/p1N1R1p1/8/8/2p5/8/4K3 w - - 0 1";
const NEXT_FLIPPED_FEN = "8/p2R1nkp/p1N1R1p1/8/5P2/1Pp4r/P7/K7 b - - 0 1";

// Independent worked coordinates for every occupied square in the next FEN
// when Black is at the bottom. Keeping these literals separate from
// squareToPosition ensures the assertion can disagree with production code.
const NEXT_FLIPPED_COORDINATES = {
  a1: [70, 0],
  a2: [70, 10],
  b3: [60, 20],
  c3: [50, 20],
  h3: [0, 20],
  f4: [20, 30],
  a6: [70, 50],
  c6: [50, 50],
  e6: [30, 50],
  g6: [10, 50],
  a7: [70, 60],
  d7: [40, 60],
  f7: [20, 60],
  g7: [10, 60],
  h7: [0, 60]
};

const NEXT_UNFLIPPED_COORDINATES = {
  a1: [0, 70],
  a2: [0, 60],
  b3: [10, 50],
  c3: [20, 50],
  h3: [70, 50],
  f4: [50, 40],
  a6: [0, 20],
  c6: [20, 20],
  e6: [40, 20],
  g6: [60, 20],
  a7: [0, 10],
  d7: [30, 10],
  f7: [50, 10],
  g7: [60, 10],
  h7: [70, 10]
};

const NEXT_UNFLIPPED_RESIZED_COORDINATES = {
  a1: [0, 140],
  a2: [0, 120],
  b3: [20, 100],
  c3: [40, 100],
  h3: [140, 100],
  f4: [100, 80],
  a6: [0, 40],
  c6: [40, 40],
  e6: [80, 40],
  g6: [120, 40],
  a7: [0, 20],
  d7: [60, 20],
  f7: [100, 20],
  g7: [120, 20],
  h7: [140, 20]
};

function HookProbe({ fen, pieceSize, flipped, onState }) {
  const value = useBoardState(fen, pieceSize, flipped);
  onState(value);
  return null;
}

function misplacedSquares(boardState, expectedCoordinates) {
  return Object.entries(expectedCoordinates)
    .filter(([square, [expectedX, expectedY]]) => {
      const state = boardState.squares[square];
      return state.translateX.get() !== expectedX || state.translateY.get() !== expectedY;
    })
    .map(([square]) => square);
}

function renderDelayedResetTransition({
  initialFlipped,
  nextFlipped,
  initialPieceSize = PIECE_SIZE,
  nextPieceSize = initialPieceSize
}) {
  let current;
  let renderer;

  act(() => {
    renderer = TestRenderer.create(
      React.createElement(HookProbe, {
        fen: OLD_UNFLIPPED_FEN,
        pieceSize: initialPieceSize,
        flipped: initialFlipped,
        onState: (value) => {
          current = value;
        }
      })
    );
  });

  const executor = createMoveExecutor(
    current.chess,
    current.boardState,
    {
      pieceSize: initialPieceSize,
      flipped: initialFlipped,
      animations: { move: {}, scale: {}, snapBack: {} }
    },
    {}
  );

  act(() => {
    executor.resetBoard(NEXT_FLIPPED_FEN);
    renderer.update(
      React.createElement(HookProbe, {
        fen: NEXT_FLIPPED_FEN,
        pieceSize: nextPieceSize,
        flipped: nextFlipped,
        onState: (value) => {
          current = value;
        }
      })
    );
  });
  __flushSharedValueWrites();

  return current.boardState;
}

describe("react-native-chessboard cross-puzzle orientation", () => {
  it("places every new-FEN piece correctly when reset writes land after an unflipped-to-flipped transition", () => {
    const boardState = renderDelayedResetTransition({
      initialFlipped: false,
      nextFlipped: true
    });

    expect(misplacedSquares(boardState, NEXT_FLIPPED_COORDINATES)).toEqual([]);
  });

  it("places every new-FEN piece correctly in the reverse flipped-to-unflipped direction", () => {
    const boardState = renderDelayedResetTransition({
      initialFlipped: true,
      nextFlipped: false
    });

    expect(misplacedSquares(boardState, NEXT_UNFLIPPED_COORDINATES)).toEqual([]);
  });

  it("preserves correct coordinates when a delayed cross-puzzle reset keeps the same orientation", () => {
    const boardState = renderDelayedResetTransition({
      initialFlipped: false,
      nextFlipped: false
    });

    expect(misplacedSquares(boardState, NEXT_UNFLIPPED_COORDINATES)).toEqual([]);
  });

  it("reprojects newly occupied slots when the same-orientation transition also resizes the board", () => {
    const boardState = renderDelayedResetTransition({
      initialFlipped: false,
      nextFlipped: false,
      nextPieceSize: PIECE_SIZE * 2
    });

    expect(misplacedSquares(boardState, NEXT_UNFLIPPED_RESIZED_COORDINATES)).toEqual([]);
  });
});
