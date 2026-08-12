import React from "react";
import TestRenderer, { act } from "react-test-renderer";

jest.mock("react-native-gesture-handler", () => {
  const React = require("react");
  return {
    GestureDetector: (props: { children?: React.ReactNode }) =>
      React.createElement("GestureDetector", props, props.children),
    GestureHandlerRootView: (props: { children?: React.ReactNode }) =>
      React.createElement("GestureHandlerRootView", props, props.children)
  };
});

jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const mutable = (initial: unknown) => {
    let current = initial;
    return {
      get value() {
        return current;
      },
      set value(next) {
        current = next;
      },
      get: () => current,
      set: (next: unknown) => {
        current = next;
      }
    };
  };

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
    },
    makeMutable: mutable,
    useSharedValue: mutable,
    withSpring: (target: unknown, _config: unknown, callback?: (finished: boolean) => void) => {
      callback?.(true);
      return target;
    },
    withTiming: (target: unknown, _config: unknown, callback?: (finished: boolean) => void) => {
      callback?.(true);
      return target;
    }
  };
});

jest.mock("react-native-worklets", () => ({
  scheduleOnRN: (worklet: (...args: unknown[]) => unknown, ...args: unknown[]) => worklet(...args),
  scheduleOnUI: (worklet: (...args: unknown[]) => unknown, ...args: unknown[]) => worklet(...args)
}));

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

jest.mock("react-native-chessboard/src/components/skia/skia-board", () => {
  const React = require("react");
  return {
    SkiaBoard: (props: { children?: React.ReactNode }) =>
      React.createElement("SkiaBoard", props, props.children)
  };
});

jest.mock("react-native-chessboard/src/components/skia", () => ({
  get GestureBoard() {
    return require("react-native-chessboard/src/components/skia/gesture-board").GestureBoard;
  }
}));

jest.mock("react-native-chessboard/src/hooks/use-board-gesture", () => ({
  useBoardGesture: () => ({})
}));

describe("react-native-chessboard promotion dialog patch", () => {
  it("cancels a pending promotion when the public board reset changes position", async () => {
    const { Chessboard } = require("react-native-chessboard/src/index");
    const boardRef = React.createRef<{
      move: (move: { from: string; to: string }) => Promise<unknown>;
      resetBoard: (fen: string) => Promise<void>;
    }>();
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        <Chessboard
          ref={boardRef}
          fen="7k/4P3/8/8/8/8/8/7K w - - 0 1"
          boardSize={320}
          gestureEnabled
          flipped={false}
        />
      );
    });
    if (!renderer || !boardRef.current) {
      throw new Error("Chessboard did not render");
    }

    let pendingMove: Promise<unknown> | undefined;
    await act(async () => {
      pendingMove = boardRef.current?.move({ from: "e7", to: "e8" });
      await Promise.resolve();
    });
    expect(renderer.root.findByProps({ testID: "promotion-dialog-overlay" })).toBeTruthy();

    await act(async () => {
      await boardRef.current?.resetBoard("7k/8/8/8/8/8/8/7K w - - 0 1");
      await Promise.resolve();
    });

    expect(renderer.root.findAllByProps({ testID: "promotion-dialog-overlay" })).toHaveLength(0);
    await expect(pendingMove).resolves.toBeUndefined();
  });

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
    const promotionChoices = [
      ["q", "queen"],
      ["r", "rook"],
      ["b", "bishop"],
      ["n", "knight"]
    ] as const;
    promotionChoices.forEach(([piece, pieceName]) => {
      const choice = renderer!.root.findByProps({ testID: `promotion-choice-${piece}` });
      expect(choice.props.accessibilityLabel).toBe(`Promote to ${pieceName}`);
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
