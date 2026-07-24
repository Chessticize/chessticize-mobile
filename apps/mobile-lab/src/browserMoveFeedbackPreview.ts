import type {
  MoveFeedbackCue,
  MoveFeedbackPreferences,
  MoveFeedbackPreviewResult
} from "../../mobile/src/components/moveFeedbackPresentation.ts";

const AUDIO_ASSET_URLS: Readonly<Record<MoveFeedbackCue, string>> = {
  move: "./audio/issue-247/freesound-546119-piece-placement.mp3",
  capture: "./audio/issue-247/freesound-546120-piece-capture.mp3"
};

const AUDIO_PLAYBACK_VOLUMES: Readonly<Record<MoveFeedbackCue, number>> = {
  move: 1,
  capture: 0.4
};

type AudioLike = {
  currentTime: number;
  play: () => Promise<void> | void;
  preload: string;
  volume: number;
};

type AudioConstructor = new (source?: string) => AudioLike;

type BrowserAudioGlobals = {
  Audio?: AudioConstructor;
};

export async function previewBrowserMoveFeedback(
  cue: MoveFeedbackCue,
  preferences: MoveFeedbackPreferences
): Promise<MoveFeedbackPreviewResult> {
  const [sound, haptics] = await Promise.all([
    preferences.soundEnabled ? playRecordedCue(cue) : Promise.resolve("off" as const),
    Promise.resolve(preferences.hapticsEnabled ? "visual-only" as const : "off" as const)
  ]);
  return { haptics, sound };
}

async function playRecordedCue(
  cue: MoveFeedbackCue
): Promise<MoveFeedbackPreviewResult["sound"]> {
  const AudioClass = (globalThis as unknown as BrowserAudioGlobals).Audio;
  if (!AudioClass) {
    return "unavailable";
  }

  try {
    const audio = new AudioClass(AUDIO_ASSET_URLS[cue]);
    audio.preload = "auto";
    audio.currentTime = 0;
    audio.volume = AUDIO_PLAYBACK_VOLUMES[cue];
    await Promise.resolve(audio.play());
    return "played";
  } catch {
    return "unavailable";
  }
}
