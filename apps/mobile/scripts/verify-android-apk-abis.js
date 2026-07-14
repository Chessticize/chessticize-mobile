#!/usr/bin/env node

const { spawnSync } = require('child_process');

const EXPECTED_ABIS = Object.freeze(['arm64-v8a', 'x86_64']);

function parseNativeAbis(entries) {
  return [...new Set(
    String(entries)
      .split(/\r?\n/)
      .map((entry) => entry.match(/^lib\/([^/]+)\//)?.[1])
      .filter(Boolean),
  )].sort();
}

function verifyApk(apkPath, run = spawnSync) {
  if (!apkPath) {
    throw new Error('Usage: verify-android-apk-abis.js <apk-path>');
  }
  const result = run('unzip', ['-Z1', apkPath], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Could not inspect ${apkPath}: ${result.stderr || result.error || 'unzip failed'}`);
  }
  const actual = parseNativeAbis(result.stdout);
  if (actual.length === 0) {
    throw new Error(`${apkPath} does not contain native libraries`);
  }
  if (actual.join(',') !== EXPECTED_ABIS.join(',')) {
    throw new Error(`Unexpected Android ABIs in ${apkPath}: ${actual.join(', ') || 'none'}; expected ${EXPECTED_ABIS.join(', ')}`);
  }
  return actual;
}

if (require.main === module) {
  try {
    const actual = verifyApk(process.argv[2]);
    process.stdout.write(`Android APK ABIs verified: ${actual.join(', ')}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  EXPECTED_ABIS,
  parseNativeAbis,
  verifyApk,
};
