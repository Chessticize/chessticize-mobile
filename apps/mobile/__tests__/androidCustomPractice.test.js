const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { validationStepsForApiLevel } = require('../scripts/android-validation-matrix');

const appRoot = join(__dirname, '..');

function read(relativePath) {
  return readFileSync(join(appRoot, relativePath), 'utf8');
}

describe('Android Custom Practice release slice', () => {
  it('keeps the deterministic Custom target behind the maintained Android test boundary', () => {
    const app = read('App.tsx');
    const launchConfig = read('src/platform/testLaunchConfig.ts');
    const androidModule = read('android/app/src/main/java/com/chessticize/mobile/ChessticizeTestLaunchConfigModule.kt');

    expect(app).toContain('resolveTestCustomTargetCorrectFromLaunchConfig');
    expect(app).toContain('customTargetCorrect={customTargetCorrect}');
    expect(app).toContain('resolveTestPuzzleSelectionIdFromLaunchConfig');
    expect(app).toContain('puzzleSelectionId={puzzleSelectionId}');
    expect(launchConfig).toContain('customTargetCorrect?: string | number');
    expect(launchConfig).toContain('puzzleSelectionId?: string');
    expect(androidModule).toContain('chessticizeCustomTargetCorrect');
    expect(androidModule).toContain('chessticizePuzzleSelectionId');
    expect(androidModule).not.toContain('Log.');
  });

  it('runs one public Android journey through Custom completion, analysis, Back, and relaunch', () => {
    const spec = read('e2e/android-custom-practice.e2e.js');
    const suiteConfig = read('e2e/suiteConfig.js');
    const fixture = require('../../../fixtures/puzzles/android-standard-practice.fixture.json');

    expect(suiteConfig).toContain('android-custom-practice.e2e.js');
    expect(validationStepsForApiLevel(36))
      .toContainEqual({ kind: 'detox', suite: 'android-custom-practice' });
    expect(spec).toContain("by.id('practice-add-run')");
    expect(spec).toContain("by.id('practice-run-name-input')");
    expect(spec).toContain("by.id('practice-run-arrow-duel-reply-setting')");
    expect(spec).toContain("by.id('practice-run-theme-selection-detail')");
    expect(spec).toContain("by.id('practice-run-theme-disclosure')");
    expect(spec).toContain('expect(element(by.id(CUSTOM_RUN_THEME_TEST_ID))).not.toExist()');
    expect(spec).toContain('startSelectedPracticeRun,');
    expect(spec).toContain('await startSelectedPracticeRun();');
    expect(spec).not.toContain("await element(by.id('practice-run-start')).tap()");
    expect(spec).toContain('selectPracticeRunByName(CUSTOM_RUN_NAME)');
    expect(spec).toContain("'practice-run-select-'");
    expect(spec).not.toContain("element(by.text(CUSTOM_RUN_NAME)).tap()");
    expect(spec).toContain("findUniqueAndroidUiNodeByLabel(");
    expect(spec).toContain("`${CUSTOM_RUN_NAME} · 30s pace`");
    expect(spec).toContain('tapAndroidUiNode(customRatingFilter);');
    expect(spec).not.toContain('await customRatingFilter.tap();');
    expect(spec).toContain("by.id('history-performance-card')");
    expect(spec).toContain('android-standard-practice.fixture.json');
    expect(fixture.customRunTheme).toEqual({
      id: 'mate-in-2',
      label: 'Mate in 2',
      puzzleTheme: 'mateIn2',
    });
    expect(fixture.puzzle.themes).toContain(fixture.customRunTheme.puzzleTheme);
    expect(spec).toContain('practiceFixture.customRunTheme.id');
    expect(spec).toContain('chessticizePuzzleSelectionId: practiceFixture.puzzle.id');
    expect(spec).toContain("by.id('session-board')");
    expect(spec).toContain("waitForVisibleInPracticeScroll('practice-prompt')");
    expect(spec).toContain("by.text('For black.')");
    expect(spec).not.toContain('session-side-to-move');
    expect(spec).toContain("by.id('sprint-result-history-button')");
    expect(spec).toContain("const correctResult = element(by.text('Correct')).atIndex(0)");
    expect(spec).toContain('waitForVisibleInPracticeScroll(rowTestID)');
    expect(spec).toContain("expect(element(by.id('history-attempt-detail'))).not.toExist()");
    expect(spec).toContain("waitForVisibleInPracticeScroll('review-schedule-control')");
    expect(spec).toContain("by.id('review-analysis-button')");
    expect(spec).toContain("waitForElementTextContaining('review-analysis-engine-status'");
    expect(spec).toContain("waitForVisibleInPracticeScroll('practice-progress-summary')");
    expect(spec).toContain("waitForElementTextContaining('practice-progress-weekly-solved', '1'");
    expect(spec).toContain("'practice-progress-rating-delta'");
    expect(spec).toContain('device.pressBack()');
    expect(spec).toContain('device.terminateApp()');
    expect(spec).toContain('delete: false');
  });
});
