import { ALL_THEME_SELECTION } from "../../../../../../packages/core/src/index.ts";

export type CustomThemeSelection = {
  selectedThemes: readonly CustomThemeFilter[];
  onChange: (selectedThemes: CustomThemeFilter[]) => void;
};

export type ThemeCatalogGroup = {
  label: string;
  themes: readonly string[];
};

export type ThemeCatalogPresentation = {
  groups: readonly ThemeCatalogGroup[];
};

export type CustomThemeFilter = string;

export const ALL_THEMES_FILTER: CustomThemeFilter = ALL_THEME_SELECTION;

export function customThemeLabel(theme: CustomThemeFilter): string {
  if (theme === ALL_THEMES_FILTER) {
    return "All";
  }
  return theme
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/^Mate In (\d+)$/, "Mate in $1")
    .replace(/^X Ray Attack$/, "X-Ray Attack");
}
