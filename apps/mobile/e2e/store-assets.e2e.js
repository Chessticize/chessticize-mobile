const {
  launchWithDisabledSynchronization,
  sleep,
  startPracticeMode,
  waitForVisibleInPracticeScroll
} = require('./helpers');

const describeStoreAssets = process.env.CHESSTICIZE_CAPTURE_STORE_ASSETS === '1' ? describe : describe.skip;

describeStoreAssets('App Store screenshot capture', () => {
  beforeEach(async () => {
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: true
    });
  });

  it('captures the main tab scenes', async () => {
    await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
    await sleep(1200);
    await device.takeScreenshot('app-store-01-practice-tab');

    await openTabForScreenshot('review-tab', 'review-empty-state');
    await sleep(1200);
    await device.takeScreenshot('app-store-02-review-tab');

    await openTabForScreenshot('history-tab', 'history-action-header');
    await sleep(1200);
    await device.takeScreenshot('app-store-03-history-tab');

    await openTabForScreenshot('settings-tab', 'settings-sync-section');
    await sleep(1200);
    await device.takeScreenshot('app-store-04-settings-tab');
  });

  it('captures the standard sprint scene', async () => {
    await startPracticeMode('standard');
    await waitForVisibleInPracticeScroll('session-board');
    await sleep(500);
    await device.takeScreenshot('app-store-05-standard-sprint');
  });

  it('captures the Arrow Duel scene', async () => {
    await startPracticeMode('arrow-duel');
    await waitForVisibleInPracticeScroll('session-board');
    await waitFor(element(by.id('arrow-duel-candidate-overlay'))).toExist().withTimeout(10000);
    await sleep(500);
    await device.takeScreenshot('app-store-06-arrow-duel');
  });
});

async function openTabForScreenshot(tabTestID, contentTestID) {
  await waitFor(element(by.id(tabTestID))).toExist().withTimeout(180000);
  await element(by.id(tabTestID)).tap();
  await waitFor(element(by.id(contentTestID))).toExist().withTimeout(10000);
}
