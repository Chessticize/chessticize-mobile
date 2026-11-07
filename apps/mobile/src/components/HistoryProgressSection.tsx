import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { makeStyles } from "../theme/index.ts";
import type {
  TacticalFocusReason,
  TacticalProfileTaskFamily
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
  const styles = useStyles();
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
  const styles = useStyles();
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
  const taskFamilies = [...new Set(
    presentation.strengths.map((series) => series.taskFamily)
  )];
  const themeOptions = presentation.strengths
    .filter((series) => series.taskFamily === selectedSeries?.taskFamily)
    .filter((series, index, strengths) =>
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

      {themeOptions.length > 0 ? (
        <View
          style={styles.progressControls}
          testID="history-progress-controls"
        >
          {selectedSeries && taskFamilies.length > 1 ? (
            <HistoryTaskFamilySelector
              activeTaskFamily={selectedSeries.taskFamily}
              onSelect={(taskFamily) => {
                const firstSeries = presentation.strengths.find(
                  (series) => series.taskFamily === taskFamily
                );
                if (firstSeries) {
                  setSelectedSeriesId(firstSeries.id);
                }
              }}
              taskFamilies={taskFamilies}
            />
          ) : null}

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
        </View>
      ) : null}

      <View style={styles.section} testID="history-strength-over-time">
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleCopy}>
            <Text style={styles.eyebrow}>Progress over time</Text>
            <Text style={styles.sectionTitle}>
              {selectedSeries?.label ?? "No progress data yet"}
            </Text>
          </View>
        </View>

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

function HistoryTaskFamilySelector({
  activeTaskFamily,
  onSelect,
  taskFamilies
}: {
  activeTaskFamily: TacticalProfileTaskFamily;
  onSelect: (taskFamily: TacticalProfileTaskFamily) => void;
  taskFamilies: readonly TacticalProfileTaskFamily[];
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      accessibilityLabel="Choose progress mode"
      style={styles.taskFamilySelector}
      testID="history-progress-task-family-selector"
    >
      {taskFamilies.map((taskFamily) => {
        const selected = taskFamily === activeTaskFamily;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={taskFamily}
            onPress={() => onSelect(taskFamily)}
            style={[
              styles.taskFamilyTab,
              selected ? styles.taskFamilyTabSelected : null
            ]}
            testID={`history-progress-task-family-${taskFamily}`}
          >
            <Text
              style={[
                styles.taskFamilyTabTitle,
                selected ? styles.taskFamilyTabTitleSelected : null
              ]}
            >
              {TASK_FAMILY_LABELS[taskFamily]}
            </Text>
          </Pressable>
        );
      })}
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
  const styles = useStyles();
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
  const styles = useStyles();
  return (
    <View
      accessibilityLabel={`${series.label} ${series.metricLabel}. ${series.points
        .map((point) =>
          point.unavailable
            ? `${point.label}: unavailable`
            : `${point.label}: ${point.valueLabel} from ${point.sampleSize} ${sampleUnitLabel}`
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
                  point.unavailable ? styles.chartBarUnavailable : null,
                  {
                    height: `${Math.max(
                      8,
                      Math.min(100, (point.value / series.scaleMax) * 100)
                    )}%`
                  }
                ]}
                testID={`history-strength-bar-${index}`}
              />
            </View>
            <Text numberOfLines={1} style={styles.chartLabel}>
              {point.label}
            </Text>
            <Text
              accessibilityLabel={
                point.unavailable
                  ? "Unavailable"
                  : `${point.sampleSize} ${sampleUnitLabel}`
              }
              numberOfLines={1}
              style={styles.chartSample}
              testID={`history-strength-sample-${index}`}
            >
              {point.unavailable ? "n=—" : `n=${point.sampleSize}`}
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
  const styles = useStyles();
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
  const styles = useStyles();
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
  const styles = useStyles();
  return (
    <View accessibilityElementsHidden style={styles.glyph}>
      <View style={[styles.glyphBar, styles.glyphBarShort]} />
      <View style={[styles.glyphBar, styles.glyphBarMedium]} />
      <View style={[styles.glyphBar, styles.glyphBarTall]} />
    </View>
  );
}

const TASK_FAMILY_LABELS = {
  line: "Puzzle solving",
  arrow_duel: "Arrow Duel"
} satisfies Record<TacticalProfileTaskFamily, string>;

const useStyles = makeStyles((theme) => ({
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
    color: theme.colors.accent.s600,
    fontSize: 28,
    lineHeight: 28
  },
  backLabel: {
    color: theme.colors.accent.s600,
    fontSize: 15,
    fontWeight: "700"
  },
  headerCopy: {
    gap: 3
  },
  title: {
    color: theme.colors.text.primary,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5
  },
  subtitle: {
    color: theme.colors.text.tertiary,
    fontSize: 13,
    lineHeight: 19
  },
  earlyEstimate: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.warning.s100,
    borderRadius: 999,
    color: theme.colors.warning.s800,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    textTransform: "uppercase"
  },
  entryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s200,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 11
  },
  entryButtonText: {
    color: theme.colors.accent.s700,
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
    backgroundColor: theme.colors.accent.fill,
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
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
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
    color: theme.colors.accent.s600,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  weaknessEyebrow: {
    color: theme.colors.warning.s700,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  sectionTitle: {
    color: theme.colors.text.primary,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 25
  },
  progressControls: {
    gap: 10
  },
  taskFamilySelector: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: 16,
    flexDirection: "row",
    gap: 4,
    padding: 4
  },
  taskFamilyTab: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  taskFamilyTabSelected: {
    backgroundColor: theme.colors.surface
  },
  taskFamilyTabTitle: {
    color: theme.colors.text.tertiary,
    fontSize: 13,
    fontWeight: "800"
  },
  taskFamilyTabTitleSelected: {
    color: theme.colors.text.primary
  },
  progressMetricSelector: {
    flexDirection: "row",
    gap: 10
  },
  progressMetricCard: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minHeight: 66,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  progressMetricCardSelected: {
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s400
  },
  progressMetricCardLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
    fontWeight: "700"
  },
  progressMetricCardLabelSelected: {
    color: theme.colors.accent.s700
  },
  progressMetricCardValue: {
    color: theme.colors.text.strong,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 24
  },
  progressMetricCardValueSelected: {
    color: theme.colors.accent.s700
  },
  signalPill: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s200,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  signalPillWeakness: {
    backgroundColor: theme.colors.warning.s100,
    borderColor: theme.colors.warning.s300,
    maxWidth: 142
  },
  signalPillText: {
    color: theme.colors.accent.s700,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13,
    textAlign: "center"
  },
  signalPillTextUnselected: {
    color: theme.colors.text.tertiary
  },
  signalPillTextWeakness: {
    color: theme.colors.warning.s800
  },
  changePill: {
    backgroundColor: theme.colors.positive.s100,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  changePillText: {
    color: theme.colors.positive.s700,
    fontSize: 11,
    fontWeight: "800"
  },
  changePillSteady: {
    backgroundColor: theme.colors.surfaceSunken
  },
  changePillWorsened: {
    backgroundColor: theme.colors.danger.s100
  },
  changePillTextSteady: {
    color: theme.colors.text.secondary
  },
  changePillTextWorsened: {
    color: theme.colors.danger.s700
  },
  selectorRow: {
    flexDirection: "row",
    gap: 8
  },
  selector: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  selectorSelected: {
    backgroundColor: theme.colors.accent.s100,
    borderColor: theme.colors.accent.s400
  },
  selectorText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: "700"
  },
  selectorTextSelected: {
    color: theme.colors.accent.s700
  },
  metricLabel: {
    color: theme.colors.text.tertiary,
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
    backgroundColor: theme.colors.surfaceStrong,
    height: StyleSheet.hairlineWidth,
    left: 0,
    position: "absolute",
    right: 0,
    top: 34
  },
  chartGuideMiddle: {
    backgroundColor: theme.colors.surfaceStrong,
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
    color: theme.colors.text.strong,
    fontSize: 10,
    fontWeight: "800"
  },
  chartBarTrack: {
    backgroundColor: theme.colors.accent.s50,
    borderRadius: 6,
    height: 112,
    justifyContent: "flex-end",
    overflow: "hidden",
    width: "72%"
  },
  chartBar: {
    backgroundColor: theme.colors.accent.s500,
    borderRadius: 6,
    minHeight: 8,
    width: "100%"
  },
  chartBarUnavailable: {
    backgroundColor: theme.colors.fillMuted
  },
  chartLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 9,
    textAlign: "center",
    width: "100%"
  },
  chartSample: {
    color: theme.colors.text.faint,
    fontSize: 9,
    textAlign: "center",
    width: "100%"
  },
  chartNote: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: 10,
    gap: 3,
    paddingHorizontal: 11,
    paddingVertical: 9
  },
  chartNoteTitle: {
    color: theme.colors.text.secondary,
    fontSize: 11,
    fontWeight: "800"
  },
  chartNoteBody: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
    lineHeight: 16
  },
  summary: {
    color: theme.colors.text.secondary,
    fontSize: 13,
    lineHeight: 20
  },
  weaknessCard: {
    backgroundColor: theme.colors.warning.s50,
    borderColor: theme.colors.warning.s300,
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    padding: 16
  },
  weaknessEffects: {
    gap: 10
  },
  weaknessEffect: {
    backgroundColor: theme.colors.glass,
    borderColor: theme.colors.hairline.warning,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    padding: 12
  },
  effectKindLabel: {
    color: theme.colors.warning.s800,
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
    color: theme.colors.warning.s800,
    fontSize: 26,
    fontWeight: "900"
  },
  weaknessMetric: {
    color: theme.colors.warning.s900,
    fontSize: 12,
    fontWeight: "700"
  },
  comparisonLabel: {
    color: theme.colors.warning.s900,
    fontSize: 13,
    lineHeight: 19
  },
  evidenceNote: {
    backgroundColor: theme.colors.glass,
    borderRadius: 12,
    gap: 4,
    padding: 12
  },
  evidenceTitle: {
    color: theme.colors.warning.s900,
    fontSize: 12,
    fontWeight: "800"
  },
  evidenceBody: {
    color: theme.colors.warning.s900,
    fontSize: 12,
    lineHeight: 18
  },
  evidenceMeta: {
    color: theme.colors.warning.s800,
    fontSize: 11,
    lineHeight: 16
  },
  modelNote: {
    borderTopColor: theme.colors.hairline.warningStrong,
    borderTopWidth: 1,
    gap: 4,
    paddingTop: 12
  },
  modelNoteTitle: {
    color: theme.colors.warning.s900,
    fontSize: 11,
    fontWeight: "800"
  },
  modelNoteBody: {
    color: theme.colors.warning.s800,
    fontSize: 11,
    lineHeight: 17
  },
  noWeaknessCard: {
    alignItems: "flex-start",
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 16
  },
  noWeaknessCardBalanced: {
    backgroundColor: theme.colors.success.s50,
    borderColor: theme.colors.success.s200
  },
  noWeaknessIcon: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  noWeaknessIconBalanced: {
    backgroundColor: theme.colors.success.s100
  },
  noWeaknessIconText: {
    color: theme.colors.text.tertiary,
    fontSize: 18,
    fontWeight: "800"
  },
  noWeaknessIconTextBalanced: {
    color: theme.colors.success.s700
  },
  noWeaknessCopy: {
    flex: 1,
    gap: 4
  },
  noWeaknessTitle: {
    color: theme.colors.text.strong,
    fontSize: 15,
    fontWeight: "800"
  },
  noWeaknessBody: {
    color: theme.colors.text.tertiary,
    fontSize: 12,
    lineHeight: 18
  }
}));
