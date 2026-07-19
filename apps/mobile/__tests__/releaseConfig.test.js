const {
  arePracticeTestControlsEnabled,
  isPracticeDebugEnabled,
  isReactNativeDevBuild,
  shouldSuppressLogBoxWarnings
} = require("../src/releaseConfig");

describe("release configuration gates", () => {
  it("treats React Native __DEV__ as the development-build signal", () => {
    expect(isReactNativeDevBuild({ __DEV__: true })).toBe(true);
    expect(isReactNativeDevBuild({ __DEV__: false })).toBe(false);
    expect(isReactNativeDevBuild({})).toBe(false);
  });

  it("keeps practice test controls out of release unless an explicit harness enables them", () => {
    expect(arePracticeTestControlsEnabled({ __DEV__: true })).toBe(true);
    expect(arePracticeTestControlsEnabled({ __DEV__: false })).toBe(false);
    expect(
      arePracticeTestControlsEnabled({
        __CHESSTICIZE_ENABLE_TEST_CONTROLS__: true,
        __DEV__: false
      })
    ).toBe(true);
  });

  it("lets a production-like development shell explicitly disable test controls", () => {
    expect(
      arePracticeTestControlsEnabled({
        __CHESSTICIZE_ENABLE_TEST_CONTROLS__: false,
        __DEV__: true
      })
    ).toBe(false);
  });

  it("keeps debug tracing behind an explicit debug flag", () => {
    expect(isPracticeDebugEnabled({ __CHESSTICIZE_PRACTICE_DEBUG__: true })).toBe(true);
    expect(isPracticeDebugEnabled({ __DEV__: true })).toBe(false);
  });

  it("limits LogBox suppression to development builds", () => {
    expect(shouldSuppressLogBoxWarnings({ __DEV__: true })).toBe(true);
    expect(shouldSuppressLogBoxWarnings({ __DEV__: false })).toBe(false);
  });
});
