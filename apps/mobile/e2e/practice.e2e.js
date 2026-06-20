describe('Practice POC', () => {
  it('completes a standard multi-step sprint and shows history', async () => {
    await waitFor(element(by.id('start-sprint-button'))).toBeVisible().withTimeout(30000);
    await element(by.id('start-sprint-button')).tap();
    await waitFor(element(by.id('puzzle-id-label'))).toHaveText('00008 · 1798').withTimeout(10000);

    await element(by.id('move-e6e7')).tap();
    await element(by.id('move-b3c1')).tap();
    await element(by.id('move-h6c1')).tap();

    await expect(element(by.id('session-bar'))).toBeVisible();
    await element(by.id('history-tab')).tap();
    await waitFor(element(by.id('history-panel'))).toBeVisible().withTimeout(10000);
    await expect(element(by.text('00008 · correct · h6c1'))).toBeVisible();
  });

  it('shows Arrow Duel review and due review queue after a wrong choice', async () => {
    await waitFor(element(by.id('arrow-duel-mode-button'))).toBeVisible().withTimeout(30000);
    await element(by.id('arrow-duel-mode-button')).tap();
    await element(by.id('start-sprint-button')).tap();
    await element(by.id('move-f2g3')).tap();

    await waitFor(element(by.id('arrow-review-panel'))).toBeVisible().withTimeout(10000);
    await element(by.id('review-tab')).tap();
    await waitFor(element(by.id('review-panel'))).toBeVisible().withTimeout(10000);
    await expect(element(by.text('00008 · wrong · 2026-06-21'))).toBeVisible();
  });
});
