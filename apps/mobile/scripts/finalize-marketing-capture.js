#!/usr/bin/env node

const { resolve } = require('node:path');
const story = require('../../../config/app-store-marketing-story-v1.json');
const {
  writeCombinedCaptureManifest,
} = require('../e2e/marketingCaptureArtifacts');

function main(environment = process.env) {
  const repositoryRoot = resolve(__dirname, '../../..');
  const outputRoot = resolve(
    environment.CHESSTICIZE_MARKETING_OUTPUT_ROOT
      ?? resolve(repositoryRoot, 'scratch/store-assets/marketing/raw')
  );
  const manifestPath = writeCombinedCaptureManifest({
    outputRoot,
    story,
  });
  process.stdout.write(`Marketing capture manifest: ${manifestPath}\n`);
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
