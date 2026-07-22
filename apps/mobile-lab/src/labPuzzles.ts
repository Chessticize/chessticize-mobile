import type { Puzzle } from "../../../packages/core/src/index.ts";

type LabPuzzleSeed = {
  id: string;
  pawnFile: "c" | "d" | "e" | "f" | "g";
  rating: number;
  themes: string[];
};

const seeds: LabPuzzleSeed[] = [
  { id: "lab-fork-01", pawnFile: "e", rating: 780, themes: ["fork", "endgame"] },
  { id: "lab-pin-02", pawnFile: "d", rating: 920, themes: ["pin", "middlegame"] },
  { id: "lab-skewer-03", pawnFile: "c", rating: 1080, themes: ["skewer", "endgame"] },
  { id: "lab-sacrifice-04", pawnFile: "f", rating: 1240, themes: ["sacrifice", "middlegame"] },
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

export const ISSUE_272_LAB_PUZZLE: Puzzle = {
  id: "lab-issue-272-white-to-move",
  initialFen: "4k3/8/8/8/8/8/4P3/4K3 b - - 0 1",
  solutionMoves: ["e8d7", "e2e4"],
  rating: 820,
  themes: ["endgame"],
  source: "synthetic",
  stockfishEval: 140,
  stockfishBestMove: "e8f7",
  stockfishEvalAfterFirstMove: -180
};
