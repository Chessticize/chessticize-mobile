// Sprint Result, direction A "Grouped Native" (Issue #609; approved spec in
// PR #650). A full-screen destination: a top bar with Done and the rating-trend
// action, a centered hero, one stats card, the review row and the actions.
// ResultScreenLayout owns the adaptive frame it shares with the Survival
// result. This screen renders only; PracticePocScreen owns the session state
// and every action, and sprintResultPresentation.ts owns the copy.

import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { makeStyles } from "../theme/makeStyles.ts";
import { useTheme } from "../theme/ThemeProvider.ts";
import {
  RESULT_CAPPED_SCALE,
  ResultHeroFrame,
  ResultOutcomeLine,
  ResultProgressTrack,
  ResultScreenLayout,
  ResultStatsCard,
  ResultStatusGlyph,
  ResultSummaryLine,
  type ResultInsets
} from "./ResultScreenLayout.tsx";
import { useUiHapticOnAppear } from "../platform/uiHaptics.ts";
import {
  presentSprintResult,
  sprintResultHapticIntent,
  type SprintResultData,
  type SprintResultPresentation,
  type StatColumn
} from "./sprintResultPresentation.ts";
import { AppText, Badge, Button, Icon, Section } from "./ui/index.tsx";

export type SprintResultScreenActions = {
  onBack: () => void;
  onOpenHistory: () => void;
  onPlayAgain: () => void;
  /** Opens Replay for everything to review. */
  onReplay: () => void;
  /** Opens Replay for only the mistakes. */
  onReplayMistakes: () => void;
  onMarkUnclear: () => void;
};

export function SprintResultScreen({
  data,
  initialInfoOpen = false,
  notice,
  paddingInsets,
  style,
  ...actions
}: SprintResultScreenActions & {
  data: SprintResultData;
  initialInfoOpen?: boolean;
  /** Shown above the hero, for example an error from marking Unclear. */
  notice?: React.ReactNode;
  /** Insets to pad by. Defaults to the safe area; pass zero when the parent pads. */
  paddingInsets?: ResultInsets;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const [infoOpen, setInfoOpen] = useState(initialInfoOpen);
  const result = presentSprintResult(data);
  useUiHapticOnAppear(sprintResultHapticIntent(data));

  return (
    <ResultScreenLayout
      actions={(
        <>
          {result.replayMistakesLabel ? (
            <Button
              label={result.replayMistakesLabel}
              stretch
              testID="review-mistakes-button"
              variant="secondary"
              onPress={actions.onReplayMistakes}
            />
          ) : null}
          <Button
            label={result.primaryActionLabel}
            stretch
            testID="play-again-button"
            onPress={actions.onPlayAgain}
          />
        </>
      )}
      backAccessibilityLabel="Done"
      backTestID="back-practice-button"
      renderDetails={({ fontScale, stacked, statsLayout }) => (
        <>
          <ResultStatsCard
            columns={result.stats}
            detailTestIDs={STAT_DETAIL_TEST_IDS}
            layout={statsLayout}
            testID="sprint-result-stats"
            testIDs={STAT_TEST_IDS}
          />
          <ReviewArea
            data={data}
            fontScale={fontScale}
            infoOpen={infoOpen}
            result={result}
            stacked={stacked}
            onMarkUnclear={actions.onMarkUnclear}
            onReplay={actions.onReplay}
            onToggleInfo={() => setInfoOpen((open) => !open)}
          />
        </>
      )}
      renderHero={({ fontScale, stacked }) => <ResultHero fontScale={fontScale} result={result} stacked={stacked} />}
      notice={notice}
      paddingInsets={paddingInsets}
      stats={result.stats}
      onBack={actions.onBack}
      style={style}
      testID="sprint-summary-panel"
      testIDPrefix="sprint-result"
      title={result.title}
      trailingAction={result.showTrendAction
        ? {
            accessibilityLabel: "View rating trend in History",
            icon: "trend",
            onPress: actions.onOpenHistory,
            testID: "sprint-result-history-button"
          }
        : undefined}
    />
  );
}

function ResultHero({
  fontScale,
  result,
  stacked
}: {
  fontScale: number;
  result: SprintResultPresentation;
  stacked: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const toneColor = {
    positive: theme.colors.positive.s600,
    negative: theme.colors.danger.s600,
    neutral: theme.colors.text.tertiary
  }[result.outcomeTone];
  const toneSoft = {
    positive: theme.colors.positive.s100,
    negative: theme.colors.danger.s100,
    neutral: theme.colors.surfaceStrong
  }[result.outcomeTone];
  return (
    <ResultHeroFrame testID="sprint-result-hero">
      <ResultOutcomeLine
        accessibilityLabel={result.outcomeLabel}
        glyph={(
          <ResultStatusGlyph backgroundColor={toneSoft} fontScale={fontScale} testID="sprint-result-status-glyph">
            {(size) => <Icon color={toneColor} name={result.outcomeIcon} size={size} weight="bold" />}
          </ResultStatusGlyph>
        )}
        parts={result.outcomeParts}
        stacked={stacked}
        testIDPrefix="sprint-result"
      />
      <AppText
        accessibilityLabel={result.scoreAccessibilityLabel}
        maxFontSizeMultiplier={RESULT_CAPPED_SCALE}
        style={styles.centeredText}
        testID="sprint-result-solved"
        variant="display"
      >
        {result.solvedLabel}
        <AppText maxFontSizeMultiplier={RESULT_CAPPED_SCALE} style={styles.scoreTarget} tone="secondary" variant="display">
          {` / ${result.targetLabel}`}
        </AppText>
      </AppText>
      <ResultProgressTrack color={toneColor} progress={result.progress} testID="sprint-result-progress" />
      <ResultSummaryLine parts={result.summaryParts} stacked={stacked} testID="sprint-result-accuracy" />
    </ResultHeroFrame>
  );
}

const STAT_TEST_IDS: Record<StatColumn["key"], string> = {
  pace: "sprint-result-average-solve",
  rating: "sprint-result-rating-change",
  streak: "sprint-result-best-streak",
  time: "sprint-result-time"
};

const STAT_DETAIL_TEST_IDS: Partial<Record<StatColumn["key"], string>> = {
  pace: "sprint-result-usual-solve",
  rating: "sprint-result-rating-range"
};

function ReviewArea({
  data,
  fontScale,
  infoOpen,
  result,
  stacked,
  onMarkUnclear,
  onReplay,
  onToggleInfo
}: {
  data: SprintResultData;
  fontScale: number;
  infoOpen: boolean;
  result: SprintResultPresentation;
  stacked: boolean;
  onMarkUnclear: () => void;
  onReplay: () => void;
  onToggleInfo: () => void;
}): React.JSX.Element | null {
  const styles = useStyles();
  const theme = useTheme();
  const review = result.review;
  const glyphScale = Math.min(fontScale, RESULT_CAPPED_SCALE);
  const infoTarget = theme.metrics.minTarget * glyphScale;
  const rows: React.ReactNode[] = [];

  if (data.unclearPrompt) {
    rows.push(
      <View
        accessibilityLabel={`${data.unclearPrompt.question} ${data.unclearPrompt.marked ? "Marked as unclear." : ""}`.trim()}
        key="unclear"
        style={[styles.row, stacked ? styles.rowStacked : null]}
        testID="sprint-unclear-prompt"
      >
        <AppText style={stacked ? null : styles.rowTitle} testID="sprint-unclear-question" variant="headline">
          {data.unclearPrompt.question}
        </AppText>
        {data.unclearPrompt.marked ? (
          <View style={stacked ? null : styles.centeredSelf}>
            <Badge label="Marked" testID="sprint-unclear-marked" />
          </View>
        ) : (
          <Button
            accessibilityLabel="Mark this attempt as unclear"
            label="Mark as unclear"
            size="compact"
            testID="sprint-unclear-toggle"
            variant="secondary"
            onPress={onMarkUnclear}
          />
        )}
      </View>
    );
  }

  if (review) {
    rows.push(
      <View key="review" style={styles.reviewRow} testID="sprint-result-review-impact">
        {/* The whole row opens Replay; the info button sits above it as its own target. */}
        <Pressable
          accessibilityLabel={review.replayAccessibilityLabel}
          accessibilityRole="button"
          style={({ pressed }) => [StyleSheet.absoluteFill, pressed ? styles.rowPressed : null]}
          testID="sprint-result-replay"
          onPress={onReplay}
        />
        <View pointerEvents="box-none" style={[styles.row, stacked ? styles.rowStacked : null]}>
          <View pointerEvents="box-none" style={[styles.reviewLead, stacked ? styles.reviewLeadStacked : null]}>
            <View pointerEvents="none" style={styles.reviewTitle}>
              <AppText testID="sprint-result-review-count" variant="headline">{review.title}</AppText>
            </View>
            <Pressable
              accessibilityLabel="About the puzzles to review"
              accessibilityRole="button"
              accessibilityState={{ expanded: infoOpen }}
              style={({ pressed }) => [
                styles.infoButton,
                { height: infoTarget, width: infoTarget },
                pressed ? styles.pressed : null
              ]}
              testID="sprint-result-review-info"
              onPress={onToggleInfo}
            >
              <Icon color={theme.colors.accent.s600} name="info" size={Math.round(20 * glyphScale)} />
            </Pressable>
          </View>
          <View pointerEvents="none" style={styles.reviewTrailing}>
            <AppText numberOfLines={1} tone="accent" variant="body">Replay</AppText>
            <Icon
              color={theme.colors.text.tertiary}
              name="chevronRight"
              size={Math.round(15 * glyphScale)}
              weight="semibold"
            />
          </View>
        </View>
      </View>
    );
    if (infoOpen) {
      // The explanation opens inside the same group, directly under its row.
      rows.push(
        <View key="explanation" style={styles.explanation} testID="sprint-result-review-note">
          {review.explanation.map((line) => (
            <AppText key={line} tone="secondary" variant="footnote">{line}</AppText>
          ))}
        </View>
      );
    }
  }

  // With nothing to review the section is hidden entirely (owner decision).
  if (rows.length === 0) {
    return null;
  }

  return (
    <Section rows testID="sprint-result-review">
      {rows}
    </Section>
  );
}

const useStyles = makeStyles((theme) => ({
  pressed: {
    opacity: 0.7
  },
  centeredText: {
    textAlign: "center"
  },
  centeredSelf: {
    alignSelf: "center"
  },
  scoreTarget: {
    fontWeight: theme.typography.display.fontWeight
  },
  // Rows match ListRow: at least 52 pt, 16 pt sides, 10 pt top and bottom.
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row,
    minHeight: theme.metrics.rowMinHeight,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  rowTitle: {
    flex: 1
  },
  // At large text sizes a row's parts stack instead of squeezing words apart.
  rowStacked: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: theme.spacing.group,
    paddingVertical: theme.spacing.row
  },
  rowPressed: {
    backgroundColor: theme.colors.surfaceStrong
  },
  reviewRow: {
    position: "relative"
  },
  reviewLead: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    minWidth: 0
  },
  reviewLeadStacked: {
    alignSelf: "stretch",
    flexBasis: "auto",
    flexGrow: 0,
    flexShrink: 0
  },
  reviewTitle: {
    flexShrink: 1
  },
  // The 44 pt target overlaps the row's vertical padding; the glyph stays
  // optically next to the title.
  infoButton: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: -10,
    minHeight: theme.metrics.minTarget,
    minWidth: theme.metrics.minTarget
  },
  reviewTrailing: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  explanation: {
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: theme.spacing.row
  }
}));
