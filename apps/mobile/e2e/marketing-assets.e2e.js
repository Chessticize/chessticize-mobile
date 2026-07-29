/* global by, describe, device, element, expect, it, waitFor */

const { resolve } = require('node:path');
const {
  accessibilityLabelFromAttributes,
  dismissRunNameKeyboard,
  frameFor,
  launchWithDisabledSynchronization,
  openTab,
  sleep,
  textFromAttributes,
  waitForVisibleInPracticeScroll,
} = require('./helpers');
const {
  expectFrameContained,
  waitForBoardScreenshotContainsPieces,
} = require('./screenshotAssertions');
const {
  captureMarketingScreenshot,
  resolveMarketingCaptureTarget,
  sourceCommitForCapture,
  writeDeviceCaptureManifest,
} = require('./marketingCaptureArtifacts');

const story = require('../../../config/app-store-marketing-story-v1.json');
const describeMarketingAssets =
  process.env.CHESSTICIZE_CAPTURE_MARKETING_ASSETS === '1'
    ? describe
    : describe.skip;
const repositoryRoot = resolve(__dirname, '../../..');
const outputRoot = resolve(
  process.env.CHESSTICIZE_MARKETING_OUTPUT_ROOT
    ?? resolve(repositoryRoot, 'scratch/store-assets/marketing/raw')
);
const target = resolveMarketingCaptureTarget(process.env, story);
const sourceCommit = sourceCommitForCapture(repositoryRoot);

describeMarketingAssets('App Store marketing screenshot capture', () => {
  it('captures the approved six-frame story from deterministic product state', async () => {
    if (device.getPlatform() !== 'ios') {
      throw new Error('App Store marketing capture requires an iOS Simulator.');
    }
    const records = [];
    for (const frame of story.frames.slice().sort((left, right) => left.order - right.order)) {
      await setMarketingOrientationBeforeNavigation();
      await launchMarketingFrame(frame);
      await prepareFrame(frame);
      await assertFrameContract(frame);
      await assertNativeResponsiveLayout(frame);
      const screenshotPath = await takeReadyScreenshot(frame);
      records.push(captureMarketingScreenshot({
        frame,
        outputRoot,
        screenshotPath,
        sourceCommit,
        story,
        target,
      }));
    }
    writeDeviceCaptureManifest({
      outputRoot,
      records,
      sourceCommit,
      story,
      target,
    });
  });
});

async function launchMarketingFrame(frame) {
  await launchWithDisabledSynchronization({
    newInstance: true,
    delete: true,
    launchArgs: {
      chessticizeMarketingCaptureFrame: frame.id,
      chessticizeTestNowMs: String(Date.parse(story.captureClock.instant)),
    },
  });
  await waitFor(element(by.id('adaptive-layout'))).toExist().withTimeout(180000);
  await waitForStableOrientation(target.orientation);
}

async function prepareFrame(frame) {
  switch (frame.id) {
    case 'build-tactical-intuition':
      await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(30000);
      return;
    case 'choose-the-best-move':
      await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(30000);
      await waitFor(element(by.id('arrow-duel-candidate-overlay')))
        .toExist()
        .withTimeout(10000);
      return;
    case 'focus-your-practice':
      await prepareCustomRun();
      return;
    case 'make-every-mistake-count':
      await openTab('review-tab', 'review-due-card');
      await element(by.id('practice-main-scroll')).scrollTo('top');
      return;
    case 'see-your-progress':
      await prepareRatingTrend();
      return;
    case 'private-offline-open-source':
      await openTab('settings-tab', 'settings-about-section');
      await waitForVisibleInPracticeScroll('settings-license');
      return;
    default:
      throw new Error(`Unhandled marketing frame ${frame.id}`);
  }
}

async function prepareCustomRun() {
  await openTab('practice-tab', 'practice-add-run');
  await element(by.id('practice-add-run')).tap();
  await waitFor(element(by.id('practice-run-editor'))).toExist().withTimeout(10000);
  await element(by.id('practice-run-name-input')).replaceText(
    story.fictionalUser.customRun.name
  );
  await dismissRunNameKeyboard();
  await waitForVisibleInPracticeScroll('custom-theme-fork');
  await element(by.id('custom-theme-fork')).tap();
  await waitForVisibleInPracticeScroll('custom-theme-pin');
  await element(by.id('custom-theme-pin')).tap();
  await waitForVisibleInPracticeScroll('practice-run-duration-300');
  await element(by.id('practice-run-duration-300')).tap();
  await waitForVisibleInPracticeScroll('practice-run-per-puzzle-30');
  await element(by.id('practice-run-per-puzzle-30')).tap();
  await waitForVisibleInPracticeScroll('practice-run-elo-input');
  await element(by.id('practice-run-elo-input')).replaceText(
    String(story.fictionalUser.customRun.startingRating)
  );
  await dismissRunNameKeyboard();
  await waitForVisibleInPracticeScroll('practice-run-pass-rules');
}

async function prepareRatingTrend() {
  await openTab('history-tab', 'history-filter-toggle');
  await element(by.id('history-attention-all')).tap();
  await element(by.id('history-filter-toggle')).tap();
  await waitForVisibleInPracticeScroll('history-rating-standard 5/20');
  await element(by.id('history-rating-standard 5/20')).tap();
  await waitForVisibleInPracticeScroll('history-range-90d');
  await element(by.id('history-range-90d')).tap();
  await waitForVisibleInPracticeScroll('history-filter-toggle');
  await element(by.id('history-filter-toggle')).tap();
  await element(by.id('practice-main-scroll')).scrollTo('top');
}

async function assertFrameContract(frame) {
  for (const testID of frame.source.requiredVisibleTestIds) {
    await waitFor(element(by.id(testID))).toExist().withTimeout(10000);
  }
  await assertStableText(frame);
  await assertForbiddenState(frame);
}

async function assertStableText(frame) {
  const stable = frame.source.stableText;
  switch (frame.id) {
    case 'build-tactical-intuition':
    case 'choose-the-best-move':
      await expectText('session-progress', stable['session-progress']);
      await expectText('session-timer', stable['session-timer']);
      await expectText('session-puzzle-timing', stable['session-puzzle-timing']);
      await expectText('session-mistakes', '0');
      return;
    case 'focus-your-practice':
      await expectText('practice-run-name-input', stable['practice-run-name-input']);
      await expectSelected('custom-theme-fork');
      await expectSelected('custom-theme-pin');
      await expectText('practice-run-elo-input', stable.rating);
      await expectAttributeContains('practice-run-pass-rules', stable['pass-rule']);
      return;
    case 'make-every-mistake-count':
      await expectText('review-due-count', stable['review-due-count']);
      await expectText('review-start-due', stable['review-start-due']);
      await expectText('review-tomorrow-count', stable['review-tomorrow-count']);
      await expectText(
        'review-next-seven-days-count',
        stable['review-next-seven-days-count']
      );
      await expectText('review-total-count', stable['review-total-count']);
      return;
    case 'see-your-progress':
      await expect(element(by.text(stable.title))).toExist();
      await expectText('history-performance-context', stable['history-performance-context']);
      await expectText('history-chart-value', stable['history-chart-value']);
      await expectText('history-chart-label', stable['history-chart-label']);
      await expectText(
        'history-attempt-marketing-standard-attempt-03-result',
        stable['latest-attempt-result']
      );
      await expectText(
        'history-attempt-marketing-standard-attempt-03-identity',
        stable['latest-attempt-identity']
      );
      await expectText(
        'history-attempt-marketing-standard-attempt-03-pace',
        stable['latest-attempt-pace']
      );
      await expectText(
        'history-attempt-marketing-standard-attempt-03-meta',
        stable['latest-attempt-meta']
      );
      return;
    case 'private-offline-open-source':
      await expectAttributeContains('settings-license', stable['settings-license']);
      await expectAttributeContains('settings-source', stable['settings-source']);
      await expectAttributeContains(
        'settings-stockfish-source',
        stable['settings-stockfish-source']
      );
      return;
    default:
      throw new Error(`Unhandled stable text for ${frame.id}`);
  }
}

async function assertForbiddenState(frame) {
  const forbiddenTestIDs = new Set([
    'practice-run-availability-error',
    'practice-run-name-error',
    'review-dev-controls',
    'review-reminder-permission-prompt',
    'history-empty-state',
    'tactical-profile-screen',
    'practice-sprint-rules-guide',
    'practice-active-session-guide',
    'practice-arrow-duel-guide',
    'session-abandon-confirmation',
    'sprint-loading-overlay',
    'settings-stockfish-diagnostics',
  ]);
  for (const testID of forbiddenTestIDs) {
    if (frame.source.requiredVisibleTestIds.includes(testID)) {
      continue;
    }
    await expect(element(by.id(testID))).not.toExist();
  }
  if (frame.id === 'choose-the-best-move') {
    const candidateText = textFromAttributes(
      await element(by.id('arrow-duel-candidate-overlay')).getAttributes()
    );
    const candidates = [
      ...new Set(candidateText.match(/[a-h][1-8][a-h][1-8][qrbn]?/g) ?? []),
    ];
    if (candidates.length !== story.fictionalUser.activeSnapshots.arrowDuel.candidateCount) {
      throw new Error(`Expected two neutral Arrow Duel candidates, received ${candidateText}`);
    }
  }
  if (frame.id === 'make-every-mistake-count') {
    const dueCard = element(by.id('review-due-card'));
    const dueCardText = [
      textFromAttributes(await dueCard.getAttributes()),
      accessibilityLabelFromAttributes(await dueCard.getAttributes()),
    ].join(' ');
    if (/\boverdue\b/i.test(dueCardText)) {
      throw new Error(`Review marketing frame must not show overdue work: ${dueCardText}`);
    }
  }
  if (frame.id === 'private-offline-open-source') {
    await expect(element(by.id('settings-app-version'))).not.toBeVisible();
  }
}

async function assertNativeResponsiveLayout(frame) {
  const screenFrame = await frameFor(element(by.id('adaptive-layout')));
  const isLandscape = screenFrame.width > screenFrame.height;
  if (isLandscape !== (target.orientation === 'landscape')) {
    throw new Error(
      `Marketing ${target.deviceFamily} frame ${frame.id} is not rendered in `
      + `${target.orientation}: ${JSON.stringify(screenFrame)}`
    );
  }
  if (target.deviceFamily === 'ipad') {
    await expect(element(by.id('navigation-rail'))).toExist();
    if (
      frame.id === 'build-tactical-intuition'
      || frame.id === 'choose-the-best-move'
    ) {
      const layoutFrame = await frameFor(element(by.id('active-session-adaptive-layout')));
      const boardLaneFrame = await frameFor(element(by.id('active-session-board-lane')));
      const boardFrame = await frameFor(element(by.id('session-board')));
      const railFrame = await frameFor(element(by.id('active-session-control-rail')));
      expectFrameContained(layoutFrame, screenFrame, `${frame.id} iPad layout`);
      expectFrameContained(boardLaneFrame, layoutFrame, `${frame.id} iPad board lane`);
      expectFrameContained(boardFrame, boardLaneFrame, `${frame.id} iPad board`);
      expectFrameContained(railFrame, layoutFrame, `${frame.id} iPad control rail`);
      if (boardFrame.x + boardFrame.width > railFrame.x + 1) {
        throw new Error(
          `Marketing iPad ${frame.id} board must stay left of its control rail.`
        );
      }
    }
  }
}

async function takeReadyScreenshot(frame) {
  await sleep(500);
  if (
    frame.id !== 'build-tactical-intuition'
    && frame.id !== 'choose-the-best-move'
  ) {
    return device.takeScreenshot(frame.captureId);
  }
  const boardFrame = await frameFor(element(by.id('session-board')));
  const screenFrame = await frameFor(element(by.id('adaptive-layout')));
  return waitForBoardScreenshotContainsPieces({
    boardFrame,
    captureScreenshot: (label) => device.takeScreenshot(label),
    screenFrame,
    screenshotLabel: frame.captureId,
  }, {
    timeoutMs: 10000,
  });
}

async function setMarketingOrientationBeforeNavigation() {
  await device.setOrientation(target.orientation);
  await sleep(500);
}

async function waitForStableOrientation(orientation) {
  const expectedSuffix = orientation === 'landscape' ? 'Landscape' : 'Portrait';
  let stableCount = 0;
  let previousFrame = null;
  let lastObserved = null;
  let lastLabel = '';
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const adaptive = element(by.id('adaptive-layout'));
    lastObserved = await frameFor(adaptive);
    lastLabel = accessibilityLabelFromAttributes(await adaptive.getAttributes());
    const correctShape = orientation === 'landscape'
      ? lastObserved.width > lastObserved.height
      : lastObserved.height > lastObserved.width;
    const correctClass = lastLabel.endsWith(expectedSuffix);
    const stableFrame = previousFrame !== null
      && ['x', 'y', 'width', 'height'].every(
        (key) => Math.abs(lastObserved[key] - previousFrame[key]) <= 1
      );
    stableCount = correctShape && correctClass
      ? stableFrame ? stableCount + 1 : 1
      : 0;
    previousFrame = correctShape && correctClass ? lastObserved : null;
    if (stableCount >= 3) {
      return;
    }
    await sleep(250);
  }
  throw new Error(
    `Timed out waiting for ${orientation} marketing layout; `
    + `frame=${JSON.stringify(lastObserved)}; label=${JSON.stringify(lastLabel)}`
  );
}

async function expectText(testID, expected) {
  await waitFor(element(by.id(testID))).toHaveText(expected).withTimeout(10000);
}

async function expectSelected(testID) {
  await waitFor(element(by.id(testID).and(by.traits(['selected']))))
    .toExist()
    .withTimeout(10000);
}

async function expectAttributeContains(testID, expected) {
  const attributes = await element(by.id(testID)).getAttributes();
  const text = [
    textFromAttributes(attributes),
    accessibilityLabelFromAttributes(attributes),
  ].join(' ');
  if (!text.includes(expected)) {
    throw new Error(`${testID} must contain ${JSON.stringify(expected)}; received ${text}`);
  }
}
