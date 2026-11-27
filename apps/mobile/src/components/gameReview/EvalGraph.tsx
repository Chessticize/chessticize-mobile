import React from "react";
import { Pressable, View } from "react-native";
import type { MoveClassification } from "../../../../../packages/core/src/index.ts";
import { makeStyles, useTheme } from "../../theme/index.ts";
import { AppText } from "../ui/index.tsx";
import { GAME_REVIEW_COPY } from "./gameReviewCopy.ts";
import { formatEvalLabel, formatMoveNumberTag } from "./gameReviewHelpers.ts";
import type { GameReviewEvalGraphPoint } from "./gameReviewTypes.ts";

export interface EvalGraphProps {
  points: readonly GameReviewEvalGraphPoint[];
  selectedPly: number;
  totalPlies?: number;
  onSelectPly: (ply: number) => void;
  height?: number;
  testID?: string;
}

const CHART_HEIGHT_DEFAULT = 68;

export function EvalGraph({
  points,
  selectedPly,
  totalPlies,
  onSelectPly,
  height = CHART_HEIGHT_DEFAULT,
  testID = "game-review-eval-graph"
}: EvalGraphProps): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const whiteAreaColor =
    theme.name === "dark" ? theme.colors.fillMuted : theme.colors.surface;
  const blackAreaColor =
    theme.name === "dark" ? theme.colors.surfaceRaised : theme.colors.surfaceStrong;

  const expectedTotal = Math.max(points.length, (totalPlies ?? 0) + 1);
  const pendingCount = Math.max(0, expectedTotal - points.length);

  if (points.length <= 1 && pendingCount === 0) {
    return (
      <View
        accessibilityLabel={GAME_REVIEW_COPY.evalGraph.accessibilityLabel}
        style={[styles.container, { minHeight: height }]}
        testID={testID}
      >
        <View style={styles.emptyWrap}>
          <AppText tone="secondary" variant="footnote">
            {GAME_REVIEW_COPY.evalGraph.emptyLabel}
          </AppText>
        </View>
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={GAME_REVIEW_COPY.evalGraph.accessibilityLabel}
      style={styles.container}
      testID={testID}
    >
      <View style={[styles.chartTrack, { height }]}>
        <View pointerEvents="none" style={styles.midline} />
        <View style={styles.columnsRow}>
          {points.map((point) => {
            const isSelected = point.ply === selectedPly;
            const clampedWhite = Math.max(2, Math.min(98, point.whiteWinPercent));
            const markerColor = markerColorForPoint(point, theme);
            const moveLabel =
              point.ply === 0
                ? GAME_REVIEW_COPY.moveStrip.startLabel
                : `${formatMoveNumberTag(point.moveNumber, point.color ?? "w")} ${point.san ?? ""}`.trim();
            const classificationLabel = point.classification
              ? GAME_REVIEW_COPY.classifications[point.classification]
              : GAME_REVIEW_COPY.classifications.book;

            return (
              <Pressable
                key={`ply-${point.ply}`}
                accessibilityLabel={GAME_REVIEW_COPY.evalGraph.pointAccessibilityLabel(
                  moveLabel,
                  formatEvalLabel(point.score),
                  classificationLabel
                )}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSelectPly(point.ply)}
                style={styles.columnPressable}
                testID={`eval-graph-point-${point.ply}`}
              >
                <View
                  style={[
                    styles.barTop,
                    { height: `${100 - clampedWhite}%`, backgroundColor: blackAreaColor }
                  ]}
                />
                <View
                  style={[
                    styles.barBottom,
                    { height: `${clampedWhite}%`, backgroundColor: whiteAreaColor }
                  ]}
                />
                {isSelected ? (
                  <View
                    pointerEvents="none"
                    style={styles.selectedCursor}
                    testID="eval-graph-selected-cursor"
                  />
                ) : null}
                {markerColor ? (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.markerDot,
                      {
                        backgroundColor: markerColor,
                        bottom: `${Math.max(8, Math.min(90, clampedWhite))}%`
                      }
                    ]}
                    testID={`eval-graph-marker-${point.ply}`}
                  />
                ) : null}
              </Pressable>
            );
          })}
          {pendingCount > 0 ? (
            <View
              pointerEvents="none"
              style={[styles.pendingRegion, { flex: pendingCount }]}
              testID="eval-graph-pending-region"
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function markerColorForPoint(
  point: GameReviewEvalGraphPoint,
  theme: ReturnType<typeof useTheme>
): string | null {
  if (point.isHighlight || point.classification === "great") {
    return theme.colors.positive.s600;
  }
  const classification: MoveClassification | undefined = point.classification;
  switch (classification) {
    case "blunder":
      return theme.colors.danger.s600;
    case "mistake":
      return theme.colors.caution.s700;
    case "missed_win":
      return theme.colors.warning.s500;
    default:
      return null;
  }
}

const useStyles = makeStyles((theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.card,
    borderWidth: 1,
    overflow: "hidden"
  },
  emptyWrap: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 14
  },
  chartTrack: {
    overflow: "hidden",
    position: "relative",
    width: "100%"
  },
  midline: {
    backgroundColor: theme.colors.border.heavy,
    height: 1,
    left: 0,
    position: "absolute",
    right: 0,
    top: "50%",
    zIndex: 2
  },
  columnsRow: {
    flex: 1,
    flexDirection: "row",
    height: "100%"
  },
  columnPressable: {
    flex: 1,
    height: "100%",
    minWidth: 3,
    position: "relative"
  },
  barTop: {
    width: "100%"
  },
  barBottom: {
    width: "100%"
  },
  selectedCursor: {
    backgroundColor: theme.colors.accent.fill,
    bottom: 0,
    left: "50%",
    marginLeft: -1,
    position: "absolute",
    top: 0,
    width: 2,
    zIndex: 4
  },
  markerDot: {
    borderColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 7,
    left: "50%",
    marginBottom: -3.5,
    marginLeft: -3.5,
    position: "absolute",
    width: 7,
    zIndex: 5
  },
  pendingRegion: {
    backgroundColor: theme.colors.surfaceSunken,
    height: "100%"
  }
}));
