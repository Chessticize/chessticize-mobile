import {
  guideCalloutMaxWidth,
  guideSafeFrame,
  placeGuideCallout,
  type GuideCalloutGeometry,
  type GuideCalloutGeometryInput,
  type GuideInsets,
  type GuideRect
} from "../src/components/sessionGuideGeometry.ts";

const NO_INSETS: GuideInsets = { bottom: 0, left: 0, right: 0, top: 0 };
const IPHONE_17 = { height: 874, width: 402 };
const IPHONE_17_INSETS: GuideInsets = { bottom: 34, left: 0, right: 0, top: 62 };
const IPHONE_SE = { height: 667, width: 375 };
const IPHONE_SE_INSETS: GuideInsets = { bottom: 0, left: 0, right: 0, top: 20 };
// Measured on the iPhone Duo outer display (#618): the status-bar column is a
// right inset only.
const DUO_OUTER = { height: 678, width: 466 };
const DUO_OUTER_INSETS: GuideInsets = { bottom: 34, left: 0, right: 84, top: 0 };

function place(input: Partial<GuideCalloutGeometryInput> & Pick<GuideCalloutGeometryInput, "target">): GuideCalloutGeometry {
  return placeGuideCallout({
    callout: { height: 140, width: 340 },
    container: IPHONE_17,
    insets: IPHONE_17_INSETS,
    ...input
  });
}

function expectInside(inner: GuideRect, outer: GuideRect): void {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
}

function overlaps(a: GuideRect, b: GuideRect): boolean {
  return a.x < b.x + b.width
    && b.x < a.x + a.width
    && a.y < b.y + b.height
    && b.y < a.y + a.height;
}

describe("first-use guide geometry", () => {
  it("derives the safe frame from each inset edge separately", () => {
    expect(guideSafeFrame(DUO_OUTER, DUO_OUTER_INSETS)).toEqual({
      height: 678 - 34 - 24,
      width: 466 - 84 - 24,
      x: 12,
      y: 12
    });
    expect(guideCalloutMaxWidth(IPHONE_17, IPHONE_17_INSETS)).toBe(360);
    expect(guideCalloutMaxWidth(IPHONE_SE, IPHONE_SE_INSETS)).toBe(351);
    expect(guideCalloutMaxWidth(DUO_OUTER, DUO_OUTER_INSETS)).toBe(358);
  });

  it("places the callout below a header target with its pointer centred on the target", () => {
    const target = { height: 48, width: 370, x: 16, y: 120 };
    const geometry = place({ target });

    expect(geometry.placement).toBe("below");
    expect(geometry.cutout).toEqual({ height: 60, radius: 12, width: 382, x: 10, y: 114 });
    expect(geometry.callout).toEqual({ height: 140, width: 340, x: 31, y: 178 });
    expect(geometry.pointer).toEqual({ offset: 170, side: "top" });
    expect(geometry.overlapsTarget).toBe(false);
  });

  it("flips above a target near the bottom of the safe frame", () => {
    const target = { height: 56, width: 370, x: 16, y: 740 };
    const geometry = place({ target });

    expect(geometry.placement).toBe("above");
    expect(geometry.callout.y + geometry.callout.height).toBe(target.y - 6 - 4);
    expect(geometry.pointer?.side).toBe("bottom");
    expect(overlaps(geometry.callout, geometry.cutout)).toBe(false);
  });

  it("honours a preferred placement when it fits and falls back when it does not", () => {
    const timer = { height: 32, width: 120, x: 16, y: 560 };
    expect(place({ preferred: ["above"], target: timer }).placement).toBe("above");

    const header = { height: 48, width: 370, x: 16, y: 74 };
    expect(place({ preferred: ["above"], target: header }).placement).toBe("below");
  });

  it("places the callout beside a large board in landscape and clamps it into the safe frame", () => {
    const container = { height: 1032, width: 1376 };
    const insets = { bottom: 20, left: 0, right: 0, top: 10 };
    const board = { height: 640, width: 640, x: 126, y: 196 };
    const geometry = placeGuideCallout({
      callout: { height: 150, width: 360 },
      container,
      insets,
      preferred: ["trailing", "leading"],
      target: board
    });

    expect(geometry.placement).toBe("trailing");
    expect(geometry.callout.x).toBe(126 + 640 + 6 + 4);
    // Centred in the safe frame (y 22 to 1000); the pointer reaches the board centre.
    expect(geometry.callout.y).toBe(22 + (978 - 150) / 2);
    expect(geometry.pointer).toEqual({ offset: 516 - 436, side: "left" });
    expectInside(geometry.callout, geometry.safeFrame);
  });

  it("narrows the callout beside a board that fills a short landscape window", () => {
    // Lab phone landscape: the board fills the height, and the rail beside it
    // is narrower than the 360-point callout.
    const container = { height: 402, width: 874 };
    const insets = { bottom: 21, left: 62, right: 62, top: 0 };
    const board = { height: 350, width: 350, x: 90, y: 16 };
    const wide = placeGuideCallout({
      callout: { height: 150, width: 360 },
      container,
      insets,
      maxCalloutWidth: 360,
      preferred: ["trailing", "below", "above", "leading"],
      target: board
    });

    const space = 874 - 62 - 12 - (90 + 350 + 6 + 4);
    expect(wide.placement).toBe("trailing");
    expect(wide.callout.width).toBe(space);
    expect(wide.callout.height).toBe(Math.ceil(150 * 360 / space));
    expect(wide.overlapsTarget).toBe(false);

    // Re-measured at the narrower width, the placement holds.
    const settled = placeGuideCallout({
      callout: { height: 170, width: space },
      container,
      insets,
      maxCalloutWidth: 360,
      preferred: ["trailing", "below", "above", "leading"],
      target: board
    });
    expect(settled.placement).toBe("trailing");
    expect(settled.callout.width).toBe(space);
    expect(settled.callout.height).toBe(170);
    expect(settled.pointer?.side).toBe("left");
  });

  it("settles between a narrow side placement and a full-width one using measured heights", () => {
    // A short landscape window: below the panel target there is 160 points.
    const container = { height: 400, width: 900 };
    const target = { height: 40, width: 200, x: 640, y: 188 };
    const narrow = { height: 180, width: 300 };
    const input = {
      callout: narrow,
      container,
      insets: NO_INSETS,
      maxCalloutWidth: 360,
      preferred: ["below", "leading"] as const,
      target
    };

    // Estimated from the narrow measurement, the full-width callout would be
    // 150 tall and fit below; measured, it is 175 and does not.
    expect(placeGuideCallout(input).placement).toBe("below");
    const settled = placeGuideCallout({
      ...input,
      knownCalloutHeights: new Map([[360, 175], [300, 180]])
    });
    expect(settled.placement).toBe("leading");
    expect(placeGuideCallout({
      ...input,
      callout: { height: 175, width: 360 },
      knownCalloutHeights: new Map([[360, 175], [300, 180]])
    }).placement).toBe("leading");
  });

  it("widens a narrowed callout again for an above or below placement", () => {
    const geometry = placeGuideCallout({
      callout: { height: 180, width: 300 },
      container: IPHONE_17,
      insets: IPHONE_17_INSETS,
      maxCalloutWidth: 360,
      target: { height: 48, width: 370, x: 16, y: 120 }
    });

    expect(geometry.placement).toBe("below");
    expect(geometry.callout.width).toBe(360);
    expect(geometry.callout.height).toBe(150);
  });

  it("maps leading and trailing to the physical side in right-to-left layouts", () => {
    const container = { height: 834, width: 1210 };
    const board = { height: 400, width: 400, x: 405, y: 200 };
    const ltr = placeGuideCallout({
      callout: { height: 150, width: 360 },
      container,
      insets: NO_INSETS,
      preferred: ["trailing"],
      target: board
    });
    const rtl = placeGuideCallout({
      callout: { height: 150, width: 360 },
      container,
      insets: NO_INSETS,
      isRTL: true,
      preferred: ["trailing"],
      target: board
    });

    expect(ltr.placement).toBe("trailing");
    expect(ltr.callout.x).toBeGreaterThan(board.x + board.width);
    expect(ltr.pointer?.side).toBe("left");
    expect(rtl.placement).toBe("trailing");
    expect(rtl.callout.x + rtl.callout.width).toBeLessThan(board.x);
    expect(rtl.pointer?.side).toBe("right");
  });

  it("flips from a preferred side without room to the opposite side", () => {
    const container = { height: 834, width: 1210 };
    const railTarget = { height: 40, width: 300, x: 880, y: 300 };
    const geometry = placeGuideCallout({
      callout: { height: 150, width: 360 },
      container,
      insets: NO_INSETS,
      preferred: ["trailing", "leading"],
      target: railTarget
    });

    expect(geometry.placement).toBe("leading");
    expect(geometry.callout.x + geometry.callout.width).toBe(880 - 6 - 4);
    expect(geometry.pointer?.side).toBe("right");
  });

  it("keeps the callout clear of an asymmetric right inset and points at a target under it", () => {
    // A target that extends into the Duo outer status-bar column.
    const target = { height: 44, width: 420, x: 30, y: 40 };
    const geometry = placeGuideCallout({
      callout: { height: 140, width: 358 },
      container: DUO_OUTER,
      insets: DUO_OUTER_INSETS,
      target
    });

    expect(geometry.placement).toBe("below");
    expect(geometry.callout.x + geometry.callout.width).toBeLessThanOrEqual(466 - 84 - 12);
    expectInside(geometry.callout, geometry.safeFrame);
    expect(geometry.pointer?.offset).toBeLessThanOrEqual(geometry.callout.width - 22);
    expect(geometry.pointer?.offset).toBeGreaterThanOrEqual(22);
  });

  it("respects a left inset and a top inset on the opposite edges", () => {
    const insets = { bottom: 20, left: 84, right: 0, top: 24 };
    const target = { height: 40, width: 60, x: 0, y: 0 };
    const geometry = placeGuideCallout({
      callout: { height: 140, width: 340 },
      container: { height: 669, width: 951 },
      insets,
      target
    });

    expect(geometry.callout.x).toBe(84 + 12 + 8);
    expect(geometry.callout.y).toBeGreaterThanOrEqual(24 + 12);
    expectInside(geometry.callout, geometry.safeFrame);
    // The pointer stays on the straight part of the callout edge.
    expect(geometry.pointer).toEqual({ offset: 22, side: "top" });
  });

  it("clamps the cut-out to the window and keeps its radius inside a thin target", () => {
    const geometry = place({ target: { height: 4, width: 500, x: -40, y: 300 } });

    expect(geometry.cutout.x).toBe(0);
    expect(geometry.cutout.x + geometry.cutout.width).toBe(IPHONE_17.width);
    expect(geometry.cutout.radius).toBe(8);
  });

  it("keeps the callout in one place across steps whose targets it can point at", () => {
    // iPhone 17 Standard guide: header metrics, puzzle timer, Mark as unclear.
    const header = place({ target: { height: 48, width: 370, x: 16, y: 120 } });
    const timer = place({ target: { height: 28, width: 120, x: 141, y: 560 } });
    const unclear = place({
      preferred: ["above"],
      target: { height: 40, width: 130, x: 244, y: 780 }
    });

    expect(header.callout.x).toBe(31);
    expect(timer.callout.x).toBe(31);
    expect(unclear.callout.x).toBe(31);
    expect(unclear.pointer?.offset).toBe(244 + 65 - 31);
  });

  it("centres the callout on a target it cannot reach from the middle", () => {
    // iPad 13 portrait: the content column is centred, Mark as unclear sits right.
    const container = { height: 1376, width: 1032 };
    const insets = { bottom: 20, left: 0, right: 0, top: 32 };
    const unclear = placeGuideCallout({
      callout: { height: 150, width: 360 },
      container,
      insets,
      preferred: ["above"],
      target: { height: 40, width: 140, x: 806, y: 1250 }
    });
    const header = placeGuideCallout({
      callout: { height: 150, width: 360 },
      container,
      insets,
      target: { height: 52, width: 860, x: 86, y: 140 }
    });

    expect(header.callout.x).toBe(12 + (1008 - 360) / 2);
    // Centred on the button, then kept 8 points inside the safe frame's edge.
    expect(unclear.callout.x).toBe(1020 - 8 - 360);
    expect(unclear.pointer?.offset).toBe(876 - 652);
  });

  it("keeps an iPad landscape side-panel callout in the panel column", () => {
    // iPad 11 landscape: board on the left, controls in a panel on the right.
    const container = { height: 834, width: 1210 };
    const insets = { bottom: 20, left: 0, right: 0, top: 10 };
    const panelTimer = { height: 28, width: 110, x: 945, y: 330 };
    const geometry = placeGuideCallout({
      callout: { height: 150, width: 360 },
      container,
      insets,
      preferred: ["above", "below", "leading"],
      target: panelTimer
    });

    expect(geometry.placement).toBe("above");
    expect(geometry.callout.x).toBe(1000 - 180);
    expect(geometry.callout.x).toBeGreaterThan(780);
    expect(geometry.pointer).toEqual({ offset: 180, side: "bottom" });
  });

  it("allows a wider callout on regular-width windows", () => {
    expect(guideCalloutMaxWidth({ height: 1376, width: 1032 }, NO_INSETS)).toBe(400);
    expect(guideCalloutMaxWidth({ height: 1032, width: 684 }, NO_INSETS)).toBe(400);
    expect(guideCalloutMaxWidth({ height: 1032, width: 458 }, NO_INSETS)).toBe(360);
  });

  it("keeps the pointer tip inside the cut-out padding and off the target", () => {
    for (const [target, preferred] of [
      [{ height: 48, width: 370, x: 16, y: 120 }, ["below"]],
      [{ height: 56, width: 370, x: 16, y: 740 }, ["above"]],
      [{ height: 300, width: 180, x: 16, y: 200 }, ["trailing"]],
      [{ height: 300, width: 180, x: 206, y: 200 }, ["leading"]]
    ] as const) {
      const geometry = place({
        callout: { height: 140, width: 160 },
        preferred,
        target
      });
      const pointer = geometry.pointer;
      if (!pointer) {
        throw new Error("expected a pointer");
      }
      const { callout } = geometry;
      const reach = 8;
      const tip = pointer.side === "top"
        ? { x: callout.x + pointer.offset, y: callout.y - reach }
        : pointer.side === "bottom"
          ? { x: callout.x + pointer.offset, y: callout.y + callout.height + reach }
          : pointer.side === "left"
            ? { x: callout.x - reach, y: callout.y + pointer.offset }
            : { x: callout.x + callout.width + reach, y: callout.y + pointer.offset };
      expectInside({ height: 0, width: 0, ...tip }, geometry.cutout);
      const insideTarget = tip.x > target.x
        && tip.x < target.x + target.width
        && tip.y > target.y
        && tip.y < target.y + target.height;
      expect(insideTarget).toBe(false);
    }
  });

  it("shortens the callout so its copy scrolls rather than covering the board", () => {
    // Large text at 320 points: no side of the Arrow Duel board has room for
    // the whole callout, but the space above it holds the title and buttons.
    const container = { height: 693, width: 320 };
    const insets = { bottom: 34, left: 0, right: 0, top: 47 };
    const board = { height: 288, width: 288, x: 16, y: 330 };
    const geometry = placeGuideCallout({
      callout: { height: 420, width: 296 },
      container,
      insets,
      minCalloutHeight: 200,
      target: board
    });

    expect(geometry.compressed).toBe(true);
    expect(geometry.overlapsTarget).toBe(false);
    expect(geometry.placement).toBe("above");
    expect(geometry.callout.y).toBe(47 + 12);
    expect(geometry.callout.y + geometry.callout.height).toBeLessThanOrEqual(330 - 6 - 4);
    expect(geometry.pointer?.side).toBe("bottom");
    expect(overlaps(geometry.callout, geometry.cutout)).toBe(false);
  });

  it("still overlaps when even the shortest callout has no room", () => {
    const geometry = placeGuideCallout({
      callout: { height: 420, width: 296 },
      container: { height: 693, width: 320 },
      insets: { bottom: 34, left: 0, right: 0, top: 47 },
      minCalloutHeight: 320,
      target: { height: 288, width: 288, x: 16, y: 330 }
    });

    expect(geometry.compressed).toBe(false);
    expect(geometry.overlapsTarget).toBe(true);
    expect(geometry.pointer).toBeNull();
  });

  it("overlaps the target and hides the pointer only when no side has room", () => {
    // Large text on an iPhone SE: a tall callout and a board filling the width.
    const board = { height: 343, width: 343, x: 16, y: 170 };
    const geometry = placeGuideCallout({
      callout: { height: 300, width: 351 },
      container: IPHONE_SE,
      insets: IPHONE_SE_INSETS,
      target: board
    });

    expect(geometry.overlapsTarget).toBe(true);
    expect(geometry.pointer).toBeNull();
    expect(geometry.placement).toBe("below");
    expectInside(geometry.callout, geometry.safeFrame);
  });

  it("shrinks a callout taller than the safe frame to fit it", () => {
    const geometry = placeGuideCallout({
      callout: { height: 900, width: 351 },
      container: IPHONE_SE,
      insets: IPHONE_SE_INSETS,
      target: { height: 40, width: 120, x: 16, y: 100 }
    });

    expect(geometry.callout.height).toBe(667 - 20 - 24);
    expectInside(geometry.callout, geometry.safeFrame);
  });

  it.each([
    ["iPhone 17", IPHONE_17, IPHONE_17_INSETS],
    ["iPhone SE", IPHONE_SE, IPHONE_SE_INSETS],
    ["iPhone Duo outer", DUO_OUTER, DUO_OUTER_INSETS],
    ["iPad 13-inch landscape", { height: 1032, width: 1376 }, { bottom: 20, left: 0, right: 0, top: 10 }],
    ["iPad 11-inch portrait", { height: 1210, width: 834 }, { bottom: 20, left: 0, right: 0, top: 32 }]
  ])("keeps every callout and pointer inside the %s safe frame", (_label, container, insets) => {
    const safe = guideSafeFrame(container, insets);
    const width = guideCalloutMaxWidth(container, insets);
    const step = 37;
    for (let y = 0; y < container.height; y += step) {
      for (let x = 0; x < container.width; x += step * 2) {
        for (const size of [{ height: 30, width: 90 }, { height: 120, width: 300 }]) {
          const geometry = placeGuideCallout({
            callout: { height: 150, width },
            container,
            insets,
            target: { ...size, x, y }
          });
          expectInside(geometry.callout, safe);
          if (geometry.pointer) {
            const reach = 8;
            const tip = geometry.pointer.side === "top"
              ? { x: geometry.callout.x + geometry.pointer.offset, y: geometry.callout.y - reach }
              : geometry.pointer.side === "bottom"
                ? {
                    x: geometry.callout.x + geometry.pointer.offset,
                    y: geometry.callout.y + geometry.callout.height + reach
                  }
                : geometry.pointer.side === "left"
                  ? { x: geometry.callout.x - reach, y: geometry.callout.y + geometry.pointer.offset }
                  : {
                      x: geometry.callout.x + geometry.callout.width + reach,
                      y: geometry.callout.y + geometry.pointer.offset
                    };
            expectInside({ height: 0, width: 0, ...tip }, {
              height: container.height - insets.top - insets.bottom,
              width: container.width - insets.left - insets.right,
              x: insets.left,
              y: insets.top
            });
          } else {
            expect(geometry.overlapsTarget || geometry.callout.width < 44).toBe(true);
          }
        }
      }
    }
  });
});
