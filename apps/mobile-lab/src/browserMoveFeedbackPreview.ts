import type {
  MoveFeedbackCue,
  MoveFeedbackPreferences,
  MoveFeedbackPreviewResult
} from "../../mobile/src/components/moveFeedbackPresentation.ts";

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
  webkitAudioContext?: AudioContextConstructor;
};

export async function previewBrowserMoveFeedback(
  cue: MoveFeedbackCue,
  preferences: MoveFeedbackPreferences
): Promise<MoveFeedbackPreviewResult> {
  const [sound, haptics] = await Promise.all([
    preferences.soundEnabled ? playSyntheticCue(cue) : Promise.resolve("off" as const),
    Promise.resolve(preferences.hapticsEnabled ? "visual-only" as const : "off" as const)
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
    const isCapture = cue === "capture";
    scheduleWoodClick(context, isCapture ? 190 : 360, isCapture ? 0.14 : 0.12);
    scheduleTone(
      context,
      isCapture ? 240 : 480,
      0,
      isCapture ? 0.14 : 0.12,
      isCapture ? 0.13 : 0.11
    );
    await delay(isCapture ? 210 : 200);
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, milliseconds);
  });
}
