const {
  dismissRunNameKeyboard,
  openTab,
  openStandardHistoryTrend,
  historyAttemptRowTestIDForResult,
  launchWithDisabledSynchronization,
  playBoardMove,
  sleep,
  startPracticeMode,
  startSelectedPracticeRun,
  selectTestPuzzleSource,
  tapUntilAnyExists,
  tapUntilExists,
  textFromAttributes,
  waitForVisibleInPracticeScroll,
  waitForElementTextContaining,
  failStandardSprint,
  grantAndroidRuntimePermission,
  withAndroidUiDiagnostics
} = require('./helpers');
const {
  findUniqueAndroidUiNodeByLabel,
  readAndroidUiHierarchy,
  tapAndroidUiNode,
} = require('./androidPublicUiEvidence');
const releaseVersion = require('../release-version.json');
const developmentVersion = require('../development-version.json');

const APP_ID = 'com.chessticize.mobile';
const NOTIFICATION_PERMISSION = 'android.permission.POST_NOTIFICATIONS';

describe('Key user flows', () => {
  const dayMs = 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: true,
      launchArgs: {
        chessticizeICloudDiagnosticsFixture: 'unavailable'
      }
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

  it('prepares support diagnostics from Settings without requiring a sync error', async () => {
    await openTab('settings-tab', 'settings-app-version');
    await waitForVisibleInPracticeScroll('settings-sync-support-bundle-entry');
    await element(by.id('settings-sync-support-bundle-entry')).tap();
    await waitFor(element(by.id('settings-sync-support-bundle-modal')))
      .toBeVisible()
      .withTimeout(10000);
    await waitFor(element(by.id('settings-sync-support-bundle-prepare')))
      .toBeVisible()
      .withTimeout(10000);
    await tapUntilAnyExists(
      'settings-sync-support-bundle-prepare',
      ['settings-sync-support-bundle-preparing', 'settings-sync-support-bundle-share'],
      3
    );
    try {
      await waitFor(element(by.id('settings-sync-support-bundle-share')))
        .toExist()
        .withTimeout(60000);
    } catch (error) {
      const prepareError = element(by.id('settings-sync-support-bundle-prepare-error'));
      await expect(prepareError).toExist();
      throw new Error(`Support bundle preparation failed: ${await textFromAttributes(prepareError)}`, {
        cause: error
      });
    }
    if (device.getPlatform() === 'android') {
      await waitFor(element(by.text('Android diagnostics bundle ready')))
        .toExist()
        .withTimeout(10000);
    }
    await waitFor(element(by.id('settings-sync-support-bundle-details')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('settings-sync-support-bundle-details')).tap();
    await waitFor(element(by.id('settings-sync-support-bundle-modal')))
      .not.toExist()
      .withTimeout(10000);
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

      await waitForVisibleInPracticeScroll('play-again-button');
      await element(by.id('play-again-button')).tap();
      await waitFor(element(by.id('session-board'))).toExist().withTimeout(15000);

      await element(by.id('session-abandon')).tap();
      await waitFor(element(by.id('session-abandon-confirmation'))).toBeVisible().withTimeout(5000);
      await element(by.id('session-abandon-confirm')).tap();
      await waitFor(element(by.id('sprint-summary-panel'))).toExist().withTimeout(30000);
      await expect(element(by.text('Sprint failed'))).toBeVisible();
    });
  });

  it('opens Arrow Duel as a board-move sprint without choice chips', async () => {
    await selectTestPuzzleSource('familiar15');
    await startPracticeMode('arrow-duel');
    await waitForVisibleInPracticeScroll('session-board');

    await expect(element(by.id('arrow-duel-candidate-a'))).not.toExist();
    await expect(element(by.id('arrow-duel-candidate-b'))).not.toExist();
    await waitFor(element(by.id('session-progress'))).toHaveText('0 / 10').withTimeout(10000);
    // Fixed Arrow Duel begins with Qg7 mate versus the Qf7 stalemate alternate.
    await waitForElementTextContaining('arrow-duel-candidate-overlay', 'g6g7', 10000);
    await waitForElementTextContaining('arrow-duel-candidate-overlay', 'g6f7', 10000);

    await playBoardMove('session-board', 'g6g7');
    await waitFor(element(by.id('session-progress'))).toHaveText('1 / 10').withTimeout(10000);
    await expect(element(by.id('arrow-duel-what-if-overlay'))).not.toExist();
    await expect(element(by.id('arrow-duel-reply-timer'))).not.toExist();
  });

  it('schedules failed sprint mistakes into the review queue', async () => {
    await failStandardSprint();
    await dismissSprintSummary();

    // Mistakes schedule for the next day, so nothing is due yet: the stable
    // Today view must surface the next due estimate and both inline empty
    // sections without replacing the queue with a separate empty screen. The
    // review section opens collapsed, so exercise its public disclosure before
    // asserting the empty content.
    await openTab('review-tab', 'review-due-card');
    await waitFor(element(by.id('review-tomorrow-count'))).toHaveText('3').withTimeout(10000);
    await waitFor(element(by.id('review-next-seven-days-count'))).toHaveText('3').withTimeout(10000);
    await waitFor(element(by.id('review-total-count'))).toHaveText('3').withTimeout(10000);
    await waitForElementTextContaining('review-next-due', 'Next:', 10000);
    await expect(element(by.id('review-start-due'))).toBeVisible();
    await expectEmptyReviewTodaySections();
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
      // Let the clean launch finish copying its bundled puzzle database before
      // the fixture relaunch can terminate that first-start initialization.
      await waitForVisibleInPracticeScroll('test-puzzle-source-familiar15');
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

  it('shows failed attempts in History and preserves current filters through replay', async () => {
    await failStandardSprint();
    await dismissSprintSummary();

    await openStandardHistoryTrend();

    await waitForVisibleInPracticeScroll('history-result-wrong');
    await waitFor(element(by.id('history-filter-reset'))).toBeVisible().withTimeout(10000);
    await waitFor(element(
      by.text('Result: Wrong').withAncestor(by.id('history-active-filter-summary'))
    )).not.toExist().withTimeout(10000);
    await waitFor(element(
      by.text('Source: Sprint').withAncestor(by.id('history-active-filter-summary'))
    )).toExist().withTimeout(10000);
    await element(by.id('history-result-wrong')).tap();
    await waitFor(element(
      by.text('Result: Wrong').withAncestor(by.id('history-active-filter-summary'))
    )).toExist().withTimeout(10000);
    await waitFor(element(by.text('Wrong move')).atIndex(0)).toExist().withTimeout(10000);
    await element(by.id('history-result-all')).tap();
    await waitFor(element(
      by.text('Result: Wrong').withAncestor(by.id('history-active-filter-summary'))
    )).not.toExist().withTimeout(10000);

    // Replay round trip must preserve the non-default result and theme filters
    // while retaining the default Sprint source.
    await element(by.id('history-result-wrong')).tap();
    await waitFor(element(
      by.text('Result: Wrong').withAncestor(by.id('history-active-filter-summary'))
    )).toExist().withTimeout(10000);
    await waitForVisibleInPracticeScroll('history-source-sprint');
    await element(by.id('history-source-sprint')).tap();
    await waitFor(element(
      by.text('Source: Sprint').withAncestor(by.id('history-active-filter-summary'))
    )).toExist().withTimeout(10000);
    await waitForVisibleInPracticeScroll('history-theme-disclosure');
    await element(by.id('history-theme-disclosure')).tap();
    await waitForVisibleInPracticeScroll('history-theme-mate-in-2');
    await element(by.id('history-theme-mate-in-2')).tap();
    await waitForVisibleInPracticeScroll('history-theme-mate-in-3');
    await element(by.id('history-theme-mate-in-3')).tap();
    await waitFor(element(
      by.text('2 themes selected').withAncestor(by.id('history-active-filter-summary'))
    )).toExist().withTimeout(10000);
    await waitFor(element(by.text('Wrong move')).atIndex(0)).toExist().withTimeout(10000);

    const resultRowIdentifier = await historyAttemptRowTestIDForResult('Wrong move');
    await waitForVisibleInPracticeScroll(resultRowIdentifier);
    await element(by.id(resultRowIdentifier)).tap();
    await waitFor(element(by.id('review-session'))).toExist().withTimeout(10000);
    await expect(element(by.id('review-source-pill'))).not.toExist();
    await expect(element(by.id('review-theme-rail'))).not.toExist();
    await waitForVisibleInPracticeScroll('review-analysis-button');
    await element(by.id('review-analysis-button')).tap();
    await waitFor(element(by.id('review-theme-rail'))).toExist().withTimeout(10000);
    await expect(element(by.text('Themes'))).not.toExist();
    await waitForVisibleInPracticeScroll('review-close-analysis');
    await element(by.id('review-close-analysis')).tap();
    await waitFor(element(by.id('review-theme-rail'))).not.toExist().withTimeout(10000);
    await element(by.id('practice-main-scroll')).scrollTo('top');
    await waitFor(element(by.id('review-exit'))).toBeVisible().withTimeout(10000);
    await element(by.id('review-exit')).tap();
    await waitFor(element(by.id('history-panel'))).toExist().withTimeout(10000);
    await waitFor(element(
      by.text('Result: Wrong').withAncestor(by.id('history-active-filter-summary'))
    )).toExist().withTimeout(10000);
    await waitFor(element(
      by.text('Source: Sprint').withAncestor(by.id('history-active-filter-summary'))
    )).toExist().withTimeout(10000);
    await waitFor(element(
      by.text('2 themes selected').withAncestor(by.id('history-active-filter-summary'))
    )).toExist().withTimeout(10000);
    await waitFor(element(by.id('history-filter-reset'))).toBeVisible().withTimeout(10000);
    await expect(element(by.text('Reset filters'))).toExist();
    await element(by.id('history-filter-reset')).tap();
    await waitFor(element(
      by.text('All puzzles').withAncestor(by.id('history-active-filter-summary'))
    )).toExist().withTimeout(10000);
    await waitFor(element(
      by.text('Result: Wrong').withAncestor(by.id('history-active-filter-summary'))
    )).not.toExist().withTimeout(10000);
    await waitFor(element(
      by.text('Source: Sprint').withAncestor(by.id('history-active-filter-summary'))
    )).toExist().withTimeout(10000);
    await waitFor(element(
      by.text('2 themes selected').withAncestor(by.id('history-active-filter-summary'))
    )).not.toExist().withTimeout(10000);
  });

  it('adds and starts a saved custom Run', async () => {
    const flowFocusSelectTestID = await createSavedCustomRun('Flow Focus', { shorterDuration: true });
    await waitForVisibleInPracticeScroll(flowFocusSelectTestID);
    await element(by.id(flowFocusSelectTestID)).tap();
    await startSelectedPracticeRun();

    await element(by.id('session-abandon')).tap();
    await waitFor(element(by.id('session-abandon-confirmation'))).toBeVisible().withTimeout(5000);
    await element(by.id('session-abandon-confirm')).tap();
    await waitFor(element(by.id('sprint-summary-panel'))).toExist().withTimeout(30000);
    await expect(element(by.text('Sprint failed'))).toBeVisible();
  });

  it('persists rating, history, review queue, and saved Runs after relaunch', async () => {
    await failStandardSprint();
    await dismissSprintSummary();

    await openTab('practice-tab', 'practice-add-run');
    const persistentFocusSelectTestID = await createSavedCustomRun('Persistent Focus', {
      shorterDuration: true,
      themes: ['mate-in-2', 'fork']
    });
    await waitForVisibleInPracticeScroll(persistentFocusSelectTestID);
    await element(by.id(persistentFocusSelectTestID)).tap();
    await startSelectedPracticeRun();
    await element(by.id('session-abandon')).tap();
    await waitFor(element(by.id('session-abandon-confirmation'))).toBeVisible().withTimeout(5000);
    await element(by.id('session-abandon-confirm')).tap();
    await waitFor(element(by.id('sprint-summary-panel'))).toExist().withTimeout(30000);
    await expect(element(by.text('Sprint failed'))).toBeVisible();
    await dismissSprintSummary();

    await openTab('practice-tab', 'practice-add-run');
    await element(by.id('practice-run-home-edit')).tap();
    await element(by.id('practice-main-scroll')).scrollTo('top');
    await waitFor(element(by.id('practice-run-edit-standard'))).toBeVisible().withTimeout(10000);
    await element(by.id('practice-run-edit-standard')).tap();
    await waitFor(element(by.id('practice-run-name-input'))).toBeVisible().withTimeout(10000);
    await element(by.id('practice-run-name-input')).replaceText('Daily Standard');
    await dismissRunNameKeyboard();
    await element(by.id('practice-run-elo-input')).replaceText('700');
    await element(by.id('practice-run-save')).tap();
    await element(by.id('practice-main-scroll')).scrollTo('top');
    if (device.getPlatform() === 'android') {
      const doneEditingRuns = findUniqueAndroidUiNodeByLabel(
        readAndroidUiHierarchy(),
        'Finish editing runs'
      );
      tapAndroidUiNode(doneEditingRuns);
      await waitFor(element(by.id('practice-run-home-edit'))).toExist().withTimeout(10000);
    } else {
      await tapUntilExists('practice-run-home-done', 'practice-run-home-edit', 3);
    }
    await waitForElementTextContaining('practice-mode-standard-rating', '700', 5000);

    await device.terminateApp();
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: false
    });
    await selectTestPuzzleSource('familiar15');

    await openStandardHistoryTrend();

    await openTab('review-tab', 'review-due-card');
    await expectEmptyReviewTodaySections();

    await openTab('settings-tab', 'settings-app-version');
    await expect(element(by.id('settings-standard-elo-row'))).not.toExist();

    await openTab('practice-tab', 'practice-add-run');
    await waitFor(element(by.text('Persistent Focus'))).toExist().withTimeout(10000);
    await waitFor(element(by.text('Daily Standard'))).toExist().withTimeout(10000);
    await waitFor(element(by.text('Fork + Mate in 2 · 3 min · 20s pace')))
      .toExist()
      .withTimeout(10000);
    await waitForElementTextContaining('practice-mode-standard-rating', '700', 5000);
  });
});

async function expectEmptyReviewTodaySections() {
  const todayToReviewEmpty = element(by.id('review-today-to-review-empty'));
  await expect(todayToReviewEmpty).not.toBeVisible();
  await waitForVisibleInPracticeScroll('review-today-to-review-toggle');
  await element(by.id('review-today-to-review-toggle')).tap();
  await waitForVisibleInPracticeScroll('review-today-to-review-empty');
  await waitForVisibleInPracticeScroll('review-today-history-empty');
}

async function createSavedCustomRun(name, { shorterDuration = false, themes = [] } = {}) {
  await waitForVisibleInPracticeScroll('practice-add-run');
  await element(by.id('practice-add-run')).tap();
  await waitFor(element(by.id('practice-run-editor'))).toExist().withTimeout(10000);
  await element(by.id('practice-run-name-input')).replaceText(name);
  await dismissRunNameKeyboard();
  if (shorterDuration) {
    await waitForVisibleInPracticeScroll('practice-run-duration-stepper-decrease');
    await element(by.id('practice-run-duration-stepper-decrease')).tap();
  }
  if (themes.length > 0) {
    await expect(element(by.id('practice-run-theme-selection-detail'))).toHaveText('All themes');
    await expect(element(by.id(`custom-theme-${themes[0]}`))).not.toBeVisible();
    await element(by.id('practice-run-theme-disclosure')).tap();
  }
  for (const theme of themes) {
    await waitForVisibleInPracticeScroll(`custom-theme-${theme}`);
    await element(by.id(`custom-theme-${theme}`)).tap();
  }
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await tapUntilExists('practice-run-save', 'practice-run-home-edit', 3);
  const runName = element(by.text(name));
  await waitFor(runName).toExist().withTimeout(10000);
  const attributes = await runName.getAttributes();
  const candidates = Array.isArray(attributes) ? attributes : [attributes];
  const nameTestID = candidates
    .map((candidate) => candidate?.identifier)
    .find((identifier) => typeof identifier === 'string' && identifier.startsWith('practice-run-name-'));
  if (!nameTestID) {
    throw new Error(`Could not resolve selectable Run card for "${name}"`);
  }
  return nameTestID.replace('practice-run-name-', 'practice-run-select-');
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
  if (device.getPlatform() === 'android') {
    return developmentVersion.plannedPublicVersion;
  }
  return process.env.CHESSTICIZE_E2E_EXPECTED_VERSION_SOURCE === 'release'
    ? releaseVersion.iosPublicVersion
    : developmentVersion.plannedPublicVersion;
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
