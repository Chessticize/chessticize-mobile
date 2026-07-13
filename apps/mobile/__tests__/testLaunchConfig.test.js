const {
  createAdvancingTestClock,
  isStoreAssetCaptureEnabled,
  resolveTestNowMsFromLaunchConfig
} = require("../src/backend/testLaunchConfig");

describe("test launch configuration", () => {
  it("ignores native test clock values outside development or explicit test harness controls", () => {
    expect(
      resolveTestNowMsFromLaunchConfig(
        { __DEV__: false, __CHESSTICIZE_ENABLE_TEST_CONTROLS__: false },
        { testNowMs: "1780000000000" }
      )
    ).toBeUndefined();
  });

  it("accepts a positive fixed clock from native launch args for the explicit test harness", () => {
    expect(
      resolveTestNowMsFromLaunchConfig(
        { __DEV__: false, __CHESSTICIZE_ENABLE_TEST_CONTROLS__: true },
        { testNowMs: "1780000000000" }
      )
    ).toBe(1780000000000);
  });

  it("accepts a fixed clock for release store-asset capture without enabling visible test controls", () => {
    expect(
      resolveTestNowMsFromLaunchConfig(
        { __DEV__: false, __CHESSTICIZE_ENABLE_TEST_CONTROLS__: false },
        { storeAssetCapture: true, testNowMs: "1780000000000" }
      )
    ).toBe(1780000000000);
    expect(isStoreAssetCaptureEnabled({ storeAssetCapture: true })).toBe(true);
    expect(isStoreAssetCaptureEnabled({ storeAssetCapture: false })).toBe(false);
  });

  it("rejects invalid native test clock values", () => {
    expect(resolveTestNowMsFromLaunchConfig({ __DEV__: true }, { testNowMs: "not-a-time" })).toBeUndefined();
    expect(resolveTestNowMsFromLaunchConfig({ __DEV__: true }, { testNowMs: "-1" })).toBeUndefined();
  });

  it("anchors the test date while allowing countdown timers to advance", () => {
    let wallNowMs = 5_000;
    const clock = createAdvancingTestClock(1_780_000_000_000, () => wallNowMs);

    expect(clock()).toBe(1_780_000_000_000);
    wallNowMs += 1_250;
    expect(clock()).toBe(1_780_000_001_250);
  });
});
