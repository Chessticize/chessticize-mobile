import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  MAIA_MAX_OPPONENT_RATING,
  MAIA_MIN_RATING,
  MAIA_OPPONENT_RATING_STEP,
  classifyMaiaTimeControl,
  type MaiaColorPreference,
  type MaiaGameState,
  type MaiaRatingRecord,
  type MaiaSetupPreferences,
  type MaiaThinkingPace,
  type MaiaTimeClass,
  type MaiaTimeControl
} from "../../../../../packages/core/src/index.ts";
import { useTranslation } from "../../i18n/index.ts";
import { makeStyles, useTheme } from "../../theme/index.ts";
import { usePracticeViewport } from "../PracticeViewport.tsx";
import { AppText, Button, Icon, Section, SegmentedControl } from "../ui/index.tsx";
import { formatMaiaTimeControlDisplay, maiaTimeClassLabel } from "./maiaPlayPresentation.ts";
import { MaiaTimeControlPickerModal } from "./MaiaTimeControlPickerModal.tsx";

export interface MaiaPlaySetupViewProps {
  preferences: MaiaSetupPreferences;
  ratingsByClass: Readonly<Record<MaiaTimeClass, MaiaRatingRecord>>;
  activeGame?: MaiaGameState | null;
  onPatchPreferences: (patch: Partial<MaiaSetupPreferences>) => void;
  onChangeInitialRating?: (timeClass: MaiaTimeClass, rating: number) => void;
  onStartGame: () => void;
  onResumeGame: () => void;
  onBack: () => void;
}

export function MaiaPlaySetupView({
  preferences,
  ratingsByClass,
  activeGame,
  onPatchPreferences,
  onStartGame,
  onResumeGame,
  onBack
}: MaiaPlaySetupViewProps): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  const viewport = usePracticeViewport();
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  const selectedTimeClass = classifyMaiaTimeControl(preferences.timeControl);
  const currentRating = ratingsByClass[selectedTimeClass];
  const hasResumable = activeGame != null && activeGame.status === "playing";
  const isCompactLandscape = viewport.width > viewport.height && viewport.height < 520;

  const updateTimeControl = (timeControl: MaiaTimeControl) => {
    onPatchPreferences({ timeControl });
  };

  const timeControlField = (
    <View style={styles.field}>
      <AppText tone="secondary" variant="caption">
        {t("maiaPlay.setup.timeControl")}
      </AppText>
      <Pressable
        accessibilityRole="button"
        style={[styles.pickerPill, isCompactLandscape ? styles.controlCompact : null]}
        testID="maia-setup-time-control"
        onPress={() => setTimePickerOpen(true)}
      >
        <View style={styles.pickerPillLeft}>
          <Icon color={theme.colors.accent.s600} name="clock" size={18} />
          <AppText variant="headline">
            {`${maiaTimeClassLabel(selectedTimeClass, t)} · ${formatMaiaTimeControlDisplay(preferences.timeControl, t)}`}
          </AppText>
        </View>
        <View style={styles.pickerPillRight}>
          <AppText tone="secondary" variant="footnote" testID="maia-setup-current-rating">
            {currentRating.rating}
          </AppText>
          <Icon color={theme.colors.text.secondary} name="chevronDown" size={18} />
        </View>
      </Pressable>
    </View>
  );

  const modeField = (
    <View style={styles.field}>
      <AppText tone="secondary" variant="caption">
        {t("maiaPlay.setup.mode")}
      </AppText>
      <SegmentedControl<"rated" | "unrated">
        accessibilityLabel={t("maiaPlay.setup.mode")}
        options={[
          { value: "rated", label: t("maiaPlay.mode.rated"), testID: "maia-mode-rated" },
          { value: "unrated", label: t("maiaPlay.mode.unrated"), testID: "maia-mode-unrated" }
        ]}
        semantics="radio"
        testID="maia-setup-mode"
        value={preferences.rated ? "rated" : "unrated"}
        onChange={(next) =>
          onPatchPreferences({
            rated: next === "rated"
          })
        }
      />
    </View>
  );

  const opponentRatingField = (
    <View style={styles.field}>
      <AppText tone="secondary" variant="caption">
        {t("maiaPlay.setup.opponentRating")}
      </AppText>
      <View
        style={[styles.opponentStepper, isCompactLandscape ? styles.controlCompact : null]}
        testID="maia-opponent-rating-stepper"
      >
        <Pressable
          accessibilityLabel={t("maiaPlay.setup.decreaseOpponentRating")}
          accessibilityRole="button"
          disabled={preferences.opponentRating <= MAIA_MIN_RATING}
          style={styles.stepButton}
          testID="maia-opponent-rating-dec"
          onPress={() =>
            onPatchPreferences({
              opponentRating: Math.max(
                MAIA_MIN_RATING,
                preferences.opponentRating - MAIA_OPPONENT_RATING_STEP
              )
            })
          }
        >
          <Icon color={theme.colors.text.primary} name="remove" size={18} />
        </Pressable>
        <AppText testID="maia-opponent-rating-value" variant="numeral">
          {preferences.opponentRating}
        </AppText>
        <Pressable
          accessibilityLabel={t("maiaPlay.setup.increaseOpponentRating")}
          accessibilityRole="button"
          disabled={preferences.opponentRating >= MAIA_MAX_OPPONENT_RATING}
          style={styles.stepButton}
          testID="maia-opponent-rating-inc"
          onPress={() =>
            onPatchPreferences({
              opponentRating: Math.min(
                MAIA_MAX_OPPONENT_RATING,
                preferences.opponentRating + MAIA_OPPONENT_RATING_STEP
              )
            })
          }
        >
          <Icon color={theme.colors.text.primary} name="add" size={18} />
        </Pressable>
      </View>
    </View>
  );

  const colorField = (
    <View style={styles.field}>
      <AppText tone="secondary" variant="caption">
        {t("maiaPlay.setup.playAs")}
      </AppText>
      <SegmentedControl<MaiaColorPreference>
        accessibilityLabel={t("maiaPlay.setup.playAs")}
        options={[
          { value: "random", label: t("maiaPlay.color.random"), testID: "maia-color-random" },
          { value: "w", label: t("maiaPlay.color.white"), testID: "maia-color-w" },
          { value: "b", label: t("maiaPlay.color.black"), testID: "maia-color-b" }
        ]}
        semantics="radio"
        testID="maia-setup-color"
        value={preferences.colorPreference}
        onChange={(colorPreference) => onPatchPreferences({ colorPreference })}
      />
    </View>
  );

  const paceField = (
    <View style={styles.field}>
      <AppText tone="secondary" variant="caption">
        {t("maiaPlay.setup.thinkingPace")}
      </AppText>
      <SegmentedControl<MaiaThinkingPace>
        accessibilityLabel={t("maiaPlay.setup.thinkingPace")}
        options={[
          { value: "human", label: t("maiaPlay.pace.human"), testID: "maia-pace-human" },
          { value: "instant", label: t("maiaPlay.pace.instant"), testID: "maia-pace-instant" }
        ]}
        semantics="radio"
        testID="maia-setup-pace"
        value={preferences.thinkingPace}
        onChange={(thinkingPace) => onPatchPreferences({ thinkingPace })}
      />
    </View>
  );

  const startButton = (
    <Button
      label={t("maiaPlay.action.startGame")}
      size={isCompactLandscape ? "compact" : "regular"}
      stretch
      testID="maia-start-game"
      onPress={onStartGame}
    />
  );

  return (
    <View style={styles.root} testID="maia-play-setup">
      <View style={[styles.topBar, isCompactLandscape ? styles.topBarCompactLandscape : null]}>
        <Pressable
          accessibilityLabel={t("common.back")}
          accessibilityRole="button"
          hitSlop={10}
          style={styles.backButton}
          testID="maia-setup-back"
          onPress={onBack}
        >
          <Icon color={theme.colors.text.primary} name="chevronLeft" size={20} />
          <AppText variant="subheadline">{t("common.back")}</AppText>
        </Pressable>
        <AppText accessibilityRole="header" variant="title">
          {t("maiaPlay.title")}
        </AppText>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          isCompactLandscape ? styles.contentCompactLandscape : null
        ]}
        showsVerticalScrollIndicator={false}
      >
        {hasResumable ? (
          <Section style={styles.resumeCard}>
            <View style={styles.resumeRow}>
              <View style={styles.resumeCopy}>
                <AppText variant="headline">{t("maiaPlay.resumeTitle")}</AppText>
                <AppText tone="secondary" variant="footnote">
                  {`${maiaTimeClassLabel(activeGame.timeClass, t)} ${formatMaiaTimeControlDisplay(activeGame.timeControl, t)} · Maia ${activeGame.maiaRating}`}
                </AppText>
              </View>
              <Button
                label={t("maiaPlay.action.resume")}
                size="compact"
                testID="maia-setup-resume"
                onPress={onResumeGame}
              />
            </View>
          </Section>
        ) : null}

        {isCompactLandscape ? (
          <Section style={styles.formCardCompactLandscape}>
            <View style={styles.compactColumnsRow}>
              <View style={styles.compactColumn}>
                {timeControlField}
                {modeField}
                {opponentRatingField}
              </View>
              <View style={[styles.compactColumn, styles.compactColumnRight]}>
                <View style={styles.compactColumnFields}>
                  {colorField}
                  {paceField}
                </View>
                {startButton}
              </View>
            </View>
          </Section>
        ) : (
          <>
            <Section style={styles.formCard}>
              {timeControlField}
              {modeField}
              {opponentRatingField}
              {colorField}
              {paceField}
            </Section>
            {startButton}
          </>
        )}
      </ScrollView>

      <MaiaTimeControlPickerModal
        ratingsByClass={ratingsByClass}
        value={preferences.timeControl}
        visible={timePickerOpen}
        onClose={() => setTimePickerOpen(false)}
        onSelect={updateTimeControl}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surface
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.screen,
    paddingVertical: theme.spacing.row,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center"
  },
  topBarCompactLandscape: {
    maxWidth: 740,
    paddingVertical: 6
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 68,
    minHeight: 36
  },
  topBarSpacer: {
    minWidth: 68
  },
  content: {
    paddingHorizontal: theme.spacing.screen,
    paddingBottom: 24,
    gap: theme.spacing.section,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center"
  },
  contentCompactLandscape: {
    maxWidth: 740,
    paddingBottom: 12,
    gap: 10
  },
  resumeCard: {
    padding: theme.spacing.screen
  },
  resumeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.row
  },
  resumeCopy: {
    flex: 1,
    gap: 2
  },
  formCard: {
    padding: theme.spacing.screen,
    gap: theme.spacing.section
  },
  formCardCompactLandscape: {
    padding: 14
  },
  compactColumnsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 16
  },
  compactColumn: {
    flex: 1,
    minWidth: 0,
    gap: 10
  },
  compactColumnRight: {
    justifyContent: "space-between"
  },
  compactColumnFields: {
    gap: 10
  },
  field: {
    gap: theme.spacing.inline
  },
  pickerPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: theme.spacing.screen,
    borderRadius: theme.shape.control,
    backgroundColor: theme.colors.surfaceSunken,
    borderWidth: 1,
    borderColor: theme.colors.border.default
  },
  controlCompact: {
    minHeight: 42
  },
  pickerPillLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.inline,
    flexShrink: 1
  },
  pickerPillRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  opponentStepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.screen,
    minHeight: 48,
    borderRadius: theme.shape.control,
    backgroundColor: theme.colors.surfaceSunken,
    borderWidth: 1,
    borderColor: theme.colors.border.default
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border.default
  }
}));
