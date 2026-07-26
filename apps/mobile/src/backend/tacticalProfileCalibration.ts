import type {
  PuzzlePackManifest,
  TacticalProfileCalibrationArtifact
} from "../../../../packages/core/src/index.ts";

/**
 * The production artifact deliberately fails closed until a representative,
 * owner-approved local corpus passes the predeclared holdout gates.
 */
export function productionTacticalProfileCalibration(
  manifest: PuzzlePackManifest
): TacticalProfileCalibrationArtifact {
  return {
    schemaVersion: 1,
    modelVersion: "tactical-profile-v1",
    calibrationId: "tactical-profile-v1-awaiting-representative-holdout",
    packFeatureHash:
      manifest.tacticalAnalysis?.featureHash ??
      "unavailable:bundled-pack-has-no-tactical-feature-identity",
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
      line: {
        status: "unavailable",
        reason: "A representative holdout calibration has not passed yet"
      },
      arrow_duel: {
        status: "unavailable",
        reason: "A representative holdout calibration has not passed yet"
      }
    }
  };
}
