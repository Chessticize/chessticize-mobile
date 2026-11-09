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
import type {
  LayoutChangeEvent
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import type { MoveResult } from "react-native-chessboard";
import Chessboard, { type ChessboardRef } from "react-native-chessboard";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  LegacyScrollView,
  type GestureType
} from "react-native-gesture-handler";
import {
  analyzeFenWithUciEngine,
  ALL_THEME_SELECTION,
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
  formatLocalCalendarDateLabel,
  formatReviewDay,
  formatWhitePerspectiveScore,
  historyAttemptReplayAvailability,
  historyAttemptSpeedSeconds,
  isAttemptMarkedUnclear,
  selectMistakeReplayItems,
  isUnclearAttemptEligible,
  isReviewOverdue,
  markSprintGuideSeen,
  markSprintSessionGuidePlanSeen,
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
  sprintHasRunDeadline,
  sprintSessionGuidePlanFor,
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
  SprintSessionGuidePlan,
  SprintSessionGuideStep,
  TacticalProfileTaskFamily,
  ThemeChoiceIntent,
  SprintState,
  UciEngineTransport
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
  syncPracticeProgressV2,
  type ProgressV2SyncResult
} from "../../../../packages/storage/src/progress-sync-v2.ts";
import type { PracticeProgressSummary } from "../../../../packages/storage/src/rating-history.ts";
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
import { WHATS_NEW_SETTINGS_LABEL } from "../whatsNew/whatsNewContent.ts";
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
  PersonalBestProgressBanner,
  PersonalBestResult,
  type PersonalBestChallengeDesignPreview,
  type PersonalBestChallengeSelection,
  type PersonalBestPausedRunPresentation
} from "./PersonalBestChallengeDesign.tsx";
import { SprintResultScreen } from "./SprintResultScreen.tsx";
import { sprintResultDataFromSession } from "./sprintResultPresentation.ts";
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
import { makeStyles, useAppearance, useTheme, type AppearancePreference, type Theme } from "../theme/index.ts";
import { typography as baseTypography } from "../theme/scales.ts";
import { AppText, Badge, Button, Icon, IconTile, ListRow, Section, SegmentedControl, useListRowStyle, type IconName } from "./ui/index.tsx";

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

type PersonalBestGuideIntent = "first-entry" | "learn-hub";

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
const SIMULATED_HISTORY_SCENARIOS: ReadonlyArray<{ scenario: SimulatedHistoryScenarioId; label: string }> = [
  { scenario: "slow-fork-speed", label: "Slow fork" },
  { scenario: "weak-fork-solve", label: "Weak fork" },
  { scenario: "balanced", label: "Balanced" },
  { scenario: "recently-recommended", label: "Recent" }
];
const TEST_PUZZLE_SOURCES: ReadonlyArray<{ source: MobilePuzzleSource; label: string }> = [
  { source: "bundledCore", label: "Core Pack" },
  { source: "familiar15", label: "Familiar 15" }
];
// Space below the last tab content row, added to the tab chrome's bottom inset.
const CONTENT_BOTTOM_PADDING = 40;
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

  // Sprint Result (#609) replaces the Practice tab content as a full-screen
  // destination; the Survival result keeps its in-tab layout.
  const sprintResultVisible = tab === "practice"
    && state !== null
    && state.status !== "active"
    && state.status !== "paused"
    && feedbackSnapshot === null
    && !(
      (state.config.survival !== undefined
        || personalBestChallengeDesignPreview?.showActivePresentation === true)
      && personalBestPresentation?.result
    );

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
          {sprintResultVisible && state ? (
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
              adaptiveLayout.usesWideContent && !sessionLayoutUsesRail
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

                {isFinished && !isShowingFeedbackSnapshot ? (
                  isSurvivalState && personalBestPresentation?.result ? (
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
                      onDone={resetToIdle}
                      onReplayMistakes={sprintReplayItems.length > 0
                        ? () => showSessionReplay()
                        : undefined}
                      onTryAgain={() => {
                        resetToIdle();
                        startPersonalBestChallenge();
                      }}
                    />
                  ) : null
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

type PracticeModeSummary = {
  mode: SprintMode;
  config: SprintConfig;
  rating?: number;
};

// Close, centered title and the primary action, matching the other direction A
// sub-screens (#609). The side slots share one width so the title stays centered.
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
  const styles = useStyles();
  const appTheme = useTheme();
  return (
    <View style={styles.sprintScreenHeader} testID={headerTestID}>
      {onClose ? (
        <View style={styles.sprintHeaderSideSlot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeAccessibilityLabel}
            hitSlop={4}
            testID={closeTestID}
            style={({ pressed }) => [styles.sprintHeaderCloseButton, pressed ? styles.sprintHeaderCloseButtonPressed : null]}
            onPress={onClose}
          >
            <Icon color={appTheme.colors.accent.s600} name="close" size={20} weight="semibold" />
          </Pressable>
        </View>
      ) : null}
      <AppText
        accessibilityRole="header"
        style={[styles.sprintScreenTitle, !onClose ? styles.sprintScreenTitleLeading : null]}
        testID={titleTestID}
        variant="headline"
      >
        {title}
      </AppText>
      <View style={[styles.sprintHeaderSideSlot, styles.sprintHeaderSideSlotTrailing]}>
        <Button
          accessibilityLabel={startAccessibilityLabel}
          disabled={startDisabled}
          label={actionLabel}
          size="compact"
          testID={startTestID}
          onPress={onStart}
        />
      </View>
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
  onDismissSprintRulesGuide,
  onOpenPersonalBestHub,
  onOpenSprintRulesGuide,
  onSelectMode,
  onStartMode,
  onResumeSprint,
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
  onDismissSprintRulesGuide: () => void;
  onOpenPersonalBestHub: (run?: PersonalBestPausedRunPresentation) => void;
  onOpenSprintRulesGuide: () => void;
  onSelectMode: (next: SprintMode) => void;
  onStartMode: (next: SprintMode) => void;
  onResumeSprint: (sprint: SprintState) => void;
  nativeRunReorderScrollController: NativeRunReorderScrollController;
  runReorderDesignPreview?: Props["runReorderDesignPreview"];
  onRunReorderFeedbackPreview?: (feedback: RunReorderPickupFeedback) => void;
}): React.JSX.Element {
  const styles = useStyles();
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
        style={adaptiveLayout.usesHomeColumns ? styles.practiceHomeColumns : styles.practiceHomeStack}
        testID="practice-home-layout"
      >
        <View style={[
          styles.practiceHomePrimaryColumn,
          adaptiveLayout.usesHomeColumns
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
                nativeRunReorderScrollController={nativeRunReorderScrollController}
                runReorderDesignPreview={runReorderDesignPreview}
                onRunReorderFeedbackPreview={onRunReorderFeedbackPreview}
              />
            </>
          ) : (
            <>
              <HomeStartHeader
                headerTestID="practice-action-header"
                startAccessibilityLabel={`Start ${modeLabel(mode)} sprint`}
                startTestID="practice-start-button"
                title="Start a Sprint"
                titleTestID="practice-header-title"
                onStart={() => onStartMode(mode)}
              />
              <View style={styles.homeRowGroup}>
                {modes.map((item, index) => (
                  <PracticeModeCard
                    key={item.mode}
                    active={mode === item.mode}
                    item={item}
                    position={groupPosition(index, modes.length)}
                    onPress={() => onSelectMode(item.mode)}
                  />
                ))}
              </View>
            </>
          )}
        </View>

        <View style={[
          styles.practiceHomeSecondaryColumn,
          adaptiveLayout.usesHomeColumns
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

          {runManagement && personalBestChallenge ? (
            <PersonalBestHomeCard
              presentation={personalBestChallenge}
              onOpenHub={onOpenPersonalBestHub}
            />
          ) : null}

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
  nativeRunReorderScrollController,
  runReorderDesignPreview,
  onRunReorderFeedbackPreview
}: {
  presentation: PracticeRunManagementPresentation;
  sprintRulesGuide?: SprintRulesGuidePresentation;
  sprintRulesGuideVisible: boolean;
  onDismissSprintRulesGuide: () => void;
  onOpenSprintRulesGuide: () => void;
  nativeRunReorderScrollController: NativeRunReorderScrollController;
  runReorderDesignPreview?: Props["runReorderDesignPreview"];
  onRunReorderFeedbackPreview?: (feedback: RunReorderPickupFeedback) => void;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
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
    // Native drag movement is evaluated against one geometry snapshot. React
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
    onRunReorderFeedbackPreview?.({ haptic: "medium" });
  };
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
    <View style={styles.homeRunPanel} testID="practice-run-management">
      <HomeStartHeader
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

      <AppText style={styles.homeHelperText} tone="secondary" variant="subheadline">
        {presentation.homeEditing
          ? Platform.OS === "web"
            ? "Drag a card to reorder, or use the arrow buttons."
            : "Touch and hold a card to drag, or use the arrow buttons."
          : "Choose a run, then start when you are ready."}
      </AppText>

      <View
        style={styles.runManagementToolbar}
        testID="practice-run-home-utilities"
      >
        {sprintRulesGuide && !presentation.homeEditing && !sprintRulesGuideVisible ? (
          <Button
            accessibilityLabel="How Sprint works"
            icon="help"
            label="How Sprint works"
            size="compact"
            testID="practice-sprint-rules-open"
            variant="plain"
            onPress={onOpenSprintRulesGuide}
          />
        ) : null}
        <View style={styles.runManagementToolbarActions}>
          {!presentation.homeEditing ? (
            <Button
              accessibilityLabel="Edit runs"
              label="Edit"
              size="compact"
              testID="practice-run-home-edit"
              variant="plain"
              onPress={() => presentation.onIntent({ type: "toggle-home-edit" })}
            />
          ) : null}
          <Button
            accessibilityLabel="Add a run"
            icon="add"
            label="Add Run"
            size="compact"
            testID="practice-add-run"
            variant="plain"
            onPress={() => presentation.onIntent({ type: "add-run" })}
          />
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
        <Section testID="practice-runs-empty">
          <AppText variant="headline">No runs on Home</AppText>
          <AppText tone="secondary" variant="subheadline">
            Add a new run or restore one below. Saved ratings and history are still available.
          </AppText>
          <Button
            accessibilityLabel="Add a new run"
            icon="add"
            label="Add a Run"
            testID="practice-empty-add-run"
            onPress={() => presentation.onIntent({ type: "add-run" })}
          />
        </Section>
      ) : (
        <View
          ref={(element) => {
            webRunListElementRef.current = element as unknown as WebRunElement | null;
            nativeRunListElementRef.current = element as unknown as NativeRunReorderMeasureElement | null;
          }}
          style={[styles.homeRowGroup, { position: "relative" }]}
          testID="practice-run-list"
        >
          {presentation.runs.map((run, index) => (
            <React.Fragment key={run.id}>
              <PracticeRunCard
                position={groupPosition(index, presentation.runs.length)}
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
                backgroundColor: appTheme.colors.accent.dropZone,
                border: `2px dashed ${appTheme.colors.accent.s600}`,
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
        <Section
          footer="Restoring a run keeps its existing rating and history."
          header="Restore to Home"
          rows
          testID="practice-run-restore-section"
        >
          {presentation.hiddenRuns.map((run) => (
            <ListRow
              key={run.id}
              icon={runIconName(run)}
              subtitle={`Rating ${run.elo}`}
              title={run.name}
              trailing={(
                <Button
                  accessibilityLabel={`Restore ${run.name} to Home`}
                  label="Restore"
                  size="compact"
                  testID={`practice-run-restore-${safeTestId(run.id)}`}
                  variant="secondary"
                  onPress={() => presentation.onIntent({ type: "restore-run", runId: run.id })}
                />
              )}
            />
          ))}
        </Section>
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
  const styles = useStyles();
  const mistakeLimitDetail = `The ${ordinalWord(presentation.maxMistakes)} mistake ends the Sprint.`;
  // One badge width for every rule so the descriptions share a column. The
  // width follows the text size; when it would take more than a third of the
  // card (narrow screens at accessibility sizes), badges stack above their copy.
  const { fontScale } = useWindowDimensions();
  const [listWidth, setListWidth] = useState(0);
  const badgeMinWidth = Math.ceil(SPRINT_RULE_BADGE_MIN_WIDTH * Math.max(1, fontScale));
  const stacked = listWidth > 0 && badgeMinWidth > listWidth / 3;
  const ruleLayout = { badgeMinWidth, stacked };

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
          <Text numberOfLines={1} style={styles.sprintRulesDismissText}>Got it</Text>
        </Pressable>
      </View>

      <View
        style={styles.sprintRulesList}
        testID="practice-sprint-rules-list"
        onLayout={(event) => setListWidth(event.nativeEvent.layout.width)}
      >
        <SprintRuleRow
          layout={ruleLayout}
          badge={presentation.durationLabel}
          detail="Finish the goal before the Sprint clock reaches zero. At zero, the active puzzle is saved as Incomplete, not as a mistake, and needs attention. If it is Slow, it is also marked Unclear."
          label="Time limit"
        />
        <SprintRuleRow
          layout={ruleLayout}
          badge={String(presentation.maxMistakes)}
          detail={mistakeLimitDetail}
          label="Mistake limit"
          tone="danger"
        />
        <SprintRuleRow
          layout={ruleLayout}
          badge="SLOW"
          detail="The puzzle timer turns amber when you are taking too long. If you solve after that, it is marked Unclear for another look, not as a mistake."
          label="Slow warning"
          tone="warning"
        />
        <SprintRuleRow
          layout={ruleLayout}
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

const SPRINT_RULE_BADGE_MIN_WIDTH = 72;

function SprintRuleRow({
  badge,
  detail,
  label,
  layout,
  tone = "default"
}: {
  badge: string;
  detail: string;
  label: string;
  layout: { badgeMinWidth: number; stacked: boolean };
  tone?: "default" | "danger" | "warning";
}): React.JSX.Element {
  const styles = useStyles();
  const ruleTestId = safeTestId(label);

  return (
    <View
      style={[styles.sprintRuleRow, layout.stacked ? styles.sprintRuleRowStacked : null]}
      testID={`practice-sprint-rule-${ruleTestId}`}
    >
      <View style={[
        styles.sprintRuleBadge,
        layout.stacked ? null : { minWidth: layout.badgeMinWidth },
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

function PracticeRunCard({
  active,
  position,
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
  position: GroupPosition;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
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
        styles.homeRow,
        homeRowPositionStyle(styles, dragging ? "only" : position),
        active && !editing ? styles.homeRowSelected : null,
        editing ? styles.homeRowEditing : null,
        dragging ? styles.homeRowDragging : null
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
      {dragging ? null : <HomeRowSeparator position={position} />}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active && !editing }}
        accessibilityLabel={editing
          ? directRunEditing ? `Edit ${run.name}` : `Edit ${run.name} rating`
          : `Select ${run.name}, rating ${run.elo}, ${details}`}
        style={styles.homeRowSelectArea}
        testID={`practice-run-select-${safeTestId(run.id)}`}
        onPress={() => presentationRunPress(editing, run.id, onIntent)}
      >
        <View testID={`practice-run-${safeTestId(run.id)}-icon`}>
          <IconTile name={runIconName(run)} />
        </View>
        <View style={styles.homeRowCopy}>
          <AppText
            ellipsizeMode="tail"
            numberOfLines={1}
            testID={`practice-run-name-${safeTestId(run.id)}`}
            variant="headline"
          >
            {run.name}
          </AppText>
          <AppText ellipsizeMode="tail" numberOfLines={2} tone="secondary" variant="subheadline">{details}</AppText>
        </View>
      </Pressable>
      <View style={[styles.homeRowMeta, editing ? styles.homeRowEditingMeta : null]}>
        <AppText
          numberOfLines={1}
          style={styles.homeRowRating}
          testID={run.kind === "standard"
            ? "practice-mode-standard-rating"
            : run.kind === "arrow_duel"
              ? "practice-mode-arrow-duel-rating"
              : undefined}
          tone="secondary"
          variant="numeralRow"
        >
          {run.elo}
        </AppText>
        {editing ? (
          <View style={styles.runEditActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move ${run.name} up`}
              accessibilityState={{ disabled: !canMoveUp }}
              disabled={!canMoveUp}
              style={[styles.homeRowIconButton, !canMoveUp ? styles.homeRowIconButtonDisabled : null]}
              testID={`practice-run-move-up-${safeTestId(run.id)}`}
              onPress={() => onKeyboardReorder(run.id, "up")}
            >
              <Icon color={appTheme.colors.accent.s600} name="chevronUp" size={18} weight="semibold" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move ${run.name} down`}
              accessibilityState={{ disabled: !canMoveDown }}
              disabled={!canMoveDown}
              style={[styles.homeRowIconButton, !canMoveDown ? styles.homeRowIconButtonDisabled : null]}
              testID={`practice-run-move-down-${safeTestId(run.id)}`}
              onPress={() => onKeyboardReorder(run.id, "down")}
            >
              <Icon color={appTheme.colors.accent.s600} name="chevronDown" size={18} weight="semibold" />
            </Pressable>
            <Button
              accessibilityLabel={directRunEditing ? `Edit ${run.name}` : `Edit ${run.name} rating`}
              label={directRunEditing ? "Edit" : "Edit rating"}
              size="compact"
              testID={`practice-run-edit-${safeTestId(run.id)}`}
              variant="secondary"
              onPress={() => onIntent({ type: "edit-run", runId: run.id })}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${run.name} from Home`}
              style={[styles.homeRowIconButton, styles.homeRowRemoveButton]}
              testID={`practice-run-remove-${safeTestId(run.id)}`}
              onPress={() => onIntent({ type: "remove-run", runId: run.id })}
            >
              <Icon color={appTheme.colors.danger.s600} name="remove" size={18} weight="semibold" />
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
  scrollGestureRef: React.RefObject<GestureType | undefined>;
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

const NATIVE_RUN_DRAG_HOLD_MS = 180;

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
  const styles = useStyles();
  const appTheme = useTheme();
  const nativeDragOffset = useRef(new Animated.Value(0)).current;
  const nativeDropPreviewOffset = useRef(new Animated.Value(dropPreviewOffsetY)).current;
  const nativeDragActiveRef = useRef(false);
  const nativeGestureEndedRef = useRef(false);
  const nativeDragCompensationRef = useRef(0);
  const nativeDragDyRef = useRef(0);
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
  const stopNativeAutoScroll = useCallback((): void => {
    if (nativeAutoScrollTimerRef.current) {
      clearInterval(nativeAutoScrollTimerRef.current);
      nativeAutoScrollTimerRef.current = null;
    }
    nativeAutoScrollSpeedRef.current = 0;
  }, []);
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
    disarmWebDrag();
    stopNativeAutoScroll();
    stopWebAutoScroll();
  }, [disarmWebDrag, stopNativeAutoScroll, stopWebAutoScroll]);
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
  const settleNativeDragOffset = useCallback((): void => {
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
  }, [nativeDragOffset]);
  const cancelNativeDrag = useCallback((): void => {
    stopNativeAutoScroll();
    if (nativeDragActiveRef.current) {
      nativeDragActiveRef.current = false;
      nativeDragHandlersRef.current.onDragEnd();
    }
    settleNativeDragOffset();
  }, [settleNativeDragOffset, stopNativeAutoScroll]);
  const nativeDragGesture = useMemo(() => Gesture.Pan()
    .enabled(draggable)
    .activateAfterLongPress(NATIVE_RUN_DRAG_HOLD_MS)
    .minDistance(6)
    .shouldCancelWhenOutside(false)
    .blocksExternalGesture(nativeRunReorderScrollController.scrollGestureRef)
    .runOnJS(true)
    .onStart((event) => {
      const handlers = nativeDragHandlersRef.current;
      nativeGestureEndedRef.current = false;
      nativeDragActiveRef.current = true;
      nativeDragCompensationRef.current = 0;
      nativeDragDyRef.current = 0;
      nativeDragOffset.stopAnimation();
      nativeRunReorderScrollController.refreshBounds();
      handlers.onDragStart(handlers.runId);
      applyNativeDragPosition(event.translationY);
      refreshNativeAutoScroll(event.absoluteY);
    })
    .onUpdate((event) => {
      applyNativeDragPosition(event.translationY);
      refreshNativeAutoScroll(event.absoluteY);
    })
    .onEnd((_event, success) => {
      nativeGestureEndedRef.current = true;
      if (!success) {
        cancelNativeDrag();
        return;
      }
      stopNativeAutoScroll();
      nativeDragActiveRef.current = false;
      const committed = nativeDragHandlersRef.current.onDrop();
      if (!committed) {
        settleNativeDragOffset();
      }
    })
    .onFinalize(() => {
      if (nativeGestureEndedRef.current) {
        nativeGestureEndedRef.current = false;
        return;
      }
      cancelNativeDrag();
    }), [
    applyNativeDragPosition,
    cancelNativeDrag,
    draggable,
    nativeDragOffset,
    nativeRunReorderScrollController,
    refreshNativeAutoScroll,
    settleNativeDragOffset,
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
            ? appTheme.elevation.web.raised
            : "none",
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
    <GestureDetector gesture={nativeDragGesture}>
      <Animated.View
        accessibilityHint={draggable ? "Touch and hold, then drag vertically to reorder this run. Arrow buttons are also available." : undefined}
        onLayout={handleNativeLayout}
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
    </GestureDetector>
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

function StartConflictPrompt({
  canDiscard,
  onCancel,
  onDiscard,
  onResume
}: {
  canDiscard: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onResume: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <SafeAreaModalBackdrop style={styles.accessibleMoveModalBackdrop}>
        <ScrollView
          accessibilityViewIsModal
          contentContainerStyle={styles.startConflictContent}
          style={[styles.feedbackHandoffConfirmation, styles.startConflictCard]}
          testID="practice-start-conflict"
        >
          <AppText variant="title">Unfinished Run</AppText>
          <AppText tone="secondary" variant="body">
            Resume it, or discard it to start a new Run.
          </AppText>
          <View style={styles.feedbackHandoffActions}>
            <Button
              accessibilityLabel="Resume the unfinished Run"
              label="Resume"
              stretch
              testID="practice-start-conflict-resume"
              onPress={onResume}
            />
            {canDiscard ? (
              <Button
                accessibilityLabel="Discard the unfinished Run and start a new Run"
                label="Discard and start"
                stretch
                testID="practice-start-conflict-discard"
                variant="destructive"
                onPress={onDiscard}
              />
            ) : null}
            <Button
              accessibilityLabel="Keep the unfinished Run and cancel"
              label="Cancel"
              stretch
              testID="practice-start-conflict-cancel"
              variant="secondary"
              onPress={onCancel}
            />
          </View>
        </ScrollView>
      </SafeAreaModalBackdrop>
    </Modal>
  );
}

function RunRemovalConfirmation({
  onIntent,
  run
}: {
  onIntent: PracticeRunManagementPresentation["onIntent"];
  run: PracticeRunPresentation | null;
}): React.JSX.Element | null {
  const styles = useStyles();
  if (!run) {
    return null;
  }
  return (
    <View style={styles.homeRemovalConfirmation} testID="practice-run-remove-confirmation">
      <View style={styles.homeRowCopy}>
        <AppText variant="headline">Remove {run.name} from Home?</AppText>
        <AppText tone="secondary" variant="subheadline">
          Its rating and history will be kept. You can restore this run later.
        </AppText>
      </View>
      <View style={styles.homeRemovalActions}>
        <Button
          accessibilityLabel="Cancel run removal"
          label="Cancel"
          size="compact"
          testID="practice-run-remove-cancel"
          variant="secondary"
          onPress={() => onIntent({ type: "dismiss-remove" })}
        />
        <Button
          accessibilityLabel={`Confirm removing ${run.name} from Home`}
          label="Remove"
          size="compact"
          testID="practice-run-remove-confirm"
          variant="destructive"
          onPress={() => onIntent({ type: "confirm-remove" })}
        />
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
  const styles = useStyles();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const editorLayout = useEditorRowLayout();
  const stackNameField = editorLayout.stacked;
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
  const eloRow = (
    <PracticeRunEloRow
      key="elo"
      directEntry={directRunEditing}
      error={presentation.eloError ?? null}
      inputValue={presentation.eloInput ?? String(draft.elo)}
      isCreate={isCreate}
      value={draft.elo}
      onChange={(elo) => presentation.onIntent({ type: "change-elo", elo })}
      onInputChange={(value) => presentation.onIntent({ type: "change-elo-input", value })}
      onInputStep={(direction) => presentation.onIntent({ type: "step-elo-input", direction })}
    />
  );
  // Section draws a full-bleed separator between each field row, so the rows
  // are collected flat rather than nested in fragments.
  const fieldRows: React.ReactNode[] = [];
  if (canEditName) {
    fieldRows.push(
      <View key="name" style={[rowStyle, styles.editorFieldStack]}>
        <View style={[styles.runNameRow, stackNameField ? styles.runNameRowStacked : null]} testID="practice-run-name-row">
          <View style={styles.runNameCopy}>
            <AppText variant="body">Name</AppText>
            <AppText tone="secondary" variant="footnote">Required · unique</AppText>
          </View>
          <TextInput
            keyboardAppearance={appTheme.name}
            accessibilityLabel="Run name"
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={PRACTICE_RUN_NAME_MAX_LENGTH}
            placeholder="e.g. Tactics Focus"
            placeholderTextColor={appTheme.colors.text.faint}
            returnKeyType="done"
            style={[
              styles.runNameInput,
              stackNameField ? styles.runNameInputStacked : null,
              presentation.nameError ? styles.editorInputError : null
            ]}
            submitBehavior="blurAndSubmit"
            testID="practice-run-name-input"
            value={draft.name}
            onChangeText={(name) => presentation.onIntent({ type: "change-name", name })}
          />
        </View>
        {presentation.nameError ? (
          <AppText
            accessibilityLiveRegion="polite"
            testID="practice-run-name-error"
            tone="negative"
            variant="footnote"
          >
            {presentation.nameError}
          </AppText>
        ) : null}
      </View>
    );
  } else if (isCreate) {
    fieldRows.push(
      <CustomValueRow
        key="fixed-name"
        detail="Built-in run names stay fixed"
        label="Name"
        testID="practice-run-fixed-name"
        value={draft.name}
      />
    );
  }
  if (isCreate) {
    if (isCustom) {
      fieldRows.push(
        <CustomModeChoiceRow
          key="mode"
          value={customMode}
          testID="practice-run-mode-row"
          onChange={(mode) => presentation.onIntent({ type: "change-mode", mode })}
        />
      );
      if (!themeCatalogPresentation) {
        fieldRows.push(
          <View key="theme-label" style={[rowStyle, editorLayout.row]}>
            <AppText style={editorLayout.copy} variant="body">Themes</AppText>
            <AppText style={styles.customConfigValue} tone="secondary" variant="footnote">Choose one or more</AppText>
          </View>
        );
      }
      fieldRows.push(
        <CustomThemeChoiceRow
          key="themes"
          showDisclosure
          selectedThemes={draft.themes}
          themeCatalogPresentation={themeCatalogPresentation}
          testID="practice-run-theme-row"
          onChange={(theme) => presentation.onIntent({ type: "toggle-theme", theme })}
        />,
        <CustomOptionRow
          key="duration"
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
        />,
        <CustomOptionRow
          key="per-puzzle"
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
      );
    } else {
      fieldRows.push(
        <CustomValueRow
          key="format"
          label="Format"
          testID="practice-run-fixed-format"
          value={draft.kind === "arrow_duel" ? "Arrow Duel" : "Standard puzzles"}
        />
      );
    }
    fieldRows.push(eloRow);
  } else {
    if (directRunEditing) {
      fieldRows.push(
        <CustomValueRow
          key="format"
          detail="Cannot be changed after creation"
          label="Format"
          testID="practice-run-fixed-format"
          value={draft.mode === "arrow_duel"
            ? "Arrow Duel"
            : draft.kind === "standard" ? "Standard puzzles" : "Regular puzzles"}
        />
      );
    }
    fieldRows.push(eloRow);
  }

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
          <AppText testID="practice-run-editor-run-name" variant="headline">
            {draft.name}
          </AppText>
        ) : null}
        <AppText tone="secondary" variant="subheadline">
          {isCreate
            ? "Saving adds this run to Home. It does not start a sprint."
            : directRunEditing
              ? "Change this Run's name, rating, and puzzle timing."
              : "Adjust the current rating. Run settings stay fixed."}
        </AppText>
      </View>

      {isCreate && presentation.canSave === false ? (
        <View accessibilityLiveRegion="polite" testID="practice-run-availability-error">
          <Section rows>
            <ListRow
              icon="warning"
              iconTone="warning"
              subtitle="Choose different themes or settings before adding this Run to Home."
              title="No matching local puzzles"
            />
          </Section>
        </View>
      ) : null}

      <Section
        header={!isCreate && directRunEditing ? "Run details" : undefined}
        headerTestID="practice-run-details-section"
        rows
        testID="practice-run-editor-fields"
      >
        {fieldRows}
      </Section>

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
        <Section header="Previous configs" rows testID="custom-previous-configs">
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
        </Section>
      ) : null}
    </View>
  );
}

// A grouped-row switch (51 x 31 pt track) with a 44 pt tall hit target.
function EditorSwitch({
  accessibilityLabel,
  enabled,
  testID,
  onPress
}: {
  accessibilityLabel: string;
  enabled: boolean;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      accessibilityValue={{ text: enabled ? "On" : "Off" }}
      style={styles.runTimingToggle}
      testID={testID}
      onPress={onPress}
    >
      <View style={[styles.historyToggleTrack, enabled ? styles.historyToggleTrackActive : null]}>
        <View style={[styles.historyToggleThumb, enabled ? styles.historyToggleThumbActive : null]} />
      </View>
    </Pressable>
  );
}

// One half of a stepper: a filled 36 x 32 pt button whose hit area reaches 44 pt.
function StepperButton({
  accessibilityLabel,
  direction,
  disabled,
  testID,
  onPress
}: {
  accessibilityLabel: string;
  direction: "decrease" | "increase";
  disabled: boolean;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={STEPPER_HIT_SLOP}
      style={({ pressed }) => [
        styles.customStepperButton,
        pressed && !disabled ? styles.customStepperButtonPressed : null,
        disabled ? styles.disabledButton : null
      ]}
      testID={testID}
      onPress={onPress}
    >
      <Icon
        color={appTheme.colors.text.primary}
        name={direction === "decrease" ? "remove" : "add"}
        size={17}
        testID={direction === "decrease" ? "minus-glyph" : "plus-glyph"}
        weight="semibold"
      />
    </Pressable>
  );
}

const STEPPER_HIT_SLOP = { bottom: 6, left: 4, right: 4, top: 6 };

// Short numeric fields grow with the text size up to 1.5x, then cap their
// text there, so four digits never clip inside a fixed-width field.
const NUMERIC_FIELD_MAX_TEXT_SCALE = 1.5;

// Above this text scale an editor row stacks: its label spans the row and the
// control (field, stepper or switch) sits below it, trailing.
const STACKED_EDITOR_TEXT_SCALE = 1.35;

// The user's text scale: the system font scale on a device, or the theme's
// scaled type roles in the Interaction Lab.
function useEditorTextScale(): number {
  const appTheme = useTheme();
  const { fontScale } = useWindowDimensions();
  const themeScale = appTheme.typography.body.fontSize / baseTypography.body.fontSize;
  return Math.max(1, fontScale, themeScale);
}

function useEditorRowLayout(): {
  controls: ViewStyle;
  copy: ViewStyle;
  line: ViewStyle;
  row: ViewStyle;
  stacked: boolean;
} {
  const styles = useStyles();
  const stacked = useEditorTextScale() >= STACKED_EDITOR_TEXT_SCALE;
  return stacked
    ? {
        controls: styles.editorStackedControls,
        copy: styles.editorStackedCopy,
        line: styles.editorStackedLine,
        row: styles.editorStackedLine,
        stacked
      }
    : {
        controls: styles.editorInlineControls,
        copy: styles.editorInlineCopy,
        line: styles.editorInlineLine,
        row: styles.editorInlineRow,
        stacked
      };
}

function useNumericFieldScale(): number {
  return Math.min(NUMERIC_FIELD_MAX_TEXT_SCALE, useEditorTextScale());
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
  const styles = useStyles();
  const editorLayout = useEditorRowLayout();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const fieldScale = useNumericFieldScale();
  return (
    <Section header="Arrow Duel" rows testID="practice-run-arrow-duel-reply-setting">
      <View style={[rowStyle, editorLayout.row]}>
        <View style={editorLayout.copy}>
          <AppText variant="body">
            Find the opponent’s best reply
          </AppText>
          <AppText tone="secondary" variant="footnote">
            {individualRunCopy
              ? "After you choose the better arrow, we play the other move so you can find the opponent’s best reply."
              : "After you choose the better arrow, find the opponent’s best reply."}
          </AppText>
          {individualRunCopy ? (
            <AppText tone="secondary" variant="footnote">
              This setting only changes this Run. Turn it off to go straight to the next puzzle.
            </AppText>
          ) : null}
        </View>
        <View style={editorLayout.controls}>
          <AppText
            numberOfLines={1}
            testID="practice-run-arrow-duel-reply-value"
            tone="secondary"
            variant="body"
          >
            {enabled ? "On" : "Off"}
          </AppText>
          <EditorSwitch
            accessibilityLabel="Find the opponent’s best reply"
            enabled={enabled}
            testID="practice-run-arrow-duel-reply-toggle"
            onPress={onToggle}
          />
        </View>
      </View>
      <View style={[rowStyle, editorLayout.row]} testID="practice-run-arrow-duel-reply-time-row">
        <View style={editorLayout.copy}>
          <AppText variant="body">Time to find the reply</AppText>
          <AppText tone="secondary" variant="footnote">
            You’ll have {DEFAULT_OPPONENT_REPLY_SECONDS} seconds by default. Choose up to {OPPONENT_REPLY_MAX_SECONDS} seconds.
          </AppText>
          <AppText tone="secondary" variant="footnote">
            Your Sprint and puzzle timers pause while you find the reply.
          </AppText>
          {individualRunCopy ? (
            <AppText tone="secondary" variant="footnote">
              To turn this extra challenge off for every Run, go to Settings.
            </AppText>
          ) : null}
          {replySecondsError ? (
            <AppText
              accessibilityLiveRegion="polite"
              testID="practice-run-arrow-duel-reply-seconds-error"
              tone="negative"
              variant="footnote"
            >
              {replySecondsError}
            </AppText>
          ) : null}
        </View>
        <View
          style={[
            editorLayout.controls,
            !enabled ? styles.runTimingControlDisabled : null
          ]}
        >
          <View
            style={[
              styles.arrowDuelReplySecondsInputShell,
              { width: Math.round(64 * fieldScale) },
              replySecondsError ? styles.editorInputError : null
            ]}
          >
            <TextInput
              keyboardAppearance={appTheme.name}
              accessibilityLabel="Time to find the opponent’s reply in seconds"
              accessibilityState={{ disabled: !enabled }}
              editable={enabled}
              inputMode="numeric"
              keyboardType="number-pad"
              maxFontSizeMultiplier={NUMERIC_FIELD_MAX_TEXT_SCALE}
              maxLength={2}
              selectTextOnFocus
              style={[
                styles.arrowDuelReplySecondsInput,
                { fontSize: Math.min(appTheme.typography.body.fontSize, baseTypography.body.fontSize * NUMERIC_FIELD_MAX_TEXT_SCALE) }
              ]}
              testID="practice-run-arrow-duel-reply-seconds"
              value={replySecondsInput}
              onChangeText={onReplySecondsInputChange}
            />
          </View>
          <AppText numberOfLines={1} tone="secondary" variant="body">sec</AppText>
        </View>
      </View>
    </Section>
  );
}

function SprintPassRulesSummary({
  config
}: {
  config: SprintConfig;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      accessibilityLabel={`Pass rules. Solve ${config.targetCorrect} before ${formatSprintDurationLabel(config.durationSeconds)} ends. Mistake ${config.maxMistakes} ends the Sprint. Wrong answers count as attempts, not solved puzzles.`}
      testID="practice-run-pass-rules"
    >
      <Section header="Pass rules">
        <View style={styles.sprintPassRulesHeading}>
          <AppText style={styles.editorRowLabel} variant="headline">
            Solve {config.targetCorrect} before {formatSprintDurationLabel(config.durationSeconds)} ends
          </AppText>
          <View style={styles.sprintPassRulesTarget}>
            <AppText numberOfLines={1} style={styles.sprintPassRulesTargetText} tone="accent" variant="numeral">
              {config.targetCorrect}
            </AppText>
            <AppText numberOfLines={1} style={styles.sprintPassRulesTargetLabel} tone="accent" variant="caption">
              to pass
            </AppText>
          </View>
        </View>
        <AppText tone="secondary" variant="subheadline">
          Wrong answers count as attempts, not solved puzzles. Mistake {config.maxMistakes} ends the Sprint.
        </AppText>
        <AppText tone="secondary" variant="footnote">
          The goal updates with Duration and Time per puzzle.
        </AppText>
      </Section>
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
  const styles = useStyles();
  const editor = puzzleTimingEditorState(puzzleTiming, perPuzzleSeconds);
  const currentTiming = editor.policy;
  const warningEnabled = currentTiming.slowAfterSeconds !== null;
  const timeoutEnabled = currentTiming.timeoutAfterSeconds !== null;
  const warningSeconds = editor.slowDisplaySeconds;
  const timeoutSeconds = editor.timeoutDisplaySeconds;

  return (
    <View style={styles.settingsSection} testID="practice-run-puzzle-timing">
      <View style={styles.runTimingSectionCopy}>
        <AppText accessibilityRole="header" variant="title">Puzzle timing</AppText>
        <AppText tone="secondary" variant="footnote">
          {`Typical time ${formatCompactDuration(perPuzzleSeconds)} · no rating impact`}
        </AppText>
      </View>
      <Section rows testID="practice-run-puzzle-timing-card">
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
      </Section>
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
  const styles = useStyles();
  const editorLayout = useEditorRowLayout();
  const rowStyle = useListRowStyle();
  return (
    <View style={[rowStyle, editorLayout.row]} testID={testID}>
      <View style={editorLayout.copy}>
        <AppText variant="body">{label}</AppText>
        <AppText tone="secondary" variant="footnote">{detail}</AppText>
      </View>
      <View style={editorLayout.controls}>
        <View style={[styles.runTimingStepper, !enabled ? styles.runTimingControlDisabled : null]}>
          <StepperButton
            accessibilityLabel={`Decrease ${label.toLowerCase()}`}
            direction="decrease"
            disabled={!enabled || seconds <= minimumSeconds}
            testID={`${testID}-decrease`}
            onPress={() => onChange(Math.max(minimumSeconds, seconds - 5))}
          />
          <AppText numberOfLines={1} style={styles.runTimingValue} testID={`${testID}-value`} variant="numeralRow">
            {formatCompactDuration(seconds)}
          </AppText>
          <StepperButton
            accessibilityLabel={`Increase ${label.toLowerCase()}`}
            direction="increase"
            disabled={!enabled || seconds >= maximumSeconds}
            testID={`${testID}-increase`}
            onPress={() => onChange(Math.min(maximumSeconds, seconds + 5))}
          />
        </View>
        <EditorSwitch
          accessibilityLabel={label}
          enabled={enabled}
          testID={`${testID}-toggle`}
          onPress={onToggle}
        />
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
  const styles = useStyles();
  const editorLayout = useEditorRowLayout();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const fieldScale = useNumericFieldScale();
  if (directEntry) {
    const parsedInput = Number(inputValue);
    const stepValue = /^\d{1,4}$/.test(inputValue ?? "") && Number.isInteger(parsedInput)
      ? parsedInput
      : value;
    const canDecrease = Boolean(onInputStep) && stepValue > CUSTOM_INITIAL_RATING_MIN;
    const canIncrease = Boolean(onInputStep) && stepValue < CUSTOM_INITIAL_RATING_MAX;
    return (
      <View style={[rowStyle, styles.editorFieldStack]}>
        <View style={editorLayout.line} testID="practice-run-elo-row">
          <View style={editorLayout.copy}>
            <AppText variant="body">{isCreate ? "Starting rating" : "Current rating"}</AppText>
            <AppText tone="secondary" variant="footnote">
              {isCreate
                ? `Sets initial puzzle difficulty · ${CUSTOM_INITIAL_RATING_MIN}–${CUSTOM_INITIAL_RATING_MAX}`
                : `${CUSTOM_INITIAL_RATING_MIN}–${CUSTOM_INITIAL_RATING_MAX} · ±100 buttons`}
            </AppText>
          </View>
          <View style={styles.runEloStepper} testID="practice-run-elo-stepper">
            <StepperButton
              accessibilityLabel="Decrease run rating by 100"
              direction="decrease"
              disabled={!canDecrease}
              testID="practice-run-elo-decrease"
              onPress={() => onInputStep?.(-1)}
            />
            <View
              style={[
                styles.runEloInputShell,
                { width: Math.round(72 * fieldScale) },
                error ? styles.editorInputError : null
              ]}
              testID="practice-run-elo-input-shell"
            >
              <TextInput
                keyboardAppearance={appTheme.name}
                accessibilityLabel={isCreate ? "Starting rating" : "Current rating"}
                inputMode="numeric"
                keyboardType="number-pad"
                maxFontSizeMultiplier={NUMERIC_FIELD_MAX_TEXT_SCALE}
                maxLength={4}
                selectTextOnFocus
                style={[
                  styles.runEloInput,
                  { fontSize: Math.min(appTheme.typography.body.fontSize, baseTypography.body.fontSize * NUMERIC_FIELD_MAX_TEXT_SCALE) }
                ]}
                testID="practice-run-elo-input"
                value={inputValue ?? String(value)}
                onChangeText={onInputChange}
              />
            </View>
            <StepperButton
              accessibilityLabel="Increase run rating by 100"
              direction="increase"
              disabled={!canIncrease}
              testID="practice-run-elo-increase"
              onPress={() => onInputStep?.(1)}
            />
          </View>
        </View>
        {error ? (
          <AppText
            accessibilityLiveRegion="polite"
            testID="practice-run-elo-error"
            tone="negative"
            variant="footnote"
          >
            {error}
          </AppText>
        ) : null}
      </View>
    );
  }
  const canDecrease = value > RATING_FLOOR;
  return (
    <View style={[rowStyle, editorLayout.row]} testID="practice-run-elo-row">
      <View style={editorLayout.copy}>
        <AppText variant="body">{isCreate ? "Starting rating" : "Current rating"}</AppText>
        <AppText tone="secondary" variant="footnote">
          {isCreate
            ? `Sets initial puzzle difficulty · minimum ${RATING_FLOOR}`
            : `Adjusts puzzle difficulty · minimum ${RATING_FLOOR}`}
        </AppText>
      </View>
      <View style={editorLayout.controls}>
        <StepperButton
          accessibilityLabel="Decrease run rating"
          direction="decrease"
          disabled={!canDecrease}
          testID="practice-run-elo-decrease"
          onPress={() => onChange(stepManualRating(value, -1))}
        />
        <AppText numberOfLines={1} testID="practice-run-elo-value" tone="secondary" variant="numeralRow">Rating {value}</AppText>
        <StepperButton
          accessibilityLabel="Increase run rating"
          direction="increase"
          disabled={false}
          testID="practice-run-elo-increase"
          onPress={() => onChange(stepManualRating(value, 1))}
        />
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
  const styles = useStyles();
  const progressDelta = progress.correctThisWeek + progress.wrongThisWeek === 0
    ? "Start training"
    : `${progress.netThisWeek >= 0 ? "+" : ""}${progress.netThisWeek} net`;
  const progressTone = progress.netThisWeek < 0
    ? styles.homeToneNegative
    : progress.correctThisWeek + progress.wrongThisWeek > 0
      ? styles.homeTonePositive
      : styles.homeToneNeutral;
  const progressContext = progress.accuracyThisWeek === null
    ? "No attempts yet"
    : `${progress.accuracyThisWeek}% accuracy · ${progress.wrongThisWeek} ${progress.wrongThisWeek === 1 ? "mistake" : "mistakes"}`;
  const ratingDeltaLabel = progress.ratingDeltaThisWeek === null
    ? "No rating change"
    : `${progress.ratingDeltaThisWeek >= 0 ? "+" : ""}${progress.ratingDeltaThisWeek} this week`;
  const ratingDeltaTone = progress.ratingDeltaThisWeek === null
    ? styles.homeToneNeutral
    : progress.ratingDeltaThisWeek < 0
      ? styles.homeToneNegative
      : styles.homeTonePositive;

  return (
    <Section header="Progress">
      <View
        accessible
        accessibilityLabel={`Progress summary, ${ratingContextLabel ?? modeLabel(mode)} rating ${currentRating}, ${ratingDeltaLabel}, this week ${progress.correctThisWeek}, ${progressDelta}, ${progressContext}`}
        style={styles.homeProgressMetrics}
        testID="practice-progress-summary"
      >
        <View style={styles.homeProgressMetric} testID="practice-progress-rating-metric">
          <AppText style={styles.homeProgressText} tone="secondary" variant="footnote">{ratingContextLabel ?? modeLabel(mode)} rating</AppText>
          <AppText style={[styles.homeProgressValue, styles.homeProgressText]} variant="numeralLarge">{currentRating}</AppText>
          <AppText testID="practice-progress-rating-delta" style={[ratingDeltaTone, styles.homeProgressText]} variant="footnote">{ratingDeltaLabel}</AppText>
        </View>
        <View style={styles.homeProgressDivider} testID="practice-progress-divider" />
        <View style={styles.homeProgressMetric} testID="practice-progress-weekly-metric">
          <AppText style={styles.homeProgressText} tone="secondary" variant="footnote">This Week</AppText>
          <AppText testID="practice-progress-weekly-solved" style={[styles.homeProgressValue, styles.homeProgressText]} variant="numeralLarge">{progress.correctThisWeek}</AppText>
          <AppText testID="practice-progress-weekly-delta" style={[progressTone, styles.homeProgressText]} variant="footnote">{progressDelta}</AppText>
          <AppText style={styles.homeProgressText} testID="practice-progress-weekly-context" tone="secondary" variant="footnote">{progressContext}</AppText>
        </View>
      </View>
    </Section>
  );
}

function PracticeNoRunProgressCard(): React.JSX.Element {
  return (
    <Section header="Progress" testID="practice-progress-no-run">
      <AppText variant="headline">No run selected</AppText>
      <AppText tone="secondary" variant="subheadline">Add or restore a run to see its current rating.</AppText>
    </Section>
  );
}

function ResumeSprintCard({
  onResume,
  sprint
}: {
  onResume: () => void;
  sprint: SprintState;
}): React.JSX.Element {
  const isTacticalFocus = sprint.config.tacticalFocus !== undefined;
  const completedCount = sprint.correctCount + sprint.mistakeCount;
  const remaining = Math.max(
    0,
    (isTacticalFocus
      ? sprint.config.maxAttempts ?? sprint.config.targetCorrect
      : sprint.config.targetCorrect) -
      (isTacticalFocus ? completedCount : sprint.correctCount)
  );
  return (
    <Section rows>
      <ListRow
        accessibilityLabel={isTacticalFocus
          ? `Resume Focused Run, ${completedCount} completed, ${remaining} left, ${sprint.mistakeCount} mistakes`
          : `Resume ${modeLabel(sprint.config.mode)} sprint`}
        icon="play"
        subtitle={isTacticalFocus
          ? `Focused Run · ${completedCount} completed · ${remaining} left · ${sprint.mistakeCount} mistakes`
          : `${modeLabel(sprint.config.mode)} · ${sprint.correctCount} solved · ${remaining} left · ${sprint.mistakeCount} mistakes`}
        testID="practice-resume-card"
        title={isTacticalFocus ? "Resume Focused Run" : "Resume sprint"}
        trailing={<AppText numberOfLines={1} tone="accent" variant="headline">Resume</AppText>}
        onPress={onResume}
      />
    </Section>
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
  const styles = useStyles();
  const isTacticalFocus = state.config.tacticalFocus !== undefined;
  const completedCount = state.correctCount + state.mistakeCount;
  const remaining = Math.max(
    0,
    (isTacticalFocus
      ? state.config.maxAttempts ?? state.config.targetCorrect
      : state.config.targetCorrect) -
      (isTacticalFocus ? completedCount : state.correctCount)
  );
  return (
    <View
      accessibilityLabel={isTacticalFocus
        ? `Paused Focused Run, ${completedCount} completed, ${remaining} left, ${state.mistakeCount} mistakes`
        : `Paused ${modeLabel(state.config.mode)} sprint, ${state.correctCount} solved, ${remaining} left`}
      style={styles.pausedSessionPanel}
      testID="paused-session-panel"
    >
      <View style={styles.pausedSessionCopy}>
        <Text style={styles.sectionLabel}>
          {isTacticalFocus ? "Focused Run paused" : "Sprint paused"}
        </Text>
        <Text style={styles.helperText}>
          {isTacticalFocus
            ? `${completedCount} completed · ${remaining} left · ${state.mistakeCount} mistakes`
            : `${modeLabel(state.config.mode)} · ${state.correctCount} solved · ${remaining} left · ${state.mistakeCount} mistakes`}
        </Text>
      </View>
      <View style={styles.pausedSessionActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isTacticalFocus
            ? "Abandon paused Focused Run"
            : "Abandon paused sprint"}
          testID="paused-session-abandon"
          style={styles.secondaryButton}
          onPress={onAbandon}
        >
          <Text style={styles.secondaryButtonText}>Abandon</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isTacticalFocus
            ? "Resume paused Focused Run"
            : "Resume paused sprint"}
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
  position,
  onPress
}: {
  active: boolean;
  item: PracticeModeSummary;
  position: GroupPosition;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
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
      style={({ pressed }) => [styles.homeRow, homeRowPositionStyle(styles, position), pressed ? styles.homeRowPressed : null]}
      onPress={onPress}
    >
      <HomeRowSeparator position={position} />
      <View style={styles.homeRowSelectArea}>
        <View testID={`practice-mode-${modeTestId}-icon`}>
          <IconTile name={modeIconName(item.mode)} />
        </View>
        <View style={styles.homeRowCopy}>
          <AppText variant="headline">{label}</AppText>
          <AppText
            ellipsizeMode="tail"
            numberOfLines={2}
            tone="secondary"
            variant="subheadline"
          >
            {PRACTICE_MODE_DESCRIPTIONS[item.mode]}
          </AppText>
          <View
            accessibilityLabel={detail}
            testID={`practice-mode-${modeTestId}-details`}
            style={styles.practiceModeDetailProbe}
          />
        </View>
      </View>
      <View style={styles.homeRowMeta}>
        {ratingLabel ? (
          <AppText numberOfLines={1} tone="secondary" testID={`practice-mode-${modeTestId}-rating`} variant="subheadline">{ratingLabel}</AppText>
        ) : null}
        {active ? (
          <Icon color={appTheme.colors.accent.s600} name="check" size={18} testID={`practice-mode-${modeTestId}-selected`} weight="semibold" />
        ) : null}
        {item.mode === "custom" ? (
          <View testID="practice-mode-custom-disclosure">
            <Icon color={appTheme.colors.text.tertiary} name="chevronRight" size={15} weight="semibold" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

type GroupPosition = "only" | "first" | "middle" | "last";

function groupPosition(index: number, count: number): GroupPosition {
  if (count <= 1) {
    return "only";
  }
  if (index === 0) {
    return "first";
  }
  return index === count - 1 ? "last" : "middle";
}

// Rows in one grouped list keep their own surface so a dragged row can lift out
// of the group; the first and last rows carry the section corners and every row
// after the first draws an inset hairline.
function homeRowPositionStyle(
  styles: ReturnType<typeof useStyles>,
  position: GroupPosition
): React.ComponentProps<typeof View>["style"] {
  return [
    position === "only" || position === "first" ? styles.homeRowTop : null,
    position === "only" || position === "last" ? styles.homeRowBottom : null
  ];
}

// The inset hairline above every row after the first in a grouped list.
function HomeRowSeparator({ position }: { position: GroupPosition }): React.JSX.Element | null {
  const styles = useStyles();
  if (position === "only" || position === "first") {
    return null;
  }
  return <View pointerEvents="none" style={styles.homeRowSeparator} />;
}

function modeIconName(mode: SprintMode): IconName {
  return mode === "arrow_duel" ? "arrowDuel" : mode === "custom" ? "custom" : "standard";
}

function runIconName(run: Pick<PracticeRunPresentation, "kind" | "mode">): IconName {
  if (run.kind === "custom") {
    return "custom";
  }
  return run.mode === "arrow_duel" ? "arrowDuel" : "standard";
}

function HomeStartHeader({
  actionLabel = "Start",
  headerTestID,
  startAccessibilityLabel,
  startDisabled = false,
  startTestID,
  title,
  titleTestID,
  onStart
}: {
  actionLabel?: string;
  headerTestID: string;
  startAccessibilityLabel: string;
  startDisabled?: boolean;
  startTestID: string;
  title: string;
  titleTestID: string;
  onStart: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.homeStartHeader} testID={headerTestID}>
      <AppText accessibilityRole="header" style={styles.homeStartTitle} testID={titleTestID} variant="title">
        {title}
      </AppText>
      <Button
        accessibilityLabel={startAccessibilityLabel}
        disabled={startDisabled}
        icon={actionLabel === "Start" ? "play" : undefined}
        label={actionLabel}
        size="compact"
        testID={startTestID}
        onPress={onStart}
      />
    </View>
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
  const styles = useStyles();
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

      <Section rows testID="custom-config-list">
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
      </Section>

      <CustomEligibilityNotice
        availablePuzzleCount={availablePuzzleCount}
        hasEnoughLocalPuzzles={hasEnoughLocalPuzzles}
        requiredPuzzleCount={requiredPuzzleCount}
      />

      <PracticeProgressCard currentRating={initialRating} mode={customMode} progress={progress} />

      <View style={styles.previousConfigList} testID="custom-previous-configs">
        <AppText accessibilityRole="header" style={styles.previousConfigHeader} variant="title">Previous configs</AppText>
        {previousRows.length === 0 ? (
          <AppText style={styles.previousConfigHeader} testID="custom-previous-empty" tone="secondary" variant="footnote">
            Start a custom sprint to save this setup.
          </AppText>
        ) : (
          <Section rows>
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
          </Section>
        )}
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
    <Section rows testID="custom-pack-warning">
      <ListRow
        icon="warning"
        iconTone="warning"
        subtitle={`Current offline pack has ${availablePuzzleCount} eligible puzzles; this setup may need up to ${requiredPuzzleCount}. Broaden theme or rating coverage before a scored release pack.`}
        title="Local pack warning"
      />
    </Section>
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
  const styles = useStyles();
  const rowStyle = useListRowStyle();
  const options: Array<{ value: "custom" | "arrow_duel"; label: string; detail: string; testID: string }> = [
    { value: "custom", label: "Regular Puzzles", detail: "Board moves", testID: "custom-mode-regular" },
    { value: "arrow_duel", label: "Arrow Duel", detail: "Two candidates", testID: "custom-mode-arrow-duel" }
  ];
  return (
    <View style={rowStyle} testID={testID}>
      <AppText style={styles.customModeLabel} variant="body">Mode</AppText>
      <View style={styles.customInlineOptions}>
        {options.map((option) => (
          <ChoiceChip
            key={option.value}
            accessibilityLabel={`${option.label} custom sprint mode, ${option.detail}`}
            accessibilityRole="button"
            accessibilityState={{ selected: value === option.value }}
            label={option.label}
            selected={value === option.value}
            testID={option.testID}
            onPress={() => onChange(option.value)}
          />
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
  const styles = useStyles();
  const editorLayout = useEditorRowLayout();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  if (!played) {
    return (
      <View
        accessibilityLabel={`Starting rating, rating ${value}. Sets the initial puzzle difficulty for this Run.`}
        style={[rowStyle, editorLayout.row]}
        testID="custom-initial-rating-row"
      >
        <View style={editorLayout.copy}>
          <AppText variant="body">Starting rating</AppText>
          <AppText tone="secondary" variant="footnote">Sets initial puzzle difficulty</AppText>
        </View>
        <View style={editorLayout.controls}>
          <AppText numberOfLines={1} testID="custom-initial-rating-value" tone="secondary" variant="body">Rating {value}</AppText>
          <CustomRatingStepper onChange={onChange} value={value} />
        </View>
      </View>
    );
  }

  // One grouped cell: the disclosure row and, when open, its editor below a
  // full-bleed hairline (Section separates cells, not the rows inside one).
  return (
    <View>
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Edit rating, rating ${value}`}
        accessibilityState={{ expanded: editOpen }}
        style={({ pressed }) => [rowStyle, editorLayout.row, pressed ? styles.editorRowPressed : null]}
        testID="custom-initial-rating-row"
        onPress={() => onEditOpenChange(!editOpen)}
      >
        <AppText style={editorLayout.copy} variant="body">Edit rating</AppText>
        <View style={editorLayout.controls}>
          <AppText numberOfLines={1} testID="custom-initial-rating-value" tone="secondary" variant="body">Rating {value}</AppText>
          <Icon color={appTheme.colors.text.tertiary} name="chevronRight" size={15} testID="chevron-right-glyph" weight="semibold" />
        </View>
      </Pressable>
      {editOpen ? (
        <>
          <View style={styles.editorCellSeparator} />
          <View style={rowStyle} testID="custom-initial-rating-editor">
            <AppText style={styles.editorRowLabel} variant="body">Adjustment</AppText>
            <CustomRatingStepper onChange={onChange} value={value} />
          </View>
        </>
      ) : null}
    </View>
  );
}

function CustomRatingStepper({
  onChange,
  value
}: {
  onChange: (next: number) => void;
  value: number;
}): React.JSX.Element {
  const styles = useStyles();
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
      <StepperButton
        accessibilityLabel="Decrease rating"
        direction="decrease"
        disabled={!canDecrease}
        testID="custom-initial-rating-stepper-decrease"
        onPress={decrease}
      />
      <StepperButton
        accessibilityLabel="Increase rating"
        direction="increase"
        disabled={!canIncrease}
        testID="custom-initial-rating-stepper-increase"
        onPress={increase}
      />
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
  const styles = useStyles();
  const editorLayout = useEditorRowLayout();
  const rowStyle = useListRowStyle();
  const accessibilityLabel = [label, value, detail].filter(Boolean).join(", ");
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[rowStyle, editorLayout.row]}
      testID={testID}
    >
      <View style={editorLayout.copy}>
        <AppText variant="body">{label}</AppText>
        {detail ? (
          <View
            accessibilityLabel={detail}
            testID={`${testID}-detail`}
          />
        ) : null}
      </View>
      <AppText style={styles.customConfigValue} testID={valueTestID} tone="secondary" variant="body">{value}</AppText>
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
  const styles = useStyles();
  const rowStyle = useListRowStyle();
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
    <View style={[rowStyle, styles.customThemeRow]} testID={testID}>
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
  const styles = useStyles();
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
            <AppText variant="body">Themes</AppText>
            <AppText
              accessibilityLabel={`Selected themes: ${selectedThemeDetail}`}
              ellipsizeMode="tail"
              numberOfLines={1}
              testID="practice-run-theme-selection-detail"
              tone="secondary"
              variant="footnote"
            >
              {selectedThemeDetail}
            </AppText>
          </View>
          <DisclosureChevron
            expanded={expanded}
            testID="practice-run-theme-animated-chevron"
          />
        </Pressable>
      ) : (
        <View style={styles.themeCatalogHeadingRow}>
          <View style={styles.editorRowLabel}>
            <AppText variant="body">Themes</AppText>
            <AppText tone="secondary" variant="footnote">Choose one or more</AppText>
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

// A capsule choice: selection is an accentSoft tint, never a check or border.
function ChoiceChip({
  accessibilityHint,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  label,
  selected,
  testID,
  onPress
}: {
  accessibilityHint?: string;
  accessibilityLabel: string;
  accessibilityRole: "button" | "checkbox";
  accessibilityState: { checked?: boolean; selected?: boolean };
  label: string;
  selected: boolean;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      hitSlop={4}
      style={({ pressed }) => [
        styles.customMiniChip,
        selected ? styles.customMiniChipActive : null,
        pressed && !selected ? styles.customMiniChipPressed : null
      ]}
      testID={testID}
      onPress={onPress}
    >
      <AppText
        style={[styles.customMiniChipText, selected ? styles.customMiniChipTextActive : null]}
        tone={selected ? "accent" : "primary"}
        variant="subheadline"
      >
        {label}
      </AppText>
    </Pressable>
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
    <ChoiceChip
      accessibilityHint={representsAllThemes
        ? "Selects all themes and clears named theme selections"
        : "Adds or removes this theme"}
      accessibilityLabel={representsAllThemes ? "All puzzle themes" : `${visibleLabel} puzzle theme`}
      accessibilityRole={representsAllThemes ? "button" : "checkbox"}
      accessibilityState={representsAllThemes ? { selected } : { checked: selected }}
      label={visibleLabel}
      selected={selected}
      testID={`custom-theme-${representsAllThemes ? "mixed" : safeTestId(visibleLabel)}`}
      onPress={onPress}
    />
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
  const styles = useStyles();
  const editorLayout = useEditorRowLayout();
  const rowStyle = useListRowStyle();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selected));
  const previousOption = options[selectedIndex - 1];
  const nextOption = options[selectedIndex + 1];

  return (
    <View style={[rowStyle, editorLayout.row]}>
      <AppText style={editorLayout.copy} variant="body">{label}</AppText>
      <View style={editorLayout.controls}>
        <AppText numberOfLines={1} tone="secondary" variant="body">{value}</AppText>
        <View style={styles.customStepperCompact} testID={stepperTestID}>
          <StepperButton
            accessibilityLabel={`Decrease ${label.toLowerCase()}`}
            direction="decrease"
            disabled={!previousOption}
            testID={`${stepperTestID}-decrease`}
            onPress={() => {
              if (previousOption) {
                onChange(previousOption.value);
              }
            }}
          />
          <StepperButton
            accessibilityLabel={`Increase ${label.toLowerCase()}`}
            direction="increase"
            disabled={!nextOption}
            testID={`${stepperTestID}-increase`}
            onPress={() => {
              if (nextOption) {
                onChange(nextOption.value);
              }
            }}
          />
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
  const styles = useStyles();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const ratingLabel = historyRatingKeyLabel(config.ratingKey);
  const metaLabel = `${config.themeLabel} · ${config.timing} · Last ${config.lastPlayed}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Use ${ratingLabel} custom sprint, ${config.mode}, ${metaLabel}, rating ${config.rating}`}
      style={({ pressed }) => [rowStyle, pressed ? styles.editorRowPressed : null]}
      testID={`custom-previous-${config.id}`}
      onPress={onPress}
    >
      <View style={styles.editorRowLabel}>
        <AppText variant="headline">{config.mode}</AppText>
        <AppText
          accessibilityLabel={`${metaLabel} · ${ratingLabel}`}
          testID={`custom-previous-${config.id}-meta`}
          tone="secondary"
          variant="subheadline"
        >
          {metaLabel}
        </AppText>
      </View>
      <View style={styles.previousConfigRating}>
        <AppText numberOfLines={1} tone="secondary" variant="footnote">Rating</AppText>
        <AppText numberOfLines={1} tone="secondary" variant="numeralRow">{config.rating}</AppText>
      </View>
      <View testID={`custom-previous-${config.id}-chevron`}>
        <Icon color={appTheme.colors.text.tertiary} name="chevronRight" size={15} testID="chevron-right-glyph" weight="semibold" />
      </View>
    </Pressable>
  );
}

function TestPuzzleSourceControl({
  source,
  onChange,
  onInjectMateIn2FocusedRun,
  onSeedTacticalHistory,
  seededHistoryStatus,
  simulationActive,
  onToggleSimulation,
  onClearSimulation,
  onShowWhatsNew,
  onSimulateWhatsNewUpdate
}: {
  source: MobilePuzzleSource;
  onChange: (next: MobilePuzzleSource) => void;
  onInjectMateIn2FocusedRun?: () => void;
  onSeedTacticalHistory?: (scenario: SimulatedHistoryScenarioId) => void;
  seededHistoryStatus?: string | null;
  simulationActive?: boolean;
  onToggleSimulation?: () => void;
  onClearSimulation?: () => void;
  onShowWhatsNew?: () => void;
  onSimulateWhatsNewUpdate?: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.testPanel} testID="test-puzzle-source-control">
      {onToggleSimulation ? (
        <>
          <View style={styles.optionRow}>
            <OptionButton
              active={simulationActive === true}
              label="Use simulation data"
              testID="test-simulation-profile-toggle"
              onPress={onToggleSimulation}
            />
            {simulationActive && onClearSimulation ? (
              <OptionButton
                active={false}
                label="Clear simulation data"
                testID="test-simulation-profile-clear"
                onPress={onClearSimulation}
              />
            ) : null}
          </View>
          {simulationActive ? (
            <Text style={styles.simulationNotice} testID="test-simulation-profile-notice">
              Simulation data is on. Your Dev progress is untouched.
            </Text>
          ) : null}
        </>
      ) : null}
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
      {onInjectMateIn2FocusedRun ? (
        <OptionButton
          active={false}
          label="Inject Mate in 2 Focused Run"
          testID="test-focused-run-inject-mate-in-2"
          onPress={onInjectMateIn2FocusedRun}
        />
      ) : null}
      {onSeedTacticalHistory ? (
        <>
          <Text style={styles.helperText}>Seed simulated history (Dev only)</Text>
          <View style={styles.optionRow}>
            {SIMULATED_HISTORY_SCENARIOS.map(({ scenario, label }) => (
              <OptionButton
                key={scenario}
                active={false}
                label={label}
                testID={`test-seed-tactical-history-${scenario}`}
                onPress={() => onSeedTacticalHistory(scenario)}
              />
            ))}
          </View>
        </>
      ) : null}
      {onShowWhatsNew || onSimulateWhatsNewUpdate ? (
        <>
          <Text style={styles.helperText}>What’s New (Dev only)</Text>
          <View style={styles.optionRow}>
            {onShowWhatsNew ? (
              <OptionButton
                active={false}
                label="Show What’s New"
                testID="test-whats-new-show"
                onPress={onShowWhatsNew}
              />
            ) : null}
            {onSimulateWhatsNewUpdate ? (
              <OptionButton
                active={false}
                label="Simulate update to 1.6.0"
                testID="test-whats-new-simulate-update"
                onPress={onSimulateWhatsNewUpdate}
              />
            ) : null}
          </View>
        </>
      ) : null}
      {seededHistoryStatus ? (
        <Text style={styles.helperText} testID="test-seed-tactical-history-status">
          {seededHistoryStatus}
        </Text>
      ) : null}
    </View>
  );
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
  metricsRef,
  mode,
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
  metricsRef?: React.RefObject<View | null>;
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
    <View style={styles.activeSessionShell} testID="active-session-shell">
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

      {confirmAbandon && isPersonalBest ? (
        <View style={styles.survivalExitSheet} testID="session-abandon-confirmation">
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
        <View style={styles.sessionAbandonConfirm} testID="session-abandon-confirmation">
          <View style={styles.sessionAbandonCopy}>
            <Text style={styles.listText}>
              {isTacticalFocus ? "Abandon Focused Run?" : "Abandon sprint?"}
            </Text>
            <Text style={styles.helperText}>
              {isTacticalFocus
                ? "This ends the Focused Run. Completed puzzles stay in History and your Rating stays unchanged."
                : "This ends the run and records a failed sprint."}
            </Text>
          </View>
          <View style={styles.sessionAbandonActions}>
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

function SessionScoreGlyph({ tone }: { tone: "positive" | "negative" | "neutral" }): React.JSX.Element {
  const styles = useStyles();
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
  const styles = useStyles();
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
  const styles = useStyles();
  const appTheme = useTheme();
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
        <AppText accessibilityRole="header" style={styles.destinationTitle} variant="largeTitle">History</AppText>
        <View style={styles.historyHeaderActions}>
          {onOpenProgress ? (
            <HistoryProgressEntryButton onPress={onOpenProgress} />
          ) : null}
          {filtersExpanded ? (
            <Button
              accessibilityLabel="Reset history filters"
              label="Reset filters"
              size="compact"
              testID="history-filter-reset"
              variant="plain"
              onPress={onResetFilters}
            />
          ) : null}
          <ToolbarIconButton
            accessibilityLabel={filtersExpanded ? "Hide history filters" : "Show history filters"}
            accessibilityState={{ expanded: filtersExpanded }}
            active={filtersExpanded}
            testID="history-filter-toggle"
            onPress={() => onFiltersExpandedChange(!filtersExpanded)}
          >
            <FilterGlyph active={filtersExpanded} />
          </ToolbarIconButton>
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
            <AppText style={styles.historyFilterGroupLabel} tone="secondary" variant="footnote">Attention</AppText>
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
          <AppText style={styles.historyFootnote} testID="history-attention-explanation" tone="secondary" variant="footnote">
            Needs attention includes Incomplete, Unclear, or In Review Sprint attempts.
          </AppText>
        ) : null}
      </View>

      {selectedRatingKey ? (
        <View style={styles.historyPerformanceCard} testID="history-performance-card">
          <View style={styles.historyPerformanceHeader}>
            <View style={styles.settingsRowCopy}>
              <AppText variant="headline">Rating Trend</AppText>
              <AppText testID="history-performance-context" tone="secondary" variant="footnote">
                {`${historyRatingKeyLabel(selectedRatingKey, selectedRun?.name, selectedRun?.perPuzzleSeconds)} · ${historyRangeLabel(timeRange)}`}
              </AppText>
            </View>
            <View style={styles.historyMetricSummary}>
              <AppText testID="history-chart-value" style={styles.historyAccuracy} variant="numeral">{latestRating ? String(latestRating) : "—"}</AppText>
              <AppText testID="history-chart-label" tone="secondary" variant="caption">Rating</AppText>
            </View>
          </View>
          <HistoryRatingTrendChart points={ratingPoints} />
        </View>
      ) : null}

      <HistoryActiveFilterStrip compact labels={activeFilterLabels} />

      <View style={styles.historyPageRow}>
        <AppText tone="secondary" variant="footnote">
          {page.total === 0 ? "0 results" : `${page.offset + 1}-${Math.min(page.offset + attempts.length, page.total)} of ${page.total}`}
        </AppText>
        <View style={styles.iconButtonRow}>
          <ToolbarIconButton
            accessibilityLabel="Previous history page"
            accessibilityState={{ disabled: page.offset === 0 }}
            disabled={page.offset === 0}
            testID="history-page-previous"
            onPress={() => onPageOffsetChange(Math.max(0, page.offset - page.limit))}
          >
            <Icon color={appTheme.colors.accent.s600} name="chevronLeft" size={17} testID="chevron-left-glyph" weight="semibold" />
          </ToolbarIconButton>
          <ToolbarIconButton
            accessibilityLabel="Next history page"
            accessibilityState={{ disabled: !page.hasMore }}
            disabled={!page.hasMore}
            testID="history-page-next"
            onPress={() => onPageOffsetChange(page.offset + page.limit)}
          >
            <Icon color={appTheme.colors.accent.s600} name="chevronRight" size={17} testID="chevron-right-glyph" weight="semibold" />
          </ToolbarIconButton>
        </View>
      </View>
      {visibleAttempts.length === 0 ? (
        <View style={styles.groupedList}>
          <AppText
            accessibilityLabel="History has no attempts"
            style={styles.groupedEmpty}
            testID="history-empty-state"
            tone="secondary"
            variant="body"
          >
            No attempts
          </AppText>
        </View>
      ) : (
        <View style={styles.groupedList} testID="history-attempts">
          {visibleAttempts.map((attempt, index) => (
            <React.Fragment key={attempt.id}>
              {index > 0 ? <View style={styles.groupedSeparator} /> : null}
              <HistoryAttemptRow
                attempt={attempt}
                nowMs={nowMs}
                onOpen={() => onOpenAttempt(attempt.id)}
              />
            </React.Fragment>
          ))}
        </View>
      )}
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
  const styles = useStyles();
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
          <AppText variant="headline">Themes</AppText>
          <AppText
            accessibilityLabel={`Selected themes: ${selectedThemeDetail}`}
            ellipsizeMode="tail"
            numberOfLines={1}
            testID="history-theme-selection-detail"
            tone="secondary"
            variant="footnote"
          >
            {selectedThemeDetail}
          </AppText>
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
                style={styles.historyChipScroller}
                testID={`history-theme-filter-rail-${safeTestId(group.label)}`}
              >
                <View style={[styles.themeCatalogRailContent, styles.historyChipScrollerContent]}>
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
  const styles = useStyles();
  return (
    <View testID="history-active-filter-summary">
      <View style={compact ? styles.historyCompactFilterSummary : styles.historyChipContent}>
        {labels.map((label, index) => (
          <View
            key={`${label}-${index}`}
            style={compact ? styles.historyCompactFilterLabel : styles.historyActiveFilterChip}
            testID={`history-active-filter-${index}`}
          >
            <Text style={compact ? styles.historyCompactFilterText : styles.historyActiveFilterText}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
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
  const styles = useStyles();
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
  const styles = useStyles();
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
  const appTheme = useTheme();
  if (tone === "correct") {
    return (
      <Icon color={appTheme.colors.positive.s600} name="check" size={18} testID="result-badge-correct-glyph" weight="semibold" />
    );
  }
  if (tone === "incomplete") {
    return (
      <Icon color={appTheme.colors.text.tertiary} name="remove" size={18} testID="result-badge-incomplete-glyph" weight="semibold" />
    );
  }
  return (
    <Icon color={appTheme.colors.danger.s600} name="close" size={18} testID="result-badge-wrong-glyph" weight="semibold" />
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
  const styles = useStyles();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.historyChipScroller}
      testID={testID}
    >
      <View style={[styles.historyChipContent, styles.historyChipScrollerContent, contentStyle]}>
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
  const styles = useStyles();
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
  const styles = useStyles();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
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
  const compactMeta = [sourceLabel, durationLabel, paceLabel, dateLabel].filter(Boolean).join(" · ");
  const accessibleMeta = [sourceLabel, durationLabel, paceLabel, accessibleDateLabel].filter(Boolean).join(" · ");
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
      style={({ pressed }) => [rowStyle, styles.attemptRow, pressed ? styles.settingsRowPressed : null]}
      onPress={onOpen}
    >
      <AttemptStatusTile
        testID={`history-attempt-${attempt.id}-badge`}
        tone={isIncomplete
          ? "incomplete"
          : isTimedOut || isWrong
            ? "wrong"
            : isCorrect ? "correct" : "unknown"}
      />
      <View style={styles.attemptRowCopy}>
        <View style={styles.historyAttemptHeader}>
          <AppText variant="headline">{attempt.runName ?? historyAttemptModeLabel(detail.mode)}</AppText>
          <AppText
            testID={`history-attempt-${attempt.id}-result`}
            tone={isCorrect ? "positive" : isTimedOut || isWrong ? "negative" : "secondary"}
            variant="subheadline"
          >
            {resultLabel}
          </AppText>
        </View>
        <View accessibilityLabel={puzzleIdentity} style={styles.attemptRowIdentity} testID={`history-attempt-${attempt.id}-identity`}>
          <AppText ellipsizeMode="tail" numberOfLines={1} style={styles.attemptRowIdentityId} tone="secondary" variant="footnote">
            {`ID ${attempt.puzzleId}`}
          </AppText>
          <AppText numberOfLines={1} style={styles.attemptRowIdentityRating} tone="secondary" variant="footnote">
            {`\u00A0· Rating ${attempt.puzzleRating}`}
          </AppText>
        </View>
        {visibleThemes.length > 0 ? (
          <HistoryThemeList attemptId={attempt.id} themes={visibleThemes} />
        ) : null}
        <AppText testID={`history-attempt-${attempt.id}-meta`} tone="secondary" variant="footnote">{compactMeta}</AppText>
      </View>
      {isUnclear || timingStatus === "slow" ? (
        <View style={styles.attemptRowTrailingBadges}>
          {isUnclear ? (
            <Badge label="Unclear" testID={`history-attempt-${attempt.id}-unclear`} tone="warning" />
          ) : null}
          {timingStatus === "slow" ? (
            <Badge label="Slow" testID={`history-attempt-${attempt.id}-${timingStatus}`} tone="warning" />
          ) : null}
        </View>
      ) : null}
      <View style={styles.attemptRowChevron} testID={`history-attempt-${attempt.id}-chevron`}>
        <Icon color={appTheme.colors.text.tertiary} name="chevronRight" size={15} testID="chevron-right-glyph" weight="semibold" />
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
    <ThemeTagRail fadeEnd testID={`history-attempt-${attemptId}-themes`} themes={themes} />
  );
}

function ThemeTagRail({
  centered = false,
  fadeEnd = false,
  testID,
  themes
}: {
  centered?: boolean;
  /** Fades the trailing edge so an overflowing chip does not end in a hard cut. */
  fadeEnd?: boolean;
  testID: string;
  themes: readonly string[];
}): React.JSX.Element {
  const styles = useStyles();
  if (fadeEnd) {
    return (
      <View style={styles.themeTagRailFadeFrame}>
        <ThemeTagRail centered={centered} testID={testID} themes={themes} />
        <View pointerEvents="none" style={styles.themeTagRailFade}>
          {THEME_TAG_RAIL_FADE_STEPS.map((opacity) => (
            <View key={opacity} style={[styles.themeTagRailFadeStep, { opacity }]} />
          ))}
        </View>
      </View>
    );
  }
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

// Opacities of the surface-colored strips that fade the rail's trailing edge.
const THEME_TAG_RAIL_FADE_STEPS = [0.25, 0.5, 0.75, 1] as const;

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
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={4}
      testID={testID}
      style={[styles.filterButton, active ? styles.filterButtonActive : null]}
      onPress={onPress}
    >
      <Text style={[styles.filterButtonText, active ? styles.filterButtonTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function FilterGlyph({ active }: { active: boolean }): React.JSX.Element {
  const appTheme = useTheme();
  return (
    <Icon
      color={active ? appTheme.colors.accent.s600 : appTheme.colors.text.primary}
      name="filter"
      size={20}
      testID="filter-glyph"
      weight="semibold"
    />
  );
}

// A 44-pt circular toolbar button for a destination header (filters, paging).
function ToolbarIconButton({
  accessibilityLabel,
  accessibilityState,
  active = false,
  children,
  disabled = false,
  testID,
  onPress
}: {
  accessibilityLabel: string;
  accessibilityState?: { disabled?: boolean; expanded?: boolean };
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.toolbarIconButton,
        active ? styles.toolbarIconButtonActive : null,
        pressed && !disabled ? styles.filterButtonPressed : null,
        disabled ? styles.disabledButton : null
      ]}
      onPress={onPress}
    >
      {children}
    </Pressable>
  );
}

// Status tile for a History or Review attempt row: tinted like an IconTile and
// carrying the result glyph.
function AttemptStatusTile({
  testID,
  tone
}: {
  testID: string;
  tone: "correct" | "wrong" | "incomplete" | "unknown";
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  return (
    <View
      style={[
        styles.attemptStatusTile,
        tone === "correct"
          ? styles.attemptStatusTileCorrect
          : tone === "wrong"
            ? styles.attemptStatusTileWrong
            : styles.attemptStatusTileNeutral
      ]}
      testID={testID}
    >
      {tone === "unknown" ? (
        <Icon color={appTheme.colors.text.tertiary} name="help" size={18} weight="semibold" />
      ) : (
        <ResultBadgeGlyph tone={tone} />
      )}
    </View>
  );
}

function CloseGlyph({
  color,
  testID = "close-glyph"
}: {
  color?: string;
  testID?: string;
} = {}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const glyphColor = color ?? appTheme.colors.text.ink;
  return (
    <View style={styles.closeGlyph} testID={testID}>
      <View style={[styles.closeGlyphLine, styles.closeGlyphForward, { backgroundColor: glyphColor }]} />
      <View style={[styles.closeGlyphLine, styles.closeGlyphBackward, { backgroundColor: glyphColor }]} />
    </View>
  );
}

function MoreGlyph(): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.moreGlyph} testID="more-glyph">
      <View style={styles.moreGlyphDot} />
      <View style={styles.moreGlyphDot} />
      <View style={styles.moreGlyphDot} />
    </View>
  );
}

function PauseGlyph(): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.pauseGlyph} testID="pause-glyph">
      <View style={styles.pauseGlyphBar} />
      <View style={styles.pauseGlyphBar} />
    </View>
  );
}

function PlayGlyph(): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.playGlyph} testID="play-glyph" />
  );
}

function ChevronGlyph({
  direction
}: {
  direction: "down" | "left" | "right" | "up";
}): React.JSX.Element {
  const styles = useStyles();
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
  const styles = useStyles();
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
  const styles = useStyles();
  const appTheme = useTheme();
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
      <Icon color={appTheme.colors.text.tertiary} name="chevronDown" size={15} testID="chevron-down-glyph" weight="semibold" />
    </Animated.View>
  );
}

function FlipGlyph(): React.JSX.Element {
  const styles = useStyles();
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
  const styles = useStyles();
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
  appearance,
  applicationMetadata,
  arrowDuelOpponentReplyGlobalSetting,
  captureBottomInset,
  feedbackIssuesOpener,
  progressProtection,
  onOpenDiagnostics,
  onOpenNotificationSettings,
  onOpenWhatsNew,
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
  onAppearanceChange,
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
  onOpenWhatsNew: () => void;
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
  appearance: AppearancePreference;
  moveFeedbackPreferences: MoveFeedbackPreferences;
  moveFeedbackPreviewer?: MoveFeedbackPreviewer;
  notificationPermissionStatus: ReviewReminderPermissionStatus;
  onAppearanceChange: (appearance: AppearancePreference) => void;
  onMoveFeedbackPreferencesChange: (preferences: MoveFeedbackPreferences) => void;
  reminderPlatform: MobilePlatformCapabilities["reminders"]["platform"];
  ratings: Array<{ label: string; record: RatingRecord }>;
  reviewReminderScheduleStatus: string;
  reviewReminderPreference: ReviewReminderPreference;
  showSprintGuideReset: boolean;
  showRatingControls: boolean;
  standardRating: number;
}): React.JSX.Element {
  const styles = useStyles();
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
          <SettingsSegmentedRow
            accessibilityLabel="Progress Sync"
            options={[
              { value: "on", label: "On", testID: "settings-icloud-sync-on" },
              { value: "off", label: "Off", testID: "settings-icloud-sync-off" }
            ]}
            testID="settings-icloud-sync-controls"
            value={iCloudSyncEnabled ? "on" : "off"}
            onChange={(next) => {
              onSaveICloudSyncEnabled(next === "on");
              setStatusMessage(next === "on" ? "iCloud sync enabled" : "iCloud sync disabled");
            }}
          />
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
              ? "After a correct arrow choice, we play the other move so you can find the opponent’s best reply. New Survival Runs use this setting with no reply timer; paused sessions keep their existing rule. Other Runs follow the reply choice and time saved in Edit Run, and their timers pause during the reply."
              : "New Arrow Duel play checks only your arrow choice, including Survival. A correct choice completes the puzzle; a wrong choice enters Review. Paused sessions keep their existing rule. Turning this back on restores each saved Run’s reply choice and time."}
            testID="settings-arrow-duel-opponent-reply"
          />
          <SettingsSegmentedRow
            accessibilityLabel="Find the opponent’s best reply"
            options={[
              { value: "on", label: "On", testID: "settings-arrow-duel-opponent-reply-on" },
              { value: "off", label: "Off", testID: "settings-arrow-duel-opponent-reply-off" }
            ]}
            testID="settings-arrow-duel-opponent-reply-controls"
            value={arrowDuelOpponentReplyGlobalSetting.enabled ? "on" : "off"}
            onChange={(next) => {
              arrowDuelOpponentReplyGlobalSetting.onChange(next === "on");
              setStatusMessage(next === "on"
                ? "Opponent replies are available, including in Survival"
                : "Arrow Duel now checks only your arrow choice");
            }}
          />
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
        <SettingsSegmentedRow
          accessibilityLabel="Review Reminders"
          options={[
            { value: "smart", label: "Smart", testID: "settings-review-reminder-smart" },
            { value: "fixed-1900", label: "19:00", testID: "settings-review-reminder-fixed-1900" },
            { value: "off", label: "Off", testID: "settings-review-reminder-off" }
          ]}
          testID="settings-review-reminder-preferences"
          value={reviewReminderPreference.mode === "smart"
            ? "smart"
            : reviewReminderPreference.mode === "off"
              ? "off"
              : reviewReminderPreference.fixedLocalTime === "19:00" ? "fixed-1900" : "other"}
          onChange={(next) => {
            if (next === "smart") {
              onSaveReviewReminderPreference({ mode: "smart" });
            } else if (next === "fixed-1900") {
              onSaveReviewReminderPreference({ mode: "fixed", fixedLocalTime: "19:00" });
            } else if (next === "off") {
              onSaveReviewReminderPreference({ mode: "off" });
            }
          }}
        />
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

      <SettingsSection
        title="Appearance"
        testID="settings-appearance-section"
        wide={adaptiveLayout.usesWideContent}
      >
        <SettingsSegmentedRow
          accessibilityLabel="Appearance"
          options={[
            { value: "system", label: "System", testID: "settings-appearance-system" },
            { value: "light", label: "Light", testID: "settings-appearance-light" },
            { value: "dark", label: "Dark", testID: "settings-appearance-dark" }
          ]}
          testID="settings-appearance-options"
          value={appearance}
          onChange={onAppearanceChange}
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
          <View style={styles.settingsBlock} testID="settings-guidance-reset-card">
            <View style={styles.settingsRowCopy}>
              <AppText variant="body">Replay practice guides</AppText>
              <AppText tone="secondary" variant="footnote">
                Reset the Sprint rules, active-session, and Arrow Duel guides so they appear again when each applies. Runs, ratings, and History stay unchanged.
              </AppText>
            </View>
            <Button
              accessibilityLabel={sprintGuideReady ? "Practice guides reset" : "Reset practice guides"}
              disabled={sprintGuideReady}
              icon={sprintGuideReady ? "check" : "restore"}
              label={sprintGuideReady ? "Guides reset" : "Reset guides"}
              size="compact"
              testID="settings-show-sprint-guide"
              variant="secondary"
              onPress={() => {
                onResetSprintGuides();
                setSprintGuideReady(true);
              }}
            />
          </View>
          {sprintGuideReady ? (
            <View
              accessibilityLiveRegion="polite"
              style={styles.settingsBlock}
              testID="settings-sprint-guide-ready"
            >
              <AppText tone="positive" variant="footnote">
                Guides reset. Each guide will replay the next time it applies.
              </AppText>
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
          label={WHATS_NEW_SETTINGS_LABEL}
          testID="settings-whats-new"
          onPress={onOpenWhatsNew}
        />
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

      {statusMessage ? (
        <AppText style={styles.settingsStatusText} testID="settings-status-message" tone="secondary" variant="footnote">
          {statusMessage}
        </AppText>
      ) : null}
      {onOpenDiagnostics ? (
        <Button
          accessibilityLabel="Open Stockfish diagnostics"
          label="Stockfish Diagnostics"
          size="compact"
          testID="settings-stockfish-diagnostics"
          variant="secondary"
          onPress={onOpenDiagnostics}
        />
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
  const styles = useStyles();
  const appTheme = useTheme();
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
      title="Help & Feedback"
      testID="settings-feedback-section"
      wide={wide}
    >
      <View style={styles.settingsBlock}>
        <View style={styles.feedbackSupportHeader}>
          <IconTile name="help" />
          <View style={styles.settingsRowCopy}>
            <AppText variant="headline">Help improve Chessticize</AppText>
            <AppText tone="secondary" variant="subheadline">
              Report a bug, request a feature, or see whether someone has already raised it.
            </AppText>
          </View>
        </View>
        <View style={styles.settingsRowCopy}>
          <AppText style={styles.settingsEmphasis} variant="footnote">Your data stays in the app</AppText>
          <AppText tone="secondary" variant="footnote">
            GitHub opens in your browser. Ratings, history, and puzzle data are not attached.
          </AppText>
        </View>
        <Button
          accessibilityLabel="Open GitHub Issues in browser"
          icon="external"
          label="Open GitHub Issues"
          stretch
          testID="settings-feedback-open-github"
          variant="secondary"
          onPress={() => {
            setHandoffError(null);
            setConfirmationVisible(true);
          }}
        />
        <AppText style={styles.settingsCaptionCentered} tone="secondary" variant="footnote">
          You will review and submit your issue on GitHub.
        </AppText>
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
          <SafeAreaModalBackdrop style={styles.accessibleMoveModalBackdrop}>
            <View
              accessibilityViewIsModal
              style={styles.feedbackHandoffConfirmation}
              testID="settings-feedback-handoff-confirmation"
            >
              <Badge label="EXTERNAL BROWSER" tone="accent" />
              <AppText variant="title">Continue to GitHub?</AppText>
              <AppText variant="body">
                A new issue will open on github.com in your default browser. Chessticize does not attach your account, rating, history, or puzzle data.
              </AppText>
              <View style={styles.settingsRowCopy}>
                <AppText style={styles.settingsEmphasis} variant="footnote">You stay in control</AppText>
                <AppText tone="secondary" variant="footnote">
                  Review what you share and submit it on GitHub. This is not an in-app submission.
                </AppText>
              </View>
              {handoffError ? (
                <AppText testID="settings-feedback-handoff-error" tone="negative" variant="footnote">
                  {handoffError}
                </AppText>
              ) : null}
              <View style={styles.feedbackHandoffActions}>
                <Button
                  accessibilityLabel="Stay in Settings"
                  label="Not now"
                  stretch
                  testID="settings-feedback-handoff-cancel"
                  variant="secondary"
                  onPress={closeConfirmation}
                />
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Continue to GitHub Issues"
                  style={({ pressed }) => [
                    styles.feedbackHandoffContinueButton,
                    pressed ? styles.settingsActionButtonPressed : null
                  ]}
                  testID="settings-feedback-handoff-continue"
                  onPress={() => {
                    void continueToGitHub();
                  }}
                >
                  <Icon color={appTheme.colors.text.onAccent} name="external" size={17} weight="semibold" />
                  <AppText tone="onAccent" variant="headline">Continue to GitHub</AppText>
                </Pressable>
              </View>
            </View>
          </SafeAreaModalBackdrop>
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
  const styles = useStyles();
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

function SettingsSegmentedRow<T extends string>({
  accessibilityLabel,
  options,
  testID,
  value,
  onChange
}: {
  accessibilityLabel: string;
  options: ReadonlyArray<{ value: T; label: string; testID: string }>;
  testID: string;
  value: T;
  onChange: (next: T) => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.settingsControlRow}>
      <SegmentedControl
        accessibilityLabel={accessibilityLabel}
        options={options}
        testID={testID}
        value={value}
        onChange={onChange}
      />
    </View>
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
  return <SettingsRow detail={detail} label={label} testID={testID} tint="accent" onPress={onPress} />;
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
  const styles = useStyles();
  const appTheme = useTheme();
  return (
    <View style={styles.settingsActionButtonRow}>
      <AppText style={styles.settingsActionButtonDetail} testID={`${testID}-detail`} tone="secondary" variant="footnote">
        {detail}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={loading ? "Syncing progress" : label}
        accessibilityState={{ busy: loading, disabled: loading }}
        disabled={loading}
        testID={testID}
        style={({ pressed }) => [
          styles.settingsActionButton,
          pressed && !loading ? styles.settingsActionButtonPressed : null,
          loading ? styles.settingsActionButtonDisabled : null
        ]}
        onPress={onPress}
      >
        {loading ? (
          <ActivityIndicator
            color={appTheme.colors.text.onAccent}
            size="small"
            testID={`${testID}-spinner`}
          />
        ) : null}
        <AppText style={styles.settingsActionButtonText} testID={`${testID}-label`} tone="onAccent" variant="headline">
          {loading ? "Syncing…" : label}
        </AppText>
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
  const styles = useStyles();
  return (
    <View style={styles.advancedRatingsPanel} testID="settings-advanced-ratings-panel">
      <View style={styles.settingsRowCopy}>
        <AppText variant="headline">Difficulty controls</AppText>
        <AppText tone="secondary" variant="footnote">
          Each rating helps Chessticize choose the right puzzle difficulty.
        </AppText>
      </View>
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
  const styles = useStyles();
  const appTheme = useTheme();
  const decrementDisabled = record.rating <= RATING_FLOOR;
  return (
    <View style={styles.advancedRatingRow} testID={testID}>
      <View style={styles.advancedRatingCopy}>
        <AppText variant="body">{label}</AppText>
        <AppText tone="secondary" variant="footnote">{advancedRatingBucketLabel(label, record.key)}</AppText>
      </View>
      <View style={styles.advancedRatingControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label} rating`}
          accessibilityState={{ disabled: decrementDisabled }}
          disabled={decrementDisabled}
          testID={`${testID}-decrease`}
          style={({ pressed }) => [
            styles.settingsStepperButton,
            pressed && !decrementDisabled ? styles.settingsActionButtonPressed : null,
            decrementDisabled ? styles.disabledButton : null
          ]}
          onPress={() => onAdjust(record.key, stepManualRating(record.rating, -1))}
        >
          <Icon color={appTheme.colors.accent.s600} name="remove" size={18} weight="semibold" />
        </Pressable>
        <AppText style={styles.advancedRatingValue} testID={`${testID}-value`} variant="body">Rating {record.rating}</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label} rating`}
          testID={`${testID}-increase`}
          style={({ pressed }) => [styles.settingsStepperButton, pressed ? styles.settingsActionButtonPressed : null]}
          onPress={() => onAdjust(record.key, stepManualRating(record.rating, 1))}
        >
          <Icon color={appTheme.colors.accent.s600} name="add" size={18} weight="semibold" />
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
  const styles = useStyles();
  return (
    <Section
      header={title}
      rows
      style={wide ? styles.settingsSectionWide : null}
      surfaceStyle={cardStyle}
      testID={testID}
    >
      {children}
    </Section>
  );
}

function SettingsRow({
  destructive = false,
  detail,
  label,
  onPress,
  showDetail = true,
  testID,
  tint,
  value
}: {
  destructive?: boolean;
  detail?: string;
  label: string;
  onPress?: () => void;
  showDetail?: boolean;
  testID: string;
  tint?: "accent";
  value?: string;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const accessibilityLabel = [label, value, detail].filter(Boolean).join(", ");
  return (
    <Pressable
      accessible
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => [rowStyle, styles.settingsRow, onPress && pressed ? styles.settingsRowPressed : null]}
      onPress={onPress}
    >
      <View style={styles.settingsRowCopy}>
        <View style={styles.settingsRowTitleLine}>
          <AppText
            tone={tint === "accent" ? "accent" : undefined}
            style={[styles.settingsRowLabel, destructive ? styles.settingsDestructiveText : null]}
            variant="body"
          >
            {label}
          </AppText>
          {value ? <AppText style={styles.settingsRowValue} tone="secondary" variant="body">{value}</AppText> : null}
        </View>
        {detail && showDetail ? <AppText tone="secondary" variant="footnote">{detail}</AppText> : null}
        {detail && !showDetail ? (
          <View
            accessibilityLabel={detail}
            testID={`${testID}-detail`}
          />
        ) : null}
      </View>
      {onPress ? (
        <Icon color={appTheme.colors.text.tertiary} name="chevronRight" size={15} testID="chevron-right-glyph" weight="semibold" />
      ) : null}
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
  const styles = useStyles();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const accessibilityLabel = [label, value, detail, linkLabel].join(", ");
  return (
    <Pressable
      accessible
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => [rowStyle, styles.settingsRow, pressed ? styles.settingsRowPressed : null]}
      onPress={onPress}
    >
      <View style={styles.settingsRowCopy}>
        <View style={styles.settingsRowTitleLine}>
          <AppText style={styles.settingsRowLabel} variant="body">{label}</AppText>
          <AppText style={styles.settingsRowValue} tone="secondary" variant="body">{value}</AppText>
        </View>
        <AppText tone="secondary" variant="footnote">{detail}</AppText>
        <AppText tone="accent" variant="footnote">{linkLabel}</AppText>
      </View>
      <Icon color={appTheme.colors.text.tertiary} name="external" size={15} weight="semibold" />
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
  const styles = useStyles();
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
  const styles = useStyles();
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
  const styles = useStyles();
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
  const styles = useStyles();
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
  const styles = useStyles();
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
  const styles = useStyles();
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
  const styles = useStyles();
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
  const styles = useStyles();
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
  const styles = useStyles();
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
  practiceHome: {
    gap: theme.spacing.section
  },
  practiceHomeColumns: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: theme.spacing.section
  },
  practiceHomeStack: {
    flexDirection: "column",
    gap: theme.spacing.section
  },
  practiceHomePrimaryColumn: {
    gap: theme.spacing.group,
    minWidth: 0
  },
  practiceHomePrimaryColumnWide: {
    flexBasis: 0,
    flexGrow: 1.1,
    flexShrink: 1,
    width: "auto"
  },
  practiceHomeSecondaryColumn: {
    gap: theme.spacing.section,
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
  // Practice Home on the direction A primitives (#609).
  titleLarge: {
    ...theme.typography.largeTitle,
    color: theme.colors.text.primary
  },
  homeStartHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.row,
    justifyContent: "space-between",
    minHeight: theme.metrics.minTarget,
    paddingLeft: 4
  },
  homeStartTitle: {
    flexShrink: 1
  },
  homeRunPanel: {
    gap: theme.spacing.group
  },
  homeHelperText: {
    paddingHorizontal: 4
  },
  homeRowGroup: {
    gap: 0
  },
  homeRow: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    flexDirection: "row",
    gap: theme.spacing.row,
    minHeight: theme.metrics.rowMinHeight,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  homeRowTop: {
    borderTopLeftRadius: theme.shape.card,
    borderTopRightRadius: theme.shape.card
  },
  homeRowBottom: {
    borderBottomLeftRadius: theme.shape.card,
    borderBottomRightRadius: theme.shape.card
  },
  homeRowSeparator: {
    backgroundColor: theme.colors.border.default,
    height: StyleSheet.hairlineWidth,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  homeRowPressed: {
    backgroundColor: theme.colors.surfaceStrong
  },
  homeRowEditing: {
    flexWrap: "wrap"
  },
  homeRowDragging: {
    borderRadius: theme.shape.card,
    elevation: 6,
    shadowColor: theme.colors.shadow,
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: theme.name === "dark" ? 0.5 : 0.16,
    shadowRadius: 16,
    zIndex: 20
  },
  homeRowSelectArea: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: theme.spacing.row,
    minHeight: theme.metrics.minTarget,
    minWidth: 0
  },
  homeRowCopy: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  homeRowMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline
  },
  homeRowEditingMeta: {
    justifyContent: "space-between",
    paddingBottom: 2,
    paddingLeft: theme.metrics.iconTile + theme.spacing.row,
    width: "100%"
  },
  // Ratings form one right-aligned, muted column; selection is shown by the
  // row tint, so no trailing check shifts a selected rating.
  homeRowRating: {
    textAlign: "right"
  },
  homeRowSelected: {
    backgroundColor: theme.colors.accent.s100
  },
  homeRowIconButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s100,
    borderRadius: theme.shape.control,
    justifyContent: "center",
    minHeight: theme.metrics.minTarget,
    minWidth: theme.metrics.minTarget
  },
  homeRowIconButtonDisabled: {
    opacity: 0.4
  },
  homeRowRemoveButton: {
    backgroundColor: theme.colors.danger.s100
  },
  homeRemovalConfirmation: {
    backgroundColor: theme.colors.surface,
    borderTopColor: theme.colors.border.default,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.row,
    paddingHorizontal: 16,
    paddingVertical: theme.spacing.row
  },
  homeRemovalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.group,
    justifyContent: "flex-end"
  },
  homeProgressMetrics: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 16
  },
  // Labels stretch to the column rather than shrink-wrapping their text: see
  // "Text width rounding" in docs/ui-design/MOBILE_UI_DESIGN.md (#633).
  homeProgressMetric: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  homeProgressText: {
    textAlign: "center"
  },
  homeProgressValue: {
    fontSize: 28,
    lineHeight: 34
  },
  homeProgressDivider: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.border.default,
    width: StyleSheet.hairlineWidth
  },
  homeToneNegative: {
    color: theme.colors.danger.s600
  },
  homeTonePositive: {
    color: theme.colors.positive.s600
  },
  homeToneNeutral: {
    color: theme.colors.text.tertiary
  },
  // Plain buttons carry their own 8-pt padding, so the toolbar adds no gaps;
  // this keeps the link and actions on one line in a phone-landscape column.
  runManagementToolbar: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between"
  },
  runManagementToolbarActions: {
    alignItems: "center",
    flexDirection: "row",
    marginLeft: "auto"
  },
  sprintRulesGuide: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.card,
    gap: theme.spacing.row,
    padding: 16
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
    ...theme.typography.footnote,
    color: theme.colors.accent.s600,
    fontWeight: theme.typography.headline.fontWeight,
    letterSpacing: 0.4
  },
  sprintRulesGuideTitle: {
    ...theme.typography.title,
    color: theme.colors.text.primary
  },
  sprintRulesDismissButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.fill,
    borderRadius: theme.shape.control,
    justifyContent: "center",
    minHeight: theme.metrics.minTarget,
    paddingHorizontal: 16
  },
  sprintRulesDismissText: {
    ...theme.typography.headline,
    color: theme.colors.text.onAccent
  },
  sprintRulesList: {
    gap: theme.spacing.row
  },
  sprintRuleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: theme.spacing.row,
    minHeight: theme.metrics.minTarget
  },
  sprintRuleRowStacked: {
    flexDirection: "column",
    gap: theme.spacing.inline
  },
  sprintRuleBadge: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s100,
    borderRadius: theme.shape.tile,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: 8
  },
  sprintRuleBadgeDanger: {
    backgroundColor: theme.colors.danger.s100
  },
  sprintRuleBadgeWarning: {
    backgroundColor: theme.colors.warning.s100
  },
  sprintRuleBadgeText: {
    ...theme.typography.footnote,
    color: theme.colors.accent.s600,
    fontFamily: theme.fontFamily.mono,
    fontWeight: theme.typography.headline.fontWeight
  },
  sprintRuleBadgeTextDanger: {
    color: theme.colors.danger.s600
  },
  sprintRuleBadgeTextWarning: {
    color: theme.colors.warning.s600
  },
  sprintRuleCopy: {
    alignSelf: "stretch",
    flexGrow: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  sprintRuleLabel: {
    ...theme.typography.subheadline,
    color: theme.colors.text.primary,
    fontWeight: theme.typography.headline.fontWeight
  },
  sprintRuleDetail: {
    ...theme.typography.footnote,
    color: theme.colors.text.tertiary
  },
  sprintRulesGuideFootnote: {
    ...theme.typography.footnote,
    borderTopColor: theme.colors.border.default,
    borderTopWidth: StyleSheet.hairlineWidth,
    color: theme.colors.text.tertiary,
    paddingTop: theme.spacing.row
  },
  runNotice: {
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s300,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  runNoticeText: {
    color: theme.colors.accent.s700,
    fontSize: 12,
    fontWeight: "700"
  },
  runCardNativeDragging: {
    elevation: 8,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    zIndex: 20
  },
  runInsertionOutline: {
    backgroundColor: theme.colors.accent.dropZone,
    borderColor: theme.colors.accent.s600,
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 2,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 15
  },
  runEditActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  runEditorIntro: {
    gap: 2,
    paddingHorizontal: 4
  },
  sprintPassRulesHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row,
    justifyContent: "space-between"
  },
  sprintPassRulesTarget: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s100,
    borderRadius: theme.shape.control,
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  sprintPassRulesTargetLabel: {
    backgroundColor: theme.colors.accent.s100,
    fontWeight: theme.typography.headline.fontWeight
  },
  runNameRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16
  },
  // No wrap: in a wrapping column, stretch would size the field to its line.
  runNameRowStacked: {
    alignItems: "stretch",
    flexDirection: "column",
    flexWrap: "nowrap",
    gap: theme.spacing.inline
  },
  runNameInputStacked: {
    flex: 0,
    marginLeft: 0,
    maxWidth: "100%",
    minWidth: 0
  },
  runNameCopy: {
    flexShrink: 0,
    gap: 2
  },
  runNameInput: {
    backgroundColor: theme.colors.surfaceStrong,
    borderColor: "transparent",
    borderRadius: theme.shape.control,
    borderWidth: 1,
    color: theme.colors.text.primary,
    flex: 1,
    fontSize: theme.typography.body.fontSize,
    marginLeft: "auto",
    maxWidth: 200,
    minHeight: 40,
    minWidth: 160,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  runEloInputShell: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderColor: "transparent",
    borderRadius: theme.shape.control,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 40,
    overflow: "hidden",
    width: 72
  },
  runEloInput: {
    color: theme.colors.text.primary,
    flex: 1,
    fontSize: theme.typography.body.fontSize,
    fontVariant: ["tabular-nums"],
    fontWeight: theme.typography.headline.fontWeight,
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
    gap: 6,
    marginLeft: "auto"
  },
  sectionHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
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
  historyHeaderActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.inline,
    justifyContent: "flex-end",
    marginLeft: "auto"
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
  screenTitle: {
    color: theme.colors.text.ink,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28
  },
  sectionLabel: {
    color: theme.colors.text.ink,
    fontSize: 15,
    fontWeight: "800"
  },
  practiceModeDetailProbe: {
    height: 0,
    opacity: 0,
    overflow: "hidden",
    width: 0
  },
  pausedSessionPanel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.strong,
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
  moveSideKingGlyph: {
    overflow: "hidden",
    position: "relative"
  },
  moveSideKingSprite: {
    position: "absolute"
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
    backgroundColor: theme.colors.positive.s600
  },
  sessionScoreDotNegative: {
    backgroundColor: theme.colors.danger.s600
  },
  sessionScoreDotNeutral: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.heavy,
    borderWidth: 1.5
  },
  sessionScoreGlyphLine: {
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.colors.text.tertiary,
    borderRadius: 999,
    height: 2.25,
    width: 8
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
  // Run editor and custom setup rows (#609 direction A, increment 3b).
  sprintHeaderSideSlotTrailing: {
    alignItems: "flex-end"
  },
  sprintHeaderCloseButton: {
    alignItems: "center",
    borderRadius: theme.shape.capsule,
    height: theme.metrics.minTarget,
    justifyContent: "center",
    width: theme.metrics.minTarget
  },
  sprintHeaderCloseButtonPressed: {
    backgroundColor: theme.colors.surfaceStrong
  },
  sprintPassRulesTargetText: {
    backgroundColor: theme.colors.accent.s100
  },
  // A row holding a field line and an error below it.
  editorFieldStack: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: 6
  },
  // Editor rows keep the copy and its control on one line; with large text
  // they stack, the copy spanning the row and the control trailing below it.
  editorInlineRow: {
    justifyContent: "space-between"
  },
  editorInlineLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row
  },
  editorInlineCopy: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  editorInlineControls: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: theme.spacing.inline
  },
  editorStackedLine: {
    alignItems: "flex-end",
    flexDirection: "column",
    gap: theme.spacing.inline
  },
  editorStackedCopy: {
    alignSelf: "stretch",
    gap: 2
  },
  editorStackedControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline
  },
  editorRowLabel: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  editorRowPressed: {
    backgroundColor: theme.colors.surfaceStrong
  },
  editorInputError: {
    borderColor: theme.colors.danger.s600
  },
  editorCellSeparator: {
    backgroundColor: theme.colors.border.default,
    height: StyleSheet.hairlineWidth
  },
  customModeLabel: {
    flexShrink: 0
  },
  customStepperButtonPressed: {
    backgroundColor: theme.colors.fillMuted
  },
  customMiniChipPressed: {
    opacity: 0.7
  },
  previousConfigHeader: {
    paddingHorizontal: 4
  },
  customSetupPanel: {
    alignSelf: "center",
    gap: theme.spacing.section,
    maxWidth: 760,
    width: "100%"
  },
  sprintScreenHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline,
    justifyContent: "space-between",
    minHeight: theme.metrics.minTarget
  },
  sprintHeaderSideSlot: {
    alignItems: "flex-start",
    minWidth: 72
  },
  sprintScreenTitle: {
    flex: 1,
    textAlign: "center"
  },
  sprintScreenTitleLeading: {
    textAlign: "left"
  },
  runTimingSectionCopy: {
    gap: 2,
    paddingHorizontal: 4
  },
  arrowDuelReplySecondsInputShell: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderColor: "transparent",
    borderRadius: theme.shape.control,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 38,
    overflow: "hidden",
    width: 64
  },
  arrowDuelReplySecondsInput: {
    color: theme.colors.text.primary,
    flex: 1,
    fontSize: theme.typography.body.fontSize,
    fontVariant: ["tabular-nums"],
    fontWeight: theme.typography.headline.fontWeight,
    minHeight: 38,
    minWidth: 54,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: "center"
  },
  runTimingStepper: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  runTimingControlDisabled: {
    opacity: 0.38
  },
  runTimingValue: {
    minWidth: 44,
    textAlign: "center"
  },
  runTimingToggle: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: theme.metrics.minTarget
  },
  customStepperCompact: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline
  },
  customStepperButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 36
  },
  customConfigValue: {
    flexShrink: 1,
    marginLeft: "auto",
    textAlign: "right"
  },
  customInlineOptions: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.inline,
    justifyContent: "flex-end"
  },
  customThemeRow: {
    justifyContent: "center"
  },
  customThemeOptions: {
    justifyContent: "center"
  },
  customMiniChip: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.capsule,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 6
  },
  customMiniChipActive: {
    backgroundColor: theme.colors.accent.s100
  },
  customMiniChipText: {
    textAlign: "center"
  },
  customMiniChipTextActive: {
    fontWeight: theme.typography.headline.fontWeight
  },
  themeCatalogSection: {
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.inline,
    paddingHorizontal: 16,
    paddingVertical: 4
  },
  themeCatalogHeadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row,
    minHeight: theme.metrics.rowMinHeight - 8
  },
  themeCatalogExpandableContent: {
    gap: 12,
    paddingBottom: 12
  },
  themeCatalogGroup: {
    gap: 6
  },
  themeCatalogGroupLabel: {
    color: theme.colors.text.tertiary,
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
    gap: 16
  },
  themeCatalogGroupCard: {
    gap: theme.spacing.inline
  },
  themeCatalogGroupOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.inline
  },
  previousConfigList: {
    gap: theme.spacing.group
  },
  previousConfigRating: {
    alignItems: "flex-end",
    minWidth: 48
  },
  testPanel: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
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
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "30%",
    flexGrow: 1,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  optionButtonActive: {
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s600
  },
  optionButtonText: {
    color: theme.colors.text.strong,
    fontSize: 12,
    fontWeight: "800"
  },
  optionButtonTextActive: {
    color: theme.colors.accent.s700
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
  primarySmallButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.fill,
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  primarySmallButtonText: {
    color: theme.colors.text.onAccent,
    fontSize: 12,
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
  listPanel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    gap: 8
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
    color: theme.colors.text.secondary,
    fontFamily: "Menlo",
    fontSize: 11,
    lineHeight: 16
  },
  diagnosticPvPanel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 10
  },
  diagnosticPvText: {
    color: theme.colors.text.strong,
    fontFamily: "Menlo",
    fontSize: 11,
    lineHeight: 16
  },
  diagnosticLogPanel: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 10
  },
  diagnosticLogText: {
    color: theme.colors.text.strong,
    fontFamily: "Menlo",
    fontSize: 10,
    lineHeight: 14
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
  simulationNotice: {
    color: theme.colors.warning.s600,
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
  historyFootnote: {
    paddingHorizontal: 4
  },
  toolbarIconButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.capsule,
    height: theme.metrics.minTarget,
    justifyContent: "center",
    width: theme.metrics.minTarget
  },
  toolbarIconButtonActive: {
    backgroundColor: theme.colors.accent.s100
  },
  filterButtonPressed: {
    opacity: 0.7
  },
  groupedList: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.card,
    overflow: "hidden"
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
  attemptRowIdentity: {
    flexDirection: "row",
    minWidth: 0
  },
  attemptRowIdentityId: {
    flexShrink: 1
  },
  attemptRowIdentityRating: {
    flexShrink: 0
  },
  attemptRowTrailingBadges: {
    alignItems: "flex-end",
    alignSelf: "center",
    flexShrink: 0,
    gap: 4
  },
  attemptRowChevron: {
    alignSelf: "center"
  },
  attemptStatusTile: {
    alignItems: "center",
    borderRadius: theme.shape.tile,
    height: theme.metrics.iconTile,
    justifyContent: "center",
    width: theme.metrics.iconTile
  },
  attemptStatusTileCorrect: {
    backgroundColor: theme.colors.positive.s100
  },
  attemptStatusTileWrong: {
    backgroundColor: theme.colors.danger.s100
  },
  attemptStatusTileNeutral: {
    backgroundColor: theme.colors.surfaceStrong
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
  historyTopFilterStack: {
    gap: theme.spacing.group
  },
  historyAttentionFilter: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.capsule,
    flexDirection: "row",
    padding: 3
  },
  historyAttentionOption: {
    alignItems: "center",
    borderRadius: theme.shape.capsule,
    flex: 1,
    justifyContent: "center",
    minHeight: theme.metrics.minTarget - 6,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  historyAttentionOptionActive: {
    backgroundColor: theme.name === "dark" ? theme.colors.fillMuted : theme.colors.surface,
    ...theme.elevation.low,
    shadowOpacity: theme.name === "dark" ? 0 : 0.12
  },
  historyAttentionOptionText: {
    ...theme.typography.subheadline,
    color: theme.colors.text.primary,
    textAlign: "center"
  },
  historyAttentionOptionTextActive: {
    fontWeight: theme.typography.headline.fontWeight
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
  historyToggleTrack: {
    backgroundColor: theme.colors.fillMuted,
    borderRadius: 15.5,
    height: 31,
    padding: 2,
    width: 51
  },
  historyToggleTrackActive: {
    backgroundColor: theme.colors.accent.fill
  },
  historyToggleThumb: {
    backgroundColor: theme.colors.thumb,
    borderRadius: 13.5,
    height: 27,
    width: 27,
    ...theme.elevation.low
  },
  historyToggleThumbActive: {
    transform: [{ translateX: 20 }]
  },
  historyAdvancedFilters: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.card,
    gap: theme.spacing.row,
    padding: 16
  },
  historyFilterGroup: {
    gap: 6
  },
  historyFilterGroupLabel: {
    fontWeight: theme.typography.headline.fontWeight
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
  historyThemeAllRow: {
    alignItems: "flex-start"
  },
  historyPerformanceCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.card,
    gap: theme.spacing.row,
    padding: 16
  },
  historyPerformanceHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row,
    justifyContent: "space-between"
  },
  historyMetricSummary: {
    alignItems: "flex-end"
  },
  historyAccuracy: {
    color: theme.colors.text.primary
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
  historyChartEmpty: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.default,
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
    backgroundColor: theme.colors.accent.fill,
    borderRadius: 4,
    minHeight: 4
  },
  historyLineChart: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    height: 76,
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingVertical: 8,
    position: "relative"
  },
  historyLineGrid: {
    backgroundColor: theme.colors.surfaceStrong,
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
    backgroundColor: theme.colors.accent.fill,
    borderRadius: 999,
    height: 2,
    opacity: 0.82,
    position: "absolute"
  },
  historyLineSelectionGuide: {
    backgroundColor: theme.colors.accent.s300,
    bottom: 0,
    position: "absolute",
    top: 0,
    width: StyleSheet.hairlineWidth
  },
  historyLineSelectionPoint: {
    backgroundColor: theme.colors.accent.fill,
    borderColor: theme.colors.surface,
    borderRadius: 999,
    borderWidth: 2,
    height: 10,
    marginLeft: -5,
    marginTop: -5,
    position: "absolute",
    width: 10
  },
  historyLineTooltip: {
    backgroundColor: theme.colors.surfaceInverse,
    borderRadius: 7,
    minHeight: HISTORY_LINE_TOOLTIP_HEIGHT,
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: "absolute",
    width: HISTORY_LINE_TOOLTIP_WIDTH
  },
  historyLineTooltipRating: {
    color: theme.colors.text.onTone,
    fontSize: 12,
    fontWeight: "800"
  },
  historyLineTooltipDate: {
    color: theme.colors.fillMuted,
    fontSize: 9,
    fontWeight: "600"
  },
  // The advanced-filter surface pads its content by 16; scrolling chip rows
  // extend to its edges so chips are not cut off square at the padding.
  historyChipScroller: {
    marginHorizontal: -16
  },
  historyChipScrollerContent: {
    paddingHorizontal: 16
  },
  historyChipContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline,
    paddingVertical: 4
  },
  historyActiveFilterChip: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  historyActiveFilterText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: "800"
  },
  historyCompactFilterSummary: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 4
  },
  historyCompactFilterLabel: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.capsule,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  historyCompactFilterText: {
    ...theme.typography.footnote,
    color: theme.colors.text.secondary
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
  themeTagRailFadeFrame: {
    minWidth: 0,
    position: "relative"
  },
  themeTagRailFade: {
    bottom: 0,
    flexDirection: "row",
    position: "absolute",
    right: 0,
    top: 0,
    width: 24
  },
  themeTagRailFadeStep: {
    backgroundColor: theme.colors.surface,
    flex: 1
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
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.capsule,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  historyThemeChipText: {
    ...theme.typography.caption,
    color: theme.colors.text.secondary,
    fontWeight: theme.typography.headline.fontWeight
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
  historyRowTitle: {
    color: theme.colors.text.heading,
    fontSize: 13,
    fontWeight: "800"
  },
  historyPageRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: 4
  },
  settingsPanel: {
    gap: theme.spacing.section
  },
  settingsPanelWide: {
    alignSelf: "center",
    columnGap: theme.spacing.screen,
    flexDirection: "row",
    flexWrap: "wrap",
    maxWidth: 980,
    width: "100%"
  },
  settingsSectionWide: {
    flexBasis: "48%",
    flexGrow: 1,
    minWidth: 300
  },
  // Still used by the run timing editor and packs panel, which have not moved
  // to the ui/ primitives yet.
  settingsSection: {
    gap: 8
  },
  settingsSectionCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden"
  },
  settingsBlock: {
    gap: theme.spacing.row,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  settingsControlRow: {
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  settingsCaptionCentered: {
    textAlign: "center"
  },
  settingsEmphasis: {
    color: theme.colors.text.primary,
    fontWeight: theme.typography.headline.fontWeight
  },
  feedbackSupportHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row
  },
  feedbackHandoffConfirmation: {
    backgroundColor: theme.colors.surfaceRaised,
    // Dark surfaceRaised matches the dimmed Home, so the card needs an edge.
    borderColor: theme.colors.border.default,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: theme.shape.sheet,
    gap: theme.spacing.row,
    maxWidth: 430,
    padding: 24,
    width: "100%"
  },
  startConflictCard: {
    flexGrow: 0,
    flexShrink: 1
  },
  startConflictContent: {
    gap: theme.spacing.row
  },
  feedbackHandoffActions: {
    gap: theme.spacing.group,
    marginTop: 4
  },
  feedbackHandoffContinueButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: theme.colors.accent.fill,
    borderRadius: theme.shape.control,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 20,
    paddingVertical: 12
  },
  settingsRow: {
    justifyContent: "space-between"
  },
  settingsRowPressed: {
    backgroundColor: theme.colors.surfaceStrong
  },
  settingsRowCopy: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  // Label and value share the first line; an explanation spans the full row
  // below them so long copy never runs in a narrow column.
  // When label and value do not fit side by side (large text, long values),
  // the value moves to its own line at the trailing edge instead of being
  // squeezed until it breaks mid-word.
  settingsRowTitleLine: {
    alignItems: "flex-start",
    columnGap: theme.spacing.row,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 2
  },
  settingsRowLabel: {
    flexShrink: 1
  },
  settingsRowValue: {
    flexShrink: 0,
    marginLeft: "auto",
    maxWidth: "100%",
    textAlign: "right"
  },
  settingsActionButtonRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.row,
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  settingsActionButtonDetail: {
    flex: 1,
    minWidth: 200
  },
  settingsActionButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.fill,
    borderRadius: theme.shape.control,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginLeft: "auto",
    minHeight: theme.metrics.minTarget,
    minWidth: 128,
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  settingsActionButtonPressed: {
    opacity: 0.85
  },
  settingsActionButtonDisabled: {
    backgroundColor: theme.colors.fillDisabled
  },
  settingsActionButtonText: {
    textAlign: "center"
  },
  settingsDestructiveText: {
    color: theme.colors.danger.s600
  },
  reviewReminderPrompt: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.accent.s200,
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
    gap: theme.spacing.row,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  advancedRatingRows: {
    borderTopColor: theme.colors.border.default,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  advancedRatingRow: {
    alignItems: "center",
    borderBottomColor: theme.colors.border.default,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.row,
    justifyContent: "space-between",
    minHeight: theme.metrics.rowMinHeight,
    paddingVertical: 8
  },
  advancedRatingCopy: {
    flex: 1,
    gap: 2,
    minWidth: 140
  },
  advancedRatingControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.group,
    marginLeft: "auto"
  },
  advancedRatingValue: {
    fontVariant: ["tabular-nums"],
    textAlign: "center"
  },
  settingsStepperButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s100,
    borderRadius: theme.shape.capsule,
    justifyContent: "center",
    minHeight: theme.metrics.minTarget,
    minWidth: theme.metrics.minTarget
  },
  settingsStatusText: {
    paddingHorizontal: 16
  },
  packsPanel: {
    gap: 12
  },
  packsIconButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  packRow: {
    alignItems: "center",
    borderBottomColor: theme.colors.border.default,
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
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
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
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.default,
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
    color: theme.colors.text.tertiary,
    fontSize: 9,
    fontWeight: "800"
  },
  packCoverageHiddenText: FABRIC_SAFE_HIDDEN_TEXT_STYLE,
  packRowMetaText: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15
  },
  packCoverageMetricValue: {
    color: theme.colors.text.ink,
    fontSize: 15,
    fontWeight: "900"
  },
  packActiveMark: {
    alignItems: "center",
    backgroundColor: theme.colors.positive.s600,
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    position: "relative",
    width: 28
  },
  packActiveGlyphLine: {
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  packInfoCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
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
    color: theme.colors.text.tertiary,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17
  },
  closeGlyph: {
    alignItems: "center",
    height: 18,
    justifyContent: "center",
    width: 18
  },
  closeGlyphLine: {
    backgroundColor: theme.colors.text.ink,
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
    backgroundColor: theme.colors.text.ink,
    borderRadius: 999,
    height: 4,
    width: 4
  },
  pauseGlyph: {
    flexDirection: "row",
    gap: 4
  },
  pauseGlyphBar: {
    backgroundColor: theme.colors.text.ink,
    borderRadius: 999,
    height: 16,
    width: 4
  },
  playGlyph: {
    borderBottomColor: "transparent",
    borderBottomWidth: 8,
    borderLeftColor: theme.colors.text.ink,
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
    borderColor: theme.colors.text.strong,
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
    backgroundColor: theme.colors.text.strong,
    borderRadius: 999,
    height: 2,
    left: 3,
    position: "absolute",
    top: 5,
    width: 11
  },
  flipGlyphTrackBottom: {
    backgroundColor: theme.colors.text.strong,
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
    borderLeftColor: theme.colors.text.strong,
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
    borderRightColor: theme.colors.text.strong,
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
    borderColor: theme.colors.surfaceInverse,
    borderRadius: 999,
    borderWidth: 2,
    height: 10,
    left: 3,
    position: "absolute",
    top: 3,
    width: 10
  },
  searchGlyphHandle: {
    backgroundColor: theme.colors.surfaceInverse,
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
