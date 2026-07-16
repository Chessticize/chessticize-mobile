import { NativeModules } from "react-native";
import {
  createNativeReviewReminderNotificationClient,
  createNativeReviewReminderScheduler,
  FakeReviewReminderNotificationClient,
  FakeReviewReminderScheduler,
  reminderScheduleKey,
  rescheduleReviewReminder
} from "../src/backend/reviewReminderScheduler";
import { createMobilePracticeService } from "../src/backend/mobilePractice";

describe("review reminder scheduler", () => {
  afterEach(() => {
    delete (NativeModules as Record<string, unknown>).ReviewReminderNotifications;
  });

  it("computes and replaces the next reminder through the scheduler port", async () => {
    const service = createMobilePracticeService("random1000");
    service.saveReviewReminderPreference({ mode: "fixed", fixedLocalTime: "08:15" });
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 15, maxMistakes: 3 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");

    const scheduler = new FakeReviewReminderScheduler();
    const decision = await rescheduleReviewReminder(service, scheduler, "2026-06-20T12:00:00.000Z");

    expect(decision).toMatchObject({
      dueCount: 1,
      body: "1 review is ready",
      route: "review"
    });
    expect(localTime(decision?.scheduledAt)).toEqual({ hour: 8, minute: 15 });
    expect(scheduler.currentReminder).toEqual(decision);
    expect(scheduler.calls).toEqual([decision]);
    expect(reminderScheduleKey(decision)).toContain("1 review is ready");
  });

  it("clears the pending reminder when settings disable reminders", async () => {
    const service = createMobilePracticeService("random1000");
    service.saveReviewReminderPreference({ mode: "off" });
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 15, maxMistakes: 3 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");

    const scheduler = new FakeReviewReminderScheduler();
    const decision = await rescheduleReviewReminder(service, scheduler, "2026-06-20T12:00:00.000Z");

    expect(decision).toBeUndefined();
    expect(scheduler.currentReminder).toBeUndefined();
    expect(scheduler.calls).toEqual([undefined]);
    expect(reminderScheduleKey(decision)).toBe("none");
  });

  it("wraps the native notification module without requesting permission", async () => {
    const nativeCalls: unknown[] = [];
    (NativeModules as Record<string, unknown>).ReviewReminderNotifications = {
      replaceNextReminder: jest.fn(async (payload: unknown) => {
        nativeCalls.push(payload);
        return { scheduled: true, scheduledAt: "2026-06-21T15:15:00.000Z" };
      })
    };

    const scheduler = createNativeReviewReminderScheduler();
    await expect(
      scheduler?.replaceNextReminder({
        scheduledAt: "2026-06-21T15:15:00.000Z",
        targetLocalDateTime: "2026-06-21T08:15",
        dueCount: 2,
        body: "2 reviews are ready",
        route: "review",
        workloadState: "due_today"
      })
    ).resolves.toEqual({ scheduled: true, scheduledAt: "2026-06-21T15:15:00.000Z" });
    await scheduler?.replaceNextReminder(undefined);

    expect(nativeCalls).toEqual([
      {
        scheduledAt: "2026-06-21T15:15:00.000Z",
        targetLocalDateTime: "2026-06-21T08:15",
        dueCount: 2,
        body: "2 reviews are ready",
        route: "review",
        workloadState: "due_today"
      },
      null
    ]);
  });

  it("wraps native notification permissions and review routing", async () => {
    const listeners = new Set<(route: string) => void>();
    const openSystemSettings = jest.fn(async () => {});
    const requestAuthorization = jest.fn()
      .mockResolvedValueOnce("not_determined")
      .mockResolvedValueOnce("denied")
      .mockResolvedValueOnce("authorized");
    (NativeModules as Record<string, unknown>).ReviewReminderNotifications = {
      replaceNextReminder: jest.fn(),
      getAuthorizationStatus: jest.fn(async () => "not_determined"),
      requestAuthorization,
      openSystemSettings,
      consumeInitialRoute: jest.fn(async () => "review"),
      __addListener: (_eventName: string, listener: (route: string) => void) => {
        listeners.add(listener);
        return {
          remove: () => listeners.delete(listener)
        };
      }
    };

    const client = createNativeReviewReminderNotificationClient();
    const routed: string[] = [];
    const unsubscribe = client?.addNotificationResponseListener((route) => routed.push(route));

    await expect(client?.getAuthorizationStatus()).resolves.toBe("not_determined");
    await expect(client?.requestAuthorization()).resolves.toBe("not_determined");
    await expect(client?.requestAuthorization()).resolves.toBe("denied");
    await expect(client?.requestAuthorization()).resolves.toBe("authorized");
    await expect(client?.consumeInitialRoute()).resolves.toBe("review");
    await expect(client?.openSystemSettings()).resolves.toBeUndefined();
    for (const listener of Array.from(listeners)) {
      listener("review");
      listener("unknown");
    }
    unsubscribe?.();

    expect(openSystemSettings).toHaveBeenCalledTimes(1);
    expect(requestAuthorization).toHaveBeenCalledTimes(3);
    expect(routed).toEqual(["review"]);
  });

  it("keeps the notification client fake observable without native modules", async () => {
    const client = new FakeReviewReminderNotificationClient("denied", "authorized");
    const routed: string[] = [];
    const unsubscribe = client.addNotificationResponseListener((route) => routed.push(route));

    await expect(client.getAuthorizationStatus()).resolves.toBe("denied");
    await expect(client.requestAuthorization()).resolves.toBe("authorized");
    client.setInitialRoute("review");
    await expect(client.consumeInitialRoute()).resolves.toBe("review");
    await expect(client.consumeInitialRoute()).resolves.toBeUndefined();
    client.emitRoute("review");
    unsubscribe();
    client.emitRoute("review");
    await client.openSystemSettings();

    expect(client.requestCount).toBe(1);
    expect(client.openSettingsCount).toBe(1);
    expect(routed).toEqual(["review"]);
  });
});

function localTime(iso: string | undefined): { hour: number; minute: number } {
  if (!iso) {
    throw new Error("expected scheduled reminder time");
  }
  const date = new Date(iso);
  return {
    hour: date.getHours(),
    minute: date.getMinutes()
  };
}
