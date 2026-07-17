#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const {
  renderIOSReleaseVersion,
} = require('../../../scripts/lib/ios-release-version.cjs');

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
