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
    const sharedStockfishRoot = join(appRoot, "native", "stockfish");
    const iosStockfishRoot = join(appRoot, "ios", "StockfishEngine");
    const podspec = readFileSync(join(appRoot, "ChessticizeStockfish.podspec"), "utf8");

    expect(existsSync(join(sharedStockfishRoot, "Stockfish", "src", "position.cpp"))).toBe(true);
    expect(existsSync(join(sharedStockfishRoot, "Resources", "nn-c288c895ea92.nnue"))).toBe(true);
    expect(existsSync(join(sharedStockfishRoot, "Resources", "nn-37f18f62d772.nnue"))).toBe(true);
    expect(existsSync(join(sharedStockfishRoot, "Copying.txt"))).toBe(true);
    expect(existsSync(join(sharedStockfishRoot, "AUTHORS"))).toBe(true);
    expect(existsSync(join(iosStockfishRoot, "Native", "NativeStockfishEngine.mm"))).toBe(true);
    expect(existsSync(join(iosStockfishRoot, "Stockfish"))).toBe(false);
    expect(existsSync(join(iosStockfishRoot, "Resources"))).toBe(false);
    expect(podspec).toContain('"native/stockfish/Stockfish/src/**/*.{h,cpp}"');
    expect(podspec).toContain('"native/stockfish/Resources/*.nnue"');
    expect(podspec).toContain('"ios/StockfishEngine/Native/**/*.{h,mm}"');
  });
});
