const {
  launchWithDisabledSynchronization,
  playBoardMove,
  sleep,
  startPracticeMode,
  waitForElementAccessibilityLabelContaining,
  waitForElementTextContaining,
  waitForVisibleInPracticeScroll,
} = require('./helpers');
const fixture = require('../../../fixtures/puzzles/android-standard-practice.fixture.json');

describe('Native app-review milestone acceptance', () => {
  it('reaches two successful Sprints over two local dates using public UI', async () => {
    for (let index = 0; index < 2; index += 1) {
      if (index > 0) {
        await device.terminateApp();
      }
      await launchWithDisabledSynchronization({
        resetAppState: index === 0,
        delete: index === 0,
        newInstance: true,
        launchArgs: {
          chessticizePuzzleSelectionId: fixture.puzzle.id,
          chessticizePuzzleSelectionSeed: fixture.puzzleSelectionSeed,
          chessticizeStandardTargetCorrect: '1',
          // Keep the real review milestone (2 successes across 2 dates). Only
          // the existing puzzle-length and clock test controls shorten this run.
          chessticizeTestNowMs: String(Date.parse('2026-11-08T12:00:00Z')
            + (index === 1 ? 86400000 : 0)),
        },
      });
      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
      if (index === 0) {
        await device.takeScreenshot('app-review-practice-before-milestone');
      }
      await startPracticeMode('standard');
      await waitForVisibleInPracticeScroll('session-board');
      await waitForElementAccessibilityLabelContaining(
        'session-board',
        `Last move ${fixture.puzzle.solutionMoves[0].slice(0, 2)} to ${fixture.puzzle.solutionMoves[0].slice(2, 4)}`,
        30000,
        50,
      );
      await playBoardMove('session-board', fixture.userMoves[0], true);
      await waitForElementAccessibilityLabelContaining(
        'session-board',
        `Last move ${fixture.puzzle.solutionMoves[2].slice(0, 2)} to ${fixture.puzzle.solutionMoves[2].slice(2, 4)}`,
        10000,
        50,
      );
      await playBoardMove('session-board', fixture.userMoves[1], true);
      await waitFor(element(by.id('sprint-result-outcome'))).toBeVisible().withTimeout(30000);
      await waitForElementTextContaining('sprint-result-solved', '1 / ', 10000);
      await sleep(5000);
      const screenshot = await device.takeScreenshot(`app-review-after-success-${index + 1}`);
      console.log(`[app-review-acceptance] ${device.getPlatform()} success=${index + 1} screenshot=${screenshot}`);
    }
    // A passing journey proves the milestone and captures native presentation.
    // Inspect the final image separately: neither platform API guarantees UI.
  });
});
