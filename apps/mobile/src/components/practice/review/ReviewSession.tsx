type AnalysisEngineStatus = "idle" | "thinking" | "stockfish" | "fallback" | "error";

type ReviewBackCommand = {
  id: number;
  kind: "close-analysis" | "return-to-owner";
};

type DeferBackRelevantTransition = (key: string, resumeAfterCancel: () => void) => boolean;

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

  accessibleMoveModalBackdrop: {
    alignItems: "center",
    backgroundColor: theme.colors.scrimSoft,
    flex: 1,
    justifyContent: "center",
    padding: 20
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
  errorText: {
    color: theme.colors.danger.s800,
    fontSize: 14,
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
  helperText: {
    color: theme.colors.text.tertiary,
    fontSize: 12,
    fontWeight: "600"
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
  confirmationActionRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end"
  },
  arrowLayer: {
    position: "absolute",
    top: 0,
    left: 0
  },
