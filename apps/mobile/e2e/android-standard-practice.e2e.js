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

const TEST_NOW_MS = '1784030400000';
const TEST_SEED = 'android-standard-practice';

describe('Android Standard Practice offline persistence', () => {
  beforeAll(async () => {
    await setAndroidNetworkEnabled(false);
    await launchWithDisabledSynchronization({
      delete: true,
      newInstance: true,
      launchArgs: {
        chessticizePuzzleSelectionSeed: TEST_SEED,
        chessticizeStandardTargetCorrect: '1',
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
    await waitFor(element(by.id('session-side-to-move'))).toBeVisible().withTimeout(10000);
    await waitForElementAccessibilityLabelContaining(
      'session-side-to-move',
      'Black to move',
      10000,
      25
    );
    await waitForVisibleInPracticeScroll('session-board');

    // The real SQLite pack adapter selects the seeded bundled line. The app
    // auto-plays each white move; the user solves the two black moves.
    await playBoardMove('session-board', 'a3c1', true);
    await waitFor(element(by.id('session-last-move-overlay'))).toExist().withTimeout(10000);
    await waitForElementAccessibilityLabelContaining(
      'session-last-move-overlay',
      'Last move d2 to d1',
      10000,
      50
    );
    await waitForElementAccessibilityLabelContaining(
      'session-side-to-move',
      'Black to move',
      10000,
      25
    );
    await playBoardMove('session-board', 'c1d1', true);

    await waitFor(element(by.text('Sprint complete'))).toBeVisible().withTimeout(30000);
    await waitForElementTextContaining('sprint-result-solved', '1 / 1', 10000);
    await waitForElementTextContaining('sprint-result-rating-range', '600 -> 775', 10000);

    await device.terminateApp();
    await launchWithDisabledSynchronization({
      delete: false,
      newInstance: true,
      launchArgs: { chessticizeTestNowMs: TEST_NOW_MS },
    });

    await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
    await waitForElementTextContaining('practice-mode-standard-rating', '775', 10000);
    await waitForElementTextContaining('practice-progress-weekly-solved', '1', 10000);
    await waitForElementTextContaining('practice-progress-rating-delta', '+175 this week', 10000);

    await openTab('history-tab', 'history-action-header');
    await waitFor(element(by.text('Correct')).atIndex(0))
      .toBeVisible()
      .whileElement(by.id('practice-main-scroll'))
      .scroll(100, 'down');
  });
});
