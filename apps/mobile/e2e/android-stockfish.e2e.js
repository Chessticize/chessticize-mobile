const {
  failStandardSprint,
  launchWithDisabledSynchronization,
  openTab,
  sleep,
  waitForElementTextContaining,
} = require('./helpers');

describe('Android on-device Stockfish analysis', () => {
  beforeAll(async () => {
    await launchWithDisabledSynchronization({ delete: true, newInstance: true });
  });

  it('streams fixed-position analysis and survives cancellation, backgrounding, and restart', async () => {
    await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
    await failStandardSprint();
    await waitFor(element(by.id('review-mistakes-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('review-mistakes-button')).tap();

    await waitFor(element(by.text('1 / 3 · Standard'))).toBeVisible().withTimeout(30000);
    await element(by.id('review-analysis-button')).tap();
    await waitForElementTextContaining('review-analysis-engine-status', 'SF 18 NNUE', 60000);
    await waitForElementTextContaining('review-analysis-line-0', 'Qa4#', 120000);

    // Cancel an active replacement search, then immediately reuse the same
    // native engine for a different position.
    await element(by.id('review-close-analysis')).tap();
    await element(by.id('review-next')).tap();
    await element(by.id('review-analysis-button')).tap();
    await waitForRunningStockfishDepth(4, 90000);
    await element(by.id('review-close-analysis')).tap();
    await element(by.id('review-next')).tap();
    await element(by.id('review-analysis-button')).tap();
    await waitForElementTextContaining('review-analysis-engine-status', 'SF 18 NNUE', 60000);

    // Backgrounding sends stop through the lifecycle adapter without losing
    // the completed attempt or making the analysis UI unusable.
    await device.sendToHome();
    await sleep(500);
    await launchWithDisabledSynchronization({ delete: false, newInstance: false });
    await waitFor(element(by.id('review-close-analysis'))).toBeVisible().withTimeout(30000);
    await expect(element(by.id('review-analysis-engine-status'))).toBeVisible();

    // A process shutdown releases the runner. A fresh process can initialize
    // the packaged engine and networks again through the public diagnostics UI.
    await device.terminateApp();
    await launchWithDisabledSynchronization({ delete: false, newInstance: true });
    await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
    await openTab('settings-tab', 'settings-stockfish-diagnostics');
    await element(by.id('settings-stockfish-diagnostics')).tap();
    await waitFor(element(by.id('stockfish-diagnostics-run'))).toBeVisible().withTimeout(10000);
    await element(by.id('stockfish-diagnostics-run')).tap();
    await waitForElementTextContaining('stockfish-diagnostics-status', 'Done', 120000);
    await waitFor(element(by.id('stockfish-diagnostics-line-0'))).toExist().withTimeout(10000);
  });
});

async function waitForRunningStockfishDepth(minimumDepth, timeoutMs) {
  const startedAt = Date.now();
  let lastText = '';
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const attributes = await element(by.id('review-analysis-engine-status')).getAttributes();
      const first = Array.isArray(attributes) ? attributes[0] : attributes;
      lastText = String(first?.text ?? first?.label ?? first?.value ?? '');
      const depth = Number(lastText.match(/Depth (\d+)\/20/)?.[1] ?? 0);
      if (depth >= minimumDepth) {
        return;
      }
    } catch (error) {
      lastText = error?.message ?? String(error);
    }
    await sleep(25);
  }
  throw new Error(`Timed out waiting for an active Stockfish search. Last text: "${lastText}"`);
}
