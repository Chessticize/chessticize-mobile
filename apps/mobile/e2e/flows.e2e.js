const {
  openTab,
  launchWithDisabledSynchronization,
  sleep,
  startPracticeMode,
  selectTestPuzzleSource,
  textFromAttributes,
  waitForVisibleInPracticeScroll,
  waitForElementTextContaining,
  failStandardSprint
} = require('./helpers');

describe('Key user flows', () => {
  const dayMs = 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: true
    });
  });

  it('fails a standard sprint and shows actionable results', async () => {
    await failStandardSprint();

    await waitFor(element(by.id('sprint-result-solved'))).toBeVisible().withTimeout(10000);
    await expect(element(by.id('sprint-result-reason'))).toBeVisible();
    await expect(element(by.id('sprint-result-mistakes'))).toBeVisible();
    await expect(element(by.id('sprint-result-rating-change'))).toBeVisible();
    await expect(element(by.id('sprint-result-review-impact'))).toBeVisible();
    await expect(element(by.id('review-mistakes-button'))).toBeVisible();

    await element(by.id('play-again-button')).tap();
    await waitFor(element(by.id('session-board'))).toExist().withTimeout(15000);

    await element(by.id('session-abandon')).tap();
    await waitFor(element(by.id('session-abandon-confirmation'))).toBeVisible().withTimeout(5000);
    await element(by.id('session-abandon-confirm')).tap();
    await waitFor(element(by.text('Sprint failed'))).toBeVisible().withTimeout(10000);
  });

  it('opens Arrow Duel as a board-move sprint without choice chips', async () => {
    await selectTestPuzzleSource('familiar15');
    await startPracticeMode('arrow-duel');
    await waitForVisibleInPracticeScroll('session-board');

    await expect(element(by.id('arrow-duel-candidate-a'))).not.toExist();
    await expect(element(by.id('arrow-duel-candidate-b'))).not.toExist();
    await waitFor(element(by.id('session-progress'))).toHaveText('0 / 10').withTimeout(10000);
  });

  it('schedules failed sprint mistakes into the review queue', async () => {
    await failStandardSprint();
    await dismissSprintSummary();

    // Mistakes schedule for the next day, so nothing is due yet: the empty
    // state must surface the next due estimate and offer practice instead.
    await openTab('review-tab', 'review-empty-state');
    await waitFor(element(by.id('review-total-count'))).toHaveText('3').withTimeout(10000);
    await waitForElementTextContaining('review-next-due', 'Next:', 10000);
    await expect(element(by.id('review-empty-practice'))).toBeVisible();
  });

  it('opens a scheduled due review after relaunch', async () => {
    const sprintNowMs = Date.now() - (2 * dayMs);
    const reviewNowMs = sprintNowMs + dayMs + 60 * 1000;
    await launchAppAt(sprintNowMs, true);

    await failStandardSprint();
    await dismissSprintSummary();

    await device.terminateApp();
    await launchAppAt(reviewNowMs, false);
    await selectTestPuzzleSource('familiar15');

    await openTab('review-tab', 'review-start-due');
    await waitFor(element(by.id('review-due-count'))).toHaveText('3').withTimeout(10000);
    await waitForElementTextContaining('review-due-summary', 'Ready now', 10000);

    await element(by.id('review-start-due')).tap();
    await waitFor(element(by.id('review-session'))).toBeVisible().withTimeout(10000);
    await waitFor(element(by.text('Scheduled review'))).toBeVisible().withTimeout(10000);
    await waitForElementTextContaining('review-progress', '1 / 3', 10000);

    const expectedMove = await elementText('review-current-expected-move');
    const boardOrientation = await elementText('review-board-flipped');
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(expectedMove)) {
      throw new Error(`Expected a UCI review move, got ${expectedMove}`);
    }
    if (!['normal', 'flipped'].includes(boardOrientation)) {
      throw new Error(`Expected review board orientation, got ${boardOrientation}`);
    }
    await element(by.id('review-exit')).tap();
    await waitFor(element(by.id('review-start-due'))).toBeVisible().withTimeout(10000);
  });

  it('schedules review reminders through the native fixture', async () => {
    const sprintNowMs = Date.now() - (2 * dayMs);
    await launchAppAt(sprintNowMs, true, { chessticizeTestNotificationStatus: 'authorized' });

    await failStandardSprint();
    await dismissSprintSummary();

    await openTab('settings-tab', 'settings-review-reminders');
    await waitForElementTextContaining('settings-review-reminders', 'Local notifications enabled', 10000);

    await waitForVisibleInPracticeScroll('settings-review-reminder-fixed-1900');
    await element(by.id('settings-review-reminder-fixed-1900')).tap();
    await waitForElementTextContaining('settings-review-reminder-schedule-status', 'scheduled|', 10000);
    await waitForElementTextContaining('settings-review-reminder-schedule-status', '|3|3 puzzles are ready for review|review', 10000);

    await waitForVisibleInPracticeScroll('settings-review-reminder-off');
    await element(by.id('settings-review-reminder-off')).tap();
    await waitForElementTextContaining('settings-review-reminder-schedule-status', 'none', 10000);
  });

  it('shows failed attempts in history with the wrong-7-days shortcut', async () => {
    await failStandardSprint();
    await dismissSprintSummary();

    await openTab('history-tab', 'history-action-header');
    await waitFor(element(by.id('history-performance-card'))).toExist().withTimeout(10000);
    await waitFor(element(by.id('history-chart-line'))).toExist().withTimeout(10000);

    await waitFor(element(by.id('history-filter-wrong-only')))
      .toBeVisible()
      .whileElement(by.id('history-range-filters'))
      .scroll(120, 'right');
    await element(by.id('history-filter-wrong-only')).tap();
    await waitFor(element(by.id('history-filter-wrong-only-clear-glyph'))).toExist().withTimeout(10000);
    await waitFor(element(by.text('Wrong move')).atIndex(0)).toExist().withTimeout(10000);
  });

  it('configures and starts a custom sprint', async () => {
    await waitForVisibleInPracticeScroll('practice-mode-custom');
    await element(by.id('practice-mode-custom')).tap();
    // The setup panel is taller than the viewport, so wait on a child row.
    await waitForVisibleInPracticeScroll('custom-target-count');

    await waitForElementTextContaining('custom-target-count', '15', 5000);
    await element(by.id('custom-duration-stepper-decrease')).tap();
    await waitForElementTextContaining('custom-target-count', '9', 5000);

    await element(by.id('start-sprint-button')).tap();
    await waitFor(element(by.id('session-board'))).toExist().withTimeout(15000);

    await element(by.id('session-abandon')).tap();
    await waitFor(element(by.id('session-abandon-confirmation'))).toBeVisible().withTimeout(5000);
    await element(by.id('session-abandon-confirm')).tap();
    await waitFor(element(by.text('Sprint failed'))).toBeVisible().withTimeout(10000);
  });

  it('persists rating, history, review queue, and custom configs after relaunch', async () => {
    await failStandardSprint();
    await dismissSprintSummary();

    await openTab('practice-tab', 'practice-mode-custom');
    await element(by.id('practice-mode-custom')).tap();
    await waitForVisibleInPracticeScroll('custom-target-count');
    await element(by.id('custom-duration-stepper-decrease')).tap();
    await waitForElementTextContaining('custom-target-count', '9', 5000);
    await element(by.id('start-sprint-button')).tap();
    await waitFor(element(by.id('session-board'))).toExist().withTimeout(15000);
    await element(by.id('session-abandon')).tap();
    await waitFor(element(by.id('session-abandon-confirmation'))).toBeVisible().withTimeout(5000);
    await element(by.id('session-abandon-confirm')).tap();
    await waitFor(element(by.text('Sprint failed'))).toBeVisible().withTimeout(10000);
    await dismissSprintSummary();

    await openTab('settings-tab', 'settings-standard-elo-row');
    await element(by.id('settings-standard-elo-row')).tap();
    await waitForVisibleInPracticeScroll('settings-advanced-rating-standard-increase');
    await element(by.id('settings-advanced-rating-standard-increase')).tap();
    await waitForElementTextContaining('settings-standard-elo-row', 'ELO 625', 5000);

    await device.terminateApp();
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: false
    });
    await selectTestPuzzleSource('familiar15');

    await openTab('history-tab', 'history-action-header');
    await waitFor(element(by.id('history-performance-card'))).toExist().withTimeout(10000);
    await waitFor(element(by.id('history-chart-line'))).toExist().withTimeout(10000);

    await openTab('review-tab', 'review-empty-state');
    await expect(element(by.id('review-empty-practice'))).toBeVisible();

    await openTab('settings-tab', 'settings-standard-elo-row');
    await waitForElementTextContaining('settings-standard-elo-row', 'ELO 625', 5000);

    await openTab('practice-tab', 'practice-mode-custom');
    await element(by.id('practice-mode-custom')).tap();
    await waitFor(element(by.id('custom-previous-configs'))).toExist().withTimeout(10000);
  });

  it('resets ELO and deletes local history with explicit confirmation', async () => {
    await openTab('settings-tab', 'settings-reset-elo');
    await element(by.id('settings-reset-elo')).tap();
    await waitForVisibleInPracticeScroll('settings-reset-elo-confirmation-confirm');
    await element(by.id('settings-reset-elo-confirmation-confirm')).tap();
    await waitForVisibleInPracticeScroll('settings-status-message');

    await element(by.id('practice-main-scroll')).scrollTo('top');
    await waitForVisibleInPracticeScroll('settings-delete-local-history');
    await element(by.id('settings-delete-local-history')).tap();
    await waitForVisibleInPracticeScroll('settings-delete-history-confirmation-confirm');
    await element(by.id('settings-delete-history-confirmation-confirm')).tap();
    await waitForVisibleInPracticeScroll('settings-status-message');
  });
});

async function dismissSprintSummary() {
  // The app chrome (tab bar) is hidden while the sprint summary is open;
  // leave via Done before navigating tabs.
  await element(by.id('back-practice-button')).tap();
  await waitFor(element(by.id('practice-tab'))).toBeVisible().withTimeout(10000);
}

async function launchAppAt(nowMs, deleteData, extraLaunchArgs = {}) {
  await launchWithDisabledSynchronization({
    newInstance: true,
    delete: deleteData,
    launchArgs: {
      chessticizeTestNowMs: String(nowMs),
      ...extraLaunchArgs
    }
  });
}

async function elementText(testID) {
  return textFromAttributes(await element(by.id(testID)).getAttributes());
}
