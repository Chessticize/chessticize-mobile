import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { GestureType } from "react-native-gesture-handler";
import {
  type AttemptEvent,
  formatLocalCalendarDate,
  formatReviewDay,
  isReviewOverdue,
  reviewQueueForecast,
  type ReviewQueueItem,
  type ReviewQueueState,
  type SessionReplayItem
} from "../../../../../../packages/core/src/index.ts";
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
  review: Pick<ReviewQueueState, "mode" | "ratingKey">
): string {
  const speed = reviewItemSpeedSeconds(review);
  const speedLabel = speed === null ? null : `${speed}s pace`;
  return `Source sprint: ${modeLabel(review.mode)}${speedLabel ? ` · ${speedLabel}` : ""}`;
}

function reviewQueueFilterLabel(filter: ReviewTodayFilter): string {
  if (filter === "all") {
    return "All";
  }
  if (filter === "overdue") {
    return "Overdue";
  }
  if (filter === "missed_twice") {
    return "Missed 2+ times";
  }
  return "Arrow Duel";
}

const REVIEW_TODAY_FILTERS: readonly ReviewTodayFilter[] = [
  "all",
  "overdue",
  "missed_twice",
  "arrow_duel"
];

function reviewQueueSummary(queue: ReviewQueueState[], filteredItems: ReviewQueueItem[], nowMs: number): {
  dueStatusLabel: string;
  filteredCount: number;
  oldestDueLabel: string;
  overdueCount: number;
  tomorrowCount: number;
  nextSevenDaysCount: number;
  totalCount: number;
} {
  const forecast = reviewQueueForecast(queue, nowMs);
  const filteredOverdueCount = filteredItems.filter((item) => isReviewOverdue(item.review, nowMs)).length;
  return {
    dueStatusLabel: filteredItems.length === 0
      ? "No matching scheduled reviews"
      : filteredOverdueCount > 0
        ? "Overdue now"
        : "Ready now",
    filteredCount: filteredItems.length,
    oldestDueLabel: forecast.totalCount === 0
      ? "Next review appears after a missed puzzle reaches its due time"
      : forecast.todayCount > 0
        ? `Oldest due ${formatReviewDay(queue.map((review) => review.dueDay).sort()[0]!)}`
        : `Next review due ${formatReviewDay(forecast.nextDueDay!)}`,
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
  const queueSummary = reviewQueueSummary(reviewQueue, filteredDueReviewItems, nowMs);
  const selectedReviewFilterLabel = reviewQueueFilterLabel(queueFilter);
  const reviewDueSummaryLabel = filteredDueEntries.length > 0
    ? queueSummary.dueStatusLabel
    : reviewToday.dueItems.length === 0
      ? "You're done for today"
      : "No matching scheduled reviews";
  const reviewDueFilterLabel = filteredDueEntries.length > 0
    ? `${selectedReviewFilterLabel} · ${queueSummary.dueStatusLabel}`
    : "No matching scheduled reviews";
  const reviewDueSubline = reviewDueCardSubline(queueSummary.oldestDueLabel);
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
          label={reviewQueueFilterLabel(filter)}
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
        <AppText accessibilityRole="header" style={styles.destinationTitle} variant="largeTitle">Review</AppText>
        <ToolbarIconButton
          accessibilityLabel={`${filtersExpanded ? "Hide" : "Show"} review filters${queueFilter === "all" ? "" : `, ${selectedReviewFilterLabel} selected`}`}
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
          ? `Today, no reviews scheduled, ${queueSummary.tomorrowCount} tomorrow, ${queueSummary.nextSevenDaysCount} in the next 7 days, ${queueSummary.totalCount} total, ${reviewDueFilterLabel}`
          : `Today, ${completedReviews.length} of ${dailyReviewTotal} reviews completed, ${reviewToday.dueItems.length} remaining${queueSummary.overdueCount > 0 ? `, ${queueSummary.overdueCount} overdue` : ""}, ${queueSummary.tomorrowCount} tomorrow, ${queueSummary.nextSevenDaysCount} in the next 7 days, ${queueSummary.totalCount} total, ${reviewDueFilterLabel}`}
        style={styles.reviewDueCard}
        testID="review-due-card"
      >
        <View style={styles.editorRowLabel}>
          <AppText variant="headline">Today</AppText>
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
        accessibilityLabel={`${reviewCountLabel(queueSummary.tomorrowCount)} tomorrow, ${reviewCountLabel(queueSummary.nextSevenDaysCount)} in the next 7 days, ${reviewCountLabel(queueSummary.totalCount)} total`}
        style={[styles.reviewForecastRow, forecastStacked ? styles.reviewForecastRowStacked : null]}
        testID="review-forecast"
      >
        <ReviewForecastMetric label="Tomorrow" count={queueSummary.tomorrowCount} countTestID="review-tomorrow-count" stacked={forecastStacked} />
        <View style={forecastStacked ? styles.reviewForecastDividerStacked : styles.reviewForecastDivider} />
        <ReviewForecastMetric label="Next 7 days" count={queueSummary.nextSevenDaysCount} countTestID="review-next-seven-days-count" stacked={forecastStacked} />
        <View style={forecastStacked ? styles.reviewForecastDividerStacked : styles.reviewForecastDivider} />
        <ReviewForecastMetric label="Total" count={queueSummary.totalCount} countTestID="review-total-count" stacked={forecastStacked} />
      </View>

      <View style={styles.reviewFilterControlSlot} testID="review-filter-controls">
        {reviewFilterOptionsRegion}
        {reviewFilterSummaryRegion}
      </View>

      <Button
        accessibilityLabel="Start due review"
        disabled={filteredDueEntries.length === 0}
        icon="play"
        label={`Review ${queueSummary.filteredCount}`}
        stretch
        testID="review-start-due"
        onPress={() => startReviewEntries(filteredDueEntries)}
      />

      {onPromoteNextFutureReviewsToDue || onScheduleTestReviewReminder ? (
        <View style={styles.reviewDevControls} testID="review-dev-controls">
          {onPromoteNextFutureReviewsToDue ? (
            <Button
              accessibilityLabel="Make next future review date due today"
              label="Make next due today"
              size="compact"
              stretch
              testID="review-dev-promote-next-due"
              variant="secondary"
              onPress={() => {
                const result = onPromoteNextFutureReviewsToDue();
                setDevStatus(reviewDuePromotionStatus(result));
              }}
            />
          ) : null}
          {onScheduleTestReviewReminder ? (
            <Button
              accessibilityLabel="Schedule a test review notification"
              label="Test notification"
              size="compact"
              stretch
              testID="review-dev-test-notification"
              variant="secondary"
              onPress={() => {
                void onScheduleTestReviewReminder().then((result) => {
                  setDevStatus(result.scheduled ? `Test notification scheduled ${formatLocalCalendarDate(result.scheduledAt ?? "")}` : "No test notification scheduled");
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
          label="Today to review"
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
              No reviews match this filter.
            </AppText>
          )}
        </CollapsibleRegion>
      </View>

      <View style={styles.reviewItemList} testID="review-today-history">
        <ReviewSectionToggle
          count={filteredCompletedReviews.length}
          expanded={completedReviewsExpanded}
          label="Completed today"
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
              No completed reviews match this filter.
            </AppText>
          )}
        </CollapsibleRegion>
      </View>

    </View>
  );
}

function reviewDuePromotionStatus(result: ReviewQueueDuePromotionResult): string {
  if (result.promotedCount === 0) {
    return "No future reviews to promote";
  }
  const reviewLabel = result.promotedCount === 1 ? "1 review" : `${result.promotedCount} reviews`;
  return `${reviewLabel} from ${result.promotedDate ?? "next due date"} due today`;
}

function reviewDueCardSubline(label: string): string {
  if (label.startsWith("Oldest due ")) {
    return `Oldest: ${label.slice("Oldest due ".length)}`;
  }
  if (label.startsWith("Next review due ")) {
    return `Next: ${label.slice("Next review due ".length)}`;
  }
  if (label.startsWith("Next review appears ")) {
    return "Next: after the first missed puzzle is due";
  }
  return label;
}

function ReviewFilterSummary({ label }: { label: string }): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      accessibilityLabel={`Review filter summary, ${label}`}
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
  nowMs: number
): string {
  if (!history.activity.at) {
    return "Scheduled for review";
  }
  const activity = reviewRelativeDayLabel(history.activity.at, nowMs);
  if (history.activity.kind === "last_retry") {
    return `Last retry ${activity}`;
  }
  if (history.activity.kind === "first_missed") {
    return `First missed ${activity}`;
  }
  return `Added to Review ${activity}`;
}

function reviewRelativeDayLabel(value: string, nowMs: number): string {
  const date = new Date(value);
  const now = new Date(nowMs);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(now.getTime())) {
    return formatLocalCalendarDate(value);
  }
  const dateDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = Math.max(0, Math.round((nowDay - dateDay) / (24 * 60 * 60 * 1000)));
  if (daysAgo === 0) {
    return "today";
  }
  if (daysAgo === 1) {
    return "1 day ago";
  }
  return `${daysAgo} days ago`;
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
  const { history, item } = presentation;
  const activityLabel = reviewTodayActivityLabel(history, nowMs);
  const source = reviewItemSourceSprintLabel(item.review);
  const compactSource = source.replace(/^Source sprint: /, "");
  const attemptSummaryLabel = `${reviewAttemptMetricLabel(history.attemptCount, "attempt")} · ${reviewAttemptMetricLabel(history.missCount, "miss")}`;
  const rowTestId = `review-due-item-${item.puzzle.id}-${safeTestId(item.review.mode)}-${safeTestId(item.review.ratingKey)}`;
  const accessibilityLabel = [
    `Start ${modeLabel(item.review.mode)} review`,
    "Scheduled retry",
    activityLabel,
    reviewAttemptMetricLabel(history.attemptCount, "attempt"),
    reviewAttemptMetricLabel(history.missCount, "miss"),
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
        <AppText variant="headline">{modeLabel(item.review.mode)}</AppText>
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

function reviewAttemptMetricLabel(count: number, singular: "attempt" | "miss"): string {
  const plural = singular === "attempt" ? "attempts" : "misses";
  return `${count} ${count === 1 ? singular : plural}`;
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${label}, ${reviewCountLabel(count)}`}
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
  const isWrong = item.attempt.result === "wrong";
  const resultLabel = isWrong ? "Wrong" : "Correct";
  const elapsedSeconds = Math.max(
    0,
    Math.round((new Date(item.attempt.completedAt).getTime() - new Date(item.attempt.startedAt).getTime()) / 1000)
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${modeLabel(item.attempt.mode)} ${resultLabel.toLowerCase()} review for analysis or retry`}
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
          <AppText variant="headline">{modeLabel(item.attempt.mode)}</AppText>
          <AppText
            testID={`review-today-attempt-${item.attempt.id}-result`}
            tone={isWrong ? "negative" : "positive"}
            variant="subheadline"
          >
            {resultLabel}
          </AppText>
        </View>
        <AppText tone="secondary" variant="footnote">Puzzle {item.puzzle.id} · {elapsedSeconds}s</AppText>
        <AppText tone="secondary" variant="footnote">{formatLocalCalendarDate(item.attempt.completedAt)} · Review or retry</AppText>
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

export function reviewCountLabel(count: number): string {
  return `${count} ${count === 1 ? "review" : "reviews"}`;
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
