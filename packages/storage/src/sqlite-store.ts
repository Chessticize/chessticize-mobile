import { randomUUID } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { SyncSQLiteStore, type SyncSqliteDatabase, type SyncSqliteValue } from "./sync-sqlite-store.ts";

export class SQLiteStore extends SyncSQLiteStore {
  private readonly nodeDb: DatabaseSync;

  constructor(path = ":memory:") {
    const nodeDb = new DatabaseSync(path);
    super(new NodeSqliteDatabase(nodeDb), { randomId: randomUUID });
    this.nodeDb = nodeDb;
  }

  close(): void {
    this.nodeDb.close();
  }
}

export class NodeSqliteDatabase implements SyncSqliteDatabase {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    const normalize = (params: SyncSqliteValue[]): SQLInputValue[] =>
      params.map((value) => value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : ArrayBuffer.isView(value)
          ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
          : value);
    return {
      run: (...params: SyncSqliteValue[]) => {
        statement.run(...normalize(params));
      },
      get: (...params: SyncSqliteValue[]) => statement.get(...normalize(params)),
      all: (...params: SyncSqliteValue[]) => statement.all(...normalize(params))
    };
  }
}
