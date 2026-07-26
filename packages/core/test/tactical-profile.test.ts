import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTacticalFocusCutoffs,
  buildFocusedRunPlan,
  canReofferFocusedRun,
  focusedRunPlanRefreshDecision,
  shouldReevaluateTacticalProfile
} from "../src/tactical-profile.ts";

const rankedFocuses = [
  { theme: "fork", reason: "solve_rate" },
  { theme: "pin", reason: "completed_speed" },
  { theme: "deflection", reason: "solve_rate" },
  { theme: "backRankMate", reason: "solve_rate" }
] as const;

test("focus cutoffs show one on Home, three in Profile, and two in a Run", () => {
  const cutoffs = applyTacticalFocusCutoffs(rankedFocuses);

  assert.deepEqual(cutoffs.home.map((focus) => focus.theme), ["fork"]);
  assert.deepEqual(cutoffs.profile.map((focus) => focus.theme), ["fork", "pin", "deflection"]);
  assert.deepEqual(cutoffs.run.map((focus) => focus.theme), ["fork", "pin"]);
  assert.deepEqual(cutoffs.monitored.map((focus) => focus.theme), ["backRankMate"]);
});

test("focus cutoffs combine both signal heads for one theme", () => {
  const cutoffs = applyTacticalFocusCutoffs([
    { theme: "fork", reason: "solve_rate" },
    { theme: "fork", reason: "completed_speed" },
    { theme: "pin", reason: "solve_rate" }
  ]);

  assert.deepEqual(cutoffs.profile, [
    { theme: "fork", reason: "both" },
    { theme: "pin", reason: "solve_rate" }
  ]);
});

test("one-focus 15-puzzle plan allocates 10 focused and 5 mixed puzzles", () => {
  const result = buildFocusedRunPlan({
    taskFamily: "line",
    ratingAnchor: { ratingKey: "standard 5/20", rating: 1500 },
    rankedFocuses: [rankedFocuses[0]],
    runSize: 15,
    inventoryBands: [
      inventoryBand(1400, 1600, { fork: 10 }, 5)
    ],
    excludePuzzleIds: ["seen-a", "seen-a", " seen-b "]
  });

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(result.plan.reasons, [
    { theme: "fork", reason: "solve_rate", count: 10 }
  ]);
  assert.equal(result.plan.mixedControlCount, 5);
  assert.deepEqual(result.plan.excludePuzzleIds, ["seen-a", "seen-b"]);
});

test("two-focus 15-puzzle plan allocates 9 primary, 3 secondary, and 3 mixed", () => {
  const result = buildFocusedRunPlan({
    taskFamily: "line",
    ratingAnchor: { ratingKey: "standard 5/20", rating: 1500 },
    rankedFocuses,
    runSize: 15,
    inventoryBands: [
      inventoryBand(1400, 1600, { fork: 9, pin: 3, deflection: 100 }, 3)
    ]
  });

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(result.plan.reasons, [
    { theme: "fork", reason: "solve_rate", count: 9 },
    { theme: "pin", reason: "completed_speed", count: 3 }
  ]);
  assert.equal(result.plan.mixedControlCount, 3);
});

test("planner chooses the first bounded Rating band that can fill every quota", () => {
  const result = buildFocusedRunPlan({
    taskFamily: "line",
    ratingAnchor: { ratingKey: "standard 5/20", rating: 1500 },
    rankedFocuses,
    runSize: 15,
    inventoryBands: [
      inventoryBand(1450, 1550, { fork: 9, pin: 2 }, 30),
      inventoryBand(1400, 1600, { fork: 20, pin: 10 }, 30),
      inventoryBand(1300, 1700, { fork: 40, pin: 30 }, 30)
    ]
  });

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.plan.minRating, 1400);
  assert.equal(result.plan.maxRating, 1600);
});

test("planner reports sparse-theme shortages without changing the approved mix", () => {
  const result = buildFocusedRunPlan({
    taskFamily: "line",
    ratingAnchor: { ratingKey: "standard 5/20", rating: 2150 },
    rankedFocuses: [{ theme: "smotheredMate", reason: "solve_rate" }],
    runSize: 15,
    inventoryBands: [
      inventoryBand(2100, 2199, { smotheredMate: 4 }, 100)
    ]
  });

  assert.deepEqual(result, {
    status: "unavailable",
    reason: "insufficient_inventory",
    shortages: [
      { bucket: "theme", theme: "smotheredMate", required: 10, available: 4 }
    ]
  });
});

test("planner rejects a band that cannot preserve the mixed allocation", () => {
  const result = buildFocusedRunPlan({
    taskFamily: "arrow_duel",
    ratingAnchor: { ratingKey: "arrow_duel 5/30", rating: 1200 },
    rankedFocuses: [rankedFocuses[0]],
    runSize: 15,
    inventoryBands: [
      inventoryBand(1100, 1300, { fork: 40 }, 4)
    ]
  });

  assert.deepEqual(result, {
    status: "unavailable",
    reason: "insufficient_inventory",
    shortages: [
      { bucket: "mixed", required: 5, available: 4 }
    ]
  });
});

test("planner rejects unusable inputs and empty focus lists", () => {
  const invalid = buildFocusedRunPlan({
    taskFamily: "line",
    ratingAnchor: { ratingKey: "", rating: 1500 },
    rankedFocuses,
    runSize: 15,
    inventoryBands: []
  });
  const empty = buildFocusedRunPlan({
    taskFamily: "line",
    ratingAnchor: { ratingKey: "standard 5/20", rating: 1500 },
    rankedFocuses: [],
    runSize: 15,
    inventoryBands: []
  });

  assert.equal(invalid.status, "unavailable");
  assert.equal(empty.status, "unavailable");
  if (invalid.status !== "unavailable" || empty.status !== "unavailable") return;
  assert.equal(
    invalid.reason,
    "invalid_input"
  );
  assert.equal(
    empty.reason,
    "no_focus"
  );
});

test("only ordinary mixed completion and canonical import reevaluate the profile", () => {
  assert.equal(shouldReevaluateTacticalProfile("eligible_mixed_run_completed"), true);
  assert.equal(shouldReevaluateTacticalProfile("canonical_import_changed"), true);
  assert.equal(shouldReevaluateTacticalProfile("focused_run_completed"), false);
  assert.equal(shouldReevaluateTacticalProfile("scheduled_review_completed"), false);
  assert.equal(shouldReevaluateTacticalProfile("unclear_changed"), false);
});

test("an active Run stays fixed and every later Run rebuilds before start", () => {
  assert.equal(focusedRunPlanRefreshDecision(true), "keep_active_run");
  assert.equal(focusedRunPlanRefreshDecision(false), "rebuild_before_start");
});

test("a completed Focused Run is not re-offered before new mixed evidence", () => {
  assert.equal(
    canReofferFocusedRun({
      completedFocusedRun: true,
      hasNewEligibleMixedSession: false
    }),
    false
  );
  assert.equal(
    canReofferFocusedRun({
      completedFocusedRun: true,
      hasNewEligibleMixedSession: true
    }),
    true
  );
  assert.equal(
    canReofferFocusedRun({
      completedFocusedRun: false,
      hasNewEligibleMixedSession: false
    }),
    true
  );
});

function inventoryBand(
  minRating: number,
  maxRating: number,
  availableByTheme: Readonly<Record<string, number>>,
  mixedAvailableCount: number
) {
  return { minRating, maxRating, availableByTheme, mixedAvailableCount };
}
