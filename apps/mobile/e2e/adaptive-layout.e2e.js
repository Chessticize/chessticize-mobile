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
    await sleep(1000);

    const puzzleID = await elementText('session-current-puzzle-id');
    await captureSprint(initialOrientation);

    if (includeLandscape && initialOrientation === 'portrait') {
      await device.setOrientation('landscape');
      await sleep(1200);
      await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(10000);
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
      await element(by.id('session-accessible-moves-close')).tap();
      await playBoardMove('session-board', 'e2e6');
      await waitFor(element(by.id('move-feedback-overlay'))).toExist().withTimeout(10000);
    }
  });
});

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
  await sleep(1200);
  await element(by.id('practice-main-scroll')).scrollTo('top');
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
  if (orientation === 'landscape' && frame.width <= frame.height) {
    throw new Error(`Expected landscape frame, got ${JSON.stringify(frame)}`);
  }
  if (orientation === 'portrait' && frame.height <= frame.width) {
    throw new Error(`Expected portrait frame, got ${JSON.stringify(frame)}`);
  }
}
