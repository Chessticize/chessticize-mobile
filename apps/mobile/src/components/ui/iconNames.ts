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
  chevronLeft: { sf: "chevron.left", material: "chevron_left", codepoint: 0xe5cb },
  chevronRight: { sf: "chevron.right", material: "chevron_right", codepoint: 0xe5cc },
  chevronUp: { sf: "chevron.up", material: "expand_less", codepoint: 0xe5ce },
  clock: { sf: "clock", material: "schedule", codepoint: 0xefd6 },
  close: { sf: "xmark", material: "close", codepoint: 0xe5cd },
  custom: { sf: "slider.horizontal.3", material: "tune", codepoint: 0xe429 },
  darkMode: { sf: "moon", material: "dark_mode", codepoint: 0xe51c },
  design: { sf: "paintbrush", material: "brush", codepoint: 0xe3ae },
  edit: { sf: "pencil", material: "edit", codepoint: 0xf097 },
  external: { sf: "arrow.up.right.square", material: "open_in_new", codepoint: 0xe89e },
  // Turns the board over (Review and Replay analysis).
  flip: { sf: "arrow.up.arrow.down", material: "swap_vert", codepoint: 0xe8d5 },
  filter: { sf: "line.3.horizontal.decrease", material: "filter_list", codepoint: 0xe152 },
  focus: { sf: "scope", material: "my_location", codepoint: 0xe55c },
  help: { sf: "questionmark.circle", material: "help", codepoint: 0xe8fd },
  info: { sf: "info.circle", material: "info", codepoint: 0xe88e },
  navigation: { sf: "dock.rectangle", material: "bottom_navigation", codepoint: 0xe98c },
  play: { sf: "play.fill", material: "play_arrow", codepoint: 0xe037 },
  profile: { sf: "chart.bar", material: "bar_chart", codepoint: 0xe26b },
  remove: { sf: "minus", material: "remove", codepoint: 0xe15b },
  // Returns a puzzle or analysis board to its starting position.
  reset: { sf: "arrow.counterclockwise", material: "replay", codepoint: 0xe042 },
  restore: { sf: "arrow.uturn.backward", material: "undo", codepoint: 0xe166 },
  review: { sf: "arrow.counterclockwise", material: "replay", codepoint: 0xe042 },
  search: { sf: "magnifyingglass", material: "search", codepoint: 0xef7a },
  share: { sf: "square.and.arrow.up", material: "ios_share", codepoint: 0xe6b8 },
  standard: { sf: "target", material: "target", codepoint: 0xe719 },
  survival: { sf: "shield", material: "shield", codepoint: 0xe9e0 },
  trend: { sf: "chart.line.uptrend.xyaxis", material: "trending_up", codepoint: 0xe8e5 },
  warning: { sf: "exclamationmark.triangle", material: "warning", codepoint: 0xf083 },
  whatsNew: { sf: "sparkles", material: "auto_awesome", codepoint: 0xe65f },
  // Top-level tabs (#612). The native Android bottom navigation draws these from
  // vector drawables (res/drawable/ic_tab_*.xml) that the subset script writes
  // from the same font instance; see TAB_DRAWABLES there.
  tabHistory: { sf: "clock.arrow.circlepath", material: "history", codepoint: 0xe8b3 },
  tabPractice: { sf: "target", material: "target", codepoint: 0xe719 },
  tabReview: { sf: "arrow.counterclockwise", material: "replay", codepoint: 0xe042 },
  tabSettings: { sf: "gearshape", material: "settings", codepoint: 0xe8b8 }
} as const satisfies Record<string, IconSpec>;

export type IconName = keyof typeof ICONS;

// Tint of the tile behind an icon (see IconTile in ListRow.tsx).
export type IconTone = "accent" | "positive" | "negative" | "warning" | "neutral";
