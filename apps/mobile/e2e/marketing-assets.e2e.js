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
  topLevelTab,
  waitForVisibleInPracticeScroll,
} = require('./helpers');
const {
  expectFrameContained,
  expectScreenshotHasDarkChrome,
  waitForBoardScreenshotContainsPieces,
} = require('./screenshotAssertions');
const { tapAndroidUiNode, waitForAndroidUiState } = require('./androidPublicUiEvidence');
const {
  captureMarketingScreenshot,
  resolveIosLandscapeValidationTarget,
  resolveMarketingCaptureTarget,
  sourceCommitForCapture,
  writeDeviceCaptureManifest,
} = require('./marketingCaptureArtifacts');
const {
  resolveGooglePlayArtifactIdentity,
  resolveGooglePlayCaptureTarget,
  writeGooglePlayDeviceCaptureManifest,
} = require('./googlePlayMarketingCaptureArtifacts');
const { resolveMarketingCampaign } = require('./marketingCampaign');

const marketingStory = require('../../../config/app-store-marketing-story-v1.json');
const story = resolveMarketingCampaign(
  marketingStory,
  process.env.CHESSTICIZE_MARKETING_CAMPAIGN
);
const ROOT_CLIPPED_SCROLL_CONTAINERS = new Set([
  'practice-run-editor',
  'settings-about-section',
]);
const CAMPAIGN_SCROLL_SURFACES = new Set([
  'practice-home',
  'tactical-profile-screen',
  'focused-run-preview',
  'personal-best-hub',
]);
const CAMPAIGN_CAPTURE_CONTROLS = {
  'practice-home': ['practice-run-start', 'training-focus-card'],
  'dark-arrow-duel': ['session-board', 'session-progress', 'arrow-duel-reply-challenge'],
  'tactical-profile': [
    'tactical-profile-active-mode',
    'tactical-profile-recommendations',
  ],
  'focused-run': [
    'focused-run-rating-anchor',
    'focused-run-allocation-bar',
    'tactical-profile-early-estimate',
  ],
  survival: ['personal-best-type-selector', 'personal-best-hub-start'],
  review: ['review-due-card', 'review-start-due', 'review-forecast'],
};
const TACTICAL_PROFILE_EARLY_ESTIMATE_DISCLOSURE = [
  'This is an early estimate based on ordinary mixed puzzle-solving Runs.',
  'It may change as the model is validated with more players.',
  'Review and focused Runs do not shape discovery.',
].join(' ');
const capturePlatform =
  process.env.CHESSTICIZE_MARKETING_PLATFORM ?? 'app-store';
const isGooglePlayCapture = capturePlatform === 'google-play';
const captureMarketingAssets =
  process.env.CHESSTICIZE_CAPTURE_MARKETING_ASSETS === '1';
const verifyIosLandscapeLayout =
  process.env.CHESSTICIZE_VERIFY_IOS_LANDSCAPE_LAYOUT === '1';
if (captureMarketingAssets && verifyIosLandscapeLayout) {
  throw new Error(
    'Marketing capture and iOS landscape layout validation must run separately.'
  );
}
const describeMarketingAssets =
  captureMarketingAssets || verifyIosLandscapeLayout
    ? describe
    : describe.skip;
const repositoryRoot = resolve(__dirname, '../../..');
const outputRoot = resolve(
  process.env.CHESSTICIZE_MARKETING_OUTPUT_ROOT
    ?? resolve(repositoryRoot, 'scratch/store-assets/marketing/raw')
);
const sourceCommit = sourceCommitForCapture(repositoryRoot);
let target;
if (verifyIosLandscapeLayout) {
  target = resolveIosLandscapeValidationTarget(process.env);
} else if (isGooglePlayCapture) {
  target = resolveGooglePlayCaptureTarget(process.env);
} else {
  target = resolveMarketingCaptureTarget(process.env, story);
}
const androidArtifact = isGooglePlayCapture
  ? resolveGooglePlayArtifactIdentity({
      environment: process.env,
      repositoryRoot,
      sourceCommit,
    })
  : undefined;

describeMarketingAssets('deterministic store marketing journey', () => {
  it('validates the approved six-frame story from deterministic product state', async () => {
    if (verifyIosLandscapeLayout && isGooglePlayCapture) {
      throw new Error('iOS landscape layout validation requires the App Store journey.');
    }
    const expectedPlatform = isGooglePlayCapture ? 'android' : 'ios';
    if (device.getPlatform() !== expectedPlatform) {
      if (isGooglePlayCapture) {
        throw new Error(
          'Google Play deterministic marketing capture requires an Android '
          + 'Detox build.'
        );
      }
      throw new Error('App Store marketing capture requires an iOS Simulator.');
    }
    const records = [];
    for (const frame of story.frames.slice().sort((left, right) => left.order - right.order)) {
      await launchMarketingFrame(frame);
      await prepareFrame(frame);
      await assertFrameContract(frame);
      await assertNativeResponsiveLayout(frame);
      await assertCompositionViewport(frame);
      await assertRequiredFrameGeometry(frame);
      if (verifyIosLandscapeLayout) {
        continue;
      }
      const screenshotPath = await takeReadyScreenshot(frame);
      if (frame.appearance === 'dark') {
        // Survival's reachable Start position intentionally scrolls the
        // full-screen hub: its three upper surface samples remain dark while the
        // lower samples contain the blue action. Arrow Duel retains all four.
        expectScreenshotHasDarkChrome(
          screenshotPath,
          frame.id === 'survival' ? 3 : 4
        );
      }
      records.push(captureMarketingScreenshot({
        frame,
        outputRoot,
        screenshotPath,
        sourceCommit,
        story,
        target,
      }));
    }
    if (verifyIosLandscapeLayout) {
      return;
    }
    if (isGooglePlayCapture) {
      writeGooglePlayDeviceCaptureManifest({
        artifact: androidArtifact,
        outputRoot,
        records,
        sourceCommit,
        story,
        target,
      });
    } else {
      writeDeviceCaptureManifest({
        outputRoot,
        records,
        sourceCommit,
        story,
        target,
      });
    }
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
  if (!verifyIosLandscapeLayout) {
    await setMarketingOrientationBeforeNavigation();
  }
  if (device.getPlatform() === 'android' && story.campaign
    && ['practice-home', 'review'].includes(frame.id)) {
    // The fictional player has existing history when 1.6 first opens. Finish
    // the real update notes before querying the underlying Espresso root;
    // that root correctly has no window focus while the native sheet is up.
    const { nodes } = await waitForAndroidUiState({
      presentResourceIds: ['whats-new-continue'],
    }, { timeoutMs: 180000 });
    tapAndroidUiNode(nodes['whats-new-continue']);
    await waitForAndroidUiState({ absentResourceIds: ['whats-new-continue'] });
  }
  await waitFor(element(by.id('adaptive-layout'))).toExist().withTimeout(180000);
  await waitForStableOrientation(target.orientation);
}

async function prepareFrame(frame) {
  switch (frame.id) {
    case 'practice-home':
      // These campaign roots are scroll surfaces. Detox's visibility matcher
      // requires coverage of the whole native view, which a deliberately
      // scrollable screen cannot provide. Existence establishes readiness;
      // assertRequiredFrameGeometry then proves the meaningful controls and
      // disclosures are fully inside the capture viewport.
      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(30000);
      // Keep both approved Home controls wholly above the native tab bar. On
      // the calibrated iPhone viewport, 53–74 points is the feasible interval:
      // 64 clears the bar while preserving Start below the app safe-area top.
      if (target.deviceFamily === 'iphone') {
        await element(by.id('practice-main-scroll')).scroll(64, 'down', 0.5, 0.5);
      }
      return;
    case 'dark-arrow-duel':
      await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(30000);
      await waitFor(element(by.id('arrow-duel-reply-challenge')))
        .toBeVisible()
        .withTimeout(10000);
      return;
    case 'tactical-profile':
      await waitFor(element(by.id('tactical-profile-screen'))).toExist().withTimeout(30000);
      return;
    case 'focused-run':
      await waitFor(element(by.id('focused-run-preview'))).toExist().withTimeout(30000);
      return;
    case 'survival':
      await waitFor(element(by.id('personal-best-hub'))).toExist().withTimeout(30000);
      // Clear Start and the trailing title glyph together on the calibrated
      // iPhone viewport; the type selector and full disclosure remain visible.
      if (target.deviceFamily === 'iphone') {
        await element(by.id('practice-main-scroll')).scroll(136, 'down', 0.5, 0.5);
      }
      return;
    case 'review':
      await openTab('review-tab', 'review-due-card');
      await element(by.id('practice-main-scroll')).scrollTo('top');
      return;
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
      await openTab('settings-tab', 'settings-license');
      await waitForVisibleInPracticeScroll('settings-puzzle-data-license');
      // Frame 6 starts at License by contract. Normalize the final crop after
      // finding Puzzle Data so the adjacent App Version row is above the
      // visible scroll viewport on each calibrated capture profile.
      await element(by.id('practice-main-scroll')).scroll(
        isGooglePlayCapture && target.deviceFamily === 'android-phone' ? 220
          : isWideTabletTarget() ? 550 : 420,
        'down',
        0.5,
        0.5
      );
      await waitFor(element(by.id('settings-license')))
        .toBeVisible()
        .whileElement(by.id('practice-main-scroll'))
        .scroll(100, 'up', 0.5, 0.5);
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
  await expect(element(by.id('practice-run-theme-selection-detail')))
    .toHaveText('All themes');
  await expect(element(by.id('custom-theme-fork'))).not.toBeVisible();
  await element(by.id('practice-run-theme-disclosure')).tap();
  await waitForVisibleInPracticeScroll('custom-theme-fork');
  await element(by.id('custom-theme-fork')).tap();
  await waitForVisibleInPracticeScroll('custom-theme-pin');
  await element(by.id('custom-theme-pin')).tap();
  await element(by.id('practice-main-scroll')).scrollTo('bottom');
  await waitFor(element(by.id('practice-run-duration-stepper')))
    .toExist()
    .withTimeout(10000);
  const expectedPace = story.frames.find((frame) => frame.id === 'focus-your-practice')
    .source.stableText.pace;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await expect(element(by.text(expectedPace))).toExist();
      break;
    } catch {
      await waitForVisibleInPracticeScroll('practice-run-per-puzzle-stepper-increase');
      await element(by.id('practice-run-per-puzzle-stepper-increase')).tap();
      await sleep(250);
    }
  }
  await waitFor(element(by.text(expectedPace))).toExist().withTimeout(10000);
  await waitForVisibleInPracticeScroll('practice-run-elo-input');
  await element(by.id('practice-run-elo-input')).replaceText(
    String(story.fictionalUser.customRun.startingRating)
  );
  await element(by.id('practice-run-elo-input')).tapReturnKey();
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await waitFor(element(by.id('practice-run-editor-title')))
    .toBeVisible()
    .withTimeout(5000);
  await element(by.id('practice-run-editor-title')).tap();
  await sleep(500);
  await element(by.id('practice-main-scroll')).scrollTo('top');
  if (isGooglePlayCapture && target.deviceFamily === 'android-phone') {
    await element(by.id('practice-main-scroll')).scroll(80, 'down', 0.5, 0.5);
  }
}

async function assertCompositionViewport(frame) {
  if (frame.id === 'tactical-profile') {
    await waitFor(element(by.id('tactical-profile-recommendations')))
      .toExist()
      .withTimeout(10000);
    await waitFor(element(by.text(TACTICAL_PROFILE_EARLY_ESTIMATE_DISCLOSURE)))
      .toExist()
      .withTimeout(10000);
    return;
  }
  if (frame.id === 'focused-run') {
    await waitFor(element(by.id('focused-run-rating-anchor')))
      .toBeVisible()
      .withTimeout(10000);
    await waitFor(element(by.id('focused-run-allocation-bar')))
      .toBeVisible()
      .withTimeout(10000);
    await waitFor(element(by.id('tactical-profile-early-estimate')))
      .toBeVisible()
      .withTimeout(10000);
    return;
  }
  if (frame.id === 'focus-your-practice') {
    for (const testID of [
      'practice-run-name-input',
      'custom-theme-fork',
      'custom-theme-pin',
      'practice-run-elo-input',
    ]) {
      await waitFor(element(by.id(testID))).toBeVisible().withTimeout(10000);
    }
    for (const value of [
      frame.source.stableText.mode,
      frame.source.stableText.duration,
      frame.source.stableText.pace,
    ]) {
      await waitFor(element(by.text(value))).toBeVisible().withTimeout(10000);
    }
    await waitFor(element(by.text(frame.source.stableText['pass-rule'])))
      .toBeVisible()
      .withTimeout(10000);
    return;
  }
  if (frame.id === 'private-offline-open-source') {
    for (const testID of [
      frame.source.crop.startTestId,
      'settings-source',
      'settings-stockfish-source',
      frame.source.crop.endTestId,
    ]) {
      await waitFor(element(by.id(testID))).toBeVisible().withTimeout(10000);
    }
    if (!verifyIosLandscapeLayout) {
      for (const testID of frame.source.crop.excludeTestIds) {
        await expect(element(by.id(testID))).not.toBeVisible();
      }
    }
  }
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
  for (const testID of frame.requiredVisibleTestIds ?? frame.source?.requiredVisibleTestIds ?? []) {
    await waitFor(element(by.id(testID))).toExist().withTimeout(10000);
  }
  await assertStableText(frame);
  await assertForbiddenState(frame);
}

async function assertStableText(frame) {
  if (frame.id === 'practice-home' || frame.id === 'survival' || frame.id === 'review') {
    return;
  }
  if (frame.id === 'dark-arrow-duel') {
    await waitFor(element(by.id('session-progress'))).toBeVisible().withTimeout(10000);
    return;
  }
  if (frame.id === 'tactical-profile' || frame.id === 'focused-run') {
    return;
  }
  const stable = frame.source.stableText;
  switch (frame.id) {
    case 'build-tactical-intuition':
    case 'choose-the-best-move':
      await expectText('session-progress', stable['session-progress']);
      await expectText('session-timer', stable['session-timer']);
      await expectText(
        'session-puzzle-timing-label',
        stable['session-puzzle-timing']
      );
      await expectAttributeContains('session-mistakes', 'Mistakes 0 of');
      return;
    case 'focus-your-practice':
      await expectText('practice-run-name-input', stable['practice-run-name-input']);
      await expectChecked('custom-theme-fork');
      await expectChecked('custom-theme-pin');
      await expectText('practice-run-elo-input', stable.rating);
      await expect(element(by.text(stable.mode))).toExist();
      await expect(element(by.text(stable.duration))).toExist();
      await expect(element(by.text(stable.pace))).toExist();
      await expectAttributeContains('practice-run-pass-rules', stable['pass-rule']);
      return;
    case 'make-every-mistake-count':
      await expectText('review-due-count', stable['review-due-count']);
      await expect(element(by.text(stable['review-start-due']))).toExist();
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
    if (
      (frame.requiredVisibleTestIds ?? frame.source?.requiredVisibleTestIds ?? []).includes(testID)
      || frame.captureAnchorTestId === testID
    ) {
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
  if (frame.id === 'review') {
    await expect(element(by.text('Overdue now'))).not.toExist();
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
  if (frame.id === 'practice-home') {
    const practiceTab = topLevelTab('practice-tab');
    await waitFor(practiceTab).toExist().withTimeout(10000);
    const tabFrame = await frameFor(practiceTab);
    assertPositiveFrame(tabFrame, `${frame.id} native Practice tab`);
  }
  if (isWideTabletTarget()) {
    const isActiveSessionFrame = (
      frame.id === 'build-tactical-intuition'
      || frame.id === 'choose-the-best-move'
      || frame.id === 'dark-arrow-duel'
    );
    if (isActiveSessionFrame) {
      const layoutFrame = await frameFor(element(by.id('active-session-adaptive-layout')));
      const boardLaneFrame = await frameFor(element(by.id('active-session-board-lane')));
      const boardFrame = await frameFor(element(by.id('session-board')));
      const railFrame = await frameFor(element(by.id('active-session-control-rail')));
      expectFrameContained(
        layoutFrame,
        screenFrame,
        `${frame.id} ${target.deviceFamily} layout`
      );
      expectFrameContained(
        boardLaneFrame,
        layoutFrame,
        `${frame.id} ${target.deviceFamily} board lane`
      );
      expectFrameContained(
        boardFrame,
        boardLaneFrame,
        `${frame.id} ${target.deviceFamily} board`
      );
      expectFrameContained(
        railFrame,
        layoutFrame,
        `${frame.id} ${target.deviceFamily} control rail`
      );
      if (boardFrame.x + boardFrame.width > railFrame.x + 1) {
        throw new Error(
          `Marketing ${target.deviceFamily} ${frame.id} board must stay left `
          + 'of its control rail.'
        );
      }
    } else if (device.getPlatform() === 'android') {
      await expect(element(by.id('navigation-rail'))).toExist();
    } else {
      // iPad: the native top tab bar (#612).
      await expect(topLevelTab('practice-tab')).toExist();
    }
  }
}

function isWideTabletTarget() {
  return (
    target.deviceFamily === 'ipad'
    || target.deviceFamily === 'android-tablet-10'
  );
}

async function assertRequiredFrameGeometry(frame) {
  const screenFrame = await frameFor(element(by.id('adaptive-layout')));
  assertPositiveFrame(screenFrame, `${frame.id} app root`);
  const requiredTestIDs = frame.requiredVisibleTestIds ?? frame.source?.requiredVisibleTestIds ?? [];
  const captureControlTestIDs = [
    ...new Set([
      ...(story.campaign ? CAMPAIGN_CAPTURE_CONTROLS[frame.id] ?? [] : []),
      ...requiredTestIDs.filter((testID) => !CAMPAIGN_SCROLL_SURFACES.has(testID)),
    ])
  ];
  const requiredFrames = [];
  for (const testID of requiredTestIDs) {
    const requiredElement = element(by.id(testID));
    await waitFor(requiredElement).toExist().withTimeout(10000);
    const requiredFrame = await frameFor(requiredElement);
    assertPositiveFrame(requiredFrame, `${frame.id} ${testID}`);
    if (ROOT_CLIPPED_SCROLL_CONTAINERS.has(testID) || CAMPAIGN_SCROLL_SURFACES.has(testID)) {
      // Owner-approved iPad underlap lets the scroll surface extend behind the
      // native tab bar. Its capture controls are checked separately below.
      assertFramesIntersect(requiredFrame, screenFrame, `${frame.id} ${testID}`);
    } else {
      expectFrameContained(requiredFrame, screenFrame, `${frame.id} ${testID}`);
    }
    requiredFrames.push({testID, frame: requiredFrame});
  }

  for (const testID of captureControlTestIDs) {
    const control = element(by.id(testID));
    // Some native grouped Section wrappers report incomplete Detox coverage
    // even when their measured bounds are wholly in the screenshot viewport.
    // Existence plus the containment proof below checks the actual capture
    // condition without accepting a partially off-screen control.
    await waitFor(control).toExist().withTimeout(10000);
    const controlFrame = await frameFor(control);
    assertPositiveFrame(controlFrame, `${frame.id} ${testID}`);
    expectFrameContained(controlFrame, screenFrame, `${frame.id} ${testID}`);
    if (!requiredFrames.some((required) => required.testID === testID)) {
      requiredFrames.push({testID, frame: controlFrame});
    }
  }

  if (frame.id === 'tactical-profile') {
    const disclosure = element(by.text(TACTICAL_PROFILE_EARLY_ESTIMATE_DISCLOSURE));
    await waitFor(disclosure).toExist().withTimeout(10000);
    const disclosureFrame = await frameFor(disclosure);
    assertPositiveFrame(disclosureFrame, `${frame.id} early-estimate disclosure`);
    expectFrameContained(
      disclosureFrame,
      screenFrame,
      `${frame.id} early-estimate disclosure`
    );
    requiredFrames.push({
      testID: 'tactical-profile-early-estimate-disclosure',
      frame: disclosureFrame,
    });
  }

  if (
    frame.id === 'practice-home'
    && device.getPlatform() === 'ios'
    && !isWideTabletTarget()
  ) {
    const tabFrame = await frameFor(topLevelTab('practice-tab'));
    assertPositiveFrame(tabFrame, `${frame.id} native tab bar item`);
    for (const required of requiredFrames) {
      if (captureControlTestIDs.includes(required.testID)
        && required.frame.y + required.frame.height > tabFrame.y + 1) {
        throw new Error(
          `${frame.id} ${required.testID} is obscured by the native tab bar: `
          + `control=${JSON.stringify(required.frame)}, tab=${JSON.stringify(tabFrame)}`
        );
      }
    }
  }

  if (!isWideTabletTarget() || [
    'build-tactical-intuition',
    'choose-the-best-move',
    'dark-arrow-duel',
  ].includes(frame.id)) {
    return;
  }

  if (device.getPlatform() !== 'android') {
    // Owner requested the iPad scroll viewport underlap the floating native
    // tab bar. The viewport must reach the window top, while this capture's
    // actionable controls remain clear of the bar and fully in-frame above.
    const tabFrame = await frameFor(topLevelTab('practice-tab'));
    assertPositiveFrame(tabFrame, `${frame.id} top tab bar item`);
    const tabBarBottom = tabFrame.y + tabFrame.height;
    const contentFrame = await frameFor(element(by.id('practice-main-scroll')));
    if (contentFrame.y > screenFrame.y + 1) {
      throw new Error(
        `${frame.id} content viewport must reach the window top for native-tab underlap: `
        + `content=${JSON.stringify(contentFrame)}, app=${JSON.stringify(screenFrame)}`
      );
    }
    for (const required of requiredFrames) {
      if (captureControlTestIDs.includes(required.testID) && required.frame.y < tabBarBottom - 1) {
        throw new Error(
          `${frame.id} ${required.testID} is obscured by the native top tab bar: `
          + `control=${JSON.stringify(required.frame)}, tab=${JSON.stringify(tabFrame)}`
        );
      }
    }
    return;
  }
  const navigationFrame = await frameFor(element(by.id('navigation-rail')));
  assertPositiveFrame(navigationFrame, `${frame.id} navigation rail`);
  const navigationRight = navigationFrame.x + navigationFrame.width;
  for (const required of requiredFrames) {
    if (captureControlTestIDs.includes(required.testID) && required.frame.x < navigationRight - 1) {
      throw new Error(
        `${frame.id} ${required.testID} overlaps the navigation rail: `
        + `content=${JSON.stringify(required.frame)}, navigation=${JSON.stringify(navigationFrame)}`
      );
    }
  }
}

function assertPositiveFrame(frame, label) {
  if (
    frame === null
    || typeof frame !== 'object'
    || !['x', 'y', 'width', 'height'].every(
      (key) => Number.isFinite(frame[key])
    )
    || frame.width <= 0
    || frame.height <= 0
  ) {
    throw new Error(`${label} has invalid native geometry: ${JSON.stringify(frame)}`);
  }
}

function assertFramesIntersect(childFrame, parentFrame, label) {
  const overlapWidth = Math.min(
    childFrame.x + childFrame.width,
    parentFrame.x + parentFrame.width
  ) - Math.max(childFrame.x, parentFrame.x);
  const overlapHeight = Math.min(
    childFrame.y + childFrame.height,
    parentFrame.y + parentFrame.height
  ) - Math.max(childFrame.y, parentFrame.y);
  if (overlapWidth <= 0 || overlapHeight <= 0) {
    throw new Error(
      `${label} frame does not intersect its scroll viewport: `
      + `child=${JSON.stringify(childFrame)}, parent=${JSON.stringify(parentFrame)}`
    );
  }
}

async function takeReadyScreenshot(frame) {
  await sleep(500);
  if (
    frame.id !== 'build-tactical-intuition'
    && frame.id !== 'choose-the-best-move'
    && frame.id !== 'dark-arrow-duel'
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

async function expectChecked(testID) {
  if (device.getPlatform() === 'android') {
    await waitForAndroidUiState({
      presentResourceIds: [testID],
      expectedAttributesByResourceId: {
        [testID]: { checked: 'true' },
      },
    });
    return;
  }
  const rawAttributes = await element(by.id(testID)).getAttributes();
  const attributes = Array.isArray(rawAttributes)
    ? rawAttributes[0]
    : rawAttributes;
  if (
    attributes?.value !== '1'
    && attributes?.value !== true
    && attributes?.value !== 'checked'
    && attributes?.value !== 'checkbox, checked'
  ) {
    throw new Error(
      `${testID} must be checked; received ${JSON.stringify(rawAttributes)}`
    );
  }
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
