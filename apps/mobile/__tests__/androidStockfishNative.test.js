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

  it('builds JNI and embedded NNUE data directly from the canonical shared sources', () => {
    const cmake = read('android/app/src/main/cpp/CMakeLists.txt');
    const gradle = read('android/app/build.gradle');

    expect(cmake).toContain('../../../../../native/stockfish/Stockfish/src');
    expect(cmake).toContain('../../../../../native/stockfish/Resources');
    expect(cmake).toContain('NativeStockfishEngine.cpp');
    expect(cmake).toContain('-Wa,-I,${STOCKFISH_RESOURCES_DIR}');
    expect(cmake).toContain('-Wl,-z,max-page-size=16384');
    expect(cmake).toContain('nn-c288c895ea92.nnue');
    expect(cmake).toContain('nn-37f18f62d772.nnue');
    expect(gradle).toContain('externalNativeBuild');
    expect(gradle).toContain('ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON');
  });

  it('composes Stockfish without replacing the React Native application CMake bootstrap', () => {
    const cmake = read('android/app/src/main/cpp/CMakeLists.txt');
    const cppRoot = path.join(mobileRoot, 'android/app/src/main/cpp');

    expect(cmake).toContain('project(appmodules');
    expect(cmake).toContain(
      'include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)'
    );
    expect(cmake).toContain('stockfish/NativeStockfishEngine.cpp');
    expect(fs.existsSync(path.join(cppRoot, 'NativeStockfishEngine.cpp'))).toBe(false);
    expect(fs.existsSync(path.join(cppRoot, 'stockfish/NativeStockfishEngine.cpp'))).toBe(true);
  });

  it('keeps the packaged ABI and 16 KB ELF checks in the required verifier', () => {
    const verifier = read('scripts/verify-android-apk-abis.js');

    expect(verifier).toContain('libstockfish.so');
    expect(verifier).toContain('zipalign');
    expect(verifier).toContain('llvm-readelf');
    expect(verifier).toContain('0x4000');
  });
});
