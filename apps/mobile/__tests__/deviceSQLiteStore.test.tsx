import { NativeModules, Platform } from "react-native";

const mockOpen = jest.fn();

jest.mock("@op-engineering/op-sqlite", () => ({
  open: (...args: unknown[]) => mockOpen(...args)
}));

import { DeviceSQLiteStore, OPSqliteDatabase } from "../src/platform/deviceSQLiteStore";
import {
  bundledPuzzlePackDatabaseName,
  obsoleteBundledPuzzlePackDatabaseNames
} from "../src/backend/mobileDatabaseLayout";

describe("Core Pack runtime database names", () => {
  it("binds the runtime filename to Core Pack v5 and identifies only older caches", () => {
    expect(bundledPuzzlePackDatabaseName(5)).toBe("bundled-core-pack-v5.sqlite");
    expect(obsoleteBundledPuzzlePackDatabaseNames(5)).toEqual([
      "bundled-core-pack.sqlite",
      "bundled-core-pack-v1.sqlite",
      "bundled-core-pack-v2.sqlite",
      "bundled-core-pack-v3.sqlite",
      "bundled-core-pack-v4.sqlite"
    ]);
  });

  it("rejects invalid Core Pack content versions", () => {
    for (const value of [0, -1, 1.5, Number.NaN]) {
      expect(() => bundledPuzzlePackDatabaseName(value)).toThrow(
        "Core Pack version must be a positive integer"
      );
    }
  });
});

describe("DeviceSQLiteStore bundled puzzle-pack cache", () => {
  beforeEach(() => {
    mockOpen.mockReset();
    (Platform as { OS: string }).OS = "android";
    delete (NativeModules as Record<string, unknown>).SourceCode;
    delete (NativeModules as Record<string, unknown>).ApplicationMetadata;
    delete (NativeModules as Record<string, unknown>).OPSQLite;
  });

  it("opens the versioned Android asset before deleting obsolete caches", async () => {
    const currentDb = fakePuzzlePackDatabase();
    const obsoleteNames = obsoleteBundledPuzzlePackDatabaseNames(5);
    const obsoleteDbs = obsoleteNames.map(() => fakePuzzlePackDatabase());
    const moveAssetsDatabase = jest.fn().mockResolvedValue(true);
    (NativeModules as Record<string, unknown>).OPSQLite = { moveAssetsDatabase };
    mockOpen.mockReturnValueOnce(currentDb);
    for (const database of obsoleteDbs) {
      mockOpen.mockReturnValueOnce(database);
    }

    await DeviceSQLiteStore.openReadOnlyPuzzlePack(
      "bundled-core-pack-v5.sqlite",
      {},
      obsoleteNames
    );

    expect(moveAssetsDatabase).toHaveBeenCalledTimes(1);
    expect(moveAssetsDatabase).toHaveBeenCalledWith({
      filename: "bundled-core-pack-v5.sqlite",
      path: "puzzle-packs"
    });
    expect(mockOpen).toHaveBeenNthCalledWith(1, {
      name: "bundled-core-pack-v5.sqlite",
      readOnly: true
    });
    for (const database of obsoleteDbs) {
      expect(database.delete).toHaveBeenCalledTimes(1);
    }
  });

  it("does not delete the previous cache when the current pack cannot open", async () => {
    const obsoleteDb = fakePuzzlePackDatabase();
    const moveAssetsDatabase = jest.fn().mockResolvedValue(true);
    (NativeModules as Record<string, unknown>).OPSQLite = { moveAssetsDatabase };
    mockOpen.mockImplementationOnce(() => {
      throw new Error("current pack failed to open");
    }).mockReturnValueOnce(obsoleteDb);

    await expect(DeviceSQLiteStore.openReadOnlyPuzzlePack(
      "bundled-core-pack-v5.sqlite",
      {},
      ["bundled-core-pack.sqlite"]
    )).rejects.toThrow("current pack failed to open");

    expect(obsoleteDb.delete).not.toHaveBeenCalled();
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it("refuses to delete a database outside the bounded Core Pack cache names", async () => {
    const moveAssetsDatabase = jest.fn().mockResolvedValue(true);
    (NativeModules as Record<string, unknown>).OPSQLite = { moveAssetsDatabase };

    await expect(DeviceSQLiteStore.openReadOnlyPuzzlePack(
      "bundled-core-pack-v5.sqlite",
      {},
      ["chessticize-mobile.sqlite"]
    )).rejects.toThrow("Refusing to delete unexpected bundled puzzle-pack cache");

    expect(moveAssetsDatabase).not.toHaveBeenCalled();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("opens the versioned iOS bundle resource directly while Metro serves JavaScript", async () => {
    (Platform as { OS: string }).OS = "ios";
    (NativeModules as Record<string, unknown>).ApplicationMetadata = {
      bundleResourcePath: "/private/app/Chessticize.app"
    };
    (NativeModules as Record<string, unknown>).SourceCode = {
      scriptURL: "http://localhost:8081/index.bundle"
    };
    const currentDb = fakePuzzlePackDatabase();
    const obsoleteNames = obsoleteBundledPuzzlePackDatabaseNames(5);
    const obsoleteDbs = obsoleteNames.map(() => fakePuzzlePackDatabase());
    mockOpen.mockReturnValueOnce(currentDb);
    for (const database of obsoleteDbs) {
      mockOpen.mockReturnValueOnce(database);
    }

    await DeviceSQLiteStore.openReadOnlyPuzzlePack(
      "bundled-core-pack-v5.sqlite",
      {},
      obsoleteNames
    );

    expect(mockOpen).toHaveBeenNthCalledWith(1, {
      name: "bundled-core-pack-v5.sqlite",
      location: "/private/app/Chessticize.app",
      readOnly: true
    });
    for (const database of obsoleteDbs) {
      expect(database.delete).toHaveBeenCalledTimes(1);
    }
  });
});

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

function fakePuzzlePackDatabase() {
  return {
    close: jest.fn(),
    delete: jest.fn(),
    executeSync: jest.fn(() => ({ rows: [], rowsAffected: 0 }))
  };
}
