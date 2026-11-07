import {
  buildPracticeAdaptiveLayout,
  PRACTICE_UI_PADDING,
  type PracticeSafeAreaInsets
} from "../src/components/adaptivePracticeLayout";

describe("buildPracticeAdaptiveLayout", () => {
  it.each([
    {
      expectedHeight: 96,
      fontScale: 1,
      height: 956,
      label: "ordinary portrait slot",
      width: 440
    },
    {
      expectedHeight: 112,
      fontScale: 1,
      height: 700,
      label: "narrow prompt slot",
      width: 280
    },
    {
      expectedHeight: 144,
      fontScale: 2,
      height: 1376,
      label: "accessibility text scale",
      width: 1032
    }
  ])("uses one adaptive prompt-frame contract for $label", ({
    expectedHeight,
    fontScale,
    height,
    width
  }) => {
    const layout = buildPracticeAdaptiveLayout({
      fontScale,
      height,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      width
    });

    expect(layout.promptFrameHeight).toBe(expectedHeight);
  });

  it("reserves the locked-session controls on a short compact portrait viewport", () => {
    const layout = buildPracticeAdaptiveLayout({
      fontScale: 1,
      height: 731,
      insets: { top: 24, right: 0, bottom: 24, left: 0 },
      width: 411
    });

    expect(layout.className).toBe("compactPortrait");
    expect(layout.boardSize).toBe(319);
  });

  it("keeps a tall compact portrait board width-bound", () => {
    const layout = buildPracticeAdaptiveLayout({
      fontScale: 1,
      height: 956,
      insets: { top: 62, right: 0, bottom: 34, left: 0 },
      width: 440
    });

    expect(layout.className).toBe("compactPortrait");
    expect(layout.boardSize).toBe(408);
  });

  it("keeps an expanded navigation rail readable in a wide, short window", () => {
    const layout = buildPracticeAdaptiveLayout({
      fontScale: 1,
      height: 346,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      width: 993
    });

    expect(layout.className).toBe("compactLandscape");
    expect(layout.sideNavigationExpanded).toBe(true);
    expect(layout.sideNavigationWidth).toBe(168);
    expect(layout.usesWideContent).toBe(true);
  });

  it("uses Home columns in the maintained phone landscape Safe Area without widening every screen", () => {
    const layout = buildPracticeAdaptiveLayout({
      fontScale: 1,
      height: 402,
      insets: { top: 0, right: 62, bottom: 21, left: 62 },
      width: 874
    });

    expect(layout.className).toBe("compactLandscape");
    expect(layout.contentWidth).toBe(686);
    expect(layout.usesWideContent).toBe(false);
    expect(layout.usesHomeColumns).toBe(true);
  });

  it("stacks Home in compact landscape when text is enlarged", () => {
    const layout = buildPracticeAdaptiveLayout({
      fontScale: 1.5,
      height: 402,
      insets: { top: 0, right: 62, bottom: 21, left: 62 },
      width: 874
    });

    expect(layout.usesHomeColumns).toBe(false);
  });

  it.each([
    {
      label: "compact wide-short resizable viewport",
      width: 956,
      height: 440,
      insets: { top: 0, right: 62, bottom: 21, left: 62 },
      expected: { board: 387, gap: 95, rail: 282, row: 764 }
    },
    {
      label: "iPad Pro 13-inch landscape",
      width: 1376,
      height: 1032,
      insets: { top: 0, right: 0, bottom: 20, left: 0 },
      expected: { board: 640, gap: 125, rail: 360, row: 1125 }
    },
    {
      label: "foldable iPhone unfolded landscape",
      width: 1080,
      height: 720,
      insets: { top: 0, right: 44, bottom: 21, left: 44 },
      expected: { board: 579, gap: 68, rail: 297, row: 944 }
    }
  ])("balances $label gutters without exceeding its safe viewport", ({
    expected,
    height,
    insets,
    width
  }: {
    expected: { board: number; gap: number; rail: number; row: number };
    height: number;
    insets: PracticeSafeAreaInsets;
    label: string;
    width: number;
  }) => {
    const layout = buildPracticeAdaptiveLayout({
      fontScale: 1,
      height,
      insets,
      width
    });

    expect({
      board: layout.boardSize,
      gap: layout.sessionRailGap,
      rail: layout.sessionRailWidth,
      row: layout.sessionPackedRowWidth
    }).toEqual(expected);
    expect(layout.sessionPackedRowWidth)
      .toBeLessThanOrEqual(
        width - insets.left - insets.right - 2 * PRACTICE_UI_PADDING
      );
    expect(Math.abs(
      (width - layout.sessionPackedRowWidth) / 2 - layout.sessionRailGap
    )).toBeLessThanOrEqual(1);
  });

  // Window sizes and Safe Area insets measured with the iOS 27.1 Release app
  // on the iPhone Duo simulator (outer display, Xcode 27.1) and on iPad Pro
  // 13-inch (M5) iOS 27.0. The adaptive-layout E2E records them as
  // `[adaptive-viewport]` lines.
  it.each([
    {
      label: "iPhone Duo outer display",
      width: 466,
      height: 678,
      insets: { top: 0, right: 84, bottom: 34, left: 0 },
      expected: { className: "compactPortrait", board: 280, guideBoard: 176, rail: false }
    },
    {
      label: "iPad Pro 13-inch portrait",
      width: 1032,
      height: 1376,
      insets: { top: 32, right: 0, bottom: 20, left: 0 },
      expected: { className: "regularPortrait", board: 860, guideBoard: 556, rail: false }
    },
    {
      label: "iPad Pro 13-inch landscape",
      width: 1376,
      height: 1032,
      insets: { top: 10, right: 0, bottom: 20, left: 0 },
      expected: { className: "regularLandscape", board: 640, guideBoard: 640, rail: true }
    }
  ])("lays out the measured $label window", ({ expected, height, insets, width }) => {
    const layout = buildPracticeAdaptiveLayout({ fontScale: 1, height, insets, width });

    expect({
      className: layout.className,
      board: layout.boardSize,
      guideBoard: layout.sessionGuideBoardSize,
      rail: layout.usesSessionRail
    }).toEqual(expected);
    expect(layout.contentWidth + (layout.usesSideNavigation ? layout.sideNavigationWidth : 0))
      .toBe(width - insets.left - insets.right);
  });

  it("keeps the iPhone Duo outer first-use guide navigation inside the viewport", () => {
    const insets = { top: 0, right: 84, bottom: 34, left: 0 };
    const layout = buildPracticeAdaptiveLayout({ fontScale: 1, height: 678, insets, width: 466 });
    // Measured on the Duo outer display before this budget existed: the
    // Mark-as-unclear step put 335 points of non-board, non-prompt chrome
    // around a 218-point board and pushed Back/Next 37 points off screen.
    const measuredGuideChrome = 335;

    expect(
      PRACTICE_UI_PADDING
        + layout.promptFrameHeight
        + measuredGuideChrome
        + layout.sessionGuideBoardSize
    ).toBeLessThanOrEqual(layout.contentHeight);
  });

  it("does not shrink the first-use guide board on taller phones", () => {
    const layout = buildPracticeAdaptiveLayout({
      fontScale: 1,
      height: 874,
      insets: { top: 62, right: 0, bottom: 34, left: 0 },
      width: 402
    });

    expect(layout.sessionGuideBoardSize).toBe(Math.floor(layout.contentHeight * 0.34));
  });

  // Sizes that cannot yet be measured headlessly (see docs/DEVICE_TARGETS.md):
  // the Duo inner display point size comes from the simulator display profile
  // (2853 x 2007 pixels at 3x); Split View and Stage Manager widths are the
  // fractions UIKit offers. Each pose is checked with symmetric, one-sided and
  // no side insets because the inner display's insets are not yet measured.
  const unmeasuredInsetVariants: Array<[string, PracticeSafeAreaInsets]> = [
    ["no side insets", { top: 24, right: 0, bottom: 20, left: 0 }],
    ["status-bar column on the right", { top: 0, right: 84, bottom: 20, left: 0 }],
    ["status-bar column on the left", { top: 0, right: 0, bottom: 20, left: 84 }]
  ];
  const resizableWindows: Array<[string, number, number]> = [
    ["Duo inner landscape", 951, 669],
    ["Duo inner portrait", 669, 951],
    ["Duo inner landscape Split View half", 475, 669],
    ["Duo inner landscape Split View two thirds", 634, 669],
    ["Duo inner landscape Split View one third", 317, 669],
    ["Duo inner portrait Split View half", 334, 951],
    ["iPad Pro 13-inch landscape Split View half", 684, 1032],
    ["iPad Pro 13-inch landscape Split View two thirds", 910, 1032],
    ["iPad Pro 13-inch landscape Split View one third", 458, 1032],
    ["iPad Pro 11-inch landscape Split View two thirds", 790, 834],
    ["iPad Stage Manager short window", 800, 600]
  ];
  it.each(
    resizableWindows.flatMap(([label, width, height]) =>
      unmeasuredInsetVariants.map(([insetLabel, insets]) => ({
        height,
        insets,
        label: `${label} (${insetLabel})`,
        width
      }))
    )
  )("keeps the $label session inside its safe viewport", ({ height, insets, width }) => {
    const layout = buildPracticeAdaptiveLayout({ fontScale: 1, height, insets, width });
    const safeWidth = width - insets.left - insets.right;
    const safeHeight = height - insets.top - insets.bottom;

    expect(layout.boardSize).toBeGreaterThanOrEqual(200);
    expect(layout.sessionGuideBoardSize).toBeGreaterThan(0);
    expect(layout.sessionGuideBoardSize).toBeLessThanOrEqual(layout.boardSize);
    if (layout.usesSessionRail) {
      expect(layout.sessionPackedRowWidth)
        .toBeLessThanOrEqual(safeWidth - 2 * PRACTICE_UI_PADDING);
      expect(layout.boardSize).toBeLessThanOrEqual(safeHeight - 2 * PRACTICE_UI_PADDING);
    } else {
      expect(layout.boardSize).toBeLessThanOrEqual(safeWidth - 2 * PRACTICE_UI_PADDING);
    }
  });
});
