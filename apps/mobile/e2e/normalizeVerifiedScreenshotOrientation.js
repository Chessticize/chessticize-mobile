#!/usr/bin/env node

const {
  readFileSync,
  writeFileSync,
} = require('node:fs');
const { PNG } = require('pngjs');
const {
  normalizeVerifiedScreenshotOrientation,
} = require('./marketingCaptureArtifacts');

function normalizeVerifiedScreenshotFile(filePath, targetOrientation) {
  if (targetOrientation !== 'portrait' && targetOrientation !== 'landscape') {
    throw new Error(
      `Orientation must be portrait or landscape, received ${targetOrientation}.`
    );
  }
  const input = readFileSync(filePath);
  const raw = PNG.sync.read(input);
  const {
    normalization,
    png,
  } = normalizeVerifiedScreenshotOrientation({
    png: raw,
    targetOrientation,
    verifiedLayoutOrientation: true,
  });
  if (normalization !== 'none') {
    writeFileSync(filePath, PNG.sync.write(png));
  }
  return {
    normalization,
    rawHeight: raw.height,
    rawWidth: raw.width,
    outputHeight: png.height,
    outputWidth: png.width,
  };
}

function main() {
  try {
    const [filePath, targetOrientation, ...extra] = process.argv.slice(2);
    if (!filePath || !targetOrientation || extra.length > 0) {
      throw new Error(
        'Usage: normalizeVerifiedScreenshotOrientation.js '
        + '<png-path> <portrait|landscape>'
      );
    }
    const result = normalizeVerifiedScreenshotFile(filePath, targetOrientation);
    process.stdout.write(
      `${result.normalization}: ${result.rawWidth}x${result.rawHeight} -> `
      + `${result.outputWidth}x${result.outputHeight} ${filePath}\n`
    );
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  normalizeVerifiedScreenshotFile,
};
