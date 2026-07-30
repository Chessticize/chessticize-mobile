import {
  SERVER_CURATED_THEMES
} from "../packages/core/src/theme-catalog.ts";

const CORE_PACK_THEME_NAMES = [
  "advancedPawn",
  "advantage",
  "anastasiaMate",
  "arabianMate",
  "attackingF2F7",
  "attraction",
  "backRankMate",
  "bishopEndgame",
  "bodenMate",
  "capturingDefender",
  "castling",
  "clearance",
  "crushing",
  "defensiveMove",
  "deflection",
  "discoveredAttack",
  "doubleBishopMate",
  "doubleCheck",
  "dovetailMate",
  "endgame",
  "enPassant",
  "equality",
  "exposedKing",
  "fork",
  "hangingPiece",
  "hookMate",
  "interference",
  "intermezzo",
  "killBoxMate",
  "kingsideAttack",
  "knightEndgame",
  "long",
  "master",
  "masterVsMaster",
  "mate",
  "mateIn1",
  "mateIn2",
  "mateIn3",
  "mateIn4",
  "mateIn5",
  "middlegame",
  "oneMove",
  "opening",
  "pawnEndgame",
  "pin",
  "promotion",
  "queenEndgame",
  "queenRookEndgame",
  "queensideAttack",
  "quietMove",
  "rookEndgame",
  "sacrifice",
  "short",
  "skewer",
  "smotheredMate",
  "superGM",
  "trappedPiece",
  "underPromotion",
  "veryLong",
  "vukovicMate",
  "xRayAttack",
  "zugzwang"
];

export const CORE_PACK_THEME_CATALOG = Object.freeze(
  CORE_PACK_THEME_NAMES.map((name, index) =>
    Object.freeze({ id: index + 1, name })
  )
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
