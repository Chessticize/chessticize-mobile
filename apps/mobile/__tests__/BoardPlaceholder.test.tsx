import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Chess } from "chess.js";
import { MemoryStore } from "../../../packages/storage/src/memory-store";
import { PracticeService } from "../../../packages/storage/src/practice-service";
import BoardPlaceholder from "../../mobile-lab/src/BoardPlaceholder";
import {
  clearLabPracticeService,
  setLabPracticeService
} from "../../mobile-lab/src/boardController";
import { ISSUE_272_LAB_PUZZLE } from "../../mobile-lab/src/labPuzzles";

jest.mock("react-native", () => {
  const native = jest.requireActual("../__mocks__/react-native.js");
  class AnimatedValue extends native.Animated.Value {
    interpolate(configuration: { outputRange: number[] }) {
      return configuration.outputRange[0];
    }
  }
  return {
    ...native,
    Animated: {
      ...native.Animated,
      Value: AnimatedValue,
      timing: jest.fn((value: { setValue: (next: number) => void }, configuration: { toValue: number }) => {
        return {
          start(callback?: (result: { finished: boolean }) => void) {
            value.setValue(configuration.toValue);
            callback?.({ finished: true });
          },
          stop() {}
        };
      })
    },
    Easing: {
      cubic(value: number) {
        return value;
      },
      inOut(easing: (value: number) => number) {
        return easing;
      }
    }
  };
});

describe("Interaction Lab board placeholder", () => {
  let service: PracticeService | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (service) {
      clearLabPracticeService(service);
      service = undefined;
    }
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("locks input before the blunder, unlocks after it, and replays the entry animation", async () => {
    const store = new MemoryStore();
    store.seedPuzzles([ISSUE_272_LAB_PUZZLE]);
    service = new PracticeService(store);
    setLabPracticeService(service, true, ISSUE_272_LAB_PUZZLE.id);

    const chess = new Chess(ISSUE_272_LAB_PUZZLE.initialFen);
    chess.move({ from: "e8", to: "d7" });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<BoardPlaceholder fen={chess.fen()} />);
    });

    expect(renderer.root.findByProps({ testID: "lab-board-placeholder" }).props.accessibilityLabel)
      .toContain("input locked");
    expect(renderer.root.findByProps({ testID: "lab-board-wrong" }).props.disabled).toBe(true);
    expect(renderer.root.findByProps({ testID: "lab-board-replay-blunder" }).props.disabled).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    expect(renderer.root.findByProps({ testID: "lab-board-placeholder" }).props.accessibilityLabel)
      .toContain("input ready");
    expect(renderer.root.findByProps({ testID: "lab-blunder-preview-complete" })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: "lab-blunder-last-move" })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: "lab-board-wrong" }).props.disabled).toBe(false);

    await act(async () => {
      renderer.root.findByProps({ testID: "lab-board-replay-blunder" }).props.onPress();
    });

    expect(renderer.root.findByProps({ testID: "lab-board-placeholder" }).props.accessibilityLabel)
      .toContain("input locked");
    expect(renderer.root.findByProps({ testID: "lab-board-replay-blunder" }).props.disabled).toBe(true);
    expect(renderer.root.findByProps({ testID: "lab-blunder-moving-piece" })).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    expect(renderer.root.findByProps({ testID: "lab-board-placeholder" }).props.accessibilityLabel)
      .toContain("input ready");
    expect(renderer.root.findByProps({ testID: "lab-board-replay-blunder" }).props.disabled).toBe(false);

    const timing = jest.requireMock("react-native").Animated.timing as jest.Mock;
    const completedAnimationCount = timing.mock.calls.length;
    await act(async () => {
      renderer.root.findByProps({ testID: "lab-board-replay-blunder" }).props.onPress();
    });
    await act(async () => {
      renderer.unmount();
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(timing).toHaveBeenCalledTimes(completedAnimationCount);
  });
});
