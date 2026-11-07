// Behavioral detection tests: simulated players with planted ground truth play
// real Runs through PracticeService against the shipped provisional
// calibration and a representative Core Pack slice.
import test from "node:test";
import assert from "node:assert/strict";
import { BALANCED_SIMULATED_PLAYER } from "../src/simulation/scenarios.ts";
import type { SimulatedRunRecord } from "../src/simulation/simulated-player.ts";
import { playClosedHistory, playHistory } from "./simulation-fixtures.ts";

function firstRecommendation(
  records: readonly SimulatedRunRecord[],
  signalId: string,
  reasons: readonly string[]
): number {
  return records.findIndex((record) => record.signals.some((signal) =>
    signal.id === signalId &&
    signal.status === "recommended" &&
    reasons.includes(signal.reason)
  ));
}

// Acceptance test for #607. The shipped solve baseline expects 50% success at
// equal Ratings, while a Run Rating settles near an 85% per-puzzle solve rate,
// so a fork theme solved about 70% of the time still looks strong. Remove
// `todo` when #607 lands; it must then pass unchanged.
test(
  "a planted fork solve-rate weakness is recommended for its solve rate",
  { todo: "Fails until #607 gives the solve head a personal baseline" },
  () => {
    for (const seed of ["solve-1", "solve-2"]) {
      const history = playHistory({
        player: {
          ...BALANCED_SIMULATED_PLAYER,
          themeSolveLogitOffsets: { fork: -1.4 }
        },
        seed,
        plan: {
          runs: 36,
          stopWhen: (record) => record.signals.some(
            (signal) => signal.id === "line:fork" && signal.status === "recommended"
          )
        }
      });
      try {
        const detectedAt = firstRecommendation(
          history.records,
          "line:fork",
          ["solve_rate", "both"]
        );
        const fork = history.world.practice
          .getTacticalProfileProgress(history.clock.now())
          ?.snapshots.at(-1)
          ?.estimates.find((estimate) =>
            estimate.taskFamily === "line" && estimate.theme === "fork"
          );
        assert.ok(
          detectedAt >= 0,
          `seed ${seed}: line:fork was not recommended for solve rate within ` +
          `${history.records.length} Runs (observed solve rate ` +
          `${fork?.observedSolveRate.toFixed(2) ?? "n/a"}, solve confidence ` +
          `${fork?.solveConfidence.toFixed(3) ?? "n/a"}, ` +
          `${fork?.distinctPuzzleCount ?? 0} puzzles)`
        );
      } finally {
        history.world.close();
      }
    }
  }
);

test("a planted fork speed weakness is recommended for completed speed", (t) => {
  const detections: number[] = [];
  for (const seed of ["speed-1", "speed-2", "speed-3"]) {
    const records = playClosedHistory({
      player: {
        ...BALANCED_SIMULATED_PLAYER,
        themeSpeedMultipliers: { fork: 1.5 }
      },
      seed,
      plan: {
        runs: 12,
        stopWhen: (record) => record.signals.some(
          (signal) => signal.id === "line:fork" && signal.status === "recommended"
        )
      }
    });
    const detectedAt = firstRecommendation(records, "line:fork", ["completed_speed", "both"]);
    assert.ok(detectedAt >= 0, `seed ${seed}: line:fork speed weakness was not recommended`);
    const detected = records[detectedAt];
    assert.ok(detected);
    assert.equal(detected.phase, "ready");
    assert.ok(
      (detected.signals.find((signal) => signal.id === "line:fork")?.completedTimeMultiplier ?? 0) > 1.2
    );
    detections.push(detectedAt + 1);
  }
  t.diagnostic(`Runs to detection: ${detections.join(", ")}`);
});

// Observed on the fixed seeds below: 0 of 4 histories had a recommendation.
// The ceiling leaves room for one seed's noise without hiding a systematic
// false-positive regression. Wider sweeps belong to pnpm simulate:tactical-profile.
const UNIFORM_FALSE_POSITIVE_CEILING = 1;

test("a uniform player gets no recommendation across fixed seeds", (t) => {
  const seeds = ["uniform-1", "uniform-2", "uniform-3", "uniform-4"];
  const falsePositives: string[] = [];
  for (const seed of seeds) {
    const records = playClosedHistory({
      player: BALANCED_SIMULATED_PLAYER,
      seed,
      plan: { runs: 20, arrowDuelShare: 0.25 }
    });
    for (const record of records) {
      for (const signal of record.signals) {
        assert.ok(Number.isFinite(signal.solveConfidence));
        assert.ok(Number.isFinite(signal.speedConfidence));
      }
    }
    const recommended = new Set(records.flatMap((record) => record.signals
      .filter((signal) => signal.status === "recommended")
      .map((signal) => signal.id)));
    if (recommended.size > 0) {
      falsePositives.push(`${seed}: ${[...recommended].join(", ")}`);
    }
    assert.notEqual(records.at(-1)?.phase, "building");
  }
  t.diagnostic(
    `uniform false positives: ${falsePositives.length} of ${seeds.length}` +
    (falsePositives.length > 0 ? ` (${falsePositives.join("; ")})` : "")
  );
  assert.ok(
    falsePositives.length <= UNIFORM_FALSE_POSITIVE_CEILING,
    `uniform false positives ${falsePositives.length} exceed ceiling ${UNIFORM_FALSE_POSITIVE_CEILING}: ${falsePositives.join("; ")}`
  );
});
