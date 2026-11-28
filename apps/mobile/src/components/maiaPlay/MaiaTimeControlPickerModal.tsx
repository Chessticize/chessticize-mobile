import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  MAIA_TIME_CLASSES,
  MAIA_TIME_CONTROL_PRESETS,
  classifyMaiaTimeControl,
  normalizeMaiaTimeControl,
  type MaiaRatingRecord,
  type MaiaTimeClass,
  type MaiaTimeControl
} from "../../../../../packages/core/src/index.ts";
import { useTranslation } from "../../i18n/index.ts";
import { makeStyles, useTheme } from "../../theme/index.ts";
import { AppModal } from "../AppModal.tsx";
import { SafeAreaModalBackdrop } from "../SafeAreaModalBackdrop.tsx";
import { AppText, Badge, Button, Icon, Section } from "../ui/index.tsx";
import { formatMaiaTimeControlDisplay, maiaTimeClassLabel } from "./maiaPlayPresentation.ts";

export interface MaiaTimeControlPickerModalProps {
  visible: boolean;
  value: MaiaTimeControl;
  ratingsByClass: Readonly<Record<MaiaTimeClass, MaiaRatingRecord>>;
  onSelect: (next: MaiaTimeControl) => void;
  onClose: () => void;
}

function sameTimeControl(a: MaiaTimeControl, b: MaiaTimeControl): boolean {
  if (a.unlimited && b.unlimited) {
    return true;
  }
  return (
    a.unlimited === b.unlimited &&
    a.initialMinutes === b.initialMinutes &&
    a.incrementSeconds === b.incrementSeconds
  );
}

export function MaiaTimeControlPickerModal({
  visible,
  value,
  ratingsByClass,
  onSelect,
  onClose
}: MaiaTimeControlPickerModalProps): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  const [customExpanded, setCustomExpanded] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(() =>
    value.unlimited ? 10 : Math.max(3, value.initialMinutes)
  );
  const [customIncrement, setCustomIncrement] = useState(() =>
    value.unlimited ? 0 : value.incrementSeconds
  );

  const normalizedCustom = useMemo(
    () =>
      normalizeMaiaTimeControl({
        initialMinutes: customMinutes,
        incrementSeconds: customIncrement,
        unlimited: false
      }),
    [customMinutes, customIncrement]
  );
  const customClass = classifyMaiaTimeControl(normalizedCustom);

  return (
    <AppModal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaModalBackdrop style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet} testID="maia-time-control-modal">
          <View style={styles.header}>
            <View style={styles.headerText}>
              <AppText variant="title">{t("maiaPlay.timeControl.title")}</AppText>
              <AppText tone="secondary" variant="footnote">
                {t("maiaPlay.timeControl.subtitle")}
              </AppText>
            </View>
            <Pressable
              accessibilityLabel={t("common.close")}
              accessibilityRole="button"
              hitSlop={10}
              style={styles.closeButton}
              testID="maia-time-control-close"
              onPress={onClose}
            >
              <Icon color={theme.colors.text.secondary} name="close" size={18} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
          >
            <Section style={styles.presetsCard}>
              {MAIA_TIME_CLASSES.map((tc) => {
                const presets = MAIA_TIME_CONTROL_PRESETS.filter((p) => p.timeClass === tc);
                const rating = ratingsByClass[tc];
                return (
                  <View key={tc} style={styles.group}>
                    <View style={styles.groupHeader}>
                      <AppText variant="headline">{maiaTimeClassLabel(tc, t)}</AppText>
                      <AppText tone="secondary" variant="footnote">
                        {rating.rating}
                      </AppText>
                    </View>
                    <View style={styles.pillRow}>
                      {presets.map((preset) => {
                        const selected = sameTimeControl(value, preset.control);
                        return (
                          <Pressable
                            key={preset.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            style={[styles.pill, selected ? styles.pillSelected : null]}
                            testID={`maia-tc-${preset.id}`}
                            onPress={() => {
                              onSelect(preset.control);
                              onClose();
                            }}
                          >
                            <AppText
                              adjustsFontSizeToFit
                              minimumFontScale={0.78}
                              numberOfLines={1}
                              style={selected ? styles.pillTextSelected : undefined}
                              variant="subheadline"
                            >
                              {formatMaiaTimeControlDisplay(preset.control, t)}
                            </AppText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </Section>

            <Section style={styles.customCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: customExpanded }}
                style={styles.customHeader}
                testID="maia-tc-custom-toggle"
                onPress={() => setCustomExpanded((prev) => !prev)}
              >
                <View style={styles.customHeaderLeft}>
                  <Icon color={theme.colors.text.secondary} name="custom" size={18} />
                  <AppText variant="headline">{t("maiaPlay.timeControl.custom")}</AppText>
                </View>
                <Icon
                  color={theme.colors.text.secondary}
                  name={customExpanded ? "chevronUp" : "chevronDown"}
                  size={18}
                />
              </Pressable>

              {customExpanded ? (
                <View style={styles.customBody} testID="maia-tc-custom-body">
                  <View style={styles.stepperRow}>
                    <AppText variant="subheadline">{t("maiaPlay.timeControl.minutesPerSide")}</AppText>
                    <View style={styles.stepperControls}>
                      <Pressable
                        accessibilityRole="button"
                        style={styles.stepBtn}
                        testID="maia-tc-custom-min-dec"
                        onPress={() => setCustomMinutes((m) => Math.max(1, m - 1))}
                      >
                        <Icon color={theme.colors.text.primary} name="remove" size={16} />
                      </Pressable>
                      <AppText style={styles.stepValue} variant="headline">
                        {normalizedCustom.initialMinutes}
                      </AppText>
                      <Pressable
                        accessibilityRole="button"
                        style={styles.stepBtn}
                        testID="maia-tc-custom-min-inc"
                        onPress={() => setCustomMinutes((m) => Math.min(180, m + 1))}
                      >
                        <Icon color={theme.colors.text.primary} name="add" size={16} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.stepperRow}>
                    <AppText variant="subheadline">{t("maiaPlay.timeControl.incrementSeconds")}</AppText>
                    <View style={styles.stepperControls}>
                      <Pressable
                        accessibilityRole="button"
                        style={styles.stepBtn}
                        testID="maia-tc-custom-inc-dec"
                        onPress={() => setCustomIncrement((s) => Math.max(0, s - 1))}
                      >
                        <Icon color={theme.colors.text.primary} name="remove" size={16} />
                      </Pressable>
                      <AppText style={styles.stepValue} variant="headline">
                        {normalizedCustom.incrementSeconds}
                      </AppText>
                      <Pressable
                        accessibilityRole="button"
                        style={styles.stepBtn}
                        testID="maia-tc-custom-inc-inc"
                        onPress={() => setCustomIncrement((s) => Math.min(60, s + 1))}
                      >
                        <Icon color={theme.colors.text.primary} name="add" size={16} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.customFooter}>
                    <Badge
                      label={`${maiaTimeClassLabel(customClass, t)} · ${normalizedCustom.initialMinutes}+${normalizedCustom.incrementSeconds}`}
                      tone="accent"
                    />
                    <Button
                      label={t("maiaPlay.timeControl.applyCustom")}
                      size="compact"
                      testID="maia-tc-custom-apply"
                      onPress={() => {
                        onSelect(normalizedCustom);
                        onClose();
                      }}
                    />
                  </View>
                </View>
              ) : null}
            </Section>
          </ScrollView>
        </View>
      </SafeAreaModalBackdrop>
    </AppModal>
  );
}

const useStyles = makeStyles((theme) => ({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing.screen,
    backgroundColor: theme.colors.scrim
  },
  sheet: {
    maxHeight: "88%",
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    borderRadius: theme.shape.sheet,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border.default,
    padding: theme.spacing.screen,
    gap: theme.spacing.row
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.row
  },
  headerText: {
    flex: 1,
    gap: 2
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceRaised
  },
  scroll: {
    flexGrow: 0
  },
  scrollContent: {
    gap: theme.spacing.row
  },
  presetsCard: {
    padding: theme.spacing.screen,
    gap: theme.spacing.section
  },
  group: {
    gap: theme.spacing.inline
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between"
  },
  pillRow: {
    flexDirection: "row",
    gap: theme.spacing.inline
  },
  pill: {
    flex: 1,
    minHeight: 42,
    borderRadius: theme.shape.capsule,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceSunken,
    borderWidth: 1,
    borderColor: theme.colors.border.default
  },
  pillSelected: {
    backgroundColor: theme.colors.accent.s100,
    borderColor: theme.colors.accent.s600
  },
  pillTextSelected: {
    color: theme.colors.accent.s600,
    fontWeight: "700"
  },
  customCard: {
    padding: theme.spacing.screen,
    gap: theme.spacing.row
  },
  customHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 32
  },
  customHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.inline
  },
  customBody: {
    gap: theme.spacing.row,
    paddingTop: theme.spacing.inline
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.row
  },
  stepperControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.inline
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceSunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border.default
  },
  stepValue: {
    minWidth: 36,
    textAlign: "center"
  },
  customFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: theme.spacing.inline
  }
}));
