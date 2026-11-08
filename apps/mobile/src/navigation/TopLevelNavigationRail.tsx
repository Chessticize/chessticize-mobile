// Material navigation rail for Android tablets and unfolded foldables (>= 600 dp).
// react-native-screens has no Android rail, so the app draws this one next to
// the native host (whose bottom navigation is hidden at these widths). Styled
// to Material 3 rail metrics with the direction A tokens; iOS never uses it.
import React from "react";
import { Pressable, Text, View } from "react-native";
import { makeStyles, useTheme } from "../theme";
import { Icon } from "../components/ui/Icon.tsx";
import { TOP_LEVEL_TABS, reviewTabBadge, type TopLevelTab } from "./topLevelNavigation.ts";

export const NAVIGATION_RAIL_WIDTH = 80;

export function TopLevelNavigationRail({
  dueReviewCount,
  insets,
  overdueReviewCount,
  selectedTab,
  onSelect
}: {
  dueReviewCount: number;
  insets: { bottom: number; left: number; top: number };
  overdueReviewCount: number;
  selectedTab: TopLevelTab;
  onSelect: (tab: TopLevelTab) => void;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const badge = reviewTabBadge(dueReviewCount, overdueReviewCount);
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.rail,
        {
          paddingBottom: insets.bottom + 12,
          paddingLeft: insets.left,
          paddingTop: insets.top + 44,
          width: NAVIGATION_RAIL_WIDTH + insets.left
        }
      ]}
      testID="navigation-rail"
    >
      {TOP_LEVEL_TABS.map((item) => {
        const active = item.tab === selectedTab;
        const itemBadge = item.tab === "review" ? badge : null;
        const color = active ? theme.colors.accent.s700 : theme.colors.text.secondary;
        return (
          <Pressable
            key={item.tab}
            accessibilityLabel={[`${item.label} tab`, itemBadge?.accessibilityLabel].filter(Boolean).join(", ")}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={styles.item}
            testID={item.testID}
            onPress={() => onSelect(item.tab)}
          >
            <View style={[styles.indicator, active ? styles.indicatorActive : null]}>
              <Icon color={color} name={item.icon} size={24} testID={`${item.testID}-icon`} />
              {itemBadge ? (
                <Text
                  allowFontScaling={false}
                  style={[styles.badge, itemBadge.tone === "danger" ? styles.badgeDanger : null]}
                  testID={`${item.testID}-badge`}
                >
                  {itemBadge.text}
                </Text>
              ) : null}
            </View>
            <Text numberOfLines={1} style={[styles.label, { color }, active ? styles.labelActive : null]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  rail: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceRaised,
    gap: 12
  },
  item: {
    alignItems: "center",
    gap: 4,
    minHeight: 56,
    width: NAVIGATION_RAIL_WIDTH
  },
  indicator: {
    alignItems: "center",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 56
  },
  indicatorActive: {
    backgroundColor: theme.colors.accent.s100
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16
  },
  labelActive: {
    fontWeight: "700"
  },
  badge: {
    backgroundColor: theme.colors.accent.s600,
    borderRadius: 8,
    color: theme.colors.text.onAccent,
    fontSize: 11,
    fontWeight: "600",
    left: 30,
    lineHeight: 16,
    minWidth: 16,
    overflow: "hidden",
    paddingHorizontal: 4,
    position: "absolute",
    textAlign: "center",
    top: 0
  },
  badgeDanger: {
    backgroundColor: theme.colors.danger.s600
  }
}));
