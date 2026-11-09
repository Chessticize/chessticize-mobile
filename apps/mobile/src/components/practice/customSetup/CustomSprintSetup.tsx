import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  ALL_THEMES_FILTER,
  type CustomThemeFilter,
  customThemeLabel,
  type ThemeCatalogPresentation
} from "../shared/themeCatalog.ts";
import { type CustomSprintConfigRecord, SERVER_CURATED_THEMES, type ThemeChoiceIntent } from "../../../../../../packages/core/src/index.ts";
import type { PracticeProgressSummary } from "../../../../../../packages/storage/src/rating-history.ts";
import { AppText, Icon, ListRow, Section, useListRowStyle } from "../../ui/index.tsx";
import { makeStyles, useTheme } from "../../../theme/index.ts";
import { useUiHaptics } from "../../../platform/uiHaptics.ts";
import { CollapsibleRegion, DisclosureChevron } from "../shared/CollapsibleRegion.tsx";
import {
  CUSTOM_INITIAL_RATING_MAX,
  CUSTOM_INITIAL_RATING_MIN,
  formatDurationLabel,
  formatSprintTimingLabel,
  safeTestId
} from "../shared/practiceUtils.ts";
import { historyRatingKeyLabel } from "../history/HistoryRatingChart.tsx";
import { normalizeStoredThemeChoiceSelection } from "../../useThemeChoiceSelection.ts";
import { SprintStartHeader } from "../shared/SprintStartHeader.tsx";
import { PracticeProgressCard } from "../shared/PracticeProgressCard.tsx";
import { StepperButton, useEditorRowLayout } from "../shared/editorControls.tsx";

const CUSTOM_DURATION_OPTIONS = [3 * 60, 5 * 60, 10 * 60] as const;

const CUSTOM_PER_PUZZLE_OPTIONS = [10, 20, 30] as const;

const CUSTOM_INITIAL_RATING_STEP = 100;

const CUSTOM_THEME_OPTIONS: ReadonlyArray<CustomThemeFilter> = [
  ALL_THEMES_FILTER,
  ...SERVER_CURATED_THEMES
];

export function CustomSprintSetup({
  availablePuzzleCount,
  customMode,
  durationSeconds,
  initialRating,
  initialRatingEditorOpen,
  ratingPlayed,
  maxMistakes,
  onClose,
  onCustomModeChange,
  onInitialRatingChange,
  onInitialRatingEditorOpenChange,
  perPuzzleSeconds,
  progress,
  previousConfigs,
  ratingForKey,
  selectedThemes,
  themeCatalogPresentation,
  targetCorrect,
  ratingKey,
  onDurationChange,
  onPerPuzzleChange,
  onThemeIntent,
  onStart
}: {
  availablePuzzleCount: number;
  customMode: "custom" | "arrow_duel";
  durationSeconds: number;
  initialRating: number;
  initialRatingEditorOpen: boolean;
  ratingPlayed: boolean;
  maxMistakes: number;
  onClose: () => void;
  onCustomModeChange: (next: "custom" | "arrow_duel") => void;
  onInitialRatingChange: (next: number) => void;
  onInitialRatingEditorOpenChange: (open: boolean) => void;
  perPuzzleSeconds: number;
  progress: PracticeProgressSummary;
  previousConfigs: CustomSprintConfigRecord[];
  ratingForKey: (ratingKey: string) => number;
  selectedThemes: readonly CustomThemeFilter[];
  themeCatalogPresentation?: ThemeCatalogPresentation;
  targetCorrect: number;
  ratingKey: string;
  onDurationChange: (next: number) => void;
  onPerPuzzleChange: (next: number) => void;
  onThemeIntent: (intent: ThemeChoiceIntent) => void;
  onStart: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const requiredPuzzleCount = targetCorrect + maxMistakes;
  const hasEnoughLocalPuzzles = availablePuzzleCount >= requiredPuzzleCount;
  const canStartWithLocalPuzzles = availablePuzzleCount > 0;
  const previousRows = previousConfigs.slice(0, 5).map((config) =>
    previousCustomConfigRowModel(config, ratingForKey(config.ratingKey))
  );
  return (
    <View style={styles.customSetupPanel} testID="custom-sprint-setup">
      <SprintStartHeader
        closeAccessibilityLabel="Close custom sprint setup"
        closeTestID="custom-close"
        headerTestID="custom-action-header"
        startAccessibilityLabel="Start custom sprint"
        startDisabled={!canStartWithLocalPuzzles}
        startTestID="start-sprint-button"
        title="Custom Sprint"
        titleTestID="custom-header-title"
        onClose={onClose}
        onStart={onStart}
      />

      <Section rows testID="custom-config-list">
        <CustomModeChoiceRow
          value={customMode}
          testID="custom-mode-row"
          onChange={onCustomModeChange}
        />
        <CustomThemeChoiceRow
          selectedThemes={selectedThemes}
          themeCatalogPresentation={themeCatalogPresentation}
          testID="custom-theme-row"
          onChange={(theme) => onThemeIntent({ type: "toggle-theme", theme })}
        />
        <CustomOptionRow
          label="Duration"
          value={formatDurationLabel(durationSeconds)}
          stepperTestID="custom-duration-stepper"
          options={CUSTOM_DURATION_OPTIONS.map((option) => ({
            value: option,
            label: formatDurationLabel(option),
            testID: `custom-duration-${option}`
          }))}
          selected={durationSeconds}
          onChange={onDurationChange}
        />
        <CustomOptionRow
          label="Time per puzzle"
          value={`${perPuzzleSeconds} sec`}
          stepperTestID="custom-per-puzzle-stepper"
          options={CUSTOM_PER_PUZZLE_OPTIONS.map((option) => ({
            value: option,
            label: `${option}s`,
            testID: `custom-per-puzzle-${option}`
          }))}
          selected={perPuzzleSeconds}
          onChange={onPerPuzzleChange}
        />
        <CustomInitialRatingRow
          editOpen={initialRatingEditorOpen}
          key={ratingKey}
          played={ratingPlayed}
          onChange={onInitialRatingChange}
          onEditOpenChange={onInitialRatingEditorOpenChange}
          value={initialRating}
        />
        <CustomValueRow
          label="Estimated puzzles"
          value={`~${targetCorrect}`}
          testID="custom-summary-target"
          valueTestID="custom-target-count"
        />
      </Section>

      <CustomEligibilityNotice
        availablePuzzleCount={availablePuzzleCount}
        hasEnoughLocalPuzzles={hasEnoughLocalPuzzles}
        requiredPuzzleCount={requiredPuzzleCount}
      />

      <PracticeProgressCard currentRating={initialRating} mode={customMode} progress={progress} />

      <View style={styles.previousConfigList} testID="custom-previous-configs">
        <AppText accessibilityRole="header" style={styles.previousConfigHeader} variant="title">Previous configs</AppText>
        {previousRows.length === 0 ? (
          <AppText style={styles.previousConfigHeader} testID="custom-previous-empty" tone="secondary" variant="footnote">
            Start a custom sprint to save this setup.
          </AppText>
        ) : (
          <Section rows>
            {previousRows.map((config) => (
              <PreviousCustomConfigRow
                key={config.id}
                config={config}
                onPress={() => {
                  onCustomModeChange(config.customMode);
                  onDurationChange(config.durationSeconds);
                  onPerPuzzleChange(config.perPuzzleSeconds);
                  onThemeIntent({ type: "replace-themes", themes: config.themes });
                }}
              />
            ))}
          </Section>
        )}
      </View>
    </View>
  );
}

function CustomEligibilityNotice({
  availablePuzzleCount,
  hasEnoughLocalPuzzles,
  requiredPuzzleCount
}: {
  availablePuzzleCount: number;
  hasEnoughLocalPuzzles: boolean;
  requiredPuzzleCount: number;
}): React.JSX.Element | null {
  if (hasEnoughLocalPuzzles) {
    return null;
  }

  return (
    <Section rows testID="custom-pack-warning">
      <ListRow
        icon="warning"
        iconTone="warning"
        subtitle={`Current offline pack has ${availablePuzzleCount} eligible puzzles; this setup may need up to ${requiredPuzzleCount}. Broaden theme or rating coverage before a scored release pack.`}
        title="Local pack warning"
      />
    </Section>
  );
}

export function CustomModeChoiceRow({
  onChange,
  testID,
  value
}: {
  onChange: (next: "custom" | "arrow_duel") => void;
  testID: string;
  value: "custom" | "arrow_duel";
}): React.JSX.Element {
  const styles = useStyles();
  const rowStyle = useListRowStyle();
  const options: Array<{ value: "custom" | "arrow_duel"; label: string; detail: string; testID: string }> = [
    { value: "custom", label: "Regular Puzzles", detail: "Board moves", testID: "custom-mode-regular" },
    { value: "arrow_duel", label: "Arrow Duel", detail: "Two candidates", testID: "custom-mode-arrow-duel" }
  ];
  return (
    <View style={rowStyle} testID={testID}>
      <AppText style={styles.customModeLabel} variant="body">Mode</AppText>
      <View style={styles.customInlineOptions}>
        {options.map((option) => (
          <ChoiceChip
            key={option.value}
            accessibilityLabel={`${option.label} custom sprint mode, ${option.detail}`}
            accessibilityRole="button"
            accessibilityState={{ selected: value === option.value }}
            label={option.label}
            selected={value === option.value}
            testID={option.testID}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

function CustomInitialRatingRow({
  editOpen,
  played,
  onChange,
  onEditOpenChange,
  value
}: {
  editOpen: boolean;
  played: boolean;
  onChange: (next: number) => void;
  onEditOpenChange: (open: boolean) => void;
  value: number;
}): React.JSX.Element {
  const styles = useStyles();
  const editorLayout = useEditorRowLayout();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  if (!played) {
    return (
      <View
        accessibilityLabel={`Starting rating, rating ${value}. Sets the initial puzzle difficulty for this Run.`}
        style={[rowStyle, editorLayout.row]}
        testID="custom-initial-rating-row"
      >
        <View style={editorLayout.copy}>
          <AppText variant="body">Starting rating</AppText>
          <AppText tone="secondary" variant="footnote">Sets initial puzzle difficulty</AppText>
        </View>
        <View style={editorLayout.controls}>
          <AppText numberOfLines={1} testID="custom-initial-rating-value" tone="secondary" variant="body">Rating {value}</AppText>
          <CustomRatingStepper onChange={onChange} value={value} />
        </View>
      </View>
    );
  }

  // One grouped cell: the disclosure row and, when open, its editor below a
  // full-bleed hairline (Section separates cells, not the rows inside one).
  return (
    <View>
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Edit rating, rating ${value}`}
        accessibilityState={{ expanded: editOpen }}
        style={({ pressed }) => [rowStyle, editorLayout.row, pressed ? styles.editorRowPressed : null]}
        testID="custom-initial-rating-row"
        onPress={() => onEditOpenChange(!editOpen)}
      >
        <AppText style={editorLayout.copy} variant="body">Edit rating</AppText>
        <View style={editorLayout.controls}>
          <AppText numberOfLines={1} testID="custom-initial-rating-value" tone="secondary" variant="body">Rating {value}</AppText>
          <Icon color={appTheme.colors.text.tertiary} name="chevronRight" size={15} testID="chevron-right-glyph" weight="semibold" />
        </View>
      </Pressable>
      {editOpen ? (
        <>
          <View style={styles.editorCellSeparator} />
          <View style={rowStyle} testID="custom-initial-rating-editor">
            <AppText style={styles.editorRowLabel} variant="body">Adjustment</AppText>
            <CustomRatingStepper onChange={onChange} value={value} />
          </View>
        </>
      ) : null}
    </View>
  );
}

function CustomRatingStepper({
  onChange,
  value
}: {
  onChange: (next: number) => void;
  value: number;
}): React.JSX.Element {
  const styles = useStyles();
  const canDecrease = value > CUSTOM_INITIAL_RATING_MIN;
  const canIncrease = value < CUSTOM_INITIAL_RATING_MAX;
  const decrease = () => {
    if (canDecrease) {
      onChange(Math.max(CUSTOM_INITIAL_RATING_MIN, value - CUSTOM_INITIAL_RATING_STEP));
    }
  };
  const increase = () => {
    if (canIncrease) {
      onChange(Math.min(CUSTOM_INITIAL_RATING_MAX, value + CUSTOM_INITIAL_RATING_STEP));
    }
  };
  return (
    <View style={styles.customStepperCompact} testID="custom-initial-rating-stepper">
      <StepperButton
        accessibilityLabel="Decrease rating"
        direction="decrease"
        disabled={!canDecrease}
        testID="custom-initial-rating-stepper-decrease"
        onPress={decrease}
      />
      <StepperButton
        accessibilityLabel="Increase rating"
        direction="increase"
        disabled={!canIncrease}
        testID="custom-initial-rating-stepper-increase"
        onPress={increase}
      />
    </View>
  );
}

export function CustomValueRow({
  detail,
  label,
  testID,
  value,
  valueTestID
}: {
  detail?: string;
  label: string;
  testID: string;
  value: string;
  valueTestID?: string;
}): React.JSX.Element {
  const styles = useStyles();
  const editorLayout = useEditorRowLayout();
  const rowStyle = useListRowStyle();
  const accessibilityLabel = [label, value, detail].filter(Boolean).join(", ");
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[rowStyle, editorLayout.row]}
      testID={testID}
    >
      <View style={editorLayout.copy}>
        <AppText variant="body">{label}</AppText>
        {detail ? (
          <View
            accessibilityLabel={detail}
            testID={`${testID}-detail`}
          />
        ) : null}
      </View>
      <AppText style={styles.customConfigValue} testID={valueTestID} tone="secondary" variant="body">{value}</AppText>
    </View>
  );
}

export function CustomThemeChoiceRow({
  onChange,
  selectedThemes,
  showDisclosure = false,
  themeCatalogPresentation,
  testID,
}: {
  onChange: (next: CustomThemeFilter) => void;
  selectedThemes: readonly CustomThemeFilter[];
  showDisclosure?: boolean;
  themeCatalogPresentation?: ThemeCatalogPresentation;
  testID: string;
}): React.JSX.Element {
  const styles = useStyles();
  const rowStyle = useListRowStyle();
  if (themeCatalogPresentation) {
    return (
      <ThemeCatalogChoiceRow
        onChange={onChange}
        presentation={themeCatalogPresentation}
        selectedThemes={selectedThemes}
        showDisclosure={showDisclosure}
        testID={testID}
      />
    );
  }

  return (
    <View style={[rowStyle, styles.customThemeRow]} testID={testID}>
      <View style={[styles.customInlineOptions, styles.customThemeOptions]}>
        {CUSTOM_THEME_OPTIONS.map((option) => {
          return (
            <ThemeChoiceChip
              key={option}
              option={option}
              selected={selectedThemes.includes(option)}
              onPress={() => onChange(option)}
            />
          );
        })}
      </View>
    </View>
  );
}

function ThemeCatalogChoiceRow({
  onChange,
  presentation,
  selectedThemes,
  showDisclosure,
  testID
}: {
  onChange: (next: CustomThemeFilter) => void;
  presentation: ThemeCatalogPresentation;
  selectedThemes: readonly CustomThemeFilter[];
  showDisclosure: boolean;
  testID: string;
}): React.JSX.Element {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(!showDisclosure);
  const selectedThemeLabels = selectedThemes
    .filter((theme) => theme !== ALL_THEMES_FILTER)
    .map(customThemeLabel);
  const selectedThemeDetail = selectedThemeLabels.length === 0
    ? "All themes"
    : selectedThemeLabels.join(" · ");
  const allChip = (
    <ThemeChoiceChip
      label={showDisclosure ? "All themes" : undefined}
      option={ALL_THEMES_FILTER}
      selected={selectedThemes.includes(ALL_THEMES_FILTER)}
      onPress={() => onChange(ALL_THEMES_FILTER)}
    />
  );

  return (
    <View style={styles.themeCatalogSection} testID={testID}>
      {showDisclosure ? (
        <Pressable
          accessibilityLabel={expanded ? "Hide Run themes" : "Show Run themes"}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={styles.historyThemeDisclosure}
          testID="practice-run-theme-disclosure"
          onPress={() => setExpanded((current) => !current)}
        >
          <View style={styles.historyThemeDisclosureCopy}>
            <AppText variant="body">Themes</AppText>
            <AppText
              accessibilityLabel={`Selected themes: ${selectedThemeDetail}`}
              ellipsizeMode="tail"
              numberOfLines={1}
              testID="practice-run-theme-selection-detail"
              tone="secondary"
              variant="footnote"
            >
              {selectedThemeDetail}
            </AppText>
          </View>
          <DisclosureChevron
            expanded={expanded}
            testID="practice-run-theme-animated-chevron"
          />
        </Pressable>
      ) : (
        <View style={styles.themeCatalogHeadingRow}>
          <View style={styles.editorRowLabel}>
            <AppText variant="body">Themes</AppText>
            <AppText tone="secondary" variant="footnote">Choose one or more</AppText>
          </View>
          {allChip}
        </View>
      )}
      <CollapsibleRegion
        contentTestID="practice-run-theme-catalog"
        contentStyle={styles.themeCatalogExpandableContent}
        expanded={expanded}
      >
          {showDisclosure ? (
            <View style={styles.historyThemeAllRow}>{allChip}</View>
          ) : null}
          <View style={styles.themeCatalogGroupGrid}>
            {presentation.groups.map((group) => (
              <View key={group.label} style={styles.themeCatalogGroupCard}>
                <Text style={styles.themeCatalogGroupLabel}>{group.label}</Text>
                <View style={styles.themeCatalogGroupOptions}>
                  {group.themes.map((theme) => (
                    <ThemeChoiceChip
                      key={theme}
                      option={theme}
                      selected={selectedThemes.includes(theme)}
                      onPress={() => onChange(theme)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
      </CollapsibleRegion>
    </View>
  );
}

// A capsule choice: selection is an accentSoft tint, never a check or border.
// A change plays selection feedback (#609): a single choice only when it moves,
// a checkbox on every toggle.
function ChoiceChip({
  accessibilityHint,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  label,
  selected,
  testID,
  onPress
}: {
  accessibilityHint?: string;
  accessibilityLabel: string;
  accessibilityRole: "button" | "checkbox";
  accessibilityState: { checked?: boolean; selected?: boolean };
  label: string;
  selected: boolean;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const uiHaptics = useUiHaptics();
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      hitSlop={4}
      style={({ pressed }) => [
        styles.customMiniChip,
        selected ? styles.customMiniChipActive : null,
        pressed && !selected ? styles.customMiniChipPressed : null
      ]}
      testID={testID}
      onPress={() => {
        if (accessibilityRole === "checkbox" || !selected) {
          uiHaptics("selection");
        }
        onPress();
      }}
    >
      <AppText
        style={[styles.customMiniChipText, selected ? styles.customMiniChipTextActive : null]}
        tone={selected ? "accent" : "primary"}
        variant="subheadline"
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function ThemeChoiceChip({
  label,
  onPress,
  option,
  selected
}: {
  label?: string;
  onPress: () => void;
  option: CustomThemeFilter;
  selected: boolean;
}): React.JSX.Element {
  const visibleLabel = label ?? customThemeLabel(option);
  const representsAllThemes = option === ALL_THEMES_FILTER;
  return (
    <ChoiceChip
      accessibilityHint={representsAllThemes
        ? "Selects all themes and clears named theme selections"
        : "Adds or removes this theme"}
      accessibilityLabel={representsAllThemes ? "All puzzle themes" : `${visibleLabel} puzzle theme`}
      accessibilityRole={representsAllThemes ? "button" : "checkbox"}
      accessibilityState={representsAllThemes ? { selected } : { checked: selected }}
      label={visibleLabel}
      selected={selected}
      testID={`custom-theme-${representsAllThemes ? "mixed" : safeTestId(visibleLabel)}`}
      onPress={onPress}
    />
  );
}

export function CustomOptionRow<T extends number>({
  label,
  onChange,
  options,
  stepperTestID,
  selected,
  value
}: {
  label: string;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string; testID: string }>;
  stepperTestID: string;
  selected: T;
  value: string;
}): React.JSX.Element {
  const styles = useStyles();
  const editorLayout = useEditorRowLayout();
  const rowStyle = useListRowStyle();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selected));
  const previousOption = options[selectedIndex - 1];
  const nextOption = options[selectedIndex + 1];

  return (
    <View style={[rowStyle, editorLayout.row]}>
      <AppText style={editorLayout.copy} variant="body">{label}</AppText>
      <View style={editorLayout.controls}>
        <AppText numberOfLines={1} tone="secondary" variant="body">{value}</AppText>
        <View style={styles.customStepperCompact} testID={stepperTestID}>
          <StepperButton
            accessibilityLabel={`Decrease ${label.toLowerCase()}`}
            direction="decrease"
            disabled={!previousOption}
            testID={`${stepperTestID}-decrease`}
            onPress={() => {
              if (previousOption) {
                onChange(previousOption.value);
              }
            }}
          />
          <StepperButton
            accessibilityLabel={`Increase ${label.toLowerCase()}`}
            direction="increase"
            disabled={!nextOption}
            testID={`${stepperTestID}-increase`}
            onPress={() => {
              if (nextOption) {
                onChange(nextOption.value);
              }
            }}
          />
        </View>
      </View>
    </View>
  );
}

type PreviousCustomConfig = {
  customMode: "custom" | "arrow_duel";
  durationSeconds: number;
  id: string;
  mode: string;
  perPuzzleSeconds: number;
  themes: CustomThemeFilter[];
  themeLabel: string;
  timing: string;
  lastPlayed: string;
  ratingKey: string;
  rating: number;
};

export function PreviousCustomConfigRow({
  config,
  onPress
}: {
  config: PreviousCustomConfig;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const ratingLabel = historyRatingKeyLabel(config.ratingKey);
  const metaLabel = `${config.themeLabel} · ${config.timing} · Last ${config.lastPlayed}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Use ${ratingLabel} custom sprint, ${config.mode}, ${metaLabel}, rating ${config.rating}`}
      style={({ pressed }) => [rowStyle, pressed ? styles.editorRowPressed : null]}
      testID={`custom-previous-${config.id}`}
      onPress={onPress}
    >
      <View style={styles.editorRowLabel}>
        <AppText variant="headline">{config.mode}</AppText>
        <AppText
          accessibilityLabel={`${metaLabel} · ${ratingLabel}`}
          testID={`custom-previous-${config.id}-meta`}
          tone="secondary"
          variant="subheadline"
        >
          {metaLabel}
        </AppText>
      </View>
      <View style={styles.previousConfigRating}>
        <AppText numberOfLines={1} tone="secondary" variant="footnote">Rating</AppText>
        <AppText numberOfLines={1} tone="secondary" variant="numeralRow">{config.rating}</AppText>
      </View>
      <View testID={`custom-previous-${config.id}-chevron`}>
        <Icon color={appTheme.colors.text.tertiary} name="chevronRight" size={15} testID="chevron-right-glyph" weight="semibold" />
      </View>
    </Pressable>
  );
}

function customThemeSelectionLabel(themes: readonly CustomThemeFilter[]): string {
  if (themes.length === 0) {
    return customThemeLabel(ALL_THEMES_FILTER);
  }
  return themes.map(customThemeLabel).join(", ");
}

export function previousCustomConfigRowModel(
  config: CustomSprintConfigRecord,
  rating: number
): PreviousCustomConfig {
  const themes = customThemesFromStoredValue(config);
  return {
    id: safeTestId(config.id),
    mode: config.mode === "arrow_duel" ? "Arrow Duel" : "Regular Puzzles",
    customMode: config.mode === "arrow_duel" ? "arrow_duel" : "custom",
    themes,
    themeLabel: customThemeSelectionLabel(themes),
    durationSeconds: config.durationSeconds,
    perPuzzleSeconds: config.perPuzzleSeconds,
    timing: formatSprintTimingLabel(config),
    lastPlayed: formatConfigLastPlayed(config.lastStartedAt),
    ratingKey: config.ratingKey,
    rating
  };
}

function customThemesFromStoredValue(
  config: Pick<CustomSprintConfigRecord, "themes">
): CustomThemeFilter[] {
  return normalizeStoredThemeChoiceSelection(config.themes);
}

function formatConfigLastPlayed(lastStartedAt: string): string {
  const date = new Date(lastStartedAt);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const useStyles = makeStyles((theme) => ({
  editorRowLabel: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  editorRowPressed: {
    backgroundColor: theme.colors.surfaceStrong
  },
  editorCellSeparator: {
    backgroundColor: theme.colors.border.default,
    height: StyleSheet.hairlineWidth
  },
  customModeLabel: {
    flexShrink: 0
  },
  customMiniChipPressed: {
    opacity: 0.7
  },
  previousConfigHeader: {
    paddingHorizontal: 4
  },
  customSetupPanel: {
    alignSelf: "center",
    gap: theme.spacing.section,
    maxWidth: 760,
    width: "100%"
  },
  customStepperCompact: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline
  },
  customConfigValue: {
    flexShrink: 1,
    marginLeft: "auto",
    textAlign: "right"
  },
  customInlineOptions: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.inline,
    justifyContent: "flex-end"
  },
  customThemeRow: {
    justifyContent: "center"
  },
  customThemeOptions: {
    justifyContent: "center"
  },
  customMiniChip: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.capsule,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 6
  },
  customMiniChipActive: {
    backgroundColor: theme.colors.accent.s100
  },
  customMiniChipText: {
    textAlign: "center"
  },
  customMiniChipTextActive: {
    fontWeight: theme.typography.headline.fontWeight
  },
  themeCatalogSection: {
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.inline,
    paddingHorizontal: 16,
    paddingVertical: 4
  },
  themeCatalogHeadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row,
    minHeight: theme.metrics.rowMinHeight - 8
  },
  themeCatalogExpandableContent: {
    gap: 12,
    paddingBottom: 12
  },
  themeCatalogGroupLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  themeCatalogGroupGrid: {
    gap: 16
  },
  themeCatalogGroupCard: {
    gap: theme.spacing.inline
  },
  themeCatalogGroupOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.inline
  },
  previousConfigList: {
    gap: theme.spacing.group
  },
  previousConfigRating: {
    alignItems: "flex-end",
    minWidth: 48
  },
  historyThemeDisclosure: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44
  },
  historyThemeDisclosureCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8
  },
  historyThemeAllRow: {
    alignItems: "flex-start"
  },
}));
