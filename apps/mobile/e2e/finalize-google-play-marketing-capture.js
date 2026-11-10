#!/usr/bin/env node

const { resolve } = require('node:path');
const story = require('../../../config/app-store-marketing-story-v1.json');
const {
  writeCombinedGooglePlayCaptureManifest,
} = require('./googlePlayMarketingCaptureArtifacts');
const { resolveMarketingCampaign } = require('./marketingCampaign');

function main(environment = process.env) {
  const repositoryRoot = resolve(__dirname, '../../..');
  const outputRoot = resolve(
    environment.CHESSTICIZE_MARKETING_OUTPUT_ROOT
      ?? resolve(repositoryRoot, 'scratch/store-assets/google-play/raw')
  );
  const manifestPath = writeCombinedGooglePlayCaptureManifest({
    outputRoot,
    story: resolveMarketingCampaign(story, environment.CHESSTICIZE_MARKETING_CAMPAIGN),
  });
  process.stdout.write(`Google Play capture manifest: ${manifestPath}\n`);
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
