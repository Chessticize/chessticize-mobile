/* global by, element, expect, waitFor */

const { frameFor, sleep } = require('./helpers');
const { expectFrameContained } = require('./screenshotAssertions');

// Every visible part of the first-use guide overlay must sit inside the Safe
// Area (the `adaptive-layout` frame) without scrolling (#602, #611).
const GUIDE_CONTROL_TEST_IDS = [
  'practice-session-guide-navigation',
  'practice-session-guide-back',
  'practice-session-guide-coach-progress',
  'practice-session-guide-start',
  'practice-session-guide-exit',
];

async function frameForIfPresent(testID) {
  try {
    return await frameFor(element(by.id(testID)));
  } catch {
    return null;
  }
}

async function existsNow(testID) {
  try {
    await expect(element(by.id(testID))).toExist();
    return true;
  } catch {
    return false;
  }
}

function sameFrame(a, b) {
  return a && b
    && Math.abs(a.x - b.x) < 0.5
    && Math.abs(a.y - b.y) < 0.5
    && Math.abs(a.width - b.width) < 0.5
    && Math.abs(a.height - b.height) < 0.5;
}

// Waits until the overlay has measured its target (the cut-out exists) and the
// callout has stopped moving, then returns the settled callout frame.
async function waitForSettledSessionGuide(label) {
  await waitFor(element(by.id('practice-session-guide-cutout'))).toExist().withTimeout(10000);
  let previous = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await frameForIfPresent('practice-session-guide-callout');
    if (sameFrame(previous, current)) {
      return current;
    }
    previous = current;
    await sleep(150);
  }
  throw new Error(`${label} guide callout did not settle: last=${JSON.stringify(previous)}`);
}

async function expectSessionGuideContained(label) {
  const calloutFrame = await waitForSettledSessionGuide(label);
  const safeFrame = await frameFor(element(by.id('adaptive-layout')));
  expectFrameContained(calloutFrame, safeFrame, `${label} callout`);

  const pointerFrame = await frameForIfPresent('practice-session-guide-pointer');
  if (pointerFrame) {
    expectFrameContained(pointerFrame, safeFrame, `${label} pointer`);
  }
  const navigationFrame = await frameFor(element(by.id('practice-session-guide-navigation')));
  expectFrameContained(navigationFrame, calloutFrame, `${label} navigation in callout`);
  for (const testID of GUIDE_CONTROL_TEST_IDS) {
    const frame = await frameForIfPresent(testID);
    if (frame) {
      expectFrameContained(frame, safeFrame, `${label} ${testID}`);
    }
  }
  return {
    callout: calloutFrame,
    navigation: navigationFrame,
    pointer: pointerFrame,
    safe: safeFrame,
  };
}

module.exports = {
  existsNow,
  expectSessionGuideContained,
  frameForIfPresent,
  waitForSettledSessionGuide,
};
