import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import type {
  LayoutChangeEvent
} from "react-native";
import type { MoveResult } from "react-native-chessboard";
import Chessboard, { type ChessboardRef } from "react-native-chessboard";
import {
  GestureHandlerRootView,
  LegacyScrollView,
  type GestureType
} from "react-native-gesture-handler";
import {
  analyzeFenWithUciEngine,
  canPresentWhatsNew,
  applyMovesToFen,
  arrowDuelReplyCuePresentationFor,
  beginArrowDuelPuzzle,
  beginLinePuzzle,
  buildCurrentPositionEvaluationLine,
  buildPuzzleGuidedAnalysisLines,
  buildSprintConfig,
  collectHistoryRatingKeys,
  continueArrowDuelReplyLine,
  currentExpectedMove,
  DEFAULT_OPPONENT_REPLY_SECONDS,
  defaultSprintConfig,
  formatLocalCalendarDate,
  formatReviewDay,
  historyAttemptReplayAvailability,
  selectMistakeReplayItems,
  isUnclearAttemptEligible,
  isReviewOverdue,
  markSprintGuideSeen,
  markSprintSessionGuidePlanSeen,
  normalizeHistoryAttemptDetail,
  OPPONENT_REPLY_MAX_SECONDS,
  OPPONENT_REPLY_MIN_SECONDS,
  pauseSprint as pauseSprintState,
  RATING_FLOOR,
  resetSprintGuideProgress,
  resolvePuzzleTimingPolicy,
  reviewAnalysisStartingFen,
  reviewDueLabel,
  reviewQueueForecast,
  resumeSprint as resumeSprintState,
  submitArrowDuelChoice,
  submitArrowDuelFollowUpMove,
  submitArrowDuelReply,
  submitLineMove,
  SERVER_CURATED_THEME_PRESENTATION,
  sprintHasRunDeadline,
  sprintSessionGuidePlanFor
} from "../../../../packages/core/src/index.ts";
import type {
  AttemptEvent,
  AttemptSource,
  ArrowDuelState,
  CurrentPuzzleState,
  EngineAnalysisLine,
  HistoryAttemptView,
  HistoryAttemptReplayAvailability,
  HistoryAttentionReason,
  HistoryTimeRange,
  PuzzleSide,
  Puzzle,
  PuzzleFeedback,
  PuzzleLineState,
  PracticeRunRecord,
  ReviewAnalysisLine,
  ReviewReminderDecision,
  ReviewQueueItem,
  ReviewQueueState,
  ReviewContext,
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
import {
  filterReviewTodayPresentation,
  type CompletedReviewItem,
  type ReviewTodayDueItemPresentation,
  type ReviewTodayFilter,
  type ReviewTodayHistoryPresentation
} from "../../../../packages/storage/src/review-today.ts";
import type {
  ReviewQueueDuePromotionResult,
  ReviewReminderPreference
} from "../../../../packages/storage/src/practice-store.ts";
import {
  ProgressV2SyncCancelledError,
  fingerprintOpaqueToken,
  syncPracticeProgressV2
} from "../../../../packages/storage/src/progress-sync-v2.ts";
import type { SimulatedHistoryScenarioId } from "../../../../packages/storage/src/simulation/scenarios.ts";
import {
  getBundledCorePackManifest,
  seededPuzzleCount,
  shouldRandomizePuzzleSelection,
  type MobilePuzzleSource
} from "../platform/mobilePractice.ts";
import {
  computeReviewReminderDecision,
  reminderScheduleKey,
  type ReviewReminderPermissionStatus,
  type ReviewReminderScheduleResult
} from "../platform/reviewReminderScheduler.ts";
import {
  captureProgressForSupport,
  PROGRESS_V2_RELEASE_PHASE,
  resolveProgressV2ActivePhase,
  type ICloudAccountStatus
} from "../platform/iCloudProgressSync.ts";
import {
  captureICloudSyncFailure,
  formatAndroidSupportOverviewDiagnostic,
  formatICloudSyncFailureDiagnostic,
  formatICloudSyncOverviewDiagnostic,
  iCloudSyncAttemptLabel,
  type ICloudSyncFailureDiagnostic,
  type ICloudSyncDiagnosticMetadata,
  type SupportDiagnosticMetadata
} from "../platform/iCloudSyncDiagnostics.ts";
import type {
  MobilePlatformCapabilities,
  MobileStockfishCapabilities
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
import { buildReviewEntry, type ReviewEntry } from "../backend/reviewEntry.ts";
import {
  canonicalFen,
  decidePremoveQueue,
  fenAfterMove,
  fenAfterMoves,
  normalizeUci,
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
  MoveFeedbackPreferences,
  MoveFeedbackPreviewer
} from "./MoveFeedbackSettingsSection.tsx";
import {
  emitCommittedMoveFeedback,
  emitRunReorderPickupFeedback,
  moveFeedbackCueForMove,
  type MoveFeedbackActor,
  type MoveFeedbackClient
} from "../platform/moveFeedback.ts";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import type {
  PracticeRunManagementPresentation
} from "./practiceRunPresentation.ts";
import {
  PRACTICE_FEEDBACK_MAX_TEXT_SCALE,
  PRACTICE_PROMPT_MAX_TEXT_SCALE,
  PRACTICE_PUZZLE_TIMING_MAX_TEXT_SCALE,
  PRACTICE_SESSION_HUD_MAX_TEXT_SCALE,
  buildPracticeAdaptiveLayout,
  PRACTICE_UI_PADDING as UI_PADDING,
  type AdaptiveLayout
} from "./adaptivePracticeLayout.ts";
import { usePracticeViewport } from "./PracticeViewport.tsx";
import { NativeTabHost, TabContentInsetsReporter } from "../navigation/NativeTabHost.tsx";
import {
  isTopLevelChromeVisible,
  topLevelTabIntent,
  type TopLevelTab
} from "../navigation/topLevelNavigation.ts";
import { SafeAreaModalBackdrop } from "./SafeAreaModalBackdrop.tsx";
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
import { SessionMistakeIndicator } from "./SessionMistakeIndicator.tsx";
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
import { makeStyles, useAppearance, useTheme, type AppearancePreference, type Theme } from "../theme/index.ts";
import { typography as baseTypography } from "../theme/scales.ts";
import { AppText, Button, Icon, IconTile, useListRowStyle } from "./ui/index.tsx";
import type { MoveSide } from "./practice/shared/moveSide.ts";
import { CHESS_PIECE_SPRITE } from "./practice/shared/chessPieceSprite.ts";
import {
  ChevronGlyph,
  CloseGlyph,
  FilterGlyph,
  FlipGlyph,
  MoreGlyph,
  MoveSideGlyph,
  PauseGlyph,
  PlayGlyph,
  SearchGlyph,
  SessionScoreGlyph
} from "./practice/shared/Glyphs.tsx";
import { CollapsibleRegion, DisclosureChevron } from "./practice/shared/CollapsibleRegion.tsx";
import { ToolbarIconButton } from "./practice/shared/ToolbarIconButton.tsx";
import { FilterButton } from "./practice/shared/FilterButton.tsx";
import { AttemptStatusTile } from "./practice/shared/AttemptStatusTile.tsx";
import {
  ANALYSIS_DEPTH,
  CUSTOM_INITIAL_RATING_MIN,
  errorMessage,
  FABRIC_SAFE_HIDDEN_TEXT_STYLE,
  formatCompactDuration,
  formatSprintDurationLabel,
  modeLabel,
  safeTestId
} from "./practice/shared/practiceUtils.ts";
import {
  iCloudAccountStatusMessage,
  localReminderTarget,
  progressSyncStatusMessage,
  ReviewReminderPermissionPrompt,
  reviewReminderScheduleStatusLabel,
  scheduledReviewAttemptCount,
  SettingsPanel,
  StockfishDiagnosticsPanel
} from "./practice/settings/SettingsPanel.tsx";
import type {
  CustomThemeSelection,
  ThemeCatalogPresentation
} from "./practice/shared/themeCatalog.ts";
import {
  historyAttentionQueryForSelection,
  HistoryPanel,
  type HistoryRatingRangeFilter,
  historyRatingRangeFilterToQuery,
  type HistoryResultFilter,
  ThemeTagRail
} from "./practice/history/HistoryPanel.tsx";
import { emptyHistoryPerformance } from "./practice/history/HistoryRatingChart.tsx";
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

type SessionFeedback = PuzzleFeedback | null;
type AnalysisEngineStatus = "idle" | "thinking" | "stockfish" | "fallback" | "error";

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

type BoardMove = {
  from: string;
  to: string;
  promotion?: string;
};

type BoardResetSlide = BoardMove & {
  durationMs?: number;
};

function moveSideDisplayName(side: MoveSide): "Black" | "White" {
  return side === "b" ? "Black" : "White";
}

function replyPreparationInstruction(seconds: number): string {
  return `You’ll have ${seconds} ${seconds === 1 ? "second" : "seconds"} to play the best reply.`;
}

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

type PreviousAttemptNoticeReason = "slow" | "timed_out" | "wrong";

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

type ReviewBackCommand = {
  id: number;
  kind: "close-analysis" | "return-to-owner";
};

type DeferBackRelevantTransition = (key: string, resumeAfterCancel: () => void) => boolean;

const HISTORY_PAGE_LIMIT = 20;
const FEEDBACK_SNAPSHOT_MS = 800;

function shouldShowTimeoutSnapshot(
  nextState: SprintState,
  submittedPuzzleId: string | null
): boolean {
  return nextState.status !== "active" ||
    nextState.currentPuzzle?.puzzle.id !== submittedPuzzleId;
}

// Brief pause so the correct-move feedback registers before the opponent
// reply animates. Kept short — the reply window delays the user's next move.
const USER_FEEDBACK_BEFORE_AUTO_MS = 120;
const ARROW_DUEL_CORRECT_CHOICE_FEEDBACK_MS = 220;
// Let the animated undo and the What if cue register before the tempting move
// appears. The reply clock still begins only after the new position is ready.
const ARROW_DUEL_REPLY_PREPARATION_MS = 1_500;
const ARROW_DUEL_UNDO_ANIMATION_MS = 500;
const PRACTICE_PROMPT_COPY_GAP = 5;
const ARROW_DUEL_OPTIONAL_SETTINGS_COPY =
  "This extra challenge is optional — turn it off in Settings.";
// Shared by the practice and review boards so they animate at the same speed.
const BOARD_MOVE_ANIMATION_MS = 200;
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

type ChessboardColors = NonNullable<React.ComponentProps<typeof Chessboard>["colors"]>;
const chessboardColorCache = new WeakMap<Theme, ChessboardColors>();
// Stable per theme so the board does not see a new colors prop on every render.
function chessboardColorsFor(theme: Theme): ChessboardColors {
  let colors = chessboardColorCache.get(theme);
  if (colors === undefined) {
    const { board } = theme.colors;
    colors = {
      white: board.lightSquare,
      black: board.darkSquare,
      lastMoveHighlight: board.lastMoveHighlight,
      checkmateHighlight: board.checkmateHighlight,
      promotionPieceButton: board.promotionPieceButton,
      validMoveDot: board.validMoveDot,
      validMoveCapture: board.validMoveCapture,
      promotionOverlay: board.promotionOverlay,
      promotionContainer: board.promotionContainer,
      promotionBorder: board.promotionBorder,
      promotionShadow: board.promotionShadow,
      promotionPieceBorder: board.promotionPieceBorder
    };
    chessboardColorCache.set(theme, colors);
  }
  return colors;
}
const CHESSBOARD_DURATIONS = { move: BOARD_MOVE_ANIMATION_MS } as const;
// Space below the last tab content row, added to the tab chrome's bottom inset.
const CONTENT_BOTTOM_PADDING = 40;
const BOARD_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const BOARD_FILES_FLIPPED = ["h", "g", "f", "e", "d", "c", "b", "a"] as const;
const BOARD_RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;
const BOARD_RANKS_FLIPPED = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;
const ALL_HISTORY_ATTENTION_REASONS: readonly HistoryAttentionReason[] = [
  "unclear",
  "in_review",
  "incomplete"
];

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
  const scheduler = platformCapabilities.reminders.scheduler;
  const notificationClient = platformCapabilities.reminders.notificationClient;
  const reminderPlatform = platformCapabilities.reminders.platform;
  const moveFeedbackClient = platformCapabilities.moveFeedback.client;
  const appStoreReviewRequestClient = platformCapabilities.appReview.client;
  const progressProtection = platformCapabilities.progressProtection;
  const iCloudSyncClient = platformCapabilities.progressSync.client;
  const iCloudSyncDiagnosticsClient = platformCapabilities.progressSync.diagnostics;
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
  const reminderScheduleKeyRef = useRef<string | null>(null);
  const appReviewCancelledSessionIdsRef = useRef(new Set<string>());
  // Initialized once the service effect runs. Keeping this out of the useRef
  // argument matters because React evaluates that argument on every render.
  const scheduledReviewAttemptCountRef = useRef<number | null>(null);
  const reviewReminderPromptDismissedRef = useRef(false);
  const iCloudSyncInFlightRef = useRef<Promise<string> | null>(null);
  const iCloudSyncGenerationRef = useRef(0);
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
  const [historyTimeRange, setHistoryTimeRange] = useState<HistoryTimeRange>("7d");
  const [historySourceFilter, setHistorySourceFilter] = useState<"all" | AttemptSource>("sprint");
  const historyAttentionReasonOptions = ALL_HISTORY_ATTENTION_REASONS;
  const [historyResultFilter, setHistoryResultFilter] = useState<HistoryResultFilter>("all");
  const [historySideFilter, setHistorySideFilter] = useState<"all" | PuzzleSide>("all");
  const [historyRatingRangeFilter, setHistoryRatingRangeFilter] = useState<HistoryRatingRangeFilter>("all");
  const [historyAttentionReasons, setHistoryAttentionReasons] = useState<HistoryAttentionReason[]>(
    () => [...historyAttentionReasonOptions]
  );
  const [historyPageOffset, setHistoryPageOffset] = useState(0);
  const [historyRatingKey, setHistoryRatingKey] = useState<string | null>(null);
  const [historyReviewEntries, setHistoryReviewEntries] = useState<ReviewEntry[]>([]);
  const [reviewBoardTouchActive, setReviewBoardTouchActive] = useState(false);
  const [historyUnavailableAttempt, setHistoryUnavailableAttempt] = useState<HistoryUnavailableAttempt | null>(null);
  const [historyReviewInitialIndex, setHistoryReviewInitialIndex] = useState(0);
  const [historyProgressOpen, setHistoryProgressOpen] = useState(false);
  const [reviewSessionSource, setReviewSessionSource] = useState<ReviewEntry["source"] | null>(null);
  const [customSprintMode, setCustomSprintMode] = useState<"custom" | "arrow_duel">("custom");
  const [customDurationSeconds, setCustomDurationSeconds] = useState(5 * 60);
  const [customPerPuzzleSeconds, setCustomPerPuzzleSeconds] = useState(20);
  const [customInitialRating, setCustomInitialRating] = useState(CUSTOM_INITIAL_RATING_MIN);
  const [reviewReminderPreference, setReviewReminderPreference] = useState<ReviewReminderPreference>(() => service.getReviewReminderPreference());
  const [notificationPermissionStatus, setNotificationPermissionStatus] = useState<ReviewReminderPermissionStatus>("unavailable");
  const [reviewReminderScheduleStatus, setReviewReminderScheduleStatus] = useState("unavailable");
  const [reviewReminderPermissionPromptVisible, setReviewReminderPermissionPromptVisible] = useState(false);
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
  const [historyFiltersExpanded, setHistoryFiltersExpanded] = useState(false);
  const [reviewFiltersExpanded, setReviewFiltersExpanded] = useState(false);
  const [settingsAdvancedRatingsOpen, setSettingsAdvancedRatingsOpen] = useState(false);
  const [customRatingEditorOpen, setCustomRatingEditorOpen] = useState(false);
  const [reviewAnalysisOpen, setReviewAnalysisOpen] = useState(false);
  const [reviewBackCommand, setReviewBackCommand] = useState<ReviewBackCommand | null>(null);
  const [mobileBackPreview, setMobileBackPreview] = useState<MobileBackPreview | null>(null);
  const [iCloudSyncEnabled, setICloudSyncEnabled] = useState(() => service.getSettings().sync.iCloudEnabled);
  const [iCloudSyncStatus, setICloudSyncStatus] = useState(() => service.getSettings().sync.iCloudEnabled ? "Ready" : "Off");
  const [iCloudSyncInProgress, setICloudSyncInProgress] = useState(false);
  const [seededHistoryStatus, setSeededHistoryStatus] = useState<string | null>(null);
  const seedingHistoryRef = useRef(false);
  const iCloudAccountStatusRef =
    useRef<ICloudAccountStatus | "not_checked">("not_checked");
  const [lastICloudSyncFailure, setLastICloudSyncFailure] =
    useState<ICloudSyncFailureDiagnostic | undefined>();
  const [moveFeedbackPreferences, setMoveFeedbackPreferences] = useState<MoveFeedbackPreferences>(
    () => service.getSettings().moveFeedback
  );
  const [appearance, setAppearancePreference] = useState<AppearancePreference>(
    () => service.getSettings().appearance
  );
  const { setAppearance } = useAppearance();
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
  const historyThemeChoices = useThemeChoiceSelection();
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
  const topLevelChromeVisible = isTopLevelChromeVisible({
    feedbackSnapshotVisible: feedbackSnapshot !== null,
    openSession: state?.status === "active" || state?.status === "paused",
    personalBestGuideVisible,
    personalBestHubVisible,
    personalBestRecordsVisible,
    sprintResultVisible,
    reviewSurfaceOpen: reviewSessionSource !== null
      || historyReviewEntries.length > 0
      || historyUnavailableAttempt !== null,
    sessionGuideVisible: state === null
      && sessionGuide?.plan.steps[sessionGuide.stepIndex] !== undefined
  });
  const [tabContentInsets, setTabContentInsets] = useState<{
    bottom: number;
    left: number;
    right: number;
    top: number;
  } | null>(null);
  const layoutInsets = topLevelChromeVisible && tabContentInsets ? tabContentInsets : insets;
  const adaptiveLayout = useMemo(
    () => buildPracticeAdaptiveLayout({ fontScale, height, insets: layoutInsets, width }),
    [fontScale, height, layoutInsets, width]
  );
  const boardSize = adaptiveLayout.boardSize;
  const progressV2Diagnostics = service.getProgressV2Diagnostics();
  const activeProgressV2Phase = resolveProgressV2ActivePhase(progressV2Diagnostics.phase);
  const syncDiagnosticMetadata = {
    appVersion: platformCapabilities.applicationMetadata.versionName,
    ...(platformCapabilities.applicationMetadata.buildNumber
      ? { buildNumber: platformCapabilities.applicationMetadata.buildNumber }
      : {}),
    iCloudAccountStatus: iCloudAccountStatusRef.current,
    iCloudSyncEnabled,
    latestSyncStatus: iCloudSyncStatus,
    progressV2: {
      phase: activeProgressV2Phase,
      zoneInitialized: progressV2Diagnostics.zoneInitialized,
      ...(progressV2Diagnostics.serverChangeTokenFingerprint === undefined
        ? {}
        : { serverChangeTokenFingerprint: progressV2Diagnostics.serverChangeTokenFingerprint }),
      pendingOutboxCount: progressV2Diagnostics.pendingOutboxCount,
      ...(progressV2Diagnostics.oldestPendingOutboxAt === undefined
        ? {}
        : { oldestPendingOutboxAt: progressV2Diagnostics.oldestPendingOutboxAt }),
      ...(progressV2Diagnostics.lastPullAt === undefined
        ? {}
        : { lastPullAt: progressV2Diagnostics.lastPullAt }),
      ...(progressV2Diagnostics.lastPushAt === undefined
        ? {}
        : { lastPushAt: progressV2Diagnostics.lastPushAt }),
      legacyImportPending: progressV2Diagnostics.pendingV1ChangeTag !== undefined,
      ...(progressV2Diagnostics.lastV1ChangeTag === undefined
        ? {}
        : {
            lastV1ChangeTagFingerprint: fingerprintOpaqueToken(
              progressV2Diagnostics.lastV1ChangeTag
            )
          }),
      ...(progressV2Diagnostics.lastV1ImportAt === undefined
        ? {}
        : { lastV1ImportAt: progressV2Diagnostics.lastV1ImportAt }),
      ...(progressV2Diagnostics.lastV1CheckAt === undefined
        ? {}
        : { lastV1CheckAt: progressV2Diagnostics.lastV1CheckAt }),
      ...(progressV2Diagnostics.lastV1CheckStatus === undefined
        ? {}
        : { lastV1CheckStatus: progressV2Diagnostics.lastV1CheckStatus })
    }
  };
  const supportDiagnosticMetadata: SupportDiagnosticMetadata =
    progressProtection.kind === "android_managed_backup"
      ? {
          appVersion: platformCapabilities.applicationMetadata.versionName,
          ...(platformCapabilities.applicationMetadata.buildNumber
            ? { buildNumber: platformCapabilities.applicationMetadata.buildNumber }
            : {}),
          platform: "android",
          progressProtection: "android_managed_backup"
        }
      : syncDiagnosticMetadata;
  const generatedSupportBundle = iCloudSyncDiagnosticsClient
    ? {
        onDiscard: async (result) => {
          if (result.bundleUrl) {
            await iCloudSyncDiagnosticsClient.discardSupportBundle(result.bundleUrl);
          }
        },
        onPrepare: async () => {
          const createdAt = new Date(currentTimeMs()).toISOString();
          const cloudCapture = progressProtection.kind === "android_managed_backup"
            ? undefined
            : iCloudSyncClient
              ? await captureProgressForSupport(
                  iCloudSyncClient,
                  activeProgressV2Phase
                )
              : {
                  formatVersion: 2 as const,
                  accountStatus: "unavailable" as const,
                  v2: {
                    status: "unavailable" as const,
                    ndjson: "",
                    recordCount: 0,
                    deletionCount: 0,
                    familyCounts: {},
                    bytes: 0,
                    startedAt: createdAt,
                    completedAt: createdAt,
                    unavailableReason: "icloud_v2_transport_unavailable"
                  },
                  v1: {
                    status: activeProgressV2Phase === "sealed"
                      ? "skipped_sealed" as const
                      : "unavailable" as const,
                    ...(activeProgressV2Phase === "sealed"
                      ? {}
                      : { unavailableReason: "icloud_v1_transport_unavailable" })
                  }
                };
          const preparedMetadata: SupportDiagnosticMetadata =
            progressProtection.kind === "android_managed_backup"
              ? supportDiagnosticMetadata
              : {
                  ...syncDiagnosticMetadata,
                  iCloudAccountStatus: cloudCapture?.accountStatus ?? "unavailable"
                };
          const prepared = await iCloudSyncDiagnosticsClient.prepareSupportBundle({
            ...(cloudCapture === undefined ? {} : { cloudCapture }),
            diagnosticText: progressProtection.kind === "android_managed_backup"
              ? formatAndroidSupportOverviewDiagnostic(
                  preparedMetadata,
                  createdAt
                )
              : formatICloudSyncOverviewDiagnostic(
                  preparedMetadata as ICloudSyncDiagnosticMetadata,
                  createdAt,
                  lastICloudSyncFailure
                ),
            metadata: preparedMetadata
          });
          return prepared;
        },
        onShare: async (result) => {
          if (!result.bundleUrl) {
            throw new Error("The prepared support bundle is unavailable.");
          }
          await iCloudSyncDiagnosticsClient.shareSupportBundle(result.bundleUrl);
        },
        platform: progressProtection.kind === "android_managed_backup"
          ? "android"
          : "ios"
      } satisfies ICloudSyncSupportBundlePresentation
    : undefined;
  const effectiveSupportBundle = iCloudSyncSupportBundle ?? generatedSupportBundle;
  const generatedErrorDetails = lastICloudSyncFailure && iCloudSyncStatus === "iCloud sync failed"
    ? {
        copyText: formatICloudSyncFailureDiagnostic(
          lastICloudSyncFailure,
          syncDiagnosticMetadata
        ),
        message: lastICloudSyncFailure.message,
        occurredAtLabel: new Date(lastICloudSyncFailure.occurredAt).toLocaleString(),
        onCopy: async (text: string) => {
          if (!iCloudSyncDiagnosticsClient) {
            throw new Error("Clipboard access is unavailable.");
          }
          await iCloudSyncDiagnosticsClient.copyText(text);
        },
        supportBundle: effectiveSupportBundle
      } satisfies ICloudSyncErrorDetailsPresentation
    : undefined;
  const effectiveErrorDetails = iCloudSyncErrorDetails ?? generatedErrorDetails;

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
  const selectedHistoryThemes = historyThemeChoices.namedThemes;
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

  useEffect(() => {
    const enabled = service.getSettings().sync.iCloudEnabled;
    setICloudSyncEnabled(enabled);
    if (!enabled) {
      setICloudSyncStatus("Off");
      return;
    }
    if (!iCloudSyncClient) {
      setICloudSyncStatus("Unavailable on this build");
      return;
    }
    setICloudSyncStatus("Ready");
    void runICloudProgressSync("startup");
    // Sync is intentionally triggered only when the client or backing service changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iCloudSyncClient, service]);

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

  function saveReviewReminderPreference(preference: ReviewReminderPreference): void {
    const saved = service.saveReviewReminderPreference(preference);
    setReviewReminderPreference(saved);
    setSettingsRevision((current) => current + 1);
    refreshReviewReminder("settings", true);
  }

  async function requestReviewReminderPermission(): Promise<ReviewReminderPermissionStatus> {
    if (!notificationClient) {
      setNotificationPermissionStatus("unavailable");
      return "unavailable";
    }
    try {
      const status = await notificationClient.requestAuthorization();
      setNotificationPermissionStatus(status);
      const finishPermissionPrompt = () => {
        setReviewReminderPermissionPromptVisible(false);
        reviewReminderPromptDismissedRef.current = true;
      };
      if (!deferBackRelevantTransition("review-reminder-permission", finishPermissionPrompt)) {
        finishPermissionPrompt();
      }
      if (status === "authorized") {
        refreshReviewReminder("permission", true);
      }
      return status;
    } catch {
      setNotificationPermissionStatus("unavailable");
      return "unavailable";
    }
  }

  async function openReviewReminderSystemSettings(): Promise<void> {
    if (!notificationClient) {
      return;
    }
    await notificationClient.openSystemSettings();
    try {
      setNotificationPermissionStatus(await notificationClient.getAuthorizationStatus());
    } catch {
      setNotificationPermissionStatus("unavailable");
    }
  }

  function saveICloudSyncEnabled(enabled: boolean): void {
    iCloudSyncGenerationRef.current += 1;
    iCloudSyncInFlightRef.current = null;
    setICloudSyncInProgress(false);
    service.saveSettings({
      ...service.getSettings(),
      sync: {
        iCloudEnabled: enabled
      }
    });
    setICloudSyncEnabled(enabled);
    setSettingsRevision((current) => current + 1);
    if (!enabled) {
      setICloudSyncStatus("Off");
      return;
    }
    setICloudSyncStatus(iCloudSyncClient ? "Ready" : "Unavailable on this build");
    if (iCloudSyncClient) {
      void runICloudProgressSync("settings-enabled");
    }
  }

  function saveMoveFeedbackPreferences(preferences: MoveFeedbackPreferences): void {
    const saved = service.saveSettings({
      ...service.getSettings(),
      moveFeedback: preferences
    });
    setMoveFeedbackPreferences(saved.moveFeedback);
    setSettingsRevision((current) => current + 1);
  }

  function saveAppearance(next: AppearancePreference): void {
    const saved = service.saveSettings({
      ...service.getSettings(),
      appearance: next
    });
    setAppearancePreference(saved.appearance);
    setAppearance(saved.appearance);
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

  async function runICloudProgressSync(reason: string): Promise<string> {
    if (!service.getSettings().sync.iCloudEnabled) {
      setICloudSyncStatus("Off");
      return "iCloud sync is off";
    }
    if (!iCloudSyncClient) {
      setICloudSyncStatus("Unavailable on this build");
      return "iCloud sync is unavailable on this build";
    }
    if (iCloudSyncInFlightRef.current) {
      return iCloudSyncInFlightRef.current;
    }

    const generation = iCloudSyncGenerationRef.current;
    const isCurrent = () =>
      generation === iCloudSyncGenerationRef.current &&
      service.getSettings().sync.iCloudEnabled;

    const work = (async () => {
      setICloudSyncInProgress(true);
      try {
        const accountStatus = await iCloudSyncClient.getAccountStatus();
        if (!isCurrent()) {
          setICloudSyncStatus("Off");
          return "iCloud sync is off";
        }
        iCloudAccountStatusRef.current = accountStatus;
        if (accountStatus !== "available") {
          const message = iCloudAccountStatusMessage(accountStatus);
          setICloudSyncStatus(message);
          return message;
        }
        const result = await syncPracticeProgressV2(service, iCloudSyncClient, {
          desiredPhase: PROGRESS_V2_RELEASE_PHASE,
          deviceId: "ios-mobile",
          now: nowIso,
          isCurrent
        });
        refreshState();
        setICloudSyncEnabled(service.getSettings().sync.iCloudEnabled);
        setSettingsRevision((current) => current + 1);
        const message = progressSyncStatusMessage(result);
        setICloudSyncStatus(message);
        return message;
      } catch (caught) {
        if (caught instanceof ProgressV2SyncCancelledError) {
          const message = service.getSettings().sync.iCloudEnabled ? "Ready" : "Off";
          setICloudSyncStatus(message);
          return message === "Off" ? "iCloud sync is off" : "iCloud sync was superseded";
        }
        const message = "iCloud sync failed";
        setLastICloudSyncFailure(captureICloudSyncFailure(caught, {
          attempt: iCloudSyncAttemptLabel(reason),
          occurredAt: new Date(currentTimeMs()).toISOString()
        }));
        setICloudSyncStatus(message);
        emitTrace({
          type: "move-ignored",
          reason: `icloud-sync-${reason}-failed:${errorMessage(caught)}`
        });
        return message;
      }
    })();

    iCloudSyncInFlightRef.current = work;
    void work.finally(() => {
      if (iCloudSyncInFlightRef.current === work) {
        iCloudSyncInFlightRef.current = null;
        setICloudSyncInProgress(false);
      }
    });
    return work;
  }

  function maybeShowReviewReminderPermissionPrompt(): void {
    if (
      !notificationClient ||
      reviewReminderPromptDismissedRef.current ||
      reviewReminderPreference.mode === "off" ||
      notificationPermissionStatus !== "not_determined"
    ) {
      return;
    }
    const showPermissionPrompt = () => setReviewReminderPermissionPromptVisible(true);
    if (!deferBackRelevantTransition("review-reminder-permission", showPermissionPrompt)) {
      showPermissionPrompt();
    }
  }

  function dismissReviewReminderPermissionPrompt(): void {
    reviewReminderPromptDismissedRef.current = true;
    setReviewReminderPermissionPromptVisible(false);
  }

  function refreshReviewReminder(reason: string, force = false): void {
    if (!scheduler) {
      setReviewReminderScheduleStatus("unavailable");
      return;
    }
    try {
      const decision = computeReviewReminderDecision(service, nowIso());
      const nextKey = reminderScheduleKey(decision);
      if (!force && reminderScheduleKeyRef.current === nextKey) {
        return;
      }
      reminderScheduleKeyRef.current = nextKey;
      setReviewReminderScheduleStatus("pending");
      void scheduler.replaceNextReminder(decision).then((result) => {
        setReviewReminderScheduleStatus(reviewReminderScheduleStatusLabel(decision, result));
      }).catch((caught) => {
        setReviewReminderScheduleStatus("error");
        emitTrace({
          type: "move-ignored",
          reason: `review-reminder-${reason}-failed:${errorMessage(caught)}`
        });
      });
    } catch (caught) {
      setReviewReminderScheduleStatus("error");
      emitTrace({
        type: "move-ignored",
        reason: `review-reminder-${reason}-failed:${errorMessage(caught)}`
      });
    }
  }

  function promoteNextFutureReviewsToDue(): ReviewQueueDuePromotionResult {
    const result = service.promoteNextFutureReviewsToDue(nowIso());
    refreshState();
    refreshReviewReminder("dev-promote-next-due", true);
    return result;
  }

  async function scheduleDevReviewReminderNotification(): Promise<ReviewReminderScheduleResult> {
    if (!scheduler) {
      setReviewReminderScheduleStatus("unavailable");
      return { scheduled: false };
    }
    const dueCount = Math.max(1, service.getDueReviewItems(nowIso()).length);
    const decision: ReviewReminderDecision = {
      scheduledAt: new Date(nowMsRef.current + 5000).toISOString(),
      targetLocalDateTime: localReminderTarget(new Date(nowMsRef.current + 5000)),
      dueCount,
      body: `${reviewCountLabel(dueCount)} ${dueCount === 1 ? "is" : "are"} ready`,
      route: "review",
      workloadState: "due_today"
    };
    reminderScheduleKeyRef.current = reminderScheduleKey(decision);
    setReviewReminderScheduleStatus("pending");
    try {
      const result = await scheduler.replaceNextReminder(decision);
      setReviewReminderScheduleStatus(reviewReminderScheduleStatusLabel(decision, result));
      return result;
    } catch (caught) {
      setReviewReminderScheduleStatus("error");
      emitTrace({
        type: "move-ignored",
        reason: `review-reminder-dev-test-failed:${errorMessage(caught)}`
      });
      return { scheduled: false };
    }
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
    const historyReviewView = service.getHistoryView({
      now: nowIso(),
      timeRange: historyTimeRange,
      ...(activeHistoryRatingKey ? { ratingKey: activeHistoryRatingKey } : {}),
      ...historyRatingRangeQuery,
      ...(historySourceFilter === "all" ? {} : { source: historySourceFilter }),
      ...(historyResultFilter === "all" ? {} : { result: historyResultFilter }),
      ...(historySideFilter === "all" ? {} : { side: historySideFilter }),
      ...(selectedHistoryThemes.length === 0 ? {} : { themes: selectedHistoryThemes }),
      ...historyAttentionQueryForSelection(historyAttentionReasons)
    });
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
  const historyRatingRangeQuery = historyRatingRangeFilterToQuery(historyRatingRangeFilter);
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
    ? service.getHistoryView({
        now: nowIso(),
        timeRange: historyTimeRange,
        ...(activeHistoryRatingKey ? { ratingKey: activeHistoryRatingKey } : {}),
        ...historyRatingRangeQuery,
        ...(historySourceFilter === "all" ? {} : { source: historySourceFilter }),
        ...(historyResultFilter === "all" ? {} : { result: historyResultFilter }),
        ...(historySideFilter === "all" ? {} : { side: historySideFilter }),
        ...(selectedHistoryThemes.length === 0 ? {} : { themes: selectedHistoryThemes }),
        ...historyAttentionQueryForSelection(historyAttentionReasons),
        page: { limit: HISTORY_PAGE_LIMIT, offset: historyPageOffset }
      })
    : null;
  const historyView = historyBaseView;
  const historyPerformanceView = historyPanelVisible && activeHistoryRatingKey
    ? service.getHistoryView({
        now: nowIso(),
        timeRange: historyTimeRange,
        ratingKey: activeHistoryRatingKey,
        ...historyRatingRangeQuery,
        ...(historySourceFilter === "all" ? {} : { source: historySourceFilter }),
        ...(historyResultFilter === "all" ? {} : { result: historyResultFilter }),
        ...(historySideFilter === "all" ? {} : { side: historySideFilter }),
        ...(selectedHistoryThemes.length === 0 ? {} : { themes: selectedHistoryThemes }),
        ...historyAttentionQueryForSelection(historyAttentionReasons)
      })
    : null;
  const visibleHistoryAttempts = historyView?.attempts ?? [];
  const visibleHistoryPage = historyView?.page;
  const contentOwnsHeader = tab === "review" || tab === "history";
  const reviewSurfaceOpen = reviewBoardVisible || historyUnavailableAttempt !== null;
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
  const pausedSessionNode = isPaused && state && !personalBestActivePresentation ? (
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
            paddingTop: layoutInsets.top
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
                setHistoryRatingKey(state.config.ratingKey);
                setHistoryPageOffset(0);
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
          {appHeaderVisible ? (
            <View
              accessibilityLabel={screenSubtitle ? `${screenTitle}, ${screenSubtitle}` : screenTitle}
              style={[
                styles.header,
                adaptiveLayout.usesWideContent && !sessionLayoutUsesRail ? styles.contentWide : null
              ]}
              testID="app-shell-header"
            >
              <View>
                <Text style={[styles.title, tab === "practice" || tab === "settings" ? styles.titleLarge : null]}>{screenTitle}</Text>
              </View>
              {simulationProfile?.active ? (
                <Text style={styles.simulationBadge} testID="simulation-profile-indicator">
                  Simulation data
                </Text>
              ) : null}
            </View>
          ) : null}

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
                : null
            ]}
          >
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
                  onRatingKeyChange={(ratingKey) => {
                    setHistoryRatingKey(ratingKey);
                    setHistoryPageOffset(0);
                  }}
                  onTimeRangeChange={(range) => {
                    setHistoryTimeRange(range);
                    setHistoryPageOffset(0);
                  }}
                  onSourceFilterChange={(source) => {
                    setHistorySourceFilter(source);
                    if (source !== "sprint") {
                      setHistoryAttentionReasons([]);
                    }
                    setHistoryPageOffset(0);
                  }}
                  onResultFilterChange={(result) => {
                    setHistoryResultFilter(result);
                    setHistoryPageOffset(0);
                  }}
                  onRatingRangeFilterChange={(ratingRange) => {
                    setHistoryRatingRangeFilter(ratingRange);
                    setHistoryPageOffset(0);
                  }}
                  onSideFilterChange={(side) => {
                    setHistorySideFilter(side);
                    setHistoryPageOffset(0);
                  }}
                  onThemeFilterIntent={(intent) => {
                    historyThemeChoices.dispatch(intent);
                    setHistoryPageOffset(0);
                  }}
                  onAttentionReasonChange={(reason) => {
                    setHistorySourceFilter("sprint");
                    setHistoryAttentionReasons((current) => current.includes(reason)
                      ? current.filter((candidate) => candidate !== reason)
                      : [...current, reason]);
                    setHistoryPageOffset(0);
                  }}
                  onAttentionOnlyChange={(attentionOnly) => {
                    setHistoryPageOffset(0);
                    if (attentionOnly) {
                      setHistorySourceFilter("sprint");
                    }
                    setHistoryAttentionReasons((current) => attentionOnly
                      ? current.length > 0
                        ? current
                        : [...historyAttentionReasonOptions]
                      : []);
                  }}
                  onPageOffsetChange={setHistoryPageOffset}
                  onOpenAttempt={openHistoryReview}
                  onOpenProgress={resolvedHistoryProgressPresentation
                    ? () => {
                        setHistoryFiltersExpanded(false);
                        setHistoryProgressOpen(true);
                      }
                    : undefined}
                  onResetFilters={() => {
                    setHistoryTimeRange("7d");
                    setHistorySourceFilter("sprint");
                    setHistoryResultFilter("all");
                    setHistorySideFilter("all");
                    historyThemeChoices.dispatch({ type: "select-all-themes" });
                    setHistoryRatingRangeFilter("all");
                    setHistoryAttentionReasons([...historyAttentionReasonOptions]);
                    setHistoryPageOffset(0);
                    setHistoryRatingKey(null);
                  }}
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

type SessionTimingState = {
  elapsedSeconds: number;
  phase: "normal" | "slow" | "timed_out";
};

function PuzzleTimingIndicator({
  elapsedSeconds,
  onTargetLayout,
  phase,
  targetRef,
  timeoutSeconds
}: {
  elapsedSeconds: number;
  onTargetLayout?: () => void;
  phase: SessionTimingState["phase"];
  targetRef?: React.RefObject<View | null>;
  timeoutSeconds: number | null;
}): React.JSX.Element {
  const styles = useStyles();
  const label = `Puzzle ${formatCompactDuration(elapsedSeconds)}`;
  const remainingSeconds = timeoutSeconds === null ? null : timeoutSeconds - elapsedSeconds;
  const countdownSeconds = phase !== "timed_out"
    && remainingSeconds !== null
    && remainingSeconds <= 10
    ? Math.max(remainingSeconds, 1)
    : null;
  const accessibilityLabel = countdownSeconds === null
    ? label
    : `${label}, ${countdownSeconds} seconds until timeout`;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      collapsable={targetRef ? false : undefined}
      ref={targetRef}
      style={[
        styles.puzzleTimingIndicator,
        phase !== "normal" ? styles.puzzleTimingIndicatorSlow : null,
        styles.puzzleTimingIndicatorStandalone
      ]}
      testID="session-puzzle-timing"
      onLayout={onTargetLayout}
    >
      <Text
        adjustsFontSizeToFit
        maxFontSizeMultiplier={PUZZLE_TIMING_MAX_TEXT_SCALE}
        minimumFontScale={0.6}
        numberOfLines={1}
        style={[
          styles.puzzleTimingIndicatorText,
          phase !== "normal" ? styles.puzzleTimingIndicatorTextSlow : null
        ]}
        testID="session-puzzle-timing-label"
      >
        {label}
      </Text>
      {countdownSeconds === null ? null : (
        <Text
          accessibilityElementsHidden
          maxFontSizeMultiplier={PUZZLE_TIMING_MAX_TEXT_SCALE}
          style={styles.puzzleTimingCountdown}
          testID="session-puzzle-countdown"
        >
          {countdownSeconds}s
        </Text>
      )}
    </View>
  );
}

// An estimate of a HUD value's advance width per character, in ems: tabular
// digits and the letters of "Unrated" are about 0.6 em, and spaces and the
// slash are narrower.
const HUD_VALUE_EM_PER_CHARACTER = 0.6;
const HUD_METRIC_GAP = 6;
// Survival's mistakes block keeps this width beside the solved count.
const PERSONAL_BEST_MISTAKES_BLOCK_WIDTH = 64;

// One text size for the HUD values that share a line: the system text scale
// up to the HUD cap, reduced to what the longest value fits in its slot but
// never below the default size (shrink-to-fit handles the rest). The size is
// computed from the base type role, so the HUD reads the same in the Lab.
function hudValueTextSize({
  fontScale,
  role,
  slotWidth,
  texts
}: {
  fontScale: number;
  role: { fontSize: number; lineHeight: number };
  slotWidth: number | null;
  texts: Array<string | null>;
}): { fontSize: number; lineHeight: number } {
  let scale = Math.min(fontScale, HUD_MAX_TEXT_SCALE);
  const longest = Math.max(0, ...texts.map((text) => text?.length ?? 0));
  if (scale > 1 && slotWidth !== null && longest > 0) {
    const fittingScale = slotWidth / (longest * HUD_VALUE_EM_PER_CHARACTER * role.fontSize);
    scale = Math.max(1, Math.min(scale, fittingScale));
  }
  return {
    fontSize: Math.round(role.fontSize * scale * 10) / 10,
    lineHeight: Math.ceil(role.lineHeight * scale)
  };
}

function SessionStatusBar({
  closeAccessibilityLabel = "Abandon sprint",
  compactMetrics = false,
  confirmAbandon,
  leaveConfirmationMinHeight,
  metricsRef,
  mode,
  stackLeaveConfirmation = false,
  personalBest,
  state,
  timerText,
  onAbandon,
  onClose,
  onConfirmAbandonChange,
  onMetricsLayout,
  onPauseAndLeave,
  onPause,
  onResume
}: {
  closeAccessibilityLabel?: string;
  compactMetrics?: boolean;
  confirmAbandon: boolean;
  // The confirmation floats in the prompt card's slot; at least that tall, it
  // covers the card instead of leaving a sliver of it showing beneath.
  leaveConfirmationMinHeight?: number;
  metricsRef?: React.RefObject<View | null>;
  stackLeaveConfirmation?: boolean;
  mode: SprintMode;
  personalBest?: PersonalBestChallengeDesignPreview;
  state: SprintState;
  timerText: string;
  onAbandon?: () => void;
  onClose?: () => void;
  onConfirmAbandonChange: (visible: boolean) => void;
  onMetricsLayout?: () => void;
  onPauseAndLeave?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const isTacticalFocus = state.config.tacticalFocus !== undefined;
  const isPersonalBest = personalBest !== undefined;
  const previousSurvivalBest = personalBest?.bestScore;
  const hasNewSurvivalBest = isPersonalBest
    && state.correctCount >= 1
    && (previousSurvivalBest === null || state.correctCount > (previousSurvivalBest ?? -1));
  const savedSurvivalBest = Math.max(state.correctCount, previousSurvivalBest ?? 0);
  const completedAttempts = state.correctCount + state.mistakeCount;
  const plannedAttempts = state.config.maxAttempts ?? state.config.targetCorrect;
  const showsSessionHeaderAction = Boolean(onClose || onAbandon)
    && !(isPersonalBest && confirmAbandon);
  // HUD values never truncate at large text (#652). At accessibility sizes in
  // the narrow rail, the timer takes its own line above the other metrics; the
  // full-width phone and iPad row keeps all three on one line so a short phone
  // keeps room for the board. Values that share a line share one size, as
  // large as their slots allow up to the HUD cap, and shrink to fit as a
  // safety net.
  const { fontScale } = usePracticeViewport();
  const stacksTimer = compactMetrics && fontScale >= HUD_LARGE_TEXT_FONT_SCALE;
  const [metricsWidth, setMetricsWidth] = useState<number | null>(null);
  const progressText = isPersonalBest
    ? `${state.correctCount} solved`
    : isTacticalFocus
    ? `${completedAttempts} / ${plannedAttempts}`
    : `${state.correctCount} / ${state.config.targetCorrect}`;
  const policyText = isTacticalFocus ? "Unrated" : null;
  const hudValueRole = compactMetrics ? baseTypography.numeralRow : baseTypography.numeral;
  const sharedValueTexts = stacksTimer
    ? [progressText, policyText]
    : [progressText, isPersonalBest ? null : timerText, policyText];
  const slotWidth = (slotCount: number): number | null => metricsWidth === null
    ? null
    : (metricsWidth - HUD_METRIC_GAP * (slotCount - 1)) / slotCount;
  const sharedValueStyle = hudValueTextSize({
    fontScale,
    role: hudValueRole,
    slotWidth: isPersonalBest
      ? metricsWidth === null
        ? null
        : metricsWidth - HUD_METRIC_GAP - PERSONAL_BEST_MISTAKES_BLOCK_WIDTH
      : slotWidth(stacksTimer ? 2 : 3),
    texts: sharedValueTexts
  });
  const timerValueStyle = stacksTimer
    ? hudValueTextSize({ fontScale, role: hudValueRole, slotWidth: slotWidth(1), texts: [timerText] })
    : sharedValueStyle;
  const progressMetric = (
    <View
      accessibilityLabel={isPersonalBest
        ? `Solved ${state.correctCount}`
        : isTacticalFocus
        ? `Puzzles ${completedAttempts} of ${plannedAttempts}`
        : `Progress ${state.correctCount} of ${state.config.targetCorrect}`}
      style={[
        styles.sessionMetricBlock,
        isPersonalBest ? styles.personalBestProgressMetricBlock : null
      ]}
      testID="session-progress-block"
    >
      <Text
        adjustsFontSizeToFit
        allowFontScaling={false}
        minimumFontScale={0.5}
        numberOfLines={1}
        testID="session-progress"
        style={[
          styles.sessionProgressValue,
          styles.sessionMetricValueFill,
          styles.sessionMetricValueLeading,
          compactMetrics ? styles.sessionMetricTextCompact : null,
          sharedValueStyle
        ]}
      >
        {progressText}
      </Text>
    </View>
  );
  const timerMetric = isPersonalBest ? null : (
    <View
      accessibilityLabel={state.config.runClock === "untimed" ? `Elapsed ${timerText}` : `Timer ${timerText}`}
      style={[styles.sessionMetricBlock, stacksTimer ? styles.sessionMetricBlockFullRow : null]}
      testID="session-timer-block"
    >
      <Text
        adjustsFontSizeToFit
        allowFontScaling={false}
        minimumFontScale={0.5}
        numberOfLines={1}
        testID="session-timer"
        style={[
          styles.timerText,
          styles.sessionMetricValueFill,
          compactMetrics ? styles.sessionMetricTextCompact : null,
          timerValueStyle
        ]}
      >
        {timerText}
      </Text>
    </View>
  );
  const policyMetric = isTacticalFocus ? (
    <View
      accessibilityLabel="Rating unchanged"
      style={styles.sessionMetricBlock}
      testID="session-rating-policy"
    >
      <Text
        adjustsFontSizeToFit
        allowFontScaling={false}
        minimumFontScale={0.5}
        numberOfLines={1}
        style={[
          styles.timerText,
          styles.sessionMetricValueFill,
          styles.sessionMetricValueTrailing,
          compactMetrics ? styles.sessionMetricTextCompact : null,
          sharedValueStyle
        ]}
      >
        Unrated
      </Text>
    </View>
  ) : (
    <View
      accessibilityLabel={`Mistakes ${state.mistakeCount} of ${state.config.maxMistakes}`}
      style={[
        styles.sessionMetricBlock,
        styles.sessionMetricBlockTrailing,
        isPersonalBest ? styles.personalBestMistakesMetricBlock : null
      ]}
      testID="session-mistakes-block"
    >
      <SessionMistakeIndicator
        count={state.mistakeCount}
        max={state.config.maxMistakes}
      />
    </View>
  );
  return (
    <View
      style={[
        styles.activeSessionShell,
        confirmAbandon ? styles.activeSessionShellRaised : null
      ]}
      testID="active-session-shell"
    >
      <View style={styles.sessionNavRow} testID="session-shell-nav">
        {showsSessionHeaderAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeAccessibilityLabel}
            testID="session-abandon"
            style={styles.sessionNavButton}
            onPress={onClose ?? (() => onConfirmAbandonChange(true))}
          >
            {isPersonalBest ? <PauseGlyph /> : <CloseGlyph />}
          </Pressable>
        ) : (
          <View style={styles.sessionNavButton} />
        )}
        <Text
          adjustsFontSizeToFit
          // iOS keeps a shrink-to-fit title's old size after a Dynamic Type
          // change; a new key measures it again at the new size.
          key={`session-title-${fontScale}`}
          maxFontSizeMultiplier={HUD_MAX_TEXT_SCALE}
          minimumFontScale={0.5}
          numberOfLines={1}
          style={styles.sessionNavTitle}
        >
          {isPersonalBest ? "Survival" : isTacticalFocus ? "Focused Run" : modeLabel(mode)}
        </Text>
        <View style={styles.sessionNavActions} testID="session-nav-actions">
          {isPersonalBest ? (
            <View style={styles.sessionNavButton} />
          ) : onPause ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isTacticalFocus ? "Pause Focused Run" : "Pause sprint"}
              testID="session-pause"
              style={styles.sessionNavButton}
              onPress={onPause}
            >
              <PauseGlyph />
            </Pressable>
          ) : onResume ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isTacticalFocus ? "Resume Focused Run" : "Resume sprint"}
              testID="session-resume"
              style={styles.sessionNavButton}
              onPress={onResume}
            >
              <PlayGlyph />
            </Pressable>
          ) : (
            <View style={styles.sessionNavButton} testID="session-overflow">
              <MoreGlyph />
            </View>
          )}
        </View>
      </View>

      <View
        collapsable={metricsRef ? false : undefined}
        ref={metricsRef}
        style={[
          styles.sessionActiveMetricRow,
          compactMetrics ? styles.sessionActiveMetricRowCompact : null,
          stacksTimer ? styles.sessionActiveMetricRowLargeText : null
        ]}
        testID="session-status-metrics"
        onLayout={(event) => {
          const width = Math.round(event.nativeEvent.layout.width);
          setMetricsWidth((current) => current === width ? current : width);
          onMetricsLayout?.();
        }}
      >
        {stacksTimer ? (
          <>
            {timerMetric}
            <View style={styles.sessionMetricLargeTextRow}>
              {progressMetric}
              {policyMetric}
            </View>
          </>
        ) : (
          <>
            {progressMetric}
            {timerMetric}
            {policyMetric}
          </>
        )}
      </View>

      {/* The leave confirmation floats over the prompt card below the HUD
          instead of growing the session stack, so the counts and board never
          move into the bottom inset while it is open, at any width. */}
      {confirmAbandon && isPersonalBest ? (
        <View
          style={[styles.sessionLeaveConfirmationOverlay, styles.survivalExitSheet]}
          testID="session-abandon-confirmation"
        >
          <View style={styles.sessionAbandonCopy}>
            <Text style={styles.survivalExitTitle}>Survival paused</Text>
            <Text style={styles.survivalExitBest} testID="personal-best-exit-best">
              {hasNewSurvivalBest
                ? `New best ${savedSurvivalBest} · already saved`
                : previousSurvivalBest === null
                  ? "No best yet · solve 1 to set it"
                : `Best ${savedSurvivalBest} · saved`}
            </Text>
            <Text style={styles.helperText}>
              Your puzzle is hidden. Resume here, or leave it paused and continue any time.
            </Text>
          </View>
          <View style={styles.survivalExitPrimaryActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Leave Survival paused"
              testID="personal-best-pause-and-leave"
              style={[styles.secondaryButton, styles.survivalExitAction]}
              onPress={() => {
                onConfirmAbandonChange(false);
                onPauseAndLeave?.();
              }}
            >
              <Text style={styles.secondaryButtonText}>Leave paused</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Resume Survival"
              testID="session-abandon-cancel"
              style={[styles.primaryButton, styles.survivalExitAction]}
              onPress={() => {
                onResume?.();
                onConfirmAbandonChange(false);
              }}
            >
              <Text style={styles.primaryButtonText}>Resume</Text>
            </Pressable>
          </View>
        </View>
      ) : confirmAbandon ? (
        <View
          style={[
            styles.sessionLeaveConfirmationOverlay,
            styles.sessionAbandonConfirm,
            stackLeaveConfirmation ? styles.sessionAbandonConfirmStacked : null,
            leaveConfirmationMinHeight === undefined
              ? null
              : { minHeight: leaveConfirmationMinHeight }
          ]}
          testID="session-abandon-confirmation"
        >
          <View
            style={[
              styles.sessionAbandonCopy,
              stackLeaveConfirmation ? styles.sessionAbandonCopyStacked : null
            ]}
          >
            <Text style={styles.listText}>
              {isTacticalFocus ? "Abandon Focused Run?" : "Abandon sprint?"}
            </Text>
            <Text style={styles.helperText}>
              {isTacticalFocus
                ? "This ends the Focused Run. Completed puzzles stay in History and your Rating stays unchanged."
                : "This ends the run and records a failed sprint."}
            </Text>
          </View>
          <View
            style={[
              styles.sessionAbandonActions,
              stackLeaveConfirmation ? styles.sessionAbandonActionsStacked : null
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isTacticalFocus
                ? "Cancel abandoning Focused Run"
                : "Cancel abandon sprint"}
              testID="session-abandon-cancel"
              style={styles.secondaryButton}
              onPress={() => onConfirmAbandonChange(false)}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isTacticalFocus
                ? "Confirm abandoning Focused Run"
                : "Confirm abandon sprint"}
              testID="session-abandon-confirm"
              style={styles.destructiveButton}
              onPress={() => {
                onConfirmAbandonChange(false);
                onAbandon?.();
              }}
            >
              <Text style={styles.destructiveButtonText}>Abandon</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PreviousAttemptNotice({
  reason
}: {
  reason: PreviousAttemptNoticeReason;
}): React.JSX.Element {
  const styles = useStyles();
  const presentation = reason === "slow"
    ? {
        detail: "It was automatically marked Unclear and added to Review.",
        status: "Marked Unclear",
        title: "Previous puzzle took too long"
      }
    : reason === "wrong"
      ? {
          detail: "It counted as a mistake and was added to Review.",
          status: "In Review",
          title: "Previous answer was incorrect"
        }
      : {
          detail: "It counted as a mistake and was added to Review.",
          status: "In Review",
          title: "Previous puzzle timed out"
        };
  return (
    <View
      accessibilityLabel={`${presentation.title}. ${presentation.detail} ${presentation.status}.`}
      accessibilityLiveRegion="polite"
      style={styles.unclearPrompt}
      testID="sprint-previous-attempt-notice"
    >
      <View style={styles.previousAttemptNoticeCopy}>
        <Text
          maxFontSizeMultiplier={FEEDBACK_MAX_TEXT_SCALE}
          style={styles.previousAttemptNoticeTitle}
        >
          {presentation.title}
        </Text>
        <Text
          maxFontSizeMultiplier={FEEDBACK_MAX_TEXT_SCALE}
          style={styles.previousAttemptNoticeDetail}
        >
          {presentation.detail}
        </Text>
      </View>
      <View
        style={styles.readOnlyAttemptStatus}
        testID="sprint-previous-attempt-notice-status"
      >
        <Text
          maxFontSizeMultiplier={FEEDBACK_MAX_TEXT_SCALE}
          style={styles.readOnlyAttemptStatusText}
        >
          {presentation.status}
        </Text>
      </View>
    </View>
  );
}

function UnclearAttemptPrompt({
  marked,
  onToggle,
  onTargetLayout,
  question,
  targetArea = "action",
  targetRef
}: {
  marked: boolean;
  onToggle: () => void;
  onTargetLayout?: (event: LayoutChangeEvent) => void;
  question: string;
  targetArea?: "action" | "prompt";
  targetRef?: React.RefObject<View | null>;
}): React.JSX.Element {
  const styles = useStyles();
  const targetsPrompt = targetArea === "prompt";

  return (
    <View
      accessibilityLabel={`${question} ${marked ? "Marked as unclear." : "Mark as unclear. Activate to mark unclear."}`}
      ref={targetsPrompt ? targetRef : undefined}
      style={styles.unclearPrompt}
      testID="sprint-unclear-prompt"
      onLayout={targetsPrompt ? onTargetLayout : undefined}
    >
      <View style={styles.unclearPromptCopy}>
        <Text
          maxFontSizeMultiplier={FEEDBACK_MAX_TEXT_SCALE}
          style={styles.unclearPromptQuestion}
          testID="sprint-unclear-question"
        >
          {question}
        </Text>
      </View>
      {marked ? (
        <View style={styles.readOnlyAttemptStatus} testID="sprint-unclear-marked">
          <Text maxFontSizeMultiplier={FEEDBACK_MAX_TEXT_SCALE} style={styles.readOnlyAttemptStatusText}>
            Marked
          </Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark this attempt as unclear"
          ref={targetsPrompt ? undefined : targetRef}
          style={styles.unclearPromptButton}
          testID="sprint-unclear-toggle"
          onPress={onToggle}
          onLayout={targetsPrompt ? undefined : onTargetLayout}
        >
          <Text maxFontSizeMultiplier={FEEDBACK_MAX_TEXT_SCALE} style={styles.unclearPromptButtonText}>
            Mark as unclear
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function ErrorPanel({ error }: { error: string }): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      accessible
      accessibilityLabel={`Error. ${error}`}
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      style={styles.errorPanel}
      testID="error-panel"
    >
      <Text style={styles.errorText}>{error}</Text>
    </View>
  );
}

function ArrowDuelWhatIfOverlay({
  actionLabel,
  compactTitle = false,
  detail,
  onAction,
  optionalSettingsHint,
  testIDPrefix,
  title = "What if you made\nthe other move?",
  titleSide,
  veryCompactTitle = false
}: {
  actionLabel?: string;
  compactTitle?: boolean;
  detail: string;
  onAction?: () => void;
  optionalSettingsHint?: string;
  testIDPrefix: string;
  title?: string;
  titleSide?: MoveSide;
  veryCompactTitle?: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  const accessibilityTitle = title.replace(/\s+/g, " ");
  return (
    <View
      pointerEvents={actionLabel && onAction ? "auto" : "none"}
      style={styles.arrowDuelWhatIfOverlay}
      testID={`${testIDPrefix}-what-if-overlay`}
    >
      <View
        accessible
        accessibilityLabel={`${accessibilityTitle} ${detail}${optionalSettingsHint ? ` ${optionalSettingsHint}` : ""}`}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={styles.arrowDuelWhatIfAnnouncement}
        testID={`${testIDPrefix}-what-if-announcement`}
      >
        {titleSide ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.arrowDuelWhatIfTitleBlock}
            testID={`${testIDPrefix}-what-if-title`}
          >
            <View style={styles.arrowDuelWhatIfTitleLead}>
              <Text style={[
                styles.arrowDuelWhatIfTitleLine,
                compactTitle ? styles.arrowDuelWhatIfTitleLineCompact : null,
                veryCompactTitle ? styles.arrowDuelWhatIfTitleLineVeryCompact : null
              ]}>
                What would
              </Text>
              <View
                style={[
                  styles.arrowDuelWhatIfSideGlyphChip,
                  compactTitle ? styles.arrowDuelWhatIfSideGlyphChipCompact : null,
                  veryCompactTitle ? styles.arrowDuelWhatIfSideGlyphChipVeryCompact : null
                ]}
                testID={`${testIDPrefix}-what-if-side-glyph`}
              >
                <MoveSideGlyph
                  kingPieceSize={veryCompactTitle ? 19 : compactTitle ? 22 : 26}
                  side={titleSide}
                  testID={`${testIDPrefix}-what-if-side-king`}
                />
              </View>
              <Text style={[
                styles.arrowDuelWhatIfTitleLine,
                compactTitle ? styles.arrowDuelWhatIfTitleLineCompact : null,
                veryCompactTitle ? styles.arrowDuelWhatIfTitleLineVeryCompact : null
              ]}>
                play
              </Text>
            </View>
            <Text style={[
              styles.arrowDuelWhatIfTitleLine,
              compactTitle ? styles.arrowDuelWhatIfTitleLineCompact : null,
              veryCompactTitle ? styles.arrowDuelWhatIfTitleLineVeryCompact : null
            ]}>
              after the other move?
            </Text>
          </View>
        ) : (
          <Text
            style={styles.arrowDuelWhatIfTitle}
            testID={`${testIDPrefix}-what-if-title`}
          >
            {title}
          </Text>
        )}
        <Text
          style={styles.arrowDuelWhatIfDetail}
          testID={`${testIDPrefix}-what-if-detail`}
        >
          {detail}
        </Text>
        {optionalSettingsHint ? (
          <Text
            style={styles.arrowDuelWhatIfSettingsHint}
            testID={`${testIDPrefix}-what-if-settings-hint`}
          >
            {optionalSettingsHint}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          style={styles.arrowDuelWhatIfAction}
          testID={`${testIDPrefix}-what-if-action`}
          onPress={onAction}
        >
          <Text style={styles.arrowDuelWhatIfActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ArrowDuelReplyChallengePrompt({
  currentPuzzle,
  explicitReplySideCopy = false,
  frameHeight,
  hideSideGlyph = false,
  kingPieceSize,
  legacyPracticePromptTestIDs = false,
  phase,
  promptSide,
  replyReady,
  replySeconds,
  rootTestID,
  settingsHint,
  showReplyTimer = true,
  testIDPrefix = "arrow-duel"
}: {
  currentPuzzle: ArrowDuelState;
  explicitReplySideCopy?: boolean;
  frameHeight: number;
  hideSideGlyph?: boolean;
  kingPieceSize: number;
  legacyPracticePromptTestIDs?: boolean;
  phase: ArrowDuelReplyChallengePhase;
  promptSide: MoveSide | null;
  replyReady: boolean;
  replySeconds: number;
  rootTestID?: string;
  settingsHint?: string;
  showReplyTimer?: boolean;
  testIDPrefix?: string;
}): React.JSX.Element {
  const styles = useStyles();
  const displayedSide = promptSide ?? sideToMove(currentPuzzle.currentFen);
  const side = displayedSide === "b" ? "black" : "white";
  const sideName = moveSideDisplayName(displayedSide);
  const expectedReply = currentPuzzle.puzzle.solutionMoves[1] ?? "";
  const copy = phase === "choice"
    ? {
        context: `For ${side}, between the two arrows.`,
        hint: "Be ready for a quick reply check.",
        title: "Choose the best move",
        tone: "neutral" as const
      }
    : {
        context: explicitReplySideCopy
          ? "The other move was played."
          : "If the tempting move was played, what happens next?",
        hint: settingsHint ?? null,
        title: explicitReplySideCopy ? `Find ${sideName}’s reply` : "Find the reply",
        tone: "reply" as const
      };

  return (
    <View
      accessibilityLabel={[copy.title, copy.context, copy.hint].filter(Boolean).join(". ")}
      style={[
        styles.promptPanel,
        { height: frameHeight },
        styles.arrowDuelReplyPromptPanel,
        copy.tone === "reply" ? styles.arrowDuelReplyPromptActive : null
      ]}
      testID={rootTestID ?? `${testIDPrefix}-reply-challenge`}
    >
      {!hideSideGlyph ? (
        <View
          style={[styles.promptIcon, { height: kingPieceSize, width: kingPieceSize }]}
          testID="practice-prompt-icon"
        >
          <MoveSideGlyph
            kingPieceSize={kingPieceSize}
            side={displayedSide}
            testID="practice-prompt-side-glyph"
          />
        </View>
      ) : null}
      <View
        style={[styles.promptCopy, styles.arrowDuelReplyPromptCopy]}
        testID="practice-prompt-copy"
      >
        <View
          style={styles.arrowDuelReplyCopyLayer}
          testID={`${testIDPrefix}-reply-copy-layer`}
        >
          <View style={styles.arrowDuelReplyTitleRow}>
            <Text
              style={styles.promptTitle}
              testID={legacyPracticePromptTestIDs
                ? "practice-prompt-title-layout"
                : `${testIDPrefix}-reply-title`}
            >
              {copy.title}
            </Text>
            {phase === "reply" && replyReady && showReplyTimer ? (
              <View
                accessibilityLabel={`${replySeconds} ${replySeconds === 1 ? "second" : "seconds"} remaining.`}
                style={styles.arrowDuelReplyTimerGroup}
                testID={`${testIDPrefix}-reply-timer-group`}
              >
                <Text style={styles.arrowDuelReplyTimer} testID={`${testIDPrefix}-reply-timer`}>
                  {formatCompactDuration(replySeconds)}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            style={styles.promptText}
            testID={legacyPracticePromptTestIDs
              ? "practice-prompt-context"
              : `${testIDPrefix}-reply-context`}
          >
            {copy.context}
          </Text>
          <Text
            accessible={Boolean(copy.hint)}
            accessibilityElementsHidden={!copy.hint}
            importantForAccessibility={copy.hint ? "auto" : "no-hide-descendants"}
            style={[styles.promptHint, copy.hint ? null : styles.promptEmptyLayoutCopy]}
            testID={legacyPracticePromptTestIDs
              ? "practice-prompt-hint"
              : `${testIDPrefix}-reply-hint`}
          >
            {copy.hint ?? "\u00A0"}
          </Text>
          {phase === "reply" ? (
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={FABRIC_SAFE_HIDDEN_TEXT_STYLE}
              testID={`${testIDPrefix}-reply-expected-move`}
            >
              {expectedReply}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function PracticePrompt({
  currentPuzzle,
  frameHeight,
  kingPieceSize,
  mode,
  promptSide,
  solved = false,
  promptText,
  promptHint,
  promptHintNumberOfLines,
  reserveDefaultLayout = false
}: {
  currentPuzzle: CurrentPuzzleState | undefined;
  frameHeight: number;
  kingPieceSize: number;
  mode: SprintMode;
  promptSide?: MoveSide;
  solved?: boolean;
  promptText?: string | null;
  promptHint?: string | null;
  promptHintNumberOfLines?: number;
  reserveDefaultLayout?: boolean;
}): React.JSX.Element | null {
  const styles = useStyles();
  if (!currentPuzzle) {
    return null;
  }
  const displayedSide = promptSide ?? sideToMove(currentPuzzle.currentFen);
  const side = displayedSide === "b" ? "black" : "white";
  const usesArrowDuelPrompt = currentPuzzle.kind === "arrow_duel"
    || (reserveDefaultLayout && mode === "arrow_duel");
  const defaultPromptTitle = usesArrowDuelPrompt ? "Choose the best move" : "Find the best move";
  const defaultPromptContext = usesArrowDuelPrompt
    ? `For ${side}, between the two arrows.`
    : `For ${side}.`;
  const defaultPromptHint = usesArrowDuelPrompt
    ? "Watch for checks, captures, and attacks!"
    : null;
  const promptContext = promptText === undefined ? defaultPromptContext : promptText;
  const promptHintCopy = promptHint === undefined
    ? defaultPromptHint
    : promptHint;
  const promptTitle = promptText === undefined
    ? defaultPromptTitle
    : modeLabel(mode);
  const layoutPromptTitle = reserveDefaultLayout ? defaultPromptTitle : promptTitle;
  const layoutPromptContext = reserveDefaultLayout ? defaultPromptContext : promptContext;
  const layoutPromptHint = reserveDefaultLayout ? defaultPromptHint : promptHintCopy;
  const layoutCopyHidden = solved || reserveDefaultLayout;
  const layoutContextHidden = layoutCopyHidden || !layoutPromptContext;
  const layoutHintHidden = layoutCopyHidden || !layoutPromptHint;

  return (
    <View style={[styles.promptPanel, { height: frameHeight }]} testID="practice-prompt">
      <View
        style={[styles.promptIcon, { height: kingPieceSize, width: kingPieceSize }]}
        testID="practice-prompt-icon"
      >
        <MoveSideGlyph
          kingPieceSize={kingPieceSize}
          side={displayedSide}
          testID="practice-prompt-side-glyph"
        />
      </View>
      <View style={styles.promptCopy} testID="practice-prompt-copy">
        <View testID="practice-prompt-title-slot">
          <Text
            accessible={!layoutCopyHidden}
            accessibilityElementsHidden={layoutCopyHidden}
            importantForAccessibility={layoutCopyHidden ? "no-hide-descendants" : "auto"}
            maxFontSizeMultiplier={PROMPT_MAX_TEXT_SCALE}
            style={[styles.promptTitle, layoutCopyHidden ? styles.promptSolvedLayoutCopy : null]}
            testID="practice-prompt-title-layout"
          >
            {layoutPromptTitle}
          </Text>
        </View>
        <Text
          accessible={!layoutContextHidden}
          accessibilityElementsHidden={layoutContextHidden}
          importantForAccessibility={layoutContextHidden ? "no-hide-descendants" : "auto"}
          maxFontSizeMultiplier={PROMPT_MAX_TEXT_SCALE}
          style={[styles.promptText, layoutContextHidden ? styles.promptSolvedLayoutCopy : null]}
          testID="practice-prompt-context"
        >
          {layoutPromptContext ?? "\u00A0"}
        </Text>
        <Text
          accessible={!layoutHintHidden}
          accessibilityElementsHidden={layoutHintHidden}
          importantForAccessibility={layoutHintHidden ? "no-hide-descendants" : "auto"}
          maxFontSizeMultiplier={PROMPT_MAX_TEXT_SCALE}
          numberOfLines={reserveDefaultLayout ? undefined : promptHintNumberOfLines}
          style={[
            styles.promptHint,
            layoutHintHidden
              ? layoutPromptHint
                ? styles.promptSolvedLayoutCopy
                : styles.promptEmptyLayoutCopy
              : null
          ]}
          testID="practice-prompt-hint"
        >
          {layoutPromptHint ?? "\u00A0"}
        </Text>
        {reserveDefaultLayout && !solved ? (
          <View
            pointerEvents="none"
            style={[styles.promptSolvedOverlay, styles.promptMessageOverlay]}
            testID="practice-prompt-message-overlay"
          >
            <Text style={styles.promptTitle} testID="practice-prompt-message-title">
              {promptTitle}
            </Text>
            {promptContext ? (
              <Text style={styles.promptText} testID="practice-prompt-message-context">
                {promptContext}
              </Text>
            ) : null}
            {promptHintCopy ? (
              <Text
                numberOfLines={promptHintNumberOfLines}
                style={styles.promptHint}
                testID="practice-prompt-message-hint"
              >
                {promptHintCopy}
              </Text>
            ) : null}
          </View>
        ) : null}
        {solved ? (
          <View
            pointerEvents="none"
            style={styles.promptSolvedOverlay}
            testID="practice-prompt-solved-overlay"
          >
            <Text style={styles.promptTitle} testID="practice-prompt-solved-title">
              Solved
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function BoardInputBlocker(): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onPress={() => undefined}
      style={styles.boardInputBlocker}
      testID="board-input-blocker"
    />
  );
}

function SessionScoreStrip({
  compact = false,
  state
}: {
  compact?: boolean;
  state: SprintState;
}): React.JSX.Element {
  const styles = useStyles();
  const isTacticalFocus = state.config.tacticalFocus !== undefined;
  const completedCount = state.correctCount + state.mistakeCount;
  const leftCount = Math.max(
    0,
    (isTacticalFocus
      ? state.config.maxAttempts ?? state.config.targetCorrect
      : state.config.targetCorrect) -
      (isTacticalFocus ? completedCount : state.correctCount)
  );
  return (
    <View
      accessibilityLabel={isTacticalFocus
        ? `Focused Run: completed ${completedCount}, correct ${state.correctCount}, left ${leftCount}`
        : `Session score: solved ${state.correctCount}, mistakes ${state.mistakeCount}, left ${leftCount}`}
      style={[
        styles.sessionScoreStrip,
        compact ? styles.sessionScoreStripCompact : null
      ]}
      testID="session-score-strip"
    >
      <SessionScoreMetric
        label={isTacticalFocus ? "Completed" : "Solved"}
        metricTestID={isTacticalFocus ? "session-score-completed" : "session-score-solved"}
        compact={compact}
        showLabel={isTacticalFocus}
        tone="positive"
        value={isTacticalFocus ? completedCount : state.correctCount}
      />
      <SessionScoreMetric
        label={isTacticalFocus ? "Correct" : "Mistakes"}
        metricTestID={isTacticalFocus ? "session-score-correct" : "session-score-mistakes"}
        compact={compact}
        showLabel={isTacticalFocus}
        tone={isTacticalFocus ? "positive" : "negative"}
        value={isTacticalFocus ? state.correctCount : state.mistakeCount}
      />
      <SessionScoreMetric
        label="Left"
        metricTestID="session-score-left"
        compact={compact}
        showLabel={isTacticalFocus}
        tone="neutral"
        value={leftCount}
      />
    </View>
  );
}

function SessionScoreMetric({
  compact = false,
  label,
  metricTestID,
  showLabel = false,
  tone,
  value
}: {
  compact?: boolean;
  label: string;
  metricTestID: string;
  showLabel?: boolean;
  tone: "positive" | "negative" | "neutral";
  value: number;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${value}`}
      style={[
        styles.sessionScoreMetric,
        showLabel ? styles.sessionScoreMetricLabeled : null,
        compact ? styles.sessionScoreMetricCompact : null
      ]}
      testID={metricTestID}
    >
      {showLabel ? (
        <Text
          adjustsFontSizeToFit={compact}
          maxFontSizeMultiplier={SCORE_LABEL_MAX_TEXT_SCALE}
          minimumFontScale={0.75}
          numberOfLines={1}
          style={[
            styles.sessionScoreLabel,
            showLabel ? styles.sessionScoreTextStretch : null,
            compact ? styles.sessionScoreLabelCompact : null
          ]}
        >
          {label}
        </Text>
      ) : (
        <SessionScoreGlyph tone={tone} />
      )}
      <Text
        maxFontSizeMultiplier={SCORE_VALUE_MAX_TEXT_SCALE}
        numberOfLines={1}
        style={[styles.sessionScoreValue, showLabel ? styles.sessionScoreTextStretch : null]}
        testID={`${metricTestID}-value`}
      >
        {value}
      </Text>
    </View>
  );
}

function kingGlyphSizeForBoard(boardSize: number): number {
  return Math.max(1, Math.round(boardSize / 8));
}

function BoardCoordinateOverlay({
  boardSize,
  flipped
}: {
  boardSize: number;
  flipped: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  const squareSize = boardSize / 8;
  const fontSize = Math.max(9, Math.min(12, squareSize * 0.22));
  const files = flipped ? BOARD_FILES_FLIPPED : BOARD_FILES;
  const ranks = flipped ? BOARD_RANKS_FLIPPED : BOARD_RANKS;

  return (
    <View
      pointerEvents="none"
      style={[styles.coordinateOverlay, { width: boardSize, height: boardSize }]}
      testID="board-coordinate-overlay"
    >
      {files.map((file, index) => (
        <Text
          key={`file-${file}-${index}`}
          style={[
            styles.coordinateText,
            styles.coordinateFileText,
            coordinateTextStyle(styles, 7, index),
            {
              bottom: 2,
              fontSize,
              left: index * squareSize,
              width: squareSize
            }
          ]}
          allowFontScaling={false}
          testID={`board-coordinate-file-${file}`}
        >
          {file}
        </Text>
      ))}
      {ranks.map((rank, index) => (
        <Text
          key={`rank-${rank}-${index}`}
          style={[
            styles.coordinateText,
            styles.coordinateRankText,
            coordinateTextStyle(styles, index, 0),
            {
              fontSize,
              left: 3,
              top: index * squareSize + 2
            }
          ]}
          allowFontScaling={false}
          testID={`board-coordinate-rank-${rank}`}
        >
          {rank}
        </Text>
      ))}
    </View>
  );
}

function coordinateTextStyle(styles: ReturnType<typeof useStyles>, row: number, col: number): object {
  return (row + col) % 2 === 0 ? styles.coordinateTextOnLight : styles.coordinateTextOnDark;
}

// Accessible marker for the last move. The board itself paints the tint
// beneath its pieces (`useBoardMoveSquareTints`); a tinted view here would sit
// over the piece artwork and wash it out (#629).
function LastMoveOverlay({
  boardSize,
  move,
  overlayTestID
}: {
  boardSize: number;
  move: BoardMove;
  overlayTestID: string;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      accessible
      accessibilityLabel={`Last move ${move.from} to ${move.to}`}
      accessibilityRole="image"
      pointerEvents="none"
      style={[styles.arrowLayer, { width: boardSize, height: boardSize }]}
      testID={overlayTestID}
    />
  );
}

type BoardSquareTint = { square: Square; color: string };

// Tints a move's origin and target. The board draws them beneath its pieces so
// black and white piece artwork keeps its own contrast (#629).
function boardMoveSquareTints(move: BoardMove, color: string): BoardSquareTint[] {
  return [
    { square: move.from as Square, color },
    { square: move.to as Square, color }
  ];
}

// Memoized per move and color so clock re-renders leave the board layer alone.
function useBoardMoveSquareTints(move: BoardMove | null, color: string): BoardSquareTint[] | undefined {
  const from = move?.from ?? null;
  const to = move?.to ?? null;
  return useMemo(
    () => (from && to ? boardMoveSquareTints({ from, to }, color) : undefined),
    [color, from, to]
  );
}

function moveFeedbackTint(theme: Theme, result: "correct" | "wrong"): string {
  return result === "correct" ? theme.colors.positive.flash : theme.colors.danger.flash;
}

function sessionBoardAccessibilityLabel(
  side: MoveSide | null,
  lastMove: BoardMove | null
): string {
  const parts = ["Chess board"];
  if (side) {
    parts.push(sideToMoveAccessibilityLabel(side));
  }
  if (lastMove) {
    parts.push(`Last move ${lastMove.from} to ${lastMove.to}`);
  }
  return parts.join(". ");
}

// Marks the submitted move's feedback window. The board paints the correct or
// wrong tint beneath its pieces (`useBoardMoveSquareTints`).
function MoveFeedbackOverlay({ boardSize }: { boardSize: number }): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      pointerEvents="none"
      style={[styles.arrowLayer, { width: boardSize, height: boardSize }]}
      testID="move-feedback-overlay"
    />
  );
}

function ArrowCandidateOverlay({
  boardSize,
  flipped,
  candidates,
  testID
}: {
  boardSize: number;
  flipped: boolean;
  candidates: string[];
  testID?: string;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const squareSize = boardSize / 8;
  const pieceMoves = candidates.map((candidate) => ({
    move: candidate,
    role: "candidate",
    color: "neutral",
    selected: false
  }));

  return (
    <View
      accessible
      accessibilityLabel={`Arrow Duel candidates: ${candidates.join(", ")}`}
      accessibilityValue={{ text: candidates.join(", ") }}
      style={[styles.arrowLayer, { width: boardSize, height: boardSize }]}
      pointerEvents="none"
      testID={testID}
    >
      {testID ? <View testID={`${testID}-order-${candidates.join("-")}`} /> : null}
      {pieceMoves.map((arrow) => {
        const from = arrowFromTo(arrow.move);
        const arrowStyle = { stroke: appTheme.colors.accent.s600, opacity: 0.68 };
        if (!from) {
          return null;
        }
        return (
          <View key={`${arrow.move}`}>
            <ArrowHint
              boardSize={boardSize}
              squareSize={squareSize}
              flipped={flipped}
              move={arrow.move}
              stroke={arrowStyle.stroke}
              opacity={arrowStyle.opacity}
              selected={arrow.selected}
              from={from}
            />
          </View>
        );
      })}
    </View>
  );
}

function ArrowHint({
  boardSize,
  squareSize,
  flipped,
  move: _move,
  stroke,
  opacity,
  selected,
  from
}: {
  boardSize: number;
  squareSize: number;
  flipped: boolean;
  move: string;
  stroke: string;
  opacity: number;
  selected: boolean;
  from: { from: string; to: string };
}): React.JSX.Element {
  const styles = useStyles();
  const fromPos = squareToPixel(from.from, squareSize, flipped);
  const toPos = squareToPixel(from.to, squareSize, flipped);
  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const strokeWidth = Math.max(7, squareSize * (selected ? 0.18 : 0.14));
  const headSize = Math.max(18, squareSize * (selected ? 0.34 : 0.3));
  const bodyLength = Math.max(0, len - squareSize * 0.42);
  const bodyStart = squareSize * 0.22;

  return (
    <View
      style={[
        styles.arrowLineWrap,
        {
          width: boardSize,
          height: boardSize
        }
      ]}
    >
      <View
        style={[
          styles.analysisArrowBody,
          {
            backgroundColor: stroke,
            height: strokeWidth,
            left: fromPos.x + Math.cos(angle) * bodyStart,
            opacity,
            top: fromPos.y - strokeWidth / 2 + Math.sin(angle) * bodyStart,
            transform: [{ rotateZ: `${angle}rad` }],
            width: bodyLength
          }
        ]}
      />
      <View
        style={[
          styles.analysisArrowHead,
          {
            borderLeftColor: stroke,
            borderLeftWidth: headSize,
            borderTopWidth: headSize * 0.52,
            borderBottomWidth: headSize * 0.52,
            left: toPos.x - headSize * 0.5,
            opacity,
            top: toPos.y - headSize * 0.52,
            transform: [{ rotateZ: `${angle}rad` }]
          }
        ]}
      />
    </View>
  );
}

function reviewItemSpeedSeconds(
  review: Pick<ReviewQueueState, "ratingKey">
): number | null {
  const match = review.ratingKey.match(/\/(\d+)\b/);
  return match ? Number(match[1]) : null;
}

function reviewItemSourceSprintLabel(
  review: Pick<ReviewQueueState, "mode" | "ratingKey">
): string {
  const speed = reviewItemSpeedSeconds(review);
  const speedLabel = speed === null ? null : `${speed}s pace`;
  return `Source sprint: ${modeLabel(review.mode)}${speedLabel ? ` · ${speedLabel}` : ""}`;
}

function reviewQueueFilterLabel(filter: ReviewTodayFilter): string {
  if (filter === "all") {
    return "All";
  }
  if (filter === "overdue") {
    return "Overdue";
  }
  if (filter === "missed_twice") {
    return "Missed 2+ times";
  }
  return "Arrow Duel";
}

const REVIEW_TODAY_FILTERS: readonly ReviewTodayFilter[] = [
  "all",
  "overdue",
  "missed_twice",
  "arrow_duel"
];

function reviewQueueSummary(queue: ReviewQueueState[], filteredItems: ReviewQueueItem[], nowMs: number): {
  dueStatusLabel: string;
  filteredCount: number;
  oldestDueLabel: string;
  overdueCount: number;
  tomorrowCount: number;
  nextSevenDaysCount: number;
  totalCount: number;
} {
  const forecast = reviewQueueForecast(queue, nowMs);
  const filteredOverdueCount = filteredItems.filter((item) => isReviewOverdue(item.review, nowMs)).length;
  return {
    dueStatusLabel: filteredItems.length === 0
      ? "No matching scheduled reviews"
      : filteredOverdueCount > 0
        ? "Overdue now"
        : "Ready now",
    filteredCount: filteredItems.length,
    oldestDueLabel: forecast.totalCount === 0
      ? "Next review appears after a missed puzzle reaches its due time"
      : forecast.todayCount > 0
        ? `Oldest due ${formatReviewDay(queue.map((review) => review.dueDay).sort()[0]!)}`
        : `Next review due ${formatReviewDay(forecast.nextDueDay!)}`,
    overdueCount: forecast.overdueCount,
    tomorrowCount: forecast.tomorrowCount,
    nextSevenDaysCount: forecast.nextSevenDaysCount,
    totalCount: forecast.totalCount
  };
}

type HistoryUnavailableAttempt = {
  attempt: HistoryAttemptView;
  replayAvailability: Extract<HistoryAttemptReplayAvailability, { status: "unavailable" }>;
};

function withAttemptClarity<T extends AttemptEvent | HistoryAttemptView>(
  attempt: T,
  clarity: Pick<AttemptEvent, "unclear" | "unclearUpdatedAt">
): T {
  const base = { ...attempt };
  delete base.unclear;
  delete base.unclearUpdatedAt;
  return {
    ...base,
    unclear: Boolean(clarity.unclear),
    ...(clarity.unclearUpdatedAt ? { unclearUpdatedAt: clarity.unclearUpdatedAt } : {})
  } as T;
}

function reviewQuickFilterTestID(filter: ReviewTodayFilter): string {
  if (filter === "missed_twice") {
    return "review-filter-repeat-misses";
  }
  if (filter === "arrow_duel") {
    return "review-filter-arrow-duel";
  }
  return `review-filter-${filter}`;
}

type ReviewPuzzleState =
  | {
      kind: "line";
      line: PuzzleLineState;
      arrowDuelLineKind?: "punishment" | "reply";
    }
  | { kind: "arrow_duel"; duel: ArrowDuelState };

function buildServiceReviewEntry(
  service: PracticeService,
  input: Omit<ReviewEntry, "curatedThemes" | "opponentReply">
): ReviewEntry {
  const opponentReply = service.opponentReplyForReview({
    mode: input.mode,
    ratingKey: input.ratingKey,
    ...(input.attempt === undefined
      ? {}
      : {
          attempt: {
            source: input.attempt.source,
            sessionId: input.attempt.sessionId
          }
        })
  });
  return buildReviewEntry({
    ...input,
    ...(opponentReply === undefined ? {} : { opponentReply })
  });
}

function ReviewPanel({
  adaptiveLayout,
  boardBlocksExternalGesture,
  boardSize,
  currentTimeMs,
  deferBackRelevantTransition,
  dueReviewItems,
  explicitReplySideCopy,
  opponentReplySettingsHint,
  filtersExpanded,
  moveFeedbackClient,
  nowMs,
  onAnalysisActiveChange,
  onBoardTouchActiveChange,
  onExitSessionReview,
  onFiltersExpandedChange,
  onPromoteNextFutureReviewsToDue,
  onReviewRecorded,
  onReviewScheduleChanged,
  onSessionAttemptClearUnclear,
  onSessionSourceChange,
  onScheduleTestReviewReminder,
  reviewQueue,
  reviewReminderScheduleStatus,
  service,
  sessionReplayItems,
  stockfish,
  systemBackCommand
}: {
  adaptiveLayout: AdaptiveLayout;
  boardBlocksExternalGesture: React.RefObject<GestureType | undefined>;
  boardSize: number;
  currentTimeMs: () => number;
  deferBackRelevantTransition: DeferBackRelevantTransition;
  dueReviewItems: ReviewQueueItem[];
  explicitReplySideCopy?: boolean;
  opponentReplySettingsHint?: string;
  filtersExpanded: boolean;
  moveFeedbackClient: MoveFeedbackClient | null;
  nowMs: number;
  onAnalysisActiveChange?: (active: boolean) => void;
  onBoardTouchActiveChange?: (active: boolean) => void;
  onExitSessionReview: () => void;
  onFiltersExpandedChange: (expanded: boolean) => void;
  onPromoteNextFutureReviewsToDue?: () => ReviewQueueDuePromotionResult;
  onReviewRecorded: (completedAt: string) => void;
  onReviewScheduleChanged: (clearedAttemptId?: string) => void;
  onSessionAttemptClearUnclear?: (attemptId: string) => AttemptEvent | null;
  onSessionSourceChange?: (source: ReviewEntry["source"] | null) => void;
  onScheduleTestReviewReminder?: () => Promise<ReviewReminderScheduleResult>;
  reviewQueue: ReviewQueueState[];
  reviewReminderScheduleStatus?: string;
  service: PracticeService;
  sessionReplayItems: SessionReplayItem[];
  stockfish: MobileStockfishCapabilities;
  systemBackCommand: ReviewBackCommand | null;
}): React.JSX.Element {
  const styles = useStyles();
  const sessionEntries = sessionReplayItems.map((item): ReviewEntry => buildServiceReviewEntry(service, {
    puzzle: item.puzzle,
    mode: item.attempt.mode,
    ratingKey: item.attempt.ratingKey,
    source: "session",
    attempt: item.attempt
  }));
  const preferredEntries = sessionEntries.length > 0
    ? sessionEntries
    : [];
  const preferredEntriesKey = preferredEntries.map((entry) => (
    `${entry.source}:${entry.puzzle.id}:${entry.mode}:${entry.ratingKey}:${entry.opponentReply?.enabled ?? "none"}:${entry.opponentReply?.seconds ?? "none"}`
  )).join("|");
  const [activeEntries, setActiveEntries] = useState<ReviewEntry[]>(preferredEntries);
  const [activeEntryInitialIndex, setActiveEntryInitialIndex] = useState(0);
  const activeReviewGenerationRef = useRef(0);
  const appliedPreferredEntriesKeyRef = useRef(preferredEntriesKey);
  const [queueFilter, setQueueFilter] = useState<ReviewTodayFilter>("all");
  const [todayReviewsExpanded, setTodayReviewsExpanded] = useState(false);
  const [completedReviewsExpanded, setCompletedReviewsExpanded] = useState(true);
  const [devStatus, setDevStatus] = useState<string | null>(null);
  const reviewToday = useMemo(() => {
    // The service owns mutable local storage; these snapshots invalidate its derived presentation.
    void dueReviewItems;
    void reviewQueue;
    return service.getReviewTodayPresentation(new Date(nowMs).toISOString());
  }, [dueReviewItems, nowMs, reviewQueue, service]);
  const filteredReviewToday = filterReviewTodayPresentation(reviewToday, queueFilter);
  const completedReviews = reviewToday.completedItems.map((entry) => entry.item);
  const completedReviewEntries = completedReviews.map((item): ReviewEntry => buildServiceReviewEntry(service, {
    puzzle: item.puzzle,
    mode: item.attempt.mode,
    ratingKey: item.attempt.ratingKey,
    source: "history",
    attempt: item.attempt
  }));
  const dailyReviewTotal = completedReviews.length + reviewToday.dueItems.length;
  const dailyReviewProgressLabel = dailyReviewTotal === 0
    ? "0"
    : `${completedReviews.length} / ${dailyReviewTotal}`;
  const filteredDueReviewItems = filteredReviewToday.dueItems.map((entry) => entry.item);
  const filteredCompletedReviews = filteredReviewToday.completedItems.map((entry) => entry.item);
  const filteredDueEntries = filteredDueReviewItems.map((item): ReviewEntry => buildServiceReviewEntry(service, {
    puzzle: item.puzzle,
    mode: item.review.mode,
    ratingKey: item.review.ratingKey,
    source: "due"
  }));
  const queueSummary = reviewQueueSummary(reviewQueue, filteredDueReviewItems, nowMs);
  const selectedReviewFilterLabel = reviewQueueFilterLabel(queueFilter);
  const reviewDueSummaryLabel = filteredDueEntries.length > 0
    ? queueSummary.dueStatusLabel
    : reviewToday.dueItems.length === 0
      ? "You're done for today"
      : "No matching scheduled reviews";
  const reviewDueFilterLabel = filteredDueEntries.length > 0
    ? `${selectedReviewFilterLabel} · ${queueSummary.dueStatusLabel}`
    : "No matching scheduled reviews";
  const reviewDueSubline = reviewDueCardSubline(queueSummary.oldestDueLabel);
  const reviewFilterControlActive = filtersExpanded || queueFilter !== "all";
  // Three side-by-side counts break their labels mid-word at large text sizes.
  const forecastStacked = useWindowDimensions().fontScale >= REVIEW_FORECAST_STACK_FONT_SCALE;

  useEffect(() => {
    if (appliedPreferredEntriesKeyRef.current === preferredEntriesKey) {
      return;
    }
    appliedPreferredEntriesKeyRef.current = preferredEntriesKey;
    activeReviewGenerationRef.current += 1;
    setActiveEntryInitialIndex(0);
    setActiveEntries(preferredEntries);
    // preferredEntriesKey is the stable semantic identity for this derived array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredEntriesKey]);

  useEffect(() => {
    onSessionSourceChange?.(activeEntries[0]?.source ?? null);
  }, [activeEntries, onSessionSourceChange]);

  useEffect(() => {
    return () => {
      onSessionSourceChange?.(null);
    };
  }, [onSessionSourceChange]);

  function startReviewEntries(entries: ReviewEntry[]): void {
    activeReviewGenerationRef.current += 1;
    setActiveEntryInitialIndex(0);
    setActiveEntries(entries);
  }

  function openCompletedReview(attemptId: string): void {
    const nextIndex = completedReviewEntries.findIndex((entry) => entry.attempt?.id === attemptId);
    if (nextIndex < 0) {
      return;
    }
    activeReviewGenerationRef.current += 1;
    setActiveEntryInitialIndex(nextIndex);
    setActiveEntries(completedReviewEntries);
  }

  function clearActiveReview(): void {
    setActiveEntryInitialIndex(0);
    setActiveEntries([]);
    onSessionSourceChange?.(null);
  }

  function finishActiveReview(source: ReviewEntry["source"], generation: number): void {
    if (generation !== activeReviewGenerationRef.current) {
      return;
    }
    activeReviewGenerationRef.current += 1;
    clearActiveReview();
    if (source === "session") {
      onExitSessionReview();
    }
  }

  function returnActiveReviewToOwner(source: ReviewEntry["source"]): void {
    activeReviewGenerationRef.current += 1;
    clearActiveReview();
    if (source === "session") {
      onExitSessionReview();
    }
  }

  function clearSessionAttemptUnclear(attemptId: string): void {
    const updatedAttempt = onSessionAttemptClearUnclear?.(attemptId);
    if (!updatedAttempt) {
      return;
    }
    setActiveEntries((entries) => entries.map((entry) => (
      entry.source === "session" && entry.attempt?.id === attemptId
        ? {
            ...entry,
            attempt: withAttemptClarity(entry.attempt, updatedAttempt)
          }
        : entry
    )));
  }

  if (activeEntries.length > 0) {
    const activeReviewGeneration = activeReviewGenerationRef.current;
    return (
      <ReviewSession
        key={`${activeReviewGeneration}:${activeEntryInitialIndex}:${activeEntries.map((entry) => `${entry.source}:${entry.puzzle.id}:${entry.mode}:${entry.ratingKey}`).join("|")}`}
        adaptiveLayout={adaptiveLayout}
        boardBlocksExternalGesture={boardBlocksExternalGesture}
        boardSize={boardSize}
        currentTimeMs={currentTimeMs}
        deferBackRelevantTransition={deferBackRelevantTransition}
        entries={activeEntries}
        explicitReplySideCopy={explicitReplySideCopy}
        opponentReplySettingsHint={opponentReplySettingsHint}
        initialIndex={activeEntryInitialIndex}
        moveFeedbackClient={moveFeedbackClient}
        scheduledReviewCompletedCount={completedReviews.length}
        scheduledReviewTotal={dailyReviewTotal}
        service={service}
        onReviewRecorded={onReviewRecorded}
        onReviewEnrollmentChanged={onReviewScheduleChanged}
        onAttemptClearUnclear={clearSessionAttemptUnclear}
        onAnalysisActiveChange={onAnalysisActiveChange}
        onBoardTouchActiveChange={onBoardTouchActiveChange}
        onComplete={(source) => finishActiveReview(source, activeReviewGeneration)}
        onReturnToOwner={returnActiveReviewToOwner}
        replayControlsOnly
        replayTerminology
        reviewScheduleControlVisible
        stockfish={stockfish}
        systemBackCommand={systemBackCommand}
      />
    );
  }

  const reviewFilterOptions = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.reviewFilterScroller}
      contentContainerStyle={styles.reviewFilterContent}
      testID="review-queue-filters"
    >
      {REVIEW_TODAY_FILTERS.map((filter) => (
        <FilterButton
          key={filter}
          active={queueFilter === filter}
          label={reviewQueueFilterLabel(filter)}
          testID={reviewQuickFilterTestID(filter)}
          onPress={() => setQueueFilter(filter)}
        />
      ))}
    </ScrollView>
  );
  const reviewFilterOptionsRegion = (
    <CollapsibleRegion
      contentTestID="review-filter-options"
      expanded={filtersExpanded}
    >
      {reviewFilterOptions}
    </CollapsibleRegion>
  );
  const reviewFilterSummaryRegion = (
    <CollapsibleRegion
      contentTestID="review-filter-summary"
      expanded={!filtersExpanded}
    >
      <ReviewFilterSummary label={selectedReviewFilterLabel} />
    </CollapsibleRegion>
  );

  return (
    <View style={styles.reviewQueuePanel} testID="review-panel">
      <View style={styles.historyHeaderRow} testID="review-action-header">
        <AppText accessibilityRole="header" style={styles.destinationTitle} variant="largeTitle">Review</AppText>
        <ToolbarIconButton
          accessibilityLabel={`${filtersExpanded ? "Hide" : "Show"} review filters${queueFilter === "all" ? "" : `, ${selectedReviewFilterLabel} selected`}`}
          accessibilityState={{ expanded: filtersExpanded }}
          active={reviewFilterControlActive}
          testID="review-filter-toggle"
          onPress={() => onFiltersExpandedChange(!filtersExpanded)}
        >
          <FilterGlyph active={reviewFilterControlActive} />
        </ToolbarIconButton>
      </View>

      <View
        accessibilityLabel={dailyReviewTotal === 0
          ? `Today, no reviews scheduled, ${queueSummary.tomorrowCount} tomorrow, ${queueSummary.nextSevenDaysCount} in the next 7 days, ${queueSummary.totalCount} total, ${reviewDueFilterLabel}`
          : `Today, ${completedReviews.length} of ${dailyReviewTotal} reviews completed, ${reviewToday.dueItems.length} remaining${queueSummary.overdueCount > 0 ? `, ${queueSummary.overdueCount} overdue` : ""}, ${queueSummary.tomorrowCount} tomorrow, ${queueSummary.nextSevenDaysCount} in the next 7 days, ${queueSummary.totalCount} total, ${reviewDueFilterLabel}`}
        style={styles.reviewDueCard}
        testID="review-due-card"
      >
        <View style={styles.reviewDueCopy}>
          <AppText variant="headline">Today</AppText>
          <AppText testID="review-due-summary" tone="secondary" variant="subheadline">
            {reviewDueSummaryLabel}
          </AppText>
          <AppText
            accessibilityLabel={queueSummary.oldestDueLabel}
            testID="review-next-due"
            tone="secondary"
            variant="footnote"
          >
            {reviewDueSubline}
          </AppText>
        </View>
        <View style={styles.reviewDueCountBlock}>
          <AppText testID="review-due-count" style={styles.reviewDueBigCount} tone="accent" variant="numeralLarge">{dailyReviewProgressLabel}</AppText>
        </View>
      </View>

      <View
        accessibilityLabel={`${reviewCountLabel(queueSummary.tomorrowCount)} tomorrow, ${reviewCountLabel(queueSummary.nextSevenDaysCount)} in the next 7 days, ${reviewCountLabel(queueSummary.totalCount)} total`}
        style={[styles.reviewForecastRow, forecastStacked ? styles.reviewForecastRowStacked : null]}
        testID="review-forecast"
      >
        <ReviewForecastMetric label="Tomorrow" count={queueSummary.tomorrowCount} countTestID="review-tomorrow-count" stacked={forecastStacked} />
        <View style={forecastStacked ? styles.reviewForecastDividerStacked : styles.reviewForecastDivider} />
        <ReviewForecastMetric label="Next 7 days" count={queueSummary.nextSevenDaysCount} countTestID="review-next-seven-days-count" stacked={forecastStacked} />
        <View style={forecastStacked ? styles.reviewForecastDividerStacked : styles.reviewForecastDivider} />
        <ReviewForecastMetric label="Total" count={queueSummary.totalCount} countTestID="review-total-count" stacked={forecastStacked} />
      </View>

      <View style={styles.reviewFilterControlSlot} testID="review-filter-controls">
        {reviewFilterOptionsRegion}
        {reviewFilterSummaryRegion}
      </View>

      <Button
        accessibilityLabel="Start due review"
        disabled={filteredDueEntries.length === 0}
        icon="play"
        label={`Review ${queueSummary.filteredCount}`}
        stretch
        testID="review-start-due"
        onPress={() => startReviewEntries(filteredDueEntries)}
      />

      {onPromoteNextFutureReviewsToDue || onScheduleTestReviewReminder ? (
        <View style={styles.reviewDevControls} testID="review-dev-controls">
          {onPromoteNextFutureReviewsToDue ? (
            <Button
              accessibilityLabel="Make next future review date due today"
              label="Make next due today"
              size="compact"
              stretch
              testID="review-dev-promote-next-due"
              variant="secondary"
              onPress={() => {
                const result = onPromoteNextFutureReviewsToDue();
                setDevStatus(reviewDuePromotionStatus(result));
              }}
            />
          ) : null}
          {onScheduleTestReviewReminder ? (
            <Button
              accessibilityLabel="Schedule a test review notification"
              label="Test notification"
              size="compact"
              stretch
              testID="review-dev-test-notification"
              variant="secondary"
              onPress={() => {
                void onScheduleTestReviewReminder().then((result) => {
                  setDevStatus(result.scheduled ? `Test notification scheduled ${formatLocalCalendarDate(result.scheduledAt ?? "")}` : "No test notification scheduled");
                });
              }}
            />
          ) : null}
          {devStatus ? <AppText testID="review-dev-status" tone="secondary" variant="footnote">{devStatus}</AppText> : null}
          {reviewReminderScheduleStatus ? (
            <Text style={styles.reviewDueHiddenMetric} testID="review-dev-reminder-status">{reviewReminderScheduleStatus}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.reviewItemList} testID="review-due-items">
        <ReviewSectionToggle
          count={filteredReviewToday.dueItems.length}
          expanded={todayReviewsExpanded}
          label="Today to review"
          toggleTestID="review-today-to-review-toggle"
          onPress={() => setTodayReviewsExpanded((expanded) => !expanded)}
        />
        <CollapsibleRegion
          contentTestID="review-today-to-review-items"
          contentStyle={styles.reviewSectionItems}
          expanded={todayReviewsExpanded}
        >
          {filteredReviewToday.dueItems.length > 0 ? filteredReviewToday.dueItems.map((entry, index) => (
            <React.Fragment key={`${entry.item.review.puzzleId}:${entry.item.review.mode}:${entry.item.review.ratingKey}`}>
              {index > 0 ? <View style={styles.groupedSeparator} /> : null}
              <ReviewQueueItemCard
                presentation={entry}
                nowMs={nowMs}
                onPress={() => startReviewEntries([buildServiceReviewEntry(service, {
                  puzzle: entry.item.puzzle,
                  mode: entry.item.review.mode,
                  ratingKey: entry.item.review.ratingKey,
                  source: "due"
                })])}
              />
            </React.Fragment>
          )) : (
            <AppText style={styles.groupedEmpty} testID="review-today-to-review-empty" tone="secondary" variant="subheadline">
              No reviews match this filter.
            </AppText>
          )}
        </CollapsibleRegion>
      </View>

      <View style={styles.reviewItemList} testID="review-today-history">
        <ReviewSectionToggle
          count={filteredCompletedReviews.length}
          expanded={completedReviewsExpanded}
          label="Completed today"
          toggleTestID="review-completed-today-toggle"
          onPress={() => setCompletedReviewsExpanded((expanded) => !expanded)}
        />
        <CollapsibleRegion
          contentTestID="review-today-history-items"
          contentStyle={styles.reviewSectionItems}
          expanded={completedReviewsExpanded}
        >
          {filteredCompletedReviews.length > 0 ? filteredCompletedReviews.map((item, index) => (
            <React.Fragment key={item.attempt.id}>
              {index > 0 ? <View style={styles.groupedSeparator} /> : null}
              <TodayReviewAttemptRow
                item={item}
                onOpen={() => openCompletedReview(item.attempt.id)}
              />
            </React.Fragment>
          )) : (
            <AppText style={styles.groupedEmpty} testID="review-today-history-empty" tone="secondary" variant="subheadline">
              No completed reviews match this filter.
            </AppText>
          )}
        </CollapsibleRegion>
      </View>

    </View>
  );
}

function reviewDuePromotionStatus(result: ReviewQueueDuePromotionResult): string {
  if (result.promotedCount === 0) {
    return "No future reviews to promote";
  }
  const reviewLabel = result.promotedCount === 1 ? "1 review" : `${result.promotedCount} reviews`;
  return `${reviewLabel} from ${result.promotedDate ?? "next due date"} due today`;
}

function reviewDueCardSubline(label: string): string {
  if (label.startsWith("Oldest due ")) {
    return `Oldest: ${label.slice("Oldest due ".length)}`;
  }
  if (label.startsWith("Next review due ")) {
    return `Next: ${label.slice("Next review due ".length)}`;
  }
  if (label.startsWith("Next review appears ")) {
    return "Next: after the first missed puzzle is due";
  }
  return label;
}

function ReviewFilterSummary({ label }: { label: string }): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      accessibilityLabel={`Review filter summary, ${label}`}
      testID="review-active-filter-summary"
    >
      <View style={styles.historyChipContent}>
        <View style={[styles.filterButton, styles.filterButtonActive]} testID="review-active-filter-0">
          <Text style={[styles.filterButtonText, styles.filterButtonTextActive]}>{label}</Text>
        </View>
      </View>
    </View>
  );
}

function reviewTodayActivityLabel(
  history: ReviewTodayHistoryPresentation,
  nowMs: number
): string {
  if (!history.activity.at) {
    return "Scheduled for review";
  }
  const activity = reviewRelativeDayLabel(history.activity.at, nowMs);
  if (history.activity.kind === "last_retry") {
    return `Last retry ${activity}`;
  }
  if (history.activity.kind === "first_missed") {
    return `First missed ${activity}`;
  }
  return `Added to Review ${activity}`;
}

function reviewRelativeDayLabel(value: string, nowMs: number): string {
  const date = new Date(value);
  const now = new Date(nowMs);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(now.getTime())) {
    return formatLocalCalendarDate(value);
  }
  const dateDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = Math.max(0, Math.round((nowDay - dateDay) / (24 * 60 * 60 * 1000)));
  if (daysAgo === 0) {
    return "today";
  }
  if (daysAgo === 1) {
    return "1 day ago";
  }
  return `${daysAgo} days ago`;
}

function ReviewQueueItemCard({
  presentation,
  nowMs,
  onPress
}: {
  presentation: ReviewTodayDueItemPresentation;
  nowMs: number;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const { history, item } = presentation;
  const activityLabel = reviewTodayActivityLabel(history, nowMs);
  const source = reviewItemSourceSprintLabel(item.review);
  const compactSource = source.replace(/^Source sprint: /, "");
  const attemptSummaryLabel = `${reviewAttemptMetricLabel(history.attemptCount, "attempt")} · ${reviewAttemptMetricLabel(history.missCount, "miss")}`;
  const rowTestId = `review-due-item-${item.puzzle.id}-${safeTestId(item.review.mode)}-${safeTestId(item.review.ratingKey)}`;
  const accessibilityLabel = [
    `Start ${modeLabel(item.review.mode)} review`,
    "Scheduled retry",
    activityLabel,
    reviewAttemptMetricLabel(history.attemptCount, "attempt"),
    reviewAttemptMetricLabel(history.missCount, "miss"),
    source
  ].join(", ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={rowTestId}
      style={({ pressed }) => [rowStyle, styles.attemptRow, pressed ? styles.settingsRowPressed : null]}
      onPress={onPress}
    >
      <View testID={`${rowTestId}-badge`}>
        <IconTile name="review" />
      </View>
      <View style={styles.attemptRowCopy}>
        <AppText variant="headline">{modeLabel(item.review.mode)}</AppText>
        <AppText testID={`${rowTestId}-context`} tone="secondary" variant="subheadline">{activityLabel}</AppText>
        <AppText testID={`${rowTestId}-meta`} tone="secondary" variant="footnote">
          {[attemptSummaryLabel, compactSource].filter(Boolean).join(" · ")}
        </AppText>
      </View>
      <View style={styles.attemptRowChevron}>
        <Icon color={appTheme.colors.text.tertiary} name="chevronRight" size={15} testID="chevron-right-glyph" weight="semibold" />
      </View>
    </Pressable>
  );
}

function reviewAttemptMetricLabel(count: number, singular: "attempt" | "miss"): string {
  const plural = singular === "attempt" ? "attempts" : "misses";
  return `${count} ${count === 1 ? singular : plural}`;
}

function ReviewSectionToggle({
  count,
  expanded,
  label,
  toggleTestID,
  onPress
}: {
  count: number;
  expanded: boolean;
  label: string;
  toggleTestID: string;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${label}, ${reviewCountLabel(count)}`}
      accessibilityState={{ expanded }}
      testID={toggleTestID}
      style={styles.reviewSectionToggle}
      onPress={onPress}
    >
      <AppText style={styles.reviewSectionTitle} variant="title">{label}</AppText>
      <View style={styles.reviewSectionToggleMeta} testID={`${toggleTestID}-meta`}>
        <AppText style={styles.reviewSectionCount} testID={`${toggleTestID}-count`} tone="secondary" variant="body">{count}</AppText>
        <View style={styles.reviewSectionToggleChevron} testID={`${toggleTestID}-chevron`}>
          <DisclosureChevron
            expanded={expanded}
            testID={`${toggleTestID}-animated-chevron`}
          />
        </View>
      </View>
    </Pressable>
  );
}

function TodayReviewAttemptRow({
  item,
  onOpen
}: {
  item: CompletedReviewItem;
  onOpen: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const isWrong = item.attempt.result === "wrong";
  const resultLabel = isWrong ? "Wrong" : "Correct";
  const elapsedSeconds = Math.max(
    0,
    Math.round((new Date(item.attempt.completedAt).getTime() - new Date(item.attempt.startedAt).getTime()) / 1000)
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${modeLabel(item.attempt.mode)} ${resultLabel.toLowerCase()} review for analysis or retry`}
      testID={`review-today-attempt-${item.attempt.id}`}
      style={({ pressed }) => [rowStyle, styles.attemptRow, pressed ? styles.settingsRowPressed : null]}
      onPress={onOpen}
    >
      <AttemptStatusTile
        testID={`review-today-attempt-${item.attempt.id}-badge`}
        tone={isWrong ? "wrong" : "correct"}
      />
      <View style={styles.attemptRowCopy}>
        <View style={styles.historyAttemptHeader}>
          <AppText variant="headline">{modeLabel(item.attempt.mode)}</AppText>
          <AppText
            testID={`review-today-attempt-${item.attempt.id}-result`}
            tone={isWrong ? "negative" : "positive"}
            variant="subheadline"
          >
            {resultLabel}
          </AppText>
        </View>
        <AppText tone="secondary" variant="footnote">Puzzle {item.puzzle.id} · {elapsedSeconds}s</AppText>
        <AppText tone="secondary" variant="footnote">{formatLocalCalendarDate(item.attempt.completedAt)} · Review or retry</AppText>
      </View>
      <View style={styles.attemptRowChevron}>
        <Icon color={appTheme.colors.text.tertiary} name="chevronRight" size={15} testID="chevron-right-glyph" weight="semibold" />
      </View>
    </Pressable>
  );
}

const REVIEW_FORECAST_STACK_FONT_SCALE = 1.5;
// Session HUD at accessibility text sizes (#652): reflow at this scale, and
// let HUD values grow at most this much before they shrink to fit.
const HUD_LARGE_TEXT_FONT_SCALE = 1.5;
const HUD_MAX_TEXT_SCALE = PRACTICE_SESSION_HUD_MAX_TEXT_SCALE;
// The puzzle timing under the board grows at most this much, and board
// coordinates do not scale.
const PUZZLE_TIMING_MAX_TEXT_SCALE = PRACTICE_PUZZLE_TIMING_MAX_TEXT_SCALE;
// A phone's locked session stacks the prompt and the post-answer feedback row
// with the board, and the layout reserves their height before sizing the board
// (adaptivePracticeLayout.ts), so their copy grows less than other chrome.
const PROMPT_MAX_TEXT_SCALE = PRACTICE_PROMPT_MAX_TEXT_SCALE;
const FEEDBACK_MAX_TEXT_SCALE = PRACTICE_FEEDBACK_MAX_TEXT_SCALE;
// The uppercase score labels share a board-width strip with three columns;
// they stay at their designed size so all three read at one size, and the
// values grow only as far as the strip's slot allows.
const SCORE_LABEL_MAX_TEXT_SCALE = 1;
const SCORE_VALUE_MAX_TEXT_SCALE = 1.15;

function ReviewForecastMetric({
  count,
  label,
  countTestID,
  stacked = false
}: {
  count: number;
  label: string;
  countTestID: string;
  stacked?: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  if (stacked) {
    return (
      <View style={styles.reviewForecastMetricStacked}>
        <AppText style={styles.reviewForecastLabelStacked} tone="secondary" variant="body">{label}</AppText>
        <AppText testID={countTestID} variant="numeral">{count}</AppText>
      </View>
    );
  }
  return (
    <View style={styles.reviewForecastMetric}>
      <AppText testID={countTestID} variant="numeral">{count}</AppText>
      <AppText tone="secondary" variant="caption">{label}</AppText>
    </View>
  );
}

function reviewCountLabel(count: number): string {
  return `${count} ${count === 1 ? "review" : "reviews"}`;
}

function ReviewSession({
  adaptiveLayout,
  boardBlocksExternalGesture,
  boardSize,
  currentTimeMs,
  deferBackRelevantTransition,
  entries,
  explicitReplySideCopy = false,
  opponentReplySettingsHint,
  initialIndex = 0,
  moveFeedbackClient,
  onAnalysisActiveChange,
  onAttemptClearUnclear,
  onBoardTouchActiveChange,
  onComplete,
  onReviewEnrollmentChanged,
  onReturnToOwner,
  replayControlsOnly = false,
  replayTerminology = false,
  reviewScheduleControlVisible = false,
  scheduledReviewCompletedCount = 0,
  scheduledReviewTotal = entries.length,
  service,
  onReviewRecorded,
  stockfish,
  systemBackCommand,
}: {
  adaptiveLayout: AdaptiveLayout;
  boardBlocksExternalGesture: React.RefObject<GestureType | undefined>;
  boardSize: number;
  currentTimeMs: () => number;
  deferBackRelevantTransition: DeferBackRelevantTransition;
  entries: ReviewEntry[];
  explicitReplySideCopy?: boolean;
  opponentReplySettingsHint?: string;
  initialIndex?: number;
  moveFeedbackClient: MoveFeedbackClient | null;
  onAnalysisActiveChange?: (active: boolean) => void;
  onAttemptClearUnclear?: (attemptId: string) => void;
  onBoardTouchActiveChange?: (active: boolean) => void;
  onComplete: (source: ReviewEntry["source"]) => void;
  onReviewEnrollmentChanged?: (clearedAttemptId?: string) => void;
  onReturnToOwner: (source: ReviewEntry["source"]) => void;
  replayControlsOnly?: boolean;
  replayTerminology?: boolean;
  reviewScheduleControlVisible?: boolean;
  scheduledReviewCompletedCount?: number;
  scheduledReviewTotal?: number;
  service: PracticeService;
  onReviewRecorded?: (completedAt: string) => void;
  stockfish: MobileStockfishCapabilities;
  systemBackCommand: ReviewBackCommand | null;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const boardRef = useRef<ChessboardRef | null>(null);
  const reviewSuppressedBoardMovesRef = useRef<string[]>([]);
  const reviewResultRecordedRef = useRef(false);
  const handledBackCommandIdRef = useRef(systemBackCommand?.id ?? 0);
  const [entryIndex, setEntryIndex] = useState(initialIndex);
  const [reviewState, setReviewState] = useState<ReviewPuzzleState>(() => startReviewPuzzle(entries[initialIndex] ?? entries[0]));
  const [feedback, setFeedback] = useState<SessionFeedback>(null);
  const [lastMove, setLastMove] = useState<BoardMove | null>(null);
  const [boardLocked, setBoardLocked] = useState(false);
  const [wrongSeen, setWrongSeen] = useState(false);
  const [analysisEnabled, setAnalysisEnabled] = useState(false);
  const [analysisFen, setAnalysisFen] = useState<string | null>(null);
  const [engineAnalysisLines, setEngineAnalysisLines] = useState<EngineAnalysisLine[]>([]);
  const [analysisEngineStatus, setAnalysisEngineStatus] = useState<AnalysisEngineStatus>("idle");
  const [analysisIsRunning, setAnalysisIsRunning] = useState(false);
  const [analysisRetryCount, setAnalysisRetryCount] = useState(0);
  const [analysisBackStack, setAnalysisBackStack] = useState<string[]>([]);
  const [analysisForwardStack, setAnalysisForwardStack] = useState<string[]>([]);
  const [manualBoardFlip, setManualBoardFlip] = useState(false);
  const [reviewResultRecorded, setReviewResultRecorded] = useState(false);
  const [reviewStartedAtMs, setReviewStartedAtMs] = useState(() => currentTimeMs());
  const [reviewNowMs, setReviewNowMs] = useState(() => currentTimeMs());
  const [reviewTimedOut, setReviewTimedOut] = useState(false);
  const [reviewReplyPromptPhase, setReviewReplyPromptPhase] = useState<ArrowDuelReplyChallengePhase>("choice");
  const [reviewReplyStartedAtMs, setReviewReplyStartedAtMs] = useState<number | null>(null);
  const [reviewWhatIfVisible, setReviewWhatIfVisible] = useState(false);
  const [scheduledReviewProgress] = useState(() => {
    const firstEntry = entries[initialIndex] ?? entries[0];
    return firstEntry?.source === "due"
      ? {
          completedBeforeStart: scheduledReviewCompletedCount,
          total: Math.max(1, scheduledReviewTotal)
        }
      : null;
  });

  useEffect(() => {
    onAnalysisActiveChange?.(analysisEnabled);
  }, [analysisEnabled, onAnalysisActiveChange]);

  useEffect(() => {
    return () => onAnalysisActiveChange?.(false);
  }, [onAnalysisActiveChange]);

  useEffect(() => {
    return () => onBoardTouchActiveChange?.(false);
  }, [onBoardTouchActiveChange]);

  function playReviewMoveFeedback(
    actor: MoveFeedbackActor,
    move: string,
    preMoveFen: string
  ): void {
    if (!moveFeedbackClient) {
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
      // Feedback is nonessential and must never interrupt review progress.
    });
  }

  useEffect(() => {
    if (!systemBackCommand || handledBackCommandIdRef.current === systemBackCommand.id) {
      return;
    }
    handledBackCommandIdRef.current = systemBackCommand.id;
    if (systemBackCommand.kind === "close-analysis") {
      closeAnalysis();
      return;
    }
    onReturnToOwner(currentEntry.source);
    // closeAnalysis and onReturnToOwner are render-local commands intentionally selected
    // by the shell's typed Back resolver for this exact command id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemBackCommand?.id]);
  const currentEntry = entries[entryIndex];
  const isReplay = replayTerminology && currentEntry.source !== "due";
  const reviewOpponentReply = currentEntry.mode === "arrow_duel"
    ? currentEntry.opponentReply
    : undefined;
  const reviewReplyChallengeEnabled = reviewOpponentReply?.enabled === true;
  const hasNextScheduledReview = entryIndex + 1 < entries.length;
  const currentPuzzle = currentReviewPuzzleState(reviewState);
  const currentFen = currentPuzzle.currentFen;
  const reviewEntryPreview = usePuzzleEntryPreview({
    boardRef,
    currentPuzzle: analysisEnabled ? undefined : currentPuzzle,
    entryKey: analysisEnabled
      ? null
      : `${currentEntry.source}:${entryIndex}:${currentEntry.puzzle.id}`,
    onCommittedMove: (move, preMoveFen) => {
      playReviewMoveFeedback("opponent", move, preMoveFen);
    },
    onLastMove: setLastMove,
    suppressedMovesRef: reviewSuppressedBoardMovesRef
  });
  const displayFen = analysisEnabled
    ? (analysisFen ?? currentFen)
    : (reviewEntryPreview.displayFen ?? currentFen);
  const reviewPerspectiveSide = sideToMove(reviewStartingFen(currentEntry));
  const reviewPromptSide = currentEntry.mode === "arrow_duel"
    && reviewReplyChallengeEnabled
    && currentPuzzle.kind === "arrow_duel"
    && reviewReplyPromptPhase === "reply"
    ? oppositeMoveSide(sideToMove(currentEntry.puzzle.initialFen))
    : currentEntry.mode === "arrow_duel"
      && isReplay
      && reviewState.kind === "line"
      && reviewState.arrowDuelLineKind === "reply"
      ? feedback?.puzzleSolved
        ? oppositeMoveSide(sideToMove(currentFen))
        : sideToMove(currentFen)
      : reviewPerspectiveSide;
  const baseBoardFlipped = reviewPerspectiveSide === "b";
  const boardFlipped = manualBoardFlip ? !baseBoardFlipped : baseBoardFlipped;
  const feedbackMove = feedback?.submittedMove && feedback.submittedMove !== "__illegal__" ? arrowFromTo(feedback.submittedMove) : null;
  const reviewBoardSquareTints = useBoardMoveSquareTints(
    feedbackMove ?? (feedback ? null : lastMove),
    feedbackMove
      ? moveFeedbackTint(appTheme, feedback?.result ?? "wrong")
      : appTheme.colors.board.lastMoveSquare
  );
  const isArrowDuelPunishmentLine = currentEntry.mode === "arrow_duel"
    && (
      reviewState.kind === "line"
        ? reviewState.arrowDuelLineKind === "punishment"
        : reviewState.duel.phase === "choice"
          && currentEntry.source !== "due"
          && feedback?.result === "wrong"
    );
  const shouldShowGuidedCurrentEval = !analysisEnabled
    && currentEntry.mode === "arrow_duel"
    && reviewState.kind === "line"
    && isArrowDuelPunishmentLine;
  const shouldRunGuidedCurrentEval = shouldShowGuidedCurrentEval && !isTerminalPosition(currentFen);
  const stockfishTargetFen = analysisEnabled
    ? displayFen
    : shouldRunGuidedCurrentEval
      ? currentFen
      : null;
  const analysisLines = analysisEnabled
      ? buildPuzzleGuidedAnalysisLines({
        fen: displayFen,
        puzzle: currentEntry.puzzle,
        currentPuzzle,
        engineLines: engineAnalysisLines,
        includeUnscoredLegalMoves: false
      })
    : [];
  const guidedEvalLines =
    shouldShowGuidedCurrentEval
      ? [formatGuidedCurrentEvalLine(
          buildCurrentPositionEvaluationLine({
            fen: currentFen,
            engineLines: shouldRunGuidedCurrentEval ? engineAnalysisLines : []
          }),
          shouldRunGuidedCurrentEval,
          analysisEngineStatus
        )]
      : [];
  const analysisBlunderMove =
    analysisEnabled && reviewState.kind === "arrow_duel" && displayFen === currentEntry.puzzle.initialFen
      ? reviewState.duel.wrongMove
      : undefined;
  const guidedReviewMove =
    !analysisEnabled
      && !feedback
      && currentEntry.mode === "arrow_duel"
      && reviewState.kind === "line"
      && isArrowDuelPunishmentLine
      ? currentExpectedMove(reviewState.line)
      : undefined;
  const isArrowDuelFollowUpReview = isArrowDuelPunishmentLine;
  const reviewBoardLocked = boardLocked || reviewEntryPreview.locked;
  const boardGestureEnabled = !reviewBoardLocked;
  const boardDraggableColor = boardGestureEnabled ? sideToMove(displayFen) : null;
  const reviewSideToMove = sideToMove(displayFen);
  const canNavigateReview = (currentEntry.source === "session" || currentEntry.source === "history") && !boardLocked;
  const canReviewPrevious = canNavigateReview && entryIndex > 0;
  const canReviewNext = canNavigateReview && entryIndex < entries.length - 1;
  const canAnalysisBack = analysisEnabled && analysisBackStack.length > 0;
  const canAnalysisForward = analysisEnabled && analysisForwardStack.length > 0;
  const analysisDepth = engineAnalysisLines.reduce((maxDepth, line) => Math.max(maxDepth, line.depth), 0);
  const reviewProgressPosition = scheduledReviewProgress
    ? Math.min(scheduledReviewProgress.total, scheduledReviewProgress.completedBeforeStart + entryIndex + 1)
    : entryIndex + 1;
  const reviewProgressTotal = scheduledReviewProgress?.total ?? entries.length;
  const reviewPerPuzzleSeconds = perPuzzleSecondsForReviewEntry(currentEntry);
  const reviewCuratedThemes = currentEntry.curatedThemes;
  const reviewReplySeconds = reviewOpponentReply?.seconds ?? DEFAULT_OPPONENT_REPLY_SECONDS;
  const reviewReplyPromptActive = reviewReplyChallengeEnabled
    && reviewReplyPromptPhase === "reply";
  const reviewReplyRemainingSeconds = reviewReplyPromptActive
    ? reviewReplyStartedAtMs === null
      ? reviewReplySeconds
      : Math.max(0, reviewReplySeconds - Math.floor((reviewNowMs - reviewReplyStartedAtMs) / 1000))
    : null;
  const reviewRemainingSeconds =
    currentEntry.source === "due"
      ? reviewReplyRemainingSeconds
        ?? Math.max(0, reviewPerPuzzleSeconds - Math.floor((reviewNowMs - reviewStartedAtMs) / 1000))
      : null;
  const reviewWhatIfDetail = explicitReplySideCopy
    ? replyPreparationInstruction(reviewReplySeconds)
    : `Find the opponent’s reply in ${reviewReplySeconds} ${
        reviewReplySeconds === 1 ? "second" : "seconds"
      }.`;
  const analysisEngineLabel =
    analysisEngineStatus === "stockfish"
      ? `SF 18 NNUE${analysisDepth > 0 ? ` · Depth ${analysisDepth}${analysisIsRunning ? `/${ANALYSIS_DEPTH}` : ""}` : ""}`
      : analysisEngineStatus === "thinking"
        ? "Analyzing..."
        : analysisEngineStatus === "fallback" || analysisEngineStatus === "error"
          ? "Local hint"
          : "";

  useEffect(() => {
    if (!stockfishTargetFen) {
      setEngineAnalysisLines([]);
      setAnalysisEngineStatus("idle");
      setAnalysisIsRunning(false);
      return;
    }

    const transport = stockfish.createTransport();
    if (!transport) {
      setEngineAnalysisLines([]);
      setAnalysisEngineStatus("fallback");
      setAnalysisIsRunning(false);
      return;
    }

    let cancelled = false;
    const analysisController = new AbortController();
    setEngineAnalysisLines([]);
    setAnalysisEngineStatus("thinking");
    setAnalysisIsRunning(true);
    void stockfish.prewarm().then((prewarmed) => analyzeFenWithUciEngine(transport, stockfishTargetFen, {
      depth: ANALYSIS_DEPTH,
      multiPv: 3,
      initialize: !prewarmed,
      newGame: !prewarmed,
      signal: analysisController.signal,
      onUpdate: (lines) => {
        if (!cancelled) {
          setEngineAnalysisLines(lines);
          setAnalysisEngineStatus(lines.length > 0 ? "stockfish" : "thinking");
          setAnalysisIsRunning(true);
        }
      }
    })).then(
      (lines) => {
        if (!cancelled) {
          setEngineAnalysisLines(lines);
          setAnalysisEngineStatus(lines.length > 0 ? "stockfish" : "fallback");
          setAnalysisIsRunning(false);
        }
      },
      () => {
        if (!cancelled) {
          setEngineAnalysisLines([]);
          setAnalysisEngineStatus("error");
          setAnalysisIsRunning(false);
        }
      }
    );

    return () => {
      cancelled = true;
      analysisController.abort();
    };
  }, [analysisEnabled, analysisRetryCount, stockfish, stockfishTargetFen]);

  useEffect(() => {
    if (currentEntry.source !== "due" || reviewResultRecorded) {
      return;
    }
    const timer = setInterval(() => {
      setReviewNowMs(currentTimeMs());
    }, 500);
    return () => {
      clearInterval(timer);
    };
  }, [currentEntry.source, currentTimeMs, entryIndex, reviewResultRecorded]);

  useEffect(() => {
    if (currentEntry.source !== "due" || reviewResultRecorded || reviewTimedOut || reviewRemainingSeconds !== 0) {
      return;
    }
    setReviewTimedOut(true);
    setWrongSeen(true);
    setBoardLocked(true);
    recordCurrentReviewResult("wrong", {
      submittedMove: "__timeout__",
      expectedMove: expectedReviewMove(currentPuzzle)
    });
    // The timer state is the trigger; the render-local recorder must not restart the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEntry.source, currentPuzzle, reviewRemainingSeconds, reviewResultRecorded, reviewTimedOut]);

  useEffect(() => {
    if (!reviewTimedOut) {
      return;
    }
    const timer = setTimeout(() => {
      if (!hasNextScheduledReview) {
        finishReviewSession();
        return;
      }
      goToNextDueReview();
    }, FEEDBACK_SNAPSHOT_MS);
    return () => {
      clearTimeout(timer);
    };
    // Timeout feedback owns one stable snapshot before the Review advances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryIndex, hasNextScheduledReview, reviewTimedOut]);

  function resetCurrentReview(nextIndex = entryIndex): void {
    const nextState = startReviewPuzzle(entries[nextIndex]);
    setEntryIndex(nextIndex);
    setReviewState(nextState);
    setFeedback(null);
    setLastMove(null);
    setBoardLocked(false);
    setWrongSeen(false);
    setAnalysisEnabled(false);
    setAnalysisFen(null);
    setEngineAnalysisLines([]);
    setAnalysisEngineStatus("idle");
    setAnalysisIsRunning(false);
    setAnalysisBackStack([]);
    setAnalysisForwardStack([]);
    setManualBoardFlip(false);
    setReviewResultRecorded(false);
    const now = currentTimeMs();
    setReviewStartedAtMs(now);
    setReviewNowMs(now);
    setReviewTimedOut(false);
    setReviewReplyPromptPhase("choice");
    setReviewReplyStartedAtMs(null);
    setReviewWhatIfVisible(false);
    reviewResultRecordedRef.current = false;
    reviewSuppressedBoardMovesRef.current = [];
  }

  function advanceReview(result: "correct" | "wrong", reviewMove?: { submittedMove: string; expectedMove: string }): void {
    recordCurrentReviewResult(result, reviewMove);
    if (currentEntry.source !== "due") {
      setBoardLocked(false);
      return;
    }
    goToNextDueReview();
  }

  function goToNextDueReview(): void {
    const nextIndex = entryIndex + 1;
    if (nextIndex >= entries.length) {
      finishReviewSession();
      return;
    }
    resetCurrentReview(nextIndex);
  }

  function finishReviewSession(): void {
    const complete = () => onComplete(currentEntry.source);
    if (!deferBackRelevantTransition("review-session-exit", complete)) {
      complete();
    }
  }

  function recordCurrentReviewResult(result: "correct" | "wrong", reviewMove?: { submittedMove: string; expectedMove: string }): void {
    if (currentEntry.source !== "due") {
      return;
    }
    if (reviewResultRecordedRef.current || reviewResultRecorded) {
      return;
    }
    const completedAt = new Date(currentTimeMs()).toISOString();
    service.recordReviewAttempt({
      puzzleId: currentEntry.puzzle.id,
      mode: currentEntry.mode,
      ratingKey: currentEntry.ratingKey,
      result,
      submittedMove: reviewMove?.submittedMove ?? "__analysis__",
      expectedMove: reviewMove?.expectedMove ?? expectedReviewMove(currentPuzzle),
      startedAt: new Date(reviewStartedAtMs).toISOString(),
      ...(currentPuzzle.kind === "arrow_duel" ? { arrowDuelCandidateOrder: [...currentPuzzle.candidates] } : {})
    }, completedAt);
    reviewResultRecordedRef.current = true;
    onReviewRecorded?.(completedAt);
    setReviewResultRecorded(true);
  }

  function navigateReview(nextIndex: number): void {
    if (!canNavigateReview || nextIndex < 0 || nextIndex >= entries.length) {
      return;
    }
    resetCurrentReview(nextIndex);
  }

  function resetReviewPuzzle(): void {
    if (reviewBoardLocked) {
      return;
    }
    const startingFen = reviewStartingFen(currentEntry);
    resetCurrentReview(entryIndex);
    boardRef.current?.resetBoard(startingFen);
    reviewEntryPreview.replay();
  }

  async function onReviewBoardMove(result: MoveResult): Promise<void> {
    const move = formatUci(result.move);
    if (consumeSuppressedBoardMove(move, reviewSuppressedBoardMovesRef.current)) {
      return;
    }

    if (analysisEnabled) {
      onAnalysisBoardMove(move, result);
      return;
    }

    if (reviewBoardLocked) {
      boardRef.current?.resetBoard(currentFen);
      return;
    }
    const submittedFen = currentFen;
    const submittedMoveFen = fenAfterMove(submittedFen, move);
    if (!submittedMoveFen) {
      boardRef.current?.resetBoard(submittedFen);
      return;
    }
    if (!moveResultMatchesExpectedFen(result, submittedMoveFen)) {
      boardRef.current?.resetBoard(submittedMoveFen);
    }

    if (reviewState.kind === "arrow_duel") {
      await submitReviewArrowMove(move, submittedFen);
      return;
    }
    if (currentEntry.mode === "arrow_duel" && reviewState.kind === "line") {
      await submitReviewArrowFollowUpMove(move, submittedFen);
      return;
    }
    await submitReviewLineMove(move, submittedFen);
  }

  async function submitReviewLineMove(move: string, submittedFen: string): Promise<void> {
    setBoardLocked(true);
    try {
      const result = submitLineMove(reviewState.kind === "line" ? reviewState.line : beginLinePuzzle(currentEntry.puzzle), move);
      if (result.feedback.result === "wrong" || result.feedback.puzzleSolved) {
        recordCurrentReviewResult(
          result.feedback.result === "wrong" || wrongSeen ? "wrong" : "correct",
          {
            submittedMove: result.feedback.submittedMove,
            expectedMove: result.feedback.expectedMove
          }
        );
      }
      playReviewMoveFeedback("user", move, submittedFen);
      setFeedback(result.feedback);
      if (result.feedback.result === "wrong") {
        setWrongSeen(true);
        await sleep(FEEDBACK_SNAPSHOT_MS);
        boardRef.current?.resetBoard(submittedFen);
        setFeedback(null);
        if (currentEntry.source === "due") {
          goToNextDueReview();
          return;
        }
        setBoardLocked(false);
        return;
      }

      if (result.feedback.autoPlayedMoves.length > 0) {
        await sleep(USER_FEEDBACK_BEFORE_AUTO_MS);
        setFeedback(null);
        await animateReviewBoardMoves(result.feedback.autoPlayedMoves, result.state.currentFen);
      }
      setReviewState({ kind: "line", line: result.state });
      if (result.feedback.puzzleSolved) {
        setFeedback(result.feedback);
        await sleep(FEEDBACK_SNAPSHOT_MS);
        advanceReview(wrongSeen ? "wrong" : "correct", {
          submittedMove: result.feedback.submittedMove,
          expectedMove: result.feedback.expectedMove
        });
        return;
      }
      setBoardLocked(false);
    } catch {
      boardRef.current?.resetBoard(submittedFen);
      setBoardLocked(false);
    }
  }

  function applyAnalysisMove(move: string, result?: MoveResult): void {
    const baseFen = analysisFen ?? currentFen;
    const nextFen = fenAfterMove(baseFen, move);
    if (!nextFen) {
      boardRef.current?.resetBoard(baseFen);
      return;
    }
    if (result && !moveResultMatchesExpectedFen(result, nextFen)) {
      boardRef.current?.resetBoard(nextFen);
    }
    setAnalysisBackStack((stack) => [...stack, baseFen]);
    setAnalysisForwardStack([]);
    setAnalysisFen(nextFen);
    setEngineAnalysisLines([]);
    setAnalysisEngineStatus("thinking");
    setLastMove(arrowFromTo(move));
  }

  function onAnalysisBoardMove(move: string, result: MoveResult): void {
    applyAnalysisMove(move, result);
  }

  async function playAnalysisCandidateMove(move: string): Promise<void> {
    if (!analysisEnabled || boardLocked) {
      return;
    }
    const parsed = arrowFromTo(move);
    if (!parsed) {
      return;
    }
    const baseFen = analysisFen ?? currentFen;
    if (!fenAfterMove(baseFen, move)) {
      return;
    }

    if (boardRef.current) {
      const suppressedMove = boardMoveToUci(parsed);
      reviewSuppressedBoardMovesRef.current.push(suppressedMove);
      const playedMove = await boardRef.current.move({
        from: parsed.from as Square,
        to: parsed.to as Square,
        ...(parsed.promotion ? { promotion: parsed.promotion as PieceSymbol } : {})
      });
      if (!playedMove) {
        consumeSuppressedBoardMove(suppressedMove, reviewSuppressedBoardMovesRef.current);
      }
    }

    applyAnalysisMove(move);
  }

  async function submitReviewArrowMove(move: string, submittedFen: string): Promise<void> {
    if (reviewState.kind !== "arrow_duel") {
      boardRef.current?.resetBoard(submittedFen);
      return;
    }
    if (reviewState.duel.phase === "reply") {
      await submitReviewArrowReplyMove(move, submittedFen);
      return;
    }
    if (!isArrowDuelCandidate(reviewState.duel.candidates, move)) {
      boardRef.current?.resetBoard(submittedFen);
      return;
    }
    setBoardLocked(true);
    try {
      const result = submitArrowDuelChoice(reviewState.duel, move, {
        opponentReply: reviewReplyChallengeEnabled
      });
      playReviewMoveFeedback("user", move, submittedFen);
      setFeedback(result.feedback);
      if (result.feedback.result === "correct") {
        if (reviewReplyChallengeEnabled && result.state.phase === "reply_handoff") {
          await stageReviewArrowReplyHandoff(result.state, result.feedback, move, submittedFen);
          return;
        }
        recordCurrentReviewResult("correct", {
          submittedMove: result.feedback.submittedMove,
          expectedMove: result.feedback.expectedMove
        });
        await sleep(FEEDBACK_SNAPSHOT_MS);
        advanceReview("correct", {
          submittedMove: result.feedback.submittedMove,
          expectedMove: result.feedback.expectedMove
        });
        return;
      }

      setWrongSeen(true);
      recordCurrentReviewResult("wrong", {
        submittedMove: result.feedback.submittedMove,
        expectedMove: result.feedback.expectedMove
      });
      await sleep(FEEDBACK_SNAPSHOT_MS);
      if (currentEntry.source === "due") {
        goToNextDueReview();
        return;
      }
      const replyMoves = result.feedback.autoPlayedMoves.slice(1);
      const finalFen = fenAfterMoves(submittedFen, result.feedback.autoPlayedMoves) ?? submittedFen;
      if (replyMoves.length > 0) {
        await animateReviewBoardMoves(replyMoves, finalFen);
        await sleep(FEEDBACK_SNAPSHOT_MS);
      }
      setReviewState({
        kind: "line",
        line: lineStateAfterMoves(currentEntry.puzzle, result.feedback.autoPlayedMoves),
        arrowDuelLineKind: "punishment"
      });
      setFeedback(null);
      setBoardLocked(false);
    } catch {
      boardRef.current?.resetBoard(submittedFen);
      setBoardLocked(false);
    }
  }

  async function stageReviewArrowReplyHandoff(
    handoffState: ArrowDuelState,
    handoffFeedback: PuzzleFeedback,
    submittedMove: string,
    submittedFen: string
  ): Promise<void> {
    await sleep(ARROW_DUEL_CORRECT_CHOICE_FEEDBACK_MS);
    setFeedback(null);
    setReviewWhatIfVisible(true);
    setReviewReplyPromptPhase("reply");
    try {
      const submittedChoice = arrowFromTo(submittedMove);
      boardRef.current?.resetBoard(
        submittedFen,
        submittedChoice
          ? {
              lastMove: null,
              slide: {
                durationMs: ARROW_DUEL_UNDO_ANIMATION_MS,
                from: submittedChoice.to as Square,
                to: submittedChoice.from as Square
              }
            }
          : undefined
      );
      setLastMove(null);
      await sleep(ARROW_DUEL_REPLY_PREPARATION_MS);
      await animateReviewBoardMoves(handoffFeedback.autoPlayedMoves, handoffState.currentFen);
      const replyStartedAt = currentTimeMs();
      setReviewState({
        kind: "arrow_duel",
        duel: { ...handoffState, phase: "reply" }
      });
      setReviewReplyStartedAtMs(replyStartedAt);
      setReviewNowMs(replyStartedAt);
      setBoardLocked(false);
    } finally {
      setReviewWhatIfVisible(false);
    }
  }

  async function submitReviewArrowReplyMove(move: string, submittedFen: string): Promise<void> {
    if (reviewState.kind !== "arrow_duel" || reviewState.duel.phase !== "reply") {
      boardRef.current?.resetBoard(submittedFen);
      return;
    }
    setBoardLocked(true);
    try {
      const result = submitArrowDuelReply(reviewState.duel, move);
      playReviewMoveFeedback("user", move, submittedFen);
      if (result.feedback.result === "wrong") {
        setWrongSeen(true);
        setFeedback(result.feedback);
        recordCurrentReviewResult("wrong", {
          submittedMove: result.feedback.submittedMove,
          expectedMove: result.feedback.expectedMove
        });
        await sleep(FEEDBACK_SNAPSHOT_MS);
        if (currentEntry.source === "due") {
          goToNextDueReview();
          return;
        }
        boardRef.current?.resetBoard(submittedFen);
        setFeedback(null);
        setBoardLocked(false);
        return;
      }

      if (currentEntry.source === "due") {
        setFeedback(result.feedback);
        recordCurrentReviewResult("correct", {
          submittedMove: result.feedback.submittedMove,
          expectedMove: result.feedback.expectedMove
        });
        await sleep(FEEDBACK_SNAPSHOT_MS);
        advanceReview("correct", {
          submittedMove: result.feedback.submittedMove,
          expectedMove: result.feedback.expectedMove
        });
        return;
      }

      const continuation = continueArrowDuelReplyLine(currentEntry.puzzle, move);
      const replyEndsBeforeAutoPlay = continuation.feedback.puzzleSolved
        && continuation.feedback.autoPlayedMoves.length === 0;
      setFeedback({
        ...result.feedback,
        puzzleSolved: replyEndsBeforeAutoPlay
      });
      await sleep(FEEDBACK_SNAPSHOT_MS);
      if (replyEndsBeforeAutoPlay) {
        advanceReview("correct", {
          submittedMove: result.feedback.submittedMove,
          expectedMove: result.feedback.expectedMove
        });
        return;
      }

      if (continuation.feedback.autoPlayedMoves.length > 0) {
        setFeedback(null);
        await animateReviewBoardMoves(
          continuation.feedback.autoPlayedMoves,
          continuation.state.currentFen
        );
      }
      setReviewState({
        kind: "line",
        line: continuation.state,
        arrowDuelLineKind: "reply"
      });
      if (continuation.feedback.puzzleSolved) {
        setFeedback({
          ...result.feedback,
          autoPlayedMoves: [],
          currentFen: continuation.state.currentFen,
          puzzleSolved: true
        });
        await sleep(FEEDBACK_SNAPSHOT_MS);
        advanceReview("correct", {
          submittedMove: result.feedback.submittedMove,
          expectedMove: result.feedback.expectedMove
        });
        return;
      }
      setFeedback(null);
      setBoardLocked(false);
    } catch {
      boardRef.current?.resetBoard(submittedFen);
      setBoardLocked(false);
    }
  }

  async function submitReviewArrowFollowUpMove(move: string, submittedFen: string): Promise<void> {
    if (reviewState.kind !== "line") {
      boardRef.current?.resetBoard(submittedFen);
      return;
    }
    setBoardLocked(true);
    try {
      const result = submitArrowDuelFollowUpMove(reviewState.line, move);
      if (result.feedback.result === "wrong" || result.feedback.puzzleSolved) {
        recordCurrentReviewResult("wrong", {
          submittedMove: result.feedback.submittedMove,
          expectedMove: result.feedback.expectedMove
        });
      }
      playReviewMoveFeedback("user", move, submittedFen);
      setFeedback(
        result.feedback.puzzleSolved && result.feedback.autoPlayedMoves.length > 0
          ? { ...result.feedback, puzzleSolved: false }
          : result.feedback
      );
      if (result.feedback.result === "wrong") {
        await sleep(FEEDBACK_SNAPSHOT_MS);
        boardRef.current?.resetBoard(submittedFen);
        setFeedback(null);
        setBoardLocked(false);
        return;
      }

      if (result.feedback.autoPlayedMoves.length > 0) {
        await sleep(USER_FEEDBACK_BEFORE_AUTO_MS);
        setFeedback(null);
        await animateReviewBoardMoves(result.feedback.autoPlayedMoves, result.state.currentFen);
      }
      setReviewState({
        kind: "line",
        line: result.state,
        arrowDuelLineKind: reviewState.arrowDuelLineKind
      });
      if (result.feedback.puzzleSolved) {
        setFeedback(result.feedback);
        await sleep(FEEDBACK_SNAPSHOT_MS);
        advanceReview(wrongSeen ? "wrong" : "correct", {
          submittedMove: result.feedback.submittedMove,
          expectedMove: result.feedback.expectedMove
        });
        return;
      }
      setBoardLocked(false);
    } catch {
      boardRef.current?.resetBoard(submittedFen);
      setBoardLocked(false);
    }
  }

  async function animateReviewBoardMoves(moves: string[], finalFen: string): Promise<void> {
    const parsedMoves = moves.map(arrowFromTo).filter((move): move is BoardMove => Boolean(move));
    if (!boardRef.current || parsedMoves.length === 0) {
      setLastMove(parsedMoves[parsedMoves.length - 1] ?? null);
      boardRef.current?.resetBoard(finalFen);
      return;
    }

    for (const move of parsedMoves) {
      const suppressedMove = boardMoveToUci(move);
      const preMoveFen = boardRef.current.getState().fen;
      reviewSuppressedBoardMovesRef.current.push(suppressedMove);
      const playedMove = await boardRef.current.move({
        from: move.from as Square,
        to: move.to as Square,
        ...(move.promotion ? { promotion: move.promotion as PieceSymbol } : {})
      });
      if (!playedMove) {
        consumeSuppressedBoardMove(suppressedMove, reviewSuppressedBoardMovesRef.current);
        boardRef.current?.resetBoard(finalFen);
      } else {
        playReviewMoveFeedback("opponent", suppressedMove, preMoveFen);
      }
      setLastMove(move);
    }
    // Imperative reply animations can leave the native board's tap-selection
    // state attached to the user's previous destination square. Re-sync only
    // after every reply has settled so the next move starts from a clean input
    // state without interrupting the animation.
    boardRef.current.resetBoard(finalFen);
  }

  function openAnalysis(): void {
    const startingFen = reviewAnalysisStartingFen({ currentPuzzle, feedback });
    recordCurrentReviewResult("wrong");
    setWrongSeen(true);
    setFeedback(null);
    setBoardLocked(false);
    setAnalysisEnabled(true);
    setAnalysisFen(startingFen);
    setEngineAnalysisLines([]);
    setAnalysisEngineStatus("thinking");
    setAnalysisBackStack([]);
    setAnalysisForwardStack([]);
    boardRef.current?.resetBoard(startingFen);
  }

  function closeAnalysis(): void {
    setAnalysisEnabled(false);
    setAnalysisFen(null);
    setEngineAnalysisLines([]);
    setAnalysisEngineStatus("idle");
    setAnalysisIsRunning(false);
    setAnalysisBackStack([]);
    setAnalysisForwardStack([]);
    boardRef.current?.resetBoard(currentFen);
  }

  function resetAnalysisPosition(): void {
    const startingFen = reviewStartingFen(currentEntry);
    setAnalysisFen(startingFen);
    setEngineAnalysisLines([]);
    setAnalysisEngineStatus("thinking");
    setAnalysisBackStack([]);
    setAnalysisForwardStack([]);
    boardRef.current?.resetBoard(startingFen);
  }

  function stepAnalysisForward(): void {
    const nextFen = analysisForwardStack[analysisForwardStack.length - 1];
    if (!nextFen) {
      return;
    }
    const baseFen = analysisFen ?? currentFen;
    setAnalysisForwardStack((stack) => stack.slice(0, -1));
    setAnalysisBackStack((stack) => [...stack, baseFen]);
    setAnalysisFen(nextFen);
    setEngineAnalysisLines([]);
    setAnalysisEngineStatus("thinking");
    boardRef.current?.resetBoard(nextFen);
  }

  function stepAnalysisBack(): void {
    const previous = analysisBackStack[analysisBackStack.length - 1];
    if (!previous) {
      return;
    }
    setAnalysisBackStack((stack) => stack.slice(0, -1));
    setAnalysisForwardStack((stack) => [...stack, analysisFen ?? currentFen]);
    setAnalysisFen(previous);
    setEngineAnalysisLines([]);
    setAnalysisEngineStatus("thinking");
    boardRef.current?.resetBoard(previous);
  }

  const reviewContext = currentEntry.source !== "due"
    ? {
        puzzleId: currentEntry.puzzle.id,
        mode: currentEntry.mode,
        ratingKey: currentEntry.ratingKey
      }
    : null;
  const reviewScheduleControlNode = reviewScheduleControlVisible
    && reviewContext
    && (!replayControlsOnly || service.getReviewQueueState(reviewContext)) ? (
    <ReviewScheduleControl
      key={`${currentEntry.puzzle.id}:${currentEntry.mode}:${currentEntry.ratingKey}`}
      actionVisible
      compact
      context={reviewContext}
      currentTimeMs={currentTimeMs}
      initiatingAttemptId={currentEntry.source === "history" && currentEntry.attempt?.unclear
        ? currentEntry.attempt.id
        : undefined}
      service={service}
      onReviewChanged={onReviewEnrollmentChanged}
      refreshToken={reviewResultRecorded}
    />
  ) : null;
  const historyUnclearActionNode = (currentEntry.source === "history"
    || (isReplay && currentEntry.source === "session"))
    && currentEntry.attempt?.unclear
    && onAttemptClearUnclear ? (
      <HistoryUnclearAction
        actionLabel={isReplay ? "Mark clear" : "Clear"}
        onClear={() => onAttemptClearUnclear(currentEntry.attempt!.id)}
      />
    ) : null;
  const hasReviewContextActions = reviewScheduleControlNode !== null || historyUnclearActionNode !== null;
  const hasAnalysisPanelContent = guidedEvalLines.length > 0
    || analysisEnabled
    || currentEntry.source !== "due"
    || reviewResultRecorded;
  const reviewPromptNode = (
    <View
      key="review-prompt"
      style={[
        styles.practicePromptStack,
        {
          width: adaptiveLayout.usesSessionRail
            ? adaptiveLayout.sessionRailWidth
            : boardSize
        }
      ]}
    >
      {reviewReplyChallengeEnabled
        && currentPuzzle.kind === "arrow_duel"
        && feedback?.puzzleSolved !== true
        && feedback?.result !== "wrong" ? (
        <ArrowDuelReplyChallengePrompt
          currentPuzzle={currentPuzzle}
          explicitReplySideCopy={explicitReplySideCopy}
          frameHeight={adaptiveLayout.promptFrameHeight}
          hideSideGlyph={explicitReplySideCopy && (
            adaptiveLayout.usesSessionRail ? adaptiveLayout.sessionRailWidth : boardSize
          ) < 240}
          kingPieceSize={kingGlyphSizeForBoard(boardSize)}
          legacyPracticePromptTestIDs
          phase={reviewReplyPromptPhase}
          promptSide={reviewPromptSide}
          replyReady={reviewReplyStartedAtMs !== null}
          replySeconds={reviewReplyRemainingSeconds ?? reviewReplySeconds}
          rootTestID="practice-prompt"
          settingsHint={opponentReplySettingsHint}
          showReplyTimer={currentEntry.source === "due"}
          testIDPrefix="review-arrow-duel"
        />
      ) : (
        <PracticePrompt
          currentPuzzle={currentPuzzle}
          frameHeight={adaptiveLayout.promptFrameHeight}
          kingPieceSize={kingGlyphSizeForBoard(boardSize)}
          mode={currentEntry.mode}
          promptSide={reviewPromptSide}
          solved={feedback?.puzzleSolved === true}
          promptText={
            isArrowDuelFollowUpReview
              ? null
              : undefined
          }
          promptHint={
            isArrowDuelFollowUpReview
              ? "Follow the blue line to see why this move fails."
              : undefined
          }
          promptHintNumberOfLines={isArrowDuelFollowUpReview ? 2 : undefined}
          reserveDefaultLayout={isArrowDuelFollowUpReview}
        />
      )}
    </View>
  );
  const reviewHeaderNode = (
    <View key="review-header" style={styles.reviewHeaderRow} testID="review-header">
      <View style={styles.reviewTopNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={analysisEnabled
            ? "Close analysis"
            : isReplay ? "Exit replay" : "Exit review"}
          testID="review-exit"
          style={styles.iconButton}
          onPress={analysisEnabled
            ? closeAnalysis
            : () => onReturnToOwner(currentEntry.source)}
        >
          <CloseGlyph />
        </Pressable>
        <View style={styles.reviewTitleBlock}>
          <Text style={styles.panelTitle} testID="review-title">
            {isReplay ? "Replay" : "Review"}
          </Text>
          <Text testID="review-progress" style={styles.helperText}>
            {reviewProgressPosition} / {reviewProgressTotal} · {modeLabel(currentEntry.mode)}
          </Text>
          {arePracticeTestControlsEnabled() || isStoreAssetCaptureEnabled() ? (
            <>
              <Text testID="review-current-puzzle-id" style={styles.reviewDueHiddenMetric}>
                {currentEntry.puzzle.id}
              </Text>
              <Text testID="review-current-expected-move" style={styles.reviewDueHiddenMetric}>
                {expectedReviewMove(currentPuzzle)}
              </Text>
              <Text testID="review-board-flipped" style={styles.reviewDueHiddenMetric}>
                {boardFlipped ? "flipped" : "normal"}
              </Text>
              <Text testID="review-board-state" style={styles.reviewDueHiddenMetric}>
                {reviewBoardLocked ? "locked" : "ready"}
              </Text>
            </>
          ) : null}
        </View>
        <View
          style={[
            styles.iconButtonRow,
            currentEntry.source === "due" ? styles.reviewHeaderDueActionsPlaceholder : null
          ]}
          testID="review-header-actions"
        >
          {currentEntry.source === "session" || currentEntry.source === "history" ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isReplay ? "Previous replay puzzle" : "Previous review puzzle"}
                accessibilityState={{ disabled: !canReviewPrevious }}
                disabled={!canReviewPrevious}
                testID="review-previous"
                style={[styles.iconButton, !canReviewPrevious ? styles.disabledButton : null]}
                onPress={() => navigateReview(entryIndex - 1)}
              >
                <ChevronGlyph direction="left" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isReplay ? "Next replay puzzle" : "Next review puzzle"}
                accessibilityState={{ disabled: !canReviewNext }}
                disabled={!canReviewNext}
                testID="review-next"
                style={[styles.iconButton, !canReviewNext ? styles.disabledButton : null]}
                onPress={() => navigateReview(entryIndex + 1)}
              >
                <ChevronGlyph direction="right" />
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
      <View style={styles.reviewContextStrip} testID="review-context-strip">
        {currentEntry.source === "session" && !isReplay ? (
          <View style={styles.reviewContextPill} testID="review-source-pill">
            <Text style={styles.reviewContextPillText}>Sprint review</Text>
          </View>
        ) : null}
        {reviewRemainingSeconds !== null && !reviewReplyPromptActive ? (
          <View
            style={[styles.reviewContextPill, styles.reviewTimerPill, reviewRemainingSeconds === 0 ? styles.reviewContextPillDanger : null]}
            testID="review-timer-slot"
          >
            <Text
              numberOfLines={1}
              testID="review-timer"
              style={reviewRemainingSeconds === 0
                ? [styles.reviewContextPillText, styles.errorText]
                : styles.reviewTimerText}
            >
              {reviewRemainingSeconds === 0 ? "Time expired" : formatDuration(reviewRemainingSeconds)}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
  const reviewAnalysisColumnNode = hasAnalysisPanelContent
    || (adaptiveLayout.usesSessionRail && hasReviewContextActions) ? (
      <View
        key="review-analysis-column"
        style={[
          styles.reviewAnalysisColumn,
          adaptiveLayout.usesSessionRail ? styles.reviewAnalysisPanelWide : null,
          adaptiveLayout.usesSessionRail ? { width: adaptiveLayout.sessionRailWidth } : null
        ]}
        testID="review-analysis-column"
      >
        {hasAnalysisPanelContent ? (
          <View style={styles.analysisPanel} testID="review-analysis-panel">
            {!analysisEnabled && guidedEvalLines.length > 0 ? (
              <View testID="review-guided-eval-list">
                {guidedEvalLines.map((line, index) => (
                  <View
                    key={`${line.move}-${index}`}
                    style={styles.analysisLineRow}
                    testID={`review-guided-eval-line-${index}`}
                  >
                    <Text style={styles.analysisEvalText}>{line.score}</Text>
                    <Text style={styles.analysisMoveText} numberOfLines={1}>
                      {line.label === "Current position" ? line.san : `${index + 1}. ${line.san}`}
                    </Text>
                    <Text style={styles.analysisLineLabel} numberOfLines={1}>{line.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {analysisEnabled || currentEntry.source !== "due" || reviewResultRecorded ? (
              <View style={styles.analysisToolbar} testID="review-analysis-toolbar">
                {analysisEnabled ? (
                  <>
                    <Pressable accessibilityRole="button" accessibilityLabel="Close analysis" testID="review-close-analysis" style={styles.iconButton} onPress={closeAnalysis}>
                      <CloseGlyph />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Analysis back"
                      accessibilityState={{ disabled: !canAnalysisBack }}
                      disabled={!canAnalysisBack}
                      testID="review-analysis-back"
                      style={[styles.iconButton, !canAnalysisBack ? styles.disabledButton : null]}
                      onPress={stepAnalysisBack}
                    >
                      <ChevronGlyph direction="left" />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Analysis forward"
                      accessibilityState={{ disabled: !canAnalysisForward }}
                      disabled={!canAnalysisForward}
                      testID="review-analysis-forward"
                      style={[styles.iconButton, !canAnalysisForward ? styles.disabledButton : null]}
                      onPress={stepAnalysisForward}
                    >
                      <ChevronGlyph direction="right" />
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Reset analysis" testID="review-analysis-reset" style={styles.iconButton} onPress={resetAnalysisPosition}>
                      <Text style={styles.iconButtonText}>↺</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Flip board" testID="review-analysis-flip" style={styles.iconButton} onPress={() => setManualBoardFlip((current) => !current)}>
                      <FlipGlyph />
                    </Pressable>
                    <Text testID="review-analysis-engine-status" style={styles.analysisEngineStatus} numberOfLines={1}>
                      {analysisEngineLabel}
                    </Text>
                  </>
                ) : (
                  <>
                    <Pressable accessibilityRole="button" accessibilityLabel="Analyze position" testID="review-analysis-button" style={styles.analysisPrimaryButton} onPress={openAnalysis}>
                      <SearchGlyph />
                      <Text style={styles.analysisPrimaryButtonText}>Analysis</Text>
                    </Pressable>
                    {currentEntry.source !== "due" ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Reset puzzle"
                        accessibilityState={{ disabled: reviewBoardLocked }}
                        disabled={reviewBoardLocked}
                        testID="review-reset-puzzle"
                        style={[styles.iconButton, reviewBoardLocked ? styles.disabledButton : null]}
                        onPress={resetReviewPuzzle}
                      >
                        <Text style={styles.iconButtonText}>↺</Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </View>
            ) : null}
            {analysisEnabled ? (
              <>
                {analysisEngineStatus === "error" ? (
                  <View style={styles.analysisError} testID="review-analysis-error">
                    <Text style={styles.errorText}>Stockfish couldn't start. Check the bundled engine and try again.</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Retry Stockfish analysis"
                      testID="review-analysis-retry"
                      style={styles.secondaryButton}
                      onPress={() => {
                        setAnalysisEngineStatus("thinking");
                        setAnalysisRetryCount((count) => count + 1);
                      }}
                    >
                      <Text style={styles.secondaryButtonText}>Retry analysis</Text>
                    </Pressable>
                  </View>
                ) : null}
                {analysisLines.map((line, index) => (
                  <Pressable
                    key={`${line.move}-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${line.score} ${formatAnalysisLineMoveLabel(line, index)} ${line.label}`}
                    accessibilityState={{ disabled: !line.move }}
                    disabled={!line.move}
                    style={styles.analysisLineRow}
                    testID={`review-analysis-line-${index}`}
                    onPress={() => {
                      if (line.move) {
                        void playAnalysisCandidateMove(line.move);
                      }
                    }}
                  >
                    <Text style={styles.analysisEvalText}>{line.score}</Text>
                    <Text style={styles.analysisMoveText} numberOfLines={1}>
                      {formatAnalysisLineMoveLabel(line, index)}
                    </Text>
                    <Text style={styles.analysisLineLabel} numberOfLines={1}>{line.label}</Text>
                  </Pressable>
                ))}
              </>
            ) : null}
          </View>
        ) : null}
        {adaptiveLayout.usesSessionRail && hasReviewContextActions ? (
          <View style={styles.reviewContextActions} testID="review-context-actions-rail">
            {reviewScheduleControlNode}
            {historyUnclearActionNode}
          </View>
        ) : null}
      </View>
    ) : null;
  const reviewCentersRow = adaptiveLayout.usesSessionRail && adaptiveLayout.sessionCentersRow;

  return (
    <View
      style={[
        styles.reviewSessionPanel,
        adaptiveLayout.usesWideContent ? styles.reviewSessionPanelWide : null,
        // Regular landscape Review and Replay centre their board and rail row
        // in the content height, as the live session does. The panel spans
        // the height between the content padding; the row is its only
        // in-flow child in the rail layout.
        reviewCentersRow
          ? {
              justifyContent: "center",
              minHeight: Math.max(0, adaptiveLayout.contentHeight - UI_PADDING * 2)
            }
          : null
      ]}
      testID="review-session"
    >
      <View
        accessible
        accessibilityLabel={feedback
          ? `${feedback.result === "correct" ? "Correct move" : "Wrong move"}. ${feedback.puzzleSolved
              ? "Puzzle complete."
              : isReplay ? "Continue the replay." : "Continue the review."}`
          : analysisEnabled
            ? `Analysis ${analysisEngineLabel || "ready"}. ${sideToMoveAccessibilityLabel(reviewSideToMove)}.${lastMove ? ` Last move ${lastMove.from} to ${lastMove.to}.` : ""}`
            : `${isReplay ? "Replay" : "Review"} puzzle ${reviewProgressPosition} of ${reviewProgressTotal}. ${sideToMoveAccessibilityLabel(reviewSideToMove)}.`}
        accessibilityLiveRegion="polite"
        style={styles.accessibilityAnnouncement}
        testID="review-announcement"
      />
      {!adaptiveLayout.usesSessionRail ? reviewHeaderNode : null}

      <View
        key="review-session-layout"
        style={adaptiveLayout.usesSessionRail
          ? [
              styles.activeSessionAdaptiveLayout,
              {
                gap: adaptiveLayout.sessionRailGap,
                width: adaptiveLayout.sessionPackedRowWidth
              }
            ]
          : styles.reviewBoardLayout}
        testID={adaptiveLayout.usesSessionRail
          ? "review-session-adaptive-layout"
          : "review-session-stacked-layout"}
      >
        <View
          key="review-session-board-lane"
          style={adaptiveLayout.usesSessionRail
            ? [styles.activeSessionBoardLane, { width: boardSize }]
            : styles.reviewBoardLane}
          testID={adaptiveLayout.usesSessionRail
            ? "review-session-board-lane"
            : "review-board-lane"}
        >
          {!adaptiveLayout.usesSessionRail ? reviewPromptNode : null}
          <View
            key="review-board"
            accessible
            accessibilityLabel={sessionBoardAccessibilityLabel(reviewSideToMove, lastMove)}
            accessibilityRole="image"
            onTouchCancel={() => onBoardTouchActiveChange?.(false)}
            onTouchEnd={() => onBoardTouchActiveChange?.(false)}
            onTouchStart={() => onBoardTouchActiveChange?.(true)}
            testID="review-board"
            style={[styles.boardSurface, { width: boardSize, height: boardSize }]}
          >
            <Chessboard
              key={`${currentEntry.puzzle.id}-${entryIndex}`}
              ref={boardRef}
              blocksExternalGesture={boardBlocksExternalGesture}
              fen={displayFen}
              onMove={(result) => {
                void onReviewBoardMove(result);
              }}
              onIllegalMove={() => {
                boardRef.current?.resetBoard(displayFen);
              }}
              gestureEnabled={boardGestureEnabled}
              draggableColor={boardDraggableColor}
              boardSize={boardSize}
              flipped={boardFlipped}
              withLetters={false}
              withNumbers={false}
              durations={{ move: BOARD_MOVE_ANIMATION_MS }}
              spriteSource={CHESS_PIECE_SPRITE}
              colors={chessboardColorsFor(appTheme)}
              squareHighlights={reviewBoardSquareTints}
            />
            <BoardCoordinateOverlay
              boardSize={boardSize}
              flipped={boardFlipped}
            />
            {!boardGestureEnabled ? <BoardInputBlocker /> : null}
            {lastMove && !feedback ? (
              <LastMoveOverlay
                boardSize={boardSize}
                move={lastMove}
                overlayTestID="review-last-move-overlay"
              />
            ) : null}
            {feedbackMove ? (
              <MoveFeedbackOverlay boardSize={boardSize} />
            ) : null}
            {reviewWhatIfVisible ? (
              <ArrowDuelWhatIfOverlay
                compactTitle={boardSize < 300}
                detail={reviewWhatIfDetail}
                optionalSettingsHint={opponentReplySettingsHint}
                testIDPrefix="review-arrow-duel"
                title={explicitReplySideCopy
                  ? `What would ${moveSideDisplayName(reviewPromptSide)} play after the other move?`
                  : undefined}
                titleSide={explicitReplySideCopy ? reviewPromptSide : undefined}
                veryCompactTitle={boardSize < 250}
              />
            ) : null}
            {reviewTimedOut ? (
              <View
                accessible
                accessibilityLabel="Timed out"
                accessibilityLiveRegion="assertive"
                accessibilityRole="alert"
                style={styles.puzzleTimeoutOverlay}
                testID="review-puzzle-timeout-overlay"
              >
                <Text style={styles.puzzleTimeoutOverlayTitle}>Timed out</Text>
              </View>
            ) : null}
            {reviewState.kind === "arrow_duel"
              && reviewState.duel.phase === "choice"
              && reviewReplyPromptPhase === "choice"
              && !feedback
              && !analysisEnabled ? (
              <ArrowCandidateOverlay
                boardSize={boardSize}
                flipped={boardFlipped}
                candidates={reviewState.duel.candidates}
                testID="review-arrow-duel-candidate-overlay"
              />
            ) : null}
            {analysisEnabled ? (
              <AnalysisArrowOverlay
                boardSize={boardSize}
                flipped={boardFlipped}
                lines={analysisLines}
                blunderMove={analysisBlunderMove}
              />
            ) : null}
            {guidedReviewMove ? (
              <GuidedMoveOverlay
                boardSize={boardSize}
                flipped={boardFlipped}
                move={guidedReviewMove}
              />
            ) : null}
          </View>
          {!adaptiveLayout.usesSessionRail
            && analysisEnabled
            && reviewCuratedThemes.length > 0 ? (
            <View
              key="review-theme-catalog"
              style={[styles.reviewThemeCatalogRail, { width: boardSize }]}
              testID="review-theme-catalog"
            >
              <ThemeTagRail centered testID="review-theme-rail" themes={reviewCuratedThemes} />
            </View>
          ) : null}
        </View>

        {adaptiveLayout.usesSessionRail ? (
          <ScrollView
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
            testID="review-session-control-rail"
          >
            <View
              style={[
                styles.activeSessionControlRail,
                reviewCentersRow ? styles.activeSessionControlRailCentered : null,
                {
                  minHeight: boardSize,
                  width: adaptiveLayout.sessionRailWidth
                }
              ]}
              testID="review-session-control-rail-content"
            >
              {reviewHeaderNode}
              {reviewPromptNode}
              {analysisEnabled && reviewCuratedThemes.length > 0 ? (
                <View
                  key="review-theme-catalog"
                  style={[
                    styles.reviewThemeCatalogRail,
                    { width: adaptiveLayout.sessionRailWidth }
                  ]}
                  testID="review-theme-catalog"
                >
                  <ThemeTagRail centered testID="review-theme-rail" themes={reviewCuratedThemes} />
                </View>
              ) : null}
              {reviewAnalysisColumnNode}
            </View>
          </ScrollView>
        ) : reviewAnalysisColumnNode}
      </View>
      {!adaptiveLayout.usesSessionRail && hasReviewContextActions ? (
        <View style={styles.reviewContextActions} testID="review-context-actions-bottom">
          {reviewScheduleControlNode}
          {historyUnclearActionNode}
        </View>
      ) : null}
    </View>
  );
}

function ReviewScheduleControl({
  actionVisible = true,
  compact = false,
  context,
  currentTimeMs,
  initiatingAttemptId,
  onReviewChanged,
  onRemoved,
  refreshToken,
  service
}: {
  actionVisible?: boolean;
  compact?: boolean;
  context: ReviewContext;
  currentTimeMs: () => number;
  initiatingAttemptId?: string;
  onReviewChanged?: (clearedAttemptId?: string) => void;
  onRemoved?: () => void;
  refreshToken?: unknown;
  service: PracticeService;
}): React.JSX.Element {
  const styles = useStyles();
  const contextKey = `${context.puzzleId}\u0000${context.mode}\u0000${context.ratingKey}`;
  const [review, setReview] = useState<ReviewQueueState | undefined>(() => service.getReviewQueueState(context));
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    setReview(service.getReviewQueueState(context));
    setConfirmationVisible(false);
    setFailure(null);
    // contextKey is the stable exact-context identity for this control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey, refreshToken, service]);

  function addToReview(): void {
    setFailure(null);
    try {
      const enrolled = service.enrollReview(
        context,
        new Date(currentTimeMs()).toISOString(),
        initiatingAttemptId
      );
      setReview(enrolled);
      onReviewChanged?.(initiatingAttemptId);
    } catch {
      setFailure("Couldn't add to Review. Try again.");
    }
  }

  function confirmRemoval(): void {
    setFailure(null);
    try {
      service.removeReview(context, new Date(currentTimeMs()).toISOString());
      setReview(undefined);
      setConfirmationVisible(false);
      onReviewChanged?.();
      onRemoved?.();
    } catch {
      setFailure("Couldn't remove from Review. Try again.");
    }
  }

  return (
    <View
      style={[styles.reviewScheduleControl, compact ? styles.reviewScheduleControlCompact : null]}
      testID="review-schedule-control"
    >
      <View style={styles.reviewScheduleControlCopy}>
        <Text style={styles.reviewScheduleState} testID="review-schedule-state">
          {review ? reviewDueLabel(review, currentTimeMs()) : "Not scheduled for Review"}
        </Text>
        {failure ? <Text style={styles.errorText} testID="review-schedule-error">{failure}</Text> : null}
      </View>
      {actionVisible ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={review ? "Remove this puzzle from Review" : "Add this puzzle to Review"}
            style={styles.reviewScheduleAction}
            testID={review ? "review-schedule-remove" : "review-schedule-add"}
            onPress={review ? () => setConfirmationVisible(true) : addToReview}
          >
            <Text style={review ? styles.reviewScheduleRemoveText : styles.reviewScheduleAddText}>
              {review ? "Remove from Review" : "Add to Review"}
            </Text>
          </Pressable>
          <Modal
            animationType="fade"
            onRequestClose={() => setConfirmationVisible(false)}
            transparent
            visible={confirmationVisible}
          >
            <SafeAreaModalBackdrop style={styles.accessibleMoveModalBackdrop}>
              <View
                accessibilityViewIsModal
                style={styles.reviewScheduleConfirmation}
                testID="review-schedule-removal-confirmation"
              >
                <Text style={styles.panelTitle}>Remove from Review?</Text>
                <Text style={styles.helperText}>
                  Future reviews for this puzzle will be removed. Your attempts, History, analysis, and ratings stay unchanged. Review workload and reminders may change.
                </Text>
                {failure ? <Text style={styles.errorText}>{failure}</Text> : null}
                <View style={styles.confirmationActionRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancel removing this puzzle from Review"
                    style={styles.secondaryButton}
                    testID="review-schedule-removal-cancel"
                    onPress={() => {
                      setConfirmationVisible(false);
                      setFailure(null);
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Confirm removing this puzzle from Review"
                    style={styles.destructiveButton}
                    testID="review-schedule-removal-confirm"
                    onPress={confirmRemoval}
                  >
                    <Text style={styles.destructiveButtonText}>Remove from Review</Text>
                  </Pressable>
                </View>
              </View>
            </SafeAreaModalBackdrop>
          </Modal>
        </>
      ) : null}
    </View>
  );
}

function HistoryAttemptReplayUnavailable({
  adaptiveLayout,
  attempt,
  currentTimeMs,
  onClearUnclear,
  onReviewChanged,
  onReturn,
  replayAvailability,
  service
}: {
  adaptiveLayout: AdaptiveLayout;
  attempt: HistoryAttemptView;
  currentTimeMs: () => number;
  onClearUnclear: () => void;
  onReviewChanged: (clearedAttemptId?: string) => void;
  onReturn: () => void;
  replayAvailability: Extract<HistoryAttemptReplayAvailability, { status: "unavailable" }>;
  service: PracticeService;
}): React.JSX.Element {
  const styles = useStyles();
  const reviewContext = reviewContextForHistoryAttempt(attempt);
  return (
    <View
      style={[styles.reviewSessionPanel, adaptiveLayout.usesWideContent ? styles.reviewSessionPanelWide : null]}
      testID="review-session"
    >
      <View style={styles.reviewHeaderRow}>
        <View style={styles.reviewTopNav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Exit replay"
            testID="review-exit"
            style={styles.iconButton}
            onPress={onReturn}
          >
            <CloseGlyph />
          </Pressable>
          <View style={styles.reviewTitleBlock}>
            <Text style={styles.panelTitle} testID="review-title">
              Replay
            </Text>
            <Text style={styles.helperText}>Replay unavailable</Text>
          </View>
        </View>
      </View>
      <Text style={styles.errorText} testID="history-replay-unavailable">
        {historyReplayUnavailableMessage(replayAvailability)}
      </Text>
      {reviewContext ? (
        <ReviewScheduleControl
          context={reviewContext}
          currentTimeMs={currentTimeMs}
          initiatingAttemptId={attempt.unclear ? attempt.id : undefined}
          onReviewChanged={onReviewChanged}
          service={service}
        />
      ) : null}
      {attempt.unclear ? <HistoryUnclearAction onClear={onClearUnclear} /> : null}
    </View>
  );
}

function HistoryUnclearAction({
  actionLabel = "Clear",
  onClear
}: {
  actionLabel?: "Clear" | "Mark clear";
  onClear: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      accessibilityLabel="This attempt is marked unclear"
      style={styles.historyAttemptUnclearBanner}
      testID="history-attempt-unclear"
    >
      <View style={styles.historyAttemptUnclearCopy}>
        <Text style={styles.historyAttemptUnclearTitle}>Marked as unclear</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={actionLabel === "Mark clear" ? "Mark attempt clear" : "Clear unclear mark"}
        style={styles.historyAttemptClearButton}
        testID="history-attempt-clear-unclear"
        onPress={onClear}
      >
        <Text style={styles.historyAttemptClearButtonText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function reviewContextForHistoryAttempt(attempt: AttemptEvent | HistoryAttemptView): ReviewContext | null {
  const detail = normalizeHistoryAttemptDetail(attempt);
  return detail.mode && detail.ratingKey && attempt.puzzleId
    ? { puzzleId: attempt.puzzleId, mode: detail.mode, ratingKey: detail.ratingKey }
    : null;
}

function historyReplayUnavailableMessage(
  replayAvailability: Extract<HistoryAttemptReplayAvailability, { status: "unavailable" }>
): string {
  return replayAvailability.reason === "arrow-candidates-unavailable"
    ? "Original Arrow Duel candidates are unavailable, so this attempt cannot be replayed safely."
    : replayAvailability.reason === "puzzle-unavailable"
      ? "This puzzle is no longer available on this device, so the attempt cannot be replayed."
      : "The saved mode or rating context is invalid, so this attempt cannot be replayed safely.";
}

function formatAnalysisLineMoveLabel(line: ReviewAnalysisLine, index: number): string {
  return line.label === "Current position" ? line.san : `${index + 1}. ${line.san}`;
}

function formatGuidedCurrentEvalLine(
  line: ReviewAnalysisLine,
  isWaitingForStockfish: boolean,
  status: AnalysisEngineStatus
): ReviewAnalysisLine {
  if (!isWaitingForStockfish || line.score !== "eval --") {
    return line;
  }
  if (status === "fallback") {
    return { ...line, score: "No SF" };
  }
  if (status === "error") {
    return { ...line, score: "SF error" };
  }
  return { ...line, score: "..." };
}

function isTerminalPosition(fen: string): boolean {
  try {
    return new Chess(fen).isGameOver();
  } catch {
    return false;
  }
}

function AnalysisArrowOverlay({
  boardSize,
  flipped,
  lines,
  blunderMove
}: {
  boardSize: number;
  flipped: boolean;
  lines: ReviewAnalysisLine[];
  blunderMove?: string;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const squareSize = boardSize / 8;
  const arrows = [
    ...lines.slice(0, 1).map((line) => ({ move: line.move, stroke: appTheme.colors.positive.s600, opacity: 0.72, selected: true })),
    ...(blunderMove ? [{ move: blunderMove, stroke: appTheme.colors.danger.s600, opacity: 0.68, selected: false }] : [])
  ];

  return (
    <View style={[styles.arrowLayer, { width: boardSize, height: boardSize }]} pointerEvents="none" testID="analysis-arrow-overlay">
      {arrows.map((arrow) => {
        const from = arrowFromTo(arrow.move);
        if (!from) {
          return null;
        }
        return (
          <ArrowHint
            key={`${arrow.move}-${arrow.stroke}`}
            boardSize={boardSize}
            squareSize={squareSize}
            flipped={flipped}
            move={arrow.move}
            stroke={arrow.stroke}
            opacity={arrow.opacity}
            selected={arrow.selected}
            from={from}
          />
        );
      })}
    </View>
  );
}

function GuidedMoveOverlay({
  boardSize,
  flipped,
  move
}: {
  boardSize: number;
  flipped: boolean;
  move: string;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const squareSize = boardSize / 8;
  const from = arrowFromTo(move);
  return (
    <View style={[styles.arrowLayer, { width: boardSize, height: boardSize }]} pointerEvents="none" testID="review-guided-move-overlay">
      {from ? (
        <ArrowHint
          boardSize={boardSize}
          squareSize={squareSize}
          flipped={flipped}
          move={move}
          stroke={appTheme.colors.accent.s600}
          opacity={0.7}
          selected
          from={from}
        />
      ) : null}
    </View>
  );
}

function startReviewPuzzle(entry: ReviewEntry | undefined): ReviewPuzzleState {
  if (!entry) {
    throw new Error("Cannot start an empty review session");
  }
  if (entry.mode === "arrow_duel") {
    const candidateOrder = reviewEntryArrowDuelCandidateOrder(entry);
    return {
      kind: "arrow_duel",
      duel: beginArrowDuelPuzzle(
        entry.puzzle,
        candidateOrder === undefined ? 0 : { candidateOrder }
      )
    };
  }
  return { kind: "line", line: beginLinePuzzle(entry.puzzle) };
}

function reviewEntryArrowDuelCandidateOrder(entry: ReviewEntry): string[] | undefined {
  return entry.attempt?.arrowDuelCandidateOrder;
}

function lineStateAfterMoves(puzzle: Puzzle, moves: string[]): PuzzleLineState {
  const playedMoves = moves.map(normalizeUci);
  return {
    kind: "line",
    puzzle,
    currentFen: applyMovesToFen(puzzle.initialFen, playedMoves),
    playedMoves,
    cursor: playedMoves.length,
    autoPlayedMoves: [],
    solved: playedMoves.length >= puzzle.solutionMoves.length
  };
}

function reviewStartingFen(entry: ReviewEntry): string {
  return currentReviewPuzzleState(startReviewPuzzle(entry)).currentFen;
}

function currentReviewPuzzleState(state: ReviewPuzzleState): CurrentPuzzleState {
  if (state.kind === "arrow_duel") {
    return state.duel;
  }
  return state.line;
}

function expectedReviewMove(state: CurrentPuzzleState): string {
  if (state.kind === "arrow_duel") {
    return state.phase === "reply"
      ? state.puzzle.solutionMoves[1] ?? state.correctMove
      : state.correctMove;
  }
  return currentExpectedMove(state) ?? "";
}

function perPuzzleSecondsForReviewEntry(entry: ReviewEntry): number {
  const fromRatingKey = entry.ratingKey.match(/\/(\d+)$/)?.[1];
  if (fromRatingKey) {
    return Number(fromRatingKey) * 2;
  }
  return defaultSprintConfig(entry.mode).perPuzzleSeconds * 2;
}

function bundledCoreCustomEligiblePuzzleCount(theme: string | undefined): number {
  const manifest = getBundledCorePackManifest();
  if (!theme) {
    return manifest.puzzleCount;
  }
  return manifest.themeCounts?.[theme] ?? 0;
}

function formatUci(move: MoveResult["move"]): string {
  const promotion = move.promotion ? move.promotion.toLowerCase() : "";
  return `${move.from}${move.to}${promotion}`;
}

function isArrowDuelCandidate(candidates: string[], move: string): boolean {
  const normalizedMove = move.trim().toLowerCase();
  return candidates.some((candidate) => candidate.trim().toLowerCase() === normalizedMove);
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
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

function moveResultMatchesExpectedFen(result: MoveResult, expectedFen: string | null): boolean {
  if (!expectedFen || !result.state?.fen) {
    return true;
  }
  return canonicalFen(result.state.fen) === canonicalFen(expectedFen);
}

function shouldFlipBoard(currentPuzzle: CurrentPuzzleState): boolean {
  const perspectiveFen = currentPuzzle.kind === "arrow_duel"
    ? currentPuzzle.puzzle.initialFen
    : currentPuzzle.currentFen;
  return sideToMove(perspectiveFen) === "b";
}

function oppositeMoveSide(side: MoveSide): MoveSide {
  return side === "b" ? "w" : "b";
}

function sideToMove(fen: string): MoveSide {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

function sideToMoveLabel(side: MoveSide): "White" | "Black" {
  return side === "b" ? "Black" : "White";
}

function sideToMoveAccessibilityLabel(side: MoveSide): string {
  return `${sideToMoveLabel(side)} to move`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function squareToTopLeft(square: string, squareSize: number, flipped: boolean): { x: number; y: number } {
  if (!/^[a-h][1-8]$/.test(square)) {
    throw new Error(`Invalid square ${square}`);
  }

  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(square[1]) - 1;
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank : 7 - rank;
  return {
    x: col * squareSize,
    y: row * squareSize
  };
}

function squareToPixel(square: string, squareSize: number, flipped: boolean): { x: number; y: number } {
  const topLeft = squareToTopLeft(square, squareSize, flipped);
  return {
    x: topLeft.x + squareSize / 2,
    y: topLeft.y + squareSize / 2
  };
}

function arrowFromTo(move: string): BoardMove | null {
  const match = /^([a-h][1-8])([a-h][1-8])(?:[nbrqk]?)?$/.exec(move);
  if (!match) {
    return null;
  }
  return {
    from: match[1] ?? "",
    to: match[2] ?? "",
    ...(move.length > 4 ? { promotion: move.slice(4, 5).toLowerCase() } : {})
  };
}

const useStyles = makeStyles((theme) => ({
  accessibilityAnnouncement: {
    height: 1,
    left: -10000,
    opacity: 0.01,
    position: "absolute",
    top: 0,
    width: 1
  },
  accessibleMoveModalBackdrop: {
    alignItems: "center",
    backgroundColor: theme.colors.scrimSoft,
    flex: 1,
    justifyContent: "center",
    padding: 20
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
  title: {
    color: theme.colors.text.ink,
    fontSize: 22,
    fontWeight: "700"
  },
  content: {
    gap: 12,
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
  historyHeaderRow: {
    alignItems: "center",
    columnGap: theme.spacing.row,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    minHeight: theme.metrics.minTarget,
    rowGap: theme.spacing.inline
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
  reviewQueuePanel: {
    gap: theme.spacing.row
  },
  reviewFilterControlSlot: {
    overflow: "hidden"
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
  reviewDueCard: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.card,
    flexDirection: "row",
    gap: theme.spacing.row,
    padding: 16
  },
  reviewDueCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  reviewDueTitle: {
    color: theme.colors.text.ink,
    fontSize: 15,
    fontWeight: "800"
  },
  reviewDueBigCount: {
    textAlign: "right"
  },
  reviewDueCountBlock: {
    alignItems: "flex-end",
    flexShrink: 0
  },
  reviewDueHiddenMetric: FABRIC_SAFE_HIDDEN_TEXT_STYLE,
  reviewFilterScroller: {
    marginHorizontal: -UI_PADDING
  },
  // Matches the summary chip row so the slot keeps one height when toggled.
  reviewFilterContent: {
    gap: 8,
    paddingHorizontal: UI_PADDING,
    paddingVertical: 4
  },
  reviewForecastRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.card,
    flexDirection: "row",
    paddingVertical: 12
  },
  reviewForecastMetric: {
    alignItems: "center",
    flex: 1,
    gap: 2,
    justifyContent: "center",
    paddingHorizontal: 8
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
  reviewItemList: {
    gap: theme.spacing.group
  },
  reviewSectionToggle: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row,
    justifyContent: "space-between",
    minHeight: theme.metrics.minTarget,
    paddingHorizontal: 4
  },
  reviewSectionToggleMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline
  },
  reviewSectionCount: {
    fontVariant: ["tabular-nums"]
  },
  reviewSectionToggleChevron: {
    alignItems: "center",
    height: 18,
    justifyContent: "center",
    width: 18
  },
  reviewSectionItems: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.card,
    overflow: "hidden"
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
  reviewDevControls: {
    alignItems: "stretch",
    gap: theme.spacing.group
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
  activeSessionShell: {
    gap: 8
  },
  // Lifts the HUD above the prompt, board and rail rows that follow it, so the
  // leave confirmation it anchors draws on top of them.
  activeSessionShellRaised: {
    elevation: 12,
    zIndex: 12
  },
  sessionLeaveConfirmationOverlay: {
    elevation: 12,
    left: 0,
    marginTop: 8,
    position: "absolute",
    right: 0,
    shadowColor: theme.colors.shadow,
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: theme.name === "dark" ? 0.4 : 0.14,
    shadowRadius: 8,
    top: "100%",
    zIndex: 12
  },
  sessionNavRow: {
    alignItems: "center",
    borderBottomColor: theme.colors.border.default,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 50,
    paddingBottom: 4
  },
  sessionNavButton: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    width: 48
  },
  sessionNavActions: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    width: 48
  },
  sessionNavTitle: {
    color: theme.colors.text.ink,
    flex: 1,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center"
  },
  sessionActiveMetricRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between",
    minHeight: 36,
    paddingHorizontal: 0,
    paddingVertical: 1
  },
  sessionActiveMetricRowCompact: {
    gap: 2,
    paddingHorizontal: 0,
  },
  sessionActiveMetricRowLargeText: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: 4
  },
  sessionMetricLargeTextRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  // HUD values span their metric block so shrink-to-fit measures against
  // the block width rather than the text's own width (#652). The first and
  // last values align to the content edges; the timer stays centred.
  sessionMetricValueFill: {
    alignSelf: "stretch"
  },
  sessionMetricValueLeading: {
    textAlign: "left"
  },
  sessionMetricValueTrailing: {
    textAlign: "right"
  },
  sessionMetricBlockTrailing: {
    alignItems: "flex-end"
  },
  sessionMetricBlockFullRow: {
    flexBasis: "auto",
    flexGrow: 0,
    flexShrink: 0
  },
  sessionMetricBlock: {
    alignItems: "center",
    flex: 1,
    gap: 3,
    justifyContent: "center",
    minWidth: 0
  },
  personalBestProgressMetricBlock: {
    alignItems: "flex-start",
    flex: 1
  },
  personalBestMistakesMetricBlock: {
    alignItems: "flex-end",
    flex: 0,
    minWidth: PERSONAL_BEST_MISTAKES_BLOCK_WIDTH
  },
  sessionAbandonConfirm: {
    alignItems: "center",
    backgroundColor: theme.colors.danger.s50,
    borderColor: theme.colors.danger.s300,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  sessionAbandonCopy: {
    flex: 1,
    gap: 2
  },
  sessionAbandonConfirmStacked: {
    alignItems: "stretch",
    flexDirection: "column",
    justifyContent: "center"
  },
  sessionAbandonCopyStacked: {
    flex: 0
  },
  sessionAbandonActionsStacked: {
    justifyContent: "flex-end"
  },
  sessionAbandonActions: {
    flexDirection: "row",
    gap: 8
  },
  survivalExitAction: {
    flex: 1
  },
  survivalExitBest: {
    color: theme.colors.accent.s700,
    fontSize: 14,
    fontWeight: "900"
  },
  survivalExitPrimaryActions: {
    flexDirection: "row",
    gap: 8
  },
  survivalExitSheet: {
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s300,
    borderRadius: 12,
    borderWidth: 1,
    gap: 11,
    padding: 12
  },
  survivalExitTitle: {
    color: theme.colors.text.primary,
    fontSize: 17,
    fontWeight: "900"
  },
  // HUD values use direction A's Numeral L (system font, tabular digits).
  sessionProgressValue: {
    ...theme.typography.numeral,
    color: theme.colors.text.ink,
    textAlign: "center"
  },
  timerText: {
    ...theme.typography.numeral,
    color: theme.colors.text.ink,
    textAlign: "center"
  },
  sessionMetricTextCompact: {
    ...theme.typography.numeralRow
  },
  puzzleTimingIndicator: {
    alignItems: "center",
    backgroundColor: theme.colors.glassStrong,
    borderColor: theme.colors.border.strong,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 26,
    paddingHorizontal: 9
  },
  puzzleTimingIndicatorStandalone: {
    alignSelf: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    minHeight: 18,
    paddingHorizontal: 0
  },
  puzzleTimingIndicatorSlow: {
    backgroundColor: theme.colors.warning.s50,
    borderColor: theme.colors.warning.s500
  },
  puzzleTimingIndicatorText: {
    color: theme.colors.text.secondary,
    fontFamily: "menlo",
    fontSize: 11,
    fontWeight: "800",
    fontVariant: ["tabular-nums"]
  },
  puzzleTimingIndicatorTextSlow: {
    color: theme.colors.warning.s700
  },
  puzzleTimingCountdown: {
    backgroundColor: theme.colors.warning.s500,
    borderRadius: 999,
    color: theme.colors.text.onTone,
    fontFamily: "menlo",
    fontSize: 10,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    minWidth: 25,
    overflow: "hidden",
    paddingHorizontal: 5,
    paddingVertical: 2,
    textAlign: "center"
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
  boardInputBlocker: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
    zIndex: 50
  },
  arrowDuelWhatIfOverlay: {
    alignItems: "center",
    backgroundColor: theme.colors.scrimStrong,
    bottom: 0,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 24,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 60
  },
  arrowDuelWhatIfAnnouncement: {
    alignItems: "center",
    width: "100%"
  },
  arrowDuelWhatIfTitle: {
    color: theme.colors.text.onAccent,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 27,
    maxWidth: 280,
    textAlign: "center",
    width: "100%"
  },
  arrowDuelWhatIfTitleBlock: {
    alignItems: "center",
    maxWidth: 280,
    width: "100%"
  },
  arrowDuelWhatIfTitleLead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center"
  },
  arrowDuelWhatIfTitleLine: {
    color: theme.colors.text.onAccent,
    flexShrink: 1,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 27,
    textAlign: "center"
  },
  arrowDuelWhatIfTitleLineCompact: {
    fontSize: 20,
    lineHeight: 24
  },
  arrowDuelWhatIfTitleLineVeryCompact: {
    fontSize: 18,
    lineHeight: 22
  },
  arrowDuelWhatIfSideGlyphChip: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 7,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    marginHorizontal: 7,
    width: 32
  },
  arrowDuelWhatIfSideGlyphChipCompact: {
    borderRadius: 6,
    height: 28,
    marginHorizontal: 5,
    width: 28
  },
  arrowDuelWhatIfSideGlyphChipVeryCompact: {
    borderRadius: 5,
    height: 24,
    marginHorizontal: 4,
    width: 24
  },
  arrowDuelWhatIfDetail: {
    color: theme.colors.text.inverse,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 8,
    textAlign: "center"
  },
  arrowDuelWhatIfSettingsHint: {
    alignSelf: "center",
    backgroundColor: theme.colors.accent.glassFill,
    borderColor: theme.colors.accent.glassBorder,
    borderRadius: 999,
    borderWidth: 1,
    color: theme.colors.accent.s100,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 8,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 3,
    textAlign: "center"
  },
  arrowDuelWhatIfAction: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: 9,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 44,
    minWidth: 112,
    paddingHorizontal: 18
  },
  arrowDuelWhatIfActionText: {
    color: theme.colors.text.primary,
    fontSize: 15,
    fontWeight: "900"
  },
  coordinateOverlay: {
    left: 0,
    position: "absolute",
    top: 0,
    zIndex: 8
  },
  coordinateText: {
    fontWeight: "900",
    lineHeight: 12,
    position: "absolute",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1
  },
  coordinateFileText: {
    paddingRight: 3,
    textAlign: "right"
  },
  coordinateRankText: {
    textAlign: "left",
    width: 16
  },
  coordinateTextOnLight: {
    color: theme.colors.board.coordinateOnLightSquare,
    textShadowColor: theme.colors.board.coordinateHaloOnLightSquare
  },
  coordinateTextOnDark: {
    color: theme.colors.board.coordinateOnDarkSquare,
    textShadowColor: theme.colors.board.coordinateHaloOnDarkSquare
  },
  promptPanel: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  practicePromptStack: {
    alignSelf: "center",
    gap: 6
  },
  promptIcon: {
    alignItems: "center",
    flexShrink: 0,
    justifyContent: "center"
  },
  arrowDuelReplyPromptActive: {
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s400
  },
  arrowDuelReplyPromptPanel: {
    alignSelf: "center",
    width: "100%"
  },
  arrowDuelReplyPromptCopy: {
    alignSelf: "stretch"
  },
  arrowDuelReplyCopyLayer: {
    bottom: 0,
    gap: PRACTICE_PROMPT_COPY_GAP,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  arrowDuelReplyTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  arrowDuelReplyTimerGroup: {
    alignItems: "flex-end",
    flexShrink: 0,
    gap: 1
  },
  arrowDuelReplyTimer: {
    backgroundColor: theme.colors.accent.fill,
    borderRadius: 999,
    color: theme.colors.text.onAccent,
    fontFamily: "menlo",
    fontSize: 12,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    minWidth: 42,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
    textAlign: "center"
  },
  unclearPrompt: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  unclearPromptCopy: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
    minWidth: 0
  },
  unclearPromptQuestion: {
    color: theme.colors.text.strong,
    flex: 1,
    fontSize: 12,
    fontWeight: "700"
  },
  unclearPromptButton: {
    alignItems: "center",
    backgroundColor: theme.colors.warning.s50,
    borderColor: theme.colors.warning.s500,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 30,
    paddingHorizontal: 8
  },
  unclearPromptButtonText: {
    color: theme.colors.warning.s700,
    fontSize: 11,
    fontWeight: "900"
  },
  previousAttemptNoticeCopy: {
    flex: 1,
    gap: 1,
    minWidth: 0
  },
  previousAttemptNoticeTitle: {
    color: theme.colors.text.strong,
    fontSize: 12,
    fontWeight: "800"
  },
  previousAttemptNoticeDetail: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
    fontWeight: "600"
  },
  readOnlyAttemptStatus: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s300,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 30,
    paddingHorizontal: 8
  },
  readOnlyAttemptStatusText: {
    color: theme.colors.accent.s700,
    fontSize: 11,
    fontWeight: "900"
  },
  promptCopy: {
    flex: 1,
    gap: PRACTICE_PROMPT_COPY_GAP,
    minWidth: 0,
    position: "relative"
  },
  promptTitle: {
    color: theme.colors.text.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  promptSolvedOverlay: {
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  promptMessageOverlay: {
    gap: PRACTICE_PROMPT_COPY_GAP
  },
  promptText: {
    color: theme.colors.text.strong,
    fontSize: 12,
    fontWeight: "600"
  },
  promptHint: {
    color: theme.colors.accent.s600,
    fontSize: 12,
    fontWeight: "800"
  },
  promptSolvedLayoutCopy: {
    opacity: 0
  },
  promptEmptyLayoutCopy: {
    opacity: 0,
    position: "absolute"
  },
  sessionScoreStrip: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  sessionScoreStripCompact: {
    paddingHorizontal: 4
  },
  sessionScoreMetric: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center"
  },
  sessionScoreMetricLabeled: {
    flexDirection: "column",
    gap: 1
  },
  sessionScoreMetricCompact: {
    gap: 2,
    minWidth: 0
  },
  sessionScoreLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.25,
    lineHeight: 12,
    textTransform: "uppercase"
  },
  sessionScoreLabelCompact: {
    fontSize: 9,
    letterSpacing: 0
  },
  // Labeled (Focused Run) score texts span their column so a narrow strip
  // centers them without rounding their width down: see "Text width
  // rounding" in docs/ui-design/MOBILE_UI_DESIGN.md (#633).
  sessionScoreTextStretch: {
    alignSelf: "stretch",
    textAlign: "center"
  },
  sessionScoreValue: {
    color: theme.colors.text.ink,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 17
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
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.fill,
    borderRadius: 8,
    flex: 1,
    height: 42,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  primaryButtonText: {
    color: theme.colors.text.onAccent,
    fontSize: 13,
    fontWeight: "800"
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  secondaryButtonText: {
    color: theme.colors.text.strong,
    fontSize: 13,
    fontWeight: "700"
  },
  destructiveButton: {
    alignItems: "center",
    backgroundColor: theme.colors.danger.s600,
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  destructiveButtonText: {
    color: theme.colors.text.onTone,
    fontSize: 13,
    fontWeight: "800"
  },
  iconButtonRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  iconButtonText: {
    color: theme.colors.text.strong,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 22
  },
  disabledButton: {
    opacity: 0.36
  },
  errorPanel: {
    backgroundColor: theme.colors.danger.s50,
    borderColor: theme.colors.danger.s300,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    padding: 12
  },
  errorText: {
    color: theme.colors.danger.s800,
    fontSize: 14,
    fontWeight: "700"
  },
  positive: {
    color: theme.colors.positive.s700,
    fontWeight: "700"
  },
  panelTitle: {
    color: theme.colors.text.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  reviewSessionPanel: {
    gap: 12
  },
  reviewSessionPanelWide: {
    alignSelf: "center",
    width: "100%"
  },
  reviewHeaderRow: {
    gap: 8
  },
  reviewTopNav: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  reviewTitleBlock: {
    alignItems: "center",
    flex: 1,
    gap: 2
  },
  reviewHeaderDueActionsPlaceholder: {
    width: 38
  },
  reviewContextStrip: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center"
  },
  reviewThemeCatalogRail: {
    alignItems: "center",
    marginTop: 8,
    maxWidth: "100%",
    minWidth: 0,
  },
  reviewContextPill: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 30,
    paddingHorizontal: 10
  },
  reviewContextPillDanger: {
    borderColor: theme.colors.danger.s300
  },
  reviewTimerPill: {
    justifyContent: "center",
    minHeight: 38,
    minWidth: 78
  },
  reviewTimerText: {
    color: theme.colors.text.ink,
    fontFamily: "menlo",
    fontSize: 21,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.2
  },
  reviewContextPillText: {
    color: theme.colors.text.strong,
    fontSize: 12,
    fontWeight: "800"
  },
  reviewBoardLayout: {
    gap: 12
  },
  reviewBoardLane: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    minWidth: 0
  },
  reviewAnalysisColumn: {
    gap: 12
  },
  analysisPanel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12
  },
  analysisError: {
    backgroundColor: theme.colors.danger.s50,
    borderColor: theme.colors.danger.s200,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 10
  },
  reviewAnalysisPanelWide: {
    flexGrow: 0,
    flexShrink: 0
  },
  reviewContextActions: {
    gap: 12
  },
  analysisToolbar: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  analysisPrimaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12
  },
  analysisPrimaryButtonText: {
    color: theme.colors.text.strong,
    fontSize: 13,
    fontWeight: "800"
  },
  analysisEngineStatus: {
    color: theme.colors.text.tertiary,
    fontFamily: "Menlo",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: "auto"
  },
  analysisLineRow: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 9,
    paddingVertical: 7
  },
  analysisEvalText: {
    color: theme.colors.text.strong,
    fontFamily: "Menlo",
    fontSize: 12,
    fontWeight: "800",
    minWidth: 44
  },
  analysisMoveText: {
    color: theme.colors.text.ink,
    fontFamily: "Menlo",
    fontSize: 13,
    fontWeight: "800",
    flexShrink: 1
  },
  analysisLineLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
    fontWeight: "700",
    marginLeft: "auto"
  },
  listText: {
    color: theme.colors.text.strong,
    fontSize: 13,
    fontWeight: "600"
  },
  helperText: {
    color: theme.colors.text.tertiary,
    fontSize: 12,
    fontWeight: "600"
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
  filterButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.capsule,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 14
  },
  filterButtonActive: {
    backgroundColor: theme.colors.accent.s100
  },
  filterButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  filterButtonText: {
    ...theme.typography.subheadline,
    color: theme.colors.text.primary
  },
  filterButtonTextActive: {
    color: theme.colors.accent.s600,
    fontWeight: theme.typography.headline.fontWeight
  },
  destinationTitle: {
    flexShrink: 0
  },
  groupedSeparator: {
    backgroundColor: theme.colors.border.default,
    height: StyleSheet.hairlineWidth
  },
  groupedEmpty: {
    paddingHorizontal: 16,
    paddingVertical: 16
  },
  attemptRow: {
    alignItems: "flex-start",
    paddingVertical: 12
  },
  attemptRowCopy: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  attemptRowChevron: {
    alignSelf: "center"
  },
  reviewForecastRowStacked: {
    flexDirection: "column",
    paddingVertical: 4
  },
  reviewForecastMetricStacked: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row,
    justifyContent: "space-between",
    minHeight: theme.metrics.minTarget,
    paddingHorizontal: 16,
    paddingVertical: 6
  },
  reviewForecastLabelStacked: {
    flexShrink: 1
  },
  reviewForecastDividerStacked: {
    backgroundColor: theme.colors.border.default,
    height: StyleSheet.hairlineWidth
  },
  reviewForecastDivider: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.border.default,
    width: StyleSheet.hairlineWidth
  },
  reviewSectionTitle: {
    flex: 1
  },
  historyPanel: {
    gap: theme.spacing.row
  },
  historyPanelWide: {
    alignSelf: "center",
    maxWidth: 980,
    width: "100%"
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
  historyChipContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline,
    paddingVertical: 4
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
  historyAttemptUnclearBanner: {
    alignItems: "center",
    backgroundColor: theme.colors.warning.s50,
    borderColor: theme.colors.warning.s500,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    padding: 10
  },
  historyAttemptUnclearCopy: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8
  },
  historyAttemptUnclearTitle: {
    color: theme.colors.text.strong,
    fontSize: 13,
    fontWeight: "900"
  },
  historyAttemptClearButton: {
    alignItems: "center",
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 8
  },
  historyAttemptClearButtonText: {
    color: theme.colors.warning.s700,
    fontSize: 12,
    fontWeight: "900"
  },
  reviewScheduleControl: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    padding: 10
  },
  reviewScheduleControlCompact: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  reviewScheduleControlCopy: {
    flex: 1,
    gap: 2
  },
  reviewScheduleState: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: "800"
  },
  reviewScheduleAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 6
  },
  reviewScheduleAddText: {
    color: theme.colors.accent.s600,
    fontSize: 12,
    fontWeight: "900"
  },
  reviewScheduleRemoveText: {
    color: theme.colors.danger.s700,
    fontSize: 12,
    fontWeight: "900"
  },
  reviewScheduleConfirmation: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    gap: 12,
    maxWidth: 440,
    padding: 18,
    width: "100%"
  },
  historyAttemptHeader: {
    alignItems: "baseline",
    columnGap: 8,
    flexDirection: "row",
    flexWrap: "wrap"
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
  settingsRowPressed: {
    backgroundColor: theme.colors.surfaceStrong
  },
  confirmationActionRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end"
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
  arrowLayer: {
    position: "absolute",
    top: 0,
    left: 0
  },
  debugLog: {
    color: theme.colors.text.strong,
    fontFamily: "Menlo",
    fontSize: 9,
    lineHeight: 12,
    marginTop: 6
  },
  arrowLineWrap: {
    left: 0,
    position: "absolute",
    top: 0
  },
  analysisArrowBody: {
    borderRadius: 999,
    position: "absolute",
    transformOrigin: "0 50%"
  },
  analysisArrowHead: {
    borderBottomColor: "transparent",
    borderTopColor: "transparent",
    height: 0,
    position: "absolute",
    width: 0
  },
}));
