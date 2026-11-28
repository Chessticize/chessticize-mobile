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
  historyAttemptSpeedSeconds,
  type HistoryAttemptView,
  type HistoryAttentionReason,
  type HistoryPerformance,
  type HistoryPuzzleOriginFilter,
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
import {
  isUserGamePuzzleOrigin,
  localizeBuiltInRunName,
  modeLabel,
  puzzleOriginLabel,
  safeTestId
} from "../shared/practiceUtils.ts";
import { AttemptStatusTile } from "../shared/AttemptStatusTile.tsx";
import {
  ALL_THEMES_FILTER,
  customThemeLabel,
  themeCatalogGroupLabel,
  type ThemeCatalogPresentation
} from "../shared/themeCatalog.ts";
import { historyRatingKeyLabel, HistoryRatingTrendChart } from "./HistoryRatingChart.tsx";
import { pickPracticeStyles } from "../shared/practiceStyles.tsx";
import {
  formatLocalDateForLocale,
  formatLocalDateLabelForLocale,
  type SupportedLocale,
  translate,
  useTranslation
} from "../../../i18n/index.ts";

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
  puzzleOriginFilter = "all",
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
  onPuzzleOriginFilterChange,
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
  puzzleOriginFilter?: HistoryPuzzleOriginFilter;
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
  onPuzzleOriginFilterChange?: (origin: HistoryPuzzleOriginFilter) => void;
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
  const { locale, t } = useTranslation();
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
    puzzleOriginFilter,
    themeFilters: namedThemeFilters,
    timeRange,
    locale
  });
  return (
    <View style={[styles.historyPanel, adaptiveLayout.usesWideContent ? styles.historyPanelWide : null]} testID="history-panel">
      <View style={styles.historyHeaderRow} testID="history-action-header">
        <AppText accessibilityRole="header" style={styles.destinationTitle} variant="largeTitle">{t("tabs.history")}</AppText>
        <View style={styles.historyHeaderActions}>
          {onOpenProgress ? (
            <HistoryProgressEntryButton onPress={onOpenProgress} />
          ) : null}
          {filtersExpanded ? (
            <Button
              accessibilityLabel={t("history.resetFiltersA11y")}
              label={t("history.resetFilters")}
              size="compact"
              testID="history-filter-reset"
              variant="plain"
              onPress={onResetFilters}
            />
          ) : null}
          <ToolbarIconButton
            accessibilityLabel={filtersExpanded ? t("history.hideFiltersA11y") : t("history.showFiltersA11y")}
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
            <FilterButton active={sourceFilter === "all"} label={t("history.source.all")} testID="history-source-all" onPress={() => onSourceFilterChange("all")} />
            <FilterButton active={sourceFilter === "sprint"} label={t("history.source.sprint")} testID="history-source-sprint" onPress={() => onSourceFilterChange("sprint")} />
            <FilterButton active={sourceFilter === "scheduled_review"} label={t("history.source.review")} testID="history-source-review" onPress={() => onSourceFilterChange("scheduled_review")} />
          </HistoryChipRow>
          {onPuzzleOriginFilterChange ? (
            <HistoryChipRow testID="history-origin-filters">
              <FilterButton active={puzzleOriginFilter === "all"} label={t("history.origin.all")} testID="history-origin-all" onPress={() => onPuzzleOriginFilterChange("all")} />
              <FilterButton active={puzzleOriginFilter === "pack"} label={t("common.originPuzzlePack")} testID="history-origin-pack" onPress={() => onPuzzleOriginFilterChange("pack")} />
              <FilterButton active={puzzleOriginFilter === "user_game"} label={t("common.originGames")} testID="history-origin-user-game" onPress={() => onPuzzleOriginFilterChange("user_game")} />
            </HistoryChipRow>
          ) : null}
          <HistoryChipRow testID="history-result-filters">
            <FilterButton active={resultFilter === "all"} label={t("history.result.all")} testID="history-result-all" onPress={() => onResultFilterChange("all")} />
            <FilterButton active={resultFilter === "correct"} label={t("history.result.correct")} testID="history-result-correct" onPress={() => onResultFilterChange("correct")} />
            <FilterButton active={resultFilter === "wrong"} label={t("history.result.wrong")} testID="history-result-wrong" onPress={() => onResultFilterChange("wrong")} />
            <FilterButton active={resultFilter === "incomplete"} label={t("history.result.incomplete")} testID="history-result-incomplete" onPress={() => onResultFilterChange("incomplete")} />
          </HistoryChipRow>
          <HistoryChipRow testID="history-rating-range-filters">
            {HISTORY_RATING_RANGE_IDS.map((ratingRangeId) => (
              <FilterButton
                key={ratingRangeId}
                active={ratingRangeFilter === ratingRangeId}
                label={historyRatingRangeLabel(ratingRangeId, locale)}
                testID={`history-rating-range-${ratingRangeId}`}
                onPress={() => onRatingRangeFilterChange(ratingRangeId)}
              />
            ))}
          </HistoryChipRow>
          <View
            accessibilityLabel={t("history.attention.groupA11y")}
            style={styles.historyFilterGroup}
            testID="history-attention-flags"
          >
            <AppText style={styles.historyFilterGroupLabel} tone="secondary" variant="footnote">{t("history.attention.label")}</AppText>
            <HistoryChipRow testID="history-attention-flag-options">
              <FilterButton
                active={attentionReasons.includes("unclear")}
                label={t("history.attention.unclear")}
                testID="history-attention-flag-unclear"
                onPress={() => onAttentionReasonChange("unclear")}
              />
              <FilterButton
                active={attentionReasons.includes("in_review")}
                label={t("history.attention.inReview")}
                testID="history-attention-flag-in-review"
                onPress={() => onAttentionReasonChange("in_review")}
              />
              <FilterButton
                active={attentionReasons.includes("incomplete")}
                label={t("history.attention.incomplete")}
                testID="history-attention-flag-incomplete"
                onPress={() => onAttentionReasonChange("incomplete")}
              />
            </HistoryChipRow>
          </View>
          <HistoryChipRow testID="history-side-filters">
            <FilterButton active={sideFilter === "all"} label={t("history.side.both")} testID="history-side-all" onPress={() => onSideFilterChange("all")} />
            <FilterButton active={sideFilter === "white"} label={t("common.white")} testID="history-side-white" onPress={() => onSideFilterChange("white")} />
            <FilterButton active={sideFilter === "black"} label={t("common.black")} testID="history-side-black" onPress={() => onSideFilterChange("black")} />
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
                label={t("customSetup.allThemes")}
                testID="history-theme-all"
                onPress={() => onThemeFilterIntent({ type: "select-all-themes" })}
              />
              {availableThemes.slice(0, 8).map((theme) => (
                <FilterButton
                  key={theme}
                  active={themeFilters.includes(theme)}
                  label={customThemeLabel(theme, locale)}
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
            {t("history.attention.explanation")}
          </AppText>
        ) : null}
      </View>

      {selectedRatingKey ? (
        <View style={styles.historyPerformanceCard} testID="history-performance-card">
          <View style={styles.historyPerformanceHeader}>
            <View style={styles.settingsRowCopy}>
              <AppText variant="headline">{t("history.chart.title")}</AppText>
              <AppText testID="history-performance-context" tone="secondary" variant="footnote">
                {`${historyRatingKeyLabel(selectedRatingKey, selectedRun?.name, selectedRun?.perPuzzleSeconds, locale)} · ${historyRangeLabel(timeRange, locale)}`}
              </AppText>
            </View>
            <View style={styles.historyMetricSummary}>
              <AppText testID="history-chart-value" style={styles.historyAccuracy} variant="numeral">{latestRating ? String(latestRating) : "—"}</AppText>
              <AppText testID="history-chart-label" tone="secondary" variant="caption">{t("common.rating")}</AppText>
            </View>
          </View>
          <HistoryRatingTrendChart points={ratingPoints} />
        </View>
      ) : null}

      <HistoryActiveFilterStrip compact labels={activeFilterLabels} />

      <View style={styles.historyPageRow}>
        <AppText tone="secondary" variant="footnote">
          {page.total === 0
            ? t("history.page.zeroResults")
            : t("history.page.range", {
                from: page.offset + 1,
                to: Math.min(page.offset + attempts.length, page.total),
                total: page.total
              })}
        </AppText>
        <View style={styles.iconButtonRow}>
          <ToolbarIconButton
            accessibilityLabel={t("history.page.prevA11y")}
            accessibilityState={{ disabled: page.offset === 0 }}
            disabled={page.offset === 0}
            testID="history-page-previous"
            onPress={() => onPageOffsetChange(Math.max(0, page.offset - page.limit))}
          >
            <Icon color={appTheme.colors.accent.s600} name="chevronLeft" size={17} testID="chevron-left-glyph" weight="semibold" />
          </ToolbarIconButton>
          <ToolbarIconButton
            accessibilityLabel={t("history.page.nextA11y")}
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
            accessibilityLabel={t("history.emptyA11y")}
            style={styles.groupedEmpty}
            testID="history-empty-state"
            tone="secondary"
            variant="body"
          >
            {t("history.emptyTitle")}
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
  const { locale, t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const selectedThemeLabels = selectedThemes
    .filter((theme) => theme !== ALL_THEMES_FILTER)
    .map((theme) => customThemeLabel(theme, locale));
  const selectedThemeDetail = selectedThemeLabels.length === 0
    ? t("customSetup.allThemes")
    : selectedThemeLabels.join(" · ");
  return (
    <View style={styles.historyThemeFilterSection} testID="history-theme-filters">
      <Pressable
        accessibilityLabel={expanded ? t("history.themes.hideA11y") : t("history.themes.showA11y")}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.historyThemeDisclosure}
        testID="history-theme-disclosure"
        onPress={() => setExpanded((current) => !current)}
      >
        <View style={styles.historyThemeDisclosureCopy}>
          <AppText variant="headline">{t("common.themes")}</AppText>
          <AppText
            accessibilityLabel={t("customSetup.selectedThemesA11y", { themes: selectedThemeDetail })}
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
              label={t("customSetup.allThemes")}
              testID="history-theme-all"
              onPress={() => onThemeIntent({ type: "select-all-themes" })}
            />
          </View>
          {presentation.groups.map((group) => {
            const canonicalGroupLabel = themeCatalogGroupLabel(group, "en");
            return (
              <View key={group.id ?? group.label} style={styles.themeCatalogGroup}>
                <Text style={styles.themeCatalogGroupLabel}>{themeCatalogGroupLabel(group, locale)}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.historyChipScroller}
                  testID={`history-theme-filter-rail-${safeTestId(canonicalGroupLabel)}`}
                >
                  <View style={[styles.themeCatalogRailContent, styles.historyChipScrollerContent]}>
                    {group.themes.map((theme) => (
                      <FilterButton
                        key={theme}
                        active={selectedThemes.includes(theme)}
                        label={customThemeLabel(theme, locale)}
                        testID={`history-theme-${safeTestId(customThemeLabel(theme, "en"))}`}
                        onPress={() => onThemeIntent({ type: "toggle-theme", theme })}
                      />
                    ))}
                  </View>
                </ScrollView>
              </View>
            );
          })}
      </CollapsibleRegion>
    </View>
  );
}

type HistoryActiveFilterInput = {
  attentionReasons: readonly HistoryAttentionReason[];
  locale: SupportedLocale;
  ratingKey: string | null;
  runName?: string;
  runPerPuzzleSeconds?: number;
  ratingRangeFilter: HistoryRatingRangeFilter;
  resultFilter: HistoryResultFilter;
  sideFilter: "all" | PuzzleSide;
  sourceFilter: "all" | AttemptSource;
  puzzleOriginFilter?: HistoryPuzzleOriginFilter;
  themeFilters: readonly string[];
  timeRange: HistoryTimeRange;
};

function historyActiveFilterLabels({
  attentionReasons,
  locale,
  ratingKey,
  runName,
  runPerPuzzleSeconds,
  ratingRangeFilter,
  resultFilter,
  sideFilter,
  sourceFilter,
  puzzleOriginFilter = "all",
  themeFilters,
  timeRange
}: HistoryActiveFilterInput): string[] {
  const labels = [
    historyRangeLabel(timeRange, locale),
    ratingKey
      ? historyRatingKeyLabel(ratingKey, runName, runPerPuzzleSeconds, locale)
      : translate(locale, "history.themes.allPuzzlesLower")
  ];
  if (sourceFilter !== "all") {
    labels.push(
      sourceFilter === "scheduled_review"
        ? translate(locale, "history.activeFilter.sourceReview")
        : translate(locale, "history.activeFilter.sourceSprint")
    );
  }
  if (puzzleOriginFilter !== "all") {
    labels.push(
      puzzleOriginFilter === "user_game"
        ? translate(locale, "history.activeFilter.originGames")
        : translate(locale, "history.activeFilter.originPuzzlePack")
    );
  }
  if (resultFilter !== "all") {
    labels.push(
      resultFilter === "correct"
        ? translate(locale, "history.activeFilter.resultCorrect")
        : resultFilter === "wrong"
          ? translate(locale, "history.activeFilter.resultWrong")
          : translate(locale, "history.activeFilter.resultIncomplete")
    );
  }
  if (ratingRangeFilter !== "all") {
    labels.push(historyRatingRangeLabel(ratingRangeFilter, locale));
  }
  if (attentionReasons.length === 1) {
    labels.push(
      attentionReasons[0] === "unclear"
        ? translate(locale, "history.activeFilter.attentionUnclear")
        : attentionReasons[0] === "in_review"
          ? translate(locale, "history.activeFilter.attentionInReview")
          : translate(locale, "history.activeFilter.attentionIncomplete")
    );
  }
  if (sideFilter !== "all") {
    labels.push(sideFilter === "white" ? translate(locale, "common.white") : translate(locale, "common.black"));
  }
  if (themeFilters.length === 1) {
    labels.push(customThemeLabel(themeFilters[0]!, locale));
  } else if (themeFilters.length > 1) {
    labels.push(translate(locale, "history.activeFilter.themesSelected", { count: themeFilters.length }));
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

const HISTORY_RATING_RANGE_IDS: readonly HistoryRatingRangeFilter[] = [
  "all",
  "under1000",
  "1000-1399",
  "1400-plus"
];

function historyRatingRangeLabel(
  id: HistoryRatingRangeFilter,
  locale: SupportedLocale
): string {
  if (id === "all") {
    return translate(locale, "history.ratingRange.all");
  }
  if (id === "under1000") {
    return "<1000";
  }
  if (id === "1000-1399") {
    return "1000-1399";
  }
  return "1400+";
}

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
  const { locale, t } = useTranslation();
  return (
    <HistoryChipRow testID="history-rating-filters">
      <FilterButton
        active={selectedRatingKey === null}
        label={t("history.themes.allPuzzlesTitle")}
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
            runsByRatingKey.get(ratingKey)?.perPuzzleSeconds,
            locale
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
  const { locale } = useTranslation();
  return (
    <HistoryChipRow testID="history-range-filters">
      {(["7d", "30d", "90d", "1y", "max"] as const).map((range) => (
        <FilterButton
          key={range}
          active={timeRange === range}
          label={historyRangeLabel(range, locale)}
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
  const { t } = useTranslation();
  const options: readonly SegmentOption<"needs-attention" | "all">[] = [
    {
      accessibilityLabel: t("history.attention.needsAttentionA11y"),
      label: t("history.attention.needsAttention"),
      testID: "history-attention-needs-attention",
      value: "needs-attention"
    },
    {
      accessibilityLabel: t("history.attention.allA11y"),
      label: t("common.all"),
      testID: "history-attention-all",
      value: "all"
    }
  ];
  return (
    <SegmentedControl
      accessibilityLabel={t("history.attention.viewA11y")}
      options={options}
      semantics="radio"
      testID="history-attention-filter"
      value={attentionOnly ? "needs-attention" : "all"}
      onChange={(next) => onChange(next === "needs-attention")}
    />
  );
}

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
  const { locale, t } = useTranslation();
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
    ? t("history.attempt.dateUnavailable")
    : formatLocalDateLabelForLocale(detail.completedAt, nowMs, locale);
  const exactDateLabel = detail.completedAt === null
    ? null
    : formatLocalDateForLocale(detail.completedAt, locale);
  const accessibleDateLabel = exactDateLabel === null || dateLabel === exactDateLabel
    ? dateLabel
    : `${dateLabel}, ${exactDateLabel}`;
  const visibleThemes = attempt.curatedThemes;
  const pace = historyAttemptSpeedSeconds(attempt);
  const paceLabel = pace === null ? null : t("review.paceLabel", { seconds: pace });
  const resultLabel = isIncomplete
    ? t("history.result.incomplete")
    : isTimedOut
      ? t("session.timedOut")
      : isWrong
        ? t("session.announcement.wrong")
        : isCorrect
          ? t("common.correct")
          : t("history.attempt.resultUnavailable");
  const submittedMoveLabel = isIncomplete
    ? t("history.attempt.incompleteDetail")
    : isTimedOut
      ? t("history.attempt.noMoveSubmitted")
      : detail.submittedMove === null || detail.expectedMove === null
        ? t("history.attempt.movesUnavailable")
        : isWrong
          ? t("history.attempt.playedVsBest", { played: detail.submittedMove, best: detail.expectedMove })
          : t("history.attempt.movePlayed", { move: detail.submittedMove });
  const originLabel = puzzleOriginLabel(
    isUserGamePuzzleOrigin(attempt.puzzleId, attempt.ratingKey),
    locale
  );
  const sourceLabel = historyAttemptSourceLabel(detail.source, locale);
  const themeContext = visibleThemes.map((theme) => customThemeLabel(theme, locale)).join(", ");
  const compactContext = [themeContext, paceLabel].filter(Boolean).join(" · ");
  const puzzleIdentity = t("history.attempt.idAndRating", {
    id: attempt.puzzleId,
    rating: attempt.puzzleRating
  });
  const durationLabel = detail.elapsedSeconds === null
    ? t("history.attempt.durationUnavailable")
    : t("common.secondsCompact", { count: detail.elapsedSeconds });
  const compactMeta = [originLabel, sourceLabel, durationLabel, paceLabel, dateLabel].filter(Boolean).join(" · ");
  const accessibleMeta = [originLabel, sourceLabel, durationLabel, paceLabel, accessibleDateLabel].filter(Boolean).join(" · ");
  const rowAccessibilityLabel = [
    t("history.attempt.replayA11y", { mode: historyAttemptModeLabel(detail.mode, locale) }),
    resultLabel,
    submittedMoveLabel,
    isUnclear ? t("history.attempt.markedUnclear") : null,
    timingStatus === "slow" ? t("history.attempt.badgeSlow") : isTimedOut ? t("session.timedOut") : null,
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
          <AppText variant="headline">
            {localizeBuiltInRunName(attempt.runName, locale) ?? historyAttemptModeLabel(detail.mode, locale)}
          </AppText>
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
            {t("history.attempt.idLabel", { id: attempt.puzzleId })}
          </AppText>
          <AppText numberOfLines={1} style={styles.attemptRowIdentityRating} tone="secondary" variant="footnote">
            {t("history.attempt.ratingSuffix", { rating: attempt.puzzleRating })}
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
            <Badge label={t("history.attempt.badgeUnclear")} testID={`history-attempt-${attempt.id}-unclear`} tone="warning" />
          ) : null}
          {timingStatus === "slow" ? (
            <Badge label={t("history.attempt.badgeSlow")} testID={`history-attempt-${attempt.id}-${timingStatus}`} tone="warning" />
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
  const { locale } = useTranslation();
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
            <Text style={styles.historyThemeChipText}>{customThemeLabel(theme, locale)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// Opacities of the surface-colored strips that fade the rail's trailing edge.
const THEME_TAG_RAIL_FADE_STEPS = [0.25, 0.5, 0.75, 1] as const;

function historyAttemptModeLabel(mode: SprintMode | null, locale: SupportedLocale): string {
  return mode === null ? translate(locale, "history.unknownMode") : modeLabel(mode, locale);
}

function historyAttemptSourceLabel(source: AttemptSource | null, locale: SupportedLocale): string {
  if (source === "scheduled_review") {
    return translate(locale, "history.source.review");
  }
  if (source === "sprint") {
    return translate(locale, "history.source.sprint");
  }
  return translate(locale, "history.unknownSource");
}

function historyRangeLabel(range: HistoryTimeRange, locale: SupportedLocale): string {
  if (range === "7d") {
    return translate(locale, "history.range.7d");
  }
  if (range === "30d") {
    return translate(locale, "history.range.30d");
  }
  if (range === "90d") {
    return translate(locale, "history.range.90d");
  }
  if (range === "1y") {
    return translate(locale, "history.range.1y");
  }
  return translate(locale, "history.range.max");
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
    flexWrap: "wrap",
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
