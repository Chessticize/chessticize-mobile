const {
  openTab,
  openStandardHistoryTrend,
  launchWithDisabledSynchronization,
  playBoardMove,
  startPracticeMode,
  selectTestPuzzleSource,
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
    // 00Kbj is the first Arrow-Duel-eligible familiar15 puzzle. Assert the
    // fixture contract before playing its Stockfish-best candidate.
    await waitForElementTextContaining('arrow-duel-candidate-overlay', 'h1h2', 10000);
    await waitForElementTextContaining('arrow-duel-candidate-overlay', 'h3h4', 10000);

    await playBoardMove('session-board', 'h1h2');
    await waitFor(element(by.id('session-progress'))).toHaveText('1 / 10').withTimeout(10000);
  });

  it('schedules failed sprint mistakes into the review queue', async () => {
    await failStandardSprint();
    await dismissSprintSummary();

    // Mistakes schedule for the next day, so nothing is due yet: the empty
    // state must surface the next due estimate and offer practice instead.
    await openTab('review-tab', 'review-empty-state');
    await waitFor(element(by.id('review-tomorrow-count'))).toHaveText('3').withTimeout(10000);
    await waitFor(element(by.id('review-next-seven-days-count'))).toHaveText('3').withTimeout(10000);
    await waitFor(element(by.id('review-total-count'))).toHaveText('3').withTimeout(10000);
    await waitForElementTextContaining('review-next-due', 'Next:', 10000);
    await expect(element(by.id('review-empty-practice'))).toBeVisible();
  });

  it('shows scheduled due reviews after relaunch', async () => {
    const sprintNowMs = Date.now() - (2 * dayMs);
    const reviewNowMs = sprintNowMs + dayMs + 60 * 1000;
    // beforeEach already installed a clean app; relaunch with the test clock
    // without paying for a second uninstall/install cycle.
    await launchAppAt(sprintNowMs, false);

    await failStandardSprint();
    await dismissSprintSummary();

    await device.terminateApp();
    await launchAppAt(reviewNowMs, false);

    await openTab('review-tab', 'review-start-due');
    await waitFor(element(by.id('review-due-count'))).toHaveText('0 / 3').withTimeout(10000);
    await waitFor(element(by.id('review-total-count'))).toHaveText('3').withTimeout(10000);
    await waitForElementTextContaining('review-due-summary', 'Ready now', 10000);

    await element(by.id('review-start-due')).tap();
    await waitFor(element(by.id('review-session'))).toExist().withTimeout(10000);
    await element(by.id('practice-main-scroll')).scrollTo('top');
    await waitForVisibleInPracticeScroll('review-board');
    await waitFor(element(by.id('review-progress'))).toHaveText('1 / 3 · Standard').withTimeout(10000);
    await waitForElementTextContaining('review-current-expected-move', 'e2e6', 10000);
    await waitFor(element(by.id('review-timer'))).toHaveText('00:40').withTimeout(10000);
    await expect(element(by.id('review-source-pill'))).not.toExist();
    await expect(element(by.id('review-theme-pill'))).not.toExist();
    await expect(element(by.id('review-analysis-button'))).not.toExist();

    // Exiting an unanswered review leaves it due and restores the same fixed
    // daily position when the user comes back.
    await element(by.id('review-exit')).tap();
    await waitFor(element(by.id('review-due-count'))).toHaveText('0 / 3').withTimeout(10000);
    await element(by.id('review-start-due')).tap();
    await waitFor(element(by.id('review-progress'))).toHaveText('1 / 3 · Standard').withTimeout(10000);
    await waitForElementTextContaining('review-current-expected-move', 'e2e6', 10000);
    await element(by.id('practice-main-scroll')).scrollTo('top');
    await waitForVisibleInPracticeScroll('review-board');

    await playBoardMove('review-board', 'e2e6');
    await waitForElementTextContaining('review-current-expected-move', 'e6f7', 10000);
    // The expected-move label can update before the native board has finished
    // applying the auto reply. Wait for the board lock itself before sending
    // the next pair of board taps.
    await waitFor(element(by.id('review-board-state'))).toHaveText('ready').withTimeout(10000);
    await playBoardMove('review-board', 'e6f7');
    await waitFor(element(by.id('move-feedback-overlay'))).toExist().withTimeout(5000);

    await waitFor(element(by.id('review-progress'))).toHaveText('2 / 3 · Standard').withTimeout(15000);
    await element(by.id('review-exit')).tap();
    await waitFor(element(by.id('review-due-count'))).toHaveText('1 / 3').withTimeout(10000);
    await waitFor(element(by.id('review-today-history'))).toExist().withTimeout(10000);
    await waitForVisibleInPracticeScroll('review-start-due');
    await element(by.id('review-start-due')).tap();
    await waitFor(element(by.id('review-progress'))).toHaveText('2 / 3 · Standard').withTimeout(10000);
  });

  it('schedules review reminders through the native fixture', async () => {
    const sprintNowMs = Date.now() - (2 * dayMs);
    // beforeEach already installed a clean app; relaunch only to apply fixtures.
    await launchAppAt(sprintNowMs, false, { chessticizeTestNotificationStatus: 'authorized' });

    await failStandardSprint();
    await dismissSprintSummary();

    await openTab('settings-tab', 'settings-review-reminders');
    await waitForElementTextContaining('settings-review-reminders', 'Local notifications enabled', 10000);

    await waitForVisibleInPracticeScroll('settings-review-reminder-fixed-1900');
    await element(by.id('settings-review-reminder-fixed-1900')).tap();
    await waitForElementTextContaining('settings-review-reminder-schedule-status', 'scheduled|', 10000);
    await waitForElementTextContaining('settings-review-reminder-schedule-status', '|3|3 reviews are ready|review', 10000);

    await waitForVisibleInPracticeScroll('settings-review-reminder-off');
    await element(by.id('settings-review-reminder-off')).tap();
    await waitForElementTextContaining('settings-review-reminder-schedule-status', 'none', 10000);
  });

  it('shows failed attempts in history with the wrong-only toggle', async () => {
    await failStandardSprint();
    await dismissSprintSummary();

    await openStandardHistoryTrend();

    await waitFor(element(by.id('history-filter-wrong-only')))
      .toBeVisible()
      .whileElement(by.id('history-range-filters'))
      .scroll(120, 'right');
    await expect(element(by.id('history-filter-wrong-only'))).toHaveValue('1');
    await element(by.id('history-filter-wrong-only')).tap();
    await waitFor(element(by.id('history-filter-wrong-only'))).toHaveValue('0').withTimeout(10000);
    await element(by.id('history-filter-wrong-only')).tap();
    await waitFor(element(by.id('history-filter-wrong-only'))).toHaveValue('1').withTimeout(10000);
    await waitFor(element(by.text('Wrong move')).atIndex(0)).toExist().withTimeout(10000);

    // Replay round trip must preserve the toggle's non-default state: turn the
    // filter off (default is on), open a wrong attempt's replay, exit, and
    // require the toggle to still be off rather than reset to its default.
    await element(by.id('history-filter-wrong-only')).tap();
    await waitFor(element(by.id('history-filter-wrong-only'))).toHaveValue('0').withTimeout(10000);
    await waitFor(element(by.text('Wrong move')).atIndex(0)).toExist().withTimeout(10000);

    const resultAttributes = await element(by.text('Wrong move')).atIndex(0).getAttributes();
    const resultIdentifier = (Array.isArray(resultAttributes) ? resultAttributes[0] : resultAttributes).identifier;
    if (typeof resultIdentifier !== 'string' || !resultIdentifier.endsWith('-result')) {
      throw new Error(`Could not resolve history attempt row from ${String(resultIdentifier)}`);
    }
    await element(by.id(resultIdentifier.replace(/-result$/, ''))).tap();
    await waitFor(element(by.id('review-session'))).toExist().withTimeout(10000);
    await element(by.id('practice-main-scroll')).scrollTo('top');
    await waitFor(element(by.id('review-exit'))).toBeVisible().withTimeout(10000);
    await element(by.id('review-exit')).tap();
    await waitFor(element(by.id('history-filter-wrong-only'))).toHaveValue('0').withTimeout(10000);
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

    await openStandardHistoryTrend();

    await openTab('review-tab', 'review-empty-state');
    await expect(element(by.id('review-empty-practice'))).toBeVisible();

    await openTab('settings-tab', 'settings-standard-elo-row');
    await waitForElementTextContaining('settings-standard-elo-row', 'ELO 625', 5000);

    await openTab('practice-tab', 'practice-mode-custom');
    await element(by.id('practice-mode-custom')).tap();
    await waitFor(element(by.id('custom-previous-configs'))).toExist().withTimeout(10000);
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
