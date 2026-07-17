const {
  launchWithDisabledSynchronization,
  openTab,
  waitForElementTextContaining,
  withAndroidUiDiagnostics,
} = require('./helpers');

describe('Android API 24 native-engine smoke', () => {
  beforeAll(async () => {
    await withAndroidUiDiagnostics(async () => {
      await launchWithDisabledSynchronization({ delete: true, newInstance: true });
    });
  });

  it('runs the packaged Stockfish engine from the public diagnostics surface', async () => {
    await withAndroidUiDiagnostics(async () => {
      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
      await openTab('settings-tab', 'settings-stockfish-diagnostics');
      await element(by.id('settings-stockfish-diagnostics')).tap();
      await waitFor(element(by.id('stockfish-diagnostics-run'))).toBeVisible().withTimeout(10000);
      await element(by.id('stockfish-diagnostics-run')).tap();
      await waitForElementTextContaining('stockfish-diagnostics-status', 'Done', 120000);
      await waitFor(element(by.id('stockfish-diagnostics-line-0'))).toExist().withTimeout(10000);
    });
  });
});
