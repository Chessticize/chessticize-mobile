const fs = require('fs');
const os = require('node:os');
const path = require('path');
const { spawnSync } = require('node:child_process');

const detoxConfig = require('../.detoxrc');
const mobilePackage = require('../package.json');
const stockfishArtifacts = require('../stockfish-artifacts.json');
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
const { validationStepsForApiLevel } = require('../scripts/android-validation-matrix');

const mobileRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

function runIsolatedOfflinePreparation(availableDataKib, { trimDenied = false } = {}) {
  const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-android-capacity-'));
  const scriptsDir = path.join(isolatedRoot, 'scripts');
  const appApk = path.join(isolatedRoot, 'android/app/build/outputs/apk/e2e/app-e2e.apk');
  const testApk = path.join(
    isolatedRoot,
    'android/app/build/outputs/apk/androidTest/e2e/app-e2e-androidTest.apk'
  );
  const fakeAdb = path.join(isolatedRoot, 'fake-adb');
  const callsPath = path.join(isolatedRoot, 'adb-calls.txt');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(path.dirname(appApk), { recursive: true });
  fs.mkdirSync(path.dirname(testApk), { recursive: true });
  fs.copyFileSync(
    path.join(mobileRoot, 'scripts/prepare-android-offline-e2e.sh'),
    path.join(scriptsDir, 'prepare-android-offline-e2e.sh')
  );
  fs.writeFileSync(appApk, 'app');
  fs.writeFileSync(testApk, 'test');
  fs.writeFileSync(fakeAdb, `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_ADB_CALLS"
case "$*" in
  *"shell getprop ro.build.version.sdk"*) printf '24\\n' ;;
  *"shell getprop sys.boot_completed"*) printf '1\\n' ;;
  *"shell pm trim-caches "*[Kk])
    if [ "$FAKE_TRIM_DENIED" = "1" ]; then
      printf 'SecurityException: requires android.permission.CLEAR_APP_CACHE\\n' >&2
      exit 8
    fi
    ;;
  *"shell pm trim-caches"*) printf 'Invalid API 24 trim-caches size: %s\\n' "$*" >&2; exit 8 ;;
  *"shell df -k /data"*) printf 'Filesystem 1K-blocks Used Available Use%% Mounted on\\n/data 8000000 1 ${availableDataKib} 1%% /data\\n' ;;
  *"shell id -u"*) printf '0\\n' ;;
  *"wait-for-device"*) ;;
  *) printf 'Unexpected fake adb call: %s\\n' "$*" >&2; exit 9 ;;
esac
`);
  fs.chmodSync(fakeAdb, 0o755);

  try {
    const result = spawnSync('sh', [path.join(scriptsDir, 'prepare-android-offline-e2e.sh')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ADB_PATH: fakeAdb,
        DETOX_ANDROID_DEVICE: 'emulator-5554',
        FAKE_ADB_CALLS: callsPath,
        FAKE_TRIM_DENIED: trimDenied ? '1' : '0',
      },
    });
    return {
      ...result,
      calls: fs.existsSync(callsPath)
        ? fs.readFileSync(callsPath, 'utf8').trim().split('\n')
        : [],
    };
  } finally {
    fs.rmSync(isolatedRoot, { recursive: true, force: true });
  }
}

function runIsolatedApi24Preinstall({ testPackagePath = 'package:/data/app/test/base.apk' } = {}) {
  const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-android-preinstall-'));
  const scriptsDir = path.join(isolatedRoot, 'scripts');
  const appApk = path.join(isolatedRoot, 'android/app/build/outputs/apk/e2e/app-e2e.apk');
  const testApk = path.join(
    isolatedRoot,
    'android/app/build/outputs/apk/androidTest/e2e/app-e2e-androidTest.apk'
  );
  const fakeAdb = path.join(isolatedRoot, 'fake-adb');
  const callsPath = path.join(isolatedRoot, 'adb-calls.txt');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(path.dirname(appApk), { recursive: true });
  fs.mkdirSync(path.dirname(testApk), { recursive: true });
  fs.copyFileSync(
    path.join(mobileRoot, 'scripts/install-android-detox-apks.sh'),
    path.join(scriptsDir, 'install-android-detox-apks.sh')
  );
  fs.writeFileSync(appApk, 'app');
  fs.writeFileSync(testApk, 'test');
  fs.writeFileSync(fakeAdb, `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_ADB_CALLS"
case "$*" in
  *"shell getprop ro.build.version.sdk"*) printf '24\\n' ;;
  *" install -r -g -t "*) printf 'Performing Streamed Install\\nSuccess\\n' ;;
  *"shell pm path com.chessticize.mobile.test"*) printf '%s\\n' "$FAKE_TEST_PACKAGE_PATH" ;;
  *"shell pm path com.chessticize.mobile"*) printf 'package:/data/app/main/base.apk\\n' ;;
  *"wait-for-device"*) ;;
  *) printf 'Unexpected fake adb call: %s\\n' "$*" >&2; exit 9 ;;
esac
`);
  fs.chmodSync(fakeAdb, 0o755);

  try {
    const result = spawnSync('sh', [path.join(scriptsDir, 'install-android-detox-apks.sh')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ADB_PATH: fakeAdb,
        DETOX_ANDROID_DEVICE: 'emulator-5554',
        FAKE_ADB_CALLS: callsPath,
        FAKE_TEST_PACKAGE_PATH: testPackagePath,
      },
    });
    return {
      ...result,
      calls: fs.existsSync(callsPath)
        ? fs.readFileSync(callsPath, 'utf8').trim().split('\n')
        : [],
    };
  } finally {
    fs.rmSync(isolatedRoot, { recursive: true, force: true });
  }
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
    `${appDir}/stockfish-artifacts.json`,
    `${appDir}/native/stockfish/Bridge/StockfishRunner.cpp`,
    `${appDir}/native/stockfish/${stockfishArtifacts.sourceSentinel}`,
    `${appDir}/android/app/src/main/cpp/stockfish/NativeStockfishEngine.cpp`,
    ...stockfishArtifacts.nnue.map(
      (relativePath) => `${appDir}/native/stockfish/${relativePath}`
    ),
    `${repoRoot}/fixtures/puzzles/bundled-core-pack.sqlite`,
  ]);
}

function inspectIsolatedAndroidDoctor({ manifestContents, missingAppFiles = [] }) {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-android-doctor-'));
  const scriptsDir = path.join(appDir, 'scripts');
  const androidDir = path.join(appDir, 'android');
  const repoRoot = '/repo';
  try {
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(androidDir, { recursive: true });
    fs.copyFileSync(
      path.join(mobileRoot, 'scripts/android-doctor.js'),
      path.join(scriptsDir, 'android-doctor.js')
    );
    fs.copyFileSync(
      path.join(mobileRoot, 'scripts/android-requirements.js'),
      path.join(scriptsDir, 'android-requirements.js')
    );
    fs.copyFileSync(
      path.join(mobileRoot, 'android/gradle.properties'),
      path.join(androidDir, 'gradle.properties')
    );
    fs.copyFileSync(
      path.join(mobileRoot, 'package.json'),
      path.join(appDir, 'package.json')
    );
    if (manifestContents !== undefined) {
      fs.writeFileSync(path.join(appDir, 'stockfish-artifacts.json'), manifestContents);
    }

    const isolatedDoctor = require(path.join(scriptsDir, 'android-doctor.js'));
    const present = completeAndroidFiles('/sdk', appDir, repoRoot);
    if (manifestContents === undefined) {
      present.delete(path.join(appDir, 'stockfish-artifacts.json'));
    }
    for (const relativePath of missingAppFiles) {
      present.delete(path.join(appDir, relativePath));
    }
    return isolatedDoctor.inspectAndroidEnvironment({
      environment: { ANDROID_HOME: '/sdk' },
      exists: (file) => present.has(file),
      canExecute: (file) => present.has(file),
      run: successfulAndroidToolRun,
      nodeVersion: '22.14.0',
      appDir,
      repoRoot,
    });
  } finally {
    fs.rmSync(appDir, { recursive: true, force: true });
  }
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
  it('keeps the shared activity resizable with keyboard and configuration changes handled in place', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');

    expect(manifest).toContain('android:resizeableActivity="true"');
    expect(manifest).toContain('android:windowSoftInputMode="adjustResize"');
    expect(manifest).toContain('android:configChanges="keyboard|keyboardHidden|orientation|screenLayout|screenSize|smallestScreenSize|uiMode"');
    expect(manifest).not.toContain('android:screenOrientation');
  });

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
    expect(mainManifest).toContain('android:enableOnBackInvokedCallback="true"');
    expect(debugManifest).toContain('android:networkSecurityConfig="@xml/network_security_config"');
    expect(debugNetworkConfig).toContain('<domain includeSubdomains="true">localhost</domain>');
  });

  it('keeps review notification taps behind an unexported authenticity boundary', () => {
    const mainManifest = read('android/app/src/main/AndroidManifest.xml');
    const mainActivity = read('android/app/src/main/java/com/chessticize/mobile/MainActivity.kt');
    const notifications = read(
      'android/app/src/main/java/com/chessticize/mobile/ReviewReminderNotificationsModule.kt'
    );
    const tapActivity = read(
      'android/app/src/main/java/com/chessticize/mobile/ReviewReminderTapActivity.kt'
    );

    expect(mainManifest).toMatch(
      /android:name="\.ReviewReminderTapActivity"[\s\S]*?android:exported="false"/
    );
    expect(mainManifest).toMatch(
      /android:name="\.ReviewReminderLifecycleReceiver"[\s\S]*?android:exported="false"/
    );
    expect(notifications).toContain('ReviewReminderTapActivity::class.java');
    expect(notifications).not.toContain('ACTION_OPEN_REVIEW');
    expect(notifications).not.toContain('putExtra("route"');
    expect(mainActivity).not.toContain('ReviewReminderRouteBus.capture');
    expect(tapActivity).toContain('ReviewReminderRouteBus.captureTrustedReviewRoute()');
  });

  it('keeps predictive Back activity access compilable and delegates idle root to Android', () => {
    const activity = read('android/app/src/main/java/com/chessticize/mobile/MainActivity.kt');
    const predictiveBackModule = read(
      'android/app/src/main/java/com/chessticize/mobile/MobilePredictiveBackModule.kt'
    );
    const pinnedReactActivity = read(
      'node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/ReactActivity.java'
    );

    expect(predictiveBackModule).toContain('reactApplicationContext.currentActivity');
    expect(predictiveBackModule).not.toMatch(/register\(currentActivity\)/);
    expect(activity).toContain('ReactNativeBackCallbackController');
    expect(activity).toContain('mBackPressedCallback');
    expect(activity).toContain('reactNativeBackPressedCallback.isEnabled = enabled');
    expect(predictiveBackModule).toContain('setReactNativeBackHandlingEnabled(false)');
    expect(predictiveBackModule).toContain('setReactNativeBackHandlingEnabled(true)');
    expect(pinnedReactActivity).toContain('private final OnBackPressedCallback mBackPressedCallback');
  });

  it('keeps one API 36 callback owner while app predictive Back is enabled', () => {
    const predictiveBackModule = read(
      'android/app/src/main/java/com/chessticize/mobile/MobilePredictiveBackModule.kt'
    );
    const api34Delegate = read(
      'android/app/src/main/java/com/chessticize/mobile/MobilePredictiveBackApi34Delegate.kt'
    );

    expect(predictiveBackModule).toMatch(
      /if \(enabledRequested\) \{\s+\(activity as\? ReactNativeBackCallbackController\)\s+\?\.setReactNativeBackHandlingEnabled\(false\)/
    );
    expect(api34Delegate).toContain('OnBackInvokedDispatcher.PRIORITY_DEFAULT');
    expect(api34Delegate).not.toContain('OnBackInvokedDispatcher.PRIORITY_OVERLAY');
  });

  it('keeps the eagerly loaded API 24 module free of android.window types', () => {
    const predictiveBackModule = read(
      'android/app/src/main/java/com/chessticize/mobile/MobilePredictiveBackModule.kt'
    );
    const api34Delegate = read(
      'android/app/src/main/java/com/chessticize/mobile/MobilePredictiveBackApi34Delegate.kt'
    );

    expect(predictiveBackModule).not.toContain('android.window');
    expect(predictiveBackModule).not.toMatch(
      /\bBackEvent\b|\bOnBackAnimationCallback\b|\bOnBackInvokedCallback\b|\bOnBackInvokedDispatcher\b/
    );
    expect(predictiveBackModule).toContain('Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE');
    expect(predictiveBackModule).toContain('Class.forName(API34_DELEGATE_CLASS)');
    expect(api34Delegate).toContain('android.window.BackEvent');
    expect(api34Delegate).toContain('OnBackAnimationCallback');
    expect(api34Delegate).toMatch(/@Keep\s+@RequiresApi/);
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

  it('gives both Android API emulators enough memory and data capacity for the packaged app', () => {
    const workflow = read('../../.github/workflows/mobile-android.yml');
    const prepareScript = read('scripts/prepare-android-offline-e2e.sh');
    const launchJob = workflow.slice(
      workflow.indexOf('  android-launch:'),
      workflow.indexOf('  android-adaptive-layout:'),
    );

    expect(launchJob).toContain(
      "api-level: ${{ fromJSON(github.event_name == 'schedule' && '[36]' || '[24,36]') }}"
    );
    expect(launchJob).toContain('ram-size: 4096M');
    expect(launchJob.match(/ram-size: 4096M/g)).toHaveLength(1);
    expect(launchJob).toContain('disk-size: 8192M');
    expect(launchJob.match(/disk-size: 8192M/g)).toHaveLength(1);
    expect(prepareScript).toContain('pm trim-caches');
    expect(prepareScript).toContain('shell df -k /data');
    expect(prepareScript).toContain('required_data_bytes');
    expect(prepareScript).toContain('Android /data capacity is insufficient');
    expect(launchJob).toContain('name: Upload Android launch failure diagnostics');
    expect(launchJob).toContain('apps/mobile/artifacts/android-ui/');
  });

  it('fails before Detox when Android cannot stage the packaged APKs safely', () => {
    const ready = runIsolatedOfflinePreparation(700000);
    const insufficient = runIsolatedOfflinePreparation(100);

    expect(ready.status).toBe(0);
    expect(ready.stdout).toContain('Android /data capacity ready');
    expect(ready.calls).toContain(
      '-s emulator-5554 shell pm trim-caches 524289K'
    );
    expect(ready.calls.some((call) => /trim-caches [0-9]+$/.test(call))).toBe(false);
    expect(insufficient.status).toBe(1);
    expect(insufficient.stderr).toContain('Android /data capacity is insufficient');
  });

  it('treats cache-trim permission denial as a warning but keeps capacity fail-closed', () => {
    const ready = runIsolatedOfflinePreparation(700000, { trimDenied: true });
    const insufficient = runIsolatedOfflinePreparation(100, { trimDenied: true });
    const preinstall = ready.status === 0
      ? runIsolatedApi24Preinstall()
      : { status: 99, calls: [] };

    expect(ready.status).toBe(0);
    expect(ready.stderr).toContain('WARN: Android cache trim was unavailable');
    expect(ready.stderr).toContain('android.permission.CLEAR_APP_CACHE');
    expect(ready.stdout).toContain('Android /data capacity ready');
    expect(preinstall.status).toBe(0);
    expect(preinstall.calls.filter((call) => call.includes(' install -r -g -t '))).toHaveLength(2);
    expect(insufficient.status).toBe(1);
    expect(insufficient.stderr).toContain('WARN: Android cache trim was unavailable');
    expect(insufficient.stderr).toContain('Android /data capacity is insufficient');
  });

  it('preinstalls both exact API 24 APKs once and fails closed on package verification', () => {
    const ready = runIsolatedApi24Preinstall();
    const missingTestPackage = runIsolatedApi24Preinstall({ testPackagePath: '' });

    expect(ready.status).toBe(0);
    expect(ready.calls.filter((call) => call.includes(' install -r -g -t '))).toHaveLength(2);
    expect(ready.calls).toEqual(expect.arrayContaining([
      expect.stringContaining('shell pm path com.chessticize.mobile'),
      expect.stringContaining('shell pm path com.chessticize.mobile.test'),
    ]));
    expect(ready.stdout).toContain('Verified preinstalled package com.chessticize.mobile');
    expect(ready.stdout).toContain('Verified preinstalled package com.chessticize.mobile.test');
    expect(missingTestPackage.status).toBe(1);
    expect(missingTestPackage.stderr).toContain(
      'Expected exactly one installed APK for com.chessticize.mobile.test'
    );
  });

  it('keeps the complete API 36 suites in the tested matrix runner', () => {
    const workflow = read('../../.github/workflows/mobile-android.yml');
    const suites = validationStepsForApiLevel(36)
      .filter((step) => step.kind === 'detox')
      .map((step) => step.suite);

    expect(suites).toEqual(expect.arrayContaining([
      'android-history',
      'android-stockfish',
      'android-system-back',
      'android-review-reminders',
      'flows',
      'practice',
    ]));
    expect(workflow).toContain('pnpm mobile:validate:android:matrix');
    expect(workflow).not.toContain('DETOX_ACTIVE_SUITE=');
    expect(workflow).toContain('timeout-minutes: 75');
  });

  it('keeps emulator-runner control flow in the tested Node runner', () => {
    const workflow = read('../../.github/workflows/mobile-android.yml');
    const launchJob = workflow.slice(
      workflow.indexOf('  android-launch:'),
      workflow.indexOf('  android-adaptive-layout:'),
    );
    const script = launchJob.slice(
      launchJob.indexOf('          script: >-'),
      launchJob.indexOf('        env:'),
    );
    expect(launchJob).toContain('script: >-');
    expect(launchJob).toContain('pnpm mobile:validate:android:matrix');
    expect(script).not.toMatch(/\b(?:if|for|while|until|case)\b/);
  });

  it('keeps API 24 bounded while API 36 retains complete shared suites', () => {
    const workflow = read('../../.github/workflows/mobile-android.yml');
    const api24Suites = validationStepsForApiLevel(24)
      .filter((step) => step.kind === 'detox')
      .map((step) => step.suite);
    const api36Suites = validationStepsForApiLevel(36)
      .filter((step) => step.kind === 'detox')
      .map((step) => step.suite);

    expect(api24Suites).toEqual(['android-api24-smoke']);
    expect(api36Suites).toEqual(expect.arrayContaining(['flows', 'practice']));
    expect(workflow.match(/pnpm mobile:validate:android:matrix/g)).toHaveLength(1);
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
      readFile: () => JSON.stringify(stockfishArtifacts),
      nodeVersion: '22.14.0',
      appDir,
      repoRoot,
    });

    expect(report.ready).toBe(true);
    expect(report.requirements).toEqual(REQUIREMENTS);
    expect(report.checks.filter((check) => check.status === 'fail')).toEqual([]);
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'java', status: 'pass' }),
      expect.objectContaining({ id: 'android-sdk', status: 'pass' }),
      expect.objectContaining({ id: 'ndk', status: 'pass' }),
      expect.objectContaining({ id: 'emulator', status: 'pass' }),
      expect.objectContaining({ id: 'signing', status: 'warn' }),
      expect.objectContaining({ id: 'native-library', status: 'pass' }),
      expect.objectContaining({ id: 'detox', status: 'pass' }),
    ]));
  });

  it('distinguishes partial release signing from simulator-ready development setup', () => {
    const sdkRoot = '/sdk';
    const appDir = '/repo/apps/mobile';
    const repoRoot = '/repo';
    const present = completeAndroidFiles(sdkRoot, appDir, repoRoot);

    const report = inspectAndroidEnvironment({
      environment: {
        ANDROID_HOME: sdkRoot,
        CHESSTICIZE_ANDROID_RELEASE_STORE_FILE: '/keys/upload.jks',
      },
      exists: (file) => present.has(file),
      canExecute: (file) => present.has(file),
      run: successfulAndroidToolRun,
      readFile: () => JSON.stringify(stockfishArtifacts),
      nodeVersion: '22.14.0',
      appDir,
      repoRoot,
    });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === 'signing')).toMatchObject({
      status: 'fail',
      detail: expect.stringContaining('partially configured'),
    });
  });

  it('reports missing native-library sources independently from Detox setup', () => {
    const sdkRoot = '/sdk';
    const appDir = '/repo/apps/mobile';
    const repoRoot = '/repo';
    const present = completeAndroidFiles(sdkRoot, appDir, repoRoot);
    present.delete(`${appDir}/native/stockfish/Bridge/StockfishRunner.cpp`);

    const report = inspectAndroidEnvironment({
      environment: { ANDROID_HOME: sdkRoot },
      exists: (file) => present.has(file),
      canExecute: (file) => present.has(file),
      run: successfulAndroidToolRun,
      readFile: () => JSON.stringify(stockfishArtifacts),
      nodeVersion: '22.14.0',
      appDir,
      repoRoot,
    });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === 'native-library')).toMatchObject({
      status: 'fail',
      detail: expect.stringContaining('Stockfish'),
    });
    expect(report.checks.find((check) => check.id === 'detox').status).toBe('pass');
  });

  it.each([
    {
      label: 'missing artifact manifest',
      manifestContents: undefined,
      missingAppFiles: [],
      expectedDetail: 'Stockfish artifact manifest is missing',
    },
    {
      label: 'malformed artifact manifest',
      manifestContents: '{not-json',
      missingAppFiles: [],
      expectedDetail: 'Stockfish artifact manifest is malformed',
    },
    {
      label: 'missing canonical source sentinel',
      manifestContents: JSON.stringify(stockfishArtifacts),
      missingAppFiles: [path.join(stockfishArtifacts.root, stockfishArtifacts.sourceSentinel)],
      expectedDetail: stockfishArtifacts.sourceSentinel,
    },
  ])('fails native-library structurally for $label and still completes diagnostics', ({
    manifestContents,
    missingAppFiles,
    expectedDetail,
  }) => {
    const report = inspectIsolatedAndroidDoctor({ manifestContents, missingAppFiles });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === 'native-library')).toMatchObject({
      id: 'native-library',
      status: 'fail',
      detail: expect.stringContaining(expectedDetail),
    });
    expect(report.checks.find((check) => check.id === 'detox')).toMatchObject({
      status: 'pass',
    });
    expect(report.checks.find((check) => check.id === 'puzzle-pack')).toMatchObject({
      status: 'pass',
    });
    expect(report.checks.at(-1).id).toBe('puzzle-pack');
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
      readFile: () => JSON.stringify(stockfishArtifacts),
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
      readFile: () => JSON.stringify(stockfishArtifacts),
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
      readFile: () => JSON.stringify(stockfishArtifacts),
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
