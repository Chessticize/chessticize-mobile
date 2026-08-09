const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const {
  auditMergedConfiguration,
  parseArguments,
  parseZipListing,
  summarizeArchiveEntries,
} = require('../scripts/android-r8-evidence');
const {
  median,
  parseMemoryOutput,
  parsePackageOutput,
  parseStartOutput,
} = require('../scripts/android-runtime-benchmark');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Android R8 release optimization', () => {
  it('enables complete AGP 8.12 release optimization', () => {
    const build = read('apps/mobile/android/app/build.gradle');
    const properties = read('apps/mobile/android/gradle.properties');

    expect(build).toContain('def enableProguardInReleaseBuilds = true');
    expect(build).toContain('minifyEnabled enableProguardInReleaseBuilds');
    expect(build).toContain('shrinkResources true');
    expect(build).toContain('getDefaultProguardFile("proguard-android-optimize.txt")');
    expect(build).not.toContain('getDefaultProguardFile("proguard-android.txt")');
    expect(properties).toMatch(/^android\.r8\.optimizedResourceShrinking=true$/m);
    expect(properties).not.toMatch(/^android\.enableR8\.fullMode=false$/m);
  });

  it('keeps only the app reflection and JNI boundaries that static analysis cannot see', () => {
    const rules = read('apps/mobile/android/app/proguard-rules.pro');

    expect(rules).toContain(
      '-keepclassmembers,allowoptimization class com.facebook.react.ReactActivity',
    );
    expect(rules).toContain('mBackPressedCallback;');
    expect(rules).toContain(
      '-keep,allowoptimization class com.chessticize.mobile.MobilePredictiveBackApi34Delegate',
    );
    expect(rules).toContain(
      '-keepclasseswithmembernames,includedescriptorclasses,allowoptimization class com.chessticize.mobile.NativeStockfishEngineModule',
    );
    expect(rules).toContain('native <methods>;');
    expect(rules).not.toMatch(
      /-keep[^\n]*class\s+com\.chessticize\.mobile\.\*\*/,
    );
  });

  it('builds and runs Detox against an R8-transformed release-derived APK', () => {
    const build = read('apps/mobile/android/app/build.gradle');
    const detox = read('apps/mobile/.detoxrc.js');
    const mobilePackage = JSON.parse(read('apps/mobile/package.json'));
    const rootPackage = JSON.parse(read('package.json'));
    const detoxRunner = read('apps/mobile/scripts/android-test-for-detox.sh');

    expect(build).toMatch(/releaseE2e\s*\{\s*initWith release/);
    expect(build).toMatch(/releaseE2e[\s\S]*signingConfig signingConfigs\.debug/);
    expect(build).toMatch(
      /releaseE2e[\s\S]*proguardFile "\$\{rootProject\.projectDir\}\/\.\.\/node_modules\/detox\/android\/detox\/proguard-rules-app\.pro"/,
    );
    const releaseBlock = build.match(
      /\n\s{8}release \{([\s\S]*?)\n\s{8}\}\n\s{8}\/\/ Exercise/,
    );
    expect(releaseBlock).not.toBeNull();
    expect(releaseBlock?.[1]).not.toContain('detox/proguard-rules-app.pro');
    expect(detox).toContain("'android.releaseE2e'");
    expect(detox).toContain(
      "binaryPath: 'android/app/build/outputs/apk/releaseE2e/app-releaseE2e.apk'",
    );
    expect(detox).toContain(
      'assembleReleaseE2e bundleReleaseE2e assembleAndroidTest -DtestBuildType=releaseE2e',
    );
    expect(detox).toContain("'android.attached.releaseE2e'");
    expect(detoxRunner).toContain('CHESSTICIZE_ANDROID_DETOX_CONFIGURATION');
    expect(mobilePackage.scripts['e2e:build:android:release']).toBe(
      'detox build --configuration android.attached.releaseE2e',
    );
    expect(mobilePackage.scripts['verify:android:r8']).toBe(
      'node scripts/android-r8-evidence.js',
    );
    expect(mobilePackage.scripts['validate:android:r8']).toContain(
      'ANDROID_VALIDATION_APP_VARIANT=releaseE2e',
    );
    expect(rootPackage.scripts['mobile:e2e:build:android:release']).toBe(
      'pnpm --filter ChessticizeMobile e2e:build:android:release',
    );
    expect(rootPackage.scripts['mobile:verify:android:r8']).toBe(
      'pnpm --filter ChessticizeMobile verify:android:r8',
    );
    expect(rootPackage.scripts['mobile:validate:android:r8']).toBe(
      'pnpm --filter ChessticizeMobile validate:android:r8',
    );
  });

  it('retains R8 diagnostics beside the protected signed release candidate', () => {
    const workflow = read('.github/workflows/mobile-android-release-candidate.yml');

    expect(workflow).toContain('pnpm mobile:verify:android:r8');
    expect(workflow).toContain(
      'apps/mobile/android/app/build/outputs/mapping/release/',
    );
    expect(workflow).toContain(
      'apps/mobile/artifacts/android-r8/release.json',
    );
  });

  it('keeps Detox inspection rules out of the production merged configuration', () => {
    const appRules = [
      '-keep class com.chessticize.mobile.MobilePredictiveBackApi34Delegate {',
      '}',
    ].join('\n');
    expect(auditMergedConfiguration(appRules, 'release')).toEqual({
      appPackageWideKeep: false,
      detoxRulesIncluded: false,
    });
    expect(() => auditMergedConfiguration(
      `${appRules}\n# node_modules/detox/android/detox/proguard-rules-app.pro`,
      'release',
    )).toThrow('Detox-only keep rules');
    expect(() => auditMergedConfiguration(
      '-keep class com.chessticize.mobile.** { *; }',
      'release',
    )).toThrow('package-wide app keep rule');
  });

  it('measures DEX, resources, native libraries, and bundled assets separately', () => {
    const entries = parseZipListing(`
      100  01-01-1981 01:01   classes.dex
       20  01-01-1981 01:01   resources.arsc
       30  01-01-1981 01:01   res/a.xml
       40  01-01-1981 01:01   lib/arm64-v8a/libstockfish.so
       50  01-01-1981 01:01   assets/puzzle.sqlite
       60  01-01-1981 01:01   META-INF/MANIFEST.MF
    `);

    expect(summarizeArchiveEntries(entries).uncompressedBytes).toEqual({
      dex: 100,
      resourceTable: 20,
      resources: 30,
      nativeLibraries: 40,
      assets: 50,
      other: 60,
    });
  });

  it('parses an explicit fail-closed optimization evidence command', () => {
    expect(parseArguments([
      '--variant', 'releaseE2e',
      '--apk', 'app.apk',
      '--bundle', 'app.aab',
      '--mapping-dir', 'mapping',
      '--output', 'report.json',
      '--build-duration-ms', '1234',
    ])).toEqual({
      allowDirty: false,
      variant: 'releaseE2e',
      apk: 'app.apk',
      bundle: 'app.aab',
      mappingDirectory: 'mapping',
      output: 'report.json',
      buildDurationMs: 1234,
    });
    expect(() => parseArguments(['--variant', 'releaseE2e']))
      .toThrow('requires --mapping-directory');
  });

  it('parses reproducible cold-start, version, and memory evidence', () => {
    expect(parseStartOutput(`
      Status: ok
      LaunchState: COLD
      TotalTime: 281
      WaitTime: 282
    `)).toEqual({ launchState: 'COLD', totalTimeMs: 281, waitTimeMs: 282 });
    expect(parsePackageOutput('versionCode=16 minSdk=24\nversionName=1.4.1'))
      .toEqual({ versionCode: 16, versionName: '1.4.1' });
    expect(parseMemoryOutput(`
      Java Heap: 8072 47196
      Native Heap: 16092 20040
      Code: 26224 121780
      TOTAL PSS: 65474 TOTAL RSS: 202924 SWAP PSS: 0
    `)).toEqual({
      totalPssKb: 65474,
      totalRssKb: 202924,
      categories: {
        javaHeap: { pssKb: 8072, rssKb: 47196 },
        nativeHeap: { pssKb: 16092, rssKb: 20040 },
        code: { pssKb: 26224, rssKb: 121780 },
      },
    });
    expect(median([308, 298, 183, 281, 261])).toBe(281);
  });
});
