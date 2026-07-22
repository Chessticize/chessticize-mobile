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

export const SERVER_CURATED_THEME_PRESENTATION: {
  groups: typeof SERVER_CURATED_THEME_GROUPS;
} = {
  groups: SERVER_CURATED_THEME_GROUPS
};
