const { Chess } = require('chess.js');
const manifest = require('../../../fixtures/puzzles/familiar-15-e2e.manifest.json');
const regressionPuzzles = require('../../../fixtures/puzzles/presolved-1000.json');

const regressionPuzzlesById = new Map(
  regressionPuzzles.map((puzzle) => [puzzle.id, puzzle])
);
const manifestEntriesById = new Map(
  manifest.puzzles.map((entry) => [entry.id, entry])
);

if (manifestEntriesById.size !== manifest.puzzles.length) {
  throw new Error('Familiar 15 manifest contains duplicate puzzle IDs');
}

const FAMILIAR_15_PUZZLES = Object.freeze(
  manifest.puzzles.map((entry) => {
    const puzzle = entry.fixture ?? regressionPuzzlesById.get(entry.id);
    if (!puzzle) {
      throw new Error(
        `Familiar 15 manifest puzzle ${entry.id} is missing from ${manifest.sourceFixture}`
      );
    }
    return puzzle;
  })
);

function familiar15StartingPosition(puzzle) {
  const position = new Chess(puzzle.initialFen);
  const openingMove = puzzle.solutionMoves[0];
  if (!openingMove) {
    throw new Error(`Familiar 15 puzzle ${puzzle.id} has no opening solution move`);
  }
  position.move(openingMove);
  return position;
}

function familiar15UserMoves(puzzle, { stopBeforePromotion = false } = {}) {
  const manifestEntry = manifestEntriesById.get(puzzle.id);
  if (!manifestEntry) {
    throw new Error(`Puzzle ${puzzle.id} is not in the Familiar 15 manifest`);
  }
  const moves = manifestEntry.userMoveOverrides
    ?? puzzle.solutionMoves.filter((_, moveIndex) => moveIndex % 2 === 1);
  if (!stopBeforePromotion) {
    return [...moves];
  }
  const promotionIndex = moves.findIndex(isPromotionMove);
  return moves.slice(0, promotionIndex === -1 ? moves.length : promotionIndex);
}

function isPromotionMove(move) {
  return /^[a-h][1-8][a-h][18][qrbn]$/.test(move);
}

const firstStandardPuzzle = FAMILIAR_15_PUZZLES[0];
const FIRST_STANDARD_FEEDBACK_MOVES = Object.freeze({
  accepted: familiar15UserMoves(firstStandardPuzzle)[0],
  legalWrong: 'c2b3',
  puzzleId: firstStandardPuzzle.id,
});

module.exports = {
  FAMILIAR_15_PUZZLES,
  FIRST_STANDARD_FEEDBACK_MOVES,
  familiar15StartingPosition,
  familiar15UserMoves,
};
