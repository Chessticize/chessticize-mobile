const {
  createAndroidReleaseIdentity,
  prepareSourceDraft,
  publishSourceRelease,
  publishCorrespondingSource,
  selectPlayUniversalApk,
  verifyGeneratedApkContract,
  mirrorPlayGeneratedApk,
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
    return this.assets.find(asset => asset.id === assetId) ?? null;
  }

  async createRelease(input) {
    this.createdReleases.push(input);
    this.release = { id: 41, ...input, htmlUrl: 'https://github.com/Chessticize/chessticize-mobile/releases/tag/android-v1.1.0-build-7' };
    return this.release;
  }

  async uploadAsset(input) {
    this.uploadedAssets.push(input);
    const filePath = typeof input.bytes === 'string' ? input.bytes : input.bytes?.path;
    const bytes = Buffer.isBuffer(input.bytes) ? input.bytes : fs.readFileSync(filePath);
    const asset = {
      id: this.nextAssetId++,
      name: input.name,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length,
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

function playMirrorFixture({ assets } = {}) {
  const identity = createAndroidReleaseIdentity(releaseVersion);
  const sourceManifestBytes = manifestBytes();
  const sourceManifestSha256 = crypto.createHash('sha256')
    .update(sourceManifestBytes)
    .digest('hex');
  const sourceAsset = {
    id: 42,
    name: 'android-source-manifest.json',
    sha256: sourceManifestSha256,
    size: sourceManifestBytes.length,
  };
  const apkBytes = Buffer.from('deterministic-play-generated-universal-apk');
  const appSigningCertificateSha256 = 'd'.repeat(64);
  const github = new FakeGitHubReleasesClient({
    release: {
      id: 41,
      tagName: identity.tagName,
      name: `Chessticize Android ${identity.publicVersion} (${identity.versionCode})`,
      draft: false,
      prerelease: false,
      body: sourceReleaseNotes(identity),
      htmlUrl: `https://github.com/Chessticize/chessticize-mobile/releases/tag/${identity.tagName}`,
    },
    assets: assets ?? [sourceAsset],
    nextAssetId: 50,
  });
  const play = new FakePlayGeneratedApksClient({
    listing: {
      generatedApks: [{
        certificateSha256Hash: Buffer.from(appSigningCertificateSha256, 'hex').toString('base64'),
        generatedUniversalApk: { downloadId: 'universal-download-7' },
        targetingInfo: { packageName: identity.applicationId },
      }],
    },
    apkBytes,
  });
  return {
    identity,
    sourceAsset,
    sourceManifestBytes,
    apkBytes,
    github,
    play,
    input: {
      releaseVersion,
      sourceManifest: sourceManifest(),
      sourceManifestBytes,
      appSigningCertificateSha256,
    },
    dependencies: {
      github,
      play,
      inspectApk: () => ({
        applicationId: identity.applicationId,
        versionName: identity.publicVersion,
        versionCode: identity.versionCode,
        signerCertificateSha256: appSigningCertificateSha256,
      }),
    },
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
    }, { github });

    expect(github.createdReleases).toEqual([
      expect.objectContaining({
        tagName: 'android-v1.1.0-build-7',
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
    }, { github })).rejects.toThrow('conflicting state');

    expect(github.deletedReleases).toEqual([41]);
    expect(github.uploadedAssets).toEqual([]);
  });

  it('publishes source only through an authorized canonical release execution', async () => {
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
    }, { github })).rejects.toThrow('authorized release execution');
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

  it('creates, verifies, and publishes corresponding source in one idempotent operation', async () => {
    const github = new FakeGitHubReleasesClient();
    const input = {
      releaseVersion,
      sourceManifest: sourceManifest(),
      sourceManifestBytes: manifestBytes(),
    };

    const published = await publishCorrespondingSource(input, { github });
    const retried = await publishCorrespondingSource(input, { github });

    expect(published.phase).toBe('source-published');
    expect(retried).toEqual(published);
    expect(github.createdReleases).toHaveLength(1);
    expect(github.uploadedAssets).toHaveLength(1);
    expect(github.updatedReleases).toEqual([{ releaseId: 41, draft: false }]);
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

  it('checks only the Play APK identity, signer, and digest before mirroring', () => {
    const apkBytes = Buffer.from('deterministic-play-generated-universal-apk');
    const sha256 = crypto.createHash('sha256').update(apkBytes).digest('hex');
    const inspection = {
      applicationId: 'com.chessticize.mobile',
      versionName: '1.1',
      versionCode: 7,
      signerCertificateSha256: 'd'.repeat(64),
      abis: [],
      zipAligned16KiB: false,
      debuggable: true,
    };
    const expected = {
      identity: createAndroidReleaseIdentity(releaseVersion),
      appSigningCertificateSha256: 'd'.repeat(64),
    };

    expect(verifyGeneratedApkContract({ apkBytes, inspection, expected })).toEqual({
      bytes: apkBytes.length,
      sha256,
      applicationId: 'com.chessticize.mobile',
      versionName: '1.1',
      versionCode: 7,
      signerCertificateSha256: 'd'.repeat(64),
    });

    for (const [field, value, message] of [
      ['applicationId', 'wrong.package', 'package identity'],
      ['versionName', '1.2', 'public version'],
      ['versionCode', 8, 'build number'],
      ['signerCertificateSha256', 'e'.repeat(64), 'app-signing certificate'],
    ]) {
      expect(() => verifyGeneratedApkContract({
        apkBytes,
        inspection: { ...inspection, [field]: value },
        expected,
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

  it('mirrors the Play-signed APK in one idempotent post-Play operation', async () => {
    const fixture = playMirrorFixture();

    const published = await mirrorPlayGeneratedApk(fixture.input, fixture.dependencies);
    const retried = await mirrorPlayGeneratedApk(fixture.input, fixture.dependencies);

    expect(published).toEqual(expect.objectContaining({
      schemaVersion: 1,
      phase: 'play-apk-mirrored',
      tagName: fixture.identity.tagName,
      commitSha: 'a'.repeat(40),
      applicationId: fixture.identity.applicationId,
      versionName: fixture.identity.publicVersion,
      versionCode: fixture.identity.versionCode,
      playDownloadId: 'universal-download-7',
      apk: expect.objectContaining({
        name: fixture.identity.apkName,
        signerCertificateSha256: 'd'.repeat(64),
        assetId: 51,
      }),
      checksum: expect.objectContaining({
        name: fixture.identity.checksumName,
        assetId: 50,
      }),
    }));
    expect(retried).toEqual(published);
    expect(fixture.github.uploadedAssets.map(asset => asset.name)).toEqual([
      fixture.identity.checksumName,
      fixture.identity.apkName,
    ]);
    expect(fixture.github.updatedReleases).toHaveLength(1);
    expect(fixture.github.updatedReleases[0].body).toContain(
      'generated and signed by Google Play',
    );
    expect(fixture.github.assets.map(asset => asset.name).sort()).toEqual([
      fixture.identity.apkName,
      fixture.identity.checksumName,
      'android-source-manifest.json',
    ].sort());
    expect(fixture.play.downloads).toHaveLength(2);
  });

  it('rejects a conflicting public APK without deleting or replacing it', async () => {
    const base = playMirrorFixture();
    const conflictingApk = {
      id: 49,
      name: base.identity.apkName,
      sha256: 'f'.repeat(64),
      size: base.apkBytes.length,
    };
    const fixture = playMirrorFixture({
      assets: [base.sourceAsset, conflictingApk],
    });

    await expect(
      mirrorPlayGeneratedApk(fixture.input, fixture.dependencies),
    ).rejects.toThrow('conflicting Play-generated APK asset');
    expect(fixture.github.uploadedAssets).toEqual([]);
    expect(fixture.github.updatedReleases).toEqual([]);
    expect(fixture.github.deletedAssets).toEqual([]);
  });

  it('wires one signed candidate, one post-Play mirror, and exceptional source recovery', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const mirrorWorkflow = fs.readFileSync(
      path.join(repoRoot, '.github/workflows/mobile-android-github-release.yml'),
      'utf8',
    );
    const recoveryWorkflow = fs.readFileSync(
      path.join(repoRoot, '.github/workflows/mobile-android-source-recovery.yml'),
      'utf8',
    );
    const candidateWorkflow = fs.readFileSync(
      path.join(repoRoot, '.github/workflows/mobile-android-release-candidate.yml'),
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

    expect(mirrorWorkflow).toContain('workflow_dispatch:');
    expect(mirrorWorkflow).not.toMatch(/^\s*(push|pull_request|schedule):/m);
    expect(mirrorWorkflow).toContain('contents: write');
    expect(mirrorWorkflow).toContain('id-token: write');
    expect(mirrorWorkflow).toContain('Mirror Play-signed universal APK');
    expect(mirrorWorkflow).not.toContain('environment:');
    expect(mirrorWorkflow).toContain('google-github-actions/auth@v3');
    expect(mirrorWorkflow).toContain('GOOGLE_WORKLOAD_IDENTITY_PROVIDER');
    expect(mirrorWorkflow).toContain('ANDROID_PUBLISHER_SERVICE_ACCOUNT_JSON');
    expect(mirrorWorkflow).toContain('ANDROID_PLAY_APP_SIGNING_CERT_SHA256');
    expect(mirrorWorkflow).toContain('--operation mirror-play-apk');
    expect(mirrorWorkflow).toContain('build-tools;36.0.0');
    expect(mirrorWorkflow).not.toContain('pnpm install');
    expect(mirrorWorkflow).not.toContain('gradlew');
    expect(mirrorWorkflow).not.toContain('Detox');
    expect(mirrorWorkflow).not.toContain('ANDROID_GITHUB_RELEASE_TOKEN');
    expect(mirrorWorkflow).not.toContain('owner-evidence');
    expect(mirrorWorkflow).not.toContain('candidate_artifact_id');

    expect(recoveryWorkflow).toContain('Recover Android corresponding-source publication');
    expect(recoveryWorkflow).toContain('allow-failed-run');
    expect(recoveryWorkflow).toContain('android-signed-release-candidate-{sha}');
    expect(recoveryWorkflow).toContain('GITHUB_TOKEN: $' + '{{ github.token }}');
    expect(recoveryWorkflow).not.toContain('google-github-actions/auth');

    expect(candidateWorkflow).toContain('environment: android-production');
    expect(candidateWorkflow).toContain('contents: write');
    expect(candidateWorkflow).toContain('Run exact-head fast release checks');
    expect(candidateWorkflow).toContain('Build production-signed App Bundle');
    expect(candidateWorkflow).toContain('Publish exact corresponding source');
    expect(candidateWorkflow).toContain('GITHUB_TOKEN: $' + '{{ github.token }}');
    expect(candidateWorkflow).not.toContain('ANDROID_GITHUB_RELEASE_TOKEN');
    expect(candidateWorkflow).not.toContain('Generated APK');

    expect(artifactDownloader).toContain('allow-failed-run');
    expect(artifactDownloader).toContain('sha256sum --check');
    expect(mobilePackage.scripts['verify:android:github-release'])
      .toBe('node scripts/android-github-release-cli.js');
    expect(rootPackage.scripts['mobile:verify:android:github-release'])
      .toBe('pnpm --filter ChessticizeMobile verify:android:github-release');
    expect(runbook).toContain('Play-first APK mirror');
    expect(runbook).toContain('github.token');
    expect(runbook).toContain('Generated APKs API');
    expect(runbook).not.toContain('ANDROID_GITHUB_RELEASE_TOKEN');
  });

  it('uses one source command and one post-Play mirror operation without legacy phases', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const sourceWorkflows = [
      '.github/workflows/mobile-android-release-candidate.yml',
      '.github/workflows/mobile-android-source-recovery.yml',
    ].map(file => fs.readFileSync(path.join(repoRoot, file), 'utf8')).join('\n');
    const mirrorWorkflow = fs.readFileSync(
      path.join(repoRoot, '.github/workflows/mobile-android-github-release.yml'),
      'utf8',
    );
    expect(sourceWorkflows.match(/pnpm mobile:verify:android:github-release \\/g))
      .toHaveLength(2);
    expect(sourceWorkflows).not.toContain('--operation');
    expect(mirrorWorkflow).toContain('--operation mirror-play-apk');
    expect([sourceWorkflows, mirrorWorkflow].join('\n')).not.toContain('--phase');
    expect([sourceWorkflows, mirrorWorkflow].join('\n')).not.toContain('prepare-binary');
    expect([sourceWorkflows, mirrorWorkflow].join('\n')).not.toContain('publish-binary');
  });

  it('keeps current release tooling checked out while binding exceptional flows to the tagged candidate', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const workflows = [
      '.github/workflows/mobile-android-source-recovery.yml',
      '.github/workflows/mobile-android-github-release.yml',
    ].map(file => fs.readFileSync(path.join(repoRoot, file), 'utf8'));

    for (const workflow of workflows) {
      expect(workflow).not.toContain('git checkout --detach "$candidate_sha"');
      expect(workflow).toContain(
        'git show "${candidate_sha}:apps/mobile/release-version.json"',
      );
      expect(workflow).toContain('--release-version-file');
      expect(workflow).toContain('--public-version');
      expect(workflow).toContain('--version-code');
    }
  });

  it('fails closed before I/O when the built-in GitHub token is missing', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cli = path.join(repoRoot, 'apps/mobile/scripts/android-github-release-cli.js');
    const result = spawnSync(process.execPath, [cli], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_TOKEN: '',
        GH_TOKEN: 'artifact-token-must-not-be-a-release-token-fallback',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('GITHUB_TOKEN with contents: write is required.');
    expect(result.stderr).not.toContain('--output-dir is required');
  });

  it('runs a successful source publication through the real CLI process and fake HTTP boundary', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-release-cli-'));
    const outputDirectory = path.join(directory, 'output');
    const sourceManifestPath = path.join(directory, 'android-source-manifest.json');
    const releaseVersionPath = path.join(directory, 'release-version.json');
    const repoRoot = path.resolve(__dirname, '../../..');
    const canonicalVersion = releaseVersion;
    const exactManifest = sourceManifest({
      bundle: {
        sha256: 'b'.repeat(64),
        applicationId: 'com.chessticize.mobile',
        versionName: canonicalVersion.publicVersion,
        versionCode: canonicalVersion.androidVersionCode,
      },
    });
    fs.writeFileSync(sourceManifestPath, `${JSON.stringify(exactManifest, null, 2)}\n`);
    fs.writeFileSync(releaseVersionPath, `${JSON.stringify(canonicalVersion, null, 2)}\n`);
    const cli = path.join(repoRoot, 'apps/mobile/scripts/android-github-release-cli.js');
    const fakeFetch = path.join(
      repoRoot,
      'apps/mobile/test-support/fakeAndroidGitHubReleaseFetch.js',
    );

    try {
      const result = spawnSync(process.execPath, [
        cli,
        '--release-version-file', releaseVersionPath,
        '--public-version', canonicalVersion.publicVersion,
        '--version-code', String(canonicalVersion.androidVersionCode),
        '--output-dir', outputDirectory,
        '--source-manifest', sourceManifestPath,
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
        phase: 'source-published',
        releaseId: 41,
        releaseAssetId: 42,
        publicationApproved: true,
      }));
      expect(JSON.parse(fs.readFileSync(
        path.join(outputDirectory, 'android-source-publication-evidence.json'),
        'utf8',
      ))).toEqual(expect.objectContaining({
        phase: 'source-published',
        tagName: createAndroidReleaseIdentity(canonicalVersion).tagName,
      }));

      const rejected = spawnSync(process.execPath, [
        cli,
        '--release-version-file', releaseVersionPath,
        '--public-version', canonicalVersion.publicVersion,
        '--version-code', String(canonicalVersion.androidVersionCode + 1),
        '--output-dir', path.join(directory, 'rejected-output'),
        '--source-manifest', sourceManifestPath,
      ], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_TOKEN: 'fake-cli-token',
        },
      });
      expect(rejected.status).toBe(1);
      expect(rejected.stdout).toBe('');
      expect(rejected.stderr).toContain(
        'Dispatched public version/build does not match release-version.json.',
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a mismatched recovery identity before artifact GitHub I/O', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-recovery-identity-'));
    const repoRoot = path.resolve(__dirname, '../../..');
    const downloader = path.join(
      repoRoot,
      'apps/mobile/scripts/download-android-release-artifact.sh',
    );
    const releaseVersionPath = path.join(directory, 'release-version.json');
    const fakeBin = path.join(directory, 'bin');
    const fakeGh = path.join(fakeBin, 'gh');
    const ghCallMarker = path.join(directory, 'gh-called');
    const expectedHeadSha = 'a'.repeat(40);

    try {
      fs.mkdirSync(fakeBin);
      fs.writeFileSync(releaseVersionPath, `${JSON.stringify({
        ...releaseVersion,
        androidVersionCode: releaseVersion.androidVersionCode + 1,
      }, null, 2)}\n`);
      fs.writeFileSync(fakeGh, [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        ': > "$FAKE_GH_CALL_MARKER"',
        'exit 99',
        '',
      ].join('\n'));
      fs.chmodSync(fakeGh, 0o755);

      const result = spawnSync('bash', [
        downloader,
        '201',
        '.github/workflows/mobile-android-release-candidate.yml',
        'android-signed-release-candidate-{sha}',
        path.join(directory, 'destination'),
        path.join(directory, 'candidate.zip'),
        expectedHeadSha,
        'allow-failed-run',
        releaseVersionPath,
        releaseVersion.publicVersion,
        String(releaseVersion.androidVersionCode),
      ], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH}`,
          GH_TOKEN: 'fake-token',
          GITHUB_REPOSITORY: 'Chessticize/chessticize-mobile',
          GITHUB_SHA: expectedHeadSha,
          GITHUB_OUTPUT: path.join(directory, 'github-output'),
          FAKE_GH_CALL_MARKER: ghCallMarker,
        },
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'Dispatched public version/build does not match release-version.json.',
      );
      expect(fs.existsSync(ghCallMarker)).toBe(false);

      const recoveryWorkflow = fs.readFileSync(
        path.join(repoRoot, '.github/workflows/mobile-android-source-recovery.yml'),
        'utf8',
      );
      const downloadStart = recoveryWorkflow.indexOf(
        'bash apps/mobile/scripts/download-android-release-artifact.sh',
      );
      const downloadEnd = recoveryWorkflow.indexOf('\n\n', downloadStart);
      const downloadInvocation = recoveryWorkflow.slice(downloadStart, downloadEnd);
      expect(downloadInvocation).toContain('"$RUNNER_TEMP/candidate-release-version.json"');
      expect(downloadInvocation).toContain('"${{ inputs.public_version }}"');
      expect(downloadInvocation).toContain('"${{ inputs.version_code }}"');
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
    const releaseVersionPath = path.join(directory, 'release-version.json');
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
      fs.writeFileSync(releaseVersionPath, `${JSON.stringify(releaseVersion, null, 2)}\n`);
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
      const recoveryArgs = (destinationPath, archivePath, headSha) => [
        downloader,
        '201',
        '.github/workflows/mobile-android-release-candidate.yml',
        'android-signed-release-candidate-{sha}',
        destinationPath,
        archivePath,
        headSha,
        'allow-failed-run',
        releaseVersionPath,
        releaseVersion.publicVersion,
        String(releaseVersion.androidVersionCode),
      ];
      const args = recoveryArgs(destination, downloadedArchive, candidateSha);
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

      const rejected = spawnSync('bash', recoveryArgs(
        path.join(directory, 'rejected-destination'),
        path.join(directory, 'rejected.zip'),
        'f'.repeat(40),
      ), {
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

  it('runs the post-Play mirror through the real CLI and external-boundary fakes', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-apk-mirror-cli-'));
    const repoRoot = path.resolve(__dirname, '../../..');
    const cli = path.join(repoRoot, 'apps/mobile/scripts/android-github-release-cli.js');
    const fakeFetch = path.join(
      repoRoot,
      'apps/mobile/test-support/fakeAndroidBinaryReleaseFetch.js',
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
    const sourceManifestPath = path.join(directory, 'android-source-manifest.json');
    const outputDirectory = path.join(directory, 'output');
    const playApkPath = path.join(directory, 'play-generated.apk');
    const releaseLog = path.join(directory, 'release.log');
    const certificateSha256 = 'd'.repeat(64);
    const exactManifest = sourceManifest({
      bundle: {
        sha256: 'b'.repeat(64),
        applicationId: identity.applicationId,
        versionName: identity.publicVersion,
        versionCode: identity.versionCode,
      },
    });
    fs.writeFileSync(sourceManifestPath, JSON.stringify(exactManifest, null, 2) + '\n');
    fs.writeFileSync(playApkPath, 'play-generated-apk-bytes');

    const androidHome = path.join(directory, 'android-sdk');
    for (const tool of ['aapt2', 'apksigner']) {
      const toolPath = path.join(androidHome, 'build-tools/36.0.0', tool);
      fs.mkdirSync(path.dirname(toolPath), { recursive: true });
      fs.copyFileSync(fakeToolSource, toolPath);
      fs.chmodSync(toolPath, 0o755);
    }

    try {
      const result = spawnSync(process.execPath, [
        cli,
        '--operation', 'mirror-play-apk',
        '--public-version', identity.publicVersion,
        '--version-code', String(identity.versionCode),
        '--source-manifest', sourceManifestPath,
        '--output-dir', outputDirectory,
      ], {
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_OPTIONS: [
            process.env.NODE_OPTIONS,
            '--require=' + fakeFetch,
          ].filter(Boolean).join(' '),
          GITHUB_TOKEN: 'fake-cli-token',
          PLAY_ACCESS_TOKEN: 'fake-play-token',
          ANDROID_PLAY_APP_SIGNING_CERT_SHA256: certificateSha256,
          ANDROID_HOME: androidHome,
          FAKE_COMMIT_SHA: 'a'.repeat(40),
          FAKE_TAG_NAME: identity.tagName,
          FAKE_PUBLIC_VERSION: identity.publicVersion,
          FAKE_VERSION_CODE: String(identity.versionCode),
          FAKE_SIGNING_CERTIFICATE_SHA256: certificateSha256,
          FAKE_SOURCE_MANIFEST_PATH: sourceManifestPath,
          FAKE_PLAY_APK_PATH: playApkPath,
          FAKE_RELEASE_HTTP_LOG: releaseLog,
        },
      });

      expect(result).toEqual(expect.objectContaining({ status: 0, stderr: '' }));
      const evidence = JSON.parse(result.stdout);
      expect(evidence).toEqual(expect.objectContaining({
        phase: 'play-apk-mirrored',
        tagName: identity.tagName,
        playDownloadId: 'universal-download-7',
      }));
      expect(fs.readFileSync(
        path.join(outputDirectory, identity.apkName),
      )).toEqual(fs.readFileSync(playApkPath));
      expect(fs.readFileSync(
        path.join(outputDirectory, identity.checksumName),
        'utf8',
      )).toBe(evidence.apk.sha256 + '  ' + identity.apkName + '\n');
      expect(JSON.parse(fs.readFileSync(
        path.join(outputDirectory, 'android-apk-mirror-evidence.json'),
        'utf8',
      ))).toEqual(evidence);
      expect(fs.readFileSync(releaseLog, 'utf8').trim().split('\n')).toEqual([
        'upload:' + identity.checksumName,
        'patch:release-notes',
        'upload:' + identity.apkName,
      ]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
