const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const {
  launchWithDisabledSynchronization,
  openTab,
  playBoardMove,
  sleep,
  startPracticeMode,
  textFromAttributes,
  waitForVisibleInPracticeScroll
} = require('./helpers');

const describeStoreAssets = process.env.CHESSTICIZE_CAPTURE_STORE_ASSETS === '1' ? describe : describe.skip;
const puzzlePackPath = resolve(__dirname, '../../../fixtures/puzzles/bundled-core-pack.sqlite');
const sprintNowMs = Date.parse('2026-07-08T18:00:00.000Z');
const reviewNowMs = Date.parse('2026-07-09T18:00:00.000Z');

describeStoreAssets('App Store screenshot capture', () => {
  it('captures a coherent active-player story across all store scenes', async () => {
    await launchStoreAssetApp(sprintNowMs, true);
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

async function launchStoreAssetApp(nowMs, deleteData) {
  await launchWithDisabledSynchronization({
    newInstance: true,
    delete: deleteData,
    launchArgs: {
      chessticizeStoreAssetCapture: '1',
      chessticizeTestNowMs: String(nowMs)
    }
  });
}

async function setStoreAssetRatings({ standard, arrowDuel }) {
  await openTab('practice-tab', 'practice-run-management');
  await element(by.id('practice-run-home-edit')).tap();

  for (const [ratingKey, targetRating] of [
    ['standard', standard],
    ['arrow-duel', arrowDuel]
  ]) {
    const stepCount = (targetRating - 600) / 25;
    if (!Number.isInteger(stepCount) || stepCount < 0) {
      throw new Error(`Store-asset rating ${targetRating} must be at least 600 and use 25-point steps`);
    }
    await waitForVisibleInPracticeScroll(`practice-run-edit-${ratingKey}`);
    await element(by.id(`practice-run-edit-${ratingKey}`)).tap();
    for (let index = 0; index < stepCount; index += 1) {
      await element(by.id('practice-run-elo-increase')).tap();
    }
    await waitFor(element(by.id('practice-run-elo-value')))
      .toHaveText(`ELO ${targetRating}`)
      .withTimeout(10000);
    await element(by.id('practice-main-scroll')).scrollTo('top');
    await element(by.id('practice-run-save')).tap();
  }
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await element(by.id('practice-run-home-done')).tap();
}

async function failArrowDuelSprint() {
  await openTab('practice-tab', 'practice-run-arrow-duel');
  await startPracticeMode('arrow-duel');
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
  await sleep(500);
  await device.takeScreenshot('app-store-08-review-session');
  await playBoardMove('review-board', fixture.wrongMove, fixture.flipped);
  await waitFor(element(by.id('review-reminder-permission-prompt'))).toExist().withTimeout(10000);
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
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await waitFor(element(by.id('practice-review-due-count'))).toBeVisible().withTimeout(10000);
  const ratingText = textFromAttributes(await element(by.id('practice-mode-arrow-duel-rating')).getAttributes());
  if (ratingText === 'ELO 600') {
    throw new Error('Expected the Practice screenshot to show a populated Arrow Duel rating');
  }
  await sleep(1200);
  await device.takeScreenshot('app-store-01-practice-tab');

  await element(by.id('practice-add-run')).tap();
  await waitFor(element(by.id('practice-run-editor'))).toExist().withTimeout(10000);
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await waitFor(element(by.id('custom-mode-regular'))).toBeVisible().withTimeout(10000);
  await waitFor(element(by.id('custom-theme-row'))).toExist().withTimeout(10000);
  await expect(element(by.text('Theme'))).not.toExist();
  await sleep(1200);
  await device.takeScreenshot('app-store-07-custom-setup');
  await element(by.id('practice-run-editor-close')).tap();
  await waitFor(element(by.id('practice-run-arrow-duel'))).toBeVisible().withTimeout(10000);

  await openTab('review-tab', 'review-start-due');
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await waitFor(element(by.id('review-due-count'))).toHaveText('1 / 3').withTimeout(10000);
  await waitFor(element(by.id('review-today-history'))).toExist().withTimeout(10000);
  await sleep(1200);
  await device.takeScreenshot('app-store-02-review-tab');

  await openTab('history-tab', 'history-action-header');
  await waitFor(element(by.text('1-3 of 3'))).toExist().withTimeout(10000);
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await sleep(1200);
  await device.takeScreenshot('app-store-03-history-tab');

  await openTab('settings-tab', 'settings-app-version');
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await sleep(1200);
  await device.takeScreenshot('app-store-04-settings-tab');
}

async function captureSprintScenes() {
  await openTab('practice-tab', 'practice-run-standard');
  await startPracticeMode('standard');
  await waitForVisibleInPracticeScroll('session-board');
  await sleep(500);
  await device.takeScreenshot('app-store-05-standard-sprint');

  await element(by.id('session-abandon')).tap();
  await waitFor(element(by.id('session-abandon-confirmation'))).toBeVisible().withTimeout(5000);
  await element(by.id('session-abandon-confirm')).tap();
  await waitFor(element(by.text('Sprint failed'))).toBeVisible().withTimeout(10000);
  await element(by.id('back-practice-button')).tap();
  await waitFor(element(by.id('practice-tab'))).toBeVisible().withTimeout(10000);

  await startPracticeMode('arrow-duel');
  await waitForVisibleInPracticeScroll('session-board');
  await waitFor(element(by.id('arrow-duel-candidate-overlay'))).toExist().withTimeout(10000);
  await sleep(500);
  await device.takeScreenshot('app-store-06-arrow-duel');
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
