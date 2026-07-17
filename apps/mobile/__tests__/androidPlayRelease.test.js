const fs = require('node:fs');
const path = require('node:path');

const {
  inspectBundleEntries,
  inspectOwnerEvidence,
  inspectReleaseManifest,
  normalizeFingerprint,
  parseArguments,
  parseZipListing,
} = require('../scripts/android-play-release');

const mobileRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(mobileRoot, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function pngDimensions(relativePath) {
  const png = fs.readFileSync(path.join(repoRoot, relativePath));
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

function validOwnerEvidence(overrides = {}) {
  return {
    schemaVersion: 1,
    candidate: {
      commitSha: 'a'.repeat(40),
      aabSha256: 'b'.repeat(64),
      applicationId: 'com.chessticize.mobile',
      versionName: '1.1',
      versionCode: 1,
    },
    signing: {
      playAppSigningEnrolled: true,
      uploadCertificateSha256: '11'.repeat(32),
      appSigningCertificateSha256: '33'.repeat(32),
    },
    console: {
      developerVerification: 'verified',
      storeListing: 'reviewed',
      privacyPolicy: 'reviewed',
      dataSafety: 'reviewed',
      supportedDevices: 'reviewed',
    },
    testing: {
      internalInstall: 'pass',
      closedInstall: 'pass',
      preLaunch: 'pass',
      androidMatrix: 'pass',
      matrixCommitSha: 'a'.repeat(40),
    },
    production: {
      status: 'prepared',
      rolloutPercentage: 100,
      launched: false,
    },
    artifacts: {
      nativeDebugSymbolsRetained: true,
      licenseNoticesRetained: true,
      universalApkBytes: 340_000_000,
      arm64ApkBytes: 310_000_000,
      largestContributors: [
        { path: 'base/assets/stockfish/nn-1c0000000000.nnue', bytes: 110_000_000 },
        { path: 'base/lib/arm64-v8a/libstockfish.so', bytes: 65_000_000 },
        { path: 'base/assets/puzzle-packs/bundled-core-pack.sqlite', bytes: 8_000_000 },
      ],
      universalApkExpectation: {
        minimumBytes: 300_000_000,
        maximumBytes: 380_000_000,
        approvalReference: 'https://github.com/Chessticize/chessticize-mobile/issues/186',
      },
    },
    ...overrides,
  };
}

describe('Android Play release contract', () => {
  it('uses one public semantic version while Android keeps an independent version code', () => {
    const releaseVersion = JSON.parse(read('apps/mobile/release-version.json'));
    const appGradle = read('apps/mobile/android/app/build.gradle');
    const iosProject = read(
      'apps/mobile/ios/ChessticizeMobile.xcodeproj/project.pbxproj',
    );

    expect(releaseVersion).toEqual({
      schemaVersion: 1,
      publicVersion: '1.1',
      androidVersionCode: 1,
    });
    expect(appGradle).toContain('release-version.json');
    expect(appGradle).toContain('versionCode releaseVersion.androidVersionCode');
    expect(appGradle).toContain('versionName releaseVersion.publicVersion');
    expect(iosProject).toMatch(/MARKETING_VERSION = 1\.1;/g);
    expect(iosProject).toMatch(/CURRENT_PROJECT_VERSION = 2;/g);
  });

  it('reads displayed version and build values from each installed artifact', () => {
    const sharedMetadata = read(
      'apps/mobile/src/backend/mobilePlatformCapabilities.ts',
    );
    const nativeMetadata = read(
      'apps/mobile/src/backend/nativeApplicationMetadata.ts',
    );
    const androidModule = read(
      'apps/mobile/android/app/src/main/java/com/chessticize/mobile/ApplicationMetadataModule.kt',
    );
    const iosModule = read(
      'apps/mobile/ios/ChessticizeMobile/ApplicationMetadata.m',
    );

    expect(sharedMetadata).not.toMatch(/versionName:\s*['"]/);
    expect(nativeMetadata).toContain('NativeModules.ApplicationMetadata');
    expect(androidModule).toContain('BuildConfig.VERSION_NAME');
    expect(androidModule).toContain('BuildConfig.VERSION_CODE');
    expect(iosModule).toContain('CFBundleShortVersionString');
    expect(iosModule).toContain('CFBundleVersion');
  });

  it('packages release symbols and required source notices', () => {
    const appGradle = read('apps/mobile/android/app/build.gradle');
    const strings = read(
      'apps/mobile/android/app/src/main/res/values/strings.xml',
    );

    expect(appGradle).toContain("debugSymbolLevel 'FULL'");
    expect(appGradle).toContain('copyReleaseNoticeAssets');
    expect(appGradle).toContain('THIRD_PARTY_NOTICES.md');
    expect(appGradle).toContain('Copying.txt');
    expect(appGradle).toContain('AUTHORS');
    expect(appGradle).toContain('assets.srcDir(copyPuzzlePackAsset)');
    expect(appGradle).toContain('assets.srcDir(copyStockfishNnueAssets)');
    expect(appGradle).toContain('assets.srcDir(copyReleaseNoticeAssets)');
    expect(strings).toContain('<string name="app_name">Chessticize</string>');
    expect(fs.existsSync(path.join(
      mobileRoot,
      'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
    ))).toBe(true);
    expect(fs.existsSync(path.join(
      mobileRoot,
      'store-assets/android/play-icon-512.png',
    ))).toBe(true);
    expect(fs.existsSync(path.join(
      mobileRoot,
      'store-assets/android/feature-graphic-1024x500.png',
    ))).toBe(true);
    expect(pngDimensions('apps/mobile/store-assets/android/play-icon-512.png')).toEqual({
      width: 512,
      height: 512,
    });
    expect(pngDimensions(
      'apps/mobile/store-assets/android/feature-graphic-1024x500.png',
    )).toEqual({
      width: 1024,
      height: 500,
    });
  });

  it('pins every transitive Android library build to the canonical NDK', () => {
    const rootGradle = read('apps/mobile/android/build.gradle');

    expect(rootGradle).toContain('subproject.pluginManager.withPlugin("com.android.library")');
    expect(rootGradle).toContain('subproject.android.ndkVersion = rootProject.ext.ndkVersion');
  });

  it('keeps the production manifest free of app network access', () => {
    const mainManifest = read(
      'apps/mobile/android/app/src/main/AndroidManifest.xml',
    );
    const debugManifest = read(
      'apps/mobile/android/app/src/debug/AndroidManifest.xml',
    );

    expect(mainManifest).not.toContain('android.permission.INTERNET');
    expect(debugManifest).toContain('android.permission.INTERNET');
    expect(inspectReleaseManifest(`
      <manifest package="com.chessticize.mobile" android:versionCode="1" android:versionName="1.1">
        <uses-permission android:name="android.permission.INTERNET"/>
        <application android:debuggable="true" android:testOnly="true"/>
      </manifest>
    `)).toEqual(expect.arrayContaining([
      expect.stringContaining('INTERNET'),
      expect.stringContaining('debuggable'),
      expect.stringContaining('test-only'),
    ]));
  });

  it('requires both approved ABIs, 16 KB metadata, symbols, and notices in the AAB', () => {
    const result = inspectBundleEntries([
      'base/lib/arm64-v8a/libappmodules.so',
      'base/lib/arm64-v8a/libstockfish.so',
      'base/lib/x86_64/libappmodules.so',
      'base/lib/x86_64/libstockfish.so',
      'base/assets/licenses/LICENSE',
      'base/assets/licenses/THIRD_PARTY_NOTICES.md',
      'base/assets/licenses/stockfish/COPYING.txt',
      'base/assets/licenses/stockfish/AUTHORS',
      'BUNDLE-METADATA/com.android.tools.build.debugsymbols/arm64-v8a/libappmodules.so.dbg',
      'BUNDLE-METADATA/com.android.tools.build.debugsymbols/arm64-v8a/libstockfish.so.dbg',
      'BUNDLE-METADATA/com.android.tools.build.debugsymbols/x86_64/libappmodules.so.dbg',
      'BUNDLE-METADATA/com.android.tools.build.debugsymbols/x86_64/libstockfish.so.dbg',
    ], {
      pageAlignment: 'PAGE_ALIGNMENT_16K',
    });

    expect(result.errors).toEqual([]);
    expect(result.abis).toEqual(['arm64-v8a', 'x86_64']);
  });

  it('rejects owner evidence unless every console and exact-artifact gate is complete', () => {
    const expected = {
      commitSha: 'a'.repeat(40),
      aabSha256: 'b'.repeat(64),
      applicationId: 'com.chessticize.mobile',
      versionName: '1.1',
      versionCode: 1,
      uploadCertificateSha256: '11'.repeat(32),
    };

    expect(inspectOwnerEvidence(validOwnerEvidence(), expected)).toEqual([]);

    const closedTrackOnly = validOwnerEvidence();
    closedTrackOnly.testing.internalInstall = 'not-run';
    expect(inspectOwnerEvidence(closedTrackOnly, expected)).toEqual([]);

    const incomplete = validOwnerEvidence({
      signing: {
        playAppSigningEnrolled: false,
        uploadCertificateSha256: '00'.repeat(32),
        appSigningCertificateSha256: '',
      },
      production: {
        status: 'prepared',
        rolloutPercentage: 100,
        launched: true,
      },
    });
    expect(inspectOwnerEvidence(incomplete, expected)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Play App Signing'),
        expect.stringContaining('upload certificate'),
        expect.stringContaining('must not be launched'),
      ]),
    );
  });

  it('normalizes certificate fingerprints without accepting malformed values', () => {
    const fingerprint = Array.from({ length: 32 }, (_, index) =>
      index.toString(16).padStart(2, '0'),
    ).join(':');
    expect(normalizeFingerprint(fingerprint)).toBe(
      Array.from({ length: 32 }, (_, index) =>
        index.toString(16).padStart(2, '0'),
      ).join('').toUpperCase(),
    );
    expect(() => normalizeFingerprint('not-a-fingerprint')).toThrow(
      'Invalid SHA-256 certificate fingerprint',
    );
  });

  it('records the largest packaged contributors deterministically', () => {
    expect(parseZipListing(`Archive: candidate.aab
  Length      Date    Time    Name
---------  ---------- -----   ----
      100  2026-07-17 12:00   base/small.bin
      900  2026-07-17 12:00   base/large.bin
      300  2026-07-17 12:00   base/medium.bin
---------                     -------
     1300                     3 files
`, 2)).toEqual([
      { path: 'base/large.bin', bytes: 900 },
      { path: 'base/medium.bin', bytes: 300 },
    ]);
  });

  it('accepts the pnpm argument separator used by the root release command', () => {
    expect(parseArguments([
      '--',
      '--artifact-only',
      '--bundle',
      'candidate.aab',
      '--bundletool',
      'bundletool.jar',
    ])).toEqual({
      artifactOnly: true,
      bundle: 'candidate.aab',
      bundletool: 'bundletool.jar',
    });
  });

  it('keeps release construction manual, protected, exact-artifact, and fail closed', () => {
    const workflow = read(
      '.github/workflows/mobile-android-release-candidate.yml',
    );
    const runbook = read('docs/ANDROID_PLAY_RELEASE.md');
    const listing = read('docs/ANDROID_PLAY_LISTING.md');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('push:');
    expect(workflow).toContain('environment: android-production');
    expect(workflow).toContain('ANDROID_RELEASE_KEYSTORE_BASE64');
    expect(workflow).toContain('ANDROID_UPLOAD_CERT_SHA256');
    expect(workflow).toContain('--artifact-only');
    expect(workflow).toContain('retention-days: 30');
    expect(runbook).toContain('cannot produce a `play-ready` verdict');
    expect(runbook).toContain('do not start the rollout in #186');
    expect(listing).toContain('Data collected: No');
    expect(listing).toContain('production manifest intentionally has no `INTERNET` permission');
  });
});
