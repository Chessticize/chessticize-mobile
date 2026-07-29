import type {
  TacticalFocusReason,
  TacticalProfileModelSignal,
  TacticalProfileTaskFamily,
  TacticalProfileThemeEstimate
} from "../../../../packages/core/src/index.ts";
import type {
  TacticalProfileProgress,
  TacticalProfileProgressSnapshot
} from "../../../../packages/storage/src/tactical-profile-service.ts";
import type {
  HistoryProgressPoint,
  HistoryProgressPresentation,
  HistoryProgressWeakness,
  HistoryStrengthSeries,
  HistoryWeaknessEffect
} from "./historyProgressPresentation.ts";

const MAX_VISIBLE_PROGRESS_THEMES = 8;

export function historyProgressPresentationFromModel(
  progress: TacticalProfileProgress
): HistoryProgressPresentation | undefined {
  if (progress.phase === "building") {
    return undefined;
  }

  const latest = progress.snapshots.at(-1);
  const currentSignals = new Map(
    progress.evaluation.signals.map((signal) => [signal.id, signal])
  );
  const observed = (latest?.estimates ?? [])
    .filter(hasProgressEvidence)
    .sort((left, right) => compareCurrentEstimates(
      left,
      right,
      currentSignals
    ));
  const wellSampled = observed.filter((estimate) =>
    isWellSampled(estimate, progress)
  );
  const strengths = observed
    .slice(0, MAX_VISIBLE_PROGRESS_THEMES)
    .flatMap((estimate) => {
      const signal = currentSignals.get(signalId(estimate));
      return seriesKinds(signal, estimate).map((kind) =>
        strengthSeries(
          estimate,
          kind,
          progress.snapshots
        )
      );
    });
  const weaknessSignal = progress.evaluation.signals
    .filter((signal) => signal.status === "recommended")
    .sort(compareWeaknessSignals)[0];
  const weakness = weaknessSignal
    ? weaknessPresentation(weaknessSignal, wellSampled)
    : undefined;
  const initialSeriesId =
    strengths.find((series) =>
      weaknessSignal &&
      series.id.startsWith(`${weaknessSignal.id}:`)
    )?.id ??
    strengths[0]?.id ??
    "";

  return {
    assurance: progress.assurance,
    periodLabel: periodLabel(progress.periodStart, progress.periodEnd),
    sampleLabel: "ordinary mixed Runs",
    sampleUnitLabel: "model-weighted observations",
    initialSeriesId,
    strengths,
    ...(weakness === undefined ? {} : { weakness }),
    ...(progress.phase === "balanced"
      ? balancedPresentation(observed)
      : {
          noWeaknessTone: "collecting",
          noWeaknessTitle: "Still collecting evidence",
          noWeaknessLabel:
            "Play more ordinary mixed Runs to build reliable stats across different puzzles and sessions."
        })
  };
}

function strengthSeries(
  current: TacticalProfileThemeEstimate,
  kind: Exclude<TacticalFocusReason, "both">,
  snapshots: readonly TacticalProfileProgressSnapshot[]
): HistoryStrengthSeries {
  const points = snapshots.map((snapshot) => {
    const estimate = snapshot.estimates.find(
      (candidate) =>
        candidate.taskFamily === current.taskFamily &&
        candidate.theme === current.theme
    );
    if (!estimate) {
      return unavailableProgressPoint(snapshot.asOf);
    }
    const point = progressPoint(snapshot.asOf, estimate, kind);
    return point ?? unavailableProgressPoint(snapshot.asOf);
  });
  const availablePoints = points.filter((point) => !point.unavailable);
  const first = availablePoints[0];
  const latest = availablePoints.at(-1);
  const themeLabel = humanizeTheme(current.theme);
  const label = `${themeLabel} · ${taskFamilyLabel(current.taskFamily)}`;
  const change = first && latest
    ? changePresentation(kind, first.value, latest.value)
    : {
        label: "No comparison yet",
        tone: "steady" as const
      };
  const maxValue = Math.max(
    ...availablePoints.map((point) => point.value),
    0
  );

  return {
    id: `${signalId(current)}:${kind}`,
    themeId: signalId(current),
    label,
    kind,
    metricLabel: kind === "completed_speed"
      ? "Solve time · lower is better"
      : "Accuracy · higher is better",
    baselineLabel: kind === "completed_speed"
      ? "1.00× matches your comparable completed puzzles"
      : "Recent attempts and stronger theme matches contribute more to n",
    scaleMax: kind === "completed_speed"
      ? Math.max(100, Math.ceil(maxValue * 1.15))
      : 100,
    changeLabel: change.label,
    changeTone: change.tone,
    summary: kind === "completed_speed"
      ? "n includes model-weighted correct solves completed before timeout; speed starts after enough personal controls."
      : "Wrong moves and timeouts count as misses.",
    points
  };
}

function unavailableProgressPoint(asOf: string): HistoryProgressPoint {
  return {
    label: shortUtcDate(asOf),
    value: 0,
    valueLabel: "—",
    sampleSize: 0,
    unavailable: true
  };
}

function progressPoint(
  asOf: string,
  estimate: TacticalProfileThemeEstimate,
  kind: Exclude<TacticalFocusReason, "both">
): HistoryProgressPoint | undefined {
  const evidenceWeight = kind === "completed_speed"
    ? estimate.speedEvidenceWeight
    : estimate.accuracyEvidenceWeight;
  if (evidenceWeight <= 0) {
    return undefined;
  }
  if (kind === "completed_speed") {
    return {
      label: shortUtcDate(asOf),
      value: 100 * estimate.completedTimeMultiplier,
      valueLabel: `${estimate.completedTimeMultiplier.toFixed(2)}×`,
      sampleSize: Math.max(1, Math.round(evidenceWeight))
    };
  }
  const accuracyPercent = 100 * estimate.observedSolveRate;
  return {
    label: shortUtcDate(asOf),
    value: accuracyPercent,
    valueLabel: `${Math.round(accuracyPercent)}%`,
    sampleSize: Math.max(1, Math.round(evidenceWeight))
  };
}

function weaknessPresentation(
  signal: TacticalProfileModelSignal,
  wellSampled: readonly TacticalProfileThemeEstimate[]
): HistoryProgressWeakness {
  const label = `${humanizeTheme(signal.theme)} · ${taskFamilyLabel(signal.taskFamily)}`;
  const effects: HistoryWeaknessEffect[] = [];
  if (signal.reason === "solve_rate" || signal.reason === "both") {
    effects.push({
      kind: "solve_rate",
      valueLabel: `${Math.round(signal.expectedFailuresPer100)} extra misses`,
      metricLabel: "per 100 comparable puzzles",
      comparisonLabel: relativeComparisonLabel(
        signal,
        wellSampled,
        "solve_rate"
      )
    });
  }
  if (signal.reason === "completed_speed" || signal.reason === "both") {
    effects.push({
      kind: "completed_speed",
      valueLabel:
        `${signal.completedTimeMultiplier.toFixed(2)}× comparable time`,
      metricLabel: "on correctly completed puzzles",
      comparisonLabel: relativeComparisonLabel(
        signal,
        wellSampled,
        "completed_speed"
      )
    });
  }

  return {
    label,
    reason: signal.reason,
    effects,
    evidenceLabel:
      `${signal.distinctPuzzleCount} different puzzles · ${signal.distinctSessionCount} sessions`,
    explanation:
      "This is the highest-confidence current model gap that passes the evidence, practical-impact, and diversity checks. One unusual attempt is not enough.",
    eligibilityLabel:
      "Correct attempts count once as solve successes. Wrong moves and timeouts count once as solve failures. Completed speed uses only correct, before-timeout attempts with reliable elapsed time and appears only after enough personal controls that exclude the theme being measured. Slow, Unclear, and Review membership do not decide the result."
  };
}

function relativeComparisonLabel(
  signal: TacticalProfileModelSignal,
  wellSampled: readonly TacticalProfileThemeEstimate[],
  kind: Exclude<TacticalFocusReason, "both">
): string {
  const peers = wellSampled.filter(
    (estimate) =>
      estimate.taskFamily === signal.taskFamily &&
      estimate.theme !== signal.theme &&
      (
        kind === "solve_rate"
          ? estimate.solveEvidenceWeight > 0
          : estimate.speedEvidenceWeight > 0
      )
  );
  const currentValue = kind === "solve_rate"
    ? signal.expectedFailuresPer100
    : signal.completedTimeMultiplier;
  const peersAreCloser = peers.length > 0 && peers.every((estimate) =>
    (
      kind === "solve_rate"
        ? estimate.expectedFailuresPer100
        : estimate.completedTimeMultiplier
    ) < currentValue
  );
  if (kind === "completed_speed") {
    const slowerPercent = Math.max(
      0,
      Math.round(100 * (signal.completedTimeMultiplier - 1))
    );
    const comparison =
      `${humanizeTheme(signal.theme)} takes about ${slowerPercent}% longer than your comparable completed puzzles after accounting for relative Rating difficulty, decision count, Run pace, Slow policy, and Timeout policy`;
    return peersAreCloser
      ? `${comparison}; the other well-sampled themes in this task family are closer to their personal baselines.`
      : `${comparison}. It is the highest-confidence current speed weakness among the well-sampled themes.`;
  }
  const modelContext =
    "after matching puzzle difficulty, your Rating, and task family";
  if (peersAreCloser) {
    return `${humanizeTheme(signal.theme)} stands farther from its matched expectation ${modelContext}; the other well-sampled themes in this task family are closer to theirs.`;
  }
  return `${humanizeTheme(signal.theme)} stands out ${modelContext}. It is the highest-confidence current weakness signal among the well-sampled themes, each measured against its own matched expectation.`;
}

function balancedPresentation(
  estimates: readonly TacticalProfileThemeEstimate[]
): Pick<
  HistoryProgressPresentation,
  "noWeaknessTone" | "noWeaknessTitle" | "noWeaknessLabel"
> {
  const hasAccuracy = estimates.some(
    (estimate) => estimate.accuracyEvidenceWeight > 0
  );
  const hasSpeed = estimates.some(
    (estimate) => estimate.speedEvidenceWeight > 0
  );
  if (hasAccuracy && hasSpeed) {
    return {
      noWeaknessTone: "balanced",
      noWeaknessTitle: "Recent play looks balanced",
      noWeaknessLabel:
        "No theme currently shows a repeated, meaningful weakness in accuracy or solve time."
    };
  }
  if (hasAccuracy) {
    return {
      noWeaknessTone: "balanced",
      noWeaknessTitle: "Recent play looks balanced",
      noWeaknessLabel:
        "No theme currently shows a repeated, meaningful accuracy weakness. Solve time is unavailable until there are enough comparable completed puzzles."
    };
  }
  if (hasSpeed) {
    return {
      noWeaknessTone: "balanced",
      noWeaknessTitle: "Recent play looks balanced",
      noWeaknessLabel:
        "No theme currently shows a repeated, meaningful solve-time weakness. Accuracy is unavailable until there is enough attempt evidence."
    };
  }
  return {
    noWeaknessTone: "balanced",
    noWeaknessTitle: "Recent play looks balanced",
    noWeaknessLabel:
      "Accuracy and solve time are unavailable until there is enough mixed-practice evidence."
  };
}

function seriesKinds(
  signal: TacticalProfileModelSignal | undefined,
  estimate: TacticalProfileThemeEstimate
): readonly Exclude<TacticalFocusReason, "both">[] {
  const preferred = preferredSeriesKind(signal, estimate);
  const other: Exclude<TacticalFocusReason, "both"> = preferred === "solve_rate"
    ? "completed_speed"
    : "solve_rate";
  const candidates: Exclude<TacticalFocusReason, "both">[] = [
    preferred,
    other
  ];
  return candidates;
}

function preferredSeriesKind(
  signal: TacticalProfileModelSignal | undefined,
  estimate: TacticalProfileThemeEstimate
): Exclude<TacticalFocusReason, "both"> {
  if (signal?.status === "recommended" && signal.reason === "completed_speed") {
    return "completed_speed";
  }
  if (
    signal?.status === "recommended" &&
    signal.reason === "both" &&
    signal.speedConfidence > signal.solveConfidence
  ) {
    return "completed_speed";
  }
  return estimate.accuracyEvidenceWeight > 0
    ? "solve_rate"
    : "completed_speed";
}

function hasProgressEvidence(estimate: TacticalProfileThemeEstimate): boolean {
  return estimate.accuracyEvidenceWeight > 0 || estimate.speedEvidenceWeight > 0;
}

function isWellSampled(
  estimate: TacticalProfileThemeEstimate,
  progress: Pick<
    TacticalProfileProgress,
    "minDistinctPuzzles" | "minDistinctSessions"
  >
): boolean {
  return estimate.distinctPuzzleCount >= progress.minDistinctPuzzles &&
    estimate.distinctSessionCount >= progress.minDistinctSessions &&
    hasProgressEvidence(estimate);
}

function compareCurrentEstimates(
  left: TacticalProfileThemeEstimate,
  right: TacticalProfileThemeEstimate,
  signals: ReadonlyMap<string, TacticalProfileModelSignal>
): number {
  const leftSignal = signals.get(signalId(left));
  const rightSignal = signals.get(signalId(right));
  return Number(rightSignal?.status === "recommended") -
      Number(leftSignal?.status === "recommended") ||
    weaknessConfidence(rightSignal) - weaknessConfidence(leftSignal) ||
    right.distinctPuzzleCount - left.distinctPuzzleCount ||
    left.taskFamily.localeCompare(right.taskFamily) ||
    left.theme.localeCompare(right.theme);
}

function compareWeaknessSignals(
  left: TacticalProfileModelSignal,
  right: TacticalProfileModelSignal
): number {
  return weaknessConfidence(right) - weaknessConfidence(left) ||
    right.distinctPuzzleCount - left.distinctPuzzleCount ||
    right.distinctSessionCount - left.distinctSessionCount ||
    left.taskFamily.localeCompare(right.taskFamily) ||
    left.theme.localeCompare(right.theme);
}

function weaknessConfidence(
  signal: TacticalProfileModelSignal | undefined
): number {
  if (!signal) {
    return 0;
  }
  if (signal.reason === "solve_rate") {
    return signal.solveConfidence;
  }
  if (signal.reason === "completed_speed") {
    return signal.speedConfidence;
  }
  return Math.max(signal.solveConfidence, signal.speedConfidence);
}

function changePresentation(
  kind: Exclude<TacticalFocusReason, "both">,
  first: number,
  latest: number
): {
  label: string;
  tone: HistoryStrengthSeries["changeTone"];
} {
  const delta = latest - first;
  const meaningfulDelta = kind === "completed_speed" ? 2 : 0.5;
  if (delta <= -meaningfulDelta) {
    return {
      label: kind === "completed_speed"
        ? `${Math.round(Math.abs(delta))}% less time`
        : `${Math.round(Math.abs(delta))} points lower`,
      tone: kind === "completed_speed" ? "improved" : "worsened"
    };
  }
  if (delta >= meaningfulDelta) {
    return {
      label: kind === "completed_speed"
        ? `${Math.round(delta)}% more time`
        : `${Math.round(delta)} points higher`,
      tone: kind === "completed_speed" ? "worsened" : "improved"
    };
  }
  return {
    label: kind === "completed_speed"
      ? "Time is steady"
      : "Accuracy is steady",
    tone: "steady"
  };
}

function signalId(input: {
  taskFamily: TacticalProfileTaskFamily;
  theme: string;
}): string {
  return `${input.taskFamily}:${input.theme}`;
}

function taskFamilyLabel(taskFamily: TacticalProfileTaskFamily): string {
  return taskFamily === "arrow_duel" ? "Arrow Duel" : "Puzzle solving";
}

function humanizeTheme(theme: string): string {
  const words = theme
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return words.length === 0
    ? "Tactical pattern"
    : words[0]!.toUpperCase() + words.slice(1);
}

function shortUtcDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    return timestamp;
  }
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ] as const;
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function periodLabel(start: string, end: string): string {
  return `${shortUtcDate(start)} – ${shortUtcDate(end)}`;
}
