const { execFileSync } = require('node:child_process');
const { androidAdbPath } = require('./androidNetwork');

const ANDROID_PUBLIC_UI_HIERARCHY_PATH = '/sdcard/chessticize-public-window.xml';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readAndroidUiHierarchy(
  environment = process.env,
  run = execFileSync,
  remotePath = ANDROID_PUBLIC_UI_HIERARCHY_PATH
) {
  const adb = androidAdbPath(environment);
  const serial = environment.DETOX_ANDROID_DEVICE || 'emulator-5554';
  const options = {
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
    timeout: 30000,
  };
  // uiautomator can return exit code zero after printing "could not get idle
  // state" and leave the previous XML untouched. Remove the prior attempt
  // first and do not read the path unless this attempt reports no dump error.
  run(adb, ['-s', serial, 'shell', 'rm', '-f', remotePath], options);
  const dumpOutput = String(
    run(adb, ['-s', serial, 'shell', 'uiautomator', 'dump', remotePath], options) ?? ''
  ).trim();
  if (/\berror\b|could not get idle state/i.test(dumpOutput)) {
    throw new Error(`Android UI hierarchy dump failed: ${dumpOutput || '<no output>'}`);
  }
  const hierarchy = String(
    run(adb, ['-s', serial, 'exec-out', 'cat', remotePath], options) ?? ''
  ).trim();
  if (!hierarchy || !/<hierarchy\b/i.test(hierarchy)) {
    throw new Error(
      `Android UI hierarchy read returned ${hierarchy ? 'invalid' : 'empty'} XML`
    );
  }
  return hierarchy;
}

function androidUiAttribute(node, attribute) {
  return node.match(new RegExp(`\\b${attribute}="([^"]*)"`))?.[1] ?? '';
}

function visibleAndroidUiNodesByResourceId(hierarchy, resourceId) {
  const normalizedResourceId = String(resourceId).toLowerCase();
  const nodes = String(hierarchy).match(/<node\b[^>]*\/?\s*>/g) ?? [];
  return nodes.filter((node) => {
    const actualResourceId = androidUiAttribute(node, 'resource-id').toLowerCase();
    const exactResourceId = actualResourceId === normalizedResourceId
      || actualResourceId.endsWith(`:id/${normalizedResourceId}`)
      || actualResourceId.endsWith(`/id/${normalizedResourceId}`);
    const explicitlyHidden = androidUiAttribute(node, 'visible-to-user') === 'false'
      || androidUiAttribute(node, 'displayed') === 'false';
    return exactResourceId && !explicitlyHidden;
  });
}

function parseAndroidUiBounds(node, resourceId) {
  const match = androidUiAttribute(node, 'bounds')
    .match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!match) {
    throw new Error(`Invalid visible bounds for Android UI node ${resourceId}: missing or malformed`);
  }
  const bounds = {
    left: Number(match[1]),
    top: Number(match[2]),
    right: Number(match[3]),
    bottom: Number(match[4]),
  };
  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
    throw new Error(
      `Invalid visible bounds for Android UI node ${resourceId}: ${androidUiAttribute(node, 'bounds')}`
    );
  }
  return bounds;
}

function findUniqueAndroidUiNode(hierarchy, resourceId) {
  const matches = visibleAndroidUiNodesByResourceId(hierarchy, resourceId);
  if (matches.length === 0) {
    throw new Error(`Missing visible Android UI node ${resourceId}`);
  }
  if (matches.length > 1) {
    throw new Error(`Ambiguous visible Android UI node ${resourceId}: ${matches.length} matches`);
  }
  return {
    bounds: parseAndroidUiBounds(matches[0], resourceId),
    node: matches[0],
    resourceId,
  };
}

function tapAndroidUiNode(target, environment = process.env, run = execFileSync) {
  if (!target?.node || !target?.bounds || !target?.resourceId) {
    throw new Error('Android UI tap requires a uniquely resolved node with validated bounds');
  }
  if (androidUiAttribute(target.node, 'clickable') !== 'true') {
    throw new Error(`Android UI node ${target.resourceId} is not clickable`);
  }
  const adb = androidAdbPath(environment);
  const serial = environment.DETOX_ANDROID_DEVICE || 'emulator-5554';
  const centerX = Math.round((target.bounds.left + target.bounds.right) / 2);
  const centerY = Math.round((target.bounds.top + target.bounds.bottom) / 2);
  run(adb, [
    '-s', serial, 'shell', 'input', 'tap', String(centerX), String(centerY)
  ], {
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
    timeout: 30000,
  });
  return { x: centerX, y: centerY };
}

async function waitForAndroidUiState(
  {
    presentResourceIds = [],
    absentResourceIds = [],
    expectedAttributesByResourceId = {},
  },
  {
    delay = sleep,
    environment = process.env,
    now = Date.now,
    pollIntervalMs = 250,
    readHierarchy = () => readAndroidUiHierarchy(environment),
    timeoutMs = 10000,
  } = {}
) {
  if (presentResourceIds.length === 0 && absentResourceIds.length === 0) {
    throw new Error('Android UI state requires at least one present or absent resource ID');
  }
  const deadline = now() + timeoutMs;
  let latestHierarchy = '<unavailable>';
  let latestFailure = 'not observed';
  while (true) {
    try {
      latestHierarchy = '<unavailable>';
      latestHierarchy = String(readHierarchy() ?? '');
      const nodes = {};
      for (const resourceId of presentResourceIds) {
        nodes[resourceId] = findUniqueAndroidUiNode(latestHierarchy, resourceId);
        for (const [attribute, expectedValue] of Object.entries(
          expectedAttributesByResourceId[resourceId] ?? {}
        )) {
          const actualValue = androidUiAttribute(nodes[resourceId].node, attribute);
          if (actualValue !== expectedValue) {
            throw new Error(
              `Android UI node ${resourceId} expected ${attribute}=${expectedValue}; `
              + `received ${actualValue || '<missing>'}`
            );
          }
        }
      }
      const stillPresent = absentResourceIds.filter(
        (resourceId) => visibleAndroidUiNodesByResourceId(latestHierarchy, resourceId).length > 0
      );
      if (stillPresent.length === 0) {
        return { hierarchy: latestHierarchy, nodes };
      }
      latestFailure = `still present: ${stillPresent.join(', ')}`;
    } catch (error) {
      latestFailure = error?.message ?? String(error);
    }
    if (now() >= deadline) {
      throw new Error(
        'Timed out waiting for Android UI state: '
        + `present=${presentResourceIds.join(',') || '<none>'}; `
        + `absent=${absentResourceIds.join(',') || '<none>'}; `
        + `latest=${latestFailure}; hierarchy=${latestHierarchy}`
      );
    }
    await delay(pollIntervalMs);
  }
}

module.exports = {
  findUniqueAndroidUiNode,
  readAndroidUiHierarchy,
  tapAndroidUiNode,
  waitForAndroidUiState,
};
