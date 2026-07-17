#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function renderIOSReleaseVersion(releaseVersion) {
  if (releaseVersion?.schemaVersion !== 1 ||
      typeof releaseVersion?.publicVersion !== 'string' ||
      !/^\d+\.\d+(?:\.\d+)?$/.test(releaseVersion.publicVersion) ||
      !Number.isSafeInteger(releaseVersion?.iosBuildNumber) ||
      releaseVersion.iosBuildNumber < 1) {
    throw new Error('apps/mobile/release-version.json has invalid iOS version fields.');
  }
  return `// Generated from apps/mobile/release-version.json. Do not edit.\n` +
    `MARKETING_VERSION = ${releaseVersion.publicVersion}\n` +
    `CURRENT_PROJECT_VERSION = ${releaseVersion.iosBuildNumber}\n`;
}

function main() {
  const mobileRoot = path.resolve(__dirname, '..');
  const releaseVersionPath = path.join(mobileRoot, 'release-version.json');
  const outputPath = path.join(mobileRoot, 'ios', 'Config', 'ReleaseVersion.xcconfig');
  const expected = renderIOSReleaseVersion(
    JSON.parse(fs.readFileSync(releaseVersionPath, 'utf8')),
  );
  if (process.argv.includes('--check')) {
    const actual = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
    if (actual !== expected) {
      throw new Error('iOS release version config is stale; run pnpm --filter ChessticizeMobile version:ios:sync.');
    }
    return;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, expected);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { renderIOSReleaseVersion };
