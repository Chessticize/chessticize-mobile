import {
  buildArrowDuelLandscapeGuideGeometry,
  buildPortraitGuideCalloutTop,
  buildPortraitGuidePointerLeft,
  buildPortraitTimeoutGuideGeometry,
  buildSessionGuideLandscapeAlignment,
  buildSessionGuideRailConnectorGeometry
} from "../src/components/sessionGuideGeometry.ts";

describe("session guide geometry", () => {
  it("routes a landscape callout to a target measured in the shared guide frame", () => {
    expect(buildSessionGuideRailConnectorGeometry({
      boardSize: 360,
      calloutHeight: 100,
      target: {
        height: 20,
        width: 112,
        x: 408,
        y: 210
      }
    })).toEqual({
      calloutTop: 170,
      connectorTop: 50,
      connectorDrop: 0,
      connectorWidth: 44
    });
  });

  it("points straight toward the center of a landscape information card", () => {
    expect(buildSessionGuideRailConnectorGeometry({
      boardSize: 360,
      calloutHeight: 96,
      target: {
        height: 72,
        width: 240,
        x: 384,
        y: 268
      }
    })).toEqual({
      calloutTop: 252,
      connectorTop: 52,
      connectorDrop: 0,
      connectorWidth: 20
    });
  });

  it("points straight up toward the Arrow Duel candidate origin", () => {
    expect(buildArrowDuelLandscapeGuideGeometry(360)).toEqual({
      calloutTop: 209,
      connectorHeight: 68,
      connectorLeft: 276
    });
  });

  it("aligns landscape guide cards with the centered board and control rail", () => {
    expect(buildSessionGuideLandscapeAlignment({
      boardSize: 360,
      sessionRailGap: 24,
      sessionRailWidth: 240
    })).toEqual({
      boardCalloutTranslateX: -300,
      railTranslateX: 72
    });
  });

  it("centers the portrait Unclear pointer on its measured action across widths", () => {
    expect(buildPortraitGuidePointerLeft({
      calloutWidth: 402,
      target: {
        width: 140,
        x: 246
      }
    })).toBe(304);
    expect(buildPortraitGuidePointerLeft({
      calloutWidth: 320,
      target: {
        width: 132,
        x: 174
      }
    })).toBe(228);
  });

  it("keeps a portrait callout and its pointer clear of the measured target", () => {
    expect(buildPortraitGuideCalloutTop({
      calloutHeight: 154,
      target: {
        y: 779
      }
    })).toBe(605);
  });

  it("raises the portrait Timed Out callout enough to show its full pointer above the board", () => {
    const boardTop = 228;
    const calloutHeight = 128;
    const geometry = buildPortraitTimeoutGuideGeometry({
      boardTop,
      calloutHeight
    });

    expect(geometry).toEqual({
      calloutTop: 82,
      pointerReach: 12
    });
    expect(
      boardTop - (geometry.calloutTop + calloutHeight + geometry.pointerReach)
    ).toBe(6);
  });
});
