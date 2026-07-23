import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

export type MoveFeedbackCue = "move" | "capture" | "success" | "mistake";

export type MoveFeedbackPreferences = {
  hapticsEnabled: boolean;
  soundEnabled: boolean;
};

export type MoveFeedbackPreviewResult = {
  haptics: "off" | "requested" | "visual-only";
  sound: "off" | "played" | "unavailable";
};

export type MoveFeedbackPreviewer = (
  cue: MoveFeedbackCue,
  preferences: MoveFeedbackPreferences
) => Promise<MoveFeedbackPreviewResult>;

const CUES: ReadonlyArray<{
  cue: MoveFeedbackCue;
  detail: string;
  label: string;
}> = [
  { cue: "move", detail: "Light click", label: "Move" },
  { cue: "capture", detail: "Deep click", label: "Capture" },
  { cue: "success", detail: "Rising cue", label: "Success" },
  { cue: "mistake", detail: "Low cue", label: "Mistake" }
];

export function MoveFeedbackSettingsSection({
  onPreferencesChange,
  onPreview,
  preferences,
  wide = false
}: {
  onPreferencesChange: (preferences: MoveFeedbackPreferences) => void;
  onPreview: MoveFeedbackPreviewer;
  preferences: MoveFeedbackPreferences;
  wide?: boolean;
}): React.JSX.Element {
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);

  async function preview(cue: MoveFeedbackCue): Promise<void> {
    setPreviewMessage(`Previewing ${cue} feedback…`);
    try {
      const result = await onPreview(cue, preferences);
      setPreviewMessage(previewResultMessage(cue, result));
    } catch {
      setPreviewMessage("Preview is unavailable in this browser.");
    }
  }

  return (
    <View
      style={[styles.section, wide ? styles.sectionWide : null]}
      testID="settings-move-feedback-section"
    >
      <Text style={styles.sectionLabel}>Move Feedback</Text>
      <View style={styles.card}>
        <FeedbackToggleRow
          detail="Brief board sounds for moves, captures, and puzzle results."
          enabled={preferences.soundEnabled}
          label="Sound effects"
          controlTestID="settings-move-sound-toggle"
          onChange={(soundEnabled) => {
            onPreferencesChange({ ...preferences, soundEnabled });
            setPreviewMessage(soundEnabled ? "Sound effects on" : "Sound effects off");
          }}
        />
        <FeedbackToggleRow
          detail="Light touch feedback for your moves, success, and mistakes."
          enabled={preferences.hapticsEnabled}
          label="Haptic feedback"
          controlTestID="settings-move-haptics-toggle"
          onChange={(hapticsEnabled) => {
            onPreferencesChange({ ...preferences, hapticsEnabled });
            setPreviewMessage(hapticsEnabled ? "Haptic feedback on" : "Haptic feedback off");
          }}
        />
        <View style={styles.previewBlock} testID="settings-move-feedback-previews">
          <View style={styles.previewHeading}>
            <Text style={styles.rowLabel}>Try feedback</Text>
            <Text style={styles.helperText}>
              Synthetic Lab samples only. They cannot verify Silent mode,
              Do Not Disturb, Focus, or native haptic feel.
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
        <View style={styles.deviceNote} testID="settings-move-feedback-device-note">
          <Text style={styles.deviceNoteTitle}>Also follows your device settings</Text>
          <Text style={styles.helperText}>
            Silent mode, system volume, and system haptic preferences can
            suppress feedback. Do Not Disturb and Focus remain under operating
            system control; Chessticize will not request permission to override them.
          </Text>
        </View>
      </View>
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
    ? "sound played"
    : result.sound === "off"
      ? "sound off"
      : "sound unavailable";
  const haptics = result.haptics === "requested"
    ? "browser vibration requested"
    : result.haptics === "off"
      ? "haptics off"
      : "visual haptic simulation only";
  return `${capitalize(cue)} preview: ${sound}; ${haptics}.`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  section: {
    gap: 8
  },
  sectionWide: {
    flexBasis: "48%",
    flexGrow: 1,
    minWidth: 300
  },
  sectionLabel: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden"
  },
  toggleRow: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 66,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  rowCopy: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  rowLabel: {
    color: "#1E293B",
    fontSize: 14,
    fontWeight: "800"
  },
  helperText: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 17
  },
  switchTrack: {
    backgroundColor: "#CBD5E1",
    borderColor: "#94A3B8",
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    paddingHorizontal: 2,
    width: 50
  },
  switchTrackEnabled: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB"
  },
  switchThumb: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    height: 24,
    shadowColor: "#0F172A",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    width: 24
  },
  switchThumbEnabled: {
    alignSelf: "flex-end"
  },
  previewBlock: {
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  previewHeading: {
    gap: 2
  },
  previewButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  previewButton: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    gap: 1,
    minHeight: 48,
    minWidth: 96,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  previewButtonLabel: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "900"
  },
  previewButtonDetail: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700"
  },
  previewStatus: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  deviceNote: {
    backgroundColor: "#F8FAFC",
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  deviceNoteTitle: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900"
  }
});
