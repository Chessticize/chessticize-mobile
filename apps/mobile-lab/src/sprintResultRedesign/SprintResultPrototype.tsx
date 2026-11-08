// Issue #609 Sprint Result redesign prototype, direction A "Grouped Native".
// Design only: it is built from the real ui/ primitives and theme but is not
// wired into the app. The production SprintSummary in PracticePocScreen.tsx is
// unchanged. Story data comes from sprintResultFixtures.ts.

import React, { createContext, useContext, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, type TextStyle } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { buildPracticeAdaptiveLayout } from "../../../mobile/src/components/adaptivePracticeLayout.ts";
import { usePracticeViewport } from "../../../mobile/src/components/PracticeViewport.tsx";
import { AppText, Badge, Button, Icon, Section } from "../../../mobile/src/components/ui/index.tsx";
import { makeStyles } from "../../../mobile/src/theme/makeStyles.ts";
import { typography as baseTypography } from "../../../mobile/src/theme/scales.ts";
import { ThemeProvider, useTheme } from "../../../mobile/src/theme/ThemeProvider.ts";
import type { Theme } from "../../../mobile/src/theme/themeTypes.ts";
import { LUCIDE_ICONS, type LucideIconName } from "../visualDirection/lucideIcons.ts";
import {
  presentSprintResult,
  type SprintResultPrototypeData,
  type StatColumn,
  type ZeroReviewVariant
} from "./sprintResultPresentation.ts";

// React Native scales text uniformly by the system font scale; the browser
// cannot, so the Lab simulates a text size by scaling the theme's type roles.
// 3.12 is React Native's iOS multiplier at the largest accessibility size (AX5).
export const LARGEST_ACCESSIBILITY_FONT_SCALE = 3.12;

const LabFontScaleContext = createContext(1);

function scaledTheme(theme: Theme, fontScale: number): Theme {
  const typography = Object.fromEntries(
    Object.entries(theme.typography).map(([role, style]) => [
      role,
      { ...style, fontSize: style.fontSize * fontScale, lineHeight: style.lineHeight * fontScale }
    ])
  ) as Theme["typography"];
  return { ...theme, typography };
}

/** Renders children at a simulated Dynamic Type size (Lab only). */
export function LabTextSize({
  children,
  fontScale
}: React.PropsWithChildren<{ fontScale: number }>): React.JSX.Element {
  const theme = useTheme();
  const scaled = useMemo(() => scaledTheme(theme, fontScale), [theme, fontScale]);
  return (
    <LabFontScaleContext.Provider value={fontScale}>
      <ThemeProvider theme={scaled}>{children}</ThemeProvider>
    </LabFontScaleContext.Provider>
  );
}

// A display numeral for the hero score. It caps its growth (native would set
// maxFontSizeMultiplier) so the score never pushes the result off screen. The
// navigation title and the hero's glyphs cap the same way.
const HERO_NUMERAL = { fontSize: 56, lineHeight: 64 } as const;
const CAPPED_SCALE = 1.5;
const CONTENT_MAX_WIDTH = 560;
const SPLIT_DETAILS_MAX_WIDTH = 400;
// Phone landscape gives the details pane a little more room than the hero.
const SPLIT_DETAILS_FLEX = 1.2;
// Below this column width a stat value or its detail line would wrap, so the
// card switches to label and value rows (narrow phones, phone landscape split).
const STAT_COLUMN_MIN_WIDTH = 112;

export function SprintResultPrototype({
  data,
  initialInfoOpen = false,
  initialMarkedUnclear = false,
  zeroReview = "hidden"
}: {
  data: SprintResultPrototypeData;
  initialInfoOpen?: boolean;
  initialMarkedUnclear?: boolean;
  zeroReview?: ZeroReviewVariant;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const fontScale = useContext(LabFontScaleContext);
  const viewport = usePracticeViewport();
  const insets = useContext(SafeAreaInsetsContext) ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const layout = buildPracticeAdaptiveLayout({
    fontScale,
    height: viewport.height,
    insets,
    width: viewport.width
  });
  const [markedUnclear, setMarkedUnclear] = useState(initialMarkedUnclear);
  const [infoOpen, setInfoOpen] = useState(initialInfoOpen);
  const [measured, setMeasured] = useState({ bar: 0, body: 0, actions: 0 });
  const measure = (key: keyof typeof measured) => (event: { nativeEvent: { layout: { height: number } } }) => {
    const height = Math.round(event.nativeEvent.layout.height);
    setMeasured((current) => (current[key] === height ? current : { ...current, [key]: height }));
  };
  const result = presentSprintResult(data, { markedUnclear });

  const usesSplit = layout.className === "compactLandscape" && !layout.isLargeText;
  // Phone portrait pins the actions to the bottom when everything fits;
  // otherwise (a short phone, a long review list) they scroll with the content.
  const pinnedChrome = theme.spacing.screen * 2 + theme.spacing.row + theme.spacing.group + insets.bottom;
  const fitsPinned = measured.body === 0
    || measured.bar + measured.body + measured.actions + pinnedChrome <= viewport.height;
  const pinsActions = layout.className === "compactPortrait" && !layout.isLargeText && fitsPinned;
  const isRegular = layout.isRegularWidth;
  const contentWidth = Math.max(0, layout.contentWidth - theme.spacing.screen * 2);
  const detailsWidth = usesSplit
    ? Math.min(
      SPLIT_DETAILS_MAX_WIDTH,
      ((contentWidth - theme.spacing.section) * SPLIT_DETAILS_FLEX) / (1 + SPLIT_DETAILS_FLEX)
    )
    : Math.min(CONTENT_MAX_WIDTH, contentWidth);
  const statColumnWidth = (detailsWidth - theme.spacing.row * 2) / 3;
  const stacksStats = layout.isLargeText || statColumnWidth < STAT_COLUMN_MIN_WIDTH;
  const horizontalInset = {
    paddingLeft: insets.left + theme.spacing.screen,
    paddingRight: insets.right + theme.spacing.screen
  };

  const hero = <ResultHero fontScale={fontScale} result={result} stacked={layout.isLargeText} />;
  const details = (
    <View style={styles.details}>
      <StatsCard columns={result.stats} layout={layout.isLargeText ? "vertical" : stacksStats ? "rows" : "columns"} />
      <ReviewArea
        data={data}
        fontScale={fontScale}
        infoOpen={infoOpen}
        markedUnclear={markedUnclear}
        result={result}
        stacked={layout.isLargeText}
        zeroReview={zeroReview}
        onMarkUnclear={() => setMarkedUnclear(true)}
        onToggleInfo={() => setInfoOpen((open) => !open)}
      />
    </View>
  );
  const actions = (
    <View onLayout={measure("actions")} style={styles.actions} testID="sprint-result-redesign-actions">
      {result.showReplayMistakes ? (
        <Button
          accessibilityLabel={result.replayMistakesAccessibilityLabel}
          label="Replay mistakes"
          stretch
          testID="sprint-result-redesign-replay-mistakes"
          variant="secondary"
          onPress={() => undefined}
        />
      ) : null}
      <Button
        label={result.primaryActionLabel}
        stretch
        testID="sprint-result-redesign-primary"
        onPress={() => undefined}
      />
    </View>
  );
  const scrollPadding = {
    paddingBottom: (pinsActions ? 0 : insets.bottom) + theme.spacing.screen,
    paddingTop: theme.spacing.screen
  };

  return (
    <View style={[styles.screen, { height: viewport.height }]} testID="sprint-result-redesign">
      <TopBar
        fontScale={fontScale}
        onLayout={measure("bar")}
        showTrend={result.showTrendAction}
        style={[horizontalInset, { paddingTop: insets.top + theme.spacing.group }]}
        title={result.title}
      />
      {usesSplit ? (
        // Phone landscape: the hero stays put on the left while the details
        // and actions scroll on the right; both center in their pane.
        <View style={[styles.split, horizontalInset]} testID="sprint-result-redesign-split">
          <View style={[styles.splitHero, { paddingBottom: insets.bottom }]}>{hero}</View>
          <ScrollView
            contentContainerStyle={[styles.splitScrollContent, scrollPadding]}
            style={[styles.splitDetails, { flex: SPLIT_DETAILS_FLEX, maxWidth: SPLIT_DETAILS_MAX_WIDTH }]}
          >
            {details}
            {actions}
          </ScrollView>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            horizontalInset,
            scrollPadding,
            isRegular ? styles.scrollContentCentered : null
          ]}
          style={styles.scroll}
        >
          <View style={styles.column}>
            <View onLayout={measure("body")} style={styles.column}>
              {hero}
              {details}
            </View>
            {pinsActions ? null : actions}
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
          {actions}
        </View>
      ) : null}
    </View>
  );
}

function TopBar({
  fontScale,
  onLayout,
  showTrend,
  style,
  title
}: {
  fontScale: number;
  onLayout: React.ComponentProps<typeof View>["onLayout"];
  showTrend: boolean;
  style: React.ComponentProps<typeof View>["style"];
  title: string;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const titleScale = Math.min(fontScale, CAPPED_SCALE);
  // iOS keeps navigation-bar buttons at the screen's leading and trailing
  // edges on iPad too, even when the content column is centered.
  return (
    <View onLayout={onLayout} style={[styles.topBar, style]} testID="sprint-result-redesign-top-bar">
      <Pressable
        accessibilityLabel="Done"
        accessibilityRole="button"
        style={({ pressed }) => [styles.circleButton, pressed ? styles.pressed : null]}
        testID="sprint-result-redesign-back"
        onPress={() => undefined}
      >
        <Icon color={theme.colors.accent.s600} name="chevronLeft" size={17} weight="semibold" />
      </Pressable>
      <AppText
        accessibilityRole="header"
        maxFontSizeMultiplier={CAPPED_SCALE}
        numberOfLines={1}
        style={[
          styles.topBarTitle,
          {
            fontSize: baseTypography.headline.fontSize * titleScale,
            lineHeight: baseTypography.headline.lineHeight * titleScale
          }
        ]}
        variant="headline"
      >
        {title}
      </AppText>
      {showTrend ? (
        <Pressable
          accessibilityLabel="View rating trend in History"
          accessibilityRole="button"
          style={({ pressed }) => [styles.circleButton, pressed ? styles.pressed : null]}
          testID="sprint-result-redesign-trend"
          onPress={() => undefined}
        >
          <LabIcon color={theme.colors.accent.s600} name="chart-spline" size={20} />
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
  result: ReturnType<typeof presentSprintResult>;
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
  const heroScale = Math.min(fontScale, CAPPED_SCALE);
  const heroNumeral: TextStyle = {
    ...theme.typography.numeralLarge,
    fontSize: HERO_NUMERAL.fontSize * heroScale,
    lineHeight: HERO_NUMERAL.lineHeight * heroScale
  };
  const [solved, target] = result.scoreLabel.split(" / ");
  const badge = (
    <View
      style={[
        styles.statusBadge,
        { backgroundColor: toneSoft, height: 26 * heroScale, width: 26 * heroScale }
      ]}
    >
      <Icon color={toneColor} name={result.outcomeIcon} size={Math.round(16 * heroScale)} weight="bold" />
    </View>
  );
  // At large text sizes the badge sits above the outcome, and each part of the
  // outcome and summary takes its own centered line instead of breaking at "·".
  const summaryParts = result.summaryLine.split(" · ");
  return (
    <View style={styles.hero} testID="sprint-result-redesign-hero">
      <View
        accessible
        accessibilityLabel={result.outcomeLabel}
        style={stacked ? styles.outcomeStack : styles.outcomeLine}
        testID="sprint-result-redesign-outcome"
      >
        {badge}
        {stacked ? (
          result.outcomeParts.map((part) => (
            <AppText key={part} style={styles.centeredText} variant="headline">{part}</AppText>
          ))
        ) : (
          <AppText style={styles.outcomeText} variant="headline">{result.outcomeLabel}</AppText>
        )}
      </View>
      <AppText
        accessibilityLabel={result.scoreAccessibilityLabel}
        maxFontSizeMultiplier={CAPPED_SCALE}
        style={[heroNumeral, styles.centeredText]}
        testID="sprint-result-redesign-score"
      >
        {solved}
        <AppText style={[heroNumeral, styles.scoreTarget]} tone="secondary">{` / ${target}`}</AppText>
      </AppText>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.progressTrack}
        testID="sprint-result-redesign-progress"
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
        <View testID="sprint-result-redesign-summary">
          {summaryParts.map((part) => (
            <AppText key={part} style={styles.centeredText} tone="secondary" variant="subheadline">{part}</AppText>
          ))}
        </View>
      ) : (
        <AppText
          style={styles.centeredText}
          testID="sprint-result-redesign-summary"
          tone="secondary"
          variant="subheadline"
        >
          {result.summaryLine}
        </AppText>
      )}
    </View>
  );
}

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
      <Section rows testID="sprint-result-redesign-stats">
        {columns.map((column) => (
          <View
            accessible
            accessibilityLabel={column.accessibilityLabel}
            key={column.key}
            style={styles.statVertical}
            testID={`sprint-result-redesign-stat-${column.key}`}
          >
            <AppText tone="secondary" variant="subheadline">{column.label}</AppText>
            <AppText tone={column.valueTone} variant="numeral">{column.value}</AppText>
            {column.detail ? (
              <AppText style={styles.tabular} tone="secondary" variant="footnote">{column.detail}</AppText>
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
      <Section rows testID="sprint-result-redesign-stats">
        {columns.map((column) => (
          <View
            accessible
            accessibilityLabel={column.accessibilityLabel}
            key={column.key}
            style={styles.statRow}
            testID={`sprint-result-redesign-stat-${column.key}`}
          >
            <AppText style={styles.statRowLabel} tone="secondary" variant="subheadline">
              {column.label}
            </AppText>
            <View style={styles.statRowValue}>
              <AppText style={styles.endText} tone={column.valueTone} variant="numeral">
                {column.value}
              </AppText>
              {column.detail ? (
                <AppText style={[styles.endText, styles.tabular]} tone="secondary" variant="footnote">
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
    <Section surfaceStyle={styles.statsSurface} testID="sprint-result-redesign-stats">
      {columns.map((column, index) => (
        <React.Fragment key={column.key}>
          {index > 0 ? <View style={styles.statDivider} /> : null}
          <View
            accessible
            accessibilityLabel={column.accessibilityLabel}
            style={styles.statColumn}
            testID={`sprint-result-redesign-stat-${column.key}`}
          >
            <AppText numberOfLines={1} style={styles.centeredText} tone="secondary" variant="footnote">
              {column.label}
            </AppText>
            {/* A word value (Unrated) uses the row numeral size so it fits one line. */}
            <AppText
              numberOfLines={1}
              style={[column.valueIsWord ? styles.statWordValue : styles.statValue, styles.centeredText]}
              tone={column.valueTone}
              variant={column.valueIsWord ? "numeral" : "numeralLarge"}
            >
              {column.value}
            </AppText>
            {column.detail ? (
              <AppText
                numberOfLines={1}
                style={[styles.tabular, styles.centeredText]}
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
  markedUnclear,
  result,
  stacked,
  zeroReview,
  onMarkUnclear,
  onToggleInfo
}: {
  data: SprintResultPrototypeData;
  fontScale: number;
  infoOpen: boolean;
  markedUnclear: boolean;
  result: ReturnType<typeof presentSprintResult>;
  stacked: boolean;
  zeroReview: ZeroReviewVariant;
  onMarkUnclear: () => void;
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
        key="unclear"
        style={[styles.row, stacked ? styles.rowStacked : null]}
        testID="sprint-result-redesign-unclear-prompt"
      >
        <AppText style={stacked ? null : styles.rowTitle} variant="headline">
          {data.unclearPrompt.question}
        </AppText>
        {markedUnclear ? (
          <View style={stacked ? null : styles.centeredSelf}>
            <Badge label="Marked" testID="sprint-result-redesign-unclear-marked" />
          </View>
        ) : (
          <Button
            accessibilityLabel="Mark this attempt as unclear"
            label="Mark as unclear"
            size="compact"
            testID="sprint-result-redesign-mark-unclear"
            variant="secondary"
            onPress={onMarkUnclear}
          />
        )}
      </View>
    );
  }

  if (review) {
    rows.push(
      <View key="review" style={styles.reviewRow} testID="sprint-result-redesign-review-row">
        {/* The whole row opens Replay; the info button sits above it as its own target. */}
        <Pressable
          accessibilityLabel={review.replayAccessibilityLabel}
          accessibilityRole="button"
          style={({ pressed }) => [StyleSheet.absoluteFill, pressed ? styles.rowPressed : null]}
          testID="sprint-result-redesign-replay"
          onPress={() => undefined}
        />
        <View pointerEvents="box-none" style={[styles.row, stacked ? styles.rowStacked : null]}>
          <View pointerEvents="box-none" style={[styles.reviewLead, stacked ? styles.reviewLeadStacked : null]}>
            <View pointerEvents="none" style={styles.reviewTitle}>
              <AppText variant="headline">{review.title}</AppText>
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
              testID="sprint-result-redesign-review-info"
              onPress={onToggleInfo}
            >
              <LabIcon color={theme.colors.accent.s600} name="info" size={Math.round(20 * glyphScale)} />
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
        <View key="explanation" style={styles.explanation} testID="sprint-result-redesign-review-explanation">
          {review.explanation.map((line) => (
            <AppText key={line} tone="secondary" variant="footnote">{line}</AppText>
          ))}
        </View>
      );
    }
  }

  if (rows.length === 0) {
    return zeroReview === "line" ? (
      <AppText
        style={styles.centeredText}
        testID="sprint-result-redesign-nothing-to-review"
        tone="secondary"
        variant="footnote"
      >
        Nothing to review
      </AppText>
    ) : null;
  }

  return (
    <Section rows testID="sprint-result-redesign-review">
      {rows}
    </Section>
  );
}

function LabIcon({
  color,
  name,
  size
}: {
  color: string;
  name: LucideIconName;
  size: number;
}): React.JSX.Element {
  // Lab-only stand-in for glyphs the app's icon map does not have yet
  // (info.circle / info and chart.line.uptrend.xyaxis / trending_up).
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={size}
    >
      {LUCIDE_ICONS[name].map(([tag, attributes], index) =>
        React.createElement(tag, { key: index, ...attributes })
      )}
    </svg>
  );
}

const useStyles = makeStyles((theme) => ({
  screen: {
    backgroundColor: theme.colors.surfaceRaised
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
    flex: 1,
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
  statusBadge: {
    alignItems: "center",
    borderRadius: theme.shape.capsule,
    justifyContent: "center"
  },
  outcomeText: {
    flexShrink: 1,
    textAlign: "center"
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
  scoreTarget: {
    fontWeight: theme.typography.numeralLarge.fontWeight
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
  statValue: {
    // Matches the Practice Home Progress card numerals (#636).
    fontSize: 28,
    lineHeight: 34
  },
  statWordValue: {
    // Same line box as the numerals so the three columns stay aligned.
    lineHeight: 34
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
