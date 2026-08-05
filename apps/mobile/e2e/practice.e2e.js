const fs = require('fs');
const zlib = require('zlib');
const {
  dismissRunNameKeyboard,
  dragAndroidElementToElement,
  elementText,
  sleep,
  frameFor,
  historyAttemptRowTestIDForResult,
  launchWithDisabledSynchronization,
  openTab,
  openStandardHistoryTrend,
  playBoardMove,
  setAndroidDisplayOrientation,
  startPracticeMode,
  tapUntilExists,
  textFromAttributes,
  selectTestPuzzleSource,
  waitForVisibleInPracticeScroll,
  waitForElementAccessibilityLabelContaining,
  waitForElementTextContaining,
  waitForRunningStockfishDepth,
  failStandardSprint
} = require('./helpers');
const {
  expectFrameContained,
  waitForBoardScreenshotContainsPieces,
} = require('./screenshotAssertions');
const {
  FIRST_STANDARD_FEEDBACK_MOVES,
} = require('./familiar15Fixture');

// Keep this seed stable to reduce fixture churn. The test reads and validates
// the actual runtime candidates before checking that both neutral arrows paint.
const PRACTICE_RENDER_PUZZLE_SELECTION_SEED = 'practice-arrow-render-v4:23';

describe('Practice POC', () => {
  beforeEach(async () => {
    // These smoke tests use explicit waitFor checks and screenshot assertions.
    // React Native, Skia, and native engine startup can keep Detox synchronization
    // busy after the first visible frame, so launch args disable synchronization
    // before Detox waits on app readiness.
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: true,
      launchArgs: {
        chessticizePuzzleSelectionSeed: PRACTICE_RENDER_PUZZLE_SELECTION_SEED
      }
    });
    if (process.env.CHESSTICIZE_EXPECT_FULL_HISTORY_BOARD !== '1') {
      await device.setOrientation('portrait');
    }
  });

  it('creates, reorders, edits, archives, restores, and relaunches a saved Run', async () => {
    await waitFor(element(by.id('practice-run-management'))).toExist().withTimeout(180000);
    await waitFor(element(by.id('practice-run-standard'))).toBeVisible().withTimeout(10000);
    await waitFor(element(by.id('practice-run-arrow-duel'))).toExist().withTimeout(10000);

    await element(by.id('practice-main-scroll')).scrollTo('top');
    await waitFor(element(by.id('practice-add-run'))).toBeVisible().withTimeout(10000);
    await tapUntilExists('practice-add-run', 'practice-run-editor', 3);
    await expect(element(by.id('practice-run-theme-selection-detail'))).toHaveText('All themes');
    await expect(element(by.id('custom-theme-mixed'))).not.toExist();
    await element(by.id('practice-run-theme-disclosure')).tap();
    await waitFor(element(by.id('custom-theme-mixed').and(by.traits(['selected']))))
      .toExist()
      .withTimeout(10000);
    await element(by.id('practice-run-name-input')).replaceText('Calculation Lab');
    await dismissRunNameKeyboard();
    await element(by.id('practice-main-scroll')).scrollTo('top');
    await tapUntilExists('practice-run-save', 'practice-run-home-edit', 3);

    await waitFor(element(by.id('practice-run-home-edit'))).toBeVisible().withTimeout(10000);
    await expect(element(by.text('Calculation Lab'))).toExist();
    await element(by.id('practice-run-home-edit')).tap();
    await waitFor(element(by.id('practice-run-home-done'))).toBeVisible().withTimeout(10000);

    const adaptiveFrame = await frameFor(element(by.id('adaptive-layout')));
    if (adaptiveFrame.height < 1000) {
      const standardBeforeScroll = await frameFor(element(by.id('practice-run-standard')));
      await element(by.id('practice-run-standard')).swipe('up', 'fast', 0.1, 0.5, 0.5);
      await sleep(400);
      const standardAfterScroll = await frameFor(element(by.id('practice-run-standard')));
      const arrowAfterScroll = await frameFor(element(by.id('practice-run-arrow-duel')));
      if (standardAfterScroll.y >= standardBeforeScroll.y - 5) {
        throw new Error('Expected a fast non-hold swipe starting on a Run card to scroll Edit Runs');
      }
      if (standardAfterScroll.y >= arrowAfterScroll.y) {
        throw new Error('Expected a fast non-hold Edit Runs scroll gesture to preserve Run order');
      }
    } else {
      await expect(element(by.id('practice-run-standard'))).toBeVisible();
      await expect(element(by.id('practice-run-arrow-duel'))).toBeVisible();
    }
    // Keep the small verified scroll offset so both drag endpoints remain
    // actionable on shorter portrait viewports.
    const standardBefore = await frameFor(element(by.id('practice-run-standard')));
    const arrowBefore = await frameFor(element(by.id('practice-run-arrow-duel')));
    if (standardBefore.y >= arrowBefore.y) {
      throw new Error('Expected Standard to begin before Arrow Duel');
    }
    if (device.getPlatform() === 'android') {
      await dragAndroidElementToElement('practice-run-standard', 'practice-run-arrow-duel');
    } else {
      await element(by.id('practice-run-standard')).longPressAndDrag(
        750,
        0.5,
        0.5,
        element(by.id('practice-run-arrow-duel')),
        0.5,
        0.9,
        'slow',
        200
      );
    }
    await sleep(750);
    const standardAfter = await frameFor(element(by.id('practice-run-standard')));
    const arrowAfter = await frameFor(element(by.id('practice-run-arrow-duel')));
    if (standardAfter.y <= arrowAfter.y) {
      throw new Error('Expected the whole-card drag to live-insert Standard after Arrow Duel');
    }

    await element(by.text('Calculation Lab')).tap();
    await waitFor(element(by.id('practice-run-name-input'))).toHaveText('Calculation Lab').withTimeout(10000);
    await element(by.id('practice-run-name-input')).replaceText('Calculation Focus');
    await dismissRunNameKeyboard();
    await element(by.id('practice-run-elo-input')).replaceText('1000');
    await element(by.id('practice-run-save')).tap();
    await waitFor(element(by.id('practice-run-home-done'))).toBeVisible().withTimeout(10000);

    await element(by.label('Remove Calculation Focus from Home')).tap();
    await waitForVisibleInPracticeScroll('practice-run-remove-confirm');
    await element(by.id('practice-run-remove-confirm')).tap();
    await waitFor(element(by.label('Restore Calculation Focus to Home'))).toExist().withTimeout(10000);
    await element(by.label('Restore Calculation Focus to Home')).tap();
    await expect(element(by.text('Calculation Focus'))).toExist();

    await device.terminateApp();
    await launchWithDisabledSynchronization({ newInstance: true, delete: false });
    await waitFor(
      element(by.label('Select Calculation Focus, rating 1000, All · 5 min · 20s pace'))
    ).toExist().withTimeout(180000);
  });

  it('persists first-use Sprint guidance and replays it after Settings reset', async () => {
    await waitFor(element(by.id('practice-sprint-rules-guide'))).toExist().withTimeout(180000);
    await element(by.id('practice-sprint-rules-dismiss')).tap();
    await waitFor(element(by.id('practice-sprint-rules-open'))).toExist().withTimeout(10000);

    await waitForVisibleInPracticeScroll('practice-run-standard');
    await element(by.id('practice-run-select-standard')).tap();
    await element(by.id('practice-main-scroll')).scrollTo('top');
    await element(by.id('practice-run-start')).tap();

    await waitFor(element(by.id('practice-active-session-guide'))).toExist().withTimeout(10000);
    await expect(element(by.id('session-board'))).not.toExist();
    for (let step = 0; step < 4; step += 1) {
      await element(by.id('practice-session-guide-start')).tap();
    }
    await waitForVisibleInPracticeScroll('session-board');

    await element(by.id('session-abandon')).tap();
    await waitFor(element(by.id('session-abandon-confirmation'))).toBeVisible().withTimeout(5000);
    await element(by.id('session-abandon-confirm')).tap();
    await waitFor(element(by.id('sprint-summary-panel'))).toExist().withTimeout(15000);
    await element(by.id('practice-main-scroll')).scrollTo('top');
    await waitFor(element(by.id('sprint-result-top-bar'))).toBeVisible().withTimeout(10000);
    await waitFor(element(by.text('Sprint failed'))).toBeVisible().withTimeout(10000);
    await element(by.id('back-practice-button')).tap();

    await openTab('settings-tab', 'settings-show-sprint-guide');
    await element(by.id('settings-show-sprint-guide')).tap();
    await waitFor(element(by.id('settings-sprint-guide-ready'))).toExist().withTimeout(10000);

    await device.terminateApp();
    await launchWithDisabledSynchronization({ newInstance: true, delete: false });
    await waitFor(element(by.id('practice-sprint-rules-guide'))).toExist().withTimeout(180000);
  });

  it('opens the real local Tactical Profile and returns to Practice', async () => {
    await waitFor(element(by.id('practice-sprint-rules-guide'))).toExist().withTimeout(180000);
    await element(by.id('practice-sprint-rules-dismiss')).tap();
    await waitForVisibleInPracticeScroll('training-focus-open-profile');
    await element(by.id('training-focus-open-profile')).tap();

    await waitFor(element(by.id('tactical-profile-screen'))).toExist().withTimeout(10000);
    await waitFor(element(by.text('Still collecting evidence'))).toExist().withTimeout(10000);
    await element(by.id('tactical-profile-back')).tap();
    await waitFor(element(by.id('practice-home'))).toExist().withTimeout(10000);
  });

  it('renders the standard sprint board', async () => {
    await startPracticeMode('standard');
    await waitForVisibleInPracticeScroll('session-board');

    const boardFrame = await frameFor(element(by.id('session-board')));
    const screenshotPath = await device.takeScreenshot('standard-board');
    expectBoardScreenshotContainsPieces(screenshotPath, boardFrame);

  });

  it('renders Arrow Duel candidate arrows on the board', async () => {
    await startPracticeMode('arrow-duel');
    await waitForVisibleInPracticeScroll('session-board');
    const candidateText = textFromAttributes(
      await element(by.id('arrow-duel-candidate-overlay')).getAttributes()
    );
    const candidates = [
      ...new Set(candidateText.match(/[a-h][1-8][a-h][1-8][qrbn]?/g) ?? []),
    ];
    if (candidates.length !== 2) {
      throw new Error(`Expected two neutral Arrow Duel candidates, received ${candidateText}`);
    }

    const boardFrame = await frameFor(element(by.id('session-board')));
    const screenshotPath = await device.takeScreenshot('arrow-duel-neutral-arrows');
    expectBoardScreenshotContainsNeutralArrows(screenshotPath, boardFrame);

  });

  it('shows Arrow Duel feedback after a wrong candidate move', async () => {
    await selectTestPuzzleSource('familiar15');
    await startPracticeMode('arrow-duel');
    await waitForVisibleInPracticeScroll('session-board');
    // The fixed Arrow Duel set starts with the synthetic Qg7 mate versus Qf7
    // stalemate regression. Assert the fixture before choosing the worse move.
    await waitForElementTextContaining('arrow-duel-candidate-overlay', 'g6g7', 10000);
    await waitForElementTextContaining('arrow-duel-candidate-overlay', 'g6f7', 10000);

    await playBoardMove('session-board', 'g6f7');

    await waitFor(element(by.label('Mistakes 1 of 3')).atIndex(0)).toExist().withTimeout(10000);
    await waitFor(element(by.id('move-feedback-overlay'))).toExist().withTimeout(10000);
    await waitFor(element(by.id('session-progress'))).toHaveText('0 / 10').withTimeout(10000);
  });

  it('accepts the fixed alternate mate-in-one puzzle', async () => {
    await selectTestPuzzleSource('familiar15');
    await startPracticeMode('standard');
    await waitForVisibleInPracticeScroll('session-board');

    await playBoardMove('session-board', FIRST_STANDARD_FEEDBACK_MOVES.accepted);

    await waitFor(element(by.id('session-progress'))).toHaveText('1 / 15').withTimeout(10000);

  });

  it('keeps the full board stationary through correct and wrong feedback in native iPhone portrait', async () => {
    await assertStationaryBoardFeedback({
      move: FIRST_STANDARD_FEEDBACK_MOVES.accepted,
      orientation: 'portrait',
      outcome: 'correct'
    });

    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: true,
      launchArgs: {
        chessticizePuzzleSelectionSeed: PRACTICE_RENDER_PUZZLE_SELECTION_SEED
      }
    });
    await setPracticeOrientation('portrait');

    await assertStationaryBoardFeedback({
      move: FIRST_STANDARD_FEEDBACK_MOVES.legalWrong,
      orientation: 'portrait',
      outcome: 'wrong'
    });
  });

  it('persists Unclear, places its History actions responsively, and manages Review Schedule there', async () => {
    const expectsRegularLayout = process.env.CHESSTICIZE_EXPECT_FULL_HISTORY_BOARD === '1';
    await selectTestPuzzleSource('familiar15');
    await startPracticeMode('standard');
    await waitForVisibleInPracticeScroll('session-board');

    await playBoardMove('session-board', FIRST_STANDARD_FEEDBACK_MOVES.accepted);
    await waitFor(element(by.id('sprint-unclear-prompt'))).toBeVisible().withTimeout(10000);
    await element(by.id('sprint-unclear-toggle')).tap();
    await waitFor(element(by.text('Marked')))
      .toBeVisible()
      .withTimeout(10000);

    // Let the normal feedback snapshot advance to the next board. The prompt
    // remains bound to the completed attempt rather than the newly shown puzzle.
    await waitForElementTextContaining('sprint-unclear-question', 'previous puzzle', 10000);
    await element(by.id('session-abandon')).tap();
    await waitFor(element(by.id('session-abandon-confirmation'))).toBeVisible().withTimeout(5000);
    await element(by.id('session-abandon-confirm')).tap();
    await waitFor(element(by.text('Sprint failed'))).toBeVisible().withTimeout(10000);

    // Recreate the process so History reads the marker from SQLite rather than
    // relying on transient result-screen presentation from the sprint that
    // created it.
    await device.terminateApp();
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: false
    });
    await openStandardHistoryTrend();
    // Needs Attention starts with both reasons selected. Remove In review so
    // this journey proves the persisted Unclear marker specifically.
    await waitForVisibleInPracticeScroll('history-attention-flag-in-review');
    await element(by.id('history-attention-flag-in-review')).tap();
    await element(by.id('history-filter-toggle')).tap();
    await waitFor(element(by.id('history-advanced-filters'))).not.toExist().withTimeout(10000);
    await waitFor(element(by.text('Correct')).atIndex(0)).toExist().withTimeout(10000);
    const resultRowIdentifier = await historyAttemptRowTestIDForResult('Correct');
    await waitForVisibleInPracticeScroll(resultRowIdentifier);
    await element(by.id(resultRowIdentifier)).tap();
    await waitForVisibleInPracticeScroll('review-schedule-add');
    await waitForVisibleInPracticeScroll('history-attempt-clear-unclear');
    await expect(element(by.id('history-attempt-detail'))).not.toExist();
    await expect(element(by.id('bookmark-glyph'))).not.toExist();

    if (expectsRegularLayout) {
      await waitForElementAccessibilityLabelContaining(
        'adaptive-layout',
        'regularLandscape',
        10000
      );
      await element(by.id('practice-main-scroll')).scrollTo('top');
      await element(by.id('review-session-control-rail')).scrollTo('bottom');
      await waitFor(element(by.id('review-context-actions-rail'))).toExist().withTimeout(10000);
      await expect(element(by.id('review-schedule-control'))).toBeVisible();
      await expect(element(by.id('history-attempt-clear-unclear'))).toBeVisible();
      const screenFrame = await frameFor(element(by.id('safe-area-shell')));
      const boardFrame = await frameFor(element(by.id('review-board')));
      const actionRailFrame = await frameFor(element(by.id('review-context-actions-rail')));
      const fullBoardVisible = frameIsContained(boardFrame, screenFrame);
      expectFrameContained(boardFrame, screenFrame, 'History review landscape board');
      if (actionRailFrame.x < boardFrame.x + boardFrame.width) {
        throw new Error(
          `Expected History actions to the right of the board; board=${JSON.stringify(boardFrame)} `
          + `actions=${JSON.stringify(actionRailFrame)}`
        );
      }
      const responsiveScreenshot = fullBoardVisible
        ? await waitForBoardScreenshotContainsPieces({
          boardFrame,
          captureScreenshot: (label) => device.takeScreenshot(label),
          screenFrame,
          screenshotLabel: 'history-review-actions-ipad-landscape',
        }, {timeoutMs: 15000})
        : await device.takeScreenshot('history-review-actions-ipad-landscape');
      if (!fs.existsSync(responsiveScreenshot)) {
        throw new Error(`Expected responsive History screenshot at ${responsiveScreenshot}`);
      }
    } else {
      await waitForElementAccessibilityLabelContaining(
        'adaptive-layout',
        'compactPortrait',
        10000
      );
      await waitFor(element(by.id('review-context-actions-bottom'))).toExist().withTimeout(10000);
      await expect(element(by.id('review-schedule-control'))).toBeVisible();
      await expect(element(by.id('history-attempt-clear-unclear'))).toBeVisible();
    }
    await waitForVisibleInPracticeScroll('review-schedule-add');

    await element(by.id('review-schedule-add')).tap();
    await waitFor(element(by.id('review-schedule-state'))).toHaveText('Due tomorrow').withTimeout(10000);
    await waitFor(element(by.id('history-attempt-clear-unclear'))).not.toExist().withTimeout(10000);

    await element(by.id('review-schedule-remove')).tap();
    await waitFor(element(by.id('review-schedule-removal-confirmation'))).toBeVisible().withTimeout(10000);
    await sleep(500);
    await element(by.id('review-schedule-removal-confirm')).tap();
    await waitFor(element(by.id('review-schedule-state')))
      .toHaveText('Not scheduled for Review')
      .withTimeout(10000);

    // Enrollment atomically cleared the marker, and removal does not restore it.
    await device.terminateApp();
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: false
    });
    await openStandardHistoryTrend();
    // Isolate Unclear again after relaunch; the empty state proves enrollment
    // cleared that marker and later Review removal did not restore it.
    await waitForVisibleInPracticeScroll('history-attention-flag-in-review');
    await element(by.id('history-attention-flag-in-review')).tap();
    await waitFor(element(by.id('history-empty-state'))).toExist().withTimeout(10000);
  });

  it('opens last sprint mistake review with navigation and analysis arrows', async () => {
    await failStandardSprint();
    await waitFor(element(by.id('review-mistakes-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('review-mistakes-button')).tap();

    await waitFor(element(by.text('1 / 3 · Standard'))).toBeVisible().withTimeout(30000);
    await expect(element(by.id('review-next'))).toBeVisible();
    await element(by.id('review-next')).tap();
    await waitFor(element(by.text('2 / 3 · Standard'))).toBeVisible().withTimeout(30000);
    await element(by.id('review-previous')).tap();
    await waitFor(element(by.text('1 / 3 · Standard'))).toBeVisible().withTimeout(30000);

    await element(by.id('review-analysis-button')).tap();
    await waitFor(element(by.id('review-analysis-back'))).toBeVisible().withTimeout(5000);
    await waitFor(element(by.id('review-analysis-forward'))).toBeVisible().withTimeout(5000);
    await waitFor(element(by.id('review-analysis-reset'))).toBeVisible().withTimeout(5000);
    await waitFor(element(by.id('review-analysis-flip'))).toBeVisible().withTimeout(5000);

    // Preserve the active native engine across an ordinary interruption and
    // confirm that analysis remains usable when the application returns.
    await device.sendToHome();
    await sleep(500);
    await launchWithDisabledSynchronization({
      newInstance: false,
      delete: false
    });
    await waitFor(element(by.id('review-close-analysis'))).toBeVisible().withTimeout(10000);
    await waitForElementTextContaining('review-analysis-engine-status', 'SF 18 NNUE', 45000);
    await waitForElementTextContaining('review-analysis-line-0', 'Top move', 90000);
    await waitForElementTextContaining('review-analysis-line-0', 'Qa4#', 90000);

    // Observe a full-depth search in progress on a different review position,
    // then close it so cancellation is sent while the native engine is active.
    await element(by.id('review-close-analysis')).tap();
    await waitFor(element(by.id('review-analysis-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('review-next')).tap();
    await waitFor(element(by.text('2 / 3 · Standard'))).toBeVisible().withTimeout(30000);
    await element(by.id('review-analysis-button')).tap();
    await waitFor(element(by.id('review-close-analysis'))).toBeVisible().withTimeout(10000);
    await waitForRunningStockfishDepth(
      'review-analysis-engine-status',
      8,
      90000,
      { comparison: 'above' }
    );
    await element(by.id('review-close-analysis')).tap();
    await waitFor(element(by.id('review-analysis-button'))).toBeVisible().withTimeout(10000);

    // Start a third, position-specific analysis. Seeing its own best move proves
    // that output from the cancelled search did not leak into the replacement.
    await element(by.id('review-next')).tap();
    await waitFor(element(by.text('3 / 3 · Standard'))).toBeVisible().withTimeout(30000);
    await element(by.id('review-analysis-button')).tap();
    await waitFor(element(by.id('review-close-analysis'))).toBeVisible().withTimeout(10000);
    await waitForElementTextContaining('review-analysis-engine-status', 'SF 18 NNUE', 45000);
    await waitForElementTextContaining('review-analysis-line-0', 'Kg3', 90000);
    const replacementLine = await elementText('review-analysis-line-0');
    if (replacementLine.includes('Qxe6')) {
      throw new Error(`Cancelled analysis leaked into the replacement position: ${replacementLine}`);
    }

    const screenshotPath = await device.takeScreenshot('review-analysis-arrows');
    expectScreenshotContainsGreenAnalysisArrow(screenshotPath);

    // Kill the process with a real native runner active, relaunch against the
    // saved attempt, and start analysis again through public History UI.
    // This proves a fresh native runner can prewarm after process recreation.
    await device.terminateApp();
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: false
    });
    await openStandardHistoryTrend();
    const resultRowIdentifier = await historyAttemptRowTestIDForResult('Wrong move');
    await waitForVisibleInPracticeScroll(resultRowIdentifier);
    await element(by.id(resultRowIdentifier)).tap();
    await waitFor(element(by.id('review-session'))).toExist().withTimeout(10000);
    await waitForVisibleInPracticeScroll('review-analysis-button');
    await element(by.id('review-analysis-button')).tap();
    await waitFor(element(by.id('review-close-analysis'))).toBeVisible().withTimeout(10000);
    await waitForElementTextContaining('review-analysis-engine-status', 'SF 18 NNUE', 45000);
    await waitForElementTextContaining('review-analysis-line-0', 'Top move', 90000);
  });
});

function expectBoardScreenshotContainsPieces(screenshotPath, boardFrame) {
  const png = readRgbaPng(screenshotPath);
  const boardPixels = pixelFrameForBoard(png, boardFrame);
  let pieceLikePixels = 0;

  for (let y = boardPixels.y; y < boardPixels.y + boardPixels.height; y += 2) {
    for (let x = boardPixels.x; x < boardPixels.x + boardPixels.width; x += 2) {
      const offset = (y * png.width + x) * 4;
      const r = png.data[offset];
      const g = png.data[offset + 1];
      const b = png.data[offset + 2];
      const a = png.data[offset + 3];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      if (a > 128 && (luma < 80 || luma > 245)) {
        pieceLikePixels += 1;
      }
    }
  }

  if (pieceLikePixels <= 1000) {
    throw new Error(`Expected rendered chess pieces, found only ${pieceLikePixels} piece-like pixels`);
  }
}

function frameIsContained(childFrame, parentFrame) {
  const tolerance = 1;
  return childFrame.x >= parentFrame.x - tolerance
    && childFrame.y >= parentFrame.y - tolerance
    && childFrame.x + childFrame.width <= parentFrame.x + parentFrame.width + tolerance
    && childFrame.y + childFrame.height <= parentFrame.y + parentFrame.height + tolerance;
}

async function assertStationaryBoardFeedback({ move, orientation, outcome }) {
  await selectTestPuzzleSource('familiar15');
  await startPracticeMode('standard');
  await waitForVisibleInPracticeScroll('session-board');
  await setPracticeOrientation(orientation);
  await waitForElementAccessibilityLabelContaining(
    'adaptive-layout',
    orientation === 'landscape' ? 'Landscape' : 'Portrait',
    10000
  );
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await waitFor(element(by.id('session-board'))).toBeVisible().withTimeout(10000);
  await sleep(300);

  const screenBefore = await frameFor(element(by.id('safe-area-shell')));
  const boardBefore = await frameFor(element(by.id('session-board')));
  expectFrameContained(boardBefore, screenBefore, `${orientation} board before ${outcome} feedback`);

  await playBoardMove('session-board', move);
  if (outcome === 'correct') {
    await waitFor(element(by.id('sprint-unclear-prompt'))).toExist().withTimeout(10000);
  } else {
    await waitFor(element(by.id('move-feedback-overlay'))).toExist().withTimeout(10000);
    await waitFor(element(by.label('Mistakes 1 of 3')).atIndex(0)).toExist().withTimeout(10000);
  }

  const screenAfter = await frameFor(element(by.id('safe-area-shell')));
  const boardAfter = await frameFor(element(by.id('session-board')));
  expectFrameContained(boardAfter, screenAfter, `${orientation} board after ${outcome} feedback`);
  expectFrameUnchanged(boardBefore, boardAfter, `${orientation} ${outcome} feedback`);

  if (outcome !== 'correct') {
    return;
  }

  const promptFrame = await frameFor(element(by.id('sprint-unclear-prompt')));
  expectFrameContained(promptFrame, screenAfter, `${orientation} Unclear action`);
  const scoreFrame = await frameFor(element(by.id('session-score-strip')));
  if (promptFrame.y < scoreFrame.y + scoreFrame.height - 1) {
    throw new Error(
      `Expected the ${orientation} Unclear action below the score: `
      + `score=${JSON.stringify(scoreFrame)}, prompt=${JSON.stringify(promptFrame)}`
    );
  }

  if (orientation === 'landscape') {
    const railFrame = await frameFor(element(by.id('active-session-control-rail')));
    expectFrameContained(promptFrame, railFrame, 'Landscape Unclear action');
    const bottomGap = railFrame.y + railFrame.height - (promptFrame.y + promptFrame.height);
    if (bottomGap < -1 || bottomGap > 6) {
      throw new Error(
        `Expected the landscape Unclear action at the bottom of the control rail: `
        + `rail=${JSON.stringify(railFrame)}, prompt=${JSON.stringify(promptFrame)}`
      );
    }
  }
}

async function setPracticeOrientation(orientation) {
  if (device.getPlatform() === 'android') {
    await setAndroidDisplayOrientation(orientation);
    return;
  }
  await device.setOrientation(orientation);
}

function expectFrameUnchanged(before, after, label) {
  const tolerance = 1;
  for (const key of ['x', 'y', 'width', 'height']) {
    if (Math.abs(before[key] - after[key]) > tolerance) {
      throw new Error(
        `${label} changed board ${key}: before=${JSON.stringify(before)}, after=${JSON.stringify(after)}`
      );
    }
  }
}

function expectBoardScreenshotContainsNeutralArrows(screenshotPath, boardFrame) {
  const png = readRgbaPng(screenshotPath);
  const boardPixels = pixelFrameForBoard(png, boardFrame);
  let arrowLikePixels = 0;

  for (let y = boardPixels.y; y < boardPixels.y + boardPixels.height; y += 1) {
    for (let x = boardPixels.x; x < boardPixels.x + boardPixels.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      const r = png.data[offset];
      const g = png.data[offset + 1];
      const b = png.data[offset + 2];
      const a = png.data[offset + 3];

      if (
        a > 240 &&
        r >= 40 && r <= 130 &&
        g >= 80 && g <= 170 &&
        b >= 190 && b <= 245 &&
        b > g + 35 &&
        b > r + 70
      ) {
        arrowLikePixels += 1;
      }
    }
  }

  if (arrowLikePixels <= 5000) {
    throw new Error(`Expected rendered Arrow Duel arrows, found only ${arrowLikePixels} arrow-like pixels`);
  }
}

function pixelFrameForBoard(png, boardFrame) {
  const screenWidthPoints = boardFrame.x * 2 + boardFrame.width;
  const scale = png.width / screenWidthPoints;
  return {
    x: Math.max(0, Math.floor(boardFrame.x * scale)),
    y: Math.max(0, Math.floor(boardFrame.y * scale)),
    width: Math.min(png.width, Math.ceil(boardFrame.width * scale)),
    height: Math.min(png.height, Math.ceil(boardFrame.height * scale))
  };
}

function expectScreenshotContainsGreenAnalysisArrow(screenshotPath) {
  const png = readRgbaPng(screenshotPath);
  let arrowLikePixels = 0;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      const r = png.data[offset];
      const g = png.data[offset + 1];
      const b = png.data[offset + 2];
      const a = png.data[offset + 3];

      if (
        a > 220 &&
        r >= 10 && r <= 70 &&
        g >= 120 && g <= 190 &&
        b >= 55 && b <= 120 &&
        g > r + 70 &&
        g > b + 35
      ) {
        arrowLikePixels += 1;
      }
    }
  }

  if (arrowLikePixels <= 500) {
    throw new Error(`Expected rendered green analysis arrow, found only ${arrowLikePixels} green arrow-like pixels`);
  }
}

function readRgbaPng(path) {
  const buffer = fs.readFileSync(path);
  assertPngSignature(buffer);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4;
  }

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  return {
    width,
    height,
    data: unfilterRgbaScanlines(inflated, width, height)
  };
}

function assertPngSignature(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('Screenshot is not a PNG');
  }
}

function unfilterRgbaScanlines(inflated, width, height) {
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const output = Buffer.alloc(height * stride);
  let sourceOffset = 0;

  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = row * stride;

    for (let col = 0; col < stride; col += 1) {
      const raw = inflated[sourceOffset + col];
      const left = col >= bytesPerPixel ? output[rowOffset + col - bytesPerPixel] : 0;
      const up = row > 0 ? output[rowOffset - stride + col] : 0;
      const upperLeft = row > 0 && col >= bytesPerPixel
        ? output[rowOffset - stride + col - bytesPerPixel]
        : 0;

      // PNG scanline reconstruction intentionally clamps the decoded value to one byte.
      // eslint-disable-next-line no-bitwise
      output[rowOffset + col] = (raw + unfilterByte(filter, left, up, upperLeft)) & 0xff;
    }

    sourceOffset += stride;
  }

  return output;
}

function unfilterByte(filter, left, up, upperLeft) {
  if (filter === 0) {
    return 0;
  }
  if (filter === 1) {
    return left;
  }
  if (filter === 2) {
    return up;
  }
  if (filter === 3) {
    return Math.floor((left + up) / 2);
  }
  if (filter === 4) {
    return paethPredictor(left, up, upperLeft);
  }
  throw new Error(`Unsupported PNG filter: ${filter}`);
}

function paethPredictor(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpperLeft = Math.abs(estimate - upperLeft);

  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpperLeft) {
    return left;
  }
  if (distanceUp <= distanceUpperLeft) {
    return up;
  }
  return upperLeft;
}
