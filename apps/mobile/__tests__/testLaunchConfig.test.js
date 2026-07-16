const {
  createAdvancingTestClock,
  isStoreAssetCaptureEnabled,
  resolveTestArrowDuelTargetCorrectFromLaunchConfig,
  resolveTestCustomTargetCorrectFromLaunchConfig,
  resolveTestNowMsFromLaunchConfig,
  resolveTestPuzzleSelectionIdFromLaunchConfig,
  resolveTestPuzzleSelectionSeedFromLaunchConfig,
  resolveTestStandardTargetCorrectFromLaunchConfig
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

  it("accepts deterministic Android practice launch values only from the native test harness", () => {
    const productionGlobals = { __DEV__: false, __CHESSTICIZE_ENABLE_TEST_CONTROLS__: false };

    expect(
      resolveTestNowMsFromLaunchConfig(productionGlobals, {
        testControlsEnabled: true,
        testNowMs: "1780000000000"
      })
    ).toBe(1780000000000);
    expect(
      resolveTestPuzzleSelectionIdFromLaunchConfig(productionGlobals, {
        puzzleSelectionId: "  0CwCS  ",
        testControlsEnabled: true
      })
    ).toBe("0CwCS");
    expect(
      resolveTestPuzzleSelectionIdFromLaunchConfig(productionGlobals, {
        puzzleSelectionId: "0CwCS",
        testControlsEnabled: false
      })
    ).toBeUndefined();
    expect(
      resolveTestPuzzleSelectionSeedFromLaunchConfig(productionGlobals, {
        puzzleSelectionSeed: "android-standard-practice",
        testControlsEnabled: true
      })
    ).toBe("android-standard-practice");
    expect(
      resolveTestPuzzleSelectionSeedFromLaunchConfig(productionGlobals, {
        puzzleSelectionSeed: "android-standard-practice",
        testControlsEnabled: false
      })
    ).toBeUndefined();
    expect(
      resolveTestPuzzleSelectionSeedFromLaunchConfig(productionGlobals, {
        puzzleSelectionSeed: "   ",
        testControlsEnabled: true
      })
    ).toBeUndefined();
    expect(
      resolveTestArrowDuelTargetCorrectFromLaunchConfig(productionGlobals, {
        arrowDuelTargetCorrect: "1",
        testControlsEnabled: true
      })
    ).toBe(1);
    expect(
      resolveTestCustomTargetCorrectFromLaunchConfig(productionGlobals, {
        customTargetCorrect: "1",
        testControlsEnabled: true
      })
    ).toBe(1);
    expect(
      resolveTestArrowDuelTargetCorrectFromLaunchConfig(productionGlobals, {
        arrowDuelTargetCorrect: "0",
        testControlsEnabled: true
      })
    ).toBeUndefined();
    expect(
      resolveTestCustomTargetCorrectFromLaunchConfig(productionGlobals, {
        customTargetCorrect: "0",
        testControlsEnabled: true
      })
    ).toBeUndefined();
    expect(
      resolveTestArrowDuelTargetCorrectFromLaunchConfig(productionGlobals, {
        arrowDuelTargetCorrect: "1",
        testControlsEnabled: false
      })
    ).toBeUndefined();
    expect(
      resolveTestCustomTargetCorrectFromLaunchConfig(productionGlobals, {
        customTargetCorrect: "1",
        testControlsEnabled: false
      })
    ).toBeUndefined();
    expect(
      resolveTestStandardTargetCorrectFromLaunchConfig(productionGlobals, {
        standardTargetCorrect: "1",
        testControlsEnabled: true
      })
    ).toBe(1);
    expect(
      resolveTestStandardTargetCorrectFromLaunchConfig(productionGlobals, {
        standardTargetCorrect: "0",
        testControlsEnabled: true
      })
    ).toBeUndefined();
    expect(
      resolveTestStandardTargetCorrectFromLaunchConfig(productionGlobals, {
        standardTargetCorrect: "1",
        testControlsEnabled: false
      })
    ).toBeUndefined();
  });

  it("reads Android launch values on demand after the activity captures its intent", () => {
    const getLaunchConfig = jest.fn(() => ({
      puzzleSelectionId: "0CwCS",
      puzzleSelectionSeed: "android-standard-practice",
      arrowDuelTargetCorrect: "1",
      customTargetCorrect: "1",
      standardTargetCorrect: "1",
      testControlsEnabled: true,
      testNowMs: "1780000000000"
    }));
    const nativeModule = { getLaunchConfig };
    const productionGlobals = { __DEV__: false, __CHESSTICIZE_ENABLE_TEST_CONTROLS__: false };

    expect(resolveTestPuzzleSelectionIdFromLaunchConfig(productionGlobals, nativeModule)).toBe("0CwCS");
    expect(resolveTestPuzzleSelectionSeedFromLaunchConfig(productionGlobals, nativeModule))
      .toBe("android-standard-practice");
    expect(resolveTestArrowDuelTargetCorrectFromLaunchConfig(productionGlobals, nativeModule)).toBe(1);
    expect(resolveTestCustomTargetCorrectFromLaunchConfig(productionGlobals, nativeModule)).toBe(1);
    expect(resolveTestStandardTargetCorrectFromLaunchConfig(productionGlobals, nativeModule)).toBe(1);
    expect(resolveTestNowMsFromLaunchConfig(productionGlobals, nativeModule)).toBe(1780000000000);
    expect(getLaunchConfig).toHaveBeenCalledTimes(6);
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
