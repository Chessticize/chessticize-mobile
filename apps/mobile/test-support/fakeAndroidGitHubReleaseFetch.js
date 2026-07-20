const crypto = require('node:crypto');
const { Buffer } = require('node:buffer');

const ResponseImplementation = global.Response;
const commitSha = 'a'.repeat(40);
const annotatedTagSha = 'e'.repeat(40);
let release;
let sourceAsset;

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

global.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  const method = options.method ?? 'GET';
  if (options.headers?.Authorization !== 'Bearer fake-cli-token') {
    return jsonResponse({ message: 'unauthorized' }, 401);
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
  if (method === 'GET' && url.pathname.includes('/releases/tags/')) {
    return release ? jsonResponse(release) : jsonResponse({ message: 'not found' }, 404);
  }
  if (method === 'POST' && url.hostname === 'api.github.com' &&
      url.pathname.endsWith('/releases')) {
    const inputRelease = JSON.parse(String(options.body));
    if (Object.hasOwn(inputRelease, 'target_commitish')) {
      return jsonResponse({ message: 'target_commitish must be omitted for an existing tag' }, 422);
    }
    release = {
      id: 41,
      tag_name: inputRelease.tag_name,
      target_commitish: 'main',
      name: inputRelease.name,
      body: inputRelease.body,
      draft: inputRelease.draft,
      prerelease: inputRelease.prerelease,
      html_url: `https://github.com/Chessticize/chessticize-mobile/releases/tag/${inputRelease.tag_name}`,
    };
    return jsonResponse(release, 201);
  }
  if (method === 'POST' && url.hostname === 'uploads.github.com' &&
      url.pathname.endsWith('/assets')) {
    const bytes = await readRequestBytes(options.body);
    sourceAsset = {
      id: 42,
      name: url.searchParams.get('name'),
      size: bytes.length,
      digest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
      browser_download_url: 'https://example.invalid/android-source-manifest.json',
    };
    return jsonResponse(sourceAsset, 201);
  }
  if (method === 'GET' && url.pathname.endsWith('/releases/41')) {
    return jsonResponse(release);
  }
  if (method === 'GET' && url.pathname.endsWith('/releases/assets/42')) {
    return jsonResponse(sourceAsset);
  }
  if (method === 'GET' && url.pathname.endsWith('/releases/41/assets')) {
    return jsonResponse(sourceAsset ? [sourceAsset] : []);
  }
  if (method === 'PATCH' && url.pathname.endsWith('/releases/41')) {
    release = { ...release, ...JSON.parse(String(options.body)) };
    return jsonResponse(release);
  }

  return jsonResponse({ message: `unexpected fake request: ${method} ${url}` }, 500);
};
