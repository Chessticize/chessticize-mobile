import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { PracticeViewportProvider } from "../src/components/PracticeViewport";
import { SprintResultScreen, type SprintResultScreenActions } from "../src/components/SprintResultScreen";
import {
  presentSprintResult,
  sprintResultDataFromSession,
  type SprintResultData
} from "../src/components/sprintResultPresentation";
import type { AttemptEvent, Puzzle, SessionReplayItem, SprintState } from "../../../packages/core/src/index";
import { flattenTestStyle } from "../test-support/testRendererSupport";

// Sprint Result (#609, approved spec in PR #650): every state and action of
// the full-screen result, rendered through its public props.

const noUnclear = { markedByYou: 0, afterSlow: 0, afterTimedOut: 0 };

function data(overrides: Partial<SprintResultData> = {}): SprintResultData {
  return {
    kind: "sprint",
    mode: "standard",
    outcome: "passed",
    endReason: "target_reached",
    solved: 15,
    target: 15,
    attempted: 17,
    accuracyPercent: 88,
    ratingBefore: 709,
    ratingAfter: 718,
    elapsedSeconds: 276,
    bestStreak: 8,
    mistakeCount: 2,
    review: { count: 3, unclear: { ...noUnclear, markedByYou: 1, afterSlow: 1 }, inReviewCount: 2, overlapCount: 1 },
    mistakeReplayCount: 2,
    ...overrides
  };
}

type Viewport = { width: number; height: number; fontScale?: number; insets?: { top: number; right: number; bottom: number; left: number } };
const PHONE: Viewport = { width: 402, height: 874, insets: { top: 62, right: 0, bottom: 34, left: 0 } };

function renderResult(
  resultData: SprintResultData,
  viewport: Viewport = PHONE
): { renderer: TestRenderer.ReactTestRenderer; actions: Record<keyof SprintResultScreenActions, jest.Mock> } {
  const actions = {
    onBack: jest.fn(),
    onMarkUnclear: jest.fn(),
    onOpenHistory: jest.fn(),
    onPlayAgain: jest.fn(),
    onReplay: jest.fn(),
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
          <SprintResultScreen data={resultData} {...actions} />
        </PracticeViewportProvider>
      </SafeAreaInsetsContext.Provider>
    );
  });
  return { renderer: renderer!, actions };
}

function byId(renderer: TestRenderer.ReactTestRenderer, testID: string): TestRenderer.ReactTestInstance {
  return renderer.root.findByProps({ testID });
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

describe("Sprint Result screen", () => {
  it("shows a passed Sprint as a full-screen hero, stats card, review row and actions", () => {
    const { renderer, actions } = renderResult(data());

    expect(collect(byId(renderer, "sprint-result-title"))).toBe("Sprint Result");
    expect(byId(renderer, "sprint-result-outcome").props.accessibilityLabel).toBe("Sprint passed");
    expect(has(renderer, "sprint-result-reason")).toBe(false);
    expect(collect(byId(renderer, "sprint-result-solved"))).toBe("15 / 15");
    expect(byId(renderer, "sprint-result-solved").props.accessibilityLabel).toBe("Solved 15 of 15 to pass");
    expect(collect(byId(renderer, "sprint-result-accuracy"))).toBe("17 attempted · 88% accuracy");
    expect(collect(byId(renderer, "sprint-result-rating-change"))).toBe("Rating+9709 → 718");
    expect(collect(byId(renderer, "sprint-result-time"))).toBe("Time4:36");
    expect(collect(byId(renderer, "sprint-result-best-streak"))).toBe("Best streak8");
    expect(collect(byId(renderer, "sprint-result-review-count"))).toBe("3 to review");
    expect(collect(byId(renderer, "review-mistakes-button"))).toBe("Replay 2 mistakes");
    expect(collect(byId(renderer, "play-again-button"))).toBe("Play again");

    press(renderer, "back-practice-button");
    press(renderer, "sprint-result-history-button");
    press(renderer, "sprint-result-replay");
    press(renderer, "review-mistakes-button");
    press(renderer, "play-again-button");
    expect(actions.onBack).toHaveBeenCalledTimes(1);
    expect(actions.onOpenHistory).toHaveBeenCalledTimes(1);
    expect(actions.onReplay).toHaveBeenCalledTimes(1);
    expect(actions.onReplayMistakes).toHaveBeenCalledTimes(1);
    expect(actions.onPlayAgain).toHaveBeenCalledTimes(1);
  });

  it("opens and closes the review explanation from the info button without replaying", () => {
    const { renderer, actions } = renderResult(data());

    expect(has(renderer, "sprint-result-review-note")).toBe(false);
    expect(byId(renderer, "sprint-result-review-info").props.accessibilityState).toEqual({ expanded: false });
    press(renderer, "sprint-result-review-info");
    expect(collect(byId(renderer, "sprint-result-review-note"))).toBe(
      "3 puzzles to look at again: 2 Unclear and 2 In Review (1 is both)."
      + "Unclear: 1 marked by you, 1 marked after Slow. Unclear does not change your Sprint result."
      + "Replaying them does not change when they come back in Review."
    );
    expect(byId(renderer, "sprint-result-review-info").props.accessibilityState).toEqual({ expanded: true });
    press(renderer, "sprint-result-review-info");
    expect(has(renderer, "sprint-result-review-note")).toBe(false);
    expect(actions.onReplay).not.toHaveBeenCalled();
  });

  it("tones failed, abandoned and passed outcomes and names the failure reason", () => {
    const mistakes = renderResult(data({
      outcome: "failed",
      endReason: "max_mistakes",
      mistakeCount: 3,
      ratingAfter: 691
    })).renderer;
    expect(collect(byId(mistakes, "sprint-result-headline"))).toBe("Sprint failed");
    expect(collect(byId(mistakes, "sprint-result-reason"))).toBe("3 mistakes");
    expect(collect(byId(mistakes, "sprint-result-rating-change"))).toContain("−18");

    const time = renderResult(data({ outcome: "failed", endReason: "time_expired" })).renderer;
    expect(byId(time, "sprint-result-outcome").props.accessibilityLabel).toBe("Sprint failed · Time ran out");

    // Running out of puzzles is neither a pass nor a fail: a neutral "ended".
    const exhausted = renderResult(data({ outcome: "ended", endReason: "puzzles_exhausted" })).renderer;
    expect(byId(exhausted, "sprint-result-outcome").props.accessibilityLabel).toBe("Sprint ended · No more puzzles");
    expect(collect(byId(exhausted, "sprint-result-reason"))).toBe("No more puzzles");
    expect(presentSprintResult(data({ outcome: "ended", endReason: "puzzles_exhausted" })).outcomeTone).toBe("neutral");

    const abandoned = renderResult(data({
      outcome: "abandoned",
      endReason: "abandoned",
      review: { count: 0, unclear: noUnclear, inReviewCount: 0, overlapCount: 0 },
      mistakeReplayCount: 0
    })).renderer;
    expect(byId(abandoned, "sprint-result-outcome").props.accessibilityLabel).toBe("Sprint abandoned");

    const arrowDuel = renderResult(data({ mode: "arrowDuel" })).renderer;
    expect(byId(arrowDuel, "sprint-result-outcome").props.accessibilityLabel).toBe("Arrow Duel passed");

    expect(presentSprintResult(data()).outcomeTone).toBe("positive");
    expect(presentSprintResult(data({ outcome: "failed", endReason: "max_mistakes" })).outcomeTone).toBe("negative");
    expect(presentSprintResult(data({ outcome: "abandoned", endReason: "abandoned" })).outcomeTone).toBe("neutral");
  });

  it("hides the review section and Replay mistakes when there is nothing to review", () => {
    const { renderer } = renderResult(data({
      review: { count: 0, unclear: noUnclear, inReviewCount: 0, overlapCount: 0 },
      mistakeReplayCount: 0,
      mistakeCount: 0
    }));

    expect(has(renderer, "sprint-result-review")).toBe(false);
    expect(has(renderer, "review-mistakes-button")).toBe(false);
    expect(has(renderer, "play-again-button")).toBe(true);
  });

  it("asks about the final puzzle and shows Marked once it is marked", () => {
    const prompt = { question: "Was the final puzzle unclear?", marked: false };
    const unmarked = renderResult(data({ unclearPrompt: prompt }));
    expect(collect(byId(unmarked.renderer, "sprint-unclear-question"))).toBe("Was the final puzzle unclear?");
    press(unmarked.renderer, "sprint-unclear-toggle");
    expect(unmarked.actions.onMarkUnclear).toHaveBeenCalledTimes(1);

    const marked = renderResult(data({ unclearPrompt: { ...prompt, marked: true } })).renderer;
    expect(collect(byId(marked, "sprint-unclear-marked"))).toBe("Marked");
    expect(has(marked, "sprint-unclear-toggle")).toBe(false);
  });

  it("shows a Focused Run as unrated, with pace and Back to Practice and no trend action", () => {
    const { renderer, actions } = renderResult(data({
      kind: "focusedRun",
      outcome: "completed",
      endReason: "attempt_limit",
      solved: 12,
      target: 15,
      pace: { averageSolveSeconds: 17.4, usualSolveSeconds: 24 },
      ratingAfter: undefined
    } as Partial<SprintResultData>));

    expect(collect(byId(renderer, "sprint-result-title"))).toBe("Focused Run Result");
    expect(byId(renderer, "sprint-result-outcome").props.accessibilityLabel).toBe("Focused Run complete");
    expect(byId(renderer, "sprint-result-solved").props.accessibilityLabel).toBe("Solved 12 of 15 planned puzzles");
    expect(collect(byId(renderer, "sprint-result-rating-change"))).toBe("RatingUnrated709 unchanged");
    expect(collect(byId(renderer, "sprint-result-average-solve"))).toBe("Avg solve17sUsually 24s");
    expect(byId(renderer, "sprint-result-average-solve").props.accessibilityLabel).toBe(
      "Average solve 17 seconds, usually 24 seconds on these themes"
    );
    expect(has(renderer, "sprint-result-best-streak")).toBe(false);
    expect(has(renderer, "sprint-result-history-button")).toBe(false);
    expect(collect(byId(renderer, "play-again-button"))).toBe("Back to Practice");
    press(renderer, "play-again-button");
    expect(actions.onPlayAgain).toHaveBeenCalledTimes(1);
  });

  it("adapts its layout to phone landscape, iPad, narrow phones and the largest text size", () => {
    const portrait = renderResult(data()).renderer;
    expect(has(portrait, "sprint-result-split")).toBe(false);

    const landscape = renderResult(data(), {
      width: 874,
      height: 402,
      insets: { top: 0, right: 62, bottom: 21, left: 62 }
    }).renderer;
    expect(has(landscape, "sprint-result-split")).toBe(true);

    const ipad = renderResult(data(), { width: 1180, height: 820, insets: { top: 0, right: 0, bottom: 20, left: 0 } }).renderer;
    expect(has(ipad, "sprint-result-split")).toBe(false);
    // Three columns on a phone and iPad.
    expect(flattenTestStyle(byId(portrait, "sprint-result-time").props.style)).toMatchObject({ flex: 1 });
    expect(flattenTestStyle(byId(ipad, "sprint-result-time").props.style)).toMatchObject({ flex: 1 });

    // A 320 pt phone cannot hold three columns: the stats become label/value rows.
    const narrow = renderResult(data(), { width: 320, height: 693, insets: { top: 47, right: 0, bottom: 34, left: 0 } }).renderer;
    expect(flattenTestStyle(byId(narrow, "sprint-result-time").props.style)).toMatchObject({ flexDirection: "row" });

    const largest = renderResult(data(), { ...PHONE, fontScale: 3.571 }).renderer;
    // Largest text: no split, stats read label over value, rows stack, and the
    // hero numeral and nav title cap their growth at 1.5x.
    const largestTime = flattenTestStyle(byId(largest, "sprint-result-time").props.style);
    expect(largestTime.flexDirection).toBeUndefined();
    expect(largestTime.flex).toBeUndefined();
    expect(byId(largest, "sprint-result-outcome").findAllByProps({ testID: "sprint-result-status-glyph" }).length).toBeGreaterThan(0);
    expect(byId(largest, "sprint-result-solved").props.maxFontSizeMultiplier).toBe(1.5);
    expect(byId(largest, "sprint-result-title").props.maxFontSizeMultiplier).toBe(1.5);
    // The info target grows with the text (44 pt at most 1.5x).
    expect(flattenTestStyle(byId(largest, "sprint-result-review-info").props.style({ pressed: false })).width).toBe(66);
  });
});

describe("Sprint Result view data", () => {
  const puzzle: Puzzle = {
    id: "p1",
    initialFen: "8/8/8/8/8/8/8/8 w - - 0 1",
    solutionMoves: ["a1a2"],
    rating: 900,
    themes: [],
    source: "synthetic"
  };
  const attempt = (id: string, result: AttemptEvent["result"], unclear = false): AttemptEvent => ({
    id,
    source: "sprint",
    sessionId: "s1",
    puzzleId: "p1",
    mode: "standard",
    ratingKey: "standard 5/20",
    result,
    submittedMove: "a1a2",
    expectedMove: "a1a2",
    startedAt: "2026-07-18T12:00:00.000Z",
    completedAt: "2026-07-18T12:00:05.000Z",
    ratingBefore: 900,
    ...(unclear ? { unclear: true } : {})
  });

  function state(overrides: Partial<SprintState>): SprintState {
    return {
      id: "s1",
      status: "failed",
      endReason: "max_mistakes",
      correctCount: 9,
      mistakeCount: 3,
      bestStreak: 5,
      ratingBefore: 709,
      ratingAfter: 691,
      config: {
        mode: "standard",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        targetCorrect: 15,
        maxMistakes: 3,
        ratingKey: "standard 5/20"
      },
      ...overrides
    } as SprintState;
  }

  it("counts the Replay union once and the mistakes within it from the session", () => {
    const replayItems: SessionReplayItem[] = [
      { puzzle, attempt: attempt("wrong", "wrong"), inReview: true },
      { puzzle, attempt: attempt("timed-out", "timed_out"), inReview: true },
      { puzzle, attempt: attempt("unclear-and-in-review", "correct", true), inReview: true }
    ];
    const result = sprintResultDataFromSession({
      state: state({}),
      elapsedMs: 177_900,
      replayItems,
      resultSummary: {
        accuracyPercent: 75,
        attemptCount: 12,
        unclear: { slowMarkedCount: 1, timedOutMarkedCount: 1, userMarkedCount: 0 },
        review: { addedCount: 3, mistakeCount: 3, timedOutCount: 1 }
      }
    });

    expect(result).toMatchObject({
      kind: "sprint",
      outcome: "failed",
      solved: 9,
      target: 15,
      attempted: 12,
      accuracyPercent: 75,
      elapsedSeconds: 177,
      mistakeReplayCount: 2,
      review: { count: 3, inReviewCount: 3, overlapCount: 1 }
    });
    expect(presentSprintResult(result).replayMistakesLabel).toBe("Replay 2 mistakes");
  });

  it("maps a Focused Run to an unrated result against its planned puzzles", () => {
    const result = sprintResultDataFromSession({
      state: state({
        status: "won",
        endReason: "attempt_limit",
        correctCount: 12,
        config: {
          mode: "standard",
          durationSeconds: 300,
          perPuzzleSeconds: 20,
          targetCorrect: 15,
          maxAttempts: 15,
          maxMistakes: 3,
          ratingKey: "standard 5/20",
          tacticalFocus: { themes: ["fork"] }
        } as SprintState["config"]
      }),
      elapsedMs: 432_000,
      replayItems: [],
      averageSolveSeconds: 17
    });

    expect(result.kind).toBe("focusedRun");
    expect(result.outcome).toBe("completed");
    expect(result.ratingAfter).toBeUndefined();
    expect(result.pace).toEqual({ averageSolveSeconds: 17 });
    expect(presentSprintResult(result).stats.map((column) => column.value)).toEqual(["Unrated", "7:12", "17s"]);
  });

  it("marks an abandoned Sprint neutral even when it had submitted moves", () => {
    const result = sprintResultDataFromSession({
      state: state({ status: "failed", endReason: "abandoned", correctCount: 1, mistakeCount: 0 }),
      elapsedMs: 48_000,
      replayItems: []
    });

    expect(presentSprintResult(result).outcomeLabel).toBe("Sprint abandoned");
    expect(presentSprintResult(result).review).toBeNull();
  });
});
