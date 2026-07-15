const fs = require('node:fs');
const path = require('node:path');

const {
  ACTIVE_E2E_TEST_MATCH_BY_SUITE,
  ACTIVE_E2E_TEST_MATCH,
  STORE_ASSETS_TEST_MATCH,
  ADAPTIVE_LAYOUT_TEST_MATCH,
  ANDROID_LAUNCH_TEST_MATCH,
  ANDROID_STANDARD_PRACTICE_TEST_MATCH,
  ANDROID_MIGRATION_TEST_MATCH,
  resolveDetoxTestMatch,
  resolveDetoxMaxWorkers
} = require('../e2e/suiteConfig');
const {
  bringAndroidAppToForeground,
  collectAndroidUiDiagnostics,
  launchWithDisabledSynchronization,
} = require('../e2e/helpers');

describe('Detox suite configuration', () => {
  it('passes Android synchronization disablement in the numeric form Detox recognizes', () => {
    const helpers = fs.readFileSync(path.resolve(__dirname, '../e2e/helpers.js'), 'utf8');
    const launchSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/android-launch.e2e.js'), 'utf8');

    expect(helpers).toContain('detoxEnableSynchronization: 0');
    expect(launchSpec).toContain('launchWithDisabledSynchronization');
    expect(helpers).not.toContain('detoxEnableSynchronization: false');
    expect(launchSpec).not.toContain('detoxEnableSynchronization: false');
  });

  it('reacquires Android window focus before public UI assertions', async () => {
    const foregroundAndroidApp = jest.fn();
    const targetDevice = {
      disableSynchronization: jest.fn().mockResolvedValue(undefined),
      getPlatform: jest.fn(() => 'android'),
      launchApp: jest.fn().mockResolvedValue(undefined),
    };

    await launchWithDisabledSynchronization({
      delete: true,
      newInstance: true,
      launchArgs: { chessticizeTestNowMs: '1784030400000' },
    }, targetDevice, foregroundAndroidApp);

    expect(targetDevice.launchApp).toHaveBeenCalledTimes(1);
    expect(targetDevice.launchApp).toHaveBeenCalledWith({
      delete: true,
      newInstance: true,
      launchArgs: {
        DTXDisableMainRunLoopSync: 'YES',
        detoxEnableSynchronization: 0,
        chessticizeTestNowMs: '1784030400000',
      },
    });
    expect(foregroundAndroidApp).toHaveBeenCalledWith({
      DTXDisableMainRunLoopSync: 'YES',
      detoxEnableSynchronization: 0,
      chessticizeTestNowMs: '1784030400000',
    });
    expect(targetDevice.disableSynchronization).toHaveBeenCalledTimes(1);
  });

  it('foregrounds the attached Android activity with identical launch arguments', () => {
    const run = jest.fn(() => 'Status: ok\nActivity: com.chessticize.mobile/.MainActivity\n');

    bringAndroidAppToForeground({
      detoxEnableSynchronization: 0,
      chessticizePuzzleSelectionSeed: 'fixture-seed',
    }, {
      ANDROID_HOME: '/sdk',
      DETOX_ANDROID_DEVICE: 'emulator-5556',
    }, run);

    expect(run).toHaveBeenCalledWith('/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'shell',
      'am',
      'start',
      '-W',
      '-n',
      'com.chessticize.mobile/.MainActivity',
      '--es',
      'detoxEnableSynchronization',
      '0',
      '--es',
      'chessticizePuzzleSelectionSeed',
      'fixture-seed',
    ], { encoding: 'utf8' });
  });

  it('captures actionable Android focus, hierarchy, and screenshot diagnostics', () => {
    const run = jest.fn((_command, args) => {
      const request = args.join(' ');
      if (request.includes('dumpsys window windows')) {
        return [
          'WINDOW MANAGER WINDOWS',
          '  mCurrentFocus=Window{123 u0 com.chessticize.mobile/com.chessticize.mobile.MainActivity}',
          '  mFocusedApp=ActivityRecord{456 com.chessticize.mobile/.MainActivity}',
        ].join('\n');
      }
      if (request.includes('dumpsys activity activities')) {
        return '  topResumedActivity=ActivityRecord{456 com.chessticize.mobile/.MainActivity}\n';
      }
      if (request.includes('pidof com.chessticize.mobile')) {
        return '4242\n';
      }
      if (request.includes('dumpsys activity processes com.chessticize.mobile')) {
        return '*APP* UID 10123 ProcessRecord{789 4242:com.chessticize.mobile/u0a123}\n';
      }
      if (request.includes('logcat -d -v threadtime -t 2000')) {
        return [
          '07-14 23:54:00.000 4242 4242 E ReactNative: Exception in native call',
          "07-14 23:54:00.001 4242 4242 E ReactNativeJS: PlatformConstants could not be found",
          '07-14 23:54:00.002 1000 1000 I unrelated: ignored',
        ].join('\n');
      }
      if (request.includes('uiautomator dump')) {
        return 'UI hierchary dumped to: /sdcard/chessticize-window.xml\n';
      }
      if (request.includes('cat /sdcard/chessticize-window.xml')) {
        return '<hierarchy><node text="Practice" /></hierarchy>';
      }
      if (request.includes('screencap -p')) {
        return Buffer.from('png');
      }
      throw new Error(`Unexpected ADB request: ${request}`);
    });
    const fileSystem = {
      mkdirSync: jest.fn(),
      writeFileSync: jest.fn(),
    };
    const log = jest.fn();

    collectAndroidUiDiagnostics({
      ANDROID_HOME: '/sdk',
      DETOX_ANDROID_DEVICE: 'emulator-5556',
    }, run, fileSystem, log, '/artifacts/android-ui');

    expect(run).toHaveBeenNthCalledWith(1, '/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'shell',
      'dumpsys',
      'window',
      'windows',
    ], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 });
    expect(run).toHaveBeenNthCalledWith(2, '/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'shell',
      'dumpsys',
      'activity',
      'activities',
    ], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 });
    expect(run).toHaveBeenNthCalledWith(3, '/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'shell',
      'pidof',
      'com.chessticize.mobile',
    ], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 });
    expect(run).toHaveBeenNthCalledWith(4, '/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'shell',
      'dumpsys',
      'activity',
      'processes',
      'com.chessticize.mobile',
    ], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 });
    expect(run).toHaveBeenNthCalledWith(5, '/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'logcat',
      '-d',
      '-v',
      'threadtime',
      '-t',
      '2000',
    ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 30000 });
    expect(run).toHaveBeenNthCalledWith(6, '/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'shell',
      'uiautomator',
      'dump',
      '/sdcard/chessticize-window.xml',
    ], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 });
    expect(run).toHaveBeenNthCalledWith(7, '/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'exec-out',
      'cat',
      '/sdcard/chessticize-window.xml',
    ], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 });
    expect(run).toHaveBeenNthCalledWith(8, '/sdk/platform-tools/adb', [
      '-s',
      'emulator-5556',
      'exec-out',
      'screencap',
      '-p',
    ], { maxBuffer: 25 * 1024 * 1024, timeout: 30000 });
    expect(fileSystem.mkdirSync).toHaveBeenCalledWith('/artifacts/android-ui', { recursive: true });
    expect(fileSystem.writeFileSync).toHaveBeenCalledWith(
      '/artifacts/android-ui/current-focus.txt',
      expect.stringContaining('mCurrentFocus=Window')
    );
    expect(fileSystem.writeFileSync).toHaveBeenCalledWith(
      '/artifacts/android-ui/window.xml',
      '<hierarchy><node text="Practice" /></hierarchy>'
    );
    expect(fileSystem.writeFileSync).toHaveBeenCalledWith(
      '/artifacts/android-ui/screenshot.png',
      Buffer.from('png')
    );
    expect(fileSystem.writeFileSync).toHaveBeenCalledWith(
      '/artifacts/android-ui/process-state.txt',
      expect.stringContaining('pid=4242')
    );
    expect(fileSystem.writeFileSync).toHaveBeenCalledWith(
      '/artifacts/android-ui/logcat.txt',
      expect.stringContaining('PlatformConstants could not be found')
    );
    expect(fileSystem.writeFileSync).not.toHaveBeenCalledWith(
      '/artifacts/android-ui/logcat.txt',
      expect.stringContaining('unrelated: ignored')
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[android-ui-diagnostics] current focus'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('<node text="Practice" />'));
  });

  it('collects Android UI diagnostics before launch smoke failures are rethrown', () => {
    const launchSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/android-launch.e2e.js'), 'utf8');

    expect(launchSpec).toContain('collectAndroidUiDiagnostics');
    expect(launchSpec).toContain('throw error');
  });

  it('collects Android UI diagnostics before Stockfish journey failures are rethrown', () => {
    const stockfishSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/android-stockfish.e2e.js'), 'utf8');

    expect(stockfishSpec).toContain('collectAndroidUiDiagnostics');
    expect(stockfishSpec).toContain('throw error');
  });

  it('runs every active E2E spec by default without loading opt-in capture specs', () => {
    expect(resolveDetoxTestMatch({})).toEqual(ACTIVE_E2E_TEST_MATCH);
    expect(ACTIVE_E2E_TEST_MATCH).toEqual([
      '<rootDir>/e2e/practice.e2e.js',
      '<rootDir>/e2e/flows.e2e.js'
    ]);
  });

  it('partitions every active spec exactly once across the two CI suites', () => {
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'all' }))
      .toEqual(ACTIVE_E2E_TEST_MATCH);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'practice' }))
      .toEqual(ACTIVE_E2E_TEST_MATCH_BY_SUITE.practice);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'flows' }))
      .toEqual(ACTIVE_E2E_TEST_MATCH_BY_SUITE.flows);

    const partitionedSpecs = Object.values(ACTIVE_E2E_TEST_MATCH_BY_SUITE).flat();
    expect(partitionedSpecs).toEqual(ACTIVE_E2E_TEST_MATCH);
    expect(new Set(partitionedSpecs).size).toBe(ACTIVE_E2E_TEST_MATCH.length);
  });

  it('rejects unknown or mixed active suite selections', () => {
    expect(() => resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'unknown' }))
      .toThrow('Unknown DETOX_ACTIVE_SUITE "unknown".');
    expect(() => resolveDetoxTestMatch({
      DETOX_ACTIVE_SUITE: 'practice',
      CHESSTICIZE_CAPTURE_STORE_ASSETS: '1'
    })).toThrow('Active E2E and screenshot capture suites must run separately.');
  });

  it('keeps the App Store screenshot spec available through its opt-in command', () => {
    expect(resolveDetoxTestMatch({ CHESSTICIZE_CAPTURE_STORE_ASSETS: '1' }))
      .toEqual(STORE_ASSETS_TEST_MATCH);
  });

  it('keeps the adaptive layout screenshot spec available through its opt-in command', () => {
    expect(resolveDetoxTestMatch({ CHESSTICIZE_CAPTURE_ADAPTIVE_LAYOUT: '1' }))
      .toEqual(ADAPTIVE_LAYOUT_TEST_MATCH);
  });

  it('keeps the Android launch smoke isolated from the iOS regression suites', () => {
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-launch' }))
      .toEqual(ANDROID_LAUNCH_TEST_MATCH);
    expect(ACTIVE_E2E_TEST_MATCH).not.toContain(ANDROID_LAUNCH_TEST_MATCH[0]);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-standard-practice' }))
      .toEqual(ANDROID_STANDARD_PRACTICE_TEST_MATCH);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-migration' }))
      .toEqual(ANDROID_MIGRATION_TEST_MATCH);
  });

  it('rejects mixing the two screenshot capture suites in one invocation', () => {
    expect(() => resolveDetoxTestMatch({
      CHESSTICIZE_CAPTURE_STORE_ASSETS: '1',
      CHESSTICIZE_CAPTURE_ADAPTIVE_LAYOUT: '1'
    })).toThrow('Active E2E and screenshot capture suites must run separately.');
  });

  it('uses one reliable worker by default and accepts an explicit experiment count', () => {
    expect(resolveDetoxMaxWorkers({})).toBe(1);
    expect(resolveDetoxMaxWorkers({ DETOX_MAX_WORKERS: '2' })).toBe(2);
    expect(() => resolveDetoxMaxWorkers({ DETOX_MAX_WORKERS: '0' }))
      .toThrow('DETOX_MAX_WORKERS must be a positive integer');
  });
});
