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
import { customThemeLabel } from "./practice/shared/themeCatalog.ts";
import {
  formatDateForLocale,
  getActiveLocale,
  type SupportedLocale,
  translate
} from "../i18n/index.ts";

const MAX_VISIBLE_PROGRESS_THEMES = 8;

export function historyProgressPresentationFromModel(
  progress: TacticalProfileProgress,
  locale: SupportedLocale = getActiveLocale()
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
  const strengths = visibleProgressEstimates(observed)
    .flatMap((estimate) => {
      const signal = currentSignals.get(signalId(estimate));
      return seriesKinds(signal, estimate).map((kind) =>
        strengthSeries(
          estimate,
          kind,
          progress.snapshots,
          locale
        )
      );
    });
  const weaknessSignal = progress.evaluation.signals
    .filter((signal) => signal.status === "recommended")
    .sort(compareWeaknessSignals)[0];
  const weakness = weaknessSignal
    ? weaknessPresentation(weaknessSignal, wellSampled, locale)
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
    periodLabel: periodLabel(progress.periodStart, progress.periodEnd, locale),
    sampleLabel: translate(locale, "history.progress.sampleLabel"),
    sampleUnitLabel: translate(locale, "history.progress.sampleUnitLabel"),
    initialSeriesId,
    strengths,
    ...(weakness === undefined ? {} : { weakness }),
    ...(progress.phase === "balanced"
      ? balancedPresentation(observed, locale)
      : {
          noWeaknessTone: "collecting",
          noWeaknessTitle: translate(locale, "history.progress.collectingTitle"),
          noWeaknessLabel: translate(locale, "history.progress.collectingBody")
        })
  };
}

function visibleProgressEstimates(
  estimates: readonly TacticalProfileThemeEstimate[]
): TacticalProfileThemeEstimate[] {
  const counts: Record<TacticalProfileTaskFamily, number> = {
    line: 0,
    arrow_duel: 0
  };
  return estimates.filter((estimate) => {
    if (counts[estimate.taskFamily] >= MAX_VISIBLE_PROGRESS_THEMES) {
      return false;
    }
    counts[estimate.taskFamily] += 1;
    return true;
  });
}

function strengthSeries(
  current: TacticalProfileThemeEstimate,
  kind: Exclude<TacticalFocusReason, "both">,
  snapshots: readonly TacticalProfileProgressSnapshot[],
  locale: SupportedLocale
): HistoryStrengthSeries {
  const points = snapshots.map((snapshot) => {
    const estimate = snapshot.estimates.find(
      (candidate) =>
        candidate.taskFamily === current.taskFamily &&
        candidate.theme === current.theme
    );
    if (!estimate) {
      return unavailableProgressPoint(snapshot.asOf, locale);
    }
    const point = progressPoint(snapshot.asOf, estimate, kind, locale);
    return point ?? unavailableProgressPoint(snapshot.asOf, locale);
  });
  const availablePoints = points.filter((point) => !point.unavailable);
  const first = availablePoints[0];
  const latest = availablePoints.at(-1);
  const label = localizedThemeName(current.theme, locale);
  const change = first && latest
    ? changePresentation(kind, first.value, latest.value, locale)
    : {
        label: translate(locale, "history.progress.noComparisonYet"),
        tone: "steady" as const
      };
  const maxValue = Math.max(
    ...availablePoints.map((point) => point.value),
    0
  );

  return {
    id: `${signalId(current)}:${kind}`,
    themeId: signalId(current),
    taskFamily: current.taskFamily,
    label,
    kind,
    metricLabel: kind === "completed_speed"
      ? translate(locale, "history.progress.metricSolveTimeDirection")
      : translate(locale, "history.progress.metricAccuracyDirection"),
    baselineLabel: kind === "completed_speed"
      ? translate(locale, "history.progress.baselineSpeed")
      : translate(locale, "history.progress.baselineAccuracy"),
    scaleMax: kind === "completed_speed"
      ? Math.max(100, Math.ceil(maxValue * 1.15))
      : 100,
    changeLabel: change.label,
    changeTone: change.tone,
    summary: kind === "completed_speed"
      ? translate(locale, "history.progress.summarySpeed")
      : translate(locale, "history.progress.summaryAccuracy"),
    points
  };
}

function unavailableProgressPoint(asOf: string, locale: SupportedLocale): HistoryProgressPoint {
  return {
    label: shortUtcDate(asOf, locale),
    value: 0,
    valueLabel: "—",
    sampleSize: 0,
    unavailable: true
  };
}

function progressPoint(
  asOf: string,
  estimate: TacticalProfileThemeEstimate,
  kind: Exclude<TacticalFocusReason, "both">,
  locale: SupportedLocale
): HistoryProgressPoint | undefined {
  const evidenceWeight = kind === "completed_speed"
    ? estimate.speedEvidenceWeight
    : estimate.accuracyEvidenceWeight;
  if (evidenceWeight <= 0) {
    return undefined;
  }
  if (kind === "completed_speed") {
    return {
      label: shortUtcDate(asOf, locale),
      value: 100 * estimate.completedTimeMultiplier,
      valueLabel: `${estimate.completedTimeMultiplier.toFixed(2)}×`,
      sampleSize: Math.max(1, Math.round(evidenceWeight))
    };
  }
  const accuracyPercent = 100 * estimate.observedSolveRate;
  return {
    label: shortUtcDate(asOf, locale),
    value: accuracyPercent,
    valueLabel: `${Math.round(accuracyPercent)}%`,
    sampleSize: Math.max(1, Math.round(evidenceWeight))
  };
}

function weaknessPresentation(
  signal: TacticalProfileModelSignal,
  wellSampled: readonly TacticalProfileThemeEstimate[],
  locale: SupportedLocale
): HistoryProgressWeakness {
  const label = `${localizedThemeName(signal.theme, locale)} · ${taskFamilyLabel(signal.taskFamily, locale)}`;
  const effects: HistoryWeaknessEffect[] = [];
  if (signal.reason === "solve_rate" || signal.reason === "both") {
    effects.push({
      kind: "solve_rate",
      valueLabel: translate(locale, "history.progress.extraMisses", {
        count: Math.round(signal.expectedFailuresPer100)
      }),
      metricLabel: translate(locale, "history.progress.per100Puzzles"),
      comparisonLabel: relativeComparisonLabel(
        signal,
        wellSampled,
        "solve_rate",
        locale
      )
    });
  }
  if (signal.reason === "completed_speed" || signal.reason === "both") {
    effects.push({
      kind: "completed_speed",
      valueLabel: translate(locale, "history.progress.comparableTime", {
        multiplier: signal.completedTimeMultiplier.toFixed(2)
      }),
      metricLabel: translate(locale, "history.progress.onCompletedPuzzles"),
      comparisonLabel: relativeComparisonLabel(
        signal,
        wellSampled,
        "completed_speed",
        locale
      )
    });
  }

  return {
    label,
    reason: signal.reason,
    effects,
    evidenceLabel: translate(locale, "history.progress.weaknessEvidence", {
      puzzles: signal.distinctPuzzleCount,
      sessions: signal.distinctSessionCount
    }),
    explanation: translate(locale, "history.progress.weaknessExplanation"),
    eligibilityLabel: translate(locale, "history.progress.weaknessEligibility")
  };
}

function relativeComparisonLabel(
  signal: TacticalProfileModelSignal,
  wellSampled: readonly TacticalProfileThemeEstimate[],
  kind: Exclude<TacticalFocusReason, "both">,
  locale: SupportedLocale
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
  const themeName = localizedThemeName(signal.theme, locale);
  if (kind === "completed_speed") {
    const slowerPercent = Math.max(
      0,
      Math.round(100 * (signal.completedTimeMultiplier - 1))
    );
    return translate(
      locale,
      peersAreCloser
        ? "history.progress.speedComparePeersCloser"
        : "history.progress.speedCompareHighest",
      { theme: themeName, percent: slowerPercent }
    );
  }
  return translate(
    locale,
    peersAreCloser
      ? "history.progress.solveComparePeersCloser"
      : "history.progress.solveCompareHighest",
    { theme: themeName }
  );
}

function balancedPresentation(
  estimates: readonly TacticalProfileThemeEstimate[],
  locale: SupportedLocale
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
  const title = translate(locale, "history.progress.balancedTitle");
  if (hasAccuracy && hasSpeed) {
    return {
      noWeaknessTone: "balanced",
      noWeaknessTitle: title,
      noWeaknessLabel: translate(locale, "history.progress.balancedBoth")
    };
  }
  if (hasAccuracy) {
    return {
      noWeaknessTone: "balanced",
      noWeaknessTitle: title,
      noWeaknessLabel: translate(locale, "history.progress.balancedAccuracyOnly")
    };
  }
  if (hasSpeed) {
    return {
      noWeaknessTone: "balanced",
      noWeaknessTitle: title,
      noWeaknessLabel: translate(locale, "history.progress.balancedSpeedOnly")
    };
  }
  return {
    noWeaknessTone: "balanced",
    noWeaknessTitle: title,
    noWeaknessLabel: translate(locale, "history.progress.balancedNeither")
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
  latest: number,
  locale: SupportedLocale
): {
  label: string;
  tone: HistoryStrengthSeries["changeTone"];
} {
  const delta = latest - first;
  const meaningfulDelta = kind === "completed_speed" ? 2 : 0.5;
  if (delta <= -meaningfulDelta) {
    return {
      label: kind === "completed_speed"
        ? translate(locale, "history.progress.changeLessTime", { percent: Math.round(Math.abs(delta)) })
        : translate(locale, "history.progress.changePointsLower", { points: Math.round(Math.abs(delta)) }),
      tone: kind === "completed_speed" ? "improved" : "worsened"
    };
  }
  if (delta >= meaningfulDelta) {
    return {
      label: kind === "completed_speed"
        ? translate(locale, "history.progress.changeMoreTime", { percent: Math.round(delta) })
        : translate(locale, "history.progress.changePointsHigher", { points: Math.round(delta) }),
      tone: kind === "completed_speed" ? "worsened" : "improved"
    };
  }
  return {
    label: kind === "completed_speed"
      ? translate(locale, "history.progress.changeTimeSteady")
      : translate(locale, "history.progress.changeAccuracySteady"),
    tone: "steady"
  };
}

function signalId(input: {
  taskFamily: TacticalProfileTaskFamily;
  theme: string;
}): string {
  return `${input.taskFamily}:${input.theme}`;
}

function taskFamilyLabel(
  taskFamily: TacticalProfileTaskFamily,
  locale: SupportedLocale
): string {
  return taskFamily === "arrow_duel"
    ? translate(locale, "common.arrowDuel")
    : translate(locale, "history.progress.taskFamilyLine");
}

function localizedThemeName(theme: string, locale: SupportedLocale): string {
  const trimmed = theme.trim();
  if (trimmed.length === 0) {
    return translate(locale, "history.progress.tacticalPatternFallback");
  }
  return customThemeLabel(trimmed, locale);
}

function shortUtcDate(timestamp: string, locale: SupportedLocale): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    return timestamp;
  }
  return formatDateForLocale(
    date,
    locale,
    { month: "short", day: "numeric", timeZone: "UTC" }
  );
}

function periodLabel(start: string, end: string, locale: SupportedLocale): string {
  return `${shortUtcDate(start, locale)} – ${shortUtcDate(end, locale)}`;
}
