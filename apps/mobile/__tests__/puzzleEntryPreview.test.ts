import {
  PUZZLE_ENTRY_PREVIEW_DELAY_MS,
  puzzleEntryPreviewPlan,
  schedulePuzzleEntryPreview,
  type PuzzleEntryPreviewPlan
} from "../src/components/puzzleEntryPreview";
import {
  beginArrowDuelPuzzle,
  beginLinePuzzle,
  type Puzzle
} from "../../../packages/core/src/index";

const plan: PuzzleEntryPreviewPlan = {
  finalFen: "final",
  initialFen: "initial",
  move: { from: "e2", to: "e4" },
  moveUci: "e2e4",
  puzzleId: "preview"
};

const puzzle: Puzzle = {
  id: "entry-preview",
  initialFen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1",
  solutionMoves: ["e2e4"],
  rating: 900,
  themes: ["fork"],
  source: "synthetic",
  stockfishBestMove: "e2e3"
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it("derives the entry animation only from the domain's initial auto-played line move", () => {
  const line = beginLinePuzzle(puzzle);

  expect(puzzleEntryPreviewPlan(line)).toMatchObject({
    initialFen: puzzle.initialFen,
    move: { from: "e2", to: "e4" },
    moveUci: "e2e4",
    puzzleId: puzzle.id
  });
  expect(puzzleEntryPreviewPlan({ ...line, cursor: 2 })).toBeNull();
});

it("does not create an entry animation for Arrow Duel state", () => {
  expect(puzzleEntryPreviewPlan(beginArrowDuelPuzzle(puzzle))).toBeNull();
});

it("cancels the pending timer when the preview owner unmounts", () => {
  const playMove = jest.fn(async () => plan.move);
  const onComplete = jest.fn();
  const cancel = schedulePuzzleEntryPreview({ onComplete, plan, playMove });

  cancel();
  jest.advanceTimersByTime(PUZZLE_ENTRY_PREVIEW_DELAY_MS);

  expect(playMove).not.toHaveBeenCalled();
  expect(onComplete).not.toHaveBeenCalled();
});

it("ignores an old move completion after the puzzle switches", async () => {
  let resolveMove: ((value: unknown) => void) | undefined;
  const playMove = jest.fn(() => new Promise((resolve) => {
    resolveMove = resolve;
  }));
  const onComplete = jest.fn();
  const cancel = schedulePuzzleEntryPreview({ onComplete, plan, playMove });

  jest.advanceTimersByTime(PUZZLE_ENTRY_PREVIEW_DELAY_MS);
  expect(playMove).toHaveBeenCalledTimes(1);

  cancel();
  resolveMove?.(plan.move);
  await Promise.resolve();
  await Promise.resolve();

  expect(onComplete).not.toHaveBeenCalled();
});
