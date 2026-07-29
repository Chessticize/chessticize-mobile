import { NativeModules } from "react-native";

export interface AppStoreReviewRequestClient {
  /** Resolves true only when the native boundary actually invokes StoreKit. */
  requestReview(): Promise<boolean>;
}

type NativeAppStoreReviewRequestModule = {
  requestReview?: () => Promise<unknown>;
};

export class FakeAppStoreReviewRequestClient
implements AppStoreReviewRequestClient {
  requestCount = 0;

  async requestReview(): Promise<boolean> {
    this.requestCount += 1;
    return true;
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
    async requestReview(): Promise<boolean> {
      return await nativeModule.requestReview?.() === true;
    }
  };
}
