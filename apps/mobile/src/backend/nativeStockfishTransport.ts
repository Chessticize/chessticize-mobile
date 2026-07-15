import { NativeEventEmitter, NativeModules } from "react-native";
import type { UciEngineTransport } from "../../../../packages/core/src/index.ts";

const STOCKFISH_LINE_EVENT = "StockfishEngineLine";

type NativeStockfishEngineModule = {
  start: () => Promise<boolean | void>;
  send: (command: string) => void;
  terminate: () => void;
};

let singletonTransport: UciEngineTransport | null = null;
let prewarmPromise: Promise<boolean> | null = null;
let prewarmReady = false;
let singletonNativeStart: (() => Promise<boolean | void>) | null = null;

export function createNativeStockfishTransport(): UciEngineTransport | null {
  const nativeModule = NativeModules?.NativeStockfishEngine as NativeStockfishEngineModule | undefined;
  if (!nativeModule || typeof nativeModule.start !== "function" || typeof nativeModule.send !== "function") {
    return null;
  }
  if (singletonTransport) {
    return singletonTransport;
  }

  const emitter = new NativeEventEmitter(nativeModule as never);
  singletonNativeStart = () => nativeModule.start();
  singletonTransport = {
    start: () => nativeModule.start() as Promise<void>,
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
      prewarmReady = false;
      singletonTransport = null;
      singletonNativeStart = null;
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

  if (prewarmReady) {
    return cachePrewarmAttempt((async () => {
      try {
        const created = await singletonNativeStart?.();
        if (created !== true) {
          return true;
        }
        return runPrewarmHandshake(transport);
      } catch {
        return false;
      }
    })());
  }

  return cachePrewarmAttempt(runPrewarmHandshake(transport));
}

function runPrewarmHandshake(transport: UciEngineTransport): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let uciAcknowledged = false;
    let cleanup: (() => void) | null = null;
    const timer = setTimeout(() => {
      finish(false);
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
      if (line === "uciok" && !uciAcknowledged) {
        uciAcknowledged = true;
        transport.send("setoption name MultiPV value 3");
        transport.send("isready");
      } else if (line === "readyok" && uciAcknowledged) {
        finish(true);
      }
    });

    transport.start().then(
      () => {
        transport.send("uci");
      },
      () => {
        finish(false);
      }
    );
  });
}

function cachePrewarmAttempt(attempt: Promise<boolean>): Promise<boolean> {
  const cached = attempt.then((result) => {
    if (prewarmPromise === cached) {
      prewarmReady = result;
    }
    return result;
  }).finally(() => {
    if (prewarmPromise === cached) {
      prewarmPromise = null;
    }
  });
  prewarmPromise = cached;
  return cached;
}
