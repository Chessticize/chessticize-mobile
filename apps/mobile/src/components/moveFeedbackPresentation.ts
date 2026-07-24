export type {
  MoveFeedbackCue,
  MoveFeedbackPreferences
} from "../platform/moveFeedback.ts";

import type {
  MoveFeedbackCue,
  MoveFeedbackPreferences
} from "../platform/moveFeedback.ts";

export type MoveFeedbackPreviewResult = {
  haptics: "off" | "requested" | "visual-only";
  sound: "off" | "played" | "unavailable";
};

export type MoveFeedbackPreviewer = (
  cue: MoveFeedbackCue,
  preferences: MoveFeedbackPreferences
) => Promise<MoveFeedbackPreviewResult>;
