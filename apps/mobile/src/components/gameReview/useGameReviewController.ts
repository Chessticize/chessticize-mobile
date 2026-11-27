import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  evaluateGamePass1,
  extractGamePuzzles,
  gameReviewReportToPlyEvalInputs,
  parsePgnGame,
  submitArrowDuelChoice,
  submitLineMove,
  type EngineAnalysisLine,
  type GameHighlightMoment,
  type GamePlyEvaluation,
  type ParsedGame
} from "../../../../../packages/core/src/index.ts";
import {
  gamePlyEvaluationFromStored,
  storedGamePlyEvalFromEvaluation,
  type GameAnalysisStatus,
  type StoredUserPuzzle
} from "../../../../../packages/storage/src/game-review-store.ts";
import {
  buildEvalGraphPoints,
  buildGameReviewSummary,
  buildKeyMoments,
  createInitialRetryState,
  EVEN_ANALYSIS_SCORE,
  fenForRetryState,
  isCriticalClassification,
  isSuboptimalClassification,
  normalizeUciMove,
  reviewContextForUserPuzzle,
  STANDARD_STARTING_FEN,
  tryApplyUciMove,
  whiteWinPercentForScore
} from "./gameReviewHelpers.ts";
import type {
  GameReviewBoardArrow,
  GameReviewController,
  GameReviewMode,
  GameReviewScanPhase,
  KeyMomentRetryState,
  UseGameReviewControllerParams
} from "./gameReviewTypes.ts";

const DEFAULT_CHECKPOINT_INTERVAL_PLIES = 6;
const DEFAULT_MOBILE_PASS1_DEPTH = 10;
const DEFAULT_MOBILE_PASS1_NODES = 40_000;
const DEFAULT_MOBILE_PASS2_DEEP_LIMIT = { depth: 16, nodes: 250_000 } as const;
const DEFAULT_FREE_ANALYSIS_DEPTH = 16;
const DEFAULT_FREE_ANALYSIS_MULTIPV = 3;
const WHY_AUTOPLAY_STEP_MS = 850;

export function useGameReviewController({
  game,
  store,
  practiceService,
  engine = null,
  initialHighlights = [],
  initialMode,
  initialPly,
  initialFreeAnalysisOpen = false,
  pass1Depth,
  pass1Nodes,
  freeAnalysisDepth = DEFAULT_FREE_ANALYSIS_DEPTH,
  checkpointIntervalPlies = DEFAULT_CHECKPOINT_INTERVAL_PLIES,
  animateKeyMomentJump = true
}: UseGameReviewControllerParams): GameReviewController {
  // Parse PGN synchronously so the board & move list render immediately.
  const { parsedGame, parseError } = useMemo<{
    parsedGame: ParsedGame | null;
    parseError: string | null;
  }>(() => {
    try {
      return { parsedGame: parsePgnGame(game.pgn), parseError: null };
    } catch (error) {
      return {
        parsedGame: null,
        parseError: error instanceof Error ? error.message : "Invalid PGN"
      };
    }
  }, [game.pgn]);

  const totalPlies = parsedGame?.plies.length ?? 0;

  const latestStoredGame = useMemo(
    () => store.getImportedGame(game.id) ?? game,
    [game, store]
  );

  // Hydrate any cached ply evaluations and puzzles immediately from the store.
  const initialStoredEvals = useMemo(
    () => store.listGamePlyEvaluations(game.id).map(gamePlyEvaluationFromStored),
    [game.id, store]
  );
  const initialStoredPuzzles = useMemo(
    () => store.listUserPuzzles({ gameId: game.id }),
    [game.id, store]
  );

  const [analysisStatus, setAnalysisStatus] = useState<GameAnalysisStatus>(
    latestStoredGame.analysisStatus
  );
  const [scanPhase, setScanPhase] = useState<GameReviewScanPhase>(() => {
    if (latestStoredGame.analysisStatus === "complete") {
      return "complete";
    }
    if (!engine || parseError) {
      return "idle";
    }
    return latestStoredGame.analysisStatus === "pass1_done"
      ? "extracting_pass2"
      : "scanning_pass1";
  });
  const [scanError, setScanError] = useState<string | null>(null);
  const [plyEvaluations, setPlyEvaluations] = useState<GamePlyEvaluation[]>(initialStoredEvals);
  const [userPuzzles, setUserPuzzles] = useState<StoredUserPuzzle[]>(initialStoredPuzzles);
  const [highlights, setHighlights] = useState<GameHighlightMoment[]>(() => [...initialHighlights]);
  const [scanTrigger, setScanTrigger] = useState(0);

  const [flipped, setFlipped] = useState<boolean>(game.userColor === "b");
  const [mode, setModeState] = useState<GameReviewMode>(() => initialMode ?? "moves");
  const [currentPly, setCurrentPly] = useState<number>(() => {
    if (initialPly !== undefined && totalPlies > 0) {
      return Math.max(0, Math.min(initialPly, totalPlies));
    }
    return totalPlies > 0 ? Math.min(1, totalPlies) : 0;
  });
  const [activeMomentIndex, setActiveMomentIndex] = useState<number>(0);
  const [retryStatesByMomentId, setRetryStatesByMomentId] = useState<
    Record<string, KeyMomentRetryState>
  >({});

  // Free exploration off the main game line
  const [explorationStartFen, setExplorationStartFen] = useState<string | null>(null);
  const [explorationMoves, setExplorationMoves] = useState<string[]>([]);
  const [explorationFen, setExplorationFen] = useState<string | null>(null);

  // Live Stockfish MultiPV=3 free analysis
  const [freeAnalysisOpen, setFreeAnalysisOpen] = useState<boolean>(initialFreeAnalysisOpen);
  const [freeAnalysisLoading, setFreeAnalysisLoading] = useState<boolean>(false);
  const [freeAnalysisLines, setFreeAnalysisLines] = useState<EngineAnalysisLine[]>([]);
  const [freeAnalysisError, setFreeAnalysisError] = useState<string | null>(null);
  const [showEngineArrows, setShowEngineArrows] = useState<boolean>(false);

  // "Why?" opponent refutation playback on suboptimal moves (never spoils user's own best move)
  const [whyOpen, setWhyOpen] = useState<boolean>(false);
  const [whyLoading, setWhyLoading] = useState<boolean>(false);
  const [whyBaseFen, setWhyBaseFen] = useState<string | null>(null);
  const [whyMoves, setWhyMoves] = useState<string[]>([]);
  const [whyStep, setWhyStep] = useState<number>(0);
  const [whyAutoPlaying, setWhyAutoPlaying] = useState<boolean>(false);
  const [whyError, setWhyError] = useState<string | null>(null);
  const whyAbortRef = useRef<AbortController | null>(null);

  // Review queue enrollment state synced with PracticeService
  const [enrolledPuzzleIds, setEnrolledPuzzleIds] = useState<Set<string>>(() => {
    const enrolled = new Set<string>();
    for (const puzzle of initialStoredPuzzles) {
      const ctx = reviewContextForUserPuzzle(puzzle);
      if (practiceService.getReviewQueueState(ctx)) {
        enrolled.add(puzzle.id);
      }
    }
    return enrolled;
  });

  // Track latest streamed evaluations for checkpoint flushing on pause/background/unmount.
  const latestEvalsRef = useRef<GamePlyEvaluation[]>(plyEvaluations);
  latestEvalsRef.current = plyEvaluations;
  const latestStatusRef = useRef<GameAnalysisStatus>(analysisStatus);
  latestStatusRef.current = analysisStatus;
  const scanAbortRef = useRef<AbortController | null>(null);
  const pausedByBackgroundRef = useRef(false);
  const freeAnalysisAbortRef = useRef<AbortController | null>(null);
  const [isFastForwarding, setIsFastForwarding] = useState(false);
  const fastForwardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fastForwardTargetPlyRef = useRef<number | null>(null);
  const currentPlyRef = useRef<number>(currentPly);
  currentPlyRef.current = currentPly;

  const cancelFastForward = useCallback(() => {
    if (fastForwardTimerRef.current !== null) {
      clearTimeout(fastForwardTimerRef.current);
      fastForwardTimerRef.current = null;
    }
    fastForwardTargetPlyRef.current = null;
    setIsFastForwarding(false);
  }, []);

  useEffect(() => {
    return () => {
      if (fastForwardTimerRef.current !== null) {
        clearTimeout(fastForwardTimerRef.current);
        fastForwardTimerRef.current = null;
      }
      fastForwardTargetPlyRef.current = null;
      whyAbortRef.current?.abort();
      whyAbortRef.current = null;
    };
  }, []);

  const closeWhyRefutation = useCallback(() => {
    whyAbortRef.current?.abort();
    whyAbortRef.current = null;
    setWhyOpen(false);
    setWhyLoading(false);
    setWhyBaseFen(null);
    setWhyMoves([]);
    setWhyStep(0);
    setWhyAutoPlaying(false);
    setWhyError(null);
  }, []);

  // Chess.com-style automatic playback through the entire punishment line (~850ms per ply).
  useEffect(() => {
    if (!whyOpen || !whyAutoPlaying || whyMoves.length === 0) {
      return;
    }
    if (whyStep >= whyMoves.length) {
      setWhyAutoPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setWhyStep((current) => {
        const next = Math.min(whyMoves.length, current + 1);
        if (next >= whyMoves.length) {
          setWhyAutoPlaying(false);
        }
        return next;
      });
    }, WHY_AUTOPLAY_STEP_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [whyAutoPlaying, whyMoves.length, whyOpen, whyStep]);

  const syncEnrolledIds = useCallback(
    (puzzles: readonly StoredUserPuzzle[]) => {
      const next = new Set<string>();
      for (const puzzle of puzzles) {
        if (practiceService.getReviewQueueState(reviewContextForUserPuzzle(puzzle))) {
          next.add(puzzle.id);
        }
      }
      setEnrolledPuzzleIds(next);
    },
    [practiceService]
  );

  const persistCheckpoint = useCallback(
    (
      evals: readonly GamePlyEvaluation[],
      status: GameAnalysisStatus,
      accuracies?: { whiteAccuracy?: number; blackAccuracy?: number }
    ) => {
      if (evals.length === 0 && status === "none") {
        return;
      }
      const checkpointPly = evals[evals.length - 1]?.ply ?? 0;
      const storedEvals = evals.map((item) => storedGamePlyEvalFromEvaluation(game.id, item));
      try {
        store.saveGamePlyEvaluations(game.id, storedEvals, {
          analysisStatus: status,
          analysisCheckpointPly: checkpointPly,
          ...(accuracies?.whiteAccuracy === undefined
            ? {}
            : { whiteAccuracy: accuracies.whiteAccuracy }),
          ...(accuracies?.blackAccuracy === undefined
            ? {}
            : { blackAccuracy: accuracies.blackAccuracy })
        });
      } catch {
        // Ignore if game was deleted externally during unmount/backgrounding.
      }
    },
    [game.id, store]
  );

  // Foreground streaming Pass-1 -> Pass-2 analysis pipeline.
  useEffect(() => {
    if (analysisStatus === "complete") {
      setScanPhase("complete");
      return;
    }
    if (!engine || !parsedGame || parseError) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    scanAbortRef.current = controller;
    setScanError(null);

    const runPipeline = async () => {
      try {
        const cachedEvals = store
          .listGamePlyEvaluations(game.id)
          .map(gamePlyEvaluationFromStored);
        const streamedEvals = [...cachedEvals];
        let unsavedCount = 0;

        setScanPhase("scanning_pass1");
        const report = await evaluateGamePass1({
          pgn: parsedGame,
          engine,
          userColor: game.userColor,
          options: {
            depth: pass1Depth ?? DEFAULT_MOBILE_PASS1_DEPTH,
            nodes: pass1Nodes ?? DEFAULT_MOBILE_PASS1_NODES,
            priority: "batch",
            initialEvaluations: cachedEvals,
            signal: controller.signal,
            onPlyEvaluated: (plyEval) => {
              if (cancelled || controller.signal.aborted) {
                return;
              }
              streamedEvals.push(plyEval);
              latestEvalsRef.current = [...streamedEvals];
              setPlyEvaluations([...streamedEvals]);
              unsavedCount += 1;
              if (unsavedCount >= checkpointIntervalPlies) {
                unsavedCount = 0;
                persistCheckpoint(streamedEvals, "partial");
                setAnalysisStatus("partial");
              }
            }
          }
        });

        if (cancelled || controller.signal.aborted || !report.isComplete) {
          if (report.plies.length > 0 && latestStatusRef.current !== "complete") {
            persistCheckpoint(report.plies, "partial", {
              whiteAccuracy: report.whiteAccuracy,
              blackAccuracy: report.blackAccuracy
            });
            if (!cancelled) {
              setAnalysisStatus("partial");
              setScanPhase("paused");
            }
          }
          return;
        }

        // Persist completed Pass-1 report before entering Pass-2 extraction.
        latestEvalsRef.current = [...report.plies];
        setPlyEvaluations([...report.plies]);
        persistCheckpoint(report.plies, "pass1_done", {
          whiteAccuracy: report.whiteAccuracy,
          blackAccuracy: report.blackAccuracy
        });
        setAnalysisStatus("pass1_done");
        setScanPhase("extracting_pass2");

        const extraction = await extractGamePuzzles(
          {
            gameId: game.id,
            userColor: game.userColor,
            plies: gameReviewReportToPlyEvalInputs(report),
            ...(game.timeControl ? { timeControl: game.timeControl } : {})
          },
          engine,
          {
            deepLimit: DEFAULT_MOBILE_PASS2_DEEP_LIMIT,
            signal: controller.signal
          }
        );

        if (cancelled || controller.signal.aborted) {
          return;
        }

        const savedPuzzles = store.replaceGameUserPuzzles(game.id, extraction.puzzles, {
          ...(game.playedAt ? { playedAt: game.playedAt } : {}),
          ...(game.timeClass ? { timeClass: game.timeClass } : {})
        });
        persistCheckpoint(report.plies, "complete", {
          whiteAccuracy: report.whiteAccuracy,
          blackAccuracy: report.blackAccuracy
        });

        if (cancelled) {
          return;
        }

        setUserPuzzles(savedPuzzles);
        syncEnrolledIds(savedPuzzles);
        setHighlights(extraction.highlights);
        latestStatusRef.current = "complete";
        if (scanAbortRef.current === controller) {
          scanAbortRef.current = null;
        }
        setAnalysisStatus("complete");
        setScanPhase("complete");
      } catch (error) {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : "Engine analysis failed";
        setScanError(message);
        setScanPhase("error");
        if (latestEvalsRef.current.length > 0) {
          persistCheckpoint(latestEvalsRef.current, "partial");
        }
      } finally {
        if (scanAbortRef.current === controller) {
          scanAbortRef.current = null;
        }
      }
    };

    void runPipeline();

    return () => {
      cancelled = true;
      controller.abort();
      if (scanAbortRef.current === controller) {
        scanAbortRef.current = null;
      }
      if (latestStatusRef.current !== "complete" && latestEvalsRef.current.length > 0) {
        persistCheckpoint(latestEvalsRef.current, "partial");
      }
    };
    // Intentionally keyed on scanTrigger and game.id so partial checkpoint status updates do not restart the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, engine, parsedGame, parseError, scanTrigger]);

  // Cancel active scan cleanly and persist partial checkpoint only on true backgrounding,
  // and auto-resume smoothly when the user returns to the app.
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "background") {
        if (
          latestStatusRef.current !== "complete" &&
          scanAbortRef.current &&
          !scanAbortRef.current.signal.aborted
        ) {
          pausedByBackgroundRef.current = true;
          scanAbortRef.current.abort();
          if (latestEvalsRef.current.length > 0) {
            persistCheckpoint(latestEvalsRef.current, "partial");
            setAnalysisStatus("partial");
          }
          setScanPhase("paused");
        }
        if (freeAnalysisAbortRef.current && !freeAnalysisAbortRef.current.signal.aborted) {
          freeAnalysisAbortRef.current.abort();
          setFreeAnalysisLoading(false);
        }
      } else if (nextState === "active" && pausedByBackgroundRef.current) {
        pausedByBackgroundRef.current = false;
        if (latestStatusRef.current === "complete") {
          setScanPhase("complete");
        } else {
          setScanTrigger((value) => value + 1);
        }
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [persistCheckpoint]);

  const evalByPly = useMemo(() => {
    const map = new Map<number, GamePlyEvaluation>();
    for (const item of plyEvaluations) {
      map.set(item.ply, item);
    }
    return map;
  }, [plyEvaluations]);

  const keyMoments = useMemo(
    () => buildKeyMoments(parsedGame, plyEvaluations, userPuzzles, highlights),
    [highlights, parsedGame, plyEvaluations, userPuzzles]
  );

  // Keep activeMomentIndex in bounds when keyMoments change.
  const clampedMomentIndex =
    keyMoments.length === 0 ? 0 : Math.min(activeMomentIndex, keyMoments.length - 1);
  const activeMoment = keyMoments[clampedMomentIndex] ?? null;

  // Ensure every key moment has an initialized retry state.
  useEffect(() => {
    if (keyMoments.length === 0) {
      return;
    }
    setRetryStatesByMomentId((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const moment of keyMoments) {
        if (!next[moment.id]) {
          next[moment.id] = createInitialRetryState(moment);
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [keyMoments]);

  const activeRetryState = useMemo<KeyMomentRetryState | null>(() => {
    if (!activeMoment) {
      return null;
    }
    return retryStatesByMomentId[activeMoment.id] ?? createInitialRetryState(activeMoment);
  }, [activeMoment, retryStatesByMomentId]);

  const clearExploration = useCallback(() => {
    setExplorationStartFen(null);
    setExplorationMoves([]);
    setExplorationFen(null);
  }, []);

  const isExploringOffLine = explorationFen !== null && explorationMoves.length > 0;

  // Compute the current board position, last move highlight, and evaluation score.
  const { currentFen, currentLastMoveUci, currentScore, currentWhiteWinPercent } = useMemo(() => {
    if (isExploringOffLine && explorationFen) {
      const liveTop = freeAnalysisLines[0];
      const liveScore = liveTop?.score ?? EVEN_ANALYSIS_SCORE;
      return {
        currentFen: explorationFen,
        currentLastMoveUci: explorationMoves[explorationMoves.length - 1] ?? null,
        currentScore: liveScore,
        currentWhiteWinPercent: whiteWinPercentForScore(liveScore)
      };
    }

    if (whyOpen && whyBaseFen && whyStep > 0 && whyMoves.length > 0) {
      let fen = whyBaseFen;
      let lastMove: string | null = null;
      const limit = Math.min(whyStep, whyMoves.length);
      for (let index = 0; index < limit; index += 1) {
        const applied = tryApplyUciMove(fen, whyMoves[index]!);
        if (!applied) {
          break;
        }
        fen = applied.fen;
        lastMove = applied.uci;
      }
      const plyEval = currentPly > 0 ? evalByPly.get(currentPly) : undefined;
      const score = plyEval?.scoreAfter ?? EVEN_ANALYSIS_SCORE;
      return {
        currentFen: fen,
        currentLastMoveUci: lastMove,
        currentScore: score,
        currentWhiteWinPercent: plyEval ? plyEval.whiteWinPercent : whiteWinPercentForScore(score)
      };
    }

    if (mode === "moments" && activeMoment && activeRetryState) {
      const momentBoard = fenForRetryState(activeMoment, activeRetryState);
      const momentEval = evalByPly.get(activeMoment.ply);
      const score = momentEval?.scoreAfter ?? EVEN_ANALYSIS_SCORE;
      return {
        currentFen: momentBoard.fen,
        currentLastMoveUci: momentBoard.lastMoveUci,
        currentScore: score,
        currentWhiteWinPercent: momentEval
          ? momentEval.whiteWinPercent
          : whiteWinPercentForScore(score)
      };
    }

    // Moves browsing mode
    if (!parsedGame || currentPly <= 0) {
      const firstEval = plyEvaluations[0];
      const initWin = firstEval
        ? firstEval.color === "w"
          ? firstEval.moverWinPercentBefore
          : 100 - firstEval.moverWinPercentBefore
        : 50;
      return {
        currentFen: parsedGame?.initialFen ?? STANDARD_STARTING_FEN,
        currentLastMoveUci: null,
        currentScore: EVEN_ANALYSIS_SCORE,
        currentWhiteWinPercent: initWin
      };
    }

    const clampedPly = Math.min(currentPly, parsedGame.plies.length);
    const parsedPly = parsedGame.plies[clampedPly - 1];
    const plyEval = evalByPly.get(clampedPly);
    const score = plyEval?.scoreAfter ?? EVEN_ANALYSIS_SCORE;
    return {
      currentFen: parsedPly?.fenAfter ?? parsedGame.initialFen ?? STANDARD_STARTING_FEN,
      currentLastMoveUci: parsedPly?.uci ?? null,
      currentScore: score,
      currentWhiteWinPercent: plyEval ? plyEval.whiteWinPercent : whiteWinPercentForScore(score)
    };
  }, [
    activeMoment,
    activeRetryState,
    currentPly,
    evalByPly,
    explorationFen,
    explorationMoves,
    freeAnalysisLines,
    isExploringOffLine,
    mode,
    parsedGame,
    plyEvaluations,
    whyBaseFen,
    whyMoves,
    whyOpen,
    whyStep
  ]);

  const isPromptHidingAnswer =
    mode === "moments" &&
    activeMoment?.kind === "puzzle" &&
    activeRetryState?.status === "prompt";

  // Live Free Stockfish Analysis (MultiPV=3, priority="interactive" preempts Pass-2 batch work!)
  useEffect(() => {
    if (!freeAnalysisOpen || !engine || isPromptHidingAnswer || isFastForwarding || whyAutoPlaying) {
      freeAnalysisAbortRef.current?.abort();
      freeAnalysisAbortRef.current = null;
      setFreeAnalysisLoading(false);
      if (!freeAnalysisOpen) {
        setFreeAnalysisLines([]);
        setFreeAnalysisError(null);
      }
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    freeAnalysisAbortRef.current = controller;
    setFreeAnalysisLoading(true);
    setFreeAnalysisError(null);

    engine
      .analyze({
        fen: currentFen,
        multiPv: DEFAULT_FREE_ANALYSIS_MULTIPV,
        depth: freeAnalysisDepth,
        priority: "interactive",
        signal: controller.signal,
        onUpdate: (lines) => {
          if (!cancelled && !controller.signal.aborted) {
            setFreeAnalysisLines(lines);
          }
        }
      })
      .then((lines) => {
        if (!cancelled && !controller.signal.aborted) {
          setFreeAnalysisLines(lines);
          setFreeAnalysisLoading(false);
        }
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        setFreeAnalysisLoading(false);
        setFreeAnalysisError(
          error instanceof Error ? error.message : "Engine analysis unavailable"
        );
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (freeAnalysisAbortRef.current === controller) {
        freeAnalysisAbortRef.current = null;
      }
    };
  }, [currentFen, engine, freeAnalysisDepth, freeAnalysisOpen, isFastForwarding, isPromptHidingAnswer, whyAutoPlaying]);

  const currentPlyEval = useMemo<GamePlyEvaluation | null>(() => {
    if (isExploringOffLine) {
      return null;
    }
    if (mode === "moments" && activeMoment) {
      return evalByPly.get(activeMoment.ply) ?? null;
    }
    if (currentPly <= 0) {
      return null;
    }
    return evalByPly.get(currentPly) ?? null;
  }, [activeMoment, currentPly, evalByPly, isExploringOffLine, mode]);

  const criticalPlies = useMemo<number[]>(() => {
    const plySet = new Set<number>();
    for (const moment of keyMoments) {
      plySet.add(moment.ply);
    }
    for (const plyEval of plyEvaluations) {
      if (isCriticalClassification(plyEval.classification)) {
        plySet.add(plyEval.ply);
      }
    }
    return [...plySet].sort((a, b) => a - b);
  }, [keyMoments, plyEvaluations]);

  // Compute board overlay arrows & Arrow Duel candidates.
  const { boardArrows, arrowDuelCandidates } = useMemo<{
    boardArrows: GameReviewBoardArrow[];
    arrowDuelCandidates: string[] | null;
  }>(() => {
    const arrows: GameReviewBoardArrow[] = [];
    let candidates: string[] | null = null;

    if (!isExploringOffLine && mode === "moments" && activeMoment && activeRetryState) {
      if (activeMoment.kind === "highlight") {
        arrows.push({ move: activeMoment.highlight.uci, role: "highlight", selected: true });
      } else if (activeMoment.kind === "swing") {
        if (activeMoment.bestMoveUci) {
          arrows.push({ move: activeMoment.bestMoveUci, role: "best", selected: true });
        }
        arrows.push({ move: activeMoment.playedMoveUci, role: "blunder", selected: false });
      } else if (activeRetryState.status === "prompt") {
        if (activeMoment.puzzle.puzzleKind === "arrow_duel" && activeRetryState.candidates) {
          candidates = activeRetryState.candidates;
        }
        // In Line prompt mode, answer is strictly hidden (zero answer arrows).
      } else if (!activeRetryState.showingRefutation) {
        if (activeMoment.bestMoveUci) {
          arrows.push({
            move: activeMoment.bestMoveUci,
            role: "best",
            selected: true
          });
        }
        if (
          activeMoment.playedMoveUci &&
          normalizeUciMove(activeMoment.playedMoveUci) !==
            normalizeUciMove(activeMoment.bestMoveUci ?? "")
        ) {
          arrows.push({
            move: activeMoment.playedMoveUci,
            role: "blunder",
            selected: false
          });
        }
      }
    } else if (freeAnalysisOpen && showEngineArrows && freeAnalysisLines.length > 0) {
      for (let index = 0; index < Math.min(3, freeAnalysisLines.length); index += 1) {
        const line = freeAnalysisLines[index];
        if (line?.move) {
          arrows.push({
            move: line.move,
            role: "engine",
            selected: index === 0
          });
        }
      }
    }

    return { boardArrows: arrows, arrowDuelCandidates: candidates };
  }, [
    activeMoment,
    activeRetryState,
    freeAnalysisLines,
    freeAnalysisOpen,
    isExploringOffLine,
    mode,
    showEngineArrows
  ]);

  const animateToPly = useCallback(
    (targetPly: number, onArrive?: () => void) => {
      cancelFastForward();
      closeWhyRefutation();
      clearExploration();
      const clampedTarget = Math.max(0, Math.min(targetPly, totalPlies));
      const startPly =
        mode === "moments" && activeMoment ? activeMoment.ply : currentPlyRef.current;
      const distance = Math.abs(clampedTarget - startPly);

      if (!animateKeyMomentJump || distance <= 1) {
        currentPlyRef.current = clampedTarget;
        setCurrentPly(clampedTarget);
        onArrive?.();
        return;
      }

      const delta = clampedTarget > startPly ? 1 : -1;
      // Adaptive cadence: ~560ms total for medium jumps, brisk 20ms floor for 30+ ply jumps,
      // 110ms ceiling for 2-5 ply hops so every move in between is clearly readable.
      const stepMs = Math.max(20, Math.min(110, Math.round(560 / distance)));

      setModeState("moves");
      setIsFastForwarding(true);
      fastForwardTargetPlyRef.current = clampedTarget;

      let cursor = startPly + delta;
      currentPlyRef.current = cursor;
      setCurrentPly(cursor);

      const tick = () => {
        cursor += delta;
        currentPlyRef.current = cursor;
        setCurrentPly(cursor);
        if (cursor === clampedTarget) {
          fastForwardTimerRef.current = null;
          fastForwardTargetPlyRef.current = null;
          setIsFastForwarding(false);
          onArrive?.();
          return;
        }
        fastForwardTimerRef.current = setTimeout(tick, stepMs);
      };

      fastForwardTimerRef.current = setTimeout(tick, stepMs);
    },
    [
      activeMoment,
      animateKeyMomentJump,
      cancelFastForward,
      clearExploration,
      closeWhyRefutation,
      mode,
      totalPlies
    ]
  );

  const setMode = useCallback(
    (nextMode: GameReviewMode) => {
      cancelFastForward();
      closeWhyRefutation();
      clearExploration();
      setModeState(nextMode);
      if (nextMode === "moments" && keyMoments[clampedMomentIndex]) {
        const ply = keyMoments[clampedMomentIndex]!.ply;
        currentPlyRef.current = ply;
        setCurrentPly(ply);
      }
    },
    [cancelFastForward, clampedMomentIndex, clearExploration, closeWhyRefutation, keyMoments]
  );

  const selectPly = useCallback(
    (ply: number) => {
      cancelFastForward();
      closeWhyRefutation();
      clearExploration();
      const clamped = Math.max(0, Math.min(ply, totalPlies));
      currentPlyRef.current = clamped;
      setCurrentPly(clamped);
      setModeState("moves");
    },
    [cancelFastForward, clearExploration, closeWhyRefutation, totalPlies]
  );

  const stepFirst = useCallback(() => selectPly(0), [selectPly]);
  const stepPrev = useCallback(() => {
    const anchor = mode === "moments" && activeMoment ? activeMoment.ply : currentPly;
    selectPly(anchor - 1);
  }, [activeMoment, currentPly, mode, selectPly]);
  const stepNext = useCallback(() => {
    const anchor = mode === "moments" && activeMoment ? activeMoment.ply : currentPly;
    selectPly(anchor + 1);
  }, [activeMoment, currentPly, mode, selectPly]);
  const stepLast = useCallback(() => selectPly(totalPlies), [selectPly, totalPlies]);

  const toggleFlip = useCallback(() => {
    setFlipped((value) => !value);
  }, []);

  const selectKeyMoment = useCallback(
    (index: number) => {
      if (keyMoments.length === 0) {
        return;
      }
      const bounded = Math.max(0, Math.min(index, keyMoments.length - 1));
      const target = keyMoments[bounded];
      if (!target) {
        return;
      }
      animateToPly(target.ply, () => {
        setActiveMomentIndex(bounded);
        setModeState("moves");
      });
    },
    [animateToPly, keyMoments]
  );

  const prevKeyMoment = useCallback(() => {
    selectKeyMoment(clampedMomentIndex - 1);
  }, [clampedMomentIndex, selectKeyMoment]);

  const nextKeyMoment = useCallback(() => {
    selectKeyMoment(clampedMomentIndex + 1);
  }, [clampedMomentIndex, selectKeyMoment]);

  const skipActiveKeyMoment = useCallback(() => {
    if (!activeMoment || activeMoment.kind !== "puzzle") {
      return;
    }
    setRetryStatesByMomentId((previous) => {
      const current = previous[activeMoment.id] ?? createInitialRetryState(activeMoment);
      return {
        ...previous,
        [activeMoment.id]: {
          ...current,
          status: "skipped",
          showingRefutation: false,
          refutationStep: 0
        }
      };
    });
  }, [activeMoment]);

  const retryActiveKeyMoment = useCallback(() => {
    if (!activeMoment || activeMoment.kind !== "puzzle") {
      return;
    }
    clearExploration();
    setRetryStatesByMomentId((previous) => ({
      ...previous,
      [activeMoment.id]: createInitialRetryState(activeMoment)
    }));
  }, [activeMoment, clearExploration]);

  const recordRetryOutcome = useCallback(
    (puzzle: StoredUserPuzzle, result: "correct" | "wrong"): boolean => {
      const ctx = reviewContextForUserPuzzle(puzzle);
      const outcome = practiceService.recordGameReviewRetryOutcome({
        puzzleId: ctx.puzzleId,
        mode: ctx.mode,
        ratingKey: ctx.ratingKey,
        result
      });
      if (outcome.enrolled) {
        setEnrolledPuzzleIds((previous) => {
          const next = new Set(previous);
          next.add(puzzle.id);
          return next;
        });
      }
      return outcome.enrolled;
    },
    [practiceService]
  );

  const handleExplorationMove = useCallback(
    (uci: string) => {
      const baseFen = explorationFen ?? currentFen;
      const applied = tryApplyUciMove(baseFen, uci);
      if (!applied) {
        return;
      }
      if (!explorationStartFen) {
        setExplorationStartFen(currentFen);
      }
      setExplorationMoves((previous) => [...previous, applied.uci]);
      setExplorationFen(applied.fen);
    },
    [currentFen, explorationFen, explorationStartFen]
  );

  const submitBoardMove = useCallback(
    (rawUci: string) => {
      const uci = normalizeUciMove(rawUci);
      if (!uci) {
        return;
      }

      // Interactive Retry mode (Key Moments prompt)
      if (
        !isExploringOffLine &&
        mode === "moments" &&
        activeMoment?.kind === "puzzle" &&
        activeRetryState?.status === "prompt"
      ) {
        const puzzle = activeMoment.puzzle;

        if (puzzle.puzzleKind === "arrow_duel" && activeRetryState.duelState) {
          const isCandidate = activeRetryState.duelState.candidates.some(
            (candidate) => normalizeUciMove(candidate) === uci
          );
          if (!isCandidate) {
            return;
          }
          const { state: nextDuel, feedback } = submitArrowDuelChoice(
            activeRetryState.duelState,
            uci,
            { opponentReply: false }
          );
          const solved = feedback.result === "correct";
          const enrolled = recordRetryOutcome(puzzle, solved ? "correct" : "wrong");

          setRetryStatesByMomentId((previous) => ({
            ...previous,
            [activeMoment.id]: {
              ...activeRetryState,
              duelState: nextDuel,
              selectedMove: uci,
              status: solved ? "solved" : "failed",
              showingRefutation: !solved && activeRetryState.punishmentLine.length > 0,
              refutationStep: !solved && activeRetryState.punishmentLine.length > 0 ? 1 : 0,
              autoEnrolledInReview: enrolled
            }
          }));
          return;
        }

        if (puzzle.puzzleKind === "line" && activeRetryState.lineState) {
          let result;
          try {
            result = submitLineMove(activeRetryState.lineState, uci);
          } catch {
            return;
          }
          if (result.feedback.result === "wrong") {
            const enrolled = recordRetryOutcome(puzzle, "wrong");
            setRetryStatesByMomentId((previous) => ({
              ...previous,
              [activeMoment.id]: {
                ...activeRetryState,
                selectedMove: uci,
                expectedMove: result.feedback.expectedMove,
                status: "failed",
                showingRefutation: false,
                refutationStep: 0,
                autoEnrolledInReview: enrolled
              }
            }));
            return;
          }

          if (result.feedback.puzzleSolved) {
            const enrolled = recordRetryOutcome(puzzle, "correct");
            setRetryStatesByMomentId((previous) => ({
              ...previous,
              [activeMoment.id]: {
                ...activeRetryState,
                lineState: result.state,
                selectedMove: uci,
                status: "solved",
                showingRefutation: false,
                refutationStep: 0,
                autoEnrolledInReview: enrolled
              }
            }));
            return;
          }

          // Multi-move line: advance cursor and stay in prompt for the next move.
          setRetryStatesByMomentId((previous) => ({
            ...previous,
            [activeMoment.id]: {
              ...activeRetryState,
              lineState: result.state,
              selectedMove: uci
            }
          }));
          return;
        }
      }

      // Free exploration move on the board (Moves mode, solved/failed review, or Engine open)
      handleExplorationMove(uci);
    },
    [
      activeMoment,
      activeRetryState,
      handleExplorationMove,
      isExploringOffLine,
      mode,
      recordRetryOutcome
    ]
  );

  const selectArrowDuelCandidate = useCallback(
    (uci: string) => {
      submitBoardMove(uci);
    },
    [submitBoardMove]
  );

  const toggleRefutationPlayback = useCallback(() => {
    if (!activeMoment || !activeRetryState || activeRetryState.punishmentLine.length === 0) {
      return;
    }
    clearExploration();
    setRetryStatesByMomentId((previous) => {
      const current = previous[activeMoment.id] ?? activeRetryState;
      const nextShowing = !current.showingRefutation;
      return {
        ...previous,
        [activeMoment.id]: {
          ...current,
          showingRefutation: nextShowing,
          refutationStep: nextShowing ? 1 : 0
        }
      };
    });
  }, [activeMoment, activeRetryState, clearExploration]);

  const stepRefutationForward = useCallback(() => {
    if (!activeMoment || !activeRetryState) {
      return;
    }
    setRetryStatesByMomentId((previous) => {
      const current = previous[activeMoment.id] ?? activeRetryState;
      const nextStep = Math.min(current.punishmentLine.length, current.refutationStep + 1);
      return {
        ...previous,
        [activeMoment.id]: {
          ...current,
          showingRefutation: true,
          refutationStep: nextStep
        }
      };
    });
  }, [activeMoment, activeRetryState]);

  const stepRefutationBackward = useCallback(() => {
    if (!activeMoment || !activeRetryState) {
      return;
    }
    setRetryStatesByMomentId((previous) => {
      const current = previous[activeMoment.id] ?? activeRetryState;
      const nextStep = Math.max(0, current.refutationStep - 1);
      return {
        ...previous,
        [activeMoment.id]: {
          ...current,
          showingRefutation: nextStep > 0,
          refutationStep: nextStep
        }
      };
    });
  }, [activeMoment, activeRetryState]);

  const togglePuzzleReviewEnrollment = useCallback(
    (puzzle: StoredUserPuzzle) => {
      const ctx = reviewContextForUserPuzzle(puzzle);
      const currentlyEnrolled = Boolean(practiceService.getReviewQueueState(ctx));
      if (currentlyEnrolled) {
        practiceService.removeReview(ctx);
        setEnrolledPuzzleIds((previous) => {
          const next = new Set(previous);
          next.delete(puzzle.id);
          return next;
        });
      } else {
        practiceService.enrollReview(ctx);
        setEnrolledPuzzleIds((previous) => {
          const next = new Set(previous);
          next.add(puzzle.id);
          return next;
        });
      }
    },
    [practiceService]
  );

  const enrollAllPuzzlesInReview = useCallback(() => {
    if (userPuzzles.length === 0) {
      return;
    }
    const enrolledIds = new Set<string>();
    for (const puzzle of userPuzzles) {
      const ctx = reviewContextForUserPuzzle(puzzle);
      if (!practiceService.getReviewQueueState(ctx)) {
        practiceService.enrollReview(ctx);
      }
      enrolledIds.add(puzzle.id);
    }
    setEnrolledPuzzleIds((previous) => {
      const next = new Set(previous);
      for (const id of enrolledIds) {
        next.add(id);
      }
      return next;
    });
  }, [practiceService, userPuzzles]);

  const toggleFreeAnalysis = useCallback(() => {
    setFreeAnalysisOpen((value) => !value);
  }, []);

  const toggleShowEngineArrows = useCallback(() => {
    setShowEngineArrows((value) => !value);
  }, []);

  const toggleWhyRefutation = useCallback(() => {
    if (whyOpen) {
      closeWhyRefutation();
      return;
    }
    if (!currentPlyEval || !isSuboptimalClassification(currentPlyEval.classification)) {
      return;
    }
    clearExploration();
    whyAbortRef.current?.abort();
    const baseFen = currentPlyEval.fenAfter;
    setWhyOpen(true);
    setWhyBaseFen(baseFen);
    setWhyError(null);

    // Prefer cached opponent punishment line from extracted puzzles when legal on fenAfter.
    const matchingPuzzle = userPuzzles.find(
      (puzzle) =>
        puzzle.gamePly === currentPlyEval.ply &&
        puzzle.punishmentLine &&
        puzzle.punishmentLine.length > 0
    );
    if (matchingPuzzle?.punishmentLine) {
      const legalMoves: string[] = [];
      let probeFen = baseFen;
      for (const move of matchingPuzzle.punishmentLine) {
        const applied = tryApplyUciMove(probeFen, move);
        if (!applied) {
          break;
        }
        legalMoves.push(applied.uci);
        probeFen = applied.fen;
      }
      if (legalMoves.length > 0) {
        setWhyLoading(false);
        setWhyMoves(legalMoves);
        setWhyStep(1);
        setWhyAutoPlaying(legalMoves.length > 1);
        return;
      }
    }

    if (!engine) {
      setWhyLoading(false);
      setWhyMoves([]);
      setWhyStep(0);
      setWhyAutoPlaying(false);
      return;
    }

    const controller = new AbortController();
    whyAbortRef.current = controller;
    setWhyLoading(true);
    setWhyMoves([]);
    setWhyStep(0);
    setWhyAutoPlaying(false);

    engine
      .analyze({
        fen: baseFen,
        multiPv: 1,
        depth: freeAnalysisDepth,
        priority: "interactive",
        signal: controller.signal
      })
      .then((lines) => {
        if (controller.signal.aborted) {
          return;
        }
        const top = lines[0];
        const rawPv = top ? (top.pv.length > 0 ? top.pv : [top.move]) : [];
        const legalMoves: string[] = [];
        let probeFen = baseFen;
        for (const move of rawPv.slice(0, 8)) {
          const applied = tryApplyUciMove(probeFen, move);
          if (!applied) {
            break;
          }
          legalMoves.push(applied.uci);
          probeFen = applied.fen;
        }
        setWhyLoading(false);
        setWhyMoves(legalMoves);
        setWhyStep(legalMoves.length > 0 ? 1 : 0);
        setWhyAutoPlaying(legalMoves.length > 1);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        setWhyLoading(false);
        setWhyAutoPlaying(false);
        setWhyError(error instanceof Error ? error.message : "Engine unavailable");
      });
  }, [clearExploration, closeWhyRefutation, currentPlyEval, engine, freeAnalysisDepth, userPuzzles, whyOpen]);

  const selectWhyStep = useCallback(
    (step: number) => {
      setWhyAutoPlaying(false);
      setWhyStep(Math.max(0, Math.min(whyMoves.length, step)));
    },
    [whyMoves.length]
  );

  const toggleWhyAutoPlay = useCallback(() => {
    if (whyMoves.length === 0) {
      return;
    }
    if (whyAutoPlaying) {
      setWhyAutoPlaying(false);
      return;
    }
    if (whyStep >= whyMoves.length) {
      setWhyStep(1);
      setWhyAutoPlaying(whyMoves.length > 1);
    } else {
      setWhyAutoPlaying(true);
    }
  }, [whyAutoPlaying, whyMoves.length, whyStep]);

  const stepWhyForward = useCallback(() => {
    setWhyAutoPlaying(false);
    setWhyStep((current) => Math.min(whyMoves.length, current + 1));
  }, [whyMoves.length]);

  const stepWhyBackward = useCallback(() => {
    setWhyAutoPlaying(false);
    setWhyStep((current) => Math.max(0, current - 1));
  }, []);

  const playEngineLineMove = useCallback(
    (uci: string) => {
      if (isPromptHidingAnswer) {
        return;
      }
      handleExplorationMove(uci);
    },
    [handleExplorationMove, isPromptHidingAnswer]
  );

  const returnToGameLine = useCallback(() => {
    clearExploration();
  }, [clearExploration]);

  const resumeAnalysis = useCallback(() => {
    pausedByBackgroundRef.current = false;
    if (analysisStatus === "complete") {
      setScanPhase("complete");
      return;
    }
    setScanTrigger((value) => value + 1);
  }, [analysisStatus]);

  const hasNextCritical = useMemo(() => {
    const anchorPly = mode === "moments" && activeMoment ? activeMoment.ply : currentPly;
    return criticalPlies.some((ply) => ply > anchorPly);
  }, [activeMoment, criticalPlies, currentPly, mode]);

  const jumpToNextCriticalPly = useCallback(() => {
    if (criticalPlies.length === 0) {
      return;
    }
    const anchorPly =
      fastForwardTargetPlyRef.current ??
      (mode === "moments" && activeMoment ? activeMoment.ply : currentPly);
    const nextPly = criticalPlies.find((ply) => ply > anchorPly);
    if (nextPly === undefined) {
      return;
    }
    const matchingMomentIndex = keyMoments.findIndex((item) => item.ply === nextPly);
    animateToPly(nextPly, () => {
      if (matchingMomentIndex >= 0) {
        setActiveMomentIndex(matchingMomentIndex);
      }
      setModeState("moves");
    });
  }, [activeMoment, animateToPly, criticalPlies, currentPly, keyMoments, mode]);

  const jumpToPrevCriticalPly = useCallback(() => {
    if (criticalPlies.length === 0) {
      return;
    }
    const anchorPly =
      fastForwardTargetPlyRef.current ??
      (mode === "moments" && activeMoment ? activeMoment.ply : currentPly);
    let prevPly: number | undefined;
    for (let index = criticalPlies.length - 1; index >= 0; index -= 1) {
      if (criticalPlies[index]! < anchorPly) {
        prevPly = criticalPlies[index];
        break;
      }
    }
    const targetPly = prevPly ?? criticalPlies[criticalPlies.length - 1]!;
    const matchingMomentIndex = keyMoments.findIndex((item) => item.ply === targetPly);
    animateToPly(targetPly, () => {
      if (matchingMomentIndex >= 0) {
        setActiveMomentIndex(matchingMomentIndex);
      }
      setModeState("moves");
    });
  }, [activeMoment, animateToPly, criticalPlies, currentPly, keyMoments, mode]);

  const evalGraphPoints = useMemo(
    () => buildEvalGraphPoints(parsedGame, plyEvaluations, keyMoments),
    [keyMoments, parsedGame, plyEvaluations]
  );

  const summary = useMemo(
    () => buildGameReviewSummary(game, plyEvaluations, userPuzzles),
    [game, plyEvaluations, userPuzzles]
  );

  return {
    game,
    parsedGame,
    parseError,
    analysisStatus,
    scanPhase,
    scanProgress: {
      completedPlies: plyEvaluations.length,
      totalPlies
    },
    scanError,
    plyEvaluations,
    evalByPly,
    evalGraphPoints,
    currentPly,
    currentPlyEval,
    currentFen,
    currentScore,
    currentWhiteWinPercent,
    currentLastMoveUci,
    criticalPlies,
    hasNextCritical,
    flipped,
    mode,
    keyMoments,
    activeMomentIndex: clampedMomentIndex,
    activeMoment,
    activeRetryState,
    retryStatesByMomentId,
    boardArrows,
    arrowDuelCandidates,
    isPromptHidingAnswer,
    userPuzzles,
    enrolledPuzzleIds,
    summary,
    freeAnalysisOpen,
    freeAnalysisLoading,
    freeAnalysisLines,
    freeAnalysisError,
    showEngineArrows,
    whyOpen,
    whyLoading,
    whyBaseFen,
    whyMoves,
    whyStep,
    whyAutoPlaying,
    whyError,
    isExploringOffLine,
    explorationPliesCount: explorationMoves.length,
    isFastForwarding,
    setMode,
    selectPly,
    stepFirst,
    stepPrev,
    stepNext,
    stepLast,
    jumpToPrevCriticalPly,
    jumpToNextCriticalPly,
    toggleFlip,
    selectKeyMoment,
    prevKeyMoment,
    nextKeyMoment,
    skipActiveKeyMoment,
    retryActiveKeyMoment,
    submitBoardMove,
    selectArrowDuelCandidate,
    toggleRefutationPlayback,
    stepRefutationForward,
    stepRefutationBackward,
    togglePuzzleReviewEnrollment,
    enrollAllPuzzlesInReview,
    toggleFreeAnalysis,
    toggleShowEngineArrows,
    toggleWhyRefutation,
    closeWhyRefutation,
    selectWhyStep,
    toggleWhyAutoPlay,
    stepWhyBackward,
    stepWhyForward,
    playEngineLineMove,
    returnToGameLine,
    resumeAnalysis
  };
}
