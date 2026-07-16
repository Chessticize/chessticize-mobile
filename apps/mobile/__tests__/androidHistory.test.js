const { readFileSync } = require('node:fs');
const { join } = require('node:path');

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
    expect(workflow).toContain('DETOX_ACTIVE_SUITE=android-history pnpm mobile:e2e:test:android:ci');
    expect(spec).toContain('failStandardSprint()');
    expect(spec).toContain("by.id('history-filter-wrong-only')");
    expect(spec).toContain("by.id('history-attempt-detail')");
    expect(spec).toContain("'history-attempt-detail-moves'");
    expect(spec).toContain("'review-analysis-button'");
    expect(spec).toContain('device.pressBack()');
    expect(spec).toContain('device.terminateApp()');
    expect(spec).toContain('delete: false');
    expect(spec).not.toContain('PracticeService');
    expect(spec).not.toContain('run-as');
  });
});
