import React from "react";
import { StyleSheet } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import { MemoryStore, PracticeService } from "../../../packages/storage/src/index.ts";
import { PracticePocScreen } from "../src/components/PracticePocScreen.tsx";
import { MoveSideGlyph } from "../src/components/practice/shared/Glyphs.tsx";
import { CHESS_PIECE_SPRITES } from "../src/components/practice/shared/chessPieceSprite.ts";
import { createTestMobilePlatformCapabilities } from "../src/testing/testMobilePlatformCapabilities.ts";
import {
  ThemeProvider,
  type AppearancePreference,
  type BoardThemeId,
  type ChessPieceSetId
} from "../src/theme/index.ts";

jest.mock("react-native-chessboard", () => {
  const React = require("react");
  const MockChessboard = React.forwardRef((props: Record<string, unknown>, _ref: unknown) =>
    React.createElement("MockChessboard", props)
  );
  return {
    __esModule: true,
    default: MockChessboard
  };
});

function press(renderer: TestRenderer.ReactTestRenderer, testID: string): void {
  const node = renderer.root.findByProps({ testID });
  act(() => {
    node.props.onPress();
  });
}

function createService(): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles([
    {
      id: "board-appearance-puzzle-1",
      initialFen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
      solutionMoves: ["e1e8"],
      rating: 900,
      themes: ["backRankMate"],
      openingTags: [],
      source: "synthetic"
    }
  ]);
  return new PracticeService(store);
}

function renderStatefulScreen(service: PracticeService) {
  const platformCapabilities = createTestMobilePlatformCapabilities({
    practiceService: service
  });

  function Harness() {
    const initial = service.getSettings();
    const [appearance, setAppearance] = React.useState<AppearancePreference>(initial.appearance);
    const [lightBoardTheme, setLightBoardTheme] = React.useState<BoardThemeId>(initial.lightBoardTheme);
    const [darkBoardTheme, setDarkBoardTheme] = React.useState<BoardThemeId>(initial.darkBoardTheme);
    const [pieceSet, setPieceSet] = React.useState<ChessPieceSetId>(initial.pieceSet);
    return (
      <ThemeProvider
        appearance={appearance}
        darkBoardTheme={darkBoardTheme}
        lightBoardTheme={lightBoardTheme}
        pieceSet={pieceSet}
        onAppearanceChange={setAppearance}
        onDarkBoardThemeChange={setDarkBoardTheme}
        onLightBoardThemeChange={setLightBoardTheme}
        onPieceSetChange={setPieceSet}
      >
        <PracticePocScreen platformCapabilities={platformCapabilities} runManagementEnabled />
      </ThemeProvider>
    );
  }

  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(<Harness />);
  });
  return renderer!;
}

describe("board color schemes and piece sets in Settings", () => {
  it("supports separate Light and Dark board selection in System mode and hides the split toggle in Light/Dark modes", () => {
    const service = createService();
    const renderer = renderStatefulScreen(service);

    press(renderer, "settings-tab");

    // Default appearance is system, so Light/Dark board mode selector is shown.
    expect(renderer.root.findByProps({ testID: "settings-board-mode-selector" })).toBeTruthy();

    // Default Light board is Slate (#E6E8EB / #7B8794).
    const lightSquare = () => StyleSheet.flatten(
      renderer.root.findByProps({ testID: "settings-board-preview-square-a4" }).props.style
    ).backgroundColor;
    const darkSquare = () => StyleSheet.flatten(
      renderer.root.findByProps({ testID: "settings-board-preview-square-b4" }).props.style
    ).backgroundColor;

    expect(lightSquare()).toBe("#E6E8EB");
    expect(darkSquare()).toBe("#7B8794");

    // Select Brown for Light mode.
    press(renderer, "settings-board-theme-brown");
    expect(service.getSettings().lightBoardTheme).toBe("brown");
    expect(service.getSettings().darkBoardTheme).toBe("graphite");
    expect(lightSquare()).toBe("#F0D9B5");
    expect(darkSquare()).toBe("#B58863");

    // Switch preview editor to Dark mode under System appearance, then pick Forest.
    press(renderer, "settings-board-mode-dark");
    expect(lightSquare()).toBe("#B0B0B5");
    expect(darkSquare()).toBe("#747479");

    press(renderer, "settings-board-theme-forest");
    expect(service.getSettings().darkBoardTheme).toBe("forest");
    expect(service.getSettings().lightBoardTheme).toBe("brown");
    expect(lightSquare()).toBe("#9DB094");
    expect(darkSquare()).toBe("#4E6B47");

    // Switching Appearance to Light hides the Light/Dark board split toggle and edits Light directly.
    press(renderer, "settings-appearance-light");
    expect(renderer.root.findAllByProps({ testID: "settings-board-mode-selector" })).toHaveLength(0);
    expect(lightSquare()).toBe("#F0D9B5");

    press(renderer, "settings-board-theme-green");
    expect(service.getSettings().lightBoardTheme).toBe("green");
    expect(service.getSettings().darkBoardTheme).toBe("forest");
    expect(lightSquare()).toBe("#EEEED2");
    expect(darkSquare()).toBe("#769656");

    // Switching Appearance to Dark hides the split toggle and edits Dark directly.
    press(renderer, "settings-appearance-dark");
    expect(renderer.root.findAllByProps({ testID: "settings-board-mode-selector" })).toHaveLength(0);
    expect(lightSquare()).toBe("#9DB094");

    press(renderer, "settings-board-theme-walnut");
    expect(service.getSettings().darkBoardTheme).toBe("walnut");
    expect(service.getSettings().lightBoardTheme).toBe("green");
    expect(lightSquare()).toBe("#C4A482");
    expect(darkSquare()).toBe("#6E472E");

    act(() => renderer.unmount());
  });

  it("applies selected piece set and board colors to live preview, Sprint board, and MoveSideGlyph", () => {
    const service = createService();
    const renderer = renderStatefulScreen(service);

    press(renderer, "settings-tab");
    press(renderer, "settings-appearance-light");
    press(renderer, "settings-board-theme-deep-blue");
    press(renderer, "settings-piece-set-merida");

    expect(service.getSettings().lightBoardTheme).toBe("deep-blue");
    expect(service.getSettings().pieceSet).toBe("merida");

    const previewPiece = renderer.root.findByProps({ testID: "settings-board-preview-piece-c3" });
    expect(previewPiece.props.source).toBe(CHESS_PIECE_SPRITES.merida);

    // Return to Practice and start a Sprint to confirm the live Chessboard receives the custom colors and sprite.
    press(renderer, "practice-tab");
    press(renderer, "practice-run-start");

    const board = renderer.root.find((node) => String(node.type) === "MockChessboard");
    expect(board.props.spriteSource).toBe(CHESS_PIECE_SPRITES.merida);
    expect(board.props.colors).toMatchObject({
      white: "#EAE9D2",
      black: "#4B7399"
    });

    // MoveSideGlyph uses the active piece set from ThemeProvider.
    let glyphRenderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      glyphRenderer = TestRenderer.create(
        <ThemeProvider pieceSet="cburnett">
          <MoveSideGlyph side="w" />
        </ThemeProvider>
      );
    });
    const kingSprite = glyphRenderer!.root.findByProps({ testID: "chessboard-king-white-sprite" });
    expect(kingSprite.props.source).toBe(CHESS_PIECE_SPRITES.cburnett);

    act(() => {
      renderer.unmount();
      glyphRenderer?.unmount();
    });
  });
});
