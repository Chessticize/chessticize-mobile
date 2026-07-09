const {
  openStandardHistoryTrend,
  launchWithDisabledSynchronization,
  sleep,
  startPracticeMode,
  selectTestPuzzleSource,
  waitForVisibleInPracticeScroll,
  waitForElementTextContaining,
  failStandardSprint
} = require('./helpers');

const describeStoreAssets = process.env.CHESSTICIZE_CAPTURE_STORE_ASSETS === '1' ? describe : describe.skip;

describeStoreAssets('App Store screenshot capture', () => {
  beforeEach(async () => {
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: true
    });
  });

  it('captures the practice home scene', async () => {
    await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
    await element(by.id('practice-main-scroll')).scrollTo('top');
    await waitFor(element(by.id('practice-action-header'))).toBeVisible().withTimeout(10000);
    await device.takeScreenshot('app-store-01-practice-home');
  });

  it('captures the standard sprint scene', async () => {
    await selectTestPuzzleSource('familiar15');
    await startPracticeMode('standard');
    await waitForVisibleInPracticeScroll('session-board');
    await device.takeScreenshot('app-store-02-standard-sprint');
  });

  it('captures the Arrow Duel scene', async () => {
    await selectTestPuzzleSource('familiar15');
    await startPracticeMode('arrow-duel');
    await waitForVisibleInPracticeScroll('session-board');
    await expect(element(by.id('arrow-duel-candidate-a'))).not.toExist();
    await expect(element(by.id('arrow-duel-candidate-b'))).not.toExist();
    await device.takeScreenshot('app-store-03-arrow-duel');
  });

  it('captures results, review analysis, and history scenes', async () => {
    await failStandardSprint();
    await waitFor(element(by.id('sprint-summary-panel'))).toBeVisible().withTimeout(10000);
    await device.takeScreenshot('app-store-04-sprint-results');

    await element(by.id('review-mistakes-button')).tap();
    await waitFor(element(by.id('review-session'))).toBeVisible().withTimeout(30000);
    await element(by.id('review-analysis-button')).tap();
    await waitForElementTextContaining('review-analysis-engine-status', 'SF 18 NNUE', 45000);
    await waitForElementTextContaining('review-analysis-line-0', 'Top move', 90000);
    await device.takeScreenshot('app-store-05-mistake-review-analysis');

    await element(by.id('review-exit')).tap();
    await waitFor(element(by.id('practice-tab'))).toBeVisible().withTimeout(10000);
    await openStandardHistoryTrend();
    await sleep(500);
    await device.takeScreenshot('app-store-06-history');
  });
});
