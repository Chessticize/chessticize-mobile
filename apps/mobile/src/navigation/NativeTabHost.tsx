// Native top-level tab host (#612): UITabBarController on iOS (Liquid Glass on
// iOS 26+, vertical bars on iPhone Duo, the top tab bar on iPad) and Material bottom navigation on Android phones, through
// react-native-screens Tabs. Android tablets and unfolded foldables (>= 600 dp)
// get the app's Material navigation rail beside the host instead.
//
// Jest and the Interaction Lab cannot run the native container. They resolve
// `react-native-screens` to the maintained fake in nativeTabsFake.tsx, which
// draws a faithful placeholder of the same chrome.
import React from "react";
import { Platform, StyleSheet, View, useWindowDimensions, type ColorValue } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs } from "react-native-screens";
import { usePracticeViewport } from "../components/PracticeViewport.tsx";
import { NAVIGATION_RAIL_WIDTH, TopLevelNavigationRail } from "./TopLevelNavigationRail.tsx";
import {
  ANDROID_NAVIGATION_RAIL_MIN_WIDTH,
  TOP_LEVEL_TABS,
  androidTabLabelFontSize,
  initialNativeTabSelection,
  iosMajorVersion,
  nativeTabBarMinimizeBehavior,
  nativeTabControllerMode,
  nativeTabSelectionRequest,
  reconcileNativeTabSelection,
  resolveTopLevelChromePlacement,
  reviewTabBadge,
  type NativeTabSelectionOutcome,
  type TopLevelTab
} from "./topLevelNavigation.ts";

export type NativeTabHostColors = {
  // Selected item tint and Liquid Glass selection glow.
  accent: ColorValue;
  // Android bar background and indicator.
  androidBarBackground: ColorValue;
  androidIndicator: ColorValue;
  androidInactive: ColorValue;
  // Container background behind tab content.
  background: ColorValue;
  badgeBackground: ColorValue;
  badgeDangerBackground: ColorValue;
  badgeText: ColorValue;
};

export type NativeTabHostProps = {
  // Hides all navigation chrome for a focused surface such as a Run: the tab
  // bar and the Android rail. The tab content keeps rendering, so screen state
  // survives.
  chromeHidden: boolean;
  colorScheme: "light" | "dark";
  colors: NativeTabHostColors;
  overdueReviewCount: number;
  dueReviewCount: number;
  selectedTab: TopLevelTab;
  // Called when a person selects a tab in the native chrome or the Android
  // rail. The app answers by changing `selectedTab` (or keeping it, which moves
  // the host back).
  onSelectionOutcome: (outcome: Exclude<NativeTabSelectionOutcome, { kind: "none" }>) => void;
  // Renders a tab's content. Called for every tab; return null for tabs that are
  // not selected to keep only one content tree mounted.
  renderTab: (tab: TopLevelTab) => React.ReactNode;
};

export function NativeTabHost({
  chromeHidden,
  colorScheme,
  colors,
  dueReviewCount,
  overdueReviewCount,
  selectedTab,
  onSelectionOutcome,
  renderTab
}: NativeTabHostProps): React.JSX.Element {
  const [selection, setSelection] = React.useState(() => initialNativeTabSelection(selectedTab));
  const windowInsets = useSafeAreaInsets();
  const { height, width } = usePracticeViewport();
  const { fontScale } = useWindowDimensions();
  const androidLabelFontSize = androidTabLabelFontSize(fontScale);
  const badge = reviewTabBadge(dueReviewCount, overdueReviewCount);
  const iosMajor = Platform.OS === "ios" ? iosMajorVersion(Platform.Version) : 0;
  const controllerMode = nativeTabControllerMode(
    Platform.OS === "ios" && Platform.isPad ? "pad" : "phone",
    iosMajor
  );
  const usesAndroidRail = Platform.OS === "android" && width >= ANDROID_NAVIGATION_RAIL_MIN_WIDTH;
  const railShown = usesAndroidRail && !chromeHidden;
  // In the plain tab bar mode the iPad top tab bar floats over the content
  // without adding to the tab screen's top safe area, so content keeps clear
  // of it here.
  const iPadTopBarShown = Platform.OS === "ios"
    && Platform.isPad === true
    && !chromeHidden
    && resolveTopLevelChromePlacement({ height, idiom: "pad", insets: windowInsets, platform: "ios", width }) === "topBar";
  const minimumTop = iPadTopBarShown ? windowInsets.top + IPAD_TOP_TAB_BAR_CLEARANCE : 0;
  const chromeContext = React.useMemo<TabChromeLayout>(() => ({
    bottomNavigationShown: Platform.OS === "android" && !usesAndroidRail && !chromeHidden,
    leadingRailWidth: railShown ? NAVIGATION_RAIL_WIDTH : 0,
    minimumTop
  }), [chromeHidden, minimumTop, railShown, usesAndroidRail]);
  const host = (
    <Tabs.Host
      colorScheme={colorScheme}
      navStateRequest={nativeTabSelectionRequest(selection, selectedTab)}
      nativeContainerStyle={{ backgroundColor: colors.background }}
      tabBarHidden={chromeHidden || usesAndroidRail}
      onTabSelected={(event) => {
        const { outcome, state } = reconcileNativeTabSelection(selection, event.nativeEvent);
        setSelection(state);
        if (outcome.kind !== "none") {
          onSelectionOutcome(outcome);
        }
      }}
      ios={{
        tabBarTintColor: colors.accent,
        tabBarControllerMode: controllerMode,
        tabBarMinimizeBehavior: nativeTabBarMinimizeBehavior(iosMajor)
      }}
    >
      {TOP_LEVEL_TABS.map((item) => {
        const itemBadge = item.tab === "review" ? badge : null;
        return (
          <Tabs.Screen
            key={item.tab}
            screenKey={item.tab}
            title={item.label}
            badgeValue={itemBadge?.text}
            tabBarItemTestID={item.testID}
            tabBarItemAccessibilityLabel={[`${item.label} tab`, itemBadge?.accessibilityLabel].filter(Boolean).join(", ")}
            style={{ backgroundColor: colors.background }}
            ios={{
              icon: { type: "sfSymbol", name: item.sfSymbol },
              // The app pads its content with the insets the host reports
              // (useTabContentInsets); UIKit's automatic scroll insets would
              // add the same space a second time.
              overrideScrollViewContentInsetAdjustmentBehavior: false
            }}
            android={{
              icon: { type: "drawableResource", name: item.androidDrawable },
              standardAppearance: {
                tabBarBackgroundColor: colors.androidBarBackground,
                tabBarItemLabelVisibilityMode: "labeled",
                tabBarItemTitleSmallLabelFontSize: androidLabelFontSize,
                tabBarItemTitleLargeLabelFontSize: androidLabelFontSize,
                tabBarItemActiveIndicatorColor: colors.androidIndicator,
                tabBarItemBadgeBackgroundColor: itemBadge?.tone === "danger" ? colors.badgeDangerBackground : colors.badgeBackground,
                tabBarItemBadgeTextColor: colors.badgeText,
                normal: { tabBarItemIconColor: colors.androidInactive, tabBarItemTitleFontColor: colors.androidInactive },
                selected: { tabBarItemIconColor: colors.accent, tabBarItemTitleFontColor: colors.accent }
              }
            }}
          >
            <TabScreenSafeArea>
              <TabChromeContext.Provider value={chromeContext}>
                {renderTab(item.tab)}
              </TabChromeContext.Provider>
            </TabScreenSafeArea>
          </Tabs.Screen>
        );
      })}
    </Tabs.Host>
  );
  if (Platform.OS !== "android") {
    return host;
  }
  // The rail floats over the host's leading edge, and tab content treats it as
  // a leading inset. Android always renders this wrapper so the host keeps its
  // place in the tree when rotation or folding crosses the rail width: a
  // remounted host would restart its selection history (provenance) and lose
  // every tab's content.
  return (
    <View style={styles.railLayout} testID="native-tab-host-android">
      {host}
      {railShown ? (
        <View style={styles.railOverlay}>
          <TopLevelNavigationRail
            dueReviewCount={dueReviewCount}
            insets={windowInsets}
            overdueReviewCount={overdueReviewCount}
            selectedTab={selectedTab}
            onSelect={(tab) => onSelectionOutcome(tab === selectedTab ? { kind: "reselect", tab } : { kind: "select", tab })}
          />
        </View>
      ) : null}
    </View>
  );
}

// Each native tab screen measures its own safe area, which includes the space
// the tab chrome takes. On the web (the Interaction Lab) the host is the
// placeholder fake, which supplies those insets itself; a web SafeAreaProvider
// would replace them with the page's zero insets.
function TabScreenSafeArea({ children }: React.PropsWithChildren): React.JSX.Element {
  if (Platform.OS === "web") {
    return <>{children}</>;
  }
  return <SafeAreaProvider>{children}</SafeAreaProvider>;
}

// Height of the Material 3 bottom navigation (NavigationBarView) above the
// system navigation bar, measured on API 36 (80 dp).
export const ANDROID_BOTTOM_NAVIGATION_HEIGHT = 80;

// Space below the top of the window that the iPad floating top tab bar needs
// (measured on iPadOS 27: the bar and its margin below the status bar).
export const IPAD_TOP_TAB_BAR_CLEARANCE = 72;

type TabChromeLayout = {
  // The Android bottom navigation is shown over the bottom of the content.
  bottomNavigationShown: boolean;
  // Width of the app-drawn Android rail over the leading edge.
  leadingRailWidth: number;
  // Smallest top inset that keeps content below the iPad top tab bar.
  minimumTop: number;
};

const TabChromeContext = React.createContext<TabChromeLayout>({
  bottomNavigationShown: false,
  leadingRailWidth: 0,
  minimumTop: 0
});

// Insets of the current tab's content area, including the space the native tab
// chrome occupies (bottom capsule, Duo column, iPad top bar, Android rail).
//
// On Android the tab content extends edge to edge under the Material bottom
// navigation, and the nested safe area reports only the system navigation bar
// (gesture or 3-button), so the bottom navigation's height is added here.
export function useTabContentInsets(): { bottom: number; left: number; right: number; top: number } {
  const insets = useSafeAreaInsets();
  const chrome = React.useContext(TabChromeContext);
  return {
    ...insets,
    bottom: chrome.bottomNavigationShown ? insets.bottom + ANDROID_BOTTOM_NAVIGATION_HEIGHT : insets.bottom,
    left: chrome.leadingRailWidth > 0 ? insets.left + chrome.leadingRailWidth : insets.left,
    top: Math.max(insets.top, chrome.minimumTop)
  };
}

// Reports the current tab's content insets to the screen that lays the content
// out (for example PracticePocScreen, which sizes its shell from them). Mount it
// inside renderTab. It does not report on unmount: switching tabs mounts the
// next tab's reporter before the previous one's cleanup would run, so a reset
// there would overwrite the new tab's insets. Callers ignore the value while
// the chrome is hidden.
export function TabContentInsetsReporter({
  onChange
}: {
  onChange: (insets: { bottom: number; left: number; right: number; top: number }) => void;
}): null {
  const insets = useTabContentInsets();
  const { bottom, left, right, top } = insets;
  React.useLayoutEffect(() => {
    onChange({ bottom, left, right, top });
  }, [bottom, left, onChange, right, top]);
  return null;
}

const styles = StyleSheet.create({
  railLayout: { flex: 1 },
  railOverlay: { bottom: 0, left: 0, position: "absolute", top: 0 }
});
