const { setAndroidNetworkEnabled } = require('../e2e/androidNetwork');

describe('Android E2E offline network control', () => {
  it('uses a privileged legacy broadcast and verifies no active default network on API 24', async () => {
    const calls = [];
    let airplaneModeEnabled = false;
    const exec = jest.fn((command, args) => {
      calls.push([command, args]);
      if (args.includes('ro.build.version.sdk')) {
        return '24\n';
      }
      if (args.includes('id')) {
        return '0\n';
      }
      if (args.includes('dumpsys')) {
        return airplaneModeEnabled
          ? 'Active default network: none\n'
          : 'Active default network: 100\n';
      }
      if (args.includes('put')) {
        airplaneModeEnabled = true;
      }
      if (args.includes('get') && args.includes('airplane_mode_on')) {
        return '1\n';
      }
      return '';
    });

    await setAndroidNetworkEnabled(false, {
      environment: { ADB_PATH: '/sdk/adb', DETOX_ANDROID_DEVICE: 'emulator-5554' },
      execFileSync: exec,
      retryDelayMs: 0,
    });

    expect(calls).toContainEqual(['/sdk/adb', [
      '-s', 'emulator-5554', 'shell', 'id', '-u',
    ]]);
    expect(calls).toContainEqual(['/sdk/adb', [
      '-s', 'emulator-5554', 'shell', 'settings', 'put', 'global', 'airplane_mode_on', '1',
    ]]);
    expect(calls).toContainEqual(['/sdk/adb', [
      '-s', 'emulator-5554', 'shell', 'am', 'broadcast',
      '-a', 'android.intent.action.AIRPLANE_MODE', '--ez', 'state', 'true',
    ]]);
    expect(calls.filter(([, args]) => args.includes('dumpsys'))).toHaveLength(2);
  });

  it('refuses the protected API 24 broadcast when adbd is not root', async () => {
    const exec = jest.fn((_command, args) => {
      if (args.includes('ro.build.version.sdk')) {
        return '24\n';
      }
      if (args.includes('id')) {
        return '2000\n';
      }
      if (args.includes('dumpsys')) {
        return 'Active default network: 100\n';
      }
      return '';
    });

    await expect(setAndroidNetworkEnabled(false, {
      environment: { ADB_PATH: '/sdk/adb' },
      execFileSync: exec,
      retryDelayMs: 0,
    })).rejects.toThrow('API 24 offline validation requires root adbd');
  });

  it('uses the connectivity command and verifies a restored default network on current Android', async () => {
    const calls = [];
    const exec = jest.fn((command, args) => {
      calls.push([command, args]);
      if (args.includes('ro.build.version.sdk')) {
        return '36\n';
      }
      if (args.includes('get')) {
        return '0\n';
      }
      if (args.includes('dumpsys')) {
        return 'Active default network: 101\n';
      }
      return '';
    });

    await setAndroidNetworkEnabled(true, {
      environment: { ADB_PATH: '/sdk/adb', DETOX_ANDROID_DEVICE: 'emulator-5554' },
      execFileSync: exec,
      retryDelayMs: 0,
    });

    expect(calls).toContainEqual(['/sdk/adb', [
      '-s', 'emulator-5554', 'shell', 'cmd', 'connectivity', 'airplane-mode', 'disable',
    ]]);
  });

  it('fails when Android does not enter the requested airplane-mode state', async () => {
    const exec = jest.fn((_command, args) => {
      if (args.includes('ro.build.version.sdk')) {
        return '36\n';
      }
      if (args.includes('get')) {
        return '0\n';
      }
      if (args.includes('dumpsys')) {
        return 'Active default network: 100\n';
      }
      return '';
    });

    await expect(setAndroidNetworkEnabled(false, {
      environment: { ADB_PATH: '/sdk/adb' },
      execFileSync: exec,
      retryDelayMs: 0,
    })).rejects.toThrow('Android airplane mode did not become enabled');
  });

  it('fails closed when airplane mode is set but a default network remains active', async () => {
    const exec = jest.fn((_command, args) => {
      if (args.includes('ro.build.version.sdk')) {
        return '36\n';
      }
      if (args.includes('get')) {
        return '1\n';
      }
      if (args.includes('dumpsys')) {
        return 'Active default network: 100\n';
      }
      return '';
    });

    await expect(setAndroidNetworkEnabled(false, {
      environment: { ADB_PATH: '/sdk/adb' },
      execFileSync: exec,
      networkStateProbeAttempts: 2,
      retryDelayMs: 0,
    })).rejects.toThrow('Android still had an active default network after airplane mode was enabled');
  });

  it('fails closed when connectivity service does not report its active default network', async () => {
    const exec = jest.fn((_command, args) => {
      if (args.includes('ro.build.version.sdk')) {
        return '36\n';
      }
      if (args.includes('dumpsys')) {
        return 'Connectivity service unavailable\n';
      }
      return '';
    });

    await expect(setAndroidNetworkEnabled(false, {
      environment: { ADB_PATH: '/sdk/adb' },
      execFileSync: exec,
      retryDelayMs: 0,
    })).rejects.toThrow('Unable to resolve Android active default network');
  });
});
