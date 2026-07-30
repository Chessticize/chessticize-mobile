#!/usr/bin/env node

const { existsSync, statSync } = require('node:fs');
const { resolve } = require('node:path');
const story = require('../../../config/app-store-marketing-story-v1.json');
const {
  captureMarketingScreenshot,
  sourceCommitForCapture,
} = require('./marketingCaptureArtifacts');
const {
  inspectGooglePlayInstalledSession,
  readGooglePlayPublicUiFrame,
  resolveGooglePlayArtifactIdentity,
  resolveGooglePlayCaptureTarget,
  writeGooglePlayDeviceCaptureManifest,
} = require('./googlePlayMarketingCaptureArtifacts');

function recordGooglePlayPublicUiCapture({
  environment = process.env,
  inspectApk,
  repositoryRoot = resolve(__dirname, '../../..'),
  run,
  sourceCommit,
  story: storyContract = story,
}) {
  const inputRoot = resolveRequiredDirectory(
    environment.CHESSTICIZE_MARKETING_INPUT_ROOT,
    'CHESSTICIZE_MARKETING_INPUT_ROOT'
  );
  const outputRoot = resolve(
    environment.CHESSTICIZE_MARKETING_OUTPUT_ROOT
      ?? resolve(repositoryRoot, 'scratch/store-assets/google-play/raw')
  );
  const target = resolveGooglePlayCaptureTarget(environment);
  const artifact = resolveGooglePlayArtifactIdentity({
    environment,
    repositoryRoot,
    sourceCommit,
  });
  if (artifact.captureMode !== 'public-ui-exact-artifact') {
    throw new Error(
      'Public-UI recorder requires '
      + 'CHESSTICIZE_ANDROID_MARKETING_CAPTURE_MODE=public-ui-exact-artifact.'
    );
  }

  const installedSession = inspectGooglePlayInstalledSession({
    artifact,
    environment,
    inspectApk,
    repositoryRoot,
    run,
    target,
  });
  const records = storyContract.frames.map((frame) => {
    const exactFrame = readGooglePlayPublicUiFrame({
      artifact,
      frame,
      inputRoot,
      outputRoot,
      installedSession,
      sourceCommit,
      story: storyContract,
      target,
    });
    return {
      ...captureMarketingScreenshot({
        frame,
        outputRoot,
        screenshotPath: exactFrame.screenshotPath,
        sourceCommit,
        story: storyContract,
        target,
      }),
      captureProvenance: exactFrame.captureProvenance,
    };
  });
  const manifestPath = writeGooglePlayDeviceCaptureManifest({
    artifact,
    installedSession,
    outputRoot,
    records,
    sourceCommit,
    story: storyContract,
    target,
  });
  return manifestPath;
}

function main(environment = process.env) {
  const repositoryRoot = resolve(__dirname, '../../..');
  const manifestPath = recordGooglePlayPublicUiCapture({
    environment,
    repositoryRoot,
    sourceCommit: sourceCommitForCapture(repositoryRoot, environment),
  });
  process.stdout.write(
    `Exact-artifact Google Play device manifest: ${manifestPath}\n`
  );
}

function resolveRequiredDirectory(value, label) {
  const configured = String(value ?? '').trim();
  if (!configured) {
    throw new Error(`${label} is required.`);
  }
  const directory = resolve(configured);
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`${label} is not a directory: ${directory}.`);
  }
  return directory;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}

module.exports = {
  main,
  recordGooglePlayPublicUiCapture,
};
