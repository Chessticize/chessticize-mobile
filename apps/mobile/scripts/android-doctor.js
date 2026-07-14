#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REQUIREMENTS = Object.freeze({
  javaMajor: 17,
  nodeMajor: 22,
  compileSdk: 36,
  targetSdk: 36,
  minSdk: 24,
  buildTools: '36.0.0',
  ndk: '27.1.12297006',
  abis: ['arm64-v8a', 'x86_64'],
});

function parseJavaMajor(output) {
  const match = String(output).match(/version\s+"(\d+)(?:\.(\d+))?/i);
  if (!match) {
    return undefined;
  }
  const first = Number(match[1]);
  return first === 1 && match[2] ? Number(match[2]) : first;
}

function parseNodeMajor(version) {
  const match = String(version).match(/^(?:v)?(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function defaultRun(command, args) {
  return spawnSync(command, args, { encoding: 'utf8' });
}

function firstOutputLine(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || 'completed';
}

function inspectAndroidEnvironment(options = {}) {
  const environment = options.environment || process.env;
  const exists = options.exists || fs.existsSync;
  const canExecute = options.canExecute || ((file) => {
    try {
      fs.accessSync(file, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
  const run = options.run || defaultRun;
  const appDir = options.appDir || path.resolve(__dirname, '..');
  const repoRoot = options.repoRoot || path.resolve(appDir, '../..');
  const nodeVersion = options.nodeVersion || process.versions.node;
  const sdkRoot = environment.ANDROID_HOME || environment.ANDROID_SDK_ROOT;
  const checks = [];

  const add = (id, status, detail) => checks.push({ id, status, detail });
  const nodeMajor = parseNodeMajor(nodeVersion);
  add(
    'node',
    nodeMajor !== undefined && nodeMajor >= REQUIREMENTS.nodeMajor ? 'pass' : 'fail',
    `Node ${nodeVersion}; required major ${REQUIREMENTS.nodeMajor}+`,
  );

  const java = run('java', ['-version']);
  const javaOutput = `${java.stdout || ''}\n${java.stderr || ''}`;
  const javaMajor = java.status === 0 ? parseJavaMajor(javaOutput) : undefined;
  add(
    'java',
    javaMajor !== undefined && javaMajor >= REQUIREMENTS.javaMajor ? 'pass' : 'fail',
    javaMajor === undefined
      ? 'Java was not found or its version could not be read'
      : `Java ${javaMajor}; required major ${REQUIREMENTS.javaMajor}+`,
  );

  add(
    'android-sdk',
    sdkRoot && exists(sdkRoot) ? 'pass' : 'fail',
    sdkRoot || 'Set ANDROID_HOME or ANDROID_SDK_ROOT',
  );

  const sdkPathCheck = (id, relativePath, label) => {
    const fullPath = sdkRoot ? path.join(sdkRoot, relativePath) : undefined;
    add(id, fullPath && exists(fullPath) ? 'pass' : 'fail', `${label}: ${fullPath || 'SDK root unavailable'}`);
    return fullPath;
  };

  sdkPathCheck('platform', `platforms/android-${REQUIREMENTS.compileSdk}/android.jar`, `Android API ${REQUIREMENTS.compileSdk}`);
  sdkPathCheck('build-tools', `build-tools/${REQUIREMENTS.buildTools}`, `Build Tools ${REQUIREMENTS.buildTools}`);
  sdkPathCheck('ndk', `ndk/${REQUIREMENTS.ndk}/source.properties`, `NDK ${REQUIREMENTS.ndk}`);
  const adb = sdkPathCheck('adb', 'platform-tools/adb', 'ADB');
  const emulator = sdkPathCheck('emulator', 'emulator/emulator', 'Android emulator');
  sdkPathCheck('sdkmanager', 'cmdline-tools/latest/bin/sdkmanager', 'SDK manager');

  if (adb && exists(adb)) {
    const result = run(adb, ['version']);
    add('adb-command', result.status === 0 ? 'pass' : 'fail', firstOutputLine(result));
  }

  if (emulator && exists(emulator)) {
    const result = run(emulator, ['-version']);
    add('emulator-command', result.status === 0 ? 'pass' : 'fail', firstOutputLine(result));
    const avds = run(emulator, ['-list-avds']);
    const avdNames = avds.status === 0
      ? String(avds.stdout || '').split(/\r?\n/).map((name) => name.trim()).filter(Boolean)
      : [];
    add(
      'avds',
      avdNames.length > 0 ? 'pass' : 'warn',
      avdNames.length > 0 ? `Installed AVDs: ${avdNames.join(', ')}` : 'No local AVDs found; CI provisions API 24 and API 36 images',
    );
  }

  const gradleWrapper = path.join(appDir, 'android', 'gradlew');
  add(
    'gradle-wrapper',
    exists(gradleWrapper) && canExecute(gradleWrapper) ? 'pass' : 'fail',
    gradleWrapper,
  );

  const reactNativePackage = path.join(appDir, 'node_modules', 'react-native', 'package.json');
  const reactNativeCodegen = path.join(appDir, 'node_modules', '@react-native', 'codegen', 'package.json');
  const reactNativeGradlePlugin = path.join(appDir, 'node_modules', '@react-native', 'gradle-plugin', 'package.json');
  const detoxPackage = path.join(appDir, 'node_modules', 'detox', 'package.json');
  const installedJsBuildDependencies = exists(reactNativePackage)
    && exists(reactNativeCodegen)
    && exists(reactNativeGradlePlugin)
    && exists(detoxPackage);
  add(
    'js-dependencies',
    installedJsBuildDependencies ? 'pass' : 'fail',
    installedJsBuildDependencies
      ? 'React Native, Codegen, the Gradle plugin, and Detox are installed'
      : 'Run pnpm install --frozen-lockfile before Android builds',
  );

  const puzzlePack = path.join(repoRoot, 'fixtures', 'puzzles', 'bundled-core-pack.sqlite');
  add(
    'puzzle-pack',
    exists(puzzlePack) ? 'pass' : 'fail',
    exists(puzzlePack) ? puzzlePack : 'Run pnpm fetch:core-pack before Android builds',
  );

  return {
    ready: checks.every((check) => check.status !== 'fail'),
    requirements: REQUIREMENTS,
    sdkRoot: sdkRoot || null,
    checks,
  };
}

function runDoctor(args = process.argv.slice(2)) {
  const report = inspectAndroidEnvironment();
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    for (const check of report.checks) {
      const marker = check.status === 'pass' ? 'PASS' : check.status === 'warn' ? 'WARN' : 'FAIL';
      process.stdout.write(`[${marker}] ${check.id}: ${check.detail}\n`);
    }
    process.stdout.write(`Android doctor ${report.ready ? 'passed' : 'failed'}.\n`);
  }
  return report.ready ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = runDoctor();
}

module.exports = {
  REQUIREMENTS,
  inspectAndroidEnvironment,
  parseJavaMajor,
  parseNodeMajor,
  runDoctor,
};
