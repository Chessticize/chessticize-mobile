import React from "react";
import { Pressable, View } from "react-native";
import type {
  DiagnosisHeadlineKind,
  InGameWeaknessDiagnosis
} from "../../../../../packages/core/src/index.ts";
import { customThemeLabel } from "../practice/shared/themeCatalog.ts";
import { useTranslation } from "../../i18n/index.ts";
import { makeStyles, useTheme } from "../../theme/index.ts";
import { AppText, Badge, Section } from "../ui/index.tsx";
import { gameTimeClassLabel } from "./gamesPresentation.ts";

export interface InGameDiagnosisCardProps {
  diagnosis: InGameWeaknessDiagnosis;
  onPracticeBlindspotTheme?: (theme: string) => void;
}

function headlinePresentation(
  diagnosis: InGameWeaknessDiagnosis,
  locale: Parameters<typeof customThemeLabel>[1]
): { title: string; tone: "accent" | "warning" | "positive" | "neutral" } {
  const { headlineKind, headlineStats } = diagnosis;
  switch (headlineKind as DiagnosisHeadlineKind) {
    case "time_trouble": {
      const pct = Math.round((headlineStats.dominantClockShare ?? 0) * 100);
      return { title: `Time trouble (${pct}% of mistakes)`, tone: "warning" };
    }
    case "impulsive": {
      const pct = Math.round((headlineStats.dominantClockShare ?? 0) * 100);
      return { title: `Impulsive moves (${pct}% of mistakes)`, tone: "warning" };
    }
    case "tactical_blindspot": {
      const themeName = headlineStats.primaryBlindspotTheme
        ? customThemeLabel(headlineStats.primaryBlindspotTheme, locale)
        : "Tactics";
      return { title: `Blindspot: ${themeName}`, tone: "accent" };
    }
    case "escaped_blunders": {
      const pct = Math.round(headlineStats.escapedPercent ?? 0);
      return { title: `${pct}% of blunders went unpunished`, tone: "warning" };
    }
    case "balanced": {
      const acc =
        headlineStats.overallAccuracy !== undefined
          ? ` · ${Math.round(headlineStats.overallAccuracy)}%`
          : "";
      return { title: `Balanced play${acc}`, tone: "positive" };
    }
    case "insufficient_data":
    default:
      return { title: "Analyze more games", tone: "neutral" };
  }
}

export function InGameDiagnosisCard({
  diagnosis,
  onPracticeBlindspotTheme
}: InGameDiagnosisCardProps): React.JSX.Element | null {
  const styles = useStyles();
  const theme = useTheme();
  const { locale } = useTranslation();

  if (!diagnosis.sufficientData) {
    return null;
  }

  const headline = headlinePresentation(diagnosis, locale);
  const clock = diagnosis.clockTimingBreakdown;
  const showClock = clock.knownClockOwnMistakes > 0;
  const timeTroublePct = Math.round(clock.knownShares.time_trouble * 100);
  const impulsivePct = Math.round(clock.knownShares.impulsive * 100);
  const deliberatePct = Math.round(clock.knownShares.deliberate * 100);

  return (
    <Section style={styles.card} testID="games-diagnosis-card">
      <View style={styles.headerRow}>
        <AppText style={styles.heading} variant="headline">
          In-Game Insights
        </AppText>
        <Badge
          label={headline.title}
          testID="games-diagnosis-headline"
          tone={headline.tone}
        />
      </View>

      {showClock ? (
        <View style={styles.clockSection} testID="games-diagnosis-clock">
          <View style={styles.clockBar}>
            {timeTroublePct > 0 ? (
              <View
                style={[
                  styles.clockSegment,
                  { flex: timeTroublePct, backgroundColor: theme.colors.danger.s500 }
                ]}
              />
            ) : null}
            {impulsivePct > 0 ? (
              <View
                style={[
                  styles.clockSegment,
                  { flex: impulsivePct, backgroundColor: theme.colors.warning.s500 }
                ]}
              />
            ) : null}
            {deliberatePct > 0 ? (
              <View
                style={[
                  styles.clockSegment,
                  { flex: deliberatePct, backgroundColor: theme.colors.accent.fill }
                ]}
              />
            ) : null}
          </View>
          <AppText tone="secondary" variant="caption">
            {`Time trouble ${timeTroublePct}% · Impulsive ${impulsivePct}% · Deliberate ${deliberatePct}%`}
          </AppText>
        </View>
      ) : null}

      {diagnosis.timeClassSummaries.length >= 2 ? (
        <View style={styles.timeClassRow} testID="games-diagnosis-time-classes">
          {diagnosis.timeClassSummaries.map((summary) => (
            <View key={summary.timeClass} style={styles.timeClassPill}>
              <AppText tone="secondary" variant="caption">
                {gameTimeClassLabel(summary.timeClass, locale)}
              </AppText>
              <AppText style={styles.timeClassValue} variant="caption">
                {summary.averageAccuracy !== undefined
                  ? `${Math.round(summary.averageAccuracy)}%`
                  : `${summary.gameCount}`}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      {diagnosis.topBlindspots.length > 0 ? (
        <View style={styles.blindspotsRow} testID="games-diagnosis-blindspots">
          {diagnosis.topBlindspots.slice(0, 4).map((spot) => (
            <Pressable
              key={spot.theme}
              accessibilityRole={onPracticeBlindspotTheme ? "button" : "text"}
              disabled={!onPracticeBlindspotTheme}
              style={({ pressed }) => [
                styles.blindspotChip,
                pressed && onPracticeBlindspotTheme ? styles.blindspotChipPressed : null
              ]}
              testID={`games-diagnosis-blindspot-${spot.theme}`}
              onPress={() => onPracticeBlindspotTheme?.(spot.theme)}
            >
              <AppText style={styles.blindspotChipText} variant="caption">
                {`${customThemeLabel(spot.theme, locale)} (${spot.totalCount})`}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Section>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
    gap: 10,
    padding: 14
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between"
  },
  heading: {
    color: theme.colors.text.primary
  },
  clockSection: {
    gap: 4
  },
  clockBar: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.capsule,
    flexDirection: "row",
    height: 6,
    overflow: "hidden"
  },
  clockSegment: {
    height: 6
  },
  timeClassRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  timeClassPill: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceSunken,
    borderRadius: theme.shape.control,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  timeClassValue: {
    color: theme.colors.text.primary,
    fontWeight: "700"
  },
  blindspotsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  blindspotChip: {
    backgroundColor: theme.colors.surfaceSunken,
    borderColor: theme.colors.accent.s400,
    borderRadius: theme.shape.capsule,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  blindspotChipPressed: {
    opacity: 0.78
  },
  blindspotChipText: {
    color: theme.colors.text.primary,
    fontWeight: "600"
  }
}));
