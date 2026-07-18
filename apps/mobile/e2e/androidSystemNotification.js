const { readAndroidUiHierarchy } = require('./androidPublicUiEvidence');

const DEFAULT_POLL_INTERVAL_MS = 400;
const XML_S_SOURCE = '[\\x20\\x09\\x0D\\x0A]';
const ANDROID_UI_ATTRIBUTE = new RegExp(
  `([\\w:-]+)${XML_S_SOURCE}*=${XML_S_SOURCE}*"([^"]*)"`,
  'g'
);
const ANDROID_UI_NODE = new RegExp(
  `</?node(?=${XML_S_SOURCE}|[/>])[^>]*>`,
  'g'
);

function findExactAndroidNotificationRow(hierarchy, { title, body }) {
  const nodes = parseAndroidUiNodes(hierarchy);
  const candidateRows = new Set();

  for (const node of walkAndroidUiNodes(nodes)) {
    if (!nodeHasExactPublicText(node, body)) {
      continue;
    }
    const clickableRow = nearestClickableNode(node);
    if (clickableRow && subtreeHasExactPublicText(clickableRow, title)) {
      candidateRows.add(clickableRow);
    }
  }

  if (candidateRows.size > 1) {
    throw new Error(
      `Ambiguous exact Android SystemUI notification row: ${candidateRows.size} matches`
    );
  }
  const row = candidateRows.values().next().value;
  if (!row) {
    return null;
  }
  return {
    bounds: parseAndroidUiBounds(row.attributes.bounds),
    node: row.token,
  };
}

async function waitForAndTapExactAndroidNotificationRow({
  body,
  delay = defaultDelay,
  now = Date.now,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  readHierarchy,
  tapBounds,
  timeoutMs,
  title,
}) {
  const deadline = now() + timeoutMs;
  let latestHierarchy = '';

  while (now() < deadline) {
    latestHierarchy = String(readHierarchy() ?? '');
    const row = findExactAndroidNotificationRow(latestHierarchy, { body, title });
    if (row && now() <= deadline) {
      await tapBounds(row.bounds);
      return { hierarchy: latestHierarchy, row };
    }
    await delayUntilNextPoll(deadline, now, pollIntervalMs, delay);
  }

  throw new Error(
    'Timed out waiting for exact Android SystemUI notification row '
    + `title=${JSON.stringify(title)} body=${JSON.stringify(body)}. `
    + `Latest hierarchy: ${latestHierarchy || '<empty>'}`
  );
}

async function waitForAndTapExactAndroidNotificationFromPublicUi({
  environment = process.env,
  run,
  ...options
}) {
  return waitForAndTapExactAndroidNotificationRow({
    ...options,
    readHierarchy: () => readAndroidUiHierarchy(environment, run),
  });
}

function parseAndroidUiNodes(hierarchy) {
  const roots = [];
  const stack = [];
  const tokens = String(hierarchy).match(ANDROID_UI_NODE) ?? [];

  for (const token of tokens) {
    if (token.startsWith('</')) {
      stack.pop();
      continue;
    }
    const parent = stack.at(-1) ?? null;
    const node = {
      attributes: parseAndroidUiAttributes(token),
      children: [],
      parent,
      token,
    };
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    if (!token.endsWith('/>')) {
      stack.push(node);
    }
  }

  return roots;
}

function parseAndroidUiAttributes(token) {
  const attributes = {};
  for (const match of token.matchAll(ANDROID_UI_ATTRIBUTE)) {
    attributes[match[1]] = decodeAndroidUiAttribute(match[2]);
  }
  return attributes;
}

function decodeAndroidUiAttribute(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function* walkAndroidUiNodes(nodes) {
  for (const node of nodes) {
    yield node;
    yield* walkAndroidUiNodes(node.children);
  }
}

function nodeHasExactPublicText(node, expected) {
  return node.attributes.text === expected || node.attributes['content-desc'] === expected;
}

function subtreeHasExactPublicText(node, expected) {
  return [...walkAndroidUiNodes([node])]
    .some((candidate) => nodeHasExactPublicText(candidate, expected));
}

function nearestClickableNode(node) {
  let candidate = node;
  while (candidate) {
    if (candidate.attributes.clickable === 'true') {
      return candidate;
    }
    candidate = candidate.parent;
  }
  return null;
}

function parseAndroidUiBounds(value) {
  const match = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(value ?? '');
  const bounds = {
    bottom: Number(match?.[4]),
    left: Number(match?.[1]),
    right: Number(match?.[3]),
    top: Number(match?.[2]),
  };
  if (
    !match
    || bounds.right <= bounds.left
    || bounds.bottom <= bounds.top
  ) {
    throw new Error(`Invalid exact Android SystemUI notification bounds: ${value ?? '<missing>'}`);
  }
  return bounds;
}

async function delayUntilNextPoll(deadline, now, pollIntervalMs, delay) {
  const remainingMs = deadline - now();
  if (remainingMs > 0) {
    await delay(Math.min(pollIntervalMs, remainingMs));
  }
}

function defaultDelay(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

module.exports = {
  findExactAndroidNotificationRow,
  waitForAndTapExactAndroidNotificationFromPublicUi,
  waitForAndTapExactAndroidNotificationRow,
};
