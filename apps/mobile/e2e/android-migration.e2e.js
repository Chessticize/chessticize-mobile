const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const {
  launchWithDisabledSynchronization,
  openTab,
  waitForElementTextContaining,
  waitForVisibleInPracticeScroll,
} = require('./helpers');
const { androidAdbPath } = require('./androidNetwork');

const APP_ID = 'com.chessticize.mobile';
const FIXTURE_PATH = resolve(
  __dirname,
  '../../../packages/storage/test/fixtures/migrations/schema-v0-ios-1.0.0.sqlite',
);
const DEVICE_FIXTURE_PATH = '/data/local/tmp/chessticize-mobile-migration.sqlite';
const PROGRESS_DATABASE_PATH = 'databases/chessticize-mobile.sqlite';

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
  execFileSync(adb, ['-s', serial, 'push', FIXTURE_PATH, DEVICE_FIXTURE_PATH], { stdio: 'inherit' });
  try {
    runAs(adb, serial, ['mkdir', '-p', 'databases']);
    runAs(adb, serial, ['cp', DEVICE_FIXTURE_PATH, PROGRESS_DATABASE_PATH]);
  } finally {
    execFileSync(adb, ['-s', serial, 'shell', 'rm', '-f', DEVICE_FIXTURE_PATH], { stdio: 'inherit' });
  }
}

function runAs(adb, serial, command) {
  execFileSync(adb, ['-s', serial, 'shell', 'run-as', APP_ID, ...command], { stdio: 'inherit' });
}
