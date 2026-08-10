#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { hashArtifactPath } = require('./mobile-app-inputs');

const EXACT_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const REQUIRED_R8_OUTPUTS = [
  'configuration.txt',
  'mapping.txt',
  'resources.txt',
  'seeds.txt',
  'usage.txt',
];

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function requireFile(filePath, label) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label} does not exist: ${filePath ?? '<missing>'}`);
  }
  return filePath;
}

function parseZipListing(output) {
  return String(output)
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(\d+)\s+\S+\s+\S+\s+(.+)$/))
    .filter(Boolean)
    .map((match) => ({ bytes: Number(match[1]), path: match[2] }))
    .filter((entry) => Number.isSafeInteger(entry.bytes) && !entry.path.endsWith('/'));
}

function archiveCategory(entryPath) {
  if (/^(?:base\/dex\/)?classes\d*\.dex$/.test(entryPath)) {
    return 'dex';
  }
  if (entryPath === 'resources.arsc' || entryPath === 'base/resources.pb') {
    return 'resourceTable';
  }
  if (/^(?:base\/)?res\//.test(entryPath)) {
    return 'resources';
  }
  if (/^(?:base\/)?lib\//.test(entryPath)) {
    return 'nativeLibraries';
  }
  if (/^(?:base\/)?assets\//.test(entryPath)) {
    return 'assets';
  }
  return 'other';
}

function summarizeArchiveEntries(entries) {
  const uncompressedBytes = {
    dex: 0,
    resourceTable: 0,
    resources: 0,
    nativeLibraries: 0,
    assets: 0,
    other: 0,
  };
  for (const entry of entries) {
    uncompressedBytes[archiveCategory(entry.path)] += entry.bytes;
  }
  return {
    entryCount: entries.length,
    uncompressedBytes,
    largestEntries: [...entries]
      .filter((entry) => entry.bytes > 0)
      .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path))
      .slice(0, 10),
  };
}

function measureArchive(archivePath, run = spawnSync) {
  const result = run('unzip', ['-l', archivePath], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `Could not inspect ${archivePath}: ${String(result.stderr || '').trim()}`,
    );
  }
  const entries = parseZipListing(result.stdout);
  if (entries.length === 0) {
    throw new Error(`Archive contains no measurable entries: ${archivePath}`);
  }
  return {
    bytes: fs.statSync(archivePath).size,
    sha256: sha256(archivePath),
    artifactIdentitySha256: hashArtifactPath(archivePath),
    ...summarizeArchiveEntries(entries),
  };
}

function inspectOptimizationConfiguration(repoRoot) {
  const buildPath = path.join(repoRoot, 'apps/mobile/android/app/build.gradle');
  const propertiesPath = path.join(repoRoot, 'apps/mobile/android/gradle.properties');
  const rulesPath = path.join(repoRoot, 'apps/mobile/android/app/proguard-rules.pro');
  const build = fs.readFileSync(buildPath, 'utf8');
  const properties = fs.readFileSync(propertiesPath, 'utf8');
  const rules = fs.readFileSync(rulesPath, 'utf8');
  const checks = {
    minifyEnabled: build.includes('def enableProguardInReleaseBuilds = true')
      && build.includes('minifyEnabled enableProguardInReleaseBuilds'),
    resourceShrinkingEnabled: build.includes('shrinkResources true'),
    optimizedDefaultRules: build.includes(
      'getDefaultProguardFile("proguard-android-optimize.txt")',
    ),
    optimizedResourceShrinking: /^android\.r8\.optimizedResourceShrinking=true$/m
      .test(properties),
    reactActivityBackFieldKept: rules.includes(
      '-keepclassmembers,allowoptimization class com.facebook.react.ReactActivity',
    ) && rules.includes('mBackPressedCallback;'),
    predictiveBackDelegateKept: rules.includes(
      '-keep,allowoptimization class com.chessticize.mobile.MobilePredictiveBackApi34Delegate',
    ),
    stockfishJniNamesKept: rules.includes(
      '-keepclasseswithmembernames,includedescriptorclasses,allowoptimization class com.chessticize.mobile.NativeStockfishEngineModule',
    ) && rules.includes('native <methods>;'),
    noAppWideKeep: !/-keep[^\n]*class\s+com\.chessticize\.mobile\.\*\*/.test(rules),
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failures.length > 0) {
    throw new Error(`Android R8 configuration checks failed: ${failures.join(', ')}.`);
  }
  return checks;
}

function auditMergedConfiguration(configuration, variant) {
  const audit = {
    appPackageWideKeep: /^-keep[^\n]*class\s+com\.chessticize\.mobile\.\*\*/m
      .test(configuration),
    detoxRulesIncluded: configuration.includes(
      'node_modules/detox/android/detox/proguard-rules-app.pro',
    ),
    nativeTestRulesIncluded: configuration.includes(
      'proguard-rules-r8-validation.pro',
    ),
  };
  if (audit.appPackageWideKeep) {
    throw new Error('Merged R8 configuration contains a package-wide app keep rule.');
  }
  if (variant === 'release' && audit.detoxRulesIncluded) {
    throw new Error('Production R8 configuration contains Detox-only keep rules.');
  }
  if (variant === 'release' && audit.nativeTestRulesIncluded) {
    throw new Error('Production R8 configuration contains native-test-only keep rules.');
  }
  if (variant === 'r8Validation' && !audit.nativeTestRulesIncluded) {
    throw new Error('R8 validation configuration is missing native-test-only keep rules.');
  }
  if (variant === 'r8Validation' && audit.detoxRulesIncluded) {
    throw new Error('R8 validation configuration contains Detox-only keep rules.');
  }
  return audit;
}

function inspectR8Outputs(mappingDirectory, variant) {
  const outputs = {};
  for (const fileName of REQUIRED_R8_OUTPUTS) {
    const filePath = requireFile(
      path.join(mappingDirectory, fileName),
      `R8 ${fileName}`,
    );
    const bytes = fs.statSync(filePath).size;
    if (bytes === 0) {
      throw new Error(`R8 ${fileName} is empty: ${filePath}`);
    }
    outputs[fileName] = { bytes, sha256: sha256(filePath) };
  }

  const mapping = fs.readFileSync(path.join(mappingDirectory, 'mapping.txt'), 'utf8');
  const configuration = fs.readFileSync(
    path.join(mappingDirectory, 'configuration.txt'),
    'utf8',
  );
  if (!/^com\.chessticize\.mobile\.[^ ]+ -> [^:]+:$/m.test(mapping)) {
    throw new Error('R8 mapping does not contain Chessticize application classes.');
  }
  if (!/^com\.chessticize\.mobile\.[^ ]+ -> (?!com\.chessticize\.mobile\.)[^:]+:$/m
    .test(mapping)) {
    throw new Error('R8 mapping does not prove that application code was obfuscated.');
  }
  for (const boundary of [
    'com.facebook.react.ReactActivity',
    'com.chessticize.mobile.MobilePredictiveBackApi34Delegate',
    'com.chessticize.mobile.NativeStockfishEngineModule',
  ]) {
    if (!configuration.includes(boundary)) {
      throw new Error(`Merged R8 configuration is missing ${boundary}.`);
    }
  }
  return { audit: auditMergedConfiguration(configuration, variant), outputs };
}

function readToolchain(repoRoot, run = spawnSync) {
  const versionsPath = path.join(
    repoRoot,
    'apps/mobile/node_modules/@react-native/gradle-plugin/gradle/libs.versions.toml',
  );
  const wrapperPath = path.join(
    repoRoot,
    'apps/mobile/android/gradle/wrapper/gradle-wrapper.properties',
  );
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const versions = fs.readFileSync(versionsPath, 'utf8');
  const wrapper = fs.readFileSync(wrapperPath, 'utf8');
  const agpVersion = versions.match(/^agp\s*=\s*"([^"]+)"$/m)?.[1];
  const gradleVersion = wrapper.match(/gradle-([0-9.]+)-(?:all|bin)\.zip/)?.[1];
  const java = run('java', ['-version'], { encoding: 'utf8' });
  if (java.status !== 0 || !agpVersion || !gradleVersion) {
    throw new Error('Could not resolve the Android R8 toolchain identity.');
  }
  return {
    androidGradlePlugin: agpVersion,
    gradle: gradleVersion,
    java: String(java.stderr || java.stdout).split(/\r?\n/)[0],
    node: process.version,
    packageManager: packageJson.packageManager,
  };
}

function runGit(repoRoot, args, run = spawnSync) {
  const result = run('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr || '').trim()}`);
  }
  return String(result.stdout || '').trim();
}

function createR8Evidence({
  allowDirty = false,
  apkPath,
  buildDurationMs,
  bundlePath,
  mappingDirectory,
  outputPath,
  repoRoot,
  run = spawnSync,
  sourceSha,
  variant,
}) {
  if (!variant) {
    throw new Error('Android R8 evidence requires --variant <name>.');
  }
  const currentHead = runGit(repoRoot, ['rev-parse', 'HEAD'], run).toLowerCase();
  const exactSourceSha = (sourceSha || currentHead).toLowerCase();
  if (!EXACT_SHA_PATTERN.test(exactSourceSha)) {
    throw new Error('Android R8 evidence requires an exact 40-character source SHA.');
  }
  if (exactSourceSha !== currentHead) {
    throw new Error(
      `Android R8 evidence source ${exactSourceSha} does not match checkout ${currentHead}.`,
    );
  }
  const trackedStatus = runGit(
    repoRoot,
    ['status', '--porcelain', '--untracked-files=no'],
    run,
  );
  if (trackedStatus && !allowDirty) {
    throw new Error('Refusing Android R8 evidence from a dirty tracked worktree.');
  }
  if (!apkPath && !bundlePath) {
    throw new Error('Android R8 evidence requires --apk, --bundle, or both.');
  }
  if (buildDurationMs !== undefined
    && (!Number.isSafeInteger(buildDurationMs) || buildDurationMs <= 0)) {
    throw new Error('--build-duration-ms must be a positive integer.');
  }

  const optimization = inspectOptimizationConfiguration(repoRoot);
  const { audit: mergedConfiguration, outputs: r8Outputs } = inspectR8Outputs(
    mappingDirectory,
    variant,
  );
  const artifacts = {};
  if (apkPath) {
    artifacts.apk = measureArchive(requireFile(apkPath, 'Optimized APK'), run);
  }
  if (bundlePath) {
    artifacts.bundle = measureArchive(requireFile(bundlePath, 'Optimized AAB'), run);
  }

  const evidence = {
    schemaVersion: 1,
    profile: 'r8-optimized',
    sourceSha: exactSourceSha,
    checkoutSha: currentHead,
    worktreeClean: !trackedStatus,
    variant,
    optimization,
    toolchain: readToolchain(repoRoot, run),
    artifacts,
    mergedConfiguration,
    r8Outputs,
    ...(buildDurationMs === undefined ? {} : { buildDurationMs }),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

function parseArguments(argv) {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const result = { allowDirty: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--allow-dirty') {
      result.allowDirty = true;
      continue;
    }
    const value = args[index + 1];
    if (!value) {
      throw new Error(`${argument} requires a value.`);
    }
    if (argument === '--apk') {
      result.apk = value;
    } else if (argument === '--bundle') {
      result.bundle = value;
    } else if (argument === '--build-duration-ms') {
      result.buildDurationMs = Number(value);
    } else if (argument === '--mapping-dir') {
      result.mappingDirectory = value;
    } else if (argument === '--output') {
      result.output = value;
    } else if (argument === '--source-sha') {
      result.sourceSha = value;
    } else if (argument === '--variant') {
      result.variant = value;
    } else {
      throw new Error(`Unknown Android R8 evidence argument ${argument}.`);
    }
    index += 1;
  }
  for (const required of ['mappingDirectory', 'output', 'variant']) {
    if (!result[required]) {
      throw new Error(`Android R8 evidence requires --${required.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}.`);
    }
  }
  return result;
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const repoRoot = path.resolve(__dirname, '../../..');
  return createR8Evidence({
    allowDirty: options.allowDirty,
    apkPath: options.apk && path.resolve(repoRoot, options.apk),
    buildDurationMs: options.buildDurationMs,
    bundlePath: options.bundle && path.resolve(repoRoot, options.bundle),
    mappingDirectory: path.resolve(repoRoot, options.mappingDirectory),
    outputPath: path.resolve(repoRoot, options.output),
    repoRoot,
    sourceSha: options.sourceSha,
    variant: options.variant,
  });
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  REQUIRED_R8_OUTPUTS,
  auditMergedConfiguration,
  archiveCategory,
  createR8Evidence,
  inspectOptimizationConfiguration,
  inspectR8Outputs,
  measureArchive,
  parseArguments,
  parseZipListing,
  summarizeArchiveEntries,
};
