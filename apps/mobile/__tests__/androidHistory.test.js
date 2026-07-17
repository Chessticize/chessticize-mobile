const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { validationStepsForApiLevel } = require('../scripts/android-validation-matrix');

const appRoot = join(__dirname, '..');
const repoRoot = join(appRoot, '../..');

function readFromApp(relativePath) {
  return readFileSync(join(appRoot, relativePath), 'utf8');
}

function readFromRepo(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('Android Practice History release slice', () => {
  it('runs persisted History filters, detail, Back, and relaunch through public Android UI', () => {
    const spec = readFromApp('e2e/android-history.e2e.js');
    const suiteConfig = readFromApp('e2e/suiteConfig.js');
    const workflow = readFromRepo('.github/workflows/mobile-android.yml');

    expect(suiteConfig).toContain('android-history.e2e.js');
    expect(suiteConfig).toContain("activeSuite === 'android-history'");
    expect(validationStepsForApiLevel(36))
      .toContainEqual({ kind: 'detox', suite: 'android-history' });
    expect(workflow).toContain('pnpm mobile:validate:android:matrix');
    expect(spec).toContain('failStandardSprint()');
    expect(spec).toContain("by.id('history-filter-wrong-only')");
    expect(spec).toContain("by.id('history-attempt-detail')");
    expect(spec).toContain("'history-attempt-detail-moves'");
    expect(spec).toContain("'review-analysis-button'");
    expect(spec).toContain('device.pressBack()');
    expect(spec).toContain('device.terminateApp()');
    expect(spec).toContain('delete: false');
    expect(spec).toContain("by.id('review-start-due')");
    expect(spec).toContain("playBoardMove('review-board', 'e2e6')");
    expect(spec).toContain("playBoardMove('review-board', 'e6f7')");
    expect(spec).toContain("by.id('history-source-review')");
    expect(spec).toContain("'history-attempt-detail-context', 'Standard · Review'");
    expect(spec).toContain("'history-attempt-detail-moves', 'Played e6f7 · Best e6f7'");
    expect(spec).toContain("'history-attempt-detail-timing', 'Jul 15, 2026'");
    expect(spec).toContain("by.id('review-close-analysis')");
    expect(spec).not.toContain('PracticeService');
    expect(spec).not.toContain('run-as');
  });
});
