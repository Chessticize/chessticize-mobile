import {
  computeNextReminder,
  type AttemptEvent,
  type ReviewReminderDecision,
  type ReviewReminderUsageEntry
} from "../../../packages/core/src/index.ts";
import type { PracticeService } from "../../../packages/storage/src/practice-service.ts";

export function computeReviewReminderDecision(
  service: PracticeService,
  now: string | number | Date
): ReviewReminderDecision | undefined {
  const usage: ReviewReminderUsageEntry[] = (service.listHistory() as AttemptEvent[]).map((attempt) => ({
    startedAt: attempt.startedAt,
    sessionId: attempt.sessionId
  }));
  return computeNextReminder(
    service.listReviewQueue(),
    usage,
    service.getReviewReminderSettings(),
    now
  );
}

export function reminderScheduleKey(decision: ReviewReminderDecision | undefined): string {
  if (!decision) {
    return "none";
  }
  return `${decision.scheduledAt}|${decision.dueCount}|${decision.body}|${decision.route}`;
}
