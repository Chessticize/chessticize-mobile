#!/usr/bin/env node

const { Buffer } = require('node:buffer');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ANDROID_REQUIREMENTS } = require('./android-requirements');
const stockfishArtifacts = require('../stockfish-artifacts.json');
const {
  MINIMUM_LOAD_ALIGNMENT,
  REQUIRED_NATIVE_LIBRARIES,
  androidToolPaths,
  parseElfLoadAlignments,
} = require('./verify-android-apk-abis');

const EXPECTED_ABIS = ANDROID_REQUIREMENTS.abis;
const REQUIRED_NOTICES = [
  'base/assets/licenses/LICENSE',
  'base/assets/licenses/THIRD_PARTY_NOTICES.md',
  'base/assets/licenses/stockfish/COPYING.txt',
  'base/assets/licenses/stockfish/AUTHORS',
];
const REQUIRED_RUNTIME_ASSETS = [
  'base/assets/puzzle-packs/bundled-core-pack.sqlite',
  'base/assets/stockfish/stockfish-artifacts.json',
  ...stockfishArtifacts.nnue.map(
    relativePath => `base/assets/stockfish/${path.basename(relativePath)}`,
  ),
];
const ANDROID_SOURCE_REPOSITORY_URL =
  'https://github.com/Chessticize/chessticize-mobile';
const ANDROID_SOURCE_REPOSITORY_API_URL =
  'https://api.github.com/repos/Chessticize/chessticize-mobile';
const ANDROID_SOURCE_MANIFEST_NAME = 'android-source-manifest.json';
const ANDROID_SOURCE_MANIFEST_ARTIFACT_ENTRY =
  'artifacts/android-release/android-source-manifest.json';
const ANDROID_RELEASE_WORKFLOW_NAME = 'Mobile Android release candidate';
const ANDROID_RELEASE_WORKFLOW_PATH =
  '.github/workflows/mobile-android-release-candidate.yml';
const ANDROID_SOURCE_SUPPORT_PATH = 'docs/ANDROID_PLAY_RELEASE.md';

function createErrorCollector() {
  const errors = [];
  const requireEqual = (actual, expectedValue, label) => {
    if (actual !== expectedValue) {
      errors.push(`${label} is ${JSON.stringify(actual)}; expected ${JSON.stringify(expectedValue)}.`);
    }
  };
  return { errors, requireEqual };
}

function outputBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? ''));
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256FileContents(filePath) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(filePath, 'r');
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, chunk, 0, chunk.length, null);
      if (bytesRead > 0) {
        hash.update(chunk.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

function runGithubCurl(
  run,
  url,
  { token, encoding = 'utf8', maxBuffer, captureHeaders = false } = {},
) {
  const args = [
    '--fail',
    '--silent',
    '--show-error',
    '--header',
    'Accept: application/vnd.github+json',
    '--header',
    'X-GitHub-Api-Version: 2022-11-28',
  ];
  const options = { encoding, ...(maxBuffer ? { maxBuffer } : {}) };
  if (token) {
    args.push('--config', '-');
    options.input = `header = "Authorization: Bearer ${token}"\n`;
  } else {
    args.push('--location');
  }
  if (captureHeaders) {
    args.push('--dump-header', '-', '--output', '/dev/null');
  }
  args.push(url);
  return run('curl', args, options);
}

function requestGithubDownloadRedirect(run, url, token) {
  const result = runGithubCurl(run, url, { token, captureHeaders: true });
  if (result.status !== 0) {
    return { error: 'Protected workflow artifact redirect could not be requested.' };
  }
  const locations = [...String(result.stdout).matchAll(/^location:\s*(\S+)\s*$/gim)];
  const location = locations.at(-1)?.[1];
  let redirect;
  try {
    redirect = new URL(location);
  } catch {
    redirect = undefined;
  }
  if (redirect?.protocol !== 'https:' || redirect.username || redirect.password) {
    return { error: 'Protected workflow artifact did not return a valid HTTPS download redirect.' };
  }
  return { url: redirect.href };
}

function readGithubJson(run, url, label, errors, token) {
  const result = runGithubCurl(run, url, { token });
  if (result.status !== 0) {
    errors.push(`${label} could not be verified through the GitHub API.`);
    return undefined;
  }
  try {
    return JSON.parse(String(result.stdout));
  } catch {
    errors.push(`${label} GitHub API response is malformed.`);
    return undefined;
  }
}

function readZipEntry(run, archivePath, entry) {
  return run('unzip', ['-p', archivePath, entry], {
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function canonicalAndroidSourceTag(versionName, versionCode) {
  const match = String(versionName).match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match || !Number.isSafeInteger(versionCode) || versionCode < 1) {
    throw new Error('Cannot derive the canonical Android source tag.');
  }
  const components = [match[1], match[2], match[3] ?? '0'];
  if (components.some(component => String(Number(component)) !== component)) {
    throw new Error('Cannot derive a source tag from an ambiguous Android version.');
  }
  return `android-v${components.join('.')}-build-${versionCode}`;
}

function normalizeFingerprint(value) {
  const normalized = String(value ?? '').replace(/:/g, '').trim().toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(normalized)) {
    throw new Error('Invalid SHA-256 certificate fingerprint.');
  }
  return normalized;
}

function inspectBundleEntries(entries, { pageAlignment } = {}) {
  const listedEntries = Array.from(entries, String);
  const entrySet = new Set(listedEntries);
  const abis = [...new Set(
    listedEntries
      .map(entry => entry.match(/^base\/lib\/([^/]+)\//)?.[1])
      .filter(Boolean),
  )].sort();
  const errors = [];

  if (abis.join(',') !== [...EXPECTED_ABIS].sort().join(',')) {
    errors.push(
      `AAB ABIs are ${abis.join(', ') || 'none'}; expected ${EXPECTED_ABIS.join(', ')}.`,
    );
  }
  for (const abi of EXPECTED_ABIS) {
    for (const library of REQUIRED_NATIVE_LIBRARIES) {
      const libraryEntry = `base/lib/${abi}/${library}`;
      if (!entrySet.has(libraryEntry)) {
        errors.push(`AAB is missing ${libraryEntry}.`);
      }
      const symbolEntry =
        `BUNDLE-METADATA/com.android.tools.build.debugsymbols/${abi}/${library}.dbg`;
      if (!entrySet.has(symbolEntry)) {
        errors.push(`AAB is missing native debug symbols ${symbolEntry}.`);
      }
    }
  }
  for (const notice of REQUIRED_NOTICES) {
    if (!entrySet.has(notice)) {
      errors.push(`AAB is missing required notice ${notice}.`);
    }
  }
  for (const asset of REQUIRED_RUNTIME_ASSETS) {
    const count = listedEntries.filter(entry => entry === asset).length;
    if (count !== 1) {
      errors.push(`AAB must contain exactly one required runtime asset ${asset}; found ${count}.`);
    }
  }
  if (!String(pageAlignment).includes('PAGE_ALIGNMENT_16K')) {
    errors.push('AAB bundle configuration does not declare PAGE_ALIGNMENT_16K.');
  }

  return { abis, errors };
}

function inspectOwnerEvidence(evidence, expected) {
  const { errors, requireEqual } = createErrorCollector();
  const candidateFields = [
    ['commitSha', 'commit SHA'],
    ['aabSha256', 'AAB SHA-256'],
    ['applicationId', 'application ID'],
    ['versionName', 'version name'],
    ['versionCode', 'version code'],
  ];
  const requireCandidateBinding = (candidate, label) => {
    if (!candidate || typeof candidate !== 'object') {
      errors.push(`${label} must include an exact candidate binding.`);
    }
    for (const [field, fieldLabel] of candidateFields) {
      requireEqual(candidate?.[field], expected[field], `${label} candidate ${fieldLabel}`);
    }
  };
  const requireEvidenceRecord = (record, status, label) => {
    requireEqual(record?.status, status, `${label} status`);
    if (typeof record?.evidenceId !== 'string' || record.evidenceId.trim().length === 0) {
      errors.push(`${label} must include an evidence ID.`);
    }
    let reference;
    try {
      reference = new URL(record?.reference);
    } catch {
      reference = undefined;
    }
    if (reference?.protocol !== 'https:' || !reference.hostname) {
      errors.push(`${label} must include an auditable HTTPS reference.`);
    }
    requireCandidateBinding(record?.candidate, label);
    return record;
  };

  requireEqual(evidence?.schemaVersion, 3, 'Owner evidence schemaVersion');
  requireEqual(evidence?.candidate?.commitSha, expected.commitSha, 'Candidate commit SHA');
  requireEqual(evidence?.candidate?.aabSha256, expected.aabSha256, 'Candidate AAB SHA-256');
  requireEqual(evidence?.candidate?.applicationId, expected.applicationId, 'Candidate application ID');
  requireEqual(evidence?.candidate?.versionName, expected.versionName, 'Candidate version name');
  requireEqual(evidence?.candidate?.versionCode, expected.versionCode, 'Candidate version code');

  const expectedSourceTag = canonicalAndroidSourceTag(
    expected.versionName,
    expected.versionCode,
  );
  const expectedSourceReleaseUrl =
    `${ANDROID_SOURCE_REPOSITORY_URL}/releases/tag/${expectedSourceTag}`;
  const sourceRelease = requireEvidenceRecord(
    evidence?.sourceRelease,
    'published',
    'Public Android source release',
  );
  requireEqual(
    sourceRelease?.repositoryUrl,
    ANDROID_SOURCE_REPOSITORY_URL,
    'Public Android source repository URL',
  );
  requireEqual(
    sourceRelease?.reference,
    expectedSourceReleaseUrl,
    'Public Android source release URL',
  );
  requireEqual(sourceRelease?.tagName, expectedSourceTag, 'Public Android source tag');
  requireEqual(
    sourceRelease?.tagCommitSha,
    expected.commitSha,
    'Public Android source tag commit SHA',
  );
  if (!['annotated', 'signed'].includes(sourceRelease?.tagType)) {
    errors.push('Public Android source tag must be annotated or signed.');
  }
  if (sourceRelease?.published !== true) {
    errors.push('Public Android source release must be published.');
  }
  if (!Number.isSafeInteger(sourceRelease?.releaseId) || sourceRelease.releaseId <= 0) {
    errors.push('Public Android source release must record its GitHub release ID.');
  }
  const sourceManifest = sourceRelease?.sourceManifest;
  requireEqual(sourceManifest?.status, 'retained', 'Source manifest status');
  if (!Number.isSafeInteger(sourceManifest?.releaseAssetId) ||
      sourceManifest.releaseAssetId <= 0) {
    errors.push('Source manifest must record its retained GitHub release artifact ID.');
  }
  requireEqual(
    sourceManifest?.assetName,
    ANDROID_SOURCE_MANIFEST_NAME,
    'Source manifest asset name',
  );
  if (typeof sourceManifest?.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(sourceManifest.sha256)) {
    errors.push('Source manifest must record its SHA-256 digest.');
  }
  const expectedSourceManifestUrl =
    `${ANDROID_SOURCE_REPOSITORY_URL}/releases/download/` +
    `${expectedSourceTag}/${ANDROID_SOURCE_MANIFEST_NAME}`;
  requireEqual(
    sourceManifest?.reference,
    expectedSourceManifestUrl,
    'Retained source manifest URL',
  );
  requireEqual(
    sourceManifest?.releaseId,
    sourceRelease?.releaseId,
    'Source manifest GitHub release ID',
  );
  requireEqual(sourceManifest?.tagName, expectedSourceTag, 'Source manifest tag');
  requireEqual(
    sourceManifest?.commitSha,
    expected.commitSha,
    'Source manifest commit SHA',
  );
  if (!Number.isSafeInteger(sourceManifest?.workflowRunId) ||
      sourceManifest.workflowRunId <= 0) {
    errors.push('Source manifest must record its protected workflow run ID.');
  }
  const expectedWorkflowReference =
    `${ANDROID_SOURCE_REPOSITORY_URL}/actions/runs/${sourceManifest?.workflowRunId}`;
  requireEqual(
    sourceManifest?.workflowRunReference,
    expectedWorkflowReference,
    'Source manifest protected workflow run reference',
  );
  if (!Number.isSafeInteger(sourceManifest?.workflowArtifactId) ||
      sourceManifest.workflowArtifactId <= 0) {
    errors.push('Source manifest must record its protected workflow artifact ID.');
  }
  requireEqual(
    sourceManifest?.workflowArtifactName,
    `android-signed-release-candidate-${expected.commitSha}`,
    'Source manifest protected workflow artifact name',
  );
  requireEqual(
    sourceManifest?.workflowArtifactEntry,
    ANDROID_SOURCE_MANIFEST_ARTIFACT_ENTRY,
    'Source manifest protected workflow artifact entry',
  );
  if (typeof sourceManifest?.workflowArtifactSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(sourceManifest.workflowArtifactSha256)) {
    errors.push('Source manifest must record its protected workflow artifact SHA-256 digest.');
  }
  requireCandidateBinding(sourceManifest?.candidate, 'Source manifest');

  const sourceDisclosure = sourceRelease?.sourceDisclosure;
  requireEqual(
    sourceDisclosure?.releaseNotesReference,
    expectedSourceReleaseUrl,
    'Source release notes reference',
  );
  const expectedSupportReference =
    `https://raw.githubusercontent.com/Chessticize/chessticize-mobile/` +
    `${expected.commitSha}/${ANDROID_SOURCE_SUPPORT_PATH}`;
  const supportDocumentation = requireEvidenceRecord(
    sourceDisclosure?.supportDocumentation,
    'published',
    'Public Android source support documentation',
  );
  requireEqual(
    supportDocumentation?.reference,
    expectedSupportReference,
    'Public Android source support documentation URL',
  );
  if (typeof supportDocumentation?.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(supportDocumentation.sha256)) {
    errors.push('Public Android source support documentation must record its SHA-256 digest.');
  }

  try {
    requireEqual(
      normalizeFingerprint(evidence?.signing?.uploadCertificateSha256),
      normalizeFingerprint(expected.uploadCertificateSha256),
      'Approved upload certificate SHA-256',
    );
  } catch {
    errors.push('Approved upload certificate SHA-256 is missing or malformed.');
  }
  try {
    normalizeFingerprint(evidence?.signing?.appSigningCertificateSha256);
  } catch {
    errors.push('Play app-signing certificate SHA-256 is missing or malformed.');
  }
  const protectedUploadSigning = requireEvidenceRecord(
    evidence?.signing?.protectedUploadSigning,
    'pass',
    'Protected upload-signing workflow',
  );
  if (!Number.isSafeInteger(protectedUploadSigning?.workflowRunId) ||
      protectedUploadSigning.workflowRunId <= 0 ||
      !Number.isSafeInteger(protectedUploadSigning?.artifactId) ||
      protectedUploadSigning.artifactId <= 0) {
    errors.push('Protected upload-signing workflow must record workflow and artifact IDs.');
  }
  requireEqual(
    sourceManifest?.workflowRunId,
    protectedUploadSigning?.workflowRunId,
    'Source manifest protected workflow run ID',
  );
  requireEqual(
    sourceManifest?.workflowRunReference,
    protectedUploadSigning?.reference,
    'Source manifest protected workflow reference',
  );
  requireEqual(
    sourceManifest?.workflowArtifactId,
    protectedUploadSigning?.artifactId,
    'Source manifest protected workflow artifact ID',
  );
  requireEvidenceRecord(
    evidence?.signing?.playAppSigning,
    'enrolled',
    'Play App Signing enrollment',
  );

  for (const [field, label] of [
    ['developerVerification', 'Android developer verification'],
    ['storeListing', 'Play store listing'],
    ['privacyPolicy', 'Play privacy policy'],
    ['dataSafety', 'Play Data safety'],
    ['supportedDevices', 'Play supported-device review'],
  ]) {
    requireEvidenceRecord(
      evidence?.console?.[field],
      field === 'developerVerification' ? 'verified' : 'reviewed',
      label,
    );
  }
  const passingInstallRecords = [
    ['internalInstall', 'internal', 'Internal testing installation'],
    ['closedInstall', 'closed', 'Closed testing installation'],
  ].filter(([field]) => evidence?.testing?.[field]?.status === 'pass');
  if (passingInstallRecords.length === 0) {
    errors.push('An Internal or Closed testing installation must pass.');
  } else {
    for (const [field, track, label] of passingInstallRecords) {
      const record = requireEvidenceRecord(evidence.testing[field], 'pass', label);
      requireEqual(record?.track, track, `${label} track`);
      if (typeof record?.releaseId !== 'string' || record.releaseId.length === 0) {
        errors.push(`${label} must record the Play release ID.`);
      }
    }
  }
  const preLaunch = requireEvidenceRecord(
    evidence?.testing?.preLaunch,
    'pass',
    'Play pre-launch report',
  );
  if (typeof preLaunch?.reportId !== 'string' || preLaunch.reportId.length === 0) {
    errors.push('Play pre-launch report must record the report ID.');
  }
  const androidMatrix = requireEvidenceRecord(
    evidence?.testing?.androidMatrix,
    'pass',
    'Automated Android validation matrix',
  );
  if (!Number.isSafeInteger(androidMatrix?.runId) || androidMatrix.runId <= 0 ||
      !Array.isArray(androidMatrix?.artifactIds) || androidMatrix.artifactIds.length === 0 ||
      androidMatrix.artifactIds.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    errors.push('Automated Android validation matrix must record its run and artifact IDs.');
  }

  const production = requireEvidenceRecord(
    evidence?.production,
    'prepared',
    'Production release draft',
  );
  requireEqual(production?.rolloutPercentage, 100, 'Production rollout percentage');
  if (production?.launched !== false) {
    errors.push('Production must not be launched by issue #186.');
  }
  if (typeof production?.releaseId !== 'string' || production.releaseId.length === 0) {
    errors.push('Production release draft must record the Play release ID.');
  }

  const generatedApkSizes = requireEvidenceRecord(
    evidence?.artifacts?.generatedApkSizes,
    'pass',
    'Generated APK size evidence',
  );
  const largestContributors = generatedApkSizes?.largestContributors;
  if (!Array.isArray(largestContributors) ||
      largestContributors.length === 0 ||
      largestContributors.some(entry =>
        typeof entry?.path !== 'string' ||
        entry.path.length === 0 ||
        !Number.isSafeInteger(entry?.bytes) ||
        entry.bytes <= 0)) {
    errors.push('Largest packaged contributors were not recorded.');
  }
  for (const [field, label] of [
    ['universalApkBytes', 'Universal APK size'],
    ['arm64ApkBytes', 'ARM64 APK size'],
  ]) {
    if (!Number.isSafeInteger(generatedApkSizes?.[field]) || generatedApkSizes[field] <= 0) {
      errors.push(`${label} is missing or invalid.`);
    }
  }
  const expectation = generatedApkSizes?.universalApkExpectation;
  if (!Number.isSafeInteger(expectation?.minimumBytes) ||
      !Number.isSafeInteger(expectation?.maximumBytes) ||
      expectation.minimumBytes <= 0 ||
      expectation.maximumBytes < expectation.minimumBytes ||
      typeof expectation?.approvalReference !== 'string' ||
      !/^https:\/\//.test(expectation.approvalReference)) {
    errors.push('Approved universal-APK size expectation is missing or invalid.');
  } else if (Number.isSafeInteger(generatedApkSizes?.universalApkBytes) &&
      (generatedApkSizes.universalApkBytes < expectation.minimumBytes ||
       generatedApkSizes.universalApkBytes > expectation.maximumBytes)) {
    errors.push('Measured universal APK is outside the approved size expectation.');
  }

  return errors;
}

function inspectPublishedSourceRelease(sourceRelease, expected, dependencies = {}) {
  const run = dependencies.run ?? spawnSync;
  const repoRoot = dependencies.repoRoot ?? path.resolve(__dirname, '../../..');
  const environment = dependencies.environment ?? process.env;
  const { errors, requireEqual } = createErrorCollector();
  const expectedTag = canonicalAndroidSourceTag(expected.versionName, expected.versionCode);
  const runGit = args => run('git', args, { cwd: repoRoot, encoding: 'utf8' });

  const tagObjectType = runGit(['cat-file', '-t', expectedTag]);
  if (tagObjectType.status !== 0) {
    errors.push(`Public Android source tag ${expectedTag} could not be inspected locally.`);
  } else {
    requireEqual(
      String(tagObjectType.stdout).trim(),
      'tag',
      'Public Android source Git object type',
    );
  }

  const tagCommit = runGit(['rev-list', '-n', '1', expectedTag]);
  if (tagCommit.status !== 0) {
    errors.push(`Public Android source tag ${expectedTag} commit could not be resolved locally.`);
  } else {
    requireEqual(
      String(tagCommit.stdout).trim(),
      expected.commitSha,
      'Public Android source tag resolved commit SHA',
    );
  }

  if (sourceRelease?.tagType === 'signed') {
    const tagObject = runGit(['cat-file', 'tag', expectedTag]);
    const signature = /-----BEGIN (?:PGP|SSH) SIGNATURE-----/.test(
      String(tagObject.stdout ?? ''),
    );
    if (tagObject.status !== 0 || !signature) {
      errors.push('Public Android source tag is recorded as signed but has no tag signature.');
    }
  }

  const tagRef = readGithubJson(
    run,
    `${ANDROID_SOURCE_REPOSITORY_API_URL}/git/ref/tags/${encodeURIComponent(expectedTag)}`,
    'Published GitHub tag ref',
    errors,
  );
  if (!tagRef) {
    return errors;
  }
  requireEqual(tagRef?.ref, `refs/tags/${expectedTag}`, 'Published GitHub tag ref name');
  if (tagRef?.object?.type !== 'tag') {
    errors.push('The published GitHub tag ref must target an annotated tag object.');
    return errors;
  }
  if (typeof tagRef?.object?.sha !== 'string' ||
      !/^[0-9a-f]{40}$/i.test(tagRef.object.sha)) {
    errors.push('Published GitHub tag ref has no valid annotated tag object SHA.');
    return errors;
  }

  const publishedTag = readGithubJson(
    run,
    `${ANDROID_SOURCE_REPOSITORY_API_URL}/git/tags/${tagRef.object.sha}`,
    'Published GitHub annotated tag object',
    errors,
  );
  if (!publishedTag) {
    return errors;
  }
  requireEqual(publishedTag?.tag, expectedTag, 'Published GitHub annotated tag name');
  requireEqual(
    publishedTag?.object?.type,
    'commit',
    'Published GitHub annotated tag target type',
  );
  requireEqual(
    publishedTag?.object?.sha,
    expected.commitSha,
    'Published GitHub annotated tag commit SHA',
  );
  if (sourceRelease?.tagType === 'signed' && publishedTag?.verification?.verified !== true) {
    errors.push('Published GitHub source tag is recorded as signed but is not verified by GitHub.');
  }

  const releaseApiUrl =
    `${ANDROID_SOURCE_REPOSITORY_API_URL}/releases/${sourceRelease?.releaseId}`;
  const release = readGithubJson(
    run,
    releaseApiUrl,
    'Public Android source release',
    errors,
  );
  if (!release) {
    return errors;
  }

  requireEqual(release?.id, sourceRelease?.releaseId, 'Published GitHub release ID');
  requireEqual(release?.html_url, sourceRelease?.reference, 'Published GitHub release URL');
  requireEqual(release?.tag_name, expectedTag, 'Published GitHub release tag');
  if (release?.draft !== false ||
      typeof release?.published_at !== 'string' ||
      !Number.isFinite(Date.parse(release.published_at))) {
    errors.push('Public Android source release is not a published non-draft GitHub release.');
  }
  const releaseBody = String(release?.body ?? '');
  if (!releaseBody.includes(expectedTag) ||
      !releaseBody.includes(ANDROID_SOURCE_REPOSITORY_URL)) {
    errors.push('Published GitHub release notes must disclose the exact source tag and repository URL.');
  }

  const sourceManifest = sourceRelease?.sourceManifest;
  const releaseAsset = Array.isArray(release?.assets)
    ? release.assets.find(asset => asset?.id === sourceManifest?.releaseAssetId)
    : undefined;
  if (!releaseAsset) {
    errors.push('Retained source manifest is not present in the published GitHub release.');
    return errors;
  }
  requireEqual(
    releaseAsset.name,
    sourceManifest.assetName,
    'Published source manifest asset name',
  );
  requireEqual(
    releaseAsset.browser_download_url,
    sourceManifest.reference,
    'Published source manifest asset URL',
  );
  requireEqual(releaseAsset.state, 'uploaded', 'Published source manifest asset state');
  requireEqual(
    String(releaseAsset.digest ?? '').toLowerCase(),
    `sha256:${sourceManifest.sha256.toLowerCase()}`,
    'Published source manifest asset digest',
  );

  const sourceManifestResult = run('curl', [
    '--fail',
    '--location',
    '--silent',
    '--show-error',
    sourceManifest.reference,
  ], { encoding: null, maxBuffer: 16 * 1024 * 1024 });
  if (sourceManifestResult.status !== 0) {
    errors.push('Retained source manifest could not be downloaded from the GitHub release.');
    return errors;
  }
  const sourceManifestBytes = outputBuffer(sourceManifestResult.stdout);
  requireEqual(
    sha256Bytes(sourceManifestBytes),
    sourceManifest.sha256.toLowerCase(),
    'Downloaded source manifest SHA-256',
  );

  let downloadedSourceManifest;
  try {
    downloadedSourceManifest = JSON.parse(sourceManifestBytes.toString('utf8'));
  } catch {
    errors.push('Downloaded source manifest is malformed JSON.');
    return errors;
  }
  requireEqual(
    downloadedSourceManifest?.schemaVersion,
    1,
    'Downloaded source manifest schemaVersion',
  );
  requireEqual(
    downloadedSourceManifest?.status,
    'artifact-only',
    'Downloaded source manifest verifier status',
  );
  requireEqual(
    downloadedSourceManifest?.commitSha,
    expected.commitSha,
    'Downloaded source manifest commit SHA',
  );
  requireEqual(
    downloadedSourceManifest?.worktreeClean,
    true,
    'Downloaded source manifest clean-worktree result',
  );
  for (const [field, label] of [
    ['sha256', 'AAB SHA-256'],
    ['applicationId', 'application ID'],
    ['versionName', 'version name'],
    ['versionCode', 'version code'],
  ]) {
    const expectedField = field === 'sha256' ? expected.aabSha256 : expected[field];
    requireEqual(
      downloadedSourceManifest?.bundle?.[field],
      expectedField,
      `Downloaded source manifest ${label}`,
    );
  }

  const githubToken = environment.CHESSTICIZE_GITHUB_TOKEN ?? environment.GITHUB_TOKEN;
  if (typeof githubToken !== 'string' || !/^[A-Za-z0-9_-]+$/.test(githubToken)) {
    errors.push(
      'CHESSTICIZE_GITHUB_TOKEN or GITHUB_TOKEN is required to verify the protected workflow artifact.',
    );
    return errors;
  }

  const workflowRun = readGithubJson(
    run,
    `${ANDROID_SOURCE_REPOSITORY_API_URL}/actions/runs/${sourceManifest.workflowRunId}`,
    'Protected source-manifest workflow run',
    errors,
    githubToken,
  );
  if (!workflowRun) {
    return errors;
  }
  requireEqual(workflowRun?.id, sourceManifest.workflowRunId, 'Protected workflow run ID');
  requireEqual(workflowRun?.name, ANDROID_RELEASE_WORKFLOW_NAME, 'Protected workflow name');
  requireEqual(workflowRun?.path, ANDROID_RELEASE_WORKFLOW_PATH, 'Protected workflow path');
  requireEqual(workflowRun?.event, 'workflow_dispatch', 'Protected workflow event');
  requireEqual(workflowRun?.status, 'completed', 'Protected workflow status');
  requireEqual(workflowRun?.conclusion, 'success', 'Protected workflow conclusion');
  requireEqual(workflowRun?.head_sha, expected.commitSha, 'Protected workflow head SHA');
  requireEqual(
    workflowRun?.html_url,
    sourceManifest.workflowRunReference,
    'Protected workflow run URL',
  );

  const workflowArtifact = readGithubJson(
    run,
    `${ANDROID_SOURCE_REPOSITORY_API_URL}/actions/artifacts/` +
      `${sourceManifest.workflowArtifactId}`,
    'Protected source-manifest workflow artifact',
    errors,
    githubToken,
  );
  if (!workflowArtifact) {
    return errors;
  }
  const expectedArchiveUrl =
    `${ANDROID_SOURCE_REPOSITORY_API_URL}/actions/artifacts/` +
    `${sourceManifest.workflowArtifactId}/zip`;
  requireEqual(
    workflowArtifact?.id,
    sourceManifest.workflowArtifactId,
    'Protected workflow artifact ID',
  );
  requireEqual(
    workflowArtifact?.name,
    sourceManifest.workflowArtifactName,
    'Protected workflow artifact name',
  );
  requireEqual(workflowArtifact?.expired, false, 'Protected workflow artifact expired state');
  requireEqual(
    String(workflowArtifact?.digest ?? '').toLowerCase(),
    `sha256:${sourceManifest.workflowArtifactSha256.toLowerCase()}`,
    'Protected workflow artifact digest',
  );
  requireEqual(
    workflowArtifact?.archive_download_url,
    expectedArchiveUrl,
    'Protected workflow artifact archive URL',
  );
  requireEqual(
    workflowArtifact?.workflow_run?.id,
    sourceManifest.workflowRunId,
    'Protected workflow artifact run ID',
  );
  requireEqual(
    workflowArtifact?.workflow_run?.head_sha,
    expected.commitSha,
    'Protected workflow artifact head SHA',
  );

  const workflowArchiveRedirect = requestGithubDownloadRedirect(
    run,
    expectedArchiveUrl,
    githubToken,
  );
  if (workflowArchiveRedirect.error) {
    errors.push(workflowArchiveRedirect.error);
    return errors;
  }
  const workflowArchiveDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'chessticize-source-artifact-'),
  );
  const workflowArchivePath = path.join(workflowArchiveDirectory, 'artifact.zip');
  try {
    const workflowArchiveResult = run('curl', [
      '--fail',
      '--location',
      '--silent',
      '--show-error',
      '--output',
      workflowArchivePath,
      workflowArchiveRedirect.url,
    ], { encoding: 'utf8' });
    if (workflowArchiveResult.status !== 0) {
      errors.push('Protected source-manifest workflow artifact could not be downloaded.');
      return errors;
    }
    requireEqual(
      sha256FileContents(workflowArchivePath),
      sourceManifest.workflowArtifactSha256.toLowerCase(),
      'Downloaded protected workflow artifact SHA-256',
    );

    const protectedManifestResult = readZipEntry(
      run,
      workflowArchivePath,
      sourceManifest.workflowArtifactEntry,
    );
    if (protectedManifestResult.status !== 0) {
      errors.push('Protected workflow artifact does not contain the recorded source manifest entry.');
      return errors;
    }
    const protectedManifestBytes = outputBuffer(protectedManifestResult.stdout);
    if (!protectedManifestBytes.equals(sourceManifestBytes)) {
      errors.push(
        'Published source manifest bytes do not match the protected workflow artifact manifest.',
      );
    }
  } finally {
    fs.rmSync(workflowArchiveDirectory, { recursive: true, force: true });
  }

  const supportDocumentation = sourceRelease?.sourceDisclosure?.supportDocumentation;
  const supportResult = run('curl', [
    '--fail',
    '--location',
    '--silent',
    '--show-error',
    supportDocumentation?.reference,
  ], { encoding: null, maxBuffer: 16 * 1024 * 1024 });
  if (supportResult.status !== 0) {
    errors.push('Public Android source support documentation could not be downloaded.');
    return errors;
  }
  const supportBytes = outputBuffer(supportResult.stdout);
  requireEqual(
    sha256Bytes(supportBytes),
    String(supportDocumentation?.sha256 ?? '').toLowerCase(),
    'Downloaded source support documentation SHA-256',
  );
  const supportText = supportBytes.toString('utf8');
  if (!supportText.includes(expectedTag) ||
      !supportText.includes(ANDROID_SOURCE_REPOSITORY_URL)) {
    errors.push(
      'Public Android source support documentation must disclose the exact source tag and repository URL.',
    );
  }

  return errors;
}

function requireSuccessful(result, description) {
  if (result.status !== 0) {
    throw new Error(
      `${description}: ${result.stderr || result.stdout || result.error || 'command failed'}`,
    );
  }
  return String(result.stdout ?? '');
}

function isJarSignatureMetadata(entry) {
  return /^META-INF\/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC)|SIG-[^/]*)$/i.test(entry);
}

function requireVerifiedJar(result, entries = []) {
  const output = requireSuccessful(result, 'AAB JAR signature verification failed');
  if (!/^jar verified\.\s*$/im.test(output)) {
    throw new Error('AAB JAR signature verification did not confirm a signed JAR.');
  }
  const coverageLines = output.split(/\r?\n/).map(line => line.trimEnd());
  const payloadEntries = entries.filter(entry =>
    entry && !entry.endsWith('/') && !isJarSignatureMetadata(entry));
  const duplicateEntries = payloadEntries.filter((entry, index) =>
    payloadEntries.indexOf(entry) !== index);
  if (duplicateEntries.length > 0) {
    throw new Error(`AAB contains duplicate payload entries: ${[...new Set(duplicateEntries)].join(', ')}.`);
  }
  for (const entry of payloadEntries) {
    const matchingLines = coverageLines.filter(line => line.endsWith(` ${entry}`));
    if (matchingLines.length !== 1) {
      throw new Error(`AAB signature coverage is missing or ambiguous for ${entry}.`);
    }
    const flags = matchingLines[0].match(/^\s*([smk?]+)\s+\d+\s/i)?.[1] ?? '';
    if (!flags.includes('s') || !flags.includes('m') || flags.includes('?')) {
      throw new Error(`AAB contains unsigned payload entry ${entry}.`);
    }
  }
  return output;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseArguments(argv) {
  const result = { artifactOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') {
      continue;
    }
    if (argument === '--artifact-only') {
      result.artifactOnly = true;
      continue;
    }
    if (['--bundle', '--bundletool', '--owner-evidence', '--output'].includes(argument)) {
      result[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] =
        argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown Android release argument: ${argument}`);
  }
  return result;
}

function parseManifest(manifest) {
  const value = name => manifest.match(new RegExp(`${name}="([^"]+)"`))?.[1];
  return {
    applicationId: value('package'),
    versionName: value('android:versionName'),
    versionCode: Number(value('android:versionCode')),
  };
}

function parseSignerFingerprint(output) {
  const value = output.match(/SHA256:\s*([0-9A-F:]{64,})/i)?.[1];
  return normalizeFingerprint(value);
}

function requireApprovedSingleSigner(output, approvedFingerprint) {
  const signerBlocks = String(output).split(/(?=^Signer #\d+:?\s*$)/m)
    .filter(block => /^Signer #\d+:?\s*$/m.test(block));
  if (signerBlocks.length !== 1) {
    throw new Error(`AAB must have exactly one signer; found ${signerBlocks.length}.`);
  }
  const fingerprint = parseSignerFingerprint(signerBlocks[0]);
  if (fingerprint !== normalizeFingerprint(approvedFingerprint)) {
    throw new Error('AAB has an unexpected signer certificate.');
  }
  return fingerprint;
}

function resolveRepoPath(value, repoRoot) {
  return path.resolve(repoRoot, value);
}

function inspectReleaseManifest(manifest) {
  const value = String(manifest);
  const errors = [];
  if (value.includes('android.permission.INTERNET')) {
    errors.push('Production AAB unexpectedly requests android.permission.INTERNET.');
  }
  if (/android:debuggable="true"/.test(value)) {
    errors.push('Production AAB is debuggable.');
  }
  if (/android:testOnly="true"/.test(value)) {
    errors.push('Production AAB is test-only.');
  }
  if (!/android:usesCleartextTraffic="false"/.test(value)) {
    errors.push('Production AAB does not explicitly disable cleartext traffic.');
  }
  return errors;
}

function parseZipListing(output, limit = 10) {
  return String(output)
    .split(/\r?\n/)
    .map(line => line.match(/^\s*(\d+)\s+\S+\s+\d{2}:\d{2}\s+(.+)$/))
    .filter(Boolean)
    .map(match => ({ path: match[2], bytes: Number(match[1]) }))
    .filter(entry => entry.bytes > 0 && !entry.path.endsWith('/'))
    .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path))
    .slice(0, limit);
}

function verifyNativeElfAlignment(bundlePath, entries, run, environment) {
  const nativeEntries = entries.filter(entry => /^base\/lib\/[^/]+\/[^/]+\.so$/.test(entry));
  const tools = androidToolPaths(environment);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-aab-'));
  try {
    for (const entry of nativeEntries) {
      const target = path.join(temporaryDirectory, entry.replaceAll('/', '-'));
      const extracted = run('unzip', ['-p', bundlePath, entry], {
        encoding: null,
        maxBuffer: 256 * 1024 * 1024,
      });
      requireSuccessful(extracted, `Could not extract ${entry}`);
      fs.writeFileSync(target, extracted.stdout);
      try {
        const readelf = run(tools.readelf, ['-lW', target], { encoding: 'utf8' });
        requireSuccessful(readelf, `Could not inspect ${entry}`);
        const alignments = parseElfLoadAlignments(readelf.stdout);
        if (alignments.length === 0 || alignments.some(value => value < MINIMUM_LOAD_ALIGNMENT)) {
          throw new Error(
            `${entry} has incompatible ELF LOAD alignment ${alignments.join(', ') || 'none'}.`,
          );
        }
      } finally {
        fs.rmSync(target, { force: true });
      }
    }
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function inspectAndroidPlayRelease(options, dependencies = {}) {
  const run = dependencies.run ?? spawnSync;
  const environment = dependencies.environment ?? process.env;
  const repoRoot = dependencies.repoRoot ?? path.resolve(__dirname, '../../..');
  const releaseVersion = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'apps/mobile/release-version.json'), 'utf8'),
  );
  const bundlePath = options.bundle && resolveRepoPath(options.bundle, repoRoot);
  const bundletoolPath = options.bundletool && resolveRepoPath(options.bundletool, repoRoot);
  if (!bundlePath || !fs.existsSync(bundlePath) || !fs.statSync(bundlePath).isFile()) {
    throw new Error('--bundle must point to the signed production AAB.');
  }
  if (!bundletoolPath || !fs.existsSync(bundletoolPath) || !fs.statSync(bundletoolPath).isFile()) {
    throw new Error('--bundletool must point to the pinned bundletool JAR.');
  }
  const approvedUploadFingerprint = normalizeFingerprint(
    environment.CHESSTICIZE_ANDROID_UPLOAD_CERT_SHA256,
  );
  const git = args => requireSuccessful(
    run('git', args, { cwd: repoRoot, encoding: 'utf8' }),
    `git ${args.join(' ')}`,
  ).trim();
  const commitSha = git(['rev-parse', 'HEAD']);
  const dirty = git(['status', '--porcelain']);
  if (dirty) {
    throw new Error('Refusing Android release evidence from a dirty tracked worktree.');
  }

  const entries = requireSuccessful(
    run('unzip', ['-Z1', bundlePath], { encoding: 'utf8' }),
    'Could not list the AAB',
  ).split(/\r?\n/).filter(Boolean);
  const largestContributors = parseZipListing(requireSuccessful(
    run('unzip', ['-l', bundlePath], { encoding: 'utf8' }),
    'Could not measure AAB entries',
  ));
  if (largestContributors.length === 0) {
    throw new Error('Could not measure the largest packaged contributors.');
  }
  const bundleConfig = requireSuccessful(
    run('java', ['-jar', bundletoolPath, 'dump', 'config', `--bundle=${bundlePath}`], {
      encoding: 'utf8',
    }),
    'Could not read the AAB bundle configuration',
  );
  const bundleEntryResult = inspectBundleEntries(entries, { pageAlignment: bundleConfig });
  if (bundleEntryResult.errors.length > 0) {
    throw new Error(bundleEntryResult.errors.join('\n'));
  }
  verifyNativeElfAlignment(bundlePath, entries, run, environment);

  requireVerifiedJar(
    run('jarsigner', ['-verify', '-verbose', bundlePath], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...environment, LANG: 'C' },
    }),
    entries,
  );
  const signerOutput = requireSuccessful(
    run('keytool', ['-printcert', '-jarfile', bundlePath], {
      encoding: 'utf8',
      env: { ...environment, LANG: 'C' },
    }),
    'Could not inspect the AAB upload certificate',
  );
  const uploadCertificateSha256 = requireApprovedSingleSigner(
    signerOutput,
    approvedUploadFingerprint,
  );
  const manifest = requireSuccessful(
    run('java', ['-jar', bundletoolPath, 'dump', 'manifest', `--bundle=${bundlePath}`, '--module=base'], {
      encoding: 'utf8',
    }),
    'Could not inspect the AAB manifest',
  );
  const manifestErrors = inspectReleaseManifest(manifest);
  if (manifestErrors.length > 0) {
    throw new Error(manifestErrors.join('\n'));
  }
  const identity = parseManifest(manifest);
  const expectedIdentity = {
    applicationId: 'com.chessticize.mobile',
    versionName: releaseVersion.publicVersion,
    versionCode: releaseVersion.androidVersionCode,
  };
  if (JSON.stringify(identity) !== JSON.stringify(expectedIdentity)) {
    throw new Error(`AAB identity mismatch: ${JSON.stringify({ identity, expectedIdentity })}`);
  }

  const result = {
    schemaVersion: 1,
    status: options.artifactOnly ? 'artifact-only' : 'play-ready',
    commitSha,
    worktreeClean: true,
    bundle: {
      path: path.relative(repoRoot, bundlePath),
      bytes: fs.statSync(bundlePath).size,
      sha256: sha256(bundlePath),
      ...identity,
      abis: bundleEntryResult.abis,
      pageAlignment: 'PAGE_ALIGNMENT_16K',
      uploadCertificateSha256,
      nativeDebugSymbols: 'retained-in-aab',
      licenseNotices: REQUIRED_NOTICES,
      runtimeAssets: REQUIRED_RUNTIME_ASSETS,
      largestContributors,
    },
  };
  if (!options.artifactOnly) {
    const ownerEvidencePath = options.ownerEvidence &&
      resolveRepoPath(options.ownerEvidence, repoRoot);
    if (!ownerEvidencePath ||
        !fs.existsSync(ownerEvidencePath) ||
        !fs.statSync(ownerEvidencePath).isFile()) {
      throw new Error('--owner-evidence is required for a play-ready verdict.');
    }
    const evidence = JSON.parse(fs.readFileSync(ownerEvidencePath, 'utf8'));
    const expectedOwnerEvidence = {
      commitSha,
      aabSha256: result.bundle.sha256,
      ...expectedIdentity,
      uploadCertificateSha256,
    };
    const errors = inspectOwnerEvidence(evidence, expectedOwnerEvidence);
    if (errors.length > 0) {
      throw new Error(`Owner evidence is incomplete:\n${errors.join('\n')}`);
    }
    const sourceReleaseErrors = inspectPublishedSourceRelease(
      evidence.sourceRelease,
      expectedOwnerEvidence,
      { repoRoot, run, environment },
    );
    if (sourceReleaseErrors.length > 0) {
      throw new Error(
        `Public source release verification failed:\n${sourceReleaseErrors.join('\n')}`,
      );
    }
    result.ownerEvidence = { status: 'pass', path: path.relative(repoRoot, ownerEvidencePath) };
  }
  return result;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = inspectAndroidPlayRelease(options);
    const output = `${JSON.stringify(result, null, 2)}\n`;
    if (options.output) {
      const repoRoot = path.resolve(__dirname, '../../..');
      const outputPath = resolveRepoPath(options.output, repoRoot);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, output);
    }
    process.stdout.write(output);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  ANDROID_SOURCE_REPOSITORY_URL,
  EXPECTED_ABIS,
  REQUIRED_NOTICES,
  REQUIRED_RUNTIME_ASSETS,
  canonicalAndroidSourceTag,
  inspectAndroidPlayRelease,
  inspectBundleEntries,
  inspectOwnerEvidence,
  inspectPublishedSourceRelease,
  inspectReleaseManifest,
  normalizeFingerprint,
  parseArguments,
  parseManifest,
  parseSignerFingerprint,
  parseZipListing,
  requireApprovedSingleSigner,
  resolveRepoPath,
  requireVerifiedJar,
  verifyNativeElfAlignment,
};
