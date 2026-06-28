import { NativeModules } from "react-native";
import { createNativeStockfishTransport } from "../src/backend/nativeStockfishTransport";

type StockfishLineListener = (event: { line?: string }) => void;

describe("native Stockfish transport", () => {
  afterEach(() => {
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
});
