import { NativeModules } from "react-native";
import { arePracticeTestControlsEnabled } from "../releaseConfig.ts";

type TestLaunchConfigGlobals = typeof globalThis & {
  __CHESSTICIZE_ENABLE_TEST_CONTROLS__?: boolean;
  __DEV__?: boolean;
};

type NativeTestLaunchConfigValues = {
  puzzleSelectionSeed?: string;
  standardTargetCorrect?: string | number;
  storeAssetCapture?: boolean;
  testControlsEnabled?: boolean;
  testNowMs?: string | number;
};

type NativeTestLaunchConfigModule = NativeTestLaunchConfigValues & {
  getLaunchConfig?: () => NativeTestLaunchConfigValues;
};

function readNativeTestLaunchConfig(
  nativeModule: NativeTestLaunchConfigModule | undefined
): NativeTestLaunchConfigValues | undefined {
  return nativeModule?.getLaunchConfig?.() ?? nativeModule;
}

function areNativeTestControlsEnabled(
  globals: TestLaunchConfigGlobals,
  nativeModule: NativeTestLaunchConfigModule | undefined
): boolean {
  return arePracticeTestControlsEnabled(globals) || nativeModule?.testControlsEnabled === true;
}

export function enableTestControlsFromLaunchConfig(
  globals: TestLaunchConfigGlobals = globalThis,
  nativeModule: NativeTestLaunchConfigModule | undefined = NativeModules?.ChessticizeTestLaunchConfig as NativeTestLaunchConfigModule | undefined
): boolean {
  const launchConfig = readNativeTestLaunchConfig(nativeModule);
  if (launchConfig?.testControlsEnabled === true) {
    globals.__CHESSTICIZE_ENABLE_TEST_CONTROLS__ = true;
  }
  return arePracticeTestControlsEnabled(globals);
}

export function isStoreAssetCaptureEnabled(
  nativeModule: NativeTestLaunchConfigModule | undefined = NativeModules?.ChessticizeTestLaunchConfig as NativeTestLaunchConfigModule | undefined
): boolean {
  return readNativeTestLaunchConfig(nativeModule)?.storeAssetCapture === true;
}

export function resolveTestNowMsFromLaunchConfig(
  globals: TestLaunchConfigGlobals = globalThis,
  nativeModule: NativeTestLaunchConfigModule | undefined = NativeModules?.ChessticizeTestLaunchConfig as NativeTestLaunchConfigModule | undefined
): number | undefined {
  const launchConfig = readNativeTestLaunchConfig(nativeModule);
  if (!areNativeTestControlsEnabled(globals, launchConfig) && launchConfig?.storeAssetCapture !== true) {
    return undefined;
  }

  const rawValue = launchConfig?.testNowMs;
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
  const launchConfig = readNativeTestLaunchConfig(nativeModule);
  if (!areNativeTestControlsEnabled(globals, launchConfig)) {
    return undefined;
  }
  const seed = launchConfig?.puzzleSelectionSeed?.trim();
  return seed ? seed : undefined;
}

export function resolveTestStandardTargetCorrectFromLaunchConfig(
  globals: TestLaunchConfigGlobals = globalThis,
  nativeModule: NativeTestLaunchConfigModule | undefined = NativeModules?.ChessticizeTestLaunchConfig as NativeTestLaunchConfigModule | undefined
): number | undefined {
  const launchConfig = readNativeTestLaunchConfig(nativeModule);
  if (!areNativeTestControlsEnabled(globals, launchConfig)) {
    return undefined;
  }
  const rawValue = launchConfig?.standardTargetCorrect;
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
