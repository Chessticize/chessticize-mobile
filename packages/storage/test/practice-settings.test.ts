import test from "node:test";
import assert from "node:assert/strict";
import {
  clonePracticeSettings,
  defaultPracticeSettings
} from "../src/practice-settings.ts";
import type { PracticeSettings } from "../src/practice-store.ts";

test("move feedback settings default to sound and haptics enabled", () => {
  assert.deepEqual(defaultPracticeSettings().moveFeedback, {
    soundEnabled: true,
    hapticsEnabled: true
  });
});

test("Sprint guide progress defaults unseen and legacy settings normalize safely", () => {
  assert.deepEqual(defaultPracticeSettings().sprintGuides, {
    rulesSeen: false,
    activeSessionSeen: false,
    arrowDuelSeen: false
  });

  const legacySettings = {
    sync: { iCloudEnabled: true },
    notifications: { reviewReminder: { mode: "smart" as const } },
    moveFeedback: {
      soundEnabled: true,
      hapticsEnabled: true
    }
  } as PracticeSettings;

  assert.deepEqual(clonePracticeSettings(legacySettings).sprintGuides, {
    rulesSeen: false,
    activeSessionSeen: false,
    arrowDuelSeen: false
  });
});

test("Sprint guide progress is cloned independently", () => {
  const settings = defaultPracticeSettings();
  settings.sprintGuides.rulesSeen = true;

  const cloned = clonePracticeSettings(settings);
  settings.sprintGuides.activeSessionSeen = true;

  assert.deepEqual(cloned.sprintGuides, {
    rulesSeen: true,
    activeSessionSeen: false,
    arrowDuelSeen: false
  });
});

test("legacy settings without move feedback normalize to enabled defaults", () => {
  const legacySettings = {
    sync: { iCloudEnabled: true },
    notifications: { reviewReminder: { mode: "smart" as const } }
  } as PracticeSettings;

  assert.deepEqual(clonePracticeSettings(legacySettings).moveFeedback, {
    soundEnabled: true,
    hapticsEnabled: true
  });
});

test("move feedback settings are cloned independently", () => {
  const settings = defaultPracticeSettings();
  settings.moveFeedback.soundEnabled = false;

  const cloned = clonePracticeSettings(settings);
  settings.moveFeedback.hapticsEnabled = false;

  assert.deepEqual(cloned.moveFeedback, {
    soundEnabled: false,
    hapticsEnabled: true
  });
});
