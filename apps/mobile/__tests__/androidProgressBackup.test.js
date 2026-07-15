const { readFileSync, statSync } = require('node:fs');
const { join } = require('node:path');
const {
  ANDROID_AUTO_BACKUP_QUOTA_BYTES,
  ANDROID_PROGRESS_BACKUP_MAX_BYTES,
  PROGRESS_DATABASE_FILES,
  assessBackupPayload,
  assertBackupPayloadWithinContract,
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
    expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"');
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');

    expect(legacyBase).not.toContain('<include');
    for (const domain of ['root', 'file', 'database', 'sharedpref', 'external']) {
      expect(legacyBase).toContain(`<exclude domain="${domain}" path="."`);
    }

    expect(includePaths(legacyEncryptedAndD2d)).toEqual([
      ...PROGRESS_DATABASE_FILES.map(path => ({ path, flags: 'clientSideEncryption' })),
      ...PROGRESS_DATABASE_FILES.map(path => ({ path, flags: 'deviceToDeviceTransfer' })),
    ]);

    expect(modern).toContain('<cloud-backup disableIfNoEncryptionCapabilities="true">');
    expect(modern).toContain('<device-transfer>');
    expect(modern).not.toContain('<cross-platform-transfer');
    const modernIncludes = includePaths(modern);
    expect(modernIncludes).toEqual([
      ...PROGRESS_DATABASE_FILES.map(path => ({ path, flags: undefined })),
      ...PROGRESS_DATABASE_FILES.map(path => ({ path, flags: undefined })),
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

  it('normalizes one leading separator from the nested root pnpm invocation', () => {
    const workflow = readRepo('.github/workflows/mobile-android.yml');
    const rootPackage = JSON.parse(readRepo('package.json'));
    const mobilePackage = JSON.parse(read('package.json'));

    expect(workflow).toContain(
      'pnpm mobile:verify:android:backup -- --adb-device emulator-5554 --json',
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
    const restoreJourney = read('e2e/android-progress-backup-restore.e2e.js');
    const privacy = readRepo('docs/ANDROID_PRIVACY_DISCLOSURE.md');
    const policy = readRepo('docs/PRIVACY_POLICY.md');

    expect(suiteConfig).toContain('android-progress-backup-restore.e2e.js');
    expect(evidenceScript).toContain('com.android.localtransport/.LocalTransport');
    expect(evidenceScript).toContain(
      "backup_local_transport_parameters 'fake_encryption_flag=true'",
    );
    expect(evidenceScript.indexOf('fake_encryption_flag=true')).toBeLessThan(
      evidenceScript.indexOf('bmgr transport "$LOCAL_TRANSPORT"'),
    );
    expect(evidenceScript).toContain('com.google.android.gms/.backup.migrate.service.D2dTransport');
    expect(evidenceScript).toContain('backup_enable_d2d_test_mode 1');
    expect(evidenceScript).toContain(
      'grep -F "Package $APP_ID with result: Success"',
    );
    expect(evidenceScript).not.toContain(
      'grep -F "Backup finished with result: Success"',
    );
    expect(evidenceScript).toContain('bmgr init "$D2D_TRANSPORT"');
    expect(evidenceScript).toContain('pm uninstall --user 0');
    expect(evidenceScript).toContain('install-multiple -t --user 0');
    expect(restoreJourney).toContain("delete: false");
    expect(restoreJourney).toContain("history-attempt-legacy-attempt-standard-wrong");
    expect(workflow).toContain('name: Android Progress Backup restore evidence');
    expect(workflow).toContain('cloud-encrypted');
    expect(workflow).toContain('device-transfer');
    expect(workflow).toContain('pnpm mobile:verify:android:backup');
    expect(workflow).toContain('commit-sha=$GITHUB_SHA');
    expect(workflow).toContain('tracked-worktree-after.txt');
    expect(workflow).toContain('result=pass');

    expect(privacy).toContain('Android-managed backup');
    expect(privacy).toContain('Zero App Telemetry');
    expect(privacy).toContain('does not create a Chessticize account');
    expect(privacy).toContain('not continuous synchronization');
    expect(policy).toContain('Android Progress Backup');
    expect(policy).toContain('does not receive this backup data');
    expect(privacy).toContain('does not enable transfer between Android and iOS');
    expect(policy.replace(/\s+/g, ' ')).toContain('does not enable transfer between Android and iOS');
  });
});
