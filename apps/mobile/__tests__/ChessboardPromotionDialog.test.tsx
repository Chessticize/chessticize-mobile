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

jest.mock("react-native-chessboard/src/assets/piece-images", () => ({
  PIECE_SOURCES: {
    wq: 1,
    wr: 1,
    wb: 1,
    wn: 1,
    bq: 1,
    br: 1,
    bb: 1,
    bn: 1
  }
}));

describe("react-native-chessboard promotion dialog patch", () => {
  it("renders a visible Modal promotion picker with selectable pieces", () => {
    const { PromotionDialog } = require("react-native-chessboard/src/components/promotion-dialog");
    const onSelect = jest.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        <PromotionDialog
          color="w"
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

    expect(renderer.root.findAll((node) => String(node.type) === "Modal")).toHaveLength(1);
    const overlay = renderer.root.findByProps({ testID: "promotion-dialog-overlay" });
    expect(overlay.props.style).toMatchObject({
      flex: 1,
      justifyContent: "center",
      alignItems: "center"
    });
    expect(renderer.root.findByProps({ testID: "promotion-dialog-container" })).toBeTruthy();
    const pieceButtons = renderer.root.findAll((node) => String(node.type) === "TouchableOpacity");
    expect(pieceButtons).toHaveLength(4);
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
});
