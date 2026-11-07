import assert from "node:assert/strict";
import test from "node:test";
import {
  approximateSolveThemePosterior,
  assertValidTacticalProfileCalibrationArtifact,
  buildTacticalProfileDailyCells,
  estimateTacticalProfileThemes,
  evaluateTacticalProfile,
  exactSolveThemePosterior,
  fitPersonalSolveOffset,
  personalSolveThemePosterior,
  tacticalProfileSolveBins,
  type TacticalProfileAttemptInput,
  type TacticalProfileCalibrationArtifact
} from "../src/tactical-profile.ts";

const NOW = "2026-07-25T00:00:00.000Z";
const PERSONAL_OFFSET = 1.7;

test("binned personal solve posterior matches the exact posterior re-centred on the offset", () => {
  const observations = Array.from({ length: 40 }, (_, index) => {
    const baselineLogit = -0.6 + (index % 9) * 0.137;
    return {
      baselineLogit,
      baselineProbability: logistic(baselineLogit),
      sensitivity: 0.0052 + (index % 4) * 0.0001,
      success: (index % 5 < 3 ? 1 : 0) as 0 | 1,
      weight: index % 3 === 0 ? 0.5 : 1
    };
  });
  const recentred = observations.map((observation) => ({
    ...observation,
    baselineProbability: logistic(observation.baselineLogit + PERSONAL_OFFSET)
  }));

  const binned = personalSolveThemePosterior(
    tacticalProfileSolveBins(observations),
    PERSONAL_OFFSET,
    100
  );
  const exact = exactSolveThemePosterior(recentred, 100);

  assert.ok(Math.abs(binned.mean - exact.mean) < 1, `${binned.mean} vs ${exact.mean}`);
  assert.ok(Math.abs(binned.standardDeviation - exact.standardDeviation) < 0.5);
  // One score step around the artifact baseline, which the old cells
  // stored, is biased by roughly the whole offset.
  const oneStep = approximateSolveThemePosterior(observations, 100);
  assert.ok(Math.abs(oneStep.mean - exact.mean) > 50);
});

test("the personal offset recovers the user's own solve level from controls", () => {
  const perBin = 400;
  const controls = tacticalProfileSolveBins(
    Array.from({ length: 5 * perBin }, (_, index) => {
      const baselineLogit = -0.5 + Math.floor(index / perBin) * 0.25;
      const probability = logistic(baselineLogit + PERSONAL_OFFSET);
      return {
        baselineLogit,
        baselineProbability: logistic(baselineLogit),
        sensitivity: 0.0055,
        // Deterministic outcomes whose rate in each bin matches probability.
        success: (((index % perBin) + 0.5) / perBin < probability ? 1 : 0) as 0 | 1,
        weight: 1
      };
    })
  );

  const offset = fitPersonalSolveOffset(controls, 2);

  assert.ok(Math.abs(offset - PERSONAL_OFFSET) < 0.03, `offset ${offset}`);
});

test("a theme solved well below the user's own level is recommended for its solve rate (#607)", () => {
  const inputs = history({ controlSolveRate: 0.88, forkSolveRate: 0.65 });

  const personal = evaluate(inputs, personalCalibration());
  const artifactOnly = evaluate(inputs, artifactCalibration());

  assert.deepEqual(
    personal.signals.filter((signal) => signal.status === "recommended")
      .map((signal) => [signal.id, signal.reason]),
    [["line:fork", "solve_rate"]]
  );
  // The fixed 50% baseline sees a 65% theme as strong: the #607 defect.
  assert.equal(
    artifactOnly.signals.some((signal) => signal.id === "line:fork"),
    false
  );
});

test("a theme solved at the user's own level produces no solve signal", () => {
  const evaluation = evaluate(
    history({ controlSolveRate: 0.88, forkSolveRate: 0.88 }),
    personalCalibration()
  );

  assert.deepEqual(evaluation.signals, []);
  assert.equal(evaluation.phase, "balanced");
});

test("a theme is never its own control: without other attempts its solve head is unavailable", () => {
  const inputs = history({ controlSolveRate: 0.88, forkSolveRate: 0.2, controls: 0 });

  const estimates = estimateTacticalProfileThemes({
    cells: buildTacticalProfileDailyCells(inputs, personalCalibration()),
    calibration: personalCalibration(),
    now: NOW
  });
  const fork = estimates.find((estimate) => estimate.theme === "fork");

  assert.ok(fork);
  assert.equal(fork.solveEvidenceWeight, 0);
  assert.equal(fork.solveConfidence, 0);
  assert.ok(fork.observedSolveRate < 0.3);
});

test("an artifact without a personal baseline keeps cells free of personal solve statistics", () => {
  const cells = buildTacticalProfileDailyCells(
    history({ controlSolveRate: 0.88, forkSolveRate: 0.65 }),
    artifactCalibration()
  );

  assert.ok(cells.length > 0);
  for (const cell of cells) {
    assert.deepEqual(cell.solveBaseline, []);
    assert.deepEqual(cell.solveTheme, []);
    assert.deepEqual(cell.solveControlExclusion, []);
  }
});

test("calibration validation rejects a malformed personal solve baseline", () => {
  for (const personalBaseline of [
    { minimumControlWeight: 0, offsetPriorSdLogit: 2 },
    { minimumControlWeight: 20, offsetPriorSdLogit: -1 },
    { minimumControlWeight: 20 },
    "personal"
  ]) {
    const calibration = personalCalibration();
    assert.throws(() =>
      assertValidTacticalProfileCalibrationArtifact({
        ...calibration,
        families: {
          ...calibration.families,
          line: {
            ...calibration.families.line,
            solve: {
              ...(calibration.families.line as { solve: object }).solve,
              personalBaseline
            }
          }
        }
      })
    );
  }
});

function logistic(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function evaluate(
  inputs: readonly TacticalProfileAttemptInput[],
  calibration: TacticalProfileCalibrationArtifact
) {
  return evaluateTacticalProfile({
    cells: buildTacticalProfileDailyCells(inputs, calibration),
    calibration,
    naturalFrequency: { line: { fork: 0.12 }, arrow_duel: {} },
    now: NOW
  });
}

/**
 * Line attempts at the user's Rating spread over ten days: fork puzzles and
 * uncurated control puzzles, with deterministic success patterns.
 */
function history(input: {
  controlSolveRate: number;
  forkSolveRate: number;
  controls?: number;
  forks?: number;
}): TacticalProfileAttemptInput[] {
  const controls = input.controls ?? 200;
  const forks = input.forks ?? 60;
  const attempts = (
    prefix: string,
    count: number,
    solveRate: number,
    themes: string[]
  ) => Array.from({ length: count }, (_, index) => {
    const day = 11 + (index % 10);
    const solved = Math.floor((index + 1) * solveRate) > Math.floor(index * solveRate);
    return attempt({
      id: `${prefix}-${index}`,
      sessionId: `session-${day}`,
      completedAt: `2026-07-${String(day).padStart(2, "0")}T18:00:00.000Z`,
      result: solved ? "correct" : "wrong",
      puzzleId: `${prefix}-puzzle-${index}`,
      themes,
      rating: 1460 + (index % 9) * 10
    });
  });
  return [
    ...attempts("control", controls, input.controlSolveRate, ["notCurated"]),
    ...attempts("fork", forks, input.forkSolveRate, ["fork"])
  ];
}

function attempt(input: {
  id: string;
  sessionId: string;
  completedAt: string;
  result: "correct" | "wrong";
  puzzleId: string;
  themes: string[];
  rating: number;
}): TacticalProfileAttemptInput {
  return {
    attempt: {
      id: input.id,
      source: "sprint",
      sessionId: input.sessionId,
      puzzleId: input.puzzleId,
      mode: "standard",
      ratingKey: "standard 5/20",
      result: input.result,
      startedAt: input.completedAt,
      completedAt: input.completedAt,
      elapsedMs: 30_000,
      ratingBefore: 1500
    },
    sessionConfig: {
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      puzzleTiming: { slowAfterSeconds: 40, timeoutAfterSeconds: 60 },
      targetCorrect: 15,
      maxMistakes: 3,
      ratingKey: "standard 5/20"
    },
    puzzle: {
      id: input.puzzleId,
      rating: input.rating,
      ratingDeviation: 80,
      themes: input.themes,
      solutionMoves: ["e7e5", "g1f3"]
    }
  };
}

function family(personal: boolean) {
  return {
    status: "provisional" as const,
    solve: {
      intercept: 0,
      ratingGapSlope: 1,
      timeoutLogCoefficient: 0,
      timeoutReferenceSeconds: 60,
      themePriorSdRating: 100,
      practicalDeficitRating: 20,
      minExpectedFailuresPer100: 2,
      ...(personal
        ? {
            personalBaseline: {
              minimumControlWeight: 20,
              offsetPriorSdLogit: 2
            }
          }
        : {})
    },
    speed: {
      minimumControlWeight: 8,
      slopePriorPrecision: 1,
      minimumResidualSd: 0.15,
      themePriorSdLogSeconds: 0.5,
      practicalTimeMultiplier: 1.2
    }
  };
}

function calibration(personal: boolean): TacticalProfileCalibrationArtifact {
  return {
    schemaVersion: 1,
    modelVersion: "test-v1",
    calibrationId: personal ? "test-personal-solve" : "test-artifact-solve",
    packFeatureHash: "test-pack-rd",
    createdAt: "2026-07-01T00:00:00.000Z",
    provenance: {
      inputSchemaVersion: 1,
      policyId: "test-policy",
      policyHash: `sha256:${"1".repeat(64)}`,
      corpusHash: null,
      reportHash: null,
      decisionEvidenceId: "owner-approved-provisional-trial",
      representativeOwnerApproved: false,
      familyReadiness: {
        line: { ready: true, reasons: [] },
        arrow_duel: { ready: true, reasons: [] }
      }
    },
    recencyHalfLifeDays: 90,
    evidence: {
      watchProbability: 0.75,
      recommendationExitProbability: 0.85,
      recommendationProbability: 0.9,
      strongProbability: 0.97,
      minDistinctPuzzles: 4,
      minDistinctSessions: 2
    },
    opportunity: { minimumWeight: 0.25, exponent: 0.5 },
    families: { line: family(personal), arrow_duel: family(personal) }
  };
}

function personalCalibration(): TacticalProfileCalibrationArtifact {
  return calibration(true);
}

function artifactCalibration(): TacticalProfileCalibrationArtifact {
  return calibration(false);
}
