import React from "react";
import { Chess } from "chess.js";
import androidPracticeFixture from "../../../fixtures/puzzles/android-standard-practice.fixture.json";
import { AppState } from "react-native";
import * as ReactNative from "react-native";
import * as SafeAreaContext from "react-native-safe-area-context";
import TestRenderer, { act } from "react-test-renderer";
import { PracticePocScreen, type PracticeDebugTraceEvent } from "../src/components/PracticePocScreen";
import {
  createMobilePracticeService,
  configureMobilePracticePuzzleSource,
  getBundledCorePackManifest,
  seededPuzzleCount,
  seededUniquePositionCount
} from "../src/backend/mobilePractice";
import { fixtureNeedsAtLeast, PracticeService } from "../../../packages/storage/src/practice-service";
import { MemoryStore } from "../../../packages/storage/src/memory-store";
import { defaultSprintConfig, formatLocalCalendarDate, formatReviewDay, type ArrowDuelState, type AttemptEvent, type Puzzle, type SprintState, type UciEngineTransport } from "../../../packages/core/src/index";
import { FakeReviewReminderNotificationClient, FakeReviewReminderScheduler } from "../src/backend/reviewReminderScheduler";
import { FakeICloudProgressSyncClient } from "../src/backend/iCloudProgressSync";
import type { MobilePlatformCapabilities } from "../src/backend/mobilePlatformCapabilities";
import type { MobileSystemBackSource } from "../src/navigation/mobileSystemBack";
import {
  createTestMobilePlatformCapabilities,
  type TestMobilePlatformCapabilityOverrides
} from "../src/testing/testMobilePlatformCapabilities";
import { FailingAttemptStore } from "../test-support/FailingAttemptStore";
import { FailingReviewScheduleStore } from "../test-support/FailingReviewScheduleStore";
import {
  expectNoRenderedTextHasNonPositiveFontSize,
  flattenTestStyle
} from "../test-support/testRendererSupport";

const renderers: TestRenderer.ReactTestRenderer[] = [];

type RenderedBackExecutorCase = {
  afterTestID: string;
  arrange: (renderer: TestRenderer.ReactTestRenderer) => void;
  beforeTestID: string;
  createOptions?: () => RenderScreenOptions;
  name: string;
};

const renderedBackExecutorCases: RenderedBackExecutorCase[] = [
  {
    name: "Review-filter dismissal",
    arrange: (renderer) => {
      press(renderer, "review-tab");
      press(renderer, "review-filter-toggle");
    },
    beforeTestID: "review-queue-filters",
    afterTestID: "review-panel"
  },
  {
    name: "Settings advanced-rating dismissal",
    arrange: (renderer) => {
      press(renderer, "settings-tab");
      press(renderer, "settings-standard-elo-row");
    },
    beforeTestID: "settings-advanced-ratings-panel",
    afterTestID: "settings-panel"
  },
  {
    name: "Custom rating-editor dismissal",
    createOptions: () => ({ practiceService: createPlayedCustomService() }),
    arrange: (renderer) => {
      press(renderer, "practice-mode-custom");
      press(renderer, "custom-initial-rating-row");
    },
    beforeTestID: "custom-initial-rating-editor",
    afterTestID: "custom-sprint-setup"
  },
  {
    name: "Custom setup return",
    arrange: (renderer) => {
      press(renderer, "practice-mode-custom");
    },
    beforeTestID: "custom-sprint-setup",
    afterTestID: "practice-home"
  },
  {
    name: "Stockfish diagnostics return",
    arrange: (renderer) => {
      press(renderer, "settings-tab");
      press(renderer, "settings-stockfish-diagnostics");
    },
    beforeTestID: "stockfish-diagnostics-panel",
    afterTestID: "settings-panel"
  }
];

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  for (const renderer of renderers.splice(0)) {
    act(() => {
      renderer.unmount();
    });
  }
  (AppState as unknown as { __reset?: () => void }).__reset?.();
  (ReactNative as unknown as { __resetWindowDimensions?: () => void }).__resetWindowDimensions?.();
  (SafeAreaContext as unknown as { __resetSafeAreaInsets?: () => void }).__resetSafeAreaInsets?.();
  jest.useRealTimers();
});

describe("PracticePocScreen", () => {
  it("unwinds Android system Back through the visible product state without trapping the root", () => {
    const systemBack = createTestSystemBackSource("android");
    const renderer = renderScreen({ systemBack });

    press(renderer, "history-tab");
    press(renderer, "history-filter-toggle");
    expect(findByTestId(renderer, "history-advanced-filters")).toBeTruthy();

    expect(systemBack.invoke()).toBe(true);
    expect(() => findByTestId(renderer, "history-advanced-filters")).toThrow();
    expect(findByTestId(renderer, "history-panel")).toBeTruthy();

    expect(systemBack.invoke()).toBe(true);
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();

    expect(systemBack.invoke()).toBe(false);
  });

  it.each(renderedBackExecutorCases)("executes $name through rendered public behavior", ({
    afterTestID,
    arrange,
    beforeTestID,
    createOptions
  }) => {
    const systemBack = createTestSystemBackSource("android");
    const renderer = renderScreen({ ...(createOptions?.() ?? {}), systemBack });

    arrange(renderer);
    expect(findByTestId(renderer, beforeTestID)).toBeTruthy();

    expect(systemBack.invoke()).toBe(true);
    expect(findByTestId(renderer, afterTestID)).toBeTruthy();
    if (beforeTestID !== afterTestID) {
      expect(() => findByTestId(renderer, beforeTestID)).toThrow();
    }
  });

  it("guards an active sprint and lets Back cancel the exit without losing progress", () => {
    const systemBack = createTestSystemBackSource("android");
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service, systemBack });

    startStandardSprint(renderer);
    const activeSprintId = activeSprintForTest(service).id;

    expect(systemBack.invoke()).toBe(true);
    expect(findByTestId(renderer, "session-abandon-confirmation")).toBeTruthy();
    expect(service.getActiveSprint()?.id).toBe(activeSprintId);

    expect(systemBack.invoke()).toBe(true);
    expect(() => findByTestId(renderer, "session-abandon-confirmation")).toThrow();
    expect(service.getActiveSprint()?.id).toBe(activeSprintId);

    expect(systemBack.invoke()).toBe(true);
    press(renderer, "session-abandon-confirm");
    expect(service.getActiveSprint()).toBeUndefined();
  });

  it("keeps the active-sprint exit destination valid when the deadline expires during Predictive Back", () => {
    const systemBack = createTestSystemBackSource("android");
    const service = createMobilePracticeService("random1000");
    const renderer = renderScreen({ practiceService: service, systemBack });

    startStandardSprint(renderer);
    act(() => {
      jest.advanceTimersByTime(299_750);
    });
    systemBack.startPredictive("left");
    systemBack.progressPredictive(0.6, "left");

    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(collectText(findByTestId(renderer, "mobile-back-destination-preview-label")))
      .toBe("Leave sprint confirmation");
    expect(service.getActiveSprint()?.status).toBe("active");

    expect(systemBack.commitPredictive()).toBe(true);
    expect(findByTestId(renderer, "session-abandon-confirmation")).toBeTruthy();
    expect(service.getActiveSprint()?.status).toBe("active");
  });

  it("settles an expired active sprint after its predictive gesture is cancelled", () => {
    const systemBack = createTestSystemBackSource("android");
    const service = createMobilePracticeService("random1000");
    const renderer = renderScreen({ practiceService: service, systemBack });

    startStandardSprint(renderer);
    act(() => {
      jest.advanceTimersByTime(299_750);
    });
    systemBack.startPredictive("right");

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(service.getActiveSprint()?.status).toBe("active");

    systemBack.cancelPredictive();

    expect(service.getActiveSprint()).toBeUndefined();
    expect(collectText(findByTestId(renderer, "sprint-result-reason"))).toBe("Time expired");
  });

  it("cancels a pending Arrow Duel start before its delayed callback can enter practice", () => {
    const systemBack = createTestSystemBackSource("android");
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service, systemBack });

    press(renderer, "practice-mode-arrow-duel");
    press(renderer, "practice-start-button");
    expect(findByTestId(renderer, "sprint-loading-overlay")).toBeTruthy();

    expect(systemBack.invoke()).toBe(true);
    expect(() => findByTestId(renderer, "sprint-loading-overlay")).toThrow();

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(service.getActiveSprint()).toBeUndefined();
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
  });

  it("keeps the starting-practice destination frozen when its timer becomes due during Predictive Back", () => {
    const systemBack = createTestSystemBackSource("android");
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service, systemBack });

    press(renderer, "practice-mode-arrow-duel");
    press(renderer, "practice-start-button");
    expect(findByTestId(renderer, "sprint-loading-overlay")).toBeTruthy();

    const subscriptionsBeforeGesture = systemBack.subscribe.mock.calls.length;
    const unsubscriptionsBeforeGesture = systemBack.unsubscribe.mock.calls.length;
    systemBack.startPredictive("left");
    systemBack.progressPredictive(0.6, "left");

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(service.getActiveSprint()).toBeUndefined();
    expect(findByTestId(renderer, "sprint-loading-overlay")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "mobile-back-destination-preview-label")))
      .toBe("Practice setup");
    expect(collectText(findByTestId(renderer, "mobile-back-destination-preview-id")))
      .toBe("practice-setup");
    expect(systemBack.subscribe).toHaveBeenCalledTimes(subscriptionsBeforeGesture);
    expect(systemBack.unsubscribe).toHaveBeenCalledTimes(unsubscriptionsBeforeGesture);

    expect(systemBack.commitPredictive()).toBe(true);
    expect(service.getActiveSprint()).toBeUndefined();
    expect(() => findByTestId(renderer, "sprint-loading-overlay")).toThrow();
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
  });

  it("resumes a due Arrow Duel start only after a predictive gesture is cancelled", () => {
    const systemBack = createTestSystemBackSource("android");
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service, systemBack });

    press(renderer, "practice-mode-arrow-duel");
    press(renderer, "practice-start-button");
    systemBack.startPredictive("left");

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(service.getActiveSprint()).toBeUndefined();
    expect(findByTestId(renderer, "sprint-loading-overlay")).toBeTruthy();

    systemBack.cancelPredictive();

    expect(() => findByTestId(renderer, "mobile-back-destination-preview")).toThrow();
    expect(service.getActiveSprint()?.status).toBe("active");
    expect(findByTestId(renderer, "active-session-shell")).toBeTruthy();
  });

  it("returns a completed sprint result to idle Practice", () => {
    const systemBack = createTestSystemBackSource("android");
    const renderer = renderStandardSequenceScreen({ systemBack });

    startStandardSprint(renderer);
    act(() => {
      jest.advanceTimersByTime(301_000);
    });
    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();

    const subscriptionsBeforeGesture = systemBack.subscribe.mock.calls.length;
    const unsubscriptionsBeforeGesture = systemBack.unsubscribe.mock.calls.length;
    systemBack.startPredictive("left");
    systemBack.progressPredictive(0.5, "left");
    expect(collectText(findByTestId(renderer, "mobile-back-destination-preview-label"))).toBe("Practice");
    expect(systemBack.subscribe).toHaveBeenCalledTimes(subscriptionsBeforeGesture);
    expect(systemBack.unsubscribe).toHaveBeenCalledTimes(unsubscriptionsBeforeGesture);

    systemBack.cancelPredictive();
    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();
    systemBack.startPredictive("right");
    systemBack.progressPredictive(0.8, "right");
    expect(systemBack.commitPredictive()).toBe(true);
    expect(() => findByTestId(renderer, "sprint-summary-panel")).toThrow();
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
  });

  it("returns a completed Custom result through setup to idle Practice", async () => {
    const systemBack = createTestSystemBackSource("android");
    const service = createMobilePracticeService();
    const renderer = renderScreen({
      customTargetCorrect: 1,
      practiceServiceFactory: () => service,
      puzzleSelectionId: androidPracticeFixture.puzzle.id,
      puzzleSelectionSeed: androidPracticeFixture.puzzleSelectionSeed,
      systemBack
    });

    press(renderer, "practice-mode-custom");
    press(renderer, "custom-duration-stepper-decrease");
    press(renderer, "custom-per-puzzle-stepper-increase");
    press(renderer, "custom-theme-fork");
    press(renderer, "start-sprint-button");
    expect(service.getActiveSprint()?.currentPuzzle).toMatchObject({
      puzzle: {
        id: androidPracticeFixture.puzzle.id,
        initialFen: androidPracticeFixture.puzzle.initialFen,
        solutionMoves: androidPracticeFixture.puzzle.solutionMoves
      },
      playedMoves: [androidPracticeFixture.puzzle.solutionMoves[0]],
      cursor: 1
    });
    expect(findByTestId(renderer, "session-side-to-move").props.accessibilityLabel).toBe("Black to move");
    await boardMove(renderer, androidPracticeFixture.userMoves[0]);
    await settleFeedbackSnapshot();
    expect(service.getState()).toMatchObject({
      status: "active",
      currentPuzzle: { puzzleId: androidPracticeFixture.puzzle.id, userMoveNumber: 2 }
    });
    await boardMove(renderer, androidPracticeFixture.userMoves[1]);
    expect(service.listSprintSessions().at(-1)?.status).toBe("won");
    await settleFeedbackSnapshot();
    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();

    expect(systemBack.invoke()).toBe(true);
    expect(findByTestId(renderer, "custom-sprint-setup")).toBeTruthy();
    expect(systemBack.invoke()).toBe(true);
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
  });

  it("binds Unclear to the completed attempt and replaces the yellow action with a yellow confirmation", async () => {
    const service = createMobilePracticeService("random1000");
    const renderer = renderScreen({ practiceService: service, standardTargetCorrect: 1 });

    startStandardSprint(renderer);
    await boardMove(renderer, "e2e6");
    expect(() => findByTestId(renderer, "sprint-unclear-prompt")).toThrow();
    await settleFeedbackSnapshot();

    await boardMove(renderer, "e6f7");
    expect(collectText(findByTestId(renderer, "sprint-unclear-question"))).toBe(
      "Was the previous puzzle clear?"
    );
    expect(collectText(findByTestId(renderer, "sprint-unclear-toggle"))).toBe("Mark as unclear");
    expect(styleContains(findByTestId(renderer, "sprint-unclear-toggle").props.style, "#FFFBEB")).toBe(true);
    expect(styleContains(findByTestId(renderer, "sprint-unclear-toggle").props.style, "#F59E0B")).toBe(true);
    const promptStyle = findByTestId(renderer, "sprint-unclear-prompt").props.style;
    press(renderer, "sprint-unclear-toggle");
    const attemptId = (service.listHistory() as AttemptEvent[])[0]?.id;
    expect(attemptId).toBeTruthy();
    expect((service.listHistory() as AttemptEvent[])[0]).toMatchObject({ unclear: true });
    expect(collectText(findByTestId(renderer, "sprint-unclear-marked"))).toBe("Marked");
    expect(styleContains(findByTestId(renderer, "sprint-unclear-marked").props.style, "#FFFBEB")).toBe(true);
    expect(styleContains(findByTestId(renderer, "sprint-unclear-marked").props.style, "#F59E0B")).toBe(true);
    expect(() => findByTestId(renderer, "sprint-unclear-toggle")).toThrow();
    expect(() => findByTestId(renderer, "bookmark-glyph")).toThrow();
    expect(findByTestId(renderer, "sprint-unclear-prompt").props.style).toEqual(promptStyle);

    await settleFeedbackSnapshot();
    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();
    expect(findByTestId(renderer, "sprint-unclear-prompt")).toBeTruthy();
    expect((service.listHistory() as AttemptEvent[])[0]).toMatchObject({
      id: attemptId,
      unclear: true
    });
    expect(collectText(findByTestId(renderer, "sprint-unclear-marked"))).toBe("Marked");
  });

  it("keeps Review Schedule controls out of active Practice and Sprint Result", async () => {
    const service = createMobilePracticeService("random1000");
    const renderer = renderScreen({
      practiceService: service,
      standardTargetCorrect: 1
    });

    startStandardSprint(renderer);
    expect(() => findByTestId(renderer, "review-schedule-control")).toThrow();
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");
    press(renderer, "sprint-unclear-toggle");

    expect((service.listHistory() as AttemptEvent[])[0]).toMatchObject({ unclear: true });
    expect(() => findByTestId(renderer, "review-schedule-control")).toThrow();

    await settleFeedbackSnapshot();
    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-schedule-control")).toThrow();
  });

  it("keeps the Unclear prompt on the previous attempt until the next puzzle completes", async () => {
    const service = createMobilePracticeService("random1000");
    const renderer = renderScreen({ practiceService: service });

    startStandardSprint(renderer);
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");
    const completedAttemptId = (service.listHistory() as AttemptEvent[])[0]?.id;
    await settleFeedbackSnapshot();

    expect(collectText(findByTestId(renderer, "sprint-unclear-question"))).toBe(
      "Was the previous puzzle clear?"
    );
    press(renderer, "sprint-unclear-toggle");
    expect((service.listHistory() as AttemptEvent[]).find((attempt) => attempt.id === completedAttemptId)).toMatchObject({
      unclear: true
    });

    await boardMove(renderer, "g6g5");
    expect(() => findByTestId(renderer, "sprint-unclear-prompt")).toThrow();
  });

  it.each([
    {
      name: "History filters",
      ownerTab: "history-tab",
      openControl: "history-filter-toggle",
      expandedSurface: "history-advanced-filters"
    },
    {
      name: "Review filters",
      ownerTab: "review-tab",
      openControl: "review-filter-toggle",
      expandedSurface: "review-queue-filters"
    },
    {
      name: "Settings advanced ratings",
      ownerTab: "settings-tab",
      openControl: "settings-standard-elo-row",
      expandedSurface: "settings-advanced-ratings-panel"
    }
  ])("restores iOS child-local lifetime for $name after tab-away/tab-back", ({
    expandedSurface,
    openControl,
    ownerTab
  }) => {
    const systemBack = createTestSystemBackSource("ios");
    const renderer = renderScreen({ systemBack });

    press(renderer, ownerTab);
    press(renderer, openControl);
    expect(findByTestId(renderer, expandedSurface)).toBeTruthy();

    press(renderer, "practice-tab");
    press(renderer, ownerTab);
    expect(() => findByTestId(renderer, expandedSurface)).toThrow();
  });

  it("restores iOS custom rating-editor lifetime after tab-away/tab-back", () => {
    const systemBack = createTestSystemBackSource("ios");
    const renderer = renderScreen({ practiceService: createPlayedCustomService(), systemBack });

    press(renderer, "practice-mode-custom");
    press(renderer, "custom-initial-rating-row");
    expect(findByTestId(renderer, "custom-initial-rating-editor")).toBeTruthy();

    press(renderer, "settings-tab");
    press(renderer, "practice-tab");
    expect(findByTestId(renderer, "custom-sprint-setup")).toBeTruthy();
    expect(() => findByTestId(renderer, "custom-initial-rating-editor")).toThrow();
  });

  it("previews and commits the Custom setup destination from the rating editor", () => {
    const systemBack = createTestSystemBackSource("android");
    const renderer = renderScreen({ practiceService: createPlayedCustomService(), systemBack });

    press(renderer, "practice-mode-custom");
    press(renderer, "custom-initial-rating-row");
    expect(findByTestId(renderer, "custom-initial-rating-editor")).toBeTruthy();

    systemBack.startPredictive("left");
    systemBack.progressPredictive(0.6, "left");
    expect(collectText(findByTestId(renderer, "mobile-back-destination-preview-label")))
      .toBe("Custom setup");
    expect(collectText(findByTestId(renderer, "mobile-back-destination-preview-id")))
      .toBe("custom-sprint-setup");

    systemBack.cancelPredictive();
    expect(findByTestId(renderer, "custom-initial-rating-editor")).toBeTruthy();

    systemBack.startPredictive("right");
    systemBack.progressPredictive(0.8, "right");
    expect(systemBack.commitPredictive()).toBe(true);
    expect(() => findByTestId(renderer, "custom-initial-rating-editor")).toThrow();
    expect(findByTestId(renderer, "custom-sprint-setup")).toBeTruthy();
  });

  it("closes review analysis before returning the review to its owner", () => {
    jest.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    const systemBack = createTestSystemBackSource("android");
    const service = createDueReviewService(1);
    service.recordReviewAttempt({
      puzzleId: "review-badge-0",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "wrong",
      submittedMove: "e2e3",
      expectedMove: "e2e4",
      startedAt: "2026-06-21T11:01:00.000Z"
    }, "2026-06-21T11:01:08.000Z");
    const renderer = renderScreen({ practiceService: service, systemBack });

    press(renderer, "review-tab");
    const completedAttempt = renderer.root.find(
      (node) => typeof node.props.testID === "string"
        && node.props.testID.startsWith("review-today-attempt-")
        && node.props.accessibilityRole === "button"
    );
    act(() => completedAttempt.props.onPress());
    press(renderer, "review-analysis-button");
    expect(findByTestId(renderer, "review-close-analysis")).toBeTruthy();

    let subscriptionsBeforeGesture = systemBack.subscribe.mock.calls.length;
    let unsubscriptionsBeforeGesture = systemBack.unsubscribe.mock.calls.length;
    systemBack.startPredictive("left");
    systemBack.progressPredictive(0.55, "left");
    expect(collectText(findByTestId(renderer, "mobile-back-destination-preview-label"))).toBe("Review session");
    expect(systemBack.subscribe).toHaveBeenCalledTimes(subscriptionsBeforeGesture);
    expect(systemBack.unsubscribe).toHaveBeenCalledTimes(unsubscriptionsBeforeGesture);

    systemBack.cancelPredictive();
    expect(findByTestId(renderer, "review-close-analysis")).toBeTruthy();
    systemBack.startPredictive("right");
    systemBack.progressPredictive(0.75, "right");
    expect(systemBack.commitPredictive()).toBe(true);
    expect(() => findByTestId(renderer, "review-close-analysis")).toThrow();
    expect(findByTestId(renderer, "review-session")).toBeTruthy();

    subscriptionsBeforeGesture = systemBack.subscribe.mock.calls.length;
    unsubscriptionsBeforeGesture = systemBack.unsubscribe.mock.calls.length;
    systemBack.startPredictive("left");
    systemBack.progressPredictive(0.6, "left");
    expect(collectText(findByTestId(renderer, "mobile-back-destination-preview-label"))).toBe("Review");
    expect(systemBack.subscribe).toHaveBeenCalledTimes(subscriptionsBeforeGesture);
    expect(systemBack.unsubscribe).toHaveBeenCalledTimes(unsubscriptionsBeforeGesture);
    expect(systemBack.commitPredictive()).toBe(true);
    expect(() => findByTestId(renderer, "review-session")).toThrow();
    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
  });

  it("returns a multi-context due review to its Review owner without advancing the queued group", () => {
    const systemBack = createTestSystemBackSource("android");
    const service = createMultiContextDueReviewService();
    const renderer = renderScreen({ practiceService: service, systemBack });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    const firstPuzzleId = collectText(findByTestId(renderer, "review-current-puzzle-id"));

    systemBack.startPredictive("left");
    systemBack.progressPredictive(0.6, "left");
    expect(collectText(findByTestId(renderer, "mobile-back-destination-preview-label"))).toBe("Review");
    systemBack.cancelPredictive();
    expect(collectText(findByTestId(renderer, "review-current-puzzle-id"))).toBe(firstPuzzleId);

    systemBack.startPredictive("right");
    expect(systemBack.commitPredictive()).toBe(true);

    expect(() => findByTestId(renderer, "review-session")).toThrow();
    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
    expect(service.listHistory({ source: "scheduled_review" })).toHaveLength(0);
  });

  it("commits the Review owner when a multi-context due review times out during Predictive Back", () => {
    const systemBack = createTestSystemBackSource("android");
    const service = createMultiContextDueReviewService();
    const renderer = renderScreen({ practiceService: service, systemBack });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    act(() => {
      jest.advanceTimersByTime(39_750);
    });
    systemBack.startPredictive("left");

    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(collectText(findByTestId(renderer, "mobile-back-destination-preview-label"))).toBe("Review");
    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(service.listHistory({ source: "scheduled_review" }) as Array<{ submittedMove: string }>).toEqual([
      expect.objectContaining({ submittedMove: "__timeout__" })
    ]);

    expect(systemBack.commitPredictive()).toBe(true);
    expect(() => findByTestId(renderer, "review-session")).toThrow();
    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
  });

  it("ignores a stale multi-context completion after Predictive Back commits the Review owner", async () => {
    const systemBack = createTestSystemBackSource("android");
    const service = createMultiContextDueReviewService();
    const renderer = renderScreen({ practiceService: service, systemBack });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    await boardMove(renderer, "c4b5");
    systemBack.startPredictive("left");
    expect(systemBack.commitPredictive()).toBe(true);
    expect(findByTestId(renderer, "review-panel")).toBeTruthy();

    await settleFeedbackSnapshot();

    expect(() => findByTestId(renderer, "review-session")).toThrow();
    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
  });

  it("lets a pending multi-context completion advance after Predictive Back is cancelled", async () => {
    const systemBack = createTestSystemBackSource("android");
    const service = createMultiContextDueReviewService();
    const renderer = renderScreen({ practiceService: service, systemBack });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    const firstTimer = collectText(findByTestId(renderer, "review-timer"));
    await boardMove(renderer, "c4b5");
    systemBack.startPredictive("right");
    systemBack.cancelPredictive();

    await settleFeedbackSnapshot();

    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-timer"))).not.toBe(firstTimer);
    expect(() => findByTestId(renderer, "review-line-continue")).toThrow();
  });

  it("previews Practice for session-mistake review while analysis returns to the review first", async () => {
    const systemBack = createTestSystemBackSource("android");
    const renderer = renderStandardSequenceScreen({ systemBack });

    await openSessionMistakeReview(renderer);
    press(renderer, "review-analysis-button");
    systemBack.startPredictive("left");
    systemBack.progressPredictive(0.5, "left");
    expect(collectText(findByTestId(renderer, "mobile-back-destination-preview-label"))).toBe("Review session");
    expect(systemBack.commitPredictive()).toBe(true);
    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-close-analysis")).toThrow();

    systemBack.startPredictive("right");
    systemBack.progressPredictive(0.7, "right");
    expect(collectText(findByTestId(renderer, "mobile-back-destination-preview-label"))).toBe("Practice");
    systemBack.cancelPredictive();
    expect(findByTestId(renderer, "review-session")).toBeTruthy();

    systemBack.startPredictive("right");
    expect(systemBack.commitPredictive()).toBe(true);
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-session")).toThrow();
  });

  it("does not subscribe the iOS shell to Android system Back", () => {
    const systemBack = createTestSystemBackSource("ios");

    renderScreen({ systemBack });

    expect(systemBack.subscribe).not.toHaveBeenCalled();
    expect(systemBack.setPredictiveBackEnabled).not.toHaveBeenCalled();
  });

  it("previews the typed destination during Predictive Back, cancels cleanly, and commits parity", () => {
    const systemBack = createTestSystemBackSource("android");
    const renderer = renderScreen({ systemBack });

    press(renderer, "settings-tab");
    expect(systemBack.setPredictiveBackEnabled).toHaveBeenLastCalledWith(true);
    systemBack.startPredictive("left");
    systemBack.progressPredictive(0.6, "left");
    expect(collectText(findByTestId(renderer, "mobile-back-destination-preview-label"))).toBe("Practice");
    expect(collectText(findByTestId(renderer, "mobile-back-destination-preview-id"))).toBe("tab-practice");
    expect(findByTestId(renderer, "settings-panel")).toBeTruthy();

    systemBack.cancelPredictive();
    expect(() => findByTestId(renderer, "mobile-back-destination-preview")).toThrow();
    expect(findByTestId(renderer, "settings-panel")).toBeTruthy();

    systemBack.startPredictive("right");
    systemBack.progressPredictive(0.8, "right");
    expect(systemBack.commitPredictive()).toBe(true);
    expect(() => findByTestId(renderer, "mobile-back-destination-preview")).toThrow();
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
    expect(systemBack.setPredictiveBackEnabled).toHaveBeenLastCalledWith(false);
  });

  it("replaces the Android Back listener and removes it on unmount", () => {
    const sourceA = createTestSystemBackSource("android");
    const sourceB = createTestSystemBackSource("android");
    const platformCapabilities = createTestMobilePlatformCapabilities();
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    act(() => {
      renderer = TestRenderer.create(
        <PracticePocScreen platformCapabilities={platformCapabilities} systemBack={sourceA} />
      );
    });
    expect(sourceA.subscribe).toHaveBeenCalledTimes(1);

    act(() => {
      renderer?.update(
        <PracticePocScreen platformCapabilities={platformCapabilities} systemBack={sourceB} />
      );
    });
    expect(sourceA.unsubscribe).toHaveBeenCalledTimes(1);
    expect(sourceB.subscribe).toHaveBeenCalledTimes(1);

    act(() => {
      renderer?.unmount();
    });
    expect(sourceB.unsubscribe).toHaveBeenCalledTimes(1);
    expect(sourceB.setPredictiveBackEnabled).toHaveBeenLastCalledWith(false);
  });

  it("does not initialize Stockfish while rendering the Practice home", async () => {
    const prewarm = jest.fn(async () => true);

    renderScreen({ stockfish: { prewarm } });
    await act(async () => {
      await Promise.resolve();
    });

    expect(prewarm).not.toHaveBeenCalled();
  });

  it("exposes the mobile app shell automation contract", () => {
    const renderer = renderScreen();
    const mainScroll = findByTestId(renderer, "practice-main-scroll");

    expect(findByTestId(renderer, "practice-tab")).toBeTruthy();
    expect(mainScroll.props.showsHorizontalScrollIndicator).toBe(false);
    expect(mainScroll.props.showsVerticalScrollIndicator).toBe(false);
    expect(findByTestId(renderer, "review-tab")).toBeTruthy();
    expect(findByTestId(renderer, "history-tab")).toBeTruthy();
    expect(findByTestId(renderer, "settings-tab")).toBeTruthy();
    expect(() => findByTestId(renderer, "packs-tab")).toThrow();
    expect(findByTestId(renderer, "practice-tab-icon")).toBeTruthy();
    expect(findByTestId(renderer, "review-tab-icon")).toBeTruthy();
    expect(findByTestId(renderer, "history-tab-icon")).toBeTruthy();
    expect(findByTestId(renderer, "settings-tab-icon")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-tab-icon"))).toBe("");
    expect(hasStyleEntry(findByTestId(renderer, "practice-tab-icon"), "backgroundColor", "#DBEAFE")).toBe(false);
    expect(findByTestId(renderer, "practice-tab-target-outer")).toBeTruthy();
    expect(findByTestId(renderer, "practice-tab-target-inner")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-tab-icon"))).toBe("");
    expect(collectText(renderer.root)).not.toContain("⚙");
    expect(() => findByTestId(renderer, "analysis-tab")).toThrow();
    expect(findByTestId(renderer, "practice-mode-standard")).toBeTruthy();
    expect(findByTestId(renderer, "practice-mode-standard").props.accessibilityState).toEqual({ selected: true });
    expect(hasStyleEntry(findByTestId(renderer, "practice-mode-standard"), "borderColor", "#93C5FD")).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "practice-mode-standard-icon"), "backgroundColor", "#DBEAFE")).toBe(true);
    expect(findByTestId(renderer, "practice-mode-arrow-duel")).toBeTruthy();
    expect(findByTestId(renderer, "practice-mode-arrow-duel").props.accessibilityState).toEqual({ selected: false });
    expect(hasStyleEntry(findByTestId(renderer, "practice-mode-arrow-duel"), "borderColor", "#93C5FD")).toBe(false);
    expect(() => findByTestId(renderer, "practice-mode-blitz")).toThrow();
    expect(findByTestId(renderer, "practice-mode-custom")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-mode-standard-icon"))).toBe("");
    expect(collectText(findByTestId(renderer, "practice-mode-arrow-duel-icon"))).toBe("");
    expect(findByTestId(renderer, "practice-mode-arrow-duel-arrow-a")).toBeTruthy();
    expect(findByTestId(renderer, "practice-mode-arrow-duel-arrow-b")).toBeTruthy();
    expect(findByTestId(renderer, "practice-mode-arrow-duel-arrow-a-shaft")).toBeTruthy();
    expect(findByTestId(renderer, "practice-mode-arrow-duel-arrow-b-shaft")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-mode-custom-icon"))).toBe("");
    expect(() => findByTestId(renderer, "practice-mode-standard-start")).toThrow();
    expect(() => findByTestId(renderer, "practice-mode-arrow-duel-start")).toThrow();
    expect(findByTestId(renderer, "practice-mode-custom-disclosure")).toBeTruthy();
    expect(() => findByTestId(renderer, "practice-mode-custom-rating")).toThrow();
    expect(collectText(findByTestId(renderer, "practice-mode-custom"))).not.toContain("ELO");
    expect(findByTestId(renderer, "practice-mode-custom").props.accessibilityLabel).toBe("Open Custom sprint setup, Configure time, theme, and rating");
    expect(findByTestId(renderer, "practice-start-button")).toBeTruthy();
    expect(findByTestId(renderer, "practice-start-button").props.accessibilityRole).toBe("button");
    expect(findByTestId(renderer, "practice-start-button").props.accessibilityLabel).toBe("Start Standard sprint");
    expect(collectText(findByTestId(renderer, "practice-start-button"))).toBe("Start");
    expect(flattenTestStyle(findByTestId(renderer, "practice-action-header").props.style).minHeight).toBe(40);
    expect(flattenTestStyle(findByTestId(renderer, "practice-header-title").props.style).fontSize).toBe(17);
    expect(flattenTestStyle(findByTestId(renderer, "practice-header-title").props.style).textAlign).toBe("left");
    expect(flattenTestStyle(findByTestId(renderer, "practice-start-button").props.style).height).toBe(40);
    expect(findByTestId(renderer, "practice-mode-standard-details").props.accessibilityLabel).toBe("5 min · 20s pace · ELO 600");
    expect(findByTestId(renderer, "practice-mode-arrow-duel-details").props.accessibilityLabel).toBe("5 min · 30s pace · ELO 600");
    expect(collectText(findByTestId(renderer, "practice-mode-standard-rating"))).toBe("ELO 600");
    expect(collectText(findByTestId(renderer, "practice-mode-standard"))).toContain("Find the best move");
    expect(collectText(findByTestId(renderer, "practice-mode-standard"))).not.toContain("Find the best move · 5 min");
    expect(collectText(findByTestId(renderer, "practice-mode-arrow-duel"))).toContain("Choose the best move");
    expect(collectText(findByTestId(renderer, "practice-mode-arrow-duel"))).not.toContain("Choose the best move · 5 min");
    expect(collectText(findByTestId(renderer, "practice-mode-custom"))).toContain("Time, theme, rating");
    expect(collectText(findByTestId(renderer, "practice-mode-custom"))).not.toContain("Time, theme, rating · 5 min");
    expect(findByTestId(renderer, "practice-mode-standard").props.accessibilityLabel).toBe("Select Standard mode, 5 min · 20s pace · ELO 600");
    expect(findByTestId(renderer, "practice-mode-arrow-duel").props.accessibilityLabel).toBe("Select Arrow Duel mode, 5 min · 30s pace · ELO 600");
    expect(() => findByTestId(renderer, "rating-label")).toThrow();
    expect(collectText(renderer.root)).not.toContain("Target 15");
    expect(collectText(renderer.root)).not.toContain("standard 5/20");
    expectText(renderer, "ELO 600");
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-tab-badge")).toThrow();
    expect(collectText(findByTestId(renderer, "practice-header-title"))).toBe("Start a Sprint");
    expect(collectText(findByTestId(renderer, "practice-home"))).not.toContain("Offline puzzle training");
    expect(findByTestId(renderer, "practice-progress-summary")).toBeTruthy();
    expect(flattenTestStyle(findByTestId(renderer, "practice-progress-summary").props.style).alignItems).toBe("flex-start");
    expect(flattenTestStyle(findByTestId(renderer, "practice-progress-rating-metric").props.style).alignItems).toBe("center");
    expect(flattenTestStyle(findByTestId(renderer, "practice-progress-weekly-metric").props.style).alignItems).toBe("center");
    expect(collectText(findByTestId(renderer, "practice-progress-rating-delta"))).toBe("No rating change");
    expect(hasStyleEntry(findByTestId(renderer, "practice-progress-rating-delta"), "color", "#64748B")).toBe(true);
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-solved"))).toBe("0");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-delta"))).toBe("Start training");
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toContain("rating No rating change");
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toContain("No attempts yet");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-context"))).toBe("No attempts yet");
    expect(hasStyleEntry(findByTestId(renderer, "practice-progress-weekly-delta"), "color", "#64748B")).toBe(true);
    expect(findByTestId(renderer, "practice-review-strip")).toBeTruthy();
    expect(findByTestId(renderer, "practice-review-strip-chevron")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-review-strip-chevron"))).toBe("");
    expect(collectText(findByTestId(renderer, "practice-review-strip"))).toContain("No reviews due");
    expect(collectText(findByTestId(renderer, "practice-review-strip"))).not.toContain("Scheduled mistake reviews");
    expect(findByTestId(renderer, "practice-review-strip").props.accessibilityLabel).toContain("scheduled mistake reviews");
    expect(flattenTestStyle(findByTestId(renderer, "practice-review-due-count").props.style).alignItems).toBe("center");
    expect(collectText(findByTestId(renderer, "practice-review-due-count"))).toContain("0");
    expect(collectText(findByTestId(renderer, "practice-review-due-count"))).toContain("Due today");
    expect(() => findByTestId(renderer, "practice-review-overdue-count")).toThrow();
    expect(findByTestId(renderer, "practice-review-strip").props.accessibilityLabel).not.toContain("overdue");
    press(renderer, "review-tab");
    expectText(renderer, "You're done for today");
    expect(collectText(findByTestId(renderer, "review-tomorrow-count"))).toBe("0");
    expect(collectText(findByTestId(renderer, "review-next-seven-days-count"))).toBe("0");
    expect(collectText(findByTestId(renderer, "review-total-count"))).toBe("0");
    press(renderer, "practice-tab");
    const bundledPuzzleLabel = formatTestWholeNumber(seededPuzzleCount());
    const rawBundledPuzzleLabel = String(seededPuzzleCount());
    expect(collectText(renderer.root)).not.toContain(`Offline-ready · ${bundledPuzzleLabel} puzzles`);
    expect(findByTestId(renderer, "app-shell-header").props.accessibilityLabel).toContain(`Offline-ready · ${rawBundledPuzzleLabel} puzzles`);
    expect(collectText(findByTestId(renderer, "practice-header-title"))).toBe("Start a Sprint");
  });

  it("selects Arrow Duel and shows a loading transition before starting from the header action", () => {
    const service = createMobilePracticeService("familiar15");
    service.setRating(defaultSprintConfig("arrow_duel").ratingKey, 900);
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "practice-mode-arrow-duel");

    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
    expect(findByTestId(renderer, "practice-mode-standard").props.accessibilityState).toEqual({ selected: false });
    expect(findByTestId(renderer, "practice-mode-arrow-duel").props.accessibilityState).toEqual({ selected: true });
    expect(hasStyleEntry(findByTestId(renderer, "practice-mode-arrow-duel"), "borderColor", "#93C5FD")).toBe(true);
    expect(collectText(findByTestId(renderer, "practice-progress-rating-metric"))).toContain("ELO (Arrow Duel)");
    expect(collectText(findByTestId(renderer, "practice-progress-rating-metric"))).toContain("900");
    expect(() => findByTestId(renderer, "session-board")).toThrow();

    expect(findByTestId(renderer, "practice-start-button").props.accessibilityLabel).toBe("Start Arrow Duel sprint");
    press(renderer, "practice-start-button");

    expect(findByTestId(renderer, "sprint-loading-overlay").props.accessibilityLabel).toBe("Preparing Arrow Duel sprint");
    expect(findByTestId(renderer, "sprint-loading-spinner")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-loading-overlay"))).toContain("Preparing Arrow Duel");
    expect(() => findByTestId(renderer, "session-board")).toThrow();
    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(() => findByTestId(renderer, "sprint-loading-overlay")).toThrow();
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
  });

  it("keeps the preparing state available for deterministic interaction-lab review", () => {
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({
      practiceService: service,
      sprintStartDelayMs: 60_000
    });

    press(renderer, "practice-mode-arrow-duel");
    press(renderer, "practice-start-button");
    act(() => {
      jest.advanceTimersByTime(5_000);
    });

    expect(findByTestId(renderer, "sprint-loading-overlay")).toBeTruthy();
    expect(service.getActiveSprint()).toBeUndefined();
  });

  it("keeps first-select Arrow Duel progress on its own ELO after startup sync completes", async () => {
    const service = createMobilePracticeService("familiar15");
    service.setRating(defaultSprintConfig("standard").ratingKey, 1_106);
    service.setRating(defaultSprintConfig("arrow_duel").ratingKey, 775);
    let resolveAccountStatus: (() => void) | undefined;
    const client = {
      getAccountStatus: () => new Promise<"available">((resolve) => {
        resolveAccountStatus = () => resolve("available");
      }),
      fetchSnapshot: async () => undefined,
      saveSnapshot: async () => {}
    };
    const renderer = renderScreen({
      practiceService: service,
      iCloudProgressSyncClient: client
    });

    press(renderer, "practice-mode-arrow-duel");
    expect(collectText(findByTestId(renderer, "practice-mode-arrow-duel-rating"))).toBe("ELO 775");
    expect(collectText(findByTestId(renderer, "practice-progress-rating-metric"))).toContain("ELO (Arrow Duel)775");

    await act(async () => {
      resolveAccountStatus?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(collectText(findByTestId(renderer, "practice-progress-rating-metric"))).toContain("ELO (Arrow Duel)775");
    expect(collectText(findByTestId(renderer, "practice-progress-rating-metric"))).not.toContain("1106");
  });

  it("scopes the home progress summary to the selected rating bucket", () => {
    const store = new MemoryStore();
    store.seedPuzzles([sharedHistoryPuzzle()]);
    store.saveRating({ key: "standard 5/20", generation: 0, rating: 700, games: 1 });
    store.saveRating({ key: "arrow duel 5/30", generation: 0, rating: 900, games: 1 });
    store.recordAttempt({
      id: "standard-win",
      source: "sprint",
      sessionId: "session-standard-win",
      puzzleId: "shared-history",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e2e4",
      expectedMove: "e2e4",
      startedAt: "2026-07-07T00:00:00.000Z",
      completedAt: "2026-07-07T00:00:05.000Z",
      ratingBefore: 600,
      ratingAfter: 1_400
    });
    store.recordAttempt({
      id: "arrow-win",
      source: "sprint",
      sessionId: "session-arrow-win",
      puzzleId: "shared-history",
      mode: "arrow_duel",
      ratingKey: "arrow duel 5/30",
      result: "correct",
      submittedMove: "e2e4",
      expectedMove: "e2e4",
      startedAt: "2026-07-07T00:01:00.000Z",
      completedAt: "2026-07-07T00:01:05.000Z",
      ratingBefore: 600,
      ratingAfter: 1_500
    });
    store.createSprintSession(completedRatingSprintState({
      id: "session-standard-win",
      mode: "standard",
      completedAt: "2026-07-07T00:00:05.000Z",
      ratingBefore: 600,
      ratingAfter: 700
    }));
    store.createSprintSession(completedRatingSprintState({
      id: "session-arrow-win",
      mode: "arrow_duel",
      completedAt: "2026-07-07T00:01:05.000Z",
      ratingBefore: 600,
      ratingAfter: 900
    }));

    const renderer = renderScreen({
      currentTimeMs: () => Date.parse("2026-07-08T12:00:00.000Z"),
      practiceService: new PracticeService(store)
    });

    expect(collectText(findByTestId(renderer, "practice-progress-rating-metric"))).toContain("700");
    expect(collectText(findByTestId(renderer, "practice-progress-rating-delta"))).toBe("+100 this week");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-solved"))).toBe("1");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-delta"))).toBe("+1 net");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-context"))).toBe("100% accuracy · 0 mistakes");
  });

  it("does not scan the bundled Core Pack when rendering custom sprint availability", () => {
    const service = createMobilePracticeService("familiar15");
    const countEligible = jest.spyOn(service, "countEligibleSprintPuzzles");
    const renderer = renderScreen({ practiceService: service });

    expect(countEligible).not.toHaveBeenCalled();

    press(renderer, "practice-mode-custom");

    expect(countEligible).not.toHaveBeenCalled();
    expect(() => findByTestId(renderer, "custom-pack-warning")).toThrow();
    expect(findByTestId(renderer, "start-sprint-button").props.accessibilityState).toEqual({ disabled: false });
  });

  it.each([
    { label: "iPhone SE-sized portrait", width: 320, height: 568, scale: 2, layout: "compactPortrait", boardSize: 288, sideRail: false, railWidth: null, sessionRail: false, homeColumns: false },
    { label: "modern iPhone portrait", width: 430, height: 932, scale: 3, layout: "compactPortrait", boardSize: 398, sideRail: false, railWidth: null, sessionRail: false, homeColumns: false },
    { label: "compact iPhone landscape", width: 844, height: 390, scale: 3, layout: "compactLandscape", boardSize: 358, sideRail: true, railWidth: 64, sessionRail: true, homeColumns: false },
    { label: "iPad A16 portrait", width: 820, height: 1180, scale: 2, layout: "regularPortrait", boardSize: 788, sideRail: true, railWidth: 76, sessionRail: false, homeColumns: false },
    { label: "iPad Pro portrait", width: 1032, height: 1376, scale: 2, layout: "regularPortrait", boardSize: 860, sideRail: true, railWidth: 168, sessionRail: false, homeColumns: true },
    { label: "iPad landscape", width: 1180, height: 820, scale: 2, layout: "regularLandscape", boardSize: 640, sideRail: true, railWidth: 168, sessionRail: true, homeColumns: true },
    { label: "iPad split-width portrait", width: 694, height: 1024, scale: 2, layout: "compactPortrait", boardSize: 560, sideRail: false, railWidth: null, sessionRail: false, homeColumns: false }
  ])("renders the core practice surfaces in a %s viewport", ({ width, height, scale, layout, boardSize, sideRail, railWidth, sessionRail, homeColumns }) => {
    (ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: { fontScale: number; height: number; scale: number; width: number }) => void;
    }).__setWindowDimensions?.({ width, height, scale, fontScale: 1 });

    const renderer = renderScreen({ practiceService: createMobilePracticeService("random1000") });

    expect(findByTestId(renderer, "adaptive-layout").props.accessibilityLabel).toBe(`Layout ${layout}`);
    expect(findByTestId(renderer, "app-shell-header")).toBeTruthy();
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
    expect(styleEntryMatches(findByTestId(renderer, "practice-home-layout").props.style, "flexDirection", "row")).toBe(homeColumns);
    expect(styleEntryMatches(findByTestId(renderer, "practice-review-strip-action-area").props.style, "width", "50%")).toBe(homeColumns);
    expect(styleEntryMatches(findByTestId(renderer, "practice-review-strip-counts").props.style, "justifyContent", "center")).toBe(homeColumns);
    expect(findByTestId(renderer, "practice-tab")).toBeTruthy();
    expect(findByTestId(renderer, "settings-tab")).toBeTruthy();
    if (sideRail) {
      const rail = findByTestId(renderer, "navigation-rail");
      expect(rail).toBeTruthy();
      expect(flattenTestStyle(rail.props.style).width).toBe(railWidth);
    } else {
      expect(() => findByTestId(renderer, "navigation-rail")).toThrow();
    }

    startStandardSprint(renderer);

    const board = findByTestId(renderer, "session-board");
    const boardStyle = flattenTestStyle(board.props.style);
    expect(board).toBeTruthy();
    expect(boardStyle.width).toBe(boardSize);
    expect(boardStyle.height).toBe(boardSize);
    expect(findByTestId(renderer, "session-score-strip")).toBeTruthy();
    expect(findByTestId(renderer, "practice-prompt")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-prompt"))).toContain("Find the best move");
    if (sessionRail) {
      expect(findByTestId(renderer, "active-session-adaptive-layout")).toBeTruthy();
      expect(findByTestId(renderer, "active-session-board-lane")).toBeTruthy();
      expect(findByTestId(renderer, "active-session-control-rail")).toBeTruthy();
    } else {
      expect(() => findByTestId(renderer, "active-session-adaptive-layout")).toThrow();
    }
  });

  it("reserves vertical session chrome inside a foldable landscape viewport", () => {
    const densityScale = 420 / 160;
    const viewportHeight = 1768 / densityScale;
    const reservedSessionChrome = 120;
    (ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: { fontScale: number; height: number; scale: number; width: number }) => void;
    }).__setWindowDimensions?.({
      width: 2208 / densityScale,
      height: viewportHeight,
      scale: densityScale,
      fontScale: 1
    });

    const renderer = renderScreen({ practiceService: createMobilePracticeService("familiar15") });
    startStandardSprint(renderer);

    expect(findByTestId(renderer, "adaptive-layout").props.accessibilityLabel)
      .toBe("Layout regularLandscape");
    expect(findByTestId(renderer, "active-session-control-rail")).toBeTruthy();
    const boardSize = Number(flattenTestStyle(findByTestId(renderer, "session-board").props.style).height);
    expect(boardSize + reservedSessionChrome).toBeLessThanOrEqual(viewportHeight);
  });

  it.each([
    { fontScale: 1, label: "phone portrait", topInset: 24 },
    { fontScale: 1.5, label: "large-text phone portrait", topInset: 32 }
  ])("keeps session actions below the Android status bar on $label", ({ fontScale, topInset }) => {
    (ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: { fontScale: number; height: number; scale: number; width: number }) => void;
    }).__setWindowDimensions?.({ width: 412, height: 914, scale: 2.625, fontScale });
    (SafeAreaContext as unknown as {
      __setSafeAreaInsets?: (insets: { bottom: number; left: number; right: number; top: number }) => void;
    }).__setSafeAreaInsets?.({ top: topInset, right: 0, bottom: 24, left: 0 });

    const renderer = renderScreen({ practiceService: createMobilePracticeService("familiar15") });
    startStandardSprint(renderer);

    const safeAreaShell = renderer.root.find((node) => (
      node.props.testID === "safe-area-shell" || String(node.type) === "SafeAreaView"
    ));
    expect(flattenTestStyle(safeAreaShell.props.style).paddingTop).toBe(topInset);
    const pause = findByTestId(renderer, "session-pause");
    expect(pause.props.accessibilityRole).toBe("button");
    expect(Number(flattenTestStyle(pause.props.style).height)).toBeGreaterThanOrEqual(48);
  });

  it("stacks the review board and analysis panel on an iPad in portrait", () => {
    (ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: { fontScale: number; height: number; scale: number; width: number }) => void;
    }).__setWindowDimensions?.({ width: 1032, height: 1376, scale: 2, fontScale: 1 });

    const renderer = renderScreen({
      currentTimeMs: () => Date.parse("2026-06-20T12:00:00.000Z"),
      practiceService: createDueReviewService(1)
    });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");

    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(flattenTestStyle(findByTestId(renderer, "review-analysis-panel").props.style).width).toBeUndefined();
  });

  it.each([
    { actionContainer: "review-context-actions-bottom", height: 932, label: "phone portrait", width: 430 },
    { actionContainer: "review-context-actions-rail", height: 390, label: "phone landscape", width: 844 },
    { actionContainer: "review-context-actions-rail", height: 820, label: "iPad landscape", width: 1180 }
  ])("places History Review actions in the available $label layout", ({ actionContainer, height, width }) => {
    (ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: { fontScale: number; height: number; scale: number; width: number }) => void;
    }).__setWindowDimensions?.({ width, height, scale: 2, fontScale: 1 });

    const renderer = renderScreen({
      currentTimeMs: () => Date.parse("2026-07-17T12:02:00.000Z"),
      practiceService: createUnclearHistoryReviewService()
    });
    press(renderer, "history-tab");
    press(renderer, "history-attempt-responsive-unclear-attempt");

    const actions = findByTestId(renderer, actionContainer);
    expect(actions.findByProps({ testID: "review-schedule-control" })).toBeTruthy();
    expect(actions.findByProps({ testID: "history-attempt-unclear" })).toBeTruthy();
  });

  it("preserves the active sprint across a live resize", () => {
    const service = createMobilePracticeService("familiar15");
    (ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: { fontScale: number; height: number; scale: number; width: number }) => void;
    }).__setWindowDimensions?.({ width: 430, height: 932, scale: 3, fontScale: 1 });
    const renderer = renderScreen({ practiceService: service });

    startStandardSprint(renderer);
    const sprintId = activeSprintForTest(service).id;
    const puzzleId = activeSprintForTest(service).currentPuzzle?.puzzle.id;
    expect(() => findByTestId(renderer, "session-accessible-moves-open")).toThrow();

    act(() => {
      (ReactNative as unknown as {
        __setWindowDimensions?: (dimensions: { fontScale: number; height: number; scale: number; width: number }) => void;
      }).__setWindowDimensions?.({ width: 844, height: 390, scale: 3, fontScale: 1 });
    });

    expect(findByTestId(renderer, "adaptive-layout").props.accessibilityLabel).toBe("Layout compactLandscape");
    expect(activeSprintForTest(service).id).toBe(sprintId);
    expect(activeSprintForTest(service).currentPuzzle?.puzzle.id).toBe(puzzleId);
    expect(() => findByTestId(renderer, "session-accessible-moves-open")).toThrow();
    expect(findByTestId(renderer, "active-session-control-rail")).toBeTruthy();
  });

  it("removes the Sprint Moves action and centers its title", () => {
    const renderer = renderScreen({ practiceService: createMobilePracticeService("familiar15") });

    startStandardSprint(renderer);

    expect(() => findByTestId(renderer, "session-accessible-moves-open")).toThrow();
    expect(flattenTestStyle(findByTestId(renderer, "session-nav-actions").props.style).width).toBe(
      flattenTestStyle(findByTestId(renderer, "session-abandon").props.style).width
    );
  });

  it("keeps board geometry inside narrow resizable windows and reserves room for large text", () => {
    (ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: { fontScale: number; height: number; scale: number; width: number }) => void;
    }).__setWindowDimensions?.({ width: 280, height: 700, scale: 2, fontScale: 1 });
    const narrowRenderer = renderScreen({ practiceService: createMobilePracticeService("familiar15") });
    startStandardSprint(narrowRenderer);
    expect(flattenTestStyle(findByTestId(narrowRenderer, "session-board").props.style).width).toBeLessThanOrEqual(248);

    act(() => {
      (ReactNative as unknown as {
        __setWindowDimensions?: (dimensions: { fontScale: number; height: number; scale: number; width: number }) => void;
      }).__setWindowDimensions?.({ width: 1032, height: 1376, scale: 2, fontScale: 2 });
    });
    const largeTextRenderer = renderScreen({ practiceService: createMobilePracticeService("familiar15") });
    expect(flattenTestStyle(findByTestId(largeTextRenderer, "navigation-rail").props.style).width).toBe(76);
    expect(styleEntryMatches(findByTestId(largeTextRenderer, "practice-home-layout").props.style, "flexDirection", "row")).toBe(false);
    startStandardSprint(largeTextRenderer);
    expect(flattenTestStyle(findByTestId(largeTextRenderer, "session-board").props.style).width).toBeLessThanOrEqual(860);
  });

  it("advances Review analysis through the board without mutating review records", async () => {
    const now = "2026-06-20T12:00:00.000Z";
    const service = createDueReviewService(1);
    service.recordReviewAttempt({
      puzzleId: "review-badge-0",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "wrong",
      submittedMove: "e2e3",
      expectedMove: "e2e4",
      startedAt: "2026-06-20T11:00:00.000Z"
    }, "2026-06-20T11:00:05.000Z");
    const renderer = renderScreen({
      currentTimeMs: () => Date.parse(now),
      practiceService: service
    });
    press(renderer, "review-tab");
    const completedReview = renderer.root.find((node) =>
      typeof node.props.testID === "string"
        && node.props.testID.startsWith("review-today-attempt-")
        && node.props.accessibilityRole === "button"
    );
    act(() => completedReview.props.onPress());

    expect(findByTestId(renderer, "review-board").props.accessibilityRole).toBe("image");
    expect(findByTestId(renderer, "review-announcement").props.accessibilityLiveRegion).toBe("polite");
    expect(() => findByTestId(renderer, "history-attempt-detail")).toThrow();
    const reviewRecordsBeforeAnalysis = {
      dueItems: service.getDueReviewItems(now),
      history: service.listHistory(),
      queue: service.listReviewQueue(),
      ratings: service.listRatings()
    };
    press(renderer, "review-analysis-button");
    const analysisStartFen = findByTestId(renderer, "mock-chessboard").props.fen;
    const announcementBeforeMove = findByTestId(renderer, "review-announcement").props.accessibilityLabel;

    expect(() => findByTestId(renderer, "review-accessible-moves-open")).toThrow();
    const legalAnalysisMove = new Chess(analysisStartFen).moves({ verbose: true })[0];
    if (!legalAnalysisMove) {
      throw new Error("Expected at least one legal Analysis move");
    }
    const legalAnalysisMoveFrom = legalAnalysisMove.from;
    const legalAnalysisMoveTo = legalAnalysisMove.to;
    const legalAnalysisMoveUci = `${legalAnalysisMoveFrom}${legalAnalysisMoveTo}${legalAnalysisMove.promotion ?? ""}`;
    const expectedAnalysisPosition = new Chess(analysisStartFen);
    expect(expectedAnalysisPosition.move({
      from: legalAnalysisMoveFrom,
      to: legalAnalysisMoveTo,
      ...(legalAnalysisMove.promotion ? { promotion: legalAnalysisMove.promotion } : {})
    })).toBeTruthy();
    const expectedAnalysisSide = expectedAnalysisPosition.turn() === "w" ? "White" : "Black";

    await boardMove(renderer, legalAnalysisMoveUci);

    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(expectedAnalysisPosition.fen());
    expect(findByTestId(renderer, "mock-chessboard").props.fen).not.toBe(analysisStartFen);
    expect(findByTestId(renderer, "review-board").props.accessibilityLabel).toBe(
      `Chess board. ${expectedAnalysisSide} to move. Last move ${legalAnalysisMoveFrom} to ${legalAnalysisMoveTo}`
    );
    expect(findByTestId(renderer, "review-announcement").props.accessibilityLabel).toBe(
      `Analysis Local hint. ${expectedAnalysisSide} to move. Last move ${legalAnalysisMoveFrom} to ${legalAnalysisMoveTo}.`
    );
    expect(findByTestId(renderer, "review-announcement").props.accessibilityLabel).not.toBe(announcementBeforeMove);
    expect(() => findByTestId(renderer, "history-attempt-detail")).toThrow();
    expect({
      dueItems: service.getDueReviewItems(now),
      history: service.listHistory(),
      queue: service.listReviewQueue(),
      ratings: service.listRatings()
    }).toEqual(reviewRecordsBeforeAnalysis);
  });

  it.each([
    { label: "phone portrait", width: 430, height: 932 },
    { label: "phone landscape", width: 844, height: 390 },
    { label: "tablet portrait", width: 820, height: 1180 },
    { label: "tablet landscape", width: 1180, height: 820 }
  ])("keeps Custom, History, Review, reminders, backup, and Settings reachable on $label", ({ width, height }) => {
    (ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: { fontScale: number; height: number; scale: number; width: number }) => void;
    }).__setWindowDimensions?.({ width, height, scale: 2, fontScale: 1 });
    const renderer = renderScreen({
      practiceService: createDueReviewService(1),
      progressProtection: { kind: "android_managed_backup" }
    });

    press(renderer, "practice-mode-custom");
    expect(findByTestId(renderer, "custom-sprint-setup")).toBeTruthy();
    press(renderer, "custom-close");
    press(renderer, "history-tab");
    expect(findByTestId(renderer, "history-panel")).toBeTruthy();
    press(renderer, "review-tab");
    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
    press(renderer, "settings-tab");
    expect(findByTestId(renderer, "settings-panel")).toBeTruthy();
    expect(findByTestId(renderer, "settings-review-reminders")).toBeTruthy();
    expect(findByTestId(renderer, "settings-android-backup-section")).toBeTruthy();
  });

  it("summarizes recent local practice progress on the Practice home", () => {
    const service = createMobilePracticeService("familiar15");
    const startedAt = new Date(Date.now() - 120_000).toISOString();
    const completedAt = new Date(Date.now() - 60_000).toISOString();
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 1, maxMistakes: 3 },
      startedAt
    );
    service.submitMove("c2b1", completedAt);

    const renderer = renderScreen({ practiceService: service });

    expect(findByTestId(renderer, "practice-progress-summary")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-solved"))).toBe("1");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-delta"))).toBe("+1 net");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-context"))).toBe("100% accuracy · 0 mistakes");
    expect(collectText(findByTestId(renderer, "practice-progress-rating-delta"))).toMatch(/^\+\d+ this week$/);
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toMatch(/rating \+\d+ this week/);
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toContain("100% accuracy · 0 mistakes");
    expect(hasStyleEntry(findByTestId(renderer, "practice-progress-rating-delta"), "color", "#16A34A")).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "practice-progress-weekly-delta"), "color", "#16A34A")).toBe(true);
  });

  it("shows a persisted Custom config's weekly progress after relaunch", async () => {
    const nowMs = Date.parse("2026-07-14T12:00:00.000Z");
    const store = new MemoryStore();
    store.seedPuzzles([androidPracticeFixture.puzzle as Puzzle]);
    const service = new PracticeService(store);
    const firstRenderer = renderScreen({
      currentTimeMs: () => nowMs,
      customTargetCorrect: 1,
      practiceService: service
    });

    press(firstRenderer, "practice-mode-custom");
    press(firstRenderer, "custom-theme-fork");
    press(firstRenderer, "custom-duration-stepper-decrease");
    press(firstRenderer, "custom-per-puzzle-stepper-increase");
    press(firstRenderer, "start-sprint-button");
    await boardMove(firstRenderer, androidPracticeFixture.userMoves[0]);
    await settleFeedbackSnapshot();
    await boardMove(firstRenderer, androidPracticeFixture.userMoves[1]);
    await settleFeedbackSnapshot();
    expect(findByTestId(firstRenderer, "sprint-summary-panel")).toBeTruthy();

    act(() => {
      firstRenderer.unmount();
    });
    const firstRendererIndex = renderers.indexOf(firstRenderer);
    if (firstRendererIndex >= 0) {
      renderers.splice(firstRendererIndex, 1);
    }

    const renderer = renderScreen({
      currentTimeMs: () => nowMs + 5 * 60_000,
      practiceService: new PracticeService(store)
    });
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-solved"))).toBe("0");

    press(renderer, "practice-mode-custom");
    press(renderer, "custom-previous-custom-custom-180-30-fork");

    expect(findByTestId(renderer, "custom-sprint-setup")).toBeTruthy();
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toContain("ELO 775");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-solved"))).toBe("1");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-delta"))).toBe("+1 net");
    expect(collectText(findByTestId(renderer, "practice-progress-rating-delta"))).toBe("+175 this week");
  });

  it("surfaces negative weekly practice progress without hiding mistakes", () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 15, maxMistakes: 3 },
      new Date(Date.now() - 120_000).toISOString()
    );
    service.submitMove("c4b5", new Date(Date.now() - 60_000).toISOString());

    const renderer = renderScreen({ practiceService: service });

    expect(collectText(findByTestId(renderer, "practice-progress-weekly-solved"))).toBe("0");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-delta"))).toBe("-1 net");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-context"))).toBe("0% accuracy · 1 mistake");
    expect(collectText(findByTestId(renderer, "practice-progress-rating-delta"))).toBe("No rating change");
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toContain("rating No rating change");
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toContain("0% accuracy · 1 mistake");
    expect(hasStyleEntry(findByTestId(renderer, "practice-progress-rating-delta"), "color", "#64748B")).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "practice-progress-weekly-delta"), "color", "#DC2626")).toBe(true);
  });

  it("starts a selected sprint from the explicit header action", () => {
    const renderer = renderScreen({ practiceService: createMobilePracticeService("familiar15") });

    expect(() => findByTestId(renderer, "session-loading-skeleton")).toThrow();
    press(renderer, "practice-start-button");

    expect(() => findByTestId(renderer, "session-loading-skeleton")).toThrow();
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(testIdOrder(renderer, "session-board", "session-score-strip")).toBeLessThan(0);
    expect(testIdOrder(renderer, "session-score-strip", "practice-prompt")).toBeLessThan(0);
    expect(findByTestId(renderer, "session-score-strip").props.accessibilityLabel).toBe("Session score: solved 0, mistakes 0, left 15");
    expect(findByTestId(renderer, "session-score-positive-glyph")).toBeTruthy();
    expect(findByTestId(renderer, "session-score-negative-glyph")).toBeTruthy();
    expect(findByTestId(renderer, "session-score-neutral-glyph")).toBeTruthy();
    expect(findByTestId(renderer, "session-score-solved").props.accessibilityLabel).toBe("Solved 0");
    expect(findByTestId(renderer, "session-score-mistakes").props.accessibilityLabel).toBe("Mistakes 0");
    expect(findByTestId(renderer, "session-score-left").props.accessibilityLabel).toBe("Left 15");
    expect(collectText(findByTestId(renderer, "session-score-solved-value"))).toBe("0");
    expect(collectText(findByTestId(renderer, "session-score-mistakes-value"))).toBe("0");
    expect(collectText(findByTestId(renderer, "session-score-left-value"))).toBe("15");
    expect(styleEntryMatches(findByTestId(renderer, "session-status-metrics").props.style, "borderWidth", 1)).toBe(false);
    expect(findByTestId(renderer, "session-progress-block")).toBeTruthy();
    expect(findByTestId(renderer, "session-timer-block")).toBeTruthy();
    expect(findByTestId(renderer, "session-side-to-move-block")).toBeTruthy();
    expect(findByTestId(renderer, "session-mistakes-block")).toBeTruthy();
    expect(findByTestId(renderer, "session-progress-block").props.accessibilityLabel).toBe("Progress 0 of 15");
    expect(findByTestId(renderer, "session-timer-block").props.accessibilityLabel).toContain("Timer");
    expect(findByTestId(renderer, "session-side-to-move-block").props.accessibilityLabel).toBe("White to move");
    expect(findByTestId(renderer, "session-side-to-move").props.accessibilityLabel).toBe("White to move");
    expect(findByTestId(renderer, "move-side-white-glyph")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-side-to-move-label"))).toBe("White");
    expect(findByTestId(renderer, "session-mistakes-block").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(findByTestId(renderer, "session-mistakes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(collectText(findByTestId(renderer, "session-mistakes"))).toBe("");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).toBe("0015");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).not.toContain("Solved");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).not.toContain("Mistakes");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).not.toContain("Left");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).not.toContain("✓");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).not.toContain("×");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).not.toContain("○");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("Progress");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("Timer");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("Mistakes");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("ELO");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("0/3");
    expect(collectText(findByTestId(renderer, "session-progress"))).toBe("0 / 15");
    expect(styleEntryMatches(findByTestId(renderer, "practice-prompt").props.style, "borderWidth", 1)).toBe(false);
    expect(collectText(findByTestId(renderer, "practice-prompt-icon"))).toBe("");
    expectText(renderer, "Find the best move");
  });

  it("starts a sprint on the injected clock used by store screenshots", () => {
    const nowMs = Date.parse("2026-07-09T18:00:00.000Z");
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({
      currentTimeMs: () => nowMs,
      practiceService: service
    });

    startStandardSprint(renderer);

    const activeSprint = activeSprintForTest(service);
    expect(activeSprint.startedAt).toBe(new Date(nowMs).toISOString());
    expect(activeSprint.deadlineAt).toBe(new Date(nowMs + 5 * 60 * 1000).toISOString());
    expect(collectText(findByTestId(renderer, "session-timer"))).toBe("05:00");
  });

  it("keeps the native session board and its handlers stable across timer ticks and puzzle advances", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    const initialBoard = findByTestId(renderer, "mock-chessboard");
    expect(initialBoard.props.gestureEnabled).toBe(true);
    expect(initialBoard.props.draggableColor).toBeNull();
    const initialProps = {
      colors: initialBoard.props.colors,
      durations: initialBoard.props.durations,
      mockResetBoard: initialBoard.props.mockResetBoard,
      onIllegalMove: initialBoard.props.onIllegalMove,
      onMove: initialBoard.props.onMove
    };

    act(() => {
      jest.advanceTimersByTime(1_500);
    });

    const boardAfterTimerTicks = findByTestId(renderer, "mock-chessboard");
    expect(boardAfterTimerTicks.props).toEqual(expect.objectContaining(initialProps));

    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");
    await settleFeedbackSnapshot();

    const boardAfterPuzzleAdvance = findByTestId(renderer, "mock-chessboard");
    expect(boardAfterPuzzleAdvance.props.mockResetBoard).toBe(initialProps.mockResetBoard);
    expect(boardAfterPuzzleAdvance.props.onIllegalMove).toBe(initialProps.onIllegalMove);
    expect(boardAfterPuzzleAdvance.props.onMove).toBe(initialProps.onMove);
    expectText(renderer, "1 / 15");
  });

  it("keeps the native board mounted across an adaptive size change without replacing the active puzzle", () => {
    const windowDimensions = ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: {
        fontScale: number;
        height: number;
        scale: number;
        width: number;
      }) => void;
    };
    windowDimensions.__setWindowDimensions?.({
      width: 430,
      height: 932,
      scale: 3,
      fontScale: 1
    });
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service });

    startStandardSprint(renderer);
    const portraitSessionBoard = findByTestId(renderer, "session-board");
    const portraitBoard = findByTestId(renderer, "mock-chessboard");
    const portraitCoordinateOverlay = findByTestId(renderer, "board-coordinate-overlay");
    const activePuzzleId = activeSprintForTest(service).currentPuzzle?.puzzle.id;
    const activeFen = portraitBoard.props.fen;
    const portraitResetBoard = portraitBoard.props.mockResetBoard;
    const portraitOnIllegalMove = portraitBoard.props.onIllegalMove;
    const portraitOnMove = portraitBoard.props.onMove;

    expect(renderedTestIdCount(renderer, "stacked-session-layout")).toBe(1);
    expect(renderedSessionBoardAccessibilityCount(renderer)).toBe(1);
    expect(renderedTestIdCount(renderer, "mock-chessboard")).toBe(1);
    expect(renderedTestIdCount(renderer, "board-coordinate-overlay")).toBe(1);
    expect(portraitBoard.props.gestureEnabled).toBe(true);
    expect(portraitBoard.props.draggableColor).toBeNull();
    expect(() => findByTestId(renderer, "active-session-control-rail")).toThrow();

    act(() => {
      windowDimensions.__setWindowDimensions?.({
        width: 844,
        height: 390,
        scale: 3,
        fontScale: 1
      });
    });

    const landscapeSessionBoard = findByTestId(renderer, "session-board");
    const landscapeBoard = findByTestId(renderer, "mock-chessboard");
    const landscapeCoordinateOverlay = findByTestId(renderer, "board-coordinate-overlay");
    expect(findByTestId(renderer, "adaptive-layout").props.accessibilityLabel)
      .toBe("Layout compactLandscape");
    expect(renderedTestIdCount(renderer, "stacked-session-layout")).toBe(0);
    expect(renderedTestIdCount(renderer, "active-session-adaptive-layout")).toBe(1);
    expect(renderedSessionBoardAccessibilityCount(renderer)).toBe(1);
    expect(renderedTestIdCount(renderer, "mock-chessboard")).toBe(1);
    expect(renderedTestIdCount(renderer, "board-coordinate-overlay")).toBe(1);
    expect(landscapeSessionBoard).toBe(portraitSessionBoard);
    expect(landscapeCoordinateOverlay).toBe(portraitCoordinateOverlay);
    expect(landscapeBoard.props.boardSize).toBe(358);
    expect(landscapeBoard.props.fen).toBe(activeFen);
    expect(activeSprintForTest(service).currentPuzzle?.puzzle.id).toBe(activePuzzleId);
    expect(landscapeBoard.props.mockResetBoard).toBe(portraitResetBoard);
    expect(landscapeBoard.props.onIllegalMove).toBe(portraitOnIllegalMove);
    expect(landscapeBoard.props.onMove).toBe(portraitOnMove);
    expect(landscapeBoard.props.gestureEnabled).toBe(true);
    expect(landscapeBoard.props.draggableColor).toBeNull();
    expect(findByTestId(renderer, "active-session-adaptive-layout")).toBeTruthy();
    expect(findByTestId(renderer, "active-session-board-lane")).toBeTruthy();
    expect(findByTestId(renderer, "active-session-control-rail")).toBeTruthy();
    expect(renderedTestIdCount(renderer, "active-session-control-rail")).toBe(1);
    expect(renderedTestIdCount(renderer, "session-score-strip")).toBe(1);
    expect(renderedTestIdCount(renderer, "practice-prompt")).toBe(1);
  });

  it("does not leave an empty session layout item on idle, Custom setup, or Sprint Result", () => {
    const renderer = renderScreen({ practiceService: createMobilePracticeService("familiar15") });

    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
    expectNoSessionLayoutResidue(renderer);

    press(renderer, "practice-mode-custom");
    expect(findByTestId(renderer, "custom-sprint-setup")).toBeTruthy();
    expectNoSessionLayoutResidue(renderer);

    const resultRenderer = renderStandardSequenceScreen();
    startStandardSprint(resultRenderer);
    act(() => {
      jest.advanceTimersByTime(301_000);
    });

    expect(findByTestId(resultRenderer, "sprint-summary-panel")).toBeTruthy();
    expectNoSessionLayoutResidue(resultRenderer);
  });

  it("keeps the stable native board synchronized across the Familiar 15 failure sequence", async () => {
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service });

    startStandardSprint(renderer);
    const stableBoardReset = findByTestId(renderer, "mock-chessboard").props.mockResetBoard;
    await boardMove(renderer, "c2b3");
    const secondPuzzleFen = activeSprintForTest(service).currentPuzzle?.currentFen;
    expect(secondPuzzleFen).toBeTruthy();
    expect(stableBoardReset).not.toHaveBeenCalledWith(secondPuzzleFen);
    await settleFeedbackSnapshot();
    expect(stableBoardReset).toHaveBeenCalledWith(secondPuzzleFen);
    expect(stableBoardReset).toHaveBeenCalledTimes(1);
    await boardMove(renderer, "c4b5");
    const thirdPuzzleFen = activeSprintForTest(service).currentPuzzle?.currentFen;
    expect(thirdPuzzleFen).toBeTruthy();
    expect(stableBoardReset).not.toHaveBeenCalledWith(thirdPuzzleFen);
    await settleFeedbackSnapshot();
    expect(stableBoardReset).toHaveBeenCalledWith(thirdPuzzleFen);
    expect(stableBoardReset).toHaveBeenCalledTimes(2);

    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(findByTestId(renderer, "mock-chessboard").props.mockResetBoard).toBe(stableBoardReset);
    expect(() => findByTestId(renderer, "error-panel")).toThrow();
    await boardMove(renderer, "g6g5");
    await settleFeedbackSnapshot();

    expectText(renderer, "Sprint failed");
    expect(collectText(findByTestId(renderer, "sprint-result-reason"))).toBe("Three mistakes");
  });

  it("offers resume before starting a new sprint when the service has an active session", () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 15, maxMistakes: 3 },
      new Date(Date.now()).toISOString()
    );
    const renderer = renderScreen({ practiceService: service });

    expect(findByTestId(renderer, "practice-resume-card")).toBeTruthy();
    expect(testIdOrder(renderer, "practice-resume-card", "practice-mode-standard")).toBeLessThan(0);
    expect(collectText(findByTestId(renderer, "practice-resume-card"))).toContain("Resume sprint");
    expect(collectText(findByTestId(renderer, "practice-resume-card"))).toContain("Standard · 0 solved · 15 left · 0 mistakes");
    expect(() => findByTestId(renderer, "session-board")).toThrow();

    press(renderer, "practice-resume-card");
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-progress"))).toBe("0 / 15");
    expect(() => findByTestId(renderer, "practice-resume-card")).toThrow();
  });

  it("opens custom setup from the compact custom row instead of starting a scored sprint", () => {
    const renderer = renderScreen({ practiceService: createMobilePracticeService("familiar15") });

    press(renderer, "practice-mode-custom");

    expect(findByTestId(renderer, "custom-sprint-setup")).toBeTruthy();
    expect(() => findByTestId(renderer, "session-board")).toThrow();
    expect(() => findByTestId(renderer, "rating-label")).toThrow();
    expect(collectText(findByTestId(renderer, "custom-close"))).toBe("");
    expectText(renderer, "Custom Sprint");
    expect(flattenTestStyle(findByTestId(renderer, "custom-action-header").props.style).minHeight).toBe(40);
    expect(flattenTestStyle(findByTestId(renderer, "custom-header-title").props.style).fontSize).toBe(17);
    expect(flattenTestStyle(findByTestId(renderer, "start-sprint-button").props.style).height).toBe(40);
    expect(collectText(findByTestId(renderer, "custom-sprint-setup"))).not.toContain("Time, theme, rating");
  });

  it("seeds the release bundled core pack by default to avoid exhausted fixture sprints", () => {
    const service = createMobilePracticeService();
    const manifest = getBundledCorePackManifest();

    expect(seededPuzzleCount()).toBe(manifest.puzzleCount);
    if (manifest.format !== "sqlite") {
      expect(seededUniquePositionCount()).toBe(seededPuzzleCount());
    }
    expect(manifest.rating.min).toBe(600);
    expect(manifest.rating.max).toBeLessThanOrEqual(2200);
    expect(manifest.arrowDuelCount).toBeGreaterThanOrEqual(Math.min(2000, manifest.puzzleCount));

    const state = service.startSprint({
      mode: "custom",
      durationSeconds: 1200,
      perPuzzleSeconds: 20
    });

    expect(state.config.targetCorrect).toBe(60);
    expect(state.puzzles.length).toBe(fixtureNeedsAtLeast(state.config));
  });

  it("keeps test-only puzzle source controls off injected production-like services", () => {
    const renderer = renderScreen({ practiceService: createMobilePracticeService() });

    expect(() => findByTestId(renderer, "test-puzzle-source-control")).toThrow();
  });

  it("can switch test builds between core and familiar puzzle sources", () => {
    const renderer = renderScreen();
    const familiarService = createMobilePracticeService("familiar15");

    expect(findByTestId(renderer, "test-puzzle-source-control")).toBeTruthy();
    const bundledPuzzleLabel = formatTestWholeNumber(seededPuzzleCount());
    const rawBundledPuzzleLabel = String(seededPuzzleCount());
    expect(collectText(renderer.root)).not.toContain(`Offline-ready · ${bundledPuzzleLabel} puzzles`);
    expect(findByTestId(renderer, "app-shell-header").props.accessibilityLabel).toContain(`Offline-ready · ${rawBundledPuzzleLabel} puzzles`);
    expect(hasStyleEntry(findByTestId(renderer, "test-puzzle-source-bundledCore"), "borderColor", "#2563EB")).toBe(true);
    expect(() => findByTestId(renderer, "test-puzzle-source-random1000")).toThrow();

    press(renderer, "test-puzzle-source-familiar15");
    expect(findByTestId(renderer, "app-shell-header").props.accessibilityLabel).toContain("Offline-ready · 15 puzzles");
    expect(hasStyleEntry(findByTestId(renderer, "test-puzzle-source-familiar15"), "borderColor", "#2563EB")).toBe(true);
    expect(() => findByTestId(renderer, "test-puzzle-source-promotionSample")).toThrow();
    expect(seededPuzzleCount("familiar15")).toBe(15);
    expect(familiarService.getPuzzle("04Phf")?.themes).toContain("promotion");

    press(renderer, "test-puzzle-source-bundledCore");
    expect(findByTestId(renderer, "app-shell-header").props.accessibilityLabel).toContain(`Offline-ready · ${rawBundledPuzzleLabel} puzzles`);
    expect(hasStyleEntry(findByTestId(renderer, "test-puzzle-source-bundledCore"), "borderColor", "#2563EB")).toBe(true);
  });

  it("keeps the same backend service when switching test puzzle sources", () => {
    const service = createMobilePracticeService();
    service.setRating("standard 5/20", 625);
    const practiceServiceFactory = jest.fn(() => service);
    const renderer = renderScreen({ practiceServiceFactory });

    expect(practiceServiceFactory).toHaveBeenCalledTimes(1);
    expect(collectText(findByTestId(renderer, "practice-mode-standard-rating"))).toBe("ELO 625");

    press(renderer, "test-puzzle-source-familiar15");
    expect(practiceServiceFactory).toHaveBeenCalledTimes(1);
    expect(collectText(findByTestId(renderer, "practice-mode-standard-rating"))).toBe("ELO 625");

    press(renderer, "test-puzzle-source-bundledCore");
    expect(practiceServiceFactory).toHaveBeenCalledTimes(1);
    expect(collectText(findByTestId(renderer, "practice-mode-standard-rating"))).toBe("ELO 625");
  });

  it("configures the selected test puzzle source before the next render", () => {
    const service = createMobilePracticeService();
    const configurePuzzleSource = jest.fn();
    const renderer = renderScreen({
      practiceServiceFactory: () => service,
      configurePuzzleSource
    });
    configurePuzzleSource.mockClear();

    act(() => {
      findByTestId(renderer, "test-puzzle-source-familiar15").props.onPress();
      expect(configurePuzzleSource).toHaveBeenCalledWith(service, "familiar15");
    });
  });

  it("randomizes core pack sprint starts while keeping Familiar 15 deterministic", () => {
    const coreService = createMobilePracticeService();
    const coreStartSprintSpy = jest.spyOn(coreService, "startSprint");
    const familiarService = createMobilePracticeService();
    const familiarStartSprintSpy = jest.spyOn(familiarService, "startSprint");
    const dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(1_789_000_000);
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.314159);
    const startedAt = new Date(1_789_000_000).toISOString();

    try {
      const coreRenderer = renderScreen({ practiceServiceFactory: () => coreService });
      startStandardSprint(coreRenderer);
      expect(coreStartSprintSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        puzzleSelectionSeed: "1789000000-0.314159"
      }), startedAt);

      const familiarRenderer = renderScreen({ practiceServiceFactory: () => familiarService });
      press(familiarRenderer, "test-puzzle-source-familiar15");
      startStandardSprint(familiarRenderer);
      expect(familiarStartSprintSpy).toHaveBeenLastCalledWith(expect.not.objectContaining({
        puzzleSelectionSeed: expect.anything()
      }), startedAt);
    } finally {
      dateNowSpy.mockRestore();
      randomSpy.mockRestore();
    }
  });

  it("uses maintained native journey overrides for a bounded deterministic bundled Core Pack sprint", () => {
    const service = createMobilePracticeService();
    const renderer = renderScreen({
      practiceServiceFactory: () => service,
      puzzleSelectionSeed: "android-standard-practice",
      standardTargetCorrect: 1
    });

    startStandardSprint(renderer);

    expect(findByTestId(renderer, "session-side-to-move").props.accessible).toBe(true);
    expect(findByTestId(renderer, "session-side-to-move").props.accessibilityLabel).toBe("Black to move");
    expect(collectText(findByTestId(renderer, "session-side-to-move-label"))).toBe("Black");
    expect(findByTestId(renderer, "session-progress-block").props.accessibilityLabel).toBe("Progress 0 of 1");
  });

  it("uses the maintained native Arrow Duel target for a bounded completion journey", async () => {
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({
      practiceService: service,
      arrowDuelTargetCorrect: 1
    });
    const arrow = firstArrowDuelPuzzleForTest();

    startArrowDuelSprint(renderer);

    expect(findByTestId(renderer, "session-progress-block").props.accessibilityLabel).toBe("Progress 0 of 1");
    await boardMove(renderer, arrow.correctMove);
    await settleFeedbackSnapshot();
    expectText(renderer, "Sprint complete");
    expect(collectText(findByTestId(renderer, "sprint-result-solved"))).toContain("1 / 1");
  });

  it("keeps a deterministic Custom target inside the selected shared configuration", () => {
    const service = createMobilePracticeService();
    const renderer = renderScreen({
      customTargetCorrect: 1,
      practiceService: service,
      puzzleSelectionSeed: androidPracticeFixture.puzzleSelectionSeed
    });

    press(renderer, "practice-mode-custom");
    press(renderer, "custom-duration-stepper-decrease");
    press(renderer, "custom-per-puzzle-stepper-increase");
    press(renderer, "custom-theme-fork");
    press(renderer, "start-sprint-button");

    expect(service.getActiveSprint()?.config).toMatchObject({
      durationSeconds: 180,
      maxMistakes: 3,
      mode: "custom",
      perPuzzleSeconds: 30,
      ratingKey: "fork custom 3/30",
      targetCorrect: 1,
      themes: ["fork"]
    });
    expect(service.getActiveSprint()?.currentPuzzle?.puzzle).toMatchObject({
      id: androidPracticeFixture.puzzle.id,
      solutionMoves: androidPracticeFixture.puzzle.solutionMoves
    });
    expect(findByTestId(renderer, "session-progress-block").props.accessibilityLabel).toBe("Progress 0 of 1");
  });

  it("accepts a non-official legal checkmate in the fixed first familiar puzzle", async () => {
    const renderer = renderScreen({ practiceService: createMobilePracticeService("familiar15") });

    startStandardSprint(renderer);
    expect(collectText(findByTestId(renderer, "practice-prompt"))).toContain("Find the best move");
    expect(collectText(findByTestId(renderer, "practice-prompt"))).toContain("For white.");
    expectText(renderer, "0 / 15");

    await boardMove(renderer, "c2b1");

    expect(() => findByTestId(renderer, "mock-promotion-dialog")).toThrow();
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expectText(renderer, "1 / 15");
    expectSessionMistakes(renderer, 0);

    await settleFeedbackSnapshot();
    expectText(renderer, "1 / 15");

    abandonSprint(renderer);
    press(renderer, "history-tab");
    expectHistoryRowAccessibility(renderer, "Move c2b1");
  });

  it("submits standard puzzle moves through the board and records attempt history", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    const board = findByTestId(renderer, "mock-chessboard");
    const fenBeforeAutoReply = board.props.fen;
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(countPiecesInFen(board.props.fen)).toBeGreaterThan(0);
    expect(board.props.spriteSource).toBeTruthy();
    expect(board.props.colors.white).toBe("#E6E8EB");
    expect(board.props.colors.black).toBe("#7B8794");
    expect(board.props.colors.lastMoveHighlight).toBe("rgba(0, 0, 0, 0)");
    expect(board.props.colors.validMoveDot).toBe("rgba(15, 23, 42, 0.36)");
    expect(board.props.colors.validMoveCapture).toBe("rgba(15, 23, 42, 0.56)");
    expect(board.props.draggableColor).toBeNull();
    expect(board.props.withLetters).toBe(false);
    expect(board.props.withNumbers).toBe(false);
    expect(collectText(findByTestId(renderer, "board-coordinate-overlay"))).toContain("abcdefgh");
    expect(collectText(findByTestId(renderer, "board-coordinate-overlay"))).toContain("87654321");
    expect(findByTestId(renderer, "active-session-shell")).toBeTruthy();
    expect(findByTestId(renderer, "session-shell-nav")).toBeTruthy();
    expect(findByTestId(renderer, "session-status-metrics")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("Progress");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("Timer");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("ELO");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).toContain("White");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("Mistakes");
    expect(findByTestId(renderer, "session-progress-block").props.accessibilityLabel).toBe("Progress 0 of 15");
    expect(findByTestId(renderer, "session-timer-block").props.accessibilityLabel).toContain("Timer");
    expect(findByTestId(renderer, "session-side-to-move-block").props.accessibilityLabel).toBe("White to move");
    expect(findByTestId(renderer, "session-side-to-move").props.accessibilityLabel).toBe("White to move");
    expect(findByTestId(renderer, "move-side-white-glyph")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-side-to-move-label"))).toBe("White");
    expect(findByTestId(renderer, "session-mistakes-block").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(collectText(findByTestId(renderer, "session-mistakes"))).toBe("");
    expect(findByTestId(renderer, "session-pause")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-abandon"))).toBe("");
    expect(collectText(findByTestId(renderer, "session-pause"))).toBe("");
    expect(collectText(findByTestId(renderer, "session-shell-nav"))).not.toContain("×");
    expect(collectText(findByTestId(renderer, "session-shell-nav"))).not.toContain("•••");
    expect(findByTestId(renderer, "session-timer")).toBeTruthy();
    expect(findByTestId(renderer, "session-progress")).toBeTruthy();
    expect(findByTestId(renderer, "session-side-to-move")).toBeTruthy();
    expect(() => findByTestId(renderer, "session-strikes")).toThrow();
    expect(findByTestId(renderer, "session-mistakes")).toBeTruthy();
    expect(findByTestId(renderer, "session-mistakes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(collectText(findByTestId(renderer, "session-mistakes"))).toBe("");
    expect(findByTestId(renderer, "session-mistake-dot-0")).toBeTruthy();
    expectSessionMistakes(renderer, 0);
    expect(findByTestId(renderer, "session-abandon").props.accessibilityLabel).toBe("Abandon sprint");
    press(renderer, "session-abandon");
    expect(findByTestId(renderer, "session-abandon-confirmation")).toBeTruthy();
    expectText(renderer, "Abandon sprint?");
    press(renderer, "session-abandon-cancel");
    expect(() => findByTestId(renderer, "session-abandon-confirmation")).toThrow();
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(collectText(renderer.root)).not.toContain("Expected move");
    expect(collectText(renderer.root)).not.toContain("000hf · 1485");

    await boardMove(renderer, "e2e6");
    expect(collectText(renderer.root)).not.toContain("Correct");
    expect(collectText(renderer.root)).not.toContain("Incorrect");
    expectSessionMistakes(renderer, 0);
    expect(findByTestId(renderer, "mock-chessboard").props.fen)
      .toBe(mustFenAfterMove(fenBeforeAutoReply, "e2e6"));
    expect(findByTestId(renderer, "session-side-to-move").props.accessibilityLabel).toBe("Black to move");
    expect(collectText(findByTestId(renderer, "session-side-to-move-label"))).toBe("Black");
    // The opponent-reply window keeps the board interactive for premoves; only
    // the surrounding scroll view is frozen so fast drags cannot pan the screen.
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBeNull();
    expect(() => findByTestId(renderer, "board-input-blocker")).toThrow();
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(false);
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "move-feedback-overlay"), "borderWidth", 2)).toBe(false);

    await settleFeedbackSnapshot();
    expect(findByTestId(renderer, "mock-chessboard").props.fen).not.toBe(fenBeforeAutoReply);
    expect(findByTestId(renderer, "session-side-to-move").props.accessibilityLabel).toBe("White to move");
    expect(collectText(findByTestId(renderer, "session-side-to-move-label"))).toBe("White");
    expect(findByTestId(renderer, "session-last-move-overlay").props.accessibilityRole).toBe("image");
    expect(findByTestId(renderer, "session-last-move-overlay").props.accessibilityLabel).toBe("Last move f7 to f8");
    expect(findByTestId(renderer, "session-board").props.accessible).toBe(true);
    expect(findByTestId(renderer, "session-board").props.accessibilityRole).toBe("image");
    expect(findByTestId(renderer, "session-board").props.accessibilityLabel)
      .toBe("Chess board. White to move. Last move f7 to f8");
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBeNull();
    expect(() => findByTestId(renderer, "board-input-blocker")).toThrow();
    // The page never scrolls while the session board is on screen.
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(false);
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(false);
    expect(countStyleValue(renderer.root, "rgba(37, 99, 235, 0.3)")).toBeGreaterThanOrEqual(2);

    await boardMove(renderer, "e6f7");
    expectSessionMistakes(renderer, 0);
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(countStyleValue(renderer.root, "rgba(37, 99, 235, 0.3)")).toBe(0);
    await settleFeedbackSnapshot();

    abandonSprint(renderer);
    press(renderer, "history-tab");
    expectHistoryRowAccessibility(renderer, "Move e6f7");
    expect(collectText(renderer.root)).not.toContain("000hf · standard");
  });

  it("shows a persistence failure and unlocks board input through the store boundary", async () => {
    const service = new PracticeService(new FailingAttemptStore("Practice write failed"));
    configureMobilePracticePuzzleSource(service, "random1000");
    const renderer = renderScreen({ practiceService: service });

    startStandardSprint(renderer);

    await boardMove(renderer, "e2d2");

    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(collectText(findByTestId(renderer, "error-panel"))).toContain("Practice write failed");
    abandonSprint(renderer);
    press(renderer, "history-tab");
    expect(findByTestId(renderer, "history-empty-state").props.accessibilityLabel).toBe("History has no attempts");
    expect(collectText(findByTestId(renderer, "history-empty-state"))).toBe("No attempts");
    expect(historyAttemptRows(renderer)).toHaveLength(0);
  });

  it("keeps the practice page from scrolling while the session board is on screen", async () => {
    const renderer = renderStandardSequenceScreen();

    // The idle practice screen scrolls normally.
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);

    startStandardSprint(renderer);

    // The user's regular turn: the board is interactive and unlocked. A drag
    // can begin here — or begin during a lock window and survive into this
    // state — and must pan pieces, never the page, so the surrounding scroll
    // stays frozen for the whole session.
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(() => findByTestId(renderer, "board-input-blocker")).toThrow();
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(false);

    // The freeze persists through a move, the opponent-reply window, and back
    // to the next turn.
    await boardMove(renderer, "e2e6");
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(false);
    await settleFeedbackSnapshot();
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(false);

    // Leaving the session restores scrolling.
    abandonSprint(renderer);
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);
  });

  it("pauses an active sprint with explicit resume controls", () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    expect(findByTestId(renderer, "session-board")).toBeTruthy();

    press(renderer, "session-pause");
    expect(findByTestId(renderer, "paused-session-panel")).toBeTruthy();
    expectText(renderer, "Sprint paused");
    expect(() => findByTestId(renderer, "session-board")).toThrow();
    expect(() => findByTestId(renderer, "sprint-summary-panel")).toThrow();

    press(renderer, "paused-session-resume");
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
  });

  it("preserves the countdown after resuming from a pause longer than the remaining sprint", () => {
    let wallClockMs = Date.parse("2026-06-20T00:00:00.000Z");
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 15, maxMistakes: 3 },
      new Date(wallClockMs).toISOString()
    );
    const renderer = renderScreen({
      currentTimeMs: () => wallClockMs,
      practiceService: service
    });

    press(renderer, "practice-resume-card");
    act(() => {
      wallClockMs += 10_000;
      jest.advanceTimersByTime(500);
    });
    expect(collectText(findByTestId(renderer, "session-timer"))).toBe("04:50");

    press(renderer, "session-pause");
    expect(findByTestId(renderer, "paused-session-panel")).toBeTruthy();

    act(() => {
      wallClockMs += 10 * 60_000;
      jest.advanceTimersByTime(10 * 60_000);
    });
    expect(collectText(findByTestId(renderer, "session-timer"))).toBe("04:50");

    press(renderer, "paused-session-resume");
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-timer"))).toBe("04:50");

    act(() => {
      wallClockMs += 1_000;
      jest.advanceTimersByTime(1_000);
    });
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-timer"))).toBe("04:49");
    expect(() => findByTestId(renderer, "sprint-summary-panel")).toThrow();
  });

  it("queues a user move made during the opponent reply and submits it once the reply settles", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderStandardSequenceScreen({ debugTrace: (event) => trace.push(event) });

    startStandardSprint(renderer);

    await boardMove(renderer, "e2e6");
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBeNull();
    expect(() => findByTestId(renderer, "board-input-blocker")).toThrow();
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(false);
    expectText(renderer, "0 / 15");

    await boardMoveWithCallback(
      findByTestId(renderer, "mock-chessboard").props.onMove,
      "e6f7",
      null
    );

    expect(trace.some((event) =>
      event.type === "premove-queued" &&
      event.move === "e6f7"
    )).toBe(true);
    expectText(renderer, "0 / 15");

    await settleFeedbackSnapshot();

    expect(trace.some((event) =>
      event.type === "premove-replay" &&
      event.move === "e6f7"
    )).toBe(true);
    expectText(renderer, "1 / 15");
    expectSessionMistakes(renderer, 0);
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(findByTestId(renderer, "board-input-blocker")).toBeTruthy();
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(false);

    await settleFeedbackSnapshot();

    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBeNull();
    // The page never scrolls while the session board is on screen.
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(false);
    expectSessionMistakes(renderer, 0);
  });

  it("plays a premove attempted before the opponent reply reaches the board", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderStandardSequenceScreen({ debugTrace: (event) => trace.push(event) });

    startStandardSprint(renderer);

    await boardMove(renderer, "e2e6");
    expectText(renderer, "0 / 15");

    // The mock board still has the opponent to move, so this drop is rejected
    // by the board and reaches the screen through onIllegalMove — the same
    // path a real drag takes before the reply lands.
    await boardMove(renderer, "e6f7");
    expect(trace.some((event) =>
      event.type === "premove-queued" &&
      event.reason === "pending-board" &&
      event.move === "e6f7"
    )).toBe(true);
    expectText(renderer, "0 / 15");

    await settleFeedbackSnapshot();

    expectText(renderer, "1 / 15");
    expectSessionMistakes(renderer, 0);
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
  });

  it("keeps only the latest playable premove queued during an opponent reply", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderStandardSequenceScreen({ debugTrace: (event) => trace.push(event) });

    startStandardSprint(renderer);
    await boardMove(renderer, "e2e6");

    await boardMove(renderer, "e6e5");
    await boardMove(renderer, "e6f7");

    await settleFeedbackSnapshot();

    expect(trace.some((event) =>
      event.type === "premove-replay" &&
      event.move === "e6f7"
    )).toBe(true);
    expect(trace.some((event) =>
      event.type === "premove-replay" &&
      event.move === "e6e5"
    )).toBe(false);
    expectText(renderer, "1 / 15");
    expectSessionMistakes(renderer, 0);
  });

  it("does not let a junk drag evict a queued premove", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderStandardSequenceScreen({ debugTrace: (event) => trace.push(event) });

    startStandardSprint(renderer);
    await boardMove(renderer, "e2e6");

    // Queue the real premove, then brush a square pair that can never be
    // legal in the reply position.
    await boardMove(renderer, "e6f7");
    act(() => {
      findByTestId(renderer, "mock-chessboard").props.onIllegalMove("d8", "a8");
    });

    expect(trace.some((event) =>
      event.type === "move-ignored" &&
      event.reason === "premove-illegal-intent" &&
      event.move === "d8a8"
    )).toBe(true);

    await settleFeedbackSnapshot();

    expect(trace.some((event) =>
      event.type === "premove-replay" &&
      event.move === "e6f7"
    )).toBe(true);
    expectText(renderer, "1 / 15");
    expectSessionMistakes(renderer, 0);
  });

  it("still discards moves arriving during a hard lock instead of queueing them", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderStandardSequenceScreen({ debugTrace: (event) => trace.push(event) });

    startStandardSprint(renderer);
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();

    // A wrong move advances to the next puzzle behind a feedback-snapshot
    // hard lock. The native handler stays mounted, while the input blocker
    // and the JS lock guard reject touches and callback races.
    await boardMove(renderer, "e6d7");
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "board-input-blocker")).toBeTruthy();

    act(() => {
      findByTestId(renderer, "mock-chessboard").props.onIllegalMove("e6", "f7");
    });

    expect(trace.some((event) =>
      event.type === "move-ignored" &&
      event.reason === "board-locked-illegal-move" &&
      event.move === "e6f7"
    )).toBe(true);
    expect(trace.some((event) => event.type === "premove-queued")).toBe(false);

    await settleFeedbackSnapshot();
    expect(trace.some((event) => event.type === "premove-replay")).toBe(false);
    expectSessionMistakes(renderer, 1);
  });

  it("discards opponent-piece drags during the opponent reply animation", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderStandardSequenceScreen({ debugTrace: (event) => trace.push(event) });

    startStandardSprint(renderer);
    const firstBoard = findByTestId(renderer, "mock-chessboard");
    const firstPuzzleFen = firstBoard.props.fen;
    await boardMove(renderer, "e2e6");

    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBeNull();
    await boardMoveWithCallback(
      findByTestId(renderer, "mock-chessboard").props.onMove,
      "f7e8",
      mustFenAfterMove(mustFenAfterMove(firstPuzzleFen, "e2e6"), "f7e8")
    );

    expectSessionMistakes(renderer, 0);
    await settleFeedbackSnapshot();

    // An opponent-piece move queued during the reply is illegal once the reply
    // position is on the board, so it is dropped instead of submitted.
    expect(trace.some((event) =>
      event.type === "move-ignored" &&
      event.reason === "premove-not-legal" &&
      event.move === "f7e8"
    )).toBe(true);
    expect(trace.some((event) =>
      event.type === "board-reset" &&
      event.reason === "premove-not-legal" &&
      event.move === "f7e8"
    )).toBe(true);
    expectText(renderer, "0 / 15");

    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");

    expectSessionMistakes(renderer, 0);
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
  });

  it("drops illegal drags during the opponent reply without stalling the board", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderStandardSequenceScreen({ debugTrace: (event) => trace.push(event) });

    startStandardSprint(renderer);
    await boardMove(renderer, "e2e6");

    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBeNull();
    act(() => {
      findByTestId(renderer, "mock-chessboard").props.onIllegalMove("d8", "a8");
    });

    expectSessionMistakes(renderer, 0);
    // A drag that can never be legal in the reply position is swallowed at
    // queue time instead of becoming a queued premove.
    expect(trace.some((event) =>
      event.type === "move-ignored" &&
      event.reason === "premove-illegal-intent" &&
      event.move === "d8a8"
    )).toBe(true);
    expect(trace.some((event) => event.type === "premove-queued")).toBe(false);

    await settleFeedbackSnapshot();

    expect(trace.some((event) => event.type === "premove-replay")).toBe(false);
    expectText(renderer, "0 / 15");
    await boardMove(renderer, "e6f7");

    expectSessionMistakes(renderer, 0);
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
  });

  it("does not count animated opponent replies as user mistakes", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    await boardMove(renderer, "e2e6");

    expect(collectText(renderer.root)).not.toContain("Correct");
    expect(collectText(renderer.root)).not.toContain("Incorrect");
    expectSessionMistakes(renderer, 0);

    await settleFeedbackSnapshot();

    abandonSprint(renderer);
    press(renderer, "history-tab");
    expectText(renderer, "No attempts");
  });

  it("treats per-puzzle seconds as target pace rather than a hard timeout", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    act(() => {
      jest.advanceTimersByTime(25_000);
    });

    await boardMove(renderer, "e2e6");

    expectSessionMistakes(renderer, 0);
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(false);
  });

  it("plays the first seven standard puzzles without ignored move callbacks or missing feedback", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderStandardSequenceScreen({ debugTrace: (event) => trace.push(event) });
    const firstSevenStandardUserMoves = [
      "e2e6",
      "e6f7",
      "f4g3",
      "a2a1",
      "a1d1",
      "c2c6",
      "c1c6",
      "d2c4",
      "f2h2",
      "g1h2",
      "b5c7",
      "f4c7",
      "e3e8",
      "e8b8",
      "b8f8"
    ];

    startStandardSprint(renderer);

    for (const move of firstSevenStandardUserMoves) {
      expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
      await boardMove(renderer, move);
      expectSessionMistakes(renderer, 0);
      expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
      expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
      expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(false);
      await settleFeedbackSnapshot();
    }

    expectText(renderer, "7 / 15");
    expect(
      trace.filter((event) =>
        event.type === "fen-mismatch" ||
        (event.type === "move-ignored" && event.reason !== "suppressed-auto-move")
      )
    ).toEqual([]);
    expect(trace.filter((event) => event.type === "move-submitted")).toHaveLength(firstSevenStandardUserMoves.length);
    expect(trace.filter((event) => event.type === "move-submitted").every((event) => event.feedbackResult === "correct")).toBe(true);
  });

  it("shows red feedback for a wrong second move in a multi-step standard puzzle", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();

    await boardMove(renderer, "e6d7");

    expectSessionMistakes(renderer, 1);
    expect(findByTestId(renderer, "session-mistakes").props.accessibilityLabel).toBe("Mistakes 1 of 3");
    expect(collectText(findByTestId(renderer, "session-mistakes"))).toBe("");
    expect(hasStyleEntry(findByTestId(renderer, "session-mistake-dot-0"), "backgroundColor", "#DC2626")).toBe(true);
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(true);
    expect(countStyleValue(renderer.root, "rgba(37, 99, 235, 0.3)")).toBe(0);

    abandonSprint(renderer);
    press(renderer, "history-tab");
    expectHistoryRowAccessibility(renderer, "Played e6d7 · Best e6f7");
  });

  it("uses neutral Arrow Duel board markers without separate A/B choice chips", () => {
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service });

    startArrowDuelSprint(renderer);
    const arrow = requireArrowDuelState(activeSprintForTest(service));

    expect(findByTestId(renderer, "mock-chessboard").props.flipped).toBe(new Chess(arrow.currentFen).turn() === "b");
    expect(collectText(renderer.root)).not.toContain("Choose one candidate move");
    expect(() => findByTestId(renderer, "arrow-duel-candidates")).toThrow();
    expect(() => findByTestId(renderer, "arrow-duel-candidate-a")).toThrow();
    expect(() => findByTestId(renderer, "arrow-duel-candidate-b")).toThrow();
    const accessibleCandidateOverlay = renderer.root
      .findAllByProps({ testID: "arrow-duel-candidate-overlay" })
      .find((node) => node.props.accessible === true);
    expect(accessibleCandidateOverlay?.props.accessibilityLabel)
      .toBe(`Arrow Duel candidates: ${arrow.candidates.join(", ")}`);
    expect(collectText(findByTestId(renderer, "practice-prompt-icon"))).toBe("");
    expect(testIdOrder(renderer, "session-board", "session-score-strip")).toBeLessThan(0);
    expect(testIdOrder(renderer, "session-score-strip", "practice-prompt")).toBeLessThan(0);
    expect(findByTestId(renderer, "session-score-strip").props.accessibilityLabel).toBe("Session score: solved 0, mistakes 0, left 10");
    expect(collectText(findByTestId(renderer, "session-score-left-value"))).toBe("10");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).toBe("0010");
    expect(collectText(findByTestId(renderer, "practice-prompt"))).toContain("Choose the best move");
    expect(collectText(findByTestId(renderer, "practice-prompt"))).toContain("between the two arrows");
    expectText(renderer, "Watch for checks, captures, and attacks!");
    const neutralArrowBodies = countStyleEntry(findByTestId(renderer, "session-board"), "backgroundColor", "#2563EB");
    expect(neutralArrowBodies).toBeGreaterThan(0);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "borderLeftColor", "#2563EB")).toBe(neutralArrowBodies);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "opacity", 0.68)).toBe(neutralArrowBodies * 2);
    expect(hasStyleValue(findByTestId(renderer, "session-board"), "#DC2626")).toBe(false);
  });

  it("advances Arrow Duel after a correct board move", async () => {
    const renderer = renderScreen({ practiceService: createMobilePracticeService("familiar15") });
    const arrow = firstArrowDuelPuzzleForTest();

    startArrowDuelSprint(renderer);

    await boardMove(renderer, arrow.correctMove);

    expectText(renderer, "1 / 10");
    expect(collectText(renderer.root)).not.toContain("Correct");
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "backgroundColor", "#16A34A")).toBe(0);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "borderLeftColor", "#16A34A")).toBe(0);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "backgroundColor", "#DC2626")).toBe(0);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "borderLeftColor", "#DC2626")).toBe(0);
    expect(() => findByTestId(renderer, "feedback-panel")).toThrow();
    await settleFeedbackSnapshot();
  });

  it("ignores non-candidate Arrow Duel board moves without recording attempts", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderScreen({
      debugTrace: (event) => trace.push(event),
      practiceService: createMobilePracticeService("familiar15")
    });
    const arrow = firstArrowDuelPuzzleForTest();

    startArrowDuelSprint(renderer);

    const boardFen = findByTestId(renderer, "mock-chessboard").props.fen;
    const nonCandidate = firstLegalNonCandidate(boardFen, arrow.candidates);

    await boardMove(renderer, nonCandidate);

    expectText(renderer, "0 / 10");
    expectSessionMistakes(renderer, 0);
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(boardFen);
    expect(() => findByTestId(renderer, "move-feedback-overlay")).toThrow();
    expect(collectText(renderer.root)).not.toContain("Incorrect");
    expect(collectText(renderer.root)).not.toContain("expected d8a5");
    expect(trace.some((event) => event.type === "move-ignored" && event.reason === "arrow-duel-non-candidate")).toBe(true);

    abandonSprint(renderer);
    press(renderer, "history-tab");
    expectText(renderer, "No attempts");
  });

  it("ignores illegal Standard board moves without recording attempts", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);

    const boardFen = findByTestId(renderer, "mock-chessboard").props.fen;

    await boardMove(renderer, "a1a8");

    expectText(renderer, "0 / 15");
    expectSessionMistakes(renderer, 0);
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(boardFen);
    expect(() => findByTestId(renderer, "move-feedback-overlay")).toThrow();
    expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(false);

    abandonSprint(renderer);
    press(renderer, "history-tab");
    expectText(renderer, "No attempts");
  });

  it("starts a custom sprint with the selected time control", () => {
    const renderer = renderScreen();

    press(renderer, "test-puzzle-source-familiar15");
    press(renderer, "practice-mode-custom");
    expect(findByTestId(renderer, "custom-sprint-setup")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "custom-sprint-setup"))).not.toContain("Time, theme, rating");
    expect(() => findByTestId(renderer, "practice-home")).toThrow();
    expect(findByTestId(renderer, "custom-config-list")).toBeTruthy();
    expect(findByTestId(renderer, "custom-pack-warning")).toBeTruthy();
    expect(() => findByTestId(renderer, "custom-broaden-theme")).toThrow();
    expect(collectText(findByTestId(renderer, "custom-pack-warning"))).toContain("15 eligible puzzles");
    expect(collectText(findByTestId(renderer, "custom-pack-warning"))).toContain("up to 18");
    expect(findByTestId(renderer, "start-sprint-button").props.accessibilityState).toEqual({ disabled: false });
    expect(findByTestId(renderer, "start-sprint-button").props.disabled).toBe(false);
    expect(findByTestId(renderer, "custom-mode-row")).toBeTruthy();
    expect(findByTestId(renderer, "custom-mode-regular").props.accessibilityState).toEqual({ selected: true });
    expect(findByTestId(renderer, "custom-mode-arrow-duel").props.accessibilityState).toEqual({ selected: false });
    expect(findByTestId(renderer, "custom-mode-regular").props.accessibilityLabel).toBe("Regular Puzzles custom sprint mode, Board moves");
    expect(collectText(findByTestId(renderer, "custom-mode-row"))).not.toContain("Board moves");
    expect(collectText(findByTestId(renderer, "custom-mode-row"))).not.toContain("Two candidates");
    expect(findByTestId(renderer, "custom-theme-row")).toBeTruthy();
    expect(findByTestId(renderer, "custom-theme-fork")).toBeTruthy();
    expect(findByTestId(renderer, "custom-theme-hanging-piece")).toBeTruthy();
    expect(findByTestId(renderer, "custom-theme-fork").props.accessibilityLabel).toBe("Fork puzzle theme");
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).not.toContain("Theme");
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("Sacrifice");
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("Promotion");
    expect(() => findByTestId(renderer, "custom-summary-card")).toThrow();
    expect(collectText(findByTestId(renderer, "custom-summary-target"))).toBe("Estimated puzzles~15");
    expect(findByTestId(renderer, "custom-initial-rating-row")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "custom-initial-rating-value"))).toBe("ELO 600");
    expect(findByTestId(renderer, "custom-initial-rating-stepper-decrease").props.accessibilityState).toEqual({ disabled: true });
    expect(findByTestId(renderer, "custom-initial-rating-stepper-increase").props.accessibilityState).toEqual({ disabled: false });
    expect(() => findByTestId(renderer, "custom-summary-rating-range")).toThrow();
    expect(() => findByTestId(renderer, "custom-mode-summary")).toThrow();
    expect(() => findByTestId(renderer, "custom-mistake-limit")).toThrow();
    expect(findByTestId(renderer, "custom-previous-configs")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "custom-target-count"))).toBe("~15");
    expect(() => findByTestId(renderer, "custom-target-row")).toThrow();
    expect(() => findByTestId(renderer, "custom-rating-range")).toThrow();
    expect(() => findByTestId(renderer, "custom-current-rating")).toThrow();
    expect(collectText(findByTestId(renderer, "custom-config-list"))).not.toContain("Current rating");
    expect(collectText(findByTestId(renderer, "custom-config-list"))).not.toContain("separate bucket");
    expect(findByTestId(renderer, "custom-previous-empty")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "custom-previous-empty"))).toContain("Start a custom sprint");
    expect(() => findByTestId(renderer, "custom-include-arrow-duel")).toThrow();
    expect(findByTestId(renderer, "custom-duration-stepper")).toBeTruthy();
    expect(findByTestId(renderer, "custom-per-puzzle-stepper")).toBeTruthy();
    expect(findByTestId(renderer, "custom-initial-rating-stepper")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "custom-duration-stepper-decrease"))).toBe("");
    expect(collectText(findByTestId(renderer, "custom-duration-stepper-increase"))).toBe("");
    expect(collectText(findByTestId(renderer, "custom-per-puzzle-stepper-decrease"))).toBe("");
    expect(collectText(findByTestId(renderer, "custom-per-puzzle-stepper-increase"))).toBe("");
    expect(collectText(findByTestId(renderer, "custom-initial-rating-stepper-decrease"))).toBe("");
    expect(collectText(findByTestId(renderer, "custom-initial-rating-stepper-increase"))).toBe("");
    expect(collectText(findByTestId(renderer, "custom-config-list"))).not.toContain("−");
    expect(collectText(findByTestId(renderer, "custom-config-list"))).not.toContain("＋");
    expect(collectText(findByTestId(renderer, "custom-config-list"))).not.toContain("›");
    expect(collectText(findByTestId(renderer, "custom-config-list"))).not.toContain("Allowed values");
    expect(() => findByTestId(renderer, "custom-mistake-limit-stepper")).toThrow();
    press(renderer, "custom-theme-mate");
    expectText(renderer, "Mate");
    expect(() => findByTestId(renderer, "custom-broaden-theme")).toThrow();
    press(renderer, "custom-theme-fork");
    expect(themeSelected(renderer, "mate")).toBe(true);
    expect(themeSelected(renderer, "fork")).toBe(true);
    press(renderer, "custom-theme-mate");
    expect(themeSelected(renderer, "mate")).toBe(false);
    expect(themeSelected(renderer, "fork")).toBe(true);
    press(renderer, "custom-theme-mixed");
    expect(themeSelected(renderer, "mixed")).toBe(true);
    expect(themeSelected(renderer, "fork")).toBe(false);
    press(renderer, "custom-theme-mate");
    press(renderer, "custom-mode-arrow-duel");
    expect(findByTestId(renderer, "custom-mode-regular").props.accessibilityState).toEqual({ selected: false });
    expect(findByTestId(renderer, "custom-mode-arrow-duel").props.accessibilityState).toEqual({ selected: true });
    press(renderer, "custom-mode-regular");
    expect(findByTestId(renderer, "custom-mode-regular").props.accessibilityState).toEqual({ selected: true });
    expect(findByTestId(renderer, "custom-mode-arrow-duel").props.accessibilityState).toEqual({ selected: false });
    expect(collectText(findByTestId(renderer, "custom-target-count"))).toBe("~15");

    press(renderer, "custom-duration-stepper-decrease");
    expect(collectText(findByTestId(renderer, "custom-target-count"))).toBe("~9");
    expect(findByTestId(renderer, "custom-duration-stepper-decrease").props.accessibilityState).toEqual({ disabled: true });
    press(renderer, "custom-per-puzzle-stepper-increase");

    expect(collectText(findByTestId(renderer, "custom-target-count"))).toBe("~6");
    expect(collectText(findByTestId(renderer, "custom-config-list"))).not.toContain("custom 3/30");
    expect(findByTestId(renderer, "start-sprint-button").props.accessibilityState).toEqual({ disabled: false });

    press(renderer, "start-sprint-button");

    expectText(renderer, "Custom");
    expectText(renderer, "0 / 6");
  });

  it("previews multiple theme selection inside the complete Custom Sprint setup", () => {
    const renderer = renderMultiThemeSetupScreen(["fork"]);

    press(renderer, "practice-mode-custom");
    expect(findByTestId(renderer, "custom-sprint-setup")).toBeTruthy();
    expect(findByTestId(renderer, "custom-duration-stepper")).toBeTruthy();
    expect(findByTestId(renderer, "custom-initial-rating-row")).toBeTruthy();
    expect(findByTestId(renderer, "custom-previous-configs")).toBeTruthy();
    expect(themeSelected(renderer, "fork")).toBe(true);
    expect(themeSelected(renderer, "mate")).toBe(false);
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("All");
    expect(() => findByTestId(renderer, "custom-broaden-theme")).toThrow();

    press(renderer, "custom-theme-mate");
    expect(themeSelected(renderer, "fork")).toBe(true);
    expect(themeSelected(renderer, "mate")).toBe(true);
    expect(() => findByTestId(renderer, "custom-broaden-theme")).toThrow();

    press(renderer, "custom-theme-fork");
    expect(themeSelected(renderer, "fork")).toBe(false);
    expect(themeSelected(renderer, "mate")).toBe(true);

    press(renderer, "custom-theme-mate");
    expect(themeSelected(renderer, "mate")).toBe(false);
    expect(themeSelected(renderer, "mixed")).toBe(true);

    press(renderer, "custom-theme-mixed");
    expect(themeSelected(renderer, "mixed")).toBe(true);

    press(renderer, "custom-theme-fork");
    expect(themeSelected(renderer, "mixed")).toBe(false);
    expect(themeSelected(renderer, "fork")).toBe(true);

    press(renderer, "custom-theme-mixed");
    expect(themeSelected(renderer, "mixed")).toBe(true);
    expect(themeSelected(renderer, "fork")).toBe(false);
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Use Mixed");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Use All");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("✓");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Targeting");
  });

  it("renders and toggles every injected theme in the selected grouped catalog", () => {
    const renderer = renderScreen({
      themeCatalogPresentation: {
        groups: [
          { label: "Checkmates", themes: ["mateIn4", "backRankMate"] },
          { label: "Piece tactics", themes: ["fork", "capturingDefender"] }
        ]
      }
    });

    press(renderer, "practice-mode-custom");
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("Capturing Defender");
    expect(findByTestId(renderer, "custom-theme-mate-in-4")).toBeTruthy();
    press(renderer, "custom-theme-mate-in-4");
    expect(themeSelected(renderer, "mate-in-4")).toBe(true);
    expect(themeSelected(renderer, "mixed")).toBe(false);
    press(renderer, "custom-theme-mate-in-4");
    expect(themeSelected(renderer, "mixed")).toBe(true);
  });

  it("starts and persists the production Custom Sprint with every selected theme", () => {
    const service = createMobilePracticeService("random1000");
    const renderer = renderScreen({
      customTargetCorrect: 1,
      practiceService: service,
      puzzleSelectionSeed: "multi-theme-production"
    });

    press(renderer, "practice-mode-custom");
    expect(themeSelected(renderer, "mixed")).toBe(true);
    press(renderer, "custom-theme-mate");
    press(renderer, "custom-theme-fork");
    expect(themeSelected(renderer, "mixed")).toBe(false);
    expect(themeSelected(renderer, "mate")).toBe(true);
    expect(themeSelected(renderer, "fork")).toBe(true);

    press(renderer, "start-sprint-button");

    expect(service.getActiveSprint()?.config.themes).toEqual(["fork", "mate"]);
    expect(service.getActiveSprint()?.config.ratingKey).toBe("fork+mate custom 5/20");
    expect(service.listCustomSprintConfigs()[0]).toMatchObject({
      themes: ["fork", "mate"],
      ratingKey: "fork+mate custom 5/20"
    });
  });

  it("renders All as the selected non-empty fallback for an empty multi-theme value", () => {
    const renderer = renderMultiThemeSetupScreen([]);

    press(renderer, "practice-mode-custom");
    const allThemes = findByTestId(renderer, "custom-theme-mixed");
    expect(allThemes.props.accessibilityRole).toBe("button");
    expect(allThemes.props.accessibilityLabel).toBe("All puzzle themes");
    expect(allThemes.props.accessibilityState).toEqual({ selected: true });

    press(renderer, "custom-theme-mixed");
    expect(themeSelected(renderer, "mixed")).toBe(true);
  });

  it("shows persisted previous custom sprint configs and can reuse one", () => {
    const service = createMobilePracticeService("familiar15");
    const savedSprint = service.startSprint(
      {
        mode: "custom",
        durationSeconds: 3 * 60,
        perPuzzleSeconds: 30,
        targetCorrect: 6,
        maxMistakes: 3,
        themes: ["mate"],
        persistCustomConfig: true
      },
      "2026-06-20T00:00:00.000Z"
    );
    service.abandonSprint("2026-06-20T00:00:05.000Z");
    service.setRating(savedSprint.config.ratingKey, 850);
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "practice-mode-custom");

    expect(collectText(findByTestId(renderer, "custom-previous-custom-custom-180-30-mate-meta"))).toContain("Mate · 3 min · 30s pace · Last");
    expect(findByTestId(renderer, "custom-previous-custom-custom-180-30-mate").props.accessibilityLabel).toContain("Use Custom · 30s pace custom sprint");
    expect(findByTestId(renderer, "custom-previous-custom-custom-180-30-mate").props.accessibilityLabel).toContain("ELO 850");
    press(renderer, "custom-previous-custom-custom-180-30-mate");
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("Mate");
    expect(collectText(findByTestId(renderer, "custom-target-count"))).toBe("~6");
    expect(collectText(findByTestId(renderer, "custom-initial-rating-value"))).toBe("ELO 850");
  });

  it("keeps multiple previous custom configs attached to their own ELO buckets", () => {
    const store = new MemoryStore();
    store.seedPuzzles([sharedHistoryPuzzle()]);
    store.saveCustomSprintConfig({
      id: "custom-custom-180-30-mate",
      mode: "custom",
      ratingKey: "mate custom 3/30",
      durationSeconds: 180,
      perPuzzleSeconds: 30,
      targetCorrect: 6,
      maxMistakes: 3,
      themes: ["mate"],
      lastStartedAt: "2026-07-07T00:00:00.000Z",
      playCount: 2
    });
    store.saveRating({
      key: "mate custom 3/30",
      generation: 0,
      rating: 875,
      games: 2
    });
    store.saveCustomSprintConfig({
      id: "custom-custom-300-20-fork",
      mode: "custom",
      ratingKey: "fork custom 5/20",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 15,
      maxMistakes: 3,
      themes: ["fork"],
      lastStartedAt: "2026-07-06T00:00:00.000Z",
      playCount: 1
    });
    store.saveRating({
      key: "fork custom 5/20",
      generation: 0,
      rating: 1025,
      games: 1
    });
    store.saveCustomSprintConfig({
      id: "custom-custom-300-20-fork+mate",
      mode: "custom",
      ratingKey: "fork+mate custom 5/20",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 15,
      maxMistakes: 3,
      themes: ["fork", "mate"],
      lastStartedAt: "2026-07-05T00:00:00.000Z",
      playCount: 1
    });
    store.saveRating({
      key: "fork+mate custom 5/20",
      generation: 0,
      rating: 1100,
      games: 1
    });
    const renderer = renderScreen({ practiceService: new PracticeService(store) });

    press(renderer, "practice-mode-custom");

    const mateConfig = findByTestId(renderer, "custom-previous-custom-custom-180-30-mate");
    const forkConfig = findByTestId(renderer, "custom-previous-custom-custom-300-20-fork");
    const multiConfig = findByTestId(renderer, "custom-previous-custom-custom-300-20-fork-mate");
    expect(collectText(mateConfig)).toContain("875");
    expect(mateConfig.props.accessibilityLabel).toContain("ELO 875");
    expect(collectText(forkConfig)).toContain("1025");
    expect(forkConfig.props.accessibilityLabel).toContain("ELO 1025");
    expect(collectText(multiConfig)).toContain("Mate, Fork");
    expect(multiConfig.props.accessibilityLabel).toContain("ELO 1100");

    press(renderer, "custom-previous-custom-custom-180-30-mate");
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("Mate");
    expect(collectText(findByTestId(renderer, "custom-target-count"))).toBe("~6");
    expect(collectText(findByTestId(renderer, "custom-initial-rating-value"))).toBe("ELO 875");

    press(renderer, "custom-previous-custom-custom-300-20-fork");
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("Fork");
    expect(collectText(findByTestId(renderer, "custom-target-count"))).toBe("~15");
    expect(collectText(findByTestId(renderer, "custom-initial-rating-value"))).toBe("ELO 1025");

    press(renderer, "custom-previous-custom-custom-300-20-fork-mate");
    expect(themeSelected(renderer, "mixed")).toBe(false);
    expect(themeSelected(renderer, "fork")).toBe(true);
    expect(themeSelected(renderer, "mate")).toBe(true);
    expect(collectText(findByTestId(renderer, "custom-initial-rating-value"))).toBe("ELO 1100");
  });

  it("keeps played custom ELO editable as a difficulty control", () => {
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "practice-mode-custom");
    press(renderer, "custom-initial-rating-stepper-increase");
    press(renderer, "custom-initial-rating-stepper-increase");
    expect(collectText(findByTestId(renderer, "custom-initial-rating-value"))).toBe("ELO 800");

    press(renderer, "start-sprint-button");
    expect(activeSprintForTest(service).ratingBefore).toBe(800);

    const playedStore = new MemoryStore();
    playedStore.seedPuzzles([sharedHistoryPuzzle()]);
    playedStore.saveRating({
      key: "custom 5/20",
      generation: 0,
      rating: 900,
      ratingDeviation: 180,
      volatility: 0.05,
      games: 1
    });
    playedStore.createSprintSession(completedRatingSprintState({
      id: "played-custom",
      mode: "custom",
      completedAt: "2026-07-07T00:00:05.000Z",
      ratingBefore: 600,
      ratingAfter: 900
    }));
    const playedService = new PracticeService(playedStore);
    const playedRenderer = renderScreen({ practiceService: playedService });

    press(playedRenderer, "practice-mode-custom");
    expect(collectText(findByTestId(playedRenderer, "custom-initial-rating-row"))).toContain("Edit ELO");
    expect(collectText(findByTestId(playedRenderer, "custom-initial-rating-value"))).toBe("ELO 900");
    expect(findByTestId(playedRenderer, "custom-initial-rating-row").props.accessibilityState).toEqual({ expanded: false });
    expect(() => findByTestId(playedRenderer, "custom-initial-rating-editor")).toThrow();
    expect(() => findByTestId(playedRenderer, "custom-initial-rating-stepper-decrease")).toThrow();

    press(playedRenderer, "custom-initial-rating-row");
    expect(findByTestId(playedRenderer, "custom-initial-rating-row").props.accessibilityState).toEqual({ expanded: true });
    expect(findByTestId(playedRenderer, "custom-initial-rating-editor")).toBeTruthy();
    expect(findByTestId(playedRenderer, "custom-initial-rating-stepper-decrease").props.accessibilityState).toEqual({ disabled: false });
    expect(findByTestId(playedRenderer, "custom-initial-rating-stepper-increase").props.accessibilityState).toEqual({ disabled: false });
    press(playedRenderer, "custom-initial-rating-stepper-decrease");
    expect(collectText(findByTestId(playedRenderer, "custom-initial-rating-value"))).toBe("ELO 800");
    expect(playedService.getRating("custom 5/20")).toMatchObject({
      rating: 800,
      games: 0,
      ratingDeviation: 100,
      volatility: 0.05
    });
  });

  it("shows custom sprint local pack readiness when the selected fixture has enough puzzles", () => {
    const renderer = renderScreen();

    press(renderer, "practice-mode-custom");

    expect(() => findByTestId(renderer, "custom-eligibility-ready")).toThrow();
    expect(() => findByTestId(renderer, "custom-pack-warning")).toThrow();
    expect(findByTestId(renderer, "start-sprint-button").props.accessibilityState).toEqual({ disabled: false });
  });

  it("prevents an impossible Custom start and explains the empty local selection", () => {
    const renderer = renderScreen({
      configurePuzzleSource: () => undefined,
      practiceService: new PracticeService(new MemoryStore())
    });

    press(renderer, "test-puzzle-source-familiar15");
    press(renderer, "practice-mode-custom");

    expect(collectText(findByTestId(renderer, "custom-pack-warning"))).toContain("0 eligible puzzles");
    expect(findByTestId(renderer, "start-sprint-button").props.accessibilityState).toEqual({ disabled: true });
    expect(findByTestId(renderer, "start-sprint-button").props.disabled).toBe(true);
  });

  it("allows custom sprint start with a local pack warning when eligible puzzles exist", () => {
    const renderer = renderScreen();

    press(renderer, "test-puzzle-source-familiar15");
    press(renderer, "practice-mode-custom");

    expect(findByTestId(renderer, "custom-pack-warning")).toBeTruthy();
    expect(findByTestId(renderer, "start-sprint-button").props.accessibilityState).toEqual({ disabled: false });

    press(renderer, "start-sprint-button");

    expectText(renderer, "Custom");
    expectText(renderer, "0 / 15");
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
  });

  it("starts an Arrow Duel sprint from the custom mode selector", () => {
    const renderer = renderScreen();

    press(renderer, "practice-mode-custom");
    press(renderer, "custom-mode-arrow-duel");

    expect(findByTestId(renderer, "custom-mode-regular").props.accessibilityState).toEqual({ selected: false });
    expect(findByTestId(renderer, "custom-mode-arrow-duel").props.accessibilityState).toEqual({ selected: true });
    expect(() => findByTestId(renderer, "custom-mode-summary")).toThrow();
    expect(() => findByTestId(renderer, "custom-separate-scoring")).toThrow();
    expect(collectText(findByTestId(renderer, "custom-config-list"))).not.toContain("arrow_duel 5/20");
    expect(findByTestId(renderer, "start-sprint-button").props.accessibilityState).toEqual({ disabled: false });

    press(renderer, "start-sprint-button");

    expect(findByTestId(renderer, "sprint-loading-overlay")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expectText(renderer, "Arrow Duel");
    expectText(renderer, "0 / 15");
  });

  it("settles an active sprint when the countdown expires", () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    act(() => {
      jest.advanceTimersByTime(301_000);
    });

    expectText(renderer, "Sprint failed");
    expect(collectText(findByTestId(renderer, "sprint-result-reason"))).toBe("Time expired");
    expect(findByTestId(renderer, "sprint-result-reason").props.accessibilityLabel).toBe("Result: Time expired");
    expect(collectText(renderer.root)).not.toContain("Result: Time expired");
    expect(findByTestId(renderer, "sprint-result-top-bar")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-result-top-bar"))).toContain("Sprint Result");
    expect(collectText(findByTestId(renderer, "sprint-result-top-bar"))).not.toContain("History");
    expect(findByTestId(renderer, "sprint-result-hero")).toBeTruthy();
    expect(findByTestId(renderer, "sprint-result-status-glyph")).toBeTruthy();
    expect(findByTestId(renderer, "sprint-result-failed-glyph")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-result-status-glyph"))).toBe("");
    expect(findByTestId(renderer, "sprint-result-solved")).toBeTruthy();
    expect(findByTestId(renderer, "sprint-result-accuracy")).toBeTruthy();
    expect(findByTestId(renderer, "sprint-result-rating-change")).toBeTruthy();
    expect(findByTestId(renderer, "sprint-result-time")).toBeTruthy();
    expect(findByTestId(renderer, "sprint-result-best-streak")).toBeTruthy();
    expect(findByTestId(renderer, "sprint-result-mistakes")).toBeTruthy();
    expect(() => findByTestId(renderer, "sprint-result-details")).toThrow();
    expect(() => findByTestId(renderer, "sprint-result-rating-card")).toThrow();
    expect(collectText(findByTestId(renderer, "sprint-result-rating-range"))).toContain("600");
    expect(collectText(findByTestId(renderer, "sprint-result-rating-change"))).toContain("600 -> 600");
    expect(findByTestId(renderer, "sprint-result-review-impact")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain("Mistakes");
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain("No new review items");
    expect(collectText(findByTestId(renderer, "sprint-result-mistakes"))).toBe("0");
    expect(() => findByTestId(renderer, "sprint-result-rating-snapshot")).toThrow();
    expect(findByTestId(renderer, "sprint-result-history-trend")).toBeTruthy();
    expect(() => findByTestId(renderer, "sprint-result-trend-plot")).toThrow();
    expect(collectText(findByTestId(renderer, "sprint-result-history-trend"))).toContain("History");
    expect(collectText(findByTestId(renderer, "sprint-result-history-trend"))).toContain("View performance trend");
    expect(collectText(findByTestId(renderer, "sprint-result-history-trend"))).not.toContain("Rating Trend");
    expect(collectText(findByTestId(renderer, "sprint-result-history-trend"))).not.toContain("History keeps the full performance chart");
    expect(findByTestId(renderer, "sprint-result-history-trend").props.accessibilityLabel).toContain("rating 600 to 600");
    expect(collectText(findByTestId(renderer, "sprint-result-trend-start"))).toBe("600");
    expect(collectText(findByTestId(renderer, "sprint-result-trend-current"))).toBe("600");
    expectText(renderer, "Mistakes");
    expect(findByTestId(renderer, "sprint-result-history-button")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-result-history-button"))).toBe("");
    expect(findByTestId(renderer, "sprint-result-history-button").props.accessibilityLabel).toBe("View history trends");
    expect(findByTestId(renderer, "result-trend-glyph")).toBeTruthy();
    expect(findByTestId(renderer, "back-practice-button")).toBeTruthy();
    expect(() => findByTestId(renderer, "sprint-result-done-button")).toThrow();
    press(renderer, "sprint-result-history-trend");
    expect(findByTestId(renderer, "history-panel")).toBeTruthy();
    press(renderer, "practice-tab");
    press(renderer, "sprint-result-history-button");
    expect(findByTestId(renderer, "history-panel")).toBeTruthy();
    expect(findByTestId(renderer, "history-performance-card")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-chart-label"))).toBe("Rating");
    expect(findByTestId(renderer, "history-chart-line")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-chart-line-point-0")).toThrow();
    expect(() => findByTestId(renderer, "history-chart-bar-0")).toThrow();
  });

  it("keeps the timer and score row mounted while the final board feedback is visible", async () => {
    const nowMs = Date.parse("2026-06-20T00:00:00.000Z");
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 1, maxMistakes: 3 },
      new Date(nowMs).toISOString()
    );
    const renderer = renderScreen({
      currentTimeMs: () => nowMs,
      practiceService: service
    });

    press(renderer, "practice-resume-card");
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");

    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(findByTestId(renderer, "session-status-metrics")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-progress"))).toBe("1 / 1");
    expect(collectText(findByTestId(renderer, "session-timer"))).toBe("05:00");
    expect(() => findByTestId(renderer, "sprint-summary-panel")).toThrow();

    await settleFeedbackSnapshot();

    expect(() => findByTestId(renderer, "session-board")).toThrow();
    expect(() => findByTestId(renderer, "session-status-metrics")).toThrow();
    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();
  });

  it("renders a dot-free rating curve that can be inspected by dragging", async () => {
    const renderer = renderStandardSequenceScreen();

    // Two settled sprints -> two elo points -> at least one line segment.
    for (let sprint = 0; sprint < 2; sprint++) {
      startStandardSprint(renderer);
      act(() => {
        jest.advanceTimersByTime(301_000);
      });
      press(renderer, "back-practice-button");
    }

    press(renderer, "history-tab");
    press(renderer, "history-rating-standard 5/20");
    const plotWidth = 300;
    act(() => {
      findByTestId(renderer, "history-chart-line").props.onLayout({
        nativeEvent: { layout: { width: plotWidth, height: 60, x: 0, y: 0 } }
      });
    });

    expect(() => findByTestId(renderer, "history-chart-line-point-0")).toThrow();
    const firstSegmentStyle = flattenTestStyle(findByTestId(renderer, "history-chart-line-segment-0").props.style);
    expect(Number(firstSegmentStyle.width)).toBeGreaterThan(0);

    act(() => {
      findByTestId(renderer, "history-chart-line").props.onResponderGrant({ nativeEvent: { locationX: 0, locationY: 0 } });
    });
    const firstSelectionLabel = findByTestId(renderer, "history-chart-line").props.accessibilityLabel;
    const firstSelectionX = flattenTestStyle(findByTestId(renderer, "history-chart-selection-guide").props.style).left;
    expect(firstSelectionLabel).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4} · Rating \d+$/);
    expect(findByTestId(renderer, "history-chart-line").props.onStartShouldSetResponderCapture()).toBe(true);
    expect(findByTestId(renderer, "history-chart-line").props.onMoveShouldSetResponderCapture()).toBe(true);
    expect(findByTestId(renderer, "history-chart-line").props.onResponderTerminationRequest()).toBe(false);
    expect(findByTestId(renderer, "history-chart-tooltip")).toBeTruthy();
    expect(flattenTestStyle(findByTestId(renderer, "history-chart-tooltip").props.style).left).toBe(8);
    expect(findByTestId(renderer, "history-chart-tooltip").props.pointerEvents).toBe("none");

    act(() => {
      findByTestId(renderer, "history-chart-line").props.onResponderMove({ nativeEvent: { locationX: 40, locationY: 999 } });
    });
    expect(findByTestId(renderer, "history-chart-line").props.accessibilityLabel).toBe(firstSelectionLabel);
    expect(flattenTestStyle(findByTestId(renderer, "history-chart-selection-guide").props.style).left).toBe(40);
    expect(flattenTestStyle(findByTestId(renderer, "history-chart-selection-point").props.style).left).toBe(firstSelectionX);

    act(() => {
      findByTestId(renderer, "history-chart-line").props.onResponderMove({ nativeEvent: { locationX: plotWidth, locationY: 999 } });
    });
    expect(findByTestId(renderer, "history-chart-line").props.accessibilityLabel).toMatch(/Rating \d+$/);
    expect(findByTestId(renderer, "history-chart-selection-guide")).toBeTruthy();
    expect(flattenTestStyle(findByTestId(renderer, "history-chart-selection-guide").props.style).left).not.toBe(firstSelectionX);
    expect(findByTestId(renderer, "history-chart-selection-point")).toBeTruthy();
    const lastTooltipStyle = flattenTestStyle(findByTestId(renderer, "history-chart-tooltip").props.style);
    expect(Number(lastTooltipStyle.left)).toBeGreaterThan(0);
    expect(Number(lastTooltipStyle.left) + Number(lastTooltipStyle.width)).toBeLessThan(plotWidth);
    expect(collectText(findByTestId(renderer, "history-chart-tooltip"))).toMatch(/^Rating \d+[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    act(() => {
      findByTestId(renderer, "history-chart-line").props.onResponderRelease();
    });
    expect(() => findByTestId(renderer, "history-chart-tooltip")).toThrow();
  });

  it("filters history to wrong attempts from the recent window", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    abandonSprint(renderer);

    press(renderer, "history-tab");
    expect(() => findByTestId(renderer, "app-shell-header")).toThrow();
    expect(collectText(findByTestId(renderer, "history-action-header"))).not.toContain("Filters");
    expect(collectText(findByTestId(renderer, "history-action-header"))).toContain("History");
    expect(collectText(findByTestId(renderer, "history-action-header"))).not.toContain("Performance and solved puzzles");
    expect(findByTestId(renderer, "history-filter-toggle")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-filter-toggle"))).toBe("");
    expect(collectText(findByTestId(renderer, "history-action-header"))).not.toContain("≡");
    expect(findByTestId(renderer, "history-filter-toggle").props.accessibilityState).toEqual({ expanded: false });
    expect(() => findByTestId(renderer, "history-filter-reset")).toThrow();
    expect(findByTestId(renderer, "history-primary-filters")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-filter-summary-card")).toThrow();
    expect(findByTestId(renderer, "history-active-filter-summary")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("7 days");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("All puzzles");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Sprint");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).not.toContain("Wrong only");
    expect(findByTestId(renderer, "history-filter-sprint-only").props.accessibilityState).toEqual({ checked: true });
    expect(findByTestId(renderer, "history-filter-wrong-only").props.accessibilityState).toEqual({ checked: false });
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    expectHistoryRowAccessibility(renderer, "Move e6f7");
    press(renderer, "history-filter-wrong-only");
    expect(findByTestId(renderer, "history-filter-wrong-only").props.accessibilityState).toEqual({ checked: true });
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Wrong only");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    expectNoHistoryRowAccessibility(renderer, "Move e6f7");
    press(renderer, "history-filter-wrong-only");
    expect(findByTestId(renderer, "history-filter-wrong-only").props.accessibilityState).toEqual({ checked: false });
    expectHistoryRowAccessibility(renderer, "Move e6f7");
    expect(findByTestId(renderer, "history-rating-filters")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-rating-filters"))).toContain("All Puzzles");
    expect(collectText(findByTestId(renderer, "history-rating-filters"))).toContain("Standard · 20s pace");
    expect(() => findByTestId(renderer, "history-performance-card")).toThrow();
    press(renderer, "history-rating-standard 5/20");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Standard · 20s pace");
    expect(findByTestId(renderer, "history-performance-card")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-performance-card"))).toContain("Rating Trend");
    expect(collectText(findByTestId(renderer, "history-performance-card"))).toContain("Standard · 20s pace");
    expect(collectText(findByTestId(renderer, "history-performance-context"))).toBe("Standard · 20s pace · 7 days");
    expect(collectText(findByTestId(renderer, "history-performance-card"))).not.toContain("standard 5/20");
    expect(collectText(findByTestId(renderer, "history-performance-card"))).not.toContain("Accuracy");
    expect(findByTestId(renderer, "history-performance-chart")).toBeTruthy();
    expect(findByTestId(renderer, "history-chart-line")).toBeTruthy();
    expect(findByTestId(renderer, "history-chart-line").props.accessibilityRole).toBe("adjustable");
    expect(findByTestId(renderer, "history-chart-line").props.accessibilityLabel).toContain("Drag across the chart");
    expect(renderer.root.findAll((node) => String(node.props.testID ?? "").startsWith("history-chart-line-point-")).length).toBe(0);
    act(() => {
      findByTestId(renderer, "history-chart-line").props.onLayout({ nativeEvent: { layout: { width: 240 } } });
    });
    act(() => {
      findByTestId(renderer, "history-chart-line").props.onResponderGrant({ nativeEvent: { locationX: 120 } });
    });
    expect(findByTestId(renderer, "history-chart-tooltip")).toBeTruthy();
    expect(findByTestId(renderer, "history-chart-selection-point")).toBeTruthy();
    expect(findByTestId(renderer, "history-chart-line").props.accessibilityLabel).toMatch(/Rating \d+$/);
    expect(() => findByTestId(renderer, "history-chart-metric-filters")).toThrow();
    expect(() => findByTestId(renderer, "history-chart-rating")).toThrow();
    expect(() => findByTestId(renderer, "history-chart-wins-losses")).toThrow();
    expect(() => findByTestId(renderer, "history-chart-accuracy")).toThrow();
    expect(() => findByTestId(renderer, "history-chart-solved")).toThrow();
    expect(() => findByTestId(renderer, "history-chart-mistake-rate")).toThrow();
    expect(() => findByTestId(renderer, "history-chart-review-due")).toThrow();
    expect(() => findByTestId(renderer, "history-chart-bar-0")).toThrow();
    expect(collectText(findByTestId(renderer, "history-chart-label"))).toBe("Rating");
    expect(findByTestId(renderer, "history-range-filters")).toBeTruthy();
    expect(renderer.root.findAllByProps({ testID: "history-range-filters" }).some((node) => node.props.horizontal === true)).toBe(true);
    expect(collectText(findByTestId(renderer, "history-range-max"))).toBe("All Time");
    press(renderer, "history-range-max");
    expect(collectText(findByTestId(renderer, "history-performance-context"))).toBe("Standard · 20s pace · All Time");
    press(renderer, "history-range-7d");
    expect(collectText(findByTestId(renderer, "history-performance-context"))).toBe("Standard · 20s pace · 7 days");
    expect(findByTestId(renderer, "history-filter-wrong-only").props.accessibilityState).toEqual({ checked: false });
    expect(() => findByTestId(renderer, "history-filter-arrow-duel-only")).toThrow();
    expect(() => findByTestId(renderer, "history-mode-filters")).toThrow();
    expect(() => findByTestId(renderer, "history-mode-standard")).toThrow();
    expect(() => findByTestId(renderer, "history-advanced-filters")).toThrow();
    expect(() => findByTestId(renderer, "history-speed-filters")).toThrow();
    expect(() => findByTestId(renderer, "history-speed-20")).toThrow();
    expect(() => findByTestId(renderer, "history-review-status-filters")).toThrow();
    press(renderer, "history-filter-toggle");
    expect(findByTestId(renderer, "history-filter-toggle").props.accessibilityState).toEqual({ expanded: true });
    expect(findByTestId(renderer, "history-filter-reset").props.accessibilityLabel).toBe("Reset history filters");
    expect(collectText(findByTestId(renderer, "history-filter-reset"))).toBe("Reset filters");
    expect(findByTestId(renderer, "history-advanced-filters")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-rating-filters"))).toContain("Standard · 20s pace");
    expect(collectText(findByTestId(renderer, "history-rating-filters"))).not.toContain("standard 5/20");
    expect(() => findByTestId(renderer, "history-mode-filters")).toThrow();
    expect(() => findByTestId(renderer, "history-mode-standard")).toThrow();
    expect(() => findByTestId(renderer, "history-filter-arrow-duel-only")).toThrow();
    expect(() => findByTestId(renderer, "history-speed-filters")).toThrow();
    expect(() => findByTestId(renderer, "history-speed-20")).toThrow();
    expect(findByTestId(renderer, "history-review-status-filters")).toBeTruthy();
    expect(findByTestId(renderer, "history-review-status-queued")).toBeTruthy();
    expect(findByTestId(renderer, "history-review-status-clear")).toBeTruthy();
    expectHistoryRowAccessibility(renderer, "Move e6f7");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");

    expectHistoryRowAccessibility(renderer, "Move e6f7");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("20s pace");
    press(renderer, "history-review-status-queued");
    expect(collectText(findByTestId(renderer, "history-performance-card"))).not.toContain("Accuracy");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Queued");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    expectNoHistoryRowAccessibility(renderer, "Move e6f7");
    press(renderer, "history-review-status-clear");
    expect(collectText(findByTestId(renderer, "history-performance-card"))).not.toContain("Correct");
    expectHistoryRowAccessibility(renderer, "Move e6f7");
    expectNoHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    press(renderer, "history-review-status-all");

    press(renderer, "history-filter-wrong-only");
    expect(findByTestId(renderer, "history-filter-wrong-only").props.accessibilityLabel).toBe("Wrong puzzles only");
    expect(findByTestId(renderer, "history-filter-wrong-only").props.accessibilityRole).toBe("switch");
    expect(findByTestId(renderer, "history-filter-wrong-only").props.accessibilityState).toEqual({ checked: true });
    expect(findByTestId(renderer, "history-filter-wrong-only").props.accessibilityValue).toEqual({ text: "On" });
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Wrong only");
    expect(collectText(findByTestId(renderer, "history-performance-card"))).not.toContain("Wrong");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    expectNoHistoryRowAccessibility(renderer, "Move e6f7");
    press(renderer, "history-range-30d");
    expect(findByTestId(renderer, "history-filter-wrong-only").props.accessibilityState).toEqual({ checked: true });
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("30 days");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Wrong only");
    press(renderer, "history-range-7d");
    expect(findByTestId(renderer, "history-filter-wrong-only").props.accessibilityState).toEqual({ checked: true });
    press(renderer, "history-result-correct");
    expect(findByTestId(renderer, "history-filter-wrong-only").props.accessibilityState).toEqual({ checked: false });
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Correct");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).not.toContain("Wrong only");
    press(renderer, "history-result-wrong");
    expect(findByTestId(renderer, "history-filter-wrong-only").props.accessibilityState).toEqual({ checked: true });
    press(renderer, "history-filter-wrong-only");
    expect(findByTestId(renderer, "history-filter-wrong-only").props.accessibilityState).toEqual({ checked: false });
    expect(collectText(findByTestId(renderer, "history-performance-card"))).not.toContain("Accuracy");
    press(renderer, "history-filter-wrong-only");

    press(renderer, "history-source-sprint");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");

    const historyAttemptRow = renderer.root.findAll(
      (node) => typeof node.props.testID === "string" && node.props.testID.startsWith("history-attempt-")
    )[0];
    expect(historyAttemptRow).toBeTruthy();
    const historyAttemptId = historyAttemptRow.props.testID.replace("history-attempt-", "");
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-badge`))).toBe("");
    expect(hasStyleEntry(findByTestId(renderer, `history-attempt-${historyAttemptId}-badge`), "backgroundColor", "#DC2626")).toBe(true);
    expect(findByTestId(renderer, "result-badge-wrong-glyph")).toBeTruthy();
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-result`))).toBe("Wrong move");
    expect(() => findByTestId(renderer, `history-attempt-${historyAttemptId}-move`)).toThrow();
    expect(historyAttemptRow.props.accessibilityLabel).toContain("Played g6g5 · Best f4g3");
    expect(historyAttemptRow.props.accessibilityLabel).not.toContain("Review due");
    expect(collectText(historyAttemptRow)).not.toContain("Played g6g5 · Best f4g3");
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-identity`))).toMatch(
      /^ID .+ · Rating \d+$/
    );
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-context`))).toContain("20s pace");
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-context`))).toMatch(/^[A-Z]/);
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-meta`))).toMatch(
      /Sprint · \d+s · (Today|Yesterday|\d+ days ago|\d+w ago|\d+mo ago|\d+y ago|Scheduled) · [A-Z][a-z]{2} \d{1,2}, \d{4}/
    );
    expect(() => findByTestId(renderer, `history-attempt-${historyAttemptId}-status`)).toThrow();
    expect(findByTestId(renderer, `history-attempt-${historyAttemptId}-chevron`)).toBeTruthy();
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-chevron`))).toBe("");
    expect(() => findByTestId(renderer, `history-attempt-${historyAttemptId}-status-summary`)).toThrow();
    expect(() => findByTestId(renderer, `history-attempt-${historyAttemptId}-difficulty`)).toThrow();
    expect(() => findByTestId(renderer, `history-attempt-${historyAttemptId}-review-due`)).toThrow();
    expect(() => findByTestId(renderer, `history-attempt-${historyAttemptId}-delta`)).toThrow();
    press(renderer, historyAttemptRow.props.testID);
    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(findByTestId(renderer, "review-progress").props.children.join("")).toBe("1 / 1 · Standard");
    expect(findByTestId(renderer, "review-context-strip")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-source-pill")).toThrow();
    expect(findByTestId(renderer, "review-side-to-move").props.accessibilityLabel).toBe("Black to move");
    expect(findByTestId(renderer, "move-side-black-glyph")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-side-to-move-label"))).toBe("Black to move");
    expect(findByTestId(renderer, "review-theme-pill")).toBeTruthy();
    expect(findByTestId(renderer, "review-reset-puzzle")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-exit"))).toBe("");
    expect(collectText(findByTestId(renderer, "review-reset-puzzle"))).toBe("↺");
    press(renderer, "review-exit");
    expect(findByTestId(renderer, "history-panel")).toBeTruthy();
  });

  it("shows curated tags in History rows, filters, and puzzle replay", () => {
    const store = new MemoryStore();
    store.seedPuzzles([{
      ...sharedHistoryPuzzle(),
      themes: [
        "advancedPawn",
        "attraction",
        "discoveredAttack",
        "mateIn3",
        "pin",
        "promotion",
        "sacrifice",
        "endgame"
      ]
    }]);
    const completedAt = new Date(Date.now() - 60_000).toISOString();
    store.recordAttempt({
      id: "curated-density",
      source: "sprint",
      sessionId: "curated-density-session",
      puzzleId: "shared-history",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e2e4",
      expectedMove: "e2e4",
      startedAt: new Date(new Date(completedAt).getTime() - 8_000).toISOString(),
      completedAt,
      ratingBefore: 900,
      ratingAfter: 912
    });
    const renderer = renderScreen({
      practiceService: new PracticeService(store),
      themeCatalogPresentation: {
        groups: [{
          label: "Curated",
          themes: [
            "advancedPawn",
            "attraction",
            "discoveredAttack",
            "mateIn3",
            "pin",
            "promotion",
            "sacrifice",
            "capturingDefender"
          ]
        }]
      }
    });

    press(renderer, "history-tab");
    const themes = collectText(findByTestId(renderer, "history-attempt-curated-density-themes"));
    expect(themes).toContain("Advanced Pawn");
    expect(themes).toContain("Discovered Attack");
    expect(themes).toContain("Mate in 3");
    expect(themes).toContain("Sacrifice");
    expect(themes).not.toContain("Endgame");
    expect(findByTestId(renderer, "history-attempt-curated-density-pace")).toBeTruthy();

    press(renderer, "history-filter-toggle");
    expect(collectText(findByTestId(renderer, "history-theme-filters"))).toContain("Capturing Defender");
    expect(findByTestId(renderer, "history-theme-filter-rail-curated")).toBeTruthy();
    press(renderer, "history-theme-pin");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Pin");
    press(renderer, "history-attempt-curated-density");
    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    const replayThemes = collectText(findByTestId(renderer, "review-theme-rail"));
    expect(replayThemes).toContain("Advanced Pawn");
    expect(replayThemes).toContain("Sacrifice");
    expect(replayThemes).not.toContain("Endgame");
    expect(() => findByTestId(renderer, "review-theme-pill")).toThrow();
  });

  it("puts Unclear only first in a scrollable three-toggle History row without a count or icon", () => {
    const store = new MemoryStore();
    store.seedPuzzles([sharedHistoryPuzzle()]);
    store.recordAttempt({
      id: "unclear-history-attempt",
      source: "sprint",
      sessionId: "unclear-history-session",
      puzzleId: "shared-history",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e2e4",
      expectedMove: "e2e4",
      startedAt: "2026-07-17T11:59:55.000Z",
      completedAt: "2026-07-17T12:00:00.000Z",
      ratingBefore: 600
    });
    const service = new PracticeService(store);
    service.setAttemptUnclear("unclear-history-attempt", true, "2026-07-17T12:01:00.000Z");
    const renderer = renderScreen({
      currentTimeMs: () => Date.parse("2026-07-17T12:02:00.000Z"),
      practiceService: service
    });

    press(renderer, "history-tab");
    expect(findByTestId(renderer, "history-quick-filters").props.horizontal).toBe(true);
    expect(collectText(findByTestId(renderer, "history-filter-unclear"))).toBe("Unclear only");
    expect(findByTestId(renderer, "history-filter-unclear").props.accessibilityLabel).toBe(
      "Unclear attempts only"
    );
    expect(testIdOrder(renderer, "history-filter-unclear", "history-filter-wrong-only")).toBeLessThan(0);
    expect(testIdOrder(renderer, "history-filter-wrong-only", "history-filter-sprint-only")).toBeLessThan(0);
    expect(findByTestId(renderer, "history-attempt-unclear-history-attempt-unclear")).toBeTruthy();
    expect(() => findByTestId(renderer, "bookmark-glyph")).toThrow();
    press(renderer, "history-filter-unclear");
    expect(findByTestId(renderer, "history-filter-unclear").props.accessibilityState).toEqual({ checked: true });
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Unclear");

    press(renderer, "history-attempt-unclear-history-attempt");
    expect(findByTestId(renderer, "review-board")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-detail")).toThrow();
    expect(collectText(findByTestId(renderer, "history-attempt-unclear"))).toContain("Marked");
    expect(collectText(findByTestId(renderer, "history-attempt-unclear"))).not.toContain("Marked as unclear");
    expect(findByTestId(renderer, "history-attempt-clear-unclear")).toBeTruthy();
    expect(testIdOrder(renderer, "review-schedule-control", "history-attempt-unclear")).toBeLessThan(0);
    expect(() => findByTestId(renderer, "bookmark-glyph")).toThrow();
    expect(collectText(findByTestId(renderer, "review-schedule-state"))).toBe("Not scheduled for Review");
    expect(collectText(findByTestId(renderer, "review-schedule-add"))).toBe("Add to Review");
    expect(service.listHistory()).toHaveLength(1);
    expect((service.listHistory() as AttemptEvent[])[0]).toMatchObject({ unclear: true });

    press(renderer, "review-schedule-add");
    expect(collectText(findByTestId(renderer, "review-schedule-state"))).toBe("Due tomorrow");
    expect(() => findByTestId(renderer, "history-attempt-unclear")).toThrow();
    expect((service.listHistory() as AttemptEvent[])[0]).toMatchObject({ unclear: false });

    press(renderer, "review-schedule-remove");
    press(renderer, "review-schedule-removal-confirm");
    expect(collectText(findByTestId(renderer, "review-schedule-state"))).toBe("Not scheduled for Review");

    press(renderer, "review-exit");
    expect(findByTestId(renderer, "history-filter-unclear").props.accessibilityState).toEqual({ checked: true });
    expect(findByTestId(renderer, "history-empty-state")).toBeTruthy();
  });

  it("keeps Review Schedule removal failures unchanged and retryable inside History Review", () => {
    const store = new FailingReviewScheduleStore();
    store.seedPuzzles([sharedHistoryPuzzle()]);
    store.scheduleMistakeReview({
      puzzleId: "shared-history",
      mode: "standard",
      ratingKey: "standard 5/20"
    }, "2026-07-17T12:00:00.000Z");
    store.recordAttempt({
      id: "review-removal-failure",
      source: "sprint",
      sessionId: "review-removal-session",
      puzzleId: "shared-history",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e2e4",
      expectedMove: "e2e4",
      startedAt: "2026-07-17T12:00:05.000Z",
      completedAt: "2026-07-17T12:00:10.000Z",
      ratingBefore: 600
    });
    const service = new PracticeService(store);
    const renderer = renderScreen({
      currentTimeMs: () => Date.parse("2026-07-18T12:02:00.000Z"),
      practiceService: service
    });

    press(renderer, "history-tab");
    press(renderer, "history-attempt-review-removal-failure");
    expect(collectText(findByTestId(renderer, "review-schedule-state"))).toBe("Due today");
    store.setRemovalFailure(new Error("delete failed"));
    press(renderer, "review-schedule-remove");
    press(renderer, "review-schedule-removal-confirm");
    expect(collectText(findByTestId(renderer, "review-schedule-error"))).toBe(
      "Couldn't remove from Review. Try again."
    );
    expect(collectText(findByTestId(renderer, "review-schedule-state"))).toBe("Due today");
    expect(service.listReviewQueue()).toHaveLength(1);

    store.setRemovalFailure(undefined);
    press(renderer, "review-schedule-removal-confirm");
    expect(service.listReviewQueue()).toHaveLength(0);
    expect(collectText(findByTestId(renderer, "review-schedule-state"))).toBe("Not scheduled for Review");
  });

  it("keeps a committed Review removal when reminder reconciliation fails", async () => {
    const scheduler = new FakeReviewReminderScheduler();
    scheduler.setFailure(new Error("notification unavailable"));
    const store = new MemoryStore();
    store.seedPuzzles([sharedHistoryPuzzle()]);
    store.scheduleMistakeReview({
      puzzleId: "shared-history",
      mode: "standard",
      ratingKey: "standard 5/20"
    }, "2026-07-17T12:00:00.000Z");
    store.recordAttempt({
      id: "review-reminder-failure",
      source: "sprint",
      sessionId: "review-reminder-session",
      puzzleId: "shared-history",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e2e4",
      expectedMove: "e2e4",
      startedAt: "2026-07-17T12:00:05.000Z",
      completedAt: "2026-07-17T12:00:10.000Z",
      ratingBefore: 600
    });
    const service = new PracticeService(store);
    const renderer = renderScreen({
      currentTimeMs: () => Date.parse("2026-07-18T12:02:00.000Z"),
      practiceService: service,
      reviewReminderScheduler: scheduler
    });
    await act(async () => {});

    press(renderer, "history-tab");
    press(renderer, "history-attempt-review-reminder-failure");
    press(renderer, "review-schedule-remove");
    press(renderer, "review-schedule-removal-confirm");
    await act(async () => {});

    expect(service.listReviewQueue()).toHaveLength(0);
    expect(service.listHistory()).toHaveLength(1);
    expect(scheduler.calls.length).toBeGreaterThan(0);
  });

  it("resets history filters to the default sprint-only view", () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    abandonSprint(renderer);
    press(renderer, "history-tab");
    expect(() => findByTestId(renderer, "history-filter-reset")).toThrow();

    press(renderer, "history-filter-wrong-only");
    press(renderer, "history-filter-sprint-only");
    press(renderer, "history-range-max");
    press(renderer, "history-filter-toggle");
    press(renderer, "history-side-black");

    expect(collectText(findByTestId(renderer, "history-filter-reset"))).toBe("Reset filters");

    expect(findByTestId(renderer, "history-filter-wrong-only").props.accessibilityState).toEqual({ checked: true });
    expect(findByTestId(renderer, "history-filter-sprint-only").props.accessibilityState).toEqual({ checked: false });
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("All Time");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Black");

    press(renderer, "history-filter-reset");

    expect(findByTestId(renderer, "history-filter-wrong-only").props.accessibilityState).toEqual({ checked: false });
    expect(findByTestId(renderer, "history-filter-sprint-only").props.accessibilityState).toEqual({ checked: true });
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("7 days");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("All puzzles");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Sprint");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).not.toContain("Wrong only");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).not.toContain("All Time");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).not.toContain("Black");
    expect(renderer.root.findAllByProps({ testID: "history-source-sprint" }).some(
      (node) => node.props.accessibilityState?.selected === true
    )).toBe(true);
    expect(renderer.root.findAllByProps({ testID: "history-result-all" }).some(
      (node) => node.props.accessibilityState?.selected === true
    )).toBe(true);
    expect(renderer.root.findAllByProps({ testID: "history-side-all" }).some(
      (node) => node.props.accessibilityState?.selected === true
    )).toBe(true);
  });

  it("navigates history review across the full filtered result set, not just the visible page", () => {
    const service = createMobilePracticeService("random1000");
    for (let index = 0; index < 22; index += 1) {
      service.recordReviewAttempt({
        puzzleId: "000hf",
        mode: "standard",
        ratingKey: "standard 5/20",
        result: index % 2 === 0 ? "correct" : "wrong",
        submittedMove: `a${(index % 8) + 1}a${((index + 1) % 8) + 1}`,
        expectedMove: "c4b5",
        startedAt: new Date(Date.now() - index * 1000 - 100).toISOString()
      }, new Date(Date.now() - index * 1000).toISOString());
    }
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "history-tab");
    press(renderer, "history-rating-standard 5/20");
    press(renderer, "history-filter-toggle");
    press(renderer, "history-source-review");
    expectText(renderer, "1-20 of 22");
    expect(collectText(findByTestId(renderer, "history-page-previous"))).toBe("");
    expect(collectText(findByTestId(renderer, "history-page-next"))).toBe("");
    expect(findByTestId(renderer, "history-rating-range-filters")).toBeTruthy();
    expect(findByTestId(renderer, "history-rating-range-all")).toBeTruthy();
    expect(findByTestId(renderer, "history-rating-range-under1000")).toBeTruthy();
    expect(findByTestId(renderer, "history-rating-range-1000-1399")).toBeTruthy();
    expect(findByTestId(renderer, "history-rating-range-1400-plus")).toBeTruthy();
    press(renderer, "history-rating-range-1000-1399");
    expectText(renderer, "0 results");
    press(renderer, "history-rating-range-1400-plus");
    expectText(renderer, "1-20 of 22");
    press(renderer, "history-page-next");
    expectText(renderer, "21-22 of 22");

    const historyAttemptRow = renderer.root.findAll(
      (node) => typeof node.props.testID === "string" && node.props.testID.startsWith("history-attempt-")
    )[0];
    press(renderer, historyAttemptRow.props.testID);

    expectText(renderer, "21 / 22 · Standard");
    expect(findByTestId(renderer, "review-previous").props.disabled).toBe(false);
    press(renderer, "review-previous");
    expectText(renderer, "20 / 22 · Standard");
  });

  it("keeps history row paging while the performance card stays rating-only", () => {
    const service = createMobilePracticeService("random1000");
    for (let index = 0; index < 22; index += 1) {
      service.recordReviewAttempt({
        puzzleId: "000hf",
        mode: "standard",
        ratingKey: "standard 5/20",
        result: index < 20 ? "correct" : "wrong",
        submittedMove: `a${(index % 8) + 1}a${((index + 1) % 8) + 1}`,
        expectedMove: "c4b5",
        startedAt: new Date(Date.now() - index * 1000 - 100).toISOString()
      }, new Date(Date.now() - index * 1000).toISOString());
    }
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "history-tab");
    press(renderer, "history-rating-standard 5/20");
    press(renderer, "history-filter-toggle");
    press(renderer, "history-source-review");
    expectText(renderer, "1-20 of 22");
    expect(collectText(findByTestId(renderer, "history-performance-card"))).toContain("Rating Trend");
    expect(collectText(findByTestId(renderer, "history-performance-card"))).not.toContain("Accuracy");
    expect(collectText(findByTestId(renderer, "history-performance-chart"))).toContain("No rating data in this range.");
    expect(() => findByTestId(renderer, "history-chart-metric-filters")).toThrow();

    press(renderer, "history-page-next");
    expectText(renderer, "21-22 of 22");
    expect(collectText(findByTestId(renderer, "history-performance-card"))).toContain("Rating Trend");
    expect(() => findByTestId(renderer, "history-chart-bar-0")).toThrow();
  });

  it("omits review schedules from history rows", () => {
    const store = new MemoryStore();
    store.seedPuzzles([sharedHistoryPuzzle()]);
    store.saveRating({ key: "arrow duel 5/30", generation: 0, rating: 600, games: 1 });
    store.saveRating({ key: "standard 5/20", generation: 0, rating: 600, games: 1 });
    store.recordAttempt(historyAttempt({
      id: "arrow-attempt",
      mode: "arrow_duel",
      ratingKey: "arrow duel 5/30",
      completedAt: "2026-06-20T00:01:00.000Z"
    }));
    store.recordAttempt(historyAttempt({
      id: "standard-attempt",
      mode: "standard",
      ratingKey: "standard 5/20",
      completedAt: "2026-06-20T00:00:00.000Z"
    }));
    store.scheduleMistakeReview({
      puzzleId: "shared-history",
      mode: "arrow_duel",
      ratingKey: "arrow duel 5/30"
    }, "2026-06-20T00:01:00.000Z");
    const renderer = renderScreen({ practiceService: new PracticeService(store) });

    press(renderer, "history-tab");
    press(renderer, "history-range-max");
    expect(() => findByTestId(renderer, "history-performance-card")).toThrow();
    expect(findByTestId(renderer, "history-attempt-arrow-attempt")).toBeTruthy();
    expect(findByTestId(renderer, "history-attempt-standard-attempt")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("All puzzles");

    press(renderer, "history-rating-arrow duel 5/30");
    expect(collectText(findByTestId(renderer, "history-performance-context"))).toBe("Arrow Duel · 30s pace · All Time");
    expect(() => findByTestId(renderer, "history-attempt-arrow-attempt-review-due")).toThrow();
    expect(findByTestId(renderer, "history-attempt-arrow-attempt").props.accessibilityLabel).not.toContain("Review due");
    expect(collectText(findByTestId(renderer, "history-attempt-arrow-attempt-identity"))).toBe(
      "ID shared-history · Rating 900"
    );
    expect(() => findByTestId(renderer, "history-attempt-arrow-attempt-difficulty")).toThrow();

    press(renderer, "history-rating-standard 5/20");
    expect(collectText(findByTestId(renderer, "history-performance-context"))).toBe("Standard · 20s pace · All Time");
    expect(() => findByTestId(renderer, "history-attempt-standard-attempt-review-due")).toThrow();
    expect(collectText(findByTestId(renderer, "history-attempt-standard-attempt-identity"))).toBe(
      "ID shared-history · Rating 900"
    );
    expect(() => findByTestId(renderer, "history-attempt-standard-attempt-difficulty")).toThrow();
  });

  it("omits run-level rating deltas from individual history attempts", () => {
    const store = new MemoryStore();
    store.seedPuzzles([sharedHistoryPuzzle()]);
    store.saveRating({ key: "standard 5/20", generation: 0, rating: 600, games: 0 });
    store.recordAttempt(historyAttempt({
      id: "run-scored-attempt",
      mode: "standard",
      ratingKey: "standard 5/20",
      completedAt: "2026-06-20T00:00:00.000Z",
      ratingAfter: 650
    }));
    const renderer = renderScreen({ practiceService: new PracticeService(store) });

    press(renderer, "history-tab");
    press(renderer, "history-range-max");

    expect(findByTestId(renderer, "history-attempt-run-scored-attempt")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-run-scored-attempt-delta")).toThrow();
    expect(() => findByTestId(renderer, "history-attempt-run-scored-attempt-review-due")).toThrow();
  });

  it("opens replayable History attempts without a detail panel and explains unavailable replays", () => {
    const store = new MemoryStore();
    store.seedPuzzles([sharedHistoryPuzzle()]);
    store.recordAttempt({
      id: "custom-detail-attempt",
      source: "sprint",
      sessionId: "custom-detail-session",
      puzzleId: "shared-history",
      mode: "custom",
      ratingKey: "hangingPiece custom 5/20",
      result: "wrong",
      submittedMove: "e2e4",
      expectedMove: "e2e3",
      startedAt: "2026-06-20T12:00:00.000Z",
      completedAt: "2026-06-20T12:00:15.000Z",
      ratingBefore: 600,
      ratingAfter: 584
    });
    store.recordAttempt({
      id: "partial-detail-attempt",
      source: "sprint",
      sessionId: "partial-detail-session",
      puzzleId: "shared-history",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: " ",
      expectedMove: "",
      startedAt: "0",
      completedAt: "2026-06-20T12:00:10.000Z",
      ratingBefore: 600,
      ratingAfter: Number.POSITIVE_INFINITY
    });
    store.recordAttempt({
      id: "malformed-context-attempt",
      source: "mystery-source",
      sessionId: "malformed-context-session",
      puzzleId: "shared-history",
      mode: "mystery-mode",
      ratingKey: "   ",
      result: "mystery-result",
      submittedMove: "e2e4",
      expectedMove: "e2e3",
      startedAt: "2026-06-20T12:00:00.000Z",
      completedAt: "2026-06-20T12:00:20.000Z",
      ratingBefore: 600
    } as unknown as AttemptEvent);
    store.recordAttempt({
      id: "corrupt-arrow-attempt",
      source: "sprint",
      sessionId: "corrupt-arrow-session",
      puzzleId: "shared-history",
      mode: "arrow_duel",
      ratingKey: "arrow duel 5/30",
      result: "wrong",
      submittedMove: "e2e4",
      expectedMove: "e2e3",
      startedAt: "2026-06-20T12:00:00.000Z",
      completedAt: "2026-06-20T12:00:30.000Z",
      ratingBefore: 600,
      arrowDuelCandidateOrderStatus: "corrupt"
    } as unknown as AttemptEvent);
    store.recordAttempt({
      id: "semantic-corrupt-arrow-attempt",
      source: "sprint",
      sessionId: "semantic-corrupt-arrow-session",
      puzzleId: "shared-history",
      mode: "arrow_duel",
      ratingKey: "arrow duel 5/30",
      result: "wrong",
      submittedMove: "e2e4",
      expectedMove: "e2e3",
      startedAt: "2026-06-20T12:00:00.000Z",
      completedAt: "2026-06-20T12:00:40.000Z",
      ratingBefore: 600,
      arrowDuelCandidateOrder: ["a1a2", "a2a3"]
    });
    const systemBack = createTestSystemBackSource("android");
    const renderer = renderScreen({ practiceService: new PracticeService(store), systemBack });

    press(renderer, "history-tab");
    press(renderer, "history-range-max");
    press(renderer, "history-filter-toggle");
    press(renderer, "history-source-all");
    press(renderer, "history-attempt-custom-detail-attempt");

    expect(() => findByTestId(renderer, "history-attempt-detail")).toThrow();
    expect(findByTestId(renderer, "review-board")).toBeTruthy();
    expect(findByTestId(renderer, "review-analysis-button")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-close-analysis")).toThrow();

    press(renderer, "review-exit");
    expect(collectText(findByTestId(renderer, "history-attempt-partial-detail-attempt-meta"))).toContain(
      "Duration unavailable"
    );
    expect(findByTestId(renderer, "history-attempt-partial-detail-attempt").props.accessibilityLabel).toContain(
      "Moves unavailable"
    );
    press(renderer, "history-attempt-partial-detail-attempt");

    expect(() => findByTestId(renderer, "history-attempt-detail")).toThrow();
    expect(findByTestId(renderer, "review-board")).toBeTruthy();

    press(renderer, "review-exit");
    expect(collectText(findByTestId(renderer, "history-attempt-malformed-context-attempt-result"))).toBe(
      "Result unavailable"
    );
    expect(collectText(findByTestId(renderer, "history-attempt-malformed-context-attempt-meta"))).toContain(
      "Unknown source"
    );
    press(renderer, "history-attempt-malformed-context-attempt");
    expect(() => findByTestId(renderer, "history-attempt-detail")).toThrow();
    expect(collectText(findByTestId(renderer, "history-replay-unavailable"))).toBe(
      "The saved mode or rating context is invalid, so this attempt cannot be replayed safely."
    );
    expect(() => findByTestId(renderer, "review-board")).toThrow();
    expect(() => findByTestId(renderer, "review-analysis-button")).toThrow();
    expect(() => findByTestId(renderer, "review-schedule-control")).toThrow();

    expect(systemBack.invoke()).toBe(true);
    expect(findByTestId(renderer, "history-panel")).toBeTruthy();
    press(renderer, "history-attempt-corrupt-arrow-attempt");
    expect(() => findByTestId(renderer, "history-attempt-detail")).toThrow();
    expect(collectText(findByTestId(renderer, "history-replay-unavailable"))).toBe(
      "Original Arrow Duel candidates are unavailable, so this attempt cannot be replayed safely."
    );
    expect(() => findByTestId(renderer, "review-board")).toThrow();
    expect(() => findByTestId(renderer, "review-analysis-button")).toThrow();
    expect(findByTestId(renderer, "review-schedule-control")).toBeTruthy();
    expect(systemBack.invoke()).toBe(true);
    expect(findByTestId(renderer, "history-panel")).toBeTruthy();
    press(renderer, "history-attempt-semantic-corrupt-arrow-attempt");
    expect(() => findByTestId(renderer, "history-attempt-detail")).toThrow();
    expect(collectText(findByTestId(renderer, "history-replay-unavailable"))).toBe(
      "Original Arrow Duel candidates are unavailable, so this attempt cannot be replayed safely."
    );
    expect(() => findByTestId(renderer, "review-board")).toThrow();
    expect(() => findByTestId(renderer, "review-analysis-button")).toThrow();
    expect(findByTestId(renderer, "review-schedule-control")).toBeTruthy();
    expect(systemBack.invoke()).toBe(true);
    expect(findByTestId(renderer, "history-panel")).toBeTruthy();
  });

  it("keeps malformed persisted rating keys out of History buckets and shows only replay feedback", () => {
    const store = new MemoryStore();
    store.seedPuzzles([sharedHistoryPuzzle()]);
    store.recordAttempt({
      id: "malformed-rating-key-attempt",
      source: "sprint",
      sessionId: "malformed-rating-key-session",
      puzzleId: "shared-history",
      mode: "standard",
      ratingKey: "   ",
      result: "wrong",
      submittedMove: "e2e4",
      expectedMove: "e2e3",
      startedAt: "2026-06-20T12:00:00.000Z",
      completedAt: "2026-06-20T12:00:05.000Z",
      ratingBefore: 600
    });
    const renderer = renderScreen({ practiceService: new PracticeService(store) });

    press(renderer, "history-tab");
    press(renderer, "history-range-max");

    expect(collectText(findByTestId(renderer, "history-rating-filters"))).toBe("All Puzzles");
    expect(() => findByTestId(renderer, "history-rating-   ")).toThrow();
    expect(() => findByTestId(renderer, "history-performance-card")).toThrow();
    expect(findByTestId(renderer, "history-attempt-malformed-rating-key-attempt")).toBeTruthy();

    press(renderer, "history-attempt-malformed-rating-key-attempt");
    expect(() => findByTestId(renderer, "history-attempt-detail")).toThrow();
    expect(collectText(findByTestId(renderer, "history-replay-unavailable"))).toBe(
      "The saved mode or rating context is invalid, so this attempt cannot be replayed safely."
    );
  });

  it("keeps History filters while returning from a record but resets them on a new process lifetime", () => {
    const store = new MemoryStore();
    store.seedPuzzles([sharedHistoryPuzzle()]);
    store.recordAttempt(historyAttempt({
      id: "process-local-filter-attempt",
      mode: "standard",
      ratingKey: "standard 5/20",
      completedAt: "2026-06-20T12:00:15.000Z"
    }));
    const service = new PracticeService(store);
    const firstSystemBack = createTestSystemBackSource("android");
    const firstRenderer = renderScreen({ practiceService: service, systemBack: firstSystemBack });

    press(firstRenderer, "history-tab");
    press(firstRenderer, "history-range-max");
    press(firstRenderer, "history-rating-standard 5/20");
    press(firstRenderer, "history-filter-wrong-only");
    press(firstRenderer, "history-attempt-process-local-filter-attempt");
    expect(findByTestId(firstRenderer, "review-board")).toBeTruthy();
    expect(() => findByTestId(firstRenderer, "history-attempt-detail")).toThrow();

    expect(firstSystemBack.invoke()).toBe(true);
    expect(findByTestId(firstRenderer, "history-panel")).toBeTruthy();
    expect(findByTestId(firstRenderer, "history-filter-wrong-only").props.accessibilityState).toEqual({ checked: true });
    expect(collectText(findByTestId(firstRenderer, "history-active-filter-summary"))).toContain("All Time");
    expect(collectText(findByTestId(firstRenderer, "history-active-filter-summary"))).toContain("Standard · 20s pace");

    act(() => {
      firstRenderer.unmount();
    });
    const secondRenderer = renderScreen({ practiceService: service, systemBack: createTestSystemBackSource("android") });
    press(secondRenderer, "history-tab");

    expect(findByTestId(secondRenderer, "history-panel")).toBeTruthy();
    expect(findByTestId(secondRenderer, "history-filter-wrong-only").props.accessibilityState).toEqual({ checked: false });
    expect(collectText(findByTestId(secondRenderer, "history-active-filter-summary"))).toContain("7 days");
    expect(collectText(findByTestId(secondRenderer, "history-active-filter-summary"))).toContain("All puzzles");
    expect(collectText(findByTestId(secondRenderer, "history-active-filter-summary"))).toContain("Sprint");
  });

  it("keeps history analysis review on the current puzzle after a retry is solved", async () => {
    const service = createMobilePracticeService("random1000");
    const renderer = renderScreen({ practiceService: service });

    startStandardSprint(renderer);
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    abandonSprint(renderer);

    press(renderer, "history-tab");
    const historyAttemptRows = renderer.root.findAll(
      (node) => typeof node.props.testID === "string" && node.props.testID.startsWith("history-attempt-")
    );
    const correctAttemptRow = historyAttemptRows.find((row) => collectText(row).includes("Correct"));
    expect(correctAttemptRow).toBeTruthy();
    const correctAttemptId = correctAttemptRow!.props.testID.replace("history-attempt-", "");
    expect(() => findByTestId(renderer, `history-attempt-${correctAttemptId}-review-due`)).toThrow();
    expect(() => findByTestId(renderer, `history-attempt-${correctAttemptId}-difficulty`)).toThrow();
    press(renderer, correctAttemptRow!.props.testID);

    const progressBeforeRetry = collectText(findByTestId(renderer, "review-progress"));
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");
    await settleFeedbackSnapshot();

    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-progress"))).toBe(progressBeforeRetry);
    expect(service.listHistory({ source: "scheduled_review" }) as unknown[]).toHaveLength(0);
  });

  it("replays Arrow Duel history review with the candidate order stored on the attempt", () => {
    const service = createMobilePracticeService("random1000");
    const completedAt = new Date().toISOString();
    const startedAt = new Date(Date.now() - 5000).toISOString();
    service.recordReviewAttempt({
      puzzleId: "00008",
      mode: "arrow_duel",
      ratingKey: "arrow duel 5/30",
      result: "wrong",
      submittedMove: "f2g3",
      expectedMove: "b2b1",
      startedAt,
      arrowDuelCandidateOrder: ["f2g3", "b2b1"]
    }, completedAt);
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "history-tab");
    press(renderer, "history-filter-toggle");
    press(renderer, "history-source-review");
    press(renderer, "history-rating-arrow duel 5/30");
    const historyAttemptRow = renderer.root.findAll(
      (node) => typeof node.props.testID === "string" && node.props.testID.startsWith("history-attempt-")
    )[0];
    press(renderer, historyAttemptRow.props.testID);

    expectText(renderer, "1 / 1 · Arrow Duel");
    expect(findByTestId(renderer, "review-arrow-duel-candidate-overlay-order-f2g3-b2b1")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-accessible-moves-open")).toThrow();
    expect(findByTestId(renderer, "review-schedule-control")).toBeTruthy();
  });

  it("shows a review button after a failed sprint with mistakes", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    await boardMove(renderer, "c4b5");
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(true);
    expect(countStyleValue(renderer.root, "rgba(37, 99, 235, 0.3)")).toBe(0);
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "a4b6");

    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(true);
    expect(countStyleValue(renderer.root, "rgba(37, 99, 235, 0.3)")).toBe(0);
    expect(collectText(renderer.root)).not.toContain("Sprint failed");

    await settleFeedbackSnapshot();

    expectText(renderer, "Sprint failed");
    expect(collectText(findByTestId(renderer, "sprint-result-reason"))).toBe("Three mistakes");
    expect(findByTestId(renderer, "sprint-result-reason").props.accessibilityLabel).toBe("Result: Three mistakes");
    expectText(renderer, "3 mistakes queued");
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain("Mistakes");
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain("Review your mistakes");
    expect(collectText(findByTestId(renderer, "sprint-result-mistakes"))).toBe("3");
    expect(collectText(renderer.root)).not.toContain("Start new sprint");
    const reviewButton = findByTestId(renderer, "review-mistakes-button");
    const playAgainButton = findByTestId(renderer, "play-again-button");
    expect(reviewButton).toBeTruthy();
    expect(playAgainButton).toBeTruthy();
    expect(collectText(reviewButton)).toContain("Review Mistakes");
    expect(hasStyleEntry(reviewButton, "backgroundColor", "#2563EB")).toBe(true);
    expect(hasStyleEntry(playAgainButton, "backgroundColor", "#2563EB")).toBe(false);
  });

  it("reviews missed puzzles from the completed sprint using the solving board", async () => {
    const service = createMobilePracticeService("random1000");
    const recordReviewAttempt = jest.spyOn(service, "recordReviewAttempt");
    jest.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));
    const renderer = renderScreen({
      practiceService: service,
      puzzleSelectionSeed: "history-review-6"
    });

    startStandardSprint(renderer);
    await boardMove(renderer, "c4b5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "a4b6");
    await settleFeedbackSnapshot();

    press(renderer, "review-mistakes-button");

    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-current-puzzle-id"))).toBe("000hf");
    expect(findByTestId(renderer, "review-board")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-schedule-state"))).toBe("Due tomorrow");
    expect(collectText(findByTestId(renderer, "review-schedule-remove"))).toBe("Remove from Review");
    press(renderer, "review-schedule-remove");
    press(renderer, "review-schedule-removal-confirm");
    expect(collectText(findByTestId(renderer, "review-schedule-state"))).toBe("Not scheduled for Review");
    expect(collectText(findByTestId(renderer, "review-schedule-add"))).toBe("Add to Review");
    expectText(renderer, "1 / 3 · Standard");
    expect(findByTestId(renderer, "review-previous").props.disabled).toBe(true);
    expect(findByTestId(renderer, "review-next").props.disabled).toBe(false);
    expect(findByTestId(renderer, "review-header-actions").findByProps({ testID: "review-reset-puzzle" })).toBeTruthy();
    press(renderer, "review-next");
    expectText(renderer, "2 / 3 · Standard");
    press(renderer, "review-previous");
    expectText(renderer, "1 / 3 · Standard");
    const reviewFen = findByTestId(renderer, "mock-chessboard").props.fen;
    await waitForAssertion(() => {
      expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe(new Chess(reviewFen).turn());
    });
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.withLetters).toBe(false);
    expect(findByTestId(renderer, "mock-chessboard").props.withNumbers).toBe(false);
    const reviewBoardFlipped = findByTestId(renderer, "mock-chessboard").props.flipped;
    expect(collectText(findByTestId(renderer, "board-coordinate-overlay"))).toContain(reviewBoardFlipped ? "hgfedcba" : "abcdefgh");
    expect(collectText(findByTestId(renderer, "board-coordinate-overlay"))).toContain(reviewBoardFlipped ? "12345678" : "87654321");
    const firstExpectedReviewMove = collectText(findByTestId(renderer, "review-current-expected-move"));
    await boardMove(renderer, firstExpectedReviewMove);

    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(false);

    await settleFeedbackSnapshot();
    expectText(renderer, "1 / 3 · Standard");
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);

    const secondExpectedReviewMove = collectText(findByTestId(renderer, "review-current-expected-move"));
    await boardMove(renderer, secondExpectedReviewMove);
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);

    await settleFeedbackSnapshot();
    expectText(renderer, "1 / 3 · Standard");
    expect(findByTestId(renderer, "review-next").props.disabled).toBe(false);
    expect(recordReviewAttempt).not.toHaveBeenCalled();
    press(renderer, "review-reset-puzzle");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(reviewFen);
    expectText(renderer, "1 / 3 · Standard");
    press(renderer, "review-next");
    expectText(renderer, "2 / 3 · Standard");
  });

  it("does not auto-start skipped post-sprint mistake reviews from the Review tab", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    await boardMove(renderer, "c4b5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "a4b6");
    await settleFeedbackSnapshot();

    expectText(renderer, "Sprint failed");
    press(renderer, "back-practice-button");
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();

    press(renderer, "review-tab");

    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-session")).toThrow();
    expect(findByTestId(renderer, "review-start-due").props.accessibilityState).toEqual({ disabled: true });
    expectText(renderer, "You're done for today");
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("0");
  });

  it("clears immediate session mistake reviews after exiting them once", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    await boardMove(renderer, "c4b5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "a4b6");
    await settleFeedbackSnapshot();

    press(renderer, "review-mistakes-button");
    expect(findByTestId(renderer, "review-session")).toBeTruthy();

    press(renderer, "review-exit");
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();

    press(renderer, "review-tab");

    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-session")).toThrow();
    expect(findByTestId(renderer, "review-start-due").props.accessibilityState).toEqual({ disabled: true });
    expectText(renderer, "You're done for today");
  });

  it("suppresses review auto-move callbacks and re-syncs the board after replies settle", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    await boardMove(renderer, "c4b5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "a4b6");
    await settleFeedbackSnapshot();

    press(renderer, "review-mistakes-button");

    const resetBoard = findByTestId(renderer, "mock-chessboard").props.mockResetBoard as jest.Mock;
    resetBoard.mockClear();

    await boardMove(renderer, "e2e6");

    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(false);
    expect(resetBoard).not.toHaveBeenCalled();

    await settleFeedbackSnapshot();

    expect(resetBoard).toHaveBeenCalledTimes(1);
    expect(resetBoard).toHaveBeenCalledWith(findByTestId(renderer, "mock-chessboard").props.fen);
    expectText(renderer, "1 / 3 · Standard");
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe("w");
  });

  it("shows a review queue before starting due reviews", () => {
    const service = createMobilePracticeService("random1000");
    const oldestDueDate = formatReviewDay("2026-06-21");
    const lastWrongDate = formatLocalCalendarDate("2026-06-20T12:00:05.000Z");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T12:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T12:00:05.000Z");
    jest.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");

    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-tab-badge"))).toBe("1");
    expect(hasStyleEntry(findByTestId(renderer, "review-tab-badge"), "backgroundColor", "#DC2626")).toBe(false);
    expect(() => findByTestId(renderer, "app-shell-header")).toThrow();
    expect(collectText(findByTestId(renderer, "review-action-header"))).not.toContain("Due reviews");
    expect(collectText(findByTestId(renderer, "review-action-header"))).toContain("Review");
    expect(collectText(findByTestId(renderer, "review-action-header"))).not.toContain("Scheduled mistake reviews");
    expect(findByTestId(renderer, "review-due-card")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-toggle")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-filter-toggle"))).toBe("");
    expect(collectText(findByTestId(renderer, "review-action-header"))).not.toContain("≡");
    expect(findByTestId(renderer, "review-filter-toggle").props.accessibilityState).toEqual({ expanded: false });
    expect(() => findByTestId(renderer, "review-queue-filters")).toThrow();
    expect(() => findByTestId(renderer, "review-due-items")).toThrow();
    expect(() => findByTestId(renderer, "review-context-list")).toThrow();
    expect(() => findByTestId(renderer, "review-difficulty-list")).toThrow();
    expect(collectText(findByTestId(renderer, "review-tomorrow-count"))).toBe("0");
    expect(collectText(findByTestId(renderer, "review-next-seven-days-count"))).toBe("0");
    expect(collectText(findByTestId(renderer, "review-total-count"))).toBe("1");
    expect(() => findByTestId(renderer, "review-active-filter-summary")).toThrow();
    expectText(renderer, "Today");
    expect(findByTestId(renderer, "review-due-card").props.accessibilityLabel).toContain("All due · Ready now");
    expect(collectText(findByTestId(renderer, "review-due-summary"))).toBe("Ready now");
    expect(collectText(findByTestId(renderer, "review-next-due"))).toBe(`Oldest: ${oldestDueDate}`);
    expect(findByTestId(renderer, "review-next-due").props.accessibilityLabel).toBe(`Oldest due ${oldestDueDate}`);
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("0 / 1");
    expect(() => findByTestId(renderer, "review-overdue-count")).toThrow();
    expect(collectText(findByTestId(renderer, "review-due-card"))).not.toContain("Overdue");
    expectText(renderer, `Oldest: ${oldestDueDate}`);
    expectText(renderer, "Review 1");
    expect(findByTestId(renderer, "review-start-due")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-session")).toThrow();

    press(renderer, "review-filter-toggle");
    expect(findByTestId(renderer, "review-filter-toggle").props.accessibilityState).toEqual({ expanded: true });
    expect(findByTestId(renderer, "review-active-filter-summary")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toContain("All due");
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).not.toContain("1 overdue");
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toContain("1 total");
    expect(findByTestId(renderer, "review-queue-filters")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-all")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-overdue")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-failed")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-mode-standard")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-arrow-duel")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-speed-20")).toBeTruthy();
    expect(findByTestId(renderer, "review-due-items")).toBeTruthy();
    expect(findByTestId(renderer, "review-context-list")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-context-list"))).toContain("Standard · 20s pace");
    expect(collectText(findByTestId(renderer, "review-context-list"))).not.toContain("standard 5/20");
    expectText(renderer, `Last wrong ${lastWrongDate}`);
    expectText(renderer, "1d interval");
    expectText(renderer, "Standard · 20s pace");
    expect(collectText(renderer.root)).not.toContain("Source sprint:");
    expect(collectText(renderer.root)).not.toContain("Review 1 · Lapses 1");
    const dueItemRows = renderer.root.findAll(
      (node) => typeof node.props.testID === "string"
        && node.props.testID.startsWith("review-due-item-")
        && node.props.accessibilityRole === "button"
    );
    expect(dueItemRows.length).toBeGreaterThan(0);
    expect(dueItemRows[0]!.props.accessibilityLabel).toContain("Source sprint: Standard · 20s pace");
    expect(dueItemRows[0]!.props.accessibilityLabel).toContain("Review 1");
    expect(dueItemRows[0]!.props.accessibilityLabel).toContain("Lapses 0");
    expect(collectText(findByTestId(renderer, `${dueItemRows[0]!.props.testID}-meta`))).toContain("Due now · 1d interval · Standard · 20s pace");
    expect(() => findByTestId(renderer, `${dueItemRows[0]!.props.testID}-badge`)).toThrow();

    press(renderer, "review-filter-failed");
    expect(findByTestId(renderer, "review-start-due").props.accessibilityState).toEqual({ disabled: true });
    expect(collectText(findByTestId(renderer, "review-due-summary"))).toBe("No matching scheduled reviews");
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toContain("Failed again");
    press(renderer, "review-filter-all");

    press(renderer, "review-filter-overdue");
    expect(findByTestId(renderer, "review-start-due").props.accessibilityState).toEqual({ disabled: true });
    expect(collectText(findByTestId(renderer, "review-due-summary"))).toBe("No matching scheduled reviews");
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toContain("Overdue");
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).not.toContain("1 overdue");
    press(renderer, "review-filter-all");

    press(renderer, "review-filter-arrow-duel");
    expect(findByTestId(renderer, "review-start-due").props.accessibilityState).toEqual({ disabled: true });
    expect(collectText(findByTestId(renderer, "review-due-summary"))).toBe("No matching scheduled reviews");
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toContain("Arrow Duel only");
    expect(collectText(renderer.root)).not.toContain(`Last wrong ${lastWrongDate}`);
    press(renderer, "review-filter-speed-20");
    expect(collectText(findByTestId(renderer, "review-due-summary"))).toBe("Ready now");
    expect(collectText(findByTestId(renderer, "review-next-due"))).toBe(`Oldest: ${oldestDueDate}`);
    expect(findByTestId(renderer, "review-next-due").props.accessibilityLabel).toBe(`Oldest due ${oldestDueDate}`);
    expect(findByTestId(renderer, "review-due-card").props.accessibilityLabel).toContain("20s pace · Ready now");
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("0 / 1");
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toContain("20s pace");
    press(renderer, "review-filter-all");

    const filteredDueItemRows = renderer.root.findAll(
      (node) => typeof node.props.testID === "string"
        && node.props.testID.startsWith("review-due-item-")
        && node.props.accessibilityRole === "button"
    );
    expect(filteredDueItemRows.length).toBeGreaterThan(0);
    act(() => {
      filteredDueItemRows[0]?.props.onPress();
    });

    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expectText(renderer, "1 / 1 · Standard");
    expect(findByTestId(renderer, "review-context-strip")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-source-pill")).toThrow();
    expect(() => findByTestId(renderer, "review-theme-pill")).toThrow();
    expect(() => findByTestId(renderer, "review-analysis-button")).toThrow();
    expect(collectText(findByTestId(renderer, "review-timer"))).toBe("00:40");
    expect(() => findByTestId(renderer, "review-next")).toThrow();
    expect(() => findByTestId(renderer, "review-previous")).toThrow();
    expect(() => findByTestId(renderer, "review-start-session-mistakes")).toThrow();
  });

  it("counts reviews as overdue after the next 4 AM review-day rollover", () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    jest.setSystemTime(new Date("2026-06-22T04:00:00.000Z"));
    const renderer = renderScreen({ practiceService: service });

    expect(collectText(findByTestId(renderer, "practice-review-overdue-count"))).toContain("1");

    press(renderer, "review-tab");

    expect(collectText(findByTestId(renderer, "review-due-summary"))).toBe("Overdue now");
    expect(() => findByTestId(renderer, "review-overdue-count")).toThrow();
    expect(() => findByTestId(renderer, "review-overdue-summary")).toThrow();
    expect(findByTestId(renderer, "review-due-card").props.accessibilityLabel).toContain("All due · Overdue now");
    press(renderer, "review-filter-toggle");
    press(renderer, "review-filter-overdue");
    expect(findByTestId(renderer, "review-start-due").props.accessibilityState).toEqual({ disabled: false });
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toContain("1 overdue");
    expect(collectText(findByTestId(renderer, "review-due-items"))).toContain("Overdue");
  });

  it("offers regular practice from an empty review queue", () => {
    const renderer = renderScreen();

    press(renderer, "review-tab");

    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
    expect(findByTestId(renderer, "review-empty-state")).toBeTruthy();
    expectText(renderer, "You're done for today");
    expectText(renderer, "Next review appears after a missed puzzle reaches its due time");
    expect(findByTestId(renderer, "review-empty-practice")).toBeTruthy();
    expect(findByTestId(renderer, "review-start-due").props.accessibilityState).toEqual({ disabled: true });

    press(renderer, "review-empty-practice");

    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
    expect(findByTestId(renderer, "practice-mode-standard")).toBeTruthy();
  });

  it("shows the next scheduled review date when the queue has nothing due yet", () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2099-01-01T12:00:00.000Z"
    );
    service.submitMove("c4b5", "2099-01-01T12:00:05.000Z");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");

    expect(findByTestId(renderer, "review-empty-state")).toBeTruthy();
    expectText(renderer, "You're done for today");
    expectText(renderer, `Next review due ${formatReviewDay("2099-01-02")}`);
    expect(findByTestId(renderer, "review-start-due").props.accessibilityState).toEqual({ disabled: true });
  });

  it("shows tomorrow, next-seven-day, and total review workload", () => {
    const service = createMobilePracticeService("random1000");
    const contexts = [
      { puzzleId: "00008", mode: "standard" as const, ratingKey: "forecast tomorrow" },
      { puzzleId: "000hf", mode: "standard" as const, ratingKey: "forecast day two" },
      { puzzleId: "0018S", mode: "standard" as const, ratingKey: "forecast day seven" },
      { puzzleId: "00008", mode: "arrow_duel" as const, ratingKey: "forecast day eight" }
    ];
    service.recordReviewResult(contexts[0]!, "wrong", "2026-06-20T12:00:00.000Z");
    service.recordReviewResult(contexts[1]!, "wrong", "2026-06-21T12:00:00.000Z");
    service.recordReviewResult(contexts[2]!, "wrong", "2026-06-26T12:00:00.000Z");
    service.recordReviewResult(contexts[3]!, "wrong", "2026-06-27T12:00:00.000Z");
    const renderer = renderScreen({
      currentTimeMs: () => new Date("2026-06-20T20:00:00.000Z").getTime(),
      practiceService: service
    });

    press(renderer, "review-tab");

    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("0");
    expect(collectText(findByTestId(renderer, "review-tomorrow-count"))).toBe("1");
    expect(collectText(findByTestId(renderer, "review-next-seven-days-count"))).toBe("3");
    expect(collectText(findByTestId(renderer, "review-total-count"))).toBe("4");
    expect(findByTestId(renderer, "review-forecast").props.accessibilityLabel).toBe(
      "1 review tomorrow, 3 reviews in the next 7 days, 4 reviews total"
    );
  });

  it("offers dev controls to promote the next future review date and schedule a test notification", async () => {
    const now = new Date("2026-06-20T20:00:00.000Z");
    const scheduler = new FakeReviewReminderScheduler();
    const service = createMobilePracticeService("random1000");
    service.recordReviewResult(
      { puzzleId: "00008", mode: "standard", ratingKey: "standard 5/20" },
      "wrong",
      "2026-06-20T12:00:00.000Z"
    );
    service.recordReviewResult(
      { puzzleId: "000hf", mode: "standard", ratingKey: "standard 5/20" },
      "wrong",
      "2026-06-20T18:00:00.000Z"
    );
    service.recordReviewResult(
      { puzzleId: "0018S", mode: "standard", ratingKey: "standard 5/20" },
      "wrong",
      "2026-06-21T12:00:00.000Z"
    );
    const renderer = renderScreen({
      currentTimeMs: () => now.getTime(),
      practiceService: service,
      reviewReminderScheduler: scheduler
    });
    await act(async () => {});

    press(renderer, "review-tab");
    expect(findByTestId(renderer, "review-dev-controls")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("0");
    expect(findByTestId(renderer, "review-start-due").props.accessibilityState).toEqual({ disabled: true });

    press(renderer, "review-dev-promote-next-due");

    expect(collectText(findByTestId(renderer, "review-dev-status"))).toContain("2 reviews from 2026-06-21 due today");
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("0 / 2");
    expect(findByTestId(renderer, "review-start-due").props.accessibilityState).toEqual({ disabled: false });
    expect(service.listReviewQueue().find((review) => review.puzzleId === "0018S")?.dueDay).toBe("2026-06-22");

    await pressAsync(renderer, "review-dev-test-notification");

    expect(scheduler.currentReminder).toMatchObject({
      dueCount: 2,
      body: "2 reviews are ready",
      route: "review"
    });
    expect(new Date(scheduler.currentReminder?.scheduledAt ?? "").getTime()).toBe(now.getTime() + 5000);
    expect(collectText(findByTestId(renderer, "review-dev-status"))).toContain("Test notification scheduled");
  });

  it("prunes orphaned review queue rows before showing Review totals", () => {
    const service = createMobilePracticeService("random1000");
    service.recordReviewResult(
      { puzzleId: "000hf", mode: "standard", ratingKey: "standard 5/20" },
      "wrong",
      "2026-06-20T00:00:00.000Z"
    );
    service.recordReviewResult(
      { puzzleId: "missing-puzzle", mode: "standard", ratingKey: "standard 5/20" },
      "wrong",
      "2026-06-20T00:00:00.000Z"
    );
    expect(service.listReviewQueue()).toHaveLength(2);
    jest.setSystemTime(new Date("2026-06-22T00:00:00.000Z"));

    const renderer = renderScreen({ practiceService: service });
    press(renderer, "review-tab");

    expect(service.listReviewQueue()).toHaveLength(1);
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("0 / 1");
    expect(collectText(findByTestId(renderer, "review-total-count"))).toBe("1");
    expect(findByTestId(renderer, "review-due-card").props.accessibilityLabel).toContain("1 total");
  });

  it("keeps official due review contexts separate by sprint run", () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    service.recordReviewResult(
      { puzzleId: "00008", mode: "arrow_duel", ratingKey: "arrow duel 5/30" },
      "wrong",
      "2026-06-20T00:00:10.000Z"
    );
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");

    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
    expect(findByTestId(renderer, "review-forecast")).toBeTruthy();
    expect(findByTestId(renderer, "review-start-due")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-context-list")).toThrow();
    press(renderer, "review-filter-toggle");
    expect(findByTestId(renderer, "review-context-list")).toBeTruthy();
    expect(findByTestId(renderer, "review-context-standard-standard-5-20")).toBeTruthy();
    expect(findByTestId(renderer, "review-context-arrow-duel-arrow-duel-5-30")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-session")).toThrow();

    press(renderer, "review-context-standard-standard-5-20");

    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expectText(renderer, "1 / 2 · Standard");
    expect(collectText(findByTestId(renderer, "review-timer"))).toBe("00:40");
  });

  it("auto-chains the default due review start across visible context groups", async () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    service.recordReviewResult(
      { puzzleId: "000hf", mode: "standard", ratingKey: "standard 5/30" },
      "wrong",
      "2026-06-20T00:00:10.000Z"
    );
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");
    press(renderer, "review-filter-toggle");
    expect(findByTestId(renderer, "review-context-standard-standard-5-20")).toBeTruthy();
    expect(findByTestId(renderer, "review-context-standard-standard-5-30")).toBeTruthy();
    press(renderer, "review-start-due");

    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-timer"))).toBe("00:40");
    expect(() => findByTestId(renderer, "review-accessible-moves-open")).toThrow();

    await boardMove(renderer, "c4b5");
    await settleFeedbackSnapshot();

    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-timer"))).toBe("01:00");
    expect(() => findByTestId(renderer, "review-line-continue")).toThrow();
    expect(() => findByTestId(renderer, "review-source-pill")).toThrow();
    expect(() => findByTestId(renderer, "review-panel")).toThrow();
  });

  it("hides scheduling controls from scheduled Review and centers its header", () => {
    jest.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    const service = createDueReviewService(2);
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    expect(() => findByTestId(renderer, "review-schedule-control")).toThrow();
    expect(() => findByTestId(renderer, "review-schedule-state")).toThrow();
    expect(() => findByTestId(renderer, "review-schedule-remove")).toThrow();
    expect(() => findByTestId(renderer, "review-context-actions-bottom")).toThrow();
    expect(flattenTestStyle(findByTestId(renderer, "review-header-actions").props.style).width).toBe(
      flattenTestStyle(findByTestId(renderer, "review-exit").props.style).width
    );
    expect(service.listHistory({ source: "scheduled_review" })).toHaveLength(0);
    expect(service.listReviewQueue()).toHaveLength(2);
  });

  it("returns to the Review panel automatically after the last due answer", async () => {
    jest.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");
    await settleFeedbackSnapshot();

    expect(service.listHistory({ source: "scheduled_review" })).toHaveLength(1);
    expect(service.listReviewQueue()).toHaveLength(1);
    expect(() => findByTestId(renderer, "review-session")).toThrow();
    expect(() => findByTestId(renderer, "review-line-continue")).toThrow();
    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("1 / 1");
  });

  it("starts the canonical oldest due item before a lexically earlier newer context", () => {
    const service = createMobilePracticeService("random1000");
    service.recordReviewResult(
      { puzzleId: "000hf", mode: "standard", ratingKey: "z-oldest standard 5/20" },
      "wrong",
      "2026-06-18T12:00:00.000Z"
    );
    service.recordReviewResult(
      { puzzleId: "00008", mode: "standard", ratingKey: "a-newer standard 5/30" },
      "wrong",
      "2026-06-20T12:00:00.000Z"
    );
    const canonicalDueItems = service.getDueReviewItems("2026-06-22T12:00:00.000Z");
    expect(canonicalDueItems.map((item) => item.puzzle.id)).toEqual(["000hf", "00008"]);
    const renderer = renderScreen({
      currentTimeMs: () => new Date("2026-06-22T12:00:00.000Z").getTime(),
      practiceService: service
    });

    press(renderer, "review-tab");
    press(renderer, "review-filter-toggle");
    const contextButtonTestIDs = [...new Set(renderer.root.findAll(
      (node) => typeof node.props.testID === "string"
        && node.props.testID.startsWith("review-context-")
        && node.props.accessibilityRole === "button"
    ).map((button) => button.props.testID as string))];
    expect(contextButtonTestIDs).toEqual([
      "review-context-standard-z-oldest-standard-5-20",
      "review-context-standard-a-newer-standard-5-30"
    ]);

    press(renderer, "review-start-due");

    expect(collectText(findByTestId(renderer, "review-current-puzzle-id"))).toBe("000hf");
    expect(collectText(findByTestId(renderer, "review-timer"))).toBe("00:40");
  });

  it("records official due review mistakes immediately but keeps analysis reviews unrecorded", async () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    await boardMove(renderer, "c4b5");
    await settleFeedbackSnapshot();

    const officialReviewAttempts = service.listHistory({ source: "scheduled_review" }) as Array<{ result: string; submittedMove: string }>;
    expect(officialReviewAttempts).toHaveLength(1);
    expect(officialReviewAttempts[0]).toMatchObject({ result: "wrong", submittedMove: "c4b5" });
    expect(() => findByTestId(renderer, "review-session")).toThrow();
    expect(() => findByTestId(renderer, "review-line-continue")).toThrow();
    expect(findByTestId(renderer, "review-panel")).toBeTruthy();

    press(renderer, "history-tab");
    press(renderer, "history-filter-toggle");
    press(renderer, "history-source-review");
    expectHistoryRowAccessibility(renderer, "Played c4b5 · Best e2e6");
    const historyAttemptRow = renderer.root.findAll(
      (node) => typeof node.props.testID === "string" && node.props.testID.startsWith("history-attempt-")
    )[0];
    press(renderer, historyAttemptRow.props.testID);
    expect(findByTestId(renderer, "review-board")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-detail")).toThrow();
    press(renderer, "review-analysis-button");

    expect(service.listHistory({ source: "scheduled_review" }) as unknown[]).toHaveLength(1);
  });

  it("records official due review success after the scheduled puzzle is solved", async () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    jest.setSystemTime(new Date("2026-06-21T00:01:00.000Z"));
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-source-pill")).toThrow();
    expect(() => findByTestId(renderer, "review-theme-pill")).toThrow();
    expect(() => findByTestId(renderer, "review-analysis-button")).toThrow();
    expect(() => findByTestId(renderer, "review-reset-puzzle")).toThrow();
    expect(findByTestId(renderer, "review-side-to-move").props.accessibilityLabel).toBe("White to move");
    expect(collectText(findByTestId(renderer, "review-current-expected-move"))).toBe("e2e6");
    expect(collectText(findByTestId(renderer, "review-board-state"))).toBe("ready");

    await boardMove(renderer, "e2e6");
    expect(collectText(findByTestId(renderer, "review-board-state"))).toBe("locked");
    await settleFeedbackSnapshot();
    expect(service.listHistory({ source: "scheduled_review" }) as unknown[]).toHaveLength(0);
    expect(collectText(findByTestId(renderer, "review-current-expected-move"))).toBe("e6f7");
    expect(collectText(findByTestId(renderer, "review-board-state"))).toBe("ready");

    await boardMove(renderer, "e6f7");
    await settleFeedbackSnapshot();

    expect(() => findByTestId(renderer, "review-session")).toThrow();
    expect(() => findByTestId(renderer, "review-line-continue")).toThrow();
    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
    const officialReviewAttempts = service.listHistory({ source: "scheduled_review" }) as Array<{
      expectedMove: string;
      result: string;
      submittedMove: string;
    }>;
    expect(officialReviewAttempts).toHaveLength(1);
    expect(officialReviewAttempts[0]).toMatchObject({
      result: "correct",
      submittedMove: "e6f7",
      expectedMove: "e6f7"
    });
  });

  it("records scheduled review elapsed time from review start to answer", async () => {
    jest.setSystemTime(new Date("2026-06-21T00:01:00.000Z"));
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    await boardMove(renderer, "c4b5");
    await flushMicrotasks();

    const officialReviewAttempts = service.listHistory({ source: "scheduled_review" }) as Array<{
      startedAt: string;
      completedAt: string;
    }>;
    expect(officialReviewAttempts).toHaveLength(1);
    expect(officialReviewAttempts[0]).toMatchObject({
      startedAt: "2026-06-21T00:01:00.000Z",
      completedAt: "2026-06-21T00:01:05.000Z"
    });

    press(renderer, "review-exit");
    press(renderer, "history-tab");
    press(renderer, "history-filter-toggle");
    press(renderer, "history-source-review");

    await waitForAssertion(() => {
      expect(historyAttemptRows(renderer).length).toBeGreaterThan(0);
    });
    const historyAttemptRow = historyAttemptRows(renderer)[0];
    expect(collectText(findByTestId(renderer, `${historyAttemptRow!.props.testID}-identity`))).toMatch(
      /^ID .+ · Rating \d+$/
    );
    expect(collectText(findByTestId(renderer, `${historyAttemptRow!.props.testID}-meta`))).toContain("Review · 5s");
  });

  it("gives official due reviews twice the original sprint pace", () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");

    expect(collectText(findByTestId(renderer, "review-timer"))).toBe("00:40");

    act(() => {
      jest.advanceTimersByTime(40_500);
    });

    expect(service.listHistory({ source: "scheduled_review" }) as Array<{ result: string; submittedMove: string }>).toEqual([
      expect.objectContaining({ result: "wrong", submittedMove: "__timeout__" })
    ]);
    expect(() => findByTestId(renderer, "review-session")).toThrow();
    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-line-continue")).toThrow();
  });

  it("keeps a timed-out review session mounted until Predictive Back settles", () => {
    const systemBack = createTestSystemBackSource("android");
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    const renderer = renderScreen({ practiceService: service, systemBack });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    act(() => {
      jest.advanceTimersByTime(39_750);
    });
    systemBack.startPredictive("left");

    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(collectText(findByTestId(renderer, "mobile-back-destination-preview-label"))).toBe("Review");
    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(service.listHistory({ source: "scheduled_review" }) as Array<{ submittedMove: string }>).toEqual([
      expect.objectContaining({ submittedMove: "__timeout__" })
    ]);

    expect(systemBack.commitPredictive()).toBe(true);
    expect(() => findByTestId(renderer, "review-session")).toThrow();
    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
  });

  it("keeps the daily review denominator fixed and resumes an unfinished puzzle after exit", () => {
    jest.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    const service = createDueReviewService(2);
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    const currentPuzzleIdMetric = findByTestId(renderer, "review-current-puzzle-id");
    expectNoRenderedTextHasNonPositiveFontSize(renderer);
    expect(hasStyleEntry(currentPuzzleIdMetric, "height", 0)).toBe(true);
    expect(hasStyleEntry(currentPuzzleIdMetric, "opacity", 0)).toBe(true);
    expect(hasStyleEntry(currentPuzzleIdMetric, "width", 0)).toBe(true);
    const firstPuzzleId = collectText(currentPuzzleIdMetric);
    expectText(renderer, "1 / 2 · Standard");

    press(renderer, "review-exit");
    expect(service.listHistory({ source: "scheduled_review" })).toHaveLength(0);
    press(renderer, "review-start-due");
    expect(collectText(findByTestId(renderer, "review-current-puzzle-id"))).toBe(firstPuzzleId);
    expectText(renderer, "1 / 2 · Standard");

    act(() => {
      jest.advanceTimersByTime(40_500);
    });
    const secondPuzzleId = collectText(findByTestId(renderer, "review-current-puzzle-id"));
    expect(secondPuzzleId).not.toBe(firstPuzzleId);
    expectText(renderer, "2 / 2 · Standard");
    expect(collectText(findByTestId(renderer, "review-timer"))).toBe("00:40");
    expect(() => findByTestId(renderer, "review-line-continue")).toThrow();

    press(renderer, "review-exit");
    expect(service.listHistory({ source: "scheduled_review" })).toHaveLength(1);
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("1 / 2");
    expect(findByTestId(renderer, "review-today-history")).toBeTruthy();
    press(renderer, "review-start-due");
    expect(collectText(findByTestId(renderer, "review-current-puzzle-id"))).toBe(secondPuzzleId);
    expectText(renderer, "2 / 2 · Standard");
  });

  it("shows today's completed reviews with result, analysis, and schedule-neutral retry", () => {
    jest.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    const service = createDueReviewService(2);
    service.recordReviewAttempt({
      puzzleId: "review-badge-0",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e2e4",
      expectedMove: "e2e4",
      startedAt: "2026-06-21T11:00:00.000Z"
    }, "2026-06-21T11:00:05.000Z");
    service.recordReviewAttempt({
      puzzleId: "review-badge-1",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "wrong",
      submittedMove: "e2e3",
      expectedMove: "e2e4",
      startedAt: "2026-06-21T11:01:00.000Z"
    }, "2026-06-21T11:01:08.000Z");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("2 / 2");
    expect(findByTestId(renderer, "review-due-card").props.accessibilityRole).toBeUndefined();
    expect(findByTestId(renderer, "review-due-card").props.onPress).toBeUndefined();
    expect(findByTestId(renderer, "review-today-history")).toBeTruthy();
    const todayRowTestIDs = [...new Set(renderer.root.findAll(
      (node) => typeof node.props.testID === "string"
        && node.props.testID.startsWith("review-today-attempt-")
        && node.props.accessibilityRole === "button"
    ).map((row) => row.props.testID as string))];
    expect(todayRowTestIDs).toHaveLength(2);
    expect(collectText(findByTestId(renderer, "review-today-history"))).toContain("Correct");
    expect(collectText(findByTestId(renderer, "review-today-history"))).toContain("Wrong");
    const wrongRowTestID = todayRowTestIDs.find((testID) => collectText(findByTestId(renderer, testID)).includes("Wrong"));
    expect(wrongRowTestID).toBeTruthy();
    const queueBeforeReplay = service.listReviewQueue();

    press(renderer, wrongRowTestID!);
    expect(() => findByTestId(renderer, "review-source-pill")).toThrow();
    expect(findByTestId(renderer, "review-analysis-button")).toBeTruthy();
    expect(findByTestId(renderer, "review-reset-puzzle")).toBeTruthy();
    press(renderer, "review-analysis-button");

    expect(service.listHistory({ source: "scheduled_review" })).toHaveLength(2);
    expect(service.listReviewQueue()).toEqual(queueBeforeReplay);
  });

  it("opens review analysis without mutating the active review line", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    await boardMove(renderer, "c4b5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "a4b6");
    await settleFeedbackSnapshot();
    press(renderer, "review-mistakes-button");

    const reviewFen = findByTestId(renderer, "mock-chessboard").props.fen;
    expect(collectText(renderer.root)).toContain("Analysis");
    expect(collectText(renderer.root)).not.toContain("Analyze this position without changing the review line.");
    expect(findByTestId(renderer, "review-reset-puzzle")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-analysis-button"))).toBe("Analysis");
    expect(collectText(findByTestId(renderer, "review-analysis-toolbar"))).not.toContain("⌕");
    press(renderer, "review-analysis-button");

    expect(findByTestId(renderer, "review-analysis-line-0")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-close-analysis"))).toBe("");
    expect(collectText(findByTestId(renderer, "review-analysis-back"))).toBe("");
    expect(collectText(findByTestId(renderer, "review-analysis-forward"))).toBe("");
    expect(collectText(findByTestId(renderer, "review-analysis-reset"))).toBe("↺");
    expect(collectText(findByTestId(renderer, "review-analysis-flip"))).toBe("");
    expect(collectText(findByTestId(renderer, "review-analysis-toolbar"))).not.toContain("×");
    expect(collectText(findByTestId(renderer, "review-analysis-toolbar"))).not.toContain("‹");
    expect(collectText(findByTestId(renderer, "review-analysis-toolbar"))).not.toContain("›");
    expect(collectText(findByTestId(renderer, "review-analysis-toolbar"))).toContain("↺");
    expect(collectText(findByTestId(renderer, "review-analysis-toolbar"))).not.toContain("⇄");
    expect(collectText(findByTestId(renderer, "review-analysis-engine-status"))).toBe("Local hint");
    expect(findByTestId(renderer, "analysis-arrow-overlay")).toBeTruthy();
    expect(collectText(renderer.root)).toContain("Qxe6+");
    expect(collectText(renderer.root)).toContain("M1");
    expect(collectText(renderer.root)).not.toContain("1. e2e6");
    expect(collectText(findByTestId(renderer, "review-analysis-line-0"))).toMatch(/^M1.*Qxe6\+/);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe(new Chess(reviewFen).turn());
    expect(findByTestId(renderer, "review-analysis-back").props.disabled).toBe(true);
    expect(findByTestId(renderer, "review-analysis-forward").props.disabled).toBe(true);
    expect(findByTestId(renderer, "review-analysis-reset")).toBeTruthy();
    expect(() => press(renderer, "review-analysis-forward")).toThrow("review-analysis-forward is disabled");

    press(renderer, "review-analysis-line-0");
    await flushMicrotasks();
    const candidateLineFen = findByTestId(renderer, "mock-chessboard").props.fen;
    expect(candidateLineFen).not.toBe(reviewFen);
    expect(findByTestId(renderer, "review-analysis-back").props.disabled).toBe(false);

    press(renderer, "review-analysis-back");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(reviewFen);

    const analysisMove = firstLegalMoveNotIn(reviewFen, ["e2e6"]);
    const analysisFen = mustFenAfterMove(reviewFen, analysisMove);
    await boardMove(renderer, analysisMove);
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(analysisFen);
    expect(findByTestId(renderer, "review-analysis-back").props.disabled).toBe(false);
    expect(findByTestId(renderer, "review-analysis-forward").props.disabled).toBe(true);

    press(renderer, "review-analysis-reset");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(reviewFen);
    expect(findByTestId(renderer, "review-analysis-back").props.disabled).toBe(true);
    expect(findByTestId(renderer, "review-analysis-forward").props.disabled).toBe(true);
    expect(findByTestId(renderer, "review-analysis-line-0")).toBeTruthy();

    await boardMove(renderer, analysisMove);
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(analysisFen);

    press(renderer, "review-analysis-back");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(reviewFen);
    expect(findByTestId(renderer, "review-analysis-forward").props.disabled).toBe(false);

    press(renderer, "review-analysis-forward");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(analysisFen);

    press(renderer, "review-reset-puzzle");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(reviewFen);
    expect(() => findByTestId(renderer, "review-close-analysis")).toThrow();
    expect(() => findByTestId(renderer, "review-analysis-line-0")).toThrow();
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(reviewFen);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
  });

  it("streams native Stockfish depth updates into review analysis rows", async () => {
    const stockfish = createScriptedStockfishTransport((command, emit) => {
      if (command === "go depth 8") {
        void Promise.resolve().then(() => {
          emit("info depth 4 multipv 1 score mate 1 pv e2e6");
        });
      }
      if (command === "go depth 20") {
        void Promise.resolve().then(() => {
          emit("info depth 12 multipv 1 score mate 1 pv e2e6");
          emit("bestmove e2e6");
        });
      }
    });
    const renderer = renderStandardSequenceScreen({
      stockfish: { createTransport: () => stockfish.transport }
    });

    startStandardSprint(renderer);
    await boardMove(renderer, "c4b5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "a4b6");
    await settleFeedbackSnapshot();
    press(renderer, "review-mistakes-button");

    press(renderer, "review-analysis-button");
    await waitForAssertion(() => {
      expect(stockfish.commands).toContain("go depth 8");
      expect(collectText(findByTestId(renderer, "review-analysis-engine-status"))).toBe("SF 18 NNUE · Depth 4/20");
      expect(collectText(findByTestId(renderer, "review-analysis-line-0"))).toMatch(/^M1.*Qxe6\+/);
    });

    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitForAssertion(() => {
      expect(stockfish.commands).toContain("go depth 20");
      expect(collectText(findByTestId(renderer, "review-analysis-engine-status"))).toBe("SF 18 NNUE · Depth 12");
      expect(collectText(findByTestId(renderer, "review-analysis-line-0"))).toMatch(/^M1.*Qxe6\+/);
    });
  });

  it("stops a running native Stockfish search when review analysis closes", async () => {
    const stockfish = createScriptedStockfishTransport((command, emit) => {
      if (command === "go depth 8") {
        void Promise.resolve().then(() => {
          emit("info depth 4 multipv 1 score mate 1 pv e2e6");
        });
      }
      if (command === "go depth 20") {
        void Promise.resolve().then(() => {
          emit("info depth 12 multipv 1 score mate 1 pv e2e6");
        });
      }
    });
    const renderer = renderStandardSequenceScreen({
      stockfish: { createTransport: () => stockfish.transport }
    });

    startStandardSprint(renderer);
    await boardMove(renderer, "c4b5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "a4b6");
    await settleFeedbackSnapshot();
    press(renderer, "review-mistakes-button");
    press(renderer, "review-analysis-button");

    await waitForAssertion(() => {
      expect(stockfish.commands).toContain("go depth 8");
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitForAssertion(() => {
      expect(stockfish.commands).toContain("go depth 20");
      expect(collectText(findByTestId(renderer, "review-analysis-engine-status"))).toBe("SF 18 NNUE · Depth 12/20");
    });

    press(renderer, "review-close-analysis");

    expect(stockfish.commands.at(-1)).toBe("stop");
    expect(() => findByTestId(renderer, "review-close-analysis")).toThrow();
  });

  it("offers an actionable retry when native Stockfish startup fails", async () => {
    const stockfish = createScriptedStockfishTransport((command, emit) => {
      if (command === "go depth 8") {
        void Promise.resolve().then(() => {
          emit("info depth 4 multipv 1 score mate 1 pv e2e6");
          emit("bestmove e2e6");
        });
      }
    });
    const start = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(new Error("NNUE assets unavailable"))
      .mockResolvedValue(undefined);
    stockfish.transport.start = start;
    const renderer = renderStandardSequenceScreen({
      stockfish: {
        createTransport: () => stockfish.transport,
        prewarm: async () => false
      }
    });

    startStandardSprint(renderer);
    await boardMove(renderer, "c4b5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "a4b6");
    await settleFeedbackSnapshot();
    press(renderer, "review-mistakes-button");
    press(renderer, "review-analysis-button");

    await waitForAssertion(() => {
      expect(findByTestId(renderer, "review-analysis-error")).toBeTruthy();
      expect(collectText(findByTestId(renderer, "review-analysis-error"))).toContain(
        "Stockfish couldn't start"
      );
      expect(findByTestId(renderer, "review-analysis-retry")).toBeTruthy();
    });

    press(renderer, "review-analysis-retry");

    await waitForAssertion(() => {
      expect(start).toHaveBeenCalledTimes(2);
      expect(collectText(findByTestId(renderer, "review-analysis-engine-status"))).toBe(
        "SF 18 NNUE · Depth 4/20"
      );
      expect(() => findByTestId(renderer, "review-analysis-error")).toThrow();
    });
  });

  it("isolates Stockfish diagnostics with scored live rows whose order can change by depth", async () => {
    const stockfish = createScriptedStockfishTransport((command, emit) => {
      if (command === "go depth 8") {
        void Promise.resolve().then(() => {
          emit("info depth 4 multipv 1 score cp 20 pv d8e8");
          emit("info depth 4 multipv 2 score cp 10 pv d8d6");
        });
      }
      if (command === "go depth 20") {
        void Promise.resolve().then(() => {
          emit("info depth 12 multipv 1 score cp 360 pv d8d6");
          emit("info depth 12 multipv 2 score cp -120 pv d8e8");
          emit("bestmove d8d6");
        });
      }
    });
    const renderer = renderScreen({
      practiceService: createMobilePracticeService("familiar15"),
      stockfish: { createTransport: () => stockfish.transport }
    });

    press(renderer, "settings-tab");
    press(renderer, "settings-stockfish-diagnostics");
    await waitForAssertion(() => {
      expect(stockfish.commands).toContain("go depth 8");
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-status"))).toContain("Depth 4/20");
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-line-0"))).toMatch(/^\+0\.2.*Qe8/);
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-line-1"))).toMatch(/^\+0\.1.*Qxd6/);
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-panel"))).not.toContain("eval --");
    });

    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitForAssertion(() => {
      expect(stockfish.commands).toContain("go depth 20");
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-status"))).toContain("Done · Depth 12");
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-line-0"))).toMatch(/^\+3\.6.*Qxd6/);
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-line-1"))).toMatch(/^-1\.2.*Qe8/);
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-raw-lines"))).toContain("info depth 12 multipv 1 score cp 360 pv d8d6");
    });
  });

  it("reviews Arrow Duel mistakes with analysis blunder arrows and a forced punishment line", async () => {
    const preview = createMobilePracticeService("familiar15");
    const previewState = preview.startSprint({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 10,
      maxMistakes: 3
    });
    const firstPuzzleSolution = [...requireArrowDuelState(previewState).puzzle.solutionMoves];
    const firstGuidedMove = firstPuzzleSolution[2];
    const firstReplyMove = firstPuzzleSolution[3];
    if (!firstGuidedMove) {
      throw new Error("Expected the first Arrow Duel fixture to have a continuation move");
    }
    if (!firstReplyMove) {
      throw new Error("Expected the first Arrow Duel fixture to have a reply after the continuation move");
    }
    const stockfish = createScriptedStockfishTransport((command, emit) => {
      if (command === "go depth 8") {
        void Promise.resolve().then(() => {
          emit(`info depth 4 multipv 1 score cp 42 pv ${firstGuidedMove}`);
        });
      }
      if (command === "go depth 20") {
        void Promise.resolve().then(() => {
          emit(`info depth 12 multipv 1 score cp 64 pv ${firstGuidedMove}`);
          emit(`bestmove ${firstGuidedMove}`);
        });
      }
    });
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({
      practiceService: service,
      stockfish: { createTransport: () => stockfish.transport }
    });
    const wrongMoves: string[] = [];

    startArrowDuelSprint(renderer);

    wrongMoves.push(currentArrowWrongMove(activeSprintForTest(service)));
    await boardMove(renderer, wrongMoves[0] as string);
    await settleFeedbackSnapshot();
    wrongMoves.push(currentArrowWrongMove(activeSprintForTest(service)));
    await boardMove(renderer, wrongMoves[1] as string);
    await settleFeedbackSnapshot();
    wrongMoves.push(currentArrowWrongMove(activeSprintForTest(service)));
    await boardMove(renderer, wrongMoves[2] as string);
    await settleFeedbackSnapshot();

    press(renderer, "review-mistakes-button");

    expectText(renderer, "1 / 3 · Arrow Duel");
    expect(() => findByTestId(renderer, "review-accessible-moves-open")).toThrow();
    expect(() => findByTestId(renderer, "review-arrow-legend")).toThrow();
    expect(() => findByTestId(renderer, "review-arrow-choice-marker")).toThrow();
    expect(collectText(renderer.root)).not.toContain("Green = best move");
    expect(collectText(renderer.root)).not.toContain("You chose:");
    press(renderer, "review-analysis-button");
    expect(findByTestId(renderer, "analysis-arrow-overlay")).toBeTruthy();
    expect(countStyleEntry(findByTestId(renderer, "review-board"), "backgroundColor", "#16A34A")).toBeGreaterThan(0);
    expect(countStyleEntry(findByTestId(renderer, "review-board"), "backgroundColor", "#DC2626")).toBeGreaterThan(0);
    press(renderer, "review-close-analysis");

    await boardMove(renderer, wrongMoves[0] as string);
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(true);

    await settleFeedbackSnapshot();
    await settleFeedbackSnapshot();
    expectText(renderer, "1 / 3 · Arrow Duel");
    expect(() => findByTestId(renderer, "review-arrow-legend")).toThrow();
    expect(() => findByTestId(renderer, "review-arrow-choice-marker")).toThrow();
    expect(collectText(renderer.root)).not.toContain("Green = best move");
    expect(collectText(renderer.root)).not.toContain("You chose:");
    expect(findByTestId(renderer, "review-guided-move-overlay")).toBeTruthy();
    expect(countStyleEntry(findByTestId(renderer, "review-guided-move-overlay"), "backgroundColor", "#2563EB")).toBeGreaterThan(0);
    expect(countStyleEntry(findByTestId(renderer, "review-guided-move-overlay"), "backgroundColor", "#16A34A")).toBe(0);
    expect(collectText(renderer.root)).not.toContain("Choose the best move");
    expect(collectText(renderer.root)).not.toContain("Find the best move");
    expect(collectText(renderer.root)).not.toContain("Follow the puzzle line");
    expectText(renderer, "Blue arrows show the next move in the punishment line. Follow them to see why the choice is bad.");
    const guidedStartFen = findByTestId(renderer, "mock-chessboard").props.fen;
    await waitForAssertion(() => {
      expect(stockfish.commands).toContain(`position fen ${guidedStartFen}`);
      const guidedCurrentEval = collectText(findByTestId(renderer, "review-guided-eval-line-0"));
      expect(guidedCurrentEval).toMatch(/^\+0\.4.*Current position/);
    });
    const analysisPanel = findByTestId(renderer, "review-analysis-panel");
    const panelOrder = analysisPanel.findAll((node) =>
      node.props.testID === "review-guided-eval-list" || node.props.testID === "review-analysis-toolbar"
    ).map((node) => node.props.testID);
    expect(panelOrder.indexOf("review-guided-eval-list")).toBeLessThan(panelOrder.indexOf("review-analysis-toolbar"));
    const guidedCurrentEval = collectText(findByTestId(renderer, "review-guided-eval-line-0"));
    expect(guidedCurrentEval).toContain("Current position");
    expect(guidedCurrentEval).not.toContain("Top move");
    expect(guidedCurrentEval).not.toContain("Candidate");
    expect(guidedCurrentEval).not.toContain("eval --");
    expect(() => findByTestId(renderer, "review-guided-eval-line-1")).toThrow();

    const expectedAfterGuidedReply = mustFenAfterMove(
      mustFenAfterMove(guidedStartFen, firstGuidedMove),
      firstReplyMove
    );
    await boardMove(renderer, firstGuidedMove);
    await settleFeedbackSnapshot();
    expectText(renderer, "1 / 3 · Arrow Duel");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(expectedAfterGuidedReply);
    let expectedCurrentFen = expectedAfterGuidedReply;
    for (let cursor = 4; cursor < firstPuzzleSolution.length; cursor += 2) {
      expect(findByTestId(renderer, "review-guided-move-overlay")).toBeTruthy();
      const guidedMove = firstPuzzleSolution[cursor];
      if (!guidedMove) {
        break;
      }
      expectedCurrentFen = mustFenAfterMove(expectedCurrentFen, guidedMove);
      const replyMove = firstPuzzleSolution[cursor + 1];
      if (replyMove) {
        expectedCurrentFen = mustFenAfterMove(expectedCurrentFen, replyMove);
      }
      await boardMove(renderer, guidedMove);
      await settleFeedbackSnapshot();
      expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(expectedCurrentFen);
    }
    const finalCurrentEval = collectText(findByTestId(renderer, "review-guided-eval-line-0"));
    expect(finalCurrentEval).toMatch(/(?:1-0|0-1)/);
    expect(finalCurrentEval).toContain("Checkmate");
    expect(finalCurrentEval).toContain("Current position");
    expect(() => findByTestId(renderer, "review-guided-eval-line-1")).toThrow();
    const finalFen = findByTestId(renderer, "mock-chessboard").props.fen;
    press(renderer, "review-analysis-button");
    const terminalAnalysisLine = findByTestId(renderer, "review-analysis-line-0");
    expect(collectText(terminalAnalysisLine)).toMatch(/(?:1-0|0-1).*Checkmate.*Current position/);
    expect(terminalAnalysisLine.props.disabled).toBe(true);
    expect(terminalAnalysisLine.props.accessibilityState).toEqual({ disabled: true });
    expect(() => findByTestId(renderer, "review-analysis-line-1")).toThrow();
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(finalFen);
    press(renderer, "review-close-analysis");
    await settleFeedbackSnapshot();
    press(renderer, "review-reset-puzzle");
    expectText(renderer, "Choose the best move");
    expect(() => findByTestId(renderer, "review-guided-move-overlay")).toThrow();
    press(renderer, "review-exit");
    expect(findByTestId(renderer, "practice-mode-standard")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-session")).toThrow();
  });

  it.each([
    { label: "iPhone bottom tabs", width: 430, height: 932, scale: 3, rail: false, badgeTop: -8 },
    { label: "iPad expanded rail", width: 1180, height: 820, scale: 2, rail: true, badgeTop: -7 }
  ])("keeps a two-digit review badge on one line at the icon's upper-right in $label", ({
    width,
    height,
    scale,
    rail,
    badgeTop
  }) => {
    (ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: { fontScale: number; height: number; scale: number; width: number }) => void;
    }).__setWindowDimensions?.({ width, height, scale, fontScale: 1 });
    jest.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));

    const renderer = renderScreen({ practiceService: createDueReviewService(16) });
    const badge = findByTestId(renderer, "review-tab-badge");
    const badgeStyle = flattenTestStyle(badge.props.style);
    const iconStyle = flattenTestStyle(findByTestId(renderer, "review-tab-icon").props.style);

    expect(collectText(badge)).toBe("16");
    expect(badge.props.allowFontScaling).toBe(false);
    expect(badge.props.numberOfLines).toBe(1);
    expect(badgeStyle.left).toBe(24);
    expect(badgeStyle.right).toBeUndefined();
    expect(badgeStyle.top).toBe(badgeTop);
    expect(badgeStyle.minHeight).toBe(18);
    expect(badgeStyle.minWidth).toBe(18);
    expect(badgeStyle.width).toBe(22);
    expect(iconStyle.overflow).toBe("visible");
    expect(iconStyle.width).toBe(32);
    if (rail) {
      expect(findByTestId(renderer, "navigation-rail").props.accessibilityLabel).toBe("Primary navigation rail");
    } else {
      expect(() => findByTestId(renderer, "navigation-rail")).toThrow();
    }
  });

  it("caps a large review badge without wrapping", () => {
    jest.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    const renderer = renderScreen({ practiceService: createDueReviewService(100) });
    const badge = findByTestId(renderer, "review-tab-badge");

    expect(collectText(badge)).toBe("99+");
    expect(badge.props.numberOfLines).toBe(1);
    expect(flattenTestStyle(badge.props.style).width).toBe(28);
  });

  it("auto-advances a wrong due Arrow Duel review and keeps it in today's history", async () => {
    const service = createMobilePracticeService("random1000");
    let sprintState = service.startSprint(
      {
        mode: "arrow_duel",
        durationSeconds: 300,
        perPuzzleSeconds: 30,
        targetCorrect: 10,
        maxMistakes: 3
      },
      "2026-06-20T00:00:00.000Z"
    );
    const wrongMoves: string[] = [];
    wrongMoves.push(currentArrowWrongMove(sprintState));
    sprintState = service.submitMove(wrongMoves[0] as string, "2026-06-20T00:00:05.000Z").state;
    wrongMoves.push(currentArrowWrongMove(sprintState));
    sprintState = service.submitMove(wrongMoves[1] as string, "2026-06-20T00:00:10.000Z").state;
    wrongMoves.push(currentArrowWrongMove(sprintState));
    service.submitMove(wrongMoves[2] as string, "2026-06-20T00:00:15.000Z");
    const stockfish = createScriptedStockfishTransport(() => {});
    const renderer = renderScreen({
      practiceService: service,
      stockfish: { createTransport: () => stockfish.transport }
    });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");

    expectText(renderer, "1 / 3 · Arrow Duel");
    expect(() => findByTestId(renderer, "review-accessible-moves-open")).toThrow();
    expect(() => findByTestId(renderer, "review-line-continue")).toThrow();

    await boardMove(renderer, wrongMoves[0] as string);
    await settleFeedbackSnapshot();
    expectText(renderer, "2 / 3 · Arrow Duel");
    expect(() => findByTestId(renderer, "review-line-continue")).toThrow();
    expect(service.listHistory({ source: "scheduled_review" })).toEqual([
      expect.objectContaining({ result: "wrong", submittedMove: wrongMoves[0] })
    ]);

    press(renderer, "review-exit");
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("1 / 3");
    expect(findByTestId(renderer, "review-today-history")).toBeTruthy();
  });

  it("ignores stale board callbacks instead of recording a correct visible move as wrong", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    const firstBoard = findByTestId(renderer, "mock-chessboard");
    const firstPuzzleFen = firstBoard.props.fen;
    const firstBoardOnMove = firstBoard.props.onMove;
    const staleSolvedFen = mustFenAfterMove(
      mustFenAfterMove(
        mustFenAfterMove(firstPuzzleFen, "e2e6"),
        "f7f8"
      ),
      "e6f7"
    );
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");
    await settleFeedbackSnapshot();

    const secondPuzzleFen = findByTestId(renderer, "mock-chessboard").props.fen;
    expect(secondPuzzleFen).not.toBe(firstPuzzleFen);
    expectText(renderer, "1 / 15");

    await boardMoveWithCallback(firstBoardOnMove, "e6f7", staleSolvedFen);

    expectText(renderer, "1 / 15");
    expectSessionMistakes(renderer, 0);
    expect(() => findByTestId(renderer, "move-feedback-overlay")).toThrow();

    abandonSprint(renderer);
    press(renderer, "history-tab");
    press(renderer, "history-rating-standard 5/20");
    expect(collectText(findByTestId(renderer, "history-performance-card"))).toContain("Rating Trend");
    expect(collectText(findByTestId(renderer, "history-performance-card"))).not.toContain("Accuracy");
    expect(collectText(renderer.root)).not.toContain("Standard · wrong · e6f7");
  });

  it("keeps settings locally reachable without a simulator", () => {
    const renderer = renderScreen();

    press(renderer, "settings-tab");
    expect(() => findByTestId(renderer, "settings-action-header")).toThrow();
    expect(() => findByTestId(renderer, "settings-sync-summary-card")).toThrow();
    expect(() => findByTestId(renderer, "settings-data-summary-card")).toThrow();
    expect(findByTestId(renderer, "settings-profile-section")).toBeTruthy();
    expect(() => findByTestId(renderer, "settings-data-section")).toThrow();
    expect(() => findByTestId(renderer, "settings-local-storage")).toThrow();
    expect(() => findByTestId(renderer, "settings-export-data")).toThrow();
    expect(() => findByTestId(renderer, "settings-delete-local-history")).toThrow();
    expect(() => findByTestId(renderer, "settings-delete-history-confirmation")).toThrow();
    expect(findByTestId(renderer, "settings-notifications-section")).toBeTruthy();
    expect(() => findByTestId(renderer, "settings-packs-section")).toThrow();
    expect(findByTestId(renderer, "settings-about-section")).toBeTruthy();
    expect(findByTestId(renderer, "settings-puzzle-data-license")).toBeTruthy();
    expect(findByTestId(renderer, "settings-sync-section")).toBeTruthy();
    expect(() => findByTestId(renderer, "settings-sync-disclosure")).toThrow();
    expect(findByTestId(renderer, "settings-sync-status")).toBeTruthy();
    expect(() => findByTestId(renderer, "settings-sync-last-synced")).toThrow();
    expect(() => findByTestId(renderer, "settings-icloud-sync-toggle")).toThrow();
    expect(() => findByTestId(renderer, "settings-sync-allow-upload")).toThrow();
    expect(collectText(renderer.root)).not.toContain("Last synced");
    expect(collectText(renderer.root)).not.toContain("Today, 09:28");
    expect(collectText(renderer.root)).not.toContain("Pending approval");
    expect(collectText(renderer.root)).not.toContain("Allow upload");
    expect(collectText(renderer.root)).not.toContain("Local Data");
    expect(collectText(renderer.root)).not.toContain("Export Data");
    expect(collectText(renderer.root)).not.toContain("Delete Local History");
    expect(collectText(renderer.root)).not.toContain("On device");
    expect(collectText(findByTestId(renderer, "settings-sync-section"))).toContain("iCloud Sync");
    expect(collectText(findByTestId(renderer, "settings-sync-status"))).toContain("On");
    expect(findByTestId(renderer, "settings-icloud-sync-on")).toBeTruthy();
    expect(findByTestId(renderer, "settings-icloud-sync-off")).toBeTruthy();
    expect(findByTestId(renderer, "settings-sync-now")).toBeTruthy();
    expect(testIdOrder(renderer, "settings-sync-section", "settings-notifications-section")).toBeLessThan(0);
    expect(testIdOrder(renderer, "settings-notifications-section", "settings-profile-section")).toBeLessThan(0);
    expect(collectText(findByTestId(renderer, "settings-notifications-section"))).toContain("Notifications");
    expect(findByTestId(renderer, "settings-review-reminders")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-review-reminders"))).toContain("Smart");
    expect(collectText(findByTestId(renderer, "settings-review-reminders"))).toContain("Notifications unavailable on this device");
    expect(findByTestId(renderer, "settings-review-reminder-smart")).toBeTruthy();
    expect(findByTestId(renderer, "settings-review-reminder-fixed-1900")).toBeTruthy();
    expect(findByTestId(renderer, "settings-review-reminder-off")).toBeTruthy();
    expect(findByTestId(renderer, "settings-standard-elo-row")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("ELO 600");
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("Edit ELO");
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("Standard and Arrow Duel difficulty");
    expect(() => findByTestId(renderer, "settings-standard-elo-row-detail")).toThrow();
    expect(() => findByTestId(renderer, "settings-reset-elo-confirmation")).toThrow();
    expect(() => findByTestId(renderer, "settings-reset-elo")).toThrow();
    expect(() => findByTestId(renderer, "settings-reset-elo-detail")).toThrow();
    expect(() => findByTestId(renderer, "settings-advanced-ratings")).toThrow();
    expect(() => findByTestId(renderer, "settings-advanced-ratings-panel")).toThrow();
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("Standard and Arrow Duel difficulty");
    press(renderer, "settings-standard-elo-row");
    expect(findByTestId(renderer, "settings-advanced-ratings-panel")).toBeTruthy();
    expectText(renderer, "Difficulty controls");
    expectText(renderer, "Set each ELO to curate your preferred puzzle difficulty.");
    expect(collectText(renderer.root)).not.toContain("Adjust only when");
    expect(findByTestId(renderer, "settings-advanced-rating-standard")).toBeTruthy();
    expect(findByTestId(renderer, "settings-advanced-rating-arrow-duel")).toBeTruthy();
    expect(() => findByTestId(renderer, "settings-advanced-rating-blitz")).toThrow();
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard"))).toContain("Standard · 20s pace");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard"))).not.toContain("standard 5/20");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-arrow-duel"))).toContain("Arrow Duel · 30s pace");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-arrow-duel"))).not.toContain("arrow duel 5/30");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-value"))).toBe("ELO 600");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-increase"))).toBe("");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-decrease"))).toBe("");
    expect(findByTestId(renderer, "settings-advanced-rating-standard-decrease").props.accessibilityState).toEqual({ disabled: true });
    expect(collectText(renderer.root)).not.toContain("Locked");
    press(renderer, "settings-advanced-rating-standard-increase");
    expectText(renderer, "Standard rating set to 625");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-value"))).toBe("ELO 625");
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("ELO 625");
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("Standard and Arrow Duel difficulty");
    expect(findByTestId(renderer, "settings-advanced-rating-standard-decrease").props.accessibilityState).toEqual({ disabled: false });
    press(renderer, "settings-advanced-rating-standard-decrease");
    expectText(renderer, "Standard rating set to 600");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-value"))).toBe("ELO 600");
    press(renderer, "settings-standard-elo-row");
    expect(() => findByTestId(renderer, "settings-advanced-ratings-panel")).toThrow();
    expect(() => findByTestId(renderer, "settings-manage-packs")).toThrow();
    expect(() => findByTestId(renderer, "settings-packs-section")).toThrow();
    expect(() => findByTestId(renderer, "packs-tab")).toThrow();
    expect(findByTestId(renderer, "settings-app-version")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-app-version"))).toContain(
      "test-version (test-build)",
    );
    expect(findByTestId(renderer, "settings-license")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-license"))).toContain("License");
    expect(collectText(findByTestId(renderer, "settings-license"))).toContain("GPL-3.0-or-later");
    expect(collectText(findByTestId(renderer, "settings-license"))).toContain("Open license");
    expect(findByTestId(renderer, "settings-source")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-source"))).toContain("Source");
    expect(collectText(findByTestId(renderer, "settings-source"))).toContain("GitHub");
    expect(collectText(findByTestId(renderer, "settings-source"))).toContain("github.com/Chessticize/chessticize-mobile");
    expect(findByTestId(renderer, "settings-stockfish-source")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-stockfish-source"))).toContain("Stockfish");
    expect(collectText(findByTestId(renderer, "settings-stockfish-source"))).toContain("Embedded");
    expect(collectText(findByTestId(renderer, "settings-stockfish-source"))).toContain("Stockfish 18 engine source used by the app");
    expect(typeof findByTestId(renderer, "settings-license").props.onPress).toBe("function");
    const openURLSpy = jest.spyOn(ReactNative.Linking, "openURL").mockResolvedValue(undefined);
    press(renderer, "settings-license");
    press(renderer, "settings-source");
    press(renderer, "settings-stockfish-source");
    expect(findByTestId(renderer, "settings-puzzle-data-license")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-puzzle-data-license"))).toContain(getBundledCorePackManifest().source);
    expect(collectText(findByTestId(renderer, "settings-puzzle-data-license"))).toContain(getBundledCorePackManifest().sourceLicense);
    expect(collectText(findByTestId(renderer, "settings-puzzle-data-license"))).toContain("Derived from Lichess puzzle data");
    expect(collectText(findByTestId(renderer, "settings-puzzle-data-license"))).toContain("Chessticize presolve metadata");
    expect(collectText(findByTestId(renderer, "settings-puzzle-data-license"))).toContain("database.lichess.org/#puzzles");
    press(renderer, "settings-puzzle-data-license");
    expect(findByTestId(renderer, "settings-support-email")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-support-email"))).toContain("Support");
    expect(collectText(findByTestId(renderer, "settings-support-email"))).toContain("support@chessticize.com");
    press(renderer, "settings-support-email");
    expect(openURLSpy).toHaveBeenNthCalledWith(1, "https://github.com/Chessticize/chessticize-mobile/blob/main/LICENSE");
    expect(openURLSpy).toHaveBeenNthCalledWith(2, "https://github.com/Chessticize/chessticize-mobile");
    expect(openURLSpy).toHaveBeenNthCalledWith(3, "https://github.com/Chessticize/chessticize-mobile/tree/main/apps/mobile/native/stockfish");
    expect(openURLSpy).toHaveBeenNthCalledWith(4, "https://database.lichess.org/#puzzles");
    expect(openURLSpy).toHaveBeenNthCalledWith(5, "mailto:support@chessticize.com");
    openURLSpy.mockRestore();
    expect(collectText(findByTestId(renderer, "settings-panel"))).not.toContain("›");
  });

  it("shows Android-managed restore protection without exposing iCloud controls", () => {
    const renderer = renderScreen({
      progressProtection: { kind: "android_managed_backup" }
    });

    press(renderer, "settings-tab");

    expect(findByTestId(renderer, "settings-android-backup-section")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-android-backup-section")))
      .toContain("Android Progress Backup");
    expect(collectText(findByTestId(renderer, "settings-android-backup-status")))
      .toContain("Managed by Android");
    expect(collectText(findByTestId(renderer, "settings-android-backup-status")))
      .toContain("restore local progress after reinstall or device transfer");
    expect(collectText(findByTestId(renderer, "settings-android-backup-status")))
      .toContain("not continuous sync");
    expect(() => findByTestId(renderer, "settings-sync-section")).toThrow();
    expect(() => findByTestId(renderer, "settings-icloud-sync-controls")).toThrow();
    expect(() => findByTestId(renderer, "settings-sync-now")).toThrow();
    expect(collectText(renderer.root)).not.toContain("iCloud");
  });

  it("opens the official Android GitHub Releases page only after a user gesture", () => {
    const renderer = renderScreen({
      progressProtection: { kind: "android_managed_backup" },
      applicationMetadata: {
        releasePageUrl: "https://github.com/Chessticize/chessticize-mobile/releases"
      }
    });
    const openURLSpy = jest.spyOn(ReactNative.Linking, "openURL").mockResolvedValue(undefined);

    press(renderer, "settings-tab");

    const releases = findByTestId(renderer, "settings-android-releases");
    expect(collectText(releases)).toContain("Android Releases");
    expect(collectText(releases)).toContain("Manual Play-signed APK downloads");
    expect(collectText(releases)).toContain("Open GitHub Releases");
    expect(openURLSpy).not.toHaveBeenCalled();

    press(renderer, "settings-android-releases");
    expect(openURLSpy).toHaveBeenCalledTimes(1);
    expect(openURLSpy).toHaveBeenCalledWith(
      "https://github.com/Chessticize/chessticize-mobile/releases",
    );
    openURLSpy.mockRestore();
  });

  it("renders installed application metadata from the platform capability bundle", () => {
    const renderer = renderScreen({
      applicationMetadata: {
        versionName: "9.8.7",
        buildNumber: "42"
      }
    });

    press(renderer, "settings-tab");

    expect(collectText(findByTestId(renderer, "settings-app-version"))).toContain("9.8.7 (42)");
  });

  it("syncs progress through the injected iCloud client by default and from Settings", async () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    const client = new FakeICloudProgressSyncClient();
    const renderer = renderScreen({
      practiceService: service,
      iCloudProgressSyncClient: client
    });

    await waitForAssertion(() => {
      expect(client.fetchCount).toBe(1);
      expect(client.saveCount).toBe(1);
    });

    expect(service.getSettings().sync.iCloudEnabled).toBe(true);
    press(renderer, "settings-tab");
    expect(findByTestId(renderer, "settings-sync-now")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-sync-status"))).toContain("Synced");
    expect(client.savedSnapshots[0]?.data.attempts.length).toBe(1);
    expect(client.savedSnapshots[0]?.data.reviewQueue.length).toBe(1);
    expect(client.savedSnapshots[0]?.data.ratings.find((rating) => rating.key === "standard 5/20")?.games).toBe(1);

    await pressAsync(renderer, "settings-sync-now");
    await waitForAssertion(() => {
      expect(client.fetchCount).toBe(2);
      expect(client.saveCount).toBe(2);
    });
  });

  it("does not sync while iCloud is off and syncs once when it is enabled", async () => {
    const service = createMobilePracticeService("random1000");
    service.saveSettings({
      ...service.getSettings(),
      sync: {
        iCloudEnabled: false
      }
    });
    const client = new FakeICloudProgressSyncClient();
    const renderer = renderScreen({
      practiceService: service,
      iCloudProgressSyncClient: client
    });
    await act(async () => {});

    expect(client.fetchCount).toBe(0);
    expect(client.saveCount).toBe(0);
    press(renderer, "settings-tab");
    expect(collectText(findByTestId(renderer, "settings-sync-status"))).toContain("Off");
    expect(() => findByTestId(renderer, "settings-sync-now")).toThrow();

    press(renderer, "settings-icloud-sync-on");
    await waitForAssertion(() => {
      expect(client.fetchCount).toBe(1);
      expect(client.saveCount).toBe(1);
    });
    expect(service.getSettings().sync.iCloudEnabled).toBe(true);
    expect(findByTestId(renderer, "settings-sync-now")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-sync-status"))).toContain("Synced");

    press(renderer, "settings-icloud-sync-off");
    await flushMicrotasks();
    expect(service.getSettings().sync.iCloudEnabled).toBe(false);
    expect(collectText(findByTestId(renderer, "settings-sync-status"))).toContain("Off");
    expect(() => findByTestId(renderer, "settings-sync-now")).toThrow();
    expect(client.fetchCount).toBe(1);
    expect(client.saveCount).toBe(1);
  });

  it("opens difficulty controls from the Edit ELO row", () => {
    const renderer = renderScreen();

    press(renderer, "settings-tab");
    expect(typeof findByTestId(renderer, "settings-standard-elo-row").props.onPress).toBe("function");
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("Edit ELO");
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("Standard and Arrow Duel difficulty");
    expect(() => findByTestId(renderer, "settings-standard-elo-row-detail")).toThrow();
    expect(() => findByTestId(renderer, "settings-advanced-ratings-panel")).toThrow();

    press(renderer, "settings-standard-elo-row");

    expect(findByTestId(renderer, "settings-advanced-ratings-panel")).toBeTruthy();
    expectText(renderer, "Difficulty controls");
    expectText(renderer, "Set each ELO to curate your preferred puzzle difficulty.");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-value"))).toBe("ELO 600");
  });

  it("reschedules review reminders when the review queue changes and when the app backgrounds", async () => {
    jest.setSystemTime(new Date("2026-06-21T00:01:00.000Z"));
    const scheduler = new FakeReviewReminderScheduler();
    const service = createMobilePracticeService("random1000");
    service.saveReviewReminderPreference({ mode: "fixed", fixedLocalTime: "08:15" });
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 15, maxMistakes: 3 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");

    const renderer = renderScreen({ practiceService: service, reviewReminderScheduler: scheduler });
    await act(async () => {});

    const queuedReminder = scheduler.calls[0];
    expect(queuedReminder).toMatchObject({
      dueCount: 1,
      body: "1 review is ready",
      route: "review"
    });
    expect(localTime(queuedReminder?.scheduledAt)).toEqual({ hour: 8, minute: 15 });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");
    await settleFeedbackSnapshot();
    await act(async () => {});

    expect(scheduler.currentReminder).toMatchObject({
      dueCount: 1,
      body: "1 review is ready",
      route: "review"
    });
    expect(localTime(scheduler.currentReminder?.scheduledAt)).toEqual({ hour: 8, minute: 15 });
    const rescheduledAt = scheduler.currentReminder?.scheduledAt;

    act(() => {
      (AppState as unknown as { __emit: (nextState: string) => void }).__emit("background");
    });
    await act(async () => {});

    expect(scheduler.calls).toHaveLength(2);
    expect(scheduler.calls[1]).toMatchObject({
      dueCount: 1,
      body: "1 review is ready",
      route: "review"
    });
    expect(scheduler.currentReminder?.scheduledAt).toBe(rescheduledAt);
  });

  it("saves review reminder preferences from Settings and reschedules the local reminder", async () => {
    jest.setSystemTime(new Date("2026-06-20T12:00:00.000Z"));
    const scheduler = new FakeReviewReminderScheduler();
    const notificationClient = new FakeReviewReminderNotificationClient("authorized");
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 15, maxMistakes: 3 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");

    const renderer = renderScreen({
      practiceService: service,
      reviewReminderNotificationClient: notificationClient,
      reviewReminderScheduler: scheduler
    });
    await act(async () => {});

    press(renderer, "settings-tab");
    expect(collectText(findByTestId(renderer, "settings-review-reminders"))).toContain("Smart");
    expect(collectText(findByTestId(renderer, "settings-review-reminders"))).toContain("Local notifications enabled");

    press(renderer, "settings-review-reminder-fixed-1900");
    await act(async () => {});

    expect(service.getReviewReminderPreference()).toEqual({ mode: "fixed", fixedLocalTime: "19:00" });
    expect(collectText(findByTestId(renderer, "settings-review-reminders"))).toContain("19:00");
    expect(localTime(scheduler.currentReminder?.scheduledAt)).toEqual({ hour: 19, minute: 0 });
    expect(collectText(findByTestId(renderer, "settings-review-reminder-schedule-status"))).toContain("scheduled|");
    expect(collectText(findByTestId(renderer, "settings-review-reminder-schedule-status"))).toContain("|1|1 review is ready|review");

    press(renderer, "settings-review-reminder-off");
    await act(async () => {});

    expect(service.getReviewReminderPreference()).toEqual({ mode: "off" });
    expect(scheduler.currentReminder).toBeUndefined();
    expect(collectText(findByTestId(renderer, "settings-review-reminder-schedule-status"))).toBe("none");
    expect(collectText(findByTestId(renderer, "settings-review-reminders"))).toContain("Off");
  });

  it("uses the Settings permission affordances without re-prompting denied users", async () => {
    const deniedClient = new FakeReviewReminderNotificationClient("denied");
    const deniedRenderer = renderScreen({ reviewReminderNotificationClient: deniedClient });
    await act(async () => {});

    press(deniedRenderer, "settings-tab");
    expect(collectText(findByTestId(deniedRenderer, "settings-review-reminders"))).toContain("Blocked in iOS Settings");
    expect(() => findByTestId(deniedRenderer, "settings-review-reminder-enable")).toThrow();
    press(deniedRenderer, "settings-review-reminder-open-settings");
    await act(async () => {});
    expect(deniedClient.openSettingsCount).toBe(1);
    expectText(deniedRenderer, "Opened iOS Settings");

    const undecidedClient = new FakeReviewReminderNotificationClient("not_determined", "authorized");
    const undecidedRenderer = renderScreen({ reviewReminderNotificationClient: undecidedClient });
    await act(async () => {});

    press(undecidedRenderer, "settings-tab");
    expect(findByTestId(undecidedRenderer, "settings-review-reminder-enable")).toBeTruthy();
    press(undecidedRenderer, "settings-review-reminder-enable");
    await act(async () => {});

    expect(undecidedClient.requestCount).toBe(1);
    expectText(undecidedRenderer, "Notifications enabled");
    expect(() => findByTestId(undecidedRenderer, "settings-review-reminder-enable")).toThrow();
  });

  it("renders recoverable Android permission and disabled-channel states without iOS copy", async () => {
    const deniedClient = new FakeReviewReminderNotificationClient("denied");
    const deniedRenderer = renderScreen({
      progressProtection: { kind: "android_managed_backup" },
      reminderPlatform: "android",
      reviewReminderNotificationClient: deniedClient,
      reviewReminderScheduler: new FakeReviewReminderScheduler()
    });
    await act(async () => {});

    press(deniedRenderer, "settings-tab");
    expect(collectText(findByTestId(deniedRenderer, "settings-review-reminders")))
      .toContain("Blocked in Android notification settings");
    expect(collectText(findByTestId(deniedRenderer, "settings-notifications-section"))).not.toContain("iOS");
    press(deniedRenderer, "settings-review-reminder-open-settings");
    await act(async () => {});
    expect(deniedClient.openSettingsCount).toBe(1);
    expectText(deniedRenderer, "Opened Android notification settings");
    deniedClient.setOpenSettingsFailure(new Error("missing settings activity"));
    press(deniedRenderer, "settings-review-reminder-open-settings");
    await act(async () => {});
    expectText(deniedRenderer, "Android notification settings are unavailable on this device");

    const channelClient = new FakeReviewReminderNotificationClient("channel_disabled");
    const channelRenderer = renderScreen({
      progressProtection: { kind: "android_managed_backup" },
      reminderPlatform: "android",
      reviewReminderNotificationClient: channelClient,
      reviewReminderScheduler: new FakeReviewReminderScheduler()
    });
    await act(async () => {});
    press(channelRenderer, "settings-tab");
    expect(collectText(findByTestId(channelRenderer, "settings-review-reminders")))
      .toContain("Review reminders channel is off in Android settings");
    expect(findByTestId(channelRenderer, "settings-review-reminder-open-settings")).toBeTruthy();

    const requestDeniedClient = new FakeReviewReminderNotificationClient("not_determined", "denied");
    const requestDeniedRenderer = renderScreen({
      progressProtection: { kind: "android_managed_backup" },
      reminderPlatform: "android",
      reviewReminderNotificationClient: requestDeniedClient,
      reviewReminderScheduler: new FakeReviewReminderScheduler()
    });
    await act(async () => {});
    press(requestDeniedRenderer, "settings-tab");
    press(requestDeniedRenderer, "settings-review-reminder-enable");
    await act(async () => {});
    const denialStatus = collectText(findByTestId(requestDeniedRenderer, "settings-status-message"));
    expect(denialStatus).toContain("Notifications blocked in Android notification settings");
    expect(denialStatus).not.toContain("iOS");
    expect(collectText(findByTestId(requestDeniedRenderer, "settings-review-reminders")))
      .toContain("Blocked in Android notification settings");
  });

  it("shows truthful Android no-due, overdue-target, disabled, and scheduling-failure states", async () => {
    jest.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    const authorizedClient = new FakeReviewReminderNotificationClient("authorized");
    const noDueRenderer = renderScreen({
      progressProtection: { kind: "android_managed_backup" },
      reminderPlatform: "android",
      reviewReminderNotificationClient: authorizedClient,
      reviewReminderScheduler: new FakeReviewReminderScheduler()
    });
    await act(async () => {});
    press(noDueRenderer, "settings-tab");
    expect(collectText(findByTestId(noDueRenderer, "settings-review-reminders"))).toContain("No review work is scheduled");

    const overdueService = createMobilePracticeService("random1000");
    overdueService.saveReviewReminderPreference({ mode: "fixed", fixedLocalTime: "19:00" });
    overdueService.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 15, maxMistakes: 3 },
      "2026-06-18T00:00:00.000Z"
    );
    overdueService.submitMove("c4b5", "2026-06-18T00:00:05.000Z");
    const overdueRenderer = renderScreen({
      practiceService: overdueService,
      progressProtection: { kind: "android_managed_backup" },
      reminderPlatform: "android",
      reviewReminderNotificationClient: authorizedClient,
      reviewReminderScheduler: new FakeReviewReminderScheduler()
    });
    await act(async () => {});
    press(overdueRenderer, "settings-tab");
    const overdueDetail = collectText(findByTestId(overdueRenderer, "settings-review-reminders"));
    expect(overdueDetail).toContain("Target ");
    expect(overdueDetail).toContain("local; Android may deliver later");
    expect(overdueDetail).toContain("Overdue review work is included");
    press(overdueRenderer, "settings-review-reminder-off");
    await act(async () => {});
    expect(collectText(findByTestId(overdueRenderer, "settings-review-reminders")))
      .toContain("Reminders are off. No notification is scheduled");

    const failingScheduler = new FakeReviewReminderScheduler();
    failingScheduler.setFailure(new Error("alarm unavailable"));
    overdueService.saveReviewReminderPreference({ mode: "fixed", fixedLocalTime: "19:00" });
    const failingRenderer = renderScreen({
      practiceService: overdueService,
      progressProtection: { kind: "android_managed_backup" },
      reminderPlatform: "android",
      reviewReminderNotificationClient: authorizedClient,
      reviewReminderScheduler: failingScheduler
    });
    await act(async () => {});
    press(failingRenderer, "settings-tab");
    expect(collectText(findByTestId(failingRenderer, "settings-review-reminders")))
      .toContain("could not schedule the next reminder");
  });

  it("opens the Review tab from local reminder notification routes", async () => {
    const notificationClient = new FakeReviewReminderNotificationClient("authorized");
    const renderer = renderScreen({ reviewReminderNotificationClient: notificationClient });
    await act(async () => {});

    press(renderer, "settings-tab");
    expect(findByTestId(renderer, "settings-panel")).toBeTruthy();
    act(() => {
      notificationClient.emitRoute("review");
    });

    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
  });

  it("asks for review reminder permission after the first completed scheduled review", async () => {
    const notificationClient = new FakeReviewReminderNotificationClient("not_determined", "authorized");
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    const renderer = renderScreen({ practiceService: service, reviewReminderNotificationClient: notificationClient });
    await act(async () => {});

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    await boardMove(renderer, "c4b5");
    await settleFeedbackSnapshot();

    expect(findByTestId(renderer, "review-reminder-permission-prompt")).toBeTruthy();
    press(renderer, "review-reminder-permission-enable");
    await act(async () => {});

    expect(notificationClient.requestCount).toBe(1);
    expect(() => findByTestId(renderer, "review-reminder-permission-prompt")).toThrow();
  });

  it("dismisses the review reminder prompt before its underlying Review panel", async () => {
    const systemBack = createTestSystemBackSource("android");
    const notificationClient = new FakeReviewReminderNotificationClient("not_determined", "authorized");
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    const renderer = renderScreen({
      practiceService: service,
      reviewReminderNotificationClient: notificationClient,
      systemBack
    });
    await act(async () => {});

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    await boardMove(renderer, "c4b5");
    await settleFeedbackSnapshot();
    expect(findByTestId(renderer, "review-reminder-permission-prompt")).toBeTruthy();

    expect(systemBack.invoke()).toBe(true);
    expect(() => findByTestId(renderer, "review-reminder-permission-prompt")).toThrow();
    expect(() => findByTestId(renderer, "review-session")).toThrow();
    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
    expect(notificationClient.requestCount).toBe(0);
  });
});

function createScriptedStockfishTransport(
  onCommand: (command: string, emit: (line: string) => void) => void
): { commands: string[]; transport: UciEngineTransport } {
  const commands: string[] = [];
  const listeners = new Set<(line: string) => void>();
  const emit = (line: string) => {
    for (const listener of listeners) {
      listener(line);
    }
  };

  return {
    commands,
    transport: {
      start: jest.fn(async () => {}),
      send: jest.fn((command: string) => {
        commands.push(command);
        if (command === "uci") {
          void Promise.resolve().then(() => emit("uciok"));
        } else if (command === "isready") {
          void Promise.resolve().then(() => emit("readyok"));
        }
        onCommand(command, emit);
      }),
      onLine: (listener: (line: string) => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      terminate: jest.fn()
    }
  };
}

type RenderScreenOptions = TestMobilePlatformCapabilityOverrides &
  Pick<React.ComponentProps<typeof PracticePocScreen>, "arrowDuelTargetCorrect" | "currentTimeMs" | "customTargetCorrect" | "debugTrace" | "puzzleSelectionId" | "puzzleSelectionSeed" | "sprintStartDelayMs" | "standardTargetCorrect" | "systemBack" | "themeCatalogPresentation"> & {
    platformCapabilities?: MobilePlatformCapabilities;
  };

function createPlayedCustomService(): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles([sharedHistoryPuzzle()]);
  store.saveRating({
    key: "custom 5/20",
    generation: 0,
    rating: 900,
    ratingDeviation: 180,
    volatility: 0.05,
    games: 1
  });
  store.createSprintSession(completedRatingSprintState({
    id: "back-played-custom",
    mode: "custom",
    completedAt: "2026-07-07T00:00:05.000Z",
    ratingBefore: 600,
    ratingAfter: 900
  }));
  return new PracticeService(store);
}

function createMultiContextDueReviewService(): PracticeService {
  const service = createMobilePracticeService("random1000");
  service.startSprint(
    { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
    "2026-06-20T00:00:00.000Z"
  );
  service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
  service.recordReviewResult(
    { puzzleId: "000hf", mode: "standard", ratingKey: "standard 5/30" },
    "wrong",
    "2026-06-20T00:00:10.000Z"
  );
  return service;
}

function renderScreen({
  arrowDuelTargetCorrect,
  platformCapabilities,
  currentTimeMs,
  customTargetCorrect,
  debugTrace,
  puzzleSelectionId,
  puzzleSelectionSeed,
  sprintStartDelayMs,
  standardTargetCorrect,
  systemBack,
  themeCatalogPresentation,
  ...capabilityOverrides
}: RenderScreenOptions = {}): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(
      <PracticePocScreen
        platformCapabilities={platformCapabilities ?? createTestMobilePlatformCapabilities(capabilityOverrides)}
        arrowDuelTargetCorrect={arrowDuelTargetCorrect}
        currentTimeMs={currentTimeMs}
        customTargetCorrect={customTargetCorrect}
        debugTrace={debugTrace}
        puzzleSelectionId={puzzleSelectionId}
        puzzleSelectionSeed={puzzleSelectionSeed}
        sprintStartDelayMs={sprintStartDelayMs}
        standardTargetCorrect={standardTargetCorrect}
        systemBack={systemBack}
        themeCatalogPresentation={themeCatalogPresentation}
      />
    );
  });
  if (!renderer) {
    throw new Error("PracticePocScreen did not render");
  }
  renderers.push(renderer);
  return renderer;
}

function renderMultiThemeSetupScreen(
  initialSelectedThemes: readonly string[]
): TestRenderer.ReactTestRenderer {
  function MultiThemeSetupHarness(): React.JSX.Element {
    const [selectedThemes, setSelectedThemes] = React.useState<string[]>([
      ...initialSelectedThemes
    ]);
    return (
      <PracticePocScreen
        customThemeSelection={{ selectedThemes, onChange: setSelectedThemes }}
        platformCapabilities={createTestMobilePlatformCapabilities()}
      />
    );
  }

  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(<MultiThemeSetupHarness />);
  });
  if (!renderer) {
    throw new Error("Multi-theme Custom Sprint setup did not render");
  }
  renderers.push(renderer);
  return renderer;
}

function themeSelected(
  renderer: TestRenderer.ReactTestRenderer,
  theme: string
): boolean {
  const state = findByTestId(renderer, `custom-theme-${theme}`).props.accessibilityState;
  return state.checked ?? state.selected ?? false;
}

function createTestSystemBackSource(platform: "android" | "ios"): MobileSystemBackSource & {
  cancelPredictive: () => void;
  commitPredictive: () => boolean;
  invoke: () => boolean;
  progressPredictive: (progress: number, edge?: "left" | "right") => void;
  setPredictiveBackEnabled: jest.Mock;
  startPredictive: (edge?: "left" | "right") => void;
  subscribe: jest.Mock;
  unsubscribe: jest.Mock;
} {
  let listener: Parameters<MobileSystemBackSource["subscribe"]>[0] | null = null;
  const unsubscribe = jest.fn();
  const subscribe = jest.fn((nextListener: Parameters<MobileSystemBackSource["subscribe"]>[0]) => {
    listener = nextListener;
    return () => {
      unsubscribe();
      if (listener === nextListener) {
        listener = null;
      }
    };
  });
  return {
    platform,
    setPredictiveBackEnabled: jest.fn(),
    subscribe,
    unsubscribe,
    invoke: () => {
      if (!listener) {
        return false;
      }
      let handled = false;
      act(() => {
        handled = listener?.onCommit("button") ?? false;
      });
      return handled;
    },
    startPredictive: (edge = "left") => {
      act(() => listener?.onStart(edge));
    },
    progressPredictive: (progress, edge = "left") => {
      act(() => listener?.onProgress(progress, edge));
    },
    cancelPredictive: () => {
      act(() => listener?.onCancel());
    },
    commitPredictive: () => {
      if (!listener) {
        return false;
      }
      let handled = false;
      act(() => {
        handled = listener?.onCommit("predictive") ?? false;
      });
      return handled;
    }
  };
}

function renderStandardSequenceScreen(
  props: Omit<RenderScreenOptions, "practiceService"> = {}
): TestRenderer.ReactTestRenderer {
  return renderScreen({
    ...props,
    practiceService: createMobilePracticeService("random1000")
  });
}

function firstArrowDuelPuzzleForTest(): ArrowDuelState {
  const service = createMobilePracticeService("familiar15");
  const state = service.startSprint({
    mode: "arrow_duel",
    durationSeconds: 300,
    perPuzzleSeconds: 30,
    targetCorrect: 10,
    maxMistakes: 3
  });
  return requireArrowDuelState(state);
}

function sharedHistoryPuzzle(): Puzzle {
  return {
    id: "shared-history",
    initialFen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1",
    solutionMoves: ["e2e4"],
    rating: 900,
    themes: ["fork"],
    source: "lichess",
    stockfishBestMove: "e2e3"
  };
}

function createUnclearHistoryReviewService(): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles([sharedHistoryPuzzle()]);
  store.recordAttempt({
    id: "responsive-unclear-attempt",
    source: "sprint",
    sessionId: "responsive-unclear-session",
    puzzleId: "shared-history",
    mode: "standard",
    ratingKey: "standard 5/20",
    result: "correct",
    submittedMove: "e2e4",
    expectedMove: "e2e4",
    startedAt: "2026-07-17T11:59:55.000Z",
    completedAt: "2026-07-17T12:00:00.000Z",
    ratingBefore: 600
  });
  const service = new PracticeService(store);
  service.setAttemptUnclear("responsive-unclear-attempt", true, "2026-07-17T12:01:00.000Z");
  return service;
}

function createDueReviewService(count: number): PracticeService {
  const store = new MemoryStore();
  const puzzle = sharedHistoryPuzzle();
  const puzzles = Array.from({ length: count }, (_, index) => ({
    ...puzzle,
    id: `review-badge-${index}`
  }));
  store.seedPuzzles(puzzles);
  for (const item of puzzles) {
    store.scheduleMistakeReview({
      puzzleId: item.id,
      mode: "standard",
      ratingKey: "standard 5/20"
    }, "2026-06-19T12:00:00.000Z");
  }
  return new PracticeService(store);
}

function historyAttempt(input: {
  id: string;
  mode: AttemptEvent["mode"];
  ratingKey: string;
  completedAt: string;
  ratingAfter?: number | null;
}): AttemptEvent {
  return {
    id: input.id,
    source: "sprint",
    sessionId: `session-${input.id}`,
    puzzleId: "shared-history",
    mode: input.mode,
    ratingKey: input.ratingKey,
    result: "wrong",
    submittedMove: "e2e4",
    expectedMove: "e2e3",
    startedAt: "2026-06-20T00:00:00.000Z",
    completedAt: input.completedAt,
    ratingBefore: 600,
    ...(input.ratingAfter === null ? {} : { ratingAfter: input.ratingAfter ?? 580 })
  };
}

function currentArrowWrongMove(state: SprintState): string {
  return requireArrowDuelState(state).wrongMove;
}

function completedRatingSprintState({
  id,
  mode,
  completedAt,
  ratingBefore,
  ratingAfter
}: {
  id: string;
  mode: "standard" | "arrow_duel" | "custom";
  completedAt: string;
  ratingBefore: number;
  ratingAfter: number;
}): SprintState {
  return {
    id,
    config: defaultSprintConfig(mode),
    status: "won",
    startedAt: completedAt,
    deadlineAt: completedAt,
    completedAt,
    endReason: "target_reached",
    correctCount: 1,
    mistakeCount: 0,
    currentStreak: 1,
    bestStreak: 1,
    hasUserSubmittedMove: true,
    currentPuzzleIndex: 1,
    puzzles: [],
    ratingBefore,
    ratingAfter
  };
}

function activeSprintForTest(service: ReturnType<typeof createMobilePracticeService>): SprintState {
  const state = service.getActiveSprint();
  if (!state) {
    throw new Error("Expected an active sprint");
  }
  return state;
}

function requireArrowDuelState(state: SprintState): ArrowDuelState {
  if (state.currentPuzzle?.kind !== "arrow_duel") {
    throw new Error("Expected an active Arrow Duel puzzle");
  }
  return state.currentPuzzle;
}

function press(renderer: TestRenderer.ReactTestRenderer, testID: string): void {
  act(() => {
    const target = findByTestId(renderer, testID);
    if (target.props.disabled) {
      throw new Error(`${testID} is disabled`);
    }
    target.props.onPress();
  });
}

async function pressAsync(renderer: TestRenderer.ReactTestRenderer, testID: string): Promise<void> {
  await act(async () => {
    const target = findByTestId(renderer, testID);
    if (target.props.disabled) {
      throw new Error(`${testID} is disabled`);
    }
    target.props.onPress();
    await Promise.resolve();
  });
}

function startStandardSprint(renderer: TestRenderer.ReactTestRenderer): void {
  press(renderer, "practice-mode-standard");
  press(renderer, "practice-start-button");
}

function startArrowDuelSprint(renderer: TestRenderer.ReactTestRenderer): void {
  press(renderer, "practice-mode-arrow-duel");
  press(renderer, "practice-start-button");
  act(() => {
    jest.advanceTimersByTime(200);
  });
}

function abandonSprint(renderer: TestRenderer.ReactTestRenderer): void {
  press(renderer, "session-abandon");
  expect(findByTestId(renderer, "session-abandon-confirmation")).toBeTruthy();
  press(renderer, "session-abandon-confirm");
}

function expectSessionMistakes(renderer: TestRenderer.ReactTestRenderer, count: number): void {
  expect(findByTestId(renderer, "session-score-strip").props.accessibilityLabel).toContain(`mistakes ${count}`);
}

function localTime(iso: string | undefined): { hour: number; minute: number } {
  if (!iso) {
    throw new Error("expected scheduled reminder time");
  }
  const date = new Date(iso);
  return {
    hour: date.getHours(),
    minute: date.getMinutes()
  };
}

async function openSessionMistakeReview(renderer: TestRenderer.ReactTestRenderer): Promise<void> {
  startStandardSprint(renderer);
  await boardMove(renderer, "c4b5");
  await settleFeedbackSnapshot();
  await boardMove(renderer, "g6g5");
  await settleFeedbackSnapshot();
  await boardMove(renderer, "a4b6");
  await settleFeedbackSnapshot();
  press(renderer, "review-mistakes-button");
}

async function boardMove(
  renderer: TestRenderer.ReactTestRenderer,
  move: string,
  options: { stateFen?: string | null } = {}
): Promise<void> {
  await boardMoveOnBoard(findByTestId(renderer, "mock-chessboard"), move, options);
}

async function boardMoveOnBoard(
  board: TestRenderer.ReactTestInstance,
  move: string,
  options: { stateFen?: string | null } = {}
): Promise<void> {
  if (board.props.gestureEnabled === false) {
    throw new Error(`Board gesture is disabled before ${move}`);
  }
  await act(async () => {
    const movePayload = {
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      promotion: move.length > 4 ? move.slice(4, 5) : undefined
    };
    if (options.stateFen === undefined) {
      board.props.mockMove(movePayload);
    } else {
      board.props.onMove({
        move: movePayload,
        state: options.stateFen
          ? {
            fen: options.stateFen,
            isPromotion: move.length > 4
          }
          : {
            isPromotion: move.length > 4
          }
      });
    }
    await Promise.resolve();
  });
}

async function boardMoveWithCallback(
  onMove: (result: unknown) => void,
  move: string,
  stateFen: string | null
): Promise<void> {
  await act(async () => {
    onMove({
      move: {
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        promotion: move.length > 4 ? move.slice(4, 5) : undefined
      },
      state: stateFen
        ? {
          fen: stateFen,
          isPromotion: move.length > 4
        }
        : {
          isPromotion: move.length > 4
        }
    });
    await Promise.resolve();
  });
}

async function settleFeedbackSnapshot(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(850);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function waitForAssertion(assertion: () => void, attempts = 10): Promise<void> {
  let lastError: unknown;
  for (let index = 0; index < attempts; index += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await flushMicrotasks();
    }
  }
  throw lastError;
}

function findByTestId(renderer: TestRenderer.ReactTestRenderer, testID: string): TestRenderer.ReactTestInstance {
  return renderer.root.findByProps({ testID });
}

function expectNoSessionLayoutResidue(renderer: TestRenderer.ReactTestRenderer): void {
  const anonymousEmptyTwelvePointItems = renderer.root.findAll(
    (node) => flattenTestStyle(node.props.style).gap === 12
      && collectText(node) === ""
      && collectTestIds(node).length === 0
  );

  expect(renderedTestIdCount(renderer, "stacked-session-layout")).toBe(0);
  expect(renderedTestIdCount(renderer, "active-session-adaptive-layout")).toBe(0);
  expect(renderedSessionBoardAccessibilityCount(renderer)).toBe(0);
  expect(renderedTestIdCount(renderer, "mock-chessboard")).toBe(0);
  expect(renderedTestIdCount(renderer, "board-coordinate-overlay")).toBe(0);
  expect(anonymousEmptyTwelvePointItems).toHaveLength(0);
}

function renderedTestIdCount(renderer: TestRenderer.ReactTestRenderer, testID: string): number {
  return renderedNodeCount(renderer.toJSON(), (props) => props.testID === testID);
}

function renderedSessionBoardAccessibilityCount(renderer: TestRenderer.ReactTestRenderer): number {
  return renderedNodeCount(renderer.toJSON(), (props) =>
    props.testID === "session-board"
      && props.accessible === true
      && props.accessibilityRole === "image"
  );
}

function renderedNodeCount(
  node: unknown,
  matches: (props: Record<string, unknown>) => boolean
): number {
  if (Array.isArray(node)) {
    return node.reduce((count, child) => count + renderedNodeCount(child, matches), 0);
  }
  if (node === null || typeof node !== "object") {
    return 0;
  }
  const renderedNode = node as { children?: unknown[]; props?: Record<string, unknown> };
  return (renderedNode.props && matches(renderedNode.props) ? 1 : 0)
    + renderedNodeCount(renderedNode.children ?? [], matches);
}

function expectText(renderer: TestRenderer.ReactTestRenderer, expected: string): void {
  expect(collectText(renderer.root)).toContain(expected);
}

function expectHistoryRowAccessibility(renderer: TestRenderer.ReactTestRenderer, expected: string): void {
  expect(historyAttemptRows(renderer).some((row) => String(row.props.accessibilityLabel ?? "").includes(expected))).toBe(true);
}

function expectNoHistoryRowAccessibility(renderer: TestRenderer.ReactTestRenderer, expected: string): void {
  expect(historyAttemptRows(renderer).some((row) => String(row.props.accessibilityLabel ?? "").includes(expected))).toBe(false);
}

function historyAttemptRows(renderer: TestRenderer.ReactTestRenderer): TestRenderer.ReactTestInstance[] {
  return renderer.root.findAll(
    (node) => typeof node.props.testID === "string"
      && node.props.testID.startsWith("history-attempt-")
      && node.props.accessibilityRole === "button"
  );
}

function testIdOrder(renderer: TestRenderer.ReactTestRenderer, first: string, second: string): number {
  const testIDs = collectTestIds(renderer.root);
  return testIDs.indexOf(first) - testIDs.indexOf(second);
}

function collectTestIds(node: TestRenderer.ReactTestInstance): string[] {
  const ownTestID = typeof node.props?.testID === "string" ? [node.props.testID] : [];
  const childTestIDs = node.children
    .filter((child): child is TestRenderer.ReactTestInstance => typeof child !== "string")
    .flatMap((child) => collectTestIds(child));
  return [...ownTestID, ...childTestIDs];
}

function collectText(node: TestRenderer.ReactTestInstance): string {
  const ownText = node.children.filter((child): child is string => typeof child === "string").join("");
  const childText = node.children
    .filter((child): child is TestRenderer.ReactTestInstance => typeof child !== "string")
    .map((child) => collectText(child))
    .join("");
  return ownText + childText;
}

function hasStyleValue(node: TestRenderer.ReactTestInstance, value: string): boolean {
  const style = node.props?.style;
  if (styleContains(style, value)) {
    return true;
  }
  return node.children
    .filter((child): child is TestRenderer.ReactTestInstance => typeof child !== "string")
    .some((child) => hasStyleValue(child, value));
}

function countStyleValue(node: TestRenderer.ReactTestInstance, value: string): number {
  const style = node.props?.style;
  const own = styleContains(style, value) ? 1 : 0;
  return own + node.children
    .filter((child): child is TestRenderer.ReactTestInstance => typeof child !== "string")
    .reduce((sum, child) => sum + countStyleValue(child, value), 0);
}

function hasStyleEntry(node: TestRenderer.ReactTestInstance, key: string, value: unknown): boolean {
  return countStyleEntry(node, key, value) > 0;
}

function countStyleEntry(node: TestRenderer.ReactTestInstance, key: string, value: unknown): number {
  const style = node.props?.style;
  const own = styleEntryMatches(style, key, value) ? 1 : 0;
  return own + node.children
    .filter((child): child is TestRenderer.ReactTestInstance => typeof child !== "string")
    .reduce((sum, child) => sum + countStyleEntry(child, key, value), 0);
}

function styleEntryMatches(style: unknown, key: string, value: unknown): boolean {
  if (!style) {
    return false;
  }
  if (Array.isArray(style)) {
    return style.some((entry) => styleEntryMatches(entry, key, value));
  }
  if (typeof style === "object") {
    return (style as Record<string, unknown>)[key] === value;
  }
  return false;
}

function styleContains(style: unknown, value: string): boolean {
  if (!style) {
    return false;
  }
  if (Array.isArray(style)) {
    return style.some((entry) => styleContains(entry, value));
  }
  if (typeof style === "object") {
    return Object.values(style as Record<string, unknown>).some((entry) => {
      if (entry === value) {
        return true;
      }
      return styleContains(entry, value);
    });
  }
  return false;
}

function countPiecesInFen(fen: string): number {
  return new Chess(fen).board().flat().filter(Boolean).length;
}

function formatTestWholeNumber(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function tryFenAfterMove(fen: string, move: string): string | null {
  try {
    const chess = new Chess(fen);
    const played = chess.move({
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      ...(move.length > 4 ? { promotion: move.slice(4, 5) } : {})
    });
    return played ? chess.fen() : null;
  } catch {
    return null;
  }
}

function mustFenAfterMove(fen: string, move: string): string {
  const nextFen = tryFenAfterMove(fen, move);
  if (!nextFen) {
    throw new Error(`Illegal test move ${move} from ${fen}`);
  }
  return nextFen;
}

function firstLegalMoveNotIn(fen: string, excludedMoves: string[]): string {
  const excluded = new Set(excludedMoves.map((move) => move.toLowerCase()));
  const move = new Chess(fen)
    .moves({ verbose: true })
    .map((candidate) => `${candidate.from}${candidate.to}${candidate.promotion ?? ""}`)
    .find((candidate) => !excluded.has(candidate.toLowerCase()));
  if (!move) {
    throw new Error(`No legal move outside ${excludedMoves.join(", ")} from ${fen}`);
  }
  return move;
}

function firstLegalNonCandidate(fen: string, candidates: string[]): string {
  const normalizedCandidates = new Set(candidates.map((candidate) => candidate.toLowerCase()));
  const move = new Chess(fen)
    .moves({ verbose: true })
    .map((candidate) => `${candidate.from}${candidate.to}${candidate.promotion ?? ""}`)
    .find((candidate) => !normalizedCandidates.has(candidate.toLowerCase()));
  if (!move) {
    throw new Error(`No legal non-candidate moves from ${fen}`);
  }
  return move;
}
