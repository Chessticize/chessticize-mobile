import React from "react";
import { AppState, NativeModules, Platform, type AppStateStatus } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import {
  BACKGROUND_BATCH_ANALYSIS_EVENT,
  createNativeBackgroundBatchAnalysisBridge,
  FakeBackgroundBatchAnalysisBridge
} from "../src/platform/backgroundBatchAnalysis.ts";
import { useGamesBatchAnalysis } from "../src/components/games/useGamesBatchAnalysis.ts";
import { MemoryStore, PracticeService } from "../../../packages/storage/src/index.ts";
import type { ImportedGameDraft } from "../../../packages/core/src/index.ts";

function makeSampleGame(id: string): ImportedGameDraft {
  return {
    id,
    platform: "lichess",
    username: "alice",
    userColor: "w",
    playedAt: "2026-11-26T12:00:00.000Z",
    timeControl: "600+0",
    timeClass: "rapid",
    rated: true,
    url: `https://lichess.org/${id.replace("lichess:", "")}`,
    white: { username: "alice", rating: 1500, isAi: false },
    black: { username: "bob", rating: 1500, isAi: false },
    winner: "w",
    termination: "mate",
    eco: "C20",
    opening: "King's Pawn Game",
    pgn: "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#"
  };
}

function createDeferredEngine() {
  let pendingResolve: (() => void) | null = null;
  let callCount = 0;

  const engine = {
    analyze: jest.fn(async (req: { signal?: AbortSignal }) => {
      callCount += 1;
      if (req.signal?.aborted) {
        const err = new Error("Aborted");
        err.name = "AbortError";
        throw err;
      }
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          pendingResolve = null;
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        };
        req.signal?.addEventListener("abort", onAbort, { once: true });
        pendingResolve = () => {
          req.signal?.removeEventListener("abort", onAbort);
          pendingResolve = null;
          resolve();
        };
      });
      return [
        {
          multipv: 1,
          depth: 10,
          score: { kind: "cp" as const, value: 30 },
          pv: ["e2e4"]
        }
      ];
    })
  };

  return {
    engine,
    getCallCount: () => callCount,
    stepOne: async () => {
      await act(async () => {
        pendingResolve?.();
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    drainAll: async () => {
      for (let i = 0; i < 40; i += 1) {
        if (!pendingResolve) {
          await act(async () => {
            await Promise.resolve();
          });
          if (!pendingResolve) break;
        }
        await act(async () => {
          pendingResolve?.();
          await Promise.resolve();
          await Promise.resolve();
        });
      }
    }
  };
}

describe("BackgroundBatchAnalysis native bridge", () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    delete (NativeModules as Record<string, unknown>).BackgroundBatchAnalysis;
    Object.defineProperty(Platform, "OS", { value: originalPlatform, configurable: true });
  });

  it("returns null when native module is absent", () => {
    expect(createNativeBackgroundBatchAnalysisBridge()).toBeNull();
  });

  it("wraps native start, updateProgress, finish, stop, and falls back safely on rejection", async () => {
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    const start = jest.fn(async () => ({
      active: true,
      supportsContinuedBackground: true,
      mode: "foreground_service"
    }));
    const updateProgress = jest.fn(async () => undefined);
    const finish = jest.fn(async () => undefined);
    const stop = jest.fn(async () => undefined);
    (NativeModules as Record<string, unknown>).BackgroundBatchAnalysis = {
      start,
      updateProgress,
      finish,
      stop,
      addListener: jest.fn(),
      removeListeners: jest.fn()
    };

    const bridge = createNativeBackgroundBatchAnalysisBridge();
    expect(bridge).not.toBeNull();

    const started = await bridge!.start({
      title: "Chessticize",
      subtitle: "Analyzing 1 of 5",
      totalUnits: 500,
      pauseLabel: "Pause",
      cancelLabel: "Cancel"
    });
    expect(started).toEqual({
      active: true,
      supportsContinuedBackground: true,
      mode: "foreground_service"
    });

    await bridge!.updateProgress({
      title: "Chessticize",
      subtitle: "Analyzing 1 of 5 · Move 4/40",
      completedUnits: 10,
      totalUnits: 500
    });
    expect(updateProgress).toHaveBeenCalledTimes(1);

    await bridge!.finish({
      title: "Chessticize",
      body: "Analyzed 5 games · 3 puzzles",
      notifyIfBackgrounded: true
    });
    expect(finish).toHaveBeenCalledTimes(1);

    await bridge!.stop();
    expect(stop).toHaveBeenCalledTimes(1);

    // Rejecting native start degrades gracefully to inactive instead of throwing.
    start.mockRejectedValueOnce(new Error("ForegroundServiceStartNotAllowedException"));
    await expect(
      bridge!.start({
        title: "Chessticize",
        subtitle: "Analyzing 1 of 5",
        totalUnits: 500,
        pauseLabel: "Pause",
        cancelLabel: "Cancel"
      })
    ).resolves.toEqual({
      active: false,
      supportsContinuedBackground: false,
      mode: "none"
    });
    expect(BACKGROUND_BATCH_ANALYSIS_EVENT).toBe("BackgroundBatchAnalysisEvent");
  });
});

describe("useGamesBatchAnalysis out-of-app background execution", () => {
  let appStateListener: ((state: AppStateStatus) => void) | null = null;
  let addEventListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    appStateListener = null;
    addEventListenerSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_type, handler) => {
        appStateListener = handler as (state: AppStateStatus) => void;
        return { remove: jest.fn() } as never;
      });
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
  });

  function mountController(options: {
    store: MemoryStore;
    service: PracticeService;
    engine: ReturnType<typeof createDeferredEngine>["engine"];
    bridge: FakeBackgroundBatchAnalysisBridge | null;
    suspended?: boolean;
  }) {
    let controller!: ReturnType<typeof useGamesBatchAnalysis>;
    function Harness({ suspended = false }: { suspended?: boolean }) {
      controller = useGamesBatchAnalysis({
        store: options.store,
        practiceService: options.service,
        getEngine: () => options.engine as never,
        humanPolicy: null,
        backgroundBridge: options.bridge,
        suspended
      });
      return null;
    }
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Harness suspended={options.suspended ?? false} />);
    });
    return {
      get controller() {
        return controller;
      },
      setSuspended(next: boolean) {
        act(() => {
          renderer.update(<Harness suspended={next} />);
        });
      },
      unmount() {
        act(() => {
          renderer.unmount();
        });
      }
    };
  }

  it("Android Foreground Service / iOS 26 BGContinuedProcessingTask keeps running across AppState background and finishes with completion notification", async () => {
    const store = new MemoryStore();
    const service = new PracticeService(store);
    store.upsertImportedGames([makeSampleGame("lichess:bg1")]);
    const games = store.listImportedGames();
    const deferred = createDeferredEngine();
    const bridge = new FakeBackgroundBatchAnalysisBridge({
      active: true,
      supportsContinuedBackground: true,
      mode: "foreground_service"
    });

    const mounted = mountController({
      store,
      service,
      engine: deferred.engine,
      bridge
    });

    act(() => {
      mounted.controller.startBatch(games);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mounted.controller.state.status).toBe("running");
    expect(bridge.startCalls).toHaveLength(1);

    // Leaving the app MUST NOT pause while continued background execution is active!
    act(() => {
      appStateListener?.("background");
    });
    expect(mounted.controller.state.status).toBe("running");
    expect(mounted.controller.state.pausedByBackground).toBe(false);

    // Drain remaining plies while still backgrounded -> finishes and calls bridge.finish()
    await deferred.drainAll();
    expect(mounted.controller.state.status).toBe("completed");
    expect(bridge.finishCalls).toHaveLength(1);
    expect(bridge.finishCalls[0]?.notifyIfBackgrounded).toBe(true);
    expect(bridge.progressCalls.length).toBeGreaterThan(0);

    mounted.unmount();
  });

  it("iOS Tier 1 beginBackgroundTask stays running on background until OS expiration_warning, then checkpoints and auto-resumes on foreground", async () => {
    const store = new MemoryStore();
    const service = new PracticeService(store);
    store.upsertImportedGames([makeSampleGame("lichess:ios-t1")]);
    const games = store.listImportedGames();
    const deferred = createDeferredEngine();
    const bridge = new FakeBackgroundBatchAnalysisBridge({
      active: true,
      supportsContinuedBackground: false,
      mode: "ios_background_task"
    });

    const mounted = mountController({
      store,
      service,
      engine: deferred.engine,
      bridge
    });

    act(() => {
      mounted.controller.startBatch(games);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Going to background under Tier 1 keeps running inside beginBackgroundTask runway
    act(() => {
      appStateListener?.("background");
    });
    expect(mounted.controller.state.status).toBe("running");

    // Step 1 ply inside background runway
    await deferred.stepOne();
    expect(mounted.controller.state.status).toBe("running");

    // OS fires expiration_warning -> pauses cleanly with pausedByBackground = true & stops task
    await act(async () => {
      bridge.emit({ type: "expiration_warning" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.controller.state.status).toBe("paused");
    expect(mounted.controller.state.pausedByBackground).toBe(true);
    expect(bridge.stopCallCount).toBeGreaterThanOrEqual(1);

    // Returning to foreground auto-resumes!
    act(() => {
      appStateListener?.("active");
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.controller.state.status).toBe("running");
    expect(bridge.startCalls).toHaveLength(2);

    mounted.unmount();
  });

  it("handles notification Pause / Cancel events and still suspends immediately when interactive Stockfish opens", async () => {
    const store = new MemoryStore();
    const service = new PracticeService(store);
    store.upsertImportedGames([makeSampleGame("lichess:ctrl1")]);
    const games = store.listImportedGames();
    const deferred = createDeferredEngine();
    const bridge = new FakeBackgroundBatchAnalysisBridge({
      active: true,
      supportsContinuedBackground: true,
      mode: "ios_continued_processing"
    });

    const mounted = mountController({
      store,
      service,
      engine: deferred.engine,
      bridge
    });

    act(() => {
      mounted.controller.startBatch(games);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.controller.state.status).toBe("running");

    // Interactive Stockfish opened -> suspends immediately & stops background session
    mounted.setSuspended(true);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.controller.state.status).toBe("paused");
    expect(mounted.controller.state.pausedByInteractiveEngine).toBe(true);
    expect(bridge.stopCallCount).toBeGreaterThanOrEqual(1);

    // Interactive Stockfish closes -> auto-resumes
    mounted.setSuspended(false);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.controller.state.status).toBe("running");

    // Notification Pause button -> user pause (does not auto-resume on foreground)
    await act(async () => {
      bridge.emit({ type: "pause_requested" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.controller.state.status).toBe("paused");
    expect(mounted.controller.state.pausedByBackground).toBe(false);

    // Resume then Live Activity / Notification Cancel -> resets to idle
    act(() => {
      mounted.controller.resume();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      bridge.emit({ type: "cancel_requested" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.controller.state.status).toBe("idle");

    mounted.unmount();
  });

  it("degrades to immediate pause-on-background when no native background bridge is active", async () => {
    const store = new MemoryStore();
    const service = new PracticeService(store);
    store.upsertImportedGames([makeSampleGame("lichess:fallback")]);
    const games = store.listImportedGames();
    const deferred = createDeferredEngine();
    const bridge = new FakeBackgroundBatchAnalysisBridge({
      active: false,
      supportsContinuedBackground: false,
      mode: "none"
    });

    const mounted = mountController({
      store,
      service,
      engine: deferred.engine,
      bridge
    });

    act(() => {
      mounted.controller.startBatch(games);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.controller.state.status).toBe("running");

    await act(async () => {
      appStateListener?.("background");
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.controller.state.status).toBe("paused");
    expect(mounted.controller.state.pausedByBackground).toBe(true);

    mounted.unmount();
  });
});
