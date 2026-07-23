const {
  launchWithDisabledSynchronization,
  openTab,
  playBoardMove,
  startPracticeMode,
  waitForElementAccessibilityLabelContaining,
  waitForElementTextContaining,
  waitForVisibleInPracticeScroll,
} = require('./helpers');
const { setAndroidNetworkEnabled } = require('./androidNetwork');
const standardFixture = require('../../../fixtures/puzzles/android-standard-practice.fixture.json');

const TEST_NOW_MS = '1784030400000';
const RELAUNCH_TEST_NOW_MS = String(Number(TEST_NOW_MS) + 5 * 60_000);
const TEST_SEED = standardFixture.puzzleSelectionSeed;
const EXPECTED_AUTO_REPLY_MOVE = standardFixture.puzzle.solutionMoves[2];

describe(`Android Standard Practice offline persistence (${standardFixture.puzzle.id})`, () => {
  beforeAll(async () => {
    await setAndroidNetworkEnabled(false);
    await launchWithDisabledSynchronization({
      resetAppState: true,
      newInstance: true,
      launchArgs: {
        chessticizePuzzleSelectionSeed: TEST_SEED,
        chessticizeStandardTargetCorrect: String(standardFixture.targetCorrect),
        chessticizeTestNowMs: TEST_NOW_MS,
      },
    });
  });

  afterAll(async () => {
    await setAndroidNetworkEnabled(true);
  });

  it('finishes a bundled Standard sprint and restores rating, progress, and history after relaunch', async () => {
    await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
    await startPracticeMode('standard');
    await waitForVisibleInPracticeScroll('practice-prompt');
    await waitForElementTextContaining('practice-prompt', 'For black.', 10000);
    await waitForVisibleInPracticeScroll('session-board');

    // The real SQLite pack adapter selects the seeded bundled line. The app
    // auto-plays each white move; the user solves the two black moves.
    await playBoardMove('session-board', standardFixture.userMoves[0], true);
    await waitForElementAccessibilityLabelContaining(
      'session-board',
      `Last move ${EXPECTED_AUTO_REPLY_MOVE.slice(0, 2)} to ${EXPECTED_AUTO_REPLY_MOVE.slice(2, 4)}`,
      10000,
      50
    );
    await waitForElementTextContaining('practice-prompt', 'For black.', 10000);
    await playBoardMove('session-board', standardFixture.userMoves[1], true);

    await waitFor(element(by.text('Sprint complete'))).toBeVisible().withTimeout(30000);
    await waitForElementTextContaining(
      'sprint-result-solved',
      `${standardFixture.targetCorrect} / ${standardFixture.targetCorrect}`,
      10000
    );
    await waitForElementTextContaining(
      'sprint-result-rating-range',
      `${standardFixture.puzzle.rating} -> ${standardFixture.expectedRatingAfter}`,
      10000
    );

    await device.terminateApp();
    await launchWithDisabledSynchronization({
      delete: false,
      newInstance: true,
      launchArgs: { chessticizeTestNowMs: RELAUNCH_TEST_NOW_MS },
    });

    await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
    await waitForElementTextContaining(
      'practice-mode-standard-rating',
      String(standardFixture.expectedRatingAfter),
      10000
    );
    await waitForElementTextContaining('practice-progress-weekly-solved', '1', 10000);
    await waitForElementTextContaining('practice-progress-rating-delta', '+175 this week', 10000);

    await openTab('history-tab', 'history-action-header');
    await waitFor(element(by.text('Correct')).atIndex(0))
      .toBeVisible()
      .whileElement(by.id('practice-main-scroll'))
      .scroll(100, 'down');
  });
});
