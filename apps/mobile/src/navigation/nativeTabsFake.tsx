// Maintained fake of react-native-screens `Tabs` for hosts that cannot run the
// native tab container: Jest (moduleNameMapper) and the Interaction Lab (vite
// alias). It keeps the public contract NativeTabHost relies on (navStateRequest
// with provenance, onTabSelected with actionOrigin, tabBarHidden, per-item
// test IDs and badges) and draws a faithful placeholder of the system chrome:
// the floating glass capsule on iPhone, the vertical column on iPhone Duo, the
// top bar on iPad, and Material bottom navigation on
// Android. It does not prove Liquid Glass; native evidence comes from
// simulators.
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { usePracticeViewport } from "../components/PracticeViewport.tsx";
import { makeStyles, useTheme } from "../theme";
import { Icon } from "../components/ui/Icon.tsx";
import {
  isTopLevelTab,
  topLevelTabItem,
  placeholderIdiomForWindow,
  resolveTopLevelChromePlacement,
  type TopLevelChromePlacement
} from "./topLevelNavigation.ts";

type FakeNavStateRequest = { baseProvenance: number; selectedScreenKey: string };

type FakeTabSelectedEvent = {
  actionOrigin: "user" | "programmatic-js";
  hasTriggeredSpecialEffect: boolean;
  isRepeated: boolean;
  provenance: number;
  selectedScreenKey: string;
};

type FakeHostProps = {
  children?: React.ReactNode;
  colorScheme?: "light" | "dark" | "inherit";
  navStateRequest: FakeNavStateRequest;
  onTabSelected?: (event: { nativeEvent: FakeTabSelectedEvent }) => void;
  tabBarHidden?: boolean;
};

type FakeScreenProps = {
  badgeValue?: string;
  children?: React.ReactNode;
  screenKey: string;
  tabBarItemAccessibilityLabel?: string;
  tabBarItemTestID?: string;
  title?: string;
};

// Chrome geometry measured on the iOS 27 simulators (#612 spike).
export const FAKE_TAB_CHROME = {
  androidBarHeight: 80,
  bottomBarHeight: 49,
  columnWidth: 64,
  topBarHeight: 72
} as const;

function FakeScreen(): React.JSX.Element {
  // Screens are drawn by FakeHost; a bare Screen renders nothing.
  return <></>;
}

function FakeHost({
  children,
  navStateRequest,
  onTabSelected,
  tabBarHidden = false
}: FakeHostProps): React.JSX.Element {
  const styles = useStyles();
  const baseInsets = useSafeAreaInsets();
  const { height, width } = usePracticeViewport();
  const screens = React.Children.toArray(children)
    .filter((child): child is React.ReactElement<FakeScreenProps> => React.isValidElement(child))
    .map((child) => child.props);
  const [state, setState] = React.useState({
    provenance: 0,
    selectedScreenKey: navStateRequest.selectedScreenKey
  });
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const emit = React.useCallback((event: FakeTabSelectedEvent) => {
    onTabSelected?.({ nativeEvent: event });
  }, [onTabSelected]);

  const select = React.useCallback((screenKey: string, actionOrigin: FakeTabSelectedEvent["actionOrigin"]) => {
    const current = stateRef.current;
    const next = { provenance: current.provenance + 1, selectedScreenKey: screenKey };
    stateRef.current = next;
    setState(next);
    emit({
      actionOrigin,
      hasTriggeredSpecialEffect: false,
      isRepeated: current.selectedScreenKey === screenKey,
      provenance: next.provenance,
      selectedScreenKey: screenKey
    });
  }, [emit]);

  // Apply JS requests the way the native host does: a request for another tab
  // based on the current (or a newer) provenance is applied and reported.
  const { baseProvenance, selectedScreenKey: requestedKey } = navStateRequest;
  React.useEffect(() => {
    const current = stateRef.current;
    if (requestedKey !== current.selectedScreenKey && baseProvenance >= current.provenance) {
      select(requestedKey, "programmatic-js");
    }
  }, [baseProvenance, requestedKey, select]);

  const effectivePlacement: TopLevelChromePlacement = resolveTopLevelChromePlacement({
    height,
    idiom: placeholderIdiomForWindow(width, height),
    insets: baseInsets,
    platform: Platform.OS === "android" ? "android" : "ios",
    width
  });
  const contentInsets = tabBarHidden
    ? baseInsets
    : insetsForPlacement(effectivePlacement, baseInsets);
  const selected = screens.find((screen) => screen.screenKey === state.selectedScreenKey) ?? screens[0];
  const items = screens.map((screen) => ({
    active: screen.screenKey === selected?.screenKey,
    screen
  }));
  const content = (
    <SafeAreaInsetsContext.Provider value={contentInsets}>
      <View style={styles.content} testID="native-tab-host-content">
        {selected?.children}
      </View>
    </SafeAreaInsetsContext.Provider>
  );

  // At >= 600 dp NativeTabHost draws the app's navigation rail and hides the
  // host's bottom navigation, so the fake draws no chrome there.
  if (effectivePlacement === "bottomNavigation" || effectivePlacement === "navigationRail") {
    return (
      <View style={styles.host} testID="native-tab-host">
        {/* Like the native host, content runs edge to edge under the bar and
            reports only the system insets; NativeTabHost adds the bar. */}
        <SafeAreaInsetsContext.Provider value={baseInsets}>
          <View style={styles.content} testID="native-tab-host-content">
            {selected?.children}
          </View>
        </SafeAreaInsetsContext.Provider>
        {tabBarHidden || effectivePlacement === "navigationRail" ? null : (
          <View
            accessibilityRole="tablist"
            style={[styles.androidBar, styles.androidBarOverlay, { paddingBottom: baseInsets.bottom }]}
            testID="native-tab-chrome-bottomNavigation"
          >
            {items.map(({ active, screen }) => (
              <FakeTabItem
                key={screen.screenKey}
                active={active}
                presentation="android"
                screen={screen}
                onPress={() => select(screen.screenKey, "user")}
              />
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.host} testID="native-tab-host">
      {content}
      {tabBarHidden ? null : (
        <FakeChrome
          baseInsets={baseInsets}
          items={items}
          placement={effectivePlacement}
          onSelect={(screenKey) => select(screenKey, "user")}
        />
      )}
    </View>
  );
}

function insetsForPlacement(
  placement: TopLevelChromePlacement,
  insets: { bottom: number; left: number; right: number; top: number }
): { bottom: number; left: number; right: number; top: number } {
  switch (placement) {
    case "bottomBar":
      return { ...insets, bottom: insets.bottom + FAKE_TAB_CHROME.bottomBarHeight };
    case "topBar":
      return { ...insets, top: insets.top + FAKE_TAB_CHROME.topBarHeight };
    // The Duo column shares the status bar column, which the window insets
    // already reserve.
    case "trailingColumn":
    case "leadingColumn":
    case "bottomNavigation":
    case "navigationRail":
      return insets;
  }
}

type FakeItem = { active: boolean; screen: FakeScreenProps };

function FakeChrome({
  baseInsets,
  items,
  placement,
  onSelect
}: {
  baseInsets: { bottom: number; left: number; right: number; top: number };
  items: FakeItem[];
  placement: Exclude<TopLevelChromePlacement, "bottomNavigation" | "navigationRail">;
  onSelect: (screenKey: string) => void;
}): React.JSX.Element {
  const styles = useStyles();
  if (placement === "trailingColumn" || placement === "leadingColumn") {
    const side = placement === "trailingColumn" ? baseInsets.right : baseInsets.left;
    return (
      <View
        pointerEvents="box-none"
        style={[
          styles.columnFrame,
          placement === "trailingColumn" ? { right: 0 } : { left: 0 },
          { bottom: baseInsets.bottom, width: Math.max(side, FAKE_TAB_CHROME.columnWidth) }
        ]}
        testID={`native-tab-chrome-${placement}`}
      >
        <View accessibilityRole="tablist" style={[styles.capsule, styles.columnCapsule]}>
          {items.map(({ active, screen }) => (
            <FakeTabItem key={screen.screenKey} active={active} presentation="column" screen={screen} onPress={() => onSelect(screen.screenKey)} />
          ))}
        </View>
      </View>
    );
  }
  const top = placement === "topBar";
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.barFrame,
        top
          ? { top: baseInsets.top + 8, alignItems: "center" }
          : { bottom: Math.max(baseInsets.bottom - 14, 8), paddingHorizontal: 20 + Math.max(baseInsets.left, baseInsets.right) }
      ]}
      testID={`native-tab-chrome-${placement}`}
    >
      <View accessibilityRole="tablist" style={[styles.capsule, styles.barCapsule, top ? styles.topCapsule : null]}>
        {items.map(({ active, screen }) => (
          <FakeTabItem key={screen.screenKey} active={active} presentation={top ? "top" : "bottom"} screen={screen} onPress={() => onSelect(screen.screenKey)} />
        ))}
      </View>
    </View>
  );
}

function FakeTabItem({
  active,
  presentation,
  screen,
  onPress
}: {
  active: boolean;
  presentation: "android" | "bottom" | "column" | "top";
  screen: FakeScreenProps;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const color = active ? theme.colors.accent.s600 : theme.colors.text.secondary;
  const tab = isTopLevelTab(screen.screenKey) ? screen.screenKey : null;
  const showLabel = presentation !== "column";
  const showIcon = presentation !== "top";
  return (
    <Pressable
      accessibilityLabel={screen.tabBarItemAccessibilityLabel ?? screen.title}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[
        styles.item,
        presentation === "bottom" ? styles.itemBottom : null,
        presentation === "column" ? styles.itemColumn : null,
        presentation === "top" ? styles.itemTop : null,
        presentation === "android" ? styles.itemAndroid : null,
        active && presentation !== "android" ? styles.itemActive : null,
      ]}
      testID={screen.tabBarItemTestID}
      onPress={onPress}
    >
      {showIcon ? (
        <View style={[styles.iconSlot, active && presentation === "android" ? styles.androidIndicator : null]}>
          {tab ? (
            <Icon
              color={color}
              name={topLevelTabItem(tab).icon}
              size={24}
              testID={`${screen.tabBarItemTestID ?? screen.screenKey}-icon`}
            />
          ) : null}
          {screen.badgeValue ? (
            <Text allowFontScaling={false} style={styles.badge} testID={`${screen.tabBarItemTestID ?? screen.screenKey}-badge`}>
              {screen.badgeValue}
            </Text>
          ) : null}
        </View>
      ) : null}
      {showLabel ? (
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            presentation === "top" ? styles.labelTop : null,
            { color },
            active ? styles.labelActive : null
          ]}
        >
          {screen.title}
        </Text>
      ) : null}
      {/* The iPad top bar is text only, with the badge beside the title. */}
      {presentation === "top" && screen.badgeValue ? (
        <Text allowFontScaling={false} style={[styles.badge, styles.badgeInline]} testID={`${screen.tabBarItemTestID ?? screen.screenKey}-badge`}>
          {screen.badgeValue}
        </Text>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  host: { flex: 1 },
  content: { flex: 1 },
  barFrame: { left: 0, position: "absolute", right: 0 },
  columnFrame: { alignItems: "center", position: "absolute" },
  capsule: {
    backgroundColor: theme.colors.glassStrong,
    borderColor: theme.colors.border.default,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    shadowColor: theme.colors.shadow,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 24
  },
  barCapsule: { flexDirection: "row" },
  topCapsule: { alignItems: "center", gap: 2 },
  columnCapsule: { gap: 4 },
  item: { alignItems: "center", justifyContent: "center" },
  itemBottom: { borderRadius: 999, flex: 1, gap: 2, minHeight: 54, paddingVertical: 4 },
  itemColumn: { borderRadius: 999, height: 52, width: 52 },
  itemTop: { borderRadius: 999, flexDirection: "row", gap: 4, minHeight: 36, paddingHorizontal: 14 },
  badgeInline: { position: "relative", right: 0, top: -6 },
  itemAndroid: { flex: 1, gap: 4, paddingVertical: 12 },
  itemActive: { backgroundColor: theme.colors.fillMuted },
  iconSlot: { alignItems: "center", height: 28, justifyContent: "center", width: 40 },
  androidIndicator: { backgroundColor: theme.colors.accent.s100, borderRadius: 999, width: 64 },
  androidBarOverlay: { bottom: 0, left: 0, position: "absolute", right: 0 },
  androidBar: {
    backgroundColor: theme.colors.surfaceRaised,
    flexDirection: "row",
    minHeight: FAKE_TAB_CHROME.androidBarHeight
  },
  label: { fontSize: 10, fontWeight: "500" },
  labelTop: { fontSize: 15 },
  labelActive: { fontWeight: "600" },
  badge: {
    backgroundColor: theme.colors.danger.s600,
    borderRadius: 999,
    color: theme.colors.text.onAccent,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
    minWidth: 18,
    overflow: "hidden",
    paddingHorizontal: 5,
    position: "absolute",
    right: -2,
    textAlign: "center",
    top: -4
  }
}));

export const Tabs = {
  Host: FakeHost,
  Screen: FakeScreen
};
