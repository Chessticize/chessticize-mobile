export const MOBILE_DATABASE_LAYOUT = {
  progressDatabaseName: "chessticize-mobile.sqlite",
  tacticalProfileCacheDatabaseName: "chessticize-tactical-profile-cache.sqlite",
  legacyBundledPuzzlePackDatabaseName: "bundled-core-pack.sqlite",
  androidPuzzlePackAssetDirectory: "puzzle-packs"
} as const;

export function bundledPuzzlePackDatabaseName(packVersion: number): string {
  assertPackVersion(packVersion);
  return `bundled-core-pack-v${packVersion}.sqlite`;
}

export function obsoleteBundledPuzzlePackDatabaseNames(
  currentPackVersion: number
): string[] {
  assertPackVersion(currentPackVersion);
  return [
    MOBILE_DATABASE_LAYOUT.legacyBundledPuzzlePackDatabaseName,
    ...Array.from(
      { length: currentPackVersion - 1 },
      (_, index) => bundledPuzzlePackDatabaseName(index + 1)
    )
  ];
}

function assertPackVersion(packVersion: number): void {
  if (!Number.isSafeInteger(packVersion) || packVersion < 1) {
    throw new Error(`Core Pack version must be a positive integer; received ${String(packVersion)}`);
  }
}
