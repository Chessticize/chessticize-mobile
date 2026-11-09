import {
  buildPracticeAdaptiveLayout,
  COMPACT_PORTRAIT_SESSION_CHROME,
  compactPortraitBoardDetailsHeight,
  compactPortraitFeedbackHeight,
  compactPortraitStatusHeight,
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
      // Prompt copy caps at 1.25x, so its frame grows by a quarter (#652).
      expectedHeight: 120,
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
    // 683 safe height - 32 padding - measured chrome (97 + 12 + 96 + 12 + 70
    // + 12 + 58); the prompt and feedback rows span the 379-point content.
    expect(layout.boardSize).toBe(294);
    expect(layout.sessionColumnWidth).toBe(379);
  });

  // The live compact-portrait session stacks the status bar, prompt, board,
  // board details and the post-answer feedback row with the scroll locked, so
  // their measured heights must fit the safe height without scrolling (#639).
  // Enlarged text grows the HUD, prompt, timing and feedback up to their caps,
  // and the board gives up that height instead (#652). iOS reports 1.353 at
  // Extra Extra Extra Large, 1.786 at Accessibility Medium and 3.571 at the
  // largest accessibility size; Android's largest font scale is 2.
  const iPhoneSE = { label: "iPhone SE (3rd generation)", width: 375, height: 667, insets: { top: 20, right: 0, bottom: 0, left: 0 } };
  const iPhone17 = { label: "iPhone 17", width: 402, height: 874, insets: { top: 62, right: 0, bottom: 34, left: 0 } };
  it.each([
    { ...iPhoneSE, fontScale: 1, board: 258 },
    { label: "iPhone Duo outer display", width: 466, height: 678, insets: { top: 0, right: 84, bottom: 34, left: 0 }, fontScale: 1, board: 255 },
    { label: "iPhone 16", width: 393, height: 852, insets: { top: 59, right: 0, bottom: 34, left: 0 }, fontScale: 1, board: 361 },
    { ...iPhone17, fontScale: 1, board: 370 },
    { label: "iPhone 17 Pro Max", width: 440, height: 956, insets: { top: 62, right: 0, bottom: 34, left: 0 }, fontScale: 1, board: 408 },
    { ...iPhoneSE, fontScale: 1.353, board: 201 },
    { ...iPhoneSE, fontScale: 1.786, board: 186 },
    { ...iPhoneSE, fontScale: 3.571, board: 181 },
    { ...iPhone17, fontScale: 1.786, board: 317 },
    { ...iPhone17, fontScale: 3.571, board: 312 },
    { label: "Android phone", width: 412, height: 915, insets: { top: 24, right: 0, bottom: 48, left: 0 }, fontScale: 2, board: 377 }
  ])("fits the whole live session on $label at text scale $fontScale without scrolling", ({
    board,
    fontScale,
    height,
    insets,
    width
  }) => {
    const layout = buildPracticeAdaptiveLayout({ fontScale, height, insets, width });
    const chrome = COMPACT_PORTRAIT_SESSION_CHROME;
    const stackedHeight = PRACTICE_UI_PADDING
      + compactPortraitStatusHeight(fontScale)
      + chrome.stackGap
      + layout.promptFrameHeight
      + chrome.stackGap
      + layout.boardSize
      + compactPortraitBoardDetailsHeight(fontScale)
      + chrome.stackGap
      + compactPortraitFeedbackHeight(layout.sessionColumnWidth, fontScale)
      + PRACTICE_UI_PADDING;

    expect(layout.className).toBe("compactPortrait");
    expect(layout.boardSize).toBe(board);
    expect(stackedHeight).toBeLessThanOrEqual(layout.contentHeight);
  });

  // At large text the iPad portrait session reserves the same measured rows,
  // so the post-answer feedback row stays on screen (#652).
  it.each([
    { label: "iPad Pro 11-inch", width: 834, height: 1210, fontScale: 1.786 },
    { label: "iPad Pro 11-inch", width: 834, height: 1210, fontScale: 3.571 },
    { label: "iPad Pro 13-inch", width: 1032, height: 1376, fontScale: 3.571 }
  ])("fits the whole live session on $label portrait at text scale $fontScale", ({
    fontScale,
    height,
    width
  }) => {
    const insets = { top: 32, right: 0, bottom: 20, left: 0 };
    const layout = buildPracticeAdaptiveLayout({ fontScale, height, insets, width });
    const chrome = COMPACT_PORTRAIT_SESSION_CHROME;
    const stackedHeight = PRACTICE_UI_PADDING
      + compactPortraitStatusHeight(fontScale)
      + chrome.stackGap
      + layout.promptFrameHeight
      + chrome.stackGap
      + layout.boardSize
      + compactPortraitBoardDetailsHeight(fontScale)
      + chrome.stackGap
      + compactPortraitFeedbackHeight(layout.sessionColumnWidth, fontScale)
      + PRACTICE_UI_PADDING;

    expect(layout.className).toBe("regularPortrait");
    expect(stackedHeight).toBeLessThanOrEqual(layout.contentHeight);
  });

  it("grows the compact-portrait chrome only up to each text cap", () => {
    expect(compactPortraitStatusHeight(1)).toBe(COMPACT_PORTRAIT_SESSION_CHROME.status);
    expect(compactPortraitStatusHeight(2)).toBe(compactPortraitStatusHeight(3.571));
    expect(compactPortraitBoardDetailsHeight(1)).toBe(COMPACT_PORTRAIT_SESSION_CHROME.boardDetails);
    expect(compactPortraitBoardDetailsHeight(1.5)).toBe(compactPortraitBoardDetailsHeight(3.571));
    expect(compactPortraitFeedbackHeight(343, 1)).toBe(COMPACT_PORTRAIT_SESSION_CHROME.feedback);
    expect(compactPortraitFeedbackHeight(343, 1.25)).toBe(COMPACT_PORTRAIT_SESSION_CHROME.feedbackAtTextCap);
    expect(compactPortraitFeedbackHeight(343, 3.571)).toBe(COMPACT_PORTRAIT_SESSION_CHROME.feedbackAtTextCap);
    expect(compactPortraitFeedbackHeight(288, 3.571))
      .toBe(COMPACT_PORTRAIT_SESSION_CHROME.narrowColumnFeedbackAtTextCap);
  });

  it("keeps the iPhone 17 session board width-bound", () => {
    const layout = buildPracticeAdaptiveLayout({
      fontScale: 1,
      height: 874,
      insets: { top: 62, right: 0, bottom: 34, left: 0 },
      width: 402
    });

    expect(layout.boardSize).toBe(402 - 2 * PRACTICE_UI_PADDING);
    expect(layout.sessionColumnWidth).toBe(layout.boardSize);
    expect(layout.promptFrameHeight).toBe(96);
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

  it("uses wide content in a wide, short window", () => {
    const layout = buildPracticeAdaptiveLayout({
      fontScale: 1,
      height: 346,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      width: 993
    });

    expect(layout.className).toBe("compactLandscape");
    expect(layout.contentWidth).toBe(993);
    expect(layout.usesWideContent).toBe(true);
  });

  it("narrows tab content by the tab chrome the host reports as insets", () => {
    // Android tablet (1280 x 800 dp) with the 80 dp navigation rail (#612).
    const layout = buildPracticeAdaptiveLayout({
      fontScale: 1,
      height: 800,
      insets: { top: 24, right: 0, bottom: 24, left: 80 },
      width: 1280
    });

    expect(layout.contentWidth).toBe(1200);
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
    expect(layout.contentWidth).toBe(750);
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
      // The board fills the height the rail layout leaves (720 - 21 - 32),
      // capped at the 640-point landscape maximum, so the gap is the content
      // padding allowance rather than a balanced gutter.
      expected: { board: 640, gap: 23, rail: 297, row: 960 }
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
    const fillsSafeWidth = layout.sessionPackedRowWidth
      === width - insets.left - insets.right - 2 * PRACTICE_UI_PADDING;
    if (!fillsSafeWidth) {
      expect(Math.abs(
        (width - layout.sessionPackedRowWidth) / 2 - layout.sessionRailGap
      )).toBeLessThanOrEqual(1);
    }
  });

  // iPhone Duo inner display in landscape: 2853 x 2007 pixels at 3x from the
  // simulator display profile. The profile does not carry Safe Area insets and
  // simctl cannot capture the unfolded display, so the status-bar and camera
  // column is modelled on the outer display's measured 84-point right column,
  // and the bottom on the landscape home indicator.
  it.each([
    {
      label: "status-bar column on the right",
      insets: { top: 0, right: 84, bottom: 20, left: 0 },
      expected: { board: 525, rail: 296 }
    },
    {
      label: "no side insets",
      insets: { top: 0, right: 0, bottom: 20, left: 0 },
      expected: { board: 609, rail: 296 }
    }
  ])("fills the Duo inner landscape height with the session board ($label)", ({
    expected,
    insets
  }) => {
    const width = 951;
    const height = 669;
    const layout = buildPracticeAdaptiveLayout({ fontScale: 1, height, insets, width });
    const safeWidth = width - insets.left - insets.right;
    const safeHeight = height - insets.top - insets.bottom;

    expect(layout.className).toBe("regularLandscape");
    expect(layout.sessionCentersRow).toBe(true);
    expect({ board: layout.boardSize, rail: layout.sessionRailWidth }).toEqual(expected);
    // The board is the largest square the row allows: bound by the safe height
    // or by the width left after the rail, minimum gap and padding.
    expect(layout.boardSize).toBe(Math.min(
      safeHeight - 2 * PRACTICE_UI_PADDING,
      safeWidth - 2 * PRACTICE_UI_PADDING - layout.sessionRailWidth - 14
    ));
  });

  it.each([
    { label: "iPad Pro 13-inch landscape", width: 1376, height: 1032, insets: { top: 10, right: 0, bottom: 20, left: 0 }, centers: true, board: 640 },
    { label: "iPad Pro 11-inch landscape", width: 1210, height: 834, insets: { top: 10, right: 0, bottom: 20, left: 0 }, centers: true, board: 640 },
    { label: "iPad Pro 11-inch Split View two thirds", width: 790, height: 834, insets: { top: 10, right: 0, bottom: 20, left: 0 }, centers: false, board: 532 },
    { label: "Android tablet landscape", width: 1280, height: 800, insets: { top: 24, right: 0, bottom: 48, left: 0 }, centers: true, board: 640 },
    { label: "maintained phone landscape", width: 874, height: 402, insets: { top: 0, right: 62, bottom: 21, left: 62 }, centers: false, board: 349 },
    { label: "phone portrait", width: 402, height: 874, insets: { top: 62, right: 0, bottom: 34, left: 0 }, centers: false, board: 370 },
    { label: "iPad Pro 13-inch Split View half", width: 684, height: 1032, insets: { top: 24, right: 0, bottom: 20, left: 0 }, centers: false, board: 560 },
    { label: "iPad Stage Manager short window", width: 800, height: 600, insets: { top: 24, right: 0, bottom: 20, left: 0 }, centers: false, board: 430 }
  ])("centres only regular landscape sessions ($label)", ({ board, centers, height, insets, width }) => {
    const layout = buildPracticeAdaptiveLayout({ fontScale: 1, height, insets, width });

    expect(layout.sessionCentersRow).toBe(centers);
    expect(layout.boardSize).toBe(board);
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
      expected: { className: "compactPortrait", board: 255, rail: false }
    },
    {
      label: "iPad Pro 13-inch portrait",
      width: 1032,
      height: 1376,
      insets: { top: 32, right: 0, bottom: 20, left: 0 },
      expected: { className: "regularPortrait", board: 860, rail: false }
    },
    {
      label: "iPad Pro 13-inch landscape",
      width: 1376,
      height: 1032,
      insets: { top: 10, right: 0, bottom: 20, left: 0 },
      expected: { className: "regularLandscape", board: 640, rail: true }
    }
  ])("lays out the measured $label window", ({ expected, height, insets, width }) => {
    const layout = buildPracticeAdaptiveLayout({ fontScale: 1, height, insets, width });

    expect({
      className: layout.className,
      board: layout.boardSize,
      rail: layout.usesSessionRail
    }).toEqual(expected);
    expect(layout.contentWidth).toBe(width - insets.left - insets.right);
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
    if (layout.usesSessionRail) {
      expect(layout.sessionPackedRowWidth)
        .toBeLessThanOrEqual(safeWidth - 2 * PRACTICE_UI_PADDING);
      expect(layout.boardSize).toBeLessThanOrEqual(safeHeight - 2 * PRACTICE_UI_PADDING);
    } else {
      expect(layout.boardSize).toBeLessThanOrEqual(safeWidth - 2 * PRACTICE_UI_PADDING);
    }
    if (layout.className === "compactPortrait") {
      // The locked live session (status, prompt, board, details, feedback)
      // fits the window without scrolling in every pose (#639).
      const chrome = COMPACT_PORTRAIT_SESSION_CHROME;
      expect(
        PRACTICE_UI_PADDING * 2
          + chrome.status
          + chrome.stackGap * 3
          + layout.promptFrameHeight
          + layout.boardSize
          + chrome.boardDetails
          + compactPortraitFeedbackHeight(layout.sessionColumnWidth)
      ).toBeLessThanOrEqual(safeHeight);
    }
  });
});
