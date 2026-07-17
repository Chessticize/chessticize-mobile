const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  inspectBundleEntries,
  inspectOwnerEvidence,
  inspectReleaseManifest,
  normalizeFingerprint,
  parseArguments,
  parseZipListing,
  requireApprovedSingleSigner,
  resolveRepoPath,
  requireVerifiedJar,
} = require('../scripts/android-play-release');

const mobileRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(mobileRoot, '../..');
const releaseVersion = JSON.parse(read('apps/mobile/release-version.json'));

const expectedCandidate = {
  commitSha: 'a'.repeat(40),
  aabSha256: 'b'.repeat(64),
  applicationId: 'com.chessticize.mobile',
  versionName: releaseVersion.publicVersion,
  versionCode: releaseVersion.androidVersionCode,
  uploadCertificateSha256: '11'.repeat(32),
};

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

function candidateBinding(overrides = {}) {
  return {
    commitSha: expectedCandidate.commitSha,
    aabSha256: expectedCandidate.aabSha256,
    applicationId: expectedCandidate.applicationId,
    versionName: expectedCandidate.versionName,
    versionCode: expectedCandidate.versionCode,
    ...overrides,
  };
}

function evidenceRecord(status, evidenceId, overrides = {}) {
  return {
    status,
    evidenceId,
    reference: `https://play.google.com/console/evidence/${evidenceId}`,
    candidate: candidateBinding(),
    ...overrides,
  };
}

function validOwnerEvidence(overrides = {}) {
  return {
    schemaVersion: 2,
    candidate: candidateBinding(),
    signing: {
      uploadCertificateSha256: expectedCandidate.uploadCertificateSha256,
      appSigningCertificateSha256: '33'.repeat(32),
      protectedUploadSigning: evidenceRecord('pass', 'upload-workflow-123', {
        reference: 'https://github.com/Chessticize/chessticize-mobile/actions/runs/123',
        workflowRunId: 123,
        artifactId: 456,
      }),
      playAppSigning: evidenceRecord('enrolled', 'play-app-signing-789'),
    },
    console: {
      developerVerification: evidenceRecord('verified', 'developer-verification-1'),
      storeListing: evidenceRecord('reviewed', 'store-listing-2'),
      privacyPolicy: evidenceRecord('reviewed', 'privacy-policy-3'),
      dataSafety: evidenceRecord('reviewed', 'data-safety-4'),
      supportedDevices: evidenceRecord('reviewed', 'device-catalog-5'),
    },
    testing: {
      internalInstall: evidenceRecord('pass', 'internal-install-6', {
        track: 'internal',
        releaseId: 'internal-release-6',
      }),
      closedInstall: evidenceRecord('pass', 'closed-install-7', {
        track: 'closed',
        releaseId: 'closed-release-7',
      }),
      preLaunch: evidenceRecord('pass', 'pre-launch-report-8', {
        reportId: 'pre-launch-report-8',
      }),
      androidMatrix: evidenceRecord('pass', 'android-matrix-9', {
        reference: 'https://github.com/Chessticize/chessticize-mobile/actions/runs/901',
        runId: 901,
        artifactIds: [902, 903],
      }),
    },
    production: evidenceRecord('prepared', 'production-draft-10', {
      status: 'prepared',
      rolloutPercentage: 100,
      launched: false,
      releaseId: 'production-release-10',
    }),
    artifacts: {
      generatedApkSizes: evidenceRecord('pass', 'generated-apk-sizes-11', {
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
      }),
    },
    ...overrides,
  };
}

function runJdkTool(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function signedAabFixture({ appendUnsigned = false, addUnexpectedSigner = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-signed-aab-'));
  const bundlePath = path.join(directory, 'candidate.aab');
  const keystorePath = path.join(directory, 'signers.p12');
  const password = 'fixture-password';
  fs.writeFileSync(path.join(directory, 'approved-entry.txt'), 'approved payload\n');
  fs.writeFileSync(path.join(directory, 'appended-entry.txt'), 'appended payload\n');
  runJdkTool('jar', [
    '--create', '--file', bundlePath, '-C', directory, 'approved-entry.txt',
  ]);
  for (const alias of addUnexpectedSigner ? ['approved', 'unexpected'] : ['approved']) {
    runJdkTool('keytool', [
      '-genkeypair', '-keystore', keystorePath, '-storetype', 'PKCS12',
      '-storepass', password, '-keypass', password, '-alias', alias,
      '-keyalg', 'RSA', '-keysize', '2048', '-validity', '2',
      '-dname', `CN=${alias}`,
    ]);
  }
  runJdkTool('jarsigner', [
    '-keystore', keystorePath, '-storepass', password, '-keypass', password,
    bundlePath, 'approved',
  ]);
  if (appendUnsigned) {
    runJdkTool('jar', [
      '--update', '--file', bundlePath, '-C', directory, 'appended-entry.txt',
    ]);
  }
  if (addUnexpectedSigner) {
    runJdkTool('jarsigner', [
      '-keystore', keystorePath, '-storepass', password, '-keypass', password,
      bundlePath, 'unexpected',
    ]);
  }
  const approvedCertificate = runJdkTool('keytool', [
    '-list', '-v', '-keystore', keystorePath, '-storepass', password,
    '-alias', 'approved',
  ]).stdout;
  const approvedFingerprint = normalizeFingerprint(
    approvedCertificate.match(/SHA256:\s*([0-9A-F:]+)/i)?.[1],
  );
  return {
    approvedFingerprint,
    bundlePath,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
    entries: runJdkTool('unzip', ['-Z1', bundlePath]).stdout.trim().split(/\r?\n/),
    signerOutput: runJdkTool('keytool', ['-printcert', '-jarfile', bundlePath]).stdout,
    verification: spawnSync('jarsigner', ['-verify', '-verbose', bundlePath], {
      encoding: 'utf8',
      env: { ...process.env, LANG: 'C' },
    }),
  };
}

describe('Android Play release contract', () => {
  it('uses one public semantic version while Android keeps an independent version code', () => {
    const appGradle = read('apps/mobile/android/app/build.gradle');
    const iosProject = read(
      'apps/mobile/ios/ChessticizeMobile.xcodeproj/project.pbxproj',
    );

    expect(releaseVersion.schemaVersion).toBe(1);
    expect(releaseVersion.publicVersion).toMatch(/^\d+\.\d+(?:\.\d+)?$/);
    expect(releaseVersion.androidVersionCode).toBeGreaterThan(0);
    expect(appGradle).toContain('release-version.json');
    expect(appGradle).toContain('versionCode releaseVersion.androidVersionCode');
    expect(appGradle).toContain('versionName releaseVersion.publicVersion');
    expect(iosProject).not.toMatch(/MARKETING_VERSION = \d/);
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
    expect(appGradle).toContain('class GenerateChessticizeAssets');
    expect(appGradle).toContain('THIRD_PARTY_NOTICES.md');
    expect(appGradle).toContain('Copying.txt');
    expect(appGradle).toContain('AUTHORS');
    expect(appGradle).toContain('variant.sources.assets.addGeneratedSourceDirectory');
    expect(appGradle).toContain('generated/assets/chessticize/${variant.name}');
    expect(appGradle).not.toContain('assets.srcDir(');
    expect(appGradle).toContain('spec.from(puzzlePack.get().asFile) {');
    expect(appGradle).toContain('into "puzzle-packs"');
    expect(appGradle).toContain('spec.from(nnueFiles) {');
    expect(appGradle).toContain('spec.from(stockfishManifest.get().asFile) {');
    expect(appGradle).toContain('into "stockfish"');
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

  it('requires runtime assets, both approved ABIs, 16 KB metadata, symbols, and notices in the AAB', () => {
    const entries = [
      'base/lib/arm64-v8a/libappmodules.so',
      'base/lib/arm64-v8a/libstockfish.so',
      'base/lib/x86_64/libappmodules.so',
      'base/lib/x86_64/libstockfish.so',
      'base/assets/puzzle-packs/bundled-core-pack.sqlite',
      'base/assets/stockfish/stockfish-artifacts.json',
      'base/assets/stockfish/nn-c288c895ea92.nnue',
      'base/assets/stockfish/nn-37f18f62d772.nnue',
      'base/assets/licenses/LICENSE',
      'base/assets/licenses/THIRD_PARTY_NOTICES.md',
      'base/assets/licenses/stockfish/COPYING.txt',
      'base/assets/licenses/stockfish/AUTHORS',
      'BUNDLE-METADATA/com.android.tools.build.debugsymbols/arm64-v8a/libappmodules.so.dbg',
      'BUNDLE-METADATA/com.android.tools.build.debugsymbols/arm64-v8a/libstockfish.so.dbg',
      'BUNDLE-METADATA/com.android.tools.build.debugsymbols/x86_64/libappmodules.so.dbg',
      'BUNDLE-METADATA/com.android.tools.build.debugsymbols/x86_64/libstockfish.so.dbg',
    ];
    const result = inspectBundleEntries(entries, {
      pageAlignment: 'PAGE_ALIGNMENT_16K',
    });

    expect(result.errors).toEqual([]);
    expect(result.abis).toEqual(['arm64-v8a', 'x86_64']);

    const missingRuntimeAssets = inspectBundleEntries(entries.filter(
      entry => !entry.includes('/assets/stockfish/') &&
        entry !== 'base/assets/puzzle-packs/bundled-core-pack.sqlite',
    ), {
      pageAlignment: 'PAGE_ALIGNMENT_16K',
    });
    expect(missingRuntimeAssets.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('base/assets/puzzle-packs/bundled-core-pack.sqlite'),
      expect.stringContaining('base/assets/stockfish/stockfish-artifacts.json'),
      expect.stringContaining('base/assets/stockfish/nn-c288c895ea92.nnue'),
      expect.stringContaining('base/assets/stockfish/nn-37f18f62d772.nnue'),
    ]));
  });

  it('rejects owner evidence unless every console and exact-artifact gate is complete', () => {
    expect(inspectOwnerEvidence(validOwnerEvidence(), expectedCandidate)).toEqual([]);

    const closedTrackOnly = validOwnerEvidence();
    closedTrackOnly.testing.internalInstall = { status: 'not-run' };
    expect(inspectOwnerEvidence(closedTrackOnly, expectedCandidate)).toEqual([]);

    const incomplete = validOwnerEvidence({
      signing: {
        uploadCertificateSha256: '00'.repeat(32),
        appSigningCertificateSha256: '',
        protectedUploadSigning: { status: 'pass' },
        playAppSigning: { status: 'enrolled' },
      },
      production: evidenceRecord('prepared', 'production-draft-10', {
        rolloutPercentage: 100,
        launched: true,
      }),
    });
    expect(inspectOwnerEvidence(incomplete, expectedCandidate)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Play App Signing'),
        expect.stringContaining('upload certificate'),
        expect.stringContaining('must not be launched'),
      ]),
    );
  });

  it.each([
    ['aabSha256', 'c'.repeat(64), 'AAB SHA-256'],
    ['versionName', '99.0', 'version name'],
    ['versionCode', 999, 'version code'],
  ])('rejects owner evidence whose per-gate %s binding does not match the exact AAB',
    (field, value, expectedMessage) => {
      const evidence = validOwnerEvidence();
      evidence.console.storeListing.candidate[field] = value;
      expect(inspectOwnerEvidence(evidence, expectedCandidate)).toEqual(
        expect.arrayContaining([expect.stringContaining(expectedMessage)]),
      );
    });

  it('rejects hand-authored passing flags without auditable references and IDs', () => {
    const evidence = validOwnerEvidence({
      signing: {
        uploadCertificateSha256: expectedCandidate.uploadCertificateSha256,
        appSigningCertificateSha256: '33'.repeat(32),
        protectedUploadSigning: { status: 'pass' },
        playAppSigning: { status: 'enrolled' },
      },
      console: {
        developerVerification: { status: 'verified' },
        storeListing: { status: 'reviewed' },
        privacyPolicy: { status: 'reviewed' },
        dataSafety: { status: 'reviewed' },
        supportedDevices: { status: 'reviewed' },
      },
    });
    expect(inspectOwnerEvidence(evidence, expectedCandidate)).not.toEqual([]);
    expect(inspectOwnerEvidence(evidence, expectedCandidate)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('auditable HTTPS reference'),
        expect.stringContaining('evidence ID'),
        expect.stringContaining('candidate binding'),
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

  it('accepts verified Android certificates but rejects unsigned jars', () => {
    expect(requireVerifiedJar({
      status: 0,
      stdout: 'sm 10 Fri Jul 17 00:00:00 UTC 2026 base/payload.bin\njar verified.\n',
      stderr: 'Warning: certificate is self-signed.\n',
    }, ['base/payload.bin'])).toContain('jar verified.');
    expect(() => requireVerifiedJar({
      status: 0,
      stdout: 'jar is unsigned.\n',
      stderr: '',
    }, ['base/payload.bin'])).toThrow('did not confirm a signed JAR');
  });

  it('rejects a signed AAB after an unsigned entry is appended', () => {
    const fixture = signedAabFixture({ appendUnsigned: true });
    try {
      expect(fixture.verification.status).toBe(0);
      expect(fixture.verification.stdout).toContain('jar verified.');
      expect(() => requireVerifiedJar(
        fixture.verification,
        fixture.entries,
      )).toThrow(/unsigned.*appended-entry\.txt/i);
    } finally {
      fixture.cleanup();
    }
  });

  it('rejects AABs with unexpected or multiple signers', () => {
    const fixture = signedAabFixture({ addUnexpectedSigner: true });
    try {
      expect(() => requireApprovedSingleSigner(
        fixture.signerOutput,
        fixture.approvedFingerprint,
      )).toThrow(/exactly one signer/i);
    } finally {
      fixture.cleanup();
    }
  });

  it('records the largest packaged contributors deterministically', () => {
    expect(parseZipListing(`Archive: candidate.aab
  Length      Date    Time    Name
---------  ---------- -----   ----
      100  01-01-1981 01:01   base/small.bin
      900  01-01-1981 01:01   base/large.bin
      300  01-01-1981 01:01   base/medium.bin
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

  it('resolves release paths from the repository root after pnpm changes cwd', () => {
    expect(resolveRepoPath(
      'apps/mobile/android/app/build/outputs/bundle/release/app-release.aab',
      repoRoot,
    )).toBe(path.join(
      repoRoot,
      'apps/mobile/android/app/build/outputs/bundle/release/app-release.aab',
    ));
    expect(resolveRepoPath('/tmp/bundletool.jar', repoRoot)).toBe(
      '/tmp/bundletool.jar',
    );
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
