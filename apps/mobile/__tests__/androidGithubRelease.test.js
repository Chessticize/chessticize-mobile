const {
  createAndroidReleaseIdentity,
  prepareSourceDraft,
  publishSourceRelease,
  selectPlayUniversalApk,
  verifyGeneratedApkContract,
  prepareBinaryEvidence,
  publishBinaryRelease,
  binaryReleaseNotes,
  downloadPlayUniversalApk,
  parseApkBadging,
  parseApkSignerCertificate,
  sourceReleaseNotes,
} = require('../scripts/android-github-release');
const {
  GitHubReleasesClient,
  PlayGeneratedApksClient,
} = require('../scripts/android-github-release-clients');
const {
  requireDigest,
  requireSafePositiveInteger,
} = require('../scripts/android-release-validation');

const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const releaseVersion = {
  publicVersion: '1.1',
  androidVersionCode: 7,
  iosBuildNumber: 12,
};

function sourceManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    status: 'artifact-only',
    commitSha: 'a'.repeat(40),
    worktreeClean: true,
    bundle: {
      sha256: 'b'.repeat(64),
      applicationId: 'com.chessticize.mobile',
      versionName: '1.1',
      versionCode: 7,
    },
    ...overrides,
  };
}

function manifestBytes(manifest = sourceManifest()) {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
}

class FakeGitHubReleasesClient {
  constructor({ release, asset, assets, nextAssetId = 42 } = {}) {
    this.createdReleases = [];
    this.uploadedAssets = [];
    this.updatedReleases = [];
    this.release = release;
    this.asset = asset;
    this.assets = assets ?? (asset ? [asset] : []);
    this.deletedAssets = [];
    this.deletedReleases = [];
    this.nextAssetId = nextAssetId;
  }

  async getTag(tagName) {
    return { tagName, tagType: 'annotated', commitSha: 'a'.repeat(40) };
  }

  async getReleaseByTag() {
    return this.release ?? null;
  }

  async getRelease(releaseId) {
    return this.release?.id === releaseId ? this.release : null;
  }

  async getAsset(assetId) {
    return this.asset?.id === assetId ? this.asset : null;
  }

  async createRelease(input) {
    this.createdReleases.push(input);
    this.release = { id: 41, ...input, htmlUrl: 'https://github.com/Chessticize/chessticize-mobile/releases/tag/android-v1.1.0-build-7' };
    return this.release;
  }

  async uploadAsset(input) {
    this.uploadedAssets.push(input);
    const asset = {
      id: this.nextAssetId++,
      name: input.name,
      sha256: crypto.createHash('sha256').update(input.bytes).digest('hex'),
      size: input.bytes.length,
    };
    this.assets.push(asset);
    return asset;
  }

  async updateRelease(input) {
    this.updatedReleases.push(input);
    this.release = { ...this.release, ...input };
    return this.release;
  }

  async getReleaseAssets() {
    return this.assets;
  }

  async deleteAsset(assetId) {
    this.deletedAssets.push(assetId);
    this.assets = this.assets.filter(asset => asset.id !== assetId);
  }

  async deleteRelease(releaseId) {
    this.deletedReleases.push(releaseId);
  }
}

class FakePlayGeneratedApksClient {
  constructor({ listing, apkBytes, listError, downloadError }) {
    this.listing = listing;
    this.apkBytes = apkBytes;
    this.listError = listError;
    this.downloadError = downloadError;
    this.downloads = [];
  }

  async listGeneratedApks() {
    if (this.listError) throw this.listError;
    return this.listing;
  }

  async downloadGeneratedApk(input) {
    this.downloads.push(input);
    if (this.downloadError) throw this.downloadError;
    return this.apkBytes;
  }
}

function binaryPublicationFixture() {
  const identity = createAndroidReleaseIdentity(releaseVersion);
  const apkBytes = Buffer.from('deterministic-play-generated-universal-apk');
  const apkSha256 = crypto.createHash('sha256').update(apkBytes).digest('hex');
  const checksumBytes = Buffer.from(`${apkSha256}  ${identity.apkName}\n`);
  const sourceBytes = manifestBytes();
  const sourceSha256 = crypto.createHash('sha256').update(sourceBytes).digest('hex');
  const binaryEvidence = {
    schemaVersion: 1,
    phase: 'binary-prepared',
    publicationApproved: false,
    releaseId: 41,
    sourceManifestAssetId: 42,
    sourceManifestSha256: sourceSha256,
    tagName: identity.tagName,
    candidate: {
      commitSha: 'a'.repeat(40),
      aabSha256: 'b'.repeat(64),
      applicationId: identity.applicationId,
      versionName: identity.publicVersion,
      versionCode: identity.versionCode,
    },
    playDownloadId: 'universal-download-7',
    apk: {
      name: identity.apkName,
      bytes: apkBytes.length,
      sha256: apkSha256,
      applicationId: identity.applicationId,
      versionName: identity.publicVersion,
      versionCode: identity.versionCode,
      signerCertificateSha256: 'd'.repeat(64),
      abis: ['arm64-v8a', 'x86_64'],
      pageSizeCompatibility: '16-kib-compatible',
    },
    checksum: {
      name: identity.checksumName,
      sha256: crypto.createHash('sha256').update(checksumBytes).digest('hex'),
    },
    releaseNotes: binaryReleaseNotes(identity, {
      applicationId: identity.applicationId,
      signerCertificateSha256: 'd'.repeat(64),
      sha256: apkSha256,
    }),
  };
  const inspection = {
    applicationId: identity.applicationId,
    versionName: identity.publicVersion,
    versionCode: identity.versionCode,
    signerCertificateSha256: 'd'.repeat(64),
    abis: ['arm64-v8a', 'x86_64'],
    zipAligned16KiB: true,
    elfAligned16KiB: true,
    debuggable: false,
    testOnly: false,
    internetPermission: false,
  };
  const sourceAsset = {
    id: 42,
    name: 'android-source-manifest.json',
    sha256: sourceSha256,
    size: sourceBytes.length,
  };
  const github = new FakeGitHubReleasesClient({
    release: {
      id: 41,
      tagName: identity.tagName,
      targetCommitish: 'main',
      draft: false,
      prerelease: false,
      body: sourceReleaseNotes(identity),
    },
    asset: sourceAsset,
    assets: [sourceAsset],
    nextAssetId: 50,
  });
  const input = {
    releaseVersion,
    binaryEvidence,
    sourceManifestBytes: sourceBytes,
    apkBytes,
    checksumBytes,
    apkInspection: inspection,
  };
  return {
    identity,
    apkBytes,
    apkSha256,
    checksumBytes,
    sourceBytes,
    sourceSha256,
    binaryEvidence,
    inspection,
    sourceAsset,
    github,
    input,
  };
}

describe('Android GitHub release automation', () => {
  it('shares strict retained-evidence integer and digest validation', () => {
    expect(requireSafePositiveInteger(1, 'Workflow ID')).toBeUndefined();
    expect(() => requireSafePositiveInteger(0, 'Workflow ID')).toThrow(
      'Workflow ID must be a positive integer',
    );
    expect(requireDigest('A'.repeat(64), 'Archive digest')).toBe('a'.repeat(64));
    expect(() => requireDigest('not-a-digest', 'Archive digest')).toThrow(
      'Archive digest must be a SHA-256 digest',
    );
  });

  it('derives the canonical Android release identity from the unified release version', () => {
    expect(createAndroidReleaseIdentity({
      publicVersion: '1.1',
      androidVersionCode: 7,
      iosBuildNumber: 12,
    })).toEqual({
      applicationId: 'com.chessticize.mobile',
      publicVersion: '1.1',
      versionCode: 7,
      tagName: 'android-v1.1.0-build-7',
      apkName: 'Chessticize-Android-1.1.apk',
      checksumName: 'Chessticize-Android-1.1.apk.sha256',
      releasesUrl: 'https://github.com/Chessticize/chessticize-mobile/releases',
    });
  });

  it('prepares one canonical source draft without publishing it', async () => {
    const github = new FakeGitHubReleasesClient();
    const bytes = manifestBytes();

    const evidence = await prepareSourceDraft({
      releaseVersion,
      sourceManifest: sourceManifest(),
      sourceManifestBytes: bytes,
      protectedWorkflow: {
        runId: 31,
        artifactId: 32,
        artifactName: `android-signed-release-candidate-${'a'.repeat(40)}`,
        archiveSha256: 'c'.repeat(64),
      },
    }, { github });

    expect(github.createdReleases).toEqual([
      expect.objectContaining({
        tagName: 'android-v1.1.0-build-7',
        targetCommitish: 'a'.repeat(40),
        draft: true,
        prerelease: false,
      }),
    ]);
    expect(github.createdReleases[0].body).toContain('android-v1.1.0-build-7');
    expect(github.createdReleases[0].body).toContain('https://github.com/Chessticize/chessticize-mobile');
    expect(github.uploadedAssets).toEqual([
      { releaseId: 41, name: 'android-source-manifest.json', bytes },
    ]);
    expect(evidence).toEqual(expect.objectContaining({
      schemaVersion: 1,
      phase: 'source-draft-prepared',
      releaseId: 41,
      releaseAssetId: 42,
      tagName: 'android-v1.1.0-build-7',
      commitSha: 'a'.repeat(40),
      sourceManifestSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    }));
    expect(evidence.publicationApproved).toBe(false);

    const reconciled = await prepareSourceDraft({
      releaseVersion,
      sourceManifest: sourceManifest(),
      sourceManifestBytes: bytes,
      protectedWorkflow: {
        runId: 31,
        artifactId: 32,
        artifactName: `android-signed-release-candidate-${'a'.repeat(40)}`,
        archiveSha256: 'c'.repeat(64),
      },
    }, { github });
    expect(reconciled).toEqual(evidence);
    expect(github.createdReleases).toHaveLength(1);
    expect(github.uploadedAssets).toHaveLength(1);
  });

  it('removes a newly created source draft when its exact manifest cannot be retained', async () => {
    const github = new FakeGitHubReleasesClient();
    github.uploadAsset = async () => {
      throw new Error('GitHub upload HTTP 503');
    };

    await expect(prepareSourceDraft({
      releaseVersion,
      sourceManifest: sourceManifest(),
      sourceManifestBytes: manifestBytes(),
      protectedWorkflow: {
        runId: 31,
        artifactId: 32,
        artifactName: `android-signed-release-candidate-${'a'.repeat(40)}`,
        archiveSha256: 'c'.repeat(64),
      },
    }, { github })).rejects.toThrow('GitHub upload HTTP 503');

    expect(github.deletedReleases).toEqual([41]);
  });

  it('recovers an exact empty draft when the create-release response is lost', async () => {
    const github = new FakeGitHubReleasesClient();
    const createRelease = github.createRelease.bind(github);
    github.createRelease = async input => {
      await createRelease(input);
      throw new Error('GitHub response lost after draft creation');
    };
    const bytes = manifestBytes();

    const evidence = await prepareSourceDraft({
      releaseVersion,
      sourceManifest: sourceManifest(),
      sourceManifestBytes: bytes,
      protectedWorkflow: {
        runId: 31,
        artifactId: 32,
        artifactName: `android-signed-release-candidate-${'a'.repeat(40)}`,
        archiveSha256: 'c'.repeat(64),
      },
    }, { github });

    expect(github.createdReleases).toHaveLength(1);
    expect(github.uploadedAssets).toEqual([
      { releaseId: 41, name: 'android-source-manifest.json', bytes },
    ]);
    expect(evidence).toEqual(expect.objectContaining({
      phase: 'source-draft-prepared',
      releaseId: 41,
      releaseAssetId: 42,
    }));
  });

  it('removes a release that GitHub unexpectedly creates as public', async () => {
    const github = new FakeGitHubReleasesClient();
    const createRelease = github.createRelease.bind(github);
    github.createRelease = async input => ({
      ...await createRelease(input),
      draft: false,
    });

    await expect(prepareSourceDraft({
      releaseVersion,
      sourceManifest: sourceManifest(),
      sourceManifestBytes: manifestBytes(),
      protectedWorkflow: {
        runId: 31,
        artifactId: 32,
        artifactName: `android-signed-release-candidate-${'a'.repeat(40)}`,
        archiveSha256: 'c'.repeat(64),
      },
    }, { github })).rejects.toThrow('conflicting state');

    expect(github.deletedReleases).toEqual([41]);
    expect(github.uploadedAssets).toEqual([]);
  });

  it('publishes source only through the separately approved canonical release phase', async () => {
    const bytes = manifestBytes();
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    const draftEvidence = {
      schemaVersion: 1,
      phase: 'source-draft-prepared',
      publicationApproved: false,
      releaseId: 41,
      releaseAssetId: 42,
      tagName: 'android-v1.1.0-build-7',
      commitSha: 'a'.repeat(40),
      sourceManifestSha256: digest,
      candidate: {
        commitSha: 'a'.repeat(40),
        aabSha256: 'b'.repeat(64),
        applicationId: 'com.chessticize.mobile',
        versionName: '1.1',
        versionCode: 7,
      },
    };
    const github = new FakeGitHubReleasesClient({
      release: {
        id: 41,
        tagName: 'android-v1.1.0-build-7',
        targetCommitish: 'main',
        draft: true,
        prerelease: false,
        body: 'edited draft notes',
      },
      asset: {
        id: 42,
        name: 'android-source-manifest.json',
        sha256: digest,
        size: bytes.length,
      },
    });

    await expect(publishSourceRelease({
      releaseVersion,
      sourceManifest: sourceManifest(),
      sourceManifestBytes: bytes,
      draftEvidence,
      publicationApproved: false,
    }, { github })).rejects.toThrow('protected human approval');
    expect(github.updatedReleases).toEqual([]);

    await expect(publishSourceRelease({
      releaseVersion,
      sourceManifest: sourceManifest(),
      sourceManifestBytes: bytes,
      draftEvidence,
      publicationApproved: true,
    }, { github })).rejects.toThrow('source release notes changed');
    github.release.body = sourceReleaseNotes(createAndroidReleaseIdentity(releaseVersion));

    github.assets.push({ id: 43, name: 'unapproved.apk', sha256: 'f'.repeat(64), size: 9 });
    await expect(publishSourceRelease({
      releaseVersion,
      sourceManifest: sourceManifest(),
      sourceManifestBytes: bytes,
      draftEvidence,
      publicationApproved: true,
    }, { github })).rejects.toThrow('source-only');
    github.assets = github.assets.filter(asset => asset.id !== 43);

    const updateRelease = github.updateRelease.bind(github);
    github.updateRelease = async update => {
      await updateRelease(update);
      throw new Error('GitHub response lost after source publication');
    };

    await expect(publishSourceRelease({
      releaseVersion,
      sourceManifest: sourceManifest(),
      sourceManifestBytes: bytes,
      draftEvidence,
      publicationApproved: true,
    }, { github })).rejects.toThrow('response lost after source publication');
    expect(github.release.draft).toBe(false);

    const evidence = await publishSourceRelease({
      releaseVersion,
      sourceManifest: sourceManifest(),
      sourceManifestBytes: bytes,
      draftEvidence,
      publicationApproved: true,
    }, { github });

    expect(github.updatedReleases).toEqual([{ releaseId: 41, draft: false }]);
    expect(evidence).toEqual(expect.objectContaining({
      phase: 'source-published',
      publicationApproved: true,
      releaseId: 41,
      releaseAssetId: 42,
      tagName: 'android-v1.1.0-build-7',
      sourceManifestSha256: digest,
    }));
  });

  it('selects the one Play-generated universal APK signed by the approved app-signing key', () => {
    const certificate = Buffer.from('d'.repeat(64), 'hex').toString('base64');
    expect(selectPlayUniversalApk({
      generatedApks: [{
        certificateSha256Hash: certificate,
        generatedUniversalApk: { downloadId: 'universal-download-7' },
        targetingInfo: { packageName: 'com.chessticize.mobile' },
      }],
    }, {
      applicationId: 'com.chessticize.mobile',
      appSigningCertificateSha256: 'd'.repeat(64),
    })).toEqual({
      downloadId: 'universal-download-7',
      certificateSha256: 'd'.repeat(64),
    });

    for (const [, listing, message] of [
      ['unavailable response', undefined, 'Generated APKs API response'],
      ['wrong package', {
        generatedApks: [{
          certificateSha256Hash: certificate,
          generatedUniversalApk: { downloadId: 'download' },
          targetingInfo: { packageName: 'wrong.package' },
        }],
      }, 'package identity'],
      ['wrong certificate', {
        generatedApks: [{
          certificateSha256Hash: Buffer.from('e'.repeat(64), 'hex').toString('base64'),
          generatedUniversalApk: { downloadId: 'download' },
          targetingInfo: { packageName: 'com.chessticize.mobile' },
        }],
      }, 'app-signing certificate'],
      ['missing universal APK', {
        generatedApks: [{
          certificateSha256Hash: certificate,
          targetingInfo: { packageName: 'com.chessticize.mobile' },
        }],
      }, 'universal APK'],
      ['ambiguous universal APK', {
        generatedApks: [1, 2].map(index => ({
          certificateSha256Hash: certificate,
          generatedUniversalApk: { downloadId: `download-${index}` },
          targetingInfo: { packageName: 'com.chessticize.mobile' },
        })),
      }, 'exactly one'],
    ]) {
      expect(() => selectPlayUniversalApk(listing, {
        applicationId: 'com.chessticize.mobile',
        appSigningCertificateSha256: 'd'.repeat(64),
      })).toThrow(message);
    }
  });

  it('fails closed when the official Play Generated APKs API list or download fails', async () => {
    const identity = createAndroidReleaseIdentity(releaseVersion);
    const certificate = Buffer.from('d'.repeat(64), 'hex').toString('base64url');
    const listing = {
      generatedApks: [{
        certificateSha256Hash: certificate,
        generatedUniversalApk: { downloadId: 'universal-download-7' },
        targetingInfo: { packageName: identity.applicationId },
      }],
    };
    const apkBytes = Buffer.from('play-apk');
    const play = new FakePlayGeneratedApksClient({ listing, apkBytes });
    await expect(downloadPlayUniversalApk({
      identity,
      appSigningCertificateSha256: 'd'.repeat(64),
    }, { play })).resolves.toEqual({
      apkBytes,
      certificateSha256: 'd'.repeat(64),
      downloadId: 'universal-download-7',
    });
    expect(play.downloads).toEqual([{
      packageName: identity.applicationId,
      versionCode: identity.versionCode,
      downloadId: 'universal-download-7',
    }]);

    await expect(downloadPlayUniversalApk({
      identity,
      appSigningCertificateSha256: 'd'.repeat(64),
    }, {
      play: new FakePlayGeneratedApksClient({ listError: new Error('HTTP 503') }),
    })).rejects.toThrow('Generated APKs API list failed');
    await expect(downloadPlayUniversalApk({
      identity,
      appSigningCertificateSha256: 'd'.repeat(64),
    }, {
      play: new FakePlayGeneratedApksClient({
        listing,
        downloadError: new Error('HTTP 409'),
      }),
    })).rejects.toThrow('Generated APK download failed');
  });

  it('uses the official scoped API path and streams generated APK bytes to a protected file', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-play-apk-'));
    const destinationPath = path.join(directory, 'generated.apk');
    const apkBytes = Buffer.from('streamed-play-generated-apk');
    const calls = [];
    const client = new PlayGeneratedApksClient({
      accessToken: 'external-boundary-token',
      destinationPath,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return url.endsWith(':download')
          ? new Response(apkBytes)
          : new Response(JSON.stringify({ generatedApks: [] }), {
            headers: { 'Content-Type': 'application/json' },
          });
      },
    });

    try {
      await client.listGeneratedApks({
        packageName: 'com.chessticize.mobile',
        versionCode: 7,
      });
      const artifact = await client.downloadGeneratedApk({
        packageName: 'com.chessticize.mobile',
        versionCode: 7,
        downloadId: 'official-download-id',
      });

      expect(calls.map(call => call.url)).toEqual([
        'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.chessticize.mobile/generatedApks/7',
        'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.chessticize.mobile/generatedApks/7/downloads/official-download-id:download',
      ]);
      expect(calls[0].options.headers).toEqual({
        Authorization: 'Bearer external-boundary-token',
      });
      expect(artifact).toEqual({ path: destinationPath });
      expect(fs.readFileSync(destinationPath)).toEqual(apkBytes);
      expect(fs.existsSync(`${destinationPath}.partial`)).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('redacts GitHub credentials from external API failures', async () => {
    const client = new GitHubReleasesClient({
      token: 'must-never-appear-in-an-error',
      fetchImpl: async () => new Response('permission denied', { status: 403 }),
    });

    await expect(client.getRelease(41)).rejects.toThrow(
      'GitHub API GET 403: permission denied',
    );
    await expect(client.getRelease(41)).rejects.not.toThrow(
      'must-never-appear-in-an-error',
    );
  });

  it('fails closed on every Play-generated APK identity and integrity mismatch', () => {
    const apkBytes = Buffer.from('deterministic-play-generated-universal-apk');
    const sha256 = crypto.createHash('sha256').update(apkBytes).digest('hex');
    const inspection = {
      applicationId: 'com.chessticize.mobile',
      versionName: '1.1',
      versionCode: 7,
      signerCertificateSha256: 'd'.repeat(64),
      abis: ['arm64-v8a', 'x86_64'],
      zipAligned16KiB: true,
      elfAligned16KiB: true,
      debuggable: false,
      testOnly: false,
      internetPermission: false,
    };
    const expected = {
      identity: createAndroidReleaseIdentity(releaseVersion),
      appSigningCertificateSha256: 'd'.repeat(64),
      minimumBytes: apkBytes.length - 1,
      maximumBytes: apkBytes.length + 1,
      recordedBytes: apkBytes.length,
      expectedSha256: sha256,
    };

    expect(verifyGeneratedApkContract({ apkBytes, inspection, expected })).toEqual({
      bytes: apkBytes.length,
      sha256,
      applicationId: 'com.chessticize.mobile',
      versionName: '1.1',
      versionCode: 7,
      signerCertificateSha256: 'd'.repeat(64),
      abis: ['arm64-v8a', 'x86_64'],
      pageSizeCompatibility: '16-kib-compatible',
    });

    for (const [mutateInspection, mutateExpected, message] of [
      [value => { value.applicationId = 'wrong.package'; }, () => {}, 'package identity'],
      [value => { value.versionName = '1.2'; }, () => {}, 'public version'],
      [value => { value.versionCode = 8; }, () => {}, 'build number'],
      [value => { value.signerCertificateSha256 = 'e'.repeat(64); }, () => {}, 'app-signing certificate'],
      [value => { value.abis = ['arm64-v8a']; }, () => {}, 'ABIs'],
      [value => { value.abis = ['arm64-v8a', 'x86_64', 'armeabi-v7a']; }, () => {}, 'ABIs'],
      [value => { value.zipAligned16KiB = false; }, () => {}, '16 KB page-size'],
      [value => { value.elfAligned16KiB = false; }, () => {}, '16 KB page-size'],
      [value => { value.debuggable = true; }, () => {}, 'debuggable'],
      [value => { value.testOnly = true; }, () => {}, 'test-only'],
      [value => { value.internetPermission = true; }, () => {}, 'INTERNET'],
      [() => {}, value => { value.expectedSha256 = 'f'.repeat(64); }, 'SHA-256'],
      [() => {}, value => { value.minimumBytes = apkBytes.length + 1; }, 'size bounds'],
      [() => {}, value => { value.recordedBytes = apkBytes.length + 1; }, 'recorded Play size'],
    ]) {
      const nextInspection = structuredClone(inspection);
      const nextExpected = structuredClone(expected);
      mutateInspection(nextInspection);
      mutateExpected(nextExpected);
      expect(() => verifyGeneratedApkContract({
        apkBytes,
        inspection: nextInspection,
        expected: nextExpected,
      })).toThrow(message);
    }
  });

  it('parses APK identity and exactly one signing certificate fail closed', () => {
    expect(parseApkBadging([
      "package: name='com.chessticize.mobile' versionCode='7' versionName='1.1' compileSdkVersion='36'",
      "uses-permission: name='android.permission.POST_NOTIFICATIONS'",
    ].join('\n'))).toEqual({
      applicationId: 'com.chessticize.mobile',
      versionName: '1.1',
      versionCode: 7,
      debuggable: false,
      testOnly: false,
      internetPermission: false,
    });
    expect(parseApkSignerCertificate(
      `Signer #1 certificate SHA-256 digest: ${'D'.repeat(64)}\nNumber of signers: 1\n`,
    )).toBe('d'.repeat(64));

    expect(() => parseApkBadging("package: name='wrong' versionCode='NaN'"))
      .toThrow('APK identity');
    expect(parseApkBadging([
      "package: name='com.chessticize.mobile' versionCode='7' versionName='1.1'",
      "uses-permission: name='android.permission.INTERNET'",
      'application-debuggable',
      'application-testOnly',
    ].join('\n'))).toEqual(expect.objectContaining({
      debuggable: true,
      testOnly: true,
      internetPermission: true,
    }));
    expect(() => parseApkSignerCertificate([
      `Signer #1 certificate SHA-256 digest: ${'D'.repeat(64)}`,
      `Signer #2 certificate SHA-256 digest: ${'E'.repeat(64)}`,
      'Number of signers: 2',
    ].join('\n'))).toThrow('exactly one signer');
  });

  it('prepares immutable APK, checksum, and truthful release-note evidence without publication', () => {
    const identity = createAndroidReleaseIdentity(releaseVersion);
    const apkBytes = Buffer.from('deterministic-play-generated-universal-apk');
    const sha256 = crypto.createHash('sha256').update(apkBytes).digest('hex');
    const verifiedApk = {
      bytes: apkBytes.length,
      sha256,
      applicationId: identity.applicationId,
      versionName: identity.publicVersion,
      versionCode: identity.versionCode,
      signerCertificateSha256: 'd'.repeat(64),
      abis: ['arm64-v8a', 'x86_64'],
      pageSizeCompatibility: '16-kib-compatible',
    };
    const prepared = prepareBinaryEvidence({
      releaseVersion,
      candidate: {
        commitSha: 'a'.repeat(40),
        aabSha256: 'b'.repeat(64),
        applicationId: identity.applicationId,
        versionName: identity.publicVersion,
        versionCode: identity.versionCode,
      },
      sourcePublicationEvidence: {
        phase: 'source-published',
        publicationApproved: true,
        releaseId: 41,
        releaseAssetId: 42,
        tagName: identity.tagName,
        commitSha: 'a'.repeat(40),
        sourceManifestSha256: 'c'.repeat(64),
      },
      playDownloadId: 'universal-download-7',
      verifiedApk,
      apkBytes,
    });

    expect(prepared.files.apk).toEqual({ name: identity.apkName, bytes: apkBytes });
    expect(prepared.files.checksum).toEqual({
      name: identity.checksumName,
      bytes: Buffer.from(`${sha256}  ${identity.apkName}\n`),
    });
    expect(prepared.evidence).toEqual(expect.objectContaining({
      schemaVersion: 1,
      phase: 'binary-prepared',
      publicationApproved: false,
      releaseId: 41,
      sourceManifestAssetId: 42,
      tagName: identity.tagName,
      playDownloadId: 'universal-download-7',
      apk: expect.objectContaining({ name: identity.apkName, sha256 }),
      checksum: expect.objectContaining({ name: identity.checksumName }),
    }));
    const notes = prepared.evidence.releaseNotes;
    expect(notes).toContain('manual installation');
    expect(notes).toContain('SHA-256');
    expect(notes).toContain('does not check GitHub for updates');
    expect(notes).toContain('same Android package and Play signing certificate');
    expect(notes).toContain('versionCode');
    expect(notes).toContain('no app telemetry');
    expect(notes).toContain(
      'https://github.com/Chessticize/chessticize-mobile/tree/android-v1.1.0-build-7',
    );
  });

  it('publishes the exact prepared binary only after separate protected approval', async () => {
    const {
      identity,
      apkBytes,
      apkSha256,
      checksumBytes,
      sourceBytes,
      sourceSha256,
      binaryEvidence,
      sourceAsset,
      github,
      input,
    } = binaryPublicationFixture();

    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: false,
    }, { github })).rejects.toThrow('protected human approval');
    expect(github.uploadedAssets).toEqual([]);

    const tamperedBodyGithub = new FakeGitHubReleasesClient({
      release: {
        ...github.release,
        body: `${sourceReleaseNotes(identity)}\nunapproved notes`,
      },
      asset: sourceAsset,
      assets: [sourceAsset],
      nextAssetId: 50,
    });
    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: tamperedBodyGithub })).rejects.toThrow('release body changed');

    const bodyMismatchApk = {
      id: 49,
      name: identity.apkName,
      sha256: apkSha256,
      size: apkBytes.length,
    };
    const bodyMismatchGithub = new FakeGitHubReleasesClient({
      release: {
        ...github.release,
        body: `${sourceReleaseNotes(identity)}\nunapproved notes`,
      },
      asset: sourceAsset,
      assets: [sourceAsset, bodyMismatchApk],
      nextAssetId: 50,
    });
    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: bodyMismatchGithub })).rejects.toThrow('release body changed');
    expect(bodyMismatchGithub.deletedAssets).toEqual([49]);

    const bodyCleanupFailureGithub = new FakeGitHubReleasesClient({
      release: {
        ...github.release,
        body: `${sourceReleaseNotes(identity)}\nunapproved notes`,
      },
      asset: sourceAsset,
      assets: [sourceAsset, bodyMismatchApk],
      nextAssetId: 50,
    });
    bodyCleanupFailureGithub.deleteAsset = async assetId => {
      bodyCleanupFailureGithub.deletedAssets.push(assetId);
      throw new Error('GitHub body-mismatch APK cleanup HTTP 403');
    };
    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: bodyCleanupFailureGithub })).rejects.toThrow(
      'Binary publication cleanup failed for APK asset 49',
    );

    const mismatchedSourceAsset = {
      ...sourceAsset,
      sha256: 'f'.repeat(64),
    };
    const sourceMismatchGithub = new FakeGitHubReleasesClient({
      release: { ...github.release },
      asset: mismatchedSourceAsset,
      assets: [mismatchedSourceAsset, bodyMismatchApk],
      nextAssetId: 50,
    });
    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: sourceMismatchGithub })).rejects.toThrow(
      'source manifest asset changed',
    );
    expect(sourceMismatchGithub.deletedAssets).toEqual([49]);

    const sourceCleanupFailureGithub = new FakeGitHubReleasesClient({
      release: { ...github.release },
      asset: mismatchedSourceAsset,
      assets: [mismatchedSourceAsset, bodyMismatchApk],
      nextAssetId: 50,
    });
    sourceCleanupFailureGithub.deleteAsset = async assetId => {
      sourceCleanupFailureGithub.deletedAssets.push(assetId);
      throw new Error('GitHub source-mismatch APK cleanup HTTP 403');
    };
    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: sourceCleanupFailureGithub })).rejects.toThrow(
      'Binary publication cleanup failed for APK asset 49',
    );

    const tamperedGithub = new FakeGitHubReleasesClient({
      release: { ...github.release },
      asset: sourceAsset,
      assets: [
        sourceAsset,
        { id: 49, name: 'unapproved-side-load.apk', sha256: 'f'.repeat(64), size: 9 },
      ],
      nextAssetId: 50,
    });
    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: tamperedGithub })).rejects.toThrow('unexpected release asset');
    expect(tamperedGithub.deletedAssets).toEqual([49]);

    const unexpectedCleanupFailureGithub = new FakeGitHubReleasesClient({
      release: { ...github.release },
      asset: sourceAsset,
      assets: [
        sourceAsset,
        { id: 49, name: 'unapproved-side-load.apk', sha256: 'f'.repeat(64), size: 9 },
      ],
      nextAssetId: 50,
    });
    unexpectedCleanupFailureGithub.deleteAsset = async assetId => {
      unexpectedCleanupFailureGithub.deletedAssets.push(assetId);
      throw new Error('GitHub unexpected APK cleanup HTTP 403');
    };
    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: unexpectedCleanupFailureGithub })).rejects.toThrow(
      'Binary publication cleanup failed for APK asset 49',
    );

    const wrongApkGithub = new FakeGitHubReleasesClient({
      release: { ...github.release },
      asset: sourceAsset,
      assets: [
        sourceAsset,
        { id: 48, name: identity.apkName, sha256: 'f'.repeat(64), size: apkBytes.length },
      ],
      nextAssetId: 50,
    });
    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: wrongApkGithub })).rejects.toThrow(
      'conflicting Play-generated APK asset',
    );
    expect(wrongApkGithub.deletedAssets).toEqual([48]);

    const wrongApkCleanupFailureGithub = new FakeGitHubReleasesClient({
      release: { ...github.release },
      asset: sourceAsset,
      assets: [
        sourceAsset,
        { id: 48, name: identity.apkName, sha256: 'f'.repeat(64), size: apkBytes.length },
      ],
      nextAssetId: 50,
    });
    wrongApkCleanupFailureGithub.deleteAsset = async assetId => {
      wrongApkCleanupFailureGithub.deletedAssets.push(assetId);
      throw new Error('GitHub wrong APK cleanup HTTP 403');
    };
    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: wrongApkCleanupFailureGithub })).rejects.toThrow(
      'Binary publication cleanup failed for APK asset 48',
    );

    const duplicateApkGithub = new FakeGitHubReleasesClient({
      release: { ...github.release },
      asset: sourceAsset,
      assets: [
        sourceAsset,
        { id: 47, name: identity.apkName, sha256: apkSha256, size: apkBytes.length },
        { id: 48, name: identity.apkName, sha256: apkSha256, size: apkBytes.length },
      ],
      nextAssetId: 50,
    });
    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: duplicateApkGithub })).rejects.toThrow(
      'conflicting Play-generated APK asset',
    );
    expect(duplicateApkGithub.deletedAssets).toEqual([47, 48]);

    const duplicateApkCleanupFailureGithub = new FakeGitHubReleasesClient({
      release: { ...github.release },
      asset: sourceAsset,
      assets: [
        sourceAsset,
        { id: 47, name: identity.apkName, sha256: apkSha256, size: apkBytes.length },
        { id: 48, name: identity.apkName, sha256: apkSha256, size: apkBytes.length },
      ],
      nextAssetId: 50,
    });
    const deleteDuplicateApk = duplicateApkCleanupFailureGithub.deleteAsset.bind(
      duplicateApkCleanupFailureGithub,
    );
    duplicateApkCleanupFailureGithub.deleteAsset = async assetId => {
      if (assetId === 48) {
        duplicateApkCleanupFailureGithub.deletedAssets.push(assetId);
        throw new Error('GitHub duplicate APK cleanup HTTP 403');
      }
      await deleteDuplicateApk(assetId);
    };
    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: duplicateApkCleanupFailureGithub })).rejects.toThrow(
      'Binary publication cleanup failed for APK asset 48',
    );
    expect(duplicateApkCleanupFailureGithub.deletedAssets).toEqual([47, 48]);

    const unsafeApkAsset = {
      id: 59,
      name: identity.apkName,
      sha256: apkSha256,
      size: apkBytes.length,
    };
    const strandedApkGithub = new FakeGitHubReleasesClient({
      release: { ...github.release },
      asset: sourceAsset,
      assets: [sourceAsset, unsafeApkAsset],
      nextAssetId: 60,
    });
    strandedApkGithub.uploadAsset = async () => {
      throw new Error('GitHub checksum upload HTTP 503');
    };
    strandedApkGithub.deleteAsset = async assetId => {
      strandedApkGithub.deletedAssets.push(assetId);
      throw new Error('GitHub APK cleanup HTTP 403');
    };
    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: strandedApkGithub })).rejects.toThrow(
      'Binary publication cleanup failed for APK asset 59',
    );
    expect(strandedApkGithub.deletedAssets).toEqual([59]);

    const failingGithub = new FakeGitHubReleasesClient({
      release: { ...github.release },
      asset: sourceAsset,
      assets: [sourceAsset],
      nextAssetId: 60,
    });
    const uploadAsset = failingGithub.uploadAsset.bind(failingGithub);
    failingGithub.uploadAsset = async upload => {
      if (failingGithub.uploadedAssets.length === 1) {
        throw new Error('GitHub upload HTTP 503');
      }
      return uploadAsset(upload);
    };
    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: failingGithub })).rejects.toThrow('GitHub upload HTTP 503');
    expect(failingGithub.uploadedAssets).toEqual([
      { releaseId: 41, name: identity.checksumName, bytes: checksumBytes },
    ]);
    expect(failingGithub.deletedAssets).toEqual([]);
    expect(failingGithub.updatedReleases).toEqual([
      expect.objectContaining({
        releaseId: 41,
        body: `${sourceReleaseNotes(identity)}\n\n---\n\n${binaryEvidence.releaseNotes}`,
      }),
    ]);

    const evidence = await publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github });

    expect(github.uploadedAssets).toEqual([
      { releaseId: 41, name: identity.checksumName, bytes: checksumBytes },
      { releaseId: 41, name: identity.apkName, bytes: apkBytes },
    ]);
    expect(github.updatedReleases).toEqual([
      expect.objectContaining({ releaseId: 41, draft: false }),
    ]);
    expect(evidence).toEqual(expect.objectContaining({
      phase: 'binary-published',
      publicationApproved: true,
      apkAssetId: 51,
      checksumAssetId: 50,
    }));
    expect(github.deletedAssets).toEqual([]);

    const reconciled = await publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github });
    expect(reconciled).toEqual(evidence);
    expect(github.uploadedAssets).toHaveLength(2);
    expect(github.updatedReleases).toHaveLength(1);

    const responseLossGithub = new FakeGitHubReleasesClient({
      release: {
        id: 41,
        tagName: identity.tagName,
        targetCommitish: 'main',
        draft: false,
        prerelease: false,
        body: sourceReleaseNotes(identity),
      },
      asset: sourceAsset,
      assets: [sourceAsset],
      nextAssetId: 70,
    });
    const updateRelease = responseLossGithub.updateRelease.bind(responseLossGithub);
    responseLossGithub.updateRelease = async update => {
      await updateRelease(update);
      throw new Error('GitHub response lost after binary publication');
    };
    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: responseLossGithub })).rejects.toThrow(
      'response lost after binary publication',
    );
    expect(responseLossGithub.deletedAssets).toEqual([]);

    const recovered = await publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: responseLossGithub });
    expect(recovered).toEqual(expect.objectContaining({
      phase: 'binary-published',
      apkAssetId: 71,
      checksumAssetId: 70,
    }));
    expect(responseLossGithub.updatedReleases).toHaveLength(1);

    const apkResponseLossGithub = new FakeGitHubReleasesClient({
      release: {
        id: 41,
        tagName: identity.tagName,
        targetCommitish: 'main',
        draft: false,
        prerelease: false,
        body: sourceReleaseNotes(identity),
      },
      asset: sourceAsset,
      assets: [sourceAsset],
      nextAssetId: 80,
    });
    const uploadWithResponseLoss = apkResponseLossGithub.uploadAsset.bind(
      apkResponseLossGithub,
    );
    apkResponseLossGithub.uploadAsset = async upload => {
      const uploaded = await uploadWithResponseLoss(upload);
      if (upload.name === identity.apkName) {
        throw new Error('GitHub response lost after APK upload');
      }
      return uploaded;
    };
    const responseLossRecovered = await publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: apkResponseLossGithub });
    expect(responseLossRecovered).toEqual(expect.objectContaining({
      phase: 'binary-published',
      apkAssetId: 81,
      checksumAssetId: 80,
    }));
    expect(apkResponseLossGithub.deletedAssets).toEqual([]);

    const tamperedResponseLossGithub = new FakeGitHubReleasesClient({
      release: {
        id: 41,
        tagName: identity.tagName,
        targetCommitish: 'main',
        draft: false,
        prerelease: false,
        body: sourceReleaseNotes(identity),
      },
      asset: sourceAsset,
      assets: [sourceAsset],
      nextAssetId: 80,
    });
    const uploadBeforeTamper = tamperedResponseLossGithub.uploadAsset.bind(
      tamperedResponseLossGithub,
    );
    tamperedResponseLossGithub.uploadAsset = async upload => {
      const uploaded = await uploadBeforeTamper(upload);
      if (upload.name === identity.apkName) {
        tamperedResponseLossGithub.assets.push({
          id: 82,
          name: 'concurrent-side-load.apk',
          sha256: 'f'.repeat(64),
          size: 9,
        });
        throw new Error('GitHub response lost with concurrent APK mutation');
      }
      return uploaded;
    };
    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github: tamperedResponseLossGithub })).rejects.toThrow(
      'response lost with concurrent APK mutation',
    );
    expect(tamperedResponseLossGithub.deletedAssets).toEqual([81, 82]);
  });

  it('rejects corrupted retained checksum bytes before contacting GitHub', async () => {
    const { github, input } = binaryPublicationFixture();
    github.getReleaseAssets = jest.fn(github.getReleaseAssets.bind(github));

    await expect(publishBinaryRelease({
      ...input,
      checksumBytes: Buffer.from('corrupted retained checksum bytes\n'),
      publicationApproved: true,
    }, { github })).rejects.toThrow(
      'Prepared SHA-256 checksum does not match the exact APK',
    );

    expect(github.getReleaseAssets).not.toHaveBeenCalled();
    expect(github.uploadedAssets).toEqual([]);
    expect(github.updatedReleases).toEqual([]);
    expect(github.deletedAssets).toEqual([]);
    expect(github.assets.some(asset => asset.name.endsWith('.apk'))).toBe(false);
  });

  it('fails closed and permits a clean retry when the first checksum upload fails', async () => {
    const { identity, github, input } = binaryPublicationFixture();
    const uploadAsset = github.uploadAsset.bind(github);
    github.uploadAsset = jest.fn(async upload => {
      expect(upload.name).toBe(identity.checksumName);
      throw new Error('GitHub checksum upload HTTP 503');
    });

    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github })).rejects.toThrow('GitHub checksum upload HTTP 503');

    expect(github.uploadedAssets).toEqual([]);
    expect(github.updatedReleases).toEqual([]);
    expect(github.deletedAssets).toEqual([]);
    expect(github.assets.some(asset => asset.name.endsWith('.apk'))).toBe(false);

    github.uploadAsset = uploadAsset;
    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github })).resolves.toEqual(expect.objectContaining({
      phase: 'binary-published',
      publicationApproved: true,
    }));
  });

  it('fails closed without mutation when the initial release asset list is unavailable', async () => {
    const { github, input } = binaryPublicationFixture();
    github.getReleaseAssets = jest.fn(async () => {
      throw new Error('GitHub release asset-list HTTP 503');
    });

    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github })).rejects.toThrow(
      'manually confirm no APK is public before retry',
    );

    expect(github.uploadedAssets).toEqual([]);
    expect(github.updatedReleases).toEqual([]);
    expect(github.deletedAssets).toEqual([]);
    expect(github.assets.some(asset => asset.name.endsWith('.apk'))).toBe(false);
  });

  it('requires manual confirmation when the asset list fails during reconciliation', async () => {
    const { identity, github, input } = binaryPublicationFixture();
    const getReleaseAssets = github.getReleaseAssets.bind(github);
    let assetListCalls = 0;
    github.getReleaseAssets = jest.fn(async releaseId => {
      assetListCalls += 1;
      if (assetListCalls > 1) {
        throw new Error('GitHub reconciliation asset-list HTTP 503');
      }
      return getReleaseAssets(releaseId);
    });
    github.uploadAsset = jest.fn(async upload => {
      expect(upload.name).toBe(identity.checksumName);
      throw new Error('GitHub checksum upload HTTP 503');
    });

    await expect(publishBinaryRelease({
      ...input,
      publicationApproved: true,
    }, { github })).rejects.toThrow(
      'manually confirm no APK is public before retry',
    );

    expect(github.uploadedAssets).toEqual([]);
    expect(github.updatedReleases).toEqual([]);
    expect(github.deletedAssets).toEqual([]);
    expect(github.assets.some(asset => asset.name.endsWith('.apk'))).toBe(false);
  });

  it('wires four manual protected phases without any push, tag, or unapproved publication path', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github/workflows/mobile-android-github-release.yml'),
      'utf8',
    );
    const runbook = fs.readFileSync(
      path.join(repoRoot, 'docs/ANDROID_GITHUB_RELEASE.md'),
      'utf8',
    );
    const artifactDownloader = fs.readFileSync(
      path.join(repoRoot, 'apps/mobile/scripts/download-android-release-artifact.sh'),
      'utf8',
    );
    const mobilePackage = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'apps/mobile/package.json'),
      'utf8',
    ));
    const rootPackage = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'package.json'),
      'utf8',
    ));
    const jobBlock = jobName => {
      const marker = `  ${jobName}:\n`;
      const start = workflow.indexOf(marker);
      expect(start).toBeGreaterThan(-1);
      const remainder = workflow.slice(start + marker.length);
      const nextJob = remainder.search(/^  [a-z][a-z-]+:\n/m);
      return nextJob === -1 ? remainder : remainder.slice(0, nextJob);
    };

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s*(push|pull_request|schedule):/m);
    for (const phase of [
      'prepare-source-draft',
      'publish-source',
      'prepare-binary',
      'publish-binary',
    ]) {
      expect(workflow).toContain(phase);
    }
    expect(workflow).toContain('environment: android-source-publication');
    expect(workflow).toContain('environment: android-binary-publication');
    expect(workflow).toContain('google-github-actions/auth@v3');
    expect(workflow).toContain('android-binary-preparation-${{ github.run_id }}');
    expect(workflow.match(/download-android-release-artifact\.sh/g)).toHaveLength(5);
    expect(workflow.match(/resolve-android-release-candidate-commit\.sh/g)).toHaveLength(2);
    expect(workflow.match(/"\$candidate_sha"/g)).toHaveLength(2);
    expect(workflow.match(
      /GITHUB_TOKEN: \$\{\{ secrets\.ANDROID_GITHUB_RELEASE_TOKEN \}\}/g,
    )).toHaveLength(3);
    expect(workflow.match(/GH_TOKEN: \$\{\{ github\.token \}\}/g)).toHaveLength(5);
    expect(workflow.match(/^\s+GITHUB_TOKEN: \$\{\{ github\.token \}\}$/gm))
      .toHaveLength(1);
    expect(workflow.match(/^\s+contents: read$/gm)).toHaveLength(4);
    expect(workflow).not.toContain('contents: write');
    for (const [jobName, environment] of [
      ['prepare-source-draft', 'android-production'],
      ['publish-source', 'android-source-publication'],
      ['publish-binary', 'android-binary-publication'],
    ]) {
      const job = jobBlock(jobName);
      expect(job).toContain(`environment: ${environment}`);
      expect(job.match(
        /GITHUB_TOKEN: \$\{\{ secrets\.ANDROID_GITHUB_RELEASE_TOKEN \}\}/g,
      )).toHaveLength(1);
      expect(job).toContain('contents: read');
    }
    expect(jobBlock('prepare-binary')).not.toContain('ANDROID_GITHUB_RELEASE_TOKEN');
    expect(workflow.slice(0, workflow.indexOf('\njobs:\n')))
      .not.toContain('ANDROID_GITHUB_RELEASE_TOKEN');
    for (const value of [
      '.github/workflows/mobile-android-release-candidate.yml',
      '.github/workflows/mobile-android-github-release.yml',
      'android-signed-release-candidate-{sha}',
      'android-source-draft-{run_id}',
      'android-source-publication-{run_id}',
      'android-binary-preparation-{run_id}',
    ]) {
      expect(workflow).toContain(value);
    }
    expect(artifactDownloader).toContain('jq -r .expired');
    expect(artifactDownloader).toContain('^[1-9][0-9]*$');
    expect(artifactDownloader).toContain('jq -r .path');
    expect(artifactDownloader).toContain('jq -r .event)" = "workflow_dispatch"');
    expect(artifactDownloader).toContain('jq -r .conclusion)" = "success"');
    expect(artifactDownloader).toContain('expected_head_sha="${6:-$GITHUB_SHA}"');
    expect(artifactDownloader).toContain('jq -r .head_sha)" = "$expected_head_sha"');
    expect(artifactDownloader).toContain('^sha256:[0-9a-fA-F]{64}$');
    expect(artifactDownloader).toContain("sha256sum --help 2>&1 | grep -q -- '--check'");
    expect(artifactDownloader).toContain('sha256sum --check');
    expect(artifactDownloader).toContain('shasum -a 256 --check');
    expect(artifactDownloader).toContain('unzip -q "$archive" -d "$destination"');
    for (const outputName of [
      'run_id',
      'artifact_id',
      'artifact_name',
      'archive_sha256',
    ]) {
      expect(artifactDownloader).toContain(`echo "${outputName}=`);
    }
    expect(workflow.match(/CHESSTICIZE_ANDROID_SOURCE_PUBLICATION_APPROVED: "true"/g)).toHaveLength(1);
    expect(workflow.match(/CHESSTICIZE_ANDROID_BINARY_PUBLICATION_APPROVED: "true"/g)).toHaveLength(1);
    expect(workflow).not.toContain('gh release create');
    expect(workflow).not.toContain('gh release upload');
    const workflowRunBodies = [];
    const workflowLines = workflow.split('\n');
    for (let index = 0; index < workflowLines.length; index += 1) {
      const runBlock = workflowLines[index].match(/^(\s*)run:\s*\|\s*$/);
      if (!runBlock) continue;
      const indentation = runBlock[1].length;
      const body = [];
      for (index += 1; index < workflowLines.length; index += 1) {
        const line = workflowLines[index];
        const nextIndentation = line.match(/^(\s*)/)?.[1].length ?? 0;
        if (line.trim() && nextIndentation <= indentation) {
          index -= 1;
          break;
        }
        body.push(line);
      }
      workflowRunBodies.push(body.join('\n'));
    }
    expect(workflowRunBodies.join('\n')).not.toMatch(/\$\{\{\s*inputs\./);
    expect(workflowRunBodies.join('\n')).not.toContain('ANDROID_GITHUB_RELEASE_TOKEN');
    expect(mobilePackage.scripts['verify:android:github-release'])
      .toBe('node scripts/android-github-release-cli.js');
    expect(rootPackage.scripts['mobile:verify:android:github-release'])
      .toBe('pnpm --filter ChessticizeMobile verify:android:github-release');
    expect(runbook).toContain('#186 requires the canonical source release to be public');
    expect(runbook).toContain('#187 literally asks automation to create a draft release');
    expect(runbook).toContain('does not strictly resolve that wording conflict');
    expect(runbook).toContain(
      'The workflow execution ref is separate from the canonical source tag',
    );
    expect(runbook).toContain(
      'Complete and verify this source-only recovery',
    );
    expect(runbook).toContain('Generated APKs API');
    expect(runbook).toContain('no automatic GitHub update checks');
    expect(runbook).toContain('Only the original signed-candidate artifact may cross');
    expect(runbook).toContain('remain bound to the current protected workflow');
    for (const value of [
      '`ANDROID_GITHUB_RELEASE_TOKEN`',
      'resource owner is `Chessticize`',
      'limited to `chessticize-mobile`',
      '**Contents: Read and write**',
      '**Metadata: Read**',
      '`android-production`',
      '`android-source-publication`',
      '`android-binary-publication`',
      'revoke/delete the\nfine-grained token',
    ]) {
      expect(runbook).toContain(value);
    }
  });

  it('forwards every protected workflow phase through the nested pnpm scripts without a stray delimiter', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github/workflows/mobile-android-github-release.yml'),
      'utf8',
    );
    const phases = [
      'prepare-source-draft',
      'publish-source',
      'prepare-binary',
      'publish-binary',
    ];
    const invocations = [...workflow.matchAll(
      /pnpm mobile:verify:android:github-release( --)? \\\n\s+--phase ([a-z-]+) \\/g,
    )];

    expect(invocations.map(match => match[2])).toEqual(phases);
    expect(invocations.every(match => match[1] === undefined)).toBe(true);

    for (const phase of phases) {
      const result = spawnSync('pnpm', [
        'mobile:verify:android:github-release',
        '--phase', phase,
      ], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          CI: 'true',
          NO_COLOR: '1',
        },
      });
      const output = `${result.stdout}${result.stderr}`;

      expect(result.status).toBe(1);
      expect(output).toContain(`--public-version is required for phase ${phase}.`);
      expect(output).not.toContain('Missing value for --.');
    }
  });

  it('dispatches through the executable CLI and rejects a non-canonical identity before I/O', () => {
    const cli = path.resolve(__dirname, '../scripts/android-github-release-cli.js');
    const result = spawnSync(process.execPath, [
      cli,
      '--phase', 'prepare-source-draft',
      '--public-version', 'not-the-canonical-version',
      '--version-code', '1',
      '--output-dir', path.dirname(cli),
      '--source-manifest', cli,
    ], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'Dispatched public version/build does not match release-version.json.',
    );
  });

  it.each([
    'prepare-source-draft',
    'publish-source',
    'publish-binary',
  ])('fails closed before I/O when %s has no protected GitHub Release token', phase => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cli = path.join(repoRoot, 'apps/mobile/scripts/android-github-release-cli.js');
    const canonicalVersion = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'apps/mobile/release-version.json'),
      'utf8',
    ));
    const result = spawnSync(process.execPath, [
      cli,
      '--phase', phase,
      '--public-version', canonicalVersion.publicVersion,
      '--version-code', String(canonicalVersion.androidVersionCode),
    ], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_TOKEN: '',
        GH_TOKEN: 'artifact-token-must-not-be-a-release-token-fallback',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      `Protected GitHub Release token is required for ${phase}.`,
    );
    expect(result.stderr).not.toContain('--output-dir is required');
  });

  it('runs a successful source preparation through the real CLI process and fake HTTP boundary', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-release-cli-'));
    const outputDirectory = path.join(directory, 'output');
    const sourceManifestPath = path.join(directory, 'android-source-manifest.json');
    const repoRoot = path.resolve(__dirname, '../../..');
    const canonicalVersion = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'apps/mobile/release-version.json'),
      'utf8',
    ));
    const exactManifest = sourceManifest({
      bundle: {
        sha256: 'b'.repeat(64),
        applicationId: 'com.chessticize.mobile',
        versionName: canonicalVersion.publicVersion,
        versionCode: canonicalVersion.androidVersionCode,
      },
    });
    fs.writeFileSync(sourceManifestPath, `${JSON.stringify(exactManifest, null, 2)}\n`);
    const cli = path.join(repoRoot, 'apps/mobile/scripts/android-github-release-cli.js');
    const fakeFetch = path.join(
      repoRoot,
      'apps/mobile/test-support/fakeAndroidGitHubReleaseFetch.js',
    );

    try {
      const result = spawnSync(process.execPath, [
        cli,
        '--phase', 'prepare-source-draft',
        '--public-version', canonicalVersion.publicVersion,
        '--version-code', String(canonicalVersion.androidVersionCode),
        '--output-dir', outputDirectory,
        '--source-manifest', sourceManifestPath,
        '--candidate-run-id', '31',
        '--candidate-artifact-id', '32',
        '--candidate-artifact-name', `android-signed-release-candidate-${'a'.repeat(40)}`,
        '--candidate-archive-sha256', 'c'.repeat(64),
      ], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_TOKEN: 'fake-cli-token',
          NODE_OPTIONS: [
            process.env.NODE_OPTIONS,
            `--require=${fakeFetch}`,
          ].filter(Boolean).join(' '),
        },
      });

      expect(result).toEqual(expect.objectContaining({ status: 0, stderr: '' }));
      expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
        phase: 'source-draft-prepared',
        releaseId: 41,
        releaseAssetId: 42,
        publicationApproved: false,
      }));
      expect(JSON.parse(fs.readFileSync(
        path.join(outputDirectory, 'android-source-draft-evidence.json'),
        'utf8',
      ))).toEqual(expect.objectContaining({
        phase: 'source-draft-prepared',
        tagName: createAndroidReleaseIdentity(canonicalVersion).tagName,
      }));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('authenticates and extracts a GitHub Actions artifact through the real shell process', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-artifact-'));
    const payloadDirectory = path.join(directory, 'payload');
    const destination = path.join(directory, 'destination');
    const archive = path.join(directory, 'artifact.zip');
    const downloadedArchive = path.join(directory, 'downloaded.zip');
    const output = path.join(directory, 'github-output');
    const fakeBin = path.join(directory, 'bin');
    const commitSha = 'a'.repeat(40);
    const repoRoot = path.resolve(__dirname, '../../..');
    const downloader = path.join(
      repoRoot,
      'apps/mobile/scripts/download-android-release-artifact.sh',
    );
    const fakeGhSource = path.join(
      repoRoot,
      'apps/mobile/test-support/fakeAndroidReleaseArtifactGh.sh',
    );

    try {
      fs.mkdirSync(payloadDirectory);
      fs.mkdirSync(fakeBin);
      fs.writeFileSync(path.join(payloadDirectory, 'evidence.json'), '{"trusted":true}\n');
      const zipResult = spawnSync('zip', ['-q', archive, 'evidence.json'], {
        cwd: payloadDirectory,
        encoding: 'utf8',
      });
      expect(zipResult.status).toBe(0);
      const archiveSha256 = crypto.createHash('sha256')
        .update(fs.readFileSync(archive))
        .digest('hex');
      const fakeGh = path.join(fakeBin, 'gh');
      fs.copyFileSync(fakeGhSource, fakeGh);
      fs.chmodSync(fakeGh, 0o755);

      const result = spawnSync('bash', [
        downloader,
        '123',
        '.github/workflows/mobile-android-github-release.yml',
        'android-source-draft-{run_id}',
        destination,
        downloadedArchive,
      ], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH}`,
          GH_TOKEN: 'fake-token',
          GITHUB_REPOSITORY: 'Chessticize/chessticize-mobile',
          GITHUB_SHA: commitSha,
          GITHUB_OUTPUT: output,
          FAKE_SINGLE_ARCHIVE: archive,
          FAKE_SINGLE_ARCHIVE_SHA256: archiveSha256,
        },
      });

      expect(result).toEqual(expect.objectContaining({ status: 0, stderr: '' }));
      expect(fs.readFileSync(path.join(destination, 'evidence.json'), 'utf8'))
        .toBe('{"trusted":true}\n');
      expect(fs.readFileSync(output, 'utf8')).toBe([
        'run_id=456',
        'artifact_id=123',
        'artifact_name=android-source-draft-456',
        `archive_sha256=${archiveSha256}`,
        '',
      ].join('\n'));

      const rejectedDestination = path.join(directory, 'rejected-destination');
      const rejected = spawnSync('bash', [
        downloader,
        '123',
        '.github/workflows/mobile-android-github-release.yml',
        'android-source-draft-{run_id}',
        rejectedDestination,
        path.join(directory, 'rejected.zip'),
      ], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH}`,
          GH_TOKEN: 'fake-token',
          GITHUB_REPOSITORY: 'Chessticize/chessticize-mobile',
          GITHUB_SHA: commitSha,
          GITHUB_OUTPUT: path.join(directory, 'rejected-output'),
          FAKE_SINGLE_ARCHIVE: archive,
          FAKE_SINGLE_ARCHIVE_SHA256: 'f'.repeat(64),
        },
      });
      expect(rejected.status).not.toBe(0);
      expect(fs.existsSync(path.join(rejectedDestination, 'evidence.json'))).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('authenticates a retained candidate against its canonical tagged commit after main advances', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-candidate-recovery-'));
    const payloadDirectory = path.join(directory, 'payload');
    const destination = path.join(directory, 'destination');
    const archive = path.join(directory, 'candidate.zip');
    const downloadedArchive = path.join(directory, 'downloaded.zip');
    const output = path.join(directory, 'github-output');
    const fakeBin = path.join(directory, 'bin');
    const candidateSha = 'a'.repeat(40);
    const currentMainSha = 'b'.repeat(40);
    const repoRoot = path.resolve(__dirname, '../../..');
    const downloader = path.join(
      repoRoot,
      'apps/mobile/scripts/download-android-release-artifact.sh',
    );
    const fakeGhSource = path.join(
      repoRoot,
      'apps/mobile/test-support/fakeAndroidReleaseArtifactGh.sh',
    );

    try {
      fs.mkdirSync(payloadDirectory);
      fs.mkdirSync(fakeBin);
      fs.writeFileSync(path.join(payloadDirectory, 'candidate.json'), '{"retained":true}\n');
      const zipResult = spawnSync('zip', ['-q', archive, 'candidate.json'], {
        cwd: payloadDirectory,
        encoding: 'utf8',
      });
      expect(zipResult.status).toBe(0);
      const archiveSha256 = crypto.createHash('sha256')
        .update(fs.readFileSync(archive))
        .digest('hex');
      const fakeGh = path.join(fakeBin, 'gh');
      fs.copyFileSync(fakeGhSource, fakeGh);
      fs.chmodSync(fakeGh, 0o755);
      const environment = {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        GH_TOKEN: 'fake-token',
        GITHUB_REPOSITORY: 'Chessticize/chessticize-mobile',
        GITHUB_SHA: currentMainSha,
        GITHUB_OUTPUT: output,
        FAKE_COMMIT_SHA: candidateSha,
        FAKE_CANDIDATE_ARCHIVE: archive,
        FAKE_CANDIDATE_ARCHIVE_SHA256: archiveSha256,
      };
      const args = [
        downloader,
        '201',
        '.github/workflows/mobile-android-release-candidate.yml',
        'android-signed-release-candidate-{sha}',
        destination,
        downloadedArchive,
        candidateSha,
      ];
      const result = spawnSync('bash', args, {
        encoding: 'utf8',
        env: environment,
      });

      expect(result).toEqual(expect.objectContaining({ status: 0, stderr: '' }));
      expect(fs.readFileSync(path.join(destination, 'candidate.json'), 'utf8'))
        .toBe('{"retained":true}\n');
      expect(fs.readFileSync(output, 'utf8')).toContain(
        `artifact_name=android-signed-release-candidate-${candidateSha}`,
      );

      const rejected = spawnSync('bash', [
        ...args.slice(0, -3),
        path.join(directory, 'rejected-destination'),
        path.join(directory, 'rejected.zip'),
        'f'.repeat(40),
      ], {
        encoding: 'utf8',
        env: { ...environment, GITHUB_OUTPUT: path.join(directory, 'rejected-output') },
      });
      expect(rejected.status).not.toBe(0);
      expect(fs.existsSync(path.join(directory, 'rejected-destination', 'candidate.json')))
        .toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('resolves only the canonical annotated Android tag to the retained candidate commit', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-tag-resolution-'));
    const repoRoot = path.resolve(__dirname, '../../..');
    const resolver = path.join(
      repoRoot,
      'apps/mobile/scripts/resolve-android-release-candidate-commit.sh',
    );
    const canonicalVersion = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'apps/mobile/release-version.json'),
      'utf8',
    ));
    const identity = createAndroidReleaseIdentity(canonicalVersion);
    const runGit = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
    const createRemote = ({ annotated }) => {
      const remote = path.join(directory, annotated ? 'annotated.git' : 'lightweight.git');
      const checkout = path.join(directory, annotated ? 'annotated' : 'lightweight');
      expect(runGit(directory, ['init', '--bare', remote]).status).toBe(0);
      expect(runGit(directory, ['init', checkout]).status).toBe(0);
      expect(runGit(checkout, ['config', 'user.name', 'Release Test']).status).toBe(0);
      expect(runGit(checkout, ['config', 'user.email', 'release-test@example.com']).status).toBe(0);
      fs.writeFileSync(path.join(checkout, 'candidate.txt'), 'candidate\n');
      expect(runGit(checkout, ['add', 'candidate.txt']).status).toBe(0);
      expect(runGit(checkout, ['commit', '-m', 'candidate']).status).toBe(0);
      const tagArgs = annotated
        ? ['tag', '-a', identity.tagName, '-m', 'Android candidate']
        : ['tag', identity.tagName];
      expect(runGit(checkout, tagArgs).status).toBe(0);
      expect(runGit(checkout, ['remote', 'add', 'origin', remote]).status).toBe(0);
      expect(runGit(checkout, ['push', 'origin', `refs/tags/${identity.tagName}`]).status).toBe(0);
      const commitSha = runGit(checkout, ['rev-parse', 'HEAD']).stdout.trim();
      expect(runGit(checkout, ['tag', '-d', identity.tagName]).status).toBe(0);
      return { checkout, commitSha };
    };

    try {
      const annotated = createRemote({ annotated: true });
      const resolved = spawnSync('bash', [
        resolver,
        canonicalVersion.publicVersion,
        String(canonicalVersion.androidVersionCode),
      ], { cwd: annotated.checkout, encoding: 'utf8' });
      expect(resolved).toEqual(expect.objectContaining({
        status: 0,
        stdout: `${annotated.commitSha}\n`,
        stderr: '',
      }));

      const lightweight = createRemote({ annotated: false });
      const rejected = spawnSync('bash', [
        resolver,
        canonicalVersion.publicVersion,
        String(canonicalVersion.androidVersionCode),
      ], { cwd: lightweight.checkout, encoding: 'utf8' });
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain('must be an annotated tag');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('runs retained artifact provenance through real prepare-binary and publish-binary CLI processes', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-binary-cli-'));
    const repoRoot = path.resolve(__dirname, '../../..');
    const cli = path.join(repoRoot, 'apps/mobile/scripts/android-github-release-cli.js');
    const downloader = path.join(
      repoRoot,
      'apps/mobile/scripts/download-android-release-artifact.sh',
    );
    const fakeFetch = path.join(
      repoRoot,
      'apps/mobile/test-support/fakeAndroidBinaryReleaseFetch.js',
    );
    const fakeGhSource = path.join(
      repoRoot,
      'apps/mobile/test-support/fakeAndroidReleaseArtifactGh.sh',
    );
    const fakeToolSource = path.join(
      repoRoot,
      'apps/mobile/test-support/fakeAndroidReleaseTool.sh',
    );
    const canonicalVersion = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'apps/mobile/release-version.json'),
      'utf8',
    ));
    const identity = createAndroidReleaseIdentity(canonicalVersion);
    const commitSha = 'a'.repeat(40);
    const certificateSha256 = 'd'.repeat(64);
    const candidate = {
      commitSha,
      aabSha256: 'b'.repeat(64),
      applicationId: identity.applicationId,
      versionName: identity.publicVersion,
      versionCode: identity.versionCode,
    };
    const hashFile = filePath => crypto.createHash('sha256')
      .update(fs.readFileSync(filePath))
      .digest('hex');
    const writeJson = (filePath, value) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
    };
    const zipDirectory = (sourceDirectory, archivePath) => {
      const result = spawnSync('zip', ['-q', '-r', archivePath, '.'], {
        cwd: sourceDirectory,
        encoding: 'utf8',
      });
      expect(result).toEqual(expect.objectContaining({ status: 0, stderr: '' }));
    };
    const parseOutputFile = outputPath => Object.fromEntries(
      fs.readFileSync(outputPath, 'utf8')
        .trim()
        .split('\n')
        .map(line => {
          const separator = line.indexOf('=');
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
    );

    try {
      const candidatePayload = path.join(directory, 'candidate-payload');
      const sourcePayload = path.join(directory, 'source-payload');
      const candidateManifestPath = path.join(
        candidatePayload,
        'artifacts/android-release/android-source-manifest.json',
      );
      const exactManifest = sourceManifest({
        bundle: {
          sha256: candidate.aabSha256,
          applicationId: identity.applicationId,
          versionName: identity.publicVersion,
          versionCode: identity.versionCode,
        },
      });
      writeJson(candidateManifestPath, exactManifest);
      const sourceManifestBytes = fs.readFileSync(candidateManifestPath);
      const sourceManifestSha256 = crypto.createHash('sha256')
        .update(sourceManifestBytes)
        .digest('hex');
      writeJson(
        path.join(sourcePayload, 'android-source-publication-evidence.json'),
        {
          schemaVersion: 1,
          phase: 'source-published',
          publicationApproved: true,
          releaseId: 41,
          releaseAssetId: 42,
          tagName: identity.tagName,
          commitSha,
          sourceManifestSha256,
          candidate,
        },
      );
      const candidateArchive = path.join(directory, 'candidate.zip');
      const sourceArchive = path.join(directory, 'source.zip');
      zipDirectory(candidatePayload, candidateArchive);
      zipDirectory(sourcePayload, sourceArchive);

      const fakeBin = path.join(directory, 'bin');
      fs.mkdirSync(fakeBin);
      const fakeGh = path.join(fakeBin, 'gh');
      fs.copyFileSync(fakeGhSource, fakeGh);
      fs.chmodSync(fakeGh, 0o755);
      const artifactEnvironment = {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        GH_TOKEN: 'fake-actions-token',
        GITHUB_REPOSITORY: 'Chessticize/chessticize-mobile',
        GITHUB_SHA: commitSha,
        FAKE_COMMIT_SHA: commitSha,
        FAKE_CANDIDATE_ARCHIVE: candidateArchive,
        FAKE_CANDIDATE_ARCHIVE_SHA256: hashFile(candidateArchive),
        FAKE_SOURCE_ARCHIVE: sourceArchive,
        FAKE_SOURCE_ARCHIVE_SHA256: hashFile(sourceArchive),
      };
      const downloadArtifact = ({ id, workflow, name, destination }) => {
        const outputPath = path.join(directory, `artifact-${id}.output`);
        const archivePath = path.join(directory, `artifact-${id}.zip`);
        const result = spawnSync('bash', [
          downloader,
          String(id),
          workflow,
          name,
          destination,
          archivePath,
        ], {
          encoding: 'utf8',
          env: { ...artifactEnvironment, GITHUB_OUTPUT: outputPath },
        });
        expect(result).toEqual(expect.objectContaining({ status: 0, stderr: '' }));
        return parseOutputFile(outputPath);
      };
      const candidateDirectory = path.join(directory, 'candidate');
      const sourceDirectory = path.join(directory, 'source-publication');
      const candidateProvenance = downloadArtifact({
        id: 201,
        workflow: '.github/workflows/mobile-android-release-candidate.yml',
        name: 'android-signed-release-candidate-{sha}',
        destination: candidateDirectory,
      });
      const sourceProvenance = downloadArtifact({
        id: 202,
        workflow: '.github/workflows/mobile-android-github-release.yml',
        name: 'android-source-publication-{run_id}',
        destination: sourceDirectory,
      });

      const apkPayload = path.join(directory, 'apk-payload');
      const stockfishArtifacts = JSON.parse(fs.readFileSync(
        path.join(repoRoot, 'apps/mobile/stockfish-artifacts.json'),
        'utf8',
      ));
      for (const relativePath of [
        'assets/stockfish/stockfish-artifacts.json',
        ...stockfishArtifacts.nnue.map(
          artifactPath => `assets/stockfish/${path.basename(artifactPath)}`,
        ),
        'lib/arm64-v8a/libappmodules.so',
        'lib/arm64-v8a/libstockfish.so',
        'lib/x86_64/libappmodules.so',
        'lib/x86_64/libstockfish.so',
      ]) {
        const filePath = path.join(apkPayload, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, relativePath.startsWith('lib/') ? 'ELF' : '{}');
      }
      const playApk = path.join(directory, 'play-generated.apk');
      zipDirectory(apkPayload, playApk);
      const apkBytes = fs.statSync(playApk).size;

      const playReadyPath = path.join(directory, 'play-ready.json');
      const ownerEvidencePath = path.join(directory, 'owner-evidence.json');
      writeJson(playReadyPath, {
        schemaVersion: 1,
        status: 'play-ready',
        worktreeClean: true,
        commitSha,
        bundle: {
          sha256: candidate.aabSha256,
          applicationId: identity.applicationId,
          versionName: identity.publicVersion,
          versionCode: identity.versionCode,
        },
      });
      writeJson(ownerEvidencePath, {
        candidate,
        signing: { appSigningCertificateSha256: certificateSha256 },
        artifacts: {
          generatedApkSizes: {
            universalApkBytes: apkBytes,
            universalApkExpectation: {
              minimumBytes: apkBytes,
              maximumBytes: apkBytes,
            },
          },
        },
      });

      const androidHome = path.join(directory, 'android-sdk');
      const hostTag = process.platform === 'darwin' ? 'darwin-x86_64' : 'linux-x86_64';
      for (const relativePath of [
        'build-tools/36.0.0/aapt2',
        'build-tools/36.0.0/apksigner',
        'build-tools/36.0.0/zipalign',
        `ndk/27.1.12297006/toolchains/llvm/prebuilt/${hostTag}/bin/llvm-readelf`,
      ]) {
        const toolPath = path.join(androidHome, relativePath);
        fs.mkdirSync(path.dirname(toolPath), { recursive: true });
        fs.copyFileSync(fakeToolSource, toolPath);
        fs.chmodSync(toolPath, 0o755);
      }
      const binaryPreparationDirectory = path.join(directory, 'binary-preparation');
      const commonCliEnvironment = {
        ...process.env,
        NODE_OPTIONS: [
          process.env.NODE_OPTIONS,
          `--require=${fakeFetch}`,
        ].filter(Boolean).join(' '),
        GITHUB_TOKEN: 'fake-cli-token',
        PLAY_ACCESS_TOKEN: 'fake-play-token',
        ANDROID_HOME: androidHome,
        FAKE_COMMIT_SHA: commitSha,
        FAKE_TAG_NAME: identity.tagName,
        FAKE_PUBLIC_VERSION: identity.publicVersion,
        FAKE_VERSION_CODE: String(identity.versionCode),
        FAKE_SIGNING_CERTIFICATE_SHA256: certificateSha256,
        FAKE_SOURCE_MANIFEST_PATH: path.join(
          candidateDirectory,
          'artifacts/android-release/android-source-manifest.json',
        ),
        FAKE_PLAY_APK_PATH: playApk,
      };
      const prepareResult = spawnSync(process.execPath, [
        cli,
        '--phase', 'prepare-binary',
        '--public-version', identity.publicVersion,
        '--version-code', String(identity.versionCode),
        '--output-dir', binaryPreparationDirectory,
        '--source-manifest', commonCliEnvironment.FAKE_SOURCE_MANIFEST_PATH,
        '--source-publication-evidence', path.join(
          sourceDirectory,
          'android-source-publication-evidence.json',
        ),
        '--play-ready-evidence', playReadyPath,
        '--owner-evidence', ownerEvidencePath,
        '--candidate-run-id', candidateProvenance.run_id,
        '--candidate-artifact-id', candidateProvenance.artifact_id,
        '--candidate-artifact-name', candidateProvenance.artifact_name,
        '--candidate-archive-sha256', candidateProvenance.archive_sha256,
        '--prior-run-id', sourceProvenance.run_id,
        '--prior-artifact-id', sourceProvenance.artifact_id,
        '--prior-artifact-name', sourceProvenance.artifact_name,
        '--prior-archive-sha256', sourceProvenance.archive_sha256,
      ], { encoding: 'utf8', env: commonCliEnvironment });
      expect(prepareResult).toEqual(expect.objectContaining({ status: 0, stderr: '' }));
      const preparedEvidence = JSON.parse(prepareResult.stdout);
      expect(preparedEvidence.retainedInputs).toEqual({
        signedCandidate: {
          runId: 301,
          artifactId: 201,
          artifactName: `android-signed-release-candidate-${commitSha}`,
          archiveSha256: candidateProvenance.archive_sha256,
        },
        sourcePublication: {
          runId: 302,
          artifactId: 202,
          artifactName: 'android-source-publication-302',
          archiveSha256: sourceProvenance.archive_sha256,
        },
      });
      expect(fs.readFileSync(
        path.join(binaryPreparationDirectory, identity.apkName),
      )).toEqual(fs.readFileSync(playApk));
      fs.copyFileSync(
        commonCliEnvironment.FAKE_SOURCE_MANIFEST_PATH,
        path.join(binaryPreparationDirectory, 'android-source-manifest.json'),
      );

      const binaryArchive = path.join(directory, 'binary-preparation.zip');
      zipDirectory(binaryPreparationDirectory, binaryArchive);
      artifactEnvironment.FAKE_BINARY_ARCHIVE = binaryArchive;
      artifactEnvironment.FAKE_BINARY_ARCHIVE_SHA256 = hashFile(binaryArchive);
      const binaryDirectory = path.join(directory, 'binary-publication-input');
      const binaryProvenance = downloadArtifact({
        id: 203,
        workflow: '.github/workflows/mobile-android-github-release.yml',
        name: 'android-binary-preparation-{run_id}',
        destination: binaryDirectory,
      });

      const publicationDirectory = path.join(directory, 'binary-publication');
      const publicationLog = path.join(directory, 'publication-http.log');
      const publishResult = spawnSync(process.execPath, [
        cli,
        '--phase', 'publish-binary',
        '--public-version', identity.publicVersion,
        '--version-code', String(identity.versionCode),
        '--output-dir', publicationDirectory,
        '--source-manifest', path.join(binaryDirectory, 'android-source-manifest.json'),
        '--binary-evidence', path.join(
          binaryDirectory,
          'android-binary-preparation-evidence.json',
        ),
        '--apk', path.join(binaryDirectory, identity.apkName),
        '--checksum', path.join(binaryDirectory, identity.checksumName),
        '--prior-run-id', binaryProvenance.run_id,
        '--prior-artifact-id', binaryProvenance.artifact_id,
        '--prior-artifact-name', binaryProvenance.artifact_name,
        '--prior-archive-sha256', binaryProvenance.archive_sha256,
      ], {
        encoding: 'utf8',
        env: {
          ...commonCliEnvironment,
          CHESSTICIZE_ANDROID_BINARY_PUBLICATION_APPROVED: 'true',
          FAKE_SOURCE_MANIFEST_PATH: path.join(
            binaryDirectory,
            'android-source-manifest.json',
          ),
          FAKE_RELEASE_HTTP_LOG: publicationLog,
        },
      });
      expect(publishResult).toEqual(expect.objectContaining({ status: 0, stderr: '' }));
      const publicationEvidence = JSON.parse(publishResult.stdout);
      expect(publicationEvidence).toEqual(expect.objectContaining({
        phase: 'binary-published',
        publicationApproved: true,
        apkAssetId: 51,
        checksumAssetId: 50,
        binaryPreparationWorkflow: {
          runId: 303,
          artifactId: 203,
          artifactName: 'android-binary-preparation-303',
          archiveSha256: binaryProvenance.archive_sha256,
        },
      }));
      expect(fs.readFileSync(publicationLog, 'utf8').trim().split('\n')).toEqual([
        `upload:${identity.checksumName}`,
        'patch:release-notes',
        `upload:${identity.apkName}`,
      ]);
      expect(JSON.parse(fs.readFileSync(
        path.join(publicationDirectory, 'android-binary-publication-evidence.json'),
        'utf8',
      ))).toEqual(publicationEvidence);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
