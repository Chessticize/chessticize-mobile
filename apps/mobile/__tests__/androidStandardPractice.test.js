const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const appRoot = join(__dirname, '..');
const repoRoot = join(appRoot, '../..');

function read(relativePath) {
  return readFileSync(join(appRoot, relativePath), 'utf8');
}

describe('Android Standard Practice release slice', () => {
  it('keeps progress, puzzle-pack assets, and migration fixtures in distinguishable locations', () => {
    const databaseLayout = read('src/backend/mobileDatabaseLayout.ts');
    const deviceStore = read('src/backend/deviceSQLiteStore.ts');
    const appGradle = read('android/app/build.gradle');

    expect(databaseLayout).toContain('chessticize-mobile.sqlite');
    expect(databaseLayout).toContain('bundled-core-pack.sqlite');
    expect(databaseLayout).toContain('puzzle-packs');
    expect(deviceStore).toContain('MOBILE_DATABASE_LAYOUT.progressDatabaseName');
    expect(deviceStore).toContain('MOBILE_DATABASE_LAYOUT.bundledPuzzlePackDatabaseName');
    expect(appGradle).toContain('generated/assets/puzzle-pack');
    expect(appGradle).toContain('puzzle-packs');
    expect(appGradle).not.toContain('fixtures/migrations');
  });

  it('selects the native platform capability composition at the application root', () => {
    const app = read('App.tsx');

    expect(app).toContain('mobilePlatformCapabilityFactoryFor(Platform.OS');
    expect(app).not.toContain('createIOSMobilePlatformCapabilitiesSync()');
  });

  it('builds a self-contained debug-signed E2E APK instead of depending on Metro', () => {
    const appGradle = read('android/app/build.gradle');
    const detoxConfig = read('.detoxrc.js');
    const mobilePackage = JSON.parse(read('package.json'));
    const runner = read('scripts/android-test-for-detox.sh');
    const e2eManifest = read('android/app/src/e2e/AndroidManifest.xml');
    const e2eNetworkSecurityConfig = read('android/app/src/e2e/res/xml/network_security_config.xml');

    expect(appGradle).toContain('e2e {');
    expect(appGradle).toContain('initWith debug');
    expect(appGradle).toContain('matchingFallbacks = ["debug"]');
    expect(appGradle).toContain('manifestPlaceholders = [usesCleartextTraffic: false]');
    expect(appGradle).toContain('hermesCommand = "$rootDir/../node_modules/hermes-compiler/hermesc/%OS-BIN%/hermesc"');
    expect(e2eManifest).toContain('android:networkSecurityConfig="@xml/network_security_config"');
    expect(e2eNetworkSecurityConfig).toContain('<base-config cleartextTrafficPermitted="false"');
    expect(e2eNetworkSecurityConfig).toContain('<domain-config cleartextTrafficPermitted="true"');
    expect(e2eNetworkSecurityConfig).toContain('<domain includeSubdomains="false">localhost</domain>');
    expect(detoxConfig).toContain("'android.e2e'");
    expect(detoxConfig).toContain('app-e2e.apk');
    expect(mobilePackage.devDependencies['hermes-compiler']).toBe('250829098.0.14');
    expect(runner).not.toContain('react-native start');
    expect(runner).not.toContain('adb reverse');
  });

  it('registers the maintained Android launch-config boundary for deterministic public journeys', () => {
    const application = read('android/app/src/main/java/com/chessticize/mobile/MainApplication.kt');
    const testConfigModule = read('android/app/src/main/java/com/chessticize/mobile/ChessticizeTestLaunchConfigModule.kt');

    expect(application).toContain('ChessticizeTestLaunchConfigPackage()');
    expect(testConfigModule).toContain('BuildConfig.DEBUG');
    expect(testConfigModule).toContain('chessticizePuzzleSelectionSeed');
    expect(testConfigModule).toContain('chessticizeStandardTargetCorrect');
    expect(testConfigModule).toContain('chessticizeTestNowMs');
    expect(testConfigModule).not.toContain('Log.');
  });

  it('covers fresh offline completion, relaunch persistence, and released-fixture migration through public UI', () => {
    const suiteConfig = read('e2e/suiteConfig.js');
    const practiceJourney = read('e2e/android-standard-practice.e2e.js');
    const helpers = read('e2e/helpers.js');
    const androidNetwork = read('e2e/androidNetwork.js');
    const offlineSetup = read('scripts/prepare-android-offline-e2e.sh');
    const migrationJourney = read('e2e/android-migration.e2e.js');
    const workflow = read('../../.github/workflows/mobile-android.yml');

    expect(suiteConfig).toContain('android-standard-practice.e2e.js');
    expect(suiteConfig).toContain('android-migration.e2e.js');
    expect(practiceJourney).toContain('chessticizePuzzleSelectionSeed');
    expect(practiceJourney).toContain('chessticizeStandardTargetCorrect');
    expect(practiceJourney).toContain("by.id('session-last-move-overlay'))).toExist()");
    expect(practiceJourney).toMatch(/'session-last-move-overlay',\s*'Last move d2 to d1'/);
    expect(practiceJourney).toMatch(/'session-side-to-move',\s*'Black to move'/);
    expect(practiceJourney).toContain("by.id('session-side-to-move'))).toBeVisible()");
    expect(practiceJourney).toContain("'a3c1'");
    expect(practiceJourney).toContain("'c1d1'");
    expect(practiceJourney).toContain("delete: false");
    expect(practiceJourney).toContain("history-tab");
    expect(helpers).toContain('androidBoardTapPoint');
    expect(helpers).toContain("'wm', 'density'");
    expect(helpers).toContain("'wm', 'size'");
    expect(androidNetwork).toContain("'airplane_mode_on'");
    expect(androidNetwork).toContain("'cmd',");
    expect(androidNetwork).toContain("'connectivity',");
    expect(androidNetwork).toContain("'dumpsys', 'connectivity'");
    expect(androidNetwork).not.toContain("'svc'");
    expect(migrationJourney).toContain('schema-v0-ios-1.0.0.sqlite');
    expect(migrationJourney).toContain('run-as');
    expect(migrationJourney).toContain('legacy-attempt-standard-wrong');
    expect(workflow).toContain('DETOX_ACTIVE_SUITE=android-standard-practice');
    expect(workflow).toContain('DETOX_ACTIVE_SUITE=android-migration');
    expect(workflow).toContain('apps/mobile/scripts/prepare-android-offline-e2e.sh');
    expect(workflow.indexOf('apps/mobile/scripts/prepare-android-offline-e2e.sh'))
      .toBeLessThan(workflow.indexOf('DETOX_ACTIVE_SUITE=android-launch'));
    expect(workflow).not.toContain('if (( android_sdk_level');
    expect(offlineSetup).toContain('set -eu');
    expect(offlineSetup).toContain('shell getprop ro.build.version.sdk');
    expect(offlineSetup).toContain('-s "$device" root');
    expect(offlineSetup).toContain('-s "$device" wait-for-device');
    expect(offlineSetup).toContain('shell getprop sys.boot_completed');
    expect(offlineSetup).toContain('shell id -u');
    expect(offlineSetup).toContain('[ "$adb_user_id" = "0" ]');
  });

  it('adds no telemetry dependency or Android gameplay upload pipeline', () => {
    const rootPackage = readFileSync(join(repoRoot, 'package.json'), 'utf8');
    const mobilePackage = read('package.json');
    const gradle = read('android/app/build.gradle');
    const forbidden = /sentry|firebase-analytics|appcenter|bugsnag|datadog|segment|mixpanel/i;

    expect(rootPackage).not.toMatch(forbidden);
    expect(mobilePackage).not.toMatch(forbidden);
    expect(gradle).not.toMatch(forbidden);
  });
});
