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
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const shellTimeoutMs = options.shellTimeoutMs ?? DEFAULT_POLL_SHELL_TIMEOUT_MS;
  const deadline = now() + timeoutMs;
  let latest = '';

  while (now() < deadline) {
    const remainingMs = Math.max(1, deadline - now());
    latest = runShell(args, {
      ...(options.shellOptions ?? {}),
      now,
      shellTimeoutMs: Math.min(shellTimeoutMs, remainingMs),
      timeoutRecoveryDeadlineMs: deadline,
    });
    if (latest.includes(text) === present) {
      return latest;
    }

    const remainingAfterAttemptMs = deadline - now();
    if (remainingAfterAttemptMs > 0) {
      await sleep(Math.min(pollIntervalMs, remainingAfterAttemptMs));
    }
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

function defaultSleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

module.exports = {
  runAndroidAdbShell,
  waitForAndroidAdbShellText,
};
