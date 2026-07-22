import {
  SERVER_CURATED_THEME_GROUPS,
  SERVER_CURATED_THEME_PRESENTATION,
  SERVER_CURATED_THEMES
} from "../../../packages/core/src/index.ts";
import { LAB_PUZZLES } from "./labPuzzles.ts";

export {
  SERVER_CURATED_THEME_GROUPS,
  SERVER_CURATED_THEME_PRESENTATION,
  SERVER_CURATED_THEMES
};

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
