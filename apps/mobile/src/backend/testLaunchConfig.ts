import { NativeModules } from "react-native";
import { arePracticeTestControlsEnabled } from "../releaseConfig.ts";

type TestLaunchConfigGlobals = typeof globalThis & {
  __CHESSTICIZE_ENABLE_TEST_CONTROLS__?: boolean;
  __DEV__?: boolean;
};

type NativeTestLaunchConfigModule = {
  storeAssetCapture?: boolean;
  testNowMs?: string | number;
};

export function isStoreAssetCaptureEnabled(
  nativeModule: NativeTestLaunchConfigModule | undefined = NativeModules?.ChessticizeTestLaunchConfig as NativeTestLaunchConfigModule | undefined
): boolean {
  return nativeModule?.storeAssetCapture === true;
}

export function resolveTestNowMsFromLaunchConfig(
  globals: TestLaunchConfigGlobals = globalThis,
  nativeModule: NativeTestLaunchConfigModule | undefined = NativeModules?.ChessticizeTestLaunchConfig as NativeTestLaunchConfigModule | undefined
): number | undefined {
  if (!arePracticeTestControlsEnabled(globals) && !isStoreAssetCaptureEnabled(nativeModule)) {
    return undefined;
  }

  const rawValue = nativeModule?.testNowMs;
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return undefined;
  }

  const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
