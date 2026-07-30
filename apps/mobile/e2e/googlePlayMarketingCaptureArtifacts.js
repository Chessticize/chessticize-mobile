const { createHash } = require('node:crypto');
const {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} = require('node:fs');
const {
  basename,
  isAbsolute,
  relative,
  resolve,
  sep,
} = require('node:path');
const { PNG } = require('pngjs');

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

function writeGooglePlayDeviceCaptureManifest({
  artifact,
  outputRoot,
  records,
  sourceCommit,
  story,
  target,
}) {
  assertGooglePlayCaptureSet({
    artifact,
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
      manifests[deviceFamily].target,
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
  assertGooglePlayCaptureSet({
    artifact: manifest.artifact,
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
  }
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
  redactedAndroidDeviceId,
  resolveGooglePlayArtifactIdentity,
  resolveGooglePlayCaptureTarget,
  writeCombinedGooglePlayCaptureManifest,
  writeGooglePlayDeviceCaptureManifest,
};
