const { resolveTestNowMsFromLaunchConfig } = require("../src/backend/testLaunchConfig");

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

  it("rejects invalid native test clock values", () => {
    expect(resolveTestNowMsFromLaunchConfig({ __DEV__: true }, { testNowMs: "not-a-time" })).toBeUndefined();
    expect(resolveTestNowMsFromLaunchConfig({ __DEV__: true }, { testNowMs: "-1" })).toBeUndefined();
  });
});
