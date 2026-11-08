process.env.TZ = "UTC";
import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { decideWhatsNewOnLaunch } from "../../core/src/index.ts";
import { CURRENT_SCHEMA_VERSION, PracticeService, SQLiteStore } from "../src/index.ts";

// How a launch of 1.6.0 tells an update from a fresh install, end to end through the
// real SQLite migration chain. The decision reads only what the database holds after
// migration: no recorded version, plus whether the user practiced here before.

const RELEASED_FIXTURES = {
  "iOS 1.0.0": resolve("packages/storage/test/fixtures/migrations/schema-v0-ios-1.0.0.sqlite"),
  "iOS 1.2.1": resolve("packages/storage/test/fixtures/migrations/schema-v8-ios-1.2.1.sqlite")
};

function launchDecision(service: PracticeService) {
  return decideWhatsNewOnLaunch({
    releaseVersion: "1.6.0",
    appVersion: "1.6.0",
    lastSeenVersion: service.getSettings().whatsNewSeenVersion,
    hasExistingProgress: service.hasPracticeActivity()
  });
}

for (const [label, fixture] of Object.entries(RELEASED_FIXTURES)) {
  test(`a user upgrading from the released ${label} database sees What's New on 1.6.0`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "chessticize-whats-new-upgrade-"));
    const databasePath = join(directory, "practice.sqlite");
    try {
      await copyFile(fixture, databasePath);
      const store = new SQLiteStore(databasePath);
      store.migrate();
      const service = new PracticeService(store);
      try {
        assert.equal(
          (store.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
          CURRENT_SCHEMA_VERSION
        );
        // The migration adds the column but never records a version for an existing user.
        assert.equal(service.getSettings().whatsNewSeenVersion, undefined);
        assert.equal(service.hasPracticeActivity(), true);
        assert.deepEqual(launchDecision(service), { show: true });
      } finally {
        store.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("a user whose database is at schema v23 with practice and no recorded version sees What's New", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-whats-new-v23-"));
  const databasePath = join(directory, "practice.sqlite");
  try {
    await copyFile(RELEASED_FIXTURES["iOS 1.2.1"], databasePath);
    const setup = new SQLiteStore(databasePath);
    setup.migrate();
    // Rebuild the schema-v23 shape: practice history stays, the column is gone.
    setup.db.exec("ALTER TABLE app_settings DROP COLUMN whats_new_seen_version");
    setup.db.exec("PRAGMA user_version = 23");
    setup.close();

    const store = new SQLiteStore(databasePath);
    store.migrate();
    try {
      assert.deepEqual(launchDecision(new PracticeService(store)), { show: true });
    } finally {
      store.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a brand-new database is a fresh install: nothing shown, the running version recorded", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-whats-new-fresh-"));
  try {
    const store = new SQLiteStore(join(directory, "practice.sqlite"));
    store.migrate();
    try {
      const service = new PracticeService(store);
      assert.equal(service.hasPracticeActivity(), false);
      assert.deepEqual(launchDecision(service), { show: false, recordSeenVersion: "1.6.0" });
    } finally {
      store.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a user who updated but never completed a puzzle looks like a fresh install, unless they got past a first-use guide", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-whats-new-idle-"));
  try {
    const store = new SQLiteStore(join(directory, "practice.sqlite"));
    store.migrate();
    try {
      const service = new PracticeService(store);
      // Opening the app creates the settings row; that alone is not activity.
      service.getSettings();
      assert.equal(service.hasPracticeActivity(), false);
      assert.deepEqual(launchDecision(service), { show: false, recordSeenVersion: "1.6.0" });

      const settings = service.getSettings();
      service.saveSettings({
        ...settings,
        sprintGuides: { ...settings.sprintGuides, rulesSeen: true }
      });
      assert.equal(service.hasPracticeActivity(), true);
    } finally {
      store.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
