import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle
} from "react-native";
import {
  type AttemptSource,
  formatLocalCalendarDate,
  formatLocalCalendarDateLabel,
  historyAttemptSpeedSeconds,
  type HistoryAttemptView,
  type HistoryAttentionReason,
  type HistoryPerformance,
  type HistoryRatingRangeFilter,
  type HistoryResultFilter,
  type HistoryTimeRange,
  isAttemptMarkedUnclear,
  normalizeHistoryAttemptDetail,
  type PuzzleSide,
  type SprintMode,
  type ThemeChoiceIntent
} from "../../../../../../packages/core/src/index.ts";
import type { AdaptiveLayout } from "../../adaptivePracticeLayout.ts";
import { makeStyles, useTheme } from "../../../theme/index.ts";
import { AppText, Badge, Button, Icon, SegmentedControl, useListRowStyle, type SegmentOption } from "../../ui/index.tsx";
import { HistoryProgressEntryButton } from "../../HistoryProgressSection.tsx";
import { ToolbarIconButton } from "../shared/ToolbarIconButton.tsx";
import { FilterGlyph } from "../shared/Glyphs.tsx";
import { CollapsibleRegion, DisclosureChevron } from "../shared/CollapsibleRegion.tsx";
import { FilterButton } from "../shared/FilterButton.tsx";
import { modeLabel, safeTestId } from "../shared/practiceUtils.ts";
import { AttemptStatusTile } from "../shared/AttemptStatusTile.tsx";
import { ALL_THEMES_FILTER, customThemeLabel, type ThemeCatalogPresentation } from "../shared/themeCatalog.ts";
import { historyRatingKeyLabel, HistoryRatingTrendChart } from "./HistoryRatingChart.tsx";
import { pickPracticeStyles } from "../shared/practiceStyles.tsx";

export function HistoryPanel({
  adaptiveLayout,
  attempts,
  filtersExpanded,
  nowMs,
  performance,
  ratingKeys,
  runsByRatingKey,
  selectedRatingKey,
  timeRange,
  sourceFilter,
  resultFilter,
  ratingRangeFilter,
  sideFilter,
  themeFilters,
  namedThemeFilters,
  availableThemes,
  page,
  attentionReasons,
  themeCatalogPresentation,
  onRatingKeyChange,
  onTimeRangeChange,
  onSourceFilterChange,
  onResultFilterChange,
  onRatingRangeFilterChange,
  onSideFilterChange,
  onThemeFilterIntent,
  onAttentionReasonChange,
  onPageOffsetChange,
  onOpenAttempt,
  onOpenProgress,
  onFiltersExpandedChange,
  onResetFilters,
  onAttentionOnlyChange
}: {
  adaptiveLayout: AdaptiveLayout;
  attempts: HistoryAttemptView[];
  filtersExpanded: boolean;
  nowMs: number;
  performance: HistoryPerformance;
  ratingKeys: string[];
  runsByRatingKey: ReadonlyMap<string, { name: string; perPuzzleSeconds: number }>;
  selectedRatingKey: string | null;
  timeRange: HistoryTimeRange;
  sourceFilter: "all" | AttemptSource;
  resultFilter: HistoryResultFilter;
  ratingRangeFilter: HistoryRatingRangeFilter;
  sideFilter: "all" | PuzzleSide;
  themeFilters: readonly string[];
  namedThemeFilters: readonly string[];
  availableThemes: string[];
  page: { limit: number; offset: number; total: number; hasMore: boolean };
  attentionReasons: readonly HistoryAttentionReason[];
  themeCatalogPresentation?: ThemeCatalogPresentation;
  onRatingKeyChange: (ratingKey: string | null) => void;
  onTimeRangeChange: (range: HistoryTimeRange) => void;
  onSourceFilterChange: (source: "all" | AttemptSource) => void;
  onResultFilterChange: (result: HistoryResultFilter) => void;
  onRatingRangeFilterChange: (ratingRange: HistoryRatingRangeFilter) => void;
  onSideFilterChange: (side: "all" | PuzzleSide) => void;
  onThemeFilterIntent: (intent: ThemeChoiceIntent) => void;
  onAttentionReasonChange: (reason: HistoryAttentionReason) => void;
  onPageOffsetChange: (offset: number) => void;
  onOpenAttempt: (attemptId: string) => void;
  onOpenProgress?: () => void;
  onFiltersExpandedChange: (expanded: boolean) => void;
  onResetFilters: () => void;
  onAttentionOnlyChange: (attentionOnly: boolean) => void;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const visibleAttempts = attempts;
  const attentionOnly = attentionReasons.length > 0;
  const ratingPoints = performance.charts.rating;
  const latestRating = ratingPoints[ratingPoints.length - 1]?.value;
  const selectedRun = selectedRatingKey ? runsByRatingKey.get(selectedRatingKey) : undefined;
  const activeFilterLabels = historyActiveFilterLabels({
    ratingKey: selectedRatingKey,
    runName: selectedRun?.name,
    runPerPuzzleSeconds: selectedRun?.perPuzzleSeconds,
    ratingRangeFilter,
    resultFilter,
    attentionReasons,
    sideFilter,
    sourceFilter,
    themeFilters: namedThemeFilters,
    timeRange
  });
  return (
    <View style={[styles.historyPanel, adaptiveLayout.usesWideContent ? styles.historyPanelWide : null]} testID="history-panel">
      <View style={styles.historyHeaderRow} testID="history-action-header">
        <AppText accessibilityRole="header" style={styles.destinationTitle} variant="largeTitle">History</AppText>
        <View style={styles.historyHeaderActions}>
          {onOpenProgress ? (
            <HistoryProgressEntryButton onPress={onOpenProgress} />
          ) : null}
          {filtersExpanded ? (
            <Button
              accessibilityLabel="Reset history filters"
              label="Reset filters"
              size="compact"
              testID="history-filter-reset"
              variant="plain"
              onPress={onResetFilters}
            />
          ) : null}
          <ToolbarIconButton
            accessibilityLabel={filtersExpanded ? "Hide history filters" : "Show history filters"}
            accessibilityState={{ expanded: filtersExpanded }}
            active={filtersExpanded}
            testID="history-filter-toggle"
            onPress={() => onFiltersExpandedChange(!filtersExpanded)}
          >
            <FilterGlyph active={filtersExpanded} />
          </ToolbarIconButton>
        </View>
      </View>

      <CollapsibleRegion
        contentTestID="history-advanced-filters"
        contentStyle={styles.historyAdvancedFilters}
        expanded={filtersExpanded}
      >
          <HistoryRatingFilters
            ratingKeys={ratingKeys}
            runsByRatingKey={runsByRatingKey}
            selectedRatingKey={selectedRatingKey}
            onRatingKeyChange={onRatingKeyChange}
          />
          <HistoryRangeFilters timeRange={timeRange} onTimeRangeChange={onTimeRangeChange} />
          <HistoryChipRow testID="history-source-filters">
            <FilterButton active={sourceFilter === "all"} label="All sources" testID="history-source-all" onPress={() => onSourceFilterChange("all")} />
            <FilterButton active={sourceFilter === "sprint"} label="Sprint" testID="history-source-sprint" onPress={() => onSourceFilterChange("sprint")} />
            <FilterButton active={sourceFilter === "scheduled_review"} label="Review" testID="history-source-review" onPress={() => onSourceFilterChange("scheduled_review")} />
          </HistoryChipRow>
          <HistoryChipRow testID="history-result-filters">
            <FilterButton active={resultFilter === "all"} label="All" testID="history-result-all" onPress={() => onResultFilterChange("all")} />
            <FilterButton active={resultFilter === "correct"} label="Correct" testID="history-result-correct" onPress={() => onResultFilterChange("correct")} />
            <FilterButton active={resultFilter === "wrong"} label="Wrong" testID="history-result-wrong" onPress={() => onResultFilterChange("wrong")} />
            <FilterButton active={resultFilter === "incomplete"} label="Incomplete" testID="history-result-incomplete" onPress={() => onResultFilterChange("incomplete")} />
          </HistoryChipRow>
          <HistoryChipRow testID="history-rating-range-filters">
            {HISTORY_RATING_RANGE_FILTERS.map((ratingRange) => (
              <FilterButton
                key={ratingRange.id}
                active={ratingRangeFilter === ratingRange.id}
                label={ratingRange.label}
                testID={`history-rating-range-${ratingRange.id}`}
                onPress={() => onRatingRangeFilterChange(ratingRange.id)}
              />
            ))}
          </HistoryChipRow>
          <View
            accessibilityLabel="Attention filters, match any"
            style={styles.historyFilterGroup}
            testID="history-attention-flags"
          >
            <AppText style={styles.historyFilterGroupLabel} tone="secondary" variant="footnote">Attention</AppText>
            <HistoryChipRow testID="history-attention-flag-options">
              <FilterButton
                active={attentionReasons.includes("unclear")}
                label="Unclear"
                testID="history-attention-flag-unclear"
                onPress={() => onAttentionReasonChange("unclear")}
              />
              <FilterButton
                active={attentionReasons.includes("in_review")}
                label="In review"
                testID="history-attention-flag-in-review"
                onPress={() => onAttentionReasonChange("in_review")}
              />
              <FilterButton
                active={attentionReasons.includes("incomplete")}
                label="Incomplete"
                testID="history-attention-flag-incomplete"
                onPress={() => onAttentionReasonChange("incomplete")}
              />
            </HistoryChipRow>
          </View>
          <HistoryChipRow testID="history-side-filters">
            <FilterButton active={sideFilter === "all"} label="Both sides" testID="history-side-all" onPress={() => onSideFilterChange("all")} />
            <FilterButton active={sideFilter === "white"} label="White" testID="history-side-white" onPress={() => onSideFilterChange("white")} />
            <FilterButton active={sideFilter === "black"} label="Black" testID="history-side-black" onPress={() => onSideFilterChange("black")} />
          </HistoryChipRow>
          {themeCatalogPresentation ? (
            <HistoryThemeCatalogFilter
              presentation={themeCatalogPresentation}
              selectedThemes={themeFilters}
              onThemeIntent={onThemeFilterIntent}
            />
          ) : availableThemes.length > 0 ? (
            <HistoryChipRow testID="history-theme-filters">
              <FilterButton
                active={themeFilters.includes(ALL_THEMES_FILTER)}
                label="All themes"
                testID="history-theme-all"
                onPress={() => onThemeFilterIntent({ type: "select-all-themes" })}
              />
              {availableThemes.slice(0, 8).map((theme) => (
                <FilterButton
                  key={theme}
                  active={themeFilters.includes(theme)}
                  label={theme}
                  testID={`history-theme-${theme}`}
                  onPress={() => onThemeFilterIntent({ type: "toggle-theme", theme })}
                />
              ))}
            </HistoryChipRow>
          ) : null}
      </CollapsibleRegion>

      <View style={styles.historyTopFilterStack} testID="history-primary-filters">
        <HistoryAttentionFilter
          attentionOnly={attentionOnly}
          onChange={onAttentionOnlyChange}
        />
        {attentionOnly ? (
          <AppText style={styles.historyFootnote} testID="history-attention-explanation" tone="secondary" variant="footnote">
            Needs attention includes Incomplete, Unclear, or In Review Sprint attempts.
          </AppText>
        ) : null}
      </View>

      {selectedRatingKey ? (
        <View style={styles.historyPerformanceCard} testID="history-performance-card">
          <View style={styles.historyPerformanceHeader}>
            <View style={styles.settingsRowCopy}>
              <AppText variant="headline">Rating Trend</AppText>
              <AppText testID="history-performance-context" tone="secondary" variant="footnote">
                {`${historyRatingKeyLabel(selectedRatingKey, selectedRun?.name, selectedRun?.perPuzzleSeconds)} · ${historyRangeLabel(timeRange)}`}
              </AppText>
            </View>
            <View style={styles.historyMetricSummary}>
              <AppText testID="history-chart-value" style={styles.historyAccuracy} variant="numeral">{latestRating ? String(latestRating) : "—"}</AppText>
              <AppText testID="history-chart-label" tone="secondary" variant="caption">Rating</AppText>
            </View>
          </View>
          <HistoryRatingTrendChart points={ratingPoints} />
        </View>
      ) : null}

      <HistoryActiveFilterStrip compact labels={activeFilterLabels} />

      <View style={styles.historyPageRow}>
        <AppText tone="secondary" variant="footnote">
          {page.total === 0 ? "0 results" : `${page.offset + 1}-${Math.min(page.offset + attempts.length, page.total)} of ${page.total}`}
        </AppText>
        <View style={styles.iconButtonRow}>
          <ToolbarIconButton
            accessibilityLabel="Previous history page"
            accessibilityState={{ disabled: page.offset === 0 }}
            disabled={page.offset === 0}
            testID="history-page-previous"
            onPress={() => onPageOffsetChange(Math.max(0, page.offset - page.limit))}
          >
            <Icon color={appTheme.colors.accent.s600} name="chevronLeft" size={17} testID="chevron-left-glyph" weight="semibold" />
          </ToolbarIconButton>
          <ToolbarIconButton
            accessibilityLabel="Next history page"
            accessibilityState={{ disabled: !page.hasMore }}
            disabled={!page.hasMore}
            testID="history-page-next"
            onPress={() => onPageOffsetChange(page.offset + page.limit)}
          >
            <Icon color={appTheme.colors.accent.s600} name="chevronRight" size={17} testID="chevron-right-glyph" weight="semibold" />
          </ToolbarIconButton>
        </View>
      </View>
      {visibleAttempts.length === 0 ? (
        <View style={styles.groupedList}>
          <AppText
            accessibilityLabel="History has no attempts"
            style={styles.groupedEmpty}
            testID="history-empty-state"
            tone="secondary"
            variant="body"
          >
            No attempts
          </AppText>
        </View>
      ) : (
        <View style={styles.groupedList} testID="history-attempts">
          {visibleAttempts.map((attempt, index) => (
            <React.Fragment key={attempt.id}>
              {index > 0 ? <View style={styles.groupedSeparator} /> : null}
              <HistoryAttemptRow
                attempt={attempt}
                nowMs={nowMs}
                onOpen={() => onOpenAttempt(attempt.id)}
              />
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

function HistoryThemeCatalogFilter({
  onThemeIntent,
  presentation,
  selectedThemes
}: {
  onThemeIntent: (intent: ThemeChoiceIntent) => void;
  presentation: ThemeCatalogPresentation;
  selectedThemes: readonly string[];
}): React.JSX.Element {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  const selectedThemeLabels = selectedThemes
    .filter((theme) => theme !== ALL_THEMES_FILTER)
    .map(customThemeLabel);
  const selectedThemeDetail = selectedThemeLabels.length === 0
    ? "All themes"
    : selectedThemeLabels.join(" · ");
  return (
    <View style={styles.historyThemeFilterSection} testID="history-theme-filters">
      <Pressable
        accessibilityLabel={expanded ? "Hide theme filters" : "Show theme filters"}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.historyThemeDisclosure}
        testID="history-theme-disclosure"
        onPress={() => setExpanded((current) => !current)}
      >
        <View style={styles.historyThemeDisclosureCopy}>
          <AppText variant="headline">Themes</AppText>
          <AppText
            accessibilityLabel={`Selected themes: ${selectedThemeDetail}`}
            ellipsizeMode="tail"
            numberOfLines={1}
            testID="history-theme-selection-detail"
            tone="secondary"
            variant="footnote"
          >
            {selectedThemeDetail}
          </AppText>
        </View>
        <DisclosureChevron
          expanded={expanded}
          testID="history-theme-animated-chevron"
        />
      </Pressable>
      <CollapsibleRegion
        contentTestID="history-theme-catalog"
        contentStyle={styles.historyThemeCatalogContent}
        expanded={expanded}
      >
          <View style={styles.historyThemeAllRow}>
            <FilterButton
              active={selectedThemes.includes(ALL_THEMES_FILTER)}
              label="All themes"
              testID="history-theme-all"
              onPress={() => onThemeIntent({ type: "select-all-themes" })}
            />
          </View>
          {presentation.groups.map((group) => (
            <View key={group.label} style={styles.themeCatalogGroup}>
              <Text style={styles.themeCatalogGroupLabel}>{group.label}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.historyChipScroller}
                testID={`history-theme-filter-rail-${safeTestId(group.label)}`}
              >
                <View style={[styles.themeCatalogRailContent, styles.historyChipScrollerContent]}>
                  {group.themes.map((theme) => (
                    <FilterButton
                      key={theme}
                      active={selectedThemes.includes(theme)}
                      label={customThemeLabel(theme)}
                      testID={`history-theme-${safeTestId(customThemeLabel(theme))}`}
                      onPress={() => onThemeIntent({ type: "toggle-theme", theme })}
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          ))}
      </CollapsibleRegion>
    </View>
  );
}

type HistoryActiveFilterInput = {
  attentionReasons: readonly HistoryAttentionReason[];
  ratingKey: string | null;
  runName?: string;
  runPerPuzzleSeconds?: number;
  ratingRangeFilter: HistoryRatingRangeFilter;
  resultFilter: HistoryResultFilter;
  sideFilter: "all" | PuzzleSide;
  sourceFilter: "all" | AttemptSource;
  themeFilters: readonly string[];
  timeRange: HistoryTimeRange;
};

function historyActiveFilterLabels({
  attentionReasons,
  ratingKey,
  runName,
  runPerPuzzleSeconds,
  ratingRangeFilter,
  resultFilter,
  sideFilter,
  sourceFilter,
  themeFilters,
  timeRange
}: HistoryActiveFilterInput): string[] {
  const labels = [
    historyRangeLabel(timeRange),
    ratingKey ? historyRatingKeyLabel(ratingKey, runName, runPerPuzzleSeconds) : "All puzzles"
  ];
  if (sourceFilter !== "all") {
    labels.push(sourceFilter === "scheduled_review" ? "Source: Review" : "Source: Sprint");
  }
  if (resultFilter !== "all") {
    labels.push(
      resultFilter === "correct"
        ? "Result: Correct"
        : resultFilter === "wrong"
          ? "Result: Wrong"
          : "Result: Incomplete"
    );
  }
  if (ratingRangeFilter !== "all") {
    labels.push(HISTORY_RATING_RANGE_FILTERS.find((filter) => filter.id === ratingRangeFilter)?.label ?? ratingRangeFilter);
  }
  if (attentionReasons.length === 1) {
    labels.push(
      attentionReasons[0] === "unclear"
        ? "Attention: Unclear"
        : attentionReasons[0] === "in_review"
          ? "Attention: In review"
          : "Attention: Incomplete"
    );
  }
  if (sideFilter !== "all") {
    labels.push(sideFilter === "white" ? "White" : "Black");
  }
  if (themeFilters.length === 1) {
    labels.push(customThemeLabel(themeFilters[0]!));
  } else if (themeFilters.length > 1) {
    labels.push(`${themeFilters.length} themes selected`);
  }
  return labels;
}

function HistoryActiveFilterStrip({
  compact = false,
  labels
}: {
  compact?: boolean;
  labels: string[];
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View testID="history-active-filter-summary">
      <View style={compact ? styles.historyCompactFilterSummary : styles.historyChipContent}>
        {labels.map((label, index) => (
          <View
            key={`${label}-${index}`}
            style={compact ? styles.historyCompactFilterLabel : styles.historyActiveFilterChip}
            testID={`history-active-filter-${index}`}
          >
            <Text
              style={compact ? styles.historyCompactFilterText : styles.historyActiveFilterText}
              testID={`history-active-filter-label-${label}`}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const HISTORY_RATING_RANGE_FILTERS: ReadonlyArray<{ id: HistoryRatingRangeFilter; label: string }> = [
  { id: "all", label: "All ratings" },
  { id: "under1000", label: "<1000" },
  { id: "1000-1399", label: "1000-1399" },
  { id: "1400-plus", label: "1400+" }
];

function HistoryChipRow({
  children,
  contentStyle,
  testID
}: {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  testID: string;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.historyChipScroller}
      testID={testID}
    >
      <View style={[styles.historyChipContent, styles.historyChipScrollerContent, contentStyle]}>
        {children}
      </View>
    </ScrollView>
  );
}

function HistoryRatingFilters({
  onRatingKeyChange,
  ratingKeys,
  runsByRatingKey,
  selectedRatingKey
}: {
  onRatingKeyChange: (ratingKey: string | null) => void;
  ratingKeys: string[];
  runsByRatingKey: ReadonlyMap<string, { name: string; perPuzzleSeconds: number }>;
  selectedRatingKey: string | null;
}): React.JSX.Element {
  return (
    <HistoryChipRow testID="history-rating-filters">
      <FilterButton
        active={selectedRatingKey === null}
        label="All Puzzles"
        testID="history-rating-all"
        onPress={() => onRatingKeyChange(null)}
      />
      {ratingKeys.map((ratingKey) => (
        <FilterButton
          key={ratingKey}
          active={selectedRatingKey === ratingKey}
          label={historyRatingKeyLabel(
            ratingKey,
            runsByRatingKey.get(ratingKey)?.name,
            runsByRatingKey.get(ratingKey)?.perPuzzleSeconds
          )}
          testID={`history-rating-${ratingKey}`}
          onPress={() => onRatingKeyChange(ratingKey)}
        />
      ))}
    </HistoryChipRow>
  );
}

function HistoryRangeFilters({
  onTimeRangeChange,
  timeRange
}: {
  onTimeRangeChange: (range: HistoryTimeRange) => void;
  timeRange: HistoryTimeRange;
}): React.JSX.Element {
  return (
    <HistoryChipRow testID="history-range-filters">
      {(["7d", "30d", "90d", "1y", "max"] as const).map((range) => (
        <FilterButton
          key={range}
          active={timeRange === range}
          label={historyRangeLabel(range)}
          testID={`history-range-${range}`}
          onPress={() => onTimeRangeChange(range)}
        />
      ))}
    </HistoryChipRow>
  );
}

function HistoryAttentionFilter({
  attentionOnly,
  onChange
}: {
  attentionOnly: boolean;
  onChange: (attentionOnly: boolean) => void;
}): React.JSX.Element {
  return (
    <SegmentedControl
      accessibilityLabel="History view"
      options={HISTORY_ATTENTION_OPTIONS}
      semantics="radio"
      testID="history-attention-filter"
      value={attentionOnly ? "needs-attention" : "all"}
      onChange={(next) => onChange(next === "needs-attention")}
    />
  );
}

const HISTORY_ATTENTION_OPTIONS: readonly SegmentOption<"needs-attention" | "all">[] = [
  {
    accessibilityLabel: "Needs attention: Sprint attempts that are Incomplete, unclear, or in Review",
    label: "Needs attention",
    testID: "history-attention-needs-attention",
    value: "needs-attention"
  },
  { accessibilityLabel: "All attempts", label: "All", testID: "history-attention-all", value: "all" }
];

function HistoryAttemptRow({
  attempt,
  nowMs,
  onOpen
}: {
  attempt: HistoryAttemptView;
  nowMs: number;
  onOpen: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const detail = normalizeHistoryAttemptDetail(attempt);
  const persistedTimingStatus = attempt.timingStatus
    ?? (attempt.result === "timed_out" ? "timed_out" : null);
  const isIncomplete = detail.result === "incomplete";
  const timingStatus = persistedTimingStatus;
  const isTimedOut = !isIncomplete && (timingStatus === "timed_out" || detail.result === "timed_out");
  const isWrong = detail.result === "wrong" && !isTimedOut;
  const isCorrect = detail.result === "correct";
  const isUnclear = isAttemptMarkedUnclear(attempt);
  const dateLabel = detail.completedAt === null
    ? "Date unavailable"
    : formatLocalCalendarDateLabel(detail.completedAt, { now: nowMs });
  const exactDateLabel = detail.completedAt === null ? null : formatLocalCalendarDate(detail.completedAt);
  const accessibleDateLabel = exactDateLabel === null || dateLabel === exactDateLabel
    ? dateLabel
    : `${dateLabel}, ${exactDateLabel}`;
  const visibleThemes = attempt.curatedThemes;
  const pace = historyAttemptSpeedSeconds(attempt);
  const paceLabel = pace === null ? null : `${pace}s pace`;
  const resultLabel = isIncomplete
    ? "Incomplete"
    : isTimedOut ? "Timed out" : isWrong ? "Wrong move" : isCorrect ? "Correct" : "Result unavailable";
  const submittedMoveLabel = isIncomplete
    ? "Sprint ended before completion"
    : isTimedOut
    ? "No move submitted"
    : detail.submittedMove === null || detail.expectedMove === null
    ? "Moves unavailable"
    : isWrong
      ? `Played ${detail.submittedMove} · Best ${detail.expectedMove}`
      : `Move ${detail.submittedMove}`;
  const sourceLabel = historyAttemptSourceLabel(detail.source);
  const themeContext = visibleThemes.map(customThemeLabel).join(", ");
  const compactContext = [themeContext, paceLabel].filter(Boolean).join(" · ");
  const puzzleIdentity = `ID ${attempt.puzzleId} · Rating ${attempt.puzzleRating}`;
  const durationLabel = detail.elapsedSeconds === null ? "Duration unavailable" : `${detail.elapsedSeconds}s`;
  const compactMeta = [sourceLabel, durationLabel, paceLabel, dateLabel].filter(Boolean).join(" · ");
  const accessibleMeta = [sourceLabel, durationLabel, paceLabel, accessibleDateLabel].filter(Boolean).join(" · ");
  const rowAccessibilityLabel = [
    `Replay ${historyAttemptModeLabel(detail.mode)} puzzle`,
    resultLabel,
    submittedMoveLabel,
    isUnclear ? "Marked unclear" : null,
    timingStatus === "slow" ? "Slow" : isTimedOut ? "Timed out" : null,
    puzzleIdentity,
    compactContext,
    accessibleMeta
  ].filter(Boolean).join(", ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rowAccessibilityLabel}
      testID={`history-attempt-${attempt.id}`}
      style={({ pressed }) => [rowStyle, styles.attemptRow, pressed ? styles.settingsRowPressed : null]}
      onPress={onOpen}
    >
      <AttemptStatusTile
        testID={`history-attempt-${attempt.id}-badge`}
        tone={isIncomplete
          ? "incomplete"
          : isTimedOut || isWrong
            ? "wrong"
            : isCorrect ? "correct" : "unknown"}
      />
      <View style={styles.attemptRowCopy}>
        <View style={styles.historyAttemptHeader}>
          <AppText variant="headline">{attempt.runName ?? historyAttemptModeLabel(detail.mode)}</AppText>
          <AppText
            testID={`history-attempt-${attempt.id}-result`}
            tone={isCorrect ? "positive" : isTimedOut || isWrong ? "negative" : "secondary"}
            variant="subheadline"
          >
            {resultLabel}
          </AppText>
        </View>
        <View accessibilityLabel={puzzleIdentity} style={styles.attemptRowIdentity} testID={`history-attempt-${attempt.id}-identity`}>
          <AppText ellipsizeMode="tail" numberOfLines={1} style={styles.attemptRowIdentityId} tone="secondary" variant="footnote">
            {`ID ${attempt.puzzleId}`}
          </AppText>
          <AppText numberOfLines={1} style={styles.attemptRowIdentityRating} tone="secondary" variant="footnote">
            {`\u00A0· Rating ${attempt.puzzleRating}`}
          </AppText>
        </View>
        {visibleThemes.length > 0 ? (
          <HistoryThemeList attemptId={attempt.id} themes={visibleThemes} />
        ) : null}
        <AppText testID={`history-attempt-${attempt.id}-meta`} tone="secondary" variant="footnote">{compactMeta}</AppText>
      </View>
      {isUnclear || timingStatus === "slow" ? (
        <View style={styles.attemptRowTrailingBadges}>
          {isUnclear ? (
            <Badge label="Unclear" testID={`history-attempt-${attempt.id}-unclear`} tone="warning" />
          ) : null}
          {timingStatus === "slow" ? (
            <Badge label="Slow" testID={`history-attempt-${attempt.id}-${timingStatus}`} tone="warning" />
          ) : null}
        </View>
      ) : null}
      <View style={styles.attemptRowChevron} testID={`history-attempt-${attempt.id}-chevron`}>
        <Icon color={appTheme.colors.text.tertiary} name="chevronRight" size={15} testID="chevron-right-glyph" weight="semibold" />
      </View>
    </Pressable>
  );
}

function HistoryThemeList({
  attemptId,
  themes
}: {
  attemptId: string;
  themes: readonly string[];
}): React.JSX.Element {
  return (
    <ThemeTagRail fadeEnd testID={`history-attempt-${attemptId}-themes`} themes={themes} />
  );
}

export function ThemeTagRail({
  centered = false,
  fadeEnd = false,
  testID,
  themes
}: {
  centered?: boolean;
  /** Fades the trailing edge so an overflowing chip does not end in a hard cut. */
  fadeEnd?: boolean;
  testID: string;
  themes: readonly string[];
}): React.JSX.Element {
  const styles = useStyles();
  if (fadeEnd) {
    return (
      <View style={styles.themeTagRailFadeFrame}>
        <ThemeTagRail centered={centered} testID={testID} themes={themes} />
        <View pointerEvents="none" style={styles.themeTagRailFade}>
          {THEME_TAG_RAIL_FADE_STEPS.map((opacity) => (
            <View key={opacity} style={[styles.themeTagRailFadeStep, { opacity }]} />
          ))}
        </View>
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      contentContainerStyle={centered ? styles.themeTagRailCenteredContent : undefined}
      showsHorizontalScrollIndicator={false}
      style={[
        styles.themeTagRailViewport,
        centered ? styles.themeTagRailCenteredViewport : null
      ]}
      testID={testID}
    >
      <View style={[styles.historyThemeRail, centered ? styles.historyThemeRailCentered : null]}>
        {themes.map((theme) => (
          <View key={theme} style={styles.historyThemeChip} testID={`${testID}-${safeTestId(theme)}`}>
            <Text style={styles.historyThemeChipText}>{customThemeLabel(theme)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// Opacities of the surface-colored strips that fade the rail's trailing edge.
const THEME_TAG_RAIL_FADE_STEPS = [0.25, 0.5, 0.75, 1] as const;

function historyAttemptModeLabel(mode: SprintMode | null): string {
  return mode === null ? "Unknown mode" : modeLabel(mode);
}

function historyAttemptSourceLabel(source: AttemptSource | null): string {
  return source === "scheduled_review" ? "Review" : source === "sprint" ? "Sprint" : "Unknown source";
}

function historyRangeLabel(range: HistoryTimeRange): string {
  if (range === "7d") {
    return "7 days";
  }
  if (range === "30d") {
    return "30 days";
  }
  if (range === "90d") {
    return "90 days";
  }
  if (range === "1y") {
    return "1 year";
  }
  return "All Time";
}

const useStyles = makeStyles((theme) => ({
  ...pickPracticeStyles(theme, ["historyHeaderRow", "historyPanel", "historyPanelWide", "historyThemeAllRow", "historyThemeDisclosure", "historyThemeDisclosureCopy", "settingsRowCopy", "settingsRowPressed", "themeCatalogGroupLabel"]),
  historyHeaderActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.inline,
    justifyContent: "flex-end",
    marginLeft: "auto"
  },
  themeCatalogGroup: {
    gap: 6
  },
  themeCatalogRailContent: {
    flexDirection: "row",
    gap: 6,
    paddingRight: 12
  },
  iconButtonRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  destinationTitle: {
    flexShrink: 0
  },
  historyFootnote: {
    paddingHorizontal: 4
  },
  groupedList: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.card,
    overflow: "hidden"
  },
  groupedSeparator: {
    backgroundColor: theme.colors.border.default,
    height: StyleSheet.hairlineWidth
  },
  groupedEmpty: {
    paddingHorizontal: 16,
    paddingVertical: 16
  },
  attemptRow: {
    alignItems: "center",
    paddingVertical: 12
  },
  attemptRowCopy: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  attemptRowIdentity: {
    flexDirection: "row",
    minWidth: 0
  },
  attemptRowIdentityId: {
    flexShrink: 1
  },
  attemptRowIdentityRating: {
    flexShrink: 0
  },
  attemptRowTrailingBadges: {
    alignItems: "flex-end",
    alignSelf: "center",
    flexShrink: 0,
    gap: 4
  },
  attemptRowChevron: {
    alignSelf: "center"
  },
  historyTopFilterStack: {
    gap: theme.spacing.group
  },
  historyAdvancedFilters: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.card,
    gap: theme.spacing.row,
    padding: 16
  },
  historyFilterGroup: {
    gap: 6
  },
  historyFilterGroupLabel: {
    fontWeight: theme.typography.headline.fontWeight
  },
  historyThemeFilterSection: {
    gap: 8
  },
  historyThemeCatalogContent: {
    gap: 8
  },
  historyPerformanceCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.card,
    gap: theme.spacing.row,
    padding: 16
  },
  historyPerformanceHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row,
    justifyContent: "space-between"
  },
  historyMetricSummary: {
    alignItems: "flex-end"
  },
  historyAccuracy: {
    color: theme.colors.text.primary
  },
  // The advanced-filter surface pads its content by 16; scrolling chip rows
  // extend to its edges so chips are not cut off square at the padding.
  historyChipScroller: {
    marginHorizontal: -16
  },
  historyChipScrollerContent: {
    paddingHorizontal: 16
  },
  historyChipContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline,
    paddingVertical: 4
  },
  historyActiveFilterChip: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  historyActiveFilterText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: "800"
  },
  historyCompactFilterSummary: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 4
  },
  historyCompactFilterLabel: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.capsule,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  historyCompactFilterText: {
    ...theme.typography.footnote,
    color: theme.colors.text.secondary
  },
  themeTagRailFadeFrame: {
    minWidth: 0,
    position: "relative"
  },
  themeTagRailFade: {
    bottom: 0,
    flexDirection: "row",
    position: "absolute",
    right: 0,
    top: 0,
    width: 24
  },
  themeTagRailFadeStep: {
    backgroundColor: theme.colors.surface,
    flex: 1
  },
  themeTagRailViewport: {
    flexShrink: 1,
    maxWidth: "100%",
    minWidth: 0
  },
  themeTagRailCenteredViewport: {
    width: "100%"
  },
  themeTagRailCenteredContent: {
    flexGrow: 1,
    justifyContent: "center"
  },
  historyThemeRail: {
    flexDirection: "row",
    gap: 4,
    paddingRight: 10,
    paddingTop: 2
  },
  historyThemeRailCentered: {
    paddingLeft: 10,
    paddingRight: 10
  },
  historyThemeChip: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.capsule,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  historyThemeChipText: {
    ...theme.typography.caption,
    color: theme.colors.text.secondary,
    fontWeight: theme.typography.headline.fontWeight
  },
  historyAttemptHeader: {
    alignItems: "baseline",
    columnGap: 8,
    flexDirection: "row",
    flexWrap: "wrap"
  },
  historyPageRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: 4
  },
}));
