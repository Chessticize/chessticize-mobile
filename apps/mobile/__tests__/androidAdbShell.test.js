const {
  runAndroidAdbShell,
  waitForAndroidNotificationIdentity,
} = require('../e2e/androidAdbShell');

const environment = {
  ADB_PATH: '/sdk/adb',
  DETOX_ANDROID_DEVICE: 'emulator-5554',
};
const reviewNotification = Object.freeze({
  notificationId: '182',
  packageName: 'com.chessticize.mobile',
  title: 'Chessticize',
});

function offlineError(message = 'adb: device offline') {
  return Object.assign(new Error(message), {
    status: 1,
    stderr: `${message}\n`,
    stdout: '',
  });
}

function timedOutShellError() {
  return Object.assign(new Error('spawnSync /sdk/adb ETIMEDOUT'), {
    code: 'ETIMEDOUT',
    errno: -110,
    path: '/sdk/adb',
    signal: 'SIGTERM',
    spawnargs: [
      '-s',
      'emulator-5554',
      'shell',
      'dumpsys',
      'notification',
      '--noredact',
    ],
    status: null,
    stderr: '',
    stdout: '',
    syscall: 'spawnSync /sdk/adb',
  });
}

describe('Android E2E shell transport', () => {
  it('waits for one transient offline device and retries the original shell command once', () => {
    const transientOffline = offlineError();
    const exec = jest
      .fn()
      .mockImplementationOnce(() => { throw transientOffline; })
      .mockReturnValueOnce('')
      .mockReturnValueOnce('notification-state\n');

    const output = runAndroidAdbShell(['dumpsys', 'notification', '--noredact'], {
      environment,
      execFileSync: exec,
    });

    expect(output).toBe('notification-state\n');
    expect(exec.mock.calls.map(([, args]) => args)).toEqual([
      ['-s', 'emulator-5554', 'shell', 'dumpsys', 'notification', '--noredact'],
      ['-s', 'emulator-5554', 'wait-for-device'],
      ['-s', 'emulator-5554', 'shell', 'dumpsys', 'notification', '--noredact'],
    ]);
    expect(exec.mock.calls[1][2]).toEqual({
      encoding: 'utf8',
      timeout: 5_000,
    });
  });

  it('fails after the single recovery attempt when the device remains offline', () => {
    const firstOffline = offlineError('adb: device offline');
    const persistentOffline = offlineError('error: device offline');
    const exec = jest
      .fn()
      .mockImplementationOnce(() => { throw firstOffline; })
      .mockReturnValueOnce('')
      .mockImplementationOnce(() => { throw persistentOffline; });

    expect(() => runAndroidAdbShell(['dumpsys', 'notification', '--noredact'], {
      environment,
      execFileSync: exec,
    })).toThrow(persistentOffline);
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it('retries one timed-out shell query after the device responds within the caller deadline', () => {
    const timeout = timedOutShellError();
    const exec = jest
      .fn()
      .mockImplementationOnce(() => { throw timeout; })
      .mockReturnValueOnce('')
      .mockReturnValueOnce('chessticize-adb-shell-ready\n')
      .mockReturnValueOnce('android.title=String (3 reviews are ready)\n');

    const output = runAndroidAdbShell(['dumpsys', 'notification', '--noredact'], {
      environment,
      execFileSync: exec,
      now: () => 10_000,
      shellTimeoutMs: 5_000,
      timeoutRecoveryDeadlineMs: 20_000,
    });

    expect(output).toContain('3 reviews are ready');
    expect(exec.mock.calls.map(([, args]) => args)).toEqual([
      ['-s', 'emulator-5554', 'shell', 'dumpsys', 'notification', '--noredact'],
      ['-s', 'emulator-5554', 'wait-for-device'],
      ['-s', 'emulator-5554', 'shell', 'echo', 'chessticize-adb-shell-ready'],
      ['-s', 'emulator-5554', 'shell', 'dumpsys', 'notification', '--noredact'],
    ]);
    expect(exec.mock.calls.map(([, , options]) => options.timeout)).toEqual([
      5_000,
      5_000,
      2_000,
      5_000,
    ]);
  });

  it('requires the responsiveness probe when a timeout also reports device offline', () => {
    const timeout = timedOutShellError();
    timeout.stderr = 'adb: device offline\n';
    const exec = jest
      .fn()
      .mockImplementationOnce(() => { throw timeout; })
      .mockReturnValueOnce('')
      .mockReturnValueOnce('chessticize-adb-shell-ready\n')
      .mockReturnValueOnce('notification-state\n');

    const output = runAndroidAdbShell(['dumpsys', 'notification', '--noredact'], {
      environment,
      execFileSync: exec,
      now: () => 10_000,
      shellTimeoutMs: 5_000,
      timeoutRecoveryDeadlineMs: 20_000,
    });

    expect(output).toBe('notification-state\n');
    expect(exec.mock.calls.map(([, args]) => args)).toEqual([
      ['-s', 'emulator-5554', 'shell', 'dumpsys', 'notification', '--noredact'],
      ['-s', 'emulator-5554', 'wait-for-device'],
      ['-s', 'emulator-5554', 'shell', 'echo', 'chessticize-adb-shell-ready'],
      ['-s', 'emulator-5554', 'shell', 'dumpsys', 'notification', '--noredact'],
    ]);
  });

  it('does not downgrade a timeout with offline stderr when recovery has no deadline', () => {
    const timeout = timedOutShellError();
    timeout.stderr = 'adb: device offline\n';
    const exec = jest.fn(() => { throw timeout; });

    expect(() => runAndroidAdbShell(['dumpsys', 'notification', '--noredact'], {
      environment,
      execFileSync: exec,
      shellTimeoutMs: 5_000,
    })).toThrow(timeout);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('preserves the second timeout when the retried shell query still hangs', () => {
    const firstTimeout = timedOutShellError();
    const secondTimeout = timedOutShellError();
    secondTimeout.message = 'spawnSync /sdk/adb ETIMEDOUT after recovery';
    const exec = jest
      .fn()
      .mockImplementationOnce(() => { throw firstTimeout; })
      .mockReturnValueOnce('')
      .mockReturnValueOnce('chessticize-adb-shell-ready\n')
      .mockImplementationOnce(() => { throw secondTimeout; });

    expect(() => runAndroidAdbShell(['dumpsys', 'notification', '--noredact'], {
      environment,
      execFileSync: exec,
      now: () => 10_000,
      shellTimeoutMs: 5_000,
      timeoutRecoveryDeadlineMs: 20_000,
    })).toThrow(secondTimeout);
    expect(exec).toHaveBeenCalledTimes(4);
  });

  it('does not start timeout recovery after the caller deadline', () => {
    const timeout = timedOutShellError();
    const exec = jest.fn(() => { throw timeout; });

    expect(() => runAndroidAdbShell(['dumpsys', 'notification', '--noredact'], {
      environment,
      execFileSync: exec,
      now: () => 20_000,
      shellTimeoutMs: 5_000,
      timeoutRecoveryDeadlineMs: 20_000,
    })).toThrow(timeout);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('preserves a failed responsiveness probe instead of retrying the product query', () => {
    const timeout = timedOutShellError();
    const probeFailure = Object.assign(new Error('probe transport failed'), {
      code: 1,
      stderr: 'error: device offline\n',
      stdout: '',
    });
    const exec = jest
      .fn()
      .mockImplementationOnce(() => { throw timeout; })
      .mockReturnValueOnce('')
      .mockImplementationOnce(() => { throw probeFailure; });

    expect(() => runAndroidAdbShell(['dumpsys', 'notification', '--noredact'], {
      environment,
      execFileSync: exec,
      now: () => 10_000,
      shellTimeoutMs: 5_000,
      timeoutRecoveryDeadlineMs: 20_000,
    })).toThrow(probeFailure);
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it('does not retry a timeout-shaped failure unless the process was terminated by the timeout', () => {
    const commandFailure = timedOutShellError();
    commandFailure.signal = null;
    commandFailure.status = 1;
    commandFailure.stderr = 'dumpsys rejected the request\n';
    const exec = jest.fn(() => { throw commandFailure; });

    expect(() => runAndroidAdbShell(['dumpsys', 'notification', '--noredact'], {
      environment,
      execFileSync: exec,
      now: () => 10_000,
      shellTimeoutMs: 5_000,
      timeoutRecoveryDeadlineMs: 20_000,
    })).toThrow(commandFailure);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the responsiveness probe returns an unexpected marker', () => {
    const timeout = timedOutShellError();
    const exec = jest
      .fn()
      .mockImplementationOnce(() => { throw timeout; })
      .mockReturnValueOnce('')
      .mockReturnValueOnce('unexpected probe output\n');

    expect(() => runAndroidAdbShell(['dumpsys', 'notification', '--noredact'], {
      environment,
      execFileSync: exec,
      now: () => 10_000,
      shellTimeoutMs: 5_000,
      timeoutRecoveryDeadlineMs: 20_000,
    })).toThrow(timeout);
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it('does not start the retry when recovery work consumes the remaining deadline', () => {
    const timeout = timedOutShellError();
    const now = jest
      .fn()
      .mockReturnValueOnce(10_000)
      .mockReturnValueOnce(15_000)
      .mockReturnValueOnce(20_000);
    const exec = jest
      .fn()
      .mockImplementationOnce(() => { throw timeout; })
      .mockReturnValueOnce('')
      .mockReturnValueOnce('chessticize-adb-shell-ready\n');

    expect(() => runAndroidAdbShell(['dumpsys', 'notification', '--noredact'], {
      environment,
      execFileSync: exec,
      now,
      shellTimeoutMs: 5_000,
      timeoutRecoveryDeadlineMs: 20_000,
    })).toThrow(timeout);
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it('accepts the exact active identity without invoking an unsafe full notification dump', async () => {
    const activeState = '0|com.chessticize.mobile|182|null|10246\n';
    const broadDumpOffline = offlineError();
    const runShell = jest.fn((args) => {
      if (args.join(' ') === 'cmd notification list') {
        return activeState;
      }
      throw broadDumpOffline;
    });

    await expect(waitForAndroidNotificationIdentity(
      reviewNotification,
      1,
      800,
      {
        now: () => 1_000,
        runShell,
      }
    )).resolves.toBe(activeState);
    expect(runShell.mock.calls.map(([args]) => args.join(' '))).toEqual([
      'cmd notification list',
    ]);
  });

  it('accepts expected absence from an exact zero active count', async () => {
    const activeState = '-1|android|55|null|1000\n';
    const runShell = jest.fn(() => activeState);
    const sleep = jest.fn();

    await expect(waitForAndroidNotificationIdentity(
      reviewNotification,
      0,
      800,
      { now: () => 1_000, runShell, sleep }
    )).resolves.toBe(activeState);
    expect(runShell).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('accepts an empty supported active list as exact absence', async () => {
    const runShell = jest.fn(() => '');

    await expect(waitForAndroidNotificationIdentity(
      reviewNotification,
      0,
      800,
      { now: () => 1_000, runShell }
    )).resolves.toBe('');
  });

  it('fails closed instead of accepting malformed nonempty output as absence', async () => {
    const runShell = jest.fn(() => 'adb: error: notification service unavailable\n');

    await expect(waitForAndroidNotificationIdentity(
      reviewNotification,
      0,
      800,
      { now: () => 1_000, runShell }
    )).rejects.toThrow('Malformed Android active notification list');
  });

  it('rejects zero active matches when one exact identity is required', async () => {
    let nowMs = 1_000;
    const runShell = jest.fn(() => '-1|android|55|null|1000\n');
    const sleep = jest.fn(async (durationMs) => {
      nowMs += durationMs;
    });

    await expect(waitForAndroidNotificationIdentity(
      reviewNotification,
      1,
      800,
      {
        now: () => nowMs,
        pollIntervalMs: 400,
        runShell,
        sleep,
      }
    )).rejects.toThrow(
      'Expected exactly 1 active Android notification(s) for '
      + 'com.chessticize.mobile/182; latest count was 0'
    );
  });

  it('rejects active notifications with the wrong package or notification id', async () => {
    const wrongIdentityState = [
      '0|com.other.app|182|null|10246',
      '0|com.chessticize.mobile|999|null|10246',
    ].join('\n');
    let nowMs = 1_000;
    const runShell = jest.fn(() => wrongIdentityState);
    const sleep = jest.fn(async (durationMs) => {
      nowMs += durationMs;
    });

    await expect(waitForAndroidNotificationIdentity(
      reviewNotification,
      1,
      800,
      {
        now: () => nowMs,
        pollIntervalMs: 400,
        runShell,
        sleep,
      }
    )).rejects.toThrow(
      'latest count was 0'
    );
  });

  it('rejects a duplicated exact active identity', async () => {
    const duplicatedState = [
      '0|com.chessticize.mobile|182|null|10246',
      '0|com.chessticize.mobile|182|null|10246',
    ].join('\n');
    let nowMs = 1_000;
    const runShell = jest.fn(() => duplicatedState);
    const sleep = jest.fn(async (durationMs) => {
      nowMs += durationMs;
    });

    await expect(waitForAndroidNotificationIdentity(
      reviewNotification,
      1,
      800,
      {
        now: () => nowMs,
        pollIntervalMs: 400,
        runShell,
        sleep,
      }
    )).rejects.toThrow('latest count was 2');
  });

  it('bounds each exact-identity poll and its recovery by the outer deadline', async () => {
    let nowMs = 1_000;
    const runShell = jest.fn(() => '0|com.other.app|999|null|10001\n');
    const sleep = jest.fn(async (durationMs) => {
      nowMs += durationMs;
    });

    await expect(waitForAndroidNotificationIdentity(
      reviewNotification,
      1,
      800,
      {
        now: () => nowMs,
        pollIntervalMs: 400,
        runShell,
        shellTimeoutMs: 5_000,
        sleep,
      }
    )).rejects.toThrow('latest count was 0');
    expect(runShell.mock.calls.map(([, options]) => options.shellTimeoutMs)).toEqual([
      800,
      400,
    ]);
    expect(runShell.mock.calls.map(([, options]) => options.timeoutRecoveryDeadlineMs)).toEqual([
      1_800,
      1_800,
    ]);
  });

  it('rejects an expected identity returned after the outer deadline', async () => {
    let nowMs = 1_000;
    const runShell = jest.fn(() => {
      nowMs = 1_801;
      return '0|com.chessticize.mobile|182|null|10246\n';
    });

    await expect(waitForAndroidNotificationIdentity(
      reviewNotification,
      1,
      800,
      { now: () => nowMs, runShell }
    )).rejects.toThrow(
      'Expected exactly 1 active Android notification(s) for '
      + 'com.chessticize.mobile/182'
    );
  });

  it('recovers one transient offline identity query within the outer deadline', async () => {
    const transientOffline = offlineError();
    const exec = jest
      .fn()
      .mockImplementationOnce(() => { throw transientOffline; })
      .mockReturnValueOnce('')
      .mockReturnValueOnce('0|com.chessticize.mobile|182|null|10246\n');

    await expect(waitForAndroidNotificationIdentity(
      reviewNotification,
      1,
      800,
      {
        now: () => 1_000,
        shellOptions: { environment, execFileSync: exec },
      }
    )).resolves.toContain('|com.chessticize.mobile|182|');
    expect(exec.mock.calls.map(([, args]) => args)).toEqual([
      ['-s', 'emulator-5554', 'shell', 'cmd', 'notification', 'list'],
      ['-s', 'emulator-5554', 'wait-for-device'],
      ['-s', 'emulator-5554', 'shell', 'cmd', 'notification', 'list'],
    ]);
  });

  it('preserves a persistent offline failure from the retried identity query', async () => {
    const firstOffline = offlineError('adb: device offline');
    const persistentOffline = offlineError('error: device offline');
    const exec = jest
      .fn()
      .mockImplementationOnce(() => { throw firstOffline; })
      .mockReturnValueOnce('')
      .mockImplementationOnce(() => { throw persistentOffline; });

    await expect(waitForAndroidNotificationIdentity(
      reviewNotification,
      1,
      800,
      {
        now: () => 1_000,
        shellOptions: { environment, execFileSync: exec },
      }
    )).rejects.toBe(persistentOffline);
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it('does not retry ordinary shell or product failures', () => {
    const permissionFailure = Object.assign(new Error('Permission Denial'), {
      status: 1,
      stderr: 'java.lang.SecurityException: Permission Denial\n',
      stdout: '',
    });
    const exec = jest.fn(() => { throw permissionFailure; });

    expect(() => runAndroidAdbShell(['pm', 'grant', 'app', 'permission'], {
      environment,
      execFileSync: exec,
    })).toThrow(permissionFailure);
    expect(exec).toHaveBeenCalledTimes(1);
  });
});
