/* global fetch */

const { Buffer } = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { measureArtifact } = require('./android-github-release');

const GITHUB_API_ROOT = 'https://api.github.com/repos/Chessticize/chessticize-mobile';
const GITHUB_UPLOAD_ROOT = 'https://uploads.github.com/repos/Chessticize/chessticize-mobile';
const PLAY_API_ROOT = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

function githubDigest(value) {
  const match = String(value ?? '').match(/^sha256:([0-9a-f]{64})$/i);
  return match?.[1].toLowerCase();
}

function mapGithubRelease(release) {
  if (!release || typeof release !== 'object') return null;
  return {
    id: release.id,
    tagName: release.tag_name,
    targetCommitish: release.target_commitish,
    name: release.name,
    body: release.body ?? '',
    draft: release.draft,
    prerelease: release.prerelease,
    htmlUrl: release.html_url,
  };
}

function mapGithubAsset(asset) {
  if (!asset || typeof asset !== 'object') return null;
  return {
    id: asset.id,
    name: asset.name,
    sha256: githubDigest(asset.digest),
    size: asset.size,
    browserDownloadUrl: asset.browser_download_url,
  };
}

class GitHubReleasesClient {
  constructor({ token, fetchImpl = fetch } = {}) {
    if (typeof token !== 'string' || token.length === 0) {
      throw new Error('GITHUB_TOKEN is required for GitHub release automation.');
    }
    this.token = token;
    this.fetch = fetchImpl;
  }

  async request(url, { method = 'GET', body, headers = {}, allowNotFound = false } = {}) {
    const response = await this.fetch(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...headers,
      },
      ...(body === undefined ? {} : { body }),
      ...(body && !Buffer.isBuffer(body) && typeof body.pipe === 'function'
        ? { duplex: 'half' }
        : {}),
    });
    if (allowNotFound && response.status === 404) return null;
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GitHub API ${method} ${response.status}: ${text.slice(0, 500)}`);
    }
    return text ? JSON.parse(text) : null;
  }

  async getTag(tagName) {
    const reference = await this.request(
      `${GITHUB_API_ROOT}/git/ref/tags/${encodeURIComponent(tagName)}`,
      { allowNotFound: true },
    );
    if (!reference) return null;
    if (reference.object?.type === 'commit') {
      return { tagName, tagType: 'lightweight', commitSha: reference.object.sha };
    }
    if (reference.object?.type !== 'tag') {
      throw new Error('Canonical Android tag reference has an unsupported object type.');
    }
    const tag = await this.request(`${GITHUB_API_ROOT}/git/tags/${reference.object.sha}`);
    if (tag?.object?.type !== 'commit') {
      throw new Error('Canonical Android annotated tag does not target a commit.');
    }
    return {
      tagName,
      tagType: tag.verification?.verified === true ? 'signed' : 'annotated',
      commitSha: tag.object.sha,
    };
  }

  async getReleaseByTag(tagName) {
    const releases = await this.request(`${GITHUB_API_ROOT}/releases?per_page=100`);
    return mapGithubRelease(releases.find(release => release.tag_name === tagName));
  }

  async getRelease(releaseId) {
    return mapGithubRelease(await this.request(
      `${GITHUB_API_ROOT}/releases/${releaseId}`,
      { allowNotFound: true },
    ));
  }

  async createRelease(input) {
    const release = await this.request(`${GITHUB_API_ROOT}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: input.tagName,
        target_commitish: input.targetCommitish,
        name: input.name,
        body: input.body,
        draft: input.draft,
        prerelease: input.prerelease,
        generate_release_notes: false,
      }),
    });
    return mapGithubRelease(release);
  }

  async updateRelease(input) {
    const body = { ...input };
    delete body.releaseId;
    const release = await this.request(`${GITHUB_API_ROOT}/releases/${input.releaseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return mapGithubRelease(release);
  }

  async getAsset(assetId) {
    return mapGithubAsset(await this.request(
      `${GITHUB_API_ROOT}/releases/assets/${assetId}`,
      { allowNotFound: true },
    ));
  }

  async getReleaseAssets(releaseId) {
    const assets = await this.request(
      `${GITHUB_API_ROOT}/releases/${releaseId}/assets?per_page=100`,
    );
    return assets.map(mapGithubAsset);
  }

  async uploadAsset(input) {
    const measurement = measureArtifact(input.bytes);
    const filePath = typeof input.bytes === 'string' ? input.bytes : input.bytes?.path;
    const body = Buffer.isBuffer(input.bytes) ? input.bytes : fs.createReadStream(filePath);
    const asset = await this.request(
      `${GITHUB_UPLOAD_ROOT}/releases/${input.releaseId}/assets?name=${encodeURIComponent(input.name)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': input.name.endsWith('.apk')
            ? 'application/vnd.android.package-archive'
            : 'application/octet-stream',
          'Content-Length': String(measurement.bytes),
        },
        body,
      },
    );
    return mapGithubAsset(asset);
  }

  async deleteAsset(assetId) {
    await this.request(`${GITHUB_API_ROOT}/releases/assets/${assetId}`, { method: 'DELETE' });
  }

  async deleteRelease(releaseId) {
    await this.request(`${GITHUB_API_ROOT}/releases/${releaseId}`, { method: 'DELETE' });
  }
}

class PlayGeneratedApksClient {
  constructor({ accessToken, destinationPath, fetchImpl = fetch } = {}) {
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new Error('PLAY_ACCESS_TOKEN is required for the Generated APKs API.');
    }
    if (typeof destinationPath !== 'string' || destinationPath.length === 0) {
      throw new Error('A protected destination path is required for the generated APK.');
    }
    this.accessToken = accessToken;
    this.destinationPath = destinationPath;
    this.fetch = fetchImpl;
  }

  url({ packageName, versionCode, downloadId }) {
    const base = `${PLAY_API_ROOT}/${encodeURIComponent(packageName)}` +
      `/generatedApks/${versionCode}`;
    return downloadId ? `${base}/downloads/${encodeURIComponent(downloadId)}:download` : base;
  }

  async request(input) {
    const response = await this.fetch(this.url(input), {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Google Play API ${response.status}: ${detail.slice(0, 500)}`);
    }
    return response;
  }

  async listGeneratedApks(input) {
    return (await this.request(input)).json();
  }

  async downloadGeneratedApk(input) {
    const response = await this.request(input);
    if (!response.body) throw new Error('Google Play returned an empty APK response.');
    fs.mkdirSync(path.dirname(this.destinationPath), { recursive: true });
    const temporaryPath = `${this.destinationPath}.partial`;
    try {
      await pipeline(
        Readable.fromWeb(response.body),
        fs.createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 }),
      );
      fs.renameSync(temporaryPath, this.destinationPath);
    } finally {
      fs.rmSync(temporaryPath, { force: true });
    }
    return { path: this.destinationPath };
  }
}

module.exports = {
  GitHubReleasesClient,
  PlayGeneratedApksClient,
  githubDigest,
  mapGithubAsset,
  mapGithubRelease,
};
