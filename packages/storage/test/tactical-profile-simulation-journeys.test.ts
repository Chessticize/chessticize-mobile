// Behavioral journey tests on the simulated-player harness: recommendation
// exit after improvement, the full Focused Run journey through the
// production-shaped SQLite store, and robustness of randomized histories.
import test from "node:test";
import assert from "node:assert/strict";
import { curatedPuzzleThemes } from "../../core/src/index.ts";
import { BALANCED_SIMULATED_PLAYER } from "../src/simulation/scenarios.ts";
import {
  SeededRandom,
  observeProfile,
  playActiveRun,
  type SimulatedPlayerProfile
} from "../src/simulation/simulated-player.ts";
import { playHistory, signalStatus } from "./simulation-fixtures.ts";

test("an improved player's speed recommendation exits through hysteresis without flickering", (t) => {
  const exits: number[] = [];
  for (const seed of ["exit-1", "exit-2"]) {
    const history = playHistory({
      player: {
        ...BALANCED_SIMULATED_PLAYER,
        themeSpeedMultipliers: { fork: 1.8 },
        improvement: { startRun: 4, endRun: 5 }
      },
      seed,
      plan: { runs: 30 }
    });
    history.world.close();
    const statuses = history.records.map((record) => signalStatus(record, "line:fork"));
    const firstRecommended = statuses.indexOf("recommended");
    const lastRecommended = statuses.lastIndexOf("recommended");
    assert.ok(firstRecommended >= 0 && firstRecommended < 5, `seed ${seed}: ${statuses.join(",")}`);
    assert.ok(lastRecommended < statuses.length - 1, `seed ${seed}: never exited: ${statuses.join(",")}`);
    // One contiguous recommended block: no re-entry after an exit.
    assert.ok(
      statuses
        .slice(firstRecommended, lastRecommended + 1)
        .every((status) => status === "recommended"),
      `seed ${seed}: recommendation flickered: ${statuses.join(",")}`
    );
    assert.ok(
      statuses.slice(lastRecommended + 1).every((status) => status !== "recommended"),
      `seed ${seed}: recommendation re-entered: ${statuses.join(",")}`
    );
    // Hysteresis: while still recommended, confidence may sit below the entry
    // threshold but never below the exit threshold.
    for (const record of history.records.slice(firstRecommended, lastRecommended + 1)) {
      const fork = record.signals.find((signal) => signal.id === "line:fork");
      assert.ok(fork);
      assert.ok(Math.max(fork.speedConfidence, fork.solveConfidence) >= 0.85);
    }
    exits.push(lastRecommended + 1);
  }
  t.diagnostic(`last recommended Run: ${exits.join(", ")}`);
});

test("a recommendation leads to a Focused Run that records every attempt without becoming evidence", () => {
  const history = playHistory({
    // A brisk player, so the 15-puzzle Run ends at its attempt limit rather
    // than on the Run clock.
    player: {
      ...BALANCED_SIMULATED_PLAYER,
      baseDecisionSeconds: 4,
      themeSpeedMultipliers: { fork: 1.6 }
    },
    seed: "focused-journey",
    plan: {
      runs: 12,
      stopWhen: (record) => record.signals.some(
        (signal) => signal.id === "line:fork" && signal.status === "recommended"
      )
    }
  });
  try {
    const { practice } = history.world;
    const { clock, player, world } = history;
    assert.equal(history.records.at(-1)?.phase, "ready");
    const progressBefore = practice.getTacticalProfileProgress(clock.now());
    const observedBefore = observeProfile(practice, clock);
    assert.equal(practice.preflightFocusedRun("line").status, "available");

    clock.advanceTo(clock.nowMs() + 60_000);
    const started = practice.startFocusedRun("line", clock.now(), "focused-journey");
    assert.equal(started.config.ratingPolicy, "unrated");
    assert.ok(started.config.tacticalFocus?.themes.includes("fork"));
    // The pack-backed batch is persisted in user SQLite before any attempt
    // (the #592 failure mode was a foreign-key error on the first insert).
    for (const puzzle of started.puzzles) {
      assert.equal(world.userStore.getPuzzle(puzzle.id)?.id, puzzle.id);
    }
    const focusThemes = started.puzzles.filter((puzzle) =>
      curatedPuzzleThemes(puzzle.themes).includes("fork")
    );
    assert.ok(focusThemes.length > 0);

    const result = playActiveRun({ practice, player, clock });

    assert.equal(result.focused, true);
    assert.equal(result.endReason, "attempt_limit");
    assert.equal(result.attemptCount, started.puzzles.length);
    assert.equal(result.ratingAfter, undefined);
    const recorded = practice.listHistory({ sessionId: started.id });
    assert.equal(recorded.length, started.puzzles.length);
    assert.deepEqual(
      new Set(recorded.map((attempt) => attempt.puzzleId)),
      new Set(started.puzzles.map((puzzle) => puzzle.id))
    );
    const session = practice.listSprintSessions().find((candidate) => candidate.id === started.id);
    assert.equal(session?.status, result.status);
    assert.equal(practice.getActiveSprint(), undefined);

    // Focused attempts are excluded: the derived evidence is unchanged, even
    // when read later.
    clock.advanceTo(clock.nowMs() + 60 * 60_000);
    const progressAfter = practice.getTacticalProfileProgress(clock.now());
    assert.deepEqual(progressAfter?.snapshots, progressBefore?.snapshots);
    assert.deepEqual(observeProfile(practice, clock).signals, observedBefore.signals);
    // Without fresh mixed evidence the same Focused Run is not re-offered.
    assert.equal(practice.prepareFocusedRun("line", clock.now(), "again").status, "unavailable");
  } finally {
    history.world.close();
  }
});

test("randomized histories never throw and never produce non-finite signals", (t) => {
  const themes = ["fork", "pin", "mateIn1", "mateIn2", "sacrifice", "discoveredAttack", "advancedPawn"];
  const played = { arrowDuel: 0, focused: 0, runs: 0 };
  for (let index = 0; index < 4; index += 1) {
    const random = new SeededRandom(`robustness-${index}`);
    const offsets: Record<string, number> = {};
    const multipliers: Record<string, number> = {};
    for (const theme of themes) {
      if (random.next() < 0.4) {
        offsets[theme] = (random.next() - 0.6) * 4;
      }
      if (random.next() < 0.4) {
        multipliers[theme] = 0.4 + random.next() * 2.6;
      }
    }
    const player: SimulatedPlayerProfile = {
      skillRating: 700 + random.next() * 900,
      baseSolveRate: 0.5 + random.next() * 0.45,
      themeSolveLogitOffsets: offsets,
      baseDecisionSeconds: 2 + random.next() * 25,
      themeSpeedMultipliers: multipliers,
      timeNoiseSigma: random.next() * 1.2,
      ...(random.next() < 0.5 ? { improvement: { startRun: 2, endRun: 6 } } : {}),
      skillGainPerRun: (random.next() - 0.5) * 20
    };
    const history = playHistory({
      player,
      seed: `robustness-${index}`,
      plan: { runs: 8, arrowDuelShare: 0.5, runsPerDay: 1 + random.int(4), focusedRunFamily: "line" }
    });
    try {
      const { practice } = history.world;
      for (const record of history.records) {
        played.runs += 1;
        played.arrowDuel += record.mode === "arrow_duel" ? 1 : 0;
        played.focused += record.focused ? 1 : 0;
        assert.notEqual(record.phase, "unavailable");
        for (const signal of record.signals) {
          for (const value of [
            signal.solveConfidence,
            signal.speedConfidence,
            signal.expectedFailuresPer100,
            signal.completedTimeMultiplier
          ]) {
            assert.ok(Number.isFinite(value), `${signal.id} produced ${value}`);
          }
        }
      }
      const snapshot = practice.getTacticalProfileSnapshot(history.clock.now());
      assert.ok(snapshot);
      assert.notEqual(snapshot.buildState.status, "failed");
      const progress = practice.getTacticalProfileProgress(history.clock.now());
      for (const point of progress?.snapshots ?? []) {
        for (const estimate of point.estimates) {
          for (const [key, value] of Object.entries(estimate)) {
            if (typeof value === "number") {
              assert.ok(Number.isFinite(value), `${estimate.theme}.${key} = ${value}`);
            }
          }
        }
      }
    } finally {
      history.world.close();
    }
  }
  // The randomized sweep must exercise every Run kind it claims to cover.
  t.diagnostic(`played ${JSON.stringify(played)}`);
  assert.ok(played.arrowDuel > 0 && played.focused > 0, JSON.stringify(played));
});
