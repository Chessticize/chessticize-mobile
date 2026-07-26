import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCalibrationReadiness,
  posteriorApproximationReport,
  reliabilityBins,
  scoreBinaryPredictions,
  splitWholeSessions
} from "./calibrate-tactical-profile.mjs";

test("calibration holdout keeps every session wholly on one side", () => {
  const observations = [
    observation("s1", "2026-01-01"),
    observation("s1", "2026-01-01"),
    observation("s2", "2026-01-02"),
    observation("s3", "2026-01-03"),
    observation("s4", "2026-01-04"),
    observation("s5", "2026-01-05")
  ];
  const split = splitWholeSessions(observations, 0.4);
  assert.deepEqual(new Set(split.train.map((row) => row.sessionId)), new Set(["s1", "s2", "s3"]));
  assert.deepEqual(new Set(split.holdout.map((row) => row.sessionId)), new Set(["s4", "s5"]));
});

test("proper scoring and reliability reports are deterministic", () => {
  const rows = [
    { probability: 0.8, outcome: 1 },
    { probability: 0.2, outcome: 0 },
    { probability: 0.7, outcome: 0 }
  ];
  const score = scoreBinaryPredictions(rows);
  assert.ok(Math.abs(score.brierScore - 0.19) < 1e-12);
  assert.ok(score.logLoss > 0);
  assert.deepEqual(reliabilityBins(rows, 2), [
    {
      minProbability: 0,
      maxProbability: 0.5,
      count: 1,
      meanPredicted: 0.2,
      observedRate: 0
    },
    {
      minProbability: 0.5,
      maxProbability: 1,
      count: 2,
      meanPredicted: 0.75,
      observedRate: 0.5
    }
  ]);
});

test("artifact readiness fails closed without explicit representative-corpus approval", () => {
  const report = {
    trainSessionCount: 100,
    holdoutSessionCount: 40,
    trainAttemptCount: 1000,
    holdoutAttemptCount: 400,
    solve: {
      coefficients: {
        intercept: 0,
        ratingGapSlope: 1,
        timeoutLogCoefficient: 0
      },
      converged: true,
      calibrationConverged: true,
      brierScore: 0.2,
      logLoss: 0.6,
      calibrationIntercept: 0,
      calibrationSlope: 1,
      posteriorApproximation: {
        maximumMeanErrorRating: 8,
        maximumSdErrorRating: 4
      }
    },
    speed: {
      coefficients: {
        interceptLogSeconds: 3,
        relativeDifficultyCoefficient: 0,
        decisionCountCoefficient: 0,
        paceLogCoefficient: 0,
        slowPolicyLogCoefficient: 0
      },
      residualSd: 0.4,
      holdoutCount: 200,
      meanLogResidual: 0,
      rootMeanSquareLogResidual: 0.4
    }
  };
  const policy = {
    minimums: {
      trainSessionsPerFamily: 50,
      holdoutSessionsPerFamily: 20,
      trainAttemptsPerFamily: 500,
      holdoutAttemptsPerFamily: 200,
      reliableSpeedHoldoutAttemptsPerFamily: 100
    },
    holdoutGates: {
      maximumBrierScore: 0.25,
      maximumLogLoss: 0.7,
      maximumCalibrationInterceptMagnitude: 0.25,
      minimumCalibrationSlope: 0.75,
      maximumCalibrationSlope: 1.25,
      maximumSpeedMeanLogResidualMagnitude: 0.12,
      maximumSpeedRootMeanSquareLogResidual: 0.65,
      maximumOneStepPosteriorMeanErrorRating: 12,
      maximumOneStepPosteriorSdErrorRating: 8
    }
  };
  assert.deepEqual(evaluateCalibrationReadiness(report, policy, true), {
    ready: true,
    reasons: []
  });
  assert.deepEqual(evaluateCalibrationReadiness(report, policy, false), {
    ready: false,
    reasons: ["representative corpus has not been explicitly owner-approved"]
  });

  const invalid = structuredClone(report);
  invalid.solve.converged = false;
  invalid.solve.coefficients.ratingGapSlope = Number.NaN;
  invalid.solve.posteriorApproximation.maximumMeanErrorRating = 13;
  assert.deepEqual(
    evaluateCalibrationReadiness(invalid, policy, true).reasons,
    [
      "solve optimizer did not converge",
      "solve calibration contains non-finite values",
      "one-step posterior approximation gate failed"
    ]
  );
});

test("predeclared one-step posterior fixtures stay within the policy tolerance", () => {
  const report = posteriorApproximationReport(100);
  assert.deepEqual(
    report.fixtures.map((fixture) => fixture.name),
    ["balanced", "weak", "strong", "near-separation"]
  );
  assert.ok(report.maximumMeanErrorRating < 12);
  assert.ok(report.maximumSdErrorRating < 8);
});

function observation(sessionId, completedAt) {
  return { sessionId, completedAt };
}
