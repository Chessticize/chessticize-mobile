import { NativeModules } from "react-native";
import { arePracticeTestControlsEnabled } from "../releaseConfig.ts";

type TestLaunchConfigGlobals = typeof globalThis & {
  __CHESSTICIZE_ENABLE_TEST_CONTROLS__?: boolean;
  __DEV__?: boolean;
};

type NativeTestLaunchConfigModule = {
  puzzleSelectionSeed?: string;
  standardTargetCorrect?: string | number;
  storeAssetCapture?: boolean;
  testControlsEnabled?: boolean;
  testNowMs?: string | number;
};

function areNativeTestControlsEnabled(
  globals: TestLaunchConfigGlobals,
  nativeModule: NativeTestLaunchConfigModule | undefined
): boolean {
  return arePracticeTestControlsEnabled(globals) || nativeModule?.testControlsEnabled === true;
}

export function isStoreAssetCaptureEnabled(
  nativeModule: NativeTestLaunchConfigModule | undefined = NativeModules?.ChessticizeTestLaunchConfig as NativeTestLaunchConfigModule | undefined
): boolean {
  return nativeModule?.storeAssetCapture === true;
}

export function resolveTestNowMsFromLaunchConfig(
  globals: TestLaunchConfigGlobals = globalThis,
  nativeModule: NativeTestLaunchConfigModule | undefined = NativeModules?.ChessticizeTestLaunchConfig as NativeTestLaunchConfigModule | undefined
): number | undefined {
  if (!areNativeTestControlsEnabled(globals, nativeModule) && !isStoreAssetCaptureEnabled(nativeModule)) {
    return undefined;
  }

  const rawValue = nativeModule?.testNowMs;
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return undefined;
  }

  const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function resolveTestPuzzleSelectionSeedFromLaunchConfig(
  globals: TestLaunchConfigGlobals = globalThis,
  nativeModule: NativeTestLaunchConfigModule | undefined = NativeModules?.ChessticizeTestLaunchConfig as NativeTestLaunchConfigModule | undefined
): string | undefined {
  if (!areNativeTestControlsEnabled(globals, nativeModule)) {
    return undefined;
  }
  const seed = nativeModule?.puzzleSelectionSeed?.trim();
  return seed ? seed : undefined;
}

export function resolveTestStandardTargetCorrectFromLaunchConfig(
  globals: TestLaunchConfigGlobals = globalThis,
  nativeModule: NativeTestLaunchConfigModule | undefined = NativeModules?.ChessticizeTestLaunchConfig as NativeTestLaunchConfigModule | undefined
): number | undefined {
  if (!areNativeTestControlsEnabled(globals, nativeModule)) {
    return undefined;
  }
  const rawValue = nativeModule?.standardTargetCorrect;
  const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function createAdvancingTestClock(
  testNowMs: number,
  wallClockMs: () => number = Date.now
): () => number {
  const wallClockStartedAtMs = wallClockMs();
  return () => testNowMs + Math.max(0, wallClockMs() - wallClockStartedAtMs);
}
