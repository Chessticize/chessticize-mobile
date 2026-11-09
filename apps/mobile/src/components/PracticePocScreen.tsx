import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from "react-native";
import type { MoveResult } from "react-native-chessboard";
import Chessboard, { type ChessboardRef } from "react-native-chessboard";
import {
  GestureHandlerRootView,
  LegacyScrollView,
  type GestureType
} from "react-native-gesture-handler";
import {
  canPresentWhatsNew,
  arrowDuelReplyCuePresentationFor,
  buildSprintConfig,
  collectHistoryRatingKeys,
  DEFAULT_OPPONENT_REPLY_SECONDS,
  defaultSprintConfig,
  historyAttemptReplayAvailability,
  selectMistakeReplayItems,
  isUnclearAttemptEligible,
  isReviewOverdue,
  markSprintGuideSeen,
  markSprintSessionGuidePlanSeen,
  OPPONENT_REPLY_MAX_SECONDS,
  OPPONENT_REPLY_MIN_SECONDS,
  pauseSprint as pauseSprintState,
  RATING_FLOOR,
  resetSprintGuideProgress,
  resolvePuzzleTimingPolicy,
  resumeSprint as resumeSprintState,
  SERVER_CURATED_THEME_PRESENTATION,
  sprintHasRunDeadline,
  sprintSessionGuidePlanFor
} from "../../../../packages/core/src/index.ts";
import type {
  AttemptEvent,
  ArrowDuelState,
  CurrentPuzzleState,
  PuzzleFeedback,
  PracticeRunRecord,
  ReviewQueueItem,
  ReviewQueueState,
  SessionReplayItem,
  SprintConfig,
  SprintGuideKey,
  SprintMode,
  SprintResultSummary,
  SprintSessionGuidePlan,
  SprintSessionGuideStep,
  TacticalProfileTaskFamily,
  SprintState
} from "../../../../packages/core/src/index.ts";
import {
  ActiveSprintConflictError,
  FocusedRunUnavailableError,
  type PracticeService
} from "../../../../packages/storage/src/practice-service.ts";
import type {
  ReviewQueueDuePromotionResult
} from "../../../../packages/storage/src/practice-store.ts";
import type { SimulatedHistoryScenarioId } from "../../../../packages/storage/src/simulation/scenarios.ts";
import {
  getBundledCorePackManifest,
  seededPuzzleCount,
  shouldRandomizePuzzleSelection,
  type MobilePuzzleSource
} from "../platform/mobilePractice.ts";
import type {
  MobilePlatformCapabilities
} from "../platform/mobilePlatformCapabilities.ts";
import { arePracticeTestControlsEnabled, isPracticeDebugEnabled } from "../releaseConfig.ts";
import { isStoreAssetCaptureEnabled } from "../platform/testLaunchConfig.ts";
import { usePracticeRunManagement } from "./usePracticeRunManagement.ts";
import {
  useThemeChoiceSelection
} from "./useThemeChoiceSelection.ts";
import type {
  ArrowDuelReplyChallengeDesignPreview,
  ArrowDuelReplyChallengePhase,
  ArrowDuelReplyChallengePreviewTransition
} from "./arrowDuelReplyChallengePreview.ts";
import type { ReviewEntry } from "../backend/reviewEntry.ts";
import {
  decidePremoveQueue,
  fenAfterMove,
  planPremoveReplay,
  type BoardInputLockMode
} from "../backend/premove.ts";
import {
  mobileBackDestination,
  resolveMobileBackIntent,
  type MobileBackDestination,
  type MobileBackDetail,
  type MobileBackIntent,
  type MobileBackPrimaryTab,
  type MobileBackState,
  type MobileBackTab,
  type MobileBackTransient
} from "../navigation/mobileBackContract.ts";
import type {
  MobileSystemBackEdge,
  MobileSystemBackSource
} from "../navigation/mobileSystemBack.ts";
import type {
  MoveFeedbackPreviewer
} from "./MoveFeedbackSettingsSection.tsx";
import {
  emitCommittedMoveFeedback,
  emitRunReorderPickupFeedback,
  moveFeedbackCueForMove,
  type MoveFeedbackActor
} from "../platform/moveFeedback.ts";
import { createUiHaptics, UiHapticsProvider } from "../platform/uiHaptics.ts";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Move, PieceSymbol, Square } from "chess.js";
import type {
  PracticeRunManagementPresentation
} from "./practiceRunPresentation.ts";
import {
  buildPracticeAdaptiveLayout,
  PRACTICE_UI_PADDING as UI_PADDING,
  type AdaptiveLayout
} from "./adaptivePracticeLayout.ts";
import { usePracticeViewport } from "./PracticeViewport.tsx";
import {
  NativeTabHost,
  TabContentInsetsReporter,
  type TabContentInsets
} from "../navigation/NativeTabHost.tsx";
import {
  isTopLevelChromeVisible,
  topLevelTabIntent,
  type TopLevelTab
} from "../navigation/topLevelNavigation.ts";
import { SessionGuideOverlay } from "./SessionGuideOverlay.tsx";
import { WhatsNewSheet } from "./WhatsNewSheet.tsx";
import { useWhatsNew } from "../whatsNew/useWhatsNew.ts";
import {
  sessionGuideContainerTestID,
  sessionGuideStartLabel,
  sessionGuideStepCopy
} from "./sessionGuideSteps.ts";
import {
  boardMoveToUci,
  consumeSuppressedBoardMove
} from "./boardMoveSuppression.ts";
import { usePuzzleEntryPreview } from "./usePuzzleEntryPreview.ts";
import { puzzleEntryPreviewPlan } from "./puzzleEntryPreview.ts";
import {
  TacticalProfileFlow
} from "./TacticalProfileSection.tsx";
import type { TacticalProfilePresentation } from "./tacticalProfilePresentation.ts";
import { useTacticalProfilePresentation } from "./useTacticalProfilePresentation.ts";
import type {
  ICloudSyncErrorDetailsPresentation,
  ICloudSyncSupportBundlePresentation
} from "./ICloudSyncErrorDetails.tsx";
import {
  HistoryProgressScreen
} from "./HistoryProgressSection.tsx";
import type {
  HistoryProgressPresentation
} from "./historyProgressPresentation.ts";
import {
  useHistoryProgressPresentation
} from "./useHistoryProgressPresentation.ts";
import {
  PersonalBestChallengeHub,
  PersonalBestGuide,
  PersonalBestProgressBanner,
  type PersonalBestChallengeDesignPreview,
  type PersonalBestChallengeSelection,
  type PersonalBestPausedRunPresentation
} from "./PersonalBestChallengeDesign.tsx";
import { SprintResultScreen } from "./SprintResultScreen.tsx";
import { sprintResultDataFromSession } from "./sprintResultPresentation.ts";
import { SurvivalResultScreen } from "./SurvivalResultScreen.tsx";
import { survivalResultDataFromSession } from "./survivalResultPresentation.ts";
import {
  buildSurvivalChallengePresentation,
  survivalSelectionLevel
} from "./survivalChallengePresentation.tsx";

export type {
  PracticeRunDraft,
  PracticeRunKind,
  PracticeRunManagementIntent,
  PracticeRunManagementPresentation,
  PracticeRunPresentation
} from "./practiceRunPresentation.ts";
export type {
  FocusedRunPreview,
  TacticalProfileIntent,
  TacticalProfilePresentation,
  TacticalProfileSignal
} from "./tacticalProfilePresentation.ts";
export type {
  HistoryProgressPoint,
  HistoryProgressPresentation,
  HistoryProgressWeakness,
  HistoryWeaknessEffect,
  HistoryStrengthSeries
} from "./historyProgressPresentation.ts";
export type {
  CustomThemeSelection,
  ThemeCatalogGroup,
  ThemeCatalogPresentation
} from "./practice/shared/themeCatalog.ts";
export type {
  RunReorderPickupFeedback,
  SprintRulesGuidePresentation
} from "./practice/home/PracticeHome.tsx";
import { makeStyles, useTheme, type Theme } from "../theme/index.ts";
import { LARGE_TITLE_MAX_FONT_SCALE } from "../theme/scales.ts";
import { CHESS_PIECE_SPRITE } from "./practice/shared/chessPieceSprite.ts";
import {
  CUSTOM_INITIAL_RATING_MIN,
  errorMessage,
  FABRIC_SAFE_HIDDEN_TEXT_STYLE,
  formatDuration,
  formatSprintDurationLabel,
  modeLabel,
  replyPreparationInstruction,
  type SessionFeedback,
  sleep
} from "./practice/shared/practiceUtils.ts";
import {
  ReviewReminderPermissionPrompt,
  scheduledReviewAttemptCount,
  SettingsPanel,
  StockfishDiagnosticsPanel
} from "./practice/settings/SettingsPanel.tsx";
import { useSettingsController } from "./practice/settings/useSettingsController.tsx";
import type {
  CustomThemeSelection,
  ThemeCatalogPresentation
} from "./practice/shared/themeCatalog.ts";
import {
  HistoryPanel
} from "./practice/history/HistoryPanel.tsx";
import { emptyHistoryPerformance } from "./practice/history/HistoryRatingChart.tsx";
import { useHistoryController } from "./practice/history/useHistoryController.ts";
import { CustomSprintSetup } from "./practice/customSetup/CustomSprintSetup.tsx";
import { PracticeRunEditor } from "./practice/runEditor/PracticeRunEditor.tsx";
import {
  type NativeRunReorderMeasureElement,
  type NativeRunReorderScrollController,
  type NativeRunReorderScrollSnapshot,
  PausedSessionPanel,
  PracticeHome,
  type PracticeModeSummary,
  type RunReorderDesignPreview,
  type RunReorderPickupFeedback,
  type SprintRulesGuidePresentation,
  StartConflictPrompt
} from "./practice/home/PracticeHome.tsx";
import { SIMULATED_HISTORY_SCENARIOS, TestPuzzleSourceControl } from "./practice/home/TestPuzzleSourceControl.tsx";
import {
  moveSideDisplayName,
  oppositeMoveSide,
  sideToMove,
  sideToMoveAccessibilityLabel
} from "./practice/shared/moveSide.ts";
import {
  arrowFromTo,
  type BoardMove,
  formatUci,
  isArrowDuelCandidate,
  moveResultMatchesExpectedFen
} from "./practice/shared/boardMove.ts";
import {
  ArrowCandidateOverlay,
  ArrowDuelWhatIfOverlay,
  BoardCoordinateOverlay,
  BoardInputBlocker,
  boardMoveSquareTints,
  kingGlyphSizeForBoard,
  LastMoveOverlay,
  MoveFeedbackOverlay,
  moveFeedbackTint,
  sessionBoardAccessibilityLabel,
  useBoardMoveSquareTints
} from "./practice/session/boardOverlays.tsx";
import {
  PuzzleTimingIndicator,
  SessionScoreStrip,
  SessionStatusBar,
  type SessionTimingState
} from "./practice/session/SessionStatusBar.tsx";
import {
  ArrowDuelReplyChallengePrompt,
  ErrorPanel,
  PracticePrompt,
  PreviousAttemptNotice,
  type PreviousAttemptNoticeReason,
  UnclearAttemptPrompt
} from "./practice/session/PracticePrompt.tsx";
import {
  ARROW_DUEL_CORRECT_CHOICE_FEEDBACK_MS,
  ARROW_DUEL_REPLY_PREPARATION_MS,
  ARROW_DUEL_UNDO_ANIMATION_MS,
  BOARD_MOVE_ANIMATION_MS,
  FEEDBACK_SNAPSHOT_MS,
  USER_FEEDBACK_BEFORE_AUTO_MS
} from "./practice/shared/sessionTiming.ts";
import { chessboardColorsFor } from "./practice/shared/chessboardColors.ts";
import {
  buildServiceReviewEntry,
  HistoryAttemptReplayUnavailable,
  type HistoryUnavailableAttempt,
  type ReviewBackCommand,
  ReviewSession,
  withAttemptClarity
} from "./practice/review/ReviewSession.tsx";
import { ReviewPanel } from "./practice/review/ReviewPanel.tsx";
import { pickPracticeStyles } from "./practice/shared/practiceStyles.tsx";

interface Props {
  platformCapabilities: MobilePlatformCapabilities;
  arrowDuelTargetCorrect?: number;
  customThemeSelection?: CustomThemeSelection;
  themeCatalogPresentation?: ThemeCatalogPresentation;
  customTargetCorrect?: number;
  debugTrace?: (event: PracticeDebugTraceEvent) => void;
  feedbackIssuesOpener?: (url: string) => Promise<void>;
  historyProgressPresentation?: HistoryProgressPresentation;
  iCloudSyncErrorDetails?: ICloudSyncErrorDetailsPresentation;
  iCloudSyncSupportBundle?: ICloudSyncSupportBundlePresentation;
  currentTimeMs?: () => number;
  sprintGuidanceEnabled?: boolean;
  moveFeedbackSettings?: {
    preview?: MoveFeedbackPreviewer;
  };
  personalBestChallengeDesignPreview?: PersonalBestChallengeDesignPreview;
  puzzleSelectionId?: string;
  puzzleSelectionSeed?: string;
  runManagementEnabled?: boolean;
  runManagementPresentation?: PracticeRunManagementPresentation;
  runReorderDesignPreview?: RunReorderDesignPreview;
  runReorderFeedbackPreview?: (feedback: RunReorderPickupFeedback) => void;
  runEloEditingMovedToHome?: boolean;
  settingsCaptureBottomInset?: number;
  initialTab?: MobileBackPrimaryTab;
  sprintRulesDesignPreview?: SprintRulesDesignPreview;
  sprintStartDelayMs?: number;
  standardTargetCorrect?: number;
  systemBack?: MobileSystemBackSource;
  tacticalProfilePresentation?: TacticalProfilePresentation;
}

type PersonalBestGuideIntent = "first-entry" | "learn-hub";

export type SprintSessionGuidePresentation = SprintRulesGuidePresentation & {
  arrowDuelReplyChallenge?: boolean;
  arrowDuelReplyOnboarding?: "choice_then_reply";
  opponentReplySettingsHint?: boolean;
  focusedRun?: boolean;
  maxAttempts?: number;
  mode: "standard" | "arrow_duel";
};

export type SprintSessionGuideDesignPreview = {
  plan: SprintSessionGuidePlan;
  presentation: SprintSessionGuidePresentation;
  stepIndex?: number;
};

type ActiveSessionGuideState = SprintSessionGuideDesignPreview & {
  stepIndex: number;
};

export type SprintResultUnclearSummaryPresentation = {
  slowMarkedCount: number;
  timedOutMarkedCount?: number;
  userMarkedCount: number;
};

export type SprintResultUnclearPromptPresentation = {
  marked: boolean;
  question: string;
};

export type SprintResultReplayDesignItem = SessionReplayItem;

export type SprintRulesDesignPreview = {
  arrowDuelReplyChallenge?: ArrowDuelReplyChallengeDesignPreview;
  arrowDuelOpponentReplyGlobalSetting?: {
    enabled: boolean;
  };
  firstRunGuide?: SprintRulesGuidePresentation;
  firstRunGuideInitiallyVisible?: boolean;
  initialActiveState?: SprintState;
  initialSessionGuide?: SprintSessionGuideDesignPreview;
  initialPreviousAttemptNotice?: "slow" | "timed_out" | "wrong";
  initialResultUnclearPrompt?: SprintResultUnclearPromptPresentation;
  initialResultState?: SprintState;
  resultReplayItems?: readonly SprintResultReplayDesignItem[];
  resultUnclearSummary?: SprintResultUnclearSummaryPresentation;
  /** Focused Run pace for a design-preview result, in seconds. */
  resultFocusedRunPace?: { averageSolveSeconds?: number; usualSolveSeconds?: number };
  showRunEditorSummary?: boolean;
  showSettingsReset?: boolean;
  timeoutCountsAsMistake?: boolean;
};

type Tab = MobileBackTab;

type MobileBackPreview = MobileBackDestination & {
  edge: MobileSystemBackEdge;
  progress: number;
};

export type PracticeDebugTraceEvent = {
  type:
    | "board-lock"
    | "board-reset"
    | "feedback-snapshot"
    | "fen-mismatch"
    | "illegal-move"
    | "move-ignored"
    | "move-submitted"
    | "premove-queued"
    | "premove-replay";
  move?: string;
  reason?: string;
  puzzleId?: string | null;
  contextPuzzleId?: string | null;
  nextPuzzleId?: string | null;
  feedbackResult?: PuzzleFeedback["result"];
  puzzleSolved?: boolean;
  samePuzzle?: boolean;
  locked?: boolean;
  submittedFen?: string | null;
  resultFen?: string | null;
  expectedFen?: string | null;
};

type BoardResetSlide = BoardMove & {
  durationMs?: number;
};

type BoardMoveContext = {
  puzzleId: string | null;
};

type PendingPremove = {
  puzzleId: string;
  move: string;
  // Set when the board already validated and applied the move internally (it
  // arrived through onMove while locked). Replay must re-dispatch this stored
  // result instead of playing the move on the board a second time.
  result: MoveResult | null;
  context: BoardMoveContext;
};

type FeedbackBoardSnapshot = {
  boardFen: string;
  currentPuzzle: CurrentPuzzleState;
  elapsedSeconds?: number;
  feedback: PuzzleFeedback | null;
  kind: "feedback" | "timed_out";
  puzzleId: string;
};

type UnclearPromptState = {
  attemptId: string;
  marked: boolean;
  puzzleId: string;
  question: string;
};

type PreviousAttemptNoticeState = {
  attemptId: string;
  puzzleId: string;
  reason: PreviousAttemptNoticeReason;
};

function previousAttemptNoticeFor(
  attempt: AttemptEvent | null | undefined,
  sprintStatus: SprintState["status"]
): PreviousAttemptNoticeState | null {
  if (!attempt || sprintStatus !== "active") {
    return null;
  }
  if (attempt.result === "timed_out" || attempt.result === "wrong") {
    return {
      attemptId: attempt.id,
      puzzleId: attempt.puzzleId,
      reason: attempt.result
    };
  }
  return attempt.result === "correct"
    && attempt.timingStatus === "slow"
    && attempt.unclear === true
    ? {
        attemptId: attempt.id,
        puzzleId: attempt.puzzleId,
        reason: "slow"
      }
    : null;
}

function incompleteUnclearPromptFor(
  attempt: Pick<AttemptEvent, "id" | "puzzleId" | "result" | "unclear"> | null | undefined
): UnclearPromptState | null {
  return attempt?.result === "incomplete"
    ? {
        attemptId: attempt.id,
        marked: Boolean(attempt.unclear),
        puzzleId: attempt.puzzleId,
        question: "Was the final puzzle unclear?"
      }
    : null;
}

type PendingGuidedStart =
  | {
      kind: "sprint";
      nextMode: SprintMode;
      practiceRunId?: string;
      useCustomTiming: boolean;
    }
  | {
      kind: "focused";
      taskFamily: TacticalProfileTaskFamily;
      onUnavailable: (error: unknown) => void;
    };

type StartingFocusedRun = {
  taskFamily: TacticalProfileTaskFamily;
  onUnavailable: (error: unknown) => void;
};

const SPRINT_RULES_PREVIEW_UNCLEAR_ATTEMPT_ID = "sprint-rules-preview-final-attempt";

const HISTORY_PAGE_LIMIT = 20;

function shouldShowTimeoutSnapshot(
  nextState: SprintState,
  submittedPuzzleId: string | null
): boolean {
  return nextState.status !== "active" ||
    nextState.currentPuzzle?.puzzle.id !== submittedPuzzleId;
}

const ARROW_DUEL_OPTIONAL_SETTINGS_COPY =
  "This extra challenge is optional — turn it off in Settings.";
const ARROW_DUEL_LOADING_TRANSITION_MS = 200;
const APP_REVIEW_REQUEST_IDLE_MS = 2_000;

export function isAppReviewRequestSurfaceBlocked(input: {
  hasError: boolean;
  hasModalOrGuide: boolean;
  hasNavigationPreview: boolean;
  isAnalysisOpen: boolean;
  isPracticeTab: boolean;
}): boolean {
  return !input.isPracticeTab ||
    input.hasModalOrGuide ||
    input.isAnalysisOpen ||
    input.hasNavigationPreview ||
    input.hasError;
}

function openFeedbackIssuesInBrowser(url: string): Promise<void> {
  return Linking.openURL(url);
}

const CHESSBOARD_DURATIONS = { move: BOARD_MOVE_ANIMATION_MS } as const;
// Space below the last tab content row, added to the tab chrome's bottom inset.
const CONTENT_BOTTOM_PADDING = 40;
const CONTENT_GAP = 12;

export function PracticePocScreen({
  platformCapabilities,
  arrowDuelTargetCorrect,
  customThemeSelection,
  themeCatalogPresentation = SERVER_CURATED_THEME_PRESENTATION,
  customTargetCorrect,
  debugTrace,
  feedbackIssuesOpener = openFeedbackIssuesInBrowser,
  historyProgressPresentation,
  iCloudSyncErrorDetails,
  iCloudSyncSupportBundle,
  currentTimeMs = Date.now,
  sprintGuidanceEnabled = false,
  moveFeedbackSettings,
  personalBestChallengeDesignPreview,
  puzzleSelectionId,
  puzzleSelectionSeed,
  runManagementEnabled = false,
  runManagementPresentation,
  runReorderDesignPreview,
  runReorderFeedbackPreview,
  runEloEditingMovedToHome = false,
  settingsCaptureBottomInset,
  initialTab = "practice",
  sprintRulesDesignPreview,
  sprintStartDelayMs = ARROW_DUEL_LOADING_TRANSITION_MS,
  standardTargetCorrect,
  systemBack,
  tacticalProfilePresentation
}: Props): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const [puzzleSource, setPuzzleSource] = useState<MobilePuzzleSource>("bundledCore");
  const service = platformCapabilities.storage.practiceService;
  const configurePuzzleSource = platformCapabilities.storage.configurePuzzleSource;
  const injectMateIn2FocusedRun = platformCapabilities.testControls?.injectMateIn2FocusedRun;
  const seedTacticalHistory = platformCapabilities.testControls?.seedTacticalHistory;
  const simulationProfile = platformCapabilities.testControls?.simulationProfile;
  const stockfish = platformCapabilities.stockfish;
  const notificationClient = platformCapabilities.reminders.notificationClient;
  const reminderPlatform = platformCapabilities.reminders.platform;
  const moveFeedbackClient = platformCapabilities.moveFeedback.client;
  const uiHapticsClient = platformCapabilities.uiHaptics.client;
  // UI haptics (#609) share the single Haptic feedback setting with moves.
  const uiHaptics = useMemo(() => createUiHaptics({
    client: uiHapticsClient,
    isEnabled: () => service.getSettings().moveFeedback.hapticsEnabled
  }), [service, uiHapticsClient]);
  const appStoreReviewRequestClient = platformCapabilities.appReview.client;
  const progressProtection = platformCapabilities.progressProtection;
  const iCloudSyncClient = platformCapabilities.progressSync.client;
  const boardRef = useRef<ChessboardRef | null>(null);
  const practiceMainScrollRef = useRef<ScrollView | null>(null);
  const [practiceScrollHandler, setPracticeScrollHandler] = useState<ScrollView | null>(null);
  const setPracticeMainScrollRef = useCallback((scrollView: ScrollView | null) => {
    practiceMainScrollRef.current = scrollView;
    if (scrollView) {
      setPracticeScrollHandler((current) => current === scrollView ? current : scrollView);
    }
  }, []);
  const practiceScrollGestureRef = useMemo<React.RefObject<GestureType | undefined>>(() => ({
    current: practiceScrollHandler
      ? practiceScrollHandler as unknown as GestureType
      : undefined
  }), [practiceScrollHandler]);
  const practiceMainScrollMetricsRef = useRef({
    contentHeight: 0,
    offsetY: 0,
    reorderWindowBottom: 0,
    reorderWindowTop: 0,
    viewportHeight: 0,
    windowBottom: 0,
    windowTop: 0
  });
  const nativeRunReorderScrollController = useMemo<NativeRunReorderScrollController>(() => ({
    scrollGestureRef: practiceScrollGestureRef,
    getSnapshot(): NativeRunReorderScrollSnapshot | null {
      const metrics = practiceMainScrollMetricsRef.current;
      if (
        metrics.viewportHeight <= 0
        || metrics.windowBottom <= metrics.windowTop
        || metrics.reorderWindowBottom <= metrics.reorderWindowTop
      ) {
        return null;
      }
      return { ...metrics };
    },
    refreshBounds(reorderElement?: NativeRunReorderMeasureElement | null): void {
      practiceMainScrollRef.current?.getNativeScrollRef()?.measureInWindow((_x, y, _width, height) => {
        const metrics = practiceMainScrollMetricsRef.current;
        metrics.windowTop = y;
        metrics.windowBottom = y + (height > 0 ? height : metrics.viewportHeight);
      });
      reorderElement?.measureInWindow((_x, y, _width, height) => {
        const metrics = practiceMainScrollMetricsRef.current;
        metrics.reorderWindowTop = y;
        metrics.reorderWindowBottom = y + height;
      });
    },
    scrollBy(deltaY: number): number {
      const metrics = practiceMainScrollMetricsRef.current;
      const maxOffsetY = Math.max(0, metrics.contentHeight - metrics.viewportHeight);
      const reorderDeltaLimit = deltaY < 0
        ? Math.min(0, metrics.reorderWindowTop - metrics.windowTop)
        : Math.max(0, metrics.reorderWindowBottom - metrics.windowBottom);
      const boundedDeltaY = deltaY < 0
        ? Math.max(deltaY, reorderDeltaLimit)
        : Math.min(deltaY, reorderDeltaLimit);
      const nextOffsetY = Math.max(0, Math.min(maxOffsetY, metrics.offsetY + boundedDeltaY));
      const appliedDeltaY = nextOffsetY - metrics.offsetY;
      if (appliedDeltaY === 0 || !practiceMainScrollRef.current) {
        return 0;
      }
      metrics.offsetY = nextOffsetY;
      metrics.reorderWindowTop -= appliedDeltaY;
      metrics.reorderWindowBottom -= appliedDeltaY;
      practiceMainScrollRef.current.scrollTo({ animated: false, y: nextOffsetY });
      return appliedDeltaY;
    }
  }), [practiceScrollGestureRef]);
  const sessionBoardHandlersRef = useRef<{
    onIllegalMove: (from: Square, to: Square) => void;
    onMove: (result: MoveResult) => void;
  } | null>(null);
  const sessionBoardCallbacks = useMemo(() => ({
    onIllegalMove(from: Square, to: Square): void {
      sessionBoardHandlersRef.current?.onIllegalMove(from, to);
    },
    onMove(result: MoveResult): void {
      sessionBoardHandlersRef.current?.onMove(result);
    }
  }), []);
  const suppressedBoardMovesRef = useRef<string[]>([]);
  const boardSyncInProgressRef = useRef(false);
  const boardInputLockedRef = useRef(false);
  const puzzleEntryPreviewLockedRef = useRef(false);
  const boardInputLockModeRef = useRef<BoardInputLockMode>("hard");
  const boardInputLockRevisionRef = useRef(0);
  const pendingPremoveRef = useRef<PendingPremove | null>(null);
  const boardVisualFenRef = useRef<string | null>(null);
  const feedbackSnapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const puzzleTimeoutInFlightRef = useRef<string | null>(null);
  const sprintStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingGuidedStartRef = useRef<PendingGuidedStart | null>(null);
  const startingModeRef = useRef<SprintMode | null>(null);
  const startingPracticeRunIdRef = useRef<string | null>(null);
  const startingFocusedRunRef = useRef<StartingFocusedRun | null>(null);
  const deferredBackTransitionsRef = useRef(new Map<string, () => void>());
  const resumeDeferredBackTransitionsRef = useRef<(() => void) | null>(null);
  const predictiveBackIntentRef = useRef<MobileBackIntent | null>(null);
  const predictiveBackStateRef = useRef<MobileBackState | null>(null);
  const mobileBackStateRef = useRef<MobileBackState | null>(null);
  const executeMobileBackIntentRef = useRef<(
    (intent: MobileBackIntent, resolvedState: MobileBackState) => boolean
  ) | null>(null);
  const appReviewCancelledSessionIdsRef = useRef(new Set<string>());
  // Initialized once the service effect runs. Keeping this out of the useRef
  // argument matters because React evaluates that argument on every render.
  const scheduledReviewAttemptCountRef = useRef<number | null>(null);
  const stateRef = useRef<SprintState | null>(null);
  const boardFenRef = useRef<string | null>(null);
  const feedbackSnapshotRef = useRef<FeedbackBoardSnapshot | null>(null);
  const arrowDuelReplyPuzzleElapsedSecondsRef = useRef(0);
  const arrowDuelReplyChallengeTimeoutHandlerRef = useRef<() => void>(() => undefined);
  const arrowDuelReplyPreparationContinueRef = useRef<(() => void) | null>(null);
  const nowMsRef = useRef<number>(currentTimeMs());
  const reviewBackCommandIdRef = useRef(0);
  const { fontScale, height, width } = usePracticeViewport();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<SprintMode>(
    () => sprintRulesDesignPreview?.initialResultState?.config.mode
      ?? sprintRulesDesignPreview?.initialActiveState?.config.mode
      ?? "standard"
  );
  const [startingMode, setStartingMode] = useState<SprintMode | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [state, setState] = useState<SprintState | null>(
    () => sprintRulesDesignPreview?.initialResultState
      ?? sprintRulesDesignPreview?.initialActiveState
      ?? null
  );
  const [feedback, setFeedback] = useState<SessionFeedback>(null);
  const [arrowDuelReplyChallengeEnabled, setArrowDuelReplyChallengeEnabled] = useState(
    () => sprintRulesDesignPreview?.arrowDuelReplyChallenge?.enabled ?? true
  );
  const [arrowDuelOpponentReplyGlobalEnabled, setArrowDuelOpponentReplyGlobalEnabled] =
    useState(
      () => sprintRulesDesignPreview?.arrowDuelOpponentReplyGlobalSetting?.enabled
        ?? service.getSettings().arrowDuel.opponentReplyEnabled
    );
  const initialArrowDuelReplySeconds = (() => {
    const configured = sprintRulesDesignPreview?.arrowDuelReplyChallenge?.replySeconds
      ?? DEFAULT_OPPONENT_REPLY_SECONDS;
    return Number.isSafeInteger(configured)
      && configured >= OPPONENT_REPLY_MIN_SECONDS
      && configured <= OPPONENT_REPLY_MAX_SECONDS
      ? configured
      : DEFAULT_OPPONENT_REPLY_SECONDS;
  })();
  const [arrowDuelReplySeconds, setArrowDuelReplySeconds] = useState(
    initialArrowDuelReplySeconds
  );
  const [arrowDuelReplySecondsInput, setArrowDuelReplySecondsInput] = useState(
    String(initialArrowDuelReplySeconds)
  );
  const [arrowDuelReplyChallengePhase, setArrowDuelReplyChallengePhase] =
    useState<ArrowDuelReplyChallengePhase>("choice");
  const [arrowDuelReplyPromptPhase, setArrowDuelReplyPromptPhase] =
    useState<ArrowDuelReplyChallengePhase>("choice");
  const [arrowDuelWhatIfVisible, setArrowDuelWhatIfVisible] = useState(false);
  const [arrowDuelReplyPreparationAcknowledged, setArrowDuelReplyPreparationAcknowledged] =
    useState(false);
  const [aggregateRevision, setAggregateRevision] = useState(0);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueState[]>([]);
  const [dueReviewItems, setDueReviewItems] = useState<ReviewQueueItem[]>([]);
  const [sessionReplayItems, setSessionReplayItems] =
    useState<SessionReplayItem[]>(() => [
      ...(sprintRulesDesignPreview?.resultReplayItems ?? [])
    ]);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => currentTimeMs());
  const [resumableSprint, setResumableSprint] = useState<SprintState | null>(null);
  // A Run the user asked to start while another Run is waiting to resume.
  const [startConflict, setStartConflict] = useState<{
    sprint: SprintState;
    start: () => void;
  } | null>(null);
  const [personalBestGuideIntent, setPersonalBestGuideIntent] = useState<PersonalBestGuideIntent | null>(null);
  const [personalBestFirstEntryGuideAcknowledged, setPersonalBestFirstEntryGuideAcknowledged] =
    useState(false);
  const [personalBestGuideOpponentReplyEnabled, setPersonalBestGuideOpponentReplyEnabled] =
    useState<boolean | null>(null);
  const personalBestGuideVisible = personalBestGuideIntent !== null;
  const [personalBestHubVisible, setPersonalBestHubVisible] = useState(
    () => personalBestChallengeDesignPreview?.hubInitiallyVisible === true
      || personalBestChallengeDesignPreview?.sourcePickerInitiallyVisible === true
      || personalBestChallengeDesignPreview?.recordsInitiallyVisible === true
  );
  const [personalBestRecordsVisible, setPersonalBestRecordsVisible] = useState(
    () => personalBestChallengeDesignPreview?.recordsInitiallyVisible === true
  );
  const [personalBestSourcePickerVisible, setPersonalBestSourcePickerVisible] = useState(
    () => personalBestChallengeDesignPreview?.sourcePickerInitiallyVisible === true
  );
  useEffect(() => {
    if (!personalBestGuideVisible && !personalBestHubVisible && !personalBestRecordsVisible) {
      return;
    }
    practiceMainScrollMetricsRef.current.offsetY = 0;
    practiceMainScrollRef.current?.scrollTo({ animated: false, y: 0 });
  }, [personalBestGuideVisible, personalBestHubVisible, personalBestRecordsVisible]);
  const [personalBestSelectedSetup, setPersonalBestSelectedSetup] = useState<PersonalBestChallengeSelection | null>(null);
  const survivalPresentationNowMs = Math.floor(nowMs / 60_000) * 60_000;
  const livePersonalBestPresentation = useMemo<PersonalBestChallengeDesignPreview>(() => {
    void aggregateRevision;
    return buildSurvivalChallengePresentation({
      currentState: state,
      nowMs: survivalPresentationNowMs,
      service
    });
  }, [aggregateRevision, service, state, survivalPresentationNowMs]);
  const basePersonalBestPresentation = personalBestChallengeDesignPreview
    ?? livePersonalBestPresentation;
  const personalBestPresentation = useMemo<PersonalBestChallengeDesignPreview | undefined>(() => {
    if (!personalBestSelectedSetup) {
      return {
        ...basePersonalBestPresentation,
        opponentReplyEnabled: arrowDuelOpponentReplyGlobalEnabled
      };
    }
    return {
      ...basePersonalBestPresentation,
      band: {
        currentRating: personalBestSelectedSetup.sourceRating,
        minRating: personalBestSelectedSetup.band.minRating,
        maxRating: personalBestSelectedSetup.band.maxRating
      },
      bestScore: personalBestSelectedSetup.bestScore,
      challengeType: personalBestSelectedSetup.challengeType,
      opponentReplyEnabled: arrowDuelOpponentReplyGlobalEnabled,
      selectedReferenceRunIds: {
        ...basePersonalBestPresentation.selectedReferenceRunIds,
        [personalBestSelectedSetup.challengeType]: personalBestSelectedSetup.sourceId
      },
      startState: basePersonalBestPresentation.startStates?.[personalBestSelectedSetup.challengeType]
        ?? basePersonalBestPresentation.startState
    };
  }, [
    arrowDuelOpponentReplyGlobalEnabled,
    basePersonalBestPresentation,
    personalBestSelectedSetup
  ]);
  const personalBestGuidePresentation = useMemo<PersonalBestChallengeDesignPreview | undefined>(
    () => personalBestPresentation && personalBestGuideOpponentReplyEnabled !== null
      ? {
          ...personalBestPresentation,
          opponentReplyEnabled: personalBestGuideOpponentReplyEnabled
        }
      : personalBestPresentation,
    [personalBestGuideOpponentReplyEnabled, personalBestPresentation]
  );
  const [boardFen, setBoardFen] = useState<string | null>(null);
  const [lastBoardMove, setLastBoardMove] = useState<BoardMove | null>(null);
  const [feedbackPuzzleId, setFeedbackPuzzleId] = useState<string | null>(null);
  const [feedbackSnapshot, setFeedbackSnapshot] = useState<FeedbackBoardSnapshot | null>(null);
  const [unclearPrompt, setUnclearPrompt] = useState<UnclearPromptState | null>(() => (
    sprintRulesDesignPreview?.initialResultUnclearPrompt
      ? {
          attemptId: SPRINT_RULES_PREVIEW_UNCLEAR_ATTEMPT_ID,
          marked: sprintRulesDesignPreview.initialResultUnclearPrompt.marked,
          puzzleId: SPRINT_RULES_PREVIEW_UNCLEAR_ATTEMPT_ID,
          question: sprintRulesDesignPreview.initialResultUnclearPrompt.question
        }
      : null
  ));
  const [previousAttemptNotice, setPreviousAttemptNotice] =
    useState<PreviousAttemptNoticeState | null>(() => (
      sprintRulesDesignPreview?.initialPreviousAttemptNotice
        ? {
            attemptId: "sprint-rules-preview-previous-attempt",
            puzzleId: "sprint-rules-preview-previous-puzzle",
            reason: sprintRulesDesignPreview.initialPreviousAttemptNotice
          }
        : null
    ));
  const [boardInputLocked, setBoardInputLocked] = useState(false);
  const [boardInputLockMode, setBoardInputLockMode] = useState<BoardInputLockMode>("hard");
  const [readyArrowDuelBoardKey, setReadyArrowDuelBoardKey] = useState<string | null>(null);
  const [chessboardDebugEvents, setChessboardDebugEvents] = useState<string[]>([]);
  const {
    applyHistoryThemeIntent,
    changeHistoryAttentionOnly,
    changeHistoryRatingKey,
    changeHistoryRatingRangeFilter,
    changeHistoryResultFilter,
    changeHistorySideFilter,
    changeHistorySourceFilter,
    changeHistoryTimeRange,
    historyAttentionReasons,
    historyFiltersExpanded,
    historyPageOffset,
    historyProgressOpen,
    historyQuery,
    historyRatingKey,
    historyRatingRangeFilter,
    historyResultFilter,
    historySideFilter,
    historySourceFilter,
    historyThemeChoices,
    historyTimeRange,
    openHistoryProgress,
    resetHistoryFilters,
    setHistoryFiltersExpanded,
    setHistoryPageOffset,
    setHistoryProgressOpen,
    toggleHistoryAttentionReason
  } = useHistoryController();
  const [historyReviewEntries, setHistoryReviewEntries] = useState<ReviewEntry[]>([]);
  const [reviewBoardTouchActive, setReviewBoardTouchActive] = useState(false);
  const [historyUnavailableAttempt, setHistoryUnavailableAttempt] = useState<HistoryUnavailableAttempt | null>(null);
  const [historyReviewInitialIndex, setHistoryReviewInitialIndex] = useState(0);
  const [reviewSessionSource, setReviewSessionSource] = useState<ReviewEntry["source"] | null>(null);
  const [customSprintMode, setCustomSprintMode] = useState<"custom" | "arrow_duel">("custom");
  const [customDurationSeconds, setCustomDurationSeconds] = useState(5 * 60);
  const [customPerPuzzleSeconds, setCustomPerPuzzleSeconds] = useState(20);
  const [customInitialRating, setCustomInitialRating] = useState(CUSTOM_INITIAL_RATING_MIN);
  const [practiceExitConfirmationVisible, setPracticeExitConfirmationVisible] = useState(
    () => personalBestChallengeDesignPreview?.exitConfirmationInitiallyVisible === true
  );
  const [sprintRulesGuideVisible, setSprintRulesGuideVisible] = useState(
    () => sprintRulesDesignPreview?.firstRunGuideInitiallyVisible === true
      || (sprintGuidanceEnabled && !service.getSettings().sprintGuides.rulesSeen)
  );
  const [sessionGuide, setSessionGuide] = useState<ActiveSessionGuideState | null>(() => {
    const preview = sprintRulesDesignPreview?.initialSessionGuide;
    return preview && preview.plan.steps.length > 0
      ? { ...preview, stepIndex: preview.stepIndex ?? 0 }
      : null;
  });
  const [sessionGuideTargetRevision, setSessionGuideTargetRevision] = useState(0);
  const sessionGuideTargetRef = useRef<View>(null);
  const sessionRailScrollRef = useRef<ScrollView>(null);
  const [reviewFiltersExpanded, setReviewFiltersExpanded] = useState(false);
  const [customRatingEditorOpen, setCustomRatingEditorOpen] = useState(false);
  const [reviewAnalysisOpen, setReviewAnalysisOpen] = useState(false);
  const [reviewBackCommand, setReviewBackCommand] = useState<ReviewBackCommand | null>(null);
  const [mobileBackPreview, setMobileBackPreview] = useState<MobileBackPreview | null>(null);
  const [seededHistoryStatus, setSeededHistoryStatus] = useState<string | null>(null);
  const seedingHistoryRef = useRef(false);
  const [, setSettingsRevision] = useState(0);
  const internalRunManagement = usePracticeRunManagement({
    enabled: runManagementEnabled && runManagementPresentation === undefined,
    onStartRun: startPracticeRun,
    service
  });
  const activeRunManagementPresentation = runManagementPresentation ?? internalRunManagement.presentation;
  const ratingEditingMovedToHome = runEloEditingMovedToHome || activeRunManagementPresentation !== undefined;
  const customThemeChoices = useThemeChoiceSelection({
    controlledSelection: customThemeSelection?.selectedThemes,
    onControlledSelectionChange: customThemeSelection?.onChange
  });
  const resolvedHistoryProgressPresentation = useHistoryProgressPresentation({
    enabled: tab === "history" || historyProgressOpen,
    service,
    ...(historyProgressPresentation === undefined
      ? {}
      : { injectedPresentation: historyProgressPresentation }),
    refreshKey: aggregateRevision
  });
  const resolvedTacticalProfilePresentation = useTacticalProfilePresentation({
    service,
    ...(tacticalProfilePresentation === undefined
      ? {}
      : { injectedPresentation: tacticalProfilePresentation }),
    onStartRequested: requestFocusedRunStart,
    refreshKey: aggregateRevision
  });

  // The Sprint Result and its Survival sibling (#609) replace the Practice tab
  // content as a full-screen destination.
  const sprintResultVisible = tab === "practice"
    && state !== null
    && state.status !== "active"
    && state.status !== "paused"
    && feedbackSnapshot === null;
  const survivalResult = sprintResultVisible
    && (state.config.survival !== undefined
      || personalBestChallengeDesignPreview?.showActivePresentation === true)
    ? personalBestPresentation?.result
    : undefined;

  // Top-level navigation (#612). Global navigation is hidden whenever a focused
  // surface owns the screen (an open Run, its feedback snapshot, guides,
  // Survival setup and records, an open review). The screen stays in the
  // selected tab (so stateful panels such as Review keep their session); the
  // host hides all its chrome and the surface is laid out with the window
  // insets. Otherwise tab content uses the insets the host reports for its
  // chrome (the bottom glass bar, the iPhone Duo column, the iPad top bar, the
  // Android rail).
  const reviewSurfaceOpen = reviewSessionSource !== null
    || historyReviewEntries.length > 0
    || historyUnavailableAttempt !== null;
  const topLevelChromeVisible = isTopLevelChromeVisible({
    feedbackSnapshotVisible: feedbackSnapshot !== null,
    openSession: state?.status === "active" || state?.status === "paused",
    personalBestGuideVisible,
    personalBestHubVisible,
    personalBestRecordsVisible,
    sprintResultVisible,
    reviewSurfaceOpen,
    sessionGuideVisible: state === null
      && sessionGuide?.plan.steps[sessionGuide.stepIndex] !== undefined
  });
  const [tabContentInsets, setTabContentInsets] = useState<TabContentInsets | null>(null);
  const layoutInsets = topLevelChromeVisible && tabContentInsets ? tabContentInsets : insets;
  // Only the native iPad top tab bar is a floating overlay. Other nested safe
  // areas may differ from the root window too, so rely on the host's explicit
  // chrome signal rather than comparing inset values.
  const iPadTopTabBarOverlayVisible = topLevelChromeVisible
    && tabContentInsets?.topTabBarOverlay === true;
  const adaptiveLayout = useMemo(
    () => {
      const layout = buildPracticeAdaptiveLayout({ fontScale, height, insets: layoutInsets, width });
      // At accessibility sizes a narrow rail cannot fit whole headline words
      // beside its leading tiles. Review keeps the same board and puzzle in a
      // full-width scrolling column instead. The live Run layout is unchanged.
      return reviewSurfaceOpen && fontScale >= 2 && layout.usesSessionRail && layout.sessionRailWidth < 360
        ? { ...layout, usesSessionRail: false }
        : layout;
    },
    [fontScale, height, layoutInsets, reviewSurfaceOpen, width]
  );
  const boardSize = adaptiveLayout.boardSize;

  const isActive = state?.status === "active";
  const isPaused = state?.status === "paused";
  const isOpenSession = isActive || isPaused;
  const isFinished = state !== null && !isOpenSession;
  const storedSprintResultSummary = useMemo<SprintResultSummary | undefined>(() => {
    void aggregateRevision;
    if (!isFinished || !state || sprintRulesDesignPreview?.initialResultState) {
      return undefined;
    }
    return service.getSprintResultSummary(state);
  }, [aggregateRevision, isFinished, service, sprintRulesDesignPreview?.initialResultState, state]);
  const focusedRunUsualSolveSeconds = useMemo<number | undefined>(() => {
    void aggregateRevision;
    if (!isFinished || !state?.config.tacticalFocus) {
      return undefined;
    }
    return service.getFocusedRunUsualSolveSeconds(state.config);
  }, [aggregateRevision, isFinished, service, state]);
  const storedSprintReplayItems = useMemo<SessionReplayItem[]>(() => {
    void aggregateRevision;
    if (
      !isFinished
      || !state
      || sprintRulesDesignPreview?.resultReplayItems
    ) {
      return [];
    }
    return service.getSessionReplay(state.id);
  }, [aggregateRevision, isFinished, service, sprintRulesDesignPreview?.resultReplayItems, state]);
  const sprintReplayItems = sprintRulesDesignPreview?.resultReplayItems
    ?? storedSprintReplayItems;
  const isShowingFeedbackSnapshot = feedbackSnapshot !== null;
  const isSurvivalState = state?.config.survival !== undefined
    || personalBestChallengeDesignPreview?.showActivePresentation === true;
  const isSurvivalPauseVisible = isSurvivalState
    && personalBestPresentation?.showActivePresentation === true
    && isPaused;
  const shouldShowSessionBoard = (isActive || isShowingFeedbackSnapshot)
    && !isSurvivalPauseVisible;
  const sessionGuideStep: SprintSessionGuideStep | undefined = sessionGuide
    ?.plan.steps[sessionGuide.stepIndex];
  const sessionGuidePresentation = sessionGuide?.presentation;
  const isSessionGuideVisible = state === null && sessionGuideStep !== undefined;

  useEffect(() => {
    if (!isOpenSession && practiceExitConfirmationVisible) {
      setPracticeExitConfirmationVisible(false);
    }
  }, [isOpenSession, practiceExitConfirmationVisible]);
  const selectedCustomThemes = customThemeChoices.selection;
  const selectedSprintThemes = customThemeChoices.namedThemes;
  const selectedConfig = useMemo(
    () => sprintConfigFor(
      mode === "custom" ? customSprintMode : mode,
      customDurationSeconds,
      customPerPuzzleSeconds,
      mode === "custom",
      selectedSprintThemes
    ),
    [customDurationSeconds, customPerPuzzleSeconds, customSprintMode, mode, selectedSprintThemes]
  );
  const selectedRatingRecord = service.getRating(selectedConfig.ratingKey);
  const currentRating = selectedRatingRecord.rating;
  const customRatingPlayed = useMemo(() => {
    void aggregateRevision;
    return selectedRatingRecord.games > 0 || service.hasPlayedRatingKey(selectedConfig.ratingKey);
  }, [aggregateRevision, selectedConfig.ratingKey, selectedRatingRecord.games, service]);
  const displayedCustomInitialRating = customRatingPlayed ? selectedRatingRecord.rating : customInitialRating;
  stateRef.current = state;
  boardFenRef.current = boardFen;
  feedbackSnapshotRef.current = feedbackSnapshot;
  boardInputLockedRef.current = boardInputLocked;
  boardInputLockModeRef.current = boardInputLockMode;
  nowMsRef.current = nowMs;

  useEffect(() => {
    const rating = service.getRating(selectedConfig.ratingKey);
    if (selectedConfig.mode === "custom" || selectedConfig.mode === "arrow_duel") {
      setCustomInitialRating(rating.rating);
    }
  }, [selectedConfig.mode, selectedConfig.ratingKey, service]);

  useEffect(() => {
    if (configurePuzzleSource) {
      configurePuzzleSource(puzzleSource);
    }
    refreshState();
    // refreshState reads mutable service state; rerunning for its render-local identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configurePuzzleSource, puzzleSource, service]);

  // Called here so its iCloud startup effect keeps its place in the effect order.
  const {
    appearance,
    dismissReviewReminderPermissionPrompt,
    effectiveErrorDetails,
    effectiveSupportBundle,
    iCloudSyncEnabled,
    iCloudSyncInProgress,
    iCloudSyncStatus,
    maybeShowReviewReminderPermissionPrompt,
    moveFeedbackPreferences,
    notificationPermissionStatus,
    openReviewReminderSystemSettings,
    refreshReviewReminder,
    requestReviewReminderPermission,
    reviewReminderPermissionPromptVisible,
    reviewReminderPreference,
    reviewReminderScheduleStatus,
    runICloudProgressSync,
    saveAppearance,
    saveICloudSyncEnabled,
    saveMoveFeedbackPreferences,
    saveReviewReminderPreference,
    scheduleDevReviewReminderNotification,
    setICloudSyncEnabled,
    setICloudSyncStatus,
    setNotificationPermissionStatus,
    setReviewReminderPreference,
    setSettingsAdvancedRatingsOpen,
    settingsAdvancedRatingsOpen
  } = useSettingsController({
    currentTimeMs,
    deferBackRelevantTransition,
    emitTrace,
    iCloudSyncErrorDetails,
    iCloudSyncSupportBundle,
    nowIso,
    nowMsRef,
    platformCapabilities,
    refreshState,
    setSettingsRevision
  });

  useEffect(() => {
    let canceled = false;
    scheduledReviewAttemptCountRef.current = scheduledReviewAttemptCount(service);
    setReviewReminderPreference(service.getReviewReminderPreference());
    if (!notificationClient) {
      setNotificationPermissionStatus("unavailable");
      return undefined;
    }

    void notificationClient.getAuthorizationStatus().then((status) => {
      if (!canceled) {
        setNotificationPermissionStatus(status);
      }
    }).catch(() => {
      if (!canceled) {
        setNotificationPermissionStatus("unavailable");
      }
    });
    void notificationClient.consumeInitialRoute().then((route) => {
      if (!canceled && route === "review") {
        openReviewQueue();
      }
    }).catch(() => {});
    const unsubscribe = notificationClient.addNotificationResponseListener((route) => {
      if (route === "review") {
        openReviewQueue();
      }
    });

    return () => {
      canceled = true;
      unsubscribe();
    };
    // Notification callbacks intentionally use the current render-local queue opener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationClient, service]);

  useEffect(() => {
    if (!isActive && !isShowingFeedbackSnapshot) {
      refreshState();
    }
    // The tab transition is the trigger; status values and refreshState are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, service]);

  useEffect(() => {
    const appState = AppState as typeof AppState | undefined;
    if (!appState?.addEventListener) {
      return undefined;
    }
    const subscription = appState.addEventListener("change", (nextState) => {
      if ((nextState === "background" || nextState === "inactive") && stateRef.current?.status === "active") {
        pauseActiveSprint("app-state");
      }
      if (nextState === "background" || nextState === "inactive") {
        const currentSessionId = stateRef.current?.id;
        if (currentSessionId) {
          appReviewCancelledSessionIdsRef.current.add(currentSessionId);
        }
        refreshReviewReminder("app-background", true);
        if (service.getSettings().sync.iCloudEnabled) {
          void runICloudProgressSync("app-background");
        }
      }
      if (nextState === "active" && notificationClient) {
        void notificationClient.getAuthorizationStatus().then((status) => {
          setNotificationPermissionStatus(status);
          if (status === "authorized") {
            refreshReviewReminder("app-active", true);
          }
        }).catch(() => {
          setNotificationPermissionStatus("unavailable");
        });
      }
    });
    return () => {
      subscription.remove();
    };
    // The listener is rebound only when its native client or backing service changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iCloudSyncClient, notificationClient, service]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const timer = setInterval(() => {
      setNowMs(currentTimeMs());
    }, 500);

    return () => {
      clearInterval(timer);
    };
  }, [currentTimeMs, isActive]);

  useEffect(() => {
    if (!state || state.status !== "active" || state.config.survival !== undefined) {
      return;
    }

    const sprintDeadlineMs = new Date(state.deadlineAt).getTime();
    const puzzleDeadlineMs = state.currentPuzzleDeadlineAt
      ? new Date(state.currentPuzzleDeadlineAt).getTime()
      : null;
    const opponentReplyClocksPaused =
      state.currentPuzzle?.kind === "arrow_duel" &&
      state.currentPuzzle.phase !== "choice";
    const replyDeadlineMs =
      state.currentPuzzle?.kind === "arrow_duel" &&
      state.currentPuzzle.phase === "reply" &&
      state.currentPuzzle.replyDeadlineAt
        ? new Date(state.currentPuzzle.replyDeadlineAt).getTime()
        : null;
    const replyDeadlineReached = replyDeadlineMs !== null && nowMs >= replyDeadlineMs;
    const sprintDeadlineReached = !opponentReplyClocksPaused
      && sprintHasRunDeadline(state.config)
      && nowMs >= sprintDeadlineMs;
    const puzzleDeadlineReached =
      !opponentReplyClocksPaused &&
      puzzleDeadlineMs !== null &&
      nowMs >= puzzleDeadlineMs;
    if (!sprintDeadlineReached && !puzzleDeadlineReached && !replyDeadlineReached) {
      return;
    }

    const settleExpiredTime = () => {
      const submittedPuzzle = state.currentPuzzle;
      const submittedPuzzleId = submittedPuzzle?.puzzle.id ?? null;
      const submittedFen = submittedPuzzle?.currentFen ?? boardFenRef.current ?? null;
      if (
        (puzzleDeadlineReached || replyDeadlineReached) &&
        !sprintDeadlineReached &&
        submittedPuzzleId &&
        puzzleTimeoutInFlightRef.current === submittedPuzzleId
      ) {
        return;
      }
      if ((puzzleDeadlineReached || replyDeadlineReached) && !sprintDeadlineReached && submittedPuzzleId) {
        puzzleTimeoutInFlightRef.current = submittedPuzzleId;
        commitBoardInputLocked(
          true,
          replyDeadlineReached ? "arrow-duel-reply-timeout" : "puzzle-timeout",
          submittedPuzzleId
        );
      }
      try {
        const advanced = service.advanceSprintTime(new Date(nowMs).toISOString());
        commitState(advanced.state);
        setFeedback(null);
        setFeedbackPuzzleId(null);
        setUnclearPrompt(incompleteUnclearPromptFor(advanced.attempt));
        setPreviousAttemptNotice(
          submittedPuzzle?.kind === "arrow_duel" &&
          state.config.opponentReply?.enabled
            ? null
            : previousAttemptNoticeFor(
                advanced.attempt,
                advanced.state.status
              )
        );
        // A terminal timeout has no next active puzzle, but it still owns the
        // same stable feedback snapshot before Sprint Result replaces the board.
        if (
          advanced.attempt?.timingStatus === "timed_out" &&
          submittedPuzzle &&
          submittedFen &&
          shouldShowTimeoutSnapshot(advanced.state, submittedPuzzleId)
        ) {
          showTimeoutSnapshot(
            advanced.state,
            submittedPuzzle,
            submittedFen,
            Math.floor((advanced.attempt.elapsedMs ?? 0) / 1000)
          );
        } else {
          puzzleTimeoutInFlightRef.current = null;
          clearFeedbackSnapshot();
          commitBoardInputLocked(
            false,
            sprintDeadlineReached
              ? "sprint-expired"
              : replyDeadlineReached
                ? "arrow-duel-reply-timeout-complete"
                : "puzzle-timeout-complete",
            advanced.state.currentPuzzle?.puzzle.id ?? null
          );
          commitBoardFen(advanced.state.currentPuzzle?.currentFen ?? null);
        }
        if (advanced.state.status !== "active") {
          refreshState();
        }
      } catch (caught) {
        puzzleTimeoutInFlightRef.current = null;
        commitBoardInputLocked(false, "time-advance-error", submittedPuzzleId);
        setError(errorMessage(caught));
      }
    };
    if (practiceExitConfirmationVisible) {
      return;
    }
    if (deferBackRelevantTransition("active-sprint-expiry", settleExpiredTime)) {
      return;
    }
    settleExpiredTime();
    // refreshState is deliberately omitted because its identity changes on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowMs, practiceExitConfirmationVisible, service, state]);

  useEffect(() => {
    const globals = globalThis as unknown as {
      __CHESSTICIZE_CHESSBOARD_DEBUG__?: boolean;
      __CHESSTICIZE_CHESSBOARD_DEBUG_SINK__?: (event: string, details: Record<string, unknown>) => void;
    };
    const deferredBackTransitions = deferredBackTransitionsRef.current;
    globals.__CHESSTICIZE_CHESSBOARD_DEBUG__ = isPracticeDebugEnabled();
    globals.__CHESSTICIZE_CHESSBOARD_DEBUG_SINK__ = (event, details) => {
      const message = `${event} ${JSON.stringify(details)}`;
      setChessboardDebugEvents((events) => [...events.slice(-7), message]);
    };
    return () => {
      clearFeedbackSnapshotTimer();
      if (sprintStartTimerRef.current) {
        clearTimeout(sprintStartTimerRef.current);
        sprintStartTimerRef.current = null;
      }
      startingModeRef.current = null;
      startingPracticeRunIdRef.current = null;
      startingFocusedRunRef.current = null;
      deferredBackTransitions.clear();
      globals.__CHESSTICIZE_CHESSBOARD_DEBUG__ = undefined;
      globals.__CHESSTICIZE_CHESSBOARD_DEBUG_SINK__ = undefined;
    };
  }, []);

  function nowIso(): string {
    return new Date(nowMsRef.current).toISOString();
  }

  function navigateToTab(nextTab: Tab): void {
    if (nextTab === "history") {
      captureLiveNowIso();
    }
    if (nextTab !== "history") {
      setHistoryFiltersExpanded(false);
      setHistoryProgressOpen(false);
    }
    if (nextTab !== "review") {
      setReviewFiltersExpanded(false);
    }
    if (nextTab !== "settings") {
      setSettingsAdvancedRatingsOpen(false);
    }
    if (nextTab !== "practice") {
      setCustomRatingEditorOpen(false);
    }
    setTab(nextTab);
  }

  function captureLiveNowIso(): string {
    const liveNowMs = currentTimeMs();
    nowMsRef.current = liveNowMs;
    setNowMs(liveNowMs);
    return new Date(liveNowMs).toISOString();
  }

  function refreshState(): void {
    service.pruneOrphanedReviewQueue();
    setReviewQueue(service.listReviewQueue());
    setDueReviewItems(service.getDueReviewItems(nowIso()));
    internalRunManagement.refresh();
    setAggregateRevision((current) => current + 1);
    setReviewReminderPreference(service.getReviewReminderPreference());
    const activeSprint = service.getActiveSprint();
    setResumableSprint(
      activeSprint && (activeSprint.status === "active" || activeSprint.status === "paused") && stateRef.current?.id !== activeSprint.id
        ? activeSprint
        : null
    );
    refreshReviewReminder("queue-refresh");
  }

  function playCommittedMoveFeedback(
    actor: MoveFeedbackActor,
    move: string,
    preMoveFen: string | null
  ): void {
    if (!moveFeedbackClient || !preMoveFen) {
      return;
    }
    const cue = moveFeedbackCueForMove(preMoveFen, move);
    if (!cue) {
      return;
    }
    void emitCommittedMoveFeedback(
      moveFeedbackClient,
      { actor, cue },
      service.getSettings().moveFeedback
    ).catch(() => {
      // Feedback is nonessential and must never interrupt a chess move.
    });
  }

  function playRunReorderPickupFeedback(feedback: RunReorderPickupFeedback): void {
    runReorderFeedbackPreview?.(feedback);
    if (!moveFeedbackClient) {
      return;
    }
    void emitRunReorderPickupFeedback(
      moveFeedbackClient,
      service.getSettings().moveFeedback
    ).catch(() => {
      // Pickup feedback is nonessential and must never interrupt Run reordering.
    });
  }

  function promoteNextFutureReviewsToDue(): ReviewQueueDuePromotionResult {
    const result = service.promoteNextFutureReviewsToDue(nowIso());
    refreshState();
    refreshReviewReminder("dev-promote-next-due", true);
    return result;
  }

  function commitState(nextState: SprintState | null): void {
    stateRef.current = nextState;
    setState(nextState);
  }

  function commitBoardFen(nextFen: string | null): void {
    boardFenRef.current = nextFen;
    boardVisualFenRef.current = nextFen;
    setBoardFen(nextFen);
  }

  function commitFeedbackSnapshot(nextSnapshot: FeedbackBoardSnapshot | null): void {
    feedbackSnapshotRef.current = nextSnapshot;
    setFeedbackSnapshot(nextSnapshot);
  }

  function commitBoardInputLocked(
    nextLocked: boolean,
    reason: string,
    puzzleId?: string | null,
    mode: BoardInputLockMode = "hard"
  ): number {
    const revision = boardInputLockRevisionRef.current + 1;
    boardInputLockRevisionRef.current = revision;
    const nextMode = nextLocked ? mode : "hard";
    if (nextLocked && mode === "hard") {
      // A hard lock (submit, pause, feedback snapshot) invalidates any premove
      // captured during a reply animation that never got replayed.
      pendingPremoveRef.current = null;
    }
    boardInputLockedRef.current = nextLocked;
    boardInputLockModeRef.current = nextMode;
    setBoardInputLocked(nextLocked);
    setBoardInputLockMode(nextMode);
    emitTrace({
      type: "board-lock",
      reason,
      puzzleId,
      locked: nextLocked
    });
    return revision;
  }

  function resetBoardToFen(
    fen: string | null | undefined,
    reason: string,
    puzzleId?: string | null,
    move?: string,
    slide?: BoardResetSlide | null,
    targetFlipped?: boolean
  ): Promise<void> | null {
    if (!fen) {
      return null;
    }
    let completion: Promise<void> | undefined;
    if (slide) {
      completion = boardRef.current?.resetBoard(fen, {
        lastMove: null,
        slide: {
          ...(slide.durationMs === undefined ? {} : { durationMs: slide.durationMs }),
          from: slide.from as Square,
          to: slide.to as Square
        },
        ...(targetFlipped === undefined ? {} : { flipped: targetFlipped })
      });
    } else {
      completion = boardRef.current?.resetBoard(
        fen,
        targetFlipped === undefined ? undefined : { flipped: targetFlipped }
      );
    }
    emitTrace({
      type: "board-reset",
      reason,
      move,
      puzzleId,
      submittedFen: fen
    });
    return completion ?? null;
  }

  function emitTrace(event: PracticeDebugTraceEvent): void {
    debugTrace?.(event);
    if (isPracticeDebugEnabled()) {
      console.info("[PracticePoc]", JSON.stringify(event));
    }
  }

  function startPracticeRun(runId: string): void {
    let run: PracticeRunRecord;
    try {
      run = service.getActivePracticeRun(runId);
    } catch {
      setError("This run is no longer available on Home.");
      internalRunManagement.refresh();
      return;
    }
    startSprint(run.mode, run.kind === "custom", run.id);
  }

  function sprintGuidePresentationFor(
    nextMode: SprintMode,
    useCustomTiming: boolean,
    practiceRunId?: string
  ): SprintRulesGuidePresentation & {
    arrowDuelReplyChallenge?: boolean;
    arrowDuelReplyOnboarding?: "choice_then_reply";
    opponentReplySettingsHint?: boolean;
  } {
    const config = practiceRunId === undefined
      ? sprintConfigFor(
          nextMode,
          customDurationSeconds,
          customPerPuzzleSeconds,
          useCustomTiming,
          useCustomTiming ? selectedSprintThemes : []
        )
      : service.getActivePracticeRun(practiceRunId);
    const targetOverride = useCustomTiming
      ? customTargetCorrect
      : nextMode === "standard"
        ? standardTargetCorrect
        : arrowDuelTargetCorrect;
    const hasOpponentReply = service.effectiveOpponentReplyConfig(
      nextMode,
      config.opponentReply
    )?.enabled === true;
    return {
      durationLabel: formatSprintDurationLabel(config.durationSeconds),
      maxMistakes: config.maxMistakes,
      targetCorrect: targetOverride ?? config.targetCorrect,
      ...(hasOpponentReply
        ? {
            arrowDuelReplyChallenge: true,
            arrowDuelReplyOnboarding: "choice_then_reply" as const,
            opponentReplySettingsHint: true
          }
        : {})
    };
  }

  function saveArrowDuelOpponentReplyGlobalEnabled(enabled: boolean): void {
    setArrowDuelOpponentReplyGlobalEnabled(enabled);
    if (arrowDuelOpponentReplyGlobalSettingDesign) {
      return;
    }
    const settings = service.getSettings();
    service.saveSettings({
      ...settings,
      arrowDuel: { opponentReplyEnabled: enabled }
    });
    setSettingsRevision((current) => current + 1);
  }

  function saveSprintGuideSeen(guide: SprintGuideKey): void {
    const settings = service.getSettings();
    service.saveSettings({
      ...settings,
      sprintGuides: markSprintGuideSeen(settings.sprintGuides, guide)
    });
    setSettingsRevision((current) => current + 1);
  }

  function saveSessionGuidePlanSeen(plan: SprintSessionGuidePlan): void {
    const settings = service.getSettings();
    service.saveSettings({
      ...settings,
      sprintGuides: markSprintSessionGuidePlanSeen(settings.sprintGuides, plan)
    });
    setSettingsRevision((current) => current + 1);
  }

  function beginFirstUseSessionGuides(
    nextMode: SprintMode,
    useCustomTiming: boolean,
    practiceRunId?: string,
    pendingStart?: PendingGuidedStart,
    presentationOverride?: SprintRulesGuidePresentation & {
      arrowDuelReplyChallenge?: boolean;
      arrowDuelReplyOnboarding?: "choice_then_reply";
      focusedRun?: boolean;
      maxAttempts?: number;
      opponentReplySettingsHint?: boolean;
    }
  ): boolean {
    if (!sprintGuidanceEnabled || pendingGuidedStartRef.current) {
      return false;
    }
    const progress = service.getSettings().sprintGuides;
    const focusedRun = presentationOverride?.focusedRun === true;
    if (sprintSessionGuidePlanFor(progress, nextMode, {
      focusedRun,
      opponentReply: true
    }).steps.length === 0) {
      return false;
    }
    const presentation = presentationOverride ?? sprintGuidePresentationFor(
      nextMode,
      useCustomTiming,
      practiceRunId
    );
    const plan = sprintSessionGuidePlanFor(progress, nextMode, {
      focusedRun,
      opponentReply: presentation.arrowDuelReplyOnboarding === "choice_then_reply"
    });
    if (plan.steps.length === 0) {
      return false;
    }
    pendingGuidedStartRef.current = pendingStart ?? {
      kind: "sprint",
      nextMode,
      useCustomTiming,
      ...(practiceRunId === undefined ? {} : { practiceRunId })
    };
    setSessionGuide({
      plan,
      presentation: {
        ...presentation,
        mode: nextMode === "arrow_duel" ? "arrow_duel" : "standard"
      },
      stepIndex: 0
    });
    navigateToTab("practice");
    return true;
  }

  function startSprint(
    nextMode: SprintMode = mode,
    useCustomTiming = nextMode === "custom",
    practiceRunId?: string
  ): void {
    if (startingModeRef.current !== null) {
      return;
    }
    if (holdStartForUnfinishedRun(() => startSprint(nextMode, useCustomTiming, practiceRunId))) {
      return;
    }
    if (beginFirstUseSessionGuides(nextMode, useCustomTiming, practiceRunId)) {
      return;
    }
    if (nextMode === "arrow_duel") {
      startingModeRef.current = nextMode;
      startingPracticeRunIdRef.current = practiceRunId ?? null;
      setStartingMode(nextMode);
      sprintStartTimerRef.current = setTimeout(() => {
        finishDelayedSprintStart(nextMode, useCustomTiming, practiceRunId);
      }, sprintStartDelayMs);
      return;
    }
    performStartSprint(nextMode, useCustomTiming, practiceRunId);
  }

  function requestFocusedRunStart(
    taskFamily: TacticalProfileTaskFamily,
    onUnavailable: (error: unknown) => void
  ): void {
    if (startingModeRef.current !== null) {
      return;
    }
    if (holdStartForUnfinishedRun(() => requestFocusedRunStart(taskFamily, onUnavailable))) {
      return;
    }
    const nextMode = taskFamily === "arrow_duel" ? "arrow_duel" : "standard";
    const pendingStart: PendingGuidedStart = {
      kind: "focused",
      taskFamily,
      onUnavailable
    };
    const hasFirstUseGuide = sprintGuidanceEnabled
      && sprintSessionGuidePlanFor(
        service.getSettings().sprintGuides,
        nextMode,
        { focusedRun: true, opponentReply: true }
      ).steps.length > 0;
    if (hasFirstUseGuide) {
      const prepared = service.prepareFocusedRun(taskFamily, captureLiveNowIso());
      if (prepared.status !== "ready") {
        onUnavailable(new FocusedRunUnavailableError(prepared.reason));
        return;
      }
      if (beginFirstUseSessionGuides(
        nextMode,
        false,
        undefined,
        pendingStart,
        {
          // A new Focused Run is untimed; its header clock counts up from zero.
          durationLabel: prepared.prepared.config.runClock === "untimed"
            ? formatDuration(0)
            : formatSprintDurationLabel(prepared.prepared.config.durationSeconds),
          focusedRun: true,
          maxAttempts: prepared.prepared.config.maxAttempts,
          maxMistakes: prepared.prepared.config.maxMistakes,
          targetCorrect: prepared.prepared.config.targetCorrect,
          ...(nextMode === "arrow_duel"
            && prepared.prepared.config.opponentReply?.enabled === true
            ? {
                arrowDuelReplyChallenge: true,
                arrowDuelReplyOnboarding: "choice_then_reply" as const,
                opponentReplySettingsHint: true
              }
            : {})
        }
      )) {
        return;
      }
    }
    if (nextMode === "arrow_duel") {
      startingModeRef.current = nextMode;
      startingPracticeRunIdRef.current = null;
      startingFocusedRunRef.current = { taskFamily, onUnavailable };
      setStartingMode(nextMode);
      sprintStartTimerRef.current = setTimeout(() => {
        finishDelayedFocusedRunStart(taskFamily, onUnavailable);
      }, sprintStartDelayMs);
      return;
    }
    performStartFocusedRun(taskFamily, onUnavailable);
  }

  // Starting beside an unfinished Run cannot succeed. Ask what to do with it
  // instead of letting the service invariant reach the user.
  function holdStartForUnfinishedRun(start: () => void): boolean {
    const open = service.getActiveSprint();
    if (
      !open
      || (open.status !== "active" && open.status !== "paused")
      || stateRef.current?.id === open.id
    ) {
      return false;
    }
    setError(null);
    setStartConflict({ sprint: open, start });
    return true;
  }

  function resumeUnfinishedRun(): void {
    if (!startConflict) {
      return;
    }
    const { sprint } = startConflict;
    setStartConflict(null);
    resumeSprint(sprint);
  }

  function discardUnfinishedRunAndStart(): void {
    if (!startConflict) {
      return;
    }
    const { start } = startConflict;
    setStartConflict(null);
    try {
      service.abandonSprint(captureLiveNowIso());
    } catch {
      // The Run could not be discarded; keep it resumable instead of starting.
      refreshState();
      return;
    }
    refreshState();
    start();
  }

  function finishDelayedFocusedRunStart(
    taskFamily: TacticalProfileTaskFamily,
    onUnavailable: (error: unknown) => void
  ): void {
    sprintStartTimerRef.current = null;
    const expectedMode = taskFamily === "arrow_duel" ? "arrow_duel" : "standard";
    const startingFocus = startingFocusedRunRef.current;
    if (
      startingModeRef.current !== expectedMode ||
      startingFocus?.taskFamily !== taskFamily ||
      startingFocus.onUnavailable !== onUnavailable
    ) {
      return;
    }
    if (deferBackRelevantTransition("delayed-sprint-start", () => {
      const resumedFocus = startingFocusedRunRef.current;
      if (
        startingModeRef.current === expectedMode &&
        resumedFocus?.taskFamily === taskFamily &&
        resumedFocus.onUnavailable === onUnavailable
      ) {
        performStartFocusedRun(taskFamily, onUnavailable);
      }
    })) {
      return;
    }
    performStartFocusedRun(taskFamily, onUnavailable);
  }

  function finishDelayedSprintStart(
    nextMode: SprintMode,
    useCustomTiming: boolean,
    practiceRunId?: string
  ): void {
    sprintStartTimerRef.current = null;
    if (
      startingModeRef.current !== nextMode
      || startingPracticeRunIdRef.current !== (practiceRunId ?? null)
    ) {
      return;
    }
    if (deferBackRelevantTransition("delayed-sprint-start", () => {
      if (
        startingModeRef.current === nextMode
        && startingPracticeRunIdRef.current === (practiceRunId ?? null)
      ) {
        performStartSprint(nextMode, useCustomTiming, practiceRunId);
      }
    })) {
      return;
    }
    performStartSprint(nextMode, useCustomTiming, practiceRunId);
  }

  function performStartFocusedRun(
    taskFamily: TacticalProfileTaskFamily,
    onUnavailable: (error: unknown) => void
  ): void {
    setError(null);
    try {
      adoptStartedSprint(service.startFocusedRun(
        taskFamily,
        captureLiveNowIso()
      ));
    } catch (caught) {
      if (caught instanceof ActiveSprintConflictError) {
        refreshState();
        holdStartForUnfinishedRun(() => requestFocusedRunStart(taskFamily, onUnavailable));
      } else {
        onUnavailable(caught);
      }
    } finally {
      startingModeRef.current = null;
      startingPracticeRunIdRef.current = null;
      startingFocusedRunRef.current = null;
      setStartingMode(null);
    }
  }

  function deferBackRelevantTransition(key: string, resumeAfterCancel: () => void): boolean {
    if (!predictiveBackIntentRef.current) {
      return false;
    }
    // Autonomous work may finish while Android is revealing a destination.
    // Keep that destination mounted until the gesture settles: cancel resumes
    // the work, while commit lets the frozen Back intent supersede it.
    deferredBackTransitionsRef.current.set(key, resumeAfterCancel);
    return true;
  }

  function resumeDeferredBackTransitions(): void {
    const transitions = [...deferredBackTransitionsRef.current.values()];
    deferredBackTransitionsRef.current.clear();
    for (const resume of transitions) {
      resume();
    }
  }

  resumeDeferredBackTransitionsRef.current = resumeDeferredBackTransitions;

  function cancelStartingSprint(): void {
    if (sprintStartTimerRef.current) {
      clearTimeout(sprintStartTimerRef.current);
      sprintStartTimerRef.current = null;
    }
    deferredBackTransitionsRef.current.delete("delayed-sprint-start");
    startingModeRef.current = null;
    startingPracticeRunIdRef.current = null;
    startingFocusedRunRef.current = null;
    setStartingMode(null);
  }

  function performStartSprint(
    nextMode: SprintMode,
    useCustomTiming: boolean,
    practiceRunId?: string
  ): void {
    setError(null);
    try {
      const customThemeValues = useCustomTiming ? selectedSprintThemes : [];
      const config = practiceRunId === undefined
        ? sprintConfigFor(nextMode, customDurationSeconds, customPerPuzzleSeconds, useCustomTiming, customThemeValues)
        : null;
      if (useCustomTiming && config) {
        const rating = service.getRating(config.ratingKey);
        if (rating.games === 0 && rating.rating !== customInitialRating) {
          service.setRating(config.ratingKey, customInitialRating);
        }
      }
      if (configurePuzzleSource) {
        configurePuzzleSource(puzzleSource, config?.mode ?? nextMode);
      }
      if (puzzleSelectionId) {
        service.setPuzzleSelectionScopeIds([puzzleSelectionId]);
      }
      const randomSelection = configurePuzzleSource && shouldRandomizePuzzleSelection(puzzleSource)
        ? { puzzleSelectionSeed: puzzleSelectionSeed ?? `${Date.now()}-${Math.random()}` }
        : {};
      const runTargetCorrect = useCustomTiming
        ? customTargetCorrect
        : nextMode === "standard"
          ? standardTargetCorrect
          : arrowDuelTargetCorrect;
      const started = service.startSprint(
        practiceRunId !== undefined
          ? {
              mode: nextMode,
              practiceRunId,
              ...(runTargetCorrect === undefined ? {} : { targetCorrect: runTargetCorrect }),
              ...randomSelection
            }
          : {
              mode: nextMode,
              durationSeconds: config!.durationSeconds,
              perPuzzleSeconds: config!.perPuzzleSeconds,
              ...(customThemeValues.length > 0
                ? { themes: customThemeValues, persistCustomConfig: true }
                : useCustomTiming ? { persistCustomConfig: true } : {}),
              ...(nextMode === "standard" && standardTargetCorrect !== undefined
                ? { targetCorrect: standardTargetCorrect }
                : {}),
              ...(nextMode === "arrow_duel" && arrowDuelTargetCorrect !== undefined
                ? { targetCorrect: arrowDuelTargetCorrect }
                : {}),
              ...(nextMode === "arrow_duel" && arrowDuelReplyChallengeDesign
                ? {
                    opponentReply: {
                      enabled: false,
                      seconds: arrowDuelReplySeconds
                    }
                  }
                : {}),
              ...(useCustomTiming && customTargetCorrect !== undefined
                ? { targetCorrect: customTargetCorrect }
                : {}),
              ...randomSelection
            },
        captureLiveNowIso()
      );
      adoptStartedSprint(started);
    } catch (caught) {
      if (caught instanceof ActiveSprintConflictError) {
        refreshState();
        holdStartForUnfinishedRun(() => startSprint(nextMode, useCustomTiming, practiceRunId));
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      startingModeRef.current = null;
      startingPracticeRunIdRef.current = null;
      startingFocusedRunRef.current = null;
      setStartingMode(null);
    }
  }

  function adoptStartedSprint(started: SprintState): void {
    setMode(started.config.mode);
    setSessionReplayItems([]);
    commitState(started);
    setResumableSprint(null);
    commitBoardFen(started.currentPuzzle?.currentFen ?? null);
    setLastBoardMove(null);
    setFeedback(null);
    setFeedbackPuzzleId(null);
    setUnclearPrompt(null);
    setPreviousAttemptNotice(null);
    pendingPremoveRef.current = null;
    commitBoardInputLocked(false, "start", started.currentPuzzle?.puzzle.id ?? null);
    clearFeedbackSnapshot();
    navigateToTab("practice");
    // Starting a run changes the managed-run presentation but not History or
    // Review aggregates. Avoid pulling every persisted attempt/session back
    // into the UI at this latency-sensitive boundary.
    internalRunManagement.refresh();
  }

  function injectTestMateIn2FocusedRun(): void {
    if (!injectMateIn2FocusedRun) {
      return;
    }
    setError(null);
    try {
      adoptStartedSprint(injectMateIn2FocusedRun(captureLiveNowIso()));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function seedTestTacticalHistory(scenario: SimulatedHistoryScenarioId): void {
    if (!seedTacticalHistory || isActive || seedingHistoryRef.current) {
      return;
    }
    if (simulationProfile?.active) {
      // Simulation data is disposable: a scenario replaces it without asking.
      // The platform reopens on a fresh simulation database, then seeds it.
      runSimulationProfileAction(() => simulationProfile.replaceWithSeed(scenario));
      return;
    }
    runTestTacticalHistorySeed(scenario);
  }

  function runSimulationProfileAction(action: () => void): void {
    setError(null);
    try {
      action();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  useEffect(() => {
    const pendingSeed = simulationProfile?.takePendingSeed();
    if (pendingSeed !== undefined) {
      runTestTacticalHistorySeed(pendingSeed);
    }
    // Once per mount: the request is consumed from device storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runTestTacticalHistorySeed(scenario: SimulatedHistoryScenarioId): void {
    if (!seedTacticalHistory || seedingHistoryRef.current) {
      return;
    }
    seedingHistoryRef.current = true;
    setError(null);
    const label = SIMULATED_HISTORY_SCENARIOS.find((option) => option.scenario === scenario)?.label
      ?? scenario;
    void seedTacticalHistory(scenario, captureLiveNowIso(), (completedRuns, totalRuns) => {
      setSeededHistoryStatus(`Seeding ${label}… ${completedRuns} / ${totalRuns} Runs`);
    })
      .then((seeded) => {
        setICloudSyncEnabled(false);
        setICloudSyncStatus("Off");
        refreshState();
        setSeededHistoryStatus(
          `Seeded ${seeded.runs} Runs in ${(seeded.durationMs / 1_000).toFixed(1)} s · Profile ${seeded.phase}`
        );
      })
      .catch((caught: unknown) => {
        refreshState();
        setSeededHistoryStatus(null);
        setError(errorMessage(caught));
      })
      .finally(() => {
        seedingHistoryRef.current = false;
      });
  }

  function changePuzzleSource(nextSource: MobilePuzzleSource): void {
    if (isActive || !configurePuzzleSource) {
      return;
    }
    if (nextSource === puzzleSource) {
      return;
    }
    configurePuzzleSource(nextSource);
    refreshState();
    setPuzzleSource(nextSource);
    setError(null);
  }

  function abandonSprint(): void {
    if (!state || (state.status !== "active" && state.status !== "paused")) {
      return;
    }
    try {
      const abandoned = service.abandonSprint(nowIso());
      commitState(abandoned.state);
      setUnclearPrompt(incompleteUnclearPromptFor(abandoned.attempt));
      setResumableSprint(null);
      setFeedback(null);
      setFeedbackPuzzleId(null);
      clearFeedbackSnapshot();
      commitBoardInputLocked(false, "abandon", null);
      commitBoardFen(null);
      setLastBoardMove(null);
      refreshState();
    } catch {
      // no-op; abandon is safe fallback
    }
  }

  function pauseActiveSprint(reason: string): void {
    const activeState = stateRef.current;
    if (activeState?.status !== "active") {
      return;
    }
    try {
      const paused = service.pauseSprint(captureLiveNowIso());
      commitState(paused.state);
      setUnclearPrompt(incompleteUnclearPromptFor(paused.attempt));
      commitBoardInputLocked(
        true,
        `pause-${reason}`,
        paused.state.currentPuzzle?.puzzle.id ?? null
      );
      clearFeedbackSnapshot();
      setFeedback(null);
      setFeedbackPuzzleId(null);
      refreshState();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function pausePersonalBestChallenge(): void {
    const activeState = stateRef.current;
    if (activeState?.status === "active") {
      if (activeState.config.survival && !personalBestChallengeDesignPreview) {
        pauseActiveSprint("survival");
        return;
      }
      try {
        const paused = pauseSprintState(activeState, captureLiveNowIso()).state;
        commitState(paused);
        commitBoardInputLocked(
          true,
          "pause-survival",
          paused.currentPuzzle?.puzzle.id ?? null
        );
        clearFeedbackSnapshot();
        setFeedback(null);
        setFeedbackPuzzleId(null);
        refreshState();
      } catch (caught) {
        setError(errorMessage(caught));
        return;
      }
    }
  }

  function closePersonalBestGuide(): void {
    const returnsToHub = personalBestGuideIntent === "learn-hub";
    setPersonalBestGuideIntent(null);
    setPersonalBestGuideOpponentReplyEnabled(null);
    if (returnsToHub) {
      setPersonalBestHubVisible(true);
    }
  }

  function acknowledgePersonalBestGuide(): void {
    const opensHub = personalBestGuideIntent === "first-entry";
    try {
      if (!personalBestChallengeDesignPreview) {
        service.markSurvivalGuideSeen();
      } else if (opensHub) {
        setPersonalBestFirstEntryGuideAcknowledged(true);
      }
      closePersonalBestGuide();
      if (opensHub) {
        setPersonalBestHubVisible(true);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function resumePersonalBestChallenge(nextSprint: SprintState): void {
    if (nextSprint.status !== "paused") {
      setPracticeExitConfirmationVisible(false);
      return;
    }
    try {
      const resumed = nextSprint.config.survival && !personalBestChallengeDesignPreview
        ? service.resumeSprint(captureLiveNowIso())
        : resumeSprintState(nextSprint, captureLiveNowIso());
      commitState(resumed);
      commitBoardFen(resumed.currentPuzzle?.currentFen ?? null);
      commitBoardInputLocked(false, "resume-survival", resumed.currentPuzzle?.puzzle.id ?? null);
      setPracticeExitConfirmationVisible(false);
      refreshState();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function leavePersonalBestPaused(): void {
    try {
      if (stateRef.current?.config.survival && !personalBestChallengeDesignPreview) {
        service.leavePausedSurvival();
      }
      setPracticeExitConfirmationVisible(false);
      resetToIdle();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function selectPersonalBestPausedRun(run: PersonalBestPausedRunPresentation): void {
    const sourceId = personalBestPresentation?.selectedReferenceRunIds?.[run.challengeType];
    const source = personalBestPresentation?.referenceRuns?.find((candidate) => (
      candidate.challengeType === run.challengeType && candidate.id === sourceId
    ));
    setPersonalBestSelectedSetup({
      band: { minRating: run.minRating, maxRating: run.maxRating },
      bestScore: Math.max(run.score, personalBestPresentation?.levelRecords?.find((record) => (
        record.challengeType === run.challengeType
        && record.minRating === run.minRating
        && record.maxRating === run.maxRating
      ))?.score ?? -1),
      challengeType: run.challengeType,
      sourceId: source?.id ?? sourceId ?? "standard",
      sourceRating: source?.rating ?? run.minRating
    });
  }

  function continuePersonalBestRun(run: PersonalBestPausedRunPresentation): void {
    try {
      const nextState = run.resumeState
        ?? service.resumeSurvival(run.id, captureLiveNowIso());
      selectPersonalBestPausedRun(run);
      setPersonalBestSourcePickerVisible(false);
      setPersonalBestHubVisible(false);
      setMode(nextState.config.mode);
      commitState(nextState);
      commitBoardFen(nextState.currentPuzzle?.currentFen ?? null);
      commitBoardInputLocked(false, "resume-survival-run", nextState.currentPuzzle?.puzzle.id ?? null);
      setFeedback(null);
      setFeedbackPuzzleId(null);
      clearFeedbackSnapshot();
      refreshState();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function startPersonalBestChallenge(
    selection?: PersonalBestChallengeSelection | null
  ): void {
    if (!personalBestPresentation) {
      return;
    }
    const challengeType = personalBestPresentation.challengeType ?? "puzzle";
    const selectedSourceId = personalBestPresentation.selectedReferenceRunIds?.[challengeType]
      ?? (challengeType === "arrow_duel" ? "arrow-duel" : "standard");
    const selectedSource = personalBestPresentation.referenceRuns?.find((source) => (
      source.challengeType === challengeType && source.id === selectedSourceId
    ));
    const effectiveSelection = selection ?? personalBestSelectedSetup ?? {
      band: {
        minRating: personalBestPresentation.band.minRating,
        maxRating: personalBestPresentation.band.maxRating
      },
      bestScore: personalBestPresentation.bestScore,
      challengeType,
      sourceId: selectedSourceId,
      sourceRating: selectedSource?.rating ?? personalBestPresentation.band.currentRating
    };
    try {
      if (!personalBestChallengeDesignPreview) {
        service.markSurvivalGuideSeen();
      }
      const startState = personalBestChallengeDesignPreview
        ? basePersonalBestPresentation.startStates?.[effectiveSelection.challengeType]
          ?? basePersonalBestPresentation.startState
        : service.startSurvival({
            challengeType: effectiveSelection.challengeType,
            level: survivalSelectionLevel(effectiveSelection),
            ratingSourceRunId: effectiveSelection.sourceId
          }, captureLiveNowIso());
      if (!startState) {
        return;
      }
      setPersonalBestSelectedSetup(effectiveSelection);
      setPersonalBestGuideIntent(null);
      setPersonalBestGuideOpponentReplyEnabled(null);
      setPersonalBestHubVisible(false);
      setMode(startState.config.mode);
      commitState(startState);
      commitBoardFen(startState.currentPuzzle?.currentFen ?? null);
      commitBoardInputLocked(false, "start-survival", startState.currentPuzzle?.puzzle.id ?? null);
      setFeedback(null);
      setFeedbackPuzzleId(null);
      clearFeedbackSnapshot();
      refreshState();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function onBoardMove(result: MoveResult, context: BoardMoveContext): Promise<void> {
    const activeState = stateRef.current;
    const activeFeedbackSnapshot = feedbackSnapshotRef.current;
    if (activeState?.status !== "active") {
      emitTrace({
        type: "move-ignored",
        reason: "inactive",
        contextPuzzleId: context.puzzleId
      });
      return;
    }
    const move = formatUci(result.move);
    if (activeFeedbackSnapshot) {
      resetBoardToFen(activeFeedbackSnapshot.boardFen, "feedback-snapshot", activeFeedbackSnapshot.puzzleId, move);
      emitTrace({
        type: "move-ignored",
        reason: "feedback-snapshot",
        contextPuzzleId: context.puzzleId,
        puzzleId: activeState.currentPuzzle?.puzzle.id ?? null
      });
      return;
    }

    if (!move) {
      emitTrace({
        type: "move-ignored",
        reason: "empty-move",
        contextPuzzleId: context.puzzleId,
        puzzleId: activeState.currentPuzzle?.puzzle.id ?? null
      });
      return;
    }
    if (consumeSuppressedBoardMove(move, suppressedBoardMovesRef.current)) {
      emitTrace({
        type: "move-ignored",
        reason: "suppressed-auto-move",
        move,
        contextPuzzleId: context.puzzleId,
        puzzleId: activeState.currentPuzzle?.puzzle.id ?? null
      });
      return;
    }
    if (boardSyncInProgressRef.current || boardInputLockedRef.current || puzzleEntryPreviewLockedRef.current) {
      if (queuePremoveIfOpen(move, result, context)) {
        return;
      }
      resetBoardToFen(
        boardVisualFenRef.current ?? activeState.currentPuzzle?.currentFen,
        "board-locked",
        activeState.currentPuzzle?.puzzle.id ?? null,
        move
      );
      emitTrace({
        type: "move-ignored",
        reason: "board-locked",
        move,
        contextPuzzleId: context.puzzleId,
        puzzleId: activeState.currentPuzzle?.puzzle.id ?? null
      });
      return;
    }
    setLastBoardMove(null);

    const submittedPuzzleId = activeState.currentPuzzle?.puzzle.id ?? null;
    if (context.puzzleId !== submittedPuzzleId) {
      emitTrace({
        type: "move-ignored",
        reason: "context-puzzle-mismatch",
        move,
        contextPuzzleId: context.puzzleId,
        puzzleId: submittedPuzzleId
      });
      return;
    }
    const submittedPuzzle = activeState.currentPuzzle;
    if (
      arrowDuelReplyChallengePreviewVisible
      && submittedPuzzle?.kind === "arrow_duel"
      && arrowDuelReplyChallengeDesign?.resolveMove
    ) {
      try {
        const transition = arrowDuelReplyChallengeDesign.resolveMove({
          boardFen: boardFenRef.current,
          move,
          phase: arrowDuelReplyChallengePhase,
          puzzle: submittedPuzzle,
          resultFen: result.state?.fen ?? null
        });
        if (arrowDuelReplyChallengePhase === "choice" && transition.phase === "reply") {
          await stageArrowDuelReplyPreviewHandoff(
            transition,
            submittedPuzzle,
            submittedPuzzle.puzzle.id,
            move
          );
          const replyStartedAtMs = currentTimeMs();
          const puzzleStartedAtMs = stateRef.current?.currentPuzzleStartedAt
            ? new Date(stateRef.current.currentPuzzleStartedAt).getTime()
            : replyStartedAtMs;
          arrowDuelReplyPuzzleElapsedSecondsRef.current = Math.max(
            0,
            Math.floor((replyStartedAtMs - puzzleStartedAtMs) / 1000)
          );
        } else {
          applyArrowDuelReplyPreviewTransition(
            transition,
            submittedPuzzle,
            submittedPuzzle.puzzle.id,
            move
          );
        }
      } catch (caught) {
        commitBoardInputLocked(
          false,
          "arrow-duel-reply-preview-result-error",
          submittedPuzzleId
        );
        setError(errorMessage(caught));
      }
      return;
    }
    const submittedFen = submittedPuzzle?.currentFen ?? boardFenRef.current ?? null;
    if (
      submittedPuzzle?.kind === "arrow_duel" &&
      submittedPuzzle.phase === "choice" &&
      !isArrowDuelCandidate(submittedPuzzle.candidates, move)
    ) {
      if (submittedFen) {
        boardRef.current?.resetBoard(submittedFen);
        commitBoardFen(submittedFen);
      }
      setFeedback(null);
      setFeedbackPuzzleId(null);
      emitTrace({
        type: "move-ignored",
        reason: "arrow-duel-non-candidate",
        move,
        contextPuzzleId: context.puzzleId,
        puzzleId: submittedPuzzleId,
        submittedFen
      });
      return;
    }
    const submittedMoveFen = submittedFen ? fenAfterMove(submittedFen, move) : null;
    if (submittedFen && !submittedMoveFen) {
      if (submittedFen) {
        boardRef.current?.resetBoard(submittedFen);
        commitBoardFen(submittedFen);
      }
      setFeedback(null);
      setFeedbackPuzzleId(null);
      emitTrace({
        type: "move-ignored",
        reason: "submitted-move-illegal-for-current-fen",
        move,
        puzzleId: submittedPuzzleId,
        submittedFen
      });
      return;
    }
    if (!moveResultMatchesExpectedFen(result, submittedMoveFen)) {
      emitTrace({
        type: "fen-mismatch",
        move,
        puzzleId: submittedPuzzleId,
        expectedFen: submittedMoveFen,
        resultFen: result.state?.fen ?? null,
        submittedFen
      });
      boardRef.current?.resetBoard(submittedMoveFen ?? submittedFen ?? undefined);
    }

    boardVisualFenRef.current = submittedMoveFen ?? result.state?.fen ?? submittedFen;
    commitBoardInputLocked(true, "user-move", submittedPuzzleId);
    await submitAcceptedMove({
      move,
      nextVisualFen: submittedMoveFen,
      submittedFen,
      submittedPuzzle,
      submittedPuzzleId
    });
  }

  async function waitForArrowDuelReplyPreparation(cue: {
    confirmationRequired: boolean;
    holdMs: number | null;
  }): Promise<void> {
    setArrowDuelReplyPromptPhase("reply");
    setArrowDuelReplyPreparationAcknowledged(false);
    try {
      if (cue.confirmationRequired) {
        await new Promise<void>((resolve) => {
          arrowDuelReplyPreparationContinueRef.current = resolve;
        });
        return;
      }
      await sleep(cue.holdMs ?? ARROW_DUEL_REPLY_PREPARATION_MS);
    } finally {
      arrowDuelReplyPreparationContinueRef.current = null;
    }
  }

  async function stageArrowDuelReplyPreviewHandoff(
    transition: ArrowDuelReplyChallengePreviewTransition,
    submittedPuzzle: ArrowDuelState,
    submittedPuzzleId: string,
    submittedMove: string
  ): Promise<void> {
    const opponentMoves = (transition.feedbackMoves ?? [])
      .filter((feedbackMove) => feedbackMove.actor === "opponent")
      .map((feedbackMove) => feedbackMove.move);
    const submittedMoveFen = fenAfterMove(submittedPuzzle.currentFen, submittedMove);
    boardSyncInProgressRef.current = true;
    const handoffLockRevision = commitBoardInputLocked(
      true,
      "arrow-duel-reply-preview-handoff",
      submittedPuzzleId
    );
    playCommittedMoveFeedback("user", submittedMove, submittedPuzzle.currentFen);
    setFeedback({
      autoPlayedMoves: [],
      currentFen: submittedMoveFen ?? submittedPuzzle.currentFen,
      expectedMove: submittedPuzzle.correctMove,
      puzzleSolved: false,
      result: "correct",
      submittedMove
    });
    setFeedbackPuzzleId(submittedPuzzleId);
    try {
      await sleep(ARROW_DUEL_CORRECT_CHOICE_FEEDBACK_MS);
      setFeedback(null);
      setFeedbackPuzzleId(null);
      setArrowDuelWhatIfVisible(true);
      const submittedChoice = arrowFromTo(submittedMove);
      resetBoardToFen(
        submittedPuzzle.currentFen,
        transition.resetReason ?? "arrow-duel-reply-preview-handoff",
        submittedPuzzleId,
        submittedMove,
        submittedChoice
          ? {
              durationMs: ARROW_DUEL_UNDO_ANIMATION_MS,
              from: submittedChoice.to,
              to: submittedChoice.from
            }
          : null
      );
      commitBoardFen(submittedPuzzle.currentFen);
      await waitForArrowDuelReplyPreparation({
        confirmationRequired: sprintRulesDesignPreview?.arrowDuelReplyChallenge
          ?.preparationConfirmationRequired === true,
        holdMs: sprintRulesDesignPreview?.arrowDuelReplyChallenge?.preparationHoldMs
          ?? ARROW_DUEL_REPLY_PREPARATION_MS
      });
      await animateBoardMoves(opponentMoves, transition.boardFen ?? null);
      if (transition.lastMove !== undefined) {
        setLastBoardMove(transition.lastMove ? arrowFromTo(transition.lastMove) : null);
      }
      setArrowDuelReplyChallengePhase("reply");
      setArrowDuelWhatIfVisible(false);
    } finally {
      setArrowDuelWhatIfVisible(false);
      boardSyncInProgressRef.current = false;
      if (boardInputLockRevisionRef.current === handoffLockRevision) {
        commitBoardInputLocked(
          false,
          "arrow-duel-reply-preview-handoff-complete",
          submittedPuzzleId
        );
      }
    }
  }

  function applyArrowDuelReplyPreviewTransition(
    transition: ArrowDuelReplyChallengePreviewTransition,
    submittedPuzzle: ArrowDuelState,
    submittedPuzzleId: string,
    submittedMove: string
  ): void {
    for (const feedbackMove of transition.feedbackMoves ?? []) {
      playCommittedMoveFeedback(
        feedbackMove.actor,
        feedbackMove.move,
        feedbackMove.preMoveFen
      );
    }
    if (transition.boardAction === "reset") {
      resetBoardToFen(
        transition.boardFen,
        transition.resetReason ?? "arrow-duel-reply-preview",
        submittedPuzzleId,
        submittedMove
      );
      commitBoardFen(transition.boardFen ?? null);
    } else if (transition.boardAction === "commit") {
      commitBoardFen(transition.boardFen ?? null);
    }
    if (transition.lastMove !== undefined) {
      setLastBoardMove(transition.lastMove ? arrowFromTo(transition.lastMove) : null);
    }
    setArrowDuelReplyChallengePhase(transition.phase);
    setArrowDuelReplyPromptPhase(transition.phase);

    const completion = transition.completion;
    if (!completion) {
      return;
    }
    commitBoardInputLocked(true, "arrow-duel-reply-preview-result", submittedPuzzleId);
    commitState(completion.nextState);
    if (completion.result === "timed_out") {
      setFeedback(null);
      setFeedbackPuzzleId(null);
      showTimeoutSnapshot(
        completion.nextState,
        submittedPuzzle,
        completion.submittedFen,
        completion.puzzleElapsedSeconds ?? 0
      );
      return;
    }

    const previewFeedback = completion.feedback
      ? {
          ...completion.feedback,
          currentFen: completion.submittedMoveFen ?? completion.submittedFen,
          expectedMove: completion.expectedMove,
          puzzleSolved: completion.result === "correct",
          result: completion.result,
          submittedMove: completion.submittedMove ?? submittedPuzzle.wrongMove
        }
      : null;
    setFeedback(previewFeedback);
    setFeedbackPuzzleId(submittedPuzzleId);
    syncFeedbackSnapshot(
      completion.nextState,
      previewFeedback,
      submittedPuzzle,
      completion.submittedFen,
      submittedPuzzleId
    );
    boardVisualFenRef.current = completion.submittedMoveFen;
    syncBoardAfterMove(completion.nextState, previewFeedback, submittedPuzzleId);
  }

  async function submitAcceptedMove({
    move,
    nextVisualFen,
    submittedFen,
    submittedPuzzle,
    submittedPuzzleId
  }: {
    move: string;
    nextVisualFen: string | null;
    submittedFen: string | null;
    submittedPuzzle: CurrentPuzzleState | undefined;
    submittedPuzzleId: string | null;
  }): Promise<void> {
    try {
      const next = service.submitMove(move, captureLiveNowIso());
      playCommittedMoveFeedback("user", move, submittedFen);
      const nextFeedback = (next.feedback as SessionFeedback) ?? null;
      const nextPreviousAttemptNotice =
        submittedPuzzle?.kind === "arrow_duel" &&
        stateRef.current?.config.opponentReply?.enabled
          ? null
          : previousAttemptNoticeFor(
              next.attempt,
              next.state.status
            );
      setPreviousAttemptNotice(nextPreviousAttemptNotice);
      if (next.attempt) {
        setUnclearPrompt(incompleteUnclearPromptFor(next.attempt) ?? (
          !nextPreviousAttemptNotice
            && isUnclearAttemptEligible(next.attempt)
            && !next.attempt.unclear
            ? {
                attemptId: next.attempt.id,
                marked: Boolean(next.attempt.unclear),
                puzzleId: next.attempt.puzzleId,
                question: "Was it clear why the last correct move worked?"
              }
            : null
        ));
      }
      commitState(next.state);
      setFeedback(nextFeedback);
      setFeedbackPuzzleId(submittedPuzzleId);
      emitTrace({
        type: "move-submitted",
        move,
        puzzleId: submittedPuzzleId,
        nextPuzzleId: next.state.currentPuzzle?.puzzle.id ?? null,
        feedbackResult: nextFeedback?.result,
        puzzleSolved: nextFeedback?.puzzleSolved,
        samePuzzle: next.state.currentPuzzle?.puzzle.id === submittedPuzzleId,
        submittedFen
      });
      if (
        next.attempt?.result === "timed_out" &&
        submittedPuzzle &&
        submittedFen &&
        shouldShowTimeoutSnapshot(next.state, submittedPuzzleId)
      ) {
        puzzleTimeoutInFlightRef.current = submittedPuzzleId;
        resetBoardToFen(
          submittedFen,
          "puzzle-timeout-late-move",
          submittedPuzzleId,
          move
        );
        commitBoardFen(submittedFen);
        boardVisualFenRef.current = submittedFen;
        setFeedback(null);
        setFeedbackPuzzleId(null);
        showTimeoutSnapshot(
          next.state,
          submittedPuzzle,
          submittedFen,
          Math.floor((next.attempt.elapsedMs ?? 0) / 1000)
        );
        if (next.state.status !== "active") {
          refreshState();
        }
        return;
      }
      if (shouldAnimateSamePuzzleReply(next.state, nextFeedback, submittedPuzzleId)) {
        commitBoardFen(nextVisualFen);
        await animateSamePuzzleReply(
          next.state,
          nextFeedback,
          submittedFen,
          nextFeedback?.submittedMove ?? null
        );
        return;
      }
      syncFeedbackSnapshot(next.state, nextFeedback, submittedPuzzle, submittedFen, submittedPuzzleId);
      boardVisualFenRef.current = nextVisualFen;
      syncBoardAfterMove(next.state, nextFeedback, submittedPuzzleId);
      // The submit result already contains every piece of live sprint UI state.
      // Rebuilding aggregate History/Review/Home snapshots after each move is
      // both redundant and O(total stored attempts); refresh them at the sprint
      // boundary instead.
      if (next.state.status !== "active") {
        refreshState();
      }
    } catch (caught) {
      setError(errorMessage(caught));
      boardSyncInProgressRef.current = false;
      commitBoardInputLocked(false, "submit-error", submittedPuzzleId);
    }
  }

  function onIllegalMove(from: Square, to: Square, context: BoardMoveContext): void {
    const activeState = stateRef.current;
    const move = `${from}${to}`;
    if (boardSyncInProgressRef.current || boardInputLockedRef.current || puzzleEntryPreviewLockedRef.current) {
      if (queuePremoveIfOpen(move, null, context)) {
        return;
      }
      const activePuzzle = activeState?.status === "active" ? activeState.currentPuzzle : undefined;
      resetBoardToFen(
        boardVisualFenRef.current ?? activePuzzle?.currentFen,
        "board-locked-illegal-move",
        activePuzzle?.puzzle.id ?? null,
        move
      );
      emitTrace({
        type: "move-ignored",
        reason: "board-locked-illegal-move",
        move,
        contextPuzzleId: context.puzzleId,
        puzzleId: activePuzzle?.puzzle.id ?? null,
        submittedFen: boardVisualFenRef.current ?? activePuzzle?.currentFen ?? null
      });
      return;
    }

    const activePuzzle = activeState?.currentPuzzle;
    if (!activePuzzle) {
      return;
    }
    if (context.puzzleId !== activePuzzle.puzzle.id) {
      emitTrace({
        type: "move-ignored",
        reason: "illegal-move-context-puzzle-mismatch",
        move,
        contextPuzzleId: context.puzzleId,
        puzzleId: activePuzzle.puzzle.id
      });
      return;
    }
    setLastBoardMove(null);
    setFeedback(null);
    setFeedbackPuzzleId(null);
    boardRef.current?.resetBoard(activePuzzle.currentFen);
    commitBoardFen(activePuzzle.currentFen);
    emitTrace({
      type: "illegal-move",
      move,
      puzzleId: activePuzzle.puzzle.id,
      submittedFen: activePuzzle.currentFen
    });
  }

  function resetToIdle(): void {
    commitState(null);
    setResumableSprint(null);
    setSessionReplayItems([]);
    setFeedback(null);
    setFeedbackPuzzleId(null);
    setUnclearPrompt(null);
    setPreviousAttemptNotice(null);
    clearFeedbackSnapshot();
    setError(null);
    pendingPremoveRef.current = null;
    commitBoardInputLocked(false, "reset", null);
    commitBoardFen(null);
    setLastBoardMove(null);
    refreshState();
  }

  function resumeSprint(nextSprint: SprintState): void {
    setError(null);
    try {
      let resumed = nextSprint.status === "paused" && service.getActiveSprint()?.id === nextSprint.id
        ? service.resumeSprint(captureLiveNowIso())
        : nextSprint;
      const arrowDuelReplyHandoffStillAnimating =
        resumed.status === "active" &&
        resumed.currentPuzzle?.kind === "arrow_duel" &&
        resumed.currentPuzzle.phase === "reply_handoff" &&
        boardSyncInProgressRef.current;
      if (
        resumed.status === "active" &&
        resumed.currentPuzzle?.kind === "arrow_duel" &&
        resumed.currentPuzzle.phase === "reply_handoff" &&
        !arrowDuelReplyHandoffStillAnimating
      ) {
        resumed = service.beginArrowDuelReply(captureLiveNowIso());
      }
      setMode(resumed.config.mode);
      setSessionReplayItems([]);
      commitState(resumed);
      setResumableSprint(null);
      commitBoardFen(resumed.currentPuzzle?.currentFen ?? null);
      setLastBoardMove(null);
      setFeedback(null);
      setFeedbackPuzzleId(null);
      setPreviousAttemptNotice(null);
      clearFeedbackSnapshot();
      commitBoardInputLocked(
        arrowDuelReplyHandoffStillAnimating,
        arrowDuelReplyHandoffStillAnimating
          ? "resume-awaiting-arrow-duel-reply-handoff"
          : "resume",
        resumed.currentPuzzle?.puzzle.id ?? null
      );
      navigateToTab("practice");
      refreshState();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function showSessionReplay(scope: "all" | "mistakes" = "all"): void {
    const sessionId = stateRef.current?.id;
    const allReplayItems: SessionReplayItem[] =
      sprintRulesDesignPreview?.resultReplayItems
        ? [...sprintRulesDesignPreview.resultReplayItems]
        : sessionId ? service.getSessionReplay(sessionId) : [];
    const replayItems = scope === "mistakes"
      ? selectMistakeReplayItems(allReplayItems)
      : allReplayItems;
    resetToIdle();
    setSessionReplayItems(replayItems);
    navigateToTab("review");
  }

  function clearSessionReplayUnclear(attemptId: string): AttemptEvent | null {
    const currentItem = sessionReplayItems.find((item) => item.attempt.id === attemptId);
    if (!currentItem) {
      return null;
    }
    const updatedAt = new Date(currentTimeMs()).toISOString();
    try {
      const storedAttempt = service.getHistoryAttempt(attemptId);
      const updatedAttempt = storedAttempt
        ? withAttemptClarity(
            currentItem.attempt,
            service.setAttemptUnclear(attemptId, false, updatedAt)
          )
        : withAttemptClarity(currentItem.attempt, {
            unclear: false,
            unclearUpdatedAt: updatedAt
          });
      setSessionReplayItems((items) => items.map((item) => (
        item.attempt.id === attemptId
          ? { ...item, attempt: updatedAttempt }
          : item
      )));
      if (storedAttempt) {
        refreshState();
      }
      return updatedAttempt;
    } catch (caught) {
      setError(errorMessage(caught));
      return null;
    }
  }

  function openReviewQueue(): void {
    setSessionReplayItems([]);
    navigateToTab("review");
  }

  function exitSessionReview(): void {
    setSessionReplayItems([]);
    navigateToTab("practice");
  }

  function openHistoryReview(attemptId: string): void {
    // Computed on demand: the unpaged review view scans the full attempt history,
    // which is too expensive to rebuild on every render.
    const historyReviewView = service.getHistoryView(historyQuery(nowIso()));
    const historyReviewAttempts = historyReviewView.attempts;
    const selectedAttempt = historyReviewAttempts.find((attempt) => attempt.id === attemptId);
    if (!selectedAttempt) {
      return;
    }
    const selectedPuzzle = service.getPuzzle(selectedAttempt.puzzleId);
    const selectedReplayAvailability = historyAttemptReplayAvailability({
      attempt: selectedAttempt,
      puzzle: selectedPuzzle
    });
    if (selectedReplayAvailability.status === "unavailable") {
      setHistoryReviewEntries([]);
      setHistoryUnavailableAttempt({
        attempt: selectedAttempt,
        replayAvailability: selectedReplayAvailability
      });
      return;
    }
    const entries = historyReviewAttempts
      .map((attempt): ReviewEntry | null => {
        const puzzle = service.getPuzzle(attempt.puzzleId);
        const replayAvailability = puzzle
          ? historyAttemptReplayAvailability({ attempt, puzzle })
          : { status: "unavailable" as const, reason: "puzzle-unavailable" as const };
        return puzzle && replayAvailability.status === "available"
          ? buildServiceReviewEntry(service, {
              puzzle,
              mode: replayAvailability.mode,
              ratingKey: replayAvailability.ratingKey,
              source: "history",
              attempt
            })
          : null;
      })
      .filter((entry): entry is ReviewEntry => Boolean(entry));
    const nextIndex = Math.max(0, entries.findIndex((entry) => entry.attempt?.id === attemptId));
    if (entries.length === 0) {
      return;
    }
    setHistoryUnavailableAttempt(null);
    setHistoryReviewEntries(entries);
    setHistoryReviewInitialIndex(nextIndex);
  }

  function toggleUnclearPrompt(): void {
    if (!unclearPrompt) {
      return;
    }
    if (unclearPrompt.attemptId === SPRINT_RULES_PREVIEW_UNCLEAR_ATTEMPT_ID) {
      setUnclearPrompt((current) => current
        ? { ...current, marked: !current.marked }
        : current);
      return;
    }
    try {
      const updated = service.setAttemptUnclear(
        unclearPrompt.attemptId,
        !unclearPrompt.marked,
        new Date(currentTimeMs()).toISOString()
      );
      setUnclearPrompt((current) => current?.attemptId === updated.id
        ? { ...current, marked: Boolean(updated.unclear) }
        : current);
      refreshState();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function clearHistoryAttemptUnclear(attemptId: string): void {
    try {
      const updated = service.setAttemptUnclear(attemptId, false, new Date(currentTimeMs()).toISOString());
      setHistoryReviewEntries((entries) => entries.map((entry) => entry.attempt?.id === attemptId
        ? { ...entry, attempt: withAttemptClarity(entry.attempt, updated) }
        : entry));
      setHistoryUnavailableAttempt((current) => current?.attempt.id === attemptId
        ? { ...current, attempt: withAttemptClarity(current.attempt, updated) }
        : current);
      refreshState();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function reviewScheduleChanged(clearedAttemptId?: string): void {
    if (clearedAttemptId) {
      const updated = service.getHistoryAttempt(clearedAttemptId);
      if (updated) {
        setHistoryReviewEntries((entries) => entries.map((entry) => entry.attempt?.id === clearedAttemptId
          ? { ...entry, attempt: withAttemptClarity(entry.attempt, updated) }
          : entry));
        setHistoryUnavailableAttempt((current) => current?.attempt.id === clearedAttemptId
          ? { ...current, attempt: withAttemptClarity(current.attempt, updated) }
          : current);
      }
    }
    refreshState();
  }

  function syncBoardAfterMove(
    nextState: SprintState,
    nextFeedback: SessionFeedback,
    submittedPuzzleId: string | null,
    alreadyAnimated = false
  ): void {
    const nextPuzzle = nextState.currentPuzzle;
    const nextFen = nextPuzzle?.currentFen ?? null;
    const samePuzzle = nextPuzzle?.puzzle.id === submittedPuzzleId;
    const autoMoves = nextFeedback?.autoPlayedMoves ?? [];

    if (alreadyAnimated) {
      return;
    }

    if (nextState.status === "active" && samePuzzle && autoMoves.length > 0) {
      void animateBoardMoves(autoMoves, nextFen);
      return;
    }

    commitBoardFen(nextFen);
    setLastBoardMove(null);
  }

  function shouldAnimateSamePuzzleReply(
    nextState: SprintState,
    nextFeedback: SessionFeedback,
    submittedPuzzleId: string | null
  ): boolean {
    const nextPuzzle = nextState.currentPuzzle;
    const samePuzzle = nextState.status === "active" && nextPuzzle?.puzzle.id === submittedPuzzleId;
    const autoMoves = nextFeedback?.autoPlayedMoves ?? [];
    return samePuzzle && autoMoves.length > 0;
  }

  async function animateSamePuzzleReply(
    nextState: SprintState,
    nextFeedback: SessionFeedback,
    submittedFen: string | null,
    submittedMove: string | null
  ): Promise<void> {
    const nextFen = nextState.currentPuzzle?.currentFen ?? null;
    const autoMoves = nextFeedback?.autoPlayedMoves ?? [];
    const puzzleId = nextState.currentPuzzle?.puzzle.id ?? null;
    const isArrowDuelReplyHandoff =
      nextState.currentPuzzle?.kind === "arrow_duel" &&
      nextState.currentPuzzle.phase === "reply_handoff";
    let arrowDuelReplyBegan = false;
    boardSyncInProgressRef.current = true;
    const replyLockRevision = commitBoardInputLocked(
      true,
      "opponent-reply",
      puzzleId,
      isArrowDuelReplyHandoff ? "hard" : "premove"
    );
    try {
      try {
        await sleep(
          isArrowDuelReplyHandoff
            ? ARROW_DUEL_CORRECT_CHOICE_FEEDBACK_MS
            : USER_FEEDBACK_BEFORE_AUTO_MS
        );
        setFeedback(null);
        setFeedbackPuzzleId(null);
        if (isArrowDuelReplyHandoff && submittedFen) {
          setArrowDuelWhatIfVisible(true);
          const submittedChoice = submittedMove ? arrowFromTo(submittedMove) : null;
          resetBoardToFen(
            submittedFen,
            "arrow-duel-reply-handoff",
            puzzleId,
            submittedMove ?? undefined,
            submittedChoice
              ? {
                  durationMs: ARROW_DUEL_UNDO_ANIMATION_MS,
                  from: submittedChoice.to,
                  to: submittedChoice.from
                }
              : null
          );
          commitBoardFen(submittedFen);
        }
        if (isArrowDuelReplyHandoff) {
          const cuePresentation = sprintGuidanceEnabled
            ? arrowDuelReplyCuePresentationFor(service.getSettings().sprintGuides)
            : {
                confirmationRequired: false,
                holdMs: ARROW_DUEL_REPLY_PREPARATION_MS
              };
          await waitForArrowDuelReplyPreparation(cuePresentation);
        }
        await animateBoardMoves(autoMoves, nextFen);
        if (isArrowDuelReplyHandoff) {
          setArrowDuelWhatIfVisible(false);
        }
        const activeSprint = service.getActiveSprint();
        if (
          nextState.currentPuzzle?.kind === "arrow_duel" &&
          nextState.currentPuzzle.phase === "reply_handoff" &&
          activeSprint?.id === nextState.id &&
          activeSprint.status === "active" &&
          activeSprint.currentPuzzle?.kind === "arrow_duel" &&
          activeSprint.currentPuzzle.phase === "reply_handoff" &&
          activeSprint.currentPuzzle.puzzle.id === puzzleId
        ) {
          const replying = service.beginArrowDuelReply(captureLiveNowIso());
          arrowDuelReplyBegan = true;
          commitState(replying);
          setArrowDuelReplyChallengePhase("reply");
        }
      } finally {
        setArrowDuelWhatIfVisible(false);
        boardSyncInProgressRef.current = false;
        // A newer lock taken mid-animation (pause, app background) owns the
        // board until the session is active again. If a mid-animation resume
        // let this handoff start the reply, it also owns the matching unlock.
        // Starting the reply clock and releasing the hard lock therefore form
        // the single boundary where the player can first move.
        if (
          boardInputLockRevisionRef.current === replyLockRevision ||
          (isArrowDuelReplyHandoff && arrowDuelReplyBegan)
        ) {
          commitBoardInputLocked(false, "opponent-reply-complete", puzzleId);
        }
      }
      if (!boardInputLockedRef.current) {
        await replayQueuedPremove(puzzleId);
      }
    } finally {
      // Whatever interrupted the window (animation error, hard lock), no
      // stale intent may survive to replay against a later position.
      pendingPremoveRef.current = null;
    }
  }

  // During the opponent-reply animation the board stays interactive. A move
  // the user makes in that window is queued here and replayed as soon as the
  // reply settles, so fast play never gets swallowed. Only the latest playable
  // intent is kept, mirroring premove semantics; junk drags are swallowed
  // without evicting a queued premove.
  function queuePremoveIfOpen(move: string, result: MoveResult | null, context: BoardMoveContext): boolean {
    const activeState = stateRef.current;
    const isActive = activeState?.status === "active";
    const activePuzzleId = isActive ? activeState.currentPuzzle?.puzzle.id ?? null : null;
    const decision = decidePremoveQueue({
      lockMode: boardInputLockModeRef.current,
      activePuzzleId,
      contextPuzzleId: context.puzzleId,
      replyFen: isActive ? activeState.currentPuzzle?.currentFen ?? null : null,
      move,
      boardApplied: result !== null
    });
    if (decision.action === "not-open") {
      return false;
    }
    if (decision.action === "ignore") {
      emitTrace({
        type: "move-ignored",
        reason: "premove-illegal-intent",
        move,
        contextPuzzleId: context.puzzleId,
        puzzleId: activePuzzleId
      });
      return true;
    }
    pendingPremoveRef.current = { puzzleId: activePuzzleId as string, move: decision.move, result, context };
    emitTrace({
      type: "premove-queued",
      reason: result ? "board-applied" : "pending-board",
      move: decision.move,
      contextPuzzleId: context.puzzleId,
      puzzleId: activePuzzleId
    });
    return true;
  }

  async function replayQueuedPremove(puzzleId: string | null): Promise<void> {
    // A premove played through the board fires onMove while this function
    // re-holds the premove lock; that echo re-queues as a board-applied
    // intent which the next pass dispatches. The cap guards against a user
    // replacing the intent on every pass.
    for (let pass = 0; pass < 4; pass += 1) {
      const pending = pendingPremoveRef.current;
      pendingPremoveRef.current = null;
      const activeState = stateRef.current;
      const isActive = activeState?.status === "active";
      const replyFen = isActive ? activeState.currentPuzzle?.currentFen ?? null : null;
      const plan = planPremoveReplay({
        pending: pending
          ? { puzzleId: pending.puzzleId, move: pending.move, boardApplied: pending.result !== null }
          : null,
        activePuzzleId: isActive ? activeState.currentPuzzle?.puzzle.id ?? null : null,
        replyFen,
        boardFenNow: boardRef.current?.getState?.().fen ?? null
      });
      if (plan.action === "none") {
        return;
      }
      if (plan.action === "drop") {
        if (plan.reason === "not-legal" && plan.resetFen) {
          resetBoardToFen(plan.resetFen, "premove-not-legal", puzzleId, pending?.move);
          commitBoardFen(plan.resetFen);
        }
        emitTrace({
          type: "move-ignored",
          reason: plan.reason === "stale" ? "premove-stale" : "premove-not-legal",
          move: pending?.move,
          puzzleId
        });
        return;
      }
      emitTrace({
        type: "premove-replay",
        reason: plan.action === "dispatch-result" ? "board-applied" : "pending-board",
        move: pending?.move,
        puzzleId
      });
      if (plan.action === "dispatch-result" && pending?.result) {
        // The board accepted this move mid-animation, so its internal
        // position already includes it. The drop can race the reply
        // animation's square commits, so re-sync the sprites to the
        // post-premove position, and align the fen prop with it — the board
        // hard-resets whenever the fen prop changes, so leaving the reply
        // fen pending would rewind the premove at the next render. The
        // dispatch below re-enters the normal submit path synchronously, so
        // no gesture can slip in while the board is unlocked.
        resetBoardToFen(plan.appliedFen, "premove-replay", puzzleId, pending.move);
        commitBoardFen(plan.appliedFen);
        await onBoardMove(pending.result, pending.context);
        return;
      }
      if (plan.action !== "play") {
        return;
      }
      // The drop happened before the reply reached the board's internal
      // state, so the board never applied it. Play it through the board while
      // re-holding the premove lock — the replay animation must not leave the
      // board open to unlocked gesture handlers mid-flight.
      if (plan.resyncFen) {
        resetBoardToFen(plan.resyncFen, "premove-resync", puzzleId, plan.move);
      }
      if (plan.appliedFen) {
        // Align the fen prop with the post-premove position before the board
        // applies it, so the fen-change hard reset cannot rewind the replayed
        // move while its animation is still settling. appliedFen is null for
        // bare promotion intents, whose dialog collects the piece here.
        commitBoardFen(plan.appliedFen);
      }
      const boardMove = arrowFromTo(plan.move);
      let played: Move | undefined;
      boardSyncInProgressRef.current = true;
      commitBoardInputLocked(true, "premove-replay", puzzleId, "premove");
      try {
        played = boardMove
          ? await boardRef.current?.move({
            from: boardMove.from as Square,
            to: boardMove.to as Square,
            ...(boardMove.promotion ? { promotion: boardMove.promotion as PieceSymbol } : {})
          })
          : undefined;
      } finally {
        boardSyncInProgressRef.current = false;
        if (boardInputLockModeRef.current === "premove") {
          commitBoardInputLocked(false, "premove-replay-complete", puzzleId);
        }
      }
      if (!played) {
        resetBoardToFen(replyFen, "premove-not-legal", puzzleId, plan.move);
        commitBoardFen(replyFen);
        emitTrace({
          type: "move-ignored",
          reason: "premove-not-legal",
          move: plan.move,
          puzzleId
        });
        return;
      }
      if (boardInputLockedRef.current) {
        // A hard lock landed during the replay animation; its owner controls
        // the board now.
        return;
      }
      // The board applied the replayed move and its onMove echo queued a
      // board-applied intent (or the user replaced it); dispatch on the next
      // pass.
    }
    if (pendingPremoveRef.current) {
      emitTrace({
        type: "move-ignored",
        reason: "premove-replay-limit",
        move: pendingPremoveRef.current.move,
        puzzleId
      });
      pendingPremoveRef.current = null;
    }
  }

  function syncFeedbackSnapshot(
    nextState: SprintState,
    nextFeedback: SessionFeedback,
    submittedPuzzle: CurrentPuzzleState | undefined,
    submittedFen: string | null,
    submittedPuzzleId: string | null
  ): void {
    clearFeedbackSnapshotTimer();
    const nextPuzzle = nextState.currentPuzzle;
    const samePuzzle = nextPuzzle?.puzzle.id === submittedPuzzleId;
    if (!nextFeedback || !submittedPuzzle || !submittedFen || samePuzzle) {
      commitFeedbackSnapshot(null);
      commitBoardInputLocked(false, "feedback-snapshot-clear", nextPuzzle?.puzzle.id ?? null);
      emitTrace({
        type: "feedback-snapshot",
        reason: "clear",
        puzzleId: submittedPuzzleId,
        nextPuzzleId: nextPuzzle?.puzzle.id ?? null,
        samePuzzle
      });
      return;
    }

    commitFeedbackSnapshot({
      boardFen: submittedFen,
      currentPuzzle: submittedPuzzle,
      feedback: nextFeedback,
      kind: "feedback",
      puzzleId: submittedPuzzle.puzzle.id
    });
    emitTrace({
      type: "feedback-snapshot",
      reason: "show",
      move: nextFeedback.submittedMove,
      puzzleId: submittedPuzzle.puzzle.id,
      nextPuzzleId: nextPuzzle?.puzzle.id ?? null,
      feedbackResult: nextFeedback.result,
      puzzleSolved: nextFeedback.puzzleSolved,
      samePuzzle
    });
    feedbackSnapshotTimerRef.current = setTimeout(() => {
      const current = feedbackSnapshotRef.current;
      if (current?.puzzleId === submittedPuzzle.puzzle.id) {
        // The session board is keyed to the Sprint, not the puzzle, so it owns
        // one native chess instance across puzzle advances. Synchronize that
        // instance before revealing the next puzzle. Relying on the fen-prop
        // effect alone leaves the stable native board holding the submitted
        // position during the render that changes puzzle orientation/state.
        const completion = resetBoardToFen(
          puzzleEntryPreviewPlan(nextPuzzle)?.initialFen ?? nextPuzzle?.currentFen,
          "feedback-snapshot-complete",
          nextPuzzle?.puzzle.id ?? null,
          undefined,
          undefined,
          nextPuzzle ? shouldFlipBoard(nextPuzzle) : undefined
        );
        const revealNextPuzzle = (): void => {
          const activeSnapshot = feedbackSnapshotRef.current;
          if (activeSnapshot?.puzzleId !== submittedPuzzle.puzzle.id) {
            return;
          }
          commitFeedbackSnapshot(null);
          commitBoardInputLocked(false, "feedback-snapshot-complete", nextPuzzle?.puzzle.id ?? null);
        };
        if (completion) {
          void completion.then(revealNextPuzzle);
        } else {
          revealNextPuzzle();
        }
      }
      feedbackSnapshotTimerRef.current = null;
    }, FEEDBACK_SNAPSHOT_MS);
  }

  function showTimeoutSnapshot(
    nextState: SprintState,
    timedOutPuzzle: CurrentPuzzleState,
    timedOutFen: string,
    elapsedSeconds: number
  ): void {
    clearFeedbackSnapshotTimer();
    const nextPuzzle = nextState.currentPuzzle;
    commitFeedbackSnapshot({
      boardFen: timedOutFen,
      currentPuzzle: timedOutPuzzle,
      elapsedSeconds,
      feedback: null,
      kind: "timed_out",
      puzzleId: timedOutPuzzle.puzzle.id
    });
    emitTrace({
      type: "feedback-snapshot",
      reason: "puzzle-timeout-show",
      puzzleId: timedOutPuzzle.puzzle.id,
      nextPuzzleId: nextPuzzle?.puzzle.id ?? null
    });
    feedbackSnapshotTimerRef.current = setTimeout(() => {
      const current = feedbackSnapshotRef.current;
      if (current?.kind === "timed_out" && current.puzzleId === timedOutPuzzle.puzzle.id) {
        const completion = resetBoardToFen(
          puzzleEntryPreviewPlan(nextPuzzle)?.initialFen ?? nextPuzzle?.currentFen,
          "puzzle-timeout-complete",
          nextPuzzle?.puzzle.id ?? null,
          undefined,
          undefined,
          nextPuzzle ? shouldFlipBoard(nextPuzzle) : undefined
        );
        const revealNextPuzzle = (): void => {
          const activeSnapshot = feedbackSnapshotRef.current;
          if (
            activeSnapshot?.kind !== "timed_out"
            || activeSnapshot.puzzleId !== timedOutPuzzle.puzzle.id
          ) {
            return;
          }
          commitBoardFen(nextPuzzle?.currentFen ?? null);
          commitFeedbackSnapshot(null);
          puzzleTimeoutInFlightRef.current = null;
          commitBoardInputLocked(false, "puzzle-timeout-complete", nextPuzzle?.puzzle.id ?? null);
        };
        if (completion) {
          void completion.then(revealNextPuzzle);
        } else {
          revealNextPuzzle();
        }
      }
      feedbackSnapshotTimerRef.current = null;
    }, FEEDBACK_SNAPSHOT_MS);
  }

  function clearFeedbackSnapshot(): void {
    clearFeedbackSnapshotTimer();
    puzzleTimeoutInFlightRef.current = null;
    commitFeedbackSnapshot(null);
  }

  function clearFeedbackSnapshotTimer(): void {
    if (feedbackSnapshotTimerRef.current) {
      clearTimeout(feedbackSnapshotTimerRef.current);
      feedbackSnapshotTimerRef.current = null;
    }
  }

  async function animateBoardMoves(moves: string[], finalFen: string | null): Promise<void> {
    const parsedMoves = moves.map(arrowFromTo).filter((move): move is BoardMove => Boolean(move));
    if (!boardRef.current || parsedMoves.length === 0) {
      commitBoardFen(finalFen);
      setLastBoardMove(parsedMoves[parsedMoves.length - 1] ?? null);
      return;
    }

    for (const move of parsedMoves) {
      const suppressedMove = boardMoveToUci(move);
      const preMoveFen = boardRef.current.getState().fen;
      suppressedBoardMovesRef.current.push(suppressedMove);
      const playedMove = await boardRef.current.move({
        from: move.from as Square,
        to: move.to as Square,
        ...(move.promotion ? { promotion: move.promotion as PieceSymbol } : {})
      });
      if (!playedMove) {
        consumeSuppressedBoardMove(suppressedMove, suppressedBoardMovesRef.current);
        commitBoardFen(finalFen);
      } else {
        playCommittedMoveFeedback("opponent", suppressedMove, preMoveFen);
      }
      setLastBoardMove(move);
    }
    commitBoardFen(finalFen);
  }

  const currentPuzzle = state?.currentPuzzle;
  const arrowDuelReplyChallengeDesign =
    sprintRulesDesignPreview?.arrowDuelReplyChallenge;
  const arrowDuelOpponentReplyGlobalSettingDesign =
    sprintRulesDesignPreview?.arrowDuelOpponentReplyGlobalSetting;
  const opponentReplySettingsHint = isSurvivalState
    ? undefined
    : "Optional · Turn off in Settings";
  const arrowDuelReplyAutoTimeoutMs = arrowDuelReplyChallengeDesign?.autoTimeoutMs;
  const arrowDuelReplyChallengePreviewVisible = Boolean(
    arrowDuelReplyChallengeDesign?.enabled
      && arrowDuelReplyChallengeDesign.resolveMove
      && arrowDuelReplyChallengeEnabled
      && arrowDuelOpponentReplyGlobalEnabled
      && currentPuzzle?.kind === "arrow_duel"
  );
  const arrowDuelReplyChallengeProductionVisible = Boolean(
    !arrowDuelReplyChallengePreviewVisible &&
      state?.config.opponentReply?.enabled &&
      currentPuzzle?.kind === "arrow_duel"
  );
  const displayedArrowDuelPuzzle =
    feedbackSnapshot?.currentPuzzle.kind === "arrow_duel"
      ? feedbackSnapshot.currentPuzzle
      : currentPuzzle?.kind === "arrow_duel"
        ? currentPuzzle
        : undefined;
  const arrowDuelReplyChallengeVisible =
    arrowDuelReplyChallengePreviewVisible ||
    arrowDuelReplyChallengeProductionVisible;
  const arrowDuelReplyChallengeDisplayPhase: ArrowDuelReplyChallengePhase =
    arrowDuelReplyChallengePreviewVisible
      ? arrowDuelReplyPromptPhase
      : displayedArrowDuelPuzzle?.phase === "reply" || (
          displayedArrowDuelPuzzle?.phase === "reply_handoff" &&
          arrowDuelReplyPromptPhase === "reply"
        )
        ? "reply"
        : "choice";
  const arrowDuelReplyReady = arrowDuelReplyChallengePreviewVisible
    ? arrowDuelReplyChallengePhase === "reply"
    : displayedArrowDuelPuzzle?.phase === "reply";
  useEffect(() => {
    arrowDuelReplyPuzzleElapsedSecondsRef.current = 0;
    setArrowDuelReplyChallengePhase("choice");
    setArrowDuelReplyPromptPhase("choice");
    setArrowDuelWhatIfVisible(false);
    setArrowDuelReplyPreparationAcknowledged(false);
  }, [currentPuzzle?.puzzle.id]);
  arrowDuelReplyChallengeTimeoutHandlerRef.current = () => {
    const timeoutPuzzle = stateRef.current?.currentPuzzle;
    const resolveTimeout = sprintRulesDesignPreview?.arrowDuelReplyChallenge?.resolveTimeout;
    if (timeoutPuzzle?.kind !== "arrow_duel" || !resolveTimeout) {
      return;
    }
    try {
      applyArrowDuelReplyPreviewTransition(
        resolveTimeout({
          boardFen: boardFenRef.current,
          phase: arrowDuelReplyChallengePhase,
          puzzle: timeoutPuzzle,
          puzzleElapsedSeconds: arrowDuelReplyPuzzleElapsedSecondsRef.current
        }),
        timeoutPuzzle,
        timeoutPuzzle.puzzle.id,
        ""
      );
    } catch (caught) {
      commitBoardInputLocked(
        false,
        "arrow-duel-reply-preview-result-error",
        timeoutPuzzle.puzzle.id
      );
      setError(errorMessage(caught));
    }
  };
  useEffect(() => {
    if (
      !arrowDuelReplyChallengePreviewVisible
      || arrowDuelReplyChallengePhase !== "reply"
      || arrowDuelReplyAutoTimeoutMs === undefined
    ) {
      return undefined;
    }
    const timer = setTimeout(() => {
      arrowDuelReplyChallengeTimeoutHandlerRef.current();
    }, arrowDuelReplyAutoTimeoutMs);
    return () => clearTimeout(timer);
  }, [
    arrowDuelReplyAutoTimeoutMs,
    arrowDuelReplyChallengePhase,
    arrowDuelReplyChallengePreviewVisible
  ]);
  const opponentReplyPauseStartedAt =
    arrowDuelReplyChallengeProductionVisible &&
    currentPuzzle?.kind === "arrow_duel" &&
    currentPuzzle.phase !== "choice"
      ? currentPuzzle.replyPauseStartedAt
      : undefined;
  const effectiveSessionNowMs = opponentReplyPauseStartedAt
    ? new Date(opponentReplyPauseStartedAt).getTime()
    : state?.status === "paused" && state.pausedAt
      ? new Date(state.pausedAt).getTime()
      : nowMs;
  const sprintElapsedMs = state
    ? Math.max(
        0,
        effectiveSessionNowMs -
          new Date(state.startedAt).getTime() -
          (state.totalPausedMs ?? 0)
      )
    : 0;
  const remainingMs = state
    ? Math.max(0, new Date(state.deadlineAt).getTime() - effectiveSessionNowMs)
    : 0;
  // An untimed Focused Run has no Run deadline, so its clock counts up. It
  // keeps counting through an Arrow Duel reply, which only pauses countdowns.
  const isUntimedRun = state?.config.runClock === "untimed";
  const untimedRunElapsedMs = state && isUntimedRun
    ? Math.max(
        0,
        (state.completedAt
          ? new Date(state.completedAt).getTime()
          : state.status === "paused" && state.pausedAt
            ? new Date(state.pausedAt).getTime()
            : nowMs) -
          new Date(state.startedAt).getTime() -
          (state.totalPausedMs ?? 0)
      )
    : 0;
  const timerText = formatDuration(Math.max(0, Math.floor(
    (isUntimedRun ? untimedRunElapsedMs : remainingMs) / 1000
  )));
  const arrowDuelReplySecondsRemaining =
    arrowDuelReplyChallengePreviewVisible
      ? arrowDuelReplySeconds
      : displayedArrowDuelPuzzle?.phase === "reply" &&
          displayedArrowDuelPuzzle.replyDeadlineAt
        ? Math.max(
            0,
            Math.ceil((new Date(displayedArrowDuelPuzzle.replyDeadlineAt).getTime() - nowMs) / 1000)
          )
        : state?.config.opponentReply?.seconds ?? arrowDuelReplySeconds;
  const productionReplyCuePresentation = sprintGuidanceEnabled
    && arrowDuelReplyChallengeProductionVisible
    ? arrowDuelReplyCuePresentationFor(service.getSettings().sprintGuides)
    : null;
  const explicitReplySideCopy = sprintGuidanceEnabled
    || arrowDuelReplyChallengeDesign?.explicitReplySideCopy === true;
  const arrowDuelWhatIfDetail = isSurvivalState
    ? "Find the opponent’s reply. There is no time limit."
    : explicitReplySideCopy
      ? replyPreparationInstruction(arrowDuelReplySecondsRemaining)
      : `Find the opponent’s reply in ${arrowDuelReplySecondsRemaining} ${
          arrowDuelReplySecondsRemaining === 1 ? "second" : "seconds"
        }.`;
  const currentBoardFen = boardFen ?? currentPuzzle?.currentFen ?? null;
  const displayedPuzzle = feedbackSnapshot?.currentPuzzle ?? currentPuzzle;
  const sessionEntryPreview = usePuzzleEntryPreview({
    boardRef,
    currentPuzzle: feedbackSnapshot ? undefined : currentPuzzle,
    entryKey: !feedbackSnapshot && isActive && state && currentPuzzle
      ? `${state.id}:${state.currentPuzzleIndex}:${currentPuzzle.puzzle.id}`
      : null,
    onCommittedMove: (move, preMoveFen) => {
      playCommittedMoveFeedback("opponent", move, preMoveFen);
    },
    onLastMove: setLastBoardMove,
    suppressedMovesRef: suppressedBoardMovesRef
  });
  puzzleEntryPreviewLockedRef.current = sessionEntryPreview.locked;
  const displayedBoardFen = sessionEntryPreview.displayFen
    ?? feedbackSnapshot?.boardFen
    ?? currentBoardFen;
  sessionBoardHandlersRef.current = {
    onIllegalMove(from, to) {
      onIllegalMove(from, to, {
        puzzleId: displayedPuzzle?.puzzle.id ?? null
      });
    },
    onMove(result) {
      void onBoardMove(result, {
        puzzleId: displayedPuzzle?.puzzle.id ?? null
      });
    }
  };
  const boardFlipped = displayedPuzzle ? shouldFlipBoard(displayedPuzzle) : false;
  const feedbackForCurrentPuzzle = feedbackPuzzleId && currentPuzzle?.puzzle.id === feedbackPuzzleId ? feedback : null;
  const boardFeedback = feedbackSnapshot?.feedback ?? feedbackForCurrentPuzzle;
  const boardPremoveWindow = boardInputLocked && boardInputLockMode === "premove";
  // Drags aimed at an active board must pan pieces, never the page. Freeze the
  // surrounding Sprint scroll for the whole session and the fixed Review board
  // in landscape. Review and replay keep their portrait actions scrollable, so
  // they freeze the page only while a touch that started on the board is active.
  // Edit Runs stays scrollable until a held card actually claims its drag, then
  // freezes through drop so the card moves without also panning the page.
  const reviewBoardVisible = reviewSessionSource !== null || historyReviewEntries.length > 0;
  const practiceScrollLocked = shouldShowSessionBoard
    || (adaptiveLayout.usesSessionRail && reviewBoardVisible)
    || reviewBoardTouchActive;
  const boardGestureEnabled = Boolean(
    isActive
      && !isShowingFeedbackSnapshot
      && !sessionEntryPreview.locked
      && (!boardInputLocked || boardPremoveWindow)
  );
  const displayedSideToMove = displayedBoardFen ? sideToMove(displayedBoardFen) : null;
  const arrowDuelPromptSide = displayedArrowDuelPuzzle
    ? arrowDuelReplyChallengeDisplayPhase === "reply"
      ? oppositeMoveSide(sideToMove(displayedArrowDuelPuzzle.puzzle.initialFen))
      : sideToMove(displayedArrowDuelPuzzle.puzzle.initialFen)
    : displayedSideToMove;
  const submittedMoveForCurrentPuzzle =
    boardFeedback?.submittedMove && boardFeedback.submittedMove !== "__illegal__"
      ? arrowFromTo(boardFeedback.submittedMove)
      : null;
  const displayedLastBoardMove = feedbackSnapshot || boardFeedback ? null : lastBoardMove;
  const sessionBoardSquareTints = useBoardMoveSquareTints(
    submittedMoveForCurrentPuzzle ?? displayedLastBoardMove,
    submittedMoveForCurrentPuzzle
      ? moveFeedbackTint(appTheme, boardFeedback?.result ?? "wrong")
      : appTheme.colors.board.lastMoveSquare
  );
  const arrowDuelBoardRenderKey =
    displayedPuzzle?.kind === "arrow_duel" && state && displayedBoardFen
      ? `${state.id}:${displayedPuzzle.puzzle.id}:${displayedBoardFen}`
      : null;
  const markArrowDuelBoardReady = useCallback(() => {
    if (arrowDuelBoardRenderKey) {
      setReadyArrowDuelBoardKey(arrowDuelBoardRenderKey);
    }
  }, [arrowDuelBoardRenderKey]);
  const historyRatingKeys = useMemo(() => {
    void aggregateRevision;
    return activeRunManagementPresentation
      ? activeRunManagementPresentation.runs.flatMap((run) => run.ratingKey ? [run.ratingKey] : [])
      : collectHistoryRatingKeys(service.listPracticeRatingActivity().map((activity) => activity.ratingKey));
  }, [activeRunManagementPresentation, aggregateRevision, service]);
  const historyRunsByRatingKey = new Map(
    (activeRunManagementPresentation?.runs ?? service.listPracticeRuns()).flatMap((run) => run.ratingKey
      ? [[run.ratingKey, {
        name: run.name,
        perPuzzleSeconds: run.perPuzzleSeconds
      }] as const]
      : [])
  );
  const activeHistoryRatingKey = historyRatingKey;
  // History views scan the full attempt history, so they are computed only while
  // the history panel is on screen. Recomputing them on every render made active
  // sprints progressively laggy: the 500ms countdown tick re-rendered this screen
  // and re-scanned a history that grows with every solved puzzle.
  const historyPanelVisible =
    tab === "history" &&
    !historyProgressOpen &&
    historyReviewEntries.length === 0 &&
    historyUnavailableAttempt === null;
  const historyBaseView = historyPanelVisible
    ? service.getHistoryView(
        historyQuery(nowIso(), { limit: HISTORY_PAGE_LIMIT, offset: historyPageOffset })
      )
    : null;
  const historyView = historyBaseView;
  const historyPerformanceView = historyPanelVisible && activeHistoryRatingKey
    ? service.getHistoryView(historyQuery(nowIso()))
    : null;
  const visibleHistoryAttempts = historyView?.attempts ?? [];
  const visibleHistoryPage = historyView?.page;
  const contentOwnsHeader = tab === "review" || tab === "history";
  const survivalBackTransient: MobileBackTransient | null = personalBestRecordsVisible
    ? "survival-records"
    : personalBestGuideVisible
      ? personalBestGuideIntent === "first-entry"
        ? "survival-guide-to-practice"
        : "survival-guide-to-hub"
      : personalBestSourcePickerVisible
        ? "survival-source-picker"
        : personalBestHubVisible
          ? "survival-hub"
          : isSurvivalPauseVisible
            ? "survival-pause"
            : null;
  const topBackTransient: MobileBackTransient | null = isSessionGuideVisible
    ? "sprint-session-guide"
    : startingMode
      ? "starting-practice"
      : survivalBackTransient
        ? survivalBackTransient
        : practiceExitConfirmationVisible
          ? "practice-exit-confirmation"
          : reviewReminderPermissionPromptVisible
            ? "review-reminder-prompt"
            : tab === "history" && !reviewSurfaceOpen && historyFiltersExpanded
              ? "history-filters"
              : tab === "review" && !reviewSurfaceOpen && reviewFiltersExpanded
                ? "review-filters"
                : tab === "settings" && settingsAdvancedRatingsOpen
                  ? "settings-advanced-ratings"
                  : tab === "practice" && mode === "custom" && customRatingEditorOpen
                    ? "custom-rating-editor"
                    : null;
  const activeRunManagementScreen = activeRunManagementPresentation?.screen;
  const backDetail = useMemo<MobileBackDetail | null>(
    () => reviewAnalysisOpen && (tab === "history" || tab === "review")
      ? { kind: "review-analysis", owner: tab }
      : reviewSurfaceOpen && (tab === "history" || tab === "review")
        ? {
            kind: "review-session",
            owner: tab === "review" && reviewSessionSource === "session" ? "practice" : tab
          }
        : tab === "history" && historyProgressOpen
          ? { kind: "history-progress", owner: "history" }
          : tab === "analysis"
            ? { kind: "stockfish-diagnostics", owner: "settings" }
            : isFinished
              ? { kind: "sprint-result", owner: "practice" }
              : tab === "practice" && state === null
                && resolvedTacticalProfilePresentation?.screen !== undefined
                && resolvedTacticalProfilePresentation.screen !== "home"
                ? { kind: "tactical-profile", owner: "practice" }
              : tab === "practice" && state === null && activeRunManagementScreen !== undefined
                && activeRunManagementScreen !== "home"
                ? { kind: "practice-run-editor", owner: "practice" }
              : tab === "practice" && state === null && mode === "custom"
                ? { kind: "custom-practice", owner: "practice" }
                : null,
    [
      activeRunManagementScreen,
      historyProgressOpen,
      isFinished,
      mode,
      resolvedTacticalProfilePresentation?.screen,
      reviewAnalysisOpen,
      reviewSessionSource,
      reviewSurfaceOpen,
      state,
      tab
    ]
  );
  const mobileBackState: MobileBackState = {
    activePractice: isOpenSession,
    activeSurvival: isOpenSession && isSurvivalState,
    detail: backDetail,
    tab,
    topTransient: topBackTransient
  };
  const predictiveBackEnabled = resolveMobileBackIntent(mobileBackState, "button").kind !== "delegate-platform";
  const appReviewRequestBlocked = isAppReviewRequestSurfaceBlocked({
    hasError: error !== null,
    hasModalOrGuide: topBackTransient !== null
      || personalBestGuideVisible
      || personalBestHubVisible
      || personalBestRecordsVisible,
    hasNavigationPreview: mobileBackPreview !== null,
    isAnalysisOpen: reviewAnalysisOpen,
    isPracticeTab: tab === "practice"
  });

  useEffect(() => {
    const current = state;
    const cancelledSessionIds = appReviewCancelledSessionIdsRef.current;
    if (
      !appStoreReviewRequestClient ||
      !current ||
      current.status !== "won" ||
      !isFinished ||
      isShowingFeedbackSnapshot ||
      appReviewRequestBlocked ||
      cancelledSessionIds.has(current.id)
    ) {
      return undefined;
    }

    const appVersion =
      platformCapabilities.applicationMetadata.versionName;
    if (!service.getAppReviewRequestEligibility(
      current.id,
      appVersion,
      currentTimeMs()
    ).eligible) {
      return undefined;
    }

    let requestStarted = false;
    const sessionId = current.id;
    const timer = setTimeout(() => {
      const currentState = stateRef.current;
      if (
        cancelledSessionIds.has(sessionId) ||
        currentState?.id !== sessionId ||
        currentState.status !== "won"
      ) {
        return;
      }
      const attemptedAtMs = currentTimeMs();
      if (!service.getAppReviewRequestEligibility(
        sessionId,
        appVersion,
        attemptedAtMs
      ).eligible) {
        return;
      }

      requestStarted = true;
      void appStoreReviewRequestClient.requestReview().then((requested) => {
        if (!requested) {
          return;
        }
        try {
          service.recordAppReviewRequestAttempt(
            appVersion,
            new Date(attemptedAtMs).toISOString()
          );
        } catch {
          // The native request already happened. Local suppression failure must
          // not alter or block the completed puzzle result.
        }
      }).catch(() => {});
    }, APP_REVIEW_REQUEST_IDLE_MS);

    return () => {
      clearTimeout(timer);
      if (!requestStarted) {
        cancelledSessionIds.add(sessionId);
      }
    };
  }, [
    appReviewRequestBlocked,
    appStoreReviewRequestClient,
    currentTimeMs,
    isFinished,
    isShowingFeedbackSnapshot,
    platformCapabilities.applicationMetadata.versionName,
    service,
    state
  ]);

  function dismissSessionGuide(): void {
    pendingGuidedStartRef.current = null;
    setSessionGuide(null);
  }

  function showPreviousSessionGuideStep(): void {
    setSessionGuide((current) => current && current.stepIndex > 0
      ? { ...current, stepIndex: current.stepIndex - 1 }
      : current);
  }

  function continueSessionGuide(): void {
    if (!sessionGuide) {
      return;
    }
    if (sessionGuide.stepIndex < sessionGuide.plan.steps.length - 1) {
      setSessionGuide({ ...sessionGuide, stepIndex: sessionGuide.stepIndex + 1 });
      return;
    }
    if (sprintGuidanceEnabled) {
      saveSessionGuidePlanSeen(sessionGuide.plan);
    }
    setSessionGuide(null);
    const pendingStart = pendingGuidedStartRef.current;
    pendingGuidedStartRef.current = null;
    if (pendingStart) {
      if (pendingStart.kind === "focused") {
        requestFocusedRunStart(pendingStart.taskFamily, pendingStart.onUnavailable);
        return;
      }
      startSprint(
        pendingStart.nextMode,
        pendingStart.useCustomTiming,
        pendingStart.practiceRunId
      );
      return;
    }
    if (sessionGuide.presentation.focusedRun) {
      return;
    }
    startSprint(sessionGuide.presentation.mode);
  }

  function executeMobileBackIntent(
    intent: MobileBackIntent,
    resolvedState: MobileBackState = mobileBackState
  ): boolean {
    switch (intent.kind) {
      case "dismiss-transient":
        if (intent.transient === "practice-exit-confirmation") {
          setPracticeExitConfirmationVisible(false);
        } else if (intent.transient === "review-reminder-prompt") {
          dismissReviewReminderPermissionPrompt();
        } else if (intent.transient === "history-filters") {
          setHistoryFiltersExpanded(false);
        } else if (intent.transient === "review-filters") {
          setReviewFiltersExpanded(false);
        } else if (intent.transient === "settings-advanced-ratings") {
          setSettingsAdvancedRatingsOpen(false);
        } else if (intent.transient === "custom-rating-editor") {
          setCustomRatingEditorOpen(false);
        } else if (intent.transient === "starting-practice") {
          cancelStartingSprint();
        } else if (intent.transient === "sprint-session-guide") {
          dismissSessionGuide();
        } else if (intent.transient === "survival-records") {
          setPersonalBestRecordsVisible(false);
        } else if (intent.transient === "survival-source-picker") {
          setPersonalBestSourcePickerVisible(false);
        } else if (
          intent.transient === "survival-guide-to-hub"
          || intent.transient === "survival-guide-to-practice"
        ) {
          closePersonalBestGuide();
        } else if (intent.transient === "survival-hub") {
          setPersonalBestHubVisible(false);
        } else if (intent.transient === "survival-pause") {
          leavePersonalBestPaused();
        }
        return true;
      case "close-analysis":
        reviewBackCommandIdRef.current += 1;
        setReviewBackCommand({ id: reviewBackCommandIdRef.current, kind: intent.kind });
        return true;
      case "return-to-owner":
        if (resolvedState.detail?.kind === "review-session") {
          if (historyUnavailableAttempt) {
            setHistoryUnavailableAttempt(null);
          } else {
            reviewBackCommandIdRef.current += 1;
            setReviewBackCommand({ id: reviewBackCommandIdRef.current, kind: intent.kind });
          }
        } else if (resolvedState.detail?.kind === "stockfish-diagnostics") {
          navigateToTab("settings");
        } else if (resolvedState.detail?.kind === "history-progress") {
          setHistoryProgressOpen(false);
        } else if (resolvedState.detail?.kind === "practice-run-editor") {
          activeRunManagementPresentation?.onIntent({ type: "cancel-edit" });
        } else if (resolvedState.detail?.kind === "tactical-profile") {
          resolvedTacticalProfilePresentation?.onIntent({ type: "close-profile" });
        } else if (resolvedState.detail?.kind === "custom-practice") {
          setCustomRatingEditorOpen(false);
          setMode("standard");
        } else if (resolvedState.detail?.kind === "sprint-result") {
          resetToIdle();
        }
        return true;
      case "pause-survival":
        pausePersonalBestChallenge();
        return true;
      case "request-practice-exit":
        setPracticeExitConfirmationVisible(true);
        return true;
      case "return-to-practice":
        setSessionReplayItems([]);
        setHistoryReviewEntries([]);
        setHistoryUnavailableAttempt(null);
        navigateToTab("practice");
        return true;
      case "delegate-platform":
        return false;
    }
  }

  mobileBackStateRef.current = mobileBackState;
  executeMobileBackIntentRef.current = executeMobileBackIntent;

  useEffect(() => {
    if (systemBack?.platform !== "android") {
      return undefined;
    }

    if (!predictiveBackIntentRef.current) {
      systemBack.setPredictiveBackEnabled(predictiveBackEnabled);
    }
    // Product state may change during a live gesture. Availability is held
    // until cancel/commit so the native callback and frozen snapshot survive.
    return undefined;
  }, [predictiveBackEnabled, systemBack]);

  useEffect(() => {
    if (systemBack?.platform !== "android") {
      return undefined;
    }

    const deferredBackTransitions = deferredBackTransitionsRef.current;
    const unsubscribe = systemBack.subscribe({
      onStart(edge) {
        const currentState = mobileBackStateRef.current;
        if (!currentState) {
          return;
        }
        const intent = resolveMobileBackIntent(currentState, "predictive");
        const destination = mobileBackDestination(intent, currentState);
        if (!destination) {
          return;
        }
        predictiveBackIntentRef.current = intent;
        predictiveBackStateRef.current = currentState;
        setMobileBackPreview({ ...destination, edge, progress: 0 });
      },
      onProgress(progress, edge) {
        setMobileBackPreview((current) => current
          ? { ...current, edge, progress }
          : current);
      },
      onCancel() {
        predictiveBackIntentRef.current = null;
        predictiveBackStateRef.current = null;
        setMobileBackPreview(null);
        resumeDeferredBackTransitionsRef.current?.();
        const currentState = mobileBackStateRef.current;
        if (currentState) {
          const currentIntent = resolveMobileBackIntent(currentState, "button");
          systemBack.setPredictiveBackEnabled(currentIntent.kind !== "delegate-platform");
        }
      },
      onCommit(activation) {
        const frozenIntent = activation === "predictive"
          ? predictiveBackIntentRef.current
          : null;
        const frozenState = activation === "predictive"
          ? predictiveBackStateRef.current
          : null;
        const currentState = mobileBackStateRef.current;
        predictiveBackIntentRef.current = null;
        predictiveBackStateRef.current = null;
        deferredBackTransitionsRef.current.clear();
        setMobileBackPreview(null);
        if (!currentState) {
          return false;
        }
        const currentIntent = resolveMobileBackIntent(currentState, "button");
        systemBack.setPredictiveBackEnabled(currentIntent.kind !== "delegate-platform");
        const intent = frozenIntent ?? resolveMobileBackIntent(currentState, activation);
        return executeMobileBackIntentRef.current?.(intent, frozenState ?? currentState) ?? false;
      }
    });
    return () => {
      predictiveBackIntentRef.current = null;
      predictiveBackStateRef.current = null;
      deferredBackTransitions.clear();
      systemBack.setPredictiveBackEnabled(false);
      unsubscribe();
    };
  }, [systemBack]);

  const appChromeVisible = topLevelChromeVisible;
  // Practice sub-pages draw their own back/close and title top bar, like
  // Survival and Sprint Result (#609), so the Practice large title is hidden
  // while one is open.
  const practiceSubPageAvailable = !isSessionGuideVisible && !isOpenSession && state === null;
  const tacticalProfileFlowVisible = practiceSubPageAvailable
    && resolvedTacticalProfilePresentation?.screen !== undefined
    && resolvedTacticalProfilePresentation.screen !== "home";
  const practiceRunEditorVisible = practiceSubPageAvailable
    && activeRunManagementPresentation !== undefined
    && activeRunManagementPresentation.screen !== "home";
  const customSprintSetupVisible = practiceSubPageAvailable
    && !activeRunManagementPresentation
    && mode === "custom";
  const practiceSubPageVisible = tab === "practice"
    && (tacticalProfileFlowVisible || practiceRunEditorVisible || customSprintSetupVisible);
  const appHeaderVisible = appChromeVisible && !contentOwnsHeader && !practiceSubPageVisible;
  // Practice home is one scrolling page on every platform, so its large title
  // travels with the page. Other app-shell headers keep their existing
  // placement unless the native iPad tab bar overlays the whole tab surface.
  const practiceHeaderScrolls = appHeaderVisible && tab === "practice";
  const appHeaderScrolls = iPadTopTabBarOverlayVisible || practiceHeaderScrolls;
  // Stockfish diagnostics (dev only) open from Settings, so they keep the
  // Settings tab selected.
  const hostTab: TopLevelTab = tab === "analysis" ? "settings" : tab;
  const sessionUsesRail = shouldShowSessionBoard && adaptiveLayout.usesSessionRail;
  // The first-use guide previews the session row at full session width; the
  // 1120-point wide-content cap would clip its board and rail (#602).
  const sessionGuideUsesRail = isSessionGuideVisible && adaptiveLayout.usesSessionRail;
  const sessionPackedRowWidth = adaptiveLayout.sessionPackedRowWidth;
  const screenTitle = (
    (tab === "review" && reviewSessionSource === "session")
    || (
      tab === "history"
      && (historyReviewEntries.length > 0 || historyUnavailableAttempt !== null)
    )
  )
    ? "Replay"
    : screenTitleFor(tab);
  const screenSubtitle = tab === "practice"
    ? `Offline-ready · ${seededPuzzleCount(puzzleSource)} puzzles`
    : screenSubtitleFor(tab);
  const practiceModeSummaries: PracticeModeSummary[] = (["standard", "arrow_duel", "custom"] as const).map((nextMode) => {
    const config = sprintConfigFor(nextMode, customDurationSeconds, customPerPuzzleSeconds);
    return {
      mode: nextMode,
      config,
      ...(nextMode === "custom" ? {} : { rating: readRating(service, config.ratingKey) })
    };
  });
  // Quantized to the minute so the 500ms countdown tick does not rescan the
  // full attempt history on every render during an active sprint.
  const practiceProgressNowMs = Math.floor(nowMs / 60000) * 60000;
  const selectedManagedRun = activeRunManagementPresentation?.runs.find(
    (run) => run.id === activeRunManagementPresentation.selectedRunId
  );
  const selectedHomeConfig = selectedManagedRun
    ? buildSprintConfig({
        durationSeconds: selectedManagedRun.durationSeconds,
        mode: selectedManagedRun.mode,
        perPuzzleSeconds: selectedManagedRun.perPuzzleSeconds
      })
    : selectedConfig;
  const sprintRulesGuidePresentation = sprintRulesDesignPreview?.firstRunGuide
    ?? (sprintGuidanceEnabled
      ? {
          durationLabel: formatSprintDurationLabel(selectedHomeConfig.durationSeconds),
          maxMistakes: selectedHomeConfig.maxMistakes,
          targetCorrect: selectedHomeConfig.targetCorrect
        }
      : undefined);
  const practiceProgressRatingKey = selectedManagedRun?.ratingKey ?? selectedConfig.ratingKey;
  const practiceProgress = useMemo(() => {
    void aggregateRevision;
    return service.getPracticeProgressSummary(practiceProgressNowMs, practiceProgressRatingKey);
  }, [aggregateRevision, practiceProgressNowMs, practiceProgressRatingKey, service]);
  const dueTodayCount = dueReviewItems.length;
  const overdueCount = dueReviewItems.filter((item) => isReviewOverdue(item.review, nowMs)).length;
  const customEligiblePuzzleCount = useMemo(() => {
    if (!Number.isFinite(currentRating)) {
      return 0;
    }
    if (puzzleSource === "bundledCore" && selectedSprintThemes.length <= 1) {
      return bundledCoreCustomEligiblePuzzleCount(selectedSprintThemes[0]);
    }
    return service.countEligibleSprintPuzzles(
      {
        mode: customSprintMode,
        durationSeconds: customDurationSeconds,
        perPuzzleSeconds: customPerPuzzleSeconds,
        ...(selectedSprintThemes.length === 0 ? {} : { themes: selectedSprintThemes })
      },
      selectedConfig.targetCorrect + selectedConfig.maxMistakes
    );
  }, [
    customDurationSeconds,
    customPerPuzzleSeconds,
    customSprintMode,
    currentRating,
    puzzleSource,
    selectedSprintThemes,
    selectedConfig.maxMistakes,
    selectedConfig.targetCorrect,
    service
  ]);
  const resolvedPuzzleTiming = state
    ? resolvePuzzleTimingPolicy(
        state.config.puzzleTiming,
        state.config.perPuzzleSeconds
      )
    : null;
  const currentPuzzleElapsedSeconds = state?.currentPuzzleStartedAt
    ? Math.max(0, Math.floor(
      (effectiveSessionNowMs - new Date(state.currentPuzzleStartedAt).getTime()) / 1000
    ))
    : 0;
  const sessionTimingState: SessionTimingState | null = state && resolvedPuzzleTiming
    ? feedbackSnapshot?.kind === "timed_out"
      ? {
          elapsedSeconds: feedbackSnapshot.elapsedSeconds ?? currentPuzzleElapsedSeconds,
          phase: "timed_out"
        }
      : {
          elapsedSeconds: currentPuzzleElapsedSeconds,
          phase: resolvedPuzzleTiming.slowAfterSeconds !== null
            && currentPuzzleElapsedSeconds >= resolvedPuzzleTiming.slowAfterSeconds
            ? "slow"
            : "normal"
        }
    : null;
  const sessionPuzzleTimingNode = shouldShowSessionBoard && sessionTimingState ? (
    <PuzzleTimingIndicator
      elapsedSeconds={sessionTimingState.elapsedSeconds}
      phase={sessionTimingState.phase}
      timeoutSeconds={resolvedPuzzleTiming?.timeoutAfterSeconds ?? null}
    />
  ) : null;
  const personalBestActivePresentation = isSurvivalState
    && personalBestPresentation?.showActivePresentation === true
    ? state?.survival
      ? {
          ...personalBestPresentation,
          activeRecordMode: state.correctCount > (state.survival.bestBefore ?? 0),
          bestScore: state.survival.bestBefore
        }
      : personalBestPresentation
    : undefined;
  const sessionStatusNode = state && (isOpenSession || isShowingFeedbackSnapshot) ? (
    <SessionStatusBar
      closeAccessibilityLabel={personalBestActivePresentation
        ? "Open Survival leave options"
        : "Abandon sprint"}
      compactMetrics={sessionUsesRail}
      // The overlay starts 8 points below the HUD; the prompt card follows the
      // HUD after the 10-point rail or 12-point stack gap. Four extra points
      // cover the card to its bottom edge in either layout.
      leaveConfirmationMinHeight={adaptiveLayout.promptFrameHeight + 4}
      // Beside its buttons, the copy wraps to a word per line in a narrow
      // rail or column; stacked, it reads as two short lines.
      stackLeaveConfirmation={adaptiveLayout.sessionColumnWidth < 320}
      mode={mode}
      personalBest={personalBestActivePresentation}
      state={state}
      timerText={timerText}
      confirmAbandon={personalBestActivePresentation
        ? isSurvivalPauseVisible
        : practiceExitConfirmationVisible}
      onAbandon={isOpenSession && !personalBestActivePresentation ? abandonSprint : undefined}
      onClose={personalBestActivePresentation
        ? pausePersonalBestChallenge
        : undefined}
      onPauseAndLeave={personalBestActivePresentation ? leavePersonalBestPaused : undefined}
      onConfirmAbandonChange={setPracticeExitConfirmationVisible}
      onPause={isActive && !personalBestActivePresentation
        ? () => pauseActiveSprint("manual")
        : undefined}
      onResume={isPaused && state
        ? personalBestActivePresentation
          ? () => resumePersonalBestChallenge(state)
          : () => resumeSprint(state)
        : undefined}
    />
  ) : null;
  const sessionScoreNode = shouldShowSessionBoard && state?.status === "active" ? (
    personalBestActivePresentation ? (
      <PersonalBestProgressBanner
        bestScore={personalBestActivePresentation.bestScore}
        recordMode={personalBestActivePresentation.activeRecordMode === true}
        compact={sessionUsesRail}
        score={state.correctCount}
      />
    ) : (
      <SessionScoreStrip compact={sessionUsesRail || adaptiveLayout.isLargeText} state={state} />
    )
  ) : null;
  // The inline abandon confirmation occupies the paused card's slot below the
  // HUD. Keeping the card mounted behind its absolute sheet leaves its border
  // exposed below the sheet, especially after the top-tab scroll change.
  const pausedSessionNode = isPaused && state && !personalBestActivePresentation
    && !practiceExitConfirmationVisible ? (
    <PausedSessionPanel
      state={state}
      onAbandon={() => setPracticeExitConfirmationVisible(true)}
      onResume={() => resumeSprint(state)}
    />
  ) : null;
  const sessionBoardNode = shouldShowSessionBoard ? (
    <View key="session-board" style={styles.boardWrapper}>
      {arePracticeTestControlsEnabled() || isStoreAssetCaptureEnabled() ? (
        <Text testID="session-current-puzzle-id" style={styles.reviewDueHiddenMetric}>
          {displayedPuzzle?.puzzle.id ?? ""}
        </Text>
      ) : null}
      <View
        accessible
        accessibilityLabel={sessionBoardAccessibilityLabel(displayedSideToMove, displayedLastBoardMove)}
        accessibilityRole="image"
        testID="session-board"
        style={[styles.boardSurface, { width: boardSize, height: boardSize }]}
      >
        {displayedBoardFen ? (
          <Chessboard
            key={state?.id ?? "idle"}
            ref={boardRef}
            fen={displayedBoardFen}
            onMove={sessionBoardCallbacks.onMove}
            onIllegalMove={sessionBoardCallbacks.onIllegalMove}
            // Keep the native gesture/worklet graph mounted for the whole
            // session. Reconfiguring it on every feedback lock retained large
            // native graphs until a late GC and made long sprints laggy. The
            // blocker below claims locked touches, onBoardMove rechecks the JS
            // lock for races, and null keeps the board's own turn restriction.
            gestureEnabled
            draggableColor={null}
            boardSize={boardSize}
            flipped={boardFlipped}
            withLetters={false}
            withNumbers={false}
            durations={CHESSBOARD_DURATIONS}
            spriteSource={CHESS_PIECE_SPRITE}
            colors={chessboardColorsFor(appTheme)}
            squareHighlights={sessionBoardSquareTints}
            onReady={arrowDuelBoardRenderKey ? markArrowDuelBoardReady : undefined}
          />
        ) : (
          <View style={[styles.emptyBoard, { width: boardSize, height: boardSize }]}>
            <Text style={styles.emptyBoardText}>Ready</Text>
          </View>
        )}

        {displayedBoardFen ? (
          <BoardCoordinateOverlay
            boardSize={boardSize}
            flipped={boardFlipped}
          />
        ) : null}

        {!boardGestureEnabled || feedbackSnapshot?.kind === "timed_out" ? (
          <BoardInputBlocker />
        ) : null}

        {feedbackSnapshot?.kind === "timed_out" ? (
          <View
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            style={styles.puzzleTimeoutOverlay}
            testID="session-puzzle-timeout-overlay"
          >
            <Text style={styles.puzzleTimeoutOverlayTitle}>Timed out</Text>
            {(sprintGuidanceEnabled || sprintRulesDesignPreview?.timeoutCountsAsMistake === true) && !(
              feedbackSnapshot.currentPuzzle.kind === "arrow_duel" &&
              feedbackSnapshot.currentPuzzle.phase === "reply"
            ) ? (
              <Text style={styles.puzzleTimeoutOverlayDetail}>Added to Review</Text>
            ) : null}
          </View>
        ) : null}

        {arrowDuelWhatIfVisible ? (
          <ArrowDuelWhatIfOverlay
            actionLabel={(sprintRulesDesignPreview?.arrowDuelReplyChallenge
              ?.preparationConfirmationRequired === true
              || productionReplyCuePresentation?.confirmationRequired === true)
              && !arrowDuelReplyPreparationAcknowledged
              ? "Got it"
              : undefined}
            compactTitle={boardSize < 300}
            detail={arrowDuelWhatIfDetail}
            optionalSettingsHint={opponentReplySettingsHint}
            onAction={() => {
              if (productionReplyCuePresentation?.confirmationRequired === true) {
                service.acknowledgeArrowDuelReplyCue();
                setSettingsRevision((current) => current + 1);
              }
              setArrowDuelReplyPreparationAcknowledged(true);
              const continueReply = arrowDuelReplyPreparationContinueRef.current;
              arrowDuelReplyPreparationContinueRef.current = null;
              continueReply?.();
            }}
            testIDPrefix="arrow-duel"
            title={explicitReplySideCopy && arrowDuelPromptSide
              ? `What would ${moveSideDisplayName(arrowDuelPromptSide)} play after the other move?`
              : undefined}
            titleSide={explicitReplySideCopy && arrowDuelPromptSide
              ? arrowDuelPromptSide
              : undefined}
            veryCompactTitle={boardSize < 250}
          />
        ) : null}

        {displayedLastBoardMove ? (
          <LastMoveOverlay
            boardSize={boardSize}
            move={displayedLastBoardMove}
            overlayTestID="session-last-move-overlay"
          />
        ) : null}

        {submittedMoveForCurrentPuzzle ? (
          <MoveFeedbackOverlay boardSize={boardSize} />
        ) : null}

        {displayedPuzzle?.kind === "arrow_duel"
          && !boardFeedback
          && (!arrowDuelReplyChallengeVisible || (
            arrowDuelReplyChallengeDisplayPhase === "choice" &&
            (
              arrowDuelReplyChallengePreviewVisible ||
              displayedPuzzle.phase === "choice"
            )
          ))
          && readyArrowDuelBoardKey === arrowDuelBoardRenderKey ? (
          <ArrowCandidateOverlay
            boardSize={boardSize}
            flipped={boardFlipped}
            candidates={displayedPuzzle.candidates}
            testID="arrow-duel-candidate-overlay"
          />
        ) : null}
      </View>
      {!sessionUsesRail && (sessionPuzzleTimingNode || sessionScoreNode) ? (
        <View
          style={[styles.sessionBoardDetails, { width: adaptiveLayout.sessionColumnWidth }]}
          testID="session-board-details"
        >
          {sessionPuzzleTimingNode}
          {sessionScoreNode}
        </View>
      ) : null}
      {isPracticeDebugEnabled() && chessboardDebugEvents.length > 0 ? (
        <Text style={styles.debugLog} testID="chessboard-debug-log">
          {chessboardDebugEvents.join("\n")}
        </Text>
      ) : null}
    </View>
  ) : null;
  const practicePromptNode = shouldShowSessionBoard ? (
    <View
      // The leave confirmation covers this card while it is open.
      accessibilityElementsHidden={practiceExitConfirmationVisible}
      importantForAccessibility={practiceExitConfirmationVisible ? "no-hide-descendants" : "auto"}
      style={[
        styles.practicePromptStack,
        { width: adaptiveLayout.sessionColumnWidth }
      ]}
      testID="practice-prompt-stack"
    >
      {arrowDuelReplyChallengeVisible && displayedPuzzle?.kind === "arrow_duel" ? (
          <ArrowDuelReplyChallengePrompt
            currentPuzzle={displayedPuzzle}
            explicitReplySideCopy={explicitReplySideCopy}
            frameHeight={adaptiveLayout.promptFrameHeight}
            hideSideGlyph={explicitReplySideCopy && adaptiveLayout.sessionColumnWidth < 240}
            kingPieceSize={kingGlyphSizeForBoard(boardSize)}
            phase={arrowDuelReplyChallengeDisplayPhase}
            promptSide={arrowDuelPromptSide}
            replyReady={arrowDuelReplyReady}
            replySeconds={arrowDuelReplySecondsRemaining}
            settingsHint={opponentReplySettingsHint}
            showReplyTimer={!isSurvivalState}
          />
      ) : (
        <PracticePrompt
          currentPuzzle={displayedPuzzle}
          frameHeight={adaptiveLayout.promptFrameHeight}
          kingPieceSize={kingGlyphSizeForBoard(boardSize)}
          mode={mode}
        />
      )}
    </View>
  ) : null;
  const sessionBottomFeedbackNode = shouldShowSessionBoard
    && (unclearPrompt || previousAttemptNotice) ? (
    // Fabric must keep this wrapper as a native flex child so the landscape
    // auto margin can pin feedback to the rail bottom instead of flattening it.
    <View
      collapsable={false}
      style={[
        styles.activeSessionBottomFeedback,
        sessionUsesRail && !adaptiveLayout.sessionCentersRow
          ? styles.activeSessionRailBottomFeedback
          : null,
        { width: adaptiveLayout.sessionColumnWidth }
      ]}
    >
      {previousAttemptNotice ? (
        <PreviousAttemptNotice reason={previousAttemptNotice.reason} />
      ) : unclearPrompt ? (
        <UnclearAttemptPrompt
          marked={unclearPrompt.marked}
          question={unclearPrompt.question.includes("wrong")
            ? unclearPrompt.question
            : "Was the previous puzzle clear?"}
          onToggle={toggleUnclearPrompt}
        />
      ) : null}
    </View>
  ) : null;
  const errorNode = error ? <ErrorPanel error={error} /> : null;
  // The first-use guide is a guided state of this same session layout: its
  // nodes reuse the live session components with a frozen example, and the
  // overlay below dims everything except the current step's target (#611).
  const sessionGuideStageNodes = isSessionGuideVisible
    && sessionGuideStep
    && sessionGuidePresentation
    ? buildSessionGuideStageNodes({
        adaptiveLayout,
        appTheme,
        boardSize,
        presentation: sessionGuidePresentation,
        step: sessionGuideStep,
        styles,
        targetRef: sessionGuideTargetRef,
        onExit: dismissSessionGuide,
        onTargetLayout: () => setSessionGuideTargetRevision((current) => current + 1)
      })
    : null;
  const sessionLayoutUsesRail = sessionUsesRail || sessionGuideUsesRail;
  const reviewUsesRail = adaptiveLayout.usesSessionRail && reviewBoardVisible;
  const sessionLayout: SessionLayoutNodes = sessionGuideStageNodes ?? {
    board: sessionBoardNode,
    bottomFeedback: sessionBottomFeedbackNode,
    error: errorNode,
    paused: pausedSessionNode,
    prompt: practicePromptNode,
    score: sessionScoreNode,
    status: sessionStatusNode,
    timing: sessionPuzzleTimingNode
  };
  const hasSessionLayoutContent = sessionGuideStageNodes !== null
    || sessionStatusNode !== null
    || pausedSessionNode !== null
    || sessionBoardNode !== null
    || sessionScoreNode !== null
    || practicePromptNode !== null
    || sessionBottomFeedbackNode !== null
    || errorNode !== null;
  const practiceAnnouncement = error
    ? `Error. ${error}`
    : personalBestGuideVisible
      ? "Survival rules. The Run has not started."
    : personalBestRecordsVisible
      ? "Survival records. Puzzle and Arrow Duel bests are listed separately by level."
    : personalBestHubVisible
      ? "Survival setup. Choose Puzzle or Arrow Duel and a level."
    : isSessionGuideVisible
      ? `${sessionGuidePresentation?.focusedRun
        ? "Focused Run"
        : sessionGuidePresentation?.mode === "arrow_duel"
          ? "Arrow Duel"
          : "Sprint"} first-session guide. The timer has not started.`
    : boardFeedback
      ? `${boardFeedback.result === "correct" ? "Correct move" : "Wrong move"}. ${boardFeedback.puzzleSolved ? "Puzzle complete." : "Continue the puzzle."}`
      : isActive && displayedSideToMove
        ? state?.config.tacticalFocus
          ? `Focused Run. ${sideToMoveAccessibilityLabel(displayedSideToMove)}. ${(state.correctCount + state.mistakeCount)} completed, ${state.mistakeCount} mistakes.`
          : `${personalBestActivePresentation ? "Survival" : `${modeLabel(mode)} sprint`}. ${sideToMoveAccessibilityLabel(displayedSideToMove)}. ${state?.correctCount ?? 0} solved, ${state?.mistakeCount ?? 0} mistakes.`
        : `${screenTitle} screen`;

  function selectTopLevelTab(nextTab: TopLevelTab): void {
    const intent = topLevelTabIntent(nextTab);
    if (intent.kind === "open-review-queue") {
      openReviewQueue();
      return;
    }
    navigateToTab(intent.tab);
  }

  // The What's New notes wait for an idle Practice home: no Run on screen or
  // resumable, and no first-use guide, setup flow or loading screen in the way.
  const whatsNew = useWhatsNew({
    appVersion: platformCapabilities.applicationMetadata.versionName,
    platform: reminderPlatform,
    presentable: canPresentWhatsNew({
      practiceTabSelected: tab === "practice",
      openRun: state !== null,
      resumableRun: resumableSprint !== null,
      otherSurfaceActive: personalBestGuideVisible
        || personalBestHubVisible
        || personalBestRecordsVisible
        || isSessionGuideVisible
        || sprintRulesGuideVisible
        || startingMode !== null
        || (resolvedTacticalProfilePresentation?.screen ?? "home") !== "home"
        || (activeRunManagementScreen !== undefined && activeRunManagementScreen !== "home")
        || (activeRunManagementScreen === undefined && mode === "custom")
    }),
    service
  });

  const appShellHeader = appHeaderVisible ? (
    <View
      accessibilityLabel={screenSubtitle ? `${screenTitle}, ${screenSubtitle}` : screenTitle}
      style={[
        styles.header,
        iPadTopTabBarOverlayVisible
          ? styles.headerInTopTabScroll
          : practiceHeaderScrolls ? styles.headerInMainScroll : null,
        adaptiveLayout.usesWideContent && !sessionLayoutUsesRail && !appHeaderScrolls
          ? styles.contentWide
          : null
      ]}
      testID="app-shell-header"
    >
      <View>
        <Text
          maxFontSizeMultiplier={tab === "practice" || tab === "settings" ? LARGE_TITLE_MAX_FONT_SCALE : undefined}
          style={[styles.title, tab === "practice" || tab === "settings" ? styles.titleLarge : null]}
        >
          {screenTitle}
        </Text>
      </View>
      {simulationProfile?.active ? (
        <Text style={styles.simulationBadge} testID="simulation-profile-indicator">
          Simulation data
        </Text>
      ) : null}
    </View>
  ) : null;

  const appShell = (
      <View
        testID="safe-area-shell"
        style={[
          styles.safeArea,
          {
            // iOS tab content scrolls beneath the floating glass bar; the
            // opaque Android bottom navigation ends the content above it.
            paddingBottom: appChromeVisible && Platform.OS === "ios" ? 0 : layoutInsets.bottom,
            paddingLeft: layoutInsets.left,
            paddingRight: layoutInsets.right,
            paddingTop: iPadTopTabBarOverlayVisible ? 0 : layoutInsets.top
          },
          mobileBackPreview
            ? {
              borderRadius: mobileBackPreview.progress * 20,
              overflow: "hidden",
              transform: [
                { translateX: (mobileBackPreview.edge === "left" ? 1 : -1) * mobileBackPreview.progress * 36 },
                { scale: 1 - mobileBackPreview.progress * 0.04 }
              ]
            }
            : null
        ]}
      >
      <StatusBar barStyle={appTheme.statusBarStyle} />
      <View
        accessibilityLabel={`Layout ${adaptiveLayout.className}`}
        style={styles.appRootShell}
        testID="adaptive-layout"
      >
        <View
          accessible
          accessibilityLabel={practiceAnnouncement}
          accessibilityLiveRegion="polite"
          style={styles.accessibilityAnnouncement}
          testID="practice-announcement"
        />
        {startConflict ? (
          <StartConflictPrompt
            canDiscard={startConflict.sprint.config.survival === undefined}
            onCancel={() => setStartConflict(null)}
            onDiscard={discardUnfinishedRunAndStart}
            onResume={resumeUnfinishedRun}
          />
        ) : null}
        <View style={styles.appContentShell}>
          {sprintResultVisible && state && survivalResult && personalBestPresentation ? (
            <SurvivalResultScreen
              data={survivalResultDataFromSession({
                state,
                challengeType: personalBestPresentation.challengeType ?? "puzzle",
                level: personalBestPresentation.band,
                result: survivalResult
              })}
              notice={errorNode}
              paddingInsets={{ bottom: 0, left: 0, right: 0, top: 0 }}
              onBack={resetToIdle}
              onDone={resetToIdle}
              onPlayAgain={() => {
                resetToIdle();
                startPersonalBestChallenge();
              }}
              onReplayMistakes={sprintReplayItems.length > 0 ? () => showSessionReplay() : undefined}
            />
          ) : sprintResultVisible && state ? (
            <SprintResultScreen
              data={sprintResultDataFromSession({
                state,
                elapsedMs: isUntimedRun
                  ? untimedRunElapsedMs
                  : Math.min(sprintElapsedMs, state.config.durationSeconds * 1000),
                replayItems: sprintReplayItems,
                ...(storedSprintResultSummary ? { resultSummary: storedSprintResultSummary } : {}),
                ...(sprintRulesDesignPreview?.resultUnclearSummary
                  ? { unclearSummary: sprintRulesDesignPreview.resultUnclearSummary }
                  : {}),
                ...((storedSprintResultSummary?.averageSolveSeconds
                  ?? sprintRulesDesignPreview?.resultFocusedRunPace?.averageSolveSeconds) === undefined
                  ? {}
                  : {
                      averageSolveSeconds: storedSprintResultSummary?.averageSolveSeconds
                        ?? sprintRulesDesignPreview?.resultFocusedRunPace?.averageSolveSeconds
                    }),
                ...((focusedRunUsualSolveSeconds
                  ?? sprintRulesDesignPreview?.resultFocusedRunPace?.usualSolveSeconds) === undefined
                  ? {}
                  : {
                      usualSolveSeconds: focusedRunUsualSolveSeconds
                        ?? sprintRulesDesignPreview?.resultFocusedRunPace?.usualSolveSeconds
                    }),
                unclearPrompt,
                includePromptInCounts: sprintRulesDesignPreview?.initialResultUnclearPrompt !== undefined
              })}
              notice={errorNode}
              paddingInsets={{ bottom: 0, left: 0, right: 0, top: 0 }}
              onBack={resetToIdle}
              onMarkUnclear={toggleUnclearPrompt}
              onOpenHistory={() => {
                changeHistoryRatingKey(state.config.ratingKey);
                navigateToTab("history");
              }}
              onPlayAgain={() => {
                if (state.config.tacticalFocus) {
                  resetToIdle();
                  return;
                }
                if (state.run) {
                  startPracticeRun(state.run.id);
                  return;
                }
                startSprint(state.config.mode);
              }}
              onReplay={() => showSessionReplay()}
              onReplayMistakes={() => showSessionReplay("mistakes")}
            />
          ) : (
          <>
          {!appHeaderScrolls ? appShellHeader : null}

          <LegacyScrollView
            ref={setPracticeMainScrollRef}
            keyboardShouldPersistTaps="handled"
            testID="practice-main-scroll"
            scrollEnabled={!practiceScrollLocked && !isSessionGuideVisible}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={(_contentWidth, contentHeight) => {
              practiceMainScrollMetricsRef.current.contentHeight = contentHeight;
            }}
            onLayout={(event) => {
              practiceMainScrollMetricsRef.current.viewportHeight = event.nativeEvent.layout.height;
              nativeRunReorderScrollController.refreshBounds();
            }}
            onScroll={(event) => {
              practiceMainScrollMetricsRef.current.offsetY = event.nativeEvent.contentOffset.y;
            }}
            contentContainerStyle={[
              styles.content,
              // Rail layouts (live session, guide, Review and Replay) pack a
              // row wider than the 1120-point cap on the 13-inch iPad.
              adaptiveLayout.usesWideContent && !sessionLayoutUsesRail && !reviewUsesRail
                ? styles.contentWide
                : null,
              appChromeVisible
                ? {
                  paddingBottom: (Platform.OS === "ios" ? layoutInsets.bottom : 0)
                    + CONTENT_BOTTOM_PADDING
                }
                : null,
              sessionLayoutUsesRail ? styles.contentSessionRail : null,
              sessionLayoutUsesRail && adaptiveLayout.sessionCentersRow
                ? styles.contentSessionRailCentered
                : null,
              // On iPad the native top tab bar floats over the full tab
              // screen. Start the scroll content below it, while leaving the
              // scroll view itself at the top so the large page title and the
              // rest of the page can travel behind the glass.
              iPadTopTabBarOverlayVisible ? { paddingTop: layoutInsets.top } : null
            ]}
          >
            {appHeaderScrolls ? appShellHeader : null}
            {reviewReminderPermissionPromptVisible ? (
              <ReviewReminderPermissionPrompt
                onDismiss={dismissReviewReminderPermissionPrompt}
                onEnable={() => {
                  void requestReviewReminderPermission();
                }}
              />
            ) : null}
            {tab === "practice" ? (
              <>
                {personalBestHubVisible && personalBestPresentation ? (
                  <PersonalBestChallengeHub
                    initialSelection={personalBestSelectedSetup}
                    presentation={personalBestPresentation}
                    sourcePickerVisible={personalBestSourcePickerVisible}
                    onClose={() => {
                      setPersonalBestSourcePickerVisible(false);
                      setPersonalBestHubVisible(false);
                    }}
                    onCloseRecords={() => setPersonalBestRecordsVisible(false)}
                    onContinue={(runId) => {
                      const pausedRun = personalBestPresentation.pausedRuns?.find((run) => run.id === runId);
                      if (!pausedRun) {
                        return;
                      }
                      continuePersonalBestRun(pausedRun);
                    }}
                    onHowItWorks={(selection) => {
                      const { opponentReplyEnabled, ...selectedSetup } = selection;
                      setPersonalBestSelectedSetup(selectedSetup);
                      setPersonalBestGuideOpponentReplyEnabled(
                        opponentReplyEnabled ?? arrowDuelOpponentReplyGlobalEnabled
                      );
                      if (!personalBestChallengeDesignPreview) {
                        service.saveSurvivalRatingSourcePreference(
                          selection.challengeType,
                          selection.sourceId
                        );
                      }
                      setPersonalBestHubVisible(false);
                      setPersonalBestGuideIntent("learn-hub");
                    }}
                    onOpenRecords={() => {
                      setPersonalBestRecordsVisible(true);
                    }}
                    onSourcePickerVisibilityChange={setPersonalBestSourcePickerVisible}
                    recordsVisible={personalBestRecordsVisible}
                    onStart={(selection) => {
                      const selectedSetup: PersonalBestChallengeSelection = {
                        band: selection.band,
                        bestScore: selection.bestScore,
                        challengeType: selection.challengeType,
                        sourceId: selection.sourceId,
                        sourceRating: selection.sourceRating
                      };
                      setPersonalBestSelectedSetup(selectedSetup);
                      if (!personalBestChallengeDesignPreview) {
                        service.saveSurvivalRatingSourcePreference(
                          selection.challengeType,
                          selection.sourceId
                        );
                      }
                      setPersonalBestHubVisible(false);
                      startPersonalBestChallenge(selectedSetup);
                    }}
                  />
                ) : null}
                {personalBestGuideVisible && personalBestGuidePresentation ? (
                  <PersonalBestGuide
                    backAccessibilityLabel={personalBestGuideIntent === "first-entry"
                      ? "Back to Practice"
                      : "Back to Survival Hub"}
                    presentation={personalBestGuidePresentation}
                    onAcknowledge={acknowledgePersonalBestGuide}
                    onClose={closePersonalBestGuide}
                  />
                ) : null}
                {/* Keep the native Chessboard under the same parents when the
                    session switches between stacked and rail layouts. Moving
                    it between conditional branches remounts Skia and can leave
                    the piece sprite atlas blank while the board background is
                    already visible after rotation. */}
                {hasSessionLayoutContent ? (
                  <View
                    style={sessionLayoutUsesRail
                      ? [
                          styles.activeSessionAdaptiveLayout,
                          {
                            gap: adaptiveLayout.sessionRailGap,
                            width: sessionPackedRowWidth
                          }
                        ]
                      : styles.activeSessionStack}
                    testID={sessionLayoutUsesRail ? "active-session-adaptive-layout" : "stacked-session-layout"}
                  >
                    <View
                      style={sessionLayoutUsesRail
                        ? [styles.activeSessionBoardLane, { width: boardSize }]
                        : styles.activeSessionStack}
                      testID={sessionLayoutUsesRail ? "active-session-board-lane" : undefined}
                    >
                      {!sessionLayoutUsesRail ? sessionLayout.status : null}
                      {!sessionLayoutUsesRail ? sessionLayout.paused : null}
                      {!sessionLayoutUsesRail ? sessionLayout.prompt : null}
                      {sessionLayout.board}
                      {!sessionLayoutUsesRail ? sessionLayout.error : null}
                      {!sessionLayoutUsesRail ? sessionLayout.bottomFeedback : null}
                    </View>
                    {sessionLayoutUsesRail ? (
                      <ScrollView
                        ref={sessionRailScrollRef}
                        style={[
                          styles.activeSessionControlRailScroll,
                          {
                            height: boardSize,
                            width: adaptiveLayout.sessionRailWidth
                          }
                        ]}
                        contentContainerStyle={[
                          styles.activeSessionControlRailScrollContent,
                          {
                            minHeight: boardSize,
                            width: adaptiveLayout.sessionRailWidth
                          }
                        ]}
                        testID="active-session-control-rail"
                      >
                        <View
                          style={[
                            styles.activeSessionControlRail,
                            adaptiveLayout.sessionCentersRow
                              ? styles.activeSessionControlRailCentered
                              : null,
                            {
                              minHeight: boardSize,
                              width: adaptiveLayout.sessionRailWidth
                            }
                          ]}
                          testID="active-session-control-rail-content"
                        >
                          {sessionLayout.status}
                          {sessionLayout.prompt}
                          {sessionLayout.timing}
                          {sessionLayout.score}
                          {sessionLayout.error}
                          {sessionLayout.bottomFeedback}
                        </View>
                      </ScrollView>
                    ) : null}
                  </View>
                ) : null}

                {tacticalProfileFlowVisible && resolvedTacticalProfilePresentation ? (
                  <TacticalProfileFlow presentation={resolvedTacticalProfilePresentation} />
                ) : null}

                {!personalBestGuideVisible && !personalBestHubVisible && !personalBestRecordsVisible
                && !isSessionGuideVisible && !isOpenSession && state === null
                && (resolvedTacticalProfilePresentation?.screen ?? "home") === "home" && (
                  activeRunManagementPresentation?.screen === "home"
                  || (!activeRunManagementPresentation && mode !== "custom")
                ) ? (
                  <PracticeHome
                    adaptiveLayout={adaptiveLayout}
                    mode={mode}
                    modes={practiceModeSummaries}
                    currentRating={activeRunManagementPresentation
                      ? selectedManagedRun?.elo ?? RATING_FLOOR
                      : currentRating}
                    progress={practiceProgress}
                    personalBestChallenge={personalBestPresentation}
                    runManagement={activeRunManagementPresentation}
                    sprintRulesGuide={sprintRulesGuidePresentation}
                    sprintRulesGuideVisible={sprintRulesGuideVisible}
                    tacticalProfile={resolvedTacticalProfilePresentation}
                    resumableSprint={resumableSprint}
                    onDismissSprintRulesGuide={() => {
                      setSprintRulesGuideVisible(false);
                      if (sprintGuidanceEnabled) {
                        saveSprintGuideSeen("rules");
                      }
                    }}
                    onOpenSprintRulesGuide={() => setSprintRulesGuideVisible(true)}
                    onOpenPersonalBestHub={(run) => {
                      if (run) {
                        selectPersonalBestPausedRun(run);
                      }
                      const showFirstEntryGuide = personalBestChallengeDesignPreview
                        ? personalBestChallengeDesignPreview.homeGuideOnFirstEntry === true
                          && !personalBestFirstEntryGuideAcknowledged
                        : !service.getSurvivalPreferences().guideSeen;
                      if (showFirstEntryGuide) {
                        setPersonalBestGuideOpponentReplyEnabled(
                          run?.opponentReplyEnabled ?? arrowDuelOpponentReplyGlobalEnabled
                        );
                        setPersonalBestHubVisible(false);
                        setPersonalBestGuideIntent("first-entry");
                        return;
                      }
                      setPersonalBestHubVisible(true);
                    }}
                    onSelectMode={setMode}
                    onStartMode={(nextMode) => startSprint(nextMode)}
                    onResumeSprint={resumeSprint}
                    nativeRunReorderScrollController={nativeRunReorderScrollController}
                    runReorderDesignPreview={runReorderDesignPreview}
                    onRunReorderFeedbackPreview={playRunReorderPickupFeedback}
                  />
                ) : null}

                {practiceRunEditorVisible && activeRunManagementPresentation ? (
                  <PracticeRunEditor
                    arrowDuelOpponentReplyGlobalEnabled={
                      arrowDuelOpponentReplyGlobalEnabled
                    }
                    arrowDuelReplyChallenge={
                      activeRunManagementPresentation.draft?.mode === "arrow_duel"
                        ? {
                            enabled: sprintRulesDesignPreview?.arrowDuelReplyChallenge
                              ? arrowDuelReplyChallengeEnabled
                              : activeRunManagementPresentation.draft.opponentReply?.enabled ?? true,
                            replySecondsError: sprintRulesDesignPreview?.arrowDuelReplyChallenge
                              ? !arrowDuelReplyChallengeEnabled
                                || (
                                  /^[1-9]\d*$/.test(arrowDuelReplySecondsInput)
                                  && Number.isSafeInteger(Number(arrowDuelReplySecondsInput))
                                  && Number(arrowDuelReplySecondsInput) <= OPPONENT_REPLY_MAX_SECONDS
                                )
                                ? null
                                : `Enter a positive whole number up to ${OPPONENT_REPLY_MAX_SECONDS} seconds.`
                              : activeRunManagementPresentation.opponentReplySecondsError ?? null,
                            replySecondsInput: sprintRulesDesignPreview?.arrowDuelReplyChallenge
                              ? arrowDuelReplySecondsInput
                              : activeRunManagementPresentation.opponentReplySecondsInput
                                ?? String(
                                  activeRunManagementPresentation.draft.opponentReply?.seconds
                                    ?? DEFAULT_OPPONENT_REPLY_SECONDS
                                ),
                            onReplySecondsInputChange: sprintRulesDesignPreview?.arrowDuelReplyChallenge
                              ? (value: string) => {
                                  if (!/^\d*$/.test(value)) {
                                    return;
                                  }
                                  setArrowDuelReplySecondsInput(value);
                                  const parsed = Number(value);
                                  if (
                                    /^[1-9]\d*$/.test(value)
                                    && Number.isSafeInteger(parsed)
                                    && parsed <= OPPONENT_REPLY_MAX_SECONDS
                                  ) {
                                    setArrowDuelReplySeconds(parsed);
                                  }
                                }
                              : (value: string) => activeRunManagementPresentation.onIntent({
                                  type: "change-opponent-reply-seconds-input",
                                  value
                                }),
                            onToggle: sprintRulesDesignPreview?.arrowDuelReplyChallenge
                              ? () => setArrowDuelReplyChallengeEnabled((current) => !current)
                              : () => activeRunManagementPresentation.onIntent({
                                  type: "toggle-opponent-reply"
                                })
                          }
                        : undefined
                    }
                    presentation={activeRunManagementPresentation}
                    showSprintRulesSummary={
                      sprintGuidanceEnabled
                      || sprintRulesDesignPreview?.showRunEditorSummary === true
                    }
                    themeCatalogPresentation={themeCatalogPresentation}
                    timeoutCountsAsMistake={
                      sprintGuidanceEnabled
                      || sprintRulesDesignPreview?.timeoutCountsAsMistake === true
                    }
                  />
                ) : null}

                {customSprintSetupVisible ? (
                  <CustomSprintSetup
                    durationSeconds={customDurationSeconds}
                    perPuzzleSeconds={customPerPuzzleSeconds}
                    selectedThemes={selectedCustomThemes}
                    themeCatalogPresentation={themeCatalogPresentation}
                    targetCorrect={selectedConfig.targetCorrect}
                    maxMistakes={selectedConfig.maxMistakes}
                    availablePuzzleCount={customEligiblePuzzleCount}
                    ratingKey={selectedConfig.ratingKey}
                    initialRating={displayedCustomInitialRating}
                    initialRatingEditorOpen={customRatingEditorOpen}
                    ratingPlayed={customRatingPlayed}
                    progress={practiceProgress}
                    onInitialRatingChange={(nextRating) => {
                      if (customRatingPlayed) {
                        const next = service.setRating(selectedConfig.ratingKey, nextRating);
                        setCustomInitialRating(next.rating);
                        setSettingsRevision((current) => current + 1);
                        return;
                      }
                      setCustomInitialRating(nextRating);
                    }}
                    onInitialRatingEditorOpenChange={setCustomRatingEditorOpen}
                    onDurationChange={setCustomDurationSeconds}
                    onClose={() => {
                      setCustomRatingEditorOpen(false);
                      setMode("standard");
                    }}
                    customMode={customSprintMode}
                    onCustomModeChange={setCustomSprintMode}
                    onPerPuzzleChange={setCustomPerPuzzleSeconds}
                    onThemeIntent={customThemeChoices.dispatch}
                    previousConfigs={service.listCustomSprintConfigs()}
                    ratingForKey={(key) => service.getRating(key).rating}
                    onStart={() => startSprint(customSprintMode, true)}
                  />
                ) : null}

                {!isSessionGuideVisible
                  && !isActive
                  && state === null
                  && arePracticeTestControlsEnabled()
                  && !isStoreAssetCaptureEnabled()
                  && configurePuzzleSource ? (
                  <TestPuzzleSourceControl
                    source={puzzleSource}
                    onChange={changePuzzleSource}
                    onInjectMateIn2FocusedRun={injectTestMateIn2FocusedRun}
                    {...(seedTacticalHistory && puzzleSource === "bundledCore"
                      ? { onSeedTacticalHistory: seedTestTacticalHistory }
                      : {})}
                    seededHistoryStatus={seededHistoryStatus}
                    onShowWhatsNew={whatsNew.open}
                    onSimulateWhatsNewUpdate={whatsNew.simulateUpdate}
                    {...(simulationProfile
                      ? {
                          simulationActive: simulationProfile.active,
                          onToggleSimulation: () => runSimulationProfileAction(
                            () => simulationProfile.setActive(!simulationProfile.active)
                          ),
                          onClearSimulation: () => runSimulationProfileAction(
                            () => simulationProfile.clear()
                          )
                        }
                      : {})}
                  />
                ) : null}
              </>
            ) : null}

            {tab === "history" ? (
              historyUnavailableAttempt ? (
                <HistoryAttemptReplayUnavailable
                  adaptiveLayout={adaptiveLayout}
                  attempt={historyUnavailableAttempt.attempt}
                  currentTimeMs={currentTimeMs}
                  replayAvailability={historyUnavailableAttempt.replayAvailability}
                  onClearUnclear={() => clearHistoryAttemptUnclear(historyUnavailableAttempt.attempt.id)}
                  onReviewChanged={reviewScheduleChanged}
                  onReturn={() => setHistoryUnavailableAttempt(null)}
                  service={service}
                />
              ) : historyReviewEntries.length > 0 ? (
                <ReviewSession
                  key={`history:${historyReviewEntries.map((entry) => entry.attempt?.id ?? entry.puzzle.id).join("|")}:${historyReviewInitialIndex}`}
                  adaptiveLayout={adaptiveLayout}
                  boardBlocksExternalGesture={practiceScrollGestureRef}
                  boardSize={boardSize}
                  currentTimeMs={currentTimeMs}
                  deferBackRelevantTransition={deferBackRelevantTransition}
                  entries={historyReviewEntries}
                  explicitReplySideCopy={explicitReplySideCopy}
                  opponentReplySettingsHint={opponentReplySettingsHint}
                  initialIndex={historyReviewInitialIndex}
                  moveFeedbackClient={moveFeedbackClient}
                  service={service}
                  systemBackCommand={reviewBackCommand}
                  onAnalysisActiveChange={setReviewAnalysisOpen}
                  onAttemptClearUnclear={clearHistoryAttemptUnclear}
                  onBoardTouchActiveChange={setReviewBoardTouchActive}
                  onComplete={() => setHistoryReviewEntries([])}
                  onReviewEnrollmentChanged={reviewScheduleChanged}
                  onReturnToOwner={() => setHistoryReviewEntries([])}
                  replayTerminology
                  reviewScheduleControlVisible
                  stockfish={stockfish}
                />
              ) : resolvedHistoryProgressPresentation && historyProgressOpen ? (
                <View
                  style={[
                    styles.historyPanel,
                    adaptiveLayout.usesWideContent ? styles.historyPanelWide : null
                  ]}
                >
                  <HistoryProgressScreen
                    presentation={resolvedHistoryProgressPresentation}
                    onBack={() => setHistoryProgressOpen(false)}
                  />
                </View>
              ) : historyView ? (
                <HistoryPanel
                  adaptiveLayout={adaptiveLayout}
                  attempts={visibleHistoryAttempts}
                  nowMs={nowMs}
                  performance={historyPerformanceView?.performance ?? emptyHistoryPerformance()}
                  ratingKeys={historyRatingKeys}
                  runsByRatingKey={historyRunsByRatingKey}
                  selectedRatingKey={activeHistoryRatingKey}
                  timeRange={historyTimeRange}
                  sourceFilter={historySourceFilter}
                  resultFilter={historyResultFilter}
                  ratingRangeFilter={historyRatingRangeFilter}
                  sideFilter={historySideFilter}
                  themeFilters={historyThemeChoices.selection}
                  namedThemeFilters={historyThemeChoices.namedThemes}
                  availableThemes={historyView.availableThemes}
                  page={visibleHistoryPage ?? historyView.page}
                  attentionReasons={historyAttentionReasons}
                  themeCatalogPresentation={themeCatalogPresentation}
                  filtersExpanded={historyFiltersExpanded}
                  onFiltersExpandedChange={setHistoryFiltersExpanded}
                  onRatingKeyChange={changeHistoryRatingKey}
                  onTimeRangeChange={changeHistoryTimeRange}
                  onSourceFilterChange={changeHistorySourceFilter}
                  onResultFilterChange={changeHistoryResultFilter}
                  onRatingRangeFilterChange={changeHistoryRatingRangeFilter}
                  onSideFilterChange={changeHistorySideFilter}
                  onThemeFilterIntent={applyHistoryThemeIntent}
                  onAttentionReasonChange={toggleHistoryAttentionReason}
                  onAttentionOnlyChange={changeHistoryAttentionOnly}
                  onPageOffsetChange={setHistoryPageOffset}
                  onOpenAttempt={openHistoryReview}
                  onOpenProgress={resolvedHistoryProgressPresentation ? openHistoryProgress : undefined}
                  onResetFilters={resetHistoryFilters}
                />
              ) : null
            ) : null}
            {tab === "review" ? (
              <ReviewPanel
                adaptiveLayout={adaptiveLayout}
                boardBlocksExternalGesture={practiceScrollGestureRef}
                boardSize={boardSize}
                dueReviewItems={dueReviewItems}
                explicitReplySideCopy={explicitReplySideCopy}
                opponentReplySettingsHint={opponentReplySettingsHint}
                nowMs={nowMs}
                reviewQueue={reviewQueue}
                currentTimeMs={currentTimeMs}
                deferBackRelevantTransition={deferBackRelevantTransition}
                moveFeedbackClient={moveFeedbackClient}
                service={service}
                sessionReplayItems={sessionReplayItems}
                onExitSessionReview={exitSessionReview}
                onReviewRecorded={(completedAt) => {
                  const completedAtMs = new Date(completedAt).getTime();
                  if (Number.isFinite(completedAtMs) && completedAtMs > nowMsRef.current) {
                    nowMsRef.current = completedAtMs;
                    setNowMs(completedAtMs);
                  }
                  const nextScheduledReviewAttemptCount = scheduledReviewAttemptCount(service);
                  if (
                    scheduledReviewAttemptCountRef.current !== null
                    && nextScheduledReviewAttemptCount > scheduledReviewAttemptCountRef.current
                  ) {
                    maybeShowReviewReminderPermissionPrompt();
                  }
                  scheduledReviewAttemptCountRef.current = nextScheduledReviewAttemptCount;
                  refreshState();
                }}
                onReviewScheduleChanged={reviewScheduleChanged}
                onSessionAttemptClearUnclear={clearSessionReplayUnclear}
                onPromoteNextFutureReviewsToDue={arePracticeTestControlsEnabled() ? promoteNextFutureReviewsToDue : undefined}
                onScheduleTestReviewReminder={arePracticeTestControlsEnabled() ? scheduleDevReviewReminderNotification : undefined}
                onSessionSourceChange={setReviewSessionSource}
                onAnalysisActiveChange={setReviewAnalysisOpen}
                onBoardTouchActiveChange={setReviewBoardTouchActive}
                filtersExpanded={reviewFiltersExpanded}
                onFiltersExpandedChange={setReviewFiltersExpanded}
                reviewReminderScheduleStatus={arePracticeTestControlsEnabled() ? reviewReminderScheduleStatus : undefined}
                stockfish={stockfish}
                systemBackCommand={reviewBackCommand}
              />
            ) : null}
            {tab === "settings" ? (
              <SettingsPanel
                adaptiveLayout={adaptiveLayout}
                applicationMetadata={platformCapabilities.applicationMetadata}
                arrowDuelOpponentReplyGlobalSetting={
                  {
                    enabled: arrowDuelOpponentReplyGlobalEnabled,
                    onChange: saveArrowDuelOpponentReplyGlobalEnabled
                  }
                }
                feedbackIssuesOpener={feedbackIssuesOpener}
                progressProtection={progressProtection}
                standardRating={readRating(service, defaultSprintConfig("standard").ratingKey)}
                ratings={[
                  { label: "Standard", record: service.getRating(defaultSprintConfig("standard").ratingKey) },
                  { label: "Arrow Duel", record: service.getRating(defaultSprintConfig("arrow_duel").ratingKey) }
                ]}
                onOpenDiagnostics={arePracticeTestControlsEnabled() ? () => navigateToTab("analysis") : undefined}
                onOpenWhatsNew={whatsNew.open}
                onAdjustRating={(ratingKey, nextRating) => {
                  const next = service.setRating(ratingKey, nextRating);
                  setSettingsRevision((current) => current + 1);
                  return next;
                }}
                notificationPermissionStatus={notificationPermissionStatus}
                reminderPlatform={reminderPlatform}
                reviewReminderScheduleStatus={reviewReminderScheduleStatus}
                reviewReminderPreference={reviewReminderPreference}
                showRatingControls={!ratingEditingMovedToHome}
                captureBottomInset={settingsCaptureBottomInset}
                iCloudSyncEnabled={iCloudSyncEnabled}
                iCloudSyncErrorDetails={effectiveErrorDetails}
                iCloudSyncInProgress={iCloudSyncInProgress}
                iCloudSyncStatus={iCloudSyncErrorDetails ? "iCloud sync failed" : iCloudSyncStatus}
                iCloudSyncSupportBundle={effectiveSupportBundle}
                appearance={appearance}
                moveFeedbackPreferences={moveFeedbackPreferences}
                moveFeedbackPreviewer={moveFeedbackSettings?.preview}
                showSprintGuideReset={
                  sprintGuidanceEnabled
                  || sprintRulesDesignPreview?.showSettingsReset === true
                }
                advancedRatingsOpen={settingsAdvancedRatingsOpen}
                onAdvancedRatingsOpenChange={setSettingsAdvancedRatingsOpen}
                onAppearanceChange={saveAppearance}
                onMoveFeedbackPreferencesChange={saveMoveFeedbackPreferences}
                onOpenNotificationSettings={openReviewReminderSystemSettings}
                onRequestReviewReminderPermission={() => requestReviewReminderPermission()}
                onSaveReviewReminderPreference={saveReviewReminderPreference}
                onSaveICloudSyncEnabled={saveICloudSyncEnabled}
                onResetSprintGuides={() => {
                  const settings = service.getSettings();
                  service.saveSettings({
                    ...settings,
                    sprintGuides: resetSprintGuideProgress()
                  });
                  setSprintRulesGuideVisible(true);
                  setSettingsRevision((current) => current + 1);
                }}
                onSyncICloudNow={() => runICloudProgressSync("manual")}
              />
            ) : null}
            {tab === "analysis" && arePracticeTestControlsEnabled() ? (
              <StockfishDiagnosticsPanel stockfish={stockfish} />
            ) : null}
          </LegacyScrollView>
          </>
          )}
        </View>
        {startingMode ? (
          <View
            accessibilityLabel={`Preparing ${modeLabel(startingMode)} sprint`}
            accessibilityRole="progressbar"
            accessibilityViewIsModal
            style={styles.sprintLoadingOverlay}
            testID="sprint-loading-overlay"
          >
            <View style={styles.sprintLoadingCard}>
              <ActivityIndicator color={appTheme.colors.accent.s600} size="large" testID="sprint-loading-spinner" />
              <Text style={styles.sprintLoadingTitle}>Preparing {modeLabel(startingMode)}</Text>
              <Text style={styles.sprintLoadingDetail}>Loading puzzles and setting up the board</Text>
            </View>
          </View>
        ) : null}
      </View>
      {isSessionGuideVisible && sessionGuide && sessionGuideStep ? (
        <SessionGuideOverlay
          {...sessionGuideStepCopy(sessionGuideStep, {
            focusedRun: sessionGuide.presentation.focusedRun === true,
            mode: sessionGuide.presentation.mode
          })}
          canGoBack={sessionGuide.stepIndex > 0}
          insets={insets}
          measureKey={[
            sessionGuideStep,
            sessionGuide.stepIndex,
            adaptiveLayout.className,
            boardSize,
            width,
            height,
            sessionGuideTargetRevision
          ].join(":")}
          nextLabel={sessionGuide.stepIndex < sessionGuide.plan.steps.length - 1
            ? "Next"
            : sessionGuideStartLabel({
                focusedRun: sessionGuide.presentation.focusedRun === true,
                mode: sessionGuide.presentation.mode
              })}
          note={sessionGuideStep === "arrow_duel_reply"
            && sessionGuide.presentation.opponentReplySettingsHint === true
            ? ARROW_DUEL_OPTIONAL_SETTINGS_COPY
            : undefined}
          stepNumber={sessionGuide.stepIndex + 1}
          stepTestID={`practice-session-guide-step-${sessionGuideStep}`}
          targetRef={sessionGuideTargetRef}
          testID={sessionGuideContainerTestID(sessionGuideStep)}
          totalSteps={sessionGuide.plan.steps.length}
          onBack={showPreviousSessionGuideStep}
          onExit={dismissSessionGuide}
          onNext={continueSessionGuide}
          clipRef={sessionLayoutUsesRail && sessionGuideStep !== "arrow_duel_choice"
            && sessionGuideStep !== "arrow_duel_reply"
            ? sessionRailScrollRef
            : undefined}
          onRequestScroll={(deltaY, scope) => {
            if (scope === "clip") {
              const rail = sessionRailScrollRef.current;
              if (deltaY > 0) {
                rail?.scrollToEnd({ animated: true });
              } else {
                rail?.scrollTo({ animated: true, y: 0 });
              }
              return;
            }
            const scrollView = practiceMainScrollRef.current;
            if (!scrollView) {
              return;
            }
            scrollView.scrollTo({
              animated: true,
              y: Math.max(0, practiceMainScrollMetricsRef.current.offsetY + deltaY)
            });
          }}
        />
      ) : null}
      <WhatsNewSheet
        content={whatsNew.content}
        visible={whatsNew.visible}
        onContinue={whatsNew.dismiss}
      />
      </View>
  );

  return (
    <UiHapticsProvider value={uiHaptics}>
      <GestureHandlerRootView
        style={styles.predictiveBackStage}
        testID="practice-gesture-root"
      >
        {mobileBackPreview ? (
          <View
            accessible={false}
            style={styles.predictiveBackDestination}
            testID="mobile-back-destination-preview"
          >
            <Text style={styles.predictiveBackEyebrow}>Back to</Text>
            <Text style={styles.predictiveBackDestinationLabel} testID="mobile-back-destination-preview-label">
              {mobileBackPreview.label}
            </Text>
            <Text style={FABRIC_SAFE_HIDDEN_TEXT_STYLE} testID="mobile-back-destination-preview-id">
              {mobileBackPreview.testID}
            </Text>
          </View>
        ) : null}
        <NativeTabHost
          chromeHidden={!appChromeVisible}
          colorScheme={appTheme.name}
          colors={{
            accent: appTheme.colors.accent.s600,
            androidBarBackground: appTheme.colors.surface,
            androidIndicator: appTheme.colors.accent.s100,
            androidInactive: appTheme.colors.text.secondary,
            background: appTheme.colors.surfaceRaised,
            badgeBackground: appTheme.colors.danger.s600,
            badgeDangerBackground: appTheme.colors.danger.s600,
            badgeText: appTheme.colors.text.onAccent
          }}
          dueReviewCount={dueTodayCount}
          overdueReviewCount={overdueCount}
          selectedTab={hostTab}
          onSelectionOutcome={(outcome) => selectTopLevelTab(outcome.tab)}
          renderTab={(candidate) => candidate === hostTab ? (
            <>
              {appChromeVisible ? <TabContentInsetsReporter onChange={setTabContentInsets} /> : null}
              {appShell}
            </>
          ) : null}
        />
      </GestureHandlerRootView>
    </UiHapticsProvider>
  );
}

type SessionLayoutNodes = {
  board: React.ReactNode;
  bottomFeedback: React.ReactNode;
  error: React.ReactNode;
  paused: React.ReactNode;
  prompt: React.ReactNode;
  score: React.ReactNode;
  status: React.ReactNode;
  timing: React.ReactNode;
};

const SESSION_GUIDE_DEMO_FEN = "7k/8/5KQ1/8/8/8/8/8 w - - 0 1";
const SESSION_GUIDE_DEMO_CURRENT_PUZZLE: CurrentPuzzleState = {
  autoPlayedMoves: [],
  currentFen: SESSION_GUIDE_DEMO_FEN,
  cursor: 0,
  kind: "line",
  playedMoves: [],
  puzzle: {
    id: "session-guide-qg7-mate",
    initialFen: SESSION_GUIDE_DEMO_FEN,
    rating: 800,
    solutionMoves: ["g6g7"],
    source: "synthetic",
    themes: ["mateIn1"]
  },
  solved: false
};
const ARROW_DUEL_GUIDE_DEMO_CURRENT_PUZZLE: ArrowDuelState = {
  candidates: ["g6g7", "g6e8"],
  correctMove: "g6g7",
  currentFen: SESSION_GUIDE_DEMO_FEN,
  kind: "arrow_duel",
  phase: "choice",
  puzzle: {
    id: "arrow-duel-guide-qg7-mate",
    initialFen: SESSION_GUIDE_DEMO_FEN,
    rating: 800,
    solutionMoves: ["g6e8"],
    source: "synthetic",
    stockfishBestMove: "g6g7",
    stockfishEval: 900,
    stockfishEvalAfterFirstMove: 120,
    themes: ["mateIn1"]
  },
  solved: false,
  wrongMove: "g6e8"
};
const ARROW_DUEL_REPLY_GUIDE_DEMO_FEN = "4Q2k/8/5K2/8/8/8/8/8 b - - 1 1";
const ARROW_DUEL_REPLY_GUIDE_DEMO_CURRENT_PUZZLE: ArrowDuelState = {
  ...ARROW_DUEL_GUIDE_DEMO_CURRENT_PUZZLE,
  currentFen: ARROW_DUEL_REPLY_GUIDE_DEMO_FEN,
  phase: "reply",
  puzzle: {
    ...ARROW_DUEL_GUIDE_DEMO_CURRENT_PUZZLE.puzzle,
    solutionMoves: ["g6e8", "h8h7"]
  }
};
// Seconds shown on the puzzle timer: amber on the slow-timer step only.
const SESSION_GUIDE_SLOW_ELAPSED_SECONDS = 40;
const SESSION_GUIDE_TIMEOUT_SECONDS = 60;

function sessionGuideDemoState(
  presentation: SprintSessionGuidePresentation,
  currentPuzzle: CurrentPuzzleState
): SprintState {
  const mode = presentation.mode;
  return {
    bestStreak: 0,
    config: {
      ...defaultSprintConfig(mode),
      maxMistakes: presentation.maxMistakes,
      targetCorrect: presentation.targetCorrect,
      ...(presentation.focusedRun
        ? {
            maxAttempts: presentation.maxAttempts ?? presentation.targetCorrect,
            ratingPolicy: "unrated" as const,
            runClock: "untimed" as const,
            tacticalFocus: {
              taskFamily: mode === "arrow_duel" ? "arrow_duel" as const : "line" as const,
              themes: ["fork"],
              mixedControlCount: 5,
              ratingAnchor: 1087,
              minRating: 987,
              maxRating: 1187
            }
          }
        : {})
    },
    correctCount: 0,
    currentPuzzle,
    currentPuzzleIndex: 0,
    currentStreak: 0,
    deadlineAt: "2026-01-01T00:05:00.000Z",
    hasUserSubmittedMove: false,
    id: "session-guide-demo",
    mistakeCount: 0,
    puzzles: [currentPuzzle.puzzle],
    ratingBefore: RATING_FLOOR,
    startedAt: "2026-01-01T00:00:00.000Z",
    status: "active"
  };
}

const ARROW_DUEL_REPLY_GUIDE_LAST_MOVE: BoardMove = { from: "g6", to: "e8" };

// Builds the session layout slots for one first-use guide step from the same
// components the live session uses. The frozen example never starts a clock or
// accepts moves; the current step's target carries `targetRef`.
function buildSessionGuideStageNodes({
  adaptiveLayout,
  appTheme,
  boardSize,
  presentation,
  step,
  styles,
  targetRef,
  onExit,
  onTargetLayout
}: {
  adaptiveLayout: AdaptiveLayout;
  appTheme: Theme;
  boardSize: number;
  presentation: SprintSessionGuidePresentation;
  step: SprintSessionGuideStep;
  styles: ReturnType<typeof useStyles>;
  targetRef: React.RefObject<View | null>;
  onExit: () => void;
  onTargetLayout: () => void;
}): SessionLayoutNodes {
  const usesRail = adaptiveLayout.usesSessionRail;
  const isArrowDuel = presentation.mode === "arrow_duel";
  const isReplyStep = step === "arrow_duel_reply";
  const replyChallenge = presentation.arrowDuelReplyOnboarding === "choice_then_reply";
  const currentPuzzle: CurrentPuzzleState = isArrowDuel
    ? isReplyStep
      ? ARROW_DUEL_REPLY_GUIDE_DEMO_CURRENT_PUZZLE
      : ARROW_DUEL_GUIDE_DEMO_CURRENT_PUZZLE
    : SESSION_GUIDE_DEMO_CURRENT_PUZZLE;
  const guideState = sessionGuideDemoState(presentation, currentPuzzle);
  const slotWidth = adaptiveLayout.sessionColumnWidth;
  const targetsBoard = step === "arrow_duel_choice" || step === "arrow_duel_reply";
  const settingsHint = presentation.opponentReplySettingsHint
    ? "Optional · Turn off in Settings"
    : undefined;
  const noop = (): void => undefined;

  const timing = (
    <PuzzleTimingIndicator
      elapsedSeconds={step === "slow_timer" ? SESSION_GUIDE_SLOW_ELAPSED_SECONDS : 0}
      phase={step === "slow_timer" ? "slow" : "normal"}
      targetRef={step === "slow_timer" ? targetRef : undefined}
      timeoutSeconds={SESSION_GUIDE_TIMEOUT_SECONDS}
      onTargetLayout={step === "slow_timer" ? onTargetLayout : undefined}
    />
  );
  const score = <SessionScoreStrip compact={usesRail} state={guideState} />;
  const board = (
    <View key="session-board" style={styles.boardWrapper}>
      <View
        accessible
        accessibilityLabel={isArrowDuel
          ? isReplyStep
            ? "Example Arrow Duel reply position, Black to move after the other move"
            : "Example Arrow Duel puzzle, White to move, two candidate arrows"
          : "Example chess puzzle, White to move"}
        accessibilityRole="image"
        collapsable={false}
        ref={targetsBoard ? targetRef : undefined}
        style={[styles.boardSurface, { height: boardSize, width: boardSize }]}
        testID="practice-session-guide-board"
        onLayout={targetsBoard ? onTargetLayout : undefined}
      >
        <Chessboard
          key={currentPuzzle.currentFen}
          fen={currentPuzzle.currentFen}
          gestureEnabled={false}
          draggableColor={null}
          boardSize={boardSize}
          flipped={false}
          withLetters={false}
          withNumbers={false}
          durations={CHESSBOARD_DURATIONS}
          spriteSource={CHESS_PIECE_SPRITE}
          colors={chessboardColorsFor(appTheme)}
          squareHighlights={isReplyStep
            ? boardMoveSquareTints(ARROW_DUEL_REPLY_GUIDE_LAST_MOVE, appTheme.colors.board.lastMoveSquare)
            : undefined}
        />
        <BoardCoordinateOverlay boardSize={boardSize} flipped={false} />
        <BoardInputBlocker />
        {isArrowDuel && !isReplyStep && currentPuzzle.kind === "arrow_duel" ? (
          <ArrowCandidateOverlay
            boardSize={boardSize}
            candidates={currentPuzzle.candidates}
            flipped={false}
            testID="practice-arrow-duel-guide-candidates"
          />
        ) : null}
        {isReplyStep ? (
          <LastMoveOverlay
            boardSize={boardSize}
            move={ARROW_DUEL_REPLY_GUIDE_LAST_MOVE}
            overlayTestID="practice-arrow-duel-guide-reply-last-move"
          />
        ) : null}
      </View>
      {!usesRail ? (
        <View
          style={[styles.sessionBoardDetails, { width: adaptiveLayout.sessionColumnWidth }]}
          testID="session-board-details"
        >
          {timing}
          {score}
        </View>
      ) : null}
    </View>
  );

  return {
    board,
    bottomFeedback: step === "mark_unclear" ? (
      <View
        collapsable={false}
        style={[
          styles.activeSessionBottomFeedback,
          usesRail && !adaptiveLayout.sessionCentersRow
            ? styles.activeSessionRailBottomFeedback
            : null,
          { width: slotWidth }
        ]}
      >
        <UnclearAttemptPrompt
          marked={false}
          question="Was the previous puzzle clear?"
          targetRef={targetRef}
          onTargetLayout={onTargetLayout}
          onToggle={noop}
        />
      </View>
    ) : null,
    error: null,
    paused: null,
    prompt: (
      <View
        style={[styles.practicePromptStack, { width: slotWidth }]}
        testID="practice-session-guide-prompt"
      >
        {isArrowDuel && replyChallenge && currentPuzzle.kind === "arrow_duel" ? (
          <ArrowDuelReplyChallengePrompt
            currentPuzzle={currentPuzzle}
            explicitReplySideCopy
            frameHeight={adaptiveLayout.promptFrameHeight}
            hideSideGlyph={slotWidth < 240}
            kingPieceSize={kingGlyphSizeForBoard(boardSize)}
            phase={isReplyStep ? "reply" : "choice"}
            promptSide={isReplyStep ? "b" : "w"}
            replyReady
            replySeconds={DEFAULT_OPPONENT_REPLY_SECONDS}
            rootTestID="practice-prompt"
            settingsHint={settingsHint}
            testIDPrefix="practice-arrow-duel-guide"
          />
        ) : (
          <PracticePrompt
            currentPuzzle={currentPuzzle}
            frameHeight={adaptiveLayout.promptFrameHeight}
            kingPieceSize={kingGlyphSizeForBoard(boardSize)}
            mode={presentation.mode}
          />
        )}
      </View>
    ),
    score: usesRail ? score : null,
    status: (
      <SessionStatusBar
        closeAccessibilityLabel="Exit guide"
        compactMetrics={usesRail}
        confirmAbandon={false}
        metricsRef={step === "session_progress" ? targetRef : undefined}
        mode={presentation.mode}
        state={guideState}
        timerText={presentation.durationLabel}
        onClose={onExit}
        onConfirmAbandonChange={noop}
        onMetricsLayout={step === "session_progress" ? onTargetLayout : undefined}
        onPause={noop}
      />
    ),
    timing: usesRail ? timing : null
  };
}

function bundledCoreCustomEligiblePuzzleCount(theme: string | undefined): number {
  const manifest = getBundledCorePackManifest();
  if (!theme) {
    return manifest.puzzleCount;
  }
  return manifest.themeCounts?.[theme] ?? 0;
}

function screenTitleFor(tab: Tab): string {
  if (tab === "analysis") {
    return "Analysis";
  }
  return tab.charAt(0).toUpperCase() + tab.slice(1);
}

function screenSubtitleFor(tab: Tab): string | null {
  if (tab === "review") {
    return "Scheduled mistake review";
  }
  if (tab === "history") {
    return "Rating trend and attempts";
  }
  if (tab === "settings") {
    return "Sync, data, and ratings";
  }
  if (tab === "analysis") {
    return "Native Stockfish diagnostics";
  }
  return null;
}

function sprintConfigFor(
  mode: SprintMode,
  customDurationSeconds: number,
  customPerPuzzleSeconds: number,
  useCustomTiming = mode === "custom",
  themes: readonly string[] = []
): SprintConfig {
  if (!useCustomTiming) {
    return defaultSprintConfig(mode);
  }
  const input: {
    mode: SprintMode;
    durationSeconds: number;
    perPuzzleSeconds: number;
    themes?: readonly string[];
  } = {
    mode,
    durationSeconds: customDurationSeconds,
    perPuzzleSeconds: customPerPuzzleSeconds
  };
  if (themes.length > 0) {
    input.themes = themes;
  }
  return buildSprintConfig(input);
}

function readRating(service: PracticeService, ratingKey: string): number {
  return service.getRating(ratingKey).rating;
}

function shouldFlipBoard(currentPuzzle: CurrentPuzzleState): boolean {
  const perspectiveFen = currentPuzzle.kind === "arrow_duel"
    ? currentPuzzle.puzzle.initialFen
    : currentPuzzle.currentFen;
  return sideToMove(perspectiveFen) === "b";
}

const useStyles = makeStyles((theme) => ({
  ...pickPracticeStyles(theme, ["historyPanel", "historyPanelWide", "reviewDueHiddenMetric"]),
  accessibilityAnnouncement: {
    height: 1,
    left: -10000,
    opacity: 0.01,
    position: "absolute",
    top: 0,
    width: 1
  },
  predictiveBackStage: {
    backgroundColor: theme.colors.backGesture.stage,
    flex: 1
  },
  predictiveBackDestination: {
    alignItems: "center",
    backgroundColor: theme.colors.backGesture.stage,
    bottom: 0,
    justifyContent: "center",
    left: 0,
    padding: 32,
    position: "absolute",
    right: 0,
    top: 0
  },
  predictiveBackEyebrow: {
    color: theme.colors.backGesture.eyebrow,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  predictiveBackDestinationLabel: {
    color: theme.colors.backGesture.label,
    fontSize: 24,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center"
  },
  safeArea: {
    backgroundColor: theme.colors.surfaceRaised,
    flex: 1
  },
  appRootShell: {
    backgroundColor: theme.colors.surfaceRaised,
    flex: 1,
    flexDirection: "row",
    minWidth: 0
  },
  appContentShell: {
    flex: 1,
    minWidth: 0
  },

  sprintLoadingOverlay: {
    alignItems: "center",
    backgroundColor: theme.colors.veil,
    bottom: 0,
    justifyContent: "center",
    left: 0,
    padding: 24,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 100
  },
  sprintLoadingCard: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.accent.s100,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    maxWidth: 320,
    paddingHorizontal: 28,
    paddingVertical: 24,
    width: "100%"
  },
  sprintLoadingTitle: {
    color: theme.colors.text.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  sprintLoadingDetail: {
    color: theme.colors.text.tertiary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center"
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: UI_PADDING,
    paddingTop: 12,
    paddingBottom: 10
  },
  // `styles.content` supplies the page gutter and inter-item gap. Cancel the
  // horizontal gutter for the header, then preserve the old 16-point distance
  // between the header and the first content item.
  headerInTopTabScroll: {
    marginBottom: UI_PADDING - CONTENT_GAP,
    marginHorizontal: -UI_PADDING
  },
  // The scrolling content already starts with the normal page gutter. Remove
  // that first gutter before laying out the Practice title so its initial
  // position remains unchanged while it becomes part of the main scroll view.
  headerInMainScroll: {
    marginBottom: UI_PADDING - CONTENT_GAP,
    marginHorizontal: -UI_PADDING,
    marginTop: -UI_PADDING
  },
  title: {
    color: theme.colors.text.ink,
    fontSize: 22,
    fontWeight: "700"
  },
  content: {
    gap: CONTENT_GAP,
    padding: UI_PADDING,
    paddingBottom: 40
  },
  contentWide: {
    alignSelf: "center",
    maxWidth: 1120,
    width: "100%"
  },
  contentSessionRail: {
    flexGrow: 1,
    justifyContent: "flex-start"
  },
  // The board lane holds only the board in rail layouts, so centring the row
  // centres the board; equal top and bottom padding keeps it exact.
  contentSessionRailCentered: {
    justifyContent: "center",
    paddingBottom: UI_PADDING
  },
  // Practice Home on the direction A primitives (#609).
  titleLarge: {
    ...theme.typography.largeTitle,
    color: theme.colors.text.primary
  },
  historyResetButton: {
    alignItems: "center",
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 12
  },
  historyResetButtonText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: "800"
  },
  reviewFilterButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  reviewFilterButtonActive: {
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s600
  },
  filterGlyph: {
    gap: 4,
    width: 17
  },
  filterGlyphLine: {
    borderRadius: 999,
    height: 2,
    position: "relative",
    width: 17
  },
  filterGlyphKnob: {
    borderRadius: 999,
    height: 5,
    position: "absolute",
    top: -1.5,
    width: 5
  },
  filterGlyphKnobLeft: {
    left: 1
  },
  filterGlyphKnobMiddle: {
    left: 6
  },
  filterGlyphKnobRight: {
    right: 1
  },
  reviewDueTitle: {
    color: theme.colors.text.ink,
    fontSize: 15,
    fontWeight: "800"
  },
  reviewForecastCount: {
    color: theme.colors.text.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  reviewForecastLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center"
  },
  reviewItemCard: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 82,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  reviewRetryBadge: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.fill,
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  reviewRetryGlyph: {
    color: theme.colors.text.onAccent,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 22,
    textAlign: "center"
  },
  reviewItemCopy: {
    flex: 1,
    gap: 2
  },
  reviewStartButton: {
    flexBasis: "auto",
    flexGrow: 0,
    flexShrink: 0
  },
  activeSessionAdaptiveLayout: {
    alignSelf: "center",
    alignItems: "center",
    flexDirection: "row"
  },
  activeSessionStack: {
    gap: 12
  },
  activeSessionBoardLane: {
    alignItems: "center",
    flexGrow: 0,
    flexShrink: 0,
    gap: 12,
    justifyContent: "center",
    minWidth: 0
  },
  activeSessionControlRailScroll: {
    flexGrow: 0,
    flexShrink: 0,
    maxHeight: "100%"
  },
  activeSessionControlRailScrollContent: {
    paddingBottom: 4
  },
  activeSessionControlRail: {
    flexGrow: 1,
    gap: 10
  },
  activeSessionControlRailCentered: {
    justifyContent: "center"
  },
  activeSessionBottomFeedback: {
    alignSelf: "center"
  },
  activeSessionRailBottomFeedback: {
    marginTop: "auto"
  },
  puzzleTimeoutOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    backgroundColor: theme.colors.scrimStrong,
    justifyContent: "center",
    zIndex: 60
  },
  puzzleTimeoutOverlayTitle: {
    color: theme.colors.text.onAccent,
    fontSize: 22,
    fontWeight: "900"
  },
  puzzleTimeoutOverlayDetail: {
    color: theme.colors.text.inverse,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4
  },
  boardWrapper: {
    alignItems: "center",
    gap: 3,
    justifyContent: "center"
  },
  sessionBoardDetails: {
    gap: 3
  },
  boardSurface: {
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative"
  },
  practicePromptStack: {
    alignSelf: "center",
    gap: 6
  },
  emptyBoard: {
    alignItems: "center",
    backgroundColor: theme.colors.board.lightSquare,
    justifyContent: "center"
  },
  emptyBoardText: {
    color: theme.colors.text.tertiary,
    fontSize: 18,
    fontWeight: "700"
  },
  positive: {
    color: theme.colors.positive.s700,
    fontWeight: "700"
  },
  simulationBadge: {
    backgroundColor: theme.colors.warning.s100,
    borderColor: theme.colors.warning.s500,
    borderRadius: theme.shape.capsule,
    borderWidth: 1,
    color: theme.colors.warning.s600,
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  filterButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  historyQuickFilterRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    paddingRight: 4
  },
  historyQuickChipTarget: {
    alignItems: "center",
    flexShrink: 0,
    justifyContent: "center",
    minHeight: 44
  },
  historyQuickChip: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.strong,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    minHeight: 34,
    paddingHorizontal: 8
  },
  historyQuickChipActive: {
    backgroundColor: theme.colors.accent.fill,
    borderColor: theme.colors.accent.s600
  },
  historyQuickChipCompact: {
    paddingHorizontal: 6
  },
  historyQuickChipCheck: {
    color: theme.colors.text.onAccent,
    fontSize: 11,
    fontWeight: "900"
  },
  historyQuickChipText: {
    color: theme.colors.text.strong,
    fontSize: 12,
    fontWeight: "800"
  },
  historyQuickChipTextActive: {
    color: theme.colors.text.onAccent
  },
  historyQuickFacetGroup: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 4
  },
  historyQuickFacetDivider: {
    backgroundColor: theme.colors.fillMuted,
    height: 20,
    marginHorizontal: 1,
    width: StyleSheet.hairlineWidth
  },
  historyQuickFacetLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
    fontWeight: "800"
  },
  historyChart: {
    alignItems: "flex-end",
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    height: 76,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  historyChartColumn: {
    flex: 1,
    justifyContent: "flex-end"
  },
  historyChartBar: {
    backgroundColor: theme.colors.accent.fill,
    borderRadius: 4,
    minHeight: 4
  },
  historyAttemptCard: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 78,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  historyResultBadge: {
    alignItems: "center",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  historyResultWrong: {
    backgroundColor: theme.colors.danger.s600
  },
  historyResultCorrect: {
    backgroundColor: theme.colors.positive.s600
  },
  historyResultIncomplete: {
    backgroundColor: theme.colors.text.tertiary
  },
  historyResultUnknown: {
    backgroundColor: theme.colors.text.tertiary
  },
  historyResultUnknownText: {
    color: theme.colors.text.onTone,
    fontSize: 16,
    fontWeight: "800"
  },
  historyAttemptCopy: {
    flex: 1,
    gap: 3
  },
  historyUnclearBadge: {
    alignItems: "center",
    backgroundColor: theme.colors.warning.s50,
    borderColor: theme.colors.warning.s500,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4
  },
  historyUnclearBadgeText: {
    color: theme.colors.warning.s700,
    fontSize: 10,
    fontWeight: "900"
  },
  historyTimingBadge: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 4
  },
  historyTimingBadgeSlow: {
    backgroundColor: theme.colors.warning.s50,
    borderColor: theme.colors.warning.s500
  },
  historyTimingBadgeText: {
    fontSize: 10,
    fontWeight: "900"
  },
  historyTimingBadgeTextSlow: {
    color: theme.colors.warning.s700
  },
  historyAttemptChevron: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 14
  },
  historyReviewState: {
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right"
  },
  historyRatingDelta: {
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right"
  },
  switchButton: {
    alignItems: "center",
    borderColor: theme.colors.border.strong,
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 52
  },
  switchButtonActive: {
    backgroundColor: theme.colors.accent.fill,
    borderColor: theme.colors.accent.s600
  },
  switchGlyph: {
    height: 24,
    justifyContent: "center",
    position: "relative",
    width: 46
  },
  switchGlyphKnob: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.strong,
    borderRadius: 999,
    borderWidth: 1,
    height: 22,
    left: 1,
    position: "absolute",
    width: 22
  },
  switchGlyphKnobEnabled: {
    borderColor: theme.colors.surface,
    left: 23
  },
  debugLog: {
    color: theme.colors.text.strong,
    fontFamily: "Menlo",
    fontSize: 9,
    lineHeight: 12,
    marginTop: 6
  },
}));
