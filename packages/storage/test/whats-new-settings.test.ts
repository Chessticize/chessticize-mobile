import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../src/memory-store.ts";
import { PracticeService } from "../src/practice-service.ts";
import { clonePracticeSettings, defaultPracticeSettings } from "../src/practice-settings.ts";

test("the What's New seen version is absent by default and normalizes unreadable values away", () => {
  assert.equal("whatsNewSeenVersion" in defaultPracticeSettings(), false);
  assert.equal("whatsNewSeenVersion" in clonePracticeSettings(defaultPracticeSettings()), false);

  assert.equal(
    clonePracticeSettings({ ...defaultPracticeSettings(), whatsNewSeenVersion: " 1.6.0 " }).whatsNewSeenVersion,
    "1.6.0"
  );
  for (const unreadable of ["", "latest", "v1.6.0", 7, null]) {
    const cloned = clonePracticeSettings({
      ...defaultPracticeSettings(),
      whatsNewSeenVersion: unreadable as unknown as string
    });
    assert.equal("whatsNewSeenVersion" in cloned, false, String(unreadable));
  }
});

test("PracticeService keeps the What's New seen version when other settings change", () => {
  const service = new PracticeService(new MemoryStore());
  assert.equal(service.getSettings().whatsNewSeenVersion, undefined);

  service.saveSettings({ ...service.getSettings(), whatsNewSeenVersion: "1.5.3" });
  service.saveSettings({ ...service.getSettings(), appearance: "light" });

  assert.equal(service.getSettings().whatsNewSeenVersion, "1.5.3");
  assert.equal(service.exportLocalData().settings.whatsNewSeenVersion, "1.5.3");
});

test("importing local data never overwrites this device's What's New seen version", () => {
  const source = new PracticeService(new MemoryStore());
  source.saveSettings({ ...source.getSettings(), whatsNewSeenVersion: "1.4.0" });
  const exported = source.exportLocalData();

  const target = new PracticeService(new MemoryStore());
  target.saveSettings({ ...target.getSettings(), whatsNewSeenVersion: "1.6.0" });
  target.importLocalData(exported);

  assert.equal(target.getSettings().whatsNewSeenVersion, "1.6.0");
});

test("device-local 2.0 onboarding flags default to false, persist across settings saves, and are not overwritten by import", () => {
  const source = new PracticeService(new MemoryStore());
  assert.deepEqual(source.getSettings().onboarding, {
    welcomeSeen: false,
    gamesGuideSeen: false,
    gameReviewGuideSeen: false
  });
  source.saveSettings({
    ...source.getSettings(),
    onboarding: { welcomeSeen: true, gamesGuideSeen: true, gameReviewGuideSeen: false }
  });
  source.saveSettings({ ...source.getSettings(), appearance: "dark" });
  assert.deepEqual(source.getSettings().onboarding, {
    welcomeSeen: true,
    gamesGuideSeen: true,
    gameReviewGuideSeen: false
  });

  const exported = source.exportLocalData();
  const target = new PracticeService(new MemoryStore());
  target.saveSettings({
    ...target.getSettings(),
    onboarding: { welcomeSeen: false, gamesGuideSeen: false, gameReviewGuideSeen: true }
  });
  target.importLocalData(exported);
  assert.deepEqual(target.getSettings().onboarding, {
    welcomeSeen: false,
    gamesGuideSeen: false,
    gameReviewGuideSeen: true
  });
});
