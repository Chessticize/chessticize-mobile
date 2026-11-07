/* global by, describe, device, element, expect, it, waitFor */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  elementText,
  frameFor,
  launchWithDisabledSynchronization,
  playBoardMove,
  selectTestPuzzleSource,
  setAndroidDisplayOrientation,
  sleep,
  waitForVisibleInPracticeScroll,
  withAndroidUiDiagnostics
} = require('./helpers');
const {
  expectBoardScreenshotContainsPieces,
  expectFrameContained,
  waitForBoardScreenshotContainsPieces,
} = require('./screenshotAssertions');
const {
  createAdaptiveScreenshotArchiver,
  sanitizeAdaptiveScreenshotLabel,
} = require('./adaptiveScreenshotEvidence');
const { expectSessionGuideContained } = require('./sessionGuideAssertions');

const describeAdaptiveLayout = process.env.CHESSTICIZE_CAPTURE_ADAPTIVE_LAYOUT === '1'
  || process.env.DETOX_ACTIVE_SUITE === 'android-adaptive-layout'
  ? describe
  : describe.skip;

const deviceLabel = sanitizeAdaptiveScreenshotLabel(
  process.env.CHESSTICIZE_ADAPTIVE_DEVICE_LABEL || 'simulator'
);
const includeLandscape = process.env.CHESSTICIZE_ADAPTIVE_INCLUDE_LANDSCAPE === '1';
const onlyOrientation = process.env.CHESSTICIZE_ADAPTIVE_ONLY_ORIENTATION;
// Detox captures the default iOS framebuffer. A folded iPhone Duo renders the
// app on its outer display (simctl device name `primary`) while that default
// is the dark inner display, so the run can name the display to capture.
const iosScreenshotDisplay = process.env.CHESSTICIZE_ADAPTIVE_IOS_SCREENSHOT_DISPLAY;
const archiveAdaptiveScreenshot = createAdaptiveScreenshotArchiver();

describeAdaptiveLayout('Adaptive layout screenshot capture', () => {
  it('captures representative layouts and preserves the active puzzle through rotation', async () => {
    const initialOrientation = onlyOrientation === 'landscape' ? 'landscape' : 'portrait';
    await launchForOrientation(initialOrientation);
    await waitForHomeTopFrame();
    await assertFirstUseSprintRulesGuideLayout();
    await captureHome(initialOrientation);

    await selectTestPuzzleSource('familiar15');
    await element(by.id('practice-main-scroll')).scrollTo('top');
    await sleep(300);
    await walkArrowDuelGuideAndExit(initialOrientation);
    await startStandardSprintThroughContainedGuide(initialOrientation);
    await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(30000);
    await waitFor(element(by.id('session-current-puzzle-id'))).toExist().withTimeout(10000);
    await waitForSettledSprintLayout(initialOrientation);

    const puzzleID = await elementText('session-current-puzzle-id');
    await captureSprint(initialOrientation);
    await expectSessionControlsContained(initialOrientation);

    if (includeLandscape && initialOrientation === 'portrait') {
      await setAdaptiveOrientation('landscape');
      await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(10000);
      await waitForSettledSprintLayout('landscape');
      const rotatedPuzzleID = await elementText('session-current-puzzle-id');
      if (rotatedPuzzleID !== puzzleID) {
        throw new Error(`Rotation replaced the active puzzle: ${puzzleID} -> ${rotatedPuzzleID}`);
      }
      await captureSprint('landscape', { waitForPieces: true });
      // Rotation is the resize Detox can drive on iOS and Android. The same
      // containment contract applies to iPhone Duo fold/unfold and Split View
      // resizes, which the simulator cannot yet perform headlessly.
      await expectSessionControlsContained('landscape');
    }

    const needsPortraitRestore = includeLandscape || initialOrientation === 'landscape';
    if (device.getPlatform() === 'android' && needsPortraitRestore) {
      // API 36 large-screen activities ignore requested-orientation hints, so
      // the evidence harness rotates the physical display. Return to the
      // natural orientation and reacquire the public app root before tapping
      // the real board; otherwise the rotated base window can remain the
      // unfocused Espresso root while board input is submitted. A foldable's
      // natural portrait viewport can report a few physical pixels of rounding
      // overflow. This portrait state is not captured as evidence, so allow a
      // bounded 16-physical-pixel tolerance while reacquiring focus; every
      // captured layout keeps the default strict containment check.
      await setAdaptiveOrientation('portrait');
      await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(10000);
      await waitForSettledSprintLayout('portrait', { containmentTolerance: 16 });
      await waitFor(element(by.id('adaptive-layout'))).toBeVisible().withTimeout(10000);
      const restoredPuzzleID = await elementText('session-current-puzzle-id');
      if (restoredPuzzleID !== puzzleID) {
        throw new Error(`Portrait restoration replaced the active puzzle: ${puzzleID} -> ${restoredPuzzleID}`);
      }
    }

    if (device.getPlatform() === 'android') {
      await withAndroidUiDiagnostics(async () => {
        // Familiar 15's first Standard puzzle is a versioned product fixture:
        // c2b3 is legal but wrong, while alternate mate c2b1 is accepted.
        // Submit the move through the real board so every adaptive profile
        // retains coordinate-mapping evidence after the public move chooser
        // was removed from the product.
        await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(10000);
        await playBoardMove('session-board', 'c2b3');
        // The transient feedback overlay can finish before Detox begins its
        // next poll. The persistent public score proves the real board move.
        await waitFor(element(by.label('Mistakes 1 of 3')).atIndex(0)).toExist().withTimeout(10000);
        await waitFor(element(by.id('move-feedback-overlay'))).not.toExist().withTimeout(10000);

        // A terminal wrong result advances the sprint to Familiar 15 puzzle two;
        // c4b5 is its maintained legal-wrong fixture move (also used by the full
        // public-UI sprint failure journey). Submit that move through the real
        // board to retain coordinate-mapping evidence on every display profile.
        await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(10000);
        await playBoardMove('session-board', 'c4b5');
        await waitFor(element(by.label('Mistakes 2 of 3')).atIndex(0)).toExist().withTimeout(10000);
        await waitFor(element(by.id('session-progress'))).toHaveText('0 / 15').withTimeout(10000);
      });
    }

    if (
      needsPortraitRestore
      && device.getPlatform() !== 'android'
      && iosAppSupportsOrientation('portrait')
    ) {
      // Leave the emulator in its natural orientation before the shell applies
      // the next profile's portrait-shaped size override. The landscape-only
      // iPad validation build cannot rotate back, so it skips this restore.
      await setAdaptiveOrientation('portrait');
    }
  });
});

async function assertFirstUseSprintRulesGuideLayout() {
  const row = element(by.id('practice-sprint-rule-puzzle-timeout'));
  const badge = element(by.id('practice-sprint-rule-puzzle-timeout-badge'));
  const copy = element(by.id('practice-sprint-rule-puzzle-timeout-copy'));

  await waitFor(element(by.id('practice-sprint-rules-guide'))).toBeVisible().withTimeout(10000);
  await waitFor(element(by.text('TIMEOUT'))).toBeVisible().withTimeout(10000);

  const rowFrame = await frameFor(row);
  const badgeFrame = await frameFor(badge);
  const copyFrame = await frameFor(copy);
  expectFrameContained(badgeFrame, rowFrame, `${deviceLabel} TIMEOUT badge`);
  expectFrameContained(copyFrame, rowFrame, `${deviceLabel} Puzzle timeout copy`);

  const badgeCopyGap = copyFrame.x - (badgeFrame.x + badgeFrame.width);
  if (badgeCopyGap < 8) {
    throw new Error(
      `${deviceLabel} TIMEOUT badge crowds Puzzle timeout copy: gap=${badgeCopyGap} `
      + `badge=${JSON.stringify(badgeFrame)} copy=${JSON.stringify(copyFrame)}`
    );
  }
  if (deviceLabel.includes('large-text-phone') && badgeFrame.width <= 72) {
    throw new Error(
      `${deviceLabel} TIMEOUT badge did not expand beyond its 72-point baseline: `
      + JSON.stringify(badgeFrame)
    );
  }
}

async function selectAndStartRun(mode) {
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await waitForVisibleInPracticeScroll(`practice-run-${mode}`);
  await element(by.id(`practice-run-select-${mode}`)).tap();
  await element(by.id('practice-main-scroll')).scrollTo('top');
  if (await existsNow('practice-sprint-rules-dismiss')) {
    await element(by.id('practice-sprint-rules-dismiss')).tap();
    await element(by.id('practice-main-scroll')).scrollTo('top');
  }
  await waitFor(element(by.id('practice-run-start'))).toBeVisible().withTimeout(10000);
  await element(by.id('practice-run-start')).tap();
}

// A brand-new player's first Arrow Duel shows the header, choice and reply
// steps. Each step's callout, pointer and navigation must stay inside the Safe
// Area. Exit leaves the guide without recording it, so the Standard guide that
// follows still shows all three of its steps.
async function walkArrowDuelGuideAndExit(orientation) {
  await selectAndStartRun('arrow-duel');
  for (let step = 1; step <= 3; step += 1) {
    await waitFor(element(by.id('practice-session-guide-start'))).toExist().withTimeout(10000);
    await expectSessionGuideContained(`${deviceLabel} ${orientation} Arrow Duel guide step ${step}`);
    await takeAdaptiveScreenshot(`${deviceLabel}-${orientation}-arrow-duel-guide-${step}`);
    if (step < 3) {
      await element(by.id('practice-session-guide-start')).tap();
      await sleep(300);
    }
  }
  await element(by.id('practice-session-guide-exit')).tap();
  await waitFor(element(by.id('practice-home'))).toExist().withTimeout(10000);
  await expect(element(by.id('practice-arrow-duel-guide'))).not.toExist();
}

async function startStandardSprintThroughContainedGuide(orientation) {
  await selectAndStartRun('standard');

  for (let step = 1; step <= 8; step += 1) {
    try {
      await waitFor(element(by.id('practice-session-guide-start'))).toExist().withTimeout(5000);
    } catch {
      break;
    }
    if (
      !await existsNow('practice-active-session-guide')
      && !await existsNow('practice-arrow-duel-guide')
    ) {
      // The last Start action is leaving the guide for the live session.
      break;
    }
    await expectSessionGuideContained(`${deviceLabel} ${orientation} guide step ${step}`);
    await takeAdaptiveScreenshot(`${deviceLabel}-${orientation}-standard-guide-${step}`);
    await element(by.id('practice-session-guide-start')).tap();
    await sleep(300);
  }
}

async function expectSessionControlsContained(orientation) {
  const screenFrame = await frameFor(element(by.id('adaptive-layout')));
  for (const testID of [
    'session-board',
    'session-status-metrics',
    'session-score-strip',
    'session-abandon',
    'session-pause'
  ]) {
    const frame = await frameForIfPresent(testID);
    if (!frame) {
      throw new Error(`${deviceLabel} ${orientation} session is missing ${testID}`);
    }
    expectFrameContained(frame, screenFrame, `${deviceLabel} ${orientation} ${testID}`);
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

async function takeAdaptiveScreenshot(label) {
  if (device.getPlatform() !== 'ios' || !iosScreenshotDisplay) {
    return device.takeScreenshot(label);
  }
  const directory = path.resolve(__dirname, '../artifacts/adaptive-layout/display-screenshots');
  fs.mkdirSync(directory, { recursive: true });
  const screenshotPath = path.join(directory, `${sanitizeAdaptiveScreenshotLabel(label)}.png`);
  execFileSync('xcrun', [
    'simctl',
    'io',
    device.id,
    'screenshot',
    `--display=${iosScreenshotDisplay}`,
    screenshotPath
  ], { stdio: 'ignore' });
  return screenshotPath;
}

// Reads the orientations the installed iOS build declares for this device
// family, so a step that needs an orientation the build does not support
// (for example the landscape-only iPad validation build) is not attempted.
function iosAppSupportsOrientation(orientation) {
  const { config } = require('detox/internals');
  const app = Object.values(config.apps)[0];
  const infoPlistPath = path.resolve(process.cwd(), app.binaryPath, 'Info.plist');
  const deviceQuery = config.device.device ?? {};
  const deviceName = `${deviceQuery.name ?? ''} ${deviceQuery.type ?? ''}`;
  const keys = /iPad/i.test(deviceName)
    ? ['UISupportedInterfaceOrientations~ipad', 'UISupportedInterfaceOrientations']
    : ['UISupportedInterfaceOrientations'];
  for (const key of keys) {
    let declared;
    try {
      declared = JSON.parse(execFileSync(
        'plutil',
        ['-extract', key, 'json', '-o', '-', infoPlistPath],
        { encoding: 'utf8' }
      ));
    } catch {
      continue;
    }
    const prefix = orientation === 'portrait'
      ? 'UIInterfaceOrientationPortrait'
      : 'UIInterfaceOrientationLandscape';
    return declared.some((value) => value.startsWith(prefix));
  }
  return true;
}

async function captureHome(orientation) {
  await recordViewportMetrics(`${orientation}-home`);
  const homeFrame = await frameFor(element(by.id('adaptive-layout')));
  expectOrientationFrame(homeFrame, orientation);
  await takeAdaptiveScreenshot(`${deviceLabel}-${orientation}-home`);
}

async function captureSprint(orientation, { waitForPieces = false } = {}) {
  await recordViewportMetrics(`${orientation}-sprint`);
  const screenFrame = await frameFor(element(by.id('adaptive-layout')));
  const layoutFrame = await frameForIfPresent('active-session-adaptive-layout') ?? screenFrame;
  const boardFrame = await frameFor(element(by.id('session-board')));
  expectOrientationFrame(screenFrame, orientation);
  expectFrameContained(boardFrame, layoutFrame, `${deviceLabel} ${orientation} session board`);

  const screenshotLabel = `${deviceLabel}-${orientation}-standard-sprint`;
  if (waitForPieces) {
    await waitForBoardScreenshotContainsPieces({
      archiveScreenshot: archiveAdaptiveScreenshot,
      boardFrame,
      captureScreenshot: (label) => takeAdaptiveScreenshot(label),
      screenFrame,
      screenshotLabel,
    });
    return;
  }

  const screenshotPath = await takeAdaptiveScreenshot(screenshotLabel);
  expectBoardScreenshotContainsPieces(screenshotPath, boardFrame, screenFrame);
}

async function launchForOrientation(orientation) {
  await launchWithDisabledSynchronization({
    newInstance: true,
    delete: true
  });
  await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
  await setAdaptiveOrientation(orientation);
  await element(by.id('practice-main-scroll')).scrollTo('top');
}

async function setAdaptiveOrientation(orientation) {
  let rotationControl = 'detox-activity';
  let requestedRotation = orientation === 'landscape' ? 1 : 0;
  let actualRotation = requestedRotation;
  if (device.getPlatform() === 'android') {
    rotationControl = 'wm-user-rotation';
    ({ actualRotation, requestedRotation } = await setAndroidDisplayOrientation(orientation));
  } else {
    await device.setOrientation(orientation);
  }

  const frame = await waitForOrientation(orientation);
  const record = `orientation-request=${orientation} rotation-control=${rotationControl} `
    + `requested-rotation=${requestedRotation} actual-rotation=${actualRotation} `
    + `actual-root-bounds=${frame.width}x${frame.height}`;
  console.log(`[adaptive-orientation] ${record}`);
  const evidencePath = process.env.CHESSTICIZE_ADAPTIVE_ORIENTATION_EVIDENCE;
  if (evidencePath) {
    fs.appendFileSync(evidencePath, `${record}\n`, 'utf8');
  }
  return frame;
}

async function waitForOrientation(orientation) {
  let lastFrame = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      lastFrame = await frameFor(element(by.id('adaptive-layout')));
      if (frameHasOrientation(lastFrame, orientation)) {
        return lastFrame;
      }
    } catch {
      lastFrame = null;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${orientation} layout; last observed frame=${JSON.stringify(lastFrame)}`);
}

async function waitForSettledSprintLayout(
  orientation,
  { containmentTolerance = 1 } = {}
) {
  let lastFrames = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const screenFrame = await frameFor(element(by.id('adaptive-layout')));
      const layoutFrame = await frameForIfPresent('active-session-adaptive-layout') ?? screenFrame;
      const boardFrame = await frameFor(element(by.id('session-board')));
      lastFrames = { screenFrame, layoutFrame, boardFrame };

      if (frameHasOrientation(screenFrame, orientation)) {
        try {
          expectFrameContained(
            boardFrame,
            layoutFrame,
            `${deviceLabel} ${orientation} settling session board`,
            containmentTolerance
          );
          return;
        } catch {
          // React Native can publish the new root orientation before the
          // session board and its rail have completed their layout pass.
        }
      }
    } catch {
      // Keep the last complete frame set for a useful timeout diagnostic.
    }
    await sleep(250);
  }
  throw new Error(
    `Timed out waiting for ${orientation} session layout geometry; `
    + `last observed frames=${JSON.stringify(lastFrames)}`
  );
}

async function waitForHomeTopFrame() {
  // iPadOS 27 Detox reports the full-width Home header as below its 75%
  // visibility threshold even when it is on screen; its frame is asserted
  // inside the Safe Area instead.
  await waitFor(element(by.id('practice-action-header'))).toExist().withTimeout(10000);
  expectFrameContained(
    await frameFor(element(by.id('practice-action-header'))),
    await frameFor(element(by.id('adaptive-layout'))),
    `${deviceLabel} Home action header`
  );
  // Saved-run content can begin below the first-fold guide on maintained phone
  // viewports. Prove that the catalog rendered without requiring the top-frame
  // screenshot to expose offscreen content.
  await waitFor(element(by.id('practice-run-standard'))).toExist().withTimeout(10000);
  await waitFor(element(by.id('practice-progress-summary'))).toExist().withTimeout(10000);
  await expect(element(by.id('practice-review-strip'))).not.toExist();
}

// Records the measured window and safe-area insets so device-specific layout
// contracts (for example iPhone Duo inner and outer displays) can be copied
// into unit tests from real simulator geometry rather than guessed.
async function recordViewportMetrics(label) {
  const windowFrame = await frameFor(element(by.id('practice-gesture-root')));
  const safeFrame = await frameFor(element(by.id('adaptive-layout')));
  const layoutAttributes = await element(by.id('adaptive-layout')).getAttributes();
  const layoutLabel = (Array.isArray(layoutAttributes) ? layoutAttributes[0] : layoutAttributes).label;
  const insets = {
    top: safeFrame.y - windowFrame.y,
    left: safeFrame.x - windowFrame.x,
    bottom: windowFrame.y + windowFrame.height - (safeFrame.y + safeFrame.height),
    right: windowFrame.x + windowFrame.width - (safeFrame.x + safeFrame.width)
  };
  const record = `viewport ${deviceLabel} ${label} window=${windowFrame.width}x${windowFrame.height} `
    + `insets=${JSON.stringify(insets)} layout="${layoutLabel}"`;
  console.log(`[adaptive-viewport] ${record}`);
  const evidencePath = process.env.CHESSTICIZE_ADAPTIVE_ORIENTATION_EVIDENCE;
  if (evidencePath) {
    fs.appendFileSync(evidencePath, `${record}\n`, 'utf8');
  }
}

async function frameForIfPresent(testID) {
  try {
    return await frameFor(element(by.id(testID)));
  } catch {
    return null;
  }
}

function expectOrientationFrame(frame, orientation) {
  if (!frameHasOrientation(frame, orientation)) {
    throw new Error(`Expected ${orientation} frame, got ${JSON.stringify(frame)}`);
  }
}

function frameHasOrientation(frame, orientation) {
  return orientation === 'landscape'
    ? frame.width > frame.height
    : frame.height > frame.width;
}
