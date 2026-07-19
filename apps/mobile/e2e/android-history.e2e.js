const {
  elementText,
  failStandardSprint,
  launchWithDisabledSynchronization,
  openTab,
  playBoardMove,
  waitForElementTextContaining,
  waitForVisibleInPracticeScroll,
  withAndroidUiDiagnostics,
} = require('./helpers');

const TEST_NOW_MS = '1784030400000';
const RELAUNCH_TEST_NOW_MS = String(Number(TEST_NOW_MS) + 5 * 60_000);
const REVIEW_TEST_NOW_MS = String(Number(TEST_NOW_MS) + 24 * 60 * 60_000 + 60_000);

describe('Android Practice History', () => {
  beforeAll(async () => {
    if (device.getPlatform() !== 'android') {
      throw new Error('The Android History journey requires an Android device.');
    }
    await launchWithDisabledSynchronization({
      delete: true,
      newInstance: true,
      launchArgs: { chessticizeTestNowMs: TEST_NOW_MS },
    });
  });

  it('preserves filters through persisted detail and Back, then resets them after a process relaunch', async () => {
    await withAndroidUiDiagnostics(async () => {
      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
      await failStandardSprint();
      await element(by.id('back-practice-button')).tap();
      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(10000);

      await openTab('history-tab', 'history-action-header');
      await element(by.id('history-range-max')).tap();
      await element(by.id('history-rating-standard 5/20')).tap();
      await element(by.id('history-filter-wrong-only')).tap();
      await waitForElementTextContaining('history-active-filter-summary', 'All Time', 10000);
      await waitForElementTextContaining('history-active-filter-summary', 'Standard', 10000);
      await waitForElementTextContaining('history-active-filter-summary', 'Wrong only', 10000);

      await waitFor(element(by.text('Wrong move')).atIndex(0)).toExist().withTimeout(10000);
      const resultAttributes = await element(by.text('Wrong move')).atIndex(0).getAttributes();
      const resultIdentifier = (Array.isArray(resultAttributes) ? resultAttributes[0] : resultAttributes).identifier;
      if (typeof resultIdentifier !== 'string' || !resultIdentifier.endsWith('-result')) {
        throw new Error(`Could not resolve persisted History row from ${String(resultIdentifier)}`);
      }
      await element(by.id(resultIdentifier.replace(/-result$/, ''))).tap();

      await waitForVisibleInPracticeScroll('review-board');
      await expect(element(by.id('history-attempt-detail'))).not.toExist();
      await waitForVisibleInPracticeScroll('review-schedule-control');
      await waitForVisibleInPracticeScroll('review-analysis-button');
      await expect(element(by.id('review-close-analysis'))).not.toExist();

      await device.pressBack();
      await waitFor(element(by.id('history-panel'))).toExist().withTimeout(10000);
      await waitForElementTextContaining('history-active-filter-summary', 'All Time', 10000);
      await waitForElementTextContaining('history-active-filter-summary', 'Wrong only', 10000);

      await device.terminateApp();
      await launchWithDisabledSynchronization({
        delete: false,
        newInstance: true,
        launchArgs: { chessticizeTestNowMs: RELAUNCH_TEST_NOW_MS },
      });
      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
      await openTab('history-tab', 'history-action-header');
      await waitForElementTextContaining('history-active-filter-summary', '7 days', 10000);
      await waitForElementTextContaining('history-active-filter-summary', 'All puzzles', 10000);
      await waitForElementTextContaining('history-active-filter-summary', 'Sprint', 10000);
      const relaunchedSummary = await elementText('history-active-filter-summary');
      if (relaunchedSummary.includes('Wrong only') || relaunchedSummary.includes('All Time')) {
        throw new Error(`History filters leaked across process relaunch: ${relaunchedSummary}`);
      }

      await device.terminateApp();
      await launchWithDisabledSynchronization({
        delete: false,
        newInstance: true,
        launchArgs: { chessticizeTestNowMs: REVIEW_TEST_NOW_MS },
      });
      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
      await openTab('review-tab', 'review-start-due');
      await element(by.id('review-start-due')).tap();
      await waitFor(element(by.id('review-progress'))).toHaveText('1 / 3 · Standard').withTimeout(10000);
      await waitForElementTextContaining('review-current-expected-move', 'e2e6', 10000);
      await waitForVisibleInPracticeScroll('review-board');

      await playBoardMove('review-board', 'e2e6');
      await waitForElementTextContaining('review-current-expected-move', 'e6f7', 10000);
      await waitFor(element(by.id('review-board-state'))).toHaveText('ready').withTimeout(10000);
      await playBoardMove('review-board', 'e6f7');
      await waitFor(element(by.id('move-feedback-overlay'))).toExist().withTimeout(5000);
      await waitFor(element(by.id('review-progress'))).toHaveText('2 / 3 · Standard').withTimeout(30000);
      await element(by.id('review-exit')).tap();

      await openTab('history-tab', 'history-action-header');
      await element(by.id('history-filter-toggle')).tap();
      await element(by.id('history-source-review')).tap();
      await waitFor(element(by.text('Correct')).atIndex(0)).toExist().withTimeout(10000);
      const reviewResultAttributes = await element(by.text('Correct')).atIndex(0).getAttributes();
      const reviewResultIdentifier = (Array.isArray(reviewResultAttributes)
        ? reviewResultAttributes[0]
        : reviewResultAttributes).identifier;
      if (typeof reviewResultIdentifier !== 'string' || !reviewResultIdentifier.endsWith('-result')) {
        throw new Error(`Could not resolve persisted Review History row from ${String(reviewResultIdentifier)}`);
      }
      await element(by.id(reviewResultIdentifier.replace(/-result$/, ''))).tap();

      await waitForVisibleInPracticeScroll('review-board');
      await expect(element(by.id('history-attempt-detail'))).not.toExist();
      await waitForVisibleInPracticeScroll('review-schedule-control');
      await waitForVisibleInPracticeScroll('review-analysis-button');
      await element(by.id('review-analysis-button')).tap();
      await waitFor(element(by.id('review-close-analysis'))).toExist().withTimeout(10000);

      await device.pressBack();
      await waitFor(element(by.id('review-analysis-button'))).toExist().withTimeout(10000);
      await device.pressBack();
      await waitFor(element(by.id('history-panel'))).toExist().withTimeout(10000);
      await waitForElementTextContaining('history-active-filter-summary', 'Review', 10000);
    });
  });
});
