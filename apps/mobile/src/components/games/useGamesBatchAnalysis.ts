import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  EngineSearchAbortedError,
  runFullGameReviewPipeline,
  type EvaluateGamePass1Options,
  type ExtractGamePuzzlesOptions,
  type GamePlyEvaluation,
  type GameReviewEngine,
  type ManagedHumanPolicyModel,
  type PuzzleExtractionEngine
} from "../../../../../packages/core/src/index.ts";
import { createNativeHumanPolicyModel } from "../../platform/nativeHumanPolicy.ts";
import {
  createNativeBackgroundBatchAnalysisBridge,
  INACTIVE_BACKGROUND_BATCH_RESULT,
  type BackgroundBatchAnalysisBridge,
  type BackgroundBatchAnalysisMode
} from "../../platform/backgroundBatchAnalysis.ts";
import { getActiveLocale, translate } from "../../i18n/index.ts";
import type { PracticeService } from "../../../../../packages/storage/src/practice-service.ts";
import { autoEnrollRecommendedPuzzlesForGame } from "./autoEnrollRecommended.ts";
import {
  gamePlyEvaluationFromStored,
  inferUserGameMetaFromStoredGame,
  storedGamePlyEvalFromEvaluation,
  type GameReviewStore,
  type StoredImportedGame
} from "../../../../../packages/storage/src/game-review-store.ts";

export type GamesBatchAnalysisStatus = "idle" | "running" | "paused" | "completed" | "error";

export interface GamesBatchAnalysisState {
  status: GamesBatchAnalysisStatus;
  currentIndex: number;
  totalGames: number;
  currentGameId: string | null;
  currentPly: number;
  totalPlies: number;
  completedGames: number;
  generatedPuzzles: number;
  errorMessage: string | null;
  pausedByBackground: boolean;
  pausedByInteractiveEngine?: boolean;
}

export const INITIAL_GAMES_BATCH_STATE: GamesBatchAnalysisState = {
  status: "idle",
  currentIndex: 0,
  totalGames: 0,
  currentGameId: null,
  currentPly: 0,
  totalPlies: 0,
  completedGames: 0,
  generatedPuzzles: 0,
  errorMessage: null,
  pausedByBackground: false,
  pausedByInteractiveEngine: false
};

export interface UseGamesBatchAnalysisOptions {
  store: GameReviewStore;
  practiceService?: PracticeService;
  getEngine: () => (GameReviewEngine & PuzzleExtractionEngine) | null;
  humanPolicy?: ManagedHumanPolicyModel | null;
  onGameUpdated?: () => void;
  pass1Options?: Omit<EvaluateGamePass1Options, "initialEvaluations" | "onPlyEvaluated" | "signal">;
  extractionOptions?: Omit<ExtractGamePuzzlesOptions, "signal">;
  initialState?: GamesBatchAnalysisState;
  /** When true (e.g. interactive Stockfish analysis or single-game review is active), pauses batch and auto-resumes when false. */
  suspended?: boolean;
  /** When true, disables internal listeners (used when an external batch controller is injected). */
  disabled?: boolean;
  /** Optional platform bridge for Android Foreground Service / iOS BGContinuedProcessingTask & beginBackgroundTask. */
  backgroundBridge?: BackgroundBatchAnalysisBridge | null;
}

export interface GamesBatchAnalysisController {
  state: GamesBatchAnalysisState;
  startBatch: (games: readonly StoredImportedGame[]) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  dismiss: () => void;
}

const DEFAULT_MOBILE_BATCH_PASS1_LIMIT = {
  depth: 10,
  nodes: 40_000
} as const;

const DEFAULT_MOBILE_BATCH_PASS2_DEEP_LIMIT = {
  depth: 16,
  nodes: 250_000
} as const;

type PauseReason = "none" | "user" | "background" | "lock" | "interactive" | "cancel";

export function useGamesBatchAnalysis({
  store,
  practiceService,
  getEngine,
  humanPolicy,
  onGameUpdated,
  pass1Options,
  extractionOptions,
  initialState = INITIAL_GAMES_BATCH_STATE,
  suspended = false,
  disabled = false,
  backgroundBridge
}: UseGamesBatchAnalysisOptions): GamesBatchAnalysisController {
  const [state, setState] = useState<GamesBatchAnalysisState>(initialState);

  const queueRef = useRef<StoredImportedGame[]>([]);
  const nextIndexRef = useRef(0);
  const completedGamesRef = useRef(0);
  const generatedPuzzlesRef = useRef(0);
  const runningRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pauseReasonRef = useRef<PauseReason>("none");
  const pausedByBackgroundRef = useRef(Boolean(initialState.pausedByBackground));
  const pausedByLockRef = useRef(false);
  const pausedByInteractiveRef = useRef(Boolean(initialState.pausedByInteractiveEngine));
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const mountedRef = useRef(true);
  const runGenerationRef = useRef(0);
  const defaultHumanPolicyRef = useRef<ManagedHumanPolicyModel | null | undefined>(undefined);
  const humanPolicyPropRef = useRef(humanPolicy);
  humanPolicyPropRef.current = humanPolicy;
  const defaultBackgroundBridgeRef = useRef<BackgroundBatchAnalysisBridge | null | undefined>(
    undefined
  );
  const backgroundBridgePropRef = useRef(backgroundBridge);
  backgroundBridgePropRef.current = backgroundBridge;
  const backgroundSessionActiveRef = useRef(false);
  const supportsContinuedBackgroundRef = useRef(false);
  const backgroundModeRef = useRef<BackgroundBatchAnalysisMode>("none");
  const lastProgressPushUnitsRef = useRef(-1);
  const lastProgressPushAtMsRef = useRef(0);

  const resolveBackgroundBridge = useCallback((): BackgroundBatchAnalysisBridge | null => {
    if (backgroundBridgePropRef.current !== undefined) {
      return backgroundBridgePropRef.current;
    }
    if (defaultBackgroundBridgeRef.current === undefined) {
      defaultBackgroundBridgeRef.current = createNativeBackgroundBatchAnalysisBridge();
    }
    return defaultBackgroundBridgeRef.current;
  }, []);

  const resetBackgroundSessionFlags = useCallback((): void => {
    backgroundSessionActiveRef.current = false;
    supportsContinuedBackgroundRef.current = false;
    backgroundModeRef.current = "none";
    lastProgressPushUnitsRef.current = -1;
    lastProgressPushAtMsRef.current = 0;
  }, []);

  const formatAnalyzingSubtitle = useCallback(
    (current: number, total: number, currentPly = 0, totalPlies = 0): string => {
      const locale = getActiveLocale();
      if (totalPlies > 0) {
        return translate(locale, "games.batch.analyzingWithMove", {
          current,
          total,
          ply: currentPly,
          totalPlies
        });
      }
      return translate(locale, "games.batch.analyzing", {
        current,
        total
      });
    },
    []
  );

  const startBackgroundSession = useCallback(
    (totalGames: number, currentIndex: number, generation: number): void => {
      const bridge = resolveBackgroundBridge();
      if (!bridge) {
        resetBackgroundSessionFlags();
        return;
      }
      const locale = getActiveLocale();
      lastProgressPushUnitsRef.current = -1;
      lastProgressPushAtMsRef.current = 0;
      void bridge
        .start({
          title: "Chessticize",
          subtitle: formatAnalyzingSubtitle(Math.max(1, currentIndex), Math.max(1, totalGames)),
          pausedSubtitle: translate(locale, "games.batch.pausedWhileLocked"),
          totalUnits: Math.max(1, totalGames) * 100,
          pauseLabel: translate(locale, "common.pause"),
          cancelLabel: translate(locale, "common.cancel")
        })
        .then((result) => {
          const normalized = result ?? INACTIVE_BACKGROUND_BATCH_RESULT;
          if (
            !mountedRef.current ||
            generation !== runGenerationRef.current ||
            (!runningRef.current && !pausedByLockRef.current)
          ) {
            if (normalized.active) {
              void bridge.stop();
            }
            return;
          }
          backgroundSessionActiveRef.current = normalized.active;
          supportsContinuedBackgroundRef.current = normalized.supportsContinuedBackground;
          backgroundModeRef.current = normalized.mode;
        })
        .catch(() => {
          resetBackgroundSessionFlags();
        });
    },
    [formatAnalyzingSubtitle, resetBackgroundSessionFlags, resolveBackgroundBridge]
  );

  const pushBackgroundProgress = useCallback(
    (
      currentIndex: number,
      totalGames: number,
      completedGames: number,
      currentPly: number,
      totalPlies: number,
      force = false
    ): void => {
      const bridge = resolveBackgroundBridge();
      if (!bridge || !backgroundSessionActiveRef.current) {
        return;
      }
      const safeTotalGames = Math.max(1, totalGames);
      const totalUnits = safeTotalGames * 100;
      const inGameUnits =
        totalPlies > 0 ? Math.min(99, Math.floor((currentPly / totalPlies) * 100)) : 0;
      const completedUnits = Math.min(totalUnits, completedGames * 100 + inGameUnits);
      const nowMs = Date.now();
      if (
        !force &&
        Math.abs(completedUnits - lastProgressPushUnitsRef.current) < 2 &&
        nowMs - lastProgressPushAtMsRef.current < 500
      ) {
        return;
      }
      lastProgressPushUnitsRef.current = completedUnits;
      lastProgressPushAtMsRef.current = nowMs;
      void bridge.updateProgress({
        title: "Chessticize",
        subtitle: formatAnalyzingSubtitle(currentIndex, safeTotalGames, currentPly, totalPlies),
        completedUnits,
        totalUnits
      });
    },
    [formatAnalyzingSubtitle, resolveBackgroundBridge]
  );

  const stopBackgroundSession = useCallback((): void => {
    const bridge = resolveBackgroundBridge();
    const wasActive = backgroundSessionActiveRef.current;
    resetBackgroundSessionFlags();
    if (bridge && wasActive) {
      void bridge.stop();
    }
  }, [resetBackgroundSessionFlags, resolveBackgroundBridge]);

  const finishBackgroundSession = useCallback(
    (completedGames: number, generatedPuzzles: number): void => {
      const bridge = resolveBackgroundBridge();
      const wasActive = backgroundSessionActiveRef.current;
      resetBackgroundSessionFlags();
      if (!bridge || !wasActive) {
        return;
      }
      const locale = getActiveLocale();
      const body = translate(locale, "games.batch.completed", {
        games: translate(locale, "games.batch.gamesCount", { count: completedGames }),
        puzzles: translate(locale, "common.puzzlesCount", { count: generatedPuzzles })
      });
      void bridge.finish({
        title: "Chessticize",
        body,
        notifyIfBackgrounded: true
      });
    },
    [resetBackgroundSessionFlags, resolveBackgroundBridge]
  );

  const resolveHumanPolicy = useCallback((): ManagedHumanPolicyModel | null => {
    if (humanPolicyPropRef.current !== undefined) {
      return humanPolicyPropRef.current;
    }
    if (defaultHumanPolicyRef.current === undefined) {
      defaultHumanPolicyRef.current = createNativeHumanPolicyModel();
    }
    return defaultHumanPolicyRef.current;
  }, []);

  const onGameUpdatedRef = useRef(onGameUpdated);
  onGameUpdatedRef.current = onGameUpdated;
  const getEngineRef = useRef(getEngine);
  getEngineRef.current = getEngine;
  const pass1OptionsRef = useRef(pass1Options);
  pass1OptionsRef.current = pass1Options;
  const extractionOptionsRef = useRef(extractionOptions);
  extractionOptionsRef.current = extractionOptions;

  const persistPartialCheckpoint = useCallback(
    (gameId: string, evaluations: readonly GamePlyEvaluation[]): void => {
      if (evaluations.length === 0) {
        return;
      }
      const sorted = [...evaluations].sort((left, right) => left.ply - right.ply);
      const checkpointPly = sorted[sorted.length - 1]?.ply ?? 0;
      store.saveGamePlyEvaluations(
        gameId,
        sorted.map((item) => storedGamePlyEvalFromEvaluation(gameId, item, false)),
        {
          analysisStatus: "partial",
          analysisCheckpointPly: checkpointPly
        }
      );
      onGameUpdatedRef.current?.();
    },
    [store]
  );

  const runQueue = useCallback(async (generation: number): Promise<void> => {
    const engine = getEngineRef.current();
    if (!engine) {
      runningRef.current = false;
      stopBackgroundSession();
      if (mountedRef.current) {
        setState((current) => ({
          ...current,
          status: "error",
          errorMessage: "engine_unavailable"
        }));
      }
      return;
    }

    if (!backgroundSessionActiveRef.current) {
      startBackgroundSession(queueRef.current.length, nextIndexRef.current + 1, generation);
    }

    while (nextIndexRef.current < queueRef.current.length) {
      if (!mountedRef.current || generation !== runGenerationRef.current) {
        return;
      }
      if (pauseReasonRef.current !== "none") {
        break;
      }

      const index = nextIndexRef.current;
      const queuedGame = queueRef.current[index];
      if (!queuedGame) {
        break;
      }
      const latestGame = store.getImportedGame(queuedGame.id) ?? queuedGame;
      const existingStored = store.listGamePlyEvaluations(latestGame.id);
      const initialEvaluations = existingStored.map(gamePlyEvaluationFromStored);

      const evaluatedByPly = new Map<number, GamePlyEvaluation>();
      for (const item of initialEvaluations) {
        evaluatedByPly.set(item.ply, item);
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (mountedRef.current) {
        setState({
          status: "running",
          currentIndex: index + 1,
          totalGames: queueRef.current.length,
          currentGameId: latestGame.id,
          currentPly: initialEvaluations.length,
          totalPlies: 0,
          completedGames: completedGamesRef.current,
          generatedPuzzles: generatedPuzzlesRef.current,
          errorMessage: null,
          pausedByBackground: false
        });
      }
      pushBackgroundProgress(
        index + 1,
        queueRef.current.length,
        completedGamesRef.current,
        initialEvaluations.length,
        0,
        true
      );

      try {
        const userRating =
          latestGame.userColor === "w" ? latestGame.white.rating : latestGame.black.rating;
        const result = await runFullGameReviewPipeline({
          gameId: latestGame.id,
          pgn: latestGame.pgn,
          userColor: latestGame.userColor,
          engine,
          timeControl: latestGame.timeControl,
          ...(userRating !== undefined && Number.isFinite(userRating) ? { userRating } : {}),
          pass1Options: {
            priority: "batch",
            depth: DEFAULT_MOBILE_BATCH_PASS1_LIMIT.depth,
            nodes: DEFAULT_MOBILE_BATCH_PASS1_LIMIT.nodes,
            ...pass1OptionsRef.current,
            initialEvaluations,
            signal: controller.signal,
            onPlyEvaluated: (plyEval, progress) => {
              evaluatedByPly.set(plyEval.ply, plyEval);
              if (mountedRef.current && generation === runGenerationRef.current) {
                setState((current) => ({
                  ...current,
                  currentPly: progress.completedPlies,
                  totalPlies: progress.totalPlies
                }));
                pushBackgroundProgress(
                  index + 1,
                  queueRef.current.length,
                  completedGamesRef.current,
                  progress.completedPlies,
                  progress.totalPlies,
                  false
                );
              }
            }
          },
          extractionOptions: {
            deepLimit: DEFAULT_MOBILE_BATCH_PASS2_DEEP_LIMIT,
            ...extractionOptionsRef.current,
            ...(extractionOptionsRef.current?.humanPolicy === undefined && resolveHumanPolicy()
              ? { humanPolicy: resolveHumanPolicy()! }
              : {}),
            signal: controller.signal
          },
          onPass1Complete: (report) => {
            if (report.plies.length === 0) {
              return;
            }
            store.saveGamePlyEvaluations(
              latestGame.id,
              report.plies.map((item) => storedGamePlyEvalFromEvaluation(latestGame.id, item, false)),
              {
                analysisStatus: report.isComplete ? "pass1_done" : "partial",
                analysisCheckpointPly: report.checkpointPly,
                ...(report.isComplete
                  ? {
                      whiteAccuracy: report.whiteAccuracy,
                      blackAccuracy: report.blackAccuracy
                    }
                  : {})
              }
            );
            onGameUpdatedRef.current?.();
          }
        });

        abortControllerRef.current = null;

        if (!mountedRef.current || generation !== runGenerationRef.current) {
          return;
        }

        if (pauseReasonRef.current !== "none" || controller.signal.aborted || !result.report.isComplete) {
          const toSave = result.report.plies.length > 0
            ? result.report.plies
            : [...evaluatedByPly.values()];
          persistPartialCheckpoint(latestGame.id, toSave);
          break;
        }

        const puzzlePlySet = new Set(result.puzzles.map((puzzle) => puzzle.ply));
        store.saveGamePlyEvaluations(
          latestGame.id,
          result.report.plies.map((item) =>
            storedGamePlyEvalFromEvaluation(latestGame.id, item, puzzlePlySet.has(item.ply))
          ),
          {
            analysisStatus: "complete",
            analysisCheckpointPly: result.report.checkpointPly,
            whiteAccuracy: result.report.whiteAccuracy,
            blackAccuracy: result.report.blackAccuracy
          }
        );

        const storedPuzzles = store.replaceGameUserPuzzles(
          latestGame.id,
          result.puzzles,
          inferUserGameMetaFromStoredGame(latestGame, {})
        );
        autoEnrollRecommendedPuzzlesForGame(practiceService, latestGame.id);

        completedGamesRef.current += 1;
        generatedPuzzlesRef.current += storedPuzzles.length;
        nextIndexRef.current = index + 1;
        pushBackgroundProgress(
          index + 1,
          queueRef.current.length,
          completedGamesRef.current,
          1,
          1,
          true
        );
        onGameUpdatedRef.current?.();
      } catch (error) {
        abortControllerRef.current = null;
        if (!mountedRef.current || generation !== runGenerationRef.current) {
          return;
        }

        persistPartialCheckpoint(latestGame.id, [...evaluatedByPly.values()]);

        const isAbort =
          pauseReasonRef.current !== "none" ||
          controller.signal.aborted ||
          error instanceof EngineSearchAbortedError ||
          (error instanceof Error && error.name === "AbortError");
        if (isAbort) {
          break;
        }

        runningRef.current = false;
        stopBackgroundSession();
        void resolveHumanPolicy()?.unload();
        setState({
          status: "error",
          currentIndex: index + 1,
          totalGames: queueRef.current.length,
          currentGameId: latestGame.id,
          currentPly: evaluatedByPly.size,
          totalPlies: 0,
          completedGames: completedGamesRef.current,
          generatedPuzzles: generatedPuzzlesRef.current,
          errorMessage: error instanceof Error ? error.message : "engine_error",
          pausedByBackground: false
        });
        return;
      }
    }

    if (!mountedRef.current || generation !== runGenerationRef.current) {
      return;
    }

    runningRef.current = false;
    abortControllerRef.current = null;
    void resolveHumanPolicy()?.unload();

    if (pauseReasonRef.current === "cancel") {
      stopBackgroundSession();
      queueRef.current = [];
      nextIndexRef.current = 0;
      pauseReasonRef.current = "none";
      pausedByBackgroundRef.current = false;
      pausedByInteractiveRef.current = false;
      setState(INITIAL_GAMES_BATCH_STATE);
      return;
    }

    if (pauseReasonRef.current === "lock") {
      // Keep the native BGContinuedProcessingTask alive (paused, NOT marked Done/failed)
      // so unlocking the device resumes analysis immediately even while staying in background.
      pausedByLockRef.current = true;
      pausedByBackgroundRef.current = true;
      pausedByInteractiveRef.current = false;
      pauseReasonRef.current = "none";
      setState((current) => ({
        ...current,
        status: "paused",
        completedGames: completedGamesRef.current,
        generatedPuzzles: generatedPuzzlesRef.current,
        pausedByBackground: true,
        pausedByInteractiveEngine: false
      }));
      return;
    }

    if (
      pauseReasonRef.current === "user" ||
      pauseReasonRef.current === "background" ||
      pauseReasonRef.current === "interactive"
    ) {
      stopBackgroundSession();
      const pausedByBackground = pauseReasonRef.current === "background";
      const pausedByInteractiveEngine = pauseReasonRef.current === "interactive";
      pausedByLockRef.current = false;
      pausedByBackgroundRef.current = pausedByBackground;
      pausedByInteractiveRef.current = pausedByInteractiveEngine;
      pauseReasonRef.current = "none";
      setState((current) => ({
        ...current,
        status: "paused",
        completedGames: completedGamesRef.current,
        generatedPuzzles: generatedPuzzlesRef.current,
        pausedByBackground,
        pausedByInteractiveEngine
      }));
      return;
    }

    pausedByLockRef.current = false;
    pausedByBackgroundRef.current = false;
    pausedByInteractiveRef.current = false;
    finishBackgroundSession(completedGamesRef.current, generatedPuzzlesRef.current);
    setState({
      status: "completed",
      currentIndex: queueRef.current.length,
      totalGames: queueRef.current.length,
      currentGameId: null,
      currentPly: 0,
      totalPlies: 0,
      completedGames: completedGamesRef.current,
      generatedPuzzles: generatedPuzzlesRef.current,
      errorMessage: null,
      pausedByBackground: false,
      pausedByInteractiveEngine: false
    });
  }, [
    finishBackgroundSession,
    persistPartialCheckpoint,
    practiceService,
    pushBackgroundProgress,
    resolveHumanPolicy,
    startBackgroundSession,
    stopBackgroundSession,
    store
  ]);

  const requestPause = useCallback(
    (reason: "user" | "background" | "lock" | "interactive"): void => {
      if (!runningRef.current) {
        return;
      }
      pauseReasonRef.current = reason;
      abortControllerRef.current?.abort();
    },
    []
  );

  const startBatch = useCallback(
    (games: readonly StoredImportedGame[]): void => {
      const targets = games.filter((game) => game.analysisStatus !== "complete");
      if (targets.length === 0) {
        return;
      }
      abortControllerRef.current?.abort();
      stopBackgroundSession();
      runGenerationRef.current += 1;
      queueRef.current = [...targets];
      nextIndexRef.current = 0;
      completedGamesRef.current = 0;
      generatedPuzzlesRef.current = 0;
      pauseReasonRef.current = "none";
      pausedByLockRef.current = false;
      pausedByBackgroundRef.current = false;
      pausedByInteractiveRef.current = false;
      runningRef.current = true;
      void runQueue(runGenerationRef.current);
    },
    [runQueue, stopBackgroundSession]
  );

  const pause = useCallback((): void => {
    pausedByLockRef.current = false;
    pausedByBackgroundRef.current = false;
    pausedByInteractiveRef.current = false;
    if (runningRef.current) {
      requestPause("user");
      return;
    }
    stopBackgroundSession();
  }, [requestPause, stopBackgroundSession]);

  const resume = useCallback((): void => {
    if (runningRef.current || nextIndexRef.current >= queueRef.current.length) {
      return;
    }
    runGenerationRef.current += 1;
    pauseReasonRef.current = "none";
    pausedByLockRef.current = false;
    pausedByBackgroundRef.current = false;
    pausedByInteractiveRef.current = false;
    runningRef.current = true;
    void runQueue(runGenerationRef.current);
  }, [runQueue]);

  const cancel = useCallback((): void => {
    pausedByLockRef.current = false;
    pausedByBackgroundRef.current = false;
    pausedByInteractiveRef.current = false;
    if (runningRef.current) {
      pauseReasonRef.current = "cancel";
      abortControllerRef.current?.abort();
      return;
    }
    stopBackgroundSession();
    queueRef.current = [];
    nextIndexRef.current = 0;
    pauseReasonRef.current = "none";
    setState(INITIAL_GAMES_BATCH_STATE);
  }, [stopBackgroundSession]);

  const dismiss = useCallback((): void => {
    if (runningRef.current) {
      return;
    }
    stopBackgroundSession();
    queueRef.current = [];
    nextIndexRef.current = 0;
    pausedByLockRef.current = false;
    pausedByBackgroundRef.current = false;
    pausedByInteractiveRef.current = false;
    setState(INITIAL_GAMES_BATCH_STATE);
  }, [stopBackgroundSession]);

  useEffect(() => {
    if (disabled) {
      return;
    }
    const bridge = resolveBackgroundBridge();
    if (!bridge) {
      return;
    }
    return bridge.subscribe((event) => {
      if (event.type === "pause_requested") {
        pause();
      } else if (event.type === "cancel_requested") {
        cancel();
      } else if (event.type === "lock_paused") {
        pausedByLockRef.current = true;
        requestPause("lock");
      } else if (event.type === "unlock_resumed") {
        pausedByLockRef.current = false;
        if (pausedByBackgroundRef.current && !runningRef.current && !suspendedRef.current) {
          resume();
        }
      } else if (event.type === "expiration_warning") {
        pausedByLockRef.current = false;
        if (runningRef.current) {
          requestPause("background");
        } else {
          stopBackgroundSession();
        }
      }
    });
  }, [cancel, disabled, pause, requestPause, resolveBackgroundBridge, resume, stopBackgroundSession]);

  useEffect(() => {
    if (disabled) {
      return;
    }
    if (suspended) {
      if (runningRef.current) {
        requestPause("interactive");
      }
      return;
    }
    if (pausedByInteractiveRef.current && !pausedByBackgroundRef.current) {
      resume();
    }
  }, [disabled, requestPause, resume, suspended]);

  useEffect(() => {
    if (disabled) {
      return;
    }
    const handleAppStateChange = (nextAppState: AppStateStatus): void => {
      if (nextAppState === "background" && runningRef.current) {
        // Keep running when switching apps if Android Foreground Service, iOS 26+
        // BGContinuedProcessingTask, or iOS Tier-1 beginBackgroundTask is active.
        // Screen lock (iOS protectedDataWillBecomeUnavailable) or OS expiration emits
        // expiration_warning so the batch pauses cleanly and auto-resumes on return.
        if (!backgroundSessionActiveRef.current) {
          requestPause("background");
        }
      } else if (
        nextAppState === "active" &&
        pausedByBackgroundRef.current &&
        !suspendedRef.current
      ) {
        resume();
      }
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [disabled, requestPause, resume]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pauseReasonRef.current = "cancel";
      abortControllerRef.current?.abort();
      runningRef.current = false;
      stopBackgroundSession();
      void defaultHumanPolicyRef.current?.unload();
    };
  }, [stopBackgroundSession]);

  return {
    state,
    startBatch,
    pause,
    resume,
    cancel,
    dismiss
  };
}
