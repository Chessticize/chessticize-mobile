import React from "react";
import TestRenderer, { act } from "react-test-renderer";

jest.mock("react-native-reanimated", () => {
  const React = require("react");

  const AnimatedView = (props: { children?: React.ReactNode }) =>
    React.createElement("Animated.View", props, props.children);

  return {
    __esModule: true,
    default: {
      View: AnimatedView
    },
    FadeIn: {
      duration: () => ({})
    },
    FadeOut: {
      duration: () => ({})
    }
  };
});

jest.mock("@shopify/react-native-skia", () => {
  const React = require("react");

  return {
    Atlas: (props: { children?: React.ReactNode }) => React.createElement("Atlas", props, props.children),
    Canvas: (props: { children?: React.ReactNode }) => React.createElement("Canvas", props, props.children),
    Skia: {
      RSXform: (scale: number, skew: number, translateX: number, translateY: number) => ({
        scale,
        skew,
        translateX,
        translateY
      })
    },
    rect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height })
  };
});

jest.mock("react-native-chessboard/src/assets/piece-images", () => ({
  PIECE_SOURCES: {
    wq: { id: "white-queen" },
    wr: { id: "white-rook" },
    wb: { id: "white-bishop" },
    wn: { id: "white-knight" },
    bq: { id: "black-queen" },
    br: { id: "black-rook" },
    bb: { id: "black-bishop" },
    bn: { id: "black-knight" }
  },
  usePieceSpriteSheet: () => ({
    image: { id: "mock-piece-sprite" }
  })
}));

describe("react-native-chessboard promotion dialog patch", () => {
  it("renders selectable native images without mounting Skia surfaces", () => {
    const { PromotionDialog } = require("react-native-chessboard/src/components/promotion-dialog");
    const { StyleSheet } = require("react-native");
    const onSelect = jest.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        <PromotionDialog
          color="b"
          onSelect={onSelect}
          onCancel={jest.fn()}
          config={{
            colors: {
              promotionPieceButton: "#F8FAFC"
            }
          } as never}
        />
      );
    });
    if (!renderer) {
      throw new Error("PromotionDialog did not render");
    }

    const modals = renderer.root.findAll((node) => String(node.type) === "Modal");
    expect(modals).toHaveLength(1);
    expect(modals[0].props.animationType).toBe("fade");
    const overlay = renderer.root.findByProps({ testID: "promotion-dialog-overlay" });
    expect(StyleSheet.flatten(overlay.props.style)).toMatchObject({
      flex: 1,
      justifyContent: "center",
      alignItems: "center"
    });
    expect(renderer.root.findByProps({ testID: "promotion-dialog-container" })).toBeTruthy();
    const pieceButtons = renderer.root.findAll((node) => String(node.type) === "TouchableOpacity");
    expect(pieceButtons).toHaveLength(4);
    ["q", "r", "b", "n"].forEach((piece) => {
      const choiceImage = renderer!.root.findByProps({ testID: `promotion-choice-${piece}-image` });
      expect(choiceImage.props.style).toMatchObject({
        width: 48,
        height: 48
      });
      expect(choiceImage.props.source).toEqual({ id: `black-${{
        q: "queen",
        r: "rook",
        b: "bishop",
        n: "knight"
      }[piece as "q" | "r" | "b" | "n"]}` });
    });
    expect(renderer.root.findAll((node) => String(node.type) === "Image")).toHaveLength(4);
    expect(renderer.root.findAll((node) => String(node.type) === "Canvas")).toHaveLength(0);
    expect(renderer.root.findAll((node) => String(node.type) === "Atlas")).toHaveLength(0);
    expect(pieceButtons[0].props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          borderColor: "#CBD5E1",
          borderWidth: 1
        }),
        expect.objectContaining({
          backgroundColor: "#F8FAFC"
        })
      ])
    );
    renderer.root.findByProps({ testID: "promotion-choice-q" }).props.onPress();
    expect(onSelect).toHaveBeenCalledWith("q");
  });

  it("keeps the Android modal but skips its presentation animations", () => {
    const { Platform } = require("react-native");
    const originalOS = Platform.OS;
    Platform.OS = "android";

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    try {
      const { PromotionDialog } = require("react-native-chessboard/src/components/promotion-dialog");
      act(() => {
        renderer = TestRenderer.create(
          <PromotionDialog
            color="w"
            onSelect={jest.fn()}
            onCancel={jest.fn()}
            config={{
              colors: {
                promotionPieceButton: "#F8FAFC"
              }
            } as never}
          />
        );
      });
      if (!renderer) {
        throw new Error("PromotionDialog did not render");
      }

      const modals = renderer.root.findAll((node) => String(node.type) === "Modal");
      expect(modals).toHaveLength(1);
      expect(modals[0].props.animationType).toBe("none");
      const container = renderer.root.findByProps({ testID: "promotion-dialog-container" });
      expect(container.props.entering).toBeUndefined();
      expect(container.props.exiting).toBeUndefined();
    } finally {
      if (renderer) {
        act(() => renderer?.unmount());
      }
      Platform.OS = originalOS;
    }
  });
});
