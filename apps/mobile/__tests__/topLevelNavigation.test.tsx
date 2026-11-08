import { ICONS } from "../src/components/ui/iconNames";
import {
  TOP_LEVEL_TABS,
  initialNativeTabSelection,
  iosMajorVersion,
  nativeTabBarMinimizeBehavior,
  nativeTabControllerMode,
  placeholderIdiomForWindow,
  isTopLevelChromeVisible,
  nativeTabSelectionRequest,
  reconcileNativeTabSelection,
  resolveTopLevelChromePlacement,
  reviewTabBadge,
  topLevelTabIntent,
  type TopLevelChromeInputs
} from "../src/navigation/topLevelNavigation";

const noInsets = { top: 0, right: 0, bottom: 0, left: 0 };

describe("top-level tabs", () => {
  it("takes each tab icon from the shared icon map", () => {
    expect(TOP_LEVEL_TABS.map((item) => [item.icon, item.sfSymbol, ICONS[item.icon].material, item.androidDrawable])).toEqual([
      ["tabPractice", "target", "target", "ic_tab_practice"],
      ["tabReview", "arrow.counterclockwise", "replay", "ic_tab_review"],
      ["tabHistory", "clock.arrow.circlepath", "history", "ic_tab_history"],
      ["tabSettings", "gearshape", "settings", "ic_tab_settings"]
    ]);
  });

  it("keeps the four product tabs, their order and their Detox test IDs", () => {
    expect(TOP_LEVEL_TABS.map((item) => [item.tab, item.label, item.testID])).toEqual([
      ["practice", "Practice", "practice-tab"],
      ["review", "Review", "review-tab"],
      ["history", "History", "history-tab"],
      ["settings", "Settings", "settings-tab"]
    ]);
  });

  it("routes Review to the due queue and other tabs to their root", () => {
    expect(topLevelTabIntent("review")).toEqual({ kind: "open-review-queue" });
    expect(topLevelTabIntent("history")).toEqual({ kind: "show-tab", tab: "history" });
  });
});

describe("native tab selection reconciliation", () => {
  it("bases each request on the last confirmed provenance", () => {
    const state = { confirmedTab: "history" as const, provenance: 4 };
    expect(nativeTabSelectionRequest(state, "settings")).toEqual({
      baseProvenance: 4,
      selectedScreenKey: "settings"
    });
  });

  it("reports a person's selection and records the new provenance", () => {
    const result = reconcileNativeTabSelection(initialNativeTabSelection("practice"), {
      actionOrigin: "user",
      isRepeated: false,
      provenance: 1,
      selectedScreenKey: "history"
    });
    expect(result.outcome).toEqual({ kind: "select", tab: "history" });
    expect(result.state).toEqual({ confirmedTab: "history", provenance: 1 });
  });

  it("does not report the app's own request back to the app", () => {
    const result = reconcileNativeTabSelection(initialNativeTabSelection("practice"), {
      actionOrigin: "programmatic-js",
      isRepeated: false,
      provenance: 1,
      selectedScreenKey: "settings"
    });
    expect(result.outcome).toEqual({ kind: "none" });
    expect(result.state.confirmedTab).toBe("settings");
  });

  it("reports a repeated selection of the current tab as a reselect", () => {
    const result = reconcileNativeTabSelection({ confirmedTab: "review", provenance: 2 }, {
      actionOrigin: "user",
      isRepeated: true,
      provenance: 3,
      selectedScreenKey: "review"
    });
    expect(result.outcome).toEqual({ kind: "reselect", tab: "review" });
  });

  it("ignores stale and unknown reports", () => {
    const state = { confirmedTab: "review" as const, provenance: 5 };
    expect(reconcileNativeTabSelection(state, {
      actionOrigin: "user",
      isRepeated: false,
      provenance: 4,
      selectedScreenKey: "history"
    })).toEqual({ outcome: { kind: "none" }, state });
    expect(reconcileNativeTabSelection(state, {
      actionOrigin: "user",
      isRepeated: false,
      provenance: 6,
      selectedScreenKey: "analysis"
    })).toEqual({ outcome: { kind: "none" }, state });
  });
});

describe("top-level chrome visibility", () => {
  const idle: TopLevelChromeInputs = {
    feedbackSnapshotVisible: false,
    openSession: false,
    personalBestGuideVisible: false,
    personalBestHubVisible: false,
    personalBestRecordsVisible: false,
    reviewSurfaceOpen: false,
    sessionGuideVisible: false,
    sprintResultVisible: false
  };

  it("shows global navigation only when no focused surface owns the screen", () => {
    expect(isTopLevelChromeVisible(idle)).toBe(true);
    for (const key of Object.keys(idle) as Array<keyof TopLevelChromeInputs>) {
      expect(isTopLevelChromeVisible({ ...idle, [key]: true })).toBe(false);
    }
  });
});

describe("review tab badge", () => {
  it("is absent without due reviews and caps the count", () => {
    expect(reviewTabBadge(0, 0)).toBeNull();
    expect(reviewTabBadge(3, 0)).toEqual({ accessibilityLabel: "3 due reviews", text: "3", tone: "default" });
    expect(reviewTabBadge(120, 4)).toEqual({ accessibilityLabel: "120 due reviews, 4 overdue", text: "99+", tone: "danger" });
  });
});

describe("native tab controller mode", () => {
  it("uses the plain tab bar mode on iPad, so no sidebar or sidebar toggle appears", () => {
    expect(nativeTabControllerMode("pad", 18)).toBe("tabBar");
    expect(nativeTabControllerMode("pad", 27)).toBe("tabBar");
  });

  it("leaves the mode at its default before iOS 18, where the API does not exist", () => {
    expect(nativeTabControllerMode("pad", 17)).toBe("automatic");
    expect(nativeTabControllerMode("pad", 15)).toBe("automatic");
  });

  it("never overrides system placement on iPhone, including both iPhone Duo displays", () => {
    expect(nativeTabControllerMode("phone", 27)).toBe("automatic");
  });

  it("keeps the iOS 26+ tab bar from minimizing, and requests nothing earlier", () => {
    expect(nativeTabBarMinimizeBehavior(26)).toBe("never");
    expect(nativeTabBarMinimizeBehavior(27)).toBe("never");
    expect(nativeTabBarMinimizeBehavior(25)).toBeUndefined();
  });

  it("reads the iOS major version from Platform.Version", () => {
    expect(iosMajorVersion("26.1")).toBe(26);
    expect(iosMajorVersion(18)).toBe(18);
    expect(iosMajorVersion("unknown")).toBe(0);
  });
});

describe("tab chrome placement", () => {
  it.each([
    { label: "iPhone 17 portrait", idiom: "phone", width: 402, height: 874, insets: { top: 62, right: 0, bottom: 34, left: 0 }, expected: "bottomBar" },
    { label: "iPhone SE portrait", idiom: "phone", width: 375, height: 667, insets: { top: 20, right: 0, bottom: 0, left: 0 }, expected: "bottomBar" },
    { label: "iPhone Duo outer display", idiom: "phone", width: 466, height: 678, insets: { top: 0, right: 84, bottom: 34, left: 0 }, expected: "trailingColumn" },
    { label: "iPhone Duo outer display, camera on the left", idiom: "phone", width: 466, height: 678, insets: { top: 0, right: 0, bottom: 34, left: 84 }, expected: "leadingColumn" },
    { label: "iPhone Duo inner display, portrait", idiom: "phone", width: 669, height: 951, insets: { top: 0, right: 0, bottom: 20, left: 0 }, expected: "bottomBar" },
    { label: "iPhone Duo inner display, landscape", idiom: "phone", width: 951, height: 669, insets: { top: 0, right: 0, bottom: 20, left: 0 }, expected: "trailingColumn" },
    { label: "compact wide-short window", idiom: "phone", width: 844, height: 390, insets: { top: 0, right: 62, bottom: 21, left: 62 }, expected: "bottomBar" },
    { label: "iPad 13-inch portrait", idiom: "pad", width: 1032, height: 1376, insets: { top: 24, right: 0, bottom: 20, left: 0 }, expected: "topBar" },
    { label: "iPad 13-inch landscape", idiom: "pad", width: 1376, height: 1032, insets: { top: 24, right: 0, bottom: 20, left: 0 }, expected: "topBar" },
    { label: "iPad 11-inch landscape", idiom: "pad", width: 1210, height: 834, insets: { top: 24, right: 0, bottom: 20, left: 0 }, expected: "topBar" },
    { label: "iPad compact Split View", idiom: "pad", width: 507, height: 1032, insets: { top: 24, right: 0, bottom: 20, left: 0 }, expected: "bottomBar" }
  ] as const)("$label uses $expected", ({ expected, height, idiom, insets, width }) => {
    expect(resolveTopLevelChromePlacement({ height, idiom, insets, platform: "ios", width })).toBe(expected);
  });

  it.each([
    { label: "Android phone", width: 411, height: 914, expected: "bottomNavigation" },
    { label: "Android phone landscape", width: 914, height: 411, expected: "navigationRail" },
    { label: "Android foldable folded", width: 599, height: 900, expected: "bottomNavigation" },
    { label: "Android foldable unfolded", width: 673, height: 841, expected: "navigationRail" },
    { label: "Android tablet", width: 1280, height: 800, expected: "navigationRail" }
  ] as const)("$label uses $expected on Android", ({ expected, height, width }) => {
    expect(resolveTopLevelChromePlacement({ height, idiom: "phone", insets: noInsets, platform: "android", width })).toBe(expected);
  });

  it("guesses the placeholder idiom from the window", () => {
    expect(placeholderIdiomForWindow(1032, 1376)).toBe("pad");
    expect(placeholderIdiomForWindow(1133, 744)).toBe("pad");
    expect(placeholderIdiomForWindow(951, 669)).toBe("phone");
    expect(placeholderIdiomForWindow(402, 874)).toBe("phone");
  });
});
