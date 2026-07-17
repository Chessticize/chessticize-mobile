const { runAndroidAdbShell } = require('../e2e/androidAdbShell');

const environment = {
  ADB_PATH: '/sdk/adb',
  DETOX_ANDROID_DEVICE: 'emulator-5554',
};

function offlineError(message = 'adb: device offline') {
  return Object.assign(new Error(message), {
    status: 1,
    stderr: `${message}\n`,
    stdout: '',
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
