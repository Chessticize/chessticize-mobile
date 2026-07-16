const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const appRoot = join(__dirname, '..');

function read(relativePath) {
  return readFileSync(join(appRoot, relativePath), 'utf8');
}

describe('Android Custom Practice release slice', () => {
  it('keeps the deterministic Custom target behind the maintained Android test boundary', () => {
    const app = read('App.tsx');
    const launchConfig = read('src/backend/testLaunchConfig.ts');
    const androidModule = read('android/app/src/main/java/com/chessticize/mobile/ChessticizeTestLaunchConfigModule.kt');

    expect(app).toContain('resolveTestCustomTargetCorrectFromLaunchConfig');
    expect(app).toContain('customTargetCorrect={customTargetCorrect}');
    expect(launchConfig).toContain('customTargetCorrect?: string | number');
    expect(androidModule).toContain('chessticizeCustomTargetCorrect');
    expect(androidModule).not.toContain('Log.');
  });

  it('runs one public Android journey through Custom completion, analysis, Back, and relaunch', () => {
    const spec = read('e2e/android-custom-practice.e2e.js');
    const suiteConfig = read('e2e/suiteConfig.js');
    const workflow = read('../../.github/workflows/mobile-android.yml');

    expect(suiteConfig).toContain('android-custom-practice.e2e.js');
    expect(workflow).toContain('DETOX_ACTIVE_SUITE=android-custom-practice');
    expect(spec).toContain("by.id('practice-mode-custom')");
    expect(spec).toContain('android-standard-practice.fixture.json');
    expect(spec).toContain("by.id('session-board')");
    expect(spec).toContain("by.id('sprint-result-history-button')");
    expect(spec).toContain("by.id('review-analysis-button')");
    expect(spec).toContain("waitForElementTextContaining('review-analysis-engine-status'");
    expect(spec).toContain('device.pressBack()');
    expect(spec).toContain('device.terminateApp()');
    expect(spec).toContain('delete: false');
  });
});
