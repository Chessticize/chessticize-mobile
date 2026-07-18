#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const {
  createAndroidReleaseIdentity,
  downloadPlayUniversalApk,
  inspectGeneratedApk,
  measureArtifact,
  prepareBinaryEvidence,
  prepareSourceDraft,
  publishBinaryRelease,
  publishSourceRelease,
  requirePublishedSourceRelease,
  requirePlayReadyInputs,
  verifyGeneratedApkContract,
} = require('./android-github-release');
const {
  GitHubReleasesClient,
  PlayGeneratedApksClient,
} = require('./android-github-release-clients');
const {
  requireDigest,
  requireSafePositiveInteger,
} = require('./android-release-validation');

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
  const phases = new Set([
    'prepare-source-draft',
    'publish-source',
    'prepare-binary',
    'publish-binary',
  ]);
  if (!phases.has(options.phase)) {
    throw new Error('--phase must select one supported protected release phase.');
  }
  return options;
}

function requiredOption(options, name) {
  const value = options[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`--${name} is required for phase ${options.phase}.`);
  }
  return value;
}

function requireDispatchIdentity(options, releaseVersion) {
  const identity = createAndroidReleaseIdentity(releaseVersion);
  if (requiredOption(options, 'public-version') !== identity.publicVersion ||
      Number(requiredOption(options, 'version-code')) !== identity.versionCode) {
    throw new Error('Dispatched public version/build does not match release-version.json.');
  }
  return identity;
}

function retainedWorkflowInput(options, prefix) {
  const runId = Number(requiredOption(options, `${prefix}-run-id`));
  const artifactId = Number(requiredOption(options, `${prefix}-artifact-id`));
  const artifactName = requiredOption(options, `${prefix}-artifact-name`);
  const archiveSha256 = requireDigest(
    requiredOption(options, `${prefix}-archive-sha256`),
    `${prefix} artifact archive digest`,
  );
  requireSafePositiveInteger(runId, `${prefix} workflow run ID`);
  requireSafePositiveInteger(artifactId, `${prefix} workflow artifact ID`);
  return { runId, artifactId, artifactName, archiveSha256 };
}

async function runCli(options, environment = process.env) {
  const repoRoot = path.resolve(__dirname, '../../..');
  const releaseVersion = readJson(
    path.join(repoRoot, 'apps/mobile/release-version.json'),
    'release-version.json',
  );
  const identity = requireDispatchIdentity(options, releaseVersion);
  const outputDirectory = path.resolve(requiredOption(options, 'output-dir'));
  const github = new GitHubReleasesClient({ token: environment.GITHUB_TOKEN });
  const sourceManifestPath = path.resolve(requiredOption(options, 'source-manifest'));
  const sourceManifestBytes = fs.readFileSync(sourceManifestPath);
  const sourceManifest = readJson(sourceManifestPath, 'Source manifest');

  if (options.phase === 'prepare-source-draft') {
    const result = await prepareSourceDraft({
      releaseVersion,
      sourceManifest,
      sourceManifestBytes,
      protectedWorkflow: retainedWorkflowInput(options, 'candidate'),
    }, { github });
    writeJson(path.join(outputDirectory, 'android-source-draft-evidence.json'), result);
    return result;
  }

  if (options.phase === 'publish-source') {
    const result = await publishSourceRelease({
      releaseVersion,
      sourceManifest,
      sourceManifestBytes,
      draftEvidence: readJson(
        path.resolve(requiredOption(options, 'source-draft-evidence')),
        'Source draft evidence',
      ),
      publicationApproved:
        environment.CHESSTICIZE_ANDROID_SOURCE_PUBLICATION_APPROVED === 'true',
    }, { github });
    result.sourceDraftWorkflow = retainedWorkflowInput(options, 'prior');
    writeJson(path.join(outputDirectory, 'android-source-publication-evidence.json'), result);
    return result;
  }

  if (options.phase === 'prepare-binary') {
    const playReady = readJson(
      path.resolve(requiredOption(options, 'play-ready-evidence')),
      'Play-ready evidence',
    );
    const ownerEvidence = readJson(
      path.resolve(requiredOption(options, 'owner-evidence')),
      'Owner evidence',
    );
    const sourcePublicationEvidence = readJson(
      path.resolve(requiredOption(options, 'source-publication-evidence')),
      'Source publication evidence',
    );
    const expected = requirePlayReadyInputs({
      identity,
      sourceManifest,
      playReady,
      ownerEvidence,
    });
    await requirePublishedSourceRelease({
      identity,
      candidate: expected.candidate,
      evidence: sourcePublicationEvidence,
      sourceManifestBytes,
    }, { github });
    const destinationPath = path.join(outputDirectory, identity.apkName);
    const play = new PlayGeneratedApksClient({
      accessToken: environment.PLAY_ACCESS_TOKEN,
      destinationPath,
    });
    const downloaded = await downloadPlayUniversalApk({
      identity,
      appSigningCertificateSha256: expected.appSigningCertificateSha256,
    }, { play });
    const inspection = inspectGeneratedApk(destinationPath, { environment });
    const measurement = measureArtifact(downloaded.apkBytes);
    const verifiedApk = verifyGeneratedApkContract({
      apkBytes: downloaded.apkBytes,
      inspection,
      expected: {
        identity,
        appSigningCertificateSha256: expected.appSigningCertificateSha256,
        minimumBytes: expected.minimumBytes,
        maximumBytes: expected.maximumBytes,
        recordedBytes: expected.recordedBytes,
        expectedSha256: measurement.sha256,
      },
    });
    const prepared = prepareBinaryEvidence({
      releaseVersion,
      candidate: expected.candidate,
      sourcePublicationEvidence,
      playDownloadId: downloaded.downloadId,
      verifiedApk,
      apkBytes: downloaded.apkBytes,
    });
    prepared.evidence.retainedInputs = {
      signedCandidate: retainedWorkflowInput(options, 'candidate'),
      sourcePublication: retainedWorkflowInput(options, 'prior'),
    };
    fs.writeFileSync(
      path.join(outputDirectory, identity.checksumName),
      prepared.files.checksum.bytes,
      { mode: 0o600 },
    );
    writeJson(path.join(outputDirectory, 'android-binary-preparation-evidence.json'), prepared.evidence);
    return prepared.evidence;
  }

  const binaryEvidence = readJson(
    path.resolve(requiredOption(options, 'binary-evidence')),
    'Binary preparation evidence',
  );
  const apkPath = path.resolve(requiredOption(options, 'apk'));
  const checksumBytes = fs.readFileSync(path.resolve(requiredOption(options, 'checksum')));
  const result = await publishBinaryRelease({
    releaseVersion,
    binaryEvidence,
    sourceManifestBytes,
    apkBytes: { path: apkPath },
    checksumBytes,
    apkInspection: inspectGeneratedApk(apkPath, { environment }),
    publicationApproved:
      environment.CHESSTICIZE_ANDROID_BINARY_PUBLICATION_APPROVED === 'true',
  }, { github });
  result.binaryPreparationWorkflow = retainedWorkflowInput(options, 'prior');
  writeJson(path.join(outputDirectory, 'android-binary-publication-evidence.json'), result);
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
  requireDispatchIdentity,
  retainedWorkflowInput,
  runCli,
};
