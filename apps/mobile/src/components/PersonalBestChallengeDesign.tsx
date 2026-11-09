import React from "react";
import {
  Animated,
  Easing,
  Pressable,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { makeStyles } from "../theme/index.ts";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import type { SprintState } from "../../../../packages/core/src/types.ts";
import { ResultReviewImpactCard } from "./ResultReviewImpactCard.tsx";
import { ResultTrophyGlyph } from "./ResultTrophyGlyph.tsx";
import { AppText, Badge, Button, Icon, IconTile, ListRow, Section, useListRowStyle } from "./ui/index.tsx";
import { useTheme } from "../theme/ThemeProvider.ts";

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
  opponentReplyEnabled?: boolean;
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
  opponentReplyEnabled?: boolean;
  phaseLabel?: string;
  resumeState?: SprintState;
  score: number;
  sittings: number;
};

export type PersonalBestLevelRecordPresentation = {
  challengeType: PersonalBestChallengeType;
  maxRating: number;
  minRating: number;
  score: number;
};

export type PersonalBestChallengeDesignPreview = {
  activeRecordMode?: boolean;
  availableLevels?: readonly PersonalBestAvailableLevelPresentation[];
  band: PersonalBestRatingBandPresentation;
  bestScore: number | null;
  challengeType?: PersonalBestChallengeType;
  completedRunCount: number;
  exitConfirmationInitiallyVisible?: boolean;
  homeGuideOnFirstEntry?: boolean;
  hubInitiallyVisible?: boolean;
  levelRecords?: readonly PersonalBestLevelRecordPresentation[];
  moreLevelsInitiallyVisible?: boolean;
  opponentReplyEnabled?: boolean;
  pausedRuns?: readonly PersonalBestPausedRunPresentation[];
  referenceRuns?: readonly PersonalBestReferenceRunPresentation[];
  selectedReferenceRunIds?: Partial<Record<PersonalBestChallengeType, string>>;
  showActivePresentation?: boolean;
  recordsInitiallyVisible?: boolean;
  recordsState?: "empty" | "populated";
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
  onOpenHub
}: {
  presentation: PersonalBestChallengeDesignPreview;
  onOpenHub: (run?: PersonalBestPausedRunPresentation) => void;
}): React.JSX.Element {
  const latestPaused = presentation.pausedRuns?.[0];
  return (
    <Section rows>
      <ListRow
        accessibilityHint="Opens Survival setup"
        accessibilityLabel="Open Survival Challenge. See how far you can go, at your own pace."
        icon="survival"
        subtitle="See how far you can go, at your own pace."
        testID="personal-best-home-card"
        title="Survival Challenge"
        onPress={() => onOpenHub(latestPaused)}
      />
    </Section>
  );
}

export function PersonalBestGuide({
  backAccessibilityLabel = "Back from Survival guide",
  presentation,
  onAcknowledge,
  onClose
}: {
  backAccessibilityLabel?: string;
  presentation: PersonalBestChallengeDesignPreview;
  onAcknowledge: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const rowStyle = useListRowStyle();
  const challengeType = presentation.challengeType ?? "puzzle";
  const typeLabel = challengeTypeLabel(challengeType);
  const opponentReplyEnabled = presentation.opponentReplyEnabled !== false;
  const rules = [
    {
      marker: "1",
      title: "One level for the whole Run",
      detail: `${typeLabel} stays at ${presentation.band.minRating}–${presentation.band.maxRating}. Records from other levels and challenge types are never compared.`
    },
    {
      marker: "×3",
      title: challengeType === "arrow_duel"
        ? opponentReplyEnabled
          ? "Candidate and reply make one puzzle"
          : "Choose the better arrow"
        : "Three mistakes end the Run",
      detail: challengeType === "arrow_duel"
        ? opponentReplyEnabled
          ? "Choose the candidate, then play the required opponent reply. A wrong candidate or reply adds one mistake, never two."
          : "Choose the better arrow. A wrong choice adds one mistake and enters Review. A correct choice completes the puzzle. Turn on opponent replies in Settings to add the reply step to new Survival Runs. Other Arrow Duel Runs return to their saved choice; paused sessions keep the rule they started with."
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
      <SurvivalTopBar
        backAccessibilityLabel={backAccessibilityLabel}
        backTestID="personal-best-guide-close"
        title="Survival"
        onBack={onClose}
      />

      <View style={styles.guideHero}>
        <AppText accessibilityRole="header" style={styles.centeredText} variant="largeTitle">
          How far can you go?
        </AppText>
        <AppText style={styles.centeredText} tone="secondary" variant="body">
          Solve as many as you can at one fixed level.
        </AppText>
        <View style={styles.guideBandRow}>
          <AppText tone="accent" variant="headline">{typeLabel} · {levelLabel(presentation.band)}</AppText>
          <AppText tone="secondary" variant="subheadline">
            {presentation.bestScore === null ? "Set your first best" : `Best ${presentation.bestScore}`}
          </AppText>
        </View>
      </View>

      <Section rows>
        {rules.map((rule) => (
          <View key={rule.title} style={rowStyle}>
            <View style={styles.ruleMarker}>
              <AppText numberOfLines={1} style={styles.ruleMarkerText} tone="accent" variant="caption">
                {rule.marker}
              </AppText>
            </View>
            <View style={styles.rowCopy}>
              <AppText variant="headline">{rule.title}</AppText>
              <AppText tone="secondary" variant="subheadline">{rule.detail}</AppText>
            </View>
          </View>
        ))}
      </Section>

      <Section rows>
        <View style={rowStyle}>
          <AppText style={styles.rowCopy} tone="secondary" variant="body">
            Best at {levelLabel(presentation.band)}
          </AppText>
          <AppText testID="personal-best-guide-score" variant="numeral">
            {presentation.bestScore ?? "—"}
          </AppText>
        </View>
      </Section>
      <Button
        accessibilityLabel="Acknowledge Survival rules"
        label="Got it"
        stretch
        testID="personal-best-guide-start"
        onPress={onAcknowledge}
      />
    </View>
  );
}

export function PersonalBestChallengeHub({
  initialSelection,
  presentation,
  sourcePickerVisible,
  onClose,
  onCloseRecords,
  onContinue,
  onHowItWorks,
  onOpenRecords,
  onSourcePickerVisibilityChange,
  recordsVisible,
  onStart
}: {
  initialSelection?: PersonalBestChallengeSelection | null;
  presentation: PersonalBestChallengeDesignPreview;
  sourcePickerVisible: boolean;
  onClose: () => void;
  onCloseRecords: () => void;
  onContinue: (runId: string) => void;
  onHowItWorks: (selection: PersonalBestChallengeSelection) => void;
  onOpenRecords: () => void;
  onSourcePickerVisibilityChange: (visible: boolean) => void;
  recordsVisible: boolean;
  onStart: (selection: PersonalBestChallengeSelection) => void;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const rowStyle = useListRowStyle();
  const { fontScale, width: viewportWidth } = useWindowDimensions();
  // Level cards widen with Dynamic Type so labels such as "Recommended" wrap
  // the grid onto more rows instead of breaking mid-word.
  const levelCardMinWidth = { minWidth: Math.round(96 * Math.max(1, fontScale)) };
  const initialType = initialSelection?.challengeType ?? presentation.challengeType ?? "puzzle";
  const [challengeType, setChallengeType] = React.useState<PersonalBestChallengeType>(initialType);
  const pausedRuns = presentation.pausedRuns ?? [];
  const [selectedSourceIds, setSelectedSourceIds] = React.useState<Partial<Record<PersonalBestChallengeType, string>>>(
    () => ({
      ...presentation.selectedReferenceRunIds,
      ...(initialSelection ? { [initialSelection.challengeType]: initialSelection.sourceId } : {})
    })
  );
  const initialSource = referenceRunFor(
    presentation,
    initialType,
    presentation.selectedReferenceRunIds?.[initialType]
  );
  const availableLevels = presentation.availableLevels?.length
    ? [...presentation.availableLevels].sort((left, right) => left.minRating - right.minRating)
    : defaultSurvivalLevels();
  const requestedInitialBand = initialSelection?.challengeType === initialType
    ? initialSelection.band
    : initialSource
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
  const selectedOpponentReplyEnabled = selectedInProgress?.opponentReplyEnabled
    ?? presentation.opponentReplyEnabled
    ?? true;
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
    onSourcePickerVisibilityChange(false);
  }

  function selectedChallenge(): PersonalBestChallengeSelection | null {
    if (!source) {
      onSourcePickerVisibilityChange(true);
      return null;
    }
    return {
      band: selectedBand,
      bestScore: selectedBest,
      challengeType,
      opponentReplyEnabled: selectedOpponentReplyEnabled,
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
      style={styles.hubScreen}
      testID="personal-best-hub"
    >
      <SurvivalTopBar
        backAccessibilityLabel="Back to Practice"
        backTestID="personal-best-hub-close"
        title="Survival"
        trailing={(
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="How Survival works"
            hitSlop={4}
            style={({ pressed }) => [styles.topBarButton, pressed ? styles.pressed : null]}
            testID="personal-best-hub-help"
            onPress={showGuide}
          >
            <Icon color={theme.colors.accent.s600} name="help" size={22} weight="semibold" />
          </Pressable>
        )}
        onBack={onClose}
      />

      <View style={styles.hubIntro}>
        <AppText accessibilityRole="header" variant="largeTitle">Choose your Survival Run</AppText>
        <AppText tone="secondary" variant="subheadline">
          Stay at one level. Solve as many as you can before your third mistake.
        </AppText>
      </View>

      <Section rows>
        <ListRow
          accessibilityLabel="Open Survival records. Puzzle and Arrow Duel bests by level."
          subtitle="Puzzle and Arrow Duel bests by level"
          testID="personal-best-hub-records"
          title="Survival records"
          onPress={onOpenRecords}
        />
      </Section>

      <View accessibilityRole="tablist" style={styles.typeSelector} testID="personal-best-type-selector">
        {(["puzzle", "arrow_duel"] as const).map((type) => {
          const selected = type === challengeType;
          return (
            <Pressable
              key={type}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.typeOption,
                selected ? styles.selectedFill : null,
                pressed && !selected ? styles.pressed : null
              ]}
              testID={`personal-best-type-${type}`}
              onPress={() => chooseChallengeType(type)}
            >
              <AppText style={styles.centeredText} tone={selected ? "accent" : "primary"} variant="headline">
                {challengeTypeLabel(type)}
              </AppText>
              <AppText style={styles.centeredText} tone="secondary" variant="footnote">
                {type === "puzzle" ? "Play the best line" : "Candidate + reply"}
              </AppText>
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
              <AppText accessibilityRole="header" variant="title">In progress</AppText>
              <Badge label={String(inProgress.length)} tone="neutral" />
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
            <Section rows>
              {inProgress.map((run) => (
                <View key={run.id} style={[rowStyle, styles.pausedRunRow]} testID={`personal-best-paused-${run.id}`}>
                  <View style={styles.rowCopy}>
                    <AppText variant="headline">{challengeTypeLabel(run.challengeType)} · {levelLabel(run)}</AppText>
                    <AppText tone="secondary" variant="subheadline">
                      {run.score} solved · {run.mistakeCount} of 3 mistakes · {run.phaseLabel ?? "Puzzle saved"}
                    </AppText>
                    <AppText tone="secondary" variant="footnote">
                      {formatElapsed(run.activeElapsedMs)} active · {run.sittings} sittings · {run.lastTouchedLabel}
                    </AppText>
                  </View>
                  <Button
                    accessibilityLabel={`Continue ${challengeTypeLabel(run.challengeType)} ${levelLabel(run)}`}
                    label="Continue"
                    size="compact"
                    style={styles.pausedRunContinue}
                    testID={`personal-best-paused-continue-${run.id}`}
                    onPress={() => onContinue(run.id)}
                  />
                </View>
              ))}
            </Section>
          </SurvivalCollapsibleRegion>
        </View>
      ) : null}

      {sourcePickerVisible ? (
        <PersonalBestSourcePicker
          challengeType={challengeType}
          presentation={presentation}
          selectedSourceId={selectedSourceId}
          onCancel={() => onSourcePickerVisibilityChange(false)}
          onSelect={chooseSource}
        />
      ) : (
        <>
          <Section
            footer={sourceUnavailable
              ? "Your saved choice is preserved until you replace it."
              : sourceAboveAvailableLevels
              ? "This is the highest level in your installed Core Pack. Survival has no time limit."
              : source?.isOnHome === false
                ? `${source.name} remains your Rating source even when hidden from Home.`
                : "This only changes the suggested level. Survival has no time limit."}
            header={sourceUnavailable
              ? "Rating source unavailable"
              : sourceAboveAvailableLevels
              ? "Highest available level"
              : source?.games === 0
                ? "Starting level"
                : "Recommended level"}
            rows
          >
            <View style={rowStyle} testID="personal-best-reference-source">
              <View style={styles.rowCopy}>
                {sourceUnavailable ? (
                  <>
                    <AppText testID="personal-best-source-unavailable-message" variant="headline">
                      Your saved Rating source is no longer available.
                    </AppText>
                    <AppText tone="secondary" variant="subheadline">Choose a replacement before starting Survival.</AppText>
                  </>
                ) : (
                  <>
                    <AppText testID="personal-best-recommended-level" variant="numeral">
                      {levelLabel(recommendedBand)}
                    </AppText>
                    <AppText variant="subheadline">
                      {source?.games === 0
                        ? `Based on ${source.name}’s starting Rating`
                        : `Based on ${source?.name ?? "default Run"} · Rating ${source?.rating ?? presentation.band.currentRating}`}
                    </AppText>
                    {source ? (
                      <AppText tone="secondary" variant="footnote">{source.durationLabel} · {source.perPuzzleLabel}</AppText>
                    ) : null}
                  </>
                )}
              </View>
              {hasAlternativeSource || sourceUnavailable ? (
                <Button
                  accessibilityLabel={`Use another ${challengeTypeLabel(challengeType)} Run`}
                  label="Use another Run"
                  size="compact"
                  testID="personal-best-use-another-run"
                  variant="plain"
                  onPress={() => onSourcePickerVisibilityChange(true)}
                />
              ) : null}
            </View>
          </Section>

          <View style={styles.hubSection}>
            <AppText accessibilityRole="header" style={styles.sectionTitle} variant="title">Choose your level</AppText>
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
                    style={({ pressed }) => [
                      styles.levelCard,
                      levelCardMinWidth,
                      selected ? styles.selectedFill : null,
                      pressed && !selected ? styles.pressed : null
                    ]}
                    testID={`personal-best-level-${level.minRating}`}
                    onPress={() => setSelectedBand({ minRating: level.minRating, maxRating: level.maxRating })}
                  >
                    <AppText tone={selected ? "accent" : "secondary"} variant="footnote">
                      {level.label}
                    </AppText>
                    <AppText
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                      numberOfLines={compactFourDigitLevelRanges && level.minRating >= 1000 ? 2 : 1}
                      tone={selected ? "accent" : "primary"}
                      variant="numeralRow"
                    >
                      {compactFourDigitLevelRanges && level.minRating >= 1000
                        ? `${level.minRating}–\n${level.maxRating}`
                        : levelLabel(level)}
                    </AppText>
                    <AppText tone="secondary" variant="footnote">
                      {best === null ? "No best yet" : `Best ${best}`}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: moreLevelsVisible }}
              style={({ pressed }) => [styles.moreLevelsButton, pressed ? styles.pressedText : null]}
              testID="personal-best-more-levels"
              onPress={() => setMoreLevelsVisible((visible) => !visible)}
            >
              <AppText tone="accent" variant="body">{moreLevelsVisible ? "Hide more levels" : "More levels"}</AppText>
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
                {otherLevels.map((level) => {
                  const selected = selectedBand.minRating === level.minRating;
                  return (
                    <Pressable
                      key={level.minRating}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={({ pressed }) => [
                        styles.moreLevelChip,
                        selected ? styles.selectedFill : null,
                        pressed && !selected ? styles.pressed : null
                      ]}
                      onPress={() => setSelectedBand(level)}
                    >
                      <AppText tone={selected ? "accent" : "primary"} variant="numeralRow">{levelLabel(level)}</AppText>
                    </Pressable>
                  );
                })}
                <AppText style={styles.fullWidth} testID="personal-best-level-availability" tone="secondary" variant="footnote">
                  Showing every Survival level in this Core Pack: {availableLevels[0]?.minRating}–{availableLevels[availableLevels.length - 1]?.maxRating}.
                </AppText>
            </SurvivalCollapsibleRegion>
          </View>

          <Section rows>
            <View style={rowStyle} testID="personal-best-rules-summary">
              <View style={styles.rowCopy}>
                <AppText variant="headline">{challengeTypeLabel(challengeType)} · {levelLabel(selectedBand)}</AppText>
                <AppText tone="secondary" variant="subheadline">
                  {challengeType === "arrow_duel"
                    ? !selectedOpponentReplyEnabled
                      ? "Choose the better arrow · "
                      : "Candidate + required reply · "
                    : ""}No time limit · 3 mistakes
                </AppText>
                <AppText tone="accent" variant="subheadline">
                  {selectedInProgress
                    ? `${selectedInProgress.score} solved · ${selectedInProgress.mistakeCount} of 3 mistakes · paused`
                    : selectedBest === null
                      ? "No best yet · solve 1 to set it"
                      : `Best ${selectedBest} at this level`}
                </AppText>
              </View>
            </View>
          </Section>
          <Button
            accessibilityLabel={selectedInProgress
              ? `Continue ${challengeTypeLabel(challengeType)} Survival at ${levelLabel(selectedBand)}`
              : `Start ${challengeTypeLabel(challengeType)} Survival at ${levelLabel(selectedBand)}`}
            disabled={sourceUnavailable}
            label={selectedInProgress ? "Continue Survival" : "Start Survival"}
            stretch
            testID="personal-best-hub-start"
            onPress={() => selectedInProgress ? onContinue(selectedInProgress.id) : startSelection()}
          />
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
  const styles = useStyles();
  const theme = useTheme();
  const rowStyle = useListRowStyle();
  const sources = (presentation.referenceRuns ?? []).filter((source) => (
    source.challengeType === challengeType
    && (source.isOnHome !== false || source.id === selectedSourceId)
  ));
  const selectedSourceUnavailable = selectedSourceId !== undefined
    && !sources.some((source) => source.id === selectedSourceId);
  return (
    <Section
      footer={`Focused, themed, and candidate-only Runs are excluded. Your choice is remembered for future ${challengeTypeLabel(challengeType)} Survival Runs; paused Runs never change level.`}
      header="Choose a Rating source"
      headerAccessory={(
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close Rating source picker"
          hitSlop={4}
          style={({ pressed }) => [styles.topBarButton, pressed ? styles.pressed : null]}
          testID="personal-best-source-picker-close"
          onPress={onCancel}
        >
          <Icon color={theme.colors.text.tertiary} name="close" size={18} weight="semibold" />
        </Pressable>
      )}
      rows
      style={styles.hubSection}
      testID="personal-best-source-picker"
    >
      <View style={rowStyle}>
        <AppText style={styles.rowCopy} tone="secondary" variant="subheadline">
          Only compatible mixed {challengeTypeLabel(challengeType)} Runs appear here.
        </AppText>
      </View>
      {selectedSourceUnavailable ? (
        <View
          accessibilityLabel="Saved Rating source unavailable"
          style={rowStyle}
          testID="personal-best-source-unavailable"
        >
          <IconTile name="warning" tone="negative" />
          <View style={styles.rowCopy}>
            <AppText variant="headline">Saved Run unavailable</AppText>
            <AppText tone="secondary" variant="subheadline">Choose one of the available Runs below.</AppText>
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
            style={({ pressed }) => [rowStyle, selected ? styles.selectedFill : null, pressed ? styles.pressed : null]}
            testID={`personal-best-source-${source.id}`}
            onPress={() => onSelect(source)}
          >
            <View style={styles.rowCopy}>
              <AppText variant="headline">{source.name}</AppText>
              <AppText tone="secondary" variant="subheadline">
                {source.games === 0 ? "Starting Rating" : `Rating ${source.rating}`} · {levelLabel(band)}
              </AppText>
              <AppText tone="secondary" variant="footnote">{source.durationLabel} · {source.perPuzzleLabel}</AppText>
            </View>
            {selected ? <Icon color={theme.colors.accent.s600} name="check" size={18} weight="semibold" /> : null}
          </Pressable>
        );
      })}
    </Section>
  );
}

export function PersonalBestProgressBanner({
  bestScore,
  compact = false,
  recordMode = false,
  score
}: {
  bestScore: number | null;
  compact?: boolean;
  recordMode?: boolean;
  score: number;
}): React.JSX.Element {
  const styles = useStyles();
  const target = bestScore === null ? 1 : bestScore + 1;
  const isNewBest = score >= target;
  const showsRecordMilestone = isNewBest && recordMode;
  const remaining = Math.max(0, target - score);
  const progress = isNewBest ? 1 : Math.max(0.06, score / Math.max(1, target));
  const title = isNewBest
    ? `New best · ${score}`
    : bestScore === null
    ? `${remaining} more to set your first best`
    : `${remaining} more to beat ${bestScore}`;
  const recordContext = bestScore === null
    ? "First score at this level"
    : `Previous best ${bestScore}`;
  const visibleRecordContext = bestScore === null ? "First score" : recordContext;
  return (
    <View
      accessibilityLabel={showsRecordMilestone
        ? `New best, ${score} solved. ${recordContext}.`
        : isNewBest
        ? `New best, ${score} solved`
        : bestScore === null
        ? `${score} solved, ${remaining} more to set your first best`
        : `${score} solved, ${remaining} more to beat best ${bestScore}`}
      style={[
        styles.progressBanner,
        compact ? styles.progressBannerCompact : null
      ]}
      testID="personal-best-progress"
    >
      {showsRecordMilestone ? (
        <View style={styles.recordMilestoneRow}>
          <Badge label={`NEW BEST ${score.toLocaleString("en-US")}`} testID="personal-best-record-badge" tone="accent" />
          <AppText
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            numberOfLines={1}
            style={styles.recordPreviousBest}
            testID="personal-best-record-previous"
            tone="secondary"
            variant="footnote"
          >
            {visibleRecordContext}
          </AppText>
        </View>
      ) : (
        <View style={styles.progressCopyAndTrack}>
          <View style={styles.progressCopyRow}>
            <AppText style={styles.rowCopy} testID="personal-best-progress-title" variant="subheadline">{title}</AppText>
            <AppText tone="secondary" variant="footnote">{score} solved</AppText>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(progress * 100)}%` }
              ]}
              testID="personal-best-progress-fill"
            />
          </View>
        </View>
      )}
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
  onDone: () => void;
  onReplayMistakes?: () => void;
  onTryAgain: () => void;
  previousBestScore: number | null;
  score: number;
  sittings: number;
}): React.JSX.Element {
  const styles = useStyles();
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
          accessibilityLabel="Back to Practice"
          style={styles.resultDoneButton}
          testID="personal-best-result-back"
          onPress={onDone}
        >
          <Text style={styles.recordsBackText}>‹</Text>
        </Pressable>
        <Text style={styles.resultTopBarTitle}>{challengeTypeLabel(challengeType)} Result</Text>
        <View style={styles.resultDoneButton} />
      </View>

      <View
        style={[styles.resultHero, isNewBest ? styles.resultHeroBest : null]}
        testID="personal-best-result-hero"
      >
        <View
          style={[styles.resultBadge, isNewBest ? styles.resultBadgeBest : null]}
          testID="personal-best-result-badge"
        >
          {isNewBest ? (
            <ResultTrophyGlyph size={14} testID="personal-best-result-trophy" />
          ) : null}
          <Text
            style={[styles.resultBadgeText, isNewBest ? styles.resultBadgeTextBest : null]}
            testID="personal-best-result-badge-text"
          >
            {isPerfectClear ? "PERFECT CLEAR" : isNewBest ? "NEW BEST" : "COMPLETE"}
          </Text>
        </View>
        <Text style={styles.resultTitle}>{resultTitle}</Text>
        <View style={styles.resultScoreRow}>
          <Text
            style={[styles.resultScore, isNewBest ? styles.resultScoreBest : null]}
            testID="personal-best-result-score"
          >
            {isPerfectClear ? score.toLocaleString("en-US") : score}
          </Text>
          <Text style={styles.resultScoreLabel}>solved</Text>
        </View>
        <Text
          style={[styles.resultComparison, isNewBest ? styles.resultComparisonBest : null]}
          testID="personal-best-result-comparison"
        >
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

      <ResultReviewImpactCard
        count={mistakeCount}
        countTestID="personal-best-result-review-count"
        detail={`${mistakeCount} mistakes · Included in replay`}
        detailTestID="personal-best-result-review-detail"
        style={styles.resultReviewCard}
        testID="personal-best-result-review"
      />

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
        accessibilityLabel="Done"
        style={styles.resultSecondaryAction}
        testID="personal-best-result-done"
        onPress={onDone}
      >
        <Text style={styles.secondaryActionText}>Done</Text>
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
  const styles = useStyles();
  const { width: viewportWidth } = useWindowDimensions();
  // Two columns in portrait, four at landscape or regular width.
  const usesWideRecordGrid = viewportWidth >= 700;
  const records = presentation.levelRecords ?? [];
  const pausedRuns = presentation.pausedRuns ?? [];
  const recordsAreEmpty = presentation.recordsState === "empty";
  const recordSummary = records.map((record) => {
    const best = survivalBestForLevel(record, pausedRuns);
    return `${challengeTypeLabel(record.challengeType)} ${levelLabel(record)} best ${best}`;
  }).join(", ");
  return (
    <View
      accessibilityLabel={recordsAreEmpty
        ? "Survival records. No bests yet. Solve one puzzle in Survival to set your first best. Puzzle and Arrow Duel bests are separate by level."
        : `Survival bests by level. ${recordSummary}. Puzzle and Arrow Duel records are separate.`}
      style={styles.recordsScreen}
      testID="personal-best-records-screen"
    >
      <SurvivalTopBar
        backAccessibilityLabel="Back to Survival Challenge Hub"
        backTestID="personal-best-records-back"
        title="Survival records"
        onBack={onBack}
      />
      <View
        style={styles.hubIntro}
        testID={recordsAreEmpty ? "personal-best-records-empty" : undefined}
      >
        <AppText tone="accent" variant="footnote">YOUR BESTS</AppText>
        <AppText accessibilityRole="header" variant="largeTitle">
          {recordsAreEmpty ? "No Survival bests yet" : "Every level stands on its own"}
        </AppText>
        <AppText tone="secondary" variant="subheadline">
          {recordsAreEmpty
            ? "Solve one puzzle in Survival to set your first best. Puzzle and Arrow Duel keep separate bests at each level."
            : "Puzzle and Arrow Duel keep separate records. A higher score at an easier level never replaces a best at a harder one."}
        </AppText>
      </View>
      {recordsAreEmpty ? null : (["puzzle", "arrow_duel"] as const).map((type) => {
        const typeRecords = records.filter((record) => record.challengeType === type);
        if (typeRecords.length === 0) {
          return null;
        }
        return (
          <View key={type} style={styles.hubSection} testID={`personal-best-records-${type}`}>
            <AppText accessibilityRole="header" style={styles.sectionTitle} variant="title">{challengeTypeLabel(type)}</AppText>
            <View style={styles.recordGrid}>
              {typeRecords.map((record) => {
                const best = survivalBestForLevel(record, pausedRuns);
                return (
                  <View
                    key={`${type}-${record.minRating}`}
                    accessibilityLabel={`${challengeTypeLabel(type)} ${levelLabel(record)}, best ${best}`}
                    accessible
                    style={[styles.recordCard, usesWideRecordGrid ? styles.recordCardWide : null]}
                    testID={`personal-best-record-${type}-${record.minRating}`}
                  >
                    <AppText variant="numeralRow">{levelLabel(record)}</AppText>
                    <View style={styles.recordBestRow}>
                      <AppText tone="secondary" variant="footnote">Best</AppText>
                      <AppText variant="numeral">{best}</AppText>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// Back chevron, centered title and an optional trailing control, matching the
// other direction A sub-screens (#609).
function SurvivalTopBar({
  backAccessibilityLabel,
  backTestID,
  onBack,
  title,
  trailing
}: {
  backAccessibilityLabel: string;
  backTestID: string;
  onBack: () => void;
  title: string;
  trailing?: React.ReactNode;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backAccessibilityLabel}
        hitSlop={4}
        style={({ pressed }) => [styles.topBarButton, pressed ? styles.pressed : null]}
        testID={backTestID}
        onPress={onBack}
      >
        <Icon color={theme.colors.accent.s600} name="chevronLeft" size={20} weight="semibold" />
      </Pressable>
      <AppText numberOfLines={1} style={styles.topBarTitle} variant="headline">{title}</AppText>
      {trailing ?? <View style={styles.topBarButton} />}
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
  const styles = useStyles();
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
  const styles = useStyles();
  const theme = useTheme();
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
      <Icon color={theme.colors.text.tertiary} name="chevronDown" size={15} weight="semibold" />
    </Animated.View>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }): React.JSX.Element {
  const styles = useStyles();
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
): number {
  const inProgressScore = pausedRuns
    .filter((run) => (
      run.challengeType === record.challengeType
      && run.minRating === record.minRating
      && run.maxRating === record.maxRating
    ))
    .reduce((best, run) => Math.max(best, run.score), -1);
  return Math.max(record.score, inProgressScore);
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
  const recordScore = displayableSurvivalBestScore(records.find((record) => (
    record.challengeType === challengeType
    && record.minRating === band.minRating
    && record.maxRating === band.maxRating
  ))?.score ?? fallbackBest);
  return pausedRuns
    .filter((run) => (
      run.challengeType === challengeType
      && run.minRating === band.minRating
      && run.maxRating === band.maxRating
    ))
    .reduce<number | null>((best, run) => {
      const runScore = displayableSurvivalBestScore(run.score);
      return runScore === null ? best : Math.max(best ?? -1, runScore);
    }, recordScore);
}

function displayableSurvivalBestScore(score: number | null | undefined): number | null {
  return score !== null && score !== undefined && score >= 1 ? score : null;
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

const useStyles = makeStyles((theme) => ({
  centeredText: {
    textAlign: "center"
  },
  fullWidth: {
    width: "100%"
  },
  guideBandRow: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s100,
    borderRadius: theme.shape.capsule,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.inline,
    justifyContent: "center",
    marginTop: theme.spacing.inline,
    paddingHorizontal: 14,
    paddingVertical: 6
  },
  guideHero: {
    alignItems: "center",
    gap: theme.spacing.inline
  },
  guideScreen: {
    alignSelf: "center",
    gap: theme.spacing.section,
    maxWidth: 620,
    width: "100%"
  },
  hubIntro: {
    gap: theme.spacing.inline
  },
  // Fill the container (not the window) up to 680 pt so Split View and
  // other insets never clip the page.
  hubScreen: {
    alignSelf: "center",
    gap: theme.spacing.section,
    maxWidth: 680,
    width: "100%"
  },
  hubSection: {
    gap: theme.spacing.group
  },
  hubSectionTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline
  },
  levelCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.control,
    flex: 1,
    gap: 2,
    minWidth: 96,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  levelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.group
  },
  moreLevelChip: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.capsule,
    justifyContent: "center",
    minHeight: theme.metrics.minTarget,
    paddingHorizontal: 14
  },
  moreLevelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.inline,
    paddingBottom: theme.spacing.inline
  },
  moreLevelsButton: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: theme.metrics.minTarget,
    paddingHorizontal: 4
  },
  pausedRunContinue: {
    alignSelf: "flex-end"
  },
  pausedRunRow: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: theme.spacing.inline,
    paddingVertical: 12
  },
  pressed: {
    backgroundColor: theme.colors.surfaceStrong
  },
  pressedText: {
    opacity: 0.6
  },
  primaryActionText: {
    color: theme.colors.text.onAccent,
    fontSize: 14,
    fontWeight: "800"
  },
  progressBanner: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.control,
    gap: theme.spacing.inline,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: "100%"
  },
  progressBannerCompact: {
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  progressCopyAndTrack: {
    gap: theme.spacing.inline
  },
  progressCopyRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline,
    justifyContent: "space-between"
  },
  progressFill: {
    backgroundColor: theme.colors.accent.fill,
    borderRadius: theme.shape.capsule,
    height: "100%"
  },
  progressTrack: {
    backgroundColor: theme.colors.fillMuted,
    borderRadius: theme.shape.capsule,
    height: 6,
    overflow: "hidden"
  },
  recordBestRow: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  recordCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.control,
    gap: 2,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: "48.5%"
  },
  recordCardWide: {
    width: "24%"
  },
  recordGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.group
  },
  recordMilestoneRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline,
    justifyContent: "space-between"
  },
  recordPreviousBest: {
    flexShrink: 1
  },
  recordsBackText: {
    color: theme.colors.text.strong,
    fontSize: 34,
    fontWeight: "300",
    lineHeight: 36
  },
  // Fill the container (not the window) up to 680 pt so Split View and
  // other insets never clip the page.
  recordsScreen: {
    alignSelf: "center",
    gap: theme.spacing.section,
    maxWidth: 680,
    width: "100%"
  },
  resultBadge: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5
  },
  resultBadgeBest: {
    backgroundColor: theme.colors.accent.s100
  },
  resultBadgeText: {
    color: theme.colors.text.secondary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8
  },
  resultBadgeTextBest: {
    color: theme.colors.accent.s700
  },
  resultBandCard: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.default,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    padding: 13
  },
  resultBandDetail: {
    color: theme.colors.text.tertiary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3
  },
  resultBandTitle: {
    color: theme.colors.text.primary,
    fontSize: 14,
    fontWeight: "800"
  },
  resultComparison: {
    color: theme.colors.text.tertiary,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4
  },
  resultComparisonBest: {
    color: theme.colors.accent.s700
  },
  resultDoneButton: {
    alignItems: "flex-start",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 52
  },
  resultEndReason: {
    color: theme.colors.text.tertiary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8
  },
  resultHero: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 8,
    padding: 20
  },
  resultHeroBest: {
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s300
  },
  resultMetric: {
    alignItems: "center",
    flex: 1,
    gap: 3
  },
  resultMetricLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
    fontWeight: "700"
  },
  resultMetricValue: {
    color: theme.colors.text.primary,
    fontSize: 20,
    fontWeight: "900"
  },
  resultMetrics: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.default,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 12,
    paddingHorizontal: 8,
    paddingVertical: 14
  },
  resultPanel: {
    alignSelf: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 620,
    padding: 16,
    width: "100%"
  },
  resultPrimaryAction: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.fill,
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 14,
    minHeight: 48,
    padding: 13
  },
  resultReviewCard: {
    marginTop: 12
  },
  resultScore: {
    color: theme.colors.text.primary,
    fontSize: 54,
    fontWeight: "900",
    letterSpacing: -1.8
  },
  resultScoreBest: {
    color: theme.colors.accent.s700
  },
  resultScoreLabel: {
    color: theme.colors.text.secondary,
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
    borderColor: theme.colors.border.strong,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 8,
    minHeight: 46,
    padding: 12
  },
  resultTitle: {
    color: theme.colors.text.primary,
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
    color: theme.colors.text.strong,
    fontSize: 14,
    fontWeight: "800"
  },
  rowCopy: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  ruleMarker: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s100,
    borderRadius: theme.shape.tile,
    height: theme.metrics.iconTile,
    justifyContent: "center",
    minWidth: theme.metrics.iconTile,
    paddingHorizontal: 4
  },
  ruleMarkerText: {
    fontWeight: theme.typography.headline.fontWeight
  },
  secondaryActionText: {
    color: theme.colors.accent.s700,
    fontSize: 14,
    fontWeight: "800"
  },
  sectionTitle: {
    paddingHorizontal: 4
  },
  selectedFill: {
    backgroundColor: theme.colors.accent.s100
  },
  survivalDisclosureChevronMotion: {
    alignItems: "center",
    height: 24,
    justifyContent: "center",
    width: 24
  },
  survivalDisclosureHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: theme.metrics.minTarget,
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
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline,
    justifyContent: "space-between",
    minHeight: theme.metrics.minTarget
  },
  topBarButton: {
    alignItems: "center",
    borderRadius: theme.shape.capsule,
    height: theme.metrics.minTarget,
    justifyContent: "center",
    width: theme.metrics.minTarget
  },
  topBarTitle: {
    flex: 1,
    textAlign: "center"
  },
  typeOption: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.control,
    flex: 1,
    gap: 2,
    justifyContent: "center",
    minHeight: theme.metrics.rowMinHeight,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  typeSelector: {
    flexDirection: "row",
    gap: theme.spacing.group
  }
}));
