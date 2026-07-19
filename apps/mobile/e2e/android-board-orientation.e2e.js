const { Chess } = require('chess.js');
const regressionPuzzles = require('../../../fixtures/puzzles/presolved-1000.json');
const {
  frameFor,
  launchWithDisabledSynchronization,
  playBoardMove,
  selectTestPuzzleSource,
  startPracticeMode,
  waitForElementAccessibilityLabelContaining,
  waitForElementTextContaining,
  waitForVisibleInPracticeScroll,
} = require('./helpers');
const {
  expectBoardScreenshotMatchesOccupiedSquares,
} = require('./screenshotAssertions');

const DUAL_MATE_IN_ONE = {
  id: 'test-dual-mate-in-one',
  initialFen: '8/8/8/8/8/8/k1Q5/2K5 b - - 0 1',
  solutionMoves: ['a2a1', 'c2a4'],
};
const PUZZLE_ORDER = [
  'test-dual-mate-in-one',
  '000hf',
  '00Kbj',
  '00VoA',
  '07KI8',
  '04wsf',
  '08Hmx',
  '0AqXs',
  '0DR07',
  '01gEg',
  '00tgU',
  '04QUG',
  '063T7',
  '00qk4',
  '04Phf',
];
const USER_MOVES_BY_PUZZLE = {
  'test-dual-mate-in-one': ['c2b1'],
  '000hf': ['e2e6', 'e6f7'],
  '00Kbj': ['f4g3', 'a2a1', 'a1d1'],
  '00VoA': ['c2c6', 'c1c6'],
  '07KI8': ['d2c4', 'f2h2', 'g1h2'],
  '04wsf': ['b5c7', 'f4c7'],
  '08Hmx': ['e3e8', 'e8b8'],
  '0AqXs': ['b8f8'],
  '0DR07': ['h4g3', 'f8f2', 'g3f2'],
  '01gEg': ['d8d3', 'g3h1'],
  '00tgU': ['d5e7', 'g6h7'],
  '04QUG': ['c7d6', 'e8e1', 'g7c3', 'c3f6'],
  '063T7': ['d7h3', 'h3h2'],
  '00qk4': ['b4c2', 'd8d1'],
};
const PUZZLES_BY_ID = new Map([
  [DUAL_MATE_IN_ONE.id, DUAL_MATE_IN_ONE],
  ...regressionPuzzles.map((puzzle) => [puzzle.id, puzzle]),
]);

describe('Android board orientation integrity', () => {
  beforeEach(async () => {
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: true,
    });
    await device.setOrientation('portrait');
  });

  it('keeps every piece on its logical square across consecutive white/black puzzle transitions', async () => {
    await selectTestPuzzleSource('familiar15');
    await startPracticeMode('standard');
    await waitForVisibleInPracticeScroll('session-board');
    const screenFrame = await frameFor(element(by.id('adaptive-layout')));

    let previousFlipped = null;
    let unflippedToFlipped = 0;
    let flippedToUnflipped = 0;

    for (const [puzzleIndex, puzzleId] of PUZZLE_ORDER.entries()) {
      const puzzle = PUZZLES_BY_ID.get(puzzleId);
      if (!puzzle) {
        throw new Error(`Missing familiar puzzle fixture ${puzzleId}`);
      }

      await waitForElementTextContaining('session-current-puzzle-id', puzzleId, 15000);
      await waitFor(element(by.id('move-feedback-overlay'))).not.toExist().withTimeout(15000);

      const startingPosition = new Chess(puzzle.initialFen);
      startingPosition.move(puzzle.solutionMoves[0]);
      const flipped = startingPosition.turn() === 'b';
      await waitForElementAccessibilityLabelContaining(
        'session-side-to-move',
        flipped ? 'Black to move' : 'White to move',
        10000,
        25
      );

      if (previousFlipped === false && flipped === true) {
        unflippedToFlipped += 1;
      } else if (previousFlipped === true && flipped === false) {
        flippedToUnflipped += 1;
      }
      previousFlipped = flipped;

      const boardFrame = await frameFor(element(by.id('session-board')));
      const screenshotPath = await device.takeScreenshot(
        `android-board-orientation-${String(puzzleIndex + 1).padStart(2, '0')}-${puzzleId}`
      );
      expectBoardScreenshotMatchesOccupiedSquares(
        screenshotPath,
        boardFrame,
        occupiedSquares(startingPosition),
        flipped,
        screenFrame
      );

      // The final fixture contains promotion moves, which require a separate
      // chooser interaction. Its starting screenshot completes the 15-puzzle
      // transition evidence without expanding this focused orientation test.
      if (puzzleIndex === PUZZLE_ORDER.length - 1) {
        continue;
      }

      const userMoves = USER_MOVES_BY_PUZZLE[puzzleId];
      for (const [userMoveIndex, userMove] of userMoves.entries()) {
        await playBoardMove('session-board', userMove, flipped);
        const autoReply = puzzle.solutionMoves[(userMoveIndex * 2) + 2];
        if (autoReply) {
          await waitForElementAccessibilityLabelContaining(
            'session-board',
            `Last move ${autoReply.slice(0, 2)} to ${autoReply.slice(2, 4)}`,
            15000,
            25
          );
        }
      }
    }

    if (unflippedToFlipped === 0 || flippedToUnflipped === 0) {
      throw new Error(
        'Familiar 15 did not exercise both orientation transitions: '
        + `white-to-black=${unflippedToFlipped}, black-to-white=${flippedToUnflipped}`
      );
    }
  });
});

function occupiedSquares(chess) {
  const squares = [];
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      if (chess.board()[row][column]) {
        squares.push(`${String.fromCharCode('a'.charCodeAt(0) + column)}${8 - row}`);
      }
    }
  }
  return squares;
}
