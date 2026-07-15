import { NativeModules } from "react-native";
import { createNativeStockfishTransport, prewarmNativeStockfishTransport } from "../src/backend/nativeStockfishTransport";

type StockfishLineListener = (event: { line?: string }) => void;

describe("native Stockfish transport", () => {
  afterEach(() => {
    createNativeStockfishTransport()?.terminate();
    delete (NativeModules as Record<string, unknown>).NativeStockfishEngine;
  });

  it("falls back when the native module is absent", () => {
    expect(createNativeStockfishTransport()).toBeNull();
  });

  it("forwards UCI commands and native Stockfish output lines", async () => {
    const commands: string[] = [];
    const listeners = new Set<StockfishLineListener>();
    const start = jest.fn(async () => {});
    const send = jest.fn((command: string) => {
      commands.push(command);
    });
    const terminate = jest.fn();

    (NativeModules as Record<string, unknown>).NativeStockfishEngine = {
      start,
      send,
      terminate,
      __addListener: (eventName: string, listener: StockfishLineListener) => {
        expect(eventName).toBe("StockfishEngineLine");
        listeners.add(listener);
        return {
          remove: () => {
            listeners.delete(listener);
          }
        };
      }
    };

    const transport = createNativeStockfishTransport();
    expect(transport).not.toBeNull();

    const lines: string[] = [];
    const unsubscribe = transport!.onLine((line) => {
      lines.push(line);
    });

    await transport!.start();
    transport!.send("position fen 8/8/8/8/8/8/2Q5/k1K5 w - - 0 1");
    transport!.send("go depth 20");
    for (const listener of listeners) {
      listener({ line: "info depth 20 multipv 1 score mate 1 pv c2b1" });
      listener({ line: "bestmove c2b1" });
      listener({});
    }
    unsubscribe();
    for (const listener of listeners) {
      listener({ line: "info depth 20 multipv 2 score cp 42 pv c2a4" });
    }
    transport!.terminate();

    expect(start).toHaveBeenCalledTimes(1);
    expect(commands).toEqual(["position fen 8/8/8/8/8/8/2Q5/k1K5 w - - 0 1", "go depth 20"]);
    expect(lines).toEqual(["info depth 20 multipv 1 score mate 1 pv c2b1", "bestmove c2b1"]);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("reuses the completed handshake while the singleton native runner stays alive", async () => {
    const commands: string[] = [];
    const listeners = new Set<StockfishLineListener>();
    const start = jest.fn(async () => false);
    const send = jest.fn((command: string) => {
      commands.push(command);
    });
    const terminate = jest.fn();

    (NativeModules as Record<string, unknown>).NativeStockfishEngine = {
      start,
      send,
      terminate,
      __addListener: (eventName: string, listener: StockfishLineListener) => {
        expect(eventName).toBe("StockfishEngineLine");
        listeners.add(listener);
        return {
          remove: () => {
            listeners.delete(listener);
          }
        };
      }
    };

    const prewarm = prewarmNativeStockfishTransport();
    await Promise.resolve();
    expect(commands).toEqual(["uci"]);
    for (const listener of listeners) {
      listener({ line: "uciok" });
    }
    expect(commands).toEqual(["uci", "setoption name MultiPV value 3", "isready"]);
    for (const listener of listeners) {
      listener({ line: "readyok" });
    }
    await expect(prewarm).resolves.toBe(true);
    await expect(prewarmNativeStockfishTransport()).resolves.toBe(true);

    expect(start).toHaveBeenCalledTimes(2);

    start.mockRejectedValueOnce(new Error("runner recreation failed"));
    await expect(prewarmNativeStockfishTransport()).resolves.toBe(false);
    expect(start).toHaveBeenCalledTimes(3);
  });

  it("repeats the UCI handshake when Activity recreation destroyed the native runner", async () => {
    const commands: string[] = [];
    const listeners = new Set<StockfishLineListener>();
    let runnerAlive = false;
    const start = jest.fn(async () => {
      const created = !runnerAlive;
      runnerAlive = true;
      return created;
    });

    (NativeModules as Record<string, unknown>).NativeStockfishEngine = {
      start,
      send: (command: string) => {
        commands.push(command);
      },
      terminate: jest.fn(() => {
        runnerAlive = false;
      }),
      __addListener: (_eventName: string, listener: StockfishLineListener) => {
        listeners.add(listener);
        return {
          remove: () => {
            listeners.delete(listener);
          }
        };
      }
    };

    const firstPrewarm = prewarmNativeStockfishTransport();
    await Promise.resolve();
    for (const listener of listeners) {
      listener({ line: "uciok" });
      listener({ line: "readyok" });
    }
    await expect(firstPrewarm).resolves.toBe(true);

    runnerAlive = false;
    const recreatedPrewarm = prewarmNativeStockfishTransport();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(commands.filter((command) => command === "uci")).toHaveLength(2);
    for (const listener of listeners) {
      listener({ line: "uciok" });
      listener({ line: "readyok" });
    }

    await expect(recreatedPrewarm).resolves.toBe(true);
    expect(start).toHaveBeenCalledTimes(3);
  });

  it("fails prewarming when the engine never completes the UCI handshake", async () => {
    jest.useFakeTimers();
    const listeners = new Set<StockfishLineListener>();

    (NativeModules as Record<string, unknown>).NativeStockfishEngine = {
      start: jest.fn(async () => {}),
      send: jest.fn(),
      terminate: jest.fn(),
      __addListener: (_eventName: string, listener: StockfishLineListener) => {
        listeners.add(listener);
        return {
          remove: () => {
            listeners.delete(listener);
          }
        };
      }
    };

    try {
      const prewarm = prewarmNativeStockfishTransport();
      await Promise.resolve();
      for (const listener of listeners) {
        listener({ line: "readyok" });
      }
      jest.advanceTimersByTime(1500);

      await expect(prewarm).resolves.toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
