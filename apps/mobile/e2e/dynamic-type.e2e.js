const { execFileSync } = require('child_process');
const { runAndroidAdbShell } = require('./androidAdbShell');
const {
  elementText,
  launchWithDisabledSynchronization,
  selectTestPuzzleSource,
  sleep,
  startPracticeMode,
  waitForVisibleInPracticeScroll,
} = require('./helpers');

// A live text size change (#637) must keep the app running and re-lay out text in
// place. Before the fix, iOS kept single-line labels whose props did not change
// (such as "Got it" and the Run Start button) at their old size until relaunch,
// and Android restarted the activity, which dropped an in-progress Run.
const MEASURED_IDS = ['practice-sprint-rules-dismiss', 'practice-run-start'];
// Frames are points on iOS and pixels on Android.
const FRAME_TOLERANCE = device.getPlatform() === 'ios' ? 1 : 2;

function setLargeText(enabled) {
  if (device.getPlatform() === 'ios') {
    execFileSync('xcrun', [
      'simctl',
      'ui',
      device.id,
      'content_size',
      enabled ? 'accessibility-extra-large' : 'large',
    ]);
  } else {
    runAndroidAdbShell(['settings', 'put', 'system', 'font_scale', enabled ? '2.0' : '1.0']);
  }
}

async function measureFrames() {
  const frames = {};
  for (const testID of MEASURED_IDS) {
    await waitFor(element(by.id(testID))).toExist().withTimeout(30000);
    frames[testID] = (await element(by.id(testID)).getAttributes()).frame;
  }
  return frames;
}

async function launchPracticeHome(options) {
  await launchWithDisabledSynchronization(options);
  await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
}

async function startStandardRun(options) {
  await launchPracticeHome({
    ...options,
    newInstance: true,
    launchArgs: {
      chessticizePuzzleSelectionId: '04Phf',
      chessticizePuzzleSelectionSeed: 'promotion-responsiveness-v1',
    },
  });
  await selectTestPuzzleSource('familiar15');
  await startPracticeMode('standard');
  await waitForVisibleInPracticeScroll('session-board');
}

describe('Live text size change (#637)', () => {
  beforeEach(() => {
    setLargeText(false);
  });

  afterAll(() => {
    setLargeText(false);
  });

  it('re-lays out unchanged single-line labels without a relaunch', async () => {
    await launchPracticeHome({ delete: true, newInstance: true });
    const before = await measureFrames();

    setLargeText(true);
    await sleep(3000);
    const live = await measureFrames();

    await device.terminateApp();
    await launchPracticeHome({ newInstance: true });
    const relaunched = await measureFrames();

    // Sanity check that the large size took effect; a control may keep its
    // minimum touch height, so only one measured label has to grow.
    if (!MEASURED_IDS.some((testID) => relaunched[testID].height > before[testID].height)) {
      throw new Error(`No measured label grew with large text: ${JSON.stringify({ before, relaunched })}`);
    }
    for (const testID of MEASURED_IDS) {
      if (Math.abs(live[testID].height - relaunched[testID].height) > FRAME_TOLERANCE) {
        throw new Error(
          `${testID} height after the live change (${live[testID].height}) does not match a ` +
            `fresh launch at the same size (${relaunched[testID].height})`
        );
      }
    }
  });

  it('keeps an in-progress Run through a live text size change and re-lays out its clock', async () => {
    await startStandardRun({ delete: true });
    await sleep(2000);
    const puzzleBefore = await elementText('session-current-puzzle-id');
    const clockBefore = await elementText('session-timer');

    setLargeText(true);
    await sleep(4000);

    await waitFor(element(by.id('session-board'))).toExist().withTimeout(10000);
    const puzzleAfter = await elementText('session-current-puzzle-id');
    const clockAfter = await elementText('session-timer');
    if (puzzleAfter !== puzzleBefore) {
      throw new Error(`The Run changed puzzle across the text size change: ${puzzleBefore} -> ${puzzleAfter}`);
    }
    if (clockAfter === clockBefore) {
      throw new Error(`The Run clock stopped across the text size change at ${clockBefore}`);
    }

    // The clock re-renders every second, so it also catches a React commit that
    // restores pre-change text measurements.
    const liveClock = (await element(by.id('session-timer')).getAttributes()).frame;
    await device.terminateApp();
    await startStandardRun({});
    const freshClock = (await element(by.id('session-timer')).getAttributes()).frame;
    if (Math.abs(liveClock.height - freshClock.height) > FRAME_TOLERANCE) {
      throw new Error(
        `The Run clock height after the live change (${liveClock.height}) does not match a ` +
          `fresh launch at the same size (${freshClock.height})`
      );
    }
  });
});
