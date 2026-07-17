const crypto = require('node:crypto');
const { Buffer } = require('node:buffer');
const fs = require('node:fs');

const ResponseImplementation = global.Response;
const commitSha = process.env.FAKE_COMMIT_SHA;
const tagName = process.env.FAKE_TAG_NAME;
const publicVersion = process.env.FAKE_PUBLIC_VERSION;
const versionCode = Number(process.env.FAKE_VERSION_CODE);
const certificateSha256 = process.env.FAKE_SIGNING_CERTIFICATE_SHA256;
const sourceManifestBytes = fs.readFileSync(process.env.FAKE_SOURCE_MANIFEST_PATH);
const sourceManifestSha256 = crypto.createHash('sha256')
  .update(sourceManifestBytes)
  .digest('hex');
const apkBytes = fs.readFileSync(process.env.FAKE_PLAY_APK_PATH);
const annotatedTagSha = 'e'.repeat(40);
const sourceBody = [
  `Android source release ${tagName}.`,
  '',
  'Corresponding source: https://github.com/Chessticize/chessticize-mobile',
  'The installable Play-signed APK is published separately only after protected human approval.',
].join('\n');
const release = {
  id: 41,
  tag_name: tagName,
  target_commitish: commitSha,
  name: `Chessticize Android ${publicVersion} (${versionCode})`,
  body: sourceBody,
  draft: false,
  prerelease: false,
  html_url: `https://github.com/Chessticize/chessticize-mobile/releases/tag/${tagName}`,
};
const assets = [{
  id: 42,
  name: 'android-source-manifest.json',
  size: sourceManifestBytes.length,
  digest: `sha256:${sourceManifestSha256}`,
  browser_download_url: 'https://example.invalid/android-source-manifest.json',
}];
let nextAssetId = 50;

function jsonResponse(value, status = 200) {
  return new ResponseImplementation(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readRequestBytes(body) {
  if (Buffer.isBuffer(body)) return body;
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function record(event) {
  if (process.env.FAKE_RELEASE_HTTP_LOG) {
    fs.appendFileSync(process.env.FAKE_RELEASE_HTTP_LOG, `${event}\n`);
  }
}

global.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  const method = options.method ?? 'GET';

  if (url.hostname === 'androidpublisher.googleapis.com') {
    if (options.headers?.Authorization !== 'Bearer fake-play-token') {
      return jsonResponse({ message: 'unauthorized Play request' }, 401);
    }
    if (url.pathname.endsWith(`/generatedApks/${versionCode}`)) {
      return jsonResponse({
        generatedApks: [{
          certificateSha256Hash: certificateSha256,
          targetingInfo: { packageName: 'com.chessticize.mobile' },
          generatedUniversalApk: { downloadId: 'universal-download-7' },
        }],
      });
    }
    if (url.pathname.endsWith('/downloads/universal-download-7:download')) {
      return new ResponseImplementation(apkBytes, { status: 200 });
    }
  }

  if (options.headers?.Authorization !== 'Bearer fake-cli-token') {
    return jsonResponse({ message: 'unauthorized GitHub request' }, 401);
  }
  if (method === 'GET' && url.pathname.includes('/git/ref/tags/')) {
    return jsonResponse({ object: { type: 'tag', sha: annotatedTagSha } });
  }
  if (method === 'GET' && url.pathname.endsWith(`/git/tags/${annotatedTagSha}`)) {
    return jsonResponse({
      object: { type: 'commit', sha: commitSha },
      verification: { verified: false },
    });
  }
  if (method === 'GET' && url.pathname.endsWith('/releases/41/assets')) {
    return jsonResponse(assets);
  }
  if (method === 'GET' && url.pathname.endsWith('/releases/assets/42')) {
    return jsonResponse(assets[0]);
  }
  if (method === 'GET' && url.pathname.endsWith('/releases/41')) {
    return jsonResponse(release);
  }
  if (method === 'PATCH' && url.pathname.endsWith('/releases/41')) {
    const update = JSON.parse(String(options.body));
    Object.assign(release, update);
    record('patch:release-notes');
    return jsonResponse(release);
  }
  if (method === 'POST' && url.hostname === 'uploads.github.com' &&
      url.pathname.endsWith('/releases/41/assets')) {
    const bytes = await readRequestBytes(options.body);
    const name = url.searchParams.get('name');
    const asset = {
      id: nextAssetId++,
      name,
      size: bytes.length,
      digest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
      browser_download_url: `https://example.invalid/${encodeURIComponent(name)}`,
    };
    assets.push(asset);
    record(`upload:${name}`);
    return jsonResponse(asset, 201);
  }
  if (method === 'DELETE' && url.pathname.includes('/releases/assets/')) {
    return new ResponseImplementation(null, { status: 204 });
  }

  return jsonResponse({ message: `unexpected fake request: ${method} ${url}` }, 500);
};
