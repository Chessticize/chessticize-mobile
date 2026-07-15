import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import type { ImageSourcePropType } from "react-native";
import type { MoveResult } from "react-native-chessboard";
import Chessboard, { type ChessboardRef } from "react-native-chessboard";
import {
  analyzeFenWithUciEngine,
  applyMovesToFen,
  beginArrowDuelPuzzle,
  beginLinePuzzle,
  buildCurrentPositionEvaluationLine,
  buildPuzzleGuidedAnalysisLines,
  buildSprintConfig,
  currentExpectedMove,
  defaultSprintConfig,
  formatLocalCalendarDate,
  formatReviewDay,
  formatSideToMoveScore,
  historyAttemptSpeedSeconds,
  isReviewOverdue,
  reviewDueState,
  reviewQueueForecast,
  submitArrowDuelChoice,
  submitLineMove
} from "../../../../packages/core/src/index.ts";
import type {
  AttemptEvent,
  AttemptSource,
  ArrowDuelState,
  CurrentPuzzleState,
  CustomSprintConfigRecord,
  EngineAnalysisLine,
  HistoryAttemptView,
  HistoryPerformance,
  HistoryPerformancePoint,
  HistoryReviewStatus,
  HistoryTimeRange,
  PuzzleSide,
  Puzzle,
  PuzzleFeedback,
  PuzzleLineState,
  RatingRecord,
  ReviewAnalysisLine,
  ReviewReminderDecision,
  ReviewQueueItem,
  ReviewQueueState,
  SessionMistakeReviewItem,
  SprintConfig,
  SprintMode,
  SprintState,
  UciEngineTransport
} from "../../../../packages/core/src/index.ts";
import type { CompletedReviewItem, PracticeService } from "../../../../packages/storage/src/practice-service.ts";
import type {
  ExportedSprintSession,
  ReviewQueueDuePromotionResult,
  ReviewReminderPreference
} from "../../../../packages/storage/src/practice-store.ts";
import { syncPracticeProgress } from "../../../../packages/storage/src/progress-sync.ts";
import type { ProgressSyncResult } from "../../../../packages/storage/src/progress-sync.ts";
import {
  buildPracticeProgressSummary,
  type PracticeProgressSummary
} from "../../../../packages/storage/src/rating-history.ts";
import {
  getBundledCorePackManifest,
  seededPuzzleCount,
  shouldRandomizePuzzleSelection,
  type MobilePuzzleSource
} from "../backend/mobilePractice.ts";
import {
  computeReviewReminderDecision,
  reminderScheduleKey,
  type ReviewReminderPermissionStatus,
  type ReviewReminderScheduleResult
} from "../backend/reviewReminderScheduler.ts";
import type { ICloudAccountStatus } from "../backend/iCloudProgressSync.ts";
import type {
  MobileApplicationMetadata,
  MobilePlatformCapabilities,
  MobileStockfishCapabilities
} from "../backend/mobilePlatformCapabilities.ts";
import { arePracticeTestControlsEnabled, isPracticeDebugEnabled } from "../releaseConfig.ts";
import { isStoreAssetCaptureEnabled } from "../backend/testLaunchConfig.ts";
import {
  canonicalFen,
  decidePremoveQueue,
  fenAfterMove,
  fenAfterMoves,
  normalizeUci,
  planPremoveReplay,
  type BoardInputLockMode
} from "../backend/premove.ts";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";

interface Props {
  platformCapabilities: MobilePlatformCapabilities;
  debugTrace?: (event: PracticeDebugTraceEvent) => void;
  currentTimeMs?: () => number;
  puzzleSelectionSeed?: string;
  standardTargetCorrect?: number;
}

type Tab = "practice" | "review" | "history" | "settings" | "analysis";

type SessionFeedback = PuzzleFeedback | null;
type AnalysisEngineStatus = "idle" | "thinking" | "stockfish" | "fallback" | "error";
type HistoryRatingRangeFilter = "all" | "under1000" | "1000-1399" | "1400-plus";
type CustomThemeFilter = string;
type AdaptiveLayoutClass = "compactPortrait" | "compactLandscape" | "regularPortrait" | "regularLandscape";

type SafeAreaInsets = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

type AdaptiveLayout = {
  boardSize: number;
  className: AdaptiveLayoutClass;
  contentHeight: number;
  contentWidth: number;
  isCompactLandscape: boolean;
  isLandscape: boolean;
  isRegularWidth: boolean;
  sessionRailWidth: number;
  sideNavigationExpanded: boolean;
  sideNavigationWidth: number;
  usesSideNavigation: boolean;
  usesSessionRail: boolean;
  usesWideContent: boolean;
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

type BoardMove = {
  from: string;
  to: string;
  promotion?: string;
};

type MoveSide = "w" | "b";

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
  feedback: PuzzleFeedback;
  puzzleId: string;
};

const UI_PADDING = 16;
const MIN_BOARD = 280;
const COMPACT_LANDSCAPE_RAIL_MIN = 220;
const COMPACT_LANDSCAPE_RAIL_MAX = 300;
const REGULAR_RAIL_MIN = 296;
const REGULAR_RAIL_MAX = 360;
const COMPACT_LANDSCAPE_BOARD_MAX = 430;
const PHONE_PORTRAIT_BOARD_MAX = 560;
const REGULAR_LANDSCAPE_BOARD_MAX = 640;
const REGULAR_PORTRAIT_BOARD_MAX = 860;
const REGULAR_PORTRAIT_RESERVED_CONTROLS_HEIGHT = 240;
const HISTORY_PAGE_LIMIT = 20;
const NEUTRAL_ARROW = "#2563EB";
const ARROW_VISUAL_STYLES = {
  candidate: {
    stroke: NEUTRAL_ARROW,
    opacity: 0.68
  }
} as const;
const FEEDBACK_SNAPSHOT_MS = 800;
// Brief pause so the correct-move feedback registers before the opponent
// reply animates. Kept short — the reply window delays the user's next move.
const USER_FEEDBACK_BEFORE_AUTO_MS = 120;
// Shared by the practice and review boards so they animate at the same speed.
const BOARD_MOVE_ANIMATION_MS = 200;
const ANALYSIS_DEPTH = 20;
const CUSTOM_DURATION_OPTIONS = [3 * 60, 5 * 60, 10 * 60] as const;
const CUSTOM_PER_PUZZLE_OPTIONS = [10, 20, 30] as const;
const CUSTOM_INITIAL_RATING_MIN = 600;
const CUSTOM_INITIAL_RATING_MAX = 2200;
const CUSTOM_INITIAL_RATING_STEP = 100;
const ARROW_DUEL_LOADING_TRANSITION_MS = 200;
const CUSTOM_THEME_OPTIONS: ReadonlyArray<CustomThemeFilter> = [
  "mixed",
  "mate",
  "endgame",
  "fork",
  "pin",
  "skewer",
  "sacrifice",
  "promotion",
  "hangingPiece",
  "advancedPawn"
];
const BOARD_COLOR_TOKENS = {
  white: "#E6E8EB",
  black: "#7B8794"
} as const;
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

function buildAdaptiveLayout({
  height,
  insets,
  width
}: {
  height: number;
  insets: SafeAreaInsets;
  width: number;
}): AdaptiveLayout {
  const viewportWidth = Math.max(MIN_BOARD, width - insets.left - insets.right);
  const contentHeight = Math.max(MIN_BOARD, height - insets.top - insets.bottom);
  const isLandscape = viewportWidth > contentHeight;
  const isRegularWidth = viewportWidth >= 768 && contentHeight >= 600;
  const isCompactLandscape = isLandscape && !isRegularWidth;
  const className: AdaptiveLayoutClass = isRegularWidth
    ? isLandscape ? "regularLandscape" : "regularPortrait"
    : isLandscape ? "compactLandscape" : "compactPortrait";
  const usesSideNavigation = isCompactLandscape || isRegularWidth;
  const sideNavigationExpanded = usesSideNavigation && viewportWidth >= 960;
  const sideNavigationWidth = isRegularWidth
    ? sideNavigationExpanded ? 168 : 76
    : 64;
  const contentWidth = Math.max(
    MIN_BOARD,
    viewportWidth - (usesSideNavigation ? sideNavigationWidth : 0)
  );
  const sessionContentWidth = viewportWidth;
  const usesWideContent = contentWidth >= 860;
  const usesSessionRail = isCompactLandscape || (isRegularWidth && isLandscape && sessionContentWidth >= 860);
  const sessionRailWidth = isRegularWidth
    ? Math.min(REGULAR_RAIL_MAX, Math.max(REGULAR_RAIL_MIN, Math.floor(sessionContentWidth * 0.3)))
    : Math.min(COMPACT_LANDSCAPE_RAIL_MAX, Math.max(COMPACT_LANDSCAPE_RAIL_MIN, Math.floor(sessionContentWidth * 0.34)));
  const sessionBoardSlotWidth = Math.max(
    MIN_BOARD,
    sessionContentWidth - UI_PADDING * 2 - sessionRailWidth - 14
  );
  const sessionBoardSlotHeight = Math.max(MIN_BOARD, contentHeight - UI_PADDING * 2);
  const portraitBoardSlotWidth = Math.max(MIN_BOARD, sessionContentWidth - UI_PADDING * 2);
  const portraitBoardSlotHeight = isRegularWidth && !isLandscape
    ? Math.max(MIN_BOARD, contentHeight - UI_PADDING * 2 - REGULAR_PORTRAIT_RESERVED_CONTROLS_HEIGHT)
    : portraitBoardSlotWidth;
  const boardMax = isRegularWidth
    ? isLandscape ? REGULAR_LANDSCAPE_BOARD_MAX : REGULAR_PORTRAIT_BOARD_MAX
    : isCompactLandscape ? COMPACT_LANDSCAPE_BOARD_MAX : PHONE_PORTRAIT_BOARD_MAX;
  const boardSlot = usesSessionRail
    ? Math.min(sessionBoardSlotWidth, sessionBoardSlotHeight)
    : Math.min(portraitBoardSlotWidth, portraitBoardSlotHeight);
  const boardSize = Math.floor(Math.max(MIN_BOARD, Math.min(boardSlot, boardMax)));

  return {
    boardSize,
    className,
    contentHeight,
    contentWidth,
    isCompactLandscape,
    isLandscape,
    isRegularWidth,
    sessionRailWidth,
    sideNavigationExpanded,
    sideNavigationWidth,
    usesSideNavigation,
    usesSessionRail,
    usesWideContent
  };
}

export function PracticePocScreen({
  platformCapabilities,
  debugTrace,
  currentTimeMs = Date.now,
  puzzleSelectionSeed,
  standardTargetCorrect
}: Props): React.JSX.Element {
  const [puzzleSource, setPuzzleSource] = useState<MobilePuzzleSource>("bundledCore");
  const service = platformCapabilities.storage.practiceService;
  const configurePuzzleSource = platformCapabilities.storage.configurePuzzleSource;
  const stockfish = platformCapabilities.stockfish;
  const scheduler = platformCapabilities.reminders.scheduler;
  const notificationClient = platformCapabilities.reminders.notificationClient;
  const iCloudSyncClient = platformCapabilities.progressSync.client;
  const boardRef = useRef<ChessboardRef | null>(null);
  const suppressedBoardMovesRef = useRef<string[]>([]);
  const boardSyncInProgressRef = useRef(false);
  const boardInputLockedRef = useRef(false);
  const boardInputLockModeRef = useRef<BoardInputLockMode>("hard");
  const pendingPremoveRef = useRef<PendingPremove | null>(null);
  const boardVisualFenRef = useRef<string | null>(null);
  const feedbackSnapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sprintStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingModeRef = useRef<SprintMode | null>(null);
  const reminderScheduleKeyRef = useRef<string | null>(null);
  const scheduledReviewAttemptCountRef = useRef(scheduledReviewAttemptCount(service));
  const reviewReminderPromptDismissedRef = useRef(false);
  const iCloudSyncInFlightRef = useRef<Promise<string> | null>(null);
  const stateRef = useRef<SprintState | null>(null);
  const boardFenRef = useRef<string | null>(null);
  const feedbackSnapshotRef = useRef<FeedbackBoardSnapshot | null>(null);
  const nowMsRef = useRef<number>(currentTimeMs());
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<SprintMode>("standard");
  const [startingMode, setStartingMode] = useState<SprintMode | null>(null);
  const [tab, setTab] = useState<Tab>("practice");
  const [state, setState] = useState<SprintState | null>(null);
  const [feedback, setFeedback] = useState<SessionFeedback>(null);
  const [attempts, setAttempts] = useState<AttemptEvent[]>([]);
  const [sprintSessions, setSprintSessions] = useState<ExportedSprintSession[]>([]);
  const [, setReviews] = useState<ReviewQueueState[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueState[]>([]);
  const [dueReviewItems, setDueReviewItems] = useState<ReviewQueueItem[]>([]);
  const [sessionMistakeReviewItems, setSessionMistakeReviewItems] = useState<SessionMistakeReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => currentTimeMs());
  const [resumableSprint, setResumableSprint] = useState<SprintState | null>(null);
  const [boardFen, setBoardFen] = useState<string | null>(null);
  const [lastBoardMove, setLastBoardMove] = useState<BoardMove | null>(null);
  const [feedbackPuzzleId, setFeedbackPuzzleId] = useState<string | null>(null);
  const [feedbackSnapshot, setFeedbackSnapshot] = useState<FeedbackBoardSnapshot | null>(null);
  const [boardInputLocked, setBoardInputLocked] = useState(false);
  const [boardInputLockMode, setBoardInputLockMode] = useState<BoardInputLockMode>("hard");
  const [chessboardDebugEvents, setChessboardDebugEvents] = useState<string[]>([]);
  const [historyTimeRange, setHistoryTimeRange] = useState<HistoryTimeRange>("7d");
  const [historySourceFilter, setHistorySourceFilter] = useState<"all" | AttemptSource>("sprint");
  const [historyResultFilter, setHistoryResultFilter] = useState<"all" | "correct" | "wrong">("all");
  const [historySideFilter, setHistorySideFilter] = useState<"all" | PuzzleSide>("all");
  const [historyThemeFilter, setHistoryThemeFilter] = useState<string>("all");
  const [historyRatingRangeFilter, setHistoryRatingRangeFilter] = useState<HistoryRatingRangeFilter>("all");
  const [historyReviewStatusFilter, setHistoryReviewStatusFilter] = useState<"all" | HistoryReviewStatus>("all");
  const [historyPageOffset, setHistoryPageOffset] = useState(0);
  const [historyRatingKey, setHistoryRatingKey] = useState<string | null>(null);
  const [historyReviewEntries, setHistoryReviewEntries] = useState<ReviewEntry[]>([]);
  const [historyReviewInitialIndex, setHistoryReviewInitialIndex] = useState(0);
  const [reviewSessionActive, setReviewSessionActive] = useState(false);
  const [customSprintMode, setCustomSprintMode] = useState<"custom" | "arrow_duel">("custom");
  const [customDurationSeconds, setCustomDurationSeconds] = useState(5 * 60);
  const [customPerPuzzleSeconds, setCustomPerPuzzleSeconds] = useState(20);
  const [customTheme, setCustomTheme] = useState<CustomThemeFilter>("mixed");
  const [customInitialRating, setCustomInitialRating] = useState(CUSTOM_INITIAL_RATING_MIN);
  const [reviewReminderPreference, setReviewReminderPreference] = useState<ReviewReminderPreference>(() => service.getReviewReminderPreference());
  const [notificationPermissionStatus, setNotificationPermissionStatus] = useState<ReviewReminderPermissionStatus>("unavailable");
  const [reviewReminderScheduleStatus, setReviewReminderScheduleStatus] = useState("unavailable");
  const [reviewReminderPermissionPromptVisible, setReviewReminderPermissionPromptVisible] = useState(false);
  const [iCloudSyncEnabled, setICloudSyncEnabled] = useState(() => service.getSettings().sync.iCloudEnabled);
  const [iCloudSyncStatus, setICloudSyncStatus] = useState(() => service.getSettings().sync.iCloudEnabled ? "Ready" : "Off");
  const [, setSettingsRevision] = useState(0);

  const adaptiveLayout = useMemo(
    () => buildAdaptiveLayout({ height, insets, width }),
    [height, insets, width]
  );
  const boardSize = adaptiveLayout.boardSize;

  const isActive = state?.status === "active";
  const isPaused = state?.status === "paused";
  const isOpenSession = isActive || isPaused;
  const isFinished = state !== null && !isOpenSession;
  const isShowingFeedbackSnapshot = feedbackSnapshot !== null;
  const shouldShowSessionBoard = isActive || isShowingFeedbackSnapshot;
  const selectedConfig = useMemo(
    () => sprintConfigFor(mode === "custom" ? customSprintMode : mode, customDurationSeconds, customPerPuzzleSeconds, mode === "custom", themeForCustomSprint(customTheme)),
    [customDurationSeconds, customPerPuzzleSeconds, customSprintMode, customTheme, mode]
  );
  const selectedRatingRecord = service.getRating(selectedConfig.ratingKey);
  const currentRating = selectedRatingRecord.rating;
  const customRatingPlayed = selectedRatingRecord.games > 0 ||
    sprintSessions.some((session) => session.ratingKey === selectedConfig.ratingKey && session.ratingAfter !== undefined) ||
    attempts.some((attempt) => attempt.ratingKey === selectedConfig.ratingKey && attempt.source === "sprint");
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
      refreshState();
    }
    // refreshState reads mutable service state; rerunning for its render-local identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configurePuzzleSource, puzzleSource, service]);

  useEffect(() => {
    refreshState();
    // refreshState reads mutable service state; this effect intentionally tracks service replacement only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

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
        refreshReviewReminder("app-background", true);
        if (service.getSettings().sync.iCloudEnabled) {
          void runICloudProgressSync("app-background");
        }
      }
    });
    return () => {
      subscription.remove();
    };
    // The listener is rebound only when its native client or backing service changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iCloudSyncClient, service]);

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

    const deadlineMs = new Date(state.deadlineAt).getTime();
    if (nowMs <= deadlineMs) {
      return;
    }

    try {
      const expired = service.submitMove("__expired__", new Date(nowMs).toISOString());
      commitState(expired.state);
      setFeedback((expired.feedback as SessionFeedback) ?? null);
      refreshState();
    } catch (caught) {
      setError(errorMessage(caught));
    }
    // refreshState is deliberately omitted because its identity changes on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowMs, service, state]);

  useEffect(() => {
    const globals = globalThis as unknown as {
      __CHESSTICIZE_CHESSBOARD_DEBUG__?: boolean;
      __CHESSTICIZE_CHESSBOARD_DEBUG_SINK__?: (event: string, details: Record<string, unknown>) => void;
    };
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
      globals.__CHESSTICIZE_CHESSBOARD_DEBUG__ = undefined;
      globals.__CHESSTICIZE_CHESSBOARD_DEBUG_SINK__ = undefined;
    };
  }, []);

  function nowIso(): string {
    return new Date(nowMsRef.current).toISOString();
  }

  function captureLiveNowIso(): string {
    const liveNowMs = currentTimeMs();
    nowMsRef.current = liveNowMs;
    setNowMs(liveNowMs);
    return new Date(liveNowMs).toISOString();
  }

  function refreshState(): void {
    service.pruneOrphanedReviewQueue();
    setAttempts(service.listHistory() as AttemptEvent[]);
    setSprintSessions(service.listSprintSessions());
    setReviews(service.getDueReviews(nowIso()));
    setReviewQueue(service.listReviewQueue());
    setDueReviewItems(service.getDueReviewItems(nowIso()));
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
      setReviewReminderPermissionPromptVisible(false);
      reviewReminderPromptDismissedRef.current = true;
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

    const work = (async () => {
      setICloudSyncStatus("Syncing");
      try {
        const accountStatus = await iCloudSyncClient.getAccountStatus();
        if (accountStatus !== "available") {
          const message = iCloudAccountStatusMessage(accountStatus);
          setICloudSyncStatus(message);
          return message;
        }
        const result = await syncPracticeProgress(service, iCloudSyncClient, {
          deviceId: "ios-mobile",
          now: nowIso
        });
        refreshState();
        setICloudSyncEnabled(service.getSettings().sync.iCloudEnabled);
        setSettingsRevision((current) => current + 1);
        const message = progressSyncStatusMessage(result);
        setICloudSyncStatus(message);
        return message;
      } catch (caught) {
        const message = "iCloud sync failed";
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
    setReviewReminderPermissionPromptVisible(true);
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
      dueCount,
      body: `${reviewCountLabel(dueCount)} ${dueCount === 1 ? "is" : "are"} ready`,
      route: "review"
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
  ): void {
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
  }

  function resetBoardToFen(fen: string | null | undefined, reason: string, puzzleId?: string | null, move?: string): void {
    if (!fen) {
      return;
    }
    boardRef.current?.resetBoard(fen);
    emitTrace({
      type: "board-reset",
      reason,
      move,
      puzzleId,
      submittedFen: fen
    });
  }

  function emitTrace(event: PracticeDebugTraceEvent): void {
    debugTrace?.(event);
    if (isPracticeDebugEnabled()) {
      console.info("[PracticePoc]", JSON.stringify(event));
    }
  }

  function startSprint(nextMode: SprintMode = mode, useCustomTiming = nextMode === "custom"): void {
    if (startingModeRef.current !== null) {
      return;
    }
    if (nextMode === "arrow_duel") {
      startingModeRef.current = nextMode;
      setStartingMode(nextMode);
      sprintStartTimerRef.current = setTimeout(() => {
        sprintStartTimerRef.current = null;
        performStartSprint(nextMode, useCustomTiming);
      }, ARROW_DUEL_LOADING_TRANSITION_MS);
      return;
    }
    performStartSprint(nextMode, useCustomTiming);
  }

  function performStartSprint(nextMode: SprintMode, useCustomTiming: boolean): void {
    setError(null);
    try {
      const customThemeValue = useCustomTiming ? themeForCustomSprint(customTheme) : undefined;
      const config = sprintConfigFor(nextMode, customDurationSeconds, customPerPuzzleSeconds, useCustomTiming, customThemeValue);
      if (useCustomTiming) {
        const rating = service.getRating(config.ratingKey);
        if (rating.games === 0 && rating.rating !== customInitialRating) {
          service.setRating(config.ratingKey, customInitialRating);
        }
      }
      const started = service.startSprint(
        {
          mode: nextMode,
          durationSeconds: config.durationSeconds,
          perPuzzleSeconds: config.perPuzzleSeconds,
          ...(customThemeValue ? { theme: customThemeValue, persistCustomConfig: true } : useCustomTiming ? { persistCustomConfig: true } : {}),
          ...(nextMode === "standard" && standardTargetCorrect !== undefined
            ? { targetCorrect: standardTargetCorrect }
            : {}),
          ...(configurePuzzleSource && shouldRandomizePuzzleSelection(puzzleSource)
            ? { puzzleSelectionSeed: puzzleSelectionSeed ?? `${Date.now()}-${Math.random()}` }
            : {})
        },
        captureLiveNowIso()
      );
      setMode(nextMode);
      setSessionMistakeReviewItems([]);
      commitState(started);
      setResumableSprint(null);
      commitBoardFen(started.currentPuzzle?.currentFen ?? null);
      setLastBoardMove(null);
      setFeedback(null);
      setFeedbackPuzzleId(null);
      pendingPremoveRef.current = null;
      commitBoardInputLocked(false, "start", started.currentPuzzle?.puzzle.id ?? null);
      clearFeedbackSnapshot();
      setTab("practice");
      refreshState();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      startingModeRef.current = null;
      setStartingMode(null);
    }
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
      const nextState = service.abandonSprint(nowIso());
      commitState(nextState);
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
      commitState(paused);
      commitBoardInputLocked(true, `pause-${reason}`, paused.currentPuzzle?.puzzle.id ?? null);
      clearFeedbackSnapshot();
      setFeedback(null);
      setFeedbackPuzzleId(null);
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
    if (boardSyncInProgressRef.current || boardInputLockedRef.current) {
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
    const submittedFen = submittedPuzzle?.currentFen ?? boardFenRef.current ?? null;
    if (submittedPuzzle?.kind === "arrow_duel" && !isArrowDuelCandidate(submittedPuzzle.candidates, move)) {
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
      const next = service.submitMove(move, nowIso());
      const nextFeedback = (next.feedback as SessionFeedback) ?? null;
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
      if (shouldAnimateSamePuzzleReply(next.state, nextFeedback, submittedPuzzleId)) {
        commitBoardFen(nextVisualFen);
        await animateSamePuzzleReply(next.state, nextFeedback);
        refreshState();
        return;
      }
      syncFeedbackSnapshot(next.state, nextFeedback, submittedPuzzle, submittedFen, submittedPuzzleId);
      boardVisualFenRef.current = nextVisualFen;
      syncBoardAfterMove(next.state, nextFeedback, submittedPuzzleId);
      refreshState();
    } catch (caught) {
      setError(errorMessage(caught));
      boardSyncInProgressRef.current = false;
      commitBoardInputLocked(false, "submit-error", submittedPuzzleId);
    }
  }

  function onIllegalMove(from: Square, to: Square, context: BoardMoveContext): void {
    const activeState = stateRef.current;
    const move = `${from}${to}`;
    if (boardSyncInProgressRef.current || boardInputLockedRef.current) {
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
    setSessionMistakeReviewItems([]);
    setFeedback(null);
    setFeedbackPuzzleId(null);
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
      const resumed = nextSprint.status === "paused" && service.getActiveSprint()?.id === nextSprint.id
        ? service.resumeSprint(captureLiveNowIso())
        : nextSprint;
      setMode(resumed.config.mode);
      setSessionMistakeReviewItems([]);
      commitState(resumed);
      setResumableSprint(null);
      commitBoardFen(resumed.currentPuzzle?.currentFen ?? null);
      setLastBoardMove(null);
      setFeedback(null);
      setFeedbackPuzzleId(null);
      clearFeedbackSnapshot();
      commitBoardInputLocked(false, "resume", resumed.currentPuzzle?.puzzle.id ?? null);
      setTab("practice");
      refreshState();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function showReviewMistakes(): void {
    const sessionId = stateRef.current?.id;
    const reviewItems = sessionId ? service.getSessionMistakeReview(sessionId) : [];
    resetToIdle();
    setSessionMistakeReviewItems(reviewItems);
    setTab("review");
  }

  function openReviewQueue(): void {
    setSessionMistakeReviewItems([]);
    setTab("review");
  }

  function exitSessionReview(): void {
    setSessionMistakeReviewItems([]);
    setTab("practice");
  }

  function openHistoryReview(attemptId: string): void {
    const entries = historyReviewAttempts
      .map((attempt): ReviewEntry | null => {
        const puzzle = service.getPuzzle(attempt.puzzleId);
        return puzzle
          ? {
              puzzle,
              mode: attempt.mode,
              ratingKey: attempt.ratingKey,
              source: "history",
              attempt
            }
          : null;
      })
      .filter((entry): entry is ReviewEntry => Boolean(entry));
    const nextIndex = Math.max(0, entries.findIndex((entry) => entry.attempt?.id === attemptId));
    if (entries.length === 0) {
      return;
    }
    setHistoryReviewEntries(entries);
    setHistoryReviewInitialIndex(nextIndex);
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
    nextFeedback: SessionFeedback
  ): Promise<void> {
    const nextFen = nextState.currentPuzzle?.currentFen ?? null;
    const autoMoves = nextFeedback?.autoPlayedMoves ?? [];
    const puzzleId = nextState.currentPuzzle?.puzzle.id ?? null;
    boardSyncInProgressRef.current = true;
    commitBoardInputLocked(true, "opponent-reply", puzzleId, "premove");
    try {
      try {
        await sleep(USER_FEEDBACK_BEFORE_AUTO_MS);
        setFeedback(null);
        setFeedbackPuzzleId(null);
        await animateBoardMoves(autoMoves, nextFen);
      } finally {
        boardSyncInProgressRef.current = false;
        // A hard lock taken mid-animation (pause, app background) owns the
        // board now and must survive this window's unlock.
        if (boardInputLockModeRef.current === "premove") {
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
        commitFeedbackSnapshot(null);
        commitBoardInputLocked(false, "feedback-snapshot-complete", nextPuzzle?.puzzle.id ?? null);
      }
      feedbackSnapshotTimerRef.current = null;
    }, FEEDBACK_SNAPSHOT_MS);
  }

  function clearFeedbackSnapshot(): void {
    clearFeedbackSnapshotTimer();
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
      suppressedBoardMovesRef.current.push(suppressedMove);
      const playedMove = await boardRef.current.move({
        from: move.from as Square,
        to: move.to as Square,
        ...(move.promotion ? { promotion: move.promotion as PieceSymbol } : {})
      });
      if (!playedMove) {
        consumeSuppressedBoardMove(suppressedMove, suppressedBoardMovesRef.current);
        commitBoardFen(finalFen);
      }
      setLastBoardMove(move);
    }
    commitBoardFen(finalFen);
  }

  const currentPuzzle = state?.currentPuzzle;
  const sprintElapsedMs = state ? Math.max(0, nowMs - new Date(state.startedAt).getTime()) : 0;
  const remainingMs = state ? Math.max(0, new Date(state.deadlineAt).getTime() - nowMs) : 0;
  const timerText = formatDuration(Math.max(0, Math.floor(remainingMs / 1000)));
  const currentBoardFen = boardFen ?? currentPuzzle?.currentFen ?? null;
  const displayedPuzzle = feedbackSnapshot?.currentPuzzle ?? currentPuzzle;
  const displayedBoardFen = feedbackSnapshot?.boardFen ?? currentBoardFen;
  const boardFlipped = displayedPuzzle ? shouldFlipBoard(displayedPuzzle) : false;
  const feedbackForCurrentPuzzle = feedbackPuzzleId && currentPuzzle?.puzzle.id === feedbackPuzzleId ? feedback : null;
  const boardFeedback = feedbackSnapshot?.feedback ?? feedbackForCurrentPuzzle;
  const boardPremoveWindow = boardInputLocked && boardInputLockMode === "premove";
  // While the session board is on screen, drags aimed at the board must pan
  // pieces, never the page. The board's own pan gesture claims touches while
  // enabled, but hard-lock windows disable it, fast drags can start on the
  // padding, and a touch that begins during a lock window can survive into an
  // unlocked turn and feed the scroll view instead — so freeze the
  // surrounding scroll for the whole session, not just the lock windows.
  const practiceScrollLocked = shouldShowSessionBoard;
  const boardGestureEnabled = Boolean(
    isActive && !isShowingFeedbackSnapshot && (!boardInputLocked || boardPremoveWindow)
  );
  // During the premove window currentFen is already the post-reply position,
  // so this resolves to the user's side and opponent pieces stay undraggable
  // while the reply animates.
  const boardDraggableColor = boardGestureEnabled && currentPuzzle
    ? sideToMove(currentPuzzle.currentFen)
    : null;
  const displayedSideToMove = displayedBoardFen ? sideToMove(displayedBoardFen) : null;
  const submittedMoveForCurrentPuzzle =
    boardFeedback?.submittedMove && boardFeedback.submittedMove !== "__illegal__"
      ? arrowFromTo(boardFeedback.submittedMove)
      : null;
  const displayedLastBoardMove = feedbackSnapshot || boardFeedback ? null : lastBoardMove;
  const historyRatingKeys = useMemo(
    () => sortHistoryRatingKeys(
      [...new Set([...service.listPlayedRatings().map((rating) => rating.key), ...attempts.map((attempt) => attempt.ratingKey)])],
      attempts,
      sprintSessions
    ),
    [attempts, service, sprintSessions]
  );
  const activeHistoryRatingKey = historyRatingKey;
  const historyWrongOnly = historyResultFilter === "wrong";
  const historyRatingRangeQuery = historyRatingRangeFilterToQuery(historyRatingRangeFilter);
  const historyView = service.getHistoryView({
    now: nowIso(),
    timeRange: historyTimeRange,
    ...(activeHistoryRatingKey ? { ratingKey: activeHistoryRatingKey } : {}),
    ...historyRatingRangeQuery,
    ...(historySourceFilter === "all" ? {} : { source: historySourceFilter }),
    ...(historyResultFilter === "all" ? {} : { result: historyResultFilter }),
    ...(historySideFilter === "all" ? {} : { side: historySideFilter }),
    ...(historyThemeFilter === "all" ? {} : { theme: historyThemeFilter }),
    ...(historyReviewStatusFilter === "all" ? {} : { reviewStatus: historyReviewStatusFilter }),
    page: { limit: HISTORY_PAGE_LIMIT, offset: historyPageOffset }
  });
  const historyPerformanceView = activeHistoryRatingKey
    ? service.getHistoryView({
        now: nowIso(),
        timeRange: historyTimeRange,
        ratingKey: activeHistoryRatingKey,
        ...historyRatingRangeQuery,
        ...(historySourceFilter === "all" ? {} : { source: historySourceFilter }),
        ...(historySideFilter === "all" ? {} : { side: historySideFilter }),
        ...(historyThemeFilter === "all" ? {} : { theme: historyThemeFilter }),
        ...(historyReviewStatusFilter === "all" ? {} : { reviewStatus: historyReviewStatusFilter })
      })
    : null;
  const fullHistoryReviewView = service.getHistoryView({
    now: nowIso(),
    timeRange: historyTimeRange,
    ...(activeHistoryRatingKey ? { ratingKey: activeHistoryRatingKey } : {}),
    ...historyRatingRangeQuery,
    ...(historySourceFilter === "all" ? {} : { source: historySourceFilter }),
    ...(historyResultFilter === "all" ? {} : { result: historyResultFilter }),
    ...(historySideFilter === "all" ? {} : { side: historySideFilter }),
    ...(historyThemeFilter === "all" ? {} : { theme: historyThemeFilter }),
    ...(historyReviewStatusFilter === "all" ? {} : { reviewStatus: historyReviewStatusFilter })
  });
  const displayedAttempts = historyView.attempts;
  const historyReviewAttempts = fullHistoryReviewView.attempts;
  const historyAvailableThemes = historyView.availableThemes;
  const historyPage = historyView.page;
  const contentOwnsHeader = tab === "review" || tab === "history";
  const reviewSurfaceOpen = reviewSessionActive || historyReviewEntries.length > 0;
  const appChromeVisible = !isOpenSession && !isShowingFeedbackSnapshot && !reviewSurfaceOpen;
  const appHeaderVisible = appChromeVisible && !contentOwnsHeader;
  const sideNavigationVisible = appChromeVisible && adaptiveLayout.usesSideNavigation;
  const bottomTabsVisible = appChromeVisible && !sideNavigationVisible;
  const sessionUsesRail = shouldShowSessionBoard && adaptiveLayout.usesSessionRail;
  const screenTitle = screenTitleFor(tab);
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
  const practiceProgress = buildPracticeProgressSummary(
    attempts,
    sprintSessions,
    nowMs,
    selectedConfig.ratingKey
  );
  const dueTodayCount = dueReviewItems.length;
  const overdueCount = dueReviewItems.filter((item) => isReviewOverdue(item.review, nowMs)).length;
  const customThemeValue = themeForCustomSprint(customTheme);
  const customEligiblePuzzleCount = puzzleSource === "bundledCore"
    ? bundledCoreCustomEligiblePuzzleCount(customThemeValue)
    : service.countEligibleSprintPuzzles({
        mode: customSprintMode,
        durationSeconds: customDurationSeconds,
        perPuzzleSeconds: customPerPuzzleSeconds,
        ...(customThemeValue ? { theme: customThemeValue } : {})
      });
  const sessionStatusNode = state && (isOpenSession || isShowingFeedbackSnapshot) ? (
    <SessionStatusBar
      compactMetrics={sessionUsesRail}
      mode={mode}
      state={state}
      sideToMove={displayedSideToMove}
      timerText={timerText}
      onAbandon={isActive ? abandonSprint : undefined}
      onPause={isActive ? () => pauseActiveSprint("manual") : undefined}
      onResume={isPaused && state ? () => resumeSprint(state) : undefined}
    />
  ) : null;
  const pausedSessionNode = isPaused && state ? (
    <PausedSessionPanel
      state={state}
      onAbandon={abandonSprint}
      onResume={() => resumeSprint(state)}
    />
  ) : null;
  const sessionBoardNode = shouldShowSessionBoard ? (
    <View style={styles.boardWrapper}>
      {isStoreAssetCaptureEnabled() ? (
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
            key={`${state?.id ?? "idle"}-${displayedPuzzle?.puzzle.id ?? "none"}-${displayedPuzzle?.kind ?? "line"}`}
            ref={boardRef}
            fen={displayedBoardFen}
            onMove={(result) => {
              void onBoardMove(result, {
                puzzleId: displayedPuzzle?.puzzle.id ?? null
              });
            }}
            onIllegalMove={(from, to) => {
              onIllegalMove(from, to, {
                puzzleId: displayedPuzzle?.puzzle.id ?? null
              });
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

        {!boardGestureEnabled ? (
          <Pressable
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onPress={() => undefined}
            style={styles.boardInputBlocker}
            testID="board-input-blocker"
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

        {displayedPuzzle?.kind === "arrow_duel" && !boardFeedback ? (
          <ArrowCandidateOverlay
            boardSize={boardSize}
            flipped={boardFlipped}
            candidates={displayedPuzzle.candidates}
            testID="arrow-duel-candidate-overlay"
          />
        ) : null}
      </View>
      {isPracticeDebugEnabled() && chessboardDebugEvents.length > 0 ? (
        <Text style={styles.debugLog} testID="chessboard-debug-log">
          {chessboardDebugEvents.join("\n")}
        </Text>
      ) : null}
    </View>
  ) : null;
  const sessionScoreNode = state?.status === "active" ? (
    <SessionScoreStrip state={state} />
  ) : null;
  const practicePromptNode = shouldShowSessionBoard ? (
    <PracticePrompt currentPuzzle={displayedPuzzle} mode={mode} />
  ) : null;
  const errorNode = error ? <ErrorPanel error={error} /> : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View
        accessibilityLabel={`Layout ${adaptiveLayout.className}`}
        style={styles.appRootShell}
        testID="adaptive-layout"
      >
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
              setTab(nextTab);
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

          <ScrollView
            testID="practice-main-scroll"
            scrollEnabled={!practiceScrollLocked}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.content,
              adaptiveLayout.usesWideContent ? styles.contentWide : null,
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
                {sessionUsesRail ? (
                  <View style={styles.activeSessionAdaptiveLayout} testID="active-session-adaptive-layout">
                    <View style={styles.activeSessionBoardLane} testID="active-session-board-lane">
                      {sessionBoardNode}
                    </View>
                    <ScrollView
                      style={[styles.activeSessionControlRailScroll, { width: adaptiveLayout.sessionRailWidth }]}
                      contentContainerStyle={styles.activeSessionControlRail}
                      testID="active-session-control-rail"
                    >
                      {sessionStatusNode}
                      {sessionScoreNode}
                      {practicePromptNode}
                      {errorNode}
                    </ScrollView>
                  </View>
                ) : (
                  <>
                    {sessionStatusNode}
                    {pausedSessionNode}
                    {sessionBoardNode}
                    {sessionScoreNode}
                    {practicePromptNode}
                    {errorNode}
                  </>
                )}

                {!isOpenSession && state === null && mode !== "custom" ? (
                  <PracticeHome
                    adaptiveLayout={adaptiveLayout}
                    mode={mode}
                    modes={practiceModeSummaries}
                    currentRating={currentRating}
                    dueReviewCount={dueTodayCount}
                    overdueReviewCount={overdueCount}
                    progress={practiceProgress}
                    resumableSprint={resumableSprint}
                    onSelectMode={setMode}
                    onStartMode={(nextMode) => startSprint(nextMode)}
                    onResumeSprint={resumeSprint}
                    onOpenReview={openReviewQueue}
                  />
                ) : null}

                {!isOpenSession && state === null && mode === "custom" ? (
                  <CustomSprintSetup
                    durationSeconds={customDurationSeconds}
                    perPuzzleSeconds={customPerPuzzleSeconds}
                    theme={customTheme}
                    targetCorrect={selectedConfig.targetCorrect}
                    maxMistakes={selectedConfig.maxMistakes}
                    availablePuzzleCount={customEligiblePuzzleCount}
                    ratingKey={selectedConfig.ratingKey}
                    initialRating={displayedCustomInitialRating}
                    ratingPlayed={customRatingPlayed}
                    onInitialRatingChange={(nextRating) => {
                      if (customRatingPlayed) {
                        const next = service.setRating(selectedConfig.ratingKey, nextRating);
                        setCustomInitialRating(next.rating);
                        setSettingsRevision((current) => current + 1);
                        return;
                      }
                      setCustomInitialRating(nextRating);
                    }}
                    onDurationChange={setCustomDurationSeconds}
                    onClose={() => setMode("standard")}
                    customMode={customSprintMode}
                    onCustomModeChange={setCustomSprintMode}
                    onPerPuzzleChange={setCustomPerPuzzleSeconds}
                    onThemeChange={setCustomTheme}
                    previousConfigs={service.listCustomSprintConfigs()}
                    ratingForKey={(key) => service.getRating(key).rating}
                    onStart={() => startSprint(customSprintMode, true)}
                  />
                ) : null}

                {isFinished && !isShowingFeedbackSnapshot ? (
                  <SprintSummary
                    state={state}
                    elapsedMs={Math.min(sprintElapsedMs, state ? state.config.durationSeconds * 1000 : sprintElapsedMs)}
                    onReplay={() => startSprint(mode)}
                    onBack={resetToIdle}
                    onOpenHistory={() => {
                      setHistoryRatingKey(state.config.ratingKey);
                      setHistoryPageOffset(0);
                      setTab("history");
                    }}
                    onReview={state.mistakeCount > 0 ? showReviewMistakes : undefined}
                  />
                ) : null}

                {!isActive && state === null && arePracticeTestControlsEnabled() && configurePuzzleSource ? (
                  <TestPuzzleSourceControl
                    source={puzzleSource}
                    onChange={changePuzzleSource}
                  />
                ) : null}
              </>
            ) : null}

            {tab === "history" ? (
              historyReviewEntries.length > 0 ? (
                <ReviewSession
                  key={`history:${historyReviewEntries.map((entry) => entry.attempt?.id ?? entry.puzzle.id).join("|")}:${historyReviewInitialIndex}`}
                  adaptiveLayout={adaptiveLayout}
                  boardSize={boardSize}
                  currentTimeMs={currentTimeMs}
                  entries={historyReviewEntries}
                  initialIndex={historyReviewInitialIndex}
                  service={service}
                  onExit={() => setHistoryReviewEntries([])}
                  stockfish={stockfish}
                />
              ) : (
                <HistoryPanel
                  adaptiveLayout={adaptiveLayout}
                  attempts={displayedAttempts}
                  performance={historyPerformanceView?.performance ?? emptyHistoryPerformance()}
                  ratingKeys={historyRatingKeys}
                  selectedRatingKey={activeHistoryRatingKey}
                  timeRange={historyTimeRange}
                  sourceFilter={historySourceFilter}
                  resultFilter={historyResultFilter}
                  ratingRangeFilter={historyRatingRangeFilter}
                  sideFilter={historySideFilter}
                  themeFilter={historyThemeFilter}
                  availableThemes={historyAvailableThemes}
                  page={historyPage}
                  reviewStatusFilter={historyReviewStatusFilter}
                  sprintOnly={historySourceFilter === "sprint"}
                  wrongOnly={historyWrongOnly}
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
                  onThemeFilterChange={(theme) => {
                    setHistoryThemeFilter(theme);
                    setHistoryPageOffset(0);
                  }}
                  onReviewStatusFilterChange={(status) => {
                    setHistoryReviewStatusFilter(status);
                    setHistoryPageOffset(0);
                  }}
                  onPageOffsetChange={setHistoryPageOffset}
                  onOpenAttempt={openHistoryReview}
                  onResetFilters={() => {
                    setHistoryTimeRange("7d");
                    setHistorySourceFilter("sprint");
                    setHistoryResultFilter("all");
                    setHistorySideFilter("all");
                    setHistoryThemeFilter("all");
                    setHistoryRatingRangeFilter("all");
                    setHistoryReviewStatusFilter("all");
                    setHistoryPageOffset(0);
                    setHistoryRatingKey(null);
                  }}
                  onToggleSprintOnly={() => {
                    setHistoryPageOffset(0);
                    setHistorySourceFilter(historySourceFilter === "sprint" ? "all" : "sprint");
                  }}
                  onToggleWrongOnly={() => {
                    setHistoryPageOffset(0);
                    setHistoryResultFilter(historyWrongOnly ? "all" : "wrong");
                  }}
                />
              )
            ) : null}
            {tab === "review" ? (
              <ReviewPanel
                adaptiveLayout={adaptiveLayout}
                boardSize={boardSize}
                dueReviewItems={dueReviewItems}
                nowMs={nowMs}
                reviewQueue={reviewQueue}
                currentTimeMs={currentTimeMs}
                service={service}
                sessionMistakeReviewItems={sessionMistakeReviewItems}
                onExitSessionReview={exitSessionReview}
                onOpenPractice={exitSessionReview}
                onReviewRecorded={(completedAt) => {
                  const completedAtMs = new Date(completedAt).getTime();
                  if (Number.isFinite(completedAtMs) && completedAtMs > nowMsRef.current) {
                    nowMsRef.current = completedAtMs;
                    setNowMs(completedAtMs);
                  }
                  const nextScheduledReviewAttemptCount = scheduledReviewAttemptCount(service);
                  if (nextScheduledReviewAttemptCount > scheduledReviewAttemptCountRef.current) {
                    maybeShowReviewReminderPermissionPrompt();
                  }
                  scheduledReviewAttemptCountRef.current = nextScheduledReviewAttemptCount;
                  refreshState();
                }}
                onPromoteNextFutureReviewsToDue={arePracticeTestControlsEnabled() ? promoteNextFutureReviewsToDue : undefined}
                onScheduleTestReviewReminder={arePracticeTestControlsEnabled() ? scheduleDevReviewReminderNotification : undefined}
                onSessionActiveChange={setReviewSessionActive}
                reviewReminderScheduleStatus={arePracticeTestControlsEnabled() ? reviewReminderScheduleStatus : undefined}
                stockfish={stockfish}
              />
            ) : null}
            {tab === "settings" ? (
              <SettingsPanel
                adaptiveLayout={adaptiveLayout}
                applicationMetadata={platformCapabilities.applicationMetadata}
                standardRating={readRating(service, defaultSprintConfig("standard").ratingKey)}
                ratings={[
                  { label: "Standard", record: service.getRating(defaultSprintConfig("standard").ratingKey) },
                  { label: "Arrow Duel", record: service.getRating(defaultSprintConfig("arrow_duel").ratingKey) }
                ]}
                onOpenDiagnostics={arePracticeTestControlsEnabled() ? () => setTab("analysis") : undefined}
                onAdjustRating={(ratingKey, nextRating) => {
                  const next = service.setRating(ratingKey, nextRating);
                  setSettingsRevision((current) => current + 1);
                  return next;
                }}
                notificationPermissionStatus={notificationPermissionStatus}
                reviewReminderScheduleStatus={reviewReminderScheduleStatus}
                reviewReminderPreference={reviewReminderPreference}
                iCloudSyncEnabled={iCloudSyncEnabled}
                iCloudSyncStatus={iCloudSyncStatus}
                onOpenNotificationSettings={() => {
                  void openReviewReminderSystemSettings();
                }}
                onRequestReviewReminderPermission={() => requestReviewReminderPermission()}
                onSaveReviewReminderPreference={saveReviewReminderPreference}
                onSaveICloudSyncEnabled={saveICloudSyncEnabled}
                onSyncICloudNow={() => runICloudProgressSync("manual")}
              />
            ) : null}
            {tab === "analysis" && arePracticeTestControlsEnabled() ? (
              <StockfishDiagnosticsPanel stockfish={stockfish} />
            ) : null}
          </ScrollView>
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
                    setTab(item.tab);
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
    </SafeAreaView>
  );
}

type PracticeModeSummary = {
  mode: SprintMode;
  config: SprintConfig;
  rating?: number;
};

function SprintStartHeader({
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
        <Text style={styles.primaryButtonText}>Start</Text>
      </Pressable>
    </View>
  );
}

function PracticeHome({
  adaptiveLayout,
  mode,
  modes,
  currentRating,
  dueReviewCount,
  overdueReviewCount,
  progress,
  resumableSprint,
  onSelectMode,
  onStartMode,
  onResumeSprint,
  onOpenReview
}: {
  adaptiveLayout: AdaptiveLayout;
  mode: SprintMode;
  modes: PracticeModeSummary[];
  currentRating: number;
  dueReviewCount: number;
  overdueReviewCount: number;
  progress: PracticeProgressSummary;
  resumableSprint: SprintState | null;
  onSelectMode: (next: SprintMode) => void;
  onStartMode: (next: SprintMode) => void;
  onResumeSprint: (sprint: SprintState) => void;
  onOpenReview: () => void;
}): React.JSX.Element {
  const selected = modes.find((item) => item.mode === mode) ?? modes[0];
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
  const reviewStatusLabel = overdueReviewCount > 0
    ? "Overdue"
    : dueReviewCount > 0
      ? "Due today"
      : "No reviews due";

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
        <View style={styles.practiceHomePrimaryColumn}>
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
        </View>

        <View style={styles.practiceHomeSecondaryColumn}>
          <Text style={styles.sectionLabel}>Progress</Text>
          <View
            accessibilityLabel={`Progress summary, ELO ${currentRating}, rating ${ratingDeltaLabel}, this week ${progress.correctThisWeek}, ${progressDelta}, ${progressContext}`}
            style={styles.practiceProgressCard}
            testID="practice-progress-summary"
          >
            <View style={styles.progressMetric} testID="practice-progress-rating-metric">
              <Text style={styles.progressMetricLabel}>ELO ({selected ? modeLabel(selected.mode) : "Standard"})</Text>
              <Text style={styles.progressValue}>{currentRating}</Text>
              <Text testID="practice-progress-rating-delta" style={[styles.progressDelta, ratingDeltaTone]}>{ratingDeltaLabel}</Text>
            </View>
            <View style={styles.progressDivider} />
            <View style={styles.progressMetric} testID="practice-progress-weekly-metric">
              <Text style={styles.progressMetricLabel}>This Week</Text>
              <Text testID="practice-progress-weekly-solved" style={styles.progressValue}>{progress.correctThisWeek}</Text>
              <Text testID="practice-progress-weekly-delta" style={[styles.progressDelta, progressTone]}>{progressDelta}</Text>
              <Text testID="practice-progress-weekly-context" style={styles.progressContextText}>{progressContext}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Review</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open scheduled mistake reviews, ${dueReviewCount} due today${overdueReviewCount > 0 ? `, ${overdueReviewCount} overdue` : ""}`}
            testID="practice-review-strip"
            style={styles.practiceReviewStrip}
            onPress={onOpenReview}
          >
            <View style={styles.reviewStripStatusCopy}>
              <Text style={styles.listText}>{reviewStatusLabel}</Text>
            </View>
            <View
              style={[
                styles.reviewStripActionArea,
                adaptiveLayout.usesWideContent ? styles.reviewStripActionAreaWide : null
              ]}
              testID="practice-review-strip-action-area"
            >
              <View
                style={[
                  styles.reviewStripCounts,
                  adaptiveLayout.usesWideContent ? styles.reviewStripCountsWide : null
                ]}
                testID="practice-review-strip-counts"
              >
                <View style={styles.reviewStripMetric} testID="practice-review-due-count">
                  <Text style={styles.reviewDueCount}>{dueReviewCount}</Text>
                  <Text style={styles.reviewStripMetricLabel}>Due today</Text>
                </View>
                {overdueReviewCount > 0 ? (
                  <View style={styles.reviewStripMetric} testID="practice-review-overdue-count">
                    <Text style={styles.reviewOverdueCount}>{overdueReviewCount}</Text>
                    <Text style={styles.reviewStripMetricLabel}>Overdue</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.reviewStripChevron} testID="practice-review-strip-chevron">
                <ChevronGlyph direction="right" />
              </View>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
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
  const ratingLabel = item.rating === undefined ? null : `ELO ${item.rating}`;
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
  return `${formatSprintTimingLabel(item.config)} · ELO ${item.rating ?? 600}`;
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
  ratingPlayed,
  maxMistakes,
  onClose,
  onCustomModeChange,
  onInitialRatingChange,
  perPuzzleSeconds,
  previousConfigs,
  ratingForKey,
  targetCorrect,
  theme,
  ratingKey,
  onDurationChange,
  onPerPuzzleChange,
  onThemeChange,
  onStart
}: {
  availablePuzzleCount: number;
  customMode: "custom" | "arrow_duel";
  durationSeconds: number;
  initialRating: number;
  ratingPlayed: boolean;
  maxMistakes: number;
  onClose: () => void;
  onCustomModeChange: (next: "custom" | "arrow_duel") => void;
  onInitialRatingChange: (next: number) => void;
  perPuzzleSeconds: number;
  previousConfigs: CustomSprintConfigRecord[];
  ratingForKey: (ratingKey: string) => number;
  targetCorrect: number;
  theme: CustomThemeFilter;
  ratingKey: string;
  onDurationChange: (next: number) => void;
  onPerPuzzleChange: (next: number) => void;
  onThemeChange: (next: CustomThemeFilter) => void;
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
        <CustomChoiceRow
          label="Theme"
          value={customThemeLabel(theme)}
          options={CUSTOM_THEME_OPTIONS.map(customThemeLabel)}
          testID="custom-theme-row"
          onChange={(label) => onThemeChange(customThemeFromLabel(label))}
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
          key={ratingKey}
          played={ratingPlayed}
          onChange={onInitialRatingChange}
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
        onBroadenTheme={theme === "mixed" ? undefined : () => onThemeChange("mixed")}
        requiredPuzzleCount={requiredPuzzleCount}
        theme={customThemeLabel(theme)}
      />

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
              onThemeChange(config.theme);
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
  onBroadenTheme,
  requiredPuzzleCount,
  theme
}: {
  availablePuzzleCount: number;
  hasEnoughLocalPuzzles: boolean;
  onBroadenTheme?: () => void;
  requiredPuzzleCount: number;
  theme: string;
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
      {onBroadenTheme ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Broaden from ${theme} to Mixed theme`}
          testID="custom-broaden-theme"
          style={[styles.secondaryButton, styles.customEligibilityAction]}
          onPress={onBroadenTheme}
        >
          <Text style={styles.secondaryButtonText}>Use Mixed</Text>
        </Pressable>
      ) : null}
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
  played,
  onChange,
  value
}: {
  played: boolean;
  onChange: (next: number) => void;
  value: number;
}): React.JSX.Element {
  const [editOpen, setEditOpen] = useState(false);
  if (!played) {
    return (
      <View
        accessibilityLabel={`Initial ELO, ELO ${value}`}
        style={styles.customConfigRow}
        testID="custom-initial-rating-row"
      >
        <View style={styles.customChoiceCopy}>
          <Text style={styles.listText}>Initial ELO</Text>
        </View>
        <View style={styles.customStepperGroup}>
          <Text style={styles.customConfigValue} testID="custom-initial-rating-value">ELO {value}</Text>
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
        accessibilityLabel={`Edit ELO, ELO ${value}`}
        accessibilityState={{ expanded: editOpen }}
        style={styles.customConfigRow}
        testID="custom-initial-rating-row"
        onPress={() => setEditOpen((current) => !current)}
      >
        <View style={styles.customChoiceCopy}>
          <Text style={styles.listText}>Edit ELO</Text>
        </View>
        <View style={styles.customStepperGroup}>
          <Text style={styles.customConfigValue} testID="custom-initial-rating-value">ELO {value}</Text>
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
        accessibilityLabel="Decrease ELO"
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
        accessibilityLabel="Increase ELO"
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

function CustomChoiceRow({
  label,
  onChange,
  options,
  testID,
  value
}: {
  label: string;
  onChange: (next: string) => void;
  options: string[];
  testID: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.customConfigRow} testID={testID}>
      <View style={styles.customChoiceCopy}>
        <Text style={styles.listText}>{label}</Text>
      </View>
      <View style={styles.customInlineOptions}>
        {options.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: value === option }}
            testID={`custom-theme-${safeTestId(option)}`}
            style={[styles.customMiniChip, value === option ? styles.customMiniChipActive : null]}
            onPress={() => onChange(option)}
          >
            <Text style={[styles.customMiniChipText, value === option ? styles.customMiniChipTextActive : null]}>{option}</Text>
          </Pressable>
        ))}
      </View>
    </View>
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
  theme: CustomThemeFilter;
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
      accessibilityLabel={`Use ${ratingLabel} custom sprint, ${config.mode}, ${metaLabel}, ELO ${config.rating}`}
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
          <Text style={styles.helperText}>ELO</Text>
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

function SessionStatusBar({
  compactMetrics = false,
  mode,
  state,
  sideToMove,
  timerText,
  onAbandon,
  onPause,
  onResume
}: {
  compactMetrics?: boolean;
  mode: SprintMode;
  state: SprintState;
  sideToMove: MoveSide | null;
  timerText: string;
  onAbandon?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}): React.JSX.Element {
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  return (
    <View style={styles.activeSessionShell} testID="active-session-shell">
      <View style={styles.sessionNavRow} testID="session-shell-nav">
        {onAbandon ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abandon sprint"
            testID="session-abandon"
            style={styles.sessionNavButton}
            onPress={() => setConfirmAbandon(true)}
          >
            <CloseGlyph />
          </Pressable>
        ) : (
          <View style={styles.sessionNavButton} />
        )}
        <Text style={styles.sessionNavTitle}>{modeLabel(mode)}</Text>
        {onPause ? (
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

      <View
        style={[
          styles.sessionActiveMetricRow,
          compactMetrics ? styles.sessionActiveMetricRowCompact : null
        ]}
        testID="session-status-metrics"
      >
        <View
          accessibilityLabel={`Progress ${state.correctCount} of ${state.config.targetCorrect}`}
          style={[
            styles.sessionMetricBlock,
            compactMetrics ? styles.sessionMetricBlockCompact : null,
            compactMetrics ? styles.sessionProgressBlockCompact : null
          ]}
          testID="session-progress-block"
        >
          <Text numberOfLines={1} testID="session-progress" style={styles.sessionProgressValue}>
            {state.correctCount} / {state.config.targetCorrect}
          </Text>
        </View>
        <View
          accessibilityLabel={`Timer ${timerText}`}
          style={[
            styles.sessionMetricBlock,
            styles.sessionTimerBlock,
            compactMetrics ? styles.sessionMetricBlockCompact : null,
            compactMetrics ? styles.sessionTimerBlockCompact : null
          ]}
          testID="session-timer-block"
        >
          <Text numberOfLines={1} testID="session-timer" style={styles.timerText}>{timerText}</Text>
        </View>
        <View
          accessibilityLabel={sideToMove ? sideToMoveAccessibilityLabel(sideToMove) : "Side to move unavailable"}
          style={[
            styles.sessionMetricBlock,
            styles.sessionSideToMoveBlock,
            compactMetrics ? styles.sessionMetricBlockCompact : null,
            compactMetrics ? styles.sessionSideToMoveBlockCompact : null
          ]}
          testID="session-side-to-move-block"
        >
          {sideToMove ? <MoveSideBadge badgeTestID="session-side-to-move" compact side={sideToMove} /> : null}
        </View>
        <View
          accessibilityLabel={`Mistakes ${state.mistakeCount} of ${state.config.maxMistakes}`}
          style={[
            styles.sessionMetricBlock,
            compactMetrics ? styles.sessionMetricBlockCompact : null,
            compactMetrics ? styles.sessionMistakesBlockCompact : null
          ]}
          testID="session-mistakes-block"
        >
          <ActiveMistakeIndicator
            count={state.mistakeCount}
            max={state.config.maxMistakes}
          />
        </View>
      </View>

      {confirmAbandon ? (
        <View style={styles.sessionAbandonConfirm} testID="session-abandon-confirmation">
          <View style={styles.sessionAbandonCopy}>
            <Text style={styles.listText}>Abandon sprint?</Text>
            <Text style={styles.helperText}>This ends the run and records a failed sprint.</Text>
          </View>
          <View style={styles.sessionAbandonActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel abandon sprint"
              testID="session-abandon-cancel"
              style={styles.secondaryButton}
              onPress={() => setConfirmAbandon(false)}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirm abandon sprint"
              testID="session-abandon-confirm"
              style={styles.destructiveButton}
              onPress={() => {
                setConfirmAbandon(false);
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

function SprintSummary({
  state,
  elapsedMs,
  onReplay,
  onBack,
  onOpenHistory,
  onReview
}: {
  state: SprintState;
  elapsedMs: number;
  onReplay: () => void;
  onBack: () => void;
  onOpenHistory: () => void;
  onReview?: () => void;
}): React.JSX.Element {
  const delta = (state.ratingAfter ?? state.ratingBefore) - state.ratingBefore;
  const reason = formatEndReason(state.endReason);
  const shouldPrioritizeReview = Boolean(onReview);
  const accuracy = Math.round((state.correctCount / Math.max(1, state.correctCount + state.mistakeCount)) * 100);
  const ratingAfter = state.ratingAfter ?? state.ratingBefore;
  const reviewImpact = state.mistakeCount > 0
    ? `${state.mistakeCount} ${state.mistakeCount === 1 ? "mistake" : "mistakes"} queued`
    : "No new review items";

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
        <Text style={styles.resultTopBarTitle}>Sprint Result</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View history trends"
          testID="sprint-result-history-button"
          style={styles.resultTopBarIconButton}
          onPress={onOpenHistory}
        >
          <ResultTrendGlyph />
        </Pressable>
      </View>

      <View style={styles.resultHero} testID="sprint-result-hero">
        <View style={[styles.resultIcon, state.status === "won" ? styles.resultIconWon : styles.resultIconFailed]}>
          <SprintResultStatusGlyph status={state.status === "won" ? "won" : "failed"} />
        </View>
        <View style={styles.resultTitleBlock}>
          <Text style={styles.summaryTitle}>{state.status === "won" ? "Sprint complete" : "Sprint failed"}</Text>
          <Text
            accessibilityLabel={`Result: ${reason}`}
            style={styles.summaryText}
            testID="sprint-result-reason"
          >
            {reason}
          </Text>
        </View>
        <View style={styles.resultScoreBlock}>
          <Text style={styles.resultSolvedCount} testID="sprint-result-solved">
            {state.correctCount}
            <Text style={styles.resultSolvedTarget}> / {state.config.targetCorrect}</Text>
          </Text>
          <Text style={styles.resultAccuracy} testID="sprint-result-accuracy">{accuracy}% Accuracy</Text>
        </View>
      </View>

      <ResultHistoryShortcut
        delta={delta}
        ratingAfter={ratingAfter}
        ratingBefore={state.ratingBefore}
        onPress={onOpenHistory}
      />

      <View style={styles.resultMetricGrid}>
        <View style={styles.resultMetric} testID="sprint-result-rating-change">
          <Text style={styles.resultMetricLabel}>Rating Change</Text>
          <Text style={[styles.resultMetricValue, delta >= 0 ? styles.positive : styles.errorText]}>
            {delta >= 0 ? "+" : ""}
            {delta}
          </Text>
          <Text testID="sprint-result-rating-range" style={styles.resultMetricSubtext}>{`${state.ratingBefore} -> ${ratingAfter}`}</Text>
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

      <View style={styles.resultReviewRow} testID="sprint-result-review-impact">
        <View>
          <Text style={styles.listText}>Mistakes</Text>
          <Text style={styles.helperText}>
            {state.mistakeCount > 0 ? `Review your mistakes · ${reviewImpact}` : reviewImpact}
          </Text>
        </View>
        <Text
          testID="sprint-result-mistakes"
          style={[styles.resultReviewCount, state.mistakeCount > 0 ? styles.errorText : styles.positive]}
        >
          {state.mistakeCount}
        </Text>
      </View>

      {onReview && shouldPrioritizeReview ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Review mistakes"
          testID="review-mistakes-button"
          style={[styles.primaryButton, styles.summaryPrimaryAction]}
          onPress={onReview}
        >
          <Text style={styles.primaryButtonText}>Review Mistakes</Text>
        </Pressable>
      ) : null}

      <View style={styles.summaryRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Play again"
          testID="play-again-button"
          style={shouldPrioritizeReview ? styles.secondaryButton : styles.primaryButton}
          onPress={onReplay}
        >
          <Text style={shouldPrioritizeReview ? styles.secondaryButtonText : styles.primaryButtonText}>Play again</Text>
        </Pressable>
      </View>
      {onReview && !shouldPrioritizeReview ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Review mistakes"
          testID="review-mistakes-button"
          style={styles.secondaryButton}
          onPress={onReview}
        >
          <Text style={styles.secondaryButtonText}>Review Mistakes</Text>
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
    <View style={styles.errorPanel} testID="error-panel">
      <Text style={styles.errorText}>{error}</Text>
    </View>
  );
}

function PracticePrompt({
  currentPuzzle,
  mode,
  promptText,
  promptHint
}: {
  currentPuzzle: CurrentPuzzleState | undefined;
  mode: SprintMode;
  promptText?: string | null;
  promptHint?: string | null;
}): React.JSX.Element | null {
  if (!currentPuzzle) {
    return null;
  }
  const side = sideToMove(currentPuzzle.currentFen) === "b" ? "black" : "white";
  const isArrowDuel = currentPuzzle.kind === "arrow_duel";
  const promptMode = mode === "arrow_duel" ? "arrow_duel" : "standard";
  const defaultPromptTitle = isArrowDuel ? "Choose the best move" : "Find the best move";
  const defaultPromptContext = isArrowDuel
    ? `For ${side}, between the two arrows.`
    : `For ${side}.`;
  const displayedPromptText = promptText === undefined ? defaultPromptContext : promptText;
  const displayedPromptHint = promptHint === undefined
    ? (isArrowDuel ? "Watch for checks, captures, and attacks!" : null)
    : promptHint;

  return (
    <View style={styles.promptPanel} testID="practice-prompt">
      <View style={styles.promptIcon} testID="practice-prompt-icon">
        <PracticeModeGlyph mode={promptMode} inverse />
      </View>
      <View style={styles.promptCopy}>
        <Text style={styles.promptTitle}>{promptText === undefined ? defaultPromptTitle : modeLabel(mode)}</Text>
        {displayedPromptText ? <Text style={styles.promptText}>{displayedPromptText}</Text> : null}
        {displayedPromptHint ? (
          <Text style={styles.promptHint}>{displayedPromptHint}</Text>
        ) : null}
      </View>
    </View>
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
        <View style={[styles.modeTargetOuter, { borderColor: color }]} />
        <View style={[styles.modeTargetInner, { borderColor: color }]} />
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

function SessionScoreStrip({ state }: { state: SprintState }): React.JSX.Element {
  const leftCount = Math.max(0, state.config.targetCorrect - state.correctCount);
  return (
    <View
      accessibilityLabel={`Session score: solved ${state.correctCount}, mistakes ${state.mistakeCount}, left ${leftCount}`}
      style={styles.sessionScoreStrip}
      testID="session-score-strip"
    >
      <SessionScoreMetric label="Solved" metricTestID="session-score-solved" tone="positive" value={state.correctCount} />
      <SessionScoreMetric label="Mistakes" metricTestID="session-score-mistakes" tone="negative" value={state.mistakeCount} />
      <SessionScoreMetric label="Left" metricTestID="session-score-left" tone="neutral" value={leftCount} />
    </View>
  );
}

function SessionScoreMetric({
  label,
  metricTestID,
  tone,
  value
}: {
  label: string;
  metricTestID: string;
  tone: "positive" | "negative" | "neutral";
  value: number;
}): React.JSX.Element {
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${value}`}
      style={styles.sessionScoreMetric}
      testID={metricTestID}
    >
      <SessionScoreGlyph tone={tone} />
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

function MoveSideBadge({
  badgeTestID,
  compact = false,
  side
}: {
  badgeTestID: string;
  compact?: boolean;
  side: MoveSide;
}): React.JSX.Element {
  const sideLabel = sideToMoveLabel(side);
  return (
    <View
      accessible
      accessibilityLabel={sideToMoveAccessibilityLabel(side)}
      style={styles.moveSideBadge}
      testID={badgeTestID}
    >
      <MoveSideGlyph side={side} />
      <Text numberOfLines={1} style={styles.moveSideBadgeText} testID={`${badgeTestID}-label`}>
        {compact ? sideLabel : `${sideLabel} to move`}
      </Text>
    </View>
  );
}

function MoveSideGlyph({ side }: { side: MoveSide }): React.JSX.Element {
  return (
    <View
      style={[
        styles.moveSideGlyph,
        side === "w" ? styles.moveSideGlyphWhite : styles.moveSideGlyphBlack
      ]}
      testID={`move-side-${side === "w" ? "white" : "black"}-glyph`}
    >
      <View
        style={[
          styles.moveSideGlyphBase,
          side === "w" ? styles.moveSideGlyphWhiteBase : styles.moveSideGlyphBlackBase
        ]}
      />
    </View>
  );
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
  performance,
  ratingKeys,
  selectedRatingKey,
  timeRange,
  sourceFilter,
  resultFilter,
  ratingRangeFilter,
  sideFilter,
  themeFilter,
  availableThemes,
  page,
  reviewStatusFilter,
  sprintOnly,
  wrongOnly,
  onRatingKeyChange,
  onTimeRangeChange,
  onSourceFilterChange,
  onResultFilterChange,
  onRatingRangeFilterChange,
  onSideFilterChange,
  onThemeFilterChange,
  onReviewStatusFilterChange,
  onPageOffsetChange,
  onOpenAttempt,
  onResetFilters,
  onToggleSprintOnly,
  onToggleWrongOnly
}: {
  adaptiveLayout: AdaptiveLayout;
  attempts: HistoryAttemptView[];
  performance: HistoryPerformance;
  ratingKeys: string[];
  selectedRatingKey: string | null;
  timeRange: HistoryTimeRange;
  sourceFilter: "all" | AttemptSource;
  resultFilter: "all" | "correct" | "wrong";
  ratingRangeFilter: HistoryRatingRangeFilter;
  sideFilter: "all" | PuzzleSide;
  themeFilter: string;
  availableThemes: string[];
  page: { limit: number; offset: number; total: number; hasMore: boolean };
  reviewStatusFilter: "all" | HistoryReviewStatus;
  sprintOnly: boolean;
  wrongOnly: boolean;
  onRatingKeyChange: (ratingKey: string | null) => void;
  onTimeRangeChange: (range: HistoryTimeRange) => void;
  onSourceFilterChange: (source: "all" | AttemptSource) => void;
  onResultFilterChange: (result: "all" | "correct" | "wrong") => void;
  onRatingRangeFilterChange: (ratingRange: HistoryRatingRangeFilter) => void;
  onSideFilterChange: (side: "all" | PuzzleSide) => void;
  onThemeFilterChange: (theme: string) => void;
  onReviewStatusFilterChange: (status: "all" | HistoryReviewStatus) => void;
  onPageOffsetChange: (offset: number) => void;
  onOpenAttempt: (attemptId: string) => void;
  onResetFilters: () => void;
  onToggleSprintOnly: () => void;
  onToggleWrongOnly: () => void;
}): React.JSX.Element {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const visibleAttempts = attempts;
  const ratingPoints = performance.charts.rating;
  const latestRating = ratingPoints[ratingPoints.length - 1]?.value;
  const activeFilterLabels = historyActiveFilterLabels({
    ratingKey: selectedRatingKey,
    ratingRangeFilter,
    resultFilter,
    reviewStatusFilter,
    sideFilter,
    sourceFilter,
    themeFilter,
    timeRange
  });
  return (
    <View style={[styles.historyPanel, adaptiveLayout.usesWideContent ? styles.historyPanelWide : null]} testID="history-panel">
      <View style={styles.historyHeaderRow} testID="history-action-header">
        <Text style={styles.screenTitle}>History</Text>
        <View style={styles.historyHeaderActions}>
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
            onPress={() => setFiltersExpanded((current) => !current)}
          >
            <FilterGlyph active={filtersExpanded} />
          </Pressable>
        </View>
      </View>

      <View style={styles.historyTopFilterStack} testID="history-primary-filters">
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
              label={historyRatingKeyLabel(ratingKey)}
              testID={`history-rating-${ratingKey}`}
              onPress={() => onRatingKeyChange(ratingKey)}
            />
          ))}
        </HistoryChipRow>
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
        <View style={styles.historyQuickFilterRow}>
          <HistoryQuickToggle
            active={wrongOnly}
            accessibilityLabel="Wrong puzzles only"
            controlTestID="history-filter-wrong-only"
            label="Wrong only"
            onPress={onToggleWrongOnly}
          />
          <HistoryQuickToggle
            active={sprintOnly}
            accessibilityLabel="Sprint attempts only"
            controlTestID="history-filter-sprint-only"
            label="Sprint only"
            onPress={onToggleSprintOnly}
          />
        </View>
      </View>

      {selectedRatingKey ? (
        <View style={styles.historyPerformanceCard} testID="history-performance-card">
          <View style={styles.historyPerformanceHeader}>
            <View>
              <Text style={styles.panelTitle}>Rating Trend</Text>
              <Text testID="history-performance-context" style={styles.helperText}>
                {`${historyRatingKeyLabel(selectedRatingKey)} · ${historyRangeLabel(timeRange)}`}
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

      {filtersExpanded ? (
        <View style={styles.historyAdvancedFilters} testID="history-advanced-filters">
          <HistoryChipRow testID="history-source-filters">
            <FilterButton active={sourceFilter === "all"} label="All" testID="history-source-all" onPress={() => onSourceFilterChange("all")} />
            <FilterButton active={sourceFilter === "sprint"} label="Sprint" testID="history-source-sprint" onPress={() => onSourceFilterChange("sprint")} />
            <FilterButton active={sourceFilter === "scheduled_review"} label="Review" testID="history-source-review" onPress={() => onSourceFilterChange("scheduled_review")} />
          </HistoryChipRow>
          <HistoryChipRow testID="history-result-filters">
            <FilterButton active={resultFilter === "all"} label="All" testID="history-result-all" onPress={() => onResultFilterChange("all")} />
            <FilterButton active={resultFilter === "correct"} label="Correct" testID="history-result-correct" onPress={() => onResultFilterChange("correct")} />
            <FilterButton active={resultFilter === "wrong"} label="Wrong" testID="history-result-wrong" onPress={() => onResultFilterChange("wrong")} />
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
          <HistoryChipRow testID="history-review-status-filters">
            <FilterButton active={reviewStatusFilter === "all"} label="All review states" testID="history-review-status-all" onPress={() => onReviewStatusFilterChange("all")} />
            <FilterButton active={reviewStatusFilter === "queued"} label="Queued" testID="history-review-status-queued" onPress={() => onReviewStatusFilterChange("queued")} />
            <FilterButton active={reviewStatusFilter === "clear"} label="Clear" testID="history-review-status-clear" onPress={() => onReviewStatusFilterChange("clear")} />
          </HistoryChipRow>
          <HistoryChipRow testID="history-side-filters">
            <FilterButton active={sideFilter === "all"} label="Both sides" testID="history-side-all" onPress={() => onSideFilterChange("all")} />
            <FilterButton active={sideFilter === "white"} label="White" testID="history-side-white" onPress={() => onSideFilterChange("white")} />
            <FilterButton active={sideFilter === "black"} label="Black" testID="history-side-black" onPress={() => onSideFilterChange("black")} />
          </HistoryChipRow>
          {availableThemes.length > 0 ? (
            <HistoryChipRow testID="history-theme-filters">
              <FilterButton active={themeFilter === "all"} label="All themes" testID="history-theme-all" onPress={() => onThemeFilterChange("all")} />
              {availableThemes.slice(0, 8).map((theme) => (
                <FilterButton
                  key={theme}
                  active={themeFilter === theme}
                  label={theme}
                  testID={`history-theme-${theme}`}
                  onPress={() => onThemeFilterChange(theme)}
                />
              ))}
            </HistoryChipRow>
          ) : null}
        </View>
      ) : null}

      <HistoryActiveFilterStrip labels={activeFilterLabels} />

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
          onOpen={() => onOpenAttempt(attempt.id)}
        />
      ))}
    </View>
  );
}

type HistoryActiveFilterInput = {
  ratingKey: string | null;
  ratingRangeFilter: HistoryRatingRangeFilter;
  resultFilter: "all" | "correct" | "wrong";
  reviewStatusFilter: "all" | "queued" | "clear";
  sideFilter: "all" | PuzzleSide;
  sourceFilter: "all" | AttemptSource;
  themeFilter: string;
  timeRange: HistoryTimeRange;
};

function historyActiveFilterLabels({
  ratingKey,
  ratingRangeFilter,
  resultFilter,
  reviewStatusFilter,
  sideFilter,
  sourceFilter,
  themeFilter,
  timeRange
}: HistoryActiveFilterInput): string[] {
  const labels = [
    historyRangeLabel(timeRange),
    ratingKey ? historyRatingKeyLabel(ratingKey) : "All puzzles"
  ];
  if (sourceFilter !== "all") {
    labels.push(sourceFilter === "scheduled_review" ? "Review" : "Sprint");
  }
  if (resultFilter !== "all") {
    labels.push(resultFilter === "correct" ? "Correct" : "Wrong only");
  }
  if (ratingRangeFilter !== "all") {
    labels.push(HISTORY_RATING_RANGE_FILTERS.find((filter) => filter.id === ratingRangeFilter)?.label ?? ratingRangeFilter);
  }
  if (reviewStatusFilter !== "all") {
    labels.push(reviewStatusFilter === "queued" ? "Queued" : "Clear");
  }
  if (sideFilter !== "all") {
    labels.push(sideFilter === "white" ? "White" : "Black");
  }
  if (themeFilter !== "all") {
    labels.push(themeFilter);
  }
  return labels;
}

function HistoryActiveFilterStrip({ labels }: { labels: string[] }): React.JSX.Element {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="history-active-filter-summary"
    >
      <View style={styles.historyChipContent}>
        {labels.map((label, index) => (
          <View key={`${label}-${index}`} style={styles.historyActiveFilterChip} testID={`history-active-filter-${index}`}>
            <Text style={styles.historyActiveFilterText}>{label}</Text>
          </View>
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

function historyRatingKeyLabel(ratingKey: string): string {
  const speed = ratingKey.match(/\/(\d+)\b/)?.[1];
  const speedLabel = speed ? ` · ${speed}s pace` : "";
  return `${ratingLabelFromKey(ratingKey)}${speedLabel}`;
}

function ResultBadgeGlyph({ tone }: { tone: "correct" | "wrong" | "alert" }): React.JSX.Element {
  if (tone === "correct") {
    return (
      <View style={styles.resultBadgeGlyphCanvas} testID="result-badge-correct-glyph">
        <View style={[styles.resultBadgeGlyphLine, styles.resultBadgeCheckShort]} />
        <View style={[styles.resultBadgeGlyphLine, styles.resultBadgeCheckLong]} />
      </View>
    );
  }

  if (tone === "wrong") {
    return (
      <View style={styles.resultBadgeGlyphCanvas} testID="result-badge-wrong-glyph">
        <View style={[styles.resultBadgeGlyphLine, styles.resultBadgeCrossForward]} />
        <View style={[styles.resultBadgeGlyphLine, styles.resultBadgeCrossBackward]} />
      </View>
    );
  }

  return (
    <View style={styles.resultBadgeGlyphCanvas} testID="result-badge-alert-glyph">
      <View style={styles.resultBadgeAlertBar} />
      <View style={styles.resultBadgeAlertDot} />
    </View>
  );
}

function HistoryChipRow({
  children,
  testID
}: {
  children: React.ReactNode;
  testID: string;
}): React.JSX.Element {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      testID={testID}
    >
      <View style={styles.historyChipContent}>
        {children}
      </View>
    </ScrollView>
  );
}

function HistoryQuickToggle({
  accessibilityLabel,
  active,
  controlTestID,
  label,
  onPress
}: {
  accessibilityLabel: string;
  active: boolean;
  controlTestID: string;
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: active }}
      accessibilityValue={{ text: active ? "On" : "Off" }}
      testID={controlTestID}
      style={styles.historyQuickToggle}
      onPress={onPress}
    >
      <Text style={styles.filterButtonText}>{label}</Text>
      <View style={[styles.historyToggleTrack, active ? styles.historyToggleTrackActive : null]}>
        <View style={[styles.historyToggleThumb, active ? styles.historyToggleThumbActive : null]} />
      </View>
    </Pressable>
  );
}

function HistoryAttemptRow({
  attempt,
  onOpen
}: {
  attempt: HistoryAttemptView;
  onOpen: () => void;
}): React.JSX.Element {
  const isWrong = attempt.result === "wrong";
  const completedAtMs = new Date(attempt.completedAt).getTime();
  const elapsedSeconds = Math.max(0, Math.round((completedAtMs - new Date(attempt.startedAt).getTime()) / 1000));
  const dateLabel = `${historyAttemptRecencyLabel(completedAtMs)} · ${formatLocalCalendarDate(attempt.completedAt)}`;
  const primaryTheme = historyAttemptThemeLabel(attempt);
  const pace = historyAttemptSpeedSeconds(attempt);
  const paceLabel = pace === null ? null : `${pace}s pace`;
  const resultLabel = isWrong ? "Wrong move" : "Correct";
  const submittedMoveLabel = isWrong
    ? `Played ${attempt.submittedMove} · Best ${attempt.expectedMove}`
    : `Move ${attempt.submittedMove}`;
  const sourceLabel = attempt.source === "scheduled_review" ? "Review" : "Sprint";
  const compactContext = [primaryTheme, paceLabel].filter(Boolean).join(" · ");
  const puzzleIdentity = `ID ${attempt.puzzleId} · Rating ${attempt.puzzleRating}`;
  const compactMeta = `${sourceLabel} · ${elapsedSeconds}s · ${dateLabel}`;
  const rowAccessibilityLabel = [
    `Open ${modeLabel(attempt.mode)} ${attempt.result} puzzle review`,
    resultLabel,
    submittedMoveLabel,
    puzzleIdentity,
    compactContext,
    compactMeta
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
        style={[styles.historyResultBadge, isWrong ? styles.historyResultWrong : styles.historyResultCorrect]}
        testID={`history-attempt-${attempt.id}-badge`}
      >
        <ResultBadgeGlyph tone={isWrong ? "wrong" : "correct"} />
      </View>
      <View style={styles.historyAttemptCopy}>
        <View style={styles.historyAttemptHeader}>
          <Text style={styles.historyRowTitle}>{modeLabel(attempt.mode)}</Text>
          <Text testID={`history-attempt-${attempt.id}-result`} style={styles.helperText}>{resultLabel}</Text>
        </View>
        <Text testID={`history-attempt-${attempt.id}-identity`} style={styles.helperText}>{puzzleIdentity}</Text>
        <Text testID={`history-attempt-${attempt.id}-context`} style={styles.helperText}>{compactContext}</Text>
        <Text testID={`history-attempt-${attempt.id}-meta`} style={styles.helperText}>{compactMeta}</Text>
      </View>
      <View style={styles.historyAttemptChevron} testID={`history-attempt-${attempt.id}-chevron`}>
        <ChevronGlyph direction="right" />
      </View>
    </Pressable>
  );
}

function historyAttemptRecencyLabel(completedAtMs: number): string {
  const nowMs = Date.now();
  if (!Number.isFinite(completedAtMs) || completedAtMs > nowMs) {
    return "Scheduled";
  }
  const elapsedDays = Math.floor((nowMs - completedAtMs) / (24 * 60 * 60 * 1000));
  if (elapsedDays === 0) {
    return "Today";
  }
  if (elapsedDays === 1) {
    return "Yesterday";
  }
  if (elapsedDays < 7) {
    return `${elapsedDays} days ago`;
  }
  if (elapsedDays < 30) {
    const weeks = Math.floor(elapsedDays / 7);
    return `${weeks}w ago`;
  }
  if (elapsedDays < 365) {
    const months = Math.floor(elapsedDays / 30);
    return `${months}mo ago`;
  }
  const years = Math.floor(elapsedDays / 365);
  return `${years}y ago`;
}

function historyAttemptThemeLabel(attempt: HistoryAttemptView): string {
  const theme = attempt.themes[0];
  return theme ? titleCase(theme) : "Mixed";
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
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

function ChevronGlyph({ direction }: { direction: "left" | "right" }): React.JSX.Element {
  return (
    <View style={styles.chevronGlyphCanvas} testID={`chevron-${direction}-glyph`}>
      <View style={[styles.chevronGlyph, direction === "left" ? styles.chevronGlyphLeft : styles.chevronGlyphRight]} />
    </View>
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

type ReviewEntryGroup = {
  key: string;
  mode: SprintMode;
  ratingKey: string;
  entries: ReviewEntry[];
};

function groupReviewEntriesByContext(entries: ReviewEntry[]): ReviewEntryGroup[] {
  const groups = new Map<string, { key: string; mode: SprintMode; ratingKey: string; entries: ReviewEntry[] }>();
  for (const entry of entries) {
    const key = `${entry.mode}:${entry.ratingKey}`;
    const group = groups.get(key) ?? {
      key,
      mode: entry.mode,
      ratingKey: entry.ratingKey,
      entries: []
    };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => left.ratingKey.localeCompare(right.ratingKey));
}

function collectReviewThemeFilters(items: ReviewQueueItem[]): string[] {
  const themes = new Set<string>();
  for (const item of items) {
    for (const theme of item.puzzle.themes.slice(0, 2)) {
      themes.add(theme);
    }
  }
  return [...themes].sort((left, right) => left.localeCompare(right)).slice(0, 4);
}

function collectReviewSpeedFilters(items: ReviewQueueItem[]): number[] {
  const speeds = new Set<number>();
  for (const item of items) {
    const speed = reviewItemSpeedSeconds(item);
    if (speed !== null) {
      speeds.add(speed);
    }
  }
  return [...speeds].sort((left, right) => left - right);
}

function reviewItemSpeedSeconds(item: ReviewQueueItem): number | null {
  const match = item.review.ratingKey.match(/\/(\d+)\b/);
  return match ? Number(match[1]) : null;
}

function reviewItemSourceSprintLabel(item: ReviewQueueItem): string {
  const speed = reviewItemSpeedSeconds(item);
  const speedLabel = speed === null ? null : `${speed}s pace`;
  return `Source sprint: ${modeLabel(item.review.mode)}${speedLabel ? ` · ${speedLabel}` : ""}`;
}

function filterReviewQueueItems(items: ReviewQueueItem[], filter: ReviewQueueFilter, nowMs: number): ReviewQueueItem[] {
  return items.filter((item) => {
    if (filter === "all") {
      return true;
    }
    if (filter === "overdue") {
      return isReviewOverdue(item.review, nowMs);
    }
    if (filter === "failed") {
      return item.review.lapseCount > 0;
    }
    if (filter === "arrow_duel") {
      return item.review.mode === "arrow_duel";
    }
    if (filter.startsWith("mode:")) {
      return item.review.mode === filter.slice("mode:".length);
    }
    if (filter.startsWith("theme:")) {
      return item.puzzle.themes.includes(filter.slice("theme:".length));
    }
    if (filter.startsWith("speed:")) {
      return reviewItemSpeedSeconds(item) === Number(filter.slice("speed:".length));
    }
    return true;
  });
}

function reviewQueueFilterLabel(filter: ReviewQueueFilter): string {
  if (filter === "all") {
    return "All due";
  }
  if (filter === "overdue") {
    return "Overdue";
  }
  if (filter === "failed") {
    return "Failed again";
  }
  if (filter === "arrow_duel") {
    return "Arrow Duel only";
  }
  if (filter.startsWith("mode:")) {
    return modeLabel(filter.slice("mode:".length) as SprintMode);
  }
  if (filter.startsWith("theme:")) {
    return filter.slice("theme:".length);
  }
  if (filter.startsWith("speed:")) {
    return `${filter.slice("speed:".length)}s pace`;
  }
  return "All due";
}

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

type ReviewEntry = {
  puzzle: Puzzle;
  mode: SprintMode;
  ratingKey: string;
  source: "session" | "due" | "history";
  attempt?: AttemptEvent | HistoryAttemptView;
};

type ReviewQueueFilter =
  | "all"
  | "overdue"
  | "failed"
  | "arrow_duel"
  | `mode:${SprintMode}`
  | `speed:${number}`
  | `theme:${string}`;

type ReviewPuzzleState =
  | { kind: "line"; line: PuzzleLineState }
  | { kind: "arrow_duel"; duel: ArrowDuelState };

function ReviewPanel({
  adaptiveLayout,
  boardSize,
  currentTimeMs,
  dueReviewItems,
  nowMs,
  onExitSessionReview,
  onOpenPractice,
  onPromoteNextFutureReviewsToDue,
  onReviewRecorded,
  onSessionActiveChange,
  onScheduleTestReviewReminder,
  reviewQueue,
  reviewReminderScheduleStatus,
  service,
  sessionMistakeReviewItems,
  stockfish
}: {
  adaptiveLayout: AdaptiveLayout;
  boardSize: number;
  currentTimeMs: () => number;
  dueReviewItems: ReviewQueueItem[];
  nowMs: number;
  onExitSessionReview: () => void;
  onOpenPractice: () => void;
  onPromoteNextFutureReviewsToDue?: () => ReviewQueueDuePromotionResult;
  onReviewRecorded: (completedAt: string) => void;
  onSessionActiveChange?: (active: boolean) => void;
  onScheduleTestReviewReminder?: () => Promise<ReviewReminderScheduleResult>;
  reviewQueue: ReviewQueueState[];
  reviewReminderScheduleStatus?: string;
  service: PracticeService;
  sessionMistakeReviewItems: SessionMistakeReviewItem[];
  stockfish: MobileStockfishCapabilities;
}): React.JSX.Element {
  const sessionEntries = sessionMistakeReviewItems.map((item): ReviewEntry => ({
    puzzle: item.puzzle,
    mode: item.attempt.mode,
    ratingKey: item.attempt.ratingKey,
    source: "session",
    attempt: item.attempt
  }));
  const preferredEntries = sessionEntries.length > 0
    ? sessionEntries
    : [];
  const preferredEntriesKey = preferredEntries.map((entry) => `${entry.source}:${entry.puzzle.id}:${entry.mode}:${entry.ratingKey}`).join("|");
  const [activeEntries, setActiveEntries] = useState<ReviewEntry[]>(preferredEntries);
  const [activeEntryInitialIndex, setActiveEntryInitialIndex] = useState(0);
  const [queuedReviewGroups, setQueuedReviewGroups] = useState<ReviewEntryGroup[]>([]);
  const [queueFilter, setQueueFilter] = useState<ReviewQueueFilter>("all");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [devStatus, setDevStatus] = useState<string | null>(null);
  const completedReviews = service.listCompletedReviewsForDay(new Date(nowMs).toISOString());
  const completedReviewEntries = completedReviews.map((item): ReviewEntry => ({
    puzzle: item.puzzle,
    mode: item.attempt.mode,
    ratingKey: item.attempt.ratingKey,
    source: "history",
    attempt: item.attempt
  }));
  const dailyReviewTotal = completedReviews.length + dueReviewItems.length;
  const dailyReviewProgressLabel = dailyReviewTotal === 0
    ? "0"
    : `${completedReviews.length} / ${dailyReviewTotal}`;
  const themeFilters = collectReviewThemeFilters(dueReviewItems);
  const speedFilters = collectReviewSpeedFilters(dueReviewItems);
  const filteredDueReviewItems = filterReviewQueueItems(dueReviewItems, queueFilter, nowMs);
  const filteredDueEntries = filteredDueReviewItems.map((item): ReviewEntry => ({
    puzzle: item.puzzle,
    mode: item.review.mode,
    ratingKey: item.review.ratingKey,
    source: "due"
  }));
  const filteredContextGroups = groupReviewEntriesByContext(filteredDueEntries);
  const queueSummary = reviewQueueSummary(reviewQueue, filteredDueReviewItems, nowMs);
  const activeFilterLabels = reviewActiveFilterLabels(queueFilter, queueSummary);
  const showActiveFilterStrip = filtersExpanded || queueFilter !== "all";
  const reviewDueSummaryLabel = filteredDueEntries.length > 0
    ? queueSummary.dueStatusLabel
    : dueReviewItems.length === 0
      ? "You're done for today"
      : "No matching scheduled reviews";
  const reviewDueFilterLabel = filteredDueEntries.length > 0
    ? `${reviewQueueFilterLabel(queueFilter)} · ${queueSummary.dueStatusLabel}`
    : "No matching scheduled reviews";
  const reviewDueSubline = reviewDueCardSubline(queueSummary.oldestDueLabel);

  useEffect(() => {
    setQueuedReviewGroups([]);
    setActiveEntryInitialIndex(0);
    setActiveEntries(preferredEntries);
    // preferredEntriesKey is the stable semantic identity for this derived array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredEntriesKey]);

  useEffect(() => {
    onSessionActiveChange?.(activeEntries.length > 0);
  }, [activeEntries.length, onSessionActiveChange]);

  useEffect(() => {
    return () => {
      onSessionActiveChange?.(false);
    };
  }, [onSessionActiveChange]);

  function startReviewGroupQueue(groups: ReviewEntryGroup[]): void {
    const [firstGroup, ...remainingGroups] = groups;
    if (!firstGroup) {
      return;
    }
    setQueuedReviewGroups(remainingGroups);
    setActiveEntryInitialIndex(0);
    setActiveEntries(firstGroup.entries);
  }

  function startSingleReviewGroup(entries: ReviewEntry[]): void {
    setQueuedReviewGroups([]);
    setActiveEntryInitialIndex(0);
    setActiveEntries(entries);
  }

  function openCompletedReview(attemptId: string): void {
    const nextIndex = completedReviewEntries.findIndex((entry) => entry.attempt?.id === attemptId);
    if (nextIndex < 0) {
      return;
    }
    setQueuedReviewGroups([]);
    setActiveEntryInitialIndex(nextIndex);
    setActiveEntries(completedReviewEntries);
  }

  function finishActiveReview(source: ReviewEntry["source"]): void {
    if (source === "due") {
      const [nextGroup, ...remainingGroups] = queuedReviewGroups;
      if (nextGroup) {
        setQueuedReviewGroups(remainingGroups);
        setActiveEntryInitialIndex(0);
        setActiveEntries(nextGroup.entries);
        return;
      }
    }
    setQueuedReviewGroups([]);
    setActiveEntryInitialIndex(0);
    setActiveEntries([]);
    if (source === "session") {
      onExitSessionReview();
    }
  }

  if (activeEntries.length > 0) {
    return (
      <ReviewSession
        key={`${activeEntryInitialIndex}:${activeEntries.map((entry) => `${entry.source}:${entry.puzzle.id}:${entry.mode}:${entry.ratingKey}`).join("|")}`}
        adaptiveLayout={adaptiveLayout}
        boardSize={boardSize}
        currentTimeMs={currentTimeMs}
        entries={activeEntries}
        hasQueuedDueReviews={queuedReviewGroups.length > 0}
        initialIndex={activeEntryInitialIndex}
        scheduledReviewCompletedCount={completedReviews.length}
        scheduledReviewTotal={dailyReviewTotal}
        service={service}
        onReviewRecorded={onReviewRecorded}
        onExit={finishActiveReview}
        stockfish={stockfish}
      />
    );
  }

  return (
    <View style={styles.reviewQueuePanel} testID="review-panel">
      <View style={styles.historyHeaderRow} testID="review-action-header">
        <Text style={styles.screenTitle}>Review</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={filtersExpanded ? "Hide review filters" : "Show review filters"}
          accessibilityState={{ expanded: filtersExpanded }}
          testID="review-filter-toggle"
          style={[styles.reviewFilterButton, filtersExpanded ? styles.reviewFilterButtonActive : null]}
          onPress={() => setFiltersExpanded((current) => !current)}
        >
          <FilterGlyph active={filtersExpanded} />
        </Pressable>
      </View>

      <View
        accessibilityLabel={dailyReviewTotal === 0
          ? `Today, no reviews scheduled, ${queueSummary.tomorrowCount} tomorrow, ${queueSummary.nextSevenDaysCount} in the next 7 days, ${queueSummary.totalCount} total, ${reviewDueFilterLabel}`
          : `Today, ${completedReviews.length} of ${dailyReviewTotal} reviews completed, ${dueReviewItems.length} remaining${queueSummary.overdueCount > 0 ? `, ${queueSummary.overdueCount} overdue` : ""}, ${queueSummary.tomorrowCount} tomorrow, ${queueSummary.nextSevenDaysCount} in the next 7 days, ${queueSummary.totalCount} total, ${reviewDueFilterLabel}`}
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
          {queueSummary.overdueCount > 0 ? (
            <>
              <Text testID="review-overdue-count" style={[styles.reviewDueOverdueCount, styles.errorText]}>
                {queueSummary.overdueCount}
              </Text>
              <Text style={styles.reviewDueOverdueLabel}>Overdue</Text>
            </>
          ) : null}
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

      {showActiveFilterStrip ? <ReviewActiveFilterStrip labels={activeFilterLabels} /> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start due review"
        accessibilityState={{ disabled: filteredDueEntries.length === 0 }}
        disabled={filteredDueEntries.length === 0}
        testID="review-start-due"
        style={[styles.primaryButton, styles.reviewStartButton, filteredDueEntries.length === 0 ? styles.disabledButton : null]}
        onPress={() => startReviewGroupQueue(filteredContextGroups)}
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

      {filtersExpanded ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.reviewFilterScroller}
          contentContainerStyle={styles.reviewFilterContent}
          testID="review-queue-filters"
        >
          <FilterButton active={queueFilter === "all"} label="All due" testID="review-filter-all" onPress={() => setQueueFilter("all")} />
          <FilterButton active={queueFilter === "overdue"} label="Overdue" testID="review-filter-overdue" onPress={() => setQueueFilter("overdue")} />
          <FilterButton active={queueFilter === "failed"} label="Failed again" testID="review-filter-failed" onPress={() => setQueueFilter("failed")} />
          <FilterButton active={queueFilter === "mode:standard"} label="Standard" testID="review-filter-mode-standard" onPress={() => setQueueFilter("mode:standard")} />
          <FilterButton active={queueFilter === "arrow_duel"} label="Arrow Duel only" testID="review-filter-arrow-duel" onPress={() => setQueueFilter("arrow_duel")} />
          {speedFilters.map((speed) => (
            <FilterButton
              key={speed}
              active={queueFilter === `speed:${speed}`}
              label={`${speed}s pace`}
              testID={`review-filter-speed-${speed}`}
              onPress={() => setQueueFilter(`speed:${speed}`)}
            />
          ))}
          {themeFilters.map((theme) => (
            <FilterButton
              key={theme}
              active={queueFilter === `theme:${theme}`}
              label={theme}
              testID={`review-filter-theme-${safeTestId(theme)}`}
              onPress={() => setQueueFilter(`theme:${theme}`)}
            />
          ))}
        </ScrollView>
      ) : null}

      {filtersExpanded && filteredDueReviewItems.length > 0 ? (
        <View style={styles.reviewItemList} testID="review-due-items">
          <Text style={styles.sectionLabel}>Due items</Text>
          {filteredDueReviewItems.slice(0, 4).map((item) => (
            <ReviewQueueItemCard
              key={`${item.review.puzzleId}:${item.review.mode}:${item.review.ratingKey}`}
              item={item}
              nowMs={nowMs}
              onPress={() => startSingleReviewGroup([{
                puzzle: item.puzzle,
                mode: item.review.mode,
                ratingKey: item.review.ratingKey,
                source: "due"
              }])}
            />
          ))}
        </View>
      ) : null}

      {filtersExpanded && filteredContextGroups.length > 0 ? (
        <View style={styles.reviewContextList} testID="review-context-list">
          <Text style={styles.sectionLabel}>Review groups</Text>
          {filteredContextGroups.map((group) => (
            <Pressable
              key={group.key}
              accessibilityRole="button"
              accessibilityLabel={`Start ${modeLabel(group.mode)} reviews`}
              testID={`review-context-${safeTestId(group.key)}`}
              style={styles.reviewContextCard}
              onPress={() => startSingleReviewGroup(group.entries)}
            >
              <View>
                <Text style={styles.historyRowTitle}>{modeLabel(group.mode)}</Text>
                <Text style={styles.helperText}>{historyRatingKeyLabel(group.ratingKey)}</Text>
              </View>
              <View style={styles.reviewContextMeta}>
                <Text style={styles.reviewContextCount}>{group.entries.length}</Text>
                <ChevronGlyph direction="right" />
              </View>
            </Pressable>
          ))}
        </View>
      ) : filteredDueReviewItems.length === 0 ? (
        <View style={styles.emptyReviewPanel} testID="review-empty-state">
          <Text style={styles.listText}>{dueReviewItems.length === 0 ? "You're done for today" : "No matching scheduled reviews"}</Text>
          <Text style={styles.helperText}>
            {dueReviewItems.length === 0
              ? queueSummary.oldestDueLabel
              : "Adjust filters or start the full due queue."}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Practice while waiting for reviews"
            testID="review-empty-practice"
            style={[styles.secondaryButton, styles.emptyReviewPracticeButton]}
            onPress={onOpenPractice}
          >
            <Text style={styles.secondaryButtonText}>Practice now</Text>
          </Pressable>
        </View>
      ) : null}

      {completedReviews.length > 0 ? (
        <View style={styles.reviewItemList} testID="review-today-history">
          <Text style={styles.sectionLabel}>Completed today</Text>
          {completedReviews.map((item) => (
            <TodayReviewAttemptRow
              key={item.attempt.id}
              item={item}
              onOpen={() => openCompletedReview(item.attempt.id)}
            />
          ))}
        </View>
      ) : null}

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

function reviewActiveFilterLabels(
  filter: ReviewQueueFilter,
  queueSummary: ReturnType<typeof reviewQueueSummary>
): string[] {
  const labels = [reviewQueueFilterLabel(filter)];
  if (queueSummary.overdueCount > 0) {
    labels.push(`${queueSummary.overdueCount} overdue`);
  }
  labels.push(`${queueSummary.totalCount} total`);
  return labels;
}

function ReviewActiveFilterStrip({ labels }: { labels: string[] }): React.JSX.Element {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="review-active-filter-summary"
    >
      <View style={styles.historyChipContent}>
        {labels.map((label, index) => (
          <View key={`${label}-${index}`} style={styles.historyActiveFilterChip} testID={`review-active-filter-${index}`}>
            <Text style={styles.historyActiveFilterText}>{label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function ReviewQueueItemCard({
  item,
  nowMs,
  onPress
}: {
  item: ReviewQueueItem;
  nowMs: number;
  onPress: () => void;
}): React.JSX.Element {
  const primaryTheme = item.puzzle.themes[0] ?? "mixed";
  const lastWrongDate = formatLocalCalendarDate(item.review.lastReviewedAt);
  const dueKind = reviewDueState(item.review, nowMs);
  const dueState = dueKind === "overdue"
    ? "Overdue"
    : dueKind === "due"
      ? "Due now"
      : `Due ${formatReviewDay(item.review.dueDay)}`;
  const source = reviewItemSourceSprintLabel(item);
  const compactSource = source.replace(/^Source sprint: /, "");
  const nextReviewNumber = item.review.reviewCount + 1;
  const rowTestId = `review-due-item-${item.puzzle.id}-${safeTestId(item.review.mode)}`;
  const accessibilityLabel = [
    `Start ${modeLabel(item.review.mode)} ${primaryTheme} review`,
    `Last wrong ${lastWrongDate}`,
    dueState,
    `${item.review.intervalDays} day interval`,
    source,
    `Review ${nextReviewNumber}`,
    `Lapses ${item.review.lapseCount}`
  ].join(", ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={rowTestId}
      style={styles.reviewItemCard}
      onPress={onPress}
    >
      <View style={styles.reviewItemCopy}>
        <Text style={styles.historyRowTitle}>{modeLabel(item.review.mode)}</Text>
        <Text testID={`${rowTestId}-context`} style={styles.helperText}>{primaryTheme} · Last wrong {lastWrongDate}</Text>
        <Text testID={`${rowTestId}-meta`} style={styles.helperText}>
          {dueState} · {item.review.intervalDays}d interval · {compactSource}
        </Text>
      </View>
      <ChevronGlyph direction="right" />
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
  boardSize,
  currentTimeMs,
  entries,
  hasQueuedDueReviews = false,
  initialIndex = 0,
  scheduledReviewCompletedCount = 0,
  scheduledReviewTotal = entries.length,
  service,
  onExit,
  onReviewRecorded,
  stockfish
}: {
  adaptiveLayout: AdaptiveLayout;
  boardSize: number;
  currentTimeMs: () => number;
  entries: ReviewEntry[];
  hasQueuedDueReviews?: boolean;
  initialIndex?: number;
  scheduledReviewCompletedCount?: number;
  scheduledReviewTotal?: number;
  service: PracticeService;
  onExit: (source: ReviewEntry["source"]) => void;
  onReviewRecorded?: (completedAt: string) => void;
  stockfish: MobileStockfishCapabilities;
}): React.JSX.Element {
  const boardRef = useRef<ChessboardRef | null>(null);
  const reviewSuppressedBoardMovesRef = useRef<string[]>([]);
  const reviewResultRecordedRef = useRef(false);
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
  const [punishmentLineComplete, setPunishmentLineComplete] = useState(false);
  const [lineReviewNeedsContinue, setLineReviewNeedsContinue] = useState(false);
  const [scheduledReviewProgress] = useState(() => {
    const firstEntry = entries[initialIndex] ?? entries[0];
    return firstEntry?.source === "due"
      ? {
          completedBeforeStart: scheduledReviewCompletedCount,
          total: Math.max(1, scheduledReviewTotal)
        }
      : null;
  });
  const currentEntry = entries[entryIndex];
  const hasNextScheduledReview = entryIndex + 1 < entries.length || hasQueuedDueReviews;
  const currentPuzzle = currentReviewPuzzleState(reviewState);
  const currentFen = currentPuzzle.currentFen;
  const displayFen = analysisEnabled ? (analysisFen ?? currentFen) : currentFen;
  const baseBoardFlipped = reviewStartingPerspectiveFlipped(currentEntry);
  const boardFlipped = manualBoardFlip ? !baseBoardFlipped : baseBoardFlipped;
  const feedbackMove = feedback?.submittedMove && feedback.submittedMove !== "__illegal__" ? arrowFromTo(feedback.submittedMove) : null;
  const shouldShowGuidedCurrentEval = !analysisEnabled && currentEntry.mode === "arrow_duel" && reviewState.kind === "line";
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
    !analysisEnabled && !feedback && currentEntry.mode === "arrow_duel" && reviewState.kind === "line"
      ? currentExpectedMove(reviewState.line)
      : undefined;
  const isArrowDuelFollowUpReview = currentEntry.mode === "arrow_duel" && reviewState.kind === "line";
  const boardGestureEnabled = !boardLocked && (!lineReviewNeedsContinue || analysisEnabled);
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
  const reviewPrimaryTheme = currentEntry.puzzle.themes[0] ?? "mixed";
  const reviewRemainingSeconds =
    currentEntry.source === "due" && (!reviewResultRecorded || reviewTimedOut)
      ? Math.max(0, reviewPerPuzzleSeconds - Math.floor((reviewNowMs - reviewStartedAtMs) / 1000))
      : null;
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
    recordCurrentReviewResult("wrong", {
      submittedMove: "__timeout__",
      expectedMove: expectedReviewMove(currentPuzzle)
    });
    if (!hasNextScheduledReview) {
      onExit(currentEntry.source);
      return;
    }
    setLineReviewNeedsContinue(true);
    // The timer state is the trigger; the render-local recorder must not restart the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEntry.source, currentPuzzle, reviewRemainingSeconds, reviewResultRecorded, reviewTimedOut]);

  function resetCurrentReview(nextIndex = entryIndex): void {
    const nextState = startReviewPuzzle(entries[nextIndex]);
    setEntryIndex(nextIndex);
    setReviewState(nextState);
    setFeedback(null);
    setLastMove(null);
    setBoardLocked(false);
    setWrongSeen(false);
    setPunishmentLineComplete(false);
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
    setLineReviewNeedsContinue(false);
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
      onExit(currentEntry.source);
      return;
    }
    resetCurrentReview(nextIndex);
  }

  function recordCurrentReviewResult(result: "correct" | "wrong", reviewMove?: { submittedMove: string; expectedMove: string }): void {
    if (currentEntry.source !== "due") {
      return;
    }
    if (reviewResultRecordedRef.current || reviewResultRecorded) {
      return;
    }
    reviewResultRecordedRef.current = true;
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
    if (boardLocked) {
      return;
    }
    resetCurrentReview(entryIndex);
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

    if (boardLocked) {
      boardRef.current?.resetBoard(currentFen);
      return;
    }
    if (lineReviewNeedsContinue && !analysisEnabled) {
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
      setFeedback(result.feedback);
      if (result.feedback.result === "wrong") {
        recordCurrentReviewResult("wrong", {
          submittedMove: result.feedback.submittedMove,
          expectedMove: result.feedback.expectedMove
        });
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
    if (reviewState.kind !== "arrow_duel" || !isArrowDuelCandidate(reviewState.duel.candidates, move)) {
      boardRef.current?.resetBoard(submittedFen);
      return;
    }
    setBoardLocked(true);
    const result = submitArrowDuelChoice(reviewState.duel, move);
    setFeedback(result.feedback);
    if (result.feedback.result === "correct") {
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
      line: lineStateAfterMoves(currentEntry.puzzle, result.feedback.autoPlayedMoves)
    });
    setFeedback(null);
    setBoardLocked(false);
  }

  async function submitReviewArrowFollowUpMove(move: string, submittedFen: string): Promise<void> {
    if (reviewState.kind !== "line") {
      boardRef.current?.resetBoard(submittedFen);
      return;
    }
    setBoardLocked(true);
    try {
      const result = submitArrowDuelFollowUpMove(reviewState.line, move);
      setFeedback(result.feedback);
      if (result.feedback.result === "wrong") {
        recordCurrentReviewResult("wrong", {
          submittedMove: result.feedback.submittedMove,
          expectedMove: result.feedback.expectedMove
        });
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
      setReviewState({ kind: "line", line: result.state });
      if (result.feedback.puzzleSolved) {
        await sleep(FEEDBACK_SNAPSHOT_MS);
        if (currentEntry.source === "due") {
          // A wrong Arrow Duel review stays on the same puzzle after the
          // punishment line; the user advances with the Continue button.
          recordCurrentReviewResult("wrong", {
            submittedMove: result.feedback.submittedMove,
            expectedMove: result.feedback.expectedMove
          });
          if (!hasNextScheduledReview) {
            goToNextDueReview();
            return;
          }
          setPunishmentLineComplete(true);
          setBoardLocked(false);
          return;
        }
        advanceReview("wrong", {
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
      reviewSuppressedBoardMovesRef.current.push(suppressedMove);
      const playedMove = await boardRef.current.move({
        from: move.from as Square,
        to: move.to as Square,
        ...(move.promotion ? { promotion: move.promotion as PieceSymbol } : {})
      });
      if (!playedMove) {
        consumeSuppressedBoardMove(suppressedMove, reviewSuppressedBoardMovesRef.current);
        boardRef.current?.resetBoard(finalFen);
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
    recordCurrentReviewResult("wrong");
    setWrongSeen(true);
    setFeedback(null);
    setAnalysisEnabled(true);
    setAnalysisFen(currentFen);
    setEngineAnalysisLines([]);
    setAnalysisEngineStatus("thinking");
    setAnalysisBackStack([]);
    setAnalysisForwardStack([]);
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

  return (
    <View style={[styles.reviewSessionPanel, adaptiveLayout.usesWideContent ? styles.reviewSessionPanelWide : null]} testID="review-session">
      <View style={styles.reviewHeaderRow}>
        <View style={styles.reviewTopNav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Exit review"
            testID="review-exit"
            style={styles.iconButton}
            onPress={() => onExit(currentEntry.source)}
          >
            <CloseGlyph />
          </Pressable>
          <View style={styles.reviewTitleBlock}>
            <Text style={styles.panelTitle}>Review</Text>
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
                  {boardLocked ? "locked" : "ready"}
                </Text>
              </>
            ) : null}
          </View>
          <View style={styles.iconButtonRow} testID="review-header-actions">
          {currentEntry.source === "session" || currentEntry.source === "history" ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous review puzzle"
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
                accessibilityLabel="Next review puzzle"
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
          {currentEntry.source !== "due" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset puzzle"
              accessibilityState={{ disabled: boardLocked }}
              disabled={boardLocked}
              testID="review-reset-puzzle"
              style={[styles.iconButton, boardLocked ? styles.disabledButton : null]}
              onPress={resetReviewPuzzle}
            >
              <Text style={styles.iconButtonText}>↺</Text>
            </Pressable>
          ) : null}
          </View>
        </View>
        <View style={styles.reviewContextStrip} testID="review-context-strip">
          {currentEntry.source === "session" ? (
            <View style={styles.reviewContextPill} testID="review-source-pill">
              <Text style={styles.reviewContextPillText}>Sprint review</Text>
            </View>
          ) : null}
          <MoveSideBadge badgeTestID="review-side-to-move" side={reviewSideToMove} />
          {currentEntry.source !== "due" ? (
            <View style={styles.reviewContextPill} testID="review-theme-pill">
              <Text style={styles.reviewContextPillText}>{reviewPrimaryTheme}</Text>
            </View>
          ) : null}
          {reviewRemainingSeconds !== null ? (
            <View style={[styles.reviewContextPill, reviewRemainingSeconds === 0 ? styles.reviewContextPillDanger : null]}>
              <Text testID="review-timer" style={[styles.reviewContextPillText, reviewRemainingSeconds === 0 ? styles.errorText : null]}>
                {reviewRemainingSeconds === 0 ? "Time expired" : formatDuration(reviewRemainingSeconds)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={[styles.reviewBoardLayout, adaptiveLayout.usesSessionRail ? styles.reviewBoardLayoutWide : null]}>
        <View style={styles.reviewBoardLane} testID="review-board-lane">
          <View testID="review-board" style={[styles.boardSurface, { width: boardSize, height: boardSize }]}>
            <Chessboard
              key={`${currentEntry.puzzle.id}-${entryIndex}`}
              ref={boardRef}
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
            {reviewState.kind === "arrow_duel" && !feedback && !analysisEnabled ? (
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
        </View>

        <View
          style={[
            styles.analysisPanel,
            adaptiveLayout.usesSessionRail ? styles.reviewAnalysisPanelWide : null,
            adaptiveLayout.usesSessionRail ? { width: adaptiveLayout.sessionRailWidth } : null
          ]}
          testID="review-analysis-panel"
        >
          <PracticePrompt
            currentPuzzle={currentPuzzle}
            mode={currentEntry.mode}
            promptText={
              isArrowDuelFollowUpReview
                ? null
                : undefined
            }
            promptHint={
              isArrowDuelFollowUpReview
                ? "Blue arrows show the next move in the punishment line. Follow them to see why the choice is bad."
                : undefined
            }
          />
          {((punishmentLineComplete && currentEntry.source === "due") || lineReviewNeedsContinue) && !analysisEnabled ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue to next review"
              testID="review-line-continue"
              style={[styles.primaryButton, styles.reviewContinueButton]}
              onPress={goToNextDueReview}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </Pressable>
          ) : null}
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
          {analysisEnabled || currentEntry.source !== "due" ? (
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
      </View>
    </View>
  );
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

function submitArrowDuelFollowUpMove(state: PuzzleLineState, move: string): {
  state: PuzzleLineState;
  feedback: PuzzleFeedback;
} {
  const expectedMove = state.puzzle.solutionMoves[state.cursor];
  if (!expectedMove) {
    throw new Error("Puzzle has no Arrow Duel follow-up move at current cursor");
  }

  const submittedMove = normalizeUci(move);
  const submittedFen = fenAfterMove(state.currentFen, submittedMove);
  if (!submittedFen) {
    throw new Error(`Move ${move} is not legal in the current position`);
  }
  if (submittedMove !== normalizeUci(expectedMove)) {
    return {
      state,
      feedback: {
        result: "wrong",
        puzzleSolved: false,
        submittedMove: move,
        expectedMove,
        autoPlayedMoves: [],
        currentFen: state.currentFen
      }
    };
  }

  let currentFen = submittedFen;
  let cursor = state.cursor + 1;
  const playedMoves = [...state.playedMoves, submittedMove];
  const autoPlayedMoves: string[] = [];
  const replyMove = state.puzzle.solutionMoves[cursor];
  if (replyMove) {
    const replyFen = fenAfterMove(currentFen, replyMove);
    if (!replyFen) {
      throw new Error(`Arrow Duel follow-up reply ${replyMove} is not legal`);
    }
    autoPlayedMoves.push(replyMove);
    playedMoves.push(normalizeUci(replyMove));
    currentFen = replyFen;
    cursor += 1;
  }

  const nextState: PuzzleLineState = {
    ...state,
    currentFen,
    playedMoves,
    cursor,
    autoPlayedMoves,
    solved: cursor >= state.puzzle.solutionMoves.length
  };

  return {
    state: nextState,
    feedback: {
      result: "correct",
      puzzleSolved: nextState.solved,
      submittedMove: move,
      expectedMove,
      autoPlayedMoves,
      currentFen
    }
  };
}

function reviewStartingFen(entry: ReviewEntry): string {
  return currentReviewPuzzleState(startReviewPuzzle(entry)).currentFen;
}

function reviewStartingPerspectiveFlipped(entry: ReviewEntry): boolean {
  return sideToMove(reviewStartingFen(entry)) === "b";
}

function currentReviewPuzzleState(state: ReviewPuzzleState): CurrentPuzzleState {
  if (state.kind === "arrow_duel") {
    return state.duel;
  }
  return state.line;
}

function expectedReviewMove(state: CurrentPuzzleState): string {
  if (state.kind === "arrow_duel") {
    return state.correctMove;
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
  return `scheduled|${result.scheduledAt ?? decision.scheduledAt}|${decision.dueCount}|${decision.body}|${decision.route}`;
}

function progressSyncStatusMessage(result: ProgressSyncResult): string {
  if (result.status === "disabled") {
    return "iCloud sync is off";
  }
  const importedCount = result.imported.ratings +
    result.imported.attempts +
    result.imported.reviewQueue +
    result.imported.sprintSessions;
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
  adaptiveLayout,
  applicationMetadata,
  onOpenDiagnostics,
  onOpenNotificationSettings,
  onAdjustRating,
  onRequestReviewReminderPermission,
  onSaveICloudSyncEnabled,
  onSaveReviewReminderPreference,
  onSyncICloudNow,
  iCloudSyncEnabled,
  iCloudSyncStatus,
  notificationPermissionStatus,
  ratings,
  reviewReminderScheduleStatus,
  reviewReminderPreference,
  standardRating
}: {
  adaptiveLayout: AdaptiveLayout;
  applicationMetadata: MobileApplicationMetadata;
  onOpenDiagnostics?: () => void;
  onOpenNotificationSettings: () => void;
  onAdjustRating: (ratingKey: string, nextRating: number) => RatingRecord;
  onRequestReviewReminderPermission: () => Promise<ReviewReminderPermissionStatus>;
  onSaveICloudSyncEnabled: (enabled: boolean) => void;
  onSaveReviewReminderPreference: (preference: ReviewReminderPreference) => void;
  onSyncICloudNow: () => Promise<string>;
  iCloudSyncEnabled: boolean;
  iCloudSyncStatus: string;
  notificationPermissionStatus: ReviewReminderPermissionStatus;
  ratings: Array<{ label: string; record: RatingRecord }>;
  reviewReminderScheduleStatus: string;
  reviewReminderPreference: ReviewReminderPreference;
  standardRating: number;
}): React.JSX.Element {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [advancedRatingsOpen, setAdvancedRatingsOpen] = useState(false);
  const bundledCoreManifest = getBundledCorePackManifest();

  return (
    <View style={[styles.settingsPanel, adaptiveLayout.usesWideContent ? styles.settingsPanelWide : null]} testID="settings-panel">
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
          <SettingsActionRow
            label="Sync Now"
            detail="Merge ratings, history, and review queue with your private iCloud."
            testID="settings-sync-now"
            onPress={() => {
              void onSyncICloudNow().then((message) => {
                setStatusMessage(message);
              });
            }}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection title="Notifications" testID="settings-notifications-section" wide={adaptiveLayout.usesWideContent}>
        <SettingsRow
          label="Review Reminders"
          value={reviewReminderPreferenceLabel(reviewReminderPreference)}
          detail={reviewReminderPermissionDetail(notificationPermissionStatus)}
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
            detail="Ask iOS permission after your first review session"
            testID="settings-review-reminder-enable"
            onPress={() => {
              void onRequestReviewReminderPermission().then((status) => {
                setStatusMessage(reviewReminderPermissionStatusMessage(status));
              });
            }}
          />
        ) : null}
        {notificationPermissionStatus === "denied" ? (
          <SettingsActionRow
            label="Open iOS Settings"
            detail="Notifications are blocked by iOS and cannot be requested again here"
            testID="settings-review-reminder-open-settings"
            onPress={() => {
              onOpenNotificationSettings();
              setStatusMessage("Opened iOS Settings");
            }}
          />
        ) : null}
        {arePracticeTestControlsEnabled() ? (
          <Text testID="settings-review-reminder-schedule-status" style={styles.reviewDueHiddenMetric}>
            {reviewReminderScheduleStatus}
          </Text>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Profile" testID="settings-profile-section" wide={adaptiveLayout.usesWideContent}>
        <SettingsRow
          label="Edit ELO"
          value={`ELO ${standardRating}`}
          detail="Standard and Arrow Duel difficulty"
          testID="settings-standard-elo-row"
          onPress={() => setAdvancedRatingsOpen((current) => !current)}
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

      <SettingsSection title="About" testID="settings-about-section" wide={adaptiveLayout.usesWideContent}>
        <SettingsRow
          label="App Version"
          value={applicationMetadata.buildNumber
            ? `${applicationMetadata.versionName} (${applicationMetadata.buildNumber})`
            : applicationMetadata.versionName}
          testID="settings-app-version"
        />
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
        <SettingsExternalLinkRow
          label="Support"
          value="Email"
          detail="Questions, feedback, and support"
          linkLabel={applicationMetadata.supportEmail}
          testID="settings-support-email"
          onPress={() => {
            void Linking.openURL(applicationMetadata.supportEmailUrl);
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

function reviewReminderPreferenceLabel(preference: ReviewReminderPreference): string {
  if (preference.mode === "fixed") {
    return preference.fixedLocalTime;
  }
  if (preference.mode === "off") {
    return "Off";
  }
  return "Smart";
}

function reviewReminderPermissionDetail(status: ReviewReminderPermissionStatus): string {
  switch (status) {
    case "authorized":
      return "Local notifications enabled";
    case "denied":
      return "Blocked in iOS Settings";
    case "not_determined":
      return "Permission not requested";
    case "unavailable":
      return "Notifications unavailable on this device";
  }
}

function reviewReminderPermissionStatusMessage(status: ReviewReminderPermissionStatus): string {
  switch (status) {
    case "authorized":
      return "Notifications enabled";
    case "denied":
      return "Notifications blocked in iOS Settings";
    case "not_determined":
      return "Notification permission not requested";
    case "unavailable":
      return "Notifications unavailable";
  }
}

function scheduledReviewAttemptCount(service: PracticeService): number {
  return (service.listHistory({ source: "scheduled_review" }) as AttemptEvent[]).length;
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
        Set each ELO to curate your preferred puzzle difficulty.
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
  const decrementDisabled = record.rating <= 600;
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
          onPress={() => onAdjust(record.key, Math.max(600, record.rating - 25))}
        >
          <MinusGlyph />
        </Pressable>
        <Text style={styles.settingsRowValue} testID={`${testID}-value`}>ELO {record.rating}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label} rating`}
          testID={`${testID}-increase`}
          style={styles.customStepperButton}
          onPress={() => onAdjust(record.key, record.rating + 25)}
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
  children,
  testID,
  title,
  wide = false
}: {
  children: React.ReactNode;
  testID: string;
  title: string;
  wide?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.settingsSection, wide ? styles.settingsSectionWide : null]} testID={testID}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.settingsSectionCard}>
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

    void stockfish.prewarm().then((prewarmed) => analyzeFenWithUciEngine(tracedTransport, selectedPosition.fen, {
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
      timeoutMs: 30000
    })).then(
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
      transport.send("stop");
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
              <Text style={styles.analysisEvalText}>{formatSideToMoveScore(line.score)}</Text>
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
              {formatSideToMoveScore(line.score)} · d{line.depth} · {line.multipv}. {diagnosticPvSan(selectedPosition.fen, line.pv)}
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
  const badgeWidth = badgeText.length === 1 ? 18 : badgeText.length === 2 ? 22 : 28;
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
              { width: badgeWidth },
              badgeTone === "danger" ? styles.tabCountBadgeDanger : null
            ]}
            testID={`${testID}-badge`}
          >
            {badgeText}
          </Text>
        ) : null}
      </View>
      {presentation === "bottom" || expanded ? (
        <Text style={[styles.tabText, presentation === "rail" ? styles.tabTextRail : null, active ? styles.tabTextActive : null]}>{label}</Text>
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
      <View style={[styles.tabClockGlyph, { borderColor: color }]}>
        <View style={[styles.tabClockHandVertical, { backgroundColor: color }]} />
        <View style={[styles.tabClockHandDiagonal, { backgroundColor: color }]} />
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

function boardMoveToUci(move: BoardMove): string {
  return `${move.from}${move.to}${move.promotion?.toLowerCase() ?? ""}`;
}

function consumeSuppressedBoardMove(move: string, suppressedMoves: string[]): boolean {
  const normalizedMove = move.toLowerCase();
  const index = suppressedMoves.findIndex((suppressedMove) => suppressedMove.toLowerCase() === normalizedMove);
  if (index === -1) {
    return false;
  }
  suppressedMoves.splice(index, 1);
  return true;
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

function formatDurationLabel(seconds: number): string {
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
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
  theme?: string
): SprintConfig {
  if (!useCustomTiming) {
    return defaultSprintConfig(mode);
  }
  const input: {
    mode: SprintMode;
    durationSeconds: number;
    perPuzzleSeconds: number;
    theme?: string;
  } = {
    mode,
    durationSeconds: customDurationSeconds,
    perPuzzleSeconds: customPerPuzzleSeconds
  };
  if (theme) {
    input.theme = theme;
  }
  return buildSprintConfig(input);
}

function themeForCustomSprint(theme: CustomThemeFilter): string | undefined {
  return theme === "mixed" ? undefined : theme;
}

function customThemeLabel(theme: CustomThemeFilter): string {
  if (theme === "mixed") {
    return "Mixed";
  }
  return theme
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function customThemeFromLabel(label: string): CustomThemeFilter {
  return CUSTOM_THEME_OPTIONS.find((theme) => customThemeLabel(theme) === label) ?? "mixed";
}

function previousCustomConfigRowModel(
  config: CustomSprintConfigRecord,
  rating: number
): PreviousCustomConfig {
  const theme = customThemeFromStoredValue(config.theme);
  return {
    id: safeTestId(config.id),
    mode: config.mode === "arrow_duel" ? "Arrow Duel" : "Regular Puzzles",
    customMode: config.mode === "arrow_duel" ? "arrow_duel" : "custom",
    theme,
    themeLabel: customThemeLabel(theme),
    durationSeconds: config.durationSeconds,
    perPuzzleSeconds: config.perPuzzleSeconds,
    timing: formatSprintTimingLabel(config),
    lastPlayed: formatConfigLastPlayed(config.lastStartedAt),
    ratingKey: config.ratingKey,
    rating
  };
}

function sortHistoryRatingKeys(
  ratingKeys: string[],
  attempts: AttemptEvent[],
  sessions: ExportedSprintSession[]
): string[] {
  const latestPlayedAt = new Map<string, number>();
  for (const attempt of attempts) {
    latestPlayedAt.set(
      attempt.ratingKey,
      Math.max(latestPlayedAt.get(attempt.ratingKey) ?? 0, new Date(attempt.completedAt).getTime() || 0)
    );
  }
  for (const session of sessions) {
    latestPlayedAt.set(
      session.ratingKey,
      Math.max(
        latestPlayedAt.get(session.ratingKey) ?? 0,
        new Date(session.completedAt ?? session.startedAt).getTime() || 0
      )
    );
  }
  return [...ratingKeys].sort((left, right) => {
    return (latestPlayedAt.get(right) ?? 0) - (latestPlayedAt.get(left) ?? 0)
      || historyRatingKeyLabel(left).localeCompare(historyRatingKeyLabel(right));
  });
}

function customThemeFromStoredValue(theme: string | undefined): CustomThemeFilter {
  if (theme && CUSTOM_THEME_OPTIONS.includes(theme)) {
    return theme;
  }
  return "mixed";
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
  return sideToMove(currentPuzzle.currentFen) === "b";
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
  tabClockHandVertical: {
    borderRadius: 999,
    height: 5,
    position: "absolute",
    top: 3,
    width: 2
  },
  tabClockHandDiagonal: {
    borderRadius: 999,
    height: 2,
    position: "absolute",
    right: 3,
    top: 7,
    transform: [{ rotate: "25deg" }],
    width: 5
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
    gap: 18
  },
  practiceHomePrimaryColumn: {
    flex: 1.1,
    gap: 12,
    minWidth: 0
  },
  practiceHomeSecondaryColumn: {
    flex: 0.9,
    gap: 12,
    minWidth: 280
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
  practiceModeSelectArea: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 9,
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
    fontWeight: "800"
  },
  practiceModeDescription: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600"
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
    justifyContent: "flex-end"
  },
  practiceModeRating: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800"
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
    backgroundColor: "#E2E8F0",
    marginHorizontal: 12,
    width: 1
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
  practiceReviewStrip: {
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
  reviewStripActionArea: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 8
  },
  reviewStripActionAreaWide: {
    width: "50%"
  },
  reviewStripStatusCopy: {
    flex: 1,
    minWidth: 0
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
  reviewStripCounts: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  reviewStripCountsWide: {
    flex: 1,
    justifyContent: "center"
  },
  reviewStripChevron: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 18
  },
  reviewStripMetric: {
    alignItems: "center",
    gap: 3,
    minWidth: 58
  },
  reviewDueCount: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 21,
    textAlign: "center",
    width: "100%"
  },
  reviewOverdueCount: {
    color: "#DC2626",
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 21,
    textAlign: "center",
    width: "100%"
  },
  reviewStripMetricLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    textAlign: "center"
  },
  reviewQueuePanel: {
    gap: 12
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
  reviewDueOverdueCount: {
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 14,
    textAlign: "center"
  },
  reviewDueOverdueLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 11,
    textAlign: "center"
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
  reviewItemCopy: {
    flex: 1,
    gap: 2
  },
  reviewContextCard: {
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
  reviewContextMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  reviewContextCount: {
    color: "#2563EB",
    fontSize: 16,
    fontWeight: "800"
  },
  emptyReviewPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  emptyReviewPracticeButton: {
    alignSelf: "flex-start",
    flex: 0,
    marginTop: 2
  },
  reviewStartButton: {
    flex: 0
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
  reviewContinueButton: {
    marginBottom: 8
  },
  activeSessionAdaptiveLayout: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    justifyContent: "center"
  },
  activeSessionBoardLane: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minWidth: 0
  },
  activeSessionControlRailScroll: {
    flexGrow: 0,
    flexShrink: 0,
    maxHeight: "100%"
  },
  activeSessionControlRail: {
    gap: 10,
    paddingBottom: 4
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
    minHeight: 42,
    paddingBottom: 4
  },
  sessionNavButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40
  },
  sessionNavTitle: {
    color: "#111827",
    flex: 1,
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
    paddingHorizontal: 8,
    paddingVertical: 1
  },
  sessionActiveMetricRowCompact: {
    flexWrap: "wrap",
    justifyContent: "center",
    paddingHorizontal: 0,
    rowGap: 6
  },
  sessionMetricBlock: {
    alignItems: "center",
    flex: 1,
    gap: 3,
    justifyContent: "center",
    minWidth: 0
  },
  sessionMetricBlockCompact: {
    flex: 0,
    flexShrink: 0
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
  sessionTimerBlock: {
    alignItems: "center",
    flex: 1.25
  },
  sessionProgressBlockCompact: {
    minWidth: 54
  },
  sessionTimerBlockCompact: {
    minWidth: 78
  },
  sessionSideToMoveBlock: {
    minWidth: 70
  },
  sessionSideToMoveBlockCompact: {
    minWidth: 72
  },
  sessionMistakesBlockCompact: {
    minWidth: 42
  },
  sessionProgressValue: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center"
  },
  moveSideBadge: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    minHeight: 30,
    paddingHorizontal: 7
  },
  moveSideBadgeText: {
    color: "#334155",
    flexShrink: 0,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center"
  },
  moveSideGlyph: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1.5,
    height: 16,
    justifyContent: "center",
    position: "relative",
    width: 16
  },
  moveSideGlyphWhite: {
    backgroundColor: "#FFFFFF",
    borderColor: "#0F172A"
  },
  moveSideGlyphBlack: {
    backgroundColor: "#0F172A",
    borderColor: "#0F172A"
  },
  moveSideGlyphBase: {
    borderRadius: 999,
    bottom: -3,
    height: 5,
    position: "absolute",
    width: 12
  },
  moveSideGlyphWhiteBase: {
    backgroundColor: "#FFFFFF",
    borderColor: "#0F172A",
    borderWidth: 1.5
  },
  moveSideGlyphBlackBase: {
    backgroundColor: "#0F172A"
  },
  timerText: {
    color: "#111827",
    fontFamily: "menlo",
    fontSize: 21,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.2
  },
  boardWrapper: {
    alignItems: "center",
    justifyContent: "center"
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
    flexDirection: "row",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  promptIcon: {
    alignItems: "center",
    backgroundColor: "#1F2937",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    width: 32
  },
  promptCopy: {
    flex: 1,
    gap: 2
  },
  promptTitle: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800"
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
  sessionScoreMetric: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center"
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
  customEligibilityAction: {
    alignSelf: "flex-start",
    flex: 0,
    height: 34,
    marginTop: 4
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
    flex: 0
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
  reviewContextStrip: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center"
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
  reviewContextPillText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  reviewBoardLayout: {
    gap: 12
  },
  reviewBoardLayoutWide: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "center"
  },
  reviewBoardLane: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minWidth: 0
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
  historyQuickFilterRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  historyQuickToggle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 36,
    paddingHorizontal: 8
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
    gap: 8
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
  resultBadgeAlertBar: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    height: 11,
    width: 3
  },
  resultBadgeAlertDot: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    bottom: 1,
    height: 3,
    position: "absolute",
    width: 3
  },
  historyAttemptCopy: {
    flex: 1,
    gap: 3
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
  reviewContextList: {
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
