import { NativeModules } from "react-native";
import {
  computeNextReminder,
  type AttemptEvent,
  type ReviewReminderDecision,
  type ReviewReminderUsageEntry
} from "../../../../packages/core/src/index.ts";
import type { PracticeService } from "../../../../packages/storage/src/practice-service.ts";

export interface ReviewReminderScheduleResult {
  scheduled: boolean;
  scheduledAt?: string;
}

export interface ReviewReminderScheduler {
  replaceNextReminder(decision: ReviewReminderDecision | undefined): Promise<ReviewReminderScheduleResult>;
}

type NativeReviewReminderNotificationsModule = {
  replaceNextReminder: (reminder: NativeReviewReminderPayload | null) => Promise<ReviewReminderScheduleResult>;
};

interface NativeReviewReminderPayload {
  scheduledAt: string;
  body: string;
  route: ReviewReminderDecision["route"];
  dueCount: number;
}

export class FakeReviewReminderScheduler implements ReviewReminderScheduler {
  readonly calls: Array<ReviewReminderDecision | undefined> = [];
  currentReminder: ReviewReminderDecision | undefined;

  async replaceNextReminder(decision: ReviewReminderDecision | undefined): Promise<ReviewReminderScheduleResult> {
    this.calls.push(decision ? { ...decision } : undefined);
    this.currentReminder = decision ? { ...decision } : undefined;
    if (!decision) {
      return { scheduled: false };
    }
    return { scheduled: true, scheduledAt: decision.scheduledAt };
  }
}

export function createNativeReviewReminderScheduler(): ReviewReminderScheduler | null {
  const nativeModule = NativeModules?.ReviewReminderNotifications as NativeReviewReminderNotificationsModule | undefined;
  if (!nativeModule || typeof nativeModule.replaceNextReminder !== "function") {
    return null;
  }
  return {
    replaceNextReminder: (decision) => nativeModule.replaceNextReminder(decision ? nativePayload(decision) : null)
  };
}

export async function rescheduleReviewReminder(
  service: PracticeService,
  scheduler: ReviewReminderScheduler,
  now: string | number | Date
): Promise<ReviewReminderDecision | undefined> {
  const decision = computeReviewReminderDecision(service, now);
  await scheduler.replaceNextReminder(decision);
  return decision;
}

export function computeReviewReminderDecision(
  service: PracticeService,
  now: string | number | Date
): ReviewReminderDecision | undefined {
  return computeNextReminder(
    service.listReviewQueue(),
    reminderUsageFromHistory(service.listHistory() as AttemptEvent[]),
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

function reminderUsageFromHistory(history: AttemptEvent[]): ReviewReminderUsageEntry[] {
  return history.map((attempt) => ({
    startedAt: attempt.startedAt,
    sessionId: attempt.sessionId
  }));
}

function nativePayload(decision: ReviewReminderDecision): NativeReviewReminderPayload {
  return {
    scheduledAt: decision.scheduledAt,
    body: decision.body,
    route: decision.route,
    dueCount: decision.dueCount
  };
}
