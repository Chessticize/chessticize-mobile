const standardFixture = require('../../../fixtures/puzzles/android-standard-practice.fixture.json');
const {
  launchWithDisabledSynchronization,
  openTab,
  waitForElementTextContaining,
  waitForVisibleInPracticeScroll,
} = require('./helpers');

const EXPECTATION = process.env.CHESSTICIZE_BACKUP_EXPECTATION;
const EXPECTATION_NOW_MS = Object.freeze({
  'current-progress': '1784030700000',
  'released-fixture': '1780920000000',
});

describe(`Android Progress Backup restore (${EXPECTATION || 'missing expectation'})`, () => {
  beforeAll(async () => {
    if (!['current-progress', 'released-fixture'].includes(EXPECTATION)) {
      throw new Error(
        'CHESSTICIZE_BACKUP_EXPECTATION must be current-progress or released-fixture',
      );
    }
    await launchWithDisabledSynchronization({
      delete: false,
      newInstance: true,
      launchArgs: { chessticizeTestNowMs: EXPECTATION_NOW_MS[EXPECTATION] },
    });
  });

  it('opens restored progress through the current schema using public UI', async () => {
    await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);

    if (EXPECTATION === 'current-progress') {
      await waitForElementTextContaining(
        'practice-mode-standard-rating',
        String(standardFixture.expectedRatingAfter),
        10000,
      );
      await waitForElementTextContaining('practice-progress-weekly-solved', '1', 10000);
      await openTab('history-tab', 'history-action-header');
      await waitFor(element(by.text('Correct')).atIndex(0)).toExist().withTimeout(10000);
      return;
    }

    await waitForElementTextContaining('practice-mode-standard-rating', '710', 10000);
    await openTab('history-tab', 'history-action-header');
    await waitForVisibleInPracticeScroll('history-attempt-legacy-attempt-standard-wrong');
    await expect(element(by.id('history-attempt-legacy-attempt-standard-wrong-result')))
      .toHaveText('Wrong move');
  });
});
