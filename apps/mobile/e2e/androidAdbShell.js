const { execFileSync: nodeExecFileSync } = require('node:child_process');
const { androidAdbPath } = require('./androidNetwork');

const DEFAULT_SHELL_TIMEOUT_MS = 30_000;
const ADB_WAIT_FOR_DEVICE_TIMEOUT_MS = 5_000;
const ADB_RESPONSIVENESS_TIMEOUT_MS = 2_000;
const ADB_RESPONSIVENESS_MARKER = 'chessticize-adb-shell-ready';
const DEFAULT_POLL_INTERVAL_MS = 400;
const DEFAULT_POLL_SHELL_TIMEOUT_MS = 5_000;

function runAndroidAdbShell(args, options = {}) {
  const environment = options.environment ?? process.env;
  const execFileSync = options.execFileSync ?? nodeExecFileSync;
  const now = options.now ?? Date.now;
  const shellTimeoutMs = options.shellTimeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS;
  const timeoutRecoveryDeadlineMs = options.timeoutRecoveryDeadlineMs;
  const adb = androidAdbPath(environment);
  const serial = environment.DETOX_ANDROID_DEVICE || 'emulator-5554';
  const shellArgs = ['-s', serial, 'shell', ...args];
  const runShell = (timeout = shellTimeoutMs) => String(execFileSync(adb, shellArgs, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout,
  }) ?? '');

  try {
    return runShell();
  } catch (error) {
    if (isAdbDeviceOffline(error)) {
      const waitTimeout = recoveryTimeout(
        timeoutRecoveryDeadlineMs,
        now,
        ADB_WAIT_FOR_DEVICE_TIMEOUT_MS
      );
      if (waitTimeout === null) {
        throw error;
      }
      execFileSync(adb, ['-s', serial, 'wait-for-device'], {
        encoding: 'utf8',
        timeout: waitTimeout,
      });
      const retryTimeout = recoveryTimeout(timeoutRecoveryDeadlineMs, now, shellTimeoutMs);
      if (retryTimeout === null) {
        throw error;
      }
      return runShell(retryTimeout);
    }

    if (!isAdbShellTimeout(error) || !Number.isFinite(timeoutRecoveryDeadlineMs)) {
      throw error;
    }

    const waitTimeout = recoveryTimeout(
      timeoutRecoveryDeadlineMs,
      now,
      ADB_WAIT_FOR_DEVICE_TIMEOUT_MS
    );
    if (waitTimeout === null) {
      throw error;
    }
    execFileSync(adb, ['-s', serial, 'wait-for-device'], {
      encoding: 'utf8',
      timeout: waitTimeout,
    });

    const probeTimeout = recoveryTimeout(
      timeoutRecoveryDeadlineMs,
      now,
      ADB_RESPONSIVENESS_TIMEOUT_MS
    );
    if (probeTimeout === null) {
      throw error;
    }
    const probe = String(execFileSync(
      adb,
      ['-s', serial, 'shell', 'echo', ADB_RESPONSIVENESS_MARKER],
      {
        encoding: 'utf8',
        timeout: probeTimeout,
      }
    ) ?? '');
    if (probe.trim() !== ADB_RESPONSIVENESS_MARKER) {
      throw error;
    }

    const retryTimeout = recoveryTimeout(timeoutRecoveryDeadlineMs, now, shellTimeoutMs);
    if (retryTimeout === null) {
      throw error;
    }
    return runShell(retryTimeout);
  }
}

async function waitForAndroidAdbShellText(args, text, present, timeoutMs, options = {}) {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const runShell = options.runShell ?? runAndroidAdbShell;
  const activeNotification = options.activeNotification;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const shellTimeoutMs = options.shellTimeoutMs ?? DEFAULT_POLL_SHELL_TIMEOUT_MS;
  const deadline = now() + timeoutMs;
  let latest = '';
  let latestActiveState = '';
  let latestActiveRecord = '';

  while (now() < deadline) {
    if (activeNotification) {
      const activeStateOptions = pollingShellOptions(
        deadline,
        now,
        shellTimeoutMs,
        options.shellOptions
      );
      if (activeStateOptions === null) {
        break;
      }
      latestActiveState = runShell(['cmd', 'notification', 'list'], activeStateOptions);
      const activeCount = countActiveAndroidNotifications(
        latestActiveState,
        activeNotification
      );
      if (!present && activeCount === 0) {
        return latestActiveState;
      }
      if (activeCount !== 1) {
        await sleepUntilNextPoll(deadline, now, pollIntervalMs, sleep);
        continue;
      }
      if (!present) {
        await sleepUntilNextPoll(deadline, now, pollIntervalMs, sleep);
        continue;
      }
    }

    const dumpOptions = pollingShellOptions(
      deadline,
      now,
      shellTimeoutMs,
      options.shellOptions
    );
    if (dumpOptions === null) {
      break;
    }
    latest = runShell(args, dumpOptions);
    latestActiveRecord = activeNotification
      ? findActiveAndroidNotificationRecord(latest, activeNotification)
      : '';
    const shellStateMatches = activeNotification
      ? activeAndroidNotificationRecordMatches(
        latestActiveRecord,
        activeNotification,
        text
      )
      : latest.includes(text) === present;
    if (shellStateMatches) {
      return latest;
    }

    await sleepUntilNextPoll(deadline, now, pollIntervalMs, sleep);
  }

  if (activeNotification) {
    throw new Error(
      `Expected active Android notification ${activeNotification.packageName}/`
      + `${activeNotification.notificationId} to ${present ? 'contain' : 'omit'} ${text}. `
      + `Latest active state: ${latestActiveState.trimEnd() || '<empty>'}. `
      + `Latest matching active record: ${latestActiveRecord.trimEnd() || '<none>'}`
    );
  }
  throw new Error(
    `Expected shell ${args.join(' ')} to ${present ? 'contain' : 'omit'} ${text}. `
    + `Latest: ${latest.trimEnd()}`
  );
}

function isAdbDeviceOffline(error) {
  const failureText = [error?.stderr, error?.stdout, error?.message]
    .filter((value) => value !== undefined && value !== null)
    .map(String)
    .join('\n');
  return /(?:^|\n)(?:adb:|error:)\s*device offline\s*(?:\n|$)/i.test(failureText);
}

function isAdbShellTimeout(error) {
  return error?.code === 'ETIMEDOUT'
    && error?.status === null
    && error?.signal === 'SIGTERM';
}

function recoveryTimeout(deadlineMs, now, maximumMs) {
  if (!Number.isFinite(deadlineMs)) {
    return maximumMs;
  }
  const remainingMs = Math.floor(deadlineMs - now());
  return remainingMs > 0 ? Math.min(maximumMs, remainingMs) : null;
}

function pollingShellOptions(deadline, now, shellTimeoutMs, shellOptions) {
  const remainingMs = Math.floor(deadline - now());
  if (remainingMs <= 0) {
    return null;
  }
  return {
    ...(shellOptions ?? {}),
    now,
    shellTimeoutMs: Math.min(shellTimeoutMs, remainingMs),
    timeoutRecoveryDeadlineMs: deadline,
  };
}

function countActiveAndroidNotifications(state, notification) {
  const marker = `|${notification.packageName}|${notification.notificationId}|`;
  return state
    .split('\n')
    .filter((line) => line.includes(marker))
    .length;
}

function findActiveAndroidNotificationRecord(state, notification) {
  const lines = state.split('\n');
  let inNotificationList = false;
  let matchingRecord = null;

  for (const line of lines) {
    if (!inNotificationList) {
      inNotificationList = /^ {2}Notification List:\s*$/.test(line);
      continue;
    }
    if (/^ {2}\S/.test(line)) {
      break;
    }
    if (/^ {4}NotificationRecord\(/.test(line)) {
      if (matchingRecord !== null) {
        break;
      }
      matchingRecord = notificationRecordHeaderMatches(line, notification) ? [line] : null;
      continue;
    }
    if (matchingRecord !== null) {
      matchingRecord.push(line);
    }
  }

  return matchingRecord?.join('\n') ?? '';
}

function notificationRecordHeaderMatches(header, notification) {
  const packageMarker = `pkg=${notification.packageName} `;
  const idMarker = `id=${notification.notificationId} `;
  return header.includes(packageMarker) && header.includes(idMarker);
}

function activeAndroidNotificationRecordMatches(record, notification, body) {
  if (!record || typeof notification.title !== 'string') {
    return false;
  }
  const titleMatches = notificationRecordFieldMatches(
    record,
    'android.title',
    notification.title
  );
  const bodyMatches = notificationRecordFieldMatches(record, 'android.text', body)
    || notificationRecordFieldMatches(record, 'android.bigText', body);
  return titleMatches && bodyMatches;
}

function notificationRecordFieldMatches(record, field, value) {
  return record.includes(`${field}=String (${value})`);
}

async function sleepUntilNextPoll(deadline, now, pollIntervalMs, sleep) {
  const remainingMs = deadline - now();
  if (remainingMs > 0) {
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
}

function defaultSleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

module.exports = {
  countActiveAndroidNotifications,
  runAndroidAdbShell,
  waitForAndroidAdbShellText,
};
