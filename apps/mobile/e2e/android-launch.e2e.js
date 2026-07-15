const {
  launchWithDisabledSynchronization,
  withAndroidUiDiagnostics,
} = require('./helpers');

describe('Android launch baseline', () => {
  beforeAll(async () => {
    await withAndroidUiDiagnostics(async () => {
      await launchWithDisabledSynchronization({
        resetAppState: true,
        newInstance: true,
      });
    });
  });

  it('launches the real app and renders its public Practice UI', async () => {
    await withAndroidUiDiagnostics(async () => {
      await waitFor(element(by.id('app-shell-header'))).toBeVisible().withTimeout(180000);
      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
      await expect(element(by.id('practice-tab'))).toBeVisible();
    });
  });
});
