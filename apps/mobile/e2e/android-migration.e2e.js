const { execFileSync } = require('node:child_process');
const {
  launchWithDisabledSynchronization,
  openTab,
  waitForElementTextContaining,
  waitForVisibleInPracticeScroll,
} = require('./helpers');
const { androidAdbPath } = require('./androidNetwork');

const APP_ID = 'com.chessticize.mobile';
const FIXTURE_INSTALLER_CLASS =
  'com.chessticize.mobile.ReleasedDatabaseFixtureInstallerTest';
const TEST_RUNNER =
  'com.chessticize.mobile.test/androidx.test.runner.AndroidJUnitRunner';

describe('Android released SQLite migration', () => {
  beforeAll(async () => {
    await device.terminateApp();
    installReleasedProgressFixture();
    await launchWithDisabledSynchronization({
      delete: false,
      newInstance: true,
      launchArgs: { chessticizeTestNowMs: '1780920000000' },
    });
  });

  it('migrates a released progress database and exposes preserved state through public UI', async () => {
    await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
    await waitForElementTextContaining('practice-mode-standard-rating', '710', 10000);

    await openTab('history-tab', 'history-action-header');
    await waitForVisibleInPracticeScroll('history-attempt-legacy-attempt-standard-wrong');
    await expect(element(by.id('history-attempt-legacy-attempt-standard-wrong-result')))
      .toHaveText('Wrong move');
  });
});

function installReleasedProgressFixture() {
  const adb = androidAdbPath();
  const serial = process.env.DETOX_ANDROID_DEVICE || 'emulator-5554';
  execFileSync(adb, ['-s', serial, 'shell', 'pm', 'clear', APP_ID], { stdio: 'inherit' });
  execFileSync(
    adb,
    [
      '-s', serial,
      'shell', 'am', 'instrument', '-w', '-r',
      '-e', 'class', FIXTURE_INSTALLER_CLASS,
      TEST_RUNNER,
    ],
    { stdio: 'inherit' },
  );
  execFileSync(adb, ['-s', serial, 'shell', 'am', 'force-stop', APP_ID], {
    stdio: 'inherit',
  });
}
