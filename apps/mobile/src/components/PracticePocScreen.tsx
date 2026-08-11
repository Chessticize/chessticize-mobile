import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  Image,
  LayoutAnimation,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import type { ImageSourcePropType } from "react-native";
import type { LayoutChangeEvent, PanResponderGestureState } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import type { MoveResult } from "react-native-chessboard";
import Chessboard, { type ChessboardRef } from "react-native-chessboard";
import {
  GestureHandlerRootView,
  LegacyScrollView,
  type GestureType
} from "react-native-gesture-handler";
import {
  buildArrowDuelLandscapeGuideGeometry,
  buildPortraitGuideCalloutTop,
  buildPortraitGuidePointerLeft,
  buildPortraitTimeoutGuideGeometry,
  buildSessionGuideLandscapeAlignment,
  buildSessionGuideRailConnectorGeometry
} from "./sessionGuideGeometry.ts";
import {
  analyzeFenWithUciEngine,
  ALL_THEME_SELECTION,
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
  formatLocalCalendarDateLabel,
  formatReviewDay,
  formatWhitePerspectiveScore,
  historyAttemptReplayAvailability,
  historyAttemptSpeedSeconds,
  isAttemptMarkedUnclear,
  isUnclearAttemptEligible,
  isReviewOverdue,
  markSprintGuideSeen,
  normalizeHistoryAttemptDetail,
  OPPONENT_REPLY_MAX_SECONDS,
  OPPONENT_REPLY_MIN_SECONDS,
  pauseSprint as pauseSprintState,
  PRACTICE_RUN_NAME_MAX_LENGTH,
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
  SERVER_CURATED_THEMES,
  sprintSessionGuidesFor,
  stepManualRating
} from "../../../../packages/core/src/index.ts";
import type {
  AttemptEvent,
  AttemptSource,
  ArrowDuelState,
  CurrentPuzzleState,
  CustomSprintConfigRecord,
  EngineAnalysisLine,
  HistoryAttemptView,
  HistoryAttemptReplayAvailability,
  HistoryAttentionReason,
  HistoryPerformance,
  HistoryPerformancePoint,
  HistoryResult,
  HistoryTimeRange,
  PuzzleSide,
  Puzzle,
  PuzzleFeedback,
  PuzzleLineState,
  PracticeRunRecord,
  RatingRecord,
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
  TacticalProfileTaskFamily,
  ThemeChoiceIntent,
  SprintState,
  UciEngineTransport
} from "../../../../packages/core/src/index.ts";
import {
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
  syncPracticeProgressV2,
  type ProgressV2SyncResult
} from "../../../../packages/storage/src/progress-sync-v2.ts";
import type { PracticeProgressSummary } from "../../../../packages/storage/src/rating-history.ts";
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
  MobileApplicationMetadata,
  MobilePlatformCapabilities,
  MobileStockfishCapabilities
} from "../platform/mobilePlatformCapabilities.ts";
import { arePracticeTestControlsEnabled, isPracticeDebugEnabled } from "../releaseConfig.ts";
import { isStoreAssetCaptureEnabled } from "../platform/testLaunchConfig.ts";
import { usePracticeRunManagement } from "./usePracticeRunManagement.ts";
import {
  puzzleTimingEditorState,
  updatePuzzleTimingFromEditor
} from "./puzzleTimingEditor.ts";
import {
  normalizeStoredThemeChoiceSelection,
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
import {
  MoveFeedbackSettingsSection,
  type MoveFeedbackPreferences,
  type MoveFeedbackPreviewer
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
  PracticeRunManagementPresentation,
  PracticeRunPresentation
} from "./practiceRunPresentation.ts";
import {
  buildPracticeAdaptiveLayout,
  PRACTICE_UI_PADDING as UI_PADDING,
  type AdaptiveLayout
} from "./adaptivePracticeLayout.ts";
import {
  boardMoveToUci,
  consumeSuppressedBoardMove
} from "./boardMoveSuppression.ts";
import { usePuzzleEntryPreview } from "./usePuzzleEntryPreview.ts";
import { puzzleEntryPreviewPlan } from "./puzzleEntryPreview.ts";
import {
  TacticalProfileFlow,
  TacticalProfileHomeCard
} from "./TacticalProfileSection.tsx";
import type { TacticalProfilePresentation } from "./tacticalProfilePresentation.ts";
import { useTacticalProfilePresentation } from "./useTacticalProfilePresentation.ts";
import {
  ICloudSyncErrorDetails,
  ICloudSyncSupportDiagnosticsEntry,
  type ICloudSyncErrorDetailsPresentation,
  type ICloudSyncSupportBundlePresentation
} from "./ICloudSyncErrorDetails.tsx";
import {
  HistoryProgressEntryButton,
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
  PersonalBestHomeCard,
  PersonalBestMistakeIndicator,
  PersonalBestProgressBanner,
  PersonalBestResult,
  type PersonalBestChallengeDesignPreview,
  type PersonalBestChallengeSelection,
  type PersonalBestPausedRunPresentation
} from "./PersonalBestChallengeDesign.tsx";

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
  runReorderDesignPreview?: {
    pickedUpRunId: string;
  };
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

export type RunReorderPickupFeedback = {
  haptic: "medium";
};

export type SprintRulesGuidePresentation = {
  durationLabel: string;
  maxMistakes: number;
  targetCorrect: number;
};

export type SprintSessionGuidePresentation = SprintRulesGuidePresentation & {
  arrowDuelReplyChallenge?: boolean;
  arrowDuelReplyOnboarding?: "choice_then_reply";
  opponentReplySettingsHint?: boolean;
  focusedRun?: boolean;
  guideKey?: Exclude<SprintGuideKey, "rules">;
  maxAttempts?: number;
  mode: "standard" | "arrow_duel";
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
  initialSessionGuides?: readonly SprintSessionGuidePresentation[];
  initialPreviousAttemptNotice?: "slow" | "timed_out" | "wrong";
  initialResultUnclearPrompt?: SprintResultUnclearPromptPresentation;
  initialResultState?: SprintState;
  resultReplayItems?: readonly SprintResultReplayDesignItem[];
  resultUnclearSummary?: SprintResultUnclearSummaryPresentation;
  showRunEditorSummary?: boolean;
  showSettingsReset?: boolean;
  timeoutCountsAsMistake?: boolean;
};

export type CustomThemeSelection = {
  selectedThemes: readonly CustomThemeFilter[];
  onChange: (selectedThemes: CustomThemeFilter[]) => void;
};

export type ThemeCatalogGroup = {
  label: string;
  themes: readonly string[];
};

export type ThemeCatalogPresentation = {
  groups: readonly ThemeCatalogGroup[];
};
type Tab = MobileBackTab;

type MobileBackPreview = MobileBackDestination & {
  edge: MobileSystemBackEdge;
  progress: number;
};

type SessionFeedback = PuzzleFeedback | null;
type AnalysisEngineStatus = "idle" | "thinking" | "stockfish" | "fallback" | "error";
type HistoryRatingRangeFilter = "all" | "under1000" | "1000-1399" | "1400-plus";
type HistoryResultFilter = "all" | HistoryResult;
type CustomThemeFilter = string;

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

type MoveSide = "w" | "b";

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
const NEUTRAL_ARROW = "#2563EB";
const ARROW_VISUAL_STYLES = {
  candidate: {
    stroke: NEUTRAL_ARROW,
    opacity: 0.68
  }
} as const;
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
const DISCLOSURE_MOTION_DURATION_MS = 200;
const ANALYSIS_DEPTH = 20;
const CUSTOM_DURATION_OPTIONS = [3 * 60, 5 * 60, 10 * 60] as const;
const CUSTOM_PER_PUZZLE_OPTIONS = [10, 20, 30] as const;
const PRACTICE_RUN_DURATION_OPTIONS = [
  3 * 60,
  5 * 60,
  10 * 60,
  15 * 60,
  20 * 60,
  25 * 60,
  30 * 60
] as const;
const PRACTICE_RUN_PER_PUZZLE_OPTIONS = [5, 10, 15, 20, 30, 60] as const;
const CUSTOM_INITIAL_RATING_MIN = 600;
const CUSTOM_INITIAL_RATING_MAX = 2200;
const CUSTOM_INITIAL_RATING_STEP = 100;
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

const ALL_THEMES_FILTER: CustomThemeFilter = ALL_THEME_SELECTION;
const CUSTOM_THEME_OPTIONS: ReadonlyArray<CustomThemeFilter> = [
  ALL_THEMES_FILTER,
  ...SERVER_CURATED_THEMES
];
const BOARD_COLOR_TOKENS = {
  white: "#E6E8EB",
  black: "#7B8794"
} as const;
const CHESSBOARD_COLORS = {
  white: BOARD_COLOR_TOKENS.white,
  black: BOARD_COLOR_TOKENS.black,
  lastMoveHighlight: "rgba(0, 0, 0, 0)",
  checkmateHighlight: "rgba(0, 0, 0, 0)",
  promotionPieceButton: "#F8FAFC",
  validMoveDot: "rgba(15, 23, 42, 0.36)",
  validMoveCapture: "rgba(15, 23, 42, 0.56)"
} as const;
const CHESSBOARD_DURATIONS = { move: BOARD_MOVE_ANIMATION_MS } as const;
const TEST_PUZZLE_SOURCES: ReadonlyArray<{ source: MobilePuzzleSource; label: string }> = [
  { source: "bundledCore", label: "Core Pack" },
  { source: "familiar15", label: "Familiar 15" }
];
const PRIMARY_TABS: ReadonlyArray<{ tab: Exclude<Tab, "analysis">; label: string; testID: string }> = [
  { tab: "practice", label: "Practice", testID: "practice-tab" },
  { tab: "review", label: "Review", testID: "review-tab" },
  { tab: "history", label: "History", testID: "history-tab" },
  { tab: "settings", label: "Settings", testID: "settings-tab" }
];
const PRACTICE_MODE_DESCRIPTIONS: Record<SprintMode, string> = {
  standard: "Find the best move",
  arrow_duel: "Choose the best move",
  blitz: "Fast time control",
  custom: "Time, theme, rating"
};
const BOARD_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const BOARD_FILES_FLIPPED = ["h", "g", "f", "e", "d", "c", "b", "a"] as const;
const BOARD_RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;
const BOARD_RANKS_FLIPPED = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;
const ALL_HISTORY_ATTENTION_REASONS: readonly HistoryAttentionReason[] = [
  "unclear",
  "in_review",
  "incomplete"
];
const CHESS_PIECE_SPRITE = require("../assets/chess-pieces-sprite.png") as ImageSourcePropType;
const LICHESS_PUZZLE_DATABASE_URL = "https://database.lichess.org/#puzzles";
const ANALYSIS_DIAGNOSTIC_POSITIONS = [
  {
    id: "queen-capture",
    label: "Queen capture",
    fen: "r1bq1k1r/pp2b1p1/2pQ3p/8/2BP4/1PN3P1/P4P1P/3R1RK1 b - - 0 1"
  },
  {
    id: "mate-net",
    label: "Mate net",
    fen: "8/8/8/8/8/8/2Q5/k1K5 w - - 0 1"
  },
  {
    id: "middlegame",
    label: "Middlegame",
    fen: "r1bq1rk1/pp1n1pbp/2pp1np1/4p3/2PPP3/2N2N2/PP3PPP/R1BQ1RK1 w - - 0 9"
  }
] as const;

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
  const [puzzleSource, setPuzzleSource] = useState<MobilePuzzleSource>("bundledCore");
  const service = platformCapabilities.storage.practiceService;
  const configurePuzzleSource = platformCapabilities.storage.configurePuzzleSource;
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
  }), []);
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
  const { fontScale, height, width } = useWindowDimensions();
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
  const [personalBestGuideVisible, setPersonalBestGuideVisible] = useState(
    () => personalBestChallengeDesignPreview?.guideInitiallyVisible === true
  );
  const [personalBestHubVisible, setPersonalBestHubVisible] = useState(
    () => personalBestChallengeDesignPreview?.hubInitiallyVisible === true
      || personalBestChallengeDesignPreview?.sourcePickerInitiallyVisible === true
      || personalBestChallengeDesignPreview?.recordsInitiallyVisible === true
  );
  const [personalBestRecordsVisible, setPersonalBestRecordsVisible] = useState(
    () => personalBestChallengeDesignPreview?.recordsInitiallyVisible === true
  );
  const [personalBestSelectedSetup, setPersonalBestSelectedSetup] = useState<PersonalBestChallengeSelection | null>(null);
  const personalBestPresentation = useMemo<PersonalBestChallengeDesignPreview | undefined>(() => {
    if (!personalBestChallengeDesignPreview || !personalBestSelectedSetup) {
      return personalBestChallengeDesignPreview;
    }
    return {
      ...personalBestChallengeDesignPreview,
      band: {
        currentRating: personalBestSelectedSetup.sourceRating,
        minRating: personalBestSelectedSetup.band.minRating,
        maxRating: personalBestSelectedSetup.band.maxRating
      },
      bestScore: personalBestSelectedSetup.bestScore,
      challengeType: personalBestSelectedSetup.challengeType,
      selectedReferenceRunIds: {
        ...personalBestChallengeDesignPreview.selectedReferenceRunIds,
        [personalBestSelectedSetup.challengeType]: personalBestSelectedSetup.sourceId
      },
      startState: personalBestChallengeDesignPreview.startStates?.[personalBestSelectedSetup.challengeType]
        ?? personalBestChallengeDesignPreview.startState
    };
  }, [personalBestChallengeDesignPreview, personalBestSelectedSetup]);
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
  const [runReorderDragActive, setRunReorderDragActive] = useState(false);
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
  const [sessionGuidePresentations, setSessionGuidePresentations] = useState<
    readonly SprintSessionGuidePresentation[]
  >(() => sprintRulesDesignPreview?.initialSessionGuides ?? []);
  const [sessionGuideIndex, setSessionGuideIndex] = useState<number | null>(
    () => sprintRulesDesignPreview?.initialSessionGuides?.length ? 0 : null
  );
  const [sessionGuideCoachStep, setSessionGuideCoachStep] = useState(0);
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
  const iCloudAccountStatusRef =
    useRef<ICloudAccountStatus | "not_checked">("not_checked");
  const [lastICloudSyncFailure, setLastICloudSyncFailure] =
    useState<ICloudSyncFailureDiagnostic | undefined>();
  const [moveFeedbackPreferences, setMoveFeedbackPreferences] = useState<MoveFeedbackPreferences>(
    () => service.getSettings().moveFeedback
  );
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

  const adaptiveLayout = useMemo(
    () => buildPracticeAdaptiveLayout({ fontScale, height, insets, width }),
    [fontScale, height, insets, width]
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
  const isSurvivalPauseVisible = personalBestChallengeDesignPreview
    ?.showActivePresentation === true
    && practiceExitConfirmationVisible;
  const shouldShowSessionBoard = (isActive || isShowingFeedbackSnapshot)
    && !isSurvivalPauseVisible;
  const sessionGuidePresentation = sessionGuideIndex === null
    ? undefined
    : sessionGuidePresentations[sessionGuideIndex];
  const isSessionGuideVisible = state === null
    && sessionGuideIndex !== null
    && sessionGuidePresentation !== undefined;

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
    if (!state || state.status !== "active") {
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
    const sprintDeadlineReached = !opponentReplyClocksPaused && nowMs >= sprintDeadlineMs;
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
    const guideKeys = sprintSessionGuidesFor(
      service.getSettings().sprintGuides,
      nextMode,
      { focusedRun: presentationOverride?.focusedRun === true }
    );
    if (guideKeys.length === 0) {
      return false;
    }
    const presentation = presentationOverride ?? sprintGuidePresentationFor(
      nextMode,
      useCustomTiming,
      practiceRunId
    );
    pendingGuidedStartRef.current = pendingStart ?? {
      kind: "sprint",
      nextMode,
      useCustomTiming,
      ...(practiceRunId === undefined ? {} : { practiceRunId })
    };
    setSessionGuidePresentations(guideKeys.map((guide) => ({
      ...presentation,
      guideKey: guide,
      mode: guide === "arrow_duel" ? "arrow_duel" : "standard"
    })));
    setSessionGuideCoachStep(0);
    setSessionGuideIndex(0);
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
    const nextMode = taskFamily === "arrow_duel" ? "arrow_duel" : "standard";
    const pendingStart: PendingGuidedStart = {
      kind: "focused",
      taskFamily,
      onUnavailable
    };
    const guideKeys = sprintGuidanceEnabled
      ? sprintSessionGuidesFor(
          service.getSettings().sprintGuides,
          nextMode,
          { focusedRun: true }
        )
      : [];
    if (guideKeys.length > 0) {
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
          durationLabel: formatSprintDurationLabel(
            prepared.prepared.config.durationSeconds
          ),
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
      onUnavailable(caught);
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
      setError(errorMessage(caught));
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

  function pausePersonalBestPreview(): void {
    const activeState = stateRef.current;
    if (activeState?.status === "active") {
      const paused = pauseSprintState(activeState, captureLiveNowIso()).state;
      commitState(paused);
      commitBoardInputLocked(
        true,
        "pause-survival-preview",
        paused.currentPuzzle?.puzzle.id ?? null
      );
      clearFeedbackSnapshot();
      setFeedback(null);
      setFeedbackPuzzleId(null);
    }
    setPracticeExitConfirmationVisible(true);
  }

  function resumePersonalBestPreview(nextSprint: SprintState): void {
    if (nextSprint.status !== "paused") {
      setPracticeExitConfirmationVisible(false);
      return;
    }
    const resumed = resumeSprintState(nextSprint, captureLiveNowIso());
    commitState(resumed);
    commitBoardFen(resumed.currentPuzzle?.currentFen ?? null);
    commitBoardInputLocked(false, "resume-survival-preview", resumed.currentPuzzle?.puzzle.id ?? null);
    setPracticeExitConfirmationVisible(false);
  }

  function selectPersonalBestPausedRun(run: PersonalBestPausedRunPresentation): void {
    const sourceId = personalBestChallengeDesignPreview?.selectedReferenceRunIds?.[run.challengeType];
    const source = personalBestChallengeDesignPreview?.referenceRuns?.find((candidate) => (
      candidate.challengeType === run.challengeType && candidate.id === sourceId
    ));
    setPersonalBestSelectedSetup({
      band: { minRating: run.minRating, maxRating: run.maxRating },
      bestScore: Math.max(run.score, personalBestChallengeDesignPreview?.levelRecords?.find((record) => (
        record.challengeType === run.challengeType
        && record.minRating === run.minRating
        && record.maxRating === run.maxRating
      ))?.score ?? -1),
      challengeType: run.challengeType,
      sourceId: source?.id ?? sourceId ?? "standard",
      sourceRating: source?.rating ?? run.minRating
    });
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

  function showSessionReplay(): void {
    const sessionId = stateRef.current?.id;
    const replayItems: SessionReplayItem[] =
      sprintRulesDesignPreview?.resultReplayItems
        ? [...sprintRulesDesignPreview.resultReplayItems]
        : sessionId ? service.getSessionReplay(sessionId) : [];
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
  const opponentReplySettingsHint = "Optional · Turn off in Settings";
  const arrowDuelOpponentReplyGloballyAvailable =
    arrowDuelOpponentReplyGlobalEnabled;
  const arrowDuelReplyAutoTimeoutMs = arrowDuelReplyChallengeDesign?.autoTimeoutMs;
  const arrowDuelReplyChallengePreviewVisible = Boolean(
    arrowDuelReplyChallengeDesign?.enabled
      && arrowDuelReplyChallengeDesign.resolveMove
      && arrowDuelReplyChallengeEnabled
      && arrowDuelOpponentReplyGloballyAvailable
      && currentPuzzle?.kind === "arrow_duel"
  );
  const arrowDuelReplyChallengeProductionVisible = Boolean(
    !arrowDuelReplyChallengePreviewVisible &&
      arrowDuelOpponentReplyGloballyAvailable &&
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
  const timerText = formatDuration(Math.max(0, Math.floor(remainingMs / 1000)));
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
  const arrowDuelWhatIfDetail = explicitReplySideCopy
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
    || reviewBoardTouchActive
    || runReorderDragActive;
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
  const topBackTransient: MobileBackTransient | null = isSessionGuideVisible
    ? "sprint-session-guide"
    : startingMode
      ? "starting-practice"
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
    setSessionGuidePresentations([]);
    setSessionGuideIndex(null);
    setSessionGuideCoachStep(0);
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

  const appChromeVisible = !isOpenSession
    && !isShowingFeedbackSnapshot
    && !isSessionGuideVisible
    && !personalBestGuideVisible
    && !personalBestHubVisible
    && !personalBestRecordsVisible
    && !reviewSurfaceOpen;
  const appHeaderVisible = appChromeVisible && !contentOwnsHeader;
  const sideNavigationVisible = appChromeVisible && adaptiveLayout.usesSideNavigation;
  const bottomTabsVisible = appChromeVisible && !sideNavigationVisible;
  const sessionUsesRail = shouldShowSessionBoard && adaptiveLayout.usesSessionRail;
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
  const personalBestActivePresentation = personalBestPresentation
    ?.showActivePresentation === true
    ? personalBestPresentation
    : undefined;
  const sessionStatusNode = state && (isOpenSession || isShowingFeedbackSnapshot) ? (
    <SessionStatusBar
      closeAccessibilityLabel={personalBestActivePresentation
        ? "Open Survival leave options"
        : "Abandon sprint"}
      compactMetrics={sessionUsesRail}
      mode={mode}
      personalBest={personalBestActivePresentation}
      state={state}
      timerText={personalBestActivePresentation ? "No time limit" : timerText}
      confirmAbandon={practiceExitConfirmationVisible}
      onAbandon={isOpenSession && !personalBestActivePresentation ? abandonSprint : undefined}
      onClose={personalBestActivePresentation
        ? pausePersonalBestPreview
        : undefined}
      onPauseAndLeave={personalBestActivePresentation ? resetToIdle : undefined}
      onConfirmAbandonChange={setPracticeExitConfirmationVisible}
      onPause={isActive && !personalBestActivePresentation
        ? () => pauseActiveSprint("manual")
        : undefined}
      onResume={isPaused && state
        ? personalBestActivePresentation
          ? () => resumePersonalBestPreview(state)
          : () => resumeSprint(state)
        : undefined}
    />
  ) : null;
  const sessionScoreNode = shouldShowSessionBoard && state?.status === "active" ? (
    personalBestActivePresentation ? (
      <PersonalBestProgressBanner
        bestScore={personalBestActivePresentation.bestScore}
        compact={sessionUsesRail}
        score={state.correctCount}
      />
    ) : (
      <SessionScoreStrip compact={sessionUsesRail} state={state} />
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
            colors={CHESSBOARD_COLORS}
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
            flipped={boardFlipped}
            move={displayedLastBoardMove}
            overlayTestID="session-last-move-overlay"
          />
        ) : null}

        {submittedMoveForCurrentPuzzle ? (
          <MoveFeedbackOverlay
            boardSize={boardSize}
            flipped={boardFlipped}
            move={submittedMoveForCurrentPuzzle}
            result={boardFeedback?.result ?? "wrong"}
          />
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
          style={[styles.sessionBoardDetails, { width: boardSize }]}
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
      style={[
        styles.practicePromptStack,
        { width: sessionUsesRail ? adaptiveLayout.sessionRailWidth : boardSize }
      ]}
    >
      {arrowDuelReplyChallengeVisible && displayedPuzzle?.kind === "arrow_duel" ? (
          <ArrowDuelReplyChallengePrompt
            currentPuzzle={displayedPuzzle}
            explicitReplySideCopy={explicitReplySideCopy}
            frameHeight={adaptiveLayout.promptFrameHeight}
            hideSideGlyph={explicitReplySideCopy && (
              sessionUsesRail ? adaptiveLayout.sessionRailWidth : boardSize
            ) < 240}
            kingPieceSize={kingGlyphSizeForBoard(boardSize)}
            phase={arrowDuelReplyChallengeDisplayPhase}
            promptSide={arrowDuelPromptSide}
            replyReady={arrowDuelReplyReady}
            replySeconds={arrowDuelReplySecondsRemaining}
            settingsHint={opponentReplySettingsHint}
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
        sessionUsesRail ? styles.activeSessionRailBottomFeedback : null,
        { width: sessionUsesRail ? adaptiveLayout.sessionRailWidth : boardSize }
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
  const hasSessionLayoutContent = sessionStatusNode !== null
    || pausedSessionNode !== null
    || sessionBoardNode !== null
    || sessionScoreNode !== null
    || practicePromptNode !== null
    || sessionBottomFeedbackNode !== null
    || errorNode !== null;
  const practiceAnnouncement = error
    ? `Error. ${error}`
    : personalBestGuideVisible
      ? "Survival first-use guide. The Run has not started."
    : personalBestHubVisible
      ? "Survival setup. Choose Puzzle or Arrow Duel and a level."
    : personalBestRecordsVisible
      ? "Survival records. Puzzle and Arrow Duel bests are listed separately by level."
    : isSessionGuideVisible
      ? `${sessionGuidePresentation?.focusedRun
        ? "Focused Run"
        : sessionGuidePresentation?.mode === "arrow_duel"
          ? "Arrow Duel"
          : "Sprint"} first-session guide. The timer has not started.`
    : boardFeedback
      ? `${boardFeedback.result === "correct" ? "Correct move" : "Wrong move"}. ${boardFeedback.puzzleSolved ? "Puzzle complete." : "Continue the puzzle."}`
      : isActive && displayedSideToMove
        ? `${personalBestActivePresentation ? "Survival" : `${modeLabel(mode)} sprint`}. ${sideToMoveAccessibilityLabel(displayedSideToMove)}. ${state?.correctCount ?? 0} solved, ${state?.mistakeCount ?? 0} mistakes.`
        : `${screenTitle} screen`;

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
      <View
        testID="safe-area-shell"
        style={[
          styles.safeArea,
          {
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
            paddingTop: insets.top
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
      <StatusBar barStyle="dark-content" />
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
        {sideNavigationVisible ? (
          <NavigationRail
            activeTab={tab}
            dueReviewCount={dueTodayCount}
            expanded={adaptiveLayout.sideNavigationExpanded}
            overdueReviewCount={overdueCount}
            width={adaptiveLayout.sideNavigationWidth}
            onSelectTab={(nextTab) => {
              if (nextTab === "review") {
                openReviewQueue();
                return;
              }
              navigateToTab(nextTab);
            }}
          />
        ) : null}
        <View style={styles.appContentShell}>
          {appHeaderVisible ? (
            <View
              accessibilityLabel={screenSubtitle ? `${screenTitle}, ${screenSubtitle}` : screenTitle}
              style={styles.header}
              testID="app-shell-header"
            >
              <View>
                <Text style={styles.title}>{screenTitle}</Text>
              </View>
            </View>
          ) : null}

          <LegacyScrollView
            ref={setPracticeMainScrollRef}
            keyboardShouldPersistTaps="handled"
            testID="practice-main-scroll"
            scrollEnabled={!practiceScrollLocked}
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
              adaptiveLayout.usesWideContent && !sessionUsesRail ? styles.contentWide : null,
              bottomTabsVisible ? styles.contentWithBottomTabs : null,
              sessionUsesRail ? styles.contentSessionRail : null
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
                    presentation={personalBestPresentation}
                    onClose={() => setPersonalBestHubVisible(false)}
                    onCloseRecords={() => setPersonalBestRecordsVisible(false)}
                    onContinue={(runId) => {
                      const pausedRun = personalBestPresentation.pausedRuns?.find((run) => run.id === runId);
                      const nextState = pausedRun?.resumeState;
                      if (!pausedRun || !nextState) {
                        return;
                      }
                      selectPersonalBestPausedRun(pausedRun);
                      setPersonalBestHubVisible(false);
                      setMode(nextState.config.mode);
                      commitState(nextState);
                      commitBoardFen(nextState.currentPuzzle?.currentFen ?? null);
                    }}
                    onOpenRecords={() => {
                      setPersonalBestRecordsVisible(true);
                    }}
                    recordsVisible={personalBestRecordsVisible}
                    onStart={(selection) => {
                      setPersonalBestSelectedSetup(selection);
                      setPersonalBestHubVisible(false);
                      setPersonalBestGuideVisible(true);
                    }}
                  />
                ) : null}
                {personalBestGuideVisible && personalBestPresentation ? (
                  <PersonalBestGuide
                    presentation={personalBestPresentation}
                    onClose={() => setPersonalBestGuideVisible(false)}
                    onStart={() => {
                      setPersonalBestGuideVisible(false);
                      const startState = personalBestPresentation.startState;
                      if (startState) {
                        setMode(startState.config.mode);
                        commitState(startState);
                        commitBoardFen(startState.currentPuzzle?.currentFen ?? null);
                      }
                    }}
                  />
                ) : null}
                {isSessionGuideVisible && sessionGuidePresentation ? (
                  <ActiveSessionGuide
                    adaptiveLayout={adaptiveLayout}
                    boardSize={boardSize}
                    coachStep={sessionGuideCoachStep}
                    coachStepOffset={sessionGuidePresentations
                      .slice(0, sessionGuideIndex)
                      .reduce((total, guide) => total + sessionGuideCoachStepCount(guide), 0)}
                    presentation={sessionGuidePresentation}
                    stepNumber={sessionGuideIndex + 1}
                    totalCoachSteps={sessionGuidePresentations.reduce(
                      (total, guide) => total + sessionGuideCoachStepCount(guide),
                      0
                    )}
                    onExit={dismissSessionGuide}
                    onBack={() => {
                      if (sessionGuideCoachStep > 0) {
                        setSessionGuideCoachStep((current) => Math.max(current - 1, 0));
                        return;
                      }
                      const previousIndex = sessionGuideIndex - 1;
                      if (previousIndex >= 0 && sessionGuidePresentations[previousIndex]) {
                        setSessionGuideIndex(previousIndex);
                        setSessionGuideCoachStep(3);
                      }
                    }}
                    onContinue={() => {
                      if (
                        sessionGuideCoachStep
                          < sessionGuideCoachStepCount(sessionGuidePresentation) - 1
                      ) {
                        setSessionGuideCoachStep((current) => Math.min(
                          current + 1,
                          sessionGuideCoachStepCount(sessionGuidePresentation) - 1
                        ));
                        return;
                      }
                      const nextIndex = sessionGuideIndex + 1;
                      if (sessionGuidePresentations[nextIndex]) {
                        if (sprintGuidanceEnabled) {
                          saveSprintGuideSeen(
                            sessionGuidePresentation.guideKey
                              ?? (sessionGuidePresentation.mode === "arrow_duel"
                                ? "arrow_duel"
                                : "active_session")
                          );
                        }
                        setSessionGuideIndex(nextIndex);
                        setSessionGuideCoachStep(0);
                        return;
                      }

                      if (sprintGuidanceEnabled) {
                        saveSprintGuideSeen(
                          sessionGuidePresentation.guideKey
                            ?? (sessionGuidePresentation.mode === "arrow_duel"
                              ? "arrow_duel"
                              : "active_session")
                        );
                      }
                      setSessionGuideIndex(null);
                      setSessionGuideCoachStep(0);
                      const pendingStart = pendingGuidedStartRef.current;
                      pendingGuidedStartRef.current = null;
                      if (pendingStart) {
                        if (pendingStart.kind === "focused") {
                          requestFocusedRunStart(
                            pendingStart.taskFamily,
                            pendingStart.onUnavailable
                          );
                          return;
                        }
                        startSprint(
                          pendingStart.nextMode,
                          pendingStart.useCustomTiming,
                          pendingStart.practiceRunId
                        );
                        return;
                      }
                      if (sessionGuidePresentation.focusedRun) {
                        return;
                      }
                      startSprint(sessionGuidePresentation.mode);
                    }}
                  />
                ) : null}

                {/* Keep the native Chessboard under the same parents when the
                    session switches between stacked and rail layouts. Moving
                    it between conditional branches remounts Skia and can leave
                    the piece sprite atlas blank while the board background is
                    already visible after rotation. */}
                {hasSessionLayoutContent ? (
                  <View
                    style={sessionUsesRail
                      ? [
                          styles.activeSessionAdaptiveLayout,
                          {
                            gap: adaptiveLayout.sessionRailGap,
                            width: sessionPackedRowWidth
                          }
                        ]
                      : styles.activeSessionStack}
                    testID={sessionUsesRail ? "active-session-adaptive-layout" : "stacked-session-layout"}
                  >
                    <View
                      style={sessionUsesRail
                        ? [styles.activeSessionBoardLane, { width: boardSize }]
                        : styles.activeSessionStack}
                      testID={sessionUsesRail ? "active-session-board-lane" : undefined}
                    >
                      {!sessionUsesRail ? sessionStatusNode : null}
                      {!sessionUsesRail ? pausedSessionNode : null}
                      {!sessionUsesRail ? practicePromptNode : null}
                      {sessionBoardNode}
                      {!sessionUsesRail ? errorNode : null}
                      {!sessionUsesRail ? sessionBottomFeedbackNode : null}
                    </View>
                    {sessionUsesRail ? (
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
                        testID="active-session-control-rail"
                      >
                        <View
                          style={[
                            styles.activeSessionControlRail,
                            {
                              minHeight: boardSize,
                              width: adaptiveLayout.sessionRailWidth
                            }
                          ]}
                          testID="active-session-control-rail-content"
                        >
                          {sessionStatusNode}
                          {practicePromptNode}
                          {sessionPuzzleTimingNode}
                          {sessionScoreNode}
                          {errorNode}
                          {sessionBottomFeedbackNode}
                        </View>
                      </ScrollView>
                    ) : null}
                  </View>
                ) : null}

                {!isSessionGuideVisible && !isOpenSession && state === null && (
                  resolvedTacticalProfilePresentation?.screen !== undefined
                  && resolvedTacticalProfilePresentation.screen !== "home"
                ) ? (
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
                    onContinuePersonalBest={(runId) => {
                      const pausedRun = personalBestPresentation?.pausedRuns?.find((run) => run.id === runId);
                      const nextState = pausedRun?.resumeState;
                      if (!pausedRun || !nextState) {
                        setPersonalBestHubVisible(true);
                        return;
                      }
                      selectPersonalBestPausedRun(pausedRun);
                      setMode(nextState.config.mode);
                      commitState(nextState);
                      commitBoardFen(nextState.currentPuzzle?.currentFen ?? null);
                    }}
                    onOpenPersonalBestGuide={() => setPersonalBestGuideVisible(true)}
                    onOpenPersonalBestHub={() => setPersonalBestHubVisible(true)}
                    onSelectMode={setMode}
                    onStartMode={(nextMode) => startSprint(nextMode)}
                    onResumeSprint={resumeSprint}
                    onRunReorderDragActiveChange={setRunReorderDragActive}
                    nativeRunReorderScrollController={nativeRunReorderScrollController}
                    runReorderDesignPreview={runReorderDesignPreview}
                    onRunReorderFeedbackPreview={playRunReorderPickupFeedback}
                  />
                ) : null}

                {!isSessionGuideVisible && !isOpenSession && state === null && activeRunManagementPresentation && activeRunManagementPresentation.screen !== "home" ? (
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

                {!isSessionGuideVisible && !isOpenSession && state === null && !activeRunManagementPresentation && mode === "custom" ? (
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

                {isFinished && !isShowingFeedbackSnapshot ? (
                  personalBestPresentation?.result ? (
                    <PersonalBestResult
                      activeElapsedMs={personalBestPresentation.result.activeElapsedMs}
                      band={personalBestPresentation.band}
                      bestStreak={state.bestStreak}
                      challengeType={personalBestPresentation.challengeType ?? "puzzle"}
                      endReason={personalBestPresentation.result.endReason}
                      isNewBest={personalBestPresentation.result.isNewBest}
                      mistakeCount={state.mistakeCount}
                      previousBestScore={personalBestPresentation.result.previousBestScore}
                      score={state.correctCount}
                      sittings={personalBestPresentation.result.sittings}
                      onChangeChallenge={() => {
                        resetToIdle();
                        setPersonalBestHubVisible(true);
                      }}
                      onDone={resetToIdle}
                      onReplayMistakes={sprintReplayItems.length > 0
                        ? showSessionReplay
                        : undefined}
                      onTryAgain={() => {
                        const startState = personalBestPresentation.startState;
                        if (!startState) {
                          resetToIdle();
                          return;
                        }
                        setMode(startState.config.mode);
                        commitState(startState);
                        commitBoardFen(startState.currentPuzzle?.currentFen ?? null);
                      }}
                    />
                  ) : (
                    <SprintSummary
                      state={state}
                      resultSummary={storedSprintResultSummary}
                      clarifyGoal={
                        sprintGuidanceEnabled
                        || sprintRulesDesignPreview?.initialResultState !== undefined
                      }
                      elapsedMs={Math.min(sprintElapsedMs, state ? state.config.durationSeconds * 1000 : sprintElapsedMs)}
                      unclearPrompt={unclearPrompt}
                      unclearSummary={
                        sprintRulesDesignPreview?.resultUnclearSummary
                      }
                      replayItems={sprintReplayItems}
                      includePromptInUnclearSummary={
                        sprintRulesDesignPreview?.initialResultUnclearPrompt !== undefined
                      }
                      onToggleUnclear={toggleUnclearPrompt}
                      onReplay={() => {
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
                      onBack={resetToIdle}
                      onOpenHistory={() => {
                        setHistoryRatingKey(state.config.ratingKey);
                        setHistoryPageOffset(0);
                        navigateToTab("history");
                      }}
                      onOpenReplay={
                        sprintReplayItems.length > 0
                          ? showSessionReplay
                          : undefined
                      }
                    />
                  )
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
                moveFeedbackPreferences={moveFeedbackPreferences}
                moveFeedbackPreviewer={moveFeedbackSettings?.preview}
                showSprintGuideReset={
                  sprintGuidanceEnabled
                  || sprintRulesDesignPreview?.showSettingsReset === true
                }
                advancedRatingsOpen={settingsAdvancedRatingsOpen}
                onAdvancedRatingsOpenChange={setSettingsAdvancedRatingsOpen}
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
          {bottomTabsVisible ? (
            <View style={styles.bottomTabs}>
              {PRIMARY_TABS.map((item) => (
                <TabButton
                  key={item.tab}
                  active={tab === item.tab}
                  badgeAccessibilityLabel={
                    item.tab === "review" && dueTodayCount > 0
                      ? `${dueTodayCount} due reviews${overdueCount > 0 ? `, ${overdueCount} overdue` : ""}`
                      : undefined
                  }
                  badgeCount={item.tab === "review" ? dueTodayCount : 0}
                  badgeTone={item.tab === "review" && overdueCount > 0 ? "danger" : "default"}
                  label={item.label}
                  presentation="bottom"
                  tab={item.tab}
                  testID={item.testID}
                  onPress={() => {
                    if (item.tab === "review") {
                      openReviewQueue();
                      return;
                    }
                    navigateToTab(item.tab);
                  }}
                />
              ))}
            </View>
          ) : null}
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
              <ActivityIndicator color="#2563EB" size="large" testID="sprint-loading-spinner" />
              <Text style={styles.sprintLoadingTitle}>Preparing {modeLabel(startingMode)}</Text>
              <Text style={styles.sprintLoadingDetail}>Loading puzzles and setting up the board</Text>
            </View>
          </View>
        ) : null}
      </View>
      </View>
    </GestureHandlerRootView>
  );
}

type PracticeModeSummary = {
  mode: SprintMode;
  config: SprintConfig;
  rating?: number;
};

function SprintStartHeader({
  actionLabel = "Start",
  closeAccessibilityLabel,
  closeTestID,
  headerTestID,
  startAccessibilityLabel,
  startDisabled = false,
  startTestID,
  title,
  titleTestID,
  onClose,
  onStart
}: {
  actionLabel?: string;
  closeAccessibilityLabel?: string;
  closeTestID?: string;
  headerTestID: string;
  startAccessibilityLabel: string;
  startDisabled?: boolean;
  startTestID: string;
  title: string;
  titleTestID: string;
  onClose?: () => void;
  onStart: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.sprintScreenHeader} testID={headerTestID}>
      {onClose ? (
        <View style={styles.sprintHeaderSideSlot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeAccessibilityLabel}
            testID={closeTestID}
            style={styles.analysisIconButton}
            onPress={onClose}
          >
            <CloseGlyph />
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.sprintHeaderTitleBlock, !onClose ? styles.sprintHeaderTitleBlockLeading : null]}>
        <Text style={[styles.sprintScreenTitle, !onClose ? styles.sprintScreenTitleLeading : null]} testID={titleTestID}>{title}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={startAccessibilityLabel}
        accessibilityState={{ disabled: startDisabled }}
        disabled={startDisabled}
        testID={startTestID}
        style={[styles.sprintHeaderStartButton, startDisabled ? styles.disabledButton : null]}
        onPress={onStart}
      >
        <Text style={styles.primaryButtonText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function PracticeHome({
  adaptiveLayout,
  mode,
  modes,
  currentRating,
  personalBestChallenge,
  progress,
  runManagement,
  sprintRulesGuide,
  sprintRulesGuideVisible,
  tacticalProfile,
  resumableSprint,
  onContinuePersonalBest,
  onDismissSprintRulesGuide,
  onOpenPersonalBestHub,
  onOpenPersonalBestGuide,
  onOpenSprintRulesGuide,
  onSelectMode,
  onStartMode,
  onResumeSprint,
  onRunReorderDragActiveChange,
  nativeRunReorderScrollController,
  runReorderDesignPreview,
  onRunReorderFeedbackPreview
}: {
  adaptiveLayout: AdaptiveLayout;
  mode: SprintMode;
  modes: PracticeModeSummary[];
  currentRating: number;
  personalBestChallenge?: PersonalBestChallengeDesignPreview;
  progress: PracticeProgressSummary;
  runManagement?: PracticeRunManagementPresentation;
  sprintRulesGuide?: SprintRulesGuidePresentation;
  sprintRulesGuideVisible: boolean;
  tacticalProfile?: TacticalProfilePresentation;
  resumableSprint: SprintState | null;
  onContinuePersonalBest: (runId: string) => void;
  onDismissSprintRulesGuide: () => void;
  onOpenPersonalBestHub: () => void;
  onOpenPersonalBestGuide: () => void;
  onOpenSprintRulesGuide: () => void;
  onSelectMode: (next: SprintMode) => void;
  onStartMode: (next: SprintMode) => void;
  onResumeSprint: (sprint: SprintState) => void;
  onRunReorderDragActiveChange: (active: boolean) => void;
  nativeRunReorderScrollController: NativeRunReorderScrollController;
  runReorderDesignPreview?: Props["runReorderDesignPreview"];
  onRunReorderFeedbackPreview?: (feedback: RunReorderPickupFeedback) => void;
}): React.JSX.Element {
  const selectedRun = runManagement?.runs.find((run) => run.id === runManagement.selectedRunId) ?? null;
  const progressMode = selectedRun?.mode ?? mode;

  return (
    <View style={styles.practiceHome} testID="practice-home">
      {resumableSprint ? (
        <ResumeSprintCard
          sprint={resumableSprint}
          onResume={() => onResumeSprint(resumableSprint)}
        />
      ) : null}

      <View
        style={adaptiveLayout.usesWideContent ? styles.practiceHomeColumns : styles.practiceHomeStack}
        testID="practice-home-layout"
      >
        <View style={[
          styles.practiceHomePrimaryColumn,
          adaptiveLayout.usesWideContent
            ? styles.practiceHomePrimaryColumnWide
            : styles.practiceHomeColumnStacked
        ]} testID="practice-home-primary-column">
          {runManagement ? (
            <>
              <PracticeRunHome
                presentation={runManagement}
                sprintRulesGuide={sprintRulesGuide}
                sprintRulesGuideVisible={sprintRulesGuideVisible}
                onDismissSprintRulesGuide={onDismissSprintRulesGuide}
                onOpenSprintRulesGuide={onOpenSprintRulesGuide}
                onRunReorderDragActiveChange={onRunReorderDragActiveChange}
                nativeRunReorderScrollController={nativeRunReorderScrollController}
                runReorderDesignPreview={runReorderDesignPreview}
                onRunReorderFeedbackPreview={onRunReorderFeedbackPreview}
              />
              {personalBestChallenge ? (
                <PersonalBestHomeCard
                  presentation={personalBestChallenge}
                  onContinue={onContinuePersonalBest}
                  onHowItWorks={onOpenPersonalBestGuide}
                  onOpenHub={onOpenPersonalBestHub}
                />
              ) : null}
            </>
          ) : (
            <>
              <SprintStartHeader
                headerTestID="practice-action-header"
                startAccessibilityLabel={`Start ${modeLabel(mode)} sprint`}
                startTestID="practice-start-button"
                title="Start a Sprint"
                titleTestID="practice-header-title"
                onStart={() => onStartMode(mode)}
              />
              <View style={styles.modeList}>
                {modes.map((item) => (
                  <PracticeModeCard
                    key={item.mode}
                    active={mode === item.mode}
                    item={item}
                    onPress={() => onSelectMode(item.mode)}
                  />
                ))}
              </View>
            </>
          )}
        </View>

        <View style={[
          styles.practiceHomeSecondaryColumn,
          adaptiveLayout.usesWideContent
            ? styles.practiceHomeSecondaryColumnWide
            : styles.practiceHomeColumnStacked
        ]} testID="practice-home-secondary-column">
          {runManagement && !selectedRun ? (
            <PracticeNoRunProgressCard />
          ) : (
            <PracticeProgressCard
              currentRating={currentRating}
              mode={progressMode}
              progress={progress}
              ratingContextLabel={selectedRun?.name}
            />
          )}

          {tacticalProfile ? (
            <TacticalProfileHomeCard presentation={tacticalProfile} />
          ) : null}

        </View>
      </View>
    </View>
  );
}

function PracticeRunHome({
  presentation,
  sprintRulesGuide,
  sprintRulesGuideVisible,
  onDismissSprintRulesGuide,
  onOpenSprintRulesGuide,
  onRunReorderDragActiveChange,
  nativeRunReorderScrollController,
  runReorderDesignPreview,
  onRunReorderFeedbackPreview
}: {
  presentation: PracticeRunManagementPresentation;
  sprintRulesGuide?: SprintRulesGuidePresentation;
  sprintRulesGuideVisible: boolean;
  onDismissSprintRulesGuide: () => void;
  onOpenSprintRulesGuide: () => void;
  onRunReorderDragActiveChange: (active: boolean) => void;
  nativeRunReorderScrollController: NativeRunReorderScrollController;
  runReorderDesignPreview?: Props["runReorderDesignPreview"];
  onRunReorderFeedbackPreview?: (feedback: RunReorderPickupFeedback) => void;
}): React.JSX.Element {
  const [draggedRunId, setDraggedRunId] = useState<string | null>(null);
  const [dropTargetRunId, setDropTargetRunId] = useState<string | null>(null);
  const [dropTargetPosition, setDropTargetPosition] = useState<RunDropTargetPosition | null>(null);
  const [insertionOutlineTop, setInsertionOutlineTop] = useState<number | null>(null);
  const [dropPreviewOffsets, setDropPreviewOffsets] = useState<Record<string, number>>({});
  const committedDropSettlingRef = useRef(false);
  const draggedRunIdRef = useRef<string | null>(null);
  const dropTargetRunIdRef = useRef<string | null>(null);
  const dropTargetPositionRef = useRef<RunDropTargetPosition | null>(null);
  const insertionOutlineTopRef = useRef<number | null>(null);
  const dropPreviewOffsetsRef = useRef<Record<string, number>>({});
  const webDragOriginCenterRef = useRef<number | null>(null);
  const dragSourceHeightRef = useRef(0);
  const dragSourceStrideRef = useRef(0);
  const webRunListElementRef = useRef<WebRunElement | null>(null);
  const nativeRunListElementRef = useRef<NativeRunReorderMeasureElement | null>(null);
  const runElementsRef = useRef(new Map<string, WebRunElement>());
  const nativeRunLayoutsRef = useRef(new Map<string, NativeRunLayout>());
  const nativeDragOriginCenterRef = useRef<number | null>(null);
  const previousRunRectsRef = useRef<Map<string, WebRunRect> | null>(null);
  const selectedRun = presentation.runs.find((run) => run.id === presentation.selectedRunId) ?? null;
  const showRestore = presentation.hiddenRuns.length > 0
    && (presentation.homeEditing || presentation.runs.length === 0);
  const registerRunElement = useCallback((runId: string, element: WebRunElement | null): void => {
    if (element) {
      runElementsRef.current.set(runId, element);
    } else {
      runElementsRef.current.delete(runId);
    }
  }, []);
  const recordNativeRunLayout = (runId: string, layout: NativeRunLayout): void => {
    // PanResponder movement is evaluated against one geometry snapshot. React
    // Native can deliver queued onLayout generations after pickup, so accepting
    // them here would mix old and new card coordinates in the same gesture.
    // The committed drop already advances this snapshot optimistically; fresh
    // native layouts may replace it only after the gesture has finished.
    if (draggedRunIdRef.current === null) {
      nativeRunLayoutsRef.current.set(runId, layout);
    }
  };
  const captureRunPositions = (): void => {
    if (Platform.OS !== "web") {
      return;
    }
    previousRunRectsRef.current = new Map(
      [...runElementsRef.current].map(([runId, element]) => [runId, element.getBoundingClientRect()])
    );
  };
  const reorderRun = (
    runId: string,
    targetRunId: string,
    animateNativeLayout = true
  ): void => {
    if (runId !== targetRunId) {
      captureRunPositions();
      if (animateNativeLayout) {
        configureNativeRunLayoutAnimation();
      }
      presentation.onIntent({ type: "move-run", runId, targetRunId });
    }
  };
  const finishRunDrag = (): void => {
    nativeDragOriginCenterRef.current = null;
    draggedRunIdRef.current = null;
    dropTargetRunIdRef.current = null;
    dropTargetPositionRef.current = null;
    insertionOutlineTopRef.current = null;
    webDragOriginCenterRef.current = null;
    dragSourceHeightRef.current = 0;
    dragSourceStrideRef.current = 0;
    dropPreviewOffsetsRef.current = {};
    setDraggedRunId(null);
    setDropTargetRunId(null);
    setDropTargetPosition(null);
    setInsertionOutlineTop(null);
    setDropPreviewOffsets({});
    onRunReorderDragActiveChange(false);
  };
  const startRunDrag = (runId: string): void => {
    if (Platform.OS !== "web") {
      nativeRunReorderScrollController.refreshBounds(nativeRunListElementRef.current);
    }
    const layout = nativeRunLayoutsRef.current.get(runId);
    nativeDragOriginCenterRef.current = layout ? layout.y + layout.height / 2 : null;
    const webRunElement = runElementsRef.current.get(runId);
    const runIndex = presentation.runs.findIndex((run) => run.id === runId);
    const adjacentRun = presentation.runs[runIndex + 1] ?? presentation.runs[runIndex - 1];
    if (Platform.OS === "web" && webRunElement && runIndex >= 0) {
      const runRect = webRunElement.getBoundingClientRect();
      const adjacentRect = adjacentRun
        ? runElementsRef.current.get(adjacentRun.id)?.getBoundingClientRect()
        : undefined;
      webDragOriginCenterRef.current = runRect.top + runRect.height / 2;
      dragSourceHeightRef.current = runRect.height;
      dragSourceStrideRef.current = adjacentRect
        ? Math.abs(adjacentRect.top - runRect.top)
        : runRect.height;
    } else if (layout && runIndex >= 0) {
      const adjacentLayout = adjacentRun ? nativeRunLayoutsRef.current.get(adjacentRun.id) : undefined;
      dragSourceHeightRef.current = layout.height;
      dragSourceStrideRef.current = adjacentLayout
        ? Math.abs(adjacentLayout.y - layout.y)
        : layout.height;
    }
    draggedRunIdRef.current = runId;
    dropTargetRunIdRef.current = null;
    dropTargetPositionRef.current = null;
    insertionOutlineTopRef.current = null;
    dropPreviewOffsetsRef.current = {};
    setDraggedRunId(runId);
    setDropTargetRunId(null);
    setDropTargetPosition(null);
    setInsertionOutlineTop(null);
    setDropPreviewOffsets({});
    committedDropSettlingRef.current = false;
    onRunReorderDragActiveChange(true);
    onRunReorderFeedbackPreview?.({ haptic: "medium" });
  };

  useEffect(() => () => onRunReorderDragActiveChange(false), [onRunReorderDragActiveChange]);
  const applyRunDropPreview = (
    preview: RunReorderPreview | null,
    outlineContainerTop = 0
  ): void => {
    const targetRunId = preview?.targetRunId ?? null;
    const targetPosition = preview?.targetPosition ?? null;
    const nextOffsets = preview?.offsets ?? {};
    const nextOutlineTop = preview
      ? preview.insertionOutlineTop - outlineContainerTop
      : null;
    const offsetsUnchanged = presentation.runs.every((run) =>
      (dropPreviewOffsetsRef.current[run.id] ?? 0) === (nextOffsets[run.id] ?? 0)
    );
    if (
      targetRunId === dropTargetRunIdRef.current
      && targetPosition === dropTargetPositionRef.current
      && nextOutlineTop === insertionOutlineTopRef.current
      && offsetsUnchanged
    ) {
      return;
    }
    dropTargetRunIdRef.current = targetRunId;
    dropTargetPositionRef.current = targetPosition;
    insertionOutlineTopRef.current = nextOutlineTop;
    dropPreviewOffsetsRef.current = nextOffsets;
    setDropTargetRunId(targetRunId);
    setDropTargetPosition(targetPosition);
    setInsertionOutlineTop(nextOutlineTop);
    setDropPreviewOffsets(nextOffsets);
  };
  const moveNativeRunDrag = (runId: string, translationY: number): void => {
    const originCenter = nativeDragOriginCenterRef.current;
    if (originCenter === null) {
      return;
    }
    const layouts = new Map<string, RunReorderItemLayout>();
    for (const [layoutRunId, nativeLayout] of nativeRunLayoutsRef.current) {
      layouts.set(layoutRunId, { height: nativeLayout.height, top: nativeLayout.y });
    }
    applyRunDropPreview(buildRunReorderPreview({
      layouts,
      originCenter,
      pointerCenter: originCenter + translationY,
      runId,
      runs: presentation.runs,
      sourceHeight: dragSourceHeightRef.current,
      sourceStride: dragSourceStrideRef.current
    }));
  };
  const previewWebRunDropTarget = (runId: string, pointerY: number): void => {
    const runOriginCenter = webDragOriginCenterRef.current;
    const listRect = webRunListElementRef.current?.getBoundingClientRect();
    if (runOriginCenter === null || !listRect) {
      return;
    }
    const layouts = new Map<string, RunReorderItemLayout>();
    for (const run of presentation.runs) {
      const rect = runElementsRef.current.get(run.id)?.getBoundingClientRect();
      if (rect) {
        layouts.set(run.id, {
          height: rect.height,
          top: rect.top - (dropPreviewOffsetsRef.current[run.id] ?? 0)
        });
      }
    }
    applyRunDropPreview(buildRunReorderPreview({
      layouts,
      originCenter: runOriginCenter,
      pointerCenter: pointerY,
      runId,
      runs: presentation.runs,
      sourceHeight: dragSourceHeightRef.current,
      sourceStride: dragSourceStrideRef.current
    }), listRect.top);
  };
  const commitNativeRunLayoutPreview = (runId: string): void => {
    if (Platform.OS === "web" || insertionOutlineTopRef.current === null) {
      return;
    }
    const nextLayouts = new Map(nativeRunLayoutsRef.current);
    for (const run of presentation.runs) {
      const layout = nativeRunLayoutsRef.current.get(run.id);
      if (!layout) {
        continue;
      }
      nextLayouts.set(run.id, {
        height: layout.height,
        y: run.id === runId
          ? insertionOutlineTopRef.current
          : layout.y + (dropPreviewOffsetsRef.current[run.id] ?? 0)
      });
    }
    nativeRunLayoutsRef.current = nextLayouts;
  };
  const dropRun = (): boolean => {
    const runId = draggedRunIdRef.current;
    const targetRunId = dropTargetRunIdRef.current;
    if (runId && targetRunId) {
      committedDropSettlingRef.current = true;
      commitNativeRunLayoutPreview(runId);
      reorderRun(runId, targetRunId, false);
      finishRunDrag();
      return true;
    }
    finishRunDrag();
    return false;
  };
  const reorderRunWithKeyboard = (runId: string, direction: "up" | "down"): void => {
    const index = presentation.runs.findIndex((run) => run.id === runId);
    const target = presentation.runs[index + (direction === "up" ? -1 : 1)];
    if (target) {
      reorderRun(runId, target.id);
    }
  };

  useLayoutEffect(() => {
    const previousRects = previousRunRectsRef.current;
    previousRunRectsRef.current = null;
    if (Platform.OS !== "web" || !previousRects) {
      return;
    }
    for (const [runId, element] of runElementsRef.current) {
      const previousRect = previousRects.get(runId);
      if (!previousRect || typeof element.animate !== "function") {
        continue;
      }
      const nextRect = element.getBoundingClientRect();
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaY) < 0.5) {
        continue;
      }
      const isPickedUp = runId === draggedRunIdRef.current;
      const pickedUpOffset = isPickedUp ? -2 : 0;
      const pickedUpScale = isPickedUp ? " scale(1.015)" : "";
      element.getAnimations?.().forEach((animation) => animation.cancel());
      element.dataset.reorderAnimation = "moving";
      const animation = element.animate([
        { transform: `translate3d(0, ${deltaY + pickedUpOffset}px, 0)${pickedUpScale}` },
        { transform: `translate3d(0, ${pickedUpOffset}px, 0)${pickedUpScale}` }
      ], {
        duration: 220,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)"
      });
      const clearAnimationState = (): void => {
        if (element.dataset.reorderAnimation === "moving") {
          delete element.dataset.reorderAnimation;
        }
      };
      animation.onfinish = clearAnimationState;
      animation.oncancel = clearAnimationState;
    }
  }, [presentation.runs]);

  return (
    <View style={styles.runManagementPanel} testID="practice-run-management">
      <SprintStartHeader
        actionLabel={presentation.homeEditing ? "Done" : "Start"}
        headerTestID="practice-action-header"
        startAccessibilityLabel={presentation.homeEditing
          ? "Finish editing runs"
          : selectedRun
            ? `Start ${selectedRun.name}`
            : "Start a run"}
        startDisabled={!presentation.homeEditing && !selectedRun}
        startTestID={presentation.homeEditing ? "practice-run-home-done" : "practice-run-start"}
        title={presentation.homeEditing ? "Edit Runs" : "Start a Run"}
        titleTestID="practice-header-title"
        onStart={() => presentation.onIntent({
          type: presentation.homeEditing ? "toggle-home-edit" : "start-selected-run"
        })}
      />

      <Text style={styles.helperText}>
        {presentation.homeEditing
          ? Platform.OS === "web"
            ? "Drag a card to reorder, or use the arrow buttons."
            : "Touch and hold a card to drag, or use the arrow buttons."
          : "Choose a run, then start when you are ready."}
      </Text>

      <View
        style={styles.runManagementToolbar}
        testID="practice-run-home-utilities"
      >
        {sprintRulesGuide && !presentation.homeEditing && !sprintRulesGuideVisible ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="How Sprint works"
            style={styles.sprintRulesHelpLink}
            testID="practice-sprint-rules-open"
            onPress={onOpenSprintRulesGuide}
          >
            <View style={styles.sprintRulesHelpIcon}>
              <Text style={styles.sprintRulesHelpIconText}>?</Text>
            </View>
            <Text style={styles.sprintRulesHelpLinkText}>How Sprint works</Text>
          </Pressable>
        ) : null}
        <View style={styles.runManagementToolbarActions}>
          {!presentation.homeEditing ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit runs"
              style={styles.secondaryCompactButton}
              testID="practice-run-home-edit"
              onPress={() => presentation.onIntent({ type: "toggle-home-edit" })}
            >
              <Text style={styles.secondaryCompactButtonText}>Edit</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a run"
            style={styles.primaryCompactButton}
            testID="practice-add-run"
            onPress={() => presentation.onIntent({ type: "add-run" })}
          >
            <Text style={styles.primarySmallButtonText}>+ Add Run</Text>
          </Pressable>
        </View>
      </View>

      {sprintRulesGuide && !presentation.homeEditing && sprintRulesGuideVisible ? (
        <SprintRulesGuide
          presentation={sprintRulesGuide}
          onDismiss={onDismissSprintRulesGuide}
        />
      ) : null}

      {presentation.notice ? (
        <View
          accessibilityLiveRegion="polite"
          style={styles.runNotice}
          testID="practice-run-notice"
        >
          <Text style={styles.runNoticeText}>{presentation.notice}</Text>
        </View>
      ) : null}

      {presentation.runs.length === 0 ? (
        <View style={styles.runEmptyState} testID="practice-runs-empty">
          <Text style={styles.sectionLabel}>No runs on Home</Text>
          <Text style={styles.helperText}>
            Add a new run or restore one below. Saved ratings and history are still available.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a new run"
            style={[styles.primaryButton, styles.runEmptyAction]}
            testID="practice-empty-add-run"
            onPress={() => presentation.onIntent({ type: "add-run" })}
          >
            <Text style={styles.primaryButtonText}>Add a Run</Text>
          </Pressable>
        </View>
      ) : (
        <View
          ref={(element) => {
            webRunListElementRef.current = element as unknown as WebRunElement | null;
            nativeRunListElementRef.current = element as unknown as NativeRunReorderMeasureElement | null;
          }}
          style={[styles.modeList, { position: "relative" }]}
          testID="practice-run-list"
        >
          {presentation.runs.map((run, index) => (
            <React.Fragment key={run.id}>
              <PracticeRunCard
                active={run.id === presentation.selectedRunId}
                canMoveDown={index < presentation.runs.length - 1}
                canMoveUp={index > 0}
                dragging={run.id === (
                  draggedRunId
                  ?? (presentation.homeEditing ? runReorderDesignPreview?.pickedUpRunId : null)
                )}
                committedDropSettling={committedDropSettlingRef.current}
                dropPreviewOffsetY={dropPreviewOffsets[run.id] ?? 0}
                directRunEditing={presentation.directRunEditing === true}
                dropTargetPosition={run.id === dropTargetRunId && run.id !== draggedRunId
                  ? dropTargetPosition
                  : null}
                dropTarget={run.id === dropTargetRunId && run.id !== draggedRunId}
                editing={presentation.homeEditing}
                run={run}
                onIntent={presentation.onIntent}
                onCardElement={registerRunElement}
                onDragEnd={finishRunDrag}
                onDragStart={startRunDrag}
                nativeRunReorderScrollController={nativeRunReorderScrollController}
                onDrop={dropRun}
                onKeyboardReorder={reorderRunWithKeyboard}
                onNativeDragMove={moveNativeRunDrag}
                onNativeLayout={recordNativeRunLayout}
                onWebDragMove={previewWebRunDropTarget}
                onWebDrop={dropRun}
              />
              {presentation.removeCandidateId === run.id ? (
                <RunRemovalConfirmation run={run} onIntent={presentation.onIntent} />
              ) : null}
            </React.Fragment>
          ))}
          {Platform.OS === "web" && insertionOutlineTop !== null && dropTargetPosition ? (
            <div
              aria-hidden="true"
              data-run-insertion-outline={dropTargetPosition}
              data-run-insertion-target={dropTargetRunId
                ? `practice-run-${safeTestId(dropTargetRunId)}`
                : undefined}
              style={{
                backgroundColor: "rgba(37, 99, 235, 0.025)",
                border: "2px dashed #2563EB",
                borderRadius: 12,
                boxSizing: "border-box",
                height: dragSourceHeightRef.current,
                left: 0,
                pointerEvents: "none",
                position: "absolute",
                right: 0,
                top: insertionOutlineTop,
                zIndex: 15
              }}
            />
          ) : null}
          {Platform.OS !== "web" && insertionOutlineTop !== null && dropTargetPosition ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              style={[
                styles.runInsertionOutline,
                {
                  height: dragSourceHeightRef.current,
                  top: insertionOutlineTop
                }
              ]}
              testID="practice-run-insertion-outline"
            />
          ) : null}
        </View>
      )}

      {showRestore ? (
        <View style={styles.runRestoreSection} testID="practice-run-restore-section">
          <Text style={styles.sectionLabel}>Restore to Home</Text>
          <Text style={styles.helperText}>Restoring a run keeps its existing rating and history.</Text>
          <View style={styles.runRestoreList}>
            {presentation.hiddenRuns.map((run) => (
              <View key={run.id} style={styles.runRestoreRow}>
                <View style={styles.runRestoreCopy}>
                  <Text style={styles.listText}>{run.name}</Text>
                  <Text style={styles.helperText}>Rating {run.elo}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Restore ${run.name} to Home`}
                  style={styles.secondaryCompactButton}
                  testID={`practice-run-restore-${safeTestId(run.id)}`}
                  onPress={() => presentation.onIntent({ type: "restore-run", runId: run.id })}
                >
                  <Text style={styles.secondaryCompactButtonText}>Restore</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SprintRulesGuide({
  presentation,
  onDismiss
}: {
  presentation: SprintRulesGuidePresentation;
  onDismiss: () => void;
}): React.JSX.Element {
  const mistakeLimitDetail = `The ${ordinalWord(presentation.maxMistakes)} mistake ends the Sprint.`;

  return (
    <View
      accessibilityLabel={`Your first Sprint. Solve ${presentation.targetCorrect} puzzles to pass. Time limit: Finish the goal before the Sprint clock reaches zero. At zero, the active puzzle is saved as Incomplete, not as a mistake, and needs attention. If it is Slow, it is also marked Unclear. Mistake limit: ${mistakeLimitDetail} Slow warning: The puzzle timer turns amber when you are taking too long. If you solve after that, it is marked Unclear for another look, not as a mistake. Puzzle timeout: When the puzzle timer runs out, it counts as a mistake, is added to Review, and the Sprint moves on. Mistakes are not marked Unclear. For example, solving ${presentation.targetCorrect} puzzles with one mistake means ${presentation.targetCorrect} solved and ${presentation.targetCorrect + 1} attempted.`}
      style={styles.sprintRulesGuide}
      testID="practice-sprint-rules-guide"
    >
      <View style={styles.sprintRulesGuideHeader}>
        <View style={styles.sprintRulesGuideTitleBlock}>
          <Text style={styles.sprintRulesEyebrow}>YOUR FIRST SPRINT</Text>
          <Text style={styles.sprintRulesGuideTitle}>
            Solve {presentation.targetCorrect} puzzles to pass
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss Sprint rules"
          style={styles.sprintRulesDismissButton}
          testID="practice-sprint-rules-dismiss"
          onPress={onDismiss}
        >
          <Text style={styles.sprintRulesDismissText}>Got it</Text>
        </Pressable>
      </View>

      <View style={styles.sprintRulesList}>
        <SprintRuleRow
          badge={presentation.durationLabel}
          detail="Finish the goal before the Sprint clock reaches zero. At zero, the active puzzle is saved as Incomplete, not as a mistake, and needs attention. If it is Slow, it is also marked Unclear."
          label="Time limit"
        />
        <SprintRuleRow
          badge={String(presentation.maxMistakes)}
          detail={mistakeLimitDetail}
          label="Mistake limit"
          tone="danger"
        />
        <SprintRuleRow
          badge="SLOW"
          detail="The puzzle timer turns amber when you are taking too long. If you solve after that, it is marked Unclear for another look, not as a mistake."
          label="Slow warning"
          tone="warning"
        />
        <SprintRuleRow
          badge="TIMEOUT"
          detail="When the puzzle timer runs out, it counts as a mistake, is added to Review, and the Sprint moves on. Mistakes are not marked Unclear."
          label="Puzzle timeout"
          tone="danger"
        />
      </View>

      <Text style={styles.sprintRulesGuideFootnote}>
        Example: {presentation.targetCorrect} solved + 1 mistake = {presentation.targetCorrect + 1} attempted.
      </Text>
    </View>
  );
}

function SprintRuleRow({
  badge,
  detail,
  label,
  tone = "default"
}: {
  badge: string;
  detail: string;
  label: string;
  tone?: "default" | "danger" | "warning";
}): React.JSX.Element {
  const ruleTestId = safeTestId(label);

  return (
    <View style={styles.sprintRuleRow} testID={`practice-sprint-rule-${ruleTestId}`}>
      <View style={[
        styles.sprintRuleBadge,
        tone === "danger" ? styles.sprintRuleBadgeDanger : null,
        tone === "warning" ? styles.sprintRuleBadgeWarning : null
      ]} testID={`practice-sprint-rule-${ruleTestId}-badge`}>
        <Text
          numberOfLines={1}
          style={[
            styles.sprintRuleBadgeText,
            tone === "danger" ? styles.sprintRuleBadgeTextDanger : null,
            tone === "warning" ? styles.sprintRuleBadgeTextWarning : null
          ]}
        >
          {badge}
        </Text>
      </View>
      <View
        style={styles.sprintRuleCopy}
        testID={`practice-sprint-rule-${ruleTestId}-copy`}
      >
        <Text style={styles.sprintRuleLabel}>{label}</Text>
        <Text style={styles.sprintRuleDetail}>{detail}</Text>
      </View>
    </View>
  );
}

type SessionGuideCallout = {
  badge: string;
  detail: string;
  id: "arrow-duel" | "arrow-duel-reply" | "overview" | "slow" | "timeout" | "unclear";
  title: string;
  tone: "danger" | "info" | "warning";
};

type SessionGuideMeasuredLayout = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type SessionGuideMeasuredLayoutKey =
  | "slow-callout"
  | "slow-target"
  | "timeout-callout"
  | "timeout-target"
  | "unclear-callout"
  | "unclear-target";

function sameSessionGuideMeasuredLayout(
  current: SessionGuideMeasuredLayout | undefined,
  next: SessionGuideMeasuredLayout
): boolean {
  return current?.height === next.height
    && current.width === next.width
    && current.x === next.x
    && current.y === next.y;
}

function sessionGuideCallout(
  mode: "standard" | "arrow_duel",
  coachStep: number,
  focusedRun = false,
  arrowDuelReplyChallenge = false,
  arrowDuelReplyOnboarding = false,
  opponentReplySettingsHint = false
): SessionGuideCallout {
  if (mode === "arrow_duel") {
    if (arrowDuelReplyChallenge && arrowDuelReplyOnboarding) {
      return coachStep === 0
        ? {
            badge: "ARROW DUEL · 1 OF 2",
            detail: "Play one of the two arrows. A correct choice rewinds the board and plays the other, tempting move instead.",
            id: "arrow-duel",
            title: "Choose the stronger move",
            tone: "info"
          }
        : {
            badge: "FIND THE REPLY · 2 OF 2",
            detail: opponentReplySettingsHint
              ? "After you choose correctly, we play the other move. You have 10 seconds to find Black’s best reply while your Sprint time is paused. A miss or timeout counts as one mistake and goes to Review."
              : "After you choose correctly, we’ll test your understanding of the counterplay by playing the move you didn’t choose. You’ll then have 10 seconds to find Black’s best reply. Sprint time stays paused. A miss or timeout is one mistake and goes to Review.",
            id: "arrow-duel-reply",
            title: "Then reply for Black",
            tone: "info"
          };
    }
    if (arrowDuelReplyChallenge) {
      return {
        badge: "ARROW DUEL",
        detail: "Choose the stronger arrow. If correct, find the reply quickly to show you understand the opponent's counterattack. The Sprint and puzzle clocks pause when the reply begins. A wrong choice, reply, or timeout makes the puzzle a mistake and adds it to Review.",
        id: "arrow-duel",
        title: "Choose, then prove it",
        tone: "info"
      };
    }
    return {
      badge: "ARROW DUEL",
      detail: "Compare the two moves, then play the stronger one on the board. Other moves are ignored. If the Sprint clock reaches zero, the current choice is saved as Incomplete, not as a mistake.",
      id: "arrow-duel",
      title: "The arrows show your two choices",
      tone: "info"
    };
  }
  if (coachStep === 0) {
    return {
      badge: focusedRun ? "FOCUSED RUN" : "SPRINT HEADER",
      detail: focusedRun
        ? "The top row shows puzzles completed, time left, and Unrated status. Your Rating will not change."
        : "The top row shows puzzles solved, Sprint time left, and mistakes remaining. At zero, the active puzzle is saved as Incomplete, not as a mistake. The Sprint begins when you finish this guide.",
      id: "overview",
      title: focusedRun ? "Track the fixed Run" : "Track your Sprint",
      tone: "info"
    };
  }
  if (coachStep === 1) {
    return {
      badge: "SLOW",
      detail: "Keep solving. A correct answer will be marked Unclear because you took too long, but it will not count as a mistake.",
      id: "slow",
      title: "Amber means you’re taking too long",
      tone: "warning"
    };
  }
  if (coachStep === 2) {
    return {
      badge: "TIMED OUT",
      detail: focusedRun
        ? "It is added to Review and counts as one completed puzzle. The Focused Run then moves on."
        : "It is added to Review. Mistakes are not marked Unclear. The Sprint then shows the next puzzle.",
      id: "timeout",
      title: "This puzzle counts as a mistake",
      tone: "danger"
    };
  }
  return {
    badge: "UNCLEAR",
    detail: "Tap it after a correct answer, or on the final Incomplete puzzle, when the solution still does not make sense to you.",
    id: "unclear",
    title: "Use Mark as unclear when needed",
    tone: "warning"
  };
}

function sessionGuideCoachStepCount(
  presentation: SprintSessionGuidePresentation
): number {
  if (presentation.mode === "standard") {
    return 4;
  }
  return presentation.arrowDuelReplyOnboarding === "choice_then_reply" ? 2 : 1;
}

function ActiveSessionGuide({
  adaptiveLayout,
  boardSize,
  coachStep,
  coachStepOffset,
  onBack,
  onContinue,
  onExit,
  presentation,
  stepNumber,
  totalCoachSteps
}: {
  adaptiveLayout: AdaptiveLayout;
  boardSize: number;
  coachStep: number;
  coachStepOffset: number;
  onBack: () => void;
  onContinue: () => void;
  onExit: () => void;
  presentation: SprintSessionGuidePresentation;
  stepNumber: number;
  totalCoachSteps: number;
}): React.JSX.Element {
  const isArrowDuel = presentation.mode === "arrow_duel";
  const isFocusedRun = presentation.focusedRun === true;
  const guideBoardSize = adaptiveLayout.usesSessionRail
    ? boardSize
    : Math.min(
        boardSize,
        Math.floor(
          adaptiveLayout.contentHeight * (adaptiveLayout.isRegularWidth ? 0.42 : 0.34)
        )
      );
  const currentGuideCoachSteps = sessionGuideCoachStepCount(presentation);
  const isLastCoachStep = coachStep >= currentGuideCoachSteps - 1;
  const unifiedCoachStep = coachStepOffset + coachStep + 1;
  const hasPreviousCoachStep = coachStep > 0 || stepNumber > 1;
  const usesNarrowGuideNavigation = !adaptiveLayout.usesSessionRail && boardSize < 240;
  const landscapeAlignment = adaptiveLayout.usesSessionRail
    ? buildSessionGuideLandscapeAlignment({
        boardSize: guideBoardSize,
        sessionRailGap: adaptiveLayout.sessionRailGap,
        sessionRailWidth: adaptiveLayout.sessionRailWidth
      })
    : undefined;
  const continueLabel = !isLastCoachStep || unifiedCoachStep < totalCoachSteps
    ? "Next"
    : isFocusedRun
      ? "Start Focused Run"
    : isArrowDuel
      ? "Start Arrow Duel"
      : "Start Sprint";
  const callout = sessionGuideCallout(
    presentation.mode,
    coachStep,
    isFocusedRun,
    presentation.arrowDuelReplyChallenge === true,
    presentation.arrowDuelReplyOnboarding === "choice_then_reply",
    presentation.opponentReplySettingsHint === true
  );
  const optionalSettingsCopy = isArrowDuel
    && presentation.arrowDuelReplyOnboarding === "choice_then_reply"
    && presentation.opponentReplySettingsHint === true
    && coachStep === 1
    ? ` ${ARROW_DUEL_OPTIONAL_SETTINGS_COPY}`
    : "";

  return (
    <View
      accessibilityLabel={`Guide ${unifiedCoachStep} of ${totalCoachSteps}. ${callout.title}. ${callout.detail}${optionalSettingsCopy}`}
      style={styles.sessionGuideCalibrated}
      testID={isArrowDuel ? "practice-arrow-duel-guide" : "practice-active-session-guide"}
    >
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={FABRIC_SAFE_HIDDEN_TEXT_STYLE}
        testID="practice-session-guide-progress"
      >
        GUIDE {unifiedCoachStep} OF {totalCoachSteps} · YOUR FIRST {isFocusedRun ? "FOCUSED RUN" : isArrowDuel ? "ARROW DUEL" : "ACTIVE SPRINT"}
      </Text>
      <SessionCoachmarkDemo
        adaptiveLayout={adaptiveLayout}
        boardSize={guideBoardSize}
        coachStep={coachStep}
        guideNumber={unifiedCoachStep}
        mode={presentation.mode}
        onExit={onExit}
        presentation={presentation}
      />

      <View
        style={[
          styles.sessionGuideCoachNavigation,
          adaptiveLayout.usesSessionRail
            ? [
                styles.sessionGuideCoachNavigationRail,
                {
                  left: "50%",
                  transform: [{
                    translateX: landscapeAlignment?.railTranslateX ?? 0
                  }],
                  width: adaptiveLayout.sessionRailWidth
                }
              ]
            : usesNarrowGuideNavigation
              ? styles.sessionGuideCoachNavigationNarrow
              : null
        ]}
        testID="practice-session-guide-navigation"
      >
        {hasPreviousCoachStep || adaptiveLayout.usesSessionRail ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous guide"
            accessibilityState={{ disabled: !hasPreviousCoachStep }}
            disabled={!hasPreviousCoachStep}
            style={[
              styles.sessionGuideCoachBackButton,
              adaptiveLayout.usesSessionRail
                ? styles.sessionGuideCoachBackButtonRail
                : null,
              usesNarrowGuideNavigation
                ? styles.sessionGuideCoachActionNarrow
                : null,
              !hasPreviousCoachStep
                ? styles.sessionGuideCoachBackButtonDisabled
                : null
            ]}
            testID="practice-session-guide-back"
            onPress={onBack}
          >
            <Text
              style={[
                styles.sessionGuideCoachBackText,
                !hasPreviousCoachStep
                  ? styles.sessionGuideCoachBackTextDisabled
                  : null
              ]}
            >
              Back
            </Text>
          </Pressable>
        ) : usesNarrowGuideNavigation ? null : (
          <View
            style={[
              styles.sessionGuideCoachBackSpacer,
              adaptiveLayout.usesSessionRail
                ? styles.sessionGuideCoachBackSpacerRail
                : null
            ]}
          />
        )}
        <Text
          accessibilityLabel={`Guide ${unifiedCoachStep} of ${totalCoachSteps}`}
          numberOfLines={1}
          style={[
            styles.sessionGuideCoachProgress,
            usesNarrowGuideNavigation
              ? styles.sessionGuideCoachProgressNarrow
              : null
          ]}
          testID="practice-session-guide-coach-progress"
        >
          {unifiedCoachStep} of {totalCoachSteps}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={continueLabel}
          style={[
            styles.sessionGuideCoachNextButton,
            adaptiveLayout.usesSessionRail
              ? styles.sessionGuideCoachNextButtonRail
              : null,
            usesNarrowGuideNavigation
              ? styles.sessionGuideCoachActionNarrow
              : null
          ]}
          testID="practice-session-guide-start"
          onPress={onContinue}
        >
          <Text
            adjustsFontSizeToFit={adaptiveLayout.usesSessionRail || usesNarrowGuideNavigation}
            minimumFontScale={0.8}
            numberOfLines={usesNarrowGuideNavigation ? 2 : 1}
            style={[
              styles.sessionGuideStartButtonText,
              adaptiveLayout.usesSessionRail
                ? styles.sessionGuideStartButtonTextRail
                : null
            ]}
          >
            {continueLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const SESSION_GUIDE_DEMO_FEN = "7k/8/5KQ1/8/8/8/8/8 w - - 0 1";
const SESSION_GUIDE_DEMO_PIECES: Readonly<Record<number, {
  spriteColumn: number;
  spriteRow: number;
}>> = {
  7: { spriteColumn: 5, spriteRow: 1 },
  21: { spriteColumn: 5, spriteRow: 0 },
  22: { spriteColumn: 4, spriteRow: 0 }
};
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
const ARROW_DUEL_GUIDE_DEMO_CURRENT_PUZZLE: CurrentPuzzleState = {
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
const ARROW_DUEL_REPLY_GUIDE_DEMO_CURRENT_PUZZLE: CurrentPuzzleState = {
  ...ARROW_DUEL_GUIDE_DEMO_CURRENT_PUZZLE,
  currentFen: ARROW_DUEL_REPLY_GUIDE_DEMO_FEN,
  phase: "reply",
  puzzle: {
    ...ARROW_DUEL_GUIDE_DEMO_CURRENT_PUZZLE.puzzle,
    solutionMoves: ["g6e8", "h8h7"]
  }
};
const ARROW_DUEL_REPLY_GUIDE_DEMO_PIECES: typeof SESSION_GUIDE_DEMO_PIECES = {
  4: { spriteColumn: 4, spriteRow: 0 },
  7: { spriteColumn: 5, spriteRow: 1 },
  21: { spriteColumn: 5, spriteRow: 0 }
};

function SessionCoachmarkDemo({
  adaptiveLayout,
  boardSize,
  coachStep,
  guideNumber,
  mode,
  onExit,
  presentation
}: {
  adaptiveLayout: AdaptiveLayout;
  boardSize: number;
  coachStep: number;
  guideNumber: number;
  mode: "standard" | "arrow_duel";
  onExit: () => void;
  presentation: SprintSessionGuidePresentation;
}): React.JSX.Element {
  const isArrowDuel = mode === "arrow_duel";
  const isArrowDuelReplyStep = isArrowDuel
    && presentation.arrowDuelReplyOnboarding === "choice_then_reply"
    && coachStep === 1;
  const opponentReplySettingsHint = presentation.opponentReplySettingsHint
    ? "Optional · Turn off in Settings"
    : undefined;
  const [measuredLayouts, setMeasuredLayouts] = useState<
    Partial<Record<SessionGuideMeasuredLayoutKey, SessionGuideMeasuredLayout>>
  >({});
  const guideFrameRef = useRef<View>(null);
  const guideRowRef = useRef<View>(null);
  const slowTargetRef = useRef<View>(null);
  const timeoutTargetRef = useRef<View>(null);
  const unclearTargetRef = useRef<View>(null);
  const rememberMeasuredLayout = useCallback((
    key: SessionGuideMeasuredLayoutKey,
    next: SessionGuideMeasuredLayout
  ) => {
    setMeasuredLayouts((current) => sameSessionGuideMeasuredLayout(current[key], next)
      ? current
      : { ...current, [key]: next });
  }, []);
  const rememberCalloutLayout = useCallback((
    key: "slow-callout" | "timeout-callout" | "unclear-callout",
    event: LayoutChangeEvent
  ) => {
    const { height, width, x, y } = event.nativeEvent.layout;
    rememberMeasuredLayout(key, { height, width, x, y });
  }, [rememberMeasuredLayout]);
  const measureTargetInGuideFrame = useCallback((
    key: "slow-target" | "timeout-target" | "unclear-target",
    target: View | null
  ) => {
    const measurementFrame = adaptiveLayout.usesSessionRail
      ? guideRowRef.current
      : guideFrameRef.current;
    if (!measurementFrame || !target) {
      return;
    }
    target.measure((_x, _y, width, height, pageX, pageY) => {
      measurementFrame.measure((
        _frameX,
        _frameY,
        _frameWidth,
        _frameHeight,
        framePageX,
        framePageY
      ) => {
        rememberMeasuredLayout(key, {
          height,
          width,
          x: pageX - framePageX,
          y: pageY - framePageY
        });
      });
    });
  }, [adaptiveLayout.usesSessionRail, rememberMeasuredLayout]);
  const boardSquareSize = boardSize / 8;
  const currentPuzzle = isArrowDuel
    ? isArrowDuelReplyStep
      ? ARROW_DUEL_REPLY_GUIDE_DEMO_CURRENT_PUZZLE
      : ARROW_DUEL_GUIDE_DEMO_CURRENT_PUZZLE
    : SESSION_GUIDE_DEMO_CURRENT_PUZZLE;
  const demoPieces = isArrowDuelReplyStep
    ? ARROW_DUEL_REPLY_GUIDE_DEMO_PIECES
    : SESSION_GUIDE_DEMO_PIECES;
  const guideState: SprintState = {
    bestStreak: 0,
    config: {
      ...defaultSprintConfig(mode),
      maxMistakes: presentation.maxMistakes,
      targetCorrect: presentation.targetCorrect,
      ...(presentation.focusedRun
        ? {
            maxAttempts: presentation.maxAttempts ?? presentation.targetCorrect,
            ratingPolicy: "unrated" as const,
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
  const timingPhase: SessionTimingState["phase"] = !isArrowDuel && coachStep === 1
    ? "slow"
    : !isArrowDuel && coachStep === 2
      ? "timed_out"
      : "normal";
  const elapsedSeconds = isArrowDuel
    ? 12
    : coachStep === 1
      ? 40
      : coachStep === 2
        ? 60
        : coachStep === 3
          ? 24
          : 0;
  const callout = sessionGuideCallout(
    mode,
    coachStep,
    presentation.focusedRun === true,
    presentation.arrowDuelReplyChallenge === true,
    presentation.arrowDuelReplyOnboarding === "choice_then_reply",
    presentation.opponentReplySettingsHint === true
  );
  const optionalSettingsCopy = isArrowDuelReplyStep && opponentReplySettingsHint
    ? ` ${ARROW_DUEL_OPTIONAL_SETTINGS_COPY}`
    : "";
  const calloutUsesBoard = adaptiveLayout.usesSessionRail
    && !isArrowDuel
    && (coachStep === 1 || coachStep === 3);
  const measuredCallout = callout.id === "slow"
    ? measuredLayouts["slow-callout"]
    : callout.id === "timeout"
      ? measuredLayouts["timeout-callout"]
      : callout.id === "unclear"
        ? measuredLayouts["unclear-callout"]
        : undefined;
  const fallbackRailTarget = callout.id === "slow"
    ? {
        height: 0,
        width: 0,
        x: boardSize
          + adaptiveLayout.sessionRailGap
          + adaptiveLayout.sessionRailWidth / 2,
        y: boardSize * 0.58
      }
    : callout.id === "unclear"
      ? {
          height: 72,
          width: adaptiveLayout.sessionRailWidth,
          x: boardSize + adaptiveLayout.sessionRailGap,
          y: boardSize - 82
        }
      : undefined;
  const measuredRailTarget = callout.id === "slow"
    ? measuredLayouts["slow-target"] ?? fallbackRailTarget
    : callout.id === "unclear"
      ? measuredLayouts["unclear-target"] ?? fallbackRailTarget
      : undefined;
  const effectiveCalloutHeight = measuredCallout?.height
    ?? (callout.id === "slow" ? 98 : callout.id === "unclear" ? 82 : undefined);
  const measuredConnectorGeometry = calloutUsesBoard
    && effectiveCalloutHeight
    && measuredRailTarget
    ? buildSessionGuideRailConnectorGeometry({
        boardSize,
        calloutHeight: effectiveCalloutHeight,
        target: measuredRailTarget
      })
    : undefined;
  const portraitSlowCalloutTop = !adaptiveLayout.usesSessionRail
    && callout.id === "slow"
    && measuredCallout
    && measuredLayouts["slow-target"]
    ? buildPortraitGuideCalloutTop({
        calloutHeight: measuredCallout.height,
        target: measuredLayouts["slow-target"]
      })
    : undefined;
  const portraitTimeoutGeometry = !adaptiveLayout.usesSessionRail
    && callout.id === "timeout"
    && measuredCallout
    && measuredLayouts["timeout-target"]
    ? buildPortraitTimeoutGuideGeometry({
        boardTop: measuredLayouts["timeout-target"].y,
        calloutHeight: measuredCallout.height
      })
    : undefined;
  const portraitTimeoutPointerReach = portraitTimeoutGeometry?.pointerReach ?? 12;
  const arrowDuelLandscapeGeometry = isArrowDuel && adaptiveLayout.usesSessionRail
    ? buildArrowDuelLandscapeGuideGeometry(boardSize)
    : undefined;
  const portraitArrowDuelCalloutWidth = isArrowDuelReplyStep
    ? Math.min(
        Math.max(
          adaptiveLayout.boardSize,
          Math.min(280, Math.max(0, adaptiveLayout.contentWidth - 32))
        ),
        640
      )
    : adaptiveLayout.boardSize;
  const landscapeAlignment = adaptiveLayout.usesSessionRail
    ? buildSessionGuideLandscapeAlignment({
        boardSize,
        sessionRailGap: adaptiveLayout.sessionRailGap,
        sessionRailWidth: adaptiveLayout.sessionRailWidth
      })
    : undefined;
  const calloutPlacement = adaptiveLayout.usesSessionRail
    ? calloutUsesBoard
      ? {
          left: "50%" as const,
          top: measuredConnectorGeometry?.calloutTop ?? (coachStep === 1 ? 108 : 146),
          transform: [{
            translateX: landscapeAlignment?.boardCalloutTranslateX ?? 0
          }],
          width: Math.max(0, boardSize - 24)
        }
      : isArrowDuel
        ? {
            left: "50%" as const,
            top: arrowDuelLandscapeGeometry?.calloutTop
              ?? Math.round(boardSize * 0.58),
            transform: [{
              translateX: landscapeAlignment?.boardCalloutTranslateX ?? 0
            }],
            width: Math.max(0, boardSize - 24)
          }
      : {
        left: "50%" as const,
        top: coachStep === 0
          ? 112
          : coachStep === 1
            ? 220
            : coachStep === 2
              ? 122
              : 156,
        transform: [{
          translateX: landscapeAlignment?.railTranslateX ?? 0
        }],
        width: adaptiveLayout.sessionRailWidth
      }
    : {
        ...(isArrowDuel
          ? isArrowDuelReplyStep
            ? {
                left: "50%" as const,
                position: "absolute" as const,
                top: Math.round(boardSize * 0.4 + boardSquareSize),
                transform: [{
                  translateX: -portraitArrowDuelCalloutWidth / 2
                }],
                width: portraitArrowDuelCalloutWidth
              }
            : {
                alignSelf: "center" as const,
                marginTop: 18,
                position: "relative" as const,
                width: portraitArrowDuelCalloutWidth
              }
          : {
              left: 0,
              right: 0,
              top: coachStep === 0
            ? 113
            : coachStep === 1
              ? portraitSlowCalloutTop ?? boardSize + 71
              : coachStep === 2
                ? portraitTimeoutGeometry?.calloutTop ?? 82
                : boardSize + 150
            })
      };
  const measuredConnectorWidth = measuredConnectorGeometry?.connectorWidth;
  const measuredConnectorDrop = measuredConnectorGeometry?.connectorDrop ?? 0;
  const portraitUnclearPointerLeft = !adaptiveLayout.usesSessionRail
    && callout.id === "unclear"
    && measuredCallout
    && measuredLayouts["unclear-target"]
    ? buildPortraitGuidePointerLeft({
        calloutWidth: measuredCallout.width,
        target: measuredLayouts["unclear-target"]
      })
    : undefined;
  const coachPointer = calloutUsesBoard
    ? "→"
    : adaptiveLayout.usesSessionRail && coachStep === 2
    ? "←"
    : isArrowDuel || coachStep === 0 || (adaptiveLayout.usesSessionRail && coachStep === 1)
      ? "↑"
      : "↓";
  const pointerPlacement = coachPointer === "↓"
    ? "bottom"
    : coachPointer === "←"
      ? "left"
      : coachPointer === "→"
        ? "right"
      : "top";
  const pointerColor = callout.tone === "warning"
    ? "#D97706"
    : callout.tone === "danger"
      ? "#DC2626"
      : "#2563EB";
  const usesPortraitTimeoutPointer = !adaptiveLayout.usesSessionRail
    && callout.id === "timeout";
  const pointerTestId = `practice-session-guide-coach-pointer-${callout.id}-${pointerPlacement}`;
  const pointerNode = isArrowDuel
    && adaptiveLayout.usesSessionRail
    && arrowDuelLandscapeGeometry ? (
    <View
      accessibilityElementsHidden
      style={[
        styles.sessionGuideArrowDuelTargetConnector,
        {
          height: arrowDuelLandscapeGeometry.connectorHeight,
          left: arrowDuelLandscapeGeometry.connectorLeft,
          top: -arrowDuelLandscapeGeometry.connectorHeight,
          width: 10
        }
      ]}
      testID={pointerTestId}
    >
      <View
        style={styles.sessionGuideArrowDuelTargetConnectorVertical}
        testID={`${pointerTestId}-vertical`}
      />
      <View
        style={styles.sessionGuideArrowDuelTargetConnectorHead}
        testID={`${pointerTestId}-head`}
      />
    </View>
  ) : pointerPlacement === "right" && measuredConnectorWidth && measuredConnectorDrop > 0 ? (
    <View
      accessibilityElementsHidden
      style={[
        styles.sessionGuideCoachTargetRoute,
        {
          height: measuredConnectorDrop,
          right: -measuredConnectorWidth,
          top: measuredConnectorGeometry?.connectorTop ?? "50%",
          width: measuredConnectorWidth
        }
      ]}
      testID={pointerTestId}
    >
      <View
        style={[
          styles.sessionGuideCoachTargetRouteHorizontal,
          callout.tone === "warning"
            ? styles.sessionGuideCoachTargetConnectorWarning
            : null,
          callout.tone === "danger"
            ? styles.sessionGuideCoachTargetConnectorDanger
            : null
        ]}
        testID={`practice-session-guide-coach-pointer-${callout.id}-${pointerPlacement}-horizontal`}
      />
      <View
        style={[
          styles.sessionGuideCoachTargetRouteVertical,
          { height: measuredConnectorDrop },
          callout.tone === "warning"
            ? styles.sessionGuideCoachTargetConnectorWarning
            : null,
          callout.tone === "danger"
            ? styles.sessionGuideCoachTargetConnectorDanger
            : null
        ]}
        testID={`practice-session-guide-coach-pointer-${callout.id}-${pointerPlacement}-vertical`}
      />
      <View
        style={[
          styles.sessionGuideCoachTargetArrowHead,
          styles.sessionGuideCoachTargetRouteHead,
          { top: measuredConnectorDrop - 6 },
          { borderLeftColor: pointerColor }
        ]}
        testID={`${pointerTestId}-head`}
      />
    </View>
  ) : pointerPlacement === "right" && measuredConnectorWidth ? (
    <View
      accessibilityElementsHidden
      style={[
        styles.sessionGuideCoachTargetConnector,
        {
          right: -measuredConnectorWidth,
          top: measuredConnectorGeometry?.connectorTop ?? "50%",
          width: measuredConnectorWidth
        },
        callout.tone === "warning" ? styles.sessionGuideCoachTargetConnectorWarning : null,
        callout.tone === "danger" ? styles.sessionGuideCoachTargetConnectorDanger : null
      ]}
      testID={pointerTestId}
    >
      <View
        style={[
          styles.sessionGuideCoachTargetArrowHead,
          styles.sessionGuideCoachTargetConnectorHead,
          { borderLeftColor: pointerColor }
        ]}
        testID={`${pointerTestId}-head`}
      />
    </View>
  ) : pointerPlacement === "bottom" ? (
    <View
      accessibilityElementsHidden
      style={[
        styles.sessionGuideCoachPointerBottomShape,
        usesPortraitTimeoutPointer
          ? {
              bottom: -portraitTimeoutPointerReach,
              height: portraitTimeoutPointerReach
            }
          : null,
        callout.id === "unclear" && !adaptiveLayout.usesSessionRail
          ? {
              left: portraitUnclearPointerLeft ?? "76%"
            }
          : styles.sessionGuideCoachPointerBottomCentered
      ]}
      testID={pointerTestId}
    >
      <View
        style={[
          styles.sessionGuideCoachPointerBottomLine,
          { backgroundColor: pointerColor }
        ]}
        testID={`${pointerTestId}-line`}
      />
      <View
        style={[
          styles.sessionGuideCoachPointerBottomHead,
          { borderTopColor: pointerColor }
        ]}
        testID={`${pointerTestId}-head`}
      />
    </View>
  ) : (
    <Text
      accessibilityElementsHidden
      style={[
        styles.sessionGuideCoachPointer,
        pointerPlacement === "top" ? styles.sessionGuideCoachPointerTop : null,
        pointerPlacement === "left" ? styles.sessionGuideCoachPointerLeft : null,
        pointerPlacement === "right" ? styles.sessionGuideCoachPointerRight : null,
        isArrowDuel && pointerPlacement === "top"
          ? {
              left: Math.round(
                (adaptiveLayout.usesSessionRail
                  ? 0
                  : (portraitArrowDuelCalloutWidth - boardSize) / 2)
                  + boardSize * 0.79
              ),
              right: undefined,
              width: 24
            }
          : null,
        callout.tone === "warning" ? styles.sessionGuideCoachPointerWarning : null,
        callout.tone === "danger" ? styles.sessionGuideCoachPointerDanger : null
      ]}
      testID={pointerTestId}
    >
      {coachPointer}
    </Text>
  );
  const calloutNode = (
    <View
      style={[
        styles.sessionGuideCoachCallout,
        callout.tone === "warning" ? styles.sessionGuideCoachCalloutWarning : null,
        callout.tone === "danger" ? styles.sessionGuideCoachCalloutDanger : null,
        calloutPlacement
      ]}
      testID={isArrowDuel
        ? "practice-arrow-duel-guide-coach"
        : `practice-session-guide-coach-${callout.id}`}
      onLayout={callout.id === "slow"
        ? (event) => rememberCalloutLayout("slow-callout", event)
        : callout.id === "timeout"
          ? (event) => rememberCalloutLayout("timeout-callout", event)
        : callout.id === "unclear"
          ? (event) => rememberCalloutLayout("unclear-callout", event)
          : undefined}
    >
      {pointerPlacement !== "bottom" ? pointerNode : null}
      <View
        style={styles.sessionGuideCoachCopy}
        testID={`practice-session-guide-coach-copy-${callout.id}`}
      >
        <Text
          style={[
            styles.sessionGuideCoachBadge,
            callout.tone === "warning" ? styles.sessionGuideCoachBadgeWarning : null,
            callout.tone === "danger" ? styles.sessionGuideCoachBadgeDanger : null
          ]}
        >
          {callout.badge}
        </Text>
        <Text style={styles.sessionGuideInfoTitle}>{callout.title}</Text>
        <Text style={styles.sessionGuideInfoText}>{callout.detail}</Text>
        {isArrowDuelReplyStep && opponentReplySettingsHint ? (
          <Text
            style={styles.sessionGuideOptionalSettingsNotice}
            testID="practice-session-guide-optional-settings-notice"
          >
            <Text>This extra challenge is </Text>
            <Text
              style={styles.sessionGuideOptionalSettingsLabel}
              testID="practice-session-guide-optional-settings-label"
            >
              optional
            </Text>
            <Text> — turn it off in Settings.</Text>
          </Text>
        ) : null}
      </View>
      {pointerPlacement === "bottom" ? pointerNode : null}
    </View>
  );

  return (
    <View
      accessibilityLabel={`Guide ${guideNumber}. ${callout.title}. ${callout.detail}${optionalSettingsCopy}`}
      ref={guideFrameRef}
      style={styles.sessionGuideCoachFrame}
      testID={isArrowDuel
        ? "practice-arrow-duel-guide-timing-demo"
        : "practice-session-guide-timing-demo"}
    >
      {!adaptiveLayout.usesSessionRail ? (
        <>
          <View
            style={styles.sessionGuideCoachLayer}
            testID="practice-session-guide-metrics"
          >
            <SessionStatusBar
              closeAccessibilityLabel="Exit guide"
              confirmAbandon={false}
              dimmedExceptClose={isArrowDuel || coachStep !== 0}
              mode={mode}
              state={guideState}
              timerText={presentation.durationLabel}
              onClose={onExit}
              onConfirmAbandonChange={() => undefined}
              onPause={() => undefined}
            />
          </View>
          <View
            style={[
              styles.practicePromptStack,
              styles.sessionGuideCoachPrompt,
              styles.sessionGuideCoachDimmed,
              { width: boardSize }
            ]}
            testID="practice-session-guide-prompt"
          >
            {isArrowDuelReplyStep && currentPuzzle.kind === "arrow_duel" ? (
              <ArrowDuelReplyChallengePrompt
                currentPuzzle={currentPuzzle}
                explicitReplySideCopy
                frameHeight={adaptiveLayout.promptFrameHeight}
                hideSideGlyph={boardSize < 240}
                kingPieceSize={kingGlyphSizeForBoard(boardSize)}
                phase="reply"
                promptSide="b"
                replyReady
                replySeconds={10}
                rootTestID="practice-prompt"
                settingsHint={opponentReplySettingsHint}
                testIDPrefix="practice-arrow-duel-guide"
              />
            ) : (
              <PracticePrompt
                currentPuzzle={currentPuzzle}
                frameHeight={adaptiveLayout.promptFrameHeight}
                kingPieceSize={kingGlyphSizeForBoard(boardSize)}
                mode={mode}
              />
            )}
          </View>
        </>
      ) : null}

      <View
        ref={guideRowRef}
        style={adaptiveLayout.usesSessionRail
          ? [
              styles.activeSessionAdaptiveLayout,
              {
                gap: adaptiveLayout.sessionRailGap,
                width: adaptiveLayout.sessionPackedRowWidth
              }
            ]
          : styles.activeSessionStack}
        testID={adaptiveLayout.usesSessionRail
          ? "active-session-adaptive-layout"
          : "stacked-session-layout"}
      >
        <View
          style={adaptiveLayout.usesSessionRail
            ? [styles.activeSessionBoardLane, { width: boardSize }]
            : styles.boardWrapper}
          testID={adaptiveLayout.usesSessionRail ? "active-session-board-lane" : undefined}
        >
          <View
            accessible
            accessibilityLabel={isArrowDuel
              ? isArrowDuelReplyStep
                ? "Fixed example Arrow Duel reply position, Black to move after the other move, not interactive"
                : "Fixed example Arrow Duel puzzle, White to move, two candidate arrows, not interactive"
              : "Fixed example chess puzzle, White to move, not interactive"}
            accessibilityRole="image"
            ref={!isArrowDuel && !adaptiveLayout.usesSessionRail
              ? timeoutTargetRef
              : undefined}
            style={[
              styles.boardSurface,
              styles.sessionGuideCoachBoardSurface,
              styles.sessionGuideCoachLayer,
              isArrowDuel || coachStep === 2 ? null : styles.sessionGuideCoachDimmed,
              { height: boardSize, width: boardSize }
            ]}
            testID={isArrowDuel
              ? "practice-arrow-duel-guide-demo-board"
              : "practice-session-guide-demo-board"}
            onLayout={!isArrowDuel && !adaptiveLayout.usesSessionRail
              ? () => measureTargetInGuideFrame(
                  "timeout-target",
                  timeoutTargetRef.current
                )
              : undefined}
          >
            <View
              style={[
                styles.sessionGuideStaticBoardSquares,
                { height: boardSize, width: boardSize }
              ]}
            >
              {Array.from({ length: 64 }, (_, index) => {
                const piece = demoPieces[index];
                return (
                  <View
                    key={index}
                    style={[
                      styles.sessionGuideStaticBoardSquare,
                      {
                        height: boardSquareSize,
                        width: boardSquareSize
                      },
                      (Math.floor(index / 8) + index % 8) % 2 === 0
                        ? styles.sessionGuideStaticBoardSquareLight
                        : styles.sessionGuideStaticBoardSquareDark
                    ]}
                  >
                    {piece ? (
                      <View
                        style={[
                          styles.sessionGuideStaticPieceViewport,
                          {
                            height: boardSquareSize,
                            width: boardSquareSize
                          }
                        ]}
                      >
                        <Image
                          accessible={false}
                          accessibilityIgnoresInvertColors
                          resizeMode="stretch"
                          source={CHESS_PIECE_SPRITE}
                          style={[
                            styles.sessionGuideStaticPieceSprite,
                            {
                              height: boardSquareSize * 2,
                              left: -boardSquareSize * piece.spriteColumn,
                              top: -boardSquareSize * piece.spriteRow,
                              width: boardSquareSize * 6
                            }
                          ]}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
            <BoardCoordinateOverlay
              boardSize={boardSize}
              flipped={false}
            />
            <BoardInputBlocker />
            {isArrowDuel && !isArrowDuelReplyStep && currentPuzzle.kind === "arrow_duel" ? (
              <ArrowCandidateOverlay
                boardSize={boardSize}
                candidates={currentPuzzle.candidates}
                flipped={false}
                testID="practice-arrow-duel-guide-candidates"
              />
            ) : null}
            {isArrowDuelReplyStep ? (
              <LastMoveOverlay
                boardSize={boardSize}
                flipped={false}
                move={{ from: "g6", to: "e8" }}
                overlayTestID="practice-arrow-duel-guide-reply-last-move"
              />
            ) : null}
            {!isArrowDuel && coachStep === 2 ? (
              <View
                accessibilityRole="alert"
                style={styles.puzzleTimeoutOverlay}
                testID="practice-session-guide-timeout-overlay"
              >
                <Text style={styles.puzzleTimeoutOverlayTitle}>Timed out</Text>
                <Text style={styles.puzzleTimeoutOverlayDetail}>Added to Review</Text>
              </View>
            ) : null}
          </View>
          {isArrowDuel && !adaptiveLayout.usesSessionRail ? calloutNode : null}
          {!adaptiveLayout.usesSessionRail ? (
            <View
              style={[styles.sessionBoardDetails, { width: boardSize }]}
              testID="session-board-details"
            >
              <View
                ref={slowTargetRef}
                style={[
                  styles.sessionGuideCoachTimerTarget,
                  styles.sessionGuideCoachLayer,
                  !isArrowDuel && coachStep === 1 ? null : styles.sessionGuideCoachDimmed
                ]}
                testID={isArrowDuel
                  ? "practice-arrow-duel-guide-demo-timer"
                  : "practice-session-guide-demo-timer"}
                onLayout={!isArrowDuel
                  ? () => measureTargetInGuideFrame("slow-target", slowTargetRef.current)
                  : undefined}
              >
                <PuzzleTimingIndicator
                  elapsedSeconds={elapsedSeconds}
                  phase={timingPhase}
                  timeoutSeconds={60}
                />
              </View>
              <View
                style={styles.sessionGuideCoachDimmed}
                testID="practice-session-guide-score"
              >
                <SessionScoreStrip
                  compact={adaptiveLayout.usesSessionRail}
                  state={guideState}
                />
              </View>
            </View>
          ) : null}
        </View>

        {!isArrowDuel && !adaptiveLayout.usesSessionRail && coachStep === 3 ? (
          <View
            style={[
              styles.activeSessionBottomFeedback,
              styles.sessionGuideCoachLayer,
              { width: adaptiveLayout.boardSize }
            ]}
            testID="practice-session-guide-demo-unclear"
          >
            <UnclearAttemptPrompt
              marked={false}
              question="Was the previous puzzle clear?"
              onToggle={() => undefined}
              onTargetLayout={() => measureTargetInGuideFrame(
                "unclear-target",
                unclearTargetRef.current
              )}
              targetRef={unclearTargetRef}
            />
          </View>
        ) : null}

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
            testID="active-session-control-rail"
          >
            <View
              style={[
                styles.activeSessionControlRail,
                styles.sessionGuideControlRail,
                {
                  minHeight: boardSize,
                  width: adaptiveLayout.sessionRailWidth
                }
              ]}
              testID="active-session-control-rail-content"
            >
              <View
                style={styles.sessionGuideCoachLayer}
                testID="practice-session-guide-metrics"
              >
                <SessionStatusBar
                  closeAccessibilityLabel="Exit guide"
                  compactMetrics
                  confirmAbandon={false}
                  dimmedExceptClose={isArrowDuel || coachStep !== 0}
                  mode={mode}
                  state={guideState}
                  timerText={presentation.durationLabel}
                  onClose={onExit}
                  onConfirmAbandonChange={() => undefined}
                  onPause={() => undefined}
                />
              </View>
              <View
                style={[
                  styles.practicePromptStack,
                  styles.sessionGuideCoachPrompt,
                  styles.sessionGuideCoachDimmed,
                  { width: adaptiveLayout.sessionRailWidth }
                ]}
                testID="practice-session-guide-prompt"
              >
                {isArrowDuelReplyStep && currentPuzzle.kind === "arrow_duel" ? (
                  <ArrowDuelReplyChallengePrompt
                    currentPuzzle={currentPuzzle}
                    explicitReplySideCopy
                    frameHeight={adaptiveLayout.promptFrameHeight}
                    hideSideGlyph={adaptiveLayout.sessionRailWidth < 240}
                    kingPieceSize={kingGlyphSizeForBoard(boardSize)}
                    phase="reply"
                    promptSide="b"
                    replyReady
                    replySeconds={10}
                    rootTestID="practice-prompt"
                    settingsHint={opponentReplySettingsHint}
                    testIDPrefix="practice-arrow-duel-guide"
                  />
                ) : (
                  <PracticePrompt
                    currentPuzzle={currentPuzzle}
                    frameHeight={adaptiveLayout.promptFrameHeight}
                    kingPieceSize={kingGlyphSizeForBoard(boardSize)}
                    mode={mode}
                  />
                )}
              </View>
              <View
                ref={slowTargetRef}
                style={[
                  styles.sessionGuideCoachTimerTarget,
                  styles.sessionGuideCoachLayer,
                  !isArrowDuel && coachStep === 1 ? null : styles.sessionGuideCoachDimmed
                ]}
                testID={isArrowDuel
                  ? "practice-arrow-duel-guide-demo-timer"
                  : "practice-session-guide-demo-timer"}
                onLayout={!isArrowDuel
                  ? () => measureTargetInGuideFrame("slow-target", slowTargetRef.current)
                  : undefined}
              >
                <PuzzleTimingIndicator
                  elapsedSeconds={elapsedSeconds}
                  phase={timingPhase}
                  timeoutSeconds={60}
                />
              </View>
              <View
                style={styles.sessionGuideCoachDimmed}
                testID="practice-session-guide-score"
              >
                <SessionScoreStrip compact state={guideState} />
              </View>
              {!isArrowDuel && coachStep === 3 ? (
                <View
                  style={[
                    styles.activeSessionBottomFeedback,
                    styles.activeSessionRailBottomFeedback,
                    styles.sessionGuideCoachLayer,
                    styles.sessionGuideRailBottomFeedback,
                    { width: adaptiveLayout.sessionRailWidth }
                  ]}
                  testID="practice-session-guide-demo-unclear"
                >
                  <UnclearAttemptPrompt
                    marked={false}
                    question="Was the previous puzzle clear?"
                    onToggle={() => undefined}
                    onTargetLayout={() => measureTargetInGuideFrame(
                      "unclear-target",
                      unclearTargetRef.current
                    )}
                    targetArea="prompt"
                    targetRef={unclearTargetRef}
                  />
                </View>
              ) : null}
            </View>
          </ScrollView>
        ) : null}
      </View>

      {!isArrowDuel || adaptiveLayout.usesSessionRail ? calloutNode : null}
    </View>
  );
}

function PracticeRunCard({
  active,
  canMoveDown,
  canMoveUp,
  committedDropSettling,
  directRunEditing,
  dragging,
  dropPreviewOffsetY,
  dropTargetPosition,
  dropTarget,
  editing,
  nativeRunReorderScrollController,
  onIntent,
  onCardElement,
  onDragEnd,
  onDragStart,
  onNativeDragMove,
  onNativeLayout,
  onWebDragMove,
  onWebDrop,
  onDrop,
  onKeyboardReorder,
  run
}: {
  active: boolean;
  canMoveDown: boolean;
  canMoveUp: boolean;
  committedDropSettling: boolean;
  directRunEditing: boolean;
  dragging: boolean;
  dropPreviewOffsetY: number;
  dropTargetPosition: RunDropTargetPosition | null;
  dropTarget: boolean;
  editing: boolean;
  nativeRunReorderScrollController: NativeRunReorderScrollController;
  onIntent: PracticeRunManagementPresentation["onIntent"];
  onCardElement: (runId: string, element: WebRunElement | null) => void;
  onDragEnd: () => void;
  onDragStart: (runId: string) => void;
  onNativeDragMove: (runId: string, translationY: number) => void;
  onNativeLayout: (runId: string, layout: NativeRunLayout) => void;
  onWebDragMove: (runId: string, pointerY: number) => void;
  onWebDrop: () => void;
  onDrop: () => boolean;
  onKeyboardReorder: (runId: string, direction: "up" | "down") => void;
  run: PracticeRunPresentation;
}): React.JSX.Element {
  const details = run.kind === "custom"
    ? `${run.themes.map(customThemeLabel).join(" + ")} · ${formatSprintTimingLabel({
        ...defaultSprintConfig(run.mode),
        durationSeconds: run.durationSeconds,
        perPuzzleSeconds: run.perPuzzleSeconds
      })}`
    : run.kind === "arrow_duel"
      ? "Choose between two candidate moves"
      : "Find the best move";

  return (
    <RunCardDropSurface
      draggable={editing}
      dragging={dragging}
      committedDropSettling={committedDropSettling}
      dropPreviewOffsetY={dropPreviewOffsetY}
      dropTargetPosition={dropTargetPosition}
      dropTarget={dropTarget}
      nativeRunReorderScrollController={nativeRunReorderScrollController}
      runId={run.id}
      runName={run.name}
      style={[
        styles.practiceModeCard,
        styles.managedRunCard,
        active && !editing ? styles.practiceModeCardActive : null,
        active && !editing ? styles.managedRunCardActive : null,
        editing ? styles.runCardEditing : null,
        dragging ? styles.runCardDragging : null
      ]}
      testID={`practice-run-${safeTestId(run.id)}`}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      onElementChange={onCardElement}
      onNativeDragMove={onNativeDragMove}
      onNativeLayout={onNativeLayout}
      onWebDragMove={onWebDragMove}
      onWebDrop={onWebDrop}
      onDrop={onDrop}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active && !editing }}
        accessibilityLabel={editing
          ? directRunEditing ? `Edit ${run.name}` : `Edit ${run.name} rating`
          : `Select ${run.name}, rating ${run.elo}, ${details}`}
        style={styles.practiceModeSelectArea}
        testID={`practice-run-select-${safeTestId(run.id)}`}
        onPress={() => presentationRunPress(editing, run.id, onIntent)}
      >
        <View style={[styles.practiceModeIcon, active && !editing ? styles.practiceModeIconActive : null]}>
          <PracticeModeGlyph
            mode={run.mode === "arrow_duel" ? "arrow_duel" : "standard"}
            testIDPrefix={`practice-run-${safeTestId(run.id)}-glyph`}
          />
        </View>
        <View style={styles.practiceModeCopy}>
          <Text
            ellipsizeMode="tail"
            numberOfLines={1}
            style={styles.practiceModeTitle}
            testID={`practice-run-name-${safeTestId(run.id)}`}
          >
            {run.name}
          </Text>
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.practiceModeDescription}>{details}</Text>
        </View>
      </Pressable>
      <View style={[styles.practiceModeMeta, editing ? styles.runEditingMeta : null]}>
        <Text
          style={styles.practiceModeRating}
          testID={run.kind === "standard"
            ? "practice-mode-standard-rating"
            : run.kind === "arrow_duel"
              ? "practice-mode-arrow-duel-rating"
              : undefined}
        >
          {run.elo}
        </Text>
        {editing ? (
          <View style={styles.runEditActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move ${run.name} up`}
              accessibilityState={{ disabled: !canMoveUp }}
              disabled={!canMoveUp}
              style={[styles.runIconButton, styles.runReorderButton, !canMoveUp ? styles.disabledButton : null]}
              testID={`practice-run-move-up-${safeTestId(run.id)}`}
              onPress={() => onKeyboardReorder(run.id, "up")}
            >
              <ChevronGlyph direction="up" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move ${run.name} down`}
              accessibilityState={{ disabled: !canMoveDown }}
              disabled={!canMoveDown}
              style={[styles.runIconButton, styles.runReorderButton, !canMoveDown ? styles.disabledButton : null]}
              testID={`practice-run-move-down-${safeTestId(run.id)}`}
              onPress={() => onKeyboardReorder(run.id, "down")}
            >
              <ChevronGlyph direction="down" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={directRunEditing ? `Edit ${run.name}` : `Edit ${run.name} rating`}
              style={styles.runEditButton}
              testID={`practice-run-edit-${safeTestId(run.id)}`}
              onPress={() => onIntent({ type: "edit-run", runId: run.id })}
            >
              <Text style={styles.runEditButtonText}>{directRunEditing ? "Edit" : "Edit rating"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${run.name} from Home`}
              style={[styles.runIconButton, styles.runRemoveButton]}
              testID={`practice-run-remove-${safeTestId(run.id)}`}
              onPress={() => onIntent({ type: "remove-run", runId: run.id })}
            >
              <Text style={styles.runRemoveButtonText}>−</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </RunCardDropSurface>
  );
}

type RunDropTargetPosition = "after" | "before";

type WebRunRect = {
  height: number;
  top: number;
};

type WebScrollRect = WebRunRect & {
  bottom: number;
};

type NativeRunLayout = {
  height: number;
  y: number;
};

type NativeRunReorderMeasureElement = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void
  ) => void;
};

type NativeRunReorderScrollSnapshot = {
  contentHeight: number;
  offsetY: number;
  reorderWindowBottom: number;
  reorderWindowTop: number;
  viewportHeight: number;
  windowBottom: number;
  windowTop: number;
};

type NativeRunReorderScrollController = {
  getSnapshot: () => NativeRunReorderScrollSnapshot | null;
  refreshBounds: (reorderElement?: NativeRunReorderMeasureElement | null) => void;
  scrollBy: (deltaY: number) => number;
};

type RunReorderItemLayout = {
  height: number;
  top: number;
};

type RunReorderPreview = {
  insertionOutlineTop: number;
  offsets: Record<string, number>;
  targetPosition: RunDropTargetPosition;
  targetRunId: string;
};

function buildRunReorderPreview({
  layouts,
  originCenter,
  pointerCenter,
  runId,
  runs,
  sourceHeight,
  sourceStride
}: {
  layouts: ReadonlyMap<string, RunReorderItemLayout>;
  originCenter: number;
  pointerCenter: number;
  runId: string;
  runs: readonly PracticeRunPresentation[];
  sourceHeight: number;
  sourceStride: number;
}): RunReorderPreview | null {
  const runIndex = runs.findIndex((run) => run.id === runId);
  if (runIndex < 0 || pointerCenter === originCenter || sourceHeight <= 0 || sourceStride <= 0) {
    return null;
  }
  const movingDown = pointerCenter > originCenter;
  const target = runs
    .map((run, index) => ({ index, layout: layouts.get(run.id), run }))
    .filter((entry): entry is {
      index: number;
      layout: RunReorderItemLayout;
      run: PracticeRunPresentation;
    } => entry.run.id !== runId && entry.layout !== undefined)
    .filter((entry) => movingDown ? entry.index > runIndex : entry.index < runIndex)
    .sort((left, right) => {
      const leftDistance = Math.abs(left.layout.top + left.layout.height / 2 - pointerCenter);
      const rightDistance = Math.abs(right.layout.top + right.layout.height / 2 - pointerCenter);
      return leftDistance - rightDistance;
    })[0];
  if (!target) {
    return null;
  }
  const targetCenter = target.layout.top + target.layout.height / 2;
  if (
    Math.abs(pointerCenter - originCenter)
    <= Math.abs(pointerCenter - targetCenter)
  ) {
    return null;
  }

  const previewOffset = movingDown ? -sourceStride : sourceStride;
  const firstShiftedIndex = Math.min(runIndex, target.index);
  const lastShiftedIndex = Math.max(runIndex, target.index);
  const offsets: Record<string, number> = {};
  runs.forEach((run, index) => {
    if (index >= firstShiftedIndex && index <= lastShiftedIndex && index !== runIndex) {
      offsets[run.id] = previewOffset;
    }
  });
  const targetPreviewOffset = offsets[target.run.id] ?? 0;
  const insertionGap = Math.max(8, sourceStride - target.layout.height);
  return {
    insertionOutlineTop: movingDown
      ? target.layout.top + targetPreviewOffset + target.layout.height + insertionGap
      : target.layout.top + targetPreviewOffset - insertionGap - sourceHeight,
    offsets,
    targetPosition: movingDown ? "after" : "before",
    targetRunId: target.run.id
  };
}

type WebRunAnimation = {
  cancel: () => void;
  oncancel: (() => void) | null;
  onfinish: (() => void) | null;
};

type WebRunElement = {
  animate?: (
    keyframes: readonly { transform: string }[],
    options: { duration: number; easing: string }
  ) => WebRunAnimation;
  closest?: (selectors: string) => unknown;
  dataset: Record<string, string | undefined>;
  getAnimations?: () => WebRunAnimation[];
  getBoundingClientRect: () => WebRunRect;
};

type WebRunStyle = React.CSSProperties & {
  paddingHorizontal?: React.CSSProperties["paddingLeft"];
  paddingVertical?: React.CSSProperties["paddingTop"];
};

type WebPointerCaptureElement = {
  closest?: (selectors: string) => unknown;
  querySelector?: (selectors: string) => { blur?: () => void } | null;
  releasePointerCapture?: (pointerId: number) => void;
  setPointerCapture?: (pointerId: number) => void;
};

type WebScrollableElement = {
  clientHeight: number;
  getBoundingClientRect: () => WebScrollRect;
  scrollHeight: number;
  scrollTop: number;
};

type WebTouchMoveEvent = {
  cancelable: boolean;
  preventDefault: () => void;
  touches: readonly { clientY: number }[];
};

type WebTouchMoveElement = {
  addEventListener: (
    type: "touchmove",
    listener: (event: WebTouchMoveEvent) => void,
    options: { passive: false }
  ) => void;
  removeEventListener: (
    type: "touchmove",
    listener: (event: WebTouchMoveEvent) => void
  ) => void;
};

function RunCardDropSurface({
  children,
  committedDropSettling,
  draggable,
  dragging,
  dropPreviewOffsetY,
  dropTargetPosition,
  dropTarget,
  nativeRunReorderScrollController,
  runId,
  runName,
  style,
  testID,
  onDragEnd,
  onDragStart,
  onElementChange,
  onNativeDragMove,
  onNativeLayout,
  onWebDragMove,
  onWebDrop,
  onDrop
}: {
  children: React.ReactNode;
  committedDropSettling: boolean;
  draggable: boolean;
  dragging: boolean;
  dropPreviewOffsetY: number;
  dropTargetPosition: RunDropTargetPosition | null;
  dropTarget: boolean;
  nativeRunReorderScrollController: NativeRunReorderScrollController;
  runId: string;
  runName: string;
  style: React.ComponentProps<typeof View>["style"];
  testID: string;
  onDragEnd: () => void;
  onDragStart: (runId: string) => void;
  onElementChange: (runId: string, element: WebRunElement | null) => void;
  onNativeDragMove: (runId: string, translationY: number) => void;
  onNativeLayout: (runId: string, layout: NativeRunLayout) => void;
  onWebDragMove: (runId: string, pointerY: number) => void;
  onWebDrop: () => void;
  onDrop: () => boolean;
}): React.JSX.Element {
  const nativeDragOffset = useRef(new Animated.Value(0)).current;
  const nativeDropPreviewOffset = useRef(new Animated.Value(dropPreviewOffsetY)).current;
  const nativeDragActiveRef = useRef(false);
  const nativePickupActiveRef = useRef(false);
  const nativeDragCompensationRef = useRef(0);
  const nativeDragDyRef = useRef(0);
  const nativeDragArmedRef = useRef(false);
  const nativeDragArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeAutoScrollSpeedRef = useRef(0);
  const nativeAutoScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [webDragOffsetY, setWebDragOffsetY] = useState(0);
  const webDragActiveRef = useRef(false);
  const webDragArmedRef = useRef(false);
  const webDragArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webPointerRef = useRef<{
    latestClientY: number;
    originClientY: number;
    originScrollTop: number;
    pointerId: number;
    scrollElement: WebScrollableElement | null;
  } | null>(null);
  const webAutoScrollSpeedRef = useRef(0);
  const webAutoScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const webElementRef = useRef<WebTouchMoveElement | null>(null);
  const webSuppressClickRef = useRef(false);
  const disarmNativeDrag = useCallback((): void => {
    if (nativeDragArmTimerRef.current) {
      clearTimeout(nativeDragArmTimerRef.current);
      nativeDragArmTimerRef.current = null;
    }
    nativeDragArmedRef.current = false;
  }, []);
  const stopNativeAutoScroll = useCallback((): void => {
    if (nativeAutoScrollTimerRef.current) {
      clearInterval(nativeAutoScrollTimerRef.current);
      nativeAutoScrollTimerRef.current = null;
    }
    nativeAutoScrollSpeedRef.current = 0;
  }, []);
  const armNativeDrag = useCallback((): void => {
    disarmNativeDrag();
    if (!draggable) {
      return;
    }
    nativeDragArmTimerRef.current = setTimeout(() => {
      nativeDragArmTimerRef.current = null;
      nativeDragArmedRef.current = true;
      if (!nativePickupActiveRef.current) {
        nativePickupActiveRef.current = true;
        nativeDragCompensationRef.current = 0;
        nativeDragDyRef.current = 0;
        nativeDragOffset.stopAnimation();
        nativeRunReorderScrollController.refreshBounds();
        onDragStart(runId);
      }
    }, 180);
  }, [
    disarmNativeDrag,
    draggable,
    nativeDragOffset,
    nativeRunReorderScrollController,
    onDragStart,
    runId
  ]);
  const disarmWebDrag = useCallback((): void => {
    if (webDragArmTimerRef.current) {
      clearTimeout(webDragArmTimerRef.current);
      webDragArmTimerRef.current = null;
    }
    webDragArmedRef.current = false;
  }, []);
  const stopWebAutoScroll = useCallback((): void => {
    if (webAutoScrollTimerRef.current) {
      clearInterval(webAutoScrollTimerRef.current);
      webAutoScrollTimerRef.current = null;
    }
    webAutoScrollSpeedRef.current = 0;
  }, []);
  const applyWebDragPosition = useCallback((clientY: number): void => {
    const pointer = webPointerRef.current;
    if (!pointer || !webDragActiveRef.current) {
      return;
    }
    pointer.latestClientY = clientY;
    const scrollDelta = pointer.scrollElement
      ? pointer.scrollElement.scrollTop - pointer.originScrollTop
      : 0;
    setWebDragOffsetY(clientY - pointer.originClientY + scrollDelta);
    onWebDragMove(runId, clientY);
  }, [onWebDragMove, runId]);
  const refreshWebAutoScroll = useCallback((clientY: number): void => {
    const pointer = webPointerRef.current;
    const scrollElement = pointer?.scrollElement;
    if (!pointer || !scrollElement || !webDragActiveRef.current) {
      stopWebAutoScroll();
      return;
    }
    pointer.latestClientY = clientY;
    const scrollRect = scrollElement.getBoundingClientRect();
    const edgeSize = Math.min(64, scrollRect.height / 4);
    const distanceFromTop = clientY - scrollRect.top;
    const distanceFromBottom = scrollRect.bottom - clientY;
    const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
    let speed = 0;
    if (distanceFromTop < edgeSize && scrollElement.scrollTop > 0) {
      speed = -Math.max(2, 14 * (1 - Math.max(0, distanceFromTop) / edgeSize));
    } else if (distanceFromBottom < edgeSize && scrollElement.scrollTop < maxScrollTop) {
      speed = Math.max(2, 14 * (1 - Math.max(0, distanceFromBottom) / edgeSize));
    }
    webAutoScrollSpeedRef.current = speed;
    if (speed === 0) {
      stopWebAutoScroll();
      return;
    }
    if (webAutoScrollTimerRef.current) {
      return;
    }
    webAutoScrollTimerRef.current = setInterval(() => {
      const activePointer = webPointerRef.current;
      const activeScrollElement = activePointer?.scrollElement;
      if (!activePointer || !activeScrollElement || !webDragActiveRef.current) {
        stopWebAutoScroll();
        return;
      }
      const activeMaxScrollTop = Math.max(
        0,
        activeScrollElement.scrollHeight - activeScrollElement.clientHeight
      );
      const nextScrollTop = Math.max(
        0,
        Math.min(activeMaxScrollTop, activeScrollElement.scrollTop + webAutoScrollSpeedRef.current)
      );
      if (nextScrollTop === activeScrollElement.scrollTop) {
        stopWebAutoScroll();
        return;
      }
      activeScrollElement.scrollTop = nextScrollTop;
      applyWebDragPosition(activePointer.latestClientY);
    }, 16);
  }, [applyWebDragPosition, stopWebAutoScroll]);
  const resetWebPointer = useCallback((): void => {
    stopWebAutoScroll();
    disarmWebDrag();
    webDragActiveRef.current = false;
    webPointerRef.current = null;
    setWebDragOffsetY(0);
  }, [disarmWebDrag, stopWebAutoScroll]);
  const beginWebDrag = useCallback((element: WebPointerCaptureElement): void => {
    if (webDragActiveRef.current) {
      return;
    }
    webDragActiveRef.current = true;
    webDragArmedRef.current = true;
    webSuppressClickRef.current = true;
    element.querySelector?.(":focus")?.blur?.();
    onDragStart(runId);
  }, [onDragStart, runId]);
  const handleWebTouchMove = useCallback((event: WebTouchMoveEvent): void => {
    const touch = event.touches[0];
    if (!touch || !webDragActiveRef.current) {
      return;
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    applyWebDragPosition(touch.clientY);
    refreshWebAutoScroll(touch.clientY);
  }, [applyWebDragPosition, refreshWebAutoScroll]);
  const registerWebElement = useCallback((rawElement: unknown): void => {
    const element = rawElement as (WebTouchMoveElement & WebRunElement) | null;
    const previousElement = webElementRef.current;
    if (previousElement && previousElement !== element) {
      previousElement.removeEventListener("touchmove", handleWebTouchMove);
    }
    if (element && previousElement !== element) {
      element.addEventListener("touchmove", handleWebTouchMove, { passive: false });
    }
    webElementRef.current = element;
    onElementChange(runId, element as unknown as WebRunElement | null);
  }, [handleWebTouchMove, onElementChange, runId]);
  useLayoutEffect(() => {
    if (Platform.OS === "web") {
      return;
    }
    if (committedDropSettling) {
      nativeDragOffset.stopAnimation();
      nativeDragOffset.setValue(0);
      nativeDragCompensationRef.current = 0;
      nativeDragDyRef.current = 0;
    }
    nativeDropPreviewOffset.stopAnimation();
    if (committedDropSettling && dropPreviewOffsetY === 0) {
      nativeDropPreviewOffset.setValue(0);
      return;
    }
    Animated.spring(nativeDropPreviewOffset, {
      toValue: dropPreviewOffsetY,
      damping: 24,
      stiffness: 260,
      mass: 0.8,
      useNativeDriver: true
    }).start();
  }, [
    committedDropSettling,
    dropPreviewOffsetY,
    nativeDragOffset,
    nativeDropPreviewOffset
  ]);
  useEffect(() => () => {
    disarmNativeDrag();
    disarmWebDrag();
    stopNativeAutoScroll();
    stopWebAutoScroll();
  }, [disarmNativeDrag, disarmWebDrag, stopNativeAutoScroll, stopWebAutoScroll]);
  const nativeDragHandlersRef = useRef({
    runId,
    onDragEnd,
    onDragStart,
    onDrop,
    onNativeDragMove
  });
  nativeDragHandlersRef.current = {
    runId,
    onDragEnd,
    onDragStart,
    onDrop,
    onNativeDragMove
  };
  const cancelHeldNativePickup = useCallback((): void => {
    disarmNativeDrag();
    if (!nativePickupActiveRef.current || nativeDragActiveRef.current) {
      return;
    }
    nativePickupActiveRef.current = false;
    stopNativeAutoScroll();
    nativeDragHandlersRef.current.onDragEnd();
  }, [disarmNativeDrag, stopNativeAutoScroll]);
  const applyNativeDragPosition = useCallback((translationY: number): void => {
    nativeDragDyRef.current = translationY;
    const effectiveTranslationY = translationY + nativeDragCompensationRef.current;
    nativeDragOffset.setValue(effectiveTranslationY);
    const handlers = nativeDragHandlersRef.current;
    handlers.onNativeDragMove(handlers.runId, effectiveTranslationY);
  }, [nativeDragOffset]);
  const refreshNativeAutoScroll = useCallback((pageY: number): void => {
    const snapshot = nativeRunReorderScrollController.getSnapshot();
    if (!snapshot || !nativeDragActiveRef.current) {
      stopNativeAutoScroll();
      return;
    }
    const visibleReorderTop = Math.max(snapshot.windowTop, snapshot.reorderWindowTop);
    const visibleReorderBottom = Math.min(snapshot.windowBottom, snapshot.reorderWindowBottom);
    const edgeSize = Math.min(24, snapshot.viewportHeight / 4);
    const distanceFromTop = pageY - visibleReorderTop;
    const distanceFromBottom = visibleReorderBottom - pageY;
    const maxOffsetY = Math.max(0, snapshot.contentHeight - snapshot.viewportHeight);
    const canScrollUp = snapshot.reorderWindowTop < snapshot.windowTop && snapshot.offsetY > 0;
    const canScrollDown = snapshot.reorderWindowBottom > snapshot.windowBottom
      && snapshot.offsetY < maxOffsetY;
    let speed = 0;
    if (distanceFromTop < edgeSize && canScrollUp) {
      speed = -Math.max(2, 14 * (1 - Math.max(0, distanceFromTop) / edgeSize));
    } else if (distanceFromBottom < edgeSize && canScrollDown) {
      speed = Math.max(2, 14 * (1 - Math.max(0, distanceFromBottom) / edgeSize));
    }
    nativeAutoScrollSpeedRef.current = speed;
    if (speed === 0) {
      stopNativeAutoScroll();
      return;
    }
    if (nativeAutoScrollTimerRef.current) {
      return;
    }
    nativeAutoScrollTimerRef.current = setInterval(() => {
      if (!nativeDragActiveRef.current) {
        stopNativeAutoScroll();
        return;
      }
      const appliedDeltaY = nativeRunReorderScrollController.scrollBy(
        nativeAutoScrollSpeedRef.current
      );
      if (appliedDeltaY === 0) {
        stopNativeAutoScroll();
        return;
      }
      nativeDragCompensationRef.current += appliedDeltaY;
      applyNativeDragPosition(nativeDragDyRef.current);
    }, 16);
  }, [applyNativeDragPosition, nativeRunReorderScrollController, stopNativeAutoScroll]);
  const nativePanResponder = useMemo(() => {
    const shouldClaimNativeDrag = (_event: unknown, gesture: PanResponderGestureState): boolean => {
      const movedPastThreshold = Math.abs(gesture.dy) > 6 || Math.abs(gesture.dx) > 6;
      if (!nativeDragArmedRef.current) {
        if (movedPastThreshold) {
          disarmNativeDrag();
        }
        return false;
      }
      return Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
    };
    return PanResponder.create({
    onMoveShouldSetPanResponder: shouldClaimNativeDrag,
    onMoveShouldSetPanResponderCapture: shouldClaimNativeDrag,
    onPanResponderGrant: () => {
      const handlers = nativeDragHandlersRef.current;
      nativeDragActiveRef.current = true;
      nativeDragCompensationRef.current = 0;
      nativeDragDyRef.current = 0;
      nativeDragOffset.stopAnimation();
      nativeRunReorderScrollController.refreshBounds();
      if (!nativePickupActiveRef.current) {
        nativePickupActiveRef.current = true;
        handlers.onDragStart(handlers.runId);
      }
    },
    onPanResponderMove: (event, gesture: PanResponderGestureState) => {
      applyNativeDragPosition(gesture.dy);
      refreshNativeAutoScroll(event.nativeEvent.pageY);
    },
    onPanResponderRelease: () => {
      disarmNativeDrag();
      stopNativeAutoScroll();
      nativeDragActiveRef.current = false;
      nativePickupActiveRef.current = false;
      const committed = nativeDragHandlersRef.current.onDrop();
      if (committed) {
        return;
      }
      Animated.spring(nativeDragOffset, {
        toValue: 0,
        damping: 24,
        stiffness: 260,
        mass: 0.8,
        useNativeDriver: true
      }).start(() => {
        nativeDragCompensationRef.current = 0;
        nativeDragDyRef.current = 0;
      });
    },
    onPanResponderTerminate: () => {
      disarmNativeDrag();
      stopNativeAutoScroll();
      nativeDragActiveRef.current = false;
      nativePickupActiveRef.current = false;
      nativeDragHandlersRef.current.onDragEnd();
      Animated.spring(nativeDragOffset, {
        toValue: 0,
        damping: 24,
        stiffness: 260,
        mass: 0.8,
        useNativeDriver: true
      }).start(() => {
        nativeDragCompensationRef.current = 0;
        nativeDragDyRef.current = 0;
      });
    },
    onPanResponderTerminationRequest: () => false
    });
  }, [
    applyNativeDragPosition,
    disarmNativeDrag,
    nativeDragOffset,
    nativeRunReorderScrollController,
    refreshNativeAutoScroll,
    stopNativeAutoScroll
  ]);

  const handleNativeLayout = (event: LayoutChangeEvent): void => {
    const layout = event.nativeEvent.layout;
    onNativeLayout(runId, { y: layout.y, height: layout.height });
  };

  if (Platform.OS === "web") {
    const flattenedStyle = StyleSheet.flatten(style) as WebRunStyle;
    const {
      paddingHorizontal,
      paddingVertical,
      ...webStyle
    } = flattenedStyle;
    const releasePointerCapture = (
      element: WebPointerCaptureElement,
      pointerId: number
    ): void => {
      try {
        element.releasePointerCapture?.(pointerId);
      } catch {
        // Synthetic Storybook pointer events are not registered as browser-owned pointers.
      }
    };
    return (
      <div
        aria-grabbed={draggable ? dragging : undefined}
        aria-dropeffect={dropTarget ? "move" : undefined}
        data-browser-drag-ghost={draggable ? "suppressed" : undefined}
        data-drag-mechanism={draggable ? "pointer" : undefined}
        data-drag-state={dragging ? "picked-up" : undefined}
        data-drop-position={dropTargetPosition ?? undefined}
        data-drop-preview-offset={dropPreviewOffsetY || undefined}
        data-pickup-haptic={dragging ? "medium" : undefined}
        data-testid={testID}
        draggable={false}
        ref={registerWebElement}
        style={{
          ...webStyle,
          boxShadow: dragging
            ? "0 12px 28px rgba(15, 23, 42, 0.20)"
            : "0 1px 3px rgba(15, 23, 42, 0.08)",
          boxSizing: "border-box",
          cursor: draggable ? (dragging ? "grabbing" : "grab") : "default",
          display: "flex",
          paddingBottom: webStyle.paddingBottom ?? paddingVertical,
          paddingLeft: webStyle.paddingLeft ?? paddingHorizontal,
          paddingRight: webStyle.paddingRight ?? paddingHorizontal,
          paddingTop: webStyle.paddingTop ?? paddingVertical,
          position: "relative",
          touchAction: draggable ? "pan-y" : undefined,
          transform: dragging
            ? `translate3d(10px, ${webDragOffsetY - 2}px, 0) scale(1.015)`
            : dropPreviewOffsetY
              ? `translate3d(0, ${dropPreviewOffsetY}px, 0)`
              : undefined,
          transition: webDragActiveRef.current
            ? "box-shadow 140ms ease"
            : "transform 160ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 140ms ease",
          userSelect: draggable ? "none" : undefined,
          WebkitTouchCallout: draggable ? "none" : undefined,
          WebkitUserSelect: draggable ? "none" : undefined,
          willChange: draggable ? "transform" : undefined,
          zIndex: dragging ? 20 : dropTarget ? 10 : undefined
        }}
        title={draggable ? `Drag ${runName} to reorder` : undefined}
        onContextMenu={(event) => {
          if (draggable) {
            event.preventDefault();
          }
        }}
        onDragStart={(event) => {
          event.preventDefault();
        }}
        onClickCapture={(event) => {
          if (!webSuppressClickRef.current) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          webSuppressClickRef.current = false;
        }}
        onPointerDown={(event) => {
          const blockedControl = (event.target as unknown as WebRunElement).closest?.(
            '[data-testid^="practice-run-move-"], [data-testid^="practice-run-edit-"], [data-testid^="practice-run-remove-"]'
          );
          if (!draggable || blockedControl || event.button !== 0) {
            return;
          }
          resetWebPointer();
          const currentTarget = event.currentTarget as unknown as WebPointerCaptureElement;
          const scrollElement = currentTarget.closest?.(
            '[data-testid="practice-main-scroll"]'
          ) as WebScrollableElement | null | undefined;
          webPointerRef.current = {
            latestClientY: event.clientY,
            originClientY: event.clientY,
            originScrollTop: scrollElement?.scrollTop ?? 0,
            pointerId: event.pointerId,
            scrollElement: scrollElement ?? null
          };
          webDragArmedRef.current = event.pointerType !== "touch";
          if (event.pointerType === "touch") {
            const pointerId = event.pointerId;
            webDragArmTimerRef.current = setTimeout(() => {
              webDragArmTimerRef.current = null;
              if (webPointerRef.current?.pointerId === pointerId) {
                beginWebDrag(currentTarget);
              }
            }, 180);
          }
          try {
            currentTarget.setPointerCapture?.(event.pointerId);
          } catch {
            // Storybook play functions dispatch synthetic pointer events.
          }
        }}
        onPointerMove={(event) => {
          const pointer = webPointerRef.current;
          if (!pointer || pointer.pointerId !== event.pointerId) {
            return;
          }
          const deltaY = event.clientY - pointer.originClientY;
          if (!webDragActiveRef.current) {
            if (Math.abs(deltaY) <= 6) {
              return;
            }
            if (!webDragArmedRef.current) {
              releasePointerCapture(
                event.currentTarget as unknown as WebPointerCaptureElement,
                event.pointerId
              );
              resetWebPointer();
              return;
            }
            beginWebDrag(event.currentTarget as unknown as WebPointerCaptureElement);
          }
          event.preventDefault();
          applyWebDragPosition(event.clientY);
          refreshWebAutoScroll(event.clientY);
        }}
        onPointerUp={(event) => {
          const pointer = webPointerRef.current;
          if (!pointer || pointer.pointerId !== event.pointerId) {
            return;
          }
          const wasDragging = webDragActiveRef.current;
          releasePointerCapture(
            event.currentTarget as unknown as WebPointerCaptureElement,
            event.pointerId
          );
          if (wasDragging) {
            event.preventDefault();
            (event.currentTarget as unknown as WebPointerCaptureElement)
              .querySelector?.(":focus")?.blur?.();
            onWebDrop();
            setTimeout(() => {
              webSuppressClickRef.current = false;
            }, 0);
          }
          resetWebPointer();
        }}
        onPointerCancel={(event) => {
          const pointer = webPointerRef.current;
          if (!pointer || pointer.pointerId !== event.pointerId) {
            return;
          }
          releasePointerCapture(
            event.currentTarget as unknown as WebPointerCaptureElement,
            event.pointerId
          );
          if (webDragActiveRef.current) {
            onDragEnd();
          }
          resetWebPointer();
        }}
      >
        {children}
      </div>
    );
  }
  return (
    <Animated.View
      {...(draggable ? nativePanResponder.panHandlers : {})}
      accessibilityHint={draggable ? "Touch and hold, then drag vertically to reorder this run. Arrow buttons are also available." : undefined}
      onLayout={handleNativeLayout}
      onTouchCancel={cancelHeldNativePickup}
      onTouchEnd={cancelHeldNativePickup}
      onTouchStart={armNativeDrag}
      style={[
        style,
        // Fabric may still hold a synchronous native-driver transform override
        // when Edit Runs closes, so keep the React prop type stable at zero.
        {
          transform: [
            { translateY: draggable && !committedDropSettling ? nativeDragOffset : 0 },
            { translateY: draggable && !committedDropSettling ? nativeDropPreviewOffset : 0 },
            { translateX: draggable && dragging ? 10 : 0 },
            { translateY: draggable && dragging ? -2 : 0 },
            { scale: draggable && dragging ? 1.015 : 1 }
          ]
        },
        dragging ? styles.runCardNativeDragging : null
      ]}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
}

function configureNativeRunLayoutAnimation(): void {
  if (Platform.OS === "web") {
    return;
  }
  LayoutAnimation.configureNext({
    duration: 220,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity
    },
    update: {
      type: LayoutAnimation.Types.easeInEaseOut
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity
    }
  });
}

function presentationRunPress(
  editing: boolean,
  runId: string,
  onIntent: PracticeRunManagementPresentation["onIntent"]
): void {
  onIntent(editing ? { type: "edit-run", runId } : { type: "select-run", runId });
}

function RunRemovalConfirmation({
  onIntent,
  run
}: {
  onIntent: PracticeRunManagementPresentation["onIntent"];
  run: PracticeRunPresentation | null;
}): React.JSX.Element | null {
  if (!run) {
    return null;
  }
  return (
    <View style={styles.runRemovalConfirmation} testID="practice-run-remove-confirmation">
      <View style={styles.runRemovalCopy}>
        <Text style={styles.listText}>Remove {run.name} from Home?</Text>
        <Text style={styles.helperText}>
          Its rating and history will be kept. You can restore this run later.
        </Text>
      </View>
      <View style={styles.runRemovalActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel run removal"
          style={styles.secondaryButton}
          testID="practice-run-remove-cancel"
          onPress={() => onIntent({ type: "dismiss-remove" })}
        >
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Confirm removing ${run.name} from Home`}
          style={styles.destructiveButton}
          testID="practice-run-remove-confirm"
          onPress={() => onIntent({ type: "confirm-remove" })}
        >
          <Text style={styles.destructiveButtonText}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PracticeRunEditor({
  arrowDuelOpponentReplyGlobalEnabled,
  arrowDuelReplyChallenge,
  presentation,
  showSprintRulesSummary,
  themeCatalogPresentation,
  timeoutCountsAsMistake
}: {
  arrowDuelOpponentReplyGlobalEnabled?: boolean;
  arrowDuelReplyChallenge?: {
    enabled: boolean;
    replySecondsError: string | null;
    replySecondsInput: string;
    onReplySecondsInputChange: (value: string) => void;
    onToggle: () => void;
  };
  presentation: PracticeRunManagementPresentation;
  showSprintRulesSummary: boolean;
  themeCatalogPresentation?: ThemeCatalogPresentation;
  timeoutCountsAsMistake: boolean;
}): React.JSX.Element | null {
  const draft = presentation.draft;
  if (!draft) {
    return null;
  }
  const isCustom = draft.kind === "custom";
  const isCreate = presentation.screen === "create";
  const directRunEditing = presentation.directRunEditing === true;
  const canEditName = (isCreate && isCustom) || (!isCreate && directRunEditing);
  const customMode = draft.mode === "arrow_duel" ? "arrow_duel" : "custom";
  const previousRows = presentation.previousConfigs?.slice(0, 5).map(({ config, rating }) => ({
    config,
    row: previousCustomConfigRowModel(config, rating)
  })) ?? [];
  const sprintRules = buildSprintConfig({
    durationSeconds: draft.durationSeconds,
    mode: draft.mode,
    perPuzzleSeconds: draft.perPuzzleSeconds
  });

  return (
    <View style={styles.customSetupPanel} testID="practice-run-editor">
      <SprintStartHeader
        actionLabel={isCreate ? "Add" : "Save"}
        closeAccessibilityLabel="Close run editor"
        closeTestID="practice-run-editor-close"
        headerTestID="practice-run-editor-header"
        startAccessibilityLabel={isCreate
          ? "Add run to Home"
          : directRunEditing ? `Save ${draft.name} run` : `Save ${draft.name} rating`}
        startDisabled={
          presentation.canSave === false
          || Boolean(arrowDuelReplyChallenge?.replySecondsError)
        }
        startTestID="practice-run-save"
        title={isCreate ? "New Run" : directRunEditing ? "Edit Run" : "Edit rating"}
        titleTestID="practice-run-editor-title"
        onClose={() => presentation.onIntent({ type: "cancel-edit" })}
        onStart={() => presentation.onIntent({ type: "save-run" })}
      />

      <View style={styles.runEditorIntro}>
        {!isCreate && !directRunEditing ? (
          <Text style={styles.runEditorRunName} testID="practice-run-editor-run-name">
            {draft.name}
          </Text>
        ) : null}
        <Text style={styles.helperText}>
          {isCreate
            ? "Saving adds this run to Home. It does not start a sprint."
            : directRunEditing
              ? "Change this Run's name, rating, and puzzle timing."
              : "Adjust the current rating. Run settings stay fixed."}
        </Text>
      </View>

      {isCreate && presentation.canSave === false ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.customEligibilityCard, styles.customEligibilityWarning]}
          testID="practice-run-availability-error"
        >
          <Text style={styles.sectionLabel}>No matching local puzzles</Text>
          <Text style={styles.helperText}>
            Choose different themes or settings before adding this Run to Home.
          </Text>
        </View>
      ) : null}

      {!isCreate && directRunEditing ? (
        <Text
          style={[styles.sectionLabel, styles.runEditorDetailsLabel]}
          testID="practice-run-details-section"
        >
          Run details
        </Text>
      ) : null}

      <View style={styles.customConfigCard} testID="practice-run-editor-fields">
        {canEditName ? (
          <View style={[styles.customConfigRow, styles.runNameRow]} testID="practice-run-name-row">
            <View style={styles.runNameCopy}>
              <Text style={styles.listText}>Name</Text>
              <Text style={styles.requiredFieldLabel}>Required · unique</Text>
            </View>
            <TextInput
              accessibilityLabel="Run name"
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={PRACTICE_RUN_NAME_MAX_LENGTH}
              placeholder="e.g. Tactics Focus"
              placeholderTextColor="#94A3B8"
              returnKeyType="done"
              style={[styles.runNameInput, presentation.nameError ? styles.runNameInputError : null]}
              submitBehavior="blurAndSubmit"
              testID="practice-run-name-input"
              value={draft.name}
              onChangeText={(name) => presentation.onIntent({ type: "change-name", name })}
            />
          </View>
        ) : isCreate ? (
          <CustomValueRow
            detail="Built-in run names stay fixed"
            label="Name"
            testID="practice-run-fixed-name"
            value={draft.name}
          />
        ) : null}

        {canEditName && presentation.nameError ? (
          <View
            accessibilityLiveRegion="polite"
            style={styles.runNameError}
            testID="practice-run-name-error"
          >
            <Text style={styles.runNameErrorText}>{presentation.nameError}</Text>
          </View>
        ) : null}

        {isCreate ? (
          <>
            {isCustom ? (
              <>
                <CustomModeChoiceRow
                  value={customMode}
                  testID="practice-run-mode-row"
                  onChange={(mode) => presentation.onIntent({ type: "change-mode", mode })}
                />
                {!themeCatalogPresentation ? (
                  <View style={styles.runThemeLabelRow}>
                    <Text style={styles.listText}>Themes</Text>
                    <Text style={styles.requiredFieldLabel}>Choose one or more</Text>
                  </View>
                ) : null}
                <CustomThemeChoiceRow
                  showDisclosure
                  selectedThemes={draft.themes}
                  themeCatalogPresentation={themeCatalogPresentation}
                  testID="practice-run-theme-row"
                  onChange={(theme) => presentation.onIntent({ type: "toggle-theme", theme })}
                />
                <CustomOptionRow
                  label="Duration"
                  value={formatDurationLabel(draft.durationSeconds)}
                  stepperTestID="practice-run-duration-stepper"
                  options={PRACTICE_RUN_DURATION_OPTIONS.map((option) => ({
                    value: option,
                    label: formatDurationLabel(option),
                    testID: `practice-run-duration-${option}`
                  }))}
                  selected={draft.durationSeconds as (typeof PRACTICE_RUN_DURATION_OPTIONS)[number]}
                  onChange={(durationSeconds) => presentation.onIntent({ type: "change-duration", durationSeconds })}
                />
                <CustomOptionRow
                  label="Time per puzzle"
                  value={`${draft.perPuzzleSeconds} sec`}
                  stepperTestID="practice-run-per-puzzle-stepper"
                  options={PRACTICE_RUN_PER_PUZZLE_OPTIONS.map((option) => ({
                    value: option,
                    label: `${option}s`,
                    testID: `practice-run-per-puzzle-${option}`
                  }))}
                  selected={draft.perPuzzleSeconds as (typeof PRACTICE_RUN_PER_PUZZLE_OPTIONS)[number]}
                  onChange={(perPuzzleSeconds) => presentation.onIntent({ type: "change-per-puzzle", perPuzzleSeconds })}
                />
              </>
            ) : (
              <CustomValueRow
                label="Format"
                testID="practice-run-fixed-format"
                value={draft.kind === "arrow_duel" ? "Arrow Duel" : "Standard puzzles"}
              />
            )}

            <PracticeRunEloRow
              directEntry={directRunEditing}
              error={presentation.eloError ?? null}
              inputValue={presentation.eloInput ?? String(draft.elo)}
              isCreate
              value={draft.elo}
              onChange={(elo) => presentation.onIntent({ type: "change-elo", elo })}
              onInputChange={(value) => presentation.onIntent({ type: "change-elo-input", value })}
              onInputStep={(direction) => presentation.onIntent({ type: "step-elo-input", direction })}
            />
          </>
        ) : (
          <>
            {directRunEditing ? (
              <CustomValueRow
                detail="Cannot be changed after creation"
                label="Format"
                testID="practice-run-fixed-format"
                value={draft.mode === "arrow_duel"
                  ? "Arrow Duel"
                  : draft.kind === "standard" ? "Standard puzzles" : "Regular puzzles"}
              />
            ) : null}
            <PracticeRunEloRow
              directEntry={directRunEditing}
              error={presentation.eloError ?? null}
              inputValue={presentation.eloInput ?? String(draft.elo)}
              isCreate={false}
              value={draft.elo}
              onChange={(elo) => presentation.onIntent({ type: "change-elo", elo })}
              onInputChange={(value) => presentation.onIntent({ type: "change-elo-input", value })}
              onInputStep={(direction) => presentation.onIntent({ type: "step-elo-input", direction })}
            />
          </>
        )}
      </View>

      {showSprintRulesSummary ? (
        <SprintPassRulesSummary config={sprintRules} />
      ) : null}

      {(arrowDuelOpponentReplyGlobalEnabled === undefined
        ? isCreate || directRunEditing
        : !isCreate && directRunEditing && arrowDuelOpponentReplyGlobalEnabled)
        && draft.mode === "arrow_duel" && arrowDuelReplyChallenge ? (
        <ArrowDuelReplyChallengeSetting
          enabled={arrowDuelReplyChallenge.enabled}
          individualRunCopy={arrowDuelOpponentReplyGlobalEnabled !== undefined}
          replySecondsError={arrowDuelReplyChallenge.replySecondsError}
          replySecondsInput={arrowDuelReplyChallenge.replySecondsInput}
          onReplySecondsInputChange={arrowDuelReplyChallenge.onReplySecondsInputChange}
          onToggle={arrowDuelReplyChallenge.onToggle}
        />
      ) : null}

      {isCreate || directRunEditing ? (
        <PracticeRunTimingSettings
          perPuzzleSeconds={draft.perPuzzleSeconds}
          puzzleTiming={draft.puzzleTiming}
          timeoutCountsAsMistake={timeoutCountsAsMistake}
          onChange={(puzzleTiming) => presentation.onIntent({
            type: "change-puzzle-timing",
            puzzleTiming
          })}
        />
      ) : null}

      {isCreate && isCustom && previousRows.length > 0 ? (
        <View style={styles.previousConfigList} testID="custom-previous-configs">
          <Text style={styles.sectionLabel}>Previous configs</Text>
          {previousRows.map(({ config, row }) => (
            <PreviousCustomConfigRow
              key={config.id}
              config={row}
              onPress={() => presentation.onIntent({
                type: "prefill-previous-config",
                configId: config.id
              })}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ArrowDuelReplyChallengeSetting({
  enabled,
  individualRunCopy = false,
  replySecondsError,
  replySecondsInput,
  onReplySecondsInputChange,
  onToggle
}: {
  enabled: boolean;
  individualRunCopy?: boolean;
  replySecondsError: string | null;
  replySecondsInput: string;
  onReplySecondsInputChange: (value: string) => void;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.settingsSection} testID="practice-run-arrow-duel-reply-setting">
      <View style={styles.runTimingSectionCopy}>
        <Text style={styles.sectionLabel}>Arrow Duel</Text>
      </View>
      <View style={styles.customConfigCard}>
        <View style={styles.runTimingRow}>
          <View style={styles.runTimingRowCopy}>
            <Text style={styles.listText}>
              Find the opponent’s best reply
            </Text>
            <Text style={styles.helperText}>
              {individualRunCopy
                ? "After you choose the better arrow, we play the other move so you can find the opponent’s best reply."
                : "After you choose the better arrow, find the opponent’s best reply."}
            </Text>
            {individualRunCopy ? (
              <Text style={styles.helperText}>
                This setting only changes this Run. Turn it off to go straight to the next puzzle.
              </Text>
            ) : null}
          </View>
          <View style={styles.arrowDuelReplySettingControl}>
            <Text
              style={styles.arrowDuelReplySettingValue}
              testID="practice-run-arrow-duel-reply-value"
            >
              {enabled ? "On" : "Off"}
            </Text>
            <Pressable
              accessibilityLabel="Find the opponent’s best reply"
              accessibilityRole="switch"
              accessibilityState={{ checked: enabled }}
              accessibilityValue={{ text: enabled ? "On" : "Off" }}
              style={styles.runTimingToggle}
              testID="practice-run-arrow-duel-reply-toggle"
              onPress={onToggle}
            >
              <View style={[styles.historyToggleTrack, enabled ? styles.historyToggleTrackActive : null]}>
                <View style={[styles.historyToggleThumb, enabled ? styles.historyToggleThumbActive : null]} />
              </View>
            </Pressable>
          </View>
        </View>
        <View style={styles.runTimingRow} testID="practice-run-arrow-duel-reply-time-row">
          <View style={styles.runTimingRowCopy}>
            <Text style={styles.listText}>Time to find the reply</Text>
            <Text style={styles.helperText}>
              You’ll have {DEFAULT_OPPONENT_REPLY_SECONDS} seconds by default. Choose up to {OPPONENT_REPLY_MAX_SECONDS} seconds.
            </Text>
            <Text style={styles.helperText}>
              Your Sprint and puzzle timers pause while you find the reply.
            </Text>
            {individualRunCopy ? (
              <Text style={styles.helperText}>
                To turn this extra challenge off for every Run, go to Settings.
              </Text>
            ) : null}
            {replySecondsError ? (
              <Text
                accessibilityLiveRegion="polite"
                style={styles.runNameErrorText}
                testID="practice-run-arrow-duel-reply-seconds-error"
              >
                {replySecondsError}
              </Text>
            ) : null}
          </View>
          <View
            style={[
              styles.arrowDuelReplySecondsControl,
              !enabled ? styles.runTimingControlDisabled : null
            ]}
          >
            <View
              style={[
                styles.arrowDuelReplySecondsInputShell,
                replySecondsError ? styles.runEloInputShellError : null
              ]}
            >
              <TextInput
                accessibilityLabel="Time to find the opponent’s reply in seconds"
                accessibilityState={{ disabled: !enabled }}
                editable={enabled}
                inputMode="numeric"
                keyboardType="number-pad"
                maxLength={2}
                selectTextOnFocus
                style={styles.arrowDuelReplySecondsInput}
                testID="practice-run-arrow-duel-reply-seconds"
                value={replySecondsInput}
                onChangeText={onReplySecondsInputChange}
              />
            </View>
            <Text style={styles.arrowDuelReplySecondsUnit}>sec</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function SprintPassRulesSummary({
  config
}: {
  config: SprintConfig;
}): React.JSX.Element {
  return (
    <View
      accessibilityLabel={`Pass rules. Solve ${config.targetCorrect} before ${formatSprintDurationLabel(config.durationSeconds)} ends. Mistake ${config.maxMistakes} ends the Sprint. Wrong answers count as attempts, not solved puzzles.`}
      style={styles.sprintPassRulesCard}
      testID="practice-run-pass-rules"
    >
      <View style={styles.sprintPassRulesHeading}>
        <View>
          <Text style={styles.sectionLabel}>Pass rules</Text>
          <Text style={styles.sprintPassRulesHeadline}>
            Solve {config.targetCorrect} before {formatSprintDurationLabel(config.durationSeconds)} ends
          </Text>
        </View>
        <View style={styles.sprintPassRulesTarget}>
          <Text style={styles.sprintPassRulesTargetValue}>{config.targetCorrect}</Text>
          <Text style={styles.sprintPassRulesTargetLabel}>TO PASS</Text>
        </View>
      </View>
      <Text style={styles.helperText}>
        Wrong answers count as attempts, not solved puzzles. Mistake {config.maxMistakes} ends the Sprint.
      </Text>
      <Text style={styles.sprintPassRulesHint}>
        The goal updates with Duration and Time per puzzle.
      </Text>
    </View>
  );
}

function PracticeRunTimingSettings({
  onChange,
  perPuzzleSeconds,
  puzzleTiming,
  timeoutCountsAsMistake
}: {
  onChange: (puzzleTiming: {
    slowAfterSeconds: number | null;
    timeoutAfterSeconds: number | null;
  }) => void;
  perPuzzleSeconds: number;
  puzzleTiming: {
    slowAfterSeconds: number | null;
    timeoutAfterSeconds: number | null;
  } | undefined;
  timeoutCountsAsMistake: boolean;
}): React.JSX.Element {
  const editor = puzzleTimingEditorState(puzzleTiming, perPuzzleSeconds);
  const currentTiming = editor.policy;
  const warningEnabled = currentTiming.slowAfterSeconds !== null;
  const timeoutEnabled = currentTiming.timeoutAfterSeconds !== null;
  const warningSeconds = editor.slowDisplaySeconds;
  const timeoutSeconds = editor.timeoutDisplaySeconds;

  return (
    <View style={styles.settingsSection} testID="practice-run-puzzle-timing">
      <View style={styles.runTimingSectionCopy}>
        <Text style={styles.sectionLabel}>Puzzle timing</Text>
        <Text style={styles.helperText}>
          {`Typical time ${formatCompactDuration(perPuzzleSeconds)} · no rating impact`}
        </Text>
      </View>
      <View style={styles.customConfigCard} testID="practice-run-puzzle-timing-card">
        <RunTimingSettingRow
          detail="Turns the puzzle clock yellow. A correct answer after that is marked Unclear; play continues."
          enabled={warningEnabled}
          label="Slow warning"
          maximumSeconds={editor.slowMaximumSeconds}
          minimumSeconds={10}
          seconds={warningSeconds}
          testID="practice-run-slow-warning"
          onChange={(seconds) => onChange(updatePuzzleTimingFromEditor(
            currentTiming,
            perPuzzleSeconds,
            { type: "set-slow", seconds }
          ))}
          onToggle={() => onChange(updatePuzzleTimingFromEditor(
            currentTiming,
            perPuzzleSeconds,
            { type: "toggle-slow" }
          ))}
        />
        <RunTimingSettingRow
          detail={timeoutCountsAsMistake
            ? "Marks it Timed out, counts as a mistake, adds it to Review, and moves on."
            : "Marks Timed out and moves on."}
          enabled={timeoutEnabled}
          label="Puzzle timeout"
          maximumSeconds={180}
          minimumSeconds={editor.timeoutMinimumSeconds}
          seconds={timeoutSeconds}
          testID="practice-run-puzzle-timeout"
          onChange={(seconds) => onChange(updatePuzzleTimingFromEditor(
            currentTiming,
            perPuzzleSeconds,
            { type: "set-timeout", seconds }
          ))}
          onToggle={() => onChange(updatePuzzleTimingFromEditor(
            currentTiming,
            perPuzzleSeconds,
            { type: "toggle-timeout" }
          ))}
        />
      </View>
    </View>
  );
}

function RunTimingSettingRow({
  detail,
  enabled,
  label,
  maximumSeconds,
  minimumSeconds,
  seconds,
  testID,
  onChange,
  onToggle
}: {
  detail: string;
  enabled: boolean;
  label: string;
  maximumSeconds: number;
  minimumSeconds: number;
  seconds: number;
  testID: string;
  onChange: (seconds: number) => void;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.runTimingRow} testID={testID}>
      <View style={styles.runTimingRowCopy}>
        <Text style={styles.listText}>{label}</Text>
        <Text style={styles.helperText}>{detail}</Text>
      </View>
      <View style={styles.runTimingControls}>
        <View style={[styles.runTimingStepper, !enabled ? styles.runTimingControlDisabled : null]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${label.toLowerCase()}`}
            disabled={!enabled || seconds <= minimumSeconds}
            style={styles.runTimingStepButton}
            testID={`${testID}-decrease`}
            onPress={() => onChange(Math.max(minimumSeconds, seconds - 5))}
          >
            <Text style={styles.runTimingStepText}>−</Text>
          </Pressable>
          <Text style={styles.runTimingValue} testID={`${testID}-value`}>
            {formatCompactDuration(seconds)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Increase ${label.toLowerCase()}`}
            disabled={!enabled || seconds >= maximumSeconds}
            style={styles.runTimingStepButton}
            testID={`${testID}-increase`}
            onPress={() => onChange(Math.min(maximumSeconds, seconds + 5))}
          >
            <Text style={styles.runTimingStepText}>+</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={label}
          accessibilityState={{ checked: enabled }}
          accessibilityValue={{ text: enabled ? "On" : "Off" }}
          style={styles.runTimingToggle}
          testID={`${testID}-toggle`}
          onPress={onToggle}
        >
          <View style={[styles.historyToggleTrack, enabled ? styles.historyToggleTrackActive : null]}>
            <View style={[styles.historyToggleThumb, enabled ? styles.historyToggleThumbActive : null]} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

function PracticeRunEloRow({
  directEntry = false,
  error,
  inputValue,
  isCreate,
  onChange,
  onInputChange,
  onInputStep,
  value
}: {
  directEntry?: boolean;
  error?: string | null;
  inputValue?: string;
  isCreate: boolean;
  onChange: (elo: number) => void;
  onInputChange?: (value: string) => void;
  onInputStep?: (direction: -1 | 1) => void;
  value: number;
}): React.JSX.Element {
  if (directEntry) {
    const parsedInput = Number(inputValue);
    const stepValue = /^\d{1,4}$/.test(inputValue ?? "") && Number.isInteger(parsedInput)
      ? parsedInput
      : value;
    const canDecrease = Boolean(onInputStep) && stepValue > CUSTOM_INITIAL_RATING_MIN;
    const canIncrease = Boolean(onInputStep) && stepValue < CUSTOM_INITIAL_RATING_MAX;
    return (
      <>
        <View style={styles.customConfigRow} testID="practice-run-elo-row">
          <View style={styles.customChoiceCopy}>
            <Text style={styles.listText}>{isCreate ? "Starting rating" : "Current rating"}</Text>
            <Text style={styles.requiredFieldLabel}>
              {isCreate
                ? `Sets initial puzzle difficulty · ${CUSTOM_INITIAL_RATING_MIN}–${CUSTOM_INITIAL_RATING_MAX}`
                : `${CUSTOM_INITIAL_RATING_MIN}–${CUSTOM_INITIAL_RATING_MAX} · ±100 buttons`}
            </Text>
          </View>
          <View style={styles.runEloStepper} testID="practice-run-elo-stepper">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease run rating by 100"
              accessibilityState={{ disabled: !canDecrease }}
              disabled={!canDecrease}
              style={[styles.customStepperButton, !canDecrease ? styles.disabledButton : null]}
              testID="practice-run-elo-decrease"
              onPress={() => onInputStep?.(-1)}
            >
              <MinusGlyph />
            </Pressable>
            <View
              style={[styles.runEloInputShell, error ? styles.runEloInputShellError : null]}
              testID="practice-run-elo-input-shell"
            >
              <TextInput
                accessibilityLabel={isCreate ? "Starting rating" : "Current rating"}
                inputMode="numeric"
                keyboardType="number-pad"
                maxLength={4}
                selectTextOnFocus
                style={styles.runEloInput}
                testID="practice-run-elo-input"
                value={inputValue ?? String(value)}
                onChangeText={onInputChange}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase run rating by 100"
              accessibilityState={{ disabled: !canIncrease }}
              disabled={!canIncrease}
              style={[styles.customStepperButton, !canIncrease ? styles.disabledButton : null]}
              testID="practice-run-elo-increase"
              onPress={() => onInputStep?.(1)}
            >
              <PlusGlyph />
            </Pressable>
          </View>
        </View>
        {error ? (
          <View
            accessibilityLiveRegion="polite"
            style={styles.runNameError}
            testID="practice-run-elo-error"
          >
            <Text style={styles.runNameErrorText}>{error}</Text>
          </View>
        ) : null}
      </>
    );
  }
  const canDecrease = value > RATING_FLOOR;
  return (
    <View style={styles.customConfigRow} testID="practice-run-elo-row">
      <View style={styles.customChoiceCopy}>
        <Text style={styles.listText}>{isCreate ? "Starting rating" : "Current rating"}</Text>
        <Text style={styles.requiredFieldLabel}>
          {isCreate
            ? `Sets initial puzzle difficulty · minimum ${RATING_FLOOR}`
            : `Adjusts puzzle difficulty · minimum ${RATING_FLOOR}`}
        </Text>
      </View>
      <View style={styles.advancedRatingControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Decrease run rating"
          accessibilityState={{ disabled: !canDecrease }}
          disabled={!canDecrease}
          style={[styles.customStepperButton, !canDecrease ? styles.disabledButton : null]}
          testID="practice-run-elo-decrease"
          onPress={() => onChange(stepManualRating(value, -1))}
        >
          <MinusGlyph />
        </Pressable>
        <Text style={styles.settingsRowValue} testID="practice-run-elo-value">Rating {value}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Increase run rating"
          style={styles.customStepperButton}
          testID="practice-run-elo-increase"
          onPress={() => onChange(stepManualRating(value, 1))}
        >
          <PlusGlyph />
        </Pressable>
      </View>
    </View>
  );
}

function PracticeProgressCard({
  currentRating,
  mode,
  progress,
  ratingContextLabel
}: {
  currentRating: number;
  mode: SprintMode;
  progress: PracticeProgressSummary;
  ratingContextLabel?: string;
}): React.JSX.Element {
  const progressDelta = progress.correctThisWeek + progress.wrongThisWeek === 0
    ? "Start training"
    : `${progress.netThisWeek >= 0 ? "+" : ""}${progress.netThisWeek} net`;
  const progressTone = progress.netThisWeek < 0
    ? styles.progressDeltaNegative
    : progress.correctThisWeek + progress.wrongThisWeek > 0
      ? styles.progressDeltaPositive
      : styles.progressDeltaNeutral;
  const progressContext = progress.accuracyThisWeek === null
    ? "No attempts yet"
    : `${progress.accuracyThisWeek}% accuracy · ${progress.wrongThisWeek} ${progress.wrongThisWeek === 1 ? "mistake" : "mistakes"}`;
  const ratingDeltaLabel = progress.ratingDeltaThisWeek === null
    ? "No rating change"
    : `${progress.ratingDeltaThisWeek >= 0 ? "+" : ""}${progress.ratingDeltaThisWeek} this week`;
  const ratingDeltaTone = progress.ratingDeltaThisWeek === null
    ? styles.progressDeltaNeutral
    : progress.ratingDeltaThisWeek < 0
      ? styles.progressDeltaNegative
      : styles.progressDeltaPositive;

  return (
    <>
      <Text style={styles.sectionLabel}>Progress</Text>
      <View
        accessibilityLabel={`Progress summary, ${ratingContextLabel ?? modeLabel(mode)} rating ${currentRating}, ${ratingDeltaLabel}, this week ${progress.correctThisWeek}, ${progressDelta}, ${progressContext}`}
        style={styles.practiceProgressCard}
        testID="practice-progress-summary"
      >
        <View style={styles.progressMetric} testID="practice-progress-rating-metric">
          <Text style={styles.progressMetricLabel}>{ratingContextLabel ?? modeLabel(mode)} rating</Text>
          <Text style={styles.progressValue}>{currentRating}</Text>
          <Text testID="practice-progress-rating-delta" style={[styles.progressDelta, ratingDeltaTone]}>{ratingDeltaLabel}</Text>
        </View>
        <View
          style={[styles.practiceSummaryColumnGap, styles.progressDivider]}
          testID="practice-progress-divider"
        />
        <View style={styles.progressMetric} testID="practice-progress-weekly-metric">
          <Text style={styles.progressMetricLabel}>This Week</Text>
          <Text testID="practice-progress-weekly-solved" style={styles.progressValue}>{progress.correctThisWeek}</Text>
          <Text testID="practice-progress-weekly-delta" style={[styles.progressDelta, progressTone]}>{progressDelta}</Text>
          <Text testID="practice-progress-weekly-context" style={styles.progressContextText}>{progressContext}</Text>
        </View>
      </View>
    </>
  );
}

function PracticeNoRunProgressCard(): React.JSX.Element {
  return (
    <>
      <Text style={styles.sectionLabel}>Progress</Text>
      <View style={styles.runNoSelectionCard} testID="practice-progress-no-run">
        <Text style={styles.listText}>No run selected</Text>
        <Text style={styles.helperText}>Add or restore a run to see its current rating.</Text>
      </View>
    </>
  );
}

function ResumeSprintCard({
  onResume,
  sprint
}: {
  onResume: () => void;
  sprint: SprintState;
}): React.JSX.Element {
  const remaining = Math.max(0, sprint.config.targetCorrect - sprint.correctCount);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Resume ${modeLabel(sprint.config.mode)} sprint`}
      style={styles.resumeSprintCard}
      testID="practice-resume-card"
      onPress={onResume}
    >
      <View style={styles.practiceModeIcon}>
        <PracticeModeGlyph mode={sprint.config.mode} />
      </View>
      <View style={styles.resumeSprintCopy}>
        <Text style={styles.sectionLabel}>Resume sprint</Text>
        <Text style={styles.helperText}>
          {modeLabel(sprint.config.mode)} · {sprint.correctCount} solved · {remaining} left · {sprint.mistakeCount} mistakes
        </Text>
      </View>
      <Text style={styles.resumeSprintAction}>Resume</Text>
    </Pressable>
  );
}

function PausedSessionPanel({
  onAbandon,
  onResume,
  state
}: {
  onAbandon: () => void;
  onResume: () => void;
  state: SprintState;
}): React.JSX.Element {
  const remaining = Math.max(0, state.config.targetCorrect - state.correctCount);
  return (
    <View
      accessibilityLabel={`Paused ${modeLabel(state.config.mode)} sprint, ${state.correctCount} solved, ${remaining} left`}
      style={styles.pausedSessionPanel}
      testID="paused-session-panel"
    >
      <View style={styles.pausedSessionCopy}>
        <Text style={styles.sectionLabel}>Sprint paused</Text>
        <Text style={styles.helperText}>
          {modeLabel(state.config.mode)} · {state.correctCount} solved · {remaining} left · {state.mistakeCount} mistakes
        </Text>
      </View>
      <View style={styles.pausedSessionActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abandon paused sprint"
          testID="paused-session-abandon"
          style={styles.secondaryButton}
          onPress={onAbandon}
        >
          <Text style={styles.secondaryButtonText}>Abandon</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Resume paused sprint"
          testID="paused-session-resume"
          style={styles.primaryButton}
          onPress={onResume}
        >
          <Text style={styles.primaryButtonText}>Resume</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PracticeModeCard({
  active,
  item,
  onPress
}: {
  active: boolean;
  item: PracticeModeSummary;
  onPress: () => void;
}): React.JSX.Element {
  const label = modeLabel(item.mode);
  const detail = practiceModeDetailLabel(item);
  const ratingLabel = item.rating === undefined ? null : `Rating ${item.rating}`;
  const modeTestId = item.mode.replace("_", "-");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.mode === "custom"
        ? `Open Custom sprint setup, ${detail}`
        : `Select ${label} mode, ${detail}`}
      testID={`practice-mode-${modeTestId}`}
      style={[styles.practiceModeCard, active ? styles.practiceModeCardActive : null]}
      onPress={onPress}
    >
      <View style={styles.practiceModeSelectArea}>
        <View style={[styles.practiceModeIcon, active ? styles.practiceModeIconActive : null]} testID={`practice-mode-${modeTestId}-icon`}>
          <PracticeModeGlyph mode={item.mode} testIDPrefix={`practice-mode-${modeTestId}`} />
        </View>
        <View style={styles.practiceModeCopy}>
          <View style={styles.practiceModeTitleRow}>
            <Text style={styles.practiceModeTitle}>{label}</Text>
          </View>
          <Text
            ellipsizeMode="tail"
            numberOfLines={1}
            style={styles.practiceModeDescription}
          >
            {PRACTICE_MODE_DESCRIPTIONS[item.mode]}
          </Text>
          <View
            accessibilityLabel={detail}
            testID={`practice-mode-${modeTestId}-details`}
            style={styles.practiceModeDetailProbe}
          />
        </View>
      </View>
      <View style={styles.practiceModeMeta}>
        {ratingLabel ? (
          <Text style={styles.practiceModeRating} testID={`practice-mode-${modeTestId}-rating`}>{ratingLabel}</Text>
        ) : null}
        {item.mode === "custom" ? (
          <View testID="practice-mode-custom-disclosure" style={styles.practiceModeDisclosure}>
            <ChevronGlyph direction="right" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function practiceModeDetailLabel(item: PracticeModeSummary): string {
  if (item.mode === "custom") {
    return "Configure time, theme, and rating";
  }
  return `${formatSprintTimingLabel(item.config)} · Rating ${item.rating ?? 600}`;
}

function formatSprintTimingLabel(config: SprintConfig): string {
  return `${formatSprintDurationLabel(config.durationSeconds)} · ${config.perPuzzleSeconds}s pace`;
}

function formatSprintDurationLabel(seconds: number): string {
  if (seconds % 60 === 0) {
    return `${seconds / 60} min`;
  }
  return `${seconds}s`;
}

function CustomSprintSetup({
  availablePuzzleCount,
  customMode,
  durationSeconds,
  initialRating,
  initialRatingEditorOpen,
  ratingPlayed,
  maxMistakes,
  onClose,
  onCustomModeChange,
  onInitialRatingChange,
  onInitialRatingEditorOpenChange,
  perPuzzleSeconds,
  progress,
  previousConfigs,
  ratingForKey,
  selectedThemes,
  themeCatalogPresentation,
  targetCorrect,
  ratingKey,
  onDurationChange,
  onPerPuzzleChange,
  onThemeIntent,
  onStart
}: {
  availablePuzzleCount: number;
  customMode: "custom" | "arrow_duel";
  durationSeconds: number;
  initialRating: number;
  initialRatingEditorOpen: boolean;
  ratingPlayed: boolean;
  maxMistakes: number;
  onClose: () => void;
  onCustomModeChange: (next: "custom" | "arrow_duel") => void;
  onInitialRatingChange: (next: number) => void;
  onInitialRatingEditorOpenChange: (open: boolean) => void;
  perPuzzleSeconds: number;
  progress: PracticeProgressSummary;
  previousConfigs: CustomSprintConfigRecord[];
  ratingForKey: (ratingKey: string) => number;
  selectedThemes: readonly CustomThemeFilter[];
  themeCatalogPresentation?: ThemeCatalogPresentation;
  targetCorrect: number;
  ratingKey: string;
  onDurationChange: (next: number) => void;
  onPerPuzzleChange: (next: number) => void;
  onThemeIntent: (intent: ThemeChoiceIntent) => void;
  onStart: () => void;
}): React.JSX.Element {
  const requiredPuzzleCount = targetCorrect + maxMistakes;
  const hasEnoughLocalPuzzles = availablePuzzleCount >= requiredPuzzleCount;
  const canStartWithLocalPuzzles = availablePuzzleCount > 0;
  const previousRows = previousConfigs.slice(0, 5).map((config) =>
    previousCustomConfigRowModel(config, ratingForKey(config.ratingKey))
  );
  return (
    <View style={styles.customSetupPanel} testID="custom-sprint-setup">
      <SprintStartHeader
        closeAccessibilityLabel="Close custom sprint setup"
        closeTestID="custom-close"
        headerTestID="custom-action-header"
        startAccessibilityLabel="Start custom sprint"
        startDisabled={!canStartWithLocalPuzzles}
        startTestID="start-sprint-button"
        title="Custom Sprint"
        titleTestID="custom-header-title"
        onClose={onClose}
        onStart={onStart}
      />

      <View style={styles.customConfigCard} testID="custom-config-list">
        <CustomModeChoiceRow
          value={customMode}
          testID="custom-mode-row"
          onChange={onCustomModeChange}
        />
        <CustomThemeChoiceRow
          selectedThemes={selectedThemes}
          themeCatalogPresentation={themeCatalogPresentation}
          testID="custom-theme-row"
          onChange={(theme) => onThemeIntent({ type: "toggle-theme", theme })}
        />
        <CustomOptionRow
          label="Duration"
          value={formatDurationLabel(durationSeconds)}
          stepperTestID="custom-duration-stepper"
          options={CUSTOM_DURATION_OPTIONS.map((option) => ({
            value: option,
            label: formatDurationLabel(option),
            testID: `custom-duration-${option}`
          }))}
          selected={durationSeconds}
          onChange={onDurationChange}
        />
        <CustomOptionRow
          label="Time per puzzle"
          value={`${perPuzzleSeconds} sec`}
          stepperTestID="custom-per-puzzle-stepper"
          options={CUSTOM_PER_PUZZLE_OPTIONS.map((option) => ({
            value: option,
            label: `${option}s`,
            testID: `custom-per-puzzle-${option}`
          }))}
          selected={perPuzzleSeconds}
          onChange={onPerPuzzleChange}
        />
        <CustomInitialRatingRow
          editOpen={initialRatingEditorOpen}
          key={ratingKey}
          played={ratingPlayed}
          onChange={onInitialRatingChange}
          onEditOpenChange={onInitialRatingEditorOpenChange}
          value={initialRating}
        />
        <CustomValueRow
          label="Estimated puzzles"
          value={`~${targetCorrect}`}
          testID="custom-summary-target"
          valueTestID="custom-target-count"
        />
      </View>

      <CustomEligibilityNotice
        availablePuzzleCount={availablePuzzleCount}
        hasEnoughLocalPuzzles={hasEnoughLocalPuzzles}
        requiredPuzzleCount={requiredPuzzleCount}
      />

      <PracticeProgressCard currentRating={initialRating} mode={customMode} progress={progress} />

      <View style={styles.previousConfigList} testID="custom-previous-configs">
        <Text style={styles.sectionLabel}>Previous configs</Text>
        {previousRows.length === 0 ? (
          <Text style={styles.helperText} testID="custom-previous-empty">Start a custom sprint to save this setup.</Text>
        ) : null}
        {previousRows.map((config) => (
          <PreviousCustomConfigRow
            key={config.id}
            config={config}
            onPress={() => {
              onCustomModeChange(config.customMode);
              onDurationChange(config.durationSeconds);
              onPerPuzzleChange(config.perPuzzleSeconds);
              onThemeIntent({ type: "replace-themes", themes: config.themes });
            }}
          />
        ))}
      </View>
    </View>
  );
}

function CustomEligibilityNotice({
  availablePuzzleCount,
  hasEnoughLocalPuzzles,
  requiredPuzzleCount
}: {
  availablePuzzleCount: number;
  hasEnoughLocalPuzzles: boolean;
  requiredPuzzleCount: number;
}): React.JSX.Element | null {
  if (hasEnoughLocalPuzzles) {
    return null;
  }

  return (
    <View style={[styles.customEligibilityCard, styles.customEligibilityWarning]} testID="custom-pack-warning">
      <Text style={styles.sectionLabel}>Local pack warning</Text>
      <Text style={styles.helperText}>
        Current offline pack has {availablePuzzleCount} eligible puzzles; this setup may need up to {requiredPuzzleCount}. Broaden theme or rating coverage before a scored release pack.
      </Text>
    </View>
  );
}

function CustomModeChoiceRow({
  onChange,
  testID,
  value
}: {
  onChange: (next: "custom" | "arrow_duel") => void;
  testID: string;
  value: "custom" | "arrow_duel";
}): React.JSX.Element {
  const options: Array<{ value: "custom" | "arrow_duel"; label: string; detail: string; testID: string }> = [
    { value: "custom", label: "Regular Puzzles", detail: "Board moves", testID: "custom-mode-regular" },
    { value: "arrow_duel", label: "Arrow Duel", detail: "Two candidates", testID: "custom-mode-arrow-duel" }
  ];
  return (
    <View style={styles.customConfigRow} testID={testID}>
      <View style={styles.customChoiceCopy}>
        <Text style={styles.listText}>Mode</Text>
      </View>
      <View style={styles.customInlineOptions}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: value === option.value }}
            accessibilityLabel={`${option.label} custom sprint mode, ${option.detail}`}
            testID={option.testID}
            style={[styles.customMiniChip, value === option.value ? styles.customMiniChipActive : null]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.customMiniChipText, value === option.value ? styles.customMiniChipTextActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function CustomInitialRatingRow({
  editOpen,
  played,
  onChange,
  onEditOpenChange,
  value
}: {
  editOpen: boolean;
  played: boolean;
  onChange: (next: number) => void;
  onEditOpenChange: (open: boolean) => void;
  value: number;
}): React.JSX.Element {
  if (!played) {
    return (
      <View
        accessibilityLabel={`Starting rating, rating ${value}. Sets the initial puzzle difficulty for this Run.`}
        style={styles.customConfigRow}
        testID="custom-initial-rating-row"
      >
        <View style={styles.customChoiceCopy}>
          <Text style={styles.listText}>Starting rating</Text>
          <Text style={styles.requiredFieldLabel}>Sets initial puzzle difficulty</Text>
        </View>
        <View style={styles.customStepperGroup}>
          <Text style={styles.customConfigValue} testID="custom-initial-rating-value">Rating {value}</Text>
          <CustomRatingStepper onChange={onChange} value={value} />
        </View>
      </View>
    );
  }

  return (
    <>
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Edit rating, rating ${value}`}
        accessibilityState={{ expanded: editOpen }}
        style={styles.customConfigRow}
        testID="custom-initial-rating-row"
        onPress={() => onEditOpenChange(!editOpen)}
      >
        <View style={styles.customChoiceCopy}>
          <Text style={styles.listText}>Edit rating</Text>
        </View>
        <View style={styles.customStepperGroup}>
          <Text style={styles.customConfigValue} testID="custom-initial-rating-value">Rating {value}</Text>
          <ChevronGlyph direction="right" />
        </View>
      </Pressable>
      {editOpen ? (
        <View style={styles.customConfigRow} testID="custom-initial-rating-editor">
          <Text style={styles.listText}>Adjustment</Text>
          <CustomRatingStepper onChange={onChange} value={value} />
        </View>
      ) : null}
    </>
  );
}

function CustomRatingStepper({
  onChange,
  value
}: {
  onChange: (next: number) => void;
  value: number;
}): React.JSX.Element {
  const canDecrease = value > CUSTOM_INITIAL_RATING_MIN;
  const canIncrease = value < CUSTOM_INITIAL_RATING_MAX;
  const decrease = () => {
    if (canDecrease) {
      onChange(Math.max(CUSTOM_INITIAL_RATING_MIN, value - CUSTOM_INITIAL_RATING_STEP));
    }
  };
  const increase = () => {
    if (canIncrease) {
      onChange(Math.min(CUSTOM_INITIAL_RATING_MAX, value + CUSTOM_INITIAL_RATING_STEP));
    }
  };
  return (
    <View style={styles.customStepperCompact} testID="custom-initial-rating-stepper">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease rating"
        accessibilityState={{ disabled: !canDecrease }}
        disabled={!canDecrease}
        testID="custom-initial-rating-stepper-decrease"
        style={[styles.customStepperButton, !canDecrease ? styles.disabledButton : null]}
        onPress={decrease}
      >
        <MinusGlyph />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase rating"
        accessibilityState={{ disabled: !canIncrease }}
        disabled={!canIncrease}
        testID="custom-initial-rating-stepper-increase"
        style={[styles.customStepperButton, !canIncrease ? styles.disabledButton : null]}
        onPress={increase}
      >
        <PlusGlyph />
      </Pressable>
    </View>
  );
}

function CustomValueRow({
  detail,
  label,
  testID,
  value,
  valueTestID
}: {
  detail?: string;
  label: string;
  testID: string;
  value: string;
  valueTestID?: string;
}): React.JSX.Element {
  const accessibilityLabel = [label, value, detail].filter(Boolean).join(", ");
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={styles.customConfigRow}
      testID={testID}
    >
      <View>
        <Text style={styles.listText}>{label}</Text>
        {detail ? (
          <View
            accessibilityLabel={detail}
            testID={`${testID}-detail`}
          />
        ) : null}
      </View>
      <Text testID={valueTestID} style={styles.customConfigValue}>{value}</Text>
    </View>
  );
}

function CustomThemeChoiceRow({
  onChange,
  selectedThemes,
  showDisclosure = false,
  themeCatalogPresentation,
  testID,
}: {
  onChange: (next: CustomThemeFilter) => void;
  selectedThemes: readonly CustomThemeFilter[];
  showDisclosure?: boolean;
  themeCatalogPresentation?: ThemeCatalogPresentation;
  testID: string;
}): React.JSX.Element {
  if (themeCatalogPresentation) {
    return (
      <ThemeCatalogChoiceRow
        onChange={onChange}
        presentation={themeCatalogPresentation}
        selectedThemes={selectedThemes}
        showDisclosure={showDisclosure}
        testID={testID}
      />
    );
  }

  return (
    <View style={[styles.customConfigRow, styles.customThemeRow]} testID={testID}>
      <View style={[styles.customInlineOptions, styles.customThemeOptions]}>
        {CUSTOM_THEME_OPTIONS.map((option) => {
          return (
            <ThemeChoiceChip
              key={option}
              option={option}
              selected={selectedThemes.includes(option)}
              onPress={() => onChange(option)}
            />
          );
        })}
      </View>
    </View>
  );
}

function ThemeCatalogChoiceRow({
  onChange,
  presentation,
  selectedThemes,
  showDisclosure,
  testID
}: {
  onChange: (next: CustomThemeFilter) => void;
  presentation: ThemeCatalogPresentation;
  selectedThemes: readonly CustomThemeFilter[];
  showDisclosure: boolean;
  testID: string;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(!showDisclosure);
  const selectedThemeLabels = selectedThemes
    .filter((theme) => theme !== ALL_THEMES_FILTER)
    .map(customThemeLabel);
  const selectedThemeDetail = selectedThemeLabels.length === 0
    ? "All themes"
    : selectedThemeLabels.join(" · ");
  const allChip = (
    <ThemeChoiceChip
      label={showDisclosure ? "All themes" : undefined}
      option={ALL_THEMES_FILTER}
      selected={selectedThemes.includes(ALL_THEMES_FILTER)}
      onPress={() => onChange(ALL_THEMES_FILTER)}
    />
  );

  return (
    <View style={styles.themeCatalogSection} testID={testID}>
      {showDisclosure ? (
        <Pressable
          accessibilityLabel={expanded ? "Hide Run themes" : "Show Run themes"}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={styles.historyThemeDisclosure}
          testID="practice-run-theme-disclosure"
          onPress={() => setExpanded((current) => !current)}
        >
          <View style={styles.historyThemeDisclosureCopy}>
            <Text style={styles.themeCatalogTitle}>Themes</Text>
            <Text
              accessibilityLabel={`Selected themes: ${selectedThemeDetail}`}
              ellipsizeMode="tail"
              numberOfLines={1}
              style={styles.historyThemeSummary}
              testID="practice-run-theme-selection-detail"
            >
              {selectedThemeDetail}
            </Text>
          </View>
          <DisclosureChevron
            expanded={expanded}
            testID="practice-run-theme-animated-chevron"
          />
        </Pressable>
      ) : (
        <View style={styles.themeCatalogHeadingRow}>
          <View>
            <Text style={styles.themeCatalogTitle}>Themes</Text>
            <Text style={styles.requiredFieldLabel}>Choose one or more</Text>
          </View>
          {allChip}
        </View>
      )}
      <CollapsibleRegion
        contentTestID="practice-run-theme-catalog"
        contentStyle={styles.themeCatalogExpandableContent}
        expanded={expanded}
      >
          {showDisclosure ? (
            <View style={styles.historyThemeAllRow}>{allChip}</View>
          ) : null}
          <View style={styles.themeCatalogGroupGrid}>
            {presentation.groups.map((group) => (
              <View key={group.label} style={styles.themeCatalogGroupCard}>
                <Text style={styles.themeCatalogGroupLabel}>{group.label}</Text>
                <View style={styles.themeCatalogGroupOptions}>
                  {group.themes.map((theme) => (
                    <ThemeChoiceChip
                      key={theme}
                      option={theme}
                      selected={selectedThemes.includes(theme)}
                      onPress={() => onChange(theme)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
      </CollapsibleRegion>
    </View>
  );
}

function ThemeChoiceChip({
  label,
  onPress,
  option,
  selected
}: {
  label?: string;
  onPress: () => void;
  option: CustomThemeFilter;
  selected: boolean;
}): React.JSX.Element {
  const visibleLabel = label ?? customThemeLabel(option);
  const representsAllThemes = option === ALL_THEMES_FILTER;
  return (
    <Pressable
      accessibilityHint={representsAllThemes
        ? "Selects all themes and clears named theme selections"
        : "Adds or removes this theme"}
      accessibilityRole={representsAllThemes ? "button" : "checkbox"}
      accessibilityLabel={representsAllThemes ? "All puzzle themes" : `${visibleLabel} puzzle theme`}
      accessibilityState={representsAllThemes ? { selected } : { checked: selected }}
      testID={`custom-theme-${representsAllThemes ? "mixed" : safeTestId(visibleLabel)}`}
      style={[styles.customMiniChip, selected ? styles.customMiniChipActive : null]}
      onPress={onPress}
    >
      <Text style={[styles.customMiniChipText, selected ? styles.customMiniChipTextActive : null]}>{visibleLabel}</Text>
    </Pressable>
  );
}

function CustomOptionRow<T extends number>({
  label,
  onChange,
  options,
  stepperTestID,
  selected,
  value
}: {
  label: string;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string; testID: string }>;
  stepperTestID: string;
  selected: T;
  value: string;
}): React.JSX.Element {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selected));
  const previousOption = options[selectedIndex - 1];
  const nextOption = options[selectedIndex + 1];

  return (
    <View style={styles.customConfigRow}>
      <View>
        <Text style={styles.listText}>{label}</Text>
      </View>
      <View style={styles.customStepperGroup}>
        <Text style={styles.customConfigValue}>{value}</Text>
        <View style={styles.customStepperCompact} testID={stepperTestID}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${label.toLowerCase()}`}
            accessibilityState={{ disabled: !previousOption }}
            disabled={!previousOption}
            testID={`${stepperTestID}-decrease`}
            style={[styles.customStepperButton, !previousOption ? styles.disabledButton : null]}
            onPress={() => {
              if (previousOption) {
                onChange(previousOption.value);
              }
            }}
          >
            <MinusGlyph />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Increase ${label.toLowerCase()}`}
            accessibilityState={{ disabled: !nextOption }}
            disabled={!nextOption}
            testID={`${stepperTestID}-increase`}
            style={[styles.customStepperButton, !nextOption ? styles.disabledButton : null]}
            onPress={() => {
              if (nextOption) {
                onChange(nextOption.value);
              }
            }}
          >
            <PlusGlyph />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

type PreviousCustomConfig = {
  customMode: "custom" | "arrow_duel";
  durationSeconds: number;
  id: string;
  mode: string;
  perPuzzleSeconds: number;
  themes: CustomThemeFilter[];
  themeLabel: string;
  timing: string;
  lastPlayed: string;
  ratingKey: string;
  rating: number;
};

function PreviousCustomConfigRow({
  config,
  onPress
}: {
  config: PreviousCustomConfig;
  onPress: () => void;
}): React.JSX.Element {
  const ratingLabel = historyRatingKeyLabel(config.ratingKey);
  const metaLabel = `${config.themeLabel} · ${config.timing} · Last ${config.lastPlayed}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Use ${ratingLabel} custom sprint, ${config.mode}, ${metaLabel}, rating ${config.rating}`}
      style={styles.previousConfigRow}
      testID={`custom-previous-${config.id}`}
      onPress={onPress}
    >
      <View style={styles.previousConfigCopy}>
        <View style={styles.previousConfigHeader}>
          <Text style={styles.historyRowTitle}>{config.mode}</Text>
        </View>
        <Text
          accessibilityLabel={`${metaLabel} · ${ratingLabel}`}
          style={styles.helperText}
          testID={`custom-previous-${config.id}-meta`}
        >
          {metaLabel}
        </Text>
      </View>
      <View style={styles.previousConfigTrailing}>
        <View style={styles.previousConfigRating}>
          <Text style={styles.helperText}>Rating</Text>
          <Text style={styles.practiceModeRating}>{config.rating}</Text>
        </View>
        <View style={styles.previousConfigChevron} testID={`custom-previous-${config.id}-chevron`}>
          <ChevronGlyph direction="right" />
        </View>
      </View>
    </Pressable>
  );
}

function TestPuzzleSourceControl({
  source,
  onChange
}: {
  source: MobilePuzzleSource;
  onChange: (next: MobilePuzzleSource) => void;
}): React.JSX.Element {
  return (
    <View style={styles.testPanel} testID="test-puzzle-source-control">
      <Text style={styles.helperText}>Test puzzle source</Text>
      <View style={styles.optionRow}>
        {TEST_PUZZLE_SOURCES.map((option) => (
          <OptionButton
            key={option.source}
            active={source === option.source}
            label={option.label}
            testID={`test-puzzle-source-${option.source}`}
            onPress={() => onChange(option.source)}
          />
        ))}
      </View>
    </View>
  );
}

type SessionTimingState = {
  elapsedSeconds: number;
  phase: "normal" | "slow" | "timed_out";
};

function PuzzleTimingIndicator({
  elapsedSeconds,
  phase,
  timeoutSeconds
}: {
  elapsedSeconds: number;
  phase: SessionTimingState["phase"];
  timeoutSeconds: number | null;
}): React.JSX.Element {
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
      style={[
        styles.puzzleTimingIndicator,
        phase !== "normal" ? styles.puzzleTimingIndicatorSlow : null,
        styles.puzzleTimingIndicatorStandalone
      ]}
      testID="session-puzzle-timing"
    >
      <Text
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
          style={styles.puzzleTimingCountdown}
          testID="session-puzzle-countdown"
        >
          {countdownSeconds}s
        </Text>
      )}
    </View>
  );
}

function SessionStatusBar({
  closeAccessibilityLabel = "Abandon sprint",
  compactMetrics = false,
  confirmAbandon,
  dimmedExceptClose = false,
  mode,
  personalBest,
  state,
  timerText,
  onAbandon,
  onClose,
  onConfirmAbandonChange,
  onPauseAndLeave,
  onPause,
  onResume
}: {
  closeAccessibilityLabel?: string;
  compactMetrics?: boolean;
  confirmAbandon: boolean;
  dimmedExceptClose?: boolean;
  mode: SprintMode;
  personalBest?: PersonalBestChallengeDesignPreview;
  state: SprintState;
  timerText: string;
  onAbandon?: () => void;
  onClose?: () => void;
  onConfirmAbandonChange: (visible: boolean) => void;
  onPauseAndLeave?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}): React.JSX.Element {
  const isTacticalFocus = state.config.tacticalFocus !== undefined;
  const isPersonalBest = personalBest !== undefined;
  const previousSurvivalBest = personalBest?.bestScore;
  const hasNewSurvivalBest = isPersonalBest
    && (previousSurvivalBest === null || state.correctCount > (previousSurvivalBest ?? -1));
  const savedSurvivalBest = Math.max(state.correctCount, previousSurvivalBest ?? 0);
  const completedAttempts = state.correctCount + state.mistakeCount;
  const plannedAttempts = state.config.maxAttempts ?? state.config.targetCorrect;
  return (
    <View style={styles.activeSessionShell} testID="active-session-shell">
      <View style={styles.sessionNavRow} testID="session-shell-nav">
        {onClose || onAbandon ? (
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
          numberOfLines={1}
          style={[
            styles.sessionNavTitle,
            dimmedExceptClose ? styles.sessionGuideCoachDimmed : null
          ]}
        >
          {isPersonalBest ? "Survival" : isTacticalFocus ? "Focused Run" : modeLabel(mode)}
        </Text>
        <View
          style={[
            styles.sessionNavActions,
            dimmedExceptClose ? styles.sessionGuideCoachDimmed : null
          ]}
          testID="session-nav-actions"
        >
          {isPersonalBest ? (
            <View style={styles.sessionNavButton} />
          ) : onPause ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pause sprint"
              testID="session-pause"
              style={styles.sessionNavButton}
              onPress={onPause}
            >
              <PauseGlyph />
            </Pressable>
          ) : onResume ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Resume sprint"
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
        style={[
          styles.sessionActiveMetricRow,
          compactMetrics ? styles.sessionActiveMetricRowCompact : null,
          dimmedExceptClose ? styles.sessionGuideCoachDimmed : null
        ]}
        testID="session-status-metrics"
      >
        <View
          accessibilityLabel={isPersonalBest
            ? `Solved ${state.correctCount}`
            : isTacticalFocus
            ? `Puzzles ${completedAttempts} of ${plannedAttempts}`
            : `Progress ${state.correctCount} of ${state.config.targetCorrect}`}
          style={[styles.sessionMetricBlock, isPersonalBest ? styles.personalBestSideMetricBlock : null]}
          testID="session-progress-block"
        >
          <Text
            adjustsFontSizeToFit={compactMetrics}
            minimumFontScale={0.75}
            numberOfLines={1}
            testID="session-progress"
            style={[
              styles.sessionProgressValue,
              compactMetrics ? styles.sessionMetricTextCompact : null
            ]}
          >
            {isPersonalBest
              ? `${state.correctCount} solved`
              : isTacticalFocus
              ? `${completedAttempts} / ${plannedAttempts}`
              : `${state.correctCount} / ${state.config.targetCorrect}`}
          </Text>
        </View>
        <View
          accessibilityLabel={`Timer ${timerText}`}
          style={[styles.sessionMetricBlock, isPersonalBest ? styles.personalBestTimerMetricBlock : null]}
          testID="session-timer-block"
        >
          <Text
            adjustsFontSizeToFit={compactMetrics}
            minimumFontScale={0.75}
            numberOfLines={1}
            testID="session-timer"
            style={[
              styles.timerText,
              isPersonalBest ? styles.personalBestTimerText : null,
              compactMetrics ? styles.sessionMetricTextCompact : null
            ]}
          >
            {timerText}
          </Text>
        </View>
        {isPersonalBest ? (
          <View
            accessibilityLabel={`Mistakes ${state.mistakeCount} of ${state.config.maxMistakes}`}
            style={[styles.sessionMetricBlock, styles.personalBestSideMetricBlock]}
            testID="session-mistakes-block"
          >
            <PersonalBestMistakeIndicator
              count={state.mistakeCount}
              max={state.config.maxMistakes}
            />
          </View>
        ) : isTacticalFocus ? (
          <View
            accessibilityLabel="Rating unchanged"
            style={styles.sessionMetricBlock}
            testID="session-rating-policy"
          >
            <Text
              adjustsFontSizeToFit={compactMetrics}
              minimumFontScale={0.75}
              numberOfLines={1}
              style={[
                styles.timerText,
                compactMetrics ? styles.sessionMetricTextCompact : null
              ]}
            >
              Unrated
            </Text>
          </View>
        ) : (
          <View
            accessibilityLabel={`Mistakes ${state.mistakeCount} of ${state.config.maxMistakes}`}
            style={styles.sessionMetricBlock}
            testID="session-mistakes-block"
          >
            <ActiveMistakeIndicator
              count={state.mistakeCount}
              max={state.config.maxMistakes}
            />
          </View>
        )}
      </View>

      {confirmAbandon && isPersonalBest ? (
        <View style={styles.survivalExitSheet} testID="session-abandon-confirmation">
          <View style={styles.sessionAbandonCopy}>
            <Text style={styles.survivalExitTitle}>Survival paused</Text>
            <Text style={styles.survivalExitBest} testID="personal-best-exit-best">
              {hasNewSurvivalBest
                ? `New best ${savedSurvivalBest} · already saved`
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
        <View style={styles.sessionAbandonConfirm} testID="session-abandon-confirmation">
          <View style={styles.sessionAbandonCopy}>
            <Text style={styles.listText}>
              {isTacticalFocus ? "Abandon focused Run?" : "Abandon sprint?"}
            </Text>
            <Text style={styles.helperText}>
              {isTacticalFocus
                ? "This ends the focused Run. Completed puzzles stay in History and your Rating stays unchanged."
                : "This ends the run and records a failed sprint."}
            </Text>
          </View>
          <View style={styles.sessionAbandonActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel abandon sprint"
              testID="session-abandon-cancel"
              style={styles.secondaryButton}
              onPress={() => onConfirmAbandonChange(false)}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirm abandon sprint"
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

function ActiveMistakeIndicator({
  count,
  max
}: {
  count: number;
  max: number;
}): React.JSX.Element {
  return (
    <View
      accessibilityLabel={`Mistakes ${count} of ${max}`}
      style={styles.activeMistakeIndicator}
      testID="session-mistakes"
    >
      <View style={styles.activeMistakeDots}>
        {Array.from({ length: max }, (_, index) => (
          <View
            key={index}
            style={[
              styles.activeMistakeDot,
              index < count ? styles.activeMistakeDotUsed : null
            ]}
            testID={`session-mistake-dot-${index}`}
          />
        ))}
      </View>
    </View>
  );
}

function PreviousAttemptNotice({
  reason
}: {
  reason: PreviousAttemptNoticeReason;
}): React.JSX.Element {
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
        <Text style={styles.previousAttemptNoticeTitle}>{presentation.title}</Text>
        <Text style={styles.previousAttemptNoticeDetail}>
          {presentation.detail}
        </Text>
      </View>
      <View
        style={styles.readOnlyAttemptStatus}
        testID="sprint-previous-attempt-notice-status"
      >
        <Text style={styles.readOnlyAttemptStatusText}>
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
        <Text style={styles.unclearPromptQuestion} testID="sprint-unclear-question">{question}</Text>
      </View>
      {marked ? (
        <View style={styles.readOnlyAttemptStatus} testID="sprint-unclear-marked">
          <Text style={styles.readOnlyAttemptStatusText}>Marked</Text>
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
          <Text style={styles.unclearPromptButtonText}>Mark as unclear</Text>
        </Pressable>
      )}
    </View>
  );
}

function SprintSummary({
  state,
  clarifyGoal,
  elapsedMs,
  includePromptInUnclearSummary,
  unclearPrompt,
  unclearSummary,
  replayItems,
  resultSummary,
  onToggleUnclear,
  onReplay,
  onBack,
  onOpenHistory,
  onOpenReplay
}: {
  state: SprintState;
  clarifyGoal: boolean;
  elapsedMs: number;
  includePromptInUnclearSummary: boolean;
  unclearPrompt: UnclearPromptState | null;
  unclearSummary?: SprintResultUnclearSummaryPresentation;
  replayItems?: readonly SprintResultReplayDesignItem[];
  resultSummary?: SprintResultSummary;
  onToggleUnclear: () => void;
  onReplay: () => void;
  onBack: () => void;
  onOpenHistory: () => void;
  onOpenReplay?: () => void;
}): React.JSX.Element {
  const delta = (state.ratingAfter ?? state.ratingBefore) - state.ratingBefore;
  const isTacticalFocus = state.config.tacticalFocus !== undefined;
  const showGoalClarification = clarifyGoal && !isTacticalFocus;
  const reason = formatEndReason(state.endReason);
  const shouldPrioritizeReplay = Boolean(onOpenReplay);
  const attemptCount = resultSummary?.attemptCount
    ?? state.correctCount + state.mistakeCount;
  const accuracy = resultSummary?.accuracyPercent
    ?? Math.round((state.correctCount / Math.max(1, attemptCount)) * 100);
  const ratingAfter = state.ratingAfter ?? state.ratingBefore;
  const replayInReviewCount = replayItems?.filter((item) => item.inReview).length ?? 0;
  const replayItemCount = replayItems?.length ?? 0;
  const replayAttemptCountLabel = `${replayItemCount} ${
    replayItemCount === 1 ? "attempt" : "attempts"
  }`;
  const replayOverlapCount = replayItems?.filter(
    (item) => item.inReview && isAttemptMarkedUnclear(item.attempt)
  ).length ?? 0;
  const resolvedUnclearSummary = resultSummary?.unclear ?? unclearSummary;
  const promptMarkedCount = includePromptInUnclearSummary && unclearPrompt?.marked ? 1 : 0;
  const userMarkedCount = (resolvedUnclearSummary?.userMarkedCount ?? 0) + promptMarkedCount;
  const unclearCount = resolvedUnclearSummary
    ? userMarkedCount
      + resolvedUnclearSummary.slowMarkedCount
      + (resolvedUnclearSummary.timedOutMarkedCount ?? 0)
    : 0;
  const unclearSources = resolvedUnclearSummary
    ? [
        userMarkedCount > 0
          ? `${userMarkedCount} marked by you`
          : null,
        resolvedUnclearSummary.slowMarkedCount > 0
          ? `${resolvedUnclearSummary.slowMarkedCount} marked after Slow`
          : null,
        (resolvedUnclearSummary.timedOutMarkedCount ?? 0) > 0
          ? `${resolvedUnclearSummary.timedOutMarkedCount} marked after Timed out`
          : null
      ].filter((source): source is string => source !== null).join(" · ")
    : "";

  return (
    <View style={styles.summaryPanel} testID="sprint-summary-panel">
      <View style={styles.resultTopBar} testID="sprint-result-top-bar">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          testID="back-practice-button"
          style={styles.resultTopBarButton}
          onPress={onBack}
        >
          <ChevronGlyph direction="left" />
        </Pressable>
        <Text style={styles.resultTopBarTitle}>
          {isTacticalFocus ? "Focused Run Result" : "Sprint Result"}
        </Text>
        {isTacticalFocus ? (
          <View style={styles.resultTopBarIconButton} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View history trends"
            testID="sprint-result-history-button"
            style={styles.resultTopBarIconButton}
            onPress={onOpenHistory}
          >
            <ResultTrendGlyph />
          </Pressable>
        )}
      </View>

      <View
        style={[styles.resultHero, showGoalClarification ? styles.resultHeroClarified : null]}
        testID="sprint-result-hero"
      >
        <View style={styles.resultStatusBlock}>
          <View style={[styles.resultIcon, state.status === "won" ? styles.resultIconWon : styles.resultIconFailed]}>
            <SprintResultStatusGlyph status={state.status === "won" ? "won" : "failed"} />
          </View>
          <View style={styles.resultTitleBlock}>
            <Text style={styles.summaryTitle}>
              {isTacticalFocus
                ? state.status === "won" ? "Focused Run complete" : "Focused Run ended"
                : state.status === "won" ? "Sprint complete" : "Sprint failed"}
            </Text>
            <Text
              accessibilityLabel={`Result: ${reason}`}
              style={styles.summaryText}
              testID="sprint-result-reason"
            >
              {reason}
            </Text>
          </View>
        </View>
        <View style={[
          styles.resultScoreBlock,
          showGoalClarification ? styles.resultGoalScoreBlock : null
        ]}>
          {showGoalClarification ? (
            <Text style={styles.resultGoalLabel} testID="sprint-result-goal-label">
              Solve {state.config.targetCorrect} to pass
            </Text>
          ) : null}
          {showGoalClarification ? (
            <Text
              accessibilityLabel={`Solved ${state.correctCount}`}
              style={styles.resultSolvedCount}
              testID="sprint-result-solved"
            >
              Solved {state.correctCount}
            </Text>
          ) : (
            <Text style={styles.resultSolvedCount} testID="sprint-result-solved">
              {state.correctCount}
              <Text style={styles.resultSolvedTarget}>
                {" / "}
                {attemptCount}
              </Text>
            </Text>
          )}
          <Text style={styles.resultAccuracy} testID="sprint-result-accuracy">
            {showGoalClarification ? `${attemptCount} attempted · ` : ""}
            {accuracy}% Accuracy
          </Text>
        </View>
      </View>

      {unclearPrompt ? (
        <UnclearAttemptPrompt
          marked={unclearPrompt.marked}
          question={unclearPrompt.question}
          onToggle={onToggleUnclear}
        />
      ) : null}

      {!isTacticalFocus ? (
        <ResultHistoryShortcut
          delta={delta}
          ratingAfter={ratingAfter}
          ratingBefore={state.ratingBefore}
          onPress={onOpenHistory}
        />
      ) : null}

      <View style={styles.resultMetricGrid}>
        <View style={styles.resultMetric} testID="sprint-result-rating-change">
          <Text style={styles.resultMetricLabel}>
            {isTacticalFocus ? "Rating" : "Rating Change"}
          </Text>
          <Text style={[
            styles.resultMetricValue,
            isTacticalFocus ? styles.positive : delta >= 0 ? styles.positive : styles.errorText
          ]}>
            {isTacticalFocus ? "Unrated" : `${delta >= 0 ? "+" : ""}${delta}`}
          </Text>
          <Text testID="sprint-result-rating-range" style={styles.resultMetricSubtext}>
            {isTacticalFocus ? `${state.ratingBefore} unchanged` : `${state.ratingBefore} -> ${ratingAfter}`}
          </Text>
        </View>
        <View style={styles.resultMetric} testID="sprint-result-time">
          <Text style={styles.resultMetricLabel}>Time</Text>
          <Text style={styles.resultMetricValue}>{formatDuration(Math.floor(elapsedMs / 1000))}</Text>
        </View>
        <View style={styles.resultMetric} testID="sprint-result-best-streak">
          <Text style={styles.resultMetricLabel}>Best Streak</Text>
          <Text style={styles.resultMetricValue}>
            {state.bestStreak}
          </Text>
        </View>
      </View>

      {resolvedUnclearSummary && unclearCount > 0 ? (
        <View
          accessibilityLabel={`Unclear ${unclearCount}. ${unclearSources}. ${
            replayItems ? "Included in replay." : "Saved in History."
          } Does not affect your Sprint result.`}
          style={styles.resultUnclearRow}
          testID="sprint-result-unclear-summary"
        >
          <View style={styles.resultUnclearCopy}>
            <Text style={styles.listText}>Unclear</Text>
            <Text style={styles.helperText} testID="sprint-result-unclear-sources">{unclearSources}</Text>
            <Text style={styles.resultUnclearNote}>
              {replayItems ? "Included in replay" : "Saved in History"} · Does not affect your Sprint result
            </Text>
          </View>
          <View
            style={[styles.resultSummaryCountColumn, styles.resultUnclearCountBadge]}
            testID="sprint-result-unclear-count-column"
          >
            <Text style={styles.resultUnclearCount} testID="sprint-result-unclear-count">{unclearCount}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.resultReviewRow} testID="sprint-result-review-impact">
        <View style={styles.resultReviewCopy}>
          <Text style={styles.listText}>In Review</Text>
          <Text style={styles.helperText}>
            {`${replayInReviewCount} ${
              replayInReviewCount === 1 ? "attempt" : "attempts"
            } · Included in replay`}
          </Text>
        </View>
        <View
          style={styles.resultSummaryCountColumn}
          testID="sprint-result-mistakes-count-column"
        >
          <Text
            testID="sprint-result-mistakes"
            style={[styles.resultReviewCount, replayInReviewCount > 0 ? styles.errorText : styles.positive]}
          >
            {replayInReviewCount}
          </Text>
        </View>
      </View>

      {replayItems ? (
        <Text style={styles.resultReviewNote} testID="sprint-result-review-note">
          {unclearCount} Unclear + {replayInReviewCount} in Review
          {replayOverlapCount > 0 ? ` · ${replayOverlapCount} in both` : ""}
          {" · "}{replayItemCount} total · Replay does not change Review scheduling
        </Text>
      ) : null}

      {onOpenReplay && shouldPrioritizeReplay ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Replay ${replayAttemptCountLabel}`}
          testID="review-mistakes-button"
          style={[styles.primaryButton, styles.summaryPrimaryAction]}
          onPress={onOpenReplay}
        >
          <Text style={styles.primaryButtonText}>
            Replay {replayAttemptCountLabel}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.summaryRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isTacticalFocus ? "Back to Practice" : "Play again"}
          testID="play-again-button"
          style={shouldPrioritizeReplay ? styles.secondaryButton : styles.primaryButton}
          onPress={onReplay}
        >
          <Text style={shouldPrioritizeReplay ? styles.secondaryButtonText : styles.primaryButtonText}>
            {isTacticalFocus ? "Back to Practice" : "Play again"}
          </Text>
        </Pressable>
      </View>
      {onOpenReplay && !shouldPrioritizeReplay ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Replay ${replayAttemptCountLabel}`}
          testID="review-mistakes-button"
          style={styles.secondaryButton}
          onPress={onOpenReplay}
        >
          <Text style={styles.secondaryButtonText}>
            Replay {replayAttemptCountLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ResultHistoryShortcut({
  delta,
  onPress,
  ratingAfter,
  ratingBefore
}: {
  delta: number;
  onPress: () => void;
  ratingAfter: number;
  ratingBefore: number;
}): React.JSX.Element {
  const deltaLabel = `${delta >= 0 ? "+" : ""}${delta}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open performance trend in history, rating ${ratingBefore} to ${ratingAfter}, ${deltaLabel}`}
      style={styles.resultTrendCard}
      testID="sprint-result-history-trend"
      onPress={onPress}
    >
      <View style={styles.resultTrendCopy}>
        <Text style={styles.listText}>History</Text>
        <Text style={styles.helperText}>View performance trend</Text>
      </View>
      <View style={styles.resultTrendRange}>
        <Text style={[styles.resultTrendDelta, delta < 0 ? styles.errorText : styles.positive]}>{deltaLabel}</Text>
        <Text testID="sprint-result-trend-start" style={styles.resultTrendRangeText}>{ratingBefore}</Text>
        <ChevronGlyph direction="right" />
        <Text testID="sprint-result-trend-current" style={styles.resultTrendRangeText}>{ratingAfter}</Text>
      </View>
    </Pressable>
  );
}

function SprintResultStatusGlyph({ status }: { status: "won" | "failed" }): React.JSX.Element {
  if (status === "won") {
    return (
      <View style={styles.resultTrophyGlyph} testID="sprint-result-status-glyph">
        <View style={styles.resultTrophyCup} testID="sprint-result-won-glyph">
          <View style={[styles.resultTrophyHandle, styles.resultTrophyHandleLeft]} />
          <View style={[styles.resultTrophyHandle, styles.resultTrophyHandleRight]} />
        </View>
        <View style={styles.resultTrophyStem} />
        <View style={styles.resultTrophyBase} />
      </View>
    );
  }

  return (
    <View style={styles.resultAlertGlyph} testID="sprint-result-status-glyph">
      <View style={styles.resultAlertBar} testID="sprint-result-failed-glyph" />
      <View style={styles.resultAlertDot} />
    </View>
  );
}

function ErrorPanel({ error }: { error: string }): React.JSX.Element {
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
          style={[styles.promptText, layoutContextHidden ? styles.promptSolvedLayoutCopy : null]}
          testID="practice-prompt-context"
        >
          {layoutPromptContext ?? "\u00A0"}
        </Text>
        <Text
          accessible={!layoutHintHidden}
          accessibilityElementsHidden={layoutHintHidden}
          importantForAccessibility={layoutHintHidden ? "no-hide-descendants" : "auto"}
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

function PracticeModeGlyph({
  inverse = false,
  mode,
  testIDPrefix
}: {
  inverse?: boolean;
  mode: SprintMode;
  testIDPrefix?: string;
}): React.JSX.Element {
  const color = inverse ? "#FFFFFF" : "#2563EB";
  if (mode === "standard") {
    return (
      <View style={styles.modeGlyphCanvas}>
        <View
          style={[styles.modeTargetOuter, { borderColor: color }]}
          testID={testIDPrefix ? `${testIDPrefix}-standard-outer` : undefined}
        />
        <View
          style={[styles.modeTargetInner, { borderColor: color }]}
          testID={testIDPrefix ? `${testIDPrefix}-standard-inner` : undefined}
        />
      </View>
    );
  }
  if (mode === "arrow_duel") {
    return (
      <View style={styles.modeGlyphCanvas}>
        <View
          style={[styles.modeDuelArrow, styles.modeDuelArrowUpper]}
          testID={testIDPrefix ? `${testIDPrefix}-arrow-a` : undefined}
        >
          <View
            style={[styles.modeDuelArrowShaft, { backgroundColor: color }]}
            testID={testIDPrefix ? `${testIDPrefix}-arrow-a-shaft` : undefined}
          />
          <View style={[styles.modeDuelArrowHeadTop, { backgroundColor: color }]} />
          <View style={[styles.modeDuelArrowHeadBottom, { backgroundColor: color }]} />
        </View>
        <View
          style={[styles.modeDuelArrow, styles.modeDuelArrowLower]}
          testID={testIDPrefix ? `${testIDPrefix}-arrow-b` : undefined}
        >
          <View
            style={[styles.modeDuelArrowShaft, { backgroundColor: color }]}
            testID={testIDPrefix ? `${testIDPrefix}-arrow-b-shaft` : undefined}
          />
          <View style={[styles.modeDuelArrowHeadTop, { backgroundColor: color }]} />
          <View style={[styles.modeDuelArrowHeadBottom, { backgroundColor: color }]} />
        </View>
      </View>
    );
  }
  if (mode === "blitz") {
    return (
      <View style={styles.modeGlyphCanvas}>
        <View style={[styles.modeBoltTop, { backgroundColor: color }]} />
        <View style={[styles.modeBoltBottom, { backgroundColor: color }]} />
      </View>
    );
  }
  return (
    <View style={styles.modeListGlyph}>
      <View style={[styles.modeListBar, { backgroundColor: color }]} />
      <View style={[styles.modeListBar, { backgroundColor: color }]} />
      <View style={[styles.modeListBar, { backgroundColor: color }]} />
    </View>
  );
}

function SessionScoreStrip({
  compact = false,
  state
}: {
  compact?: boolean;
  state: SprintState;
}): React.JSX.Element {
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
          minimumFontScale={0.75}
          numberOfLines={1}
          style={[
            styles.sessionScoreLabel,
            compact ? styles.sessionScoreLabelCompact : null
          ]}
        >
          {label}
        </Text>
      ) : (
        <SessionScoreGlyph tone={tone} />
      )}
      <Text style={styles.sessionScoreValue} testID={`${metricTestID}-value`}>{value}</Text>
    </View>
  );
}

function SessionScoreGlyph({ tone }: { tone: "positive" | "negative" | "neutral" }): React.JSX.Element {
  return (
    <View
      style={[
        styles.sessionScoreIcon,
        tone === "positive" ? styles.sessionScoreDotPositive : null,
        tone === "negative" ? styles.sessionScoreDotNegative : null,
        tone === "neutral" ? styles.sessionScoreDotNeutral : null
      ]}
      testID={`session-score-${tone}-glyph`}
    >
      {tone === "positive" ? (
        <>
          <View style={[styles.sessionScoreGlyphLine, styles.sessionScoreCheckShort]} />
          <View style={[styles.sessionScoreGlyphLine, styles.sessionScoreCheckLong]} />
        </>
      ) : null}
      {tone === "negative" ? (
        <>
          <View style={[styles.sessionScoreGlyphLine, styles.sessionScoreCrossForward]} />
          <View style={[styles.sessionScoreGlyphLine, styles.sessionScoreCrossBackward]} />
        </>
      ) : null}
      {tone === "neutral" ? <View style={styles.sessionScoreNeutralLine} /> : null}
    </View>
  );
}

function MoveSideGlyph({
  kingPieceSize = 22,
  side,
  testID = `move-side-${side === "w" ? "white" : "black"}-glyph`
}: {
  kingPieceSize?: number;
  side: MoveSide;
  testID?: string;
}): React.JSX.Element {
  return (
    <View
      style={[styles.moveSideKingGlyph, { height: kingPieceSize, width: kingPieceSize }]}
      testID={testID}
    >
      <Image
        accessible={false}
        accessibilityIgnoresInvertColors
        resizeMode="stretch"
        source={CHESS_PIECE_SPRITE}
        style={[
          styles.moveSideKingSprite,
          {
            height: kingPieceSize * 2,
            left: -kingPieceSize * 5,
            top: side === "w" ? 0 : -kingPieceSize,
            width: kingPieceSize * 6
          }
        ]}
        testID={`chessboard-king-${side === "w" ? "white" : "black"}-sprite`}
      />
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
            coordinateTextStyle(7, index),
            {
              bottom: 2,
              fontSize,
              left: index * squareSize,
              width: squareSize
            }
          ]}
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
            coordinateTextStyle(index, 0),
            {
              fontSize,
              left: 3,
              top: index * squareSize + 2
            }
          ]}
          testID={`board-coordinate-rank-${rank}`}
        >
          {rank}
        </Text>
      ))}
    </View>
  );
}

function coordinateTextStyle(row: number, col: number): object {
  return (row + col) % 2 === 0 ? styles.coordinateTextOnLight : styles.coordinateTextOnDark;
}

function LastMoveOverlay({
  boardSize,
  flipped,
  move,
  overlayTestID
}: {
  boardSize: number;
  flipped: boolean;
  move: BoardMove;
  overlayTestID: string;
}): React.JSX.Element {
  const squareSize = boardSize / 8;
  return (
    <View
      accessible
      accessibilityLabel={`Last move ${move.from} to ${move.to}`}
      accessibilityRole="image"
      pointerEvents="none"
      style={[styles.arrowLayer, { width: boardSize, height: boardSize }]}
      testID={overlayTestID}
    >
      {[move.from, move.to].map((square) => {
        const pos = squareToTopLeft(square, squareSize, flipped);
        return (
          <View
            key={square}
            style={[
              styles.lastMoveSquare,
              {
                height: squareSize,
                left: pos.x,
                top: pos.y,
                width: squareSize
              }
            ]}
          />
        );
      })}
    </View>
  );
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

function MoveFeedbackOverlay({
  boardSize,
  flipped,
  move,
  result
}: {
  boardSize: number;
  flipped: boolean;
  move: BoardMove;
  result: "correct" | "wrong";
}): React.JSX.Element {
  const squareSize = boardSize / 8;
  const backgroundColor = result === "correct" ? "rgba(22, 163, 74, 0.34)" : "rgba(220, 38, 38, 0.32)";

  return (
    <View style={[styles.arrowLayer, { width: boardSize, height: boardSize }]} pointerEvents="none" testID="move-feedback-overlay">
      {[move.from, move.to].map((square) => {
        const pos = squareToTopLeft(square, squareSize, flipped);
        return (
          <View
            key={square}
            style={[
              styles.feedbackMoveSquare,
              {
                backgroundColor,
                height: squareSize,
                left: pos.x,
                top: pos.y,
                width: squareSize
              }
            ]}
          />
        );
      })}
    </View>
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
        const arrowStyle = ARROW_VISUAL_STYLES.candidate;
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

function HistoryPanel({
  adaptiveLayout,
  attempts,
  filtersExpanded,
  nowMs,
  performance,
  ratingKeys,
  runsByRatingKey,
  selectedRatingKey,
  timeRange,
  sourceFilter,
  resultFilter,
  ratingRangeFilter,
  sideFilter,
  themeFilters,
  namedThemeFilters,
  availableThemes,
  page,
  attentionReasons,
  themeCatalogPresentation,
  onRatingKeyChange,
  onTimeRangeChange,
  onSourceFilterChange,
  onResultFilterChange,
  onRatingRangeFilterChange,
  onSideFilterChange,
  onThemeFilterIntent,
  onAttentionReasonChange,
  onPageOffsetChange,
  onOpenAttempt,
  onOpenProgress,
  onFiltersExpandedChange,
  onResetFilters,
  onAttentionOnlyChange
}: {
  adaptiveLayout: AdaptiveLayout;
  attempts: HistoryAttemptView[];
  filtersExpanded: boolean;
  nowMs: number;
  performance: HistoryPerformance;
  ratingKeys: string[];
  runsByRatingKey: ReadonlyMap<string, { name: string; perPuzzleSeconds: number }>;
  selectedRatingKey: string | null;
  timeRange: HistoryTimeRange;
  sourceFilter: "all" | AttemptSource;
  resultFilter: HistoryResultFilter;
  ratingRangeFilter: HistoryRatingRangeFilter;
  sideFilter: "all" | PuzzleSide;
  themeFilters: readonly string[];
  namedThemeFilters: readonly string[];
  availableThemes: string[];
  page: { limit: number; offset: number; total: number; hasMore: boolean };
  attentionReasons: readonly HistoryAttentionReason[];
  themeCatalogPresentation?: ThemeCatalogPresentation;
  onRatingKeyChange: (ratingKey: string | null) => void;
  onTimeRangeChange: (range: HistoryTimeRange) => void;
  onSourceFilterChange: (source: "all" | AttemptSource) => void;
  onResultFilterChange: (result: HistoryResultFilter) => void;
  onRatingRangeFilterChange: (ratingRange: HistoryRatingRangeFilter) => void;
  onSideFilterChange: (side: "all" | PuzzleSide) => void;
  onThemeFilterIntent: (intent: ThemeChoiceIntent) => void;
  onAttentionReasonChange: (reason: HistoryAttentionReason) => void;
  onPageOffsetChange: (offset: number) => void;
  onOpenAttempt: (attemptId: string) => void;
  onOpenProgress?: () => void;
  onFiltersExpandedChange: (expanded: boolean) => void;
  onResetFilters: () => void;
  onAttentionOnlyChange: (attentionOnly: boolean) => void;
}): React.JSX.Element {
  const visibleAttempts = attempts;
  const attentionOnly = attentionReasons.length > 0;
  const ratingPoints = performance.charts.rating;
  const latestRating = ratingPoints[ratingPoints.length - 1]?.value;
  const selectedRun = selectedRatingKey ? runsByRatingKey.get(selectedRatingKey) : undefined;
  const activeFilterLabels = historyActiveFilterLabels({
    ratingKey: selectedRatingKey,
    runName: selectedRun?.name,
    runPerPuzzleSeconds: selectedRun?.perPuzzleSeconds,
    ratingRangeFilter,
    resultFilter,
    attentionReasons,
    sideFilter,
    sourceFilter,
    themeFilters: namedThemeFilters,
    timeRange
  });
  return (
    <View style={[styles.historyPanel, adaptiveLayout.usesWideContent ? styles.historyPanelWide : null]} testID="history-panel">
      <View style={styles.historyHeaderRow} testID="history-action-header">
        <Text style={styles.screenTitle}>History</Text>
        <View style={styles.historyHeaderActions}>
          {onOpenProgress ? (
            <HistoryProgressEntryButton onPress={onOpenProgress} />
          ) : null}
          {filtersExpanded ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset history filters"
              testID="history-filter-reset"
              style={styles.historyResetButton}
              onPress={onResetFilters}
            >
              <Text style={styles.historyResetButtonText}>Reset filters</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={filtersExpanded ? "Hide history filters" : "Show history filters"}
            accessibilityState={{ expanded: filtersExpanded }}
            testID="history-filter-toggle"
            style={[styles.reviewFilterButton, filtersExpanded ? styles.reviewFilterButtonActive : null]}
            onPress={() => onFiltersExpandedChange(!filtersExpanded)}
          >
            <FilterGlyph active={filtersExpanded} />
          </Pressable>
        </View>
      </View>

      <CollapsibleRegion
        contentTestID="history-advanced-filters"
        contentStyle={styles.historyAdvancedFilters}
        expanded={filtersExpanded}
      >
          <HistoryRatingFilters
            ratingKeys={ratingKeys}
            runsByRatingKey={runsByRatingKey}
            selectedRatingKey={selectedRatingKey}
            onRatingKeyChange={onRatingKeyChange}
          />
          <HistoryRangeFilters timeRange={timeRange} onTimeRangeChange={onTimeRangeChange} />
          <HistoryChipRow testID="history-source-filters">
            <FilterButton active={sourceFilter === "all"} label="All sources" testID="history-source-all" onPress={() => onSourceFilterChange("all")} />
            <FilterButton active={sourceFilter === "sprint"} label="Sprint" testID="history-source-sprint" onPress={() => onSourceFilterChange("sprint")} />
            <FilterButton active={sourceFilter === "scheduled_review"} label="Review" testID="history-source-review" onPress={() => onSourceFilterChange("scheduled_review")} />
          </HistoryChipRow>
          <HistoryChipRow testID="history-result-filters">
            <FilterButton active={resultFilter === "all"} label="All" testID="history-result-all" onPress={() => onResultFilterChange("all")} />
            <FilterButton active={resultFilter === "correct"} label="Correct" testID="history-result-correct" onPress={() => onResultFilterChange("correct")} />
            <FilterButton active={resultFilter === "wrong"} label="Wrong" testID="history-result-wrong" onPress={() => onResultFilterChange("wrong")} />
            <FilterButton active={resultFilter === "incomplete"} label="Incomplete" testID="history-result-incomplete" onPress={() => onResultFilterChange("incomplete")} />
          </HistoryChipRow>
          <HistoryChipRow testID="history-rating-range-filters">
            {HISTORY_RATING_RANGE_FILTERS.map((ratingRange) => (
              <FilterButton
                key={ratingRange.id}
                active={ratingRangeFilter === ratingRange.id}
                label={ratingRange.label}
                testID={`history-rating-range-${ratingRange.id}`}
                onPress={() => onRatingRangeFilterChange(ratingRange.id)}
              />
            ))}
          </HistoryChipRow>
          <View
            accessibilityLabel="Attention filters, match any"
            style={styles.historyFilterGroup}
            testID="history-attention-flags"
          >
            <Text style={styles.historyFilterGroupLabel}>Attention</Text>
            <HistoryChipRow testID="history-attention-flag-options">
              <FilterButton
                active={attentionReasons.includes("unclear")}
                label="Unclear"
                testID="history-attention-flag-unclear"
                onPress={() => onAttentionReasonChange("unclear")}
              />
              <FilterButton
                active={attentionReasons.includes("in_review")}
                label="In review"
                testID="history-attention-flag-in-review"
                onPress={() => onAttentionReasonChange("in_review")}
              />
              <FilterButton
                active={attentionReasons.includes("incomplete")}
                label="Incomplete"
                testID="history-attention-flag-incomplete"
                onPress={() => onAttentionReasonChange("incomplete")}
              />
            </HistoryChipRow>
          </View>
          <HistoryChipRow testID="history-side-filters">
            <FilterButton active={sideFilter === "all"} label="Both sides" testID="history-side-all" onPress={() => onSideFilterChange("all")} />
            <FilterButton active={sideFilter === "white"} label="White" testID="history-side-white" onPress={() => onSideFilterChange("white")} />
            <FilterButton active={sideFilter === "black"} label="Black" testID="history-side-black" onPress={() => onSideFilterChange("black")} />
          </HistoryChipRow>
          {themeCatalogPresentation ? (
            <HistoryThemeCatalogFilter
              presentation={themeCatalogPresentation}
              selectedThemes={themeFilters}
              onThemeIntent={onThemeFilterIntent}
            />
          ) : availableThemes.length > 0 ? (
            <HistoryChipRow testID="history-theme-filters">
              <FilterButton
                active={themeFilters.includes(ALL_THEMES_FILTER)}
                label="All themes"
                testID="history-theme-all"
                onPress={() => onThemeFilterIntent({ type: "select-all-themes" })}
              />
              {availableThemes.slice(0, 8).map((theme) => (
                <FilterButton
                  key={theme}
                  active={themeFilters.includes(theme)}
                  label={theme}
                  testID={`history-theme-${theme}`}
                  onPress={() => onThemeFilterIntent({ type: "toggle-theme", theme })}
                />
              ))}
            </HistoryChipRow>
          ) : null}
      </CollapsibleRegion>

      <View style={styles.historyTopFilterStack} testID="history-primary-filters">
        <HistoryAttentionFilter
          attentionOnly={attentionOnly}
          onChange={onAttentionOnlyChange}
        />
        {attentionOnly ? (
          <Text style={styles.helperText} testID="history-attention-explanation">
            Needs attention includes Incomplete, Unclear, or In Review Sprint attempts.
          </Text>
        ) : null}
      </View>

      {selectedRatingKey ? (
        <View style={styles.historyPerformanceCard} testID="history-performance-card">
          <View style={styles.historyPerformanceHeader}>
            <View>
              <Text style={styles.panelTitle}>Rating Trend</Text>
              <Text testID="history-performance-context" style={styles.helperText}>
                {`${historyRatingKeyLabel(selectedRatingKey, selectedRun?.name, selectedRun?.perPuzzleSeconds)} · ${historyRangeLabel(timeRange)}`}
              </Text>
            </View>
            <View style={styles.historyMetricSummary}>
              <Text testID="history-chart-value" style={styles.historyAccuracy}>{latestRating ? String(latestRating) : "—"}</Text>
              <Text testID="history-chart-label" style={styles.helperText}>Rating</Text>
            </View>
          </View>
          <HistoryRatingTrendChart points={ratingPoints} />
        </View>
      ) : null}

      <HistoryActiveFilterStrip compact labels={activeFilterLabels} />

      <View style={styles.historyPageRow}>
        <Text style={styles.helperText}>
          {page.total === 0 ? "0 results" : `${page.offset + 1}-${Math.min(page.offset + attempts.length, page.total)} of ${page.total}`}
        </Text>
        <View style={styles.iconButtonRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous history page"
            accessibilityState={{ disabled: page.offset === 0 }}
            disabled={page.offset === 0}
            testID="history-page-previous"
            style={[styles.iconButton, page.offset === 0 ? styles.disabledButton : null]}
            onPress={() => onPageOffsetChange(Math.max(0, page.offset - page.limit))}
          >
            <ChevronGlyph direction="left" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next history page"
            accessibilityState={{ disabled: !page.hasMore }}
            disabled={!page.hasMore}
            testID="history-page-next"
            style={[styles.iconButton, !page.hasMore ? styles.disabledButton : null]}
            onPress={() => onPageOffsetChange(page.offset + page.limit)}
          >
            <ChevronGlyph direction="right" />
          </Pressable>
        </View>
      </View>
      {visibleAttempts.length === 0 ? (
        <Text
          accessibilityLabel="History has no attempts"
          style={styles.listText}
          testID="history-empty-state"
        >
          No attempts
        </Text>
      ) : null}
      {visibleAttempts.map((attempt) => (
        <HistoryAttemptRow
          key={attempt.id}
          attempt={attempt}
          nowMs={nowMs}
          onOpen={() => onOpenAttempt(attempt.id)}
        />
      ))}
    </View>
  );
}

function HistoryThemeCatalogFilter({
  onThemeIntent,
  presentation,
  selectedThemes
}: {
  onThemeIntent: (intent: ThemeChoiceIntent) => void;
  presentation: ThemeCatalogPresentation;
  selectedThemes: readonly string[];
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const selectedThemeLabels = selectedThemes
    .filter((theme) => theme !== ALL_THEMES_FILTER)
    .map(customThemeLabel);
  const selectedThemeDetail = selectedThemeLabels.length === 0
    ? "All themes"
    : selectedThemeLabels.join(" · ");
  return (
    <View style={styles.historyThemeFilterSection} testID="history-theme-filters">
      <Pressable
        accessibilityLabel={expanded ? "Hide theme filters" : "Show theme filters"}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.historyThemeDisclosure}
        testID="history-theme-disclosure"
        onPress={() => setExpanded((current) => !current)}
      >
        <View style={styles.historyThemeDisclosureCopy}>
          <Text style={styles.themeCatalogTitle}>Themes</Text>
          <Text
            accessibilityLabel={`Selected themes: ${selectedThemeDetail}`}
            ellipsizeMode="tail"
            numberOfLines={1}
            style={styles.historyThemeSummary}
            testID="history-theme-selection-detail"
          >
            {selectedThemeDetail}
          </Text>
        </View>
        <DisclosureChevron
          expanded={expanded}
          testID="history-theme-animated-chevron"
        />
      </Pressable>
      <CollapsibleRegion
        contentTestID="history-theme-catalog"
        contentStyle={styles.historyThemeCatalogContent}
        expanded={expanded}
      >
          <View style={styles.historyThemeAllRow}>
            <FilterButton
              active={selectedThemes.includes(ALL_THEMES_FILTER)}
              label="All themes"
              testID="history-theme-all"
              onPress={() => onThemeIntent({ type: "select-all-themes" })}
            />
          </View>
          {presentation.groups.map((group) => (
            <View key={group.label} style={styles.themeCatalogGroup}>
              <Text style={styles.themeCatalogGroupLabel}>{group.label}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                testID={`history-theme-filter-rail-${safeTestId(group.label)}`}
              >
                <View style={styles.themeCatalogRailContent}>
                  {group.themes.map((theme) => (
                    <FilterButton
                      key={theme}
                      active={selectedThemes.includes(theme)}
                      label={customThemeLabel(theme)}
                      testID={`history-theme-${safeTestId(customThemeLabel(theme))}`}
                      onPress={() => onThemeIntent({ type: "toggle-theme", theme })}
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          ))}
      </CollapsibleRegion>
    </View>
  );
}

type HistoryActiveFilterInput = {
  attentionReasons: readonly HistoryAttentionReason[];
  ratingKey: string | null;
  runName?: string;
  runPerPuzzleSeconds?: number;
  ratingRangeFilter: HistoryRatingRangeFilter;
  resultFilter: HistoryResultFilter;
  sideFilter: "all" | PuzzleSide;
  sourceFilter: "all" | AttemptSource;
  themeFilters: readonly string[];
  timeRange: HistoryTimeRange;
};

function historyActiveFilterLabels({
  attentionReasons,
  ratingKey,
  runName,
  runPerPuzzleSeconds,
  ratingRangeFilter,
  resultFilter,
  sideFilter,
  sourceFilter,
  themeFilters,
  timeRange
}: HistoryActiveFilterInput): string[] {
  const labels = [
    historyRangeLabel(timeRange),
    ratingKey ? historyRatingKeyLabel(ratingKey, runName, runPerPuzzleSeconds) : "All puzzles"
  ];
  if (sourceFilter !== "all") {
    labels.push(sourceFilter === "scheduled_review" ? "Source: Review" : "Source: Sprint");
  }
  if (resultFilter !== "all") {
    labels.push(
      resultFilter === "correct"
        ? "Result: Correct"
        : resultFilter === "wrong"
          ? "Result: Wrong"
          : "Result: Incomplete"
    );
  }
  if (ratingRangeFilter !== "all") {
    labels.push(HISTORY_RATING_RANGE_FILTERS.find((filter) => filter.id === ratingRangeFilter)?.label ?? ratingRangeFilter);
  }
  if (attentionReasons.length === 1) {
    labels.push(
      attentionReasons[0] === "unclear"
        ? "Attention: Unclear"
        : attentionReasons[0] === "in_review"
          ? "Attention: In review"
          : "Attention: Incomplete"
    );
  }
  if (sideFilter !== "all") {
    labels.push(sideFilter === "white" ? "White" : "Black");
  }
  if (themeFilters.length === 1) {
    labels.push(customThemeLabel(themeFilters[0]!));
  } else if (themeFilters.length > 1) {
    labels.push(`${themeFilters.length} themes selected`);
  }
  return labels;
}

function historyAttentionQueryForSelection(
  attentionReasons: readonly HistoryAttentionReason[]
): { attentionReasons?: HistoryAttentionReason[] } {
  return attentionReasons.length === 0
    ? {}
    : { attentionReasons: [...attentionReasons] };
}

function HistoryActiveFilterStrip({
  compact = false,
  labels
}: {
  compact?: boolean;
  labels: string[];
}): React.JSX.Element {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="history-active-filter-summary"
    >
      <View style={compact ? styles.historyCompactFilterSummary : styles.historyChipContent}>
        {labels.map((label, index) => (
          <React.Fragment key={`${label}-${index}`}>
            {compact && index > 0 ? (
              <Text style={styles.historyCompactFilterSeparator}>·</Text>
            ) : null}
            <View
              style={compact ? styles.historyCompactFilterLabel : styles.historyActiveFilterChip}
              testID={`history-active-filter-${index}`}
            >
              <Text style={compact ? styles.historyCompactFilterText : styles.historyActiveFilterText}>
                {label}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </ScrollView>
  );
}

const HISTORY_RATING_RANGE_FILTERS: ReadonlyArray<{ id: HistoryRatingRangeFilter; label: string }> = [
  { id: "all", label: "All ratings" },
  { id: "under1000", label: "<1000" },
  { id: "1000-1399", label: "1000-1399" },
  { id: "1400-plus", label: "1400+" }
];

function historyRatingRangeFilterToQuery(filter: HistoryRatingRangeFilter): { minRating?: number; maxRating?: number } {
  if (filter === "under1000") {
    return { maxRating: 999 };
  }
  if (filter === "1000-1399") {
    return { minRating: 1000, maxRating: 1399 };
  }
  if (filter === "1400-plus") {
    return { minRating: 1400 };
  }
  return {};
}

// Cap the rendered points so long ranges stay smooth without stacking
// hundreds of segment Views; downsampling always keeps first and last.
const HISTORY_LINE_CHART_MAX_POINTS = 64;
// Individual dots read as noise once the line is dense; past this count only
// the latest-rating dot is drawn.
// Vertical band used by the plot inside the 60px line layer: value min maps
// to y=48, value max to y=6 (48 - 42).
const HISTORY_LINE_CHART_BASE_Y = 48;
const HISTORY_LINE_CHART_PLOT_HEIGHT = 42;
const HISTORY_LINE_CHART_LAYER_HEIGHT = 60;
const HISTORY_LINE_TOOLTIP_WIDTH = 104;
const HISTORY_LINE_TOOLTIP_HEIGHT = 42;
const HISTORY_LINE_TOOLTIP_GAP = 8;

function downsampleHistoryRatingPoints(
  points: Array<{ key: string; value: number }>,
  maxPoints: number
): Array<{ key: string; value: number }> {
  if (points.length <= maxPoints) {
    return points;
  }
  const lastIndex = points.length - 1;
  const sampled: Array<{ key: string; value: number }> = [];
  let previousIndex = -1;
  for (let i = 0; i < maxPoints; i++) {
    const index = Math.round((i * lastIndex) / (maxPoints - 1));
    if (index !== previousIndex) {
      sampled.push(points[index]);
      previousIndex = index;
    }
  }
  return sampled;
}

function HistoryRatingTrendChart({
  points
}: {
  points: HistoryPerformancePoint[];
}): React.JSX.Element {
  const displayed = downsampleHistoryRatingPoints(points, HISTORY_LINE_CHART_MAX_POINTS);
  if (displayed.length === 0) {
    return (
      <View style={styles.historyChartEmpty} testID="history-performance-chart">
        <Text style={styles.helperText}>No rating data in this range.</Text>
      </View>
    );
  }
  return <HistoryRatingLineChart points={displayed} />;
}

function HistoryRatingLineChart({
  points
}: {
  points: HistoryPerformancePoint[];
}): React.JSX.Element {
  // Segment geometry needs the layer's pixel width: percent-based math mixed
  // px rise with % run, which rendered detached segments at wrong angles.
  const [plotWidth, setPlotWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [scrubberX, setScrubberX] = useState<number | null>(null);
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const stepPx = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const pointY = (value: number) =>
    HISTORY_LINE_CHART_BASE_Y - ((value - min) / span) * HISTORY_LINE_CHART_PLOT_HEIGHT;
  const selectedPoint = selectedIndex === null ? null : points[selectedIndex];
  const selectedPointLabel = selectedPoint ? historyRatingPointLabel(selectedPoint) : null;
  const selectedX = selectedIndex === null
    ? 0
    : points.length > 1
      ? selectedIndex * stepPx
      : plotWidth / 2;
  const activeX = scrubberX ?? selectedX;
  const tooltipLeft = selectedPoint
    ? activeX > plotWidth / 2
      ? Math.max(0, activeX - HISTORY_LINE_TOOLTIP_WIDTH - HISTORY_LINE_TOOLTIP_GAP)
      : Math.min(
          Math.max(0, plotWidth - HISTORY_LINE_TOOLTIP_WIDTH),
          activeX + HISTORY_LINE_TOOLTIP_GAP
        )
    : 0;
  const tooltipTop = selectedPoint
    ? Math.max(
        0,
        Math.min(
          HISTORY_LINE_CHART_LAYER_HEIGHT - HISTORY_LINE_TOOLTIP_HEIGHT,
          pointY(selectedPoint.value) - HISTORY_LINE_TOOLTIP_HEIGHT / 2
        )
      )
    : 0;
  const smoothedPoints = plotWidth > 0
    ? smoothHistoryRatingPoints(points.map((point, index) => ({ x: index * stepPx, y: pointY(point.value) })))
    : [];

  const selectNearestPoint = (locationX: number): void => {
    if (plotWidth <= 0) {
      return;
    }
    const nextScrubberX = Math.max(0, Math.min(plotWidth, locationX));
    const ratio = nextScrubberX / plotWidth;
    setScrubberX(nextScrubberX);
    setSelectedIndex(points.length === 1 ? 0 : Math.round(ratio * (points.length - 1)));
  };

  const clearSelection = (): void => {
    setSelectedIndex(null);
    setScrubberX(null);
  };

  return (
    <View style={styles.historyLineChart} testID="history-performance-chart">
      <View style={styles.historyLineGrid} />
      <View style={[styles.historyLineGrid, styles.historyLineGridMiddle]} />
      <View style={[styles.historyLineGrid, styles.historyLineGridBottom]} />
      <View
        style={styles.historyLineLayer}
        testID="history-chart-line"
        onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)}
        accessibilityRole="adjustable"
        accessibilityLabel={selectedPointLabel ?? "Rating trend. Drag across the chart to inspect dates and ratings."}
        onStartShouldSetResponderCapture={() => true}
        onMoveShouldSetResponderCapture={() => true}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => selectNearestPoint(event.nativeEvent.locationX)}
        onResponderMove={(event) => selectNearestPoint(event.nativeEvent.locationX)}
        onResponderTerminationRequest={() => false}
        onResponderRelease={clearSelection}
        onResponderTerminate={clearSelection}
      >
        {smoothedPoints.slice(0, -1).map((point, index) => {
              const next = smoothedPoints[index + 1] ?? point;
              const x1 = point.x;
              const x2 = next.x;
              const y1 = point.y;
              const y2 = next.y;
              const length = Math.hypot(x2 - x1, y2 - y1);
              const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
              // RN rotates around the view's center, so center the segment on
              // the midpoint of its two data points; endpoints then land on
              // the dots exactly.
              return (
                <View
                  key={`curve-${index}`}
                  style={[
                    styles.historyLineSegment,
                    {
                      left: (x1 + x2) / 2 - length / 2,
                      top: (y1 + y2) / 2 - 1,
                      transform: [{ rotate: `${angle}deg` }],
                      width: length
                    }
                  ]}
                  testID={`history-chart-line-segment-${index}`}
                />
              );
            })}
        {selectedPoint ? (
          <>
            <View style={[styles.historyLineSelectionGuide, { left: activeX }]} testID="history-chart-selection-guide" />
            <View
              style={[styles.historyLineSelectionPoint, { left: selectedX, top: pointY(selectedPoint.value) }]}
              testID="history-chart-selection-point"
            />
            <View
              style={[
                styles.historyLineTooltip,
                { left: tooltipLeft, top: tooltipTop }
              ]}
              pointerEvents="none"
              testID="history-chart-tooltip"
            >
              <Text style={styles.historyLineTooltipRating}>Rating {selectedPoint.value}</Text>
              <Text style={styles.historyLineTooltipDate}>
                {selectedPoint.completedAt ? formatLocalCalendarDate(selectedPoint.completedAt) : formatHistoryRatingDate(selectedPoint.key)}
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

function smoothHistoryRatingPoints(
  points: Array<{ x: number; y: number }>,
  samplesPerSegment = 6
): Array<{ x: number; y: number }> {
  if (points.length < 3) {
    return points;
  }
  const smoothed: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    for (let sample = 0; sample < samplesPerSegment; sample += 1) {
      const t = sample / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      smoothed.push({
        x: p1.x + (p2.x - p1.x) * t,
        y: 0.5 * (
          2 * p1.y
          + (-p0.y + p2.y) * t
          + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
          + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
        )
      });
    }
  }
  smoothed.push(points[points.length - 1]);
  return smoothed;
}

function formatHistoryRatingDate(key: string): string {
  const embeddedIsoDate = key.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/)?.[0];
  const parsed = new Date(embeddedIsoDate ?? (key.includes("T") ? key : `${key}T12:00:00`));
  if (!Number.isFinite(parsed.getTime())) {
    return key;
  }
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function historyRatingPointLabel(point: HistoryPerformancePoint): string {
  const dateLabel = point.completedAt ? formatLocalCalendarDate(point.completedAt) : formatHistoryRatingDate(point.key);
  return `${dateLabel} · Rating ${point.value}`;
}

function emptyHistoryPerformance(): HistoryPerformance {
  return {
    correctCount: 0,
    wrongCount: 0,
    accuracyPercent: 0,
    charts: {
      rating: [],
      "wins-losses": [],
      accuracy: [],
      solved: [],
      "mistake-rate": [],
      "review-due": []
    }
  };
}

function historyRatingKeyLabel(
  ratingKey: string,
  runName?: string,
  runPerPuzzleSeconds?: number
): string {
  const speed = runPerPuzzleSeconds ?? Number(ratingKey.match(/\/(\d+)\b/)?.[1]);
  const speedLabel = speed ? ` · ${speed}s pace` : "";
  return `${runName ?? ratingLabelFromKey(ratingKey)}${speedLabel}`;
}

function ResultBadgeGlyph({ tone }: { tone: "correct" | "wrong" | "incomplete" }): React.JSX.Element {
  if (tone === "correct") {
    return (
      <View style={styles.resultBadgeGlyphCanvas} testID="result-badge-correct-glyph">
        <View style={[styles.resultBadgeGlyphLine, styles.resultBadgeCheckShort]} />
        <View style={[styles.resultBadgeGlyphLine, styles.resultBadgeCheckLong]} />
      </View>
    );
  }

  if (tone === "incomplete") {
    return (
      <View style={styles.resultBadgeGlyphCanvas} testID="result-badge-incomplete-glyph">
        <View style={[styles.resultBadgeGlyphLine, styles.resultBadgeIncompleteDash]} />
      </View>
    );
  }

  return (
    <View style={styles.resultBadgeGlyphCanvas} testID="result-badge-wrong-glyph">
      <View style={[styles.resultBadgeGlyphLine, styles.resultBadgeCrossForward]} />
      <View style={[styles.resultBadgeGlyphLine, styles.resultBadgeCrossBackward]} />
    </View>
  );
}

function HistoryChipRow({
  children,
  contentStyle,
  testID
}: {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  testID: string;
}): React.JSX.Element {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      testID={testID}
    >
      <View style={[styles.historyChipContent, contentStyle]}>
        {children}
      </View>
    </ScrollView>
  );
}

function HistoryRatingFilters({
  onRatingKeyChange,
  ratingKeys,
  runsByRatingKey,
  selectedRatingKey
}: {
  onRatingKeyChange: (ratingKey: string | null) => void;
  ratingKeys: string[];
  runsByRatingKey: ReadonlyMap<string, { name: string; perPuzzleSeconds: number }>;
  selectedRatingKey: string | null;
}): React.JSX.Element {
  return (
    <HistoryChipRow testID="history-rating-filters">
      <FilterButton
        active={selectedRatingKey === null}
        label="All Puzzles"
        testID="history-rating-all"
        onPress={() => onRatingKeyChange(null)}
      />
      {ratingKeys.map((ratingKey) => (
        <FilterButton
          key={ratingKey}
          active={selectedRatingKey === ratingKey}
          label={historyRatingKeyLabel(
            ratingKey,
            runsByRatingKey.get(ratingKey)?.name,
            runsByRatingKey.get(ratingKey)?.perPuzzleSeconds
          )}
          testID={`history-rating-${ratingKey}`}
          onPress={() => onRatingKeyChange(ratingKey)}
        />
      ))}
    </HistoryChipRow>
  );
}

function HistoryRangeFilters({
  onTimeRangeChange,
  timeRange
}: {
  onTimeRangeChange: (range: HistoryTimeRange) => void;
  timeRange: HistoryTimeRange;
}): React.JSX.Element {
  return (
    <HistoryChipRow testID="history-range-filters">
      {(["7d", "30d", "90d", "1y", "max"] as const).map((range) => (
        <FilterButton
          key={range}
          active={timeRange === range}
          label={historyRangeLabel(range)}
          testID={`history-range-${range}`}
          onPress={() => onTimeRangeChange(range)}
        />
      ))}
    </HistoryChipRow>
  );
}

function HistoryAttentionFilter({
  attentionOnly,
  onChange
}: {
  attentionOnly: boolean;
  onChange: (attentionOnly: boolean) => void;
}): React.JSX.Element {
  return (
    <View
      accessibilityLabel="History view"
      role="radiogroup"
      style={styles.historyAttentionFilter}
      testID="history-attention-filter"
    >
      <Pressable
        accessibilityLabel="Needs attention: Sprint attempts that are Incomplete, unclear, or in Review"
        accessibilityRole="radio"
        accessibilityState={{ checked: attentionOnly }}
        aria-checked={attentionOnly}
        onPress={() => onChange(true)}
        style={[
          styles.historyAttentionOption,
          attentionOnly ? styles.historyAttentionOptionActive : null
        ]}
        testID="history-attention-needs-attention"
      >
        <Text
          style={[
            styles.historyAttentionOptionText,
            attentionOnly ? styles.historyAttentionOptionTextActive : null
          ]}
        >
          Needs attention
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel="All attempts"
        accessibilityRole="radio"
        accessibilityState={{ checked: !attentionOnly }}
        aria-checked={!attentionOnly}
        onPress={() => onChange(false)}
        style={[
          styles.historyAttentionOption,
          !attentionOnly ? styles.historyAttentionOptionActive : null
        ]}
        testID="history-attention-all"
      >
        <Text
          style={[
            styles.historyAttentionOptionText,
            !attentionOnly ? styles.historyAttentionOptionTextActive : null
          ]}
        >
          All
        </Text>
      </Pressable>
    </View>
  );
}

function HistoryAttemptRow({
  attempt,
  nowMs,
  onOpen
}: {
  attempt: HistoryAttemptView;
  nowMs: number;
  onOpen: () => void;
}): React.JSX.Element {
  const detail = normalizeHistoryAttemptDetail(attempt);
  const persistedTimingStatus = attempt.timingStatus
    ?? (attempt.result === "timed_out" ? "timed_out" : null);
  const isIncomplete = detail.result === "incomplete";
  const timingStatus = persistedTimingStatus;
  const isTimedOut = !isIncomplete && (timingStatus === "timed_out" || detail.result === "timed_out");
  const isWrong = detail.result === "wrong" && !isTimedOut;
  const isCorrect = detail.result === "correct";
  const isUnclear = isAttemptMarkedUnclear(attempt);
  const dateLabel = detail.completedAt === null
    ? "Date unavailable"
    : formatLocalCalendarDateLabel(detail.completedAt, { now: nowMs });
  const exactDateLabel = detail.completedAt === null ? null : formatLocalCalendarDate(detail.completedAt);
  const accessibleDateLabel = exactDateLabel === null || dateLabel === exactDateLabel
    ? dateLabel
    : `${dateLabel}, ${exactDateLabel}`;
  const visibleThemes = attempt.curatedThemes;
  const pace = historyAttemptSpeedSeconds(attempt);
  const paceLabel = pace === null ? null : `${pace}s pace`;
  const resultLabel = isIncomplete
    ? "Incomplete"
    : isTimedOut ? "Timed out" : isWrong ? "Wrong move" : isCorrect ? "Correct" : "Result unavailable";
  const submittedMoveLabel = isIncomplete
    ? "Sprint ended before completion"
    : isTimedOut
    ? "No move submitted"
    : detail.submittedMove === null || detail.expectedMove === null
    ? "Moves unavailable"
    : isWrong
      ? `Played ${detail.submittedMove} · Best ${detail.expectedMove}`
      : `Move ${detail.submittedMove}`;
  const sourceLabel = historyAttemptSourceLabel(detail.source);
  const themeContext = visibleThemes.map(customThemeLabel).join(", ");
  const compactContext = [themeContext, paceLabel].filter(Boolean).join(" · ");
  const puzzleIdentity = `ID ${attempt.puzzleId} · Rating ${attempt.puzzleRating}`;
  const durationLabel = detail.elapsedSeconds === null ? "Duration unavailable" : `${detail.elapsedSeconds}s`;
  const compactMeta = `${sourceLabel} · ${durationLabel} · ${dateLabel}`;
  const accessibleMeta = `${sourceLabel} · ${durationLabel} · ${accessibleDateLabel}`;
  const rowAccessibilityLabel = [
    `Replay ${historyAttemptModeLabel(detail.mode)} puzzle`,
    resultLabel,
    submittedMoveLabel,
    isUnclear ? "Marked unclear" : null,
    timingStatus === "slow" ? "Slow" : isTimedOut ? "Timed out" : null,
    puzzleIdentity,
    compactContext,
    accessibleMeta
  ].filter(Boolean).join(", ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rowAccessibilityLabel}
      testID={`history-attempt-${attempt.id}`}
      style={styles.historyAttemptCard}
      onPress={onOpen}
    >
      <View
        style={[
          styles.historyResultBadge,
          isIncomplete
            ? styles.historyResultIncomplete
            : isTimedOut || isWrong
            ? styles.historyResultWrong
            : isCorrect ? styles.historyResultCorrect : styles.historyResultUnknown
        ]}
        testID={`history-attempt-${attempt.id}-badge`}
      >
        {isIncomplete || isTimedOut || isWrong || isCorrect ? (
          <ResultBadgeGlyph tone={isIncomplete ? "incomplete" : isTimedOut || isWrong ? "wrong" : "correct"} />
        ) : (
          <Text style={styles.historyResultUnknownText}>?</Text>
        )}
      </View>
      <View style={styles.historyAttemptCopy}>
        <View style={styles.historyAttemptHeader}>
          <Text style={styles.historyRowTitle}>{attempt.runName ?? historyAttemptModeLabel(detail.mode)}</Text>
          <Text testID={`history-attempt-${attempt.id}-result`} style={styles.helperText}>{resultLabel}</Text>
        </View>
        <Text testID={`history-attempt-${attempt.id}-identity`} style={styles.helperText}>{puzzleIdentity}</Text>
        {visibleThemes.length > 0 ? (
          <HistoryThemeList attemptId={attempt.id} themes={visibleThemes} />
        ) : (
          <Text testID={`history-attempt-${attempt.id}-context`} style={styles.helperText}>{compactContext}</Text>
        )}
        {visibleThemes.length > 0 && paceLabel ? (
          <Text testID={`history-attempt-${attempt.id}-pace`} style={styles.helperText}>{paceLabel}</Text>
        ) : null}
        <Text testID={`history-attempt-${attempt.id}-meta`} style={styles.helperText}>{compactMeta}</Text>
      </View>
      {isUnclear ? (
        <View style={styles.historyUnclearBadge} testID={`history-attempt-${attempt.id}-unclear`}>
          <Text style={styles.historyUnclearBadgeText}>Unclear</Text>
        </View>
      ) : null}
      {timingStatus === "slow" ? (
        <View
          style={[
            styles.historyTimingBadge,
            styles.historyTimingBadgeSlow
          ]}
          testID={`history-attempt-${attempt.id}-${timingStatus}`}
        >
          <Text
            style={[
              styles.historyTimingBadgeText,
              styles.historyTimingBadgeTextSlow
            ]}
          >
            Slow
          </Text>
        </View>
      ) : null}
      <View style={styles.historyAttemptChevron} testID={`history-attempt-${attempt.id}-chevron`}>
        <ChevronGlyph direction="right" />
      </View>
    </Pressable>
  );
}

function HistoryThemeList({
  attemptId,
  themes
}: {
  attemptId: string;
  themes: readonly string[];
}): React.JSX.Element {
  return (
    <ThemeTagRail testID={`history-attempt-${attemptId}-themes`} themes={themes} />
  );
}

function ThemeTagRail({
  centered = false,
  testID,
  themes
}: {
  centered?: boolean;
  testID: string;
  themes: readonly string[];
}): React.JSX.Element {
  return (
    <ScrollView
      horizontal
      contentContainerStyle={centered ? styles.themeTagRailCenteredContent : undefined}
      showsHorizontalScrollIndicator={false}
      style={[
        styles.themeTagRailViewport,
        centered ? styles.themeTagRailCenteredViewport : null
      ]}
      testID={testID}
    >
      <View style={[styles.historyThemeRail, centered ? styles.historyThemeRailCentered : null]}>
        {themes.map((theme) => (
          <View key={theme} style={styles.historyThemeChip} testID={`${testID}-${safeTestId(theme)}`}>
            <Text style={styles.historyThemeChipText}>{customThemeLabel(theme)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function historyAttemptModeLabel(mode: SprintMode | null): string {
  return mode === null ? "Unknown mode" : modeLabel(mode);
}

function historyAttemptSourceLabel(source: AttemptSource | null): string {
  return source === "scheduled_review" ? "Review" : source === "sprint" ? "Sprint" : "Unknown source";
}

function FilterButton({
  active,
  label,
  testID,
  onPress
}: {
  active: boolean;
  label: string;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      testID={testID}
      style={[styles.filterButton, active ? styles.filterButtonActive : null]}
      onPress={onPress}
    >
      <Text style={[styles.filterButtonText, active ? styles.filterButtonTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function FilterGlyph({ active }: { active: boolean }): React.JSX.Element {
  const color = active ? "#2563EB" : "#334155";
  return (
    <View style={styles.filterGlyph} testID="filter-glyph">
      <View style={[styles.filterGlyphLine, { backgroundColor: color }]}>
        <View style={[styles.filterGlyphKnob, styles.filterGlyphKnobRight, { backgroundColor: color }]} />
      </View>
      <View style={[styles.filterGlyphLine, { backgroundColor: color }]}>
        <View style={[styles.filterGlyphKnob, styles.filterGlyphKnobLeft, { backgroundColor: color }]} />
      </View>
      <View style={[styles.filterGlyphLine, { backgroundColor: color }]}>
        <View style={[styles.filterGlyphKnob, styles.filterGlyphKnobMiddle, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

function PlusGlyph(): React.JSX.Element {
  return (
    <View style={styles.plusGlyph} testID="plus-glyph">
      <View style={[styles.plusGlyphLine, styles.plusGlyphHorizontal]} />
      <View style={[styles.plusGlyphLine, styles.plusGlyphVertical]} />
    </View>
  );
}

function MinusGlyph(): React.JSX.Element {
  return (
    <View style={styles.minusGlyph} testID="minus-glyph">
      <View style={styles.minusGlyphLine} />
    </View>
  );
}

function CloseGlyph({
  color = "#111827",
  testID = "close-glyph"
}: {
  color?: string;
  testID?: string;
} = {}): React.JSX.Element {
  return (
    <View style={styles.closeGlyph} testID={testID}>
      <View style={[styles.closeGlyphLine, styles.closeGlyphForward, { backgroundColor: color }]} />
      <View style={[styles.closeGlyphLine, styles.closeGlyphBackward, { backgroundColor: color }]} />
    </View>
  );
}

function MoreGlyph(): React.JSX.Element {
  return (
    <View style={styles.moreGlyph} testID="more-glyph">
      <View style={styles.moreGlyphDot} />
      <View style={styles.moreGlyphDot} />
      <View style={styles.moreGlyphDot} />
    </View>
  );
}

function PauseGlyph(): React.JSX.Element {
  return (
    <View style={styles.pauseGlyph} testID="pause-glyph">
      <View style={styles.pauseGlyphBar} />
      <View style={styles.pauseGlyphBar} />
    </View>
  );
}

function PlayGlyph(): React.JSX.Element {
  return (
    <View style={styles.playGlyph} testID="play-glyph" />
  );
}

function ResultTrendGlyph(): React.JSX.Element {
  return (
    <View style={styles.resultTrendGlyph} testID="result-trend-glyph">
      <View style={[styles.resultTrendGlyphDot, styles.resultTrendGlyphDotStart]} />
      <View style={[styles.resultTrendGlyphDot, styles.resultTrendGlyphDotMiddle]} />
      <View style={[styles.resultTrendGlyphDot, styles.resultTrendGlyphDotEnd]} />
      <View style={[styles.resultTrendGlyphLine, styles.resultTrendGlyphLineFirst]} />
      <View style={[styles.resultTrendGlyphLine, styles.resultTrendGlyphLineSecond]} />
    </View>
  );
}

function ChevronGlyph({
  direction
}: {
  direction: "down" | "left" | "right" | "up";
}): React.JSX.Element {
  const directionStyle = direction === "left"
    ? styles.chevronGlyphLeft
    : direction === "right"
      ? styles.chevronGlyphRight
      : direction === "up"
        ? styles.chevronGlyphUp
        : styles.chevronGlyphDown;
  return (
    <View style={styles.chevronGlyphCanvas} testID={`chevron-${direction}-glyph`}>
      <View style={[styles.chevronGlyph, directionStyle]} />
    </View>
  );
}

function CollapsibleRegion({
  children,
  contentTestID,
  contentStyle,
  expanded
}: {
  children: React.ReactNode;
  contentTestID: string;
  contentStyle?: StyleProp<ViewStyle>;
  expanded: boolean;
}): React.JSX.Element | null {
  return (
    <AnimatedCollapsibleRegion
      contentTestID={contentTestID}
      contentStyle={contentStyle}
      expanded={expanded}
    >
      {children}
    </AnimatedCollapsibleRegion>
  );
}

function AnimatedCollapsibleRegion({
  children,
  contentTestID,
  contentStyle,
  expanded
}: {
  children: React.ReactNode;
  contentTestID: string;
  contentStyle?: StyleProp<ViewStyle>;
  expanded: boolean;
}): React.JSX.Element | null {
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const [contentHeight, setContentHeight] = useState(0);
  const durationMs = DISCLOSURE_MOTION_DURATION_MS;

  useEffect(() => {
    progress.stopAnimation();
    Animated.timing(progress, {
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
      toValue: expanded ? 1 : 0,
      useNativeDriver: false
    }).start();
  }, [durationMs, expanded, progress]);

  useEffect(() => {
    if (!expanded || contentHeight <= 0) {
      return;
    }
    progress.stopAnimation();
    Animated.timing(progress, {
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: false
    }).start();
  }, [contentHeight, durationMs, expanded, progress]);

  const animatedHeight = contentHeight > 0
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, contentHeight] })
    : expanded
      ? undefined
      : 0;
  const shouldMeasureInFlow = expanded && contentHeight === 0;
  const opacity = progress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0.55, 1]
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-4, 0]
  });

  return (
    <Animated.View
      aria-hidden={!expanded}
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
      pointerEvents={expanded ? "auto" : "none"}
      style={[
        styles.collapsibleMotionClip,
        { height: animatedHeight, opacity, transform: [{ translateY }] }
      ]}
      testID={`${contentTestID}-motion`}
    >
      <View
        style={[
          contentStyle,
          shouldMeasureInFlow ? null : styles.collapsibleMotionContent
        ]}
        testID={contentTestID}
        onLayout={(event: LayoutChangeEvent) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height);
          if (nextHeight > 0 && nextHeight !== contentHeight) {
            setContentHeight(nextHeight);
          }
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

function DisclosureChevron({
  expanded,
  testID
}: {
  expanded: boolean;
  testID?: string;
}): React.JSX.Element {
  return (
    <AnimatedDisclosureChevron
      expanded={expanded}
      testID={testID}
    />
  );
}

function AnimatedDisclosureChevron({
  expanded,
  testID
}: {
  expanded: boolean;
  testID?: string;
}): React.JSX.Element {
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  useEffect(() => {
    progress.stopAnimation();
    Animated.timing(progress, {
      duration: DISCLOSURE_MOTION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      toValue: expanded ? 1 : 0,
      useNativeDriver: false
    }).start();
  }, [expanded, progress]);

  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"]
  });
  return (
    <Animated.View
      style={[styles.disclosureChevronMotion, { transform: [{ rotate }] }]}
      testID={testID}
    >
      <ChevronGlyph direction="down" />
    </Animated.View>
  );
}

function FlipGlyph(): React.JSX.Element {
  return (
    <View style={styles.flipGlyph} testID="flip-glyph">
      <View style={styles.flipGlyphTrackTop} />
      <View style={styles.flipGlyphTrackBottom} />
      <View style={styles.flipGlyphHeadRight} />
      <View style={styles.flipGlyphHeadLeft} />
    </View>
  );
}

function SearchGlyph(): React.JSX.Element {
  return (
    <View style={styles.searchGlyph} testID="search-glyph">
      <View style={styles.searchGlyphLens} />
      <View style={styles.searchGlyphHandle} />
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

function safeTestId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
  const [todayReviewsExpanded, setTodayReviewsExpanded] = useState(true);
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
        <Text style={styles.screenTitle}>Review</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${filtersExpanded ? "Hide" : "Show"} review filters${queueFilter === "all" ? "" : `, ${selectedReviewFilterLabel} selected`}`}
          accessibilityState={{ expanded: filtersExpanded }}
          testID="review-filter-toggle"
          style={[styles.reviewFilterButton, reviewFilterControlActive ? styles.reviewFilterButtonActive : null]}
          onPress={() => onFiltersExpandedChange(!filtersExpanded)}
        >
          <FilterGlyph active={reviewFilterControlActive} />
        </Pressable>
      </View>

      <View
        accessibilityLabel={dailyReviewTotal === 0
          ? `Today, no reviews scheduled, ${queueSummary.tomorrowCount} tomorrow, ${queueSummary.nextSevenDaysCount} in the next 7 days, ${queueSummary.totalCount} total, ${reviewDueFilterLabel}`
          : `Today, ${completedReviews.length} of ${dailyReviewTotal} reviews completed, ${reviewToday.dueItems.length} remaining${queueSummary.overdueCount > 0 ? `, ${queueSummary.overdueCount} overdue` : ""}, ${queueSummary.tomorrowCount} tomorrow, ${queueSummary.nextSevenDaysCount} in the next 7 days, ${queueSummary.totalCount} total, ${reviewDueFilterLabel}`}
        style={styles.reviewDueCard}
        testID="review-due-card"
      >
        <View style={styles.reviewDueCopy}>
          <Text style={styles.reviewDueTitle}>Today</Text>
          <Text testID="review-due-summary" style={styles.helperText}>
            {reviewDueSummaryLabel}
          </Text>
          <Text
            accessibilityLabel={queueSummary.oldestDueLabel}
            testID="review-next-due"
            style={styles.helperText}
          >
            {reviewDueSubline}
          </Text>
        </View>
        <View style={styles.reviewDueCountBlock}>
          <Text testID="review-due-count" style={styles.reviewDueBigCount}>{dailyReviewProgressLabel}</Text>
        </View>
      </View>

      <View
        accessibilityLabel={`${reviewCountLabel(queueSummary.tomorrowCount)} tomorrow, ${reviewCountLabel(queueSummary.nextSevenDaysCount)} in the next 7 days, ${reviewCountLabel(queueSummary.totalCount)} total`}
        style={styles.reviewForecastRow}
        testID="review-forecast"
      >
        <ReviewForecastMetric label="Tomorrow" count={queueSummary.tomorrowCount} countTestID="review-tomorrow-count" />
        <ReviewForecastMetric label="Next 7 days" count={queueSummary.nextSevenDaysCount} countTestID="review-next-seven-days-count" />
        <ReviewForecastMetric label="Total" count={queueSummary.totalCount} countTestID="review-total-count" />
      </View>

      <View style={styles.reviewFilterControlSlot} testID="review-filter-controls">
        {reviewFilterOptionsRegion}
        {reviewFilterSummaryRegion}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start due review"
        accessibilityState={{ disabled: filteredDueEntries.length === 0 }}
        disabled={filteredDueEntries.length === 0}
        testID="review-start-due"
        style={[styles.primaryButton, styles.reviewStartButton, filteredDueEntries.length === 0 ? styles.disabledButton : null]}
        onPress={() => startReviewEntries(filteredDueEntries)}
      >
        <Text style={styles.primaryButtonText}>Review {queueSummary.filteredCount}</Text>
      </Pressable>

      {onPromoteNextFutureReviewsToDue || onScheduleTestReviewReminder ? (
        <View style={styles.reviewDevControls} testID="review-dev-controls">
          {onPromoteNextFutureReviewsToDue ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Make next future review date due today"
              testID="review-dev-promote-next-due"
              style={styles.secondaryButton}
              onPress={() => {
                const result = onPromoteNextFutureReviewsToDue();
                setDevStatus(reviewDuePromotionStatus(result));
              }}
            >
              <Text style={styles.secondaryButtonText}>Make next due today</Text>
            </Pressable>
          ) : null}
          {onScheduleTestReviewReminder ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Schedule a test review notification"
              testID="review-dev-test-notification"
              style={styles.secondaryButton}
              onPress={() => {
                void onScheduleTestReviewReminder().then((result) => {
                  setDevStatus(result.scheduled ? `Test notification scheduled ${formatLocalCalendarDate(result.scheduledAt ?? "")}` : "No test notification scheduled");
                });
              }}
            >
              <Text style={styles.secondaryButtonText}>Test notification</Text>
            </Pressable>
          ) : null}
          {devStatus ? <Text style={styles.helperText} testID="review-dev-status">{devStatus}</Text> : null}
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
          {filteredReviewToday.dueItems.length > 0 ? filteredReviewToday.dueItems.map((entry) => (
            <ReviewQueueItemCard
              key={`${entry.item.review.puzzleId}:${entry.item.review.mode}:${entry.item.review.ratingKey}`}
              presentation={entry}
              nowMs={nowMs}
              onPress={() => startReviewEntries([buildServiceReviewEntry(service, {
                puzzle: entry.item.puzzle,
                mode: entry.item.review.mode,
                ratingKey: entry.item.review.ratingKey,
                source: "due"
              })])}
            />
          )) : (
            <Text style={styles.helperText} testID="review-today-to-review-empty">
              No reviews match this filter.
            </Text>
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
          {filteredCompletedReviews.length > 0 ? filteredCompletedReviews.map((item) => (
            <TodayReviewAttemptRow
              key={item.attempt.id}
              item={item}
              onOpen={() => openCompletedReview(item.attempt.id)}
            />
          )) : (
            <Text style={styles.helperText} testID="review-today-history-empty">
              No completed reviews match this filter.
            </Text>
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
  return (
    <View
      accessibilityLabel={`Review filter summary, ${label}`}
      testID="review-active-filter-summary"
    >
      <View style={styles.historyChipContent}>
        <View style={styles.historyActiveFilterChip} testID="review-active-filter-0">
          <Text style={styles.historyActiveFilterText}>{label}</Text>
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
      style={styles.reviewItemCard}
      onPress={onPress}
    >
      <View style={styles.reviewRetryBadge} testID={`${rowTestId}-badge`}>
        <Text style={styles.reviewRetryGlyph}>↻</Text>
      </View>
      <View style={styles.reviewItemCopy}>
        <Text style={styles.historyRowTitle}>{modeLabel(item.review.mode)}</Text>
        <Text testID={`${rowTestId}-context`} style={styles.helperText}>{activityLabel}</Text>
        <Text testID={`${rowTestId}-meta`} style={styles.helperText}>
          {[attemptSummaryLabel, compactSource].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <ChevronGlyph direction="right" />
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${label}, ${reviewCountLabel(count)}`}
      accessibilityState={{ expanded }}
      testID={toggleTestID}
      style={styles.reviewSectionToggle}
      onPress={onPress}
    >
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.reviewSectionToggleMeta} testID={`${toggleTestID}-meta`}>
        <Text style={styles.reviewSectionCount} testID={`${toggleTestID}-count`}>{count}</Text>
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
      style={styles.historyAttemptCard}
      onPress={onOpen}
    >
      <View
        style={[styles.historyResultBadge, isWrong ? styles.historyResultWrong : styles.historyResultCorrect]}
        testID={`review-today-attempt-${item.attempt.id}-badge`}
      >
        <ResultBadgeGlyph tone={isWrong ? "wrong" : "correct"} />
      </View>
      <View style={styles.historyAttemptCopy}>
        <View style={styles.historyAttemptHeader}>
          <Text style={styles.historyRowTitle}>{modeLabel(item.attempt.mode)}</Text>
          <Text
            testID={`review-today-attempt-${item.attempt.id}-result`}
            style={[styles.historyReviewState, isWrong ? styles.errorText : styles.positive]}
          >
            {resultLabel}
          </Text>
        </View>
        <Text style={styles.helperText}>Puzzle {item.puzzle.id} · {elapsedSeconds}s</Text>
        <Text style={styles.helperText}>{formatLocalCalendarDate(item.attempt.completedAt)} · Review or retry</Text>
      </View>
      <View style={styles.historyAttemptChevron}>
        <ChevronGlyph direction="right" />
      </View>
    </Pressable>
  );
}

function ReviewForecastMetric({
  count,
  label,
  countTestID
}: {
  count: number;
  label: string;
  countTestID: string;
}): React.JSX.Element {
  return (
    <View style={styles.reviewForecastMetric}>
      <Text style={styles.reviewForecastCount} testID={countTestID}>{count}</Text>
      <Text style={styles.reviewForecastLabel}>{label}</Text>
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

  return (
    <View style={[styles.reviewSessionPanel, adaptiveLayout.usesWideContent ? styles.reviewSessionPanelWide : null]} testID="review-session">
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
              colors={{
                white: BOARD_COLOR_TOKENS.white,
                black: BOARD_COLOR_TOKENS.black,
                lastMoveHighlight: "rgba(0, 0, 0, 0)",
                checkmateHighlight: "rgba(0, 0, 0, 0)",
                promotionPieceButton: "#F8FAFC",
                validMoveDot: "rgba(15, 23, 42, 0.36)",
                validMoveCapture: "rgba(15, 23, 42, 0.56)"
              }}
            />
            <BoardCoordinateOverlay
              boardSize={boardSize}
              flipped={boardFlipped}
            />
            {!boardGestureEnabled ? <BoardInputBlocker /> : null}
            {lastMove && !feedback ? (
              <LastMoveOverlay
                boardSize={boardSize}
                flipped={boardFlipped}
                move={lastMove}
                overlayTestID="review-last-move-overlay"
              />
            ) : null}
            {feedbackMove ? (
              <MoveFeedbackOverlay
                boardSize={boardSize}
                flipped={boardFlipped}
                move={feedbackMove}
                result={feedback?.result ?? "wrong"}
              />
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
            <View style={styles.accessibleMoveModalBackdrop}>
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
            </View>
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
  const squareSize = boardSize / 8;
  const arrows = [
    ...lines.slice(0, 1).map((line) => ({ move: line.move, stroke: "#16A34A", opacity: 0.72, selected: true })),
    ...(blunderMove ? [{ move: blunderMove, stroke: "#DC2626", opacity: 0.68, selected: false }] : [])
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
          stroke={NEUTRAL_ARROW}
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

function reviewReminderScheduleStatusLabel(
  decision: ReturnType<typeof computeReviewReminderDecision>,
  result: ReviewReminderScheduleResult
): string {
  if (!decision || !result.scheduled) {
    return "none";
  }
  return `scheduled|${result.scheduledAt ?? decision.scheduledAt}|${decision.dueCount}|${decision.body}|${decision.route}|${decision.workloadState}|${decision.targetLocalDateTime}`;
}

function localReminderTarget(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function progressSyncStatusMessage(result: ProgressV2SyncResult): string {
  if (result.status === "disabled") {
    return "iCloud sync is off";
  }
  const importedCount = result.imported.ratings +
    result.imported.attempts +
    result.imported.reviewQueue +
    result.imported.sprintSessions +
    result.imported.practiceRuns;
  if (importedCount === 0) {
    return "Synced";
  }
  return `Synced ${importedCount} updates`;
}

function iCloudAccountStatusMessage(status: ICloudAccountStatus): string {
  switch (status) {
    case "available":
      return "Ready";
    case "no_account":
      return "Sign in to iCloud to sync";
    case "restricted":
      return "iCloud sync is restricted";
    case "could_not_determine":
      return "Cannot determine iCloud status";
    case "unavailable":
      return "iCloud sync is unavailable";
  }
}

function SettingsPanel({
  advancedRatingsOpen,
  adaptiveLayout,
  applicationMetadata,
  arrowDuelOpponentReplyGlobalSetting,
  captureBottomInset,
  feedbackIssuesOpener,
  progressProtection,
  onOpenDiagnostics,
  onOpenNotificationSettings,
  onAdjustRating,
  onAdvancedRatingsOpenChange,
  onRequestReviewReminderPermission,
  onResetSprintGuides,
  onSaveICloudSyncEnabled,
  onSaveReviewReminderPreference,
  onSyncICloudNow,
  iCloudSyncEnabled,
  iCloudSyncErrorDetails,
  iCloudSyncInProgress,
  iCloudSyncStatus,
  iCloudSyncSupportBundle,
  moveFeedbackPreferences,
  moveFeedbackPreviewer,
  notificationPermissionStatus,
  onMoveFeedbackPreferencesChange,
  reminderPlatform,
  ratings,
  reviewReminderScheduleStatus,
  reviewReminderPreference,
  showSprintGuideReset,
  showRatingControls,
  standardRating
}: {
  advancedRatingsOpen: boolean;
  adaptiveLayout: AdaptiveLayout;
  applicationMetadata: MobileApplicationMetadata;
  arrowDuelOpponentReplyGlobalSetting?: {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
  };
  captureBottomInset?: number;
  feedbackIssuesOpener: (url: string) => Promise<void>;
  progressProtection: MobilePlatformCapabilities["progressProtection"];
  onOpenDiagnostics?: () => void;
  onOpenNotificationSettings: () => Promise<void>;
  onAdjustRating: (ratingKey: string, nextRating: number) => RatingRecord;
  onAdvancedRatingsOpenChange: (open: boolean) => void;
  onRequestReviewReminderPermission: () => Promise<ReviewReminderPermissionStatus>;
  onResetSprintGuides: () => void;
  onSaveICloudSyncEnabled: (enabled: boolean) => void;
  onSaveReviewReminderPreference: (preference: ReviewReminderPreference) => void;
  onSyncICloudNow: () => Promise<string>;
  iCloudSyncEnabled: boolean;
  iCloudSyncErrorDetails?: ICloudSyncErrorDetailsPresentation;
  iCloudSyncInProgress: boolean;
  iCloudSyncStatus: string;
  iCloudSyncSupportBundle?: ICloudSyncSupportBundlePresentation;
  moveFeedbackPreferences: MoveFeedbackPreferences;
  moveFeedbackPreviewer?: MoveFeedbackPreviewer;
  notificationPermissionStatus: ReviewReminderPermissionStatus;
  onMoveFeedbackPreferencesChange: (preferences: MoveFeedbackPreferences) => void;
  reminderPlatform: MobilePlatformCapabilities["reminders"]["platform"];
  ratings: Array<{ label: string; record: RatingRecord }>;
  reviewReminderScheduleStatus: string;
  reviewReminderPreference: ReviewReminderPreference;
  showSprintGuideReset: boolean;
  showRatingControls: boolean;
  standardRating: number;
}): React.JSX.Element {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sprintGuideReady, setSprintGuideReady] = useState(false);
  const bundledCoreManifest = getBundledCorePackManifest();
  const releasePageUrl = applicationMetadata.releasePageUrl;

  return (
    <View
      style={[
        styles.settingsPanel,
        adaptiveLayout.usesWideContent ? styles.settingsPanelWide : null,
        captureBottomInset === undefined
          ? null
          : {
              paddingBottom: captureBottomInset +
                (adaptiveLayout.usesWideContent ? 130 : 0)
            }
      ]}
      testID="settings-panel"
    >
      {progressProtection.kind === "icloud_sync" ? (
        <SettingsSection title="iCloud Sync" testID="settings-sync-section" wide={adaptiveLayout.usesWideContent}>
          <SettingsRow
            label="Progress Sync"
            value={iCloudSyncEnabled ? "On" : "Off"}
            detail={iCloudSyncStatus}
            testID="settings-sync-status"
          />
          <View style={styles.settingsInlineControls} testID="settings-icloud-sync-controls">
            <SettingsPreferenceButton
              active={iCloudSyncEnabled}
              label="On"
              testID="settings-icloud-sync-on"
              onPress={() => {
                onSaveICloudSyncEnabled(true);
                setStatusMessage("iCloud sync enabled");
              }}
            />
            <SettingsPreferenceButton
              active={!iCloudSyncEnabled}
              label="Off"
              testID="settings-icloud-sync-off"
              onPress={() => {
                onSaveICloudSyncEnabled(false);
                setStatusMessage("iCloud sync disabled");
              }}
            />
          </View>
          {iCloudSyncEnabled ? (
            <>
              <SettingsActionButton
                label="Sync Now"
                detail="Merge ratings, history, and review queue with your private iCloud."
                loading={iCloudSyncInProgress}
                testID="settings-sync-now"
                onPress={() => {
                  void onSyncICloudNow().then((message) => {
                    setStatusMessage(message);
                  });
                }}
              />
              {iCloudSyncErrorDetails ? (
                <ICloudSyncErrorDetails presentation={iCloudSyncErrorDetails} />
              ) : null}
            </>
          ) : null}
        </SettingsSection>
      ) : (
        <SettingsSection
          title="Android Progress Backup"
          testID="settings-android-backup-section"
          wide={adaptiveLayout.usesWideContent}
        >
          <SettingsRow
            label="Backup & device transfer"
            value="Managed by Android"
            detail="Android can restore local progress after reinstall or device transfer when available. This is restore protection, not continuous sync."
            testID="settings-android-backup-status"
          />
        </SettingsSection>
      )}

      {arrowDuelOpponentReplyGlobalSetting ? (
        <SettingsSection
          title="Arrow Duel"
          testID="settings-arrow-duel-section"
          wide={adaptiveLayout.usesWideContent}
        >
          <SettingsRow
            label="Find the opponent’s best reply"
            value={arrowDuelOpponentReplyGlobalSetting.enabled ? "On" : "Off"}
            detail={arrowDuelOpponentReplyGlobalSetting.enabled
              ? "After you choose the better arrow, we play the other move so you can find the opponent’s best reply. Your Sprint and puzzle timers pause while you reply. You can turn this off or change the time for each Run in Edit Run."
              : "After you choose the better arrow, you’ll go straight to the next puzzle in every Run. If you turn this back on, each Run will use the reply setting and time you previously chose."}
            testID="settings-arrow-duel-opponent-reply"
          />
          <View
            style={styles.settingsInlineControls}
            testID="settings-arrow-duel-opponent-reply-controls"
          >
            <SettingsPreferenceButton
              active={arrowDuelOpponentReplyGlobalSetting.enabled}
              label="On"
              testID="settings-arrow-duel-opponent-reply-on"
              onPress={() => {
                arrowDuelOpponentReplyGlobalSetting.onChange(true);
                setStatusMessage("Runs will now include the opponent’s best reply");
              }}
            />
            <SettingsPreferenceButton
              active={!arrowDuelOpponentReplyGlobalSetting.enabled}
              label="Off"
              testID="settings-arrow-duel-opponent-reply-off"
              onPress={() => {
                arrowDuelOpponentReplyGlobalSetting.onChange(false);
                setStatusMessage("Runs will now go straight to the next puzzle");
              }}
            />
          </View>
        </SettingsSection>
      ) : null}

      <SettingsSection title="Notifications" testID="settings-notifications-section" wide={adaptiveLayout.usesWideContent}>
        <SettingsRow
          label="Review Reminders"
          value={reviewReminderPreferenceLabel(reviewReminderPreference)}
          detail={reviewReminderSettingsDetail({
            notificationPermissionStatus,
            preference: reviewReminderPreference,
            reminderPlatform,
            scheduleStatus: reviewReminderScheduleStatus
          })}
          testID="settings-review-reminders"
        />
        <View style={styles.settingsInlineControls} testID="settings-review-reminder-preferences">
          <SettingsPreferenceButton
            active={reviewReminderPreference.mode === "smart"}
            label="Smart"
            testID="settings-review-reminder-smart"
            onPress={() => onSaveReviewReminderPreference({ mode: "smart" })}
          />
          <SettingsPreferenceButton
            active={reviewReminderPreference.mode === "fixed" && reviewReminderPreference.fixedLocalTime === "19:00"}
            label="19:00"
            testID="settings-review-reminder-fixed-1900"
            onPress={() => onSaveReviewReminderPreference({ mode: "fixed", fixedLocalTime: "19:00" })}
          />
          <SettingsPreferenceButton
            active={reviewReminderPreference.mode === "off"}
            label="Off"
            testID="settings-review-reminder-off"
            onPress={() => onSaveReviewReminderPreference({ mode: "off" })}
          />
        </View>
        {notificationPermissionStatus === "not_determined" && reviewReminderPreference.mode !== "off" ? (
          <SettingsActionRow
            label="Enable Notifications"
            detail={reminderPlatform === "android"
              ? "Android shows its notification permission after this action"
              : "Ask iOS permission after your first review session"}
            testID="settings-review-reminder-enable"
            onPress={() => {
              void onRequestReviewReminderPermission().then((status) => {
                setStatusMessage(reviewReminderPermissionStatusMessage(status, reminderPlatform));
              });
            }}
          />
        ) : null}
        {notificationPermissionStatus === "denied" || notificationPermissionStatus === "channel_disabled" ? (
          <SettingsActionRow
            label={reminderPlatform === "android" ? "Open Android Notification Settings" : "Open iOS Settings"}
            detail={reminderPlatform === "android"
              ? "Restore app permission or the Review reminders channel in Android"
              : "Notifications are blocked by iOS and cannot be requested again here"}
            testID="settings-review-reminder-open-settings"
            onPress={() => {
              void onOpenNotificationSettings().then(() => {
                setStatusMessage(reminderPlatform === "android" ? "Opened Android notification settings" : "Opened iOS Settings");
              }).catch(() => {
                setStatusMessage(reminderPlatform === "android"
                  ? "Android notification settings are unavailable on this device"
                  : "iOS Settings are unavailable on this device");
              });
            }}
          />
        ) : null}
        {arePracticeTestControlsEnabled() ? (
          <Text testID="settings-review-reminder-schedule-status" style={styles.reviewDueHiddenMetric}>
            {reviewReminderScheduleStatus}
          </Text>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="Move Feedback"
        testID="settings-move-feedback-section"
        wide={adaptiveLayout.usesWideContent}
      >
        <MoveFeedbackSettingsSection
          preferences={moveFeedbackPreferences}
          onPreferencesChange={onMoveFeedbackPreferencesChange}
          onPreview={moveFeedbackPreviewer}
        />
      </SettingsSection>

      {showRatingControls ? (
        <SettingsSection title="Profile" testID="settings-profile-section" wide={adaptiveLayout.usesWideContent}>
          <SettingsRow
            label="Edit rating"
            value={`Rating ${standardRating}`}
            detail="Standard and Arrow Duel difficulty"
            testID="settings-standard-elo-row"
            onPress={() => onAdvancedRatingsOpenChange(!advancedRatingsOpen)}
          />
          {advancedRatingsOpen ? (
            <AdvancedRatingsPanel
              ratings={ratings}
              onAdjust={(ratingKey, nextRating) => {
                const next = onAdjustRating(ratingKey, nextRating);
                setStatusMessage(`${ratingLabelFromKey(ratingKey)} rating set to ${next.rating}`);
              }}
            />
          ) : null}
        </SettingsSection>
      ) : null}

      {showSprintGuideReset ? (
        <SettingsSection title="Guidance" testID="settings-guidance-section" wide={adaptiveLayout.usesWideContent}>
          <View style={styles.settingsGuidanceResetCard} testID="settings-guidance-reset-card">
            <View style={styles.settingsRowCopy}>
              <Text style={styles.listText}>Replay practice guides</Text>
              <Text style={styles.helperText}>
                Reset the Sprint rules, active-session, and Arrow Duel guides so they appear again when each applies. Runs, ratings, and History stay unchanged.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={sprintGuideReady ? "Practice guides reset" : "Reset practice guides"}
              accessibilityState={{ disabled: sprintGuideReady }}
              disabled={sprintGuideReady}
              style={[
                styles.settingsGuidanceResetButton,
                sprintGuideReady ? styles.settingsGuidanceResetButtonComplete : null
              ]}
              testID="settings-show-sprint-guide"
              onPress={() => {
                onResetSprintGuides();
                setSprintGuideReady(true);
              }}
            >
              <Text
                style={[
                  styles.settingsGuidanceResetButtonText,
                  sprintGuideReady ? styles.settingsGuidanceResetButtonTextComplete : null
                ]}
              >
                {sprintGuideReady ? "Guides reset" : "Reset guides"}
              </Text>
            </Pressable>
          </View>
          {sprintGuideReady ? (
            <View
              accessibilityLiveRegion="polite"
              style={styles.sprintGuideReadyStatus}
              testID="settings-sprint-guide-ready"
            >
              <Text style={styles.sprintGuideReadyStatusText}>
                Guides reset. Each guide will replay the next time it applies.
              </Text>
            </View>
          ) : null}
        </SettingsSection>
      ) : null}

      <FeedbackSupportCard
        feedbackIssuesUrl={applicationMetadata.feedbackIssuesUrl}
        openFeedbackIssues={feedbackIssuesOpener}
        supportBundle={iCloudSyncSupportBundle}
        supportEmail={applicationMetadata.supportEmail}
        supportEmailUrl={applicationMetadata.supportEmailUrl}
        wide={adaptiveLayout.usesWideContent}
      />

      <SettingsSection title="About" testID="settings-about-section" wide={adaptiveLayout.usesWideContent}>
        <SettingsRow
          label="App Version"
          value={applicationMetadata.buildNumber
            ? `${applicationMetadata.versionName} (${applicationMetadata.buildNumber})`
            : applicationMetadata.versionName}
          testID="settings-app-version"
        />
        {releasePageUrl ? (
          <SettingsExternalLinkRow
            label="Android Releases"
            value="GitHub"
            detail="Manual Play-signed APK downloads"
            linkLabel="Open GitHub Releases"
            testID="settings-android-releases"
            onPress={() => {
              void Linking.openURL(releasePageUrl);
            }}
          />
        ) : null}
        <SettingsExternalLinkRow
          label="License"
          value="GPL-3.0-or-later"
          detail="App source license"
          linkLabel="Open license"
          testID="settings-license"
          onPress={() => {
            void Linking.openURL(applicationMetadata.sourceLicenseUrl);
          }}
        />
        <SettingsExternalLinkRow
          label="Source"
          value="GitHub"
          detail="Public Chessticize mobile repository"
          linkLabel="github.com/Chessticize/chessticize-mobile"
          testID="settings-source"
          onPress={() => {
            void Linking.openURL(applicationMetadata.sourceRepositoryUrl);
          }}
        />
        <SettingsExternalLinkRow
          label="Stockfish"
          value="Embedded"
          detail="Stockfish 18 engine source used by the app"
          linkLabel="StockfishEngine in source"
          testID="settings-stockfish-source"
          onPress={() => {
            void Linking.openURL(applicationMetadata.stockfishSourceUrl);
          }}
        />
        <SettingsExternalLinkRow
          label="Puzzle Data"
          value={bundledCoreManifest.source}
          detail={`${bundledCoreManifest.sourceLicense}. ${bundledCoreManifest.licenseNote} ${bundledCoreManifest.presolve}.`}
          linkLabel="database.lichess.org/#puzzles"
          testID="settings-puzzle-data-license"
          onPress={() => {
            void Linking.openURL(LICHESS_PUZZLE_DATABASE_URL);
          }}
        />
      </SettingsSection>

      {statusMessage ? <Text style={styles.settingsStatusText} testID="settings-status-message">{statusMessage}</Text> : null}
      {onOpenDiagnostics ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Stockfish diagnostics"
          testID="settings-stockfish-diagnostics"
          style={styles.secondaryButton}
          onPress={onOpenDiagnostics}
        >
          <Text style={styles.secondaryButtonText}>Stockfish Diagnostics</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FeedbackSupportCard({
  feedbackIssuesUrl,
  openFeedbackIssues,
  supportBundle,
  supportEmail,
  supportEmailUrl,
  wide
}: {
  feedbackIssuesUrl: string;
  openFeedbackIssues: (url: string) => Promise<void>;
  supportBundle?: ICloudSyncSupportBundlePresentation;
  supportEmail: string;
  supportEmailUrl: string;
  wide: boolean;
}): React.JSX.Element {
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  function closeConfirmation(): void {
    setConfirmationVisible(false);
    setHandoffError(null);
  }

  async function continueToGitHub(): Promise<void> {
    setHandoffError(null);
    try {
      await openFeedbackIssues(feedbackIssuesUrl);
      setConfirmationVisible(false);
    } catch {
      setHandoffError("Couldn't open GitHub Issues. Try again.");
    }
  }

  return (
    <SettingsSection
      cardStyle={styles.feedbackSupportSectionCard}
      title="Help & Feedback"
      testID="settings-feedback-section"
      wide={wide}
    >
      <View style={styles.feedbackSupportCard}>
        <View style={styles.feedbackSupportHeader}>
          <View style={styles.feedbackSupportIcon}>
            <Text style={styles.feedbackSupportIconText}>?</Text>
          </View>
          <View style={styles.feedbackSupportCopy}>
            <Text style={styles.feedbackSupportTitle}>Help improve Chessticize</Text>
            <Text style={styles.feedbackSupportDetail}>
              Report a bug, request a feature, or see whether someone has already raised it.
            </Text>
          </View>
        </View>
        <View style={styles.feedbackPrivacyStrip}>
          <Text style={styles.feedbackPrivacyTitle}>Your data stays in the app</Text>
          <Text style={styles.feedbackPrivacyCopy}>
            GitHub opens in your browser. Ratings, history, and puzzle data are not attached.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open GitHub Issues in browser"
          testID="settings-feedback-open-github"
          style={({ pressed }) => [
            styles.feedbackSupportButton,
            pressed ? styles.feedbackSupportButtonPressed : null
          ]}
          onPress={() => {
            setHandoffError(null);
            setConfirmationVisible(true);
          }}
        >
          <Text style={styles.feedbackSupportButtonText}>Open GitHub Issues</Text>
          <Text style={styles.feedbackSupportButtonArrow}>↗</Text>
        </Pressable>
        <Text style={styles.feedbackSubmissionCopy}>
          You will review and submit your issue on GitHub.
        </Text>
      </View>
      {supportBundle ? (
        <ICloudSyncSupportDiagnosticsEntry presentation={supportBundle} />
      ) : null}
      <SettingsExternalLinkRow
        label="Email Support"
        value="Email"
        detail="Private questions and account support"
        linkLabel={supportEmail}
        testID="settings-support-email"
        onPress={() => {
          void Linking.openURL(supportEmailUrl);
        }}
      />
      {confirmationVisible ? (
        <Modal
          animationType="fade"
          onRequestClose={closeConfirmation}
          transparent
          visible
        >
          <View style={styles.accessibleMoveModalBackdrop}>
            <View
              accessibilityViewIsModal
              style={styles.feedbackHandoffConfirmation}
              testID="settings-feedback-handoff-confirmation"
            >
              <View style={styles.feedbackExternalBadge}>
                <Text style={styles.feedbackExternalBadgeText}>EXTERNAL BROWSER</Text>
              </View>
              <Text style={styles.feedbackHandoffTitle}>Continue to GitHub?</Text>
              <Text style={styles.feedbackHandoffCopy}>
                A new issue will open on github.com in your default browser. Chessticize does not attach your account, rating, history, or puzzle data.
              </Text>
              <View style={styles.feedbackHandoffPrivacyCard}>
                <Text style={styles.feedbackHandoffPrivacyTitle}>You stay in control</Text>
                <Text style={styles.feedbackHandoffPrivacyCopy}>
                  Review what you share and submit it on GitHub. This is not an in-app submission.
                </Text>
              </View>
              {handoffError ? (
                <Text style={styles.errorText} testID="settings-feedback-handoff-error">
                  {handoffError}
                </Text>
              ) : null}
              <View style={styles.confirmationActionRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Stay in Settings"
                  style={styles.feedbackHandoffCancelButton}
                  testID="settings-feedback-handoff-cancel"
                  onPress={closeConfirmation}
                >
                  <Text style={styles.feedbackHandoffCancelButtonText}>Not now</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Continue to GitHub Issues"
                  style={styles.feedbackHandoffContinueButton}
                  testID="settings-feedback-handoff-continue"
                  onPress={() => {
                    void continueToGitHub();
                  }}
                >
                  <Text style={styles.feedbackHandoffContinueButtonText}>Continue to GitHub</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </SettingsSection>
  );
}

function ReviewReminderPermissionPrompt({
  onDismiss,
  onEnable
}: {
  onDismiss: () => void;
  onEnable: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.reviewReminderPrompt} testID="review-reminder-permission-prompt">
      <View style={styles.reviewReminderPromptCopy}>
        <Text style={styles.sectionLabel}>Review reminders</Text>
        <Text style={styles.helperText}>Get a local reminder when missed puzzles are ready again.</Text>
      </View>
      <View style={styles.confirmationActionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss review reminder permission prompt"
          testID="review-reminder-permission-dismiss"
          style={styles.secondaryButton}
          onPress={onDismiss}
        >
          <Text style={styles.secondaryButtonText}>Not Now</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enable review reminders"
          testID="review-reminder-permission-enable"
          style={styles.primarySmallButton}
          onPress={onEnable}
        >
          <Text style={styles.primarySmallButtonText}>Enable</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SettingsPreferenceButton({
  active,
  label,
  onPress,
  testID
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      testID={testID}
      style={[styles.settingsPreferenceButton, active ? styles.settingsPreferenceButtonActive : null]}
      onPress={onPress}
    >
      <Text style={[styles.settingsPreferenceButtonText, active ? styles.settingsPreferenceButtonTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SettingsActionRow({
  detail,
  label,
  onPress,
  testID
}: {
  detail: string;
  label: string;
  onPress: () => void;
  testID: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${detail}`}
      testID={testID}
      style={styles.settingsActionRow}
      onPress={onPress}
    >
      <View style={styles.settingsRowCopy}>
        <Text style={styles.listText}>{label}</Text>
        <Text style={styles.helperText}>{detail}</Text>
      </View>
      <ChevronGlyph direction="right" />
    </Pressable>
  );
}

function SettingsActionButton({
  detail,
  label,
  loading,
  onPress,
  testID
}: {
  detail: string;
  label: string;
  loading: boolean;
  onPress: () => void;
  testID: string;
}): React.JSX.Element {
  return (
    <View style={styles.settingsActionButtonRow}>
      <Text style={[styles.helperText, styles.settingsActionButtonDetail]} testID={`${testID}-detail`}>
        {detail}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={loading ? "Syncing progress" : label}
        accessibilityState={{ busy: loading, disabled: loading }}
        disabled={loading}
        testID={testID}
        style={[
          styles.settingsActionButton,
          loading ? styles.settingsActionButtonDisabled : null
        ]}
        onPress={onPress}
      >
        {loading ? (
          <ActivityIndicator
            color="#FFFFFF"
            size="small"
            testID={`${testID}-spinner`}
          />
        ) : null}
        <Text style={styles.settingsActionButtonText} testID={`${testID}-label`}>
          {loading ? "Syncing…" : label}
        </Text>
      </Pressable>
    </View>
  );
}

function reviewReminderPreferenceLabel(preference: ReviewReminderPreference): string {
  if (preference.mode === "fixed") {
    return preference.fixedLocalTime;
  }
  if (preference.mode === "off") {
    return "Off";
  }
  return "Smart";
}

function reviewReminderSettingsDetail({
  notificationPermissionStatus,
  preference,
  reminderPlatform,
  scheduleStatus
}: {
  notificationPermissionStatus: ReviewReminderPermissionStatus;
  preference: ReviewReminderPreference;
  reminderPlatform: MobilePlatformCapabilities["reminders"]["platform"];
  scheduleStatus: string;
}): string {
  if (reminderPlatform === "ios") {
    return reviewReminderPermissionDetail(notificationPermissionStatus);
  }
  if (preference.mode === "off") {
    return "Reminders are off. No notification is scheduled.";
  }
  switch (notificationPermissionStatus) {
    case "denied":
      return "Blocked in Android notification settings. You can restore access.";
    case "channel_disabled":
      return "The Review reminders channel is off in Android settings.";
    case "not_determined":
      return "Permission not requested. Enable from this screen when you are ready.";
    case "unavailable":
      return "Notifications unavailable on this device";
    case "authorized":
      break;
  }
  if (scheduleStatus === "error") {
    return "Android could not schedule the next reminder. Try changing the reminder setting.";
  }
  if (scheduleStatus === "pending") {
    return "Updating the next Android reminder.";
  }
  if (scheduleStatus === "none") {
    return "No review work is scheduled.";
  }
  const [, , , , , workloadState, targetLocalDateTime] = scheduleStatus.split("|");
  if (scheduleStatus.startsWith("scheduled|") && targetLocalDateTime) {
    const target = targetLocalDateTime.replace("T", " ");
    const workload = workloadState === "overdue"
      ? " Overdue review work is included."
      : workloadState === "due_today"
        ? " Today's review work is included."
        : " Future review work is included.";
    return `Target ${target} local; Android may deliver later.${workload}`;
  }
  return "Local notifications enabled";
}

function reviewReminderPermissionDetail(status: ReviewReminderPermissionStatus): string {
  switch (status) {
    case "authorized":
      return "Local notifications enabled";
    case "denied":
      return "Blocked in iOS Settings";
    case "channel_disabled":
      return "Notifications disabled in Settings";
    case "not_determined":
      return "Permission not requested";
    case "unavailable":
      return "Notifications unavailable on this device";
  }
}

function reviewReminderPermissionStatusMessage(
  status: ReviewReminderPermissionStatus,
  reminderPlatform: MobilePlatformCapabilities["reminders"]["platform"]
): string {
  switch (status) {
    case "authorized":
      return "Notifications enabled";
    case "denied":
      return reminderPlatform === "android"
        ? "Notifications blocked in Android notification settings"
        : "Notifications blocked in iOS Settings";
    case "channel_disabled":
      return "Review reminder notifications disabled in Settings";
    case "not_determined":
      return "Notification permission not requested";
    case "unavailable":
      return "Notifications unavailable";
  }
}

function scheduledReviewAttemptCount(service: PracticeService): number {
  return service.countHistory({ source: "scheduled_review" });
}

function AdvancedRatingsPanel({
  onAdjust,
  ratings
}: {
  onAdjust: (ratingKey: string, nextRating: number) => void;
  ratings: Array<{ label: string; record: RatingRecord }>;
}): React.JSX.Element {
  return (
    <View style={styles.advancedRatingsPanel} testID="settings-advanced-ratings-panel">
      <Text style={styles.sectionLabel}>Difficulty controls</Text>
      <Text style={styles.helperText}>
        Each rating helps Chessticize choose the right puzzle difficulty.
      </Text>
      <View style={styles.advancedRatingRows}>
        {ratings.map(({ label, record }) => (
          <AdvancedRatingRow
            key={record.key}
            label={label}
            record={record}
            testID={`settings-advanced-rating-${safeTestId(label)}`}
            onAdjust={onAdjust}
          />
        ))}
      </View>
    </View>
  );
}

function AdvancedRatingRow({
  label,
  onAdjust,
  record,
  testID,
}: {
  label: string;
  onAdjust: (ratingKey: string, nextRating: number) => void;
  record: RatingRecord;
  testID: string;
}): React.JSX.Element {
  const decrementDisabled = record.rating <= RATING_FLOOR;
  return (
    <View style={styles.advancedRatingRow} testID={testID}>
      <View style={styles.advancedRatingCopy}>
        <Text style={styles.listText}>{label}</Text>
        <Text style={styles.helperText}>{advancedRatingBucketLabel(label, record.key)}</Text>
      </View>
      <View style={styles.advancedRatingControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label} rating`}
          accessibilityState={{ disabled: decrementDisabled }}
          disabled={decrementDisabled}
          testID={`${testID}-decrease`}
          style={[styles.customStepperButton, decrementDisabled ? styles.disabledButton : null]}
          onPress={() => onAdjust(record.key, stepManualRating(record.rating, -1))}
        >
          <MinusGlyph />
        </Pressable>
        <Text style={styles.settingsRowValue} testID={`${testID}-value`}>Rating {record.rating}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label} rating`}
          testID={`${testID}-increase`}
          style={styles.customStepperButton}
          onPress={() => onAdjust(record.key, stepManualRating(record.rating, 1))}
        >
          <PlusGlyph />
        </Pressable>
      </View>
    </View>
  );
}

function ratingLabelFromKey(ratingKey: string): string {
  if (/\barrow[_ ]duel\b/.test(ratingKey)) {
    return "Arrow Duel";
  }
  if (/\bblitz\b/.test(ratingKey)) {
    return "Blitz";
  }
  if (/\bcustom\b/.test(ratingKey)) {
    return "Custom";
  }
  return "Standard";
}

function advancedRatingBucketLabel(label: string, ratingKey: string): string {
  const speed = ratingKey.match(/\/(\d+)\b/)?.[1];
  return speed ? `${label} · ${speed}s pace` : label;
}

function SettingsSection({
  cardStyle,
  children,
  testID,
  title,
  wide = false
}: {
  cardStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  testID: string;
  title: string;
  wide?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.settingsSection, wide ? styles.settingsSectionWide : null]} testID={testID}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={[styles.settingsSectionCard, cardStyle]}>
        {children}
      </View>
    </View>
  );
}

function SettingsRow({
  destructive = false,
  detail,
  label,
  onPress,
  showDetail = true,
  testID,
  value
}: {
  destructive?: boolean;
  detail?: string;
  label: string;
  onPress?: () => void;
  showDetail?: boolean;
  testID: string;
  value?: string;
}): React.JSX.Element {
  const accessibilityLabel = [label, value, detail].filter(Boolean).join(", ");
  return (
    <Pressable
      accessible
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={styles.settingsRow}
      onPress={onPress}
    >
      <View style={styles.settingsRowCopy}>
        <Text style={[styles.listText, destructive ? styles.settingsDestructiveText : null]}>{label}</Text>
        {detail && showDetail ? <Text style={styles.helperText}>{detail}</Text> : null}
        {detail && !showDetail ? (
          <View
            accessibilityLabel={detail}
            testID={`${testID}-detail`}
          />
        ) : null}
      </View>
      <View style={styles.settingsRowMeta}>
        {value ? <Text style={styles.settingsRowValue}>{value}</Text> : null}
        {onPress ? <ChevronGlyph direction="right" /> : null}
      </View>
    </Pressable>
  );
}

function SettingsExternalLinkRow({
  detail,
  label,
  linkLabel,
  onPress,
  testID,
  value
}: {
  detail: string;
  label: string;
  linkLabel: string;
  onPress: () => void;
  testID: string;
  value: string;
}): React.JSX.Element {
  const accessibilityLabel = [label, value, detail, linkLabel].join(", ");
  return (
    <Pressable
      accessible
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={styles.settingsRow}
      onPress={onPress}
    >
      <View style={styles.settingsRowCopy}>
        <Text style={styles.listText}>{label}</Text>
        <Text style={styles.helperText}>{detail}</Text>
        <Text style={styles.settingsLinkText}>{linkLabel}</Text>
      </View>
      <View style={styles.settingsRowMeta}>
        <Text style={styles.settingsRowValue}>{value}</Text>
        <ChevronGlyph direction="right" />
      </View>
    </Pressable>
  );
}

type PackRowModel = {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  coverage: {
    puzzles: string;
    rating: string;
    themes: string;
    arrowDuel: string;
  };
  source: string;
  presolveStatus: string;
  manifestHash: string;
  buildDate: string;
  licenseNote: string;
  status: "active" | "installed" | "optional";
  testID: string;
};

const PACK_CATALOG: PackRowModel[] = [packRowFromManifest()];

function packRowFromManifest(): PackRowModel {
  const manifest = getBundledCorePackManifest();
  const puzzleCount = formatWholeNumber(manifest.puzzleCount);
  const arrowDuelCount = formatWholeNumber(manifest.arrowDuelCount);
  const themeCount = `${formatWholeNumber(manifest.themes.length)} themes`;
  const ratingRange = `${manifest.rating.min}-${manifest.rating.max}`;
  return {
    id: manifest.id,
    title: manifest.title,
    subtitle: `${puzzleCount} puzzles · offline`,
    detail: `Rating ${ratingRange} · ${themeCount} · ${arrowDuelCount} Arrow Duel`,
    coverage: {
      puzzles: puzzleCount,
      rating: ratingRange,
      themes: themeCount,
      arrowDuel: arrowDuelCount
    },
    source: `${manifest.source} (${manifest.sourceLicense})`,
    presolveStatus: manifest.presolve,
    manifestHash: manifest.manifestHash,
    buildDate: manifest.buildDate,
    licenseNote: manifest.licenseNote,
    status: "active",
    testID: "packs-installed-core"
  };
}

function bundledCoreCustomEligiblePuzzleCount(theme: string | undefined): number {
  const manifest = getBundledCorePackManifest();
  if (!theme) {
    return manifest.puzzleCount;
  }
  return manifest.themeCounts?.[theme] ?? 0;
}

// This dormant panel is intentionally retained while it is not wired into navigation.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PacksPanel(): React.JSX.Element {
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const installedPacks = PACK_CATALOG;
  const selectedPack = selectedPackId === null
    ? null
    : PACK_CATALOG.find((pack) => pack.id === selectedPackId) ?? null;
  const coverageSummary = summarizeInstalledPackCoverage(installedPacks);

  return (
    <View style={styles.packsPanel} testID="packs-panel">
      <View style={styles.historyHeaderRow} testID="packs-action-header">
        <Text style={styles.screenTitle}>Puzzle Packs</Text>
      </View>

      <View style={styles.packCoverageCard} testID="packs-coverage-summary">
        <View style={styles.sectionHeaderRow} testID="packs-coverage-header">
          <Text style={styles.sectionLabel}>Coverage</Text>
        </View>
        <View style={styles.packCoverageGrid}>
          <PackCoverageMetric
            label="Installed"
            value={`${installedPacks.length} ${installedPacks.length === 1 ? "pack" : "packs"}`}
            testID="packs-summary-installed"
          />
          <PackCoverageMetric label="Puzzles" value={coverageSummary.puzzles} testID="packs-summary-puzzles" />
          <PackCoverageMetric label="Rating" value={coverageSummary.rating} testID="packs-summary-rating" />
          <PackCoverageMetric label="Arrow Duel" value={coverageSummary.arrowDuel} testID="packs-summary-arrow-duel" />
        </View>
      </View>

      <PackSection title="Installed" testID="packs-installed-section">
        {installedPacks.map((pack) => (
          <PackRow
            key={pack.id}
            pack={pack}
            onOpenDetail={() => setSelectedPackId(pack.id)}
          />
        ))}
      </PackSection>

      <View style={styles.packInfoCard} testID="packs-offline-readiness">
        <Text style={styles.sectionLabel}>Offline Ready</Text>
        <Text style={styles.helperText}>
          The bundled Core Pack ships with the app and works fully offline. This version does not download additional packs.
        </Text>
      </View>

      {selectedPack ? (
        <PackDetailPanel
          pack={selectedPack}
          onClose={() => setSelectedPackId(null)}
        />
      ) : null}

      <View style={styles.packInfoCard} testID="packs-info-section">
        <Text style={styles.sectionLabel}>Pack Info</Text>
        <PackInfoRow label="Source" value="Lichess puzzle database" testID="packs-source" />
        <PackInfoRow label="Processing" value="Pre-solved for Chessticize" testID="packs-processing" />
        <PackInfoRow
          label="License notes"
          value="Lichess-derived"
          detail="Puzzle data is derived from the Lichess puzzle database and bundled for offline use with Chessticize presolve metadata."
          testID="packs-license-notes"
        />
      </View>
    </View>
  );
}

function summarizeInstalledPackCoverage(packs: PackRowModel[]): { puzzles: string; rating: string; arrowDuel: string } {
  const puzzleTotal = packs.reduce((sum, pack) => sum + parseWholeNumber(pack.coverage.puzzles), 0);
  const ratingRanges = packs
    .map((pack) => parseRatingRange(pack.coverage.rating))
    .filter((range): range is { min: number; max: number } => range !== null);
  const rating = ratingRanges.length > 0
    ? `${Math.min(...ratingRanges.map((range) => range.min))}-${Math.max(...ratingRanges.map((range) => range.max))}`
    : "n/a";
  const arrowDuelTotal = packs.reduce((sum, pack) => sum + parseWholeNumber(pack.coverage.arrowDuel), 0);

  return {
    puzzles: formatWholeNumber(puzzleTotal),
    rating,
    arrowDuel: arrowDuelTotal > 0 ? formatWholeNumber(arrowDuelTotal) : "Limited"
  };
}

function formatWholeNumber(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function parseWholeNumber(value: string): number {
  const match = value.match(/[\d,]+/);
  return match ? Number(match[0].replaceAll(",", "")) : 0;
}

function parseRatingRange(value: string): { min: number; max: number } | null {
  const match = value.match(/(\d+)-(\d+)/);
  return match ? { min: Number(match[1]), max: Number(match[2]) } : null;
}

function PackCoverageMetric({
  label,
  testID,
  value
}: {
  label: string;
  testID: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.packCoverageMetric} testID={testID}>
      <Text style={styles.packCoverageLabel}>{label}</Text>
      <Text style={styles.packCoverageMetricValue}>{value}</Text>
    </View>
  );
}

function PackSection({
  children,
  testID,
  title
}: {
  children: React.ReactNode;
  testID: string;
  title: string;
}): React.JSX.Element {
  return (
    <View style={styles.settingsSection} testID={testID}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.settingsSectionCard}>{children}</View>
    </View>
  );
}

function PackRow({
  onOpenDetail,
  pack
}: {
  onOpenDetail: () => void;
  pack: PackRowModel;
}): React.JSX.Element {
  const statusLabel = pack.status === "active" ? "Active" : pack.status === "installed" ? "Installed" : "Optional";
  const coverageLabel = `${pack.coverage.puzzles} puzzles, rating ${pack.coverage.rating}, ${pack.coverage.themes} themes, Arrow Duel ${pack.coverage.arrowDuel}`;
  const optionalCoverageSummary = `${pack.coverage.rating} · ${pack.coverage.themes} · Arrow Duel ${pack.coverage.arrowDuel}`;
  return (
    <View
      accessibilityLabel={`${pack.title}, ${statusLabel.toLowerCase()} puzzle pack, ${coverageLabel}`}
      style={styles.packRow}
      testID={pack.testID}
    >
      <View style={styles.packRowCopy}>
        <View style={styles.packTitleRow}>
          <Text style={styles.historyRowTitle}>{pack.title}</Text>
        </View>
        <Text style={styles.helperText} testID={`packs-subtitle-${pack.id}`}>{pack.coverage.puzzles} puzzles</Text>
        <Text style={styles.packRowMetaText} testID={`packs-meta-${pack.id}`}>
          {optionalCoverageSummary}
        </Text>
        <Text
          accessibilityLabel={`Rating ${pack.coverage.rating}, themes ${pack.coverage.themes}, Arrow Duel ${pack.coverage.arrowDuel}`}
          style={styles.packCoverageHiddenText}
          testID={`packs-coverage-${pack.id}`}
        >
          {""}
        </Text>
      </View>
      <View style={styles.packActionColumn}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${pack.title} details`}
          testID={`packs-detail-${pack.id}`}
          style={styles.packDetailButton}
          onPress={onOpenDetail}
        >
          <ChevronGlyph direction="right" />
        </Pressable>
      <PackActiveMark testID={`packs-active-${pack.id}`} />
      </View>
    </View>
  );
}

function PackActiveMark({ testID }: { testID: string }): React.JSX.Element {
  return (
    <View style={styles.packActiveMark} testID={testID}>
      <View style={[styles.packActiveGlyphLine, styles.packActiveGlyphShort]} />
      <View style={[styles.packActiveGlyphLine, styles.packActiveGlyphLong]} />
    </View>
  );
}

function PackDetailPanel({
  onClose,
  pack
}: {
  onClose: () => void;
  pack: PackRowModel;
}): React.JSX.Element {
  return (
    <View style={styles.packInfoCard} testID="pack-detail-panel">
      <View style={styles.sectionHeaderRow}>
        <View style={styles.packRowCopy}>
          <Text style={styles.sectionLabel}>{pack.title}</Text>
          <Text style={styles.helperText}>{pack.subtitle}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close pack details"
          testID="pack-detail-close"
          style={styles.packsIconButton}
          onPress={onClose}
        >
          <CloseGlyph />
        </Pressable>
      </View>
      <PackInfoRow label="Puzzles" value={pack.coverage.puzzles} testID="pack-detail-puzzles" />
      <PackInfoRow label="Rating" value={pack.coverage.rating} testID="pack-detail-rating" />
      <PackInfoRow label="Themes" value={pack.coverage.themes} testID="pack-detail-themes" />
      <PackInfoRow label="Arrow Duel" value={pack.coverage.arrowDuel} testID="pack-detail-arrow-duel" />
      <PackInfoRow label="Source" value={pack.source} testID="pack-detail-source" />
      <PackInfoRow label="Presolve" value={pack.presolveStatus} testID="pack-detail-presolve" />
      <PackInfoRow label="Manifest hash" value={pack.manifestHash} testID="pack-detail-manifest-hash" />
      <PackInfoRow label="Build date" value={pack.buildDate} testID="pack-detail-build-date" />
      <Text testID="pack-detail-license-notes" style={styles.packLicenseText}>
        License notes: {pack.licenseNote}
      </Text>
    </View>
  );
}

function PackInfoRow({
  detail,
  label,
  testID,
  value
}: {
  detail?: string;
  label: string;
  testID: string;
  value: string;
}): React.JSX.Element {
  const accessibilityLabel = [label, value, detail].filter(Boolean).join(", ");
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={styles.packInfoRow}
      testID={testID}
    >
      <Text style={styles.helperText}>{label}</Text>
      <Text style={styles.listText}>{value}</Text>
      {detail ? (
        <View
          accessibilityLabel={detail}
          testID={`${testID}-detail`}
        />
      ) : null}
    </View>
  );
}

function StockfishDiagnosticsPanel({
  stockfish
}: {
  stockfish: MobileStockfishCapabilities;
}): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [runId, setRunId] = useState(0);
  const [status, setStatus] = useState("Starting");
  const [lines, setLines] = useState<EngineAnalysisLine[]>([]);
  const [commands, setCommands] = useState<string[]>([]);
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [firstEvalMs, setFirstEvalMs] = useState<number | null>(null);
  const selectedPosition = ANALYSIS_DIAGNOSTIC_POSITIONS[selectedIndex] ?? ANALYSIS_DIAGNOSTIC_POSITIONS[0];

  useEffect(() => {
    const transport = stockfish.createTransport();
    let cancelled = false;
    let firstUpdateSeen = false;
    const analysisController = new AbortController();
    const startedAt = Date.now();

    setLines([]);
    setCommands([]);
    setRawLines([]);
    setFirstEvalMs(null);
    setStatus("Starting");

    if (!transport) {
      setStatus("Native Stockfish unavailable");
      return;
    }

    const tracedTransport: UciEngineTransport = {
      start: () => transport.start(),
      send: (command: string) => {
        if (!cancelled) {
          setCommands((current) => [...current.slice(-7), command]);
        }
        transport.send(command);
      },
      onLine: (listener: (line: string) => void) => transport.onLine((line) => {
        if (!cancelled) {
          setRawLines((current) => [...current.slice(-5), line]);
        }
        listener(line);
      }),
      terminate: () => transport.terminate()
    };

    void stockfish.prewarm().then((prewarmed) => {
      if (analysisController.signal.aborted) {
        return [];
      }
      return analyzeFenWithUciEngine(tracedTransport, selectedPosition.fen, {
        depth: ANALYSIS_DEPTH,
        initialize: !prewarmed,
        multiPv: 4,
        newGame: !prewarmed,
        onUpdate: (nextLines) => {
          if (cancelled) {
            return;
          }
          if (!firstUpdateSeen && nextLines.length > 0) {
            firstUpdateSeen = true;
            setFirstEvalMs(Date.now() - startedAt);
          }
          setLines(nextLines);
          const depth = nextLines.reduce((maxDepth, line) => Math.max(maxDepth, line.depth), 0);
          setStatus(depth > 0 ? `Depth ${depth}/${ANALYSIS_DEPTH}` : "Analyzing");
        },
        shallowDelayMs: 500,
        shallowDepth: 8,
        signal: analysisController.signal,
        timeoutMs: 30000
      });
    }).then(
      (finalLines) => {
        if (cancelled) {
          return;
        }
        setLines(finalLines);
        const depth = finalLines.reduce((maxDepth, line) => Math.max(maxDepth, line.depth), 0);
        setStatus(depth > 0 ? `Done · Depth ${depth}` : "No engine lines");
      },
      (caught) => {
        if (!cancelled) {
          setStatus(`Error · ${errorMessage(caught)}`);
        }
      }
    );

    return () => {
      cancelled = true;
      analysisController.abort();
    };
  }, [runId, selectedPosition, stockfish]);

  return (
    <View style={styles.listPanel} testID="stockfish-diagnostics-panel">
      <View style={styles.diagnosticHeader}>
        <View style={styles.diagnosticHeaderCopy}>
          <Text style={styles.panelTitle}>Stockfish Analysis</Text>
          <Text testID="stockfish-diagnostics-status" style={styles.helperText}>
            {firstEvalMs === null ? status : `${status} · first eval ${firstEvalMs}ms`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Run Stockfish diagnostics"
          testID="stockfish-diagnostics-run"
          style={styles.secondaryButton}
          onPress={() => setRunId((current) => current + 1)}
        >
          <Text style={styles.secondaryButtonText}>Run</Text>
        </Pressable>
      </View>

      <View style={styles.optionRow}>
        {ANALYSIS_DIAGNOSTIC_POSITIONS.map((position, index) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Analyze ${position.label}`}
            key={position.id}
            testID={`stockfish-diagnostics-position-${position.id}`}
            style={[styles.optionButton, index === selectedIndex ? styles.optionButtonActive : null]}
            onPress={() => {
              setSelectedIndex(index);
              setRunId((current) => current + 1);
            }}
          >
            <Text style={[styles.optionButtonText, index === selectedIndex ? styles.optionButtonTextActive : null]}>{position.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text testID="stockfish-diagnostics-fen" style={styles.diagnosticFen}>{selectedPosition.fen}</Text>

      <View style={styles.analysisPanel}>
        {lines.length > 0 ? (
          lines.map((line, index) => (
            <View key={`${line.multipv}-${line.move}-${line.depth}`} style={styles.analysisLineRow} testID={`stockfish-diagnostics-line-${index}`}>
              <Text style={styles.analysisEvalText}>{formatWhitePerspectiveScore(line.score)}</Text>
              <Text style={styles.analysisMoveText} numberOfLines={1}>
                {line.multipv}. {sanForDiagnosticMove(selectedPosition.fen, line.move)}
              </Text>
              <Text style={styles.analysisLineLabel} numberOfLines={1}>d{line.depth}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.helperText}>Waiting for scored engine lines.</Text>
        )}
      </View>

      {lines.length > 0 ? (
        <View style={styles.diagnosticPvPanel}>
          {lines.map((line) => (
            <Text key={`${line.multipv}-${line.move}-pv`} style={styles.diagnosticPvText} testID={`stockfish-diagnostics-pv-${line.multipv}`}>
              {formatWhitePerspectiveScore(line.score)} · d{line.depth} · {line.multipv}. {diagnosticPvSan(selectedPosition.fen, line.pv)}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.diagnosticLogPanel}>
        <Text style={styles.helperText}>Commands</Text>
        <Text testID="stockfish-diagnostics-commands" style={styles.diagnosticLogText}>{commands.join("\n") || "none"}</Text>
        <Text style={styles.helperText}>Latest UCI lines</Text>
        <Text testID="stockfish-diagnostics-raw-lines" style={styles.diagnosticLogText}>{rawLines.join("\n") || "none"}</Text>
      </View>
    </View>
  );
}

function OptionButton({
  active,
  label,
  testID,
  onPress
}: {
  active: boolean;
  label: string;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      testID={testID}
      style={[styles.optionButton, active ? styles.optionButtonActive : null]}
      onPress={onPress}
    >
      <Text style={[styles.optionButtonText, active ? styles.optionButtonTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function NavigationRail({
  activeTab,
  dueReviewCount,
  expanded,
  overdueReviewCount,
  width,
  onSelectTab
}: {
  activeTab: Tab;
  dueReviewCount: number;
  expanded: boolean;
  overdueReviewCount: number;
  width: number;
  onSelectTab: (tab: Exclude<Tab, "analysis">) => void;
}): React.JSX.Element {
  return (
    <View
      accessibilityLabel={expanded ? "Primary navigation rail" : "Compact navigation rail"}
      style={[styles.navigationRail, { width }]}
      testID="navigation-rail"
    >
      {PRIMARY_TABS.map((item) => (
        <TabButton
          key={item.tab}
          active={activeTab === item.tab}
          badgeAccessibilityLabel={
            item.tab === "review" && dueReviewCount > 0
              ? `${dueReviewCount} due reviews${overdueReviewCount > 0 ? `, ${overdueReviewCount} overdue` : ""}`
              : undefined
          }
          badgeCount={item.tab === "review" ? dueReviewCount : 0}
          badgeTone={item.tab === "review" && overdueReviewCount > 0 ? "danger" : "default"}
          expanded={expanded}
          label={item.label}
          presentation="rail"
          tab={item.tab}
          testID={item.testID}
          onPress={() => onSelectTab(item.tab)}
        />
      ))}
    </View>
  );
}

function TabButton({
  active,
  badgeAccessibilityLabel,
  badgeCount = 0,
  badgeTone = "default",
  expanded = true,
  label,
  presentation,
  tab,
  testID,
  onPress
}: {
  active: boolean;
  badgeAccessibilityLabel?: string;
  badgeCount?: number;
  badgeTone?: "default" | "danger";
  expanded?: boolean;
  label: string;
  presentation: "bottom" | "rail";
  tab: Exclude<Tab, "analysis">;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  const hasBadge = badgeCount > 0;
  const badgeText = badgeCount > 99 ? "99+" : `${badgeCount}`;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={[`${label} tab`, hasBadge ? badgeAccessibilityLabel : null].filter(Boolean).join(", ")}
      testID={testID}
      style={[
        styles.tabButton,
        presentation === "rail" ? styles.tabButtonRail : null,
        presentation === "rail" && expanded ? styles.tabButtonRailExpanded : null,
        presentation === "rail" && expanded && hasBadge ? styles.tabButtonRailExpandedWithBadge : null,
        active ? styles.tabButtonActive : null
      ]}
      onPress={onPress}
    >
      <View style={styles.tabIconBadge} testID={`${testID}-icon`}>
        <TabGlyph tab={tab} active={active} />
        {hasBadge ? (
          <Text
            allowFontScaling={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            numberOfLines={1}
            style={[
              styles.tabCountBadge,
              presentation === "rail" ? styles.tabCountBadgeRail : styles.tabCountBadgeBottom,
              badgeTone === "danger" ? styles.tabCountBadgeDanger : null
            ]}
            testID={`${testID}-badge`}
          >
            {badgeText}
          </Text>
        ) : null}
      </View>
      {presentation === "bottom" || expanded ? (
        <Text
          numberOfLines={presentation === "rail" && expanded ? 1 : undefined}
          style={[styles.tabText, presentation === "rail" ? styles.tabTextRail : null, active ? styles.tabTextActive : null]}
          testID={`${testID}-label`}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

function TabGlyph({
  active,
  tab
}: {
  active: boolean;
  tab: Exclude<Tab, "analysis">;
}): React.JSX.Element {
  const color = active ? "#2563EB" : "#64748B";
  if (tab === "practice") {
    return (
      <View style={styles.tabGlyphCanvas}>
        <View testID="practice-tab-target-outer" style={[styles.tabPracticeTargetOuter, { borderColor: color }]} />
        <View testID="practice-tab-target-inner" style={[styles.tabPracticeTargetInner, { borderColor: color }]} />
      </View>
    );
  }
  if (tab === "review") {
    return <View style={[styles.tabDiamondGlyph, { borderColor: color }]} />;
  }
  if (tab === "history") {
    return (
      <View style={styles.tabGlyphCanvas}>
        <View
          style={[styles.tabClockGlyph, { borderColor: color }]}
          testID="history-tab-clock-outline"
        >
          <View style={[styles.tabClockMinuteHand, { backgroundColor: color }]} />
          <View style={[styles.tabClockHourHand, { backgroundColor: color }]} />
          <View style={[styles.tabClockCenter, { backgroundColor: color }]} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.tabSliderGlyph}>
      <View style={[styles.tabSliderLine, { backgroundColor: color }]}>
        <View style={[styles.tabSliderKnob, styles.tabSliderKnobLeft, { backgroundColor: color }]} />
      </View>
      <View style={[styles.tabSliderLine, { backgroundColor: color }]}>
        <View style={[styles.tabSliderKnob, styles.tabSliderKnobRight, { backgroundColor: color }]} />
      </View>
      <View style={[styles.tabSliderLine, { backgroundColor: color }]}>
        <View style={[styles.tabSliderKnob, styles.tabSliderKnobMiddle, { backgroundColor: color }]} />
      </View>
    </View>
  );
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

function formatCompactDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function formatDurationLabel(seconds: number): string {
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}

function ordinalWord(value: number): string {
  const words: Readonly<Record<number, string>> = {
    1: "first",
    2: "second",
    3: "third",
    4: "fourth",
    5: "fifth",
    6: "sixth",
    7: "seventh",
    8: "eighth",
    9: "ninth",
    10: "tenth"
  };
  const word = words[value];
  if (word) {
    return word;
  }

  const modulo100 = value % 100;
  const suffix = modulo100 >= 11 && modulo100 <= 13
    ? "th"
    : value % 10 === 1
      ? "st"
      : value % 10 === 2
        ? "nd"
        : value % 10 === 3
          ? "rd"
          : "th";
  return `${value}${suffix}`;
}

function historyRangeLabel(range: HistoryTimeRange): string {
  if (range === "7d") {
    return "7 days";
  }
  if (range === "30d") {
    return "30 days";
  }
  if (range === "90d") {
    return "90 days";
  }
  if (range === "1y") {
    return "1 year";
  }
  return "All Time";
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

function customThemeLabel(theme: CustomThemeFilter): string {
  if (theme === ALL_THEMES_FILTER) {
    return "All";
  }
  return theme
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/^Mate In (\d+)$/, "Mate in $1")
    .replace(/^X Ray Attack$/, "X-Ray Attack");
}

function customThemeSelectionLabel(themes: readonly CustomThemeFilter[]): string {
  if (themes.length === 0) {
    return customThemeLabel(ALL_THEMES_FILTER);
  }
  return themes.map(customThemeLabel).join(", ");
}

function previousCustomConfigRowModel(
  config: CustomSprintConfigRecord,
  rating: number
): PreviousCustomConfig {
  const themes = customThemesFromStoredValue(config);
  return {
    id: safeTestId(config.id),
    mode: config.mode === "arrow_duel" ? "Arrow Duel" : "Regular Puzzles",
    customMode: config.mode === "arrow_duel" ? "arrow_duel" : "custom",
    themes,
    themeLabel: customThemeSelectionLabel(themes),
    durationSeconds: config.durationSeconds,
    perPuzzleSeconds: config.perPuzzleSeconds,
    timing: formatSprintTimingLabel(config),
    lastPlayed: formatConfigLastPlayed(config.lastStartedAt),
    ratingKey: config.ratingKey,
    rating
  };
}

function customThemesFromStoredValue(
  config: Pick<CustomSprintConfigRecord, "themes">
): CustomThemeFilter[] {
  return normalizeStoredThemeChoiceSelection(config.themes);
}

function formatConfigLastPlayed(lastStartedAt: string): string {
  const date = new Date(lastStartedAt);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function readRating(service: PracticeService, ratingKey: string): number {
  return service.getRating(ratingKey).rating;
}

function modeLabel(mode: SprintMode): string {
  if (mode === "arrow_duel") {
    return "Arrow Duel";
  }
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function formatEndReason(reason: SprintState["endReason"]): string {
  if (reason === "target_reached") {
    return "Target reached";
  }
  if (reason === "attempt_limit") {
    return "Planned puzzles complete";
  }
  if (reason === "max_mistakes") {
    return "Three mistakes";
  }
  if (reason === "time_expired") {
    return "Time expired";
  }
  if (reason === "puzzles_exhausted") {
    return "No more puzzles";
  }
  if (reason === "abandoned") {
    return "Abandoned";
  }
  return "Completed";
}

function moveResultMatchesExpectedFen(result: MoveResult, expectedFen: string | null): boolean {
  if (!expectedFen || !result.state?.fen) {
    return true;
  }
  return canonicalFen(result.state.fen) === canonicalFen(expectedFen);
}

function sanForDiagnosticMove(fen: string, move: string): string {
  try {
    const chess = new Chess(fen);
    const normalized = normalizeUci(move);
    const played = chess.move({
      from: normalized.slice(0, 2),
      to: normalized.slice(2, 4),
      ...(normalized.length > 4 ? { promotion: normalized.slice(4, 5) } : {})
    });
    return played?.san ?? move;
  } catch {
    return move;
  }
}

function diagnosticPvSan(fen: string, pv: string[]): string {
  const chess = new Chess(fen);
  const sanMoves: string[] = [];
  for (const move of pv.slice(0, 8)) {
    try {
      const normalized = normalizeUci(move);
      const played = chess.move({
        from: normalized.slice(0, 2),
        to: normalized.slice(2, 4),
        ...(normalized.length > 4 ? { promotion: normalized.slice(4, 5) } : {})
      });
      if (!played) {
        break;
      }
      sanMoves.push(played.san);
    } catch {
      break;
    }
  }
  return sanMoves.join(" ") || pv.join(" ");
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

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
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

const FABRIC_SAFE_HIDDEN_TEXT_STYLE = {
  // Android Fabric rejects zero-sized fonts even when the Text is fully hidden.
  fontSize: 1,
  height: 0,
  opacity: 0,
  width: 0
} as const;

const styles = StyleSheet.create({
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
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    flex: 1,
    justifyContent: "center",
    padding: 20
  },
  predictiveBackStage: {
    backgroundColor: "#DCE7F5",
    flex: 1
  },
  predictiveBackDestination: {
    alignItems: "center",
    backgroundColor: "#DCE7F5",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    padding: 32,
    position: "absolute",
    right: 0,
    top: 0
  },
  predictiveBackEyebrow: {
    color: "#516078",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  predictiveBackDestinationLabel: {
    color: "#172033",
    fontSize: 24,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center"
  },
  safeArea: {
    backgroundColor: "#F8FAFC",
    flex: 1
  },
  appRootShell: {
    backgroundColor: "#F8FAFC",
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
    backgroundColor: "rgba(248, 250, 252, 0.92)",
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
    backgroundColor: "#FFFFFF",
    borderColor: "#DBEAFE",
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    maxWidth: 320,
    paddingHorizontal: 28,
    paddingVertical: 24,
    width: "100%"
  },
  sprintLoadingTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800"
  },
  sprintLoadingDetail: {
    color: "#64748B",
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
    color: "#111827",
    fontSize: 22,
    fontWeight: "700"
  },
  bottomTabs: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderTopColor: "#E2E8F0",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 4
  },
  navigationRail: {
    alignItems: "stretch",
    backgroundColor: "#FFFFFF",
    borderRightColor: "#E2E8F0",
    borderRightWidth: StyleSheet.hairlineWidth,
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 16
  },
  tabButton: {
    alignItems: "center",
    flex: 1,
    gap: 2,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 2
  },
  tabButtonRail: {
    borderRadius: 8,
    flex: 0,
    flexDirection: "column",
    minHeight: 54,
    paddingHorizontal: 6,
    paddingVertical: 6
  },
  tabButtonRailExpanded: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-start",
    minHeight: 50,
    paddingHorizontal: 12
  },
  tabButtonRailExpandedWithBadge: {
    gap: 22
  },
  tabButtonActive: {
    backgroundColor: "transparent"
  },
  tabIconBadge: {
    alignItems: "center",
    borderRadius: 999,
    height: 20,
    justifyContent: "center",
    overflow: "visible",
    position: "relative",
    width: 32
  },
  tabCountBadge: {
    backgroundColor: "#2563EB",
    borderColor: "#FFFFFF",
    borderRadius: 999,
    borderWidth: 1,
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
    includeFontPadding: false,
    lineHeight: 14,
    minHeight: 18,
    minWidth: 18,
    overflow: "hidden",
    paddingHorizontal: 4,
    paddingVertical: 1,
    position: "absolute",
    textAlign: "center",
    textAlignVertical: "center",
    zIndex: 1
  },
  tabCountBadgeBottom: {
    left: 24,
    top: -8
  },
  tabCountBadgeRail: {
    left: 24,
    top: -7
  },
  tabCountBadgeDanger: {
    backgroundColor: "#DC2626"
  },
  tabText: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700"
  },
  tabTextRail: {
    fontSize: 13,
    fontWeight: "800"
  },
  tabTextActive: {
    color: "#2563EB"
  },
  tabGlyphCanvas: {
    alignItems: "center",
    height: 16,
    justifyContent: "center",
    width: 16
  },
  tabPracticeTargetOuter: {
    borderRadius: 999,
    borderWidth: 2,
    height: 15,
    position: "absolute",
    width: 15
  },
  tabPracticeTargetInner: {
    borderRadius: 999,
    borderWidth: 2,
    height: 7,
    position: "absolute",
    width: 7
  },
  tabDiamondGlyph: {
    borderRadius: 2,
    borderWidth: 2,
    height: 12,
    transform: [{ rotate: "45deg" }],
    width: 12
  },
  tabClockGlyph: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 2,
    height: 15,
    justifyContent: "center",
    width: 15
  },
  tabClockMinuteHand: {
    borderRadius: 999,
    height: 5,
    left: 4.5,
    position: "absolute",
    top: 1,
    width: 2
  },
  tabClockHourHand: {
    borderRadius: 999,
    height: 2,
    left: 6.5,
    position: "absolute",
    top: 5,
    width: 4
  },
  tabClockCenter: {
    borderRadius: 999,
    height: 2,
    left: 4.5,
    position: "absolute",
    top: 5,
    width: 2
  },
  tabPackHandle: {
    borderBottomWidth: 0,
    borderRadius: 2,
    borderWidth: 2,
    height: 4,
    position: "absolute",
    top: 2,
    width: 8
  },
  tabPackBody: {
    borderRadius: 3,
    borderWidth: 2,
    height: 12,
    position: "absolute",
    top: 4,
    width: 14
  },
  tabSliderGlyph: {
    gap: 3,
    width: 16
  },
  tabSliderLine: {
    borderRadius: 999,
    height: 2,
    position: "relative",
    width: 16
  },
  tabSliderKnob: {
    borderRadius: 999,
    height: 5,
    position: "absolute",
    top: -1.5,
    width: 5
  },
  tabSliderKnobLeft: {
    left: 1
  },
  tabSliderKnobMiddle: {
    left: 6
  },
  tabSliderKnobRight: {
    right: 1
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
  contentWithBottomTabs: {
    paddingBottom: 96
  },
  contentSessionRail: {
    flexGrow: 1,
    justifyContent: "flex-start"
  },
  practiceHome: {
    gap: 12
  },
  practiceHomeColumns: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 14
  },
  practiceHomeStack: {
    flexDirection: "column",
    gap: 18
  },
  practiceHomePrimaryColumn: {
    gap: 12,
    minWidth: 0
  },
  practiceHomePrimaryColumnWide: {
    flexBasis: 0,
    flexGrow: 1.1,
    flexShrink: 1,
    width: "auto"
  },
  practiceHomeSecondaryColumn: {
    gap: 12,
    minWidth: 280
  },
  practiceHomeSecondaryColumnWide: {
    flexBasis: 0,
    flexGrow: 0.9,
    flexShrink: 1,
    width: "auto"
  },
  practiceHomeColumnStacked: {
    flexBasis: "auto",
    flexGrow: 0,
    flexShrink: 0,
    width: "100%"
  },
  runManagementPanel: {
    gap: 10
  },
  runManagementToolbar: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between"
  },
  runManagementToolbarActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginLeft: "auto"
  },
  sprintRulesHelpLink: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 2
  },
  sprintRulesHelpIcon: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
    borderRadius: 999,
    borderWidth: 1,
    height: 24,
    justifyContent: "center",
    width: 24
  },
  sprintRulesHelpIconText: {
    color: "#1D4ED8",
    fontSize: 13,
    fontWeight: "900"
  },
  sprintRulesHelpLinkText: {
    color: "#1D4ED8",
    fontSize: 13,
    fontWeight: "800"
  },
  sprintRulesGuide: {
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  sprintRulesGuideHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  sprintRulesGuideTitleBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  sprintRulesEyebrow: {
    color: "#1D4ED8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8
  },
  sprintRulesGuideTitle: {
    color: "#111827",
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 24
  },
  sprintRulesDismissButton: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 8,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  sprintRulesDismissText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900"
  },
  sprintRulesList: {
    gap: 8
  },
  sprintRuleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    minHeight: 54
  },
  sprintRuleBadge: {
    alignItems: "center",
    backgroundColor: "#DBEAFE",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    minWidth: 72,
    paddingHorizontal: 6,
  },
  sprintRuleBadgeDanger: {
    backgroundColor: "#FEE2E2"
  },
  sprintRuleBadgeWarning: {
    backgroundColor: "#FEF3C7"
  },
  sprintRuleBadgeText: {
    color: "#1D4ED8",
    fontFamily: "menlo",
    fontSize: 13,
    fontWeight: "900"
  },
  sprintRuleBadgeTextDanger: {
    color: "#B91C1C"
  },
  sprintRuleBadgeTextWarning: {
    color: "#B45309"
  },
  sprintRuleCopy: {
    flex: 1,
    gap: 1,
    minWidth: 0
  },
  sprintRuleLabel: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "800"
  },
  sprintRuleDetail: {
    color: "#475569",
    fontSize: 11,
    lineHeight: 15
  },
  sprintRulesGuideFootnote: {
    borderTopColor: "#BFDBFE",
    borderTopWidth: StyleSheet.hairlineWidth,
    color: "#334155",
    fontSize: 11,
    lineHeight: 16,
    paddingTop: 10
  },
  sessionGuideCalibrated: {
    alignSelf: "center",
    gap: 12,
    position: "relative",
    width: "100%"
  },
  sessionGuideCoachFrame: {
    alignSelf: "center",
    gap: 12,
    overflow: "hidden",
    pointerEvents: "box-none",
    position: "relative",
    width: "100%"
  },
  sessionGuideCoachLayer: {
    position: "relative",
    zIndex: 1
  },
  sessionGuideCoachPrompt: {
    alignSelf: "center"
  },
  sessionGuideCoachDimmed: {
    opacity: 0.34
  },
  sessionGuideCoachTimerTarget: {
    alignItems: "center",
    alignSelf: "center",
    justifyContent: "center",
    minWidth: 112
  },
  sessionGuideCoachBoardSurface: {
    alignSelf: "center",
    overflow: "hidden",
    position: "relative"
  },
  sessionGuideStaticBoardSquares: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  sessionGuideStaticBoardSquare: {
    alignItems: "center",
    justifyContent: "center"
  },
  sessionGuideStaticBoardSquareLight: {
    backgroundColor: BOARD_COLOR_TOKENS.white
  },
  sessionGuideStaticBoardSquareDark: {
    backgroundColor: BOARD_COLOR_TOKENS.black
  },
  sessionGuideStaticPieceViewport: {
    overflow: "hidden",
    position: "relative"
  },
  sessionGuideStaticPieceSprite: {
    position: "absolute"
  },
  sessionGuideCoachCallout: {
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
    borderRadius: 10,
    borderWidth: 1,
    gap: 3,
    padding: 11,
    paddingTop: 5,
    position: "absolute",
    zIndex: 60
  },
  sessionGuideCoachCopy: {
    gap: 3
  },
  sessionGuideCoachCalloutWarning: {
    backgroundColor: "#FFFBEB",
    borderColor: "#F59E0B"
  },
  sessionGuideCoachCalloutDanger: {
    backgroundColor: "#FEF2F2",
    borderColor: "#EF4444"
  },
  sessionGuideCoachPointer: {
    color: "#2563EB",
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 18,
    textAlign: "center"
  },
  sessionGuideCoachPointerTop: {
    left: 0,
    position: "absolute",
    right: 0,
    top: -22
  },
  sessionGuideCoachPointerBottomShape: {
    bottom: -16,
    height: 12,
    position: "absolute",
    width: 24
  },
  sessionGuideCoachPointerBottomCentered: {
    left: "50%",
    transform: [{ translateX: -12 }]
  },
  sessionGuideCoachPointerBottomLine: {
    height: 6,
    left: 11,
    position: "absolute",
    top: 0,
    width: 2
  },
  sessionGuideCoachPointerBottomHead: {
    borderLeftColor: "transparent",
    borderLeftWidth: 5,
    borderRightColor: "transparent",
    borderRightWidth: 5,
    borderTopWidth: 6,
    height: 0,
    left: 7,
    position: "absolute",
    top: 6,
    width: 0
  },
  sessionGuideCoachPointerLeft: {
    left: -20,
    position: "absolute",
    top: "50%",
    transform: [{ translateY: -9 }],
    width: 18
  },
  sessionGuideCoachPointerRight: {
    position: "absolute",
    right: -20,
    top: "50%",
    transform: [{ translateY: -9 }],
    width: 18
  },
  sessionGuideCoachPointerWarning: {
    color: "#D97706"
  },
  sessionGuideCoachPointerDanger: {
    color: "#DC2626"
  },
  sessionGuideCoachTargetConnector: {
    backgroundColor: "#2563EB",
    height: 2,
    position: "absolute",
    top: "50%",
    transform: [{ translateY: -1 }]
  },
  sessionGuideCoachTargetConnectorWarning: {
    backgroundColor: "#D97706"
  },
  sessionGuideCoachTargetConnectorDanger: {
    backgroundColor: "#DC2626"
  },
  sessionGuideCoachTargetArrowHead: {
    borderBottomColor: "transparent",
    borderBottomWidth: 5,
    borderLeftWidth: 8,
    borderTopColor: "transparent",
    borderTopWidth: 5,
    height: 0,
    position: "absolute",
    width: 0
  },
  sessionGuideCoachTargetConnectorHead: {
    right: -8,
    top: -4
  },
  sessionGuideCoachTargetRoute: {
    position: "absolute"
  },
  sessionGuideCoachTargetRouteHorizontal: {
    backgroundColor: "#2563EB",
    height: 2,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  sessionGuideCoachTargetRouteVertical: {
    backgroundColor: "#2563EB",
    position: "absolute",
    right: 0,
    top: 0,
    width: 2
  },
  sessionGuideCoachTargetRouteHead: {
    right: -8
  },
  sessionGuideArrowDuelTargetConnector: {
    position: "absolute"
  },
  sessionGuideArrowDuelTargetConnectorVertical: {
    backgroundColor: "#2563EB",
    bottom: 0,
    left: 4,
    position: "absolute",
    top: 7,
    width: 2
  },
  sessionGuideArrowDuelTargetConnectorHead: {
    borderBottomColor: "#2563EB",
    borderBottomWidth: 7,
    borderLeftColor: "transparent",
    borderLeftWidth: 5,
    borderRightColor: "transparent",
    borderRightWidth: 5,
    height: 0,
    left: 0,
    position: "absolute",
    top: 0,
    width: 0
  },
  sessionGuideCoachBadge: {
    color: "#1D4ED8",
    fontFamily: "menlo",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4
  },
  sessionGuideCoachBadgeWarning: {
    color: "#B45309"
  },
  sessionGuideCoachBadgeDanger: {
    color: "#B91C1C"
  },
  sessionGuideCoachNavigation: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    justifyContent: "space-between",
    padding: 8,
    width: "100%"
  },
  sessionGuideCoachNavigationRail: {
    bottom: 0,
    gap: 6,
    padding: 4,
    position: "absolute",
    zIndex: 6
  },
  sessionGuideCoachNavigationNarrow: {
    flexDirection: "column",
    gap: 6,
    padding: 6
  },
  sessionGuideCoachBackButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 76,
    paddingHorizontal: 10
  },
  sessionGuideCoachBackButtonRail: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 8
  },
  sessionGuideCoachActionNarrow: {
    minWidth: 0,
    width: "100%"
  },
  sessionGuideCoachBackButtonDisabled: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0"
  },
  sessionGuideCoachBackSpacer: {
    minWidth: 76
  },
  sessionGuideCoachBackSpacerRail: {
    minWidth: 64
  },
  sessionGuideCoachBackText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900"
  },
  sessionGuideCoachBackTextDisabled: {
    color: "#94A3B8"
  },
  sessionGuideCoachProgress: {
    color: "#64748B",
    flex: 1,
    flexShrink: 0,
    fontFamily: "menlo",
    fontSize: 10,
    fontWeight: "900",
    minWidth: 42,
    textAlign: "center"
  },
  sessionGuideCoachProgressNarrow: {
    flex: 0,
    minWidth: 0,
    width: "100%"
  },
  sessionGuideCoachNextButton: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 12
  },
  sessionGuideCoachNextButtonRail: {
    flexShrink: 1,
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 8
  },
  sessionGuideInfoTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "800"
  },
  sessionGuideInfoText: {
    color: "#475569",
    fontSize: 11,
    lineHeight: 16
  },
  sessionGuideOptionalSettingsNotice: {
    backgroundColor: "#DBEAFE",
    borderColor: "#93C5FD",
    borderRadius: 7,
    borderWidth: 1,
    color: "#1E3A8A",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  sessionGuideOptionalSettingsLabel: {
    color: "#1D4ED8",
    fontWeight: "900"
  },
  sessionGuideStartButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900"
  },
  sessionGuideStartButtonTextRail: {
    fontSize: 12
  },
  primaryCompactButton: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  secondaryCompactButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  secondaryCompactButtonText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  runNotice: {
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  runNoticeText: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "700"
  },
  runEmptyState: {
    alignItems: "flex-start",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderStyle: "dashed",
    borderWidth: 1,
    gap: 6,
    padding: 14
  },
  runEmptyAction: {
    flex: 0,
    marginTop: 4
  },
  runNoSelectionCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    minHeight: 76,
    padding: 14
  },
  runCardEditing: {
    alignItems: "center",
    flexWrap: "wrap",
    paddingVertical: 10
  },
  runCardDragging: {
    opacity: 0.9
  },
  runCardNativeDragging: {
    elevation: 8,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    zIndex: 20
  },
  runInsertionOutline: {
    backgroundColor: "rgba(37, 99, 235, 0.025)",
    borderColor: "#2563EB",
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 2,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 15
  },
  runEditingMeta: {
    borderTopColor: "#E2E8F0",
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 8,
    width: "100%"
  },
  runEditActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  runEditButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 9
  },
  runEditButtonText: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "800"
  },
  runIconButton: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 34
  },
  runReorderButton: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE"
  },
  runRemoveButton: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5"
  },
  runRemoveButtonText: {
    color: "#DC2626",
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 22
  },
  runRemovalConfirmation: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  runRemovalCopy: {
    gap: 3
  },
  runRemovalActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end"
  },
  runRestoreSection: {
    gap: 6,
    marginTop: 4
  },
  runRestoreList: {
    gap: 6
  },
  runRestoreRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  runRestoreCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  runEditorIntro: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  sprintPassRulesCard: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 10,
    borderWidth: 1,
    gap: 7,
    padding: 12
  },
  sprintPassRulesHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  sprintPassRulesHeadline: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 2
  },
  sprintPassRulesTarget: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    minWidth: 58,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  sprintPassRulesTargetValue: {
    color: "#1D4ED8",
    fontFamily: "menlo",
    fontSize: 18,
    fontWeight: "900"
  },
  sprintPassRulesTargetLabel: {
    color: "#1D4ED8",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6
  },
  sprintPassRulesHint: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700"
  },
  runEditorDetailsLabel: {
    marginBottom: -4
  },
  runEditorRunName: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19
  },
  runNameRow: {
    alignItems: "flex-start",
    gap: 16
  },
  runNameCopy: {
    flexShrink: 0,
    gap: 2,
    paddingTop: 2
  },
  requiredFieldLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700"
  },
  runNameInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#111827",
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    maxWidth: 200,
    minHeight: 40,
    minWidth: 160,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  runNameInputError: {
    borderColor: "#DC2626"
  },
  runEloInputShell: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 40,
    overflow: "hidden",
    width: 72
  },
  runEloInputShellError: {
    borderColor: "#DC2626"
  },
  runEloInput: {
    color: "#111827",
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    minHeight: 40,
    minWidth: 64,
    paddingHorizontal: 8,
    paddingVertical: 7,
    textAlign: "center"
  },
  runEloStepper: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 6
  },
  runNameError: {
    backgroundColor: "#FEF2F2",
    borderBottomColor: "#FCA5A5",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  runNameErrorText: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "700"
  },
  runThemeLabelRow: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  sectionHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  historyHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 38
  },
  historyHeaderActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  historyResetButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 12
  },
  historyResetButtonText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800"
  },
  screenTitle: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28
  },
  sectionLabel: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "800"
  },
  modeList: {
    gap: 8
  },
  practiceModeCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  practiceModeCardActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD"
  },
  managedRunCard: {
    borderColor: "#CBD5E1",
    borderStyle: "solid",
    minHeight: 62
  },
  managedRunCardActive: {
    borderColor: "#60A5FA"
  },
  practiceModeSelectArea: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 0
  },
  practiceModeIcon: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  practiceModeIconActive: {
    backgroundColor: "#DBEAFE"
  },
  modeGlyphCanvas: {
    alignItems: "center",
    height: 18,
    justifyContent: "center",
    width: 18
  },
  modeTargetOuter: {
    borderRadius: 999,
    borderWidth: 2,
    height: 17,
    position: "absolute",
    width: 17
  },
  modeTargetInner: {
    borderRadius: 999,
    borderWidth: 2,
    height: 10,
    position: "absolute",
    width: 10
  },
  modeDuelArrow: {
    height: 7,
    left: 1,
    position: "absolute",
    width: 15
  },
  modeDuelArrowUpper: {
    top: 1,
    transform: [{ rotate: "-28deg" }]
  },
  modeDuelArrowLower: {
    bottom: 1,
    transform: [{ rotate: "28deg" }]
  },
  modeDuelArrowShaft: {
    borderRadius: 999,
    height: 2,
    left: 0,
    position: "absolute",
    top: 2.5,
    width: 13
  },
  modeDuelArrowHeadTop: {
    borderRadius: 999,
    height: 2,
    position: "absolute",
    right: 0,
    top: 1,
    transform: [{ rotate: "45deg" }],
    width: 6
  },
  modeDuelArrowHeadBottom: {
    borderRadius: 999,
    bottom: 1,
    height: 2,
    position: "absolute",
    right: 0,
    transform: [{ rotate: "-45deg" }],
    width: 6
  },
  modeBoltTop: {
    borderRadius: 999,
    height: 3,
    left: 6,
    position: "absolute",
    top: 2,
    transform: [{ rotate: "-72deg" }],
    width: 14
  },
  modeBoltBottom: {
    borderRadius: 999,
    bottom: 2,
    height: 3,
    left: 1,
    position: "absolute",
    transform: [{ rotate: "-72deg" }],
    width: 14
  },
  modeListGlyph: {
    gap: 3,
    width: 16
  },
  modeListBar: {
    borderRadius: 999,
    height: 3,
    width: 16
  },
  practiceModeCopy: {
    flex: 1,
    gap: 2,
    justifyContent: "center",
    minWidth: 0
  },
  practiceModeTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  practiceModeTitle: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18
  },
  practiceModeDescription: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16
  },
  practiceModeDetailProbe: {
    height: 0,
    opacity: 0,
    overflow: "hidden",
    width: 0
  },
  practiceModeMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    justifyContent: "center"
  },
  practiceModeRating: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14
  },
  practiceModeDisclosure: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 28
  },
  practiceProgressCard: {
    alignItems: "flex-start",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 92,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  practiceSummaryColumnGap: {
    marginHorizontal: 12,
    width: 1
  },
  progressMetric: {
    alignItems: "center",
    flex: 1,
    gap: 4,
    justifyContent: "flex-start",
    minWidth: 0
  },
  progressMetricLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15,
    textAlign: "center"
  },
  progressDivider: {
    alignSelf: "stretch",
    backgroundColor: "#E2E8F0"
  },
  progressValue: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 26,
    textAlign: "center"
  },
  progressDelta: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15,
    textAlign: "center"
  },
  progressContextText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14,
    textAlign: "center"
  },
  progressDeltaPositive: {
    color: "#16A34A"
  },
  progressDeltaNegative: {
    color: "#DC2626"
  },
  progressDeltaNeutral: {
    color: "#64748B"
  },
  resumeSprintCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#93C5FD",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  resumeSprintCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  resumeSprintAction: {
    color: "#2563EB",
    fontSize: 13,
    fontWeight: "900"
  },
  pausedSessionPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  pausedSessionCopy: {
    gap: 4
  },
  pausedSessionActions: {
    flexDirection: "row",
    gap: 10
  },
  reviewQueuePanel: {
    gap: 12
  },
  reviewFilterControlSlot: {
    height: 32,
    overflow: "hidden"
  },
  reviewFilterButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  reviewFilterButtonActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB"
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
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 76,
    padding: 12
  },
  reviewDueCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  reviewDueTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "800"
  },
  reviewDueBigCount: {
    color: "#2563EB",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 28,
    textAlign: "center"
  },
  reviewDueCountBlock: {
    alignItems: "center",
    gap: 2,
    justifyContent: "center",
    minWidth: 58
  },
  reviewDueHiddenMetric: FABRIC_SAFE_HIDDEN_TEXT_STYLE,
  reviewFilterScroller: {
    marginHorizontal: -UI_PADDING
  },
  reviewFilterContent: {
    gap: 8,
    paddingHorizontal: UI_PADDING
  },
  reviewForecastRow: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden"
  },
  reviewForecastMetric: {
    alignItems: "center",
    borderRightColor: "#E2E8F0",
    borderRightWidth: 1,
    flex: 1,
    gap: 2,
    justifyContent: "center",
    minHeight: 62,
    paddingHorizontal: 6,
    paddingVertical: 10
  },
  reviewForecastCount: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "900"
  },
  reviewForecastLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center"
  },
  reviewItemList: {
    gap: 8
  },
  reviewSectionToggle: {
    alignItems: "center",
    flexDirection: "row",
    height: 44,
    justifyContent: "space-between",
  },
  reviewSectionToggleMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    height: 18
  },
  reviewSectionCount: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "800",
    includeFontPadding: false,
    lineHeight: 18,
    textAlignVertical: "center"
  },
  reviewSectionToggleChevron: {
    alignItems: "center",
    height: 18,
    justifyContent: "center",
    width: 18
  },
  reviewSectionItems: {
    gap: 8
  },
  reviewItemCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
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
    backgroundColor: "#2563EB",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  reviewRetryGlyph: {
    color: "#FFFFFF",
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
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 10
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
  sessionGuideControlRail: {
    gap: 4
  },
  activeSessionBottomFeedback: {
    alignSelf: "center"
  },
  activeSessionRailBottomFeedback: {
    marginTop: "auto"
  },
  sessionGuideRailBottomFeedback: {
    bottom: 60,
    position: "absolute",
    right: 0,
    zIndex: 4
  },
  activeSessionShell: {
    gap: 8
  },
  sessionNavRow: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
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
    color: "#111827",
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
  sessionMetricBlock: {
    alignItems: "center",
    flex: 1,
    gap: 3,
    justifyContent: "center",
    minWidth: 0
  },
  personalBestSideMetricBlock: {
    flex: 0.9
  },
  personalBestTimerMetricBlock: {
    flex: 1.2
  },
  personalBestTimerText: {
    fontFamily: "System",
    fontSize: 16,
    letterSpacing: 0,
    textAlign: "center"
  },
  activeMistakeIndicator: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 42
  },
  activeMistakeDots: {
    flexDirection: "row",
    gap: 3
  },
  activeMistakeDot: {
    backgroundColor: "#FFFFFF",
    borderColor: "#94A3B8",
    borderRadius: 3,
    borderWidth: 1,
    height: 9,
    width: 9
  },
  activeMistakeDotUsed: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626"
  },
  sessionAbandonConfirm: {
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
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
  sessionAbandonActions: {
    flexDirection: "row",
    gap: 8
  },
  survivalExitAction: {
    flex: 1
  },
  survivalExitBest: {
    color: "#1D4ED8",
    fontSize: 14,
    fontWeight: "900"
  },
  survivalExitPrimaryActions: {
    flexDirection: "row",
    gap: 8
  },
  survivalExitSheet: {
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
    borderRadius: 12,
    borderWidth: 1,
    gap: 11,
    padding: 12
  },
  survivalExitTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "900"
  },
  sessionProgressValue: {
    color: "#111827",
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center"
  },
  moveSideKingGlyph: {
    overflow: "hidden",
    position: "relative"
  },
  moveSideKingSprite: {
    position: "absolute"
  },
  timerText: {
    color: "#111827",
    fontFamily: "menlo",
    fontSize: 21,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.2
  },
  sessionMetricTextCompact: {
    fontSize: 16,
    letterSpacing: 0
  },
  puzzleTimingIndicator: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderColor: "#CBD5E1",
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
    backgroundColor: "#FFFBEB",
    borderColor: "#F59E0B"
  },
  puzzleTimingIndicatorText: {
    color: "#475569",
    fontFamily: "menlo",
    fontSize: 11,
    fontWeight: "800",
    fontVariant: ["tabular-nums"]
  },
  puzzleTimingIndicatorTextSlow: {
    color: "#B45309"
  },
  puzzleTimingCountdown: {
    backgroundColor: "#F59E0B",
    borderRadius: 999,
    color: "#FFFFFF",
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
    backgroundColor: "rgba(15, 23, 42, 0.90)",
    justifyContent: "center",
    zIndex: 60
  },
  puzzleTimeoutOverlayTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900"
  },
  puzzleTimeoutOverlayDetail: {
    color: "#E2E8F0",
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
    borderColor: "#E2E8F0",
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
    backgroundColor: "rgba(15, 23, 42, 0.90)",
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
    color: "#FFFFFF",
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
    color: "#FFFFFF",
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
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
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
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 8,
    textAlign: "center"
  },
  arrowDuelWhatIfSettingsHint: {
    alignSelf: "center",
    backgroundColor: "rgba(219, 234, 254, 0.14)",
    borderColor: "rgba(147, 197, 253, 0.48)",
    borderRadius: 999,
    borderWidth: 1,
    color: "#DBEAFE",
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
    backgroundColor: "#FFFFFF",
    borderRadius: 9,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 44,
    minWidth: 112,
    paddingHorizontal: 18
  },
  arrowDuelWhatIfActionText: {
    color: "#0F172A",
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
    color: "#334155",
    textShadowColor: "rgba(248, 250, 252, 0.85)"
  },
  coordinateTextOnDark: {
    color: "#F8FAFC",
    textShadowColor: "rgba(15, 23, 42, 0.55)"
  },
  promptPanel: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  practicePromptStack: {
    gap: 6
  },
  promptIcon: {
    alignItems: "center",
    flexShrink: 0,
    justifyContent: "center"
  },
  arrowDuelReplyPromptActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#60A5FA"
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
    backgroundColor: "#2563EB",
    borderRadius: 999,
    color: "#FFFFFF",
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
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
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
    color: "#334155",
    flex: 1,
    fontSize: 12,
    fontWeight: "700"
  },
  unclearPromptButton: {
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderColor: "#F59E0B",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 30,
    paddingHorizontal: 8
  },
  unclearPromptButtonText: {
    color: "#B45309",
    fontSize: 11,
    fontWeight: "900"
  },
  previousAttemptNoticeCopy: {
    flex: 1,
    gap: 1,
    minWidth: 0
  },
  previousAttemptNoticeTitle: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  previousAttemptNoticeDetail: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600"
  },
  readOnlyAttemptStatus: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 30,
    paddingHorizontal: 8
  },
  readOnlyAttemptStatusText: {
    color: "#1D4ED8",
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
    color: "#111827",
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
    color: "#334155",
    fontSize: 12,
    fontWeight: "600"
  },
  promptHint: {
    color: "#2563EB",
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
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
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
    color: "#64748B",
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
  sessionScoreIcon: {
    alignItems: "center",
    height: 20,
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 999,
    position: "relative",
    width: 20
  },
  sessionScoreDotPositive: {
    backgroundColor: "#16A34A"
  },
  sessionScoreDotNegative: {
    backgroundColor: "#DC2626"
  },
  sessionScoreDotNeutral: {
    backgroundColor: "#F8FAFC",
    borderColor: "#94A3B8",
    borderWidth: 1.5
  },
  sessionScoreGlyphLine: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    position: "absolute"
  },
  sessionScoreCheckShort: {
    height: 2,
    left: 5,
    top: 10,
    transform: [{ rotate: "45deg" }],
    width: 6
  },
  sessionScoreCheckLong: {
    height: 2,
    right: 4,
    top: 9,
    transform: [{ rotate: "-48deg" }],
    width: 10
  },
  sessionScoreCrossForward: {
    height: 2.25,
    transform: [{ rotate: "45deg" }],
    width: 10
  },
  sessionScoreCrossBackward: {
    height: 2.25,
    transform: [{ rotate: "-45deg" }],
    width: 10
  },
  sessionScoreNeutralLine: {
    backgroundColor: "#64748B",
    borderRadius: 999,
    height: 2.25,
    width: 8
  },
  sessionScoreValue: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 17
  },
  emptyBoard: {
    alignItems: "center",
    backgroundColor: "#E6E8EB",
    justifyContent: "center"
  },
  emptyBoardText: {
    color: "#64748B",
    fontSize: 18,
    fontWeight: "700"
  },
  customSetupPanel: {
    gap: 12
  },
  sprintScreenHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 40
  },
  sprintHeaderSideSlot: {
    alignItems: "flex-start",
    width: 64
  },
  sprintHeaderTitleBlock: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center"
  },
  sprintHeaderTitleBlockLeading: {
    alignItems: "flex-start"
  },
  sprintScreenTitle: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center"
  },
  sprintScreenTitleLeading: {
    textAlign: "left"
  },
  sprintHeaderStartButton: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 8,
    height: 40,
    justifyContent: "center",
    minWidth: 64,
    paddingHorizontal: 14
  },
  customConfigCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden"
  },
  customConfigRow: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  runTimingSectionCopy: {
    gap: 2
  },
  runTimingRow: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    minHeight: 66,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  runTimingRowCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  arrowDuelReplySettingControl: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 6
  },
  arrowDuelReplySettingValue: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  arrowDuelReplySecondsControl: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 6
  },
  arrowDuelReplySecondsInputShell: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 38,
    overflow: "hidden",
    width: 64
  },
  arrowDuelReplySecondsInput: {
    color: "#111827",
    flex: 1,
    fontFamily: "menlo",
    fontSize: 14,
    fontWeight: "800",
    minHeight: 38,
    minWidth: 54,
    paddingHorizontal: 7,
    paddingVertical: 6,
    textAlign: "center"
  },
  arrowDuelReplySecondsUnit: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800"
  },
  runTimingControls: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 6
  },
  runTimingStepper: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  runTimingControlDisabled: {
    opacity: 0.38
  },
  runTimingStepButton: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 7,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  runTimingStepText: {
    color: "#334155",
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 19
  },
  runTimingValue: {
    color: "#334155",
    fontFamily: "menlo",
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    minWidth: 34,
    textAlign: "center"
  },
  runTimingToggle: {
    alignItems: "center",
    height: 36,
    justifyContent: "center"
  },
  customChoiceCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  customStepperGroup: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 10
  },
  customStepperCompact: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  customStepperButton: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 36
  },
  customConfigValue: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800"
  },
  customInlineOptions: {
    flexDirection: "row",
    flexShrink: 1,
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "flex-end"
  },
  customThemeRow: {
    justifyContent: "center"
  },
  customThemeOptions: {
    flex: 1,
    justifyContent: "center"
  },
  customMiniChip: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  customMiniChipActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB"
  },
  customMiniChipText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  customMiniChipTextActive: {
    color: "#1D4ED8"
  },
  themeCatalogSection: {
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  themeCatalogHeadingRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  themeCatalogExpandableContent: {
    gap: 10
  },
  themeCatalogTitle: {
    color: "#1E293B",
    fontSize: 14,
    fontWeight: "900"
  },
  themeCatalogGroup: {
    gap: 6
  },
  themeCatalogGroupLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  themeCatalogRailContent: {
    flexDirection: "row",
    gap: 6,
    paddingRight: 12
  },
  themeCatalogGroupGrid: {
    gap: 8
  },
  themeCatalogGroupCard: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 7,
    padding: 9
  },
  themeCatalogGroupOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  customEligibilityCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12
  },
  customEligibilityWarning: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FBBF24"
  },
  previousConfigList: {
    gap: 8
  },
  previousConfigRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  previousConfigCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  previousConfigHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  previousConfigRating: {
    alignItems: "flex-end",
    gap: 2,
    minWidth: 48
  },
  previousConfigTrailing: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  previousConfigChevron: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 14
  },
  testPanel: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  optionButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "30%",
    flexGrow: 1,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  optionButtonActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB"
  },
  optionButtonText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  optionButtonTextActive: {
    color: "#1D4ED8"
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 8,
    flex: 1,
    height: 42,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800"
  },
  primarySmallButton: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  primarySmallButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800"
  },
  summaryPrimaryAction: {
    alignSelf: "stretch",
    flex: 0,
    minHeight: 42
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  secondaryButtonText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700"
  },
  destructiveButton: {
    alignItems: "center",
    backgroundColor: "#DC2626",
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  destructiveButtonText: {
    color: "#FFFFFF",
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
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  iconButtonText: {
    color: "#334155",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 22
  },
  disabledButton: {
    opacity: 0.36
  },
  summaryPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12
  },
  resultTopBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44
  },
  resultTopBarButton: {
    alignItems: "center",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 40
  },
  resultTopBarIconButton: {
    alignItems: "center",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 40
  },
  resultTopBarTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800"
  },
  resultHero: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  resultHeroClarified: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: 10
  },
  resultStatusBlock: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
    minWidth: 0
  },
  resultIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  resultIconWon: {
    backgroundColor: "#EFF6FF"
  },
  resultIconFailed: {
    backgroundColor: "#FEF2F2"
  },
  resultTrophyGlyph: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    position: "relative",
    width: 28
  },
  resultTrophyCup: {
    backgroundColor: "#2563EB",
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    height: 13,
    position: "relative",
    width: 17
  },
  resultTrophyHandle: {
    borderColor: "#2563EB",
    borderRadius: 999,
    borderWidth: 2,
    height: 10,
    position: "absolute",
    top: 2,
    width: 8
  },
  resultTrophyHandleLeft: {
    left: -7
  },
  resultTrophyHandleRight: {
    right: -7
  },
  resultTrophyStem: {
    backgroundColor: "#2563EB",
    height: 7,
    width: 4
  },
  resultTrophyBase: {
    backgroundColor: "#2563EB",
    borderRadius: 999,
    height: 3,
    width: 17
  },
  resultAlertGlyph: {
    alignItems: "center",
    gap: 3,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  resultAlertBar: {
    backgroundColor: "#DC2626",
    borderRadius: 999,
    height: 15,
    width: 4
  },
  resultAlertDot: {
    backgroundColor: "#DC2626",
    borderRadius: 999,
    height: 4,
    width: 4
  },
  resultTitleBlock: {
    flex: 1,
    gap: 2
  },
  resultScoreBlock: {
    alignItems: "flex-end",
    gap: 2
  },
  resultGoalScoreBlock: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  resultGoalLabel: {
    color: "#1D4ED8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.2
  },
  resultSolvedCount: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 32
  },
  resultSolvedTarget: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "700"
  },
  resultAccuracy: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700"
  },
  resultMetricGrid: {
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden"
  },
  resultMetric: {
    borderRightColor: "#E2E8F0",
    borderRightWidth: 1,
    flex: 1,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  resultMetricLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700"
  },
  resultMetricValue: {
    color: "#111827",
    fontFamily: "menlo",
    fontSize: 16,
    fontWeight: "800"
  },
  resultMetricSubtext: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700"
  },
  resultTrendCard: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: 4,
    paddingVertical: 2
  },
  resultTrendCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  resultTrendRange: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5
  },
  resultTrendDelta: {
    fontFamily: "menlo",
    fontSize: 12,
    fontWeight: "900"
  },
  resultTrendRangeText: {
    color: "#64748B",
    fontFamily: "menlo",
    fontSize: 10,
    fontWeight: "800"
  },
  resultTrendGlyph: {
    height: 20,
    position: "relative",
    width: 22
  },
  resultTrendGlyphDot: {
    backgroundColor: "#2563EB",
    borderRadius: 999,
    height: 5,
    position: "absolute",
    width: 5
  },
  resultTrendGlyphDotStart: {
    bottom: 3,
    left: 1
  },
  resultTrendGlyphDotMiddle: {
    left: 8,
    top: 8
  },
  resultTrendGlyphDotEnd: {
    right: 1,
    top: 2
  },
  resultTrendGlyphLine: {
    backgroundColor: "#2563EB",
    borderRadius: 999,
    height: 2,
    position: "absolute"
  },
  resultTrendGlyphLineFirst: {
    left: 4,
    top: 12,
    transform: [{ rotate: "-24deg" }],
    width: 9
  },
  resultTrendGlyphLineSecond: {
    right: 4,
    top: 7,
    transform: [{ rotate: "-31deg" }],
    width: 10
  },
  resultReviewRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  resultReviewCount: {
    fontSize: 18,
    fontWeight: "900"
  },
  resultReviewCopy: {
    flex: 1,
    minWidth: 0
  },
  resultReviewNote: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
    paddingHorizontal: 2
  },
  resultSummaryCountColumn: {
    alignItems: "center",
    justifyContent: "center",
    width: 38
  },
  resultUnclearRow: {
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 70,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  resultUnclearCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  resultUnclearNote: {
    color: "#92400E",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 14
  },
  resultUnclearCountBadge: {
    backgroundColor: "#FEF3C7",
    borderRadius: 999,
    height: 38,
  },
  resultUnclearCount: {
    color: "#B45309",
    fontSize: 18,
    fontWeight: "900"
  },
  summaryTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800"
  },
  summaryText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "600"
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8
  },
  errorPanel: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    padding: 12
  },
  errorText: {
    color: "#991B1B",
    fontSize: 14,
    fontWeight: "700"
  },
  positive: {
    color: "#15803D",
    fontWeight: "700"
  },
  listPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    gap: 8
  },
  panelTitle: {
    color: "#111827",
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
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 30,
    paddingHorizontal: 10
  },
  reviewContextPillDanger: {
    borderColor: "#FCA5A5"
  },
  reviewTimerPill: {
    justifyContent: "center",
    minHeight: 38,
    minWidth: 78
  },
  reviewTimerText: {
    color: "#111827",
    fontFamily: "menlo",
    fontSize: 21,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.2
  },
  reviewContextPillText: {
    color: "#334155",
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
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12
  },
  analysisError: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
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
  analysisIconButton: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  analysisPrimaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12
  },
  analysisPrimaryButtonText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800"
  },
  analysisEngineStatus: {
    color: "#64748B",
    fontFamily: "Menlo",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: "auto"
  },
  analysisLineRow: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 9,
    paddingVertical: 7
  },
  analysisEvalText: {
    color: "#334155",
    fontFamily: "Menlo",
    fontSize: 12,
    fontWeight: "800",
    minWidth: 44
  },
  analysisMoveText: {
    color: "#111827",
    fontFamily: "Menlo",
    fontSize: 13,
    fontWeight: "800",
    flexShrink: 1
  },
  analysisLineLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: "auto"
  },
  diagnosticHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  diagnosticHeaderCopy: {
    flex: 1
  },
  diagnosticFen: {
    color: "#475569",
    fontFamily: "Menlo",
    fontSize: 11,
    lineHeight: 16
  },
  diagnosticPvPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 10
  },
  diagnosticPvText: {
    color: "#334155",
    fontFamily: "Menlo",
    fontSize: 11,
    lineHeight: 16
  },
  diagnosticLogPanel: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 10
  },
  diagnosticLogText: {
    color: "#334155",
    fontFamily: "Menlo",
    fontSize: 10,
    lineHeight: 14
  },
  listText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "600"
  },
  helperText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600"
  },
  filterButton: {
    alignItems: "center",
    borderColor: "#2563EB",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  filterButtonActive: {
    backgroundColor: "#2563EB"
  },
  filterButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  filterButtonText: {
    color: "#2563EB",
    fontSize: 12,
    fontWeight: "800"
  },
  filterButtonTextActive: {
    color: "#FFFFFF"
  },
  historyPanel: {
    gap: 10
  },
  historyPanelWide: {
    alignSelf: "center",
    maxWidth: 980,
    width: "100%"
  },
  historyTopFilterStack: {
    gap: 8
  },
  historyAttentionFilter: {
    backgroundColor: "#E2E8F0",
    borderColor: "#CBD5E1",
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    padding: 2
  },
  historyAttentionOption: {
    alignItems: "center",
    borderRadius: 7,
    flex: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 10
  },
  historyAttentionOptionActive: {
    backgroundColor: "#FFFFFF"
  },
  historyAttentionOptionText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "800"
  },
  historyAttentionOptionTextActive: {
    color: "#1D4ED8"
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
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    minHeight: 34,
    paddingHorizontal: 8
  },
  historyQuickChipActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB"
  },
  historyQuickChipCompact: {
    paddingHorizontal: 6
  },
  historyQuickChipCheck: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900"
  },
  historyQuickChipText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  historyQuickChipTextActive: {
    color: "#FFFFFF"
  },
  historyQuickFacetGroup: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 4
  },
  historyQuickFacetDivider: {
    backgroundColor: "#CBD5E1",
    height: 20,
    marginHorizontal: 1,
    width: StyleSheet.hairlineWidth
  },
  historyQuickFacetLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800"
  },
  historyToggleTrack: {
    backgroundColor: "#CBD5E1",
    borderRadius: 12,
    height: 24,
    padding: 2,
    width: 42
  },
  historyToggleTrackActive: {
    backgroundColor: "#2563EB"
  },
  historyToggleThumb: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    height: 20,
    width: 20
  },
  historyToggleThumbActive: {
    transform: [{ translateX: 18 }]
  },
  historyAdvancedFilters: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 10
  },
  historyFilterGroup: {
    gap: 4
  },
  historyFilterGroupLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 2
  },
  historyThemeFilterSection: {
    gap: 8
  },
  historyThemeCatalogContent: {
    gap: 8
  },
  historyThemeDisclosure: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44
  },
  historyThemeDisclosureCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8
  },
  historyThemeSummary: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2
  },
  historyThemeAllRow: {
    alignItems: "flex-start"
  },
  historyPerformanceCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  historyPerformanceHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  historyMetricSummary: {
    alignItems: "flex-end",
    minWidth: 74
  },
  historyAccuracy: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "900"
  },
  historyChart: {
    alignItems: "flex-end",
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    height: 76,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  historyChartEmpty: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 58,
    padding: 10
  },
  historyChartColumn: {
    flex: 1,
    justifyContent: "flex-end"
  },
  historyChartBar: {
    backgroundColor: "#2563EB",
    borderRadius: 4,
    minHeight: 4
  },
  historyLineChart: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    height: 76,
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingVertical: 8,
    position: "relative"
  },
  historyLineGrid: {
    backgroundColor: "#E2E8F0",
    height: StyleSheet.hairlineWidth,
    left: 12,
    opacity: 0.75,
    position: "absolute",
    right: 12,
    top: 16
  },
  historyLineGridMiddle: {
    top: 38
  },
  historyLineGridBottom: {
    top: 60
  },
  historyLineLayer: {
    bottom: 8,
    left: 18,
    position: "absolute",
    right: 18,
    top: 8
  },
  historyLineSegment: {
    backgroundColor: "#2563EB",
    borderRadius: 999,
    height: 2,
    opacity: 0.82,
    position: "absolute"
  },
  historyLineSelectionGuide: {
    backgroundColor: "#93C5FD",
    bottom: 0,
    position: "absolute",
    top: 0,
    width: StyleSheet.hairlineWidth
  },
  historyLineSelectionPoint: {
    backgroundColor: "#2563EB",
    borderColor: "#FFFFFF",
    borderRadius: 999,
    borderWidth: 2,
    height: 10,
    marginLeft: -5,
    marginTop: -5,
    position: "absolute",
    width: 10
  },
  historyLineTooltip: {
    backgroundColor: "#0F172A",
    borderRadius: 7,
    minHeight: HISTORY_LINE_TOOLTIP_HEIGHT,
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: "absolute",
    width: HISTORY_LINE_TOOLTIP_WIDTH
  },
  historyLineTooltipRating: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800"
  },
  historyLineTooltipDate: {
    color: "#CBD5E1",
    fontSize: 9,
    fontWeight: "600"
  },
  historyChipContent: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 2
  },
  historyActiveFilterChip: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  historyActiveFilterText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800"
  },
  historyCompactFilterSummary: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: 20,
    paddingRight: 2
  },
  historyCompactFilterLabel: {
    justifyContent: "center"
  },
  historyCompactFilterSeparator: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700"
  },
  historyCompactFilterText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700"
  },
  historyAttemptCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
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
    backgroundColor: "#DC2626"
  },
  historyResultCorrect: {
    backgroundColor: "#16A34A"
  },
  historyResultIncomplete: {
    backgroundColor: "#64748B"
  },
  historyResultUnknown: {
    backgroundColor: "#64748B"
  },
  historyResultUnknownText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800"
  },
  resultBadgeGlyphCanvas: {
    alignItems: "center",
    height: 18,
    justifyContent: "center",
    position: "relative",
    width: 18
  },
  resultBadgeGlyphLine: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    position: "absolute"
  },
  resultBadgeCheckShort: {
    height: 2,
    left: 4,
    top: 9,
    transform: [{ rotate: "45deg" }],
    width: 5
  },
  resultBadgeCheckLong: {
    height: 2,
    right: 3,
    top: 8,
    transform: [{ rotate: "-48deg" }],
    width: 10
  },
  resultBadgeIncompleteDash: {
    height: 2,
    width: 11
  },
  resultBadgeCrossForward: {
    height: 2,
    transform: [{ rotate: "45deg" }],
    width: 11
  },
  resultBadgeCrossBackward: {
    height: 2,
    transform: [{ rotate: "-45deg" }],
    width: 11
  },
  historyAttemptCopy: {
    flex: 1,
    gap: 3
  },
  themeTagRailViewport: {
    flexShrink: 1,
    maxWidth: "100%",
    minWidth: 0
  },
  themeTagRailCenteredViewport: {
    width: "100%"
  },
  themeTagRailCenteredContent: {
    flexGrow: 1,
    justifyContent: "center"
  },
  historyThemeRail: {
    flexDirection: "row",
    gap: 4,
    paddingRight: 10,
    paddingTop: 2
  },
  historyThemeRailCentered: {
    paddingLeft: 10,
    paddingRight: 10
  },
  historyThemeChip: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3
  },
  historyThemeChipText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800"
  },
  historyUnclearBadge: {
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderColor: "#F59E0B",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4
  },
  historyUnclearBadgeText: {
    color: "#B45309",
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
    backgroundColor: "#FFFBEB",
    borderColor: "#F59E0B"
  },
  historyTimingBadgeText: {
    fontSize: 10,
    fontWeight: "900"
  },
  historyTimingBadgeTextSlow: {
    color: "#B45309"
  },
  historyAttemptUnclearBanner: {
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderColor: "#F59E0B",
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
    color: "#334155",
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
    color: "#B45309",
    fontSize: 12,
    fontWeight: "900"
  },
  reviewScheduleControl: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
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
    color: "#475569",
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
    color: "#2563EB",
    fontSize: 12,
    fontWeight: "900"
  },
  reviewScheduleRemoveText: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "900"
  },
  reviewScheduleConfirmation: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    gap: 12,
    maxWidth: 440,
    padding: 18,
    width: "100%"
  },
  historyAttemptHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
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
  historyRowTitle: {
    color: "#1E293B",
    fontSize: 13,
    fontWeight: "800"
  },
  historyPageRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  settingsPanel: {
    gap: 12
  },
  settingsPanelWide: {
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    maxWidth: 980,
    width: "100%"
  },
  settingsSection: {
    gap: 8
  },
  settingsSectionWide: {
    flexBasis: "48%",
    flexGrow: 1,
    minWidth: 300
  },
  settingsSectionCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden"
  },
  sprintGuideReadyStatus: {
    backgroundColor: "#ECFDF5",
    borderTopColor: "#A7F3D0",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  sprintGuideReadyStatusText: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "800"
  },
  settingsGuidanceResetCard: {
    gap: 12,
    padding: 12
  },
  settingsGuidanceResetButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 16
  },
  settingsGuidanceResetButtonComplete: {
    backgroundColor: "#ECFDF5",
    borderColor: "#6EE7B7"
  },
  settingsGuidanceResetButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800"
  },
  settingsGuidanceResetButtonTextComplete: {
    color: "#047857"
  },
  feedbackSupportSectionCard: {
    borderColor: "#BFDBFE",
    borderRadius: 14
  },
  feedbackSupportCard: {
    gap: 14,
    padding: 16
  },
  feedbackSupportHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  feedbackSupportIcon: {
    alignItems: "center",
    backgroundColor: "#DBEAFE",
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  feedbackSupportIconText: {
    color: "#1D4ED8",
    fontSize: 22,
    fontWeight: "900"
  },
  feedbackSupportCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  feedbackSupportTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900"
  },
  feedbackSupportDetail: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18
  },
  feedbackPrivacyStrip: {
    backgroundColor: "#F8FAFC",
    borderRadius: 9,
    gap: 2,
    padding: 11
  },
  feedbackPrivacyTitle: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900"
  },
  feedbackPrivacyCopy: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16
  },
  feedbackSupportButton: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 9,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16
  },
  feedbackSupportButtonPressed: {
    backgroundColor: "#1D4ED8"
  },
  feedbackSupportButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900"
  },
  feedbackSupportButtonArrow: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    marginLeft: 8
  },
  feedbackSubmissionCopy: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center"
  },
  feedbackHandoffConfirmation: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    gap: 14,
    maxWidth: 430,
    padding: 20,
    width: "100%"
  },
  feedbackExternalBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#DBEAFE",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  feedbackExternalBadgeText: {
    color: "#1D4ED8",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8
  },
  feedbackHandoffTitle: {
    color: "#0F172A",
    fontSize: 22,
    fontWeight: "900"
  },
  feedbackHandoffCopy: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20
  },
  feedbackHandoffPrivacyCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 9,
    gap: 3,
    padding: 12
  },
  feedbackHandoffPrivacyTitle: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900"
  },
  feedbackHandoffPrivacyCopy: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16
  },
  feedbackHandoffCancelButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 15
  },
  feedbackHandoffCancelButtonText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800"
  },
  feedbackHandoffContinueButton: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 16
  },
  feedbackHandoffContinueButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center"
  },
  settingsRow: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  settingsRowCopy: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  settingsRowMeta: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 4,
    justifyContent: "flex-end",
    maxWidth: "36%"
  },
  settingsRowValue: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "800",
    flexShrink: 1,
    textAlign: "right"
  },
  settingsLinkText: {
    color: "#2563EB",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  settingsInlineControls: {
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  settingsPreferenceButton: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  settingsPreferenceButtonActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB"
  },
  settingsPreferenceButtonText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  settingsPreferenceButtonTextActive: {
    color: "#1D4ED8"
  },
  settingsActionRow: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  settingsActionButtonRow: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  settingsActionButtonDetail: {
    flex: 1,
    minWidth: 200
  },
  settingsActionButton: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginLeft: "auto",
    minHeight: 40,
    minWidth: 128,
    paddingHorizontal: 16
  },
  settingsActionButtonDisabled: {
    backgroundColor: "#64748B"
  },
  settingsActionButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800"
  },
  settingsDestructiveText: {
    color: "#DC2626"
  },
  reviewReminderPrompt: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#BFDBFE",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
    padding: 12
  },
  reviewReminderPromptCopy: {
    flex: 1,
    gap: 2,
    minWidth: 180
  },
  confirmationActionRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end"
  },
  advancedRatingsPanel: {
    backgroundColor: "#F8FAFC",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  advancedRatingRows: {
    gap: 6
  },
  advancedRatingRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  advancedRatingCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  advancedRatingControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  settingsStatusText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 2
  },
  packsPanel: {
    gap: 12
  },
  packsIconButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  packRow: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 78,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  packRowCopy: {
    flex: 1,
    gap: 3
  },
  packTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  packCoverageCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  packCoverageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  packCoverageMetric: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    gap: 2,
    minHeight: 50,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  packCoverageLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "800"
  },
  packCoverageHiddenText: FABRIC_SAFE_HIDDEN_TEXT_STYLE,
  packRowMetaText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15
  },
  packCoverageMetricValue: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900"
  },
  packActiveMark: {
    alignItems: "center",
    backgroundColor: "#16A34A",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    position: "relative",
    width: 28
  },
  packActiveGlyphLine: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    height: 2.5,
    position: "absolute"
  },
  packActiveGlyphShort: {
    left: 7,
    top: 15,
    transform: [{ rotate: "45deg" }],
    width: 7
  },
  packActiveGlyphLong: {
    right: 6,
    top: 13,
    transform: [{ rotate: "-48deg" }],
    width: 13
  },
  packActionColumn: {
    alignItems: "flex-end",
    gap: 8,
    justifyContent: "center"
  },
  packDetailButton: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  packInfoCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  packInfoRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  packLicenseText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17
  },
  plusGlyph: {
    alignItems: "center",
    height: 18,
    justifyContent: "center",
    width: 18
  },
  plusGlyphLine: {
    backgroundColor: "#2563EB",
    borderRadius: 999,
    position: "absolute"
  },
  plusGlyphHorizontal: {
    height: 2.5,
    width: 15
  },
  plusGlyphVertical: {
    height: 15,
    width: 2.5
  },
  minusGlyph: {
    alignItems: "center",
    height: 18,
    justifyContent: "center",
    width: 18
  },
  minusGlyphLine: {
    backgroundColor: "#111827",
    borderRadius: 999,
    height: 2.5,
    width: 15
  },
  closeGlyph: {
    alignItems: "center",
    height: 18,
    justifyContent: "center",
    width: 18
  },
  closeGlyphLine: {
    backgroundColor: "#111827",
    borderRadius: 999,
    height: 2.25,
    position: "absolute",
    width: 16
  },
  closeGlyphForward: {
    transform: [{ rotate: "45deg" }]
  },
  closeGlyphBackward: {
    transform: [{ rotate: "-45deg" }]
  },
  moreGlyph: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
    justifyContent: "center",
    width: 18
  },
  moreGlyphDot: {
    backgroundColor: "#111827",
    borderRadius: 999,
    height: 4,
    width: 4
  },
  pauseGlyph: {
    flexDirection: "row",
    gap: 4
  },
  pauseGlyphBar: {
    backgroundColor: "#111827",
    borderRadius: 999,
    height: 16,
    width: 4
  },
  playGlyph: {
    borderBottomColor: "transparent",
    borderBottomWidth: 8,
    borderLeftColor: "#111827",
    borderLeftWidth: 13,
    borderTopColor: "transparent",
    borderTopWidth: 8,
    height: 0,
    marginLeft: 3,
    width: 0
  },
  chevronGlyphCanvas: {
    alignItems: "center",
    height: 18,
    justifyContent: "center",
    width: 18
  },
  disclosureChevronMotion: {
    alignItems: "center",
    height: 18,
    justifyContent: "center",
    width: 18
  },
  collapsibleMotionClip: {
    overflow: "hidden",
    width: "100%"
  },
  collapsibleMotionContent: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  chevronGlyph: {
    borderColor: "#334155",
    height: 9,
    width: 9
  },
  chevronGlyphLeft: {
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    transform: [{ rotate: "45deg" }]
  },
  chevronGlyphRight: {
    borderRightWidth: 2.5,
    borderTopWidth: 2.5,
    transform: [{ rotate: "45deg" }]
  },
  chevronGlyphUp: {
    borderLeftWidth: 2.5,
    borderTopWidth: 2.5,
    transform: [{ rotate: "45deg" }]
  },
  chevronGlyphDown: {
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
    transform: [{ rotate: "45deg" }]
  },
  flipGlyph: {
    height: 18,
    position: "relative",
    width: 18
  },
  flipGlyphTrackTop: {
    backgroundColor: "#334155",
    borderRadius: 999,
    height: 2,
    left: 3,
    position: "absolute",
    top: 5,
    width: 11
  },
  flipGlyphTrackBottom: {
    backgroundColor: "#334155",
    borderRadius: 999,
    height: 2,
    left: 4,
    position: "absolute",
    top: 11,
    width: 11
  },
  flipGlyphHeadRight: {
    borderBottomColor: "transparent",
    borderBottomWidth: 4,
    borderLeftColor: "#334155",
    borderLeftWidth: 5,
    borderTopColor: "transparent",
    borderTopWidth: 4,
    height: 0,
    position: "absolute",
    right: 1,
    top: 2,
    width: 0
  },
  flipGlyphHeadLeft: {
    borderBottomColor: "transparent",
    borderBottomWidth: 4,
    borderRightColor: "#334155",
    borderRightWidth: 5,
    borderTopColor: "transparent",
    borderTopWidth: 4,
    height: 0,
    left: 1,
    position: "absolute",
    top: 8,
    width: 0
  },
  searchGlyph: {
    height: 18,
    position: "relative",
    width: 18
  },
  searchGlyphLens: {
    borderColor: "#0F172A",
    borderRadius: 999,
    borderWidth: 2,
    height: 10,
    left: 3,
    position: "absolute",
    top: 3,
    width: 10
  },
  searchGlyphHandle: {
    backgroundColor: "#0F172A",
    borderRadius: 999,
    height: 2.5,
    left: 11,
    position: "absolute",
    top: 12,
    transform: [{ rotate: "45deg" }],
    width: 6
  },
  switchButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 52
  },
  switchButtonActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB"
  },
  switchGlyph: {
    height: 24,
    justifyContent: "center",
    position: "relative",
    width: 46
  },
  switchGlyphKnob: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 999,
    borderWidth: 1,
    height: 22,
    left: 1,
    position: "absolute",
    width: 22
  },
  switchGlyphKnobEnabled: {
    borderColor: "#FFFFFF",
    left: 23
  },
  arrowLayer: {
    position: "absolute",
    top: 0,
    left: 0
  },
  lastMoveSquare: {
    backgroundColor: "rgba(37, 99, 235, 0.3)",
    position: "absolute"
  },
  feedbackMoveSquare: {
    position: "absolute"
  },
  debugLog: {
    color: "#334155",
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
});
