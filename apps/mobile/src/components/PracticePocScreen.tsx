import React, { useEffect, useMemo, useRef, useState } from "react";
import {
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
  formatSideToMoveScore,
  submitArrowDuelChoice,
  submitLineMove
} from "../../../../packages/core/src/index.ts";
import type {
  AttemptEvent,
  AttemptSource,
  ArrowDuelState,
  CurrentPuzzleState,
  EngineAnalysisLine,
  HistoryEloPoint,
  HistoryAttemptView,
  HistoryPuzzleStats,
  HistoryTimeRange,
  PuzzleSide,
  Puzzle,
  PuzzleFeedback,
  PuzzleLineState,
  ReviewAnalysisLine,
  ReviewQueueItem,
  SessionMistakeReviewItem,
  SprintConfig,
  SprintMode,
  SprintState,
  UciEngineTransport
} from "../../../../packages/core/src/index.ts";
import type { PracticeService } from "../../../../packages/storage/src/practice-service.ts";
import {
  createMobilePracticeService,
  seededPuzzleCount,
  shouldRandomizePuzzleSelection,
  type MobilePuzzleSource
} from "../backend/mobilePractice.ts";
import { createNativeStockfishTransport, prewarmNativeStockfishTransport } from "../backend/nativeStockfishTransport.ts";
import { Chess, type PieceSymbol, type Square } from "chess.js";

interface Props {
  practiceService?: PracticeService;
  debugTrace?: (event: PracticeDebugTraceEvent) => void;
  stockfishTransportFactory?: () => UciEngineTransport | null;
}

type Tab = "practice" | "review" | "history" | "settings" | "packs" | "analysis";

type SessionFeedback = PuzzleFeedback | null;
type AnalysisEngineStatus = "idle" | "thinking" | "stockfish" | "fallback" | "error";
type HistoryRatingRangeFilter = "all" | "under1000" | "1000-1399" | "1400-plus";

export type PracticeDebugTraceEvent = {
  type:
    | "board-lock"
    | "board-reset"
    | "feedback-snapshot"
    | "fen-mismatch"
    | "illegal-move"
    | "move-ignored"
    | "move-submitted";
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

type BoardMoveContext = {
  puzzleId: string | null;
};

type FeedbackBoardSnapshot = {
  boardFen: string;
  currentPuzzle: CurrentPuzzleState;
  feedback: PuzzleFeedback;
  puzzleId: string;
};

const UI_PADDING = 16;
const MIN_BOARD = 280;
const HISTORY_PAGE_LIMIT = 20;
const NEUTRAL_ARROW = "#2563EB";
const ARROW_VISUAL_STYLES = {
  candidate: {
    stroke: NEUTRAL_ARROW,
    opacity: 0.68
  }
} as const;
const FEEDBACK_SNAPSHOT_MS = 800;
const USER_FEEDBACK_BEFORE_AUTO_MS = 260;
const ANALYSIS_DEPTH = 20;
const CUSTOM_DURATION_OPTIONS = [3 * 60, 5 * 60, 10 * 60] as const;
const CUSTOM_PER_PUZZLE_OPTIONS = [10, 20, 30] as const;
const TEST_PUZZLE_SOURCES: ReadonlyArray<{ source: MobilePuzzleSource; label: string }> = [
  { source: "familiar15", label: "Familiar 15" },
  { source: "random1000", label: "Random 1000" }
];
const PRIMARY_TABS: ReadonlyArray<{ tab: Exclude<Tab, "analysis">; label: string; icon: string; testID: string }> = [
  { tab: "practice", label: "Practice", icon: "⌂", testID: "practice-tab" },
  { tab: "review", label: "Review", icon: "◇", testID: "review-tab" },
  { tab: "history", label: "History", icon: "◷", testID: "history-tab" },
  { tab: "packs", label: "Packs", icon: "□", testID: "packs-tab" },
  { tab: "settings", label: "Settings", icon: "⚙", testID: "settings-tab" }
];
const PRACTICE_MODE_DESCRIPTIONS: Record<SprintMode, string> = {
  standard: "Find the best move",
  arrow_duel: "Choose the best move",
  blitz: "Fast time control",
  custom: "Time, theme, rating"
};
const PRACTICE_MODE_ICONS: Record<SprintMode, string> = {
  standard: "◎",
  arrow_duel: "↗",
  blitz: "↯",
  custom: "≡"
};
const BOARD_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const BOARD_FILES_FLIPPED = ["h", "g", "f", "e", "d", "c", "b", "a"] as const;
const BOARD_RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;
const BOARD_RANKS_FLIPPED = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;
const CHESS_PIECE_SPRITE = require("../assets/chess-pieces-sprite.png") as ImageSourcePropType;
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
  practiceService,
  debugTrace,
  stockfishTransportFactory = createNativeStockfishTransport
}: Props): React.JSX.Element {
  const [puzzleSource, setPuzzleSource] = useState<MobilePuzzleSource>("familiar15");
  const service = useMemo(() => practiceService ?? createMobilePracticeService(puzzleSource), [practiceService, puzzleSource]);
  const boardRef = useRef<ChessboardRef | null>(null);
  const suppressedBoardMovesRef = useRef<string[]>([]);
  const boardSyncInProgressRef = useRef(false);
  const boardInputLockedRef = useRef(false);
  const boardVisualFenRef = useRef<string | null>(null);
  const feedbackSnapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<SprintState | null>(null);
  const boardFenRef = useRef<string | null>(null);
  const feedbackSnapshotRef = useRef<FeedbackBoardSnapshot | null>(null);
  const nowMsRef = useRef<number>(Date.now());
  const { width } = useWindowDimensions();

  const [mode, setMode] = useState<SprintMode>("standard");
  const [tab, setTab] = useState<Tab>("practice");
  const [state, setState] = useState<SprintState | null>(null);
  const [feedback, setFeedback] = useState<SessionFeedback>(null);
  const [attempts, setAttempts] = useState<AttemptEvent[]>([]);
  const [reviews, setReviews] = useState<Record<string, unknown>[]>([]);
  const [dueReviewItems, setDueReviewItems] = useState<ReviewQueueItem[]>([]);
  const [sessionMistakeReviewItems, setSessionMistakeReviewItems] = useState<SessionMistakeReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [currentRating, setCurrentRating] = useState(600);
  const [resumableSprint, setResumableSprint] = useState<SprintState | null>(null);
  const [boardFen, setBoardFen] = useState<string | null>(null);
  const [lastBoardMove, setLastBoardMove] = useState<BoardMove | null>(null);
  const [feedbackPuzzleId, setFeedbackPuzzleId] = useState<string | null>(null);
  const [feedbackSnapshot, setFeedbackSnapshot] = useState<FeedbackBoardSnapshot | null>(null);
  const [boardInputLocked, setBoardInputLocked] = useState(false);
  const [chessboardDebugEvents, setChessboardDebugEvents] = useState<string[]>([]);
  const [historyWrongLast7Days, setHistoryWrongLast7Days] = useState(false);
  const [historyTimeRange, setHistoryTimeRange] = useState<HistoryTimeRange>("7d");
  const [historySourceFilter, setHistorySourceFilter] = useState<"all" | AttemptSource>("all");
  const [historyResultFilter, setHistoryResultFilter] = useState<"all" | "correct" | "wrong">("all");
  const [historyModeFilter, setHistoryModeFilter] = useState<"all" | SprintMode>("all");
  const [historySideFilter, setHistorySideFilter] = useState<"all" | PuzzleSide>("all");
  const [historyThemeFilter, setHistoryThemeFilter] = useState<string>("all");
  const [historyRatingRangeFilter, setHistoryRatingRangeFilter] = useState<HistoryRatingRangeFilter>("all");
  const [historyPageOffset, setHistoryPageOffset] = useState(0);
  const [historyRatingKey, setHistoryRatingKey] = useState<string | null>(null);
  const [historyReviewEntries, setHistoryReviewEntries] = useState<ReviewEntry[]>([]);
  const [historyReviewInitialIndex, setHistoryReviewInitialIndex] = useState(0);
  const [customSprintMode, setCustomSprintMode] = useState<"custom" | "arrow_duel">("custom");
  const [customDurationSeconds, setCustomDurationSeconds] = useState(5 * 60);
  const [customPerPuzzleSeconds, setCustomPerPuzzleSeconds] = useState(20);

  const boardSize = useMemo(() => {
    const available = Math.max(width - UI_PADDING * 2, MIN_BOARD);
    return Math.max(MIN_BOARD, Math.min(available, 560));
  }, [width]);

  useEffect(() => {
    if (stockfishTransportFactory === createNativeStockfishTransport) {
      void prewarmNativeStockfishTransport();
    }
  }, [stockfishTransportFactory]);

  const isActive = state?.status === "active";
  const isFinished = state !== null && state.status !== "active";
  const isShowingFeedbackSnapshot = feedbackSnapshot !== null;
  const shouldShowSessionBoard = isActive || isShowingFeedbackSnapshot;
  const selectedConfig = useMemo(
    () => sprintConfigFor(mode === "custom" ? customSprintMode : mode, customDurationSeconds, customPerPuzzleSeconds, mode === "custom"),
    [customDurationSeconds, customPerPuzzleSeconds, customSprintMode, mode]
  );
  stateRef.current = state;
  boardFenRef.current = boardFen;
  feedbackSnapshotRef.current = feedbackSnapshot;
  boardInputLockedRef.current = boardInputLocked;
  nowMsRef.current = nowMs;

  useEffect(() => {
    setCurrentRating(readRating(service, selectedConfig.ratingKey));
  }, [selectedConfig.ratingKey, service]);

  useEffect(() => {
    refreshState();
  }, [service]);

  useEffect(() => {
    if (!isActive && !isShowingFeedbackSnapshot) {
      refreshState();
    }
  }, [tab, service]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 500);

    return () => {
      clearInterval(timer);
    };
  }, [isActive]);

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
      globals.__CHESSTICIZE_CHESSBOARD_DEBUG__ = undefined;
      globals.__CHESSTICIZE_CHESSBOARD_DEBUG_SINK__ = undefined;
    };
  }, []);

  function nowIso(): string {
    return new Date(nowMsRef.current).toISOString();
  }

  function refreshState(): void {
    setAttempts(service.listHistory() as AttemptEvent[]);
    setReviews(service.getDueReviews(nowIso()) as Record<string, unknown>[]);
    setDueReviewItems(service.getDueReviewItems(nowIso()));
    setCurrentRating(readRating(service, selectedConfig.ratingKey));
    const activeSprint = service.getActiveSprint();
    setResumableSprint(activeSprint?.status === "active" && stateRef.current?.id !== activeSprint.id ? activeSprint : null);
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

  function commitBoardInputLocked(nextLocked: boolean, reason: string, puzzleId?: string | null): void {
    boardInputLockedRef.current = nextLocked;
    setBoardInputLocked(nextLocked);
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
    setError(null);
    try {
      const config = sprintConfigFor(nextMode, customDurationSeconds, customPerPuzzleSeconds, useCustomTiming);
      const started = service.startSprint({
        mode: nextMode,
        durationSeconds: config.durationSeconds,
        perPuzzleSeconds: config.perPuzzleSeconds,
        ...(shouldRandomizePuzzleSelection(puzzleSource) ? { puzzleSelectionSeed: `${Date.now()}-${Math.random()}` } : {})
      });
      setMode(nextMode);
      commitState(started);
      setResumableSprint(null);
      setCurrentRating(started.ratingBefore);
      commitBoardFen(started.currentPuzzle?.currentFen ?? null);
      setLastBoardMove(null);
      setFeedback(null);
      setFeedbackPuzzleId(null);
      commitBoardInputLocked(false, "start", started.currentPuzzle?.puzzle.id ?? null);
      clearFeedbackSnapshot();
      setTab("practice");
      refreshState();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function changePuzzleSource(nextSource: MobilePuzzleSource): void {
    if (isActive || practiceService) {
      return;
    }
    setPuzzleSource(nextSource);
    commitState(null);
    setResumableSprint(null);
    setFeedback(null);
    setFeedbackPuzzleId(null);
    clearFeedbackSnapshot();
    setError(null);
    commitBoardInputLocked(false, "puzzle-source", null);
    commitBoardFen(null);
    setLastBoardMove(null);
    setAttempts([]);
    setReviews([]);
    setDueReviewItems([]);
    setSessionMistakeReviewItems([]);
    setCurrentRating(600);
  }

  function abandonSprint(): void {
    if (!state || state.status !== "active") {
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

  async function onArrowDuelCandidatePress(move: string, context: BoardMoveContext): Promise<void> {
    const activeState = stateRef.current;
    const activeFeedbackSnapshot = feedbackSnapshotRef.current;
    if (activeState?.status !== "active") {
      emitTrace({
        type: "move-ignored",
        reason: "inactive",
        move,
        contextPuzzleId: context.puzzleId
      });
      return;
    }
    if (activeFeedbackSnapshot || boardSyncInProgressRef.current || boardInputLockedRef.current) {
      emitTrace({
        type: "move-ignored",
        reason: activeFeedbackSnapshot ? "feedback-snapshot" : "board-locked",
        move,
        contextPuzzleId: context.puzzleId,
        puzzleId: activeState.currentPuzzle?.puzzle.id ?? null
      });
      return;
    }

    const submittedPuzzle = activeState.currentPuzzle;
    const submittedPuzzleId = submittedPuzzle?.puzzle.id ?? null;
    if (context.puzzleId !== submittedPuzzleId || submittedPuzzle?.kind !== "arrow_duel") {
      emitTrace({
        type: "move-ignored",
        reason: "context-puzzle-mismatch",
        move,
        contextPuzzleId: context.puzzleId,
        puzzleId: submittedPuzzleId
      });
      return;
    }
    if (!isArrowDuelCandidate(submittedPuzzle.candidates, move)) {
      emitTrace({
        type: "move-ignored",
        reason: "arrow-duel-non-candidate",
        move,
        contextPuzzleId: context.puzzleId,
        puzzleId: submittedPuzzleId,
        submittedFen: submittedPuzzle.currentFen
      });
      return;
    }

    const submittedFen = submittedPuzzle.currentFen ?? boardFenRef.current ?? null;
    const submittedMoveFen = submittedFen ? fenAfterMove(submittedFen, move) : null;
    if (submittedFen && !submittedMoveFen) {
      emitTrace({
        type: "move-ignored",
        reason: "submitted-move-illegal-for-current-fen",
        move,
        puzzleId: submittedPuzzleId,
        submittedFen
      });
      return;
    }

    setLastBoardMove(null);
    boardVisualFenRef.current = submittedMoveFen ?? submittedFen;
    commitBoardInputLocked(true, "candidate-chip", submittedPuzzleId);
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
    setFeedback(null);
    setFeedbackPuzzleId(null);
    clearFeedbackSnapshot();
    setError(null);
    commitBoardInputLocked(false, "reset", null);
    commitBoardFen(null);
    setLastBoardMove(null);
    refreshState();
  }

  function resumeSprint(nextSprint: SprintState): void {
    setError(null);
    setMode(nextSprint.config.mode);
    commitState(nextSprint);
    setResumableSprint(null);
    setCurrentRating(nextSprint.ratingBefore);
    commitBoardFen(nextSprint.currentPuzzle?.currentFen ?? null);
    setLastBoardMove(null);
    setFeedback(null);
    setFeedbackPuzzleId(null);
    clearFeedbackSnapshot();
    commitBoardInputLocked(false, "resume", nextSprint.currentPuzzle?.puzzle.id ?? null);
    setTab("practice");
  }

  function showReviewMistakes(): void {
    const sessionId = stateRef.current?.id;
    const reviewItems = sessionId ? service.getSessionMistakeReview(sessionId) : [];
    resetToIdle();
    setSessionMistakeReviewItems(reviewItems);
    setTab("review");
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
    boardSyncInProgressRef.current = true;
    commitBoardInputLocked(true, "opponent-reply", nextState.currentPuzzle?.puzzle.id ?? null);
    try {
      await sleep(USER_FEEDBACK_BEFORE_AUTO_MS);
      setFeedback(null);
      setFeedbackPuzzleId(null);
      await animateBoardMoves(autoMoves, nextFen);
    } finally {
      boardSyncInProgressRef.current = false;
      commitBoardInputLocked(false, "opponent-reply-complete", nextState.currentPuzzle?.puzzle.id ?? null);
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
  const boardGestureEnabled = Boolean(isActive && !isShowingFeedbackSnapshot && !boardInputLocked);
  const boardDraggableColor = boardGestureEnabled && currentPuzzle
    ? sideToMove(currentPuzzle.currentFen)
    : null;
  const submittedMoveForCurrentPuzzle =
    boardFeedback?.submittedMove && boardFeedback.submittedMove !== "__illegal__"
      ? arrowFromTo(boardFeedback.submittedMove)
      : null;
  const displayedLastBoardMove = feedbackSnapshot || boardFeedback ? null : lastBoardMove;
  const historyRatingKeys = useMemo(
    () => [...new Set([...service.listPlayedRatings().map((rating) => rating.key), ...attempts.map((attempt) => attempt.ratingKey)])].sort(),
    [attempts, service]
  );
  const activeHistoryRatingKey = historyRatingKey ?? historyRatingKeys[0] ?? null;
  const historyRatingRangeQuery = historyRatingRangeFilterToQuery(historyRatingRangeFilter);
  const historyView = activeHistoryRatingKey
    ? service.getHistoryView({
        now: nowIso(),
        timeRange: historyTimeRange,
        ratingKey: activeHistoryRatingKey,
        ...historyRatingRangeQuery,
        ...(historySourceFilter === "all" ? {} : { source: historySourceFilter }),
        ...(historyResultFilter === "all" ? {} : { result: historyResultFilter }),
        ...(historyModeFilter === "all" ? {} : { mode: historyModeFilter }),
        ...(historySideFilter === "all" ? {} : { side: historySideFilter }),
        ...(historyThemeFilter === "all" ? {} : { theme: historyThemeFilter }),
        page: { limit: HISTORY_PAGE_LIMIT, offset: historyPageOffset }
      })
    : null;
  const fullHistoryReviewView = activeHistoryRatingKey
    ? service.getHistoryView({
        now: nowIso(),
        timeRange: historyTimeRange,
        ratingKey: activeHistoryRatingKey,
        ...historyRatingRangeQuery,
        ...(historySourceFilter === "all" ? {} : { source: historySourceFilter }),
        ...(historyResultFilter === "all" ? {} : { result: historyResultFilter }),
        ...(historyModeFilter === "all" ? {} : { mode: historyModeFilter }),
        ...(historySideFilter === "all" ? {} : { side: historySideFilter }),
        ...(historyThemeFilter === "all" ? {} : { theme: historyThemeFilter })
      })
    : null;
  const displayedAttempts = historyView?.attempts ?? [];
  const historyReviewAttempts = fullHistoryReviewView?.attempts ?? displayedAttempts;
  const historyAvailableThemes = historyView?.availableThemes ?? [];
  const historyPage = historyView?.page ?? { limit: HISTORY_PAGE_LIMIT, offset: 0, total: 0, hasMore: false };
  const appShellVisible = !isActive && !isShowingFeedbackSnapshot;
  const screenTitle = screenTitleFor(tab);
  const screenSubtitle = tab === "practice"
    ? `Offline-ready · ${seededPuzzleCount(puzzleSource)} puzzles`
    : screenSubtitleFor(tab);
  const showHeaderRating = tab === "practice" && state === null && mode !== "custom";
  const practiceModeSummaries = (["standard", "arrow_duel", "blitz", "custom"] as const).map((nextMode) => {
    const config = sprintConfigFor(nextMode, customDurationSeconds, customPerPuzzleSeconds);
    return {
      mode: nextMode,
      config,
      rating: readRating(service, config.ratingKey)
    };
  });
  const practiceProgress = buildPracticeProgressSummary(attempts, nowMs);
  const dueTodayCount = dueReviewItems.length;
  const overdueCount = dueReviewItems.filter((item) => new Date(item.review.dueAt).getTime() <= nowMs).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      {appShellVisible ? (
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{screenTitle}</Text>
            {screenSubtitle ? <Text style={styles.subtitle}>{screenSubtitle}</Text> : null}
          </View>
          {showHeaderRating ? (
            <Text testID="rating-label" style={styles.rating}>{`ELO ${formatRating(state, currentRating)}`}</Text>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        testID="practice-main-scroll"
        contentContainerStyle={[styles.content, appShellVisible ? styles.contentWithBottomTabs : null]}
      >
        {tab === "practice" ? (
          <>
            {state?.status === "active" ? (
              <SessionStatusBar
                mode={mode}
                state={state}
                config={selectedConfig}
                timerText={timerText}
                currentRating={currentRating}
                onAbandon={isActive ? abandonSprint : undefined}
              />
            ) : null}

            {!isActive && state === null && mode !== "custom" ? (
              <PracticeHome
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
                onOpenReview={() => setTab("review")}
              />
            ) : null}

            {!isActive && state === null && mode === "custom" ? (
              <CustomSprintSetup
                durationSeconds={customDurationSeconds}
                perPuzzleSeconds={customPerPuzzleSeconds}
                targetCorrect={selectedConfig.targetCorrect}
                maxMistakes={selectedConfig.maxMistakes}
                availablePuzzleCount={seededPuzzleCount(puzzleSource)}
                ratingKey={selectedConfig.ratingKey}
                currentRating={currentRating}
                onDurationChange={setCustomDurationSeconds}
                onClose={() => setMode("standard")}
                customMode={customSprintMode}
                onCustomModeChange={setCustomSprintMode}
                onPerPuzzleChange={setCustomPerPuzzleSeconds}
                onStart={() => startSprint(customSprintMode, true)}
              />
            ) : null}

            {shouldShowSessionBoard ? (
              <View style={styles.boardWrapper}>
                <View testID="session-board" style={[styles.boardSurface, { width: boardSize, height: boardSize }]}>
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
                      durations={{ move: 260 }}
                      spriteSource={CHESS_PIECE_SPRITE}
                      colors={{
                        white: "#EEF2F5",
                        black: "#A3ADB8",
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
                    />
                  ) : null}
                </View>
                {isPracticeDebugEnabled() && chessboardDebugEvents.length > 0 ? (
                  <Text style={styles.debugLog} testID="chessboard-debug-log">
                    {chessboardDebugEvents.join("\n")}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {state?.status === "active" ? (
              <SessionScoreStrip state={state} />
            ) : null}

            {shouldShowSessionBoard ? (
              <PracticePrompt currentPuzzle={displayedPuzzle} mode={mode} />
            ) : null}

            {displayedPuzzle?.kind === "arrow_duel" && !boardFeedback ? (
              <ArrowDuelCandidateChips
                candidates={displayedPuzzle.candidates}
                disabled={!boardGestureEnabled}
                onChoose={(move) => {
                  void onArrowDuelCandidatePress(move, {
                    puzzleId: displayedPuzzle.puzzle.id
                  });
                }}
              />
            ) : null}

            {error ? <ErrorPanel error={error} /> : null}

            {isFinished && !isShowingFeedbackSnapshot ? (
              <SprintSummary
                state={state}
                elapsedMs={Math.min(sprintElapsedMs, state ? state.config.durationSeconds * 1000 : sprintElapsedMs)}
                onReplay={() => startSprint(mode)}
                onBack={resetToIdle}
                onOpenHistory={() => setTab("history")}
                onReview={state.mistakeCount > 0 ? showReviewMistakes : undefined}
              />
            ) : null}

            {!isActive && state === null && isPracticeTestControlsEnabled() && !practiceService ? (
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
              boardSize={boardSize}
              entries={historyReviewEntries}
              initialIndex={historyReviewInitialIndex}
              service={service}
              onExit={() => setHistoryReviewEntries([])}
              stockfishTransportFactory={stockfishTransportFactory}
            />
          ) : (
            <HistoryPanel
              attempts={displayedAttempts}
              eloPoints={historyView?.elo ?? []}
              ratingKeys={historyRatingKeys}
              puzzleStats={historyView?.puzzleStats ?? []}
              selectedRatingKey={activeHistoryRatingKey}
              timeRange={historyTimeRange}
              sourceFilter={historySourceFilter}
              resultFilter={historyResultFilter}
              modeFilter={historyModeFilter}
              ratingRangeFilter={historyRatingRangeFilter}
              sideFilter={historySideFilter}
              themeFilter={historyThemeFilter}
              availableThemes={historyAvailableThemes}
              page={historyPage}
              wrongLast7Days={historyWrongLast7Days}
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
              onModeFilterChange={(nextMode) => {
                setHistoryModeFilter(nextMode);
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
              onPageOffsetChange={setHistoryPageOffset}
              onOpenAttempt={openHistoryReview}
              onToggleWrongLast7Days={() => {
                setHistoryWrongLast7Days((current) => !current);
                setHistoryTimeRange("7d");
                setHistoryPageOffset(0);
                setHistoryResultFilter((current) => current === "wrong" ? "all" : "wrong");
              }}
            />
          )
        ) : null}
        {tab === "review" ? (
          <ReviewPanel
            boardSize={boardSize}
            dueReviewItems={dueReviewItems}
            service={service}
            sessionMistakeReviewItems={sessionMistakeReviewItems}
            onExitSessionReview={() => setTab("practice")}
            onOpenPractice={() => setTab("practice")}
            stockfishTransportFactory={stockfishTransportFactory}
          />
        ) : null}
        {tab === "settings" ? (
          <SettingsPanel
            standardRating={readRating(service, defaultSprintConfig("standard").ratingKey)}
            onOpenDiagnostics={isPracticeTestControlsEnabled() ? () => setTab("analysis") : undefined}
            onOpenPacks={() => setTab("packs")}
            onResetRating={() => service.resetRating(defaultSprintConfig("standard").ratingKey)}
          />
        ) : null}
        {tab === "packs" ? <PacksPanel /> : null}
        {tab === "analysis" && isPracticeTestControlsEnabled() ? (
          <StockfishDiagnosticsPanel stockfishTransportFactory={stockfishTransportFactory} />
        ) : null}
      </ScrollView>
      {appShellVisible ? (
        <View style={styles.bottomTabs}>
          {PRIMARY_TABS.map((item) => (
            <TabButton
              key={item.tab}
              active={tab === item.tab}
              icon={item.icon}
              label={item.label}
              testID={item.testID}
              onPress={() => setTab(item.tab)}
            />
          ))}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

type PracticeModeSummary = {
  mode: SprintMode;
  config: SprintConfig;
  rating: number;
};

type PracticeProgressSummary = {
  correctThisWeek: number;
  wrongThisWeek: number;
  netThisWeek: number;
};

function buildPracticeProgressSummary(attempts: AttemptEvent[], nowMs: number): PracticeProgressSummary {
  const weekStartMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  let correctThisWeek = 0;
  let wrongThisWeek = 0;
  for (const attempt of attempts) {
    const completedMs = new Date(attempt.completedAt).getTime();
    if (!Number.isFinite(completedMs) || completedMs < weekStartMs || completedMs > nowMs) {
      continue;
    }
    if (attempt.result === "correct") {
      correctThisWeek += 1;
    } else {
      wrongThisWeek += 1;
    }
  }
  return {
    correctThisWeek,
    wrongThisWeek,
    netThisWeek: correctThisWeek - wrongThisWeek
  };
}

function PracticeHome({
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

  return (
    <View style={styles.practiceHome} testID="practice-home">
      {resumableSprint ? (
        <ResumeSprintCard
          sprint={resumableSprint}
          onResume={() => onResumeSprint(resumableSprint)}
        />
      ) : null}

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>Start a Sprint</Text>
        <Text style={styles.sectionMeta}>Tap a row to begin</Text>
      </View>
      <View style={styles.modeList}>
        {modes.map((item) => (
          <PracticeModeCard
            key={item.mode}
            active={mode === item.mode}
            item={item}
            onPress={() => {
              if (item.mode === "custom") {
                onSelectMode(item.mode);
              } else {
                onStartMode(item.mode);
              }
            }}
          />
        ))}
      </View>

      <Text style={styles.sectionLabel}>Progress</Text>
      <View style={styles.practiceProgressCard} testID="practice-progress-summary">
        <View style={styles.progressMetric}>
          <Text style={styles.helperText}>ELO ({selected ? modeLabel(selected.mode) : "Standard"})</Text>
          <Text style={styles.progressValue}>{currentRating}</Text>
        </View>
        <View style={styles.progressDivider} />
        <View style={styles.progressMetric}>
          <Text style={styles.helperText}>This Week</Text>
          <Text testID="practice-progress-weekly-solved" style={styles.progressValue}>{progress.correctThisWeek}</Text>
          <Text testID="practice-progress-weekly-delta" style={styles.progressDelta}>{progressDelta}</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Review</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open scheduled reviews"
        testID="practice-review-strip"
        style={styles.practiceReviewStrip}
        onPress={onOpenReview}
      >
        <View>
          <Text style={styles.listText}>Review</Text>
          <Text style={styles.helperText}>{dueReviewCount === 0 ? "No reviews due" : "Due today"}</Text>
        </View>
        <View style={styles.reviewStripCounts}>
          <View style={styles.reviewStripMetric} testID="practice-review-due-count">
            <Text style={styles.reviewDueCount}>{dueReviewCount}</Text>
            <Text style={styles.reviewStripMetricLabel}>Due today</Text>
          </View>
          <View style={styles.reviewStripMetric} testID="practice-review-overdue-count">
            <Text style={styles.reviewOverdueCount}>{overdueReviewCount}</Text>
            <Text style={styles.reviewStripMetricLabel}>Overdue</Text>
          </View>
        </View>
      </Pressable>
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
        <Text style={styles.practiceModeIconText}>{PRACTICE_MODE_ICONS[sprint.config.mode]}</Text>
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} mode`}
      testID={`practice-mode-${item.mode.replace("_", "-")}`}
      style={[styles.practiceModeCard, active ? styles.practiceModeCardActive : null]}
      onPress={onPress}
    >
      <View style={styles.practiceModeSelectArea}>
        <View style={styles.practiceModeIcon} testID={`practice-mode-${item.mode.replace("_", "-")}-icon`}>
          <Text style={styles.practiceModeIconText}>{PRACTICE_MODE_ICONS[item.mode]}</Text>
        </View>
        <View style={styles.practiceModeCopy}>
          <View style={styles.practiceModeTitleRow}>
            <Text style={styles.practiceModeTitle}>{label}</Text>
          </View>
          <Text style={styles.practiceModeDescription}>{PRACTICE_MODE_DESCRIPTIONS[item.mode]}</Text>
          <Text style={styles.practiceModeRating} testID={`practice-mode-${item.mode.replace("_", "-")}-details`}>
            ELO {item.rating}
          </Text>
        </View>
      </View>
      <View style={styles.practiceModeMeta}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Start ${label}`}
          testID={`practice-mode-${item.mode.replace("_", "-")}-start`}
          style={styles.practiceModeChevronButton}
          onPress={onPress}
        >
          <Text style={styles.practiceModeChevron}>›</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function ModeRow({
  mode,
  onChange,
  disabled
}: {
  mode: SprintMode;
  onChange: (next: SprintMode) => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.modeRow}>
      <ModeButton
        active={mode === "standard"}
        label="Standard"
        testID="practice-mode-standard"
        onPress={() => {
          if (!disabled) {
            onChange("standard");
          }
        }}
      />
      <ModeButton
        active={mode === "arrow_duel"}
        label="Arrow Duel"
        testID="practice-mode-arrow-duel"
        onPress={() => {
          if (!disabled) {
            onChange("arrow_duel");
          }
        }}
      />
      <ModeButton
        active={mode === "blitz"}
        label="Blitz"
        testID="practice-mode-blitz"
        onPress={() => {
          if (!disabled) {
            onChange("blitz");
          }
        }}
      />
      <ModeButton
        active={mode === "custom"}
        label="Custom"
        testID="practice-mode-custom"
        onPress={() => {
          if (!disabled) {
            onChange("custom");
          }
        }}
      />
    </View>
  );
}

function CustomSprintSetup({
  availablePuzzleCount,
  customMode,
  currentRating,
  durationSeconds,
  maxMistakes,
  onClose,
  onCustomModeChange,
  perPuzzleSeconds,
  targetCorrect,
  ratingKey,
  onDurationChange,
  onPerPuzzleChange,
  onStart
}: {
  availablePuzzleCount: number;
  customMode: "custom" | "arrow_duel";
  currentRating: number;
  durationSeconds: number;
  maxMistakes: number;
  onClose: () => void;
  onCustomModeChange: (next: "custom" | "arrow_duel") => void;
  perPuzzleSeconds: number;
  targetCorrect: number;
  ratingKey: string;
  onDurationChange: (next: number) => void;
  onPerPuzzleChange: (next: number) => void;
  onStart: () => void;
}): React.JSX.Element {
  const [theme, setTheme] = useState("Mixed");
  const ratingRange = `${Math.max(400, currentRating - 200)} - ${currentRating + 200}`;
  const requiredPuzzleCount = targetCorrect + maxMistakes;
  const hasEnoughLocalPuzzles = availablePuzzleCount >= requiredPuzzleCount;
  const canStartWithLocalPuzzles = availablePuzzleCount > 0;
  const previousConfigs: PreviousCustomConfig[] = [
    {
      id: "standard-5-20",
      mode: "Standard",
      theme: "Mixed",
      timing: "5 min · 20s pace",
      lastPlayed: "Recently",
      ratingKey: "standard 5/20",
      rating: currentRating
    },
    {
      id: "standard-3-30",
      mode: "Standard",
      theme: "Mixed",
      timing: "3 min · 30s pace",
      lastPlayed: "Saved setup",
      ratingKey: "custom 3/30",
      rating: readCustomPreviewRating("custom 3/30", ratingKey, currentRating)
    }
  ];

  return (
    <View style={styles.customSetupPanel} testID="custom-sprint-setup">
      <View style={styles.customScreenHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close custom sprint setup"
          testID="custom-close"
          style={styles.analysisIconButton}
          onPress={onClose}
        >
          <Text style={styles.analysisIconButtonText}>×</Text>
        </Pressable>
        <Text style={styles.customScreenTitle}>Custom Sprint</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start custom sprint"
          accessibilityState={{ disabled: !canStartWithLocalPuzzles }}
          disabled={!canStartWithLocalPuzzles}
          testID="start-sprint-button"
          style={[styles.customHeaderStartButton, !canStartWithLocalPuzzles ? styles.disabledButton : null]}
          onPress={onStart}
        >
          <Text style={styles.primaryButtonText}>Start</Text>
        </Pressable>
      </View>

      <View style={styles.customConfigCard} testID="custom-config-list">
        <CustomModeChoiceRow
          value={customMode}
          testID="custom-mode-row"
          onChange={onCustomModeChange}
        />
        <CustomChoiceRow
          label="Theme"
          value={theme}
          options={["Mixed", "Mate", "Endgame"]}
          testID="custom-theme-row"
          onChange={setTheme}
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
        <CustomValueRow
          label="Estimated puzzles"
          value={`~${targetCorrect}`}
          testID="custom-target-row"
          valueTestID="custom-target-count"
        />
        <CustomValueRow
          label="Rating range"
          value={ratingRange}
          testID="custom-rating-range"
        />
        <CustomValueRow
          label="ELO type"
          value={customMode === "arrow_duel" ? "Arrow Duel" : "Regular puzzles"}
          testID="custom-mode-summary"
        />
        <CustomValueRow
          label="Current rating"
          value={`ELO ${currentRating}`}
          testID="custom-current-rating"
        />
        <CustomValueRow
          detail="Separate scoring bucket"
          label="Scoring history"
          value={ratingKey}
          testID="custom-separate-scoring"
        />
        <CustomToggleRow
          detail="Switches this custom sprint to Arrow Duel scoring."
          enabled={customMode === "arrow_duel"}
          label="Include Arrow Duel"
          testID="custom-include-arrow-duel"
          onToggle={() => onCustomModeChange(customMode === "arrow_duel" ? "custom" : "arrow_duel")}
        />
      </View>

      <CustomEligibilityNotice
        availablePuzzleCount={availablePuzzleCount}
        hasEnoughLocalPuzzles={hasEnoughLocalPuzzles}
        requiredPuzzleCount={requiredPuzzleCount}
      />

      <View style={styles.previousConfigList} testID="custom-previous-configs">
        <Text style={styles.sectionLabel}>Previous configs</Text>
        {previousConfigs.map((config) => (
          <PreviousCustomConfigRow key={config.id} config={config} />
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

function readCustomPreviewRating(candidateKey: string, activeKey: string, currentRating: number): number {
  return candidateKey === activeKey ? currentRating : 600;
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
    <View style={styles.customModeChoiceRow} testID={testID}>
      <View style={styles.customChoiceHeader}>
        <Text style={styles.listText}>Mode</Text>
        <Text style={styles.customConfigValue}>{value === "arrow_duel" ? "Arrow Duel" : "Standard"} ›</Text>
      </View>
      <View style={styles.customModeChoices}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: value === option.value }}
            testID={option.testID}
            style={[styles.customModeChoice, value === option.value ? styles.customModeChoiceActive : null]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.customModeChoiceTitle, value === option.value ? styles.customModeChoiceTitleActive : null]}>
              {option.label}
            </Text>
            <Text style={[styles.customModeChoiceDetail, value === option.value ? styles.customModeChoiceDetailActive : null]}>
              {option.detail}
            </Text>
          </Pressable>
        ))}
      </View>
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
  return (
    <View style={styles.customConfigRow} testID={testID}>
      <View>
        <Text style={styles.listText}>{label}</Text>
        {detail ? <Text style={styles.helperText}>{detail}</Text> : null}
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
        <Text style={styles.customConfigValue}>{value} ›</Text>
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
            <Text style={styles.customStepperText}>−</Text>
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
            <Text style={styles.customStepperText}>＋</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function CustomToggleRow({
  detail,
  enabled,
  label,
  onToggle,
  testID
}: {
  detail?: string;
  enabled: boolean;
  label: string;
  onToggle: () => void;
  testID: string;
}): React.JSX.Element {
  return (
    <View style={styles.customConfigRow} testID={testID}>
      <View>
        <Text style={styles.listText}>{label}</Text>
        {detail ? <Text style={styles.helperText}>{detail}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: enabled }}
        testID={`${testID}-toggle`}
        style={[styles.switchButton, enabled ? styles.switchButtonActive : null]}
        onPress={onToggle}
      >
        <Text style={[styles.switchText, enabled ? styles.switchTextActive : null]}>{enabled ? "On" : "Off"}</Text>
      </Pressable>
    </View>
  );
}

type PreviousCustomConfig = {
  id: string;
  mode: string;
  theme: string;
  timing: string;
  lastPlayed: string;
  ratingKey: string;
  rating: number;
};

function PreviousCustomConfigRow({ config }: { config: PreviousCustomConfig }): React.JSX.Element {
  return (
    <View style={styles.previousConfigRow} testID={`custom-previous-${config.id}`}>
      <View style={styles.previousConfigCopy}>
        <View style={styles.previousConfigHeader}>
          <Text style={styles.historyRowTitle}>{config.mode}</Text>
          <Text style={styles.previousConfigRatingKey}>{config.ratingKey}</Text>
        </View>
        <View style={styles.previousConfigMetaRow} testID={`custom-previous-${config.id}-meta`}>
          <Text style={styles.practiceModeDetailChip}>{config.theme}</Text>
          <Text style={styles.practiceModeDetailChip}>{config.timing}</Text>
          <Text style={styles.practiceModeDetailChip}>Last {config.lastPlayed}</Text>
        </View>
      </View>
      <View style={styles.previousConfigRating}>
        <Text style={styles.helperText}>ELO</Text>
        <Text style={styles.practiceModeRating}>{config.rating}</Text>
      </View>
    </View>
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
  mode,
  state,
  config,
  timerText,
  currentRating,
  onAbandon
}: {
  mode: SprintMode;
  state: SprintState | null;
  config: SprintConfig;
  timerText: string;
  currentRating: number;
  onAbandon?: () => void;
}): React.JSX.Element {
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  if (!state) {
    return (
      <View style={styles.sessionBar} testID="mode-overview">
        <View style={styles.sessionHeaderRow}>
          <View>
            <Text style={styles.sessionTitle}>{modeLabel(mode)}</Text>
        <Text style={styles.helperText}>{formatDurationLabel(config.durationSeconds)} sprint · {config.perPuzzleSeconds}s target pace</Text>
          </View>
          <Text style={styles.ratingPill}>{currentRating}</Text>
        </View>
        <View style={styles.sessionMetrics}>
          <Text style={styles.sessionMetric}>Target {config.targetCorrect}</Text>
          <Text style={styles.sessionMetric}>Run {config.ratingKey}</Text>
          <MistakeStrikes count={0} max={config.maxMistakes} />
        </View>
      </View>
    );
  }

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
            <Text style={styles.sessionNavButtonText}>×</Text>
          </Pressable>
        ) : (
          <View style={styles.sessionNavButton} />
        )}
        <Text style={styles.sessionNavTitle}>{modeLabel(mode)}</Text>
        <View style={styles.sessionNavButton} testID="session-overflow">
          <Text style={styles.sessionOverflowText}>•••</Text>
        </View>
      </View>

      <View style={styles.sessionActiveMetricRow} testID="session-status-metrics">
        <View style={styles.sessionActiveMetric}>
          <Text style={styles.resultMetricLabel}>Solved</Text>
          <Text testID="session-progress" style={styles.sessionProgressValue}>
            {state.correctCount} / {state.config.targetCorrect}
          </Text>
        </View>
        <View style={styles.sessionTimerBlock}>
          <Text style={styles.resultMetricLabel}>Time</Text>
          <Text testID="session-timer" style={styles.timerText}>{timerText}</Text>
        </View>
        <View style={[styles.sessionActiveMetric, styles.sessionActiveMetricRight]}>
          <Text style={styles.resultMetricLabel}>Rating</Text>
          <Text testID="session-rating" style={styles.sessionRatingValue}>ELO {currentRating}</Text>
        </View>
      </View>

      <View style={styles.sessionMistakeRow}>
        <MistakeStrikes count={state.mistakeCount} max={state.config.maxMistakes} />
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

function MistakeStrikes({
  count,
  max
}: {
  count: number;
  max: number;
}): React.JSX.Element {
  return (
    <View accessibilityLabel={`Mistakes ${count} of ${max}`} testID="session-strikes" style={styles.strikeRow}>
      {Array.from({ length: max }, (_, index) => {
        const used = index < count;
        return (
          <View
            key={index}
            style={[styles.strikeMark, used ? styles.strikeMarkUsed : null]}
          />
        );
      })}
      <Text testID="session-mistakes" style={styles.strikeCount}>{count} / {max}</Text>
      <Text style={styles.strikeLabel}>Mistakes</Text>
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
  const shouldPrioritizeReview = state.status === "failed" && Boolean(onReview);
  const accuracy = Math.round((state.correctCount / Math.max(1, state.correctCount + state.mistakeCount)) * 100);
  const ratingAfter = state.ratingAfter ?? state.ratingBefore;
  const reviewImpact = state.mistakeCount > 0
    ? `${state.mistakeCount} ${state.mistakeCount === 1 ? "mistake" : "mistakes"} queued`
    : "No new review items";

  return (
    <View style={styles.summaryPanel} testID="sprint-summary-panel">
      <View style={styles.resultHero} testID="sprint-result-hero">
        <View style={[styles.resultIcon, state.status === "won" ? styles.resultIconWon : styles.resultIconFailed]}>
          <Text style={[styles.resultIconText, state.status === "failed" ? styles.resultIconTextFailed : null]}>
            {state.status === "won" ? "✓" : "!"}
          </Text>
        </View>
        <View style={styles.resultTitleBlock}>
          <Text style={styles.summaryTitle}>{state.status === "won" ? "Sprint complete" : "Sprint failed"}</Text>
          <Text style={styles.summaryText}>Result: {reason}</Text>
        </View>
        <View style={styles.resultScoreBlock}>
          <Text style={styles.resultSolvedCount} testID="sprint-result-solved">
            {state.correctCount}
            <Text style={styles.resultSolvedTarget}> / {state.config.targetCorrect}</Text>
          </Text>
          <Text style={styles.resultAccuracy} testID="sprint-result-accuracy">{accuracy}% Accuracy</Text>
        </View>
      </View>

      <View style={styles.resultMetricGrid}>
        <View style={styles.resultMetric} testID="sprint-result-rating-change">
          <Text style={styles.resultMetricLabel}>Rating Change</Text>
          <Text style={[styles.resultMetricValue, delta >= 0 ? styles.positive : styles.errorText]}>
            {delta >= 0 ? "+" : ""}
            {delta}
          </Text>
          <Text testID="sprint-result-rating-range" style={styles.resultMetricSubtext}>{state.ratingBefore} → {ratingAfter}</Text>
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View history"
          testID="sprint-result-history-button"
          style={styles.secondaryButton}
          onPress={onOpenHistory}
        >
          <Text style={styles.secondaryButtonText}>History</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          testID="back-practice-button"
          style={styles.secondaryButton}
          onPress={onBack}
        >
          <Text style={styles.secondaryButtonText}>Done</Text>
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
  const promptBadge = mode === "arrow_duel" ? PRACTICE_MODE_ICONS.arrow_duel : PRACTICE_MODE_ICONS.standard;
  const displayedPromptText = promptText === undefined
    ? (
      isArrowDuel
        ? `Choose the better move for ${side} between the two arrows.`
        : `Find the best move for ${side}.`
    )
    : promptText;
  const displayedPromptHint = promptHint === undefined
    ? (isArrowDuel ? "Watch for checks, captures, and attacks!" : null)
    : promptHint;

  return (
    <View style={styles.promptPanel} testID="practice-prompt">
      <Text style={styles.promptIcon} testID="practice-prompt-icon">{promptBadge}</Text>
      <View style={styles.promptCopy}>
        <Text style={styles.promptTitle}>{mode === "arrow_duel" ? "Arrow Duel" : modeLabel(mode)}</Text>
        {displayedPromptText ? <Text style={styles.promptText}>{displayedPromptText}</Text> : null}
        {displayedPromptHint ? (
          <Text style={styles.promptHint}>{displayedPromptHint}</Text>
        ) : null}
      </View>
    </View>
  );
}

function ArrowDuelCandidateChips({
  candidates,
  disabled,
  onChoose
}: {
  candidates: string[];
  disabled: boolean;
  onChoose: (move: string) => void;
}): React.JSX.Element | null {
  const visibleCandidates = candidates.slice(0, 2);
  if (visibleCandidates.length < 2) {
    return null;
  }
  return (
    <View style={styles.arrowDuelCandidateRow} testID="arrow-duel-candidates">
      {visibleCandidates.map((candidate, index) => {
        const label = index === 0 ? "A" : "B";
        const testID = index === 0 ? "arrow-duel-candidate-a" : "arrow-duel-candidate-b";
        return (
          <Pressable
            key={`${label}-${candidate}`}
            accessibilityRole="button"
            accessibilityLabel={`Choose Arrow Duel candidate ${label}`}
            accessibilityState={{ disabled }}
            disabled={disabled}
            testID={testID}
            style={[styles.arrowDuelCandidateChip, disabled ? styles.disabledButton : null]}
            onPress={() => onChoose(candidate)}
          >
            <Text style={styles.arrowDuelCandidateLabel}>{label}</Text>
            <Text style={styles.arrowDuelCandidateMeta}>Candidate</Text>
          </Pressable>
        );
      })}
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
      <SessionScoreMetric label="Solved" tone="positive" value={state.correctCount} />
      <SessionScoreMetric label="Mistakes" tone="negative" value={state.mistakeCount} />
      <SessionScoreMetric label="Left" tone="neutral" value={leftCount} />
    </View>
  );
}

function SessionScoreMetric({
  label,
  tone,
  value
}: {
  label: string;
  tone: "positive" | "negative" | "neutral";
  value: number;
}): React.JSX.Element {
  const icon = tone === "positive" ? "✓" : tone === "negative" ? "×" : "○";
  return (
    <View
      accessibilityLabel={`${label} ${value}`}
      style={styles.sessionScoreMetric}
    >
      <Text
        style={[
          styles.sessionScoreIcon,
          tone === "positive" ? styles.sessionScoreDotPositive : null,
          tone === "negative" ? styles.sessionScoreDotNegative : null,
          tone === "neutral" ? styles.sessionScoreDotNeutral : null
        ]}
      >
        {icon}
      </Text>
      <Text style={styles.sessionScoreValue}>{value}</Text>
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
  move
}: {
  boardSize: number;
  flipped: boolean;
  move: BoardMove;
}): React.JSX.Element {
  const squareSize = boardSize / 8;
  return (
    <View style={[styles.arrowLayer, { width: boardSize, height: boardSize }]} pointerEvents="none">
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
  candidates
}: {
  boardSize: number;
  flipped: boolean;
  candidates: string[];
}): React.JSX.Element {
  const squareSize = boardSize / 8;
  const pieceMoves = candidates.map((candidate) => ({
    move: candidate,
    role: "candidate",
    color: "neutral",
    selected: false
  }));

  return (
    <View style={[styles.arrowLayer, { width: boardSize, height: boardSize }]} pointerEvents="none">
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
  move,
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
  attempts,
  eloPoints,
  ratingKeys,
  puzzleStats,
  selectedRatingKey,
  timeRange,
  sourceFilter,
  resultFilter,
  modeFilter,
  ratingRangeFilter,
  sideFilter,
  themeFilter,
  availableThemes,
  page,
  wrongLast7Days,
  onRatingKeyChange,
  onTimeRangeChange,
  onSourceFilterChange,
  onResultFilterChange,
  onModeFilterChange,
  onRatingRangeFilterChange,
  onSideFilterChange,
  onThemeFilterChange,
  onPageOffsetChange,
  onOpenAttempt,
  onToggleWrongLast7Days
}: {
  attempts: HistoryAttemptView[];
  eloPoints: HistoryEloPoint[];
  ratingKeys: string[];
  puzzleStats: HistoryPuzzleStats[];
  selectedRatingKey: string | null;
  timeRange: HistoryTimeRange;
  sourceFilter: "all" | AttemptSource;
  resultFilter: "all" | "correct" | "wrong";
  modeFilter: "all" | SprintMode;
  ratingRangeFilter: HistoryRatingRangeFilter;
  sideFilter: "all" | PuzzleSide;
  themeFilter: string;
  availableThemes: string[];
  page: { limit: number; offset: number; total: number; hasMore: boolean };
  wrongLast7Days: boolean;
  onRatingKeyChange: (ratingKey: string) => void;
  onTimeRangeChange: (range: HistoryTimeRange) => void;
  onSourceFilterChange: (source: "all" | AttemptSource) => void;
  onResultFilterChange: (result: "all" | "correct" | "wrong") => void;
  onModeFilterChange: (mode: "all" | SprintMode) => void;
  onRatingRangeFilterChange: (ratingRange: HistoryRatingRangeFilter) => void;
  onSideFilterChange: (side: "all" | PuzzleSide) => void;
  onThemeFilterChange: (theme: string) => void;
  onPageOffsetChange: (offset: number) => void;
  onOpenAttempt: (attemptId: string) => void;
  onToggleWrongLast7Days: () => void;
}): React.JSX.Element {
  const [chartMetric, setChartMetric] = useState<HistoryChartMetric>("rating");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const puzzleStatsById = new Map(puzzleStats.map((stats) => [stats.puzzleId, stats]));
  const [speedFilter, setSpeedFilter] = useState<"all" | number>("all");
  const [reviewStatusFilter, setReviewStatusFilter] = useState<"all" | "queued" | "clear">("all");
  const speedFilters = collectHistorySpeedFilters(attempts);
  const visibleAttempts = attempts.filter((attempt) => {
    if (speedFilter !== "all" && historyAttemptSpeedSeconds(attempt) !== speedFilter) {
      return false;
    }
    if (reviewStatusFilter === "queued") {
      return historyAttemptHasReviewQueued(attempt, puzzleStatsById);
    }
    if (reviewStatusFilter === "clear") {
      return !historyAttemptHasReviewQueued(attempt, puzzleStatsById);
    }
    return true;
  });
  const correct = visibleAttempts.filter((attempt) => attempt.result === "correct").length;
  const wrong = visibleAttempts.filter((attempt) => attempt.result === "wrong").length;
  const accuracy = Math.round((correct / Math.max(1, correct + wrong)) * 100);
  const chartSummary = historyChartSummary(chartMetric, visibleAttempts, eloPoints, puzzleStats);

  return (
    <View style={styles.historyPanel} testID="history-panel">
      <View style={styles.reviewQueueHeader} testID="history-action-header">
        <View style={styles.panelHeaderSpacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={filtersExpanded ? "Hide history filters" : "Show history filters"}
          accessibilityState={{ expanded: filtersExpanded }}
          testID="history-filter-toggle"
          style={[styles.reviewFilterButton, filtersExpanded ? styles.reviewFilterButtonActive : null]}
          onPress={() => setFiltersExpanded((current) => !current)}
        >
          <Text style={[styles.reviewFilterButtonText, filtersExpanded ? styles.reviewFilterButtonTextActive : null]}>≡</Text>
        </Pressable>
      </View>

      <View style={styles.historyTopFilterStack} testID="history-primary-filters">
        <HistoryChipRow testID="history-mode-filters">
          <FilterButton active={modeFilter === "all"} label="All" testID="history-mode-all" onPress={() => onModeFilterChange("all")} />
          <FilterButton active={modeFilter === "standard"} label="Standard" testID="history-mode-standard" onPress={() => onModeFilterChange("standard")} />
          <FilterButton active={modeFilter === "arrow_duel"} label="Arrow Duel" testID="history-mode-arrow-duel" onPress={() => onModeFilterChange("arrow_duel")} />
          <FilterButton active={modeFilter === "blitz"} label="Blitz" testID="history-mode-blitz" onPress={() => onModeFilterChange("blitz")} />
          <FilterButton active={modeFilter === "custom"} label="Custom" testID="history-mode-custom" onPress={() => onModeFilterChange("custom")} />
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Wrong in the last 7 days"
            testID="history-filter-wrong-7-days"
            style={[styles.filterButton, wrongLast7Days ? styles.filterButtonActive : null]}
            onPress={onToggleWrongLast7Days}
          >
            <Text style={[styles.filterButtonText, wrongLast7Days ? styles.filterButtonTextActive : null]}>Wrong 7d</Text>
          </Pressable>
        </HistoryChipRow>
      </View>

      <View style={styles.historyPerformanceCard} testID="history-performance-card">
        <View style={styles.historyPerformanceHeader}>
          <View>
            <Text style={styles.panelTitle}>Performance</Text>
            <Text style={styles.helperText}>{selectedRatingKey ?? "No rating history"}</Text>
          </View>
          <View style={styles.historyMetricSummary}>
            <Text testID="history-chart-value" style={styles.historyAccuracy}>{chartSummary.value}</Text>
            <Text testID="history-chart-label" style={styles.helperText}>{chartSummary.label}</Text>
          </View>
        </View>
        <Text style={styles.listText}>Accuracy {accuracy}% · Correct {correct} · Wrong {wrong}</Text>
        <HistoryChipRow testID="history-chart-metric-filters">
          {HISTORY_CHART_METRICS.map((metric) => (
            <FilterButton
              key={metric.id}
              active={chartMetric === metric.id}
              label={metric.label}
              testID={`history-chart-${metric.id}`}
              onPress={() => setChartMetric(metric.id)}
            />
          ))}
        </HistoryChipRow>
        <HistoryMiniChart
          attempts={visibleAttempts}
          metric={chartMetric}
          points={eloPoints}
          puzzleStats={puzzleStats}
        />
      </View>

      {filtersExpanded ? (
        <View style={styles.historyAdvancedFilters} testID="history-advanced-filters">
          {ratingKeys.length > 0 ? (
            <HistoryChipRow testID="history-rating-filters">
              {ratingKeys.map((ratingKey) => (
                <FilterButton
                  key={ratingKey}
                  active={selectedRatingKey === ratingKey}
                  label={ratingKey}
                  testID={`history-rating-${ratingKey}`}
                  onPress={() => onRatingKeyChange(ratingKey)}
                />
              ))}
            </HistoryChipRow>
          ) : null}
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
          {speedFilters.length > 0 ? (
            <HistoryChipRow testID="history-speed-filters">
              <FilterButton active={speedFilter === "all"} label="All speeds" testID="history-speed-all" onPress={() => setSpeedFilter("all")} />
              {speedFilters.map((speed) => (
                <FilterButton
                  key={speed}
                  active={speedFilter === speed}
                  label={`${speed}s pace`}
                  testID={`history-speed-${speed}`}
                  onPress={() => setSpeedFilter(speed)}
                />
              ))}
            </HistoryChipRow>
          ) : null}
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
            <FilterButton active={reviewStatusFilter === "all"} label="All review states" testID="history-review-status-all" onPress={() => setReviewStatusFilter("all")} />
            <FilterButton active={reviewStatusFilter === "queued"} label="Queued" testID="history-review-status-queued" onPress={() => setReviewStatusFilter("queued")} />
            <FilterButton active={reviewStatusFilter === "clear"} label="Clear" testID="history-review-status-clear" onPress={() => setReviewStatusFilter("clear")} />
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
            <Text style={styles.iconButtonText}>‹</Text>
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
            <Text style={styles.iconButtonText}>›</Text>
          </Pressable>
        </View>
      </View>
      {visibleAttempts.length === 0 ? <Text style={styles.listText}>No attempts</Text> : null}
      {visibleAttempts.map((attempt) => (
        <HistoryAttemptRow
          key={attempt.id}
          attempt={attempt}
          puzzleStats={puzzleStatsById.get(attempt.puzzleId)}
          onOpen={() => onOpenAttempt(attempt.id)}
        />
      ))}
    </View>
  );
}

type HistoryChartMetric = "rating" | "wins-losses" | "accuracy" | "solved" | "mistake-rate" | "review-due";

const HISTORY_CHART_METRICS: ReadonlyArray<{ id: HistoryChartMetric; label: string }> = [
  { id: "rating", label: "Rating" },
  { id: "wins-losses", label: "W/L" },
  { id: "accuracy", label: "Accuracy" },
  { id: "solved", label: "Solved" },
  { id: "mistake-rate", label: "Mistakes" },
  { id: "review-due", label: "Reviews" }
];

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

function HistoryMiniChart({
  attempts,
  metric,
  points,
  puzzleStats
}: {
  attempts: HistoryAttemptView[];
  metric: HistoryChartMetric;
  points: HistoryEloPoint[];
  puzzleStats: HistoryPuzzleStats[];
}): React.JSX.Element {
  const displayed = buildHistoryChartValues(metric, attempts, points, puzzleStats).slice(-8);
  if (displayed.length === 0) {
    return (
      <View style={styles.historyChartEmpty} testID="history-performance-chart">
        <Text style={styles.helperText}>No {historyChartEmptyLabel(metric)} data in this range.</Text>
      </View>
    );
  }
  const values = displayed.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);

  return (
    <View style={styles.historyChart} testID="history-performance-chart">
      {displayed.map((point, index) => {
        const height = 12 + ((point.value - min) / span) * 46;
        return (
          <View key={`${metric}-${point.key}-${index}`} style={styles.historyChartColumn}>
            <View style={[styles.historyChartBar, { height }]} />
          </View>
        );
      })}
    </View>
  );
}

function buildHistoryChartValues(
  metric: HistoryChartMetric,
  attempts: HistoryAttemptView[],
  points: HistoryEloPoint[],
  puzzleStats: HistoryPuzzleStats[]
): Array<{ key: string; value: number }> {
  if (metric === "rating") {
    return points.map((point, index) => ({
      key: `${point.sessionId}-${point.completedAt}-${index}`,
      value: point.ratingAfter
    }));
  }

  if (metric === "review-due") {
    return puzzleStats.map((stats, index) => ({
      key: `${stats.puzzleId}-${index}`,
      value: (stats.nextReviewAt ? 1 : 0) + Math.max(0, stats.wrongCount - stats.correctCount)
    }));
  }

  let correct = 0;
  let wrong = 0;
  return [...attempts].reverse().map((attempt, index) => {
    if (attempt.result === "correct") {
      correct += 1;
    } else {
      wrong += 1;
    }
    const total = Math.max(1, correct + wrong);
    const value = metric === "wins-losses"
      ? correct - wrong
      : metric === "accuracy"
        ? Math.round((correct / total) * 100)
        : metric === "mistake-rate"
          ? Math.round((wrong / total) * 100)
          : correct;
    return {
      key: `${attempt.id}-${index}`,
      value
    };
  });
}

function historyChartSummary(
  metric: HistoryChartMetric,
  attempts: HistoryAttemptView[],
  points: HistoryEloPoint[],
  puzzleStats: HistoryPuzzleStats[]
): { label: string; value: string } {
  const correct = attempts.filter((attempt) => attempt.result === "correct").length;
  const wrong = attempts.filter((attempt) => attempt.result === "wrong").length;
  const total = Math.max(1, correct + wrong);
  if (metric === "rating") {
    const latest = points[points.length - 1]?.ratingAfter;
    return { label: "Rating", value: latest ? String(latest) : "—" };
  }
  if (metric === "accuracy") {
    return { label: "Accuracy", value: `${Math.round((correct / total) * 100)}%` };
  }
  if (metric === "wins-losses") {
    const net = correct - wrong;
    return { label: "Wins/Losses", value: `${net >= 0 ? "+" : ""}${net}` };
  }
  if (metric === "solved") {
    return { label: "Solved", value: String(correct) };
  }
  if (metric === "mistake-rate") {
    return { label: "Mistake rate", value: `${Math.round((wrong / total) * 100)}%` };
  }
  const dueVolume = puzzleStats.filter((stats) => Boolean(stats.nextReviewAt)).length;
  return { label: "Review due", value: String(dueVolume) };
}

function historyChartEmptyLabel(metric: HistoryChartMetric): string {
  if (metric === "mistake-rate") {
    return "mistake rate";
  }
  if (metric === "review-due") {
    return "review due";
  }
  if (metric === "wins-losses") {
    return "wins/losses";
  }
  return metric;
}

function collectHistorySpeedFilters(attempts: HistoryAttemptView[]): number[] {
  const speeds = new Set<number>();
  for (const attempt of attempts) {
    const speed = historyAttemptSpeedSeconds(attempt);
    if (speed !== null) {
      speeds.add(speed);
    }
  }
  return [...speeds].sort((left, right) => left - right);
}

function historyAttemptSpeedSeconds(attempt: HistoryAttemptView): number | null {
  const match = attempt.ratingKey.match(/\/(\d+)\b/);
  return match ? Number(match[1]) : null;
}

function historyAttemptHasReviewQueued(
  attempt: HistoryAttemptView,
  puzzleStatsById: Map<string, HistoryPuzzleStats>
): boolean {
  if (attempt.result !== "wrong") {
    return false;
  }
  const stats = puzzleStatsById.get(attempt.puzzleId);
  return stats?.nextReviewAt ? true : true;
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

function HistoryAttemptRow({
  attempt,
  onOpen,
  puzzleStats
}: {
  attempt: HistoryAttemptView;
  onOpen: () => void;
  puzzleStats?: HistoryPuzzleStats;
}): React.JSX.Element {
  const isWrong = attempt.result === "wrong";
  const delta = (attempt.ratingAfter ?? attempt.ratingBefore) - attempt.ratingBefore;
  const elapsedSeconds = Math.max(0, Math.round((new Date(attempt.completedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000));
  const reviewLabel = isWrong
    ? puzzleStats?.nextReviewAt
      ? `Review ${puzzleStats.nextReviewAt.slice(0, 10)}`
      : "Review queued"
    : "Correct";
  const resultLabel = isWrong ? "Wrong move" : "Correct";
  const sourceLabel = attempt.source === "scheduled_review" ? "Review" : "Sprint";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${modeLabel(attempt.mode)} ${attempt.result} puzzle review`}
      testID={`history-attempt-${attempt.id}`}
      style={styles.historyAttemptCard}
      onPress={onOpen}
    >
      <View style={[styles.historyResultBadge, isWrong ? styles.historyResultWrong : styles.historyResultCorrect]}>
        <Text style={styles.historyResultBadgeText}>{isWrong ? "×" : "✓"}</Text>
      </View>
      <View style={styles.historyAttemptCopy}>
        <View style={styles.historyAttemptHeader}>
          <Text style={styles.historyRowTitle}>{modeLabel(attempt.mode)}</Text>
          <Text testID={`history-attempt-${attempt.id}-result`} style={styles.helperText}>{resultLabel}</Text>
        </View>
        <Text testID={`history-attempt-${attempt.id}-move`} style={styles.helperText}>{resultLabel} · {attempt.submittedMove}</Text>
        <Text testID={`history-attempt-${attempt.id}-meta`} style={styles.helperText}>
          {sourceLabel} · Rating {attempt.puzzleRating} · {elapsedSeconds}s · {attempt.completedAt.slice(0, 10)}
        </Text>
      </View>
      <View style={styles.historyAttemptStatus} testID={`history-attempt-${attempt.id}-status`}>
        <Text style={[styles.historyReviewState, isWrong ? styles.reviewDifficultyHard : styles.reviewDifficultyEasy]}>
          {reviewLabel}
        </Text>
        <Text testID={`history-attempt-${attempt.id}-delta`} style={[styles.historyRatingDelta, delta < 0 ? styles.errorText : styles.positive]}>
          {delta >= 0 ? "+" : ""}{delta}
        </Text>
      </View>
    </Pressable>
  );
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

function groupReviewEntriesByContext(entries: ReviewEntry[]): Array<{
  key: string;
  mode: SprintMode;
  ratingKey: string;
  entries: ReviewEntry[];
}> {
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

function reviewDifficultySummary(items: ReviewQueueItem[]): { easy: number; medium: number; hard: number } {
  return items.reduce((summary, item) => {
    const difficulty = reviewItemDifficulty(item);
    if (difficulty === "hard") {
      summary.hard += 1;
    } else if (difficulty === "medium") {
      summary.medium += 1;
    } else {
      summary.easy += 1;
    }
    return summary;
  }, { easy: 0, medium: 0, hard: 0 });
}

function reviewItemDifficulty(item: ReviewQueueItem): "easy" | "medium" | "hard" {
  if (item.review.lapseCount > 0 || item.review.lastResult === "wrong") {
    return "hard";
  }
  if (item.review.reviewCount > 1) {
    return "medium";
  }
  return "easy";
}

function difficultyLabel(difficulty: "easy" | "medium" | "hard"): string {
  return difficulty[0].toUpperCase() + difficulty.slice(1);
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

function filterReviewQueueItems(items: ReviewQueueItem[], filter: ReviewQueueFilter): ReviewQueueItem[] {
  const now = Date.now();
  return items.filter((item) => {
    if (filter === "all") {
      return true;
    }
    if (filter === "overdue") {
      return new Date(item.review.dueAt).getTime() <= now;
    }
    if (filter === "failed") {
      return item.review.lastResult === "wrong" || item.review.lapseCount > 0;
    }
    if (filter === "arrow_duel") {
      return item.review.mode === "arrow_duel";
    }
    if (filter.startsWith("difficulty:")) {
      return reviewItemDifficulty(item) === filter.slice("difficulty:".length);
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
  if (filter.startsWith("difficulty:")) {
    return `${difficultyLabel(filter.slice("difficulty:".length) as ReviewDifficulty)} reviews`;
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

function reviewQueueSummary(items: ReviewQueueItem[], filteredItems: ReviewQueueItem[]): {
  filteredCount: number;
  oldestDueLabel: string;
  overdueCount: number;
  totalCount: number;
} {
  const now = Date.now();
  const dueTimes = items.map((item) => new Date(item.review.dueAt).getTime()).filter(Number.isFinite);
  const oldestDueTime = dueTimes.length > 0 ? Math.min(...dueTimes) : null;
  return {
    filteredCount: filteredItems.length,
    oldestDueLabel: oldestDueTime === null
      ? "Next review appears after a missed puzzle reaches its due time"
      : `Oldest due ${new Date(oldestDueTime).toISOString().slice(0, 10)}`,
    overdueCount: items.filter((item) => new Date(item.review.dueAt).getTime() <= now).length,
    totalCount: items.length
  };
}

function formatIntervalHours(hours: number): string {
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.round(hours / 24);
  return `${days}d`;
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
  | `difficulty:${ReviewDifficulty}`
  | `mode:${SprintMode}`
  | `speed:${number}`
  | `theme:${string}`;

type ReviewDifficulty = "easy" | "medium" | "hard";

type ReviewPuzzleState =
  | { kind: "line"; line: PuzzleLineState }
  | { kind: "arrow_duel"; duel: ArrowDuelState };

function ReviewPanel({
  boardSize,
  dueReviewItems,
  onExitSessionReview,
  onOpenPractice,
  service,
  sessionMistakeReviewItems,
  stockfishTransportFactory
}: {
  boardSize: number;
  dueReviewItems: ReviewQueueItem[];
  onExitSessionReview: () => void;
  onOpenPractice: () => void;
  service: PracticeService;
  sessionMistakeReviewItems: SessionMistakeReviewItem[];
  stockfishTransportFactory: () => UciEngineTransport | null;
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
  const preferredEntriesKey = preferredEntries.map((entry) => `${entry.source}:${entry.puzzle.id}:${entry.mode}`).join("|");
  const [activeEntries, setActiveEntries] = useState<ReviewEntry[]>(preferredEntries);
  const [queueFilter, setQueueFilter] = useState<ReviewQueueFilter>("all");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const themeFilters = collectReviewThemeFilters(dueReviewItems);
  const speedFilters = collectReviewSpeedFilters(dueReviewItems);
  const filteredDueReviewItems = filterReviewQueueItems(dueReviewItems, queueFilter);
  const filteredDueEntries = filteredDueReviewItems.map((item): ReviewEntry => ({
    puzzle: item.puzzle,
    mode: item.review.mode,
    ratingKey: item.review.ratingKey,
    source: "due"
  }));
  const filteredContextGroups = groupReviewEntriesByContext(filteredDueEntries);
  const difficultySummary = reviewDifficultySummary(dueReviewItems);
  const queueSummary = reviewQueueSummary(dueReviewItems, filteredDueReviewItems);

  useEffect(() => {
    setActiveEntries(preferredEntries);
  }, [preferredEntriesKey]);

  if (activeEntries.length > 0) {
    return (
      <ReviewSession
        key={activeEntries.map((entry) => `${entry.source}:${entry.puzzle.id}:${entry.mode}`).join("|")}
        boardSize={boardSize}
        entries={activeEntries}
        service={service}
        onExit={(source) => {
          setActiveEntries([]);
          if (source === "session") {
            onExitSessionReview();
          }
        }}
        stockfishTransportFactory={stockfishTransportFactory}
      />
    );
  }

  return (
    <View style={styles.reviewQueuePanel} testID="review-panel">
      <View style={styles.reviewQueueHeader} testID="review-action-header">
        <View style={styles.panelHeaderSpacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={filtersExpanded ? "Hide review filters" : "Show review filters"}
          accessibilityState={{ expanded: filtersExpanded }}
          testID="review-filter-toggle"
          style={[styles.reviewFilterButton, filtersExpanded ? styles.reviewFilterButtonActive : null]}
          onPress={() => setFiltersExpanded((current) => !current)}
        >
          <Text style={[styles.reviewFilterButtonText, filtersExpanded ? styles.reviewFilterButtonTextActive : null]}>≡</Text>
        </Pressable>
      </View>

      <View style={styles.reviewDueCard} testID="review-due-card">
        <View>
          <Text style={styles.reviewDueTitle}>Due Today</Text>
          <Text testID="review-due-summary" style={styles.helperText}>
            {filteredDueEntries.length > 0 ? `${reviewQueueFilterLabel(queueFilter)} · Ready now` : "No matching scheduled reviews"}
          </Text>
          <Text testID="review-next-due" style={styles.helperText}>{queueSummary.oldestDueLabel}</Text>
        </View>
        <View style={styles.reviewDueMetrics}>
          <Text testID="review-due-count" style={styles.reviewDueBigCount}>{queueSummary.filteredCount}</Text>
        </View>
      </View>

      <View style={styles.reviewDifficultyList} testID="review-difficulty-list">
        <ReviewDifficultyRow
          active={queueFilter === "difficulty:easy"}
          label="Easy"
          detail="All good"
          count={difficultySummary.easy}
          tone="easy"
          onPress={() => setQueueFilter("difficulty:easy")}
        />
        <ReviewDifficultyRow
          active={queueFilter === "difficulty:medium"}
          label="Medium"
          detail="Needs attention"
          count={difficultySummary.medium}
          tone="medium"
          onPress={() => setQueueFilter("difficulty:medium")}
        />
        <ReviewDifficultyRow
          active={queueFilter === "difficulty:hard"}
          label="Hard"
          detail={difficultySummary.hard > 0 ? "Overdue" : "Stable"}
          count={difficultySummary.hard}
          tone="hard"
          onPress={() => setQueueFilter("difficulty:hard")}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start due review"
        accessibilityState={{ disabled: filteredDueEntries.length === 0 }}
        disabled={filteredDueEntries.length === 0}
        testID="review-start-due"
        style={[styles.primaryButton, styles.reviewStartButton, filteredDueEntries.length === 0 ? styles.disabledButton : null]}
        onPress={() => {
          const firstGroup = filteredContextGroups[0];
          if (firstGroup) {
            setActiveEntries(firstGroup.entries);
          }
        }}
      >
        <Text style={styles.primaryButtonText}>Start Review</Text>
      </Pressable>

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
          <FilterButton active={queueFilter === "mode:blitz"} label="Blitz" testID="review-filter-mode-blitz" onPress={() => setQueueFilter("mode:blitz")} />
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
              onPress={() => setActiveEntries([{
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
              onPress={() => setActiveEntries(group.entries)}
            >
              <View>
                <Text style={styles.historyRowTitle}>{modeLabel(group.mode)}</Text>
                <Text style={styles.helperText}>{group.ratingKey}</Text>
              </View>
              <View style={styles.reviewContextMeta}>
                <Text style={styles.reviewContextCount}>{group.entries.length}</Text>
                <Text style={styles.practiceModeChevron}>›</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : filteredDueReviewItems.length === 0 ? (
        <View style={styles.emptyReviewPanel} testID="review-empty-state">
          <Text style={styles.listText}>{dueReviewItems.length === 0 ? "No reviews due today" : "No matching scheduled reviews"}</Text>
          <Text style={styles.helperText}>
            {dueReviewItems.length === 0
              ? "Next scheduled review appears here when the memory curve reaches its due time."
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

    </View>
  );
}

function ReviewQueueItemCard({
  item,
  onPress
}: {
  item: ReviewQueueItem;
  onPress: () => void;
}): React.JSX.Element {
  const difficulty = reviewItemDifficulty(item);
  const primaryTheme = item.puzzle.themes[0] ?? "mixed";
  const lastWrongDate = item.review.lastReviewedAt.slice(0, 10);
  const dueState = new Date(item.review.dueAt).getTime() <= Date.now() ? "Due now" : `Due ${item.review.dueAt.slice(0, 10)}`;
  const source = item.review.ratingKey.includes("/")
    ? item.review.ratingKey
    : `${modeLabel(item.review.mode)} sprint`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Start ${modeLabel(item.review.mode)} ${primaryTheme} review`}
      testID={`review-due-item-${item.puzzle.id}-${safeTestId(item.review.mode)}`}
      style={styles.reviewItemCard}
      onPress={onPress}
    >
      <View style={[styles.historyResultBadge, difficulty === "hard" ? styles.historyResultWrong : styles.historyResultCorrect]}>
        <Text style={styles.historyResultBadgeText}>{difficulty === "hard" ? "!" : "✓"}</Text>
      </View>
      <View style={styles.reviewItemCopy}>
        <View style={styles.historyAttemptHeader}>
          <Text style={styles.historyRowTitle}>{modeLabel(item.review.mode)}</Text>
          <Text style={[
            styles.reviewItemDifficulty,
            difficulty === "easy" ? styles.reviewDifficultyEasy : null,
            difficulty === "medium" ? styles.reviewDifficultyMedium : null,
            difficulty === "hard" ? styles.reviewDifficultyHard : null
          ]}>
            {difficultyLabel(difficulty)}
          </Text>
        </View>
        <Text style={styles.helperText}>{primaryTheme} · Last wrong {lastWrongDate}</Text>
        <Text style={styles.helperText}>{dueState} · {formatIntervalHours(item.review.intervalHours)} interval</Text>
        <Text style={styles.helperText}>{source} · Review {item.review.reviewCount} · Lapses {item.review.lapseCount}</Text>
      </View>
      <Text style={styles.practiceModeChevron}>›</Text>
    </Pressable>
  );
}

function ReviewDifficultyRow({
  active,
  count,
  detail,
  label,
  onPress,
  tone
}: {
  active: boolean;
  count: number;
  detail: string;
  label: string;
  onPress: () => void;
  tone: ReviewDifficulty;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Filter ${label.toLowerCase()} reviews`}
      accessibilityState={{ selected: active }}
      style={[styles.reviewDifficultyRow, active ? styles.reviewDifficultyRowActive : null]}
      testID={`review-difficulty-${tone}`}
      onPress={onPress}
    >
      <View>
        <Text style={styles.listText}>{label}</Text>
        <Text style={styles.helperText}>{detail}</Text>
      </View>
      <View style={styles.reviewDifficultyMeta}>
        <Text style={[
          styles.reviewDifficultyCount,
          tone === "easy" ? styles.reviewDifficultyEasy : null,
          tone === "medium" ? styles.reviewDifficultyMedium : null,
          tone === "hard" ? styles.reviewDifficultyHard : null
        ]}>
          {count}
        </Text>
        <Text style={styles.practiceModeChevron}>›</Text>
      </View>
    </Pressable>
  );
}

function ReviewSession({
  boardSize,
  entries,
  initialIndex = 0,
  service,
  onExit,
  stockfishTransportFactory
}: {
  boardSize: number;
  entries: ReviewEntry[];
  initialIndex?: number;
  service: PracticeService;
  onExit: (source: ReviewEntry["source"]) => void;
  stockfishTransportFactory: () => UciEngineTransport | null;
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
  const [analysisBackStack, setAnalysisBackStack] = useState<string[]>([]);
  const [analysisForwardStack, setAnalysisForwardStack] = useState<string[]>([]);
  const [manualBoardFlip, setManualBoardFlip] = useState(false);
  const [reviewResultRecorded, setReviewResultRecorded] = useState(false);
  const [reviewStartedAtMs, setReviewStartedAtMs] = useState(() => Date.now());
  const [reviewNowMs, setReviewNowMs] = useState(() => Date.now());
  const [reviewTimedOut, setReviewTimedOut] = useState(false);
  const currentEntry = entries[entryIndex];
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
  const boardGestureEnabled = !boardLocked;
  const boardDraggableColor = boardGestureEnabled ? sideToMove(displayFen) : null;
  const isSessionReview = currentEntry.source === "session";
  const canNavigateReview = (currentEntry.source === "session" || currentEntry.source === "history") && !boardLocked;
  const canReviewPrevious = canNavigateReview && entryIndex > 0;
  const canReviewNext = canNavigateReview && entryIndex < entries.length - 1;
  const canAnalysisBack = analysisEnabled && analysisBackStack.length > 0;
  const canAnalysisForward = analysisEnabled && analysisForwardStack.length > 0;
  const analysisDepth = engineAnalysisLines.reduce((maxDepth, line) => Math.max(maxDepth, line.depth), 0);
  const reviewPerPuzzleSeconds = perPuzzleSecondsForReviewEntry(currentEntry);
  const reviewPrimaryTheme = currentEntry.puzzle.themes[0] ?? "mixed";
  const reviewSourceLabel = currentEntry.source === "session"
    ? "Sprint review"
    : currentEntry.source === "history"
      ? "History replay"
      : "Scheduled review";
  const arrowReviewChoiceLabel = currentEntry.mode === "arrow_duel"
    ? wrongSeen || isArrowDuelFollowUpReview
      ? "You chose: Red (blunder)"
      : "Green = best move · Red = blunder"
    : null;
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

    const transport = stockfishTransportFactory();
    if (!transport) {
      setEngineAnalysisLines([]);
      setAnalysisEngineStatus("fallback");
      setAnalysisIsRunning(false);
      return;
    }

    let cancelled = false;
    setEngineAnalysisLines([]);
    setAnalysisEngineStatus("thinking");
    setAnalysisIsRunning(true);
    const usePrewarmedNativeEngine = stockfishTransportFactory === createNativeStockfishTransport;
    const prewarm = usePrewarmedNativeEngine ? prewarmNativeStockfishTransport() : Promise.resolve(false);
    void prewarm.then((prewarmed) => analyzeFenWithUciEngine(transport, stockfishTargetFen, {
      depth: ANALYSIS_DEPTH,
      multiPv: 3,
      initialize: !prewarmed,
      newGame: !prewarmed,
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
      transport.send("stop");
    };
  }, [analysisEnabled, stockfishTargetFen, stockfishTransportFactory]);

  useEffect(() => {
    if (currentEntry.source !== "due" || reviewResultRecorded) {
      return;
    }
    const timer = setInterval(() => {
      setReviewNowMs(Date.now());
    }, 500);
    return () => {
      clearInterval(timer);
    };
  }, [currentEntry.source, entryIndex, reviewResultRecorded]);

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
  }, [currentEntry.source, currentPuzzle, reviewRemainingSeconds, reviewResultRecorded, reviewTimedOut]);

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
    const now = Date.now();
    setReviewStartedAtMs(now);
    setReviewNowMs(now);
    setReviewTimedOut(false);
    reviewResultRecordedRef.current = false;
    reviewSuppressedBoardMovesRef.current = [];
  }

  function advanceReview(result: "correct" | "wrong", reviewMove?: { submittedMove: string; expectedMove: string }): void {
    recordCurrentReviewResult(result, reviewMove);
    if (currentEntry.source !== "due") {
      setBoardLocked(false);
      return;
    }
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
    service.recordReviewAttempt({
      puzzleId: currentEntry.puzzle.id,
      mode: currentEntry.mode,
      ratingKey: currentEntry.ratingKey,
      result,
      submittedMove: reviewMove?.submittedMove ?? "__analysis__",
      expectedMove: reviewMove?.expectedMove ?? expectedReviewMove(currentPuzzle)
    });
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
    <View style={styles.reviewSessionPanel} testID="review-session">
      <View style={styles.reviewHeaderRow}>
        <View style={styles.reviewTopNav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Exit review"
            testID="review-exit"
            style={styles.iconButton}
            onPress={() => onExit(currentEntry.source)}
          >
            <Text style={styles.iconButtonText}>×</Text>
          </Pressable>
          <View style={styles.reviewTitleBlock}>
            <Text style={styles.panelTitle}>Review</Text>
            <Text testID="review-progress" style={styles.helperText}>
              {entryIndex + 1} / {entries.length} · {modeLabel(currentEntry.mode)}
            </Text>
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
                <Text style={styles.iconButtonText}>‹</Text>
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
                <Text style={styles.iconButtonText}>›</Text>
              </Pressable>
            </>
          ) : null}
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
          </View>
        </View>
        <View style={styles.reviewContextStrip} testID="review-context-strip">
          <View style={styles.reviewContextPill} testID="review-source-pill">
            <Text style={styles.reviewContextPillText}>{reviewSourceLabel}</Text>
          </View>
          <View style={styles.reviewContextPill} testID="review-theme-pill">
            <Text style={styles.reviewContextPillText}>{reviewPrimaryTheme}</Text>
          </View>
          {reviewRemainingSeconds !== null ? (
            <View style={[styles.reviewContextPill, reviewRemainingSeconds === 0 ? styles.reviewContextPillDanger : null]}>
              <Text testID="review-timer" style={[styles.reviewContextPillText, reviewRemainingSeconds === 0 ? styles.errorText : null]}>
                {reviewRemainingSeconds === 0 ? "Time expired" : formatDuration(reviewRemainingSeconds)}
              </Text>
            </View>
          ) : null}
          {arrowReviewChoiceLabel ? (
            <View style={styles.reviewArrowLegendPill} testID="review-arrow-choice-marker">
              <View style={styles.reviewLegendSwatchGreen} />
              <View style={styles.reviewLegendSwatchRed} />
              <Text style={styles.reviewContextPillText}>{arrowReviewChoiceLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>

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

      <View style={styles.reviewBoardLayout}>
        <View style={styles.boardWrapper}>
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
              durations={{ move: 260 }}
              spriteSource={CHESS_PIECE_SPRITE}
              colors={{
                white: "#EEF2F5",
                black: "#A3ADB8",
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
            {lastMove && !feedback ? <LastMoveOverlay boardSize={boardSize} flipped={boardFlipped} move={lastMove} /> : null}
            {feedbackMove ? (
              <MoveFeedbackOverlay
                boardSize={boardSize}
                flipped={boardFlipped}
                move={feedbackMove}
                result={feedback?.result ?? "wrong"}
              />
            ) : null}
            {reviewState.kind === "arrow_duel" && !feedback && !analysisEnabled ? (
              <ArrowCandidateOverlay boardSize={boardSize} flipped={boardFlipped} candidates={reviewState.duel.candidates} />
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
          <View style={styles.analysisToolbar} testID="review-analysis-toolbar">
            {analysisEnabled ? (
              <>
                <Pressable accessibilityRole="button" accessibilityLabel="Close analysis" testID="review-close-analysis" style={styles.iconButton} onPress={closeAnalysis}>
                  <Text style={styles.iconButtonText}>×</Text>
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
                  <Text style={styles.iconButtonText}>‹</Text>
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
                  <Text style={styles.iconButtonText}>›</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Reset analysis" testID="review-analysis-reset" style={styles.iconButton} onPress={resetAnalysisPosition}>
                  <Text style={styles.iconButtonText}>↺</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Flip board" testID="review-analysis-flip" style={styles.iconButton} onPress={() => setManualBoardFlip((current) => !current)}>
                  <Text style={styles.iconButtonText}>⇄</Text>
                </Pressable>
                <Text testID="review-analysis-engine-status" style={styles.analysisEngineStatus} numberOfLines={1}>
                  {analysisEngineLabel}
                </Text>
              </>
            ) : (
              <>
                <Pressable accessibilityRole="button" accessibilityLabel="Analyze position" testID="review-analysis-button" style={styles.analysisIconButton} onPress={openAnalysis}>
                  <Text style={styles.analysisIconButtonText}>⌕</Text>
                </Pressable>
                <Text style={styles.analysisTitle}>Analysis</Text>
              </>
            )}
          </View>
          {analysisEnabled ? (
            <>
              {analysisLines.map((line, index) => (
                <Pressable
                  key={`${line.move}-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${line.score} ${index + 1}. ${line.san} ${line.label}`}
                  style={styles.analysisLineRow}
                  testID={`review-analysis-line-${index}`}
                  onPress={() => {
                    void playAnalysisCandidateMove(line.move);
                  }}
                >
                  <Text style={styles.analysisEvalText}>{line.score}</Text>
                  <Text style={styles.analysisMoveText} numberOfLines={1}>{index + 1}. {line.san}</Text>
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
    return { kind: "arrow_duel", duel: beginArrowDuelPuzzle(entry.puzzle) };
  }
  return { kind: "line", line: beginLinePuzzle(entry.puzzle) };
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
    return Number(fromRatingKey);
  }
  return defaultSprintConfig(entry.mode).perPuzzleSeconds;
}

function normalizeUci(move: string): string {
  return move.trim().toLowerCase();
}

function SettingsPanel({
  onOpenDiagnostics,
  onOpenPacks,
  onResetRating,
  standardRating
}: {
  onOpenDiagnostics?: () => void;
  onOpenPacks: () => void;
  onResetRating: () => void;
  standardRating: number;
}): React.JSX.Element {
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [syncUploadAllowed, setSyncUploadAllowed] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<"reset-elo" | "delete-history" | null>(null);
  const [advancedRatingsOpen, setAdvancedRatingsOpen] = useState(false);
  const syncStatusLabel = syncEnabled
    ? syncUploadAllowed
      ? "Ready"
      : "Needs approval"
    : "Local only";

  return (
    <View style={styles.settingsPanel} testID="settings-panel">
      <SettingsSection title="Profile" testID="settings-profile-section">
        <SettingsRow
          label="Puzzle ELO (Standard)"
          value={`ELO ${standardRating}`}
          detail="Current sprint rating bucket"
          testID="settings-standard-elo-row"
        />
        <SettingsRow
          label="Reset ELO"
          detail="Resets the Standard puzzle rating only"
          destructive
          testID="settings-reset-elo"
          onPress={() => setConfirmation("reset-elo")}
        />
        <SettingsRow
          label="Advanced ratings"
          value={advancedRatingsOpen ? "Open" : "Hidden"}
          detail="Manual adjustment stays behind an advanced affordance"
          testID="settings-advanced-ratings"
          onPress={() => setAdvancedRatingsOpen((current) => !current)}
        />
        {advancedRatingsOpen ? <AdvancedRatingsPanel /> : null}
      </SettingsSection>

      <SettingsSection title="Sync" testID="settings-sync-section">
        <View style={styles.settingsRow} testID="settings-icloud-sync-row">
          <View style={styles.settingsRowCopy}>
            <Text style={styles.listText}>iCloud Sync</Text>
            <Text testID="settings-sync-status" style={styles.helperText}>
              {syncEnabled
                ? syncUploadAllowed
                  ? "Practice works offline · Last synced today, 09:28"
                  : "Practice works offline · Waiting for upload approval"
                : "Off · Local-only progress"}
            </Text>
          </View>
          <View style={styles.syncRowMeta}>
            <Text
              testID="settings-sync-disclosure"
              style={[styles.syncStatusText, syncEnabled ? styles.positive : styles.errorText]}
            >
              {syncStatusLabel}
            </Text>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="iCloud sync"
              accessibilityState={{ checked: syncEnabled }}
              testID="settings-icloud-sync-toggle"
              style={[styles.switchButton, syncEnabled ? styles.switchButtonActive : null]}
              onPress={() => {
                setSyncEnabled((current) => !current);
                setStatusMessage(syncEnabled ? "iCloud sync off" : "iCloud sync on");
              }}
            >
              <Text style={[styles.switchText, syncEnabled ? styles.switchTextActive : null]}>{syncEnabled ? "On" : "Off"}</Text>
            </Pressable>
          </View>
        </View>
        {syncEnabled && !syncUploadAllowed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Allow iCloud upload"
            testID="settings-sync-allow-upload"
            style={styles.syncApprovalRow}
            onPress={() => {
              setSyncUploadAllowed(true);
              setStatusMessage("iCloud upload allowed");
            }}
          >
            <View style={styles.settingsRowCopy}>
              <Text style={styles.listText}>Allow upload</Text>
              <Text style={styles.helperText}>Required before this device uploads existing local progress.</Text>
            </View>
            <Text style={styles.practiceModeChevron}>›</Text>
          </Pressable>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Data" testID="settings-data-section">
        <SettingsRow
          label="Export Data"
          value="JSON"
          detail="Prepare local progress for backup"
          testID="settings-export-data"
          onPress={() => setStatusMessage("Export prepared")}
        />
        <SettingsRow
          label="Delete Local History"
          detail="Requires confirmation before anything is removed"
          destructive
          testID="settings-delete-local-history"
          onPress={() => setConfirmation("delete-history")}
        />
      </SettingsSection>

      <SettingsSection title="Packs" testID="settings-packs-section">
        <SettingsRow
          label="Manage Puzzle Packs"
          value="Open Packs"
          detail="Bundled and imported offline puzzle packs"
          testID="settings-manage-packs"
          onPress={onOpenPacks}
        />
      </SettingsSection>

      <SettingsSection title="About" testID="settings-about-section">
        <SettingsRow
          label="App Version"
          value="1.0.0"
          testID="settings-app-version"
        />
        <SettingsRow
          label="License"
          value="GPL"
          detail="Stockfish integration keeps the app open source"
          testID="settings-license"
        />
      </SettingsSection>

      {statusMessage ? <Text style={styles.settingsStatusText} testID="settings-status-message">{statusMessage}</Text> : null}
      {confirmation === "reset-elo" ? (
        <DestructiveConfirmationCard
          confirmLabel="Reset ELO"
          description="This resets only the Standard puzzle rating bucket. Puzzle history and review schedules stay intact."
          testID="settings-reset-elo-confirmation"
          title="Reset Standard puzzle ELO?"
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            onResetRating();
            setConfirmation(null);
            setStatusMessage("ELO reset");
          }}
        />
      ) : null}
      {confirmation === "delete-history" ? (
        <DestructiveConfirmationCard
          confirmLabel="Delete History"
          description="This would remove local attempt history after a final implementation pass. No data is removed from this preview."
          testID="settings-delete-history-confirmation"
          title="Delete local history?"
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            setConfirmation(null);
            setStatusMessage("Delete requires data-layer implementation");
          }}
        />
      ) : null}
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

function AdvancedRatingsPanel(): React.JSX.Element {
  return (
    <View style={styles.advancedRatingsPanel} testID="settings-advanced-ratings-panel">
      <Text style={styles.sectionLabel}>Manual rating controls</Text>
      <Text style={styles.helperText}>
        Hidden by default. Use reset for the current bucket; manual edits need a data-layer implementation before they can write ratings.
      </Text>
      <View style={styles.advancedRatingRows}>
        <AdvancedRatingRow label="Standard" value="standard 5/20" testID="settings-advanced-rating-standard" />
        <AdvancedRatingRow label="Arrow Duel" value="arrow duel 5/30" testID="settings-advanced-rating-arrow-duel" />
        <AdvancedRatingRow label="Blitz" value="blitz 5/10" testID="settings-advanced-rating-blitz" />
      </View>
    </View>
  );
}

function AdvancedRatingRow({
  label,
  testID,
  value
}: {
  label: string;
  testID: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.advancedRatingRow} testID={testID}>
      <View>
        <Text style={styles.listText}>{label}</Text>
        <Text style={styles.helperText}>{value}</Text>
      </View>
      <Text style={styles.settingsRowValue}>Locked</Text>
    </View>
  );
}

function DestructiveConfirmationCard({
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  testID,
  title
}: {
  confirmLabel: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  testID: string;
  title: string;
}): React.JSX.Element {
  return (
    <View
      accessibilityLabel={title}
      testID={testID}
      style={styles.destructiveConfirmationCard}
    >
      <Text style={styles.sectionLabel}>{title}</Text>
      <Text style={styles.helperText}>{description}</Text>
      <View style={styles.confirmationActionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel destructive action"
          testID={`${testID}-cancel`}
          style={styles.secondaryButton}
          onPress={onCancel}
        >
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          testID={`${testID}-confirm`}
          style={styles.destructiveButton}
          onPress={onConfirm}
        >
          <Text style={styles.destructiveButtonText}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SettingsSection({
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
  testID,
  value
}: {
  destructive?: boolean;
  detail?: string;
  label: string;
  onPress?: () => void;
  testID: string;
  value?: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={label}
      testID={testID}
      style={styles.settingsRow}
      onPress={onPress}
    >
      <View style={styles.settingsRowCopy}>
        <Text style={[styles.listText, destructive ? styles.settingsDestructiveText : null]}>{label}</Text>
        {detail ? <Text style={styles.helperText}>{detail}</Text> : null}
      </View>
      <View style={styles.settingsRowMeta}>
        {value ? <Text style={styles.settingsRowValue}>{value}</Text> : null}
        <Text style={styles.practiceModeChevron}>›</Text>
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

type PackImportProgress = {
  packTitle: string;
  progress: number;
  status: "validating" | "ready";
};

function PacksPanel(): React.JSX.Element {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<PackImportProgress | null>(null);
  const [removalPack, setRemovalPack] = useState<PackRowModel | null>(null);
  const [selectedPack, setSelectedPack] = useState<PackRowModel | null>(null);
  const installedPacks: PackRowModel[] = [
    {
      id: "core",
      title: "Core Pack",
      subtitle: "~1,000 puzzles · offline",
      detail: "Rating 600 - 1600 · Mixed, mate, endgame · Arrow Duel ready",
      coverage: {
        puzzles: "~1k",
        rating: "600-1600",
        themes: "Mixed",
        arrowDuel: "Ready"
      },
      source: "Lichess puzzle database",
      presolveStatus: "Chessticize presolved",
      manifestHash: "core-2026-06-fixture",
      buildDate: "Bundled fixture",
      licenseNote: "Derived from Lichess puzzle data with Chessticize presolve metadata.",
      status: "active",
      testID: "packs-installed-core"
    },
    {
      id: "tactics",
      title: "Tactics Pack",
      subtitle: "~50k puzzles · installed",
      detail: "Rating 800 - 2200 · tactics-heavy coverage",
      coverage: {
        puzzles: "~50k",
        rating: "800-2200",
        themes: "Tactics",
        arrowDuel: "Partial"
      },
      source: "Lichess puzzle database",
      presolveStatus: "Presolved locally",
      manifestHash: "tactics-preview-50k",
      buildDate: "Preview bundle",
      licenseNote: "Imported packs keep source attribution and do not modify attempt history.",
      status: "installed",
      testID: "packs-installed-tactics"
    }
  ];
  const optionalPacks: PackRowModel[] = [
    {
      id: "endgame",
      title: "Endgame Pack",
      subtitle: "~40k puzzles · optional",
      detail: "Rating 900 - 2400 · rook, pawn, conversion themes",
      coverage: {
        puzzles: "~40k",
        rating: "900-2400",
        themes: "Endgame",
        arrowDuel: "Limited"
      },
      source: "Lichess puzzle database",
      presolveStatus: "Manifest pending validation",
      manifestHash: "endgame-manifest-pending",
      buildDate: "Remote optional pack",
      licenseNote: "Activation requires manifest validation before offline use.",
      status: "optional",
      testID: "packs-optional-endgame"
    },
    {
      id: "mate-in-n",
      title: "Mate in N Pack",
      subtitle: "~30k puzzles · optional",
      detail: "Rating 700 - 2300 · mate themes · Arrow Duel candidates",
      coverage: {
        puzzles: "~30k",
        rating: "700-2300",
        themes: "Mate",
        arrowDuel: "Ready"
      },
      source: "Lichess puzzle database",
      presolveStatus: "Manifest pending validation",
      manifestHash: "mate-n-manifest-pending",
      buildDate: "Remote optional pack",
      licenseNote: "Activation requires manifest validation before offline use.",
      status: "optional",
      testID: "packs-optional-mate-in-n"
    }
  ];
  function beginPackImport(packTitle: string): void {
    setImportProgress({
      packTitle,
      progress: 72,
      status: "validating"
    });
    setStatusMessage(`Validating ${packTitle} manifest`);
  }

  return (
    <View style={styles.packsPanel} testID="packs-panel">
      <View style={styles.sectionHeaderRow} testID="packs-action-header">
        <View style={styles.panelHeaderSpacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Import puzzle pack"
          testID="packs-import"
          style={styles.packsIconButton}
          onPress={() => beginPackImport("Imported Pack")}
        >
          <Text style={styles.iconButtonText}>＋</Text>
        </Pressable>
      </View>

      {importProgress ? (
        <PackImportProgressCard progress={importProgress} />
      ) : null}

      <PackSection title="Installed" testID="packs-installed-section">
        {installedPacks.map((pack) => (
          <PackRow
            key={pack.id}
            pack={pack}
            onOpenDetail={() => setSelectedPack(pack)}
            onRemove={pack.id === "core" ? undefined : () => setRemovalPack(pack)}
          />
        ))}
      </PackSection>

      <PackSection title="Optional Packs" testID="packs-optional-section">
        {optionalPacks.map((pack) => (
          <PackRow
            key={pack.id}
            pack={pack}
            onOpenDetail={() => setSelectedPack(pack)}
            onImport={() => beginPackImport(pack.title)}
          />
        ))}
      </PackSection>

      {selectedPack ? (
        <PackDetailPanel pack={selectedPack} onClose={() => setSelectedPack(null)} />
      ) : null}

      <View style={styles.packInfoCard} testID="packs-info-section">
        <Text style={styles.sectionLabel}>Pack Info</Text>
        <PackInfoRow label="Source" value="Lichess puzzle database" testID="packs-source" />
        <PackInfoRow label="Processing" value="Pre-solved for Chessticize" testID="packs-processing" />
        <PackInfoRow label="Manifest" value="Validated before activation" testID="packs-manifest" />
        <PackInfoRow label="Build date" value="Bundled fixture" testID="packs-build-date" />
        <Text testID="packs-license-notes" style={styles.packLicenseText}>
          License notes: Puzzle data is derived from the Lichess puzzle database and bundled for offline use with Chessticize presolve metadata.
        </Text>
      </View>

      {removalPack ? (
        <DestructiveConfirmationCard
          confirmLabel="Remove Pack"
          description={`${removalPack.title} will be disabled from offline selection. Attempt history and review schedules stay intact.`}
          testID="packs-remove-confirmation"
          title={`Remove ${removalPack.title}?`}
          onCancel={() => setRemovalPack(null)}
          onConfirm={() => {
            setRemovalPack(null);
            setStatusMessage(`${removalPack.title} removal queued; history retained`);
          }}
        />
      ) : null}

      {statusMessage ? (
        <Text style={styles.settingsStatusText} testID="packs-status-message">{statusMessage}</Text>
      ) : null}
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

function PackImportProgressCard({
  progress
}: {
  progress: PackImportProgress;
}): React.JSX.Element {
  return (
    <View style={styles.packImportProgressCard} testID="packs-import-progress">
      <View style={styles.packImportHeader}>
        <View>
          <Text style={styles.sectionLabel}>{progress.packTitle}</Text>
          <Text style={styles.helperText}>Manifest validation in progress</Text>
        </View>
        <Text style={styles.packImportPercent} testID="packs-import-progress-value">{progress.progress}%</Text>
      </View>
      <View style={styles.packProgressTrack}>
        <View style={[styles.packProgressFill, { width: `${progress.progress}%` }]} />
      </View>
      <View style={styles.packImportStepList}>
        <PackImportStep done label="Read manifest" testID="packs-import-step-manifest" />
        <PackImportStep done label="Validate source and license" testID="packs-import-step-license" />
        <PackImportStep done={progress.status === "ready"} label="Activate after validation" testID="packs-import-step-activate" />
      </View>
    </View>
  );
}

function PackImportStep({
  done,
  label,
  testID
}: {
  done: boolean;
  label: string;
  testID: string;
}): React.JSX.Element {
  return (
    <View style={styles.packImportStep} testID={testID}>
      <Text style={[styles.packImportStepMark, done ? styles.packImportStepDone : null]}>{done ? "✓" : "…"}</Text>
      <Text style={styles.helperText}>{label}</Text>
    </View>
  );
}

function PackRow({
  onImport,
  onOpenDetail,
  onRemove,
  pack
}: {
  onImport?: () => void;
  onOpenDetail: () => void;
  onRemove?: () => void;
  pack: PackRowModel;
}): React.JSX.Element {
  const isOptional = pack.status === "optional";
  return (
    <View style={styles.packRow} testID={pack.testID}>
      <View style={styles.packRowCopy}>
        <View style={styles.packTitleRow}>
          <Text style={styles.historyRowTitle}>{pack.title}</Text>
          <Text style={[
            styles.packStatusBadge,
            pack.status === "active" ? styles.packStatusActive : null,
            pack.status === "installed" ? styles.packStatusInstalled : null
          ]}>
            {pack.status === "active" ? "Active" : pack.status === "installed" ? "Installed" : "Optional"}
          </Text>
        </View>
        <Text style={styles.helperText}>{pack.subtitle}</Text>
        <Text style={styles.helperText}>{pack.detail}</Text>
      </View>
      <View style={styles.packActionColumn}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${pack.title} details`}
          testID={`packs-detail-${pack.id}`}
          style={styles.packDetailButton}
          onPress={onOpenDetail}
        >
          <Text style={styles.packDetailText}>Details</Text>
        </Pressable>
      {isOptional ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Import ${pack.title}`}
          testID={`packs-import-${pack.id}`}
          style={styles.packActionButton}
          onPress={onImport}
        >
          <Text style={styles.packActionText}>Import</Text>
        </Pressable>
      ) : onRemove ? (
        <View testID={`packs-remove-${pack.id}`}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${pack.title}`}
            testID="packs-remove"
            style={styles.packActionButton}
            onPress={onRemove}
          >
            <Text style={styles.packActionText}>Remove</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.packActiveMark}>✓</Text>
      )}
      </View>
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
          <Text style={styles.iconButtonText}>×</Text>
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
  label,
  testID,
  value
}: {
  label: string;
  testID: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.packInfoRow} testID={testID}>
      <Text style={styles.helperText}>{label}</Text>
      <Text style={styles.listText}>{value}</Text>
    </View>
  );
}

function StockfishDiagnosticsPanel({
  stockfishTransportFactory
}: {
  stockfishTransportFactory: () => UciEngineTransport | null;
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
    const transport = stockfishTransportFactory();
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

    const usePrewarmedNativeEngine = stockfishTransportFactory === createNativeStockfishTransport;
    const prewarm = usePrewarmedNativeEngine ? prewarmNativeStockfishTransport() : Promise.resolve(false);
    void prewarm.then((prewarmed) => analyzeFenWithUciEngine(tracedTransport, selectedPosition.fen, {
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
  }, [runId, selectedPosition, stockfishTransportFactory]);

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

function ModeButton({
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
      accessibilityLabel={`${label} mode`}
      testID={testID}
      style={[styles.modeButton, active ? styles.modeButtonActive : null]}
      onPress={onPress}
    >
      <Text style={[styles.modeButtonText, active ? styles.modeButtonTextActive : null]}>{label}</Text>
    </Pressable>
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

function TabButton({
  active,
  icon,
  label,
  testID,
  onPress
}: {
  active: boolean;
  icon: string;
  label: string;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} tab`}
      testID={testID}
      style={[styles.tabButton, active ? styles.tabButtonActive : null]}
      onPress={onPress}
    >
      <View style={[styles.tabIconBadge, active ? styles.tabIconBadgeActive : null]} testID={`${testID}-icon`}>
        <Text style={[styles.tabIconText, active ? styles.tabTextActive : null]}>{icon}</Text>
      </View>
      <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{label}</Text>
    </Pressable>
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

function formatRating(state: SprintState | null, currentRating: number): string {
  if (!state) {
    return String(currentRating);
  }
  return String(state.ratingAfter ?? state.ratingBefore);
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
  return "Max";
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
    return "Performance and solved puzzles";
  }
  if (tab === "packs") {
    return "Offline puzzle sources";
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
  useCustomTiming = mode === "custom"
): SprintConfig {
  if (!useCustomTiming) {
    return defaultSprintConfig(mode);
  }
  return buildSprintConfig({
    mode,
    durationSeconds: customDurationSeconds,
    perPuzzleSeconds: customPerPuzzleSeconds
  });
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

function fenAfterMove(fen: string, move: string): string | null {
  try {
    const chess = new Chess(fen);
    const normalized = move.trim().toLowerCase();
    const played = chess.move({
      from: normalized.slice(0, 2),
      to: normalized.slice(2, 4),
      ...(normalized.length > 4 ? { promotion: normalized.slice(4, 5) } : {})
    });
    return played ? chess.fen() : null;
  } catch {
    return null;
  }
}

function fenAfterMoves(fen: string, moves: string[]): string | null {
  let currentFen: string | null = fen;
  for (const move of moves) {
    if (!currentFen) {
      return null;
    }
    currentFen = fenAfterMove(currentFen, move);
  }
  return currentFen;
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

function canonicalFen(fen: string): string {
  return fen.trim().split(/\s+/).join(" ");
}

function shouldFlipBoard(currentPuzzle: CurrentPuzzleState): boolean {
  return sideToMove(currentPuzzle.currentFen) === "b";
}

function sideToMove(fen: string): "w" | "b" {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

function isPracticeDebugEnabled(): boolean {
  const globals = globalThis as unknown as {
    __CHESSTICIZE_PRACTICE_DEBUG__?: boolean;
    process?: { env?: { NODE_ENV?: string } };
  };
  if (globals.__CHESSTICIZE_PRACTICE_DEBUG__) {
    return true;
  }
  return globals.process?.env?.NODE_ENV === "test" && Boolean(globals.__CHESSTICIZE_PRACTICE_DEBUG__);
}

function isPracticeTestControlsEnabled(): boolean {
  const globals = globalThis as unknown as {
    __DEV__?: boolean;
    process?: { env?: { NODE_ENV?: string } };
  };
  return Boolean(globals.__DEV__ || globals.process?.env?.NODE_ENV === "test");
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

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#F8FAFC",
    flex: 1
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
  subtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 2
  },
  rating: {
    color: "#111827",
    fontSize: 18,
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
  tabButton: {
    alignItems: "center",
    flex: 1,
    gap: 2,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 2
  },
  tabButtonActive: {
    backgroundColor: "transparent"
  },
  tabIconBadge: {
    alignItems: "center",
    borderRadius: 999,
    height: 20,
    justifyContent: "center",
    minWidth: 24,
    paddingHorizontal: 5
  },
  tabIconBadgeActive: {
    backgroundColor: "#DBEAFE"
  },
  tabIconText: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 14
  },
  tabText: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700"
  },
  tabTextActive: {
    color: "#2563EB"
  },
  content: {
    gap: 12,
    padding: UI_PADDING,
    paddingBottom: 40
  },
  contentWithBottomTabs: {
    paddingBottom: 96
  },
  practiceHome: {
    gap: 12
  },
  sectionHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sectionLabel: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "800"
  },
  sectionMeta: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700"
  },
  modeList: {
    gap: 8
  },
  practiceModeCard: {
    alignItems: "stretch",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 62,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  practiceModeCardActive: {
    borderColor: "#D7DEE8",
    backgroundColor: "#FFFFFF"
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
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 34
  },
  practiceModeIconText: {
    color: "#2563EB",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20
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
  practiceModeDetailChip: {
    backgroundColor: "transparent",
    color: "#475569",
    fontSize: 9,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 0,
    paddingVertical: 1
  },
  practiceModeMeta: {
    alignItems: "flex-end",
    gap: 4,
    justifyContent: "center",
    minWidth: 72
  },
  practiceModeRating: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800"
  },
  practiceModeChevronButton: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 28
  },
  practiceModeChevron: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 22
  },
  practiceProgressCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 74,
    padding: 12
  },
  progressMetric: {
    flex: 1,
    gap: 2
  },
  progressDivider: {
    backgroundColor: "#E2E8F0",
    height: 44,
    marginHorizontal: 12,
    width: 1
  },
  progressValue: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 26
  },
  progressDelta: {
    color: "#16A34A",
    fontSize: 12,
    fontWeight: "800"
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
  reviewStripCounts: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 12
  },
  reviewStripMetric: {
    alignItems: "flex-end",
    gap: 2
  },
  reviewDueCount: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "800"
  },
  reviewOverdueCount: {
    color: "#DC2626",
    fontSize: 17,
    fontWeight: "800"
  },
  reviewStripMetricLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800"
  },
  reviewQueuePanel: {
    gap: 12
  },
  reviewQueueHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44
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
  reviewFilterButtonText: {
    color: "#334155",
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 20
  },
  reviewFilterButtonTextActive: {
    color: "#1D4ED8"
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
  reviewDueTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "800"
  },
  reviewDueBigCount: {
    color: "#2563EB",
    fontSize: 22,
    fontWeight: "800"
  },
  reviewDueMetrics: {
    alignItems: "flex-end",
    minWidth: 72
  },
  reviewFilterScroller: {
    marginHorizontal: -UI_PADDING
  },
  reviewFilterContent: {
    gap: 8,
    paddingHorizontal: UI_PADDING
  },
  reviewDifficultyList: {
    gap: 8
  },
  reviewDifficultyRow: {
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
  reviewDifficultyRowActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD"
  },
  reviewDifficultyMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  reviewDifficultyCount: {
    fontSize: 16,
    fontWeight: "800"
  },
  reviewDifficultyEasy: {
    color: "#16A34A"
  },
  reviewDifficultyMedium: {
    color: "#D97706"
  },
  reviewDifficultyHard: {
    color: "#DC2626"
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
  reviewItemDifficulty: {
    fontSize: 12,
    fontWeight: "800"
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
  sessionBar: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    gap: 10
  },
  activeSessionShell: {
    gap: 10
  },
  sessionNavRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44
  },
  sessionNavButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40
  },
  sessionNavButtonText: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "500",
    lineHeight: 28
  },
  sessionNavTitle: {
    color: "#111827",
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center"
  },
  sessionOverflowText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
    lineHeight: 20
  },
  sessionActiveMetricRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sessionActiveMetric: {
    flex: 1,
    gap: 2
  },
  sessionActiveMetricRight: {
    alignItems: "flex-end"
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
    flex: 1,
    gap: 2
  },
  sessionProgressValue: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800"
  },
  sessionRatingValue: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  sessionMistakeRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 36
  },
  sessionHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  sessionTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "700"
  },
  sessionMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  sessionMetric: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700"
  },
  ratingPill: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: "center"
  },
  sessionMetricRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  timerText: {
    color: "#111827",
    fontFamily: "menlo",
    fontSize: 20,
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
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 72,
    padding: 12
  },
  promptIcon: {
    backgroundColor: "#1F2937",
    borderRadius: 999,
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    height: 28,
    lineHeight: 28,
    textAlign: "center",
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
  arrowDuelCandidateRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center"
  },
  arrowDuelCandidateChip: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#2563EB",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    minHeight: 48,
    justifyContent: "center"
  },
  arrowDuelCandidateLabel: {
    color: "#2563EB",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20
  },
  arrowDuelCandidateMeta: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700"
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
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    height: 20,
    lineHeight: 20,
    overflow: "hidden",
    textAlign: "center",
    width: 20,
    borderRadius: 999,
  },
  sessionScoreDotPositive: {
    backgroundColor: "#16A34A"
  },
  sessionScoreDotNegative: {
    backgroundColor: "#DC2626"
  },
  sessionScoreDotNeutral: {
    backgroundColor: "#CBD5E1"
  },
  sessionScoreValue: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20
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
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  modeButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "22%",
    flexGrow: 1,
    height: 42,
    justifyContent: "center"
  },
  modeButtonActive: {
    borderColor: "#2563EB"
  },
  modeButtonText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700"
  },
  modeButtonTextActive: {
    color: "#2563EB"
  },
  customPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  customSetupPanel: {
    gap: 12
  },
  customScreenHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  customScreenTitle: {
    color: "#111827",
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center"
  },
  customHeaderStartButton: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 8,
    height: 40,
    justifyContent: "center",
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
  customModeChoiceRow: {
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  customChoiceHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  customChoiceCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  customModeChoices: {
    flexDirection: "row",
    gap: 8
  },
  customModeChoice: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  customModeChoiceActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB"
  },
  customModeChoiceTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900"
  },
  customModeChoiceTitleActive: {
    color: "#1D4ED8"
  },
  customModeChoiceDetail: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700"
  },
  customModeChoiceDetailActive: {
    color: "#2563EB"
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
  customStepperText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 18
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
  previousConfigList: {
    gap: 8
  },
  previousConfigRow: {
    alignItems: "flex-start",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  previousConfigCopy: {
    flex: 1,
    gap: 6,
    minWidth: 0
  },
  previousConfigHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  previousConfigRatingKey: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800"
  },
  previousConfigMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5
  },
  previousConfigRating: {
    alignItems: "flex-end",
    gap: 2,
    minWidth: 48
  },
  testPanel: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  customHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  customTarget: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800"
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
  configSummary: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 10
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
  ghostButton: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  ghostText: {
    color: "#1E40AF",
    fontSize: 12,
    fontWeight: "700"
  },
  summaryPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12
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
  resultIconText: {
    color: "#2563EB",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 26
  },
  resultIconTextFailed: {
    color: "#DC2626"
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
  strikeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  strikeMark: {
    backgroundColor: "#FFFFFF",
    borderColor: "#94A3B8",
    borderRadius: 3,
    borderWidth: 1,
    height: 14,
    width: 14
  },
  strikeMarkUsed: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626"
  },
  strikeCount: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900"
  },
  strikeLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 2
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
  panelHeaderSpacer: {
    flex: 1
  },
  reviewSessionPanel: {
    gap: 12
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
  reviewArrowLegendPill: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 30,
    paddingHorizontal: 10
  },
  reviewLegendSwatchGreen: {
    backgroundColor: "#16A34A",
    borderRadius: 999,
    height: 8,
    width: 8
  },
  reviewLegendSwatchRed: {
    backgroundColor: "#DC2626",
    borderRadius: 999,
    height: 8,
    width: 8
  },
  reviewBoardLayout: {
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
  analysisIconButtonText: {
    color: "#0F172A",
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 24
  },
  analysisTitle: {
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
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  filterPill: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 6
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
  filterButtonText: {
    color: "#2563EB",
    fontSize: 12,
    fontWeight: "800"
  },
  filterButtonTextActive: {
    color: "#FFFFFF"
  },
  performancePanel: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    gap: 4
  },
  historyPanel: {
    gap: 10
  },
  historyTopFilterStack: {
    gap: 8
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
  historyChipContent: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 2
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
    backgroundColor: "#FEE2E2"
  },
  historyResultCorrect: {
    backgroundColor: "#DCFCE7"
  },
  historyResultBadgeText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 18
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
  historyAttemptStatus: {
    alignItems: "flex-end",
    gap: 4,
    justifyContent: "center",
    minWidth: 78
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
  historyRow: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 10
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
  settingsSection: {
    gap: 8
  },
  settingsSectionCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden"
  },
  syncRowMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end"
  },
  syncStatusText: {
    fontSize: 12,
    fontWeight: "900"
  },
  syncApprovalRow: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 9
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
    gap: 2
  },
  settingsRowMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  settingsRowValue: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "800"
  },
  settingsDestructiveText: {
    color: "#DC2626"
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
  settingsStatusText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 2
  },
  destructiveConfirmationCard: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  confirmationActionRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end"
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
  packImportProgressCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#BFDBFE",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  packImportHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  packImportPercent: {
    color: "#2563EB",
    fontFamily: "Menlo",
    fontSize: 18,
    fontWeight: "900"
  },
  packProgressTrack: {
    backgroundColor: "#E2E8F0",
    borderRadius: 999,
    height: 8,
    overflow: "hidden"
  },
  packProgressFill: {
    backgroundColor: "#2563EB",
    borderRadius: 999,
    height: 8
  },
  packImportStepList: {
    gap: 6
  },
  packImportStep: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  packImportStepMark: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "900",
    width: 16
  },
  packImportStepDone: {
    color: "#16A34A"
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
  packStatusBadge: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 999,
    borderWidth: 1,
    color: "#64748B",
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  packStatusActive: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
    color: "#15803D"
  },
  packStatusInstalled: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    color: "#1D4ED8"
  },
  packActiveMark: {
    color: "#16A34A",
    fontSize: 22,
    fontWeight: "900"
  },
  packActionColumn: {
    alignItems: "flex-end",
    gap: 8,
    justifyContent: "center"
  },
  packActionButton: {
    alignItems: "center",
    borderColor: "#93C5FD",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  packActionText: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "900"
  },
  packDetailButton: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  packDetailText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900"
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
  settingRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  switchButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    minWidth: 56
  },
  switchButtonActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB"
  },
  switchText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  switchTextActive: {
    color: "#FFFFFF"
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
