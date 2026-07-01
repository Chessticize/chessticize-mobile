beforeAll(async () => {
  await device.launchApp({ delete: true, newInstance: true });
  // These smoke tests use explicit waitFor checks and screenshot assertions.
  // React Native, Skia, and native engine startup can keep Detox synchronization
  // busy after the first visible frame. Launching once avoids repeated iOS
  // simulator relaunch stalls while each spec cleans up through visible UI.
  await device.disableSynchronization();
});

afterAll(async () => {
  await device.terminateApp();
});
