import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import {
  BOARD_THEME_OPTIONS,
  boardColorsFor,
  makeStyles,
  useTheme,
  type AppearancePreference,
  type BoardColors,
  type BoardThemeId,
  type ChessPieceSetId
} from "../../../theme/index.ts";
import { useUiHaptics } from "../../../platform/uiHaptics.ts";
import { useTranslation } from "../../../i18n/index.ts";
import { usePracticeViewport } from "../../PracticeViewport.tsx";
import { AppText, SegmentedControl } from "../../ui/index.tsx";
import { CHESS_PIECE_SET_OPTIONS, chessPieceSpriteFor } from "../shared/chessPieceSprite.ts";

type PreviewMode = "light" | "dark";
type PieceColor = "w" | "b";
type PieceColumn = 0 | 1 | 2 | 3 | 4 | 5;

const PREVIEW_SQUARE_SIZE = 42;
const PREVIEW_BOARD_SIZE = PREVIEW_SQUARE_SIZE * 4;
const PREVIEW_PIECE_SIZE = 38;
const PIECE_OPTION_GLYPH_SIZE = 30;

const PREVIEW_FILES = ["a", "b", "c", "d"] as const;
const PREVIEW_RANKS = ["4", "3", "2", "1"] as const;

// 6x2 sprite sheet columns: p=0, n=1, b=2, r=3, q=4, k=5.
// Keep corner coordinate squares (a4, a1, d1) clear so rank/file labels stay crisp.
const PREVIEW_PIECES: Readonly<Record<string, { color: PieceColor; col: PieceColumn }>> = {
  "0,1": { color: "b", col: 3 }, // b4: black rook
  "0,2": { color: "b", col: 0 }, // c4: black pawn
  "0,3": { color: "b", col: 5 }, // d4: black king
  "1,1": { color: "b", col: 2 }, // b3: black bishop
  "1,2": { color: "w", col: 1 }, // c3: white knight (last move target)
  "2,1": { color: "w", col: 0 }, // b2: white pawn
  "2,3": { color: "w", col: 4 }, // d2: white queen
  "3,2": { color: "w", col: 5 }  // c1: white king
};

const PREVIEW_LAST_MOVE_SQUARES = new Set(["3,1", "1,2"]); // b1 -> c3

export function BoardAppearanceSettings({
  appearance,
  darkBoardTheme,
  lightBoardTheme,
  onDarkBoardThemeChange,
  onLightBoardThemeChange,
  onPieceSetChange,
  pieceSet
}: {
  appearance: AppearancePreference;
  darkBoardTheme: BoardThemeId;
  lightBoardTheme: BoardThemeId;
  onDarkBoardThemeChange: (boardTheme: BoardThemeId) => void;
  onLightBoardThemeChange: (boardTheme: BoardThemeId) => void;
  onPieceSetChange: (pieceSet: ChessPieceSetId) => void;
  pieceSet: ChessPieceSetId;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const uiHaptics = useUiHaptics();
  const { t } = useTranslation();
  const { fontScale } = usePracticeViewport();
  const usesTwoColumnGrid = fontScale >= 1.5 || appTheme.typography.caption.fontSize >= 18;
  const [systemBoardMode, setSystemBoardMode] = useState<PreviewMode>(appTheme.name);

  useEffect(() => {
    if (appearance === "light" || appearance === "dark") {
      setSystemBoardMode(appearance);
    }
  }, [appearance]);

  const editingMode: PreviewMode = appearance === "system" ? systemBoardMode : appearance;
  const editingModeLabel = editingMode === "dark"
    ? t("settings.appearance.modeDarkLower")
    : t("settings.appearance.modeLightLower");
  const activeBoardTheme = editingMode === "dark" ? darkBoardTheme : lightBoardTheme;
  const previewColors = boardColorsFor(activeBoardTheme, editingMode);

  function selectBoardTheme(next: BoardThemeId): void {
    if (next !== activeBoardTheme) {
      uiHaptics("selection");
    }
    if (editingMode === "dark") {
      onDarkBoardThemeChange(next);
    } else {
      onLightBoardThemeChange(next);
    }
  }

  function selectPieceSet(next: ChessPieceSetId): void {
    if (next !== pieceSet) {
      uiHaptics("selection");
    }
    onPieceSetChange(next);
  }

  return (
    <View style={styles.root} testID="settings-board-appearance">
      <View style={styles.previewSection}>
        <BoardMiniPreview
          boardThemeId={activeBoardTheme}
          colors={previewColors}
          mode={editingMode}
          pieceSet={pieceSet}
        />
      </View>

      <View style={styles.group}>
        <AppText style={styles.groupLabel} tone="secondary" variant="footnote">
          {t("settings.appearance.boardHeading")}
        </AppText>
        {appearance === "system" ? (
          <SegmentedControl
            accessibilityLabel={t("settings.appearance.boardModeA11y")}
            options={[
              { value: "light", label: t("common.light"), testID: "settings-board-mode-light" },
              { value: "dark", label: t("common.dark"), testID: "settings-board-mode-dark" }
            ]}
            testID="settings-board-mode-selector"
            value={systemBoardMode}
            onChange={setSystemBoardMode}
          />
        ) : null}
        <View
          accessibilityLabel={t("settings.appearance.boardSchemeGroupA11y", { mode: editingModeLabel })}
          role="radiogroup"
          style={styles.grid}
          testID="settings-board-theme-grid"
        >
          {BOARD_THEME_OPTIONS.map((option) => {
            const selected = option.id === activeBoardTheme;
            const optionLabel = t(`settings.appearance.boardTheme.${option.id}`);
            return (
              <Pressable
                accessibilityLabel={t("settings.appearance.boardOptionA11y", { name: optionLabel })}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                key={option.id}
                style={({ pressed }) => [
                  styles.optionTile,
                  usesTwoColumnGrid ? styles.optionTileLargeText : null,
                  selected ? styles.optionTileSelected : null,
                  pressed ? styles.optionTilePressed : null
                ]}
                testID={`settings-board-theme-${option.id}`}
                onPress={() => selectBoardTheme(option.id)}
              >
                <View style={styles.boardSwatch}>
                  <View style={styles.boardSwatchRow}>
                    <View style={[styles.boardSwatchCell, { backgroundColor: option.palette.lightSquare }]} />
                    <View style={[styles.boardSwatchCell, { backgroundColor: option.palette.darkSquare }]} />
                  </View>
                  <View style={styles.boardSwatchRow}>
                    <View style={[styles.boardSwatchCell, { backgroundColor: option.palette.darkSquare }]} />
                    <View style={[styles.boardSwatchCell, { backgroundColor: option.palette.lightSquare }]} />
                  </View>
                </View>
                <AppText
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  numberOfLines={2}
                  style={selected ? styles.optionLabelSelected : styles.optionLabel}
                  variant="caption"
                >
                  {optionLabel}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <AppText style={styles.groupLabel} tone="secondary" variant="footnote">
          {t("settings.appearance.piecesHeading")}
        </AppText>
        <View
          accessibilityLabel={t("settings.appearance.pieceSetGroupA11y")}
          role="radiogroup"
          style={styles.grid}
          testID="settings-piece-set-grid"
        >
          {CHESS_PIECE_SET_OPTIONS.map((option) => {
            const selected = option.id === pieceSet;
            const optionLabel = t(`settings.appearance.pieceSet.${option.id}`);
            return (
              <Pressable
                accessibilityLabel={t("settings.appearance.pieceSetOptionA11y", { name: optionLabel })}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                key={option.id}
                style={({ pressed }) => [
                  styles.optionTile,
                  usesTwoColumnGrid ? styles.optionTileLargeText : null,
                  selected ? styles.optionTileSelected : null,
                  pressed ? styles.optionTilePressed : null
                ]}
                testID={`settings-piece-set-${option.id}`}
                onPress={() => selectPieceSet(option.id)}
              >
                <View
                  style={[
                    styles.piecePreviewChip,
                    { backgroundColor: previewColors.darkSquare }
                  ]}
                >
                  <SpritePieceGlyph
                    col={1}
                    color="w"
                    pieceSet={option.id}
                    size={PIECE_OPTION_GLYPH_SIZE}
                  />
                </View>
                <AppText
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  numberOfLines={2}
                  style={selected ? styles.optionLabelSelected : styles.optionLabel}
                  variant="caption"
                >
                  {optionLabel}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function BoardMiniPreview({
  boardThemeId,
  colors,
  mode,
  pieceSet
}: {
  boardThemeId: BoardThemeId;
  colors: BoardColors;
  mode: PreviewMode;
  pieceSet: ChessPieceSetId;
}): React.JSX.Element {
  const styles = useStyles();
  const { t } = useTranslation();
  const modeLabel = mode === "dark"
    ? t("settings.appearance.modeDarkLower")
    : t("settings.appearance.modeLightLower");
  const boardLabel = t(`settings.appearance.boardTheme.${boardThemeId}`);
  const piecesLabel = t(`settings.appearance.pieceSet.${pieceSet}`);
  return (
    <View
      accessible
      accessibilityLabel={t("settings.appearance.boardPreviewA11y", {
        mode: modeLabel,
        board: boardLabel,
        pieces: piecesLabel
      })}
      accessibilityRole="image"
      style={styles.previewBoard}
      testID="settings-board-preview"
    >
      {PREVIEW_RANKS.map((rank, row) => (
        <View key={rank} style={styles.previewRow}>
          {PREVIEW_FILES.map((file, col) => {
            const isLight = (row + col) % 2 === 0;
            const key = `${row},${col}`;
            const piece = PREVIEW_PIECES[key];
            const isLastMove = PREVIEW_LAST_MOVE_SQUARES.has(key);
            const coordColor = isLight
              ? colors.coordinateOnLightSquare
              : colors.coordinateOnDarkSquare;
            const coordHalo = isLight
              ? colors.coordinateHaloOnLightSquare
              : colors.coordinateHaloOnDarkSquare;

            return (
              <View
                key={`${file}${rank}`}
                style={[
                  styles.previewSquare,
                  { backgroundColor: isLight ? colors.lightSquare : colors.darkSquare }
                ]}
                testID={`settings-board-preview-square-${file}${rank}`}
              >
                {isLastMove ? (
                  <View
                    pointerEvents="none"
                    style={[StyleSheet.absoluteFill, { backgroundColor: colors.lastMoveSquare }]}
                    testID={`settings-board-preview-last-move-${file}${rank}`}
                  />
                ) : null}
                {col === 0 ? (
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.previewRankCoord,
                      { color: coordColor, textShadowColor: coordHalo }
                    ]}
                  >
                    {rank}
                  </Text>
                ) : null}
                {row === 3 ? (
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.previewFileCoord,
                      { color: coordColor, textShadowColor: coordHalo }
                    ]}
                  >
                    {file}
                  </Text>
                ) : null}
                {piece ? (
                  <SpritePieceGlyph
                    col={piece.col}
                    color={piece.color}
                    imageTestID={`settings-board-preview-piece-${file}${rank}`}
                    pieceSet={pieceSet}
                    size={PREVIEW_PIECE_SIZE}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function SpritePieceGlyph({
  col,
  color,
  imageTestID,
  pieceSet,
  size
}: {
  col: PieceColumn;
  color: PieceColor;
  imageTestID?: string;
  pieceSet: ChessPieceSetId;
  size: number;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={[styles.spriteClip, { height: size, width: size }]}>
      <Image
        accessible={false}
        accessibilityIgnoresInvertColors
        resizeMode="stretch"
        source={chessPieceSpriteFor(pieceSet)}
        style={[
          styles.spriteSheet,
          {
            height: size * 2,
            left: -col * size,
            top: color === "w" ? 0 : -size,
            width: size * 6
          }
        ]}
        testID={imageTestID}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    borderTopColor: theme.colors.border.default,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  previewSection: {
    alignItems: "center"
  },
  previewBoard: {
    borderColor: theme.colors.border.strong,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    height: PREVIEW_BOARD_SIZE,
    overflow: "hidden",
    width: PREVIEW_BOARD_SIZE
  },
  previewRow: {
    flexDirection: "row"
  },
  previewSquare: {
    alignItems: "center",
    height: PREVIEW_SQUARE_SIZE,
    justifyContent: "center",
    position: "relative",
    width: PREVIEW_SQUARE_SIZE
  },
  previewRankCoord: {
    fontSize: 9,
    fontWeight: "700",
    left: 3,
    position: "absolute",
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 2,
    top: 2
  },
  previewFileCoord: {
    bottom: 2,
    fontSize: 9,
    fontWeight: "700",
    position: "absolute",
    right: 4,
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 2
  },
  group: {
    gap: 10
  },
  groupLabel: {
    fontWeight: theme.typography.headline.fontWeight
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  optionTile: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.control,
    borderWidth: 1.5,
    flexBasis: "30%",
    flexGrow: 1,
    gap: 5,
    minHeight: 64,
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 6
  },
  optionTileLargeText: {
    flexBasis: "46%"
  },
  optionTileSelected: {
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s600
  },
  optionTilePressed: {
    opacity: 0.78
  },
  optionLabel: {
    textAlign: "center"
  },
  optionLabelSelected: {
    fontWeight: theme.typography.headline.fontWeight,
    textAlign: "center"
  },
  boardSwatch: {
    borderColor: theme.colors.border.strong,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    overflow: "hidden",
    width: 32
  },
  boardSwatchRow: {
    flex: 1,
    flexDirection: "row"
  },
  boardSwatchCell: {
    flex: 1
  },
  piecePreviewChip: {
    alignItems: "center",
    borderColor: theme.colors.border.strong,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  spriteClip: {
    overflow: "hidden",
    position: "relative"
  },
  spriteSheet: {
    position: "absolute"
  }
}));
