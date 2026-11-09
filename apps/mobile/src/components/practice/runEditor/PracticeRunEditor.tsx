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

function RunRemovalConfirmation({
  onIntent,
  run
}: {
  onIntent: PracticeRunManagementPresentation["onIntent"];
  run: PracticeRunPresentation | null;
}): React.JSX.Element | null {
  const styles = useStyles();
  if (!run) {
    return null;
  }
  return (
    <View style={styles.homeRemovalConfirmation} testID="practice-run-remove-confirmation">
      <View style={styles.homeRowCopy}>
        <AppText variant="headline">Remove {run.name} from Home?</AppText>
        <AppText tone="secondary" variant="subheadline">
          Its rating and history will be kept. You can restore this run later.
        </AppText>
      </View>
      <View style={styles.homeRemovalActions}>
        <Button
          accessibilityLabel="Cancel run removal"
          label="Cancel"
          size="compact"
          testID="practice-run-remove-cancel"
          variant="secondary"
          onPress={() => onIntent({ type: "dismiss-remove" })}
        />
        <Button
          accessibilityLabel={`Confirm removing ${run.name} from Home`}
          label="Remove"
          size="compact"
          testID="practice-run-remove-confirm"
          variant="destructive"
          onPress={() => onIntent({ type: "confirm-remove" })}
        />
      </View>
    </View>
  );
}

function PracticeRunEditor({
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
    row: previousCustomConfigRowModel(config, rating)
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
            <AppText variant="body">Name</AppText>
            <AppText tone="secondary" variant="footnote">Required · unique</AppText>
          </View>
          <TextInput
            keyboardAppearance={appTheme.name}
            accessibilityLabel="Run name"
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={PRACTICE_RUN_NAME_MAX_LENGTH}
            placeholder="e.g. Tactics Focus"
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
        detail="Built-in run names stay fixed"
        label="Name"
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
            <AppText style={editorLayout.copy} variant="body">Themes</AppText>
            <AppText style={styles.customConfigValue} tone="secondary" variant="footnote">Choose one or more</AppText>
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
          label="Duration"
          value={formatDurationLabel(draft.durationSeconds)}
          stepperTestID="practice-run-duration-stepper"
          options={PRACTICE_RUN_DURATION_OPTIONS.map((option) => ({
            value: option,
            label: formatDurationLabel(option),
            testID: `practice-run-duration-${option}`
          }))}
          selected={draft.durationSeconds as (typeof PRACTICE_RUN_DURATION_OPTIONS)[number]}
          onChange={(durationSeconds) => presentation.onIntent({ type: "change-duration", durationSeconds })}
        />,
        <CustomOptionRow
          key="per-puzzle"
          label="Time per puzzle"
          value={`${draft.perPuzzleSeconds} sec`}
          stepperTestID="practice-run-per-puzzle-stepper"
          options={PRACTICE_RUN_PER_PUZZLE_OPTIONS.map((option) => ({
            value: option,
            label: `${option}s`,
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
          label="Format"
          testID="practice-run-fixed-format"
          value={draft.kind === "arrow_duel" ? "Arrow Duel" : "Standard puzzles"}
        />
      );
    }
    fieldRows.push(eloRow);
  } else {
    if (directRunEditing) {
      fieldRows.push(
        <CustomValueRow
          key="format"
          detail="Cannot be changed after creation"
          label="Format"
          testID="practice-run-fixed-format"
          value={draft.mode === "arrow_duel"
            ? "Arrow Duel"
            : draft.kind === "standard" ? "Standard puzzles" : "Regular puzzles"}
        />
      );
    }
    fieldRows.push(eloRow);
  }

  return (
    <View style={styles.customSetupPanel} testID="practice-run-editor">
      <SprintStartHeader
        actionLabel={isCreate ? "Add" : "Save"}
        closeAccessibilityLabel="Close run editor"
        closeTestID="practice-run-editor-close"
        headerTestID="practice-run-editor-header"
        startAccessibilityLabel={isCreate
          ? "Add run to Home"
          : directRunEditing ? `Save ${draft.name} run` : `Save ${draft.name} rating`}
        startDisabled={
          presentation.canSave === false
          || Boolean(arrowDuelReplyChallenge?.replySecondsError)
        }
        startTestID="practice-run-save"
        title={isCreate ? "New Run" : directRunEditing ? "Edit Run" : "Edit rating"}
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
            ? "Saving adds this run to Home. It does not start a sprint."
            : directRunEditing
              ? "Change this Run's name, rating, and puzzle timing."
              : "Adjust the current rating. Run settings stay fixed."}
        </AppText>
      </View>

      {isCreate && presentation.canSave === false ? (
        <View accessibilityLiveRegion="polite" testID="practice-run-availability-error">
          <Section rows>
            <ListRow
              icon="warning"
              iconTone="warning"
              subtitle="Choose different themes or settings before adding this Run to Home."
              title="No matching local puzzles"
            />
          </Section>
        </View>
      ) : null}

      <Section
        header={!isCreate && directRunEditing ? "Run details" : undefined}
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
        <Section header="Previous configs" rows testID="custom-previous-configs">
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
  return (
    <Section header="Arrow Duel" rows testID="practice-run-arrow-duel-reply-setting">
      <View style={[rowStyle, editorLayout.row]}>
        <View style={editorLayout.copy}>
          <AppText variant="body">
            Find the opponent’s best reply
          </AppText>
          <AppText tone="secondary" variant="footnote">
            {individualRunCopy
              ? "After you choose the better arrow, we play the other move so you can find the opponent’s best reply."
              : "After you choose the better arrow, find the opponent’s best reply."}
          </AppText>
          {individualRunCopy ? (
            <AppText tone="secondary" variant="footnote">
              This setting only changes this Run. Turn it off to go straight to the next puzzle.
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
            {enabled ? "On" : "Off"}
          </AppText>
          <EditorSwitch
            accessibilityLabel="Find the opponent’s best reply"
            enabled={enabled}
            testID="practice-run-arrow-duel-reply-toggle"
            onPress={onToggle}
          />
        </View>
      </View>
      <View style={[rowStyle, editorLayout.row]} testID="practice-run-arrow-duel-reply-time-row">
        <View style={editorLayout.copy}>
          <AppText variant="body">Time to find the reply</AppText>
          <AppText tone="secondary" variant="footnote">
            You’ll have {DEFAULT_OPPONENT_REPLY_SECONDS} seconds by default. Choose up to {OPPONENT_REPLY_MAX_SECONDS} seconds.
          </AppText>
          <AppText tone="secondary" variant="footnote">
            Your Sprint and puzzle timers pause while you find the reply.
          </AppText>
          {individualRunCopy ? (
            <AppText tone="secondary" variant="footnote">
              To turn this extra challenge off for every Run, go to Settings.
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
              accessibilityLabel="Time to find the opponent’s reply in seconds"
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
          <AppText numberOfLines={1} tone="secondary" variant="body">sec</AppText>
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
  return (
    <View
      accessibilityLabel={`Pass rules. Solve ${config.targetCorrect} before ${formatSprintDurationLabel(config.durationSeconds)} ends. Mistake ${config.maxMistakes} ends the Sprint. Wrong answers count as attempts, not solved puzzles.`}
      testID="practice-run-pass-rules"
    >
      <Section header="Pass rules">
        <View style={styles.sprintPassRulesHeading}>
          <AppText style={styles.editorRowLabel} variant="headline">
            Solve {config.targetCorrect} before {formatSprintDurationLabel(config.durationSeconds)} ends
          </AppText>
          <View style={styles.sprintPassRulesTarget}>
            <AppText numberOfLines={1} style={styles.sprintPassRulesTargetText} tone="accent" variant="numeral">
              {config.targetCorrect}
            </AppText>
            <AppText numberOfLines={1} style={styles.sprintPassRulesTargetLabel} tone="accent" variant="caption">
              to pass
            </AppText>
          </View>
        </View>
        <AppText tone="secondary" variant="subheadline">
          Wrong answers count as attempts, not solved puzzles. Mistake {config.maxMistakes} ends the Sprint.
        </AppText>
        <AppText tone="secondary" variant="footnote">
          The goal updates with Duration and Time per puzzle.
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
  const editor = puzzleTimingEditorState(puzzleTiming, perPuzzleSeconds);
  const currentTiming = editor.policy;
  const warningEnabled = currentTiming.slowAfterSeconds !== null;
  const timeoutEnabled = currentTiming.timeoutAfterSeconds !== null;
  const warningSeconds = editor.slowDisplaySeconds;
  const timeoutSeconds = editor.timeoutDisplaySeconds;

  return (
    <View style={styles.settingsSection} testID="practice-run-puzzle-timing">
      <View style={styles.runTimingSectionCopy}>
        <AppText accessibilityRole="header" variant="title">Puzzle timing</AppText>
        <AppText tone="secondary" variant="footnote">
          {`Typical time ${formatCompactDuration(perPuzzleSeconds)} · no rating impact`}
        </AppText>
      </View>
      <Section rows testID="practice-run-puzzle-timing-card">
        <RunTimingSettingRow
          detail="Turns the puzzle clock yellow. A correct answer after that is marked Unclear; play continues."
          enabled={warningEnabled}
          label="Slow warning"
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
            ? "Marks it Timed out, counts as a mistake, adds it to Review, and moves on."
            : "Marks Timed out and moves on."}
          enabled={timeoutEnabled}
          label="Puzzle timeout"
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
  return (
    <View style={[rowStyle, editorLayout.row]} testID={testID}>
      <View style={editorLayout.copy}>
        <AppText variant="body">{label}</AppText>
        <AppText tone="secondary" variant="footnote">{detail}</AppText>
      </View>
      <View style={editorLayout.controls}>
        <View style={[styles.runTimingStepper, !enabled ? styles.runTimingControlDisabled : null]}>
          <StepperButton
            accessibilityLabel={`Decrease ${label.toLowerCase()}`}
            direction="decrease"
            disabled={!enabled || seconds <= minimumSeconds}
            testID={`${testID}-decrease`}
            onPress={() => onChange(Math.max(minimumSeconds, seconds - 5))}
          />
          <AppText numberOfLines={1} style={styles.runTimingValue} testID={`${testID}-value`} variant="numeralRow">
            {formatCompactDuration(seconds)}
          </AppText>
          <StepperButton
            accessibilityLabel={`Increase ${label.toLowerCase()}`}
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
            <AppText variant="body">{isCreate ? "Starting rating" : "Current rating"}</AppText>
            <AppText tone="secondary" variant="footnote">
              {isCreate
                ? `Sets initial puzzle difficulty · ${CUSTOM_INITIAL_RATING_MIN}–${CUSTOM_INITIAL_RATING_MAX}`
                : `${CUSTOM_INITIAL_RATING_MIN}–${CUSTOM_INITIAL_RATING_MAX} · ±100 buttons`}
            </AppText>
          </View>
          <View style={styles.runEloStepper} testID="practice-run-elo-stepper">
            <StepperButton
              accessibilityLabel="Decrease run rating by 100"
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
                accessibilityLabel={isCreate ? "Starting rating" : "Current rating"}
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
              accessibilityLabel="Increase run rating by 100"
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
        <AppText variant="body">{isCreate ? "Starting rating" : "Current rating"}</AppText>
        <AppText tone="secondary" variant="footnote">
          {isCreate
            ? `Sets initial puzzle difficulty · minimum ${RATING_FLOOR}`
            : `Adjusts puzzle difficulty · minimum ${RATING_FLOOR}`}
        </AppText>
      </View>
      <View style={editorLayout.controls}>
        <StepperButton
          accessibilityLabel="Decrease run rating"
          direction="decrease"
          disabled={!canDecrease}
          testID="practice-run-elo-decrease"
          onPress={() => onChange(stepManualRating(value, -1))}
        />
        <AppText numberOfLines={1} testID="practice-run-elo-value" tone="secondary" variant="numeralRow">Rating {value}</AppText>
        <StepperButton
          accessibilityLabel="Increase run rating"
          direction="increase"
          disabled={false}
          testID="practice-run-elo-increase"
          onPress={() => onChange(stepManualRating(value, 1))}
        />
      </View>
    </View>
  );
}

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
  // Still used by the run timing editor and packs panel, which have not moved
  // to the ui/ primitives yet.
  settingsSection: {
    gap: 8
  },
