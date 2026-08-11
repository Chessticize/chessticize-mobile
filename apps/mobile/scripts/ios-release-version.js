#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const {
  renderIOSDevelopmentVersion,
  renderIOSReleaseVersion,
} = require('../../../scripts/lib/ios-release-version.cjs');

function main() {
  const mobileRoot = path.resolve(__dirname, '..');
  const developmentVersionPath = path.join(mobileRoot, 'development-version.json');
  const releaseVersionPath = path.join(mobileRoot, 'release-version.json');
  const developmentOutputPath = path.join(
    mobileRoot,
    'ios',
    'Config',
    'DevelopmentVersion.xcconfig',
  );
  const releaseOutputPath = path.join(mobileRoot, 'ios', 'Config', 'ReleaseVersion.xcconfig');
  const developmentVersion = JSON.parse(fs.readFileSync(developmentVersionPath, 'utf8'));
  const releaseVersion = JSON.parse(fs.readFileSync(releaseVersionPath, 'utf8'));
  const expectedDevelopment = renderIOSDevelopmentVersion(developmentVersion);
  const expectedRelease = renderIOSReleaseVersion(releaseVersion);
  if (process.argv.includes('--check')) {
    const actualDevelopment = fs.existsSync(developmentOutputPath)
      ? fs.readFileSync(developmentOutputPath, 'utf8')
      : '';
    const actualRelease = fs.existsSync(releaseOutputPath)
      ? fs.readFileSync(releaseOutputPath, 'utf8')
      : '';
    if (
      actualDevelopment !== expectedDevelopment ||
      actualRelease !== expectedRelease
    ) {
      throw new Error('iOS version config is stale; run pnpm --filter ChessticizeMobile version:ios:sync.');
    }
    return;
  }
  fs.mkdirSync(path.dirname(releaseOutputPath), { recursive: true });
  fs.writeFileSync(developmentOutputPath, expectedDevelopment);
  fs.writeFileSync(releaseOutputPath, expectedRelease);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { renderIOSDevelopmentVersion, renderIOSReleaseVersion };
