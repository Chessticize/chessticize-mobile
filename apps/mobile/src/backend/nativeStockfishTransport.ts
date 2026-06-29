import { NativeEventEmitter, NativeModules } from "react-native";
import type { UciEngineTransport } from "../../../../packages/core/src/index.ts";

const STOCKFISH_LINE_EVENT = "StockfishEngineLine";

type NativeStockfishEngineModule = {
  start: () => Promise<void>;
  send: (command: string) => void;
  terminate: () => void;
};

let singletonTransport: UciEngineTransport | null = null;
let prewarmPromise: Promise<boolean> | null = null;

export function createNativeStockfishTransport(): UciEngineTransport | null {
  const nativeModule = NativeModules?.NativeStockfishEngine as NativeStockfishEngineModule | undefined;
  if (!nativeModule || typeof nativeModule.start !== "function" || typeof nativeModule.send !== "function") {
    return null;
  }
  if (singletonTransport) {
    return singletonTransport;
  }

  const emitter = new NativeEventEmitter(nativeModule as never);
  singletonTransport = {
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
      prewarmPromise = null;
      singletonTransport = null;
      nativeModule.terminate();
    }
  };
  return singletonTransport;
}

export function prewarmNativeStockfishTransport(): Promise<boolean> {
  const transport = createNativeStockfishTransport();
  if (!transport) {
    return Promise.resolve(false);
  }
  if (prewarmPromise) {
    return prewarmPromise;
  }

  prewarmPromise = new Promise<boolean>((resolve) => {
    let settled = false;
    let cleanup: (() => void) | null = null;
    const timer = setTimeout(() => {
      finish(true);
    }, 1500);

    function finish(result: boolean): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      cleanup?.();
      resolve(result);
    }

    cleanup = transport.onLine((line) => {
      if (line === "readyok") {
        finish(true);
      }
    });

    transport.start().then(
      () => {
        transport.send("uci");
        transport.send("setoption name MultiPV value 3");
        transport.send("isready");
      },
      () => {
        prewarmPromise = null;
        finish(false);
      }
    );
  });

  return prewarmPromise;
}
