import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { darkTheme, lightTheme, makeStyles, ThemeProvider, themeForAppearance, useTheme } from "../src/theme";
import type { Theme } from "../src/theme";

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

  it("uses a dark status bar style for light and a light one for dark", () => {
    expect(lightTheme.statusBarStyle).toBe("dark-content");
    expect(darkTheme.statusBarStyle).toBe("light-content");
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
