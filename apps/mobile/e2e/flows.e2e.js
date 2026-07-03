const {
  openTab,
  sleep,
  playBoardMove,
  startPracticeMode,
  selectTestPuzzleSource,
  waitForVisibleInPracticeScroll,
  waitForElementTextContaining,
  failStandardSprint
} = require('./helpers');

describe('Key user flows', () => {
  beforeEach(async () => {
    await device.launchApp({
      newInstance: true,
      delete: true,
      launchArgs: { detoxEnableSynchronization: '0' }
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

  it('submits an Arrow Duel candidate choice from the chips', async () => {
    await selectTestPuzzleSource('familiar15');
    await startPracticeMode('arrow-duel');
    await waitForVisibleInPracticeScroll('session-board');
    await waitFor(element(by.id('arrow-duel-candidate-a'))).toBeVisible().withTimeout(10000);

    await element(by.id('arrow-duel-candidate-a')).tap();
    await sleep(1500);

    // Candidate order is randomized per session, so chip A may be either the
    // correct or the wrong move: progress advances or a mistake is recorded.
    try {
      await waitFor(element(by.id('session-progress'))).toHaveText('1 / 10').withTimeout(5000);
    } catch (error) {
      await waitFor(element(by.label('Mistakes 1 of 3')).atIndex(0)).toExist().withTimeout(5000);
    }
  });

  it('schedules failed sprint mistakes into the review queue', async () => {
    await failStandardSprint();
    await dismissSprintSummary();

    // Mistakes schedule for the next day, so nothing is due yet: the empty
    // state must surface the next due estimate and offer practice instead.
    await openTab('review-tab', 'review-empty-state');
    await expect(element(by.id('review-empty-practice'))).toBeVisible();
  });

  it('shows failed attempts in history with the wrong-7-days shortcut', async () => {
    await failStandardSprint();
    await dismissSprintSummary();

    await openTab('history-tab', 'history-action-header');
    await waitFor(element(by.text('Wrong move')).atIndex(0)).toExist().withTimeout(10000);
    await expect(element(by.id('history-performance-card'))).toExist();

    // The Wrong 7d chip is the last item in the horizontal range chip strip.
    await waitFor(element(by.id('history-filter-wrong-7-days')))
      .toBeVisible()
      .whileElement(by.id('history-range-filters'))
      .scroll(120, 'right');
    await element(by.id('history-filter-wrong-7-days')).tap();
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
