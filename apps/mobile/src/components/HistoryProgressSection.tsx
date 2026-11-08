import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { makeStyles, useTheme } from "../theme/index.ts";
import { AppText, Badge, Button, Icon, IconTile, SegmentedControl } from "./ui/index.tsx";
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
  return (
    <Button
      accessibilityLabel="Open tactical progress"
      icon="profile"
      label="Progress"
      size="compact"
      testID="history-progress-button"
      variant="secondary"
      onPress={onPress}
    />
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
  const theme = useTheme();
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
  const balanced = presentation.noWeaknessTone === "balanced";

  return (
    <View style={styles.screen} testID="history-progress-screen">
      <View style={styles.screenHeader}>
        <Pressable
          accessibilityLabel="Back to History"
          accessibilityRole="button"
          hitSlop={4}
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed ? styles.pressed : null
          ]}
          testID="history-progress-back"
        >
          <Icon color={theme.colors.accent.s600} name="chevronLeft" size={20} weight="semibold" />
          <AppText tone="accent" variant="body">History</AppText>
        </Pressable>
        <View style={styles.headerCopy}>
          <AppText accessibilityRole="header" variant="largeTitle">Tactical progress</AppText>
          <AppText tone="secondary" variant="subheadline">
            {presentation.periodLabel} · {presentation.sampleLabel}
          </AppText>
          {presentation.assurance === "provisional" ? (
            <View style={styles.badgeRow}>
              <Badge label="Early estimate" testID="history-progress-early-estimate" tone="warning" />
            </View>
          ) : null}
        </View>
      </View>

      {themeOptions.length > 0 ? (
        <View
          style={styles.progressControls}
          testID="history-progress-controls"
        >
          {selectedSeries && taskFamilies.length > 1 ? (
            <View testID="history-progress-task-family-selector">
              <SegmentedControl
                accessibilityLabel="Choose progress mode"
                options={taskFamilies.map((taskFamily) => ({
                  value: taskFamily,
                  label: TASK_FAMILY_LABELS[taskFamily],
                  testID: `history-progress-task-family-${taskFamily}`
                }))}
                value={selectedSeries.taskFamily}
                onChange={(taskFamily) => {
                  const firstSeries = presentation.strengths.find(
                    (series) => series.taskFamily === taskFamily
                  );
                  if (firstSeries) {
                    setSelectedSeriesId(firstSeries.id);
                  }
                }}
              />
            </View>
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
                    hitSlop={4}
                    key={series.id}
                    onPress={() => setSelectedSeriesId(series.id)}
                    style={({ pressed }) => [
                      styles.selector,
                      selected ? styles.selectorSelected : null,
                      pressed ? styles.pressed : null
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

      <View style={styles.card} testID="history-strength-over-time">
        <View style={styles.cardHeader}>
          <AppText style={styles.eyebrow} tone="accent" variant="footnote">Progress over time</AppText>
          <AppText variant="title">
            {selectedSeries?.label ?? "No progress data yet"}
          </AppText>
        </View>

        {selectedSeries ? (
          <>
            <ProgressMetricSelector
              onSelect={setSelectedSeriesId}
              selectedSeriesId={selectedSeries.id}
              series={selectedThemeSeries}
            />
            <View style={styles.metricContextRow}>
              <AppText style={styles.metricLabel} tone="secondary" variant="footnote">{selectedSeries.metricLabel}</AppText>
              <View accessibilityLabel={selectedSeries.changeLabel}>
                <Badge
                  label={selectedSeries.changeLabel}
                  tone={selectedSeries.changeTone === "steady"
                    ? "neutral"
                    : selectedSeries.changeTone === "worsened"
                      ? "negative"
                      : "positive"}
                />
              </View>
            </View>
            <StrengthTrendChart
              sampleUnitLabel={presentation.sampleUnitLabel}
              series={selectedSeries}
            />
            <View
              style={styles.note}
              testID="history-progress-chart-note"
            >
              <AppText style={styles.noteTitle} variant="footnote">
                {progressMetricNoteTitle(selectedSeries.kind)}
              </AppText>
              <AppText tone="secondary" variant="footnote">
                {selectedSeries.baselineLabel}. {selectedSeries.summary}
              </AppText>
            </View>
          </>
        ) : (
          <AppText tone="secondary" variant="subheadline">No progress data is available yet.</AppText>
        )}
      </View>

      {presentation.weakness ? (
        <WeaknessCard weakness={presentation.weakness} />
      ) : (
        <View
          accessibilityLabel={`${presentation.noWeaknessTitle}. ${presentation.noWeaknessLabel}`}
          style={[styles.card, styles.noWeaknessCard]}
          testID="history-no-clear-weakness"
        >
          <View
            accessibilityElementsHidden
            testID={balanced ? "history-balanced-check" : "history-collecting-icon"}
          >
            <IconTile name={balanced ? "check" : "remove"} tone={balanced ? "positive" : "neutral"} />
          </View>
          <View style={styles.copy}>
            <AppText variant="headline">
              {presentation.noWeaknessTitle}
            </AppText>
            <AppText tone="secondary" variant="subheadline">
              {presentation.noWeaknessLabel}
            </AppText>
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
            style={({ pressed }) => [
              styles.progressMetricCard,
              selected ? styles.progressMetricCardSelected : null,
              pressed ? styles.pressed : null
            ]}
            testID={`history-progress-metric-${candidate.kind}`}
          >
            <AppText tone={selected ? "accent" : "secondary"} variant="footnote">
              {progressMetricLabel(candidate.kind)}
            </AppText>
            <AppText tone={selected ? "accent" : "primary"} variant="numeral">
              {latest?.valueLabel ?? "—"}
            </AppText>
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
    <View style={styles.card} testID="history-clear-weakness">
      <View style={styles.weaknessHeader}>
        <View style={styles.cardHeader}>
          <AppText style={styles.eyebrow} tone="negative" variant="footnote">Clear weakness</AppText>
          <AppText variant="title">{weakness.label}</AppText>
        </View>
        <Badge label={modelSignalLabel(weakness.reason)} tone="negative" />
      </View>
      <View style={styles.weaknessEffects}>
        {weakness.effects.map((effect) => (
          <View
            key={effect.kind}
            style={styles.weaknessEffect}
            testID={`history-weakness-effect-${effect.kind}`}
          >
            <AppText tone="secondary" variant="footnote">
              {modelSignalLabel(effect.kind)}
            </AppText>
            <View style={styles.weaknessMetricRow}>
              <AppText tone="negative" variant="numeral">{effect.valueLabel}</AppText>
              <AppText tone="secondary" variant="footnote">{effect.metricLabel}</AppText>
            </View>
            <AppText tone="secondary" variant="footnote">{effect.comparisonLabel}</AppText>
          </View>
        ))}
      </View>
      <View style={styles.note}>
        <AppText style={styles.noteTitle} variant="footnote">Why this stands out</AppText>
        <AppText tone="secondary" variant="footnote">{weakness.explanation}</AppText>
        <AppText tone="secondary" variant="caption">{weakness.evidenceLabel}</AppText>
      </View>
      <View style={styles.note}>
        <AppText style={styles.noteTitle} variant="footnote">How this is measured</AppText>
        <AppText tone="secondary" variant="footnote">{weakness.eligibilityLabel}</AppText>
      </View>
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

const TASK_FAMILY_LABELS = {
  line: "Puzzle solving",
  arrow_duel: "Arrow Duel"
} satisfies Record<TacticalProfileTaskFamily, string>;

const useStyles = makeStyles((theme) => ({
  screen: {
    gap: theme.spacing.screen,
    width: "100%"
  },
  screenHeader: {
    gap: theme.spacing.group
  },
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 2,
    minHeight: theme.metrics.minTarget,
    paddingRight: 8
  },
  pressed: {
    opacity: 0.6
  },
  headerCopy: {
    gap: 4
  },
  badgeRow: {
    flexDirection: "row",
    paddingTop: 2
  },
  progressControls: {
    gap: theme.spacing.row
  },
  selectorRow: {
    flexDirection: "row",
    gap: theme.spacing.inline,
    paddingVertical: 4
  },
  selector: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.capsule,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 14
  },
  selectorSelected: {
    backgroundColor: theme.colors.accent.s100
  },
  selectorText: {
    ...theme.typography.subheadline,
    color: theme.colors.text.primary
  },
  selectorTextSelected: {
    color: theme.colors.accent.s600,
    fontWeight: theme.typography.headline.fontWeight
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.card,
    gap: theme.spacing.row,
    padding: 16
  },
  cardHeader: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  eyebrow: {
    fontWeight: theme.typography.headline.fontWeight
  },
  copy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  progressMetricSelector: {
    flexDirection: "row",
    gap: theme.spacing.group
  },
  progressMetricCard: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.control,
    flex: 1,
    gap: 2,
    minHeight: theme.metrics.minTarget,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  progressMetricCardSelected: {
    backgroundColor: theme.colors.accent.s100
  },
  metricContextRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.inline,
    justifyContent: "space-between"
  },
  metricLabel: {
    flexShrink: 1
  },
  chart: {
    height: 176,
    position: "relative"
  },
  chartGuideTop: {
    backgroundColor: theme.colors.border.default,
    height: StyleSheet.hairlineWidth,
    left: 0,
    position: "absolute",
    right: 0,
    top: 22
  },
  chartGuideMiddle: {
    backgroundColor: theme.colors.border.default,
    height: StyleSheet.hairlineWidth,
    left: 0,
    position: "absolute",
    right: 0,
    top: 78
  },
  chartColumns: {
    flex: 1,
    flexDirection: "row",
    gap: 6
  },
  chartColumn: {
    alignItems: "center",
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  chartValue: {
    ...theme.typography.caption,
    color: theme.colors.text.secondary,
    fontVariant: ["tabular-nums"],
    fontWeight: theme.typography.headline.fontWeight
  },
  chartBarTrack: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: 6,
    flex: 1,
    justifyContent: "flex-end",
    overflow: "hidden",
    width: "72%"
  },
  chartBar: {
    backgroundColor: theme.colors.accent.s500,
    borderRadius: 6,
    width: "100%"
  },
  chartBarUnavailable: {
    backgroundColor: theme.colors.fillMuted
  },
  chartLabel: {
    ...theme.typography.caption,
    color: theme.colors.text.secondary
  },
  chartSample: {
    ...theme.typography.caption,
    color: theme.colors.text.tertiary,
    fontVariant: ["tabular-nums"]
  },
  note: {
    gap: 2
  },
  noteTitle: {
    color: theme.colors.text.primary,
    fontWeight: theme.typography.headline.fontWeight
  },
  noWeaknessCard: {
    alignItems: "flex-start",
    flexDirection: "row"
  },
  weaknessHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.inline,
    justifyContent: "space-between"
  },
  weaknessEffects: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.group
  },
  weaknessEffect: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.control,
    flexBasis: 150,
    flexGrow: 1,
    gap: 2,
    padding: 12
  },
  weaknessMetricRow: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  }
}));
