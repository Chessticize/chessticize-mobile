import type {
  TacticalFocusReason,
  TacticalProfileCalibrationAssurance
} from "../../../../packages/core/src/index.ts";

export type HistoryProgressPoint = {
  label: string;
  value: number;
  valueLabel: string;
  sampleSize: number;
};

export type HistoryStrengthSeries = {
  id: string;
  label: string;
  kind: Exclude<TacticalFocusReason, "both">;
  metricLabel: string;
  baselineLabel: string;
  scaleMax: number;
  changeLabel: string;
  changeTone: "improved" | "steady" | "worsened";
  summary: string;
  points: readonly HistoryProgressPoint[];
};

export type HistoryWeaknessEffect = {
  kind: Exclude<TacticalFocusReason, "both">;
  valueLabel: string;
  metricLabel: string;
  comparisonLabel: string;
};

export type HistoryProgressWeakness = {
  label: string;
  reason: TacticalFocusReason;
  effects: readonly HistoryWeaknessEffect[];
  evidenceLabel: string;
  explanation: string;
  eligibilityLabel: string;
};

export type HistoryProgressPresentation = {
  assurance?: TacticalProfileCalibrationAssurance;
  periodLabel: string;
  sampleLabel: string;
  sampleUnitLabel: string;
  initialSeriesId: string;
  strengths: readonly HistoryStrengthSeries[];
  weakness?: HistoryProgressWeakness;
  noWeaknessTitle: string;
  noWeaknessLabel: string;
};
