const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const {
  launchWithDisabledSynchronization,
  openTab,
  waitForElementTextContaining,
  waitForVisibleInPracticeScroll,
} = require('./helpers');

const APP_ID = 'com.chessticize.mobile';
const FIXTURE_PATH = resolve(
  __dirname,
  '../../../packages/storage/test/fixtures/migrations/schema-v0-ios-1.0.0.sqlite',
);

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
      '-s',
      serial,
      'shell',
      'run-as',
      APP_ID,
      'sh',
      '-c',
      'mkdir -p databases && cat > databases/chessticize-mobile.sqlite',
    ],
    { input: readFileSync(FIXTURE_PATH) },
  );
}

function androidAdbPath() {
  if (process.env.ADB_PATH) {
    return process.env.ADB_PATH;
  }
  const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdkRoot) {
    throw new Error('ANDROID_HOME or ANDROID_SDK_ROOT is required for Android E2E.');
  }
  return join(sdkRoot, 'platform-tools', 'adb');
}
