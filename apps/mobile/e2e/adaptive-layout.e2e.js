/* global by, describe, device, element, it, waitFor */

const fs = require('node:fs');
const {
  elementText,
  frameFor,
  launchWithDisabledSynchronization,
  playBoardMove,
  selectTestPuzzleSource,
  setAndroidDisplayOrientation,
  sleep,
  startPracticeMode,
  withAndroidUiDiagnostics
} = require('./helpers');
const {
  tapAndroidUiNode,
  waitForAndroidUiState,
} = require('./androidPublicUiEvidence');
const {
  expectBoardScreenshotContainsPieces,
  expectFrameContained,
  waitForBoardScreenshotContainsPieces,
} = require('./screenshotAssertions');
const {
  createAdaptiveScreenshotArchiver,
  sanitizeAdaptiveScreenshotLabel,
} = require('./adaptiveScreenshotEvidence');

const describeAdaptiveLayout = process.env.CHESSTICIZE_CAPTURE_ADAPTIVE_LAYOUT === '1'
  || process.env.DETOX_ACTIVE_SUITE === 'android-adaptive-layout'
  ? describe
  : describe.skip;

const deviceLabel = sanitizeAdaptiveScreenshotLabel(
  process.env.CHESSTICIZE_ADAPTIVE_DEVICE_LABEL || 'simulator'
);
const includeLandscape = process.env.CHESSTICIZE_ADAPTIVE_INCLUDE_LANDSCAPE === '1';
const expectReviewStripVisible = process.env.CHESSTICIZE_ADAPTIVE_EXPECT_REVIEW_STRIP === '1';
const onlyOrientation = process.env.CHESSTICIZE_ADAPTIVE_ONLY_ORIENTATION;
const archiveAdaptiveScreenshot = createAdaptiveScreenshotArchiver();

describeAdaptiveLayout('Adaptive layout screenshot capture', () => {
  it('captures representative layouts and preserves the active puzzle through rotation', async () => {
    const initialOrientation = onlyOrientation === 'landscape' ? 'landscape' : 'portrait';
    await launchForOrientation(initialOrientation);
    await waitForHomeTopFrame();
    await captureHome(initialOrientation);

    await selectTestPuzzleSource('familiar15');
    await element(by.id('practice-main-scroll')).scrollTo('top');
    await sleep(300);
    await startPracticeMode('standard');
    await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(30000);
    await waitFor(element(by.id('session-current-puzzle-id'))).toExist().withTimeout(10000);
    await waitForSettledSprintLayout(initialOrientation);

    const puzzleID = await elementText('session-current-puzzle-id');
    await captureSprint(initialOrientation);

    if (includeLandscape && initialOrientation === 'portrait') {
      await setAdaptiveOrientation('landscape');
      await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(10000);
      await waitForSettledSprintLayout('landscape');
      const rotatedPuzzleID = await elementText('session-current-puzzle-id');
      if (rotatedPuzzleID !== puzzleID) {
        throw new Error(`Rotation replaced the active puzzle: ${puzzleID} -> ${rotatedPuzzleID}`);
      }
      await captureSprint('landscape', { waitForPieces: true });
    }

    const needsPortraitRestore = includeLandscape || initialOrientation === 'landscape';
    if (device.getPlatform() === 'android' && needsPortraitRestore) {
      // API 36 large-screen activities ignore requested-orientation hints, so
      // the evidence harness rotates the physical display. Return to the
      // natural orientation and reacquire the public app root before opening
      // a native Modal; otherwise the rotated base window can remain the
      // unfocused Espresso root while the dialog is being attached.
      await setAdaptiveOrientation('portrait');
      await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(10000);
      await waitForSettledSprintLayout('portrait');
      await waitFor(element(by.id('adaptive-layout'))).toBeVisible().withTimeout(10000);
      const restoredPuzzleID = await elementText('session-current-puzzle-id');
      if (restoredPuzzleID !== puzzleID) {
        throw new Error(`Portrait restoration replaced the active puzzle: ${puzzleID} -> ${restoredPuzzleID}`);
      }
    }

    if (device.getPlatform() === 'android') {
      await withAndroidUiDiagnostics(async () => {
        await waitFor(element(by.id('session-accessible-moves-open'))).toBeVisible().withTimeout(10000);
        await element(by.id('session-accessible-moves-open')).tap();
        // Familiar 15's first Standard puzzle is a versioned product fixture:
        // c2b3 is legal but wrong, while alternate mate c2b1 is accepted. The
        // chooser is a native Modal, so inspect its fresh public hierarchy and
        // tap the exact exposed action instead of asking Espresso to select an
        // unfocused application root while the Modal window owns focus.
        const accessibleMoves = await waitForAndroidPublicMoves(['c2b1', 'c2b3']);
        tapAndroidUiNode(accessibleMoves.c2b3);
        // Once the Modal dismisses, return to the focused application window.
        // The active Sprint clock intentionally keeps that window non-idle for
        // shell UIAutomator, so prove the post-state through Detox's public UI.
        await waitFor(element(by.id('session-accessible-move-c2b3'))).not.toExist().withTimeout(10000);
        await waitFor(element(by.label('Mistakes 1 of 3')).atIndex(0)).toExist().withTimeout(10000);
        await waitFor(element(by.id('move-feedback-overlay'))).not.toExist().withTimeout(10000);

        // A terminal wrong result advances the sprint to Familiar 15 puzzle two;
        // c4b5 is its maintained legal-wrong fixture move (also used by the full
        // public-UI sprint failure journey). Submit that move through the real
        // board to retain coordinate-mapping evidence on every display profile.
        await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(10000);
        await playBoardMove('session-board', 'c4b5');
        await waitFor(element(by.id('move-feedback-overlay'))).toExist().withTimeout(10000);
        await waitFor(element(by.label('Mistakes 2 of 3')).atIndex(0)).toExist().withTimeout(10000);
        await waitFor(element(by.id('session-progress'))).toHaveText('0 / 15').withTimeout(10000);
      });
    }

    if (needsPortraitRestore && device.getPlatform() !== 'android') {
      // Leave the emulator in its natural orientation before the shell applies
      // the next profile's portrait-shaped size override.
      await setAdaptiveOrientation('portrait');
    }
  });
});

async function waitForAndroidPublicMoves(moves) {
  const state = await waitForAndroidUiState({
    presentResourceIds: moves.map((move) => `session-accessible-move-${move}`),
  });
  return Object.fromEntries(moves.map((move) => [
    move,
    state.nodes[`session-accessible-move-${move}`],
  ]));
}

async function captureHome(orientation) {
  const homeFrame = await frameFor(element(by.id('adaptive-layout')));
  expectOrientationFrame(homeFrame, orientation);
  await device.takeScreenshot(`${deviceLabel}-${orientation}-home`);
}

async function captureSprint(orientation, { waitForPieces = false } = {}) {
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
      captureScreenshot: (label) => device.takeScreenshot(label),
      screenFrame,
      screenshotLabel,
    });
    return;
  }

  const screenshotPath = await device.takeScreenshot(screenshotLabel);
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

async function waitForSettledSprintLayout(orientation) {
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
            `${deviceLabel} ${orientation} settling session board`
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
  await waitFor(element(by.id('practice-action-header'))).toBeVisible().withTimeout(10000);
  await waitFor(element(by.id('practice-mode-standard'))).toBeVisible().withTimeout(10000);
  await waitFor(element(by.id('practice-progress-summary'))).toBeVisible().withTimeout(10000);

  if (expectReviewStripVisible) {
    await waitFor(element(by.id('practice-review-strip'))).toBeVisible().withTimeout(10000);
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
