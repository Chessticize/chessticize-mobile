import type {
  MoveFeedbackCue,
  MoveFeedbackPreferences,
  MoveFeedbackPreviewResult
} from "../../mobile/src/components/MoveFeedbackSettingsSection.tsx";

type AudioParamLike = {
  value: number;
  setValueAtTime: (value: number, startTime: number) => void;
  exponentialRampToValueAtTime: (value: number, endTime: number) => void;
};

type AudioNodeLike = {
  connect: (destination: unknown) => unknown;
};

type AudioContextLike = {
  close: () => Promise<void>;
  createBiquadFilter: () => AudioNodeLike & {
    frequency: { value: number };
    Q: { value: number };
    type: string;
  };
  createBuffer: (
    numberOfChannels: number,
    length: number,
    sampleRate: number
  ) => { getChannelData: (channel: number) => Float32Array };
  createBufferSource: () => AudioNodeLike & {
    buffer: unknown;
    start: () => void;
  };
  createGain: () => AudioNodeLike & { gain: AudioParamLike };
  createOscillator: () => AudioNodeLike & {
    frequency: AudioParamLike;
    start: (when?: number) => void;
    stop: (when?: number) => void;
    type: string;
  };
  currentTime: number;
  destination: unknown;
  resume: () => Promise<void>;
  sampleRate: number;
};

type AudioContextConstructor = new () => AudioContextLike;

type BrowserAudioGlobals = {
  AudioContext?: AudioContextConstructor;
  navigator?: {
    vibrate?: (pattern: number | number[]) => boolean;
  };
  webkitAudioContext?: AudioContextConstructor;
};

const HAPTIC_PATTERNS: Record<MoveFeedbackCue, number | number[]> = {
  move: 18,
  capture: 30,
  success: [22, 34, 34],
  mistake: [42, 28, 42]
};

export async function previewBrowserMoveFeedback(
  cue: MoveFeedbackCue,
  preferences: MoveFeedbackPreferences
): Promise<MoveFeedbackPreviewResult> {
  const [sound, haptics] = await Promise.all([
    preferences.soundEnabled ? playSyntheticCue(cue) : Promise.resolve("off" as const),
    Promise.resolve(preferences.hapticsEnabled ? requestBrowserVibration(cue) : "off" as const)
  ]);
  return { haptics, sound };
}

async function playSyntheticCue(
  cue: MoveFeedbackCue
): Promise<MoveFeedbackPreviewResult["sound"]> {
  const browserGlobals = globalThis as unknown as BrowserAudioGlobals;
  const AudioContextClass = browserGlobals.AudioContext ?? browserGlobals.webkitAudioContext;
  if (!AudioContextClass) {
    return "unavailable";
  }

  const context = new AudioContextClass();
  try {
    await context.resume();
    if (cue === "success") {
      scheduleTone(context, 440, 0, 0.07, 0.08);
      scheduleTone(context, 660, 0.075, 0.13, 0.07);
      await delay(230);
      return "played";
    }
    if (cue === "mistake") {
      scheduleTone(context, 210, 0, 0.08, 0.09);
      scheduleTone(context, 145, 0.085, 0.16, 0.08);
      await delay(250);
      return "played";
    }

    scheduleWoodClick(context, cue === "capture" ? 190 : 360, cue === "capture" ? 0.1 : 0.065);
    await delay(cue === "capture" ? 160 : 120);
    return "played";
  } catch {
    return "unavailable";
  } finally {
    await context.close().catch(() => undefined);
  }
}

function scheduleTone(
  context: AudioContextLike,
  frequency: number,
  offsetSeconds: number,
  durationSeconds: number,
  peakGain: number
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startsAt = context.currentTime + offsetSeconds;
  const endsAt = startsAt + durationSeconds;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startsAt);
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startsAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startsAt);
  oscillator.stop(endsAt);
}

function scheduleWoodClick(
  context: AudioContextLike,
  centerFrequency: number,
  durationSeconds: number
): void {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = Math.round(centerFrequency * 1000);
  for (let index = 0; index < data.length; index += 1) {
    const envelope = Math.pow(1 - index / data.length, 5);
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[index] = ((seed / 0xffffffff) * 2 - 1) * envelope;
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  filter.type = "bandpass";
  filter.frequency.value = centerFrequency;
  filter.Q.value = 0.8;
  gain.gain.value = 0.42;
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start();
}

function requestBrowserVibration(
  cue: MoveFeedbackCue
): MoveFeedbackPreviewResult["haptics"] {
  const browserNavigator = (globalThis as unknown as BrowserAudioGlobals).navigator;
  if (!browserNavigator) {
    return "visual-only";
  }
  if (typeof browserNavigator.vibrate !== "function") {
    return "visual-only";
  }
  return browserNavigator.vibrate(HAPTIC_PATTERNS[cue]) ? "requested" : "visual-only";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, milliseconds);
  });
}
