import { BackHandler } from "react-native";

export type MobileSystemBackPlatform = "android" | "ios";

export interface MobileSystemBackSource {
  readonly platform: MobileSystemBackPlatform;
  subscribe(handler: () => boolean): () => void;
}

export function createMobileSystemBackSource(
  platform: MobileSystemBackPlatform
): MobileSystemBackSource {
  return {
    platform,
    subscribe(handler) {
      if (platform !== "android") {
        return () => undefined;
      }
      const subscription = BackHandler.addEventListener("hardwareBackPress", handler);
      return () => subscription.remove();
    }
  };
}
