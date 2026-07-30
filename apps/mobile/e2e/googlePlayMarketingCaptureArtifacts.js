const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const {
  basename,
  isAbsolute,
  relative,
  resolve,
  sep,
} = require('node:path');
const { PNG } = require('pngjs');
const {
  inspectGeneratedApk,
} = require('../scripts/android-github-release');
const { androidAdbPath } = require('./androidNetwork');

const GOOGLE_PLAY_CAPTURE_TARGETS = Object.freeze({
  'android-phone': Object.freeze({
    displayGroup: 'phone',
    orientation: 'portrait',
    rawPixelDimensions: Object.freeze({ width: 1080, height: 1920 }),
  }),
  'android-tablet-7': Object.freeze({
    displayGroup: '7-inch-tablet',
    orientation: 'portrait',
    rawPixelDimensions: Object.freeze({ width: 1200, height: 1920 }),
  }),
  'android-tablet-10': Object.freeze({
    displayGroup: '10-inch-tablet',
    orientation: 'landscape',
    rawPixelDimensions: Object.freeze({ width: 2560, height: 1600 }),
  }),
});

const EXACT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GOOGLE_PLAY_APPLICATION_ID = 'com.chessticize.mobile';
const GOOGLE_PLAY_INSTALLER_PACKAGE = 'com.android.vending';

function resolveGooglePlayCaptureTarget(environment) {
  const deviceFamily = String(
    environment.CHESSTICIZE_MARKETING_DEVICE_FAMILY ?? ''
  ).trim();
  const contract = GOOGLE_PLAY_CAPTURE_TARGETS[deviceFamily];
  if (!contract) {
    throw new Error(
      'CHESSTICIZE_MARKETING_DEVICE_FAMILY must be android-phone, '
      + 'android-tablet-7, or android-tablet-10 for Google Play capture.'
    );
  }
  const deviceName = String(
    environment.CHESSTICIZE_ANDROID_MARKETING_DEVICE_PROFILE ?? ''
  ).trim();
  if (!deviceName) {
    throw new Error(
      'CHESSTICIZE_ANDROID_MARKETING_DEVICE_PROFILE must name the Android '
      + 'emulator or device profile.'
    );
  }
  const adbSerial = String(environment.DETOX_ANDROID_DEVICE ?? '').trim();
  if (!adbSerial) {
    throw new Error(
      'DETOX_ANDROID_DEVICE must identify the attached Android capture target.'
    );
  }
  const apiLevel = Number(
    environment.CHESSTICIZE_ANDROID_MARKETING_API_LEVEL
  );
  const densityDpi = Number(
    environment.CHESSTICIZE_ANDROID_MARKETING_DENSITY_DPI
  );
  if (!Number.isSafeInteger(apiLevel) || apiLevel < 24) {
    throw new Error(
      'CHESSTICIZE_ANDROID_MARKETING_API_LEVEL must be an integer of at least 24.'
    );
  }
  if (!Number.isSafeInteger(densityDpi) || densityDpi < 120) {
    throw new Error(
      'CHESSTICIZE_ANDROID_MARKETING_DENSITY_DPI must be an integer of at least 120.'
    );
  }

  return {
    platform: 'android',
    deviceFamily,
    deviceName,
    deviceId: redactedAndroidDeviceId(adbSerial),
    apiLevel,
    densityDpi,
    displayGroup: contract.displayGroup,
    orientation: contract.orientation,
    rawPixelDimensions: {
      ...contract.rawPixelDimensions,
    },
    acceptedSizes: [{
      ...contract.rawPixelDimensions,
    }],
    outputDirectoryName: [
      deviceFamily,
      contract.displayGroup,
      contract.orientation,
    ].join('-'),
  };
}

function redactedAndroidDeviceId(adbSerial) {
  if (/^emulator-\d+$/.test(adbSerial)) {
    return adbSerial;
  }
  return `physical-…${adbSerial.slice(-6)}`;
}

function resolveGooglePlayArtifactIdentity({
  environment,
  repositoryRoot,
  sourceCommit,
}) {
  if (!EXACT_SHA_PATTERN.test(sourceCommit ?? '')) {
    throw new Error('Google Play capture source commit must be a full SHA.');
  }
  const captureMode = String(
    environment.CHESSTICIZE_ANDROID_MARKETING_CAPTURE_MODE ?? ''
  ).trim();
  if (
    captureMode !== 'deterministic-e2e'
    && captureMode !== 'public-ui-exact-artifact'
  ) {
    throw new Error(
      'CHESSTICIZE_ANDROID_MARKETING_CAPTURE_MODE must be '
      + 'deterministic-e2e or public-ui-exact-artifact.'
    );
  }
  const artifactRole = String(
    environment.CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_ROLE ?? ''
  ).trim();
  const expectedRole = captureMode === 'deterministic-e2e'
    ? 'detox-e2e-apk'
    : 'play-delivered-apk';
  if (artifactRole !== expectedRole) {
    throw new Error(
      `${captureMode} requires CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_ROLE=`
      + `${expectedRole}.`
    );
  }
  const artifactPath = resolveExistingFile(
    repositoryRoot,
    environment.CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_PATH,
    'Android capture artifact'
  );
  const artifactBuffer = readFileSync(artifactPath);
  const identity = {
    captureMode,
    artifactRole,
    fileName: basename(artifactPath),
    bytes: statSync(artifactPath).size,
    sha256: sha256(artifactBuffer),
  };

  const sourceManifestValue = String(
    environment.CHESSTICIZE_ANDROID_SOURCE_MANIFEST_PATH ?? ''
  ).trim();
  if (captureMode === 'deterministic-e2e') {
    if (sourceManifestValue) {
      throw new Error(
        'Deterministic E2E preview capture must not claim a production '
        + 'Android source manifest.'
      );
    }
    return identity;
  }

  const sourceManifestPath = resolveExistingFile(
    repositoryRoot,
    sourceManifestValue,
    'Android source manifest'
  );
  const sourceManifestBuffer = readFileSync(sourceManifestPath);
  const sourceManifest = parseJson(
    sourceManifestBuffer.toString('utf8'),
    'Android source manifest'
  );
  if (
    sourceManifest.schemaVersion !== 1
    || sourceManifest.status !== 'artifact-only'
    || sourceManifest.commitSha !== sourceCommit
    || sourceManifest.worktreeClean !== true
    || sourceManifest.bundle?.applicationId !== 'com.chessticize.mobile'
    || !Number.isSafeInteger(sourceManifest.bundle?.versionCode)
    || sourceManifest.bundle.versionCode < 1
    || typeof sourceManifest.bundle?.versionName !== 'string'
    || !SHA256_PATTERN.test(sourceManifest.bundle?.sha256 ?? '')
  ) {
    throw new Error(
      'Android source manifest does not bind a clean Chessticize Play '
      + 'candidate to the capture source commit.'
    );
  }
  const mirrorEvidencePath = resolveExistingFile(
    repositoryRoot,
    environment.CHESSTICIZE_ANDROID_APK_MIRROR_EVIDENCE_PATH,
    'Android APK mirror evidence'
  );
  const mirrorEvidenceBuffer = readFileSync(mirrorEvidencePath);
  const mirrorEvidence = parseJson(
    mirrorEvidenceBuffer.toString('utf8'),
    'Android APK mirror evidence'
  );
  const sourceManifestSha256 = sha256(sourceManifestBuffer);
  if (
    mirrorEvidence.schemaVersion !== 1
    || mirrorEvidence.phase !== 'play-apk-mirrored'
    || mirrorEvidence.commitSha !== sourceCommit
    || mirrorEvidence.applicationId !== sourceManifest.bundle.applicationId
    || mirrorEvidence.versionName !== sourceManifest.bundle.versionName
    || mirrorEvidence.versionCode !== sourceManifest.bundle.versionCode
    || mirrorEvidence.aabSha256 !== sourceManifest.bundle.sha256
    || mirrorEvidence.sourceManifestSha256 !== sourceManifestSha256
    || mirrorEvidence.apk?.name !== basename(artifactPath)
    || mirrorEvidence.apk?.bytes !== identity.bytes
    || mirrorEvidence.apk?.sha256 !== identity.sha256
    || !SHA256_PATTERN.test(
      mirrorEvidence.apk?.signerCertificateSha256 ?? ''
    )
  ) {
    throw new Error(
      'Android APK mirror evidence does not bind the supplied Play-delivered '
      + 'APK to the protected source manifest.'
    );
  }

  return {
    ...identity,
    candidate: {
      applicationId: sourceManifest.bundle.applicationId,
      versionName: sourceManifest.bundle.versionName,
      versionCode: sourceManifest.bundle.versionCode,
      aabSha256: sourceManifest.bundle.sha256,
      signerCertificateSha256:
        mirrorEvidence.apk.signerCertificateSha256,
    },
    sourceManifest: {
      fileName: basename(sourceManifestPath),
      sha256: sourceManifestSha256,
    },
    mirrorEvidence: {
      fileName: basename(mirrorEvidencePath),
      sha256: sha256(mirrorEvidenceBuffer),
      playDownloadId: mirrorEvidence.playDownloadId,
    },
  };
}

function inspectGooglePlayInstalledSession({
  artifact,
  environment,
  inspectApk = inspectGeneratedApk,
  repositoryRoot,
  run = spawnSync,
  target,
  temporaryRoot = tmpdir(),
}) {
  assertArtifactIdentity(artifact, 'exact-artifact-capture');
  const adb = androidAdbPath(environment);
  const adbSerial = String(environment.DETOX_ANDROID_DEVICE ?? '').trim();
  if (!adbSerial || target.deviceId !== redactedAndroidDeviceId(adbSerial)) {
    throw new Error(
      'The attached Android serial does not match the Google Play capture target.'
    );
  }
  const artifactPath = resolveExistingFile(
    repositoryRoot,
    environment.CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_PATH,
    'Android capture artifact'
  );
  const mirroredInspection = inspectApk(artifactPath, { environment });
  assertInstalledApkInspection({
    artifact,
    inspection: mirroredInspection,
    label: 'Play-delivered mirror artifact',
  });

  const packagePathOutput = runAdbText({
    adb,
    args: ['shell', 'pm', 'path', GOOGLE_PLAY_APPLICATION_ID],
    label: 'Could not locate the installed Chessticize package',
    run,
    serial: adbSerial,
  });
  const installedBasePaths = packagePathOutput
    .split(/\r?\n/)
    .map((line) => line.match(/^package:(.+\/base\.apk)$/)?.[1])
    .filter(Boolean);
  if (installedBasePaths.length !== 1) {
    throw new Error(
      'The installed Chessticize package must expose exactly one base APK.'
    );
  }

  const sessionRoot = mkdtempSync(
    resolve(temporaryRoot, 'chessticize-play-session-')
  );
  const installedBaseApkPath = resolve(sessionRoot, 'base.apk');
  let installedInspection;
  let installedBaseApk;
  try {
    runAdbText({
      adb,
      args: [
        'pull',
        installedBasePaths[0],
        installedBaseApkPath,
      ],
      label: 'Could not pull the installed Chessticize base APK',
      run,
      serial: adbSerial,
    });
    if (
      !existsSync(installedBaseApkPath)
      || !statSync(installedBaseApkPath).isFile()
    ) {
      throw new Error(
        'ADB did not produce the installed Chessticize base APK.'
      );
    }
    installedInspection = inspectApk(installedBaseApkPath, { environment });
    assertInstalledApkInspection({
      artifact,
      inspection: installedInspection,
      label: 'Installed Chessticize base APK',
    });
    const installedBytes = readFileSync(installedBaseApkPath);
    installedBaseApk = {
      bytes: installedBytes.length,
      sha256: sha256(installedBytes),
    };
  } finally {
    rmSync(sessionRoot, { force: true, recursive: true });
  }

  const installSource = runAdbText({
    adb,
    args: [
      'shell',
      'cmd',
      'package',
      'get-install-source',
      GOOGLE_PLAY_APPLICATION_ID,
    ],
    label: 'Could not inspect the Chessticize install source',
    run,
    serial: adbSerial,
  });
  const installerPackageName = installSource.match(
    /^InstallingPackageName=(.+)$/m
  )?.[1]?.trim();
  const initiatingPackageName = installSource.match(
    /^InitiatingPackageName=(.+)$/m
  )?.[1]?.trim();
  if (
    installerPackageName !== GOOGLE_PLAY_INSTALLER_PACKAGE
    || initiatingPackageName !== GOOGLE_PLAY_INSTALLER_PACKAGE
  ) {
    throw new Error(
      'Exact Google Play capture requires Chessticize to be installed from '
      + `${GOOGLE_PLAY_INSTALLER_PACKAGE}.`
    );
  }

  const activityState = runAdbText({
    adb,
    args: ['shell', 'dumpsys', 'activity', 'activities'],
    label: 'Could not inspect the foreground Android activity',
    run,
    serial: adbSerial,
  });
  const foregroundPackage = activityState.match(
    /mResumedActivity[^\r\n]*\su\d+\s+([A-Za-z0-9._]+)\//
  )?.[1];
  if (foregroundPackage !== GOOGLE_PLAY_APPLICATION_ID) {
    throw new Error(
      'Exact Google Play capture requires Chessticize to be foreground.'
    );
  }

  return {
    schemaVersion: 1,
    applicationId: installedInspection.applicationId,
    installerPackageName,
    initiatingPackageName,
    versionName: installedInspection.versionName,
    versionCode: installedInspection.versionCode,
    signerCertificateSha256:
      installedInspection.signerCertificateSha256.toLowerCase(),
    debuggable: installedInspection.debuggable,
    testOnly: installedInspection.testOnly,
    foregroundPackage,
    deviceId: target.deviceId,
    installedBaseApk,
  };
}

function captureGooglePlayPublicUiFrame({
  artifact,
  captureRoot,
  environment,
  frame,
  inspectApk = inspectGeneratedApk,
  repositoryRoot,
  run = spawnSync,
  sourceCommit,
  story,
  target,
}) {
  assertStoryFrame({ frame, sourceCommit, story });
  assertArtifactIdentity(artifact, 'exact-artifact-capture');
  const installedSession = inspectGooglePlayInstalledSession({
    artifact,
    environment,
    inspectApk,
    repositoryRoot,
    run,
    target,
  });
  const adb = androidAdbPath(environment);
  const adbSerial = String(environment.DETOX_ANDROID_DEVICE ?? '').trim();
  const screenshotResult = run(
    adb,
    ['-s', adbSerial, 'exec-out', 'screencap', '-p'],
    { encoding: null, maxBuffer: 32 * 1024 * 1024 }
  );
  if (screenshotResult?.status !== 0) {
    throw new Error(
      'Could not capture the foreground Chessticize frame: '
      + commandFailureDetail(screenshotResult)
    );
  }
  const screenshotBuffer = Buffer.isBuffer(screenshotResult.stdout)
    ? screenshotResult.stdout
    : Buffer.from(screenshotResult.stdout ?? '');
  let screenshot;
  try {
    screenshot = PNG.sync.read(screenshotBuffer);
  } catch {
    throw new Error('ADB screencap did not return a valid PNG.');
  }
  assertGooglePlayScreenshot(screenshot, target);

  mkdirSync(captureRoot, { recursive: true });
  const screenshotPath = resolve(captureRoot, `${frame.captureId}.png`);
  const sidecarPath = resolve(
    captureRoot,
    `${frame.captureId}.capture.json`
  );
  writeFileSync(screenshotPath, screenshotBuffer);
  const sidecar = {
    schemaVersion: 1,
    platform: 'google-play',
    captureMode: 'public-ui-exact-artifact',
    order: frame.order,
    frameId: frame.id,
    captureId: frame.captureId,
    sourceCommit,
    artifact,
    target: manifestTarget(target),
    installedSession,
    screenshot: {
      fileName: basename(screenshotPath),
      bytes: screenshotBuffer.length,
      sha256: sha256(screenshotBuffer),
      pixelDimensions: {
        width: screenshot.width,
        height: screenshot.height,
      },
    },
  };
  writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
  return {
    installedSession,
    screenshotPath,
    sidecarPath,
  };
}

function readGooglePlayPublicUiFrame({
  artifact,
  frame,
  inputRoot,
  installedSession,
  outputRoot,
  sourceCommit,
  story,
  target,
}) {
  assertStoryFrame({ frame, sourceCommit, story });
  const screenshotPath = resolve(inputRoot, `${frame.captureId}.png`);
  const sidecarPath = resolve(
    inputRoot,
    `${frame.captureId}.capture.json`
  );
  if (!existsSync(screenshotPath) || !existsSync(sidecarPath)) {
    throw new Error(
      `Exact Google Play frame ${frame.captureId} requires its PNG and `
      + 'capture sidecar.'
    );
  }
  const screenshotBuffer = readFileSync(screenshotPath);
  const sidecarBuffer = readFileSync(sidecarPath);
  const sidecar = parseJson(sidecarBuffer.toString('utf8'), 'capture sidecar');
  let screenshot;
  try {
    screenshot = PNG.sync.read(screenshotBuffer);
  } catch {
    throw new Error(
      `Exact Google Play screenshot drifted for ${frame.captureId}.`
    );
  }
  assertGooglePlayScreenshot(screenshot, target);
  const expectedTarget = manifestTarget(target);
  if (
    sidecar.schemaVersion !== 1
    || sidecar.platform !== 'google-play'
    || sidecar.captureMode !== 'public-ui-exact-artifact'
    || sidecar.order !== frame.order
    || sidecar.frameId !== frame.id
    || sidecar.captureId !== frame.captureId
    || sidecar.sourceCommit !== sourceCommit
    || JSON.stringify(sidecar.artifact) !== JSON.stringify(artifact)
    || JSON.stringify(sidecar.target) !== JSON.stringify(expectedTarget)
    || JSON.stringify(sidecar.installedSession)
      !== JSON.stringify(installedSession)
    || sidecar.screenshot?.fileName !== basename(screenshotPath)
    || sidecar.screenshot?.bytes !== screenshotBuffer.length
    || sidecar.screenshot?.sha256 !== sha256(screenshotBuffer)
    || sidecar.screenshot?.pixelDimensions?.width !== screenshot.width
    || sidecar.screenshot?.pixelDimensions?.height !== screenshot.height
  ) {
    throw new Error(
      `Exact Google Play capture sidecar or screenshot drifted for `
      + `${frame.captureId}.`
    );
  }

  const familyDirectory = resolve(outputRoot, target.outputDirectoryName);
  mkdirSync(familyDirectory, { recursive: true });
  const destinationSidecar = resolve(
    familyDirectory,
    `${frame.captureId}.capture.json`
  );
  copyFileSync(sidecarPath, destinationSidecar);
  return {
    screenshotPath,
    captureProvenance: {
      sidecarFileName: basename(destinationSidecar),
      sidecarFile: relative(outputRoot, destinationSidecar),
      sidecarSha256: sha256(sidecarBuffer),
      installedSessionSha256: sha256(
        Buffer.from(JSON.stringify(installedSession))
      ),
    },
  };
}

function writeGooglePlayDeviceCaptureManifest({
  artifact,
  installedSession,
  outputRoot,
  records,
  sourceCommit,
  story,
  target,
}) {
  assertGooglePlayCaptureSet({
    artifact,
    installedSession,
    outputRoot,
    records,
    sourceCommit,
    story,
    target,
  });
  const manifest = {
    schemaVersion: 1,
    platform: 'google-play',
    status: artifact.captureMode === 'public-ui-exact-artifact'
      ? 'exact-artifact-capture'
      : 'preview-only',
    storyId: story.storyId,
    contractIssue: story.issue,
    contractSchemaVersion: story.schemaVersion,
    locale: story.locale,
    sourceBuild: {
      sourceCommit,
      puzzlePack: {
        ...story.sourceBuild.puzzlePack,
      },
    },
    artifact,
    ...(installedSession ? { installedSession } : {}),
    target: manifestTarget(target),
    frames: orderedFrames(records),
  };
  const manifestPath = resolve(
    outputRoot,
    `manifest-${target.deviceFamily}.json`
  );
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}

function writeCombinedGooglePlayCaptureManifest({
  outputRoot,
  story,
}) {
  const deviceFamilies = Object.keys(GOOGLE_PLAY_CAPTURE_TARGETS);
  const manifests = Object.fromEntries(deviceFamilies.map((deviceFamily) => {
    const manifestPath = resolve(
      outputRoot,
      `manifest-${deviceFamily}.json`
    );
    if (!existsSync(manifestPath)) {
      throw new Error(
        `Missing Google Play ${deviceFamily} manifest at ${manifestPath}.`
      );
    }
    return [
      deviceFamily,
      parseJson(readFileSync(manifestPath, 'utf8'), manifestPath),
    ];
  }));
  const reference = manifests[deviceFamilies[0]];
  for (const deviceFamily of deviceFamilies) {
    const manifest = manifests[deviceFamily];
    assertGooglePlayDeviceManifest({
      manifest,
      outputRoot,
      story,
    });
    if (
      manifest.sourceBuild.sourceCommit !== reference.sourceBuild.sourceCommit
      || manifest.artifact.captureMode !== reference.artifact.captureMode
      || manifest.artifact.artifactRole !== reference.artifact.artifactRole
      || manifest.artifact.sha256 !== reference.artifact.sha256
      || JSON.stringify(manifest.artifact) !== JSON.stringify(reference.artifact)
      || manifest.status !== reference.status
    ) {
      throw new Error(
        'Google Play device manifests must bind one source, capture mode, '
        + 'and Android artifact.'
      );
    }
  }

  const expectedFrames = expectedStoryFrames(story);
  const combined = {
    schemaVersion: 1,
    platform: 'google-play',
    status: reference.status,
    storyId: story.storyId,
    contractIssue: story.issue,
    contractSchemaVersion: story.schemaVersion,
    locale: story.locale,
    sourceBuild: reference.sourceBuild,
    artifact: reference.artifact,
    targets: Object.fromEntries(deviceFamilies.map((deviceFamily) => [
      deviceFamily,
      {
        ...manifests[deviceFamily].target,
        ...(manifests[deviceFamily].installedSession
          ? { installedSession: manifests[deviceFamily].installedSession }
          : {}),
      },
    ])),
    frames: expectedFrames.map((frame) => ({
      order: frame.order,
      frameId: frame.id,
      captureId: frame.captureId,
      copyKey: frame.copyKey,
      headline: frame.headline,
      supporting: frame.supporting,
      captures: Object.fromEntries(deviceFamilies.map((deviceFamily) => [
        deviceFamily,
        manifests[deviceFamily].frames.find(
          (record) => record.captureId === frame.captureId
        ),
      ])),
    })),
  };
  const manifestPath = resolve(
    outputRoot,
    'google-play-capture-manifest.json'
  );
  writeFileSync(manifestPath, `${JSON.stringify(combined, null, 2)}\n`);
  return manifestPath;
}

function assertGooglePlayDeviceManifest({
  manifest,
  outputRoot,
  story,
}) {
  const contract = GOOGLE_PLAY_CAPTURE_TARGETS[
    manifest.target?.deviceFamily
  ];
  if (
    manifest.schemaVersion !== 1
    || manifest.platform !== 'google-play'
    || !contract
    || manifest.storyId !== story.storyId
    || manifest.contractIssue !== story.issue
    || manifest.contractSchemaVersion !== story.schemaVersion
    || manifest.locale !== story.locale
    || !EXACT_SHA_PATTERN.test(manifest.sourceBuild?.sourceCommit ?? '')
    || manifest.target.displayGroup !== contract.displayGroup
    || manifest.target.orientation !== contract.orientation
    || manifest.target.rawPixelDimensions?.width
      !== contract.rawPixelDimensions.width
    || manifest.target.rawPixelDimensions?.height
      !== contract.rawPixelDimensions.height
    || !Number.isSafeInteger(manifest.target.apiLevel)
    || manifest.target.apiLevel < 24
    || !Number.isSafeInteger(manifest.target.densityDpi)
    || manifest.target.densityDpi < 120
  ) {
    throw new Error(
      'Google Play device manifest does not match the capture contract.'
    );
  }
  assertArtifactIdentity(manifest.artifact, manifest.status);
  if (manifest.status === 'exact-artifact-capture') {
    assertGooglePlayInstalledSessionIdentity({
      artifact: manifest.artifact,
      installedSession: manifest.installedSession,
      target: manifest.target,
    });
  } else if (manifest.installedSession) {
    throw new Error(
      'Preview Google Play manifests must not claim an installed Play session.'
    );
  }
  assertGooglePlayCaptureSet({
    artifact: manifest.artifact,
    installedSession: manifest.installedSession,
    outputRoot,
    records: manifest.frames,
    sourceCommit: manifest.sourceBuild.sourceCommit,
    story,
    target: {
      ...manifest.target,
      acceptedSizes: [{
        ...contract.rawPixelDimensions,
      }],
    },
  });
}

function assertGooglePlayCaptureSet({
  artifact,
  installedSession,
  outputRoot,
  records,
  sourceCommit,
  story,
  target,
}) {
  const contract = GOOGLE_PLAY_CAPTURE_TARGETS[target.deviceFamily];
  if (
    target.platform !== 'android'
    || !contract
    || target.displayGroup !== contract.displayGroup
    || target.orientation !== contract.orientation
    || !Number.isSafeInteger(target.apiLevel)
    || target.apiLevel < 24
    || !Number.isSafeInteger(target.densityDpi)
    || target.densityDpi < 120
  ) {
    throw new Error('Google Play capture target is not approved.');
  }
  if (!EXACT_SHA_PATTERN.test(sourceCommit ?? '')) {
    throw new Error('Google Play capture source commit must be a full SHA.');
  }
  assertArtifactIdentity(
    artifact,
    artifact.captureMode === 'public-ui-exact-artifact'
      ? 'exact-artifact-capture'
      : 'preview-only'
  );
  const exact = artifact.captureMode === 'public-ui-exact-artifact';
  if (exact) {
    assertGooglePlayInstalledSessionIdentity({
      artifact,
      installedSession,
      target,
    });
  } else if (installedSession) {
    throw new Error(
      'Preview Google Play captures must not claim an installed Play session.'
    );
  }
  const expectedFrames = expectedStoryFrames(story);
  const ordered = orderedFrames(records);
  if (
    ordered.length !== expectedFrames.length
    || ordered.some((record, index) =>
      record.order !== expectedFrames[index].order
      || record.frameId !== expectedFrames[index].id
      || record.captureId !== expectedFrames[index].captureId
      || record.copyKey !== expectedFrames[index].copyKey
      || record.locale !== story.locale
      || record.deviceFamily !== target.deviceFamily
      || record.deviceName !== target.deviceName
      || record.displayGroup !== target.displayGroup
      || record.orientation !== target.orientation
      || record.sourceCommit !== sourceCommit
    )
  ) {
    throw new Error(
      `Google Play ${target.deviceFamily} manifest must contain the approved `
      + 'six-frame order.'
    );
  }
  for (const record of ordered) {
    const artifactPath = resolveCapturePath(outputRoot, record.file);
    if (!existsSync(artifactPath)) {
      throw new Error(`Missing Google Play raw capture ${record.file}.`);
    }
    const fileBuffer = readFileSync(artifactPath);
    const png = PNG.sync.read(fileBuffer);
    assertGooglePlayScreenshot(png, target);
    if (
      record.pixelDimensions?.width !== png.width
      || record.pixelDimensions?.height !== png.height
      || record.sha256 !== sha256(fileBuffer)
    ) {
      throw new Error(
        `Google Play raw capture ${record.file} does not match its manifest.`
      );
    }
    if (exact) {
      assertExactCaptureProvenance({
        artifact,
        installedSession,
        outputRoot,
        record,
        sourceCommit,
        target,
      });
    } else if (record.captureProvenance) {
      throw new Error(
        'Preview Google Play frames must not claim exact capture provenance.'
      );
    }
  }
}

function assertExactCaptureProvenance({
  artifact,
  installedSession,
  outputRoot,
  record,
  sourceCommit,
  target,
}) {
  const provenance = record.captureProvenance;
  if (
    !provenance
    || provenance.sidecarFileName !== `${record.captureId}.capture.json`
    || !SHA256_PATTERN.test(provenance.sidecarSha256 ?? '')
    || provenance.installedSessionSha256 !== sha256(
      Buffer.from(JSON.stringify(installedSession))
    )
  ) {
    throw new Error(
      `Exact Google Play frame ${record.captureId} lacks command provenance.`
    );
  }
  const sidecarPath = resolveCapturePath(
    outputRoot,
    provenance.sidecarFile
  );
  if (
    !existsSync(sidecarPath)
    || basename(sidecarPath) !== provenance.sidecarFileName
  ) {
    throw new Error(
      `Missing exact Google Play capture sidecar for ${record.captureId}.`
    );
  }
  const sidecarBuffer = readFileSync(sidecarPath);
  const sidecar = parseJson(
    sidecarBuffer.toString('utf8'),
    `capture sidecar ${provenance.sidecarFile}`
  );
  if (
    provenance.sidecarSha256 !== sha256(sidecarBuffer)
    || sidecar.schemaVersion !== 1
    || sidecar.platform !== 'google-play'
    || sidecar.captureMode !== 'public-ui-exact-artifact'
    || sidecar.order !== record.order
    || sidecar.frameId !== record.frameId
    || sidecar.captureId !== record.captureId
    || sidecar.sourceCommit !== sourceCommit
    || JSON.stringify(sidecar.artifact) !== JSON.stringify(artifact)
    || JSON.stringify(sidecar.target) !== JSON.stringify(manifestTarget(target))
    || JSON.stringify(sidecar.installedSession)
      !== JSON.stringify(installedSession)
    || sidecar.screenshot?.fileName !== record.fileName
    || sidecar.screenshot?.bytes !== statSync(
      resolveCapturePath(outputRoot, record.file)
    ).size
    || sidecar.screenshot?.sha256 !== record.sha256
    || sidecar.screenshot?.pixelDimensions?.width
      !== record.pixelDimensions.width
    || sidecar.screenshot?.pixelDimensions?.height
      !== record.pixelDimensions.height
  ) {
    throw new Error(
      `Exact Google Play capture sidecar drifted for ${record.captureId}.`
    );
  }
}

function assertGooglePlayInstalledSessionIdentity({
  artifact,
  installedSession,
  target,
}) {
  if (
    installedSession?.schemaVersion !== 1
    || installedSession.applicationId !== GOOGLE_PLAY_APPLICATION_ID
    || installedSession.installerPackageName !== GOOGLE_PLAY_INSTALLER_PACKAGE
    || installedSession.initiatingPackageName !== GOOGLE_PLAY_INSTALLER_PACKAGE
    || installedSession.versionName !== artifact.candidate.versionName
    || installedSession.versionCode !== artifact.candidate.versionCode
    || installedSession.signerCertificateSha256
      !== artifact.candidate.signerCertificateSha256.toLowerCase()
    || installedSession.debuggable !== false
    || installedSession.testOnly !== false
    || installedSession.foregroundPackage !== GOOGLE_PLAY_APPLICATION_ID
    || installedSession.deviceId !== target.deviceId
    || !Number.isSafeInteger(installedSession.installedBaseApk?.bytes)
    || installedSession.installedBaseApk.bytes < 1
    || !SHA256_PATTERN.test(
      installedSession.installedBaseApk?.sha256 ?? ''
    )
  ) {
    throw new Error(
      'Exact Google Play installed-session identity is incomplete or drifted.'
    );
  }
}

function assertInstalledApkInspection({
  artifact,
  inspection,
  label,
}) {
  if (inspection?.applicationId !== GOOGLE_PLAY_APPLICATION_ID) {
    throw new Error(`${label} package does not match Chessticize.`);
  }
  if (
    inspection.versionName !== artifact.candidate.versionName
    || inspection.versionCode !== artifact.candidate.versionCode
  ) {
    throw new Error(`${label} version does not match the Play candidate.`);
  }
  if (
    String(inspection.signerCertificateSha256 ?? '').toLowerCase()
    !== artifact.candidate.signerCertificateSha256.toLowerCase()
  ) {
    throw new Error(`${label} Play signer does not match mirror evidence.`);
  }
  if (inspection.debuggable !== false) {
    throw new Error(`${label} must not be debuggable.`);
  }
  if (inspection.testOnly !== false) {
    throw new Error(`${label} must not be testOnly.`);
  }
}

function assertStoryFrame({ frame, sourceCommit, story }) {
  const expected = story.frames.find(
    (candidate) => candidate.captureId === frame?.captureId
  );
  if (
    !expected
    || expected.id !== frame.id
    || expected.order !== frame.order
  ) {
    throw new Error('Google Play frame is not in the approved story contract.');
  }
  if (!EXACT_SHA_PATTERN.test(sourceCommit ?? '')) {
    throw new Error('Google Play capture source commit must be a full SHA.');
  }
}

function runAdbText({
  adb,
  args,
  label,
  run,
  serial,
}) {
  const result = run(
    adb,
    ['-s', serial, ...args],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );
  if (result?.status !== 0) {
    throw new Error(`${label}: ${commandFailureDetail(result)}`);
  }
  return Buffer.isBuffer(result.stdout)
    ? result.stdout.toString('utf8')
    : String(result.stdout ?? '');
}

function commandFailureDetail(result) {
  const detail = result?.stderr
    || result?.stdout
    || result?.error
    || 'command failed';
  return Buffer.isBuffer(detail)
    ? detail.toString('utf8').trim()
    : String(detail).trim();
}

function assertGooglePlayScreenshot(png, target) {
  const { width, height } = png;
  const orientationMatches = target.orientation === 'portrait'
    ? height > width
    : width > height;
  if (!orientationMatches) {
    throw new Error(
      `Google Play ${target.deviceFamily} capture must be `
      + `${target.orientation}; received ${width}x${height}.`
    );
  }
  if (
    Math.min(width, height) < 320
    || Math.max(width, height) > 3840
    || Math.max(width, height) > 2 * Math.min(width, height)
  ) {
    throw new Error(
      `Google Play raw capture dimensions ${width}x${height} are outside `
      + 'the 320–3840 and 2:1 screenshot limits.'
    );
  }
  const expected = GOOGLE_PLAY_CAPTURE_TARGETS[
    target.deviceFamily
  ]?.rawPixelDimensions;
  if (!expected || width !== expected.width || height !== expected.height) {
    throw new Error(
      `Google Play ${target.deviceFamily} capture has unsupported dimensions `
      + `${width}x${height}; expected ${expected?.width}x${expected?.height}.`
    );
  }
  for (let offset = 3; offset < png.data.length; offset += 4) {
    if (png.data[offset] !== 255) {
      throw new Error('Google Play raw capture must not contain transparency.');
    }
  }
}

function assertArtifactIdentity(artifact, status) {
  const exact = status === 'exact-artifact-capture';
  if (
    !artifact
    || !SHA256_PATTERN.test(artifact.sha256 ?? '')
    || !Number.isSafeInteger(artifact.bytes)
    || artifact.bytes < 1
    || typeof artifact.fileName !== 'string'
    || artifact.fileName.length === 0
    || artifact.captureMode !== (
      exact ? 'public-ui-exact-artifact' : 'deterministic-e2e'
    )
    || artifact.artifactRole !== (
      exact ? 'play-delivered-apk' : 'detox-e2e-apk'
    )
  ) {
    throw new Error('Google Play capture artifact identity is incomplete.');
  }
  if (
    exact
    && (
      artifact.candidate?.applicationId !== 'com.chessticize.mobile'
      || !Number.isSafeInteger(artifact.candidate?.versionCode)
      || artifact.candidate.versionCode < 1
      || typeof artifact.candidate?.versionName !== 'string'
      || artifact.candidate.versionName.length === 0
      || !SHA256_PATTERN.test(artifact.candidate?.aabSha256 ?? '')
      || !SHA256_PATTERN.test(
        artifact.candidate?.signerCertificateSha256 ?? ''
      )
      || artifact.sourceManifest?.fileName !== 'android-source-manifest.json'
      || !SHA256_PATTERN.test(artifact.sourceManifest?.sha256 ?? '')
      || artifact.mirrorEvidence?.fileName
        !== 'android-apk-mirror-evidence.json'
      || !SHA256_PATTERN.test(artifact.mirrorEvidence?.sha256 ?? '')
    )
  ) {
    throw new Error(
      'Exact Google Play capture must include the Play candidate identity.'
    );
  }
  if (
    !exact
    && (artifact.candidate || artifact.sourceManifest || artifact.mirrorEvidence)
  ) {
    throw new Error(
      'Preview capture must not claim an exact Play candidate identity.'
    );
  }
}

function manifestTarget(target) {
  return {
    platform: target.platform,
    deviceFamily: target.deviceFamily,
    deviceName: target.deviceName,
    deviceId: target.deviceId,
    apiLevel: target.apiLevel,
    densityDpi: target.densityDpi,
    displayGroup: target.displayGroup,
    orientation: target.orientation,
    rawPixelDimensions: {
      ...target.rawPixelDimensions,
    },
  };
}

function expectedStoryFrames(story) {
  return story.frames
    .slice()
    .sort((left, right) => left.order - right.order);
}

function orderedFrames(records) {
  return records
    .slice()
    .sort((left, right) => left.order - right.order);
}

function resolveCapturePath(outputRoot, recordedPath) {
  if (typeof recordedPath !== 'string' || isAbsolute(recordedPath)) {
    throw new Error('Google Play raw capture paths must be relative.');
  }
  const output = resolve(outputRoot);
  const artifactPath = resolve(output, recordedPath);
  const relation = relative(output, artifactPath);
  if (
    relation === '..'
    || relation.startsWith(`..${sep}`)
    || isAbsolute(relation)
  ) {
    throw new Error(
      `Google Play raw capture path escapes the output root: ${recordedPath}.`
    );
  }
  return artifactPath;
}

function resolveExistingFile(repositoryRoot, configuredPath, label) {
  const value = String(configuredPath ?? '').trim();
  if (!value) {
    throw new Error(`${label} path is required.`);
  }
  const resolvedPath = isAbsolute(value)
    ? resolve(value)
    : resolve(repositoryRoot, value);
  if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
    throw new Error(`${label} does not exist: ${resolvedPath}.`);
  }
  return resolvedPath;
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

module.exports = {
  GOOGLE_PLAY_CAPTURE_TARGETS,
  assertGooglePlayDeviceManifest,
  assertGooglePlayScreenshot,
  captureGooglePlayPublicUiFrame,
  inspectGooglePlayInstalledSession,
  readGooglePlayPublicUiFrame,
  redactedAndroidDeviceId,
  resolveGooglePlayArtifactIdentity,
  resolveGooglePlayCaptureTarget,
  writeCombinedGooglePlayCaptureManifest,
  writeGooglePlayDeviceCaptureManifest,
};
