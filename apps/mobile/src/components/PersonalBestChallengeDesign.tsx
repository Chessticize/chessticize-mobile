import React from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import type { SprintState } from "../../../../packages/core/src/types.ts";

const SURVIVAL_DISCLOSURE_MOTION_DURATION_MS = 200;

export type PersonalBestRatingBandPresentation = {
  currentRating: number;
  minRating: number;
  maxRating: number;
};

export type PersonalBestRecentScorePresentation = {
  completedAtLabel: string;
  score: number;
};

export type PersonalBestChallengeType = "puzzle" | "arrow_duel";

export type PersonalBestReferenceRunPresentation = {
  challengeType: PersonalBestChallengeType;
  durationLabel: string;
  games: number;
  id: string;
  isOnHome?: boolean;
  name: string;
  perPuzzleLabel: string;
  rating: number;
};

export type PersonalBestAvailableLevelPresentation = {
  maxRating: number;
  minRating: number;
};

export type PersonalBestChallengeSelection = {
  band: PersonalBestAvailableLevelPresentation;
  bestScore: number | null;
  challengeType: PersonalBestChallengeType;
  sourceId: string;
  sourceRating: number;
};

export type PersonalBestPausedRunPresentation = {
  activeElapsedMs: number;
  challengeType: PersonalBestChallengeType;
  id: string;
  lastTouchedLabel: string;
  maxRating: number;
  minRating: number;
  mistakeCount: number;
  phaseLabel?: string;
  resumeState?: SprintState;
  score: number;
  sittings: number;
};

export type PersonalBestLevelRecordPresentation = {
  challengeType: PersonalBestChallengeType;
  completedRunCount: number;
  isRecommended?: boolean;
  maxRating: number;
  minRating: number;
  score: number;
};

export type PersonalBestChallengeDesignPreview = {
  availableLevels?: readonly PersonalBestAvailableLevelPresentation[];
  band: PersonalBestRatingBandPresentation;
  bestScore: number | null;
  challengeType?: PersonalBestChallengeType;
  completedRunCount: number;
  exitConfirmationInitiallyVisible?: boolean;
  guideInitiallyVisible?: boolean;
  hubInitiallyVisible?: boolean;
  levelRecords?: readonly PersonalBestLevelRecordPresentation[];
  moreLevelsInitiallyVisible?: boolean;
  pausedRuns?: readonly PersonalBestPausedRunPresentation[];
  referenceRuns?: readonly PersonalBestReferenceRunPresentation[];
  selectedReferenceRunIds?: Partial<Record<PersonalBestChallengeType, string>>;
  showActivePresentation?: boolean;
  recordsInitiallyVisible?: boolean;
  sourcePickerInitiallyVisible?: boolean;
  startState?: SprintState;
  startStates?: Partial<Record<PersonalBestChallengeType, SprintState>>;
  result?: {
    activeElapsedMs: number;
    endReason?: "max_mistakes" | "pool_cleared";
    isNewBest: boolean;
    previousBestScore: number | null;
    sittings: number;
  };
  recentScores?: readonly PersonalBestRecentScorePresentation[];
};

export function PersonalBestHomeCard({
  presentation,
  onHowItWorks,
  onOpenHub
}: {
  presentation: PersonalBestChallengeDesignPreview;
  onHowItWorks: () => void;
  onOpenHub: (run?: PersonalBestPausedRunPresentation) => void;
}): React.JSX.Element {
  const pausedRuns = presentation.pausedRuns ?? [];
  const latestPaused = pausedRuns[0] ?? null;
  const morePausedCount = Math.max(0, pausedRuns.length - 1);
  if (latestPaused) {
    const typeLabel = challengeTypeLabel(latestPaused.challengeType);
    const reachedNewBest = presentation.bestScore === null
      || latestPaused.score > presentation.bestScore;
    return (
      <Pressable
        accessibilityLabel={`Survival paused. ${typeLabel}. Level ${latestPaused.minRating} to ${latestPaused.maxRating}. ${latestPaused.score} solved. ${latestPaused.mistakeCount} of 3 mistakes. ${morePausedCount} more paused ${morePausedCount === 1 ? "Run" : "Runs"}.`}
        accessibilityHint="Opens the Survival Hub"
        accessibilityRole="button"
        style={styles.homeCard}
        testID="personal-best-home-card"
        onPress={() => onOpenHub(latestPaused)}
      >
        <View style={styles.homeCardHeader}>
          <View style={styles.homeTitleBlock}>
            <Text style={styles.eyebrow}>SURVIVAL PAUSED</Text>
            <Text style={styles.homeTitle}>{typeLabel} · {levelLabel(latestPaused)}</Text>
          </View>
        </View>
        <View style={styles.pausedHomeSummary}>
          <View>
            <Text style={styles.homeScore} testID="personal-best-home-score">
              {latestPaused.score}
            </Text>
            <Text style={styles.homeScoreLabel}>solved</Text>
          </View>
          <View style={styles.pausedHomeMeta}>
            {reachedNewBest ? (
              <Text style={styles.pausedHomeBest}>New best saved</Text>
            ) : null}
            <Text style={styles.pausedHomeMetaStrong}>{latestPaused.mistakeCount} of 3 mistakes</Text>
            <Text style={styles.pausedHomeMetaText}>
              {formatElapsed(latestPaused.activeElapsedMs)} active · {latestPaused.sittings} sittings
            </Text>
            <Text style={styles.pausedHomeMetaText}>{latestPaused.lastTouchedLabel}</Text>
          </View>
        </View>
        <View style={styles.pausedHomeOpenRow}>
          {morePausedCount > 0 ? (
            <Text style={styles.pausedHomeMoreText} testID="personal-best-more-paused-count">
              {morePausedCount} more paused
            </Text>
          ) : <View />}
          <View style={styles.pausedHomeOpenAction}>
            <Text style={styles.pausedHomeOpenText}>Open Survival</Text>
            <Text style={styles.pausedHomeOpenChevron}>›</Text>
          </View>
        </View>
      </Pressable>
    );
  }
  const bestLabel = presentation.bestScore === null
    ? "Set your first best"
    : `Best ${presentation.bestScore} at ${levelLabel(presentation.band)}`;
  return (
    <View
      accessibilityLabel={`Survival. ${bestLabel}. Choose Puzzle or Arrow Duel and a fixed level. No time limit. The Run ends after three mistakes.`}
      style={styles.homeCard}
      testID="personal-best-home-card"
    >
      <View style={styles.homeCardHeader}>
        <View style={styles.homeTitleBlock}>
          <Text style={styles.eyebrow}>THREE-MISTAKE CHALLENGE</Text>
          <Text style={styles.homeTitle}>Survival</Text>
        </View>
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
              <Text style={styles.homeScoreHint}>at {levelLabel(presentation.band)}</Text>
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
            Recommended {presentation.band.minRating}–{presentation.band.maxRating}
          </Text>
        </View>
      </View>
      <Text style={styles.homeRule}>No time limit · Puzzle and Arrow Duel records stay separate</Text>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="How Survival works"
          style={styles.secondaryAction}
          testID="personal-best-how-it-works"
          onPress={onHowItWorks}
        >
          <Text style={styles.secondaryActionText}>How it works</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose a Survival Run"
          style={styles.primaryAction}
          testID="personal-best-start"
          onPress={() => onOpenHub()}
        >
          <Text style={styles.primaryActionText}>Choose a challenge</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function PersonalBestGuide({
  acknowledgementOnly = false,
  backAccessibilityLabel = "Back from Survival guide",
  presentation,
  onAcknowledge,
  onClose,
  onStart
}: {
  acknowledgementOnly?: boolean;
  backAccessibilityLabel?: string;
  presentation: PersonalBestChallengeDesignPreview;
  onAcknowledge: () => void;
  onClose: () => void;
  onStart: () => void;
}): React.JSX.Element {
  const challengeType = presentation.challengeType ?? "puzzle";
  const typeLabel = challengeTypeLabel(challengeType);
  const rules = [
    {
      marker: "1",
      title: "One level for the whole Run",
      detail: `${typeLabel} stays at ${presentation.band.minRating}–${presentation.band.maxRating}. Records from other levels and challenge types are never compared.`
    },
    {
      marker: "×3",
      title: challengeType === "arrow_duel" ? "Candidate and reply make one puzzle" : "Three mistakes end the Run",
      detail: challengeType === "arrow_duel"
        ? "Choose the candidate, then play the required opponent reply. A wrong candidate or reply adds one mistake, never two."
        : "Every wrong puzzle adds one mistake and enters Review. Marking it Unclear does not add another mistake."
    },
    {
      marker: "—",
      title: "No time limit",
      detail: "Puzzle time counts up for context. It never changes your score, mistakes, best, or Unclear status. Your Rating stays unchanged."
    },
    {
      marker: "Ⅱ",
      title: "Pause now, continue later",
      detail: "Every new high is saved immediately. Leaving pauses this exact puzzle and stops active time; continue after restarting the app or playing another mode."
    }
  ];
  return (
    <View style={styles.guideScreen} testID="personal-best-guide">
      <View style={styles.guideTopBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backAccessibilityLabel}
          style={styles.closeButton}
          testID="personal-best-guide-close"
          onPress={onClose}
        >
          <Text style={styles.recordsBackText}>‹</Text>
        </Pressable>
        <Text style={styles.guideTopBarTitle}>Survival</Text>
        <View style={styles.closeButton} />
      </View>

      <View style={styles.guideHero}>
        <Text style={styles.guideTitle}>How far can you go?</Text>
        <Text style={styles.guideIntro}>
          Solve as many as you can at one fixed level.
        </Text>
        <View style={styles.guideBandRow}>
          <Text style={styles.guideBandPrimary}>{typeLabel} · {levelLabel(presentation.band)}</Text>
          <Text style={styles.guideBandSecondary}>
            {presentation.bestScore === null ? "Set your first best" : `Best ${presentation.bestScore}`}
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
        <Text style={styles.guideBestLabel}>Best at {levelLabel(presentation.band)}</Text>
        <Text style={styles.guideBestValue} testID="personal-best-guide-score">
          {presentation.bestScore ?? "—"}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={acknowledgementOnly ? "Acknowledge Survival rules" : "Start Survival"}
        style={styles.guideStartAction}
        testID="personal-best-guide-start"
        onPress={acknowledgementOnly ? onAcknowledge : onStart}
      >
        <Text style={styles.primaryActionText}>{acknowledgementOnly ? "Got it" : "Start Survival"}</Text>
      </Pressable>
      {!acknowledgementOnly ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Not now"
          style={styles.guideNotNowAction}
          testID="personal-best-guide-not-now"
          onPress={onClose}
        >
          <Text style={styles.secondaryActionText}>Not now</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PersonalBestChallengeHub({
  presentation,
  onClose,
  onCloseRecords,
  onContinue,
  onHowItWorks,
  onOpenRecords,
  recordsVisible,
  onStart
}: {
  presentation: PersonalBestChallengeDesignPreview;
  onClose: () => void;
  onCloseRecords: () => void;
  onContinue: (runId: string) => void;
  onHowItWorks: (selection: PersonalBestChallengeSelection) => void;
  onOpenRecords: () => void;
  recordsVisible: boolean;
  onStart: (selection: PersonalBestChallengeSelection) => void;
}): React.JSX.Element {
  const { width: viewportWidth } = useWindowDimensions();
  const initialType = presentation.challengeType ?? "puzzle";
  const [challengeType, setChallengeType] = React.useState<PersonalBestChallengeType>(initialType);
  const pausedRuns = presentation.pausedRuns ?? [];
  const [sourcePickerVisible, setSourcePickerVisible] = React.useState(
    presentation.sourcePickerInitiallyVisible === true
  );
  const [selectedSourceIds, setSelectedSourceIds] = React.useState<Partial<Record<PersonalBestChallengeType, string>>>(
    () => ({ ...presentation.selectedReferenceRunIds })
  );
  const initialSource = referenceRunFor(
    presentation,
    initialType,
    presentation.selectedReferenceRunIds?.[initialType]
  );
  const availableLevels = presentation.availableLevels?.length
    ? [...presentation.availableLevels].sort((left, right) => left.minRating - right.minRating)
    : defaultSurvivalLevels();
  const requestedInitialBand = initialSource
    ? canonicalBandFor(initialSource.rating)
    : { minRating: presentation.band.minRating, maxRating: presentation.band.maxRating };
  const initialBand = closestAvailableBand(availableLevels, requestedInitialBand);
  const [selectedBand, setSelectedBand] = React.useState(initialBand);
  const [moreLevelsVisible, setMoreLevelsVisible] = React.useState(
    presentation.moreLevelsInitiallyVisible === true
  );
  const [inProgressVisible, setInProgressVisible] = React.useState(true);
  const selectedSourceId = selectedSourceIds[challengeType];
  const source = referenceRunFor(presentation, challengeType, selectedSourceId);
  const sourceUnavailable = selectedSourceId !== undefined && source === undefined;
  const requestedRecommendedBand = source ? canonicalBandFor(source.rating) : selectedBand;
  const recommendedBand = closestAvailableBand(availableLevels, requestedRecommendedBand);
  const recommendedIndex = availableLevels.findIndex((level) => (
    level.minRating === recommendedBand.minRating
  ));
  const sourceAboveAvailableLevels = requestedRecommendedBand.minRating > recommendedBand.minRating;
  const compatibleReferenceRuns = (presentation.referenceRuns ?? []).filter((referenceRun) => (
    referenceRun.challengeType === challengeType
    && (referenceRun.isOnHome !== false || referenceRun.id === source?.id)
  ));
  const hasAlternativeSource = compatibleReferenceRuns.some((referenceRun) => referenceRun.id !== source?.id);
  const inProgress = pausedRuns.filter((run) => run.challengeType === challengeType);
  const selectedInProgress = inProgress.find((run) => (
    run.minRating === selectedBand.minRating
    && run.maxRating === selectedBand.maxRating
  ));
  const selectedBest = survivalBestScoreForLevel({
    band: selectedBand,
    challengeType,
    fallbackBest: challengeType === initialType
      && selectedBand.minRating === presentation.band.minRating
      && selectedBand.maxRating === presentation.band.maxRating
        ? presentation.bestScore
        : null,
    pausedRuns,
    records: presentation.levelRecords ?? []
  });
  const adjacentLevels = availableLevels
    .map((level, index) => ({
      ...level,
      index,
      label: index < recommendedIndex
        ? "Easier"
        : index > recommendedIndex
          ? "Harder"
          : sourceAboveAvailableLevels
            ? "Highest available"
            : "Recommended"
    }))
    .filter((level) => Math.abs(level.index - recommendedIndex) <= 1);
  const compactFourDigitLevelRanges = viewportWidth < 480 && adjacentLevels.length === 3;
  const otherLevels = availableLevels
    .filter((level) => !adjacentLevels.some((adjacent) => adjacent.minRating === level.minRating));

  function chooseChallengeType(nextType: PersonalBestChallengeType): void {
    setChallengeType(nextType);
    const nextSource = referenceRunFor(presentation, nextType, selectedSourceIds[nextType]);
    if (nextSource) {
      setSelectedBand(closestAvailableBand(availableLevels, canonicalBandFor(nextSource.rating)));
    }
    setMoreLevelsVisible(false);
  }

  function chooseSource(nextSource: PersonalBestReferenceRunPresentation): void {
    setSelectedSourceIds((current) => ({ ...current, [challengeType]: nextSource.id }));
    setSelectedBand(closestAvailableBand(availableLevels, canonicalBandFor(nextSource.rating)));
    setSourcePickerVisible(false);
  }

  function selectedChallenge(): PersonalBestChallengeSelection | null {
    if (!source) {
      setSourcePickerVisible(true);
      return null;
    }
    return {
      band: selectedBand,
      bestScore: selectedBest,
      challengeType,
      sourceId: source.id,
      sourceRating: source.rating
    };
  }

  function startSelection(): void {
    const selection = selectedChallenge();
    if (selection) {
      onStart(selection);
    }
  }

  function showGuide(): void {
    const selection = selectedChallenge();
    if (selection) {
      onHowItWorks(selection);
    }
  }

  if (recordsVisible) {
    return (
      <PersonalBestRecordsScreen
        presentation={presentation}
        onBack={onCloseRecords}
      />
    );
  }

  return (
    <View
      style={[styles.hubScreen, { width: Math.min(680, Math.max(0, viewportWidth - 32)) }]}
      testID="personal-best-hub"
    >
      <View style={styles.guideTopBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Practice"
          style={styles.closeButton}
          testID="personal-best-hub-close"
          onPress={onClose}
        >
          <Text style={styles.recordsBackText}>‹</Text>
        </Pressable>
        <Text style={styles.hubTopBarTitle}>Survival</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="How Survival works"
          style={styles.hubHelpButton}
          testID="personal-best-hub-help"
          onPress={showGuide}
        >
          <Text style={styles.hubHelpButtonText}>?</Text>
        </Pressable>
      </View>

      <View style={styles.hubIntro}>
        <Text style={styles.hubTitle}>Choose your Survival Run</Text>
        <Text style={styles.hubIntroText}>
          Stay at one level. Solve as many as you can before your third mistake.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open Survival records. ${presentation.completedRunCount} completed Runs and ${pausedRuns.length} in progress.`}
        style={styles.recordsEntry}
        testID="personal-best-hub-records"
        onPress={onOpenRecords}
      >
        <View style={styles.recordsEntryCopy}>
          <Text style={styles.recordsEntryTitle}>Survival records</Text>
          <Text style={styles.recordsEntryDetail}>
            {presentation.completedRunCount} completed · {pausedRuns.length} in progress
          </Text>
        </View>
        <Text style={styles.recordsEntryChevron}>›</Text>
      </Pressable>

      <View accessibilityRole="tablist" style={styles.typeSelector} testID="personal-best-type-selector">
        {(["puzzle", "arrow_duel"] as const).map((type) => {
          const selected = type === challengeType;
          return (
            <Pressable
              key={type}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.typeOption, selected ? styles.typeOptionSelected : null]}
              testID={`personal-best-type-${type}`}
              onPress={() => chooseChallengeType(type)}
            >
              <Text style={[styles.typeOptionText, selected ? styles.typeOptionTextSelected : null]}>
                {challengeTypeLabel(type)}
              </Text>
              <Text style={[styles.typeOptionDetail, selected ? styles.typeOptionDetailSelected : null]}>
                {type === "puzzle" ? "Play the best line" : "Candidate + reply"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {inProgress.length > 0 ? (
        <View style={styles.hubSection} testID="personal-best-in-progress">
          <Pressable
            accessibilityLabel={`${inProgressVisible ? "Hide" : "Show"} ${inProgress.length} ${challengeTypeLabel(challengeType)} Runs in progress`}
            accessibilityRole="button"
            accessibilityState={{ expanded: inProgressVisible }}
            style={styles.survivalDisclosureHeader}
            testID="personal-best-in-progress-toggle"
            onPress={() => setInProgressVisible((visible) => !visible)}
          >
            <View style={styles.hubSectionTitleRow}>
              <Text style={styles.hubSectionTitle}>In progress</Text>
              <Text style={styles.hubSectionCount}>{inProgress.length}</Text>
            </View>
            <SurvivalDisclosureChevron
              expanded={inProgressVisible}
              testID="personal-best-in-progress-chevron"
            />
          </Pressable>
          <SurvivalCollapsibleRegion
            contentTestID="personal-best-in-progress-content"
            expanded={inProgressVisible}
          >
            {inProgress.map((run) => (
              <View key={run.id} style={styles.pausedRunCard} testID={`personal-best-paused-${run.id}`}>
                <View style={styles.pausedRunCopy}>
                  <Text style={styles.pausedRunTitle}>{challengeTypeLabel(run.challengeType)} · {levelLabel(run)}</Text>
                  <Text style={styles.pausedRunDetail}>
                    {run.score} solved · {run.mistakeCount} of 3 mistakes · {run.phaseLabel ?? "Puzzle saved"}
                  </Text>
                  <Text style={styles.pausedRunMeta}>
                    {formatElapsed(run.activeElapsedMs)} active · {run.sittings} sittings · {run.lastTouchedLabel}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Continue ${challengeTypeLabel(run.challengeType)} ${levelLabel(run)}`}
                  style={styles.pausedRunContinue}
                  testID={`personal-best-paused-continue-${run.id}`}
                  onPress={() => onContinue(run.id)}
                >
                  <Text style={styles.pausedRunContinueText}>Continue</Text>
                </Pressable>
              </View>
            ))}
          </SurvivalCollapsibleRegion>
        </View>
      ) : null}

      {sourcePickerVisible ? (
        <PersonalBestSourcePicker
          challengeType={challengeType}
          presentation={presentation}
          selectedSourceId={selectedSourceId}
          onCancel={() => setSourcePickerVisible(false)}
          onSelect={chooseSource}
        />
      ) : (
        <>
          <View style={styles.hubSection}>
            <Text style={styles.hubSectionTitle}>
              {sourceUnavailable
                ? "Rating source unavailable"
                : sourceAboveAvailableLevels
                ? "Highest available level"
                : source?.games === 0
                  ? "Starting level"
                  : "Recommended level"}
            </Text>
            <View style={styles.sourceCard} testID="personal-best-reference-source">
              <View style={styles.sourceCardCopy}>
                {sourceUnavailable ? (
                  <>
                    <Text style={styles.sourceTitle} testID="personal-best-source-unavailable-message">
                      Your saved Rating source is no longer available.
                    </Text>
                    <Text style={styles.sourceTiming}>Choose a replacement before starting Survival.</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.sourceLevel} testID="personal-best-recommended-level">
                      {levelLabel(recommendedBand)}
                    </Text>
                    <Text style={styles.sourceTitle}>
                      {source?.games === 0
                        ? `Based on ${source.name}’s starting Rating`
                        : `Based on ${source?.name ?? "default Run"} · Rating ${source?.rating ?? presentation.band.currentRating}`}
                    </Text>
                    {source ? (
                      <Text style={styles.sourceTiming}>{source.durationLabel} · {source.perPuzzleLabel}</Text>
                    ) : null}
                  </>
                )}
              </View>
              {hasAlternativeSource || sourceUnavailable ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Use another ${challengeTypeLabel(challengeType)} Run`}
                  style={styles.sourceChangeButton}
                  testID="personal-best-use-another-run"
                  onPress={() => setSourcePickerVisible(true)}
                >
                  <Text style={styles.sourceChangeText}>Use another Run</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.sourceHelper}>
              {sourceUnavailable
                ? "Your saved choice is preserved until you replace it."
                : sourceAboveAvailableLevels
                ? "This is the highest level in your installed Core Pack. Survival has no time limit."
                : source?.isOnHome === false
                  ? `${source.name} remains your Rating source even when hidden from Home.`
                  : "This only changes the suggested level. Survival has no time limit."}
            </Text>
          </View>

          <View style={styles.hubSection}>
            <Text style={styles.hubSectionTitle}>Choose your level</Text>
            <View style={styles.levelGrid} testID="personal-best-level-options">
              {adjacentLevels.map((level) => {
                const selected = selectedBand.minRating === level.minRating;
                const best = survivalBestScoreForLevel({
                  band: level,
                  challengeType,
                  fallbackBest: challengeType === initialType
                    && level.minRating === presentation.band.minRating
                    && level.maxRating === presentation.band.maxRating
                      ? presentation.bestScore
                      : null,
                  pausedRuns,
                  records: presentation.levelRecords ?? []
                });
                return (
                  <Pressable
                    key={level.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[styles.levelCard, selected ? styles.levelCardSelected : null]}
                    testID={`personal-best-level-${level.minRating}`}
                    onPress={() => setSelectedBand({ minRating: level.minRating, maxRating: level.maxRating })}
                  >
                    <Text style={[styles.levelCardLabel, selected ? styles.levelCardLabelSelected : null]}>
                      {level.label}
                    </Text>
                    <Text
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                      numberOfLines={compactFourDigitLevelRanges && level.minRating >= 1000 ? 2 : 1}
                      style={[
                        styles.levelCardRange,
                        compactFourDigitLevelRanges && level.minRating >= 1000
                          ? styles.levelCardRangeCompact
                          : null,
                        selected ? styles.levelCardRangeSelected : null
                      ]}
                    >
                      {compactFourDigitLevelRanges && level.minRating >= 1000
                        ? `${level.minRating}–\n${level.maxRating}`
                        : levelLabel(level)}
                    </Text>
                    <Text style={styles.levelCardBest}>
                      {best === null ? "No best yet" : `Best ${best}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: moreLevelsVisible }}
              style={styles.moreLevelsButton}
              testID="personal-best-more-levels"
              onPress={() => setMoreLevelsVisible((visible) => !visible)}
            >
              <Text style={styles.moreLevelsText}>{moreLevelsVisible ? "Hide more levels" : "More levels"}</Text>
              <SurvivalDisclosureChevron
                expanded={moreLevelsVisible}
                testID="personal-best-more-levels-chevron"
              />
            </Pressable>
            <SurvivalCollapsibleRegion
              contentTestID="personal-best-more-level-options"
              contentStyle={styles.moreLevelGrid}
              expanded={moreLevelsVisible}
            >
                {otherLevels.map((level) => (
                  <Pressable
                    key={level.minRating}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedBand.minRating === level.minRating }}
                    style={[
                      styles.moreLevelChip,
                      selectedBand.minRating === level.minRating ? styles.moreLevelChipSelected : null
                    ]}
                    onPress={() => setSelectedBand(level)}
                  >
                    <Text style={styles.moreLevelChipText}>{levelLabel(level)}</Text>
                  </Pressable>
                ))}
                <Text style={styles.moreLevelsAvailability} testID="personal-best-level-availability">
                  Showing every Survival level in this Core Pack: {availableLevels[0]?.minRating}–{availableLevels[availableLevels.length - 1]?.maxRating}.
                </Text>
            </SurvivalCollapsibleRegion>
          </View>

          <View style={styles.rulesSummary} testID="personal-best-rules-summary">
            <Text style={styles.rulesSummaryTitle}>{challengeTypeLabel(challengeType)} · {levelLabel(selectedBand)}</Text>
            <Text style={styles.rulesSummaryLine}>
              {challengeType === "arrow_duel" ? "Candidate + required reply · " : ""}No time limit · 3 mistakes
            </Text>
            <Text style={styles.rulesSummaryHint}>
              {selectedInProgress
                ? `${selectedInProgress.score} solved · ${selectedInProgress.mistakeCount} of 3 mistakes · paused`
                : selectedBest === null
                  ? "New level — set your first best"
                  : `Best ${selectedBest} at this level`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={selectedInProgress
              ? `Continue ${challengeTypeLabel(challengeType)} Survival at ${levelLabel(selectedBand)}`
              : `Start ${challengeTypeLabel(challengeType)} Survival at ${levelLabel(selectedBand)}`}
            style={[styles.hubStartButton, sourceUnavailable ? styles.hubStartButtonDisabled : null]}
            testID="personal-best-hub-start"
            accessibilityState={{ disabled: sourceUnavailable }}
            disabled={sourceUnavailable}
            onPress={() => selectedInProgress ? onContinue(selectedInProgress.id) : startSelection()}
          >
            <Text style={styles.primaryActionText}>
              {selectedInProgress ? "Continue Survival" : "Start Survival"}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function PersonalBestSourcePicker({
  challengeType,
  presentation,
  selectedSourceId,
  onCancel,
  onSelect
}: {
  challengeType: PersonalBestChallengeType;
  presentation: PersonalBestChallengeDesignPreview;
  selectedSourceId?: string;
  onCancel: () => void;
  onSelect: (source: PersonalBestReferenceRunPresentation) => void;
}): React.JSX.Element {
  const sources = (presentation.referenceRuns ?? []).filter((source) => (
    source.challengeType === challengeType
    && (source.isOnHome !== false || source.id === selectedSourceId)
  ));
  const selectedSourceUnavailable = selectedSourceId !== undefined
    && !sources.some((source) => source.id === selectedSourceId);
  return (
    <View style={styles.sourcePicker} testID="personal-best-source-picker">
      <View style={styles.sourcePickerHeader}>
        <View style={styles.sourcePickerTitleBlock}>
          <Text style={styles.hubSectionTitle}>Choose a Rating source</Text>
          <Text style={styles.sourcePickerIntro}>Only compatible mixed {challengeTypeLabel(challengeType)} Runs appear here.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close Rating source picker"
          style={styles.sourcePickerClose}
          testID="personal-best-source-picker-close"
          onPress={onCancel}
        >
          <Text style={styles.closeButtonText}>×</Text>
        </Pressable>
      </View>
      {selectedSourceUnavailable ? (
        <View
          accessibilityLabel="Saved Rating source unavailable"
          style={[styles.sourceOption, styles.sourceOptionUnavailable]}
          testID="personal-best-source-unavailable"
        >
          <View style={styles.sourceOptionCheck}>
            <Text style={styles.sourceOptionCheckText}>!</Text>
          </View>
          <View style={styles.sourceOptionCopy}>
            <Text style={styles.sourceOptionTitle}>Saved Run unavailable</Text>
            <Text style={styles.sourceOptionDetail}>Choose one of the available Runs below.</Text>
          </View>
        </View>
      ) : null}
      {sources.map((source) => {
        const selected = source.id === selectedSourceId;
        const band = canonicalBandFor(source.rating);
        return (
          <Pressable
            key={source.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            style={[styles.sourceOption, selected ? styles.sourceOptionSelected : null]}
            testID={`personal-best-source-${source.id}`}
            onPress={() => onSelect(source)}
          >
            <View style={styles.sourceOptionCheck}>
              <Text style={styles.sourceOptionCheckText}>{selected ? "✓" : ""}</Text>
            </View>
            <View style={styles.sourceOptionCopy}>
              <Text style={styles.sourceOptionTitle}>{source.name}</Text>
              <Text style={styles.sourceOptionDetail}>
                {source.games === 0 ? "Starting Rating" : `Rating ${source.rating}`} · {levelLabel(band)}
              </Text>
              <Text style={styles.sourceOptionTiming}>{source.durationLabel} · {source.perPuzzleLabel}</Text>
            </View>
          </Pressable>
        );
      })}
      <Text style={styles.sourcePickerFootnote}>
        Focused, themed, and candidate-only Runs are excluded. Your choice is remembered for future {challengeTypeLabel(challengeType)} Survival Runs; paused Runs never change level.
      </Text>
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
        ? `New best, ${score} solved`
        : `${score} solved, ${remaining} more to beat best ${bestScore}`}
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

export function PersonalBestResult({
  activeElapsedMs,
  band,
  bestStreak,
  challengeType,
  endReason = "max_mistakes",
  isNewBest,
  mistakeCount,
  onChangeChallenge,
  onDone,
  onReplayMistakes,
  onTryAgain,
  previousBestScore,
  score,
  sittings
}: {
  activeElapsedMs: number;
  band: PersonalBestRatingBandPresentation;
  bestStreak: number;
  challengeType: PersonalBestChallengeType;
  endReason?: "max_mistakes" | "pool_cleared";
  isNewBest: boolean;
  mistakeCount: number;
  onChangeChallenge: () => void;
  onDone: () => void;
  onReplayMistakes?: () => void;
  onTryAgain: () => void;
  previousBestScore: number | null;
  score: number;
  sittings: number;
}): React.JSX.Element {
  const attemptCount = score + mistakeCount;
  const accuracy = Math.round((score / Math.max(1, attemptCount)) * 100);
  const isPerfectClear = endReason === "pool_cleared";
  const resultTitle = isPerfectClear
    ? `Perfect clear at ${levelLabel(band)}`
    : isNewBest
      ? `New best at ${levelLabel(band)}`
      : "Run complete";
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
        <Text style={styles.resultTopBarTitle}>{challengeTypeLabel(challengeType)} Result</Text>
        <View style={styles.resultDoneButton} />
      </View>

      <View style={[styles.resultHero, isNewBest ? styles.resultHeroBest : null]}>
        <View style={styles.resultBadge}>
          <Text style={styles.resultBadgeText}>
            {isPerfectClear ? "PERFECT CLEAR" : isNewBest ? "NEW BEST" : "COMPLETE"}
          </Text>
        </View>
        <Text style={styles.resultTitle}>{resultTitle}</Text>
        <View style={styles.resultScoreRow}>
          <Text style={styles.resultScore} testID="personal-best-result-score">
            {isPerfectClear ? score.toLocaleString("en-US") : score}
          </Text>
          <Text style={styles.resultScoreLabel}>solved</Text>
        </View>
        <Text style={styles.resultComparison} testID="personal-best-result-comparison">
          {comparison}
        </Text>
        <Text style={styles.resultEndReason}>
          {isPerfectClear ? `All ${score.toLocaleString("en-US")}` : score} solved · {formatElapsed(activeElapsedMs)} active · {sittings} sittings
        </Text>
        {isPerfectClear ? (
          <>
            <Text style={styles.resultEndReason}>
              You cleared every available {challengeTypeLabel(challengeType)} in this level.
            </Text>
            <Text style={styles.resultEndReason}>Loading and selection errors never count as a clear.</Text>
          </>
        ) : (
          <Text style={styles.resultEndReason}>The Run ended normally after {mistakeCount} mistakes.</Text>
        )}
      </View>

      <View style={styles.resultBandCard}>
        <View>
          <Text style={styles.resultBandTitle}>{challengeTypeLabel(challengeType)} · {levelLabel(band)}</Text>
          <Text style={styles.resultBandDetail}>This level keeps its own best</Text>
        </View>
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
        accessibilityLabel="Play the same Survival Run again"
        style={styles.resultSecondaryAction}
        testID="personal-best-result-try-again"
        onPress={onTryAgain}
      >
        <Text style={styles.secondaryActionText}>Play again</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change Survival Run"
        style={styles.resultSecondaryAction}
        testID="personal-best-result-change-challenge"
        onPress={onChangeChallenge}
      >
        <Text style={styles.secondaryActionText}>Change challenge</Text>
      </Pressable>
    </View>
  );
}

export function PersonalBestRecordsScreen({
  onBack,
  presentation
}: {
  onBack: () => void;
  presentation: PersonalBestChallengeDesignPreview;
}): React.JSX.Element {
  const records = presentation.levelRecords ?? [];
  const pausedRuns = presentation.pausedRuns ?? [];
  const [inProgressVisible, setInProgressVisible] = React.useState(true);
  const recordSummary = records.map((record) => {
    const best = survivalBestForLevel(record, pausedRuns);
    return `${challengeTypeLabel(record.challengeType)} ${levelLabel(record)} best ${best.score}${best.inProgress ? ", in progress" : ""}`;
  }).join(", ");
  return (
    <View
      accessibilityLabel={`Survival bests by level. ${pausedRuns.length} Runs in progress. ${recordSummary}. Puzzle and Arrow Duel records are separate. Pausing keeps any best already reached.`}
      style={styles.recordsScreen}
      testID="personal-best-records-screen"
    >
      <View style={styles.guideTopBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Survival Challenge Hub"
          style={styles.closeButton}
          testID="personal-best-records-back"
          onPress={onBack}
        >
          <Text style={styles.recordsBackText}>‹</Text>
        </Pressable>
        <Text style={styles.hubTopBarTitle}>Survival records</Text>
        <View style={styles.closeButtonSpacer} />
      </View>
      <View style={styles.recordsIntro}>
        <Text style={styles.historyEyebrow}>YOUR BESTS</Text>
        <Text style={styles.historyTitle}>Every level stands on its own</Text>
        <Text style={styles.recordsIntroText}>
          Puzzle and Arrow Duel keep separate records. A higher score at an easier level never replaces a best at a harder one.
        </Text>
      </View>
      {pausedRuns.length > 0 ? (
        <View style={styles.historyInProgress} testID="personal-best-records-in-progress">
          <Pressable
            accessibilityLabel={`${inProgressVisible ? "Hide" : "Show"} ${pausedRuns.length} Survival Runs in progress`}
            accessibilityRole="button"
            accessibilityState={{ expanded: inProgressVisible }}
            style={styles.survivalDisclosureHeader}
            testID="personal-best-records-in-progress-toggle"
            onPress={() => setInProgressVisible((visible) => !visible)}
          >
            <View style={styles.hubSectionTitleRow}>
              <Text style={styles.hubSectionTitle}>In progress</Text>
              <Text style={styles.hubSectionCount}>{pausedRuns.length}</Text>
            </View>
            <SurvivalDisclosureChevron
              expanded={inProgressVisible}
              testID="personal-best-records-in-progress-chevron"
            />
          </Pressable>
          <SurvivalCollapsibleRegion
            contentTestID="personal-best-records-in-progress-content"
            expanded={inProgressVisible}
          >
            {pausedRuns.map((run) => (
              <View key={run.id} style={styles.historyPausedRow}>
                <View>
                  <Text style={styles.historyRecordTitle}>{challengeTypeLabel(run.challengeType)} · {levelLabel(run)}</Text>
                  <Text style={styles.historyRecordDetail}>{run.score} solved · {run.mistakeCount} of 3 mistakes</Text>
                </View>
                <Text style={styles.historyPausedStatus}>Paused</Text>
              </View>
            ))}
            <Text style={styles.historyEligibilityNote}>A new high is saved immediately while its Run stays in progress.</Text>
          </SurvivalCollapsibleRegion>
        </View>
      ) : null}
      {(["puzzle", "arrow_duel"] as const).map((type) => {
        const typeRecords = records.filter((record) => record.challengeType === type);
        if (typeRecords.length === 0) {
          return null;
        }
        return (
          <View key={type} style={styles.historyRecordSection} testID={`personal-best-records-${type}`}>
            <View style={styles.historyRecordSectionHeader}>
              <Text style={styles.historyRecordSectionTitle}>{challengeTypeLabel(type)}</Text>
              <Text style={styles.historyRecordSectionHint}>
                {type === "puzzle" ? "Standard recommends a level" : "Arrow Duel recommends a level"}
              </Text>
            </View>
            {typeRecords.map((record) => {
              const best = survivalBestForLevel(record, pausedRuns);
              return (
                <View
                  key={`${type}-${record.minRating}`}
                  style={[styles.historyRecordRow, record.isRecommended ? styles.historyRecordRowRecommended : null]}
                  testID={`personal-best-record-${type}-${record.minRating}`}
                >
                  <View>
                    <Text style={styles.historyRecordTitle}>
                      {levelLabel(record)}{record.isRecommended ? " · Recommended" : ""}
                    </Text>
                    <Text style={styles.historyRecordDetail}>{record.completedRunCount} completed Runs</Text>
                  </View>
                  <View style={styles.historyRecordScoreBlock}>
                    <Text
                      style={styles.historyRecordScore}
                      testID={record.isRecommended && type === "puzzle" ? "personal-best-records-score" : undefined}
                    >
                      {best.score}
                    </Text>
                    <Text style={styles.historyRecordScoreLabel}>
                      {best.inProgress ? "best · in progress" : "best"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
      <View style={styles.historyComparisonNote} testID="personal-best-records-comparison-note">
        <Text style={styles.historyComparisonTitle}>How records compare</Text>
        <Text style={styles.historyComparisonText}>
          A best of 42 at 600–699 never outranks or replaces a best of 19 at 900–999. Puzzle and Arrow Duel also keep separate records.
        </Text>
      </View>
      <Text style={styles.historyFootnote}>
        Pausing keeps any best already reached. Active time and sittings are context only.
      </Text>
    </View>
  );
}

function SurvivalCollapsibleRegion({
  children,
  contentStyle,
  contentTestID,
  expanded
}: {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  contentTestID: string;
  expanded: boolean;
}): React.JSX.Element {
  const progress = React.useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const [contentHeight, setContentHeight] = React.useState(0);

  React.useEffect(() => {
    progress.stopAnimation();
    Animated.timing(progress, {
      duration: SURVIVAL_DISCLOSURE_MOTION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      toValue: expanded ? 1 : 0,
      useNativeDriver: false
    }).start();
  }, [expanded, progress]);

  React.useEffect(() => {
    if (!expanded || contentHeight <= 0) {
      return;
    }
    progress.stopAnimation();
    Animated.timing(progress, {
      duration: SURVIVAL_DISCLOSURE_MOTION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: false
    }).start();
  }, [contentHeight, expanded, progress]);

  const animatedHeight = contentHeight > 0
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, contentHeight] })
    : expanded
      ? undefined
      : 0;
  const shouldMeasureInFlow = expanded && contentHeight === 0;
  const opacity = progress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0.55, 1]
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-4, 0]
  });

  return (
    <Animated.View
      aria-hidden={!expanded}
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
      pointerEvents={expanded ? "auto" : "none"}
      style={[
        styles.survivalDisclosureMotionClip,
        { height: animatedHeight, opacity, transform: [{ translateY }] }
      ]}
      testID={`${contentTestID}-motion`}
    >
      <View
        style={[
          contentStyle,
          shouldMeasureInFlow ? null : styles.survivalDisclosureMotionContent
        ]}
        testID={contentTestID}
        onLayout={(event: LayoutChangeEvent) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height);
          if (nextHeight > 0 && nextHeight !== contentHeight) {
            setContentHeight(nextHeight);
          }
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

function SurvivalDisclosureChevron({
  expanded,
  testID
}: {
  expanded: boolean;
  testID: string;
}): React.JSX.Element {
  const progress = React.useRef(new Animated.Value(expanded ? 1 : 0)).current;

  React.useEffect(() => {
    progress.stopAnimation();
    Animated.timing(progress, {
      duration: SURVIVAL_DISCLOSURE_MOTION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      toValue: expanded ? 1 : 0,
      useNativeDriver: false
    }).start();
  }, [expanded, progress]);

  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"]
  });

  return (
    <Animated.View
      style={[styles.survivalDisclosureChevronMotion, { transform: [{ rotate }] }]}
      testID={testID}
    >
      <Text style={styles.moreLevelsChevron}>⌄</Text>
    </Animated.View>
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
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60);
  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function challengeTypeLabel(challengeType: PersonalBestChallengeType): string {
  return challengeType === "arrow_duel" ? "Arrow Duel" : "Puzzle";
}

function levelLabel(level: { minRating: number; maxRating: number }): string {
  return `${level.minRating}–${level.maxRating}`;
}

function canonicalBandFor(rating: number): { minRating: number; maxRating: number } {
  const minRating = Math.max(0, Math.floor(rating / 100) * 100);
  return { minRating, maxRating: minRating + 99 };
}

function closestAvailableBand(
  availableLevels: readonly PersonalBestAvailableLevelPresentation[],
  requestedBand: PersonalBestAvailableLevelPresentation
): PersonalBestAvailableLevelPresentation {
  return availableLevels.reduce((closest, level) => (
    Math.abs(level.minRating - requestedBand.minRating)
      < Math.abs(closest.minRating - requestedBand.minRating)
      ? level
      : closest
  ), availableLevels[0] ?? requestedBand);
}

function defaultSurvivalLevels(): PersonalBestAvailableLevelPresentation[] {
  return Array.from({ length: 16 }, (_, index) => {
    const minRating = 600 + index * 100;
    return { minRating, maxRating: index === 15 ? 2200 : minRating + 99 };
  });
}

function survivalBestForLevel(
  record: PersonalBestLevelRecordPresentation,
  pausedRuns: readonly PersonalBestPausedRunPresentation[]
): { inProgress: boolean; score: number } {
  const inProgressScore = pausedRuns
    .filter((run) => (
      run.challengeType === record.challengeType
      && run.minRating === record.minRating
      && run.maxRating === record.maxRating
    ))
    .reduce((best, run) => Math.max(best, run.score), -1);
  return {
    inProgress: inProgressScore > record.score,
    score: Math.max(record.score, inProgressScore)
  };
}

function survivalBestScoreForLevel({
  band,
  challengeType,
  fallbackBest,
  pausedRuns,
  records
}: {
  band: PersonalBestAvailableLevelPresentation;
  challengeType: PersonalBestChallengeType;
  fallbackBest: number | null;
  pausedRuns: readonly PersonalBestPausedRunPresentation[];
  records: readonly PersonalBestLevelRecordPresentation[];
}): number | null {
  const recordScore = records.find((record) => (
    record.challengeType === challengeType
    && record.minRating === band.minRating
    && record.maxRating === band.maxRating
  ))?.score ?? fallbackBest;
  return pausedRuns
    .filter((run) => (
      run.challengeType === challengeType
      && run.minRating === band.minRating
      && run.maxRating === band.maxRating
    ))
    .reduce<number | null>((best, run) => Math.max(best ?? -1, run.score), recordScore);
}

function referenceRunFor(
  presentation: PersonalBestChallengeDesignPreview,
  challengeType: PersonalBestChallengeType,
  selectedSourceId?: string
): PersonalBestReferenceRunPresentation | undefined {
  const compatible = (presentation.referenceRuns ?? []).filter((source) => (
    source.challengeType === challengeType
  ));
  if (selectedSourceId !== undefined) {
    return compatible.find((source) => source.id === selectedSourceId);
  }
  return compatible[0];
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
  closeButtonSpacer: {
    height: 44,
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
    flex: 1
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
  historyComparisonNote: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 13
  },
  historyComparisonText: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4
  },
  historyComparisonTitle: {
    color: "#1E3A8A",
    fontSize: 13,
    fontWeight: "800"
  },
  historyEligibilityNote: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8
  },
  historyInProgress: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 12
  },
  historyPausedRow: {
    alignItems: "center",
    borderTopColor: "#E2E8F0",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 9,
    paddingTop: 9
  },
  historyPausedStatus: {
    backgroundColor: "#FEF3C7",
    borderRadius: 999,
    color: "#92400E",
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  historyRecordDetail: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 3
  },
  historyRecordRow: {
    alignItems: "center",
    borderColor: "#E2E8F0",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    padding: 11
  },
  historyRecordRowRecommended: {
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD"
  },
  historyRecordScore: {
    color: "#0F172A",
    fontSize: 22,
    fontWeight: "900"
  },
  historyRecordScoreBlock: {
    alignItems: "flex-end"
  },
  historyRecordScoreLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700"
  },
  historyRecordSection: {
    marginTop: 16
  },
  historyRecordSectionHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  historyRecordSectionHint: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "600"
  },
  historyRecordSectionTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900"
  },
  historyRecordTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "800"
  },
  hubHelpButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  hubHelpButtonText: {
    color: "#334155",
    fontSize: 16,
    fontWeight: "900"
  },
  hubIntro: {
    marginTop: 8
  },
  hubIntroText: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5
  },
  hubScreen: {
    alignSelf: "center",
    maxWidth: 680
  },
  hubSection: {
    marginTop: 18
  },
  hubSectionCount: {
    backgroundColor: "#E2E8F0",
    borderRadius: 999,
    color: "#475569",
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  hubSectionTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900"
  },
  hubSectionTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  hubStartButton: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 14,
    minHeight: 50,
    padding: 13
  },
  hubStartButtonDisabled: {
    opacity: 0.45
  },
  hubTitle: {
    color: "#0F172A",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5
  },
  hubTopBarTitle: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "900"
  },
  levelCard: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    minWidth: 96,
    padding: 11
  },
  levelCardBest: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 6
  },
  levelCardLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800"
  },
  levelCardLabelSelected: {
    color: "#1D4ED8"
  },
  levelCardRange: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 5
  },
  levelCardRangeCompact: {
    fontSize: 14,
    letterSpacing: -0.25,
    lineHeight: 15
  },
  levelCardRangeSelected: {
    color: "#1E3A8A"
  },
  levelCardSelected: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB",
    borderWidth: 2,
    padding: 10
  },
  levelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 9
  },
  moreLevelChip: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  moreLevelChipSelected: {
    backgroundColor: "#DBEAFE",
    borderColor: "#2563EB"
  },
  moreLevelChipText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  moreLevelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 9
  },
  moreLevelsAvailability: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
    width: "100%"
  },
  moreLevelsButton: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    minHeight: 42,
    paddingHorizontal: 8,
    paddingVertical: 7
  },
  moreLevelsChevron: {
    color: "#64748B",
    fontSize: 16
  },
  moreLevelsText: {
    color: "#1D4ED8",
    fontSize: 13,
    fontWeight: "800"
  },
  pausedHomeMeta: {
    alignItems: "flex-end",
    flex: 1,
    gap: 3
  },
  pausedHomeBest: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "900"
  },
  pausedHomeMetaStrong: {
    color: "#991B1B",
    fontSize: 13,
    fontWeight: "800"
  },
  pausedHomeMetaText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600"
  },
  pausedHomeOpenChevron: {
    color: "#1D4ED8",
    fontSize: 24,
    fontWeight: "500",
    lineHeight: 26
  },
  pausedHomeMoreText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700"
  },
  pausedHomeOpenAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  pausedHomeOpenRow: {
    alignItems: "center",
    borderTopColor: "#BFDBFE",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 12
  },
  pausedHomeOpenText: {
    color: "#1D4ED8",
    fontSize: 14,
    fontWeight: "800"
  },
  pausedHomeSummary: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    marginTop: 14
  },
  pausedRunCard: {
    alignItems: "stretch",
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "column",
    gap: 8,
    marginTop: 8,
    padding: 11
  },
  pausedRunContinue: {
    alignSelf: "flex-end",
    backgroundColor: "#2563EB",
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 9
  },
  pausedRunContinueText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800"
  },
  pausedRunCopy: {
    flex: 1
  },
  pausedRunDetail: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 3
  },
  pausedRunMeta: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 3
  },
  pausedRunTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900"
  },
  recordsBackText: {
    color: "#334155",
    fontSize: 34,
    fontWeight: "300",
    lineHeight: 36
  },
  recordsEntry: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  recordsEntryChevron: {
    color: "#64748B",
    fontSize: 26,
    fontWeight: "500"
  },
  recordsEntryCopy: {
    flex: 1
  },
  recordsEntryDetail: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 3
  },
  recordsEntryTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900"
  },
  recordsIntro: {
    marginTop: 8
  },
  recordsIntroText: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6
  },
  recordsScreen: {
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 680,
    padding: 16,
    width: "100%"
  },
  rulesSummary: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 18,
    padding: 13
  },
  rulesSummaryHint: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 6
  },
  rulesSummaryLine: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4
  },
  rulesSummaryTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900"
  },
  sourceCard: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
    marginTop: 9,
    padding: 12
  },
  sourceCardCopy: {
    flex: 1
  },
  sourceChangeButton: {
    paddingHorizontal: 5,
    paddingVertical: 8
  },
  sourceChangeText: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "800"
  },
  sourceHelper: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 7
  },
  sourceLevel: {
    color: "#1E3A8A",
    fontSize: 21,
    fontWeight: "900"
  },
  sourceOption: {
    alignItems: "center",
    borderColor: "#E2E8F0",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 9,
    padding: 11
  },
  sourceOptionCheck: {
    alignItems: "center",
    borderColor: "#93C5FD",
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    justifyContent: "center",
    width: 20
  },
  sourceOptionCheckText: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "900"
  },
  sourceOptionCopy: {
    flex: 1
  },
  sourceOptionDetail: {
    color: "#475569",
    fontSize: 12,
    marginTop: 3
  },
  sourceOptionSelected: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB"
  },
  sourceOptionUnavailable: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5"
  },
  sourceOptionTiming: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 2
  },
  sourceOptionTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900"
  },
  sourcePicker: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    padding: 13
  },
  sourcePickerClose: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36
  },
  sourcePickerFootnote: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 11
  },
  sourcePickerHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sourcePickerIntro: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3
  },
  sourcePickerTitleBlock: {
    flex: 1
  },
  sourceTiming: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 3
  },
  sourceTitle: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3
  },
  survivalDisclosureChevronMotion: {
    alignItems: "center",
    height: 24,
    justifyContent: "center",
    width: 24
  },
  survivalDisclosureHeader: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 40,
    paddingHorizontal: 4
  },
  survivalDisclosureMotionClip: {
    overflow: "hidden",
    width: "100%"
  },
  survivalDisclosureMotionContent: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  typeOption: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 11
  },
  typeOptionDetail: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 3
  },
  typeOptionDetailSelected: {
    color: "#1D4ED8"
  },
  typeOptionSelected: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB"
  },
  typeOptionText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "900"
  },
  typeOptionTextSelected: {
    color: "#1E3A8A"
  },
  typeSelector: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16
  }
});
