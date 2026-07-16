const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { androidAdbPath } = require('./androidNetwork');

const ANDROID_UI_DIAGNOSTICS_DIR = path.resolve(__dirname, '../artifacts/android-ui');
const PREDICTIVE_BACK_STARTED_MARKER = 'CHESSTICIZE_PREDICTIVE_BACK_STARTED';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function frameFor(detoxElement) {
  const attributes = await detoxElement.getAttributes();
  if (Array.isArray(attributes)) {
    return attributes[0].frame;
  }
  return attributes.frame;
}

async function playBoardMove(testID, move, flipped = false) {
  const board = element(by.id(testID));
  const boardFrame = await frameFor(board);
  const platform = device.getPlatform();
  const androidMetrics = platform === 'android' ? androidDisplayMetrics() : null;
  const pointForSquare = (square) => {
    if (!androidMetrics) {
      return boardPoint(boardFrame, square, flipped);
    }
    return androidBoardTapPoint(boardFrame, square, flipped, androidMetrics).point;
  };
  if (androidMetrics) {
    const { units } = androidBoardTapPoint(boardFrame, move.slice(0, 2), flipped, androidMetrics);
    console.log(
      `[android-board-tap] units=${units} frame=${boardFrame.width}x${boardFrame.height} `
      + `display=${androidMetrics.widthPixels}x${androidMetrics.heightPixels}@${androidMetrics.densityDpi}`
    );
  }
  await board.tapAtPoint(pointForSquare(move.slice(0, 2)));
  await sleep(250);
  await board.tapAtPoint(pointForSquare(move.slice(2, 4)));
}

async function startPracticeMode(mode) {
  const modeCardId = `practice-mode-${mode}`;
  await waitForVisibleInPracticeScroll(modeCardId);
  await element(by.id(modeCardId)).tap();
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await waitFor(element(by.id('practice-start-button'))).toBeVisible().withTimeout(10000);
  await tapUntilExists('practice-start-button', 'session-board', 3);
}

function bringAndroidAppToForeground(
  launchArgs = {},
  environment = process.env,
  run = execFileSync
) {
  const adb = androidAdbPath(environment);
  const serial = environment.DETOX_ANDROID_DEVICE || 'emulator-5554';
  const args = [
    '-s',
    serial,
    'shell',
    'am',
    'start',
    '-W',
    '-n',
    'com.chessticize.mobile/.MainActivity',
  ];
  for (const [key, value] of Object.entries(launchArgs)) {
    if (value !== undefined && value !== null) {
      args.push('--es', key, String(value));
    }
  }
  run(adb, args, { encoding: 'utf8' });
}

function findAndroidSystemNode(hierarchy, candidates, { exact = false } = {}) {
  const nodes = hierarchy.match(/<node\b[^>]*\/>/g) ?? [];
  const normalizedCandidates = candidates.map((candidate) => String(candidate).toLowerCase());
  return nodes.find((node) => {
    const attributes = ['resource-id', 'text', 'content-desc'].map((attribute) =>
      node.match(new RegExp(`${attribute}="([^"]*)"`))?.[1]?.toLowerCase() ?? ''
    );
    return normalizedCandidates.some((candidate) => attributes.some((value) => {
      if (exact) {
        return value === candidate || value.endsWith(`/id/${candidate}`);
      }
      return value.includes(candidate);
    }));
  }) ?? null;
}

function findPendingAndroidAlarms(state, action) {
  const lines = state.split('\n');
  const pendingHeader = /^(\s*)(\d+) pending alarms:\s*$/;
  const pendingHeaderIndex = lines.findIndex((line) => pendingHeader.test(line));
  if (pendingHeaderIndex < 0) {
    throw new Error('Android alarm state omitted the pending alarms section');
  }
  const headerMatch = lines[pendingHeaderIndex].match(pendingHeader);
  const pendingIndent = headerMatch[1].length;
  const declaredPendingCount = Number(headerMatch[2]);
  const nextSectionOffset = lines.slice(pendingHeaderIndex + 1).findIndex((line) => {
    if (!line.trim()) {
      return false;
    }
    return (line.match(/^\s*/)?.[0].length ?? 0) <= pendingIndent;
  });
  const pendingSectionEnd = nextSectionOffset < 0
    ? lines.length
    : pendingHeaderIndex + 1 + nextSectionOffset;
  const pendingLines = lines.slice(pendingHeaderIndex + 1, pendingSectionEnd);
  const alarmHeader = /^\s*(?:RTC_WAKEUP|RTC|ELAPSED_WAKEUP|ELAPSED) #\d+:/;
  const headers = pendingLines
    .map((line, index) => alarmHeader.test(line) ? index : -1)
    .filter((index) => index >= 0);
  if (headers.length !== declaredPendingCount) {
    throw new Error(
      `Android alarm state declared ${declaredPendingCount} pending alarms but exposed ${headers.length}`
    );
  }
  return headers.flatMap((start, headerIndex) => {
    const end = headers[headerIndex + 1] ?? pendingLines.length;
    const block = pendingLines.slice(start, end).join('\n');
    if (!block.includes(action)) {
      return [];
    }
    const trigger = block.match(/\borigWhen[= ]+(\d+)/)
      ?? block.match(/\bwhenElapsed[= ]+(\d+)/)
      ?? block.match(/\bwhen[= ]+(\d+)/);
    const identity = pendingLines
      .slice(start, end)
      .find((line) => line.includes(action))
      ?.trim();
    if (!trigger || !identity) {
      throw new Error(`Android alarm omitted trigger or identity:\n${block}`);
    }
    return [{ identity, triggerMs: Number(trigger[1]), raw: block }];
  });
}

function performAndroidPredictiveBackGesture(
  environment = process.env,
  run = execFileSync
) {
  const adb = androidAdbPath(environment);
  const serial = environment.DETOX_ANDROID_DEVICE || 'emulator-5554';
  run(adb, [
    '-s', serial, 'shell', 'cmd', 'overlay', 'enable-exclusive', '--category',
    'com.android.internal.systemui.navbar.gestural'
  ], { encoding: 'utf8' });
  const sizeOutput = String(
    run(adb, ['-s', serial, 'shell', 'wm', 'size'], { encoding: 'utf8' }) ?? ''
  );
  const { widthPixels, heightPixels } = parseAndroidDisplaySize(sizeOutput);
  const centerY = Math.round(heightPixels / 2);
  const endX = Math.round(widthPixels * 0.4);
  run(adb, [
    '-s', serial, 'shell', 'input', 'swipe', '1', String(centerY), String(endX), String(centerY), '500'
  ], { encoding: 'utf8' });
}

function beginAndroidPredictiveBackGesture(
  { cancel = false, durationMs = 1800 } = {},
  environment = process.env,
  run = execFileSync,
  spawnProcess = spawn
) {
  const adb = androidAdbPath(environment);
  const serial = environment.DETOX_ANDROID_DEVICE || 'emulator-5554';
  run(adb, [
    '-s', serial, 'shell', 'cmd', 'overlay', 'enable-exclusive', '--category',
    'com.android.internal.systemui.navbar.gestural'
  ], { encoding: 'utf8' });
  const sizeOutput = String(
    run(adb, ['-s', serial, 'shell', 'wm', 'size'], { encoding: 'utf8' }) ?? ''
  );
  const { widthPixels, heightPixels } = parseAndroidDisplaySize(sizeOutput);
  if (cancel) {
    const centerY = Math.round(heightPixels / 2);
    const earlyX = Math.round(widthPixels * 0.1);
    const activatedX = Math.round(widthPixels * 0.45);
    const returningX = Math.round(widthPixels * 0.24);
    const retreatX = Math.max(2, Math.round(widthPixels * 0.03));
    const boundedDurationMs = Math.max(200, durationMs);
    const stepDelaySeconds = (boundedDurationMs / 6 / 1000).toFixed(3);
    const holdDelaySeconds = (boundedDurationMs / 2 / 1000).toFixed(3);
    const gestureScript = [
      'set -e',
      `input touchscreen motionevent DOWN 1 ${centerY}`,
      `sleep ${stepDelaySeconds}`,
      `input touchscreen motionevent MOVE ${earlyX} ${centerY}`,
      `sleep ${stepDelaySeconds}`,
      `input touchscreen motionevent MOVE ${activatedX} ${centerY}`,
      String.raw`printf '%s\n' ${PREDICTIVE_BACK_STARTED_MARKER}`,
      `sleep ${holdDelaySeconds}`,
      `input touchscreen motionevent MOVE ${returningX} ${centerY}`,
      `sleep ${stepDelaySeconds}`,
      `input touchscreen motionevent MOVE ${retreatX} ${centerY}`,
      `sleep ${stepDelaySeconds}`,
      `input touchscreen motionevent UP ${retreatX} ${centerY}`,
    ].join(' && ');
    const child = spawnProcess(
      adb,
      ['-s', serial, 'shell', 'sh', '-c', gestureScript],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stderr = '';
    let stdout = '';
    let startedSettled = false;
    let resolveStarted;
    let rejectStarted;
    const started = new Promise((resolve, reject) => {
      resolveStarted = resolve;
      rejectStarted = reject;
    });
    const completion = new Promise((resolve, reject) => {
      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk);
        if (!startedSettled && stdout.includes(PREDICTIVE_BACK_STARTED_MARKER)) {
          startedSettled = true;
          resolveStarted();
        }
      });
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.once('error', (error) => {
        if (!startedSettled) {
          startedSettled = true;
          rejectStarted(error);
        }
        reject(error);
      });
      child.once('close', (code) => {
        if (code !== 0) {
          const error = new Error(
            `Cancelled Predictive Back gesture exited ${code}: ${stderr.trim()}`
          );
          if (!startedSettled) {
            startedSettled = true;
            rejectStarted(error);
          }
          reject(error);
          return;
        }
        if (!startedSettled) {
          const error = new Error(
            `Cancelled Predictive Back gesture never emitted ${PREDICTIVE_BACK_STARTED_MARKER}.`
          );
          startedSettled = true;
          rejectStarted(error);
          reject(error);
          return;
        }
        resolve();
      });
    });
    return {
      started,
      completion: () => completion,
    };
  }
  const centerY = Math.round(heightPixels / 2);
  const endX = Math.round(widthPixels * 0.7);
  const child = spawnProcess(adb, [
    '-s', serial, 'shell', 'input', 'swipe', '1', String(centerY), String(endX), String(centerY), String(durationMs)
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const completion = new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Predictive Back gesture exited ${code}: ${stderr.trim()}`));
      }
    });
  });
  return {
    started: Promise.resolve(),
    completion: () => completion,
  };
}

function androidAppIsResumed(
  environment = process.env,
  run = execFileSync
) {
  const adb = androidAdbPath(environment);
  const serial = environment.DETOX_ANDROID_DEVICE || 'emulator-5554';
  const activityState = String(run(adb, [
    '-s', serial, 'shell', 'dumpsys', 'activity', 'activities'
  ], { encoding: 'utf8' }) ?? '');
  return activityState
    .split('\n')
    .some((line) => /(?:mResumedActivity|topResumedActivity)/.test(line)
      && line.includes('com.chessticize.mobile'));
}

function collectAndroidUiDiagnostics(
  environment = process.env,
  run = execFileSync,
  fileSystem = fs,
  log = console.log,
  outputDirectory = ANDROID_UI_DIAGNOSTICS_DIR
) {
  const adb = androidAdbPath(environment);
  const serial = environment.DETOX_ANDROID_DEVICE || 'emulator-5554';
  const runDiagnostic = (label, args, options) => {
    try {
      return run(adb, ['-s', serial, ...args], options);
    } catch (error) {
      const detail = error?.stderr ?? error?.stdout ?? error?.message ?? String(error);
      log(`[android-ui-diagnostics] ${label} failed\n${String(detail)}`);
      return null;
    }
  };
  const writeDiagnostic = (filename, contents) => {
    if (contents === null || contents === undefined) {
      return;
    }
    try {
      fileSystem.writeFileSync(path.join(outputDirectory, filename), contents);
    } catch (error) {
      log(`[android-ui-diagnostics] unable to write ${filename}: ${error?.message ?? String(error)}`);
    }
  };

  try {
    fileSystem.mkdirSync(outputDirectory, { recursive: true });
  } catch (error) {
    log(`[android-ui-diagnostics] unable to create artifact directory: ${error?.message ?? String(error)}`);
  }

  const windowDump = runDiagnostic(
    'dumpsys window',
    ['shell', 'dumpsys', 'window', 'windows'],
    { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 }
  );
  const activityDump = runDiagnostic(
    'dumpsys activity activities',
    ['shell', 'dumpsys', 'activity', 'activities'],
    { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 }
  );
  const focusSources = [windowDump, activityDump].filter((source) => source !== null);
  const focus = focusSources.length === 0
    ? null
    : focusSources
      .map(String)
      .join('\n')
      .split('\n')
      .filter((line) => /mCurrentFocus|mFocusedApp|mResumedActivity|topResumedActivity/.test(line))
      .join('\n') || '[no current focus fields found]';
  if (focus !== null) {
    log(`[android-ui-diagnostics] current focus\n${focus}`);
    writeDiagnostic('current-focus.txt', focus);
  }

  const pid = runDiagnostic(
    'pidof app',
    ['shell', 'pidof', 'com.chessticize.mobile'],
    { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 }
  );
  const processDump = runDiagnostic(
    'dumpsys activity processes',
    ['shell', 'dumpsys', 'activity', 'processes', 'com.chessticize.mobile'],
    { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 }
  );
  const processState = [
    `pid=${pid === null ? '<unavailable>' : String(pid).trim() || '<not running>'}`,
    processDump === null ? '[process dump unavailable]' : String(processDump).trim(),
  ].join('\n');
  log(`[android-ui-diagnostics] process state\n${processState}`);
  writeDiagnostic('process-state.txt', processState);

  const rawLogcat = runDiagnostic(
    'logcat',
    ['logcat', '-d', '-v', 'threadtime', '-t', '2000'],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 30000 }
  );
  const logcat = rawLogcat === null
    ? null
    : String(rawLogcat)
      .split('\n')
      .filter((line) => (
        /chessticize|ReactNative|AndroidRuntime|FATAL EXCEPTION|SoLoader|TurboModule|Hermes|ReactHost|ReactInstance|com\.facebook\.react/i
          .test(line)
      ))
      .join('\n') || '[no React Native or app logcat lines found]';
  if (logcat !== null) {
    log(`[android-ui-diagnostics] filtered logcat\n${logcat}`);
    writeDiagnostic('logcat.txt', logcat);
  }

  runDiagnostic(
    'uiautomator dump',
    ['shell', 'uiautomator', 'dump', '/sdcard/chessticize-window.xml'],
    { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 }
  );
  const hierarchy = runDiagnostic(
    'uiautomator hierarchy read',
    ['exec-out', 'cat', '/sdcard/chessticize-window.xml'],
    { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 30000 }
  );
  if (hierarchy !== null) {
    log(`[android-ui-diagnostics] hierarchy\n${String(hierarchy)}`);
    writeDiagnostic('window.xml', hierarchy);
  }

  const screenshot = runDiagnostic(
    'screenshot',
    ['exec-out', 'screencap', '-p'],
    { maxBuffer: 25 * 1024 * 1024, timeout: 30000 }
  );
  writeDiagnostic('screenshot.png', screenshot);
  log(`[android-ui-diagnostics] artifacts=${outputDirectory}`);
}

async function withAndroidUiDiagnostics(
  action,
  collectDiagnostics = collectAndroidUiDiagnostics,
  log = console.log
) {
  try {
    await action();
  } catch (error) {
    try {
      collectDiagnostics();
    } catch (diagnosticsError) {
      log(
        `[android-ui-diagnostics] collection failed: ${diagnosticsError?.message ?? String(diagnosticsError)}`
      );
    }
    throw error;
  }
}

async function launchWithDisabledSynchronization(
  options = {},
  targetDevice = device,
  foregroundAndroidApp = bringAndroidAppToForeground
) {
  const launchOptions = {
    ...options,
    launchArgs: {
      DTXDisableMainRunLoopSync: 'YES',
      detoxEnableSynchronization: 0,
      ...(options.launchArgs ?? {})
    }
  };
  await targetDevice.launchApp(launchOptions);
  if (targetDevice.getPlatform() === 'android') {
    await foregroundAndroidApp(launchOptions.launchArgs);
  }
  await targetDevice.disableSynchronization();
}

async function launchWithFreshAndroidRuntimePermission(
  resetPermission,
  launch = launchWithDisabledSynchronization
) {
  await launch({
    newInstance: true,
    delete: true,
  });
  resetPermission();
  await launch({
    newInstance: true,
    delete: false,
  });
}

async function selectTestPuzzleSource(source) {
  const sourceButtonId = `test-puzzle-source-${source}`;
  await waitForVisibleInPracticeScroll(sourceButtonId);
  await element(by.id(sourceButtonId)).tap();
}

async function waitForVisibleInPracticeScroll(testID) {
  await waitFor(element(by.id(testID))).toExist().withTimeout(180000);
  await waitFor(element(by.id(testID)))
    .toBeVisible()
    .whileElement(by.id('practice-main-scroll'))
    .scroll(100, 'down');
}

async function tapUntilExists(tapTestID, expectedTestID, attempts) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await element(by.id(tapTestID)).tap();
    try {
      await waitFor(element(by.id(expectedTestID))).toExist().withTimeout(15000);
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await waitForVisibleInPracticeScroll(tapTestID);
        await sleep(500);
      }
    }
  }
  throw lastError;
}

async function waitForElementTextContaining(testID, expected, timeoutMs, pollIntervalMs = 500) {
  const startedAt = Date.now();
  let lastText = '';
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const attributes = await element(by.id(testID)).getAttributes();
      lastText = textFromAttributes(attributes);
      if (lastText.includes(expected)) {
        return;
      }
    } catch (error) {
      lastText = error?.message ?? String(error);
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for ${testID} to contain "${expected}". Last text: "${lastText}"`);
}

async function waitForRunningStockfishDepth(
  testID,
  minimumDepth,
  timeoutMs,
  {
    comparison = 'at-least',
    now = Date.now,
    pollIntervalMs = 25,
    readText = elementText,
    wait = sleep,
  } = {}
) {
  const startedAt = now();
  let lastText = '';
  while (now() - startedAt < timeoutMs) {
    try {
      lastText = await readText(testID);
      const depth = Number(lastText.match(/Depth (\d+)\/20/)?.[1] ?? 0);
      const reachedMinimum = comparison === 'above'
        ? depth > minimumDepth
        : depth >= minimumDepth;
      if (reachedMinimum) {
        return depth;
      }
    } catch (error) {
      lastText = error?.message ?? String(error);
    }
    await wait(pollIntervalMs);
  }
  const comparisonDescription = comparison === 'above' ? ` above depth ${minimumDepth}` : '';
  throw new Error(
    `Timed out waiting for an active Stockfish search${comparisonDescription}. Last text: "${lastText}"`
  );
}

async function waitForElementAccessibilityLabelContaining(
  testID,
  expected,
  timeoutMs,
  pollIntervalMs = 500
) {
  const startedAt = Date.now();
  let lastLabel = '';
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const attributes = await element(by.id(testID)).getAttributes();
      lastLabel = accessibilityLabelFromAttributes(attributes);
      if (lastLabel.includes(expected)) {
        return;
      }
    } catch (error) {
      lastLabel = error?.message ?? String(error);
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(
    `Timed out waiting for ${testID} accessibility label to contain "${expected}". `
    + `Last label: "${lastLabel}"`
  );
}

async function waitForMistakeCount(count, timeoutMs = 30000) {
  await waitFor(element(by.label(`Mistakes ${count} of 3`)).atIndex(0)).toExist().withTimeout(timeoutMs);
}

function textFromAttributes(attributes) {
  const first = Array.isArray(attributes) ? attributes[0] : attributes;
  return String(first?.text ?? first?.label ?? first?.value ?? '');
}

async function elementText(testID) {
  const attributes = await element(by.id(testID)).getAttributes();
  return textFromAttributes(attributes);
}

function accessibilityLabelFromAttributes(attributes) {
  const first = Array.isArray(attributes) ? attributes[0] : attributes;
  return String(first?.label ?? '');
}

function boardPoint(frame, square, flipped = false) {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]);
  const squareSize = frame.width / 8;
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank - 1 : 8 - rank;
  return {
    x: (col + 0.5) * squareSize,
    y: (row + 0.5) * squareSize
  };
}

function androidDisplayMetrics(environment = process.env, run = execFileSync) {
  const adb = androidAdbPath(environment);
  const serial = environment.DETOX_ANDROID_DEVICE || 'emulator-5554';
  const densityOutput = String(
    run(adb, ['-s', serial, 'shell', 'wm', 'density'], { encoding: 'utf8' }) ?? ''
  );
  const sizeOutput = String(
    run(adb, ['-s', serial, 'shell', 'wm', 'size'], { encoding: 'utf8' }) ?? ''
  );
  return {
    densityDpi: parseAndroidDisplayDensity(densityOutput),
    ...parseAndroidDisplaySize(sizeOutput),
  };
}

function parseAndroidDisplayDensity(output) {
  const overrideDensity = output.match(/Override density:\s*(\d+)/)?.[1];
  const physicalDensity = output.match(/Physical density:\s*(\d+)/)?.[1];
  const densityDpi = Number(overrideDensity ?? physicalDensity);
  if (!Number.isFinite(densityDpi) || densityDpi <= 0) {
    throw new Error(`Unable to resolve Android display density from ${JSON.stringify(output.trim())}`);
  }
  return densityDpi;
}

function parseAndroidDisplaySize(output) {
  const overrideSize = output.match(/Override size:\s*(\d+)x(\d+)/);
  const physicalSize = output.match(/Physical size:\s*(\d+)x(\d+)/);
  const match = overrideSize ?? physicalSize;
  const widthPixels = Number(match?.[1]);
  const heightPixels = Number(match?.[2]);
  if (!Number.isFinite(widthPixels) || widthPixels <= 0 || !Number.isFinite(heightPixels) || heightPixels <= 0) {
    throw new Error(`Unable to resolve Android display size from ${JSON.stringify(output.trim())}`);
  }
  return { widthPixels, heightPixels };
}

function normalizeAndroidTapPoint(point, densityDpi) {
  if (!Number.isFinite(densityDpi) || densityDpi <= 0) {
    throw new Error(`Android display density must be positive; received ${densityDpi}`);
  }
  const densityScale = densityDpi / 160;
  return {
    x: point.x / densityScale,
    y: point.y / densityScale,
  };
}

function classifyAndroidBoardFrameUnits(frame, metrics) {
  const { densityDpi, heightPixels, widthPixels } = metrics;
  if (
    !Number.isFinite(frame?.width) || frame.width <= 0
    || !Number.isFinite(frame?.height) || frame.height <= 0
    || !Number.isFinite(widthPixels) || widthPixels <= 0
    || !Number.isFinite(heightPixels) || heightPixels <= 0
    || !Number.isFinite(densityDpi) || densityDpi <= 0
  ) {
    throw new Error('Unable to classify Android board frame units from invalid frame or display metrics');
  }

  const displayShortPixels = Math.min(widthPixels, heightPixels);
  const displayShortDp = displayShortPixels / (densityDpi / 160);
  const pixelRatio = frame.width / displayShortPixels;
  const dpRatio = frame.width / displayShortDp;
  const isBoardSized = (ratio) => ratio >= 0.65 && ratio <= 1.05;
  const couldBePixels = isBoardSized(pixelRatio);
  const couldBeDp = isBoardSized(dpRatio);

  if (couldBePixels !== couldBeDp) {
    return couldBePixels ? 'pixels' : 'dp';
  }
  throw new Error(
    `Unable to classify Android board frame units: frame=${frame.width}x${frame.height}, `
    + `display=${widthPixels}x${heightPixels}@${densityDpi}, `
    + `pixelRatio=${pixelRatio.toFixed(3)}, dpRatio=${dpRatio.toFixed(3)}`
  );
}

function androidBoardTapPoint(frame, square, flipped, metrics) {
  const units = classifyAndroidBoardFrameUnits(frame, metrics);
  const point = boardPoint(frame, square, flipped);
  return {
    point: units === 'pixels' ? normalizeAndroidTapPoint(point, metrics.densityDpi) : point,
    units,
  };
}

async function openTab(tabTestID, contentTestID) {
  await waitFor(element(by.id(tabTestID))).toExist().withTimeout(180000);
  await element(by.id(tabTestID)).tap();
  // Tabs share one scroll view, so the previous tab's scroll offset persists;
  // container panels are taller than the viewport, so assert on a child.
  await element(by.id('practice-main-scroll')).scrollTo('top');
  await waitForVisibleInPracticeScroll(contentTestID);
}

async function openStandardHistoryTrend() {
  await openTab('history-tab', 'history-action-header');
  await waitFor(element(by.id('history-rating-standard 5/20'))).toBeVisible().withTimeout(10000);
  await element(by.id('history-rating-standard 5/20')).tap();
  await waitFor(element(by.id('history-performance-card'))).toExist().withTimeout(10000);
  await waitFor(element(by.id('history-chart-line'))).toExist().withTimeout(10000);
}

async function failStandardSprint() {
  await selectTestPuzzleSource('familiar15');
  await startPracticeMode('standard');
  await waitForVisibleInPracticeScroll('session-board');

  await playBoardMove('session-board', 'c2b3');
  await waitForMistakeCount(1);
  await sleep(1600);
  await playBoardMove('session-board', 'c4b5');
  await waitForMistakeCount(2);
  await sleep(1600);
  await playBoardMove('session-board', 'g6g5', true);

  await waitFor(element(by.text('Sprint failed'))).toBeVisible().withTimeout(30000);
}

module.exports = {
  androidAppIsResumed,
  beginAndroidPredictiveBackGesture,
  bringAndroidAppToForeground,
  collectAndroidUiDiagnostics,
  elementText,
  openTab,
  openStandardHistoryTrend,
  launchWithDisabledSynchronization,
  launchWithFreshAndroidRuntimePermission,
  sleep,
  frameFor,
  findAndroidSystemNode,
  findPendingAndroidAlarms,
  playBoardMove,
  performAndroidPredictiveBackGesture,
  startPracticeMode,
  selectTestPuzzleSource,
  waitForVisibleInPracticeScroll,
  tapUntilExists,
  waitForElementAccessibilityLabelContaining,
  waitForElementTextContaining,
  waitForRunningStockfishDepth,
  withAndroidUiDiagnostics,
  accessibilityLabelFromAttributes,
  textFromAttributes,
  boardPoint,
  androidBoardTapPoint,
  parseAndroidDisplayDensity,
  parseAndroidDisplaySize,
  failStandardSprint
};
