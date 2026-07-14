const {
  collectAndroidUiDiagnostics,
  launchWithDisabledSynchronization,
} = require('./helpers');

async function withAndroidUiDiagnostics(action) {
  try {
    await action();
  } catch (error) {
    try {
      collectAndroidUiDiagnostics();
    } catch (diagnosticsError) {
      console.log(
        `[android-ui-diagnostics] collection failed: ${diagnosticsError?.message ?? String(diagnosticsError)}`
      );
    }
    throw error;
  }
}

describe('Android launch baseline', () => {
  beforeAll(async () => {
    await withAndroidUiDiagnostics(async () => {
      await launchWithDisabledSynchronization({
        delete: true,
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
