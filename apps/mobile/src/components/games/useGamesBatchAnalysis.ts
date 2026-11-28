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
  pausedByBackground: false
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

type PauseReason = "none" | "user" | "background" | "cancel";

export function useGamesBatchAnalysis({
  store,
  practiceService,
  getEngine,
  humanPolicy,
  onGameUpdated,
  pass1Options,
  extractionOptions,
  initialState = INITIAL_GAMES_BATCH_STATE
}: UseGamesBatchAnalysisOptions): GamesBatchAnalysisController {
  const [state, setState] = useState<GamesBatchAnalysisState>(initialState);

  const queueRef = useRef<StoredImportedGame[]>([]);
  const nextIndexRef = useRef(0);
  const completedGamesRef = useRef(0);
  const generatedPuzzlesRef = useRef(0);
  const runningRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pauseReasonRef = useRef<PauseReason>("none");
  const mountedRef = useRef(true);
  const runGenerationRef = useRef(0);
  const defaultHumanPolicyRef = useRef<ManagedHumanPolicyModel | null | undefined>(undefined);
  const humanPolicyPropRef = useRef(humanPolicy);
  humanPolicyPropRef.current = humanPolicy;

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
      if (mountedRef.current) {
        setState((current) => ({
          ...current,
          status: "error",
          errorMessage: "engine_unavailable"
        }));
      }
      return;
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
      queueRef.current = [];
      nextIndexRef.current = 0;
      pauseReasonRef.current = "none";
      setState(INITIAL_GAMES_BATCH_STATE);
      return;
    }

    if (pauseReasonRef.current === "user" || pauseReasonRef.current === "background") {
      const pausedByBackground = pauseReasonRef.current === "background";
      pauseReasonRef.current = "none";
      setState((current) => ({
        ...current,
        status: "paused",
        completedGames: completedGamesRef.current,
        generatedPuzzles: generatedPuzzlesRef.current,
        pausedByBackground
      }));
      return;
    }

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
      pausedByBackground: false
    });
  }, [persistPartialCheckpoint, practiceService, resolveHumanPolicy, store]);

  const requestPause = useCallback((reason: "user" | "background"): void => {
    if (!runningRef.current) {
      return;
    }
    pauseReasonRef.current = reason;
    abortControllerRef.current?.abort();
  }, []);

  const startBatch = useCallback(
    (games: readonly StoredImportedGame[]): void => {
      const targets = games.filter((game) => game.analysisStatus !== "complete");
      if (targets.length === 0) {
        return;
      }
      abortControllerRef.current?.abort();
      runGenerationRef.current += 1;
      queueRef.current = [...targets];
      nextIndexRef.current = 0;
      completedGamesRef.current = 0;
      generatedPuzzlesRef.current = 0;
      pauseReasonRef.current = "none";
      runningRef.current = true;
      void runQueue(runGenerationRef.current);
    },
    [runQueue]
  );

  const pause = useCallback((): void => {
    requestPause("user");
  }, [requestPause]);

  const resume = useCallback((): void => {
    if (runningRef.current || nextIndexRef.current >= queueRef.current.length) {
      return;
    }
    runGenerationRef.current += 1;
    pauseReasonRef.current = "none";
    runningRef.current = true;
    void runQueue(runGenerationRef.current);
  }, [runQueue]);

  const cancel = useCallback((): void => {
    if (runningRef.current) {
      pauseReasonRef.current = "cancel";
      abortControllerRef.current?.abort();
      return;
    }
    queueRef.current = [];
    nextIndexRef.current = 0;
    pauseReasonRef.current = "none";
    setState(INITIAL_GAMES_BATCH_STATE);
  }, []);

  const dismiss = useCallback((): void => {
    if (runningRef.current) {
      return;
    }
    queueRef.current = [];
    nextIndexRef.current = 0;
    setState(INITIAL_GAMES_BATCH_STATE);
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus): void => {
      if (nextAppState === "background" && runningRef.current) {
        requestPause("background");
      }
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [requestPause]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pauseReasonRef.current = "cancel";
      abortControllerRef.current?.abort();
      runningRef.current = false;
      void defaultHumanPolicyRef.current?.unload();
    };
  }, []);

  return {
    state,
    startBatch,
    pause,
    resume,
    cancel,
    dismiss
  };
}
