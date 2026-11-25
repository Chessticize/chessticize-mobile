import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { GestureType } from "react-native-gesture-handler";
import {
  type AttemptEvent,
  isReviewOverdue,
  reviewQueueForecast,
  type ReviewQueueItem,
  type ReviewQueueState,
  type SessionReplayItem
} from "../../../../../../packages/core/src/index.ts";
import {
  formatLocalDateForLocale,
  formatReviewDayForLocale,
  getActiveLocale,
  type SupportedLocale,
  translate,
  useTranslation
} from "../../../i18n/index.ts";
import { modeLabel, safeTestId } from "../shared/practiceUtils.ts";
import { pickPracticeStyles } from "../shared/practiceStyles.tsx";
import {
  type CompletedReviewItem,
  filterReviewTodayPresentation,
  type ReviewTodayDueItemPresentation,
  type ReviewTodayFilter,
  type ReviewTodayHistoryPresentation
} from "../../../../../../packages/storage/src/review-today.ts";
import { type AdaptiveLayout, PRACTICE_UI_PADDING as UI_PADDING } from "../../adaptivePracticeLayout.ts";
import type { MoveFeedbackClient } from "../../../platform/moveFeedback.ts";
import type { ReviewQueueDuePromotionResult } from "../../../../../../packages/storage/src/practice-store.ts";
import type { ReviewEntry } from "../../../backend/reviewEntry.ts";
import type { ReviewReminderScheduleResult } from "../../../platform/reviewReminderScheduler.ts";
import type { PracticeService } from "../../../../../../packages/storage/src/practice-service.ts";
import type { MobileStockfishCapabilities } from "../../../platform/mobilePlatformCapabilities.ts";
import { FilterButton } from "../shared/FilterButton.tsx";
import { CollapsibleRegion, DisclosureChevron } from "../shared/CollapsibleRegion.tsx";
import { AppText, Button, Icon, IconTile, useListRowStyle } from "../../ui/index.tsx";
import { ToolbarIconButton } from "../shared/ToolbarIconButton.tsx";
import { FilterGlyph } from "../shared/Glyphs.tsx";
import { makeStyles, useTheme } from "../../../theme/index.ts";
import { AttemptStatusTile } from "../shared/AttemptStatusTile.tsx";
import {
  buildServiceReviewEntry,
  type DeferBackRelevantTransition,
  type ReviewBackCommand,
  ReviewSession,
  withAttemptClarity
} from "./ReviewSession.tsx";

function reviewItemSpeedSeconds(
  review: Pick<ReviewQueueState, "ratingKey">
): number | null {
  const match = review.ratingKey.match(/\/(\d+)\b/);
  return match ? Number(match[1]) : null;
}

function reviewItemSourceSprintLabel(
  review: Pick<ReviewQueueState, "mode" | "ratingKey">,
  locale: SupportedLocale
): string {
  const speed = reviewItemSpeedSeconds(review);
  const speedSuffix = speed === null
    ? ""
    : translate(locale, "review.paceSuffix", { seconds: speed });
  return translate(locale, "review.sourceSprint", {
    mode: modeLabel(review.mode, locale),
    speedSuffix
  });
}

function reviewItemCompactSourceLabel(
  review: Pick<ReviewQueueState, "mode" | "ratingKey">,
  locale: SupportedLocale
): string {
  const speed = reviewItemSpeedSeconds(review);
  const speedSuffix = speed === null
    ? ""
    : translate(locale, "review.paceSuffix", { seconds: speed });
  return `${modeLabel(review.mode, locale)}${speedSuffix}`;
}

function reviewQueueFilterLabel(
  filter: ReviewTodayFilter,
  locale: SupportedLocale
): string {
  if (filter === "all") {
    return translate(locale, "review.filterAll");
  }
  if (filter === "overdue") {
    return translate(locale, "review.filterOverdue");
  }
  if (filter === "missed_twice") {
    return translate(locale, "review.filterMissedTwice");
  }
  return translate(locale, "common.arrowDuel");
}

const REVIEW_TODAY_FILTERS: readonly ReviewTodayFilter[] = [
  "all",
  "overdue",
  "missed_twice",
  "arrow_duel"
];

function reviewQueueSummary(
  queue: ReviewQueueState[],
  filteredItems: ReviewQueueItem[],
  nowMs: number,
  locale: SupportedLocale
): {
  dueStatusLabel: string;
  filteredCount: number;
  oldestDueLabel: string;
  oldestDueSubline: string;
  overdueCount: number;
  tomorrowCount: number;
  nextSevenDaysCount: number;
  totalCount: number;
} {
  const forecast = reviewQueueForecast(queue, nowMs);
  const filteredOverdueCount = filteredItems.filter((item) => isReviewOverdue(item.review, nowMs)).length;
  const oldestDay = forecast.totalCount > 0 && forecast.todayCount > 0
    ? formatReviewDayForLocale(queue.map((review) => review.dueDay).sort()[0]!, locale)
    : null;
  const nextDay = forecast.totalCount > 0 && forecast.todayCount === 0
    ? formatReviewDayForLocale(forecast.nextDueDay!, locale)
    : null;
  return {
    dueStatusLabel: filteredItems.length === 0
      ? translate(locale, "review.dueStatusEmpty")
      : filteredOverdueCount > 0
        ? translate(locale, "review.dueStatusOverdue")
        : translate(locale, "review.dueStatusReady"),
    filteredCount: filteredItems.length,
    oldestDueLabel: oldestDay !== null
      ? translate(locale, "review.oldestDueDate", { day: oldestDay })
      : nextDay !== null
        ? translate(locale, "review.nextReviewDueDate", { day: nextDay })
        : translate(locale, "review.oldestDueNone"),
    oldestDueSubline: oldestDay !== null
      ? translate(locale, "review.sublineOldest", { day: oldestDay })
      : nextDay !== null
        ? translate(locale, "review.sublineNext", { day: nextDay })
        : translate(locale, "review.sublineNextFallback"),
    overdueCount: forecast.overdueCount,
    tomorrowCount: forecast.tomorrowCount,
    nextSevenDaysCount: forecast.nextSevenDaysCount,
    totalCount: forecast.totalCount
  };
}

function reviewQuickFilterTestID(filter: ReviewTodayFilter): string {
  if (filter === "missed_twice") {
    return "review-filter-repeat-misses";
  }
  if (filter === "arrow_duel") {
    return "review-filter-arrow-duel";
  }
  return `review-filter-${filter}`;
}

export function ReviewPanel({
  adaptiveLayout,
  boardBlocksExternalGesture,
  boardSize,
  currentTimeMs,
  deferBackRelevantTransition,
  dueReviewItems,
  explicitReplySideCopy,
  opponentReplySettingsHint,
  filtersExpanded,
  moveFeedbackClient,
  nowMs,
  onAnalysisActiveChange,
  onBoardTouchActiveChange,
  onExitSessionReview,
  onFiltersExpandedChange,
  onPromoteNextFutureReviewsToDue,
  onReviewRecorded,
  onReviewScheduleChanged,
  onSessionAttemptClearUnclear,
  onSessionSourceChange,
  onScheduleTestReviewReminder,
  reviewQueue,
  reviewReminderScheduleStatus,
  service,
  sessionReplayItems,
  stockfish,
  systemBackCommand
}: {
  adaptiveLayout: AdaptiveLayout;
  boardBlocksExternalGesture: React.RefObject<GestureType | undefined>;
  boardSize: number;
  currentTimeMs: () => number;
  deferBackRelevantTransition: DeferBackRelevantTransition;
  dueReviewItems: ReviewQueueItem[];
  explicitReplySideCopy?: boolean;
  opponentReplySettingsHint?: string;
  filtersExpanded: boolean;
  moveFeedbackClient: MoveFeedbackClient | null;
  nowMs: number;
  onAnalysisActiveChange?: (active: boolean) => void;
  onBoardTouchActiveChange?: (active: boolean) => void;
  onExitSessionReview: () => void;
  onFiltersExpandedChange: (expanded: boolean) => void;
  onPromoteNextFutureReviewsToDue?: () => ReviewQueueDuePromotionResult;
  onReviewRecorded: (completedAt: string) => void;
  onReviewScheduleChanged: (clearedAttemptId?: string) => void;
  onSessionAttemptClearUnclear?: (attemptId: string) => AttemptEvent | null;
  onSessionSourceChange?: (source: ReviewEntry["source"] | null) => void;
  onScheduleTestReviewReminder?: () => Promise<ReviewReminderScheduleResult>;
  reviewQueue: ReviewQueueState[];
  reviewReminderScheduleStatus?: string;
  service: PracticeService;
  sessionReplayItems: SessionReplayItem[];
  stockfish: MobileStockfishCapabilities;
  systemBackCommand: ReviewBackCommand | null;
}): React.JSX.Element {
  const styles = useStyles();
  const { locale, t } = useTranslation();
  const sessionEntries = sessionReplayItems.map((item): ReviewEntry => buildServiceReviewEntry(service, {
    puzzle: item.puzzle,
    mode: item.attempt.mode,
    ratingKey: item.attempt.ratingKey,
    source: "session",
    attempt: item.attempt
  }));
  const preferredEntries = sessionEntries.length > 0
    ? sessionEntries
    : [];
  const preferredEntriesKey = preferredEntries.map((entry) => (
    `${entry.source}:${entry.puzzle.id}:${entry.mode}:${entry.ratingKey}:${entry.opponentReply?.enabled ?? "none"}:${entry.opponentReply?.seconds ?? "none"}`
  )).join("|");
  const [activeEntries, setActiveEntries] = useState<ReviewEntry[]>(preferredEntries);
  const [activeEntryInitialIndex, setActiveEntryInitialIndex] = useState(0);
  const activeReviewGenerationRef = useRef(0);
  const appliedPreferredEntriesKeyRef = useRef(preferredEntriesKey);
  const [queueFilter, setQueueFilter] = useState<ReviewTodayFilter>("all");
  const [todayReviewsExpanded, setTodayReviewsExpanded] = useState(false);
  const [completedReviewsExpanded, setCompletedReviewsExpanded] = useState(true);
  const [devStatus, setDevStatus] = useState<string | null>(null);
  const reviewToday = useMemo(() => {
    // The service owns mutable local storage; these snapshots invalidate its derived presentation.
    void dueReviewItems;
    void reviewQueue;
    return service.getReviewTodayPresentation(new Date(nowMs).toISOString());
  }, [dueReviewItems, nowMs, reviewQueue, service]);
  const filteredReviewToday = filterReviewTodayPresentation(reviewToday, queueFilter);
  const completedReviews = reviewToday.completedItems.map((entry) => entry.item);
  const completedReviewEntries = completedReviews.map((item): ReviewEntry => buildServiceReviewEntry(service, {
    puzzle: item.puzzle,
    mode: item.attempt.mode,
    ratingKey: item.attempt.ratingKey,
    source: "history",
    attempt: item.attempt
  }));
  const dailyReviewTotal = completedReviews.length + reviewToday.dueItems.length;
  const dailyReviewProgressLabel = dailyReviewTotal === 0
    ? "0"
    : `${completedReviews.length} / ${dailyReviewTotal}`;
  const filteredDueReviewItems = filteredReviewToday.dueItems.map((entry) => entry.item);
  const filteredCompletedReviews = filteredReviewToday.completedItems.map((entry) => entry.item);
  const filteredDueEntries = filteredDueReviewItems.map((item): ReviewEntry => buildServiceReviewEntry(service, {
    puzzle: item.puzzle,
    mode: item.review.mode,
    ratingKey: item.review.ratingKey,
    source: "due"
  }));
  const queueSummary = reviewQueueSummary(reviewQueue, filteredDueReviewItems, nowMs, locale);
  const selectedReviewFilterLabel = reviewQueueFilterLabel(queueFilter, locale);
  const reviewDueSummaryLabel = filteredDueEntries.length > 0
    ? queueSummary.dueStatusLabel
    : reviewToday.dueItems.length === 0
      ? t("review.doneForToday")
      : t("review.dueStatusEmpty");
  const reviewDueFilterLabel = filteredDueEntries.length > 0
    ? `${selectedReviewFilterLabel} · ${queueSummary.dueStatusLabel}`
    : t("review.dueStatusEmpty");
  const reviewDueSubline = queueSummary.oldestDueSubline;
  const reviewFilterControlActive = filtersExpanded || queueFilter !== "all";
  // Three side-by-side counts break their labels mid-word at large text sizes.
  const forecastStacked = useWindowDimensions().fontScale >= REVIEW_FORECAST_STACK_FONT_SCALE;

  useEffect(() => {
    if (appliedPreferredEntriesKeyRef.current === preferredEntriesKey) {
      return;
    }
    appliedPreferredEntriesKeyRef.current = preferredEntriesKey;
    activeReviewGenerationRef.current += 1;
    setActiveEntryInitialIndex(0);
    setActiveEntries(preferredEntries);
    // preferredEntriesKey is the stable semantic identity for this derived array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredEntriesKey]);

  useEffect(() => {
    onSessionSourceChange?.(activeEntries[0]?.source ?? null);
  }, [activeEntries, onSessionSourceChange]);

  useEffect(() => {
    return () => {
      onSessionSourceChange?.(null);
    };
  }, [onSessionSourceChange]);

  function startReviewEntries(entries: ReviewEntry[]): void {
    activeReviewGenerationRef.current += 1;
    setActiveEntryInitialIndex(0);
    setActiveEntries(entries);
  }

  function openCompletedReview(attemptId: string): void {
    const nextIndex = completedReviewEntries.findIndex((entry) => entry.attempt?.id === attemptId);
    if (nextIndex < 0) {
      return;
    }
    activeReviewGenerationRef.current += 1;
    setActiveEntryInitialIndex(nextIndex);
    setActiveEntries(completedReviewEntries);
  }

  function clearActiveReview(): void {
    setActiveEntryInitialIndex(0);
    setActiveEntries([]);
    onSessionSourceChange?.(null);
  }

  function finishActiveReview(source: ReviewEntry["source"], generation: number): void {
    if (generation !== activeReviewGenerationRef.current) {
      return;
    }
    activeReviewGenerationRef.current += 1;
    clearActiveReview();
    if (source === "session") {
      onExitSessionReview();
    }
  }

  function returnActiveReviewToOwner(source: ReviewEntry["source"]): void {
    activeReviewGenerationRef.current += 1;
    clearActiveReview();
    if (source === "session") {
      onExitSessionReview();
    }
  }

  function clearSessionAttemptUnclear(attemptId: string): void {
    const updatedAttempt = onSessionAttemptClearUnclear?.(attemptId);
    if (!updatedAttempt) {
      return;
    }
    setActiveEntries((entries) => entries.map((entry) => (
      entry.source === "session" && entry.attempt?.id === attemptId
        ? {
            ...entry,
            attempt: withAttemptClarity(entry.attempt, updatedAttempt)
          }
        : entry
    )));
  }

  if (activeEntries.length > 0) {
    const activeReviewGeneration = activeReviewGenerationRef.current;
    return (
      <ReviewSession
        key={`${activeReviewGeneration}:${activeEntryInitialIndex}:${activeEntries.map((entry) => `${entry.source}:${entry.puzzle.id}:${entry.mode}:${entry.ratingKey}`).join("|")}`}
        adaptiveLayout={adaptiveLayout}
        boardBlocksExternalGesture={boardBlocksExternalGesture}
        boardSize={boardSize}
        currentTimeMs={currentTimeMs}
        deferBackRelevantTransition={deferBackRelevantTransition}
        entries={activeEntries}
        explicitReplySideCopy={explicitReplySideCopy}
        opponentReplySettingsHint={opponentReplySettingsHint}
        initialIndex={activeEntryInitialIndex}
        moveFeedbackClient={moveFeedbackClient}
        scheduledReviewCompletedCount={completedReviews.length}
        scheduledReviewTotal={dailyReviewTotal}
        service={service}
        onReviewRecorded={onReviewRecorded}
        onReviewEnrollmentChanged={onReviewScheduleChanged}
        onAttemptClearUnclear={clearSessionAttemptUnclear}
        onAnalysisActiveChange={onAnalysisActiveChange}
        onBoardTouchActiveChange={onBoardTouchActiveChange}
        onComplete={(source) => finishActiveReview(source, activeReviewGeneration)}
        onReturnToOwner={returnActiveReviewToOwner}
        replayControlsOnly
        replayTerminology
        reviewScheduleControlVisible
        stockfish={stockfish}
        systemBackCommand={systemBackCommand}
      />
    );
  }

  const reviewFilterOptions = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.reviewFilterScroller}
      contentContainerStyle={styles.reviewFilterContent}
      testID="review-queue-filters"
    >
      {REVIEW_TODAY_FILTERS.map((filter) => (
        <FilterButton
          key={filter}
          active={queueFilter === filter}
          label={reviewQueueFilterLabel(filter, locale)}
          testID={reviewQuickFilterTestID(filter)}
          onPress={() => setQueueFilter(filter)}
        />
      ))}
    </ScrollView>
  );
  const reviewFilterOptionsRegion = (
    <CollapsibleRegion
      contentTestID="review-filter-options"
      expanded={filtersExpanded}
    >
      {reviewFilterOptions}
    </CollapsibleRegion>
  );
  const reviewFilterSummaryRegion = (
    <CollapsibleRegion
      contentTestID="review-filter-summary"
      expanded={!filtersExpanded}
    >
      <ReviewFilterSummary label={selectedReviewFilterLabel} />
    </CollapsibleRegion>
  );

  return (
    <View style={styles.historyPanel} testID="review-panel">
      <View style={styles.historyHeaderRow} testID="review-action-header">
        <AppText accessibilityRole="header" style={styles.destinationTitle} variant="largeTitle">{t("tabs.review")}</AppText>
        <ToolbarIconButton
          accessibilityLabel={t("review.filterToggleA11y", {
            action: filtersExpanded ? t("survival.hub.hide") : t("survival.hub.show"),
            selectedSuffix: queueFilter === "all"
              ? ""
              : t("review.filterToggleSelectedSuffix", { label: selectedReviewFilterLabel })
          })}
          accessibilityState={{ expanded: filtersExpanded }}
          active={reviewFilterControlActive}
          testID="review-filter-toggle"
          onPress={() => onFiltersExpandedChange(!filtersExpanded)}
        >
          <FilterGlyph active={reviewFilterControlActive} />
        </ToolbarIconButton>
      </View>

      <View
        accessibilityLabel={dailyReviewTotal === 0
          ? t("review.dueCardEmptyA11y", {
              tomorrow: queueSummary.tomorrowCount,
              next7: queueSummary.nextSevenDaysCount,
              total: queueSummary.totalCount,
              filterLabel: reviewDueFilterLabel
            })
          : t("review.dueCardActiveA11y", {
              completed: completedReviews.length,
              dailyTotal: dailyReviewTotal,
              remaining: reviewToday.dueItems.length,
              overdueSuffix: queueSummary.overdueCount > 0
                ? t("review.overdueSuffix", { count: queueSummary.overdueCount })
                : "",
              tomorrow: queueSummary.tomorrowCount,
              next7: queueSummary.nextSevenDaysCount,
              total: queueSummary.totalCount,
              filterLabel: reviewDueFilterLabel
            })}
        style={styles.reviewDueCard}
        testID="review-due-card"
      >
        <View style={styles.editorRowLabel}>
          <AppText variant="headline">{t("common.today")}</AppText>
          <AppText testID="review-due-summary" tone="secondary" variant="subheadline">
            {reviewDueSummaryLabel}
          </AppText>
          <AppText
            accessibilityLabel={queueSummary.oldestDueLabel}
            testID="review-next-due"
            tone="secondary"
            variant="footnote"
          >
            {reviewDueSubline}
          </AppText>
        </View>
        <View style={styles.reviewDueCountBlock}>
          <AppText testID="review-due-count" style={styles.reviewDueBigCount} tone="accent" variant="numeralLarge">{dailyReviewProgressLabel}</AppText>
        </View>
      </View>

      <View
        accessibilityLabel={t("review.forecastA11y", {
          tomorrow: reviewCountLabel(queueSummary.tomorrowCount, locale),
          next7: reviewCountLabel(queueSummary.nextSevenDaysCount, locale),
          total: reviewCountLabel(queueSummary.totalCount, locale)
        })}
        style={[styles.reviewForecastRow, forecastStacked ? styles.reviewForecastRowStacked : null]}
        testID="review-forecast"
      >
        <ReviewForecastMetric label={t("review.forecastTomorrow")} count={queueSummary.tomorrowCount} countTestID="review-tomorrow-count" stacked={forecastStacked} />
        <View style={forecastStacked ? styles.reviewForecastDividerStacked : styles.reviewForecastDivider} />
        <ReviewForecastMetric label={t("review.forecastNext7Days")} count={queueSummary.nextSevenDaysCount} countTestID="review-next-seven-days-count" stacked={forecastStacked} />
        <View style={forecastStacked ? styles.reviewForecastDividerStacked : styles.reviewForecastDivider} />
        <ReviewForecastMetric label={t("review.forecastTotal")} count={queueSummary.totalCount} countTestID="review-total-count" stacked={forecastStacked} />
      </View>

      <View style={styles.reviewFilterControlSlot} testID="review-filter-controls">
        {reviewFilterOptionsRegion}
        {reviewFilterSummaryRegion}
      </View>

      <Button
        accessibilityLabel={t("review.startDueA11y")}
        disabled={filteredDueEntries.length === 0}
        icon="play"
        label={t("review.startDueLabel", { count: queueSummary.filteredCount })}
        stretch
        testID="review-start-due"
        onPress={() => startReviewEntries(filteredDueEntries)}
      />

      {onPromoteNextFutureReviewsToDue || onScheduleTestReviewReminder ? (
        <View style={styles.reviewDevControls} testID="review-dev-controls">
          {onPromoteNextFutureReviewsToDue ? (
            <Button
              accessibilityLabel={t("review.dev.promoteA11y")}
              label={t("review.dev.promoteLabel")}
              size="compact"
              stretch
              testID="review-dev-promote-next-due"
              variant="secondary"
              onPress={() => {
                const result = onPromoteNextFutureReviewsToDue();
                setDevStatus(reviewDuePromotionStatus(result, locale));
              }}
            />
          ) : null}
          {onScheduleTestReviewReminder ? (
            <Button
              accessibilityLabel={t("review.dev.testNotifA11y")}
              label={t("review.dev.testNotifLabel")}
              size="compact"
              stretch
              testID="review-dev-test-notification"
              variant="secondary"
              onPress={() => {
                void onScheduleTestReviewReminder().then((result) => {
                  setDevStatus(result.scheduled
                    ? t("review.dev.testNotifScheduled", {
                        date: formatLocalDateForLocale(result.scheduledAt ?? "", locale)
                      })
                    : t("review.dev.testNotifNone"));
                });
              }}
            />
          ) : null}
          {devStatus ? <AppText testID="review-dev-status" tone="secondary" variant="footnote">{devStatus}</AppText> : null}
          {reviewReminderScheduleStatus ? (
            <Text style={styles.reviewDueHiddenMetric} testID="review-dev-reminder-status">{reviewReminderScheduleStatus}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.reviewItemList} testID="review-due-items">
        <ReviewSectionToggle
          count={filteredReviewToday.dueItems.length}
          expanded={todayReviewsExpanded}
          label={t("review.section.todayToReview")}
          toggleTestID="review-today-to-review-toggle"
          onPress={() => setTodayReviewsExpanded((expanded) => !expanded)}
        />
        <CollapsibleRegion
          contentTestID="review-today-to-review-items"
          contentStyle={styles.reviewSectionItems}
          expanded={todayReviewsExpanded}
        >
          {filteredReviewToday.dueItems.length > 0 ? filteredReviewToday.dueItems.map((entry, index) => (
            <React.Fragment key={`${entry.item.review.puzzleId}:${entry.item.review.mode}:${entry.item.review.ratingKey}`}>
              {index > 0 ? <View style={styles.groupedSeparator} /> : null}
              <ReviewQueueItemCard
                presentation={entry}
                nowMs={nowMs}
                onPress={() => startReviewEntries([buildServiceReviewEntry(service, {
                  puzzle: entry.item.puzzle,
                  mode: entry.item.review.mode,
                  ratingKey: entry.item.review.ratingKey,
                  source: "due"
                })])}
              />
            </React.Fragment>
          )) : (
            <AppText style={styles.groupedEmpty} testID="review-today-to-review-empty" tone="secondary" variant="subheadline">
              {t("review.emptyDueFiltered")}
            </AppText>
          )}
        </CollapsibleRegion>
      </View>

      <View style={styles.reviewItemList} testID="review-today-history">
        <ReviewSectionToggle
          count={filteredCompletedReviews.length}
          expanded={completedReviewsExpanded}
          label={t("review.section.completedToday")}
          toggleTestID="review-completed-today-toggle"
          onPress={() => setCompletedReviewsExpanded((expanded) => !expanded)}
        />
        <CollapsibleRegion
          contentTestID="review-today-history-items"
          contentStyle={styles.reviewSectionItems}
          expanded={completedReviewsExpanded}
        >
          {filteredCompletedReviews.length > 0 ? filteredCompletedReviews.map((item, index) => (
            <React.Fragment key={item.attempt.id}>
              {index > 0 ? <View style={styles.groupedSeparator} /> : null}
              <TodayReviewAttemptRow
                item={item}
                onOpen={() => openCompletedReview(item.attempt.id)}
              />
            </React.Fragment>
          )) : (
            <AppText style={styles.groupedEmpty} testID="review-today-history-empty" tone="secondary" variant="subheadline">
              {t("review.emptyCompletedFiltered")}
            </AppText>
          )}
        </CollapsibleRegion>
      </View>

    </View>
  );
}

function reviewDuePromotionStatus(
  result: ReviewQueueDuePromotionResult,
  locale: SupportedLocale
): string {
  if (result.promotedCount === 0) {
    return translate(locale, "review.dev.noFutureToPromote");
  }
  return translate(locale, "review.dev.promotedStatus", {
    reviews: reviewCountLabel(result.promotedCount, locale),
    date: result.promotedDate ?? translate(locale, "review.dev.nextDueDateFallback")
  });
}

function ReviewFilterSummary({ label }: { label: string }): React.JSX.Element {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View
      accessibilityLabel={t("review.filterSummaryA11y", { label })}
      testID="review-active-filter-summary"
    >
      <View style={styles.historyChipContent}>
        <View style={[styles.filterButton, styles.filterButtonActive]} testID="review-active-filter-0">
          <Text style={[styles.filterButtonText, styles.filterButtonTextActive]}>{label}</Text>
        </View>
      </View>
    </View>
  );
}

function reviewTodayActivityLabel(
  history: ReviewTodayHistoryPresentation,
  nowMs: number,
  locale: SupportedLocale
): string {
  if (!history.activity.at) {
    return translate(locale, "review.activity.scheduled");
  }
  const when = reviewRelativeDayLabel(history.activity.at, nowMs, locale);
  if (history.activity.kind === "last_retry") {
    return translate(locale, "review.activity.lastRetry", { when });
  }
  if (history.activity.kind === "first_missed") {
    return translate(locale, "review.activity.firstMissed", { when });
  }
  return translate(locale, "review.activity.addedToReview", { when });
}

function reviewRelativeDayLabel(
  value: string,
  nowMs: number,
  locale: SupportedLocale
): string {
  const date = new Date(value);
  const now = new Date(nowMs);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(now.getTime())) {
    return formatLocalDateForLocale(value, locale);
  }
  const dateDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = Math.max(0, Math.round((nowDay - dateDay) / (24 * 60 * 60 * 1000)));
  if (daysAgo === 0) {
    return translate(locale, "review.relative.todayLower");
  }
  return translate(locale, "review.relative.daysAgo", { count: daysAgo });
}

function ReviewQueueItemCard({
  presentation,
  nowMs,
  onPress
}: {
  presentation: ReviewTodayDueItemPresentation;
  nowMs: number;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const { locale, t } = useTranslation();
  const { history, item } = presentation;
  const activityLabel = reviewTodayActivityLabel(history, nowMs, locale);
  const source = reviewItemSourceSprintLabel(item.review, locale);
  const compactSource = reviewItemCompactSourceLabel(item.review, locale);
  const attemptsText = t("common.attemptsCount", { count: history.attemptCount });
  const missesText = t("review.row.missesCount", { count: history.missCount });
  const attemptSummaryLabel = `${attemptsText} · ${missesText}`;
  const rowTestId = `review-due-item-${item.puzzle.id}-${safeTestId(item.review.mode)}-${safeTestId(item.review.ratingKey)}`;
  const accessibilityLabel = [
    t("review.row.startReviewA11y", { mode: modeLabel(item.review.mode, locale) }),
    t("review.row.scheduledRetry"),
    activityLabel,
    attemptsText,
    missesText,
    source
  ].join(", ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={rowTestId}
      style={({ pressed }) => [rowStyle, styles.attemptRow, pressed ? styles.settingsRowPressed : null]}
      onPress={onPress}
    >
      <View testID={`${rowTestId}-badge`}>
        <IconTile name="review" />
      </View>
      <View style={styles.settingsRowCopy}>
        <AppText variant="headline">{modeLabel(item.review.mode, locale)}</AppText>
        <AppText testID={`${rowTestId}-context`} tone="secondary" variant="subheadline">{activityLabel}</AppText>
        <AppText testID={`${rowTestId}-meta`} tone="secondary" variant="footnote">
          {[attemptSummaryLabel, compactSource].filter(Boolean).join(" · ")}
        </AppText>
      </View>
      <View style={styles.attemptRowChevron}>
        <Icon color={appTheme.colors.text.tertiary} name="chevronRight" size={15} testID="chevron-right-glyph" weight="semibold" />
      </View>
    </Pressable>
  );
}

function ReviewSectionToggle({
  count,
  expanded,
  label,
  toggleTestID,
  onPress
}: {
  count: number;
  expanded: boolean;
  label: string;
  toggleTestID: string;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const { locale, t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("review.section.toggleA11y", {
        action: expanded ? t("review.section.collapse") : t("review.section.expand"),
        label,
        countLabel: reviewCountLabel(count, locale)
      })}
      accessibilityState={{ expanded }}
      testID={toggleTestID}
      style={styles.reviewSectionToggle}
      onPress={onPress}
    >
      <AppText style={styles.reviewSectionTitle} variant="title">{label}</AppText>
      <View style={styles.reviewSectionToggleMeta} testID={`${toggleTestID}-meta`}>
        <AppText style={styles.reviewSectionCount} testID={`${toggleTestID}-count`} tone="secondary" variant="body">{count}</AppText>
        <View style={styles.reviewSectionToggleChevron} testID={`${toggleTestID}-chevron`}>
          <DisclosureChevron
            expanded={expanded}
            testID={`${toggleTestID}-animated-chevron`}
          />
        </View>
      </View>
    </Pressable>
  );
}

function TodayReviewAttemptRow({
  item,
  onOpen
}: {
  item: CompletedReviewItem;
  onOpen: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const { locale, t } = useTranslation();
  const isWrong = item.attempt.result === "wrong";
  const resultLabel = isWrong ? t("common.wrong") : t("common.correct");
  const elapsedSeconds = Math.max(
    0,
    Math.round((new Date(item.attempt.completedAt).getTime() - new Date(item.attempt.startedAt).getTime()) / 1000)
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("review.todayRowA11y", {
        mode: modeLabel(item.attempt.mode, locale),
        result: resultLabel.toLowerCase()
      })}
      testID={`review-today-attempt-${item.attempt.id}`}
      style={({ pressed }) => [rowStyle, styles.attemptRow, pressed ? styles.settingsRowPressed : null]}
      onPress={onOpen}
    >
      <AttemptStatusTile
        testID={`review-today-attempt-${item.attempt.id}-badge`}
        tone={isWrong ? "wrong" : "correct"}
      />
      <View style={styles.settingsRowCopy}>
        <View style={styles.historyAttemptHeader}>
          <AppText variant="headline">{modeLabel(item.attempt.mode, locale)}</AppText>
          <AppText
            testID={`review-today-attempt-${item.attempt.id}-result`}
            tone={isWrong ? "negative" : "positive"}
            variant="subheadline"
          >
            {resultLabel}
          </AppText>
        </View>
        <AppText tone="secondary" variant="footnote">
          {t("common.puzzleNumber", { id: item.puzzle.id })} · {t("common.secondsCompact", { count: elapsedSeconds })}
        </AppText>
        <AppText tone="secondary" variant="footnote">
          {t("review.todayRowDetail", { date: formatLocalDateForLocale(item.attempt.completedAt, locale) })}
        </AppText>
      </View>
      <View style={styles.attemptRowChevron}>
        <Icon color={appTheme.colors.text.tertiary} name="chevronRight" size={15} testID="chevron-right-glyph" weight="semibold" />
      </View>
    </Pressable>
  );
}

const REVIEW_FORECAST_STACK_FONT_SCALE = 1.5;

function ReviewForecastMetric({
  count,
  label,
  countTestID,
  stacked = false
}: {
  count: number;
  label: string;
  countTestID: string;
  stacked?: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  if (stacked) {
    return (
      <View style={styles.reviewForecastMetricStacked}>
        <AppText style={styles.reviewForecastLabelStacked} tone="secondary" variant="body">{label}</AppText>
        <AppText testID={countTestID} variant="numeral">{count}</AppText>
      </View>
    );
  }
  return (
    <View style={styles.reviewForecastMetric}>
      <AppText testID={countTestID} variant="numeral">{count}</AppText>
      <AppText tone="secondary" variant="caption">{label}</AppText>
    </View>
  );
}

export function reviewCountLabel(
  count: number,
  locale: SupportedLocale = getActiveLocale()
): string {
  return translate(locale, "common.reviewsCount", { count });
}

const useStyles = makeStyles((theme) => ({
  ...pickPracticeStyles(theme, ["editorRowLabel", "historyHeaderRow", "historyPanel", "reviewDueHiddenMetric", "settingsRowCopy", "settingsRowPressed"]),
  reviewFilterControlSlot: {
    overflow: "hidden"
  },
  reviewDueCard: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.card,
    flexDirection: "row",
    gap: theme.spacing.row,
    padding: 16
  },
  reviewDueBigCount: {
    textAlign: "right"
  },
  reviewDueCountBlock: {
    alignItems: "flex-end",
    flexShrink: 0
  },
  reviewFilterScroller: {
    marginHorizontal: -UI_PADDING
  },
  // Matches the summary chip row so the slot keeps one height when toggled.
  reviewFilterContent: {
    gap: 8,
    paddingHorizontal: UI_PADDING,
    paddingVertical: 4
  },
  reviewForecastRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.card,
    flexDirection: "row",
    paddingVertical: 12
  },
  reviewForecastMetric: {
    alignItems: "center",
    flex: 1,
    gap: 2,
    justifyContent: "center",
    paddingHorizontal: 8
  },
  reviewItemList: {
    gap: theme.spacing.group
  },
  reviewSectionToggle: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row,
    justifyContent: "space-between",
    minHeight: theme.metrics.minTarget,
    paddingHorizontal: 4
  },
  reviewSectionToggleMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline
  },
  reviewSectionCount: {
    fontVariant: ["tabular-nums"]
  },
  reviewSectionToggleChevron: {
    alignItems: "center",
    height: 18,
    justifyContent: "center",
    width: 18
  },
  reviewSectionItems: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.card,
    overflow: "hidden"
  },
  reviewDevControls: {
    alignItems: "stretch",
    gap: theme.spacing.group
  },
  filterButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.capsule,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 14
  },
  filterButtonActive: {
    backgroundColor: theme.colors.accent.s100
  },
  filterButtonText: {
    ...theme.typography.subheadline,
    color: theme.colors.text.primary
  },
  filterButtonTextActive: {
    color: theme.colors.accent.s600,
    fontWeight: theme.typography.headline.fontWeight
  },
  destinationTitle: {
    flexShrink: 0
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
  attemptRowChevron: {
    alignSelf: "center"
  },
  reviewForecastRowStacked: {
    flexDirection: "column",
    paddingVertical: 4
  },
  reviewForecastMetricStacked: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row,
    justifyContent: "space-between",
    minHeight: theme.metrics.minTarget,
    paddingHorizontal: 16,
    paddingVertical: 6
  },
  reviewForecastLabelStacked: {
    flexShrink: 1
  },
  reviewForecastDividerStacked: {
    backgroundColor: theme.colors.border.default,
    height: StyleSheet.hairlineWidth
  },
  reviewForecastDivider: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.border.default,
    width: StyleSheet.hairlineWidth
  },
  reviewSectionTitle: {
    flex: 1
  },
  historyChipContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline,
    paddingVertical: 4
  },
  historyAttemptHeader: {
    alignItems: "baseline",
    columnGap: 8,
    flexDirection: "row",
    flexWrap: "wrap"
  },
}));
