const { execFileSync } = require('node:child_process');
const { androidAdbPath } = require('./androidNetwork');

const ANDROID_PUBLIC_UI_HIERARCHY_PATH = '/sdcard/chessticize-public-window.xml';
const XML_NAME_SOURCE = '[A-Za-z_][\\w.:-]*';
const XML_S_SOURCE = '[\\x20\\x09\\x0D\\x0A]';
const XML_ENTITY_SOURCE = '&(?:amp|lt|gt|quot|apos|#\\d+|#x[\\dA-Fa-f]+);';
const XML_DOUBLE_QUOTED_VALUE_SOURCE = `"(?:[^"<&]|${XML_ENTITY_SOURCE})*"`;
const XML_SINGLE_QUOTED_VALUE_SOURCE = `'(?:[^'<&]|${XML_ENTITY_SOURCE})*'`;
const ANDROID_UI_OPENING_TAG = new RegExp(
  `^<(${XML_NAME_SOURCE})(?:${XML_S_SOURCE}+${XML_NAME_SOURCE}`
  + `${XML_S_SOURCE}*=${XML_S_SOURCE}*`
  + `(?:${XML_DOUBLE_QUOTED_VALUE_SOURCE}|${XML_SINGLE_QUOTED_VALUE_SOURCE}))*`
  + `${XML_S_SOURCE}*(/?)>$`
);
const ANDROID_UI_ATTRIBUTE = new RegExp(
  `${XML_S_SOURCE}+(${XML_NAME_SOURCE})${XML_S_SOURCE}*=${XML_S_SOURCE}*`
  + `(?:${XML_DOUBLE_QUOTED_VALUE_SOURCE}|${XML_SINGLE_QUOTED_VALUE_SOURCE})`,
  'y'
);
const ANDROID_UI_XML_DECLARATION = new RegExp(
  `^<\\?xml${XML_S_SOURCE}+version${XML_S_SOURCE}*=${XML_S_SOURCE}*`
  + `(?:"1\\.[01]"|'1\\.[01]')`
  + `(?:${XML_S_SOURCE}+encoding${XML_S_SOURCE}*=${XML_S_SOURCE}*`
  + `(?:"[A-Za-z][\\w.-]*"|'[A-Za-z][\\w.-]*'))?`
  + `(?:${XML_S_SOURCE}+standalone${XML_S_SOURCE}*=${XML_S_SOURCE}*`
  + `(?:"(?:yes|no)"|'(?:yes|no)'))?${XML_S_SOURCE}*\\?>$`
);
const ANDROID_UI_CLOSING_TAG = new RegExp(
  `^</(${XML_NAME_SOURCE})${XML_S_SOURCE}*>$`
);
const ANDROID_UI_NODE = new RegExp(
  `<node(?=${XML_S_SOURCE}|[/>])[^>]*>`,
  'g'
);
const XML_NUMERIC_CHARACTER_REFERENCE = /&#(x[\dA-Fa-f]+|\d+);/g;

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
  );
  const normalizedHierarchy = trimXmlWhitespace(hierarchy);
  if (!normalizedHierarchy || !isWellFormedAndroidUiHierarchy(normalizedHierarchy)) {
    throw new Error(
      `Android UI hierarchy read returned ${normalizedHierarchy ? 'invalid' : 'empty'} XML`
    );
  }
  return normalizedHierarchy;
}

function isWellFormedAndroidUiHierarchy(hierarchy) {
  const xml = String(hierarchy);
  if (!hasOnlyValidXml10Characters(xml)) {
    return false;
  }
  const stack = [];
  const tokenPattern = /<[^<>]*>/g;
  let cursor = 0;
  let declarationSeen = false;
  let rootSeen = false;
  let tokenMatch;

  while ((tokenMatch = tokenPattern.exec(xml)) !== null) {
    if (!containsOnlyXmlWhitespace(xml.slice(cursor, tokenMatch.index))) {
      return false;
    }
    const token = tokenMatch[0];
    if (token.startsWith('<?xml')) {
      if (
        declarationSeen
        || rootSeen
        || !ANDROID_UI_XML_DECLARATION.test(token)
      ) {
        return false;
      }
      declarationSeen = true;
      cursor = tokenPattern.lastIndex;
      continue;
    }

    const closing = ANDROID_UI_CLOSING_TAG.exec(token);
    if (closing) {
      if (stack.pop() !== closing[1]) {
        return false;
      }
      cursor = tokenPattern.lastIndex;
      continue;
    }

    const opening = ANDROID_UI_OPENING_TAG.exec(token);
    if (!opening || hasDuplicateXmlAttributes(token, opening[1])) {
      return false;
    }
    if (stack.length === 0) {
      if (rootSeen || opening[1] !== 'hierarchy') {
        return false;
      }
      rootSeen = true;
    } else if (opening[1] === 'hierarchy') {
      return false;
    }
    if (!opening[2]) {
      stack.push(opening[1]);
    }
    cursor = tokenPattern.lastIndex;
  }

  return rootSeen
    && stack.length === 0
    && containsOnlyXmlWhitespace(xml.slice(cursor));
}

function trimXmlWhitespace(value) {
  let start = 0;
  let end = value.length;
  while (start < end && isXmlWhitespace(value.charCodeAt(start))) {
    start += 1;
  }
  while (end > start && isXmlWhitespace(value.charCodeAt(end - 1))) {
    end -= 1;
  }
  return value.slice(start, end);
}

function containsOnlyXmlWhitespace(value) {
  for (let index = 0; index < value.length; index += 1) {
    if (!isXmlWhitespace(value.charCodeAt(index))) {
      return false;
    }
  }
  return true;
}

function isXmlWhitespace(codeUnit) {
  return codeUnit === 0x20
    || codeUnit === 0x09
    || codeUnit === 0x0A
    || codeUnit === 0x0D;
}

function hasOnlyValidXml10Characters(xml) {
  for (let cursor = 0; cursor < xml.length;) {
    const codePoint = xml.codePointAt(cursor);
    if (!isValidXml10Character(codePoint)) {
      return false;
    }
    cursor += codePoint > 0xFFFF ? 2 : 1;
  }

  for (const reference of xml.matchAll(XML_NUMERIC_CHARACTER_REFERENCE)) {
    const hexadecimal = reference[1][0] === 'x';
    const digits = reference[1].slice(hexadecimal ? 1 : 0);
    const significantDigits = digits.replace(/^0+/, '') || '0';
    if (significantDigits.length > (hexadecimal ? 6 : 7)) {
      return false;
    }
    const codePoint = Number.parseInt(significantDigits, hexadecimal ? 16 : 10);
    if (!isValidXml10Character(codePoint)) {
      return false;
    }
  }
  return true;
}

function isValidXml10Character(codePoint) {
  return codePoint === 0x09
    || codePoint === 0x0A
    || codePoint === 0x0D
    || (codePoint >= 0x20 && codePoint <= 0xD7FF)
    || (codePoint >= 0xE000 && codePoint <= 0xFFFD)
    || (codePoint >= 0x10000 && codePoint <= 0x10FFFF);
}

function hasDuplicateXmlAttributes(token, elementName) {
  const names = new Set();
  let cursor = elementName.length + 1;
  while (cursor < token.length) {
    ANDROID_UI_ATTRIBUTE.lastIndex = cursor;
    const attribute = ANDROID_UI_ATTRIBUTE.exec(token);
    if (!attribute) {
      return false;
    }
    if (names.has(attribute[1])) {
      return true;
    }
    names.add(attribute[1]);
    cursor = ANDROID_UI_ATTRIBUTE.lastIndex;
  }
  return false;
}

function androidUiAttribute(node, attribute) {
  return node.match(new RegExp(
    `\\b${attribute}${XML_S_SOURCE}*=${XML_S_SOURCE}*"([^"]*)"`
  ))?.[1] ?? '';
}

function visibleAndroidUiNodesByResourceId(hierarchy, resourceId) {
  const normalizedResourceId = String(resourceId).toLowerCase();
  const nodes = String(hierarchy).match(ANDROID_UI_NODE) ?? [];
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
