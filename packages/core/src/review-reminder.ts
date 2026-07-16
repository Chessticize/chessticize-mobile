import { isReviewDay, reviewDayFor } from "./review-scheduler.ts";
import type { ReviewQueueState } from "./types.ts";

export type ReviewReminderSettings =
  | { kind: "off" }
  | { kind: "smart" }
  | { kind: "fixed"; hour: number; minute: number };

export interface ReviewReminderUsageEntry {
  startedAt: string;
  sessionId?: string;
}

export interface ReviewReminderDecision {
  scheduledAt: string;
  /** Local wall-clock target retained so platform adapters can rebuild after timezone changes. */
  targetLocalDateTime: string;
  dueCount: number;
  body: string;
  route: "review";
  workloadState: "due_today" | "future" | "overdue";
}

const SMART_HISTORY_DAYS = 14;
const SMART_MIN_SESSIONS = 5;
const FALLBACK_REMINDER_HOUR = 19;
const FALLBACK_REMINDER_MINUTE = 0;

export function computeNextReminder(
  queue: Pick<ReviewQueueState, "dueDay">[],
  usageHistory: ReviewReminderUsageEntry[],
  settings: ReviewReminderSettings,
  now: string | number | Date
): ReviewReminderDecision | undefined {
  const nowDate = parseDate(now, "now");
  if (settings.kind === "off") {
    return undefined;
  }
  const dueDays = queue.map((review) => review.dueDay).filter(isReviewDay).sort();
  if (dueDays.length === 0) {
    return undefined;
  }

  const reminderTime = reminderLocalTime(settings, usageHistory, nowDate);
  const today = reviewDayFor(nowDate);
  const workloadState = dueDays.some((dueDay) => dueDay < today)
    ? "overdue"
    : dueDays.some((dueDay) => dueDay === today)
      ? "due_today"
      : "future";
  const latestDueDay = dueDays[dueDays.length - 1]!;
  let candidate = nextLocalReminderAt(nowDate, reminderTime);
  while (true) {
    const candidateReviewDay = reviewDayFor(candidate);
    const dueCount = dueDays.filter((dueDay) => dueDay <= candidateReviewDay).length;
    if (dueCount > 0) {
      return {
        scheduledAt: candidate.toISOString(),
        targetLocalDateTime: localDateTime(candidate),
        dueCount,
        body: `${dueCount} ${dueCount === 1 ? "review is" : "reviews are"} ready`,
        route: "review",
        workloadState
      };
    }
    if (candidateReviewDay >= latestDueDay) {
      return undefined;
    }
    candidate = addLocalDays(candidate, 1);
  }
}

function localDateTime(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-") + `T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function reminderLocalTime(
  settings: ReviewReminderSettings,
  usageHistory: ReviewReminderUsageEntry[],
  now: Date
): { hour: number; minute: number } {
  if (settings.kind === "fixed") {
    validateReminderTime(settings.hour, settings.minute);
    return { hour: settings.hour, minute: settings.minute };
  }

  const smartHour = smartReminderHour(usageHistory, now);
  return {
    hour: smartHour ?? FALLBACK_REMINDER_HOUR,
    minute: FALLBACK_REMINDER_MINUTE
  };
}

function smartReminderHour(usageHistory: ReviewReminderUsageEntry[], now: Date): number | undefined {
  const windowStartMs = now.getTime() - SMART_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const startsBySession = new Map<string, Date>();

  usageHistory.forEach((entry, index) => {
    const startedAt = new Date(entry.startedAt);
    const startedAtMs = startedAt.getTime();
    if (!Number.isFinite(startedAtMs) || startedAtMs < windowStartMs || startedAtMs > now.getTime()) {
      return;
    }
    const key = entry.sessionId?.trim() ? `session:${entry.sessionId.trim()}` : `entry:${index}`;
    const existing = startsBySession.get(key);
    if (!existing || startedAtMs < existing.getTime()) {
      startsBySession.set(key, startedAt);
    }
  });

  if (startsBySession.size < SMART_MIN_SESSIONS) {
    return undefined;
  }

  const hours = [...startsBySession.values()].map((date) => date.getHours()).sort((a, b) => a - b);
  return hours[Math.floor(hours.length / 2)];
}

function nextLocalReminderAt(now: Date, reminderTime: { hour: number; minute: number }): Date {
  const candidate = localReminderAt(now, reminderTime);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

function localReminderAt(day: Date, reminderTime: { hour: number; minute: number }): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    reminderTime.hour,
    reminderTime.minute,
    0,
    0
  );
}

function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function validateReminderTime(hour: number, minute: number): void {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("fixed reminder hour must be an integer from 0 to 23");
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error("fixed reminder minute must be an integer from 0 to 59");
  }
}

function parseDate(value: string | number | Date, label: string): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`${label} must be a valid date`);
  }
  return date;
}
