// UI haptics for primary actions (#609 item 4). One shared module: typed
// intents, the native boundary and the gate. Restrained by design, following
// the iOS HIG and Android haptic conventions:
//
// - selection: a segmented control, a configuration choice (mode, theme or
//   level), a switch or a stepper changes its value;
// - impactLight: a primary button is pressed, which includes starting a Run;
// - success / warning: a result screen appears for a passed Sprint or a new
//   Survival best / a failed Sprint or a Survival Run ended by three mistakes.
//
// Navigation, scrolling, back buttons, list row taps and view filters stay
// silent, and board moves belong to move feedback (moveFeedback.ts).
//
// Every intent is gated on the single Haptic feedback setting. The native
// generators also honour the system haptics setting (iOS System Haptics,
// Android touch feedback). Without a provider (Storybook, the Interaction Lab,
// tests) and without the native module (web) every intent is a no-op.

import { createContext, useContext, useEffect, useRef } from "react";
import { NativeModules, Platform } from "react-native";

export type UiHapticIntent = "selection" | "impactLight" | "success" | "warning";

export const UI_HAPTIC_INTENTS: readonly UiHapticIntent[] = [
  "selection",
  "impactLight",
  "success",
  "warning"
];

/** The native boundary: plays one intent on the device. */
export interface UiHapticsClient {
  play(intent: UiHapticIntent): Promise<void>;
}

/** Records the intents that reach the native boundary. */
export class FakeUiHapticsClient implements UiHapticsClient {
  readonly played: UiHapticIntent[] = [];

  async play(intent: UiHapticIntent): Promise<void> {
    this.played.push(intent);
  }
}

type NativeUiHapticsModule = {
  playUiHaptic?: (intent: UiHapticIntent) => Promise<unknown>;
};

/**
 * The native client, served by the MoveFeedback module that already owns move
 * haptics. Null on web and wherever that module is absent.
 */
export function createNativeUiHapticsClient(
  nativeModule: NativeUiHapticsModule | undefined =
    NativeModules?.MoveFeedback as NativeUiHapticsModule | undefined,
  platformOS: string = Platform.OS
): UiHapticsClient | null {
  if (platformOS !== "ios" && platformOS !== "android") {
    return null;
  }
  const playUiHaptic = nativeModule?.playUiHaptic;
  if (typeof playUiHaptic !== "function") {
    return null;
  }
  return {
    async play(intent): Promise<void> {
      await playUiHaptic(intent);
    }
  };
}

/** Fires one intent. Never throws and never waits on the device. */
export type UiHaptics = (intent: UiHapticIntent) => void;

export function createUiHaptics({
  client,
  isEnabled
}: {
  client: UiHapticsClient | null;
  /** Reads the Haptic feedback setting at the moment of the intent. */
  isEnabled: () => boolean;
}): UiHaptics {
  if (!client) {
    return noUiHaptics;
  }
  return (intent) => {
    if (!UI_HAPTIC_INTENTS.includes(intent) || !isEnabled()) {
      return;
    }
    try {
      client.play(intent).catch(() => undefined);
    } catch {
      // Haptics are best effort; a failing generator never blocks the action.
    }
  };
}

function noUiHaptics(): void {}

const UiHapticsContext = createContext<UiHaptics>(noUiHaptics);

/** Provides the app's gated UI haptics; absent means silent. */
export const UiHapticsProvider = UiHapticsContext.Provider;

export function useUiHaptics(): UiHaptics {
  return useContext(UiHapticsContext);
}

// The last appearance key each provider played, so returning to the same
// result (for example from another tab) does not replay its outcome.
const lastAppearanceKeys = new WeakMap<UiHaptics, string>();

/**
 * Plays an intent once when the calling screen appears, for example a result
 * outcome. Later renders never replay it, and neither does a later appearance
 * with the same key.
 */
export function useUiHapticOnAppear(intent: UiHapticIntent | null, key?: string): void {
  const uiHaptics = useUiHaptics();
  const pending = useRef<{ intent: UiHapticIntent | null; key: string | undefined; uiHaptics: UiHaptics } | null>({
    intent,
    key,
    uiHaptics
  });
  useEffect(() => {
    const first = pending.current;
    pending.current = null;
    if (!first?.intent) {
      return;
    }
    if (first.key !== undefined) {
      if (lastAppearanceKeys.get(first.uiHaptics) === first.key) {
        return;
      }
      lastAppearanceKeys.set(first.uiHaptics, first.key);
    }
    first.uiHaptics(first.intent);
  }, []);
}
