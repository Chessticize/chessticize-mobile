import { BackHandler, NativeEventEmitter, NativeModules } from "react-native";

export type MobileSystemBackPlatform = "android" | "ios";
export type MobileSystemBackActivation = "button" | "predictive";
export type MobileSystemBackEdge = "left" | "right";

export interface MobileSystemBackListener {
  onCancel(): void;
  onCommit(activation: MobileSystemBackActivation): boolean;
  onProgress(progress: number, edge: MobileSystemBackEdge): void;
  onStart(edge: MobileSystemBackEdge): void;
}

export interface MobileSystemBackSource {
  readonly platform: MobileSystemBackPlatform;
  setPredictiveBackEnabled(enabled: boolean): void;
  subscribe(listener: MobileSystemBackListener): () => void;
}

type NativePredictiveBackEvent = {
  edge?: MobileSystemBackEdge;
  phase?: "started" | "progressed" | "cancelled" | "invoked";
  progress?: number;
};

type NativePredictiveBackModule = {
  addListener(eventName: string): void;
  removeListeners(count: number): void;
  setEnabled(enabled: boolean): void;
};

const PREDICTIVE_BACK_EVENT = "mobilePredictiveBack";

export function createMobileSystemBackSource(
  platform: MobileSystemBackPlatform
): MobileSystemBackSource {
  const nativeModule = platform === "android"
    ? NativeModules?.MobilePredictiveBack as NativePredictiveBackModule | undefined
    : undefined;
  let predictiveGestureStarted = false;

  return {
    platform,
    setPredictiveBackEnabled(enabled) {
      nativeModule?.setEnabled(enabled);
    },
    subscribe(listener) {
      if (platform !== "android") {
        return () => undefined;
      }

      const backSubscription = BackHandler.addEventListener("hardwareBackPress", () => (
        listener.onCommit("button")
      ));
      const predictiveSubscription = nativeModule
        ? new NativeEventEmitter(nativeModule as never).addListener(
          PREDICTIVE_BACK_EVENT,
          (event: NativePredictiveBackEvent) => {
            console.info("[DEBUG-pr201-back-js] listener-receipt", event.phase ?? "missing-phase");
            const edge = event.edge === "right" ? "right" : "left";
            if (event.phase === "started") {
              predictiveGestureStarted = true;
              listener.onStart(edge);
            } else if (event.phase === "progressed") {
              listener.onProgress(clampProgress(event.progress), edge);
            } else if (event.phase === "cancelled") {
              predictiveGestureStarted = false;
              listener.onCancel();
            } else if (event.phase === "invoked") {
              const activation = predictiveGestureStarted ? "predictive" : "button";
              predictiveGestureStarted = false;
              listener.onCommit(activation);
            }
          }
        )
        : null;

      return () => {
        predictiveGestureStarted = false;
        predictiveSubscription?.remove();
        backSubscription.remove();
      };
    }
  };
}

function clampProgress(progress: number | undefined): number {
  if (typeof progress !== "number" || !Number.isFinite(progress)) {
    return 0;
  }
  return Math.max(0, Math.min(1, progress));
}
