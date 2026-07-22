import type { Puzzle } from "../../../packages/core/src/index.ts";

type LabPuzzleSeed = {
  id: string;
  pawnFile: "c" | "d" | "e" | "f" | "g";
  rating: number;
  themes: string[];
};

const seeds: LabPuzzleSeed[] = [
  {
    id: "lab-fork-01",
    pawnFile: "e",
    rating: 780,
    themes: ["advancedPawn", "attraction", "discoveredAttack", "mateIn3", "pin", "promotion", "sacrifice", "endgame"]
  },
  {
    id: "lab-pin-02",
    pawnFile: "d",
    rating: 920,
    themes: ["fork", "mateIn1", "mateIn2", "deflection", "hangingPiece", "backRankMate", "middlegame"]
  },
  {
    id: "lab-skewer-03",
    pawnFile: "c",
    rating: 1080,
    themes: ["pawnEndgame", "skewer", "intermezzo", "trappedPiece", "zugzwang", "endgame"]
  },
  {
    id: "lab-sacrifice-04",
    pawnFile: "f",
    rating: 1240,
    themes: ["capturingDefender", "doubleCheck", "mateIn4", "interference", "smotheredMate", "xRayAttack", "middlegame"]
  },
  { id: "lab-promotion-05", pawnFile: "g", rating: 1380, themes: ["promotion", "endgame"] }
];

export const LAB_PUZZLES: Puzzle[] = seeds.map(({ id, pawnFile, rating, themes }) => ({
  id,
  initialFen: `4k3/8/8/8/8/8/${pawnFile === "c" ? "2P5" : pawnFile === "d" ? "3P4" : pawnFile === "e" ? "4P3" : pawnFile === "f" ? "5P2" : "6P1"}/4K3 b - - 0 1`,
  solutionMoves: ["e8d7", `${pawnFile}2${pawnFile}4`],
  rating,
  themes,
  source: "synthetic",
  stockfishEval: 180,
  stockfishBestMove: "e8f7",
  stockfishEvalAfterFirstMove: -220
}));

export const PRIMARY_LAB_PUZZLE = LAB_PUZZLES[0]!;
