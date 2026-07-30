#!/usr/bin/env node

const { existsSync, statSync } = require('node:fs');
const { basename, resolve } = require('node:path');
const story = require('../../../config/app-store-marketing-story-v1.json');
const {
  captureMarketingScreenshot,
  sourceCommitForCapture,
} = require('./marketingCaptureArtifacts');
const {
  resolveGooglePlayArtifactIdentity,
  resolveGooglePlayCaptureTarget,
  writeGooglePlayDeviceCaptureManifest,
} = require('./googlePlayMarketingCaptureArtifacts');

function main(environment = process.env) {
  const repositoryRoot = resolve(__dirname, '../../..');
  const inputRoot = resolveRequiredDirectory(
    environment.CHESSTICIZE_MARKETING_INPUT_ROOT,
    'CHESSTICIZE_MARKETING_INPUT_ROOT'
  );
  const outputRoot = resolve(
    environment.CHESSTICIZE_MARKETING_OUTPUT_ROOT
      ?? resolve(repositoryRoot, 'scratch/store-assets/google-play/raw')
  );
  const sourceCommit = sourceCommitForCapture(repositoryRoot, environment);
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

  const records = story.frames.map((frame) => {
    const screenshotPath = resolve(inputRoot, `${frame.captureId}.png`);
    if (!existsSync(screenshotPath)) {
      throw new Error(
        `Missing public-UI capture ${basename(screenshotPath)} in ${inputRoot}.`
      );
    }
    return captureMarketingScreenshot({
      frame,
      outputRoot,
      screenshotPath,
      sourceCommit,
      story,
      target,
    });
  });
  const manifestPath = writeGooglePlayDeviceCaptureManifest({
    artifact,
    outputRoot,
    records,
    sourceCommit,
    story,
    target,
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

module.exports = { main };
