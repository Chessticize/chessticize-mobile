import type { ReviewContext, ReviewQueueState, ReviewScheduleInput } from "./types.ts";

const SUCCESS_INTERVALS_DAYS = [1, 3, 7, 14, 30, 60];
export const REVIEW_DAY_ROLLOVER_HOUR = 4;

export type ReviewDueState = "future" | "due" | "overdue";

export interface ReviewQueueForecast {
  todayCount: number;
  tomorrowCount: number;
  nextSevenDaysCount: number;
  overdueCount: number;
  totalCount: number;
  nextDueDay?: string;
}

export function scheduleReview(input: ReviewScheduleInput): ReviewQueueState {
  const nowDate = new Date(input.now);
  if (Number.isNaN(nowDate.getTime())) {
    throw new Error("now must be a valid ISO timestamp");
  }

  if (!input.previous) {
    const context = input.context ?? defaultReviewContext();
    const intervalDays = successIntervalAt(0);
    return {
      ...context,
      dueDay: addReviewDays(reviewDayFor(nowDate, input.timeZone), intervalDays),
      intervalDays,
      reviewCount: 1,
      successStreak: input.result === "correct" ? 1 : 0,
      lapseCount: input.result === "wrong" ? 1 : 0,
      lastResult: input.result,
      lastReviewedAt: nowDate.toISOString()
    };
  }

  if (input.result === "wrong") {
    const intervalDays = 1;
    return {
      ...input.previous,
      dueDay: addReviewDays(reviewDayFor(nowDate, input.timeZone), intervalDays),
      intervalDays,
      reviewCount: input.previous.reviewCount + 1,
      successStreak: 0,
      lapseCount: input.previous.lapseCount + 1,
      lastResult: input.result,
      lastReviewedAt: nowDate.toISOString()
    };
  }

  const successStreak = input.previous.successStreak + 1;
  const intervalDays = successIntervalAt(successStreak - 1);
  return {
    ...input.previous,
    dueDay: addReviewDays(reviewDayFor(nowDate, input.timeZone), intervalDays),
    intervalDays,
    reviewCount: input.previous.reviewCount + 1,
    successStreak,
    lapseCount: Math.max(0, input.previous.lapseCount - 1),
    lastResult: input.result,
    lastReviewedAt: nowDate.toISOString()
  };
}

export function scheduleMistake(puzzleId: string, now: string, timeZone?: string): ReviewQueueState {
  return scheduleMistakeForContext({ puzzleId, mode: "standard", ratingKey: "standard 5/20" }, now, undefined, timeZone);
}

export function scheduleMistakeForContext(
  context: ReviewContext,
  now: string,
  previous?: ReviewQueueState,
  timeZone?: string
): ReviewQueueState {
  const nowDate = new Date(now);
  if (Number.isNaN(nowDate.getTime())) {
    throw new Error("now must be a valid ISO timestamp");
  }
  const intervalDays = successIntervalAt(0);
  return {
    ...(previous ?? context),
    dueDay: addReviewDays(reviewDayFor(nowDate, timeZone), intervalDays),
    intervalDays,
    reviewCount: previous?.reviewCount ?? 0,
    successStreak: 0,
    lapseCount: previous?.lapseCount ?? 0,
    lastResult: "wrong",
    lastReviewedAt: nowDate.toISOString()
  };
}

export function reviewDueState(
  review: Pick<ReviewQueueState, "dueDay">,
  now: string | number | Date,
  timeZone?: string
): ReviewDueState {
  if (!isReviewDay(review.dueDay)) {
    return "future";
  }
  let today: string;
  try {
    today = reviewDayFor(now, timeZone);
  } catch {
    return "future";
  }
  const comparison = review.dueDay.localeCompare(today);
  return comparison < 0 ? "overdue" : comparison === 0 ? "due" : "future";
}

export function isReviewDue(
  review: Pick<ReviewQueueState, "dueDay">,
  now: string | number | Date,
  timeZone?: string
): boolean {
  return reviewDueState(review, now, timeZone) !== "future";
}

export function isReviewOverdue(
  review: Pick<ReviewQueueState, "dueDay">,
  now: string | number | Date,
  timeZone?: string
): boolean {
  return reviewDueState(review, now, timeZone) === "overdue";
}

export function reviewDayFor(now: string | number | Date, timeZone?: string): string {
  const date = now instanceof Date ? new Date(now) : new Date(now);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("now must be a valid date");
  }

  if (!timeZone) {
    const localDate = new Date(date);
    if (localDate.getHours() < REVIEW_DAY_ROLLOVER_HOUR) {
      localDate.setDate(localDate.getDate() - 1);
    }
    return localReviewDay(localDate.getFullYear(), localDate.getMonth() + 1, localDate.getDate());
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const year = datePart(parts, "year");
  const month = datePart(parts, "month");
  const day = datePart(parts, "day");
  const hour = Number(datePart(parts, "hour"));
  const localDay = `${year}-${month}-${day}`;
  return hour < REVIEW_DAY_ROLLOVER_HOUR ? addReviewDays(localDay, -1) : localDay;
}

export function addReviewDays(reviewDay: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new Error("review day offset must be an integer");
  }
  const parsed = parseReviewDay(reviewDay);
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  date.setUTCDate(date.getUTCDate() + days);
  return localReviewDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function isReviewDay(value: string): boolean {
  try {
    parseReviewDay(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the canonical actionable Review order without mutating the caller's
 * queue. Storage adapters may optimize their reads, but product ordering stays
 * shared so in-memory, SQLite, sync, and mobile surfaces cannot drift.
 */
export function orderReviewQueue(queue: readonly ReviewQueueState[]): ReviewQueueState[] {
  return [...queue].sort((left, right) =>
    left.dueDay.localeCompare(right.dueDay) ||
    left.puzzleId.localeCompare(right.puzzleId) ||
    left.mode.localeCompare(right.mode) ||
    left.ratingKey.localeCompare(right.ratingKey)
  );
}

export function reviewQueueForecast(
  queue: Array<Pick<ReviewQueueState, "dueDay">>,
  now: string | number | Date,
  timeZone?: string
): ReviewQueueForecast {
  const today = reviewDayFor(now, timeZone);
  const tomorrow = addReviewDays(today, 1);
  const seventhDay = addReviewDays(today, 7);
  const validDueDays = queue.map((review) => review.dueDay).filter(isReviewDay).sort();
  const result: ReviewQueueForecast = {
    todayCount: validDueDays.filter((dueDay) => dueDay <= today).length,
    tomorrowCount: validDueDays.filter((dueDay) => dueDay === tomorrow).length,
    nextSevenDaysCount: validDueDays.filter((dueDay) => dueDay >= tomorrow && dueDay <= seventhDay).length,
    overdueCount: validDueDays.filter((dueDay) => dueDay < today).length,
    totalCount: queue.length
  };
  const nextDueDay = validDueDays.find((dueDay) => dueDay > today);
  return nextDueDay ? { ...result, nextDueDay } : result;
}

function successIntervalAt(index: number): number {
  return SUCCESS_INTERVALS_DAYS[Math.min(index, SUCCESS_INTERVALS_DAYS.length - 1)] ?? SUCCESS_INTERVALS_DAYS[0]!;
}

function defaultReviewContext(): ReviewContext {
  return {
    puzzleId: "",
    mode: "standard",
    ratingKey: "standard 5/20"
  };
}

function datePart(parts: Intl.DateTimeFormatPart[], type: "year" | "month" | "day" | "hour"): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) {
    throw new Error(`Unable to determine local review ${type}`);
  }
  return value;
}

function localReviewDay(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseReviewDay(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("review day must use YYYY-MM-DD format");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error("review day must be a valid calendar date");
  }
  return { year, month, day };
}
