import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { makeStyles } from "../theme/index.ts";
import { useUiHaptics } from "../platform/uiHaptics.ts";
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

const CUES: ReadonlyArray<{
  cue: MoveFeedbackCue;
  detail: string;
  label: string;
}> = [
  { cue: "move", detail: "Light board cue", label: "Move" },
  { cue: "capture", detail: "Deeper board cue", label: "Capture" }
];

export function MoveFeedbackSettingsSection({
  onPreferencesChange,
  onPreview,
  preferences
}: {
  onPreferencesChange: (preferences: MoveFeedbackPreferences) => void;
  onPreview?: MoveFeedbackPreviewer;
  preferences: MoveFeedbackPreferences;
}): React.JSX.Element {
  const styles = useStyles();
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);

  async function preview(cue: MoveFeedbackCue): Promise<void> {
    if (!onPreview) {
      return;
    }
    setPreviewMessage(`Previewing ${cue} feedback…`);
    try {
      const result = await onPreview(cue, preferences);
      setPreviewMessage(previewResultMessage(cue, result));
    } catch {
      setPreviewMessage("Preview is unavailable in this browser.");
    }
  }

  return (
    <View testID="settings-move-feedback-content">
      <FeedbackToggleRow
        detail="Brief board sounds for moves and captures."
        enabled={preferences.soundEnabled}
        label="Sound effects"
        controlTestID="settings-move-sound-toggle"
        onChange={(soundEnabled) => {
          onPreferencesChange({ ...preferences, soundEnabled });
          setPreviewMessage(soundEnabled ? "Sound effects on" : "Sound effects off");
        }}
      />
      <View style={styles.separator} />
      <FeedbackToggleRow
        detail="Touch feedback for moves, captures, and controls."
        enabled={preferences.hapticsEnabled}
        label="Haptic feedback"
        controlTestID="settings-move-haptics-toggle"
        onChange={(hapticsEnabled) => {
          onPreferencesChange({ ...preferences, hapticsEnabled });
          setPreviewMessage(hapticsEnabled ? "Haptic feedback on" : "Haptic feedback off");
        }}
      />
      {onPreview ? <View style={styles.separator} /> : null}
      {onPreview ? (
        <View style={styles.previewBlock} testID="settings-move-feedback-previews">
          <View style={styles.previewHeading}>
            <Text style={styles.rowLabel}>Try feedback</Text>
            <Text style={styles.helperText}>
              Web demo only. Preview the proposed move and capture sounds;
              haptics require the native app. Check this tab and device volume
              if you do not hear them.
            </Text>
          </View>
          <View style={styles.previewButtons}>
            {CUES.map(({ cue, detail, label }) => (
              <Pressable
                key={cue}
                accessibilityRole="button"
                accessibilityLabel={`Preview ${cue} feedback`}
                testID={`settings-move-feedback-preview-${cue}`}
                style={styles.previewButton}
                onPress={() => {
                  void preview(cue);
                }}
              >
                <Text style={styles.previewButtonLabel}>{label}</Text>
                <Text style={styles.previewButtonDetail}>{detail}</Text>
              </Pressable>
            ))}
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
  result: MoveFeedbackPreviewResult
): string {
  const sound = result.sound === "played"
    ? "browser sound requested"
    : result.sound === "off"
      ? "sound off"
      : "sound unavailable";
  const haptics = result.haptics === "off"
      ? "haptics off"
      : "haptics require the native app";
  return `${capitalize(cue)} preview: ${sound}; ${haptics}.`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
