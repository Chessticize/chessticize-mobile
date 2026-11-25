import {
  ALL_THEME_SELECTION,
  type ThemeCatalogGroupId
} from "../../../../../../packages/core/src/index.ts";
import {
  getActiveLocale,
  translate,
  type MessageKey,
  type SupportedLocale
} from "../../../i18n/index.ts";

export type CustomThemeSelection = {
  selectedThemes: readonly CustomThemeFilter[];
  onChange: (selectedThemes: CustomThemeFilter[]) => void;
};

export type ThemeCatalogGroup = {
  id?: ThemeCatalogGroupId;
  label: string;
  themes: readonly string[];
};

export type ThemeCatalogPresentation = {
  groups: readonly ThemeCatalogGroup[];
};

export type CustomThemeFilter = string;

export const ALL_THEMES_FILTER: CustomThemeFilter = ALL_THEME_SELECTION;

const THEME_LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
  mateIn1: "themes.mateIn1",
  mateIn2: "themes.mateIn2",
  mateIn3: "themes.mateIn3",
  mateIn4: "themes.mateIn4",
  backRankMate: "themes.backRankMate",
  smotheredMate: "themes.smotheredMate",
  fork: "themes.fork",
  pin: "themes.pin",
  skewer: "themes.skewer",
  discoveredAttack: "themes.discoveredAttack",
  doubleCheck: "themes.doubleCheck",
  xRayAttack: "themes.xRayAttack",
  hangingPiece: "themes.hangingPiece",
  trappedPiece: "themes.trappedPiece",
  capturingDefender: "themes.capturingDefender",
  sacrifice: "themes.sacrifice",
  deflection: "themes.deflection",
  attraction: "themes.attraction",
  intermezzo: "themes.intermezzo",
  interference: "themes.interference",
  advancedPawn: "themes.advancedPawn",
  pawnEndgame: "themes.pawnEndgame",
  promotion: "themes.promotion",
  zugzwang: "themes.zugzwang"
};

const THEME_GROUP_LABEL_KEYS: Readonly<Record<ThemeCatalogGroupId, MessageKey>> = {
  checkmates: "themeGroups.checkmates",
  piece_tactics: "themeGroups.piece_tactics",
  forcing_motifs: "themeGroups.forcing_motifs",
  pawns_and_endings: "themeGroups.pawns_and_endings"
};

const LEGACY_GROUP_LABEL_TO_ID: Readonly<Record<string, ThemeCatalogGroupId>> = {
  Checkmates: "checkmates",
  "Piece tactics": "piece_tactics",
  "Forcing motifs": "forcing_motifs",
  "Pawns & endings": "pawns_and_endings"
};

export function themeCatalogGroupLabel(
  group: Pick<ThemeCatalogGroup, "id" | "label">,
  locale: SupportedLocale = getActiveLocale()
): string {
  const id = group.id ?? LEGACY_GROUP_LABEL_TO_ID[group.label];
  if (id) {
    return translate(locale, THEME_GROUP_LABEL_KEYS[id] as "themeGroups.checkmates");
  }
  return group.label;
}

export function customThemeLabel(
  theme: CustomThemeFilter,
  locale: SupportedLocale = getActiveLocale()
): string {
  if (theme === ALL_THEMES_FILTER) {
    return translate(locale, "themes.all");
  }
  const key = THEME_LABEL_KEYS[theme];
  if (key) {
    return translate(locale, key as "themes.fork");
  }
  return theme
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/^Mate In (\d+)$/, "Mate in $1")
    .replace(/^X Ray Attack$/, "X-Ray Attack");
}
