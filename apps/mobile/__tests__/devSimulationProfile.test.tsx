import { DatabaseSync } from 'node:sqlite';
import {
  MemorySimulationProfileStateStore,
  SQLiteSimulationProfileStateStore,
  SimulationProfile,
  SIMULATION_PROGRESS_DATABASE_NAME,
  SIMULATION_TACTICAL_PROFILE_CACHE_DATABASE_NAME,
  type SimulationProfileHost,
  type SimulationProfileStateStore,
} from '../src/platform/devSimulationProfile';
import { MemoryStore } from '../../../packages/storage/src/memory-store.ts';
import { MemoryTacticalProfileRepository } from '../../../packages/storage/src/tactical-profile-repository.ts';
import {
  composePackBackedMobilePracticeService,
  createMobilePracticeTestControls,
  isSimulationProfileService,
} from '../src/platform/mobilePractice';
import { MOBILE_DATABASE_LAYOUT } from '../src/backend/mobileDatabaseLayout';
import { nodeSyncSqliteDatabase } from '../src/testing/nodeSqliteDatabase';

function fakeHost(): SimulationProfileHost & { reloads: number; deletions: number } {
  const host = {
    reloads: 0,
    deletions: 0,
    reload() {
      host.reloads += 1;
    },
    deleteSimulationDatabases() {
      host.deletions += 1;
    },
  };
  return host;
}

describe('Dev simulation profile', () => {
  it('uses databases that are distinct from the real Dev progress', () => {
    expect(SIMULATION_PROGRESS_DATABASE_NAME).not.toBe(MOBILE_DATABASE_LAYOUT.progressDatabaseName);
    expect(SIMULATION_TACTICAL_PROFILE_CACHE_DATABASE_NAME).not.toBe(
      MOBILE_DATABASE_LAYOUT.tacticalProfileCacheDatabaseName,
    );
  });

  it('persists the switch and reloads so the service reopens on the chosen databases', () => {
    const store = new MemorySimulationProfileStateStore();
    const host = fakeHost();
    const firstRun = new SimulationProfile(store, host);
    const controls = firstRun.controls();
    expect(controls.active).toBe(false);

    controls.setActive(true);
    expect(host.reloads).toBe(1);

    const secondRun = new SimulationProfile(store, host);
    expect(secondRun.controls().active).toBe(true);
    secondRun.controls().setActive(false);
    expect(host.reloads).toBe(2);
    expect(new SimulationProfile(store, host).controls().active).toBe(false);
    // Switching never deletes anything: the simulation data comes back later.
    expect(host.deletions).toBe(0);
  });

  it('keeps the process on the databases it started with when the switch changes', () => {
    const store = new MemorySimulationProfileStateStore();
    const profile = new SimulationProfile(store, fakeHost());
    const controls = profile.controls();
    controls.setActive(true);
    expect(controls.active).toBe(false);
    expect(profile.prepareStartup()).toBe(false);
  });

  it('deletes only the simulation databases for a pending clear, before they are opened', () => {
    const store = new MemorySimulationProfileStateStore();
    const host = fakeHost();
    new SimulationProfile(store, host).controls().clear();
    expect(host.deletions).toBe(0);

    const restarted = new SimulationProfile(store, host);
    expect(restarted.prepareStartup()).toBe(true);
    expect(host.deletions).toBe(1);
    // Consumed: a later start does not delete the freshly created data.
    expect(new SimulationProfile(store, host).prepareStartup()).toBe(true);
    expect(host.deletions).toBe(1);
  });

  it('replaces simulation data with a scenario and hands the request over once', () => {
    const store = new MemorySimulationProfileStateStore();
    const host = fakeHost();
    new SimulationProfile(store, host).controls().replaceWithSeed('slow-fork-speed');
    expect(host.reloads).toBe(1);

    const restarted = new SimulationProfile(store, host);
    const controls = restarted.controls();
    expect(host.deletions).toBe(1);
    expect(controls.takePendingSeed()).toBe('slow-fork-speed');
    expect(controls.takePendingSeed()).toBeUndefined();
  });

  it('falls back to the real databases when the stored choice cannot be read', () => {
    const unreadable: SimulationProfileStateStore = {
      read() {
        throw new Error('state database is unavailable');
      },
      write() {},
    };
    const host = fakeHost();
    expect(new SimulationProfile(unreadable, host).prepareStartup()).toBe(false);
    expect(host.deletions).toBe(0);
  });

  it('stores the choice in SQLite across reopenings', () => {
    const db = new DatabaseSync(':memory:');
    try {
      const adapter = nodeSyncSqliteDatabase(db);
      new SQLiteSimulationProfileStateStore(adapter).write({
        enabled: true,
        resetPending: true,
        pendingSeed: 'balanced',
      });
      expect(new SQLiteSimulationProfileStateStore(adapter).read()).toEqual({
        enabled: true,
        resetPending: true,
        pendingSeed: 'balanced',
      });
      new SQLiteSimulationProfileStateStore(adapter).write({ enabled: false, resetPending: false });
      expect(new SQLiteSimulationProfileStateStore(adapter).read()).toEqual({
        enabled: false,
        resetPending: false,
      });
    } finally {
      db.close();
    }
  });
});

describe('Dev simulation profile service composition', () => {
  type DevGlobals = typeof globalThis & {
    __CHESSTICIZE_ENABLE_TEST_CONTROLS__?: boolean;
    __DEV__?: boolean;
  };
  const globals = globalThis as DevGlobals;
  const previousDev = globals.__DEV__;
  const previousTestControls = globals.__CHESSTICIZE_ENABLE_TEST_CONTROLS__;

  afterEach(() => {
    globals.__DEV__ = previousDev;
    globals.__CHESSTICIZE_ENABLE_TEST_CONTROLS__ = previousTestControls;
  });

  function composeSimulated(active: boolean) {
    const controls = new SimulationProfile(
      new MemorySimulationProfileStateStore(),
      fakeHost(),
    ).controls();
    return composePackBackedMobilePracticeService(
      new MemoryStore(),
      new MemoryStore(),
      new MemoryTacticalProfileRepository(),
      { controls, active },
    );
  }

  it('turns iCloud sync off before the service is used while simulation data is active', () => {
    const service = composeSimulated(true);

    expect(isSimulationProfileService(service)).toBe(true);
    expect(service.getSettings().sync.iCloudEnabled).toBe(false);
  });

  it('leaves sync settings alone when the real databases are open', () => {
    const service = composeSimulated(false);

    expect(isSimulationProfileService(service)).toBe(false);
    expect(service.getSettings().sync.iCloudEnabled).toBe(true);
  });

  it('exposes the controls in a Dev build and never in a Release configuration', () => {
    const service = composeSimulated(true);
    globals.__CHESSTICIZE_ENABLE_TEST_CONTROLS__ = true;

    globals.__DEV__ = true;
    expect(createMobilePracticeTestControls(service)?.simulationProfile).toBeDefined();

    globals.__DEV__ = false;
    expect(createMobilePracticeTestControls(service)?.simulationProfile).toBeUndefined();
    expect(createMobilePracticeTestControls(service)?.seedTacticalHistory).toBeUndefined();
  });
});
