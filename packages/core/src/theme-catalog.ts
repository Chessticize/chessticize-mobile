export const ALL_THEME_SELECTION = "mixed";

export type ThemeCatalogGroup = {
  label: string;
  themes: readonly string[];
};

export type ThemeChoiceIntent =
  | { type: "replace-themes"; themes: readonly string[] }
  | { type: "select-all-themes" }
  | { type: "toggle-theme"; theme: string };

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
] as const satisfies readonly ThemeCatalogGroup[];

export const SERVER_CURATED_THEMES: readonly string[] = SERVER_CURATED_THEME_GROUPS.flatMap(
  (group) => group.themes
);

export const SERVER_CURATED_THEME_PRESENTATION: {
  groups: readonly ThemeCatalogGroup[];
} = {
  groups: SERVER_CURATED_THEME_GROUPS
};

export function normalizeThemeSelection(themes?: readonly string[]): string[] {
  return [...new Set((themes ?? []).map((theme) => theme.trim()).filter((theme) => theme.length > 0))].sort();
}

export function normalizeThemeChoiceSelection(
  themes?: readonly string[],
  availableThemes: readonly string[] = SERVER_CURATED_THEMES
): string[] {
  const namedThemes = normalizeThemeSelection(themes).filter((theme) => theme !== ALL_THEME_SELECTION);
  if (namedThemes.length === 0) {
    return [ALL_THEME_SELECTION];
  }

  const selected = new Set(namedThemes);
  const orderedAvailableThemes = uniqueThemesInOrder(availableThemes);
  const availableThemeSet = new Set(orderedAvailableThemes);
  return [
    ...orderedAvailableThemes.filter((theme) => selected.has(theme)),
    ...namedThemes.filter((theme) => !availableThemeSet.has(theme))
  ];
}

export function nextThemeChoiceSelection(
  selectedThemes: readonly string[],
  tappedTheme: string,
  availableThemes: readonly string[] = SERVER_CURATED_THEMES
): string[] {
  const normalizedTappedTheme = tappedTheme.trim();
  if (normalizedTappedTheme.length === 0 || normalizedTappedTheme === ALL_THEME_SELECTION) {
    return [ALL_THEME_SELECTION];
  }

  const namedThemes = normalizeThemeChoiceSelection(selectedThemes, availableThemes)
    .filter((theme) => theme !== ALL_THEME_SELECTION);
  const nextThemes = namedThemes.includes(normalizedTappedTheme)
    ? namedThemes.filter((theme) => theme !== normalizedTappedTheme)
    : [...namedThemes, normalizedTappedTheme];
  return normalizeThemeChoiceSelection(nextThemes, availableThemes);
}

export function applyThemeChoiceIntent(
  selectedThemes: readonly string[],
  intent: ThemeChoiceIntent,
  availableThemes: readonly string[] = SERVER_CURATED_THEMES
): string[] {
  if (intent.type === "select-all-themes") {
    return [ALL_THEME_SELECTION];
  }
  if (intent.type === "replace-themes") {
    return normalizeThemeChoiceSelection(intent.themes, availableThemes);
  }
  return nextThemeChoiceSelection(selectedThemes, intent.theme, availableThemes);
}

export function namedThemesForSelection(themes?: readonly string[]): string[] {
  return normalizeThemeSelection(themes).filter((theme) => theme !== ALL_THEME_SELECTION);
}

export function puzzleMatchesAnyTheme(
  puzzleThemes: readonly string[],
  selectedThemes?: readonly string[]
): boolean {
  const namedThemes = namedThemesForSelection(selectedThemes);
  if (namedThemes.length === 0) {
    return true;
  }
  const puzzleThemeSet = new Set(puzzleThemes);
  return namedThemes.some((theme) => puzzleThemeSet.has(theme));
}

export function curatedPuzzleThemes(puzzleThemes: readonly string[]): string[] {
  const puzzleThemeSet = new Set(normalizeThemeSelection(puzzleThemes));
  return SERVER_CURATED_THEMES.filter((theme) => puzzleThemeSet.has(theme));
}

function uniqueThemesInOrder(themes: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const theme of themes) {
    const normalized = theme.trim();
    if (normalized.length > 0 && normalized !== ALL_THEME_SELECTION) {
      unique.add(normalized);
    }
  }
  return [...unique];
}
