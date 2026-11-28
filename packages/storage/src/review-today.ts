import {
  enrollReviewContext,
  isAttemptMistake,
  isReviewOverdue,
  scheduleMistakeForContext,
  scheduleReview
} from "../../core/src/index.ts";
import type {
  Puzzle,
  ReviewContext,
  ReviewQueueItem,
  ReviewQueueState
} from "../../core/src/index.ts";
import type { AttemptHistoryRow } from "./query-types.ts";

export type ReviewTodayFilter = "all" | "overdue" | "missed_twice" | "arrow_duel";
export type ReviewPuzzleOriginFilter = "all" | "pack" | "user_game";

export interface CompletedReviewItem {
  attempt: AttemptHistoryRow;
  puzzle: Puzzle;
}

export interface ReviewTodayHistoryPresentation {
  attemptCount: number;
  missCount: number;
  activity: {
    kind: "added_to_review" | "first_missed" | "last_retry";
    at: string | null;
  };
}

export interface ReviewTodayDueItemPresentation {
  item: ReviewQueueItem;
  history: ReviewTodayHistoryPresentation;
  overdue: boolean;
}

export interface ReviewTodayCompletedItemPresentation {
  item: CompletedReviewItem;
  history: ReviewTodayHistoryPresentation;
  overdue: boolean;
}

export interface ReviewTodayPresentation {
  dueItems: ReviewTodayDueItemPresentation[];
  completedItems: ReviewTodayCompletedItemPresentation[];
}

export interface BuildReviewTodayPresentationInput {
  now: string;
  dueItems: readonly ReviewQueueItem[];
  completedItems: readonly CompletedReviewItem[];
  reviews: readonly ReviewQueueState[];
  attempts: readonly AttemptHistoryRow[];
}

export function buildReviewTodayPresentation(
  input: BuildReviewTodayPresentationInput
): ReviewTodayPresentation {
  const attemptsByContext = groupAttemptsByReviewContext(input.attempts);
  const reviewsByContext = new Map(
    input.reviews.map((review) => [reviewTodayContextKey(review), review])
  );

  return {
    dueItems: input.dueItems.map((item) => {
      const attempts = attemptsByContext.get(reviewTodayContextKey(item.review)) ?? [];
      return {
        item,
        history: reviewTodayHistory(attempts, item.review),
        overdue: isReviewOverdue(item.review, input.now)
      };
    }),
    completedItems: input.completedItems.map((item) => {
      const key = reviewTodayContextKey(item.attempt);
      const attempts = attemptsThrough(
        attemptsByContext.get(key) ?? [],
        item.attempt.id
      );
      const review = reviewsByContext.get(key);
      return {
        item,
        history: reviewTodayHistory(attempts, review),
        overdue: reviewWasOverdueBeforeAttempt(
          attemptsByContext.get(key) ?? [],
          item.attempt.id,
          item.attempt,
          review?.enrolledAt
        )
      };
    })
  };
}

export function filterReviewTodayPresentation(
  presentation: ReviewTodayPresentation,
  filter: ReviewTodayFilter,
  originFilter: ReviewPuzzleOriginFilter = "all"
): ReviewTodayPresentation {
  if (filter === "all" && originFilter === "all") {
    return presentation;
  }
  const matches = (
    entry: ReviewTodayDueItemPresentation | ReviewTodayCompletedItemPresentation
  ): boolean =>
    (filter === "all" || reviewTodayItemMatches(entry, filter)) &&
    (originFilter === "all" || reviewTodayItemMatchesOrigin(entry, originFilter));
  return {
    dueItems: presentation.dueItems.filter(matches),
    completedItems: presentation.completedItems.filter(matches)
  };
}

export function reviewTodayContextKey(
  context: Pick<ReviewContext, "puzzleId" | "mode" | "ratingKey">
): string {
  return `${context.puzzleId}\u0000${context.mode}\u0000${context.ratingKey}`;
}

function reviewTodayItemMatchesOrigin(
  entry: ReviewTodayDueItemPresentation | ReviewTodayCompletedItemPresentation,
  originFilter: Exclude<ReviewPuzzleOriginFilter, "all">
): boolean {
  const ctx = reviewTodayItemContext(entry);
  const isUserGame =
    entry.item.puzzle.source === "user_game" ||
    ctx.puzzleId.startsWith("ug_") ||
    ctx.ratingKey.startsWith("ug_");
  return originFilter === "user_game" ? isUserGame : !isUserGame;
}

function reviewTodayItemMatches(
  entry: ReviewTodayDueItemPresentation | ReviewTodayCompletedItemPresentation,
  filter: Exclude<ReviewTodayFilter, "all">
): boolean {
  if (filter === "overdue") {
    return entry.overdue;
  }
  if (filter === "missed_twice") {
    return entry.history.missCount >= 2;
  }
  return reviewTodayItemContext(entry).mode === "arrow_duel";
}

function reviewTodayItemContext(
  entry: ReviewTodayDueItemPresentation | ReviewTodayCompletedItemPresentation
): Pick<ReviewContext, "puzzleId" | "mode" | "ratingKey"> {
  return "review" in entry.item ? entry.item.review : entry.item.attempt;
}

function groupAttemptsByReviewContext(
  attempts: readonly AttemptHistoryRow[]
): Map<string, AttemptHistoryRow[]> {
  const result = new Map<string, AttemptHistoryRow[]>();
  for (const attempt of attempts) {
    const key = reviewTodayContextKey(attempt);
    const entries = result.get(key) ?? [];
    entries.push(attempt);
    result.set(key, entries);
  }
  for (const entries of result.values()) {
    entries.sort(compareAttemptsChronologically);
  }
  return result;
}

function attemptsThrough(
  attempts: readonly AttemptHistoryRow[],
  attemptId: string
): AttemptHistoryRow[] {
  const index = attempts.findIndex((attempt) => attempt.id === attemptId);
  return index < 0 ? [] : attempts.slice(0, index + 1);
}

function reviewTodayHistory(
  attempts: readonly AttemptHistoryRow[],
  review: ReviewQueueState | undefined
): ReviewTodayHistoryPresentation {
  const firstMiss = attempts.find((attempt) => isAttemptMistake(attempt.result));
  const retries = attempts.filter((attempt) => attempt.source === "scheduled_review");
  const lastRetry = retries[retries.length - 1];
  const missCount = attempts.filter((attempt) => isAttemptMistake(attempt.result)).length;

  if (lastRetry) {
    return {
      attemptCount: attempts.length,
      missCount,
      activity: { kind: "last_retry", at: lastRetry.completedAt }
    };
  }
  if (firstMiss) {
    return {
      attemptCount: attempts.length,
      missCount,
      activity: { kind: "first_missed", at: firstMiss.completedAt }
    };
  }
  if (review?.reviewCount && review.lastReviewedAt) {
    return {
      attemptCount: attempts.length,
      missCount,
      activity: { kind: "last_retry", at: review.lastReviewedAt }
    };
  }
  if (review?.lastResult === "wrong" && review.lastReviewedAt) {
    return {
      attemptCount: attempts.length,
      missCount,
      activity: { kind: "first_missed", at: review.lastReviewedAt }
    };
  }
  return {
    attemptCount: attempts.length,
    missCount,
    activity: {
      kind: "added_to_review",
      at: review?.enrolledAt ?? null
    }
  };
}

function reviewWasOverdueBeforeAttempt(
  attempts: readonly AttemptHistoryRow[],
  targetAttemptId: string,
  context: Pick<ReviewContext, "puzzleId" | "mode" | "ratingKey">,
  enrolledAt: string | undefined
): boolean {
  let state = enrolledAt
    ? enrollReviewContext(context, enrolledAt)
    : undefined;

  for (const attempt of attempts) {
    if (enrolledAt && attempt.completedAt < enrolledAt) {
      continue;
    }
    if (attempt.source === "scheduled_review") {
      if (attempt.id === targetAttemptId) {
        return state ? isReviewOverdue(state, attempt.completedAt) : false;
      }
      state = scheduleReview({
        ...(state ? { previous: state } : { context }),
        result: attempt.result === "correct" ? "correct" : "wrong",
        now: attempt.completedAt
      });
      continue;
    }
    if (isAttemptMistake(attempt.result)) {
      state = scheduleMistakeForContext(context, attempt.completedAt, state);
    }
  }
  return false;
}

function compareAttemptsChronologically(
  left: AttemptHistoryRow,
  right: AttemptHistoryRow
): number {
  return left.completedAt.localeCompare(right.completedAt) || left.id.localeCompare(right.id);
}
