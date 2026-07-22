const {
  launchWithDisabledSynchronization,
  openTab,
  playBoardMove,
  waitForElementAccessibilityLabelContaining,
  waitForElementTextContaining,
  waitForVisibleInPracticeScroll,
  withAndroidUiDiagnostics,
} = require('./helpers');
const practiceFixture = require('../../../fixtures/puzzles/android-standard-practice.fixture.json');

const TEST_NOW_MS = '1784030400000';
const RELAUNCH_TEST_NOW_MS = String(Number(TEST_NOW_MS) + 5 * 60_000);
const CUSTOM_RUN_NAME = 'Fork Focus';
const EXPECTED_AUTO_REPLY_MOVE = practiceFixture.puzzle.solutionMoves[2];
const EXPECTED_RATING_DELTA = practiceFixture.expectedRatingAfter - practiceFixture.puzzle.rating;

describe(`Android Custom Practice completion (${practiceFixture.puzzle.id})`, () => {
  beforeAll(async () => {
    if (device.getPlatform() !== 'android') {
      throw new Error('The Android Custom Practice journey requires an Android device.');
    }
    await launchWithDisabledSynchronization({
      delete: true,
      newInstance: true,
      launchArgs: {
        chessticizeCustomTargetCorrect: '1',
        chessticizePuzzleSelectionId: practiceFixture.puzzle.id,
        chessticizePuzzleSelectionSeed: practiceFixture.puzzleSelectionSeed,
        chessticizeTestNowMs: TEST_NOW_MS,
      },
    });
  });

  it('completes, analyzes, unwinds with Back, and restores Custom progress after relaunch', async () => {
    await withAndroidUiDiagnostics(async () => {
      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);

      // New Run is a child destination. Android Back returns to the saved-run
      // Home without creating or starting anything.
      await openNewRunEditor();
      await device.pressBack();
      await waitFor(element(by.id('practice-run-management'))).toExist().withTimeout(10000);
      await expect(element(by.text(CUSTOM_RUN_NAME))).not.toExist();

      await openNewRunEditor();
      await element(by.id('practice-run-name-input')).replaceText(CUSTOM_RUN_NAME);
      await element(by.id('custom-mode-arrow-duel')).tap();
      await element(by.id('custom-mode-regular')).tap();
      await waitForVisibleInPracticeScroll('custom-theme-fork');
      await element(by.id('custom-theme-fork')).tap();
      await waitForVisibleInPracticeScroll('practice-run-duration-stepper-decrease');
      await element(by.id('practice-run-duration-stepper-decrease')).tap();
      await waitForVisibleInPracticeScroll('practice-run-per-puzzle-stepper-increase');
      await element(by.id('practice-run-per-puzzle-stepper-increase')).tap();
      await waitForVisibleInPracticeScroll('practice-run-elo-increase');
      await element(by.id('practice-run-elo-increase')).tap();
      await waitForElementTextContaining('practice-run-elo-value', 'ELO 925', 5000);
      await element(by.id('practice-run-elo-decrease')).tap();
      await waitForElementTextContaining('practice-run-elo-value', 'ELO 900', 5000);
      for (let index = 0; index < 12; index += 1) {
        await element(by.id('practice-run-elo-decrease')).tap();
      }
      await waitForElementTextContaining('practice-run-elo-value', 'ELO 600', 5000);

      await element(by.id('practice-main-scroll')).scrollTo('top');
      await element(by.id('practice-run-save')).tap();
      await waitFor(element(by.id('practice-run-home-done'))).toBeVisible().withTimeout(10000);
      await element(by.id('practice-run-home-done')).tap();
      await waitFor(element(by.text(CUSTOM_RUN_NAME))).toExist().withTimeout(10000);
      await element(by.text(CUSTOM_RUN_NAME)).tap();
      await element(by.id('practice-main-scroll')).scrollTo('top');
      await waitFor(element(by.id('practice-run-start'))).toBeVisible().withTimeout(10000);
      await element(by.id('practice-run-start')).tap();
      await waitFor(element(by.id('session-board'))).toExist().withTimeout(15000);
      await waitFor(element(by.id('session-progress'))).toHaveText('0 / 1').withTimeout(10000);

      // Active Custom uses the same guarded exit contract as every practice
      // mode. The first Back offers confirmation; the second cancels it.
      await device.pressBack();
      await waitFor(element(by.id('session-abandon-confirmation'))).toExist().withTimeout(10000);
      await device.pressBack();
      await waitFor(element(by.id('session-abandon-confirmation'))).not.toExist().withTimeout(10000);
      await expect(element(by.id('session-board'))).toExist();

      await waitForElementAccessibilityLabelContaining(
        'session-side-to-move',
        'Black to move',
        10000,
        25
      );
      await waitForVisibleInPracticeScroll('session-board');
      await playBoardMove('session-board', practiceFixture.userMoves[0], true);
      await waitForElementAccessibilityLabelContaining(
        'session-board',
        `Last move ${EXPECTED_AUTO_REPLY_MOVE.slice(0, 2)} to ${EXPECTED_AUTO_REPLY_MOVE.slice(2, 4)}`,
        10000,
        50
      );
      await waitForElementAccessibilityLabelContaining(
        'session-side-to-move',
        'Black to move',
        10000,
        25
      );
      await playBoardMove('session-board', practiceFixture.userMoves[1], true);

      await waitFor(element(by.text('Sprint complete'))).toBeVisible().withTimeout(30000);
      await waitForElementTextContaining('sprint-result-solved', '1 / 1', 10000);
      await waitForElementTextContaining(
        'sprint-result-rating-range',
        `600 -> ${practiceFixture.expectedRatingAfter}`,
        10000
      );

      // The completed result's History shortcut owns the route to the exact
      // saved attempt and its Android Stockfish analysis.
      await element(by.id('sprint-result-history-button')).tap();
      await waitFor(element(by.id('history-performance-card'))).toExist().withTimeout(10000);
      await openFirstCorrectHistoryAttempt();
      await waitForVisibleInPracticeScroll('review-board');
      await expect(element(by.id('history-attempt-detail'))).not.toExist();
      await waitForVisibleInPracticeScroll('review-schedule-control');
      await waitForVisibleInPracticeScroll('review-analysis-button');
      await element(by.id('review-analysis-button')).tap();
      await waitForElementTextContaining('review-analysis-engine-status', 'SF 18 NNUE', 60000);

      // Back closes analysis first, then returns the attempt to History. The
      // terminal saved-Run result remains the Practice destination until its
      // own Back returns to the saved-run Home.
      await device.pressBack();
      await waitFor(element(by.id('review-analysis-button'))).toExist().withTimeout(10000);
      await expect(element(by.id('review-close-analysis'))).not.toExist();
      await device.pressBack();
      await waitFor(element(by.id('history-panel'))).toExist().withTimeout(10000);
      await element(by.id('practice-tab')).tap();
      await waitFor(element(by.id('sprint-summary-panel'))).toExist().withTimeout(10000);
      await device.pressBack();
      await waitFor(element(by.id('practice-run-management'))).toExist().withTimeout(10000);

      await device.terminateApp();
      await launchWithDisabledSynchronization({
        delete: false,
        newInstance: true,
        launchArgs: { chessticizeTestNowMs: RELAUNCH_TEST_NOW_MS },
      });

      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);

      await openTab('history-tab', 'history-action-header');
      await waitFor(element(by.text(`${CUSTOM_RUN_NAME} · 30s pace`))).toExist().withTimeout(10000);
      await element(by.text(`${CUSTOM_RUN_NAME} · 30s pace`)).tap();
      await waitForElementTextContaining('history-chart-value', String(practiceFixture.expectedRatingAfter), 10000);
      await waitFor(element(by.id('history-chart-line'))).toExist().withTimeout(10000);
      await waitFor(element(by.text(CUSTOM_RUN_NAME)).atIndex(0)).toExist().withTimeout(10000);
      await waitFor(element(by.text('Correct')).atIndex(0)).toExist().withTimeout(10000);

      await openTab('practice-tab', 'practice-run-management');
      await waitFor(element(by.text(CUSTOM_RUN_NAME))).toExist().withTimeout(10000);
      await waitFor(element(by.text(`ELO ${practiceFixture.expectedRatingAfter}`))).toExist().withTimeout(10000);
      await element(by.text(CUSTOM_RUN_NAME)).tap();
      await waitForVisibleInPracticeScroll('practice-progress-summary');
      await waitForElementAccessibilityLabelContaining(
        'practice-progress-summary',
        `ELO ${practiceFixture.expectedRatingAfter}`,
        10000,
        50
      );
      await waitForElementTextContaining('practice-progress-weekly-solved', '1', 10000);
      await waitForElementTextContaining('practice-progress-weekly-delta', '+1 net', 10000);
      await waitForElementTextContaining(
        'practice-progress-rating-delta',
        `+${EXPECTED_RATING_DELTA} this week`,
        10000
      );
    });
  });
});

async function openNewRunEditor() {
  await waitForVisibleInPracticeScroll('practice-add-run');
  await element(by.id('practice-add-run')).tap();
  await waitFor(element(by.id('practice-run-editor'))).toExist().withTimeout(10000);
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await waitFor(element(by.id('custom-mode-regular'))).toBeVisible().withTimeout(10000);
}

async function openFirstCorrectHistoryAttempt() {
  await waitFor(element(by.text('Correct')).atIndex(0))
    .toBeVisible()
    .whileElement(by.id('practice-main-scroll'))
    .scroll(100, 'down');
  const attributes = await element(by.text('Correct')).atIndex(0).getAttributes();
  const identifier = (Array.isArray(attributes) ? attributes[0] : attributes).identifier;
  if (typeof identifier !== 'string' || !identifier.endsWith('-result')) {
    throw new Error(`Could not resolve Custom history attempt row from ${String(identifier)}`);
  }
  await element(by.id(identifier.replace(/-result$/, ''))).tap();
  await waitFor(element(by.id('review-session'))).toExist().withTimeout(10000);
}
