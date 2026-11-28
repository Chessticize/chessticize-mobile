import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  MAIA_MAX_OPPONENT_RATING,
  MAIA_MIN_RATING,
  MAIA_OPPONENT_RATING_STEP,
  MAIA_STARTING_RATING_PRESETS,
  MAIA_TIME_CLASSES,
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
import { AppText, Badge, Button, Icon, Section, SegmentedControl } from "../ui/index.tsx";
import { formatMaiaTimeControlDisplay, maiaTimeClassLabel } from "./maiaPlayPresentation.ts";
import { MaiaTimeControlPickerModal } from "./MaiaTimeControlPickerModal.tsx";

export interface MaiaPlaySetupViewProps {
  preferences: MaiaSetupPreferences;
  ratingsByClass: Readonly<Record<MaiaTimeClass, MaiaRatingRecord>>;
  activeGame?: MaiaGameState | null;
  onPatchPreferences: (patch: Partial<MaiaSetupPreferences>) => void;
  onChangeInitialRating: (timeClass: MaiaTimeClass, rating: number) => void;
  onStartGame: () => void;
  onResumeGame: () => void;
  onBack: () => void;
}

export function MaiaPlaySetupView({
  preferences,
  ratingsByClass,
  activeGame,
  onPatchPreferences,
  onChangeInitialRating,
  onStartGame,
  onResumeGame,
  onBack
}: MaiaPlaySetupViewProps): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  const selectedTimeClass = classifyMaiaTimeControl(preferences.timeControl);
  const currentRating = ratingsByClass[selectedTimeClass];
  const hasResumable = activeGame != null && activeGame.status === "playing";

  const updateTimeControl = (timeControl: MaiaTimeControl) => {
    onPatchPreferences({ timeControl });
  };

  return (
    <View style={styles.root} testID="maia-play-setup">
      <View style={styles.topBar}>
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
        contentContainerStyle={styles.content}
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

        <View style={styles.ratingStrip} testID="maia-rating-strip">
          {MAIA_TIME_CLASSES.map((tc) => {
            const rec = ratingsByClass[tc];
            const active = tc === selectedTimeClass;
            return (
              <View
                key={tc}
                style={[styles.ratingTile, active ? styles.ratingTileActive : null]}
                testID={`maia-rating-tile-${tc}`}
              >
                <AppText
                  tone={active ? "accent" : "secondary"}
                  variant="caption"
                >
                  {maiaTimeClassLabel(tc, t)}
                </AppText>
                <AppText variant="numeral">{rec.rating}</AppText>
                <AppText tone="secondary" variant="caption">
                  {rec.games > 0
                    ? `${rec.wins}-${rec.losses}-${rec.draws}`
                    : t("maiaPlay.provisional")}
                </AppText>
              </View>
            );
          })}
        </View>

        <Section style={styles.formCard}>
          <View style={styles.field}>
            <AppText tone="secondary" variant="caption">
              {t("maiaPlay.setup.timeControl")}
            </AppText>
            <Pressable
              accessibilityRole="button"
              style={styles.pickerPill}
              testID="maia-setup-time-control"
              onPress={() => setTimePickerOpen(true)}
            >
              <View style={styles.pickerPillLeft}>
                <Icon color={theme.colors.accent.s600} name="clock" size={18} />
                <AppText variant="headline">
                  {`${maiaTimeClassLabel(selectedTimeClass, t)} · ${formatMaiaTimeControlDisplay(preferences.timeControl, t)}`}
                </AppText>
              </View>
              <Icon color={theme.colors.text.secondary} name="chevronDown" size={18} />
            </Pressable>
          </View>

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

          <View style={styles.field}>
            <View style={styles.fieldHeader}>
              <AppText tone="secondary" variant="caption">
                {t("maiaPlay.setup.opponentRating")}
              </AppText>
              {preferences.rated ? (
                <Badge
                  label={t("maiaPlay.setup.matchesYours", { rating: currentRating.rating })}
                  tone="accent"
                />
              ) : null}
            </View>

            {preferences.rated ? (
              currentRating.games === 0 ? (
                <View style={styles.initialRatingRow} testID="maia-initial-rating-presets">
                  {MAIA_STARTING_RATING_PRESETS.map((presetRating) => {
                    const selected = currentRating.rating === presetRating;
                    return (
                      <Pressable
                        key={presetRating}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={[
                          styles.ratingChip,
                          selected ? styles.ratingChipSelected : null
                        ]}
                        testID={`maia-start-rating-${presetRating}`}
                        onPress={() => onChangeInitialRating(selectedTimeClass, presetRating)}
                      >
                        <AppText
                          style={selected ? styles.ratingChipTextSelected : undefined}
                          variant="footnote"
                        >
                          {presetRating}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null
            ) : (
              <View style={styles.opponentStepper} testID="maia-opponent-rating-stepper">
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
            )}
          </View>

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
        </Section>

        <Button
          label={t("maiaPlay.action.startGame")}
          stretch
          testID="maia-start-game"
          onPress={onStartGame}
        />
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
    paddingBottom: 32,
    gap: theme.spacing.section,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center"
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
  ratingStrip: {
    flexDirection: "row",
    gap: theme.spacing.inline
  },
  ratingTile: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: theme.spacing.row,
    paddingHorizontal: theme.spacing.inline,
    borderRadius: theme.shape.card,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.border.default
  },
  ratingTileActive: {
    borderColor: theme.colors.accent.s600,
    backgroundColor: theme.colors.accent.s100
  },
  formCard: {
    padding: theme.spacing.screen,
    gap: theme.spacing.section
  },
  field: {
    gap: theme.spacing.inline
  },
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.inline
  },
  pickerPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: theme.spacing.screen,
    borderRadius: theme.shape.control,
    backgroundColor: theme.colors.surfaceSunken,
    borderWidth: 1,
    borderColor: theme.colors.border.default
  },
  pickerPillLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.inline
  },
  initialRatingRow: {
    flexDirection: "row",
    gap: theme.spacing.inline
  },
  ratingChip: {
    flex: 1,
    minHeight: 36,
    borderRadius: theme.shape.capsule,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceSunken,
    borderWidth: 1,
    borderColor: theme.colors.border.default
  },
  ratingChipSelected: {
    backgroundColor: theme.colors.accent.s100,
    borderColor: theme.colors.accent.s600
  },
  ratingChipTextSelected: {
    color: theme.colors.accent.s600,
    fontWeight: "700"
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
