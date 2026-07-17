const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = path.resolve(__dirname, '..');
const stockfishArtifacts = require('../stockfish-artifacts.json');

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
    expect(module).toContain('val created = nativeHandle == 0L');
    expect(module).toContain('promise.resolve(created)');
    expect(module).toContain('fun send(command: String)');
    expect(module).toContain('fun terminate()');
    expect(module).toContain('override fun onHostPause()');
    expect(module).toContain('StockfishEngineLine');
    expect(module).not.toMatch(/Chess|FEN|bestmove|MultiPV/);
  });

  it('builds JNI from shared sources and packages canonical NNUE assets once outside ABI libraries', () => {
    const cmake = read('android/app/src/main/cpp/CMakeLists.txt');
    const gradle = read('android/app/build.gradle');
    const module = read('android/app/src/main/java/com/chessticize/mobile/NativeStockfishEngineModule.kt');
    const nativeAdapter = read('android/app/src/main/cpp/stockfish/NativeStockfishEngine.cpp');
    const sharedRunner = read('native/stockfish/Bridge/StockfishRunner.cpp');

    expect(cmake).toContain('../../../../../native/stockfish/Stockfish/src');
    expect(cmake).toContain('NativeStockfishEngine.cpp');
    expect(cmake).toContain('NNUE_EMBEDDING_OFF');
    expect(cmake).not.toContain('-Wa,-I');
    expect(cmake).not.toContain('OBJECT_DEPENDS');
    expect(cmake).not.toMatch(/nn-[a-f0-9]+\.nnue/);
    expect(cmake).toContain('-Wl,-z,max-page-size=16384');
    expect(gradle).toContain('stockfish-artifacts.json');
    expect(gradle).toContain('GenerateChessticizeAssets');
    expect(gradle).toContain('stockfishArtifacts.nnue');
    expect(gradle).toContain('stockfishManifest.set(stockfishArtifactsFile)');
    expect(gradle).toContain('variant.sources.assets.addGeneratedSourceDirectory');
    expect(module).toContain('noBackupFilesDir');
    expect(module).toContain('@Synchronized');
    expect(module).toContain('MessageDigest.getInstance("SHA-256")');
    expect(module).toContain('isCanonicalNetworkFile(target, asset.digestPrefix)');
    expect(module).toContain('File.createTempFile');
    expect(module).toContain('output.fd.sync()');
    expect(module).toContain('Os.rename(temp.absolutePath, target.absolutePath)');
    expect(module).toContain('nativeCreate(bigNetwork.absolutePath, smallNetwork.absolutePath)');
    expect(module).toContain('getJSONArray("nnue")');
    for (const relativePath of stockfishArtifacts.nnue) {
      expect(module).not.toContain(path.basename(relativePath));
    }
    expect(nativeAdapter).toContain('toStdString(environment, bigNetworkPath)');
    expect(nativeAdapter).toContain('toStdString(environment, smallNetworkPath)');
    expect(sharedRunner).toContain('setOption("EvalFile", bigNetworkPath)');
    expect(sharedRunner).toContain('setOption("EvalFileSmall", smallNetworkPath)');
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
    expect(verifier).toContain('stockfish-artifacts.json');
    expect(verifier).toContain('NNUE_ASSET_ENTRIES');
    expect(verifier).toContain('zipalign');
    expect(verifier).toContain('llvm-readelf');
    expect(verifier).toContain('0x4000');
  });
});
