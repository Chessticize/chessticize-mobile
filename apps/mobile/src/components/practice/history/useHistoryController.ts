import { useState } from "react";
import {
  historyQueryForSelection,
  type AttemptSource,
  type HistoryAttentionReason,
  type HistoryFilterSelection,
  type HistoryPageQuery,
  type HistoryQuery,
  type HistoryRatingRangeFilter,
  type HistoryResultFilter,
  type HistoryTimeRange,
  type PuzzleSide,
  type ThemeChoiceIntent
} from "../../../../../../packages/core/src/index.ts";
import { useThemeChoiceSelection } from "../../useThemeChoiceSelection.ts";

const ALL_HISTORY_ATTENTION_REASONS: readonly HistoryAttentionReason[] = [
  "unclear",
  "in_review",
  "incomplete"
];

// History tab state and actions for PracticePocScreen (#685 phase 2): the
// filters, paging, the selected rating key, the filters disclosure and the
// progress screen. The screen keeps the history views, which depend on the
// active tab and the review surface, and builds them with historyQuery.
export function useHistoryController() {
  const [historyTimeRange, setHistoryTimeRange] = useState<HistoryTimeRange>("7d");
  const [historySourceFilter, setHistorySourceFilter] = useState<"all" | AttemptSource>("sprint");
  const historyAttentionReasonOptions = ALL_HISTORY_ATTENTION_REASONS;
  const [historyResultFilter, setHistoryResultFilter] = useState<HistoryResultFilter>("all");
  const [historySideFilter, setHistorySideFilter] = useState<"all" | PuzzleSide>("all");
  const [historyRatingRangeFilter, setHistoryRatingRangeFilter] = useState<HistoryRatingRangeFilter>("all");
  const [historyAttentionReasons, setHistoryAttentionReasons] = useState<HistoryAttentionReason[]>(
    () => [...historyAttentionReasonOptions]
  );
  const [historyPageOffset, setHistoryPageOffset] = useState(0);
  const [historyRatingKey, setHistoryRatingKey] = useState<string | null>(null);

  const [historyProgressOpen, setHistoryProgressOpen] = useState(false);

  const [historyFiltersExpanded, setHistoryFiltersExpanded] = useState(false);

  const historyThemeChoices = useThemeChoiceSelection();

  const historySelection: HistoryFilterSelection = {
    timeRange: historyTimeRange,
    ratingKey: historyRatingKey,
    ratingRange: historyRatingRangeFilter,
    source: historySourceFilter,
    result: historyResultFilter,
    side: historySideFilter,
    themes: historyThemeChoices.namedThemes,
    attentionReasons: historyAttentionReasons
  };

  function historyQuery(now: string, page?: HistoryPageQuery): HistoryQuery {
    return historyQueryForSelection(historySelection, now, page);
  }

  function changeHistoryRatingKey(ratingKey: string | null): void {
    setHistoryRatingKey(ratingKey);
    setHistoryPageOffset(0);
  }

  function changeHistoryTimeRange(range: HistoryTimeRange): void {
    setHistoryTimeRange(range);
    setHistoryPageOffset(0);
  }

  function changeHistorySourceFilter(source: "all" | AttemptSource): void {
    setHistorySourceFilter(source);
    if (source !== "sprint") {
      setHistoryAttentionReasons([]);
    }
    setHistoryPageOffset(0);
  }

  function changeHistoryResultFilter(result: HistoryResultFilter): void {
    setHistoryResultFilter(result);
    setHistoryPageOffset(0);
  }

  function changeHistoryRatingRangeFilter(ratingRange: HistoryRatingRangeFilter): void {
    setHistoryRatingRangeFilter(ratingRange);
    setHistoryPageOffset(0);
  }

  function changeHistorySideFilter(side: "all" | PuzzleSide): void {
    setHistorySideFilter(side);
    setHistoryPageOffset(0);
  }

  function applyHistoryThemeIntent(intent: ThemeChoiceIntent): void {
    historyThemeChoices.dispatch(intent);
    setHistoryPageOffset(0);
  }

  function toggleHistoryAttentionReason(reason: HistoryAttentionReason): void {
    setHistorySourceFilter("sprint");
    setHistoryAttentionReasons((current) => current.includes(reason)
      ? current.filter((candidate) => candidate !== reason)
      : [...current, reason]);
    setHistoryPageOffset(0);
  }

  function changeHistoryAttentionOnly(attentionOnly: boolean): void {
    setHistoryPageOffset(0);
    if (attentionOnly) {
      setHistorySourceFilter("sprint");
    }
    setHistoryAttentionReasons((current) => attentionOnly
      ? current.length > 0
        ? current
        : [...historyAttentionReasonOptions]
      : []);
  }

  function openHistoryProgress(): void {
    setHistoryFiltersExpanded(false);
    setHistoryProgressOpen(true);
  }

  function resetHistoryFilters(): void {
    setHistoryTimeRange("7d");
    setHistorySourceFilter("sprint");
    setHistoryResultFilter("all");
    setHistorySideFilter("all");
    historyThemeChoices.dispatch({ type: "select-all-themes" });
    setHistoryRatingRangeFilter("all");
    setHistoryAttentionReasons([...historyAttentionReasonOptions]);
    setHistoryPageOffset(0);
    setHistoryRatingKey(null);
  }

  return {
    applyHistoryThemeIntent,
    changeHistoryAttentionOnly,
    changeHistoryRatingKey,
    changeHistoryRatingRangeFilter,
    changeHistoryResultFilter,
    changeHistorySideFilter,
    changeHistorySourceFilter,
    changeHistoryTimeRange,
    historyAttentionReasons,
    historyFiltersExpanded,
    historyPageOffset,
    historyProgressOpen,
    historyQuery,
    historyRatingKey,
    historyRatingRangeFilter,
    historyResultFilter,
    historySideFilter,
    historySourceFilter,
    historyThemeChoices,
    historyTimeRange,
    openHistoryProgress,
    resetHistoryFilters,
    setHistoryFiltersExpanded,
    setHistoryPageOffset,
    setHistoryProgressOpen,
    toggleHistoryAttentionReason
  };
}
