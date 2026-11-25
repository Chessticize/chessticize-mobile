import { darkTheme } from "./darkTheme.ts";
import { lightTheme } from "./lightTheme.ts";
import type { BoardColors, BoardThemeId, Theme } from "./themeTypes.ts";

export type BoardSchemePalette = Pick<
  BoardColors,
  | "lightSquare"
  | "darkSquare"
  | "lastMoveHighlight"
  | "checkmateHighlight"
  | "validMoveDot"
  | "validMoveCapture"
  | "lastMoveSquare"
  | "coordinateOnLightSquare"
  | "coordinateOnDarkSquare"
  | "coordinateHaloOnLightSquare"
  | "coordinateHaloOnDarkSquare"
>;

export type BoardThemeOption = {
  id: BoardThemeId;
  label: string;
  palette: BoardSchemePalette;
};

export const DEFAULT_LIGHT_BOARD_THEME: BoardThemeId = "slate";
export const DEFAULT_DARK_BOARD_THEME: BoardThemeId = "graphite";

export const BOARD_THEME_OPTIONS: readonly BoardThemeOption[] = [
  {
    id: "slate",
    label: "Slate",
    palette: {
      lightSquare: lightTheme.colors.board.lightSquare,
      darkSquare: lightTheme.colors.board.darkSquare,
      lastMoveHighlight: lightTheme.colors.board.lastMoveHighlight,
      checkmateHighlight: lightTheme.colors.board.checkmateHighlight,
      validMoveDot: lightTheme.colors.board.validMoveDot,
      validMoveCapture: lightTheme.colors.board.validMoveCapture,
      lastMoveSquare: lightTheme.colors.board.lastMoveSquare,
      coordinateOnLightSquare: lightTheme.colors.board.coordinateOnLightSquare,
      coordinateOnDarkSquare: lightTheme.colors.board.coordinateOnDarkSquare,
      coordinateHaloOnLightSquare: lightTheme.colors.board.coordinateHaloOnLightSquare,
      coordinateHaloOnDarkSquare: lightTheme.colors.board.coordinateHaloOnDarkSquare
    }
  },
  {
    id: "graphite",
    label: "Graphite",
    palette: {
      lightSquare: darkTheme.colors.board.lightSquare,
      darkSquare: darkTheme.colors.board.darkSquare,
      lastMoveHighlight: darkTheme.colors.board.lastMoveHighlight,
      checkmateHighlight: darkTheme.colors.board.checkmateHighlight,
      validMoveDot: darkTheme.colors.board.validMoveDot,
      validMoveCapture: darkTheme.colors.board.validMoveCapture,
      lastMoveSquare: darkTheme.colors.board.lastMoveSquare,
      coordinateOnLightSquare: darkTheme.colors.board.coordinateOnLightSquare,
      coordinateOnDarkSquare: darkTheme.colors.board.coordinateOnDarkSquare,
      coordinateHaloOnLightSquare: darkTheme.colors.board.coordinateHaloOnLightSquare,
      coordinateHaloOnDarkSquare: darkTheme.colors.board.coordinateHaloOnDarkSquare
    }
  },
  {
    id: "brown",
    label: "Brown",
    palette: {
      lightSquare: "#F0D9B5",
      darkSquare: "#B58863",
      lastMoveHighlight: "rgba(0, 0, 0, 0)",
      checkmateHighlight: "rgba(0, 0, 0, 0)",
      validMoveDot: "rgba(28, 19, 10, 0.34)",
      validMoveCapture: "rgba(28, 19, 10, 0.54)",
      lastMoveSquare: "rgba(205, 175, 40, 0.44)",
      coordinateOnLightSquare: "#4A3219",
      coordinateOnDarkSquare: "#211308",
      coordinateHaloOnLightSquare: "rgba(240, 217, 181, 0.72)",
      coordinateHaloOnDarkSquare: "rgba(240, 217, 181, 0.42)"
    }
  },
  {
    id: "green",
    label: "Green",
    palette: {
      lightSquare: "#EEEED2",
      darkSquare: "#769656",
      lastMoveHighlight: "rgba(0, 0, 0, 0)",
      checkmateHighlight: "rgba(0, 0, 0, 0)",
      validMoveDot: "rgba(18, 32, 12, 0.34)",
      validMoveCapture: "rgba(18, 32, 12, 0.54)",
      lastMoveSquare: "rgba(246, 214, 70, 0.48)",
      coordinateOnLightSquare: "#2D441B",
      coordinateOnDarkSquare: "#14220B",
      coordinateHaloOnLightSquare: "rgba(238, 238, 210, 0.72)",
      coordinateHaloOnDarkSquare: "rgba(238, 238, 210, 0.42)"
    }
  },
  {
    id: "blue",
    label: "Blue",
    palette: {
      lightSquare: "#DEE3E6",
      darkSquare: "#8CA2AD",
      lastMoveHighlight: "rgba(0, 0, 0, 0)",
      checkmateHighlight: "rgba(0, 0, 0, 0)",
      validMoveDot: "rgba(15, 29, 40, 0.34)",
      validMoveCapture: "rgba(15, 29, 40, 0.54)",
      lastMoveSquare: "rgba(234, 179, 8, 0.38)",
      coordinateOnLightSquare: "#233642",
      coordinateOnDarkSquare: "#11212B",
      coordinateHaloOnLightSquare: "rgba(222, 227, 230, 0.75)",
      coordinateHaloOnDarkSquare: "rgba(222, 227, 230, 0.42)"
    }
  },
  {
    id: "deep-blue",
    label: "Deep Blue",
    palette: {
      lightSquare: "#EAE9D2",
      darkSquare: "#4B7399",
      lastMoveHighlight: "rgba(0, 0, 0, 0)",
      checkmateHighlight: "rgba(0, 0, 0, 0)",
      validMoveDot: "rgba(14, 27, 42, 0.34)",
      validMoveCapture: "rgba(14, 27, 42, 0.56)",
      lastMoveSquare: "rgba(234, 179, 8, 0.42)",
      coordinateOnLightSquare: "#1F3A52",
      coordinateOnDarkSquare: "#FFFFFF",
      coordinateHaloOnLightSquare: "rgba(234, 233, 210, 0.72)",
      coordinateHaloOnDarkSquare: "rgba(15, 29, 44, 0.6)"
    }
  },
  {
    id: "purple",
    label: "Purple",
    palette: {
      lightSquare: "#E1D0E5",
      darkSquare: "#8F639E",
      lastMoveHighlight: "rgba(0, 0, 0, 0)",
      checkmateHighlight: "rgba(0, 0, 0, 0)",
      validMoveDot: "rgba(34, 17, 44, 0.34)",
      validMoveCapture: "rgba(34, 17, 44, 0.56)",
      lastMoveSquare: "rgba(234, 179, 8, 0.38)",
      coordinateOnLightSquare: "#3D2247",
      coordinateOnDarkSquare: "#FFFFFF",
      coordinateHaloOnLightSquare: "rgba(225, 208, 229, 0.72)",
      coordinateHaloOnDarkSquare: "rgba(38, 17, 48, 0.6)"
    }
  },
  {
    id: "walnut",
    label: "Walnut",
    palette: {
      lightSquare: "#C4A482",
      darkSquare: "#6E472E",
      lastMoveHighlight: "rgba(0, 0, 0, 0)",
      checkmateHighlight: "rgba(0, 0, 0, 0)",
      validMoveDot: "rgba(20, 11, 5, 0.38)",
      validMoveCapture: "rgba(20, 11, 5, 0.58)",
      lastMoveSquare: "rgba(245, 190, 56, 0.4)",
      coordinateOnLightSquare: "#2C1A0E",
      coordinateOnDarkSquare: "#FFF8F0",
      coordinateHaloOnLightSquare: "rgba(218, 194, 166, 0.45)",
      coordinateHaloOnDarkSquare: "rgba(30, 16, 8, 0.65)"
    }
  },
  {
    id: "forest",
    label: "Forest",
    palette: {
      lightSquare: "#9DB094",
      darkSquare: "#4E6B47",
      lastMoveHighlight: "rgba(0, 0, 0, 0)",
      checkmateHighlight: "rgba(0, 0, 0, 0)",
      validMoveDot: "rgba(12, 22, 10, 0.38)",
      validMoveCapture: "rgba(12, 22, 10, 0.58)",
      lastMoveSquare: "rgba(236, 196, 56, 0.4)",
      coordinateOnLightSquare: "#162614",
      coordinateOnDarkSquare: "#F4FAF2",
      coordinateHaloOnLightSquare: "rgba(196, 214, 188, 0.45)",
      coordinateHaloOnDarkSquare: "rgba(14, 24, 12, 0.65)"
    }
  }
];

const BOARD_THEME_MAP: Readonly<Record<BoardThemeId, BoardThemeOption>> = Object.fromEntries(
  BOARD_THEME_OPTIONS.map((option) => [option.id, option])
) as Record<BoardThemeId, BoardThemeOption>;

export function boardThemeOptionFor(id: BoardThemeId): BoardThemeOption {
  return BOARD_THEME_MAP[id] ?? BOARD_THEME_MAP[DEFAULT_LIGHT_BOARD_THEME];
}

export function boardColorsFor(boardThemeId: BoardThemeId, mode: "light" | "dark"): BoardColors {
  const baseBoard = mode === "dark" ? darkTheme.colors.board : lightTheme.colors.board;
  const palette = boardThemeOptionFor(boardThemeId).palette;
  return {
    ...baseBoard,
    ...palette
  };
}

const themeWithBoardCache = new WeakMap<Theme, Map<BoardThemeId, Theme>>();

// Returns a referentially stable Theme with the chosen board color scheme applied
// so downstream WeakMap caches (chessboardColorsFor) avoid needless object churn.
export function themeWithBoardTheme(baseTheme: Theme, boardThemeId: BoardThemeId): Theme {
  const defaultId = baseTheme.name === "dark" ? DEFAULT_DARK_BOARD_THEME : DEFAULT_LIGHT_BOARD_THEME;
  if (boardThemeId === defaultId && (baseTheme === lightTheme || baseTheme === darkTheme)) {
    return baseTheme;
  }
  let byBoard = themeWithBoardCache.get(baseTheme);
  if (!byBoard) {
    byBoard = new Map();
    themeWithBoardCache.set(baseTheme, byBoard);
  }
  const cached = byBoard.get(boardThemeId);
  if (cached) {
    return cached;
  }
  const palette = boardThemeOptionFor(boardThemeId).palette;
  const next: Theme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      board: {
        ...baseTheme.colors.board,
        ...palette
      }
    }
  };
  byBoard.set(boardThemeId, next);
  return next;
}
