// Mobile platform adapter; kept outside the backend/domain seam.
import { open, type DB, type Scalar } from "@op-engineering/op-sqlite";
import { NativeModules, Platform } from "react-native";
import {
  SQLitePuzzlePackSource,
  type SQLitePuzzlePackSourceOptions
} from "../../../../packages/storage/src/sqlite-puzzle-pack-source.ts";
import {
  SyncSQLiteStore,
  type SyncSqliteDatabase,
  type SyncSqliteStatement,
  type SyncSqliteValue
} from "../../../../packages/storage/src/sync-sqlite-store.ts";
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

  static async openReadOnlyPuzzlePack(
    name = MOBILE_DATABASE_LAYOUT.bundledPuzzlePackDatabaseName,
    options: SQLitePuzzlePackSourceOptions = {}
  ): Promise<SQLitePuzzlePackSource> {
    const bundledPack = DeviceSQLiteStore.openBundledReadOnlyPuzzlePack(name, options);
    if (bundledPack) {
      return bundledPack;
    }

    const copied = await moveBundledDatabaseAsset({
      filename: name,
      path: MOBILE_DATABASE_LAYOUT.androidPuzzlePackAssetDirectory
    });
    if (!copied) {
      throw new Error(`Bundled puzzle pack could not be copied: ${name}`);
    }
    return new SQLitePuzzlePackSource(
      new OPSqliteDatabase(open({ name, readOnly: true } as Parameters<typeof open>[0] & { readOnly: boolean })),
      options
    );
  }

  static openBundledReadOnlyPuzzlePack(
    name = MOBILE_DATABASE_LAYOUT.bundledPuzzlePackDatabaseName,
    options: SQLitePuzzlePackSourceOptions = {}
  ): SQLitePuzzlePackSource | undefined {
    const iosBundleLocation = Platform.OS === "ios" ? bundledJsDirectory() : undefined;
    if (!iosBundleLocation) {
      return undefined;
    }
    return new SQLitePuzzlePackSource(
      new OPSqliteDatabase(open({ name, location: iosBundleLocation, readOnly: true } as Parameters<typeof open>[0] & { readOnly: boolean })),
      options
    );
  }

  static canOpenBundledReadOnlyPuzzlePack(): boolean {
    return Platform.OS === "ios" && bundledJsDirectory() !== undefined;
  }

  close(): void {
    this.nativeDb.close();
  }
}

function bundledJsDirectory(): string | undefined {
  const sourceCode = NativeModules.SourceCode as { scriptURL?: string } | undefined;
  const scriptUrl = sourceCode?.scriptURL;
  if (!scriptUrl?.startsWith("file://")) {
    return undefined;
  }

  const scriptPath = decodeURIComponent(scriptUrl.slice("file://".length));
  const lastSlash = scriptPath.lastIndexOf("/");
  return lastSlash === -1 ? undefined : scriptPath.slice(0, lastSlash);
}

function moveBundledDatabaseAsset(args: { filename: string; path: string }): Promise<boolean> {
  const module = NativeModules.OPSQLite as
    | { moveAssetsDatabase?: (input: { filename: string; path: string; overwrite?: boolean }) => Promise<boolean> }
    | undefined;
  if (!module?.moveAssetsDatabase) {
    return Promise.reject(new Error("OPSQLite asset copy API is unavailable"));
  }
  return module.moveAssetsDatabase(args);
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
