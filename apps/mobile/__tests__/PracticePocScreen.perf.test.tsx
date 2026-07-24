import React from "react";
import TestRenderer, { act } from "react-test-renderer";

// Wall-clock timer that keeps ticking while jest fake timers are active
// (see the doNotFake option below).
const performance = (globalThis as unknown as { performance: { now(): number } }).performance;
import { PracticePocScreen } from "../src/components/PracticePocScreen";
import { createMobilePracticeService } from "../src/platform/mobilePractice";
import { createTestMobilePlatformCapabilities } from "../src/testing/testMobilePlatformCapabilities";
import type { PracticeService } from "../../../packages/storage/src/practice-service";
import type { SprintMode, SprintState } from "../../../packages/core/src/index";

jest.setTimeout(600000);

const PUZZLES_TO_SOLVE = 60;
const BUCKET = 10;

const ACTIVE_SPRINT_SCAN_METHODS = [
  "getHistoryView",
  "listHistory",
  "listPlayedRatings",
  "countEligibleSprintPuzzles",
  "pruneOrphanedReviewQueue",
  "listSprintSessions",
  "getDueReviews",
  "listReviewQueue",
  "getDueReviewItems"
] as const;

type ServiceProbe = {
  calls: number;
  totalMs: number;
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
    probe.totalMs = 0;
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

describe("sprint late-game performance", () => {
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
    const service = createMobilePracticeService("random1000");
    service.startSprint(longSprintConfig(mode), new Date(Date.now()).toISOString());

    // Count storage reads whose result size can grow with attempt history,
    // completed sessions, or the review queue.
    const probes: ServiceProbes = new Map();
    for (const method of ACTIVE_SPRINT_SCAN_METHODS) {
      const original = (service as any)[method].bind(service);
      probes.set(method, { calls: 0, totalMs: 0 });
      (service as any)[method] = (...args: unknown[]) => {
        const probe = probes.get(method)!;
        probe.calls += 1;
        const start = performance.now();
        try {
          return original(...args);
        } finally {
          probe.totalMs += performance.now() - start;
        }
      };
    }
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
          return `${key}: ${value.calls - before.calls} calls / ${(value.totalMs - before.totalMs).toFixed(1)}ms`;
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
