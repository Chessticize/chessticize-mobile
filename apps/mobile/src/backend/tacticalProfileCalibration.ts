import {
  assertValidTacticalProfileCalibrationArtifact,
  type PuzzlePackManifest,
  type TacticalProfileCalibrationArtifact
} from "../../../../packages/core/src/index.ts";

const bundledCalibrationArtifact = require(
  "../../../../config/tactical-profile-calibration-artifact-v1.json"
) as unknown;

const MISSING_PACK_FEATURE_HASH =
  "unavailable:bundled-pack-has-no-tactical-feature-identity";

/**
 * Loads the checked-in calibration artifact only when both its domain contract
 * and Core Pack feature identity are valid. Any failure keeps both task
 * families unavailable instead of letting provisional coefficients reach the
 * product.
 */
export function productionTacticalProfileCalibration(
  manifest: PuzzlePackManifest,
  candidate: unknown = bundledCalibrationArtifact
): TacticalProfileCalibrationArtifact {
  const packFeatureHash =
    manifest.tacticalAnalysis?.featureHash ?? MISSING_PACK_FEATURE_HASH;
  try {
    assertValidTacticalProfileCalibrationArtifact(candidate);
  } catch {
    return unavailableCalibration(
      packFeatureHash,
      "The bundled Tactical Profile calibration artifact is invalid"
    );
  }
  if (candidate.packFeatureHash !== packFeatureHash) {
    return unavailableCalibration(
      packFeatureHash,
      "The Tactical Profile calibration does not match the bundled puzzle pack"
    );
  }
  return candidate;
}

function unavailableCalibration(
  packFeatureHash: string,
  reason: string
): TacticalProfileCalibrationArtifact {
  return {
    schemaVersion: 1,
    modelVersion: "tactical-profile-v1",
    calibrationId: "tactical-profile-v1-unavailable",
    packFeatureHash,
    createdAt: "2026-07-25T00:00:00.000Z",
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
    focusedRun: {
      runSize: 15,
      recentPuzzleDays: 30,
      ratingBandHalfWidths: [100, 200]
    },
    families: {
      line: { status: "unavailable", reason },
      arrow_duel: { status: "unavailable", reason }
    }
  };
}
