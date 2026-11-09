// Shared frame of the direction A result destinations (Issue #609): the Sprint
// Result (approved spec in PR #650) and the Survival result. A full-screen
// destination with a top bar (back, title, optional action), a centered hero,
// the details and the actions, laid out for phone portrait (actions pinned
// when they fit), phone landscape (hero and details side by side), iPad and
// accessibility text sizes. Screens supply the content; this module owns the
// layout and the pieces both heroes and stats cards share.

import React, { useContext, useState } from "react";
import {
  Platform,
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
import type { ResultStat } from "./resultStat.ts";
import { AppText, Icon, Section, type IconName } from "./ui/index.tsx";

export type ResultInsets = { top: number; right: number; bottom: number; left: number };

const ZERO_INSETS: ResultInsets = { top: 0, right: 0, bottom: 0, left: 0 };
// The hero score (`display`), the navigation title and the hero glyphs grow
// at most 1.5x with Dynamic Type so the result never leaves the screen.
export const RESULT_CAPPED_SCALE = 1.5;
// Stat numerals grow at most 2x, like the session HUD values (#652).
const NUMERAL_MAX_SCALE = 2;
const CONTENT_MAX_WIDTH = 560;
const SPLIT_DETAILS_MAX_WIDTH = 400;
// Phone landscape gives the details pane a little more room than the hero.
const SPLIT_DETAILS_FLEX = 1.2;
// Below this column width a stat value or its detail line would wrap, so the
// card switches to label and value rows (narrow phones).
const STAT_COLUMN_MIN_WIDTH = 112;
// Conservative advance of one tabular numeral glyph, as a share of the font size.
const STAT_NUMERAL_CHARACTER_WIDTH = 0.6;
// iPadOS draws its 24-pt status bar over full-screen landscape windows while
// reporting little or no top safe-area inset there; the top bar stays below it.
const IOS_REGULAR_STATUS_BAR_HEIGHT = 24;

export type ResultStatsLayout = "columns" | "rows" | "vertical";

export type ResultTopBarAction = {
  accessibilityLabel: string;
  icon: IconName;
  onPress: () => void;
  testID: string;
};

export type ResultScreenContext = {
  fontScale: number;
  /** Accessibility text sizes: hero lines and rows stack instead of sharing a line. */
  stacked: boolean;
  statsLayout: ResultStatsLayout;
};

export function ResultScreenLayout({
  actions,
  backAccessibilityLabel,
  backTestID,
  renderDetails,
  renderHero,
  notice,
  onBack,
  paddingInsets,
  stats = [],
  style,
  testID,
  testIDPrefix,
  title,
  trailingAction
}: {
  /** The action buttons, top to bottom. */
  actions: React.ReactNode;
  backAccessibilityLabel: string;
  backTestID: string;
  renderDetails: (context: ResultScreenContext) => React.ReactNode;
  renderHero: (context: ResultScreenContext) => React.ReactNode;
  /** Shown above the hero, for example an error. */
  notice?: React.ReactNode;
  onBack: () => void;
  /** Insets to pad by. Defaults to the safe area; pass zero when the parent pads. */
  paddingInsets?: ResultInsets | undefined;
  /** The stats card's columns, so the card can leave columns when a value would not fit one. */
  stats?: readonly ResultStat[];
  style?: StyleProp<ViewStyle>;
  testID: string;
  /** Prefix of the layout's own test IDs: `-top-bar`, `-title`, `-split`, `-scroll`, `-actions`. */
  testIDPrefix: string;
  title: string;
  /** A circular icon button at the trailing end of the top bar. */
  trailingAction?: ResultTopBarAction | undefined;
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
  const [measured, setMeasured] = useState({ actions: 0, bar: 0, body: 0, screen: 0 });
  const measure = (key: keyof typeof measured) => (event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    setMeasured((current) => (current[key] === height ? current : { ...current, [key]: height }));
  };

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
  // A long numeral (an active time past one hour, 51:12:00) needs a wider
  // column than the default; values never truncate.
  const longestStatValue = Math.max(0, ...stats.filter((stat) => !stat.valueIsWord).map((stat) => stat.value.length));
  const statValueWidth = longestStatValue * theme.typography.numeralLarge.fontSize * STAT_NUMERAL_CHARACTER_WIDTH;
  const context: ResultScreenContext = {
    fontScale,
    stacked: layout.isLargeText,
    statsLayout: layout.isLargeText
      ? "vertical"
      : statColumnWidth < Math.max(STAT_COLUMN_MIN_WIDTH, statValueWidth) ? "rows" : "columns"
  };
  // Phone landscape at accessibility sizes has no room for a fixed bar: the
  // top bar scrolls away with the content.
  const barScrolls = layout.className === "compactLandscape" && layout.isLargeText;
  // The top bar starts below the status bar: the safe-area inset (padded
  // here or by the parent), raised to the iPad status bar where iOS reports
  // less, then the standard top-bar spacing.
  const statusBarClearance = Platform.OS === "ios" && layout.isRegularWidth
    ? Math.max(0, IOS_REGULAR_STATUS_BAR_HEIGHT - safeInsets.top)
    : 0;
  const barTop = insets.top + statusBarClearance;
  const horizontalInset = {
    paddingLeft: insets.left + theme.spacing.screen,
    paddingRight: insets.right + theme.spacing.screen
  };

  const topBar = (barStyle: StyleProp<ViewStyle>) => (
    <TopBar
      backAccessibilityLabel={backAccessibilityLabel}
      backTestID={backTestID}
      onBack={onBack}
      onLayout={measure("bar")}
      style={barStyle}
      testIDPrefix={testIDPrefix}
      title={title}
      trailingAction={trailingAction}
    />
  );
  const heroNode = renderHero(context);
  const detailsNode = <View style={styles.details}>{renderDetails(context)}</View>;
  const actionButtons = (
    <View onLayout={measure("actions")} style={styles.actions} testID={`${testIDPrefix}-actions`}>
      {actions}
    </View>
  );
  const scrollPadding = {
    paddingBottom: (pinsActions ? 0 : insets.bottom) + theme.spacing.screen,
    // A scrolling top bar starts where the fixed one would.
    paddingTop: barScrolls ? theme.spacing.group : theme.spacing.screen
  };

  return (
    <View onLayout={measure("screen")} style={[styles.screen, style]} testID={testID}>
      {/* Remount the content when Dynamic Type changes: iOS keeps some text
          measurements from the previous size otherwise, leaving rows and
          buttons at their old heights after the user shrinks the text. */}
      <React.Fragment key={`text-scale-${fontScale}`}>
      {barScrolls ? null : topBar([horizontalInset, { paddingTop: barTop + theme.spacing.group }])}
      {usesSplit ? (
        // Phone landscape: the hero stays put on the left while the details
        // and actions scroll on the right; both center in their pane.
        <View style={[styles.split, horizontalInset]} testID={`${testIDPrefix}-split`}>
          <View style={[styles.splitHero, { paddingBottom: insets.bottom }]}>{heroNode}</View>
          <ScrollView
            contentContainerStyle={[styles.splitScrollContent, scrollPadding]}
            style={[styles.splitDetails, { flex: SPLIT_DETAILS_FLEX, maxWidth: SPLIT_DETAILS_MAX_WIDTH }]}
            testID={`${testIDPrefix}-scroll`}
          >
            {notice}
            {detailsNode}
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
          testID={`${testIDPrefix}-scroll`}
        >
          {barScrolls ? topBar([styles.scrolledTopBar, { paddingTop: barTop }]) : null}
          <View style={styles.column}>
            <View onLayout={measure("body")} style={styles.column}>
              {notice}
              {heroNode}
              {detailsNode}
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
  backAccessibilityLabel,
  backTestID,
  onBack,
  onLayout,
  style,
  testIDPrefix,
  title,
  trailingAction
}: {
  backAccessibilityLabel: string;
  backTestID: string;
  onBack: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
  style: StyleProp<ViewStyle>;
  testIDPrefix: string;
  title: string;
  trailingAction?: ResultTopBarAction | undefined;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  // Navigation-bar glyphs keep their size so they stay inside the 44 pt
  // circles; the title grows with the text, capped at 1.5x.
  // iOS keeps navigation-bar buttons at the screen's leading and trailing
  // edges on iPad too, even when the content column is centered.
  return (
    <View onLayout={onLayout} style={[styles.topBar, style]} testID={`${testIDPrefix}-top-bar`}>
      <Pressable
        accessibilityLabel={backAccessibilityLabel}
        accessibilityRole="button"
        hitSlop={4}
        style={({ pressed }) => [styles.circleButton, pressed ? styles.pressed : null]}
        testID={backTestID}
        onPress={onBack}
      >
        <Icon color={theme.colors.accent.s600} name="chevronLeft" size={17} weight="semibold" />
      </Pressable>
      <AppText
        accessibilityRole="header"
        maxFontSizeMultiplier={RESULT_CAPPED_SCALE}
        numberOfLines={2}
        style={styles.topBarTitle}
        testID={`${testIDPrefix}-title`}
        variant="headline"
      >
        {title}
      </AppText>
      {trailingAction ? (
        <Pressable
          accessibilityLabel={trailingAction.accessibilityLabel}
          accessibilityRole="button"
          hitSlop={4}
          style={({ pressed }) => [styles.circleButton, pressed ? styles.pressed : null]}
          testID={trailingAction.testID}
          onPress={trailingAction.onPress}
        >
          <Icon color={theme.colors.accent.s600} name={trailingAction.icon} size={20} weight="semibold" />
        </Pressable>
      ) : (
        <View style={styles.circleButtonSpacer} />
      )}
    </View>
  );
}

/** The round status badge that leads the outcome line; its glyph grows at most 1.5x. */
export function ResultStatusGlyph({
  backgroundColor,
  children,
  fontScale,
  testID
}: {
  backgroundColor: string;
  /** The glyph, drawn at `size` points. */
  children: (size: number) => React.ReactNode;
  fontScale: number;
  testID: string;
}): React.JSX.Element {
  const styles = useStyles();
  const glyphScale = Math.min(fontScale, RESULT_CAPPED_SCALE);
  return (
    <View
      style={[styles.statusBadge, { backgroundColor, height: 26 * glyphScale, width: 26 * glyphScale }]}
      testID={testID}
    >
      {children(Math.round(16 * glyphScale))}
    </View>
  );
}

/**
 * The outcome line: the status badge, then the outcome in one or two parts.
 * At large text sizes the badge sits above the outcome and each part takes its
 * own centered line instead of breaking at the separator.
 */
export function ResultOutcomeLine({
  accessibilityLabel,
  glyph,
  parts,
  stacked,
  testIDPrefix,
  tone = "primary"
}: {
  accessibilityLabel: string;
  glyph: React.ReactNode;
  parts: readonly string[];
  stacked: boolean;
  /** Prefix of `-outcome`, `-headline` and `-reason`. */
  testIDPrefix: string;
  tone?: "primary" | "accent";
}): React.JSX.Element {
  const styles = useStyles();
  const [title, reason] = parts;
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={stacked ? styles.outcomeStack : styles.outcomeLine}
      testID={`${testIDPrefix}-outcome`}
    >
      {glyph}
      <View style={stacked ? styles.outcomeTextStack : styles.outcomeTextLine}>
        {/* The separator travels with the title so a narrow line breaks
            after it, never before it. */}
        <View style={stacked ? null : styles.outcomeTitleGroup}>
          <AppText style={styles.centeredText} testID={`${testIDPrefix}-headline`} tone={tone} variant="headline">
            {title}
          </AppText>
          {reason && !stacked ? <AppText tone={tone} variant="headline">{"·"}</AppText> : null}
        </View>
        {reason ? (
          <AppText style={styles.centeredText} testID={`${testIDPrefix}-reason`} tone={tone} variant="headline">
            {reason}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

/** The thin bar under the hero score. Decorative; the score and copy carry the meaning. */
export function ResultProgressTrack({
  color,
  progress,
  testID
}: {
  color: string;
  /** 0...1 */
  progress: number;
  testID: string;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.progressTrack}
      testID={testID}
    >
      <View
        style={[
          styles.progressFill,
          { backgroundColor: color, width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }
        ]}
      />
    </View>
  );
}

/** A centered secondary hero line whose parts stack at large text sizes. */
export function ResultSummaryLine({
  parts,
  separator = " · ",
  stacked,
  testID
}: {
  parts: readonly string[];
  separator?: string;
  stacked: boolean;
  testID: string;
}): React.JSX.Element {
  const styles = useStyles();
  const line = parts.join(separator);
  return stacked ? (
    <View accessible accessibilityLabel={line} testID={testID}>
      {parts.map((part) => (
        <AppText key={part} style={styles.centeredText} tone="secondary" variant="subheadline">{part}</AppText>
      ))}
    </View>
  ) : (
    <AppText style={styles.centeredText} testID={testID} tone="secondary" variant="subheadline">
      {line}
    </AppText>
  );
}

/**
 * One stats card: three centered columns with hairlines, label and value rows
 * where the columns cannot hold the values (narrow phones), and label over
 * value at accessibility text sizes.
 */
export function ResultStatsCard({
  columns,
  detailTestIDs = {},
  layout,
  testID,
  testIDs
}: {
  columns: readonly ResultStat[];
  detailTestIDs?: Partial<Record<string, string>>;
  layout: ResultStatsLayout;
  testID: string;
  testIDs: Partial<Record<string, string>>;
}): React.JSX.Element {
  const styles = useStyles();
  if (layout === "vertical") {
    // Accessibility text sizes: each stat reads top to bottom, label first,
    // so the value and its detail have the full width.
    return (
      <Section rows testID={testID}>
        {columns.map((column) => (
          <View
            accessible
            accessibilityLabel={column.accessibilityLabel}
            key={column.key}
            style={styles.statVertical}
            testID={testIDs[column.key]}
          >
            <AppText tone="secondary" variant="subheadline">{column.label}</AppText>
            <AppText maxFontSizeMultiplier={NUMERAL_MAX_SCALE} tone={column.valueTone} variant="numeral">
              {column.value}
            </AppText>
            {column.detail ? (
              <AppText style={styles.tabular} testID={detailTestIDs[column.key]} tone="secondary" variant="footnote">
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
      <Section rows testID={testID}>
        {columns.map((column) => (
          <View
            accessible
            accessibilityLabel={column.accessibilityLabel}
            key={column.key}
            style={styles.statRow}
            testID={testIDs[column.key]}
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
                  testID={detailTestIDs[column.key]}
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
    <Section surfaceStyle={styles.statsSurface} testID={testID}>
      {columns.map((column, index) => (
        <React.Fragment key={column.key}>
          {index > 0 ? <View style={styles.statDivider} /> : null}
          <View
            accessible
            accessibilityLabel={column.accessibilityLabel}
            style={styles.statColumn}
            testID={testIDs[column.key]}
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
                testID={detailTestIDs[column.key]}
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

/** The centered hero column: outcome line, display score, bar and summary lines. */
export function ResultHeroFrame({
  children,
  testID
}: React.PropsWithChildren<{ testID: string }>): React.JSX.Element {
  const styles = useStyles();
  return <View style={styles.hero} testID={testID}>{children}</View>;
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
  scrolledTopBar: {
    alignSelf: "stretch",
    marginBottom: theme.spacing.screen
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
  endText: {
    textAlign: "right"
  },
  tabular: {
    fontVariant: ["tabular-nums"]
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
  actions: {
    gap: theme.spacing.row
  },
  pinnedActions: {
    backgroundColor: theme.colors.surfaceRaised,
    paddingTop: theme.spacing.row
  }
}));
