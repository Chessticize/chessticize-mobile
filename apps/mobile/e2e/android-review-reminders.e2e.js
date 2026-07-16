const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { androidAdbPath } = require('./androidNetwork');
const {
  failStandardSprint,
  launchWithDisabledSynchronization,
  openTab,
  sleep,
  waitForElementTextContaining,
  waitForVisibleInPracticeScroll,
  withAndroidUiDiagnostics,
} = require('./helpers');

const APP_ID = 'com.chessticize.mobile';
const PERMISSION = 'android.permission.POST_NOTIFICATIONS';
const REMINDER_ACTION = 'com.chessticize.mobile.action.DELIVER_REVIEW_REMINDER';
const LIFECYCLE_RECEIVER = `${APP_ID}/.ReviewReminderLifecycleReceiver`;
const ARTIFACT_DIR = path.resolve(__dirname, '../artifacts/android-review-reminders');
const REMINDER_DELAY_MS = 10_000;

describe('Android Review reminders through public and system surfaces', () => {
  beforeAll(() => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  beforeEach(async () => {
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: true,
    });
    await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
  });

  it('requests permission from Settings, preserves denial, and opens recoverable Android settings', async () => {
    await withAndroidUiDiagnostics(async () => {
      await openTab('settings-tab', 'settings-review-reminders');
      await waitForElementTextContaining('settings-review-reminders', 'Permission not requested', 10000);

      await waitForVisibleInPracticeScroll('settings-review-reminder-enable');
      await element(by.id('settings-review-reminder-enable')).tap();
      await tapSystemNode(['permission_deny_button', "Don’t allow", "Don't allow"]);

      await waitForElementTextContaining(
        'settings-review-reminders',
        'Blocked in Android notification settings',
        10000
      );
      await waitForVisibleInPracticeScroll('settings-review-reminder-open-settings');
      await element(by.id('settings-review-reminder-open-settings')).tap();
      await waitForSystemNode(['Chessticize', 'Notifications']);

      adbShell(['pm', 'grant', APP_ID, PERMISSION]);
      adbShell(['input', 'keyevent', 'KEYCODE_BACK']);
      await waitFor(element(by.id('settings-panel'))).toExist().withTimeout(10000);
      await waitForElementTextContaining('settings-review-reminders', 'No review work is scheduled', 10000);

      recordSystemEvidence('permission-recovery');
    });
  });

  it('delivers and routes cold and foreground notifications, then stays disabled across events and relaunch', async () => {
    await withAndroidUiDiagnostics(async () => {
      const sprintNowMs = Date.now() - (2 * 24 * 60 * 60 * 1000);
      await launchWithDisabledSynchronization({
        newInstance: true,
        delete: false,
        launchArgs: {
          chessticizeTestNowMs: String(sprintNowMs),
          chessticizeTestReminderDelayMs: String(REMINDER_DELAY_MS),
        },
      });
      await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);

      await openTab('settings-tab', 'settings-review-reminders');
      await waitForVisibleInPracticeScroll('settings-review-reminder-enable');
      await element(by.id('settings-review-reminder-enable')).tap();
      await tapSystemNode(['permission_allow_button', 'Allow']);
      await waitForElementTextContaining('settings-review-reminders', 'No review work is scheduled', 10000);

      // Keep the policy disabled while public practice creates due work. This
      // prevents the compressed E2E alarm from racing the in-progress sprint;
      // selecting Fixed below is the action that should schedule delivery.
      await waitForVisibleInPracticeScroll('settings-review-reminder-off');
      await element(by.id('settings-review-reminder-off')).tap();
      await waitForElementTextContaining('settings-review-reminders', 'Reminders are off', 10000);

      await openTab('practice-tab', 'practice-mode-standard');
      await failStandardSprint();
      await element(by.id('back-practice-button')).tap();
      await waitFor(element(by.id('practice-tab'))).toBeVisible().withTimeout(10000);

      await openTab('settings-tab', 'settings-review-reminders');
      await waitForVisibleInPracticeScroll('settings-review-reminder-fixed-1900');
      await element(by.id('settings-review-reminder-fixed-1900')).tap();
      await waitForElementTextContaining('settings-review-reminders', 'Android may deliver later', 10000);
      await waitForShellText(['dumpsys', 'alarm'], REMINDER_ACTION, true, 5000);

      // Background and kill the process without force-stopping the package, so
      // the real AlarmManager receiver owns the cold notification delivery.
      adbShell(['input', 'keyevent', 'KEYCODE_HOME']);
      await sleep(500);
      adbShell(['am', 'kill', APP_ID]);
      await waitForNotification('3 reviews are ready', 20000);
      adbShell(['cmd', 'statusbar', 'expand-notifications']);
      await tapSystemNode(['3 reviews are ready', 'Chessticize']);
      await waitFor(element(by.id('review-panel'))).toExist().withTimeout(180000);
      recordSystemEvidence('cold-tap-route');

      // Rescheduling through the product UI while the process is foregrounded
      // exercises the same one-shot alarm and event-listener route.
      await openTab('settings-tab', 'settings-review-reminders');
      await waitForVisibleInPracticeScroll('settings-review-reminder-smart');
      await element(by.id('settings-review-reminder-smart')).tap();
      await waitForShellText(['dumpsys', 'alarm'], REMINDER_ACTION, true, 5000);
      await waitForNotification('3 reviews are ready', 20000);
      adbShell(['cmd', 'statusbar', 'expand-notifications']);
      await tapSystemNode(['3 reviews are ready', 'Chessticize']);
      await waitFor(element(by.id('review-panel'))).toExist().withTimeout(30000);
      recordSystemEvidence('foreground-tap-route');

      await openTab('settings-tab', 'settings-review-reminders');
      await waitForVisibleInPracticeScroll('settings-review-reminder-off');
      await element(by.id('settings-review-reminder-off')).tap();
      await waitForElementTextContaining('settings-review-reminders', 'Reminders are off', 10000);
      adbShell([
        'am', 'broadcast',
        '-a', 'android.intent.action.TIMEZONE_CHANGED',
        '-n', LIFECYCLE_RECEIVER,
      ]);
      await sleep(REMINDER_DELAY_MS + 2_000);
      assertNotificationAbsent('3 reviews are ready');

      await launchWithDisabledSynchronization({
        newInstance: true,
        delete: false,
        launchArgs: {
          chessticizeTestNowMs: String(sprintNowMs),
          chessticizeTestReminderDelayMs: String(REMINDER_DELAY_MS),
        },
      });
      await openTab('settings-tab', 'settings-review-reminders');
      await waitForElementTextContaining('settings-review-reminders', 'Reminders are off', 10000);
      await sleep(REMINDER_DELAY_MS + 2_000);
      assertNotificationAbsent('3 reviews are ready');
      recordSystemEvidence('disabled-after-event-relaunch');
    });
  });
});

function adbShell(args) {
  return String(execFileSync(adbPath(), ['-s', serial(), 'shell', ...args], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30_000,
  }) ?? '');
}

function adbPath() {
  return androidAdbPath(process.env);
}

function serial() {
  return process.env.DETOX_ANDROID_DEVICE || 'emulator-5554';
}

async function tapSystemNode(candidates, timeoutMs = 15_000) {
  const node = await waitForSystemNode(candidates, timeoutMs);
  const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!bounds) {
    throw new Error(`System node has no tappable bounds: ${node}`);
  }
  const centerX = Math.round((Number(bounds[1]) + Number(bounds[3])) / 2);
  const centerY = Math.round((Number(bounds[2]) + Number(bounds[4])) / 2);
  adbShell(['input', 'tap', String(centerX), String(centerY)]);
}

async function waitForSystemNode(candidates, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let latest = '';
  while (Date.now() < deadline) {
    adbShell(['uiautomator', 'dump', '/sdcard/chessticize-reminder-window.xml']);
    latest = adbShell(['cat', '/sdcard/chessticize-reminder-window.xml']);
    const nodes = latest.match(/<node\b[^>]*\/>/g) ?? [];
    const found = nodes.find((node) => candidates.some((candidate) =>
      node.toLowerCase().includes(String(candidate).toLowerCase())
    ));
    if (found) {
      return found;
    }
    await sleep(400);
  }
  throw new Error(`System UI did not expose ${candidates.join(' or ')}. Latest hierarchy: ${latest}`);
}

async function waitForNotification(text, timeoutMs) {
  await waitForShellText(['dumpsys', 'notification', '--noredact'], text, true, timeoutMs);
}

async function waitForShellText(args, text, present, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest = '';
  while (Date.now() < deadline) {
    latest = adbShell(args);
    if (latest.includes(text) === present) {
      return latest;
    }
    await sleep(400);
  }
  throw new Error(`Expected shell ${args.join(' ')} to ${present ? 'contain' : 'omit'} ${text}. Latest: ${latest}`);
}

function assertNotificationAbsent(text) {
  const state = adbShell(['dumpsys', 'notification', '--noredact']);
  if (state.includes(`android.title=String (${text})`) || state.includes(`android.text=String (${text})`)) {
    throw new Error(`Unexpected active review reminder after disabling: ${text}`);
  }
}

function recordSystemEvidence(name) {
  const evidence = [
    `name=${name}`,
    `recorded-at=${new Date().toISOString()}`,
    adbShell(['dumpsys', 'package', APP_ID]),
    adbShell(['dumpsys', 'alarm']),
    adbShell(['dumpsys', 'notification', '--noredact']),
  ].join('\n\n');
  fs.writeFileSync(path.join(ARTIFACT_DIR, `${name}.txt`), evidence);
}
