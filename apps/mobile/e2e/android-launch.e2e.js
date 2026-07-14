describe('Android launch baseline', () => {
  beforeAll(async () => {
    await device.launchApp({
      delete: true,
      newInstance: true,
      launchArgs: {
        detoxEnableSynchronization: 0,
      },
    });
    await device.disableSynchronization();
  });

  it('launches the real app and renders its public Practice UI', async () => {
    await waitFor(element(by.id('app-shell-header'))).toBeVisible().withTimeout(180000);
    await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
    await expect(element(by.id('practice-tab'))).toBeVisible();
  });
});
