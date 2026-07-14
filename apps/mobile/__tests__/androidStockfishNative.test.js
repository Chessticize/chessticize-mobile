const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

describe('Android Stockfish native contract', () => {
  it('registers a thin lifecycle-aware Kotlin module', () => {
    const application = read('android/app/src/main/java/com/chessticize/mobile/MainApplication.kt');
    const module = read('android/app/src/main/java/com/chessticize/mobile/NativeStockfishEngineModule.kt');

    expect(application).toContain('add(NativeStockfishEnginePackage())');
    expect(module).toContain('class NativeStockfishEngineModule');
    expect(module).toContain('LifecycleEventListener');
    expect(module).toContain('fun start(promise: Promise)');
    expect(module).toContain('fun send(command: String)');
    expect(module).toContain('fun terminate()');
    expect(module).toContain('override fun onHostPause()');
    expect(module).toContain('StockfishEngineLine');
    expect(module).not.toMatch(/Chess|FEN|bestmove|MultiPV/);
  });

  it('builds JNI against the canonical shared source and packages both NNUE networks', () => {
    const cmake = read('android/app/src/main/cpp/CMakeLists.txt');
    const gradle = read('android/app/build.gradle');

    expect(cmake).toContain('../../../../../native/stockfish/Stockfish/src');
    expect(cmake).toContain('NativeStockfishEngine.cpp');
    expect(cmake).toContain('-Wl,-z,max-page-size=16384');
    expect(gradle).toContain('externalNativeBuild');
    expect(gradle).toContain('nn-c288c895ea92.nnue');
    expect(gradle).toContain('nn-37f18f62d772.nnue');
    expect(gradle).toContain('ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON');
  });

  it('keeps the packaged ABI and 16 KB ELF checks in the required verifier', () => {
    const verifier = read('scripts/verify-android-apk-abis.js');

    expect(verifier).toContain('libstockfish.so');
    expect(verifier).toContain('zipalign');
    expect(verifier).toContain('llvm-readelf');
    expect(verifier).toContain('0x4000');
  });
});
