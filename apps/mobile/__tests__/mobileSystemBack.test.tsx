import { BackHandler, NativeModules } from "react-native";
import {
  createMobileSystemBackSource,
  type MobileSystemBackListener
} from "../src/navigation/mobileSystemBack";

describe("mobile system Back source", () => {
  afterEach(() => {
    delete (NativeModules as Record<string, unknown>).MobilePredictiveBack;
    (BackHandler as unknown as { __reset(): void }).__reset();
  });

  it("forwards API-34 predictive start/progress/cancel/commit phases and button fallback", () => {
    let emitNative: ((event: Record<string, unknown>) => void) | null = null;
    const removeNative = jest.fn();
    const setEnabled = jest.fn();
    (NativeModules as Record<string, unknown>).MobilePredictiveBack = {
      addListener: jest.fn(),
      removeListeners: jest.fn(),
      setEnabled,
      __addListener: jest.fn((_eventName: string, listener: (event: Record<string, unknown>) => void) => {
        emitNative = listener;
        return { remove: removeNative };
      })
    };
    const listener: MobileSystemBackListener = {
      onStart: jest.fn(),
      onProgress: jest.fn(),
      onCancel: jest.fn(),
      onCommit: jest.fn(() => true)
    };
    const source = createMobileSystemBackSource("android");
    const unsubscribe = source.subscribe(listener);
    const emit = (event: Record<string, unknown>) => {
      if (!emitNative) {
        throw new Error("Native predictive Back listener was not installed");
      }
      (emitNative as (nextEvent: Record<string, unknown>) => void)(event);
    };

    source.setPredictiveBackEnabled(true);
    expect(setEnabled).toHaveBeenCalledWith(true);

    emit({ phase: "started", edge: "right", progress: 0 });
    emit({ phase: "progressed", edge: "right", progress: 1.5 });
    expect(listener.onStart).toHaveBeenCalledWith("right");
    expect(listener.onProgress).toHaveBeenCalledWith(1, "right");

    emit({ phase: "cancelled" });
    expect(listener.onCancel).toHaveBeenCalledTimes(1);
    emit({ phase: "invoked" });
    expect(listener.onCommit).toHaveBeenLastCalledWith("button");
    expect((BackHandler as unknown as { __emit(): boolean }).__emit()).toBe(true);
    expect(listener.onCommit).toHaveBeenLastCalledWith("button");

    emit({ phase: "started", edge: "left", progress: 0 });
    emit({ phase: "invoked" });
    expect(listener.onCommit).toHaveBeenLastCalledWith("predictive");

    unsubscribe();
    expect(removeNative).toHaveBeenCalledTimes(1);
    expect((BackHandler as unknown as { __emit(): boolean }).__emit()).toBe(false);
  });

  it("keeps iOS detached from both native Back sources", () => {
    const listener: MobileSystemBackListener = {
      onStart: jest.fn(),
      onProgress: jest.fn(),
      onCancel: jest.fn(),
      onCommit: jest.fn(() => true)
    };
    const source = createMobileSystemBackSource("ios");

    source.setPredictiveBackEnabled(true);
    source.subscribe(listener)();

    expect((BackHandler as unknown as { __emit(): boolean }).__emit()).toBe(false);
    expect(listener.onCommit).not.toHaveBeenCalled();
  });
});
