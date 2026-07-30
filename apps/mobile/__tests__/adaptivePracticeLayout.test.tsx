import {
  buildPracticeAdaptiveLayout,
  PRACTICE_UI_PADDING,
  type PracticeSafeAreaInsets
} from "../src/components/adaptivePracticeLayout";

describe("buildPracticeAdaptiveLayout", () => {
  it("reserves the locked-session controls on a short compact portrait viewport", () => {
    const layout = buildPracticeAdaptiveLayout({
      fontScale: 1,
      height: 731,
      insets: { top: 24, right: 0, bottom: 24, left: 0 },
      width: 411
    });

    expect(layout.className).toBe("compactPortrait");
    expect(layout.boardSize).toBe(339);
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
      width: 1366,
      height: 1024,
      insets: { top: 0, right: 0, bottom: 20, left: 0 },
      expected: { board: 640, gap: 122, rail: 360, row: 1122 }
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
});
