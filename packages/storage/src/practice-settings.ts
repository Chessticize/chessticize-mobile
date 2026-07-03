import type { PracticeSettings } from "./practice-store.ts";

export function defaultPracticeSettings(): PracticeSettings {
  return {
    sync: {
      iCloudEnabled: true,
      uploadAllowed: false
    },
    notifications: {
      reviewReminder: {
        mode: "smart"
      }
    }
  };
}

export function clonePracticeSettings(settings: PracticeSettings): PracticeSettings {
  return {
    sync: {
      iCloudEnabled: settings.sync.iCloudEnabled,
      uploadAllowed: settings.sync.uploadAllowed
    },
    notifications: {
      reviewReminder: {
        mode: settings.notifications.reviewReminder.mode,
        ...(settings.notifications.reviewReminder.fixedLocalTime === undefined
          ? {}
          : { fixedLocalTime: settings.notifications.reviewReminder.fixedLocalTime })
      }
    }
  };
}
