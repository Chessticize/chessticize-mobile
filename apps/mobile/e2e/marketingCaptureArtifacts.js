const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
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

const IPHONE_6_9_PORTRAIT_SIZES = [
  { width: 1260, height: 2736 },
  { width: 1290, height: 2796 },
  { width: 1320, height: 2868 },
];

function resolveMarketingCaptureTarget(environment, story) {
  const deviceFamily = environment.CHESSTICIZE_MARKETING_DEVICE_FAMILY;
  if (deviceFamily !== 'iphone' && deviceFamily !== 'ipad') {
    throw new Error(
      'CHESSTICIZE_MARKETING_DEVICE_FAMILY must be iphone or ipad.'
    );
  }
  const deviceName = String(environment.DETOX_IOS_DEVICE ?? '').trim();
  if (!deviceName) {
    throw new Error('DETOX_IOS_DEVICE must identify the marketing Simulator.');
  }
  if (deviceFamily === 'iphone' && !/(?:Air|Plus|Pro Max)/i.test(deviceName)) {
    throw new Error(
      `The 6.9-inch iPhone capture requires an Air, Plus, or Pro Max profile; received "${deviceName}".`
    );
  }
  if (deviceFamily === 'ipad' && !/13[- ]inch/i.test(deviceName)) {
    throw new Error(
      `The 13-inch iPad capture requires a 13-inch profile; received "${deviceName}".`
    );
  }

  const contract = story.deviceTargets[deviceFamily];
  return {
    deviceFamily,
    deviceName,
    displayGroup: contract.displayGroup,
    orientation: contract.primaryOrientation,
    outputDirectoryName: [
      deviceFamily,
      contract.displayGroup,
      contract.primaryOrientation,
    ].join('-'),
    acceptedSizes: deviceFamily === 'iphone'
      ? IPHONE_6_9_PORTRAIT_SIZES
      : contract.acceptedExportSizes,
  };
}

function captureMarketingScreenshot({
  captureScreenshot,
  frame,
  outputRoot,
  screenshotPath,
  sourceCommit,
  story,
  target,
  verifiedLayoutOrientation = false,
}) {
  const sourcePath = screenshotPath ?? captureScreenshot(frame.captureId);
  if (sourcePath && typeof sourcePath.then === 'function') {
    return sourcePath.then((resolvedPath) => captureMarketingScreenshot({
      frame,
      outputRoot,
      screenshotPath: resolvedPath,
      sourceCommit,
      story,
      target,
      verifiedLayoutOrientation,
    }));
  }
  const sourceBuffer = readFileSync(sourcePath);
  const rawPng = PNG.sync.read(sourceBuffer);
  const {
    normalization,
    png,
  } = normalizeVerifiedScreenshotOrientation({
    png: rawPng,
    targetOrientation: target.orientation,
    verifiedLayoutOrientation,
  });
  assertCaptureDimensions(png, target);

  const familyDirectory = resolve(outputRoot, target.outputDirectoryName);
  mkdirSync(familyDirectory, { recursive: true });
  const destination = resolve(familyDirectory, `${frame.captureId}.png`);
  if (normalization === 'none') {
    copyFileSync(sourcePath, destination);
  } else {
    writeFileSync(destination, PNG.sync.write(png));
  }
  const fileBuffer = readFileSync(destination);
  return {
    order: frame.order,
    frameId: frame.id,
    captureId: frame.captureId,
    copyKey: frame.copyKey,
    locale: story.locale,
    deviceFamily: target.deviceFamily,
    deviceName: target.deviceName,
    displayGroup: target.displayGroup,
    orientation: target.orientation,
    rawPixelDimensions: {
      width: rawPng.width,
      height: rawPng.height,
    },
    captureNormalization: normalization,
    pixelDimensions: {
      width: png.width,
      height: png.height,
    },
    sourceCommit,
    sourceState: frame.source.screen,
    puzzlePack: {
      ...story.sourceBuild.puzzlePack,
    },
    file: relative(outputRoot, destination),
    fileName: basename(destination),
    rawSha256: createHash('sha256').update(sourceBuffer).digest('hex'),
    sha256: createHash('sha256').update(fileBuffer).digest('hex'),
  };
}

function normalizeVerifiedScreenshotOrientation({
  png,
  targetOrientation,
  verifiedLayoutOrientation = false,
}) {
  const orientationMatches = targetOrientation === 'portrait'
    ? png.height > png.width
    : png.width > png.height;
  if (orientationMatches) {
    return {
      normalization: 'none',
      png,
    };
  }
  if (!verifiedLayoutOrientation) {
    return {
      normalization: 'none',
      png,
    };
  }
  return {
    normalization: 'rotate-clockwise-90',
    png: rotatePngClockwise(png),
  };
}

function rotatePngClockwise(png) {
  const rotated = new PNG({
    height: png.width,
    width: png.height,
  });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const sourceOffset = ((y * png.width) + x) * 4;
      const destinationX = png.height - 1 - y;
      const destinationY = x;
      const destinationOffset = (
        (destinationY * rotated.width) + destinationX
      ) * 4;
      png.data.copy(
        rotated.data,
        destinationOffset,
        sourceOffset,
        sourceOffset + 4
      );
    }
  }
  return rotated;
}

function writeDeviceCaptureManifest({
  outputRoot,
  records,
  sourceCommit,
  story,
  target,
}) {
  const expectedFrames = story.frames
    .slice()
    .sort((left, right) => left.order - right.order);
  const ordered = records
    .slice()
    .sort((left, right) => left.order - right.order);
  if (
    ordered.length !== expectedFrames.length
    || ordered.some((record, index) =>
      record.captureId !== expectedFrames[index].captureId
      || record.order !== expectedFrames[index].order
    )
  ) {
    throw new Error(
      `Marketing ${target.deviceFamily} manifest must contain the approved six-frame order.`
    );
  }
  if (ordered.some((record) => record.sourceCommit !== sourceCommit)) {
    throw new Error('Marketing capture records must share one source commit.');
  }

  const manifest = {
    schemaVersion: 1,
    storyId: story.storyId,
    contractIssue: story.issue,
    contractSchemaVersion: story.schemaVersion,
    captureClock: {
      ...story.captureClock,
    },
    sourceBuild: {
      ...story.sourceBuild,
      sourceCommit,
    },
    target: {
      deviceFamily: target.deviceFamily,
      deviceName: target.deviceName,
      displayGroup: target.displayGroup,
      orientation: target.orientation,
    },
    frames: ordered,
  };
  mkdirSync(outputRoot, { recursive: true });
  const manifestPath = resolve(
    outputRoot,
    `manifest-${target.deviceFamily}.json`
  );
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}

function writeCombinedCaptureManifest({
  acceptedSizesByFamily,
  outputRoot,
  story,
}) {
  const families = ['iphone', 'ipad'];
  const manifests = Object.fromEntries(families.map((deviceFamily) => {
    const manifestPath = resolve(outputRoot, `manifest-${deviceFamily}.json`);
    if (!existsSync(manifestPath)) {
      throw new Error(`Missing marketing ${deviceFamily} manifest at ${manifestPath}.`);
    }
    return [
      deviceFamily,
      JSON.parse(readFileSync(manifestPath, 'utf8')),
    ];
  }));
  const sourceCommits = new Set(
    families.map((deviceFamily) =>
      manifests[deviceFamily].sourceBuild?.sourceCommit
    )
  );
  if (
    sourceCommits.size !== 1
    || !/^[0-9a-f]{40}$/.test([...sourceCommits][0] ?? '')
  ) {
    throw new Error(
      'Marketing iPhone and iPad manifests must share one full source commit.'
    );
  }
  const sourceCommit = [...sourceCommits][0];
  const expectedFrames = story.frames
    .slice()
    .sort((left, right) => left.order - right.order);

  for (const deviceFamily of families) {
    assertDeviceManifest({
      deviceFamily,
      manifest: manifests[deviceFamily],
      outputRoot,
      sourceCommit,
      story,
      acceptedSizes: acceptedSizesByFamily?.[deviceFamily],
    });
  }

  const manifest = {
    schemaVersion: 1,
    storyId: story.storyId,
    contractIssue: story.issue,
    contractSchemaVersion: story.schemaVersion,
    locale: story.locale,
    captureClock: {
      ...story.captureClock,
    },
    sourceBuild: {
      ...story.sourceBuild,
      sourceCommit,
    },
    targets: Object.fromEntries(families.map((deviceFamily) => [
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
      captures: Object.fromEntries(families.map((deviceFamily) => [
        deviceFamily,
        manifests[deviceFamily].frames.find(
          (record) => record.captureId === frame.captureId
        ),
      ])),
    })),
  };
  const manifestPath = resolve(outputRoot, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}

function assertDeviceManifest({
  deviceFamily,
  manifest,
  outputRoot,
  sourceCommit,
  story,
  acceptedSizes,
}) {
  const contract = story.deviceTargets[deviceFamily];
  if (
    manifest.schemaVersion !== 1
    || manifest.storyId !== story.storyId
    || manifest.contractIssue !== story.issue
    || manifest.contractSchemaVersion !== story.schemaVersion
    || manifest.sourceBuild?.sourceCommit !== sourceCommit
    || manifest.target?.deviceFamily !== deviceFamily
    || manifest.target?.displayGroup !== contract.displayGroup
    || manifest.target?.orientation !== contract.primaryOrientation
  ) {
    throw new Error(
      `Marketing ${deviceFamily} manifest does not match the approved story contract.`
    );
  }
  const expectedFrames = story.frames
    .slice()
    .sort((left, right) => left.order - right.order);
  const frames = manifest.frames ?? [];
  if (
    frames.length !== expectedFrames.length
    || frames.some((record, index) =>
      record.order !== expectedFrames[index].order
      || record.frameId !== expectedFrames[index].id
      || record.captureId !== expectedFrames[index].captureId
      || record.copyKey !== expectedFrames[index].copyKey
      || record.locale !== story.locale
      || record.deviceFamily !== deviceFamily
      || record.deviceName !== manifest.target.deviceName
      || record.displayGroup !== contract.displayGroup
      || record.orientation !== contract.primaryOrientation
      || record.sourceCommit !== sourceCommit
    )
  ) {
    throw new Error(
      `Marketing ${deviceFamily} manifest must contain the approved six-frame order.`
    );
  }
  const target = {
    ...manifest.target,
    acceptedSizes: acceptedSizes ?? (
      deviceFamily === 'iphone'
        ? IPHONE_6_9_PORTRAIT_SIZES
        : contract.acceptedExportSizes
    ),
  };
  for (const record of frames) {
    const artifactPath = resolveCaptureArtifactPath(outputRoot, record.file);
    if (!existsSync(artifactPath)) {
      throw new Error(`Missing marketing raw capture ${record.file}.`);
    }
    const fileBuffer = readFileSync(artifactPath);
    const png = PNG.sync.read(fileBuffer);
    assertCaptureDimensions(png, target);
    if (
      record.pixelDimensions?.width !== png.width
      || record.pixelDimensions?.height !== png.height
    ) {
      throw new Error(
        `Marketing raw capture ${record.file} dimensions do not match its manifest.`
      );
    }
    const sha256 = createHash('sha256').update(fileBuffer).digest('hex');
    if (record.sha256 !== sha256) {
      throw new Error(
        `Marketing raw capture ${record.file} does not match its recorded SHA-256.`
      );
    }
  }
}

function resolveCaptureArtifactPath(outputRoot, recordedPath) {
  if (typeof recordedPath !== 'string' || isAbsolute(recordedPath)) {
    throw new Error('Marketing raw capture paths must be relative.');
  }
  const artifactPath = resolve(outputRoot, recordedPath);
  const relation = relative(resolve(outputRoot), artifactPath);
  if (
    relation === '..'
    || relation.startsWith(`..${sep}`)
    || isAbsolute(relation)
  ) {
    throw new Error(
      `Marketing raw capture path escapes the output root: ${recordedPath}.`
    );
  }
  return artifactPath;
}

function sourceCommitForCapture(repositoryRoot, environment = process.env) {
  const configured = String(environment.CHESSTICIZE_SOURCE_COMMIT ?? '').trim();
  if (configured) {
    if (!/^[0-9a-f]{40}$/.test(configured)) {
      throw new Error('CHESSTICIZE_SOURCE_COMMIT must be a full 40-character SHA.');
    }
    return configured;
  }
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
}

function assertCaptureDimensions(png, target) {
  const orientationMatches = target.orientation === 'portrait'
    ? png.height > png.width
    : png.width > png.height;
  if (!orientationMatches) {
    throw new Error(
      `Marketing ${target.deviceFamily} capture must be ${target.orientation}; `
      + `received ${png.width}x${png.height}.`
    );
  }
  const accepted = target.acceptedSizes.some(
    (size) => size.width === png.width && size.height === png.height
  );
  if (!accepted) {
    throw new Error(
      `Marketing ${target.displayGroup} ${target.orientation} capture has unsupported `
      + `dimensions ${png.width}x${png.height}; expected `
      + target.acceptedSizes.map((size) => `${size.width}x${size.height}`).join(', ')
      + '.'
    );
  }
}

module.exports = {
  IPHONE_6_9_PORTRAIT_SIZES,
  assertCaptureDimensions,
  captureMarketingScreenshot,
  normalizeVerifiedScreenshotOrientation,
  resolveMarketingCaptureTarget,
  rotatePngClockwise,
  sourceCommitForCapture,
  writeCombinedCaptureManifest,
  writeDeviceCaptureManifest,
};
