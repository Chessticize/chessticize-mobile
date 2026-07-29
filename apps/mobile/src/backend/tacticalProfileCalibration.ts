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
const CALIBRATION_POLICY_ID = "tactical-profile-calibration-policy-v1";
const CALIBRATION_POLICY_HASH =
  "sha256:c851b18635e79299076b0a195b937ec375ef71f8adcd46aaf848bd38f3913869";

/**
 * Loads the checked-in calibration artifact only when both its domain contract
 * and Core Pack feature identity are valid. The contract permits the explicit
 * owner-approved provisional trial, but any malformed or mismatched artifact
 * keeps both task families unavailable.
 */
export function productionTacticalProfileCalibration(
  manifest: PuzzlePackManifest,
  candidate: unknown = bundledCalibrationArtifact
): TacticalProfileCalibrationArtifact {
  const packFeatureHash = manifest.tacticalAnalysis?.featureHash;
  if (
    typeof packFeatureHash !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(packFeatureHash)
  ) {
    return unavailableCalibration(
      MISSING_PACK_FEATURE_HASH,
      "The bundled puzzle pack has no Tactical Profile feature identity"
    );
  }
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
  if (
    candidate.provenance.policyId !== CALIBRATION_POLICY_ID ||
    candidate.provenance.policyHash !== CALIBRATION_POLICY_HASH
  ) {
    return unavailableCalibration(
      packFeatureHash,
      "The Tactical Profile calibration does not match the predeclared policy"
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
    provenance: {
      inputSchemaVersion: 1,
      policyId: CALIBRATION_POLICY_ID,
      policyHash: CALIBRATION_POLICY_HASH,
      corpusHash: null,
      reportHash: null,
      decisionEvidenceId: null,
      representativeOwnerApproved: false,
      familyReadiness: {
        line: { ready: false, reasons: [reason] },
        arrow_duel: { ready: false, reasons: [reason] }
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
