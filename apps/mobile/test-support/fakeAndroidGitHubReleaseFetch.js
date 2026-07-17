const crypto = require('node:crypto');
const { Buffer } = require('node:buffer');

const ResponseImplementation = global.Response;
const commitSha = 'a'.repeat(40);
const annotatedTagSha = 'e'.repeat(40);

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
  if (method === 'GET' && url.pathname.endsWith('/releases')) {
    return jsonResponse([]);
  }
  if (method === 'POST' && url.hostname === 'api.github.com' &&
      url.pathname.endsWith('/releases')) {
    const release = JSON.parse(String(options.body));
    return jsonResponse({
      id: 41,
      tag_name: release.tag_name,
      target_commitish: release.target_commitish,
      name: release.name,
      body: release.body,
      draft: release.draft,
      prerelease: release.prerelease,
      html_url: `https://github.com/Chessticize/chessticize-mobile/releases/tag/${release.tag_name}`,
    }, 201);
  }
  if (method === 'POST' && url.hostname === 'uploads.github.com' &&
      url.pathname.endsWith('/assets')) {
    const bytes = await readRequestBytes(options.body);
    return jsonResponse({
      id: 42,
      name: url.searchParams.get('name'),
      size: bytes.length,
      digest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
      browser_download_url: 'https://example.invalid/android-source-manifest.json',
    }, 201);
  }

  return jsonResponse({ message: `unexpected fake request: ${method} ${url}` }, 500);
};
