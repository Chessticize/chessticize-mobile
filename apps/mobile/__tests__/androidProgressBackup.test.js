const { accessSync, constants, readFileSync, statSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
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
  it('uses API-appropriate restore allowlists with agent-owned backup policy', () => {
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
      { path: PROGRESS_DATABASE_FILES[0], flags: undefined },
    ]);
    expect(legacyEncryptedAndD2d).not.toContain('requireFlags');

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

  it('keeps mandatory key-value BackupAgent callbacks inert in full-backup-only mode', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const backupAgent = read(
      'android/app/src/main/java/com/chessticize/mobile/backup/ProgressBackupAgent.java',
    );

    expect(manifest).toContain('android:fullBackupOnly="true"');
    expect(backupAgent).toMatch(
      /public void onBackup\(\s*ParcelFileDescriptor oldState,\s*BackupDataOutput data,\s*ParcelFileDescriptor newState\) \{\s*\/\/ Key-value backup is intentionally disabled by android:fullBackupOnly\.\s*\}/,
    );
    expect(backupAgent).toMatch(
      /public void onRestore\(\s*BackupDataInput data,\s*int appVersionCode,\s*ParcelFileDescriptor newState\) \{\s*\/\/ Key-value restore is intentionally disabled by android:fullBackupOnly\.\s*\}/,
    );
    expect(backupAgent).not.toContain('data.writeEntity');
    expect(backupAgent).not.toContain('data.readNextHeader');
    expect(backupAgent).not.toContain('super.onBackup');
    expect(backupAgent).not.toContain('super.onRestore');
    expect(backupAgent).not.toContain('onRestoreFile');
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

  it('backs up the untouched released schema before first launch and migrates only after restore', () => {
    const evidenceScript = read('scripts/android-progress-backup-evidence.sh');
    const restoreEvidenceScript = read('scripts/android-progress-backup-restore-evidence.sh');
    const seedCommand =
      'apps/mobile/scripts/android-progress-backup-evidence.sh seed-released-fixture';
    const backupCommand =
      'apps/mobile/scripts/android-progress-backup-evidence.sh device-transfer-released-fixture';
    const restoredAssertion =
      'assert_restored_progress released-fixture device-transfer-restored';

    expect(evidenceScript).toContain('device-transfer-released-fixture');
    for (const artifact of [
      'released-fixture-$evidence_prefix-stat.txt',
      'released-fixture-$evidence_prefix-sha256.txt',
      'released-fixture-$evidence_prefix-user-version.txt',
      'released-fixture-$evidence_prefix-schema.sql',
      'released-fixture-$evidence_prefix-package-state.txt',
      'released-fixture-$evidence_prefix-process.txt',
    ]) {
      expect(evidenceScript).toContain(artifact);
    }
    const seedBranch = evidenceScript.slice(
      evidenceScript.indexOf('if [[ "$MODE" == "seed-released-fixture" ]]'),
      evidenceScript.indexOf('original_transport='),
    );
    expect(seedBranch).toContain('adb_cmd shell pm clear "$APP_ID"');
    expect(seedBranch).not.toContain('am force-stop');
    expect(seedBranch).not.toContain('MainActivity');
    expect(evidenceScript).toMatch(
      /if \[\[ "\$MODE" == "cloud-encrypted" \]\]; then[\s\S]*?am start -W -n "\$APP_ID\/\.MainActivity"[\s\S]*?else\s+assert_released_fixture_ready_for_backup at-backup\s+fi\s+adb_cmd logcat -c/,
    );

    const seedIndex = restoreEvidenceScript.indexOf(seedCommand);
    const backupIndex = restoreEvidenceScript.indexOf(backupCommand);
    const restoredAssertionIndex = restoreEvidenceScript.indexOf(restoredAssertion);
    expect(seedIndex).toBeGreaterThan(-1);
    expect(seedIndex).toBeLessThan(backupIndex);
    expect(backupIndex).toBeLessThan(restoredAssertionIndex);
    expect(restoreEvidenceScript.slice(seedIndex, backupIndex)).not.toContain('MainActivity');
    expect(restoreEvidenceScript.slice(seedIndex, backupIndex)).not.toContain(
      'mobile:e2e:test:android',
    );
  });

  it('clears FLAG_STOPPED without launching or changing the released fixture', () => {
    const evidenceScript = read('scripts/android-progress-backup-evidence.sh');
    const seedBranch = evidenceScript.slice(
      evidenceScript.indexOf('if [[ "$MODE" == "seed-released-fixture" ]]'),
      evidenceScript.indexOf('original_transport='),
    );
    const clearIndex = seedBranch.indexOf('adb_cmd shell pm clear "$APP_ID"');
    const seedIndex = seedBranch.indexOf(
      'adb_cmd shell run-as "$APP_ID" cp "$device_fixture" databases/chessticize-mobile.sqlite',
    );
    const preflightIndex = seedBranch.indexOf('preflight_pm_unstop');
    const unstopIndex = seedBranch.indexOf('adb_cmd shell pm unstop --user 0 "$APP_ID"');
    const readyIndex = seedBranch.indexOf(
      'assert_released_fixture_ready_for_backup pre-backup',
    );

    expect(evidenceScript).toContain("grep -F 'unstop [--user USER_ID] PACKAGE'");
    expect(evidenceScript).toContain('Package manager does not support pm unstop');
    expect(clearIndex).toBeGreaterThan(-1);
    expect(clearIndex).toBeLessThan(seedIndex);
    expect(seedIndex).toBeLessThan(preflightIndex);
    expect(preflightIndex).toBeLessThan(unstopIndex);
    expect(unstopIndex).toBeLessThan(readyIndex);
    expect(seedBranch).not.toContain('MainActivity');
    expect(seedBranch).not.toContain('am start');
    expect(evidenceScript).toContain('stopped=false');
    expect(evidenceScript).toContain(
      'released-fixture-$evidence_prefix-package-state.txt',
    );
    expect(evidenceScript).toContain(
      'assert_released_fixture_ready_for_backup at-backup',
    );
    expect(evidenceScript.indexOf('assert_released_fixture_ready_for_backup at-backup'))
      .toBeLessThan(evidenceScript.indexOf('adb_cmd shell bmgr backupnow --monitor-verbose'));
  });

  it('uses single-token remote stat formats and composes path-size evidence on the host', () => {
    const scriptPaths = [
      'scripts/android-progress-backup-policy-evidence.sh',
      'scripts/android-progress-backup-evidence.sh',
      'scripts/android-progress-backup-restore-evidence.sh',
    ];

    for (const scriptPath of scriptPaths) {
      const script = read(scriptPath);
      expect(script).not.toContain('%n %s');
    }

    const policyEvidenceScript = read(scriptPaths[0]);
    const restoreEvidenceScript = read(scriptPaths[1]);
    expect(policyEvidenceScript).toContain(
      'adb_cmd shell run-as "$APP_ID" stat -c %s "$relative_path"',
    );
    expect(restoreEvidenceScript).toContain(
      'adb_cmd shell run-as "$APP_ID" stat -c %s "$relative_path"',
    );
    expect(policyEvidenceScript).toContain(
      'printf \'%s %s\\n\' "$relative_path" "$measured_size"',
    );
    expect(restoreEvidenceScript).toContain(
      'printf \'%s %s\\n\' "$relative_path" "$measured_size"',
    );
  });

  it('proves installed APK identity from a retained exact source without reverse streaming', () => {
    const policyEvidenceScript = read('scripts/android-progress-backup-policy-evidence.sh');
    const deviceInspection = read('scripts/android-device-inspection.sh');
    const api30RestoreScript = read(
      'scripts/android-progress-backup-api30-restore-evidence.sh',
    );

    expect(policyEvidenceScript).not.toContain('installed-base.apk');
    expect(policyEvidenceScript).not.toContain(
      'adb_cmd exec-out cat "$installed_path"',
    );
    expect(policyEvidenceScript).toContain(
      'read_device_file_size "$installed_path"',
    );
    expect(policyEvidenceScript).toContain(
      'read_device_file_size "$RETAINED_APK_PATH"',
    );
    expect(policyEvidenceScript).toContain(
      'require_device_files_identical "$RETAINED_APK_PATH" "$installed_path"',
    );
    expect(policyEvidenceScript).toContain(
      'push_host_file_to_device "$APK" "$RETAINED_APK_PATH"',
    );
    expect(policyEvidenceScript).toContain(
      'install_device_apk "$RETAINED_APK_PATH"',
    );
    expect(policyEvidenceScript).toContain('workflow-artifact-apk-size.txt');
    expect(policyEvidenceScript).toContain('installed-apk-size.txt');
    expect(policyEvidenceScript).toContain('workflow-artifact-apk-sha256.txt');
    expect(policyEvidenceScript).toContain('installed-apk-sha256.txt');
    expect(policyEvidenceScript).toContain(
      'Installed APK does not match the downloaded exact-head APK',
    );
    expect(policyEvidenceScript).toContain('installed-apk-cmp.txt');
    expect(policyEvidenceScript).toContain('retained-apk-push.txt');
    expect(policyEvidenceScript).toContain('retained-apk-install.txt');
    expect(policyEvidenceScript).toContain('retained-apk-cleanup.txt');
    expect(policyEvidenceScript).toContain(
      'apk-provenance=host-sha256+retained-device-size+installed-device-size+device-cmp',
    );
    expect(policyEvidenceScript).toContain('remove_device_file "$RETAINED_APK_PATH"');
    expect(policyEvidenceScript).toContain(
      '"$RETAINED_APK_SIZE" != "$WORKFLOW_APK_SIZE"',
    );
    expect(policyEvidenceScript).not.toMatch(/adb_cmd install .*"\$APK"/);
    expect(policyEvidenceScript).not.toContain('read_device_file_sha256');
    expect(deviceInspection).not.toContain('sha256sum');
    expect(policyEvidenceScript).toContain(
      'adb_cmd exec-out run-as "$APP_ID" cat "$relative_path"',
    );

    for (const artifact of [
      'workflow-artifact-apk-size.txt',
      'installed-apk-size.txt',
      'workflow-artifact-apk-sha256.txt',
      'installed-apk-sha256.txt',
      'installed-apk-cmp.txt',
    ]) {
      expect(api30RestoreScript).toContain(artifact);
    }
    expect(api30RestoreScript).toContain('source_workflow_apk_size');
    expect(api30RestoreScript).toContain('source_installed_apk_size');
    expect(api30RestoreScript).toContain('current_workflow_apk_size');
    expect(api30RestoreScript).toContain('current_installed_apk_size');
    expect(api30RestoreScript).toContain('read_strict_size_artifact');
    expect(api30RestoreScript).toContain('read_strict_sha256_artifact');
    expect(api30RestoreScript).toContain('validate_apk_cmp_artifact');
    expect(api30RestoreScript).not.toContain("tr -d '\\r\\n'");
  });

  it('fails closed across retained APK push, install, size, and byte comparison', () => {
    const deviceInspection = 'scripts/android-device-inspection.sh';
    const deviceInspectionPath = join(appRoot, deviceInspection);
    const helper = read(deviceInspection);
    const retainedPath = '/data/local/tmp/chessticize-exact-head.apk';
    const installedPath = '/data/app/~~token==/com.chessticize.mobile-token==/base.apk';

    expect(helper).toContain('read_device_file_size');
    expect(helper).toContain('push_host_file_to_device');
    expect(helper).toContain('install_device_apk');
    expect(helper).toContain('require_device_files_identical');
    expect(helper).toContain('inspect_device_command "stat -c %s');
    expect(helper).toContain('inspect_device_command "cmp');
    expect(helper).not.toContain('sha256sum');

    const inspect = (kind, mode) => {
      const command = `
        set -u
        PROVENANCE_KIND=${kind}
        PROVENANCE_MODE=${mode}
        adb_cmd() {
          if [[ "$1" == push ]]; then
            if [[ "$PROVENANCE_MODE" == push-failure ]]; then
              return 42
            fi
            printf '384484899 bytes pushed\\n'
            return 0
          fi
          case "$PROVENANCE_MODE" in
            outer-failure) return 42 ;;
            missing-sentinel) printf 'missing\\n' ;;
            device-error) printf '__CHESSTICIZE_DEVICE_STATUS__=2\\npermission denied\\n' ;;
            malformed-size) printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n384MB\\n' ;;
            multiline-size) printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n384484899\\n0\\n' ;;
            install-failure) printf '__CHESSTICIZE_DEVICE_STATUS__=1\\nFailure [INSTALL_FAILED_INVALID_APK]\\n' ;;
            install-unexpected) printf '__CHESSTICIZE_DEVICE_STATUS__=0\\nSuccess\\nextra\\n' ;;
            cmp-different) printf '__CHESSTICIZE_DEVICE_STATUS__=1\\n${retainedPath} ${installedPath} differ: byte 4\\n' ;;
            cmp-error) printf '__CHESSTICIZE_DEVICE_STATUS__=2\\ncmp: permission denied\\n' ;;
            cmp-success-output) printf '__CHESSTICIZE_DEVICE_STATUS__=0\\nunexpected\\n' ;;
            success)
              if [[ "$PROVENANCE_KIND" == size ]]; then
                printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n384484899\\n'
              elif [[ "$PROVENANCE_KIND" == install ]]; then
                printf '__CHESSTICIZE_DEVICE_STATUS__=0\\nSuccess\\n'
              else
                printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n'
              fi
              ;;
          esac
        }
        source ${JSON.stringify(deviceInspectionPath)}
        set +e
        if [[ "$PROVENANCE_KIND" == size ]]; then
          evidence_output="$(read_device_file_size ${installedPath} 2>/dev/null)"
        elif [[ "$PROVENANCE_KIND" == push ]]; then
          evidence_output="$(push_host_file_to_device ${JSON.stringify(deviceInspectionPath)} ${retainedPath} 2>/dev/null)"
        elif [[ "$PROVENANCE_KIND" == push-invalid-path ]]; then
          evidence_output="$(push_host_file_to_device ${JSON.stringify(deviceInspectionPath)} '/data/local/tmp/bad path.apk' 2>/dev/null)"
        elif [[ "$PROVENANCE_KIND" == install ]]; then
          evidence_output="$(install_device_apk ${retainedPath} 2>/dev/null)"
        elif [[ "$PROVENANCE_KIND" == install-invalid-path ]]; then
          evidence_output="$(install_device_apk '/data/local/tmp/not-an-apk' 2>/dev/null)"
        elif [[ "$PROVENANCE_KIND" == cleanup ]]; then
          evidence_output="$(remove_device_file ${retainedPath} 2>/dev/null)"
        elif [[ "$PROVENANCE_KIND" == cmp-same-path ]]; then
          evidence_output="$(require_device_files_identical ${retainedPath} ${retainedPath} 2>/dev/null)"
        else
          evidence_output="$(require_device_files_identical ${retainedPath} ${installedPath} 2>/dev/null)"
        fi
        evidence_status=$?
        set -e
        printf 'status=%s\\noutput=<%s>\\n' "$evidence_status" "$evidence_output"
      `;
      const result = spawnSync('/bin/bash', ['-c', command], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      return result.stdout;
    };

    expect(inspect('size', 'success')).toBe('status=0\noutput=<384484899>\n');
    expect(inspect('push', 'success')).toBe('status=0\noutput=<384484899 bytes pushed>\n');
    expect(inspect('install', 'success')).toBe('status=0\noutput=<Success>\n');
    expect(inspect('cleanup', 'success')).toBe('status=0\noutput=<>\n');
    expect(inspect('cmp', 'success')).toBe('status=0\noutput=<>\n');
    expect(inspect('push', 'push-failure')).toMatch(
      /^status=[1-9][0-9]*\noutput=<>\n$/,
    );
    expect(inspect('push-invalid-path', 'success')).toMatch(
      /^status=[1-9][0-9]*\noutput=<>\n$/,
    );
    expect(inspect('install-invalid-path', 'success')).toMatch(
      /^status=[1-9][0-9]*\noutput=<>\n$/,
    );
    expect(inspect('cmp-same-path', 'success')).toMatch(
      /^status=[1-9][0-9]*\noutput=<>\n$/,
    );
    for (const mode of [
      'outer-failure',
      'missing-sentinel',
      'device-error',
      'malformed-size',
      'multiline-size',
    ]) {
      expect(inspect('size', mode)).toMatch(/^status=[1-9][0-9]*\noutput=<>\n$/);
    }
    for (const mode of [
      'outer-failure',
      'missing-sentinel',
      'device-error',
      'install-failure',
      'install-unexpected',
    ]) {
      expect(inspect('install', mode)).toMatch(/^status=[1-9][0-9]*\noutput=<>\n$/);
    }
    for (const mode of [
      'outer-failure',
      'missing-sentinel',
      'device-error',
      'cmp-different',
      'cmp-error',
      'cmp-success-output',
    ]) {
      expect(inspect('cmp', mode)).toMatch(/^status=[1-9][0-9]*\noutput=<>\n$/);
    }
    for (const mode of [
      'outer-failure',
      'missing-sentinel',
      'device-error',
      'cmp-success-output',
    ]) {
      expect(inspect('cleanup', mode)).toMatch(/^status=[1-9][0-9]*\noutput=<>\n$/);
    }
  });

  it('keeps synthetic SQLite sidecars stable by proving the app process is quiescent', () => {
    const policyEvidenceScript = read('scripts/android-progress-backup-policy-evidence.sh');
    const seedFixture = policyEvidenceScript.slice(
      policyEvidenceScript.indexOf('seed_app_data_fixture()'),
      policyEvidenceScript.indexOf('find_transport_archive()'),
    );

    expect(policyEvidenceScript).toContain('quiesce_app_process_for_fixture()');
    expect(policyEvidenceScript).toContain('adb_cmd shell kill -9 "${process_ids[@]}"');
    expect(policyEvidenceScript).toContain('assert_app_process_absent()');
    expect(seedFixture).toContain('quiesce_app_process_for_fixture');
    expect(seedFixture).toContain('assert_app_process_absent fixture-seed-before');
    expect(seedFixture).toContain('assert_app_process_absent "fixture-seed-$index"');
    expect(seedFixture).toContain('assert_app_process_absent fixture-seed-after');
    expect(policyEvidenceScript).toContain('$label-process.txt');
  });

  it('fails closed on process-inspection errors and accepts only pidof status one with no PIDs', () => {
    const processInspection = 'scripts/android-device-inspection.sh';
    const processInspectionPath = join(appRoot, processInspection);
    const callers = [
      'scripts/android-progress-backup-api30-restore-evidence.sh',
      'scripts/android-progress-backup-evidence.sh',
      'scripts/android-progress-backup-policy-evidence.sh',
    ].map(read);

    expect(() => accessSync(processInspectionPath, constants.R_OK)).not.toThrow();
    const helper = read(processInspection);
    for (const caller of callers) {
      expect(caller).toContain('source "$APP_DIR/scripts/android-device-inspection.sh"');
      expect(caller).toContain('read_app_process_ids');
      expect(caller).not.toMatch(/adb_cmd shell pidof/);
    }
    expect(helper).toContain('__CHESSTICIZE_DEVICE_STATUS__=');
    expect(helper).toContain('inspect_device_command');
    expect(helper).toContain('inspect_device_command "pidof \\"$APP_ID\\""');
    expect(helper).toContain('[[ "$ANDROID_DEVICE_COMMAND_STATUS" == "1" ]]');
    expect(helper).toContain('[[ "$ANDROID_DEVICE_COMMAND_STATUS" == "0" ]]');

    const inspect = (mode) => {
      const command = `
        set -u
        APP_ID=com.chessticize.mobile
        INSPECTION_MODE=${mode}
        adb_cmd() {
          case "$INSPECTION_MODE" in
            outer-failure) return 42 ;;
            no-pid) printf '__CHESSTICIZE_DEVICE_STATUS__=1\\n' ;;
            pid) printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n123 456\\n' ;;
            success-empty) printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n' ;;
            absent-with-output) printf '__CHESSTICIZE_DEVICE_STATUS__=1\\nunexpected\\n' ;;
            device-error) printf '__CHESSTICIZE_DEVICE_STATUS__=2\\n' ;;
            missing-sentinel) printf '1\\n' ;;
            malformed-sentinel) printf '__CHESSTICIZE_DEVICE_STATUS__=x\\n' ;;
          esac
        }
        source ${JSON.stringify(processInspectionPath)}
        set +e
        process_output="$(read_app_process_ids 2>/dev/null)"
        process_status=$?
        set -e
        printf 'status=%s\\noutput=<%s>\\n' "$process_status" "$process_output"
      `;
      const result = spawnSync('/bin/bash', ['-c', command], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      return result.stdout;
    };

    expect(inspect('no-pid')).toBe('status=0\noutput=<>\n');
    expect(inspect('pid')).toBe('status=0\noutput=<123 456>\n');
    for (const mode of [
      'outer-failure',
      'success-empty',
      'absent-with-output',
      'device-error',
      'missing-sentinel',
      'malformed-sentinel',
    ]) {
      expect(inspect(mode)).toMatch(/^status=[1-9][0-9]*\noutput=<>\n$/);
    }
  });

  it('fails closed while discovering remote archive files and directories', () => {
    const deviceInspection = 'scripts/android-device-inspection.sh';
    const deviceInspectionPath = join(appRoot, deviceInspection);
    const helper = read(deviceInspection);
    const policyEvidenceScript = read('scripts/android-progress-backup-policy-evidence.sh');
    const api30RestoreScript = read(
      'scripts/android-progress-backup-api30-restore-evidence.sh',
    );

    expect(helper).toContain('probe_device_path');
    expect(helper).toContain('require_device_path_state');
    expect(helper).toContain('find_existing_device_paths');
    expect(helper).toContain('read_canonical_device_path');
    expect(helper).toContain('read_device_file_identity');
    expect(helper).toContain('stat -c %d:%i');
    expect(policyEvidenceScript).toContain(
      'probe_device_path file "$candidate"',
    );
    expect(api30RestoreScript).toContain(
      'probe_device_path directory "$candidate"',
    );
    expect(api30RestoreScript).toContain('read_device_file_identity "$candidate"');
    expect(api30RestoreScript).toContain('api30-restore-base-archive-parent-raw-aliases.txt');
    expect(api30RestoreScript).toContain('api30-restore-base-archive-parent-canonical-aliases.txt');
    expect(api30RestoreScript).toContain('api30-restore-base-archive-parent-identities.txt');
    expect(api30RestoreScript).not.toContain(
      'find_existing_device_paths directory "${candidates[@]}"',
    );
    expect(policyEvidenceScript).not.toContain('adb_cmd shell test -f "$candidate"');
    expect(api30RestoreScript).not.toContain('adb_cmd shell test -d "$candidate"');
    expect(policyEvidenceScript).toContain(
      'if ! find_transport_archive "$case_name" > "$archive_paths_file"; then',
    );
    expect(api30RestoreScript).toContain(
      'if ! find_transport_archive_parent > "$archive_parent_paths"; then',
    );

    expect(api30RestoreScript.match(
      /require_device_path_state any "\$path" absent "\$APP_ID"/g,
    )).toHaveLength(2);
    expect(api30RestoreScript).toMatch(
      /require_device_path_state file "\$path" present "\$APP_ID" \\\s+\|\| fail "Expected API 30 restore positive is absent: \$path"/,
    );
    expect(api30RestoreScript).not.toMatch(/adb_cmd shell run-as .*\btest\b/);

    const discover = (kind, mode) => {
      const command = `
        set -u
        APP_ID=com.chessticize.mobile
        DISCOVERY_MODE=${mode}
        adb_cmd() {
          local remote_command="\${*: -1}"
          local candidate
          case "$remote_command" in
            *'/candidate-a'*) candidate=a ;;
            *'/candidate-b'*) candidate=b ;;
            *) candidate=unknown ;;
          esac
          case "$DISCOVERY_MODE:$candidate:$remote_command" in
            outer-failure:b:*) return 42 ;;
            missing-sentinel:b:*) printf 'missing\\n'; return 0 ;;
            malformed-status:b:*) printf '__CHESSTICIZE_DEVICE_STATUS__=x\\n'; return 0 ;;
            device-error:b:*) printf '__CHESSTICIZE_DEVICE_STATUS__=2\\n'; return 0 ;;
            present-with-output:b:*) printf '__CHESSTICIZE_DEVICE_STATUS__=0\\nunexpected\\n'; return 0 ;;
            absent-with-output:b:*) printf '__CHESSTICIZE_DEVICE_STATUS__=1\\nunexpected\\n'; return 0 ;;
            canonical-failure:a:*readlink*) return 42 ;;
            mixed:a:*test*) printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n'; return 0 ;;
            mixed:a:*readlink*) printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n/canonical-a\\n'; return 0 ;;
            canonical-failure:a:*test*) printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n'; return 0 ;;
            *) printf '__CHESSTICIZE_DEVICE_STATUS__=1\\n'; return 0 ;;
          esac
        }
        source ${JSON.stringify(deviceInspectionPath)}
        set +e
        discovery_output="$(find_existing_device_paths ${kind} /candidate-a /candidate-b 2>/dev/null)"
        discovery_status=$?
        set -e
        printf 'status=%s\\noutput=<%s>\\n' "$discovery_status" "$discovery_output"
      `;
      const result = spawnSync('/bin/bash', ['-c', command], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      return result.stdout;
    };

    for (const kind of ['file', 'directory']) {
      expect(discover(kind, 'all-absent')).toBe('status=0\noutput=<>\n');
      expect(discover(kind, 'mixed')).toBe('status=0\noutput=</canonical-a>\n');
      for (const mode of [
        'outer-failure',
        'missing-sentinel',
        'malformed-status',
        'device-error',
        'present-with-output',
        'absent-with-output',
        'canonical-failure',
      ]) {
        expect(discover(kind, mode)).toMatch(/^status=[1-9][0-9]*\noutput=<>\n$/);
      }
    }
  });

  it('retains raw API 36 aliases before proving one canonical device and inode target', () => {
    const policyEvidenceScript = read('scripts/android-progress-backup-policy-evidence.sh');
    const deviceInspectionPath = join(appRoot, 'scripts/android-device-inspection.sh');
    const findTransportArchive = policyEvidenceScript.slice(
      policyEvidenceScript.indexOf('find_transport_archive()'),
      policyEvidenceScript.indexOf("WORKFLOW_APK_SIZE=''"),
    );
    const dataAlias =
      '/data/data/com.android.localtransport/files/1/_full/com.chessticize.mobile';
    const userAlias =
      '/data/user/0/com.android.localtransport/files/1/_full/com.chessticize.mobile';

    expect(policyEvidenceScript).toContain(
      '"/data/data/com.android.localtransport/files/1/_full/$APP_ID"',
    );
    expect(policyEvidenceScript).toContain(
      '"/data/user/0/com.android.localtransport/files/1/_full/$APP_ID"',
    );
    expect(policyEvidenceScript).toContain('read_device_file_identity "$candidate"');
    expect(policyEvidenceScript).toContain('$case_name-transport-archive-raw-aliases.txt');
    expect(policyEvidenceScript).toContain('$case_name-transport-archive-canonical-aliases.txt');
    expect(policyEvidenceScript).toContain('$case_name-transport-archive-identities.txt');
    expect(policyEvidenceScript).not.toContain(
      'find_existing_device_paths file "${candidates[@]}" > "$aliases_file"',
    );

    const discover = (mode) => {
      const command = `
        set -u
        APP_ID=com.chessticize.mobile
        ALIAS_MODE=${mode}
        ARTIFACT_DIR="$(mktemp -d)"
        trap 'rm -rf "$ARTIFACT_DIR"' EXIT
        adb_cmd() {
          local remote_command="\${*: -1}"
          local alias_name
          case "$remote_command" in
            *${JSON.stringify(dataAlias)}*) alias_name=data ;;
            *${JSON.stringify(userAlias)}*) alias_name=user ;;
            *) alias_name=other ;;
          esac
          case "$remote_command" in
            *'test -f'*)
              if [[ "$alias_name" == data || "$alias_name" == user ]]; then
                printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n'
              else
                printf '__CHESSTICIZE_DEVICE_STATUS__=1\\n'
              fi
              ;;
            *'readlink -f'*)
              printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n/canonical/archive\\n'
              ;;
            *'stat -c %d:%i'*)
              if [[ "$ALIAS_MODE" == unreadable && "$alias_name" == user ]]; then
                printf '__CHESSTICIZE_DEVICE_STATUS__=0\\nnot-an-identity\\n'
              elif [[ "$ALIAS_MODE" == distinct && "$alias_name" == user ]]; then
                printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n253:4343\\n'
              else
                printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n253:4242\\n'
              fi
              ;;
            *)
              printf '__CHESSTICIZE_DEVICE_STATUS__=2\\nunsupported\\n'
              ;;
          esac
        }
        source ${JSON.stringify(deviceInspectionPath)}
        ${findTransportArchive}
        set +e
        output="$(find_transport_archive encryption-only 2>"$ARTIFACT_DIR/error.txt")"
        status=$?
        set -e
        printf 'status=%s\\noutput=<%s>\\n' "$status" "$output"
        printf 'raw-aliases=\\n'
        cat "$ARTIFACT_DIR/encryption-only-transport-archive-raw-aliases.txt"
        printf 'canonical-aliases=\\n'
        cat "$ARTIFACT_DIR/encryption-only-transport-archive-canonical-aliases.txt"
        if [[ -f "$ARTIFACT_DIR/encryption-only-transport-archive-identities.txt" ]]; then
          printf 'identities=\\n'
          cat "$ARTIFACT_DIR/encryption-only-transport-archive-identities.txt"
        fi
        printf 'error=<%s>\\n' "$(cat "$ARTIFACT_DIR/error.txt")"
      `;
      const result = spawnSync('/bin/bash', ['-c', command], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      return result.stdout;
    };

    expect(discover('same')).toBe(
      `status=0\noutput=</canonical/archive>\nraw-aliases=\n${dataAlias}\n${userAlias}\ncanonical-aliases=\n${dataAlias} /canonical/archive\n${userAlias} /canonical/archive\nidentities=\n253:4242 ${dataAlias} /canonical/archive\n253:4242 ${userAlias} /canonical/archive\nerror=<>\n`,
    );
    const distinct = discover('distinct');
    expect(distinct).toContain(`${dataAlias}\n${userAlias}\ncanonical-aliases=`);
    expect(distinct).toContain(`253:4242 ${dataAlias} /canonical/archive`);
    expect(distinct).toContain(`253:4343 ${userAlias} /canonical/archive`);
    expect(distinct).toContain(
      'Expected at most one canonical LocalTransport archive target.',
    );
    expect(distinct).toMatch(/^status=[1-9][0-9]*\noutput=<>\n/);
    const unreadable = discover('unreadable');
    expect(unreadable).toContain(`${dataAlias}\n${userAlias}\ncanonical-aliases=`);
    expect(unreadable).toContain('Unable to read a strict device/inode identity');
    expect(unreadable).toMatch(/^status=[1-9][0-9]*\noutput=<>\n/);
  });

  it('retains API 30 archive-parent aliases and collapses only one proven directory identity', () => {
    const restoreScript = read('scripts/android-progress-backup-api30-restore-evidence.sh');
    const deviceInspectionPath = join(appRoot, 'scripts/android-device-inspection.sh');
    const findTransportArchiveParent = restoreScript.slice(
      restoreScript.indexOf('find_transport_archive_parent()'),
      restoreScript.indexOf('stream_device_sha256()'),
    );
    const dataAlias = '/data/data/com.android.localtransport/files/1/_full';
    const userAlias = '/data/user/0/com.android.localtransport/files/1/_full';

    const discover = (mode) => {
      const command = `
        set -u
        ALIAS_MODE=${mode}
        ARTIFACT_DIR="$(mktemp -d)"
        trap 'rm -rf "$ARTIFACT_DIR"' EXIT
        adb_cmd() {
          local remote_command="\${*: -1}"
          local alias_name
          case "$remote_command" in
            *${JSON.stringify(dataAlias)}*) alias_name=data ;;
            *${JSON.stringify(userAlias)}*) alias_name=user ;;
            *) alias_name=other ;;
          esac
          case "$remote_command" in
            *'test -d'*)
              if [[ "$alias_name" == data || "$alias_name" == user ]]; then
                printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n'
              else
                printf '__CHESSTICIZE_DEVICE_STATUS__=1\\n'
              fi
              ;;
            *'readlink -f'*)
              if [[ "$alias_name" == data ]]; then
                printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n%s\\n' ${JSON.stringify(dataAlias)}
              else
                printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n%s\\n' ${JSON.stringify(userAlias)}
              fi
              ;;
            *'stat -c %d:%i'*)
              if [[ "$ALIAS_MODE" == unreadable && "$alias_name" == user ]]; then
                printf '__CHESSTICIZE_DEVICE_STATUS__=0\\nnot-an-identity\\n'
              elif [[ "$ALIAS_MODE" == distinct && "$alias_name" == user ]]; then
                printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n253:4343\\n'
              else
                printf '__CHESSTICIZE_DEVICE_STATUS__=0\\n253:4242\\n'
              fi
              ;;
            *)
              printf '__CHESSTICIZE_DEVICE_STATUS__=2\\nunsupported\\n'
              ;;
          esac
        }
        source ${JSON.stringify(deviceInspectionPath)}
        ${findTransportArchiveParent}
        set +e
        output="$(find_transport_archive_parent 2>"$ARTIFACT_DIR/error.txt")"
        status=$?
        set -e
        printf 'status=%s\\noutput=<%s>\\n' "$status" "$output"
        printf 'raw-aliases=\\n'
        cat "$ARTIFACT_DIR/api30-restore-base-archive-parent-raw-aliases.txt" 2>/dev/null || true
        printf 'canonical-aliases=\\n'
        cat "$ARTIFACT_DIR/api30-restore-base-archive-parent-canonical-aliases.txt" 2>/dev/null || true
        printf 'identities=\\n'
        cat "$ARTIFACT_DIR/api30-restore-base-archive-parent-identities.txt" 2>/dev/null || true
        printf 'error=<%s>\\n' "$(cat "$ARTIFACT_DIR/error.txt")"
      `;
      const result = spawnSync('/bin/bash', ['-c', command], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      return result.stdout;
    };

    expect(discover('same')).toBe(
      `status=0\noutput=<${dataAlias}>\nraw-aliases=\n${dataAlias}\n${userAlias}\ncanonical-aliases=\n${dataAlias} ${dataAlias}\n${userAlias} ${userAlias}\nidentities=\n253:4242 ${dataAlias} ${dataAlias}\n253:4242 ${userAlias} ${userAlias}\nerror=<>\n`,
    );
    const distinct = discover('distinct');
    expect(distinct).toContain(`253:4242 ${dataAlias} ${dataAlias}`);
    expect(distinct).toContain(`253:4343 ${userAlias} ${userAlias}`);
    expect(distinct).toContain(
      'Expected at most one canonical LocalTransport archive parent target.',
    );
    expect(distinct).toMatch(/^status=[1-9][0-9]*\noutput=<>\n/);
    const unreadable = discover('unreadable');
    expect(unreadable).toContain(`${dataAlias}\n${userAlias}\ncanonical-aliases=`);
    expect(unreadable).toContain('Unable to read a strict device/inode identity');
    expect(unreadable).toMatch(/^status=[1-9][0-9]*\noutput=<>\n/);
  });

  it('treats API 30 mask zero as an expected fail-closed transport rejection', () => {
    const policyEvidenceScript = read('scripts/android-progress-backup-policy-evidence.sh');

    expect(policyEvidenceScript).toContain('fail-closed-transport-rejection');
    expect(policyEvidenceScript).toContain(
      'Transport rejected package because it wasn\'t able to process it at the time',
    );
    expect(policyEvidenceScript).toContain('Backup finished with result: Success');
    expect(policyEvidenceScript).toContain('expected_payload" == "no-archive"');
    expect(policyEvidenceScript).toContain('unexpectedly emitted app-data payload');
    expect(policyEvidenceScript).toMatch(
      /run_case no-capability 'non_incremental_only=false' 0 false 0 no-archive \\\s+fail-closed-transport-rejection/,
    );
  });

  it('requires the exact API 24 legacy rejection with one fail-closed decision and no archive', () => {
    const policyEvidenceScript = read('scripts/android-progress-backup-policy-evidence.sh');
    const backupContract = read('docs/ANDROID_PROGRESS_BACKUP.md');
    const assertionStart = policyEvidenceScript.indexOf(
      'assert_exclusive_framework_result() {',
    );

    expect(policyEvidenceScript).toMatch(
      /run_case pre-flags-api 'non_incremental_only=false' unavailable false 0 no-archive \\\s+fail-closed-legacy-transport-rejection/,
    );
    expect(assertionStart).toBeGreaterThan(-1);
    const exclusiveFrameworkResult = policyEvidenceScript.slice(
      assertionStart,
      policyEvidenceScript.indexOf('run_case() {'),
    );
    const legacyRejectionCase = policyEvidenceScript.slice(
      policyEvidenceScript.indexOf('fail-closed-legacy-transport-rejection)'),
      policyEvidenceScript.indexOf('fail-closed-transport-rejection)'),
    );
    expect(legacyRejectionCase).toContain('invocation_policy=exactly-one');
    expect(legacyRejectionCase).toContain(
      'assert_exclusive_framework_result "$case_name"',
    );
    expect(legacyRejectionCase).not.toContain("wasn't able to process it");
    expect(backupContract).toContain(
      'API 24 requires the exact legacy package rejection with one fail-closed agent decision',
    );
    expect(policyEvidenceScript).toContain(
      'API24 requires one pre-transport-flags fail-closed decision, exactly one legacy package rejection and successful overall result, no payload log, and no archive',
    );

    const verify = (mode) => {
      const command = `
        set -u
        APP_ID=com.chessticize.mobile
        ARTIFACT_DIR="$(mktemp -d)"
        trap 'rm -rf "$ARTIFACT_DIR"' EXIT
        case ${mode} in
          exact)
            printf '%s\\n' \\
              'Package @pm@ with result: Success' \\
              'Package com.chessticize.mobile with result: Transport rejected package' \\
              'Backup finished with result: Success' \\
              > "$ARTIFACT_DIR/pre-flags-api-backupnow.txt"
            ;;
          duplicate-package)
            printf '%s\\n' \\
              'Package com.chessticize.mobile with result: Transport rejected package' \\
              'Package com.chessticize.mobile with result: Transport rejected package' \\
              'Backup finished with result: Success' \\
              > "$ARTIFACT_DIR/pre-flags-api-backupnow.txt"
            ;;
          conflicting-package)
            printf '%s\\n' \\
              'Package com.chessticize.mobile with result: Transport rejected package' \\
              'Package com.chessticize.mobile with result: Success' \\
              'Backup finished with result: Success' \\
              > "$ARTIFACT_DIR/pre-flags-api-backupnow.txt"
            ;;
          duplicate-overall)
            printf '%s\\n' \\
              'Package com.chessticize.mobile with result: Transport rejected package' \\
              'Backup finished with result: Success' \\
              'Backup finished with result: Success' \\
              > "$ARTIFACT_DIR/pre-flags-api-backupnow.txt"
            ;;
        esac
        ${exclusiveFrameworkResult}
        set +e
        assert_exclusive_framework_result pre-flags-api \\
          'Package com.chessticize.mobile with result: Transport rejected package' \\
          2>"$ARTIFACT_DIR/error.txt"
        status=$?
        set -e
        printf 'status=%s\\nerror=<%s>\\n' "$status" "$(cat "$ARTIFACT_DIR/error.txt")"
      `;
      const result = spawnSync('/bin/bash', ['-c', command], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      return result.stdout;
    };

    expect(verify('exact')).toBe('status=0\nerror=<>\n');
    for (const mode of [
      'duplicate-package',
      'conflicting-package',
      'duplicate-overall',
    ]) {
      expect(verify(mode)).toMatch(/^status=[1-9][0-9]*\nerror=</);
    }
  });

  it('treats API 36 mask zero as an expected fail-closed transport rejection with no archive', () => {
    const policyEvidenceScript = read('scripts/android-progress-backup-policy-evidence.sh');

    expect(policyEvidenceScript).toMatch(
      /run_case neither 'is_encrypted=false,is_device_transfer=false,log_agent_results=true' \\\s+0 false 0 no-archive \\\s+fail-closed-transport-rejection/,
    );
  });

  it('keeps the API 36 mask-zero producer and API 30 consumer handoff exact', () => {
    const policyEvidenceScript = read('scripts/android-progress-backup-policy-evidence.sh');
    const restoreEvidenceScript = read(
      'scripts/android-progress-backup-api30-restore-evidence.sh',
    );
    const expectedRecord =
      'case=neither delivered-mask=0 selected=false emitted=0 agent-invocations=1 payload=no-archive framework-result=fail-closed-transport-rejection result=pass';

    expect(policyEvidenceScript).toMatch(
      /run_case neither 'is_encrypted=false,is_device_transfer=false,log_agent_results=true' \\\s+0 false 0 no-archive \\\s+fail-closed-transport-rejection/,
    );
    expect(restoreEvidenceScript).toContain(`grep -Fx '${expectedRecord}'`);
    expect(restoreEvidenceScript).not.toMatch(
      /case=neither[^\n]*agent-invocations=\[/,
    );
  });

  it('selects and inspects the in-framework API 24 LocalTransport', () => {
    const policyEvidenceScript = read('scripts/android-progress-backup-policy-evidence.sh');

    expect(policyEvidenceScript).toContain(
      'API24_LOCAL_TRANSPORT="android/com.android.internal.backup.LocalTransport"',
    );
    expect(policyEvidenceScript).toMatch(
      /if \(\( SDK_LEVEL == 24 \)\); then\s+LOCAL_TRANSPORT="\$API24_LOCAL_TRANSPORT"\s+fi/,
    );
    expect(policyEvidenceScript).toContain(
      '"/cache/backup/1/_full/$APP_ID"',
    );
  });

  it('bounds policy ADB operations and records timeout diagnostics', () => {
    const policyEvidenceScript = read('scripts/android-progress-backup-policy-evidence.sh');

    expect(policyEvidenceScript).toContain('ADB_OPERATION_TIMEOUT_SECONDS');
    expect(policyEvidenceScript).toContain(
      'timeout --foreground "${ADB_OPERATION_TIMEOUT_SECONDS}s"',
    );
    expect(policyEvidenceScript).toContain('adb-timeout-diagnostic-');
    expect(policyEvidenceScript).toContain('timed-out-command=');
    expect(policyEvidenceScript).toContain(
      'if (( status == 124 || status == 137 )); then',
    );
    expect(policyEvidenceScript).toContain('Android policy ADB operation timed out');
    expect(policyEvidenceScript).toContain('ADB_CLEANUP_TIMEOUT_SECONDS');
  });

  it('retries API 24 BackupManager readiness without probing cleanup transport first', () => {
    const policyEvidenceScript = read('scripts/android-progress-backup-policy-evidence.sh');

    expect(policyEvidenceScript).toContain('wait_for_api24_backup_manager_ready()');
    expect(policyEvidenceScript).toContain('BACKUP_MANAGER_READINESS_TIMEOUT_SECONDS');
    expect(policyEvidenceScript).toContain('BACKUP_MANAGER_READINESS_ATTEMPTS');
    expect(policyEvidenceScript).toContain('api24-backup-manager-readiness-attempt-');
    expect(policyEvidenceScript).toContain('api24-backup-manager-readiness.txt');
    expect(policyEvidenceScript).toMatch(
      /if \(\( SDK_LEVEL != 24 \)\); then\s+original_transport=.*?bmgr list transports/s,
    );
    expect(policyEvidenceScript).toMatch(
      /if \(\( SDK_LEVEL == 24 \)\); then\s+wait_for_api24_backup_manager_ready\s+fi\s+adb_cmd shell bmgr enable true/,
    );
  });

  it('proves the API 30 v28 allowlist through a real inherited framework restore', () => {
    const workflow = readRepo('.github/workflows/mobile-android.yml');
    const policyEvidenceScript = read('scripts/android-progress-backup-policy-evidence.sh');
    const restoreParserScript = read(
      'scripts/android-progress-backup-api30-restore-evidence.sh',
    );
    const backupContract = read('docs/ANDROID_PROGRESS_BACKUP.md');

    const api24Job = workflow.slice(
      workflow.indexOf('  android-progress-backup-policy-api24:'),
      workflow.indexOf('  android-progress-backup-policy-api36:'),
    );
    const api36Job = workflow.slice(
      workflow.indexOf('  android-progress-backup-policy-api36:'),
      workflow.indexOf('  android-progress-backup-policy-api30:'),
    );
    const api30Job = workflow.slice(
      workflow.indexOf('  android-progress-backup-policy-api30:'),
    );
    expect(api24Job).toContain('api-level: 24');
    expect(api36Job).toContain('api-level: 36');
    expect(api36Job).toContain('name: android-progress-backup-policy-api-36');
    expect(api36Job).toContain(
      'path: apps/mobile/artifacts/android-progress-backup-policy/api-36',
    );
    expect(api30Job).toMatch(
      /needs:\s+- android-build\s+- android-progress-backup-policy-api36/,
    );
    expect(api30Job).toContain('name: android-progress-backup-policy-api-36');
    expect(api30Job).toContain(
      'path: apps/mobile/artifacts/android-progress-backup-policy-source/api-36',
    );
    expect(api30Job).toContain('api-level: 30');
    expect(api30Job).toContain(
      'ANDROID_BACKUP_API36_SOURCE_DIR: apps/mobile/artifacts/android-progress-backup-policy-source/api-36',
    );
    expect(policyEvidenceScript).toMatch(
      /elif \(\( SDK_LEVEL == 30 \)\); then\s+run_case no-capability[\s\S]*?android-progress-backup-api30-restore-evidence\.sh/,
    );
    expect(restoreParserScript).toContain('set -euo pipefail');
    expect(restoreParserScript).toContain('API 30');
    expect(restoreParserScript).toContain('apps/$APP_ID/_manifest');
    expect(restoreParserScript).toContain('first_app_entry');
    expect(restoreParserScript).not.toContain('fake_encryption_flag=true');
    expect(restoreParserScript).not.toContain('FLAG_FAKE_CLIENT_SIDE_ENCRYPTION_ENABLED');
    expect(restoreParserScript).toContain('ANDROID_BACKUP_API36_SOURCE_DIR');
    expect(restoreParserScript).toContain('both-transport-archive.tar');
    expect(restoreParserScript).toContain('both-transport-archive-sha256.txt');
    expect(restoreParserScript).toContain('both-transport-archive-entries.txt');
    expect(restoreParserScript).toContain('both-unique-policy-events.txt');
    expect(restoreParserScript).toContain('both-unique-result-events.txt');
    expect(restoreParserScript).toContain('case=both delivered-mask=3 selected=true');
    expect(restoreParserScript).toContain('api-level=36');
    expect(restoreParserScript).toContain('commit-sha=$GITHUB_SHA');
    expect(restoreParserScript).toContain('GITHUB_RUN_ID');
    expect(restoreParserScript).toContain('source_workflow_apk_hash');
    expect(restoreParserScript).toContain('source_installed_apk_hash');
    expect(restoreParserScript).toContain('manifest_version');
    expect(restoreParserScript).toContain('manifest_package');
    expect(restoreParserScript).toContain('manifest_app_version');
    expect(restoreParserScript).toContain('manifest_platform_version');
    expect(restoreParserScript).toContain('manifest_signature_count');
    expect(restoreParserScript).toContain('source-platform-version=36');
    expect(restoreParserScript).toContain('find_transport_archive_parent');
    expect(restoreParserScript).toContain(
      'api30-restore-source-provenance.txt',
    );
    expect(restoreParserScript).toContain('api30-restore-transport-parameters.txt');
    expect(restoreParserScript).toContain('tar --delete');
    expect(restoreParserScript).toContain('api30-restore-stripped-archive-entries.txt');
    expect(restoreParserScript).toContain('tar --append');
    expect(restoreParserScript).toContain('cmp -s "$base_manifest" "$final_manifest"');
    expect(restoreParserScript).toContain('base_metadata_entries');
    expect(restoreParserScript).toContain('final_metadata_entries');
    expect(restoreParserScript).toContain('ls -Zd "$archive_path"');
    expect(restoreParserScript).toContain('chcon "$archive_context" "$archive_path"');
    expect(restoreParserScript).toContain('adb_cmd shell pm clear "$APP_ID"');
    expect(restoreParserScript).toContain('stopped=true');
    expect(restoreParserScript).not.toContain('pm unstop');
    expect(restoreParserScript).not.toContain('MainActivity');
    expect(restoreParserScript).not.toContain('mobile:e2e');
    expect(restoreParserScript).toContain('adb_cmd shell bmgr list sets');
    expect(restoreParserScript).toContain(
      'adb_cmd shell bmgr restore "$restore_token" "$APP_ID"',
    );
    expect(restoreParserScript).toContain('restoreFinished: 0');
    expect(restoreParserScript).toContain('BackupXmlParserLogging');
    expect(restoreParserScript).toContain('api30-restore-parser-observations.txt');
    for (const positive of [
      'chessticize-mobile.sqlite',
      'chessticize-mobile.sqlite-journal',
      'chessticize-mobile.sqlite-wal',
    ]) {
      expect(restoreParserScript).toContain(positive);
    }
    for (const negative of [
      'chessticize-mobile.sqlite-journal-journal',
      'chessticize-mobile.sqlite-journal-wal',
      'chessticize-mobile.sqlite-wal-journal',
      'chessticize-mobile.sqlite-wal-wal',
      'chessticize-mobile.sqlite-shm',
      'other-progress.sqlite',
      'credential-root-trap.bin',
      'credential-file-trap.bin',
      'credential-sharedpref-trap.xml',
      'credential-database-trap.bin',
      'device-root-trap.bin',
      'device-file-trap.bin',
      'device-sharedpref-trap.xml',
      'device-database-trap.bin',
    ]) {
      expect(restoreParserScript).toContain(negative);
    }
    for (const artifact of [
      'api30-restore-sdk.txt',
      'api30-restore-archive-sha256.txt',
      'api30-restore-archive-entries.txt',
      'api30-restore-selected-transport.txt',
      'api30-restore-sets.txt',
      'api30-restore-token.txt',
      'api30-restore-bmgr.txt',
      'api30-restore-logcat.txt',
      'api30-restore-parser-log.txt',
      'api30-restore-dumpsys-backup.txt',
      'api30-restore-context.txt',
      'api30-restore-tracked-worktree-before.txt',
      'api30-restore-tracked-worktree-after.txt',
    ]) {
      expect(restoreParserScript).toContain(artifact);
    }
    expect(restoreParserScript).toContain('exact-commands=');
    expect(restoreParserScript).toContain('validation-scope=');
    expect(restoreParserScript).toContain('artifact-identifier=');
    expect(restoreParserScript).toContain('result=pass');
    expect(() => accessSync(
      join(appRoot, 'scripts/android-progress-backup-api30-restore-evidence.sh'),
      constants.X_OK,
    )).not.toThrow();
    expect(backupContract).toContain('real inherited `bmgr restore`');
    expect(backupContract).toContain('API 36 OS-generated archive');
    expect(backupContract).toContain('TarBackupReader');
    expect(backupContract).toContain('parses the platform-version field');
  });

  it('documents the mask-zero exception and selected preflight tolerance precisely', () => {
    const policyEvidenceScript = read('scripts/android-progress-backup-policy-evidence.sh');
    const backupContract = read('docs/ANDROID_PROGRESS_BACKUP.md');

    expect(policyEvidenceScript).toContain(
      'policy_events="$ARTIFACT_DIR/$case_name-policy-events.txt"',
    );
    expect(policyEvidenceScript).toContain(
      'sort -u "$policy_events" > "$unique_policy_events"',
    );
    expect(policyEvidenceScript).toContain(
      'policy_invocations="$(wc -l < "$policy_events" | tr -d \' \')"',
    );
    expect(policyEvidenceScript).toContain('Inconsistent BackupAgent policy selections');
    expect(policyEvidenceScript).toContain(
      'expected_payload_events=$((expected_emitted * policy_invocations))',
    );
    expect(policyEvidenceScript).toContain(
      'assert_app_data_archive_paths "$case_name" "$expected_payload"',
    );
    expect(policyEvidenceScript).not.toContain(
      'Expected exactly one policy and result event for $case_name.',
    );
    expect(backupContract).toContain(
      'Mask `0` is the fail-closed transport-rejection exception',
    );
    expect(backupContract).toContain('selected masks `1`, `2`, and `3`');
    expect(backupContract).toContain(
      'repeated identical policy/result/payload groups',
    );
    expect(policyEvidenceScript).toContain(
      'API36 mask 0 requires exactly one fail-closed policy/result invocation, selected masks 1,2,3 tolerate only repeated-identical preflight groups, and device/inode identity collapses raw path aliases only after recording every alias and proving one canonical archive target',
    );
    expect(policyEvidenceScript).not.toContain('once-only agent output');
  });

  it('rejects repeated fail-closed decisions while retaining selected preflight tolerance', () => {
    const policyEvidenceScript = read('scripts/android-progress-backup-policy-evidence.sh');
    const start = policyEvidenceScript.indexOf('assert_agent_decision() {');
    const end = policyEvidenceScript.indexOf(
      '\n}\n\nassert_app_data_archive_paths()',
      start,
    ) + 2;
    const assertAgentDecision = policyEvidenceScript.slice(start, end);
    const runAssertion = ({ emitted, invocationPolicy, lines, selected }) => {
      const quotedLines = lines.map((line) => `'${line}'`).join(' ');
      const command = `
        set -euo pipefail
        ${assertAgentDecision}
        ARTIFACT_DIR="$(mktemp -d)"
        trap 'rm -rf "$ARTIFACT_DIR"' EXIT
        SDK_LEVEL=36
        AGENT_INVOCATIONS=0
        printf '%s\\n' ${quotedLines} > "$ARTIFACT_DIR/test-agent-log.txt"
        assert_agent_decision test 0 ${selected} ${emitted} ${invocationPolicy}
      `;
      return spawnSync('/bin/bash', ['-c', command], { encoding: 'utf8' });
    };
    const failClosedPolicy =
      'event=policy sdk=36 transportFlags=0 encryption=false d2d=false selected=false';
    const failClosedResult = 'event=result selected=false emitted=0';
    const selectedPolicy =
      'event=policy sdk=36 transportFlags=0 encryption=false d2d=false selected=true';
    const selectedResult = 'event=result selected=true emitted=3';
    const selectedPayloads = [
      'event=payload name=chessticize-mobile.sqlite',
      'event=payload name=chessticize-mobile.sqlite-journal',
      'event=payload name=chessticize-mobile.sqlite-wal',
    ];

    expect(runAssertion({
      emitted: 0,
      invocationPolicy: 'exactly-one',
      lines: [failClosedPolicy, failClosedResult],
      selected: false,
    }).status).toBe(0);
    const duplicateFailClosed = runAssertion({
      emitted: 0,
      invocationPolicy: 'exactly-one',
      lines: [failClosedPolicy, failClosedResult, failClosedPolicy, failClosedResult],
      selected: false,
    });
    expect(duplicateFailClosed.status).not.toBe(0);
    expect(duplicateFailClosed.stderr).toContain(
      'Expected exactly one BackupAgent invocation for test.',
    );
    expect(runAssertion({
      emitted: 3,
      invocationPolicy: 'repeated-identical',
      lines: [
        selectedPolicy,
        selectedResult,
        ...selectedPayloads,
        selectedPolicy,
        selectedResult,
        ...selectedPayloads,
      ],
      selected: true,
    }).status).toBe(0);
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

    expect(workflow).toContain('android-progress-backup-policy-api24:');
    expect(workflow).toContain('android-progress-backup-policy-api36:');
    expect(workflow).toContain('android-progress-backup-policy-api30:');
    expect(workflow).toContain('./gradlew :app:testDebugUnitTest');
    expect(workflow).toContain(
      '--tests com.chessticize.mobile.backup.ProgressBackupPolicyTest',
    );
    expect(workflow).toContain(
      'script: apps/mobile/scripts/android-progress-backup-policy-evidence.sh',
    );
    expect(workflow).toContain('name: android-progress-backup-policy-api-24');
    expect(workflow).toContain('name: android-progress-backup-policy-api-36');
    expect(workflow).toContain('name: android-progress-backup-policy-api-30');
    expect(policyEvidenceScript).toContain('set -euo pipefail');
    expect(policyEvidenceScript).toContain('case "$SDK_LEVEL"');
    expect(policyEvidenceScript).toMatch(
      /run_case no-capability 'non_incremental_only=false' 0 false 0 no-archive \\\s+fail-closed-transport-rejection/,
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
    expect(backupAgent).not.toContain('FLAG_FAKE_CLIENT_SIDE_ENCRYPTION_ENABLED');
    expect(backupAgent.indexOf('Build.VERSION.SDK_INT < Build.VERSION_CODES.P'))
      .toBeLessThan(backupAgent.indexOf('data.getTransportFlags()'));
    expect(backupAgent.match(/fullBackupFile\(/g)).toHaveLength(1);
    expect(backupPolicy).toContain(
      'private static final String[] DATABASE_SUFFIXES = {"", "-journal", "-wal"};',
    );
    expect(backupPolicy).toContain('!candidate.isFile()');
    expect(backupPolicyTest).toContain('apiBeforeTransportFlagsFailsClosedForEveryMask');
    expect(backupPolicyTest).toContain(
      'concreteAgentDeclaresInertKeyValueCallbacksAndFullBackupEntryPoint',
    );
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
    expect(backupContract).toContain('API 30 proves a delivered mask of `0`');
    expect(backupContract).toContain('API 36 uses the authoritative Android 16 LocalTransport');
    expect(backupContract).toContain(
      'default file restore path continues to enforce the XML',
    );
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
