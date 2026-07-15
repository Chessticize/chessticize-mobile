const fs = require('fs');
const path = require('path');

const detoxConfig = require('../.detoxrc');
const mobilePackage = require('../package.json');
const {
  REQUIREMENTS,
  inspectAndroidEnvironment,
  parseJavaMajor,
} = require('../scripts/android-doctor');
const {
  EXPECTED_ABIS,
  MAXIMUM_STOCKFISH_LIBRARY_BYTES,
  NNUE_ASSET_ENTRIES,
  REQUIRED_NATIVE_LIBRARIES,
  STOCKFISH_MANIFEST_ENTRY,
  parseElfLoadAlignments,
  parseNativeAbis,
  verifyApk,
} = require('../scripts/verify-android-apk-abis');
const {
  ANDROID_REQUIREMENTS,
  androidSdkPackages,
  parseGradleProperties,
} = require('../scripts/android-requirements');
const { installAndroidSdk } = require('../scripts/install-android-sdk');

const mobileRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

function completeAndroidFiles(sdkRoot, appDir, repoRoot) {
  return new Set([
    sdkRoot,
    `${sdkRoot}/platforms/android-36/android.jar`,
    `${sdkRoot}/build-tools/36.0.0`,
    `${sdkRoot}/ndk/27.1.12297006/source.properties`,
    `${sdkRoot}/platform-tools/adb`,
    `${sdkRoot}/emulator/emulator`,
    `${sdkRoot}/cmdline-tools/latest/bin/sdkmanager`,
    `${appDir}/android/gradlew`,
    `${appDir}/node_modules/react-native/package.json`,
    `${appDir}/node_modules/@react-native/codegen/package.json`,
    `${appDir}/node_modules/@react-native/gradle-plugin/package.json`,
    `${appDir}/node_modules/detox/package.json`,
    `${repoRoot}/fixtures/puzzles/bundled-core-pack.sqlite`,
  ]);
}

function successfulAndroidToolRun(command, args) {
  if (command === 'java') {
    return { status: 0, stdout: '', stderr: 'openjdk version "17.0.14"' };
  }
  if (command.endsWith('/adb')) {
    return { status: 0, stdout: 'Android Debug Bridge version 1.0.41', stderr: '' };
  }
  if (args[0] === '-list-avds') {
    return { status: 0, stdout: 'Pixel_API_24\nPixel_API_36\n', stderr: '' };
  }
  return { status: 0, stdout: 'Android emulator version 36.1.0', stderr: '' };
}

describe('Android launch baseline', () => {
  it('uses the permanent identity and supported API/ABI envelope', () => {
    const appGradle = read('android/app/build.gradle');
    const gradleProperties = read('android/gradle.properties');
    const activity = read('android/app/src/main/java/com/chessticize/mobile/MainActivity.kt');
    const application = read('android/app/src/main/java/com/chessticize/mobile/MainApplication.kt');

    expect(REQUIREMENTS).toMatchObject({
      minSdk: 24,
      compileSdk: 36,
      targetSdk: 36,
      buildTools: '36.0.0',
      ndk: '27.1.12297006',
      abis: ['arm64-v8a', 'x86_64'],
    });
    expect(appGradle).toContain('namespace "com.chessticize.mobile"');
    expect(appGradle).toContain('applicationId "com.chessticize.mobile"');
    expect(appGradle).toContain('abiFilters(*supportedAndroidAbis)');
    expect(gradleProperties).toContain('reactNativeArchitectures=arm64-v8a,x86_64');
    expect(activity).toContain('package com.chessticize.mobile');
    expect(application).toContain('package com.chessticize.mobile');
    expect(`${appGradle}\n${activity}\n${application}`).not.toContain('com.chessticizemobile');
    expect(mobilePackage.devDependencies).toMatchObject({
      '@react-native/codegen': '0.86.0',
      '@react-native/gradle-plugin': '0.86.0',
    });
  });

  it('loads the Android platform envelope from one canonical configuration', () => {
    const rootGradle = read('android/build.gradle');
    const appGradle = read('android/app/build.gradle');
    const gradleProperties = read('android/gradle.properties');
    const doctor = read('scripts/android-doctor.js');
    const verifier = read('scripts/verify-android-apk-abis.js');
    const workflow = read('../../.github/workflows/mobile-android.yml');

    expect(gradleProperties).toContain('chessticizeMinSdk=24');
    expect(gradleProperties).toContain('chessticizeCompileSdk=36');
    expect(gradleProperties).toContain('chessticizeTargetSdk=36');
    expect(gradleProperties).toContain('chessticizeBuildTools=36.0.0');
    expect(gradleProperties).toContain('chessticizeNdk=27.1.12297006');
    expect(rootGradle).toContain('property("chessticizeMinSdk")');
    expect(appGradle).toContain('findProperty("reactNativeArchitectures")');
    expect(doctor).toContain("require('./android-requirements')");
    expect(verifier).toContain("require('./android-requirements')");
    expect(workflow).toContain('pnpm mobile:install:android-sdk');
    expect(ANDROID_REQUIREMENTS).toBe(REQUIREMENTS);
    expect(androidSdkPackages(ANDROID_REQUIREMENTS)).toEqual([
      'platform-tools',
      'emulator',
      'platforms;android-36',
      'build-tools;36.0.0',
      'ndk;27.1.12297006',
    ]);
    expect(parseGradleProperties('answer=42\n# ignored\nabis=x86_64,arm64-v8a\n')).toEqual({
      answer: '42',
      abis: 'x86_64,arm64-v8a',
    });

    const run = jest.fn(() => ({ status: 0 }));
    expect(installAndroidSdk(run)).toEqual(androidSdkPackages(ANDROID_REQUIREMENTS));
    expect(run).toHaveBeenCalledWith(
      'sdkmanager',
      androidSdkPackages(ANDROID_REQUIREMENTS),
      { stdio: 'inherit' },
    );
  });

  it('keeps debug signing isolated and fails release packaging closed', () => {
    const appGradle = read('android/app/build.gradle');
    const workflow = read('../../.github/workflows/mobile-android.yml');
    const debugSigningReferences = appGradle.match(/signingConfig signingConfigs\.debug/g) || [];

    expect(debugSigningReferences).toHaveLength(1);
    expect(appGradle).toContain('Production Android signing material is required for release packaging.');
    expect(appGradle).toContain('CHESSTICIZE_ANDROID_RELEASE_STORE_FILE');
    expect(appGradle).toContain('signingConfig signingConfigs.release');
    expect(appGradle).toContain('gradle.taskGraph.whenReady');
    expect(appGradle).toContain('taskGraph.allTasks');
    expect(appGradle).not.toContain('gradle.startParameter.taskNames');
    expect(workflow).toContain('verify_release_task_fails_closed :app:bundleRelease');
    expect(workflow).toContain('verify_release_task_fails_closed :app:assemble');
  });

  it('keeps Metro cleartext access out of release manifests', () => {
    const mainManifest = read('android/app/src/main/AndroidManifest.xml');
    const debugManifest = read('android/app/src/debug/AndroidManifest.xml');
    const debugNetworkConfig = read('android/app/src/debug/res/xml/network_security_config.xml');

    expect(mainManifest).not.toContain('android:networkSecurityConfig');
    expect(debugManifest).toContain('android:networkSecurityConfig="@xml/network_security_config"');
    expect(debugNetworkConfig).toContain('<domain includeSubdomains="true">localhost</domain>');
  });

  it('preserves iOS Detox while exposing the Android debug app and attached device', () => {
    expect(detoxConfig.configurations['ios.sim.debug']).toEqual({
      device: 'simulator',
      app: 'ios.debug',
    });
    expect(detoxConfig.apps['android.debug']).toMatchObject({
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
    });
    expect(detoxConfig.configurations['android.attached.debug']).toEqual({
      device: 'android.attached',
      app: 'android.debug',
    });
  });

  it('enables hardware acceleration before booting the Android CI emulators', () => {
    const workflow = read('../../.github/workflows/mobile-android.yml');

    expect(workflow).toContain('name: Enable KVM acceleration');
    expect(workflow).toContain('test -c /dev/kvm');
    expect(workflow).toContain('sudo chmod 0666 /dev/kvm');
  });

  it('keeps Android emulator Detox out of routine pull-request CI', () => {
    const workflow = read('../../.github/workflows/mobile-android.yml');

    expect(workflow).toContain('schedule:');
    expect(workflow).not.toMatch(/^\s+pull_request:/m);
  });

  it('gives both Android API emulators fixed realistic memory and preserves failure diagnostics', () => {
    const workflow = read('../../.github/workflows/mobile-android.yml');
    const launchJob = workflow.slice(
      workflow.indexOf('  android-launch:'),
      workflow.indexOf('  android-progress-backup:'),
    );

    expect(launchJob).toContain('api-level: [24, 36]');
    expect(launchJob).toContain('ram-size: 4096M');
    expect(launchJob.match(/ram-size: 4096M/g)).toHaveLength(1);
    expect(launchJob).toContain('name: Upload Android launch failure diagnostics');
    expect(launchJob).toContain('apps/mobile/artifacts/android-ui/');
  });

  it('keeps the API 36 Stockfish condition in one emulator-runner script line', () => {
    const workflow = read('../../.github/workflows/mobile-android.yml');

    for (const suite of ['android-stockfish', 'flows', 'practice']) {
      const command = `if [ "\${{ matrix.api-level }}" = "36" ]; then DETOX_ACTIVE_SUITE=${suite} pnpm mobile:e2e:test:android:ci; fi`;
      expect(workflow).toContain(command);
      expect(workflow.match(new RegExp(`DETOX_ACTIVE_SUITE=${suite}`, 'g'))).toHaveLength(1);
      expect(workflow).not.toMatch(
        new RegExp(`if \\[ "\\$\\{\\{ matrix\\.api-level \\}\\}" = "36" \\]; then\\s*\\n\\s*DETOX_ACTIVE_SUITE=${suite}`)
      );
    }
    expect(workflow).toContain('timeout-minutes: 75');
  });

  it('uses the doctor-verified SDK with a self-contained offline Android E2E app', () => {
    const androidDetoxScript = read('scripts/android-test-for-detox.sh');

    expect(androidDetoxScript).toContain('ANDROID_HOME');
    expect(androidDetoxScript).toContain('export ADB_PATH=');
    expect(androidDetoxScript).toContain('--configuration android.attached.e2e');
    expect(androidDetoxScript).not.toContain('react-native start');
    expect(androidDetoxScript).not.toContain('"$ADB_PATH" reverse');
    expect(androidDetoxScript).not.toMatch(/^adb reverse/m);
  });

  it('reports a ready environment when every pinned prerequisite is present', () => {
    const sdkRoot = '/sdk';
    const appDir = '/repo/apps/mobile';
    const repoRoot = '/repo';
    const present = completeAndroidFiles(sdkRoot, appDir, repoRoot);

    const report = inspectAndroidEnvironment({
      environment: { ANDROID_HOME: sdkRoot },
      exists: (file) => present.has(file),
      canExecute: (file) => present.has(file),
      run: successfulAndroidToolRun,
      nodeVersion: '22.14.0',
      appDir,
      repoRoot,
    });

    expect(report.ready).toBe(true);
    expect(report.requirements).toEqual(REQUIREMENTS);
    expect(report.checks.filter((check) => check.status === 'fail')).toEqual([]);
  });

  it.each([
    ['22.10.9', 'fail'],
    ['22.11.0', 'pass'],
    ['23.0.0', 'pass'],
  ])('enforces the mobile package Node engine floor for Node %s', (nodeVersion, expectedStatus) => {
    const sdkRoot = '/sdk';
    const appDir = '/repo/apps/mobile';
    const repoRoot = '/repo';
    const present = completeAndroidFiles(sdkRoot, appDir, repoRoot);

    const report = inspectAndroidEnvironment({
      environment: { ANDROID_HOME: sdkRoot },
      exists: (file) => present.has(file),
      canExecute: (file) => present.has(file),
      run: successfulAndroidToolRun,
      nodeVersion,
      appDir,
      repoRoot,
    });

    expect(report.checks.find((check) => check.id === 'node')).toMatchObject({
      status: expectedStatus,
      detail: expect.stringContaining(mobilePackage.engines.node),
    });
  });

  it.each([
    ['React Native Gradle plugin', '@react-native/gradle-plugin/package.json'],
    ['React Native Codegen', '@react-native/codegen/package.json'],
  ])('rejects an install missing %s', (_label, missingDependency) => {
    const sdkRoot = '/sdk';
    const appDir = '/repo/apps/mobile';
    const repoRoot = '/repo';
    const present = completeAndroidFiles(sdkRoot, appDir, repoRoot);
    present.delete(`${appDir}/node_modules/${missingDependency}`);

    const report = inspectAndroidEnvironment({
      environment: { ANDROID_HOME: sdkRoot },
      exists: (file) => present.has(file),
      canExecute: (file) => present.has(file),
      run: successfulAndroidToolRun,
      nodeVersion: '22.14.0',
      appDir,
      repoRoot,
    });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === 'js-dependencies')).toEqual({
      id: 'js-dependencies',
      status: 'fail',
      detail: 'Run pnpm install --frozen-lockfile before Android builds',
    });
  });

  it('parses supported Java versions and rejects a missing SDK', () => {
    expect(parseJavaMajor('openjdk version "17.0.14"')).toBe(17);
    expect(parseJavaMajor('java version "1.8.0_401"')).toBe(8);

    const report = inspectAndroidEnvironment({
      environment: {},
      exists: () => false,
      canExecute: () => false,
      run: () => ({ status: 1, stdout: '', stderr: '' }),
      nodeVersion: '22.14.0',
      appDir: '/repo/apps/mobile',
      repoRoot: '/repo',
    });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === 'android-sdk').status).toBe('fail');
  });

  it('verifies packaged native libraries by ABI', () => {
    const entries = [
      'AndroidManifest.xml',
      STOCKFISH_MANIFEST_ENTRY,
      ...NNUE_ASSET_ENTRIES,
      'lib/x86_64/libreactnative.so',
      'lib/arm64-v8a/libreactnative.so',
      'lib/x86_64/libhermes.so',
      'lib/x86_64/libappmodules.so',
      'lib/arm64-v8a/libappmodules.so',
      'lib/x86_64/libstockfish.so',
      'lib/arm64-v8a/libstockfish.so',
    ].join('\n');

    expect(parseNativeAbis(entries)).toEqual(EXPECTED_ABIS);
    expect(REQUIRED_NATIVE_LIBRARIES).toEqual(['libappmodules.so', 'libstockfish.so']);
    expect(NNUE_ASSET_ENTRIES).toEqual([
      'assets/stockfish/nn-c288c895ea92.nnue',
      'assets/stockfish/nn-37f18f62d772.nnue',
    ]);
    expect(STOCKFISH_MANIFEST_ENTRY).toBe('assets/stockfish/stockfish-artifacts.json');
    expect(parseNativeAbis(`${entries}\nlib/x86/libreactnative.so`)).toEqual([
      'arm64-v8a',
      'x86',
      'x86_64',
    ]);
    const inspectedElfPaths = [];
    const run = jest.fn((command, args) => {
      if (command === 'unzip' && args[0] === '-Z1') {
        return { status: 0, stdout: entries, stderr: '' };
      }
      if (command === 'unzip' && args[0] === '-p') {
        return { status: 0, stdout: Buffer.from('ELF'), stderr: '' };
      }
      if (command.endsWith('llvm-readelf')) {
        inspectedElfPaths.push(args[1]);
        return { status: 0, stdout: '  LOAD 0x0 0x0 0x0 0x1 0x1 R E 0x4000', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    });
    expect(parseElfLoadAlignments('LOAD 0x0 0x0 0x0 0x1 0x1 R E 0x4000'))
      .toEqual([0x4000]);
    expect(parseElfLoadAlignments('LOAD 0x0 0x0 0x0 0x1 0x1 R E 2**14'))
      .toEqual([0x4000]);
    expect(verifyApk('app.apk', run, { ANDROID_HOME: '/sdk' }))
      .toEqual(EXPECTED_ABIS);
    expect(inspectedElfPaths.map((entry) => path.basename(entry)).sort()).toEqual([
      'arm64-v8a-libappmodules.so',
      'arm64-v8a-libreactnative.so',
      'arm64-v8a-libstockfish.so',
      'x86_64-libappmodules.so',
      'x86_64-libhermes.so',
      'x86_64-libreactnative.so',
      'x86_64-libstockfish.so',
    ]);
    expect(() => verifyApk(
      'duplicate-nnue.apk',
      (command, args) => {
        if (command === 'unzip' && args[0] === '-Z1') {
          return { status: 0, stdout: `${entries}\n${NNUE_ASSET_ENTRIES[0]}`, stderr: '' };
        }
        return run(command, args);
      },
      { ANDROID_HOME: '/sdk' },
    )).toThrow('must contain exactly one');
    expect(() => verifyApk(
      'missing-stockfish-manifest.apk',
      (command, args) => {
        if (command === 'unzip' && args[0] === '-Z1') {
          return {
            status: 0,
            stdout: entries
              .split('\n')
              .filter((entry) => entry !== STOCKFISH_MANIFEST_ENTRY)
              .join('\n'),
            stderr: '',
          };
        }
        return run(command, args);
      },
      { ANDROID_HOME: '/sdk' },
    )).toThrow('must contain exactly one assets/stockfish/stockfish-artifacts.json');
    expect(() => verifyApk(
      'embedded-nnue.apk',
      (command, args) => {
        if (command === 'unzip' && args[0] === '-p' && args[2].endsWith('/libstockfish.so')) {
          return { status: 0, stdout: { length: MAXIMUM_STOCKFISH_LIBRARY_BYTES + 1 }, stderr: '' };
        }
        return run(command, args);
      },
      { ANDROID_HOME: '/sdk' },
    )).toThrow('still appears to embed ABI-duplicated NNUE data');
    expect(() => verifyApk(
      'unaligned-appmodules.apk',
      (command, args) => {
        if (command.endsWith('llvm-readelf') && args[1].endsWith('libappmodules.so')) {
          return { status: 0, stdout: '  LOAD 0x0 0x0 0x0 0x1 0x1 R E 0x1000', stderr: '' };
        }
        return run(command, args);
      },
      { ANDROID_HOME: '/sdk' },
    )).toThrow('libappmodules.so has incompatible ELF LOAD alignment');
    expect(() => verifyApk(
      'unexpected.apk',
      () => ({ status: 0, stdout: `${entries}\nlib/x86/libreactnative.so`, stderr: '' }),
    )).toThrow('Unexpected Android ABIs');
    expect(() => verifyApk(
      'empty.apk',
      () => ({ status: 0, stdout: 'AndroidManifest.xml', stderr: '' }),
    )).toThrow('does not contain native libraries');
    expect(() => verifyApk(
      'missing-appmodules.apk',
      () => ({
        status: 0,
        stdout: entries
          .split('\n')
          .filter((entry) => !entry.endsWith('/libappmodules.so'))
          .join('\n'),
        stderr: '',
      }),
    )).toThrow('libappmodules.so');
  });
});
