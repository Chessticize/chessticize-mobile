import React, { useEffect, useMemo, useReducer, useState } from "react";
import type { AttemptEvent, SprintMode, SprintState } from "../../../packages/core/src/index.ts";
import { defaultSprintConfig } from "../../../packages/core/src/index.ts";
import { MemoryStore } from "../../../packages/storage/src/memory-store.ts";
import { PracticeService } from "../../../packages/storage/src/practice-service.ts";
import { PracticePocScreen } from "../../mobile/src/components/PracticePocScreen.tsx";
import type { MobilePlatformCapabilities } from "../../mobile/src/backend/mobilePlatformCapabilities.ts";
import type {
  ReviewReminderNotificationClient,
  ReviewReminderNotificationRoute,
  ReviewReminderPermissionStatus
} from "../../mobile/src/backend/reviewReminderScheduler.ts";
import {
  createTestMobilePlatformCapabilities,
  type TestMobilePlatformCapabilityOverrides
} from "../../mobile/src/testing/testMobilePlatformCapabilities.ts";
import {
  configureMobilePracticePuzzleSource,
  type MobilePuzzleSource
} from "./browserMobilePractice.ts";
import { clearLabPracticeService, setLabPracticeService } from "./boardController.ts";
import { LAB_PUZZLES, PRIMARY_LAB_PUZZLE } from "./labPuzzles.ts";
import {
  createRunManagementFixtureState,
  runManagementFixtureReducer
} from "./runManagementFixture.ts";
import { scenarioRegistry, type LabScenarioId } from "./scenarioRegistry.ts";
import {
  SERVER_CURATED_THEME_PRESENTATION,
  THEME_CATALOG_LAB_PUZZLES
} from "./themeCatalogPrototype.ts";

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
  const showsThemeCatalogPrototype = isRunManagementScenario(scenarioId) || [
    "history-populated",
    "history-filters",
    "history-attempt-detail"
  ].includes(scenarioId);
  const [runManagementState, dispatchRunManagement] = useReducer(
    runManagementFixtureReducer,
    scenarioId === "practice-runs-empty" ? "empty" : "populated",
    createRunManagementFixtureState
  );
  const runManagementPresentation = isRunManagementScenario(scenarioId)
    ? { ...runManagementState, onIntent: dispatchRunManagement }
    : undefined;

  setLabPracticeService(runtime.service);
  useEffect(() => () => clearLabPracticeService(runtime.service), [runtime.service]);
  useEffect(() => setSelectedCustomThemes([]), [scenarioId]);

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
        runManagementPresentation={runManagementPresentation}
        {...runtime.screenProps}
      />
    </LabScenarioShell>
  );
}

function isRunManagementScenario(scenarioId: LabScenarioId): boolean {
  return [
    "practice-home",
    "practice-home-edit",
    "practice-custom-setup",
    "practice-run-name-validation",
    "practice-run-standard-editor",
    "practice-custom-rating-editor",
    "practice-run-remove-confirmation",
    "practice-runs-empty"
  ].includes(scenarioId);
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
    puzzleSelectionSeed: "interaction-lab",
    standardTargetCorrect: 1,
    arrowDuelTargetCorrect: 1,
    customTargetCorrect: 1
  };

  switch (scenarioId) {
    case "practice-custom-rating-editor":
      service = createPlayedCustomService();
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
    case "settings-notifications-denied":
      notificationStatus = "denied";
      break;
    case "system-error":
      service = new PracticeService(new MemoryStore());
      configurePuzzleSource = false;
      break;
    default:
      break;
  }

  const notificationClient = new LabNotificationClient(notificationStatus);
  const capabilityOverrides: TestMobilePlatformCapabilityOverrides = {
    practiceService: service,
    reviewReminderNotificationClient: notificationClient,
    reminderPlatform,
    progressProtection
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

function createSeededService(): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles(LAB_PUZZLES);
  return new PracticeService(store);
}

function createPlayedCustomService(): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles(LAB_PUZZLES);
  store.saveRating({
    key: "custom 5/20",
    generation: 0,
    rating: 940,
    ratingDeviation: 180,
    volatility: 0.05,
    games: 1
  });
  store.createSprintSession(completedSprint({
    id: "lab-custom-played",
    mode: "custom",
    completedAt: "2026-07-17T16:00:00.000Z",
    ratingBefore: 900,
    ratingAfter: 940
  }));
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
      id: "history-correct",
      puzzleId: LAB_PUZZLES[2]!.id,
      result: "correct",
      completedAt: "2026-07-16T13:00:07.000Z",
      ratingBefore: 900,
      ratingAfter: 930
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
    id: "session-history-unclear",
    mode: "standard",
    completedAt: "2026-07-18T15:00:08.000Z",
    ratingBefore: 910,
    ratingAfter: 928
  }));
  store.saveRating({
    key: "standard 5/20",
    generation: 0,
    rating: 928,
    ratingDeviation: 160,
    volatility: 0.05,
    games: 3
  });
  store.scheduleMistakeReview({
    puzzleId: LAB_PUZZLES[1]!.id,
    mode: "standard",
    ratingKey: "standard 5/20"
  }, "2026-07-17T14:00:11.000Z");
  return new PracticeService(store);
}

function historyAttempt({
  completedAt,
  id,
  puzzleId,
  ratingAfter,
  ratingBefore,
  result,
  unclear = false
}: {
  completedAt: string;
  id: string;
  puzzleId: string;
  ratingAfter: number;
  ratingBefore: number;
  result: AttemptEvent["result"];
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
    submittedMove: result === "correct" ? "e2e4" : "e2e3",
    expectedMove: "e2e4",
    startedAt: new Date(new Date(completedAt).getTime() - 8_000).toISOString(),
    completedAt,
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
