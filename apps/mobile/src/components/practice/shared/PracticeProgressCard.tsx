import React from "react";
import { StyleSheet, View } from "react-native";
import type { SprintMode } from "../../../../../../packages/core/src/index.ts";
import type { PracticeProgressSummary } from "../../../../../../packages/storage/src/rating-history.ts";
import { AppText, Section } from "../../ui/index.tsx";
import { modeLabel } from "./practiceUtils.ts";
import { makeStyles } from "../../../theme/index.ts";

export function PracticeProgressCard({
  currentRating,
  mode,
  progress,
  ratingContextLabel
}: {
  currentRating: number;
  mode: SprintMode;
  progress: PracticeProgressSummary;
  ratingContextLabel?: string;
}): React.JSX.Element {
  const styles = useStyles();
  const progressDelta = progress.correctThisWeek + progress.wrongThisWeek === 0
    ? "Start training"
    : `${progress.netThisWeek >= 0 ? "+" : ""}${progress.netThisWeek} net`;
  const progressTone = progress.netThisWeek < 0
    ? styles.homeToneNegative
    : progress.correctThisWeek + progress.wrongThisWeek > 0
      ? styles.homeTonePositive
      : styles.homeToneNeutral;
  const progressContext = progress.accuracyThisWeek === null
    ? "No attempts yet"
    : `${progress.accuracyThisWeek}% accuracy · ${progress.wrongThisWeek} ${progress.wrongThisWeek === 1 ? "mistake" : "mistakes"}`;
  const ratingDeltaLabel = progress.ratingDeltaThisWeek === null
    ? "No rating change"
    : `${progress.ratingDeltaThisWeek >= 0 ? "+" : ""}${progress.ratingDeltaThisWeek} this week`;
  const ratingDeltaTone = progress.ratingDeltaThisWeek === null
    ? styles.homeToneNeutral
    : progress.ratingDeltaThisWeek < 0
      ? styles.homeToneNegative
      : styles.homeTonePositive;

  return (
    <Section header="Progress">
      <View
        accessible
        accessibilityLabel={`Progress summary, ${ratingContextLabel ?? modeLabel(mode)} rating ${currentRating}, ${ratingDeltaLabel}, this week ${progress.correctThisWeek}, ${progressDelta}, ${progressContext}`}
        style={styles.homeProgressMetrics}
        testID="practice-progress-summary"
      >
        <View style={styles.homeProgressMetric} testID="practice-progress-rating-metric">
          <AppText style={styles.homeProgressText} tone="secondary" variant="footnote">{ratingContextLabel ?? modeLabel(mode)} rating</AppText>
          <AppText style={[styles.homeProgressValue, styles.homeProgressText]} variant="numeralLarge">{currentRating}</AppText>
          <AppText testID="practice-progress-rating-delta" style={[ratingDeltaTone, styles.homeProgressText]} variant="footnote">{ratingDeltaLabel}</AppText>
        </View>
        <View style={styles.homeProgressDivider} testID="practice-progress-divider" />
        <View style={styles.homeProgressMetric} testID="practice-progress-weekly-metric">
          <AppText style={styles.homeProgressText} tone="secondary" variant="footnote">This Week</AppText>
          <AppText testID="practice-progress-weekly-solved" style={[styles.homeProgressValue, styles.homeProgressText]} variant="numeralLarge">{progress.correctThisWeek}</AppText>
          <AppText testID="practice-progress-weekly-delta" style={[progressTone, styles.homeProgressText]} variant="footnote">{progressDelta}</AppText>
          <AppText style={styles.homeProgressText} testID="practice-progress-weekly-context" tone="secondary" variant="footnote">{progressContext}</AppText>
        </View>
      </View>
    </Section>
  );
}

const useStyles = makeStyles((theme) => ({
  homeProgressMetrics: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 16
  },
  // Labels stretch to the column rather than shrink-wrapping their text: see
  // "Text width rounding" in docs/ui-design/MOBILE_UI_DESIGN.md (#633).
  homeProgressMetric: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  homeProgressText: {
    textAlign: "center"
  },
  homeProgressValue: {
    fontSize: 28,
    lineHeight: 34
  },
  homeProgressDivider: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.border.default,
    width: StyleSheet.hairlineWidth
  },
  homeToneNegative: {
    color: theme.colors.danger.s600
  },
  homeTonePositive: {
    color: theme.colors.positive.s600
  },
  homeToneNeutral: {
    color: theme.colors.text.tertiary
  },
}));
