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
  dueCount: number;
  body: string;
  route: "review";
}

const SMART_HISTORY_DAYS = 14;
const SMART_MIN_SESSIONS = 5;
const FALLBACK_REMINDER_HOUR = 19;
const FALLBACK_REMINDER_MINUTE = 0;

export function computeNextReminder(
  queue: Pick<ReviewQueueState, "dueAt">[],
  usageHistory: ReviewReminderUsageEntry[],
  settings: ReviewReminderSettings,
  now: string | number | Date
): ReviewReminderDecision | undefined {
  const nowDate = parseDate(now, "now");
  if (settings.kind === "off") {
    return undefined;
  }
  const dueTimes = queue
    .map((review) => new Date(review.dueAt).getTime())
    .filter(Number.isFinite);
  if (dueTimes.length === 0) {
    return undefined;
  }

  const reminderTime = reminderLocalTime(settings, usageHistory, nowDate);
  const latestDueTime = Math.max(...dueTimes);
  let candidate = nextLocalReminderAt(nowDate, reminderTime);
  const searchEnd = localReminderAt(new Date(latestDueTime), reminderTime);
  if (searchEnd.getTime() < latestDueTime) {
    searchEnd.setDate(searchEnd.getDate() + 1);
  }

  while (candidate.getTime() <= searchEnd.getTime()) {
    const dueCount = dueTimes.filter((dueAt) => dueAt <= candidate.getTime()).length;
    if (dueCount > 0) {
      return {
        scheduledAt: candidate.toISOString(),
        dueCount,
        body: `${dueCount} ${dueCount === 1 ? "puzzle is" : "puzzles are"} ready for review`,
        route: "review"
      };
    }
    candidate = addLocalDays(candidate, 1);
  }

  return undefined;
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
