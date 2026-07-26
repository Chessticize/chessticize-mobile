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
  assert.deepEqual(solveRate.signals.map((signal) => signal.taskFamily), ["line"]);
  assert.equal(solveRate.signals[0]?.distinctPuzzleCount, 7);
  assert.equal(speed.signals[0]?.distinctSessionCount, 3);
});

test("issue #363 fixture explains collection gaps without promising a focus", () => {
  const presentation = tacticalProfilePresentationFor(
    "practice-tactical-profile-collecting",
    initialTacticalProfileFixtureState("practice-tactical-profile-collecting"),
    () => {}
  );
  const progress = presentation.evidenceProgressByTaskFamily?.line;

  assert.ok(progress);
  assert.equal(progress.tone, "collecting");
  assert.deepEqual(
    progress.checks.map((check) => [check.id, check.value, check.statusLabel]),
    [
      ["puzzle_variety", "3 of 4 different puzzles", "1 short"],
      ["session_coverage", "1 of 2 mixed Runs", "1 short"],
      ["signal_clarity", "No repeated theme yet", "Watching"]
    ]
  );
  assert.match(progress.footnote, /does not guarantee/);
});

test("issue #363 fixture distinguishes enough evidence from a separated signal", () => {
  const balanced = tacticalProfilePresentationFor(
    "practice-tactical-profile-balanced",
    initialTacticalProfileFixtureState("practice-tactical-profile-balanced"),
    () => {}
  ).evidenceProgressByTaskFamily?.line;
  const focused = tacticalProfilePresentationFor(
    "practice-tactical-profile-explanation",
    initialTacticalProfileFixtureState("practice-tactical-profile-explanation"),
    () => {}
  ).evidenceProgressByTaskFamily?.line;

  assert.ok(balanced);
  assert.ok(focused);
  assert.deepEqual(
    balanced.checks.map((check) => check.status),
    ["ready", "ready", "watching"]
  );
  assert.equal(balanced.checks[2]?.value, "Themes remain close");
  assert.deepEqual(
    focused.checks.map((check) => check.status),
    ["ready", "ready", "ready"]
  );
  assert.match(focused.footnote, /Early estimate/);
});

test("issue #363 fixture keeps evidence progress independent by task family", () => {
  const presentation = tacticalProfilePresentationFor(
    "practice-tactical-profile-task-families",
    initialTacticalProfileFixtureState("practice-tactical-profile-task-families"),
    () => {}
  );

  assert.equal(
    presentation.evidenceProgressByTaskFamily?.line?.checks[1]?.value,
    "3 mixed Runs"
  );
  assert.equal(
    presentation.evidenceProgressByTaskFamily?.arrow_duel?.checks[1]?.value,
    "3 Arrow Duel Runs"
  );
  assert.match(
    presentation.evidenceProgressByTaskFamily?.arrow_duel?.footnote ?? "",
    /independently/
  );
});

test("issue #250 focused Run fixture preserves explicit mixed-practice quota", () => {
  const presentation = tacticalProfilePresentationFor(
    "practice-tactical-profile-focused-run",
    initialTacticalProfileFixtureState("practice-tactical-profile-focused-run"),
    () => {}
  );
  const preview = presentation.focusedRun;

  assert.ok(preview);
  assert.equal(preview.taskFamily, "line");
  assert.equal(
    preview.allocations.reduce((total, allocation) => total + allocation.puzzleCount, 0),
    preview.totalPuzzleCount
  );
  assert.ok(preview.allocations.some((allocation) => allocation.tone === "mixed"));
  assert.ok(Math.max(...preview.allocations.map((allocation) => allocation.puzzleCount))
    / preview.totalPuzzleCount <= 0.7);
});

test("issue #250 ranked fixture keeps four recommendations but trains only the top two", () => {
  const presentation = tacticalProfilePresentationFor(
    "practice-tactical-profile-ranked",
    initialTacticalProfileFixtureState("practice-tactical-profile-ranked"),
    () => {}
  );

  assert.equal(presentation.screen, "home");
  assert.equal(presentation.signals.length, 4);
  assert.deepEqual(
    presentation.focusedRun?.allocations
      .filter((allocation) => allocation.tone !== "mixed")
      .map((allocation) => allocation.label),
    ["Forks", "Pins"]
  );
});

test("issue #250 task-family fixture keeps Arrow Duel in its own lane and Run", () => {
  const scenarioId = "practice-tactical-profile-task-families";
  const initial = initialTacticalProfileFixtureState(scenarioId);
  const presentation = tacticalProfilePresentationFor(
    scenarioId,
    initial,
    () => {}
  );

  assert.deepEqual(
    presentation.signals.map((signal) => [signal.taskFamily, signal.themeLabel]),
    [
      ["line", "Forks"],
      ["arrow_duel", "Pins"],
      ["arrow_duel", "Deflection"]
    ]
  );
  assert.equal(presentation.activeTaskFamily, "arrow_duel");
  assert.equal(presentation.homeLeadSignalId, "fork");
  assert.equal(presentation.focusedRun?.taskFamily, "arrow_duel");
  assert.equal(presentation.focusedRun?.ratingLabel, "Arrow Duel Rating 875");
  assert.deepEqual(
    presentation.focusedRun?.allocations.map((allocation) => allocation.label),
    ["Pins", "Deflection", "Mixed Arrow Duel"]
  );

  const preview = reduceTacticalProfileFixtureState(initial, {
    type: "preview-focused-run"
  });
  const started = reduceTacticalProfileFixtureState(preview, {
    type: "start-focused-run"
  });
  assert.equal(started.startedTaskFamily, "arrow_duel");
});

test("issue #250 limited-inventory fixture withholds a Focused Run without hiding the insight", () => {
  const presentation = tacticalProfilePresentationFor(
    "practice-tactical-profile-limited-inventory",
    initialTacticalProfileFixtureState("practice-tactical-profile-limited-inventory"),
    () => {}
  );

  assert.equal(presentation.signals[0]?.status, "recommended");
  assert.equal(presentation.focusedRun, undefined);
  assert.match(presentation.focusedRunUnavailable?.body ?? "", /current Rating/);
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

  assert.deepEqual(explanation, {
    screen: "explanation",
    selectedSignalId: "fork",
    selectedTaskFamily: "line"
  });
  assert.equal(preview.screen, "focused_run");
  assert.equal(suppressed.screen, "suppressed");
  assert.equal(restored.screen, "profile");
});

test("only issue #250 Tactical Profile scenario ids enter the design fixture", () => {
  assert.equal(isTacticalProfileScenario("practice-tactical-profile-building"), true);
  assert.equal(isTacticalProfileScenario("practice-tactical-profile-task-families-home"), true);
  assert.equal(isTacticalProfileScenario("practice-tactical-profile-task-families"), true);
  assert.equal(isTacticalProfileScenario("practice-tactical-profile-limited-inventory"), true);
  assert.equal(isTacticalProfileScenario("practice-home"), false);
  assert.equal(isTacticalProfileScenario("history-populated"), false);
});
