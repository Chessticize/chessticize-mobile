// Jest-only: Node's SQLite driver behind the synchronous contracts the app's
// device driver (op-sqlite) implements, so storage compositions run against
// real SQLite files in tests.
import { DatabaseSync } from 'node:sqlite';
import type { SyncSqliteDatabase } from '../../../../packages/storage/src/sync-sqlite-store.ts';

export function nodeSyncSqliteDatabase(db: DatabaseSync): SyncSqliteDatabase {
  return {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => {
      const statement = db.prepare(sql);
      return {
        run: (...params) => {
          statement.run(...(params as never[]));
        },
        get: (...params) => statement.get(...(params as never[])),
        all: (...params) => statement.all(...(params as never[])),
      };
    },
  };
}
