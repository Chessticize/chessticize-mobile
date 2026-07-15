const {
  androidAppIsResumed,
  beginAndroidPredictiveBackGesture,
  launchWithDisabledSynchronization,
  openTab,
  selectTestPuzzleSource,
  sleep,
  startPracticeMode,
  waitForVisibleInPracticeScroll,
  withAndroidUiDiagnostics
} = require('./helpers');

describe('Android product-aware system Back', () => {
  beforeEach(async () => {
    if (device.getPlatform() !== 'android') {
      throw new Error('The Android system Back journey requires an Android device.');
    }
    await launchWithDisabledSynchronization({
      delete: true,
      newInstance: true
    });
  });

  it('unwinds transients, preserves cancelled practice, matches Predictive Back, and delegates at root', async () => {
    await withAndroidUiDiagnostics(async () => {
      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);

      await openTab('history-tab', 'history-action-header');
      await element(by.id('history-filter-toggle')).tap();
      await waitFor(element(by.id('history-advanced-filters'))).toExist().withTimeout(10000);

      await device.pressBack();
      await waitFor(element(by.id('history-advanced-filters'))).not.toExist().withTimeout(10000);
      await expect(element(by.id('history-panel'))).toExist();

      await device.pressBack();
      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(10000);

      await openTab('settings-tab', 'settings-panel');
      const cancelledPredictiveBack = beginAndroidPredictiveBackGesture({ cancel: true });
      await cancelledPredictiveBack.started;
      await waitFor(element(by.id('mobile-back-destination-preview'))).toExist().withTimeout(10000);
      await expect(element(by.id('mobile-back-destination-preview-label'))).toHaveText('Practice');
      await cancelledPredictiveBack.completion();
      await waitFor(element(by.id('mobile-back-destination-preview'))).not.toExist().withTimeout(10000);
      await expect(element(by.id('settings-panel'))).toExist();

      const committedPredictiveBack = beginAndroidPredictiveBackGesture();
      await committedPredictiveBack.started;
      await waitFor(element(by.id('mobile-back-destination-preview'))).toExist().withTimeout(10000);
      await expect(element(by.id('mobile-back-destination-preview-label'))).toHaveText('Practice');
      await committedPredictiveBack.completion();
      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(10000);

      await selectTestPuzzleSource('familiar15');
      await waitForVisibleInPracticeScroll('practice-mode-arrow-duel');
      await element(by.id('practice-mode-arrow-duel')).tap();
      await element(by.id('practice-main-scroll')).scrollTo('top');
      await element(by.id('practice-start-button')).tap();
      await waitFor(element(by.id('sprint-loading-overlay'))).toExist().withTimeout(10000);
      await device.pressBack();
      await waitFor(element(by.id('sprint-loading-overlay'))).not.toExist().withTimeout(10000);
      await sleep(500);
      await expect(element(by.id('practice-home'))).toExist();

      await startPracticeMode('standard');
      await waitForVisibleInPracticeScroll('session-board');

      await device.pressBack();
      await waitFor(element(by.id('session-abandon-confirmation'))).toExist().withTimeout(10000);
      await expect(element(by.id('session-board'))).toExist();

      await device.pressBack();
      await waitFor(element(by.id('session-abandon-confirmation'))).not.toExist().withTimeout(10000);
      await expect(element(by.id('session-board'))).toExist();

      await device.pressBack();
      await waitFor(element(by.id('session-abandon-confirmation'))).toExist().withTimeout(10000);
      await element(by.id('session-abandon-confirm')).tap();
      await waitFor(element(by.text('Sprint failed'))).toExist().withTimeout(10000);
      await element(by.id('back-practice-button')).tap();
      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(10000);

      const rootPredictiveBack = beginAndroidPredictiveBackGesture();
      await rootPredictiveBack.started;
      await sleep(500);
      await expect(element(by.id('mobile-back-destination-preview'))).not.toExist();
      await rootPredictiveBack.completion();
      await sleep(750);
      if (androidAppIsResumed()) {
        throw new Error('Idle Practice root trapped Predictive Back instead of delegating to Android.');
      }
    });
  });
});
