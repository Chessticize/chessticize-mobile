const {
  ANDROID_SOURCE_REPOSITORY_URL,
  canonicalAndroidSourceTag,
  normalizeFingerprint,
} = require('./android-play-release');
const crypto = require('node:crypto');
const { Buffer } = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ANDROID_REQUIREMENTS } = require('./android-requirements');
const { verifyApk } = require('./verify-android-apk-abis');

const ANDROID_APPLICATION_ID = 'com.chessticize.mobile';
const ANDROID_RELEASES_URL = `${ANDROID_SOURCE_REPOSITORY_URL}/releases`;
function createAndroidReleaseIdentity(releaseVersion) {
  const { publicVersion, androidVersionCode } = releaseVersion ?? {};
  const tagName = canonicalAndroidSourceTag(publicVersion, androidVersionCode);
  const apkName = `Chessticize-Android-${publicVersion}.apk`;
  return {
    applicationId: ANDROID_APPLICATION_ID,
    publicVersion,
    versionCode: androidVersionCode,
    tagName,
    apkName,
    checksumName: `${apkName}.sha256`,
    releasesUrl: ANDROID_RELEASES_URL,
  };
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let count;
    while ((count = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

function measureArtifact(artifact) {
  if (Buffer.isBuffer(artifact)) {
    return { bytes: artifact.length, sha256: sha256Bytes(artifact) };
  }
  const filePath = typeof artifact === 'string' ? artifact : artifact?.path;
  if (typeof filePath !== 'string' || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error('Artifact must be non-empty bytes or an existing file path.');
  }
  const bytes = fs.statSync(filePath).size;
  if (bytes < 1) {
    throw new Error('Artifact file must not be empty.');
  }
  return { bytes, sha256: sha256File(filePath) };
}

function requireSafePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(`${label} must be a SHA-256 digest.`);
  }
  return value.toLowerCase();
}

function requireExactSourceManifest(manifest, identity) {
  if (manifest?.schemaVersion !== 1 || manifest?.status !== 'artifact-only') {
    throw new Error('Source manifest must be schema 1 artifact-only evidence.');
  }
  if (manifest.worktreeClean !== true) {
    throw new Error('Source manifest must come from a clean tracked worktree.');
  }
  if (typeof manifest.commitSha !== 'string' || !/^[0-9a-f]{40}$/i.test(manifest.commitSha)) {
    throw new Error('Source manifest must record an exact 40-character commit SHA.');
  }
  const expected = {
    applicationId: identity.applicationId,
    versionName: identity.publicVersion,
    versionCode: identity.versionCode,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (manifest.bundle?.[field] !== value) {
      throw new Error(`Source manifest ${field} does not match the canonical release identity.`);
    }
  }
  requireDigest(manifest.bundle?.sha256, 'Source manifest AAB digest');
  return {
    commitSha: manifest.commitSha.toLowerCase(),
    aabSha256: manifest.bundle.sha256.toLowerCase(),
    ...expected,
  };
}

function sourceReleaseNotes(identity) {
  return [
    `Android source release ${identity.tagName}.`,
    '',
    `Corresponding source: ${ANDROID_SOURCE_REPOSITORY_URL}`,
    'The installable Play-signed APK is published separately only after protected human approval.',
  ].join('\n');
}

function requireSourceReleaseNotes(release, identity) {
  const body = String(release?.body ?? '');
  if (body !== sourceReleaseNotes(identity)) {
    throw new Error('Canonical source release notes changed from the exact prepared disclosure.');
  }
}

async function prepareSourceDraft(input, { github }) {
  const identity = createAndroidReleaseIdentity(input.releaseVersion);
  const candidate = requireExactSourceManifest(input.sourceManifest, identity);
  if (!Buffer.isBuffer(input.sourceManifestBytes)) {
    throw new Error('Source manifest bytes are required.');
  }
  requireSafePositiveInteger(input.protectedWorkflow?.runId, 'Protected workflow run ID');
  requireSafePositiveInteger(input.protectedWorkflow?.artifactId, 'Protected workflow artifact ID');
  if (input.protectedWorkflow?.artifactName !==
      `android-signed-release-candidate-${candidate.commitSha}`) {
    throw new Error('Protected workflow artifact name does not match the exact candidate.');
  }
  requireDigest(input.protectedWorkflow?.archiveSha256, 'Protected workflow archive digest');

  const tag = await github.getTag(identity.tagName);
  if (!tag || tag.tagName !== identity.tagName ||
      !['annotated', 'signed'].includes(tag.tagType) ||
      tag.commitSha?.toLowerCase() !== candidate.commitSha) {
    throw new Error('Canonical Android tag is missing, lightweight, or targets another commit.');
  }
  const sourceManifestSha256 = sha256Bytes(input.sourceManifestBytes);
  const releaseName = `Chessticize Android ${identity.publicVersion} (${identity.versionCode})`;
  const createEvidence = (release, asset) => ({
    schemaVersion: 1,
    phase: 'source-draft-prepared',
    publicationApproved: false,
    releaseId: release.id,
    releaseAssetId: asset.id,
    tagName: identity.tagName,
    commitSha: candidate.commitSha,
    sourceManifestSha256,
    candidate,
    protectedWorkflow: { ...input.protectedWorkflow },
  });
  const requireExactDraft = release => {
    if (!release || !Number.isSafeInteger(release.id) || release.id < 1 ||
        release.tagName !== identity.tagName ||
        release.targetCommitish?.toLowerCase() !== candidate.commitSha ||
        release.name !== releaseName || release.draft !== true ||
        release.prerelease !== false) {
      throw new Error('The canonical Android release already exists in a conflicting state.');
    }
    requireSourceReleaseNotes(release, identity);
  };
  const reconcileExactDraft = async release => {
    requireExactDraft(release);
    const assets = await github.getReleaseAssets(release.id);
    if (!Array.isArray(assets)) {
      throw new Error('The canonical Android draft assets response is malformed.');
    }
    if (assets.length === 0) {
      const uploaded = await github.uploadAsset({
        releaseId: release.id,
        name: 'android-source-manifest.json',
        bytes: input.sourceManifestBytes,
      });
      if (!uploaded || !Number.isSafeInteger(uploaded.id) || uploaded.id < 1 ||
          uploaded.name !== 'android-source-manifest.json' ||
          uploaded.sha256?.toLowerCase() !== sourceManifestSha256 ||
          uploaded.size !== input.sourceManifestBytes.length) {
        throw new Error('GitHub source-manifest asset did not preserve exact bytes.');
      }
      return createEvidence(release, uploaded);
    }
    const matchingAssets = assets.filter(
      asset => asset?.name === 'android-source-manifest.json',
    );
    const asset = matchingAssets[0];
    if (assets.length !== 1 || matchingAssets.length !== 1 ||
        !Number.isSafeInteger(asset?.id) || asset.id < 1 ||
        asset.sha256?.toLowerCase() !== sourceManifestSha256 ||
        asset.size !== input.sourceManifestBytes.length) {
      throw new Error('The canonical Android draft cannot be reconciled to the exact source manifest.');
    }
    return createEvidence(release, asset);
  };
  const existingRelease = await github.getReleaseByTag(identity.tagName);
  if (existingRelease) {
    return reconcileExactDraft(existingRelease);
  }

  let release;
  try {
    release = await github.createRelease({
      tagName: identity.tagName,
      targetCommitish: candidate.commitSha,
      name: releaseName,
      body: sourceReleaseNotes(identity),
      draft: true,
      prerelease: false,
    });
  } catch (error) {
    const recoveredRelease = await github.getReleaseByTag(identity.tagName);
    if (!recoveredRelease) throw error;
    return reconcileExactDraft(recoveredRelease);
  }
  if (!release || !Number.isSafeInteger(release.id) || release.id < 1) {
    throw new Error('GitHub did not create the required canonical draft release.');
  }
  try {
    requireExactDraft(release);
  } catch (error) {
    await Promise.allSettled([github.deleteRelease(release.id)]);
    throw error;
  }
  try {
    const asset = await github.uploadAsset({
      releaseId: release.id,
      name: 'android-source-manifest.json',
      bytes: input.sourceManifestBytes,
    });
    if (!asset || !Number.isSafeInteger(asset.id) || asset.id < 1 ||
        asset.name !== 'android-source-manifest.json' ||
        asset.sha256?.toLowerCase() !== sourceManifestSha256) {
      throw new Error('GitHub source-manifest asset did not preserve exact bytes.');
    }

    return createEvidence(release, asset);
  } catch (error) {
    await Promise.allSettled([github.deleteRelease(release.id)]);
    throw error;
  }
}

function requireCandidateEqual(actual, expected, label) {
  for (const field of [
    'commitSha',
    'aabSha256',
    'applicationId',
    'versionName',
    'versionCode',
  ]) {
    if (actual?.[field] !== expected[field]) {
      throw new Error(`${label} ${field} does not match the exact candidate.`);
    }
  }
}

async function publishSourceRelease(input, { github }) {
  if (input.publicationApproved !== true) {
    throw new Error('Source publication requires protected human approval.');
  }
  const identity = createAndroidReleaseIdentity(input.releaseVersion);
  const candidate = requireExactSourceManifest(input.sourceManifest, identity);
  const evidence = input.draftEvidence;
  if (evidence?.schemaVersion !== 1 || evidence?.phase !== 'source-draft-prepared' ||
      evidence?.publicationApproved !== false) {
    throw new Error('Source publication requires retained source-draft evidence.');
  }
  requireSafePositiveInteger(evidence.releaseId, 'Source draft release ID');
  requireSafePositiveInteger(evidence.releaseAssetId, 'Source manifest release asset ID');
  if (evidence.tagName !== identity.tagName || evidence.commitSha !== candidate.commitSha) {
    throw new Error('Source draft tag or commit does not match the canonical candidate.');
  }
  requireCandidateEqual(evidence.candidate, candidate, 'Source draft evidence');
  const sourceManifestSha256 = sha256Bytes(input.sourceManifestBytes);
  if (evidence.sourceManifestSha256 !== sourceManifestSha256) {
    throw new Error('Source manifest bytes do not match retained draft evidence.');
  }

  const [tag, release, asset, releaseAssets] = await Promise.all([
    github.getTag(identity.tagName),
    github.getRelease(evidence.releaseId),
    github.getAsset(evidence.releaseAssetId),
    github.getReleaseAssets(evidence.releaseId),
  ]);
  if (!tag || !['annotated', 'signed'].includes(tag.tagType) ||
      tag.commitSha?.toLowerCase() !== candidate.commitSha) {
    throw new Error('Canonical Android tag changed before source publication.');
  }
  if (!release || release.id !== evidence.releaseId || release.tagName !== identity.tagName ||
      ![true, false].includes(release.draft) || release.prerelease !== false) {
    throw new Error('Canonical source release state changed before publication.');
  }
  requireSourceReleaseNotes(release, identity);
  if (!asset || asset.id !== evidence.releaseAssetId ||
      asset.name !== 'android-source-manifest.json' ||
      asset.sha256?.toLowerCase() !== sourceManifestSha256) {
    throw new Error('Canonical source manifest asset changed before publication.');
  }
  if (!Array.isArray(releaseAssets) || releaseAssets.length !== 1 ||
      releaseAssets[0]?.id !== asset.id ||
      releaseAssets[0]?.name !== 'android-source-manifest.json' ||
      releaseAssets[0]?.sha256?.toLowerCase() !== sourceManifestSha256 ||
      releaseAssets[0]?.size !== input.sourceManifestBytes.length) {
    throw new Error('Canonical source publication must remain source-only.');
  }

  if (release.draft === true) {
    const published = await github.updateRelease({ releaseId: release.id, draft: false });
    if (!published || published.id !== release.id || published.draft !== false ||
        published.tagName !== identity.tagName) {
      throw new Error('GitHub did not publish the exact canonical source release.');
    }
  }
  return {
    ...evidence,
    phase: 'source-published',
    publicationApproved: true,
    sourceManifestSha256,
  };
}

function normalizePlayCertificateHash(value) {
  try {
    return normalizeFingerprint(value).toLowerCase();
  } catch {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error('Play app-signing certificate hash is missing or malformed.');
    }
    const base64 = value.trim().replaceAll('-', '+').replaceAll('_', '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const bytes = Buffer.from(`${base64}${padding}`, 'base64');
    if (bytes.length !== 32) {
      throw new Error('Play app-signing certificate hash is missing or malformed.');
    }
    return bytes.toString('hex');
  }
}

function selectPlayUniversalApk(listing, expected) {
  if (!listing || !Array.isArray(listing.generatedApks)) {
    throw new Error('Generated APKs API response is unavailable or malformed.');
  }
  const groups = listing.generatedApks;
  if (groups.some(group => group?.targetingInfo?.packageName !== expected.applicationId)) {
    throw new Error('Generated APK package identity does not match the selected application.');
  }
  const expectedCertificate = normalizeFingerprint(expected.appSigningCertificateSha256).toLowerCase();
  const matchingCertificate = groups.filter(group => {
    try {
      return normalizePlayCertificateHash(group?.certificateSha256Hash) === expectedCertificate;
    } catch {
      return false;
    }
  });
  if (matchingCertificate.length === 0) {
    throw new Error('Generated APKs API did not return the approved app-signing certificate.');
  }
  const universalApks = matchingCertificate
    .map(group => group.generatedUniversalApk?.downloadId)
    .filter(downloadId => typeof downloadId === 'string' && downloadId.length > 0);
  if (universalApks.length === 0) {
    throw new Error('Play did not generate a universal APK for the approved app-signing key.');
  }
  if (matchingCertificate.length !== 1 || universalApks.length !== 1) {
    throw new Error('Generated APKs API must provide exactly one approved universal APK.');
  }
  return {
    downloadId: universalApks[0],
    certificateSha256: expectedCertificate,
  };
}

async function downloadPlayUniversalApk(input, { play }) {
  let listing;
  try {
    listing = await play.listGeneratedApks({
      packageName: input.identity.applicationId,
      versionCode: input.identity.versionCode,
    });
  } catch (error) {
    throw new Error(`Generated APKs API list failed: ${error instanceof Error ? error.message : error}`);
  }
  const selected = selectPlayUniversalApk(listing, {
    applicationId: input.identity.applicationId,
    appSigningCertificateSha256: input.appSigningCertificateSha256,
  });
  let apkBytes;
  try {
    apkBytes = await play.downloadGeneratedApk({
      packageName: input.identity.applicationId,
      versionCode: input.identity.versionCode,
      downloadId: selected.downloadId,
    });
  } catch (error) {
    throw new Error(`Generated APK download failed: ${error instanceof Error ? error.message : error}`);
  }
  try {
    measureArtifact(apkBytes);
  } catch {
    throw new Error('Generated APK download failed: response contained no APK bytes.');
  }
  return { apkBytes, ...selected };
}

function verifyGeneratedApkContract({ apkBytes, inspection, expected }) {
  let measurement;
  try {
    measurement = measureArtifact(apkBytes);
  } catch {
    throw new Error('Play-generated APK bytes are missing.');
  }
  const identity = expected?.identity;
  if (inspection?.applicationId !== identity?.applicationId) {
    throw new Error('Play-generated APK package identity mismatch.');
  }
  if (inspection.versionName !== identity.publicVersion) {
    throw new Error('Play-generated APK public version mismatch.');
  }
  if (inspection.versionCode !== identity.versionCode) {
    throw new Error('Play-generated APK build number mismatch.');
  }
  const expectedCertificate = normalizeFingerprint(
    expected.appSigningCertificateSha256,
  ).toLowerCase();
  let inspectedCertificate;
  try {
    inspectedCertificate = normalizePlayCertificateHash(
      inspection.signerCertificateSha256,
    );
  } catch {
    inspectedCertificate = '';
  }
  if (inspectedCertificate !== expectedCertificate) {
    throw new Error('Play-generated APK app-signing certificate mismatch.');
  }
  const abis = Array.isArray(inspection.abis) ? [...inspection.abis].sort() : [];
  if (JSON.stringify(abis) !== JSON.stringify(['arm64-v8a', 'x86_64'])) {
    throw new Error('Play-generated APK must contain exactly the approved ABIs.');
  }
  if (inspection.zipAligned16KiB !== true || inspection.elfAligned16KiB !== true) {
    throw new Error('Play-generated APK failed 16 KB page-size compatibility.');
  }
  if (inspection.debuggable === true) {
    throw new Error('Play-generated APK must not be debuggable.');
  }
  if (inspection.testOnly === true) {
    throw new Error('Play-generated APK must not be test-only.');
  }
  if (inspection.internetPermission === true) {
    throw new Error('Play-generated APK must not request INTERNET permission.');
  }

  const digest = measurement.sha256;
  if (requireDigest(expected.expectedSha256, 'Expected APK SHA-256') !== digest) {
    throw new Error('Play-generated APK SHA-256 mismatch.');
  }
  const { minimumBytes, maximumBytes, recordedBytes } = expected;
  if (!Number.isSafeInteger(minimumBytes) || minimumBytes < 1 ||
      !Number.isSafeInteger(maximumBytes) || maximumBytes < minimumBytes ||
      measurement.bytes < minimumBytes || measurement.bytes > maximumBytes) {
    throw new Error('Play-generated APK is outside the approved size bounds.');
  }
  if (!Number.isSafeInteger(recordedBytes) || recordedBytes !== measurement.bytes) {
    throw new Error('Play-generated APK does not match the recorded Play size.');
  }

  return {
    bytes: measurement.bytes,
    sha256: digest,
    applicationId: inspection.applicationId,
    versionName: inspection.versionName,
    versionCode: inspection.versionCode,
    signerCertificateSha256: expectedCertificate,
    abis,
    pageSizeCompatibility: '16-kib-compatible',
  };
}

function parseApkBadging(output) {
  const source = String(output);
  const identity = source.match(
    /^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m,
  );
  const versionCode = Number(identity?.[2]);
  if (!identity || !Number.isSafeInteger(versionCode) || versionCode < 1) {
    throw new Error('APK identity could not be parsed from aapt2 badging output.');
  }
  return {
    applicationId: identity[1],
    versionName: identity[3],
    versionCode,
    debuggable: /^application-debuggable(?:\s|$)/m.test(source),
    testOnly: /^application-testOnly(?:\s|$)/m.test(source),
    internetPermission: /^uses-permission: name='android\.permission\.INTERNET'/m.test(source),
  };
}

function parseApkSignerCertificate(output) {
  const source = String(output);
  const signers = [...source.matchAll(
    /Signer #(\d+) certificate SHA-256 digest:\s*([0-9a-f]{64})/gi,
  )];
  const declaredCount = Number(source.match(/Number of signers:\s*(\d+)/i)?.[1]);
  if (signers.length !== 1 || signers[0][1] !== '1' || declaredCount !== 1) {
    throw new Error('Play-generated APK must have exactly one signer.');
  }
  return signers[0][2].toLowerCase();
}

function requireCommand(result, label) {
  if (result?.status !== 0) {
    const detail = result?.stderr || result?.stdout || result?.error || 'command failed';
    throw new Error(`${label}: ${String(detail).trim()}`);
  }
  return String(result.stdout ?? '');
}

function inspectGeneratedApk(
  apkPath,
  { run = spawnSync, environment = process.env } = {},
) {
  if (typeof apkPath !== 'string' || !fs.existsSync(apkPath)) {
    throw new Error('Play-generated APK path does not exist.');
  }
  const sdkRoot = environment.ANDROID_HOME || environment.ANDROID_SDK_ROOT;
  if (!sdkRoot) {
    throw new Error('ANDROID_HOME or ANDROID_SDK_ROOT is required to inspect the APK.');
  }
  const buildTools = path.join(sdkRoot, 'build-tools', ANDROID_REQUIREMENTS.buildTools);
  const aapt2 = path.join(buildTools, 'aapt2');
  const apksigner = path.join(buildTools, 'apksigner');
  const abis = verifyApk(apkPath, run, environment);
  const badging = requireCommand(
    run(aapt2, ['dump', 'badging', apkPath], { encoding: 'utf8' }),
    'Could not inspect APK identity',
  );
  const signer = requireCommand(
    run(apksigner, ['verify', '--verbose', '--print-certs', apkPath], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }),
    'Could not verify APK signing',
  );
  return {
    ...parseApkBadging(badging),
    signerCertificateSha256: parseApkSignerCertificate(signer),
    abis,
    zipAligned16KiB: true,
    elfAligned16KiB: true,
  };
}

function binaryReleaseNotes(identity, verifiedApk) {
  return [
    `# Chessticize Android ${identity.publicVersion} (${identity.versionCode})`,
    '',
    'This is the Play-generated universal APK for manual installation.',
    'Android must allow installation from the browser or file manager you choose.',
    `Verify SHA-256 before installing: \`sha256sum ${identity.apkName}\`.`,
    'Chessticize does not check GitHub for updates and does not download or install updates automatically.',
    'Play and GitHub installs use the same Android package and Play signing certificate.',
    'They can update one another only when Android versionCode ordering permits.',
    `Package: \`${verifiedApk.applicationId}\``,
    `Play signing certificate SHA-256: \`${verifiedApk.signerCertificateSha256}\``,
    `APK SHA-256: \`${verifiedApk.sha256}\``,
    `Corresponding source: ${ANDROID_SOURCE_REPOSITORY_URL}/tree/${identity.tagName}`,
    'Chessticize collects no app telemetry.',
  ].join('\n');
}

function prepareBinaryEvidence(input) {
  const identity = createAndroidReleaseIdentity(input.releaseVersion);
  const expectedCandidate = {
    commitSha: input.candidate?.commitSha,
    aabSha256: input.candidate?.aabSha256,
    applicationId: identity.applicationId,
    versionName: identity.publicVersion,
    versionCode: identity.versionCode,
  };
  if (!/^[0-9a-f]{40}$/i.test(String(expectedCandidate.commitSha)) ||
      !/^[0-9a-f]{64}$/i.test(String(expectedCandidate.aabSha256))) {
    throw new Error('Binary preparation requires an exact source candidate.');
  }
  requireCandidateEqual(input.candidate, expectedCandidate, 'Binary preparation');
  const source = input.sourcePublicationEvidence;
  if (source?.phase !== 'source-published' || source?.publicationApproved !== true ||
      source?.tagName !== identity.tagName || source?.commitSha !== expectedCandidate.commitSha) {
    throw new Error('Binary preparation requires the exact published canonical source release.');
  }
  requireSafePositiveInteger(source.releaseId, 'Published source release ID');
  requireSafePositiveInteger(source.releaseAssetId, 'Published source manifest asset ID');
  requireDigest(source.sourceManifestSha256, 'Published source manifest digest');
  if (typeof input.playDownloadId !== 'string' || input.playDownloadId.length === 0) {
    throw new Error('Binary preparation requires the official Play download ID.');
  }
  let apkMeasurement;
  try {
    apkMeasurement = measureArtifact(input.apkBytes);
  } catch {
    apkMeasurement = undefined;
  }
  if (!apkMeasurement || input.verifiedApk?.bytes !== apkMeasurement.bytes ||
      input.verifiedApk?.sha256 !== apkMeasurement.sha256) {
    throw new Error('Prepared APK bytes do not match the verified Play artifact.');
  }
  if (input.verifiedApk.applicationId !== identity.applicationId ||
      input.verifiedApk.versionName !== identity.publicVersion ||
      input.verifiedApk.versionCode !== identity.versionCode) {
    throw new Error('Prepared APK identity does not match the canonical release.');
  }

  const checksumBytes = Buffer.from(
    `${input.verifiedApk.sha256}  ${identity.apkName}\n`,
  );
  const releaseNotes = binaryReleaseNotes(identity, input.verifiedApk);
  return {
    files: {
      apk: { name: identity.apkName, bytes: input.apkBytes },
      checksum: { name: identity.checksumName, bytes: checksumBytes },
    },
    evidence: {
      schemaVersion: 1,
      phase: 'binary-prepared',
      publicationApproved: false,
      releaseId: source.releaseId,
      sourceManifestAssetId: source.releaseAssetId,
      sourceManifestSha256: source.sourceManifestSha256,
      tagName: identity.tagName,
      candidate: { ...expectedCandidate },
      playDownloadId: input.playDownloadId,
      apk: {
        name: identity.apkName,
        ...input.verifiedApk,
      },
      checksum: {
        name: identity.checksumName,
        sha256: sha256Bytes(checksumBytes),
      },
      releaseNotes,
    },
  };
}

async function publishBinaryRelease(input, { github }) {
  if (input.publicationApproved !== true) {
    throw new Error('Binary publication requires protected human approval.');
  }
  const identity = createAndroidReleaseIdentity(input.releaseVersion);
  const evidence = input.binaryEvidence;
  if (evidence?.schemaVersion !== 1 || evidence?.phase !== 'binary-prepared' ||
      evidence?.publicationApproved !== false || evidence?.tagName !== identity.tagName) {
    throw new Error('Binary publication requires retained exact preparation evidence.');
  }
  requireSafePositiveInteger(evidence.releaseId, 'Canonical release ID');
  requireSafePositiveInteger(evidence.sourceManifestAssetId, 'Source manifest asset ID');
  if (!Buffer.isBuffer(input.sourceManifestBytes) ||
      sha256Bytes(input.sourceManifestBytes) !== evidence.sourceManifestSha256) {
    throw new Error('Published source manifest bytes changed after preparation.');
  }
  const verifiedApk = verifyGeneratedApkContract({
    apkBytes: input.apkBytes,
    inspection: input.apkInspection,
    expected: {
      identity,
      appSigningCertificateSha256: evidence.apk?.signerCertificateSha256,
      minimumBytes: evidence.apk?.bytes,
      maximumBytes: evidence.apk?.bytes,
      recordedBytes: evidence.apk?.bytes,
      expectedSha256: evidence.apk?.sha256,
    },
  });
  const expectedChecksumBytes = Buffer.from(
    `${verifiedApk.sha256}  ${identity.apkName}\n`,
  );
  if (!Buffer.isBuffer(input.checksumBytes) ||
      !input.checksumBytes.equals(expectedChecksumBytes) ||
      evidence.checksum?.name !== identity.checksumName ||
      evidence.checksum?.sha256 !== sha256Bytes(expectedChecksumBytes)) {
    throw new Error('Prepared SHA-256 checksum does not match the exact APK.');
  }
  if (evidence.apk?.name !== identity.apkName ||
      evidence.apk?.applicationId !== verifiedApk.applicationId ||
      evidence.apk?.versionName !== verifiedApk.versionName ||
      evidence.apk?.versionCode !== verifiedApk.versionCode ||
      evidence.apk?.signerCertificateSha256 !== verifiedApk.signerCertificateSha256 ||
      JSON.stringify(evidence.apk?.abis) !== JSON.stringify(verifiedApk.abis) ||
      evidence.apk?.pageSizeCompatibility !== verifiedApk.pageSizeCompatibility) {
    throw new Error('Prepared APK audit metadata changed before publication.');
  }
  if (evidence.releaseNotes !== binaryReleaseNotes(identity, verifiedApk)) {
    throw new Error('Prepared Android release notes are missing or changed.');
  }

  const [tag, release, sourceAsset, existingAssets] = await Promise.all([
    github.getTag(identity.tagName),
    github.getRelease(evidence.releaseId),
    github.getAsset(evidence.sourceManifestAssetId),
    github.getReleaseAssets(evidence.releaseId),
  ]);
  if (!tag || !['annotated', 'signed'].includes(tag.tagType) ||
      tag.commitSha?.toLowerCase() !== evidence.candidate?.commitSha) {
    throw new Error('Canonical Android tag changed before binary publication.');
  }
  if (!release || release.id !== evidence.releaseId ||
      release.tagName !== identity.tagName ||
      release.draft !== false || release.prerelease !== false) {
    throw new Error('Canonical source release changed before binary publication.');
  }
  const sourceBody = sourceReleaseNotes(identity);
  const desiredBody = `${sourceBody}\n\n---\n\n${evidence.releaseNotes}`;
  const releaseBody = String(release.body ?? '');
  if (releaseBody !== sourceBody && releaseBody !== desiredBody) {
    throw new Error('Canonical Android release body changed before binary publication.');
  }
  if (!sourceAsset || sourceAsset.id !== evidence.sourceManifestAssetId ||
      sourceAsset.name !== 'android-source-manifest.json' ||
      sourceAsset.sha256?.toLowerCase() !== evidence.sourceManifestSha256) {
    throw new Error('Canonical source manifest asset changed before binary publication.');
  }
  if (!Array.isArray(existingAssets)) {
    throw new Error('GitHub release assets API response is unavailable or malformed.');
  }
  const reservedNames = new Set([identity.apkName, identity.checksumName]);
  const expectedAssets = new Map([
    [identity.apkName, {
      bytes: input.apkBytes,
      sha256: verifiedApk.sha256,
      size: verifiedApk.bytes,
      label: 'Play-generated APK',
    }],
    [identity.checksumName, {
      bytes: input.checksumBytes,
      sha256: evidence.checksum.sha256,
      size: expectedChecksumBytes.length,
      label: 'APK checksum',
    }],
  ]);
  const allowedNames = new Set([
    'android-source-manifest.json',
    ...expectedAssets.keys(),
  ]);
  const listedSourceAssets = existingAssets.filter(
    asset => asset?.name === 'android-source-manifest.json',
  );
  if (existingAssets.some(asset => !allowedNames.has(asset?.name)) ||
      listedSourceAssets.length !== 1 ||
      listedSourceAssets[0]?.id !== sourceAsset.id ||
      listedSourceAssets[0]?.sha256?.toLowerCase() !== evidence.sourceManifestSha256 ||
      listedSourceAssets[0]?.size !== input.sourceManifestBytes.length) {
    throw new Error('Canonical release contains an unexpected release asset.');
  }
  const reconciledAssets = new Map();
  for (const [name, expectedAsset] of expectedAssets) {
    const matches = existingAssets.filter(asset => asset?.name === name);
    if (matches.length > 1 || (matches.length === 1 &&
        (!Number.isSafeInteger(matches[0].id) || matches[0].id < 1 ||
         matches[0].sha256?.toLowerCase() !== expectedAsset.sha256 ||
         matches[0].size !== expectedAsset.size))) {
      throw new Error(`Canonical release contains a conflicting ${expectedAsset.label} asset.`);
    }
    if (matches.length === 1) reconciledAssets.set(name, matches[0]);
  }

  const initialAssetIds = new Set(
    existingAssets
      .filter(asset => Number.isSafeInteger(asset?.id) && asset.id > 0)
      .map(asset => asset.id),
  );
  const createdAssetIds = new Set();
  try {
    for (const [name, expectedAsset] of expectedAssets) {
      if (reconciledAssets.has(name)) continue;
      const uploaded = await github.uploadAsset({
        releaseId: release.id,
        name,
        bytes: expectedAsset.bytes,
      });
      if (Number.isSafeInteger(uploaded?.id) && uploaded.id > 0) {
        createdAssetIds.add(uploaded.id);
      }
      if (!uploaded || !Number.isSafeInteger(uploaded.id) || uploaded.id < 1 ||
          uploaded.name !== name || uploaded.sha256?.toLowerCase() !== expectedAsset.sha256 ||
          uploaded.size !== expectedAsset.size) {
        throw new Error(`GitHub did not retain the exact ${expectedAsset.label} bytes.`);
      }
      reconciledAssets.set(name, uploaded);
    }

    const updated = desiredBody === releaseBody
      ? release
      : await github.updateRelease({
        releaseId: release.id,
        body: desiredBody,
        draft: false,
      });
    if (!updated || updated.id !== release.id || updated.tagName !== identity.tagName ||
        updated.draft !== false || String(updated.body ?? '') !== desiredBody) {
      throw new Error('GitHub did not preserve the canonical published release state.');
    }
    const apkAsset = reconciledAssets.get(identity.apkName);
    const checksumAsset = reconciledAssets.get(identity.checksumName);
    return {
      ...evidence,
      phase: 'binary-published',
      publicationApproved: true,
      apkAssetId: apkAsset.id,
      checksumAssetId: checksumAsset.id,
    };
  } catch (error) {
    let cleanupIds = [...createdAssetIds];
    try {
      const currentAssets = await github.getReleaseAssets(release.id);
      if (Array.isArray(currentAssets)) {
        cleanupIds = currentAssets
          .filter(asset => reservedNames.has(asset?.name) &&
            Number.isSafeInteger(asset?.id) && asset.id > 0 &&
            !initialAssetIds.has(asset.id))
          .map(asset => asset.id);
      }
    } catch {
      // Best-effort cleanup; the next protected retry reconciles exact assets.
    }
    await Promise.allSettled(cleanupIds.map(assetId => github.deleteAsset(assetId)));
    throw error;
  }
}

function requirePlayReadyInputs({ identity, sourceManifest, playReady, ownerEvidence }) {
  const candidate = requireExactSourceManifest(sourceManifest, identity);
  if (playReady?.schemaVersion !== 1 || playReady?.status !== 'play-ready' ||
      playReady?.worktreeClean !== true || playReady?.commitSha !== candidate.commitSha) {
    throw new Error('Exact #186 play-ready evidence is missing or does not match the candidate.');
  }
  for (const [field, value] of [
    ['sha256', candidate.aabSha256],
    ['applicationId', identity.applicationId],
    ['versionName', identity.publicVersion],
    ['versionCode', identity.versionCode],
  ]) {
    if (playReady.bundle?.[field] !== value) {
      throw new Error(`Exact #186 play-ready bundle ${field} mismatch.`);
    }
  }
  requireCandidateEqual(ownerEvidence?.candidate, candidate, 'Owner evidence');
  const appSigningCertificateSha256 = normalizeFingerprint(
    ownerEvidence?.signing?.appSigningCertificateSha256,
  ).toLowerCase();
  const sizes = ownerEvidence?.artifacts?.generatedApkSizes;
  const expectation = sizes?.universalApkExpectation;
  if (!Number.isSafeInteger(sizes?.universalApkBytes) || sizes.universalApkBytes < 1 ||
      !Number.isSafeInteger(expectation?.minimumBytes) || expectation.minimumBytes < 1 ||
      !Number.isSafeInteger(expectation?.maximumBytes) ||
      expectation.maximumBytes < expectation.minimumBytes) {
    throw new Error('Owner evidence does not contain approved universal APK size bounds.');
  }
  return {
    candidate,
    appSigningCertificateSha256,
    recordedBytes: sizes.universalApkBytes,
    minimumBytes: expectation.minimumBytes,
    maximumBytes: expectation.maximumBytes,
  };
}

async function requirePublishedSourceRelease({ identity, candidate, evidence, sourceManifestBytes }, { github }) {
  if (evidence?.phase !== 'source-published' || evidence?.publicationApproved !== true ||
      evidence?.tagName !== identity.tagName || evidence?.commitSha !== candidate.commitSha) {
    throw new Error('Published source evidence does not match the exact canonical candidate.');
  }
  requireCandidateEqual(evidence.candidate, candidate, 'Published source evidence');
  const digest = sha256Bytes(sourceManifestBytes);
  if (evidence.sourceManifestSha256 !== digest) {
    throw new Error('Published source evidence does not match source manifest bytes.');
  }
  const [tag, release, asset, releaseAssets] = await Promise.all([
    github.getTag(identity.tagName),
    github.getRelease(evidence.releaseId),
    github.getAsset(evidence.releaseAssetId),
    github.getReleaseAssets(evidence.releaseId),
  ]);
  if (!tag || !['annotated', 'signed'].includes(tag.tagType) ||
      tag.commitSha?.toLowerCase() !== candidate.commitSha) {
    throw new Error('Canonical Android tag changed after source publication.');
  }
  if (!release || release.id !== evidence.releaseId || release.tagName !== identity.tagName ||
      release.draft !== false || release.prerelease !== false) {
    throw new Error('Canonical source release changed after source publication.');
  }
  requireSourceReleaseNotes(release, identity);
  if (!asset || asset.id !== evidence.releaseAssetId ||
      asset.name !== 'android-source-manifest.json' || asset.sha256 !== digest) {
    throw new Error('Canonical source manifest asset changed after source publication.');
  }
  if (!Array.isArray(releaseAssets) || releaseAssets.length !== 1 ||
      releaseAssets[0]?.id !== asset.id ||
      releaseAssets[0]?.name !== 'android-source-manifest.json' ||
      releaseAssets[0]?.sha256?.toLowerCase() !== digest ||
      releaseAssets[0]?.size !== sourceManifestBytes.length) {
    throw new Error('Published canonical source release must remain source-only.');
  }
}

module.exports = {
  ANDROID_APPLICATION_ID,
  ANDROID_RELEASES_URL,
  createAndroidReleaseIdentity,
  prepareSourceDraft,
  publishSourceRelease,
  selectPlayUniversalApk,
  downloadPlayUniversalApk,
  verifyGeneratedApkContract,
  parseApkBadging,
  parseApkSignerCertificate,
  inspectGeneratedApk,
  prepareBinaryEvidence,
  binaryReleaseNotes,
  publishBinaryRelease,
  requireExactSourceManifest,
  sourceReleaseNotes,
  requirePlayReadyInputs,
  requirePublishedSourceRelease,
  measureArtifact,
};
