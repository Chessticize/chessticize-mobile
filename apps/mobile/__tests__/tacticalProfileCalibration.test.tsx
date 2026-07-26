import type {
  PuzzlePackManifest,
  TacticalProfileCalibrationArtifact
} from "../../../packages/core/src/index";
import { productionTacticalProfileCalibration } from "../src/backend/tacticalProfileCalibration";

const bundledManifest = require(
  "../../../fixtures/puzzles/bundled-core-pack.manifest.json"
) as PuzzlePackManifest;
const bundledArtifact = require(
  "../../../config/tactical-profile-calibration-artifact-v1.json"
) as TacticalProfileCalibrationArtifact;

describe("production Tactical Profile calibration", () => {
  it("keeps the checked-in artifact unavailable until representative holdout passes", () => {
    const calibration = productionTacticalProfileCalibration(bundledManifest);

    expect(calibration).toEqual(bundledArtifact);
    expect(calibration.packFeatureHash).toBe(
      bundledManifest.tacticalAnalysis?.featureHash
    );
    expect(calibration.families.line.status).toBe("unavailable");
    expect(calibration.families.arrow_duel.status).toBe("unavailable");
  });

  it("accepts a valid calibrated artifact for the exact bundled pack", () => {
    const calibrated = {
      ...bundledArtifact,
      calibrationId: "representative-holdout-pass",
      families: {
        line: calibratedFamily(),
        arrow_duel: calibratedFamily()
      }
    } satisfies TacticalProfileCalibrationArtifact;

    expect(
      productionTacticalProfileCalibration(bundledManifest, calibrated)
    ).toBe(calibrated);
  });

  it("fails closed when an artifact is malformed", () => {
    const malformed = {
      ...bundledArtifact,
      evidence: {
        ...bundledArtifact.evidence,
        minDistinctSessions: 0
      }
    };

    const calibration = productionTacticalProfileCalibration(
      bundledManifest,
      malformed
    );

    expect(calibration.calibrationId).toBe(
      "tactical-profile-v1-unavailable"
    );
    expect(calibration.families.line).toEqual({
      status: "unavailable",
      reason: "The bundled Tactical Profile calibration artifact is invalid"
    });
  });

  it("fails closed when calibration and Core Pack feature identities differ", () => {
    const mismatched = {
      ...bundledArtifact,
      packFeatureHash: "sha256:different-core-pack"
    };

    const calibration = productionTacticalProfileCalibration(
      bundledManifest,
      mismatched
    );

    expect(calibration.packFeatureHash).toBe(
      bundledManifest.tacticalAnalysis?.featureHash
    );
    expect(calibration.families.arrow_duel).toEqual({
      status: "unavailable",
      reason:
        "The Tactical Profile calibration does not match the bundled puzzle pack"
    });
  });
});

function calibratedFamily() {
  return {
    status: "calibrated",
    solve: {
      intercept: 0,
      ratingGapSlope: 1,
      timeoutLogCoefficient: 0,
      timeoutReferenceSeconds: 60,
      themePriorSdRating: 100,
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
