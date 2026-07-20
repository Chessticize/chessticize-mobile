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
const {
  requireDigest,
  requireSafePositiveInteger,
} = require('./android-release-validation');

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
    'Google Play distributes the release binary first. Its Play-signed universal APK may be mirrored here afterward for manual installation.',
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
  });
  const requireExactRelease = (release, allowedDraftStates) => {
    if (!release || !Number.isSafeInteger(release.id) || release.id < 1 ||
        release.tagName !== identity.tagName ||
        release.name !== releaseName || !allowedDraftStates.includes(release.draft) ||
        release.prerelease !== false) {
      throw new Error('The canonical Android release already exists in a conflicting state.');
    }
    requireSourceReleaseNotes(release, identity);
  };
  const reconcileExactDraft = async release => {
    requireExactRelease(release, [true, false]);
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
    requireExactRelease(release, [true]);
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
    throw new Error('Source publication requires an authorized release execution.');
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

async function publishCorrespondingSource(input, dependencies) {
  const draftEvidence = await prepareSourceDraft(input, dependencies);
  return publishSourceRelease({
    ...input,
    draftEvidence,
    publicationApproved: true,
  }, dependencies);
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
  const measurement = measureArtifact(apkBytes);
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

  return {
    bytes: measurement.bytes,
    sha256: measurement.sha256,
    applicationId: inspection.applicationId,
    versionName: inspection.versionName,
    versionCode: inspection.versionCode,
    signerCertificateSha256: expectedCertificate,
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
  };
}

function binaryReleaseNotes(identity, verifiedApk) {
  return [
    '# Chessticize Android ' + identity.publicVersion + ' (' + identity.versionCode + ')',
    '',
    'This APK was generated and signed by Google Play after the corresponding Play release.',
    'It is mirrored here for manual installation; Chessticize does not self-update from GitHub.',
    'Package: ' + verifiedApk.applicationId,
    'Play signing certificate SHA-256: ' + verifiedApk.signerCertificateSha256,
    'APK SHA-256: ' + verifiedApk.sha256,
    'Corresponding source: ' + ANDROID_SOURCE_REPOSITORY_URL + '/tree/' + identity.tagName,
  ].join('\n');
}

function checksumBytesFor(identity, verifiedApk) {
  return Buffer.from(verifiedApk.sha256 + '  ' + identity.apkName + '\n');
}

function requireExactAsset(asset, expected, label) {
  if (!asset || !Number.isSafeInteger(asset.id) || asset.id < 1 ||
      asset.name !== expected.name ||
      asset.sha256?.toLowerCase() !== expected.sha256 ||
      asset.size !== expected.size) {
    throw new Error('Canonical release contains a conflicting ' + label + ' asset.');
  }
  return asset;
}

async function mirrorPlayGeneratedApk(input, {
  github,
  play,
  inspectApk = inspectGeneratedApk,
}) {
  const identity = createAndroidReleaseIdentity(input.releaseVersion);
  const candidate = requireExactSourceManifest(input.sourceManifest, identity);
  if (!Buffer.isBuffer(input.sourceManifestBytes)) {
    throw new Error('Source manifest bytes are required.');
  }
  const appSigningCertificateSha256 = normalizeFingerprint(
    input.appSigningCertificateSha256,
  ).toLowerCase();
  const sourceManifestSha256 = sha256Bytes(input.sourceManifestBytes);
  const releaseName = 'Chessticize Android ' + identity.publicVersion +
    ' (' + identity.versionCode + ')';

  const [tag, release] = await Promise.all([
    github.getTag(identity.tagName),
    github.getReleaseByTag(identity.tagName),
  ]);
  if (!tag || !['annotated', 'signed'].includes(tag.tagType) ||
      tag.commitSha?.toLowerCase() !== candidate.commitSha) {
    throw new Error('Canonical Android tag is missing or changed before APK mirroring.');
  }
  if (!release || !Number.isSafeInteger(release.id) || release.id < 1 ||
      release.tagName !== identity.tagName || release.name !== releaseName ||
      release.draft !== false || release.prerelease !== false) {
    throw new Error('Published corresponding-source release is missing or conflicting.');
  }

  const initialAssets = await github.getReleaseAssets(release.id);
  if (!Array.isArray(initialAssets)) {
    throw new Error('GitHub release assets response is unavailable.');
  }
  const allowedNames = new Set([
    'android-source-manifest.json',
    identity.apkName,
    identity.checksumName,
  ]);
  if (initialAssets.some(asset => !allowedNames.has(asset?.name))) {
    throw new Error('Canonical release contains an unexpected release asset.');
  }
  const sourceAssets = initialAssets.filter(
    asset => asset?.name === 'android-source-manifest.json',
  );
  const sourceAsset = requireExactAsset(sourceAssets[0], {
    name: 'android-source-manifest.json',
    sha256: sourceManifestSha256,
    size: input.sourceManifestBytes.length,
  }, 'source manifest');
  if (sourceAssets.length !== 1) {
    throw new Error('Canonical release must contain exactly one source manifest asset.');
  }

  const downloaded = await downloadPlayUniversalApk({
    identity,
    appSigningCertificateSha256,
  }, { play });
  const apkPath = typeof downloaded.apkBytes === 'string'
    ? downloaded.apkBytes
    : downloaded.apkBytes?.path;
  const verifiedApk = verifyGeneratedApkContract({
    apkBytes: downloaded.apkBytes,
    inspection: inspectApk(apkPath),
    expected: {
      identity,
      appSigningCertificateSha256,
    },
  });
  const checksumBytes = checksumBytesFor(identity, verifiedApk);
  const checksumSha256 = sha256Bytes(checksumBytes);
  const sourceBody = sourceReleaseNotes(identity);
  const desiredBody = sourceBody + '\n\n---\n\n' + binaryReleaseNotes(identity, verifiedApk);
  const releaseBody = String(release.body ?? '');
  if (releaseBody !== sourceBody && releaseBody !== desiredBody) {
    throw new Error('Canonical Android release notes changed before APK mirroring.');
  }

  const expectedAssets = new Map([
    [identity.checksumName, {
      name: identity.checksumName,
      bytes: checksumBytes,
      sha256: checksumSha256,
      size: checksumBytes.length,
      label: 'APK checksum',
    }],
    [identity.apkName, {
      name: identity.apkName,
      bytes: downloaded.apkBytes,
      sha256: verifiedApk.sha256,
      size: verifiedApk.bytes,
      label: 'Play-generated APK',
    }],
  ]);
  const reconciled = new Map();
  for (const [name, expected] of expectedAssets) {
    const matches = initialAssets.filter(asset => asset?.name === name);
    if (matches.length > 1) {
      throw new Error('Canonical release contains duplicate ' + expected.label + ' assets.');
    }
    if (matches.length === 1) {
      reconciled.set(name, requireExactAsset(matches[0], expected, expected.label));
    }
  }

  async function uploadMissing(name) {
    if (reconciled.has(name)) return;
    const expected = expectedAssets.get(name);
    const uploaded = await github.uploadAsset({
      releaseId: release.id,
      name,
      bytes: expected.bytes,
    });
    reconciled.set(name, requireExactAsset(uploaded, expected, expected.label));
  }

  await uploadMissing(identity.checksumName);
  if (releaseBody !== desiredBody) {
    const updated = await github.updateRelease({
      releaseId: release.id,
      body: desiredBody,
      draft: false,
    });
    if (!updated || updated.id !== release.id ||
        updated.tagName !== identity.tagName ||
        updated.draft !== false ||
        String(updated.body ?? '') !== desiredBody) {
      throw new Error('GitHub did not preserve the APK mirror release notes.');
    }
  }
  await uploadMissing(identity.apkName);

  const [finalRelease, finalAssets] = await Promise.all([
    github.getRelease(release.id),
    github.getReleaseAssets(release.id),
  ]);
  if (!finalRelease || finalRelease.id !== release.id ||
      finalRelease.tagName !== identity.tagName ||
      finalRelease.draft !== false ||
      finalRelease.prerelease !== false ||
      String(finalRelease.body ?? '') !== desiredBody ||
      !Array.isArray(finalAssets) ||
      finalAssets.length !== 3) {
    throw new Error('GitHub APK mirror state could not be reconciled after publication.');
  }
  const finalSourceAssets = finalAssets.filter(
    asset => asset?.name === 'android-source-manifest.json',
  );
  const finalSource = requireExactAsset(finalSourceAssets[0], {
    name: 'android-source-manifest.json',
    sha256: sourceManifestSha256,
    size: input.sourceManifestBytes.length,
  }, 'source manifest');
  if (finalSourceAssets.length !== 1 || finalSource.id !== sourceAsset.id) {
    throw new Error('Canonical source manifest asset changed during APK mirroring.');
  }
  for (const [name, expected] of expectedAssets) {
    const matches = finalAssets.filter(asset => asset?.name === name);
    if (matches.length !== 1) {
      throw new Error('GitHub APK mirror is missing the exact ' + expected.label + ' asset.');
    }
    reconciled.set(name, requireExactAsset(matches[0], expected, expected.label));
  }

  return {
    schemaVersion: 1,
    phase: 'play-apk-mirrored',
    tagName: identity.tagName,
    commitSha: candidate.commitSha,
    applicationId: identity.applicationId,
    versionName: identity.publicVersion,
    versionCode: identity.versionCode,
    aabSha256: candidate.aabSha256,
    sourceManifestSha256,
    releaseId: release.id,
    releaseUrl: finalRelease.htmlUrl ?? release.htmlUrl,
    sourceManifestAssetId: sourceAsset.id,
    playDownloadId: downloaded.downloadId,
    apk: {
      name: identity.apkName,
      bytes: verifiedApk.bytes,
      sha256: verifiedApk.sha256,
      signerCertificateSha256: verifiedApk.signerCertificateSha256,
      assetId: reconciled.get(identity.apkName).id,
    },
    checksum: {
      name: identity.checksumName,
      sha256: checksumSha256,
      assetId: reconciled.get(identity.checksumName).id,
    },
  };
}

module.exports = {
  ANDROID_APPLICATION_ID,
  ANDROID_RELEASES_URL,
  createAndroidReleaseIdentity,
  prepareSourceDraft,
  publishSourceRelease,
  publishCorrespondingSource,
  selectPlayUniversalApk,
  downloadPlayUniversalApk,
  verifyGeneratedApkContract,
  parseApkBadging,
  parseApkSignerCertificate,
  inspectGeneratedApk,
  binaryReleaseNotes,
  mirrorPlayGeneratedApk,
  requireExactSourceManifest,
  sourceReleaseNotes,
  measureArtifact,
};
