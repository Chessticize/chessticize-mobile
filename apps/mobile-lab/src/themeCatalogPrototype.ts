export type ThemeCatalogPrototypeVariant = "wrap" | "rails" | "groups";

export const THEME_CATALOG_PROTOTYPE_VARIANTS: ReadonlyArray<{
  id: ThemeCatalogPrototypeVariant;
  label: string;
  note: string;
}> = [
  { id: "wrap", label: "A · Wrap", note: "One wrapping field; History uses wrapping badges." },
  { id: "rails", label: "B · Rails", note: "Categorized horizontal rails; History scrolls horizontally." },
  { id: "groups", label: "C · Groups", note: "Stacked categories; History uses compact inline text." }
];

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

export function themeCatalogPresentationFor(variant: ThemeCatalogPrototypeVariant): {
  groups: typeof SERVER_CURATED_THEME_GROUPS;
  layout: ThemeCatalogPrototypeVariant;
} {
  return {
    groups: SERVER_CURATED_THEME_GROUPS,
    layout: variant
  };
}

export function isThemeCatalogPrototypeVariant(
  value: string | null
): value is ThemeCatalogPrototypeVariant {
  return THEME_CATALOG_PROTOTYPE_VARIANTS.some((variant) => variant.id === value);
}
