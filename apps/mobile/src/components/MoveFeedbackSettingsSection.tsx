import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { makeStyles } from "../theme/index.ts";
import { useUiHaptics } from "../platform/uiHaptics.ts";
import { useTranslation, type TranslateFn } from "../i18n/index.ts";
import type {
  MoveFeedbackCue,
  MoveFeedbackPreferences,
  MoveFeedbackPreviewer,
  MoveFeedbackPreviewResult
} from "./moveFeedbackPresentation.ts";

export type {
  MoveFeedbackCue,
  MoveFeedbackPreferences,
  MoveFeedbackPreviewer,
  MoveFeedbackPreviewResult
} from "./moveFeedbackPresentation.ts";

const CUE_KEYS: ReadonlyArray<MoveFeedbackCue> = ["move", "capture"];

export function MoveFeedbackSettingsSection({
  onPreferencesChange,
  onPreview,
  preferences
}: {
  onPreferencesChange: (preferences: MoveFeedbackPreferences) => void;
  onPreview?: MoveFeedbackPreviewer;
  preferences: MoveFeedbackPreferences;
}): React.JSX.Element {
  const { t } = useTranslation();
  const styles = useStyles();
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);

  function cueLabel(cue: MoveFeedbackCue): string {
    return cue === "capture"
      ? t("settings.feedback.previewCapture")
      : t("settings.feedback.previewMove");
  }

  function cueDetail(cue: MoveFeedbackCue): string {
    return cue === "capture"
      ? t("settings.feedback.cueCaptureDetail")
      : t("settings.feedback.cueMoveDetail");
  }

  async function preview(cue: MoveFeedbackCue): Promise<void> {
    if (!onPreview) {
      return;
    }
    setPreviewMessage(t("settings.feedback.previewing", { cue: cueLabel(cue).toLowerCase() }));
    try {
      const result = await onPreview(cue, preferences);
      setPreviewMessage(previewResultMessage(cue, result, t));
    } catch {
      setPreviewMessage(t("settings.feedback.previewUnavailableBrowser"));
    }
  }

  return (
    <View testID="settings-move-feedback-content">
      <FeedbackToggleRow
        detail={t("settings.feedback.soundEffectsDetail")}
        enabled={preferences.soundEnabled}
        label={t("settings.feedback.soundEffects")}
        controlTestID="settings-move-sound-toggle"
        onChange={(soundEnabled) => {
          onPreferencesChange({ ...preferences, soundEnabled });
          setPreviewMessage(soundEnabled
            ? t("settings.feedback.soundEffectsOn")
            : t("settings.feedback.soundEffectsOff"));
        }}
      />
      <View style={styles.separator} />
      <FeedbackToggleRow
        detail={t("settings.feedback.hapticFeedbackDetail")}
        enabled={preferences.hapticsEnabled}
        label={t("settings.feedback.hapticFeedback")}
        controlTestID="settings-move-haptics-toggle"
        onChange={(hapticsEnabled) => {
          onPreferencesChange({ ...preferences, hapticsEnabled });
          setPreviewMessage(hapticsEnabled
            ? t("settings.feedback.hapticFeedbackOn")
            : t("settings.feedback.hapticFeedbackOff"));
        }}
      />
      {onPreview ? <View style={styles.separator} /> : null}
      {onPreview ? (
        <View style={styles.previewBlock} testID="settings-move-feedback-previews">
          <View style={styles.previewHeading}>
            <Text style={styles.rowLabel}>{t("settings.feedback.tryFeedback")}</Text>
            <Text style={styles.helperText}>
              {t("settings.feedback.tryFeedbackDetail")}
            </Text>
          </View>
          <View style={styles.previewButtons}>
            {CUE_KEYS.map((cue) => {
              const label = cueLabel(cue);
              return (
                <Pressable
                  key={cue}
                  accessibilityRole="button"
                  accessibilityLabel={t("settings.feedback.previewCueA11y", { cue: label.toLowerCase() })}
                  testID={`settings-move-feedback-preview-${cue}`}
                  style={styles.previewButton}
                  onPress={() => {
                    void preview(cue);
                  }}
                >
                  <Text style={styles.previewButtonLabel}>{label}</Text>
                  <Text style={styles.previewButtonDetail}>{cueDetail(cue)}</Text>
                </Pressable>
              );
            })}
          </View>
          {previewMessage ? (
            <Text
              accessibilityLiveRegion="polite"
              style={styles.previewStatus}
              testID="settings-move-feedback-preview-status"
            >
              {previewMessage}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function FeedbackToggleRow({
  controlTestID,
  detail,
  enabled,
  label,
  onChange
}: {
  controlTestID: string;
  detail: string;
  enabled: boolean;
  label: string;
  onChange: (enabled: boolean) => void;
}): React.JSX.Element {
  const styles = useStyles();
  const uiHaptics = useUiHaptics();
  return (
    <View style={styles.toggleRow}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.helperText}>{detail}</Text>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: enabled }}
        hitSlop={7}
        testID={controlTestID}
        style={[styles.switchTrack, enabled ? styles.switchTrackEnabled : null]}
        onPress={() => {
          onChange(!enabled);
          // After the change, so turning haptics on confirms and off stays silent.
          uiHaptics("selection");
        }}
      >
        <View style={[styles.switchThumb, enabled ? styles.switchThumbEnabled : null]} />
      </Pressable>
    </View>
  );
}

function previewResultMessage(
  cue: MoveFeedbackCue,
  result: MoveFeedbackPreviewResult,
  t: TranslateFn
): string {
  const sound = result.sound === "played"
    ? t("settings.feedback.browserSoundRequested")
    : result.sound === "off"
      ? t("settings.feedback.soundOff")
      : t("settings.feedback.soundUnavailable");
  const haptics = result.haptics === "off"
    ? t("settings.feedback.hapticsOff")
    : t("settings.feedback.hapticsNativeRequired");
  const cueName = cue === "capture"
    ? t("settings.feedback.previewCapture")
    : t("settings.feedback.previewMove");
  return t("settings.feedback.previewResult", { cue: cueName, sound, haptics });
}

const useStyles = makeStyles((theme) => ({
  separator: {
    backgroundColor: theme.colors.border.default,
    height: StyleSheet.hairlineWidth
  },
  toggleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row,
    justifyContent: "space-between",
    minHeight: theme.metrics.rowMinHeight,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  rowCopy: {
    flex: 1,
    flexShrink: 1,
    gap: theme.spacing.inline / 2,
    minWidth: 0
  },
  rowLabel: {
    ...theme.typography.body,
    color: theme.colors.text.primary
  },
  helperText: {
    ...theme.typography.footnote,
    color: theme.colors.text.secondary
  },
  switchTrack: {
    backgroundColor: theme.colors.fillMuted,
    borderColor: theme.colors.border.heavy,
    borderRadius: theme.shape.capsule,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    paddingHorizontal: 2,
    width: 50
  },
  switchTrackEnabled: {
    backgroundColor: theme.colors.accent.fill,
    borderColor: theme.colors.accent.s600
  },
  switchThumb: {
    backgroundColor: theme.colors.thumb,
    borderRadius: theme.shape.capsule,
    height: 24,
    ...theme.elevation.low,
    width: 24
  },
  switchThumbEnabled: {
    alignSelf: "flex-end"
  },
  previewBlock: {
    gap: theme.spacing.row,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  previewHeading: {
    gap: theme.spacing.inline / 2
  },
  previewButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.group
  },
  previewButton: {
    backgroundColor: theme.colors.accent.s100,
    borderRadius: theme.shape.control,
    gap: 2,
    minHeight: theme.metrics.minTarget,
    minWidth: 96,
    paddingHorizontal: theme.spacing.row,
    paddingVertical: theme.spacing.group
  },
  previewButtonLabel: {
    ...theme.typography.footnote,
    color: theme.colors.accent.s600,
    fontWeight: theme.typography.headline.fontWeight
  },
  previewButtonDetail: {
    ...theme.typography.caption,
    color: theme.colors.text.secondary
  },
  previewStatus: {
    ...theme.typography.footnote,
    color: theme.colors.text.secondary
  },
}));
