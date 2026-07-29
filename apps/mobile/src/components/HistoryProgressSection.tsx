import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import type {
  TacticalFocusReason
} from "../../../../packages/core/src/index.ts";
import type {
  HistoryProgressPresentation,
  HistoryProgressWeakness,
  HistoryStrengthSeries
} from "./historyProgressPresentation.ts";

export type {
  HistoryProgressPoint,
  HistoryProgressPresentation,
  HistoryProgressWeakness,
  HistoryStrengthSeries,
  HistoryWeaknessEffect
} from "./historyProgressPresentation.ts";

export function HistoryProgressEntryButton({
  onPress
}: {
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel="Open tactical progress"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.entryButton,
        pressed ? styles.pressed : null
      ]}
      testID="history-progress-button"
    >
      <ProgressGlyph />
      <Text style={styles.entryButtonText}>Progress</Text>
    </Pressable>
  );
}

export function HistoryProgressScreen({
  onBack,
  presentation
}: {
  onBack: () => void;
  presentation: HistoryProgressPresentation;
}): React.JSX.Element {
  const [selectedSeriesId, setSelectedSeriesId] = useState(
    presentation.initialSeriesId
  );
  const selectedSeries =
    presentation.strengths.find((series) => series.id === selectedSeriesId)
    ?? presentation.strengths[0];
  const selectedThemeSeries = selectedSeries
    ? presentation.strengths.filter(
        (series) => series.themeId === selectedSeries.themeId
      )
    : [];
  const themeOptions = presentation.strengths.filter(
    (series, index, strengths) =>
      strengths.findIndex(
        (candidate) => candidate.themeId === series.themeId
      ) === index
  );

  return (
    <View style={styles.screen} testID="history-progress-screen">
      <View style={styles.screenHeader}>
        <Pressable
          accessibilityLabel="Back to History"
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed ? styles.pressed : null
          ]}
          testID="history-progress-back"
        >
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>History</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Tactical progress</Text>
          <Text style={styles.subtitle}>
            {presentation.periodLabel} · {presentation.sampleLabel}
          </Text>
          {presentation.assurance === "provisional" ? (
            <Text
              style={styles.earlyEstimate}
              testID="history-progress-early-estimate"
            >
              Early estimate
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.section} testID="history-strength-over-time">
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleCopy}>
            <Text style={styles.eyebrow}>Progress over time</Text>
            <Text style={styles.sectionTitle}>
              {selectedSeries?.label ?? "No progress data yet"}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          testID="history-strength-selector"
        >
          <View style={styles.selectorRow}>
            {themeOptions.map((series) => {
              const selected = series.themeId === selectedSeries?.themeId;
              return (
                <Pressable
                  accessibilityLabel={`Show ${series.label} progress`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={series.id}
                  onPress={() => setSelectedSeriesId(series.id)}
                  style={[
                    styles.selector,
                    selected ? styles.selectorSelected : null
                  ]}
                  testID={`history-progress-strength-${series.id}`}
                >
                  <Text
                    style={[
                      styles.selectorText,
                      selected ? styles.selectorTextSelected : null
                    ]}
                  >
                    {series.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {selectedSeries ? (
          <>
            <ProgressMetricSelector
              onSelect={setSelectedSeriesId}
              selectedSeriesId={selectedSeries.id}
              series={selectedThemeSeries}
            />
            <View style={styles.metricContextRow}>
              <Text style={styles.metricLabel}>{selectedSeries.metricLabel}</Text>
              <View
                accessibilityLabel={selectedSeries.changeLabel}
                style={[
                  styles.changePill,
                  selectedSeries.changeTone === "steady"
                    ? styles.changePillSteady
                    : selectedSeries.changeTone === "worsened"
                      ? styles.changePillWorsened
                      : null
                ]}
              >
                <Text
                  style={[
                    styles.changePillText,
                    selectedSeries.changeTone === "steady"
                      ? styles.changePillTextSteady
                      : selectedSeries.changeTone === "worsened"
                        ? styles.changePillTextWorsened
                        : null
                  ]}
                >
                  {selectedSeries.changeLabel}
                </Text>
              </View>
            </View>
            <StrengthTrendChart
              sampleUnitLabel={presentation.sampleUnitLabel}
              series={selectedSeries}
            />
            <View
              style={styles.chartNote}
              testID="history-progress-chart-note"
            >
              <Text style={styles.chartNoteTitle}>
                {progressMetricNoteTitle(selectedSeries.kind)}
              </Text>
              <Text style={styles.chartNoteBody}>
                {selectedSeries.baselineLabel}. {selectedSeries.summary}
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.summary}>No progress data is available yet.</Text>
        )}
      </View>

      {presentation.weakness ? (
        <WeaknessCard weakness={presentation.weakness} />
      ) : (
        <View
          accessibilityLabel={`${presentation.noWeaknessTitle}. ${presentation.noWeaknessLabel}`}
          style={[
            styles.noWeaknessCard,
            presentation.noWeaknessTone === "balanced"
              ? styles.noWeaknessCardBalanced
              : null
          ]}
          testID="history-no-clear-weakness"
        >
          <View
            accessibilityElementsHidden
            style={[
              styles.noWeaknessIcon,
              presentation.noWeaknessTone === "balanced"
                ? styles.noWeaknessIconBalanced
                : null
            ]}
            testID={presentation.noWeaknessTone === "balanced"
              ? "history-balanced-check"
              : "history-collecting-icon"}
          >
            <Text
              style={[
                styles.noWeaknessIconText,
                presentation.noWeaknessTone === "balanced"
                  ? styles.noWeaknessIconTextBalanced
                  : null
              ]}
            >
              {presentation.noWeaknessTone === "balanced" ? "✓" : "—"}
            </Text>
          </View>
          <View style={styles.noWeaknessCopy}>
            <Text style={styles.noWeaknessTitle}>
              {presentation.noWeaknessTitle}
            </Text>
            <Text style={styles.noWeaknessBody}>
              {presentation.noWeaknessLabel}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function ProgressMetricSelector({
  onSelect,
  selectedSeriesId,
  series
}: {
  onSelect: (seriesId: string) => void;
  selectedSeriesId: string;
  series: readonly HistoryStrengthSeries[];
}): React.JSX.Element {
  return (
    <View
      accessibilityLabel="Progress metric"
      style={styles.progressMetricSelector}
      testID="history-progress-metric-selector"
    >
      {series.map((candidate) => {
        const selected = candidate.id === selectedSeriesId;
        const latest = candidate.points.at(-1);
        return (
          <Pressable
            accessibilityLabel={`Show ${progressMetricLabel(candidate.kind)} progress, ${latest?.valueLabel ?? "no data"}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={candidate.id}
            onPress={() => onSelect(candidate.id)}
            style={[
              styles.progressMetricCard,
              selected ? styles.progressMetricCardSelected : null
            ]}
            testID={`history-progress-metric-${candidate.kind}`}
          >
            <Text
              style={[
                styles.progressMetricCardLabel,
                selected ? styles.progressMetricCardLabelSelected : null
              ]}
            >
              {progressMetricLabel(candidate.kind)}
            </Text>
            <Text
              style={[
                styles.progressMetricCardValue,
                selected ? styles.progressMetricCardValueSelected : null
              ]}
            >
              {latest?.valueLabel ?? "—"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StrengthTrendChart({
  sampleUnitLabel,
  series
}: {
  sampleUnitLabel: string;
  series: HistoryStrengthSeries;
}): React.JSX.Element {
  return (
    <View
      accessibilityLabel={`${series.label} ${series.metricLabel}. ${series.points
        .map((point) =>
          `${point.label}: ${point.valueLabel} from ${point.sampleSize} ${sampleUnitLabel}`
        )
        .join(". ")}`}
      style={styles.chart}
      testID="history-strength-chart"
    >
      <View style={styles.chartGuideTop} />
      <View style={styles.chartGuideMiddle} />
      <View style={styles.chartColumns}>
        {series.points.map((point, index) => (
          <View key={`${point.label}-${index}`} style={styles.chartColumn}>
            <Text style={styles.chartValue}>{point.valueLabel}</Text>
            <View style={styles.chartBarTrack}>
              <View
                style={[
                  styles.chartBar,
                  {
                    height: `${Math.max(
                      8,
                      Math.min(100, (point.value / series.scaleMax) * 100)
                    )}%`
                  }
                ]}
              />
            </View>
            <Text numberOfLines={1} style={styles.chartLabel}>
              {point.label}
            </Text>
            <Text
              accessibilityLabel={`${point.sampleSize} ${sampleUnitLabel}`}
              numberOfLines={1}
              style={styles.chartSample}
            >
              n={point.sampleSize}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function WeaknessCard({
  weakness
}: {
  weakness: HistoryProgressWeakness;
}): React.JSX.Element {
  return (
    <View style={styles.weaknessCard} testID="history-clear-weakness">
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleCopy}>
          <Text style={styles.weaknessEyebrow}>Clear weakness</Text>
          <Text style={styles.sectionTitle}>{weakness.label}</Text>
        </View>
        <ModelSignalPill kind={weakness.reason} weakness />
      </View>
      <View style={styles.weaknessEffects}>
        {weakness.effects.map((effect) => (
          <View
            key={effect.kind}
            style={styles.weaknessEffect}
            testID={`history-weakness-effect-${effect.kind}`}
          >
            <Text style={styles.effectKindLabel}>
              {modelSignalLabel(effect.kind)}
            </Text>
            <View style={styles.weaknessMetricRow}>
              <Text style={styles.weaknessValue}>{effect.valueLabel}</Text>
              <Text style={styles.weaknessMetric}>{effect.metricLabel}</Text>
            </View>
            <Text style={styles.comparisonLabel}>{effect.comparisonLabel}</Text>
          </View>
        ))}
      </View>
      <View style={styles.evidenceNote}>
        <Text style={styles.evidenceTitle}>Why this stands out</Text>
        <Text style={styles.evidenceBody}>{weakness.explanation}</Text>
        <Text style={styles.evidenceMeta}>{weakness.evidenceLabel}</Text>
      </View>
      <View style={styles.modelNote}>
        <Text style={styles.modelNoteTitle}>How this is measured</Text>
        <Text style={styles.modelNoteBody}>{weakness.eligibilityLabel}</Text>
      </View>
    </View>
  );
}

function ModelSignalPill({
  kind,
  weakness = false
}: {
  kind: TacticalFocusReason;
  weakness?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.signalPill, weakness ? styles.signalPillWeakness : null]}>
      <Text
        numberOfLines={2}
        style={[
          styles.signalPillText,
          weakness ? styles.signalPillTextWeakness : null
        ]}
      >
        {modelSignalLabel(kind)}
      </Text>
    </View>
  );
}

function modelSignalLabel(kind: TacticalFocusReason): string {
  if (kind === "completed_speed") {
    return "Completed-puzzle speed";
  }
  if (kind === "both") {
    return "Reliability & speed";
  }
  return "Solve reliability";
}

function progressMetricLabel(
  kind: Exclude<TacticalFocusReason, "both">
): string {
  return kind === "completed_speed" ? "Solve time" : "Accuracy";
}

function progressMetricNoteTitle(
  kind: Exclude<TacticalFocusReason, "both">
): string {
  return kind === "completed_speed"
    ? "How solve time is counted"
    : "How accuracy is counted";
}

function ProgressGlyph(): React.JSX.Element {
  return (
    <View accessibilityElementsHidden style={styles.glyph}>
      <View style={[styles.glyphBar, styles.glyphBarShort]} />
      <View style={[styles.glyphBar, styles.glyphBarMedium]} />
      <View style={[styles.glyphBar, styles.glyphBarTall]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
    width: "100%"
  },
  screenHeader: {
    alignItems: "flex-start",
    gap: 10
  },
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 10,
    flexDirection: "row",
    gap: 3,
    minHeight: 36,
    paddingHorizontal: 6
  },
  backArrow: {
    color: "#2563EB",
    fontSize: 28,
    lineHeight: 28
  },
  backLabel: {
    color: "#2563EB",
    fontSize: 15,
    fontWeight: "700"
  },
  headerCopy: {
    gap: 3
  },
  title: {
    color: "#0F172A",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5
  },
  subtitle: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19
  },
  earlyEstimate: {
    alignSelf: "flex-start",
    backgroundColor: "#FEF3C7",
    borderRadius: 999,
    color: "#92400E",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    textTransform: "uppercase"
  },
  entryButton: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 11
  },
  entryButtonText: {
    color: "#1D4ED8",
    fontSize: 13,
    fontWeight: "800"
  },
  pressed: {
    opacity: 0.72
  },
  glyph: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 2,
    height: 15
  },
  glyphBar: {
    backgroundColor: "#2563EB",
    borderRadius: 2,
    width: 3
  },
  glyphBarShort: {
    height: 6
  },
  glyphBarMedium: {
    height: 10
  },
  glyphBarTall: {
    height: 15
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 18,
    borderWidth: 1,
    gap: 13,
    padding: 16
  },
  sectionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  sectionTitleCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  eyebrow: {
    color: "#2563EB",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  weaknessEyebrow: {
    color: "#B45309",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  sectionTitle: {
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 25
  },
  progressMetricSelector: {
    flexDirection: "row",
    gap: 10
  },
  progressMetricCard: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minHeight: 66,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  progressMetricCardSelected: {
    backgroundColor: "#EFF6FF",
    borderColor: "#60A5FA"
  },
  progressMetricCardLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700"
  },
  progressMetricCardLabelSelected: {
    color: "#1D4ED8"
  },
  progressMetricCardValue: {
    color: "#334155",
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 24
  },
  progressMetricCardValueSelected: {
    color: "#1D4ED8"
  },
  signalPill: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  signalPillWeakness: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FCD34D",
    maxWidth: 142
  },
  signalPillText: {
    color: "#1D4ED8",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13,
    textAlign: "center"
  },
  signalPillTextUnselected: {
    color: "#64748B"
  },
  signalPillTextWeakness: {
    color: "#92400E"
  },
  changePill: {
    backgroundColor: "#DCFCE7",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  changePillText: {
    color: "#15803D",
    fontSize: 11,
    fontWeight: "800"
  },
  changePillSteady: {
    backgroundColor: "#F1F5F9"
  },
  changePillWorsened: {
    backgroundColor: "#FEE2E2"
  },
  changePillTextSteady: {
    color: "#475569"
  },
  changePillTextWorsened: {
    color: "#B91C1C"
  },
  selectorRow: {
    flexDirection: "row",
    gap: 8
  },
  selector: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  selectorSelected: {
    backgroundColor: "#DBEAFE",
    borderColor: "#60A5FA"
  },
  selectorText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700"
  },
  selectorTextSelected: {
    color: "#1D4ED8"
  },
  metricLabel: {
    color: "#64748B",
    flex: 1,
    fontSize: 12,
    fontWeight: "700"
  },
  metricContextRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  chart: {
    height: 192,
    justifyContent: "flex-end",
    overflow: "hidden",
    position: "relative"
  },
  chartGuideTop: {
    backgroundColor: "#E2E8F0",
    height: StyleSheet.hairlineWidth,
    left: 0,
    position: "absolute",
    right: 0,
    top: 34
  },
  chartGuideMiddle: {
    backgroundColor: "#E2E8F0",
    height: StyleSheet.hairlineWidth,
    left: 0,
    position: "absolute",
    right: 0,
    top: 92
  },
  chartColumns: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 7,
    height: 192
  },
  chartColumn: {
    alignItems: "center",
    flex: 1,
    gap: 5,
    height: 192,
    justifyContent: "flex-end",
    minWidth: 28
  },
  chartValue: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "800"
  },
  chartBarTrack: {
    backgroundColor: "#EFF6FF",
    borderRadius: 6,
    height: 112,
    justifyContent: "flex-end",
    overflow: "hidden",
    width: "72%"
  },
  chartBar: {
    backgroundColor: "#3B82F6",
    borderRadius: 6,
    minHeight: 8,
    width: "100%"
  },
  chartLabel: {
    color: "#64748B",
    fontSize: 9,
    textAlign: "center",
    width: "100%"
  },
  chartSample: {
    color: "#94A3B8",
    fontSize: 9,
    textAlign: "center",
    width: "100%"
  },
  chartNote: {
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    gap: 3,
    paddingHorizontal: 11,
    paddingVertical: 9
  },
  chartNoteTitle: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800"
  },
  chartNoteBody: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16
  },
  summary: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 20
  },
  weaknessCard: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    padding: 16
  },
  weaknessEffects: {
    gap: 10
  },
  weaknessEffect: {
    backgroundColor: "rgba(255, 255, 255, 0.66)",
    borderColor: "rgba(245, 158, 11, 0.28)",
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    padding: 12
  },
  effectKindLabel: {
    color: "#92400E",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  weaknessMetricRow: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  weaknessValue: {
    color: "#92400E",
    fontSize: 26,
    fontWeight: "900"
  },
  weaknessMetric: {
    color: "#78350F",
    fontSize: 12,
    fontWeight: "700"
  },
  comparisonLabel: {
    color: "#78350F",
    fontSize: 13,
    lineHeight: 19
  },
  evidenceNote: {
    backgroundColor: "rgba(255, 255, 255, 0.66)",
    borderRadius: 12,
    gap: 4,
    padding: 12
  },
  evidenceTitle: {
    color: "#78350F",
    fontSize: 12,
    fontWeight: "800"
  },
  evidenceBody: {
    color: "#78350F",
    fontSize: 12,
    lineHeight: 18
  },
  evidenceMeta: {
    color: "#92400E",
    fontSize: 11,
    lineHeight: 16
  },
  modelNote: {
    borderTopColor: "rgba(180, 83, 9, 0.22)",
    borderTopWidth: 1,
    gap: 4,
    paddingTop: 12
  },
  modelNoteTitle: {
    color: "#78350F",
    fontSize: 11,
    fontWeight: "800"
  },
  modelNoteBody: {
    color: "#92400E",
    fontSize: 11,
    lineHeight: 17
  },
  noWeaknessCard: {
    alignItems: "flex-start",
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 16
  },
  noWeaknessCardBalanced: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0"
  },
  noWeaknessIcon: {
    alignItems: "center",
    backgroundColor: "#E2E8F0",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  noWeaknessIconBalanced: {
    backgroundColor: "#D1FAE5"
  },
  noWeaknessIconText: {
    color: "#64748B",
    fontSize: 18,
    fontWeight: "800"
  },
  noWeaknessIconTextBalanced: {
    color: "#047857"
  },
  noWeaknessCopy: {
    flex: 1,
    gap: 4
  },
  noWeaknessTitle: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "800"
  },
  noWeaknessBody: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18
  }
});
