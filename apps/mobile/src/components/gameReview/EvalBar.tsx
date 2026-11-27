import React from "react";
import { View } from "react-native";
import type { AnalysisScore } from "../../../../../packages/core/src/index.ts";
import { makeStyles, useTheme } from "../../theme/index.ts";
import { useTranslation } from "../../i18n/index.ts";
import { AppText } from "../ui/index.tsx";
import { formatEvalLabel } from "./gameReviewHelpers.ts";

export interface EvalBarProps {
  score: AnalysisScore;
  whiteWinPercent: number;
  flipped?: boolean;
  orientation?: "vertical" | "horizontal";
  length?: number;
  hidden?: boolean;
  testID?: string;
}

export function EvalBar({
  score,
  whiteWinPercent,
  flipped = false,
  orientation = "vertical",
  length = 280,
  hidden = false,
  testID = "game-review-eval-bar"
}: EvalBarProps): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  const clampedWin = Math.max(4, Math.min(96, hidden ? 50 : whiteWinPercent));
  const evalLabel = hidden ? "—" : formatEvalLabel(score);
  const evalA11yLabel = t("gameReview.evalBar.a11y", {
    eval: evalLabel,
    percent: Math.round(clampedWin)
  });
  const whiteFillColor =
    theme.name === "dark" ? theme.colors.surfaceInverse : theme.colors.surface;
  const blackFillColor =
    theme.name === "dark" ? theme.colors.surfaceSunken : theme.colors.surfaceInverse;

  if (orientation === "horizontal") {
    const leftPercent = flipped ? 100 - clampedWin : clampedWin;
    const leftColor = flipped ? blackFillColor : whiteFillColor;
    const rightColor = flipped ? whiteFillColor : blackFillColor;

    return (
      <View
        accessible
        accessibilityLabel={evalA11yLabel}
        style={styles.horizontalWrap}
        testID={testID}
      >
        <View style={styles.horizontalTrack}>
          <View
            style={[
              styles.horizontalSegment,
              { width: `${leftPercent}%`, backgroundColor: leftColor }
            ]}
          />
          <View
            style={[
              styles.horizontalSegment,
              { width: `${100 - leftPercent}%`, backgroundColor: rightColor }
            ]}
          />
          <View pointerEvents="none" style={styles.horizontalCenterTick} />
        </View>
        <View style={styles.scorePill}>
          <AppText
            maxFontSizeMultiplier={1.4}
            numberOfLines={1}
            style={styles.scorePillText}
            testID={`${testID}-label`}
            variant="caption"
          >
            {evalLabel}
          </AppText>
        </View>
      </View>
    );
  }

  // Vertical bar beside board: White at bottom normally, at top when flipped.
  const topPercent = flipped ? clampedWin : 100 - clampedWin;
  const bottomPercent = 100 - topPercent;
  const topColor = flipped ? whiteFillColor : blackFillColor;
  const bottomColor = flipped ? blackFillColor : whiteFillColor;

  return (
    <View
      accessible
      accessibilityLabel={evalA11yLabel}
      style={[styles.verticalWrap, { height: length }]}
      testID={testID}
    >
      <View style={styles.verticalTrack}>
        <View
          style={[
            styles.verticalSegment,
            { height: `${topPercent}%`, backgroundColor: topColor }
          ]}
        />
        <View
          style={[
            styles.verticalSegment,
            { height: `${bottomPercent}%`, backgroundColor: bottomColor }
          ]}
        />
        <View pointerEvents="none" style={styles.verticalCenterTick} />
      </View>
      <View style={styles.verticalLabelWrap}>
        <AppText
          adjustsFontSizeToFit
          maxFontSizeMultiplier={1.15}
          minimumFontScale={0.72}
          numberOfLines={1}
          style={styles.verticalLabelText}
          testID={`${testID}-label`}
          variant="caption"
        >
          {evalLabel}
        </AppText>
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  verticalWrap: {
    alignItems: "center",
    justifyContent: "space-between",
    width: 38
  },
  verticalTrack: {
    borderColor: theme.colors.border.strong,
    borderRadius: theme.radius[6],
    borderWidth: 1,
    flex: 1,
    overflow: "hidden",
    position: "relative",
    width: 18
  },
  verticalSegment: {
    width: "100%"
  },
  verticalCenterTick: {
    backgroundColor: theme.colors.border.heavy,
    height: 1,
    left: 0,
    position: "absolute",
    right: 0,
    top: "50%"
  },
  verticalLabelWrap: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius[6],
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 4,
    minWidth: 38,
    paddingHorizontal: 2,
    paddingVertical: 2
  },
  verticalLabelText: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.text.primary,
    fontSize: 10.5,
    fontVariant: ["tabular-nums"],
    fontWeight: theme.fontWeight.bold,
    lineHeight: 13,
    textAlign: "center"
  },
  horizontalWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  horizontalTrack: {
    borderColor: theme.colors.border.strong,
    borderRadius: theme.shape.capsule,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    height: 12,
    overflow: "hidden",
    position: "relative"
  },
  horizontalSegment: {
    height: "100%"
  },
  horizontalCenterTick: {
    backgroundColor: theme.colors.border.heavy,
    bottom: 0,
    left: "50%",
    position: "absolute",
    top: 0,
    width: 1
  },
  scorePill: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.capsule,
    borderWidth: 1,
    minWidth: 46,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  scorePillText: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.text.primary,
    fontVariant: ["tabular-nums"],
    fontWeight: theme.fontWeight.bold,
    textAlign: "center"
  }
}));
