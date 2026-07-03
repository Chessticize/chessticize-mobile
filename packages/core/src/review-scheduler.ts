import type { ReviewContext, ReviewQueueState, ReviewScheduleInput } from "./types.ts";

const SUCCESS_INTERVALS_HOURS = [24, 72, 168, 336, 720, 1440];
export const REVIEW_OVERDUE_THRESHOLD_HOURS = 24;

export type ReviewDueState = "future" | "due" | "overdue";

export function scheduleReview(input: ReviewScheduleInput): ReviewQueueState {
  const nowDate = new Date(input.now);
  if (Number.isNaN(nowDate.getTime())) {
    throw new Error("now must be a valid ISO timestamp");
  }

  if (!input.previous) {
    const context = input.context ?? defaultReviewContext();
    const intervalHours = successIntervalAt(0);
    return {
      ...context,
      dueAt: addHours(nowDate, intervalHours).toISOString(),
      intervalHours,
      reviewCount: 1,
      successStreak: input.result === "correct" ? 1 : 0,
      lapseCount: input.result === "wrong" ? 1 : 0,
      lastResult: input.result,
      lastReviewedAt: nowDate.toISOString()
    };
  }

  if (input.result === "wrong") {
    const intervalHours = input.previous.successStreak > 0 ? 6 : 24;
    return {
      ...input.previous,
      dueAt: addHours(nowDate, intervalHours).toISOString(),
      intervalHours,
      reviewCount: input.previous.reviewCount + 1,
      successStreak: 0,
      lapseCount: input.previous.lapseCount + 1,
      lastResult: input.result,
      lastReviewedAt: nowDate.toISOString()
    };
  }

  const successStreak = input.previous.successStreak + 1;
  const intervalHours = successIntervalAt(successStreak - 1);
  return {
    ...input.previous,
    dueAt: addHours(nowDate, intervalHours).toISOString(),
    intervalHours,
    reviewCount: input.previous.reviewCount + 1,
    successStreak,
    lapseCount: Math.max(0, input.previous.lapseCount - 1),
    lastResult: input.result,
    lastReviewedAt: nowDate.toISOString()
  };
}

export function scheduleMistake(puzzleId: string, now: string): ReviewQueueState {
  return scheduleMistakeForContext({ puzzleId, mode: "standard", ratingKey: "standard 5/20" }, now);
}

export function scheduleMistakeForContext(context: ReviewContext, now: string, previous?: ReviewQueueState): ReviewQueueState {
  const nowDate = new Date(now);
  if (Number.isNaN(nowDate.getTime())) {
    throw new Error("now must be a valid ISO timestamp");
  }
  const intervalHours = successIntervalAt(0);
  return {
    ...(previous ?? context),
    dueAt: addHours(nowDate, intervalHours).toISOString(),
    intervalHours,
    reviewCount: previous?.reviewCount ?? 0,
    successStreak: 0,
    lapseCount: previous?.lapseCount ?? 0,
    lastResult: "wrong",
    lastReviewedAt: nowDate.toISOString()
  };
}

export function reviewDueState(review: Pick<ReviewQueueState, "dueAt">, now: string | number | Date): ReviewDueState {
  const dueAtMs = new Date(review.dueAt).getTime();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(dueAtMs) || !Number.isFinite(nowMs)) {
    return "future";
  }
  if (nowMs - dueAtMs > REVIEW_OVERDUE_THRESHOLD_HOURS * 60 * 60 * 1000) {
    return "overdue";
  }
  return dueAtMs <= nowMs ? "due" : "future";
}

export function isReviewDue(review: Pick<ReviewQueueState, "dueAt">, now: string | number | Date): boolean {
  return reviewDueState(review, now) !== "future";
}

export function isReviewOverdue(review: Pick<ReviewQueueState, "dueAt">, now: string | number | Date): boolean {
  return reviewDueState(review, now) === "overdue";
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function successIntervalAt(index: number): number {
  return SUCCESS_INTERVALS_HOURS[Math.min(index, SUCCESS_INTERVALS_HOURS.length - 1)] ?? SUCCESS_INTERVALS_HOURS[0]!;
}

function defaultReviewContext(): ReviewContext {
  return {
    puzzleId: "",
    mode: "standard",
    ratingKey: "standard 5/20"
  };
}
