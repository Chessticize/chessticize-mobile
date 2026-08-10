#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const EXACT_SHA_PATTERN = /^[0-9a-f]{40}$/i;

const TEST_RUNNER_PREFIXES = [
  '.codex/skills/chessticize-mobile-local-e2e/scripts/',
  '.codex/skills/chessticize-mobile-ui-calibration/scripts/',
  '.codex/skills/chessticize-release-delta-qa/scripts/',
  'apps/cli/test/',
  'apps/mobile/__tests__/',
  'apps/mobile/e2e/',
  'apps/mobile/native/stockfish/Bridge/tests/',
  'apps/mobile-lab/',
];

const TEST_RUNNER_PATHS = new Set([
  'apps/mobile/scripts/android-adaptive-layout-evidence.sh',
  'apps/mobile/scripts/android-progress-backup-api30-restore-evidence.sh',
  'apps/mobile/scripts/android-progress-backup-evidence.sh',
  'apps/mobile/scripts/android-progress-backup-policy-evidence.sh',
  'apps/mobile/scripts/android-progress-backup-restore-evidence.sh',
  'apps/mobile/scripts/android-review-reminder-native-evidence.sh',
  'apps/mobile/scripts/android-r8-evidence.js',
  'apps/mobile/scripts/android-runtime-benchmark.js',
  'apps/mobile/scripts/android-test-for-detox.sh',
  'apps/mobile/scripts/android-validation-matrix.js',
  'apps/mobile/scripts/install-android-detox-apks.sh',
  'apps/mobile/scripts/prepare-android-offline-e2e.sh',
  'apps/mobile/scripts/run-command-with-timeout.js',
  'scripts/validate-development-process.mjs',
]);

const RECORD_ONLY_PATHS = new Set([
  '.github/pull_request_template.md',
  'AGENTS.md',
]);

function assertExactSha(value, label) {
  if (!EXACT_SHA_PATTERN.test(value ?? '')) {
    throw new Error(`${label} must be an exact 40-character commit SHA.`);
  }
  return value.toLowerCase();
}

function classifyMobileInputPath(relativePath) {
  if (TEST_RUNNER_PATHS.has(relativePath)
    || TEST_RUNNER_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) {
    return 'test-runner';
  }
  if (RECORD_ONLY_PATHS.has(relativePath)
    || (relativePath.startsWith('docs/')
      && (relativePath.endsWith('.md')
        || relativePath.endsWith('.png')
        || relativePath.endsWith('.example.json')))
    || (relativePath.startsWith('apps/mobile/docs/')
      && relativePath.endsWith('.md'))
    || (relativePath.startsWith('.codex/')
      && (relativePath.endsWith('/SKILL.md')
        || /\/agents\/[^/]+\.yaml$/.test(relativePath)
        || /\/references\/[^/]+\.md$/.test(relativePath)))) {
    return 'record-only';
  }
  return 'app-build';
}

function runGit(repoRoot, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: options.encoding ?? 'utf8',
  });
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf8')
      : String(result.stderr || '');
    throw new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`);
  }
  return result.stdout;
}

function listTreeEntries(repoRoot, commitSha) {
  const output = runGit(
    repoRoot,
    ['ls-tree', '-r', '-z', '--full-tree', commitSha],
    { encoding: 'buffer' },
  );
  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const tabIndex = entry.indexOf('\t');
      if (tabIndex < 0) {
        throw new Error(`Malformed git tree entry: ${entry}`);
      }
      const metadata = entry.slice(0, tabIndex);
      const relativePath = entry.slice(tabIndex + 1);
      return { metadata, relativePath };
    });
}

function computeAppInputDigest(repoRoot, commitSha) {
  const normalizedSha = assertExactSha(commitSha, 'App source SHA');
  const hash = crypto.createHash('sha256');
  const appEntries = listTreeEntries(repoRoot, normalizedSha)
    .filter(({ relativePath }) => classifyMobileInputPath(relativePath) === 'app-build')
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  for (const { metadata, relativePath } of appEntries) {
    hash.update(`${metadata}\t${relativePath}\0`);
  }
  return hash.digest('hex');
}

function changedPathsBetween(repoRoot, appSourceSha, testRunnerSha) {
  const output = runGit(
    repoRoot,
    ['diff', '--name-only', '-z', '--no-renames', appSourceSha, testRunnerSha],
    { encoding: 'buffer' },
  );
  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort();
}

function compareMobileAppInputs({ appSourceSha, repoRoot, testRunnerSha }) {
  const normalizedAppSourceSha = assertExactSha(appSourceSha, 'App source SHA');
  const normalizedTestRunnerSha = assertExactSha(testRunnerSha, 'Test runner SHA');
  const ancestry = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', normalizedAppSourceSha, normalizedTestRunnerSha],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (ancestry.status !== 0) {
    throw new Error(
      `App source ${normalizedAppSourceSha} must be an ancestor of test runner ${normalizedTestRunnerSha}.`,
    );
  }

  const appSourceDigest = computeAppInputDigest(repoRoot, normalizedAppSourceSha);
  const testRunnerDigest = computeAppInputDigest(repoRoot, normalizedTestRunnerSha);
  const classifiedChanges = changedPathsBetween(
    repoRoot,
    normalizedAppSourceSha,
    normalizedTestRunnerSha,
  ).map((relativePath) => ({
    path: relativePath,
    category: classifyMobileInputPath(relativePath),
  }));
  const changedAppInputs = classifiedChanges
    .filter(({ category }) => category === 'app-build')
    .map(({ path: relativePath }) => relativePath);

  if (appSourceDigest !== testRunnerDigest || changedAppInputs.length > 0) {
    const details = changedAppInputs.length > 0
      ? ` Changed App build inputs: ${changedAppInputs.join(', ')}.`
      : '';
    throw new Error(
      `App build inputs differ between ${normalizedAppSourceSha} and ${normalizedTestRunnerSha}.${details}`,
    );
  }

  return {
    schemaVersion: 1,
    appSourceSha: normalizedAppSourceSha,
    testRunnerSha: normalizedTestRunnerSha,
    appInputDigest: appSourceDigest,
    appBuildInputsUnchanged: true,
    classifiedChanges,
  };
}

function hashArtifactPath(artifactPath) {
  const resolvedPath = path.resolve(artifactPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Artifact does not exist: ${resolvedPath}`);
  }
  const hash = crypto.createHash('sha256');

  function append(currentPath, relativePath) {
    const stat = fs.lstatSync(currentPath);
    const normalizedRelativePath = relativePath.split(path.sep).join('/');
    if (stat.isSymbolicLink()) {
      hash.update(`link\t${normalizedRelativePath}\t${fs.readlinkSync(currentPath)}\0`);
      return;
    }
    if (stat.isDirectory()) {
      hash.update(`dir\t${normalizedRelativePath}\0`);
      for (const child of fs.readdirSync(currentPath).sort()) {
        append(path.join(currentPath, child), path.join(relativePath, child));
      }
      return;
    }
    if (!stat.isFile()) {
      throw new Error(`Unsupported artifact entry: ${currentPath}`);
    }
    hash.update(`file\t${normalizedRelativePath}\t${stat.mode & 0o777}\t${stat.size}\0`);
    hash.update(fs.readFileSync(currentPath));
  }

  append(resolvedPath, path.basename(resolvedPath));
  return hash.digest('hex');
}

function writeJson(outputPath, value) {
  const resolvedPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(value, null, 2)}\n`);
}

function recordArtifactManifest({
  appSourceSha,
  artifactPath,
  outputPath,
  repoRoot,
}) {
  const normalizedAppSourceSha = assertExactSha(appSourceSha, 'App source SHA');
  const currentHead = String(runGit(repoRoot, ['rev-parse', 'HEAD'])).trim().toLowerCase();
  if (currentHead !== normalizedAppSourceSha) {
    throw new Error(
      `Artifact source ${normalizedAppSourceSha} does not match checkout ${currentHead}.`,
    );
  }
  const manifest = {
    schemaVersion: 1,
    appSourceSha: normalizedAppSourceSha,
    appInputDigest: computeAppInputDigest(repoRoot, normalizedAppSourceSha),
    artifactName: path.basename(path.resolve(artifactPath)),
    artifactSha256: hashArtifactPath(artifactPath),
  };
  writeJson(outputPath, manifest);
  return manifest;
}

function verifyArtifactReuse({
  appSourceSha,
  artifactPath,
  manifestPath,
  outputPath,
  repoRoot,
  testRunnerSha,
}) {
  const comparison = compareMobileAppInputs({
    appSourceSha,
    repoRoot,
    testRunnerSha,
  });
  const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
  if (manifest.schemaVersion !== 1
    || manifest.appSourceSha !== comparison.appSourceSha
    || manifest.appInputDigest !== comparison.appInputDigest) {
    throw new Error('Artifact manifest does not match the requested App source inputs.');
  }
  const artifactSha256 = hashArtifactPath(artifactPath);
  if (manifest.artifactSha256 !== artifactSha256) {
    throw new Error('Artifact bytes differ from the recorded build manifest.');
  }
  const evidence = {
    ...comparison,
    artifactName: manifest.artifactName,
    artifactSha256,
    artifactBytesUnchanged: true,
  };
  writeJson(outputPath, evidence);
  return evidence;
}

function parseCliArgs(args) {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args;
  const [command, ...rest] = normalizedArgs;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    const value = rest[index + 1];
    if (!argument.startsWith('--')
      || index + 1 >= rest.length
      || value.startsWith('--')) {
      throw new Error(`Invalid mobile App input argument ${argument}.`);
    }
    const optionName = argument.slice(2);
    if (Object.hasOwn(options, optionName)) {
      throw new Error(`Duplicate mobile App input option --${optionName}.`);
    }
    options[optionName] = value;
    index += 1;
  }
  return { command, options };
}

function assertOnlyOptions(options, allowedOptions) {
  const unknownOptions = Object.keys(options)
    .filter((option) => !allowedOptions.includes(option));
  if (unknownOptions.length > 0) {
    throw new Error(
      `Unknown mobile App input option${unknownOptions.length === 1 ? '' : 's'}: `
      + unknownOptions.map((option) => `--${option}`).join(', '),
    );
  }
}

function requiredOption(options, name) {
  if (!options[name]) {
    throw new Error(`Set --${name} for mobile App input verification.`);
  }
  return options[name];
}

function runCli(args = process.argv.slice(2)) {
  const { command, options } = parseCliArgs(args);
  const repoRoot = path.resolve(__dirname, '../../..');
  if (command === 'compare') {
    assertOnlyOptions(options, ['app-source-sha', 'test-runner-sha', 'output']);
    const evidence = compareMobileAppInputs({
      appSourceSha: requiredOption(options, 'app-source-sha'),
      repoRoot,
      testRunnerSha: requiredOption(options, 'test-runner-sha'),
    });
    writeJson(requiredOption(options, 'output'), evidence);
    return evidence;
  }
  if (command === 'record-artifact') {
    assertOnlyOptions(options, ['app-source-sha', 'artifact', 'output']);
    return recordArtifactManifest({
      appSourceSha: requiredOption(options, 'app-source-sha'),
      artifactPath: requiredOption(options, 'artifact'),
      outputPath: requiredOption(options, 'output'),
      repoRoot,
    });
  }
  if (command === 'verify-artifact') {
    assertOnlyOptions(
      options,
      ['app-source-sha', 'test-runner-sha', 'artifact', 'manifest', 'output'],
    );
    return verifyArtifactReuse({
      appSourceSha: requiredOption(options, 'app-source-sha'),
      artifactPath: requiredOption(options, 'artifact'),
      manifestPath: requiredOption(options, 'manifest'),
      outputPath: requiredOption(options, 'output'),
      repoRoot,
      testRunnerSha: requiredOption(options, 'test-runner-sha'),
    });
  }
  throw new Error(`Unknown mobile App input command ${command || '(missing)'}.`);
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
  classifyMobileInputPath,
  compareMobileAppInputs,
  computeAppInputDigest,
  hashArtifactPath,
  parseCliArgs,
  recordArtifactManifest,
  runCli,
  verifyArtifactReuse,
};
