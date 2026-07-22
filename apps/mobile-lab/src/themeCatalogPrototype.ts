export const SERVER_CURATED_THEME_GROUPS = [
  {
    label: "Checkmates",
    themes: ["mateIn1", "mateIn2", "mateIn3", "mateIn4", "backRankMate", "smotheredMate"]
  },
  {
    label: "Piece tactics",
    themes: [
      "fork",
      "pin",
      "skewer",
      "discoveredAttack",
      "doubleCheck",
      "xRayAttack",
      "hangingPiece",
      "trappedPiece",
      "capturingDefender"
    ]
  },
  {
    label: "Forcing motifs",
    themes: ["sacrifice", "deflection", "attraction", "intermezzo", "interference"]
  },
  {
    label: "Pawns & endings",
    themes: ["advancedPawn", "pawnEndgame", "promotion", "zugzwang"]
  }
] as const;

export const SERVER_CURATED_THEMES = SERVER_CURATED_THEME_GROUPS.flatMap((group) => group.themes);

const THEME_CATALOG_PUZZLE_THEMES = [
  ["advancedPawn", "attraction", "discoveredAttack", "mateIn3", "pin", "promotion", "sacrifice", "endgame"],
  ["fork", "mateIn1", "mateIn2", "deflection", "hangingPiece", "backRankMate", "middlegame"],
  ["pawnEndgame", "skewer", "intermezzo", "trappedPiece", "zugzwang", "endgame"],
  ["capturingDefender", "doubleCheck", "mateIn4", "interference", "smotheredMate", "xRayAttack", "middlegame"],
  ["promotion", "endgame"]
] as const;

export const THEME_CATALOG_LAB_PUZZLES = LAB_PUZZLES.map((puzzle, index) => ({
  ...puzzle,
  themes: [...THEME_CATALOG_PUZZLE_THEMES[index]!]
}));

export const SERVER_CURATED_THEME_PRESENTATION: {
  groups: typeof SERVER_CURATED_THEME_GROUPS;
} = {
  groups: SERVER_CURATED_THEME_GROUPS
};
import { LAB_PUZZLES } from "./labPuzzles.ts";
