/* global by, describe, device, element, it, waitFor */

const {
  elementText,
  frameFor,
  launchWithDisabledSynchronization,
  playBoardMove,
  selectTestPuzzleSource,
  sleep,
  startPracticeMode
} = require('./helpers');
const {
  expectBoardScreenshotContainsPieces,
  expectFrameContained
} = require('./screenshotAssertions');

const describeAdaptiveLayout = process.env.CHESSTICIZE_CAPTURE_ADAPTIVE_LAYOUT === '1'
  || process.env.DETOX_ACTIVE_SUITE === 'android-adaptive-layout'
  ? describe
  : describe.skip;

const deviceLabel = sanitizeScreenshotLabel(process.env.CHESSTICIZE_ADAPTIVE_DEVICE_LABEL || 'simulator');
const includeLandscape = process.env.CHESSTICIZE_ADAPTIVE_INCLUDE_LANDSCAPE === '1';
const expectReviewStripVisible = process.env.CHESSTICIZE_ADAPTIVE_EXPECT_REVIEW_STRIP === '1';
const onlyOrientation = process.env.CHESSTICIZE_ADAPTIVE_ONLY_ORIENTATION;

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
      await device.setOrientation('landscape');
      await waitForOrientation('landscape');
      await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(10000);
      await waitForSettledSprintLayout('landscape');
      const rotatedPuzzleID = await elementText('session-current-puzzle-id');
      if (rotatedPuzzleID !== puzzleID) {
        throw new Error(`Rotation replaced the active puzzle: ${puzzleID} -> ${rotatedPuzzleID}`);
      }
      await captureSprint('landscape');
    }

    if (device.getPlatform() === 'android') {
      await waitFor(element(by.id('session-accessible-moves-open'))).toBeVisible().withTimeout(10000);
      await element(by.id('session-accessible-moves-open')).tap();
      await waitFor(element(by.id('session-accessible-moves-dialog'))).toExist().withTimeout(10000);
      // Familiar 15's first Standard puzzle is a versioned product fixture:
      // c2b3 is legal but wrong, while alternate mate c2b1 is accepted. Confirm
      // the public accessibility surface exposes that fixture before touching
      // the physical board, rather than reading a hidden domain answer.
      await waitForAccessibleMove('c2b1');
      await element(by.id('session-accessible-moves-close')).tap();
      await waitFor(element(by.id('session-accessible-moves-dialog'))).not.toExist().withTimeout(10000);
      await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(10000);
      await playBoardMove('session-board', 'c2b3');
      await waitFor(element(by.id('move-feedback-overlay'))).toExist().withTimeout(10000);
      await waitFor(element(by.label('Mistakes 1 of 3')).atIndex(0)).toExist().withTimeout(10000);
      await waitFor(element(by.id('move-feedback-overlay'))).not.toExist().withTimeout(10000);

      await waitFor(element(by.id('session-accessible-moves-open'))).toBeVisible().withTimeout(10000);
      await element(by.id('session-accessible-moves-open')).tap();
      await waitFor(element(by.id('session-accessible-moves-dialog'))).toExist().withTimeout(10000);
      // A terminal wrong result advances the sprint to Familiar 15 puzzle two;
      // c4b5 is its maintained legal-wrong fixture move (also used by the full
      // public-UI sprint failure journey).
      await waitForAccessibleMove('c4b5');
      await element(by.id('session-accessible-move-c4b5')).tap();
      await waitFor(element(by.id('session-accessible-moves-dialog'))).not.toExist().withTimeout(10000);
      await waitFor(element(by.id('move-feedback-overlay'))).toExist().withTimeout(10000);
      await waitFor(element(by.label('Mistakes 2 of 3')).atIndex(0)).toExist().withTimeout(10000);
      await waitFor(element(by.id('session-progress'))).toHaveText('0 / 15').withTimeout(10000);
    }

    if (includeLandscape || initialOrientation === 'landscape') {
      // Leave the emulator in its natural orientation before the shell applies
      // the next profile's portrait-shaped size override.
      await device.setOrientation('portrait');
      await waitForOrientation('portrait');
    }
  });
});

async function waitForAccessibleMove(move) {
  const moveAction = element(by.id(`session-accessible-move-${move}`));
  await waitFor(moveAction).toExist().withTimeout(10000);
  await waitFor(moveAction)
    .toBeVisible()
    .whileElement(by.id('session-accessible-moves-list'))
    .scroll(100, 'down');
}

async function captureHome(orientation) {
  const homeFrame = await frameFor(element(by.id('adaptive-layout')));
  expectOrientationFrame(homeFrame, orientation);
  await device.takeScreenshot(`${deviceLabel}-${orientation}-home`);
}

async function captureSprint(orientation) {
  const screenFrame = await frameFor(element(by.id('adaptive-layout')));
  const layoutFrame = await frameForIfPresent('active-session-adaptive-layout') ?? screenFrame;
  const boardFrame = await frameFor(element(by.id('session-board')));
  expectOrientationFrame(screenFrame, orientation);
  expectFrameContained(boardFrame, layoutFrame, `${deviceLabel} ${orientation} session board`);

  const screenshotPath = await device.takeScreenshot(`${deviceLabel}-${orientation}-standard-sprint`);
  expectBoardScreenshotContainsPieces(screenshotPath, boardFrame, screenFrame);
}

async function launchForOrientation(orientation) {
  await launchWithDisabledSynchronization({
    newInstance: true,
    delete: true
  });
  await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
  await device.setOrientation(orientation);
  await waitForOrientation(orientation);
  await element(by.id('practice-main-scroll')).scrollTo('top');
}

async function waitForOrientation(orientation) {
  let lastFrame = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      lastFrame = await frameFor(element(by.id('adaptive-layout')));
      if (frameHasOrientation(lastFrame, orientation)) {
        return;
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

function sanitizeScreenshotLabel(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
