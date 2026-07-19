const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  canonicalAndroidSourceTag,
  inspectBundleEntries,
  inspectOwnerEvidence,
  inspectPublishedSourceRelease,
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
const ownerEvidenceExample = JSON.parse(
  read('docs/android-play-owner-evidence.example.json'),
);

const expectedCandidate = {
  commitSha: 'a'.repeat(40),
  aabSha256: 'b'.repeat(64),
  applicationId: 'com.chessticize.mobile',
  versionName: releaseVersion.publicVersion,
  versionCode: releaseVersion.androidVersionCode,
  uploadCertificateSha256: '11'.repeat(32),
};
const originalGitHubToken = process.env.GITHUB_TOKEN;

beforeAll(() => {
  process.env.GITHUB_TOKEN = 'test-only-github-token';
});

afterAll(() => {
  if (originalGitHubToken === undefined) {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = originalGitHubToken;
  }
});

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function pngMetadataAt(filePath) {
  const png = fs.readFileSync(filePath);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(png.readUInt32BE(8)).toBe(13);
  expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    bitDepth: png[24],
    colorType: png[25],
  };
}

function pngMetadata(relativePath) {
  return pngMetadataAt(path.join(repoRoot, relativePath));
}

function repeatedByteDigest(byte, size) {
  const hash = crypto.createHash('sha256');
  const chunk = Buffer.alloc(1024 * 1024, byte);
  let remaining = size;
  while (remaining > 0) {
    const count = Math.min(remaining, chunk.length);
    hash.update(count === chunk.length ? chunk : chunk.subarray(0, count));
    remaining -= count;
  }
  return hash.digest('hex');
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

function retainedSourceManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    status: 'artifact-only',
    commitSha: expectedCandidate.commitSha,
    worktreeClean: true,
    bundle: {
      sha256: expectedCandidate.aabSha256,
      applicationId: expectedCandidate.applicationId,
      versionName: expectedCandidate.versionName,
      versionCode: expectedCandidate.versionCode,
    },
    ...overrides,
  };
}

function retainedSourceManifestBytes(overrides = {}) {
  return Buffer.from(`${JSON.stringify(retainedSourceManifest(overrides), null, 2)}\n`);
}

function retainedSourceManifestSha256(overrides = {}) {
  return crypto.createHash('sha256')
    .update(retainedSourceManifestBytes(overrides))
    .digest('hex');
}

function protectedWorkflowArchiveBytes() {
  return Buffer.from('deterministic-protected-workflow-archive');
}

function protectedWorkflowArchiveSha256() {
  return crypto.createHash('sha256')
    .update(protectedWorkflowArchiveBytes())
    .digest('hex');
}

function sourceSupportDocumentationBytes(overrides = {}) {
  const tag = overrides.tag ?? 'android-v1.1.0-build-1';
  const repository = overrides.repository ??
    'https://github.com/Chessticize/chessticize-mobile';
  return Buffer.from(`Public Android source: ${repository} at ${tag}.\n`);
}

function sourceSupportDocumentationSha256(overrides = {}) {
  return crypto.createHash('sha256')
    .update(sourceSupportDocumentationBytes(overrides))
    .digest('hex');
}

function validOwnerEvidence(overrides = {}) {
  const sourceTag = 'android-v1.1.0-build-1';
  const sourceReleaseUrl =
    `https://github.com/Chessticize/chessticize-mobile/releases/tag/${sourceTag}`;
  return {
    schemaVersion: 3,
    candidate: candidateBinding(),
    sourceRelease: evidenceRecord('published', 'source-release-123', {
      reference: sourceReleaseUrl,
      repositoryUrl: 'https://github.com/Chessticize/chessticize-mobile',
      tagName: sourceTag,
      tagCommitSha: expectedCandidate.commitSha,
      tagType: 'annotated',
      releaseId: 123,
      published: true,
      sourceManifest: {
        status: 'retained',
        releaseAssetId: 456,
        assetName: 'android-source-manifest.json',
        sha256: retainedSourceManifestSha256(),
        reference:
          `https://github.com/Chessticize/chessticize-mobile/releases/download/` +
          `${sourceTag}/android-source-manifest.json`,
        releaseId: 123,
        tagName: sourceTag,
        commitSha: expectedCandidate.commitSha,
        workflowRunId: 123,
        workflowRunReference:
          'https://github.com/Chessticize/chessticize-mobile/actions/runs/123',
        workflowArtifactId: 789,
        workflowArtifactName:
          `android-signed-release-candidate-${expectedCandidate.commitSha}`,
        workflowArtifactEntry:
          'artifacts/android-release/android-source-manifest.json',
        workflowArtifactSha256: protectedWorkflowArchiveSha256(),
        candidate: candidateBinding(),
      },
      sourceDisclosure: {
        releaseNotesReference: sourceReleaseUrl,
        supportDocumentation: evidenceRecord('published', 'source-support-123', {
          reference:
            'https://raw.githubusercontent.com/Chessticize/chessticize-mobile/' +
            `${expectedCandidate.commitSha}/docs/ANDROID_PLAY_RELEASE.md`,
          sha256: sourceSupportDocumentationSha256(),
        }),
      },
    }),
    signing: {
      uploadCertificateSha256: expectedCandidate.uploadCertificateSha256,
      appSigningCertificateSha256: '33'.repeat(32),
      protectedUploadSigning: evidenceRecord('pass', 'upload-workflow-123', {
        reference: 'https://github.com/Chessticize/chessticize-mobile/actions/runs/123',
        workflowRunId: 123,
        artifactId: 789,
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

function publishedSourceRelease(overrides = {}) {
  const sourceRelease = validOwnerEvidence().sourceRelease;
  return {
    id: sourceRelease.releaseId,
    html_url: sourceRelease.reference,
    tag_name: sourceRelease.tagName,
    draft: false,
    published_at: '2026-07-17T00:00:00Z',
    body:
      `Source tag: ${sourceRelease.tagName}\n` +
      `Repository: ${sourceRelease.repositoryUrl}`,
    assets: [{
      id: sourceRelease.sourceManifest.releaseAssetId,
      name: sourceRelease.sourceManifest.assetName,
      state: 'uploaded',
      browser_download_url: sourceRelease.sourceManifest.reference,
      digest: `sha256:${sourceRelease.sourceManifest.sha256}`,
    }],
    ...overrides,
  };
}

function publishedWorkflowRun(overrides = {}) {
  return {
    id: 123,
    name: 'Mobile Android release candidate',
    path: '.github/workflows/mobile-android-release-candidate.yml',
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
    head_sha: expectedCandidate.commitSha,
    html_url: 'https://github.com/Chessticize/chessticize-mobile/actions/runs/123',
    ...overrides,
  };
}

function publishedWorkflowArtifact(overrides = {}) {
  return {
    id: 789,
    name: `android-signed-release-candidate-${expectedCandidate.commitSha}`,
    expired: false,
    digest: `sha256:${protectedWorkflowArchiveSha256()}`,
    archive_download_url:
      'https://api.github.com/repos/Chessticize/chessticize-mobile/' +
      'actions/artifacts/789/zip',
    workflow_run: {
      id: 123,
      head_sha: expectedCandidate.commitSha,
    },
    ...overrides,
  };
}

function publishedTagRef(overrides = {}) {
  return {
    ref: 'refs/tags/android-v1.1.0-build-1',
    object: {
      type: 'tag',
      sha: 'd'.repeat(40),
    },
    ...overrides,
  };
}

function publishedTagObject(overrides = {}) {
  return {
    tag: 'android-v1.1.0-build-1',
    object: {
      type: 'commit',
      sha: expectedCandidate.commitSha,
    },
    verification: {
      verified: true,
    },
    ...overrides,
  };
}

function sourceReleaseRun(overrides = {}) {
  const responses = {
    'git cat-file -t android-v1.1.0-build-1': {
      status: 0,
      stdout: 'tag\n',
      stderr: '',
    },
    'git rev-list -n 1 android-v1.1.0-build-1': {
      status: 0,
      stdout: `${expectedCandidate.commitSha}\n`,
      stderr: '',
    },
    'git cat-file tag android-v1.1.0-build-1': {
      status: 0,
      stdout: 'object candidate\ntype commit\ntag android-v1.1.0-build-1\n',
      stderr: '',
    },
    'curl release': {
      status: 0,
      stdout: JSON.stringify(publishedSourceRelease()),
      stderr: '',
    },
    'curl tag ref': {
      status: 0,
      stdout: JSON.stringify(publishedTagRef()),
      stderr: '',
    },
    'curl tag object': {
      status: 0,
      stdout: JSON.stringify(publishedTagObject()),
      stderr: '',
    },
    'curl workflow run': {
      status: 0,
      stdout: JSON.stringify(publishedWorkflowRun()),
      stderr: '',
    },
    'curl workflow artifact': {
      status: 0,
      stdout: JSON.stringify(publishedWorkflowArtifact()),
      stderr: '',
    },
    'curl workflow archive redirect': {
      status: 0,
      stdout:
        'HTTP/2 302 Found\r\n' +
        'location: https://artifact.example.test/signed/android-release.zip\r\n\r\n',
      stderr: '',
    },
    'curl workflow archive': {
      status: 0,
      stdout: protectedWorkflowArchiveBytes(),
      stderr: '',
    },
    'curl manifest': {
      status: 0,
      stdout: retainedSourceManifestBytes(),
      stderr: '',
    },
    'curl support documentation': {
      status: 0,
      stdout: sourceSupportDocumentationBytes(),
      stderr: '',
    },
    'unzip manifest': {
      status: 0,
      stdout: retainedSourceManifestBytes(),
      stderr: '',
    },
    ...overrides,
  };
  return (command, args, options) => {
    const key = command === 'unzip'
      ? 'unzip manifest'
      : command === 'curl'
    ? (args.at(-1).includes('/git/ref/tags/')
      ? 'curl tag ref'
      : args.at(-1).includes('/git/tags/')
        ? 'curl tag object'
        : args.at(-1).includes('/actions/runs/')
          ? 'curl workflow run'
          : args.at(-1).endsWith('/zip')
            ? 'curl workflow archive redirect'
            : args.at(-1).startsWith('https://artifact.example.test/')
              ? 'curl workflow archive'
            : args.at(-1).includes('/actions/artifacts/')
              ? 'curl workflow artifact'
              : args.at(-1).startsWith('https://raw.githubusercontent.com/')
                ? 'curl support documentation'
        : args.at(-1).startsWith('https://api.github.com/')
          ? 'curl release'
          : 'curl manifest')
      : `${command} ${args.join(' ')}`;
    const response = responses[key] ?? {
      status: 1,
      stdout: '',
      stderr: `Unexpected command: ${command} ${args.join(' ')}`,
    };
    if (key === 'curl workflow archive' && response.status === 0) {
      const outputIndex = args.indexOf('--output');
      if (outputIndex < 0 || options?.maxBuffer !== undefined) {
        return {
          status: 70,
          stdout: '',
          stderr: 'Refusing a buffered protected workflow archive download.',
        };
      }
      const outputPath = args[outputIndex + 1];
      if (typeof response.writeOutput === 'function') {
        response.writeOutput(outputPath);
      } else {
        fs.writeFileSync(outputPath, response.stdout);
      }
      return { ...response, stdout: '' };
    }
    if (key === 'unzip manifest' && !fs.existsSync(args[1])) {
      return { status: 11, stdout: '', stderr: 'Archive path is missing.' };
    }
    return response;
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
    const featureRenderer = read(
      'apps/mobile/store-assets/android/render-feature-graphic.swift',
    );
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
    expect(pngMetadata('apps/mobile/store-assets/android/play-icon-512.png')).toEqual({
      width: 512,
      height: 512,
      bitDepth: 8,
      colorType: 6,
    });
    expect(pngMetadata(
      'apps/mobile/store-assets/android/feature-graphic-1024x500.png',
    )).toEqual({
      width: 1024,
      height: 500,
      bitDepth: 8,
      colorType: 2,
    });
    expect(featureRenderer).toContain('let rgbBitmap = NSBitmapImageRep(');
    expect(featureRenderer).toContain('samplesPerPixel: 3');
    expect(featureRenderer).toContain('hasAlpha: false');
    expect(featureRenderer).toContain('rgbBitmap.representation(using: .png');
  });

  (process.platform === 'darwin' ? it : it.skip)(
    'renders the Play feature graphic reproducibly as RGB without alpha',
    () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-feature-render-'));
    const renderedPng = path.join(directory, 'rendered.png');
    const renderedBmp = path.join(directory, 'rendered.bmp');
    const checkedBmp = path.join(directory, 'checked.bmp');
    try {
      const renderer = path.join(
        mobileRoot,
        'store-assets/android/render-feature-graphic.swift',
      );
      const swift = spawnSync('/usr/bin/swift', [renderer, renderedPng], {
        encoding: 'utf8',
        env: {
          ...process.env,
          CLANG_MODULE_CACHE_PATH: path.join(directory, 'module-cache'),
          SWIFT_MODULECACHE_PATH: path.join(directory, 'module-cache'),
        },
      });
      expect(swift.status).toBe(0);
      expect(pngMetadataAt(renderedPng)).toEqual({
        width: 1024,
        height: 500,
        bitDepth: 8,
        colorType: 2,
      });
      for (const [input, output] of [
        [renderedPng, renderedBmp],
        [path.join(mobileRoot, 'store-assets/android/feature-graphic-1024x500.png'), checkedBmp],
      ]) {
        expect(spawnSync('/usr/bin/sips', [
          '-s', 'format', 'bmp', input, '--out', output,
        ], { encoding: 'utf8' }).status).toBe(0);
      }
      const bitmapDigest = filePath => crypto.createHash('sha256')
        .update(fs.readFileSync(filePath))
        .digest('hex');
      expect(bitmapDigest(renderedBmp)).toBe(bitmapDigest(checkedBmp));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    },
  );

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

  it('requires a retained public source release before play-ready', () => {
    const evidence = validOwnerEvidence();
    delete evidence.sourceRelease;

    expect(inspectOwnerEvidence(evidence, expectedCandidate)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Public Android source release'),
      ]),
    );
  });

  it('keeps the blank owner contract on schema v3 with fail-closed source placeholders', () => {
    expect(ownerEvidenceExample.schemaVersion).toBe(3);
    expect(ownerEvidenceExample.sourceRelease).toEqual(expect.objectContaining({
      status: 'pending',
      repositoryUrl: 'https://github.com/Chessticize/chessticize-mobile',
      tagName: 'android-v1.1.0-build-1',
      tagType: 'pending',
      releaseId: 0,
      published: false,
      sourceManifest: expect.objectContaining({
        status: 'pending',
        releaseAssetId: 0,
        assetName: 'android-source-manifest.json',
        workflowRunId: 0,
        workflowArtifactId: 0,
        workflowArtifactEntry: 'artifacts/android-release/android-source-manifest.json',
      }),
      sourceDisclosure: expect.objectContaining({
        releaseNotesReference:
          'https://github.com/Chessticize/chessticize-mobile/releases/tag/' +
          'android-v1.1.0-build-1',
      }),
    }));
  });

  it('binds the retained source manifest provenance to the exact candidate', () => {
    const evidence = validOwnerEvidence();
    evidence.sourceRelease.sourceManifest.candidate.applicationId = 'com.example.other';

    expect(inspectOwnerEvidence(evidence, expectedCandidate)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Source manifest candidate application ID'),
      ]),
    );
  });

  it('verifies the source tag and retained manifest against the public GitHub release', () => {
    const sourceRelease = validOwnerEvidence().sourceRelease;

    expect(inspectPublishedSourceRelease(sourceRelease, expectedCandidate, {
      repoRoot,
      run: sourceReleaseRun(),
    })).toEqual([]);
  });

  it('rejects a retained source manifest whose downloaded audit names another commit', () => {
    const sourceRelease = validOwnerEvidence().sourceRelease;

    expect(inspectPublishedSourceRelease(sourceRelease, expectedCandidate, {
      repoRoot,
      run: sourceReleaseRun({
        'curl manifest': {
          status: 0,
          stdout: retainedSourceManifestBytes({ commitSha: 'c'.repeat(40) }),
          stderr: '',
        },
      }),
    })).toEqual(expect.arrayContaining([
      expect.stringContaining('Downloaded source manifest commit SHA'),
    ]));
  });

  it('requires the retained source manifest to use its canonical release asset name', () => {
    const evidence = validOwnerEvidence();
    evidence.sourceRelease.sourceManifest.assetName = 'other-source.json';
    evidence.sourceRelease.sourceManifest.reference =
      'https://github.com/Chessticize/chessticize-mobile/releases/download/' +
      'android-v1.1.0-build-1/other-source.json';

    expect(inspectOwnerEvidence(evidence, expectedCandidate)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Source manifest asset name'),
      ]),
    );
  });

  it('derives one canonical Android source tag from normalized semantic versions', () => {
    expect(canonicalAndroidSourceTag('1.1', 1)).toBe('android-v1.1.0-build-1');
    expect(canonicalAndroidSourceTag('1.1.0', 1)).toBe('android-v1.1.0-build-1');
    expect(canonicalAndroidSourceTag('12.34.56', 789)).toBe(
      'android-v12.34.56-build-789',
    );
    for (const [versionName, versionCode] of [
      ['1', 1],
      ['01.1', 1],
      ['1.01', 1],
      ['1.1.00', 1],
      ['1.1.0-alpha', 1],
      ['1.1.0.0', 1],
      ['1.1', 0],
      ['1.1', 1.5],
    ]) {
      expect(() => canonicalAndroidSourceTag(versionName, versionCode)).toThrow();
    }
  });

  it.each([
    ['schema v2', evidence => { evidence.schemaVersion = 2; }, 'schemaVersion'],
    ['missing release', evidence => { delete evidence.sourceRelease; },
      'Public Android source release status'],
    ['pending release', evidence => { evidence.sourceRelease.status = 'pending'; },
      'Public Android source release status'],
    ['missing evidence ID', evidence => { evidence.sourceRelease.evidenceId = ''; },
      'Public Android source release must include an evidence ID'],
    ['malformed evidence URL', evidence => { evidence.sourceRelease.reference = 'not-https'; },
      'Public Android source release must include an auditable HTTPS reference'],
    ['commit binding', evidence => {
      evidence.sourceRelease.candidate.commitSha = 'c'.repeat(40);
    }, 'Public Android source release candidate commit SHA'],
    ['AAB binding', evidence => {
      evidence.sourceRelease.candidate.aabSha256 = 'c'.repeat(64);
    }, 'Public Android source release candidate AAB SHA-256'],
    ['package binding', evidence => {
      evidence.sourceRelease.candidate.applicationId = 'com.example.other';
    }, 'Public Android source release candidate application ID'],
    ['version binding', evidence => {
      evidence.sourceRelease.candidate.versionName = '1.2';
    }, 'Public Android source release candidate version name'],
    ['version-code binding', evidence => {
      evidence.sourceRelease.candidate.versionCode = 2;
    }, 'Public Android source release candidate version code'],
    ['repository', evidence => {
      evidence.sourceRelease.repositoryUrl = 'https://github.com/example/other';
    }, 'Public Android source repository URL'],
    ['canonical release URL', evidence => {
      evidence.sourceRelease.reference += '?unpublished=1';
    }, 'Public Android source release URL'],
    ['normalized tag', evidence => {
      evidence.sourceRelease.tagName = 'android-v1.1-build-1';
    }, 'Public Android source tag'],
    ['tag commit', evidence => {
      evidence.sourceRelease.tagCommitSha = 'c'.repeat(40);
    }, 'Public Android source tag commit SHA'],
    ['lightweight tag', evidence => { evidence.sourceRelease.tagType = 'lightweight'; },
      'must be annotated or signed'],
    ['unpublished release', evidence => { evidence.sourceRelease.published = false; },
      'must be published'],
    ['missing release ID', evidence => { evidence.sourceRelease.releaseId = 0; },
      'must record its GitHub release ID'],
  ])('rejects source-release evidence with %s', (_label, mutate, expectedMessage) => {
    const evidence = validOwnerEvidence();
    mutate(evidence);

    expect(inspectOwnerEvidence(evidence, expectedCandidate)).toEqual(
      expect.arrayContaining([expect.stringContaining(expectedMessage)]),
    );
  });

  it.each([
    ['missing manifest', evidence => { delete evidence.sourceRelease.sourceManifest; },
      'Source manifest status'],
    ['pending status', evidence => {
      evidence.sourceRelease.sourceManifest.status = 'pending';
    }, 'Source manifest status'],
    ['missing artifact ID', evidence => {
      evidence.sourceRelease.sourceManifest.releaseAssetId = 0;
    }, 'retained GitHub release artifact ID'],
    ['unsafe name', evidence => {
      evidence.sourceRelease.sourceManifest.assetName = '../manifest.json';
    }, 'Source manifest asset name'],
    ['malformed digest', evidence => {
      evidence.sourceRelease.sourceManifest.sha256 = 'not-a-digest';
    }, 'SHA-256 digest'],
    ['noncanonical URL', evidence => {
      evidence.sourceRelease.sourceManifest.reference += '?download=1';
    }, 'Retained source manifest URL'],
    ['release provenance', evidence => {
      evidence.sourceRelease.sourceManifest.releaseId = 999;
    }, 'Source manifest GitHub release ID'],
    ['tag provenance', evidence => {
      evidence.sourceRelease.sourceManifest.tagName = 'android-v1.1.0-build-2';
    }, 'Source manifest tag'],
    ['commit provenance', evidence => {
      evidence.sourceRelease.sourceManifest.commitSha = 'c'.repeat(40);
    }, 'Source manifest commit SHA'],
    ['missing candidate provenance', evidence => {
      delete evidence.sourceRelease.sourceManifest.candidate;
    }, 'must include an exact candidate binding'],
    ['candidate commit provenance', evidence => {
      evidence.sourceRelease.sourceManifest.candidate.commitSha = 'c'.repeat(40);
    }, 'Source manifest candidate commit SHA'],
    ['candidate AAB provenance', evidence => {
      evidence.sourceRelease.sourceManifest.candidate.aabSha256 = 'c'.repeat(64);
    }, 'Source manifest candidate AAB SHA-256'],
    ['candidate package provenance', evidence => {
      evidence.sourceRelease.sourceManifest.candidate.applicationId = 'com.example.other';
    }, 'Source manifest candidate application ID'],
    ['candidate version provenance', evidence => {
      evidence.sourceRelease.sourceManifest.candidate.versionName = '1.2';
    }, 'Source manifest candidate version name'],
    ['candidate version-code provenance', evidence => {
      evidence.sourceRelease.sourceManifest.candidate.versionCode = 2;
    }, 'Source manifest candidate version code'],
  ])('rejects retained source-manifest evidence with %s',
    (_label, mutate, expectedMessage) => {
      const evidence = validOwnerEvidence();
      mutate(evidence);

      expect(inspectOwnerEvidence(evidence, expectedCandidate)).toEqual(
        expect.arrayContaining([expect.stringContaining(expectedMessage)]),
      );
    });

  it.each([
    ['workflow run ID', evidence => {
      evidence.sourceRelease.sourceManifest.workflowRunId = 0;
    }, 'protected workflow run ID'],
    ['workflow run reference', evidence => {
      evidence.sourceRelease.sourceManifest.workflowRunReference += '?wrong=1';
    }, 'protected workflow run reference'],
    ['workflow artifact ID', evidence => {
      evidence.sourceRelease.sourceManifest.workflowArtifactId = 0;
    }, 'protected workflow artifact ID'],
    ['workflow artifact name', evidence => {
      evidence.sourceRelease.sourceManifest.workflowArtifactName = 'other-artifact';
    }, 'protected workflow artifact name'],
    ['workflow artifact entry', evidence => {
      evidence.sourceRelease.sourceManifest.workflowArtifactEntry = '../manifest.json';
    }, 'protected workflow artifact entry'],
    ['workflow artifact digest', evidence => {
      evidence.sourceRelease.sourceManifest.workflowArtifactSha256 = 'not-a-digest';
    }, 'protected workflow artifact SHA-256'],
    ['protected run binding', evidence => {
      evidence.sourceRelease.sourceManifest.workflowRunId = 999;
      evidence.sourceRelease.sourceManifest.workflowRunReference =
        'https://github.com/Chessticize/chessticize-mobile/actions/runs/999';
    }, 'Source manifest protected workflow run ID'],
    ['protected run URL binding', evidence => {
      evidence.signing.protectedUploadSigning.reference += '?wrong=1';
    }, 'Source manifest protected workflow reference'],
    ['protected artifact binding', evidence => {
      evidence.sourceRelease.sourceManifest.workflowArtifactId = 999;
    }, 'Source manifest protected workflow artifact ID'],
  ])('rejects source-manifest workflow provenance with mismatched %s',
    (_label, mutate, expectedMessage) => {
      const evidence = validOwnerEvidence();
      mutate(evidence);

      expect(inspectOwnerEvidence(evidence, expectedCandidate)).toEqual(
        expect.arrayContaining([expect.stringContaining(expectedMessage)]),
      );
    });

  it.each([
    ['release notes reference', evidence => {
      evidence.sourceRelease.sourceDisclosure.releaseNotesReference += '?wrong=1';
    }, 'Source release notes reference'],
    ['missing support record', evidence => {
      delete evidence.sourceRelease.sourceDisclosure.supportDocumentation;
    }, 'support documentation status'],
    ['support URL', evidence => {
      evidence.sourceRelease.sourceDisclosure.supportDocumentation.reference += '?wrong=1';
    }, 'support documentation URL'],
    ['support digest', evidence => {
      evidence.sourceRelease.sourceDisclosure.supportDocumentation.sha256 = 'not-a-digest';
    }, 'support documentation must record its SHA-256'],
    ['support candidate binding', evidence => {
      evidence.sourceRelease.sourceDisclosure.supportDocumentation.candidate.commitSha =
        'c'.repeat(40);
    }, 'support documentation candidate commit SHA'],
  ])('rejects source-disclosure evidence with mismatched %s',
    (_label, mutate, expectedMessage) => {
      const evidence = validOwnerEvidence();
      mutate(evidence);

      expect(inspectOwnerEvidence(evidence, expectedCandidate)).toEqual(
        expect.arrayContaining([expect.stringContaining(expectedMessage)]),
      );
    });

  it.each([
    ['release ID', release => { release.id = 999; }, 'Published GitHub release ID'],
    ['release URL', release => {
      release.html_url = 'https://github.com/Chessticize/chessticize-mobile/releases/tag/other';
    }, 'Published GitHub release URL'],
    ['release tag', release => { release.tag_name = 'android-v1.1.0-build-2'; },
      'Published GitHub release tag'],
    ['draft state', release => { release.draft = true; },
      'not a published non-draft GitHub release'],
    ['published timestamp', release => { release.published_at = null; },
      'not a published non-draft GitHub release'],
    ['missing retained asset', release => { release.assets = []; },
      'not present in the published GitHub release'],
    ['asset name', release => { release.assets[0].name = 'other.json'; },
      'Published source manifest asset name'],
    ['asset URL', release => {
      release.assets[0].browser_download_url += '?other=1';
    }, 'Published source manifest asset URL'],
    ['asset upload state', release => { release.assets[0].state = 'new'; },
      'Published source manifest asset state'],
    ['asset digest', release => { release.assets[0].digest = `sha256:${'55'.repeat(32)}`; },
      'Published source manifest asset digest'],
  ])('rejects GitHub source-release API evidence with mismatched %s',
    (_label, mutate, expectedMessage) => {
      const release = publishedSourceRelease();
      mutate(release);
      const sourceRelease = validOwnerEvidence().sourceRelease;

      expect(inspectPublishedSourceRelease(sourceRelease, expectedCandidate, {
        repoRoot,
        run: sourceReleaseRun({
          'curl release': { status: 0, stdout: JSON.stringify(release), stderr: '' },
        }),
      })).toEqual(expect.arrayContaining([expect.stringContaining(expectedMessage)]));
    });

  it.each([
    ['missing local tag', {
      'git cat-file -t android-v1.1.0-build-1': { status: 1, stdout: '', stderr: 'missing' },
    }, 'could not be inspected locally'],
    ['lightweight local tag', {
      'git cat-file -t android-v1.1.0-build-1': { status: 0, stdout: 'commit\n', stderr: '' },
    }, 'Git object type'],
    ['wrong local tag commit', {
      'git rev-list -n 1 android-v1.1.0-build-1': {
        status: 0,
        stdout: `${'c'.repeat(40)}\n`,
        stderr: '',
      },
    }, 'resolved commit SHA'],
  ])('rejects %s during independent source-tag verification',
    (_label, overrides, expectedMessage) => {
      const sourceRelease = validOwnerEvidence().sourceRelease;

      expect(inspectPublishedSourceRelease(sourceRelease, expectedCandidate, {
        repoRoot,
        run: sourceReleaseRun(overrides),
      })).toEqual(expect.arrayContaining([expect.stringContaining(expectedMessage)]));
    });

  it('rejects a public lightweight tag even when a local annotated tag has the same name', () => {
    const sourceRelease = validOwnerEvidence().sourceRelease;

    expect(inspectPublishedSourceRelease(sourceRelease, expectedCandidate, {
      repoRoot,
      run: sourceReleaseRun({
        'curl tag ref': {
          status: 0,
          stdout: JSON.stringify(publishedTagRef({
            object: { type: 'commit', sha: expectedCandidate.commitSha },
          })),
          stderr: '',
        },
      }),
    })).toEqual(expect.arrayContaining([
      expect.stringContaining('published GitHub tag ref must target an annotated tag object'),
    ]));
  });

  it('accepts a signed tag only when the local annotated tag carries a signature', () => {
    const sourceRelease = validOwnerEvidence().sourceRelease;
    sourceRelease.tagType = 'signed';
    expect(inspectPublishedSourceRelease(sourceRelease, expectedCandidate, {
      repoRoot,
      run: sourceReleaseRun({
        'git cat-file tag android-v1.1.0-build-1': {
          status: 0,
          stdout: 'tag android-v1.1.0-build-1\n-----BEGIN PGP SIGNATURE-----\nsig\n',
          stderr: '',
        },
      }),
    })).toEqual([]);

    expect(inspectPublishedSourceRelease(sourceRelease, expectedCandidate, {
      repoRoot,
      run: sourceReleaseRun(),
    })).toEqual(expect.arrayContaining([
      expect.stringContaining('recorded as signed but has no tag signature'),
    ]));
  });

  it('fails closed when GitHub source-release verification is unavailable or malformed', () => {
    const sourceRelease = validOwnerEvidence().sourceRelease;
    expect(inspectPublishedSourceRelease(sourceRelease, expectedCandidate, {
      repoRoot,
      run: sourceReleaseRun({
        'curl release': { status: 22, stdout: '', stderr: 'not found' },
      }),
    })).toEqual(expect.arrayContaining([
      expect.stringContaining('could not be verified through the GitHub API'),
    ]));
    expect(inspectPublishedSourceRelease(sourceRelease, expectedCandidate, {
      repoRoot,
      run: sourceReleaseRun({
        'curl release': { status: 0, stdout: '{not-json', stderr: '' },
      }),
    })).toEqual(expect.arrayContaining([
      expect.stringContaining('GitHub API response is malformed'),
    ]));
  });

  it.each([
    ['unavailable tag ref', {
      'curl tag ref': { status: 22, stdout: '', stderr: 'not found' },
    }, 'Published GitHub tag ref could not be verified'],
    ['malformed tag ref', {
      'curl tag ref': { status: 0, stdout: '{not-json', stderr: '' },
    }, 'Published GitHub tag ref GitHub API response is malformed'],
    ['wrong tag ref name', {
      'curl tag ref': {
        status: 0,
        stdout: JSON.stringify(publishedTagRef({ ref: 'refs/tags/other' })),
        stderr: '',
      },
    }, 'Published GitHub tag ref name'],
    ['invalid tag object SHA', {
      'curl tag ref': {
        status: 0,
        stdout: JSON.stringify(publishedTagRef({ object: { type: 'tag', sha: 'bad' } })),
        stderr: '',
      },
    }, 'no valid annotated tag object SHA'],
    ['unavailable tag object', {
      'curl tag object': { status: 22, stdout: '', stderr: 'not found' },
    }, 'annotated tag object could not be verified'],
    ['malformed tag object', {
      'curl tag object': { status: 0, stdout: '{not-json', stderr: '' },
    }, 'annotated tag object GitHub API response is malformed'],
    ['wrong annotated tag name', {
      'curl tag object': {
        status: 0,
        stdout: JSON.stringify(publishedTagObject({ tag: 'other' })),
        stderr: '',
      },
    }, 'annotated tag name'],
    ['non-commit annotated target', {
      'curl tag object': {
        status: 0,
        stdout: JSON.stringify(publishedTagObject({
          object: { type: 'tree', sha: expectedCandidate.commitSha },
        })),
        stderr: '',
      },
    }, 'annotated tag target type'],
    ['wrong public tag commit', {
      'curl tag object': {
        status: 0,
        stdout: JSON.stringify(publishedTagObject({
          object: { type: 'commit', sha: 'c'.repeat(40) },
        })),
        stderr: '',
      },
    }, 'annotated tag commit SHA'],
  ])('fails closed for %s', (_label, overrides, expectedMessage) => {
    const sourceRelease = validOwnerEvidence().sourceRelease;

    expect(inspectPublishedSourceRelease(sourceRelease, expectedCandidate, {
      repoRoot,
      run: sourceReleaseRun(overrides),
    })).toEqual(expect.arrayContaining([expect.stringContaining(expectedMessage)]));
  });

  it('requires a tag recorded as signed to be verified both locally and by GitHub', () => {
    const sourceRelease = validOwnerEvidence().sourceRelease;
    sourceRelease.tagType = 'signed';

    expect(inspectPublishedSourceRelease(sourceRelease, expectedCandidate, {
      repoRoot,
      run: sourceReleaseRun({
        'git cat-file tag android-v1.1.0-build-1': {
          status: 0,
          stdout: 'tag android-v1.1.0-build-1\n-----BEGIN PGP SIGNATURE-----\nsig\n',
          stderr: '',
        },
        'curl tag object': {
          status: 0,
          stdout: JSON.stringify(publishedTagObject({
            verification: { verified: false },
          })),
          stderr: '',
        },
      }),
    })).toEqual(expect.arrayContaining([
      expect.stringContaining('not verified by GitHub'),
    ]));
  });

  it.each([
    ['download failure', null, {
      'curl manifest': { status: 22, stdout: '', stderr: 'not found' },
    }, 'could not be downloaded from the GitHub release'],
    ['malformed JSON', null, {
      'curl manifest': { status: 0, stdout: '{not-json', stderr: '' },
    }, 'malformed JSON'],
    ['digest mismatch', null, {
      'curl manifest': {
        status: 0,
        stdout: Buffer.concat([retainedSourceManifestBytes(), Buffer.from(' ')]),
        stderr: '',
      },
    }, 'Downloaded source manifest SHA-256'],
    ['schema', { schemaVersion: 2 }, null, 'Downloaded source manifest schemaVersion'],
    ['status', { status: 'play-ready' }, null, 'Downloaded source manifest verifier status'],
    ['commit', { commitSha: 'c'.repeat(40) }, null, 'Downloaded source manifest commit SHA'],
    ['worktree', { worktreeClean: false }, null,
      'Downloaded source manifest clean-worktree result'],
    ['bundle digest', { bundle: {
      ...retainedSourceManifest().bundle,
      sha256: 'c'.repeat(64),
    } }, null, 'Downloaded source manifest AAB SHA-256'],
    ['application ID', { bundle: {
      ...retainedSourceManifest().bundle,
      applicationId: 'com.example.other',
    } }, null, 'Downloaded source manifest application ID'],
    ['version', { bundle: {
      ...retainedSourceManifest().bundle,
      versionName: '9.9',
    } }, null, 'Downloaded source manifest version name'],
    ['version code', { bundle: {
      ...retainedSourceManifest().bundle,
      versionCode: 999,
    } }, null, 'Downloaded source manifest version code'],
  ])('rejects a retained source manifest with mismatched %s',
    (_label, manifestOverrides, commandOverrides, expectedMessage) => {
      const sourceRelease = validOwnerEvidence().sourceRelease;
      const overrides = commandOverrides ?? {
        'curl manifest': {
          status: 0,
          stdout: retainedSourceManifestBytes(manifestOverrides),
          stderr: '',
        },
      };

      expect(inspectPublishedSourceRelease(sourceRelease, expectedCandidate, {
        repoRoot,
        run: sourceReleaseRun(overrides),
      })).toEqual(expect.arrayContaining([expect.stringContaining(expectedMessage)]));
    });

  it.each([
    ['unavailable run', null, { status: 22, stdout: '', stderr: 'not found' },
      'workflow run could not be verified'],
    ['malformed run', null, { status: 0, stdout: '{not-json', stderr: '' },
      'workflow run GitHub API response is malformed'],
    ['run ID', { id: 999 }, null, 'Protected workflow run ID'],
    ['workflow name', { name: 'Other' }, null, 'Protected workflow name'],
    ['workflow path', { path: '.github/workflows/other.yml' }, null,
      'Protected workflow path'],
    ['event', { event: 'push' }, null, 'Protected workflow event'],
    ['status', { status: 'in_progress' }, null, 'Protected workflow status'],
    ['conclusion', { conclusion: 'failure' }, null, 'Protected workflow conclusion'],
    ['head SHA', { head_sha: 'c'.repeat(40) }, null, 'Protected workflow head SHA'],
    ['run URL', { html_url: 'https://github.com/example/other/actions/runs/123' }, null,
      'Protected workflow run URL'],
  ])('rejects protected workflow provenance with mismatched %s',
    (_label, runOverrides, responseOverride, expectedMessage) => {
      const response = responseOverride ?? {
        status: 0,
        stdout: JSON.stringify(publishedWorkflowRun(runOverrides)),
        stderr: '',
      };

      expect(inspectPublishedSourceRelease(
        validOwnerEvidence().sourceRelease,
        expectedCandidate,
        { repoRoot, run: sourceReleaseRun({ 'curl workflow run': response }) },
      )).toEqual(expect.arrayContaining([expect.stringContaining(expectedMessage)]));
    });

  it.each([
    ['unavailable artifact', null, { status: 22, stdout: '', stderr: 'not found' },
      'workflow artifact could not be verified'],
    ['malformed artifact', null, { status: 0, stdout: '{not-json', stderr: '' },
      'workflow artifact GitHub API response is malformed'],
    ['artifact ID', { id: 999 }, null, 'Protected workflow artifact ID'],
    ['artifact name', { name: 'other' }, null, 'Protected workflow artifact name'],
    ['expired artifact', { expired: true }, null, 'artifact expired state'],
    ['artifact digest', { digest: `sha256:${'c'.repeat(64)}` }, null,
      'Protected workflow artifact digest'],
    ['archive URL', { archive_download_url: 'https://api.github.com/other' }, null,
      'Protected workflow artifact archive URL'],
    ['workflow run ID', { workflow_run: {
      id: 999,
      head_sha: expectedCandidate.commitSha,
    } }, null, 'Protected workflow artifact run ID'],
    ['workflow head SHA', { workflow_run: {
      id: 123,
      head_sha: 'c'.repeat(40),
    } }, null, 'Protected workflow artifact head SHA'],
  ])('rejects protected workflow artifact provenance with mismatched %s',
    (_label, artifactOverrides, responseOverride, expectedMessage) => {
      const response = responseOverride ?? {
        status: 0,
        stdout: JSON.stringify(publishedWorkflowArtifact(artifactOverrides)),
        stderr: '',
      };

      expect(inspectPublishedSourceRelease(
        validOwnerEvidence().sourceRelease,
        expectedCandidate,
        { repoRoot, run: sourceReleaseRun({ 'curl workflow artifact': response }) },
      )).toEqual(expect.arrayContaining([expect.stringContaining(expectedMessage)]));
    });

  it('requires authenticated access to the retained protected workflow artifact', () => {
    expect(inspectPublishedSourceRelease(
      validOwnerEvidence().sourceRelease,
      expectedCandidate,
      { repoRoot, environment: {}, run: sourceReleaseRun() },
    )).toEqual(expect.arrayContaining([
      expect.stringContaining('GITHUB_TOKEN is required'),
    ]));
  });

  it('keeps the GitHub token out of spawned command arguments', () => {
    const calls = [];
    const fakeRun = sourceReleaseRun();
    const token = 'test_secret_token';
    const run = (command, args, options) => {
      calls.push({ command, args, options });
      return fakeRun(command, args, options);
    };

    expect(inspectPublishedSourceRelease(
      validOwnerEvidence().sourceRelease,
      expectedCandidate,
      { repoRoot, environment: { GITHUB_TOKEN: token }, run },
    )).toEqual([]);
    expect(calls.flatMap(call => call.args).join(' ')).not.toContain(token);
    expect(calls.some(call => String(call.options?.input ?? '').includes(token))).toBe(true);
    const authenticatedArchiveCall = calls.find(call =>
      call.args.at(-1).endsWith('/actions/artifacts/789/zip'));
    const signedArchiveCall = calls.find(call =>
      call.args.at(-1).startsWith('https://artifact.example.test/'));
    expect(authenticatedArchiveCall.args).not.toContain('--location');
    expect(authenticatedArchiveCall.options.input).toContain(token);
    expect(signedArchiveCall.args).toContain('--location');
    expect(signedArchiveCall.options?.input).toBeUndefined();
    const outputIndex = signedArchiveCall.args.indexOf('--output');
    expect(outputIndex).toBeGreaterThan(0);
    const archivePath = signedArchiveCall.args[outputIndex + 1];
    expect(signedArchiveCall.options?.maxBuffer).toBeUndefined();
    expect(fs.existsSync(archivePath)).toBe(false);
    expect(fs.existsSync(path.dirname(archivePath))).toBe(false);
  });

  it('streams a protected artifact larger than 256 MiB without buffering it', () => {
    const archiveSize = 256 * 1024 * 1024 + 1;
    const archiveDigest = repeatedByteDigest(0, archiveSize);
    const sourceRelease = validOwnerEvidence().sourceRelease;
    sourceRelease.sourceManifest.workflowArtifactSha256 = archiveDigest;
    let outputPath;
    const fakeRun = sourceReleaseRun({
      'curl workflow artifact': {
        status: 0,
        stdout: JSON.stringify(publishedWorkflowArtifact({
          digest: `sha256:${archiveDigest}`,
        })),
        stderr: '',
      },
      'curl workflow archive': {
        status: 0,
        stdout: '',
        stderr: '',
        writeOutput(filePath) {
          outputPath = filePath;
          fs.writeFileSync(filePath, '');
          fs.truncateSync(filePath, archiveSize);
        },
      },
    });

    expect(inspectPublishedSourceRelease(sourceRelease, expectedCandidate, {
      repoRoot,
      run: fakeRun,
    })).toEqual([]);
    expect(outputPath).toBeDefined();
    expect(fs.existsSync(outputPath)).toBe(false);
    expect(fs.existsSync(path.dirname(outputPath))).toBe(false);
  });

  it('cleans the streamed archive path when the download fails', () => {
    const calls = [];
    const fakeRun = sourceReleaseRun({
      'curl workflow archive': { status: 22, stdout: '', stderr: 'not found' },
    });
    const run = (command, args, options) => {
      calls.push({ command, args, options });
      return fakeRun(command, args, options);
    };

    expect(inspectPublishedSourceRelease(
      validOwnerEvidence().sourceRelease,
      expectedCandidate,
      { repoRoot, run },
    )).toEqual(expect.arrayContaining([
      expect.stringContaining('workflow artifact could not be downloaded'),
    ]));
    const download = calls.find(call =>
      call.args.at(-1).startsWith('https://artifact.example.test/'));
    const archivePath = download.args[download.args.indexOf('--output') + 1];
    expect(fs.existsSync(archivePath)).toBe(false);
    expect(fs.existsSync(path.dirname(archivePath))).toBe(false);
  });

  it.each([
    ['archive redirect request', {
      'curl workflow archive redirect': { status: 22, stdout: '', stderr: 'not found' },
    }, 'workflow artifact redirect could not be requested'],
    ['missing archive redirect', {
      'curl workflow archive redirect': { status: 0, stdout: 'HTTP/2 302 Found\r\n\r\n', stderr: '' },
    }, 'valid HTTPS download redirect'],
    ['insecure archive redirect', {
      'curl workflow archive redirect': {
        status: 0,
        stdout: 'HTTP/2 302 Found\r\nlocation: http://artifact.example.test/file.zip\r\n\r\n',
        stderr: '',
      },
    }, 'valid HTTPS download redirect'],
    ['archive download', {
      'curl workflow archive': { status: 22, stdout: '', stderr: 'not found' },
    }, 'workflow artifact could not be downloaded'],
    ['archive digest', {
      'curl workflow archive': { status: 0, stdout: Buffer.from('other-archive'), stderr: '' },
    }, 'Downloaded protected workflow artifact SHA-256'],
    ['missing archive entry', {
      'unzip manifest': { status: 11, stdout: '', stderr: 'missing entry' },
    }, 'does not contain the recorded source manifest entry'],
    ['manifest byte identity', {
      'unzip manifest': {
        status: 0,
        stdout: retainedSourceManifestBytes({ commitSha: 'c'.repeat(40) }),
        stderr: '',
      },
    }, 'do not match the protected workflow artifact manifest'],
  ])('fails closed for protected artifact %s', (_label, overrides, expectedMessage) => {
    expect(inspectPublishedSourceRelease(
      validOwnerEvidence().sourceRelease,
      expectedCandidate,
      { repoRoot, run: sourceReleaseRun(overrides) },
    )).toEqual(expect.arrayContaining([expect.stringContaining(expectedMessage)]));
  });

  it.each([
    ['release notes disclosure', {
      'curl release': {
        status: 0,
        stdout: JSON.stringify(publishedSourceRelease({ body: 'No source disclosure.' })),
        stderr: '',
      },
    }, 'release notes must disclose'],
    ['support download', {
      'curl support documentation': { status: 22, stdout: '', stderr: 'not found' },
    }, 'support documentation could not be downloaded'],
    ['support digest', {
      'curl support documentation': { status: 0, stdout: Buffer.from('other'), stderr: '' },
    }, 'Downloaded source support documentation SHA-256'],
    ['support content disclosure', {
      'curl support documentation': {
        status: 0,
        stdout: sourceSupportDocumentationBytes({ tag: 'other', repository: 'other' }),
        stderr: '',
      },
    }, 'support documentation must disclose'],
  ])('fails closed for mismatched %s', (_label, overrides, expectedMessage) => {
    expect(inspectPublishedSourceRelease(
      validOwnerEvidence().sourceRelease,
      expectedCandidate,
      { repoRoot, run: sourceReleaseRun(overrides) },
    )).toEqual(expect.arrayContaining([expect.stringContaining(expectedMessage)]));
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

  it('accepts exactly one approved signer from real keytool output', () => {
    const fixture = signedAabFixture();
    try {
      expect(requireApprovedSingleSigner(
        fixture.signerOutput,
        fixture.approvedFingerprint,
      )).toBe(fixture.approvedFingerprint);
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
    const verifier = read('apps/mobile/scripts/android-play-release.js');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('push:');
    expect(workflow).toContain('environment: android-production');
    expect(workflow).toContain('ANDROID_RELEASE_KEYSTORE_BASE64');
    expect(workflow).toContain('ANDROID_UPLOAD_CERT_SHA256');
    expect(workflow).toContain('--artifact-only');
    expect(workflow).toContain(
      '--output apps/mobile/artifacts/android-release/android-source-manifest.json',
    );
    expect(workflow).toContain(
      'apps/mobile/artifacts/android-release/android-source-manifest.json',
    );
    expect(workflow).toContain('retention-days: 30');
    expect(runbook).toContain('cannot produce a `play-ready` verdict');
    expect(runbook).toContain('owner evidence schema v3');
    expect(runbook).toContain('live GitHub tag ref');
    expect(runbook).toContain('protected Actions artifact');
    expect(runbook).toContain('android-source-manifest.json');
    expect(runbook).toContain('CHESSTICIZE_GITHUB_TOKEN');
    expect(runbook).toContain('android-v1.1.0-build-1');
    expect(runbook).toContain('https://github.com/Chessticize/chessticize-mobile');
    expect(runbook).toContain('do not start the rollout in #186');
    expect(verifier).toContain('{ repoRoot, run, environment },');
    expect(listing).toContain('Data collected: No');
    expect(listing).toContain('production manifest intentionally has no `INTERNET` permission');
  });

  it('installs the Android emulator runtime libraries before running the release doctor', () => {
    const workflow = read(
      '.github/workflows/mobile-android-release-candidate.yml',
    );
    const runtimeInstall = 'sudo apt-get install --yes libpulse0';
    const doctor = 'run: pnpm mobile:doctor:android';

    expect(workflow).toContain(runtimeInstall);
    expect(workflow.indexOf(runtimeInstall)).toBeLessThan(
      workflow.indexOf(doctor),
    );
  });
});
