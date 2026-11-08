import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { makeStyles } from "../theme/index.ts";
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
      <FeedbackToggleRow
        detail="Light touch feedback for moves and captures."
        enabled={preferences.hapticsEnabled}
        label="Haptic feedback"
        controlTestID="settings-move-haptics-toggle"
        onChange={(hapticsEnabled) => {
          onPreferencesChange({ ...preferences, hapticsEnabled });
          setPreviewMessage(hapticsEnabled ? "Haptic feedback on" : "Haptic feedback off");
        }}
      />
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
        testID={controlTestID}
        style={[styles.switchTrack, enabled ? styles.switchTrackEnabled : null]}
        onPress={() => onChange(!enabled)}
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
  toggleRow: {
    alignItems: "center",
    borderBottomColor: theme.colors.border.default,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: theme.space[12],
    justifyContent: "space-between",
    minHeight: 66,
    paddingHorizontal: theme.space[12],
    paddingVertical: theme.space[10]
  },
  rowCopy: {
    flex: 1,
    flexShrink: 1,
    gap: theme.space[2],
    minWidth: 0
  },
  rowLabel: {
    color: theme.colors.text.heading,
    fontSize: theme.fontSize[14],
    fontWeight: theme.fontWeight.heavy
  },
  helperText: {
    color: theme.colors.text.tertiary,
    fontSize: theme.fontSize[12],
    lineHeight: 17
  },
  switchTrack: {
    backgroundColor: theme.colors.fillMuted,
    borderColor: theme.colors.border.heavy,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    paddingHorizontal: theme.space[2],
    width: 50
  },
  switchTrackEnabled: {
    backgroundColor: theme.colors.accent.fill,
    borderColor: theme.colors.accent.s600
  },
  switchThumb: {
    backgroundColor: theme.colors.thumb,
    borderRadius: theme.radius.pill,
    height: 24,
    ...theme.elevation.low,
    width: 24
  },
  switchThumbEnabled: {
    alignSelf: "flex-end"
  },
  previewBlock: {
    borderBottomColor: theme.colors.border.default,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: theme.space[10],
    paddingHorizontal: theme.space[12],
    paddingVertical: theme.space[12]
  },
  previewHeading: {
    gap: theme.space[2]
  },
  previewButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.space[8]
  },
  previewButton: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: theme.radius[8],
    borderWidth: 1,
    gap: theme.space[1],
    minHeight: 48,
    minWidth: 96,
    paddingHorizontal: theme.space[10],
    paddingVertical: theme.space[8]
  },
  previewButtonLabel: {
    color: theme.colors.accent.s700,
    fontSize: theme.fontSize[12],
    fontWeight: theme.fontWeight.black
  },
  previewButtonDetail: {
    color: theme.colors.text.tertiary,
    fontSize: theme.fontSize[11],
    fontWeight: theme.fontWeight.bold
  },
  previewStatus: {
    color: theme.colors.text.strong,
    fontSize: theme.fontSize[12],
    fontWeight: theme.fontWeight.bold,
    lineHeight: 17
  }
}));
