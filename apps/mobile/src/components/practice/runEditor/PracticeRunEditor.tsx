import React from "react";
import { StyleSheet, TextInput, View } from "react-native";
import type { PracticeRunManagementPresentation, PracticeRunPresentation } from "../../practiceRunPresentation.ts";
import { AppText, Button, ListRow, Section, useListRowStyle } from "../../ui/index.tsx";
import type { ThemeCatalogPresentation } from "../shared/themeCatalog.ts";
import { makeStyles, useTheme } from "../../../theme/index.ts";
import {
  buildSprintConfig,
  DEFAULT_OPPONENT_REPLY_SECONDS,
  OPPONENT_REPLY_MAX_SECONDS,
  PRACTICE_RUN_NAME_MAX_LENGTH,
  RATING_FLOOR,
  type SprintConfig,
  stepManualRating
} from "../../../../../../packages/core/src/index.ts";
import { typography as baseTypography } from "../../../theme/scales.ts";
import { puzzleTimingEditorState, updatePuzzleTimingFromEditor } from "../../puzzleTimingEditor.ts";
import {
  EditorSwitch,
  NUMERIC_FIELD_MAX_TEXT_SCALE,
  StepperButton,
  useEditorRowLayout,
  useNumericFieldScale
} from "../shared/editorControls.tsx";
import {
  CustomModeChoiceRow,
  CustomOptionRow,
  CustomThemeChoiceRow,
  CustomValueRow,
  PreviousCustomConfigRow,
  previousCustomConfigRowModel
} from "../customSetup/CustomSprintSetup.tsx";
import {
  CUSTOM_INITIAL_RATING_MAX,
  CUSTOM_INITIAL_RATING_MIN,
  formatCompactDuration,
  formatDurationLabel,
  formatSprintDurationLabel
} from "../shared/practiceUtils.ts";
import { SprintStartHeader } from "../shared/SprintStartHeader.tsx";
import { pickPracticeStyles } from "../shared/practiceStyles.tsx";
import { useTranslation } from "../../../i18n/index.ts";

const PRACTICE_RUN_DURATION_OPTIONS = [
  3 * 60,
  5 * 60,
  10 * 60,
  15 * 60,
  20 * 60,
  25 * 60,
  30 * 60
] as const;

const PRACTICE_RUN_PER_PUZZLE_OPTIONS = [5, 10, 15, 20, 30, 60] as const;

export function RunRemovalConfirmation({
  onIntent,
  run
}: {
  onIntent: PracticeRunManagementPresentation["onIntent"];
  run: PracticeRunPresentation | null;
}): React.JSX.Element | null {
  const styles = useStyles();
  const { t } = useTranslation();
  if (!run) {
    return null;
  }
  return (
    <View style={styles.homeRemovalConfirmation} testID="practice-run-remove-confirmation">
      <View style={styles.homeRowCopy}>
        <AppText variant="headline">{t("runEditor.removeConfirmTitle", { name: run.name })}</AppText>
        <AppText tone="secondary" variant="subheadline">
          {t("runEditor.removeConfirmBody")}
        </AppText>
      </View>
      <View style={styles.homeRemovalActions}>
        <Button
          accessibilityLabel={t("runEditor.removeCancelA11y")}
          label={t("common.cancel")}
          size="compact"
          testID="practice-run-remove-cancel"
          variant="secondary"
          onPress={() => onIntent({ type: "dismiss-remove" })}
        />
        <Button
          accessibilityLabel={t("practiceHome.runRemoveConfirmA11y", { name: run.name })}
          label={t("common.remove")}
          size="compact"
          testID="practice-run-remove-confirm"
          variant="destructive"
          onPress={() => onIntent({ type: "confirm-remove" })}
        />
      </View>
    </View>
  );
}

export function PracticeRunEditor({
  arrowDuelOpponentReplyGlobalEnabled,
  arrowDuelReplyChallenge,
  presentation,
  showSprintRulesSummary,
  themeCatalogPresentation,
  timeoutCountsAsMistake
}: {
  arrowDuelOpponentReplyGlobalEnabled?: boolean;
  arrowDuelReplyChallenge?: {
    enabled: boolean;
    replySecondsError: string | null;
    replySecondsInput: string;
    onReplySecondsInputChange: (value: string) => void;
    onToggle: () => void;
  };
  presentation: PracticeRunManagementPresentation;
  showSprintRulesSummary: boolean;
  themeCatalogPresentation?: ThemeCatalogPresentation;
  timeoutCountsAsMistake: boolean;
}): React.JSX.Element | null {
  const styles = useStyles();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const editorLayout = useEditorRowLayout();
  const { locale, t } = useTranslation();
  const stackNameField = editorLayout.stacked;
  const draft = presentation.draft;
  if (!draft) {
    return null;
  }
  const isCustom = draft.kind === "custom";
  const isCreate = presentation.screen === "create";
  const directRunEditing = presentation.directRunEditing === true;
  const canEditName = (isCreate && isCustom) || (!isCreate && directRunEditing);
  const customMode = draft.mode === "arrow_duel" ? "arrow_duel" : "custom";
  const previousRows = presentation.previousConfigs?.slice(0, 5).map(({ config, rating }) => ({
    config,
    row: previousCustomConfigRowModel(config, rating, locale)
  })) ?? [];
  const sprintRules = buildSprintConfig({
    durationSeconds: draft.durationSeconds,
    mode: draft.mode,
    perPuzzleSeconds: draft.perPuzzleSeconds
  });
  const eloRow = (
    <PracticeRunEloRow
      key="elo"
      directEntry={directRunEditing}
      error={presentation.eloError ?? null}
      inputValue={presentation.eloInput ?? String(draft.elo)}
      isCreate={isCreate}
      value={draft.elo}
      onChange={(elo) => presentation.onIntent({ type: "change-elo", elo })}
      onInputChange={(value) => presentation.onIntent({ type: "change-elo-input", value })}
      onInputStep={(direction) => presentation.onIntent({ type: "step-elo-input", direction })}
    />
  );
  // Section draws a full-bleed separator between each field row, so the rows
  // are collected flat rather than nested in fragments.
  const fieldRows: React.ReactNode[] = [];
  if (canEditName) {
    fieldRows.push(
      <View key="name" style={[rowStyle, styles.editorFieldStack]}>
        <View style={[styles.runNameRow, stackNameField ? styles.runNameRowStacked : null]} testID="practice-run-name-row">
          <View style={styles.runNameCopy}>
            <AppText variant="body">{t("runEditor.nameSection")}</AppText>
            <AppText tone="secondary" variant="footnote">{t("runEditor.nameRequiredUnique")}</AppText>
          </View>
          <TextInput
            keyboardAppearance={appTheme.name}
            accessibilityLabel={t("runEditor.nameInputA11y")}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={PRACTICE_RUN_NAME_MAX_LENGTH}
            placeholder={t("runEditor.namePlaceholder")}
            placeholderTextColor={appTheme.colors.text.faint}
            returnKeyType="done"
            style={[
              styles.runNameInput,
              stackNameField ? styles.runNameInputStacked : null,
              presentation.nameError ? styles.editorInputError : null
            ]}
            submitBehavior="blurAndSubmit"
            testID="practice-run-name-input"
            value={draft.name}
            onChangeText={(name) => presentation.onIntent({ type: "change-name", name })}
          />
        </View>
        {presentation.nameError ? (
          <AppText
            accessibilityLiveRegion="polite"
            testID="practice-run-name-error"
            tone="negative"
            variant="footnote"
          >
            {presentation.nameError}
          </AppText>
        ) : null}
      </View>
    );
  } else if (isCreate) {
    fieldRows.push(
      <CustomValueRow
        key="fixed-name"
        detail={t("runEditor.fixedNameDetail")}
        label={t("runEditor.nameSection")}
        testID="practice-run-fixed-name"
        value={draft.name}
      />
    );
  }
  if (isCreate) {
    if (isCustom) {
      fieldRows.push(
        <CustomModeChoiceRow
          key="mode"
          value={customMode}
          testID="practice-run-mode-row"
          onChange={(mode) => presentation.onIntent({ type: "change-mode", mode })}
        />
      );
      if (!themeCatalogPresentation) {
        fieldRows.push(
          <View key="theme-label" style={[rowStyle, editorLayout.row]}>
            <AppText style={editorLayout.copy} variant="body">{t("common.themes")}</AppText>
            <AppText style={styles.customConfigValue} tone="secondary" variant="footnote">{t("customSetup.chooseOneOrMore")}</AppText>
          </View>
        );
      }
      fieldRows.push(
        <CustomThemeChoiceRow
          key="themes"
          showDisclosure
          selectedThemes={draft.themes}
          themeCatalogPresentation={themeCatalogPresentation}
          testID="practice-run-theme-row"
          onChange={(theme) => presentation.onIntent({ type: "toggle-theme", theme })}
        />,
        <CustomOptionRow
          key="duration"
          label={t("customSetup.durationLabel")}
          value={formatDurationLabel(draft.durationSeconds, locale)}
          stepperTestID="practice-run-duration-stepper"
          options={PRACTICE_RUN_DURATION_OPTIONS.map((option) => ({
            value: option,
            label: formatDurationLabel(option, locale),
            testID: `practice-run-duration-${option}`
          }))}
          selected={draft.durationSeconds as (typeof PRACTICE_RUN_DURATION_OPTIONS)[number]}
          onChange={(durationSeconds) => presentation.onIntent({ type: "change-duration", durationSeconds })}
        />,
        <CustomOptionRow
          key="per-puzzle"
          label={t("customSetup.perPuzzleLabel")}
          value={t("common.secondsShort", { count: draft.perPuzzleSeconds })}
          stepperTestID="practice-run-per-puzzle-stepper"
          options={PRACTICE_RUN_PER_PUZZLE_OPTIONS.map((option) => ({
            value: option,
            label: t("common.secondsCompact", { count: option }),
            testID: `practice-run-per-puzzle-${option}`
          }))}
          selected={draft.perPuzzleSeconds as (typeof PRACTICE_RUN_PER_PUZZLE_OPTIONS)[number]}
          onChange={(perPuzzleSeconds) => presentation.onIntent({ type: "change-per-puzzle", perPuzzleSeconds })}
        />
      );
    } else {
      fieldRows.push(
        <CustomValueRow
          key="format"
          label={t("runEditor.formatLabel")}
          testID="practice-run-fixed-format"
          value={draft.kind === "arrow_duel" ? t("common.arrowDuel") : t("runEditor.formatStandard")}
        />
      );
    }
    fieldRows.push(eloRow);
  } else {
    if (directRunEditing) {
      fieldRows.push(
        <CustomValueRow
          key="format"
          detail={t("runEditor.formatFixedDetail")}
          label={t("runEditor.formatLabel")}
          testID="practice-run-fixed-format"
          value={draft.mode === "arrow_duel"
            ? t("common.arrowDuel")
            : draft.kind === "standard" ? t("runEditor.formatStandard") : t("runEditor.formatRegular")}
        />
      );
    }
    fieldRows.push(eloRow);
  }

  return (
    <View style={styles.customSetupPanel} testID="practice-run-editor">
      <SprintStartHeader
        actionLabel={isCreate ? t("common.add") : t("common.save")}
        closeAccessibilityLabel={t("runEditor.closeA11y")}
        closeTestID="practice-run-editor-close"
        headerTestID="practice-run-editor-header"
        startAccessibilityLabel={isCreate
          ? t("runEditor.addRunA11y")
          : directRunEditing
            ? t("runEditor.saveRunA11y", { name: draft.name })
            : t("runEditor.saveRunRatingA11y", { name: draft.name })}
        startDisabled={
          presentation.canSave === false
          || Boolean(arrowDuelReplyChallenge?.replySecondsError)
        }
        startTestID="practice-run-save"
        title={isCreate
          ? t("runEditor.createTitle")
          : directRunEditing ? t("runEditor.editTitle") : t("settings.ratings.editRowLabel")}
        titleTestID="practice-run-editor-title"
        onClose={() => presentation.onIntent({ type: "cancel-edit" })}
        onStart={() => presentation.onIntent({ type: "save-run" })}
      />

      <View style={styles.runEditorIntro}>
        {!isCreate && !directRunEditing ? (
          <AppText testID="practice-run-editor-run-name" variant="headline">
            {draft.name}
          </AppText>
        ) : null}
        <AppText tone="secondary" variant="subheadline">
          {isCreate
            ? t("runEditor.createIntro")
            : directRunEditing
              ? t("runEditor.editDirectIntro")
              : t("runEditor.editRatingIntro")}
        </AppText>
      </View>

      {isCreate && presentation.canSave === false ? (
        <View accessibilityLiveRegion="polite" testID="practice-run-availability-error">
          <Section rows>
            <ListRow
              icon="warning"
              iconTone="warning"
              subtitle={t("runEditor.noMatchingPuzzlesBody")}
              title={t("runEditor.noMatchingPuzzlesTitle")}
            />
          </Section>
        </View>
      ) : null}

      <Section
        header={!isCreate && directRunEditing ? t("runEditor.runDetailsSection") : undefined}
        headerTestID="practice-run-details-section"
        rows
        testID="practice-run-editor-fields"
      >
        {fieldRows}
      </Section>

      {showSprintRulesSummary ? (
        <SprintPassRulesSummary config={sprintRules} />
      ) : null}

      {(arrowDuelOpponentReplyGlobalEnabled === undefined
        ? isCreate || directRunEditing
        : !isCreate && directRunEditing && arrowDuelOpponentReplyGlobalEnabled)
        && draft.mode === "arrow_duel" && arrowDuelReplyChallenge ? (
        <ArrowDuelReplyChallengeSetting
          enabled={arrowDuelReplyChallenge.enabled}
          individualRunCopy={arrowDuelOpponentReplyGlobalEnabled !== undefined}
          replySecondsError={arrowDuelReplyChallenge.replySecondsError}
          replySecondsInput={arrowDuelReplyChallenge.replySecondsInput}
          onReplySecondsInputChange={arrowDuelReplyChallenge.onReplySecondsInputChange}
          onToggle={arrowDuelReplyChallenge.onToggle}
        />
      ) : null}

      {isCreate || directRunEditing ? (
        <PracticeRunTimingSettings
          perPuzzleSeconds={draft.perPuzzleSeconds}
          puzzleTiming={draft.puzzleTiming}
          timeoutCountsAsMistake={timeoutCountsAsMistake}
          onChange={(puzzleTiming) => presentation.onIntent({
            type: "change-puzzle-timing",
            puzzleTiming
          })}
        />
      ) : null}

      {isCreate && isCustom && previousRows.length > 0 ? (
        <Section header={t("customSetup.previousConfigsTitle")} rows testID="custom-previous-configs">
          {previousRows.map(({ config, row }) => (
            <PreviousCustomConfigRow
              key={config.id}
              config={row}
              onPress={() => presentation.onIntent({
                type: "prefill-previous-config",
                configId: config.id
              })}
            />
          ))}
        </Section>
      ) : null}
    </View>
  );
}

function ArrowDuelReplyChallengeSetting({
  enabled,
  individualRunCopy = false,
  replySecondsError,
  replySecondsInput,
  onReplySecondsInputChange,
  onToggle
}: {
  enabled: boolean;
  individualRunCopy?: boolean;
  replySecondsError: string | null;
  replySecondsInput: string;
  onReplySecondsInputChange: (value: string) => void;
  onToggle: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const editorLayout = useEditorRowLayout();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const fieldScale = useNumericFieldScale();
  const { t } = useTranslation();
  return (
    <Section header={t("common.arrowDuel")} rows testID="practice-run-arrow-duel-reply-setting">
      <View style={[rowStyle, editorLayout.row]}>
        <View style={editorLayout.copy}>
          <AppText variant="body">
            {t("runEditor.arrowDuel.title")}
          </AppText>
          <AppText tone="secondary" variant="footnote">
            {individualRunCopy
              ? t("runEditor.arrowDuel.detailIndividual")
              : t("runEditor.arrowDuel.detailDefault")}
          </AppText>
          {individualRunCopy ? (
            <AppText tone="secondary" variant="footnote">
              {t("runEditor.arrowDuel.individualHint")}
            </AppText>
          ) : null}
        </View>
        <View style={editorLayout.controls}>
          <AppText
            numberOfLines={1}
            testID="practice-run-arrow-duel-reply-value"
            tone="secondary"
            variant="body"
          >
            {enabled ? t("common.on") : t("common.off")}
          </AppText>
          <EditorSwitch
            accessibilityLabel={t("runEditor.arrowDuel.title")}
            enabled={enabled}
            testID="practice-run-arrow-duel-reply-toggle"
            onPress={onToggle}
          />
        </View>
      </View>
      <View style={[rowStyle, editorLayout.row]} testID="practice-run-arrow-duel-reply-time-row">
        <View style={editorLayout.copy}>
          <AppText variant="body">{t("runEditor.arrowDuel.timeLabel")}</AppText>
          <AppText tone="secondary" variant="footnote">
            {t("runEditor.arrowDuel.timeDetail", {
              defaultSeconds: DEFAULT_OPPONENT_REPLY_SECONDS,
              maxSeconds: OPPONENT_REPLY_MAX_SECONDS
            })}
          </AppText>
          <AppText tone="secondary" variant="footnote">
            {t("runEditor.arrowDuel.pauseHint")}
          </AppText>
          {individualRunCopy ? (
            <AppText tone="secondary" variant="footnote">
              {t("runEditor.arrowDuel.globalSettingsHint")}
            </AppText>
          ) : null}
          {replySecondsError ? (
            <AppText
              accessibilityLiveRegion="polite"
              testID="practice-run-arrow-duel-reply-seconds-error"
              tone="negative"
              variant="footnote"
            >
              {replySecondsError}
            </AppText>
          ) : null}
        </View>
        <View
          style={[
            editorLayout.controls,
            !enabled ? styles.runTimingControlDisabled : null
          ]}
        >
          <View
            style={[
              styles.arrowDuelReplySecondsInputShell,
              { width: Math.round(64 * fieldScale) },
              replySecondsError ? styles.editorInputError : null
            ]}
          >
            <TextInput
              keyboardAppearance={appTheme.name}
              accessibilityLabel={t("runEditor.arrowDuel.secondsInputA11y")}
              accessibilityState={{ disabled: !enabled }}
              editable={enabled}
              inputMode="numeric"
              keyboardType="number-pad"
              maxFontSizeMultiplier={NUMERIC_FIELD_MAX_TEXT_SCALE}
              maxLength={2}
              selectTextOnFocus
              style={[
                styles.arrowDuelReplySecondsInput,
                { fontSize: Math.min(appTheme.typography.body.fontSize, baseTypography.body.fontSize * NUMERIC_FIELD_MAX_TEXT_SCALE) }
              ]}
              testID="practice-run-arrow-duel-reply-seconds"
              value={replySecondsInput}
              onChangeText={onReplySecondsInputChange}
            />
          </View>
          <AppText numberOfLines={1} tone="secondary" variant="body">{t("common.secUnit")}</AppText>
        </View>
      </View>
    </Section>
  );
}

function SprintPassRulesSummary({
  config
}: {
  config: SprintConfig;
}): React.JSX.Element {
  const styles = useStyles();
  const { locale, t } = useTranslation();
  const durationLabel = formatSprintDurationLabel(config.durationSeconds, locale);
  return (
    <View
      accessibilityLabel={t("runEditor.passRules.a11y", {
        target: config.targetCorrect,
        duration: durationLabel,
        maxMistakes: config.maxMistakes
      })}
      testID="practice-run-pass-rules"
    >
      <Section header={t("runEditor.passRules.header")}>
        <View style={styles.sprintPassRulesHeading}>
          <AppText style={styles.editorRowLabel} variant="headline">
            {t("runEditor.passRules.headline", {
              target: config.targetCorrect,
              duration: durationLabel
            })}
          </AppText>
          <View style={styles.sprintPassRulesTarget}>
            <AppText numberOfLines={1} style={styles.sprintPassRulesTargetText} tone="accent" variant="numeral">
              {config.targetCorrect}
            </AppText>
            <AppText numberOfLines={1} style={styles.sprintPassRulesTargetLabel} tone="accent" variant="caption">
              {t("runEditor.passRules.toPass")}
            </AppText>
          </View>
        </View>
        <AppText tone="secondary" variant="subheadline">
          {t("runEditor.passRules.body", { maxMistakes: config.maxMistakes })}
        </AppText>
        <AppText tone="secondary" variant="footnote">
          {t("runEditor.passRules.footnote")}
        </AppText>
      </Section>
    </View>
  );
}

function PracticeRunTimingSettings({
  onChange,
  perPuzzleSeconds,
  puzzleTiming,
  timeoutCountsAsMistake
}: {
  onChange: (puzzleTiming: {
    slowAfterSeconds: number | null;
    timeoutAfterSeconds: number | null;
  }) => void;
  perPuzzleSeconds: number;
  puzzleTiming: {
    slowAfterSeconds: number | null;
    timeoutAfterSeconds: number | null;
  } | undefined;
  timeoutCountsAsMistake: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  const { t } = useTranslation();
  const editor = puzzleTimingEditorState(puzzleTiming, perPuzzleSeconds);
  const currentTiming = editor.policy;
  const warningEnabled = currentTiming.slowAfterSeconds !== null;
  const timeoutEnabled = currentTiming.timeoutAfterSeconds !== null;
  const warningSeconds = editor.slowDisplaySeconds;
  const timeoutSeconds = editor.timeoutDisplaySeconds;

  return (
    <View style={styles.settingsSection} testID="practice-run-puzzle-timing">
      <View style={styles.runTimingSectionCopy}>
        <AppText accessibilityRole="header" variant="title">{t("runEditor.timing.header")}</AppText>
        <AppText tone="secondary" variant="footnote">
          {t("runEditor.timing.subtitle", {
            duration: formatCompactDuration(perPuzzleSeconds)
          })}
        </AppText>
      </View>
      <Section rows testID="practice-run-puzzle-timing-card">
        <RunTimingSettingRow
          detail={t("runEditor.timing.slowDetail")}
          enabled={warningEnabled}
          label={t("runEditor.timing.slowLabel")}
          maximumSeconds={editor.slowMaximumSeconds}
          minimumSeconds={10}
          seconds={warningSeconds}
          testID="practice-run-slow-warning"
          onChange={(seconds) => onChange(updatePuzzleTimingFromEditor(
            currentTiming,
            perPuzzleSeconds,
            { type: "set-slow", seconds }
          ))}
          onToggle={() => onChange(updatePuzzleTimingFromEditor(
            currentTiming,
            perPuzzleSeconds,
            { type: "toggle-slow" }
          ))}
        />
        <RunTimingSettingRow
          detail={timeoutCountsAsMistake
            ? t("runEditor.timing.timeoutDetailMistake")
            : t("runEditor.timing.timeoutDetailNoMistake")}
          enabled={timeoutEnabled}
          label={t("runEditor.timing.timeoutLabel")}
          maximumSeconds={180}
          minimumSeconds={editor.timeoutMinimumSeconds}
          seconds={timeoutSeconds}
          testID="practice-run-puzzle-timeout"
          onChange={(seconds) => onChange(updatePuzzleTimingFromEditor(
            currentTiming,
            perPuzzleSeconds,
            { type: "set-timeout", seconds }
          ))}
          onToggle={() => onChange(updatePuzzleTimingFromEditor(
            currentTiming,
            perPuzzleSeconds,
            { type: "toggle-timeout" }
          ))}
        />
      </Section>
    </View>
  );
}

function RunTimingSettingRow({
  detail,
  enabled,
  label,
  maximumSeconds,
  minimumSeconds,
  seconds,
  testID,
  onChange,
  onToggle
}: {
  detail: string;
  enabled: boolean;
  label: string;
  maximumSeconds: number;
  minimumSeconds: number;
  seconds: number;
  testID: string;
  onChange: (seconds: number) => void;
  onToggle: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const editorLayout = useEditorRowLayout();
  const rowStyle = useListRowStyle();
  const { t } = useTranslation();
  return (
    <View style={[rowStyle, editorLayout.row]} testID={testID}>
      <View style={editorLayout.copy}>
        <AppText variant="body">{label}</AppText>
        <AppText tone="secondary" variant="footnote">{detail}</AppText>
      </View>
      <View style={editorLayout.controls}>
        <View style={[styles.runTimingStepper, !enabled ? styles.runTimingControlDisabled : null]}>
          <StepperButton
            accessibilityLabel={t("runEditor.decreaseA11y", { label: label.toLowerCase() })}
            direction="decrease"
            disabled={!enabled || seconds <= minimumSeconds}
            testID={`${testID}-decrease`}
            onPress={() => onChange(Math.max(minimumSeconds, seconds - 5))}
          />
          <AppText numberOfLines={1} style={styles.runTimingValue} testID={`${testID}-value`} variant="numeralRow">
            {formatCompactDuration(seconds)}
          </AppText>
          <StepperButton
            accessibilityLabel={t("runEditor.increaseA11y", { label: label.toLowerCase() })}
            direction="increase"
            disabled={!enabled || seconds >= maximumSeconds}
            testID={`${testID}-increase`}
            onPress={() => onChange(Math.min(maximumSeconds, seconds + 5))}
          />
        </View>
        <EditorSwitch
          accessibilityLabel={label}
          enabled={enabled}
          testID={`${testID}-toggle`}
          onPress={onToggle}
        />
      </View>
    </View>
  );
}

function PracticeRunEloRow({
  directEntry = false,
  error,
  inputValue,
  isCreate,
  onChange,
  onInputChange,
  onInputStep,
  value
}: {
  directEntry?: boolean;
  error?: string | null;
  inputValue?: string;
  isCreate: boolean;
  onChange: (elo: number) => void;
  onInputChange?: (value: string) => void;
  onInputStep?: (direction: -1 | 1) => void;
  value: number;
}): React.JSX.Element {
  const styles = useStyles();
  const editorLayout = useEditorRowLayout();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const fieldScale = useNumericFieldScale();
  const { t } = useTranslation();
  if (directEntry) {
    const parsedInput = Number(inputValue);
    const stepValue = /^\d{1,4}$/.test(inputValue ?? "") && Number.isInteger(parsedInput)
      ? parsedInput
      : value;
    const canDecrease = Boolean(onInputStep) && stepValue > CUSTOM_INITIAL_RATING_MIN;
    const canIncrease = Boolean(onInputStep) && stepValue < CUSTOM_INITIAL_RATING_MAX;
    return (
      <View style={[rowStyle, styles.editorFieldStack]}>
        <View style={editorLayout.line} testID="practice-run-elo-row">
          <View style={editorLayout.copy}>
            <AppText variant="body">{isCreate ? t("customSetup.startingRatingLabel") : t("runEditor.currentRatingLabel")}</AppText>
            <AppText tone="secondary" variant="footnote">
              {isCreate
                ? t("runEditor.eloCreateHintDirect", { min: CUSTOM_INITIAL_RATING_MIN, max: CUSTOM_INITIAL_RATING_MAX })
                : t("runEditor.eloEditHintDirect", { min: CUSTOM_INITIAL_RATING_MIN, max: CUSTOM_INITIAL_RATING_MAX })}
            </AppText>
          </View>
          <View style={styles.runEloStepper} testID="practice-run-elo-stepper">
            <StepperButton
              accessibilityLabel={t("runEditor.ratingDecreaseA11y")}
              direction="decrease"
              disabled={!canDecrease}
              testID="practice-run-elo-decrease"
              onPress={() => onInputStep?.(-1)}
            />
            <View
              style={[
                styles.runEloInputShell,
                { width: Math.round(72 * fieldScale) },
                error ? styles.editorInputError : null
              ]}
              testID="practice-run-elo-input-shell"
            >
              <TextInput
                keyboardAppearance={appTheme.name}
                accessibilityLabel={isCreate ? t("customSetup.startingRatingLabel") : t("runEditor.currentRatingLabel")}
                inputMode="numeric"
                keyboardType="number-pad"
                maxFontSizeMultiplier={NUMERIC_FIELD_MAX_TEXT_SCALE}
                maxLength={4}
                selectTextOnFocus
                style={[
                  styles.runEloInput,
                  { fontSize: Math.min(appTheme.typography.body.fontSize, baseTypography.body.fontSize * NUMERIC_FIELD_MAX_TEXT_SCALE) }
                ]}
                testID="practice-run-elo-input"
                value={inputValue ?? String(value)}
                onChangeText={onInputChange}
              />
            </View>
            <StepperButton
              accessibilityLabel={t("runEditor.ratingIncreaseA11y")}
              direction="increase"
              disabled={!canIncrease}
              testID="practice-run-elo-increase"
              onPress={() => onInputStep?.(1)}
            />
          </View>
        </View>
        {error ? (
          <AppText
            accessibilityLiveRegion="polite"
            testID="practice-run-elo-error"
            tone="negative"
            variant="footnote"
          >
            {error}
          </AppText>
        ) : null}
      </View>
    );
  }
  const canDecrease = value > RATING_FLOOR;
  return (
    <View style={[rowStyle, editorLayout.row]} testID="practice-run-elo-row">
      <View style={editorLayout.copy}>
        <AppText variant="body">{isCreate ? t("customSetup.startingRatingLabel") : t("runEditor.currentRatingLabel")}</AppText>
        <AppText tone="secondary" variant="footnote">
          {isCreate
            ? t("runEditor.eloCreateHintFloor", { floor: RATING_FLOOR })
            : t("runEditor.eloEditHintFloor", { floor: RATING_FLOOR })}
        </AppText>
      </View>
      <View style={editorLayout.controls}>
        <StepperButton
          accessibilityLabel={t("runEditor.ratingDecreaseSimpleA11y")}
          direction="decrease"
          disabled={!canDecrease}
          testID="practice-run-elo-decrease"
          onPress={() => onChange(stepManualRating(value, -1))}
        />
        <AppText numberOfLines={1} testID="practice-run-elo-value" tone="secondary" variant="numeralRow">{t("common.ratingValue", { rating: value })}</AppText>
        <StepperButton
          accessibilityLabel={t("runEditor.ratingIncreaseSimpleA11y")}
          direction="increase"
          disabled={false}
          testID="practice-run-elo-increase"
          onPress={() => onChange(stepManualRating(value, 1))}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  ...pickPracticeStyles(theme, ["customConfigValue", "customSetupPanel", "editorRowLabel", "homeRowCopy", "settingsSection"]),
  homeRemovalConfirmation: {
    backgroundColor: theme.colors.surface,
    borderTopColor: theme.colors.border.default,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.row,
    paddingHorizontal: 16,
    paddingVertical: theme.spacing.row
  },
  homeRemovalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.group,
    justifyContent: "flex-end"
  },
  runEditorIntro: {
    gap: 2,
    paddingHorizontal: 4
  },
  sprintPassRulesHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row,
    justifyContent: "space-between"
  },
  sprintPassRulesTarget: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s100,
    borderRadius: theme.shape.control,
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  sprintPassRulesTargetLabel: {
    backgroundColor: theme.colors.accent.s100,
    fontWeight: theme.typography.headline.fontWeight
  },
  runNameRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16
  },
  // No wrap: in a wrapping column, stretch would size the field to its line.
  runNameRowStacked: {
    alignItems: "stretch",
    flexDirection: "column",
    flexWrap: "nowrap",
    gap: theme.spacing.inline
  },
  runNameInputStacked: {
    flex: 0,
    marginLeft: 0,
    maxWidth: "100%",
    minWidth: 0
  },
  runNameCopy: {
    flexShrink: 0,
    gap: 2
  },
  runNameInput: {
    backgroundColor: theme.colors.surfaceStrong,
    borderColor: "transparent",
    borderRadius: theme.shape.control,
    borderWidth: 1,
    color: theme.colors.text.primary,
    flex: 1,
    fontSize: theme.typography.body.fontSize,
    marginLeft: "auto",
    maxWidth: 200,
    minHeight: 40,
    minWidth: 160,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  runEloInputShell: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderColor: "transparent",
    borderRadius: theme.shape.control,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 40,
    overflow: "hidden",
    width: 72
  },
  runEloInput: {
    color: theme.colors.text.primary,
    flex: 1,
    fontSize: theme.typography.body.fontSize,
    fontVariant: ["tabular-nums"],
    fontWeight: theme.typography.headline.fontWeight,
    minHeight: 40,
    minWidth: 64,
    paddingHorizontal: 8,
    paddingVertical: 7,
    textAlign: "center"
  },
  runEloStepper: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 6,
    marginLeft: "auto"
  },
  sprintPassRulesTargetText: {
    backgroundColor: theme.colors.accent.s100
  },
  // A row holding a field line and an error below it.
  editorFieldStack: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: 6
  },
  editorInputError: {
    borderColor: theme.colors.danger.s600
  },
  runTimingSectionCopy: {
    gap: 2,
    paddingHorizontal: 4
  },
  arrowDuelReplySecondsInputShell: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderColor: "transparent",
    borderRadius: theme.shape.control,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 38,
    overflow: "hidden",
    width: 64
  },
  arrowDuelReplySecondsInput: {
    color: theme.colors.text.primary,
    flex: 1,
    fontSize: theme.typography.body.fontSize,
    fontVariant: ["tabular-nums"],
    fontWeight: theme.typography.headline.fontWeight,
    minHeight: 38,
    minWidth: 54,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: "center"
  },
  runTimingStepper: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  runTimingControlDisabled: {
    opacity: 0.38
  },
  runTimingValue: {
    minWidth: 44,
    textAlign: "center"
  },
}));
