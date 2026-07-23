export type MoveFeedbackCue = "move" | "capture";

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
