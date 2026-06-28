import { NativeEventEmitter, NativeModules } from "react-native";
import type { UciEngineTransport } from "../../../../packages/core/src/index.ts";

const STOCKFISH_LINE_EVENT = "StockfishEngineLine";

type NativeStockfishEngineModule = {
  start: () => Promise<void>;
  send: (command: string) => void;
  terminate: () => void;
};

export function createNativeStockfishTransport(): UciEngineTransport | null {
  const nativeModule = NativeModules?.NativeStockfishEngine as NativeStockfishEngineModule | undefined;
  if (!nativeModule || typeof nativeModule.start !== "function" || typeof nativeModule.send !== "function") {
    return null;
  }

  const emitter = new NativeEventEmitter(nativeModule as never);
  return {
    start: () => nativeModule.start(),
    send: (command: string) => nativeModule.send(command),
    onLine: (listener: (line: string) => void) => {
      const subscription = emitter.addListener(STOCKFISH_LINE_EVENT, (event: { line?: string }) => {
        if (typeof event.line === "string") {
          listener(event.line);
        }
      });
      return () => subscription.remove();
    },
    terminate: () => {
      nativeModule.terminate();
    }
  };
}
