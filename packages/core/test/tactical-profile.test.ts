import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTacticalFocusCutoffs,
  applyTacticalFocusCutoffsByTaskFamily,
  approximateSolveThemePosterior,
  assertValidTacticalProfileCalibrationArtifact,
  buildTacticalProfileDailyCells,
  buildFocusedRunPlan,
  canReofferFocusedRun,
  classifyTacticalProfileAttempt,
  evaluateTacticalProfile,
  exactSolveThemePosterior,
  focusedRunPlanRefreshDecision,
  shouldReevaluateTacticalProfile,
  tacticalProfileSpeedBaselineFeatures,
  type TacticalProfileAttemptInput,
  type TacticalProfileCalibrationArtifact
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

test("task families keep independent focus cutoffs even for the same theme", () => {
  const cutoffs = applyTacticalFocusCutoffsByTaskFamily([
    { taskFamily: "line", theme: "fork", reason: "solve_rate" },
    { taskFamily: "line", theme: "pin", reason: "completed_speed" },
    { taskFamily: "arrow_duel", theme: "fork", reason: "completed_speed" },
    { taskFamily: "arrow_duel", theme: "deflection", reason: "solve_rate" }
  ]);

  assert.deepEqual(cutoffs.line.home, [
    { theme: "fork", reason: "solve_rate" }
  ]);
  assert.deepEqual(cutoffs.arrow_duel.home, [
    { theme: "fork", reason: "completed_speed" }
  ]);
  assert.deepEqual(cutoffs.line.run.map((focus) => focus.theme), ["fork", "pin"]);
  assert.deepEqual(cutoffs.arrow_duel.run.map((focus) => focus.theme), [
    "fork",
    "deflection"
  ]);
});

test("calibration artifact validation rejects unsafe external artifact shapes", () => {
  assert.doesNotThrow(() =>
    assertValidTacticalProfileCalibrationArtifact(CALIBRATION)
  );
  assert.throws(
    () =>
      assertValidTacticalProfileCalibrationArtifact({
        ...CALIBRATION,
        evidence: {
          ...CALIBRATION.evidence,
          minDistinctPuzzles: 0
        }
      }),
    /minimum distinct puzzles/
  );
  assert.throws(
    () =>
      assertValidTacticalProfileCalibrationArtifact({
        ...CALIBRATION,
        families: {
          line: CALIBRATION.families.line
        }
      }),
    /arrow_duel calibration/
  );
  assert.throws(
    () =>
      assertValidTacticalProfileCalibrationArtifact({
        ...CALIBRATION,
        families: {
          ...CALIBRATION.families,
          line: {
            ...CALIBRATION.families.line,
            solve: {
              ...CALIBRATION.families.line.solve,
              ratingGapSlope: Number.NaN
            }
          }
        }
      }),
    /Rating-gap slope/
  );
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

test("policy-governed backfill moves sparse primary quota only into mixed control", () => {
  const result = buildFocusedRunPlan({
    taskFamily: "line",
    ratingAnchor: { ratingKey: "standard 5/20", rating: 1500 },
    rankedFocuses,
    runSize: 15,
    inventoryBands: [
      inventoryBand(1400, 1600, { fork: 4, pin: 3 }, 8)
    ],
    themeShortfallBackfill: {
      destination: "mixed_control",
      minimumPuzzlesPerTheme: 1
    }
  });

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(
    result.plan.reasons.map((reason) => [reason.theme, reason.count]),
    [["fork", 4], ["pin", 3]]
  );
  assert.equal(result.plan.mixedControlCount, 8);
});

test("policy-governed backfill preserves the primary cap when secondary inventory is sparse", () => {
  const result = buildFocusedRunPlan({
    taskFamily: "line",
    ratingAnchor: { ratingKey: "standard 5/20", rating: 1500 },
    rankedFocuses,
    runSize: 15,
    inventoryBands: [
      inventoryBand(1400, 1600, { fork: 9, pin: 1 }, 5)
    ],
    themeShortfallBackfill: {
      destination: "mixed_control",
      minimumPuzzlesPerTheme: 1
    }
  });

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(
    result.plan.reasons.map((reason) => [reason.theme, reason.count]),
    [["fork", 9], ["pin", 1]]
  );
  assert.equal(result.plan.mixedControlCount, 5);
});

test("backfill declines when a focus minimum or expanded mixed quota cannot be filled", () => {
  const missingFocus = buildFocusedRunPlan({
    taskFamily: "line",
    ratingAnchor: { ratingKey: "standard 5/20", rating: 1500 },
    rankedFocuses,
    runSize: 15,
    inventoryBands: [
      inventoryBand(1400, 1600, { fork: 9, pin: 0 }, 20)
    ],
    themeShortfallBackfill: {
      destination: "mixed_control",
      minimumPuzzlesPerTheme: 1
    }
  });
  const missingMixed = buildFocusedRunPlan({
    taskFamily: "line",
    ratingAnchor: { ratingKey: "standard 5/20", rating: 1500 },
    rankedFocuses,
    runSize: 15,
    inventoryBands: [
      inventoryBand(1400, 1600, { fork: 4, pin: 3 }, 7)
    ],
    themeShortfallBackfill: {
      destination: "mixed_control",
      minimumPuzzlesPerTheme: 1
    }
  });

  assert.deepEqual(missingFocus, {
    status: "unavailable",
    reason: "insufficient_inventory",
    shortages: [
      { bucket: "theme", theme: "pin", required: 3, available: 0 }
    ]
  });
  assert.deepEqual(missingMixed, {
    status: "unavailable",
    reason: "insufficient_inventory",
    shortages: [
      { bucket: "mixed", required: 8, available: 7 }
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

test("only ordinary mixed Sprint attempts enter Tactical Profile discovery", () => {
  const ordinary = tacticalAttempt();
  const scheduledReview = tacticalAttempt({
    attempt: { source: "scheduled_review" }
  });
  const focused = tacticalAttempt({
    sessionConfig: { themes: ["fork"] }
  });
  const missingConfig = tacticalAttempt({ sessionConfig: undefined });

  assert.deepEqual(classifyTacticalProfileAttempt(ordinary), {
    status: "eligible",
    taskFamily: "line"
  });
  assert.deepEqual(classifyTacticalProfileAttempt(scheduledReview), {
    status: "excluded",
    reason: "scheduled_review"
  });
  assert.deepEqual(classifyTacticalProfileAttempt(focused), {
    status: "excluded",
    reason: "focused_intervention"
  });
  assert.deepEqual(classifyTacticalProfileAttempt(missingConfig), {
    status: "excluded",
    reason: "unknown_session_config"
  });
});

test("speed baseline features share calibration references and support disabled Slow labels", () => {
  const features = tacticalProfileSpeedBaselineFeatures({
    decisionCount: 2,
    perPuzzleSeconds: 40,
    puzzleRating: 1600,
    ratingBefore: 1500,
    slowAfterSeconds: null
  });

  assert.ok(Math.abs(features.relativeDifficulty - 100 / (400 / Math.log(10))) < 1e-12);
  assert.ok(Math.abs(features.decisionCountLog - Math.log(3)) < 1e-12);
  assert.ok(Math.abs(features.paceLogRatio - Math.log(2)) < 1e-12);
  assert.ok(Math.abs(features.slowPolicyLogRatio - Math.log(2)) < 1e-12);
});

test("completed-puzzle speed remains eligible when the Slow label is disabled", () => {
  const cells = buildTacticalProfileDailyCells([
    tacticalAttempt({
      attempt: { elapsedMs: 20_000 },
      sessionConfig: {
        perPuzzleSeconds: 40,
        puzzleTiming: { slowAfterSeconds: null, timeoutAfterSeconds: 60 }
      }
    })
  ], {
    ...CALIBRATION,
    families: {
      ...CALIBRATION.families,
      line: {
        ...calibratedFamily(),
        speed: {
          ...calibratedFamily().speed,
          interceptLogSeconds: 0,
          paceLogCoefficient: 1,
          slowPolicyLogCoefficient: 1,
          residualSd: 1
        }
      }
    }
  });

  assert.equal(cells[0]?.speedWeight, 1);
  assert.ok(
    Math.abs((cells[0]?.speedWeightedResidual ?? 0) - Math.log(5)) < 1e-12
  );
});

test("correct attempts at or beyond the Timeout boundary do not become speed evidence", () => {
  const cells = buildTacticalProfileDailyCells([
    tacticalAttempt({
      attempt: {
        id: "attempt-at-timeout",
        puzzleId: "puzzle-at-timeout",
        elapsedMs: 60_000
      },
      puzzle: { id: "puzzle-at-timeout" }
    }),
    tacticalAttempt({
      attempt: {
        id: "attempt-after-timeout",
        puzzleId: "puzzle-after-timeout",
        elapsedMs: 60_001
      },
      puzzle: { id: "puzzle-after-timeout" }
    })
  ], CALIBRATION);

  assert.equal(cells.length, 1);
  assert.equal(cells[0]?.solveWeight, 2);
  assert.equal(cells[0]?.speedWeight, 0);
  assert.equal(cells[0]?.speedPrecision, 0);
});

test("one multi-theme attempt conserves one total theme observation", () => {
  const cells = buildTacticalProfileDailyCells([
    tacticalAttempt({
      puzzle: { themes: ["fork", "pin", "fork", "notCurated"] }
    })
  ], CALIBRATION);

  assert.equal(cells.length, 2);
  assert.equal(
    cells.reduce((sum, cell) => sum + cell.solveWeight, 0),
    1
  );
  assert.deepEqual(
    cells.map((cell) => [cell.theme, cell.solveWeight]),
    [["fork", 0.5], ["pin", 0.5]]
  );
});

test("Timeout contributes one solve failure and no completed-speed observation", () => {
  const [cell] = buildTacticalProfileDailyCells([
    tacticalAttempt({
      attempt: {
        result: "timed_out",
        elapsedMs: 60_000,
        timingStatus: "timed_out",
        unclear: true
      }
    })
  ], CALIBRATION);

  assert.ok(cell);
  assert.equal(cell.solveObservedSuccess, 0);
  assert.equal(cell.solveWeight, 1);
  assert.equal(cell.speedWeight, 0);
  assert.equal(cell.speedPrecision, 0);
});

test("legacy timing gaps are never reconstructed from timestamps or current defaults", () => {
  const missingElapsed = tacticalAttempt();
  delete missingElapsed.attempt.elapsedMs;
  const missingPolicy = tacticalAttempt();
  delete missingPolicy.sessionConfig?.puzzleTiming;

  const [elapsedCell] = buildTacticalProfileDailyCells(
    [missingElapsed],
    CALIBRATION
  );
  const policyCells = buildTacticalProfileDailyCells(
    [missingPolicy],
    CALIBRATION
  );

  assert.ok(elapsedCell);
  assert.equal(elapsedCell.solveObservedSuccess, 1);
  assert.equal(elapsedCell.speedWeight, 0);
  assert.deepEqual(policyCells, []);
});

test("a puzzle with no curated theme contributes no theme posterior cell", () => {
  assert.deepEqual(
    buildTacticalProfileDailyCells([
      tacticalAttempt({ puzzle: { themes: ["notCurated"] } })
    ], CALIBRATION),
    []
  );
});

test("Unclear and Slow workflow labels do not change objective model evidence", () => {
  const plain = tacticalAttempt({
    attempt: { elapsedMs: 45_000 }
  });
  const labeled = tacticalAttempt({
    attempt: {
      elapsedMs: 45_000,
      timingStatus: "slow",
      unclear: true,
      unclearUpdatedAt: "2026-07-20T00:00:45.000Z"
    }
  });

  assert.deepEqual(
    buildTacticalProfileDailyCells([plain], CALIBRATION),
    buildTacticalProfileDailyCells([labeled], CALIBRATION)
  );
});

test("one rare-theme miss stays collecting while diverse repeated misses can recommend", () => {
  const oneMiss = buildTacticalProfileDailyCells([
    tacticalAttempt({
      attempt: { result: "wrong" },
      puzzle: { id: "rare-1", themes: ["smotheredMate"] }
    })
  ], CALIBRATION);
  const repeatedMisses = buildTacticalProfileDailyCells(
    Array.from({ length: 12 }, (_, index) => tacticalAttempt({
      attempt: {
        id: `miss-${index}`,
        result: "wrong",
        sessionId: `session-${index % 3}`,
        completedAt: `2026-07-${String(10 + index).padStart(2, "0")}T00:00:20.000Z`
      },
      puzzle: { id: `fork-${index}`, themes: ["fork"] }
    })),
    CALIBRATION
  );

  const rareEvaluation = evaluateTacticalProfile({
    calibration: CALIBRATION,
    cells: oneMiss,
    naturalFrequency: { line: { smotheredMate: 0.001 }, arrow_duel: {} },
    now: "2026-07-25T00:00:00.000Z"
  });
  const repeatedEvaluation = evaluateTacticalProfile({
    calibration: CALIBRATION,
    cells: repeatedMisses,
    naturalFrequency: { line: { fork: 0.12 }, arrow_duel: {} },
    now: "2026-07-25T00:00:00.000Z"
  });

  assert.equal(rareEvaluation.phase, "collecting");
  assert.equal(rareEvaluation.signals.length, 0);
  assert.equal(repeatedEvaluation.signals[0]?.status, "recommended");
  assert.equal(repeatedEvaluation.signals[0]?.reason, "solve_rate");
});

test("consistent completed-puzzle slowness recommends but one extreme solve does not", () => {
  const consistent = buildTacticalProfileDailyCells(
    Array.from({ length: 8 }, (_, index) => tacticalAttempt({
      attempt: {
        id: `slow-${index}`,
        sessionId: `slow-session-${index % 3}`,
        completedAt: `2026-07-${String(12 + index).padStart(2, "0")}T00:00:45.000Z`,
        elapsedMs: 45_000
      },
      puzzle: { id: `pin-${index}`, themes: ["pin"] }
    })),
    CALIBRATION
  );
  const extreme = buildTacticalProfileDailyCells([
    tacticalAttempt({
      attempt: { elapsedMs: 179_000 },
      sessionConfig: {
        puzzleTiming: { slowAfterSeconds: 40, timeoutAfterSeconds: 180 }
      },
      puzzle: { id: "pin-extreme", themes: ["pin"] }
    })
  ], CALIBRATION);

  const consistentEvaluation = evaluateTacticalProfile({
    calibration: CALIBRATION,
    cells: consistent,
    naturalFrequency: { line: { pin: 0.08 }, arrow_duel: {} },
    now: "2026-07-25T00:00:00.000Z"
  });
  const extremeEvaluation = evaluateTacticalProfile({
    calibration: CALIBRATION,
    cells: extreme,
    naturalFrequency: { line: { pin: 0.08 }, arrow_duel: {} },
    now: "2026-07-25T00:00:00.000Z"
  });

  assert.equal(consistentEvaluation.signals[0]?.status, "recommended");
  assert.equal(consistentEvaluation.signals[0]?.reason, "completed_speed");
  assert.equal(extremeEvaluation.signals[0]?.status, "watch");
  assert.equal(extremeEvaluation.signals[0]?.reason, "completed_speed");
});

test("recommendation hysteresis retains a prior focus between entry and exit thresholds", () => {
  const cell = {
    modelVersion: CALIBRATION.modelVersion,
    packFeatureHash: CALIBRATION.packFeatureHash,
    calibrationId: CALIBRATION.calibrationId,
    completedDay: "2026-07-24",
    taskFamily: "line" as const,
    theme: "pin",
    solveScore: 0,
    solveInformation: 0,
    solveExpectedSuccess: 0,
    solveObservedSuccess: 0,
    solveSensitivity: 0,
    solveWeight: 0,
    speedWeightedResidual: 21.63,
    speedPrecision: 64,
    speedWeight: 4,
    distinctPuzzleIds: ["p1", "p2", "p3", "p4"],
    distinctSessionIds: ["s1", "s2"]
  };
  const common = {
    calibration: CALIBRATION,
    cells: [cell],
    naturalFrequency: { line: { pin: 0.08 }, arrow_duel: {} },
    now: "2026-07-25T00:00:00.000Z"
  };

  const entering = evaluateTacticalProfile(common);
  const retained = evaluateTacticalProfile({
    ...common,
    previousRecommendedSignalIds: ["line:pin"]
  });

  assert.equal(entering.signals[0]?.status, "watch");
  assert.equal(retained.signals[0]?.status, "recommended");
});

test("daily diversity identifiers are capped at calibrated evidence thresholds", () => {
  const cells = buildTacticalProfileDailyCells(
    Array.from({ length: 12 }, (_, index) => tacticalAttempt({
      attempt: {
        id: `cap-${index}`,
        sessionId: `cap-session-${index}`,
        completedAt: "2026-07-20T00:00:20.000Z"
      },
      puzzle: { id: `cap-puzzle-${index}`, themes: ["fork"] }
    })),
    CALIBRATION
  );

  assert.equal(cells[0]?.distinctPuzzleIds.length, CALIBRATION.evidence.minDistinctPuzzles);
  assert.equal(cells[0]?.distinctSessionIds.length, CALIBRATION.evidence.minDistinctSessions);
});

test("diverse evidence with no practical weakness reports a balanced profile", () => {
  const cells = buildTacticalProfileDailyCells(
    Array.from({ length: 8 }, (_, index) => tacticalAttempt({
      attempt: {
        id: `balanced-${index}`,
        sessionId: `balanced-session-${index % 2}`
      },
      puzzle: { id: `balanced-puzzle-${index}`, themes: ["fork"] }
    })),
    CALIBRATION
  );
  const evaluation = evaluateTacticalProfile({
    calibration: CALIBRATION,
    cells,
    naturalFrequency: { line: { fork: 0.1 }, arrow_duel: {} },
    now: "2026-07-25T00:00:00.000Z"
  });

  assert.equal(evaluation.phase, "balanced");
  assert.equal(evaluation.signals.length, 0);
});

test("the same theme remains independent across task families", () => {
  const inputs = [
    ...Array.from({ length: 8 }, (_, index) => tacticalAttempt({
      attempt: {
        id: `line-${index}`,
        result: "wrong",
        sessionId: `line-session-${index % 2}`
      },
      puzzle: { id: `line-puzzle-${index}`, themes: ["fork"] }
    })),
    ...Array.from({ length: 8 }, (_, index) => tacticalAttempt({
      attempt: {
        id: `arrow-${index}`,
        mode: "arrow_duel",
        result: "correct",
        sessionId: `arrow-session-${index % 2}`
      },
      sessionConfig: {
        mode: "arrow_duel",
        ratingKey: "arrow_duel 5/30",
        perPuzzleSeconds: 30,
        puzzleTiming: { slowAfterSeconds: 60, timeoutAfterSeconds: 90 }
      },
      puzzle: { id: `arrow-puzzle-${index}`, themes: ["fork"] }
    }))
  ];

  const evaluation = evaluateTacticalProfile({
    calibration: CALIBRATION,
    cells: buildTacticalProfileDailyCells(inputs, CALIBRATION),
    naturalFrequency: {
      line: { fork: 0.1 },
      arrow_duel: { fork: 0.1 }
    },
    now: "2026-07-25T00:00:00.000Z"
  });

  assert.equal(
    evaluation.signals.find((signal) => signal.taskFamily === "line")?.status,
    "recommended"
  );
  assert.notEqual(
    evaluation.signals.find((signal) => signal.taskFamily === "arrow_duel")?.status,
    "recommended"
  );
});

test("natural frequency changes priority but not posterior confidence", () => {
  const cells = buildTacticalProfileDailyCells(
    Array.from({ length: 10 }, (_, index) => [
      tacticalAttempt({
        attempt: {
          id: `fork-frequency-${index}`,
          result: "wrong",
          sessionId: `frequency-session-${index % 2}`
        },
        puzzle: { id: `fork-frequency-puzzle-${index}`, themes: ["fork"] }
      }),
      tacticalAttempt({
        attempt: {
          id: `rare-frequency-${index}`,
          result: "wrong",
          sessionId: `frequency-session-${index % 2}`
        },
        puzzle: { id: `rare-frequency-puzzle-${index}`, themes: ["smotheredMate"] }
      })
    ]).flat(),
    CALIBRATION
  );
  const evaluation = evaluateTacticalProfile({
    calibration: CALIBRATION,
    cells,
    naturalFrequency: {
      line: { fork: 0.2, smotheredMate: 0.002 },
      arrow_duel: {}
    },
    now: "2026-07-25T00:00:00.000Z"
  });
  const fork = evaluation.signals.find((signal) => signal.theme === "fork");
  const rare = evaluation.signals.find((signal) => signal.theme === "smotheredMate");

  assert.ok(fork && rare);
  assert.equal(fork.solveConfidence, rare.solveConfidence);
  assert.ok(fork.actionPriority > rare.actionPriority);
});

test("score/Fisher solve posterior stays close to exact Newton fixtures", () => {
  const observations = Array.from({ length: 20 }, (_, index) => ({
    baselineProbability: 0.35 + (index % 5) * 0.1,
    sensitivity: 0.004 + (index % 3) * 0.0005,
    success: (index % 3 === 0 ? 1 : 0) as 0 | 1,
    weight: 1
  }));
  const approximate = approximateSolveThemePosterior(
    observations,
    CALIBRATION.families.line.solve.themePriorSdRating
  );
  const exact = exactSolveThemePosterior(
    observations,
    CALIBRATION.families.line.solve.themePriorSdRating
  );

  assert.ok(Math.abs(approximate.mean - exact.mean) < 12);
  assert.ok(Math.abs(approximate.standardDeviation - exact.standardDeviation) < 8);
});

function inventoryBand(
  minRating: number,
  maxRating: number,
  availableByTheme: Readonly<Record<string, number>>,
  mixedAvailableCount: number
) {
  return { minRating, maxRating, availableByTheme, mixedAvailableCount };
}

const CALIBRATION = {
  schemaVersion: 1,
  modelVersion: "test-v1",
  calibrationId: "test-calibration",
  packFeatureHash: "test-pack-rd",
  createdAt: "2026-07-01T00:00:00.000Z",
  recencyHalfLifeDays: 90,
  evidence: {
    watchProbability: 0.75,
    recommendationExitProbability: 0.85,
    recommendationProbability: 0.9,
    strongProbability: 0.97,
    minDistinctPuzzles: 4,
    minDistinctSessions: 2
  },
  opportunity: {
    minimumWeight: 0.25,
    exponent: 0.5
  },
  families: {
    line: calibratedFamily(),
    arrow_duel: calibratedFamily()
  }
} as const satisfies TacticalProfileCalibrationArtifact;

function calibratedFamily() {
  return {
    status: "calibrated",
    solve: {
      intercept: 0,
      ratingGapSlope: 1,
      timeoutLogCoefficient: 0,
      timeoutReferenceSeconds: 60,
      themePriorSdRating: 200,
      practicalDeficitRating: 20,
      minExpectedFailuresPer100: 2
    },
    speed: {
      interceptLogSeconds: Math.log(30),
      relativeDifficultyCoefficient: 0,
      decisionCountCoefficient: 0,
      paceLogCoefficient: 0,
      slowPolicyLogCoefficient: 0,
      residualSd: 0.25,
      themePriorSdLogSeconds: 0.5,
      practicalTimeMultiplier: 1.2
    }
  } as const;
}

function tacticalAttempt(overrides: {
  attempt?: Partial<TacticalProfileAttemptInput["attempt"]>;
  sessionConfig?: Partial<NonNullable<TacticalProfileAttemptInput["sessionConfig"]>> | undefined;
  puzzle?: Partial<TacticalProfileAttemptInput["puzzle"]>;
} = {}): TacticalProfileAttemptInput {
  const sessionConfig = overrides.sessionConfig === undefined && "sessionConfig" in overrides
    ? undefined
    : {
        mode: "standard" as const,
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        puzzleTiming: { slowAfterSeconds: 40, timeoutAfterSeconds: 60 },
        targetCorrect: 15,
        maxMistakes: 3,
        ratingKey: "standard 5/20",
        ...overrides.sessionConfig
      };
  return {
    attempt: {
      id: "attempt-1",
      source: "sprint",
      sessionId: "session-1",
      puzzleId: "puzzle-1",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      startedAt: "2026-07-20T00:00:00.000Z",
      completedAt: "2026-07-20T00:00:30.000Z",
      elapsedMs: 30_000,
      ratingBefore: 1500,
      ...overrides.attempt
    },
    ...(sessionConfig === undefined ? {} : { sessionConfig }),
    puzzle: {
      id: overrides.attempt?.puzzleId ?? "puzzle-1",
      rating: 1500,
      ratingDeviation: 80,
      themes: ["fork"],
      solutionMoves: ["e7e5", "g1f3", "b8c6"],
      ...overrides.puzzle
    }
  };
}
