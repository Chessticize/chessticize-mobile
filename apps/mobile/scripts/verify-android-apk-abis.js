#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ANDROID_REQUIREMENTS } = require('./android-requirements');

const EXPECTED_ABIS = ANDROID_REQUIREMENTS.abis;
const STOCKFISH_LIBRARY = 'libstockfish.so';
const REQUIRED_NATIVE_LIBRARIES = ['libappmodules.so', STOCKFISH_LIBRARY];
const MINIMUM_LOAD_ALIGNMENT = 0x4000;

function parseNativeAbis(entries) {
  return [...new Set(
    String(entries)
      .split(/\r?\n/)
      .map((entry) => entry.match(/^lib\/([^/]+)\//)?.[1])
      .filter(Boolean),
  )].sort();
}

function requireSuccessful(result, description) {
  if (result.status !== 0) {
    throw new Error(`${description}: ${result.stderr || result.stdout || result.error || 'command failed'}`);
  }
}

function androidToolPaths(environment = process.env) {
  const sdkRoot = environment.ANDROID_HOME || environment.ANDROID_SDK_ROOT;
  if (!sdkRoot) {
    throw new Error('ANDROID_HOME or ANDROID_SDK_ROOT is required to verify Android native packaging');
  }
  const hostTag = process.platform === 'darwin' ? 'darwin-x86_64' : 'linux-x86_64';
  return {
    zipalign: path.join(sdkRoot, 'build-tools', ANDROID_REQUIREMENTS.buildTools, 'zipalign'),
    readelf: path.join(
      sdkRoot,
      'ndk',
      ANDROID_REQUIREMENTS.ndk,
      'toolchains',
      'llvm',
      'prebuilt',
      hostTag,
      'bin',
      'llvm-readelf',
    ),
  };
}

function parseElfLoadAlignments(output) {
  return String(output)
    .split(/\r?\n/)
    .filter((line) => /^\s*LOAD\s/.test(line))
    .map((line) => line.trim().split(/\s+/).at(-1))
    .map((token) => {
      if (/^0x[0-9a-f]+$/i.test(token)) {
        return Number.parseInt(token, 16);
      }
      const power = token.match(/^2\*\*(\d+)$/)?.[1];
      return power ? 2 ** Number(power) : Number.NaN;
    });
}

function verifyApk(apkPath, run = spawnSync, environment = process.env) {
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

  const entries = new Set(String(result.stdout).split(/\r?\n/));
  for (const abi of EXPECTED_ABIS) {
    for (const library of REQUIRED_NATIVE_LIBRARIES) {
      const expectedLibrary = `lib/${abi}/${library}`;
      if (!entries.has(expectedLibrary)) {
        throw new Error(`${apkPath} is missing ${expectedLibrary}`);
      }
    }
  }

  const tools = androidToolPaths(environment);
  requireSuccessful(
    run(tools.zipalign, ['-c', '-P', '16', '-v', '4', apkPath], { encoding: 'utf8' }),
    `${apkPath} does not satisfy 16 KB ZIP alignment`,
  );

  const extractionDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-stockfish-'));
  try {
    for (const abi of EXPECTED_ABIS) {
      const entry = `lib/${abi}/${STOCKFISH_LIBRARY}`;
      const extracted = path.join(extractionDirectory, `${abi}-${STOCKFISH_LIBRARY}`);
      const library = run('unzip', ['-p', apkPath, entry], { encoding: null, maxBuffer: 128 * 1024 * 1024 });
      requireSuccessful(library, `Could not extract ${entry}`);
      fs.writeFileSync(extracted, library.stdout);
      const elf = run(tools.readelf, ['-lW', extracted], { encoding: 'utf8' });
      requireSuccessful(elf, `Could not inspect ELF headers for ${entry}`);
      const alignments = parseElfLoadAlignments(elf.stdout);
      if (alignments.length === 0 || alignments.some((alignment) => alignment < MINIMUM_LOAD_ALIGNMENT)) {
        throw new Error(
          `${entry} has incompatible ELF LOAD alignment: ${alignments.join(', ') || 'none'}; `
          + `expected every segment to be at least 0x4000`,
        );
      }
    }
  } finally {
    fs.rmSync(extractionDirectory, { recursive: true, force: true });
  }
  return actual;
}

if (require.main === module) {
  try {
    const actual = verifyApk(process.argv[2]);
    process.stdout.write(`Android APK ABIs and 16 KB Stockfish packaging verified: ${actual.join(', ')}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  EXPECTED_ABIS,
  MINIMUM_LOAD_ALIGNMENT,
  REQUIRED_NATIVE_LIBRARIES,
  STOCKFISH_LIBRARY,
  androidToolPaths,
  parseElfLoadAlignments,
  parseNativeAbis,
  verifyApk,
};
