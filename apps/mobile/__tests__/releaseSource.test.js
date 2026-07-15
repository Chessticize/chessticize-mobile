const { existsSync, readFileSync, readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");

const appRoot = process.cwd();

function readSourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      return readSourceFiles(fullPath);
    }
    return /\.(js|jsx|ts|tsx)$/.test(entry) ? [readFileSync(fullPath, "utf8")] : [];
  });
}

describe("release source configuration", () => {
  it("keeps production-facing source free of Metro and React Native debug menu entry points", () => {
    const source = [
      readFileSync(join(appRoot, "App.tsx"), "utf8"),
      readFileSync(join(appRoot, "index.js"), "utf8"),
      ...readSourceFiles(join(appRoot, "src"))
    ].join("\n");

    expect(source).not.toMatch(/\bDevSettings\b|NativeDevSettings|localhost|127\.0\.0\.1|:8081|port 8081/);
  });

  it("keeps Stockfish source, NNUE networks, and license metadata under shared native ownership", () => {
    const stockfish = JSON.parse(readFileSync(join(appRoot, "stockfish-artifacts.json"), "utf8"));
    const sharedStockfishRoot = join(appRoot, stockfish.root);
    const sharedBridgeRoot = join(sharedStockfishRoot, stockfish.bridge);
    const iosStockfishRoot = join(appRoot, "ios", "StockfishEngine");
    const podspec = readFileSync(join(appRoot, "ChessticizeStockfish.podspec"), "utf8");

    expect(existsSync(join(sharedStockfishRoot, stockfish.sourceSentinel))).toBe(true);
    for (const nnuePath of stockfish.nnue) {
      expect(existsSync(join(sharedStockfishRoot, nnuePath))).toBe(true);
    }
    expect(existsSync(join(sharedStockfishRoot, stockfish.license))).toBe(true);
    expect(existsSync(join(sharedStockfishRoot, stockfish.authors))).toBe(true);
    expect(existsSync(join(sharedBridgeRoot, "StockfishRunner.h"))).toBe(true);
    expect(existsSync(join(sharedBridgeRoot, "StockfishRunner.cpp"))).toBe(true);
    expect(existsSync(join(iosStockfishRoot, "Native", "NativeStockfishEngine.mm"))).toBe(true);
    expect(existsSync(join(iosStockfishRoot, "Stockfish"))).toBe(false);
    expect(existsSync(join(iosStockfishRoot, "Resources"))).toBe(false);
    expect(podspec).toContain('stockfish-artifacts.json');
    expect(podspec).toContain('stockfish.fetch("source")');
    expect(podspec).toContain('stockfish.fetch("bridge")');
    expect(podspec).toContain('stockfish.fetch("nnue")');
    expect(podspec).toContain('"ios/StockfishEngine/Native/**/*.{h,mm}"');
  });

  it("keeps one platform-neutral UCI runner behind thin native wrappers", () => {
    const stockfish = JSON.parse(readFileSync(join(appRoot, "stockfish-artifacts.json"), "utf8"));
    const runnerSource = readFileSync(
      join(appRoot, stockfish.root, stockfish.bridge, "StockfishRunner.cpp"),
      "utf8"
    );
    const androidAdapter = readFileSync(
      join(appRoot, "android/app/src/main/cpp/stockfish/NativeStockfishEngine.cpp"),
      "utf8"
    );
    const iosAdapter = readFileSync(
      join(appRoot, "ios/StockfishEngine/Native/NativeStockfishEngine.mm"),
      "utf8"
    );

    expect(runnerSource).toContain("StockfishRunner::handle");
    expect(runnerSource).toContain("set_on_update_full");
    expect(runnerSource).toContain("UCIEngine::parse_limits");
    expect(androidAdapter).toContain('#include "StockfishRunner.h"');
    expect(iosAdapter).toContain('native/stockfish/Bridge/StockfishRunner.h');
    expect(androidAdapter).not.toMatch(/class StockfishRunner/);
    expect(iosAdapter).not.toMatch(/class StockfishRunner/);
    expect(iosAdapter).toContain("resolve(@(created))");
  });

  it("uses the packaged artifact manifest as the only runtime NNUE filename source", () => {
    const stockfish = JSON.parse(readFileSync(join(appRoot, "stockfish-artifacts.json"), "utf8"));
    const podspec = readFileSync(join(appRoot, "ChessticizeStockfish.podspec"), "utf8");
    const androidModule = readFileSync(
      join(appRoot, "android/app/src/main/java/com/chessticize/mobile/NativeStockfishEngineModule.kt"),
      "utf8"
    );
    const iosAdapter = readFileSync(
      join(appRoot, "ios/StockfishEngine/Native/NativeStockfishEngine.mm"),
      "utf8"
    );

    expect(podspec).toContain('"stockfish-artifacts.json"');
    expect(androidModule).toContain('assets.open("stockfish/stockfish-artifacts.json")');
    expect(androidModule).toContain('getJSONArray("nnue")');
    expect(iosAdapter).toContain('pathForResource:@"stockfish-artifacts" ofType:@"json"');
    expect(iosAdapter).toContain('objectForKey:@"nnue"');
    for (const nnuePath of stockfish.nnue) {
      const fileName = nnuePath.split("/").at(-1);
      expect(androidModule).not.toContain(fileName);
      expect(iosAdapter).not.toContain(fileName);
    }
  });
});
