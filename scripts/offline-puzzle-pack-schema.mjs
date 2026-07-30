import {
  SERVER_CURATED_THEMES
} from "../packages/core/src/theme-catalog.ts";

export const CORE_PACK_THEME_CATALOG = Object.freeze(
  [
    { id: 1, name: "advancedPawn" },
    { id: 2, name: "advantage" },
    { id: 3, name: "anastasiaMate" },
    { id: 4, name: "arabianMate" },
    { id: 5, name: "attackingF2F7" },
    { id: 6, name: "attraction" },
    { id: 7, name: "backRankMate" },
    { id: 8, name: "bishopEndgame" },
    { id: 9, name: "bodenMate" },
    { id: 10, name: "capturingDefender" },
    { id: 11, name: "castling" },
    { id: 12, name: "clearance" },
    { id: 13, name: "crushing" },
    { id: 14, name: "defensiveMove" },
    { id: 15, name: "deflection" },
    { id: 16, name: "discoveredAttack" },
    { id: 17, name: "doubleBishopMate" },
    { id: 18, name: "doubleCheck" },
    { id: 19, name: "dovetailMate" },
    { id: 20, name: "endgame" },
    { id: 21, name: "enPassant" },
    { id: 22, name: "equality" },
    { id: 23, name: "exposedKing" },
    { id: 24, name: "fork" },
    { id: 25, name: "hangingPiece" },
    { id: 26, name: "hookMate" },
    { id: 27, name: "interference" },
    { id: 28, name: "intermezzo" },
    { id: 29, name: "killBoxMate" },
    { id: 30, name: "kingsideAttack" },
    { id: 31, name: "knightEndgame" },
    { id: 32, name: "long" },
    { id: 33, name: "master" },
    { id: 34, name: "masterVsMaster" },
    { id: 35, name: "mate" },
    { id: 36, name: "mateIn1" },
    { id: 37, name: "mateIn2" },
    { id: 38, name: "mateIn3" },
    { id: 39, name: "mateIn4" },
    { id: 40, name: "mateIn5" },
    { id: 41, name: "middlegame" },
    { id: 42, name: "oneMove" },
    { id: 43, name: "opening" },
    { id: 44, name: "pawnEndgame" },
    { id: 45, name: "pin" },
    { id: 46, name: "promotion" },
    { id: 47, name: "queenEndgame" },
    { id: 48, name: "queenRookEndgame" },
    { id: 49, name: "queensideAttack" },
    { id: 50, name: "quietMove" },
    { id: 51, name: "rookEndgame" },
    { id: 52, name: "sacrifice" },
    { id: 53, name: "short" },
    { id: 54, name: "skewer" },
    { id: 55, name: "smotheredMate" },
    { id: 56, name: "superGM" },
    { id: 57, name: "trappedPiece" },
    { id: 58, name: "underPromotion" },
    { id: 59, name: "veryLong" },
    { id: 60, name: "vukovicMate" },
    { id: 61, name: "xRayAttack" },
    { id: 62, name: "zugzwang" }
  ].map((theme) => Object.freeze(theme))
);

export const INDEXED_CORE_PACK_THEMES = Object.freeze([
  ...SERVER_CURATED_THEMES
]);

const CORE_PACK_THEME_ID_BY_NAME = new Map(
  CORE_PACK_THEME_CATALOG.map((theme) => [theme.name, theme.id])
);

for (const theme of INDEXED_CORE_PACK_THEMES) {
  if (!CORE_PACK_THEME_ID_BY_NAME.has(theme)) {
    throw new Error(
      `Indexed Core Pack theme ${theme} is missing from the stable theme catalog`
    );
  }
}

export function corePackThemeId(theme) {
  return CORE_PACK_THEME_ID_BY_NAME.get(theme);
}

export function assertCorePackThemeCatalog(db) {
  const actual = db.prepare(
    "SELECT id, name FROM themes ORDER BY id"
  ).all();
  if (
    actual.length !== CORE_PACK_THEME_CATALOG.length ||
    actual.some(
      (theme, index) =>
        theme.id !== CORE_PACK_THEME_CATALOG[index].id ||
        theme.name !== CORE_PACK_THEME_CATALOG[index].name
    )
  ) {
    throw new Error(
      "Core Pack theme catalog does not match the stable 62-theme ID mapping"
    );
  }
}

export function assertKnownCorePackThemes(themes) {
  const unknown = [...new Set(themes)]
    .filter((theme) => !CORE_PACK_THEME_ID_BY_NAME.has(theme))
    .sort();
  if (unknown.length > 0) {
    throw new Error(
      `Core Pack contains themes without stable IDs: ${unknown.join(", ")}`
    );
  }
}
