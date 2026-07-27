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

const MAX_VISIBLE_PROGRESS_SERIES = 8;

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
  const wellSampled = (latest?.estimates ?? [])
    .filter((estimate) => isWellSampled(estimate, progress))
    .sort((left, right) => compareCurrentEstimates(
      left,
      right,
      currentSignals
    ));
  const strengths = wellSampled
    .slice(0, MAX_VISIBLE_PROGRESS_SERIES)
    .flatMap((estimate) => {
      const signal = currentSignals.get(signalId(estimate));
      const kind = seriesKind(signal);
      const series = strengthSeries(
        estimate,
        kind,
        progress.snapshots
      );
      return series ? [series] : [];
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
    noWeaknessLabel:
      "No theme currently passes the Tactical Profile evidence, practical-impact, and diversity checks for either solve reliability or completed-puzzle speed."
  };
}

function strengthSeries(
  current: TacticalProfileThemeEstimate,
  kind: Exclude<TacticalFocusReason, "both">,
  snapshots: readonly TacticalProfileProgressSnapshot[]
): HistoryStrengthSeries | undefined {
  const points = snapshots.flatMap((snapshot) => {
    const estimate = snapshot.estimates.find(
      (candidate) =>
        candidate.taskFamily === current.taskFamily &&
        candidate.theme === current.theme
    );
    if (!estimate) {
      return [];
    }
    const point = progressPoint(snapshot.asOf, estimate, kind);
    return point ? [point] : [];
  });
  if (points.length === 0) {
    return undefined;
  }
  const first = points[0] as HistoryProgressPoint;
  const latest = points.at(-1) as HistoryProgressPoint;
  const themeLabel = humanizeTheme(current.theme);
  const label = `${themeLabel} · ${taskFamilyLabel(current.taskFamily)}`;
  const change = changePresentation(kind, first.value, latest.value);
  const maxValue = Math.max(...points.map((point) => point.value), 0);

  return {
    id: `${signalId(current)}:${kind}`,
    label,
    kind,
    metricLabel: kind === "completed_speed"
      ? "Completed time above matched expectation · lower is better"
      : "Extra misses per 100 comparable puzzles · lower is better",
    baselineLabel: kind === "completed_speed"
      ? "1.00× = matched completed-puzzle time"
      : "0 = matched solve expectation",
    scaleMax: kind === "completed_speed"
      ? Math.max(20, Math.ceil(maxValue * 1.15))
      : Math.max(10, Math.ceil(maxValue * 1.15)),
    changeLabel: change.label,
    changeTone: change.tone,
    summary: kind === "completed_speed"
      ? `Reliable, correctly completed ${themeLabel} puzzles now take about ${latest.valueLabel} the matched expectation, compared with ${first.valueLabel} at the first visible point. Wrong moves and timeouts stay in solve reliability instead of this speed estimate.`
      : `${themeLabel} solve reliability is now estimated at ${latest.valueLabel} extra misses per 100 comparable puzzles, compared with ${first.valueLabel} at the first visible point. Puzzle difficulty, your Rating, and task family are matched before estimating the gap.`,
    points
  };
}

function progressPoint(
  asOf: string,
  estimate: TacticalProfileThemeEstimate,
  kind: Exclude<TacticalFocusReason, "both">
): HistoryProgressPoint | undefined {
  const evidenceWeight = kind === "completed_speed"
    ? estimate.speedEvidenceWeight
    : estimate.solveEvidenceWeight;
  if (evidenceWeight <= 0) {
    return undefined;
  }
  if (kind === "completed_speed") {
    return {
      label: shortUtcDate(asOf),
      value: Math.max(0, 100 * (estimate.completedTimeMultiplier - 1)),
      valueLabel: `${estimate.completedTimeMultiplier.toFixed(2)}×`,
      sampleSize: Math.max(1, Math.round(evidenceWeight))
    };
  }
  return {
    label: shortUtcDate(asOf),
    value: estimate.expectedFailuresPer100,
    valueLabel: estimate.expectedFailuresPer100 < 0.5
      ? "0"
      : `+${Math.round(estimate.expectedFailuresPer100)}`,
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
      valueLabel: `${signal.completedTimeMultiplier.toFixed(2)}× expected time`,
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
      "Correct attempts count once as solve successes. Wrong moves and timeouts count once as solve failures. Completed speed uses only correct, before-timeout attempts with reliable elapsed time. Slow, Unclear, and Review membership do not decide the result."
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
  const modelContext = kind === "solve_rate"
    ? "after matching puzzle difficulty, your Rating, and task family"
    : "after matching difficulty, pace, timing policy, and decision count";
  if (peersAreCloser) {
    return `${humanizeTheme(signal.theme)} stands farther from its matched expectation ${modelContext}; the other well-sampled themes in this task family are closer to theirs.`;
  }
  return `${humanizeTheme(signal.theme)} stands out ${modelContext}. It is the highest-confidence current weakness signal among the well-sampled themes, each measured against its own matched expectation.`;
}

function seriesKind(
  signal: TacticalProfileModelSignal | undefined
): Exclude<TacticalFocusReason, "both"> {
  if (signal?.reason === "completed_speed") {
    return "completed_speed";
  }
  if (signal?.reason === "both" && signal.speedConfidence > signal.solveConfidence) {
    return "completed_speed";
  }
  return "solve_rate";
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
    estimate.solveEvidenceWeight > 0;
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
        ? `${Math.round(Math.abs(delta))}% less overhead`
        : `${Math.round(Math.abs(delta))} fewer / 100`,
      tone: "improved"
    };
  }
  if (delta >= meaningfulDelta) {
    return {
      label: kind === "completed_speed"
        ? `${Math.round(delta)}% more overhead`
        : `${Math.round(delta)} more / 100`,
      tone: "worsened"
    };
  }
  return {
    label: kind === "completed_speed"
      ? "Completed time is steady"
      : "Reliability gap is steady",
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
