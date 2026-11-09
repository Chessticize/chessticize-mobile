// Sprint Result, direction A "Grouped Native" (Issue #609; approved spec in
// PR #650). A full-screen destination: a top bar with Done and the rating-trend
// action, a centered hero, one stats card, the review row and the actions.
// It renders only; PracticePocScreen owns the session state and every action,
// and sprintResultPresentation.ts owns the copy.

import React, { useContext, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { makeStyles } from "../theme/makeStyles.ts";
import { useTheme } from "../theme/ThemeProvider.ts";
import { buildPracticeAdaptiveLayout } from "./adaptivePracticeLayout.ts";
import { usePracticeViewport } from "./PracticeViewport.tsx";
import {
  presentSprintResult,
  type SprintResultData,
  type SprintResultPresentation,
  type StatColumn
} from "./sprintResultPresentation.ts";
import { AppText, Badge, Button, Icon, Section } from "./ui/index.tsx";

type Insets = { top: number; right: number; bottom: number; left: number };

const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
// The hero score (`display`), the navigation title and the hero glyphs grow
// at most 1.5x with Dynamic Type so the result never leaves the screen.
const CAPPED_SCALE = 1.5;
// Stat numerals grow at most 2x, like the session HUD values (#652).
const NUMERAL_MAX_SCALE = 2;
const CONTENT_MAX_WIDTH = 560;
const SPLIT_DETAILS_MAX_WIDTH = 400;
// Phone landscape gives the details pane a little more room than the hero.
const SPLIT_DETAILS_FLEX = 1.2;
// Below this column width a stat value or its detail line would wrap, so the
// card switches to label and value rows (narrow phones).
const STAT_COLUMN_MIN_WIDTH = 112;

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
  paddingInsets?: Insets;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const viewport = usePracticeViewport();
  const fontScale = viewport.fontScale ?? 1;
  const safeInsets = useContext(SafeAreaInsetsContext) ?? ZERO_INSETS;
  const insets = paddingInsets ?? safeInsets;
  const layout = buildPracticeAdaptiveLayout({
    fontScale,
    height: viewport.height,
    insets: safeInsets,
    width: viewport.width
  });
  const [infoOpen, setInfoOpen] = useState(initialInfoOpen);
  const [measured, setMeasured] = useState({ actions: 0, bar: 0, body: 0, screen: 0 });
  const measure = (key: keyof typeof measured) => (event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    setMeasured((current) => (current[key] === height ? current : { ...current, [key]: height }));
  };
  const result = presentSprintResult(data);

  const usesSplit = layout.className === "compactLandscape" && !layout.isLargeText;
  // Phone portrait pins the actions to the bottom when everything fits;
  // otherwise (a short phone, a long review list) they scroll with the content.
  const pinnedChrome = theme.spacing.screen * 2 + theme.spacing.row + theme.spacing.group + insets.bottom;
  const fitsPinned = measured.body === 0 || measured.screen === 0
    || measured.bar + measured.body + measured.actions + pinnedChrome <= measured.screen;
  const pinsActions = layout.className === "compactPortrait" && !layout.isLargeText && fitsPinned;
  const contentWidth = Math.max(0, layout.contentWidth - theme.spacing.screen * 2);
  const detailsWidth = usesSplit
    ? Math.min(
      SPLIT_DETAILS_MAX_WIDTH,
      ((contentWidth - theme.spacing.section) * SPLIT_DETAILS_FLEX) / (1 + SPLIT_DETAILS_FLEX)
    )
    : Math.min(CONTENT_MAX_WIDTH, contentWidth);
  const statColumnWidth = (detailsWidth - theme.spacing.row * 2) / 3;
  const statsLayout = layout.isLargeText
    ? "vertical"
    : statColumnWidth < STAT_COLUMN_MIN_WIDTH ? "rows" : "columns";
  const horizontalInset = {
    paddingLeft: insets.left + theme.spacing.screen,
    paddingRight: insets.right + theme.spacing.screen
  };

  const hero = <ResultHero fontScale={fontScale} result={result} stacked={layout.isLargeText} />;
  const details = (
    <View style={styles.details}>
      <StatsCard columns={result.stats} layout={statsLayout} />
      <ReviewArea
        data={data}
        fontScale={fontScale}
        infoOpen={infoOpen}
        result={result}
        stacked={layout.isLargeText}
        onMarkUnclear={actions.onMarkUnclear}
        onReplay={actions.onReplay}
        onToggleInfo={() => setInfoOpen((open) => !open)}
      />
    </View>
  );
  const actionButtons = (
    <View onLayout={measure("actions")} style={styles.actions} testID="sprint-result-actions">
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
    </View>
  );
  const scrollPadding = {
    paddingBottom: (pinsActions ? 0 : insets.bottom) + theme.spacing.screen,
    paddingTop: theme.spacing.screen
  };

  return (
    <View onLayout={measure("screen")} style={[styles.screen, style]} testID="sprint-summary-panel">
      {/* Remount the content when Dynamic Type changes: iOS keeps some text
          measurements from the previous size otherwise, leaving rows and
          buttons at their old heights after the user shrinks the text. */}
      <React.Fragment key={`text-scale-${fontScale}`}>
      <TopBar
        fontScale={fontScale}
        onBack={actions.onBack}
        onLayout={measure("bar")}
        onOpenHistory={result.showTrendAction ? actions.onOpenHistory : undefined}
        style={[horizontalInset, { paddingTop: insets.top + theme.spacing.group }]}
        title={result.title}
      />
      {usesSplit ? (
        // Phone landscape: the hero stays put on the left while the details
        // and actions scroll on the right; both center in their pane.
        <View style={[styles.split, horizontalInset]} testID="sprint-result-split">
          <View style={[styles.splitHero, { paddingBottom: insets.bottom }]}>{hero}</View>
          <ScrollView
            contentContainerStyle={[styles.splitScrollContent, scrollPadding]}
            style={[styles.splitDetails, { flex: SPLIT_DETAILS_FLEX, maxWidth: SPLIT_DETAILS_MAX_WIDTH }]}
            testID="sprint-result-scroll"
          >
            {notice}
            {details}
            {actionButtons}
          </ScrollView>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            horizontalInset,
            scrollPadding,
            layout.isRegularWidth ? styles.scrollContentCentered : null
          ]}
          style={styles.scroll}
          testID="sprint-result-scroll"
        >
          <View style={styles.column}>
            <View onLayout={measure("body")} style={styles.column}>
              {notice}
              {hero}
              {details}
            </View>
            {pinsActions ? null : actionButtons}
          </View>
        </ScrollView>
      )}
      {pinsActions ? (
        <View
          style={[
            styles.pinnedActions,
            horizontalInset,
            { paddingBottom: insets.bottom + theme.spacing.group }
          ]}
        >
          {actionButtons}
        </View>
      ) : null}
      </React.Fragment>
    </View>
  );
}

function TopBar({
  fontScale,
  onBack,
  onLayout,
  onOpenHistory,
  style,
  title
}: {
  fontScale: number;
  onBack: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
  onOpenHistory?: () => void;
  style: StyleProp<ViewStyle>;
  title: string;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  // Navigation-bar glyphs keep their size so they stay inside the 44 pt
  // circles; the title grows with the text, capped at 1.5x.
  // iOS keeps navigation-bar buttons at the screen's leading and trailing
  // edges on iPad too, even when the content column is centered.
  return (
    <View onLayout={onLayout} style={[styles.topBar, style]} testID="sprint-result-top-bar">
      <Pressable
        accessibilityLabel="Done"
        accessibilityRole="button"
        hitSlop={4}
        style={({ pressed }) => [styles.circleButton, pressed ? styles.pressed : null]}
        testID="back-practice-button"
        onPress={onBack}
      >
        <Icon color={theme.colors.accent.s600} name="chevronLeft" size={17} weight="semibold" />
      </Pressable>
      <AppText
        accessibilityRole="header"
        maxFontSizeMultiplier={CAPPED_SCALE}
        numberOfLines={2}
        style={styles.topBarTitle}
        testID="sprint-result-title"
        variant="headline"
      >
        {title}
      </AppText>
      {onOpenHistory ? (
        <Pressable
          accessibilityLabel="View rating trend in History"
          accessibilityRole="button"
          hitSlop={4}
          style={({ pressed }) => [styles.circleButton, pressed ? styles.pressed : null]}
          testID="sprint-result-history-button"
          onPress={onOpenHistory}
        >
          <Icon color={theme.colors.accent.s600} name="trend" size={20} weight="semibold" />
        </Pressable>
      ) : (
        <View style={styles.circleButtonSpacer} />
      )}
    </View>
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
  const glyphScale = Math.min(fontScale, CAPPED_SCALE);
  const [title, reason] = result.outcomeParts;
  const badge = (
    <View
      style={[
        styles.statusBadge,
        { backgroundColor: toneSoft, height: 26 * glyphScale, width: 26 * glyphScale }
      ]}
      testID="sprint-result-status-glyph"
    >
      <Icon color={toneColor} name={result.outcomeIcon} size={Math.round(16 * glyphScale)} weight="bold" />
    </View>
  );
  return (
    <View style={styles.hero} testID="sprint-result-hero">
      {/* At large text sizes the badge sits above the outcome and each part
          takes its own centered line instead of breaking at the separator. */}
      <View
        accessible
        accessibilityLabel={result.outcomeLabel}
        style={stacked ? styles.outcomeStack : styles.outcomeLine}
        testID="sprint-result-outcome"
      >
        {badge}
        <View style={stacked ? styles.outcomeTextStack : styles.outcomeTextLine}>
          {/* The separator travels with the title so a narrow line breaks
              after it, never before it. */}
          <View style={stacked ? null : styles.outcomeTitleGroup}>
            <AppText style={styles.centeredText} testID="sprint-result-headline" variant="headline">
              {title}
            </AppText>
            {reason && !stacked ? <AppText variant="headline">{"·"}</AppText> : null}
          </View>
          {reason ? (
            <AppText style={styles.centeredText} testID="sprint-result-reason" variant="headline">
              {reason}
            </AppText>
          ) : null}
        </View>
      </View>
      <AppText
        accessibilityLabel={result.scoreAccessibilityLabel}
        maxFontSizeMultiplier={CAPPED_SCALE}
        style={styles.score}
        testID="sprint-result-solved"
        variant="display"
      >
        {result.solvedLabel}
        <AppText maxFontSizeMultiplier={CAPPED_SCALE} style={styles.scoreTarget} tone="secondary" variant="display">
          {` / ${result.targetLabel}`}
        </AppText>
      </AppText>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.progressTrack}
        testID="sprint-result-progress"
      >
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: result.outcomeTone === "neutral" ? theme.colors.text.tertiary : toneColor,
              width: `${Math.round(result.progress * 100)}%`
            }
          ]}
        />
      </View>
      {stacked ? (
        <View accessible accessibilityLabel={result.summaryLine} testID="sprint-result-accuracy">
          {result.summaryParts.map((part) => (
            <AppText key={part} style={styles.centeredText} tone="secondary" variant="subheadline">{part}</AppText>
          ))}
        </View>
      ) : (
        <AppText style={styles.centeredText} testID="sprint-result-accuracy" tone="secondary" variant="subheadline">
          {result.summaryLine}
        </AppText>
      )}
    </View>
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

function StatsCard({
  columns,
  layout
}: {
  columns: StatColumn[];
  layout: "columns" | "rows" | "vertical";
}): React.JSX.Element {
  const styles = useStyles();
  if (layout === "vertical") {
    // Accessibility text sizes: each stat reads top to bottom, label first,
    // so the value and its detail have the full width.
    return (
      <Section rows testID="sprint-result-stats">
        {columns.map((column) => (
          <View
            accessible
            accessibilityLabel={column.accessibilityLabel}
            key={column.key}
            style={styles.statVertical}
            testID={STAT_TEST_IDS[column.key]}
          >
            <AppText tone="secondary" variant="subheadline">{column.label}</AppText>
            <AppText maxFontSizeMultiplier={NUMERAL_MAX_SCALE} tone={column.valueTone} variant="numeral">
              {column.value}
            </AppText>
            {column.detail ? (
              <AppText style={styles.tabular} testID={STAT_DETAIL_TEST_IDS[column.key]} tone="secondary" variant="footnote">
                {column.detail}
              </AppText>
            ) : null}
          </View>
        ))}
      </Section>
    );
  }
  if (layout === "rows") {
    // Where three columns cannot hold the values (narrow phones) the card
    // becomes label and value rows, as iOS grouped lists do.
    return (
      <Section rows testID="sprint-result-stats">
        {columns.map((column) => (
          <View
            accessible
            accessibilityLabel={column.accessibilityLabel}
            key={column.key}
            style={styles.statRow}
            testID={STAT_TEST_IDS[column.key]}
          >
            <AppText style={styles.statRowLabel} tone="secondary" variant="subheadline">
              {column.label}
            </AppText>
            <View style={styles.statRowValue}>
              <AppText
                maxFontSizeMultiplier={NUMERAL_MAX_SCALE}
                numberOfLines={1}
                style={styles.endText}
                tone={column.valueTone}
                variant="numeral"
              >
                {column.value}
              </AppText>
              {column.detail ? (
                <AppText
                  numberOfLines={1}
                  style={[styles.endText, styles.tabular]}
                  testID={STAT_DETAIL_TEST_IDS[column.key]}
                  tone="secondary"
                  variant="footnote"
                >
                  {column.detail}
                </AppText>
              ) : null}
            </View>
          </View>
        ))}
      </Section>
    );
  }
  return (
    <Section surfaceStyle={styles.statsSurface} testID="sprint-result-stats">
      {columns.map((column, index) => (
        <React.Fragment key={column.key}>
          {index > 0 ? <View style={styles.statDivider} /> : null}
          <View
            accessible
            accessibilityLabel={column.accessibilityLabel}
            style={styles.statColumn}
            testID={STAT_TEST_IDS[column.key]}
          >
            <AppText numberOfLines={1} style={styles.centeredText} tone="secondary" variant="footnote">
              {column.label}
            </AppText>
            {/* A word value (Unrated) uses the smaller numeral so it fits one line. */}
            <AppText
              numberOfLines={1}
              style={[column.valueIsWord ? styles.statWordValue : null, styles.centeredText]}
              tone={column.valueTone}
              variant={column.valueIsWord ? "numeral" : "numeralLarge"}
            >
              {column.value}
            </AppText>
            {column.detail ? (
              <AppText
                numberOfLines={1}
                style={[styles.tabular, styles.centeredText]}
                testID={STAT_DETAIL_TEST_IDS[column.key]}
                tone="secondary"
                variant="footnote"
              >
                {column.detail}
              </AppText>
            ) : null}
          </View>
        </React.Fragment>
      ))}
    </Section>
  );
}

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
  const glyphScale = Math.min(fontScale, CAPPED_SCALE);
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
  screen: {
    backgroundColor: theme.colors.surfaceRaised,
    flex: 1
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline,
    paddingBottom: theme.spacing.group
  },
  topBarTitle: {
    flex: 1,
    textAlign: "center"
  },
  circleButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.capsule,
    height: theme.metrics.minTarget,
    justifyContent: "center",
    width: theme.metrics.minTarget
  },
  circleButtonSpacer: {
    height: theme.metrics.minTarget,
    width: theme.metrics.minTarget
  },
  pressed: {
    opacity: 0.7
  },
  scroll: {
    flex: 1
  },
  scrollContent: {
    alignItems: "center",
    flexGrow: 1
  },
  scrollContentCentered: {
    justifyContent: "center"
  },
  column: {
    gap: theme.spacing.section,
    maxWidth: CONTENT_MAX_WIDTH,
    width: "100%"
  },
  split: {
    flex: 1,
    flexDirection: "row",
    gap: theme.spacing.section
  },
  splitHero: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0
  },
  splitDetails: {
    minWidth: 0
  },
  splitScrollContent: {
    flexGrow: 1,
    gap: theme.spacing.screen,
    justifyContent: "center"
  },
  details: {
    gap: theme.spacing.screen
  },
  hero: {
    alignItems: "stretch",
    gap: theme.spacing.group
  },
  outcomeLine: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: theme.spacing.inline,
    maxWidth: "100%"
  },
  outcomeStack: {
    alignItems: "center",
    gap: theme.spacing.inline
  },
  // Normal sizes: the two parts sit on one line and wrap between them, never
  // inside a word, when the line is too narrow.
  outcomeTextLine: {
    columnGap: 4,
    flexDirection: "row",
    flexShrink: 1,
    flexWrap: "wrap",
    justifyContent: "center"
  },
  outcomeTextStack: {
    alignSelf: "stretch"
  },
  outcomeTitleGroup: {
    columnGap: 4,
    flexDirection: "row"
  },
  statusBadge: {
    alignItems: "center",
    borderRadius: theme.shape.capsule,
    justifyContent: "center"
  },
  centeredText: {
    textAlign: "center"
  },
  centeredSelf: {
    alignSelf: "center"
  },
  endText: {
    textAlign: "right"
  },
  tabular: {
    fontVariant: ["tabular-nums"]
  },
  score: {
    textAlign: "center"
  },
  scoreTarget: {
    fontWeight: theme.typography.display.fontWeight
  },
  progressTrack: {
    alignSelf: "center",
    backgroundColor: theme.colors.border.default,
    borderRadius: theme.shape.capsule,
    height: 4,
    marginVertical: 4,
    maxWidth: 240,
    overflow: "hidden",
    width: "70%"
  },
  progressFill: {
    borderRadius: theme.shape.capsule,
    height: "100%"
  },
  statsSurface: {
    alignItems: "flex-start",
    flexDirection: "row",
    paddingHorizontal: theme.spacing.row,
    paddingVertical: theme.spacing.screen
  },
  // Labels stretch to the column rather than shrink-wrapping their text: see
  // "Text width rounding" in docs/ui-design/MOBILE_UI_DESIGN.md (#633).
  statColumn: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  // Column values use numeralLarge, the Practice Home Progress card numeral.
  // A word value keeps the same line box so the three columns stay aligned.
  statWordValue: {
    lineHeight: theme.typography.numeralLarge.lineHeight
  },
  statDivider: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.border.default,
    width: StyleSheet.hairlineWidth
  },
  statVertical: {
    gap: 2,
    minHeight: theme.metrics.rowMinHeight,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  statRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row,
    minHeight: theme.metrics.rowMinHeight,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  statRowLabel: {
    flex: 1
  },
  statRowValue: {
    alignItems: "stretch",
    flexShrink: 1
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
  },
  actions: {
    gap: theme.spacing.row
  },
  pinnedActions: {
    backgroundColor: theme.colors.surfaceRaised,
    paddingTop: theme.spacing.row
  }
}));
