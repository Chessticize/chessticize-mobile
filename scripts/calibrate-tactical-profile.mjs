import { existsSync } from "node:fs";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  approximateSolveThemePosterior,
  exactSolveThemePosterior,
  tacticalProfileSolveBaselineFeatures,
  tacticalProfileSpeedBaselineFeatures
} from "../packages/core/src/index.ts";

const EPSILON = 1e-9;
const REQUIRED_DECISION_EVIDENCE = [
  "candidateModelComparison",
  "timeoutPolicyStratification",
  "residualInfluencePolicy",
  "heteroscedasticityPolicy",
  "priorCalibration",
  "practicalThresholdCalibration",
  "opportunityTransformCalibration",
  "actionUtilityCalibration",
  "focusedRunPolicyCalibration",
  "homeLeadCalibration"
];

export function splitWholeSessions(observations, holdoutFraction) {
  if (!(holdoutFraction > 0 && holdoutFraction < 1)) {
    throw new Error("holdoutFraction must be between zero and one");
  }
  const sessionTimes = new Map();
  for (const observation of observations) {
    const current = sessionTimes.get(observation.sessionId);
    if (current === undefined || observation.completedAt > current) {
      sessionTimes.set(observation.sessionId, observation.completedAt);
    }
  }
  const sessions = [...sessionTimes.entries()]
    .sort((left, right) => left[1].localeCompare(right[1]) || left[0].localeCompare(right[0]));
  if (sessions.length === 0) {
    return {
      train: [],
      holdout: [],
      trainSessionCount: 0,
      holdoutSessionCount: 0
    };
  }
  const holdoutCount = Math.max(1, Math.ceil(sessions.length * holdoutFraction));
  const holdoutIds = new Set(sessions.slice(-holdoutCount).map(([id]) => id));
  return {
    train: observations.filter((observation) => !holdoutIds.has(observation.sessionId)),
    holdout: observations.filter((observation) => holdoutIds.has(observation.sessionId)),
    trainSessionCount: sessions.length - holdoutCount,
    holdoutSessionCount: holdoutCount
  };
}

export function scoreBinaryPredictions(rows) {
  if (rows.length === 0) {
    return { count: 0, brierScore: null, logLoss: null };
  }
  let brier = 0;
  let logLoss = 0;
  for (const row of rows) {
    const probability = clampProbability(row.probability);
    brier += (probability - row.outcome) ** 2;
    logLoss -= row.outcome * Math.log(probability) +
      (1 - row.outcome) * Math.log(1 - probability);
  }
  return {
    count: rows.length,
    brierScore: brier / rows.length,
    logLoss: logLoss / rows.length
  };
}

export function reliabilityBins(rows, binCount = 10) {
  const bins = Array.from({ length: binCount }, (_, index) => ({
    minProbability: index / binCount,
    maxProbability: (index + 1) / binCount,
    count: 0,
    predictedTotal: 0,
    observedTotal: 0
  }));
  for (const row of rows) {
    const probability = clampProbability(row.probability);
    const index = Math.min(binCount - 1, Math.floor(probability * binCount));
    const bin = bins[index];
    bin.count += 1;
    bin.predictedTotal += probability;
    bin.observedTotal += row.outcome;
  }
  return bins.filter((bin) => bin.count > 0).map((bin) => ({
    minProbability: bin.minProbability,
    maxProbability: bin.maxProbability,
    count: bin.count,
    meanPredicted: bin.predictedTotal / bin.count,
    observedRate: bin.observedTotal / bin.count
  }));
}

export function evaluateCalibrationReadiness(report, policy, ownerApproved) {
  const reasons = [];
  if (!ownerApproved) {
    reasons.push("representative corpus has not been explicitly owner-approved");
  }
  const incompleteDecisions = REQUIRED_DECISION_EVIDENCE.filter(
    (decision) => report.decisionEvidence?.[decision] !== true
  );
  if (incompleteDecisions.length > 0) {
    reasons.push(
      `required calibration decisions are incomplete: ${incompleteDecisions.join(", ")}`
    );
  }
  const minimums = policy.minimums;
  const gates = policy.holdoutGates;
  if (report.solve.converged !== true) {
    reasons.push("solve optimizer did not converge");
  }
  if (report.solve.calibrationConverged !== true) {
    reasons.push("holdout calibration optimizer did not converge");
  }
  if (
    !allFinite(Object.values(report.solve.coefficients ?? {})) ||
    !allFinite([
      report.solve.brierScore,
      report.solve.logLoss,
      report.solve.calibrationIntercept,
      report.solve.calibrationSlope
    ])
  ) {
    reasons.push("solve calibration contains non-finite values");
  }
  if (
    !allFinite(Object.values(report.speed.coefficients ?? {})) ||
    !Number.isFinite(report.speed.residualSd) ||
    !(report.speed.residualSd > 0) ||
    !allFinite([
      report.speed.meanLogResidual,
      report.speed.rootMeanSquareLogResidual
    ])
  ) {
    reasons.push("speed calibration contains invalid values");
  }
  if (
    !Number.isFinite(report.solve.posteriorApproximation?.maximumMeanErrorRating) ||
    report.solve.posteriorApproximation.maximumMeanErrorRating >
      gates.maximumOneStepPosteriorMeanErrorRating ||
    !Number.isFinite(report.solve.posteriorApproximation?.maximumSdErrorRating) ||
    report.solve.posteriorApproximation.maximumSdErrorRating >
      gates.maximumOneStepPosteriorSdErrorRating
  ) {
    reasons.push("one-step posterior approximation gate failed");
  }
  if (report.trainSessionCount < minimums.trainSessionsPerFamily) {
    reasons.push("too few training sessions");
  }
  if (report.holdoutSessionCount < minimums.holdoutSessionsPerFamily) {
    reasons.push("too few holdout sessions");
  }
  if (report.trainAttemptCount < minimums.trainAttemptsPerFamily) {
    reasons.push("too few training attempts");
  }
  if (report.holdoutAttemptCount < minimums.holdoutAttemptsPerFamily) {
    reasons.push("too few holdout attempts");
  }
  if (report.solve.brierScore === null || report.solve.brierScore > gates.maximumBrierScore) {
    reasons.push("Brier score gate failed");
  }
  if (report.solve.logLoss === null || report.solve.logLoss > gates.maximumLogLoss) {
    reasons.push("log-loss gate failed");
  }
  if (
    report.solve.calibrationIntercept === null ||
    Math.abs(report.solve.calibrationIntercept) >
      gates.maximumCalibrationInterceptMagnitude
  ) {
    reasons.push("calibration intercept gate failed");
  }
  if (
    report.solve.calibrationSlope === null ||
    report.solve.calibrationSlope < gates.minimumCalibrationSlope ||
    report.solve.calibrationSlope > gates.maximumCalibrationSlope
  ) {
    reasons.push("calibration slope gate failed");
  }
  if (
    report.speed.holdoutCount < minimums.reliableSpeedHoldoutAttemptsPerFamily ||
    report.speed.meanLogResidual === null ||
    Math.abs(report.speed.meanLogResidual) >
      gates.maximumSpeedMeanLogResidualMagnitude ||
    report.speed.rootMeanSquareLogResidual === null ||
    report.speed.rootMeanSquareLogResidual >
      gates.maximumSpeedRootMeanSquareLogResidual
  ) {
    reasons.push("completed-speed holdout gate failed");
  }
  return { ready: reasons.length === 0, reasons };
}

export async function runCalibration(options) {
  const policy = JSON.parse(await readFile(options.policyPath, "utf8"));
  const manifest = JSON.parse(await readFile(options.manifestPath, "utf8"));
  if (policy.schemaVersion !== 1) {
    throw new Error("Unsupported calibration policy schema");
  }
  if (
    !Number.isInteger(policy.focusedRun?.runSize) ||
    policy.focusedRun.runSize < 1 ||
    !Number.isInteger(policy.focusedRun.recentPuzzleDays) ||
    policy.focusedRun.recentPuzzleDays < 0 ||
    !Array.isArray(policy.focusedRun.ratingBandHalfWidths) ||
    policy.focusedRun.ratingBandHalfWidths.length < 1 ||
    policy.focusedRun.themeShortfallBackfill?.destination !== "mixed_control" ||
    !Number.isInteger(
      policy.focusedRun.themeShortfallBackfill?.minimumPuzzlesPerTheme
    ) ||
    policy.focusedRun.themeShortfallBackfill.minimumPuzzlesPerTheme < 1
  ) {
    throw new Error("Calibration policy has no valid Focused Run policy");
  }
  if (!manifest.tacticalAnalysis?.puzzleRatingDeviation || !manifest.tacticalAnalysis.featureHash) {
    throw new Error("Puzzle pack manifest has no Tactical Profile feature identity");
  }
  const exports = await loadProgressExports(options.progressPaths);
  const database = new DatabaseSync(options.packPath, { readOnly: true });
  try {
    await verifyPackIdentity(manifest, options.packPath, database);
    const joined = joinCanonicalObservations(exports, database);
    const familyReports = {};
    for (const taskFamily of ["line", "arrow_duel"]) {
      familyReports[taskFamily] = calibrateFamily(
        joined.observations.filter((observation) => observation.taskFamily === taskFamily),
        policy,
        options.ownerApproved
      );
    }
    const report = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      policyId: policy.policyId,
      packFeatureHash: manifest.tacticalAnalysis.featureHash,
      input: {
        progressExportCount: exports.length,
        attemptCount: joined.inputAttemptCount,
        joinedObservationCount: joined.observations.length
      },
      missingness: joined.missingness,
      missingnessCohorts: joined.missingnessCohorts,
      families: familyReports,
      readyFamilies: Object.entries(familyReports)
        .filter(([, family]) => family.readiness.ready)
        .map(([family]) => family)
    };
    if (options.reportPath) {
      await writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    if (options.artifactPath) {
      const artifact = buildArtifact(report, familyReports, policy, manifest);
      await writeFile(options.artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    }
    return report;
  } finally {
    database.close();
  }
}

export async function verifyPackIdentity(manifest, packPath, database) {
  if (
    manifest.format !== "sqlite" ||
    !Number.isSafeInteger(manifest.packFileBytes) ||
    !/^sha256:[a-f0-9]{64}$/.test(manifest.packFileHash ?? "")
  ) {
    throw new Error(
      "Puzzle pack manifest has no authenticated SQLite file identity"
    );
  }
  const file = await stat(packPath);
  if (file.size !== manifest.packFileBytes) {
    throw new Error(
      `Puzzle pack size does not match manifest: ${file.size}/${manifest.packFileBytes}`
    );
  }
  const actualHash = `sha256:${await sha256File(packPath)}`;
  if (actualHash !== manifest.packFileHash) {
    throw new Error("Puzzle pack hash does not match manifest");
  }
  const row = database.prepare(`
    SELECT
      COUNT(*) AS puzzleCount,
      MIN(rating) AS minRating,
      MAX(rating) AS maxRating,
      SUM(CASE WHEN rating_deviation IS NULL THEN 1 ELSE 0 END)
        AS missingRatingDeviationCount
    FROM puzzles
  `).get();
  if (
    row?.puzzleCount !== manifest.puzzleCount ||
    row?.minRating !== manifest.rating?.min ||
    row?.maxRating !== manifest.rating?.max ||
    row?.missingRatingDeviationCount !== 0
  ) {
    throw new Error("Puzzle pack schema or Tactical Profile features do not match manifest");
  }
}

function calibrateFamily(observations, policy, ownerApproved) {
  const split = splitWholeSessions(observations, policy.holdoutFraction);
  const solveFit = fitLogistic(
    split.train.map((observation) => solveFeatureRow(observation))
  );
  const scoredHoldout = split.holdout.map((observation) => ({
    outcome: observation.success,
    probability: logistic(dot(solveFit.coefficients, solveFeatures(observation)))
  }));
  const solveScore = scoreBinaryPredictions(scoredHoldout);
  const calibration = fitLogistic(scoredHoldout.map((row) => ({
    features: [1, logit(clampProbability(row.probability))],
    outcome: row.outcome
  })));
  const speedTrain = split.train.filter(reliableSpeedObservation);
  const speedHoldout = split.holdout.filter(reliableSpeedObservation);
  const speedFit = fitLinear(speedTrain.map((observation) => ({
    features: speedFeatures(observation),
    outcome: Math.log(observation.elapsedMs / 1000)
  })));
  const speedResiduals = speedHoldout.map((observation) =>
    Math.log(observation.elapsedMs / 1000) -
    dot(speedFit.coefficients, speedFeatures(observation))
  );
  const speedResidualRows = speedHoldout.map((observation, index) => ({
    relativeDifficulty: speedFeatures(observation)[1],
    residual: speedResiduals[index]
  }));
  const report = {
    trainSessionCount: split.trainSessionCount,
    holdoutSessionCount: split.holdoutSessionCount,
    trainAttemptCount: split.train.length,
    holdoutAttemptCount: split.holdout.length,
    decisionEvidence: Object.fromEntries(
      REQUIRED_DECISION_EVIDENCE.map((decision) => [
        decision,
        decision === "timeoutPolicyStratification"
      ])
    ),
    solve: {
      coefficients: {
        intercept: solveFit.coefficients[0],
        ratingGapSlope: solveFit.coefficients[1],
        timeoutLogCoefficient: solveFit.coefficients[2]
      },
      converged: solveFit.converged,
      calibrationConverged: calibration.converged,
      brierScore: solveScore.brierScore,
      logLoss: solveScore.logLoss,
      calibrationIntercept: calibration.coefficients[0] ?? null,
      calibrationSlope: calibration.coefficients[1] ?? null,
      reliability: reliabilityBins(scoredHoldout),
      timeoutPolicyHoldout: timeoutPolicyHoldoutReport(
        split.holdout,
        solveFit.coefficients
      ),
      trainingInformationDiagonal: logisticInformationDiagonal(
        split.train,
        solveFit.coefficients
      ),
      posteriorApproximation: posteriorApproximationReport(
        policy.artifactParameters.solveThemePriorSdRating
      )
    },
    speed: {
      coefficients: {
        interceptLogSeconds: speedFit.coefficients[0],
        relativeDifficultyCoefficient: speedFit.coefficients[1],
        decisionCountCoefficient: speedFit.coefficients[2],
        paceLogCoefficient: speedFit.coefficients[3],
        slowPolicyLogCoefficient: speedFit.coefficients[4]
      },
      residualSd: standardDeviation(speedFit.residuals),
      trainCount: speedTrain.length,
      holdoutCount: speedHoldout.length,
      meanLogResidual: meanOrNull(speedResiduals),
      rootMeanSquareLogResidual: rootMeanSquareOrNull(speedResiduals),
      trainingInformationDiagonal: linearInformationDiagonal(speedTrain),
      residualQuantiles: {
        p05: quantileOrNull(speedResiduals, 0.05),
        p50: quantileOrNull(speedResiduals, 0.5),
        p95: quantileOrNull(speedResiduals, 0.95)
      },
      tailInfluence: residualTailInfluence(speedResiduals),
      residualByRelativeDifficultyQuartile:
        residualQuartiles(speedResidualRows)
    }
  };
  return {
    ...report,
    readiness: evaluateCalibrationReadiness(report, policy, ownerApproved)
  };
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

export function posteriorApproximationReport(priorSd) {
  const fixtures = [
    posteriorFixture("balanced", 24, (index) => index % 2 === 0 ? 1 : 0),
    posteriorFixture("weak", 24, (index) => index % 4 === 0 ? 1 : 0),
    posteriorFixture("strong", 24, (index) => index % 4 === 0 ? 0 : 1),
    posteriorFixture("near-separation", 24, () => 0)
  ].map(({ name, observations }) => {
    const approximate = approximateSolveThemePosterior(observations, priorSd);
    const exact = exactSolveThemePosterior(observations, priorSd);
    return {
      name,
      meanErrorRating: Math.abs(approximate.mean - exact.mean),
      sdErrorRating: Math.abs(
        approximate.standardDeviation - exact.standardDeviation
      )
    };
  });
  return {
    fixtures,
    maximumMeanErrorRating: Math.max(
      ...fixtures.map((fixture) => fixture.meanErrorRating)
    ),
    maximumSdErrorRating: Math.max(
      ...fixtures.map((fixture) => fixture.sdErrorRating)
    )
  };
}

function posteriorFixture(name, count, outcomeForIndex) {
  return {
    name,
    observations: Array.from({ length: count }, (_, index) => ({
      baselineProbability: 0.35 + (index % 5) * 0.075,
      sensitivity: 0.0035 + (index % 3) * 0.0005,
      success: outcomeForIndex(index),
      weight: 0.75 + (index % 4) * 0.125
    }))
  };
}

function joinCanonicalObservations(exports, database) {
  const sessions = new Map();
  const attempts = [];
  for (const progress of exports) {
    for (const session of progress.sprintSessions ?? []) {
      sessions.set(session.id, session);
    }
    attempts.push(...(progress.attempts ?? []));
  }
  const getPuzzle = database.prepare(`
    SELECT id, rating, rating_deviation AS ratingDeviation, solution_moves AS solutionMoves
    FROM puzzles
    WHERE id = ?
  `);
  const missingness = {
    scheduledReview: 0,
    focusedIntervention: 0,
    missingSessionConfig: 0,
    missingPuzzle: 0,
    missingPuzzleRatingDeviation: 0,
    missingRatingBefore: 0,
    missingTimeoutPolicy: 0,
    unreliableElapsedTime: 0
  };
  const missingnessCohorts = new Map();
  const observations = [];
  for (const attempt of deduplicateById(attempts)) {
    if (attempt.source !== "sprint") {
      missingness.scheduledReview += 1;
      continue;
    }
    const config = sessions.get(attempt.sessionId)?.config;
    if (!config) {
      missingness.missingSessionConfig += 1;
      continue;
    }
    const taskFamily = config.mode === "arrow_duel" ? "arrow_duel" : "line";
    const timeout = config.puzzleTiming?.timeoutAfterSeconds;
    const cohortKey = `${taskFamily}|${
      timeout > 0 ? `timeout:${timeout}` : "timeout:missing"
    }`;
    const cohort = missingnessCohorts.get(cohortKey) ?? {
      taskFamily,
      timeoutPolicySeconds: timeout > 0 ? timeout : null,
      inputAttemptCount: 0,
      joinedObservationCount: 0,
      focusedIntervention: 0,
      missingPuzzle: 0,
      missingPuzzleRatingDeviation: 0,
      missingRatingBefore: 0,
      missingTimeoutPolicy: 0,
      unreliableElapsedTime: 0
    };
    cohort.inputAttemptCount += 1;
    missingnessCohorts.set(cohortKey, cohort);
    if (
      config.tacticalFocus ||
      (config.themes ?? []).some((theme) => theme !== "mixed")
    ) {
      missingness.focusedIntervention += 1;
      cohort.focusedIntervention += 1;
      continue;
    }
    const puzzle = getPuzzle.get(attempt.puzzleId);
    if (!puzzle) {
      missingness.missingPuzzle += 1;
      cohort.missingPuzzle += 1;
      continue;
    }
    if (!(puzzle.ratingDeviation > 0)) {
      missingness.missingPuzzleRatingDeviation += 1;
      cohort.missingPuzzleRatingDeviation += 1;
      continue;
    }
    if (!Number.isFinite(attempt.ratingBefore)) {
      missingness.missingRatingBefore += 1;
      cohort.missingRatingBefore += 1;
      continue;
    }
    if (!(timeout > 0)) {
      missingness.missingTimeoutPolicy += 1;
      cohort.missingTimeoutPolicy += 1;
      continue;
    }
    if (!(attempt.elapsedMs > 0)) {
      missingness.unreliableElapsedTime += 1;
      cohort.unreliableElapsedTime += 1;
    }
    cohort.joinedObservationCount += 1;
    observations.push({
      sessionId: attempt.sessionId,
      completedAt: attempt.completedAt,
      taskFamily,
      success: attempt.result === "correct" ? 1 : 0,
      ratingBefore: attempt.ratingBefore,
      puzzleRating: puzzle.rating,
      puzzleRatingDeviation: puzzle.ratingDeviation,
      timeoutAfterSeconds: timeout,
      slowAfterSeconds: config.puzzleTiming?.slowAfterSeconds,
      perPuzzleSeconds: config.perPuzzleSeconds,
      elapsedMs: attempt.elapsedMs,
      decisionCount: config.mode === "arrow_duel"
        ? 1
        : Math.max(1, Math.ceil(String(puzzle.solutionMoves).trim().split(/\s+/).length / 2))
    });
  }
  return {
    observations,
    missingness,
    missingnessCohorts: [...missingnessCohorts.values()].sort((left, right) =>
      left.taskFamily.localeCompare(right.taskFamily) ||
      (left.timeoutPolicySeconds ?? -1) - (right.timeoutPolicySeconds ?? -1)
    ),
    inputAttemptCount: attempts.length
  };
}

function buildArtifact(report, familyReports, policy, manifest) {
  const parameters = policy.artifactParameters;
  const families = Object.fromEntries(["line", "arrow_duel"].map((family) => {
    const result = familyReports[family];
    if (!result.readiness.ready) {
      return [family, {
        status: "unavailable",
        reason: result.readiness.reasons.join("; ")
      }];
    }
    return [family, {
      status: "calibrated",
      solve: {
        ...result.solve.coefficients,
        timeoutReferenceSeconds: 60,
        themePriorSdRating: parameters.solveThemePriorSdRating,
        practicalDeficitRating: parameters.solvePracticalDeficitRating,
        minExpectedFailuresPer100: parameters.minimumExpectedFailuresPer100
      },
      speed: {
        ...result.speed.coefficients,
        residualSd: result.speed.residualSd,
        themePriorSdLogSeconds: parameters.speedThemePriorSdLogSeconds,
        practicalTimeMultiplier: parameters.practicalTimeMultiplier
      }
    }];
  }));
  return {
    schemaVersion: 1,
    modelVersion: "tactical-profile-v1",
    calibrationId: `${policy.policyId}-${report.createdAt}`,
    packFeatureHash: manifest.tacticalAnalysis.featureHash,
    createdAt: report.createdAt,
    recencyHalfLifeDays: parameters.recencyHalfLifeDays,
    evidence: {
      watchProbability: parameters.watchProbability,
      recommendationExitProbability: parameters.recommendationExitProbability,
      recommendationProbability: parameters.recommendationProbability,
      strongProbability: parameters.strongProbability,
      minDistinctPuzzles: parameters.minDistinctPuzzles,
      minDistinctSessions: parameters.minDistinctSessions
    },
    opportunity: {
      minimumWeight: parameters.minimumOpportunityWeight,
      exponent: parameters.opportunityExponent
    },
    focusedRun: {
      runSize: policy.focusedRun.runSize,
      recentPuzzleDays: policy.focusedRun.recentPuzzleDays,
      ratingBandHalfWidths: [...policy.focusedRun.ratingBandHalfWidths],
      themeShortfallBackfill: {
        ...policy.focusedRun.themeShortfallBackfill
      }
    },
    families
  };
}

function solveFeatureRow(observation) {
  return { features: solveFeatures(observation), outcome: observation.success };
}

function solveFeatures(observation) {
  const features = tacticalProfileSolveBaselineFeatures({
    puzzleRating: observation.puzzleRating,
    puzzleRatingDeviation: observation.puzzleRatingDeviation,
    ratingBefore: observation.ratingBefore,
    timeoutAfterSeconds: observation.timeoutAfterSeconds,
    timeoutReferenceSeconds: 60
  });
  return [
    1,
    features.ratingGap,
    features.timeoutLogRatio
  ];
}

function speedFeatures(observation) {
  const features = tacticalProfileSpeedBaselineFeatures({
    decisionCount: observation.decisionCount,
    perPuzzleSeconds: observation.perPuzzleSeconds,
    puzzleRating: observation.puzzleRating,
    ratingBefore: observation.ratingBefore,
    slowAfterSeconds: observation.slowAfterSeconds
  });
  return [
    1,
    features.relativeDifficulty,
    features.decisionCountLog,
    features.paceLogRatio,
    features.slowPolicyLogRatio
  ];
}

function reliableSpeedObservation(observation) {
  return observation.success === 1 &&
    Number.isFinite(observation.elapsedMs) &&
    observation.elapsedMs > 0 &&
    observation.elapsedMs < observation.timeoutAfterSeconds * 1000;
}

function timeoutPolicyHoldoutReport(observations, coefficients) {
  const groups = new Map();
  for (const observation of observations) {
    const rows = groups.get(observation.timeoutAfterSeconds) ?? [];
    rows.push({
      outcome: observation.success,
      probability: logistic(dot(coefficients, solveFeatures(observation)))
    });
    groups.set(observation.timeoutAfterSeconds, rows);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([timeoutPolicySeconds, rows]) => ({
      timeoutPolicySeconds,
      ...scoreBinaryPredictions(rows),
      reliability: reliabilityBins(rows)
    }));
}

function logisticInformationDiagonal(observations, coefficients) {
  const totals = Array(coefficients.length).fill(0);
  for (const observation of observations) {
    const features = solveFeatures(observation);
    const probability = logistic(dot(coefficients, features));
    const variance = probability * (1 - probability);
    for (let index = 0; index < totals.length; index += 1) {
      totals[index] += variance * features[index] ** 2;
    }
  }
  return totals;
}

function linearInformationDiagonal(observations) {
  const featureCount = observations[0] ? speedFeatures(observations[0]).length : 0;
  const totals = Array(featureCount).fill(0);
  for (const observation of observations) {
    const features = speedFeatures(observation);
    for (let index = 0; index < totals.length; index += 1) {
      totals[index] += features[index] ** 2;
    }
  }
  return totals;
}

function residualTailInfluence(residuals) {
  const finite = residuals.filter(Number.isFinite);
  if (finite.length === 0) {
    return {
      count: 0,
      lowerWinsorLimit: null,
      upperWinsorLimit: null,
      rawMean: null,
      winsorizedMean: null,
      rawRootMeanSquare: null,
      winsorizedRootMeanSquare: null
    };
  }
  const lower = quantileOrNull(finite, 0.05);
  const upper = quantileOrNull(finite, 0.95);
  const winsorized = finite.map((value) =>
    Math.min(upper, Math.max(lower, value))
  );
  return {
    count: finite.length,
    lowerWinsorLimit: lower,
    upperWinsorLimit: upper,
    rawMean: meanOrNull(finite),
    winsorizedMean: meanOrNull(winsorized),
    rawRootMeanSquare: rootMeanSquareOrNull(finite),
    winsorizedRootMeanSquare: rootMeanSquareOrNull(winsorized)
  };
}

function residualQuartiles(rows) {
  const sorted = rows
    .filter((row) =>
      Number.isFinite(row.relativeDifficulty) &&
      Number.isFinite(row.residual)
    )
    .sort((left, right) =>
      left.relativeDifficulty - right.relativeDifficulty
    );
  return Array.from({ length: 4 }, (_, quartile) => {
    const start = Math.floor(sorted.length * quartile / 4);
    const end = Math.floor(sorted.length * (quartile + 1) / 4);
    const group = sorted.slice(start, end);
    const residuals = group.map((row) => row.residual);
    return {
      quartile: quartile + 1,
      count: group.length,
      minimumRelativeDifficulty:
        group[0]?.relativeDifficulty ?? null,
      maximumRelativeDifficulty:
        group.at(-1)?.relativeDifficulty ?? null,
      meanLogResidual: meanOrNull(residuals),
      rootMeanSquareLogResidual: rootMeanSquareOrNull(residuals)
    };
  });
}

function fitLogistic(rows) {
  if (rows.length === 0) {
    return { coefficients: [], converged: false };
  }
  let coefficients = Array(rows[0].features.length).fill(0);
  let converged = false;
  for (let iteration = 0; iteration < 50; iteration += 1) {
    const gradient = Array(coefficients.length).fill(0);
    const information = matrix(coefficients.length);
    for (const row of rows) {
      const probability = logistic(dot(coefficients, row.features));
      const variance = Math.max(EPSILON, probability * (1 - probability));
      for (let left = 0; left < coefficients.length; left += 1) {
        gradient[left] += row.features[left] * (row.outcome - probability);
        for (let right = 0; right < coefficients.length; right += 1) {
          information[left][right] += row.features[left] * row.features[right] * variance;
        }
      }
    }
    for (let index = 0; index < coefficients.length; index += 1) {
      information[index][index] += 1e-6;
    }
    const step = solveLinearSystem(information, gradient);
    coefficients = coefficients.map((value, index) => value + step[index]);
    if (Math.max(...step.map(Math.abs)) < 1e-7) {
      converged = true;
      break;
    }
  }
  return { coefficients, converged };
}

function fitLinear(rows) {
  if (rows.length === 0) {
    return { coefficients: [], residuals: [] };
  }
  const dimensions = rows[0].features.length;
  const product = matrix(dimensions);
  const target = Array(dimensions).fill(0);
  for (const row of rows) {
    for (let left = 0; left < dimensions; left += 1) {
      target[left] += row.features[left] * row.outcome;
      for (let right = 0; right < dimensions; right += 1) {
        product[left][right] += row.features[left] * row.features[right];
      }
    }
  }
  for (let index = 0; index < dimensions; index += 1) {
    product[index][index] += 1e-6;
  }
  const coefficients = solveLinearSystem(product, target);
  return {
    coefficients,
    residuals: rows.map((row) => row.outcome - dot(coefficients, row.features))
  };
}

function solveLinearSystem(input, target) {
  const augmented = input.map((row, index) => [...row, target[index]]);
  for (let column = 0; column < augmented.length; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < augmented.length; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) {
        pivot = row;
      }
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    if (Math.abs(divisor) < 1e-12) {
      return Array(target.length).fill(0);
    }
    for (let index = column; index <= target.length; index += 1) {
      augmented[column][index] /= divisor;
    }
    for (let row = 0; row < augmented.length; row += 1) {
      if (row === column) continue;
      const scale = augmented[row][column];
      for (let index = column; index <= target.length; index += 1) {
        augmented[row][index] -= scale * augmented[column][index];
      }
    }
  }
  return augmented.map((row) => row[target.length]);
}

function matrix(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function logistic(value) {
  return value >= 0
    ? 1 / (1 + Math.exp(-value))
    : Math.exp(value) / (1 + Math.exp(value));
}

function logit(probability) {
  return Math.log(probability / (1 - probability));
}

function clampProbability(probability) {
  return Math.min(1 - EPSILON, Math.max(EPSILON, probability));
}

function meanOrNull(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rootMeanSquareOrNull(values) {
  return values.length === 0
    ? null
    : Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0) / values.length);
}

function standardDeviation(values) {
  const mean = meanOrNull(values);
  if (mean === null || values.length < 2) return 0;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      (values.length - 1)
  );
}

function quantileOrNull(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * probability)];
}

function allFinite(values) {
  return values.length > 0 &&
    values.every((value) => typeof value === "number" && Number.isFinite(value));
}

function deduplicateById(items) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

async function loadProgressExports(paths) {
  const exports = [];
  for (const path of paths) {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    exports.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  }
  return exports;
}

function parseArguments(argv) {
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--representative-owner-approved") {
      flags.add(argument);
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value`);
    }
    const existing = values.get(argument) ?? [];
    existing.push(value);
    values.set(argument, existing);
    index += 1;
  }
  const required = (key) => {
    const value = values.get(key)?.[0];
    if (!value) throw new Error(`${key} is required`);
    return resolve(value);
  };
  return {
    progressPaths: (values.get("--progress") ?? []).map(resolve),
    packPath: required("--pack"),
    manifestPath: required("--manifest"),
    policyPath: resolve(
      values.get("--policy")?.[0] ??
      "config/tactical-profile-calibration-policy-v1.json"
    ),
    reportPath: resolve(values.get("--report")?.[0] ?? "tactical-profile-calibration-report.json"),
    artifactPath: values.get("--artifact")?.[0]
      ? resolve(values.get("--artifact")[0])
      : undefined,
    ownerApproved: flags.has("--representative-owner-approved")
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.progressPaths.length === 0) {
    throw new Error("At least one --progress export is required");
  }
  for (const path of [
    ...options.progressPaths,
    options.packPath,
    options.manifestPath,
    options.policyPath
  ]) {
    if (!existsSync(path)) throw new Error(`Input not found: ${path}`);
  }
  const report = await runCalibration(options);
  process.stdout.write(`${JSON.stringify({
    reportPath: options.reportPath,
    artifactPath: options.artifactPath ?? null,
    readyFamilies: report.readyFamilies,
    missingness: report.missingness
  }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
