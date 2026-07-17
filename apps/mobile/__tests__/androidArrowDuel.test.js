const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { validationStepsForApiLevel } = require('../scripts/android-validation-matrix');

const appRoot = join(__dirname, '..');
const repoRoot = join(appRoot, '../..');

function read(relativePath) {
  return readFileSync(join(appRoot, relativePath), 'utf8');
}

function readRepo(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('Android Arrow Duel release slice', () => {
  it('keeps the deterministic completion override behind the native test harness', () => {
    const app = read('App.tsx');
    const launchConfig = read('src/backend/testLaunchConfig.ts');
    const nativeLaunchConfig = read(
      'android/app/src/main/java/com/chessticize/mobile/ChessticizeTestLaunchConfigModule.kt'
    );
    const screen = read('src/components/PracticePocScreen.tsx');

    expect(launchConfig).toContain('resolveTestArrowDuelTargetCorrectFromLaunchConfig');
    expect(nativeLaunchConfig).toContain('chessticizeArrowDuelTargetCorrect');
    expect(nativeLaunchConfig).toContain('put("arrowDuelTargetCorrect", it)');
    expect(app).toContain('resolveTestArrowDuelTargetCorrectFromLaunchConfig()');
    expect(app).toContain('arrowDuelTargetCorrect={arrowDuelTargetCorrect}');
    expect(screen).toContain('nextMode === "arrow_duel" && arrowDuelTargetCorrect !== undefined');
  });

  it('runs the complete offline Arrow Duel journey through Android public UI', () => {
    const fixture = require('../../../fixtures/puzzles/android-arrow-duel.fixture.json');
    const journey = read('e2e/android-arrow-duel.e2e.js');
    const suiteConfig = read('e2e/suiteConfig.js');
    const workflow = readRepo('.github/workflows/mobile-android.yml');

    expect(fixture).toEqual(expect.objectContaining({
      puzzleSelectionSeed: 'android-arrow-duel:2',
      targetCorrect: 1,
      candidates: ['c3e4', 'h4f6'],
      wrongMove: 'c3e4',
      correctMove: 'h4f6',
      expectedRatingAfter: 775,
      puzzle: expect.objectContaining({ id: '03wH4' })
    }));
    expect(suiteConfig).toContain('android-arrow-duel.e2e.js');
    expect(suiteConfig).toContain("activeSuite === 'android-arrow-duel'");
    expect(journey).toContain('setAndroidNetworkEnabled(false)');
    expect(journey).toContain('resetAppState: true');
    expect(journey).toContain('chessticizeArrowDuelTargetCorrect');
    expect(journey).toContain('waitForElementAccessibilityLabelContaining');
    expect(journey).toContain('fixture.wrongMove');
    expect(journey).toContain('fixture.correctMove');
    expect(journey).toContain("by.id('move-feedback-overlay')");
    expect(journey).toContain("by.text('Sprint complete')");
    expect(journey).toContain("by.text('Sprint failed')");
    expect(journey).toContain("by.id('sprint-result-reason')");
    expect(journey).toContain('device.pressBack()');
    expect(journey).toContain('device.terminateApp()');
    expect(journey).toContain('deleteData: false');
    expect(journey).toContain("by.id('history-rating-arrow_duel 5/30')");
    expect(journey).not.toContain("by.id('history-rating-arrow duel 5/30')");
    expect(journey).toContain("by.id('review-analysis-button')");
    expect(journey).toContain("'history-attempt-detail-context', 'Arrow Duel · Sprint'");
    expect(journey).toContain("by.id('history-attempt-detail-rating-key')");
    expect(journey).toContain("'history-attempt-detail-moves', fixture.correctMove");
    expect(journey).toContain('review-analysis-engine-status');
    expect(journey).not.toContain('PracticeService');
    expect(journey).not.toContain('run-as');
    expect(validationStepsForApiLevel(36))
      .toContainEqual({ kind: 'detox', suite: 'android-arrow-duel' });
    expect(workflow).toContain('pnpm mobile:validate:android:matrix');
  });
});
