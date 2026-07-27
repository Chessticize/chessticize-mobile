import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

export type HistoryProgressPoint = {
  label: string;
  value: number;
  sampleSize: number;
};

export type HistoryStrengthSeries = {
  id: string;
  label: string;
  metricLabel: string;
  changeLabel: string;
  summary: string;
  points: readonly HistoryProgressPoint[];
};

export type HistoryWeaknessComparison = {
  id: string;
  label: string;
  value: number;
  isWeakness?: boolean;
};

export type HistoryProgressWeakness = {
  label: string;
  metricLabel: string;
  valueLabel: string;
  comparisonLabel: string;
  gapLabel: string;
  evidenceLabel: string;
  explanation: string;
  comparisons: readonly HistoryWeaknessComparison[];
};

export type HistoryProgressPresentation = {
  periodLabel: string;
  sampleLabel: string;
  initialSeriesId: string;
  strengths: readonly HistoryStrengthSeries[];
  weakness?: HistoryProgressWeakness;
  noWeaknessLabel: string;
};

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
        </View>
      </View>

      <View style={styles.section} testID="history-strength-over-time">
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleCopy}>
            <Text style={styles.eyebrow}>Strength over time</Text>
            <Text style={styles.sectionTitle}>
              {selectedSeries?.label ?? "No theme selected"}
            </Text>
          </View>
          {selectedSeries ? (
            <View
              accessibilityLabel={selectedSeries.changeLabel}
              style={styles.changePill}
            >
              <Text style={styles.changePillText}>
                {selectedSeries.changeLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          testID="history-strength-selector"
        >
          <View style={styles.selectorRow}>
            {presentation.strengths.map((series) => {
              const selected = series.id === selectedSeries?.id;
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
            <Text style={styles.metricLabel}>{selectedSeries.metricLabel}</Text>
            <StrengthTrendChart series={selectedSeries} />
            <Text style={styles.summary}>{selectedSeries.summary}</Text>
          </>
        ) : (
          <Text style={styles.summary}>No progress data is available yet.</Text>
        )}
      </View>

      {presentation.weakness ? (
        <WeaknessCard weakness={presentation.weakness} />
      ) : (
        <View
          accessibilityLabel={`No clear weakness. ${presentation.noWeaknessLabel}`}
          style={styles.noWeaknessCard}
          testID="history-no-clear-weakness"
        >
          <View style={styles.noWeaknessIcon}>
            <Text style={styles.noWeaknessIconText}>—</Text>
          </View>
          <View style={styles.noWeaknessCopy}>
            <Text style={styles.noWeaknessTitle}>No clear weakness</Text>
            <Text style={styles.noWeaknessBody}>
              {presentation.noWeaknessLabel}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function StrengthTrendChart({
  series
}: {
  series: HistoryStrengthSeries;
}): React.JSX.Element {
  return (
    <View
      accessibilityLabel={`${series.label} ${series.metricLabel}. ${series.points
        .map((point) => `${point.label}: ${point.value} percent from ${point.sampleSize} puzzles`)
        .join(". ")}`}
      style={styles.chart}
      testID="history-strength-chart"
    >
      <View style={styles.chartGuideTop} />
      <View style={styles.chartGuideMiddle} />
      <View style={styles.chartColumns}>
        {series.points.map((point, index) => (
          <View key={`${point.label}-${index}`} style={styles.chartColumn}>
            <Text style={styles.chartValue}>{point.value}%</Text>
            <View style={styles.chartBarTrack}>
              <View
                style={[
                  styles.chartBar,
                  { height: `${Math.max(8, Math.min(100, point.value))}%` }
                ]}
              />
            </View>
            <Text numberOfLines={1} style={styles.chartLabel}>
              {point.label}
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
        <View
          accessibilityLabel={weakness.gapLabel}
          style={styles.weaknessPill}
        >
          <Text style={styles.weaknessPillText}>{weakness.gapLabel}</Text>
        </View>
      </View>
      <View style={styles.weaknessMetricRow}>
        <Text style={styles.weaknessValue}>{weakness.valueLabel}</Text>
        <Text style={styles.weaknessMetric}>{weakness.metricLabel}</Text>
      </View>
      <Text style={styles.comparisonLabel}>{weakness.comparisonLabel}</Text>
      <View style={styles.comparisonList}>
        {weakness.comparisons.map((comparison) => (
          <View
            accessibilityLabel={`${comparison.label}: ${comparison.value} percent${
              comparison.isWeakness ? ", clear weakness" : ""
            }`}
            key={comparison.id}
            style={styles.comparisonRow}
            testID={`history-weakness-comparison-${comparison.id}`}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.comparisonName,
                comparison.isWeakness ? styles.comparisonNameWeak : null
              ]}
            >
              {comparison.label}
            </Text>
            <View style={styles.comparisonTrack}>
              <View
                style={[
                  styles.comparisonBar,
                  comparison.isWeakness ? styles.comparisonBarWeak : null,
                  { width: `${Math.max(4, Math.min(100, comparison.value))}%` }
                ]}
              />
            </View>
            <Text
              style={[
                styles.comparisonValue,
                comparison.isWeakness ? styles.comparisonValueWeak : null
              ]}
            >
              {comparison.value}%
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.evidenceNote}>
        <Text style={styles.evidenceTitle}>Why this stands out</Text>
        <Text style={styles.evidenceBody}>{weakness.explanation}</Text>
        <Text style={styles.evidenceMeta}>{weakness.evidenceLabel}</Text>
      </View>
    </View>
  );
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
    fontSize: 12,
    fontWeight: "700"
  },
  chart: {
    height: 176,
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
    height: 176
  },
  chartColumn: {
    alignItems: "center",
    flex: 1,
    gap: 5,
    height: 176,
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
  weaknessPill: {
    backgroundColor: "#FEF3C7",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  weaknessPillText: {
    color: "#92400E",
    fontSize: 11,
    fontWeight: "800"
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
  comparisonList: {
    gap: 9
  },
  comparisonRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  comparisonName: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    width: 64
  },
  comparisonNameWeak: {
    color: "#92400E"
  },
  comparisonTrack: {
    backgroundColor: "rgba(253, 230, 138, 0.55)",
    borderRadius: 999,
    flex: 1,
    height: 8,
    overflow: "hidden"
  },
  comparisonBar: {
    backgroundColor: "#94A3B8",
    borderRadius: 999,
    height: "100%"
  },
  comparisonBarWeak: {
    backgroundColor: "#F59E0B"
  },
  comparisonValue: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right",
    width: 34
  },
  comparisonValueWeak: {
    color: "#92400E"
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
  noWeaknessIcon: {
    alignItems: "center",
    backgroundColor: "#E2E8F0",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  noWeaknessIconText: {
    color: "#64748B",
    fontSize: 18,
    fontWeight: "800"
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
