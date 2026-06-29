import type { ReviewContext, ReviewQueueState, ReviewScheduleInput } from "./types.ts";

const SUCCESS_INTERVALS_HOURS = [24, 72, 168, 336, 720, 1440];

export function scheduleReview(input: ReviewScheduleInput): ReviewQueueState {
  const nowDate = new Date(input.now);
  if (Number.isNaN(nowDate.getTime())) {
    throw new Error("now must be a valid ISO timestamp");
  }

  if (!input.previous) {
    const context = input.context ?? defaultReviewContext();
    const intervalHours = input.result === "correct" ? successIntervalAt(1) : successIntervalAt(0);
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
  const intervalHours = successIntervalAt(successStreak);
  return {
    ...input.previous,
    dueAt: addHours(nowDate, intervalHours).toISOString(),
    intervalHours,
    reviewCount: input.previous.reviewCount + 1,
    successStreak,
    lastResult: input.result,
    lastReviewedAt: nowDate.toISOString()
  };
}

export function scheduleMistake(puzzleId: string, now: string): ReviewQueueState {
  return scheduleReview({ context: { puzzleId, mode: "standard", ratingKey: "standard 5/20" }, result: "wrong", now });
}

export function scheduleMistakeForContext(context: ReviewContext, now: string): ReviewQueueState {
  return scheduleReview({ context, result: "wrong", now });
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
