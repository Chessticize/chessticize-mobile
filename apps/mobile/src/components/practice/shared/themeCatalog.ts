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

type CustomThemeFilter = string;

const ALL_THEMES_FILTER: CustomThemeFilter = ALL_THEME_SELECTION;

function customThemeLabel(theme: CustomThemeFilter): string {
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
