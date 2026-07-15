const { accessSync, constants, readFileSync, statSync } = require('node:fs');
const { join } = require('node:path');
const {
  ANDROID_AUTO_BACKUP_QUOTA_BYTES,
  ANDROID_PROGRESS_BACKUP_MAX_BYTES,
  PROGRESS_DATABASE_FILES,
  assessBackupPayload,
  assertBackupPayloadWithinContract,
  measureDeviceFiles,
  parseArguments,
} = require('../scripts/verify-android-progress-backup');

const appRoot = join(__dirname, '..');
const repoRoot = join(appRoot, '../..');

function read(relativePath) {
  return readFileSync(join(appRoot, relativePath), 'utf8');
}

function readRepo(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function includePaths(xml) {
  return [...xml.matchAll(/<include\s+domain="database"\s+path="([^"]+)"(?:\s+requireFlags="([^"]+)")?\s*\/>/g)]
    .map(([, path, flags]) => ({ path, flags }));
}

describe('Android Progress Backup', () => {
  it('uses API-appropriate encrypted-cloud and device-transfer allowlists', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const legacyBase = read('android/app/src/main/res/xml/backup_rules.xml');
    const legacyEncryptedAndD2d = read('android/app/src/main/res/xml-v28/backup_rules.xml');
    const modern = read('android/app/src/main/res/xml/data_extraction_rules.xml');

    expect(manifest).toContain('android:allowBackup="true"');
    expect(manifest).toContain('android:fullBackupOnly="true"');
    expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"');
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');

    expect(legacyBase).not.toContain('<include');
    for (const domain of ['root', 'file', 'database', 'sharedpref', 'external']) {
      expect(legacyBase).toContain(`<exclude domain="${domain}" path="."`);
    }

    expect(includePaths(legacyEncryptedAndD2d)).toEqual([
      { path: PROGRESS_DATABASE_FILES[0], flags: 'clientSideEncryption' },
      { path: PROGRESS_DATABASE_FILES[0], flags: 'deviceToDeviceTransfer' },
    ]);

    expect(modern).toContain('<cloud-backup disableIfNoEncryptionCapabilities="true">');
    expect(modern).toContain('<device-transfer>');
    expect(modern).not.toContain('<cross-platform-transfer');
    const modernIncludes = includePaths(modern);
    expect(modernIncludes).toEqual([
      { path: PROGRESS_DATABASE_FILES[0], flags: undefined },
      { path: PROGRESS_DATABASE_FILES[0], flags: undefined },
    ]);
    expect(modern).not.toContain('path="."');
    expect(`${legacyEncryptedAndD2d}\n${modern}`).not.toContain('bundled-core-pack.sqlite');
    expect(`${legacyEncryptedAndD2d}\n${modern}`).not.toContain('puzzle-packs');
    expect(`${legacyEncryptedAndD2d}\n${modern}`).not.toContain('.nnue');
    expect(`${legacyEncryptedAndD2d}\n${modern}`).not.toContain('cross-platform-transfer');
    expect(`${legacyEncryptedAndD2d}\n${modern}`).not.toContain('sqlite-shm');
  });

  it('maps the allowlist to the production Android database path and minimal SQLite sidecars', () => {
    const databaseLayout = read('src/backend/mobileDatabaseLayout.ts');
    const deviceStore = read('src/backend/deviceSQLiteStore.ts');
    const mobilePractice = read('src/backend/mobilePractice.ts');
    const migrationJourney = read('e2e/android-migration.e2e.js');

    expect(databaseLayout).toContain('progressDatabaseName: "chessticize-mobile.sqlite"');
    expect(deviceStore).toContain('return new DeviceSQLiteStore(open({ name }))');
    expect(mobilePractice).toContain(
      'DeviceSQLiteStore.open(MOBILE_DATABASE_LAYOUT.progressDatabaseName)',
    );
    expect(migrationJourney).toContain(
      "const PROGRESS_DATABASE_PATH = 'databases/chessticize-mobile.sqlite'",
    );
    expect(PROGRESS_DATABASE_FILES).toEqual([
      'chessticize-mobile.sqlite',
      'chessticize-mobile.sqlite-journal',
      'chessticize-mobile.sqlite-wal',
    ]);
  });

  it('keeps a 5 MiB guard band below Android Auto Backup quota and fails closed', () => {
    expect(ANDROID_AUTO_BACKUP_QUOTA_BYTES).toBe(25 * 1024 * 1024);
    expect(ANDROID_PROGRESS_BACKUP_MAX_BYTES).toBe(20 * 1024 * 1024);

    const withinContract = assessBackupPayload([
      { name: PROGRESS_DATABASE_FILES[0], bytes: ANDROID_PROGRESS_BACKUP_MAX_BYTES },
    ]);
    expect(withinContract).toMatchObject({
      status: 'pass',
      headroomBytes: 5 * 1024 * 1024,
    });

    expect(() => assertBackupPayloadWithinContract([
      { name: PROGRESS_DATABASE_FILES[0], bytes: ANDROID_PROGRESS_BACKUP_MAX_BYTES + 1 },
    ])).toThrow('exceeds the 20 MiB release contract');
  });

  it('counts each eligible physical file once and fails closed on sidecar stat errors', () => {
    expect(() => assessBackupPayload([
      { name: PROGRESS_DATABASE_FILES[0], bytes: 100 },
      { name: PROGRESS_DATABASE_FILES[0], bytes: 100 },
    ])).toThrow('Duplicate Android Progress Backup file');

    const missingSidecar = Object.assign(new Error('stat failed'), {
      status: 1,
      stderr: Buffer.from(
        `stat: databases/${PROGRESS_DATABASE_FILES[1]}: No such file or directory\n`,
      ),
    });
    const missingRun = jest.fn((command, args) => {
      const path = args.at(-1);
      if (path.endsWith(PROGRESS_DATABASE_FILES[1])) {
        throw missingSidecar;
      }
      return path.endsWith(PROGRESS_DATABASE_FILES[0]) ? '100\n' : '20\n';
    });
    expect(measureDeviceFiles({
      adbPath: '/sdk/adb',
      serial: 'emulator-5554',
      run: missingRun,
    })).toEqual([
      { name: PROGRESS_DATABASE_FILES[0], bytes: 100 },
      { name: PROGRESS_DATABASE_FILES[2], bytes: 20 },
    ]);
    expect(missingRun).toHaveBeenCalledTimes(PROGRESS_DATABASE_FILES.length);

    for (const failure of [
      Object.assign(new Error('stat failed'), { status: 1, stderr: 'adb: device offline\n' }),
      Object.assign(new Error('stat failed'), {
        status: 1,
        stderr: 'run-as: package not debuggable: com.chessticize.mobile\n',
      }),
      Object.assign(new Error('stat failed'), {
        status: 1,
        stderr: `stat: databases/${PROGRESS_DATABASE_FILES[2]}: Permission denied\n`,
      }),
      Object.assign(new Error('stat failed'), {
        status: 2,
        stderr: `stat: databases/${PROGRESS_DATABASE_FILES[1]}: No such file or directory\n`,
      }),
      Object.assign(new Error('spawn adb EPIPE'), { code: 'EPIPE' }),
    ]) {
      expect(() => measureDeviceFiles({
        adbPath: '/sdk/adb',
        serial: 'emulator-5554',
        run: (command, args) => {
          if (args.at(-1).endsWith(PROGRESS_DATABASE_FILES[1])) {
            throw failure;
          }
          return '100\n';
        },
      })).toThrow('Unable to measure optional progress database sidecar');
    }

    const missingRequired = Object.assign(new Error('stat failed'), {
      status: 1,
      stderr: `stat: databases/${PROGRESS_DATABASE_FILES[0]}: No such file or directory\n`,
    });
    expect(() => measureDeviceFiles({
      adbPath: '/sdk/adb',
      serial: 'emulator-5554',
      run: () => { throw missingRequired; },
    })).toThrow('Unable to measure required progress database');
  });

  it.each([
    ['', 'empty'],
    [' \n', 'whitespace-only'],
    ['12.5\n', 'decimal'],
    ['1e3\n', 'exponent'],
    ['-1\n', 'negative'],
    ['9007199254740992\n', 'out-of-range'],
    ['123 bytes\n', 'mixed text'],
  ])('rejects %s successful stat output before quota assessment (%s)', (output) => {
    expect(() => measureDeviceFiles({
      adbPath: '/sdk/adb',
      serial: 'emulator-5554',
      run: () => output,
    })).toThrow('Invalid stat byte count');
  });

  it('normalizes one leading separator from the nested root pnpm invocation', () => {
    const restoreEvidenceScript = read('scripts/android-progress-backup-restore-evidence.sh');
    const rootPackage = JSON.parse(readRepo('package.json'));
    const mobilePackage = JSON.parse(read('package.json'));

    expect(restoreEvidenceScript).toContain(
      'pnpm mobile:verify:android:backup -- --adb-device "$DEVICE" --json',
    );
    expect(rootPackage.scripts['mobile:verify:android:backup']).toBe(
      'pnpm --filter ChessticizeMobile verify:android:backup',
    );
    expect(mobilePackage.scripts['verify:android:backup']).toBe(
      'node scripts/verify-android-progress-backup.js',
    );
    expect(parseArguments(['--', '--adb-device', 'emulator-5554', '--json'])).toEqual({
      json: true,
      paths: [],
      serial: 'emulator-5554',
    });
  });

  it('keeps device-only and local-path-only quota modes distinct', () => {
    expect(parseArguments(['--adb-device', 'emulator-5554', '--json'])).toEqual({
      json: true,
      paths: [],
      serial: 'emulator-5554',
    });
    expect(parseArguments([
      '--',
      '--database', '/tmp/chessticize-mobile.sqlite',
      '--wal', '/tmp/chessticize-mobile.sqlite-wal',
    ])).toEqual({
      json: false,
      paths: [
        { name: 'chessticize-mobile.sqlite', path: '/tmp/chessticize-mobile.sqlite' },
        { name: 'chessticize-mobile.sqlite-wal', path: '/tmp/chessticize-mobile.sqlite-wal' },
      ],
    });
  });

  it('rejects mixed modes after normalization without swallowing interior separators', () => {
    expect(() => parseArguments([
      '--', '--adb-device', 'emulator-5554', '/tmp/chessticize-mobile.sqlite',
    ])).toThrow('Use either --adb-device or local database paths, not both.');
    expect(() => parseArguments([
      '--adb-device', 'emulator-5554', '--', '/tmp/chessticize-mobile.sqlite',
    ])).toThrow('Use either --adb-device or local database paths, not both.');
    expect(() => parseArguments([
      '--', '--', '--adb-device', 'emulator-5554',
    ])).toThrow('Use either --adb-device or local database paths, not both.');
  });

  it('measures the released progress fixture as real SQLite payload', () => {
    const fixturePath = join(
      repoRoot,
      'packages/storage/test/fixtures/migrations/schema-v0-ios-1.0.0.sqlite',
    );
    const payload = assertBackupPayloadWithinContract([
      { name: PROGRESS_DATABASE_FILES[0], bytes: statSync(fixturePath).size },
    ]);

    expect(payload.totalBytes).toBeGreaterThan(0);
    expect(payload.status).toBe('pass');
    expect(readRepo('packages/storage/test/sqlite-migration.test.ts'))
      .toContain('schema-v0-ios-1.0.0.sqlite');
  });

  it('records public restore journeys and privacy boundaries without app sync', () => {
    const workflow = readRepo('.github/workflows/mobile-android.yml');
    const suiteConfig = read('e2e/suiteConfig.js');
    const evidenceScript = read('scripts/android-progress-backup-evidence.sh');
    const restoreEvidenceScript = read('scripts/android-progress-backup-restore-evidence.sh');
    const androidDetoxScript = read('scripts/android-test-for-detox.sh');
    const restoreJourney = read('e2e/android-progress-backup-restore.e2e.js');
    const privacy = readRepo('docs/ANDROID_PRIVACY_DISCLOSURE.md');
    const policy = readRepo('docs/PRIVACY_POLICY.md');

    expect(suiteConfig).toContain('android-progress-backup-restore.e2e.js');
    expect(evidenceScript).toContain('com.android.localtransport/.LocalTransport');
    expect(evidenceScript).toContain(
      "backup_local_transport_parameters 'is_encrypted=true,log_agent_results=true'",
    );
    expect(evidenceScript.indexOf('is_encrypted=true')).toBeLessThan(
      evidenceScript.indexOf('bmgr transport "$LOCAL_TRANSPORT"'),
    );
    expect(evidenceScript).toContain('$MODE-selected-transport.txt');
    expect(evidenceScript).toContain('$MODE-transport-parameters.txt');
    expect(evidenceScript).toContain('backup_enable_d2d_test_mode:');
    expect(evidenceScript).toContain('com.google.android.gms/.backup.migrate.service.D2dTransport');
    expect(evidenceScript).toContain('backup_enable_d2d_test_mode 1');
    expect(evidenceScript).toContain(
      'grep -F "Package $APP_ID with result: Success"',
    );
    expect(evidenceScript).not.toContain(
      'grep -F "Backup finished with result: Success"',
    );
    const launcherCommand =
      'adb_cmd shell am start -W -n "$APP_ID/.MainActivity" | grep -F "Status: ok"';
    const launcherIndex = evidenceScript.indexOf(launcherCommand);
    const backupNowIndex = evidenceScript.indexOf(
      'adb_cmd shell bmgr backupnow --monitor-verbose',
    );
    expect(launcherIndex).toBeGreaterThan(-1);
    expect(launcherIndex).toBeLessThan(backupNowIndex);
    expect(evidenceScript.slice(launcherIndex, backupNowIndex)).not.toContain(
      'am force-stop',
    );
    expect(evidenceScript).toContain('adb_cmd logcat -c');
    expect(evidenceScript).toContain('$MODE-backup-logcat.txt');
    expect(evidenceScript).toContain('adb_cmd shell dumpsys backup');
    expect(evidenceScript).toContain('$MODE-dumpsys-backup.txt');
    expect(evidenceScript).toContain('bmgr init "$D2D_TRANSPORT"');
    expect(evidenceScript).toContain('pm uninstall --user 0');
    expect(evidenceScript).toContain('install-multiple -t --user 0');
    expect(restoreJourney).toContain("delete: false");
    expect(restoreJourney).toMatch(
      /['"]released-fixture['"]:\s*['"]1780920000000['"]/,
    );
    expect(restoreJourney).toContain("history-attempt-legacy-attempt-standard-wrong");
    expect(androidDetoxScript).toContain('CHESSTICIZE_DETOX_REUSE_INSTALLED_APP');
    expect(androidDetoxScript).toContain('detox_args+=(--reuse)');
    expect(workflow).toContain('name: Android Progress Backup restore evidence');
    expect(restoreEvidenceScript).toContain('cloud-encrypted');
    expect(restoreEvidenceScript).toContain('device-transfer');
    expect(restoreEvidenceScript).toContain('pnpm mobile:verify:android:backup');
    expect(workflow).toContain('commit-sha=$GITHUB_SHA');
    expect(restoreEvidenceScript).toContain('tracked-worktree-after.txt');
    expect(restoreEvidenceScript).toContain('result=pass');
    expect(workflow).toContain(
      'apps/mobile/scripts/android-progress-backup-restore-evidence.sh',
    );
    expect(workflow).toMatch(
      /script: \|\n {12}apps\/mobile\/scripts\/android-progress-backup-restore-evidence\.sh\n {8}env:/,
    );
    expect(workflow).not.toContain('record_restored_install() {');
    expect(workflow).not.toContain('assert_restored_progress() {');
    expect(() => accessSync(
      join(appRoot, 'scripts/android-progress-backup-restore-evidence.sh'),
      constants.X_OK,
    )).not.toThrow();
    expect(restoreEvidenceScript.match(/CHESSTICIZE_DETOX_REUSE_INSTALLED_APP=1/g))
      .toHaveLength(1);
    expect(restoreEvidenceScript).toContain(
      'record_restored_install "$evidence_prefix-before-detox"',
    );
    expect(restoreEvidenceScript).toContain(
      'record_restored_install "$evidence_prefix-after-detox"',
    );
    expect(restoreEvidenceScript).toContain('$evidence_prefix-payload.json');
    expect(restoreEvidenceScript).toContain('$evidence_prefix-package.txt');
    expect(restoreEvidenceScript).toContain('shell pm path com.chessticize.mobile.test');
    expect(restoreEvidenceScript).toContain(
      'assert_restored_progress current-progress cloud-restored',
    );
    expect(restoreEvidenceScript).toContain(
      'assert_restored_progress released-fixture device-transfer-restored',
    );

    expect(privacy).toContain('Android-managed backup');
    expect(privacy).toContain('Zero App Telemetry');
    expect(privacy).toContain('does not create a Chessticize account');
    expect(privacy).toContain('not continuous synchronization');
    expect(policy).toContain('Android Progress Backup');
    expect(policy).toContain('does not receive this backup data');
    expect(privacy).toContain('does not enable transfer between Android and iOS');
    expect(policy.replace(/\s+/g, ' ')).toContain('does not enable transfer between Android and iOS');
  });

  it('runs the real APK through API 24, API 30, and API 36 backup policy selection', () => {
    const workflow = readRepo('.github/workflows/mobile-android.yml');
    const policyEvidenceScript = read('scripts/android-progress-backup-policy-evidence.sh');
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const backupAgent = read(
      'android/app/src/main/java/com/chessticize/mobile/backup/ProgressBackupAgent.java',
    );
    const backupPolicy = read(
      'android/app/src/main/java/com/chessticize/mobile/backup/ProgressBackupPolicy.java',
    );
    const backupPolicyTest = read(
      'android/app/src/test/java/com/chessticize/mobile/backup/ProgressBackupPolicyTest.java',
    );
    const backupContract = read('docs/ANDROID_PROGRESS_BACKUP.md');

    expect(workflow).toContain('android-progress-backup-policy:');
    expect(workflow).toContain('api-level: [24, 30, 36]');
    expect(workflow).toContain('./gradlew :app:testDebugUnitTest');
    expect(workflow).toContain(
      '--tests com.chessticize.mobile.backup.ProgressBackupPolicyTest',
    );
    expect(workflow).toContain(
      'script: apps/mobile/scripts/android-progress-backup-policy-evidence.sh',
    );
    expect(workflow).toContain(
      'name: android-progress-backup-policy-api-${{ matrix.api-level }}',
    );
    expect(policyEvidenceScript).toContain('set -euo pipefail');
    expect(policyEvidenceScript).toContain('case "$SDK_LEVEL"');
    expect(policyEvidenceScript).toContain(
      "run_case no-capability 'non_incremental_only=false' 0 false 0 none",
    );
    expect(policyEvidenceScript).toContain(
      "run_case encryption-only 'is_encrypted=true,is_device_transfer=false",
    );
    expect(policyEvidenceScript).toContain(
      "run_case d2d-only 'is_encrypted=false,is_device_transfer=true",
    );
    expect(policyEvidenceScript).toContain(
      "run_case both 'is_encrypted=true,is_device_transfer=true",
    );
    expect(policyEvidenceScript).toContain('adb_cmd shell bmgr init "$LOCAL_TRANSPORT"');
    expect(policyEvidenceScript).toContain(
      'adb_cmd shell bmgr wipe "$LOCAL_TRANSPORT" "$APP_ID"',
    );
    expect(policyEvidenceScript).toContain('$case_name-transport-archive-paths.txt');
    expect(policyEvidenceScript).toContain('$case_name-app-data-archive-entries.txt');
    expect(policyEvidenceScript).toContain('seeded-app-data-sha256.txt');
    expect(policyEvidenceScript).toContain('Android backup policy fixture markers must be unique');
    expect(policyEvidenceScript).toContain('diff -u "$expected_entries" "$app_data_entries"');
    expect(policyEvidenceScript).toContain('workflow-artifact-apk-sha256.txt');
    expect(policyEvidenceScript).toContain('installed-apk-sha256.txt');
    expect(manifest).toContain('android:backupAgent=".backup.ProgressBackupAgent"');
    expect(backupAgent).not.toContain('super.onFullBackup');
    expect(backupAgent).not.toContain('onRestoreFile');
    expect(backupAgent.indexOf('Build.VERSION.SDK_INT < Build.VERSION_CODES.P'))
      .toBeLessThan(backupAgent.indexOf('data.getTransportFlags()'));
    expect(backupAgent.match(/fullBackupFile\(/g)).toHaveLength(1);
    expect(backupPolicy).toContain(
      'private static final String[] DATABASE_SUFFIXES = {"", "-journal", "-wal"};',
    );
    expect(backupPolicy).toContain('!candidate.isFile()');
    expect(backupPolicyTest).toContain('apiBeforeTransportFlagsFailsClosedForEveryMask');
    expect(backupPolicyTest).toContain('apiWithTransportFlagsUsesOnceOnlyOrSemantics');
    expect(backupPolicyTest).toContain(
      'selectsOnlyCanonicalExistingRegularDatabaseFilesOnce',
    );
    expect(backupPolicyTest).toContain('returnsNoPayloadWhenMainAndSidecarsAreMissing');
    expect(policyEvidenceScript).toContain('dd "of=$relative_path"');
    expect(policyEvidenceScript).not.toContain('sh -c "cat > databases/$name"');
    for (const capabilityCase of [
      'neither',
      'encryption-only',
      'd2d-only',
      'both',
    ]) {
      expect(policyEvidenceScript).toContain(capabilityCase);
    }
    for (const trap of [
      'credential-root-trap.bin',
      'credential-file-trap.bin',
      'credential-sharedpref-trap.xml',
      'credential-database-trap.bin',
      'device-root-trap.bin',
      'device-file-trap.bin',
      'device-sharedpref-trap.xml',
      'device-database-trap.bin',
    ]) {
      expect(policyEvidenceScript).toContain(trap);
    }
    expect(policyEvidenceScript).toContain("APP_DATA_DOMAINS='r|f|db|sp|d_r|d_f|d_db|d_sp|ef'");
    expect(policyEvidenceScript).toContain('commit-sha=$GITHUB_SHA');
    expect(policyEvidenceScript).toContain('build-result=success');
    expect(policyEvidenceScript).toContain('exact-commands=');
    expect(policyEvidenceScript).toContain('validation-scope=');
    expect(policyEvidenceScript).toContain('scope-rationale=');
    expect(policyEvidenceScript).toContain('artifact-name=');
    expect(policyEvidenceScript).toContain('artifact-identifier=');
    expect(policyEvidenceScript).toContain('artifact-url=');
    expect(policyEvidenceScript).toContain('tracked-worktree-before.txt');
    expect(policyEvidenceScript).toContain('tracked-worktree-after.txt');
    expect(policyEvidenceScript).toContain('result=pass');
    expect(policyEvidenceScript).toContain(
      'android11-release/packages/LocalTransport/src/com/android/localtransport/LocalTransportParameters.java',
    );
    expect(policyEvidenceScript).toContain(
      'android-16.0.0_r1/packages/LocalTransport/src/com/android/localtransport/LocalTransportParameters.java',
    );
    expect(backupContract).toContain('`ProgressBackupAgent`');
    expect(backupContract).toContain('`android:fullBackupOnly="true"`');
    expect(backupContract).toContain('API 30 records the installed production');
    expect(backupContract).toContain('API 36 uses the authoritative Android 16 LocalTransport');
    expect(backupContract).toContain('default restore path continues to enforce the XML allowlist');
    expect(backupContract).not.toContain('encrypted API 30 emits');
    for (const trap of [
      'chessticize-mobile.sqlite-journal-journal',
      'chessticize-mobile.sqlite-journal-wal',
      'chessticize-mobile.sqlite-wal-journal',
      'chessticize-mobile.sqlite-wal-wal',
    ]) {
      expect(policyEvidenceScript).toContain(trap);
    }
    expect(policyEvidenceScript).toContain(
      "grep -F \"Package $APP_ID with result: Success\"",
    );
    const runCase = policyEvidenceScript.slice(
      policyEvidenceScript.indexOf('run_case()'),
      policyEvidenceScript.indexOf('mkdir -p "$ARTIFACT_ROOT"'),
    );
    expect(runCase.indexOf('reset_local_transport'))
      .toBeLessThan(runCase.indexOf('adb_cmd shell bmgr backupnow "$APP_ID"'));
    expect(policyEvidenceScript.indexOf(
      'assert_agent_decision "$case_name" "$expected_flags"',
    ))
      .toBeLessThan(policyEvidenceScript.indexOf(
        'assert_app_data_archive_paths "$case_name" "$expected_payload"',
      ));
  });
});
