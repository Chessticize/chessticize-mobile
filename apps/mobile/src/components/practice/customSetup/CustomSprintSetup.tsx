import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  ALL_THEMES_FILTER,
  type CustomThemeFilter,
  customThemeLabel,
  themeCatalogGroupLabel,
  type ThemeCatalogPresentation
} from "../shared/themeCatalog.ts";
import { type CustomSprintConfigRecord, SERVER_CURATED_THEMES, type ThemeChoiceIntent } from "../../../../../../packages/core/src/index.ts";
import type { PracticeProgressSummary } from "../../../../../../packages/storage/src/rating-history.ts";
import { AppText, Icon, ListRow, Section, useListRowStyle } from "../../ui/index.tsx";
import { makeStyles, useTheme } from "../../../theme/index.ts";
import { useUiHaptics } from "../../../platform/uiHaptics.ts";
import {
  formatDateForLocale,
  getActiveLocale,
  type SupportedLocale,
  translate,
  useTranslation
} from "../../../i18n/index.ts";
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
import { pickPracticeStyles } from "../shared/practiceStyles.tsx";

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
  const { locale, t } = useTranslation();
  const requiredPuzzleCount = targetCorrect + maxMistakes;
  const hasEnoughLocalPuzzles = availablePuzzleCount >= requiredPuzzleCount;
  const canStartWithLocalPuzzles = availablePuzzleCount > 0;
  const previousRows = previousConfigs.slice(0, 5).map((config) =>
    previousCustomConfigRowModel(config, ratingForKey(config.ratingKey), locale)
  );
  return (
    <View style={styles.customSetupPanel} testID="custom-sprint-setup">
      <SprintStartHeader
        closeAccessibilityLabel={t("customSetup.closeA11y")}
        closeTestID="custom-close"
        headerTestID="custom-action-header"
        startAccessibilityLabel={t("customSetup.startA11y")}
        startDisabled={!canStartWithLocalPuzzles}
        startTestID="start-sprint-button"
        title={t("customSetup.title")}
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
          label={t("customSetup.durationLabel")}
          value={formatDurationLabel(durationSeconds, locale)}
          stepperTestID="custom-duration-stepper"
          options={CUSTOM_DURATION_OPTIONS.map((option) => ({
            value: option,
            label: formatDurationLabel(option, locale),
            testID: `custom-duration-${option}`
          }))}
          selected={durationSeconds}
          onChange={onDurationChange}
        />
        <CustomOptionRow
          label={t("customSetup.perPuzzleLabel")}
          value={t("common.secondsShort", { count: perPuzzleSeconds })}
          stepperTestID="custom-per-puzzle-stepper"
          options={CUSTOM_PER_PUZZLE_OPTIONS.map((option) => ({
            value: option,
            label: t("common.secondsCompact", { count: option }),
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
          label={t("customSetup.estimatedPuzzlesLabel")}
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
        <AppText accessibilityRole="header" style={styles.previousConfigHeader} variant="title">{t("customSetup.previousConfigsTitle")}</AppText>
        {previousRows.length === 0 ? (
          <AppText style={styles.previousConfigHeader} testID="custom-previous-empty" tone="secondary" variant="footnote">
            {t("customSetup.previousConfigsEmpty")}
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
  const { t } = useTranslation();
  if (hasEnoughLocalPuzzles) {
    return null;
  }

  return (
    <Section rows testID="custom-pack-warning">
      <ListRow
        icon="warning"
        iconTone="warning"
        subtitle={t("customSetup.localPackWarningBody", {
          available: availablePuzzleCount,
          required: requiredPuzzleCount
        })}
        title={t("customSetup.localPackWarningTitle")}
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
  const { t } = useTranslation();
  const options: Array<{ value: "custom" | "arrow_duel"; label: string; detail: string; testID: string }> = [
    { value: "custom", label: t("customSetup.modeRegular"), detail: t("customSetup.modeRegularDetail"), testID: "custom-mode-regular" },
    { value: "arrow_duel", label: t("common.arrowDuel"), detail: t("customSetup.modeArrowDuelDetail"), testID: "custom-mode-arrow-duel" }
  ];
  return (
    <View style={rowStyle} testID={testID}>
      <AppText style={styles.customModeLabel} variant="body">{t("common.mode")}</AppText>
      <View style={styles.customInlineOptions}>
        {options.map((option) => (
          <ChoiceChip
            key={option.value}
            accessibilityLabel={t("customSetup.modeOptionA11y", {
              label: option.label,
              detail: option.detail
            })}
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
  const { t } = useTranslation();
  if (!played) {
    return (
      <View
        accessibilityLabel={t("customSetup.startingRatingRowA11y", { rating: value })}
        style={[rowStyle, editorLayout.row]}
        testID="custom-initial-rating-row"
      >
        <View style={editorLayout.copy}>
          <AppText variant="body">{t("customSetup.startingRatingLabel")}</AppText>
          <AppText tone="secondary" variant="footnote">{t("customSetup.startingRatingHint")}</AppText>
        </View>
        <View style={editorLayout.controls}>
          <AppText numberOfLines={1} testID="custom-initial-rating-value" tone="secondary" variant="body">{t("common.ratingValue", { rating: value })}</AppText>
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
        accessibilityLabel={t("customSetup.editRatingRowA11y", { rating: value })}
        accessibilityState={{ expanded: editOpen }}
        style={({ pressed }) => [rowStyle, editorLayout.row, pressed ? styles.editorRowPressed : null]}
        testID="custom-initial-rating-row"
        onPress={() => onEditOpenChange(!editOpen)}
      >
        <AppText style={editorLayout.copy} variant="body">{t("settings.ratings.editRowLabel")}</AppText>
        <View style={editorLayout.controls}>
          <AppText numberOfLines={1} testID="custom-initial-rating-value" tone="secondary" variant="body">{t("common.ratingValue", { rating: value })}</AppText>
          <Icon color={appTheme.colors.text.tertiary} name="chevronRight" size={15} testID="chevron-right-glyph" weight="semibold" />
        </View>
      </Pressable>
      {editOpen ? (
        <>
          <View style={styles.editorCellSeparator} />
          <View style={rowStyle} testID="custom-initial-rating-editor">
            <AppText style={styles.editorRowLabel} variant="body">{t("customSetup.adjustmentLabel")}</AppText>
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
  const { t } = useTranslation();
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
        accessibilityLabel={t("customSetup.decreaseRatingA11y")}
        direction="decrease"
        disabled={!canDecrease}
        testID="custom-initial-rating-stepper-decrease"
        onPress={decrease}
      />
      <StepperButton
        accessibilityLabel={t("customSetup.increaseRatingA11y")}
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
  const { locale, t } = useTranslation();
  const [expanded, setExpanded] = useState(!showDisclosure);
  const selectedThemeLabels = selectedThemes
    .filter((theme) => theme !== ALL_THEMES_FILTER)
    .map((theme) => customThemeLabel(theme, locale));
  const selectedThemeDetail = selectedThemeLabels.length === 0
    ? t("customSetup.allThemes")
    : selectedThemeLabels.join(" · ");
  const allChip = (
    <ThemeChoiceChip
      label={showDisclosure ? t("customSetup.allThemes") : undefined}
      option={ALL_THEMES_FILTER}
      selected={selectedThemes.includes(ALL_THEMES_FILTER)}
      onPress={() => onChange(ALL_THEMES_FILTER)}
    />
  );

  return (
    <View style={styles.themeCatalogSection} testID={testID}>
      {showDisclosure ? (
        <Pressable
          accessibilityLabel={expanded ? t("customSetup.hideRunThemesA11y") : t("customSetup.showRunThemesA11y")}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={styles.historyThemeDisclosure}
          testID="practice-run-theme-disclosure"
          onPress={() => setExpanded((current) => !current)}
        >
          <View style={styles.historyThemeDisclosureCopy}>
            <AppText variant="body">{t("common.themes")}</AppText>
            <AppText
              accessibilityLabel={t("customSetup.selectedThemesA11y", { themes: selectedThemeDetail })}
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
            <AppText variant="body">{t("common.themes")}</AppText>
            <AppText tone="secondary" variant="footnote">{t("customSetup.chooseOneOrMore")}</AppText>
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
              <View key={group.id ?? group.label} style={styles.themeCatalogGroupCard}>
                <Text style={styles.themeCatalogGroupLabel}>{themeCatalogGroupLabel(group, locale)}</Text>
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
  const { locale, t } = useTranslation();
  const visibleLabel = label ?? customThemeLabel(option, locale);
  const representsAllThemes = option === ALL_THEMES_FILTER;
  const canonicalSlug = representsAllThemes ? "mixed" : safeTestId(customThemeLabel(option, "en"));
  return (
    <ChoiceChip
      accessibilityHint={representsAllThemes
        ? t("customSetup.allThemesHint")
        : t("customSetup.themeToggleHint")}
      accessibilityLabel={representsAllThemes
        ? t("customSetup.allThemesA11y")
        : t("customSetup.themeA11y", { label: visibleLabel })}
      accessibilityRole={representsAllThemes ? "button" : "checkbox"}
      accessibilityState={representsAllThemes ? { selected } : { checked: selected }}
      label={visibleLabel}
      selected={selected}
      testID={`custom-theme-${canonicalSlug}`}
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
  const { t } = useTranslation();
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
            accessibilityLabel={t("runEditor.decreaseA11y", { label: label.toLowerCase() })}
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
            accessibilityLabel={t("runEditor.increaseA11y", { label: label.toLowerCase() })}
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
  const { t } = useTranslation();
  const ratingLabel = historyRatingKeyLabel(config.ratingKey);
  const metaLabel = t("customSetup.previousMeta", {
    themes: config.themeLabel,
    timing: config.timing,
    lastPlayed: config.lastPlayed
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("customSetup.previousRowA11y", {
        ratingLabel,
        mode: config.mode,
        meta: metaLabel,
        rating: config.rating
      })}
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
        <AppText numberOfLines={1} tone="secondary" variant="footnote">{t("common.rating")}</AppText>
        <AppText numberOfLines={1} tone="secondary" variant="numeralRow">{config.rating}</AppText>
      </View>
      <View testID={`custom-previous-${config.id}-chevron`}>
        <Icon color={appTheme.colors.text.tertiary} name="chevronRight" size={15} testID="chevron-right-glyph" weight="semibold" />
      </View>
    </Pressable>
  );
}

function customThemeSelectionLabel(
  themes: readonly CustomThemeFilter[],
  locale: SupportedLocale
): string {
  if (themes.length === 0) {
    return customThemeLabel(ALL_THEMES_FILTER, locale);
  }
  return themes.map((theme) => customThemeLabel(theme, locale)).join(", ");
}

export function previousCustomConfigRowModel(
  config: CustomSprintConfigRecord,
  rating: number,
  locale: SupportedLocale = getActiveLocale()
): PreviousCustomConfig {
  const themes = customThemesFromStoredValue(config);
  return {
    id: safeTestId(config.id),
    mode: config.mode === "arrow_duel"
      ? translate(locale, "common.arrowDuel")
      : translate(locale, "customSetup.modeRegular"),
    customMode: config.mode === "arrow_duel" ? "arrow_duel" : "custom",
    themes,
    themeLabel: customThemeSelectionLabel(themes, locale),
    durationSeconds: config.durationSeconds,
    perPuzzleSeconds: config.perPuzzleSeconds,
    timing: formatSprintTimingLabel(config, locale),
    lastPlayed: formatConfigLastPlayed(config.lastStartedAt, locale),
    ratingKey: config.ratingKey,
    rating
  };
}

function customThemesFromStoredValue(
  config: Pick<CustomSprintConfigRecord, "themes">
): CustomThemeFilter[] {
  return normalizeStoredThemeChoiceSelection(config.themes);
}

function formatConfigLastPlayed(lastStartedAt: string, locale: SupportedLocale): string {
  const date = new Date(lastStartedAt);
  if (Number.isNaN(date.getTime())) {
    return translate(locale, "customSetup.recently");
  }
  return formatDateForLocale(date, locale, { month: "short", day: "numeric" });
}

const useStyles = makeStyles((theme) => ({
  ...pickPracticeStyles(theme, ["customConfigValue", "customSetupPanel", "editorRowLabel", "historyThemeAllRow", "historyThemeDisclosure", "historyThemeDisclosureCopy", "themeCatalogGroupLabel"]),
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
  customStepperCompact: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline
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
}));
