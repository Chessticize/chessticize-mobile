import { NativeModules } from "react-native";

export type SystemBarScheme = "light" | "dark";

// Tells the platform which appearance the app is showing, so the system bars can follow an
// in-app Light or Dark override instead of the system appearance (#632). Android only; iOS
// has no module and keeps its existing status bar handling.
export interface SystemBarAppearanceClient {
  setAppearance(scheme: SystemBarScheme): void;
}

type NativeSystemBarsModule = {
  setAppearance?: (scheme: SystemBarScheme) => void;
};

export function createNativeSystemBarAppearanceClient(
  nativeModule: NativeSystemBarsModule | undefined =
    NativeModules?.ChessticizeSystemBars as NativeSystemBarsModule | undefined
): SystemBarAppearanceClient | null {
  if (!nativeModule || typeof nativeModule.setAppearance !== "function") {
    return null;
  }
  return {
    setAppearance(scheme): void {
      nativeModule.setAppearance?.(scheme);
    }
  };
}
