import type { ReviewContext, ReviewQueueState, ReviewScheduleRemoval } from "./types.ts";

export type ReviewScheduleChange =
  | { kind: "scheduled"; review: ReviewQueueState }
  | { kind: "removed"; removal: ReviewScheduleRemoval };

export function removeReviewContext(
  context: ReviewContext,
  now: string,
  previous?: ReviewScheduleRemoval
): ReviewScheduleRemoval {
  if (previous) {
    assertSameReviewContext(context, previous);
    return previous;
  }
  const removedAt = normalizedReviewChangeTime(now);
  return { ...context, removedAt };
}

export function preferredReviewScheduleChange(
  left: ReviewScheduleChange | undefined,
  right: ReviewScheduleChange
): ReviewScheduleChange {
  if (!left) {
    return right;
  }
  assertSameReviewContext(reviewContextForChange(left), reviewContextForChange(right));
  const comparison = reviewScheduleChangedAt(right).localeCompare(reviewScheduleChangedAt(left));
  if (comparison !== 0) {
    return comparison > 0 ? right : left;
  }
  if (left.kind !== right.kind) {
    return left.kind === "removed" ? left : right;
  }
  if (left.kind === "removed") {
    return left;
  }
  if (right.kind !== "scheduled") {
    return left;
  }
  const dueComparison = right.review.dueDay.localeCompare(left.review.dueDay);
  return dueComparison >= 0 ? right : left;
}

export function reviewScheduleChangedAt(change: ReviewScheduleChange): string {
  return change.kind === "removed"
    ? normalizedReviewChangeTime(change.removal.removedAt)
    : normalizedReviewChangeTime(change.review.lastReviewedAt ?? change.review.enrolledAt ?? "");
}

export function reviewContextKey(context: ReviewContext): string {
  return `${context.puzzleId}\u0000${context.mode}\u0000${context.ratingKey}`;
}

export function sameReviewContext(left: ReviewContext, right: ReviewContext): boolean {
  return reviewContextKey(left) === reviewContextKey(right);
}

function reviewContextForChange(change: ReviewScheduleChange): ReviewContext {
  return change.kind === "scheduled" ? change.review : change.removal;
}

function normalizedReviewChangeTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Review schedule change time must be a valid ISO timestamp");
  }
  return date.toISOString();
}

function assertSameReviewContext(left: ReviewContext, right: ReviewContext): void {
  if (!sameReviewContext(left, right)) {
    throw new Error("Review schedule changes must identify the same Review Context");
  }
}
