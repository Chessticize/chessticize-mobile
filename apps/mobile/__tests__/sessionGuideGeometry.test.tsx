import {
  buildArrowDuelLandscapeGuideGeometry,
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
      connectorWidth: 116
    });
  });

  it("keeps the connector aligned when the callout must stay inside the board lane", () => {
    expect(buildSessionGuideRailConnectorGeometry({
      boardSize: 360,
      calloutHeight: 96,
      target: {
        height: 30,
        width: 126,
        x: 522,
        y: 326
      }
    })).toEqual({
      calloutTop: 252,
      connectorTop: 89,
      connectorWidth: 237
    });
  });

  it("extends the Arrow Duel guide connector to the candidate origin instead of empty board space", () => {
    expect(buildArrowDuelLandscapeGuideGeometry(360)).toEqual({
      calloutTop: 209,
      connectorHeight: 97,
      connectorLeft: 281
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
});
