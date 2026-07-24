const { execFileSync } = require('node:child_process');
const {
  elementText,
  launchWithDisabledSynchronization,
  openTab,
  playBoardMove,
  selectTestPuzzleSource,
  sleep,
  startPracticeMode,
  waitForElementTextContaining,
  waitForRunningStockfishDepth,
  waitForVisibleInPracticeScroll,
} = require('./helpers');
const { sampleProcessFootprint } = require('./resourceFootprint');
const {
  FAMILIAR_15_PUZZLES,
  familiar15ArrowDuelStartingPosition,
  familiar15StartingPosition,
  familiar15UserMoves,
} = require('./familiar15Fixture');

const COMPLETED_PUZZLE_TARGET = 50;
const COMPLETED_PUZZLES_PER_SPRINT = 10;
const RESOURCE_SAMPLE_INTERVAL = 5;
const FEEDBACK_SETTLE_MS = 1_200;
// Calibrated from the fixed 50-puzzle Standard/Arrow runs with at least
// 64 MB of peak headroom and 32 MB over the observed second-half growth.
const GAMEPLAY_PEAK_NON_CG_BUDGET_KB = 256 * 1024;
const GAMEPLAY_FINAL_NON_CG_BUDGET_KB = 256 * 1024;
const GAMEPLAY_TAIL_NON_CG_BUDGET_KB = 128 * 1024;
const STOCKFISH_RUNS = 20;
const STOCKFISH_PEAK_NON_CG_BUDGET_KB = 128 * 1024;
const STOCKFISH_FINAL_NON_CG_BUDGET_KB = 128 * 1024;
const THREAD_GROWTH_BUDGET = 8;
const FIXTURE_BY_ID = new Map(FAMILIAR_15_PUZZLES.map((puzzle) => [puzzle.id, puzzle]));
const STOCKFISH_POSITIONS = ['queen-capture', 'mate-net', 'middlegame'];

jest.setTimeout(15 * 60 * 1000);

describe('Practice resource soak', () => {
  beforeAll(() => {
    requireSimulatorUdid();
  });

  it('keeps Standard feedback and resources bounded across 50 completed puzzles', async () => {
    await launchResourceSoakApp({
      chessticizeStandardTargetCorrect: String(COMPLETED_PUZZLES_PER_SPRINT),
    });
    const result = await runGameplaySoak('standard');

    reportGameplayResult('standard', result);
    assertLatencyBudget('Standard', result.latenciesMs);
    assertGameplayResourceBudget('Standard', result.resourceSamples);
  });

  it('keeps Arrow Duel feedback and resources bounded across 50 completed puzzles', async () => {
    await launchResourceSoakApp({
      chessticizeArrowDuelTargetCorrect: String(COMPLETED_PUZZLES_PER_SPRINT),
    });
    const result = await runGameplaySoak('arrow-duel');

    reportGameplayResult('arrow-duel', result);
    assertLatencyBudget('Arrow Duel', result.latenciesMs);
    assertGameplayResourceBudget('Arrow Duel', result.resourceSamples);
  });

  it('reuses native Stockfish resources across repeated completion and cancellation', async () => {
    await launchResourceSoakApp();
    await openTab('settings-tab', 'settings-stockfish-diagnostics');
    await element(by.id('settings-stockfish-diagnostics')).tap();
    await waitFor(element(by.id('stockfish-diagnostics-run'))).toBeVisible().withTimeout(10000);

    // The panel's first bounded depth-20 request absorbs NNUE and
    // transposition-table initialization before the leak baseline.
    await waitForElementTextContaining('stockfish-diagnostics-status', 'Done', 120000);
    await waitFor(element(by.id('stockfish-diagnostics-line-0'))).toExist().withTimeout(10000);
    const resourceSamples = [{ run: 0, ...readAppResourceSample() }];
    let selectedPosition = STOCKFISH_POSITIONS[0];

    for (let run = 1; run <= STOCKFISH_RUNS; run += 1) {
      const position = STOCKFISH_POSITIONS[run % STOCKFISH_POSITIONS.length];
      console.log(`[RESOURCE_SOAK_STOCKFISH_RUN] ${run}/${STOCKFISH_RUNS} starting ${position}`);
      selectedPosition = await startStockfishRun(position, selectedPosition);

      if (run % 2 === 0) {
        const replacement = STOCKFISH_POSITIONS[(run + 1) % STOCKFISH_POSITIONS.length];
        console.log(
          `[RESOURCE_SOAK_STOCKFISH_RUN] ${run}/${STOCKFISH_RUNS} cancelling into ${replacement}`
        );
        selectedPosition = await startStockfishRun(replacement, selectedPosition);
      }

      await waitForElementTextContaining('stockfish-diagnostics-status', 'Done', 120000);
      await waitFor(element(by.id('stockfish-diagnostics-line-0'))).toExist().withTimeout(10000);
      console.log(`[RESOURCE_SOAK_STOCKFISH_RUN] ${run}/${STOCKFISH_RUNS} complete`);
      if (run % RESOURCE_SAMPLE_INTERVAL === 0 || run === STOCKFISH_RUNS) {
        resourceSamples.push({ run, ...readAppResourceSample() });
      }
    }

    console.log(`[RESOURCE_SOAK_STOCKFISH] ${JSON.stringify(resourceSamples)}`);
    assertResourceGrowth({
      label: 'Stockfish',
      samples: resourceSamples,
      peakNonCgBudgetKb: STOCKFISH_PEAK_NON_CG_BUDGET_KB,
      finalNonCgBudgetKb: STOCKFISH_FINAL_NON_CG_BUDGET_KB,
    });
  });
});

async function startStockfishRun(position, selectedPosition) {
  if (position === selectedPosition) {
    await element(by.id('stockfish-diagnostics-run')).tap();
  } else {
    await element(by.id(`stockfish-diagnostics-position-${position}`)).tap();
  }
  await sleep(150);
  await waitForRunningStockfishDepth(
    'stockfish-diagnostics-status',
    4,
    90000,
    { pollIntervalMs: 500 }
  );
  return position;
}

async function launchResourceSoakApp(launchArgs = {}) {
  await launchWithDisabledSynchronization({
    newInstance: true,
    delete: true,
    launchArgs,
  });
  await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
}

async function runGameplaySoak(mode) {
  await selectTestPuzzleSource('familiar15');
  await startPracticeMode(mode);
  await waitForVisibleInPracticeScroll('session-board');

  const latenciesMs = [];
  const resourceSamples = [];
  for (let completed = 1; completed <= COMPLETED_PUZZLE_TARGET; completed += 1) {
    const puzzleId = await elementText('session-current-puzzle-id');
    const puzzle = FIXTURE_BY_ID.get(puzzleId);
    if (!puzzle) {
      throw new Error(`Unknown Familiar 15 puzzle ${puzzleId} at completed count ${completed - 1}`);
    }

    const startingPosition = mode === 'arrow-duel'
      ? familiar15ArrowDuelStartingPosition(puzzle)
      : familiar15StartingPosition(puzzle);
    const flipped = startingPosition.turn() === 'b';
    await waitFor(element(by.id('practice-prompt-side-glyph'))).toExist().withTimeout(10000);
    const moves = mode === 'arrow-duel'
      ? [puzzle.stockfishBestMove]
      : familiar15UserMoves(puzzle);
    if (moves.length === 0 || moves.some((move) => !move)) {
      throw new Error(`Fixture ${puzzleId} has no ${mode} answer`);
    }

    if (mode === 'arrow-duel') {
      await waitFor(element(by.id('arrow-duel-candidate-overlay'))).toExist().withTimeout(15000);
    }
    for (const move of moves) {
      const startedAt = Date.now();
      await playBoardMove('session-board', move, flipped);
      await waitFor(element(by.id('move-feedback-overlay'))).toExist().withTimeout(10000);
      latenciesMs.push(Date.now() - startedAt);
      // Do not poll visibility while the 800 ms feedback overlay is expected
      // to remain on screen. EarlGrey rasterizes the hierarchy for each
      // visibility poll, and those test-only CG buffers can dwarf app memory
      // during a soak. One post-settle assertion still proves the transition.
      await sleep(FEEDBACK_SETTLE_MS);
      await waitFor(element(by.id('move-feedback-overlay'))).not.toExist().withTimeout(15000);
    }

    const completedInSprint = ((completed - 1) % COMPLETED_PUZZLES_PER_SPRINT) + 1;
    if (completedInSprint === COMPLETED_PUZZLES_PER_SPRINT) {
      await waitFor(element(by.text('Sprint complete'))).toBeVisible().withTimeout(30000);
    } else {
      await waitFor(element(by.id('session-progress')))
        .toHaveText(`${completedInSprint} / ${COMPLETED_PUZZLES_PER_SPRINT}`)
        .withTimeout(15000);
    }

    if (completed % RESOURCE_SAMPLE_INTERVAL === 0) {
      resourceSamples.push({ completed, ...readAppResourceSample() });
    }

    if (
      completedInSprint === COMPLETED_PUZZLES_PER_SPRINT
      && completed < COMPLETED_PUZZLE_TARGET
    ) {
      await element(by.id('play-again-button')).tap();
      await waitFor(element(by.id('session-board'))).toExist().withTimeout(15000);
      await waitFor(element(by.id('session-progress')))
        .toHaveText(`0 / ${COMPLETED_PUZZLES_PER_SPRINT}`)
        .withTimeout(15000);
    }
  }

  return { latenciesMs, resourceSamples };
}

function reportGameplayResult(mode, result) {
  const early = result.latenciesMs.slice(0, 5);
  const late = result.latenciesMs.slice(-5);
  console.log(`[RESOURCE_SOAK_${mode.toUpperCase().replace('-', '_')}] ${JSON.stringify({
    early,
    earlyMedian: median(early),
    late,
    lateMedian: median(late),
    resourceSamples: result.resourceSamples,
  })}`);
}

function assertLatencyBudget(label, latenciesMs) {
  const earlyMedian = median(latenciesMs.slice(0, 5));
  const lateMedian = median(latenciesMs.slice(-5));
  const allowedLateMedian = earlyMedian * 1.5 + 250;
  if (lateMedian > allowedLateMedian) {
    throw new Error(
      `${label} late feedback median ${lateMedian}ms exceeded ${allowedLateMedian}ms `
      + `from early median ${earlyMedian}ms`
    );
  }
}

function assertGameplayResourceBudget(label, samples) {
  if (samples[0]?.completed !== RESOURCE_SAMPLE_INTERVAL) {
    throw new Error(`${label} resource baseline was not captured after warmup`);
  }
  assertResourceGrowth({
    label,
    samples,
    peakNonCgBudgetKb: GAMEPLAY_PEAK_NON_CG_BUDGET_KB,
    finalNonCgBudgetKb: GAMEPLAY_FINAL_NON_CG_BUDGET_KB,
  });

  const tailSamples = samples.filter((sample) => sample.completed >= COMPLETED_PUZZLE_TARGET / 2);
  const tailBaseline = tailSamples[0];
  if (!tailBaseline) {
    throw new Error(`${label} resource soak did not capture a tail baseline`);
  }
  const tailPeakGrowthKb = Math.max(...tailSamples.map((sample) => sample.nonCgDirtyKb))
    - tailBaseline.nonCgDirtyKb;
  if (tailPeakGrowthKb > GAMEPLAY_TAIL_NON_CG_BUDGET_KB) {
    throw new Error(
      `${label} tail non-CG footprint grew ${tailPeakGrowthKb} KB, exceeding `
      + `${GAMEPLAY_TAIL_NON_CG_BUDGET_KB} KB after ${tailBaseline.completed} puzzles`
    );
  }
}

function assertResourceGrowth({
  label,
  samples,
  peakNonCgBudgetKb,
  finalNonCgBudgetKb,
}) {
  if (samples.length < 2) {
    throw new Error(`${label} resource soak needs at least two samples`);
  }
  const processIds = new Set(samples.map((sample) => sample.pid));
  if (processIds.size !== 1) {
    throw new Error(`${label} process changed during the resource soak`);
  }
  const baseline = samples[0];
  const final = samples[samples.length - 1];
  const peakNonCgGrowthKb = Math.max(...samples.map((sample) => sample.nonCgDirtyKb))
    - baseline.nonCgDirtyKb;
  const finalNonCgGrowthKb = final.nonCgDirtyKb - baseline.nonCgDirtyKb;
  const peakThreadGrowth = Math.max(...samples.map((sample) => sample.threads)) - baseline.threads;

  if (peakNonCgGrowthKb > peakNonCgBudgetKb) {
    throw new Error(
      `${label} peak non-CG footprint grew ${peakNonCgGrowthKb} KB, exceeding `
      + `${peakNonCgBudgetKb} KB`
    );
  }
  if (finalNonCgGrowthKb > finalNonCgBudgetKb) {
    throw new Error(
      `${label} final non-CG footprint grew ${finalNonCgGrowthKb} KB, exceeding `
      + `${finalNonCgBudgetKb} KB`
    );
  }
  if (peakThreadGrowth > THREAD_GROWTH_BUDGET) {
    throw new Error(
      `${label} thread count grew by ${peakThreadGrowth}, exceeding ${THREAD_GROWTH_BUDGET}`
    );
  }
}

function median(values) {
  if (values.length === 0) {
    throw new Error('Cannot take the median of an empty sample');
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function requireSimulatorUdid() {
  const detoxDeviceUdid = typeof device === 'undefined' ? '' : String(device.id ?? '').trim();
  const configuredUdid = process.env.CHESSTICIZE_RESOURCE_SOAK_SIMULATOR_UDID?.trim();
  const simulatorUdid = detoxDeviceUdid || configuredUdid;
  if (!simulatorUdid) {
    throw new Error(
      'Detox did not expose an allocated simulator UDID for the resource soak; '
      + 'RSS/thread assertions cannot be skipped'
    );
  }
  return simulatorUdid;
}

function readAppResourceSample() {
  const simulatorUdid = requireSimulatorUdid();
  const rows = execFileSync(
    '/bin/ps',
    ['-axo', 'pid=,rss=,command='],
    { encoding: 'utf8' }
  ).split('\n');
  const row = rows.find((candidate) =>
    candidate.includes(`/CoreSimulator/Devices/${simulatorUdid}/`)
    && candidate.includes('/Chessticize.app/Chessticize')
  );
  if (!row) {
    throw new Error(`Could not find Chessticize process for simulator ${simulatorUdid}`);
  }
  const match = row.trim().match(/^(\d+)\s+(\d+)\s+/);
  if (!match) {
    throw new Error(`Could not parse Chessticize resources from ${row}`);
  }
  const pid = Number(match[1]);
  const threadRows = execFileSync(
    '/bin/ps',
    ['-M', '-p', String(pid)],
    { encoding: 'utf8' }
  ).trim().split('\n').slice(1);
  const {
    totalDirtyKb,
    cgRasterDirtyKb,
    nonCgDirtyKb,
  } = sampleProcessFootprint(pid);
  return {
    pid,
    rssKb: Number(match[2]),
    threads: threadRows.length,
    totalDirtyKb,
    cgRasterDirtyKb,
    nonCgDirtyKb,
  };
}
