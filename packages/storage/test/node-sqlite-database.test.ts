import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { NodeSqliteDatabase } from "../src/sqlite-store.ts";

test("Node SQLite binds ArrayBuffer values for writes and queries", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const adapter = new NodeSqliteDatabase(db);
    adapter.exec("CREATE TABLE blobs (value BLOB NOT NULL)");
    const value = new Uint8Array([0, 127, 255]).buffer;
    adapter.prepare("INSERT INTO blobs (value) VALUES (?)").run(value);
    const row = adapter.prepare("SELECT value FROM blobs WHERE value = ?").get(value) as { value: Uint8Array };
    assert.deepEqual(row.value, new Uint8Array([0, 127, 255]));
    assert.equal(adapter.prepare("SELECT value FROM blobs WHERE value = ?").all(value).length, 1);
    const slice = new DataView(new Uint8Array([9, 0, 127, 255, 9]).buffer, 1, 3);
    assert.equal(adapter.prepare("SELECT value FROM blobs WHERE value = ?").all(slice).length, 1);
  } finally {
    db.close();
  }
});
