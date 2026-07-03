import { open, type DB, type Scalar } from "@op-engineering/op-sqlite";
import {
  SyncSQLiteStore,
  type SyncSqliteDatabase,
  type SyncSqliteStatement,
  type SyncSqliteValue
} from "../../../../packages/storage/src/sync-sqlite-store.ts";

export class DeviceSQLiteStore extends SyncSQLiteStore {
  private readonly nativeDb: DB;

  constructor(nativeDb: DB) {
    super(new OPSqliteDatabase(nativeDb), { randomId: createLocalId });
    this.nativeDb = nativeDb;
  }

  static open(name = "chessticize-mobile.sqlite"): DeviceSQLiteStore {
    return new DeviceSQLiteStore(open({ name }));
  }

  close(): void {
    this.nativeDb.close();
  }
}

class OPSqliteDatabase implements SyncSqliteDatabase {
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
