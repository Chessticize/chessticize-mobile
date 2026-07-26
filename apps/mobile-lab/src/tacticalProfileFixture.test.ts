import assert from "node:assert/strict";
import test from "node:test";
import type { TacticalProfileIntent } from "../../mobile/src/components/tacticalProfilePresentation.ts";
import {
  initialTacticalProfileFixtureState,
  isTacticalProfileScenario,
  reduceTacticalProfileFixtureState,
  tacticalProfilePresentationFor
} from "./tacticalProfileFixture.ts";

test("issue #250 fixture covers the independent solve-rate and completed-speed heads", () => {
  const onIntent = (_intent: TacticalProfileIntent): void => {};
  const solveRate = tacticalProfilePresentationFor(
    "practice-tactical-profile-solve-rate",
    initialTacticalProfileFixtureState("practice-tactical-profile-solve-rate"),
    onIntent
  );
  const speed = tacticalProfilePresentationFor(
    "practice-tactical-profile-speed",
    initialTacticalProfileFixtureState("practice-tactical-profile-speed"),
    onIntent
  );

  assert.deepEqual(solveRate.signals.map((signal) => signal.kind), ["solve_rate"]);
  assert.deepEqual(speed.signals.map((signal) => signal.kind), ["speed"]);
  assert.equal(solveRate.signals[0]?.distinctPuzzleCount, 7);
  assert.equal(speed.signals[0]?.distinctSessionCount, 3);
});

test("issue #250 focused Run fixture preserves explicit mixed-control quota", () => {
  const presentation = tacticalProfilePresentationFor(
    "practice-tactical-profile-focused-run",
    initialTacticalProfileFixtureState("practice-tactical-profile-focused-run"),
    () => {}
  );
  const preview = presentation.focusedRun;

  assert.ok(preview);
  assert.equal(
    preview.allocations.reduce((total, allocation) => total + allocation.puzzleCount, 0),
    preview.totalPuzzleCount
  );
  assert.ok(preview.allocations.some((allocation) => allocation.tone === "mixed"));
  assert.ok(Math.max(...preview.allocations.map((allocation) => allocation.puzzleCount))
    / preview.totalPuzzleCount <= 0.7);
});

test("issue #250 fixture intents keep preview and suppression reversible", () => {
  const initial = initialTacticalProfileFixtureState("practice-tactical-profile-ranked");
  const explanation = reduceTacticalProfileFixtureState(initial, {
    type: "explain-signal",
    signalId: "fork"
  });
  const preview = reduceTacticalProfileFixtureState(explanation, {
    type: "preview-focused-run"
  });
  const suppressed = reduceTacticalProfileFixtureState(preview, {
    type: "suppress-recommendation"
  });
  const restored = reduceTacticalProfileFixtureState(suppressed, {
    type: "restore-recommendation"
  });

  assert.deepEqual(explanation, { screen: "explanation", selectedSignalId: "fork" });
  assert.equal(preview.screen, "focused_run");
  assert.equal(suppressed.screen, "suppressed");
  assert.equal(restored.screen, "profile");
});

test("only issue #250 Tactical Profile scenario ids enter the design fixture", () => {
  assert.equal(isTacticalProfileScenario("practice-tactical-profile-building"), true);
  assert.equal(isTacticalProfileScenario("practice-home"), false);
  assert.equal(isTacticalProfileScenario("history-populated"), false);
});
