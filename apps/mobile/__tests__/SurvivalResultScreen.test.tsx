import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { PracticeViewportProvider } from "../src/components/PracticeViewport";
import { SurvivalResultScreen } from "../src/components/SurvivalResultScreen";
import {
  formatActiveTime,
  presentSurvivalResult,
  survivalResultDataFromSession,
  type SurvivalResultData
} from "../src/components/survivalResultPresentation";
import { lightTheme } from "../src/theme";
import type { SprintState } from "../../../packages/core/src/index";
import { flattenTestStyle } from "../test-support/testRendererSupport";

// Survival result (#609, direction A): the Sprint Result's sibling, rendered
// through its public props. A Survival Run ends only after the third mistake
// or a pool clear; storage refuses to abandon one, so there is no abandoned
// result to show.

function data(overrides: Partial<SurvivalResultData> = {}): SurvivalResultData {
  return {
    challengeType: "puzzle",
    level: { minRating: 900, maxRating: 999 },
    endReason: "max_mistakes",
    score: 19,
    mistakeCount: 3,
    bestStreak: 9,
    activeElapsedMs: (12 * 60 + 48) * 1000,
    sittings: 3,
    isNewBest: true,
    previousBestScore: 18,
    ...overrides
  };
}

type Viewport = { width: number; height: number; fontScale?: number; insets?: { top: number; right: number; bottom: number; left: number } };
const PHONE: Viewport = { width: 402, height: 874, insets: { top: 62, right: 0, bottom: 34, left: 0 } };

type Actions = {
  onBack: jest.Mock;
  onDone: jest.Mock;
  onPlayAgain: jest.Mock;
  onReplayMistakes: jest.Mock;
};

function renderResult(
  resultData: SurvivalResultData,
  viewport: Viewport = PHONE,
  { replay = true }: { replay?: boolean } = {}
): { renderer: TestRenderer.ReactTestRenderer; actions: Actions } {
  const actions: Actions = {
    onBack: jest.fn(),
    onDone: jest.fn(),
    onPlayAgain: jest.fn(),
    onReplayMistakes: jest.fn()
  };
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(
      <SafeAreaInsetsContext.Provider value={viewport.insets ?? { top: 0, right: 0, bottom: 0, left: 0 }}>
        <PracticeViewportProvider
          value={{
            width: viewport.width,
            height: viewport.height,
            ...(viewport.fontScale === undefined ? {} : { fontScale: viewport.fontScale })
          }}
        >
          <SurvivalResultScreen
            data={resultData}
            onBack={actions.onBack}
            onDone={actions.onDone}
            onPlayAgain={actions.onPlayAgain}
            onReplayMistakes={replay ? actions.onReplayMistakes : undefined}
          />
        </PracticeViewportProvider>
      </SafeAreaInsetsContext.Provider>
    );
  });
  return { renderer: renderer!, actions };
}

function byId(renderer: TestRenderer.ReactTestRenderer, testID: string): TestRenderer.ReactTestInstance {
  return renderer.root.findByProps({ testID });
}

/** The native view carrying the test ID, below any component that forwards it. */
function hostById(renderer: TestRenderer.ReactTestRenderer, testID: string): TestRenderer.ReactTestInstance {
  const [host] = renderer.root.findAll((node) => node.props.testID === testID && typeof node.type === "string");
  if (!host) {
    throw new Error(`No host view with testID ${testID}`);
  }
  return host;
}

function has(renderer: TestRenderer.ReactTestRenderer, testID: string): boolean {
  return renderer.root.findAllByProps({ testID }).length > 0;
}

function collect(node: TestRenderer.ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : collect(child))).join("");
}

function press(renderer: TestRenderer.ReactTestRenderer, testID: string): void {
  act(() => {
    byId(renderer, testID).props.onPress();
  });
}

describe("Survival result screen", () => {
  it("celebrates a new best ended by the third mistake in product blue with the trophy", () => {
    const { renderer, actions } = renderResult(data());

    expect(collect(byId(renderer, "personal-best-result-title"))).toBe("Puzzle Result");
    expect(byId(renderer, "personal-best-result-outcome").props.accessibilityLabel).toBe("New best at 900–999");
    expect(has(renderer, "personal-best-result-trophy")).toBe(true);
    expect(flattenTestStyle(hostById(renderer, "personal-best-result-badge").props.style))
      .toMatchObject({ backgroundColor: lightTheme.colors.accent.s100 });
    expect(collect(byId(renderer, "personal-best-result-score"))).toBe("19");
    expect(byId(renderer, "personal-best-result-score").props.accessibilityLabel).toBe("19 solved");
    expect(flattenTestStyle(hostById(renderer, "personal-best-result-score").props.style))
      .toMatchObject({ color: lightTheme.colors.accent.s600 });
    expect(collect(byId(renderer, "personal-best-result-comparison"))).toBe("Previous best 18");
    expect(flattenTestStyle(hostById(renderer, "personal-best-result-comparison").props.style))
      .toMatchObject({ color: lightTheme.colors.accent.s600 });
    // Like the in-Run milestone, the bar gives way once the best is passed.
    expect(has(renderer, "personal-best-result-progress")).toBe(false);
    expect(collect(byId(renderer, "personal-best-result-summary"))).toBe("19 solved · 12:48 active · 3 sittings");
    expect(collect(byId(renderer, "personal-best-result-end-reason"))).toBe("The Run ended normally after 3 mistakes.");
    expect(collect(byId(renderer, "personal-best-result-accuracy"))).toBe("Accuracy86%");
    expect(collect(byId(renderer, "personal-best-result-active-time"))).toBe("Active time12:48");
    expect(collect(byId(renderer, "personal-best-result-best-streak"))).toBe("Best streak9");
    expect(byId(renderer, "personal-best-result-active-time").props.accessibilityLabel)
      .toBe("Active time 12 minutes 48 seconds");
    expect(collect(byId(renderer, "personal-best-result-level"))).toBe("Puzzle · 900–999This level keeps its own best");
    expect(collect(byId(renderer, "personal-best-result-review-detail"))).toBe("3 mistakes · Included in replay");
    expect(collect(byId(renderer, "personal-best-result-review-count"))).toBe("3");
    expect(flattenTestStyle(hostById(renderer, "personal-best-result-review-count").props.style))
      .toMatchObject({ color: lightTheme.colors.danger.s600 });

    press(renderer, "personal-best-result-back");
    press(renderer, "personal-best-result-replay");
    press(renderer, "personal-best-result-try-again");
    press(renderer, "personal-best-result-done");
    expect(actions.onBack).toHaveBeenCalledTimes(1);
    expect(actions.onReplayMistakes).toHaveBeenCalledTimes(1);
    expect(actions.onPlayAgain).toHaveBeenCalledTimes(1);
    expect(actions.onDone).toHaveBeenCalledTimes(1);
  });

  it("orders the actions like the Sprint Result: Replay mistakes, the primary Play again, then Done", () => {
    const { renderer } = renderResult(data());
    const buttons = byId(renderer, "personal-best-result-actions")
      .findAll((node) => node.props.accessibilityRole === "button" && typeof node.props.testID === "string")
      .map((node) => node.props.testID as string)
      .filter((testID, index, all) => all.indexOf(testID) === index);

    expect(buttons).toEqual([
      "personal-best-result-replay",
      "personal-best-result-try-again",
      "personal-best-result-done"
    ]);
    expect(byId(renderer, "personal-best-result-try-again").props.accessibilityLabel)
      .toBe("Play the same Survival Run again");
    expect(byId(renderer, "personal-best-result-back").props.accessibilityLabel).toBe("Back to Practice");
  });

  it("keeps a Run that misses the best neutral and shows the way to the best", () => {
    const { renderer } = renderResult(data({ score: 6, previousBestScore: 8, isNewBest: false, sittings: 1, activeElapsedMs: 94_000 }));

    expect(byId(renderer, "personal-best-result-outcome").props.accessibilityLabel).toBe("Run complete");
    expect(has(renderer, "personal-best-result-trophy")).toBe(false);
    expect(flattenTestStyle(hostById(renderer, "personal-best-result-badge").props.style))
      .toMatchObject({ backgroundColor: lightTheme.colors.surfaceStrong });
    expect(flattenTestStyle(hostById(renderer, "personal-best-result-score").props.style))
      .toMatchObject({ color: lightTheme.colors.text.primary });
    expect(flattenTestStyle(hostById(renderer, "personal-best-result-comparison").props.style))
      .toMatchObject({ color: lightTheme.colors.text.tertiary });
    expect(collect(byId(renderer, "personal-best-result-comparison"))).toBe("2 short of best 8");
    expect(has(renderer, "personal-best-result-progress")).toBe(true);
    expect(collect(byId(renderer, "personal-best-result-summary"))).toBe("6 solved · 1:34 active · 1 sitting");
  });

  it("names a first score at a level without a bar toward a best", () => {
    const { renderer } = renderResult(data({ score: 4, previousBestScore: null, isNewBest: true }));

    expect(collect(byId(renderer, "personal-best-result-comparison"))).toBe("First score at this level");
    expect(has(renderer, "personal-best-result-progress")).toBe(false);
    expect(has(renderer, "personal-best-result-trophy")).toBe(true);
  });

  it("presents a pool clear as a Perfect clear, never as a third-mistake ending", () => {
    const { renderer } = renderResult(data({
      challengeType: "arrow_duel",
      level: { minRating: 2100, maxRating: 2200 },
      endReason: "pool_cleared",
      score: 88_894,
      mistakeCount: 1,
      activeElapsedMs: (51 * 3600 + 12 * 60) * 1000,
      sittings: 84,
      previousBestScore: 88_000
    }));

    expect(collect(byId(renderer, "personal-best-result-title"))).toBe("Arrow Duel Result");
    expect(byId(renderer, "personal-best-result-outcome").props.accessibilityLabel).toBe("Perfect clear at 2100–2200");
    expect(collect(byId(renderer, "personal-best-result-score"))).toBe("88,894");
    expect(collect(byId(renderer, "personal-best-result-summary"))).toBe("All 88,894 solved · 51:12:00 active · 84 sittings");
    expect(collect(byId(renderer, "personal-best-result-end-reason"))).toBe(
      "You cleared every available Arrow Duel in this level."
      + "Loading and selection errors never count as a clear."
    );
    expect(collect(byId(renderer, "personal-best-result"))).not.toContain("ended normally");
    expect(collect(byId(renderer, "personal-best-result-review-detail"))).toBe("1 mistake · Included in replay");
    expect(collect(byId(renderer, "personal-best-result-replay"))).toBe("Replay 1 mistake");
  });

  it("hides the In Review row and Replay when the Run left nothing to replay", () => {
    const { renderer } = renderResult(
      data({ endReason: "pool_cleared", mistakeCount: 0, score: 120 }),
      PHONE,
      { replay: false }
    );

    expect(has(renderer, "personal-best-result-review")).toBe(false);
    expect(has(renderer, "personal-best-result-replay")).toBe(false);
    expect(has(renderer, "personal-best-result-level")).toBe(true);
    expect(has(renderer, "personal-best-result-try-again")).toBe(true);
  });

  it("adapts its layout to phone landscape, iPad, narrow phones and the largest text size", () => {
    const portrait = renderResult(data()).renderer;
    expect(has(portrait, "personal-best-result-split")).toBe(false);
    expect(flattenTestStyle(byId(portrait, "personal-best-result-active-time").props.style)).toMatchObject({ flex: 1 });

    const landscape = renderResult(data(), {
      width: 874,
      height: 402,
      insets: { top: 0, right: 62, bottom: 21, left: 62 }
    }).renderer;
    expect(has(landscape, "personal-best-result-split")).toBe(true);

    const ipad = renderResult(data(), { width: 1180, height: 820, insets: { top: 0, right: 0, bottom: 20, left: 0 } }).renderer;
    expect(has(ipad, "personal-best-result-split")).toBe(false);

    const narrow = renderResult(data(), { width: 320, height: 693, insets: { top: 47, right: 0, bottom: 34, left: 0 } }).renderer;
    expect(flattenTestStyle(byId(narrow, "personal-best-result-active-time").props.style)).toMatchObject({ flexDirection: "row" });

    const largest = renderResult(data(), { ...PHONE, fontScale: 3.571 }).renderer;
    expect(has(largest, "personal-best-result-split")).toBe(false);
    expect(flattenTestStyle(byId(largest, "personal-best-result-active-time").props.style).flexDirection).toBeUndefined();
    expect(byId(largest, "personal-best-result-score").props.maxFontSizeMultiplier).toBe(1.5);
    expect(byId(largest, "personal-best-result-title").props.maxFontSizeMultiplier).toBe(1.5);
    // The In Review count moves under its copy instead of squeezing it.
    expect(flattenTestStyle(hostById(largest, "personal-best-result-review").props.style))
      .toMatchObject({ flexDirection: "column" });
  });
});

describe("Survival result view data", () => {
  it("maps a finished Survival session and its stored result", () => {
    const state = {
      bestStreak: 9,
      correctCount: 19,
      mistakeCount: 3
    } as SprintState;

    expect(survivalResultDataFromSession({
      state,
      challengeType: "puzzle",
      level: { minRating: 900, maxRating: 999 },
      result: { activeElapsedMs: 768_000, isNewBest: true, previousBestScore: 18, sittings: 3 }
    })).toEqual(data({ activeElapsedMs: 768_000 }));
  });

  it("spells out long active times and rounds accuracy", () => {
    expect(formatActiveTime(59_999)).toBe("0:59");
    expect(formatActiveTime(3_600_000)).toBe("1:00:00");
    const result = presentSurvivalResult(data({ score: 2, mistakeCount: 1, activeElapsedMs: 3_661_000 }));
    expect(result.stats.map((stat) => stat.value)).toEqual(["67%", "1:01:01", "9"]);
    expect(result.stats[1]?.accessibilityLabel).toBe("Active time 1 hour 1 minute 1 second");
  });
});
