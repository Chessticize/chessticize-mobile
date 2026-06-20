describe('Practice POC', () => {
  it('renders the standard sprint board', async () => {
    await waitFor(element(by.id('start-sprint-button'))).toBeVisible().withTimeout(30000);
    await element(by.id('start-sprint-button')).tap();
    await waitFor(element(by.id('puzzle-id-label'))).toHaveText('000hf · 1485').withTimeout(10000);
    await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(10000);

    await device.takeScreenshot('standard-board');
  });

  it('renders Arrow Duel candidate arrows on the board', async () => {
    await waitFor(element(by.id('practice-mode-arrow-duel'))).toBeVisible().withTimeout(30000);
    await element(by.id('practice-mode-arrow-duel')).tap();
    await element(by.id('start-sprint-button')).tap();
    await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(10000);

    await device.takeScreenshot('arrow-duel-neutral-arrows');
  });
});
