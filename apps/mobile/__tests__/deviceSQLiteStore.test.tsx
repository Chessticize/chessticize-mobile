import { NativeModules, Platform } from "react-native";

const mockOpen = jest.fn();

jest.mock("@op-engineering/op-sqlite", () => ({
  open: (...args: unknown[]) => mockOpen(...args)
}));

import { DeviceSQLiteStore } from "../src/platform/deviceSQLiteStore.ts";
import {
  bundledPuzzlePackDatabaseName,
  obsoleteBundledPuzzlePackDatabaseNames
} from "../src/backend/mobileDatabaseLayout.ts";

describe("Core Pack runtime database names", () => {
  it("binds the filename to the content version and identifies only older caches", () => {
    expect(bundledPuzzlePackDatabaseName(6)).toBe("bundled-core-pack-v6.sqlite");
    expect(obsoleteBundledPuzzlePackDatabaseNames(6)).toEqual([
      "bundled-core-pack.sqlite",
      "bundled-core-pack-v1.sqlite",
      "bundled-core-pack-v2.sqlite",
      "bundled-core-pack-v3.sqlite",
      "bundled-core-pack-v4.sqlite",
      "bundled-core-pack-v5.sqlite"
    ]);
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

  it("overwrites and reopens a cached asset when the app-required schema is missing", async () => {
    const staleDb = fakePuzzlePackDatabase([]);
    const currentDb = fakePuzzlePackDatabase(["arrow_duel_difficulty"]);
    const obsoleteDb = fakePuzzlePackDatabase([]);
    const moveAssetsDatabase = jest.fn().mockResolvedValue(true);
    (NativeModules as Record<string, unknown>).OPSQLite = { moveAssetsDatabase };
    mockOpen
      .mockReturnValueOnce(staleDb)
      .mockReturnValueOnce(currentDb)
      .mockReturnValueOnce(obsoleteDb);

    await DeviceSQLiteStore.openReadOnlyPuzzlePack(
      "bundled-core-pack-v6.sqlite",
      { requiredPuzzleColumns: ["arrow_duel_difficulty"] },
      ["bundled-core-pack.sqlite"]
    );

    expect(moveAssetsDatabase).toHaveBeenNthCalledWith(1, {
      filename: "bundled-core-pack-v6.sqlite",
      path: "puzzle-packs"
    });
    expect(moveAssetsDatabase).toHaveBeenNthCalledWith(2, {
      filename: "bundled-core-pack-v6.sqlite",
      path: "puzzle-packs",
      overwrite: true
    });
    expect(staleDb.close).toHaveBeenCalledTimes(1);
    expect(currentDb.close).not.toHaveBeenCalled();
    expect(obsoleteDb.delete).toHaveBeenCalledTimes(1);
  });

  it("reuses a compatible cached asset without copying the large pack again", async () => {
    const currentDb = fakePuzzlePackDatabase(["arrow_duel_difficulty"]);
    const obsoleteDb = fakePuzzlePackDatabase([]);
    const moveAssetsDatabase = jest.fn().mockResolvedValue(true);
    (NativeModules as Record<string, unknown>).OPSQLite = { moveAssetsDatabase };
    mockOpen.mockReturnValueOnce(currentDb).mockReturnValueOnce(obsoleteDb);

    await DeviceSQLiteStore.openReadOnlyPuzzlePack(
      "bundled-core-pack-v6.sqlite",
      { requiredPuzzleColumns: ["arrow_duel_difficulty"] },
      ["bundled-core-pack-v5.sqlite"]
    );

    expect(moveAssetsDatabase).toHaveBeenCalledTimes(1);
    expect(currentDb.close).not.toHaveBeenCalled();
    expect(obsoleteDb.delete).toHaveBeenCalledTimes(1);
  });

  it("opens the read-only iOS bundle resource directly even when Metro serves JavaScript", async () => {
    (Platform as { OS: string }).OS = "ios";
    (NativeModules as Record<string, unknown>).ApplicationMetadata = {
      bundleResourcePath: "/private/app/Chessticize.app"
    };
    (NativeModules as Record<string, unknown>).SourceCode = {
      scriptURL: "http://localhost:8081/index.bundle"
    };
    const currentDb = fakePuzzlePackDatabase(["arrow_duel_difficulty"]);
    const obsoleteDb = fakePuzzlePackDatabase([]);
    mockOpen.mockReturnValueOnce(currentDb).mockReturnValueOnce(obsoleteDb);

    await DeviceSQLiteStore.openReadOnlyPuzzlePack(
      "bundled-core-pack-v6.sqlite",
      { requiredPuzzleColumns: ["arrow_duel_difficulty"] },
      ["bundled-core-pack.sqlite"]
    );

    expect(mockOpen).toHaveBeenNthCalledWith(1, {
      name: "bundled-core-pack-v6.sqlite",
      location: "/private/app/Chessticize.app",
      readOnly: true
    });
    expect(obsoleteDb.delete).toHaveBeenCalledTimes(1);
  });
});

function fakePuzzlePackDatabase(puzzleColumns: readonly string[]) {
  return {
    close: jest.fn(),
    delete: jest.fn(),
    executeSync: jest.fn((sql: string) => {
      if (sql.includes("PRAGMA table_info(puzzles)")) {
        return { rows: puzzleColumns.map((name) => ({ name })) };
      }
      if (sql.includes("sqlite_master") && sql.includes("pack_format")) {
        return { rows: [] };
      }
      return { rows: [] };
    })
  };
}
