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
  buildArrowDuelCandidateAnalysisLines,
  buildPuzzleGuidedAnalysisLines,
  buildSprintConfig,
  currentExpectedMove,
  defaultSprintConfig,
  submitArrowDuelChoice,
  submitLineMove
} from "../../../../packages/core/src/index.ts";
import type {
  AttemptEvent,
  ArrowDuelState,
  CurrentPuzzleState,
  EngineAnalysisLine,
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
import { createNativeStockfishTransport } from "../backend/nativeStockfishTransport.ts";
import { Chess, type PieceSymbol, type Square } from "chess.js";

interface Props {
  practiceService?: PracticeService;
  debugTrace?: (event: PracticeDebugTraceEvent) => void;
  stockfishTransportFactory?: () => UciEngineTransport | null;
}

type Tab = "practice" | "review" | "history" | "settings" | "packs";

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
const CHESS_PIECE_SPRITE = require("../assets/chess-pieces-sprite.png") as ImageSourcePropType;

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
  const [boardFen, setBoardFen] = useState<string | null>(null);
  const [lastBoardMove, setLastBoardMove] = useState<BoardMove | null>(null);
  const [feedbackPuzzleId, setFeedbackPuzzleId] = useState<string | null>(null);
  const [feedbackSnapshot, setFeedbackSnapshot] = useState<FeedbackBoardSnapshot | null>(null);
  const [boardInputLocked, setBoardInputLocked] = useState(false);
  const [chessboardDebugEvents, setChessboardDebugEvents] = useState<string[]>([]);
  const [historyWrongLast7Days, setHistoryWrongLast7Days] = useState(false);
  const [customDurationSeconds, setCustomDurationSeconds] = useState(5 * 60);
  const [customPerPuzzleSeconds, setCustomPerPuzzleSeconds] = useState(20);

  const boardSize = useMemo(() => {
    const available = Math.max(width - UI_PADDING * 2, MIN_BOARD);
    return Math.max(MIN_BOARD, Math.min(available, 560));
  }, [width]);

  const isActive = state?.status === "active";
  const isFinished = state !== null && state.status !== "active";
  const isShowingFeedbackSnapshot = feedbackSnapshot !== null;
  const shouldShowSessionBoard = isActive || isShowingFeedbackSnapshot;
  const selectedConfig = useMemo(
    () => sprintConfigFor(mode, customDurationSeconds, customPerPuzzleSeconds),
    [customDurationSeconds, customPerPuzzleSeconds, mode]
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

  function startSprint(nextMode: SprintMode = mode): void {
    setError(null);
    try {
      const config = sprintConfigFor(nextMode, customDurationSeconds, customPerPuzzleSeconds);
      const started = service.startSprint({
        mode: nextMode,
        durationSeconds: config.durationSeconds,
        perPuzzleSeconds: config.perPuzzleSeconds,
        ...(shouldRandomizePuzzleSelection(puzzleSource) ? { puzzleSelectionSeed: `${Date.now()}-${Math.random()}` } : {})
      });
      setMode(nextMode);
      commitState(started);
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
    setFeedback(null);
    setFeedbackPuzzleId(null);
    clearFeedbackSnapshot();
    setError(null);
    commitBoardInputLocked(false, "reset", null);
    commitBoardFen(null);
    setLastBoardMove(null);
    refreshState();
  }

  function showReviewMistakes(): void {
    const sessionId = stateRef.current?.id;
    const reviewItems = sessionId ? service.getSessionMistakeReview(sessionId) : [];
    resetToIdle();
    setSessionMistakeReviewItems(reviewItems);
    setTab("review");
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
  const displayedAttempts = historyWrongLast7Days
    ? attempts.filter((attempt) => {
      const completedAt = new Date(attempt.completedAt).getTime();
      const sevenDaysAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
      return attempt.result === "wrong" && completedAt >= sevenDaysAgo;
    })
    : attempts;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Puzzle Sprint</Text>
          <Text style={styles.subtitle}>Offline fixture · {seededPuzzleCount(puzzleSource)} puzzles</Text>
        </View>
        <Text testID="rating-label" style={styles.rating}>{`ELO ${formatRating(state, currentRating)}`}</Text>
      </View>

      {!isActive && !isShowingFeedbackSnapshot ? (
        <View style={styles.tabs}>
          <TabButton active={tab === "practice"} label="Practice" testID="practice-tab" onPress={() => setTab("practice")} />
          <TabButton active={tab === "review"} label="Review" testID="review-tab" onPress={() => setTab("review")} />
          <TabButton active={tab === "history"} label="History" testID="history-tab" onPress={() => setTab("history")} />
          <TabButton active={tab === "settings"} label="Settings" testID="settings-tab" onPress={() => setTab("settings")} />
          <TabButton active={tab === "packs"} label="Packs" testID="packs-tab" onPress={() => setTab("packs")} />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        {tab === "practice" ? (
          <>
            {!isFinished ? (
              <SessionStatusBar
                mode={mode}
                state={state}
                config={selectedConfig}
                timerText={timerText}
                currentRating={currentRating}
                onAbandon={isActive ? abandonSprint : undefined}
              />
            ) : null}

            {!isActive && state === null ? (
              <ModeRow
                mode={mode}
                onChange={setMode}
                disabled={false}
              />
            ) : null}

            {!isActive && state === null && isPracticeTestControlsEnabled() && !practiceService ? (
              <TestPuzzleSourceControl
                source={puzzleSource}
                onChange={changePuzzleSource}
              />
            ) : null}

            {!isActive && state === null && mode === "custom" ? (
              <CustomSprintSetup
                durationSeconds={customDurationSeconds}
                perPuzzleSeconds={customPerPuzzleSeconds}
                targetCorrect={selectedConfig.targetCorrect}
                ratingKey={selectedConfig.ratingKey}
                onDurationChange={setCustomDurationSeconds}
                onPerPuzzleChange={setCustomPerPuzzleSeconds}
              />
            ) : null}

            {shouldShowSessionBoard ? (
              <PracticePrompt currentPuzzle={displayedPuzzle} mode={mode} />
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

            {error ? <ErrorPanel error={error} /> : null}

            {isFinished && !isShowingFeedbackSnapshot ? (
              <SprintSummary
                state={state}
                elapsedMs={Math.min(sprintElapsedMs, state ? state.config.durationSeconds * 1000 : sprintElapsedMs)}
                onReplay={() => startSprint(mode)}
                onBack={resetToIdle}
                onReview={state.mistakeCount > 0 ? showReviewMistakes : undefined}
              />
            ) : null}

            {state?.status === "active" || isShowingFeedbackSnapshot ? null : (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Start sprint"
                  testID="start-sprint-button"
                  style={styles.primaryButton}
                  onPress={() => startSprint()}
                >
                  <Text style={styles.primaryButtonText}>Start new sprint</Text>
                </Pressable>
              </>
            )}
          </>
        ) : null}

        {tab === "history" ? (
          <HistoryPanel
            attempts={displayedAttempts}
            wrongLast7Days={historyWrongLast7Days}
            onToggleWrongLast7Days={() => setHistoryWrongLast7Days((current) => !current)}
          />
        ) : null}
        {tab === "review" ? (
          <ReviewPanel
            boardSize={boardSize}
            dueReviewItems={dueReviewItems}
            reviews={reviews}
            service={service}
            sessionMistakeReviewItems={sessionMistakeReviewItems}
            onExitSessionReview={() => setTab("practice")}
            stockfishTransportFactory={stockfishTransportFactory}
          />
        ) : null}
        {tab === "settings" ? <SettingsPanel onResetRating={() => service.resetRating(selectedConfig.ratingKey)} /> : null}
        {tab === "packs" ? <PacksPanel /> : null}
      </ScrollView>
    </SafeAreaView>
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
  durationSeconds,
  perPuzzleSeconds,
  targetCorrect,
  ratingKey,
  onDurationChange,
  onPerPuzzleChange
}: {
  durationSeconds: number;
  perPuzzleSeconds: number;
  targetCorrect: number;
  ratingKey: string;
  onDurationChange: (next: number) => void;
  onPerPuzzleChange: (next: number) => void;
}): React.JSX.Element {
  return (
    <View style={styles.customPanel} testID="custom-sprint-setup">
      <View style={styles.customHeader}>
        <Text style={styles.panelTitle}>Custom sprint</Text>
        <Text testID="custom-target-count" style={styles.customTarget}>
          Target {targetCorrect}
        </Text>
      </View>
      <Text style={styles.helperText}>Time control</Text>
      <View style={styles.optionRow}>
        {CUSTOM_DURATION_OPTIONS.map((option) => (
          <OptionButton
            key={option}
            active={durationSeconds === option}
            label={formatDurationLabel(option)}
            testID={`custom-duration-${option}`}
            onPress={() => onDurationChange(option)}
          />
        ))}
      </View>
      <Text style={styles.helperText}>Target pace</Text>
      <View style={styles.optionRow}>
        {CUSTOM_PER_PUZZLE_OPTIONS.map((option) => (
          <OptionButton
            key={option}
            active={perPuzzleSeconds === option}
            label={`${option}s`}
            testID={`custom-per-puzzle-${option}`}
            onPress={() => onPerPuzzleChange(option)}
          />
        ))}
      </View>
      <View style={styles.configSummary}>
        <Text style={styles.listText}>Miss 3 and the sprint fails</Text>
        <Text style={styles.helperText}>{ratingKey}</Text>
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
    <View style={styles.sessionBar}>
      <View style={styles.sessionHeaderRow}>
        <View>
          <Text style={styles.sessionTitle}>{modeLabel(mode)}</Text>
          <Text testID="session-progress" style={styles.sessionMetric}>
            {state.correctCount} / {state.config.targetCorrect}
          </Text>
        </View>
        <Text testID="session-timer" style={styles.timerText}>{timerText}</Text>
      </View>
      <View style={styles.sessionMetricRow}>
        <MistakeStrikes count={state.mistakeCount} max={state.config.maxMistakes} />
        {onAbandon ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abandon sprint"
            testID="session-abandon"
            style={styles.ghostButton}
            onPress={onAbandon}
          >
            <Text style={styles.ghostText}>Abandon</Text>
          </Pressable>
        ) : null}
      </View>
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
      <Text style={styles.strikeLabel}>Mistakes</Text>
    </View>
  );
}

function SprintSummary({
  state,
  elapsedMs,
  onReplay,
  onBack,
  onReview
}: {
  state: SprintState;
  elapsedMs: number;
  onReplay: () => void;
  onBack: () => void;
  onReview?: () => void;
}): React.JSX.Element {
  const delta = (state.ratingAfter ?? state.ratingBefore) - state.ratingBefore;
  const reason = formatEndReason(state.endReason);

  return (
    <View style={styles.summaryPanel} testID="sprint-summary-panel">
      <Text style={styles.summaryTitle}>{state.status === "won" ? "Sprint complete" : "Sprint failed"}</Text>
      <Text style={styles.summaryText}>Result: {reason}</Text>
      <Text style={styles.summaryText}>Solved: {state.correctCount} / {state.config.targetCorrect}</Text>
      <Text style={styles.summaryText}>Mistakes: {state.mistakeCount} / {state.config.maxMistakes}</Text>
      <Text style={styles.summaryText}>Accuracy: {Math.round((state.correctCount / Math.max(1, state.correctCount + state.mistakeCount)) * 100)}%</Text>
      <Text style={styles.summaryText}>
        Time: {formatDuration(Math.floor(elapsedMs / 1000))}
      </Text>
      <Text style={[styles.summaryText, delta >= 0 ? styles.positive : styles.errorText]}>
        ELO {delta >= 0 ? "+" : ""}
        {delta} → {state.ratingAfter ?? state.ratingBefore}
      </Text>

      <View style={styles.summaryRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Play again"
          testID="play-again-button"
          style={styles.primaryButton}
          onPress={onReplay}
        >
          <Text style={styles.primaryButtonText}>Play again</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to practice"
          testID="back-practice-button"
          style={styles.secondaryButton}
          onPress={onBack}
        >
          <Text style={styles.secondaryButtonText}>Back</Text>
        </Pressable>
      </View>
      {onReview ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Review missed puzzles"
          testID="review-mistakes-button"
          style={styles.secondaryButton}
          onPress={onReview}
        >
          <Text style={styles.secondaryButtonText}>Review missed puzzles</Text>
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
  const displayedPromptText = promptText ?? (
    isArrowDuel
      ? `Choose the better move for ${side} between the two arrows.`
      : `Find the best move for ${side}.`
  );
  const displayedPromptHint = promptHint === undefined
    ? (isArrowDuel ? "Watch for checks, captures, and attacks!" : null)
    : promptHint;

  return (
    <View style={styles.promptPanel} testID="practice-prompt">
      <Text style={styles.promptIcon}>{mode === "arrow_duel" ? "⇄" : "♛"}</Text>
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
  wrongLast7Days,
  onToggleWrongLast7Days
}: {
  attempts: AttemptEvent[];
  wrongLast7Days: boolean;
  onToggleWrongLast7Days: () => void;
}): React.JSX.Element {
  const correct = attempts.filter((attempt) => attempt.result === "correct").length;
  const wrong = attempts.filter((attempt) => attempt.result === "wrong").length;
  const accuracy = Math.round((correct / Math.max(1, correct + wrong)) * 100);

  return (
    <View style={styles.listPanel} testID="history-panel">
      <Text style={styles.panelTitle}>History</Text>
      <View style={styles.performancePanel}>
        <Text style={styles.summaryText}>Performance</Text>
        <Text style={styles.listText}>Accuracy {accuracy}% · Correct {correct} · Wrong {wrong}</Text>
      </View>
      <View style={styles.filterRow}>
        <Text style={styles.filterPill}>7 days</Text>
        <Text style={styles.filterPill}>30 days</Text>
        <Text style={styles.filterPill}>1 year</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Wrong in the last 7 days"
          testID="history-filter-wrong-7-days"
          style={[styles.filterButton, wrongLast7Days ? styles.filterButtonActive : null]}
          onPress={onToggleWrongLast7Days}
        >
          <Text style={[styles.filterButtonText, wrongLast7Days ? styles.filterButtonTextActive : null]}>Wrong 7d</Text>
        </Pressable>
      </View>
      {attempts.length === 0 ? <Text style={styles.listText}>No attempts</Text> : null}
      {attempts.map((attempt) => (
        <Text key={attempt.id} style={styles.listText}>
          {modeLabel(attempt.mode)} · {attempt.result} · {attempt.submittedMove}
        </Text>
      ))}
    </View>
  );
}

type ReviewEntry = {
  puzzle: Puzzle;
  mode: SprintMode;
  source: "session" | "due";
  attempt?: AttemptEvent;
};

type ReviewPuzzleState =
  | { kind: "line"; line: PuzzleLineState }
  | { kind: "arrow_duel"; duel: ArrowDuelState };

function ReviewPanel({
  boardSize,
  dueReviewItems,
  onExitSessionReview,
  reviews,
  service,
  sessionMistakeReviewItems,
  stockfishTransportFactory
}: {
  boardSize: number;
  dueReviewItems: ReviewQueueItem[];
  onExitSessionReview: () => void;
  reviews: Record<string, unknown>[];
  service: PracticeService;
  sessionMistakeReviewItems: SessionMistakeReviewItem[];
  stockfishTransportFactory: () => UciEngineTransport | null;
}): React.JSX.Element {
  const sessionEntries = sessionMistakeReviewItems.map((item): ReviewEntry => ({
    puzzle: item.puzzle,
    mode: item.attempt.mode,
    source: "session",
    attempt: item.attempt
  }));
  const dueEntries = dueReviewItems.map((item): ReviewEntry => ({
    puzzle: item.puzzle,
    mode: "standard",
    source: "due"
  }));
  const preferredEntries = sessionEntries.length > 0 ? sessionEntries : dueEntries;
  const preferredEntriesKey = preferredEntries.map((entry) => `${entry.source}:${entry.puzzle.id}:${entry.mode}`).join("|");
  const [activeEntries, setActiveEntries] = useState<ReviewEntry[]>(preferredEntries);

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
    <View style={styles.listPanel} testID="review-panel">
      <Text style={styles.panelTitle}>Review</Text>
      {sessionEntries.length === 0 ? <Text style={styles.listText}>No last sprint mistakes</Text> : null}
      {dueEntries.length === 0 ? <Text style={styles.listText}>No reviews due today</Text> : null}
      {reviews.map((review) => {
        const row = review as { puzzleId: string; dueAt: string; lastResult: string };
        return (
          <Text key={`${row.puzzleId}-${row.dueAt}`} style={styles.listText}>
            {row.lastResult} · due {row.dueAt.slice(0, 10)}
          </Text>
        );
      })}
    </View>
  );
}

function ReviewSession({
  boardSize,
  entries,
  service,
  onExit,
  stockfishTransportFactory
}: {
  boardSize: number;
  entries: ReviewEntry[];
  service: PracticeService;
  onExit: (source: ReviewEntry["source"]) => void;
  stockfishTransportFactory: () => UciEngineTransport | null;
}): React.JSX.Element {
  const boardRef = useRef<ChessboardRef | null>(null);
  const reviewSuppressedBoardMovesRef = useRef<string[]>([]);
  const reviewResultRecordedRef = useRef(false);
  const [entryIndex, setEntryIndex] = useState(0);
  const [reviewState, setReviewState] = useState<ReviewPuzzleState>(() => startReviewPuzzle(entries[0]));
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
  const currentEntry = entries[entryIndex];
  const currentPuzzle = currentReviewPuzzleState(reviewState);
  const currentFen = currentPuzzle.currentFen;
  const displayFen = analysisEnabled ? (analysisFen ?? currentFen) : currentFen;
  const baseBoardFlipped = reviewStartingPerspectiveFlipped(currentEntry);
  const boardFlipped = manualBoardFlip ? !baseBoardFlipped : baseBoardFlipped;
  const feedbackMove = feedback?.submittedMove && feedback.submittedMove !== "__illegal__" ? arrowFromTo(feedback.submittedMove) : null;
  const analysisLines = analysisEnabled
    ? buildPuzzleGuidedAnalysisLines({
        fen: displayFen,
        puzzle: currentEntry.puzzle,
        currentPuzzle,
        engineLines: engineAnalysisLines
      })
    : [];
  const guidedEvalLines =
    !analysisEnabled && currentEntry.mode === "arrow_duel" && reviewState.kind === "line"
      ? buildArrowDuelCandidateAnalysisLines({
          puzzle: currentEntry.puzzle,
          candidates: [
            currentEntry.puzzle.stockfishBestMove,
            currentEntry.puzzle.solutionMoves[0]
          ].filter((move): move is string => Boolean(move))
        })
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
  const canReviewPrevious = isSessionReview && entryIndex > 0 && !boardLocked;
  const canReviewNext = isSessionReview && entryIndex < entries.length - 1 && !boardLocked;
  const canAnalysisBack = analysisEnabled && analysisBackStack.length > 0;
  const canAnalysisForward = analysisEnabled && analysisForwardStack.length > 0;
  const analysisDepth = engineAnalysisLines.reduce((maxDepth, line) => Math.max(maxDepth, line.depth), 0);
  const analysisEngineLabel =
    analysisEngineStatus === "stockfish"
      ? `SF 18 NNUE${analysisDepth > 0 ? ` · Depth ${analysisDepth}${analysisIsRunning ? `/${ANALYSIS_DEPTH}` : ""}` : ""}`
      : analysisEngineStatus === "thinking"
        ? "Analyzing..."
        : analysisEngineStatus === "fallback" || analysisEngineStatus === "error"
          ? "Local hint"
          : "";

  useEffect(() => {
    if (!analysisEnabled) {
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
    void analyzeFenWithUciEngine(transport, displayFen, {
      depth: ANALYSIS_DEPTH,
      multiPv: 3,
      onUpdate: (lines) => {
        if (!cancelled) {
          setEngineAnalysisLines(lines);
          setAnalysisEngineStatus(lines.length > 0 ? "stockfish" : "thinking");
          setAnalysisIsRunning(true);
        }
      }
    }).then(
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
  }, [analysisEnabled, displayFen, stockfishTransportFactory]);

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
    reviewResultRecordedRef.current = false;
    reviewSuppressedBoardMovesRef.current = [];
  }

  function advanceReview(result: "correct" | "wrong"): void {
    recordCurrentReviewResult(result);
    if (isSessionReview) {
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

  function recordCurrentReviewResult(result: "correct" | "wrong"): void {
    if (currentEntry.source === "session") {
      return;
    }
    if (reviewResultRecordedRef.current || reviewResultRecorded) {
      return;
    }
    reviewResultRecordedRef.current = true;
    service.recordReviewResult(currentEntry.puzzle.id, result);
    setReviewResultRecorded(true);
  }

  function navigateReview(nextIndex: number): void {
    if (!isSessionReview || boardLocked || nextIndex < 0 || nextIndex >= entries.length) {
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
        advanceReview(wrongSeen ? "wrong" : "correct");
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
      advanceReview("correct");
      return;
    }

    setWrongSeen(true);
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
        advanceReview("wrong");
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
        <View>
          <Text style={styles.panelTitle}>Review</Text>
          <Text testID="review-progress" style={styles.helperText}>
            {entryIndex + 1} / {entries.length} · {modeLabel(currentEntry.mode)}
          </Text>
        </View>
        <View style={styles.iconButtonRow} testID="review-header-actions">
          {isSessionReview ? (
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Exit review"
            testID="review-exit"
            style={styles.iconButton}
            onPress={() => onExit(currentEntry.source)}
          >
            <Text style={styles.iconButtonText}>×</Text>
          </Pressable>
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
          <View style={styles.analysisToolbar}>
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
                  accessibilityLabel={`Play analysis line ${index + 1}: ${line.san}`}
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
          {!analysisEnabled && guidedEvalLines.length > 0 ? (
            <>
              {guidedEvalLines.map((line, index) => (
                <View
                  key={`${line.move}-${index}`}
                  style={styles.analysisLineRow}
                  testID={`review-guided-eval-line-${index}`}
                >
                  <Text style={styles.analysisEvalText}>{line.score}</Text>
                  <Text style={styles.analysisMoveText} numberOfLines={1}>{index + 1}. {line.san}</Text>
                  <Text style={styles.analysisLineLabel} numberOfLines={1}>{line.label}</Text>
                </View>
              ))}
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
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

function normalizeUci(move: string): string {
  return move.trim().toLowerCase();
}

function SettingsPanel({ onResetRating }: { onResetRating: () => void }): React.JSX.Element {
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  return (
    <View style={styles.listPanel} testID="settings-panel">
      <Text style={styles.panelTitle}>Settings</Text>
      <View style={styles.settingRow}>
        <View>
          <Text style={styles.listText}>iCloud sync</Text>
          <Text style={styles.helperText}>{syncEnabled ? "Syncing enabled" : "Local only"}</Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="iCloud sync"
          accessibilityState={{ checked: syncEnabled }}
          testID="settings-icloud-sync-toggle"
          style={[styles.switchButton, syncEnabled ? styles.switchButtonActive : null]}
          onPress={() => setSyncEnabled((current) => !current)}
        >
          <Text style={[styles.switchText, syncEnabled ? styles.switchTextActive : null]}>{syncEnabled ? "On" : "Off"}</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reset ELO"
        testID="settings-reset-elo"
        style={styles.secondaryButton}
        onPress={() => {
          onResetRating();
          setResetMessage("ELO reset");
        }}
      >
        <Text style={styles.secondaryButtonText}>Reset ELO</Text>
      </Pressable>
      {resetMessage ? <Text style={styles.listText}>{resetMessage}</Text> : null}
    </View>
  );
}

function PacksPanel(): React.JSX.Element {
  return (
    <View style={styles.listPanel} testID="packs-panel">
      <Text style={styles.panelTitle}>Puzzle Packs</Text>
      <Text testID="packs-installed-core" style={styles.listText}>Core pack · installed · offline</Text>
      <Text testID="packs-license-notes" style={styles.helperText}>Source: Lichess puzzle database, presolved for Chessticize.</Text>
      <View style={styles.summaryRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Import pack" testID="packs-import" style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Import</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Remove pack" testID="packs-remove" style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Remove</Text>
        </Pressable>
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
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} tab`}
      testID={testID}
      style={[styles.tabButton, active ? styles.tabButtonActive : null]}
      onPress={onPress}
    >
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

function sprintConfigFor(
  mode: SprintMode,
  customDurationSeconds: number,
  customPerPuzzleSeconds: number
): SprintConfig {
  if (mode !== "custom") {
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
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: UI_PADDING,
    paddingVertical: 12
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
  tabs: {
    flexDirection: "row",
    gap: 8,
    padding: 12
  },
  tabButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    height: 38,
    justifyContent: "center"
  },
  tabButtonActive: {
    backgroundColor: "#1F2937",
    borderColor: "#1F2937"
  },
  tabText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "600"
  },
  tabTextActive: {
    color: "#FFFFFF"
  },
  content: {
    gap: 12,
    padding: UI_PADDING,
    paddingBottom: 40
  },
  sessionBar: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    gap: 10
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
    fontSize: 16,
    fontWeight: "800",
    height: 28,
    lineHeight: 28,
    textAlign: "center",
    width: 28
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
    padding: 12,
    gap: 8
  },
  summaryTitle: {
    color: "#111827",
    fontSize: 20,
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
  reviewSessionPanel: {
    gap: 12
  },
  reviewHeaderRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12
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
