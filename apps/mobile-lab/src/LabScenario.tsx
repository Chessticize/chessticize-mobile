import React, { useEffect, useMemo, useState } from "react";
import type { AttemptEvent, SprintMode, SprintState } from "../../../packages/core/src/index.ts";
import { defaultSprintConfig } from "../../../packages/core/src/index.ts";
import { MemoryStore } from "../../../packages/storage/src/memory-store.ts";
import { PracticeService } from "../../../packages/storage/src/practice-service.ts";
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

export const LAB_NOW_MS = new Date("2026-07-18T18:00:00.000Z").getTime();

type ScreenProps = Omit<React.ComponentProps<typeof PracticePocScreen>, "platformCapabilities">;

type ScenarioRuntime = {
  platformCapabilities: MobilePlatformCapabilities;
  screenProps: ScreenProps;
  service: PracticeService;
};

export function LabScenario({ scenarioId }: { scenarioId: LabScenarioId }): React.JSX.Element {
  const runtime = useMemo(() => createScenarioRuntime(scenarioId), [scenarioId]);

  return <LabScenarioContent key={scenarioId} runtime={runtime} scenarioId={scenarioId} />;
}

function LabScenarioContent({
  runtime,
  scenarioId
}: {
  runtime: ScenarioRuntime;
  scenarioId: LabScenarioId;
}): React.JSX.Element {
  const [selectedCustomThemes, setSelectedCustomThemes] = useState<string[]>([]);
  const [tacticalProfileState, setTacticalProfileState] = useState(() =>
    isTacticalProfileScenario(scenarioId)
      ? initialTacticalProfileFixtureState(scenarioId)
      : { screen: "home" as const, selectedTaskFamily: "line" as const }
  );
  const showsThemeCatalogPrototype = isRunManagementScenario(scenarioId) || [
    "history-populated",
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
    if (isTacticalProfileScenario(scenarioId)) {
      setTacticalProfileState(initialTacticalProfileFixtureState(scenarioId));
    }
  }, [scenarioId]);

  const tacticalProfilePresentation = isTacticalProfileScenario(scenarioId)
    ? tacticalProfilePresentationFor(
        scenarioId,
        tacticalProfileState,
        (intent) => setTacticalProfileState((current) =>
          reduceTacticalProfileFixtureState(current, intent)
        )
      )
    : undefined;

  return (
    <LabScenarioShell scenarioId={scenarioId}>
      <PracticePocScreen
        customThemeSelection={{
          selectedThemes: selectedCustomThemes,
          onChange: setSelectedCustomThemes
        }}
        platformCapabilities={runtime.platformCapabilities}
        themeCatalogPresentation={showsThemeCatalogPrototype
          ? SERVER_CURATED_THEME_PRESENTATION
          : undefined}
        runEloEditingMovedToHome
        tacticalProfilePresentation={tacticalProfilePresentation}
        {...runtime.screenProps}
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
    || scenarioId === "practice-custom-rating-editor"
  ) {
    return {
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
      maxMistakes: 3,
      mode: "standard" as const,
      targetCorrect: 15
    };
    const arrowDuelGuide = {
      ...sharedGuide,
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
        maxAttempts: 15,
        maxMistakes: 15,
        mode: "standard",
        targetCorrect: 15
      }],
      timeoutCountsAsMistake: true
    };
  }
  if (
    scenarioId === "practice-timing-timeout"
    || scenarioId === "practice-timeout-review-notice"
  ) {
    return { timeoutCountsAsMistake: true };
  }
  if (scenarioId === "practice-sprint-result-goal") {
    return {
      initialResultState: sprintRulesResultState({
        correctCount: 11,
        endReason: "time_expired",
        mistakeCount: 1,
        ratingAfter: 1070,
        status: "failed"
      }),
      resultUnclearSummary: {
        slowMarkedCount: 1,
        userMarkedCount: 1
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

function tacticalFocusActiveState(): SprintState {
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
  const currentPuzzle = {
    autoPlayedMoves: [activePuzzle.solutionMoves[0]!],
    currentFen: "8/3k4/8/8/8/8/4P3/4K3 w - - 1 2",
    cursor: 1,
    kind: "line" as const,
    playedMoves: [],
    puzzle: activePuzzle,
    solved: false
  };
  return {
    bestStreak: 4,
    config: {
      ...defaultSprintConfig("standard"),
      maxAttempts: 15,
      maxMistakes: 15,
      ratingPolicy: "unrated",
      tacticalFocus: {
        taskFamily: "line",
        themes: ["fork"],
        mixedControlCount: 5,
        ratingAnchor: 1087,
        minRating: 987,
        maxRating: 1187
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
    ratingBefore: 1087,
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

export function LabScenarioShell({
  children,
  scenarioId
}: {
  children: React.ReactNode;
  scenarioId: LabScenarioId;
}): React.JSX.Element {
  const definition = scenarioRegistry[scenarioId];

  return (
    <div className="lab-scenario-shell">
      <aside className="lab-toolbar" aria-label="Interaction Lab scenario controls">
        <details>
          <summary>{definition.group} · {definition.title}</summary>
          <div className="lab-toolbar-body">
            <p>{definition.description}</p>
            <p><strong>Scenario Scope:</strong> {definition.scope.includes.join(" · ")}</p>
            <p><strong>Boundary exits:</strong> {definition.scope.exits.join(" · ")}</p>
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
              <a href={`./iframe.html?id=${definition.storyId}&viewMode=story`}>Full-screen URL</a>
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

function createScenarioRuntime(scenarioId: LabScenarioId): ScenarioRuntime {
  let service = createSeededService();
  let configurePuzzleSource = true;
  let notificationStatus: ReviewReminderPermissionStatus = "authorized";
  let reminderPlatform: MobilePlatformCapabilities["reminders"]["platform"] = "ios";
  let progressProtection: MobilePlatformCapabilities["progressProtection"] = { kind: "icloud_sync" };
  const screenProps: ScreenProps = {
    currentTimeMs: () => LAB_NOW_MS,
    moveFeedbackSettings: {},
    puzzleSelectionSeed: "interaction-lab",
    sprintRulesDesignPreview: sprintRulesDesignPreviewFor(scenarioId),
    standardTargetCorrect: 1,
    arrowDuelTargetCorrect: 1,
    customTargetCorrect: 1
  };
  if (isRunManagementScenario(scenarioId)) {
    service = createRunManagementService(
      scenarioId === "practice-runs-empty",
      scenarioId === "practice-home" ? 28 : 0
    );
    screenProps.runManagementEnabled = true;
  }

  switch (scenarioId) {
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
    case "history-attempt-detail":
      service = createHistoryService(false, THEME_CATALOG_LAB_PUZZLES);
      configurePuzzleSource = false;
      break;
    case "history-replay-unavailable":
      service = createHistoryService(true);
      break;
    case "settings-android-backup":
      reminderPlatform = "android";
      progressProtection = { kind: "android_managed_backup" };
      break;
    case "settings-ios-sync":
      notificationStatus = "not_determined";
      screenProps.moveFeedbackSettings = {
        preview: previewBrowserMoveFeedback
      };
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
      : null
  };
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
  return service;
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
  const enrolledAt = kind === "overdue"
    ? "2026-07-13T12:00:00.000Z"
    : "2026-07-17T12:00:00.000Z";
  for (const [index, puzzle] of LAB_PUZZLES.slice(0, 3).entries()) {
    store.scheduleMistakeReview({
      puzzleId: puzzle.id,
      mode: index === 2 ? "arrow_duel" : "standard",
      ratingKey: index === 2 ? "arrow duel 5/30" : `standard 5/${20 + index * 10}`
    }, enrolledAt);
  }
  return new PracticeService(store);
}

function createHistoryService(
  replayUnavailableOnly: boolean,
  puzzles = LAB_PUZZLES
): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles(puzzles);
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
      ratingAfter: 860
    });
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
    ...(result === "timed_out"
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
