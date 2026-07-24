import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
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
  preferences,
  wide = false
}: {
  onPreferencesChange: (preferences: MoveFeedbackPreferences) => void;
  onPreview?: MoveFeedbackPreviewer;
  preferences: MoveFeedbackPreferences;
  wide?: boolean;
}): React.JSX.Element {
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
    <View
      style={[styles.section, wide ? styles.sectionWide : null]}
      testID="settings-move-feedback-section"
    >
      <Text style={styles.sectionLabel}>Move Feedback</Text>
      <View style={styles.card}>
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
    color: "#111827",
    fontSize: 15,
    fontWeight: "800"
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
  }
});
