import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  assertValidTacticalProfileCalibrationArtifact
} from "../packages/core/src/index.ts";
import {
  calibrationContentHash,
  evaluateCalibrationReadiness,
  posteriorApproximationReport,
  reliabilityBins,
  runCalibration,
  scoreBinaryPredictions,
  splitWholeSessions,
  verifyPackIdentity
} from "./calibrate-tactical-profile.mjs";

test("bundled calibration artifact is valid and tied to the predeclared policy and pack", async () => {
  const [artifact, policy, manifest] = await Promise.all([
    readFile("config/tactical-profile-calibration-artifact-v1.json", "utf8"),
    readFile("config/tactical-profile-calibration-policy-v1.json", "utf8"),
    readFile("fixtures/puzzles/bundled-core-pack.manifest.json", "utf8")
  ]).then((values) => values.map((value) => JSON.parse(value)));

  assert.doesNotThrow(() =>
    assertValidTacticalProfileCalibrationArtifact(artifact)
  );
  assert.equal(artifact.provenance.policyId, policy.policyId);
  assert.equal(
    artifact.provenance.policyHash,
    calibrationContentHash(policy)
  );
  assert.equal(
    artifact.packFeatureHash,
    manifest.tacticalAnalysis.featureHash
  );
  assert.deepEqual(
    Object.values(artifact.families).map((family) => family.status),
    ["unavailable", "unavailable"]
  );
  const calibratedFamilies = Object.entries(artifact.families)
    .filter(([, family]) => family.status === "calibrated")
    .map(([taskFamily]) => taskFamily);
  if (calibratedFamilies.length > 0) {
    const reportPath =
      "config/tactical-profile-calibration-report-v1.json";
    assert.equal(
      existsSync(reportPath),
      true,
      "A production calibration report must accompany calibrated families"
    );
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(
      artifact.provenance.reportHash,
      calibrationContentHash(report)
    );
    assert.equal(
      artifact.provenance.corpusHash,
      report.input.corpusHash
    );
    assert.equal(
      artifact.provenance.decisionEvidenceId,
      report.input.decisionEvidenceId
    );
    assert.equal(report.input.representativeOwnerApproved, true);
    assert.equal(report.input.policyHash, calibrationContentHash(policy));
    assert.equal(report.packFeatureHash, manifest.tacticalAnalysis.featureHash);
    for (const taskFamily of calibratedFamilies) {
      assert.deepEqual(
        artifact.provenance.familyReadiness[taskFamily],
        report.families[taskFamily].readiness
      );
      assert.equal(report.families[taskFamily].readiness.ready, true);
    }
  }
});

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
    decisionEvidence: completeDecisionEvidence(),
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
      },
      timeoutPolicyTrain: [
        { timeoutPolicySeconds: 30, count: 100 },
        { timeoutPolicySeconds: 60, count: 100 }
      ],
      timeoutPolicyHoldout: [
        { timeoutPolicySeconds: 30, count: 50 },
        { timeoutPolicySeconds: 60, count: 50 }
      ]
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
      reliableSpeedHoldoutAttemptsPerFamily: 100,
      timeoutPolicyHoldoutCohortsPerFamily: 2,
      timeoutPolicyHoldoutAttemptsPerCohort: 50,
      timeoutPolicyTrainCohortsPerFamily: 2,
      timeoutPolicyTrainAttemptsPerCohort: 100
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
  const oneTimeoutPolicy = structuredClone(report);
  oneTimeoutPolicy.solve.timeoutPolicyHoldout = [
    { timeoutPolicySeconds: 30, count: 100 }
  ];
  assert.deepEqual(
    evaluateCalibrationReadiness(
      oneTimeoutPolicy,
      policy,
      true
    ).reasons,
    ["too few qualified timeout-policy holdout cohorts"]
  );
  const oneTrainingTimeoutPolicy = structuredClone(report);
  oneTrainingTimeoutPolicy.solve.timeoutPolicyTrain = [
    { timeoutPolicySeconds: 30, count: 200 }
  ];
  assert.deepEqual(
    evaluateCalibrationReadiness(
      oneTrainingTimeoutPolicy,
      policy,
      true
    ).reasons,
    ["too few qualified timeout-policy training cohorts"]
  );

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

test("calibration authenticates the exact SQLite pack before fitting", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tactical-pack-identity-"));
  const packPath = join(directory, "pack.sqlite");
  try {
    const writer = new DatabaseSync(packPath);
    writer.exec(`
      CREATE TABLE puzzles (
        id TEXT PRIMARY KEY,
        rating INTEGER NOT NULL,
        rating_deviation INTEGER,
        solution_moves TEXT NOT NULL
      );
      INSERT INTO puzzles (id, rating, rating_deviation, solution_moves)
      VALUES ('p1', 900, 80, 'e2e4');
    `);
    writer.close();
    const bytes = await readFile(packPath);
    const manifest = {
      format: "sqlite",
      packFileBytes: (await stat(packPath)).size,
      packFileHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      puzzleCount: 1,
      rating: { min: 900, max: 900 }
    };
    const reader = new DatabaseSync(packPath, { readOnly: true });
    try {
      await verifyPackIdentity(manifest, packPath, reader);
      await assert.rejects(
        verifyPackIdentity(
          { ...manifest, packFileHash: `sha256:${"0".repeat(64)}` },
          packPath,
          reader
        ),
        /hash does not match/
      );
      await assert.rejects(
        verifyPackIdentity(
          { ...manifest, puzzleCount: 2 },
          packPath,
          reader
        ),
        /features do not match/
      );
    } finally {
      reader.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("calibration joins canonical exports and emits cohort reports without activating provisional decisions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tactical-calibration-e2e-"));
  const packPath = join(directory, "pack.sqlite");
  const manifestPath = join(directory, "manifest.json");
  const policyPath = join(directory, "policy.json");
  const progressPath = join(directory, "progress.json");
  const decisionEvidencePath = join(directory, "decision-evidence.json");
  const reportPath = join(directory, "report.json");
  const artifactPath = join(directory, "artifact.json");
  try {
    const writer = new DatabaseSync(packPath);
    writer.exec(`
      CREATE TABLE puzzles (
        id TEXT PRIMARY KEY,
        rating INTEGER NOT NULL,
        rating_deviation INTEGER,
        solution_moves TEXT NOT NULL
      );
      INSERT INTO puzzles (id, rating, rating_deviation, solution_moves)
      VALUES ('p1', 900, 80, 'e2e4 e7e5');
    `);
    writer.close();
    const bytes = await readFile(packPath);
    const packFileHash =
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    await writeFile(manifestPath, JSON.stringify({
      format: "sqlite",
      packFileBytes: bytes.length,
      packFileHash,
      puzzleCount: 1,
      rating: { min: 900, max: 900 },
      tacticalAnalysis: {
        puzzleRatingDeviation: true,
        featureHash: `sha256:${"1".repeat(64)}`
      }
    }));
    const policy = calibrationPolicy();
    const policyHash = calibrationContentHash(policy);
    await writeFile(policyPath, JSON.stringify(policy));
    const progress = calibrationProgress();
    const corpusHash = `sha256:${createHash("sha256")
      .update(JSON.stringify([progress]))
      .digest("hex")}`;
    await writeFile(progressPath, JSON.stringify(progress));

    const report = await runCalibration({
      progressPaths: [progressPath],
      packPath,
      manifestPath,
      policyPath,
      reportPath,
      artifactPath,
      ownerApproved: true
    });
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));

    assert.equal(report.input.joinedObservationCount, 4);
    assert.equal(artifact.provenance.inputSchemaVersion, 1);
    assert.equal(artifact.provenance.policyId, policy.policyId);
    assert.equal(artifact.provenance.policyHash, policyHash);
    assert.equal(artifact.provenance.corpusHash, corpusHash);
    assert.equal(
      artifact.provenance.reportHash,
      calibrationContentHash(report)
    );
    assert.equal(
      artifact.provenance.representativeOwnerApproved,
      true
    );
    assert.deepEqual(
      artifact.provenance.familyReadiness.line,
      report.families.line.readiness
    );
    assert.doesNotThrow(() =>
      assertValidTacticalProfileCalibrationArtifact(artifact)
    );
    assert.deepEqual(
      report.missingnessCohorts.map((cohort) => [
        cohort.taskFamily,
        cohort.timeoutPolicySeconds,
        cohort.joinedObservationCount
      ]),
      [["line", 30, 2], ["line", 60, 2]]
    );
    assert.deepEqual(
      report.families.line.solve.timeoutPolicyHoldout.map(
        (cohort) => cohort.timeoutPolicySeconds
      ),
      [60]
    );
    assert.equal(
      report.families.line.decisionEvidence.timeoutPolicyStratification,
      false
    );
    assert.equal(
      report.families.line.decisionEvidence.actionUtilityCalibration,
      false
    );
    assert.equal(artifact.families.line.status, "unavailable");
    assert.match(
      artifact.families.line.reason,
      /required calibration decisions are incomplete/
    );

    await writeFile(decisionEvidencePath, JSON.stringify({
      schemaVersion: 1,
      decisionId: "owner-reviewed-test-decisions",
      packFileHash,
      corpusHash,
      policyHash,
      families: {
        line: completeDecisionEvidence(),
        arrow_duel: completeDecisionEvidence()
      }
    }));
    const reviewed = await runCalibration({
      progressPaths: [progressPath],
      packPath,
      manifestPath,
      policyPath,
      reportPath,
      artifactPath,
      decisionEvidencePath,
      ownerApproved: true
    });
    assert.equal(
      reviewed.input.decisionEvidenceId,
      "owner-reviewed-test-decisions"
    );
    assert.equal(
      reviewed.families.line.decisionEvidence.actionUtilityCalibration,
      true
    );
    assert.equal(
      reviewed.families.line.readiness.reasons.some((reason) =>
        reason.includes("required calibration decisions are incomplete")
      ),
      false
    );

    await writeFile(decisionEvidencePath, JSON.stringify({
      schemaVersion: 1,
      decisionId: "wrong-pack",
      packFileHash: `sha256:${"0".repeat(64)}`,
      corpusHash,
      policyHash,
      families: {
        line: completeDecisionEvidence(),
        arrow_duel: completeDecisionEvidence()
      }
    }));
    await assert.rejects(
      runCalibration({
        progressPaths: [progressPath],
        packPath,
        manifestPath,
        policyPath,
        reportPath,
        artifactPath,
        decisionEvidencePath,
        ownerApproved: true
      }),
      /does not match the authenticated pack, corpus, and policy/
    );

    await writeFile(decisionEvidencePath, JSON.stringify({
      schemaVersion: 1,
      decisionId: "wrong-policy",
      packFileHash,
      corpusHash,
      policyHash: `sha256:${"0".repeat(64)}`,
      families: {
        line: completeDecisionEvidence(),
        arrow_duel: completeDecisionEvidence()
      }
    }));
    await assert.rejects(
      runCalibration({
        progressPaths: [progressPath],
        packPath,
        manifestPath,
        policyPath,
        reportPath,
        artifactPath,
        decisionEvidencePath,
        ownerApproved: true
      }),
      /does not match the authenticated pack, corpus, and policy/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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

function completeDecisionEvidence() {
  return {
    candidateModelComparison: true,
    timeoutPolicyStratification: true,
    residualInfluencePolicy: true,
    heteroscedasticityPolicy: true,
    priorCalibration: true,
    practicalThresholdCalibration: true,
    opportunityTransformCalibration: true,
    actionUtilityCalibration: true,
    focusedRunPolicyCalibration: true,
    homeLeadCalibration: true
  };
}

function calibrationPolicy() {
  return {
    schemaVersion: 1,
    policyId: "test-policy",
    holdoutFraction: 0.5,
    minimums: {
      trainSessionsPerFamily: 1,
      holdoutSessionsPerFamily: 1,
      trainAttemptsPerFamily: 1,
      holdoutAttemptsPerFamily: 1,
      reliableSpeedHoldoutAttemptsPerFamily: 1,
      timeoutPolicyHoldoutCohortsPerFamily: 2,
      timeoutPolicyHoldoutAttemptsPerCohort: 1,
      timeoutPolicyTrainCohortsPerFamily: 2,
      timeoutPolicyTrainAttemptsPerCohort: 1
    },
    holdoutGates: {
      maximumBrierScore: 1,
      maximumLogLoss: 10,
      maximumCalibrationInterceptMagnitude: 10,
      minimumCalibrationSlope: -10,
      maximumCalibrationSlope: 10,
      maximumSpeedMeanLogResidualMagnitude: 10,
      maximumSpeedRootMeanSquareLogResidual: 10,
      maximumOneStepPosteriorMeanErrorRating: 100,
      maximumOneStepPosteriorSdErrorRating: 100
    },
    focusedRun: {
      runSize: 15,
      recentPuzzleDays: 30,
      ratingBandHalfWidths: [100, 200],
      themeShortfallBackfill: {
        destination: "mixed_control",
        minimumPuzzlesPerTheme: 1
      }
    },
    artifactParameters: {
      recencyHalfLifeDays: 90,
      watchProbability: 0.75,
      recommendationExitProbability: 0.85,
      recommendationProbability: 0.9,
      strongProbability: 0.97,
      minDistinctPuzzles: 4,
      minDistinctSessions: 2,
      minimumOpportunityWeight: 0.25,
      opportunityExponent: 0.5,
      solveThemePriorSdRating: 100,
      solvePracticalDeficitRating: 20,
      minimumExpectedFailuresPer100: 2,
      speedThemePriorSdLogSeconds: 0.5,
      practicalTimeMultiplier: 1.2
    }
  };
}

function calibrationProgress() {
  const sprintSessions = [];
  const attempts = [];
  for (let index = 0; index < 4; index += 1) {
    const sessionId = `s${index + 1}`;
    const timeoutAfterSeconds = index < 2 ? 30 : 60;
    const completedAt = `2026-01-0${index + 1}T00:00:10.000Z`;
    sprintSessions.push({
      id: sessionId,
      completedAt,
      config: {
        mode: "standard",
        themes: ["mixed"],
        perPuzzleSeconds: 20,
        puzzleTiming: {
          slowAfterSeconds: 40,
          timeoutAfterSeconds
        }
      }
    });
    attempts.push({
      id: `a${index + 1}`,
      source: "sprint",
      sessionId,
      puzzleId: "p1",
      result: index % 2 === 0 ? "correct" : "wrong",
      ratingBefore: 900 + index * 10,
      elapsedMs: 10_000 + index * 1_000,
      completedAt
    });
  }
  return { sprintSessions, attempts };
}
