// NativeTabHost through the maintained react-native-screens fake
// (src/navigation/nativeTabsFake.tsx), which Jest resolves in place of the
// native container.
import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import * as ReactNative from "react-native";
import { Platform, Text } from "react-native";
import * as SafeAreaContext from "react-native-safe-area-context";
import { NativeTabHost, TabContentInsetsReporter, useTabContentInsets, type NativeTabHostColors } from "../src/navigation/NativeTabHost";
import type { TopLevelTab } from "../src/navigation/topLevelNavigation";

const safeArea = SafeAreaContext as unknown as {
  __resetSafeAreaInsets(): void;
  __setSafeAreaInsets(insets: Partial<Record<"top" | "right" | "bottom" | "left", number>>): void;
};
const reactNative = ReactNative as unknown as {
  __resetWindowDimensions(): void;
  __setWindowDimensions(dimensions: { height: number; width: number }): void;
};

const colors: NativeTabHostColors = {
  accent: "accent",
  androidBarBackground: "bar",
  androidIndicator: "indicator",
  androidInactive: "inactive",
  background: "background",
  badgeBackground: "badge",
  badgeDangerBackground: "danger",
  badgeText: "badgeText"
};

function InsetsProbe({ tab }: { tab: TopLevelTab }): React.JSX.Element {
  const insets = useTabContentInsets();
  return <Text testID={`content-${tab}`}>{`${insets.top} ${insets.right} ${insets.bottom} ${insets.left}`}</Text>;
}

function Harness({
  chromeHidden = false,
  guard,
  onOutcome
}: {
  chromeHidden?: boolean;
  // Returns the tab the app accepts for a person's selection.
  guard?: (tab: TopLevelTab, current: TopLevelTab) => TopLevelTab;
  onOutcome?: jest.Mock;
}): React.JSX.Element {
  const [selectedTab, setSelectedTab] = React.useState<TopLevelTab>("practice");
  return (
    <>
      <Text testID="app-selected-tab">{selectedTab}</Text>
      <Text testID="go-settings" onPress={() => setSelectedTab("settings")}>settings</Text>
      <NativeTabHost
        chromeHidden={chromeHidden}
        colorScheme="light"
        colors={colors}
        dueReviewCount={3}
        overdueReviewCount={0}
        selectedTab={selectedTab}
        onSelectionOutcome={(outcome) => {
          onOutcome?.(outcome);
          setSelectedTab((current) => guard ? guard(outcome.tab, current) : outcome.tab);
        }}
        renderTab={(tab) => (tab === selectedTab ? <InsetsProbe tab={tab} /> : null)}
      />
    </>
  );
}

const mounted: ReactTestRenderer[] = [];

function render(element: React.ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  mounted.push(renderer!);
  return renderer!;
}

function textOf(renderer: ReactTestRenderer, testID: string): string {
  return renderer.root.findAll((node) => node.props.testID === testID && typeof node.type === "string")[0]
    .props.children as string;
}

function hasTestID(renderer: ReactTestRenderer, testID: string): boolean {
  return renderer.root.findAll((node) => node.props.testID === testID).length > 0;
}

function press(renderer: ReactTestRenderer, testID: string): void {
  const node = renderer.root.findAll((candidate) => candidate.props.testID === testID && typeof candidate.props.onPress === "function")[0];
  act(() => {
    node.props.onPress();
  });
}

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((renderer) => renderer.unmount());
  });
  safeArea.__resetSafeAreaInsets();
  reactNative.__resetWindowDimensions();
  (Platform as { OS: string }).OS = "ios";
  delete (Platform as { isPad?: boolean }).isPad;
  delete (Platform as { Version?: string | number }).Version;
});

describe("NativeTabHost", () => {
  it("shows the selected tab and follows a person's selection", () => {
    const onOutcome = jest.fn();
    const renderer = render(<Harness onOutcome={onOutcome} />);
    expect(hasTestID(renderer, "content-practice")).toBe(true);

    press(renderer, "history-tab");

    expect(onOutcome).toHaveBeenCalledWith({ kind: "select", tab: "history" });
    expect(textOf(renderer, "app-selected-tab")).toBe("history");
    expect(hasTestID(renderer, "content-history")).toBe(true);
    expect(hasTestID(renderer, "content-practice")).toBe(false);
  });

  it("applies the app's own selection without reporting it back", () => {
    const onOutcome = jest.fn();
    const renderer = render(<Harness onOutcome={onOutcome} />);

    press(renderer, "go-settings");

    expect(onOutcome).not.toHaveBeenCalled();
    expect(hasTestID(renderer, "content-settings")).toBe(true);
  });

  it("moves the host back when the app keeps the current tab", () => {
    const renderer = render(<Harness guard={(_tab, current) => current} />);

    press(renderer, "review-tab");

    expect(textOf(renderer, "app-selected-tab")).toBe("practice");
    expect(hasTestID(renderer, "content-practice")).toBe(true);
  });

  it("reports a repeated selection as a reselect", () => {
    const onOutcome = jest.fn();
    const renderer = render(<Harness onOutcome={onOutcome} />);

    press(renderer, "practice-tab");

    expect(onOutcome).toHaveBeenCalledWith({ kind: "reselect", tab: "practice" });
  });

  it("labels the Review badge for assistive technology", () => {
    const renderer = render(<Harness />);
    const review = renderer.root.findAll((node) => node.props.testID === "review-tab" && node.props.accessibilityLabel)[0];
    expect(review.props.accessibilityLabel).toBe("Review tab, 3 due reviews");
    expect(hasTestID(renderer, "review-tab-badge")).toBe(true);
  });

  it("hides every tab chrome while a focused surface owns the screen", () => {
    reactNative.__setWindowDimensions({ height: 1032, width: 1376 });
    const renderer = render(<Harness chromeHidden />);
    expect(renderer.root.findAll((node) => String(node.props.testID).startsWith("native-tab-chrome-"))).toHaveLength(0);
    expect(hasTestID(renderer, "practice-tab")).toBe(false);
  });

  it.each([
    { label: "iPhone 17", width: 402, height: 874, insets: { top: 62, bottom: 34 }, chrome: "bottomBar", content: "62 0 83 0" },
    { label: "iPhone Duo outer display", width: 466, height: 678, insets: { right: 84, bottom: 34 }, chrome: "trailingColumn", content: "0 84 34 0" },
    { label: "iPad 13-inch portrait", width: 1032, height: 1376, insets: { top: 24, bottom: 20 }, chrome: "topBar", content: "96 0 20 0" },
    { label: "iPad 13-inch landscape", width: 1376, height: 1032, insets: { top: 24, bottom: 20 }, chrome: "topBar", content: "96 0 20 0" },
    { label: "iPad Split View half", width: 684, height: 1032, insets: { top: 24, bottom: 20 }, chrome: "bottomBar", content: "24 0 69 0" }
  ])("places the chrome for $label and insets the content", ({ chrome, content, height, insets, width }) => {
    reactNative.__setWindowDimensions({ height, width });
    safeArea.__setSafeAreaInsets(insets);
    const renderer = render(<Harness />);
    expect(hasTestID(renderer, `native-tab-chrome-${chrome}`)).toBe(true);
    expect(textOf(renderer, "content-practice")).toBe(content);
  });

  it("shows only the top tab bar on iPad, with no sidebar toggle, in both orientations", () => {
    (Platform as { isPad?: boolean }).isPad = true;
    for (const [width, height] of [[1032, 1376], [1376, 1032]]) {
      reactNative.__setWindowDimensions({ height, width });
      const renderer = render(<Harness />);
      expect(hasTestID(renderer, "native-tab-chrome-topBar")).toBe(true);
      expect(hasTestID(renderer, "native-tab-sidebar-toggle")).toBe(false);
      expect(hasTestID(renderer, "native-tab-chrome-sidebar")).toBe(false);
    }
  });

  // The react-native-screens patch (patches/react-native-screens@4.30.1.patch)
  // copies tabBarItemTestID onto the iOS UITab, which the iPad floating tab bar
  // reads; iPad uses the plain tab bar mode.
  it("passes what the react-native-screens patch relies on", () => {
    (Platform as { isPad?: boolean; Version?: string | number }).isPad = true;
    (Platform as { Version?: string | number }).Version = "27.0";
    const iPad = render(<Harness />);
    const iPadHost = iPad.root.findAll((node) => node.props.navStateRequest !== undefined)[0];
    expect(iPadHost.props.ios.tabBarControllerMode).toBe("tabBar");
    expect(iPadHost.props.ios.tabBarSidebarPreferredPlacement).toBeUndefined();
    const screens = React.Children.toArray(iPadHost.props.children as React.ReactNode)
      .filter((child): child is React.ReactElement<{
        ios: { overrideScrollViewContentInsetAdjustmentBehavior?: boolean };
        screenKey: string;
        tabBarItemTestID: string;
      }> => React.isValidElement(child));
    expect(screens.map((screen) => [screen.props.screenKey, screen.props.tabBarItemTestID])).toEqual([
      ["practice", "practice-tab"],
      ["review", "review-tab"],
      ["history", "history-tab"],
      ["settings", "settings-tab"]
    ]);
    // Content insets come from useTabContentInsets, so UIKit must not add its
    // automatic scroll view insets on top.
    for (const screen of screens) {
      expect(screen.props.ios.overrideScrollViewContentInsetAdjustmentBehavior).toBe(false);
    }

    // iOS 26+ keeps the tab bar expanded while content scrolls.
    expect(iPadHost.props.ios.tabBarMinimizeBehavior).toBe("never");

    // iPadOS before 18 has no tab bar controller mode, and iOS before 26 no
    // minimize behavior; both props stay at their defaults there.
    (Platform as { Version?: string | number }).Version = "17.5";
    const olderIPad = render(<Harness />);
    const olderIPadHost = olderIPad.root.findAll((node) => node.props.navStateRequest !== undefined)[0];
    expect(olderIPadHost.props.ios.tabBarControllerMode).toBe("automatic");
    expect(olderIPadHost.props.ios.tabBarMinimizeBehavior).toBeUndefined();
    (Platform as { Version?: string | number }).Version = "27.0";

    // iPhone, including both iPhone Duo displays: no mode override, so the
    // system placement applies.
    (Platform as { isPad?: boolean }).isPad = false;
    const iPhone = render(<Harness />);
    const iPhoneHost = iPhone.root.findAll((node) => node.props.navStateRequest !== undefined)[0];
    expect(iPhoneHost.props.ios.tabBarControllerMode).toBe("automatic");
  });

  it("keeps the new tab's content insets when tab content moves to another native screen", () => {
    // Native tab screens are separate containers, so switching tabs unmounts
    // the previous screen's reporter while the next one mounts.
    safeArea.__setSafeAreaInsets({ top: 62, bottom: 34 });
    const onChange = jest.fn();
    const renderer = render(<TabContentInsetsReporter key="practice" onChange={onChange} />);
    act(() => {
      renderer.update(<TabContentInsetsReporter key="review" onChange={onChange} />);
    });
    expect(onChange).toHaveBeenLastCalledWith({ bottom: 34, left: 0, right: 0, top: 62 });
  });

  it("uses Material bottom navigation on Android", () => {
    (Platform as { OS: string }).OS = "android";
    safeArea.__setSafeAreaInsets({ bottom: 24 });
    const renderer = render(<Harness />);
    expect(hasTestID(renderer, "native-tab-chrome-bottomNavigation")).toBe(true);
    expect(textOf(renderer, "content-practice")).toBe("0 0 104 0");

    act(() => {
      renderer.update(<Harness chromeHidden />);
    });
    expect(textOf(renderer, "content-practice")).toBe("0 0 24 0");
  });
});
