import {
  defaultSprintGuideProgress,
  type ReviewReminderSettings
} from "../../core/src/index.ts";
import type { PracticeSettings, ReviewReminderPreference } from "./practice-store.ts";

export function defaultPracticeSettings(): PracticeSettings {
  return {
    sync: {
      iCloudEnabled: true
    },
    notifications: {
      reviewReminder: {
        mode: "smart"
      }
    },
    moveFeedback: {
      soundEnabled: true,
      hapticsEnabled: true
    },
    sprintGuides: defaultSprintGuideProgress()
  };
}

export function clonePracticeSettings(settings: PracticeSettings): PracticeSettings {
  return normalizePracticeSettings({
    sync: {
      iCloudEnabled: settings.sync.iCloudEnabled
    },
    notifications: {
      reviewReminder: settings.notifications.reviewReminder
    },
    moveFeedback: {
      soundEnabled: settings.moveFeedback?.soundEnabled ?? true,
      hapticsEnabled: settings.moveFeedback?.hapticsEnabled ?? true
    },
    sprintGuides: {
      rulesSeen: settings.sprintGuides?.rulesSeen ?? false,
      activeSessionSeen: settings.sprintGuides?.activeSessionSeen ?? false,
      arrowDuelSeen: settings.sprintGuides?.arrowDuelSeen ?? false,
      focusedRunSeen: settings.sprintGuides?.focusedRunSeen ?? false
    }
  });
}

export function normalizePracticeSettings(settings: PracticeSettings): PracticeSettings {
  return {
    sync: {
      iCloudEnabled: Boolean(settings.sync.iCloudEnabled)
    },
    notifications: {
      reviewReminder: normalizeReviewReminderPreference(settings.notifications.reviewReminder)
    },
    moveFeedback: {
      soundEnabled: settings.moveFeedback?.soundEnabled ?? true,
      hapticsEnabled: settings.moveFeedback?.hapticsEnabled ?? true
    },
    sprintGuides: {
      rulesSeen: settings.sprintGuides?.rulesSeen ?? false,
      activeSessionSeen: settings.sprintGuides?.activeSessionSeen ?? false,
      arrowDuelSeen: settings.sprintGuides?.arrowDuelSeen ?? false,
      focusedRunSeen: settings.sprintGuides?.focusedRunSeen ?? false
    }
  };
}

export function normalizeReviewReminderPreference(preference: ReviewReminderPreference): ReviewReminderPreference {
  if (preference.mode === "smart" || preference.mode === "off") {
    return { mode: preference.mode };
  }
  if (preference.mode === "fixed") {
    parseFixedLocalTime(preference.fixedLocalTime);
    return {
      mode: "fixed",
      fixedLocalTime: preference.fixedLocalTime
    };
  }
  throw new Error("review reminder mode must be smart, fixed, or off");
}

export function reviewReminderPreferenceToSettings(preference: ReviewReminderPreference): ReviewReminderSettings {
  const normalized = normalizeReviewReminderPreference(preference);
  if (normalized.mode === "smart" || normalized.mode === "off") {
    return {
      kind: normalized.mode
    };
  }
  const parsed = parseFixedLocalTime(normalized.fixedLocalTime);
  return {
    kind: "fixed",
    hour: parsed.hour,
    minute: parsed.minute
  };
}

function parseFixedLocalTime(value: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    throw new Error("fixed review reminder time must use HH:mm in 24-hour local time");
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  };
}
