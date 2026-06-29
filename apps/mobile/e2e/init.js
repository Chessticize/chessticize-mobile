beforeEach(async () => {
  await device.launchApp({ delete: true, newInstance: true });
  // These smoke tests use explicit waitFor checks and screenshot assertions.
  // React Native, Skia, and native engine startup can keep Detox synchronization
  // busy after the first visible frame, which makes taps wait for unrelated
  // run-loop idleness instead of the user-visible state under test.
  await device.disableSynchronization();
});
