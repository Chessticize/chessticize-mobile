// Mobile platform adapter; kept outside the backend/domain seam.
import { open, type DB, type Scalar } from "@op-engineering/op-sqlite";
import { NativeModules, Platform } from "react-native";
import {
  SQLitePuzzlePackCompatibilityError,
  SQLitePuzzlePackSource,
  type SQLitePuzzlePackSourceOptions
} from "../../../../packages/storage/src/sqlite-puzzle-pack-source.ts";
import {
  SyncSQLiteStore,
  type SyncSqliteDatabase,
  type SyncSqliteStatement,
  type SyncSqliteValue
} from "../../../../packages/storage/src/sync-sqlite-store.ts";
import { SQLiteTacticalProfileRepository } from "../../../../packages/storage/src/tactical-profile-repository.ts";
import { MOBILE_DATABASE_LAYOUT } from "../backend/mobileDatabaseLayout.ts";

export class DeviceSQLiteStore extends SyncSQLiteStore {
  private readonly nativeDb: DB;

  constructor(nativeDb: DB) {
    super(new OPSqliteDatabase(nativeDb), { randomId: createLocalId });
    this.nativeDb = nativeDb;
  }

  static open(name = MOBILE_DATABASE_LAYOUT.progressDatabaseName): DeviceSQLiteStore {
    return new DeviceSQLiteStore(open({ name }));
  }

  static openTacticalProfileRepository(
    name = MOBILE_DATABASE_LAYOUT.tacticalProfileCacheDatabaseName
  ): SQLiteTacticalProfileRepository {
    const location = tacticalProfileCacheLocation();
    return new SQLiteTacticalProfileRepository(
      new OPSqliteDatabase(open({
        name,
        ...(location === undefined ? {} : { location })
      }))
    );
  }

  static async openReadOnlyPuzzlePack(
    name: string,
    options: SQLitePuzzlePackSourceOptions = {},
    obsoleteCacheNames: readonly string[] = []
  ): Promise<SQLitePuzzlePackSource> {
    const bundledPack = DeviceSQLiteStore.openBundledReadOnlyPuzzlePack(
      name,
      options,
      obsoleteCacheNames
    );
    if (bundledPack) {
      return bundledPack;
    }

    const asset = {
      filename: name,
      path: MOBILE_DATABASE_LAYOUT.androidPuzzlePackAssetDirectory
    };
    const copied = await moveBundledDatabaseAsset(asset);
    if (!copied) {
      throw new Error(`Bundled puzzle pack could not be copied: ${name}`);
    }
    try {
      const pack = openReadOnlyPuzzlePackDatabase({ name }, options);
      deleteObsoleteBundledPuzzlePackCaches(obsoleteCacheNames);
      return pack;
    } catch (error) {
      if (!(error instanceof SQLitePuzzlePackCompatibilityError)) {
        throw error;
      }
      const overwritten = await moveBundledDatabaseAsset({ ...asset, overwrite: true });
      if (!overwritten) {
        throw new Error(`Incompatible bundled puzzle-pack cache could not be replaced: ${name}`);
      }
      const pack = openReadOnlyPuzzlePackDatabase({ name }, options);
      deleteObsoleteBundledPuzzlePackCaches(obsoleteCacheNames);
      return pack;
    }
  }

  static openBundledReadOnlyPuzzlePack(
    name: string,
    options: SQLitePuzzlePackSourceOptions = {},
    obsoleteCacheNames: readonly string[] = []
  ): SQLitePuzzlePackSource | undefined {
    const iosBundleLocation = Platform.OS === "ios" ? iosBundleResourceDirectory() : undefined;
    if (!iosBundleLocation) {
      return undefined;
    }
    const pack = openReadOnlyPuzzlePackDatabase({ name, location: iosBundleLocation }, options);
    deleteObsoleteBundledPuzzlePackCaches(obsoleteCacheNames);
    return pack;
  }

  static canOpenBundledReadOnlyPuzzlePack(): boolean {
    return Platform.OS === "ios" && iosBundleResourceDirectory() !== undefined;
  }

  close(): void {
    this.nativeDb.close();
  }

  databasePath(): string {
    return this.nativeDb.getDbPath();
  }
}

function iosBundleResourceDirectory(): string | undefined {
  const applicationMetadata = NativeModules.ApplicationMetadata as
    | { bundleResourcePath?: unknown }
    | undefined;
  if (
    typeof applicationMetadata?.bundleResourcePath === "string" &&
    applicationMetadata.bundleResourcePath.length > 0
  ) {
    return applicationMetadata.bundleResourcePath;
  }
  const sourceCode = NativeModules.SourceCode as { scriptURL?: string } | undefined;
  const scriptUrl = sourceCode?.scriptURL;
  if (!scriptUrl?.startsWith("file://")) {
    return undefined;
  }

  const scriptPath = decodeURIComponent(scriptUrl.slice("file://".length));
  const lastSlash = scriptPath.lastIndexOf("/");
  return lastSlash === -1 ? undefined : scriptPath.slice(0, lastSlash);
}

function tacticalProfileCacheLocation(): string | undefined {
  if (Platform.OS !== "ios") {
    return undefined;
  }
  const module = NativeModules.OPSQLite as
    | { IOS_LIBRARY_PATH?: string }
    | undefined;
  const libraryPath = module?.IOS_LIBRARY_PATH?.replace(/\/+$/, "");
  return libraryPath ? `${libraryPath}/Caches` : undefined;
}

function moveBundledDatabaseAsset(args: {
  filename: string;
  path: string;
  overwrite?: boolean;
}): Promise<boolean> {
  const module = NativeModules.OPSQLite as
    | { moveAssetsDatabase?: (input: { filename: string; path: string; overwrite?: boolean }) => Promise<boolean> }
    | undefined;
  if (!module?.moveAssetsDatabase) {
    return Promise.reject(new Error("OPSQLite asset copy API is unavailable"));
  }
  return module.moveAssetsDatabase(args);
}

function deleteObsoleteBundledPuzzlePackCaches(names: readonly string[]): void {
  for (const name of new Set(names)) {
    if (!/^bundled-core-pack(?:-v[1-9]\d*)?\.sqlite$/u.test(name)) {
      throw new Error(`Refusing to delete unexpected bundled puzzle-pack cache: ${name}`);
    }
    open({ name }).delete();
  }
}

function openReadOnlyPuzzlePackDatabase(
  input: { name: string; location?: string },
  options: SQLitePuzzlePackSourceOptions
): SQLitePuzzlePackSource {
  const nativeDb = open({
    ...input,
    readOnly: true
  } as Parameters<typeof open>[0] & { readOnly: boolean });
  try {
    return new SQLitePuzzlePackSource(new OPSqliteDatabase(nativeDb), options);
  } catch (error) {
    nativeDb.close();
    throw error;
  }
}

export class OPSqliteDatabase implements SyncSqliteDatabase {
  private readonly db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  exec(sql: string): void {
    for (const statement of splitSqlStatements(sql)) {
      this.db.executeSync(statement);
    }
  }

  prepare(sql: string): SyncSqliteStatement {
    return {
      run: (...params: SyncSqliteValue[]) => {
        this.db.executeSync(sql, params as Scalar[]);
      },
      get: (...params: SyncSqliteValue[]) => this.db.executeSync(sql, params as Scalar[]).rows[0],
      all: (...params: SyncSqliteValue[]) => this.db.executeSync(sql, params as Scalar[]).rows
    };
  }
}

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function createLocalId(): string {
  const runtime = globalThis as typeof globalThis & { crypto?: { randomUUID?: () => string } };
  const randomUuid = runtime.crypto?.randomUUID;
  if (typeof randomUuid === "function") {
    return randomUuid.call(runtime.crypto);
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
