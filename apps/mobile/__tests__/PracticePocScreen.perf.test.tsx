import React from "react";
import TestRenderer, { act } from "react-test-renderer";

// Wall-clock timer that keeps ticking while jest fake timers are active
// (see the doNotFake option below).
const performance = (globalThis as unknown as { performance: { now(): number } }).performance;
import { PracticePocScreen } from "../src/components/PracticePocScreen";
import {
  configureMobilePracticePuzzleSource,
  createMobilePracticeService
} from "../src/platform/mobilePractice";
import { createTestMobilePlatformCapabilities } from "../src/testing/testMobilePlatformCapabilities";
import { MemoryStore } from "../../../packages/storage/src/memory-store";
import { PracticeService } from "../../../packages/storage/src/practice-service";
import type { SprintMode, SprintState } from "../../../packages/core/src/index";

jest.setTimeout(600000);

const PUZZLES_TO_SOLVE = 60;
const BUCKET = 10;

const ACTIVE_SPRINT_SCAN_METHODS = [
  "getHistoryView",
  "listAttempts",
  "listPlayedRatings",
  "countPuzzles",
  "pruneOrphanedReviewQueue",
  "listSprintSessions",
  "getDueReviews",
  "listReviewQueue",
  "getDueReviewItems"
] as const;

type ServiceProbe = {
  calls: number;
};

type ServiceProbes = Map<string, ServiceProbe>;

function longSprintConfig(mode: Extract<SprintMode, "standard" | "arrow_duel">) {
  return {
    mode,
    durationSeconds: 3600,
    perPuzzleSeconds: mode === "arrow_duel" ? 30 : 20,
    targetCorrect: 500,
    maxMistakes: 50
  };
}

const renderers: TestRenderer.ReactTestRenderer[] = [];

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["performance"] });
});

afterEach(() => {
  for (const renderer of renderers.splice(0)) {
    act(() => {
      renderer.unmount();
    });
  }
  jest.useRealTimers();
});

function requireActiveSprint(service: PracticeService): SprintState {
  const state = service.getActiveSprint();
  if (!state) {
    throw new Error("Expected an active sprint");
  }
  return state;
}

function nextCorrectMove(state: SprintState): string {
  const current = state.currentPuzzle;
  if (!current) {
    throw new Error("Expected a current puzzle");
  }
  if (current.kind === "arrow_duel") {
    if (current.phase === "reply") {
      const reply = current.puzzle.solutionMoves[1];
      if (!reply) {
        throw new Error(`No opponent reply for Arrow Duel puzzle ${current.puzzle.id}`);
      }
      return reply;
    }
    return current.correctMove;
  }
  const move = current.puzzle.solutionMoves[current.cursor];
  if (!move) {
    throw new Error(`No solution move at cursor ${current.cursor} for puzzle ${current.puzzle.id}`);
  }
  return move;
}

function bucketAverages(samples: number[]): number[] {
  const averages: number[] = [];
  for (let start = 0; start < samples.length; start += BUCKET) {
    const bucket = samples.slice(start, start + BUCKET);
    averages.push(bucket.reduce((sum, value) => sum + value, 0) / bucket.length);
  }
  return averages;
}

function reportBuckets(label: string, samples: number[]): { first: number; last: number } {
  const averages = bucketAverages(samples);
  const rendered = averages.map((avg, index) => `puzzles ${index * BUCKET + 1}-${index * BUCKET + BUCKET}: ${avg.toFixed(1)}ms`);
  console.log(`[perf-harness] ${label}\n  ${rendered.join("\n  ")}`);
  return { first: averages[0], last: averages[averages.length - 1] };
}

function snapshotProbes(probes: ServiceProbes): ServiceProbes {
  return new Map([...probes].map(([key, value]) => [key, { ...value }]));
}

function resetProbes(probes: ServiceProbes): void {
  for (const probe of probes.values()) {
    probe.calls = 0;
  }
}

function nonZeroProbeDeltas(probes: ServiceProbes, before: ServiceProbes): string[] {
  return [...probes].flatMap(([key, value]) => {
    const previous = before.get(key);
    if (!previous) {
      throw new Error(`Missing probe snapshot for ${key}`);
    }
    const calls = value.calls - previous.calls;
    return calls === 0 ? [] : [`${key}: ${calls}`];
  });
}

class ScanCountingMemoryStore extends MemoryStore {
  readonly probes: ServiceProbes = new Map(
    ACTIVE_SPRINT_SCAN_METHODS.map((method) => [method, { calls: 0 }])
  );

  override getHistoryView(...args: Parameters<MemoryStore["getHistoryView"]>) {
    this.record("getHistoryView");
    return super.getHistoryView(...args);
  }

  override listAttempts(...args: Parameters<MemoryStore["listAttempts"]>) {
    this.record("listAttempts");
    return super.listAttempts(...args);
  }

  override listPlayedRatings(...args: Parameters<MemoryStore["listPlayedRatings"]>) {
    this.record("listPlayedRatings");
    return super.listPlayedRatings(...args);
  }

  override countPuzzles(...args: Parameters<MemoryStore["countPuzzles"]>) {
    this.record("countPuzzles");
    return super.countPuzzles(...args);
  }

  override pruneOrphanedReviewQueue(...args: Parameters<MemoryStore["pruneOrphanedReviewQueue"]>) {
    this.record("pruneOrphanedReviewQueue");
    return super.pruneOrphanedReviewQueue(...args);
  }

  override listSprintSessions(...args: Parameters<MemoryStore["listSprintSessions"]>) {
    this.record("listSprintSessions");
    return super.listSprintSessions(...args);
  }

  override getDueReviews(...args: Parameters<MemoryStore["getDueReviews"]>) {
    this.record("getDueReviews");
    return super.getDueReviews(...args);
  }

  override listReviewQueue(...args: Parameters<MemoryStore["listReviewQueue"]>) {
    this.record("listReviewQueue");
    return super.listReviewQueue(...args);
  }

  override getDueReviewItems(...args: Parameters<MemoryStore["getDueReviewItems"]>) {
    this.record("getDueReviewItems");
    return super.getDueReviewItems(...args);
  }

  private record(method: typeof ACTIVE_SPRINT_SCAN_METHODS[number]): void {
    const probe = this.probes.get(method);
    if (!probe) {
      throw new Error(`Missing scan probe for ${method}`);
    }
    probe.calls += 1;
  }
}

describe("sprint late-game performance", () => {
  it("component-level: opening Practice avoids materializing all attempts and sessions", () => {
    const store = new ScanCountingMemoryStore();
    const service = new PracticeService(store);
    configureMobilePracticePuzzleSource(service, "random1000");
    resetProbes(store.probes);

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        <PracticePocScreen
          platformCapabilities={createTestMobilePlatformCapabilities({
            practiceService: service
          })}
        />
      );
    });
    if (!renderer) {
      throw new Error("PracticePocScreen did not render");
    }
    renderers.push(renderer);

    expect(store.probes.get("listAttempts")?.calls).toBe(0);
    expect(store.probes.get("listSprintSessions")?.calls).toBe(0);
  });

  it.each(["standard", "arrow_duel"] as const)(
    "component-level: starting a new %s run avoids aggregate history and Review scans",
    (mode) => {
      const store = new ScanCountingMemoryStore();
      const service = new PracticeService(store);
      configureMobilePracticePuzzleSource(service, "random1000");

      let renderer: TestRenderer.ReactTestRenderer | undefined;
      act(() => {
        renderer = TestRenderer.create(
          <PracticePocScreen
            platformCapabilities={createTestMobilePlatformCapabilities({
              practiceService: service
            })}
          />
        );
      });
      if (!renderer) {
        throw new Error("PracticePocScreen did not render");
      }
      renderers.push(renderer);

      if (mode === "arrow_duel") {
        press(renderer, "practice-mode-arrow-duel");
      }
      resetProbes(store.probes);
      press(renderer, "practice-start-button");
      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect(findByTestId(renderer, "session-board")).toBeTruthy();
      expect([...store.probes].filter(([, probe]) => probe.calls !== 0)).toEqual([]);
    }
  );

  it("service-level: per-move cost does not grow across a long sprint", () => {
    const service = createMobilePracticeService("random1000");
    let state = service.startSprint(longSprintConfig("standard"), new Date(Date.now()).toISOString());

    const perPuzzleMs: number[] = [];
    for (let solved = 0; solved < PUZZLES_TO_SOLVE; solved += 1) {
      const puzzleIndex = state.currentPuzzleIndex;
      const startedAt = performance.now();
      while (state.status === "active" && state.currentPuzzleIndex === puzzleIndex) {
        const move = nextCorrectMove(state);
        state = service.submitMove(move, new Date(Date.now()).toISOString()).state;
        // Keep a worst-case storage-growth benchmark independent of the component
        // query-budget regression below.
        service.pruneOrphanedReviewQueue();
        service.listHistory();
        service.listSprintSessions();
        service.getDueReviews(new Date(Date.now()).toISOString());
        service.listReviewQueue();
        service.getDueReviewItems(new Date(Date.now()).toISOString());
        service.getActiveSprint();
      }
      perPuzzleMs.push(performance.now() - startedAt);
      if (state.status !== "active") {
        throw new Error(`Sprint ended early after ${solved + 1} puzzles: ${state.endReason}`);
      }
    }

    const { first, last } = reportBuckets("service-level per-puzzle ms", perPuzzleMs);
    expect(last).toBeLessThan(Math.max(first * 2, first + 25));
  });

  it.each(["standard", "arrow_duel"] as const)("component-level: %s active gameplay avoids growing storage scans", async (mode) => {
    const store = new ScanCountingMemoryStore();
    const service = new PracticeService(store);
    configureMobilePracticePuzzleSource(service, "random1000");
    service.startSprint(longSprintConfig(mode), new Date(Date.now()).toISOString());

    // Observe the real PracticeStore boundary instead of replacing service
    // methods. These reads can grow with attempt history, completed sessions,
    // or the review queue.
    const probes = store.probes;
    let lastSnapshot = snapshotProbes(probes);
    const perBucketProbeReport: string[] = [];

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        <PracticePocScreen
          platformCapabilities={createTestMobilePlatformCapabilities({
            practiceService: service
          })}
        />
      );
    });
    if (!renderer) {
      throw new Error("PracticePocScreen did not render");
    }
    renderers.push(renderer);

    press(renderer, "practice-resume-card");
    expect(findByTestId(renderer, "session-board")).toBeTruthy();

    resetProbes(probes);
    lastSnapshot = snapshotProbes(probes);

    const perPuzzleMs: number[] = [];
    for (let solved = 0; solved < PUZZLES_TO_SOLVE; solved += 1) {
      const puzzleIndex = requireActiveSprint(service).currentPuzzleIndex;
      const transitionProbeSnapshot = snapshotProbes(probes);
      const startedAt = performance.now();
      let state = requireActiveSprint(service);
      while (state.status === "active" && state.currentPuzzleIndex === puzzleIndex) {
        const move = nextCorrectMove(state);
        await boardMove(renderer, move);
        await settleFeedbackSnapshot();
        const active = service.getActiveSprint();
        if (!active) {
          throw new Error(`Sprint ended early after ${solved + 1} puzzles`);
        }
        state = active;
      }
      expect(state.currentPuzzleIndex).toBe(puzzleIndex + 1);
      expect(nonZeroProbeDeltas(probes, transitionProbeSnapshot)).toEqual([]);
      perPuzzleMs.push(performance.now() - startedAt);
      if ((solved + 1) % BUCKET === 0) {
        const current = snapshotProbes(probes);
        const parts = [...current].map(([key, value]) => {
          const before = lastSnapshot.get(key)!;
          return `${key}: ${value.calls - before.calls} calls`;
        });
        perBucketProbeReport.push(`puzzles ${solved + 2 - BUCKET}-${solved + 1}: ${parts.join(", ")}`);
        lastSnapshot = current;
      }
    }

    console.log(`[perf-harness] ${mode} service probes per bucket\n  ${perBucketProbeReport.join("\n  ")}`);
    const { first, last } = reportBuckets(`${mode} component-level per-puzzle ms`, perPuzzleMs);

    // Regression guard for the late-sprint lag/resource bug: while a sprint is
    // active, no transition may rescan storage collections whose size grows
    // with play. Per-transition assertions above identify the first regression;
    // this final assertion protects the complete long-session budget.
    expect([...probes].filter(([, probe]) => probe.calls !== 0)).toEqual([]);
    // Loose wall-clock backstop for other O(history) work sneaking into renders.
    expect(last).toBeLessThan(Math.max(first * 2, first + 25));
  });

  it.each(["timer", "late-move"] as const)(
    "component-level: active %s timeout handoff avoids aggregate history and Review scans",
    async (handoff) => {
      let wallClockMs = Date.parse("2026-07-24T12:00:00.000Z");
      const store = new ScanCountingMemoryStore();
      const service = new PracticeService(store);
      configureMobilePracticePuzzleSource(service, "random1000");
      service.startSprint(
        longSprintConfig("standard"),
        new Date(wallClockMs).toISOString()
      );

      let renderer: TestRenderer.ReactTestRenderer | undefined;
      act(() => {
        renderer = TestRenderer.create(
          <PracticePocScreen
            currentTimeMs={() => wallClockMs}
            platformCapabilities={createTestMobilePlatformCapabilities({
              practiceService: service
            })}
          />
        );
      });
      if (!renderer) {
        throw new Error("PracticePocScreen did not render");
      }
      renderers.push(renderer);

      press(renderer, "practice-resume-card");
      await act(async () => {
        jest.advanceTimersByTime(350);
        await Promise.resolve();
      });
      const firstPuzzleIndex = requireActiveSprint(service).currentPuzzleIndex;
      resetProbes(store.probes);
      wallClockMs += 60_000;

      if (handoff === "late-move") {
        await boardMove(renderer, nextCorrectMove(requireActiveSprint(service)));
      } else {
        await act(async () => {
          jest.advanceTimersByTime(500);
          await Promise.resolve();
        });
      }

      expect(requireActiveSprint(service).currentPuzzleIndex).toBe(firstPuzzleIndex + 1);
      expect(findByTestId(renderer, "session-puzzle-timeout-overlay")).toBeTruthy();
      expect([...store.probes].filter(([, probe]) => probe.calls !== 0)).toEqual([]);
    }
  );
});

function findByTestId(renderer: TestRenderer.ReactTestRenderer, testID: string): TestRenderer.ReactTestInstance {
  return renderer.root.findByProps({ testID });
}

function press(renderer: TestRenderer.ReactTestRenderer, testID: string): void {
  act(() => {
    const target = findByTestId(renderer, testID);
    if (target.props.disabled) {
      throw new Error(`${testID} is disabled`);
    }
    target.props.onPress();
  });
}

async function boardMove(renderer: TestRenderer.ReactTestRenderer, move: string): Promise<void> {
  const board = findByTestId(renderer, "mock-chessboard");
  if (board.props.gestureEnabled === false) {
    throw new Error(`Board gesture is disabled before ${move}`);
  }
  await act(async () => {
    board.props.mockMove({
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      promotion: move.length > 4 ? move.slice(4, 5) : undefined
    });
    await Promise.resolve();
  });
}

async function settleFeedbackSnapshot(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(850);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}
