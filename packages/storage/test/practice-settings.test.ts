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
