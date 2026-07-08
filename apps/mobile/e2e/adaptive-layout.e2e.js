/* global by, describe, device, element, it, waitFor */

const {
  frameFor,
  launchWithDisabledSynchronization,
  selectTestPuzzleSource,
  sleep,
  startPracticeMode
} = require('./helpers');
const {
  expectBoardScreenshotContainsPieces,
  expectFrameContained
} = require('./screenshotAssertions');

const describeAdaptiveLayout = process.env.CHESSTICIZE_CAPTURE_ADAPTIVE_LAYOUT === '1'
  ? describe
  : describe.skip;

const deviceLabel = sanitizeScreenshotLabel(process.env.CHESSTICIZE_ADAPTIVE_DEVICE_LABEL || 'simulator');
const includeLandscape = process.env.CHESSTICIZE_ADAPTIVE_INCLUDE_LANDSCAPE === '1';
const expectReviewStripVisible = process.env.CHESSTICIZE_ADAPTIVE_EXPECT_REVIEW_STRIP === '1';
const onlyOrientation = process.env.CHESSTICIZE_ADAPTIVE_ONLY_ORIENTATION;

describeAdaptiveLayout('Adaptive layout screenshot capture', () => {
  it('captures portrait home and standard sprint', async () => {
    if (!shouldCaptureOrientation('portrait')) {
      return;
    }

    await captureHomeAndSprint('portrait');
  });

  it('captures landscape home and standard sprint', async () => {
    if (!includeLandscape || !shouldCaptureOrientation('landscape')) {
      return;
    }

    await captureHomeAndSprint('landscape');
  });
});

async function captureHomeAndSprint(orientation) {
  await launchForOrientation(orientation);
  await waitForHomeTopFrame();
  const homeFrame = await frameFor(element(by.id('adaptive-layout')));
  expectOrientationFrame(homeFrame, orientation);
  await device.takeScreenshot(`${deviceLabel}-${orientation}-home`);

  await selectTestPuzzleSource('familiar15');
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await sleep(300);
  await startPracticeMode('standard');
  await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(30000);
  await sleep(1000);

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

function shouldCaptureOrientation(orientation) {
  return !onlyOrientation || onlyOrientation === orientation;
}

function expectOrientationFrame(frame, orientation) {
  if (orientation === 'landscape' && frame.width <= frame.height) {
    throw new Error(`Expected landscape frame, got ${JSON.stringify(frame)}`);
  }
  if (orientation === 'portrait' && frame.height <= frame.width) {
    throw new Error(`Expected portrait frame, got ${JSON.stringify(frame)}`);
  }
}
