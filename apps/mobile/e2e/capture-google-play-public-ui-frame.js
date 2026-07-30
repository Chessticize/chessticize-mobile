#!/usr/bin/env node

const { resolve } = require('node:path');
const story = require('../../../config/app-store-marketing-story-v1.json');
const {
  sourceCommitForCapture,
} = require('./marketingCaptureArtifacts');
const {
  captureGooglePlayPublicUiFrame,
  resolveGooglePlayArtifactIdentity,
  resolveGooglePlayCaptureTarget,
} = require('./googlePlayMarketingCaptureArtifacts');

function main(environment = process.env) {
  const repositoryRoot = resolve(__dirname, '../../..');
  const sourceCommit = sourceCommitForCapture(repositoryRoot, environment);
  const captureId = String(
    environment.CHESSTICIZE_MARKETING_CAPTURE_ID ?? ''
  ).trim();
  const frame = story.frames.find(
    (candidate) => candidate.captureId === captureId
  );
  if (!frame) {
    throw new Error(
      'CHESSTICIZE_MARKETING_CAPTURE_ID must name one approved Google Play '
      + 'captureId.'
    );
  }
  const captureRoot = resolveRequiredCaptureRoot(
    environment.CHESSTICIZE_MARKETING_INPUT_ROOT
  );
  const target = resolveGooglePlayCaptureTarget(environment);
  const artifact = resolveGooglePlayArtifactIdentity({
    environment,
    repositoryRoot,
    sourceCommit,
  });
  if (artifact.captureMode !== 'public-ui-exact-artifact') {
    throw new Error(
      'The per-frame ADB command requires '
      + 'CHESSTICIZE_ANDROID_MARKETING_CAPTURE_MODE=public-ui-exact-artifact.'
    );
  }
  const result = captureGooglePlayPublicUiFrame({
    artifact,
    captureRoot,
    environment,
    frame,
    repositoryRoot,
    sourceCommit,
    story,
    target,
  });
  process.stdout.write(
    `Exact Google Play frame: ${result.screenshotPath}\n`
    + `Capture sidecar: ${result.sidecarPath}\n`
  );
}

function resolveRequiredCaptureRoot(value) {
  const configured = String(value ?? '').trim();
  if (!configured) {
    throw new Error('CHESSTICIZE_MARKETING_INPUT_ROOT is required.');
  }
  return resolve(configured);
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
