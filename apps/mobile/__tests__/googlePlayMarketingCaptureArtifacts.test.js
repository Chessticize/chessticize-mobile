const { createHash } = require('node:crypto');
const {
  mkdtempSync,
  readFileSync,
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
  GOOGLE_PLAY_CAPTURE_TARGETS,
  assertGooglePlayScreenshot,
  redactedAndroidDeviceId,
  resolveGooglePlayArtifactIdentity,
  resolveGooglePlayCaptureTarget,
  writeCombinedGooglePlayCaptureManifest,
  writeGooglePlayDeviceCaptureManifest,
} = require('../e2e/googlePlayMarketingCaptureArtifacts');

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

  it('writes and re-verifies one artifact-bound manifest for all Play families', () => {
    const outputRoot = mkdtempSync(join(tmpdir(), 'play-capture-'));
    const sourceCommit = 'e'.repeat(40);
    const artifact = previewArtifact();

    for (const deviceFamily of Object.keys(GOOGLE_PLAY_CAPTURE_TARGETS)) {
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
      'android-tablet-7',
      'android-tablet-10',
    ]);
    expect(manifest.frames).toHaveLength(6);
    expect(manifest.frames[0]).toMatchObject({
      order: story.frames[0].order,
      frameId: story.frames[0].id,
      copyKey: story.frames[0].copyKey,
      headline: story.frames[0].headline,
      supporting: story.frames[0].supporting,
    });

    const tabletManifestPath = join(
      outputRoot,
      'manifest-android-tablet-7.json'
    );
    const tabletManifest = JSON.parse(
      readFileSync(tabletManifestPath, 'utf8')
    );
    tabletManifest.artifact.fileName = 'different-app-e2e.apk';
    writeFileSync(tabletManifestPath, JSON.stringify(tabletManifest));
    expect(() => writeCombinedGooglePlayCaptureManifest({
      outputRoot,
      story,
    })).toThrow('must bind one source');
    tabletManifest.artifact.fileName = artifact.fileName;
    writeFileSync(tabletManifestPath, JSON.stringify(tabletManifest));

    const firstCapture = manifest.frames[0].captures['android-tablet-10'];
    writeFileSync(join(outputRoot, firstCapture.file), 'tampered');
    expect(() => writeCombinedGooglePlayCaptureManifest({
      outputRoot,
      story,
    })).toThrow();
  });
});
