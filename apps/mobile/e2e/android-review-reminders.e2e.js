const fs = require('node:fs');
const path = require('node:path');
const {
  runAndroidAdbShell,
  waitForAndroidAdbShellText,
} = require('./androidAdbShell');
const {
  androidAppIsResumed,
  failStandardSprint,
  findAndroidSystemNode,
  findPendingAndroidAlarms,
  launchWithDisabledSynchronization,
  launchWithFreshAndroidRuntimePermission,
  openTab,
  sleep,
  waitForElementTextContaining,
  waitForVisibleInPracticeScroll,
  withAndroidUiDiagnostics,
} = require('./helpers');

const APP_ID = 'com.chessticize.mobile';
const PERMISSION = 'android.permission.POST_NOTIFICATIONS';
const REMINDER_ACTION = 'com.chessticize.mobile.action.DELIVER_REVIEW_REMINDER';
const ARTIFACT_DIR = path.resolve(__dirname, '../artifacts/android-review-reminders');
const REMINDER_DELAY_MS = 10_000;
const REVIEW_NOTIFICATION_ID = '182';

describe('Android Review reminders through public and system surfaces', () => {
  beforeAll(() => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  beforeEach(async () => {
    await launchWithFreshAndroidRuntimePermission(resetNotificationPermission);
    await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
  });

  it('requests permission from Settings, preserves denial, and opens recoverable Android settings', async () => {
    await withAndroidUiDiagnostics(async () => {
      await openTab('settings-tab', 'settings-review-reminders');
      await waitForElementTextContaining('settings-review-reminders', 'Permission not requested', 10000);

      await waitForVisibleInPracticeScroll('settings-review-reminder-enable');
      await element(by.id('settings-review-reminder-enable')).tap();
      await tapPermissionSystemNode(['permission_deny_button', "Don’t allow", "Don't allow"]);

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
      await tapPermissionSystemNode(['permission_allow_button', 'Allow']);
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
      await tapNotificationSystemNode(['3 reviews are ready', 'Chessticize']);
      await waitFor(element(by.id('review-panel'))).toExist().withTimeout(180000);
      recordSystemEvidence('cold-tap-route');

      // Rescheduling through the product UI while the process is foregrounded
      // exercises the same one-shot alarm and event-listener route. Changing
      // the host timezone makes Android emit its real TIMEZONE_CHANGED system
      // broadcast so reconstruction is covered without targeting app code.
      const originalTimezone = deviceTimezone();
      const changedTimezone = originalTimezone === 'America/New_York'
        ? 'America/Los_Angeles'
        : 'America/New_York';
      await openTab('settings-tab', 'settings-review-reminders');
      await waitForVisibleInPracticeScroll('settings-review-reminder-smart');
      await element(by.id('settings-review-reminder-smart')).tap();
      await waitForShellText(['dumpsys', 'alarm'], REMINDER_ACTION, true, 5000);
      const alarmBeforeTimezone = pendingReviewAlarmSnapshot();
      await sleep(1_000);
      await setDeviceTimezone(changedTimezone);
      const alarmAfterTimezone = await waitForReviewAlarmRebased(alarmBeforeTimezone, 5000);
      recordAlarmReconstructionEvidence(alarmBeforeTimezone, alarmAfterTimezone);
      await waitForNotification('3 reviews are ready', 20000);
      assertActiveReviewNotificationCount(1);
      adbShell(['cmd', 'statusbar', 'expand-notifications']);
      await tapNotificationSystemNode(['3 reviews are ready', 'Chessticize']);
      await waitFor(element(by.id('review-panel'))).toExist().withTimeout(30000);
      recordSystemEvidence('foreground-tap-route');

      await openTab('settings-tab', 'settings-review-reminders');
      await waitForVisibleInPracticeScroll('settings-review-reminder-off');
      await element(by.id('settings-review-reminder-off')).tap();
      await waitForElementTextContaining('settings-review-reminders', 'Reminders are off', 10000);
      await setDeviceTimezone(originalTimezone);
      await sleep(REMINDER_DELAY_MS + 2_000);
      assertNotificationAbsent('3 reviews are ready');
      assertActiveReviewNotificationCount(0);

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
  return runAndroidAdbShell(args);
}

function resetNotificationPermission() {
  adbShell(['pm', 'revoke', APP_ID, PERMISSION]);
  adbShell(['pm', 'clear-permission-flags', APP_ID, PERMISSION, 'user-set']);
  adbShell(['pm', 'clear-permission-flags', APP_ID, PERMISSION, 'user-fixed']);
}

function deviceTimezone() {
  return adbShell(['getprop', 'persist.sys.timezone']).trim() || 'UTC';
}

async function setDeviceTimezone(timezone) {
  adbShell(['cmd', 'alarm', 'set-timezone', timezone]);
  await waitForShellText(['getprop', 'persist.sys.timezone'], timezone, true, 5000);
}

async function tapSystemNode(candidates, timeoutMs = 15_000, options = {}) {
  const node = await waitForSystemNode(candidates, timeoutMs, options);
  const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!bounds) {
    throw new Error(`System node has no tappable bounds: ${node}`);
  }
  const centerX = Math.round((Number(bounds[1]) + Number(bounds[3])) / 2);
  const centerY = Math.round((Number(bounds[2]) + Number(bounds[4])) / 2);
  adbShell(['input', 'tap', String(centerX), String(centerY)]);
}

async function tapPermissionSystemNode(candidates, timeoutMs = 15_000) {
  await tapSystemNode(candidates, timeoutMs, { exact: true });
}

async function tapNotificationSystemNode(candidates, timeoutMs = 15_000) {
  await tapSystemNode(candidates, timeoutMs, { clickableAncestor: true });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (androidAppIsResumed()) {
      return;
    }
    await sleep(200);
  }
  throw new Error('Notification tap did not resume the Chessticize app');
}

async function waitForSystemNode(candidates, timeoutMs = 15_000, options = {}) {
  const deadline = Date.now() + timeoutMs;
  let latest = '';
  while (Date.now() < deadline) {
    adbShell(['uiautomator', 'dump', '/sdcard/chessticize-reminder-window.xml']);
    latest = adbShell(['cat', '/sdcard/chessticize-reminder-window.xml']);
    const found = findAndroidSystemNode(latest, candidates, options);
    if (found) {
      return found;
    }
    await sleep(400);
  }
  throw new Error(`System UI did not expose ${candidates.join(' or ')}. Latest hierarchy: ${latest}`);
}

async function waitForNotification(text, timeoutMs) {
  await waitForAndroidAdbShellText(
    ['dumpsys', 'notification', '--noredact'],
    text,
    true,
    timeoutMs
  );
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

function pendingReviewAlarmSnapshot() {
  const state = adbShell(['dumpsys', 'alarm']);
  const matches = findPendingAndroidAlarms(state, REMINDER_ACTION);

  if (matches.length !== 1) {
    throw new Error(`Expected exactly one pending review alarm, found ${matches.length}. State:\n${state}`);
  }
  return matches[0];
}

async function waitForReviewAlarmRebased(before, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latestError;
  while (Date.now() < deadline) {
    try {
      const after = pendingReviewAlarmSnapshot();
      if (after.identity === before.identity && after.triggerMs > before.triggerMs + 500) {
        return after;
      }
      latestError = new Error(
        `Alarm was not rebased: before=${before.triggerMs}/${before.identity}; `
        + `after=${after.triggerMs}/${after.identity}`
      );
    } catch (error) {
      latestError = error;
    }
    await sleep(200);
  }
  throw latestError ?? new Error('Timed out waiting for the review alarm to be rebased');
}

function assertActiveReviewNotificationCount(expected) {
  const state = adbShell(['cmd', 'notification', 'list']);
  const count = state
    .split('\n')
    .filter((line) => line.includes(`|${APP_ID}|${REVIEW_NOTIFICATION_ID}|`))
    .length;
  if (count !== expected) {
    throw new Error(`Expected ${expected} active review notifications, found ${count}. State:\n${state}`);
  }
}

function recordAlarmReconstructionEvidence(before, after) {
  const evidence = [
    `recorded-at=${new Date().toISOString()}`,
    `before-trigger-ms=${before.triggerMs}`,
    `after-trigger-ms=${after.triggerMs}`,
    `identity=${before.identity}`,
    'before:',
    before.raw,
    'after:',
    after.raw,
  ].join('\n');
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'timezone-alarm-reconstruction.txt'), evidence);
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
