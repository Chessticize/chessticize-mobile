import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  BOARD_THEME_OPTIONS,
  darkTheme,
  lightTheme,
  makeStyles,
  ThemeProvider,
  themeForAppearance,
  useBoardAppearance,
  useTheme
} from "../src/theme";
import type { AppearancePreference, BoardThemeId, ChessPieceSetId, Theme } from "../src/theme";
import {
  createNativeSystemBarAppearanceClient,
  type SystemBarAppearanceClient,
  type SystemBarScheme
} from "../src/platform/systemBarAppearance";

const useStyles = makeStyles((theme) => ({
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius[8] }
}));

function Probe({ onRender }: { onRender: (theme: Theme, styles: ReturnType<typeof useStyles>) => void }) {
  onRender(useTheme(), useStyles());
  return null;
}

function render(element: React.ReactElement): void {
  act(() => {
    TestRenderer.create(element);
  });
}

const reactNativeMock = require("react-native") as { __setColorScheme: (scheme: string) => void };

describe("appearance", () => {
  afterEach(() => {
    act(() => {
      reactNativeMock.__setColorScheme("light");
    });
  });

  it("resolves the theme from the preference and the system scheme", () => {
    expect(themeForAppearance("system", "dark")).toBe(darkTheme);
    expect(themeForAppearance("system", "light")).toBe(lightTheme);
    expect(themeForAppearance("system", null)).toBe(lightTheme);
    expect(themeForAppearance("dark", "light")).toBe(darkTheme);
    expect(themeForAppearance("light", "dark")).toBe(lightTheme);
  });

  it("follows the system appearance live and lets an override win", () => {
    const seen: Theme[] = [];
    const probe = <Probe onRender={(theme) => seen.push(theme)} />;
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(<ThemeProvider appearance="system">{probe}</ThemeProvider>);
    });
    expect(seen[seen.length - 1]).toBe(lightTheme);

    act(() => {
      reactNativeMock.__setColorScheme("dark");
    });
    expect(seen[seen.length - 1]).toBe(darkTheme);

    act(() => {
      renderer!.update(<ThemeProvider appearance="light">{probe}</ThemeProvider>);
    });
    expect(seen[seen.length - 1]).toBe(lightTheme);

    act(() => {
      renderer!.update(<ThemeProvider appearance="dark">{probe}</ThemeProvider>);
    });
    expect(seen[seen.length - 1]).toBe(darkTheme);
  });

  it("reports the effective scheme to the system bars, including an override opposite to the system", () => {
    const reported: SystemBarScheme[] = [];
    const systemBars: SystemBarAppearanceClient = { setAppearance: (scheme) => reported.push(scheme) };
    const tree = (appearance: AppearancePreference) => (
      <ThemeProvider appearance={appearance} systemBars={systemBars}>
        <Probe onRender={() => undefined} />
      </ThemeProvider>
    );
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(tree("system"));
    });
    expect(reported).toEqual(["light"]);

    act(() => {
      reactNativeMock.__setColorScheme("dark");
    });
    expect(reported).toEqual(["light", "dark"]);

    act(() => {
      renderer!.update(tree("light"));
    });
    expect(reported).toEqual(["light", "dark", "light"]);

    // The system flipping back to light leaves a Dark override in charge.
    act(() => {
      renderer!.update(tree("dark"));
    });
    act(() => {
      reactNativeMock.__setColorScheme("light");
    });
    expect(reported).toEqual(["light", "dark", "light", "dark"]);

    act(() => {
      renderer!.update(tree("dark"));
    });
    expect(reported).toEqual(["light", "dark", "light", "dark"]);
  });

  it("leaves the system bars alone under a provider with an explicit theme", () => {
    const reported: SystemBarScheme[] = [];
    render(
      <ThemeProvider theme={darkTheme} systemBars={{ setAppearance: (scheme) => reported.push(scheme) }}>
        <Probe onRender={() => undefined} />
      </ThemeProvider>
    );
    expect(reported).toEqual([]);
  });

  it("forwards the scheme to the native system bar module only when it exists", () => {
    expect(createNativeSystemBarAppearanceClient(undefined)).toBeNull();
    expect(createNativeSystemBarAppearanceClient({})).toBeNull();
    const setAppearance = jest.fn();
    createNativeSystemBarAppearanceClient({ setAppearance })?.setAppearance("dark");
    expect(setAppearance).toHaveBeenCalledWith("dark");
  });

  it("uses a dark status bar style for light and a light one for dark", () => {
    expect(lightTheme.statusBarStyle).toBe("dark-content");
    expect(darkTheme.statusBarStyle).toBe("light-content");
  });

  it("resolves separate light and dark board color schemes and exposes piece set via ThemeProvider", () => {
    const seen: Array<{ theme: Theme; pieceSet: ChessPieceSetId; lightBoardTheme: BoardThemeId; darkBoardTheme: BoardThemeId }> = [];
    function BoardProbe() {
      const theme = useTheme();
      const board = useBoardAppearance();
      seen.push({
        theme,
        pieceSet: board.pieceSet,
        lightBoardTheme: board.lightBoardTheme,
        darkBoardTheme: board.darkBoardTheme
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        <ThemeProvider
          appearance="system"
          lightBoardTheme="brown"
          darkBoardTheme="forest"
          pieceSet="merida"
        >
          <BoardProbe />
        </ThemeProvider>
      );
    });
    expect(seen[seen.length - 1]?.theme.name).toBe("light");
    expect(seen[seen.length - 1]?.theme.colors.board.lightSquare).toBe("#F0D9B5");
    expect(seen[seen.length - 1]?.theme.colors.board.darkSquare).toBe("#B58863");
    expect(seen[seen.length - 1]?.pieceSet).toBe("merida");

    act(() => {
      reactNativeMock.__setColorScheme("dark");
    });
    expect(seen[seen.length - 1]?.theme.name).toBe("dark");
    expect(seen[seen.length - 1]?.theme.colors.board.lightSquare).toBe("#9DB094");
    expect(seen[seen.length - 1]?.theme.colors.board.darkSquare).toBe("#4E6B47");

    // Default schemes preserve the exact base light/dark theme references.
    expect(
      themeForAppearance("light", "light", { lightBoardTheme: "slate", darkBoardTheme: "forest" })
    ).toBe(lightTheme);
    expect(
      themeForAppearance("dark", "dark", { lightBoardTheme: "brown", darkBoardTheme: "graphite" })
    ).toBe(darkTheme);
    expect(BOARD_THEME_OPTIONS.map((option) => option.id)).toEqual([
      "slate",
      "graphite",
      "brown",
      "green",
      "blue",
      "deep-blue",
      "purple",
      "walnut",
      "forest"
    ]);
    act(() => renderer?.unmount());
  });
});

describe("theme", () => {
  it("falls back to the light theme without a provider", () => {
    const seen: Array<{ theme: Theme; styles: ReturnType<typeof useStyles> }> = [];
    render(<Probe onRender={(theme, styles) => seen.push({ theme, styles })} />);

    expect(seen[0]?.theme).toBe(lightTheme);
    expect(seen[0]?.styles.card).toEqual({ backgroundColor: "#FFFFFF", borderRadius: 8 });
  });

  it("builds one style sheet per theme and reuses it across renders", () => {
    const darkLike: Theme = {
      ...lightTheme,
      name: "dark",
      colors: { ...lightTheme.colors, surface: "#0F172A" }
    };
    const sheets: Array<ReturnType<typeof useStyles>> = [];
    const onRender = (_theme: Theme, styles: ReturnType<typeof useStyles>) => sheets.push(styles);

    render(<Probe onRender={onRender} />);
    render(<Probe onRender={onRender} />);
    render(
      <ThemeProvider theme={darkLike}>
        <Probe onRender={onRender} />
      </ThemeProvider>
    );

    expect(sheets[1]).toBe(sheets[0]);
    expect(sheets[2]).not.toBe(sheets[0]);
    expect(sheets[2]?.card).toEqual({ backgroundColor: "#0F172A", borderRadius: 8 });
  });
});
