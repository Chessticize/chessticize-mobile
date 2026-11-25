import test from "node:test";
import assert from "node:assert/strict";
import {
  clonePracticeSettings,
  defaultPracticeSettings
} from "../src/practice-settings.ts";
import type { PracticeSettings } from "../src/practice-store.ts";

test("move feedback settings default to sound off and haptics enabled", () => {
  assert.deepEqual(defaultPracticeSettings().moveFeedback, {
    soundEnabled: false,
    hapticsEnabled: true
  });
});

test("Arrow Duel opponent replies default on and legacy settings normalize to that default", () => {
  assert.deepEqual(defaultPracticeSettings().arrowDuel, {
    opponentReplyEnabled: true
  });

  const legacySettings = {
    sync: { iCloudEnabled: true },
    notifications: { reviewReminder: { mode: "smart" as const } },
    moveFeedback: {
      soundEnabled: false,
      hapticsEnabled: true
    },
    sprintGuides: defaultPracticeSettings().sprintGuides
  } as PracticeSettings;

  assert.deepEqual(clonePracticeSettings(legacySettings).arrowDuel, {
    opponentReplyEnabled: true
  });
});

test("Arrow Duel settings are cloned independently", () => {
  const settings = defaultPracticeSettings();
  settings.arrowDuel.opponentReplyEnabled = false;

  const cloned = clonePracticeSettings(settings);
  settings.arrowDuel.opponentReplyEnabled = true;

  assert.deepEqual(cloned.arrowDuel, {
    opponentReplyEnabled: false
  });
});

test("Sprint guide progress defaults unseen and legacy settings normalize safely", () => {
  assert.deepEqual(defaultPracticeSettings().sprintGuides, {
    rulesSeen: false,
    activeSessionSeen: false,
    arrowDuelSeen: false,
    focusedRunSeen: false,
    arrowDuelReplyCueStage: 0
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
    arrowDuelSeen: false,
    focusedRunSeen: false,
    arrowDuelReplyCueStage: 0
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
    arrowDuelSeen: false,
    focusedRunSeen: false,
    arrowDuelReplyCueStage: 0
  });
});

test("legacy settings without move feedback normalize to quiet haptic defaults", () => {
  const legacySettings = {
    sync: { iCloudEnabled: true },
    notifications: { reviewReminder: { mode: "smart" as const } }
  } as PracticeSettings;

  assert.deepEqual(clonePracticeSettings(legacySettings).moveFeedback, {
    soundEnabled: false,
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

test("appearance defaults to following the system and normalizes unknown values", () => {
  assert.equal(defaultPracticeSettings().appearance, "system");

  const legacySettings = {
    sync: { iCloudEnabled: true },
    notifications: { reviewReminder: { mode: "smart" as const } }
  } as PracticeSettings;
  assert.equal(clonePracticeSettings(legacySettings).appearance, "system");

  for (const appearance of ["light", "dark", "system"] as const) {
    assert.equal(
      clonePracticeSettings({ ...defaultPracticeSettings(), appearance }).appearance,
      appearance
    );
  }
  assert.equal(
    clonePracticeSettings({
      ...defaultPracticeSettings(),
      appearance: "sepia" as unknown as PracticeSettings["appearance"]
    }).appearance,
    "system"
  );
});

test("board color schemes and piece set default safely and normalize unknown values", () => {
  const defaults = defaultPracticeSettings();
  assert.equal(defaults.lightBoardTheme, "slate");
  assert.equal(defaults.darkBoardTheme, "graphite");
  assert.equal(defaults.pieceSet, "default");

  const legacySettings = {
    sync: { iCloudEnabled: true },
    notifications: { reviewReminder: { mode: "smart" as const } }
  } as PracticeSettings;
  const clonedLegacy = clonePracticeSettings(legacySettings);
  assert.equal(clonedLegacy.lightBoardTheme, "slate");
  assert.equal(clonedLegacy.darkBoardTheme, "graphite");
  assert.equal(clonedLegacy.pieceSet, "default");

  for (const boardTheme of [
    "slate",
    "graphite",
    "brown",
    "green",
    "blue",
    "deep-blue",
    "purple",
    "walnut",
    "forest"
  ] as const) {
    const cloned = clonePracticeSettings({
      ...defaults,
      lightBoardTheme: boardTheme,
      darkBoardTheme: boardTheme
    });
    assert.equal(cloned.lightBoardTheme, boardTheme);
    assert.equal(cloned.darkBoardTheme, boardTheme);
  }

  for (const pieceSet of [
    "default",
    "cburnett",
    "merida",
    "chessnut",
    "spatial",
    "fantasy"
  ] as const) {
    assert.equal(
      clonePracticeSettings({ ...defaults, pieceSet }).pieceSet,
      pieceSet
    );
  }

  const invalid = clonePracticeSettings({
    ...defaults,
    lightBoardTheme: "neon" as unknown as PracticeSettings["lightBoardTheme"],
    darkBoardTheme: "marble" as unknown as PracticeSettings["darkBoardTheme"],
    pieceSet: "horsey" as unknown as PracticeSettings["pieceSet"]
  });
  assert.equal(invalid.lightBoardTheme, "slate");
  assert.equal(invalid.darkBoardTheme, "graphite");
  assert.equal(invalid.pieceSet, "default");
});

test("language defaults to following the system and normalizes supported or unknown values", () => {
  assert.equal(defaultPracticeSettings().language, "system");

  const legacySettings = {
    sync: { iCloudEnabled: true },
    notifications: { reviewReminder: { mode: "smart" as const } }
  } as PracticeSettings;
  assert.equal(clonePracticeSettings(legacySettings).language, "system");

  for (const language of ["system", "en", "zh-Hans", "es", "de", "fr", "pt-BR"] as const) {
    assert.equal(
      clonePracticeSettings({ ...defaultPracticeSettings(), language }).language,
      language
    );
  }
  assert.equal(
    clonePracticeSettings({
      ...defaultPracticeSettings(),
      language: "pt-PT" as unknown as "en"
    }).language,
    "pt-BR"
  );
  assert.equal(
    clonePracticeSettings({
      ...defaultPracticeSettings(),
      language: "ja" as unknown as "en"
    }).language,
    "system"
  );
});
