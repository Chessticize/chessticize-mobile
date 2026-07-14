#!/usr/bin/env node

const { spawnSync } = require('child_process');
const { ANDROID_REQUIREMENTS, androidSdkPackages } = require('./android-requirements');

function installAndroidSdk(run = spawnSync) {
  const packages = androidSdkPackages(ANDROID_REQUIREMENTS);
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
    installAndroidSdk();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { installAndroidSdk };
