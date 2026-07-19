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
const {
  FAMILIAR_15_PUZZLES,
  familiar15StartingPosition,
  familiar15UserMoves,
} = require('./familiar15Fixture');

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

    for (const [puzzleIndex, puzzle] of FAMILIAR_15_PUZZLES.entries()) {
      const puzzleId = puzzle.id;

      await waitForElementTextContaining('session-current-puzzle-id', puzzleId, 15000);
      await waitFor(element(by.id('move-feedback-overlay'))).not.toExist().withTimeout(15000);

      const startingPosition = familiar15StartingPosition(puzzle);
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
      if (puzzleIndex === FAMILIAR_15_PUZZLES.length - 1) {
        continue;
      }

      const userMoves = familiar15UserMoves(puzzle);
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
