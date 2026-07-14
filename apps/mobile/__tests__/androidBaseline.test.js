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
  parseNativeAbis,
} = require('../scripts/verify-android-apk-abis');

const mobileRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

describe('Android launch baseline', () => {
  it('uses the permanent identity and supported API/ABI envelope', () => {
    const rootGradle = read('android/build.gradle');
    const appGradle = read('android/app/build.gradle');
    const gradleProperties = read('android/gradle.properties');
    const activity = read('android/app/src/main/java/com/chessticize/mobile/MainActivity.kt');
    const application = read('android/app/src/main/java/com/chessticize/mobile/MainApplication.kt');

    expect(rootGradle).toContain('minSdkVersion = 24');
    expect(rootGradle).toContain('compileSdkVersion = 36');
    expect(rootGradle).toContain('targetSdkVersion = 36');
    expect(appGradle).toContain('namespace "com.chessticize.mobile"');
    expect(appGradle).toContain('applicationId "com.chessticize.mobile"');
    expect(appGradle).toContain('abiFilters "arm64-v8a", "x86_64"');
    expect(gradleProperties).toContain('reactNativeArchitectures=arm64-v8a,x86_64');
    expect(activity).toContain('package com.chessticize.mobile');
    expect(application).toContain('package com.chessticize.mobile');
    expect(`${appGradle}\n${activity}\n${application}`).not.toContain('com.chessticizemobile');
    expect(mobilePackage.devDependencies).toMatchObject({
      '@react-native/codegen': '0.86.0',
      '@react-native/gradle-plugin': '0.86.0',
    });
  });

  it('keeps debug signing isolated and fails release packaging closed', () => {
    const appGradle = read('android/app/build.gradle');
    const debugSigningReferences = appGradle.match(/signingConfig signingConfigs\.debug/g) || [];

    expect(debugSigningReferences).toHaveLength(1);
    expect(appGradle).toContain('Production Android signing material is required for release packaging.');
    expect(appGradle).toContain('CHESSTICIZE_ANDROID_RELEASE_STORE_FILE');
    expect(appGradle).toContain('signingConfig signingConfigs.release');
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

  it('reports a ready environment when every pinned prerequisite is present', () => {
    const sdkRoot = '/sdk';
    const appDir = '/repo/apps/mobile';
    const repoRoot = '/repo';
    const present = new Set([
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
    const run = (command, args) => {
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
    };

    const report = inspectAndroidEnvironment({
      environment: { ANDROID_HOME: sdkRoot },
      exists: (file) => present.has(file),
      canExecute: (file) => present.has(file),
      run,
      nodeVersion: '22.14.0',
      appDir,
      repoRoot,
    });

    expect(report.ready).toBe(true);
    expect(report.requirements).toEqual(REQUIREMENTS);
    expect(report.checks.filter((check) => check.status === 'fail')).toEqual([]);
  });

  it('rejects an install that cannot resolve the React Native Gradle plugin', () => {
    const sdkRoot = '/sdk';
    const appDir = '/repo/apps/mobile';
    const repoRoot = '/repo';
    const present = new Set([
      sdkRoot,
      `${sdkRoot}/platforms/android-36/android.jar`,
      `${sdkRoot}/build-tools/36.0.0`,
      `${sdkRoot}/ndk/27.1.12297006/source.properties`,
      `${sdkRoot}/platform-tools/adb`,
      `${sdkRoot}/emulator/emulator`,
      `${sdkRoot}/cmdline-tools/latest/bin/sdkmanager`,
      `${appDir}/android/gradlew`,
      `${appDir}/node_modules/react-native/package.json`,
      `${appDir}/node_modules/detox/package.json`,
      `${repoRoot}/fixtures/puzzles/bundled-core-pack.sqlite`,
    ]);

    const report = inspectAndroidEnvironment({
      environment: { ANDROID_HOME: sdkRoot },
      exists: (file) => present.has(file),
      canExecute: (file) => present.has(file),
      run: () => ({ status: 0, stdout: 'Pixel_API_36', stderr: 'openjdk version "17.0.14"' }),
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
      'lib/x86_64/libreactnative.so',
      'lib/arm64-v8a/libreactnative.so',
      'lib/x86_64/libhermes.so',
    ].join('\n');

    expect(parseNativeAbis(entries)).toEqual(EXPECTED_ABIS);
    expect(parseNativeAbis(`${entries}\nlib/x86/libreactnative.so`)).toEqual([
      'arm64-v8a',
      'x86',
      'x86_64',
    ]);
  });
});
