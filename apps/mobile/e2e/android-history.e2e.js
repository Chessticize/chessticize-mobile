const {
  elementText,
  failStandardSprint,
  launchWithDisabledSynchronization,
  openTab,
  waitForElementTextContaining,
  waitForVisibleInPracticeScroll,
  withAndroidUiDiagnostics,
} = require('./helpers');

const TEST_NOW_MS = '1784030400000';
const RELAUNCH_TEST_NOW_MS = String(Number(TEST_NOW_MS) + 5 * 60_000);

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

      await waitFor(element(by.id('history-attempt-detail'))).toExist().withTimeout(10000);
      await waitForElementTextContaining('history-attempt-detail-context', 'Standard · Sprint', 10000);
      await waitForElementTextContaining('history-attempt-detail-result', 'Wrong move', 10000);
      await waitForElementTextContaining('history-attempt-detail-moves', 'Played', 10000);
      await expect(element(by.id('history-attempt-detail-rating-key'))).toHaveLabel('Rating bucket standard 5/20');
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
    });
  });
});
