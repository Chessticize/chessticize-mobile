const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const {
  ACTIVE_E2E_TEST_MATCH_BY_SUITE,
  ACTIVE_E2E_TEST_MATCH,
  STORE_ASSETS_TEST_MATCH,
  ADAPTIVE_LAYOUT_TEST_MATCH,
  ANDROID_LAUNCH_TEST_MATCH,
  ANDROID_STANDARD_PRACTICE_TEST_MATCH,
  ANDROID_MIGRATION_TEST_MATCH,
  ANDROID_OFFLINE_PRACTICE_TEST_MATCH,
  ANDROID_PROGRESS_BACKUP_RESTORE_TEST_MATCH,
  ANDROID_SYSTEM_BACK_TEST_MATCH,
  resolveDetoxTestMatch,
  resolveDetoxMaxWorkers
} = require('../e2e/suiteConfig');
const {
  bringAndroidAppToForeground,
  androidAppIsResumed,
  beginAndroidPredictiveBackGesture,
  clearAndroidStartupDiagnosticsLogcat,
  collectAndroidUiDiagnostics,
  launchWithDisabledSynchronization,
  performAndroidPredictiveBackGesture,
  waitForRunningStockfishDepth,
  withAndroidUiDiagnostics,
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

  it('preserves the full API 24 startup log after clearing the pre-launch buffer', () => {
    const startupLog = [
      '07-15 19:13:40.000 4242 4242 I ChessticizeStartup: before-package',
      '07-15 19:13:40.001 4242 4242 E AndroidRuntime: verifier failure',
    ].join('\n');
    const run = jest.fn((_command, args) => args.includes('logcat') ? startupLog : '');
    const fileSystem = {
      mkdirSync: jest.fn(),
      writeFileSync: jest.fn(),
    };
    const environment = {
      ANDROID_HOME: '/sdk',
      DETOX_ANDROID_DEVICE: 'emulator-5556',
      CHESSTICIZE_ANDROID_STARTUP_DIAGNOSTICS: '1',
    };

    clearAndroidStartupDiagnosticsLogcat(environment, run);
    collectAndroidUiDiagnostics(environment, run, fileSystem, jest.fn(), '/artifacts/android-ui');

    expect(run).toHaveBeenCalledWith('/sdk/platform-tools/adb', [
      '-s', 'emulator-5556', 'logcat', '-c'
    ], { encoding: 'utf8' });
    expect(run).toHaveBeenCalledWith('/sdk/platform-tools/adb', [
      '-s', 'emulator-5556', 'logcat', '-d', '-v', 'threadtime'
    ], { encoding: 'utf8', maxBuffer: 25 * 1024 * 1024, timeout: 30000 });
    expect(fileSystem.writeFileSync).toHaveBeenCalledWith(
      '/artifacts/android-ui/logcat-raw.txt',
      startupLog
    );
  });

  it('shares Android UI diagnostics around launch and Stockfish failures', async () => {
    const launchSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/android-launch.e2e.js'), 'utf8');
    const stockfishSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/android-stockfish.e2e.js'), 'utf8');
    const actionError = new Error('journey failed');
    const action = jest.fn().mockRejectedValue(actionError);
    const collectDiagnostics = jest.fn(() => {
      throw new Error('diagnostics failed');
    });
    const log = jest.fn();

    await expect(withAndroidUiDiagnostics(action, collectDiagnostics, log)).rejects.toBe(actionError);

    expect(collectDiagnostics).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      '[android-ui-diagnostics] collection failed: diagnostics failed'
    );
    expect(launchSpec).toContain('withAndroidUiDiagnostics');
    expect(stockfishSpec).toContain('withAndroidUiDiagnostics');
    expect(launchSpec).not.toContain('async function withAndroidUiDiagnostics');
    expect(stockfishSpec).not.toContain('async function withAndroidUiDiagnostics');
  });

  it('shares inclusive and exclusive running-Stockfish depth polling', async () => {
    const stockfishSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/android-stockfish.e2e.js'), 'utf8');
    const practiceSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/practice.e2e.js'), 'utf8');
    const wait = jest.fn().mockResolvedValue(undefined);
    const readInclusiveText = jest.fn().mockResolvedValue('SF 18 NNUE · Depth 4/20');
    const readExclusiveText = jest.fn()
      .mockResolvedValueOnce('SF 18 NNUE · Depth 8/20')
      .mockResolvedValueOnce('SF 18 NNUE · Depth 9/20');

    await expect(waitForRunningStockfishDepth(
      'review-analysis-engine-status',
      4,
      90000,
      { readText: readInclusiveText, wait }
    )).resolves.toBe(4);
    await expect(waitForRunningStockfishDepth(
      'review-analysis-engine-status',
      8,
      90000,
      { comparison: 'above', readText: readExclusiveText, wait }
    )).resolves.toBe(9);

    expect(readInclusiveText).toHaveBeenCalledWith('review-analysis-engine-status');
    expect(readExclusiveText).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(25);
    expect(stockfishSpec).toContain(
      "waitForRunningStockfishDepth('review-analysis-engine-status', 4, 90000)"
    );
    expect(practiceSpec).toContain("{ comparison: 'above' }");
    expect(stockfishSpec).not.toContain('async function waitForRunningStockfishDepth');
    expect(practiceSpec).not.toContain('async function waitForRunningStockfishDepth');
  });

  it.each([
    ['at-least', '', 'Timed out waiting for an active Stockfish search. Last text: "engine unavailable"'],
    ['above', ' above depth 8', 'Timed out waiting for an active Stockfish search above depth 8. Last text: "engine unavailable"'],
  ])('preserves the %s Stockfish depth timeout diagnostic', async (comparison, _description, message) => {
    let nowMs = 0;
    const wait = jest.fn(async (pollIntervalMs) => {
      nowMs += pollIntervalMs;
    });

    await expect(waitForRunningStockfishDepth(
      'review-analysis-engine-status',
      8,
      25,
      {
        comparison,
        now: () => nowMs,
        readText: jest.fn().mockRejectedValue(new Error('engine unavailable')),
        wait,
      }
    )).rejects.toThrow(message);

    expect(wait).toHaveBeenCalledWith(25);
  });

  it('restarts the native Stockfish analysis journey through persisted public UI', () => {
    const practiceSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/practice.e2e.js'), 'utf8');

    expect(practiceSpec).toContain('await device.terminateApp()');
    expect(practiceSpec).toContain('await openStandardHistoryTrend()');
    expect(practiceSpec).toContain("newInstance: true");
    expect(practiceSpec).toContain("delete: false");
    expect(practiceSpec).toContain("waitForElementTextContaining('review-analysis-engine-status', 'SF 18 NNUE'");
  });

  it('runs every active E2E spec by default without loading opt-in capture specs', () => {
    expect(resolveDetoxTestMatch({})).toEqual(ACTIVE_E2E_TEST_MATCH);
    expect(ACTIVE_E2E_TEST_MATCH).toEqual([
      '<rootDir>/e2e/practice.e2e.js',
      '<rootDir>/e2e/flows.e2e.js'
    ]);
  });

  it('keeps the shared flows suite portable across iOS and Android', () => {
    const flowsSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/flows.e2e.js'), 'utf8');

    expect(flowsSpec).toContain("device.getPlatform() === 'android'");
    expect(flowsSpec).toContain('Notifications unavailable on this device');
    expect(flowsSpec).toContain("historyToggleValue('Wrong puzzles only', false)");
    expect(flowsSpec).toContain("historyToggleValue('Sprint attempts only', true)");
    expect(flowsSpec).toContain("return device.getPlatform() === 'android' ? `${label}, ${state}` : state");
    expect(flowsSpec).not.toContain('toHaveToggleValue');
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
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-offline-practice' }))
      .toEqual(ANDROID_OFFLINE_PRACTICE_TEST_MATCH);
    expect(ANDROID_OFFLINE_PRACTICE_TEST_MATCH).toEqual([
      ANDROID_LAUNCH_TEST_MATCH[0],
      ANDROID_STANDARD_PRACTICE_TEST_MATCH[0],
      ANDROID_MIGRATION_TEST_MATCH[0],
    ]);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-progress-backup-restore' }))
      .toEqual(ANDROID_PROGRESS_BACKUP_RESTORE_TEST_MATCH);
    expect(ACTIVE_E2E_TEST_MATCH).not.toContain(ANDROID_PROGRESS_BACKUP_RESTORE_TEST_MATCH[0]);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'android-system-back' }))
      .toEqual(ANDROID_SYSTEM_BACK_TEST_MATCH);
  });

  it('drives Predictive Back through the Android edge gesture and can verify root delegation', () => {
    const run = jest.fn((_, args) => {
      if (args.includes('size')) {
        return 'Physical size: 1080x1920\n';
      }
      if (args.includes('activities')) {
        return 'mResumedActivity: ActivityRecord{1 u0 com.android.launcher/.Launcher t1}';
      }
      return '';
    });

    performAndroidPredictiveBackGesture({
      ADB_PATH: '/sdk/adb',
      DETOX_ANDROID_DEVICE: 'emulator-6000'
    }, run);

    expect(run).toHaveBeenCalledWith('/sdk/adb', [
      '-s', 'emulator-6000', 'shell', 'cmd', 'overlay', 'enable-exclusive', '--category',
      'com.android.internal.systemui.navbar.gestural'
    ], { encoding: 'utf8' });
    expect(run).toHaveBeenCalledWith('/sdk/adb', [
      '-s', 'emulator-6000', 'shell', 'input', 'swipe', '1', '960', '432', '960', '500'
    ], { encoding: 'utf8' });
    expect(androidAppIsResumed({
      ADB_PATH: '/sdk/adb',
      DETOX_ANDROID_DEVICE: 'emulator-6000'
    }, run)).toBe(false);
  });

  it('keeps a predictive edge swipe alive for mid-gesture preview and cancellation evidence', async () => {
    const run = jest.fn((_, args) => args.includes('size') ? 'Physical size: 1080x1920\n' : '');
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    const spawnProcess = jest.fn(() => child);
    const invocationManager = jest.fn().mockResolvedValue(undefined);
    const uiDeviceAdapter = {};
    const uiDevice = new Proxy(uiDeviceAdapter, {
      get(target, property) {
        if (target[property] === undefined) {
          return undefined;
        }
        return async (...params) => invocationManager(
          target[property]({ type: 'Invocation' }, ...params)
        );
      },
    });
    const targetDevice = {
      getUiDevice: jest.fn(() => uiDevice),
    };

    const gesture = beginAndroidPredictiveBackGesture(
      { cancel: true, durationMs: 1200 },
      { ADB_PATH: '/sdk/adb', DETOX_ANDROID_DEVICE: 'emulator-6000' },
      run,
      spawnProcess,
      targetDevice
    );

    expect(targetDevice.getUiDevice).toHaveBeenCalledTimes(1);
    expect(spawnProcess).not.toHaveBeenCalled();
    await expect(gesture.started).resolves.toBeUndefined();
    expect(invocationManager).toHaveBeenCalledTimes(1);
    expect(invocationManager).toHaveBeenNthCalledWith(1, {
      target: {
        type: 'Class',
        value: 'com.chessticize.mobile.PredictiveBackGestureDriver',
      },
      method: 'startCancelledPredictiveBack',
      args: [1080, 1920, 1200].map((value) => ({ type: 'Integer', value })),
    });
    await expect(gesture.completion()).resolves.toBeUndefined();
    expect(invocationManager).toHaveBeenCalledTimes(2);
    expect(invocationManager).toHaveBeenNthCalledWith(2, {
      target: {
        type: 'Class',
        value: 'com.chessticize.mobile.PredictiveBackGestureDriver',
      },
      method: 'awaitCancelledPredictiveBack',
      args: [],
    });

    const reusedGesture = beginAndroidPredictiveBackGesture(
      { cancel: true, durationMs: 800 },
      { ADB_PATH: '/sdk/adb', DETOX_ANDROID_DEVICE: 'emulator-6000' },
      run,
      spawnProcess,
      targetDevice
    );
    await expect(reusedGesture.started).resolves.toBeUndefined();
    await expect(reusedGesture.completion()).resolves.toBeUndefined();
    expect(invocationManager).toHaveBeenNthCalledWith(3, expect.objectContaining({
      method: 'startCancelledPredictiveBack',
    }));
    expect(invocationManager).toHaveBeenNthCalledWith(4, expect.objectContaining({
      method: 'awaitCancelledPredictiveBack',
    }));
  });

  it('keeps the cancelled gesture public-UI-only and preserves committed edge geometry', async () => {
    const driver = fs.readFileSync(path.resolve(
      __dirname,
      '../android/app/src/androidTest/java/com/chessticize/mobile/PredictiveBackGestureDriver.java'
    ), 'utf8');
    expect(driver).toContain('only injects touchscreen input through UiAutomator');
    expect(driver).toContain('new Point(1, centerY)');
    expect(driver).toContain('widthPixels * 0.45f');
    expect(driver.match(/activated,/g)).toHaveLength(2);
    expect(driver).toContain('widthPixels * 0.03f');
    expect(driver).toContain('UI_AUTOMATOR_FRAME_DURATION_MS = 16');
    expect(driver).toContain('durationMs / segmentCount / UI_AUTOMATOR_FRAME_DURATION_MS');
    expect(driver).not.toContain('UI_AUTOMATOR_STEP_DURATION_MS = 5');
    expect(driver).toContain('.swipe(path, segmentSteps)');
    expect(driver).toContain('startCancelledPredictiveBack');
    expect(driver).toContain('awaitCancelledPredictiveBack');
    expect(driver).toContain('new Thread');
    expect(driver).toContain('if (activeGesture != null)');
    expect(driver).toMatch(/activeGesture = state;\s+}\s+try \{\s+worker\.start\(\)/);
    expect(driver).toContain('durationMs + COMPLETION_MARGIN_MS');
    expect(driver).toMatch(
      /terminal = true;\s+rethrowGestureFailure\(state\.failure\);[\s\S]*finally \{\s+if \(terminal && activeGesture == state\) \{\s+activeGesture = null;/
    );
    expect(driver).toContain('rethrowGestureFailure(state.failure)');
    expect(driver).not.toMatch(/React|Repository|NativeModule/);

    const run = jest.fn((_, args) => args.includes('size') ? 'Physical size: 1080x1920\n' : '');
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    const spawnProcess = jest.fn(() => child);
    const gesture = beginAndroidPredictiveBackGesture(
      {},
      { ADB_PATH: '/sdk/adb', DETOX_ANDROID_DEVICE: 'emulator-6000' },
      run,
      spawnProcess
    );

    expect(spawnProcess).toHaveBeenCalledWith('/sdk/adb', [
      '-s', 'emulator-6000', 'shell', 'input', 'swipe', '1', '960', '756', '960', '1800'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.emit('close', 0);
    await expect(gesture.started).resolves.toBeUndefined();
    await expect(gesture.completion()).resolves.toBeUndefined();
  });

  it('keeps a dedicated public-UI Android Back journey for ordering and cancellation', () => {
    const spec = fs.readFileSync(path.resolve(__dirname, '../e2e/android-system-back.e2e.js'), 'utf8');

    expect(spec).toContain("device.pressBack()");
    expect(spec).toContain('session-abandon-confirmation');
    expect(spec).toContain('beginAndroidPredictiveBackGesture');
    expect(spec).toContain('mobile-back-destination-preview');
    expect(spec).toContain('cancel: true');
    expect(spec).toContain('await cancelledPredictiveBack.started');
    expect(spec).toContain('await cancelledPredictiveBack.completion()');
    expect(spec).toContain('androidAppIsResumed');
    expect(spec).toContain('const rootPredictiveBack = beginAndroidPredictiveBackGesture()');
    expect(spec).toContain('Idle Practice root trapped Predictive Back');
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
