const { createHash } = require('node:crypto');
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { PNG } = require('pngjs');
const story = require('../../../config/app-store-marketing-story-v1.json');
const {
  captureMarketingScreenshot,
} = require('../e2e/marketingCaptureArtifacts');
const {
  captureGooglePlayPublicUiFrame,
  GOOGLE_PLAY_CAPTURE_TARGETS,
  GOOGLE_PLAY_REQUIRED_CAPTURE_FAMILIES,
  assertGooglePlayScreenshot,
  inspectGooglePlayInstalledSession,
  redactedAndroidDeviceId,
  resolveGooglePlayArtifactIdentity,
  resolveGooglePlayCaptureTarget,
  writeCombinedGooglePlayCaptureManifest,
  writeGooglePlayDeviceCaptureManifest,
} = require('../e2e/googlePlayMarketingCaptureArtifacts');
const {
  recordGooglePlayPublicUiCapture,
} = require('../e2e/record-google-play-public-ui-capture');

function targetEnvironment(deviceFamily, serial = 'emulator-5554') {
  return {
    CHESSTICIZE_MARKETING_DEVICE_FAMILY: deviceFamily,
    CHESSTICIZE_ANDROID_MARKETING_DEVICE_PROFILE: `Unit Test ${deviceFamily}`,
    CHESSTICIZE_ANDROID_MARKETING_API_LEVEL: '36',
    CHESSTICIZE_ANDROID_MARKETING_DENSITY_DPI: '320',
    DETOX_ANDROID_DEVICE: serial,
  };
}

function previewArtifact() {
  return {
    captureMode: 'deterministic-e2e',
    artifactRole: 'detox-e2e-apk',
    fileName: 'app-e2e.apk',
    bytes: 123,
    sha256: 'a'.repeat(64),
  };
}

function createExactArtifactWorkspace() {
  const workspace = mkdtempSync(join(tmpdir(), 'play-artifact-'));
  const artifactPath = join(workspace, 'artifact.apk');
  const sourceManifestPath = join(workspace, 'android-source-manifest.json');
  const mirrorEvidencePath = join(
    workspace,
    'android-apk-mirror-evidence.json'
  );
  const sourceCommit = 'b'.repeat(40);
  writeFileSync(artifactPath, 'apk');
  const sourceManifestBytes = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    status: 'artifact-only',
    commitSha: sourceCommit,
    worktreeClean: true,
    bundle: {
      applicationId: 'com.chessticize.mobile',
      versionName: '1.3.1',
      versionCode: 9,
      sha256: 'c'.repeat(64),
    },
  }));
  writeFileSync(sourceManifestPath, sourceManifestBytes);
  writeFileSync(mirrorEvidencePath, JSON.stringify({
    schemaVersion: 1,
    phase: 'play-apk-mirrored',
    commitSha: sourceCommit,
    applicationId: 'com.chessticize.mobile',
    versionName: '1.3.1',
    versionCode: 9,
    aabSha256: 'c'.repeat(64),
    sourceManifestSha256: createHash('sha256')
      .update(sourceManifestBytes)
      .digest('hex'),
    playDownloadId: 'download-9',
    apk: {
      name: 'artifact.apk',
      bytes: 3,
      sha256: createHash('sha256').update('apk').digest('hex'),
      signerCertificateSha256: 'f'.repeat(64),
    },
  }));
  const environment = {
    ...targetEnvironment('android-phone'),
    ADB_PATH: '/sdk/platform-tools/adb',
    ANDROID_HOME: join(workspace, 'android-sdk'),
    CHESSTICIZE_ANDROID_MARKETING_CAPTURE_MODE:
      'public-ui-exact-artifact',
    CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_ROLE: 'play-delivered-apk',
    CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_PATH: artifactPath,
    CHESSTICIZE_ANDROID_SOURCE_MANIFEST_PATH: sourceManifestPath,
    CHESSTICIZE_ANDROID_APK_MIRROR_EVIDENCE_PATH: mirrorEvidencePath,
  };
  const artifact = resolveGooglePlayArtifactIdentity({
    environment,
    repositoryRoot: workspace,
    sourceCommit,
  });
  return {
    artifact,
    artifactPath,
    environment,
    mirrorEvidencePath,
    sourceCommit,
    sourceManifestPath,
    workspace,
  };
}

function installedApkInspection(overrides = {}) {
  return {
    applicationId: 'com.chessticize.mobile',
    versionName: '1.3.1',
    versionCode: 9,
    signerCertificateSha256: 'f'.repeat(64),
    debuggable: false,
    testOnly: false,
    internetPermission: true,
    ...overrides,
  };
}

function createAdbRunner({
  commands,
  foregroundPackage = 'com.chessticize.mobile',
  installerPackage = 'com.android.vending',
  screenshot,
} = {}) {
  return (command, args) => {
    commands?.push({ command, args });
    const isAdb = command === 'adb' || command.endsWith('/adb');
    if (isAdb && args.includes('pm') && args.includes('path')) {
      return {
        status: 0,
        stdout: 'package:/data/app/chessticize/base.apk\n',
        stderr: '',
      };
    }
    if (isAdb && args.includes('pull')) {
      writeFileSync(args.at(-1), 'installed-base-apk');
      return { status: 0, stdout: '1 file pulled\n', stderr: '' };
    }
    if (
      isAdb
      && args.includes('pm')
      && args.includes('list')
      && args.includes('packages')
      && args.includes('-i')
    ) {
      return {
        status: 0,
        stdout:
          `package:com.chessticize.mobile  installer=${installerPackage}\n`,
        stderr: '',
      };
    }
    if (
      isAdb
      && args.includes('dumpsys')
      && args.includes('package')
    ) {
      return {
        status: 0,
        stdout: [
          `    installerPackageName=${installerPackage}`,
          `    initiatingPackageName=${installerPackage}`,
          '    originatingPackageName=null',
          '    packageSource=2',
        ].join('\n'),
        stderr: '',
      };
    }
    if (
      isAdb
      && args.includes('dumpsys')
      && args.includes('activity')
    ) {
      return {
        status: 0,
        stdout:
          `mResumedActivity: ActivityRecord{1 u0 ${foregroundPackage}/.MainActivity t1}`,
        stderr: '',
      };
    }
    if (isAdb && args.includes('screencap')) {
      return { status: 0, stdout: screenshot, stderr: Buffer.alloc(0) };
    }
    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
  };
}

describe('Google Play marketing capture artifacts', () => {
  it('resolves the approved phone, 7-inch, and 10-inch native targets', () => {
    const phone = resolveGooglePlayCaptureTarget(
      targetEnvironment('android-phone')
    );
    const tablet7 = resolveGooglePlayCaptureTarget(
      targetEnvironment('android-tablet-7', 'physical-device-123456')
    );
    const tablet10 = resolveGooglePlayCaptureTarget(
      targetEnvironment('android-tablet-10')
    );

    expect(phone).toMatchObject({
      deviceFamily: 'android-phone',
      displayGroup: 'phone',
      orientation: 'portrait',
      rawPixelDimensions: { width: 1080, height: 1920 },
      deviceId: 'emulator-5554',
      apiLevel: 36,
      densityDpi: 320,
    });
    expect(tablet7).toMatchObject({
      displayGroup: '7-inch-tablet',
      orientation: 'portrait',
      rawPixelDimensions: { width: 1200, height: 1920 },
      deviceId: 'physical-…123456',
    });
    expect(tablet10).toMatchObject({
      displayGroup: '10-inch-tablet',
      orientation: 'landscape',
      rawPixelDimensions: { width: 2560, height: 1600 },
    });
    expect(redactedAndroidDeviceId('ABC123')).toBe('physical-…ABC123');
    expect(() => resolveGooglePlayCaptureTarget(
      targetEnvironment('ipad')
    )).toThrow('android-phone');
    expect(() => resolveGooglePlayCaptureTarget({
      ...targetEnvironment('android-phone'),
      CHESSTICIZE_ANDROID_MARKETING_API_LEVEL: '23',
    })).toThrow('at least 24');
  });

  it('rejects the wrong raw dimensions and transparent screenshots', () => {
    const target = resolveGooglePlayCaptureTarget(
      targetEnvironment('android-phone')
    );
    const opaque = new PNG({ width: 1080, height: 1920 });
    opaque.data.fill(255);

    expect(() => assertGooglePlayScreenshot(opaque, target)).not.toThrow();
    expect(() => assertGooglePlayScreenshot(
      new PNG({ width: 1080, height: 2161 }),
      target
    )).toThrow('2:1 screenshot limits');
    opaque.data[3] = 0;
    expect(() => assertGooglePlayScreenshot(opaque, target))
      .toThrow('must not contain transparency');
  });

  it('separates preview APK identity from exact Play-delivered identity', () => {
    const {
      artifactPath,
      mirrorEvidencePath,
      sourceCommit,
      sourceManifestPath,
      workspace,
    } = createExactArtifactWorkspace();

    const preview = resolveGooglePlayArtifactIdentity({
      environment: {
        CHESSTICIZE_ANDROID_MARKETING_CAPTURE_MODE: 'deterministic-e2e',
        CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_ROLE: 'detox-e2e-apk',
        CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_PATH: artifactPath,
      },
      repositoryRoot: workspace,
      sourceCommit,
    });
    expect(preview).toMatchObject({
      captureMode: 'deterministic-e2e',
      artifactRole: 'detox-e2e-apk',
      fileName: 'artifact.apk',
      bytes: 3,
    });
    expect(preview).not.toHaveProperty('candidate');

    const exact = resolveGooglePlayArtifactIdentity({
      environment: {
        CHESSTICIZE_ANDROID_MARKETING_CAPTURE_MODE: 'public-ui-exact-artifact',
        CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_ROLE: 'play-delivered-apk',
        CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_PATH: artifactPath,
        CHESSTICIZE_ANDROID_SOURCE_MANIFEST_PATH: sourceManifestPath,
        CHESSTICIZE_ANDROID_APK_MIRROR_EVIDENCE_PATH: mirrorEvidencePath,
      },
      repositoryRoot: workspace,
      sourceCommit,
    });
    expect(exact).toMatchObject({
      captureMode: 'public-ui-exact-artifact',
      artifactRole: 'play-delivered-apk',
      candidate: {
        applicationId: 'com.chessticize.mobile',
        versionName: '1.3.1',
        versionCode: 9,
        aabSha256: 'c'.repeat(64),
        signerCertificateSha256: 'f'.repeat(64),
      },
      sourceManifest: {
        fileName: 'android-source-manifest.json',
      },
      mirrorEvidence: {
        fileName: 'android-apk-mirror-evidence.json',
        playDownloadId: 'download-9',
      },
    });
    expect(exact.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(exact.sourceManifest.sha256).toMatch(/^[0-9a-f]{64}$/);

    expect(() => resolveGooglePlayArtifactIdentity({
      environment: {
        CHESSTICIZE_ANDROID_MARKETING_CAPTURE_MODE: 'deterministic-e2e',
        CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_ROLE: 'detox-e2e-apk',
        CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_PATH: artifactPath,
        CHESSTICIZE_ANDROID_SOURCE_MANIFEST_PATH: sourceManifestPath,
        CHESSTICIZE_ANDROID_APK_MIRROR_EVIDENCE_PATH: mirrorEvidencePath,
      },
      repositoryRoot: workspace,
      sourceCommit,
    })).toThrow('must not claim a production Android source manifest');
    expect(() => resolveGooglePlayArtifactIdentity({
      environment: {
        CHESSTICIZE_ANDROID_MARKETING_CAPTURE_MODE: 'public-ui-exact-artifact',
        CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_ROLE: 'play-delivered-apk',
        CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_PATH: artifactPath,
        CHESSTICIZE_ANDROID_SOURCE_MANIFEST_PATH: sourceManifestPath,
      },
      repositoryRoot: workspace,
      sourceCommit: 'd'.repeat(40),
    })).toThrow('does not bind');
  });

  it('proves the installed Play session from the pulled base APK', () => {
    const fixture = createExactArtifactWorkspace();
    const target = resolveGooglePlayCaptureTarget(fixture.environment);
    const inspectApk = jest.fn(() => installedApkInspection());
    const commands = [];

    const session = inspectGooglePlayInstalledSession({
      artifact: fixture.artifact,
      environment: fixture.environment,
      inspectApk,
      repositoryRoot: fixture.workspace,
      run: createAdbRunner({ commands }),
      target,
    });

    expect(inspectApk).toHaveBeenCalledTimes(2);
    expect(commands).not.toHaveLength(0);
    expect(commands.every(
      command => command.command === fixture.environment.ADB_PATH
    )).toBe(true);
    expect(commands.some(({ args }) =>
      args.join(' ').includes(
        'shell pm list packages -i com.chessticize.mobile'
      )
    )).toBe(true);
    expect(commands.some(({ args }) =>
      args.join(' ').includes(
        'shell dumpsys package com.chessticize.mobile'
      )
    )).toBe(true);
    expect(commands.some(({ args }) =>
      args.includes('get-install-source')
    )).toBe(false);
    expect(session).toMatchObject({
      schemaVersion: 1,
      applicationId: 'com.chessticize.mobile',
      installerPackageName: 'com.android.vending',
      versionName: '1.3.1',
      versionCode: 9,
      signerCertificateSha256: 'f'.repeat(64),
      debuggable: false,
      testOnly: false,
      foregroundPackage: 'com.chessticize.mobile',
      deviceId: target.deviceId,
    });
    expect(session.installedBaseApk.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['installer', { installerPackage: 'adb' }, {}, 'com.android.vending'],
    ['version', {}, { versionCode: 8 }, 'version'],
    ['signer', {}, { signerCertificateSha256: 'e'.repeat(64) }, 'signer'],
    ['debuggable', {}, { debuggable: true }, 'debuggable'],
    ['test-only', {}, { testOnly: true }, 'testOnly'],
    [
      'foreground app',
      { foregroundPackage: 'com.android.settings' },
      {},
      'foreground',
    ],
  ])('rejects installed-session drift in %s', (
    _label,
    runnerOptions,
    inspectionOverrides,
    expectedError
  ) => {
    const fixture = createExactArtifactWorkspace();
    expect(() => inspectGooglePlayInstalledSession({
      artifact: fixture.artifact,
      environment: fixture.environment,
      inspectApk: () => installedApkInspection(inspectionOverrides),
      repositoryRoot: fixture.workspace,
      run: createAdbRunner(runnerOptions),
      target: resolveGooglePlayCaptureTarget(fixture.environment),
    })).toThrow(expectedError);
  });

  it('captures a canonical frame through adb and writes a bound sidecar', () => {
    const fixture = createExactArtifactWorkspace();
    const captureRoot = join(fixture.workspace, 'input');
    const frame = story.frames[0];
    const png = new PNG({ width: 1080, height: 1920 });
    png.data.fill(255);
    const screenshot = PNG.sync.write(png);

    const result = captureGooglePlayPublicUiFrame({
      artifact: fixture.artifact,
      captureRoot,
      environment: fixture.environment,
      frame,
      inspectApk: () => installedApkInspection(),
      repositoryRoot: fixture.workspace,
      run: createAdbRunner({ screenshot }),
      sourceCommit: fixture.sourceCommit,
      story,
      target: resolveGooglePlayCaptureTarget(fixture.environment),
    });

    expect(result.screenshotPath).toBe(join(
      captureRoot,
      `${frame.captureId}.png`
    ));
    expect(result.sidecarPath).toBe(join(
      captureRoot,
      `${frame.captureId}.capture.json`
    ));
    const sidecar = JSON.parse(readFileSync(result.sidecarPath, 'utf8'));
    expect(sidecar).toMatchObject({
      schemaVersion: 1,
      captureId: frame.captureId,
      frameId: frame.id,
      sourceCommit: fixture.sourceCommit,
      artifact: fixture.artifact,
      target: {
        deviceFamily: 'android-phone',
      },
      installedSession: {
        installerPackageName: 'com.android.vending',
        foregroundPackage: 'com.chessticize.mobile',
      },
      screenshot: {
        fileName: `${frame.captureId}.png`,
        bytes: screenshot.length,
        sha256: createHash('sha256').update(screenshot).digest('hex'),
        pixelDimensions: { width: 1080, height: 1920 },
      },
    });
  });

  it('requires six command sidecars and re-verifies the live session', () => {
    const fixture = createExactArtifactWorkspace();
    const captureRoot = join(fixture.workspace, 'input');
    const outputRoot = join(fixture.workspace, 'output');
    const target = resolveGooglePlayCaptureTarget(fixture.environment);
    const png = new PNG({ width: 1080, height: 1920 });
    png.data.fill(255);
    const screenshot = PNG.sync.write(png);
    const inspector = () => installedApkInspection();

    for (const frame of story.frames) {
      captureGooglePlayPublicUiFrame({
        artifact: fixture.artifact,
        captureRoot,
        environment: fixture.environment,
        frame,
        inspectApk: inspector,
        repositoryRoot: fixture.workspace,
        run: createAdbRunner({ screenshot }),
        sourceCommit: fixture.sourceCommit,
        story,
        target,
      });
    }

    const manifestPath = recordGooglePlayPublicUiCapture({
      environment: {
        ...fixture.environment,
        CHESSTICIZE_MARKETING_INPUT_ROOT: captureRoot,
        CHESSTICIZE_MARKETING_OUTPUT_ROOT: outputRoot,
      },
      inspectApk: inspector,
      repositoryRoot: fixture.workspace,
      run: createAdbRunner(),
      sourceCommit: fixture.sourceCommit,
      story,
    });
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.installedSession).toMatchObject({
      installerPackageName: 'com.android.vending',
      versionCode: 9,
    });
    expect(manifest.frames).toHaveLength(6);
    expect(manifest.frames[0].captureProvenance).toMatchObject({
      sidecarFileName: `${story.frames[0].captureId}.capture.json`,
      sidecarSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      installedSessionSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });

    const missingSidecar = join(
      captureRoot,
      `${story.frames[5].captureId}.capture.json`
    );
    rmSync(missingSidecar);
    expect(() => recordGooglePlayPublicUiCapture({
      environment: {
        ...fixture.environment,
        CHESSTICIZE_MARKETING_INPUT_ROOT: captureRoot,
        CHESSTICIZE_MARKETING_OUTPUT_ROOT: outputRoot,
      },
      inspectApk: inspector,
      repositoryRoot: fixture.workspace,
      run: createAdbRunner(),
      sourceCommit: fixture.sourceCommit,
      story,
    })).toThrow('sidecar');
  });

  it('rejects an externally replaced PNG and live installed-session drift', () => {
    const fixture = createExactArtifactWorkspace();
    const captureRoot = join(fixture.workspace, 'input');
    const outputRoot = join(fixture.workspace, 'output');
    const target = resolveGooglePlayCaptureTarget(fixture.environment);
    const png = new PNG({ width: 1080, height: 1920 });
    png.data.fill(255);
    const screenshot = PNG.sync.write(png);
    for (const frame of story.frames) {
      captureGooglePlayPublicUiFrame({
        artifact: fixture.artifact,
        captureRoot,
        environment: fixture.environment,
        frame,
        inspectApk: () => installedApkInspection(),
        repositoryRoot: fixture.workspace,
        run: createAdbRunner({ screenshot }),
        sourceCommit: fixture.sourceCommit,
        story,
        target,
      });
    }
    const firstPath = join(captureRoot, `${story.frames[0].captureId}.png`);
    writeFileSync(firstPath, Buffer.concat([screenshot, Buffer.from('drift')]));
    const input = {
      environment: {
        ...fixture.environment,
        CHESSTICIZE_MARKETING_INPUT_ROOT: captureRoot,
        CHESSTICIZE_MARKETING_OUTPUT_ROOT: outputRoot,
      },
      repositoryRoot: fixture.workspace,
      sourceCommit: fixture.sourceCommit,
      story,
    };
    expect(() => recordGooglePlayPublicUiCapture({
      ...input,
      inspectApk: () => installedApkInspection(),
      run: createAdbRunner(),
    })).toThrow('screenshot');

    writeFileSync(firstPath, screenshot);
    expect(() => recordGooglePlayPublicUiCapture({
      ...input,
      inspectApk: () => installedApkInspection({ versionCode: 10 }),
      run: createAdbRunner(),
    })).toThrow('version');
  });

  it('writes and re-verifies the required phone-only Play manifest', () => {
    const outputRoot = mkdtempSync(join(tmpdir(), 'play-capture-'));
    const sourceCommit = 'e'.repeat(40);
    const artifact = previewArtifact();

    for (const deviceFamily of GOOGLE_PLAY_REQUIRED_CAPTURE_FAMILIES) {
      const target = resolveGooglePlayCaptureTarget(
        targetEnvironment(deviceFamily)
      );
      const sourcePath = join(outputRoot, `${deviceFamily}-source.png`);
      const png = new PNG({
        width: target.rawPixelDimensions.width,
        height: target.rawPixelDimensions.height,
      });
      png.data.fill(255);
      writeFileSync(sourcePath, PNG.sync.write(png));
      const records = story.frames.map((frame) => captureMarketingScreenshot({
        frame,
        outputRoot,
        screenshotPath: sourcePath,
        sourceCommit,
        story,
        target,
      }));
      writeGooglePlayDeviceCaptureManifest({
        artifact,
        outputRoot,
        records,
        sourceCommit,
        story,
        target,
      });
    }

    const manifestPath = writeCombinedGooglePlayCaptureManifest({
      outputRoot,
      story,
    });
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest).toMatchObject({
      platform: 'google-play',
      status: 'preview-only',
      storyId: 'app-store-marketing-en-us-v1',
      locale: 'en-US',
      sourceBuild: { sourceCommit },
      artifact,
    });
    expect(Object.keys(manifest.targets)).toEqual([
      'android-phone',
    ]);
    expect(manifest.frames).toHaveLength(6);
    expect(manifest.frames[0]).toMatchObject({
      order: story.frames[0].order,
      frameId: story.frames[0].id,
      copyKey: story.frames[0].copyKey,
      headline: story.frames[0].headline,
      supporting: story.frames[0].supporting,
    });

    const firstCapture = manifest.frames[0].captures['android-phone'];
    writeFileSync(join(outputRoot, firstCapture.file), 'tampered');
    expect(() => writeCombinedGooglePlayCaptureManifest({
      outputRoot,
      story,
    })).toThrow();
  });
});
