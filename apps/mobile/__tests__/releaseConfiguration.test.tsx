import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { createMobilePracticeService } from "../src/backend/mobilePractice";
import { PracticePocScreen } from "../src/components/PracticePocScreen";
import { createTestMobilePlatformCapabilities } from "../src/testing/testMobilePlatformCapabilities";

type TestGlobal = typeof globalThis & {
  __CHESSTICIZE_ENABLE_TEST_CONTROLS__?: boolean;
  __DEV__?: boolean;
};

const testGlobal = globalThis as TestGlobal;

function renderScreen(): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(
      <PracticePocScreen
        platformCapabilities={createTestMobilePlatformCapabilities({
          practiceServiceFactory: () => createMobilePracticeService("random1000")
        })}
      />
    );
  });
  if (!renderer) {
    throw new Error("renderer was not created");
  }
  return renderer;
}

function findAllByTestId(renderer: TestRenderer.ReactTestRenderer, testID: string): TestRenderer.ReactTestInstance[] {
  return renderer.root.findAll((node) => node.props.testID === testID);
}

function press(renderer: TestRenderer.ReactTestRenderer, testID: string): void {
  const node = findAllByTestId(renderer, testID).find((candidate) => typeof candidate.props.onPress === "function");
  if (!node) {
    throw new Error(`No pressable node found for ${testID}`);
  }
  act(() => {
    node.props.onPress();
  });
}

describe("release configuration integration", () => {
  const originalDev = testGlobal.__DEV__;
  const originalTestControls = testGlobal.__CHESSTICIZE_ENABLE_TEST_CONTROLS__;

  afterEach(() => {
    testGlobal.__DEV__ = originalDev;
    testGlobal.__CHESSTICIZE_ENABLE_TEST_CONTROLS__ = originalTestControls;
    jest.restoreAllMocks();
  });

  it("hides the puzzle source switch in a production-like render", () => {
    testGlobal.__DEV__ = false;
    testGlobal.__CHESSTICIZE_ENABLE_TEST_CONTROLS__ = false;

    const renderer = renderScreen();

    expect(findAllByTestId(renderer, "test-puzzle-source-control")).toEqual([]);

    press(renderer, "settings-tab");
    expect(findAllByTestId(renderer, "settings-stockfish-diagnostics")).toEqual([]);
    expect(findAllByTestId(renderer, "stockfish-diagnostics-panel")).toEqual([]);
  });

  it("exposes the puzzle source switch only for an explicit test harness", () => {
    testGlobal.__DEV__ = false;
    testGlobal.__CHESSTICIZE_ENABLE_TEST_CONTROLS__ = true;

    const renderer = renderScreen();

    expect(findAllByTestId(renderer, "test-puzzle-source-control").length).toBeGreaterThan(0);
  });

  it("does not suppress LogBox warnings when App loads under a release-like global", () => {
    testGlobal.__DEV__ = false;
    let ignoreAllLogsCalls = 0;

    jest.isolateModules(() => {
      const { LogBox } = require("react-native") as typeof import("react-native");
      const ignoreAllLogs = jest.spyOn(LogBox, "ignoreAllLogs");
      require("../App");
      ignoreAllLogsCalls = ignoreAllLogs.mock.calls.length;
    });

    expect(ignoreAllLogsCalls).toBe(0);
  });

  it("suppresses LogBox warnings when App loads under a development global", () => {
    testGlobal.__DEV__ = true;
    let ignoreAllLogsCalls = 0;

    jest.isolateModules(() => {
      const { LogBox } = require("react-native") as typeof import("react-native");
      const ignoreAllLogs = jest.spyOn(LogBox, "ignoreAllLogs");
      require("../App");
      ignoreAllLogsCalls = ignoreAllLogs.mock.calls.length;
    });

    expect(ignoreAllLogsCalls).toBe(1);
  });

});
