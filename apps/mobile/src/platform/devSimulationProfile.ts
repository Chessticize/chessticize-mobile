// Dev-only simulation profile. mobilePractice.ts requires this module only
// behind a literal `__DEV__` check, so Release (Production identity) bundles
// never contain it. While the profile is on, the app opens a SEPARATE local
// progress database (and Tactical Profile cache) under the Dev identity, so
// seeded simulated history never touches the owner's real Dev progress.
// Turning it on or off persists the choice and reloads the JS runtime, which
// reopens the whole service composition cleanly.
import type { SyncSqliteDatabase } from "../../../../packages/storage/src/sync-sqlite-store.ts";
import {
  SIMULATED_HISTORY_SCENARIOS,
  type SimulatedHistoryScenarioId
} from "../../../../packages/storage/src/simulation/scenarios.ts";

export const SIMULATION_PROGRESS_DATABASE_NAME = "chessticize-mobile-simulation.sqlite";
export const SIMULATION_TACTICAL_PROFILE_CACHE_DATABASE_NAME =
  "chessticize-tactical-profile-cache-simulation.sqlite";
/** Dev-only device storage for the choice itself; never holds progress. */
export const SIMULATION_PROFILE_STATE_DATABASE_NAME = "chessticize-dev-simulation-profile.sqlite";

export type SimulationProfileState = {
  enabled: boolean;
  /** Delete the simulation databases before they are next opened. */
  resetPending: boolean;
  /** Seed this scenario into the fresh simulation database after the next start. */
  pendingSeed?: SimulatedHistoryScenarioId;
};

export interface SimulationProfileStateStore {
  read(): SimulationProfileState;
  write(state: SimulationProfileState): void;
}

export interface SimulationProfileHost {
  /** Restarts the JS runtime so the service composition is reopened. */
  reload(): void;
  /** Deletes the simulation progress and Tactical Profile cache databases. */
  deleteSimulationDatabases(): void;
}

export interface DevSimulationProfileControls {
  /** Whether this process is running on the simulation databases. */
  readonly active: boolean;
  /** Persists the choice and reloads; the real databases are never opened or changed. */
  setActive(enabled: boolean): void;
  /** Deletes the simulation data on the next start, then reloads. */
  clear(): void;
  /** Replaces the simulation data with a freshly seeded scenario, then reloads. */
  replaceWithSeed(scenario: SimulatedHistoryScenarioId): void;
  /** The scenario requested before the reload, consumed once the fresh database is open. */
  takePendingSeed(): SimulatedHistoryScenarioId | undefined;
}

const INACTIVE_STATE: SimulationProfileState = { enabled: false, resetPending: false };

export class MemorySimulationProfileStateStore implements SimulationProfileStateStore {
  private state: SimulationProfileState = INACTIVE_STATE;

  read(): SimulationProfileState {
    return this.state;
  }

  write(state: SimulationProfileState): void {
    this.state = state;
  }
}

export class SQLiteSimulationProfileStateStore implements SimulationProfileStateStore {
  private readonly db: SyncSqliteDatabase;

  constructor(db: SyncSqliteDatabase) {
    this.db = db;
    db.exec(
      `CREATE TABLE IF NOT EXISTS simulation_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER NOT NULL,
        reset_pending INTEGER NOT NULL,
        pending_seed TEXT
      )`
    );
  }

  read(): SimulationProfileState {
    const row = this.db
      .prepare("SELECT enabled, reset_pending, pending_seed FROM simulation_profile WHERE id = 1")
      .get() as { enabled: number; reset_pending: number; pending_seed: string | null } | undefined;
    if (!row) {
      return INACTIVE_STATE;
    }
    const pendingSeed = isScenario(row.pending_seed) ? row.pending_seed : undefined;
    return {
      enabled: row.enabled === 1,
      resetPending: row.reset_pending === 1,
      ...(pendingSeed === undefined ? {} : { pendingSeed })
    };
  }

  write(state: SimulationProfileState): void {
    this.db
      .prepare(
        `INSERT INTO simulation_profile (id, enabled, reset_pending, pending_seed)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           enabled = excluded.enabled,
           reset_pending = excluded.reset_pending,
           pending_seed = excluded.pending_seed`
      )
      .run(state.enabled ? 1 : 0, state.resetPending ? 1 : 0, state.pendingSeed ?? null);
  }
}

export class SimulationProfile {
  private readonly store: SimulationProfileStateStore;
  private readonly host: SimulationProfileHost;
  private started: boolean | undefined;

  constructor(store: SimulationProfileStateStore, host: SimulationProfileHost) {
    this.store = store;
    this.host = host;
  }

  readonly databaseLayout = Object.freeze({
    progressDatabaseName: SIMULATION_PROGRESS_DATABASE_NAME,
    tacticalProfileCacheDatabaseName: SIMULATION_TACTICAL_PROFILE_CACHE_DATABASE_NAME
  });

  /**
   * Resolves, once per process, whether the app starts on the simulation
   * databases. A pending clear deletes only the simulation databases, before
   * anything opens them. Any failure to read the choice falls back to the real
   * databases rather than guessing.
   */
  prepareStartup(): boolean {
    if (this.started !== undefined) {
      return this.started;
    }
    let state: SimulationProfileState;
    try {
      state = this.store.read();
    } catch {
      this.started = false;
      return false;
    }
    if (state.enabled && state.resetPending) {
      this.host.deleteSimulationDatabases();
      this.store.write({ ...state, resetPending: false });
    }
    this.started = state.enabled;
    return state.enabled;
  }

  controls(): DevSimulationProfileControls {
    const active = this.prepareStartup();
    return {
      active,
      setActive: (enabled) => {
        this.store.write({ enabled, resetPending: false });
        this.host.reload();
      },
      clear: () => {
        this.store.write({ enabled: true, resetPending: true });
        this.host.reload();
      },
      replaceWithSeed: (scenario) => {
        this.store.write({ enabled: true, resetPending: true, pendingSeed: scenario });
        this.host.reload();
      },
      takePendingSeed: () => {
        const state = this.store.read();
        if (!state.enabled || state.pendingSeed === undefined) {
          return undefined;
        }
        const { pendingSeed, ...rest } = state;
        this.store.write(rest);
        return pendingSeed;
      }
    };
  }
}

function isScenario(value: string | null): value is SimulatedHistoryScenarioId {
  return value !== null && Object.prototype.hasOwnProperty.call(SIMULATED_HISTORY_SCENARIOS, value);
}

let deviceProfile: SimulationProfile | undefined;

/**
 * The profile backed by device storage: a tiny state database beside the app
 * data, the simulation databases by name, and a JS reload. Mobile-only; Jest
 * builds {@link SimulationProfile} directly with fakes.
 */
export function deviceSimulationProfile(): SimulationProfile {
  deviceProfile ??= createDeviceSimulationProfile();
  return deviceProfile;
}

function createDeviceSimulationProfile(): SimulationProfile {
  const { DeviceSQLiteStore } = require("./deviceSQLiteStore.ts") as typeof import("./deviceSQLiteStore.ts");
  const { DevSettings } = require("react-native") as typeof import("react-native");
  const stateDatabase = DeviceSQLiteStore.openDatabase(SIMULATION_PROFILE_STATE_DATABASE_NAME);
  return new SimulationProfile(new SQLiteSimulationProfileStateStore(stateDatabase), {
    reload: () => {
      if (typeof DevSettings?.reload !== "function") {
        throw new Error("Reload the app to apply the simulation data setting");
      }
      DevSettings.reload();
    },
    deleteSimulationDatabases: () => {
      DeviceSQLiteStore.deleteDatabase(SIMULATION_PROGRESS_DATABASE_NAME);
      DeviceSQLiteStore.deleteTacticalProfileCacheDatabase(
        SIMULATION_TACTICAL_PROFILE_CACHE_DATABASE_NAME
      );
    }
  });
}
