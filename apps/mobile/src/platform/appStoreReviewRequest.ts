import { NativeModules } from "react-native";

export interface AppStoreReviewRequestClient {
  requestReview(): Promise<void>;
}

type NativeAppStoreReviewRequestModule = {
  requestReview?: () => Promise<unknown>;
};

export class FakeAppStoreReviewRequestClient
implements AppStoreReviewRequestClient {
  requestCount = 0;

  async requestReview(): Promise<void> {
    this.requestCount += 1;
  }
}

export function createNativeAppStoreReviewRequestClient(
  nativeModule: NativeAppStoreReviewRequestModule | undefined =
    NativeModules?.AppStoreReviewRequest as
      | NativeAppStoreReviewRequestModule
      | undefined
): AppStoreReviewRequestClient | null {
  if (!nativeModule || typeof nativeModule.requestReview !== "function") {
    return null;
  }
  return {
    async requestReview(): Promise<void> {
      await nativeModule.requestReview?.();
    }
  };
}
