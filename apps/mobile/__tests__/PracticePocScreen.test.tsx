import React from "react";
import { Chess } from "chess.js";
import androidPracticeFixture from "../../../fixtures/puzzles/android-standard-practice.fixture.json";
import { AppState } from "react-native";
import * as ReactNative from "react-native";
import * as SafeAreaContext from "react-native-safe-area-context";
import TestRenderer, { act } from "react-test-renderer";
import {
  isAppReviewRequestSurfaceBlocked,
  PracticePocScreen,
  type PracticeDebugTraceEvent,
  type PracticeRunManagementPresentation,
  type TacticalProfilePresentation
} from "../src/components/PracticePocScreen";
import {
  buildPracticeAdaptiveLayout,
  PRACTICE_PROMPT_BASE_HEIGHT,
  PRACTICE_UI_PADDING,
  type PracticeSafeAreaInsets
} from "../src/components/adaptivePracticeLayout";
import {
  ARROW_DUEL_REPLY_LAB_MOVES,
  LabScenario
} from "../../mobile-lab/src/LabScenario";
import {
  createMobilePracticeService,
  configureMobilePracticePuzzleSource,
  getBundledCorePackManifest,
  seededPuzzleCount,
  seededUniquePositionCount
} from "../src/platform/mobilePractice";
import { fixtureNeedsAtLeast, PracticeService } from "../../../packages/storage/src/practice-service";
import { MemoryStore } from "../../../packages/storage/src/memory-store";
import { MemoryTacticalProfileRepository } from "../../../packages/storage/src/tactical-profile-repository";
import { TacticalProfileService } from "../../../packages/storage/src/tactical-profile-service";
import { defaultSprintConfig, formatLocalCalendarDate, formatReviewDay, isServerCompatibleArrowDuelPuzzle, practiceRunSprintConfig, PRACTICE_RUN_NAME_MAX_LENGTH, startSprint, type ArrowDuelState, type AttemptEvent, type Puzzle, type PuzzleTimingPolicy, type SprintState, type TacticalProfileCalibrationArtifact, type UciEngineTransport } from "../../../packages/core/src/index";
import { FakeReviewReminderNotificationClient, FakeReviewReminderScheduler } from "../src/platform/reviewReminderScheduler";
import { FakeICloudProgressSyncClient } from "../src/platform/iCloudProgressSync";
import { decodeProgressV2Record } from "../../../packages/storage/src/progress-sync-v2";
import { FakeMoveFeedbackClient } from "../src/platform/moveFeedback";
import { FakeAppStoreReviewRequestClient } from "../src/platform/appStoreReviewRequest";
import type { MobilePlatformCapabilities } from "../src/platform/mobilePlatformCapabilities";
import type { MobileSystemBackSource } from "../src/navigation/mobileSystemBack";
import {
  createTestMobilePlatformCapabilities,
  type TestMobilePlatformCapabilityOverrides
} from "../src/testing/testMobilePlatformCapabilities";
import {
  FailingAppReviewRequestStore,
  FailingAttemptStore
} from "../test-support/FailingAttemptStore";
import { FailingReviewScheduleStore } from "../test-support/FailingReviewScheduleStore";
import {
  expectNoRenderedTextHasNonPositiveFontSize,
  flattenTestStyle
} from "../test-support/testRendererSupport";

const tacticalProfilePuzzleFixture = require("../../../fixtures/puzzles/presolved-1000.json") as Puzzle[];

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
  (ReactNative as unknown as { __resetScrollView?: () => void }).__resetScrollView?.();
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
    expectDisclosureClosed(renderer, "history-advanced-filters");
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
      if (beforeTestID === "review-queue-filters") {
        expectDisclosureClosed(renderer, beforeTestID);
      } else {
        expect(() => findByTestId(renderer, beforeTestID)).toThrow();
      }
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
    startSprintWithPuzzleTiming(service, {
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      puzzleTiming: {
        slowAfterSeconds: null,
        timeoutAfterSeconds: null
      },
      targetCorrect: 15,
      maxMistakes: 3
    });
    const renderer = renderScreen({ practiceService: service, systemBack });

    press(renderer, "practice-resume-card");
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
    startSprintWithPuzzleTiming(service, {
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      puzzleTiming: {
        slowAfterSeconds: null,
        timeoutAfterSeconds: null
      },
      targetCorrect: 15,
      maxMistakes: 3
    });
    const renderer = renderScreen({ practiceService: service, systemBack });

    press(renderer, "practice-resume-card");
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
    service.loadFixturePuzzles([androidPracticeFixture.puzzle as Puzzle]);
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
    press(renderer, "custom-theme-back-rank-mate");
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
    expect(() => findByTestId(renderer, "session-side-to-move")).toThrow();
    expect(findByTestId(renderer, "chessboard-king-black-sprite")).toBeTruthy();
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

  it("binds Unclear to the completed attempt and replaces the yellow action with a blue read-only status", async () => {
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
    expect(flattenTestStyle(findByTestId(renderer, "sprint-unclear-marked").props.style))
      .toMatchObject({ backgroundColor: "#EFF6FF", borderColor: "#93C5FD" });
    expect(flattenTestStyle(
      findByTestId(renderer, "sprint-unclear-marked").findByType(ReactNative.Text).props.style
    ).color).toBe("#1D4ED8");
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
    expect(collectText(findByTestId(renderer, "sprint-result-unclear-summary"))).toContain(
      "Included in replay"
    );
    expect(collectText(findByTestId(renderer, "review-mistakes-button"))).toBe(
      "Replay 1 attempt"
    );

    const historyCountBeforeReplay = service.listHistory().length;
    const ratingBeforeReplay = service.getRating("standard 5/20");
    press(renderer, "review-mistakes-button");

    expect(collectText(findByTestId(renderer, "review-title"))).toBe("Replay");
    expect(collectText(findByTestId(renderer, "history-attempt-clear-unclear"))).toBe(
      "Mark clear"
    );
    expect(() => findByTestId(renderer, "review-schedule-add")).toThrow();
    expect(service.listHistory()).toHaveLength(historyCountBeforeReplay);
    expect(service.getRating("standard 5/20")).toEqual(ratingBeforeReplay);

    press(renderer, "history-attempt-clear-unclear");
    expect(service.getHistoryAttempt(attemptId ?? "")).toMatchObject({ unclear: false });
    expect(() => findByTestId(renderer, "history-attempt-clear-unclear")).toThrow();
  });

  it.each([
    { height: 932, label: "portrait", width: 430 },
    { height: 390, label: "landscape", width: 844 }
  ])("places Unclear after the board and score in $label", async ({
    height,
    width
  }) => {
    const windowDimensions = ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: {
        fontScale: number;
        height: number;
        scale: number;
        width: number;
      }) => void;
    };
    windowDimensions.__setWindowDimensions?.({
      width,
      height,
      scale: 3,
      fontScale: 1
    });

    const renderer = renderScreen({
      practiceService: createMobilePracticeService("familiar15")
    });
    startStandardSprint(renderer);
    await boardMove(renderer, "c2b1");

    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(testIdOrder(renderer, "session-board", "sprint-unclear-prompt")).toBeLessThan(0);
    expect(testIdOrder(renderer, "session-score-strip", "sprint-unclear-prompt")).toBeLessThan(0);

    if (width > height) {
      expect(findByTestId(renderer, "active-session-control-rail")
        .findByProps({ testID: "sprint-unclear-prompt" })).toBeTruthy();
      expect(() => findByTestId(renderer, "active-session-board-lane")
        .findByProps({ testID: "sprint-unclear-prompt" })).toThrow();
    } else {
      expect(() => findByTestId(renderer, "active-session-control-rail")).toThrow();
    }
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

  it("clears the Unclear prompt when the next completed puzzle is a mistake", async () => {
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
    expect(() => findByTestId(renderer, "sprint-unclear-question")).toThrow();
    expect(() => findByTestId(renderer, "sprint-unclear-toggle")).toThrow();
    expect(collectText(findByTestId(renderer, "sprint-previous-attempt-notice"))).toBe(
      "Previous answer was incorrectIt counted as a mistake and was added to Review.In Review"
    );
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
    if (expandedSurface === "history-advanced-filters" || expandedSurface === "review-queue-filters") {
      expectDisclosureClosed(renderer, expandedSurface);
    } else {
      expect(() => findByTestId(renderer, expandedSurface)).toThrow();
    }
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

  it("restores Review and primary navigation in the same visible commit when X exits", () => {
    const commits: Array<{
      primaryNavigationVisible: boolean;
      reviewPanelVisible: boolean;
    }> = [];
    let recordCommits = false;
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    renderer = renderScreen({
      practiceService: createDueReviewService(2),
      onRenderCommit: () => {
        if (!recordCommits || !renderer) {
          return;
        }
        commits.push({
          primaryNavigationVisible: renderer.root.findAllByProps({ testID: "review-tab" }).length > 0,
          reviewPanelVisible: renderer.root.findAllByProps({ testID: "review-panel" }).length > 0
        });
      }
    });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    recordCommits = true;
    press(renderer, "review-exit");

    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
    expect(findByTestId(renderer, "review-tab")).toBeTruthy();
    expect(commits).not.toContainEqual({
      primaryNavigationVisible: false,
      reviewPanelVisible: true
    });
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

  it("renders named Home runs and dispatches the Storybook presentation intents", () => {
    const onIntent = jest.fn();
    const renderer = renderScreen({
      runManagementPresentation: runManagementPresentation({ onIntent })
    });

    expect(findByTestId(renderer, "practice-run-management")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-run-standard"))).toContain("Standard");
    expect(collectText(findByTestId(renderer, "practice-run-tactics-focus"))).toContain("Tactics Focus");
    expect(findByTestId(renderer, "practice-run-tactics-focus-glyph-standard-outer")).toBeTruthy();
    expect(findByTestId(renderer, "practice-run-candidate-sprint-glyph-arrow-a-shaft")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-progress-summary"))).toContain("Standard rating");

    press(renderer, "practice-run-home-edit");
    press(renderer, "practice-add-run");
    press(renderer, "practice-run-start");

    expect(onIntent.mock.calls.map(([intent]) => intent)).toEqual([
      { type: "toggle-home-edit" },
      { type: "add-run" },
      { type: "start-selected-run" }
    ]);
  });

  it("keeps the 40-character Run name contract while truncating long Home titles visually", () => {
    const longName = "R".repeat(PRACTICE_RUN_NAME_MAX_LENGTH);
    const presentation = runManagementPresentation();
    const renderer = renderScreen({
      runManagementPresentation: runManagementPresentation({
        runs: presentation.runs.map((run) => run.id === "tactics-focus"
          ? { ...run, name: longName }
          : run)
      })
    });

    const title = findByTestId(renderer, "practice-run-name-tactics-focus");
    expect(collectText(title)).toBe(longName);
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.ellipsizeMode).toBe("tail");

    const editor = renderScreen({
      runManagementPresentation: runManagementPresentation({
        draft: {
          name: "",
          kind: "custom",
          mode: "custom",
          elo: 900,
          durationSeconds: 300,
          perPuzzleSeconds: 20,
          puzzleTiming: { slowAfterSeconds: 40, timeoutAfterSeconds: 60 },
          themes: ["mixed"]
        },
        screen: "create"
      })
    });
    expect(findByTestId(editor, "practice-run-name-input").props.maxLength).toBe(
      PRACTICE_RUN_NAME_MAX_LENGTH
    );
  });

  it("uses whole-card drag guidance and arrow fallbacks while editing Home runs", () => {
    const onIntent = jest.fn();
    const renderer = renderScreen({
      runManagementPresentation: runManagementPresentation({ homeEditing: true, onIntent })
    });

    expect(collectText(findByTestId(renderer, "practice-run-management"))).toContain(
      "Touch and hold a card to drag, or use the arrow buttons."
    );
    expect(() => findByTestId(renderer, "practice-run-drag-tactics-focus")).toThrow();
    expect(findByTestId(renderer, "practice-run-move-up-tactics-focus")).toBeTruthy();
    expect(findByTestId(renderer, "practice-run-move-down-tactics-focus")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-run-edit-tactics-focus"))).toBe("Edit rating");
    expect(hasStyleEntry(findByTestId(renderer, "practice-run-tactics-focus"), "borderColor", "#CBD5E1")).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "practice-run-tactics-focus"), "borderStyle", "solid")).toBe(true);

    press(renderer, "practice-run-move-down-tactics-focus");
    press(renderer, "practice-run-edit-tactics-focus");
    expect(onIntent.mock.calls.map(([intent]) => intent)).toEqual([
      { type: "move-run", runId: "tactics-focus", targetRunId: "candidate-sprint" },
      { type: "edit-run", runId: "tactics-focus" }
    ]);
  });

  it("keeps native Run transforms mounted after leaving Edit Runs", () => {
    const renderer = renderScreen({ runManagementEnabled: true });

    press(renderer, "practice-run-home-edit");
    expect(flattenTestStyle(
      findNativeRunDragSurface(renderer, "practice-run-standard").props.style
    ).transform).toEqual(expect.any(Array));

    press(renderer, "practice-run-home-done");
    const settledRunSurface = renderer.root
      .findAllByProps({ testID: "practice-run-standard" })
      .find((node) => Array.isArray(flattenTestStyle(node.props.style).transform));

    expect(settledRunSurface).toBeTruthy();
  });

  it("shows picked-up feedback and locks Edit Runs while a Run card drag is active", () => {
    const runReorderFeedbackPreview = jest.fn();
    const moveFeedbackClient = new FakeMoveFeedbackClient();
    const practiceService = createMobilePracticeService("random1000");
    const renderer = renderScreen({
      moveFeedbackClient,
      practiceService,
      runManagementPresentation: runManagementPresentation({ homeEditing: true }),
      runReorderFeedbackPreview
    });
    const mainScroll = findByTestId(renderer, "practice-main-scroll");
    const standardRun = renderer.root.findAllByProps({ testID: "practice-run-standard" })
      .find((node) => typeof node.props.onTouchStart === "function");

    expect(standardRun).toBeTruthy();

    expect(mainScroll.props.scrollEnabled).toBe(true);

    act(() => {
      standardRun!.props.onTouchStart();
    });
    expect(standardRun!.props.onMoveShouldSetPanResponder({}, { dx: 0, dy: 12 })).toBe(false);
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);

    act(() => {
      standardRun!.props.onTouchStart();
      jest.advanceTimersByTime(180);
    });
    expect(standardRun!.props.onMoveShouldSetPanResponder({}, { dx: 0, dy: 12 })).toBe(true);

    act(() => {
      standardRun!.props.onPanResponderGrant();
    });
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(false);
    expect(runReorderFeedbackPreview).toHaveBeenCalledTimes(1);
    expect(runReorderFeedbackPreview).toHaveBeenCalledWith({ haptic: "medium" });
    expect(moveFeedbackClient.requests).toEqual([{
      cue: "move",
      playSound: false,
      playHaptic: true
    }]);
    const pickedUpRun = renderer.root.findAllByProps({ testID: "practice-run-standard" })
      .find((node) => typeof node.props.onTouchStart === "function");
    expect(pickedUpRun).toBeTruthy();
    expect(flattenTestStyle(pickedUpRun!.props.style).transform)
      .toEqual(expect.arrayContaining([{ translateX: 10 }, { translateY: -2 }, { scale: 1.015 }]));

    act(() => {
      standardRun!.props.onPanResponderRelease();
    });
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);

    act(() => {
      standardRun!.props.onTouchStart();
      jest.advanceTimersByTime(180);
      standardRun!.props.onPanResponderGrant();
      standardRun!.props.onPanResponderTerminate();
    });
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);
    expect(runReorderFeedbackPreview).toHaveBeenCalledTimes(2);
    expect(moveFeedbackClient.requests).toHaveLength(2);
  });

  it("picks up a native Run when the hold threshold elapses without waiting for movement", () => {
    const runReorderFeedbackPreview = jest.fn();
    const moveFeedbackClient = new FakeMoveFeedbackClient();
    const renderer = renderScreen({
      moveFeedbackClient,
      runManagementPresentation: runManagementPresentation({ homeEditing: true }),
      runReorderFeedbackPreview
    });
    const standardRun = findNativeRunDragSurface(renderer, "practice-run-standard");

    act(() => {
      standardRun.props.onTouchStart();
      jest.advanceTimersByTime(180);
    });

    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(false);
    expect(runReorderFeedbackPreview).toHaveBeenCalledTimes(1);
    expect(moveFeedbackClient.requests).toEqual([{
      cue: "move",
      playSound: false,
      playHaptic: true
    }]);
    expect(flattenTestStyle(
      findNativeRunDragSurface(renderer, "practice-run-standard").props.style
    ).transform).toEqual(expect.arrayContaining([
      { translateX: 10 },
      { translateY: -2 },
      { scale: 1.015 }
    ]));

    act(() => {
      standardRun.props.onTouchEnd();
    });
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);
  });

  it("previews a native card-sized insertion slot and commits the reorder only on drop", () => {
    const onIntent = jest.fn();
    const renderer = renderScreen({
      runManagementPresentation: runManagementPresentation({ homeEditing: true, onIntent })
    });
    const standardRun = findNativeRunDragSurface(renderer, "practice-run-standard");
    const tacticsRun = findNativeRunDragSurface(renderer, "practice-run-tactics-focus");
    const candidateRun = findNativeRunDragSurface(renderer, "practice-run-candidate-sprint");

    layoutNativeRunSurface(standardRun, 0, 100);
    layoutNativeRunSurface(tacticsRun, 110, 100);
    layoutNativeRunSurface(candidateRun, 220, 100);
    startNativeRunDrag(standardRun, 50);
    moveNativeRunDrag(standardRun, 260, 210);

    expect(onIntent).not.toHaveBeenCalled();
    const insertionOutline = findByTestId(renderer, "practice-run-insertion-outline");
    expect(flattenTestStyle(insertionOutline.props.style)).toEqual(expect.objectContaining({
      borderColor: "#2563EB",
      borderStyle: "dashed",
      borderWidth: 2,
      height: 100,
      left: 0,
      right: 0,
      top: 220,
      zIndex: 15
    }));
    const previewTransform = flattenTestStyle(
      findNativeRunDragSurface(renderer, "practice-run-tactics-focus").props.style
    ).transform as Array<{ translateY?: number | { value: number } }>;
    expect(previewTransform.some((entry) =>
      typeof entry.translateY === "object" && entry.translateY.value === -110
    )).toBe(true);

    act(() => {
      standardRun.props.onPanResponderRelease();
    });

    expect(onIntent).toHaveBeenCalledTimes(1);
    expect(onIntent).toHaveBeenCalledWith({
      type: "move-run",
      runId: "standard",
      targetRunId: "candidate-sprint"
    });
    expect(() => findByTestId(renderer, "practice-run-insertion-outline")).toThrow();
  });

  it("settles displaced native Runs directly into the committed drop layout", () => {
    const springSpy = jest.spyOn(ReactNative.Animated, "spring");
    const layoutAnimationSpy = jest.spyOn(ReactNative.LayoutAnimation, "configureNext");
    try {
      const service = createMobilePracticeService("random1000");
      const renderer = renderScreen({ practiceService: service, runManagementEnabled: true });
      press(renderer, "practice-run-home-edit");
      const standardRun = findNativeRunDragSurface(renderer, "practice-run-standard");
      const arrowDuelRun = findNativeRunDragSurface(renderer, "practice-run-arrow-duel");

      layoutNativeRunSurface(standardRun, 0, 100);
      layoutNativeRunSurface(arrowDuelRun, 110, 100);
      startNativeRunDrag(standardRun, 50);
      moveNativeRunDrag(standardRun, 150, 100);

      const arrowDuelPreviewTransform = flattenTestStyle(
        findNativeRunDragSurface(renderer, "practice-run-arrow-duel").props.style
      ).transform as Array<{ translateY?: number | { value: number } }>;
      const displacedOffset = arrowDuelPreviewTransform.find((entry) =>
        typeof entry.translateY === "object" && entry.translateY.value === -110
      )?.translateY;
      const draggedTransform = flattenTestStyle(
        findNativeRunDragSurface(renderer, "practice-run-standard").props.style
      ).transform as Array<{ translateY?: number | { value: number } }>;
      const draggedOffset = draggedTransform.find((entry) =>
        typeof entry.translateY === "object" && entry.translateY.value === 100
      )?.translateY;
      expect(typeof displacedOffset).toBe("object");
      expect(typeof draggedOffset).toBe("object");
      springSpy.mockClear();
      layoutAnimationSpy.mockClear();

      act(() => {
        standardRun.props.onPanResponderRelease();
        // Keep the dragged card at the preview destination until Fabric can
        // commit both the reordered parent tree and the zeroed transform.
        // Clearing it in the responder flashes the card back in its source slot.
        expect((draggedOffset as { value: number }).value).toBe(100);
      });

      const committedDraggedTransform = flattenTestStyle(
        findNativeRunDragSurface(renderer, "practice-run-standard").props.style
      ).transform as Array<{ translateY?: number | { value: number } }>;
      expect(committedDraggedTransform.slice(0, 2)).toEqual([
        { translateY: 0 },
        { translateY: 0 }
      ]);

      expect(springSpy.mock.calls.some(([value, configuration]) =>
        value === (displacedOffset as unknown) && configuration.toValue === 0
      )).toBe(false);
      expect(springSpy.mock.calls.some(([value, configuration]) =>
        value === (draggedOffset as unknown) && configuration.toValue === 0
      )).toBe(false);
      expect(layoutAnimationSpy).not.toHaveBeenCalled();
      expect((displacedOffset as { value: number }).value).toBe(0);
      expect((draggedOffset as { value: number }).value).toBe(0);
      expect([...new Set(renderer.root.findAll((node) =>
        typeof node.props.onTouchStart === "function"
          && typeof node.props.testID === "string"
          && node.props.testID.startsWith("practice-run-")
      ).map((node) => node.props.testID as string))]).toEqual([
        "practice-run-arrow-duel",
        "practice-run-standard"
      ]);
    } finally {
      layoutAnimationSpy.mockRestore();
      springSpy.mockRestore();
    }
  });

  it("keeps a consecutive native drop aligned while reordered layouts are still pending", () => {
    const service = createMobilePracticeService("random1000");
    service.createPracticeRun({
      id: "test-run",
      name: "Test Run",
      mode: "custom",
      durationSeconds: 180,
      perPuzzleSeconds: 5,
      initialRating: 600,
      themes: ["mixed"]
    });
    service.createPracticeRun({
      id: "arrow-duel-long",
      name: "Arrow Duel Long",
      mode: "arrow_duel",
      durationSeconds: 600,
      perPuzzleSeconds: 30,
      initialRating: 770,
      themes: ["mixed"]
    });
    const renderer = renderScreen({ practiceService: service, runManagementEnabled: true });
    press(renderer, "practice-run-home-edit");

    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-standard"), 0, 100);
    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-arrow-duel"), 110, 100);
    const testRun = findNativeRunDragSurface(renderer, "practice-run-test-run");
    layoutNativeRunSurface(testRun, 220, 100);
    layoutNativeRunSurface(
      findNativeRunDragSurface(renderer, "practice-run-arrow-duel-long"),
      330,
      100
    );

    startNativeRunDrag(testRun, 270);
    moveNativeRunDrag(testRun, 50, -220);
    act(() => {
      testRun.props.onPanResponderRelease();
    });
    expect(service.listPracticeRuns().filter((run) => !run.archived).map((run) => run.id)).toEqual([
      "test-run",
      "standard",
      "arrow-duel",
      "arrow-duel-long"
    ]);

    // React Native can deliver the new card layouts after the next gesture begins.
    // The visual slots are already in their committed order, so the second drag
    // must not use each keyed card's stale pre-drop y coordinate.
    const arrowDuelLong = findNativeRunDragSurface(renderer, "practice-run-arrow-duel-long");
    startNativeRunDrag(arrowDuelLong, 380);
    moveNativeRunDrag(arrowDuelLong, 160, -220);

    const standardPreviewTransform = flattenTestStyle(
      findNativeRunDragSurface(renderer, "practice-run-standard").props.style
    ).transform as Array<{ translateY?: number | { value: number } }>;
    const arrowDuelPreviewTransform = flattenTestStyle(
      findNativeRunDragSurface(renderer, "practice-run-arrow-duel").props.style
    ).transform as Array<{ translateY?: number | { value: number } }>;
    expect(standardPreviewTransform.some((entry) =>
      typeof entry.translateY === "object" && entry.translateY.value === 110
    )).toBe(true);
    expect(arrowDuelPreviewTransform.some((entry) =>
      typeof entry.translateY === "object" && entry.translateY.value === 110
    )).toBe(true);

    act(() => {
      arrowDuelLong.props.onPanResponderRelease();
    });
    expect(service.listPracticeRuns().filter((run) => !run.archived).map((run) => run.id)).toEqual([
      "test-run",
      "arrow-duel-long",
      "standard",
      "arrow-duel"
    ]);
  });

  it("keeps a six-Run first-to-third native drop accurate when reordered layouts arrive mid-drag", () => {
    const service = createMobilePracticeService("random1000");
    service.createPracticeRun({
      id: "test-run",
      name: "Test Run",
      mode: "custom",
      durationSeconds: 180,
      perPuzzleSeconds: 5,
      initialRating: 600,
      themes: ["mixed"]
    });
    service.createPracticeRun({
      id: "arrow-duel-long",
      name: "Arrow Duel Long",
      mode: "arrow_duel",
      durationSeconds: 600,
      perPuzzleSeconds: 30,
      initialRating: 770,
      themes: ["mixed"]
    });
    service.createPracticeRun({
      id: "speed-run",
      name: "Speed Run",
      mode: "custom",
      durationSeconds: 120,
      perPuzzleSeconds: 10,
      initialRating: 650,
      themes: ["mixed"]
    });
    service.createPracticeRun({
      id: "endgame-run",
      name: "Endgame Run",
      mode: "custom",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      initialRating: 700,
      themes: ["endgame"]
    });
    const renderer = renderScreen({ practiceService: service, runManagementEnabled: true });
    press(renderer, "practice-run-home-edit");

    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-standard"), 0, 100);
    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-arrow-duel"), 110, 100);
    const testRun = findNativeRunDragSurface(renderer, "practice-run-test-run");
    layoutNativeRunSurface(testRun, 220, 100);
    layoutNativeRunSurface(
      findNativeRunDragSurface(renderer, "practice-run-arrow-duel-long"),
      330,
      100
    );
    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-speed-run"), 440, 100);
    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-endgame-run"), 550, 100);

    startNativeRunDrag(testRun, 270);
    moveNativeRunDrag(testRun, 50, -220);
    act(() => {
      testRun.props.onPanResponderRelease();
    });
    expect(renderedNativeRunTestIds(renderer)).toEqual([
      "practice-run-test-run",
      "practice-run-standard",
      "practice-run-arrow-duel",
      "practice-run-arrow-duel-long",
      "practice-run-speed-run",
      "practice-run-endgame-run"
    ]);

    // React Native can deliver the committed reorder's onLayout callbacks after
    // the user has already picked up the next card. Those late notifications
    // describe positions the cards are already drawn at, so they must not be
    // treated as a mid-drag base move that shifts the card and the pointer.
    const firstRun = findNativeRunDragSurface(renderer, "practice-run-test-run");
    startNativeRunDrag(firstRun, 50);
    layoutNativeRunSurface(firstRun, 0, 100);
    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-standard"), 110, 100);
    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-arrow-duel"), 220, 100);
    layoutNativeRunSurface(
      findNativeRunDragSurface(renderer, "practice-run-arrow-duel-long"),
      330,
      100
    );
    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-speed-run"), 440, 100);
    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-endgame-run"), 550, 100);

    // A prior native layout generation can remain queued behind the committed
    // reorder. Once pickup freezes the next drag's geometry, that stale
    // generation must not move the card or replace the parent's optimistic
    // snapshot before the finger crosses two Runs.
    layoutNativeRunSurface(firstRun, 220, 100);
    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-standard"), 0, 100);
    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-arrow-duel"), 110, 100);
    layoutNativeRunSurface(
      findNativeRunDragSurface(renderer, "practice-run-arrow-duel-long"),
      330,
      100
    );
    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-speed-run"), 440, 100);
    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-endgame-run"), 550, 100);
    moveNativeRunDrag(firstRun, 270, 220);

    expect(flattenTestStyle(
      findByTestId(renderer, "practice-run-insertion-outline").props.style
    )).toEqual(expect.objectContaining({
      borderStyle: "dashed",
      height: 100,
      top: 220
    }));
    for (const crossedRunTestId of ["practice-run-standard", "practice-run-arrow-duel"]) {
      const previewTransform = flattenTestStyle(
        findNativeRunDragSurface(renderer, crossedRunTestId).props.style
      ).transform as Array<{ translateY?: number | { value: number } }>;
      expect(previewTransform.some((entry) =>
        typeof entry.translateY === "object" && entry.translateY.value === -110
      )).toBe(true);
    }

    act(() => {
      firstRun.props.onPanResponderRelease();
    });
    expect(renderedNativeRunTestIds(renderer)).toEqual([
      "practice-run-standard",
      "practice-run-arrow-duel",
      "practice-run-test-run",
      "practice-run-arrow-duel-long",
      "practice-run-speed-run",
      "practice-run-endgame-run"
    ]);
    expect(() => findByTestId(renderer, "practice-run-insertion-outline")).toThrow();
  });

  it("cancels a native Run insertion preview without committing the reorder", () => {
    const onIntent = jest.fn();
    const renderer = renderScreen({
      runManagementPresentation: runManagementPresentation({ homeEditing: true, onIntent })
    });
    const standardRun = findNativeRunDragSurface(renderer, "practice-run-standard");

    layoutNativeRunSurface(standardRun, 0, 100);
    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-tactics-focus"), 110, 100);
    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-candidate-sprint"), 220, 100);
    startNativeRunDrag(standardRun, 50);
    moveNativeRunDrag(standardRun, 150, 100);

    expect(findByTestId(renderer, "practice-run-insertion-outline")).toBeTruthy();
    act(() => {
      standardRun.props.onPanResponderTerminate();
    });

    expect(onIntent).not.toHaveBeenCalled();
    expect(() => findByTestId(renderer, "practice-run-insertion-outline")).toThrow();
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);
  });

  it("keeps the spring-back animation when a native Run drag is canceled", () => {
    const springSpy = jest.spyOn(ReactNative.Animated, "spring");
    try {
      const renderer = renderScreen({
        runManagementPresentation: runManagementPresentation({ homeEditing: true })
      });
      const standardRun = findNativeRunDragSurface(renderer, "practice-run-standard");
      const tacticsRun = findNativeRunDragSurface(renderer, "practice-run-tactics-focus");
      const candidateRun = findNativeRunDragSurface(renderer, "practice-run-candidate-sprint");

      layoutNativeRunSurface(standardRun, 0, 100);
      layoutNativeRunSurface(tacticsRun, 110, 100);
      layoutNativeRunSurface(candidateRun, 220, 100);
      startNativeRunDrag(standardRun, 50);
      moveNativeRunDrag(standardRun, 260, 210);

      const displacedOffset = (flattenTestStyle(
        findNativeRunDragSurface(renderer, "practice-run-tactics-focus").props.style
      ).transform as Array<{ translateY?: number | { value: number } }>).find((entry) =>
        typeof entry.translateY === "object" && entry.translateY.value === -110
      )?.translateY;
      const draggedOffset = (flattenTestStyle(
        findNativeRunDragSurface(renderer, "practice-run-standard").props.style
      ).transform as Array<{ translateY?: number | { value: number } }>).find((entry) =>
        typeof entry.translateY === "object" && entry.translateY.value === 210
      )?.translateY;
      expect(typeof displacedOffset).toBe("object");
      expect(typeof draggedOffset).toBe("object");
      springSpy.mockClear();

      act(() => {
        standardRun.props.onPanResponderTerminate();
      });

      expect(springSpy.mock.calls.some(([value, configuration]) =>
        value === (displacedOffset as unknown) && configuration.toValue === 0
      )).toBe(true);
      expect(springSpy.mock.calls.some(([value, configuration]) =>
        value === (draggedOffset as unknown) && configuration.toValue === 0
      )).toBe(true);
    } finally {
      springSpy.mockRestore();
    }
  });

  it("lets a native Run return to its original insertion slot before drop", () => {
    const onIntent = jest.fn();
    const renderer = renderScreen({
      runManagementPresentation: runManagementPresentation({ homeEditing: true, onIntent })
    });
    const standardRun = findNativeRunDragSurface(renderer, "practice-run-standard");
    const tacticsRun = findNativeRunDragSurface(renderer, "practice-run-tactics-focus");
    const candidateRun = findNativeRunDragSurface(renderer, "practice-run-candidate-sprint");

    layoutNativeRunSurface(standardRun, 0, 100);
    layoutNativeRunSurface(tacticsRun, 110, 100);
    layoutNativeRunSurface(candidateRun, 220, 100);
    startNativeRunDrag(tacticsRun, 160);
    moveNativeRunDrag(tacticsRun, 270, 110);
    expect(findByTestId(renderer, "practice-run-insertion-outline")).toBeTruthy();

    moveNativeRunDrag(tacticsRun, 170, 10);
    expect(() => findByTestId(renderer, "practice-run-insertion-outline")).toThrow();

    act(() => {
      tacticsRun.props.onPanResponderRelease();
    });
    expect(onIntent).not.toHaveBeenCalled();
  });

  it("auto-scrolls the native Edit Runs list at an edge and stops on cancellation", () => {
    const nativeScrollMock = ReactNative as unknown as {
      __getScrollViewCommands?: () => Array<{ animated: boolean; y: number }>;
      __setScrollViewFrame?: (frame: { height: number; width: number; x: number; y: number }) => void;
      __setViewFrame?: (
        testID: string,
        frame: { height: number; width: number; x: number; y: number }
      ) => void;
    };
    nativeScrollMock.__setScrollViewFrame?.({ x: 0, y: 100, width: 390, height: 400 });
    nativeScrollMock.__setViewFrame?.(
      "practice-run-list",
      { x: 0, y: 100, width: 390, height: 600 }
    );
    const renderer = renderScreen({
      runManagementPresentation: runManagementPresentation({ homeEditing: true })
    });
    const mainScroll = findByTestId(renderer, "practice-main-scroll");
    const standardRun = findNativeRunDragSurface(renderer, "practice-run-standard");

    act(() => {
      mainScroll.props.onLayout({ nativeEvent: { layout: { height: 400 } } });
      mainScroll.props.onContentSizeChange(390, 1_200);
    });
    layoutNativeRunSurface(standardRun, 0, 100);
    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-tactics-focus"), 110, 100);
    layoutNativeRunSurface(findNativeRunDragSurface(renderer, "practice-run-candidate-sprint"), 220, 100);
    startNativeRunDrag(standardRun, 150);
    moveNativeRunDrag(standardRun, 490, 340);
    act(() => {
      jest.advanceTimersByTime(96);
    });

    const commands = nativeScrollMock.__getScrollViewCommands?.() ?? [];
    expect(commands.some((command) => command.y > 0 && command.animated === false)).toBe(true);

    act(() => {
      standardRun.props.onPanResponderTerminate();
    });
    const commandCountAfterCancel = nativeScrollMock.__getScrollViewCommands?.().length ?? 0;
    act(() => {
      jest.advanceTimersByTime(96);
    });
    expect(nativeScrollMock.__getScrollViewCommands?.()).toHaveLength(commandCountAfterCancel);
  });

  it("keeps a device-trace 1-to-3 drop at the third slot outside the edge zone", () => {
    const nativeScrollMock = ReactNative as unknown as {
      __getScrollViewCommands?: () => Array<{ animated: boolean; y: number }>;
      __setScrollViewFrame?: (frame: { height: number; width: number; x: number; y: number }) => void;
      __setViewFrame?: (
        testID: string,
        frame: { height: number; width: number; x: number; y: number }
      ) => void;
    };
    nativeScrollMock.__setScrollViewFrame?.({ x: 0, y: 116.67, width: 440, height: 747 });
    nativeScrollMock.__setViewFrame?.(
      "practice-run-list",
      { x: 0, y: 275, width: 440, height: 653 }
    );
    const onIntent = jest.fn();
    const presentation = runManagementPresentation({ homeEditing: true, onIntent });
    presentation.runs = [
      ...presentation.runs,
      {
        ...presentation.runs[2],
        id: "fourth-run",
        ratingKey: "run:fourth-run",
        name: "Fourth Run"
      },
      {
        ...presentation.runs[2],
        id: "fifth-run",
        ratingKey: "run:fifth-run",
        name: "Fifth Run"
      }
    ];
    const renderer = renderScreen({ runManagementPresentation: presentation });
    const mainScroll = findByTestId(renderer, "practice-main-scroll");
    const runSurfaces = [
      "standard",
      "tactics-focus",
      "candidate-sprint",
      "fourth-run",
      "fifth-run"
    ].map((runId) => findNativeRunDragSurface(renderer, `practice-run-${runId}`));

    act(() => {
      mainScroll.props.onLayout({ nativeEvent: { layout: { height: 747 } } });
      mainScroll.props.onContentSizeChange(440, 1_997);
    });
    runSurfaces.forEach((surface, index) => {
      layoutNativeRunSurface(surface, index * 130.67, 118);
    });
    startNativeRunDrag(runSurfaces[0], 545.33);
    moveNativeRunDrag(runSurfaces[0], 819.33, 274);
    act(() => {
      jest.advanceTimersByTime(1_104);
    });
    expect(nativeScrollMock.__getScrollViewCommands?.()).toHaveLength(0);
    act(() => {
      runSurfaces[0].props.onPanResponderRelease();
    });

    expect(onIntent).toHaveBeenLastCalledWith({
      type: "move-run",
      runId: "standard",
      targetRunId: "candidate-sprint"
    });
  });

  it("respects disabled haptics when a Run card enters drag mode", () => {
    const moveFeedbackClient = new FakeMoveFeedbackClient();
    const practiceService = createMobilePracticeService("random1000");
    practiceService.saveSettings({
      ...practiceService.getSettings(),
      moveFeedback: {
        soundEnabled: true,
        hapticsEnabled: false
      }
    });
    const renderer = renderScreen({
      moveFeedbackClient,
      practiceService,
      runManagementPresentation: runManagementPresentation({ homeEditing: true })
    });
    const standardRun = renderer.root.findAllByProps({ testID: "practice-run-standard" })
      .find((node) => typeof node.props.onTouchStart === "function");

    expect(standardRun).toBeTruthy();
    act(() => {
      standardRun!.props.onTouchStart();
      jest.advanceTimersByTime(180);
      standardRun!.props.onPanResponderGrant();
    });

    expect(moveFeedbackClient.requests).toEqual([]);
  });

  it("keeps Run dragging active when pickup haptic feedback fails", async () => {
    const moveFeedbackClient = {
      play: jest.fn(async () => {
        throw new Error("haptic unavailable");
      })
    };
    const renderer = renderScreen({
      moveFeedbackClient,
      runManagementPresentation: runManagementPresentation({ homeEditing: true })
    });
    const standardRun = renderer.root.findAllByProps({ testID: "practice-run-standard" })
      .find((node) => typeof node.props.onTouchStart === "function");

    expect(standardRun).toBeTruthy();
    await act(async () => {
      standardRun!.props.onTouchStart();
      jest.advanceTimersByTime(180);
      standardRun!.props.onPanResponderGrant();
      await Promise.resolve();
    });

    expect(moveFeedbackClient.play).toHaveBeenCalledWith({
      cue: "move",
      playSound: false,
      playHaptic: true
    });
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(false);

    act(() => {
      standardRun!.props.onPanResponderRelease();
    });
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);
  });

  it("keeps the Storybook picked-up state visual-only", () => {
    const runReorderFeedbackPreview = jest.fn();
    const moveFeedbackClient = new FakeMoveFeedbackClient();
    const renderer = renderScreen({
      moveFeedbackClient,
      runManagementPresentation: runManagementPresentation({ homeEditing: true }),
      runReorderDesignPreview: { pickedUpRunId: "tactics-focus" },
      runReorderFeedbackPreview
    });
    const pickedUpRun = renderer.root.findAllByProps({ testID: "practice-run-tactics-focus" })
      .find((node) => typeof node.props.onTouchStart === "function");

    expect(pickedUpRun).toBeTruthy();
    expect(flattenTestStyle(pickedUpRun!.props.style).transform)
      .toEqual(expect.arrayContaining([{ translateY: -2 }, { scale: 1.015 }]));
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);
    expect(runReorderFeedbackPreview).not.toHaveBeenCalled();
    expect(moveFeedbackClient.requests).toEqual([]);
  });

  it("uses pointer-driven Web dragging without a browser-native ghost", () => {
    const platform = ReactNative.Platform as unknown as { OS: string };
    const previousPlatform = platform.OS;
    const runReorderFeedbackPreview = jest.fn();
    platform.OS = "web";

    try {
      const renderer = renderScreen({
        runManagementPresentation: runManagementPresentation({ homeEditing: true }),
        runReorderFeedbackPreview
      });
      const pointerSurface = (): TestRenderer.ReactTestInstance => renderer.root.findAll(
        (node) => node.props["data-testid"] === "practice-run-standard"
      )[0]!;
      const currentTarget = {
        querySelector: jest.fn(() => null),
        releasePointerCapture: jest.fn(),
        setPointerCapture: jest.fn()
      };
      const target = { closest: jest.fn(() => null) };

      act(() => {
        pointerSurface().props.onPointerDown({
          button: 0,
          clientY: 100,
          currentTarget,
          pointerId: 1,
          pointerType: "mouse",
          target
        });
        pointerSurface().props.onPointerMove({
          clientY: 124,
          currentTarget,
          pointerId: 1,
          preventDefault: jest.fn(),
          target
        });
      });

      expect(runReorderFeedbackPreview).toHaveBeenCalledTimes(1);
      expect(pointerSurface().props.draggable).toBe(false);
      expect(pointerSurface().props["data-browser-drag-ghost"]).toBe("suppressed");
      expect(pointerSurface().props["data-drag-mechanism"]).toBe("pointer");
      expect(pointerSurface().props["data-drag-state"]).toBe("picked-up");
      expect(pointerSurface().props.style.transform).toContain("translate3d(10px, 22px, 0)");
      expect(pointerSurface().props.style.transform).toContain("scale(1.015)");

      act(() => {
        pointerSurface().props.onPointerCancel({
          currentTarget,
          pointerId: 1
        });
      });
      expect(pointerSurface().props["data-drag-state"]).toBeUndefined();
      expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);
    } finally {
      platform.OS = previousPlatform;
    }
  });

  it("keeps touch scrolling available before pickup and auto-scrolls during a Web Run drag", () => {
    const platform = ReactNative.Platform as unknown as { OS: string };
    const previousPlatform = platform.OS;
    const runReorderFeedbackPreview = jest.fn();
    platform.OS = "web";

    try {
      const renderer = renderScreen({
        runManagementPresentation: runManagementPresentation({ homeEditing: true }),
        runReorderFeedbackPreview
      });
      const pointerSurface = (): TestRenderer.ReactTestInstance => renderer.root.findAll(
        (node) => node.props["data-testid"] === "practice-run-standard"
      )[0]!;
      const scrollElement = {
        clientHeight: 400,
        scrollHeight: 1_200,
        scrollTop: 0,
        getBoundingClientRect: jest.fn(() => ({
          bottom: 400,
          height: 400,
          top: 0
        }))
      };
      const currentTarget = {
        closest: jest.fn(() => scrollElement),
        querySelector: jest.fn(() => null),
        releasePointerCapture: jest.fn(),
        setPointerCapture: jest.fn()
      };
      const preventDefault = jest.fn();

      act(() => {
        pointerSurface().props.onPointerDown({
          button: 0,
          clientY: 100,
          currentTarget,
          pointerId: 2,
          pointerType: "touch",
          preventDefault,
          target: { closest: jest.fn(() => null) }
        });
      });

      expect(preventDefault).not.toHaveBeenCalled();
      expect(pointerSurface().props.style.touchAction).toBe("pan-y");

      act(() => {
        jest.advanceTimersByTime(180);
      });

      expect(runReorderFeedbackPreview).toHaveBeenCalledWith({ haptic: "medium" });
      expect(pointerSurface().props["data-drag-state"]).toBe("picked-up");
      expect(pointerSurface().props.style.transform).toContain("translate3d(10px, -2px, 0)");
      expect(pointerSurface().props.style.WebkitUserSelect).toBe("none");
      expect(pointerSurface().props.style.WebkitTouchCallout).toBe("none");

      act(() => {
        pointerSurface().props.onPointerMove({
          clientY: 390,
          currentTarget,
          pointerId: 2,
          preventDefault: jest.fn(),
          target: { closest: jest.fn(() => null) }
        });
        jest.advanceTimersByTime(96);
      });
      expect(scrollElement.scrollTop).toBeGreaterThan(0);

      act(() => {
        pointerSurface().props.onPointerCancel({
          currentTarget,
          pointerId: 2
        });
      });
      const scrollTopAfterCancel = scrollElement.scrollTop;
      act(() => {
        jest.advanceTimersByTime(96);
      });
      expect(scrollElement.scrollTop).toBe(scrollTopAfterCancel);
      expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);
    } finally {
      platform.OS = previousPlatform;
    }
  });

  it("renders removal confirmation directly below the selected Run card", () => {
    const renderer = renderScreen({
      runManagementPresentation: runManagementPresentation({
        homeEditing: true,
        removeCandidateId: "standard"
      })
    });
    const runList = findByTestId(renderer, "practice-run-list");
    const testIDs = collectTestIds(runList);

    expect(runList.findByProps({ testID: "practice-run-remove-confirmation" })).toBeTruthy();
    expect(testIDs.indexOf("practice-run-standard")).toBeLessThan(
      testIDs.indexOf("practice-run-remove-confirmation")
    );
    expect(testIDs.indexOf("practice-run-remove-confirmation")).toBeLessThan(
      testIDs.indexOf("practice-run-tactics-focus")
    );
  });

  it("renders the New Run validation and rating editing contract", () => {
    const onIntent = jest.fn();
    const renderer = renderScreen({
      runManagementPresentation: runManagementPresentation({
        draft: {
          name: "",
          kind: "custom",
          mode: "custom",
          elo: 900,
          durationSeconds: 300,
          perPuzzleSeconds: 20,
          puzzleTiming: { slowAfterSeconds: 40, timeoutAfterSeconds: 60 },
          themes: ["fork", "pin"]
        },
        nameError: "Enter a name for this run.",
        onIntent,
        screen: "create"
      })
    });

    expect(collectText(findByTestId(renderer, "practice-run-name-error"))).toBe("Enter a name for this run.");
    expect(collectText(findByTestId(renderer, "practice-run-elo-row"))).toContain("Starting rating");
    expect(collectText(findByTestId(renderer, "practice-run-elo-row"))).toContain(
      "Sets initial puzzle difficulty · minimum 600"
    );

    act(() => {
      findByTestId(renderer, "practice-run-name-input").props.onChangeText("Calculation Lab");
    });
    press(renderer, "practice-run-elo-increase");
    press(renderer, "practice-run-save");

    expect(onIntent.mock.calls.map(([intent]) => intent)).toEqual([
      { type: "change-name", name: "Calculation Lab" },
      { type: "change-elo", elo: 925 },
      { type: "save-run" }
    ]);
  });

  it("renders the injected grouped theme catalog after expanding New Run themes", () => {
    const onIntent = jest.fn();
    const renderer = renderScreen({
      runManagementPresentation: runManagementPresentation({
        draft: {
          name: "",
          kind: "custom",
          mode: "custom",
          elo: 900,
          durationSeconds: 300,
          perPuzzleSeconds: 20,
          puzzleTiming: { slowAfterSeconds: 40, timeoutAfterSeconds: 60 },
          themes: ["mixed"]
        },
        onIntent,
        screen: "create"
      }),
      themeCatalogPresentation: {
        groups: [
          { label: "Checkmates", themes: ["mateIn4"] },
          { label: "Piece tactics", themes: ["fork"] }
        ]
      }
    });

    expect(collectText(findByTestId(renderer, "practice-run-theme-selection-detail"))).toBe(
      "All themes"
    );
    expect(findByTestId(renderer, "practice-run-theme-catalog-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });

    press(renderer, "practice-run-theme-disclosure");

    expect(themeSelected(renderer, "mixed")).toBe(true);
    expect(findByTestId(renderer, "custom-theme-mate-in-4")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-run-editor")).match(/Themes/g)).toHaveLength(1);

    press(renderer, "custom-theme-mate-in-4");
    expect(onIntent).toHaveBeenLastCalledWith({ type: "toggle-theme", theme: "mateIn4" });
  });

  it("keeps the full curated theme catalog when New Run opens from the Home story", async () => {
    const renderer = renderLabScenario("practice-home");
    await flushMicrotasks();

    press(renderer, "practice-add-run");

    expect(findByTestId(renderer, "practice-run-theme-catalog-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });
    press(renderer, "practice-run-theme-disclosure");

    const themeTestIDs = new Set(
      collectTestIds(findByTestId(renderer, "practice-run-theme-row"))
        .filter((testID) => testID.startsWith("custom-theme-") && testID !== "custom-theme-mixed")
    );
    expect(themeTestIDs.size).toBe(24);
    expect(themeTestIDs).toContain("custom-theme-capturing-defender");
    expect(themeTestIDs).toContain("custom-theme-zugzwang");
  });

  it("keeps How Sprint works available on the ordinary Practice Home story", () => {
    const renderer = renderLabScenario("practice-home");

    expect(findByTestId(renderer, "training-focus-section")).toBeTruthy();
    expect(() => findByTestId(renderer, "practice-sprint-rules-guide")).toThrow();
    expect(collectText(findByTestId(renderer, "practice-sprint-rules-open"))).toContain(
      "How Sprint works"
    );

    press(renderer, "practice-sprint-rules-open");
    expect(findByTestId(renderer, "practice-sprint-rules-guide")).toBeTruthy();
  });

  it("contains the Tactical Profile entry behind its optional design presentation", () => {
    const onIntent = jest.fn();
    const presentation: TacticalProfilePresentation = {
      phase: "ready",
      assurance: "validated",
      screen: "home",
      signals: [
        {
          id: "fork",
          taskFamily: "line",
          themeKey: "fork",
          themeLabel: "Forks",
          kind: "solve_rate",
          distinctPuzzleCount: 7,
          distinctSessionCount: 3,
          priorityLabel: "Recommended",
          status: "recommended"
        }
      ],
      focusedRun: {
        taskFamily: "line",
        title: "Fork repair",
        ratingLabel: "Puzzle-solving Rating 925",
        durationLabel: "5 min",
        totalPuzzleCount: 15,
        allocations: [
          { id: "fork", label: "Forks", puzzleCount: 10, tone: "primary" },
          { id: "mixed", label: "Mixed practice", puzzleCount: 5, tone: "mixed" }
        ]
      },
      onIntent
    };
    const renderer = renderScreen({
      runManagementEnabled: true,
      tacticalProfilePresentation: presentation
    });

    expect(collectText(findByTestId(renderer, "training-focus-card"))).toContain(
      "Forks may need attention"
    );
    press(renderer, "training-focus-open-profile");
    expect(onIntent).toHaveBeenCalledWith({ type: "open-profile" });
  });

  it("does not show provisional disclosure on validated profile detail screens", () => {
    const presentation: TacticalProfilePresentation = {
      phase: "ready",
      assurance: "validated",
      screen: "explanation",
      selectedSignalId: "fork",
      signals: [
        {
          id: "fork",
          taskFamily: "line",
          themeKey: "fork",
          themeLabel: "Forks",
          kind: "solve_rate",
          distinctPuzzleCount: 7,
          distinctSessionCount: 3,
          priorityLabel: "Recommended",
          status: "recommended"
        }
      ],
      focusedRun: {
        taskFamily: "line",
        title: "Fork repair",
        ratingLabel: "Puzzle-solving Rating 925",
        durationLabel: "5 min",
        totalPuzzleCount: 15,
        allocations: [
          { id: "fork", label: "Forks", puzzleCount: 10, tone: "primary" },
          { id: "mixed", label: "Mixed practice", puzzleCount: 5, tone: "mixed" }
        ]
      },
      onIntent: jest.fn()
    };

    for (const screen of ["explanation", "focused_run", "suppressed"] as const) {
      const renderer = renderScreen({
        runManagementEnabled: true,
        tacticalProfilePresentation: { ...presentation, screen }
      });
      expect(() =>
        findByTestId(renderer, "tactical-profile-early-estimate")
      ).toThrow();
    }
  });

  it("labels the production Tactical Profile as an early estimate", async () => {
    const renderer = renderScreen({
      practiceService: createMobilePracticeService("familiar15")
    });
    await flushMicrotasks();

    expect(collectText(findByTestId(renderer, "training-focus-card"))).toContain(
      "Early estimate"
    );
    expect(
      findByTestId(renderer, "training-focus-card").props.accessibilityLabel
    ).toContain("Early estimate");
    expect(collectText(findByTestId(renderer, "training-focus-card"))).not.toContain(
      "Personalized training is not enabled"
    );
    press(renderer, "training-focus-open-profile");
    expect(collectText(findByTestId(renderer, "tactical-profile-screen"))).toContain(
      "This is an early estimate"
    );
  });

  it("presents provisional balanced results clearly while retaining the early estimate", () => {
    const renderer = renderLabScenario("practice-tactical-profile-balanced");

    const card = collectText(findByTestId(renderer, "training-focus-card"));
    expect(card).toContain("Balanced");
    expect(card).toContain("Recent play looks balanced");
    expect(card).toContain("Early estimate");
    press(renderer, "training-focus-open-profile");
    const profile = collectText(findByTestId(renderer, "tactical-profile-screen"));
    expect(profile).toContain("Recent play looks balanced");
    expect(profile).toContain(
      "Your recent completed puzzles look balanced after accounting for difficulty and Run settings."
    );
    expect(profile).toContain("This is an early estimate");
  });

  it("keeps Practice available and automatically retries a failed Tactical Profile cache", async () => {
    const store = new MemoryStore();
    const repository = new RecoveringTacticalProfileRepository();
    repository.failReads(2);
    const renderer = renderScreen({
      practiceService: new PracticeService(
        store,
        new TacticalProfileService({
          progressStore: store,
          puzzleSource: store,
          repository,
          calibration: COMPONENT_TACTICAL_PROFILE_CALIBRATION,
          naturalFrequency: { line: {}, arrow_duel: {} }
        })
      )
    });
    await flushMicrotasks();

    expect(collectText(findByTestId(renderer, "training-focus-card"))).toContain(
      "Building profile"
    );
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(1_000);
      await Promise.resolve();
    });
    expect(collectText(findByTestId(renderer, "training-focus-card"))).toContain(
      "Building profile"
    );

    await act(async () => {
      jest.advanceTimersByTime(2_000);
      await Promise.resolve();
    });
    expect(collectText(findByTestId(renderer, "training-focus-card"))).toContain(
      "More information needed"
    );
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
  });

  it("uses the only recommended Arrow Duel family and shows returning users the dedicated Focused Run guide", () => {
    jest.setSystemTime(new Date("2026-07-25T00:00:00.000Z"));
    const service = createArrowFocusedPracticeService();
    service.saveSettings({
      ...service.getSettings(),
      sprintGuides: {
        rulesSeen: true,
        activeSessionSeen: true,
        arrowDuelSeen: false,
        focusedRunSeen: false
      }
    });

    const renderer = renderScreen({
      practiceService: service,
      runManagementEnabled: true,
      sprintGuidanceEnabled: true
    });

    press(renderer, "training-focus-open-profile");
    expect(collectText(findByTestId(renderer, "tactical-profile-active-mode"))).toContain(
      "Arrow Duel"
    );
    press(renderer, "tactical-profile-preview-run");
    expect(collectText(findByTestId(renderer, "focused-run-preview"))).toContain(
      "Arrow Duel Rating 1800"
    );
    press(renderer, "focused-run-start");
    expect(findByTestId(renderer, "practice-active-session-guide")).toBeTruthy();
    expectText(renderer, "Track the fixed Run");
    expect(service.getSettings().sprintGuides.focusedRunSeen).toBe(false);

    for (let step = 0; step < 4; step += 1) {
      press(renderer, "practice-session-guide-start");
    }

    expect(service.getSettings().sprintGuides.focusedRunSeen).toBe(true);
    expect(service.getActiveSprint()).toBeUndefined();
    expect(findByTestId(renderer, "practice-arrow-duel-guide")).toBeTruthy();
    expect(service.getSettings().sprintGuides.arrowDuelSeen).toBe(false);

    press(renderer, "practice-session-guide-start");
    expect(service.getSettings().sprintGuides.arrowDuelSeen).toBe(false);
    expect(collectText(findByTestId(renderer, "practice-session-guide-coach-progress"))).toBe(
      "6 of 6"
    );
    press(renderer, "practice-session-guide-start");
    expect(service.getSettings().sprintGuides.arrowDuelSeen).toBe(true);
    expect(service.getActiveSprint()).toBeUndefined();
    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(service.getActiveSprint()).toMatchObject({
      status: "active",
      config: {
        mode: "arrow_duel",
        ratingPolicy: "unrated",
        maxAttempts: 15,
        tacticalFocus: {
          taskFamily: "arrow_duel",
          mixedControlCount: 5,
          ratingAnchor: 1800
        }
      }
    });
  });

  it("maps two production task-family recommendations to one explicit Home lead", () => {
    jest.setSystemTime(new Date("2026-07-25T00:00:00.000Z"));
    const practiceService = createDualFamilyFocusedPracticeService();
    expect(
      practiceService.getTacticalProfileSnapshot()?.homeLeadSignalId
    ).toBe("arrow_duel:pin");
    const renderer = renderScreen({
      practiceService
    });

    const card = collectText(findByTestId(renderer, "training-focus-card"));
    expect(card).toContain("2 modes with recommendations");
    expect(card).toContain("Pin is your clearest focus");
    expect(card).toContain("Puzzle solving also has 1 recommendation.");
    expect(collectText(findByTestId(renderer, "training-focus-primary-mode"))).toContain(
      "Arrow Duel"
    );

    press(renderer, "training-focus-open-profile");
    expect(collectText(findByTestId(renderer, "tactical-profile-active-mode"))).toContain(
      "Arrow Duel"
    );
    expect(
      findByTestId(renderer, "tactical-profile-signal-arrow_duel:pin")
    ).toBeTruthy();
    expect(() => findByTestId(renderer, "tactical-profile-signal-line:fork")).toThrow();

    press(renderer, "tactical-profile-task-family-line");
    press(renderer, "tactical-profile-explain-line:fork");
    press(renderer, "tactical-profile-back");
    expect(collectText(findByTestId(renderer, "tactical-profile-active-mode"))).toContain(
      "Puzzle solving"
    );
  });

  it("keeps watch-only evidence visible in both task-family lanes", () => {
    jest.setSystemTime(new Date("2026-07-25T00:00:00.000Z"));
    const watchOnlyCalibration = {
      ...COMPONENT_TACTICAL_PROFILE_CALIBRATION,
      evidence: {
        ...COMPONENT_TACTICAL_PROFILE_CALIBRATION.evidence,
        minDistinctPuzzles: 13
      }
    } satisfies TacticalProfileCalibrationArtifact;
    const practiceService = createDualFamilyFocusedPracticeService(
      watchOnlyCalibration
    );
    expect(
      practiceService.getTacticalProfileSnapshot()?.evaluation.signals.map(
        (signal) => signal.status
      )
    ).toEqual(["watch", "watch"]);

    const renderer = renderScreen({ practiceService });
    press(renderer, "training-focus-open-profile");

    expect(findByTestId(renderer, "tactical-profile-task-family-selector")).toBeTruthy();
    expect(findByTestId(renderer, "tactical-profile-signal-line:fork")).toBeTruthy();
    press(renderer, "tactical-profile-task-family-arrow_duel");
    expect(
      findByTestId(renderer, "tactical-profile-signal-arrow_duel:pin")
    ).toBeTruthy();
  });

  it("keeps an explicitly selected watch lane visible beside a recommendation", () => {
    jest.setSystemTime(new Date("2026-07-25T00:00:00.000Z"));
    const mixedStatusCalibration = {
      ...COMPONENT_TACTICAL_PROFILE_CALIBRATION,
      evidence: {
        ...COMPONENT_TACTICAL_PROFILE_CALIBRATION.evidence,
        minDistinctPuzzles: 9
      }
    } satisfies TacticalProfileCalibrationArtifact;
    const practiceService = createDualFamilyFocusedPracticeService(
      mixedStatusCalibration,
      2
    );
    expect(
      practiceService.getTacticalProfileSnapshot()?.evaluation.signals.map(
        (signal) => [signal.taskFamily, signal.status]
      )
    ).toEqual([
      ["line", "recommended"],
      ["arrow_duel", "watch"]
    ]);

    const renderer = renderScreen({ practiceService });
    press(renderer, "training-focus-open-profile");
    expect(findByTestId(renderer, "tactical-profile-signal-line:fork")).toBeTruthy();

    press(renderer, "tactical-profile-task-family-arrow_duel");
    expect(
      findByTestId(renderer, "tactical-profile-signal-arrow_duel:pin")
    ).toBeTruthy();
  });

  it("opens a cached production Tactical Profile without reading full history or exact inventory", () => {
    jest.setSystemTime(new Date("2026-07-25T00:00:00.000Z"));
    let store: MemoryStore | undefined;
    const practiceService = createArrowFocusedPracticeService(
      true,
      (createdStore) => {
        store = createdStore;
      }
    );
    practiceService.getTacticalProfileSnapshot();
    if (!store) {
      throw new Error("expected the production component store");
    }
    store.listSprintSessions = () => {
      throw new Error("Profile open must not scan all sessions");
    };
    store.listLatestTerminalFocusedSprintSessions = () => {
      throw new Error("Profile open must not run cache-recovery session queries");
    };
    store.listAttempts = () => {
      throw new Error("Profile open must not scan canonical attempts");
    };
    store.selectPuzzles = () => {
      throw new Error("Profile open must not run an exact puzzle query");
    };
    store.selectPuzzlesForRatingBands = () => {
      throw new Error("Profile open must not run an exact rating-band query");
    };
    const originalListReviewQueue = store.listReviewQueue.bind(store);
    let reviewExclusionReads = 0;
    store.listReviewQueue = () => {
      reviewExclusionReads += 1;
      return originalListReviewQueue();
    };
    const renderer = renderScreen({ practiceService });
    reviewExclusionReads = 0;

    press(renderer, "training-focus-open-profile");

    expect(
      findByTestId(renderer, "tactical-profile-signal-arrow_duel:pin")
    ).toBeTruthy();
    expect(findByTestId(renderer, "tactical-profile-preview-run")).toBeTruthy();
    expect(reviewExclusionReads).toBe(0);
  });

  it("withholds the public Preview CTA after a Focused Run until newer mixed evidence", () => {
    jest.setSystemTime(new Date("2026-07-25T00:00:00.000Z"));
    let store: MemoryStore | undefined;
    const practiceService = createArrowFocusedPracticeService(
      true,
      (createdStore) => {
        store = createdStore;
      }
    );
    practiceService.startFocusedRun(
      "arrow_duel",
      "2026-07-25T00:01:00.000Z",
      "public-freshness"
    );
    practiceService.abandonSprint("2026-07-25T00:02:00.000Z");
    if (!store) {
      throw new Error("expected the production component store");
    }
    const restartedPracticeService = new PracticeService(
      store,
      createArrowTacticalProfileService(store)
    );
    const renderer = renderScreen({
      practiceService: restartedPracticeService
    });

    press(renderer, "training-focus-open-profile");

    expect(collectText(findByTestId(renderer, "focused-run-unavailable"))).toContain(
      "Play another mixed Run first"
    );
    expect(() => findByTestId(renderer, "tactical-profile-preview-run")).toThrow();
  });

  it("keeps a production-service focus visible while withholding an inventory-blocked Run", () => {
    jest.setSystemTime(new Date("2026-07-25T00:00:00.000Z"));
    const renderer = renderScreen({
      practiceService: createArrowFocusedPracticeService(false)
    });

    press(renderer, "training-focus-open-profile");

    expect(
      findByTestId(renderer, "tactical-profile-signal-arrow_duel:pin")
    ).toBeTruthy();
    expect(collectText(findByTestId(renderer, "tactical-profile-screen"))).toContain(
      "Not enough new puzzles nearby"
    );
    expect(() => findByTestId(renderer, "tactical-profile-preview-run")).toThrow();
  });

  it("keeps solve reliability and completed-puzzle speed as plain-language profile signals", () => {
    const solveRate = renderLabScenario("practice-tactical-profile-solve-rate");
    const speed = renderLabScenario("practice-tactical-profile-speed");

    expect(collectText(findByTestId(solveRate, "tactical-profile-signal-fork"))).toContain(
      "You complete these less reliably than comparable puzzles."
    );
    expect(collectText(findByTestId(speed, "tactical-profile-signal-pin-speed"))).toContain(
      "You solve these correctly, but more slowly than comparable puzzles."
    );
    expect(collectText(findByTestId(solveRate, "tactical-profile-screen"))).not.toContain("%");
    expect(collectText(findByTestId(speed, "tactical-profile-screen"))).not.toContain("%");
  });

  it("keeps one-off mistakes inside the shared collecting-evidence state", () => {
    const renderer = renderLabScenario("practice-tactical-profile-collecting");

    expect(collectText(findByTestId(renderer, "training-focus-card"))).toContain(
      "More information needed"
    );
    expect(collectText(findByTestId(renderer, "training-focus-card"))).not.toContain(
      "One miss"
    );
    press(renderer, "training-focus-open-profile");
    expect(collectText(findByTestId(renderer, "tactical-profile-screen"))).toContain(
      "We need results from more different puzzles and sessions"
    );
    expect(() => findByTestId(renderer, "tactical-profile-preview-run")).toThrow();
  });

  it("summarizes several focuses on Home and caps the full profile at three", () => {
    const renderer = renderLabScenario("practice-tactical-profile-ranked");

    expect(collectText(findByTestId(renderer, "training-focus-card"))).toContain(
      "4 recommendations"
    );
    expect(collectText(findByTestId(renderer, "training-focus-card"))).toContain(
      "Forks is your clearest focus"
    );
    expect(collectText(findByTestId(renderer, "training-focus-card"))).toContain(
      "There are 3 more themes worth reviewing."
    );

    press(renderer, "training-focus-open-profile");

    expect(findByTestId(renderer, "tactical-profile-signal-fork")).toBeTruthy();
    expect(findByTestId(renderer, "tactical-profile-signal-pin-speed")).toBeTruthy();
    expect(findByTestId(renderer, "tactical-profile-signal-deflection")).toBeTruthy();
    expect(() => findByTestId(renderer, "tactical-profile-signal-back-rank")).toThrow();
    expect(collectText(findByTestId(renderer, "tactical-profile-more-signals"))).toContain(
      "1 more pattern is being monitored"
    );
  });

  it("keeps Puzzle solving and Arrow Duel focus lanes separate inside one profile", async () => {
    const renderer = renderLabScenario("practice-tactical-profile-task-families-home");

    expect(collectText(findByTestId(renderer, "training-focus-card"))).toContain(
      "2 modes with recommendations"
    );
    expect(collectText(findByTestId(renderer, "training-focus-card"))).toContain(
      "Arrow Duel also has 2 recommendations."
    );
    expect(collectText(findByTestId(renderer, "training-focus-primary-mode"))).toContain(
      "Puzzle solving"
    );

    press(renderer, "training-focus-open-profile");
    expect(findByTestId(renderer, "tactical-profile-task-family-selector")).toBeTruthy();
    expect(findByTestId(renderer, "tactical-profile-signal-fork")).toBeTruthy();
    expect(() => findByTestId(renderer, "tactical-profile-signal-arrow-pin")).toThrow();

    press(renderer, "tactical-profile-task-family-arrow_duel");

    expect(
      findByTestId(renderer, "tactical-profile-task-family-arrow_duel").props.accessibilityState
    ).toEqual({ selected: true });
    expect(collectText(findByTestId(renderer, "tactical-profile-active-mode"))).toContain(
      "Arrow Duel"
    );
    expect(findByTestId(renderer, "tactical-profile-signal-arrow-pin")).toBeTruthy();
    expect(findByTestId(renderer, "tactical-profile-signal-arrow-deflection-speed")).toBeTruthy();
    expect(() => findByTestId(renderer, "tactical-profile-signal-fork")).toThrow();

    press(renderer, "tactical-profile-preview-run");
    expect(collectText(findByTestId(renderer, "focused-run-preview"))).toContain(
      "Arrow Duel Rating 875"
    );
    expect(collectText(findByTestId(renderer, "focused-run-preview"))).toContain(
      "Mixed Arrow Duel"
    );

    press(renderer, "focused-run-start");
    expect(findByTestId(renderer, "active-session-shell")).toBeTruthy();
    expect(findByTestId(renderer, "session-rating-policy")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "arrow-duel-reply-challenge"))).toContain(
      "Choose the best move"
    );
    expect(findByTestId(renderer, "practice-announcement").props.accessibilityLabel).toContain(
      "Arrow Duel sprint"
    );
    expect(collectText(findByTestId(renderer, "session-progress"))).toBe("0 / 15");

    await boardMove(renderer, "e8f7");
    await settleArrowDuelReplyHandoff();
    const expectedReply = collectText(
      findByTestId(renderer, "arrow-duel-reply-expected-move")
    );
    await boardMove(renderer, expectedReply);

    expect(() => findByTestId(renderer, "error-panel")).toThrow();
    expect(collectText(findByTestId(renderer, "session-progress"))).toBe("1 / 15");
  });

  it("uses an explicit cross-mode Home lead and blocks mismatched Focused Runs", () => {
    const onIntent = jest.fn();
    const lineSignal: TacticalProfilePresentation["signals"][number] = {
      id: "line-fork",
      taskFamily: "line",
      themeKey: "fork",
      themeLabel: "Forks",
      kind: "solve_rate",
      distinctPuzzleCount: 7,
      distinctSessionCount: 3,
      priorityLabel: "Recommended",
      status: "recommended"
    };
    const arrowSignal: TacticalProfilePresentation["signals"][number] = {
      id: "arrow-pin",
      taskFamily: "arrow_duel",
      themeKey: "pin",
      themeLabel: "Pins",
      kind: "solve_rate",
      distinctPuzzleCount: 8,
      distinctSessionCount: 3,
      priorityLabel: "Recommended",
      status: "recommended"
    };
    const arrowRun: NonNullable<TacticalProfilePresentation["focusedRun"]> = {
      taskFamily: "arrow_duel",
      title: "Arrow Duel focus",
      ratingLabel: "Arrow Duel Rating 875",
      durationLabel: "5 min",
      totalPuzzleCount: 15,
      allocations: [
        { id: "arrow-pin", label: "Pins", puzzleCount: 10, tone: "primary" },
        { id: "arrow-mixed", label: "Mixed Arrow Duel", puzzleCount: 5, tone: "mixed" }
      ]
    };
    const presentation: TacticalProfilePresentation = {
      phase: "ready",
      screen: "home",
      activeTaskFamily: "line",
      homeLeadSignalId: lineSignal.id,
      signals: [arrowSignal, lineSignal],
      focusedRun: arrowRun,
      onIntent
    };

    const home = renderScreen({
      runManagementEnabled: true,
      tacticalProfilePresentation: presentation
    });
    expect(collectText(findByTestId(home, "training-focus-primary-mode"))).toContain(
      "Puzzle solving"
    );
    expect(collectText(findByTestId(home, "training-focus-card"))).toContain(
      "Forks is your clearest focus"
    );

    const explanation = renderScreen({
      runManagementEnabled: true,
      tacticalProfilePresentation: {
        ...presentation,
        screen: "explanation",
        selectedSignalId: lineSignal.id
      }
    });
    expect(findByTestId(explanation, "tactical-profile-explanation")).toBeTruthy();
    expect(() => findByTestId(explanation, "tactical-profile-explanation-preview")).toThrow();

    const preview = renderScreen({
      runManagementEnabled: true,
      tacticalProfilePresentation: {
        ...presentation,
        screen: "focused_run"
      }
    });
    expect(() => findByTestId(preview, "focused-run-preview")).toThrow();
    expect(findByTestId(preview, "tactical-profile-screen")).toBeTruthy();
  });

  it("keeps a credible low-inventory focus but withholds the unsafe Run CTA", () => {
    const renderer = renderLabScenario("practice-tactical-profile-limited-inventory");

    expect(collectText(findByTestId(renderer, "focused-run-unavailable"))).toContain(
      "Not enough new puzzles nearby"
    );
    expect(collectText(findByTestId(renderer, "focused-run-unavailable"))).toContain(
      "current Rating"
    );
    expect(() => findByTestId(renderer, "tactical-profile-preview-run")).toThrow();
  });

  it("walks explanation, quota preview, decline, and restore through public Tactical Profile actions", () => {
    const renderer = renderLabScenario("practice-tactical-profile-ranked");

    press(renderer, "training-focus-open-profile");
    press(renderer, "tactical-profile-explain-fork");
    expect(collectText(findByTestId(renderer, "tactical-profile-explanation"))).toContain(
      "Slow and Unclear labels, or whether a puzzle is in Review, do not count as proof"
    );
    expect(collectText(findByTestId(renderer, "tactical-profile-early-estimate"))).toContain(
      "Use this as a training suggestion"
    );

    press(renderer, "tactical-profile-explanation-preview");
    expect(collectText(findByTestId(renderer, "focused-run-preview"))).toContain(
      "Only the two clearest focuses can enter one Run."
    );
    expect(collectText(findByTestId(renderer, "focused-run-preview"))).toContain(
      "Mixed practice"
    );
    expect(collectText(findByTestId(renderer, "focused-run-preview"))).toContain(
      "Rebuilt for your current Rating before each new Run"
    );
    expect(collectText(findByTestId(renderer, "focused-run-preview"))).toContain(
      "Later ordinary mixed Runs decide whether this focus still applies."
    );
    expect(collectText(findByTestId(renderer, "tactical-profile-early-estimate"))).toContain(
      "Use this as a training suggestion"
    );

    press(renderer, "focused-run-not-now");
    expect(findByTestId(renderer, "tactical-profile-suppressed")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "tactical-profile-early-estimate"))).toContain(
      "Use this as a training suggestion"
    );

    press(renderer, "tactical-profile-restore");
    expect(findByTestId(renderer, "tactical-profile-recommendations")).toBeTruthy();
  });

  it("teaches first-use Sprint rules and retains a rediscovery entry after dismissal", () => {
    const renderer = renderLabScenario("practice-first-sprint-guide");

    expect(collectText(findByTestId(renderer, "practice-sprint-rules-guide"))).toContain(
      "Solve 15 puzzles to pass"
    );
    expect(() => findByTestId(renderer, "practice-sprint-rule-puzzles-to-pass")).toThrow();
    expect(collectText(findByTestId(renderer, "practice-sprint-rules-guide"))).toContain(
      "Example: 15 solved + 1 mistake = 16 attempted."
    );
    expect(collectText(findByTestId(renderer, "practice-sprint-rules-guide"))).toContain(
      "Mistake limit"
    );
    expect(collectText(findByTestId(renderer, "practice-sprint-rules-guide"))).toContain(
      "The third mistake ends the Sprint."
    );
    expect(collectText(findByTestId(renderer, "practice-sprint-rules-guide"))).toContain(
      "At zero, the active puzzle is saved as Incomplete, not as a mistake, and needs attention. If it is Slow, it is also marked Unclear."
    );
    expect(collectText(findByTestId(renderer, "practice-sprint-rules-guide"))).toContain(
      "The puzzle timer turns amber when you are taking too long. If you solve after that, it is marked Unclear for another look, not as a mistake."
    );
    expect(collectText(findByTestId(renderer, "practice-sprint-rules-guide"))).toContain(
      "When the puzzle timer runs out, it counts as a mistake, is added to Review, and the Sprint moves on. Mistakes are not marked Unclear."
    );
    expect(findByTestId(renderer, "practice-sprint-rules-guide").props.accessibilityLabel).toContain(
      "Mistake limit: The third mistake ends the Sprint."
    );
    expect(findByTestId(renderer, "practice-sprint-rules-guide").props.accessibilityLabel).toContain(
      "Time limit: Finish the goal before the Sprint clock reaches zero. At zero, the active puzzle is saved as Incomplete"
    );
    expect(findByTestId(renderer, "practice-sprint-rules-guide").props.accessibilityLabel).toContain(
      "Slow warning: The puzzle timer turns amber when you are taking too long."
    );
    expect(findByTestId(renderer, "practice-sprint-rules-guide").props.accessibilityLabel).toContain(
      "Puzzle timeout: When the puzzle timer runs out, it counts as a mistake"
    );

    press(renderer, "practice-sprint-rules-dismiss");
    expect(() => findByTestId(renderer, "practice-sprint-rules-guide")).toThrow();
    expect(collectText(findByTestId(renderer, "practice-sprint-rules-open"))).toContain(
      "How Sprint works"
    );

    press(renderer, "practice-sprint-rules-open");
    expect(findByTestId(renderer, "practice-sprint-rules-guide")).toBeTruthy();
  });

  it("keeps every supporting first-use Sprint rule available in maintained viewports", () => {
    const viewports = [
      {
        height: 874,
        insets: { top: 62, right: 0, bottom: 34, left: 0 },
        width: 402
      },
      {
        height: 402,
        insets: { top: 0, right: 62, bottom: 21, left: 62 },
        width: 874
      }
    ];
    const ruleIds = [
      "time-limit",
      "mistake-limit",
      "slow-warning",
      "puzzle-timeout"
    ];

    for (const viewport of viewports) {
      setPracticeViewport({ ...viewport, scale: 3 });
      const renderer = renderLabScenario("practice-first-sprint-guide");
      for (const ruleId of ruleIds) {
        expect(findByTestId(renderer, `practice-sprint-rule-${ruleId}-badge`)).toBeTruthy();
        expect(flattenTestStyle(
          findByTestId(renderer, `practice-sprint-rule-${ruleId}`).props.style
        ).alignItems).toBe("flex-start");
        expect(collectText(
          findByTestId(renderer, `practice-sprint-rule-${ruleId}-copy`)
        ).length).toBeGreaterThan(0);
      }
    }
  });

  it("lets the TIMEOUT badge expand for Android large text without changing its baseline width", () => {
    setPracticeViewport({
      fontScale: 1.5,
      height: 914,
      insets: { top: 32, right: 0, bottom: 24, left: 0 },
      scale: 2.625,
      width: 412
    });
    const renderer = renderLabScenario("practice-first-sprint-guide");
    const badge = findByTestId(renderer, "practice-sprint-rule-puzzle-timeout-badge");
    const badgeStyle = flattenTestStyle(badge.props.style);
    const badgeText = badge.findByType(ReactNative.Text);

    expect(collectText(badge)).toBe("TIMEOUT");
    expect(badgeStyle.minWidth).toBe(72);
    expect(badgeStyle.width).toBeUndefined();
    expect(badgeText.props.numberOfLines).toBe(1);
  });

  it("uses the selected saved Run to calculate the first Sprint pass target", () => {
    const renderer = renderScreen({
      runManagementEnabled: true,
      runManagementPresentation: runManagementPresentation({
        selectedRunId: "tactics-focus"
      }),
      sprintGuidanceEnabled: true
    });

    expect(collectText(findByTestId(renderer, "practice-sprint-rules-guide"))).toContain(
      "Solve 20 puzzles to pass"
    );
  });

  it("persists the production rules and shared Active Session guides before starting the real timer", () => {
    const service = createMobilePracticeService("random1000");
    const renderer = renderScreen({
      sprintGuidanceEnabled: true,
      practiceService: service,
      runManagementEnabled: true
    });

    expect(findByTestId(renderer, "practice-sprint-rules-guide")).toBeTruthy();
    press(renderer, "practice-sprint-rules-dismiss");
    expect(service.getSettings().sprintGuides.rulesSeen).toBe(true);

    press(renderer, "practice-run-start");
    expect(findByTestId(renderer, "practice-active-session-guide")).toBeTruthy();
    expect(service.getActiveSprint()).toBeUndefined();
    expect(() => findByTestId(renderer, "session-board")).toThrow();

    for (let step = 0; step < 4; step += 1) {
      press(renderer, "practice-session-guide-start");
    }

    expect(service.getSettings().sprintGuides.activeSessionSeen).toBe(true);
    expect(service.getActiveSprint()?.status).toBe("active");
    expect(findByTestId(renderer, "session-board")).toBeTruthy();

    act(() => renderer.unmount());
    const relaunched = renderScreen({
      sprintGuidanceEnabled: true,
      practiceService: service,
      runManagementEnabled: true
    });
    expect(() => findByTestId(relaunched, "practice-sprint-rules-guide")).toThrow();
  });

  it("lets Android Back leave first-session guidance without starting or completing it", () => {
    const service = createMobilePracticeService("random1000");
    const systemBack = createTestSystemBackSource("android");
    const renderer = renderScreen({
      sprintGuidanceEnabled: true,
      practiceService: service,
      runManagementEnabled: true,
      systemBack
    });

    press(renderer, "practice-run-start");
    expect(findByTestId(renderer, "practice-active-session-guide")).toBeTruthy();

    expect(systemBack.invoke()).toBe(true);
    expect(() => findByTestId(renderer, "practice-active-session-guide")).toThrow();
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
    expect(service.getActiveSprint()).toBeUndefined();
    expect(service.getSettings().sprintGuides.activeSessionSeen).toBe(false);
  });

  it("keeps the guide close control available without starting or completing the guide", () => {
    for (let coachStep = 0; coachStep < 4; coachStep += 1) {
      const service = createMobilePracticeService("random1000");
      const renderer = renderScreen({
        sprintGuidanceEnabled: true,
        practiceService: service,
        runManagementEnabled: true
      });

      press(renderer, "practice-run-start");
      for (let step = 0; step < coachStep; step += 1) {
        press(renderer, "practice-session-guide-start");
      }

      expect(findByTestId(renderer, "session-abandon").props.accessibilityLabel).toBe(
        "Exit guide"
      );
      press(renderer, "session-abandon");

      expect(() => findByTestId(renderer, "practice-active-session-guide")).toThrow();
      expect(findByTestId(renderer, "practice-home")).toBeTruthy();
      expect(service.getActiveSprint()).toBeUndefined();
      expect(service.getSettings().sprintGuides.activeSessionSeen).toBe(false);

      press(renderer, "practice-run-start");
      expect(findByTestId(renderer, "practice-active-session-guide")).toBeTruthy();
      expect(service.getSettings().sprintGuides.activeSessionSeen).toBe(false);

      act(() => renderer.unmount());
    }
  });

  it("shows both guides for a first Arrow Duel, then only its own guide after shared guidance", () => {
    const freshService = createMobilePracticeService("random1000");
    const firstArrowDuel = renderScreen({
      sprintGuidanceEnabled: true,
      practiceService: freshService,
      runManagementEnabled: true
    });

    press(firstArrowDuel, "practice-run-select-arrow-duel");
    press(firstArrowDuel, "practice-run-start");
    expect(findByTestId(firstArrowDuel, "practice-active-session-guide")).toBeTruthy();
    expect(collectText(findByTestId(firstArrowDuel, "practice-session-guide-coach-progress"))).toBe("1 of 6");
    expect(freshService.getActiveSprint()).toBeUndefined();

    for (let step = 0; step < 4; step += 1) {
      press(firstArrowDuel, "practice-session-guide-start");
    }
    expect(findByTestId(firstArrowDuel, "practice-arrow-duel-guide")).toBeTruthy();
    expect(collectText(findByTestId(firstArrowDuel, "practice-session-guide-coach-progress"))).toBe("5 of 6");
    expect(freshService.getSettings().sprintGuides.activeSessionSeen).toBe(true);
    expect(freshService.getSettings().sprintGuides.arrowDuelSeen).toBe(false);

    press(firstArrowDuel, "practice-session-guide-start");
    expect(collectText(findByTestId(firstArrowDuel, "practice-session-guide-coach-progress"))).toBe("6 of 6");
    expect(collectText(findByTestId(firstArrowDuel, "practice-arrow-duel-guide"))).toContain(
      "Then reply for Black"
    );
    expect(collectText(findByTestId(
      firstArrowDuel,
      "practice-session-guide-optional-settings-notice"
    ))).toBe("This extra challenge is optional — turn it off in Settings.");
    expect(freshService.getSettings().sprintGuides.arrowDuelSeen).toBe(false);

    press(firstArrowDuel, "practice-session-guide-start");
    expect(freshService.getSettings().sprintGuides.arrowDuelSeen).toBe(true);
    expect(freshService.getActiveSprint()).toBeUndefined();
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(freshService.getActiveSprint()?.status).toBe("active");

    const returningService = createMobilePracticeService("random1000");
    returningService.saveSettings({
      ...returningService.getSettings(),
      sprintGuides: {
        rulesSeen: true,
        activeSessionSeen: true,
        arrowDuelSeen: false
      }
    });
    const returningArrowDuel = renderScreen({
      sprintGuidanceEnabled: true,
      practiceService: returningService,
      runManagementEnabled: true
    });
    press(returningArrowDuel, "practice-run-select-arrow-duel");
    press(returningArrowDuel, "practice-run-start");

    expect(findByTestId(returningArrowDuel, "practice-arrow-duel-guide")).toBeTruthy();
    expect(() => findByTestId(returningArrowDuel, "practice-active-session-guide")).toThrow();
    expect(collectText(findByTestId(returningArrowDuel, "practice-session-guide-coach-progress"))).toBe("1 of 2");
  });

  it("omits the opponent-reply guide step when the global setting is off", () => {
    const service = createMobilePracticeService("random1000");
    service.saveSettings({
      ...service.getSettings(),
      arrowDuel: { opponentReplyEnabled: false },
      sprintGuides: {
        ...service.getSettings().sprintGuides,
        rulesSeen: true,
        activeSessionSeen: true,
        arrowDuelSeen: false
      }
    });
    const renderer = renderScreen({
      sprintGuidanceEnabled: true,
      practiceService: service,
      runManagementEnabled: true
    });

    press(renderer, "practice-run-select-arrow-duel");
    press(renderer, "practice-run-start");

    expect(collectText(findByTestId(
      renderer,
      "practice-session-guide-coach-progress"
    ))).toBe("1 of 1");
    expect(() => findByTestId(
      renderer,
      "practice-session-guide-optional-settings-notice"
    )).toThrow();
  });

  it("lets Arrow Duel leave either guide without completing its own guidance", () => {
    const service = createMobilePracticeService("random1000");
    const renderer = renderScreen({
      sprintGuidanceEnabled: true,
      practiceService: service,
      runManagementEnabled: true
    });

    press(renderer, "practice-run-select-arrow-duel");
    press(renderer, "practice-run-start");
    for (let step = 0; step < 4; step += 1) {
      press(renderer, "practice-session-guide-start");
    }

    expect(findByTestId(renderer, "practice-arrow-duel-guide")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-session-guide-coach-progress"))).toBe(
      "5 of 6"
    );
    expect(findByTestId(renderer, "session-abandon").props.accessibilityLabel).toBe(
      "Exit guide"
    );
    press(renderer, "session-abandon");

    expect(() => findByTestId(renderer, "practice-arrow-duel-guide")).toThrow();
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
    expect(service.getActiveSprint()).toBeUndefined();
    expect(service.getSettings().sprintGuides).toMatchObject({
      activeSessionSeen: true,
      arrowDuelSeen: false
    });

    press(renderer, "practice-run-start");
    expect(findByTestId(renderer, "practice-arrow-duel-guide")).toBeTruthy();
    expect(() => findByTestId(renderer, "practice-active-session-guide")).toThrow();
    expect(collectText(findByTestId(renderer, "practice-session-guide-coach-progress"))).toBe(
      "1 of 2"
    );
    press(renderer, "session-abandon");

    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
    expect(service.getSettings().sprintGuides.arrowDuelSeen).toBe(false);
    press(renderer, "practice-run-start");
    expect(findByTestId(renderer, "practice-arrow-duel-guide")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-session-guide-coach-progress"))).toBe(
      "1 of 2"
    );

    act(() => renderer.unmount());
  });

  it("resets all production guide eligibility immediately from Settings", () => {
    const service = createMobilePracticeService("random1000");
    service.saveSettings({
      ...service.getSettings(),
      sprintGuides: {
        rulesSeen: true,
        activeSessionSeen: true,
        arrowDuelSeen: true,
        arrowDuelReplyCueStage: 3
      }
    });
    const renderer = renderScreen({
      sprintGuidanceEnabled: true,
      initialTab: "settings",
      practiceService: service,
      runManagementEnabled: true
    });

    press(renderer, "settings-show-sprint-guide");

    expect(service.getSettings().sprintGuides).toEqual({
      rulesSeen: false,
      activeSessionSeen: false,
      arrowDuelSeen: false,
      focusedRunSeen: false,
      arrowDuelReplyCueStage: 0
    });
    expect(collectText(findByTestId(renderer, "settings-show-sprint-guide"))).toBe("Guides reset");
    expect(collectText(findByTestId(renderer, "settings-sprint-guide-ready"))).toContain(
      "replay the next time it applies"
    );
  });

  it("calibrates the frozen first-use guides to the real Sprint layout before Sprint and Arrow Duel", () => {
    const activeSession = renderLabScenario("practice-active-session-guide");
    expect(findByTestId(activeSession, "practice-active-session-guide")).toBeTruthy();
    expect(() => findByTestId(activeSession, "session-board")).toThrow();
    expect(findByTestId(activeSession, "practice-session-guide-demo-board")).toBeTruthy();
    expect(findByTestId(activeSession, "active-session-shell")).toBeTruthy();
    expect(findByTestId(activeSession, "session-status-metrics")).toBeTruthy();
    expect(findByTestId(activeSession, "practice-prompt")).toBeTruthy();
    expect(findByTestId(activeSession, "session-puzzle-timing")).toBeTruthy();
    expect(findByTestId(activeSession, "session-score-strip")).toBeTruthy();
    expect(testIdOrder(activeSession, "active-session-shell", "practice-prompt")).toBeLessThan(0);
    expect(testIdOrder(activeSession, "practice-prompt", "practice-session-guide-demo-board")).toBeLessThan(0);
    expect(testIdOrder(activeSession, "practice-session-guide-demo-board", "session-score-strip")).toBeLessThan(0);
    expect(collectText(findByTestId(activeSession, "practice-session-guide-coach-progress"))).toBe(
      "1 of 4"
    );
    expect(collectText(findByTestId(activeSession, "practice-session-guide-coach-overview"))).toContain(
      "The top row shows puzzles solved, Sprint time left, and mistakes remaining."
    );
    expect(() => findByTestId(activeSession, "practice-session-guide-coach-slow")).toThrow();
    expect(collectText(findByTestId(activeSession, "practice-session-guide-start"))).toBe("Next");

    press(activeSession, "practice-session-guide-start");
    expect(collectText(findByTestId(activeSession, "practice-session-guide-coach-progress"))).toBe(
      "2 of 4"
    );
    expect(collectText(findByTestId(activeSession, "practice-session-guide-coach-slow"))).toContain(
      "Amber means you’re taking too long"
    );
    expect(collectText(findByTestId(activeSession, "practice-session-guide-coach-slow"))).toContain(
      "Keep solving. A correct answer will be marked Unclear because you took too long, but it will not count as a mistake."
    );
    expect(collectText(findByTestId(activeSession, "practice-session-guide-demo-timer"))).toContain(
      "Puzzle 0:40"
    );

    press(activeSession, "practice-session-guide-start");
    expect(collectText(findByTestId(activeSession, "practice-session-guide-coach-progress"))).toBe(
      "3 of 4"
    );
    expect(collectText(findByTestId(activeSession, "practice-session-guide-coach-timeout"))).toContain(
      "This puzzle counts as a mistake"
    );
    expect(collectText(findByTestId(activeSession, "practice-session-guide-coach-timeout"))).toContain(
      "It is added to Review. Mistakes are not marked Unclear. The Sprint then shows the next puzzle."
    );
    expect(collectText(findByTestId(activeSession, "practice-session-guide-demo-board"))).toContain(
      "Added to Review"
    );
    expect(collectText(findByTestId(activeSession, "practice-session-guide-demo-board"))).not.toContain(
      "Mistake ·"
    );
    expect(collectText(findByTestId(activeSession, "practice-session-guide-demo-board"))).not.toContain(
      "Moving on"
    );

    press(activeSession, "practice-session-guide-start");
    expect(collectText(findByTestId(activeSession, "practice-session-guide-coach-progress"))).toBe(
      "4 of 4"
    );
    expect(() => findByTestId(activeSession, "practice-session-guide-timeout-overlay")).toThrow();
    expect(collectText(findByTestId(activeSession, "practice-session-guide-coach-unclear"))).toContain(
      "Use Mark as unclear when needed"
    );
    expect(collectText(findByTestId(activeSession, "practice-session-guide-demo-unclear"))).toContain(
      "Mark as unclear"
    );
    expect(collectText(findByTestId(activeSession, "practice-session-guide-coach-unclear"))).toContain(
      "Tap it after a correct answer, or on the final Incomplete puzzle, when the solution still does not make sense to you."
    );
    expect(collectText(findByTestId(activeSession, "practice-session-guide-start"))).toBe(
      "Start Sprint"
    );

    press(activeSession, "practice-session-guide-back");
    expect(collectText(findByTestId(activeSession, "practice-session-guide-coach-progress"))).toBe(
      "3 of 4"
    );
    press(activeSession, "practice-session-guide-start");
    expect(
      findByTestId(activeSession, "practice-active-session-guide").props.accessibilityLabel
    ).toBe(
      "Guide 4 of 4. Use Mark as unclear when needed. Tap it after a correct answer, or on the final Incomplete puzzle, when the solution still does not make sense to you."
    );

    press(activeSession, "practice-session-guide-start");
    expect(findByTestId(activeSession, "session-board")).toBeTruthy();

    const firstEverArrowDuel = renderLabScenario("practice-arrow-duel-guide");

    expect(findByTestId(firstEverArrowDuel, "practice-active-session-guide")).toBeTruthy();
    expect(() => findByTestId(firstEverArrowDuel, "practice-arrow-duel-guide")).toThrow();
    expect(() => findByTestId(firstEverArrowDuel, "session-board")).toThrow();
    expect(collectText(findByTestId(firstEverArrowDuel, "practice-session-guide-coach-progress"))).toBe(
      "1 of 6"
    );
    expect(collectText(findByTestId(firstEverArrowDuel, "practice-session-guide-start"))).toBe(
      "Next"
    );

    for (let index = 0; index < 4; index += 1) {
      press(firstEverArrowDuel, "practice-session-guide-start");
    }
    expect(() => findByTestId(firstEverArrowDuel, "practice-active-session-guide")).toThrow();
    expect(findByTestId(firstEverArrowDuel, "practice-arrow-duel-guide")).toBeTruthy();
    expect(findByTestId(firstEverArrowDuel, "practice-arrow-duel-guide-timing-demo")).toBeTruthy();
    expect(findByTestId(firstEverArrowDuel, "practice-arrow-duel-guide-demo-board")).toBeTruthy();
    expect(findByTestId(firstEverArrowDuel, "practice-arrow-duel-guide-candidates")).toBeTruthy();
    expect(findByTestId(
      firstEverArrowDuel,
      "practice-arrow-duel-guide-candidates-order-g6g7-g6e8"
    )).toBeTruthy();
    expect(findByTestId(firstEverArrowDuel, "active-session-shell")).toBeTruthy();
    expect(findByTestId(firstEverArrowDuel, "practice-prompt")).toBeTruthy();
    expect(findByTestId(firstEverArrowDuel, "session-puzzle-timing")).toBeTruthy();
    expect(findByTestId(firstEverArrowDuel, "session-score-strip")).toBeTruthy();
    expect(() => findByTestId(firstEverArrowDuel, "session-board")).toThrow();
    expect(testIdOrder(firstEverArrowDuel, "active-session-shell", "practice-prompt")).toBeLessThan(0);
    expect(testIdOrder(firstEverArrowDuel, "practice-prompt", "practice-arrow-duel-guide-demo-board")).toBeLessThan(0);
    expect(testIdOrder(firstEverArrowDuel, "practice-arrow-duel-guide-demo-board", "session-score-strip")).toBeLessThan(0);
    expect(collectText(findByTestId(firstEverArrowDuel, "practice-arrow-duel-guide-coach"))).toContain(
      "Play one of the two arrows. A correct choice rewinds the board and plays the other, tempting move instead."
    );
    expect(collectText(findByTestId(firstEverArrowDuel, "practice-session-guide-coach-progress"))).toBe(
      "5 of 6"
    );

    press(firstEverArrowDuel, "practice-session-guide-back");
    expect(findByTestId(firstEverArrowDuel, "practice-active-session-guide")).toBeTruthy();
    expect(collectText(findByTestId(firstEverArrowDuel, "practice-session-guide-coach-progress"))).toBe(
      "4 of 6"
    );
    expect(findByTestId(firstEverArrowDuel, "practice-session-guide-coach-unclear")).toBeTruthy();
    press(firstEverArrowDuel, "practice-session-guide-start");
    expect(findByTestId(firstEverArrowDuel, "practice-arrow-duel-guide")).toBeTruthy();
    expect(collectText(findByTestId(firstEverArrowDuel, "practice-session-guide-coach-progress"))).toBe(
      "5 of 6"
    );

    press(firstEverArrowDuel, "practice-session-guide-start");
    expect(findByTestId(
      firstEverArrowDuel,
      "practice-arrow-duel-guide-reply-last-move"
    )).toBeTruthy();
    expect(() => findByTestId(
      firstEverArrowDuel,
      "practice-arrow-duel-guide-reply-timing-ramp"
    )).toThrow();
    expect(() => findByTestId(
      firstEverArrowDuel,
      "practice-arrow-duel-guide-candidates"
    )).toThrow();
    expect(collectText(findByTestId(
      firstEverArrowDuel,
      "practice-session-guide-coach-copy-arrow-duel-reply"
    ))).toContain("Then reply for Black");
    expect(collectText(findByTestId(
      firstEverArrowDuel,
      "practice-session-guide-coach-copy-arrow-duel-reply"
    ))).toContain(
      "After you choose correctly, we play the other move. You have 10 seconds to find Black’s best reply while your Sprint time is paused. A miss or timeout counts as one mistake and goes to Review."
    );
    expect(collectText(findByTestId(
      firstEverArrowDuel,
      "practice-session-guide-optional-settings-notice"
    ))).toBe("This extra challenge is optional — turn it off in Settings.");
    expect(flattenTestStyle(findByTestId(
      firstEverArrowDuel,
      "practice-session-guide-optional-settings-notice"
    ).props.style)).toMatchObject({
      backgroundColor: "#DBEAFE",
      borderWidth: 1
    });
    expect(flattenTestStyle(findByTestId(
      firstEverArrowDuel,
      "practice-session-guide-optional-settings-label"
    ).props.style).fontWeight).toBe("900");
    expect(collectText(findByTestId(
      firstEverArrowDuel,
      "practice-arrow-duel-guide-reply-hint"
    ))).toBe("Optional · Turn off in Settings");
    expect(collectText(findByTestId(
      firstEverArrowDuel,
      "practice-session-guide-coach-progress"
    ))).toBe("6 of 6");

    press(firstEverArrowDuel, "practice-session-guide-start");
    expect(findByTestId(firstEverArrowDuel, "sprint-loading-overlay")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(findByTestId(firstEverArrowDuel, "session-board")).toBeTruthy();

    const returningArrowDuel = renderLabScenario("practice-arrow-duel-guide-only");

    expect(findByTestId(returningArrowDuel, "practice-arrow-duel-guide")).toBeTruthy();
    expect(() => findByTestId(returningArrowDuel, "practice-active-session-guide")).toThrow();
    expect(findByTestId(returningArrowDuel, "practice-arrow-duel-guide-timing-demo")).toBeTruthy();
    expect(findByTestId(returningArrowDuel, "practice-arrow-duel-guide-demo-board")).toBeTruthy();
    expect(findByTestId(returningArrowDuel, "practice-arrow-duel-guide-candidates")).toBeTruthy();
    expect(() => findByTestId(returningArrowDuel, "session-board")).toThrow();
    expect(collectText(findByTestId(returningArrowDuel, "practice-session-guide-coach-progress"))).toBe(
      "1 of 2"
    );
    expect(collectText(findByTestId(returningArrowDuel, "practice-session-guide-start"))).toBe(
      "Next"
    );
    press(returningArrowDuel, "practice-session-guide-start");
    expect(collectText(findByTestId(returningArrowDuel, "practice-session-guide-coach-progress"))).toBe(
      "2 of 2"
    );
    expect(() => findByTestId(
      returningArrowDuel,
      "practice-arrow-duel-guide-reply-timing-ramp"
    )).toThrow();
    expect(collectText(findByTestId(returningArrowDuel, "practice-session-guide-start"))).toBe(
      "Start Arrow Duel"
    );
  });

  it("previews the default-on Arrow Duel reply setting without saving it", () => {
    const renderer = renderLabScenario("practice-run-arrow-duel-editor");

    press(renderer, "practice-run-home-edit");
    press(renderer, "practice-run-edit-arrow-duel");

    expect(collectText(findByTestId(
      renderer,
      "practice-run-arrow-duel-reply-value"
    ))).toBe("On");
    expect(collectText(findByTestId(
      renderer,
      "practice-run-arrow-duel-reply-setting"
    ))).toContain("You’ll have 10 seconds by default. Choose up to 30 seconds.");
    expect(collectText(findByTestId(
      renderer,
      "practice-run-arrow-duel-reply-setting"
    ))).toContain("Find the opponent’s best reply");
    expect(collectText(findByTestId(
      renderer,
      "practice-run-arrow-duel-reply-setting"
    ))).toContain(
      "After you choose the better arrow, we play the other move so you can find the opponent’s best reply."
    );
    expect(collectText(findByTestId(
      renderer,
      "practice-run-arrow-duel-reply-setting"
    ))).toContain(
      "This setting only changes this Run. Turn it off to go straight to the next puzzle."
    );
    expect(collectText(findByTestId(
      renderer,
      "practice-run-arrow-duel-reply-setting"
    ))).toContain("Your Sprint and puzzle timers pause while you find the reply.");
    expect(collectText(findByTestId(
      renderer,
      "practice-run-arrow-duel-reply-setting"
    ))).toContain("To turn this extra challenge off for every Run, go to Settings.");
    expect(collectText(findByTestId(
      renderer,
      "practice-run-arrow-duel-reply-setting"
    ))).not.toContain("one choice");
    expect(collectText(findByTestId(
      renderer,
      "practice-run-arrow-duel-reply-setting"
    ))).not.toContain("Reply challenge is on by default for this Run.");
    expect(collectText(findByTestId(
      renderer,
      "practice-run-arrow-duel-reply-setting"
    ))).not.toContain("On and Off keep separate ratings");
    expect(findByTestId(renderer, "practice-run-arrow-duel-reply-seconds").props.value).toBe("10");
    expect(findByTestId(renderer, "practice-run-arrow-duel-reply-toggle").props.accessibilityLabel)
      .toBe("Find the opponent’s best reply");
    expect(findByTestId(renderer, "practice-run-arrow-duel-reply-seconds").props.accessibilityLabel)
      .toBe("Time to find the opponent’s reply in seconds");
    expect(findByTestId(renderer, "practice-run-arrow-duel-reply-seconds").props.maxLength)
      .toBe(2);

    act(() => {
      findByTestId(renderer, "practice-run-arrow-duel-reply-seconds").props.onChangeText("8");
    });
    expect(findByTestId(renderer, "practice-run-arrow-duel-reply-seconds").props.value).toBe("8");

    act(() => {
      findByTestId(renderer, "practice-run-arrow-duel-reply-seconds").props.onChangeText("31");
    });
    expect(collectText(findByTestId(
      renderer,
      "practice-run-arrow-duel-reply-seconds-error"
    ))).toBe("Enter a positive whole number up to 30 seconds.");
    expect(findByTestId(renderer, "practice-run-save").props.disabled).toBe(true);

    press(renderer, "practice-run-arrow-duel-reply-toggle");
    expect(collectText(findByTestId(
      renderer,
      "practice-run-arrow-duel-reply-value"
    ))).toBe("Off");
    expect(findByTestId(renderer, "practice-run-arrow-duel-reply-seconds").props.editable)
      .toBe(false);
    expect(() => findByTestId(renderer, "practice-run-arrow-duel-reply-seconds-error"))
      .toThrow();
    expect(findByTestId(renderer, "practice-run-save").props.disabled).toBe(false);
  });

  it("lets a new Arrow Duel Run inherit the global default without a duplicate override", () => {
    const renderer = renderLabScenario("practice-custom-setup");

    press(renderer, "practice-add-run");
    press(renderer, "custom-mode-arrow-duel");

    expect(() => findByTestId(renderer, "practice-run-arrow-duel-reply-setting")).toThrow();
    expect(findByTestId(renderer, "practice-run-puzzle-timing")).toBeTruthy();
  });

  it("explains the visible global on and off behavior before saved Run preferences", () => {
    const renderer = renderLabScenario("settings-ios-sync");

    press(renderer, "settings-tab");
    expect(collectText(findByTestId(renderer, "settings-arrow-duel-opponent-reply")))
      .toContain(
        "After you choose the better arrow, we play the other move so you can find the opponent’s best reply. Your Sprint and puzzle timers pause while you reply. You can turn this off or change the time for each Run in Edit Run."
      );
    expect(collectText(findByTestId(renderer, "settings-arrow-duel-opponent-reply")))
      .toContain("Find the opponent’s best reply");
    expect(collectText(findByTestId(renderer, "settings-arrow-duel-opponent-reply")))
      .toContain("On");

    press(renderer, "settings-arrow-duel-opponent-reply-off");
    expect(collectText(findByTestId(renderer, "settings-arrow-duel-opponent-reply")))
      .toContain("Off");
    expect(collectText(findByTestId(renderer, "settings-arrow-duel-opponent-reply")))
      .toContain(
        "After you choose the better arrow, you’ll go straight to the next puzzle in every Run. If you turn this back on, each Run will use the reply setting and time you previously chose."
      );
    expect(collectText(findByTestId(renderer, "settings-arrow-duel-opponent-reply")))
      .not.toContain("one choice");
    expect(collectText(findByTestId(renderer, "settings-status-message")))
      .toBe("Runs will now go straight to the next puzzle");

    press(renderer, "settings-arrow-duel-opponent-reply-on");
    expect(collectText(findByTestId(renderer, "settings-status-message")))
      .toBe("Runs will now include the opponent’s best reply");
  });

  it("persists the production global setting and hides the individual Run override", () => {
    const service = createMobilePracticeService("random1000");
    const renderer = renderScreen({
      initialTab: "settings",
      practiceService: service,
      runManagementEnabled: true
    });

    expect(collectText(findByTestId(
      renderer,
      "settings-arrow-duel-opponent-reply"
    ))).toContain("On");
    press(renderer, "settings-arrow-duel-opponent-reply-off");
    expect(service.getSettings().arrowDuel.opponentReplyEnabled).toBe(false);

    press(renderer, "practice-tab");
    press(renderer, "practice-run-home-edit");
    press(renderer, "practice-run-edit-arrow-duel");

    expect(() => findByTestId(
      renderer,
      "practice-run-arrow-duel-reply-setting"
    )).toThrow();
    expect(findByTestId(renderer, "practice-run-puzzle-timing")).toBeTruthy();
  });

  it("hides the individual Run override while the global setting is off", () => {
    const renderer = renderLabScenario(
      "practice-run-arrow-duel-editor",
      { arrowDuelOpponentReplyGlobalEnabled: false }
    );

    press(renderer, "practice-run-home-edit");
    press(renderer, "practice-run-edit-arrow-duel");

    expect(() => findByTestId(renderer, "practice-run-arrow-duel-reply-setting")).toThrow();
    expect(findByTestId(renderer, "practice-run-puzzle-timing")).toBeTruthy();
  });

  it("moves to the next puzzle after the better arrow while the global setting is off", async () => {
    const renderer = renderLabScenario(
      "practice-arrow-duel-prompt",
      { arrowDuelOpponentReplyGlobalEnabled: false }
    );
    startArrowDuelSprint(renderer);
    const puzzleId = collectText(findByTestId(renderer, "session-current-puzzle-id"));

    await boardMove(renderer, ARROW_DUEL_REPLY_LAB_MOVES.default.correctChoice);

    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(() => findByTestId(renderer, "arrow-duel-what-if-overlay")).toThrow();
    expect(() => findByTestId(renderer, "arrow-duel-reply-timer")).toThrow();
    await settleFeedbackSnapshot();
    expect(collectText(findByTestId(renderer, "session-current-puzzle-id"))).not.toBe(puzzleId);
  });

  it("previews Standard-style outcome feedback and automatic advance", async () => {
    const correct = renderLabScenario("practice-arrow-duel-prompt");
    startArrowDuelSprint(correct);
    const correctPuzzleId = collectText(findByTestId(correct, "session-current-puzzle-id"));
    const initialPerspective = findByTestId(correct, "mock-chessboard").props.flipped;

    await boardMove(correct, ARROW_DUEL_REPLY_LAB_MOVES.default.correctChoice);
    expect(findByTestId(correct, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(correct.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(collectText(findByTestId(correct, "arrow-duel-reply-challenge"))).toContain(
      "Choose the best move"
    );
    expect(findByTestId(correct, "mock-chessboard").props.flipped).toBe(initialPerspective);

    await settleArrowDuelReplyHandoff();

    expect(collectText(findByTestId(correct, "arrow-duel-reply-challenge"))).toContain(
      "Find White’s reply"
    );
    expect(collectText(findByTestId(correct, "arrow-duel-reply-timer"))).toBe("0:10");
    expect(collectText(findByTestId(correct, "arrow-duel-reply-context"))).toBe(
      "The other move was played."
    );
    expect(() => findByTestId(correct, "arrow-duel-reply-sprint-paused")).toThrow();
    const replyPrompt = findByTestId(correct, "arrow-duel-reply-challenge");
    expect(flattenTestStyle(replyPrompt.props.style)).toEqual(expect.objectContaining({
      alignSelf: "center",
      height: PRACTICE_PROMPT_BASE_HEIGHT,
      width: "100%"
    }));
    expect(flattenTestStyle(
      findByTestId(correct, "arrow-duel-reply-copy-layer").props.style
    )).toEqual(expect.objectContaining({ position: "absolute" }));
    expect(findByTestId(correct, "mock-chessboard").props.flipped).toBe(initialPerspective);
    expect(collectVisibleText(findByTestId(correct, "arrow-duel-reply-hint"))).toBe(
      "Optional · Turn off in Settings"
    );
    expect(findByTestId(correct, "arrow-duel-reply-hint").props.accessibilityElementsHidden)
      .toBe(false);
    expect(flattenTestStyle(findByTestId(correct, "arrow-duel-reply-hint").props.style))
      .not.toEqual(expect.objectContaining({ opacity: 0, position: "absolute" }));
    await boardMove(correct, ARROW_DUEL_REPLY_LAB_MOVES.default.expectedReply);
    expect(collectText(correct.root)).not.toContain("Solved");
    expect(findByTestId(correct, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(correct.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(findByTestId(correct, "session-score-strip").props.accessibilityLabel).toContain(
      "solved 1, mistakes 0"
    );
    await settleFeedbackSnapshot();
    expect(collectText(findByTestId(correct, "session-current-puzzle-id")))
      .not.toBe(correctPuzzleId);
    expect(collectText(findByTestId(correct, "arrow-duel-reply-challenge"))).toContain(
      "Choose the best move"
    );

    const customReplyTime = renderLabScenario(
      "practice-arrow-duel-prompt",
      { arrowDuelReplySeconds: 30 }
    );
    startArrowDuelSprint(customReplyTime);
    await boardMove(customReplyTime, ARROW_DUEL_REPLY_LAB_MOVES.default.correctChoice);
    await advanceArrowDuelReplyToPrompt();
    expect(collectText(findByTestId(
      customReplyTime,
      "arrow-duel-what-if-detail"
    ))).toBe("You’ll have 30 seconds to play the best reply.");
    await finishArrowDuelReplyHandoff();
    expect(collectText(findByTestId(customReplyTime, "arrow-duel-reply-timer"))).toBe("0:30");
    expect(findByTestId(customReplyTime, "arrow-duel-reply-timer-group").props.accessibilityLabel)
      .toBe("30 seconds remaining.");

    const singularReplyTime = renderLabScenario(
      "practice-arrow-duel-prompt",
      { arrowDuelReplySeconds: 1 }
    );
    startArrowDuelSprint(singularReplyTime);
    await boardMove(singularReplyTime, ARROW_DUEL_REPLY_LAB_MOVES.default.correctChoice);
    await advanceArrowDuelReplyToPrompt();
    expect(collectText(findByTestId(
      singularReplyTime,
      "arrow-duel-what-if-detail"
    ))).toBe("You’ll have 1 second to play the best reply.");

    const wrongChoice = renderLabScenario("practice-arrow-duel-prompt");
    startArrowDuelSprint(wrongChoice);
    const wrongChoicePuzzleId = collectText(findByTestId(
      wrongChoice,
      "session-current-puzzle-id"
    ));
    await boardMove(wrongChoice, ARROW_DUEL_REPLY_LAB_MOVES.default.wrongChoice);
    expect(collectText(wrongChoice.root)).not.toContain("Choice missed");
    expect(collectText(wrongChoice.root)).not.toContain("One mistake · added to Review");
    expect(findByTestId(wrongChoice, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(wrongChoice.root, "rgba(220, 38, 38, 0.32)")).toBe(true);
    expect(findByTestId(wrongChoice, "session-score-strip").props.accessibilityLabel).toContain(
      "solved 0, mistakes 1"
    );
    await settleFeedbackSnapshot();
    expect(collectText(findByTestId(wrongChoice, "session-current-puzzle-id")))
      .not.toBe(wrongChoicePuzzleId);

    const wrongReply = renderLabScenario("practice-arrow-duel-prompt");
    startArrowDuelSprint(wrongReply);
    const wrongReplyPuzzleId = collectText(findByTestId(
      wrongReply,
      "session-current-puzzle-id"
    ));
    await boardMove(wrongReply, ARROW_DUEL_REPLY_LAB_MOVES.default.correctChoice);
    await settleArrowDuelReplyHandoff();
    const replyBoard = findByTestId(wrongReply, "mock-chessboard");
    const replyChess = new Chess(replyBoard.props.fen);
    const expectedReply = ARROW_DUEL_REPLY_LAB_MOVES.default.expectedReply.toLowerCase();
    const differentReply = replyChess.moves({ verbose: true }).find((move) => (
      `${move.from}${move.to}${move.promotion ?? ""}`.toLowerCase() !== expectedReply
    ));
    expect(differentReply).toBeDefined();
    await boardMove(
      wrongReply,
      `${differentReply!.from}${differentReply!.to}${differentReply!.promotion ?? ""}`
    );
    expect(collectText(wrongReply.root)).not.toContain("Reply missed");
    expect(collectText(wrongReply.root)).not.toContain("One mistake · added to Review");
    expect(findByTestId(wrongReply, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(wrongReply.root, "rgba(220, 38, 38, 0.32)")).toBe(true);
    expect(findByTestId(wrongReply, "session-score-strip").props.accessibilityLabel).toContain(
      "solved 0, mistakes 1"
    );
    await settleFeedbackSnapshot();
    expect(collectText(findByTestId(wrongReply, "session-current-puzzle-id")))
      .not.toBe(wrongReplyPuzzleId);

    const timeout = renderLabScenario(
      "practice-arrow-duel-prompt",
      { arrowDuelReplyAutoTimeoutMs: 500 }
    );
    startArrowDuelSprint(timeout);
    const timeoutPuzzleId = collectText(findByTestId(timeout, "session-current-puzzle-id"));
    await boardMove(timeout, ARROW_DUEL_REPLY_LAB_MOVES.default.correctChoice);
    await settleArrowDuelReplyHandoff();
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(collectText(timeout.root)).not.toContain("Reply timed out");
    expect(collectText(findByTestId(timeout, "session-puzzle-timeout-overlay"))).toContain(
      "Timed out"
    );
    expect(collectText(findByTestId(timeout, "session-puzzle-timing-label"))).toBe(
      "Puzzle 0:00"
    );
    expect(findByTestId(timeout, "session-score-strip").props.accessibilityLabel).toContain(
      "solved 0, mistakes 1"
    );
    await settleFeedbackSnapshot();
    expect(collectText(findByTestId(timeout, "session-current-puzzle-id")))
      .not.toBe(timeoutPuzzleId);
  });

  it("waits for first-cue confirmation before starting the reply timer", async () => {
    const renderer = renderLabScenario(
      "practice-arrow-duel-prompt",
      { arrowDuelReplyPreparationConfirmationRequired: true }
    );
    startArrowDuelSprint(renderer);

    await boardMove(renderer, ARROW_DUEL_REPLY_LAB_MOVES.default.correctChoice);
    await advanceArrowDuelReplyToPrompt();

    const action = findByTestId(renderer, "arrow-duel-what-if-action");
    expect(action.props.accessibilityRole).toBe("button");
    expect(action.props.accessibilityLabel).toBe("Got it");
    expect(findByTestId(renderer, "arrow-duel-what-if-overlay").props.accessible)
      .not.toBe(true);
    const announcement = findByTestId(renderer, "arrow-duel-what-if-announcement");
    expect(announcement.props.accessible).toBe(true);
    expect(announcement.props.accessibilityRole).toBe("alert");
    expect(announcement.props.accessibilityLabel).toBe(
      "What would White play after the other move? You’ll have 10 seconds to play the best reply. Optional · Turn off in Settings"
    );
    expect(flattenTestStyle(action.props.style).minHeight).toBeGreaterThanOrEqual(44);
    const visibleTitle = collectText(findByTestId(renderer, "arrow-duel-what-if-title"));
    expect(visibleTitle).toContain("What would");
    expect(visibleTitle).toContain("after the other move?");
    expect(visibleTitle).not.toContain("White");
    const sideGlyph = findByTestId(renderer, "arrow-duel-what-if-side-glyph");
    expect(flattenTestStyle(sideGlyph.props.style)).toEqual(expect.objectContaining({
      height: 32,
      width: 32
    }));
    expect(findByTestId(renderer, "arrow-duel-what-if-side-king")).toBeTruthy();
    expect(findByTestId(renderer, "arrow-duel-what-if-announcement").props.accessibilityLabel).toBe(
      "What would White play after the other move? You’ll have 10 seconds to play the best reply. Optional · Turn off in Settings"
    );
    expect(collectText(findByTestId(renderer, "arrow-duel-what-if-detail"))).toBe(
      "You’ll have 10 seconds to play the best reply."
    );
    expect(() => findByTestId(renderer, "arrow-duel-reply-timer")).toThrow();

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(findByTestId(renderer, "arrow-duel-what-if-action")).toBeTruthy();
    expect(() => findByTestId(renderer, "arrow-duel-reply-timer")).toThrow();

    press(renderer, "arrow-duel-what-if-action");
    await waitForAssertion(() => {
      expect(() => findByTestId(renderer, "arrow-duel-what-if-overlay")).toThrow();
      expect(collectText(findByTestId(renderer, "arrow-duel-reply-timer"))).toBe("0:10");
    });
  });

  it("passes without asking for a reply when the other move is stalemate", async () => {
    const renderer = renderScreen({
      arrowDuelTargetCorrect: 2,
      practiceService: createStalemateAlternatePracticeService(),
      puzzleSelectionSeed: "terminal-stalemate"
    });
    startArrowDuelSprint(renderer);

    act(() => {
      findByTestId(renderer, "mock-chessboard").props.onReady();
    });
    const candidates = findByTestId(renderer, "arrow-duel-candidate-overlay").props.candidates;
    expect(new Set(candidates)).toEqual(new Set(["g6g7", "g6f7"]));
    await boardMove(renderer, "g6g7");

    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(() => findByTestId(renderer, "arrow-duel-what-if-overlay")).toThrow();
    expect(() => findByTestId(renderer, "arrow-duel-what-if-action")).toThrow();
    expect(() => findByTestId(renderer, "arrow-duel-reply-timer")).toThrow();
    expect(collectText(renderer.root)).not.toContain("After you choose correctly");
    expect(collectText(findByTestId(renderer, "session-progress"))).toBe("1 / 2");

    await settleFeedbackSnapshot();
    expect(() => findByTestId(renderer, "sprint-summary-panel")).toThrow();
    act(() => {
      findByTestId(renderer, "mock-chessboard").props.onReady();
    });
    expect(findByTestId(renderer, "arrow-duel-candidate-overlay")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "arrow-duel-reply-challenge"))).toContain(
      "Choose the best move"
    );
  });

  it("uses semantic first-use guidance without visible tour-step meta copy", () => {
    const activeSession = renderLabScenario("practice-active-session-guide");
    const guide = findByTestId(activeSession, "practice-active-session-guide");
    const progress = findByTestId(activeSession, "practice-session-guide-coach-progress");

    expect(guide.props.accessibilityLabel).not.toMatch(/\b(?:step|tour)\b/i);
    expect(guide.props.accessibilityLabel).toBe(
      "Guide 1 of 4. Track your Sprint. The top row shows puzzles solved, Sprint time left, and mistakes remaining. At zero, the active puzzle is saved as Incomplete, not as a mistake. The Sprint begins when you finish this guide."
    );
    expect(progress.props.accessibilityLabel).toBe("Guide 1 of 4");
    expect(findByTestId(activeSession, "practice-session-guide-metrics")).toBeTruthy();
    expect(collectText(
      findByTestId(activeSession, "practice-session-guide-coach-copy-overview")
    )).toBe(
      "SPRINT HEADERTrack your SprintThe top row shows puzzles solved, Sprint time left, and mistakes remaining. At zero, the active puzzle is saved as Incomplete, not as a mistake. The Sprint begins when you finish this guide."
    );

    press(activeSession, "practice-session-guide-start");
    expect(findByTestId(
      activeSession,
      "practice-active-session-guide"
    ).props.accessibilityLabel).toBe(
      "Guide 2 of 4. Amber means you’re taking too long. Keep solving. A correct answer will be marked Unclear because you took too long, but it will not count as a mistake."
    );
    expect(findByTestId(activeSession, "practice-session-guide-demo-timer")).toBeTruthy();
    expect(collectText(
      findByTestId(activeSession, "practice-session-guide-coach-copy-slow")
    )).toBe(
      "SLOWAmber means you’re taking too longKeep solving. A correct answer will be marked Unclear because you took too long, but it will not count as a mistake."
    );

    press(activeSession, "practice-session-guide-start");
    expect(findByTestId(
      activeSession,
      "practice-active-session-guide"
    ).props.accessibilityLabel).toBe(
      "Guide 3 of 4. This puzzle counts as a mistake. It is added to Review. Mistakes are not marked Unclear. The Sprint then shows the next puzzle."
    );
    expect(findByTestId(activeSession, "practice-session-guide-demo-board")).toBeTruthy();
    expect(collectText(
      findByTestId(activeSession, "practice-session-guide-coach-copy-timeout")
    )).toBe(
      "TIMED OUTThis puzzle counts as a mistakeIt is added to Review. Mistakes are not marked Unclear. The Sprint then shows the next puzzle."
    );

    press(activeSession, "practice-session-guide-start");
    expect(findByTestId(
      activeSession,
      "practice-active-session-guide"
    ).props.accessibilityLabel).toBe(
      "Guide 4 of 4. Use Mark as unclear when needed. Tap it after a correct answer, or on the final Incomplete puzzle, when the solution still does not make sense to you."
    );
    expect(findByTestId(activeSession, "practice-session-guide-demo-unclear")).toBeTruthy();
    expect(collectText(
      findByTestId(activeSession, "practice-session-guide-coach-copy-unclear")
    )).toBe(
      "UNCLEARUse Mark as unclear when neededTap it after a correct answer, or on the final Incomplete puzzle, when the solution still does not make sense to you."
    );

    const arrowDuel = renderLabScenario("practice-arrow-duel-guide-only");
    expect(findByTestId(arrowDuel, "practice-arrow-duel-guide-candidates")).toBeTruthy();
    expect(findByTestId(
      arrowDuel,
      "practice-session-guide-coach-pointer-arrow-duel-top"
    )).toBeTruthy();
    expect(collectText(
      findByTestId(arrowDuel, "practice-session-guide-coach-copy-arrow-duel")
    )).toBe(
      "ARROW DUEL · 1 OF 2Choose the stronger movePlay one of the two arrows. A correct choice rewinds the board and plays the other, tempting move instead."
    );
    expect(findByTestId(
      arrowDuel,
      "practice-arrow-duel-guide"
    ).props.accessibilityLabel).toBe(
      "Guide 1 of 2. Choose the stronger move. Play one of the two arrows. A correct choice rewinds the board and plays the other, tempting move instead."
    );
    press(arrowDuel, "practice-session-guide-start");
    expect(collectText(
      findByTestId(arrowDuel, "practice-session-guide-coach-copy-arrow-duel-reply")
    )).toBe(
      "FIND THE REPLY · 2 OF 2Then reply for BlackAfter you choose correctly, we play the other move. You have 10 seconds to find Black’s best reply while your Sprint time is paused. A miss or timeout counts as one mistake and goes to Review.This extra challenge is optional — turn it off in Settings."
    );
    expect(collectText(
      findByTestId(arrowDuel, "practice-session-guide-optional-settings-notice")
    )).toBe("This extra challenge is optional — turn it off in Settings.");
    expect(findByTestId(
      arrowDuel,
      "practice-arrow-duel-guide"
    ).props.accessibilityLabel).toBe(
      "Guide 2 of 2. Then reply for Black. After you choose correctly, we play the other move. You have 10 seconds to find Black’s best reply while your Sprint time is paused. A miss or timeout counts as one mistake and goes to Review. This extra challenge is optional — turn it off in Settings."
    );

    const rules = renderLabScenario("practice-first-sprint-guide");
    const rulesText = collectText(findByTestId(rules, "practice-sprint-rules-guide"));
    expect(rulesText).toContain(
      "At zero, the active puzzle is saved as Incomplete, not as a mistake, and needs attention. If it is Slow, it is also marked Unclear."
    );
    expect(rulesText).toContain(
      "The puzzle timer turns amber when you are taking too long. If you solve after that, it is marked Unclear for another look, not as a mistake."
    );
    expect(rulesText).toContain(
      "When the puzzle timer runs out, it counts as a mistake, is added to Review, and the Sprint moves on. Mistakes are not marked Unclear."
    );
  });

  it("keeps every guide target and connector in the public portrait and wide-short flow", () => {
    setPracticeViewport({
      width: 402,
      height: 874,
      scale: 3,
      insets: { top: 62, right: 0, bottom: 34, left: 0 }
    });

    const portrait = renderLabScenario("practice-active-session-guide");
    expect(() => findByTestId(
      portrait,
      "practice-session-guide-back"
    )).toThrow();
    expect(findByTestId(
      portrait,
      "practice-session-guide-coach-pointer-overview-top"
    )).toBeTruthy();
    press(portrait, "practice-session-guide-start");
    expect(findByTestId(portrait, "practice-session-guide-demo-timer")).toBeTruthy();
    expect(findByTestId(
      portrait,
      "practice-session-guide-coach-pointer-slow-bottom"
    )).toBeTruthy();
    expect(flattenTestStyle(findByTestId(
      portrait,
      "practice-session-guide-coach-pointer-slow-bottom"
    ).props.style).bottom).toBe(-16);
    expect(findByTestId(
      portrait,
      "practice-session-guide-coach-pointer-slow-bottom-line"
    )).toBeTruthy();
    expect(findByTestId(
      portrait,
      "practice-session-guide-coach-pointer-slow-bottom-head"
    )).toBeTruthy();
    press(portrait, "practice-session-guide-start");
    expect(findByTestId(portrait, "practice-session-guide-timeout-overlay")).toBeTruthy();
    press(portrait, "practice-session-guide-start");
    expect(findByTestId(portrait, "sprint-unclear-toggle").props.accessibilityLabel).toBe(
      "Mark this attempt as unclear"
    );
    expect(findByTestId(
      portrait,
      "practice-session-guide-coach-pointer-unclear-bottom"
    )).toBeTruthy();
    expect(findByTestId(
      portrait,
      "practice-session-guide-coach-pointer-unclear-bottom-head"
    )).toBeTruthy();

    setPracticeViewport({
      width: 874,
      height: 402,
      scale: 3,
      insets: { top: 0, right: 62, bottom: 21, left: 62 }
    });

    const landscape = renderLabScenario("practice-active-session-guide");
    const disabledBack = findByTestId(landscape, "practice-session-guide-back");
    expect(disabledBack.props.accessibilityState).toEqual({ disabled: true });
    press(landscape, "practice-session-guide-start");
    expect(findByTestId(
      landscape,
      "practice-session-guide-coach-pointer-slow-right"
    )).toBeTruthy();
    press(landscape, "practice-session-guide-start");
    expect(findByTestId(
      landscape,
      "practice-session-guide-coach-pointer-timeout-left"
    )).toBeTruthy();
    press(landscape, "practice-session-guide-start");
    expect(findByTestId(
      landscape,
      "practice-session-guide-coach-pointer-unclear-right"
    )).toBeTruthy();
    expect(() => findByTestId(
      landscape,
      "practice-session-guide-coach-pointer-unclear-right-horizontal"
    )).toThrow();
    expect(() => findByTestId(
      landscape,
      "practice-session-guide-coach-pointer-unclear-right-vertical"
    )).toThrow();
    expect(findByTestId(
      landscape,
      "practice-session-guide-coach-pointer-unclear-right-head"
    )).toBeTruthy();
    expect(flattenTestStyle(
      findByTestId(landscape, "active-session-control-rail-content").props.style
    ).gap).toBe(4);
    expect(findByTestId(landscape, "sprint-unclear-toggle").props.accessibilityLabel).toBe(
      "Mark this attempt as unclear"
    );

    const arrowDuel = renderLabScenario("practice-arrow-duel-guide-only");
    expect(findByTestId(arrowDuel, "practice-arrow-duel-guide-candidates")).toBeTruthy();
    expect(findByTestId(
      arrowDuel,
      "practice-session-guide-coach-pointer-arrow-duel-top"
    )).toBeTruthy();
    expect(findByTestId(
      arrowDuel,
      "practice-session-guide-coach-pointer-arrow-duel-top-vertical"
    )).toBeTruthy();
    expect(findByTestId(
      arrowDuel,
      "practice-session-guide-coach-pointer-arrow-duel-top-head"
    )).toBeTruthy();
    expect(() => findByTestId(
      arrowDuel,
      "practice-session-guide-coach-pointer-arrow-duel-top-horizontal"
    )).toThrow();
    expect(() => findByTestId(
      arrowDuel,
      "practice-session-guide-coach-pointer-arrow-duel-top-endpoint"
    )).toThrow();
  });

  it.each([
    {
      height: 874,
      insets: { top: 62, right: 0, bottom: 34, left: 0 },
      label: "iPhone portrait",
      scale: 3,
      width: 402
    },
    {
      height: 402,
      insets: { top: 0, right: 62, bottom: 21, left: 62 },
      label: "iPhone landscape",
      scale: 3,
      width: 874
    },
    {
      height: 1180,
      insets: { top: 24, right: 0, bottom: 20, left: 0 },
      label: "iPad portrait",
      scale: 2,
      width: 820
    },
    {
      height: 820,
      insets: { top: 0, right: 0, bottom: 20, left: 0 },
      label: "iPad landscape",
      scale: 2,
      width: 1180
    }
  ])("aligns the Arrow Duel guide prompt in $label", ({
    height,
    insets,
    scale,
    width
  }: {
    height: number;
    insets: PracticeSafeAreaInsets;
    label: string;
    scale: number;
    width: number;
  }) => {
    setPracticeViewport({ width, height, scale, insets });

    const renderer = renderLabScenario("practice-arrow-duel-guide-only");
    const promptStyle = flattenTestStyle(findByTestId(
      renderer,
      "practice-session-guide-prompt"
    ).props.style);
    const promptPanelStyle = flattenTestStyle(findByTestId(
      renderer,
      "practice-prompt"
    ).props.style);
    const layout = buildPracticeAdaptiveLayout({
      fontScale: 1,
      height,
      insets,
      width
    });

    expect(promptStyle.alignSelf).toBe("center");
    expect(promptPanelStyle.minHeight).toBeUndefined();
    expect(promptPanelStyle.height).toBe(layout.promptFrameHeight);
    if (layout.usesSessionRail) {
      const railStyle = flattenTestStyle(findByTestId(
        renderer,
        "active-session-control-rail-content"
      ).props.style);
      expect(promptStyle.width).toBe(railStyle.width);
    } else {
      const boardStyle = flattenTestStyle(findByTestId(
        renderer,
        "practice-arrow-duel-guide-demo-board"
      ).props.style);
      expect(promptStyle.width).toBe(boardStyle.width);
    }

    press(renderer, "practice-session-guide-start");
    expect(collectText(findByTestId(
      renderer,
      "practice-session-guide-coach-copy-arrow-duel-reply"
    ))).toContain("Then reply for Black");
    expect(() => findByTestId(
      renderer,
      "practice-arrow-duel-guide-reply-timing-ramp"
    )).toThrow();
    expect(() => findByTestId(renderer, "practice-arrow-duel-guide-candidates")).toThrow();
  });

  it("keeps the Arrow Duel reply guide below the demonstrated white piece on iPhone portrait", () => {
    setPracticeViewport({
      width: 402,
      height: 874,
      scale: 3,
      insets: { top: 62, right: 0, bottom: 34, left: 0 }
    });

    const renderer = renderLabScenario("practice-arrow-duel-guide-only");
    press(renderer, "practice-session-guide-start");

    const boardStyle = flattenTestStyle(findByTestId(
      renderer,
      "practice-arrow-duel-guide-demo-board"
    ).props.style);
    const calloutStyle = flattenTestStyle(findByTestId(
      renderer,
      "practice-arrow-duel-guide-coach"
    ).props.style);
    const boardHeight = Number(boardStyle.height);
    const calloutWidth = Number(calloutStyle.width);

    expect(calloutStyle).toMatchObject({
      left: "50%",
      position: "absolute",
      top: Math.round(boardHeight * 0.4 + boardHeight / 8)
    });
    expect(calloutStyle.transform).toEqual([
      { translateX: -calloutWidth / 2 }
    ]);
  });

  it("keeps the reply guide operable with large text on a compact phone", () => {
    setPracticeViewport({
      width: 320,
      height: 693,
      scale: 2,
      fontScale: 1.5,
      insets: { top: 24, right: 0, bottom: 20, left: 0 }
    });

    const renderer = renderLabScenario("practice-arrow-duel-guide-only");
    press(renderer, "practice-session-guide-start");

    expect(() => findByTestId(
      renderer,
      "practice-arrow-duel-guide-reply-timing-ramp"
    )).toThrow();
    expect(() => findByTestId(renderer, "practice-prompt-icon")).toThrow();
    expect(findByTestId(renderer, "practice-session-guide-back").props.accessibilityRole)
      .toBe("button");
    expect(findByTestId(renderer, "practice-session-guide-start").props.accessibilityLabel)
      .toBe("Start Arrow Duel");
  });

  it("stacks reply guidance at a 150%-effective compact width", () => {
    setPracticeViewport({
      width: 213,
      height: 462,
      scale: 2,
      fontScale: 1.5,
      insets: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    const renderer = renderLabScenario("practice-arrow-duel-guide-only");
    press(renderer, "practice-session-guide-start");

    expect(() => findByTestId(
      renderer,
      "practice-arrow-duel-guide-reply-timing-ramp"
    )).toThrow();
    expect(flattenTestStyle(findByTestId(
      renderer,
      "practice-session-guide-navigation"
    ).props.style).flexDirection).toBe("column");
    expect(flattenTestStyle(findByTestId(
      renderer,
      "practice-session-guide-start"
    ).props.style)).toEqual(expect.objectContaining({
      minWidth: 0,
      width: "100%"
    }));
  });

  it("keeps the complete first-use guide operable in the maintained iPhone portrait viewport", () => {
    setPracticeViewport({
      width: 402,
      height: 874,
      scale: 3,
      insets: { top: 62, right: 0, bottom: 34, left: 0 }
    });

    const renderer = renderLabScenario("practice-active-session-guide");
    for (let index = 0; index < 3; index += 1) {
      expect(findByTestId(renderer, "practice-session-guide-start")).toBeTruthy();
      press(renderer, "practice-session-guide-start");
    }
    expect(findByTestId(renderer, "practice-session-guide-demo-unclear")).toBeTruthy();
    expect(findByTestId(renderer, "practice-session-guide-back")).toBeTruthy();
    expect(findByTestId(renderer, "practice-session-guide-start").props.accessibilityLabel).toBe(
      "Start Sprint"
    );
  });

  it("shows the complete Arrow Duel guide progress at maintained landscape widths", () => {
    setPracticeViewport({
      width: 874,
      height: 402,
      scale: 3,
      insets: { top: 0, right: 62, bottom: 21, left: 62 }
    });

    const renderer = renderLabScenario("practice-arrow-duel-guide");
    for (let index = 0; index < 4; index += 1) {
      press(renderer, "practice-session-guide-start");
    }

    const progress = findByTestId(renderer, "practice-session-guide-coach-progress");
    expect(collectText(progress)).toBe("5 of 6");
    press(renderer, "practice-session-guide-start");
    expect(collectText(progress)).toBe("6 of 6");
    expect(() => findByTestId(
      renderer,
      "practice-arrow-duel-guide-reply-timing-ramp"
    )).toThrow();
  });

  it("summarizes dynamic pass rules and timeout Review behavior in production New and Edit Run", () => {
    const productionLike = renderScreen({
      sprintGuidanceEnabled: true,
      runManagementPresentation: runManagementPresentation({
        draft: {
          name: "",
          kind: "custom",
          mode: "custom",
          elo: 900,
          durationSeconds: 300,
          perPuzzleSeconds: 20,
          puzzleTiming: {
            slowAfterSeconds: 40,
            timeoutAfterSeconds: 60
          },
          themes: ["mixed"]
        },
        screen: "create"
      })
    });
    expect(collectText(findByTestId(productionLike, "practice-run-pass-rules"))).toContain(
      "Solve 15 before 5 min ends"
    );
    expect(() => findByTestId(productionLike, "practice-sprint-rules-guide")).toThrow();
    expect(() => findByTestId(productionLike, "practice-sprint-rules-open")).toThrow();
    expect(collectText(findByTestId(productionLike, "practice-run-puzzle-timeout"))).toContain(
      "adds it to Review"
    );

    const preview = renderLabScenario("practice-custom-setup");
    press(preview, "practice-add-run");

    expect(collectText(findByTestId(preview, "practice-run-pass-rules"))).toContain(
      "Solve 15 before 5 min ends"
    );
    expect(collectText(findByTestId(preview, "practice-run-puzzle-timeout"))).toContain(
      "Marks it Timed out, counts as a mistake, adds it to Review, and moves on."
    );
    press(preview, "practice-run-duration-stepper-decrease");
    expect(collectText(findByTestId(preview, "practice-run-pass-rules"))).toContain(
      "Solve 9 before 3 min ends"
    );

    const editRun = renderLabScenario("practice-run-standard-editor");
    press(editRun, "practice-run-home-edit");
    press(editRun, "practice-run-edit-standard");
    expect(collectText(findByTestId(editRun, "practice-run-pass-rules"))).toContain(
      "Solve 15 before 5 min ends"
    );
  });

  it("opens the Settings guidance story directly and resets both Sprint guides without confirmation", () => {
    const renderer = renderLabScenario("settings-sprint-guidance");

    expect(findByTestId(renderer, "settings-panel")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-guidance-reset-card"))).toContain(
      "Runs, ratings, and History stay unchanged."
    );
    expect(collectText(findByTestId(renderer, "settings-guidance-reset-card"))).toContain(
      "rules, active-session, and Arrow Duel guides"
    );
    expect(collectText(findByTestId(renderer, "settings-show-sprint-guide"))).toBe(
      "Reset guides"
    );
    expect(
      hasStyleEntry(findByTestId(renderer, "settings-show-sprint-guide"), "minHeight", 44)
    ).toBe(true);
    expect(
      findByTestId(renderer, "settings-guidance-reset-card").findAllByProps({
        testID: "chevron-right-glyph"
      })
    ).toHaveLength(0);
    expect(() => findByTestId(renderer, "settings-sprint-guide-ready")).toThrow();

    press(renderer, "settings-show-sprint-guide");
    expect(collectText(findByTestId(renderer, "settings-show-sprint-guide"))).toBe(
      "Guides reset"
    );
    expect(collectText(findByTestId(renderer, "settings-sprint-guide-ready"))).toBe(
      "Guides reset. Each guide will replay the next time it applies."
    );
  });

  it("keeps the seven curated puzzle tags in the Populated History story", async () => {
    const renderer = renderLabScenario("history-populated");
    await flushMicrotasks();

    press(renderer, "history-tab");

    const railTestIDs = new Set(
      collectTestIds(findByTestId(renderer, "history-attempt-history-unclear-themes"))
        .filter((testID) => testID.startsWith("history-attempt-history-unclear-themes-"))
    );
    expect(railTestIDs.size).toBe(7);
    expect(railTestIDs).toContain("history-attempt-history-unclear-themes-matein3");
    expect(findByTestId(renderer, "history-progress-button")).toBeTruthy();
  });

  it("opens the Storybook-only tactical progress page from History", async () => {
    const renderer = renderLabScenario("history-progress");
    await flushMicrotasks();

    press(renderer, "history-tab");
    await flushMicrotasks();
    expect(findByTestId(renderer, "history-progress-button")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-progress-screen")).toThrow();

    press(renderer, "history-progress-button");
    expect(collectText(findByTestId(renderer, "history-progress-screen"))).toContain(
      "Tactical progress"
    );
    expect(findByTestId(renderer, "history-progress-early-estimate")).toBeTruthy();
    const progressSection = findByTestId(renderer, "history-strength-over-time");
    expect(collectText(progressSection)).toContain(
      "7 points higher"
    );
    expect(collectText(progressSection)).toContain(
      "Accuracy · higher is better"
    );
    expect(collectText(progressSection)).toContain(
      "n=71"
    );
    expect(collectText(progressSection)).toContain("How accuracy is counted");
    expect(collectText(progressSection)).toContain(
      "Recent attempts and stronger theme matches contribute more to n."
    );
    expect(collectText(progressSection)).toContain(
      "Wrong moves and timeouts count as misses."
    );
    expect(collectText(progressSection)).not.toContain(
      "model-weighted observations"
    );
    expect(collectText(progressSection)).not.toContain(
      "Eligible ordinary mixed Runs"
    );
    const balanced = findByTestId(renderer, "history-no-clear-weakness");
    expect(collectText(balanced)).toContain("Recent play looks balanced");
    expect(collectText(findByTestId(renderer, "history-balanced-check"))).toBe("✓");
    expect(collectText(balanced)).toContain(
      "No theme currently shows a repeated, meaningful weakness in accuracy or solve time."
    );
    const metricSelector = findByTestId(renderer, "history-progress-metric-selector");
    expect(collectText(metricSelector)).toContain("Accuracy");
    expect(collectText(metricSelector)).toContain("94%");
    expect(collectText(metricSelector)).toContain("Solve time");
    expect(collectText(metricSelector)).toContain("1.09×");
    press(renderer, "history-progress-metric-completed_speed");
    expect(collectText(findByTestId(renderer, "history-strength-over-time"))).toContain(
      "1.09×"
    );
    expect(collectText(findByTestId(renderer, "history-progress-chart-note"))).toContain(
      "How solve time is counted"
    );
    expect(collectText(findByTestId(renderer, "history-progress-chart-note"))).toContain(
      "1.00× matches your comparable completed puzzles."
    );

    press(renderer, "history-progress-strength-pins");
    expect(collectText(findByTestId(renderer, "history-strength-over-time"))).toContain(
      "24% less time"
    );
    expect(collectText(findByTestId(renderer, "history-strength-over-time"))).toContain(
      "1.06×"
    );

    press(renderer, "history-progress-back");
    expect(findByTestId(renderer, "history-panel")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-progress-screen")).toThrow();
  });

  it("highlights a clear weakness separately from training recommendations", async () => {
    const renderer = renderLabScenario("history-progress-weakness");
    await flushMicrotasks();

    press(renderer, "history-tab");
    await flushMicrotasks();
    press(renderer, "history-progress-button");

    const weakness = findByTestId(renderer, "history-clear-weakness");
    expect(collectText(weakness)).toContain("Skewers");
    expect(collectText(weakness)).toContain("Solve reliability");
    expect(collectText(weakness)).toContain("14 extra misses");
    expect(collectText(weakness)).toContain("per 100 comparable puzzles");
    expect(collectText(weakness)).toContain(
      "Other well-sampled themes remain closer"
    );
    expect(collectText(weakness)).toContain(
      "evidence, practical-impact, and diversity checks"
    );
    expect(collectText(weakness)).toContain("26 different puzzles · 6 sessions");
    expect(collectText(findByTestId(renderer, "history-progress-screen"))).not.toContain(
      "recommend"
    );
  });

  it("shows completed-puzzle time as a distinct weakness head", async () => {
    const renderer = renderLabScenario("history-progress-speed-weakness");
    await flushMicrotasks();

    press(renderer, "history-tab");
    press(renderer, "history-progress-button");

    const weakness = findByTestId(renderer, "history-clear-weakness");
    expect(collectText(weakness)).toContain("Pins");
    expect(collectText(weakness)).toContain("Completed-puzzle speed");
    expect(collectText(weakness)).toContain("1.34× comparable time");
    expect(collectText(weakness)).toContain("about 34% longer");
    expect(collectText(weakness)).toContain(
      "other well-sampled themes remain closer"
    );
    expect(collectText(weakness)).toContain(
      "Only correct, before-timeout attempts with reliable elapsed time"
    );
    expect(collectText(weakness)).toContain(
      "personal controls that exclude the theme being measured"
    );
    expect(collectText(weakness)).toContain(
      "Slow, Unclear, and Review membership do not decide it"
    );
    expect(collectText(findByTestId(renderer, "history-progress-screen"))).not.toContain(
      "recommend"
    );
  });

  it("opens production History Progress with an honest empty model state", async () => {
    const renderer = renderScreen();
    await flushMicrotasks();

    press(renderer, "history-tab");
    expect(findByTestId(renderer, "history-progress-button")).toBeTruthy();

    press(renderer, "history-progress-button");
    expect(findByTestId(renderer, "history-progress-screen")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-strength-over-time"))).toContain(
      "No progress data is available yet."
    );
    expect(findByTestId(renderer, "history-no-clear-weakness")).toBeTruthy();
  });

  it("returns from History Progress through Android Predictive Back", async () => {
    const systemBack = createTestSystemBackSource("android");
    const renderer = renderScreen({ systemBack });
    await flushMicrotasks();

    press(renderer, "history-tab");
    await flushMicrotasks();
    press(renderer, "history-progress-button");

    systemBack.startPredictive("left");
    systemBack.progressPredictive(0.6, "left");
    expect(
      collectText(findByTestId(renderer, "mobile-back-destination-preview-label"))
    ).toBe("History");
    expect(
      collectText(findByTestId(renderer, "mobile-back-destination-preview-id"))
    ).toBe("tab-history");

    systemBack.cancelPredictive();
    expect(findByTestId(renderer, "history-progress-screen")).toBeTruthy();

    systemBack.startPredictive("right");
    expect(systemBack.commitPredictive()).toBe(true);
    expect(() => findByTestId(renderer, "history-progress-screen")).toThrow();
    expect(findByTestId(renderer, "history-panel")).toBeTruthy();
  });

  it("stops hidden History queries and closes Progress when leaving its tab", async () => {
    const service = createArrowFocusedPracticeService();
    const historyViewSpy = jest.spyOn(service, "getHistoryView");
    const renderer = renderScreen({ practiceService: service });
    await flushMicrotasks();

    press(renderer, "history-tab");
    await flushMicrotasks();
    const visibleHistoryQueryCount = historyViewSpy.mock.calls.length;
    expect(visibleHistoryQueryCount).toBeGreaterThan(0);

    press(renderer, "history-progress-button");
    expect(findByTestId(renderer, "history-progress-screen")).toBeTruthy();
    expect(historyViewSpy).toHaveBeenCalledTimes(visibleHistoryQueryCount);

    press(renderer, "settings-tab");
    press(renderer, "history-tab");
    expect(() => findByTestId(renderer, "history-progress-screen")).toThrow();
    expect(findByTestId(renderer, "history-panel")).toBeTruthy();
  });

  it("renders the current model weakness and weekly evidence in production History", async () => {
    const renderer = renderScreen({
      practiceService: createArrowFocusedPracticeService()
    });
    await flushMicrotasks();

    press(renderer, "history-tab");
    press(renderer, "history-progress-button");

    const progress = findByTestId(renderer, "history-progress-screen");
    const weakness = findByTestId(renderer, "history-clear-weakness");
    expect(collectText(progress)).toContain("Pin · Arrow Duel");
    expect(collectText(progress)).toContain("How accuracy is counted");
    expect(collectText(progress)).not.toContain("model-weighted observations");
    expect(collectText(weakness)).toContain("Solve reliability");
    expect(collectText(weakness)).toContain("extra misses");
    expect(collectText(weakness)).toContain("12 different puzzles · 3 sessions");
    expect(collectText(weakness)).toContain(
      "Wrong moves and timeouts count once as solve failures"
    );
  });

  it("reveals all seven curated puzzle tags only when replay Analysis opens", async () => {
    const renderer = renderLabScenario("history-attempt-detail");
    await flushMicrotasks();

    press(renderer, "history-tab");
    press(renderer, "history-attempt-history-unclear");
    expect(findByTestId(renderer, "practice-announcement").props.accessibilityLabel).toBe(
      "Replay screen"
    );
    expect(collectText(findByTestId(renderer, "review-title"))).toBe("Replay");
    expect(collectText(findByTestId(renderer, "history-attempt-clear-unclear"))).toBe(
      "Mark clear"
    );
    expect(() => findByTestId(renderer, "review-theme-rail")).toThrow();

    press(renderer, "review-analysis-button");

    const railTestIDs = new Set(
      collectTestIds(findByTestId(renderer, "review-theme-rail"))
        .filter((testID) => testID.startsWith("review-theme-rail-"))
    );
    expect(railTestIDs.size).toBe(7);
    expect(railTestIDs).toContain("review-theme-rail-matein3");
  });

  it("keeps all 24 curated choices in the History Filters story", async () => {
    const renderer = renderLabScenario("history-filters");
    await flushMicrotasks();

    press(renderer, "history-tab");
    press(renderer, "history-filter-toggle");
    expect(findByTestId(renderer, "history-theme-disclosure").props.accessibilityState).toEqual({
      expanded: false
    });
    press(renderer, "history-theme-disclosure");

    const themeTestIDs = new Set(
      collectTestIds(findByTestId(renderer, "history-theme-filters"))
        .filter((testID) => testID.startsWith("history-theme-")
          && testID !== "history-theme-filters"
          && testID !== "history-theme-all"
          && testID !== "history-theme-catalog"
          && testID !== "history-theme-catalog-motion"
          && testID !== "history-theme-disclosure"
          && testID !== "history-theme-animated-chevron"
          && testID !== "history-theme-selection-detail"
          && !testID.startsWith("history-theme-filter-rail-"))
    );
    expect(themeTestIDs.size).toBe(24);
    expect(collectText(findByTestId(renderer, "history-theme-selection-detail"))).toBe(
      "All themes"
    );

    for (const themeTestID of themeTestIDs) {
      press(renderer, themeTestID);
      expect(historyThemeSelected(
        renderer,
        themeTestID.slice("history-theme-".length)
      )).toBe(true);
    }

    const selectedThemeDetail = collectText(
      findByTestId(renderer, "history-theme-selection-detail")
    );
    expect(selectedThemeDetail).toContain("Mate in 1");
    expect(selectedThemeDetail).toContain("Zugzwang");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain(
      "24 themes selected"
    );
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).not.toContain(
      "Mate in 1"
    );
  });

  it("previews consistent collapse motion across Review, History, and New Run", async () => {
    const reviewRenderer = renderLabScenario("review-due");
    await flushMicrotasks();
    press(reviewRenderer, "review-tab");

    expect(findByTestId(reviewRenderer, "review-filter-options-motion").props).toMatchObject({
      "aria-hidden": true,
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });
    expect(findByTestId(reviewRenderer, "review-filter-summary-motion").props).toMatchObject({
      "aria-hidden": false,
      accessibilityElementsHidden: false,
      pointerEvents: "auto"
    });
    expect(flattenTestStyle(
      findByTestId(reviewRenderer, "review-filter-options").props.style
    ).position).toBe("absolute");
    act(() => {
      findByTestId(reviewRenderer, "review-filter-options").props.onLayout({
        nativeEvent: { layout: { height: 32 } }
      });
    });
    expect(flattenTestStyle(
      findByTestId(reviewRenderer, "review-filter-options-motion").props.style
    ).height).not.toBe(0);
    expect(testIdOrder(
      reviewRenderer,
      "review-filter-options-motion",
      "review-filter-summary-motion"
    )).toBeLessThan(0);
    expect(testIdOrder(
      reviewRenderer,
      "review-filter-summary-motion",
      "review-start-due"
    )).toBeLessThan(0);
    press(reviewRenderer, "review-filter-toggle");
    expect(findByTestId(reviewRenderer, "review-filter-options-motion").props).toMatchObject({
      "aria-hidden": false,
      accessibilityElementsHidden: false,
      pointerEvents: "auto"
    });
    expect(findByTestId(reviewRenderer, "review-filter-summary-motion").props).toMatchObject({
      "aria-hidden": true,
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    press(reviewRenderer, "review-filter-toggle");
    expect(findByTestId(reviewRenderer, "review-filter-options-motion").props).toMatchObject({
      "aria-hidden": true,
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });
    expect(findByTestId(reviewRenderer, "review-filter-summary-motion").props).toMatchObject({
      "aria-hidden": false,
      accessibilityElementsHidden: false,
      pointerEvents: "auto"
    });

    expect(findByTestId(reviewRenderer, "review-today-to-review-items-motion")).toBeTruthy();
    expect(findByTestId(reviewRenderer, "review-today-history-items-motion")).toBeTruthy();
    expect(flattenTestStyle(
      findByTestId(reviewRenderer, "review-today-to-review-items").props.style
    ).position).toBeUndefined();
    act(() => {
      findByTestId(reviewRenderer, "review-today-to-review-items").props.onLayout({
        nativeEvent: { layout: { height: 180 } }
      });
    });
    expect(flattenTestStyle(
      findByTestId(reviewRenderer, "review-today-to-review-items").props.style
    ).position).toBe("absolute");
    expect(flattenTestStyle(
      findByTestId(reviewRenderer, "review-today-to-review-items-motion").props.style
    ).height).not.toBe(0);
    press(reviewRenderer, "review-today-to-review-toggle");
    expect(findByTestId(reviewRenderer, "review-today-to-review-toggle").props.accessibilityState).toEqual({
      expanded: false
    });
    expect(findByTestId(reviewRenderer, "review-today-to-review-items")).toBeTruthy();
    expect(findByTestId(reviewRenderer, "review-today-to-review-items-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    press(reviewRenderer, "review-today-to-review-toggle");
    expect(findByTestId(reviewRenderer, "review-today-to-review-items-motion").props).toMatchObject({
      accessibilityElementsHidden: false,
      pointerEvents: "auto"
    });

    const practiceHomeRenderer = renderLabScenario("practice-home");
    await flushMicrotasks();
    expect(() => findByTestId(practiceHomeRenderer, "practice-review-strip")).toThrow();

    const historyRenderer = renderLabScenario("history-filters");
    await flushMicrotasks();
    press(historyRenderer, "history-tab");
    press(historyRenderer, "history-filter-toggle");
    expect(findByTestId(historyRenderer, "history-advanced-filters-motion")).toBeTruthy();
    press(historyRenderer, "history-filter-toggle");
    expect(findByTestId(historyRenderer, "history-advanced-filters")).toBeTruthy();
    expect(findByTestId(historyRenderer, "history-advanced-filters-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });

    press(historyRenderer, "history-filter-toggle");
    press(historyRenderer, "history-theme-disclosure");
    expect(findByTestId(historyRenderer, "history-theme-catalog-motion")).toBeTruthy();
    press(historyRenderer, "history-theme-disclosure");
    expect(findByTestId(historyRenderer, "history-theme-catalog")).toBeTruthy();
    expect(findByTestId(historyRenderer, "history-theme-catalog-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });

    const newRunRenderer = renderLabScenario("practice-custom-setup");
    await flushMicrotasks();
    press(newRunRenderer, "practice-add-run");
    press(newRunRenderer, "practice-run-theme-disclosure");
    expect(findByTestId(newRunRenderer, "practice-run-theme-catalog-motion")).toBeTruthy();
    press(newRunRenderer, "practice-run-theme-disclosure");
    expect(findByTestId(newRunRenderer, "practice-run-theme-catalog")).toBeTruthy();
    expect(findByTestId(newRunRenderer, "practice-run-theme-catalog-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });
  });

  it("keeps Review quick filters inside the same Today sections", async () => {
    const renderer = renderLabScenario("review-filters");
    await flushMicrotasks();
    press(renderer, "review-tab");

    expect(findByTestId(renderer, "review-today-to-review-toggle")).toBeTruthy();
    expect(findByTestId(renderer, "review-completed-today-toggle")).toBeTruthy();
    expect(testIdOrder(renderer, "review-start-due", "review-due-items")).toBeLessThan(0);
    expect(testIdOrder(renderer, "review-due-items", "review-today-history")).toBeLessThan(0);
    expect(() => findByTestId(renderer, "review-context-list")).toThrow();
    expect(collectText(findByTestId(renderer, "review-panel"))).not.toContain("Due items");
    expect(collectText(findByTestId(renderer, "review-panel"))).not.toContain("Review groups");
    expect(testIdOrder(renderer, "review-filter-options-motion", "review-filter-summary-motion")).toBeLessThan(0);
    expect(testIdOrder(renderer, "review-filter-summary-motion", "review-start-due")).toBeLessThan(0);
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toBe("All");
    expect(() => findByTestId(renderer, "review-active-filter-1")).toThrow();
    expect(findByTestId(renderer, "review-active-filter-summary").props.accessibilityLabel).toBe(
      "Review filter summary, All"
    );
    expect(findByTestId(renderer, "review-filter-options-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });
    expect(findByTestId(renderer, "review-filter-summary-motion").props).toMatchObject({
      accessibilityElementsHidden: false,
      pointerEvents: "auto"
    });

    press(renderer, "review-filter-toggle");
    expect(findByTestId(renderer, "review-filter-summary-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });
    expect([...new Set(
      collectTestIds(findByTestId(renderer, "review-queue-filters"))
        .filter((testID) => testID.startsWith("review-filter-"))
    )]).toEqual([
      "review-filter-all",
      "review-filter-overdue",
      "review-filter-repeat-misses",
      "review-filter-arrow-duel"
    ]);
    expect(collectText(findByTestId(renderer, "review-queue-filters"))).toContain("Missed 2+ times");
    expect(() => findByTestId(renderer, "review-filter-mode-standard")).toThrow();
    expect(() => findByTestId(renderer, "review-filter-speed-20")).toThrow();

    press(renderer, "review-filter-repeat-misses");
    const repeatedMissesFilter = renderer.root.findAllByProps({
      testID: "review-filter-repeat-misses"
    }).find((node) => node.props.accessibilityState !== undefined);
    expect(repeatedMissesFilter?.props.accessibilityState).toEqual({
      selected: true
    });
    expect(collectText(findByTestId(renderer, "review-today-to-review-toggle"))).toContain("1");
    expect(collectText(findByTestId(renderer, "review-completed-today-toggle"))).toContain("1");
    expect(findByTestId(renderer, "review-due-item-lab-skewer-03-arrow-duel-arrow-duel-5-30")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-due-item-lab-fork-01-standard-standard-5-20")).toThrow();
    expect(collectText(findByTestId(renderer, "review-today-history-items"))).toContain(
      "Puzzle lab-pin-02"
    );
    expect(() => findByTestId(renderer, "review-context-list")).toThrow();
    expect(findByTestId(renderer, "review-filter-toggle").props.accessibilityLabel).toContain(
      "Missed 2+ times selected"
    );
    expect(findByTestId(renderer, "review-due-card").props.accessibilityLabel).toContain(
      "Missed 2+ times"
    );
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toBe(
      "Missed 2+ times"
    );
    expect(() => findByTestId(renderer, "review-active-filter-1")).toThrow();
    expect(findByTestId(renderer, "review-active-filter-summary").props.accessibilityLabel).toBe(
      "Review filter summary, Missed 2+ times"
    );
    press(renderer, "review-filter-toggle");
    expect(findByTestId(renderer, "review-filter-options-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });
    expect(findByTestId(renderer, "review-filter-summary-motion").props).toMatchObject({
      accessibilityElementsHidden: false,
      pointerEvents: "auto"
    });
  });

  it("limits an existing Custom Run editor to Current rating", () => {
    const onIntent = jest.fn();
    const renderer = renderScreen({
      runManagementPresentation: runManagementPresentation({
        draft: {
          id: "tactics-focus",
          name: "Tactics Focus",
          kind: "custom",
          mode: "custom",
          elo: 1040,
          durationSeconds: 600,
          perPuzzleSeconds: 30,
          puzzleTiming: { slowAfterSeconds: 60, timeoutAfterSeconds: 90 },
          themes: ["fork", "pin"]
        },
        onIntent,
        screen: "edit"
      })
    });

    expect(collectText(findByTestId(renderer, "practice-run-editor-title"))).toBe("Edit rating");
    expect(collectText(findByTestId(renderer, "practice-run-editor-run-name"))).toBe("Tactics Focus");
    expect(collectText(findByTestId(renderer, "practice-run-editor"))).toContain(
      "Run settings stay fixed."
    );
    expect(collectText(findByTestId(renderer, "practice-run-elo-row"))).toContain("Current rating");
    expect(() => findByTestId(renderer, "practice-run-name-input")).toThrow();
    expect(() => findByTestId(renderer, "practice-run-mode-row")).toThrow();
    expect(() => findByTestId(renderer, "practice-run-theme-row")).toThrow();
    expect(() => findByTestId(renderer, "practice-run-duration-stepper")).toThrow();
    expect(() => findByTestId(renderer, "practice-run-per-puzzle-stepper")).toThrow();

    press(renderer, "practice-run-elo-increase");
    press(renderer, "practice-run-save");
    expect(onIntent.mock.calls.map(([intent]) => intent)).toEqual([
      { type: "change-elo", elo: 1065 },
      { type: "save-run" }
    ]);
  });

  it("adds compact timing controls to the existing Storybook Edit Run design", () => {
    const onIntent = jest.fn();
    const home = renderScreen({
      runManagementPresentation: runManagementPresentation({
        directRunEditing: true,
        homeEditing: true
      })
    });
    expect(collectText(findByTestId(home, "practice-run-edit-tactics-focus"))).toBe("Edit");

    const renderer = renderScreen({
      runManagementPresentation: runManagementPresentation({
        directRunEditing: true,
        draft: {
          id: "standard",
          name: "Standard",
          kind: "standard",
          mode: "standard",
          elo: 925,
          durationSeconds: 300,
          perPuzzleSeconds: 20,
          puzzleTiming: {
            slowAfterSeconds: 40,
            timeoutAfterSeconds: 60
          },
          themes: ["mixed"]
        },
        eloError: null,
        eloInput: "925",
        homeEditing: true,
        onIntent,
        screen: "edit"
      })
    });

    expect(collectText(findByTestId(renderer, "practice-run-editor-title"))).toBe("Edit Run");
    expect(collectText(findByTestId(renderer, "practice-run-editor"))).toContain(
      "Change this Run's name, rating, and puzzle timing."
    );
    expect(findByTestId(renderer, "practice-run-name-input").props.value).toBe("Standard");
    expect(findByTestId(renderer, "practice-run-name-input").props.maxLength).toBe(
      PRACTICE_RUN_NAME_MAX_LENGTH
    );
    expect(findByTestId(renderer, "practice-run-name-input").props.returnKeyType).toBe("done");
    expect(findByTestId(renderer, "practice-run-name-input").props.submitBehavior).toBe(
      "blurAndSubmit"
    );
    expect(hasStyleEntry(findByTestId(renderer, "practice-run-name-row"), "gap", 16)).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "practice-run-name-input"), "maxWidth", 200)).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "practice-run-elo-stepper"), "flexDirection", "row")).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "practice-run-elo-input-shell"), "width", 72)).toBe(true);
    expect(findByTestId(renderer, "practice-run-elo-input").props.value).toBe("925");
    expect(findByTestId(renderer, "practice-run-elo-input").props.keyboardType).toBe("number-pad");
    expect(findByTestId(renderer, "practice-run-elo-input").props.maxLength).toBe(4);
    expect(collectText(findByTestId(renderer, "practice-run-elo-row"))).toContain(
      "600–2200 · ±100 buttons"
    );
    expect(collectText(findByTestId(renderer, "practice-run-details-section"))).toBe(
      "Run details"
    );
    expect(collectText(findByTestId(renderer, "practice-run-editor-fields"))).not.toContain(
      "Puzzle timing"
    );
    expect(collectText(findByTestId(renderer, "practice-run-puzzle-timing-card"))).not.toContain(
      "Puzzle timing"
    );
    expect(findByTestId(renderer, "practice-run-elo-decrease").props.accessibilityLabel).toBe(
      "Decrease run rating by 100"
    );
    expect(findByTestId(renderer, "practice-run-elo-increase").props.accessibilityLabel).toBe(
      "Increase run rating by 100"
    );
    expect(collectText(findByTestId(renderer, "practice-run-puzzle-timing"))).toContain(
      "Typical time 0:20 · no rating impact"
    );
    expect(collectText(findByTestId(renderer, "practice-run-slow-warning"))).toContain(
      "Turns the puzzle clock yellow. A correct answer after that is marked Unclear; play continues."
    );
    expect(collectText(findByTestId(renderer, "practice-run-puzzle-timeout"))).toContain(
      "Marks Timed out and moves on."
    );
    expect(collectText(findByTestId(renderer, "practice-run-slow-warning-value"))).toBe("0:40");
    expect(collectText(findByTestId(renderer, "practice-run-puzzle-timeout-value"))).toBe("1:00");

    press(renderer, "practice-run-elo-decrease");
    press(renderer, "practice-run-elo-increase");
    press(renderer, "practice-run-slow-warning-decrease");
    press(renderer, "practice-run-puzzle-timeout-toggle");

    act(() => {
      findByTestId(renderer, "practice-run-name-input").props.onChangeText("Morning Warm-up");
      findByTestId(renderer, "practice-run-elo-input").props.onChangeText("1375");
    });
    press(renderer, "practice-run-save");

    expect(onIntent.mock.calls.map(([intent]) => intent)).toEqual([
      { type: "step-elo-input", direction: -1 },
      { type: "step-elo-input", direction: 1 },
      {
        type: "change-puzzle-timing",
        puzzleTiming: {
          slowAfterSeconds: 35,
          timeoutAfterSeconds: 60
        }
      },
      {
        type: "change-puzzle-timing",
        puzzleTiming: {
          slowAfterSeconds: 40,
          timeoutAfterSeconds: null
        }
      },
      { type: "change-name", name: "Morning Warm-up" },
      { type: "change-elo-input", value: "1375" },
      { type: "save-run" }
    ]);
  });

  it.each([
    {
      height: 932,
      label: "portrait below-board row",
      scenarioId: "practice-active" as const,
      styleEntry: ["alignSelf", "center"] as const,
      width: 430
    },
    {
      height: 390,
      label: "landscape right rail",
      scenarioId: "practice-timing-warning" as const,
      styleEntry: ["alignSelf", "center"] as const,
      width: 844
    }
  ])("keeps puzzle timing compact in the existing $label", ({
    height,
    scenarioId,
    styleEntry,
    width
  }) => {
    (ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: {
        fontScale: number;
        height: number;
        scale: number;
        width: number;
      }) => void;
    }).__setWindowDimensions?.({ width, height, scale: 3, fontScale: 1 });
    const renderer = renderLabScenario(scenarioId);

    startStandardSprint(renderer);
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(findByTestId(renderer, "session-puzzle-timing")).toBeTruthy();
    expect(hasStyleEntry(
      findByTestId(renderer, "session-puzzle-timing"),
      styleEntry[0],
      styleEntry[1]
    )).toBe(true);
    expect(
      findByTestId(renderer, "session-board")
        .findAllByProps({ testID: "session-puzzle-timing" })
    ).toHaveLength(0);
    if (scenarioId === "practice-active") {
      expect(
        findByTestId(renderer, "session-board-details")
          .findByProps({ testID: "session-puzzle-timing" })
      ).toBeTruthy();
      expect(testIdOrder(renderer, "session-board", "session-puzzle-timing")).toBeLessThan(0);
      expect(testIdOrder(renderer, "session-puzzle-timing", "session-score-strip")).toBeLessThan(0);
      expect(
        findByTestId(renderer, "session-shell-nav")
          .findAllByProps({ testID: "session-puzzle-timing" })
      ).toHaveLength(0);
    }
    if (scenarioId === "practice-timing-warning") {
      expect(collectText(findByTestId(renderer, "session-puzzle-timing-label"))).toBe("Puzzle 0:41");
      expect(collectText(findByTestId(renderer, "session-puzzle-timing"))).not.toContain("Slow");
      expect(hasStyleEntry(
        findByTestId(renderer, "session-puzzle-timing-label"),
        "color",
        "#B45309"
      )).toBe(true);
      expect(findByTestId(renderer, "active-session-control-rail-content")).toBeTruthy();
    }
  });

  it("counts down, locks the board under Timed out, then resets for the next puzzle", () => {
    const renderer = renderLabScenario("practice-timing-timeout");

    startStandardSprint(renderer);
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const firstPuzzleFen = findByTestId(renderer, "mock-chessboard").props.fen;
    expect(collectText(findByTestId(renderer, "session-puzzle-timing-label"))).toBe("Puzzle 0:52");
    expect(collectText(findByTestId(renderer, "session-puzzle-countdown"))).toBe("8s");

    act(() => {
      jest.advanceTimersByTime(8_000);
    });
    expect(collectText(findByTestId(renderer, "session-puzzle-timing-label"))).toBe("Puzzle 1:00");
    expect(
      findByTestId(renderer, "session-board")
        .findAllByProps({ testID: "session-puzzle-timing" })
    ).toHaveLength(0);
    expect(collectText(findByTestId(renderer, "session-puzzle-timeout-overlay"))).toContain(
      "Timed out"
    );
    expect(collectText(findByTestId(renderer, "session-puzzle-timeout-overlay"))).toContain(
      "Added to Review"
    );
    expect(collectText(findByTestId(renderer, "session-puzzle-timeout-overlay"))).not.toContain(
      "Mistake ·"
    );
    expect(collectText(findByTestId(renderer, "session-puzzle-timeout-overlay"))).not.toContain(
      "Moving on"
    );
    expect(findByTestId(renderer, "board-input-blocker")).toBeTruthy();
    expectSessionMistakes(renderer, 1);

    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(() => findByTestId(renderer, "session-puzzle-timeout-overlay")).toThrow();
    expect(collectText(findByTestId(renderer, "session-puzzle-timing-label"))).toBe("Puzzle 0:00");
    expect(() => findByTestId(renderer, "session-puzzle-countdown")).toThrow();
    expect(findByTestId(renderer, "mock-chessboard").props.fen).not.toBe(firstPuzzleFen);
    expect(collectText(findByTestId(renderer, "sprint-previous-attempt-notice"))).toBe(
      "Previous puzzle timed outIt counted as a mistake and was added to Review.In Review"
    );
    expect(() => findByTestId(renderer, "sprint-unclear-prompt")).toThrow();
    expect(() => findByTestId(renderer, "sprint-unclear-toggle")).toThrow();
    expectSessionMistakes(renderer, 1);
  });

  it("uses the Timed out handoff when a board callback reaches the puzzle deadline first", async () => {
    let wallClockMs = Date.parse("2026-07-23T12:00:00.000Z");
    const service = createMobilePracticeService("random1000");
    startSprintWithPuzzleTiming(
      service,
      {
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        puzzleTiming: {
          slowAfterSeconds: 40,
          timeoutAfterSeconds: 60
        },
        targetCorrect: 15,
        maxMistakes: 3
      },
      new Date(wallClockMs).toISOString()
    );
    const renderer = renderScreen({
      currentTimeMs: () => wallClockMs,
      practiceService: service
    });

    press(renderer, "practice-resume-card");
    await settleEntryPreview();
    const firstPuzzleFen = findByTestId(renderer, "mock-chessboard").props.fen;
    wallClockMs += 60_000;
    await boardMove(renderer, "e2e6");

    expect(collectText(findByTestId(renderer, "session-puzzle-timeout-overlay"))).toContain(
      "Timed out"
    );
    expect(findByTestId(renderer, "board-input-blocker")).toBeTruthy();
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(firstPuzzleFen);
    expect(service.listHistory()).toHaveLength(1);
    expect(service.listHistory()[0]).toMatchObject({
      result: "timed_out",
      timingStatus: "timed_out"
    });
    expect(service.listHistory()[0]?.unclear).toBeUndefined();

    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(() => findByTestId(renderer, "session-puzzle-timeout-overlay")).toThrow();
    expect(findByTestId(renderer, "mock-chessboard").props.fen).not.toBe(firstPuzzleFen);
  });

  it("shows a terminal timeout when a board callback reaches the puzzle deadline first", async () => {
    let wallClockMs = Date.parse("2026-07-23T12:00:00.000Z");
    const service = createMobilePracticeService("random1000");
    startSprintWithPuzzleTiming(
      service,
      {
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        puzzleTiming: {
          slowAfterSeconds: 40,
          timeoutAfterSeconds: 60
        },
        targetCorrect: 15,
        maxMistakes: 1
      },
      new Date(wallClockMs).toISOString()
    );
    const renderer = renderScreen({
      currentTimeMs: () => wallClockMs,
      practiceService: service
    });

    press(renderer, "practice-resume-card");
    await settleEntryPreview();
    wallClockMs += 60_000;
    await boardMove(renderer, "e2e6");

    expect(collectText(findByTestId(renderer, "session-puzzle-timeout-overlay"))).toContain(
      "Timed out"
    );
    expect(() => findByTestId(renderer, "sprint-summary-panel")).toThrow();

    act(() => {
      jest.advanceTimersByTime(799);
    });
    expect(findByTestId(renderer, "session-puzzle-timeout-overlay")).toBeTruthy();
    expect(() => findByTestId(renderer, "sprint-summary-panel")).toThrow();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(() => findByTestId(renderer, "session-puzzle-timeout-overlay")).toThrow();
    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-result-mistakes"))).toBe("1");
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain(
      "1 attempt · Included in replay"
    );
  });

  it("automatically marks a Slow correct attempt Unclear and explains the read-only handoff", async () => {
    let wallClockMs = Date.parse("2026-07-23T12:00:00.000Z");
    const service = createMobilePracticeService("random1000");
    startSprintWithPuzzleTiming(
      service,
      {
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        puzzleTiming: {
          slowAfterSeconds: 40,
          timeoutAfterSeconds: 60
        },
        targetCorrect: 15,
        maxMistakes: 3
      },
      new Date(wallClockMs).toISOString()
    );
    const renderer = renderScreen({
      currentTimeMs: () => wallClockMs,
      practiceService: service
    });

    press(renderer, "practice-resume-card");
    await settleEntryPreview();
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    wallClockMs += 41_000;
    await boardMove(renderer, "e6f7");

    expect(service.listHistory()[0]).toMatchObject({
      result: "correct",
      timingStatus: "slow",
      unclear: true
    });
    expect(collectText(findByTestId(renderer, "sprint-previous-attempt-notice"))).toBe(
      "Previous puzzle took too longIt was automatically marked Unclear and added to Review.Marked Unclear"
    );
    expect(flattenTestStyle(
      findByTestId(renderer, "sprint-previous-attempt-notice-status").props.style
    )).toMatchObject({ backgroundColor: "#EFF6FF", borderColor: "#93C5FD" });
    expect(flattenTestStyle(
      findByTestId(renderer, "sprint-previous-attempt-notice-status")
        .findByType(ReactNative.Text).props.style
    ).color).toBe("#1D4ED8");
    expect(() => findByTestId(renderer, "sprint-unclear-prompt")).toThrow();
    expect(() => findByTestId(renderer, "sprint-unclear-marked")).toThrow();
    expect(() => findByTestId(renderer, "sprint-unclear-toggle")).toThrow();
  });

  it("records Slow timing without marking a wrong attempt Unclear", async () => {
    let wallClockMs = Date.parse("2026-07-23T12:00:00.000Z");
    const service = createMobilePracticeService("familiar15");
    service.saveSettings({
      ...service.getSettings(),
      sprintGuides: {
        rulesSeen: true,
        activeSessionSeen: true,
        arrowDuelSeen: true
      }
    });
    const renderer = renderScreen({
      currentTimeMs: () => wallClockMs,
      practiceService: service,
      sprintGuidanceEnabled: true
    });

    startStandardSprint(renderer);
    wallClockMs += 41_000;
    await boardMove(renderer, "c2b3");

    expect(service.listHistory()[0]).toMatchObject({
      result: "wrong",
      timingStatus: "slow"
    });
    expect(service.listHistory()[0]?.unclear).toBeUndefined();
    expect(() => findByTestId(renderer, "sprint-unclear-question")).toThrow();
    expect(() => findByTestId(renderer, "sprint-unclear-marked")).toThrow();
    expect(() => findByTestId(renderer, "sprint-unclear-toggle")).toThrow();
    expect(collectText(findByTestId(renderer, "sprint-previous-attempt-notice"))).toBe(
      "Previous answer was incorrectIt counted as a mistake and was added to Review.In Review"
    );
  });

  it("reports a timeout as one in-Review Replay attempt without marking it Unclear", () => {
    const service = createMobilePracticeService("random1000");
    service.saveSettings({
      ...service.getSettings(),
      sprintGuides: {
        rulesSeen: true,
        activeSessionSeen: true,
        arrowDuelSeen: true
      }
    });
    const renderer = renderScreen({
      practiceService: service,
      sprintGuidanceEnabled: true
    });

    startStandardSprint(renderer);
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(findByTestId(renderer, "session-puzzle-timeout-overlay")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(800);
    });
    press(renderer, "session-abandon");
    press(renderer, "session-abandon-confirm");

    expect(collectText(findByTestId(renderer, "sprint-result-mistakes"))).toBe("1");
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain(
      "1 attempt · Included in replay"
    );
    expect(() => findByTestId(renderer, "sprint-result-unclear-summary")).toThrow();
    expect(service.listReviewQueue()).toHaveLength(1);
  });

  it("shows a timeout that ends the Sprint before opening the summary", () => {
    let wallClockMs = Date.parse("2026-07-23T12:00:00.000Z");
    const service = createMobilePracticeService("random1000");
    startSprintWithPuzzleTiming(
      service,
      {
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        puzzleTiming: {
          slowAfterSeconds: 40,
          timeoutAfterSeconds: 60
        },
        targetCorrect: 15,
        maxMistakes: 1
      },
      new Date(wallClockMs).toISOString()
    );
    const renderer = renderScreen({
      currentTimeMs: () => wallClockMs,
      practiceService: service,
      sprintGuidanceEnabled: true
    });

    press(renderer, "practice-resume-card");
    act(() => {
      wallClockMs += 60_000;
      jest.advanceTimersByTime(60_000);
    });

    expect(collectText(findByTestId(renderer, "session-puzzle-timeout-overlay"))).toBe(
      "Timed outAdded to Review"
    );
    expect(() => findByTestId(renderer, "sprint-summary-panel")).toThrow();
    expect(() => findByTestId(renderer, "sprint-previous-attempt-notice")).toThrow();

    act(() => {
      jest.advanceTimersByTime(799);
    });
    expect(findByTestId(renderer, "session-puzzle-timeout-overlay")).toBeTruthy();
    expect(() => findByTestId(renderer, "sprint-summary-panel")).toThrow();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(() => findByTestId(renderer, "session-puzzle-timeout-overlay")).toThrow();
    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-result-mistakes"))).toBe("1");
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain(
      "1 attempt · Included in replay"
    );
  });

  it("summarizes a wrong answer that ends the Sprint instead of showing a next-puzzle notice", async () => {
    const wallClockMs = Date.parse("2026-07-23T12:00:00.000Z");
    const service = createMobilePracticeService("familiar15");
    service.saveSettings({
      ...service.getSettings(),
      sprintGuides: {
        rulesSeen: true,
        activeSessionSeen: true,
        arrowDuelSeen: true
      }
    });
    startSprintWithPuzzleTiming(
      service,
      {
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        puzzleTiming: {
          slowAfterSeconds: 40,
          timeoutAfterSeconds: 60
        },
        targetCorrect: 15,
        maxMistakes: 1
      },
      new Date(wallClockMs).toISOString()
    );
    const renderer = renderScreen({
      currentTimeMs: () => wallClockMs,
      practiceService: service,
      sprintGuidanceEnabled: true
    });

    press(renderer, "practice-resume-card");
    await settleEntryPreview();
    await boardMove(renderer, "c2b3");
    await settleFeedbackSnapshot();

    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();
    expect(() => findByTestId(renderer, "sprint-previous-attempt-notice")).toThrow();
    expect(collectText(findByTestId(renderer, "sprint-result-mistakes"))).toBe("1");
    expect(service.listReviewQueue()).toHaveLength(1);
  });

  it("records a Slow Incomplete without a puzzle timeout overlay when both deadlines are reached together", () => {
    let wallClockMs = Date.parse("2026-07-23T12:00:00.000Z");
    const service = createMobilePracticeService("random1000");
    startSprintWithPuzzleTiming(
      service,
      {
        durationSeconds: 60,
        perPuzzleSeconds: 20,
        puzzleTiming: {
          slowAfterSeconds: 40,
          timeoutAfterSeconds: 60
        },
        targetCorrect: 3,
        maxMistakes: 3
      },
      new Date(wallClockMs).toISOString()
    );
    const renderer = renderScreen({
      currentTimeMs: () => wallClockMs,
      practiceService: service
    });

    press(renderer, "practice-resume-card");
    act(() => {
      wallClockMs += 60_000;
      jest.advanceTimersByTime(60_000);
    });

    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();
    expect(() => findByTestId(renderer, "session-puzzle-timeout-overlay")).toThrow();
    expect(service.listHistory()).toHaveLength(1);
    expect(service.listHistory()[0]).toEqual(expect.objectContaining({
      result: "incomplete",
      timingStatus: "slow",
      unclear: true
    }));
    expect(collectText(findByTestId(renderer, "sprint-unclear-prompt"))).toContain(
      "Was the final puzzle unclear?"
    );
    expect(collectText(findByTestId(renderer, "sprint-unclear-marked"))).toBe("Marked");
  });

  it("lets a just-entered final Incomplete be marked unclear by its exact attempt", () => {
    let wallClockMs = Date.parse("2026-07-23T12:00:00.000Z");
    const service = createMobilePracticeService("random1000");
    let active = startSprintWithPuzzleTiming(
      service,
      {
        durationSeconds: 60,
        perPuzzleSeconds: 20,
        puzzleTiming: {
          slowAfterSeconds: 40,
          timeoutAfterSeconds: null
        },
        targetCorrect: 3,
        maxMistakes: 3
      },
      new Date(wallClockMs).toISOString()
    );
    const firstPuzzleId = active.currentPuzzle?.puzzle.id;
    expect(active.currentPuzzle?.kind).toBe("line");
    const firstPuzzle = active.currentPuzzle;
    const userMoves = firstPuzzle?.kind === "line"
      ? firstPuzzle.puzzle.solutionMoves.filter((_, index) => index >= firstPuzzle.cursor && (index - firstPuzzle.cursor) % 2 === 0)
      : [];
    userMoves.forEach((move, index) => {
      const completedAtMs = Date.parse("2026-07-23T12:00:59.000Z")
        - (userMoves.length - index - 1) * 1_000;
      active = service.submitMove(move, new Date(completedAtMs).toISOString()).state;
    });
    expect(active.currentPuzzle?.puzzle.id).not.toBe(firstPuzzleId);
    const previousAttempt = service.listHistory()[0];
    if (!previousAttempt) {
      throw new Error("expected previous attempt");
    }
    expect(previousAttempt.timingStatus).toBe("slow");
    expect(previousAttempt.unclear).toBe(true);

    wallClockMs = Date.parse("2026-07-23T12:00:59.000Z");
    const renderer = renderScreen({
      currentTimeMs: () => wallClockMs,
      practiceService: service
    });
    press(renderer, "practice-resume-card");
    act(() => {
      wallClockMs += 1_000;
      jest.advanceTimersByTime(1_000);
    });

    const incomplete = service.listHistory().find((attempt) => attempt.result === "incomplete");
    if (!incomplete) {
      throw new Error("expected Incomplete attempt");
    }
    expect(incomplete.elapsedMs).toBe(1_000);
    expect(incomplete.unclear).toBeUndefined();
    expect(collectText(findByTestId(renderer, "sprint-unclear-prompt"))).toContain(
      "Was the final puzzle unclear?"
    );
    expect(collectText(findByTestId(renderer, "sprint-unclear-toggle"))).toBe("Mark as unclear");

    press(renderer, "sprint-unclear-toggle");

    expect(service.listHistory().find((attempt) => attempt.id === incomplete.id)?.unclear).toBe(true);
    expect(service.listHistory().find((attempt) => attempt.id === previousAttempt.id)?.unclear).toBe(true);
    expect(collectText(findByTestId(renderer, "sprint-unclear-marked"))).toBe("Marked");
  });

  it("defaults History to Needs attention and links its OR reason filters to the primary view", async () => {
    const renderer = renderLabScenario("history-populated");
    await flushMicrotasks();

    press(renderer, "history-tab");
    expect(findByTestId(renderer, "history-attention-filter").props.role).toBe("radiogroup");
    expect(findByTestId(renderer, "history-attention-filter").props.accessibilityLabel).toBe(
      "History view"
    );
    expect(findByTestId(renderer, "history-attention-all").props.accessibilityRole).toBe("radio");
    expect(findByTestId(renderer, "history-attention-all").props.accessibilityState).toEqual({
      checked: false
    });
    expect(findByTestId(renderer, "history-attention-needs-attention").props.accessibilityState).toEqual({
      checked: true
    });
    expect(collectText(findByTestId(renderer, "history-attention-filter"))).toBe(
      "Needs attentionAll"
    );
    expect(() => findByTestId(renderer, "history-quick-filters")).toThrow();
    expect(() => findByTestId(renderer, "history-filter-sprint-only")).toThrow();
    expect(() => findByTestId(renderer, "history-filter-unclear")).toThrow();
    expect(() => findByTestId(renderer, "history-filter-wrong-only")).toThrow();
    expect(() => findByTestId(renderer, "history-filter-slow-only")).toThrow();
    expect(() => findByTestId(renderer, "history-filter-timed-out-only")).toThrow();
    expectDisclosureClosed(renderer, "history-advanced-filters");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Source: Sprint");
    expect(collectText(findByTestId(renderer, "history-attempt-history-correct-slow"))).toBe("Slow");
    expect(collectText(findByTestId(renderer, "history-attempt-history-wrong-result"))).toBe(
      "Wrong move"
    );
    expect(collectText(findByTestId(renderer, "history-attempt-history-timeout-result"))).toBe(
      "Timed out"
    );
    expect(
      findByTestId(renderer, "history-attempt-history-timeout-badge")
        .findByProps({ testID: "result-badge-wrong-glyph" })
    ).toBeTruthy();
    expect(hasStyleEntry(
      findByTestId(renderer, "history-attempt-history-timeout-badge"),
      "backgroundColor",
      "#DC2626"
    )).toBe(true);
    expect(() => findByTestId(renderer, "history-attempt-history-timeout-unclear")).toThrow();
    expect(collectText(findByTestId(renderer, "history-attempt-history-incomplete-fast-result"))).toBe(
      "Incomplete"
    );
    expect(
      findByTestId(renderer, "history-attempt-history-incomplete-fast-badge")
        .findByProps({ testID: "result-badge-incomplete-glyph" })
    ).toBeTruthy();
    expect(hasStyleEntry(
      findByTestId(renderer, "history-attempt-history-incomplete-fast-badge"),
      "backgroundColor",
      "#64748B"
    )).toBe(true);
    expect(() => findByTestId(renderer, "history-attempt-history-incomplete-fast-unclear")).toThrow();
    expect(() => findByTestId(renderer, "history-attempt-history-incomplete-fast-slow")).toThrow();
    expect(collectText(findByTestId(renderer, "history-attempt-history-incomplete-slow-result"))).toBe(
      "Incomplete"
    );
    expect(findByTestId(renderer, "history-attempt-history-incomplete-slow-unclear")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-attempt-history-incomplete-slow-slow"))).toBe("Slow");
    expect(() => findByTestId(renderer, "result-badge-alert-glyph")).toThrow();
    expect(() => findByTestId(renderer, "history-attempt-history-timeout-timed_out")).toThrow();
    expect(findByTestId(renderer, "history-attempt-history-unclear")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-history-clean")).toThrow();
    expect(findByTestId(renderer, "history-attention-needs-attention").props.accessibilityLabel).toBe(
      "Needs attention: Sprint attempts that are Incomplete, unclear, or in Review"
    );
    expect(collectText(findByTestId(renderer, "history-attention-explanation"))).toBe(
      "Needs attention includes Incomplete, Unclear, or In Review Sprint attempts."
    );
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toBe(
      "7 days·All puzzles·Source: Sprint"
    );
    expect(findByTestId(renderer, "history-attempt-history-correct")).toBeTruthy();
    expect(findByTestId(renderer, "history-attempt-history-wrong")).toBeTruthy();
    expect(findByTestId(renderer, "history-attempt-history-timeout")).toBeTruthy();
    expect(findByTestId(renderer, "history-attempt-history-incomplete-fast")).toBeTruthy();
    expect(findByTestId(renderer, "history-attempt-history-incomplete-slow")).toBeTruthy();
    expect(findByTestId(renderer, "history-attempt-history-unclear")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-history-clean")).toThrow();

    press(renderer, "history-filter-toggle");
    expect(testIdOrder(renderer, "history-advanced-filters", "history-attention-filter")).toBeLessThan(0);
    expect(hasStyleEntry(
      findByTestId(renderer, "history-advanced-filters"),
      "borderWidth",
      1
    )).toBe(true);
    expect(hasStyleEntry(
      findByTestId(renderer, "history-advanced-filters"),
      "borderColor",
      "#CBD5E1"
    )).toBe(true);
    expect(hasStyleEntry(
      findByTestId(renderer, "history-advanced-filters"),
      "backgroundColor",
      "#FFFFFF"
    )).toBe(true);
    expect(hasStyleEntry(
      findByTestId(renderer, "history-advanced-filters"),
      "padding",
      10
    )).toBe(true);
    expect(findByTestId(renderer, "history-rating-filters")).toBeTruthy();
    expect(findByTestId(renderer, "history-range-filters")).toBeTruthy();
    expect(hasStyleEntry(
      findByTestId(renderer, "history-source-sprint"),
      "backgroundColor",
      "#2563EB"
    )).toBe(true);
    expect(collectText(findByTestId(renderer, "history-source-filters"))).toContain("All sources");
    expect(collectText(findByTestId(renderer, "history-result-filters"))).toBe(
      "AllCorrectWrongIncomplete"
    );
    expect(collectText(findByTestId(renderer, "history-attention-flags"))).toBe(
      "AttentionUnclearIn reviewIncomplete"
    );
    expect(findByTestId(renderer, "history-attention-flags").props.accessibilityLabel).toBe(
      "Attention filters, match any"
    );
    expect(() => findByTestId(renderer, "history-attention-flag-mistakes")).toThrow();
    expect(historyFilterSelected(renderer, "history-attention-flag-unclear")).toBe(true);
    expect(historyFilterSelected(renderer, "history-attention-flag-in-review")).toBe(true);
    expect(historyFilterSelected(renderer, "history-attention-flag-incomplete")).toBe(true);
    expect(() => findByTestId(renderer, "history-attention-flag-slow")).toThrow();
    expect(() => findByTestId(renderer, "history-attention-flag-timed-out")).toThrow();
    expect(() => findByTestId(renderer, "history-review-status-filters")).toThrow();
    expect(findByTestId(renderer, "history-theme-disclosure").props.accessibilityState).toEqual({
      expanded: false
    });
    expect(findByTestId(renderer, "history-theme-catalog-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });
    press(renderer, "history-theme-disclosure");
    expect(findByTestId(renderer, "history-theme-disclosure").props.accessibilityState).toEqual({
      expanded: true
    });
    expect(findByTestId(renderer, "history-theme-all")).toBeTruthy();

    press(renderer, "history-attention-flag-unclear");
    press(renderer, "history-attention-flag-incomplete");
    expect(historyFilterSelected(renderer, "history-attention-flag-unclear")).toBe(false);
    expect(historyFilterSelected(renderer, "history-attention-flag-in-review")).toBe(true);
    expect(historyFilterSelected(renderer, "history-attention-flag-incomplete")).toBe(false);
    expect(findByTestId(renderer, "history-attention-needs-attention").props.accessibilityState).toEqual({
      checked: true
    });
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain(
      "Attention: In review"
    );
    expect(findByTestId(renderer, "history-attempt-history-wrong")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-history-unclear")).toThrow();
    expect(() => findByTestId(renderer, "history-attempt-history-clean")).toThrow();

    press(renderer, "history-attention-flag-in-review");
    expect(findByTestId(renderer, "history-attention-all").props.accessibilityState).toEqual({
      checked: true
    });
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).not.toContain(
      "Attention:"
    );
    expect(findByTestId(renderer, "history-attempt-history-clean")).toBeTruthy();

    press(renderer, "history-attention-flag-unclear");
    expect(historyFilterSelected(renderer, "history-attention-flag-unclear")).toBe(true);
    expect(historyFilterSelected(renderer, "history-attention-flag-in-review")).toBe(false);
    expect(historyFilterSelected(renderer, "history-attention-flag-incomplete")).toBe(false);
    expect(findByTestId(renderer, "history-attention-needs-attention").props.accessibilityState).toEqual({
      checked: true
    });
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain(
      "Attention: Unclear"
    );
    expect(findByTestId(renderer, "history-attempt-history-unclear")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-history-wrong")).toThrow();
    expect(() => findByTestId(renderer, "history-attempt-history-clean")).toThrow();
    press(renderer, "history-attention-needs-attention");
    expect(historyFilterSelected(renderer, "history-attention-flag-unclear")).toBe(true);
    expect(historyFilterSelected(renderer, "history-attention-flag-in-review")).toBe(false);
    expect(historyFilterSelected(renderer, "history-attention-flag-incomplete")).toBe(false);

    press(renderer, "history-attention-flag-in-review");
    expect(historyFilterSelected(renderer, "history-attention-flag-unclear")).toBe(true);
    expect(historyFilterSelected(renderer, "history-attention-flag-in-review")).toBe(true);
    expect(historyFilterSelected(renderer, "history-attention-flag-incomplete")).toBe(false);
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).not.toContain(
      "Attention:"
    );

    press(renderer, "history-result-correct");
    expect(findByTestId(renderer, "history-attempt-history-correct")).toBeTruthy();
    expect(findByTestId(renderer, "history-attempt-history-unclear")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-history-wrong")).toThrow();
    expect(() => findByTestId(renderer, "history-attempt-history-timeout")).toThrow();
    expect(() => findByTestId(renderer, "history-attempt-history-clean")).toThrow();

    press(renderer, "history-filter-reset");
    expect(findByTestId(renderer, "history-attention-all").props.accessibilityState).toEqual({
      checked: false
    });
    expect(findByTestId(renderer, "history-attention-needs-attention").props.accessibilityState).toEqual({
      checked: true
    });
    expect(historyFilterSelected(renderer, "history-attention-flag-unclear")).toBe(true);
    expect(historyFilterSelected(renderer, "history-attention-flag-in-review")).toBe(true);
    expect(historyFilterSelected(renderer, "history-attention-flag-incomplete")).toBe(true);
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toBe(
      "7 days·All puzzles·Source: Sprint"
    );
    expect(findByTestId(renderer, "history-attempt-history-wrong")).toBeTruthy();
    expect(findByTestId(renderer, "history-attempt-history-timeout")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-history-clean")).toThrow();
    expect(hasStyleEntry(
      findByTestId(renderer, "history-source-sprint"),
      "backgroundColor",
      "#2563EB"
    )).toBe(true);

    press(renderer, "history-attention-all");
    expect(findByTestId(renderer, "history-attention-all").props.accessibilityState).toEqual({
      checked: true
    });
    expect(findByTestId(renderer, "history-attention-needs-attention").props.accessibilityState).toEqual({
      checked: false
    });
    expect(historyFilterSelected(renderer, "history-attention-flag-unclear")).toBe(false);
    expect(historyFilterSelected(renderer, "history-attention-flag-in-review")).toBe(false);
    expect(historyFilterSelected(renderer, "history-attention-flag-incomplete")).toBe(false);
    expect(findByTestId(renderer, "history-attempt-history-clean")).toBeTruthy();

    press(renderer, "history-attention-needs-attention");
    expect(historyFilterSelected(renderer, "history-attention-flag-unclear")).toBe(true);
    expect(historyFilterSelected(renderer, "history-attention-flag-in-review")).toBe(true);
    expect(historyFilterSelected(renderer, "history-attention-flag-incomplete")).toBe(true);
    expect(() => findByTestId(renderer, "history-attempt-history-clean")).toThrow();
  });

  it("keeps Needs attention Sprint-only and makes Review attempts an explicit All-history choice", () => {
    const store = new MemoryStore();
    store.seedPuzzles([sharedHistoryPuzzle()]);
    store.recordAttempt({
      id: "original-sprint-mistake",
      source: "sprint",
      sessionId: "original-sprint-session",
      puzzleId: "shared-history",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "wrong",
      submittedMove: "e2e3",
      expectedMove: "e2e4",
      startedAt: "2026-07-17T11:59:55.000Z",
      completedAt: "2026-07-17T12:00:00.000Z",
      ratingBefore: 600
    });
    store.recordAttempt({
      id: "correct-review-attempt",
      source: "scheduled_review",
      sessionId: "correct-review-session",
      puzzleId: "shared-history",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e2e4",
      expectedMove: "e2e4",
      startedAt: "2026-07-17T12:01:55.000Z",
      completedAt: "2026-07-17T12:02:00.000Z",
      ratingBefore: 600
    });
    store.scheduleMistakeReview({
      puzzleId: "shared-history",
      mode: "standard",
      ratingKey: "standard 5/20"
    }, "2026-07-17T12:02:00.000Z");
    const renderer = renderScreen({
      currentTimeMs: () => Date.parse("2026-07-17T12:03:00.000Z"),
      practiceService: new PracticeService(store)
    });

    press(renderer, "history-tab");

    expect(findByTestId(renderer, "history-attempt-original-sprint-mistake")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-correct-review-attempt")).toThrow();
    expect(collectText(findByTestId(renderer, "history-attention-explanation"))).toBe(
      "Needs attention includes Incomplete, Unclear, or In Review Sprint attempts."
    );

    press(renderer, "history-filter-toggle");
    expect(historyFilterSelected(renderer, "history-source-sprint")).toBe(true);
    press(renderer, "history-source-all");

    expect(findByTestId(renderer, "history-attention-all").props.accessibilityState).toEqual({
      checked: true
    });
    expect(() => findByTestId(renderer, "history-attention-explanation")).toThrow();
    expect(findByTestId(renderer, "history-attempt-original-sprint-mistake")).toBeTruthy();
    expect(findByTestId(renderer, "history-attempt-correct-review-attempt")).toBeTruthy();

    press(renderer, "history-attention-needs-attention");

    expect(historyFilterSelected(renderer, "history-source-sprint")).toBe(true);
    expect(findByTestId(renderer, "history-attempt-original-sprint-mistake")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-correct-review-attempt")).toThrow();

    press(renderer, "history-source-review");

    expect(findByTestId(renderer, "history-attention-all").props.accessibilityState).toEqual({
      checked: true
    });
    expect(findByTestId(renderer, "history-attempt-correct-review-attempt")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-original-sprint-mistake")).toThrow();

    press(renderer, "history-attention-needs-attention");

    expect(historyFilterSelected(renderer, "history-source-sprint")).toBe(true);
    expect(findByTestId(renderer, "history-attempt-original-sprint-mistake")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-correct-review-attempt")).toThrow();

    press(renderer, "history-attention-all");

    expect(historyFilterSelected(renderer, "history-source-sprint")).toBe(true);
    expect(findByTestId(renderer, "history-attempt-original-sprint-mistake")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-correct-review-attempt")).toThrow();
  });

  it("keeps Incomplete separate from Wrong and filters it as its own attention reason", async () => {
    const renderer = renderLabScenario("history-populated");
    await flushMicrotasks();

    press(renderer, "history-tab");
    press(renderer, "history-filter-toggle");
    press(renderer, "history-result-wrong");

    expect(findByTestId(renderer, "history-attempt-history-wrong")).toBeTruthy();
    expect(findByTestId(renderer, "history-attempt-history-timeout")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-history-incomplete-fast")).toThrow();
    expect(() => findByTestId(renderer, "history-attempt-history-incomplete-slow")).toThrow();

    press(renderer, "history-result-incomplete");

    expect(() => findByTestId(renderer, "history-attempt-history-wrong")).toThrow();
    expect(() => findByTestId(renderer, "history-attempt-history-timeout")).toThrow();
    expect(findByTestId(renderer, "history-attempt-history-incomplete-fast")).toBeTruthy();
    expect(findByTestId(renderer, "history-attempt-history-incomplete-slow")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-attempt-history-incomplete-fast-result"))).toBe(
      "Incomplete"
    );
    expect(() => findByTestId(renderer, "history-attempt-history-correct")).toThrow();
    expect(() => findByTestId(renderer, "history-attempt-history-clean")).toThrow();
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain(
      "Result: Incomplete"
    );

    press(renderer, "history-result-all");
    press(renderer, "history-attention-flag-unclear");
    press(renderer, "history-attention-flag-in-review");

    expect(historyFilterSelected(renderer, "history-attention-flag-incomplete")).toBe(true);
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain(
      "Attention: Incomplete"
    );
    expect(() => findByTestId(renderer, "history-attempt-history-timeout")).toThrow();
    expect(findByTestId(renderer, "history-attempt-history-incomplete-fast")).toBeTruthy();
    expect(findByTestId(renderer, "history-attempt-history-incomplete-slow")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-history-wrong")).toThrow();
  });

  it("shows direct rating validation and disables Save outside 600-2200", () => {
    const renderer = renderScreen({
      runManagementPresentation: runManagementPresentation({
        canSave: false,
        directRunEditing: true,
        draft: {
          id: "tactics-focus",
          name: "Tactics Focus",
          kind: "custom",
          mode: "custom",
          elo: 1040,
          durationSeconds: 600,
          perPuzzleSeconds: 30,
          puzzleTiming: { slowAfterSeconds: 60, timeoutAfterSeconds: 90 },
          themes: ["fork", "pin"]
        },
        eloError: "Enter a whole-number rating from 600 to 2200.",
        eloInput: "2201",
        screen: "edit"
      })
    });

    expect(collectText(findByTestId(renderer, "practice-run-elo-error"))).toBe(
      "Enter a whole-number rating from 600 to 2200."
    );
    expect(findByTestId(renderer, "practice-run-save").props.accessibilityState).toEqual({
      disabled: true
    });
    expect(findByTestId(renderer, "practice-run-elo-decrease").props.accessibilityState).toEqual({
      disabled: false
    });
    expect(findByTestId(renderer, "practice-run-elo-increase").props.accessibilityState).toEqual({
      disabled: true
    });
  });

  it("lets the Storybook clone move Settings rating ownership to run editors", () => {
    const renderer = renderScreen({ runEloEditingMovedToHome: true });

    press(renderer, "settings-tab");

    expect(findByTestId(renderer, "settings-about-section")).toBeTruthy();
    expect(() => findByTestId(renderer, "settings-profile-section")).toThrow();
    expect(() => findByTestId(renderer, "settings-standard-elo-row")).toThrow();
  });

  it("hides Add Run named themes behind a History-style disclosure", () => {
    const renderer = renderScreen({
      runManagementEnabled: true,
      themeCatalogPresentation: {
        groups: [
          { label: "Checkmates", themes: ["mateIn2"] },
          { label: "Piece tactics", themes: ["fork", "pin"] }
        ]
      }
    });

    press(renderer, "practice-add-run");

    expect(collectText(findByTestId(renderer, "practice-run-theme-selection-detail"))).toBe(
      "All themes"
    );
    expect(findByTestId(renderer, "practice-run-theme-disclosure").props.accessibilityState).toEqual({
      expanded: false
    });
    expect(findByTestId(renderer, "practice-run-theme-catalog-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });

    press(renderer, "practice-run-theme-disclosure");

    expect(findByTestId(renderer, "practice-run-theme-disclosure").props.accessibilityState).toEqual({
      expanded: true
    });
    expect(findByTestId(renderer, "custom-theme-mixed")).toBeTruthy();
    expect(findByTestId(renderer, "custom-theme-fork")).toBeTruthy();
    press(renderer, "custom-theme-fork");
    press(renderer, "custom-theme-pin");
    expect(collectText(findByTestId(renderer, "practice-run-theme-selection-detail"))).toBe(
      "Fork · Pin"
    );

    press(renderer, "practice-run-theme-disclosure");

    expect(findByTestId(renderer, "practice-run-theme-catalog-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });
    expect(collectText(findByTestId(renderer, "practice-run-theme-selection-detail"))).toBe(
      "Fork · Pin"
    );
  });

  it("creates a real saved Run with All themes without starting a sprint", () => {
    const service = createMobilePracticeService("random1000");
    const renderer = renderScreen({ practiceService: service, runManagementEnabled: true });

    expect(collectText(findByTestId(renderer, "practice-run-standard"))).toContain("Standard");
    expect(collectText(findByTestId(renderer, "practice-run-arrow-duel"))).toContain("Arrow Duel");
    press(renderer, "practice-add-run");
    expect(collectText(findByTestId(renderer, "practice-run-theme-row"))).toContain("All");
    act(() => {
      findByTestId(renderer, "practice-run-name-input").props.onChangeText("Calculation Lab");
    });
    press(renderer, "practice-run-save");

    const saved = service.listPracticeRuns().find((run) => run.name === "Calculation Lab");
    expect(saved).toMatchObject({ archived: false, mode: "custom" });
    expect(saved?.themes).toBeUndefined();
    expect(service.getActiveSprint()).toBeUndefined();
    expect(collectText(findByTestId(renderer, `practice-run-${saved?.id}`))).toContain("Calculation Lab");

    press(renderer, "settings-tab");
    expect(() => findByTestId(renderer, "settings-standard-elo-row")).toThrow();
  });

  it("lets a new Arrow Duel Run inherit the global default, then edits its reply setting", () => {
    const service = createMobilePracticeService("random1000");
    const renderer = renderScreen({ practiceService: service, runManagementEnabled: true });

    press(renderer, "practice-add-run");
    press(renderer, "custom-mode-arrow-duel");
    expect(() => findByTestId(renderer, "practice-run-arrow-duel-reply-setting")).toThrow();
    act(() => {
      findByTestId(renderer, "practice-run-name-input").props.onChangeText("Reply Drill");
    });
    press(renderer, "practice-run-save");

    const created = service.listPracticeRuns().find((run) => run.name === "Reply Drill");
    expect(created?.opponentReply).toEqual({ enabled: true, seconds: 10 });
    expect(created?.ratingKey).toBe(`run:${created?.id}`);

    press(renderer, "practice-run-home-edit");
    press(renderer, `practice-run-edit-${created?.id}`);
    act(() => {
      findByTestId(renderer, "practice-run-arrow-duel-reply-seconds").props.onChangeText("8");
    });
    press(renderer, "practice-run-arrow-duel-reply-toggle");
    press(renderer, "practice-run-save");

    const updated = service.getActivePracticeRun(created!.id);
    expect(updated.opponentReply).toEqual({ enabled: false, seconds: 8 });
    expect(updated.ratingKey).toBe(created?.ratingKey);
  });

  it("offers the web timing range and customizable linked defaults when adding a Run", () => {
    const service = createMobilePracticeService("random1000");
    const renderer = renderScreen({ practiceService: service, runManagementEnabled: true });

    press(renderer, "practice-add-run");
    expect(collectText(findByTestId(renderer, "practice-run-slow-warning-value"))).toBe("0:40");
    expect(collectText(findByTestId(renderer, "practice-run-puzzle-timeout-value"))).toBe("1:00");
    expect(findByTestId(renderer, "practice-run-slow-warning-toggle").props.accessibilityState)
      .toEqual({ checked: true });
    expect(findByTestId(renderer, "practice-run-puzzle-timeout-toggle").props.accessibilityState)
      .toEqual({ checked: true });

    for (let step = 0; step < 5; step += 1) {
      press(renderer, "practice-run-duration-stepper-increase");
    }
    expect(collectText(findByTestId(renderer, "practice-run-editor-fields"))).toContain("30m");

    for (let step = 0; step < 3; step += 1) {
      press(renderer, "practice-run-per-puzzle-stepper-decrease");
    }
    expect(collectText(findByTestId(renderer, "practice-run-editor-fields"))).toContain("5 sec");
    expect(collectText(findByTestId(renderer, "practice-run-slow-warning-value"))).toBe("0:10");
    expect(collectText(findByTestId(renderer, "practice-run-puzzle-timeout-value"))).toBe("0:15");

    for (let step = 0; step < 5; step += 1) {
      press(renderer, "practice-run-per-puzzle-stepper-increase");
    }
    expect(collectText(findByTestId(renderer, "practice-run-editor-fields"))).toContain("60 sec");
    expect(collectText(findByTestId(renderer, "practice-run-slow-warning-value"))).toBe("2:00");
    expect(collectText(findByTestId(renderer, "practice-run-puzzle-timeout-value"))).toBe("3:00");

    press(renderer, "practice-run-slow-warning-decrease");
    press(renderer, "practice-run-puzzle-timeout-toggle");
    act(() => {
      findByTestId(renderer, "practice-run-name-input").props.onChangeText("Long Calculation");
    });
    press(renderer, "practice-run-save");

    expect(service.listPracticeRuns().find((run) => run.name === "Long Calculation"))
      .toMatchObject({
        durationSeconds: 30 * 60,
        perPuzzleSeconds: 60,
        puzzleTiming: {
          slowAfterSeconds: 115,
          timeoutAfterSeconds: null
        }
      });
  });

  it("blocks a New Run with no matching local puzzles and keeps its setup editable", () => {
    const service = new PracticeService(new MemoryStore());
    const renderer = renderScreen({ practiceService: service, runManagementEnabled: true });

    press(renderer, "practice-add-run");
    act(() => {
      findByTestId(renderer, "practice-run-name-input").props.onChangeText("Unavailable Run");
    });

    expect(findByTestId(renderer, "practice-run-save").props.accessibilityState).toEqual({ disabled: true });
    expect(collectText(findByTestId(renderer, "practice-run-availability-error"))).toContain(
      "Choose different themes or settings"
    );
    expect(findByTestId(renderer, "practice-run-theme-row")).toBeTruthy();
    expect(service.listPracticeRuns().some((run) => run.name === "Unavailable Run")).toBe(false);
  });

  it("returns a managed Run editor to Home through Android system Back", () => {
    const systemBack = createTestSystemBackSource("android");
    const renderer = renderScreen({ runManagementEnabled: true, systemBack });

    press(renderer, "practice-add-run");
    expect(findByTestId(renderer, "practice-run-editor")).toBeTruthy();
    expect(systemBack.setPredictiveBackEnabled).toHaveBeenLastCalledWith(true);
    expect(systemBack.invoke()).toBe(true);
    expect(() => findByTestId(renderer, "practice-run-editor")).toThrow();
    expect(findByTestId(renderer, "practice-run-management")).toBeTruthy();
    expect(systemBack.setPredictiveBackEnabled).toHaveBeenLastCalledWith(false);
  });

  it("persists Run name, rating, and puzzle timing edits without changing the rating key", () => {
    const service = createMobilePracticeService("random1000");
    const renderer = renderScreen({ practiceService: service, runManagementEnabled: true });

    press(renderer, "practice-run-home-edit");
    press(renderer, "practice-run-edit-standard");
    expect(collectText(findByTestId(renderer, "practice-run-editor-title"))).toBe("Edit Run");
    expect(findByTestId(renderer, "practice-run-name-input").props.value).toBe("Standard");
    expect(findByTestId(renderer, "practice-run-elo-input").props.value).toBe("600");
    expect(collectText(findByTestId(renderer, "practice-run-slow-warning-value"))).toBe("0:40");
    expect(collectText(findByTestId(renderer, "practice-run-puzzle-timeout-value"))).toBe("1:00");
    press(renderer, "practice-run-slow-warning-decrease");
    press(renderer, "practice-run-puzzle-timeout-toggle");
    expect(collectText(findByTestId(renderer, "practice-run-slow-warning-value"))).toBe("0:35");
    expect(findByTestId(renderer, "practice-run-puzzle-timeout-toggle").props.accessibilityState)
      .toEqual({ checked: false });
    act(() => {
      findByTestId(renderer, "practice-run-name-input").props.onChangeText("Morning Warm-up");
      findByTestId(renderer, "practice-run-elo-input").props.onChangeText("1375");
    });
    press(renderer, "practice-run-save");

    expect(collectText(findByTestId(renderer, "practice-header-title"))).toBe("Edit Runs");
    expect(service.getActivePracticeRun("standard")).toMatchObject({
      id: "standard",
      name: "Morning Warm-up",
      mode: "standard",
      ratingKey: "standard 5/20",
      puzzleTiming: {
        slowAfterSeconds: 35,
        timeoutAfterSeconds: null
      }
    });
    expect(service.getRating("standard 5/20")).toMatchObject({ generation: 1, rating: 1375 });
    expect(collectText(findByTestId(renderer, "practice-run-standard"))).toContain("Morning Warm-up");
    expect(collectText(findByTestId(renderer, "practice-run-standard"))).toContain("1375");
    expect(collectText(findByTestId(renderer, "practice-run-standard"))).not.toContain("Rating");
    press(renderer, "practice-run-home-done");
    expect(findByTestId(renderer, "practice-run-select-standard").props.accessibilityLabel).toContain(
      "rating 1375"
    );
  });

  it("blocks duplicate Run names and out-of-range direct rating without changing saved data", () => {
    const service = createMobilePracticeService("random1000");
    service.createPracticeRun({
      id: "tactics-focus",
      name: "Tactics Focus",
      mode: "custom",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      initialRating: 900
    });
    const renderer = renderScreen({ practiceService: service, runManagementEnabled: true });

    press(renderer, "practice-run-home-edit");
    press(renderer, "practice-run-edit-standard");
    act(() => {
      findByTestId(renderer, "practice-run-name-input").props.onChangeText("Tactics Focus");
      findByTestId(renderer, "practice-run-elo-input").props.onChangeText("2201");
    });

    expect(collectText(findByTestId(renderer, "practice-run-elo-error"))).toBe(
      "Enter a whole-number rating from 600 to 2200."
    );
    expect(findByTestId(renderer, "practice-run-save").props.accessibilityState).toEqual({
      disabled: true
    });
    expect(service.getActivePracticeRun("standard").name).toBe("Standard");
    expect(service.getRating("standard 5/20").rating).toBe(600);

    act(() => {
      findByTestId(renderer, "practice-run-elo-input").props.onChangeText("1300");
    });
    press(renderer, "practice-run-save");

    expect(collectText(findByTestId(renderer, "practice-run-name-error"))).toBe(
      "That name is already in use. Choose a unique name."
    );
    expect(service.getActivePracticeRun("standard").name).toBe("Standard");
    expect(service.getRating("standard 5/20").rating).toBe(600);
  });

  it("archives a Run and restores its rating and weekly progress as the active selection", () => {
    const store = new MemoryStore();
    store.saveRating({ key: "standard 5/20", generation: 0, rating: 1000, games: 1 });
    store.saveRating({ key: "arrow_duel 5/30", generation: 0, rating: 900, games: 1 });
    store.createSprintSession(completedRatingSprintState({
      id: "standard-weekly-progress",
      mode: "standard",
      completedAt: "2026-07-24T11:00:00.000Z",
      ratingBefore: 900,
      ratingAfter: 1000
    }));
    store.createSprintSession(completedRatingSprintState({
      id: "arrow-duel-weekly-progress",
      mode: "arrow_duel",
      completedAt: "2026-07-24T11:01:00.000Z",
      ratingBefore: 900,
      ratingAfter: 900
    }));
    const service = new PracticeService(store);
    const renderer = renderScreen({
      currentTimeMs: () => Date.parse("2026-07-24T12:00:00.000Z"),
      practiceService: service,
      runManagementEnabled: true
    });

    expect(collectText(findByTestId(renderer, "practice-progress-rating-delta"))).toBe("+100 this week");

    press(renderer, "practice-run-home-edit");
    press(renderer, "practice-run-remove-standard");
    expect(findByTestId(renderer, "practice-run-remove-confirmation")).toBeTruthy();
    press(renderer, "practice-run-remove-confirm");

    expect(() => findByTestId(renderer, "practice-run-standard")).toThrow();
    expect(service.listPracticeRuns().find((run) => run.id === "standard")?.archived).toBe(true);
    expect(service.getRating("standard 5/20").rating).toBe(1000);
    expect(collectText(findByTestId(renderer, "practice-progress-rating-delta"))).toBe("+0 this week");
    press(renderer, "practice-run-restore-standard");

    expect(findByTestId(renderer, "practice-run-standard")).toBeTruthy();
    expect(service.listPracticeRuns().filter((run) => !run.archived).at(-1)?.id).toBe("standard");
    expect(service.getRating("standard 5/20").rating).toBe(1000);
    expect(collectText(findByTestId(renderer, "practice-progress-rating-delta"))).toBe("+100 this week");
  });

  it("starts the selected saved Run with its stable identity snapshot", () => {
    const service = createMobilePracticeService("random1000");
    const renderer = renderScreen({
      practiceService: service,
      puzzleSelectionSeed: "managed-run-start",
      runManagementEnabled: true
    });

    press(renderer, "practice-run-select-arrow-duel");
    press(renderer, "practice-run-start");
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(service.getActiveSprint()?.run).toEqual({
      id: "arrow-duel",
      kind: "arrow_duel",
      name: "Arrow Duel"
    });
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
  });

  it("plays a completed saved Custom Run again with its stable identity and configuration", async () => {
    const service = createMobilePracticeService();
    service.loadFixturePuzzles([androidPracticeFixture.puzzle as Puzzle]);
    const run = service.createPracticeRun({
      id: "repeat-custom",
      name: "Repeat Custom",
      mode: "custom",
      durationSeconds: 180,
      perPuzzleSeconds: 30,
      targetCorrect: 1,
      maxMistakes: 2,
      themes: ["backRankMate"],
      initialRating: 900
    });
    const renderer = renderScreen({
      practiceService: service,
      puzzleSelectionId: androidPracticeFixture.puzzle.id,
      puzzleSelectionSeed: androidPracticeFixture.puzzleSelectionSeed,
      runManagementEnabled: true
    });

    press(renderer, `practice-run-select-${run.id}`);
    press(renderer, "practice-run-start");
    expect(service.getActiveSprint()).toMatchObject({
      config: {
        durationSeconds: 180,
        perPuzzleSeconds: 30,
        ratingKey: run.ratingKey,
        themes: ["backRankMate"]
      },
      run: { id: run.id, kind: "custom", name: run.name }
    });

    await boardMove(renderer, androidPracticeFixture.userMoves[0]);
    await settleFeedbackSnapshot();
    await boardMove(renderer, androidPracticeFixture.userMoves[1]);
    await settleFeedbackSnapshot();
    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();

    press(renderer, "play-again-button");

    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-timer"))).toBe("03:00");
    expect(service.getActiveSprint()).toMatchObject({
      status: "active",
      config: {
        durationSeconds: 180,
        perPuzzleSeconds: 30,
        ratingKey: run.ratingKey,
        themes: ["backRankMate"]
      },
      run: { id: run.id, kind: "custom", name: run.name }
    });
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
    expect(collectText(findByTestId(renderer, "history-tab-icon"))).toBe("");
    expect(hasStyleEntry(findByTestId(renderer, "practice-tab-icon"), "backgroundColor", "#DBEAFE")).toBe(false);
    expect(findByTestId(renderer, "practice-tab-target-outer")).toBeTruthy();
    expect(findByTestId(renderer, "practice-tab-target-inner")).toBeTruthy();
    expect(findByTestId(renderer, "history-tab-clock-outline")).toBeTruthy();
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
    expect(collectText(findByTestId(renderer, "practice-mode-custom"))).not.toContain("Rating");
    expect(findByTestId(renderer, "practice-mode-custom").props.accessibilityLabel).toBe("Open Custom sprint setup, Configure time, theme, and rating");
    expect(findByTestId(renderer, "practice-start-button")).toBeTruthy();
    expect(findByTestId(renderer, "practice-start-button").props.accessibilityRole).toBe("button");
    expect(findByTestId(renderer, "practice-start-button").props.accessibilityLabel).toBe("Start Standard sprint");
    expect(collectText(findByTestId(renderer, "practice-start-button"))).toBe("Start");
    expect(flattenTestStyle(findByTestId(renderer, "practice-action-header").props.style).minHeight).toBe(40);
    expect(flattenTestStyle(findByTestId(renderer, "practice-header-title").props.style).fontSize).toBe(17);
    expect(flattenTestStyle(findByTestId(renderer, "practice-header-title").props.style).textAlign).toBe("left");
    expect(flattenTestStyle(findByTestId(renderer, "practice-start-button").props.style).height).toBe(40);
    expect(findByTestId(renderer, "practice-mode-standard-details").props.accessibilityLabel).toBe("5 min · 20s pace · Rating 600");
    expect(findByTestId(renderer, "practice-mode-arrow-duel-details").props.accessibilityLabel).toBe("5 min · 30s pace · Rating 600");
    expect(collectText(findByTestId(renderer, "practice-mode-standard-rating"))).toBe("Rating 600");
    expect(collectText(findByTestId(renderer, "practice-mode-standard"))).toContain("Find the best move");
    expect(collectText(findByTestId(renderer, "practice-mode-standard"))).not.toContain("Find the best move · 5 min");
    expect(collectText(findByTestId(renderer, "practice-mode-arrow-duel"))).toContain("Choose the best move");
    expect(collectText(findByTestId(renderer, "practice-mode-arrow-duel"))).not.toContain("Choose the best move · 5 min");
    expect(collectText(findByTestId(renderer, "practice-mode-custom"))).toContain("Time, theme, rating");
    expect(collectText(findByTestId(renderer, "practice-mode-custom"))).not.toContain("Time, theme, rating · 5 min");
    expect(findByTestId(renderer, "practice-mode-standard").props.accessibilityLabel).toBe("Select Standard mode, 5 min · 20s pace · Rating 600");
    expect(findByTestId(renderer, "practice-mode-arrow-duel").props.accessibilityLabel).toBe("Select Arrow Duel mode, 5 min · 30s pace · Rating 600");
    expect(() => findByTestId(renderer, "rating-label")).toThrow();
    expect(collectText(renderer.root)).not.toContain("Target 15");
    expect(collectText(renderer.root)).not.toContain("standard 5/20");
    expectText(renderer, "Rating 600");
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
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toContain(
      "Standard rating 600, No rating change"
    );
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toContain("No attempts yet");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-context"))).toBe("No attempts yet");
    expect(hasStyleEntry(findByTestId(renderer, "practice-progress-weekly-delta"), "color", "#64748B")).toBe(true);
    expect(() => findByTestId(renderer, "practice-review-strip")).toThrow();
    expect(findByTestId(renderer, "review-tab")).toBeTruthy();
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
    expect(collectText(findByTestId(renderer, "practice-progress-rating-metric"))).toContain("Arrow Duel rating");
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

  it("keeps due status in the dedicated Review tab without duplicating a Practice Home card", () => {
    const service = createDueReviewService(1);
    const dueDay = service.listReviewQueue()[0]!.dueDay;
    jest.setSystemTime(new Date(`${dueDay}T12:00:00.000Z`));
    const renderer = renderScreen({ practiceService: service });

    expect(() => findByTestId(renderer, "practice-review-strip")).toThrow();
    expect(collectText(findByTestId(renderer, "review-tab-badge"))).toBe("1");
    press(renderer, "review-tab");
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("0 / 1");
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

  it("keeps first-select Arrow Duel progress on its own rating after startup sync completes", async () => {
    const service = createMobilePracticeService("familiar15");
    service.setRating(defaultSprintConfig("standard").ratingKey, 1_106);
    service.setRating(defaultSprintConfig("arrow_duel").ratingKey, 775);
    let resolveAccountStatus: (() => void) | undefined;
    const client = new FakeICloudProgressSyncClient();
    client.getAccountStatus = () => new Promise<"available">((resolve) => {
        resolveAccountStatus = () => resolve("available");
      });
    const renderer = renderScreen({
      practiceService: service,
      iCloudProgressSyncClient: client
    });

    press(renderer, "practice-mode-arrow-duel");
    expect(collectText(findByTestId(renderer, "practice-mode-arrow-duel-rating"))).toBe("Rating 775");
    expect(collectText(findByTestId(renderer, "practice-progress-rating-metric"))).toContain("Arrow Duel rating775");

    await act(async () => {
      resolveAccountStatus?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(collectText(findByTestId(renderer, "practice-progress-rating-metric"))).toContain("Arrow Duel rating775");
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

  it("scopes managed Home progress to the selected Custom Run rating bucket", () => {
    const store = new MemoryStore();
    store.seedPuzzles([sharedHistoryPuzzle()]);
    const service = new PracticeService(store);
    const customRun = service.createPracticeRun({
      id: "calculation-lab",
      name: "Calculation Lab",
      mode: "custom",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      initialRating: 1000
    }, "2026-07-07T00:00:00.000Z");
    store.createSprintSession({
      ...completedRatingSprintState({
        id: "managed-custom-session",
        mode: "custom",
        completedAt: "2026-07-07T00:02:00.000Z",
        ratingBefore: 800,
        ratingAfter: 1000
      }),
      config: practiceRunSprintConfig(customRun),
      run: { id: customRun.id, kind: customRun.kind, name: customRun.name }
    });
    for (const [index, result] of (["correct", "wrong"] as const).entries()) {
      store.recordAttempt({
        id: `managed-custom-attempt-${index}`,
        source: "sprint",
        sessionId: "managed-custom-session",
        puzzleId: "shared-history",
        mode: "custom",
        ratingKey: customRun.ratingKey,
        result,
        submittedMove: "e2e4",
        expectedMove: result === "correct" ? "e2e4" : "e2e3",
        startedAt: `2026-07-07T00:01:0${index}.000Z`,
        completedAt: `2026-07-07T00:01:1${index}.000Z`,
        ratingBefore: 800
      });
    }

    const renderer = renderScreen({
      currentTimeMs: () => Date.parse("2026-07-08T12:00:00.000Z"),
      practiceService: service,
      runManagementEnabled: true
    });
    press(renderer, "practice-run-select-calculation-lab");

    expect(collectText(findByTestId(renderer, "practice-progress-rating-metric"))).toContain("Calculation Lab rating1000");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-solved"))).toBe("1");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-context"))).toBe("50% accuracy · 1 mistake");
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
    { label: "iPhone SE-sized portrait", width: 320, height: 568, scale: 2, layout: "compactPortrait", boardSize: 204, sideRail: false, railWidth: null, sessionRail: false, homeColumns: false },
    { label: "modern iPhone portrait", width: 430, height: 932, scale: 3, layout: "compactPortrait", boardSize: 398, sideRail: false, railWidth: null, sessionRail: false, homeColumns: false },
    { label: "compact wide-short window", width: 844, height: 390, scale: 3, layout: "compactLandscape", boardSize: 358, sideRail: true, railWidth: 64, sessionRail: true, homeColumns: false },
    { label: "iPad-on-Mac wide-short window", width: 993, height: 346, scale: 2, layout: "compactLandscape", boardSize: 314, sideRail: true, railWidth: 168, sessionRail: true, homeColumns: true },
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
    expect(() => findByTestId(renderer, "practice-review-strip")).toThrow();
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
    expect(flattenTestStyle(findByTestId(renderer, "chessboard-king-white-sprite").props.style).width)
      .toBe(Math.round(boardSize / 8) * 6);
    expect(flattenTestStyle(findByTestId(renderer, "practice-prompt-icon").props.style).width)
      .toBe(Math.round(boardSize / 8));
    if (sessionRail) {
      expect(findByTestId(renderer, "active-session-adaptive-layout")).toBeTruthy();
      expect(findByTestId(renderer, "active-session-board-lane")).toBeTruthy();
      expect(findByTestId(renderer, "active-session-control-rail")).toBeTruthy();
    } else {
      expect(() => findByTestId(renderer, "active-session-adaptive-layout")).toThrow();
    }
  });

  it("keeps expanded navigation labels on one line in an iPad-on-Mac wide-short window", () => {
    (ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: { fontScale: number; height: number; scale: number; width: number }) => void;
    }).__setWindowDimensions?.({ width: 993, height: 346, scale: 2, fontScale: 1 });

    const renderer = renderScreen({ practiceService: createMobilePracticeService("random1000") });

    for (const testID of ["practice-tab", "review-tab", "history-tab", "settings-tab"]) {
      const label = findByTestId(renderer, `${testID}-label`);
      expect(label.props.numberOfLines).toBe(1);
    }
  });

  it("resets Practice stack direction and column widths across a live resize", () => {
    const windowDimensions = ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: {
        fontScale: number;
        height: number;
        scale: number;
        width: number;
      }) => void;
    };
    windowDimensions.__setWindowDimensions?.({ width: 1180, height: 820, scale: 2, fontScale: 1 });
    const renderer = renderScreen({ practiceService: createMobilePracticeService("random1000") });

    act(() => {
      windowDimensions.__setWindowDimensions?.({ width: 820, height: 1180, scale: 2, fontScale: 1 });
    });
    expect(flattenTestStyle(findByTestId(renderer, "practice-home-layout").props.style).flexDirection)
      .toBe("column");
    expect(flattenTestStyle(findByTestId(renderer, "practice-home-primary-column").props.style).width)
      .toBe("100%");
    expect(flattenTestStyle(findByTestId(renderer, "practice-home-secondary-column").props.style).width)
      .toBe("100%");

    act(() => {
      windowDimensions.__setWindowDimensions?.({ width: 1180, height: 820, scale: 2, fontScale: 1 });
    });
    expect(flattenTestStyle(findByTestId(renderer, "practice-home-layout").props.style).flexDirection)
      .toBe("row");
    expect(flattenTestStyle(findByTestId(renderer, "practice-home-primary-column").props.style)).toMatchObject({
      flexBasis: 0,
      flexGrow: 1.1,
      flexShrink: 1,
      width: "auto"
    });
    expect(flattenTestStyle(findByTestId(renderer, "practice-home-secondary-column").props.style)).toMatchObject({
      flexBasis: 0,
      flexGrow: 0.9,
      flexShrink: 1,
      width: "auto"
    });
  });

  it("does not constrain compact bottom-navigation labels to one line", () => {
    (ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: { fontScale: number; height: number; scale: number; width: number }) => void;
    }).__setWindowDimensions?.({ width: 430, height: 932, scale: 3, fontScale: 1 });

    const renderer = renderScreen({ practiceService: createMobilePracticeService("random1000") });

    expect(findByTestId(renderer, "practice-tab-label").props.numberOfLines).toBeUndefined();
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

  it("keeps the iPad landscape board lane clear by moving the prompt and Unclear into the session rail", async () => {
    (ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: { fontScale: number; height: number; scale: number; width: number }) => void;
    }).__setWindowDimensions?.({ width: 1180, height: 820, scale: 2, fontScale: 1 });

    const renderer = renderScreen({ practiceService: createMobilePracticeService("random1000") });
    startStandardSprint(renderer);

    expect(findByTestId(renderer, "adaptive-layout").props.accessibilityLabel)
      .toBe("Layout regularLandscape");
    expect(findByTestId(renderer, "active-session-control-rail").findByProps({ testID: "practice-prompt" }))
      .toBeTruthy();
    expect(() => findByTestId(renderer, "active-session-board-lane").findByProps({ testID: "practice-prompt" }))
      .toThrow();

    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");

    const railTestIDs = collectTestIds(findByTestId(renderer, "active-session-control-rail"));
    expect(railTestIDs).toContain("sprint-unclear-prompt");
    expect(railTestIDs.indexOf("practice-prompt")).toBeLessThan(railTestIDs.indexOf("sprint-unclear-prompt"));
    expect(railTestIDs.indexOf("session-score-strip")).toBeLessThan(railTestIDs.indexOf("sprint-unclear-prompt"));
    expect(() => findByTestId(renderer, "active-session-board-lane").findByProps({ testID: "sprint-unclear-prompt" }))
      .toThrow();
  });

  it("keeps the complete compact wide-short session chrome publicly reachable", () => {
    (ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: { fontScale: number; height: number; scale: number; width: number }) => void;
    }).__setWindowDimensions?.({ width: 956, height: 440, scale: 3, fontScale: 1 });
    (SafeAreaContext as unknown as {
      __setSafeAreaInsets?: (insets: { bottom: number; left: number; right: number; top: number }) => void;
    }).__setSafeAreaInsets?.({ top: 0, right: 62, bottom: 21, left: 62 });

    const renderer = renderScreen({ practiceService: createMobilePracticeService("random1000") });
    startStandardSprint(renderer);

    expect(findByTestId(renderer, "adaptive-layout").props.accessibilityLabel)
      .toBe("Layout compactLandscape");
    const controlRail = findByTestId(renderer, "active-session-control-rail");
    expect(collectText(controlRail)).toContain("Find the best move");
    expect(collectText(controlRail)).toContain("For ");
    expect(controlRail.findByProps({ testID: "session-score-strip" }).props.accessibilityLabel)
      .toBe("Session score: solved 0, mistakes 0, left 15");
    expect(controlRail.findByProps({ testID: "session-score-solved" }).props.accessibilityLabel)
      .toBe("Solved 0");
    expect(controlRail.findByProps({ testID: "session-score-mistakes" }).props.accessibilityLabel)
      .toBe("Mistakes 0");
    expect(controlRail.findByProps({ testID: "session-score-left" }).props.accessibilityLabel)
      .toBe("Left 15");
  });

  it.each([
    {
      height: 402,
      insets: { top: 0, right: 62, bottom: 21, left: 62 },
      label: "compact wide-short resizable window",
      scale: 3,
      width: 874
    },
    {
      height: 834,
      insets: { top: 0, right: 0, bottom: 20, left: 0 },
      label: "11-inch iPad landscape",
      scale: 2,
      width: 1210
    }
  ])("keeps active Review in the Sprint board-left layout on $label", ({
    height,
    insets,
    scale,
    width
  }: {
    height: number;
    insets: PracticeSafeAreaInsets;
    label: string;
    scale: number;
    width: number;
  }) => {
    setPracticeViewport({ width, height, scale, insets });

    const expectedLayout = buildPracticeAdaptiveLayout({
      fontScale: 1,
      height,
      insets,
      width
    });
    const sprintRenderer = renderScreen({
      practiceService: createMobilePracticeService("familiar15")
    });
    startStandardSprint(sprintRenderer);
    const sprintPromptStyle = flattenTestStyle(
      findByTestId(sprintRenderer, "practice-prompt").props.style
    );
    const sprintBoardSize = Number(
      flattenTestStyle(findByTestId(sprintRenderer, "session-board").props.style).width
    );

    const reviewRenderer = renderScreen({
      currentTimeMs: () => Date.parse("2026-06-20T12:00:00.000Z"),
      practiceService: createDueReviewService(1)
    });
    press(reviewRenderer, "review-tab");
    press(reviewRenderer, "review-start-due");

    const reviewLayout = findByTestId(reviewRenderer, "review-session-adaptive-layout");
    const boardLane = findByTestId(reviewRenderer, "review-session-board-lane");
    const controlRail = findByTestId(reviewRenderer, "review-session-control-rail");
    const boardStyle = flattenTestStyle(findByTestId(reviewRenderer, "review-board").props.style);
    const layoutStyle = flattenTestStyle(reviewLayout.props.style);
    const boardLaneStyle = flattenTestStyle(boardLane.props.style);
    const controlRailStyle = flattenTestStyle(controlRail.props.style);
    const reviewPromptStyle = flattenTestStyle(
      findByTestId(reviewRenderer, "practice-prompt").props.style
    );

    expect(boardStyle.width).toBe(sprintBoardSize);
    expect(boardStyle.height).toBe(sprintBoardSize);
    expect(layoutStyle.width).toBe(expectedLayout.sessionPackedRowWidth);
    expect(layoutStyle.gap).toBe(expectedLayout.sessionRailGap);
    expect(boardLaneStyle.width).toBe(sprintBoardSize);
    expect(controlRailStyle.width).toBe(expectedLayout.sessionRailWidth);
    expect(controlRailStyle.height).toBe(sprintBoardSize);
    expect(sprintPromptStyle.minHeight).toBeUndefined();
    expect(sprintPromptStyle.height).toBe(expectedLayout.promptFrameHeight);
    expect(reviewPromptStyle.minHeight).toBeUndefined();
    expect(reviewPromptStyle.height).toBe(expectedLayout.promptFrameHeight);
    expect(sprintBoardSize + 2 * PRACTICE_UI_PADDING)
      .toBeLessThanOrEqual(expectedLayout.contentHeight);
    expect(findByTestId(reviewRenderer, "practice-main-scroll").props.scrollEnabled).toBe(false);
    expect(controlRail.findByProps({ testID: "review-header" })).toBeTruthy();
    expect(controlRail.findByProps({ testID: "review-context-strip" })).toBeTruthy();
    expect(controlRail.findByProps({ testID: "practice-prompt" })).toBeTruthy();
    expect(() => boardLane.findByProps({ testID: "review-header" })).toThrow();
    expect(() => boardLane.findByProps({ testID: "review-context-strip" })).toThrow();
    expect(() => boardLane.findByProps({ testID: "practice-prompt" })).toThrow();
    expect(boardLane.findByProps({ testID: "review-board" })).toBeTruthy();
  });

  it("keeps the Review board fixed while resizing into its unobstructed wide-short lane", () => {
    setPracticeViewport({
      width: 402,
      height: 874,
      scale: 3,
      insets: { top: 62, right: 0, bottom: 34, left: 0 }
    });

    const renderer = renderScreen({
      currentTimeMs: () => Date.parse("2026-06-20T12:00:00.000Z"),
      practiceService: createDueReviewService(1)
    });
    press(renderer, "review-tab");
    press(renderer, "review-start-due");

    const portraitBoardLabel = findByTestId(renderer, "review-board").props.accessibilityLabel;
    const portraitCoordinates = collectText(findByTestId(renderer, "board-coordinate-overlay"));

    expect(findByTestId(renderer, "review-session-stacked-layout")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-session-control-rail")).toThrow();
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);
    expect(testIdOrder(renderer, "review-header", "review-board")).toBeLessThan(0);
    expect(testIdOrder(renderer, "practice-prompt", "review-board")).toBeLessThan(0);

    act(() => {
      setPracticeViewport({
        width: 874,
        height: 402,
        scale: 3,
        insets: { top: 0, right: 62, bottom: 21, left: 62 }
      });
    });

    expect(findByTestId(renderer, "adaptive-layout").props.accessibilityLabel)
      .toBe("Layout compactLandscape");
    expect(findByTestId(renderer, "review-session-adaptive-layout")).toBeTruthy();
    expect(renderedTestIdCount(renderer, "review-board")).toBe(1);
    expect(renderedTestIdCount(renderer, "board-coordinate-overlay")).toBe(1);
    expect(findByTestId(renderer, "review-board").props.accessibilityLabel).toBe(portraitBoardLabel);
    expect(collectText(findByTestId(renderer, "board-coordinate-overlay"))).toBe(portraitCoordinates);
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(false);
    expect(findByTestId(renderer, "review-session-board-lane").findByProps({
      testID: "review-board"
    })).toBeTruthy();
    expect(findByTestId(renderer, "review-session-control-rail").findByProps({
      testID: "review-header"
    })).toBeTruthy();
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

  it("does not leave an empty analysis panel below the review board on an iPad in portrait", () => {
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
    expect(() => findByTestId(renderer, "review-analysis-panel")).toThrow();
  });

  it.each([
    { actionContainer: "review-context-actions-bottom", height: 932, label: "phone portrait", width: 430 },
    { actionContainer: "review-context-actions-rail", height: 390, label: "compact wide-short window", width: 844 },
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
    { label: "compact wide-short window", width: 844, height: 390 },
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
    const completedAt = new Date(Date.now() - 70_000).toISOString();
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
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toMatch(
      /Standard rating \d+, \+\d+ this week/
    );
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
    press(firstRenderer, "custom-theme-back-rank-mate");
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
    press(renderer, "custom-previous-custom-custom-180-30-backrankmate");

    expect(findByTestId(renderer, "custom-sprint-setup")).toBeTruthy();
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toContain("Custom rating 775");
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
    service.submitMove("c4b5", new Date(Date.now() - 110_000).toISOString());

    const renderer = renderScreen({ practiceService: service });

    expect(collectText(findByTestId(renderer, "practice-progress-weekly-solved"))).toBe("0");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-delta"))).toBe("-1 net");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-context"))).toBe("0% accuracy · 1 mistake");
    expect(collectText(findByTestId(renderer, "practice-progress-rating-delta"))).toBe("No rating change");
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toContain(
      "Standard rating 600, No rating change"
    );
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
    expect(testIdOrder(renderer, "practice-prompt", "session-board")).toBeLessThan(0);
    expect(testIdOrder(renderer, "session-board", "session-score-strip")).toBeLessThan(0);
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
    expect(findByTestId(renderer, "session-mistakes-block")).toBeTruthy();
    expect(findByTestId(renderer, "session-progress-block").props.accessibilityLabel).toBe("Progress 0 of 15");
    expect(findByTestId(renderer, "session-timer-block").props.accessibilityLabel).toContain("Timer");
    expect(() => findByTestId(renderer, "session-side-to-move-block")).toThrow();
    expect(() => findByTestId(renderer, "session-side-to-move")).toThrow();
    expect(styleEntryMatches(findByTestId(renderer, "session-progress-block").props.style, "flex", 1)).toBe(true);
    expect(styleEntryMatches(findByTestId(renderer, "session-timer-block").props.style, "flex", 1)).toBe(true);
    expect(styleEntryMatches(findByTestId(renderer, "session-mistakes-block").props.style, "flex", 1)).toBe(true);
    expect(findByTestId(renderer, "chessboard-king-white-sprite")).toBeTruthy();
    expect(findByTestId(renderer, "practice-prompt-side-glyph")).toBeTruthy();
    expect(flattenTestStyle(findByTestId(renderer, "chessboard-king-white-sprite").props.style).width).toBe(
      Math.round(Number(flattenTestStyle(findByTestId(renderer, "session-board").props.style).width) / 8) * 6
    );
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
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("Rating");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("0/3");
    expect(collectText(findByTestId(renderer, "session-progress"))).toBe("0 / 15");
    expect(styleEntryMatches(findByTestId(renderer, "session-progress").props.style, "fontSize", 21)).toBe(true);
    expect(styleEntryMatches(findByTestId(renderer, "practice-prompt").props.style, "borderWidth", 1)).toBe(true);
    expect(findByTestId(renderer, "practice-prompt-icon")).toBeTruthy();
    expectText(renderer, "Find the best move");
    expect(collectText(findByTestId(renderer, "practice-prompt"))).toContain("For white.");
  });

  it("locks Standard input on the first rendered frame until the blunder animation completes", async () => {
    const service = createMobilePracticeService("familiar15");
    service.saveSettings({
      ...service.getSettings(),
      moveFeedback: {
        soundEnabled: true,
        hapticsEnabled: true
      }
    });
    const moveFeedbackClient = new FakeMoveFeedbackClient();
    const renderer = renderScreen({ practiceService: service, moveFeedbackClient });

    press(renderer, "practice-mode-standard");
    press(renderer, "practice-start-button");

    const activePuzzle = activeSprintForTest(service).currentPuzzle;
    if (!activePuzzle || activePuzzle.kind !== "line") {
      throw new Error("Expected a line puzzle for the entry-preview regression");
    }
    const board = findByTestId(renderer, "mock-chessboard");
    const imperativeMove = board.props.mockImperativeMove as jest.Mock;

    expect(findByTestId(renderer, "board-input-blocker")).toBeTruthy();
    expect(board.props.fen).toBe(activePuzzle.puzzle.initialFen);
    expect(imperativeMove).not.toHaveBeenCalled();

    await advanceEntryPreviewBy(175);
    act(() => {
      (ReactNative as unknown as {
        __setWindowDimensions?: (dimensions: { fontScale: number; height: number; scale: number; width: number }) => void;
      }).__setWindowDimensions?.({ width: 429, height: 932, scale: 3, fontScale: 1 });
    });
    await advanceEntryPreviewBy(174);
    expect(findByTestId(renderer, "board-input-blocker")).toBeTruthy();
    expect(imperativeMove).not.toHaveBeenCalled();

    await advanceEntryPreviewBy(1);
    expect(imperativeMove).toHaveBeenCalledTimes(1);
    expect(imperativeMove).toHaveBeenCalledWith(parseBoardMove(activePuzzle.puzzle.solutionMoves[0]!));
    expect(moveFeedbackClient.requests).toEqual([{
      cue: "move",
      playSound: true,
      playHaptic: true
    }]);
    expect(() => findByTestId(renderer, "board-input-blocker")).toThrow();
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(activePuzzle.currentFen);
  });

  it("cancels a pending Standard blunder callback when the screen unmounts", async () => {
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "practice-mode-standard");
    press(renderer, "practice-start-button");

    const imperativeMove = findByTestId(renderer, "mock-chessboard").props.mockImperativeMove as jest.Mock;
    expect(findByTestId(renderer, "board-input-blocker")).toBeTruthy();

    act(() => {
      renderer.unmount();
    });
    const rendererIndex = renderers.indexOf(renderer);
    if (rendererIndex >= 0) {
      renderers.splice(rendererIndex, 1);
    }

    await advanceEntryPreviewBy(1_000);
    expect(imperativeMove).not.toHaveBeenCalled();
  });

  it("cancels a pending Standard blunder callback when the session exits", async () => {
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "practice-mode-standard");
    press(renderer, "practice-start-button");

    const imperativeMove = findByTestId(renderer, "mock-chessboard").props.mockImperativeMove as jest.Mock;
    expect(findByTestId(renderer, "board-input-blocker")).toBeTruthy();

    abandonSprint(renderer);
    expect(() => findByTestId(renderer, "session-board")).toThrow();

    await advanceEntryPreviewBy(1_000);
    expect(imperativeMove).not.toHaveBeenCalled();
  });

  it("relocks Review reset until its blunder animation completes", async () => {
    const renderer = renderStandardSequenceScreen();
    await openSessionMistakeReview(renderer);

    const initialBoard = findByTestId(renderer, "mock-chessboard");
    expect(initialBoard.props.gestureEnabled).toBe(false);
    expect(findByTestId(renderer, "board-input-blocker")).toBeTruthy();
    expect(findByTestId(renderer, "review-reset-puzzle").props.disabled).toBe(true);

    await settleEntryPreview();
    const readyBoard = findByTestId(renderer, "mock-chessboard");
    const readyFen = readyBoard.props.fen;
    const imperativeMove = readyBoard.props.mockImperativeMove as jest.Mock;
    expect(readyBoard.props.gestureEnabled).toBe(true);
    expect(() => findByTestId(renderer, "board-input-blocker")).toThrow();
    expect(findByTestId(renderer, "review-reset-puzzle").props.disabled).toBe(false);

    imperativeMove.mockClear();
    press(renderer, "review-reset-puzzle");

    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(false);
    expect(findByTestId(renderer, "board-input-blocker")).toBeTruthy();
    expect(findByTestId(renderer, "mock-chessboard").props.fen).not.toBe(readyFen);
    expect(imperativeMove).not.toHaveBeenCalled();

    await settleEntryPreview();
    expect(imperativeMove).toHaveBeenCalledTimes(1);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(() => findByTestId(renderer, "board-input-blocker")).toThrow();
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(readyFen);
  });

  it("cancels the old Review preview when navigating to a new puzzle", async () => {
    const renderer = renderStandardSequenceScreen();
    await openSessionMistakeReview(renderer);

    const oldImperativeMove = findByTestId(renderer, "mock-chessboard").props.mockImperativeMove as jest.Mock;
    expect(findByTestId(renderer, "review-next").props.disabled).toBe(false);

    press(renderer, "review-next");

    const newImperativeMove = findByTestId(renderer, "mock-chessboard").props.mockImperativeMove as jest.Mock;
    expectText(renderer, "2 / 3 · Standard");
    expect(findByTestId(renderer, "board-input-blocker")).toBeTruthy();

    await settleEntryPreview();

    expect(oldImperativeMove).not.toHaveBeenCalled();
    expect(newImperativeMove).toHaveBeenCalledTimes(1);
    expect(() => findByTestId(renderer, "board-input-blocker")).toThrow();
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
    service.saveSettings({
      ...service.getSettings(),
      sprintGuides: {
        rulesSeen: true,
        activeSessionSeen: true,
        arrowDuelSeen: true
      }
    });
    const renderer = renderScreen({
      sprintGuidanceEnabled: true,
      practiceService: service
    });

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
    expect(() => findByTestId(renderer, "sprint-unclear-question")).toThrow();
    expect(() => findByTestId(renderer, "sprint-unclear-toggle")).toThrow();
    expect(service.listHistory({ sessionId: service.listSprintSessions().at(-1)?.id })
      .some((attempt) => attempt.unclear === true)).toBe(false);
    expect(() => findByTestId(renderer, "sprint-result-unclear-count")).toThrow();
    expect(() => findByTestId(renderer, "sprint-result-unclear-count-column")).toThrow();
    expect(findByTestId(renderer, "sprint-result-mistakes-count-column")).toBeTruthy();
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

  it("keeps visible puzzle-source controls out of deterministic store captures", () => {
    const nativeModules = ReactNative.NativeModules as typeof ReactNative.NativeModules & {
      ChessticizeTestLaunchConfig?: { storeAssetCapture?: boolean };
    };
    const previousLaunchConfig = nativeModules.ChessticizeTestLaunchConfig;
    nativeModules.ChessticizeTestLaunchConfig = { storeAssetCapture: true };

    try {
      const renderer = renderScreen();

      expect(() => findByTestId(renderer, "test-puzzle-source-control")).toThrow();
    } finally {
      nativeModules.ChessticizeTestLaunchConfig = previousLaunchConfig;
    }
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
    expect(collectText(findByTestId(renderer, "practice-mode-standard-rating"))).toBe("Rating 625");

    press(renderer, "test-puzzle-source-familiar15");
    expect(practiceServiceFactory).toHaveBeenCalledTimes(1);
    expect(collectText(findByTestId(renderer, "practice-mode-standard-rating"))).toBe("Rating 625");

    press(renderer, "test-puzzle-source-bundledCore");
    expect(practiceServiceFactory).toHaveBeenCalledTimes(1);
    expect(collectText(findByTestId(renderer, "practice-mode-standard-rating"))).toBe("Rating 625");
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

  it("configures the fixed puzzle source for the mode being started", () => {
    const service = createMobilePracticeService();
    const configurePuzzleSource = jest.fn();
    const renderer = renderScreen({
      practiceServiceFactory: () => service,
      configurePuzzleSource
    });

    press(renderer, "test-puzzle-source-familiar15");
    configurePuzzleSource.mockClear();
    startArrowDuelSprint(renderer);

    expect(configurePuzzleSource).toHaveBeenCalledWith(
      service,
      "familiar15",
      "arrow_duel"
    );
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

    expect(() => findByTestId(renderer, "session-side-to-move")).toThrow();
    expect(findByTestId(renderer, "chessboard-king-black-sprite")).toBeTruthy();
    expect(findByTestId(renderer, "practice-prompt-side-glyph")).toBeTruthy();
    expect(flattenTestStyle(findByTestId(renderer, "chessboard-king-black-sprite").props.style).width).toBe(
      Math.round(Number(flattenTestStyle(findByTestId(renderer, "session-board").props.style).width) / 8) * 6
    );
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
    await settleArrowDuelReplyHandoff();
    await boardMove(renderer, arrow.puzzle.solutionMoves[1]!);
    await settleFeedbackSnapshot();
    expectText(renderer, "Sprint complete");
    expect(collectText(findByTestId(renderer, "sprint-result-solved"))).toContain("1 / 1");
  });

  it("includes mistakes in the completed sprint result attempt count", async () => {
    const store = new MemoryStore();
    store.seedPuzzles(Array.from({ length: 4 }, (_, index) => ({
      id: `result-attempt-count-${index}`,
      initialFen: `4k3/${["8", "p7", "1p6", "2p5"][index]}/8/8/8/8/4P3/4K3 b - - 0 1`,
      solutionMoves: ["e8e7", "e2e4"],
      rating: 600,
      themes: ["endgame"],
      source: "synthetic"
    } satisfies Puzzle)));
    const service = new PracticeService(store);
    service.saveSettings({
      ...service.getSettings(),
      sprintGuides: {
        rulesSeen: true,
        activeSessionSeen: true,
        arrowDuelSeen: true
      }
    });
    const renderer = renderScreen({
      sprintGuidanceEnabled: true,
      practiceService: service,
      standardTargetCorrect: 1
    });

    startStandardSprint(renderer);
    await boardMove(renderer, "e2e3");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e2e4");
    await settleFeedbackSnapshot();

    expectText(renderer, "Sprint complete");
    expect(collectText(findByTestId(renderer, "sprint-result-goal-label"))).toBe("Solve 1 to pass");
    expect(collectText(findByTestId(renderer, "sprint-result-solved"))).toBe("Solved 1");
    expect(collectText(findByTestId(renderer, "sprint-result-accuracy"))).toBe(
      "2 attempted · 50% Accuracy"
    );
  });

  it("starts Survival through its public first-use contract", () => {
    const renderer = renderLabScenario("practice-personal-best-empty-home-source");

    expect(collectText(findByTestId(renderer, "personal-best-rules-summary"))).toContain(
      "No time limit · 3 mistakes"
    );
    expect(collectText(findByTestId(renderer, "personal-best-recommended-level"))).toBe("900–999");
    press(renderer, "personal-best-hub-start");

    expect(findByTestId(renderer, "personal-best-guide")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "personal-best-guide"))).toContain(
      "Marking it Unclear does not add another mistake."
    );
    expect(collectText(findByTestId(renderer, "personal-best-guide"))).toContain(
      "Pause now, continue later"
    );
    expect(collectText(findByTestId(renderer, "personal-best-guide"))).toContain(
      "Your Rating stays unchanged."
    );
    press(renderer, "personal-best-guide-start");

    expect(findByTestId(renderer, "active-session-shell")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-timer"))).toBe("No time limit");
    expect(() => findByTestId(renderer, "personal-best-unrated")).toThrow();
    expect(findByTestId(renderer, "session-mistakes-block").props.accessibilityLabel).toBe(
      "Mistakes 0 of 3"
    );
    expect(collectText(findByTestId(renderer, "personal-best-progress-title"))).toBe(
      "19 more to beat 18"
    );
  });

  it("resumes the latest paused Survival Run directly from Home", () => {
    const renderer = renderLabScenario("practice-home");

    expect(collectText(findByTestId(renderer, "personal-best-home-score"))).toBe("19");
    expect(collectText(findByTestId(renderer, "personal-best-home-card"))).toContain(
      "New best saved"
    );
    expect(collectText(findByTestId(renderer, "personal-best-more-paused"))).toBe("2 more paused");
    press(renderer, "personal-best-continue");

    expect(collectText(findByTestId(renderer, "session-progress"))).toBe("19 solved");
    expect(findByTestId(renderer, "session-mistakes-block").props.accessibilityLabel).toBe(
      "Mistakes 1 of 3"
    );
  });

  it("continues an existing Survival level without an End or reset action", () => {
    const renderer = renderLabScenario("practice-personal-best-hub");

    expect(collectText(findByTestId(renderer, "personal-best-hub-start"))).toBe(
      "Continue Survival"
    );
    expect(() => findByTestId(renderer, "personal-best-paused-end-puzzle-900")).toThrow();
    press(renderer, "personal-best-hub-start");
    expect(collectText(findByTestId(renderer, "session-progress"))).toBe("19 solved");
  });

  it("animates Survival disclosures and removes collapsed content from interaction", () => {
    const hubRenderer = renderLabScenario("practice-personal-best-hub");

    expect(findByTestId(hubRenderer, "personal-best-in-progress-toggle").props.accessibilityState).toEqual({
      expanded: true
    });
    expect(findByTestId(hubRenderer, "personal-best-in-progress-content-motion").props).toMatchObject({
      "aria-hidden": false,
      accessibilityElementsHidden: false,
      pointerEvents: "auto"
    });
    press(hubRenderer, "personal-best-in-progress-toggle");
    expect(findByTestId(hubRenderer, "personal-best-in-progress-toggle").props.accessibilityState).toEqual({
      expanded: false
    });
    expect(findByTestId(hubRenderer, "personal-best-in-progress-content-motion").props).toMatchObject({
      "aria-hidden": true,
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });

    expect(findByTestId(hubRenderer, "personal-best-more-levels").props.accessibilityState).toEqual({
      expanded: true
    });

    const collapsedLevelsRenderer = renderLabScenario("practice-personal-best-starting-level");
    expect(findByTestId(collapsedLevelsRenderer, "personal-best-more-levels").props.accessibilityState).toEqual({
      expanded: false
    });
    expect(findByTestId(collapsedLevelsRenderer, "personal-best-more-level-options-motion").props).toMatchObject({
      "aria-hidden": true,
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });
    press(collapsedLevelsRenderer, "personal-best-more-levels");
    expect(findByTestId(collapsedLevelsRenderer, "personal-best-more-levels").props.accessibilityState).toEqual({
      expanded: true
    });
    expect(findByTestId(collapsedLevelsRenderer, "personal-best-more-level-options-motion").props).toMatchObject({
      "aria-hidden": false,
      accessibilityElementsHidden: false,
      pointerEvents: "auto"
    });

    const recordsRenderer = renderLabScenario("practice-personal-best-records");
    expect(findByTestId(recordsRenderer, "personal-best-records-in-progress-toggle").props.accessibilityState).toEqual({
      expanded: true
    });
    press(recordsRenderer, "personal-best-records-in-progress-toggle");
    expect(findByTestId(recordsRenderer, "personal-best-records-in-progress-content-motion").props).toMatchObject({
      "aria-hidden": true,
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });
    expect(findByTestId(hubRenderer, "personal-best-in-progress-chevron")).toBeTruthy();
    expect(findByTestId(recordsRenderer, "personal-best-records-in-progress-chevron")).toBeTruthy();
    expect(findByTestId(collapsedLevelsRenderer, "personal-best-more-levels-chevron")).toBeTruthy();
  });

  it("hides the Survival puzzle while paused and offers only Resume or Leave paused", () => {
    const renderer = renderLabScenario("practice-personal-best-active");

    expect(collectText(findByTestId(renderer, "active-session-shell"))).toContain(
      "Survival"
    );
    expect(collectText(findByTestId(renderer, "session-timer"))).toBe("No time limit");
    expect(findByTestId(renderer, "session-mistakes-block").props.accessibilityLabel).toBe(
      "Mistakes 1 of 3"
    );
    expect(collectText(findByTestId(renderer, "personal-best-mistakes"))).toBe("×1/3");
    expect(collectText(findByTestId(renderer, "personal-best-progress-title"))).toBe(
      "5 more to beat 18"
    );
    expect(findByTestId(renderer, "session-puzzle-timing")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-puzzle-timing-label"))).toBe("Puzzle 0:34");
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(() => findByTestId(renderer, "personal-best-end-run")).toThrow();
    expect(() => findByTestId(renderer, "personal-best-unrated")).toThrow();
    press(renderer, "session-abandon");
    expect(collectText(findByTestId(renderer, "session-abandon-confirmation"))).toContain(
      "Your puzzle is hidden"
    );
    expect(() => findByTestId(renderer, "session-board")).toThrow();
    expect(() => findByTestId(renderer, "practice-prompt")).toThrow();
    expect(() => findByTestId(renderer, "session-puzzle-timing")).toThrow();
    expect(() => findByTestId(renderer, "session-abandon-confirm")).toThrow();
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    press(renderer, "session-abandon-cancel");
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-puzzle-timing-label"))).toBe("Puzzle 0:34");
    press(renderer, "session-abandon");
    press(renderer, "personal-best-pause-and-leave");
    expect(findByTestId(renderer, "personal-best-home-card")).toBeTruthy();
  });

  it("uses only the explicitly selected compatible Run to suggest a Survival level", () => {
    const renderer = renderLabScenario("practice-personal-best-source-run");

    expect(findByTestId(renderer, "personal-best-source-picker")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "personal-best-source-standard"))).toContain(
      "Rating 925 · 900–999"
    );
    press(renderer, "personal-best-source-balanced-practice");
    expect(collectText(findByTestId(renderer, "personal-best-recommended-level"))).toBe("800–899");
    expect(collectText(findByTestId(renderer, "personal-best-reference-source"))).toContain(
      "Based on Balanced Practice · Rating 842"
    );
    press(renderer, "personal-best-hub-start");
    expect(collectText(findByTestId(renderer, "personal-best-guide"))).toContain(
      "Puzzle · 800–899"
    );
    expect(collectText(findByTestId(renderer, "personal-best-guide"))).toContain(
      "Best at 800–899"
    );
  });

  it("preserves an unavailable saved Survival source until the user chooses a replacement", () => {
    const renderer = renderLabScenario("practice-personal-best-unavailable-source");

    expect(collectText(findByTestId(renderer, "personal-best-source-unavailable-message"))).toContain(
      "Your saved Rating source is no longer available."
    );
    expect(findByTestId(renderer, "personal-best-hub-start").props.accessibilityState).toEqual({
      disabled: true
    });
    press(renderer, "personal-best-use-another-run");
    expect(findByTestId(renderer, "personal-best-source-unavailable")).toBeTruthy();
    press(renderer, "personal-best-source-standard");
    expect(collectText(findByTestId(renderer, "personal-best-reference-source"))).toContain(
      "Based on Standard · Rating 925"
    );
    expect(findByTestId(renderer, "personal-best-hub-start").props.accessibilityState).toEqual({
      disabled: false
    });
  });

  it("uses Standard's default Rating as a clearly labeled starting level when it has no games", () => {
    const renderer = renderLabScenario("practice-personal-best-starting-level");

    expect(collectText(findByTestId(renderer, "personal-best-hub"))).toContain("Starting level");
    expect(collectText(findByTestId(renderer, "personal-best-recommended-level"))).toBe("600–699");
    expect(collectText(findByTestId(renderer, "personal-best-reference-source"))).toContain(
      "Based on Standard’s starting Rating"
    );
  });

  it("keeps Arrow Duel recommendation and candidate-plus-reply rules separate", () => {
    const renderer = renderLabScenario("practice-personal-best-arrow-duel");

    expect(collectText(findByTestId(renderer, "personal-best-recommended-level"))).toBe("800–899");
    expect(collectText(findByTestId(renderer, "personal-best-reference-source"))).toContain(
      "Based on Arrow Duel · Rating 875"
    );
    expect(collectText(findByTestId(renderer, "personal-best-rules-summary"))).toContain(
      "Candidate + required reply"
    );
    press(renderer, "personal-best-paused-continue-arrow-800");
    expect(collectText(findByTestId(renderer, "session-progress"))).toBe("7 solved");
    expect(findByTestId(renderer, "session-mistakes-block").props.accessibilityLabel).toBe(
      "Mistakes 2 of 3"
    );
  });

  it("starts the selected Arrow Duel Survival type and level", () => {
    const renderer = renderLabScenario("practice-personal-best-hub");

    press(renderer, "personal-best-type-arrow_duel");
    press(renderer, "personal-best-level-900");
    press(renderer, "personal-best-hub-start");
    expect(collectText(findByTestId(renderer, "personal-best-guide"))).toContain(
      "Arrow Duel · 900–999"
    );
    press(renderer, "personal-best-guide-start");
    expect(collectText(renderer.root)).toContain("Choose the best move");
    expect(collectText(renderer.root)).toContain("between the two arrows");
    expect(collectText(findByTestId(renderer, "session-progress"))).toBe("0 solved");
  });

  it("shows every Core Pack Survival level and clamps a higher Rating to 2100–2200", () => {
    const renderer = renderLabScenario("practice-personal-best-highest-level");

    expect(collectText(findByTestId(renderer, "personal-best-hub"))).toContain(
      "Highest available level"
    );
    expect(collectText(findByTestId(renderer, "personal-best-recommended-level"))).toBe(
      "2100–2200"
    );
    expect(collectText(findByTestId(renderer, "personal-best-level-availability"))).toBe(
      "Showing every Survival level in this Core Pack: 600–2200."
    );
    expect(collectText(findByTestId(renderer, "personal-best-more-level-options"))).not.toContain(
      "2300"
    );
  });

  it("keeps Standard as the Survival source when Home is empty and hides the redundant source action", () => {
    const renderer = renderLabScenario("practice-personal-best-empty-home-source");

    expect(collectText(findByTestId(renderer, "personal-best-reference-source"))).toContain(
      "Based on Standard · Rating 925"
    );
    expect(collectText(findByTestId(renderer, "personal-best-hub"))).toContain(
      "Standard remains your Rating source even when hidden from Home."
    );
    expect(() => findByTestId(renderer, "personal-best-use-another-run")).toThrow();
  });

  it("shows a saved live best on the puzzle-hidden Survival pause surface", () => {
    const renderer = renderLabScenario("practice-personal-best-leave");

    expect(collectText(findByTestId(renderer, "personal-best-exit-best"))).toBe(
      "New best 19 · already saved"
    );
    expect(collectText(findByTestId(renderer, "session-abandon-confirmation"))).toContain(
      "Your puzzle is hidden. Resume here, or leave it paused and continue any time."
    );
    expect(findByTestId(renderer, "personal-best-pause-and-leave")).toBeTruthy();
    expect(findByTestId(renderer, "session-abandon-cancel")).toBeTruthy();
    expect(() => findByTestId(renderer, "session-board")).toThrow();
    expect(() => findByTestId(renderer, "session-abandon-confirm")).toThrow();
    expect(() => findByTestId(renderer, "personal-best-end-run")).toThrow();
    expect(() => findByTestId(renderer, "personal-best-unrated")).toThrow();
  });

  it("presents true Survival puzzle-pool exhaustion as a Perfect clear", () => {
    const renderer = renderLabScenario("practice-personal-best-pool-cleared");

    expect(collectText(findByTestId(renderer, "personal-best-result-score"))).toBe("88,894");
    expect(collectText(findByTestId(renderer, "personal-best-result"))).toContain(
      "Perfect clear at 2100–2200"
    );
    expect(collectText(findByTestId(renderer, "personal-best-result"))).toContain(
      "You cleared every available Puzzle in this level."
    );
    expect(collectText(findByTestId(renderer, "personal-best-result"))).toContain(
      "Loading and selection errors never count as a clear."
    );
    expect(collectText(findByTestId(renderer, "personal-best-result"))).toContain(
      "51:12:00 active"
    );
    expect(collectText(findByTestId(renderer, "personal-best-result"))).toContain(
      "All 88,894 solved"
    );
    expect(collectText(findByTestId(renderer, "personal-best-result"))).not.toContain(
      "ended normally after"
    );
  });

  it("treats the third Survival mistake as a normal result and preserves the record context", () => {
    const renderer = renderLabScenario("practice-personal-best-result");

    expect(collectText(findByTestId(renderer, "personal-best-result-score"))).toBe("19");
    expect(collectText(findByTestId(renderer, "personal-best-result-comparison"))).toBe(
      "Previous best 18"
    );
    expect(collectText(findByTestId(renderer, "personal-best-result"))).toContain(
      "The Run ended normally after 3 mistakes."
    );
    expect(collectText(findByTestId(renderer, "personal-best-result"))).toContain(
      "This level keeps its own best"
    );
    expect(collectText(findByTestId(renderer, "personal-best-result"))).toContain(
      "19 solved · 12:48 active · 3 sittings"
    );
    expect(collectText(findByTestId(renderer, "personal-best-result-replay"))).toBe(
      "Replay 3 mistakes"
    );
    expect(collectText(renderer.root)).not.toContain("Sprint failed");
  });

  it("opens dedicated Survival records from the Challenge Hub without taking over History", () => {
    const renderer = renderLabScenario("practice-personal-best-hub");

    press(renderer, "personal-best-hub-records");

    expect(collectText(findByTestId(renderer, "personal-best-records-score"))).toBe("19");
    expect(collectText(findByTestId(renderer, "personal-best-records-screen"))).toContain(
      "900–999"
    );
    expect(collectText(findByTestId(renderer, "personal-best-records-screen"))).toContain(
      "Puzzle"
    );
    expect(collectText(findByTestId(renderer, "personal-best-records-screen"))).toContain(
      "Arrow Duel"
    );
    expect(collectText(findByTestId(renderer, "personal-best-records-comparison-note"))).toContain(
      "A best of 42 at 600–699 never outranks or replaces a best of 19 at 900–999."
    );
    expect(collectText(findByTestId(renderer, "personal-best-records-screen"))).toContain(
      "A new high is saved immediately while its Run stays in progress."
    );
    expect(collectText(findByTestId(renderer, "personal-best-records-screen"))).toContain(
      "best · in progress"
    );
    expect(() => findByTestId(renderer, "history-attempt-history-unclear")).toThrow();
    expect(() => findByTestId(renderer, "personal-best-unrated")).toThrow();
    press(renderer, "personal-best-records-back");
    expect(findByTestId(renderer, "personal-best-hub")).toBeTruthy();
  });

  it("explains a completed Tactical Focus Run as fixed, unrated training", () => {
    const renderer = renderLabScenario("practice-tactical-focus-result");

    expectText(renderer, "Focused Run complete");
    expect(collectText(findByTestId(renderer, "sprint-result-top-bar"))).toContain(
      "Focused Run Result"
    );
    expect(collectText(findByTestId(renderer, "sprint-result-reason"))).toBe(
      "Planned puzzles complete"
    );
    expect(collectText(findByTestId(renderer, "sprint-result-rating-change"))).toContain(
      "Unrated"
    );
    expect(collectText(findByTestId(renderer, "sprint-result-rating-range"))).toBe(
      "1087 unchanged"
    );
    expect(() => findByTestId(renderer, "sprint-result-history-trend")).toThrow();
    expect(() => findByTestId(renderer, "sprint-result-history-button")).toThrow();
    expect(() => findByTestId(renderer, "sprint-result-goal-label")).toThrow();
    expect(collectText(findByTestId(renderer, "play-again-button"))).toContain(
      "Back to Practice"
    );
    press(renderer, "play-again-button");
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
  });

  it("shows fixed progress and no Rating pressure during an active Tactical Focus Run", () => {
    const renderer = renderLabScenario("practice-tactical-focus-active");

    expect(collectText(findByTestId(renderer, "active-session-shell"))).toContain(
      "Focused Run"
    );
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).toContain(
      "Unrated"
    );
    expect(findByTestId(renderer, "session-score-completed").props.accessibilityLabel)
      .toBe("Completed 10");
    expect(findByTestId(renderer, "session-score-left").props.accessibilityLabel)
      .toBe("Left 5");
    expect(collectText(findByTestId(renderer, "session-progress"))).toBe("10 / 15");
  });

  it("keeps Focused Run metric labels readable in the maintained landscape rail", () => {
    setPracticeViewport({
      width: 874,
      height: 402,
      scale: 3,
      insets: { top: 0, right: 62, bottom: 21, left: 62 }
    });
    const renderer = renderLabScenario("practice-tactical-focus-active");
    const unratedText = findByTestId(renderer, "session-rating-policy")
      .findAllByType(ReactNative.Text)
      .find((node) => collectText(node) === "Unrated");
    const completedText = findByTestId(renderer, "session-score-completed")
      .findAllByType(ReactNative.Text)
      .find((node) => collectText(node) === "Completed");

    expect(flattenTestStyle(unratedText?.props.style).fontSize).toBe(16);
    expect(completedText?.props.adjustsFontSizeToFit).toBe(true);
  });

  it("explains fixed and unrated semantics before a first Focused Run", () => {
    const renderer = renderLabScenario("practice-tactical-focus-guide");

    expectText(renderer, "Track the fixed Run");
    expectText(renderer, "Your Rating will not change.");
    expectText(renderer, "Unrated");
    expect(
      collectText(findByTestId(renderer, "practice-session-guide-start"))
    ).toBe("Next");
    press(renderer, "practice-session-guide-start");
    press(renderer, "practice-session-guide-start");
    expectText(renderer, "It is added to Review and counts as one completed puzzle.");
    press(renderer, "practice-session-guide-start");
    expect(
      collectText(findByTestId(renderer, "practice-session-guide-start"))
    ).toBe("Start Focused Run");
  });

  it("separates the fixed pass goal from actual attempts in the Storybook result designs", () => {
    const failed = renderLabScenario("practice-sprint-result-goal");

    expect(collectText(findByTestId(failed, "sprint-result-goal-label"))).toBe("Solve 15 to pass");
    expect(collectText(findByTestId(failed, "sprint-result-solved"))).toBe("Solved 11");
    expect(collectText(findByTestId(failed, "sprint-result-accuracy"))).toBe(
      "12 attempted · 92% Accuracy"
    );
    expect(() => findByTestId(failed, "sprint-unclear-prompt")).toThrow();
    expect(() => findByTestId(failed, "sprint-unclear-toggle")).toThrow();
    expect(collectText(findByTestId(failed, "sprint-result-unclear-sources"))).toBe(
      "1 marked by you · 1 marked after Slow"
    );
    expect(collectText(findByTestId(failed, "sprint-result-unclear-count"))).toBe("2");
    expect(findByTestId(failed, "sprint-result-unclear-count-column")).toBeTruthy();
    expect(findByTestId(failed, "sprint-result-mistakes-count-column")).toBeTruthy();

    const passed = renderLabScenario("practice-sprint-result-extra-attempt");

    expect(collectText(findByTestId(passed, "sprint-result-goal-label"))).toBe("Solve 15 to pass");
    expect(collectText(findByTestId(passed, "sprint-result-solved"))).toBe("Solved 15");
    expect(collectText(findByTestId(passed, "sprint-result-accuracy"))).toBe(
      "16 attempted · 94% Accuracy"
    );
    expect(collectText(findByTestId(passed, "sprint-result-unclear-sources"))).toBe(
      "1 marked after Slow"
    );
    expect(collectText(findByTestId(passed, "sprint-result-unclear-summary"))).toContain(
      "Does not affect your Sprint result"
    );
  });

  it("keeps a deterministic Custom target inside the selected shared configuration", () => {
    const service = createMobilePracticeService();
    service.loadFixturePuzzles([androidPracticeFixture.puzzle as Puzzle]);
    const renderer = renderScreen({
      customTargetCorrect: 1,
      practiceService: service,
      puzzleSelectionId: androidPracticeFixture.puzzle.id,
      puzzleSelectionSeed: androidPracticeFixture.puzzleSelectionSeed
    });

    press(renderer, "practice-mode-custom");
    press(renderer, "custom-duration-stepper-decrease");
    press(renderer, "custom-per-puzzle-stepper-increase");
    press(renderer, "custom-theme-back-rank-mate");
    press(renderer, "start-sprint-button");

    expect(service.getActiveSprint()?.config).toMatchObject({
      durationSeconds: 180,
      maxMistakes: 3,
      mode: "custom",
      perPuzzleSeconds: 30,
      ratingKey: "backRankMate custom 3/30",
      targetCorrect: 1,
      themes: ["backRankMate"]
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
    const unsolvedPromptLayout = promptLayoutSlotTestIDs(renderer);
    expect(unsolvedPromptLayout).toEqual([
      "practice-prompt-title-layout",
      "practice-prompt-context",
      "practice-prompt-hint"
    ]);
    expect(collectText(findByTestId(renderer, "practice-prompt"))).toContain("Find the best move");
    expect(collectText(findByTestId(renderer, "practice-prompt"))).toContain("For white.");
    expectText(renderer, "0 / 15");

    await boardMove(renderer, "c2b1");

    expect(promptLayoutSlotTestIDs(renderer)).toEqual(unsolvedPromptLayout);
    expect(() => findByTestId(renderer, "mock-promotion-dialog")).toThrow();
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expectText(renderer, "1 / 15");
    expectSessionMistakes(renderer, 0);

    await settleFeedbackSnapshot();
    expectText(renderer, "1 / 15");

    abandonSprint(renderer);
    press(renderer, "history-tab");
    press(renderer, "history-attention-all");
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
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("Rating");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("White");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("Black");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("Mistakes");
    expect(findByTestId(renderer, "session-progress-block").props.accessibilityLabel).toBe("Progress 0 of 15");
    expect(findByTestId(renderer, "session-timer-block").props.accessibilityLabel).toContain("Timer");
    expect(() => findByTestId(renderer, "session-side-to-move-block")).toThrow();
    expect(() => findByTestId(renderer, "session-side-to-move")).toThrow();
    expect(findByTestId(renderer, "session-board").props.accessibilityLabel).toContain("White to move");
    expect(findByTestId(renderer, "session-mistakes-block").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(collectText(findByTestId(renderer, "session-mistakes"))).toBe("");
    expect(findByTestId(renderer, "session-pause")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-abandon"))).toBe("");
    expect(collectText(findByTestId(renderer, "session-pause"))).toBe("");
    expect(collectText(findByTestId(renderer, "session-shell-nav"))).not.toContain("×");
    expect(collectText(findByTestId(renderer, "session-shell-nav"))).not.toContain("•••");
    expect(findByTestId(renderer, "session-timer")).toBeTruthy();
    expect(findByTestId(renderer, "session-progress")).toBeTruthy();
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
    expect(findByTestId(renderer, "session-board").props.accessibilityLabel).toContain("Black to move");
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
    expect(() => findByTestId(renderer, "session-side-to-move")).toThrow();
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
    press(renderer, "history-attention-all");
    expectHistoryRowAccessibility(renderer, "Move e6f7");
    expect(collectText(renderer.root)).not.toContain("000hf · standard");
  });

  it("shows a persistence failure and unlocks board input through the store boundary", async () => {
    const service = new PracticeService(new FailingAttemptStore("Practice write failed"));
    const moveFeedbackClient = new FakeMoveFeedbackClient();
    configureMobilePracticePuzzleSource(service, "random1000");
    const renderer = renderScreen({ practiceService: service, moveFeedbackClient });

    startStandardSprint(renderer);
    moveFeedbackClient.requests.length = 0;

    await boardMove(renderer, "e2d2");

    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(collectText(findByTestId(renderer, "error-panel"))).toContain("Practice write failed");
    expect(moveFeedbackClient.requests).toEqual([]);
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

  it("uses the pause command's exact final Incomplete attempt for the result Unclear action", () => {
    let wallClockMs = Date.parse("2026-07-23T12:00:00.000Z");
    const service = createMobilePracticeService("random1000");
    let active = startSprintWithPuzzleTiming(
      service,
      {
        durationSeconds: 60,
        perPuzzleSeconds: 20,
        puzzleTiming: {
          slowAfterSeconds: 40,
          timeoutAfterSeconds: null
        },
        targetCorrect: 3,
        maxMistakes: 3
      },
      new Date(wallClockMs).toISOString()
    );
    const firstPuzzle = active.currentPuzzle;
    const userMoves = firstPuzzle?.kind === "line"
      ? firstPuzzle.puzzle.solutionMoves.filter((_, index) => (
          index >= firstPuzzle.cursor && (index - firstPuzzle.cursor) % 2 === 0
        ))
      : [];
    userMoves.forEach((move, index) => {
      const completedAtMs = Date.parse("2026-07-23T12:00:59.000Z")
        - (userMoves.length - index - 1) * 1_000;
      active = service.submitMove(move, new Date(completedAtMs).toISOString()).state;
    });
    expect(active.currentPuzzle?.puzzle.id).not.toBe(firstPuzzle?.puzzle.id);
    wallClockMs = Date.parse("2026-07-23T12:00:59.000Z");
    const renderer = renderScreen({
      currentTimeMs: () => wallClockMs,
      practiceService: service
    });

    press(renderer, "practice-resume-card");
    wallClockMs += 1_000;
    press(renderer, "session-pause");

    const incomplete = service.listHistory().find((attempt) => attempt.result === "incomplete");
    expect(incomplete).toBeTruthy();
    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-unclear-question"))).toBe(
      "Was the final puzzle unclear?"
    );
    press(renderer, "sprint-unclear-toggle");
    expect(service.getHistoryAttempt(incomplete!.id)?.unclear).toBe(true);
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

    wallClockMs += 250;
    press(renderer, "session-pause");
    expect(findByTestId(renderer, "paused-session-panel")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-timer"))).toBe("04:49");

    act(() => {
      wallClockMs += 10 * 60_000;
      jest.advanceTimersByTime(10 * 60_000);
    });
    expect(collectText(findByTestId(renderer, "session-timer"))).toBe("04:49");

    press(renderer, "paused-session-resume");
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-timer"))).toBe("04:49");
    expect(collectText(findByTestId(renderer, "session-puzzle-timing-label"))).toBe("Puzzle 0:10");

    act(() => {
      wallClockMs += 1_000;
      jest.advanceTimersByTime(1_000);
    });
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-timer"))).toBe("04:48");
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

  it("waits for the Arrow Duel board to render before showing neutral markers", () => {
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service });

    startArrowDuelSprint(renderer);
    const arrow = requireArrowDuelState(activeSprintForTest(service));
    const arrowBoard = findByTestId(renderer, "mock-chessboard");

    expect(arrowBoard.props.flipped).toBe(new Chess(arrow.currentFen).turn() === "b");
    expect(arrowBoard.props.gestureEnabled).toBe(true);
    expect(arrowBoard.props.mockImperativeMove).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({ testID: "arrow-duel-candidate-overlay" })).toHaveLength(0);

    act(() => {
      arrowBoard.props.onReady();
    });

    expect(() => findByTestId(renderer, "board-input-blocker")).toThrow();
    expect(collectText(renderer.root)).not.toContain("Choose one candidate move");
    expect(() => findByTestId(renderer, "arrow-duel-candidates")).toThrow();
    expect(() => findByTestId(renderer, "arrow-duel-candidate-a")).toThrow();
    expect(() => findByTestId(renderer, "arrow-duel-candidate-b")).toThrow();
    const accessibleCandidateOverlay = renderer.root
      .findAllByProps({ testID: "arrow-duel-candidate-overlay" })
      .find((node) => node.props.accessible === true);
    expect(accessibleCandidateOverlay?.props.accessibilityLabel)
      .toBe(`Arrow Duel candidates: ${arrow.candidates.join(", ")}`);
    expect(findByTestId(renderer, "practice-prompt-icon")).toBeTruthy();
    expect(findByTestId(renderer, "practice-prompt-side-glyph")).toBeTruthy();
    expect(testIdOrder(renderer, "arrow-duel-reply-challenge", "session-board")).toBeLessThan(0);
    expect(testIdOrder(renderer, "session-board", "session-score-strip")).toBeLessThan(0);
    expect(findByTestId(renderer, "session-score-strip").props.accessibilityLabel).toBe("Session score: solved 0, mistakes 0, left 10");
    expect(collectText(findByTestId(renderer, "session-score-left-value"))).toBe("10");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).toBe("0010");
    expect(collectText(findByTestId(renderer, "arrow-duel-reply-challenge"))).toContain("Choose the best move");
    expect(collectText(findByTestId(renderer, "arrow-duel-reply-challenge"))).toContain("between the two arrows");
    expect(findByTestId(renderer, "practice-prompt-side-glyph")).toBeTruthy();
    expectText(renderer, "Be ready for a quick reply check.");
    const neutralArrowBodies = countStyleEntry(findByTestId(renderer, "session-board"), "backgroundColor", "#2563EB");
    expect(neutralArrowBodies).toBeGreaterThan(0);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "borderLeftColor", "#2563EB")).toBe(neutralArrowBodies);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "opacity", 0.68)).toBe(neutralArrowBodies * 2);
    expect(hasStyleValue(findByTestId(renderer, "session-board"), "#DC2626")).toBe(false);
  });

  it("keeps Standard, Arrow Duel, Review, and Replay prompts in one shared frame", () => {
    const standard = renderScreen({
      practiceService: createMobilePracticeService("familiar15")
    });
    startStandardSprint(standard);
    const standardPromptStyle = flattenTestStyle(
      findByTestId(standard, "practice-prompt").props.style
    );
    const standardPromptSlots = promptLayoutSlotTestIDs(standard);

    const arrowDuel = renderLabScenario("practice-arrow-duel-prompt");
    startArrowDuelSprint(arrowDuel);

    const arrowDuelPromptStyle = flattenTestStyle(
      findByTestId(arrowDuel, "arrow-duel-reply-challenge").props.style
    );

    const review = renderScreen({
      currentTimeMs: () => Date.parse("2026-06-20T12:00:00.000Z"),
      practiceService: createDueReviewService(1)
    });
    press(review, "review-tab");
    press(review, "review-start-due");
    const reviewPromptStyle = flattenTestStyle(
      findByTestId(review, "practice-prompt").props.style
    );
    const reviewPromptSlots = promptLayoutSlotTestIDs(review);

    const replay = renderStoredArrowDuelReplay();
    const replayPromptStyle = flattenTestStyle(
      findByTestId(replay, "practice-prompt").props.style
    );
    const replayPromptSlots = promptLayoutSlotTestIDs(replay);

    expect(typeof standardPromptStyle.height).toBe("number");
    expect([
      arrowDuelPromptStyle.height,
      reviewPromptStyle.height,
      replayPromptStyle.height
    ]).toEqual([
      standardPromptStyle.height,
      standardPromptStyle.height,
      standardPromptStyle.height
    ]);
    expect(standardPromptSlots).toEqual([
      "practice-prompt-title-layout",
      "practice-prompt-context",
      "practice-prompt-hint"
    ]);
    expect([
      "arrow-duel-reply-title",
      "arrow-duel-reply-context",
      "arrow-duel-reply-hint"
    ].map((testID) => findByTestId(arrowDuel, testID).props.testID)).toHaveLength(
      standardPromptSlots.length
    );
    expect(reviewPromptSlots).toEqual(standardPromptSlots);
    expect(replayPromptSlots).toEqual(standardPromptSlots);
    expect(flattenTestStyle(findByTestId(standard, "practice-prompt-copy").props.style).gap)
      .toBe(5);
    expect(flattenTestStyle(findByTestId(standard, "practice-prompt-hint").props.style))
      .toEqual(expect.objectContaining({ opacity: 0, position: "absolute" }));
  });

  it("requires Got it for the first production reply cue and persists the acknowledgement", async () => {
    const service = createMobilePracticeService("familiar15");
    service.saveSettings({
      ...service.getSettings(),
      sprintGuides: {
        rulesSeen: true,
        activeSessionSeen: true,
        arrowDuelSeen: true,
        focusedRunSeen: false,
        arrowDuelReplyCueStage: 0
      }
    });
    const renderer = renderScreen({
      practiceService: service,
      sprintGuidanceEnabled: true
    });
    const arrow = firstArrowDuelPuzzleForTest();

    startArrowDuelSprint(renderer);
    act(() => {
      findByTestId(renderer, "mock-chessboard").props.onReady();
    });
    await boardMove(renderer, arrow.correctMove);
    await advanceArrowDuelReplyToPrompt();

    expect(findByTestId(renderer, "arrow-duel-what-if-action").props.accessibilityLabel)
      .toBe("Got it");
    expect(findByTestId(renderer, "arrow-duel-what-if-announcement").props.accessibilityLabel)
      .toBe("What would Black play after the other move? You’ll have 10 seconds to play the best reply. Optional · Turn off in Settings");
    expect(collectText(findByTestId(renderer, "arrow-duel-what-if-title")))
      .not.toContain("Black");
    expect(findByTestId(renderer, "arrow-duel-what-if-side-king")).toBeTruthy();
    expect(collectText(findByTestId(
      renderer,
      "arrow-duel-what-if-settings-hint"
    ))).toBe("Optional · Turn off in Settings");
    expect(() => findByTestId(renderer, "arrow-duel-reply-timer")).toThrow();

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(findByTestId(renderer, "arrow-duel-what-if-action")).toBeTruthy();

    press(renderer, "arrow-duel-what-if-action");
    await waitForAssertion(() => {
      expect(service.getSettings().sprintGuides.arrowDuelReplyCueStage).toBe(1);
      expect(() => findByTestId(renderer, "arrow-duel-what-if-overlay")).toThrow();
      expect(collectText(findByTestId(renderer, "arrow-duel-reply-title")))
        .toBe("Find Black’s reply");
      expect(collectText(findByTestId(renderer, "arrow-duel-reply-context")))
        .toBe("The other move was played.");
      expect(collectText(findByTestId(renderer, "arrow-duel-reply-hint")))
        .toBe("Optional · Turn off in Settings");
      expect(collectText(findByTestId(renderer, "arrow-duel-reply-timer"))).toBe("0:10");
    });
  });

  it("uses 1.5 seconds for the next Arrow Duel Sprint and 1 second from the third", async () => {
    const service = createMobilePracticeService("familiar15");
    service.saveSettings({
      ...service.getSettings(),
      sprintGuides: {
        rulesSeen: true,
        activeSessionSeen: true,
        arrowDuelSeen: true,
        focusedRunSeen: false,
        arrowDuelReplyCueStage: 1
      }
    });
    const renderer = renderScreen({
      practiceService: service,
      sprintGuidanceEnabled: true
    });

    startArrowDuelSprint(renderer);
    expect(service.getSettings().sprintGuides.arrowDuelReplyCueStage).toBe(2);
    act(() => {
      findByTestId(renderer, "mock-chessboard").props.onReady();
    });
    await boardMove(renderer, requireArrowDuelState(activeSprintForTest(service)).correctMove);
    await advanceArrowDuelReplyToPrompt();
    expect(() => findByTestId(renderer, "arrow-duel-what-if-action")).toThrow();
    await advanceEntryPreviewBy(1_499);
    expect(findByTestId(renderer, "arrow-duel-what-if-overlay")).toBeTruthy();
    await advanceEntryPreviewBy(1);
    expect(() => findByTestId(renderer, "arrow-duel-what-if-overlay")).toThrow();

    abandonSprint(renderer);
    press(renderer, "back-practice-button");
    startArrowDuelSprint(renderer);
    expect(service.getSettings().sprintGuides.arrowDuelReplyCueStage).toBe(3);
    act(() => {
      findByTestId(renderer, "mock-chessboard").props.onReady();
    });
    await boardMove(renderer, requireArrowDuelState(activeSprintForTest(service)).correctMove);
    await advanceArrowDuelReplyToPrompt();
    await advanceEntryPreviewBy(999);
    expect(findByTestId(renderer, "arrow-duel-what-if-overlay")).toBeTruthy();
    await advanceEntryPreviewBy(1);
    expect(() => findByTestId(renderer, "arrow-duel-what-if-overlay")).toThrow();
  });

  it("advances Arrow Duel only after a correct opponent reply", async () => {
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service });
    const arrow = firstArrowDuelPuzzleForTest();

    startArrowDuelSprint(renderer);
    expect(collectText(findByTestId(renderer, "arrow-duel-reply-challenge"))).toContain(
      "Choose the best move"
    );
    act(() => {
      findByTestId(renderer, "mock-chessboard").props.onReady();
    });
    expect(findByTestId(renderer, "arrow-duel-candidate-overlay")).toBeTruthy();

    await boardMove(renderer, arrow.correctMove);
    const handoffBoard = findByTestId(renderer, "mock-chessboard");
    const resetBoard = handoffBoard.props.mockResetBoard as jest.Mock;
    const imperativeMove = handoffBoard.props.mockImperativeMove as jest.Mock;
    resetBoard.mockClear();
    imperativeMove.mockClear();

    expectText(renderer, "0 / 10");
    expect(collectText(renderer.root)).not.toContain("Correct");
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "backgroundColor", "#16A34A")).toBe(0);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "borderLeftColor", "#16A34A")).toBe(0);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "backgroundColor", "#DC2626")).toBe(0);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "borderLeftColor", "#DC2626")).toBe(0);
    expect(() => findByTestId(renderer, "feedback-panel")).toThrow();
    expect(service.listHistory()).toHaveLength(0);

    await settleArrowDuelReplyHandoff();
    const submittedChoice = parseBoardMove(arrow.correctMove);
    expect(resetBoard).toHaveBeenCalledWith(arrow.currentFen, {
      lastMove: null,
      slide: {
        durationMs: 500,
        from: submittedChoice.to,
        to: submittedChoice.from
      }
    });
    expect(imperativeMove).toHaveBeenCalledWith(parseBoardMove(arrow.wrongMove));
    expect(collectText(findByTestId(renderer, "arrow-duel-reply-challenge"))).toContain(
      "Find the reply"
    );
    expect(collectText(findByTestId(renderer, "arrow-duel-reply-timer"))).toBe("0:10");
    expect(renderer.root.findAllByProps({ testID: "arrow-duel-candidate-overlay" })).toHaveLength(0);

    await boardMove(renderer, arrow.puzzle.solutionMoves[1]!);
    expectText(renderer, "1 / 10");
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "arrow-duel-reply-challenge"))).toContain(
      "Find the reply"
    );
    expect(collectText(renderer.root)).not.toContain("Solved");
    expect(service.listHistory()).toHaveLength(1);
    await settleFeedbackSnapshot();

    expect(renderer.root.findAllByProps({ testID: "arrow-duel-candidate-overlay" })).toHaveLength(0);
    act(() => {
      findByTestId(renderer, "mock-chessboard").props.onReady();
    });
    expect(findByTestId(renderer, "arrow-duel-candidate-overlay")).toBeTruthy();
  });

  it("keeps the solver perspective through the staged Arrow Duel reply handoff", async () => {
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service });
    const arrow = firstArrowDuelPuzzleForTest();

    startArrowDuelSprint(renderer);
    const initialBoard = findByTestId(renderer, "mock-chessboard");
    const initialPerspective = initialBoard.props.flipped;
    const resetBoard = initialBoard.props.mockResetBoard as jest.Mock;
    const imperativeMove = initialBoard.props.mockImperativeMove as jest.Mock;
    act(() => {
      initialBoard.props.onReady();
    });
    resetBoard.mockClear();
    imperativeMove.mockClear();

    await boardMove(renderer, arrow.correctMove);

    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(findByTestId(renderer, "board-input-blocker")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(collectText(findByTestId(renderer, "arrow-duel-reply-challenge"))).toContain(
      "Choose the best move"
    );
    expect(findByTestId(renderer, "mock-chessboard").props.flipped).toBe(initialPerspective);
    expect(resetBoard).not.toHaveBeenCalled();
    expect(imperativeMove).not.toHaveBeenCalled();
    expect(() => findByTestId(renderer, "arrow-duel-what-if-overlay")).toThrow();

    await advanceArrowDuelReplyToPrompt();

    const replyBoard = findByTestId(renderer, "mock-chessboard");
    const replyPrompt = findByTestId(renderer, "arrow-duel-reply-challenge");
    const replyContext = findByTestId(renderer, "arrow-duel-reply-context");
    const replyCopyLayer = findByTestId(renderer, "arrow-duel-reply-copy-layer");
    expect(replyBoard.props.flipped).toBe(initialPerspective);
    expect(findByTestId(renderer, "board-input-blocker")).toBeTruthy();
    const submittedChoice = parseBoardMove(arrow.correctMove);
    expect(resetBoard).toHaveBeenCalledWith(arrow.currentFen, {
      lastMove: null,
      slide: {
        durationMs: 500,
        from: submittedChoice.to,
        to: submittedChoice.from
      }
    });
    expect(imperativeMove).not.toHaveBeenCalled();
    const whatIfOverlay = findByTestId(renderer, "arrow-duel-what-if-overlay");
    const whatIfTitle = findByTestId(renderer, "arrow-duel-what-if-title");
    expect(collectText(whatIfTitle)).toBe("What if you made\nthe other move?");
    expect(flattenTestStyle(whatIfTitle.props.style)).toEqual(expect.objectContaining({
      lineHeight: 27,
      maxWidth: 280,
      textAlign: "center",
      width: "100%"
    }));
    expect(collectText(findByTestId(renderer, "arrow-duel-what-if-detail"))).toBe(
      "Find the opponent’s reply in 10 seconds."
    );
    expect(findByTestId(renderer, "arrow-duel-what-if-announcement").props.accessibilityLabel).toBe(
      "What if you made the other move? Find the opponent’s reply in 10 seconds. Optional · Turn off in Settings"
    );
    expect(flattenTestStyle(whatIfOverlay.props.style)).toEqual(expect.objectContaining({
      backgroundColor: "rgba(15, 23, 42, 0.90)",
      bottom: 0,
      justifyContent: "center",
      left: 0,
      right: 0,
      top: 0,
      zIndex: 60
    }));
    expect(() => findByTestId(renderer, "arrow-duel-reply-timer")).toThrow();
    expect(collectText(replyPrompt)).toContain("Find the reply");
    expect(collectText(replyContext)).toBe(
      "If the tempting move was played, what happens next?"
    );
    expect(flattenTestStyle(replyCopyLayer.props.style)).toEqual(expect.objectContaining({
      gap: 5,
      position: "absolute"
    }));
    expect(flattenTestStyle(findByTestId(renderer, "practice-prompt-copy").props.style).gap)
      .toBe(5);
    expect(flattenTestStyle(replyPrompt.props.style)).toEqual(expect.objectContaining({
      height: PRACTICE_PROMPT_BASE_HEIGHT,
      width: "100%"
    }));

    await advanceEntryPreviewBy(1_499);
    expect(imperativeMove).not.toHaveBeenCalled();
    expect(findByTestId(renderer, "arrow-duel-what-if-overlay")).toBeTruthy();

    await advanceEntryPreviewBy(1);

    expect(imperativeMove).toHaveBeenCalledWith(parseBoardMove(arrow.wrongMove));
    expect(resetBoard.mock.invocationCallOrder[0]).toBeLessThan(
      imperativeMove.mock.invocationCallOrder[0]
    );
    expect(findByTestId(renderer, "mock-chessboard").props.flipped).toBe(initialPerspective);
    expect(() => findByTestId(renderer, "arrow-duel-what-if-overlay")).toThrow();
    expect(collectText(findByTestId(renderer, "arrow-duel-reply-timer"))).toBe("0:10");
    expect(requireArrowDuelState(activeSprintForTest(service)).phase).toBe("reply");
    expect(() => findByTestId(renderer, "board-input-blocker")).toThrow();
  });

  it("keeps the slower Arrow Duel undo silent before the tempting move", async () => {
    const service = createMobilePracticeService("familiar15");
    service.saveSettings({
      ...service.getSettings(),
      moveFeedback: {
        soundEnabled: true,
        hapticsEnabled: true
      }
    });
    const moveFeedbackClient = new FakeMoveFeedbackClient();
    const renderer = renderScreen({ practiceService: service, moveFeedbackClient });
    const arrow = firstArrowDuelPuzzleForTest();

    startArrowDuelSprint(renderer);
    await boardMove(renderer, arrow.correctMove);
    expect(moveFeedbackClient.requests).toHaveLength(1);

    await advanceArrowDuelReplyToPrompt();

    expect(moveFeedbackClient.requests).toHaveLength(1);
    const submittedChoice = parseBoardMove(arrow.correctMove);
    expect(
      findByTestId(renderer, "mock-chessboard").props.mockResetBoard
    ).toHaveBeenCalledWith(arrow.currentFen, {
      lastMove: null,
      slide: {
        durationMs: 500,
        from: submittedChoice.to,
        to: submittedChoice.from
      }
    });

    await finishArrowDuelReplyHandoff();

    expect(moveFeedbackClient.requests).toEqual([
      { cue: "move", playHaptic: true, playSound: true },
      { cue: "move", playHaptic: true, playSound: true }
    ]);
  });

  it("marks a wrong Arrow Duel reply for Review without extra result copy", async () => {
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service });
    const arrow = firstArrowDuelPuzzleForTest();

    startArrowDuelSprint(renderer);
    await boardMove(renderer, arrow.correctMove);
    await settleArrowDuelReplyHandoff();
    const replyFen = findByTestId(renderer, "mock-chessboard").props.fen;
    const expectedReply = arrow.puzzle.solutionMoves[1]!;
    const wrongReply = firstLegalNonCandidate(replyFen, [expectedReply]);
    await boardMove(renderer, wrongReply);

    expectSessionMistakes(renderer, 1);
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(collectText(renderer.root)).not.toContain("Incorrect");
    expect(collectText(renderer.root)).not.toContain("Added to Review");
    expect(service.listReviewQueue()).toHaveLength(1);
    expect(service.listHistory()).toHaveLength(1);
    await settleFeedbackSnapshot();
  });

  it("waits for the Arrow Duel handoff to settle after an immediate pause and resume", async () => {
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service });
    const arrow = firstArrowDuelPuzzleForTest();

    startArrowDuelSprint(renderer);
    await boardMove(renderer, arrow.correctMove);
    press(renderer, "session-pause");
    expect(findByTestId(renderer, "paused-session-panel")).toBeTruthy();

    press(renderer, "paused-session-resume");
    expect(requireArrowDuelState(activeSprintForTest(service)).phase).toBe("reply_handoff");
    expect(findByTestId(renderer, "board-input-blocker")).toBeTruthy();

    await settleArrowDuelReplyHandoff();

    expect(collectText(findByTestId(renderer, "arrow-duel-reply-challenge"))).toContain(
      "Find the reply"
    );
    expect(collectText(findByTestId(renderer, "arrow-duel-reply-timer"))).toBe("0:10");
    expect(requireArrowDuelState(activeSprintForTest(service)).phase).toBe("reply");
    expect(() => findByTestId(renderer, "board-input-blocker")).toThrow();
  });

  it("pauses Sprint and puzzle clocks during reply, then times out without redundant copy", async () => {
    let wallClockMs = Date.parse("2026-08-03T12:00:00.000Z");
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({
      currentTimeMs: () => wallClockMs,
      practiceService: service
    });
    const arrow = firstArrowDuelPuzzleForTest();

    startArrowDuelSprint(renderer);
    await boardMove(renderer, arrow.correctMove);
    expect(requireArrowDuelState(activeSprintForTest(service)).replyDeadlineAt).toBeUndefined();
    wallClockMs += 4_000;
    await settleArrowDuelReplyHandoff();
    const readyReply = requireArrowDuelState(activeSprintForTest(service));
    expect(readyReply.replyStartedAt).toBe(new Date(wallClockMs).toISOString());
    expect(readyReply.replyDeadlineAt).toBe(new Date(wallClockMs + 10_000).toISOString());
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(() => findByTestId(renderer, "board-input-blocker")).toThrow();
    const sprintTime = collectText(findByTestId(renderer, "session-timer"));
    const puzzleTime = collectText(findByTestId(renderer, "session-puzzle-timing-label"));

    act(() => {
      wallClockMs += 3_000;
      jest.advanceTimersByTime(3_000);
    });
    expect(collectText(findByTestId(renderer, "arrow-duel-reply-timer"))).toBe("0:07");
    expect(collectText(findByTestId(renderer, "session-timer"))).toBe(sprintTime);
    expect(collectText(findByTestId(renderer, "session-puzzle-timing-label"))).toBe(puzzleTime);

    press(renderer, "session-pause");
    expect(collectText(findByTestId(renderer, "session-timer"))).toBe(sprintTime);
    press(renderer, "paused-session-resume");
    expect(collectText(findByTestId(renderer, "session-timer"))).toBe(sprintTime);
    expect(collectText(findByTestId(renderer, "session-puzzle-timing-label"))).toBe(puzzleTime);

    act(() => {
      wallClockMs += 7_000;
      jest.advanceTimersByTime(7_000);
    });
    expect(collectText(findByTestId(renderer, "session-puzzle-timeout-overlay"))).toContain(
      "Timed out"
    );
    expect(collectText(findByTestId(renderer, "session-puzzle-timeout-overlay"))).not.toContain(
      "Added to Review"
    );
    expect(collectText(findByTestId(renderer, "arrow-duel-reply-timer"))).toBe("0:00");
    expectSessionMistakes(renderer, 1);
    expect(service.listReviewQueue()).toHaveLength(1);
  });

  it("shows a terminal Arrow Duel choice timeout before opening the summary", () => {
    let wallClockMs = Date.parse("2026-08-03T12:00:00.000Z");
    const service = createMobilePracticeService("familiar15");
    const started = service.startSprint({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 10,
      maxMistakes: 1,
      opponentReply: { enabled: true, seconds: 10 }
    }, new Date(wallClockMs).toISOString());
    const renderer = renderScreen({
      currentTimeMs: () => wallClockMs,
      practiceService: service
    });

    press(renderer, "practice-resume-card");
    const timeoutDelayMs = Date.parse(started.currentPuzzleDeadlineAt!) - wallClockMs;
    act(() => {
      wallClockMs += timeoutDelayMs;
      jest.advanceTimersByTime(timeoutDelayMs);
    });

    expect(collectText(findByTestId(renderer, "session-puzzle-timeout-overlay"))).toBe(
      "Timed out"
    );
    expect(() => findByTestId(renderer, "sprint-summary-panel")).toThrow();

    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(() => findByTestId(renderer, "session-puzzle-timeout-overlay")).toThrow();
    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-result-mistakes"))).toBe("1");
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain(
      "1 attempt · Included in replay"
    );
  });

  it("shows a terminal Arrow Duel reply timeout before opening the summary", async () => {
    let wallClockMs = Date.parse("2026-08-03T12:00:00.000Z");
    const service = createMobilePracticeService("familiar15");
    const started = service.startSprint({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 10,
      maxMistakes: 1,
      opponentReply: { enabled: true, seconds: 10 }
    }, new Date(wallClockMs).toISOString());
    const arrow = requireArrowDuelState(started);
    const renderer = renderScreen({
      currentTimeMs: () => wallClockMs,
      practiceService: service
    });

    press(renderer, "practice-resume-card");
    act(() => {
      findByTestId(renderer, "mock-chessboard").props.onReady();
    });
    await boardMove(renderer, arrow.correctMove);
    await settleArrowDuelReplyHandoff();
    const replying = requireArrowDuelState(activeSprintForTest(service));
    const timeoutDelayMs = Date.parse(replying.replyDeadlineAt!) - wallClockMs;
    act(() => {
      wallClockMs += timeoutDelayMs;
      jest.advanceTimersByTime(timeoutDelayMs);
    });

    expect(collectText(findByTestId(renderer, "session-puzzle-timeout-overlay"))).toBe(
      "Timed out"
    );
    expect(() => findByTestId(renderer, "sprint-summary-panel")).toThrow();

    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(() => findByTestId(renderer, "session-puzzle-timeout-overlay")).toThrow();
    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-result-mistakes"))).toBe("1");
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain(
      "1 attempt · Included in replay"
    );
  });

  it("shows a terminal Arrow Duel choice timeout when its board callback reaches the deadline first", async () => {
    let wallClockMs = Date.parse("2026-08-03T12:00:00.000Z");
    const service = createMobilePracticeService("familiar15");
    const started = service.startSprint({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 10,
      maxMistakes: 1,
      opponentReply: { enabled: true, seconds: 10 }
    }, new Date(wallClockMs).toISOString());
    const arrow = requireArrowDuelState(started);
    const renderer = renderScreen({
      currentTimeMs: () => wallClockMs,
      practiceService: service
    });

    press(renderer, "practice-resume-card");
    act(() => {
      findByTestId(renderer, "mock-chessboard").props.onReady();
    });
    wallClockMs = Date.parse(started.currentPuzzleDeadlineAt!);
    await boardMove(renderer, arrow.correctMove);

    expect(collectText(findByTestId(renderer, "session-puzzle-timeout-overlay"))).toBe(
      "Timed out"
    );
    expect(() => findByTestId(renderer, "sprint-summary-panel")).toThrow();

    act(() => {
      jest.advanceTimersByTime(799);
    });
    expect(findByTestId(renderer, "session-puzzle-timeout-overlay")).toBeTruthy();
    expect(() => findByTestId(renderer, "sprint-summary-panel")).toThrow();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(() => findByTestId(renderer, "session-puzzle-timeout-overlay")).toThrow();
    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-result-mistakes"))).toBe("1");
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain(
      "1 attempt · Included in replay"
    );
  });

  it("shows a terminal Arrow Duel reply timeout when its board callback reaches the deadline first", async () => {
    let wallClockMs = Date.parse("2026-08-03T12:00:00.000Z");
    const service = createMobilePracticeService("familiar15");
    const started = service.startSprint({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 10,
      maxMistakes: 1,
      opponentReply: { enabled: true, seconds: 10 }
    }, new Date(wallClockMs).toISOString());
    const arrow = requireArrowDuelState(started);
    const renderer = renderScreen({
      currentTimeMs: () => wallClockMs,
      practiceService: service
    });

    press(renderer, "practice-resume-card");
    act(() => {
      findByTestId(renderer, "mock-chessboard").props.onReady();
    });
    await boardMove(renderer, arrow.correctMove);
    await settleArrowDuelReplyHandoff();
    const replying = requireArrowDuelState(activeSprintForTest(service));
    wallClockMs = Date.parse(replying.replyDeadlineAt!);
    await boardMove(renderer, arrow.puzzle.solutionMoves[1]!);

    expect(collectText(findByTestId(renderer, "session-puzzle-timeout-overlay"))).toBe(
      "Timed out"
    );
    expect(() => findByTestId(renderer, "sprint-summary-panel")).toThrow();

    act(() => {
      jest.advanceTimersByTime(799);
    });
    expect(findByTestId(renderer, "session-puzzle-timeout-overlay")).toBeTruthy();
    expect(() => findByTestId(renderer, "sprint-summary-panel")).toThrow();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(() => findByTestId(renderer, "session-puzzle-timeout-overlay")).toThrow();
    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-result-mistakes"))).toBe("1");
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain(
      "1 attempt · Included in replay"
    );
  });

  it("excludes the opponent-reply pause from Sprint Result time", async () => {
    let wallClockMs = Date.parse("2026-08-03T12:00:00.000Z");
    const service = createMobilePracticeService("familiar15");
    const started = service.startSprint({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 1,
      maxMistakes: 3,
      opponentReply: { enabled: true, seconds: 10 }
    }, new Date(wallClockMs).toISOString());
    const arrow = requireArrowDuelState(started);
    const renderer = renderScreen({
      currentTimeMs: () => wallClockMs,
      practiceService: service
    });

    press(renderer, "practice-resume-card");
    act(() => {
      findByTestId(renderer, "mock-chessboard").props.onReady();
    });
    wallClockMs += 5_000;
    await boardMove(renderer, arrow.correctMove);
    await advanceArrowDuelReplyToPrompt();
    wallClockMs += 2_000;
    await finishArrowDuelReplyHandoff();

    wallClockMs += 8_000;
    await boardMove(renderer, arrow.puzzle.solutionMoves[1]!);
    await settleFeedbackSnapshot();

    expect(findByTestId(renderer, "sprint-summary-panel")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-result-time"))).toBe("Time00:05");
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
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("ThemesChoose one or more");
    expect(new Set(renderer.root.findAll((node) => (
      typeof node.props.testID === "string"
      && /^custom-theme-(?!mixed$|row$)/.test(node.props.testID)
    )).map((node) => node.props.testID)).size).toBe(24);
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("Checkmates");
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("Piece tactics");
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("Forcing motifs");
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("Pawns & endings");
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("Sacrifice");
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("Promotion");
    expect(() => findByTestId(renderer, "custom-summary-card")).toThrow();
    expect(collectText(findByTestId(renderer, "custom-summary-target"))).toBe("Estimated puzzles~15");
    expect(findByTestId(renderer, "custom-initial-rating-row")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "custom-initial-rating-value"))).toBe("Rating 600");
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
    press(renderer, "custom-theme-mate-in-2");
    expectText(renderer, "Mate in 2");
    expect(() => findByTestId(renderer, "custom-broaden-theme")).toThrow();
    press(renderer, "custom-theme-fork");
    expect(themeSelected(renderer, "mate-in-2")).toBe(true);
    expect(themeSelected(renderer, "fork")).toBe(true);
    press(renderer, "custom-theme-mate-in-2");
    expect(themeSelected(renderer, "mate-in-2")).toBe(false);
    expect(themeSelected(renderer, "fork")).toBe(true);
    press(renderer, "custom-theme-mixed");
    expect(themeSelected(renderer, "mixed")).toBe(true);
    expect(themeSelected(renderer, "fork")).toBe(false);
    press(renderer, "custom-theme-mate-in-2");
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
    expect(themeSelected(renderer, "mate-in-2")).toBe(false);
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("All");
    expect(() => findByTestId(renderer, "custom-broaden-theme")).toThrow();

    press(renderer, "custom-theme-mate-in-2");
    expect(themeSelected(renderer, "fork")).toBe(true);
    expect(themeSelected(renderer, "mate-in-2")).toBe(true);
    expect(() => findByTestId(renderer, "custom-broaden-theme")).toThrow();

    press(renderer, "custom-theme-fork");
    expect(themeSelected(renderer, "fork")).toBe(false);
    expect(themeSelected(renderer, "mate-in-2")).toBe(true);

    press(renderer, "custom-theme-mate-in-2");
    expect(themeSelected(renderer, "mate-in-2")).toBe(false);
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
    expect(themeSelected(renderer, "mixed")).toBe(true);
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
    press(renderer, "custom-theme-mate-in-2");
    press(renderer, "custom-theme-fork");
    expect(themeSelected(renderer, "mixed")).toBe(false);
    expect(themeSelected(renderer, "mate-in-2")).toBe(true);
    expect(themeSelected(renderer, "fork")).toBe(true);

    press(renderer, "start-sprint-button");

    expect(service.getActiveSprint()?.config.themes).toEqual(["fork", "mateIn2"]);
    expect(service.getActiveSprint()?.config.ratingKey).toBe("fork+mateIn2 custom 5/20");
    expect(service.listCustomSprintConfigs()[0]).toMatchObject({
      themes: ["fork", "mateIn2"],
      ratingKey: "fork+mateIn2 custom 5/20"
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

  it("prefills Add Run from a previous custom sprint with a retired theme", () => {
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
    const renderer = renderScreen({ practiceService: service, runManagementEnabled: true });

    press(renderer, "practice-add-run");

    expect(collectText(findByTestId(renderer, "custom-previous-custom-custom-180-30-mate-meta"))).toContain("Mate · 3 min · 30s pace · Last");
    expect(findByTestId(renderer, "custom-previous-custom-custom-180-30-mate").props.accessibilityLabel).toContain("Use Custom · 30s pace custom sprint");
    expect(findByTestId(renderer, "custom-previous-custom-custom-180-30-mate").props.accessibilityLabel).toContain("rating 850");
    press(renderer, "custom-previous-custom-custom-180-30-mate");
    expect(() => findByTestId(renderer, "custom-theme-mate")).toThrow();
    expect(findByTestId(renderer, "practice-run-elo-input").props.value).toBe("850");
    act(() => {
      findByTestId(renderer, "practice-run-name-input").props.onChangeText("Legacy Mates");
    });
    press(renderer, "practice-run-save");

    const saved = service.listPracticeRuns().find((run) => run.name === "Legacy Mates");
    expect(saved?.themes).toEqual(["mate"]);
    press(renderer, `practice-run-select-${saved?.id}`);
    press(renderer, "practice-run-start");
    expect(service.getActiveSprint()?.config.themes).toEqual(["mate"]);
  });

  it("keeps multiple previous custom configs attached to their own rating buckets", () => {
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
      id: "custom-custom-300-20-fork+mateIn2",
      mode: "custom",
      ratingKey: "fork+mateIn2 custom 5/20",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 15,
      maxMistakes: 3,
      themes: ["fork", "mateIn2"],
      lastStartedAt: "2026-07-05T00:00:00.000Z",
      playCount: 1
    });
    store.saveRating({
      key: "fork+mateIn2 custom 5/20",
      generation: 0,
      rating: 1100,
      games: 1
    });
    const renderer = renderScreen({ practiceService: new PracticeService(store) });

    press(renderer, "practice-mode-custom");

    const mateConfig = findByTestId(renderer, "custom-previous-custom-custom-180-30-mate");
    const forkConfig = findByTestId(renderer, "custom-previous-custom-custom-300-20-fork");
    const multiConfig = findByTestId(renderer, "custom-previous-custom-custom-300-20-fork-matein2");
    expect(collectText(mateConfig)).toContain("875");
    expect(mateConfig.props.accessibilityLabel).toContain("rating 875");
    expect(collectText(forkConfig)).toContain("1025");
    expect(forkConfig.props.accessibilityLabel).toContain("rating 1025");
    expect(collectText(multiConfig)).toContain("Mate in 2, Fork");
    expect(multiConfig.props.accessibilityLabel).toContain("rating 1100");

    press(renderer, "custom-previous-custom-custom-180-30-mate");
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("Mate");
    expect(collectText(findByTestId(renderer, "custom-target-count"))).toBe("~6");
    expect(collectText(findByTestId(renderer, "custom-initial-rating-value"))).toBe("Rating 875");

    press(renderer, "custom-previous-custom-custom-300-20-fork");
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("Fork");
    expect(collectText(findByTestId(renderer, "custom-target-count"))).toBe("~15");
    expect(collectText(findByTestId(renderer, "custom-initial-rating-value"))).toBe("Rating 1025");

    press(renderer, "custom-previous-custom-custom-300-20-fork-matein2");
    expect(themeSelected(renderer, "mixed")).toBe(false);
    expect(themeSelected(renderer, "fork")).toBe(true);
    expect(themeSelected(renderer, "mate-in-2")).toBe(true);
    expect(collectText(findByTestId(renderer, "custom-initial-rating-value"))).toBe("Rating 1100");
  });

  it("keeps a played custom rating editable as a difficulty control", () => {
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "practice-mode-custom");
    press(renderer, "custom-initial-rating-stepper-increase");
    press(renderer, "custom-initial-rating-stepper-increase");
    expect(collectText(findByTestId(renderer, "custom-initial-rating-value"))).toBe("Rating 800");

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
    expect(collectText(findByTestId(playedRenderer, "custom-initial-rating-row"))).toContain("Edit rating");
    expect(collectText(findByTestId(playedRenderer, "custom-initial-rating-value"))).toBe("Rating 900");
    expect(findByTestId(playedRenderer, "custom-initial-rating-row").props.accessibilityState).toEqual({ expanded: false });
    expect(() => findByTestId(playedRenderer, "custom-initial-rating-editor")).toThrow();
    expect(() => findByTestId(playedRenderer, "custom-initial-rating-stepper-decrease")).toThrow();

    press(playedRenderer, "custom-initial-rating-row");
    expect(findByTestId(playedRenderer, "custom-initial-rating-row").props.accessibilityState).toEqual({ expanded: true });
    expect(findByTestId(playedRenderer, "custom-initial-rating-editor")).toBeTruthy();
    expect(findByTestId(playedRenderer, "custom-initial-rating-stepper-decrease").props.accessibilityState).toEqual({ disabled: false });
    expect(findByTestId(playedRenderer, "custom-initial-rating-stepper-increase").props.accessibilityState).toEqual({ disabled: false });
    press(playedRenderer, "custom-initial-rating-stepper-decrease");
    expect(collectText(findByTestId(playedRenderer, "custom-initial-rating-value"))).toBe("Rating 800");
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
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain("In Review");
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain("0 attempts");
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
    expectText(renderer, "In Review");
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
    press(renderer, "history-filter-toggle");
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
    press(renderer, "history-attention-all");
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
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Source: Sprint");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).not.toContain("Result: Wrong");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    expectHistoryRowAccessibility(renderer, "Move e6f7");
    press(renderer, "history-filter-toggle");
    expect(historyFilterSelected(renderer, "history-source-sprint")).toBe(true);
    expect(historyFilterSelected(renderer, "history-result-wrong")).toBe(false);
    expect(findByTestId(renderer, "history-result-incomplete")).toBeTruthy();
    expect(findByTestId(renderer, "history-attention-flag-incomplete")).toBeTruthy();
    press(renderer, "history-result-wrong");
    expect(historyFilterSelected(renderer, "history-result-wrong")).toBe(true);
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Result: Wrong");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    expectNoHistoryRowAccessibility(renderer, "Move e6f7");
    press(renderer, "history-result-all");
    expect(historyFilterSelected(renderer, "history-result-wrong")).toBe(false);
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
    expect(historyFilterSelected(renderer, "history-result-wrong")).toBe(false);
    expect(() => findByTestId(renderer, "history-filter-arrow-duel-only")).toThrow();
    expect(() => findByTestId(renderer, "history-mode-filters")).toThrow();
    expect(() => findByTestId(renderer, "history-mode-standard")).toThrow();
    expect(() => findByTestId(renderer, "history-speed-filters")).toThrow();
    expect(() => findByTestId(renderer, "history-speed-20")).toThrow();
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
    expect(() => findByTestId(renderer, "history-review-status-filters")).toThrow();
    expect(findByTestId(renderer, "history-attention-flags")).toBeTruthy();
    expect(historyFilterSelected(renderer, "history-attention-flag-unclear")).toBe(false);
    expect(historyFilterSelected(renderer, "history-attention-flag-in-review")).toBe(false);
    expectHistoryRowAccessibility(renderer, "Move e6f7");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");

    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("20s pace");
    press(renderer, "history-attention-flag-in-review");
    expect(findByTestId(renderer, "history-attention-needs-attention").props.accessibilityState).toEqual({
      checked: true
    });
    expect(collectText(findByTestId(renderer, "history-performance-card"))).not.toContain("Accuracy");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain(
      "Attention: In review"
    );
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    expectNoHistoryRowAccessibility(renderer, "Move e6f7");
    press(renderer, "history-attention-flag-in-review");
    expect(findByTestId(renderer, "history-attention-all").props.accessibilityState).toEqual({
      checked: true
    });
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).not.toContain(
      "Attention:"
    );
    expectHistoryRowAccessibility(renderer, "Move e6f7");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");

    press(renderer, "history-result-wrong");
    expect(historyFilterSelected(renderer, "history-result-wrong")).toBe(true);
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Result: Wrong");
    expect(collectText(findByTestId(renderer, "history-performance-card"))).not.toContain("Wrong");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    expectNoHistoryRowAccessibility(renderer, "Move e6f7");
    press(renderer, "history-range-30d");
    expect(historyFilterSelected(renderer, "history-result-wrong")).toBe(true);
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("30 days");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Result: Wrong");
    press(renderer, "history-range-7d");
    expect(historyFilterSelected(renderer, "history-result-wrong")).toBe(true);
    press(renderer, "history-result-correct");
    expect(historyFilterSelected(renderer, "history-result-wrong")).toBe(false);
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Correct");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).not.toContain("Result: Wrong");
    press(renderer, "history-result-wrong");
    expect(historyFilterSelected(renderer, "history-result-wrong")).toBe(true);
    press(renderer, "history-result-all");
    expect(historyFilterSelected(renderer, "history-result-wrong")).toBe(false);
    expect(collectText(findByTestId(renderer, "history-performance-card"))).not.toContain("Accuracy");
    press(renderer, "history-result-wrong");

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
    expect(historyAttemptRow.props.accessibilityLabel).toContain("Replay Standard puzzle");
    expect(historyAttemptRow.props.accessibilityLabel).not.toContain("Review due");
    expect(collectText(historyAttemptRow)).not.toContain("Played g6g5 · Best f4g3");
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-identity`))).toMatch(
      /^ID .+ · Rating \d+$/
    );
    const historyAttemptThemes = collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-themes`));
    expect(historyAttemptThemes).toMatch(/^[A-Z]/);
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-pace`))).toContain("20s pace");
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-meta`))).toMatch(
      /Sprint · \d+s · (Today|Yesterday|Scheduled|[A-Z][a-z]{2} \d{1,2}(, \d{4})?)$/
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
    expect(() => findByTestId(renderer, "review-side-to-move")).toThrow();
    expect(findByTestId(renderer, "chessboard-king-black-sprite")).toBeTruthy();
    expect(findByTestId(renderer, "practice-prompt-side-glyph")).toBeTruthy();
    expect(flattenTestStyle(findByTestId(renderer, "chessboard-king-black-sprite").props.style).width).toBe(
      Math.round(Number(flattenTestStyle(findByTestId(renderer, "review-board").props.style).width) / 8) * 6
    );
    expect(testIdOrder(renderer, "practice-prompt", "review-board")).toBeLessThan(0);
    expect(findByTestId(renderer, "practice-prompt-icon")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-prompt"))).toContain("Find the best move");
    expect(collectText(findByTestId(renderer, "practice-prompt"))).toContain("For black.");
    expect(() => findByTestId(renderer, "review-theme-rail")).toThrow();
    press(renderer, "review-analysis-button");
    expect(collectText(findByTestId(renderer, "review-theme-rail"))).toBe(historyAttemptThemes);
    press(renderer, "review-close-analysis");
    expect(() => findByTestId(renderer, "review-theme-rail")).toThrow();
    expect(() => findByTestId(renderer, "review-theme-pill")).toThrow();
    expect(findByTestId(renderer, "review-reset-puzzle")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-exit"))).toBe("");
    expect(collectText(findByTestId(renderer, "review-reset-puzzle"))).toBe("↺");
    press(renderer, "review-exit");
    expect(findByTestId(renderer, "history-panel")).toBeTruthy();
  });

  it("shows curated tags in History but reveals replay tags only during Analysis", () => {
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
        "endgame",
        "mate"
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
    press(renderer, "history-attention-all");
    const themes = collectText(findByTestId(renderer, "history-attempt-curated-density-themes"));
    expect(themes).toContain("Advanced Pawn");
    expect(themes).toContain("Discovered Attack");
    expect(themes).toContain("Mate in 3");
    expect(themes).toContain("Sacrifice");
    expect(themes).not.toContain("Endgame");
    expect(findByTestId(renderer, "history-attempt-curated-density-pace")).toBeTruthy();

    press(renderer, "history-filter-toggle");
    expect(findByTestId(renderer, "history-theme-catalog-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });
    press(renderer, "history-theme-disclosure");
    expect(collectText(findByTestId(renderer, "history-theme-filters"))).toContain("Capturing Defender");
    expect(findByTestId(renderer, "history-theme-filter-rail-curated")).toBeTruthy();
    expect(findByTestId(renderer, "history-theme-mate-in-3")).toBeTruthy();
    expect(historyThemeSelected(renderer, "all")).toBe(true);
    press(renderer, "history-theme-pin");
    press(renderer, "history-theme-promotion");
    expect(historyThemeSelected(renderer, "all")).toBe(false);
    expect(historyThemeSelected(renderer, "pin")).toBe(true);
    expect(historyThemeSelected(renderer, "promotion")).toBe(true);
    expect(collectText(findByTestId(renderer, "history-theme-selection-detail"))).toBe(
      "Pin · Promotion"
    );
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain(
      "2 themes selected"
    );
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).not.toContain("Pin");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).not.toContain(
      "Promotion"
    );
    press(renderer, "history-theme-pin");
    expect(historyThemeSelected(renderer, "promotion")).toBe(true);
    expect(collectText(findByTestId(renderer, "history-theme-selection-detail"))).toBe(
      "Promotion"
    );
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain(
      "Promotion"
    );
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).not.toContain(
      "themes selected"
    );
    press(renderer, "history-theme-promotion");
    expect(historyThemeSelected(renderer, "all")).toBe(true);
    press(renderer, "history-theme-pin");
    press(renderer, "history-theme-promotion");
    press(renderer, "history-attempt-curated-density");
    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-theme-rail")).toThrow();
    expect(() => findByTestId(renderer, "review-theme-catalog")).toThrow();

    press(renderer, "review-analysis-button");
    const replayThemes = collectText(findByTestId(renderer, "review-theme-rail"));
    expect(replayThemes).toContain("Advanced Pawn");
    expect(replayThemes).toContain("Sacrifice");
    expect(replayThemes).not.toContain("Endgame");
    expect(() => findByTestId(renderer, "review-theme-rail-mate")).toThrow();
    const replayThemeCatalog = findByTestId(renderer, "review-theme-catalog");
    expect(collectText(replayThemeCatalog)).not.toContain("Themes");
    expect(testIdOrder(renderer, "review-board", "review-theme-catalog")).toBeLessThan(0);
    expect(flattenTestStyle(replayThemeCatalog.props.style).alignItems).toBe("center");
    expect(() => findByTestId(renderer, "review-theme-pill")).toThrow();
    press(renderer, "review-close-analysis");
    expect(() => findByTestId(renderer, "review-theme-rail")).toThrow();
    expect(() => findByTestId(renderer, "review-theme-catalog")).toThrow();
    press(renderer, "review-exit");
    expect(findByTestId(renderer, "history-theme-disclosure").props.accessibilityState).toEqual({
      expanded: false
    });
    press(renderer, "history-theme-disclosure");
    expect(historyThemeSelected(renderer, "pin")).toBe(true);
    expect(historyThemeSelected(renderer, "promotion")).toBe(true);
    expect(collectText(findByTestId(renderer, "history-theme-selection-detail"))).toBe(
      "Pin · Promotion"
    );
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain(
      "2 themes selected"
    );
  });

  it("shows a clean correct attempt in Needs attention after manual Review enrollment", () => {
    const store = new MemoryStore();
    store.seedPuzzles([sharedHistoryPuzzle()]);
    store.recordAttempt({
      id: "clean-manual-review-attempt",
      source: "sprint",
      sessionId: "clean-manual-review-session",
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
    const renderer = renderScreen({
      currentTimeMs: () => Date.parse("2026-07-17T12:02:00.000Z"),
      practiceService: service
    });

    press(renderer, "history-tab");
    expect(findByTestId(renderer, "history-empty-state")).toBeTruthy();
    press(renderer, "history-attention-all");
    expect(findByTestId(renderer, "history-attempt-clean-manual-review-attempt")).toBeTruthy();

    press(renderer, "history-attempt-clean-manual-review-attempt");
    expect(collectText(findByTestId(renderer, "review-schedule-add"))).toBe("Add to Review");
    press(renderer, "review-schedule-add");
    expect(collectText(findByTestId(renderer, "review-schedule-state"))).toBe("Due tomorrow");
    press(renderer, "review-exit");

    press(renderer, "history-attention-needs-attention");
    expect(findByTestId(renderer, "history-attempt-clean-manual-review-attempt")).toBeTruthy();
    press(renderer, "history-filter-toggle");
    press(renderer, "history-attention-flag-unclear");
    expect(historyFilterSelected(renderer, "history-attention-flag-unclear")).toBe(false);
    expect(historyFilterSelected(renderer, "history-attention-flag-in-review")).toBe(true);
    expect(findByTestId(renderer, "history-attempt-clean-manual-review-attempt")).toBeTruthy();
  });

  it("removes a record from Needs attention after both Unclear and Review are cleared", () => {
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
    expect(() => findByTestId(renderer, "history-quick-filters")).toThrow();
    expect(findByTestId(renderer, "history-attention-needs-attention").props.accessibilityState).toEqual({
      checked: true
    });
    expect(findByTestId(renderer, "history-attempt-unclear-history-attempt-unclear")).toBeTruthy();
    expect(() => findByTestId(renderer, "bookmark-glyph")).toThrow();

    press(renderer, "history-attempt-unclear-history-attempt");
    expect(findByTestId(renderer, "review-board")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-attempt-detail")).toThrow();
    expect(collectText(findByTestId(renderer, "history-attempt-unclear"))).toContain("Marked as unclear");
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

    press(renderer, "review-exit");
    expect(findByTestId(renderer, "history-attempt-unclear-history-attempt")).toBeTruthy();
    press(renderer, "history-attempt-unclear-history-attempt");
    press(renderer, "review-schedule-remove");
    press(renderer, "review-schedule-removal-confirm");
    expect(collectText(findByTestId(renderer, "review-schedule-state"))).toBe("Not scheduled for Review");

    press(renderer, "review-exit");
    expect(findByTestId(renderer, "history-attention-needs-attention").props.accessibilityState).toEqual({
      checked: true
    });
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
    press(renderer, "history-attention-all");
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
    press(renderer, "history-attention-all");
    press(renderer, "history-attempt-review-reminder-failure");
    press(renderer, "review-schedule-remove");
    press(renderer, "review-schedule-removal-confirm");
    await act(async () => {});

    expect(service.listReviewQueue()).toHaveLength(0);
    expect(service.listHistory()).toHaveLength(1);
    expect(scheduler.calls.length).toBeGreaterThan(0);
  });

  it("resets history filters to the default Sprint Needs attention view", () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    abandonSprint(renderer);
    press(renderer, "history-tab");
    expect(() => findByTestId(renderer, "history-filter-reset")).toThrow();

    press(renderer, "history-filter-toggle");
    press(renderer, "history-result-wrong");
    press(renderer, "history-source-review");
    press(renderer, "history-range-max");
    press(renderer, "history-side-black");

    expect(collectText(findByTestId(renderer, "history-filter-reset"))).toBe("Reset filters");

    expect(historyFilterSelected(renderer, "history-result-wrong")).toBe(true);
    expect(historyFilterSelected(renderer, "history-source-review")).toBe(true);
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("All Time");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Black");

    press(renderer, "history-filter-reset");

    expect(historyFilterSelected(renderer, "history-result-wrong")).toBe(false);
    expect(historyFilterSelected(renderer, "history-source-sprint")).toBe(true);
    expect(findByTestId(renderer, "history-attention-needs-attention").props.accessibilityState).toEqual({
      checked: true
    });
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("7 days");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("All puzzles");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Source: Sprint");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).not.toContain("Result: Wrong");
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

  it("shows only Home runs in the History run filter and preserves their Home order", () => {
    const service = createMobilePracticeService("random1000");
    const defaultPresentation = runManagementPresentation();
    const standardRun = defaultPresentation.runs.find((run) => run.id === "standard")!;
    const hiddenRun = defaultPresentation.runs.find((run) => run.id === "tactics-focus")!;
    const firstHomeRun = defaultPresentation.runs.find((run) => run.id === "candidate-sprint")!;
    [
      { ratingKey: standardRun.ratingKey!, completedAt: "2026-06-20T00:04:00.000Z" },
      { ratingKey: hiddenRun.ratingKey!, completedAt: "2026-06-20T00:03:00.000Z" },
      { ratingKey: "legacy custom 5/20", completedAt: "2026-06-20T00:02:00.000Z" },
      { ratingKey: firstHomeRun.ratingKey!, completedAt: "2026-06-20T00:01:00.000Z" }
    ].forEach(({ completedAt, ratingKey }) => {
      service.recordReviewAttempt({
        puzzleId: "000hf",
        mode: "standard",
        ratingKey,
        result: "correct",
        submittedMove: "c4b5",
        expectedMove: "c4b5",
        startedAt: "2026-06-20T00:00:00.000Z"
      }, completedAt);
    });
    const renderer = renderScreen({
      practiceService: service,
      runManagementPresentation: runManagementPresentation({
        runs: [firstHomeRun, standardRun],
        hiddenRuns: [hiddenRun]
      })
    });

    press(renderer, "history-tab");
    press(renderer, "history-attention-all");
    press(renderer, "history-filter-toggle");

    const filterTestIDs = [...new Set(
      collectTestIds(findByTestId(renderer, "history-rating-filters"))
        .filter((testID) => testID.startsWith("history-rating-"))
    )];
    expect(filterTestIDs).toEqual([
      "history-rating-filters",
      "history-rating-all",
      `history-rating-${firstHomeRun.ratingKey}`,
      `history-rating-${standardRun.ratingKey}`
    ]);
  });

  it("navigates history review across the full filtered result set, not just the visible page", async () => {
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
    press(renderer, "history-attention-all");
    press(renderer, "history-filter-toggle");
    press(renderer, "history-rating-standard 5/20");
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
    await settleEntryPreview();
    expectText(renderer, "20 / 22 · Standard");
  });

  it("keeps the Needs attention result set on History review navigation", () => {
    const store = new MemoryStore();
    store.seedPuzzles([sharedHistoryPuzzle()]);
    [
      {
        id: "attention-wrong",
        result: "wrong" as const,
        completedAt: "2026-07-23T12:00:30.000Z"
      },
      {
        id: "attention-clean",
        result: "correct" as const,
        completedAt: "2026-07-23T12:00:20.000Z"
      },
      {
        id: "attention-slow",
        result: "correct" as const,
        completedAt: "2026-07-23T12:00:10.000Z",
        timingStatus: "slow" as const
      }
    ].forEach((attempt) => {
      store.recordAttempt({
        id: attempt.id,
        source: "sprint",
        sessionId: `session-${attempt.id}`,
        puzzleId: "shared-history",
        mode: "standard",
        ratingKey: "standard 5/20",
        result: attempt.result,
        submittedMove: "e2e4",
        expectedMove: attempt.result === "wrong" ? "e2e3" : "e2e4",
        startedAt: "2026-07-23T12:00:00.000Z",
        completedAt: attempt.completedAt,
        ratingBefore: 600,
        ...("timingStatus" in attempt
          ? {
              timingStatus: attempt.timingStatus,
              elapsedMs: 41_000,
              unclear: true,
              unclearUpdatedAt: attempt.completedAt
            }
          : {})
      });
    });
    store.scheduleMistakeReview({
      puzzleId: "shared-history",
      mode: "standard",
      ratingKey: "standard 5/20"
    }, "2026-07-23T12:00:30.000Z");
    const renderer = renderScreen({
      currentTimeMs: () => Date.parse("2026-07-23T12:01:00.000Z"),
      practiceService: new PracticeService(store)
    });

    press(renderer, "history-tab");
    press(renderer, "history-attempt-attention-wrong");
    expectText(renderer, "1 / 3 · Standard");
    expect(findByTestId(renderer, "review-next").props.disabled).toBe(false);

    press(renderer, "review-exit");
    press(renderer, "history-attempt-attention-slow");
    expectText(renderer, "3 / 3 · Standard");
    expect(findByTestId(renderer, "review-previous").props.disabled).toBe(false);
    expect(findByTestId(renderer, "review-next").props.disabled).toBe(true);
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
    press(renderer, "history-attention-all");
    press(renderer, "history-filter-toggle");
    press(renderer, "history-rating-standard 5/20");
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
    press(renderer, "history-attention-all");
    press(renderer, "history-filter-toggle");
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

  it("refreshes one concise calendar-correct date label when History opens", () => {
    let nowMs = new Date(2026, 6, 27, 23, 50).getTime();
    const completedAtMs = new Date(2026, 6, 27, 23, 45).getTime();
    const completedAt = new Date(completedAtMs).toISOString();
    const store = new MemoryStore();
    store.seedPuzzles([sharedHistoryPuzzle()]);
    store.recordAttempt({
      id: "same-day-attempt",
      source: "sprint",
      sessionId: "same-day-session",
      puzzleId: "shared-history",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e2e4",
      expectedMove: "e2e4",
      startedAt: new Date(completedAtMs - 5_000).toISOString(),
      completedAt,
      ratingBefore: 600
    });
    const renderer = renderScreen({
      currentTimeMs: () => nowMs,
      practiceService: new PracticeService(store)
    });

    nowMs = new Date(2026, 6, 28, 0, 10).getTime();
    jest.setSystemTime(nowMs);
    press(renderer, "history-tab");
    press(renderer, "history-attention-all");

    expect(collectText(findByTestId(renderer, "history-attempt-same-day-attempt-meta"))).toBe(
      "Sprint · 5s · Yesterday"
    );
    expect(findByTestId(renderer, "history-attempt-same-day-attempt").props.accessibilityLabel).toContain(
      formatLocalCalendarDate(completedAt)
    );
  });

  it("keeps an archived Run name in History rows without exposing an archived Run filter", () => {
    const service = createMobilePracticeService("familiar15");
    service.setPuzzleSelectionScopeIds(["test-dual-mate-in-one"]);
    const run = service.createPracticeRun({
      id: "history-focus",
      name: "History Focus",
      mode: "custom",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 1,
      initialRating: 900
    }, "2026-06-20T11:59:00.000Z");
    service.startSprint(
      { mode: "custom", practiceRunId: run.id },
      "2026-06-20T12:00:00.000Z"
    );
    service.submitMove("c2b1", "2026-06-20T12:00:05.000Z");
    service.archivePracticeRun(run.id, "2026-06-20T12:01:00.000Z");
    const renderer = renderScreen({ practiceService: service, runManagementEnabled: true });

    press(renderer, "history-tab");
    press(renderer, "history-attention-all");
    press(renderer, "history-filter-toggle");
    press(renderer, "history-range-max");
    expect(() => findByTestId(renderer, `history-rating-${run.ratingKey}`)).toThrow();
    expectText(renderer, "History Focus");
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
    press(renderer, "history-attention-all");
    press(renderer, "history-filter-toggle");
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
    const renderer = renderScreen({
      practiceService: new PracticeService(store),
      systemBack
    });

    press(renderer, "history-tab");
    press(renderer, "history-attention-all");
    press(renderer, "history-filter-toggle");
    press(renderer, "history-range-max");
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
    expect(
      findByTestId(renderer, "history-attempt-malformed-context-attempt").props.accessibilityLabel
    ).toContain("Replay Unknown mode puzzle");
    press(renderer, "history-attempt-malformed-context-attempt");
    expect(() => findByTestId(renderer, "history-attempt-detail")).toThrow();
    expect(findByTestId(renderer, "practice-announcement").props.accessibilityLabel).toBe("Replay screen");
    expect(collectText(findByTestId(renderer, "review-title"))).toBe("Replay");
    expect(findByTestId(renderer, "review-exit").props.accessibilityLabel).toBe("Exit replay");
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
    press(renderer, "history-attention-all");
    press(renderer, "history-filter-toggle");
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
    press(firstRenderer, "history-attention-all");
    press(firstRenderer, "history-filter-toggle");
    press(firstRenderer, "history-range-max");
    press(firstRenderer, "history-rating-standard 5/20");
    press(firstRenderer, "history-result-wrong");
    press(firstRenderer, "history-attempt-process-local-filter-attempt");
    expect(findByTestId(firstRenderer, "review-board")).toBeTruthy();
    expect(() => findByTestId(firstRenderer, "history-attempt-detail")).toThrow();

    expect(firstSystemBack.invoke()).toBe(true);
    expect(findByTestId(firstRenderer, "history-panel")).toBeTruthy();
    expect(historyFilterSelected(firstRenderer, "history-result-wrong")).toBe(true);
    expect(collectText(findByTestId(firstRenderer, "history-active-filter-summary"))).toContain("All Time");
    expect(collectText(findByTestId(firstRenderer, "history-active-filter-summary"))).toContain("Standard · 20s pace");

    act(() => {
      firstRenderer.unmount();
    });
    const secondRenderer = renderScreen({ practiceService: service, systemBack: createTestSystemBackSource("android") });
    press(secondRenderer, "history-tab");

    expect(findByTestId(secondRenderer, "history-panel")).toBeTruthy();
    expect(findByTestId(secondRenderer, "history-attention-needs-attention").props.accessibilityState).toEqual({
      checked: true
    });
    expectDisclosureClosed(secondRenderer, "history-advanced-filters");
    expect(collectText(findByTestId(secondRenderer, "history-active-filter-summary"))).toContain("7 days");
    expect(collectText(findByTestId(secondRenderer, "history-active-filter-summary"))).toContain("All puzzles");
    expect(collectText(findByTestId(secondRenderer, "history-active-filter-summary"))).toContain("Source: Sprint");
  });

  it("keeps a multi-move History replay fixed while a board drag is active", async () => {
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
    press(renderer, "history-attention-all");
    const correctAttemptRow = historyAttemptRows(renderer)
      .find((row) => collectText(row).includes("Correct"));
    expect(correctAttemptRow).toBeTruthy();
    press(renderer, correctAttemptRow!.props.testID);

    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);

    act(() => {
      findByTestId(renderer, "review-board").props.onTouchStart();
    });
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(false);

    act(() => {
      findByTestId(renderer, "review-board").props.onTouchEnd();
    });
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);

    act(() => {
      findByTestId(renderer, "review-board").props.onTouchStart();
      findByTestId(renderer, "review-board").props.onTouchCancel();
    });
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);
  });

  it("keeps a post-Sprint replay fixed while a board drag is active", () => {
    const renderer = renderLabScenario("practice-sprint-result-replay");

    press(renderer, "review-mistakes-button");
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);

    act(() => {
      findByTestId(renderer, "review-board").props.onTouchStart();
    });
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(false);

    act(() => {
      findByTestId(renderer, "review-board").props.onTouchEnd();
    });
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);
  });

  it("makes Replay analysis board gestures block the surrounding native scroll gesture", () => {
    const renderer = renderLabScenario("practice-sprint-result-replay");

    press(renderer, "review-mistakes-button");
    press(renderer, "review-analysis-button");

    expect(findByTestId(renderer, "practice-gesture-root")).toBeTruthy();
    expect(findByTestId(renderer, "mock-chessboard").props.blocksExternalGesture.current.handlerTag).toBe(1);
  });

  it("keeps a scheduled Review fixed while a board drag is active", () => {
    const renderer = renderScreen({
      currentTimeMs: () => Date.parse("2026-06-20T12:00:00.000Z"),
      practiceService: createDueReviewService(1)
    });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);

    act(() => {
      findByTestId(renderer, "review-board").props.onTouchStart();
    });
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(false);

    act(() => {
      findByTestId(renderer, "review-board").props.onTouchEnd();
    });
    expect(findByTestId(renderer, "practice-main-scroll").props.scrollEnabled).toBe(true);
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
    press(renderer, "history-attention-all");
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
    const initialPromptKingTestIDs = promptKingTestIDs(renderer);
    const unsolvedPromptLayout = promptLayoutSlotTestIDs(renderer);
    expect(initialPromptKingTestIDs).toHaveLength(1);
    expect(unsolvedPromptLayout).toEqual([
      "practice-prompt-title-layout",
      "practice-prompt-context",
      "practice-prompt-hint"
    ]);
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");

    expectSolvedPromptReservesLayout(renderer, unsolvedPromptLayout);
    expect(promptKingTestIDs(renderer)).toEqual(initialPromptKingTestIDs);
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

  it("restores Arrow Duel replay after reset following a correct choice", async () => {
    const renderer = renderStoredArrowDuelReplay();
    const puzzle = storedArrowDuelPuzzle();
    await settleEntryPreview();
    const initialFen = findByTestId(renderer, "mock-chessboard").props.fen;
    const unsolvedPromptLayout = promptLayoutSlotTestIDs(renderer);
    expect(unsolvedPromptLayout).toEqual([
      "practice-prompt-title-layout",
      "practice-prompt-context",
      "practice-prompt-hint"
    ]);

    await completeArrowDuelReplay(renderer, {
      correctMove: puzzle.stockfishBestMove!,
      puzzle
    });
    expectSolvedPromptReservesLayout(renderer, unsolvedPromptLayout);
    expect(findByTestId(renderer, "review-reset-puzzle").props.disabled).toBe(false);
    const resetBoard = findByTestId(renderer, "mock-chessboard").props.mockResetBoard as jest.Mock;
    resetBoard.mockClear();

    press(renderer, "review-reset-puzzle");
    expect(resetBoard).toHaveBeenCalledWith(initialFen);
    await settleEntryPreview();

    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(initialFen);
    expect(findByTestId(renderer, "review-arrow-duel-candidate-overlay-order-f2g3-b2b1")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-prompt"))).toContain("Choose the best move");
  });

  it("keeps a wrong Arrow Duel Replay choice on the guided punishment line", async () => {
    const renderer = renderStoredArrowDuelReplay();

    await boardMove(renderer, "f2g3");

    expect(collectVisibleText(findByTestId(renderer, "practice-prompt"))).toContain(
      "Follow the blue line to see why this move fails."
    );

    await settleFeedbackSnapshot();
    await settleFeedbackSnapshot();

    expect(findByTestId(renderer, "review-guided-move-overlay")).toBeTruthy();
    expect(findByTestId(renderer, "review-guided-eval-list")).toBeTruthy();
    expect(collectVisibleText(findByTestId(renderer, "practice-prompt"))).toContain(
      "Follow the blue line to see why this move fails."
    );
  });

  it.each([
    { height: 1376, label: "iPad portrait", scale: 2, width: 1032 },
    { height: 820, label: "iPad landscape", scale: 2, width: 1180 },
    { height: 390, label: "compact wide-short window", scale: 3, width: 844 },
    { height: 346, label: "iPad-on-Mac wide-short window", scale: 2, width: 993 },
    { height: 700, label: "narrow resizable window", scale: 2, width: 280 }
  ])("keeps the Arrow Duel Replay prompt and board geometry fixed on $label", async ({
    height,
    scale,
    width
  }: {
    height: number;
    label: string;
    scale: number;
    width: number;
  }) => {
    (ReactNative as unknown as {
      __setWindowDimensions?: (dimensions: {
        fontScale: number;
        height: number;
        scale: number;
        width: number;
      }) => void;
    }).__setWindowDimensions?.({ width, height, scale, fontScale: 1 });
    const renderer = renderStoredArrowDuelReplay();
    const initialPromptLayout = promptLayoutSlotTestIDs(renderer);
    const initialBoardStyle = flattenTestStyle(findByTestId(renderer, "review-board").props.style);

    await boardMove(renderer, "f2g3");

    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(true);
    expect(collectVisibleText(findByTestId(renderer, "practice-prompt"))).toContain(
      "Follow the blue line to see why this move fails."
    );
    expect(flattenTestStyle(findByTestId(renderer, "review-board").props.style)).toEqual(
      initialBoardStyle
    );

    await settleFeedbackSnapshot();
    await settleFeedbackSnapshot();
    expect(promptLayoutSlotTestIDs(renderer)).toEqual(initialPromptLayout);
    expect(collectVisibleText(findByTestId(renderer, "practice-prompt"))).toContain(
      "Follow the blue line to see why this move fails."
    );
    expect(findByTestId(renderer, "review-guided-move-overlay")).toBeTruthy();
    expect(flattenTestStyle(findByTestId(renderer, "review-board").props.style)).toEqual(
      initialBoardStyle
    );
  });

  it("keeps Replay reset beside Analysis instead of in the header", () => {
    const renderer = renderStoredArrowDuelReplay();
    const replayActions = findByTestId(renderer, "review-analysis-toolbar");
    const headerActions = findByTestId(renderer, "review-header-actions");

    expect(replayActions.findByProps({ testID: "review-analysis-button" })).toBeTruthy();
    expect(replayActions.findByProps({ testID: "review-reset-puzzle" })).toBeTruthy();
    expect(headerActions.findAllByProps({ testID: "review-reset-puzzle" })).toHaveLength(0);
    expect(testIdOrder(renderer, "review-analysis-button", "review-reset-puzzle")).toBeLessThan(0);
  });

  it("uses the top-left Replay exit to close Analysis before leaving Replay", () => {
    const renderer = renderStoredArrowDuelReplay();
    const progress = collectText(findByTestId(renderer, "review-progress"));

    press(renderer, "review-analysis-button");
    expect(findByTestId(renderer, "review-close-analysis")).toBeTruthy();
    expect(findByTestId(renderer, "review-exit").props.accessibilityLabel).toBe("Close analysis");

    press(renderer, "review-exit");

    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-progress"))).toBe(progress);
    expect(() => findByTestId(renderer, "review-close-analysis")).toThrow();
    expect(findByTestId(renderer, "review-analysis-button")).toBeTruthy();
    expect(findByTestId(renderer, "review-exit").props.accessibilityLabel).toBe("Exit replay");
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
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain("In Review");
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain(
      "3 attempts · Included in replay"
    );
    expect(collectText(findByTestId(renderer, "sprint-result-review-note"))).toContain(
      "0 Unclear + 3 in Review · 3 total"
    );
    expect(collectText(findByTestId(renderer, "sprint-result-mistakes"))).toBe("3");
    expect(collectText(renderer.root)).not.toContain("Start new sprint");
    const reviewButton = findByTestId(renderer, "review-mistakes-button");
    const playAgainButton = findByTestId(renderer, "play-again-button");
    expect(reviewButton).toBeTruthy();
    expect(playAgainButton).toBeTruthy();
    expect(collectText(reviewButton)).toContain("Replay 3 attempts");
    expect(hasStyleEntry(reviewButton, "backgroundColor", "#2563EB")).toBe(true);
    expect(hasStyleEntry(playAgainButton, "backgroundColor", "#2563EB")).toBe(false);
  });

  it("previews two Unclear and two In Review attempts as a four-entry Replay with status actions", async () => {
    const renderer = renderLabScenario("practice-sprint-result-replay");

    expect(collectText(findByTestId(renderer, "sprint-result-unclear-summary"))).toContain(
      "Included in replay"
    );
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain(
      "In Review"
    );
    expect(collectText(findByTestId(renderer, "sprint-result-review-note"))).toContain(
      "2 Unclear + 2 in Review"
    );
    expect(collectText(findByTestId(renderer, "sprint-result-review-note"))).toContain(
      "4 total"
    );
    expect(collectText(findByTestId(renderer, "review-mistakes-button"))).toBe(
      "Replay 4 attempts"
    );

    press(renderer, "review-mistakes-button");

    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-title"))).toBe("Replay");
    expect(findByTestId(renderer, "practice-announcement").props.accessibilityLabel).toBe(
      "Replay screen"
    );
    expect(collectText(findByTestId(renderer, "review-title"))).toBe("Replay");
    expect(collectText(findByTestId(renderer, "review-progress"))).toContain("1 / 4");
    expect(() => findByTestId(renderer, "review-source-pill")).toThrow();
    expect(() => findByTestId(renderer, "review-context-unclear")).toThrow();
    expect(() => findByTestId(renderer, "review-context-needs-review")).toThrow();
    expect(collectText(findByTestId(renderer, "history-attempt-clear-unclear"))).toBe(
      "Mark clear"
    );
    expect(() => findByTestId(renderer, "review-schedule-add")).toThrow();
    press(renderer, "history-attempt-clear-unclear");
    expect(() => findByTestId(renderer, "history-attempt-clear-unclear")).toThrow();

    press(renderer, "review-next");
    await settleEntryPreview();
    expect(collectText(findByTestId(renderer, "review-progress"))).toContain("2 / 4");
    expect(collectText(findByTestId(renderer, "history-attempt-clear-unclear"))).toBe(
      "Mark clear"
    );
    expect(() => findByTestId(renderer, "review-context-unclear")).toThrow();
    expect(() => findByTestId(renderer, "review-context-needs-review")).toThrow();

    press(renderer, "review-next");
    await settleEntryPreview();
    expect(collectText(findByTestId(renderer, "review-progress"))).toContain("3 / 4");
    expect(() => findByTestId(renderer, "history-attempt-clear-unclear")).toThrow();
    expect(collectText(findByTestId(renderer, "review-schedule-remove"))).toBe(
      "Remove from Review"
    );
    expect(collectText(findByTestId(renderer, "review-schedule-state"))).toBe("Due tomorrow");

    press(renderer, "review-next");
    await settleEntryPreview();
    expect(collectText(findByTestId(renderer, "review-progress"))).toContain("4 / 4");
    expect(() => findByTestId(renderer, "history-attempt-clear-unclear")).toThrow();
    expect(collectText(findByTestId(renderer, "review-schedule-remove"))).toBe(
      "Remove from Review"
    );
    expect(collectText(findByTestId(renderer, "review-schedule-state"))).toBe("Due tomorrow");
  });

  it("shows an overlapping Unclear and in-Review attempt once in the Replay total", () => {
    const puzzle = sharedHistoryPuzzle();
    const replayAttempt = (id: string, unclear: boolean): AttemptEvent => ({
      id,
      source: "sprint",
      sessionId: "overlap-result",
      puzzleId: puzzle.id,
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e2e4",
      expectedMove: "e2e4",
      startedAt: "2026-07-18T11:59:55.000Z",
      completedAt: "2026-07-18T12:00:00.000Z",
      ratingBefore: 900,
      ...(unclear ? { unclear: true } : {})
    });
    const renderer = renderScreen({
      sprintRulesDesignPreview: {
        initialResultState: {
          ...completedRatingSprintState({
            id: "overlap-result",
            mode: "standard",
            completedAt: "2026-07-18T12:00:00.000Z",
            ratingBefore: 900,
            ratingAfter: 900
          }),
          correctCount: 3,
          currentPuzzleIndex: 3
        },
        resultReplayItems: [
          { attempt: replayAttempt("unclear-only", true), inReview: false, puzzle },
          { attempt: replayAttempt("both", true), inReview: true, puzzle },
          { attempt: replayAttempt("review-only", false), inReview: true, puzzle }
        ],
        resultUnclearSummary: {
          slowMarkedCount: 0,
          userMarkedCount: 2
        }
      }
    });

    expect(collectText(findByTestId(renderer, "sprint-result-review-note"))).toContain(
      "2 Unclear + 2 in Review · 1 in both · 3 total"
    );
    expect(collectText(findByTestId(renderer, "review-mistakes-button"))).toBe(
      "Replay 3 attempts"
    );
  });

  it("opens a one-shot mistake review after a timeout-only sprint failure", async () => {
    const service = createMobilePracticeService("random1000");
    startSprintWithPuzzleTiming(service, {
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      puzzleTiming: {
        slowAfterSeconds: null,
        timeoutAfterSeconds: 10
      },
      targetCorrect: 15,
      maxMistakes: 1
    });
    const timedOutPuzzleId = activeSprintForTest(service).currentPuzzle?.puzzle.id;
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "practice-resume-card");
    await settleEntryPreview();
    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(collectText(findByTestId(renderer, "session-puzzle-timeout-overlay"))).toBe(
      "Timed out"
    );
    expect(collectText(renderer.root)).not.toContain("Sprint failed");
    act(() => {
      jest.advanceTimersByTime(800);
    });
    expectText(renderer, "Sprint failed");
    expect(collectText(findByTestId(renderer, "sprint-result-mistakes"))).toBe("1");
    press(renderer, "review-mistakes-button");

    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-current-puzzle-id"))).toBe(timedOutPuzzleId);
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
    expect(() => findByTestId(renderer, "review-theme-rail")).toThrow();
    press(renderer, "review-analysis-button");
    expect(collectText(findByTestId(renderer, "review-theme-rail"))).toContain("Mate in 2");
    expect(() => findByTestId(renderer, "review-theme-rail-mate")).toThrow();
    press(renderer, "review-close-analysis");
    expect(() => findByTestId(renderer, "review-theme-rail")).toThrow();
    expect(() => findByTestId(renderer, "review-theme-pill")).toThrow();
    expect(collectText(findByTestId(renderer, "review-schedule-state"))).toBe("Due tomorrow");
    expect(collectText(findByTestId(renderer, "review-schedule-remove"))).toBe("Remove from Review");
    press(renderer, "review-schedule-remove");
    press(renderer, "review-schedule-removal-confirm");
    expect(() => findByTestId(renderer, "review-schedule-control")).toThrow();
    expect(() => findByTestId(renderer, "review-schedule-add")).toThrow();
    expectText(renderer, "1 / 3 · Standard");
    expect(findByTestId(renderer, "review-previous").props.disabled).toBe(true);
    expect(findByTestId(renderer, "review-next").props.disabled).toBe(false);
    expect(findByTestId(renderer, "review-analysis-toolbar").findByProps({ testID: "review-reset-puzzle" })).toBeTruthy();
    press(renderer, "review-next");
    await settleEntryPreview();
    expectText(renderer, "2 / 3 · Standard");
    press(renderer, "review-previous");
    await settleEntryPreview();
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
    expect(findByTestId(renderer, "mock-chessboard").props.fen).not.toBe(reviewFen);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(false);
    await settleEntryPreview();
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

  it("shows the stable Review Today layout and only the four approved quick filters", () => {
    const service = createMobilePracticeService("random1000");
    const oldestDueDate = formatReviewDay("2026-06-21");
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
    expect(findByTestId(renderer, "review-filter-options-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });
    expect(findByTestId(renderer, "review-filter-summary-motion").props).toMatchObject({
      accessibilityElementsHidden: false,
      pointerEvents: "auto"
    });
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toBe("All");
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).not.toContain("total");
    expect(findByTestId(renderer, "review-due-items")).toBeTruthy();
    expect(findByTestId(renderer, "review-today-history")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-context-list")).toThrow();
    expect(() => findByTestId(renderer, "review-difficulty-list")).toThrow();
    expect(collectText(findByTestId(renderer, "review-tomorrow-count"))).toBe("0");
    expect(collectText(findByTestId(renderer, "review-next-seven-days-count"))).toBe("0");
    expect(collectText(findByTestId(renderer, "review-total-count"))).toBe("1");
    expectText(renderer, "Today");
    expect(findByTestId(renderer, "review-due-card").props.accessibilityLabel).toContain("All · Ready now");
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
    const duePuzzleId = service.getDueReviewItems("2026-06-21T12:00:00.000Z")[0]!.puzzle.id;
    const dueItemTestID = `review-due-item-${duePuzzleId}-standard-standard-5-20`;
    const dueItem = findByTestId(renderer, dueItemTestID);
    expect(dueItem.props.accessibilityLabel).toContain("Scheduled retry");
    expect(dueItem.props.accessibilityLabel).toContain("First missed 1 day ago");
    expect(dueItem.props.accessibilityLabel).toContain("1 attempt, 1 miss");
    expect(dueItem.props.accessibilityLabel).not.toContain("Due now");
    expect(dueItem.props.accessibilityLabel).not.toContain("Overdue");
    expect(collectText(findByTestId(renderer, `${dueItemTestID}-meta`))).toBe(
      "1 attempt · 1 miss · Standard · 20s pace"
    );
    expect(collectText(findByTestId(renderer, `${dueItemTestID}-badge`))).toBe("↻");

    press(renderer, "review-filter-toggle");
    expect(findByTestId(renderer, "review-filter-toggle").props.accessibilityState).toEqual({ expanded: true });
    expect(findByTestId(renderer, "review-filter-summary-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });
    expect(findByTestId(renderer, "review-queue-filters")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-all")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-overdue")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-repeat-misses")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-arrow-duel")).toBeTruthy();
    const reviewFilterTestIDs = new Set(renderer.root.findAll(
      (node) => node.props.accessibilityRole === "button"
        && typeof node.props.testID === "string"
        && node.props.testID.startsWith("review-filter-")
        && node.props.testID !== "review-filter-toggle"
    ).map((node) => node.props.testID as string));
    expect(reviewFilterTestIDs).toEqual(new Set([
      "review-filter-all",
      "review-filter-overdue",
      "review-filter-repeat-misses",
      "review-filter-arrow-duel"
    ]));

    press(renderer, "review-filter-repeat-misses");
    expect(findByTestId(renderer, "review-start-due").props.accessibilityState).toEqual({ disabled: true });
    expect(collectText(findByTestId(renderer, "review-due-summary"))).toBe("No matching scheduled reviews");
    expect(collectText(findByTestId(renderer, "review-today-to-review-toggle"))).toContain("0");
    expect(findByTestId(renderer, "review-today-to-review-empty")).toBeTruthy();

    press(renderer, "review-filter-toggle");
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toBe("Missed 2+ times");
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).not.toContain("matches");
    expect(findByTestId(renderer, "review-filter-toggle").props.accessibilityLabel).toContain(
      "Missed 2+ times selected"
    );
    press(renderer, "review-filter-toggle");
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
    expect(() => findByTestId(renderer, "review-analysis-panel")).toThrow();
    expect(collectText(findByTestId(renderer, "review-timer"))).toBe("00:40");
    expect(styleEntryMatches(findByTestId(renderer, "review-timer").props.style, "fontSize", 21)).toBe(true);
    expect(() => findByTestId(renderer, "review-next")).toThrow();
    expect(() => findByTestId(renderer, "review-previous")).toThrow();
    expect(() => findByTestId(renderer, "review-start-session-mistakes")).toThrow();
  });

  it("shows today's scheduled retries before completed reviews from real attempt history", () => {
    jest.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    const service = createDueReviewService(3);
    service.recordReviewAttempt({
      puzzleId: "review-badge-1",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e2e4",
      expectedMove: "e2e4",
      startedAt: "2026-06-20T11:00:00.000Z"
    }, "2026-06-20T11:00:05.000Z");
    service.recordReviewAttempt({
      puzzleId: "review-badge-2",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "e2e4",
      expectedMove: "e2e4",
      startedAt: "2026-06-21T11:00:00.000Z"
    }, "2026-06-21T11:00:05.000Z");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");

    expect(findByTestId(renderer, "review-filter-toggle").props.accessibilityState).toEqual({ expanded: false });
    expect(collectText(findByTestId(renderer, "review-due-items"))).toContain("Today to review");
    expect(collectText(findByTestId(renderer, "review-today-to-review-toggle"))).toContain("2");
    expect(findByTestId(renderer, "review-today-to-review-toggle").props.accessibilityState).toEqual({ expanded: true });
    expect(hasStyleEntry(findByTestId(renderer, "review-today-to-review-toggle"), "height", 44)).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "review-today-to-review-toggle-meta"), "height", 18)).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "review-today-to-review-toggle-meta"), "alignItems", "center")).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "review-today-to-review-toggle-count"), "lineHeight", 18)).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "review-today-to-review-toggle-chevron"), "height", 18)).toBe(true);
    expect(collectText(findByTestId(renderer, "review-due-items"))).toContain("First missed 2 days ago");
    expect(collectText(findByTestId(renderer, "review-due-items"))).toContain("Last retry 1 day ago");
    expect(collectText(findByTestId(renderer, "review-today-history"))).toContain("Completed today");
    expect(collectText(findByTestId(renderer, "review-completed-today-toggle"))).toContain("1");
    expect(findByTestId(renderer, "review-completed-today-toggle").props.accessibilityState).toEqual({ expanded: true });
    expect(hasStyleEntry(findByTestId(renderer, "review-completed-today-toggle"), "height", 44)).toBe(true);
    expect(findByTestId(renderer, "review-today-history-items")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("1 / 3");

    const firstRetryRow = findByTestId(renderer, "review-due-item-review-badge-0-standard-standard-5-20");
    expect(firstRetryRow.props.accessibilityLabel).toContain("Scheduled retry");
    expect(firstRetryRow.props.accessibilityLabel).toContain("First missed 2 days ago");
    expect(firstRetryRow.props.accessibilityLabel).toContain("1 attempt, 1 miss");
    expect(firstRetryRow.props.accessibilityLabel).not.toContain("Due now");
    expect(firstRetryRow.props.accessibilityLabel).not.toContain("Overdue");
    expect(collectText(findByTestId(renderer, "review-due-item-review-badge-0-standard-standard-5-20-meta"))).toBe(
      "1 attempt · 1 miss · Standard · 20s pace"
    );
    expect(collectText(findByTestId(renderer, "review-due-item-review-badge-1-standard-standard-5-20-meta"))).toBe(
      "2 attempts · 1 miss · Standard · 20s pace"
    );
    expect(collectText(findByTestId(renderer, "review-due-item-review-badge-0-standard-standard-5-20-badge"))).toBe("↻");
    expect(hasStyleEntry(
      findByTestId(renderer, "review-due-item-review-badge-0-standard-standard-5-20-badge"),
      "backgroundColor",
      "#2563EB"
    )).toBe(true);

    press(renderer, "review-today-to-review-toggle");
    expect(findByTestId(renderer, "review-today-to-review-toggle").props.accessibilityState).toEqual({ expanded: false });
    expect(findByTestId(renderer, "review-today-to-review-items-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });

    press(renderer, "review-completed-today-toggle");
    expect(findByTestId(renderer, "review-completed-today-toggle").props.accessibilityState).toEqual({ expanded: false });
    expect(findByTestId(renderer, "review-today-history-items-motion").props).toMatchObject({
      accessibilityElementsHidden: true,
      pointerEvents: "none"
    });

    press(renderer, "review-today-to-review-toggle");
    expect(findByTestId(renderer, "review-due-item-review-badge-0-standard-standard-5-20")).toBeTruthy();
    press(renderer, "review-completed-today-toggle");
    expect(findByTestId(renderer, "review-today-history-items")).toBeTruthy();
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

    expect(() => findByTestId(renderer, "practice-review-strip")).toThrow();
    expect(collectText(findByTestId(renderer, "review-tab-badge"))).toBe("1");

    press(renderer, "review-tab");

    expect(collectText(findByTestId(renderer, "review-due-summary"))).toBe("Overdue now");
    expect(() => findByTestId(renderer, "review-overdue-count")).toThrow();
    expect(() => findByTestId(renderer, "review-overdue-summary")).toThrow();
    expect(findByTestId(renderer, "review-due-card").props.accessibilityLabel).toContain("All · Overdue now");
    press(renderer, "review-filter-toggle");
    press(renderer, "review-filter-overdue");
    expect(findByTestId(renderer, "review-start-due").props.accessibilityState).toEqual({ disabled: false });
    expect(collectText(findByTestId(renderer, "review-due-items"))).not.toContain("Due now");
    expect(collectText(findByTestId(renderer, "review-due-items"))).not.toContain("Overdue");
  });

  it("keeps both Today sections visible with inline empty states for an empty review queue", () => {
    const renderer = renderScreen();

    press(renderer, "review-tab");

    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
    expectText(renderer, "You're done for today");
    expect(collectText(findByTestId(renderer, "review-next-due"))).toBe(
      "Next: after the first missed puzzle is due"
    );
    expect(collectText(findByTestId(renderer, "review-today-to-review-toggle"))).toContain("0");
    expect(collectText(findByTestId(renderer, "review-completed-today-toggle"))).toContain("0");
    expect(findByTestId(renderer, "review-today-to-review-empty")).toBeTruthy();
    expect(findByTestId(renderer, "review-today-history-empty")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-empty-state")).toThrow();
    expect(findByTestId(renderer, "review-start-due").props.accessibilityState).toEqual({ disabled: true });
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

    expectText(renderer, "You're done for today");
    expect(collectText(findByTestId(renderer, "review-next-due"))).toBe(
      `Next: ${formatReviewDay("2099-01-02")}`
    );
    expect(findByTestId(renderer, "review-today-to-review-empty")).toBeTruthy();
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

  it("keeps official due review contexts as separate Today rows", () => {
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
    const dueItems = service.getDueReviewItems(new Date().toISOString());
    const standardItem = dueItems.find((item) => item.review.mode === "standard")!;
    const arrowDuelItem = dueItems.find((item) => item.review.mode === "arrow_duel")!;
    const standardItemTestID = `review-due-item-${standardItem.puzzle.id}-standard-${safeTestIdForTest(standardItem.review.ratingKey)}`;
    expect(findByTestId(renderer, standardItemTestID)).toBeTruthy();
    expect(findByTestId(renderer, `review-due-item-${arrowDuelItem.puzzle.id}-arrow-duel-${safeTestIdForTest(arrowDuelItem.review.ratingKey)}`)).toBeTruthy();
    expect(() => findByTestId(renderer, "review-session")).toThrow();

    press(renderer, standardItemTestID);

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
    const dueItemTestIDs = service.getDueReviewItems(new Date().toISOString()).map(
      (item) => `review-due-item-${item.puzzle.id}-standard-${safeTestIdForTest(item.review.ratingKey)}`
    );
    expect(dueItemTestIDs).toHaveLength(2);
    for (const testID of dueItemTestIDs) {
      expect(findByTestId(renderer, testID)).toBeTruthy();
    }
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
    const dueItemButtonTestIDs = [...new Set(renderer.root.findAll(
      (node) => typeof node.props.testID === "string"
        && node.props.testID.startsWith("review-due-item-")
        && node.props.accessibilityRole === "button"
    ).map((button) => button.props.testID as string))];
    expect(dueItemButtonTestIDs).toEqual([
      "review-due-item-000hf-standard-z-oldest-standard-5-20",
      "review-due-item-00008-standard-a-newer-standard-5-30"
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
    expect(() => findByTestId(renderer, "review-side-to-move")).toThrow();
    expect(styleEntryMatches(findByTestId(renderer, "review-context-strip").props.style, "justifyContent", "center")).toBe(true);
    expect(findByTestId(renderer, "review-timer-slot")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-current-expected-move"))).toBe("e2e6");
    expect(collectText(findByTestId(renderer, "review-board-state"))).toBe("locked");
    await settleEntryPreview();
    expect(collectText(findByTestId(renderer, "review-board-state"))).toBe("ready");
    const initialPromptKingTestIDs = promptKingTestIDs(renderer);
    const unsolvedPromptLayout = promptLayoutSlotTestIDs(renderer);
    expect(initialPromptKingTestIDs).toHaveLength(1);
    expect(unsolvedPromptLayout).toEqual([
      "practice-prompt-title-layout",
      "practice-prompt-context",
      "practice-prompt-hint"
    ]);

    await boardMove(renderer, "e2e6");
    expect(collectText(findByTestId(renderer, "review-board-state"))).toBe("locked");
    await settleFeedbackSnapshot();
    expect(service.listHistory({ source: "scheduled_review" }) as unknown[]).toHaveLength(0);
    expect(collectText(findByTestId(renderer, "review-current-expected-move"))).toBe("e6f7");
    expect(collectText(findByTestId(renderer, "review-board-state"))).toBe("ready");

    const timerBeforeSolvedFeedback = collectText(findByTestId(renderer, "review-timer"));
    await boardMove(renderer, "e6f7");
    await act(async () => {
      jest.advanceTimersByTime(100);
      await Promise.resolve();
    });

    expectSolvedPromptReservesLayout(renderer, unsolvedPromptLayout);
    expect(collectText(findByTestId(renderer, "review-timer"))).toBe(timerBeforeSolvedFeedback);
    expect(promptKingTestIDs(renderer)).toEqual(initialPromptKingTestIDs);
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

  it("gives official due reviews twice the original sprint pace", async () => {
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
    expect(collectText(findByTestId(renderer, "review-puzzle-timeout-overlay"))).toBe("Timed out");
    expect(findByTestId(renderer, "review-session")).toBeTruthy();

    await advanceEntryPreviewBy(800);
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

  it("keeps the daily review denominator fixed and resumes an unfinished puzzle after exit", async () => {
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
    expect(collectText(findByTestId(renderer, "review-puzzle-timeout-overlay"))).toBe("Timed out");
    await advanceEntryPreviewBy(800);
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
    await settleEntryPreview();

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

    press(renderer, "review-exit");
    expect(() => findByTestId(renderer, "review-close-analysis")).toThrow();
    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    press(renderer, "review-reset-puzzle");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).not.toBe(reviewFen);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(false);
    await settleEntryPreview();
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(reviewFen);
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
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-line-0"))).toMatch(/^-0\.2.*Qe8/);
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-line-1"))).toMatch(/^-0\.1.*Qxd6/);
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
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-line-0"))).toMatch(/^-3\.6.*Qxd6/);
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-line-1"))).toMatch(/^\+1\.2.*Qe8/);
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-raw-lines"))).toContain("info depth 12 multipv 1 score cp 360 pv d8d6");
    });
  });

  it("does not start deferred Stockfish diagnostics after leaving the panel", async () => {
    const systemBack = createTestSystemBackSource("android");
    const stockfish = createScriptedStockfishTransport(() => {});
    let resolvePrewarm: ((ready: boolean) => void) | undefined;
    const prewarm = jest.fn(() => new Promise<boolean>((resolve) => {
      resolvePrewarm = resolve;
    }));
    const renderer = renderScreen({
      stockfish: {
        createTransport: () => stockfish.transport,
        prewarm
      },
      systemBack
    });

    press(renderer, "settings-tab");
    press(renderer, "settings-stockfish-diagnostics");
    expect(prewarm).toHaveBeenCalledTimes(1);
    expect(systemBack.invoke()).toBe(true);
    expect(findByTestId(renderer, "settings-panel")).toBeTruthy();

    await act(async () => {
      resolvePrewarm?.(true);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(stockfish.commands.some((command) => command.startsWith("go depth "))).toBe(false);
    expect(stockfish.listenerCount()).toBe(0);
  });

  it("replays a wrong Arrow Duel choice through its guided punishment line", async () => {
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service });
    const wrongMoves: string[] = [];

    startArrowDuelSprint(renderer);
    const firstPuzzle = requireArrowDuelState(activeSprintForTest(service)).puzzle;
    const firstPuzzleSolution = [...firstPuzzle.solutionMoves];

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
    expect(findByTestId(renderer, "practice-prompt-icon")).toBeTruthy();
    expect(findByTestId(renderer, "practice-prompt-side-glyph")).toBeTruthy();
    expect(testIdOrder(renderer, "practice-prompt", "review-board")).toBeLessThan(0);
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

    const initialPromptLayout = promptLayoutSlotTestIDs(renderer);
    expect(initialPromptLayout).toEqual([
      "practice-prompt-title-layout",
      "practice-prompt-context",
      "practice-prompt-hint"
    ]);
    const initialPerspective = findByTestId(renderer, "mock-chessboard").props.flipped;
    await boardMove(renderer, wrongMoves[0] as string);
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(true);
    expect(collectVisibleText(findByTestId(renderer, "practice-prompt"))).toContain(
      "Follow the blue line to see why this move fails."
    );

    await settleFeedbackSnapshot();
    await settleFeedbackSnapshot();
    expectText(renderer, "1 / 3 · Arrow Duel");
    expect(() => findByTestId(renderer, "review-arrow-legend")).toThrow();
    expect(() => findByTestId(renderer, "review-arrow-choice-marker")).toThrow();
    expect(collectText(renderer.root)).not.toContain("Green = best move");
    expect(collectText(renderer.root)).not.toContain("You chose:");
    expect(findByTestId(renderer, "review-guided-move-overlay")).toBeTruthy();
    expect(findByTestId(renderer, "review-guided-eval-list")).toBeTruthy();
    expect(collectVisibleText(findByTestId(renderer, "practice-prompt"))).toContain(
      "Follow the blue line to see why this move fails."
    );
    expect(findByTestId(renderer, "mock-chessboard").props.flipped).toBe(initialPerspective);

    for (let cursor = 2; cursor < firstPuzzleSolution.length; cursor += 2) {
      const punishmentMove = firstPuzzleSolution[cursor];
      if (!punishmentMove) {
        break;
      }
      await boardMove(renderer, punishmentMove);
      await settleFeedbackSnapshot();
      expect(findByTestId(renderer, "mock-chessboard").props.flipped).toBe(initialPerspective);
      if (cursor + 2 < firstPuzzleSolution.length) {
        expect(findByTestId(renderer, "review-guided-move-overlay")).toBeTruthy();
        expect(collectVisibleText(renderer.root)).not.toContain("Solved");
      }
    }
    expect(collectVisibleText(renderer.root)).toContain("Solved");
    const finalFen = findByTestId(renderer, "mock-chessboard").props.fen;
    press(renderer, "review-analysis-button");
    const terminalAnalysisLine = findByTestId(renderer, "review-analysis-line-0");
    expect(collectText(terminalAnalysisLine)).toMatch(/(?:1-0|0-1).*Checkmate.*Current position/);
    expect(terminalAnalysisLine.props.disabled).toBe(true);
    expect(terminalAnalysisLine.props.accessibilityState).toEqual({ disabled: true });
    expect(() => findByTestId(renderer, "review-analysis-line-1")).toThrow();
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(finalFen);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    press(renderer, "review-close-analysis");
    await settleFeedbackSnapshot();
    press(renderer, "review-reset-puzzle");
    expectText(renderer, "Choose the best move");
    expect(() => findByTestId(renderer, "review-guided-move-overlay")).toThrow();
    press(renderer, "review-exit");
    expect(findByTestId(renderer, "practice-mode-standard")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-session")).toThrow();
  });

  it("opens Arrow Duel analysis from the solved review position without candidate arrows or an input lock", async () => {
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({ practiceService: service });
    const firstPuzzle = firstArrowDuelPuzzleForTest();
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

    const reviewStartFen = findByTestId(renderer, "mock-chessboard").props.fen;
    let solvedReviewFen = reviewStartFen;
    for (let cursor = 0; cursor < firstPuzzle.puzzle.solutionMoves.length; cursor += 1) {
      solvedReviewFen = mustFenAfterMove(solvedReviewFen, firstPuzzle.puzzle.solutionMoves[cursor]!);
    }
    const unsolvedPromptStyle = flattenTestStyle(
      findByTestId(renderer, "practice-prompt").props.style
    );
    expect(unsolvedPromptStyle.minHeight).toBeUndefined();
    expect(unsolvedPromptStyle.height).toBe(PRACTICE_PROMPT_BASE_HEIGHT);
    await completeArrowDuelReplay(renderer, firstPuzzle);
    expectText(renderer, "Solved");
    const solvedPromptStyle = flattenTestStyle(
      findByTestId(renderer, "practice-prompt").props.style
    );
    expect(solvedPromptStyle.minHeight).toBeUndefined();
    expect(solvedPromptStyle.height).toBe(unsolvedPromptStyle.height);
    press(renderer, "review-analysis-button");

    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(solvedReviewFen);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(countStyleEntry(findByTestId(renderer, "review-board"), "backgroundColor", "#16A34A")).toBe(0);
    expect(countStyleEntry(findByTestId(renderer, "review-board"), "backgroundColor", "#DC2626")).toBe(0);

    expect(() => findByTestId(renderer, "review-arrow-duel-candidate-overlay")).toThrow();
  });

  it("opens analysis from a nonterminal final review position without an input lock", async () => {
    jest.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    const store = new MemoryStore();
    const puzzle: Puzzle = {
      ...sharedHistoryPuzzle(),
      id: "final-position-analysis-puzzle",
      initialFen: "4k3/8/8/8/8/8/4P3/4K3 b - - 0 1",
      solutionMoves: ["e8e7", "e2e4"]
    };
    store.seedPuzzles([puzzle]);
    store.recordAttempt({
      id: "final-position-analysis",
      source: "sprint",
      sessionId: "final-position-analysis-session",
      puzzleId: puzzle.id,
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "wrong",
      submittedMove: "e2e3",
      expectedMove: "e2e4",
      startedAt: "2026-06-21T11:00:00.000Z",
      completedAt: "2026-06-21T11:00:05.000Z",
      ratingBefore: 600
    });
    const renderer = renderScreen({ practiceService: new PracticeService(store) });

    press(renderer, "history-tab");
    press(renderer, "history-attention-all");
    press(renderer, "history-attempt-final-position-analysis");
    await settleEntryPreview();
    const reviewStartFen = findByTestId(renderer, "mock-chessboard").props.fen;
    const finalFen = mustFenAfterMove(reviewStartFen, "e2e4");
    await boardMove(renderer, "e2e4");
    press(renderer, "review-analysis-button");

    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(finalFen);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);

    const analysisMove = firstLegalMoveNotIn(finalFen, []);
    const expectedAnalysisFen = mustFenAfterMove(finalFen, analysisMove);
    await boardMove(renderer, analysisMove);
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(expectedAnalysisFen);
  });

  it.each([
    { label: "iPhone 17 Pro Max bottom tabs", width: 440, height: 956, scale: 3, rail: false, badgeTop: -8 },
    { label: "iPad expanded rail", width: 1180, height: 820, scale: 2, rail: true, badgeTop: -7 }
  ])("lets a two-digit review badge fit native font metrics at the icon's upper-right in $label", ({
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

    const renderer = renderScreen({ practiceService: createDueReviewService(18) });
    const badge = findByTestId(renderer, "review-tab-badge");
    const badgeStyle = flattenTestStyle(badge.props.style);
    const iconStyle = flattenTestStyle(findByTestId(renderer, "review-tab-icon").props.style);

    expect(collectText(badge)).toBe("18");
    expect(badge.props.allowFontScaling).toBe(false);
    expect(badge.props.numberOfLines).toBe(1);
    expect(badgeStyle.left).toBe(24);
    expect(badgeStyle.right).toBeUndefined();
    expect(badgeStyle.top).toBe(badgeTop);
    expect(badgeStyle.minHeight).toBe(18);
    expect(badgeStyle.minWidth).toBe(18);
    expect(badgeStyle.width).toBeUndefined();
    expect(badgeStyle.paddingHorizontal).toBe(4);
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
    expect(flattenTestStyle(badge.props.style).width).toBeUndefined();
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

  it("requires the configured opponent reply in scheduled Arrow Duel Review", async () => {
    const service = createMobilePracticeService("random1000");
    const builtInRun = service.getActivePracticeRun("arrow-duel");
    service.updatePracticeRun(builtInRun.id, {
      name: builtInRun.name,
      rating: service.getRating(builtInRun.ratingKey).rating,
      opponentReply: { enabled: true, seconds: 12 }
    }, "2026-06-20T00:00:00.000Z");
    const sprint = service.startSprint({
      mode: "arrow_duel",
      practiceRunId: builtInRun.id,
      puzzleSelectionSeed: "review-reply"
    }, "2026-06-20T00:00:00.000Z");
    const arrow = requireArrowDuelState(sprint);
    service.submitMove(arrow.wrongMove, "2026-06-20T00:00:05.000Z");
    jest.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    await settleEntryPreview();
    await boardMove(renderer, arrow.correctMove);

    expect(service.listHistory({ source: "scheduled_review" })).toHaveLength(0);
    await advanceArrowDuelReplyToPrompt();
    expect(findByTestId(renderer, "review-arrow-duel-what-if-overlay")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-arrow-duel-what-if-detail"))).toBe(
      "Find the opponent’s reply in 12 seconds."
    );
    expect(collectText(findByTestId(
      renderer,
      "review-arrow-duel-what-if-settings-hint"
    ))).toBe("Optional · Turn off in Settings");

    await advanceEntryPreviewBy(1_499);
    expect(findByTestId(renderer, "review-arrow-duel-what-if-overlay")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-arrow-duel-reply-timer")).toThrow();
    await advanceEntryPreviewBy(1);
    expect(collectText(findByTestId(renderer, "review-arrow-duel-reply-timer"))).toBe("0:12");
    expect(collectText(findByTestId(renderer, "practice-prompt-hint")))
      .toBe("Optional · Turn off in Settings");
    expect(collectText(findByTestId(renderer, "review-current-expected-move"))).toBe(
      arrow.puzzle.solutionMoves[1]
    );
    await boardMove(renderer, arrow.puzzle.solutionMoves[1]!);
    await settleFeedbackSnapshot();

    expect(service.listHistory({ source: "scheduled_review" })).toEqual([
      expect.objectContaining({
        expectedMove: arrow.puzzle.solutionMoves[1],
        result: "correct",
        submittedMove: arrow.puzzle.solutionMoves[1]
      })
    ]);
  });

  it("starts the scheduled Review reply countdown only after the What If handoff is playable", async () => {
    const service = createMobilePracticeService("random1000");
    const builtInRun = service.getActivePracticeRun("arrow-duel");
    service.updatePracticeRun(builtInRun.id, {
      name: builtInRun.name,
      rating: service.getRating(builtInRun.ratingKey).rating,
      opponentReply: { enabled: true, seconds: 12 }
    }, "2026-06-20T00:00:00.000Z");
    const sprint = service.startSprint({
      mode: "arrow_duel",
      practiceRunId: builtInRun.id,
      puzzleSelectionSeed: "review-reply-timeout"
    }, "2026-06-20T00:00:00.000Z");
    const arrow = requireArrowDuelState(sprint);
    service.submitMove(arrow.wrongMove, "2026-06-20T00:00:05.000Z");
    jest.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    await settleEntryPreview();
    await boardMove(renderer, arrow.correctMove);
    await settleArrowDuelReplyHandoff();

    expect(collectText(findByTestId(renderer, "review-arrow-duel-reply-timer"))).toBe("0:12");
    await advanceEntryPreviewBy(11_500);
    expect(collectText(findByTestId(renderer, "review-arrow-duel-reply-timer"))).toBe("0:01");
    expect(service.listHistory({ source: "scheduled_review" })).toHaveLength(0);

    await advanceEntryPreviewBy(1_250);
    expect(collectText(findByTestId(renderer, "review-puzzle-timeout-overlay"))).toBe(
      "Timed out"
    );
    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(service.listHistory({ source: "scheduled_review" })).toEqual([
      expect.objectContaining({
        expectedMove: arrow.puzzle.solutionMoves[1],
        result: "wrong",
        submittedMove: "__timeout__"
      })
    ]);

    await advanceEntryPreviewBy(800);
    expect(() => findByTestId(renderer, "review-puzzle-timeout-overlay")).toThrow();
    expect(() => findByTestId(renderer, "review-session")).toThrow();
  });

  it("keeps the one-choice scheduled Review behavior when the global setting is off", async () => {
    const service = createMobilePracticeService("random1000");
    const builtInRun = service.getActivePracticeRun("arrow-duel");
    service.updatePracticeRun(builtInRun.id, {
      name: builtInRun.name,
      rating: service.getRating(builtInRun.ratingKey).rating,
      opponentReply: { enabled: true, seconds: 17 }
    }, "2026-06-20T00:00:00.000Z");
    const sprint = service.startSprint({
      mode: "arrow_duel",
      practiceRunId: builtInRun.id,
      puzzleSelectionSeed: "review-no-reply"
    }, "2026-06-20T00:00:00.000Z");
    const arrow = requireArrowDuelState(sprint);
    service.submitMove(arrow.wrongMove, "2026-06-20T00:00:05.000Z");
    service.saveSettings({
      ...service.getSettings(),
      arrowDuel: { opponentReplyEnabled: false }
    });
    jest.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    await settleEntryPreview();
    await boardMove(renderer, arrow.correctMove);
    await settleFeedbackSnapshot();

    expect(() => findByTestId(renderer, "review-arrow-duel-what-if-overlay")).toThrow();
    expect(service.listHistory({ source: "scheduled_review" })).toEqual([
      expect.objectContaining({
        expectedMove: arrow.correctMove,
        result: "correct",
        submittedMove: arrow.correctMove
      })
    ]);
  });

  it("solves Arrow Duel Replay from the reply side without a countdown or guided arrows", async () => {
    const renderer = renderStoredArrowDuelReplay();
    await settleEntryPreview();
    const puzzle = tacticalProfilePuzzleFixture.find((candidate) => candidate.id === "00008");
    if (!puzzle) {
      throw new Error("Expected the stored Arrow Duel Replay puzzle");
    }

    const replayPerspective = findByTestId(renderer, "mock-chessboard").props.flipped;
    await boardMove(renderer, puzzle.stockfishBestMove!);
    await settleArrowDuelReplyHandoff();

    expect(() => findByTestId(renderer, "review-timer-slot")).toThrow();
    expect(() => findByTestId(renderer, "review-arrow-duel-reply-timer")).toThrow();
    await boardMove(renderer, puzzle.solutionMoves[1]!);
    await settleFeedbackSnapshot();
    expect(() => findByTestId(renderer, "review-guided-move-overlay")).toThrow();
    expect(findByTestId(renderer, "mock-chessboard").props.flipped).toBe(replayPerspective);
    expect(collectVisibleText(findByTestId(renderer, "practice-prompt"))).toContain(
      "Find the best move"
    );
    expect(collectText(findByTestId(renderer, "review-current-expected-move"))).toBe(
      puzzle.solutionMoves[3]
    );
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe("w");
    expect(collectVisibleText(renderer.root)).not.toContain("Follow the blue line");
    expect(collectVisibleText(renderer.root)).not.toContain("Solved");

    for (let cursor = 3; cursor < puzzle.solutionMoves.length; cursor += 2) {
      await boardMove(renderer, puzzle.solutionMoves[cursor]!);
      await settleFeedbackSnapshot();
      expect(() => findByTestId(renderer, "review-guided-move-overlay")).toThrow();
      expect(findByTestId(renderer, "mock-chessboard").props.flipped).toBe(replayPerspective);
    }

    expect(collectVisibleText(renderer.root)).toContain("Solved");
  });

  it("keeps the Arrow Duel scheduled Review prompt geometry through solved feedback", async () => {
    const service = createMobilePracticeService("random1000");
    const sprintState = service.startSprint(
      {
        mode: "arrow_duel",
        durationSeconds: 300,
        perPuzzleSeconds: 30,
        targetCorrect: 10,
        maxMistakes: 3
      },
      "2026-06-20T00:00:00.000Z"
    );
    const arrowDuel = requireArrowDuelState(sprintState);
    service.submitMove(
      currentArrowWrongMove(sprintState),
      "2026-06-20T00:00:05.000Z"
    );
    jest.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    await settleEntryPreview();

    const unsolvedPromptLayout = promptLayoutSlotTestIDs(renderer);
    expect(unsolvedPromptLayout).toEqual([
      "practice-prompt-title-layout",
      "practice-prompt-context",
      "practice-prompt-hint"
    ]);

    await boardMove(renderer, arrowDuel.correctMove);
    await settleArrowDuelReplyHandoff();
    await boardMove(renderer, arrowDuel.puzzle.solutionMoves[1]!);

    expectSolvedPromptReservesLayout(renderer, unsolvedPromptLayout);
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
    press(renderer, "history-filter-toggle");
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
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("Rating 600");
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("Edit rating");
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
    expectText(renderer, "Each rating helps Chessticize choose the right puzzle difficulty.");
    expect(collectText(renderer.root)).not.toContain("Adjust only when");
    expect(findByTestId(renderer, "settings-advanced-rating-standard")).toBeTruthy();
    expect(findByTestId(renderer, "settings-advanced-rating-arrow-duel")).toBeTruthy();
    expect(() => findByTestId(renderer, "settings-advanced-rating-blitz")).toThrow();
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard"))).toContain("Standard · 20s pace");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard"))).not.toContain("standard 5/20");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-arrow-duel"))).toContain("Arrow Duel · 30s pace");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-arrow-duel"))).not.toContain("arrow duel 5/30");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-value"))).toBe("Rating 600");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-increase"))).toBe("");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-decrease"))).toBe("");
    expect(findByTestId(renderer, "settings-advanced-rating-standard-decrease").props.accessibilityState).toEqual({ disabled: true });
    expect(collectText(renderer.root)).not.toContain("Locked");
    press(renderer, "settings-advanced-rating-standard-increase");
    expectText(renderer, "Standard rating set to 625");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-value"))).toBe("Rating 625");
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("Rating 625");
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("Standard and Arrow Duel difficulty");
    expect(findByTestId(renderer, "settings-advanced-rating-standard-decrease").props.accessibilityState).toEqual({ disabled: false });
    press(renderer, "settings-advanced-rating-standard-decrease");
    expectText(renderer, "Standard rating set to 600");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-value"))).toBe("Rating 600");
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

  it("persists formal Move Feedback settings after Notifications without preview controls", async () => {
    const service = createMobilePracticeService("random1000");
    const moveFeedbackClient = new FakeMoveFeedbackClient();
    const renderer = renderScreen({ practiceService: service, moveFeedbackClient });

    press(renderer, "settings-tab");

    expect(collectText(findByTestId(renderer, "settings-move-feedback-section")))
      .toContain("Move Feedback");
    expect(
      testIdOrder(
        renderer,
        "settings-notifications-section",
        "settings-move-feedback-section"
      )
    ).toBeLessThan(0);
    expect(
      testIdOrder(
        renderer,
        "settings-move-feedback-section",
        "settings-profile-section"
      )
    ).toBeLessThan(0);
    expect(() => findByTestId(renderer, "settings-move-feedback-previews")).toThrow();
    expect(service.getSettings().moveFeedback).toEqual({
      soundEnabled: false,
      hapticsEnabled: true
    });

    press(renderer, "settings-move-sound-toggle");
    expect(service.getSettings().moveFeedback).toEqual({
      soundEnabled: true,
      hapticsEnabled: true
    });
    press(renderer, "settings-move-sound-toggle");
    expect(service.getSettings().moveFeedback).toEqual({
      soundEnabled: false,
      hapticsEnabled: true
    });
    press(renderer, "settings-move-haptics-toggle");
    expect(service.getSettings().moveFeedback).toEqual({
      soundEnabled: false,
      hapticsEnabled: false
    });

    press(renderer, "practice-tab");
    startStandardSprint(renderer);
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    expect(moveFeedbackClient.requests).toEqual([]);
  });

  it("emits feedback only after committed user and opponent moves", async () => {
    const moveFeedbackClient = new FakeMoveFeedbackClient();
    const renderer = renderStandardSequenceScreen({ moveFeedbackClient });

    press(renderer, "settings-tab");
    press(renderer, "settings-move-sound-toggle");
    press(renderer, "practice-tab");
    startStandardSprint(renderer);
    expect(moveFeedbackClient.requests).toEqual([{
      cue: "capture",
      playSound: true,
      playHaptic: true
    }]);
    await boardMove(renderer, "d8a8");
    expect(moveFeedbackClient.requests).toHaveLength(1);
    await boardMove(renderer, "e2e6");

    expect(moveFeedbackClient.requests).toEqual([
      {
        cue: "capture",
        playSound: true,
        playHaptic: true
      },
      {
        cue: "capture",
        playSound: true,
        playHaptic: true
      }
    ]);

    await settleFeedbackSnapshot();

    expect(moveFeedbackClient.requests).toEqual([
      {
        cue: "capture",
        playSound: true,
        playHaptic: true
      },
      {
        cue: "capture",
        playSound: true,
        playHaptic: true
      },
      {
        cue: "move",
        playSound: true,
        playHaptic: true
      }
    ]);
  });

  it("places guide reset after Profile and immediately before Feedback", () => {
    const sectionCandidates = [
      "settings-guidance-section",
      "settings-sync-section",
      "settings-notifications-section",
      "settings-move-feedback-section",
      "settings-profile-section",
      "settings-feedback-section",
      "settings-about-section"
    ];
    const topLevelSettingsIds = (
      renderer: TestRenderer.ReactTestRenderer
    ): string[] => sectionCandidates.filter((testID) => {
      try {
        findByTestId(renderer, testID);
        return true;
      } catch {
        return false;
      }
    }).sort((left, right) => testIdOrder(renderer, left, right));
    const expectGuidanceImmediatelyBeforeFeedback = (
      ids: string[],
      profileExpected: boolean
    ): void => {
      const guidanceIndex = ids.indexOf("settings-guidance-section");
      const feedbackIndex = ids.indexOf("settings-feedback-section");

      expect(guidanceIndex).toBeGreaterThanOrEqual(0);
      expect(feedbackIndex).toBe(guidanceIndex + 1);
      if (profileExpected) {
        expect(guidanceIndex).toBe(ids.indexOf("settings-profile-section") + 1);
      } else {
        expect(ids).not.toContain("settings-profile-section");
      }
    };

    const withProfile = renderScreen({ sprintGuidanceEnabled: true });
    press(withProfile, "settings-tab");
    expectGuidanceImmediatelyBeforeFeedback(topLevelSettingsIds(withProfile), true);

    const withoutProfile = renderScreen({
      runEloEditingMovedToHome: true,
      sprintGuidanceEnabled: true
    });
    press(withoutProfile, "settings-tab");
    expectGuidanceImmediatelyBeforeFeedback(topLevelSettingsIds(withoutProfile), false);
  });

  it("does not emit due Review feedback when attempt persistence fails", async () => {
    jest.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    const store = new FailingAttemptStore("Review write failed");
    const service = new PracticeService(store);
    configureMobilePracticePuzzleSource(service, "random1000");
    store.scheduleMistakeReview({
      puzzleId: "000hf",
      mode: "standard",
      ratingKey: "standard 5/20"
    }, "2026-06-19T12:00:00.000Z");
    const moveFeedbackClient = new FakeMoveFeedbackClient();
    const renderer = renderScreen({ practiceService: service, moveFeedbackClient });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    await settleEntryPreview();
    moveFeedbackClient.requests.length = 0;

    await boardMove(renderer, "c4b5");

    expect(moveFeedbackClient.requests).toEqual([]);
    expect(service.listHistory({ source: "scheduled_review" })).toEqual([]);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
  });

  it("routes feedback to GitHub only after an explicit privacy handoff", async () => {
    const renderer = renderScreen();
    const openURLSpy = jest.spyOn(ReactNative.Linking, "openURL").mockResolvedValue(undefined);

    press(renderer, "settings-tab");

    const feedbackSection = findByTestId(renderer, "settings-feedback-section");
    expect(collectText(feedbackSection)).toContain("Help & Feedback");
    expect(collectText(feedbackSection)).toContain("Help improve Chessticize");
    expect(collectText(feedbackSection)).toContain("Report a bug, request a feature");
    expect(collectText(feedbackSection)).toContain("Your data stays in the app");
    expect(collectText(feedbackSection)).toContain("Ratings, history, and puzzle data are not attached");
    expect(collectText(feedbackSection)).toContain("You will review and submit your issue on GitHub");
    expect(collectText(feedbackSection)).toContain("Email Support");
    expect(collectText(feedbackSection)).toContain("support@chessticize.com");
    expect(collectText(findByTestId(renderer, "settings-about-section")))
      .not.toContain("support@chessticize.com");
    expect(findByTestId(renderer, "settings-feedback-open-github").props.accessibilityRole).toBe("button");
    expect(testIdOrder(renderer, "settings-profile-section", "settings-feedback-section")).toBeLessThan(0);
    expect(testIdOrder(renderer, "settings-feedback-section", "settings-about-section")).toBeLessThan(0);
    expect(() => findByTestId(renderer, "settings-feedback-handoff-confirmation")).toThrow();

    press(renderer, "settings-feedback-open-github");

    expect(openURLSpy).not.toHaveBeenCalled();
    const confirmation = findByTestId(renderer, "settings-feedback-handoff-confirmation");
    expect(collectText(confirmation)).toContain("Continue to GitHub?");
    expect(collectText(confirmation)).toContain("does not attach your account, rating, history, or puzzle data");
    expect(collectText(confirmation)).toContain("You stay in control");
    press(renderer, "settings-feedback-handoff-cancel");
    expect(() => findByTestId(renderer, "settings-feedback-handoff-confirmation")).toThrow();
    expect(openURLSpy).not.toHaveBeenCalled();

    press(renderer, "settings-feedback-open-github");
    await pressAsync(renderer, "settings-feedback-handoff-continue");

    expect(openURLSpy).toHaveBeenCalledTimes(1);
    expect(openURLSpy).toHaveBeenCalledWith(
      "https://github.com/Chessticize/chessticize-mobile/issues/new",
    );
    expect(() => findByTestId(renderer, "settings-feedback-handoff-confirmation")).toThrow();

    openURLSpy.mockRejectedValueOnce(new Error("browser unavailable"));
    press(renderer, "settings-feedback-open-github");
    await pressAsync(renderer, "settings-feedback-handoff-continue");
    expect(collectText(findByTestId(renderer, "settings-feedback-handoff-confirmation")))
      .toContain("Couldn't open GitHub Issues. Try again.");
    press(renderer, "settings-feedback-handoff-cancel");
    press(renderer, "settings-support-email");
    expect(openURLSpy).toHaveBeenLastCalledWith("mailto:support@chessticize.com");
    openURLSpy.mockRestore();
  });

  it("shows Android-managed restore protection and exports local diagnostics without iCloud claims", async () => {
    const prepareSupportBundle = jest.fn(async (_input: {
      diagnosticText: string;
      metadata: unknown;
    }) => ({
      bundleUrl: "file:///cache/Chessticize-Support.zip",
      files: ["local-progress.sqlite", "diagnostic.txt", "manifest.json"],
      kind: "complete" as const
    }));
    const shareSupportBundle = jest.fn(async () => undefined);
    const renderer = renderScreen({
      progressProtection: { kind: "android_managed_backup" },
      reminderPlatform: "android",
      iCloudSyncDiagnosticsClient: {
        copyText: jest.fn(async () => undefined),
        discardSupportBundle: jest.fn(async () => undefined),
        prepareSupportBundle,
        shareSupportBundle
      }
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
    expect(collectText(findByTestId(renderer, "settings-feedback-section")))
      .toContain("Export Support Diagnostics");
    expect(collectText(findByTestId(renderer, "settings-feedback-section")))
      .toContain("Share a local SQLite snapshot");
    expect(testIdOrder(
      renderer,
      "settings-sync-support-bundle-entry",
      "settings-support-email"
    )).toBeLessThan(0);

    press(renderer, "settings-sync-support-bundle-entry");
    const modal = findByTestId(renderer, "settings-sync-support-bundle-modal");
    expect(collectText(modal)).toContain("Android lets you choose where to send the bundle");
    expect(collectText(modal)).toContain("local-progress.sqlite");
    expect(collectText(modal)).not.toContain("icloud-progress-v2.ndjson");
    await pressAsyncWithin(modal, "settings-sync-support-bundle-prepare");
    expect(collectText(findByTestId(renderer, "settings-sync-support-bundle-complete")))
      .toContain("Android diagnostics bundle ready");
    expect(prepareSupportBundle).toHaveBeenCalledTimes(1);
    expect(prepareSupportBundle.mock.calls[0]![0].diagnosticText)
      .toContain("Progress protection: Android-managed backup");
    expect(prepareSupportBundle.mock.calls[0]![0].metadata).toMatchObject({
      platform: "android",
      progressProtection: "android_managed_backup"
    });
    await pressAsync(renderer, "settings-sync-support-bundle-share");
    expect(shareSupportBundle).toHaveBeenCalledWith(
      "file:///cache/Chessticize-Support.zip"
    );
    expect(collectText(findByTestId(renderer, "settings-sync-support-bundle-shared")))
      .toContain("expires automatically");
    expect(collectText(findByTestId(renderer, "settings-sync-support-bundle-share")))
      .toContain("Share Options Opened");
    expect(collectText(renderer.root)).not.toContain("iCloud");
  });

  it("uses Android copy when a partial support bundle lacks the local SQLite snapshot", async () => {
    const renderer = renderScreen({
      progressProtection: { kind: "android_managed_backup" },
      reminderPlatform: "android",
      iCloudSyncDiagnosticsClient: {
        copyText: jest.fn(async () => undefined),
        discardSupportBundle: jest.fn(async () => undefined),
        prepareSupportBundle: jest.fn(async () => ({
          bundleUrl: "file:///cache/Chessticize-Support.zip",
          files: ["diagnostic.txt", "manifest.json"],
          kind: "partial" as const,
          unavailableReason: "The local SQLite snapshot could not be created."
        })),
        shareSupportBundle: jest.fn(async () => undefined)
      }
    });

    press(renderer, "settings-tab");
    press(renderer, "settings-sync-support-bundle-entry");
    await pressAsync(renderer, "settings-sync-support-bundle-prepare");

    const partial = findByTestId(renderer, "settings-sync-support-bundle-partial");
    expect(collectText(partial)).toContain("Local SQLite snapshot couldn't be included");
    expect(collectText(partial)).toContain("The local SQLite snapshot could not be created.");
    expect(collectText(partial)).toContain(
      "does not include the local progress database needed for reproduction"
    );
    expect(collectText(renderer.root)).not.toContain("iCloud");
    expect(collectText(renderer.root)).not.toContain("CloudKit");
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
      expect(client.zoneChangeFetchCount).toBe(1);
      expect(client.modifyBatches.length).toBe(1);
    });

    expect(service.getSettings().sync.iCloudEnabled).toBe(true);
    expect(service.getProgressV2Diagnostics().phase).toBe("sealed");
    expect(client.legacyMetadataFetchCount).toBe(0);
    expect(client.legacySnapshotFetchCount).toBe(0);
    press(renderer, "settings-tab");
    expect(findByTestId(renderer, "settings-sync-now")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-sync-status"))).toContain("Synced");
    expect(client.records.filter((record) => record.kind === "attempt")).toHaveLength(1);
    expect(client.records.filter((record) => record.kind === "review_schedule")).toHaveLength(1);
    const rating = client.records
      .filter((record) => record.kind === "rating")
      .map(decodeProgressV2Record)
      .find((payload) => payload.state === "present" &&
        typeof payload.value === "object" && payload.value !== null &&
        "key" in payload.value && payload.value.key === "standard 5/20");
    expect(rating?.state === "present" && typeof rating.value === "object" &&
      rating.value !== null && "games" in rating.value ? rating.value.games : undefined).toBe(1);

    await pressAsync(renderer, "settings-sync-now");
    await waitForAssertion(() => {
      expect(client.zoneChangeFetchCount).toBe(2);
      expect(client.modifyBatches.length).toBe(1);
    });
    expect(client.legacyMetadataFetchCount).toBe(0);
    expect(client.legacySnapshotFetchCount).toBe(0);

    act(() => {
      (AppState as unknown as { __emit: (nextState: string) => void }).__emit("background");
    });
    await waitForAssertion(() => {
      expect(client.zoneChangeFetchCount).toBe(3);
    });
    expect(client.legacyMetadataFetchCount).toBe(0);
    expect(client.legacySnapshotFetchCount).toBe(0);
  });

  it("captures a real sync failure and copies only the bounded diagnostic", async () => {
    const nativeFailure = Object.assign(new Error("Request rate limited"), {
      code: "icloud_fetch_failed",
      domain: "CKErrorDomain",
      userInfo: {
        cloudKitCode: 7,
        CKErrorRetryAfterKey: 12,
        credential: "must-not-be-copied"
      }
    });
    const copyText = jest.fn(async (_text: string) => undefined);
    const failingClient = new FakeICloudProgressSyncClient();
    failingClient.fetchZoneChanges = jest.fn(async () => Promise.reject(nativeFailure));
    const renderer = renderScreen({
      iCloudProgressSyncClient: failingClient,
      iCloudSyncDiagnosticsClient: {
        copyText,
        discardSupportBundle: jest.fn(async () => undefined),
        prepareSupportBundle: jest.fn(async () => ({
          bundleUrl: "file:///tmp/support.zip",
          files: ["local-progress.sqlite", "diagnostic.txt", "manifest.json"],
          kind: "partial" as const
        })),
        shareSupportBundle: jest.fn(async () => undefined)
      }
    });

    press(renderer, "settings-tab");
    await waitForAssertion(() => {
      expect(collectText(findByTestId(renderer, "settings-sync-status"))).toContain(
        "iCloud sync failed"
      );
    });
    press(renderer, "settings-sync-error-details");
    await pressAsync(renderer, "settings-sync-error-copy");

    expect(copyText).toHaveBeenCalledTimes(1);
    const copiedDiagnostic = copyText.mock.calls[0]![0];
    expect(copiedDiagnostic).toContain("Code: icloud_fetch_failed");
    expect(copiedDiagnostic).toContain("Native code: 7");
    expect(copiedDiagnostic).not.toContain("must-not-be-copied");
  });

  it("keeps support diagnostics reachable when iCloud sync is off", async () => {
    const service = createMobilePracticeService("random1000");
    service.saveSettings({
      ...service.getSettings(),
      sync: {
        iCloudEnabled: false
      }
    });
    const prepareSupportBundle = jest.fn(async (_input: {
      diagnosticText: string;
      metadata: unknown;
    }) => ({
      bundleUrl: "file:///tmp/chessticize-support.zip",
      files: [
        "local-progress.sqlite",
        "icloud-progress-v2.ndjson",
        "diagnostic.txt",
        "manifest.json"
      ],
      kind: "complete" as const
    }));
    const shareSupportBundle = jest.fn(async () => undefined);
    const discardSupportBundle = jest.fn(async () => undefined);
    const client = new FakeICloudProgressSyncClient({
      legacy: {
        changeTag: "must-not-read-after-seal",
        snapshot: {
          schemaVersion: 1,
          deviceId: "legacy-device",
          updatedAt: "2026-08-09T12:00:00.000Z",
          data: service.exportLocalData()
        }
      }
    });
    const renderer = renderScreen({
      practiceService: service,
      iCloudProgressSyncClient: client,
      iCloudSyncDiagnosticsClient: {
        copyText: jest.fn(async () => undefined),
        discardSupportBundle,
        prepareSupportBundle,
        shareSupportBundle
      }
    });

    press(renderer, "settings-tab");
    expect(() => findByTestId(renderer, "settings-sync-now")).toThrow();
    expect(collectText(findByTestId(renderer, "settings-sync-section")))
      .not.toContain("Export Support Diagnostics");
    const feedbackSection = findByTestId(renderer, "settings-feedback-section");
    expect(collectText(feedbackSection)).toContain("Email Support");
    expect(collectText(feedbackSection)).toContain("Export Support Diagnostics");
    expect(testIdOrder(
      renderer,
      "settings-sync-support-bundle-entry",
      "settings-support-email"
    )).toBeLessThan(0);
    press(renderer, "settings-sync-support-bundle-entry");
    await pressAsync(renderer, "settings-sync-support-bundle-prepare");

    expect(prepareSupportBundle).toHaveBeenCalledTimes(1);
    expect(prepareSupportBundle.mock.calls[0]![0].diagnosticText).toContain(
      "iCloud sync setting: Off"
    );
    expect(prepareSupportBundle.mock.calls[0]![0]).toMatchObject({
      cloudCapture: {
        v1: { status: "skipped_sealed" }
      },
      metadata: {
        progressV2: { phase: "sealed" }
      }
    });
    expect(client.legacyMetadataFetchCount).toBe(0);
    expect(client.legacySnapshotFetchCount).toBe(0);
    await pressAsync(renderer, "settings-sync-support-bundle-share");
    expect(shareSupportBundle).toHaveBeenCalledWith(
      "file:///tmp/chessticize-support.zip"
    );
    press(renderer, "settings-sync-support-bundle-details");
    await flushMicrotasks();
    expect(discardSupportBundle).not.toHaveBeenCalled();
  });

  it("discards a support bundle that finishes after its diagnostics window closes", async () => {
    let finishPreparation: ((result: {
      bundleUrl: string;
      files: string[];
      kind: "partial";
    }) => void) | undefined;
    const prepareSupportBundle = jest.fn(() => new Promise<{
      bundleUrl: string;
      files: string[];
      kind: "partial";
    }>((resolve) => {
      finishPreparation = resolve;
    }));
    const discardSupportBundle = jest.fn(async () => undefined);
    const renderer = renderScreen({
      iCloudSyncDiagnosticsClient: {
        copyText: jest.fn(async () => undefined),
        discardSupportBundle,
        prepareSupportBundle,
        shareSupportBundle: jest.fn(async () => undefined)
      }
    });

    press(renderer, "settings-tab");
    press(renderer, "settings-sync-support-bundle-entry");
    press(renderer, "settings-sync-support-bundle-prepare");
    expect(findByTestId(renderer, "settings-sync-support-bundle-preparing")).toBeTruthy();
    press(renderer, "settings-sync-error-details-close-icon");

    await act(async () => {
      finishPreparation?.({
        bundleUrl: "file:///tmp/late-support.zip",
        files: ["local-progress.sqlite", "diagnostic.txt", "manifest.json"],
        kind: "partial"
      });
      await Promise.resolve();
    });

    expect(discardSupportBundle).toHaveBeenCalledWith("file:///tmp/late-support.zip");
  });

  it("shows and copies the issue #353 local iCloud sync diagnostic design", async () => {
    const renderer = renderLabScenario("settings-ios-sync-error-details");

    press(renderer, "settings-tab");
    expect(collectText(findByTestId(renderer, "settings-sync-status"))).toContain(
      "iCloud sync failed"
    );
    press(renderer, "settings-sync-error-details");

    const modal = findByTestId(renderer, "settings-sync-error-details-modal");
    expect(collectText(modal)).toContain("The request was rate limited. Please try again later.");
    expect(collectText(modal)).toContain("Your progress stays private");
    expect(collectText(findByTestId(renderer, "settings-sync-error-diagnostic-text"))).toContain(
      "Phase: Fetch from iCloud"
    );
    expect(() => findByTestId(renderer, "settings-sync-error-copy-success")).toThrow();

    await pressAsync(renderer, "settings-sync-error-copy");

    expect(collectText(findByTestId(renderer, "settings-sync-error-copy-success"))).toContain(
      "Copied"
    );

    press(renderer, "settings-sync-support-bundle-open");
    expect(collectText(modal)).toContain("This bundle contains progress data");
    expect(collectText(modal)).toContain("local-progress.sqlite");
    expect(collectText(modal)).toContain("icloud-progress-v2.ndjson");
    expect(collectText(modal)).toContain("icloud-progress-v1.json (optional)");

    await pressAsyncWithin(modal, "settings-sync-support-bundle-prepare");

    expect(collectText(findByTestId(renderer, "settings-sync-support-bundle-complete"))).toContain(
      "Complete reproduction bundle"
    );
    expect(collectText(modal)).toContain("manifest.json");
    await pressAsync(renderer, "settings-sync-support-bundle-share");
    expect(collectText(findByTestId(renderer, "settings-sync-support-bundle-shared"))).toContain(
      "temporary bundle was removed"
    );

    press(renderer, "settings-sync-support-bundle-details");
    press(renderer, "settings-sync-error-details-close");
    expect(collectText(findByTestId(renderer, "settings-sync-status"))).toContain(
      "iCloud sync failed"
    );
  });

  it("marks the issue #353 support bundle partial when CloudKit export is unavailable", async () => {
    const renderer = renderLabScenario("settings-ios-sync-support-bundle-partial");

    press(renderer, "settings-tab");
    press(renderer, "settings-sync-error-details");
    const modal = findByTestId(renderer, "settings-sync-error-details-modal");
    press(renderer, "settings-sync-support-bundle-open");
    await pressAsyncWithin(modal, "settings-sync-support-bundle-prepare");

    const partial = findByTestId(renderer, "settings-sync-support-bundle-partial");
    expect(collectText(partial)).toContain("iCloud progress capture couldn't be completed");
    expect(collectText(partial)).toContain(
      "CloudKit Progress V2 capture unavailable: The request was rate limited."
    );
    expect(collectText(partial)).toContain("not a complete reproduction");
    expect(collectText(findByTestId(renderer, "settings-sync-error-details-modal"))).not.toContain(
      "icloud-progress-v2.ndjson"
    );
    expect(findByTestId(renderer, "settings-sync-support-bundle-share")).toBeTruthy();
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

    expect(client.zoneChangeFetchCount).toBe(0);
    expect(client.modifyBatches.length).toBe(0);
    press(renderer, "settings-tab");
    expect(collectText(findByTestId(renderer, "settings-sync-status"))).toContain("Off");
    expect(() => findByTestId(renderer, "settings-sync-now")).toThrow();

    press(renderer, "settings-icloud-sync-on");
    await waitForAssertion(() => {
      expect(client.zoneChangeFetchCount).toBe(1);
      expect(client.modifyBatches.length).toBe(1);
    });
    expect(service.getSettings().sync.iCloudEnabled).toBe(true);
    expect(service.getProgressV2Diagnostics().phase).toBe("sealed");
    expect(findByTestId(renderer, "settings-sync-now")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-sync-status"))).toContain("Synced");
    expect(client.legacyMetadataFetchCount).toBe(0);
    expect(client.legacySnapshotFetchCount).toBe(0);

    press(renderer, "settings-icloud-sync-off");
    await flushMicrotasks();
    expect(service.getSettings().sync.iCloudEnabled).toBe(false);
    expect(collectText(findByTestId(renderer, "settings-sync-status"))).toContain("Off");
    expect(() => findByTestId(renderer, "settings-sync-now")).toThrow();
    expect(client.zoneChangeFetchCount).toBe(1);
    expect(client.modifyBatches.length).toBe(1);
  });

  it("turns Sync Off without importing or pushing an in-flight V2 pull", async () => {
    const service = createMobilePracticeService("random1000");
    const client = new FakeICloudProgressSyncClient();
    let releaseFetch!: () => void;
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const fetchZoneChanges = jest.fn(async () => {
      await fetchGate;
      return {
        records: [{
          recordName: "v2|preferences|default",
          kind: "preferences" as const,
          schemaVersion: 2 as const,
          payload: JSON.stringify({
            entityKey: "default",
            formatVersion: 2,
            kind: "preferences",
            state: "present",
            value: {
              moveFeedback: { soundEnabled: true, hapticsEnabled: false },
              notifications: { reviewReminder: { mode: "off" } }
            }
          })
        }],
        deletedRecords: [],
        nextToken: "remote-token",
        moreComing: false
      };
    });
    client.fetchZoneChanges = fetchZoneChanges;
    const renderer = renderScreen({
      practiceService: service,
      iCloudProgressSyncClient: client
    });

    await waitForAssertion(() => expect(fetchZoneChanges).toHaveBeenCalledTimes(1));
    press(renderer, "settings-tab");
    press(renderer, "settings-icloud-sync-off");
    await act(async () => {
      releaseFetch();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(service.getSettings().sync.iCloudEnabled).toBe(false);
    expect(service.getSettings().moveFeedback).toEqual({
      soundEnabled: false,
      hapticsEnabled: true
    });
    expect(client.modifyBatches).toHaveLength(0);
    expect(client.legacyMetadataFetchCount).toBe(0);
    expect(collectText(findByTestId(renderer, "settings-sync-status"))).toContain("Off");
  });

  it("opens difficulty controls from the Edit rating row", () => {
    const renderer = renderScreen();

    press(renderer, "settings-tab");
    expect(typeof findByTestId(renderer, "settings-standard-elo-row").props.onPress).toBe("function");
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("Edit rating");
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("Standard and Arrow Duel difficulty");
    expect(() => findByTestId(renderer, "settings-standard-elo-row-detail")).toThrow();
    expect(() => findByTestId(renderer, "settings-advanced-ratings-panel")).toThrow();

    press(renderer, "settings-standard-elo-row");

    expect(findByTestId(renderer, "settings-advanced-ratings-panel")).toBeTruthy();
    expectText(renderer, "Difficulty controls");
    expectText(renderer, "Each rating helps Chessticize choose the right puzzle difficulty.");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-value"))).toBe("Rating 600");
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

describe("App Store review request scheduling", () => {
  it("suppresses active modal, guide, analysis, navigation-preview, and error surfaces", () => {
    const ready = {
      hasError: false,
      hasModalOrGuide: false,
      hasNavigationPreview: false,
      isAnalysisOpen: false,
      isPracticeTab: true
    };
    expect(isAppReviewRequestSurfaceBlocked(ready)).toBe(false);

    for (const blocked of [
      { ...ready, hasModalOrGuide: true },
      { ...ready, isAnalysisOpen: true },
      { ...ready, hasNavigationPreview: true },
      { ...ready, hasError: true },
      { ...ready, isPracticeTab: false }
    ]) {
      expect(isAppReviewRequestSurfaceBlocked(blocked)).toBe(true);
    }
  });

  it("requests StoreKit after an eligible puzzle result remains stable for two seconds", async () => {
    const { current, service } = createAppReviewEligibleService();
    const appStoreReviewRequestClient = new FakeAppStoreReviewRequestClient();
    const renderer = renderScreen({
      appStoreReviewRequestClient,
      applicationMetadata: { versionName: "1.4.0" },
      currentTimeMs: () => Date.parse("2026-07-29T12:00:00.000Z"),
      practiceService: service,
      sprintRulesDesignPreview: { initialResultState: current }
    });

    act(() => {
      jest.advanceTimersByTime(1_999);
    });
    expect(appStoreReviewRequestClient.requestCount).toBe(0);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    await act(async () => {});

    expect(appStoreReviewRequestClient.requestCount).toBe(1);
    expect(service.getAppReviewRequestAttempt()).toEqual({
      appVersion: "1.4.0",
      attemptedAt: "2026-07-29T12:00:00.000Z"
    });
    expect(findByTestId(renderer, "sprint-result-history-button")).toBeTruthy();
    expect(findByTestId(renderer, "back-practice-button")).toBeTruthy();
  });

  it("cancels the result attempt when navigation leaves the result", async () => {
    const { current, service } = createAppReviewEligibleService();
    const appStoreReviewRequestClient = new FakeAppStoreReviewRequestClient();
    const renderer = renderScreen({
      appStoreReviewRequestClient,
      applicationMetadata: { versionName: "1.4.0" },
      currentTimeMs: () => Date.parse("2026-07-29T12:00:00.000Z"),
      practiceService: service,
      sprintRulesDesignPreview: { initialResultState: current }
    });

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    press(renderer, "sprint-result-history-button");
    press(renderer, "practice-tab");
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    await act(async () => {});

    expect(appStoreReviewRequestClient.requestCount).toBe(0);
    expect(service.getAppReviewRequestAttempt()).toBeUndefined();
  });

  it("cancels the result attempt after backgrounding even if the app returns quickly", async () => {
    const { current, service } = createAppReviewEligibleService();
    const appStoreReviewRequestClient = new FakeAppStoreReviewRequestClient();
    renderScreen({
      appStoreReviewRequestClient,
      applicationMetadata: { versionName: "1.4.0" },
      currentTimeMs: () => Date.parse("2026-07-29T12:00:00.000Z"),
      practiceService: service,
      sprintRulesDesignPreview: { initialResultState: current }
    });

    act(() => {
      jest.advanceTimersByTime(1_000);
      (AppState as unknown as { __emit: (nextState: string) => void }).__emit("background");
      (AppState as unknown as { __emit: (nextState: string) => void }).__emit("active");
      jest.advanceTimersByTime(5_000);
    });
    await act(async () => {});

    expect(appStoreReviewRequestClient.requestCount).toBe(0);
    expect(service.getAppReviewRequestAttempt()).toBeUndefined();
  });

  it("cancels the result attempt when another transient surface appears", async () => {
    const { current, service } = createAppReviewEligibleService();
    const appStoreReviewRequestClient = new FakeAppStoreReviewRequestClient();
    const systemBack = createTestSystemBackSource("android");
    const renderer = renderScreen({
      appStoreReviewRequestClient,
      applicationMetadata: { versionName: "1.4.0" },
      currentTimeMs: () => Date.parse("2026-07-29T12:00:00.000Z"),
      practiceService: service,
      sprintRulesDesignPreview: { initialResultState: current },
      systemBack
    });

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    systemBack.startPredictive();
    expect(findByTestId(renderer, "mobile-back-destination-preview")).toBeTruthy();
    systemBack.cancelPredictive();
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    await act(async () => {});

    expect(appStoreReviewRequestClient.requestCount).toBe(0);
    expect(service.getAppReviewRequestAttempt()).toBeUndefined();
  });

  it("does not consume suppression when the native boundary cannot call StoreKit", async () => {
    const { current, service } = createAppReviewEligibleService();
    const requestReview = jest.fn(async () => false);
    const renderer = renderScreen({
      appStoreReviewRequestClient: { requestReview },
      applicationMetadata: { versionName: "1.4.0" },
      currentTimeMs: () => Date.parse("2026-07-29T12:00:00.000Z"),
      practiceService: service,
      sprintRulesDesignPreview: { initialResultState: current }
    });

    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    await act(async () => {});

    expect(requestReview).toHaveBeenCalledTimes(1);
    expect(service.getAppReviewRequestAttempt()).toBeUndefined();
    expect(findByTestId(renderer, "back-practice-button")).toBeTruthy();
  });

  it("keeps the result usable when local suppression persistence fails", async () => {
    const { current, service } = createAppReviewEligibleService(
      new FailingAppReviewRequestStore("SQLite unavailable")
    );
    const appStoreReviewRequestClient = new FakeAppStoreReviewRequestClient();
    const renderer = renderScreen({
      appStoreReviewRequestClient,
      applicationMetadata: { versionName: "1.4.0" },
      currentTimeMs: () => Date.parse("2026-07-29T12:00:00.000Z"),
      practiceService: service,
      sprintRulesDesignPreview: { initialResultState: current }
    });

    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    await act(async () => {});

    expect(appStoreReviewRequestClient.requestCount).toBe(1);
    expect(findByTestId(renderer, "sprint-result-history-button")).toBeTruthy();
    expect(findByTestId(renderer, "back-practice-button")).toBeTruthy();
    expect(() => findByTestId(renderer, "error-panel")).toThrow();
  });

  it("keeps the result usable when StoreKit rejects or shows no sheet", async () => {
    const { current, service } = createAppReviewEligibleService();
    const renderer = renderScreen({
      appStoreReviewRequestClient: {
        requestReview: jest.fn(async () => {
          throw new Error("StoreKit unavailable");
        })
      },
      applicationMetadata: { versionName: "1.4.0" },
      currentTimeMs: () => Date.parse("2026-07-29T12:00:00.000Z"),
      practiceService: service,
      sprintRulesDesignPreview: { initialResultState: current }
    });

    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    await act(async () => {});

    expect(findByTestId(renderer, "sprint-result-history-button")).toBeTruthy();
    expect(findByTestId(renderer, "back-practice-button")).toBeTruthy();
    expect(() => findByTestId(renderer, "error-panel")).toThrow();
  });
});

function createScriptedStockfishTransport(
  onCommand: (command: string, emit: (line: string) => void) => void
): { commands: string[]; listenerCount: () => number; transport: UciEngineTransport } {
  const commands: string[] = [];
  const listeners = new Set<(line: string) => void>();
  const emit = (line: string) => {
    for (const listener of listeners) {
      listener(line);
    }
  };

  return {
    commands,
    listenerCount: () => listeners.size,
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
  Pick<React.ComponentProps<typeof PracticePocScreen>, "arrowDuelTargetCorrect" | "currentTimeMs" | "customTargetCorrect" | "debugTrace" | "initialTab" | "moveFeedbackSettings" | "puzzleSelectionId" | "puzzleSelectionSeed" | "runEloEditingMovedToHome" | "runManagementEnabled" | "runManagementPresentation" | "runReorderDesignPreview" | "runReorderFeedbackPreview" | "sprintGuidanceEnabled" | "sprintRulesDesignPreview" | "sprintStartDelayMs" | "standardTargetCorrect" | "systemBack" | "tacticalProfilePresentation" | "themeCatalogPresentation"> & {
    onRenderCommit?: () => void;
    platformCapabilities?: MobilePlatformCapabilities;
  };

function runManagementPresentation(
  overrides: Partial<PracticeRunManagementPresentation> = {}
): PracticeRunManagementPresentation {
  return {
    draft: null,
    hiddenRuns: [],
    homeEditing: false,
    nameError: null,
    notice: null,
    removeCandidateId: null,
    runs: [
      {
        id: "standard",
        ratingKey: "standard 5/20",
        name: "Standard",
        kind: "standard",
        mode: "standard",
        elo: 925,
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        puzzleTiming: {
          slowAfterSeconds: 40,
          timeoutAfterSeconds: 60
        },
        themes: ["mixed"]
      },
      {
        id: "tactics-focus",
        ratingKey: "run:tactics-focus",
        name: "Tactics Focus",
        kind: "custom",
        mode: "custom",
        elo: 1040,
        durationSeconds: 600,
        perPuzzleSeconds: 30,
        puzzleTiming: {
          slowAfterSeconds: 60,
          timeoutAfterSeconds: 90
        },
        themes: ["fork", "pin"]
      },
      {
        id: "candidate-sprint",
        ratingKey: "run:candidate-sprint",
        name: "Candidate Sprint",
        kind: "custom",
        mode: "arrow_duel",
        elo: 880,
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        puzzleTiming: {
          slowAfterSeconds: 40,
          timeoutAfterSeconds: 60
        },
        themes: ["mixed"]
      }
    ],
    screen: "home",
    selectedRunId: "standard",
    onIntent: jest.fn(),
    ...overrides
  };
}

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

function createStalemateAlternatePracticeService(): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles([
    {
      id: "component-arrow-duel-stalemate-alternate",
      initialFen: "7k/8/5KQ1/8/8/8/8/8 w - - 0 1",
      rating: 600,
      solutionMoves: ["g6f7"],
      source: "synthetic",
      stockfishBestMove: "g6g7",
      stockfishEval: 0,
      stockfishEvalAfterFirstMove: -10000,
      themes: ["mateIn1", "stalemate"]
    },
    {
      id: "component-arrow-duel-follow-up",
      initialFen: "4k3/8/8/8/8/8/4P3/4K3 b - - 0 1",
      rating: 780,
      solutionMoves: ["e8d7", "e2e4"],
      source: "synthetic",
      stockfishBestMove: "e8f7",
      stockfishEval: 180,
      stockfishEvalAfterFirstMove: -220,
      themes: ["endgame"]
    }
  ]);
  return new PracticeService(store);
}

function renderScreen({
  arrowDuelTargetCorrect,
  platformCapabilities,
  currentTimeMs,
  customTargetCorrect,
  debugTrace,
  sprintGuidanceEnabled,
  initialTab,
  moveFeedbackSettings,
  onRenderCommit,
  puzzleSelectionId,
  puzzleSelectionSeed,
  runEloEditingMovedToHome,
  runManagementEnabled,
  runManagementPresentation,
  runReorderDesignPreview,
  runReorderFeedbackPreview,
  sprintRulesDesignPreview,
  sprintStartDelayMs,
  standardTargetCorrect,
  systemBack,
  tacticalProfilePresentation,
  themeCatalogPresentation,
  ...capabilityOverrides
}: RenderScreenOptions = {}): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    const screen = (
      <PracticePocScreen
        platformCapabilities={platformCapabilities ?? createTestMobilePlatformCapabilities(capabilityOverrides)}
        arrowDuelTargetCorrect={arrowDuelTargetCorrect}
        currentTimeMs={currentTimeMs}
        customTargetCorrect={customTargetCorrect}
        debugTrace={debugTrace}
        sprintGuidanceEnabled={sprintGuidanceEnabled}
        initialTab={initialTab}
        moveFeedbackSettings={moveFeedbackSettings}
        puzzleSelectionId={puzzleSelectionId}
        puzzleSelectionSeed={puzzleSelectionSeed}
        runEloEditingMovedToHome={runEloEditingMovedToHome}
        runManagementEnabled={runManagementEnabled}
        runManagementPresentation={runManagementPresentation}
        runReorderDesignPreview={runReorderDesignPreview}
        runReorderFeedbackPreview={runReorderFeedbackPreview}
        sprintRulesDesignPreview={sprintRulesDesignPreview}
        sprintStartDelayMs={sprintStartDelayMs}
        standardTargetCorrect={standardTargetCorrect}
        systemBack={systemBack}
        tacticalProfilePresentation={tacticalProfilePresentation}
        themeCatalogPresentation={themeCatalogPresentation}
      />
    );
    renderer = TestRenderer.create(onRenderCommit
      ? (
          <React.Profiler id="practice-poc-screen" onRender={onRenderCommit}>
            {screen}
          </React.Profiler>
        )
      : screen);
  });
  if (!renderer) {
    throw new Error("PracticePocScreen did not render");
  }
  renderers.push(renderer);
  return renderer;
}

function renderLabScenario(
  scenarioId: React.ComponentProps<typeof LabScenario>["scenarioId"],
  props: Omit<React.ComponentProps<typeof LabScenario>, "scenarioId"> = {}
): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(<LabScenario scenarioId={scenarioId} {...props} />);
  });
  if (!renderer) {
    throw new Error("LabScenario did not render");
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

function historyThemeSelected(
  renderer: TestRenderer.ReactTestRenderer,
  theme: string
): boolean {
  return renderer.root.findAllByProps({ testID: `history-theme-${theme}` }).some(
    (node) => node.props.accessibilityState?.selected === true
  );
}

function historyFilterSelected(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string
): boolean {
  return renderer.root.findAllByProps({ testID }).some(
    (node) => node.props.accessibilityState?.selected === true
  );
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

function renderStoredArrowDuelReplay(): TestRenderer.ReactTestRenderer {
  const service = createMobilePracticeService("random1000");
  const completedAt = new Date().toISOString();
  service.recordReviewAttempt({
    puzzleId: "00008",
    mode: "arrow_duel",
    ratingKey: "arrow duel 5/30",
    result: "wrong",
    submittedMove: "f2g3",
    expectedMove: "b2b1",
    startedAt: new Date(Date.now() - 5_000).toISOString(),
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
  if (!historyAttemptRow) {
    throw new Error("Expected a stored Arrow Duel attempt");
  }
  press(renderer, historyAttemptRow.props.testID);

  return renderer;
}

function storedArrowDuelPuzzle(): Puzzle {
  const puzzle = tacticalProfilePuzzleFixture.find((candidate) => candidate.id === "00008");
  if (!puzzle) {
    throw new Error("Expected the stored Arrow Duel Replay puzzle");
  }
  return puzzle;
}

async function completeArrowDuelReplay(
  renderer: TestRenderer.ReactTestRenderer,
  arrow: Pick<ArrowDuelState, "correctMove" | "puzzle">
): Promise<void> {
  await boardMove(renderer, arrow.correctMove);
  await settleArrowDuelReplyHandoff();
  await boardMove(renderer, arrow.puzzle.solutionMoves[1]!);
  await settleFeedbackSnapshot();
  for (let cursor = 3; cursor < arrow.puzzle.solutionMoves.length; cursor += 2) {
    await boardMove(renderer, arrow.puzzle.solutionMoves[cursor]!);
    await settleFeedbackSnapshot();
  }
  await settleFeedbackSnapshot();
}

function startSprintWithPuzzleTiming(
  service: PracticeService,
  input: {
    durationSeconds: number;
    maxMistakes: number;
    perPuzzleSeconds: number;
    puzzleTiming: PuzzleTimingPolicy;
    targetCorrect: number;
  },
  now = new Date().toISOString()
): SprintState {
  const run = service.createPracticeRun({
    id: "timing-test-run",
    name: "Timing test",
    mode: "custom",
    durationSeconds: input.durationSeconds,
    perPuzzleSeconds: input.perPuzzleSeconds,
    puzzleTiming: input.puzzleTiming,
    targetCorrect: input.targetCorrect,
    maxMistakes: input.maxMistakes,
    initialRating: 900
  }, now);
  return service.startSprint({
    mode: "custom",
    practiceRunId: run.id
  }, now);
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

function createArrowFocusedPracticeService(
  inventoryAvailable = true,
  exposeStore?: (store: MemoryStore) => void
): PracticeService {
  const candidates = tacticalProfilePuzzleFixture
    .filter((puzzle) =>
      puzzle.rating >= 1700
      && puzzle.rating <= 1900
      && isServerCompatibleArrowDuelPuzzle(puzzle)
    )
    .slice(0, 44);
  if (candidates.length < 44) {
    throw new Error("Tactical Profile component fixture needs 44 Arrow Duel puzzles");
  }
  const evidence = candidates.slice(0, 12).map((puzzle) => ({
    ...puzzle,
    ratingDeviation: 80,
    themes: ["pin"]
  }));
  const focused = candidates.slice(12, 24).map((puzzle) => ({
    ...puzzle,
    ratingDeviation: 80,
    themes: ["pin"]
  }));
  const mixed = candidates.slice(24).map((puzzle) => ({
    ...puzzle,
    ratingDeviation: 80,
    themes: ["fork"]
  }));
  const store = new MemoryStore();
  store.seedPuzzles([...evidence, ...focused, ...mixed]);
  const config = defaultSprintConfig("arrow_duel");
  store.saveRating({
    key: config.ratingKey,
    generation: 0,
    rating: 1800,
    ratingDeviation: 80,
    volatility: 0.06,
    games: 12
  });

  for (let sessionIndex = 0; sessionIndex < 3; sessionIndex += 1) {
    const day = 10 + sessionIndex * 4;
    const startedAt = `2026-07-${String(day).padStart(2, "0")}T00:00:00.000Z`;
    const completedAt = `2026-07-${String(day).padStart(2, "0")}T00:04:00.000Z`;
    const sessionPuzzles = evidence.slice(sessionIndex * 4, sessionIndex * 4 + 4);
    const session = startSprint({
      id: `arrow-profile-session-${sessionIndex}`,
      config,
      puzzles: sessionPuzzles,
      ratingBefore: 1800,
      now: startedAt
    });
    store.createSprintSession({
      ...session,
      status: "failed",
      completedAt,
      endReason: "max_mistakes",
      correctCount: 0,
      mistakeCount: 4,
      ratingAfter: 1800
    });
    for (const [offset, puzzle] of sessionPuzzles.entries()) {
      store.recordAttempt({
        id: `arrow-profile-attempt-${sessionIndex}-${offset}`,
        source: "sprint",
        sessionId: session.id,
        puzzleId: puzzle.id,
        mode: "arrow_duel",
        ratingKey: config.ratingKey,
        result: "wrong",
        submittedMove: puzzle.solutionMoves[0],
        expectedMove: puzzle.stockfishBestMove as string,
        arrowDuelCandidateOrder: [
          puzzle.stockfishBestMove as string,
          puzzle.solutionMoves[0] as string
        ],
        startedAt: completedAt,
        completedAt,
        elapsedMs: 10_000,
        ratingBefore: 1800
      });
    }
  }
  exposeStore?.(store);

  return new PracticeService(
    store,
    createArrowTacticalProfileService(store, inventoryAvailable)
  );
}

function createArrowTacticalProfileService(
  store: MemoryStore,
  inventoryAvailable = true
): TacticalProfileService {
  return new TacticalProfileService({
    progressStore: store,
    puzzleSource: store,
    repository: new MemoryTacticalProfileRepository(),
    calibration: COMPONENT_TACTICAL_PROFILE_CALIBRATION,
    naturalFrequency: {
      line: {},
      arrow_duel: { pin: 0.12, fork: 0.12 }
    },
    naturalFrequencyForRating: (
      taskFamily
    ): Readonly<Record<string, number>> =>
      taskFamily === "arrow_duel"
        ? { pin: 0.12, fork: 0.12 }
        : {},
    ...(inventoryAvailable
      ? {}
      : { inventoryUpperBound: () => ({ pin: 0 }) }),
    focusedRunPolicy: {
      runSize: 15,
      recentPuzzleDays: 30,
      ratingBandHalfWidths: [100, 200]
    }
  });
}

function createDualFamilyFocusedPracticeService(
  calibration: TacticalProfileCalibrationArtifact =
    COMPONENT_TACTICAL_PROFILE_CALIBRATION,
  arrowSessionCount = 3
): PracticeService {
  const candidates = tacticalProfilePuzzleFixture
    .filter(isServerCompatibleArrowDuelPuzzle)
    .slice(0, 24);
  if (candidates.length < 24) {
    throw new Error("Dual-family Tactical Profile fixture needs 24 puzzles");
  }
  const linePuzzles = candidates.slice(0, 12).map((puzzle) => ({
    ...puzzle,
    rating: 900,
    ratingDeviation: 80,
    themes: ["fork"]
  }));
  const arrowPuzzles = candidates.slice(12, 24).map((puzzle) => ({
    ...puzzle,
    rating: 900,
    ratingDeviation: 80,
    themes: ["pin"]
  }));
  const store = new MemoryStore();
  store.seedPuzzles([...linePuzzles, ...arrowPuzzles]);
  const lineConfig = defaultSprintConfig("standard");
  const arrowConfig = defaultSprintConfig("arrow_duel");
  for (const config of [lineConfig, arrowConfig]) {
    store.saveRating({
      key: config.ratingKey,
      generation: 0,
      rating: 900,
      ratingDeviation: 80,
      volatility: 0.06,
      games: 12
    });
  }
  for (const [taskFamily, config, puzzles] of [
    ["line", lineConfig, linePuzzles],
    ["arrow_duel", arrowConfig, arrowPuzzles]
  ] as const) {
    const sessionCount = taskFamily === "arrow_duel" ? arrowSessionCount : 3;
    for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
      const day = 10 + sessionIndex * 4;
      const startedAt = `2026-07-${String(day).padStart(2, "0")}T00:00:00.000Z`;
      const completedAt = `2026-07-${String(day).padStart(2, "0")}T00:04:00.000Z`;
      const sessionPuzzles = puzzles.slice(
        sessionIndex * 4,
        sessionIndex * 4 + 4
      );
      const session = startSprint({
        id: `${taskFamily}-dual-profile-session-${sessionIndex}`,
        config,
        puzzles: sessionPuzzles,
        ratingBefore: 900,
        now: startedAt
      });
      store.createSprintSession({
        ...session,
        status: "failed",
        completedAt,
        endReason: "max_mistakes",
        correctCount: 0,
        mistakeCount: 4,
        ratingAfter: 900
      });
      for (const [offset, puzzle] of sessionPuzzles.entries()) {
        store.recordAttempt({
          id: `${taskFamily}-dual-profile-attempt-${sessionIndex}-${offset}`,
          source: "sprint",
          sessionId: session.id,
          puzzleId: puzzle.id,
          mode: config.mode,
          ratingKey: config.ratingKey,
          result: "wrong",
          submittedMove: puzzle.solutionMoves[0],
          expectedMove: taskFamily === "arrow_duel"
            ? puzzle.stockfishBestMove as string
            : puzzle.solutionMoves[1] ?? puzzle.solutionMoves[0],
          ...(taskFamily === "arrow_duel"
            ? {
                arrowDuelCandidateOrder: [
                  puzzle.stockfishBestMove as string,
                  puzzle.solutionMoves[0]
                ] as [string, string]
              }
            : {}),
          startedAt: completedAt,
          completedAt,
          elapsedMs: 10_000,
          ratingBefore: 900
        });
      }
    }
  }
  return new PracticeService(
    store,
    new TacticalProfileService({
      progressStore: store,
      puzzleSource: store,
      repository: new MemoryTacticalProfileRepository(),
      calibration,
      naturalFrequency: {
        line: { fork: 0.12 },
        arrow_duel: { pin: 0.12 }
      }
    })
  );
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

const COMPONENT_TACTICAL_PROFILE_CALIBRATION = {
  schemaVersion: 1,
  modelVersion: "component-test-v1",
  calibrationId: "component-test-calibration",
  packFeatureHash: "component-test-pack-rd",
  createdAt: "2026-07-01T00:00:00.000Z",
  provenance: {
    inputSchemaVersion: 1,
    policyId: "component-test-policy",
    policyHash: `sha256:${"1".repeat(64)}`,
    corpusHash: `sha256:${"2".repeat(64)}`,
    reportHash: `sha256:${"3".repeat(64)}`,
    decisionEvidenceId: "component-test-decisions",
    representativeOwnerApproved: true,
    familyReadiness: {
      line: { ready: true, reasons: [] },
      arrow_duel: { ready: true, reasons: [] }
    }
  },
  recencyHalfLifeDays: 90,
  evidence: {
    watchProbability: 0.75,
    recommendationExitProbability: 0.85,
    recommendationProbability: 0.9,
    strongProbability: 0.97,
    minDistinctPuzzles: 4,
    minDistinctSessions: 2
  },
  opportunity: {
    minimumWeight: 0.25,
    exponent: 0.5
  },
  families: {
    line: componentTacticalProfileCalibratedFamily(),
    arrow_duel: componentTacticalProfileCalibratedFamily()
  }
} as const satisfies TacticalProfileCalibrationArtifact;

function componentTacticalProfileCalibratedFamily() {
  return {
    status: "calibrated",
    solve: {
      intercept: 0,
      ratingGapSlope: 1,
      timeoutLogCoefficient: 0,
      timeoutReferenceSeconds: 60,
      themePriorSdRating: 100,
      practicalDeficitRating: 20,
      minExpectedFailuresPer100: 2
    },
    speed: {
      minimumControlWeight: 8,
      slopePriorPrecision: 1,
      minimumResidualSd: 0.15,
      themePriorSdLogSeconds: 0.5,
      practicalTimeMultiplier: 1.2
    }
  } as const;
}

class RecoveringTacticalProfileRepository extends MemoryTacticalProfileRepository {
  private remainingFailedReads = 0;

  failReads(count: number): void {
    this.remainingFailedReads = count;
  }

  override listDirtyDays(
    ...args: Parameters<MemoryTacticalProfileRepository["listDirtyDays"]>
  ): string[] {
    if (this.remainingFailedReads > 0) {
      this.remainingFailedReads -= 1;
      throw new Error("simulated Tactical Profile cache read failure");
    }
    return super.listDirtyDays(...args);
  }
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
    store.recordAttempt({
      id: `review-initial-miss-${item.id}`,
      source: "sprint",
      sessionId: `review-initial-session-${item.id}`,
      puzzleId: item.id,
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "wrong",
      submittedMove: "a1a1",
      expectedMove: "e2e4",
      startedAt: "2026-06-19T11:59:55.000Z",
      completedAt: "2026-06-19T12:00:00.000Z",
      ratingBefore: 600
    });
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

function createAppReviewEligibleService(store: MemoryStore = new MemoryStore()): {
  current: SprintState;
  service: PracticeService;
} {
  const sessions = [
    completedRatingSprintState({
      id: "app-review-one",
      mode: "standard",
      completedAt: "2026-07-27T12:00:00.000Z",
      ratingBefore: 600,
      ratingAfter: 610
    }),
    completedRatingSprintState({
      id: "app-review-two",
      mode: "arrow_duel",
      completedAt: "2026-07-27T13:00:00.000Z",
      ratingBefore: 610,
      ratingAfter: 620
    }),
    completedRatingSprintState({
      id: "app-review-three",
      mode: "custom",
      completedAt: "2026-07-28T12:00:00.000Z",
      ratingBefore: 620,
      ratingAfter: 630
    }),
    completedRatingSprintState({
      id: "app-review-four",
      mode: "standard",
      completedAt: "2026-07-29T12:00:00.000Z",
      ratingBefore: 630,
      ratingAfter: 640
    })
  ];
  for (const session of sessions) {
    store.createSprintSession(session);
  }
  return {
    current: sessions[3] as SprintState,
    service: new PracticeService(store)
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

async function pressAsyncWithin(
  root: TestRenderer.ReactTestInstance,
  testID: string
): Promise<void> {
  await act(async () => {
    const target = root.findByProps({ testID });
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
  act(() => {
    jest.advanceTimersByTime(350);
  });
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
  if (
    renderer.root.findAllByProps({ testID: "board-input-blocker" }).length > 0
    || findByTestId(renderer, "mock-chessboard").props.gestureEnabled === false
  ) {
    await settleEntryPreview();
  }
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
  if (
    renderers.some((renderer) => {
      if (!renderer.root) {
        return false;
      }
      const boards = renderer.root.findAllByProps({ testID: "mock-chessboard" });
      return renderer.root.findAllByProps({ testID: "board-input-blocker" }).length > 0
        || boards.some((board) => board.props.gestureEnabled === false);
    })
  ) {
    await settleEntryPreview();
  }
}

async function settleArrowDuelReplyHandoff(): Promise<void> {
  await advanceArrowDuelReplyToPrompt();
  await finishArrowDuelReplyHandoff();
}

async function advanceArrowDuelReplyToPrompt(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(220);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function finishArrowDuelReplyHandoff(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(1_500);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advanceEntryPreviewBy(milliseconds: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(milliseconds);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function settleEntryPreview(): Promise<void> {
  await advanceEntryPreviewBy(350);
}

function parseBoardMove(move: string): { from: string; to: string; promotion?: string } {
  return {
    from: move.slice(0, 2),
    to: move.slice(2, 4),
    ...(move.length > 4 ? { promotion: move.slice(4, 5) } : {})
  };
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

function safeTestIdForTest(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function expectDisclosureClosed(
  renderer: TestRenderer.ReactTestRenderer,
  contentTestID: "history-advanced-filters" | "review-queue-filters"
): void {
  const motionTestID = contentTestID === "history-advanced-filters"
    ? "history-advanced-filters-motion"
    : "review-filter-options-motion";
  expect(findByTestId(renderer, motionTestID).props).toMatchObject({
    "aria-hidden": true,
    accessibilityElementsHidden: true,
    pointerEvents: "none"
  });
}

function findNativeRunDragSurface(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string
): TestRenderer.ReactTestInstance {
  const surface = renderer.root.findAllByProps({ testID })
    .find((node) => typeof node.props.onTouchStart === "function");
  if (!surface) {
    throw new Error(`Could not find native Run drag surface ${testID}`);
  }
  return surface;
}

function renderedNativeRunTestIds(renderer: TestRenderer.ReactTestRenderer): string[] {
  return [...new Set(
    findByTestId(renderer, "practice-run-list").findAll((node) =>
      typeof node.props.onTouchStart === "function"
        && typeof node.props.testID === "string"
        && node.props.testID.startsWith("practice-run-")
    ).map((node) => node.props.testID as string)
  )];
}

function layoutNativeRunSurface(
  surface: TestRenderer.ReactTestInstance,
  y: number,
  height: number
): void {
  act(() => {
    surface.props.onLayout({ nativeEvent: { layout: { height, y } } });
  });
}

function startNativeRunDrag(surface: TestRenderer.ReactTestInstance, pageY: number): void {
  act(() => {
    surface.props.onTouchStart();
    jest.advanceTimersByTime(180);
    surface.props.onPanResponderGrant({ nativeEvent: { pageY } });
  });
}

function moveNativeRunDrag(
  surface: TestRenderer.ReactTestInstance,
  pageY: number,
  dy: number
): void {
  act(() => {
    surface.props.onPanResponderMove(
      { nativeEvent: { pageY } },
      { dx: 0, dy }
    );
  });
}

function setPracticeViewport({
  fontScale = 1,
  height,
  insets,
  scale,
  width
}: {
  fontScale?: number;
  height: number;
  insets?: PracticeSafeAreaInsets;
  scale: number;
  width: number;
}): void {
  (ReactNative as unknown as {
    __setWindowDimensions?: (dimensions: {
      fontScale: number;
      height: number;
      scale: number;
      width: number;
    }) => void;
  }).__setWindowDimensions?.({ width, height, scale, fontScale });
  if (insets) {
    (SafeAreaContext as unknown as {
      __setSafeAreaInsets?: (nextInsets: PracticeSafeAreaInsets) => void;
    }).__setSafeAreaInsets?.(insets);
  }
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

function promptKingTestIDs(renderer: TestRenderer.ReactTestRenderer): string[] {
  return [...new Set(
    collectTestIds(findByTestId(renderer, "practice-prompt"))
      .filter((testID) => testID.startsWith("chessboard-king-"))
  )];
}

function collectText(node: TestRenderer.ReactTestInstance): string {
  const ownText = node.children.filter((child): child is string => typeof child === "string").join("");
  const childText = node.children
    .filter((child): child is TestRenderer.ReactTestInstance => typeof child !== "string")
    .map((child) => collectText(child))
    .join("");
  return ownText + childText;
}

function collectVisibleText(node: TestRenderer.ReactTestInstance): string {
  if (
    node.props.accessibilityElementsHidden === true
    || node.props.importantForAccessibility === "no-hide-descendants"
    || flattenTestStyle(node.props.style).opacity === 0
  ) {
    return "";
  }
  const ownText = node.children.filter((child): child is string => typeof child === "string").join("");
  const childText = node.children
    .filter((child): child is TestRenderer.ReactTestInstance => typeof child !== "string")
    .map((child) => collectVisibleText(child))
    .join("");
  return ownText + childText;
}

function promptLayoutSlots(
  renderer: TestRenderer.ReactTestRenderer
): TestRenderer.ReactTestInstance[] {
  return [
    "practice-prompt-title-layout",
    "practice-prompt-context",
    "practice-prompt-hint"
  ].flatMap((testID) => {
    try {
      return [findByTestId(renderer, testID)];
    } catch {
      return [];
    }
  });
}

function promptLayoutSlotTestIDs(renderer: TestRenderer.ReactTestRenderer): string[] {
  return promptLayoutSlots(renderer).map((slot) => slot.props.testID as string);
}

function expectSolvedPromptReservesLayout(
  renderer: TestRenderer.ReactTestRenderer,
  expectedTestIDs: string[]
): void {
  expect(collectVisibleText(findByTestId(renderer, "practice-prompt"))).toBe("Solved");
  const slots = promptLayoutSlots(renderer);
  expect(slots.map((slot) => slot.props.testID)).toEqual(expectedTestIDs);
  expect(flattenTestStyle(findByTestId(renderer, "practice-prompt-copy").props.style).position)
    .toBe("relative");
  const solvedOverlayStyle = flattenTestStyle(
    findByTestId(renderer, "practice-prompt-solved-overlay").props.style
  );
  expect(solvedOverlayStyle).toEqual(expect.objectContaining({
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  }));
  expect(flattenTestStyle(findByTestId(renderer, "practice-prompt-solved-title").props.style).fontSize)
    .toBe(flattenTestStyle(findByTestId(renderer, "practice-prompt-title-layout").props.style).fontSize);
  for (const slot of slots) {
    expect(flattenTestStyle(slot.props.style).opacity).toBe(0);
    expect(slot.props.accessibilityElementsHidden).toBe(true);
    expect(slot.props.importantForAccessibility).toBe("no-hide-descendants");
  }
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
