const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { validationStepsForApiLevel } = require('../scripts/android-validation-matrix');

const appRoot = join(__dirname, '..');
function readFromApp(relativePath) {
  return readFileSync(join(appRoot, relativePath), 'utf8');
}

describe('Android Practice History release slice', () => {
  it('runs persisted History filters, replay, Back, and relaunch through public Android UI', () => {
    const spec = readFromApp('e2e/android-history.e2e.js');
    const suiteConfig = readFromApp('e2e/suiteConfig.js');

    expect(suiteConfig).toContain('android-history.e2e.js');
    expect(suiteConfig).toContain("activeSuite === 'android-history'");
    expect(validationStepsForApiLevel(36))
      .toContainEqual({ kind: 'detox', suite: 'android-history' });
    expect(spec).toContain('failStandardSprint()');
    expect(spec).toContain("by.id('history-result-wrong')");
    expect(spec).toContain("historyAttemptRowTestIDForResult('Wrong move')");
    expect(spec).toContain("expect(element(by.id('history-attempt-detail'))).not.toExist()");
    expect(spec).toContain("waitForVisibleInPracticeScroll('review-schedule-control')");
    expect(spec).toContain("'review-analysis-button'");
    expect(spec).toContain('device.pressBack()');
    expect(spec).toContain('device.terminateApp()');
    expect(spec).toContain('delete: false');
    expect(spec).toContain("by.id('review-start-due')");
    expect(spec).toContain("playBoardMove('review-board', 'e2e6')");
    expect(spec).toContain("playBoardMove('review-board', 'e6f7')");
    expect(spec).toContain("by.id('history-source-review')");
    expect(spec).toContain("by.id('review-close-analysis')");
    expect(spec).not.toContain('PracticeService');
    expect(spec).not.toContain('run-as');
  });
});
