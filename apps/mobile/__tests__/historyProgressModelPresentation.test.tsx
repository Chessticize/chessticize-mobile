import type {
  TacticalProfileEvaluation,
  TacticalProfileThemeEstimate
} from "../../../packages/core/src/index.ts";
import type {
  TacticalProfileProgress
} from "../../../packages/storage/src/tactical-profile-service.ts";
import {
  historyProgressPresentationFromModel
} from "../src/components/historyProgressModelPresentation.ts";

test("builds visible model reliability progress for a well-sampled balanced theme", () => {
  const progress = tacticalProgress({
    evaluation: {
      phase: "balanced",
      signals: [],
      rankedFocuses: [],
      observedThemeCount: 1
    },
    snapshots: [
      {
        asOf: "2026-07-18T00:00:00.000Z",
        estimates: [themeEstimate({
          expectedFailuresPer100: 12,
          solveEvidenceWeight: 8
        })]
      },
      {
        asOf: "2026-07-25T00:00:00.000Z",
        estimates: [themeEstimate({
          expectedFailuresPer100: 4,
          solveEvidenceWeight: 14
        })]
      }
    ]
  });

  const presentation = historyProgressPresentationFromModel(progress);
  const reliabilitySeries = presentation?.strengths[0];
  const speedSeries = presentation?.strengths[1];

  expect(presentation?.weakness).toBeUndefined();
  expect(presentation?.sampleUnitLabel).toBe("model-weighted observations");
  expect(presentation?.noWeaknessTone).toBe("balanced");
  expect(presentation?.noWeaknessLabel).toBe(
    "No theme currently shows a repeated, meaningful weakness in solve reliability or completed-puzzle speed."
  );
  expect(presentation?.strengths.map((series) => series.kind)).toEqual([
    "solve_rate",
    "completed_speed"
  ]);
  expect(reliabilitySeries?.themeId).toBe("line:fork");
  expect(reliabilitySeries?.label).toBe("Fork · Puzzle solving");
  expect(reliabilitySeries?.kind).toBe("solve_rate");
  expect(reliabilitySeries?.changeLabel).toBe("8 fewer / 100");
  expect(reliabilitySeries?.points.map((point) => point.sampleSize)).toEqual([8, 14]);
  expect(reliabilitySeries?.points.map((point) => point.valueLabel)).toEqual(["+12", "+4"]);
  expect(speedSeries?.themeId).toBe("line:fork");
  expect(speedSeries?.kind).toBe("completed_speed");
});

test("keeps observed balanced stats visible before recommendation diversity is complete", () => {
  const progress = tacticalProgress({
    snapshots: [{
      asOf: "2026-07-25T00:00:00.000Z",
      estimates: [themeEstimate({
        distinctPuzzleCount: 2,
        distinctSessionCount: 1,
        solveEvidenceWeight: 2
      })]
    }]
  });

  const presentation = historyProgressPresentationFromModel(progress);

  expect(presentation?.initialSeriesId).toBe("line:fork:solve_rate");
  expect(presentation?.strengths).toHaveLength(2);
  expect(presentation?.strengths[0]?.label).toBe("Fork · Puzzle solving");
});

test("shows completed-speed stats when a balanced theme has no solve observations", () => {
  const progress = tacticalProgress({
    snapshots: [{
      asOf: "2026-07-25T00:00:00.000Z",
      estimates: [themeEstimate({
        solveEvidenceWeight: 0,
        speedEvidenceWeight: 8,
        completedTimeMultiplier: 1.08
      })]
    }]
  });

  const presentation = historyProgressPresentationFromModel(progress);

  expect(presentation?.initialSeriesId).toBe("line:fork:completed_speed");
  expect(presentation?.strengths[0]?.kind).toBe("completed_speed");
  expect(presentation?.strengths[0]?.points[0]?.valueLabel).toBe("1.08×");
});

test("uses completed-time evidence for a model-selected speed weakness", () => {
  const pin = themeEstimate({
    theme: "pin",
    completedTimeMultiplier: 1.34,
    speedConfidence: 0.99,
    speedEvidenceWeight: 12
  });
  const fork = themeEstimate({
    theme: "fork",
    completedTimeMultiplier: 1.04,
    speedEvidenceWeight: 10
  });
  const progress = tacticalProgress({
    evaluation: {
      phase: "ready",
      signals: [{
        id: "line:pin",
        taskFamily: "line",
        theme: "pin",
        reason: "completed_speed",
        status: "recommended",
        confidence: "very_high",
        distinctPuzzleCount: 12,
        distinctSessionCount: 3,
        solveConfidence: 0.1,
        speedConfidence: 0.99,
        expectedFailuresPer100: 1,
        completedTimeMultiplier: 1.34,
        actionPriority: 2
      }],
      rankedFocuses: [{
        taskFamily: "line",
        theme: "pin",
        reason: "completed_speed"
      }],
      observedThemeCount: 2
    },
    snapshots: [
      {
        asOf: "2026-07-18T00:00:00.000Z",
        estimates: [
          { ...pin, completedTimeMultiplier: 1.18, speedEvidenceWeight: 6 },
          fork
        ]
      },
      {
        asOf: "2026-07-25T00:00:00.000Z",
        estimates: [pin, fork]
      }
    ]
  });

  const presentation = historyProgressPresentationFromModel(progress);
  const weakness = presentation?.weakness;
  const pinSeries = presentation?.strengths.find(
    (series) => series.id === "line:pin:completed_speed"
  );

  expect(pinSeries?.kind).toBe("completed_speed");
  expect(pinSeries?.points.map((point) => point.sampleSize)).toEqual([6, 12]);
  expect(weakness?.reason).toBe("completed_speed");
  expect(weakness?.effects[0]?.valueLabel).toBe("1.34× expected time");
  expect(weakness?.effects[0]?.comparisonLabel).toContain(
    "other well-sampled themes in this task family are closer"
  );
  expect(weakness?.eligibilityLabel).toContain(
    "only correct, before-timeout attempts with reliable elapsed time"
  );
  expect(weakness?.eligibilityLabel).toContain(
    "Slow, Unclear, and Review membership do not decide"
  );
});

test("compares weakness copy with well-sampled themes beyond the visible series limit", () => {
  const pin = themeEstimate({
    theme: "pin",
    completedTimeMultiplier: 1.34,
    speedConfidence: 0.99
  });
  const visiblePeers = [
    "a-file",
    "b-file",
    "c-file",
    "d-file",
    "e-file",
    "f-file",
    "g-file"
  ].map((theme) => themeEstimate({
    theme,
    completedTimeMultiplier: 1.04
  }));
  const hiddenSlowerPeer = themeEstimate({
    theme: "z-file",
    completedTimeMultiplier: 1.5
  });
  const progress = tacticalProgress({
    evaluation: {
      phase: "ready",
      signals: [{
        id: "line:pin",
        taskFamily: "line",
        theme: "pin",
        reason: "completed_speed",
        status: "recommended",
        confidence: "very_high",
        distinctPuzzleCount: 12,
        distinctSessionCount: 3,
        solveConfidence: 0.1,
        speedConfidence: 0.99,
        expectedFailuresPer100: 1,
        completedTimeMultiplier: 1.34,
        actionPriority: 2
      }],
      rankedFocuses: [{
        taskFamily: "line",
        theme: "pin",
        reason: "completed_speed"
      }],
      observedThemeCount: 9
    },
    snapshots: [{
      asOf: "2026-07-25T00:00:00.000Z",
      estimates: [pin, ...visiblePeers, hiddenSlowerPeer]
    }]
  });

  const presentation = historyProgressPresentationFromModel(progress);
  const comparison = presentation?.weakness?.effects[0]?.comparisonLabel;

  expect(presentation?.strengths).toHaveLength(8);
  expect(comparison).toContain(
    "highest-confidence current weakness signal among the well-sampled themes"
  );
  expect(comparison).not.toContain(
    "the other well-sampled themes in this task family are closer"
  );
});

test("selects a clear weakness by model confidence instead of training priority", () => {
  const commonLowerConfidence = modelSignal({
    id: "line:fork",
    theme: "fork",
    solveConfidence: 0.96,
    actionPriority: 8
  });
  const rareHigherConfidence = modelSignal({
    id: "line:pin",
    theme: "pin",
    solveConfidence: 0.995,
    actionPriority: 1
  });
  const progress = tacticalProgress({
    evaluation: {
      phase: "ready",
      signals: [commonLowerConfidence, rareHigherConfidence],
      rankedFocuses: [
        {
          taskFamily: "line",
          theme: "fork",
          reason: "solve_rate"
        },
        {
          taskFamily: "line",
          theme: "pin",
          reason: "solve_rate"
        }
      ],
      observedThemeCount: 2
    },
    snapshots: [{
      asOf: "2026-07-25T00:00:00.000Z",
      estimates: [
        themeEstimate({ theme: "fork" }),
        themeEstimate({ theme: "pin" })
      ]
    }]
  });

  const presentation = historyProgressPresentationFromModel(progress);

  expect(presentation?.weakness?.label).toBe("Pin · Puzzle solving");
  expect(presentation?.initialSeriesId).toBe("line:pin:solve_rate");
  expect(presentation?.weakness?.explanation).toContain(
    "highest-confidence current model gap"
  );
});

test("withholds presentation while the derived model cache is building", () => {
  expect(historyProgressPresentationFromModel(
    tacticalProgress({ phase: "building", buildStatus: "building" })
  )).toBeUndefined();
});

function tacticalProgress(
  overrides: Partial<TacticalProfileProgress> = {}
): TacticalProfileProgress {
  const evaluation: TacticalProfileEvaluation = overrides.evaluation ?? {
    phase: "balanced",
    signals: [],
    rankedFocuses: [],
    observedThemeCount: 0
  };
  return {
    phase: "balanced",
    buildStatus: "ready",
    assurance: "provisional",
    periodStart: "2026-06-06T00:00:00.000Z",
    periodEnd: "2026-07-25T00:00:00.000Z",
    snapshots: [],
    evaluation,
    minDistinctPuzzles: 4,
    minDistinctSessions: 2,
    ...overrides
  };
}

function themeEstimate(
  overrides: Partial<TacticalProfileThemeEstimate> = {}
): TacticalProfileThemeEstimate {
  return {
    taskFamily: "line",
    theme: "fork",
    distinctPuzzleCount: 12,
    distinctSessionCount: 3,
    solveEvidenceWeight: 12,
    speedEvidenceWeight: 8,
    solveConfidence: 0.1,
    speedConfidence: 0.1,
    expectedFailuresPer100: 2,
    completedTimeMultiplier: 1.02,
    ...overrides
  };
}

function modelSignal(
  overrides: Partial<TacticalProfileEvaluation["signals"][number]> = {}
): TacticalProfileEvaluation["signals"][number] {
  return {
    id: "line:fork",
    taskFamily: "line",
    theme: "fork",
    reason: "solve_rate",
    status: "recommended",
    confidence: "high",
    distinctPuzzleCount: 12,
    distinctSessionCount: 3,
    solveConfidence: 0.96,
    speedConfidence: 0.1,
    expectedFailuresPer100: 8,
    completedTimeMultiplier: 1,
    actionPriority: 1,
    ...overrides
  };
}
