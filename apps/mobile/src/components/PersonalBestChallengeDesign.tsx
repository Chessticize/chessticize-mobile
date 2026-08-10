import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import type { SprintState } from "../../../../packages/core/src/types.ts";

export type PersonalBestRatingBandPresentation = {
  currentRating: number;
  minRating: number;
  maxRating: number;
};

export type PersonalBestRecentScorePresentation = {
  completedAtLabel: string;
  score: number;
};

export type PersonalBestChallengeDesignPreview = {
  band: PersonalBestRatingBandPresentation;
  bestScore: number | null;
  completedRunCount: number;
  guideInitiallyVisible?: boolean;
  showActivePresentation?: boolean;
  showHistoryCard?: boolean;
  startState?: SprintState;
  result?: {
    activeElapsedMs: number;
    isNewBest: boolean;
    previousBestScore: number | null;
  };
  recentScores?: readonly PersonalBestRecentScorePresentation[];
};

export function PersonalBestHomeCard({
  presentation,
  onHowItWorks,
  onStart
}: {
  presentation: PersonalBestChallengeDesignPreview;
  onHowItWorks: () => void;
  onStart: () => void;
}): React.JSX.Element {
  const bestLabel = presentation.bestScore === null
    ? "Set your first best"
    : `Beat ${presentation.bestScore} at this level`;
  return (
    <View
      accessibilityLabel={`Personal Best challenge. ${bestLabel}. Current Rating ${presentation.band.currentRating}. Puzzles ${presentation.band.minRating} to ${presentation.band.maxRating}. No timer. The Run ends after three mistakes. Rating unchanged.`}
      style={styles.homeCard}
      testID="personal-best-home-card"
    >
      <View style={styles.homeCardHeader}>
        <View style={styles.medal}>
          <Text style={styles.medalText}>PB</Text>
        </View>
        <View style={styles.homeTitleBlock}>
          <Text style={styles.eyebrow}>SELF-CHALLENGE</Text>
          <Text style={styles.homeTitle}>Personal Best</Text>
        </View>
        <UnratedPill />
      </View>

      <View style={styles.homeScoreRow}>
        {presentation.bestScore === null ? (
          <Text style={styles.homeScoreEmpty}>Set your first best</Text>
        ) : (
          <>
            <Text style={styles.homeScore} testID="personal-best-home-score">
              {presentation.bestScore}
            </Text>
            <View style={styles.homeScoreCopy}>
              <Text style={styles.homeScoreLabel}>Best solved</Text>
              <Text style={styles.homeScoreHint}>at your current level</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.detailRow}>
        <View style={styles.detailChip}>
          <Text style={styles.detailChipText}>Rating {presentation.band.currentRating}</Text>
        </View>
        <View style={styles.detailChip}>
          <Text style={styles.detailChipText}>
            Puzzles {presentation.band.minRating}–{presentation.band.maxRating}
          </Text>
        </View>
      </View>
      <Text style={styles.homeRule}>No timer · Three mistakes end the Run</Text>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="How Personal Best works"
          style={styles.secondaryAction}
          testID="personal-best-how-it-works"
          onPress={onHowItWorks}
        >
          <Text style={styles.secondaryActionText}>How it works</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start Personal Best challenge"
          style={styles.primaryAction}
          testID="personal-best-start"
          onPress={onStart}
        >
          <Text style={styles.primaryActionText}>Start challenge</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function PersonalBestGuide({
  presentation,
  onClose,
  onStart
}: {
  presentation: PersonalBestChallengeDesignPreview;
  onClose: () => void;
  onStart: () => void;
}): React.JSX.Element {
  const rules = [
    {
      marker: "1",
      title: "Same level for the whole Run",
      detail: `Your current Rating ${presentation.band.currentRating} locks puzzles to ${presentation.band.minRating}–${presentation.band.maxRating}. A new Run uses your Rating at that time.`
    },
    {
      marker: "×3",
      title: "Three mistakes end the Run",
      detail: "Every wrong puzzle is added to Review. Marking a puzzle Unclear does not count as a mistake."
    },
    {
      marker: "—",
      title: "No timer",
      detail: "Take the time you need. Active solving time is saved for context, but only solved puzzles set your score."
    }
  ];
  return (
    <View style={styles.guideScreen} testID="personal-best-guide">
      <View style={styles.guideTopBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close Personal Best guide"
          style={styles.closeButton}
          testID="personal-best-guide-close"
          onPress={onClose}
        >
          <Text style={styles.closeButtonText}>×</Text>
        </Pressable>
        <Text style={styles.guideTopBarTitle}>Personal Best</Text>
        <View style={styles.closeButton} />
      </View>

      <View style={styles.guideHero}>
        <View style={styles.guideMedal}>
          <Text style={styles.guideMedalText}>PB</Text>
        </View>
        <Text style={styles.guideTitle}>Set a personal best</Text>
        <Text style={styles.guideIntro}>
          Solve as many puzzles as you can at your current level. Your Rating stays unchanged.
        </Text>
        <View style={styles.guideBandRow}>
          <Text style={styles.guideBandPrimary}>Rating {presentation.band.currentRating}</Text>
          <Text style={styles.guideBandSecondary}>
            Puzzles {presentation.band.minRating}–{presentation.band.maxRating}
          </Text>
        </View>
      </View>

      <View style={styles.ruleList}>
        {rules.map((rule) => (
          <View key={rule.title} style={styles.ruleRow}>
            <View style={styles.ruleMarker}>
              <Text style={styles.ruleMarkerText}>{rule.marker}</Text>
            </View>
            <View style={styles.ruleCopy}>
              <Text style={styles.ruleTitle}>{rule.title}</Text>
              <Text style={styles.ruleDetail}>{rule.detail}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.guideBestRow}>
        <Text style={styles.guideBestLabel}>Best at this level</Text>
        <Text style={styles.guideBestValue} testID="personal-best-guide-score">
          {presentation.bestScore ?? "—"}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start Personal Best"
        style={styles.guideStartAction}
        testID="personal-best-guide-start"
        onPress={onStart}
      >
        <Text style={styles.primaryActionText}>Start Personal Best</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Not now"
        style={styles.guideNotNowAction}
        testID="personal-best-guide-not-now"
        onPress={onClose}
      >
        <Text style={styles.secondaryActionText}>Not now</Text>
      </Pressable>
    </View>
  );
}

export function PersonalBestProgressBanner({
  bestScore,
  compact = false,
  score
}: {
  bestScore: number | null;
  compact?: boolean;
  score: number;
}): React.JSX.Element {
  const target = (bestScore ?? -1) + 1;
  const isNewBest = bestScore === null || score >= target;
  const remaining = Math.max(0, target - score);
  const progress = isNewBest ? 1 : Math.max(0.06, score / Math.max(1, target));
  const title = isNewBest
    ? `New best · ${score}`
    : `${remaining} more to beat ${bestScore}`;
  return (
    <View
      accessibilityLabel={isNewBest
        ? `New personal best, ${score} solved`
        : `${score} solved, ${remaining} more to beat personal best ${bestScore}`}
      style={[styles.progressBanner, compact ? styles.progressBannerCompact : null]}
      testID="personal-best-progress"
    >
      <View style={styles.progressCopyRow}>
        <Text style={styles.progressTitle} testID="personal-best-progress-title">{title}</Text>
        <Text style={styles.progressScore}>{score} solved</Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            isNewBest ? styles.progressFillBest : null,
            { width: `${Math.round(progress * 100)}%` }
          ]}
          testID="personal-best-progress-fill"
        />
      </View>
    </View>
  );
}

export function PersonalBestMistakeIndicator({
  count,
  max
}: {
  count: number;
  max: number;
}): React.JSX.Element {
  return (
    <View
      accessibilityLabel={`Mistakes ${count} of ${max}`}
      style={styles.mistakeIndicator}
      testID="personal-best-mistakes"
    >
      <View style={styles.mistakeDots}>
        {Array.from({ length: max }, (_, index) => {
          const used = index < count;
          return (
            <View
              key={index}
              style={[styles.mistakeDot, used ? styles.mistakeDotUsed : null]}
              testID={`personal-best-mistake-${index}`}
            >
              <Text style={[styles.mistakeDotText, used ? styles.mistakeDotTextUsed : null]}>
                {used ? "×" : ""}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.mistakeCount}>{count}/{max}</Text>
    </View>
  );
}

export function UnratedPill(): React.JSX.Element {
  return (
    <View accessibilityLabel="Rating unchanged" style={styles.unratedPill} testID="personal-best-unrated">
      <Text style={styles.unratedPillText}>Unrated</Text>
    </View>
  );
}

export function PersonalBestResult({
  activeElapsedMs,
  band,
  bestStreak,
  isNewBest,
  mistakeCount,
  onDone,
  onReplayMistakes,
  onTryAgain,
  previousBestScore,
  score
}: {
  activeElapsedMs: number;
  band: PersonalBestRatingBandPresentation;
  bestStreak: number;
  isNewBest: boolean;
  mistakeCount: number;
  onDone: () => void;
  onReplayMistakes?: () => void;
  onTryAgain: () => void;
  previousBestScore: number | null;
  score: number;
}): React.JSX.Element {
  const attemptCount = score + mistakeCount;
  const accuracy = Math.round((score / Math.max(1, attemptCount)) * 100);
  const resultTitle = isNewBest ? "New personal best" : "Run complete";
  const comparison = previousBestScore === null
    ? "First score at this level"
    : isNewBest
      ? `Previous best ${previousBestScore}`
      : `${Math.max(0, previousBestScore - score)} short of best ${previousBestScore}`;
  return (
    <View style={styles.resultPanel} testID="personal-best-result">
      <View style={styles.resultTopBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          style={styles.resultDoneButton}
          testID="personal-best-result-done"
          onPress={onDone}
        >
          <Text style={styles.resultDoneButtonText}>Done</Text>
        </Pressable>
        <Text style={styles.resultTopBarTitle}>Personal Best Result</Text>
        <View style={styles.resultDoneButton} />
      </View>

      <View style={[styles.resultHero, isNewBest ? styles.resultHeroBest : null]}>
        <View style={styles.resultBadge}>
          <Text style={styles.resultBadgeText}>{isNewBest ? "NEW BEST" : "COMPLETE"}</Text>
        </View>
        <Text style={styles.resultTitle}>{resultTitle}</Text>
        <View style={styles.resultScoreRow}>
          <Text style={styles.resultScore} testID="personal-best-result-score">{score}</Text>
          <Text style={styles.resultScoreLabel}>solved</Text>
        </View>
        <Text style={styles.resultComparison} testID="personal-best-result-comparison">
          {comparison}
        </Text>
        <Text style={styles.resultEndReason}>The Run ended after {mistakeCount} mistakes.</Text>
      </View>

      <View style={styles.resultBandCard}>
        <View>
          <Text style={styles.resultBandTitle}>Rating {band.currentRating} unchanged</Text>
          <Text style={styles.resultBandDetail}>Puzzles {band.minRating}–{band.maxRating}</Text>
        </View>
        <UnratedPill />
      </View>

      <View style={styles.resultMetrics}>
        <ResultMetric label="Accuracy" value={`${accuracy}%`} />
        <ResultMetric label="Active time" value={formatElapsed(activeElapsedMs)} />
        <ResultMetric label="Best streak" value={String(bestStreak)} />
      </View>

      <View style={styles.reviewRow} testID="personal-best-result-review">
        <View style={styles.reviewIcon}>
          <Text style={styles.reviewIconText}>↺</Text>
        </View>
        <View style={styles.reviewCopy}>
          <Text style={styles.reviewTitle}>{mistakeCount} mistakes added to Review</Text>
          <Text style={styles.reviewDetail}>Replay them now or return from the Review tab later.</Text>
        </View>
      </View>

      {onReplayMistakes ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Replay ${mistakeCount} mistakes`}
          style={styles.resultPrimaryAction}
          testID="personal-best-result-replay"
          onPress={onReplayMistakes}
        >
          <Text style={styles.primaryActionText}>Replay {mistakeCount} mistakes</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Try Personal Best again"
        style={styles.resultSecondaryAction}
        testID="personal-best-result-try-again"
        onPress={onTryAgain}
      >
        <Text style={styles.secondaryActionText}>Try again</Text>
      </Pressable>
    </View>
  );
}

export function PersonalBestHistoryCard({
  presentation
}: {
  presentation: PersonalBestChallengeDesignPreview;
}): React.JSX.Element {
  const recentScores = presentation.recentScores ?? [];
  const maximum = Math.max(1, presentation.bestScore ?? 0, ...recentScores.map((item) => item.score));
  const recentSummary = recentScores.map((item) => `${item.score} on ${item.completedAtLabel}`).join(", ");
  return (
    <View
      accessibilityLabel={`Personal Best at the current level. Best ${presentation.bestScore ?? "not set"}. Rating ${presentation.band.currentRating}. Puzzles ${presentation.band.minRating} to ${presentation.band.maxRating}. ${presentation.completedRunCount} completed Runs. Recent scores: ${recentSummary}. Runs ended early stay in History but do not set a best.`}
      style={styles.historyCard}
      testID="personal-best-history-card"
    >
      <View style={styles.historyHeader}>
        <View>
          <Text style={styles.historyEyebrow}>CURRENT LEVEL</Text>
          <Text style={styles.historyTitle}>Personal Best</Text>
        </View>
        <View style={styles.historyBandPill}>
          <Text style={styles.historyBandPillText}>
            {presentation.band.minRating}–{presentation.band.maxRating}
          </Text>
        </View>
      </View>

      <View style={styles.historySummaryRow}>
        <View style={styles.historyBestBlock}>
          <Text style={styles.historyBestValue} testID="personal-best-history-score">
            {presentation.bestScore ?? "—"}
          </Text>
          <Text style={styles.historyBestLabel}>Best solved</Text>
        </View>
        <View style={styles.historySummaryCopy}>
          <Text style={styles.historySummaryPrimary}>Rating {presentation.band.currentRating}</Text>
          <Text style={styles.historySummarySecondary}>
            {presentation.completedRunCount} completed Runs
          </Text>
        </View>
      </View>

      {recentScores.length > 0 ? (
        <View style={styles.chartBlock}>
          <Text style={styles.chartTitle}>Recent completed Runs</Text>
          <View style={styles.chart} testID="personal-best-history-chart">
            {recentScores.map((item, index) => (
              <View key={`${item.completedAtLabel}-${index}`} style={styles.chartColumn}>
                <Text style={styles.chartValue}>{item.score}</Text>
                <View style={styles.chartTrack}>
                  <View
                    style={[
                      styles.chartBar,
                      item.score === presentation.bestScore ? styles.chartBarBest : null,
                      { height: `${Math.max(12, Math.round((item.score / maximum) * 100))}%` }
                    ]}
                  />
                </View>
                <Text style={styles.chartLabel}>{item.completedAtLabel}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <Text style={styles.historyFootnote}>
        Runs ended early stay in History but do not set a best.
      </Text>
    </View>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.resultMetric}>
      <Text style={styles.resultMetricValue}>{value}</Text>
      <Text style={styles.resultMetricLabel}>{label}</Text>
    </View>
  );
}

function formatElapsed(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  actionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 16
  },
  chart: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8,
    height: 112,
    justifyContent: "space-between"
  },
  chartBar: {
    backgroundColor: "#60A5FA",
    borderRadius: 6,
    minHeight: 12,
    width: "100%"
  },
  chartBarBest: {
    backgroundColor: "#F59E0B"
  },
  chartBlock: {
    borderTopColor: "#DBEAFE",
    borderTopWidth: 1,
    gap: 10,
    marginTop: 16,
    paddingTop: 14
  },
  chartColumn: {
    alignItems: "center",
    flex: 1,
    gap: 4,
    height: "100%"
  },
  chartLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "600"
  },
  chartTitle: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700"
  },
  chartTrack: {
    backgroundColor: "#E2E8F0",
    borderRadius: 6,
    flex: 1,
    justifyContent: "flex-end",
    overflow: "hidden",
    width: 22
  },
  chartValue: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "800"
  },
  closeButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  },
  closeButtonText: {
    color: "#334155",
    fontSize: 26,
    fontWeight: "400"
  },
  detailChip: {
    backgroundColor: "rgba(255,255,255,0.76)",
    borderColor: "#BFDBFE",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  detailChipText: {
    color: "#1E3A8A",
    fontSize: 12,
    fontWeight: "700"
  },
  detailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  eyebrow: {
    color: "#2563EB",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8
  },
  guideBandPrimary: {
    color: "#1E3A8A",
    fontSize: 13,
    fontWeight: "800"
  },
  guideBandRow: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  guideBandSecondary: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600"
  },
  guideBestLabel: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700"
  },
  guideBestRow: {
    alignItems: "center",
    borderTopColor: "#E2E8F0",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    paddingTop: 16
  },
  guideBestValue: {
    color: "#B45309",
    fontSize: 24,
    fontWeight: "900"
  },
  guideHero: {
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 8
  },
  guideIntro: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    maxWidth: 500,
    textAlign: "center"
  },
  guideMedal: {
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderColor: "#F59E0B",
    borderRadius: 26,
    borderWidth: 2,
    height: 52,
    justifyContent: "center",
    marginBottom: 12,
    width: 52
  },
  guideMedalText: {
    color: "#92400E",
    fontSize: 16,
    fontWeight: "900"
  },
  guideNotNowAction: {
    alignItems: "center",
    borderRadius: 12,
    minHeight: 44,
    justifyContent: "center",
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 11
  },
  guideScreen: {
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 620,
    paddingBottom: 18,
    paddingHorizontal: 18,
    width: "100%"
  },
  guideStartAction: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 13
  },
  guideTitle: {
    color: "#0F172A",
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: -0.5,
    textAlign: "center"
  },
  guideTopBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: -8,
    minHeight: 52
  },
  guideTopBarTitle: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "800"
  },
  historyBandPill: {
    backgroundColor: "#DBEAFE",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  historyBandPillText: {
    color: "#1E40AF",
    fontSize: 12,
    fontWeight: "800"
  },
  historyBestBlock: {
    borderRightColor: "#DBEAFE",
    borderRightWidth: 1,
    minWidth: 94,
    paddingRight: 20
  },
  historyBestLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700"
  },
  historyBestValue: {
    color: "#1D4ED8",
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1
  },
  historyCard: {
    backgroundColor: "#F8FBFF",
    borderColor: "#BFDBFE",
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16
  },
  historyEyebrow: {
    color: "#2563EB",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9
  },
  historyFootnote: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 14
  },
  historyHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  historySummaryCopy: {
    flex: 1,
    gap: 4
  },
  historySummaryPrimary: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800"
  },
  historySummaryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 20,
    marginTop: 16
  },
  historySummarySecondary: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600"
  },
  historyTitle: {
    color: "#0F172A",
    fontSize: 19,
    fontWeight: "900",
    marginTop: 2
  },
  homeCard: {
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 14,
    padding: 16
  },
  homeCardHeader: {
    alignItems: "center",
    flexDirection: "row"
  },
  homeRule: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 10
  },
  homeScore: {
    color: "#1D4ED8",
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -1.2
  },
  homeScoreCopy: {
    gap: 2
  },
  homeScoreEmpty: {
    color: "#1E3A8A",
    fontSize: 22,
    fontWeight: "900"
  },
  homeScoreHint: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600"
  },
  homeScoreLabel: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800"
  },
  homeScoreRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 14
  },
  homeTitle: {
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 1
  },
  homeTitleBlock: {
    flex: 1,
    marginLeft: 11
  },
  medal: {
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderColor: "#F59E0B",
    borderRadius: 21,
    borderWidth: 1.5,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  medalText: {
    color: "#92400E",
    fontSize: 13,
    fontWeight: "900"
  },
  mistakeCount: {
    color: "#991B1B",
    fontSize: 11,
    fontWeight: "900"
  },
  mistakeDot: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 9,
    borderWidth: 1.5,
    height: 18,
    justifyContent: "center",
    width: 18
  },
  mistakeDotText: {
    color: "transparent",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 15
  },
  mistakeDotTextUsed: {
    color: "#FFFFFF"
  },
  mistakeDotUsed: {
    backgroundColor: "#DC2626",
    borderColor: "#B91C1C"
  },
  mistakeDots: {
    flexDirection: "row",
    gap: 4
  },
  mistakeIndicator: {
    alignItems: "center",
    gap: 3
  },
  primaryAction: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 11,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800"
  },
  progressBanner: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 13,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: "100%"
  },
  progressBannerCompact: {
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  progressCopyRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  progressFill: {
    backgroundColor: "#2563EB",
    borderRadius: 999,
    height: "100%"
  },
  progressFillBest: {
    backgroundColor: "#F59E0B"
  },
  progressScore: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700"
  },
  progressTitle: {
    color: "#1E3A8A",
    flex: 1,
    fontSize: 12,
    fontWeight: "800"
  },
  progressTrack: {
    backgroundColor: "#DBEAFE",
    borderRadius: 999,
    height: 6,
    overflow: "hidden"
  },
  resultBadge: {
    backgroundColor: "#FEF3C7",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5
  },
  resultBadgeText: {
    color: "#92400E",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8
  },
  resultBandCard: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    padding: 13
  },
  resultBandDetail: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3
  },
  resultBandTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800"
  },
  resultComparison: {
    color: "#B45309",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4
  },
  resultDoneButton: {
    alignItems: "flex-start",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 52
  },
  resultDoneButtonText: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "800"
  },
  resultEndReason: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8
  },
  resultHero: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 8,
    padding: 20
  },
  resultHeroBest: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A"
  },
  resultMetric: {
    alignItems: "center",
    flex: 1,
    gap: 3
  },
  resultMetricLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700"
  },
  resultMetricValue: {
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "900"
  },
  resultMetrics: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 12,
    paddingHorizontal: 8,
    paddingVertical: 14
  },
  resultPanel: {
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 620,
    padding: 16,
    width: "100%"
  },
  resultPrimaryAction: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 14,
    minHeight: 48,
    padding: 13
  },
  resultScore: {
    color: "#B45309",
    fontSize: 54,
    fontWeight: "900",
    letterSpacing: -1.8
  },
  resultScoreLabel: {
    color: "#475569",
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 9
  },
  resultScoreRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8
  },
  resultSecondaryAction: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 8,
    minHeight: 46,
    padding: 12
  },
  resultTitle: {
    color: "#0F172A",
    fontSize: 23,
    fontWeight: "900",
    marginTop: 10
  },
  resultTopBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  resultTopBarTitle: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "800"
  },
  reviewCopy: {
    flex: 1
  },
  reviewDetail: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3
  },
  reviewIcon: {
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  reviewIconText: {
    color: "#B91C1C",
    fontSize: 19,
    fontWeight: "900"
  },
  reviewRow: {
    alignItems: "center",
    backgroundColor: "#FFF7F7",
    borderColor: "#FECACA",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    marginTop: 12,
    padding: 12
  },
  reviewTitle: {
    color: "#7F1D1D",
    fontSize: 13,
    fontWeight: "800"
  },
  ruleCopy: {
    flex: 1
  },
  ruleDetail: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3
  },
  ruleList: {
    gap: 10,
    marginVertical: 16
  },
  ruleMarker: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  ruleMarkerText: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "900"
  },
  ruleRow: {
    alignItems: "flex-start",
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 13
  },
  ruleTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800"
  },
  secondaryAction: {
    alignItems: "center",
    borderColor: "#93C5FD",
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  secondaryActionText: {
    color: "#1D4ED8",
    fontSize: 14,
    fontWeight: "800"
  },
  unratedPill: {
    backgroundColor: "#DBEAFE",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  unratedPillText: {
    color: "#1E40AF",
    fontSize: 11,
    fontWeight: "800"
  }
});
