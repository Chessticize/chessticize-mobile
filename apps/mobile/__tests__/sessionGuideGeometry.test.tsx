import {
  buildArrowDuelLandscapeGuideGeometry,
  buildPortraitGuideCalloutTop,
  buildPortraitGuidePointerLeft,
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

  it("routes above a landscape prompt before turning toward its action", () => {
    expect(buildSessionGuideRailConnectorGeometry({
      boardSize: 360,
      calloutHeight: 96,
      routeAboveTarget: true,
      target: {
        height: 30,
        width: 126,
        x: 522,
        y: 326
      }
    })).toEqual({
      calloutTop: 252,
      connectorTop: 68,
      connectorDrop: 21,
      connectorWidth: 158
    });
  });

  it("points toward the Arrow Duel candidate origin without joining its move arrows", () => {
    expect(buildArrowDuelLandscapeGuideGeometry(360)).toEqual({
      calloutTop: 209,
      connectorArmWidth: 24,
      connectorHeight: 68,
      connectorLeft: 257
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
});
