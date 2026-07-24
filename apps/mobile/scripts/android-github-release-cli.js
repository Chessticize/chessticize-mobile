#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const {
  createAndroidReleaseIdentity,
  mirrorPlayGeneratedApk,
  publishCorrespondingSource,
} = require('./android-github-release');
const {
  GitHubReleasesClient,
  PlayGeneratedApksClient,
} = require('./android-github-release-clients');

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is missing or malformed: ${error instanceof Error ? error.message : error}`);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith('--')) throw new Error(`Unexpected argument: ${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${name}.`);
    }
    options[name.slice(2)] = value;
    index += 1;
  }
  const operation = options.operation ?? 'publish-source';
  if (!['publish-source', 'mirror-play-apk', 'validate-identity'].includes(operation)) {
    throw new Error('--operation must be publish-source, mirror-play-apk, or validate-identity.');
  }
  options.operation = operation;
  return options;
}

function requiredOption(options, name) {
  const value = options[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`--${name} is required.`);
  }
  return value;
}

function resolveRepoPath(value, repoRoot) {
  return path.resolve(repoRoot, value);
}

function requireDispatchIdentity(options, releaseVersion) {
  const identity = createAndroidReleaseIdentity(releaseVersion);
  if (requiredOption(options, 'public-version') !== identity.publicVersion ||
      Number(requiredOption(options, 'version-code')) !== identity.versionCode) {
    throw new Error('Dispatched public version/build does not match release-version.json.');
  }
  return identity;
}

async function runCli(options, environment = process.env) {
  const repoRoot = path.resolve(__dirname, '../../..');
  const releaseVersionPath = options['release-version-file']
    ? resolveRepoPath(options['release-version-file'], repoRoot)
    : path.join(repoRoot, 'apps/mobile/release-version.json');
  const releaseVersion = readJson(
    releaseVersionPath,
    'release-version.json',
  );
  if (options.operation === 'validate-identity') {
    return requireDispatchIdentity(options, releaseVersion);
  }

  const token = environment.GITHUB_TOKEN;
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('GITHUB_TOKEN with contents: write is required.');
  }

  const sourceManifestPath = resolveRepoPath(
    requiredOption(options, 'source-manifest'),
    repoRoot,
  );
  const sourceManifestBytes = fs.readFileSync(sourceManifestPath);
  const sourceManifest = readJson(sourceManifestPath, 'Source manifest');
  const outputDirectory = resolveRepoPath(
    requiredOption(options, 'output-dir'),
    repoRoot,
  );
  const github = new GitHubReleasesClient({ token });

  const hasDispatchIdentity =
    options['public-version'] !== undefined || options['version-code'] !== undefined;
  if (hasDispatchIdentity) {
    requireDispatchIdentity(options, releaseVersion);
  }

  if (options.operation === 'publish-source') {
    const result = await publishCorrespondingSource({
      releaseVersion,
      sourceManifest,
      sourceManifestBytes,
    }, { github });
    writeJson(path.join(outputDirectory, 'android-source-publication-evidence.json'), result);
    return result;
  }

  const identity = requireDispatchIdentity(options, releaseVersion);
  const playAccessToken = environment.PLAY_ACCESS_TOKEN;
  if (typeof playAccessToken !== 'string' || playAccessToken.trim().length === 0) {
    throw new Error('PLAY_ACCESS_TOKEN is required for the post-Play APK mirror.');
  }
  const appSigningCertificateSha256 = environment.ANDROID_PLAY_APP_SIGNING_CERT_SHA256;
  if (typeof appSigningCertificateSha256 !== 'string' ||
      appSigningCertificateSha256.trim().length === 0) {
    throw new Error('ANDROID_PLAY_APP_SIGNING_CERT_SHA256 is required.');
  }
  const destinationPath = path.join(outputDirectory, identity.apkName);
  const play = new PlayGeneratedApksClient({
    accessToken: playAccessToken,
    destinationPath,
  });
  const result = await mirrorPlayGeneratedApk({
    releaseVersion,
    sourceManifest,
    sourceManifestBytes,
    appSigningCertificateSha256,
  }, { github, play });
  fs.writeFileSync(
    path.join(outputDirectory, identity.checksumName),
    `${result.apk.sha256}  ${identity.apkName}\n`,
    { mode: 0o600 },
  );
  writeJson(path.join(outputDirectory, 'android-apk-mirror-evidence.json'), result);
  return result;
}

async function main() {
  try {
    const result = await runCli(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  parseArguments,
  resolveRepoPath,
  requireDispatchIdentity,
  runCli,
};
