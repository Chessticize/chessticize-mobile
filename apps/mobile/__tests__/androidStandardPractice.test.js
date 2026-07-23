const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { validationStepsForApiLevel } = require('../scripts/android-validation-matrix');

const appRoot = join(__dirname, '..');
const repoRoot = join(appRoot, '../..');

function read(relativePath) {
  return readFileSync(join(appRoot, relativePath), 'utf8');
}

function readRepo(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('Android Standard Practice release slice', () => {
  it('keeps progress, puzzle-pack assets, and migration fixtures in distinguishable locations', () => {
    const databaseLayout = read('src/backend/mobileDatabaseLayout.ts');
    const deviceStore = read('src/platform/deviceSQLiteStore.ts');
    const appGradle = read('android/app/build.gradle');

    expect(databaseLayout).toContain('chessticize-mobile.sqlite');
    expect(databaseLayout).toContain('bundled-core-pack.sqlite');
    expect(databaseLayout).toContain('puzzle-packs');
    expect(deviceStore).toContain('MOBILE_DATABASE_LAYOUT.progressDatabaseName');
    expect(deviceStore).toContain('MOBILE_DATABASE_LAYOUT.bundledPuzzlePackDatabaseName');
    expect(appGradle).toContain('puzzlePack.set(puzzlePackSource)');
    expect(appGradle).toContain('variant.sources.assets.addGeneratedSourceDirectory');
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
    expect(e2eManifest).toContain('android.permission.INTERNET');
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
    expect(testConfigModule).toContain('@ReactMethod(isBlockingSynchronousMethod = true)');
    expect(testConfigModule).toContain('fun getLaunchConfig()');
    expect(testConfigModule).not.toContain('override fun getConstants()');
    expect(testConfigModule).toContain('chessticizePuzzleSelectionSeed');
    expect(testConfigModule).toContain('chessticizeStandardTargetCorrect');
    expect(testConfigModule).toContain('chessticizeTestNowMs');
    expect(testConfigModule).toContain('getBundleExtra("launchArgs")');
    expect(testConfigModule).toContain('launchArgs?.getString(key)');
    expect(testConfigModule).toContain('?: intent?.getStringExtra(key)');
    expect(testConfigModule).not.toContain('Log.');
  });

  it('covers fresh offline completion, relaunch persistence, and released-fixture migration through public UI', () => {
    const suiteConfig = read('e2e/suiteConfig.js');
    const launchJourney = read('e2e/android-launch.e2e.js');
    const practiceJourney = read('e2e/android-standard-practice.e2e.js');
    const helpers = read('e2e/helpers.js');
    const androidNetwork = read('e2e/androidNetwork.js');
    const offlineSetup = read('scripts/prepare-android-offline-e2e.sh');
    const migrationJourney = read('e2e/android-migration.e2e.js');
    const workflow = read('../../.github/workflows/mobile-android.yml');
    const standardFixture = require('../../../fixtures/puzzles/android-standard-practice.fixture.json');
    const storageContract = readRepo('packages/storage/test/puzzle-pack-source.test.ts');
    const componentContract = read('__tests__/PracticePocScreen.test.tsx');

    expect(suiteConfig).toContain('android-standard-practice.e2e.js');
    expect(suiteConfig).toContain('android-migration.e2e.js');
    expect(suiteConfig).toContain('ANDROID_OFFLINE_PRACTICE_TEST_MATCH');
    expect(launchJourney).toContain('resetAppState: true');
    expect(launchJourney).not.toContain('delete: true');
    expect(practiceJourney).toContain('resetAppState: true');
    expect(practiceJourney).not.toContain('delete: true');
    expect(standardFixture).toEqual(expect.objectContaining({
      puzzleSelectionSeed: 'android-standard-practice',
      puzzle: expect.objectContaining({
        id: '0CwCS',
        solutionMoves: ['d7c6', 'a3c1', 'd2d1', 'c1d1'],
      }),
      userMoves: ['a3c1', 'c1d1'],
    }));
    expect(standardFixture.userMoves).toEqual([
      standardFixture.puzzle.solutionMoves[1],
      standardFixture.puzzle.solutionMoves[3],
    ]);
    expect(practiceJourney).toContain('android-standard-practice.fixture.json');
    expect(practiceJourney).toContain('standardFixture.puzzleSelectionSeed');
    expect(practiceJourney).toContain('chessticizeStandardTargetCorrect');
    expect(practiceJourney).toContain('standardFixture.puzzle.solutionMoves[2]');
    expect(practiceJourney).toMatch(/'session-side-to-move',\s*'Black to move'/);
    expect(practiceJourney).toContain("by.id('session-side-to-move'))).toBeVisible()");
    expect(practiceJourney).toContain('standardFixture.userMoves[0]');
    expect(practiceJourney).toContain('standardFixture.userMoves[1]');
    expect(practiceJourney).not.toContain("'a3c1'");
    expect(practiceJourney).not.toContain("'c1d1'");
    expect(storageContract).toContain('android-standard-practice.fixture.json');
    expect(storageContract).not.toContain('new DatabaseSync(resolve("fixtures/puzzles/bundled-core-pack.sqlite")');
    expect(componentContract).toContain('Progress 0 of 1');
    expect(componentContract).not.toContain('jest.spyOn(service, "submitMove").mockImplementation');
    expect(componentContract).toContain('FailingAttemptStore');
    expect(practiceJourney).toContain("delete: false");
    expect(practiceJourney).toContain("const RELAUNCH_TEST_NOW_MS = String(Number(TEST_NOW_MS) + 5 * 60_000)");
    expect(practiceJourney).toContain("chessticizeTestNowMs: RELAUNCH_TEST_NOW_MS");
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
    expect(migrationJourney).toContain("'push'");
    expect(migrationJourney).toContain("'mkdir', '-p', 'databases'");
    expect(migrationJourney).toContain("'cp', DEVICE_FIXTURE_PATH, PROGRESS_DATABASE_PATH");
    expect(migrationJourney).not.toContain("'sh',");
    expect(migrationJourney).not.toContain('cat >');
    expect(migrationJourney).toContain("const { androidAdbPath } = require('./androidNetwork');");
    expect(migrationJourney).not.toContain('function androidAdbPath()');
    expect(migrationJourney).toContain('legacy-attempt-standard-wrong');
    const api24Steps = validationStepsForApiLevel(24);
    const api36Steps = validationStepsForApiLevel(36);
    expect(api24Steps[0]).toEqual({
      kind: 'prepare',
      command: 'apps/mobile/scripts/prepare-android-offline-e2e.sh',
    });
    expect(api24Steps[1]).toEqual({
      kind: 'install',
      command: 'apps/mobile/scripts/install-android-detox-apks.sh',
    });
    expect(api24Steps).toContainEqual({
      kind: 'detox',
      suite: 'android-api24-smoke',
      reuseInstalledApp: true,
    });
    expect(api36Steps[0]).toEqual({
      kind: 'prepare',
      command: 'apps/mobile/scripts/prepare-android-offline-e2e.sh',
    });
    expect(api36Steps).toContainEqual({ kind: 'detox', suite: 'android-offline-practice' });
    expect(api36Steps.filter((step) => step.suite === 'android-offline-practice')).toHaveLength(1);
    expect(api36Steps.indexOf(api36Steps[0]))
      .toBeLessThan(api36Steps.findIndex((step) => step.suite === 'android-offline-practice'));
    const launchJob = workflow.slice(
      workflow.indexOf('  android-launch:'),
      workflow.indexOf('  android-progress-backup:'),
    );
    expect(launchJob).toContain('ram-size: 4096M');
    expect(launchJob).toContain('pnpm mobile:validate:android:matrix');
    expect(workflow).not.toContain('if (( android_sdk_level');
    expect(offlineSetup).toContain('set -eu');
    expect(offlineSetup).toContain('shell getprop ro.build.version.sdk');
    expect(offlineSetup).toContain('-s "$device" root');
    expect(offlineSetup).toContain('-s "$device" wait-for-device');
    expect(offlineSetup).toContain('shell getprop sys.boot_completed');
    expect(offlineSetup).toContain('shell id -u');
    expect(offlineSetup).toContain('[ "$adb_user_id" = "0" ]');
  });

  it('passes the repository data-egress audit for gameplay, native, and locked runtime surfaces', () => {
    const rootPackage = JSON.parse(readRepo('package.json'));
    const audit = spawnSync(
      process.execPath,
      [join(repoRoot, 'scripts/mobile-data-egress-audit.mjs'), '--json'],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    const payload = JSON.parse(audit.stdout || '{}');

    expect(rootPackage.scripts['mobile:data-egress-audit'])
      .toBe('node scripts/mobile-data-egress-audit.mjs');
    expect(audit.status).toBe(0);
    expect(payload.status).toBe('pass');
    expect(payload.summary).toEqual(expect.objectContaining({ failed: 0 }));
  });
});
