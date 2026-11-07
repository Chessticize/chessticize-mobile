import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { lightTheme, makeStyles, ThemeProvider, useTheme } from "../src/theme";
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
