import { NativeEventEmitter, NativeModules } from "react-native";
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

export type ReviewReminderPermissionStatus =
  | "not_determined"
  | "authorized"
  | "denied"
  | "channel_disabled"
  | "unavailable";
export type ReviewReminderNotificationRoute = "review";

export interface ReviewReminderNotificationClient {
  getAuthorizationStatus(): Promise<ReviewReminderPermissionStatus>;
  requestAuthorization(): Promise<ReviewReminderPermissionStatus>;
  openSystemSettings(): Promise<void>;
  consumeInitialRoute(): Promise<ReviewReminderNotificationRoute | undefined>;
  addNotificationResponseListener(listener: (route: ReviewReminderNotificationRoute) => void): () => void;
}

type NativeReviewReminderNotificationsModule = {
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
  replaceNextReminder: (reminder: NativeReviewReminderPayload | null) => Promise<ReviewReminderScheduleResult>;
  getAuthorizationStatus?: () => Promise<string>;
  requestAuthorization?: () => Promise<string>;
  openSystemSettings?: () => Promise<void>;
  consumeInitialRoute?: () => Promise<string | null | undefined>;
};

interface NativeReviewReminderPayload {
  scheduledAt: string;
  targetLocalDateTime: string;
  body: string;
  route: ReviewReminderDecision["route"];
  dueCount: number;
  workloadState: ReviewReminderDecision["workloadState"];
}

export class FakeReviewReminderScheduler implements ReviewReminderScheduler {
  readonly calls: Array<ReviewReminderDecision | undefined> = [];
  currentReminder: ReviewReminderDecision | undefined;
  private failure: Error | undefined;

  async replaceNextReminder(decision: ReviewReminderDecision | undefined): Promise<ReviewReminderScheduleResult> {
    this.calls.push(decision ? { ...decision } : undefined);
    this.currentReminder = decision ? { ...decision } : undefined;
    if (this.failure) {
      throw this.failure;
    }
    if (!decision) {
      return { scheduled: false };
    }
    return { scheduled: true, scheduledAt: decision.scheduledAt };
  }

  setFailure(failure: Error | undefined): void {
    this.failure = failure;
  }
}

export class FakeReviewReminderNotificationClient implements ReviewReminderNotificationClient {
  requestCount = 0;
  openSettingsCount = 0;
  private listeners = new Set<(route: ReviewReminderNotificationRoute) => void>();
  private initialRoute: ReviewReminderNotificationRoute | undefined;
  private openSettingsFailure: Error | undefined;

  constructor(
    private status: ReviewReminderPermissionStatus = "not_determined",
    private requestedStatus: ReviewReminderPermissionStatus = "authorized"
  ) {}

  async getAuthorizationStatus(): Promise<ReviewReminderPermissionStatus> {
    return this.status;
  }

  async requestAuthorization(): Promise<ReviewReminderPermissionStatus> {
    this.requestCount += 1;
    this.status = this.requestedStatus;
    return this.status;
  }

  async openSystemSettings(): Promise<void> {
    this.openSettingsCount += 1;
    if (this.openSettingsFailure) {
      throw this.openSettingsFailure;
    }
  }

  async consumeInitialRoute(): Promise<ReviewReminderNotificationRoute | undefined> {
    const route = this.initialRoute;
    this.initialRoute = undefined;
    return route;
  }

  addNotificationResponseListener(listener: (route: ReviewReminderNotificationRoute) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setAuthorizationStatus(status: ReviewReminderPermissionStatus): void {
    this.status = status;
  }

  setRequestedStatus(status: ReviewReminderPermissionStatus): void {
    this.requestedStatus = status;
  }

  setOpenSettingsFailure(failure: Error | undefined): void {
    this.openSettingsFailure = failure;
  }

  setInitialRoute(route: ReviewReminderNotificationRoute | undefined): void {
    this.initialRoute = route;
  }

  emitRoute(route: ReviewReminderNotificationRoute): void {
    for (const listener of Array.from(this.listeners)) {
      listener(route);
    }
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

export function createNativeReviewReminderNotificationClient(): ReviewReminderNotificationClient | null {
  const nativeModule = NativeModules?.ReviewReminderNotifications as NativeReviewReminderNotificationsModule | undefined;
  if (
    !nativeModule ||
    typeof nativeModule.getAuthorizationStatus !== "function" ||
    typeof nativeModule.requestAuthorization !== "function" ||
    typeof nativeModule.openSystemSettings !== "function" ||
    typeof nativeModule.consumeInitialRoute !== "function"
  ) {
    return null;
  }
  const eventEmitter = new NativeEventEmitter(nativeModule);
  return {
    getAuthorizationStatus: async () => normalizePermissionStatus(await nativeModule.getAuthorizationStatus?.()),
    requestAuthorization: async () => normalizePermissionStatus(await nativeModule.requestAuthorization?.()),
    openSystemSettings: async () => {
      await nativeModule.openSystemSettings?.();
    },
    consumeInitialRoute: async () => normalizeNotificationRoute(await nativeModule.consumeInitialRoute?.()),
    addNotificationResponseListener: (listener) => {
      const subscription = eventEmitter.addListener("ReviewReminderNotificationRoute", (route: unknown) => {
        const normalized = normalizeNotificationRoute(route);
        if (normalized) {
          listener(normalized);
        }
      });
      return () => {
        subscription.remove();
      };
    }
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
    targetLocalDateTime: decision.targetLocalDateTime,
    body: decision.body,
    route: decision.route,
    dueCount: decision.dueCount,
    workloadState: decision.workloadState
  };
}

function normalizePermissionStatus(status: unknown): ReviewReminderPermissionStatus {
  switch (status) {
    case "not_determined":
    case "notDetermined":
      return "not_determined";
    case "authorized":
    case "provisional":
    case "ephemeral":
      return "authorized";
    case "denied":
      return "denied";
    case "channel_disabled":
      return "channel_disabled";
    default:
      return "unavailable";
  }
}

function normalizeNotificationRoute(route: unknown): ReviewReminderNotificationRoute | undefined {
  return route === "review" ? "review" : undefined;
}
