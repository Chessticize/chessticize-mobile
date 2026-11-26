const {
  launchWithDisabledSynchronization,
  openTab,
  waitForVisibleInPracticeScroll,
} = require('./helpers');

async function openLanguagePicker() {
  await openTab('settings-tab', 'settings-language-row');
  await waitForVisibleInPracticeScroll('settings-language-row');
  await element(by.id('settings-language-row')).tap();
  await waitFor(element(by.id('settings-language-option-ja')))
    .toBeVisible()
    .withTimeout(10000);
}

describe('In-app language settings', () => {
  afterAll(async () => {
    try {
      await openLanguagePicker();
      await element(by.id('settings-language-option-system')).tap();
    } catch {
      // Best-effort cleanup back to System default.
    }
  });

  it('switches language live across tabs and persists across cold relaunch', async () => {
    await launchWithDisabledSynchronization({ delete: true, newInstance: true });
    await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);

    // Switch to Japanese and verify live update without restart.
    await openLanguagePicker();
    await element(by.id('settings-language-option-ja')).tap();
    await waitFor(element(by.text('言語'))).toBeVisible().withTimeout(10000);

    await openTab('practice-tab', 'practice-run-start');
    await waitFor(element(by.text('練習'))).toBeVisible().withTimeout(10000);

    // Cold relaunch and verify Japanese persisted locally.
    await device.terminateApp();
    await launchWithDisabledSynchronization({ newInstance: true });
    await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
    await waitFor(element(by.text('練習'))).toBeVisible().withTimeout(15000);

    // Switch back to System (English on test simulator) and verify live restoration.
    await openLanguagePicker();
    await element(by.id('settings-language-option-system')).tap();
    await waitFor(element(by.text('Language'))).toBeVisible().withTimeout(10000);
  });
});
