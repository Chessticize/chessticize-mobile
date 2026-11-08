// Top-level tab navigation model (#612). Pure TypeScript: no React or React
// Native imports, so the rules run in Node tests. The native tab host
// (UITabBarController / Material bottom navigation) owns drawing and placement;
// this module owns which tab is selected, when the tab chrome is shown, and how
// a native selection is reconciled with the app's request.
import { ICONS, type IconName } from "../components/ui/iconNames.ts";
import type { MobileBackPrimaryTab } from "./mobileBackContract.ts";

export type TopLevelTab = MobileBackPrimaryTab;

// Icons come from the shared map (components/ui/iconNames.ts): SF Symbols on
// iOS, the Material Symbols subset font on Android and in the Lab, and on the
// native Android bottom navigation the same glyphs as vector drawables written
// by scripts/build-material-symbols-subset.py.
export type TopLevelTabItem = {
  androidDrawable: string;
  icon: IconName;
  label: string;
  sfSymbol: string;
  tab: TopLevelTab;
  testID: string;
};

export const TOP_LEVEL_TABS: ReadonlyArray<TopLevelTabItem> = [
  { tab: "practice", label: "Practice", testID: "practice-tab", icon: "tabPractice", sfSymbol: ICONS.tabPractice.sf, androidDrawable: "ic_tab_practice" },
  { tab: "review", label: "Review", testID: "review-tab", icon: "tabReview", sfSymbol: ICONS.tabReview.sf, androidDrawable: "ic_tab_review" },
  { tab: "history", label: "History", testID: "history-tab", icon: "tabHistory", sfSymbol: ICONS.tabHistory.sf, androidDrawable: "ic_tab_history" },
  { tab: "settings", label: "Settings", testID: "settings-tab", icon: "tabSettings", sfSymbol: ICONS.tabSettings.sf, androidDrawable: "ic_tab_settings" }
];

export function isTopLevelTab(value: string): value is TopLevelTab {
  return TOP_LEVEL_TABS.some((item) => item.tab === value);
}

export function topLevelTabItem(tab: TopLevelTab): TopLevelTabItem {
  const item = TOP_LEVEL_TABS.find((candidate) => candidate.tab === tab);
  if (!item) {
    throw new Error(`Unknown top-level tab ${tab}`);
  }
  return item;
}

// Who changed the native selection. Mirrors react-native-screens'
// TabSelectedEvent.actionOrigin.
export type NativeTabSelectionOrigin = "user" | "programmatic-js" | "programmatic-native" | "implicit";

// The last selection the native host confirmed, and its provenance counter.
// Requests to the host must be based on the last confirmed provenance.
export type NativeTabSelectionState = {
  confirmedTab: TopLevelTab;
  provenance: number;
};

export type NativeTabSelectionRequest = {
  baseProvenance: number;
  selectedScreenKey: TopLevelTab;
};

export function initialNativeTabSelection(tab: TopLevelTab): NativeTabSelectionState {
  return { confirmedTab: tab, provenance: 0 };
}

// The request the host should receive so that it shows `requestedTab`.
export function nativeTabSelectionRequest(
  state: NativeTabSelectionState,
  requestedTab: TopLevelTab
): NativeTabSelectionRequest {
  return { baseProvenance: state.provenance, selectedScreenKey: requestedTab };
}

export type NativeTabSelectedEvent = {
  actionOrigin: NativeTabSelectionOrigin;
  isRepeated: boolean;
  provenance: number;
  selectedScreenKey: string;
};

// What the app should do after the host reports a selection.
export type NativeTabSelectionOutcome =
  // The host confirmed what the app asked for (or a stale/unknown report): nothing to do.
  | { kind: "none" }
  // A person picked a tab: the app decides whether to follow (see topLevelTabIntent).
  | { kind: "select"; tab: TopLevelTab }
  // A person picked the tab that is already selected.
  | { kind: "reselect"; tab: TopLevelTab };

export function reconcileNativeTabSelection(
  state: NativeTabSelectionState,
  event: NativeTabSelectedEvent
): { outcome: NativeTabSelectionOutcome; state: NativeTabSelectionState } {
  if (!isTopLevelTab(event.selectedScreenKey) || event.provenance < state.provenance) {
    return { outcome: { kind: "none" }, state };
  }
  const nextState: NativeTabSelectionState = {
    confirmedTab: event.selectedScreenKey,
    provenance: event.provenance
  };
  if (event.actionOrigin === "programmatic-js") {
    return { outcome: { kind: "none" }, state: nextState };
  }
  if (event.isRepeated) {
    return { outcome: { kind: "reselect", tab: event.selectedScreenKey }, state: nextState };
  }
  return { outcome: { kind: "select", tab: event.selectedScreenKey }, state: nextState };
}

// Product intent for choosing a tab. Review opens the due queue rather than
// whatever Review surface was last shown, matching the previous tab bar.
export type TopLevelTabIntent =
  | { kind: "open-review-queue" }
  | { kind: "show-tab"; tab: Exclude<TopLevelTab, "review"> };

export function topLevelTabIntent(tab: TopLevelTab): TopLevelTabIntent {
  return tab === "review" ? { kind: "open-review-queue" } : { kind: "show-tab", tab };
}

// Global navigation is hidden whenever a focused surface owns the screen:
// an active session, its feedback snapshot, guides and Personal Best surfaces,
// and an open review session.
export type TopLevelChromeInputs = {
  feedbackSnapshotVisible: boolean;
  openSession: boolean;
  personalBestGuideVisible: boolean;
  personalBestHubVisible: boolean;
  personalBestRecordsVisible: boolean;
  reviewSurfaceOpen: boolean;
  sessionGuideVisible: boolean;
};

export function isTopLevelChromeVisible(inputs: TopLevelChromeInputs): boolean {
  return !inputs.openSession
    && !inputs.feedbackSnapshotVisible
    && !inputs.sessionGuideVisible
    && !inputs.personalBestGuideVisible
    && !inputs.personalBestHubVisible
    && !inputs.personalBestRecordsVisible
    && !inputs.reviewSurfaceOpen;
}

export type ReviewTabBadge = {
  accessibilityLabel: string;
  text: string;
  tone: "default" | "danger";
} | null;

export function reviewTabBadge(dueCount: number, overdueCount: number): ReviewTabBadge {
  if (dueCount <= 0) {
    return null;
  }
  return {
    accessibilityLabel: `${dueCount} due reviews${overdueCount > 0 ? `, ${overdueCount} overdue` : ""}`,
    text: dueCount > 99 ? "99+" : `${dueCount}`,
    tone: overdueCount > 0 ? "danger" : "default"
  };
}

// iOS tab controller configuration (owner decision, #612). iPad uses the plain
// tab bar mode: the floating tab bar at the top in both orientations, with no
// sidebar and no sidebar toggle. iPhone (including both iPhone Duo displays)
// sets no mode, so the system placement applies, including the Duo vertical
// column on the hardware side.
//
// UITabBarController.mode exists from iOS 18. Earlier iPadOS releases always
// show the classic bottom tab bar, so the host leaves the prop at its default
// there (react-native-screens warns when a non-default value cannot apply).
export type NativeTabControllerMode = "automatic" | "tabBar";

export const IOS_TAB_BAR_CONTROLLER_MODE_MIN_VERSION = 18;

export function nativeTabControllerMode(
  idiom: "pad" | "phone",
  iosMajorVersion: number
): NativeTabControllerMode {
  return idiom === "pad" && iosMajorVersion >= IOS_TAB_BAR_CONTROLLER_MODE_MIN_VERSION
    ? "tabBar"
    : "automatic";
}

// The iOS 26 tab bar can minimize while content scrolls, which changes the tab
// screen's safe area mid-scroll and moves the content under the finger. Keep
// it expanded. The prop only exists from iOS 26; earlier versions get nothing
// (react-native-screens warns when a non-default value cannot apply).
export const IOS_TAB_BAR_MINIMIZE_MIN_VERSION = 26;

export function nativeTabBarMinimizeBehavior(iosMajorVersion: number): "never" | undefined {
  return iosMajorVersion >= IOS_TAB_BAR_MINIMIZE_MIN_VERSION ? "never" : undefined;
}

// Major version from React Native's Platform.Version on iOS ("26.1" or 26).
export function iosMajorVersion(version: string | number): number {
  const major = Number.parseInt(String(version), 10);
  return Number.isFinite(major) ? major : 0;
}

// Where the platform draws the tab chrome for a window. The native host decides
// this itself; the placeholder used by Jest and the Interaction Lab follows the
// same rules so product-clone stories keep a faithful frame.
//
// - bottomBar: floating capsule (iOS 26+) or bar along the bottom edge.
// - topBar: iPad only. The same items in a floating bar at the top in both
//   orientations (text only, as the system draws it).
// - trailingColumn / leadingColumn: iPhone Duo. System bars move into a
//   vertical column on the hardware side: always on the outer display (beside
//   the status bar and camera), and on the inner display in landscape. The
//   inner display keeps horizontal bars in portrait.
// - bottomNavigation: Android Material bottom navigation (phones, < 600 dp).
// - navigationRail: Android tablets and unfolded foldables (>= 600 dp). The
//   native host has no Android rail, so the app draws a Material navigation
//   rail and hides the host's bottom navigation.
export type TopLevelChromePlacement =
  | "bottomBar"
  | "topBar"
  | "trailingColumn"
  | "leadingColumn"
  | "bottomNavigation"
  | "navigationRail";

// Material window size classes: medium and expanded widths start at 600 dp.
export const ANDROID_NAVIGATION_RAIL_MIN_WIDTH = 600;

export const VERTICAL_BAR_SIDE_INSET_MIN = 60;
const REGULAR_WIDTH_MIN = 768;
const REGULAR_HEIGHT_MIN = 600;

export function resolveTopLevelChromePlacement({
  height,
  idiom,
  insets,
  platform,
  width
}: {
  height: number;
  idiom: "pad" | "phone";
  insets: { bottom: number; left: number; right: number; top: number };
  platform: "android" | "ios";
  width: number;
}): TopLevelChromePlacement {
  if (platform === "android") {
    return width >= ANDROID_NAVIGATION_RAIL_MIN_WIDTH ? "navigationRail" : "bottomNavigation";
  }
  const portrait = height >= width;
  const regular = width >= REGULAR_WIDTH_MIN && height >= REGULAR_HEIGHT_MIN;
  if (idiom === "pad") {
    if (!regular) {
      return "bottomBar";
    }
    return "topBar";
  }
  if (portrait && insets.right >= VERTICAL_BAR_SIDE_INSET_MIN) {
    return "trailingColumn";
  }
  if (portrait && insets.left >= VERTICAL_BAR_SIDE_INSET_MIN) {
    return "leadingColumn";
  }
  // iPhone Duo inner display in landscape (the only regular-width iPhone
  // window). The hardware side is not yet measured; trailing is assumed.
  if (regular && !portrait) {
    return insets.left > insets.right ? "leadingColumn" : "trailingColumn";
  }
  return "bottomBar";
}

// Placeholder-only idiom guess from the window size, for hosts without
// Platform.isPad (Jest, the Interaction Lab): iPad windows are at least 744 pt
// on the short side when full screen; the iPhone Duo inner display is 669.
export function placeholderIdiomForWindow(width: number, height: number): "pad" | "phone" {
  return Math.min(width, height) >= 740 ? "pad" : "phone";
}
