import { OPSqliteDatabase } from "../src/platform/deviceSQLiteStore";

jest.mock("@op-engineering/op-sqlite", () => ({
  open: jest.fn()
}));

describe("OPSQLiteDatabase", () => {
  it("keeps trigger bodies and quoted semicolons in one native statement", () => {
    const executeSync = jest.fn((_sql: string) => ({ rows: [], rowsAffected: 0 }));
    const database = new OPSqliteDatabase({ executeSync } as never);

    database.exec(`
      -- A comment may contain a semicolon; without ending a statement.
      CREATE TABLE preferences (id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER preferences_changed
      AFTER UPDATE ON preferences
      BEGIN
        INSERT INTO preferences (id, value) VALUES ('outbox', 'value;still-value');
        DELETE FROM preferences WHERE id = "stale;identifier";
      END;
      /* A block comment can contain ; too. */
      INSERT INTO preferences (id, value) VALUES ('default', 'enabled');
    `);

    expect(executeSync).toHaveBeenCalledTimes(3);
    expect(executeSync.mock.calls[0]?.[0]).toContain("CREATE TABLE preferences");
    expect(executeSync.mock.calls[1]?.[0]).toContain("CREATE TRIGGER preferences_changed");
    expect(executeSync.mock.calls[1]?.[0]).toContain("DELETE FROM preferences");
    expect(executeSync.mock.calls[1]?.[0]).toContain("END");
    expect(executeSync.mock.calls[2]?.[0]).toContain("INSERT INTO preferences");
  });
});
