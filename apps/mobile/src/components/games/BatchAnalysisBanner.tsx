import React from "react";
import { View } from "react-native";
import { makeStyles } from "../../theme/index.ts";
import { useTranslation } from "../../i18n/index.ts";
import { AppText, Button } from "../ui/index.tsx";
import type { GamesBatchAnalysisState } from "./useGamesBatchAnalysis.ts";

export interface BatchAnalysisBannerProps {
  state: GamesBatchAnalysisState;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}

export function BatchAnalysisBanner({
  state,
  onPause,
  onResume,
  onCancel,
  onDismiss
}: BatchAnalysisBannerProps): React.JSX.Element | null {
  const styles = useStyles();
  const { t } = useTranslation();

  if (state.status === "idle") {
    return null;
  }

  const totalGames = Math.max(1, state.totalGames);
  const completedFraction =
    state.status === "completed"
      ? 1
      : Math.min(
          1,
          (state.completedGames +
            (state.totalPlies > 0 ? Math.min(1, state.currentPly / state.totalPlies) : 0)) /
            totalGames
        );
  const progressWidthPercent = `${Math.round(completedFraction * 100)}%` as `${number}%`;

  let headline = "";
  let detail: string | null = null;
  if (state.status === "running") {
    headline =
      state.totalPlies > 0
        ? t("games.batch.analyzingWithMove", {
            current: state.currentIndex,
            total: state.totalGames,
            ply: state.currentPly,
            totalPlies: state.totalPlies
          })
        : t("games.batch.analyzing", {
            current: state.currentIndex,
            total: state.totalGames
          });
  } else if (state.status === "paused") {
    headline = t("games.batch.paused", {
      current: state.currentIndex,
      total: state.totalGames
    });
    if (state.pausedByBackground) {
      detail = t("games.batch.pausedBackground");
    }
  } else if (state.status === "completed") {
    headline = t("games.batch.completed", {
      games: t("games.batch.gamesCount", { count: state.completedGames }),
      puzzles: t("common.puzzlesCount", { count: state.generatedPuzzles })
    });
  } else if (state.status === "error") {
    headline =
      state.errorMessage === "engine_unavailable"
        ? t("games.batch.engineUnavailable")
        : t("games.batch.error");
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      style={styles.card}
      testID="games-batch-banner"
    >
      <View style={styles.copy}>
        <AppText testID="games-batch-status-text" variant="headline">
          {headline}
        </AppText>
        {detail ? (
          <AppText testID="games-batch-detail-text" tone="secondary" variant="footnote">
            {detail}
          </AppText>
        ) : null}
      </View>

      {state.status === "running" || state.status === "paused" ? (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: Math.round(completedFraction * 100)
          }}
          style={styles.progressTrack}
          testID="games-batch-progress-track"
        >
          <View
            style={[
              styles.progressFill,
              state.status === "paused" ? styles.progressFillPaused : null,
              { width: progressWidthPercent }
            ]}
          />
        </View>
      ) : null}

      <View style={styles.actions}>
        {state.status === "running" ? (
          <>
            <Button
              label={t("common.pause")}
              size="compact"
              testID="games-batch-pause"
              variant="secondary"
              onPress={onPause}
            />
            <Button
              label={t("common.cancel")}
              size="compact"
              testID="games-batch-cancel"
              variant="plain"
              onPress={onCancel}
            />
          </>
        ) : null}
        {state.status === "paused" ? (
          <>
            <Button
              label={t("common.resume")}
              size="compact"
              testID="games-batch-resume"
              variant="primary"
              onPress={onResume}
            />
            <Button
              label={t("common.cancel")}
              size="compact"
              testID="games-batch-cancel"
              variant="plain"
              onPress={onCancel}
            />
          </>
        ) : null}
        {state.status === "completed" || state.status === "error" ? (
          <Button
            label={t("games.action.dismiss")}
            size="compact"
            testID="games-batch-dismiss"
            variant="plain"
            onPress={onDismiss}
          />
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.card,
    borderWidth: 1,
    gap: 10,
    padding: 14
  },
  copy: {
    gap: 2
  },
  progressTrack: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.capsule,
    height: 6,
    overflow: "hidden",
    width: "100%"
  },
  progressFill: {
    backgroundColor: theme.colors.accent.fill,
    borderRadius: theme.shape.capsule,
    height: "100%"
  },
  progressFillPaused: {
    backgroundColor: theme.colors.warning.s500
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  }
}));
