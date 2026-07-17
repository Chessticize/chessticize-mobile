#!/usr/bin/env node

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
  const errors = [];
  const requireEqual = (actual, expectedValue, label) => {
    if (actual !== expectedValue) {
      errors.push(`${label} is ${JSON.stringify(actual)}; expected ${JSON.stringify(expectedValue)}.`);
    }
  };
  const candidateFields = [
    ['commitSha', 'commit SHA'],
    ['aabSha256', 'AAB SHA-256'],
    ['applicationId', 'application ID'],
    ['versionName', 'version name'],
    ['versionCode', 'version code'],
  ];
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
    if (!record?.candidate || typeof record.candidate !== 'object') {
      errors.push(`${label} must include an exact candidate binding.`);
    }
    for (const [field, fieldLabel] of candidateFields) {
      requireEqual(record?.candidate?.[field], expected[field], `${label} candidate ${fieldLabel}`);
    }
    return record;
  };

  requireEqual(evidence?.schemaVersion, 2, 'Owner evidence schemaVersion');
  requireEqual(evidence?.candidate?.commitSha, expected.commitSha, 'Candidate commit SHA');
  requireEqual(evidence?.candidate?.aabSha256, expected.aabSha256, 'Candidate AAB SHA-256');
  requireEqual(evidence?.candidate?.applicationId, expected.applicationId, 'Candidate application ID');
  requireEqual(evidence?.candidate?.versionName, expected.versionName, 'Candidate version name');
  requireEqual(evidence?.candidate?.versionCode, expected.versionCode, 'Candidate version code');

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
    const errors = inspectOwnerEvidence(evidence, {
      commitSha,
      aabSha256: result.bundle.sha256,
      ...expectedIdentity,
      uploadCertificateSha256,
    });
    if (errors.length > 0) {
      throw new Error(`Owner evidence is incomplete:\n${errors.join('\n')}`);
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
  EXPECTED_ABIS,
  REQUIRED_NOTICES,
  REQUIRED_RUNTIME_ASSETS,
  inspectAndroidPlayRelease,
  inspectBundleEntries,
  inspectOwnerEvidence,
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
