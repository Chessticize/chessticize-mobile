const {
  launchWithDisabledSynchronization,
  openTab,
  playBoardMove,
  sleep,
  startPracticeMode,
  waitForElementAccessibilityLabelContaining,
  waitForElementTextContaining,
  waitForVisibleInPracticeScroll,
  withAndroidUiDiagnostics,
} = require('./helpers');
const { setAndroidNetworkEnabled } = require('./androidNetwork');
const fixture = require('../../../fixtures/puzzles/android-arrow-duel.fixture.json');

const TEST_NOW_MS = '1784203200000';
const RELAUNCH_TEST_NOW_MS = String(Number(TEST_NOW_MS) + 5 * 60_000);

describe(`Android Arrow Duel offline journey (${fixture.puzzle.id})`, () => {
  beforeAll(async () => {
    if (device.getPlatform() !== 'android') {
      throw new Error('The Android Arrow Duel journey requires an Android device.');
    }
    await setAndroidNetworkEnabled(false);
  });

  beforeEach(async () => {
    await launchArrowDuelApp({ resetAppState: true, testNowMs: TEST_NOW_MS });
  });

  afterAll(async () => {
    await setAndroidNetworkEnabled(true);
  });

  it('handles accessible candidate input, a wrong answer, interruption, and skipped review', async () => {
    await withAndroidUiDiagnostics(async () => {
      await startArrowDuel();

      await device.pressBack();
      await waitFor(element(by.id('session-abandon-confirmation'))).toExist().withTimeout(10000);
      await expect(element(by.id('session-board'))).toExist();
      await device.pressBack();
      await waitFor(element(by.id('session-abandon-confirmation'))).not.toExist().withTimeout(10000);

      await playBoardMove('session-board', fixture.wrongMove);
      await waitFor(element(by.label('Mistakes 1 of 3')).atIndex(0)).toExist().withTimeout(10000);
      await waitFor(element(by.id('move-feedback-overlay'))).toExist().withTimeout(10000);
      await waitFor(element(by.id('session-progress'))).toHaveText('0 / 1').withTimeout(10000);
      await sleep(1800);

      await element(by.id('session-abandon')).tap();
      await waitFor(element(by.id('session-abandon-confirmation'))).toBeVisible().withTimeout(5000);
      await element(by.id('session-abandon-confirm')).tap();
      await waitFor(element(by.text('Sprint failed'))).toBeVisible().withTimeout(30000);
      await waitFor(element(by.id('sprint-result-reason'))).toHaveText('Abandoned').withTimeout(10000);
      await expect(element(by.id('review-mistakes-button'))).toBeVisible();

      // System Back deliberately skips the optional post-sprint mistake review.
      await device.pressBack();
      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(10000);
      await openArrowDuelHistory();
      await waitFor(element(by.text('Wrong move')).atIndex(0)).toExist().withTimeout(10000);
    });
  });

  it('completes, persists, reviews with Android Stockfish, and unwinds analysis with Back', async () => {
    await withAndroidUiDiagnostics(async () => {
      await startArrowDuel();
      await playBoardMove('session-board', fixture.correctMove);

      await waitFor(element(by.text('Sprint complete'))).toBeVisible().withTimeout(30000);
      await waitFor(element(by.id('sprint-result-solved'))).toHaveText('1 / 1').withTimeout(10000);
      await waitForElementTextContaining(
        'sprint-result-rating-range',
        `${fixture.puzzle.rating} -> ${fixture.expectedRatingAfter}`,
        10000
      );

      await device.pressBack();
      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(10000);
      await device.terminateApp();
      await launchArrowDuelApp({ deleteData: false, testNowMs: RELAUNCH_TEST_NOW_MS });

      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
      await waitForVisibleInPracticeScroll('practice-mode-arrow-duel-rating');
      await waitForElementTextContaining(
        'practice-mode-arrow-duel-rating',
        String(fixture.expectedRatingAfter),
        10000
      );
      await element(by.id('practice-mode-arrow-duel')).tap();
      await waitForElementTextContaining('practice-progress-weekly-solved', '1', 10000);
      await waitForElementTextContaining('practice-progress-rating-delta', '+175 this week', 10000);

      await openArrowDuelHistory();
      const result = element(by.text('Correct')).atIndex(0);
      await waitFor(result).toBeVisible().whileElement(by.id('practice-main-scroll')).scroll(100, 'down');
      const resultAttributes = await result.getAttributes();
      const resultIdentifier = (Array.isArray(resultAttributes) ? resultAttributes[0] : resultAttributes).identifier;
      if (typeof resultIdentifier !== 'string' || !resultIdentifier.endsWith('-result')) {
        throw new Error(`Could not resolve persisted Arrow Duel history row from ${String(resultIdentifier)}`);
      }
      await element(by.id(resultIdentifier.replace(/-result$/, ''))).tap();

      await waitFor(element(by.id('review-session'))).toExist().withTimeout(10000);
      await waitForVisibleInPracticeScroll('review-analysis-button');
      await element(by.id('review-analysis-button')).tap();
      await waitFor(element(by.id('review-close-analysis'))).toBeVisible().withTimeout(10000);
      await waitForElementTextContaining('review-analysis-engine-status', 'SF 18 NNUE', 45000);
      await waitForElementTextContaining('review-analysis-line-0', 'Top move', 90000);

      await device.pressBack();
      await waitFor(element(by.id('review-analysis-button'))).toBeVisible().withTimeout(10000);
      await expect(element(by.id('review-close-analysis'))).not.toExist();
      await device.pressBack();
      await waitFor(element(by.id('history-action-header'))).toExist().withTimeout(10000);
      await expect(element(by.id('review-session'))).not.toExist();
    });
  });
});

async function launchArrowDuelApp({ deleteData, resetAppState, testNowMs }) {
  await launchWithDisabledSynchronization({
    ...(deleteData === undefined ? {} : { delete: deleteData }),
    ...(resetAppState === undefined ? {} : { resetAppState }),
    newInstance: true,
    launchArgs: {
      chessticizeArrowDuelTargetCorrect: String(fixture.targetCorrect),
      chessticizePuzzleSelectionSeed: fixture.puzzleSelectionSeed,
      chessticizeTestNowMs: testNowMs,
    },
  });
}

async function startArrowDuel() {
  await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
  await startPracticeMode('arrow-duel');
  await waitForVisibleInPracticeScroll('session-board');
  await waitForElementTextContaining('arrow-duel-candidate-overlay', fixture.candidates[0], 10000);
  await waitForElementTextContaining('arrow-duel-candidate-overlay', fixture.candidates[1], 10000);
  await waitForElementAccessibilityLabelContaining(
    'arrow-duel-candidate-overlay',
    'Arrow Duel candidates',
    10000,
    25
  );
}

async function openArrowDuelHistory() {
  await openTab('history-tab', 'history-action-header');
  await waitForVisibleInPracticeScroll('history-rating-arrow_duel 5/30');
  await element(by.id('history-rating-arrow_duel 5/30')).tap();
}
