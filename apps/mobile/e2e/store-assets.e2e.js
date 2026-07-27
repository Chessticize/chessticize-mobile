const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const {
  accessibilityLabelFromAttributes,
  frameFor,
  launchWithDisabledSynchronization,
  openTab,
  playBoardMove,
  sleep,
  startPracticeMode,
  textFromAttributes,
  waitForVisibleInPracticeScroll
} = require('./helpers');
const { expectFrameContained } = require('./screenshotAssertions');

const describeStoreAssets = process.env.CHESSTICIZE_CAPTURE_STORE_ASSETS === '1' ? describe : describe.skip;
const captureOrientation = process.env.CHESSTICIZE_STORE_ASSET_ORIENTATION ?? 'portrait';
if (!['portrait', 'landscape'].includes(captureOrientation)) {
  throw new Error(
    `CHESSTICIZE_STORE_ASSET_ORIENTATION must be portrait or landscape, received ${captureOrientation}`
  );
}
const capturePortraitAssets = captureOrientation === 'portrait';
const captureLandscapeAssets = captureOrientation === 'landscape';
const puzzlePackPath = resolve(__dirname, '../../../fixtures/puzzles/bundled-core-pack.sqlite');
const sprintNowMs = Date.parse('2026-07-08T18:00:00.000Z');
const reviewNowMs = Date.parse('2026-07-09T18:00:00.000Z');

describeStoreAssets('App Store screenshot capture', () => {
  it('captures a coherent active-player story across all store scenes', async () => {
    await launchStoreAssetApp(sprintNowMs, true);
    await captureFirstUseSprintRulesGuide();
    await setStoreAssetRatings({ standard: 800, arrowDuel: 850 });
    await failArrowDuelSprint();

    await element(by.id('back-practice-button')).tap();
    await waitFor(element(by.id('practice-tab'))).toBeVisible().withTimeout(10000);
    await device.terminateApp();
    await launchStoreAssetApp(reviewNowMs, false);

    await completeOneWrongReview();
    await captureMainTabScenes();
    await captureSprintScenes();
  });
});

async function captureFirstUseSprintRulesGuide() {
  await waitFor(element(by.id('practice-sprint-rules-guide'))).toExist().withTimeout(180000);
  await takePortraitScreenshotAtTop('app-store-09-sprint-rules-guide');
  await takeLandscapeScreenshot('app-store-09-sprint-rules-guide');
  await element(by.id('practice-sprint-rules-dismiss')).tap();
  await waitFor(element(by.id('practice-run-home-edit'))).toBeVisible().withTimeout(10000);
}

async function launchStoreAssetApp(nowMs, deleteData) {
  await launchWithDisabledSynchronization({
    newInstance: true,
    delete: deleteData,
    launchArgs: {
      chessticizeStoreAssetCapture: '1',
      chessticizeTestNowMs: String(nowMs)
    }
  });
  await waitForScreenOrientation(captureOrientation);
}

async function setStoreAssetRatings({ standard, arrowDuel }) {
  await openTab('practice-tab', 'practice-run-home-edit');
  await element(by.id('practice-run-home-edit')).tap();

  for (const [ratingKey, targetRating] of [
    ['standard', standard],
    ['arrow-duel', arrowDuel]
  ]) {
    if (!Number.isInteger(targetRating) || targetRating < 600 || targetRating > 2200) {
      throw new Error(`Store-asset rating ${targetRating} must be a whole number from 600 to 2200`);
    }
    await waitForVisibleInPracticeScroll(`practice-run-edit-${ratingKey}`);
    await element(by.id(`practice-run-edit-${ratingKey}`)).tap();
    await waitFor(element(by.id('practice-run-name-input'))).toBeVisible().withTimeout(10000);
    await element(by.id('practice-run-elo-input')).replaceText(String(targetRating));
    await waitFor(element(by.id('practice-run-elo-input')))
      .toHaveText(String(targetRating))
      .withTimeout(10000);
    await waitForVisibleInPracticeScroll('practice-run-save');
    await element(by.id('practice-run-save')).tap();
  }
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await element(by.id('practice-run-home-done')).tap();
}

async function failArrowDuelSprint() {
  await openTab('practice-tab', 'practice-run-arrow-duel');
  await waitForVisibleInPracticeScroll('practice-run-arrow-duel');
  await element(by.id('practice-run-select-arrow-duel')).tap();
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await waitFor(element(by.id('practice-run-start'))).toBeVisible().withTimeout(10000);
  await element(by.id('practice-run-start')).tap();

  for (const scene of [
    'app-store-10-active-session-guide-header',
    'app-store-11-active-session-guide-slow',
    'app-store-12-active-session-guide-timeout',
    'app-store-13-active-session-guide-unclear'
  ]) {
    await waitFor(element(by.id('practice-active-session-guide'))).toExist().withTimeout(10000);
    await takePortraitScreenshotAtTop(scene);
    await takeLandscapeScreenshot(scene);
    await element(by.id('practice-session-guide-start')).tap();
  }

  await waitFor(element(by.id('practice-arrow-duel-guide'))).toExist().withTimeout(10000);
  await takePortraitScreenshotAtTop('app-store-14-arrow-duel-guide');
  await takeLandscapeScreenshot('app-store-14-arrow-duel-guide');
  await element(by.id('practice-session-guide-start')).tap();
  await waitForVisibleInPracticeScroll('session-board');

  for (let mistakeCount = 1; mistakeCount <= 3; mistakeCount += 1) {
    const fixture = await resolveDisplayedArrowDuelFixture(
      'arrow-duel-candidate-overlay',
      'session-current-puzzle-id'
    );
    await playBoardMove('session-board', fixture.wrongMove, fixture.flipped);

    if (mistakeCount < 3) {
      await waitFor(element(by.label(`Mistakes ${mistakeCount} of 3`)).atIndex(0))
        .toExist()
        .withTimeout(10000);
      await sleep(1800);
    }
  }

  await waitFor(element(by.text('Sprint failed'))).toBeVisible().withTimeout(30000);
  await waitFor(element(by.id('sprint-result-mistakes'))).toHaveText('3').withTimeout(10000);
  await takePortraitScreenshotAtTop('app-store-15-sprint-result');
  await takeLandscapeScreenshot('app-store-15-sprint-result');
}

async function completeOneWrongReview() {
  await openTab('review-tab', 'review-start-due');
  await waitFor(element(by.id('review-due-count'))).toHaveText('0 / 3').withTimeout(10000);
  await element(by.id('review-start-due')).tap();
  await waitFor(element(by.id('review-session'))).toExist().withTimeout(10000);
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await waitForVisibleInPracticeScroll('review-board');

  const fixture = await resolveDisplayedArrowDuelFixture(
    'review-arrow-duel-candidate-overlay',
    'review-current-puzzle-id'
  );
  await takePortraitScreenshotAtTop('app-store-08-review-session');
  await takeLandscapeScreenshot(
    'app-store-08-review-session',
    assertReviewLandscapeLayout
  );
  await playBoardMove('review-board', fixture.wrongMove, fixture.flipped);
  await waitFor(element(by.id('review-reminder-permission-prompt'))).toExist().withTimeout(10000);
  await waitForVisibleInPracticeScroll('review-reminder-permission-dismiss');
  await element(by.id('review-reminder-permission-dismiss')).tap();
  await waitFor(element(by.id('review-progress'))).toHaveText('2 / 3 · Arrow Duel').withTimeout(10000);
  await expect(element(by.id('review-line-continue'))).not.toExist();
  await element(by.id('review-exit')).tap();

  await waitFor(element(by.id('review-due-count'))).toHaveText('1 / 3').withTimeout(10000);
  await waitFor(element(by.id('review-today-history'))).toExist().withTimeout(10000);
}

async function captureMainTabScenes() {
  await openTab('practice-tab', 'practice-run-arrow-duel');
  await element(by.id('practice-run-select-arrow-duel')).tap();
  await waitForVisibleInPracticeScroll('practice-review-due-count');
  const ratingText = textFromAttributes(await element(by.id('practice-mode-arrow-duel-rating')).getAttributes());
  if (ratingText === '600') {
    throw new Error('Expected the Practice screenshot to show a populated Arrow Duel rating');
  }
  await takePortraitScreenshotAtTop('app-store-01-practice-tab');
  await takeLandscapeScreenshot('app-store-01-practice-tab');

  if (captureLandscapeAssets) {
    return;
  }

  await waitForVisibleInPracticeScroll('practice-add-run');
  await element(by.id('practice-add-run')).tap();
  await waitFor(element(by.id('practice-run-editor'))).toExist().withTimeout(10000);
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await waitFor(element(by.id('custom-mode-regular'))).toBeVisible().withTimeout(10000);
  await waitFor(element(by.id('practice-run-theme-row'))).toExist().withTimeout(10000);
  await expect(element(by.text('Themes'))).toExist();
  await takePortraitScreenshotAtTop('app-store-07-custom-setup');
  await element(by.id('practice-run-editor-close')).tap();
  await waitFor(element(by.id('practice-run-arrow-duel'))).toBeVisible().withTimeout(10000);

  await openTab('review-tab', 'review-start-due');
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await waitFor(element(by.id('review-due-count'))).toHaveText('1 / 3').withTimeout(10000);
  await waitFor(element(by.id('review-today-history'))).toExist().withTimeout(10000);
  await takePortraitScreenshotAtTop('app-store-02-review-tab');

  await openTab('history-tab', 'history-filter-toggle');
  await waitFor(element(by.id('history-page-next'))).toExist().withTimeout(10000);
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await takePortraitScreenshotAtTop('app-store-03-history-tab');

  await openTab('settings-tab', 'settings-app-version');
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await takePortraitScreenshotAtTop('app-store-04-settings-tab');
}

async function captureSprintScenes() {
  await openTab('practice-tab', 'practice-run-standard');
  await startPracticeMode('standard');
  await waitForVisibleInPracticeScroll('session-board');
  await takePortraitScreenshotAtTop('app-store-05-standard-sprint');
  await takeLandscapeScreenshot('app-store-05-standard-sprint');

  await element(by.id('session-abandon')).tap();
  await waitFor(element(by.id('session-abandon-confirmation'))).toBeVisible().withTimeout(5000);
  await element(by.id('session-abandon-confirm')).tap();
  await waitFor(element(by.text('Sprint failed'))).toBeVisible().withTimeout(10000);
  await element(by.id('back-practice-button')).tap();
  await waitFor(element(by.id('practice-tab'))).toBeVisible().withTimeout(10000);

  await startPracticeMode('arrow-duel');
  await waitForVisibleInPracticeScroll('session-board');
  await waitFor(element(by.id('arrow-duel-candidate-overlay'))).toExist().withTimeout(10000);
  await takePortraitScreenshotAtTop('app-store-06-arrow-duel');
  await takeLandscapeScreenshot('app-store-06-arrow-duel');
}

async function takePortraitScreenshotAtTop(name) {
  if (!capturePortraitAssets) {
    return;
  }

  await element(by.id('practice-main-scroll')).scrollTo('top');
  await takePortraitScreenshot(name);
}

async function takePortraitScreenshot(name) {
  if (!capturePortraitAssets) {
    return;
  }

  await waitForScreenOrientation('portrait');
  await sleep(500);
  await device.takeScreenshot(name);
}

async function takeLandscapeScreenshot(name, assertLayout) {
  if (!captureLandscapeAssets) {
    return;
  }

  await element(by.id('practice-main-scroll')).scrollTo('top');
  await waitForScreenOrientation('landscape');
  await assertLayout?.();
  await sleep(500);
  await device.takeScreenshot(`${name}-landscape`);
}

async function waitForScreenOrientation(orientation) {
  const expectedLayoutClassSuffix = orientation === 'landscape' ? 'Landscape' : 'Portrait';
  let lastFrame = null;
  let lastFrameError = null;
  let lastLayoutLabel = '';
  let previousExpectedFrame = null;
  let stableFrameCount = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const adaptiveLayoutElement = element(by.id('adaptive-layout'));
      lastFrame = await frameFor(adaptiveLayoutElement);
      lastLayoutLabel = accessibilityLabelFromAttributes(
        await adaptiveLayoutElement.getAttributes()
      );
      lastFrameError = null;
      const hasExpectedOrientation = orientation === 'landscape'
        ? lastFrame.width > lastFrame.height
        : lastFrame.height > lastFrame.width;
      // After the host Simulator rotates, UIKit can publish the new root
      // bounds before React Native has recomputed its adaptive layout class.
      // A portrait PNG taken during that gap can contain a stale landscape
      // board and rail, so require both public signals to agree.
      const hasExpectedLayoutClass = lastLayoutLabel.endsWith(expectedLayoutClassSuffix);
      const matchesPreviousFrame = previousExpectedFrame !== null
        && ['x', 'y', 'width', 'height'].every(
          (key) => Math.abs(lastFrame[key] - previousExpectedFrame[key]) <= 1
        );
      const hasExpectedLayout = hasExpectedOrientation && hasExpectedLayoutClass;
      stableFrameCount = hasExpectedLayout
        ? matchesPreviousFrame
          ? stableFrameCount + 1
          : 1
        : 0;
      previousExpectedFrame = hasExpectedLayout ? lastFrame : null;
      if (stableFrameCount >= 3) {
        return;
      }
    } catch (error) {
      lastFrameError = error;
      previousExpectedFrame = null;
      stableFrameCount = 0;
    }
    await sleep(250);
  }
  throw new Error(
    `Timed out waiting for ${orientation} store-asset layout; `
    + `last observed frame=${JSON.stringify(lastFrame)}; `
    + `last observed layout label=${JSON.stringify(lastLayoutLabel)}; `
    + `last frame error=${lastFrameError === null ? 'none' : errorMessage(lastFrameError)}`
  );
}

function errorMessage(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function assertReviewLandscapeLayout() {
  const screenFrame = await frameFor(element(by.id('adaptive-layout')));
  const layoutFrame = await frameFor(element(by.id('review-session-adaptive-layout')));
  const boardLaneFrame = await frameFor(element(by.id('review-session-board-lane')));
  const boardFrame = await frameFor(element(by.id('review-board')));
  const coordinateFrame = await frameFor(element(by.id('board-coordinate-overlay')));
  const candidateArrowFrame = await frameFor(
    element(by.id('review-arrow-duel-candidate-overlay'))
  );
  const controlRailFrame = await frameFor(element(by.id('review-session-control-rail')));
  const headerFrame = await frameFor(element(by.id('review-header')));
  const exitFrame = await frameFor(element(by.id('review-exit')));
  const progressFrame = await frameFor(element(by.id('review-progress')));
  const timerFrame = await frameFor(element(by.id('review-timer')));
  const promptFrame = await frameFor(element(by.id('practice-prompt')));

  expectFrameContained(layoutFrame, screenFrame, 'Review landscape layout');
  expectFrameContained(boardLaneFrame, layoutFrame, 'Review landscape board lane');
  expectFrameContained(boardFrame, boardLaneFrame, 'Review landscape board');
  expectFrameContained(coordinateFrame, boardFrame, 'Review landscape coordinates');
  expectFrameContained(candidateArrowFrame, boardFrame, 'Review landscape candidate arrows');
  expectFrameContained(controlRailFrame, layoutFrame, 'Review landscape control rail');
  expectFrameContained(headerFrame, controlRailFrame, 'Review landscape header');
  expectFrameContained(exitFrame, controlRailFrame, 'Review landscape exit action');
  expectFrameContained(progressFrame, controlRailFrame, 'Review landscape progress');
  expectFrameContained(timerFrame, controlRailFrame, 'Review landscape timer');
  expectFrameContained(promptFrame, controlRailFrame, 'Review landscape instruction');

  if (Math.abs(boardFrame.width - boardFrame.height) > 1) {
    throw new Error(`Review landscape board must stay square: ${JSON.stringify(boardFrame)}`);
  }
  const boardRight = boardFrame.x + boardFrame.width;
  if (boardFrame.x >= controlRailFrame.x || boardRight > controlRailFrame.x + 1) {
    throw new Error(
      'Review landscape board must stay left of and separate from the control rail: '
      + `board=${JSON.stringify(boardFrame)}, rail=${JSON.stringify(controlRailFrame)}`
    );
  }
}

async function resolveDisplayedArrowDuelFixture(overlayTestID, puzzleIDTestID) {
  await waitFor(element(by.id(overlayTestID))).toExist().withTimeout(10000);
  const candidateText = textFromAttributes(await element(by.id(overlayTestID)).getAttributes());
  const puzzleID = textFromAttributes(await element(by.id(puzzleIDTestID)).getAttributes());
  const candidates = [...new Set(candidateText.match(/[a-h][1-8][a-h][1-8][qrbn]?/g) ?? [])];
  if (candidates.length !== 2 || candidates.some((move) => !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))) {
    throw new Error(`Expected two safe UCI candidates in ${overlayTestID}, received ${candidateText}`);
  }

  const query = [
    'SELECT stockfish_bestmove || char(9) || initial_fen',
    'FROM puzzles',
    `WHERE id = '${puzzleID.replaceAll("'", "''")}';`
  ].join(' ');
  const rows = execFileSync('/usr/bin/sqlite3', [puzzlePackPath, query], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
  if (rows.length !== 1) {
    throw new Error(`Expected bundled puzzle ${puzzleID}, found ${rows.length}`);
  }

  const [correctMove, initialFen] = rows[0].split('\t');
  const wrongMove = candidates.find((candidate) => candidate !== correctMove);
  const sideToMove = initialFen?.trim().split(/\s+/)[1];
  if (!wrongMove || (sideToMove !== 'w' && sideToMove !== 'b')) {
    throw new Error(`Invalid bundled puzzle metadata for candidates ${candidates.join(', ')}`);
  }
  return {
    flipped: sideToMove === 'b',
    wrongMove
  };
}
