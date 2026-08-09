import React, { useEffect, useMemo, useState } from "react";
import type {
  AttemptEvent,
  Puzzle,
  SprintMode,
  SprintState,
  TacticalProfileCalibrationArtifact,
  TacticalProfileTaskFamily
} from "../../../packages/core/src/index.ts";
import {
  beginArrowDuelPuzzle,
  defaultSprintConfig,
  startSprint
} from "../../../packages/core/src/index.ts";
import { MemoryStore } from "../../../packages/storage/src/memory-store.ts";
import { PracticeService } from "../../../packages/storage/src/practice-service.ts";
import { MemoryTacticalProfileRepository } from "../../../packages/storage/src/tactical-profile-repository.ts";
import { TacticalProfileService } from "../../../packages/storage/src/tactical-profile-service.ts";
import { PracticePocScreen } from "../../mobile/src/components/PracticePocScreen.tsx";
import type { MobilePlatformCapabilities } from "../../mobile/src/platform/mobilePlatformCapabilities.ts";
import type {
  ReviewReminderNotificationClient,
  ReviewReminderNotificationRoute,
  ReviewReminderPermissionStatus
} from "../../mobile/src/platform/reviewReminderScheduler.ts";
import {
  createTestMobilePlatformCapabilities,
  type TestMobilePlatformCapabilityOverrides
} from "../../mobile/src/testing/testMobilePlatformCapabilities.ts";
import { FakeICloudProgressSyncClient } from "../../mobile/src/platform/iCloudProgressSync.ts";
import {
  configureMobilePracticePuzzleSource,
  type MobilePuzzleSource
} from "./browserMobilePractice.ts";
import { previewBrowserMoveFeedback } from "./browserMoveFeedbackPreview.ts";
import { clearLabPracticeService, setLabPracticeService } from "./boardController.ts";
import { ISSUE_272_LAB_PUZZLE, LAB_PUZZLES, PRIMARY_LAB_PUZZLE } from "./labPuzzles.ts";
import {
  createLabICloudSyncDiagnosticsClient,
  labMobilePlatformForScenario
} from "./labICloudSyncDiagnostics.ts";
import { scenarioRegistry, type LabScenarioId } from "./scenarioRegistry.ts";
import {
  SERVER_CURATED_THEME_PRESENTATION,
  THEME_CATALOG_LAB_PUZZLES
} from "./themeCatalogPrototype.ts";
import {
  initialTacticalProfileFixtureState,
  isTacticalProfileScenario,
  reduceTacticalProfileFixtureState,
  tacticalProfilePresentationFor
} from "./tacticalProfileFixture.ts";
import {
  historyProgressPresentationFor,
  isHistoryProgressScenario
} from "./historyProgressFixture.ts";
import {
  createArrowDuelReplyChallengeFixture
} from "./arrowDuelReplyChallengeFixture.ts";

export const LAB_NOW_MS = new Date("2026-07-18T18:00:00.000Z").getTime();

const HISTORY_INCOMPLETE_LAB_PUZZLE: Puzzle = {
  ...LAB_PUZZLES[4]!,
  id: "lab-incomplete-06",
  rating: 1180,
  themes: ["promotion"]
};

const ARROW_DUEL_REPLAY_LAB_PUZZLE: Puzzle = {
  id: "lab-arrow-duel-replay-line",
  initialFen: "4k3/8/8/8/8/8/4P3/4K3 b - - 0 1",
  rating: 820,
  solutionMoves: ["e8d7", "e2e4", "d7e6", "e4e5", "e6f5", "e5e6"],
  source: "synthetic",
  stockfishBestMove: "e8f7",
  stockfishEval: 180,
  stockfishEvalAfterFirstMove: -220,
  themes: ["endgame"]
};

export const ARROW_DUEL_REPLY_LAB_MOVES = {
  default: {
    correctChoice: PRIMARY_LAB_PUZZLE.stockfishBestMove!,
    expectedReply: PRIMARY_LAB_PUZZLE.solutionMoves[1]!,
    wrongChoice: PRIMARY_LAB_PUZZLE.solutionMoves[0]!
  }
} as const;

type ScreenProps = Omit<React.ComponentProps<typeof PracticePocScreen>, "platformCapabilities">;

type ScenarioRuntime = {
  platformCapabilities: MobilePlatformCapabilities;
  screenProps: ScreenProps;
  service: PracticeService;
};

export type LabStoryPresentation = {
  storyId: string;
  title: string;
};

export function LabScenario({
  arrowDuelReplyAutoTimeoutMs,
  arrowDuelReplyPreparationConfirmationRequired,
  arrowDuelReplyPreparationHoldMs,
  arrowDuelReplySeconds,
  runReorderPickedUpRunId,
  scenarioId,
  storyPresentation
}: {
  arrowDuelReplyAutoTimeoutMs?: number;
  arrowDuelReplyPreparationConfirmationRequired?: boolean;
  arrowDuelReplyPreparationHoldMs?: number;
  arrowDuelReplySeconds?: number;
  runReorderPickedUpRunId?: string;
  scenarioId: LabScenarioId;
  storyPresentation?: LabStoryPresentation;
}): React.JSX.Element {
  const runtime = useMemo(() => createScenarioRuntime(scenarioId), [scenarioId]);

  return (
    <LabScenarioContent
      key={scenarioId}
      arrowDuelReplyAutoTimeoutMs={arrowDuelReplyAutoTimeoutMs}
      arrowDuelReplyPreparationConfirmationRequired={
        arrowDuelReplyPreparationConfirmationRequired
      }
      arrowDuelReplyPreparationHoldMs={arrowDuelReplyPreparationHoldMs}
      arrowDuelReplySeconds={arrowDuelReplySeconds}
      runReorderPickedUpRunId={runReorderPickedUpRunId}
      runtime={runtime}
      scenarioId={scenarioId}
      storyPresentation={storyPresentation}
    />
  );
}

function LabScenarioContent({
  arrowDuelReplyAutoTimeoutMs,
  arrowDuelReplyPreparationConfirmationRequired,
  arrowDuelReplyPreparationHoldMs,
  arrowDuelReplySeconds,
  runReorderPickedUpRunId,
  runtime,
  scenarioId,
  storyPresentation
}: {
  arrowDuelReplyAutoTimeoutMs?: number;
  arrowDuelReplyPreparationConfirmationRequired?: boolean;
  arrowDuelReplyPreparationHoldMs?: number;
  arrowDuelReplySeconds?: number;
  runReorderPickedUpRunId?: string;
  runtime: ScenarioRuntime;
  scenarioId: LabScenarioId;
  storyPresentation?: LabStoryPresentation;
}): React.JSX.Element {
  const tacticalProfileScenarioId = isTacticalProfileScenario(scenarioId)
    ? scenarioId
    : scenarioId === "practice-home"
      ? "practice-tactical-profile-collecting"
      : null;
  const [selectedCustomThemes, setSelectedCustomThemes] = useState<string[]>([]);
  const [tacticalProfileState, setTacticalProfileState] = useState(() =>
    tacticalProfileScenarioId
      ? initialTacticalProfileFixtureState(tacticalProfileScenarioId)
      : { screen: "home" as const, selectedTaskFamily: "line" as const }
  );
  const [startedFocusedRun, setStartedFocusedRun] = useState<SprintState | null>(null);
  const [runReorderFeedbackPreview, setRunReorderFeedbackPreview] = useState<string | null>(null);
  const [runReorderDesignPreviewActive, setRunReorderDesignPreviewActive] = useState(
    runReorderPickedUpRunId !== undefined
  );
  const arrowDuelReplyFixture = useMemo(
    () => createArrowDuelReplyChallengeFixture(
      runtime.service,
      () => new Date(LAB_NOW_MS).toISOString()
    ),
    [runtime.service]
  );
  const showsThemeCatalogPrototype =
    isRunManagementScenario(scenarioId)
    || isHistoryProgressScenario(scenarioId)
    || [
    "history-filters",
    "history-attempt-detail"
  ].includes(scenarioId);
  const entryPreviewEnabled = isPuzzleEntryPreviewScenario(scenarioId);

  setLabPracticeService(
    runtime.service,
    entryPreviewEnabled,
    entryPreviewEnabled ? ISSUE_272_LAB_PUZZLE.id : null
  );
  useEffect(() => () => clearLabPracticeService(runtime.service), [runtime.service]);
  useEffect(() => setSelectedCustomThemes([]), [scenarioId]);
  useEffect(() => {
    setRunReorderDesignPreviewActive(runReorderPickedUpRunId !== undefined);
    setRunReorderFeedbackPreview(null);
  }, [runReorderPickedUpRunId, scenarioId]);
  useEffect(() => {
    if (tacticalProfileScenarioId) {
      setTacticalProfileState(initialTacticalProfileFixtureState(tacticalProfileScenarioId));
      setStartedFocusedRun(null);
    }
  }, [tacticalProfileScenarioId]);

  const tacticalProfilePresentation = tacticalProfileScenarioId
    && startedFocusedRun === null
    ? tacticalProfilePresentationFor(
        tacticalProfileScenarioId,
        tacticalProfileState,
        (intent) => {
          if (intent.type === "start-focused-run") {
            setStartedFocusedRun(runtime.service.startFocusedRun(
              tacticalProfileState.selectedTaskFamily,
              new Date(LAB_NOW_MS).toISOString(),
              `interaction-lab-focused-run-${tacticalProfileState.selectedTaskFamily}`
            ));
          }
          setTacticalProfileState((current) =>
            reduceTacticalProfileFixtureState(current, intent)
          );
        }
      )
    : undefined;
  const screenProps = startedFocusedRun === null
    ? runtime.screenProps
    : {
        ...runtime.screenProps,
        sprintRulesDesignPreview: {
          initialActiveState: startedFocusedRun
        }
      };
  const screenPropsWithReplyFixture = screenProps.sprintRulesDesignPreview
    ?.arrowDuelReplyChallenge
    ? {
        ...screenProps,
        sprintRulesDesignPreview: {
          ...screenProps.sprintRulesDesignPreview,
          arrowDuelReplyChallenge: {
            ...screenProps.sprintRulesDesignPreview.arrowDuelReplyChallenge,
            ...arrowDuelReplyFixture
          }
        }
      }
    : screenProps;
  const effectiveScreenProps = arrowDuelReplyAutoTimeoutMs === undefined
    && arrowDuelReplyPreparationConfirmationRequired === undefined
    && arrowDuelReplyPreparationHoldMs === undefined
    && arrowDuelReplySeconds === undefined
    ? screenPropsWithReplyFixture
    : {
        ...screenPropsWithReplyFixture,
        sprintRulesDesignPreview: {
          ...screenPropsWithReplyFixture.sprintRulesDesignPreview,
          arrowDuelReplyChallenge: {
            ...screenPropsWithReplyFixture.sprintRulesDesignPreview?.arrowDuelReplyChallenge,
            enabled: true,
            ...arrowDuelReplyFixture,
            ...(arrowDuelReplyAutoTimeoutMs === undefined
              ? {}
              : { autoTimeoutMs: arrowDuelReplyAutoTimeoutMs }),
            ...(arrowDuelReplyPreparationConfirmationRequired === undefined
              ? {}
              : {
                  preparationConfirmationRequired:
                    arrowDuelReplyPreparationConfirmationRequired
                }),
            ...(arrowDuelReplyPreparationHoldMs === undefined
              ? {}
              : { preparationHoldMs: arrowDuelReplyPreparationHoldMs }),
            ...(arrowDuelReplySeconds === undefined
              ? {}
              : { replySeconds: arrowDuelReplySeconds })
          }
        }
      };

  return (
    <LabScenarioShell
      nativeFeedbackPreview={runReorderPickedUpRunId && runReorderDesignPreviewActive
        ? "Medium haptic requested on pickup"
        : runReorderFeedbackPreview}
      scenarioId={scenarioId}
      storyPresentation={storyPresentation}
    >
      <PracticePocScreen
        key={startedFocusedRun === null
          ? `scenario-${scenarioId}`
          : `tactical-focus-active-${startedFocusedRun.id}`}
        customThemeSelection={{
          selectedThemes: selectedCustomThemes,
          onChange: setSelectedCustomThemes
        }}
        historyProgressPresentation={isHistoryProgressScenario(scenarioId)
          ? historyProgressPresentationFor(scenarioId)
          : undefined}
        platformCapabilities={runtime.platformCapabilities}
        practiceHomeReviewCardVisible={false}
        reviewActiveFilterSummaryVisible={false}
        runReorderDesignPreview={runReorderPickedUpRunId && runReorderDesignPreviewActive
          ? { pickedUpRunId: runReorderPickedUpRunId }
          : undefined}
        runReorderFeedbackPreview={scenarioId === "practice-home-edit"
          ? ({ haptic }) => {
              setRunReorderDesignPreviewActive(false);
              setRunReorderFeedbackPreview(
                `${haptic === "medium" ? "Medium" : haptic} haptic requested on pickup`
              );
            }
          : undefined}
        themeCatalogPresentation={showsThemeCatalogPrototype
          ? SERVER_CURATED_THEME_PRESENTATION
          : undefined}
        runEloEditingMovedToHome
        tacticalProfilePresentation={tacticalProfilePresentation}
        {...effectiveScreenProps}
      />
    </LabScenarioShell>
  );
}

function isRunManagementScenario(scenarioId: LabScenarioId): boolean {
  return isTacticalProfileScenario(scenarioId) || [
    "practice-home",
    "practice-first-sprint-guide",
    "practice-home-edit",
    "practice-custom-setup",
    "practice-run-name-validation",
    "practice-run-standard-editor",
    "practice-run-arrow-duel-editor",
    "practice-custom-rating-editor",
    "practice-run-remove-confirmation",
    "practice-runs-empty"
  ].includes(scenarioId);
}

function sprintRulesDesignPreviewFor(
  scenarioId: LabScenarioId
): React.ComponentProps<typeof PracticePocScreen>["sprintRulesDesignPreview"] {
  const firstRunGuide = {
    durationLabel: "5:00",
    maxMistakes: 3,
    targetCorrect: 15
  };
  if (scenarioId === "practice-first-sprint-guide") {
    return {
      firstRunGuide,
      firstRunGuideInitiallyVisible: true,
      timeoutCountsAsMistake: true
    };
  }
  if (
    scenarioId === "practice-custom-setup"
    || scenarioId === "practice-run-standard-editor"
    || scenarioId === "practice-run-arrow-duel-editor"
    || scenarioId === "practice-custom-rating-editor"
  ) {
    return {
      ...(scenarioId === "practice-custom-setup" || scenarioId === "practice-run-arrow-duel-editor"
        ? { arrowDuelReplyChallenge: { enabled: true } }
        : {}),
      firstRunGuide,
      showRunEditorSummary: true,
      timeoutCountsAsMistake: true
    };
  }
  if (
    scenarioId === "practice-active-session-guide"
    || scenarioId === "practice-arrow-duel-guide"
    || scenarioId === "practice-arrow-duel-guide-only"
  ) {
    const sharedGuide = {
      durationLabel: "5:00",
      guideKey: "active_session" as const,
      maxMistakes: 3,
      mode: "standard" as const,
      targetCorrect: 15
    };
    const arrowDuelGuide = {
      ...sharedGuide,
      arrowDuelReplyChallenge: true,
      arrowDuelReplyOnboarding: "choice_then_reply" as const,
      guideKey: "arrow_duel" as const,
      mode: "arrow_duel" as const
    };
    return {
      initialSessionGuides: scenarioId === "practice-arrow-duel-guide"
        ? [sharedGuide, arrowDuelGuide]
        : [scenarioId === "practice-arrow-duel-guide-only" ? arrowDuelGuide : sharedGuide],
      timeoutCountsAsMistake: true
    };
  }
  if (scenarioId === "practice-tactical-focus-guide") {
    return {
      initialSessionGuides: [{
        durationLabel: "5:00",
        focusedRun: true,
        guideKey: "focused_run",
        maxAttempts: 15,
        maxMistakes: 15,
        mode: "standard",
        targetCorrect: 15
      }],
      timeoutCountsAsMistake: true
    };
  }
  if (
    scenarioId === "practice-arrow-duel-prompt"
    || scenarioId === "review-arrow-duel-reply"
  ) {
    return {
      arrowDuelReplyChallenge: {
        enabled: true,
        explicitReplySideCopy: true
      },
      timeoutCountsAsMistake: true
    };
  }
  if (
    scenarioId === "practice-timing-timeout"
    || scenarioId === "practice-timeout-review-notice"
  ) {
    return { timeoutCountsAsMistake: true };
  }
  if (
    scenarioId === "practice-sprint-result-goal"
    || scenarioId === "practice-sprint-result-replay"
  ) {
    return {
      initialResultState: sprintRulesResultState({
        correctCount: 11,
        endReason: "time_expired",
        mistakeCount: 1,
        ratingAfter: 1070,
        status: "failed"
      }),
      resultReplayItems: sprintResultReplayDesignItems(),
      resultUnclearSummary: {
        slowMarkedCount: 1,
        userMarkedCount: 1
      }
    };
  }
  if (scenarioId === "practice-sprint-result-incomplete") {
    return {
      initialResultState: sprintRulesResultState({
        correctCount: 1,
        endReason: "time_expired",
        mistakeCount: 0,
        ratingAfter: 1090,
        status: "failed"
      }),
      initialResultUnclearPrompt: {
        marked: false,
        question: "Was the final puzzle unclear?"
      },
      resultUnclearSummary: {
        slowMarkedCount: 0,
        userMarkedCount: 0
      }
    };
  }
  if (scenarioId === "practice-sprint-result-extra-attempt") {
    return {
      initialResultState: sprintRulesResultState({
        correctCount: 15,
        endReason: "target_reached",
        mistakeCount: 1,
        ratingAfter: 1104,
        status: "won"
      }),
      resultUnclearSummary: {
        slowMarkedCount: 1,
        userMarkedCount: 0
      }
    };
  }
  if (scenarioId === "practice-app-store-review-request") {
    return {
      initialResultState: sprintRulesResultState({
        correctCount: 15,
        endReason: "target_reached",
        mistakeCount: 0,
        ratingAfter: 1112,
        status: "won"
      })
    };
  }
  if (scenarioId === "practice-tactical-focus-active") {
    return {
      initialActiveState: tacticalFocusActiveState()
    };
  }
  if (scenarioId === "practice-tactical-focus-result") {
    const initialResultState = sprintRulesResultState({
      correctCount: 13,
      endReason: "attempt_limit",
      mistakeCount: 2,
      ratingAfter: 1087,
      status: "won"
    });
    return {
      initialResultState: {
        ...initialResultState,
        config: {
          ...initialResultState.config,
          targetCorrect: 15,
          maxMistakes: 15,
          maxAttempts: 15,
          ratingPolicy: "unrated",
          tacticalFocus: {
            taskFamily: "line",
            themes: ["fork"],
            mixedControlCount: 5,
            ratingAnchor: 1087,
            minRating: 987,
            maxRating: 1187
          }
        }
      }
    };
  }
  if (scenarioId === "settings-sprint-guidance") {
    return { showSettingsReset: true };
  }
  if (isRunManagementScenario(scenarioId)) {
    return { firstRunGuide, timeoutCountsAsMistake: true };
  }
  return undefined;
}

function tacticalFocusActiveState(
  taskFamily: TacticalProfileTaskFamily = "line"
): SprintState {
  const startedAt = new Date(LAB_NOW_MS - 2 * 60 * 1000).toISOString();
  const deadlineAt = new Date(LAB_NOW_MS + 3 * 60 * 1000).toISOString();
  const puzzles = Array.from({ length: 15 }, (_, index) => {
    const puzzle = LAB_PUZZLES[index % LAB_PUZZLES.length]!;
    return {
      ...puzzle,
      id: `tactical-focus-${index + 1}-${puzzle.id}`
    };
  });
  const activePuzzle = puzzles[10]!;
  const isArrowDuel = taskFamily === "arrow_duel";
  const currentPuzzle = isArrowDuel
    ? beginArrowDuelPuzzle(activePuzzle, "tactical-focus-active")
    : {
        autoPlayedMoves: [activePuzzle.solutionMoves[0]!],
        currentFen: "8/3k4/8/8/8/8/4P3/4K3 w - - 1 2",
        cursor: 1,
        kind: "line" as const,
        playedMoves: [],
        puzzle: activePuzzle,
        solved: false
      };
  const ratingAnchor = isArrowDuel ? 875 : 1087;
  return {
    bestStreak: 4,
    config: {
      ...defaultSprintConfig(isArrowDuel ? "arrow_duel" : "standard"),
      maxAttempts: 15,
      maxMistakes: 15,
      ratingPolicy: "unrated",
      tacticalFocus: {
        taskFamily,
        themes: [isArrowDuel ? "pin" : "fork"],
        mixedControlCount: 5,
        ratingAnchor,
        minRating: ratingAnchor - 100,
        maxRating: ratingAnchor + 100
      },
      targetCorrect: 15
    },
    correctCount: 8,
    currentPuzzle,
    currentPuzzleIndex: 10,
    currentStreak: 2,
    deadlineAt,
    hasUserSubmittedMove: false,
    id: "tactical-focus-active",
    mistakeCount: 2,
    puzzles,
    ratingBefore: ratingAnchor,
    startedAt,
    status: "active"
  };
}

function sprintRulesResultState({
  correctCount,
  endReason,
  mistakeCount,
  ratingAfter,
  status
}: {
  correctCount: number;
  endReason: "attempt_limit" | "target_reached" | "time_expired";
  mistakeCount: number;
  ratingAfter: number;
  status: "failed" | "won";
}): SprintState {
  const startedAt = new Date(LAB_NOW_MS - 5 * 60 * 1000).toISOString();
  const completedAt = new Date(LAB_NOW_MS).toISOString();
  return {
    bestStreak: 6,
    completedAt,
    config: defaultSprintConfig("standard"),
    correctCount,
    currentPuzzleIndex: correctCount + mistakeCount,
    currentStreak: status === "won" ? 6 : 0,
    deadlineAt: completedAt,
    endReason,
    hasUserSubmittedMove: true,
    id: `sprint-rules-${status}`,
    mistakeCount,
    puzzles: [],
    ratingAfter,
    ratingBefore: 1087,
    startedAt,
    status
  };
}

function sprintResultReplayDesignItems(): NonNullable<
  NonNullable<
    React.ComponentProps<typeof PracticePocScreen>["sprintRulesDesignPreview"]
  >["resultReplayItems"]
> {
  const completedAt = "2026-07-18T18:00:00.000Z";
  return [
    {
      puzzle: LAB_PUZZLES[0]!,
      attempt: historyAttempt({
        completedAt,
        id: "sprint-result-replay-unclear",
        puzzleId: LAB_PUZZLES[0]!.id,
        ratingAfter: 1092,
        ratingBefore: 1087,
        result: "correct",
        unclear: true
      }),
      inReview: false
    },
    {
      puzzle: LAB_PUZZLES[1]!,
      attempt: historyAttempt({
        completedAt,
        elapsedMs: 45_000,
        id: "sprint-result-replay-unclear-slow",
        puzzleId: LAB_PUZZLES[1]!.id,
        ratingAfter: 1098,
        ratingBefore: 1092,
        result: "correct",
        timingStatus: "slow",
        unclear: true
      }),
      inReview: false
    },
    {
      puzzle: LAB_PUZZLES[2]!,
      attempt: historyAttempt({
        completedAt,
        id: "sprint-result-replay-in-review-wrong",
        puzzleId: LAB_PUZZLES[2]!.id,
        ratingAfter: 1084,
        ratingBefore: 1098,
        result: "wrong"
      }),
      inReview: true
    },
    {
      puzzle: LAB_PUZZLES[3]!,
      attempt: historyAttempt({
        completedAt,
        elapsedMs: 20_000,
        id: "sprint-result-replay-in-review-timeout",
        puzzleId: LAB_PUZZLES[3]!.id,
        ratingAfter: 1084,
        ratingBefore: 1084,
        result: "timed_out",
        timingStatus: "timed_out"
      }),
      inReview: true
    }
  ];
}

export function LabScenarioShell({
  children,
  nativeFeedbackPreview,
  scenarioId,
  storyPresentation
}: {
  children: React.ReactNode;
  nativeFeedbackPreview?: string | null;
  scenarioId: LabScenarioId;
  storyPresentation?: LabStoryPresentation;
}): React.JSX.Element {
  const definition = scenarioRegistry[scenarioId];
  const storyId = storyPresentation?.storyId ?? definition.storyId;
  const storyTitle = storyPresentation?.title ?? definition.title;

  return (
    <div className="lab-scenario-shell">
      {nativeFeedbackPreview ? (
        <div
          className="lab-native-feedback-preview"
          data-testid="lab-run-reorder-feedback"
          role="status"
        >
          <strong>LAB preview</strong>
          <span>{nativeFeedbackPreview}</span>
        </div>
      ) : null}
      <aside className="lab-toolbar" aria-label="Interaction Lab scenario controls">
        <details>
          <summary>
            {definition.nativeBoundary
              ? `${definition.group} · Native boundary`
              : `${definition.group} · ${storyTitle}`}
          </summary>
          <div className="lab-toolbar-body">
            <p>{definition.description}</p>
            <p><strong>Scenario Scope:</strong> {definition.scope.includes.join(" · ")}</p>
            <p><strong>Boundary exits:</strong> {definition.scope.exits.join(" · ")}</p>
            {definition.nativeBoundary ? (
              <div
                className="lab-native-boundary"
                data-testid="lab-native-boundary"
              >
                <p><strong>{definition.nativeBoundary.title}</strong></p>
                <p>{definition.nativeBoundary.detail}</p>
              </div>
            ) : null}
            <p className="lab-containment-note">
              {definition.scope.containment === "contained"
                ? "Contained design slice: actions remain inside deterministic prototype state."
                : "Whole-screen scenario: free roaming remains enabled until this presentation area is extracted."}
            </p>
            <div className="lab-toolbar-actions">
              <button
                type="button"
                onClick={() => (
                  globalThis as typeof globalThis & { location: { reload: () => void } }
                ).location.reload()}
              >
                Reset scenario
              </button>
              <a href={`./iframe.html?id=${storyId}&viewMode=story`}>Full-screen URL</a>
            </div>
          </div>
        </details>
      </aside>
      <main className="lab-app-surface" data-testid="lab-app-surface">
        {children}
      </main>
    </div>
  );
}

function iCloudSyncErrorDetailsPresentation(
  bundleKind: "complete" | "partial"
): NonNullable<ScreenProps["iCloudSyncErrorDetails"]> {
  return {
    copyText: [
      "Chessticize iCloud Sync Diagnostic",
      "App: 1.2.2 (38)",
      "Failed at: 2026-07-26T16:42:00.000Z",
      "Sync attempt: Manual",
      "Phase: Fetch from iCloud",
      "Code: icloud_fetch_failed",
      "Domain: CKErrorDomain",
      "Message: The request was rate limited. Please try again later.",
      "Retry after: 12 seconds"
    ].join("\n"),
    message: "The request was rate limited. Please try again later.",
    occurredAtLabel: "Jul 26, 2026 at 9:42 AM",
    onCopy: async () => {},
    supportBundle: {
      onPrepare: async () => bundleKind === "complete"
        ? {
            kind: "complete",
            files: [
              "local-progress.sqlite",
              "icloud-progress-snapshot.json",
              "diagnostic.txt",
              "manifest.json"
            ]
          }
        : {
            kind: "partial",
            files: [
              "local-progress.sqlite",
              "diagnostic.txt",
              "manifest.json"
            ],
            unavailableReason: "CloudKit snapshot unavailable: The request was rate limited."
          },
      onShare: async () => {}
    }
  };
}

function createScenarioRuntime(scenarioId: LabScenarioId): ScenarioRuntime {
  let service = createSeededService();
  let configurePuzzleSource = true;
  let notificationStatus: ReviewReminderPermissionStatus = "authorized";
  const reminderPlatform = labMobilePlatformForScenario(scenarioId);
  const progressProtection: MobilePlatformCapabilities["progressProtection"] =
    reminderPlatform === "ios"
      ? { kind: "icloud_sync" }
      : { kind: "android_managed_backup" };
  const screenProps: ScreenProps = {
    collapsibleMotionPreview: [
      "history-filters",
      "practice-custom-setup",
      "review-due",
      "review-filters"
    ].includes(scenarioId)
      ? { durationMs: 200 }
      : undefined,
    currentTimeMs: () => LAB_NOW_MS,
    moveFeedbackSettings: {},
    puzzleSelectionSeed: "interaction-lab",
    reviewTodayDesignPreview: scenarioId === "review-due"
      ? {
          showTodaySections: true,
          collapsibleSections: {
            todayInitiallyExpanded: true,
            completedInitiallyExpanded: true
          },
          attemptSummaries: [
            {
              puzzleId: "lab-fork-01",
              mode: "standard",
              ratingKey: "standard 5/20",
              attemptCount: 1,
              missCount: 1
            },
            {
              puzzleId: "lab-skewer-03",
              mode: "arrow_duel",
              ratingKey: "arrow_duel 5/30",
              attemptCount: 3,
              missCount: 2
            }
          ]
        }
      : undefined,
    sprintGuidanceEnabled: scenarioId.startsWith("settings-"),
    sprintRulesDesignPreview: sprintRulesDesignPreviewFor(scenarioId),
    standardTargetCorrect: 1,
    arrowDuelTargetCorrect: 1,
    customTargetCorrect: 1
  };
  if (isRunManagementScenario(scenarioId)) {
    service = isTacticalProfileScenario(scenarioId)
      ? createTacticalProfileLabService()
      : createRunManagementService(
          scenarioId === "practice-runs-empty",
          scenarioId === "practice-home" ? 28 : 0
        );
    screenProps.runManagementEnabled = true;
  }

  switch (scenarioId) {
    case "practice-sprint-result-goal":
    case "practice-sprint-result-replay":
      service = createSprintResultReplayService();
      configurePuzzleSource = false;
      break;
    case "practice-blunder-move-preview":
      service = createIssue272Service(false);
      configurePuzzleSource = false;
      break;
    case "practice-active-session-guide":
    case "practice-arrow-duel-guide":
    case "practice-arrow-duel-guide-only":
      service = createSessionGuideService();
      configurePuzzleSource = false;
      screenProps.standardTargetCorrect = 15;
      screenProps.arrowDuelTargetCorrect = 15;
      break;
    case "settings-sprint-guidance":
      screenProps.initialTab = "settings";
      break;
    case "practice-unclear-follow-up":
      screenProps.arrowDuelTargetCorrect = 2;
      break;
    case "practice-arrow-duel-prompt":
      screenProps.arrowDuelTargetCorrect = 2;
      break;
    case "practice-preparing":
    case "system-loading":
      screenProps.sprintStartDelayMs = 60_000;
      break;
    case "practice-reminder-prompt":
    case "settings-notifications-not-determined":
      notificationStatus = "not_determined";
      break;
    case "review-due":
    case "review-session":
    case "review-arrow-duel-reply":
    case "review-feedback-analysis":
      service = createReviewService("due");
      break;
    case "review-blunder-move-preview":
      service = createIssue272Service(true);
      configurePuzzleSource = false;
      break;
    case "review-overdue":
    case "review-filters":
      service = createReviewService("overdue");
      break;
    case "history-populated":
    case "history-filters":
      service = createHistoryService(false, THEME_CATALOG_LAB_PUZZLES);
      configurePuzzleSource = false;
      break;
    case "history-attempt-detail":
    case "history-progress":
    case "history-progress-weakness":
    case "history-progress-speed-weakness":
      service = createHistoryService(false, THEME_CATALOG_LAB_PUZZLES);
      configurePuzzleSource = false;
      break;
    case "history-arrow-duel-replay":
      service = createArrowDuelReplayService();
      configurePuzzleSource = false;
      break;
    case "history-replay-unavailable":
      service = createHistoryService(true);
      break;
    case "settings-ios-sync":
      notificationStatus = "not_determined";
      screenProps.moveFeedbackSettings = {
        preview: previewBrowserMoveFeedback
      };
      break;
    case "settings-ios-sync-error-details":
      screenProps.iCloudSyncErrorDetails = iCloudSyncErrorDetailsPresentation("complete");
      break;
    case "settings-ios-sync-support-bundle":
      screenProps.iCloudSyncSupportBundle =
        iCloudSyncErrorDetailsPresentation("complete").supportBundle;
      break;
    case "settings-ios-sync-support-bundle-partial":
      screenProps.iCloudSyncErrorDetails = iCloudSyncErrorDetailsPresentation("partial");
      break;
    case "settings-notifications-denied":
      notificationStatus = "denied";
      break;
    case "settings-feedback-entry-failure":
      screenProps.feedbackIssuesOpener = async () => {
        throw new Error("browser unavailable");
      };
      break;
    case "system-error":
      service = new PracticeService(new MemoryStore());
      configurePuzzleSource = false;
      break;
    default:
      break;
  }

  if (
    scenarioId === "practice-wrong-review-notice"
    || scenarioId === "practice-slow-unclear-notice"
  ) {
    const active = service.startSprint({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 60,
      targetCorrect: 2
    }, new Date(LAB_NOW_MS).toISOString());
    screenProps.sprintRulesDesignPreview = {
      ...(screenProps.sprintRulesDesignPreview ?? {}),
      initialPreviousAttemptNotice: scenarioId === "practice-wrong-review-notice"
        ? "wrong"
        : "slow",
      initialResultState: active
    };
    screenProps.standardTargetCorrect = 2;
  }

  const initialPuzzleElapsedSeconds = timingScenarioInitialElapsedSeconds(scenarioId);
  if (initialPuzzleElapsedSeconds !== null) {
    screenProps.currentTimeMs = createLivePuzzleClock(
      service,
      initialPuzzleElapsedSeconds
    );
    screenProps.standardTargetCorrect = 2;
  }

  const notificationClient = new LabNotificationClient(notificationStatus);
  const capabilityOverrides: TestMobilePlatformCapabilityOverrides = {
    practiceService: service,
    reviewReminderNotificationClient: notificationClient,
    reminderPlatform,
    progressProtection,
    iCloudProgressSyncClient: reminderPlatform === "ios"
      ? new FakeICloudProgressSyncClient(undefined, "no_account")
      : null,
    iCloudSyncDiagnosticsClient: createLabICloudSyncDiagnosticsClient(reminderPlatform)
  };
  if (
    scenarioId === "settings-ios-sync-error-details"
    || scenarioId === "settings-ios-sync-support-bundle"
    || scenarioId === "settings-ios-sync-support-bundle-partial"
  ) {
    capabilityOverrides.applicationMetadata = {
      versionName: "1.2.2",
      buildNumber: "38"
    };
  }
  if (configurePuzzleSource) {
    capabilityOverrides.configurePuzzleSource = (
      currentService: PracticeService,
      source: MobilePuzzleSource
    ) => configureMobilePracticePuzzleSource(currentService, source);
  }

  return {
    service,
    screenProps,
    platformCapabilities: createTestMobilePlatformCapabilities(capabilityOverrides)
  };
}

function timingScenarioInitialElapsedSeconds(scenarioId: LabScenarioId): number | null {
  if (scenarioId === "practice-active") {
    return 24;
  }
  if (scenarioId === "practice-timing-warning") {
    return 41;
  }
  if (scenarioId === "practice-timing-timeout") {
    return 52;
  }
  if (scenarioId === "practice-timeout-review-notice") {
    return 59;
  }
  if (scenarioId === "practice-slow-unclear-notice") {
    return 41;
  }
  return null;
}

function createLivePuzzleClock(
  service: PracticeService,
  initialPuzzleElapsedSeconds: number
): () => number {
  let activePuzzleKey: string | null = null;
  let activePuzzleObservedAtMs = 0;

  return () => {
    const active = service.getActiveSprint();
    if (
      !active ||
      active.status !== "active" ||
      !active.currentPuzzle ||
      !active.currentPuzzleStartedAt
    ) {
      return LAB_NOW_MS;
    }
    const puzzleKey = `${active.id}:${active.currentPuzzleIndex}:${active.currentPuzzle.puzzle.id}`;
    if (puzzleKey !== activePuzzleKey) {
      activePuzzleKey = puzzleKey;
      activePuzzleObservedAtMs = Date.now();
    }
    const scenarioOffsetMs = active.currentPuzzleIndex === 0
      ? initialPuzzleElapsedSeconds * 1000
      : 0;
    return new Date(active.currentPuzzleStartedAt).getTime()
      + scenarioOffsetMs
      + Math.max(0, Date.now() - activePuzzleObservedAtMs);
  };
}

function isPuzzleEntryPreviewScenario(scenarioId: LabScenarioId): boolean {
  return scenarioId === "practice-blunder-move-preview"
    || scenarioId === "review-blunder-move-preview";
}

function createSeededService(): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles(LAB_PUZZLES);
  return new PracticeService(store);
}

function createSessionGuideService(): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles(Array.from({ length: 18 }, (_, index) => {
    const puzzle = LAB_PUZZLES[index % LAB_PUZZLES.length]!;
    return {
      ...puzzle,
      id: `session-guide-${index + 1}`
    };
  }));
  return new PracticeService(store);
}

function createRunManagementService(empty: boolean, dueReviewCount = 0): PracticeService {
  const store = new MemoryStore();
  const reviewPuzzles = Array.from({ length: dueReviewCount }, (_, index) => ({
    ...LAB_PUZZLES[index % LAB_PUZZLES.length]!,
    id: `home-review-${index + 1}`
  }));
  store.seedPuzzles([...LAB_PUZZLES, ...reviewPuzzles]);
  for (const puzzle of reviewPuzzles) {
    store.scheduleMistakeReview({
      puzzleId: puzzle.id,
      mode: "standard",
      ratingKey: "standard 5/20"
    }, "2026-07-17T12:00:00.000Z");
  }
  const service = new PracticeService(store);
  seedRunManagementCatalog(service, empty);
  return service;
}

function seedRunManagementCatalog(service: PracticeService, empty: boolean): void {
  service.setPracticeRunRating("standard", 925);
  service.setPracticeRunRating("arrow-duel", 875);
  service.createPracticeRun({
    id: "tactics-focus",
    name: "Tactics Focus",
    mode: "custom",
    durationSeconds: 600,
    perPuzzleSeconds: 30,
    initialRating: 1040,
    themes: ["fork", "pin"]
  }, "2026-07-18T17:00:00.000Z");
  service.createPracticeRun({
    id: "endgame-sprint",
    name: "Endgame Sprint",
    mode: "custom",
    durationSeconds: 180,
    perPuzzleSeconds: 10,
    initialRating: 810,
    themes: ["endgame"]
  }, "2026-07-18T17:01:00.000Z");
  if (empty) {
    for (const [index, run] of service.listPracticeRuns().entries()) {
      service.archivePracticeRun(run.id, new Date(LAB_NOW_MS + index).toISOString());
    }
  }
}

function createTacticalProfileLabService(): PracticeService {
  const store = new MemoryStore();
  const linePuzzles = tacticalProfileLabPuzzles("line", 925);
  const arrowDuelPuzzles = tacticalProfileLabPuzzles("arrow_duel", 875);
  store.seedPuzzles([...LAB_PUZZLES, ...linePuzzles, ...arrowDuelPuzzles]);
  seedTacticalProfileRating(store, "line", 925);
  seedTacticalProfileRating(store, "arrow_duel", 875);
  seedTacticalProfileHistory(store, "line", linePuzzles, 925);
  seedTacticalProfileHistory(store, "arrow_duel", arrowDuelPuzzles, 875);

  const service = new PracticeService(
    store,
    new TacticalProfileService({
      progressStore: store,
      puzzleSource: store,
      repository: new MemoryTacticalProfileRepository(),
      calibration: LAB_TACTICAL_PROFILE_CALIBRATION,
      naturalFrequency: {
        line: { fork: 0.12, sacrifice: 0.12 },
        arrow_duel: { pin: 0.12, deflection: 0.12 }
      },
      focusedRunPolicy: {
        runSize: 15,
        recentPuzzleDays: 30,
        ratingBandHalfWidths: [100, 200]
      }
    })
  );
  seedRunManagementCatalog(service, false);
  return service;
}

function tacticalProfileLabPuzzles(
  taskFamily: TacticalProfileTaskFamily,
  rating: number
): Puzzle[] {
  const prefix = taskFamily === "line" ? "line" : "arrow";
  const focusTheme = taskFamily === "line" ? "fork" : "pin";
  const mixedTheme = taskFamily === "line" ? "sacrifice" : "deflection";
  return Array.from({ length: 36 }, (_, index) => ({
    id: `tactical-profile-${prefix}-${index + 1}`,
    initialFen: tacticalProfileLabFen(index),
    solutionMoves: ["e8d7", "e2e4"],
    rating,
    ratingDeviation: 80,
    themes: [index < 24 ? focusTheme : mixedTheme],
    source: "synthetic",
    stockfishEval: 180,
    stockfishBestMove: "e8f7",
    stockfishEvalAfterFirstMove: -220
  }));
}

function tacticalProfileLabFen(index: number): string {
  const optionalPawnFiles = [0, 1, 2, 6, 7];
  const rank = Array.from({ length: 8 }, () => "");
  for (const [bit, file] of optionalPawnFiles.entries()) {
    if ((index % 32) & (1 << bit)) {
      rank[file] = "p";
    }
  }
  let compressedRank = "";
  let emptyCount = 0;
  for (const square of rank) {
    if (square === "") {
      emptyCount += 1;
      continue;
    }
    if (emptyCount > 0) {
      compressedRank += String(emptyCount);
      emptyCount = 0;
    }
    compressedRank += square;
  }
  if (emptyCount > 0) {
    compressedRank += String(emptyCount);
  }
  return `4k3/${compressedRank}/8/8/8/8/4P3/4K3 b - - 0 1`;
}

function seedTacticalProfileRating(
  store: MemoryStore,
  taskFamily: TacticalProfileTaskFamily,
  rating: number
): void {
  const config = defaultSprintConfig(taskFamily === "line" ? "standard" : "arrow_duel");
  store.saveRating({
    key: config.ratingKey,
    generation: 0,
    rating,
    ratingDeviation: 80,
    volatility: 0.06,
    games: 12
  });
}

function seedTacticalProfileHistory(
  store: MemoryStore,
  taskFamily: TacticalProfileTaskFamily,
  puzzles: readonly Puzzle[],
  rating: number
): void {
  const mode = taskFamily === "line" ? "standard" : "arrow_duel";
  const config = defaultSprintConfig(mode);
  for (let sessionIndex = 0; sessionIndex < 3; sessionIndex += 1) {
    const day = 1 + sessionIndex * 4;
    const startedAt = `2026-07-${String(day).padStart(2, "0")}T00:00:00.000Z`;
    const completedAt = `2026-07-${String(day).padStart(2, "0")}T00:04:00.000Z`;
    const sessionPuzzles = puzzles.slice(sessionIndex * 4, sessionIndex * 4 + 4);
    const session = startSprint({
      id: `tactical-profile-${taskFamily}-session-${sessionIndex}`,
      config,
      puzzles: [...sessionPuzzles],
      ratingBefore: rating,
      now: startedAt
    });
    store.createSprintSession({
      ...session,
      status: "failed",
      completedAt,
      endReason: "max_mistakes",
      correctCount: 0,
      mistakeCount: 4,
      ratingAfter: rating
    });
    for (const [offset, puzzle] of sessionPuzzles.entries()) {
      store.recordAttempt({
        id: `tactical-profile-${taskFamily}-attempt-${sessionIndex}-${offset}`,
        source: "sprint",
        sessionId: session.id,
        puzzleId: puzzle.id,
        mode,
        ratingKey: config.ratingKey,
        result: "wrong",
        submittedMove: taskFamily === "line" ? "e2e3" : puzzle.solutionMoves[0]!,
        expectedMove: taskFamily === "line"
          ? puzzle.solutionMoves[1]!
          : puzzle.stockfishBestMove!,
        ...(taskFamily === "line"
          ? {}
          : {
              arrowDuelCandidateOrder: [
                puzzle.stockfishBestMove!,
                puzzle.solutionMoves[0]!
              ]
            }),
        startedAt: completedAt,
        completedAt,
        elapsedMs: 10_000,
        ratingBefore: rating
      });
    }
  }
}

const LAB_TACTICAL_PROFILE_CALIBRATION = {
  schemaVersion: 1,
  modelVersion: "interaction-lab-tactical-profile-v1",
  calibrationId: "interaction-lab-tactical-profile",
  packFeatureHash: "interaction-lab-pack-rd",
  createdAt: "2026-07-01T00:00:00.000Z",
  provenance: {
    inputSchemaVersion: 1,
    policyId: "interaction-lab-policy",
    policyHash: `sha256:${"1".repeat(64)}`,
    corpusHash: `sha256:${"2".repeat(64)}`,
    reportHash: `sha256:${"3".repeat(64)}`,
    decisionEvidenceId: "interaction-lab-decisions",
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
    line: tacticalProfileCalibratedFamily(),
    arrow_duel: tacticalProfileCalibratedFamily()
  }
} as const satisfies TacticalProfileCalibrationArtifact;

function tacticalProfileCalibratedFamily() {
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

function createIssue272Service(withDueReview: boolean): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles([ISSUE_272_LAB_PUZZLE]);
  if (withDueReview) {
    store.scheduleMistakeReview({
      puzzleId: ISSUE_272_LAB_PUZZLE.id,
      mode: "standard",
      ratingKey: "standard 5/20"
    }, "2026-07-17T12:00:00.000Z");
  }
  return new PracticeService(store);
}

function createReviewService(kind: "due" | "overdue"): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles(LAB_PUZZLES);
  const service = new PracticeService(store);
  const arrowDuelRun = service.getActivePracticeRun("arrow-duel");
  const enrolledAt = kind === "overdue"
    ? "2026-07-13T12:00:00.000Z"
    : "2026-07-17T12:00:00.000Z";
  const retryEnrollmentAt = "2026-07-13T12:00:00.000Z";
  for (const [index, puzzle] of LAB_PUZZLES.slice(0, 3).entries()) {
    store.scheduleMistakeReview({
      puzzleId: puzzle.id,
      mode: index === 2 ? "arrow_duel" : "standard",
      ratingKey: index === 2 ? arrowDuelRun.ratingKey : `standard 5/${20 + index * 10}`
    }, kind === "due" && index === 2 ? retryEnrollmentAt : enrolledAt);
  }
  service.updatePracticeRun(arrowDuelRun.id, {
    name: arrowDuelRun.name,
    rating: service.getRating(arrowDuelRun.ratingKey).rating,
    opponentReply: { enabled: true, seconds: 12 }
  }, enrolledAt);

  if (kind === "due") {
    const completedPuzzle = LAB_PUZZLES[1]!;
    recordLabReviewAttempt(
      service,
      completedPuzzle,
      "standard",
      "standard 5/30",
      "2026-07-18T15:00:08.000Z"
    );

    const retryPuzzle = LAB_PUZZLES[2]!;
    for (const completedAt of ["2026-07-14T15:00:08.000Z", "2026-07-15T15:00:08.000Z"]) {
      recordLabReviewAttempt(
        service,
        retryPuzzle,
        "arrow_duel",
        arrowDuelRun.ratingKey,
        completedAt
      );
    }
  }
  return service;
}

function recordLabReviewAttempt(
  service: PracticeService,
  puzzle: Puzzle,
  mode: SprintMode,
  ratingKey: string,
  completedAt: string
): void {
  const expectedMove = puzzle.solutionMoves[0]!;
  service.recordReviewAttempt({
    puzzleId: puzzle.id,
    mode,
    ratingKey,
    result: "correct",
    submittedMove: expectedMove,
    expectedMove,
    startedAt: new Date(new Date(completedAt).getTime() - 8_000).toISOString(),
    ...(mode === "arrow_duel"
      ? { arrowDuelCandidateOrder: [expectedMove, puzzle.stockfishBestMove ?? expectedMove] }
      : {})
  }, completedAt);
}

function createArrowDuelReplayService(): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles([ARROW_DUEL_REPLAY_LAB_PUZZLE]);
  store.recordAttempt({
    id: "history-arrow-duel-replay",
    source: "sprint",
    sessionId: "history-arrow-duel-replay-session",
    puzzleId: ARROW_DUEL_REPLAY_LAB_PUZZLE.id,
    mode: "arrow_duel",
    ratingKey: "arrow_duel 5/30",
    result: "wrong",
    submittedMove: ARROW_DUEL_REPLAY_LAB_PUZZLE.solutionMoves[0]!,
    expectedMove: ARROW_DUEL_REPLAY_LAB_PUZZLE.stockfishBestMove!,
    startedAt: "2026-07-18T17:58:00.000Z",
    completedAt: "2026-07-18T17:58:08.000Z",
    ratingBefore: 880,
    ratingAfter: 860,
    arrowDuelCandidateOrder: [
      ARROW_DUEL_REPLAY_LAB_PUZZLE.solutionMoves[0]!,
      ARROW_DUEL_REPLAY_LAB_PUZZLE.stockfishBestMove!
    ]
  });
  return new PracticeService(store);
}

function createSprintResultReplayService(): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles(LAB_PUZZLES);
  for (const { puzzle } of sprintResultReplayDesignItems().filter((item) => item.inReview)) {
    store.scheduleMistakeReview({
      puzzleId: puzzle.id,
      mode: "standard",
      ratingKey: "standard 5/20"
    }, "2026-07-18T18:00:00.000Z");
  }
  return new PracticeService(store);
}

function createHistoryService(
  replayUnavailableOnly: boolean,
  puzzles = LAB_PUZZLES
): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles([...puzzles, HISTORY_INCOMPLETE_LAB_PUZZLE]);
  if (replayUnavailableOnly) {
    store.recordAttempt({
      id: "history-arrow-legacy",
      source: "sprint",
      sessionId: "history-arrow-session",
      puzzleId: PRIMARY_LAB_PUZZLE.id,
      mode: "arrow_duel",
      ratingKey: "arrow duel 5/30",
      result: "wrong",
      submittedMove: PRIMARY_LAB_PUZZLE.solutionMoves[0]!,
      expectedMove: PRIMARY_LAB_PUZZLE.stockfishBestMove!,
      startedAt: "2026-07-17T16:00:00.000Z",
      completedAt: "2026-07-17T16:00:08.000Z",
      ratingBefore: 880,
      ratingAfter: 860,
      arrowDuelCandidateOrderStatus: "corrupt"
    } as unknown as AttemptEvent);
    return new PracticeService(store);
  }

  const attempts: AttemptEvent[] = [
    historyAttempt({
      id: "history-unclear",
      puzzleId: LAB_PUZZLES[0]!.id,
      result: "correct",
      completedAt: "2026-07-18T15:00:08.000Z",
      ratingBefore: 910,
      ratingAfter: 928,
      unclear: true
    }),
    historyAttempt({
      id: "history-wrong",
      puzzleId: LAB_PUZZLES[1]!.id,
      result: "wrong",
      completedAt: "2026-07-17T14:00:11.000Z",
      ratingBefore: 930,
      ratingAfter: 910
    }),
    historyAttempt({
      id: "history-timeout",
      puzzleId: LAB_PUZZLES[4]!.id,
      result: "timed_out",
      timingStatus: "timed_out",
      elapsedMs: 60_000,
      completedAt: "2026-07-17T15:00:12.000Z",
      ratingBefore: 910,
      ratingAfter: 910
    }),
    historyAttempt({
      id: "history-incomplete-fast",
      puzzleId: HISTORY_INCOMPLETE_LAB_PUZZLE.id,
      result: "incomplete",
      elapsedMs: 12_000,
      completedAt: "2026-07-17T15:10:12.000Z",
      ratingBefore: 910,
      ratingAfter: 910
    }),
    historyAttempt({
      id: "history-incomplete-slow",
      puzzleId: LAB_PUZZLES[3]!.id,
      result: "incomplete",
      timingStatus: "slow",
      elapsedMs: 45_000,
      completedAt: "2026-07-17T14:30:12.000Z",
      ratingBefore: 910,
      ratingAfter: 910,
      unclear: true
    }),
    historyAttempt({
      id: "history-correct",
      puzzleId: LAB_PUZZLES[2]!.id,
      result: "correct",
      timingStatus: "slow",
      elapsedMs: 41_000,
      completedAt: "2026-07-16T13:00:07.000Z",
      ratingBefore: 900,
      ratingAfter: 930,
      unclear: true
    }),
    historyAttempt({
      id: "history-clean",
      puzzleId: LAB_PUZZLES[3]!.id,
      result: "correct",
      completedAt: "2026-07-15T12:00:06.000Z",
      ratingBefore: 884,
      ratingAfter: 900
    })
  ];
  for (const attempt of attempts) {
    store.recordAttempt(attempt);
  }
  store.createSprintSession(completedSprint({
    id: "session-history-correct",
    mode: "standard",
    completedAt: "2026-07-16T13:00:07.000Z",
    ratingBefore: 900,
    ratingAfter: 930
  }));
  store.createSprintSession(completedSprint({
    id: "session-history-wrong",
    mode: "standard",
    completedAt: "2026-07-17T14:00:11.000Z",
    ratingBefore: 930,
    ratingAfter: 910
  }));
  store.createSprintSession(completedSprint({
    id: "session-history-timeout",
    mode: "standard",
    completedAt: "2026-07-17T15:00:12.000Z",
    ratingBefore: 910,
    ratingAfter: 910
  }));
  store.createSprintSession({
    ...completedSprint({
      id: "session-history-incomplete-fast",
      mode: "standard",
      completedAt: "2026-07-17T15:10:12.000Z",
      ratingBefore: 910,
      ratingAfter: 910
    }),
    status: "failed",
    endReason: "time_expired",
    correctCount: 0
  });
  store.createSprintSession({
    ...completedSprint({
      id: "session-history-incomplete-slow",
      mode: "standard",
      completedAt: "2026-07-17T14:30:12.000Z",
      ratingBefore: 910,
      ratingAfter: 910
    }),
    status: "failed",
    endReason: "time_expired",
    correctCount: 0
  });
  store.createSprintSession(completedSprint({
    id: "session-history-unclear",
    mode: "standard",
    completedAt: "2026-07-18T15:00:08.000Z",
    ratingBefore: 910,
    ratingAfter: 928
  }));
  store.createSprintSession(completedSprint({
    id: "session-history-clean",
    mode: "standard",
    completedAt: "2026-07-15T12:00:06.000Z",
    ratingBefore: 884,
    ratingAfter: 900
  }));
  store.saveRating({
    key: "standard 5/20",
    generation: 0,
    rating: 928,
    ratingDeviation: 160,
    volatility: 0.05,
    games: 5
  });
  store.scheduleMistakeReview({
    puzzleId: LAB_PUZZLES[1]!.id,
    mode: "standard",
    ratingKey: "standard 5/20"
  }, "2026-07-17T14:00:11.000Z");
  store.scheduleMistakeReview({
    puzzleId: LAB_PUZZLES[4]!.id,
    mode: "standard",
    ratingKey: "standard 5/20"
  }, "2026-07-17T15:00:12.000Z");
  return new PracticeService(store);
}

function historyAttempt({
  completedAt,
  id,
  puzzleId,
  ratingAfter,
  ratingBefore,
  result,
  elapsedMs = 8_000,
  timingStatus,
  unclear = false
}: {
  completedAt: string;
  id: string;
  puzzleId: string;
  ratingAfter: number;
  ratingBefore: number;
  result: AttemptEvent["result"];
  elapsedMs?: number;
  timingStatus?: AttemptEvent["timingStatus"];
  unclear?: boolean;
}): AttemptEvent {
  return {
    id,
    source: "sprint",
    sessionId: `session-${id}`,
    puzzleId,
    mode: "standard",
    ratingKey: "standard 5/20",
    result,
    ...(result === "timed_out" || result === "incomplete"
      ? {}
      : { submittedMove: result === "correct" ? "e2e4" : "e2e3" }),
    expectedMove: "e2e4",
    startedAt: new Date(new Date(completedAt).getTime() - elapsedMs).toISOString(),
    completedAt,
    elapsedMs,
    ...(timingStatus === undefined ? {} : { timingStatus }),
    ratingBefore,
    ratingAfter,
    ...(unclear ? { unclear: true, unclearUpdatedAt: completedAt } : {})
  };
}

function completedSprint({
  completedAt,
  id,
  mode,
  ratingAfter,
  ratingBefore
}: {
  completedAt: string;
  id: string;
  mode: SprintMode;
  ratingAfter: number;
  ratingBefore: number;
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

class LabNotificationClient implements ReviewReminderNotificationClient {
  private readonly listeners = new Set<(route: ReviewReminderNotificationRoute) => void>();

  constructor(private status: ReviewReminderPermissionStatus) {}

  async getAuthorizationStatus(): Promise<ReviewReminderPermissionStatus> {
    return this.status;
  }

  async requestAuthorization(): Promise<ReviewReminderPermissionStatus> {
    this.status = "authorized";
    return this.status;
  }

  async openSystemSettings(): Promise<void> {}

  async consumeInitialRoute(): Promise<ReviewReminderNotificationRoute | undefined> {
    return undefined;
  }

  addNotificationResponseListener(
    listener: (route: ReviewReminderNotificationRoute) => void
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
