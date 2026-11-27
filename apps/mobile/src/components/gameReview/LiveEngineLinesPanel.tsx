import React from "react";
import { Pressable, View } from "react-native";
import type { EngineAnalysisLine } from "../../../../../packages/core/src/index.ts";
import { makeStyles } from "../../theme/index.ts";
import { AppText, Badge, Button } from "../ui/index.tsx";
import { GAME_REVIEW_COPY } from "./gameReviewCopy.ts";
import { formatEvalLabel, formatPvSanLine, uciToSan } from "./gameReviewHelpers.ts";

export interface LiveEngineLinesPanelProps {
  fen: string;
  lines: readonly EngineAnalysisLine[];
  loading: boolean;
  error: string | null;
  isExploringOffLine: boolean;
  explorationPliesCount: number;
  disabled?: boolean;
  onPlayMove: (uci: string) => void;
  onReturnToGame: () => void;
  testID?: string;
}

export function LiveEngineLinesPanel({
  fen,
  lines,
  loading,
  error,
  isExploringOffLine,
  explorationPliesCount,
  disabled = false,
  onPlayMove,
  onReturnToGame,
  testID = "game-review-engine-panel"
}: LiveEngineLinesPanelProps): React.JSX.Element {
  const styles = useStyles();
  const topDepth = lines[0]?.depth;

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleGroup}>
          <AppText variant="headline">{GAME_REVIEW_COPY.enginePanel.title}</AppText>
          {topDepth !== undefined ? (
            <Badge
              label={GAME_REVIEW_COPY.enginePanel.depthLabel(topDepth)}
              testID={`${testID}-depth`}
              tone="neutral"
            />
          ) : null}
          {isExploringOffLine ? (
            <Badge
              label={GAME_REVIEW_COPY.enginePanel.exploringOffset(explorationPliesCount)}
              testID={`${testID}-exploring-badge`}
              tone="accent"
            />
          ) : null}
        </View>
        {isExploringOffLine ? (
          <Button
            label={GAME_REVIEW_COPY.enginePanel.backToGame}
            onPress={onReturnToGame}
            size="compact"
            testID="game-review-back-to-game"
            variant="secondary"
          />
        ) : null}
      </View>

      {error ? (
        <AppText testID={`${testID}-error`} tone="negative" variant="footnote">
          {error}
        </AppText>
      ) : lines.length === 0 ? (
        <AppText testID={`${testID}-status`} tone="secondary" variant="footnote">
          {loading ? GAME_REVIEW_COPY.enginePanel.thinking : GAME_REVIEW_COPY.enginePanel.unavailable}
        </AppText>
      ) : (
        <View style={styles.linesList}>
          {lines.slice(0, 3).map((line, index) => {
            const evalLabel = formatEvalLabel(line.score);
            const pvText = formatPvSanLine(fen, line.pv.length > 0 ? line.pv : [line.move], 6);
            const firstSan = uciToSan(fen, line.move);

            return (
              <Pressable
                key={`pv-${line.multipv}-${line.move}`}
                accessibilityLabel={GAME_REVIEW_COPY.enginePanel.playLineA11y(firstSan, evalLabel)}
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => onPlayMove(line.move)}
                style={({ pressed }) => [
                  styles.lineRow,
                  pressed && !disabled ? styles.lineRowPressed : null
                ]}
                testID={`game-review-engine-line-${index + 1}`}
              >
                <View style={styles.evalBadge}>
                  <AppText
                    maxFontSizeMultiplier={1.4}
                    numberOfLines={1}
                    style={styles.evalBadgeText}
                    variant="caption"
                  >
                    {evalLabel}
                  </AppText>
                </View>
                <AppText
                  maxFontSizeMultiplier={1.4}
                  numberOfLines={1}
                  style={styles.pvText}
                  variant="subheadline"
                >
                  {pvText || firstSan}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.card,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between"
  },
  headerTitleGroup: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  linesList: {
    gap: 6
  },
  lineRow: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceSunken,
    borderRadius: theme.shape.control,
    flexDirection: "row",
    gap: 10,
    minHeight: theme.metrics.minTarget,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  lineRowPressed: {
    opacity: 0.72
  },
  evalBadge: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.strong,
    borderRadius: theme.radius[6],
    borderWidth: 1,
    minWidth: 50,
    paddingHorizontal: 6,
    paddingVertical: 3
  },
  evalBadgeText: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.text.primary,
    fontVariant: ["tabular-nums"],
    fontWeight: theme.fontWeight.bold,
    textAlign: "center"
  },
  pvText: {
    backgroundColor: theme.colors.surfaceSunken,
    color: theme.colors.text.primary,
    flex: 1,
    fontWeight: theme.fontWeight.semibold
  }
}));
