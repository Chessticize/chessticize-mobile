const bundledCorePuzzles = require('../../../fixtures/puzzles/bundled-core-pack.json');

const bundledCorePuzzlesById = new Map(
  bundledCorePuzzles.map((puzzle) => [puzzle.id, puzzle])
);

function focusedRunMoveSteps(puzzleId) {
  const puzzle = focusedRunPuzzle(puzzleId);
  const steps = puzzle.solutionMoves.flatMap((userMove, index, solutionMoves) => (
    index % 2 === 1
      ? [{ autoReply: solutionMoves[index + 1], userMove }]
      : []
  ));
  if (steps.length === 0) {
    throw new Error(`Focused Run puzzle ${puzzleId} has no user move in its stored solution`);
  }
  return steps;
}

function focusedRunBoardFlipped(puzzleId) {
  const puzzle = focusedRunPuzzle(puzzleId);
  return puzzle.initialFen.split(/\s+/)[1] === 'w';
}

function focusedRunPuzzle(puzzleId) {
  const puzzle = bundledCorePuzzlesById.get(puzzleId);
  if (!puzzle) {
    throw new Error(`Focused Run puzzle ${puzzleId} is missing from the bundled Core Pack fixture`);
  }
  return puzzle;
}

module.exports = {
  focusedRunBoardFlipped,
  focusedRunMoveSteps,
};
