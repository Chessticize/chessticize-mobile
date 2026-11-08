// Runs the real persistent service composition (DeviceSQLiteStore, the
// simulation profile, the iOS capabilities) over real SQLite files, with
// op-sqlite replaced by Node's SQLite behind the same synchronous contract.
// Each "process" re-requires the modules so module-level caches start fresh,
// like a JS reload.
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { DatabaseSync } from 'node:sqlite';
import { FakeProgressV2Transport, syncPracticeProgressV2 } from '../../../packages/storage/src/progress-sync-v2.ts';
import type { PracticeService } from '../../../packages/storage/src/practice-service.ts';
import type { MobilePlatformCapabilities } from '../src/platform/mobilePlatformCapabilities';

const mockCorePackPath = resolve(__dirname, '../../../fixtures/puzzles/bundled-core-pack.sqlite');
const mockOpenedNames: string[] = [];
const mockHandles: DatabaseSync[] = [];
const mockReload = jest.fn();
let mockRoot = '';

function mockOpenDatabase(options: { name: string; readOnly?: boolean }) {
  const { name } = options;
  mockOpenedNames.push(name);
  if (name.startsWith('bundled-core-pack')) {
    // The read-only Core Pack. Deleting an obsolete cache must never reach the fixture.
    const path = mockCorePackPath;
    const db = options.readOnly ? new DatabaseSync(path, { readOnly: true }) : undefined;
    if (db) {
      mockHandles.push(db);
    }
    return mockDatabase(db, path, false);
  }
  const path = join(mockRoot, name);
  const db = new DatabaseSync(path);
  mockHandles.push(db);
  return mockDatabase(db, path, true);
}

function mockDatabase(db: DatabaseSync | undefined, path: string, deletable: boolean) {
  return {
    executeSync(sql: string, params: unknown[] = []) {
      if (!db) {
        throw new Error('unexpected statement on a deleted-only database handle');
      }
      return { rows: db.prepare(sql).all(...(params as never[])) };
    },
    close() {
      db?.close();
    },
    delete() {
      if (!deletable) {
        return;
      }
      try {
        db?.close();
      } catch {
        // already closed
      }
      for (const suffix of ['', '-wal', '-shm']) {
        rmSync(`${path}${suffix}`, { force: true });
      }
    },
    getDbPath() {
      return path;
    },
  };
}

jest.mock('@op-engineering/op-sqlite', () => ({
  open: (options: { name: string; readOnly?: boolean }) => mockOpenDatabase(options),
}));

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return {
    ...actual,
    DevSettings: { reload: () => mockReload() },
    Platform: { ...actual.Platform, OS: 'ios' },
    NativeModules: {
      ApplicationMetadata: {
        versionName: '1.0.0',
        buildNumber: '1',
        bundleResourcePath: '/bundle',
      },
      ICloudProgressSync: {
        getAccountStatus: async () => 'available',
        ensureV2Zone: async () => undefined,
        fetchV2Changes: async () => ({}),
        modifyV2Records: async () => ({}),
        fetchV1Metadata: async () => ({}),
        fetchV1Snapshot: async () => ({}),
      },
    },
  };
});

const REAL_PROGRESS = 'chessticize-mobile.sqlite';
const REAL_CACHE = 'chessticize-tactical-profile-cache.sqlite';
const SIM_PROGRESS = 'chessticize-mobile-simulation.sqlite';
const SIM_CACHE = 'chessticize-tactical-profile-cache-simulation.sqlite';
const NOW = '2026-08-19T12:00:00.000Z';

type Process = {
  service: PracticeService;
  capabilities: MobilePlatformCapabilities;
  opened: string[];
};

function startProcess(): Process {
  // A process ending releases its database handles.
  for (const handle of mockHandles.splice(0)) {
    try {
      handle.close();
    } catch {
      // already closed by delete()
    }
  }
  mockOpenedNames.length = 0;
  let started: Process | undefined;
  jest.isolateModules(() => {
    const practice = require('../src/platform/mobilePractice');
    const ios = require('../src/platform/iosMobilePlatformCapabilities');
    const service = practice.createPersistentMobilePracticeServiceSync() as PracticeService | undefined;
    if (!service) {
      throw new Error('the persistent service could not be created');
    }
    started = {
      service,
      capabilities: ios.composeIOSMobilePlatformCapabilities(service),
      opened: [...mockOpenedNames],
    };
  });
  return started as Process;
}

const packAvailable = existsSync(mockCorePackPath);

describe('Dev simulation profile on the device composition', () => {
  beforeEach(() => {
    mockRoot = mkdtempSync(join(tmpdir(), 'chessticize-simulation-profile-'));
    mockReload.mockClear();
  });

  afterEach(() => {
    for (const handle of mockHandles.splice(0)) {
      try {
        handle.close();
      } catch {
        // already closed
      }
    }
    rmSync(mockRoot, { recursive: true, force: true });
  });

  it('leaves the real Dev progress untouched and brings it back when the switch is off', () => {
    const real = startProcess();
    expect(real.opened).toEqual(expect.arrayContaining([REAL_PROGRESS, REAL_CACHE]));
    expect(real.opened).not.toContain(SIM_PROGRESS);
    expect(real.capabilities.testControls?.simulationProfile?.active).toBe(false);
    expect(real.capabilities.progressSync.client).not.toBeNull();
    real.service.saveSettings({ ...real.service.getSettings(), appearance: 'dark' });
    const realICloudEnabled = real.service.getSettings().sync.iCloudEnabled;
    real.capabilities.testControls?.simulationProfile?.setActive(true);
    expect(mockReload).toHaveBeenCalledTimes(1);

    const simulated = startProcess();
    expect(simulated.opened).toEqual(expect.arrayContaining([SIM_PROGRESS, SIM_CACHE]));
    expect(simulated.opened).not.toContain(REAL_PROGRESS);
    expect(simulated.opened).not.toContain(REAL_CACHE);
    expect(simulated.capabilities.testControls?.simulationProfile?.active).toBe(true);
    // Fresh simulation progress, not the real settings.
    expect(simulated.service.getSettings().appearance).not.toBe('dark');
    simulated.service.saveSettings({ ...simulated.service.getSettings(), appearance: 'light' });
    simulated.capabilities.testControls?.simulationProfile?.setActive(false);

    const restored = startProcess();
    expect(restored.opened).not.toContain(SIM_PROGRESS);
    expect(restored.service.getSettings().appearance).toBe('dark');
    expect(restored.service.getSettings().sync.iCloudEnabled).toBe(realICloudEnabled);
    restored.capabilities.testControls?.simulationProfile?.setActive(true);

    const again = startProcess();
    expect(again.service.getSettings().appearance).toBe('light');
  });

  it('keeps iCloud off and never contacts CloudKit while simulation data is on', async () => {
    const real = startProcess();
    expect(real.service.getSettings().sync.iCloudEnabled).toBe(true);
    real.capabilities.testControls?.simulationProfile?.setActive(true);

    const simulated = startProcess();
    expect(simulated.service.getSettings().sync.iCloudEnabled).toBe(false);
    expect(simulated.capabilities.progressSync).toEqual({ client: null, diagnostics: null });
    expect(simulated.capabilities.reminders.scheduler).toBeNull();
    expect(simulated.capabilities.reminders.notificationClient).toBeNull();

    // Even a sync run handed a transport does nothing while iCloud is off.
    const cloudKit = new FakeProgressV2Transport();
    const result = await syncPracticeProgressV2(simulated.service, cloudKit, {
      now: () => NOW,
    } as never);
    expect(result.status).toBe('disabled');
    expect(cloudKit.zoneInitializationCount).toBe(0);
    expect(cloudKit.zoneChangeFetchCount).toBe(0);
    expect(cloudKit.modifyBatches).toEqual([]);
  });

  (packAvailable || process.env.CI ? describe : describe.skip)('scenario seeding', () => {
    it('replaces simulation data with a re-seeded scenario that equals a fresh seed', async () => {
      startProcess().capabilities.testControls?.simulationProfile?.setActive(true);

      const first = startProcess();
      const firstControls = first.capabilities.testControls;
      expect(first.service.countHistory()).toBe(0);
      const firstSeed = await firstControls?.seedTacticalHistory?.('slow-fork-speed', NOW);
      expect(firstSeed?.runs).toBe(12);
      const seededAttempts = first.service.countHistory();
      expect(seededAttempts).toBeGreaterThan(0);

      // Picking a scenario again: no confirmation, the data is replaced.
      firstControls?.simulationProfile?.replaceWithSeed('slow-fork-speed');
      const second = startProcess();
      expect(second.opened).not.toContain(REAL_PROGRESS);
      expect(second.service.countHistory()).toBe(0);
      const pending = second.capabilities.testControls?.simulationProfile?.takePendingSeed();
      expect(pending).toBe('slow-fork-speed');
      const secondSeed = await second.capabilities.testControls?.seedTacticalHistory?.(pending!, NOW);
      expect(second.service.countHistory()).toBe(seededAttempts);
      expect(secondSeed?.attempts).toBe(firstSeed?.attempts);
      expect(second.service.getSettings().sync.iCloudEnabled).toBe(false);

      // Clear removes the seeded data and leaves nothing to seed.
      second.capabilities.testControls?.simulationProfile?.clear();
      const cleared = startProcess();
      expect(cleared.service.countHistory()).toBe(0);
      expect(cleared.capabilities.testControls?.simulationProfile?.takePendingSeed()).toBeUndefined();
      expect(cleared.opened).not.toContain(REAL_PROGRESS);
    }, 60_000);
  });
});
