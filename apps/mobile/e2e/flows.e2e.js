const {
  openTab,
  openStandardHistoryTrend,
  launchWithDisabledSynchronization,
  playBoardMove,
  sleep,
  startPracticeMode,
  selectTestPuzzleSource,
  textFromAttributes,
  waitForVisibleInPracticeScroll,
  waitForElementTextContaining,
  failStandardSprint,
  grantAndroidRuntimePermission,
  withAndroidUiDiagnostics
} = require('./helpers');
const releaseVersion = require('../release-version.json');

const APP_ID = 'com.chessticize.mobile';
const NOTIFICATION_PERMISSION = 'android.permission.POST_NOTIFICATIONS';

describe('Key user flows', () => {
  const dayMs = 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: true
    });
  });

  it('shows the installed native version and build in Settings', async () => {
    await openTab('settings-tab', 'settings-app-version');
    await waitForElementTextContaining(
      'settings-app-version',
      `${expectedInstalledPublicVersion()} (${expectedInstalledBuildNumber()})`,
      10000
    );
  });

  it('fails a standard sprint and shows actionable results', async () => {
    const runWithDiagnostics = device.getPlatform() === 'android'
      ? withAndroidUiDiagnostics
      : async (action) => action();
    await runWithDiagnostics(async () => {
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
    const timerBefore = durationTextToSeconds(textFromAttributes(await element(by.id('review-timer')).getAttributes()));
    await sleep(1500);
    const timerAfter = durationTextToSeconds(textFromAttributes(await element(by.id('review-timer')).getAttributes()));
    if (timerBefore <= 0 || timerAfter >= timerBefore) {
      throw new Error(`Expected the review timer to count down, received ${timerBefore} then ${timerAfter}`);
    }
    await expect(element(by.id('review-source-pill'))).not.toExist();
    await expect(element(by.id('review-theme-pill'))).not.toExist();
    await expect(element(by.id('review-analysis-button'))).not.toExist();
    await expect(element(by.id('review-accessible-moves-open'))).not.toExist();
    await expect(element(by.id('review-line-continue'))).not.toExist();

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

    await waitFor(element(by.id('review-progress'))).toHaveText('2 / 3 · Standard').withTimeout(30000);
    await expect(element(by.id('review-line-continue'))).not.toExist();
    await element(by.id('review-exit')).tap();
    await waitFor(element(by.id('review-due-count'))).toHaveText('1 / 3').withTimeout(10000);
    await waitFor(element(by.id('review-today-history'))).toExist().withTimeout(10000);

    // The completion transaction must survive a real process boundary too:
    // history, the completed-today numerator, and the future queue all come
    // back through the same on-device SQLite adapter after relaunch.
    await device.terminateApp();
    await launchAppAt(reviewNowMs, false);
    await openTab('review-tab', 'review-start-due');
    await waitFor(element(by.id('review-due-count'))).toHaveText('1 / 3').withTimeout(10000);
    await waitFor(element(by.id('review-total-count'))).toHaveText('3').withTimeout(10000);
    await waitFor(element(by.id('review-today-history'))).toExist().withTimeout(10000);

    await waitForVisibleInPracticeScroll('review-start-due');
    await element(by.id('review-start-due')).tap();
    await waitFor(element(by.id('review-progress'))).toHaveText('2 / 3 · Standard').withTimeout(10000);
  });

  it('handles review reminders through the platform capability', async () => {
    const sprintNowMs = Date.now() - (2 * dayMs);
    if (device.getPlatform() === 'android') {
      // This suite can follow native permission journeys on the same emulator.
      // Establish its authorized OS fixture explicitly before the app relaunch.
      grantAndroidNotificationPermission();
    }
    // beforeEach already installed a clean app; relaunch only to apply fixtures.
    await launchAppAt(sprintNowMs, false, { chessticizeTestNotificationStatus: 'authorized' });

    await failStandardSprint();
    await dismissSprintSummary();

    await openTab('settings-tab', 'settings-review-reminders');
    if (device.getPlatform() === 'android') {
      await waitForElementTextContaining(
        'settings-review-reminders',
        'Android may deliver later',
        10000
      );
    } else {
      await waitForElementTextContaining('settings-review-reminders', 'Local notifications enabled', 10000);
    }

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
    await expect(element(by.id('history-filter-reset'))).not.toExist();
    await expect(element(by.id('history-filter-wrong-only')))
      .toHaveValue(historyToggleValue('Wrong puzzles only', false));
    await expect(element(by.id('history-filter-sprint-only')))
      .toHaveValue(historyToggleValue('Sprint attempts only', true));
    await element(by.id('history-filter-wrong-only')).tap();
    await waitFor(element(by.id('history-filter-wrong-only')))
      .toHaveValue(historyToggleValue('Wrong puzzles only', true))
      .withTimeout(10000);
    await waitFor(element(by.text('Wrong move')).atIndex(0)).toExist().withTimeout(10000);
    await element(by.id('history-filter-wrong-only')).tap();
    await waitFor(element(by.id('history-filter-wrong-only')))
      .toHaveValue(historyToggleValue('Wrong puzzles only', false))
      .withTimeout(10000);

    // Replay round trip must preserve the toggles' non-default state: turn the
    // wrong-only filter on and sprint-only filter off, open a wrong attempt's
    // replay, exit, and require both choices to remain unchanged.
    await element(by.id('history-filter-wrong-only')).tap();
    await waitFor(element(by.id('history-filter-wrong-only')))
      .toHaveValue(historyToggleValue('Wrong puzzles only', true))
      .withTimeout(10000);
    await waitFor(element(by.id('history-filter-sprint-only')))
      .toBeVisible()
      .whileElement(by.id('history-quick-filters'))
      .scroll(120, 'right');
    await element(by.id('history-filter-sprint-only')).tap();
    await waitFor(element(by.id('history-filter-sprint-only')))
      .toHaveValue(historyToggleValue('Sprint attempts only', false))
      .withTimeout(10000);
    await element(by.id('history-filter-toggle')).tap();
    await waitForVisibleInPracticeScroll('history-theme-mate-in-2');
    await element(by.id('history-theme-mate-in-2')).tap();
    await waitForVisibleInPracticeScroll('history-theme-mate-in-3');
    await element(by.id('history-theme-mate-in-3')).tap();
    await waitFor(element(
      by.text('Mate in 2').withAncestor(by.id('history-active-filter-summary'))
    )).toExist().withTimeout(10000);
    await waitFor(element(
      by.text('Mate in 3').withAncestor(by.id('history-active-filter-summary'))
    )).toExist().withTimeout(10000);
    await waitFor(element(by.text('Wrong move')).atIndex(0)).toExist().withTimeout(10000);

    const resultAttributes = await element(by.text('Wrong move')).atIndex(0).getAttributes();
    const resultIdentifier = (Array.isArray(resultAttributes) ? resultAttributes[0] : resultAttributes).identifier;
    if (typeof resultIdentifier !== 'string' || !resultIdentifier.endsWith('-result')) {
      throw new Error(`Could not resolve history attempt row from ${String(resultIdentifier)}`);
    }
    const resultRowIdentifier = resultIdentifier.replace(/-result$/, '');
    await waitForVisibleInPracticeScroll(resultRowIdentifier);
    await element(by.id(resultRowIdentifier)).tap();
    await waitFor(element(by.id('review-session'))).toExist().withTimeout(10000);
    await expect(element(by.id('review-source-pill'))).not.toExist();
    await waitFor(element(by.id('review-theme-rail'))).toExist().withTimeout(10000);
    await expect(element(by.text('Themes'))).not.toExist();
    await element(by.id('practice-main-scroll')).scrollTo('top');
    await waitFor(element(by.id('review-exit'))).toBeVisible().withTimeout(10000);
    await element(by.id('review-exit')).tap();
    await waitFor(element(by.id('history-filter-wrong-only')))
      .toHaveValue(historyToggleValue('Wrong puzzles only', true))
      .withTimeout(10000);
    await waitFor(element(by.id('history-filter-sprint-only')))
      .toHaveValue(historyToggleValue('Sprint attempts only', false))
      .withTimeout(10000);
    await expect(element(
      by.text('Mate in 2').withAncestor(by.id('history-active-filter-summary'))
    )).toExist();
    await expect(element(
      by.text('Mate in 3').withAncestor(by.id('history-active-filter-summary'))
    )).toExist();
    await waitFor(element(by.id('history-filter-reset'))).toBeVisible().withTimeout(10000);
    await expect(element(by.text('Reset filters'))).toExist();
    await element(by.id('history-filter-reset')).tap();
    await waitFor(element(by.id('history-filter-wrong-only')))
      .toHaveValue(historyToggleValue('Wrong puzzles only', false))
      .withTimeout(10000);
    await waitFor(element(by.id('history-filter-sprint-only')))
      .toHaveValue(historyToggleValue('Sprint attempts only', true))
      .withTimeout(10000);
  });

  it('adds and starts a saved custom Run', async () => {
    await createSavedCustomRun('Flow Focus', { shorterDuration: true });
    await element(by.text('Flow Focus')).tap();
    await element(by.id('practice-main-scroll')).scrollTo('top');
    await element(by.id('practice-run-start')).tap();
    await waitFor(element(by.id('session-board'))).toExist().withTimeout(15000);

    await element(by.id('session-abandon')).tap();
    await waitFor(element(by.id('session-abandon-confirmation'))).toBeVisible().withTimeout(5000);
    await element(by.id('session-abandon-confirm')).tap();
    await waitFor(element(by.text('Sprint failed'))).toBeVisible().withTimeout(10000);
  });

  it('persists rating, history, review queue, and saved Runs after relaunch', async () => {
    await failStandardSprint();
    await dismissSprintSummary();

    await openTab('practice-tab', 'practice-add-run');
    await createSavedCustomRun('Persistent Focus', {
      shorterDuration: true,
      themes: ['mate-in-2', 'fork']
    });
    await element(by.text('Persistent Focus')).tap();
    await element(by.id('practice-main-scroll')).scrollTo('top');
    await element(by.id('practice-run-start')).tap();
    await waitFor(element(by.id('session-board'))).toExist().withTimeout(15000);
    await element(by.id('session-abandon')).tap();
    await waitFor(element(by.id('session-abandon-confirmation'))).toBeVisible().withTimeout(5000);
    await element(by.id('session-abandon-confirm')).tap();
    await waitFor(element(by.text('Sprint failed'))).toBeVisible().withTimeout(10000);
    await dismissSprintSummary();

    await openTab('practice-tab', 'practice-add-run');
    await element(by.id('practice-run-home-edit')).tap();
    await element(by.id('practice-run-edit-standard')).tap();
    await element(by.id('practice-run-elo-increase')).tap();
    await element(by.id('practice-run-save')).tap();
    await element(by.id('practice-run-home-done')).tap();
    await waitForElementTextContaining('practice-mode-standard-rating', 'ELO 625', 5000);

    await device.terminateApp();
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: false
    });
    await selectTestPuzzleSource('familiar15');

    await openStandardHistoryTrend();

    await openTab('review-tab', 'review-empty-state');
    await expect(element(by.id('review-empty-practice'))).toBeVisible();

    await openTab('settings-tab', 'settings-app-version');
    await expect(element(by.id('settings-standard-elo-row'))).not.toExist();

    await openTab('practice-tab', 'practice-add-run');
    await waitFor(element(by.text('Persistent Focus'))).toExist().withTimeout(10000);
    await waitFor(element(by.text('Fork + Mate in 2 · 3 min · 20s pace')))
      .toExist()
      .withTimeout(10000);
    await waitForElementTextContaining('practice-mode-standard-rating', 'ELO 625', 5000);
  });
});

async function createSavedCustomRun(name, { shorterDuration = false, themes = [] } = {}) {
  await waitFor(element(by.id('practice-add-run'))).toBeVisible().withTimeout(10000);
  await element(by.id('practice-add-run')).tap();
  await waitFor(element(by.id('practice-run-editor'))).toExist().withTimeout(10000);
  await element(by.id('practice-run-name-input')).replaceText(name);
  await element(by.id('practice-run-name-input')).tapReturnKey();
  if (shorterDuration) {
    await waitForVisibleInPracticeScroll('practice-run-duration-stepper-decrease');
    await element(by.id('practice-run-duration-stepper-decrease')).tap();
  }
  for (const theme of themes) {
    await waitForVisibleInPracticeScroll(`custom-theme-${theme}`);
    await element(by.id(`custom-theme-${theme}`)).tap();
  }
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await element(by.id('practice-run-save')).tap();
  await waitFor(element(by.id('practice-run-home-edit'))).toBeVisible().withTimeout(10000);
  await waitFor(element(by.text(name))).toExist().withTimeout(10000);
}

function durationTextToSeconds(value) {
  const match = /^(\d+):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Expected a countdown duration, received "${value}"`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function expectedInstalledBuildNumber() {
  return device.getPlatform() === 'android'
    ? releaseVersion.androidVersionCode
    : releaseVersion.iosBuildNumber;
}

function expectedInstalledPublicVersion() {
  return device.getPlatform() === 'android'
    ? releaseVersion.publicVersion
    : releaseVersion.iosPublicVersion;
}

function historyToggleValue(label, active) {
  if (device.getPlatform() === 'android') {
    return `${label}, ${active ? 'On' : 'Off'}`;
  }
  return active ? '1' : '0';
}

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

function grantAndroidNotificationPermission() {
  grantAndroidRuntimePermission(APP_ID, NOTIFICATION_PERMISSION);
}
