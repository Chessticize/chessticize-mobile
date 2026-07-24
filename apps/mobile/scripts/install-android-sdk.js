#!/usr/bin/env node

const { spawnSync } = require('child_process');
const {
  ANDROID_REQUIREMENTS,
  androidArtifactSdkPackages,
  androidSdkPackages,
} = require('./android-requirements');

function installAndroidSdk(run = spawnSync, options = {}) {
  const packages = options.artifactOnly
    ? androidArtifactSdkPackages(ANDROID_REQUIREMENTS)
    : androidSdkPackages(ANDROID_REQUIREMENTS);
  const result = run('sdkmanager', packages, { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`sdkmanager failed with exit code ${result.status}`);
  }
  return packages;
}

if (require.main === module) {
  try {
    installAndroidSdk(spawnSync, {
      artifactOnly: process.argv.slice(2).includes('--artifact-only'),
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { installAndroidSdk };
