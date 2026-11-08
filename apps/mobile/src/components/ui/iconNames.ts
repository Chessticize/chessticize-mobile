// Semantic icon names mapped to an SF Symbol (iOS) and a Material Symbol (Android
// and the web Interaction Lab). Screens use only the semantic names. Adding an
// icon means adding it here and rebuilding the bundled Material subset with
// apps/mobile/scripts/build-material-symbols-subset.py; `codepoint` is the
// Material Symbols Rounded codepoint for `material`.

// Font family of the bundled Material Symbols subset (Android assets/fonts and the Lab).
export const ICON_FONT_FAMILY = "ChessticizeSymbols";

export type IconSpec = {
  sf: string;
  material: string;
  codepoint: number;
};

export const ICONS = {
  add: { sf: "plus", material: "add", codepoint: 0xe145 },
  arrowDuel: { sf: "arrow.up.right", material: "north_east", codepoint: 0xf1e1 },
  check: { sf: "checkmark", material: "check", codepoint: 0xe668 },
  chevronDown: { sf: "chevron.down", material: "expand_more", codepoint: 0xe5cf },
  chevronRight: { sf: "chevron.right", material: "chevron_right", codepoint: 0xe5cc },
  chevronUp: { sf: "chevron.up", material: "expand_less", codepoint: 0xe5ce },
  close: { sf: "xmark", material: "close", codepoint: 0xe5cd },
  custom: { sf: "slider.horizontal.3", material: "tune", codepoint: 0xe429 },
  edit: { sf: "pencil", material: "edit", codepoint: 0xf097 },
  focus: { sf: "scope", material: "my_location", codepoint: 0xe55c },
  help: { sf: "questionmark.circle", material: "help", codepoint: 0xe8fd },
  play: { sf: "play.fill", material: "play_arrow", codepoint: 0xe037 },
  profile: { sf: "chart.bar", material: "bar_chart", codepoint: 0xe26b },
  remove: { sf: "minus", material: "remove", codepoint: 0xe15b },
  restore: { sf: "arrow.uturn.backward", material: "undo", codepoint: 0xe166 },
  standard: { sf: "target", material: "target", codepoint: 0xe719 },
  survival: { sf: "shield", material: "shield", codepoint: 0xe9e0 }
} as const satisfies Record<string, IconSpec>;

export type IconName = keyof typeof ICONS;
