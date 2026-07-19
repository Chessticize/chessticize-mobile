const { execFileSync } = require('node:child_process');
const {
  boardPoint,
  frameFor,
  launchWithDisabledSynchronization,
  selectTestPuzzleSource,
  sleep,
  startPracticeMode,
  waitForVisibleInPracticeScroll
} = require('./helpers');
const {
  FAMILIAR_15_PUZZLES,
  familiar15StartingPosition,
  familiar15UserMoves,
} = require('./familiar15Fixture');

const FIXED_USER_MOVES = FAMILIAR_15_PUZZLES.flatMap((puzzle) => {
  const flipped = familiar15StartingPosition(puzzle).turn() === 'b';
  return familiar15UserMoves(puzzle, { stopBeforePromotion: true }).map((move) => ({
    flipped,
    move,
    puzzleId: puzzle.id,
  }));
});

describe('Sprint performance', () => {
  beforeEach(async () => {
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: process.env.CHESSTICIZE_PERF_PRESERVE_DATA !== '1'
    });
  });

  it('keeps late-sprint board feedback close to early-sprint latency', async () => {
    await selectTestPuzzleSource('familiar15');
    await startPracticeMode('standard');
    await waitForVisibleInPracticeScroll('session-board');

    if (process.env.CHESSTICIZE_PERF_SCENARIO === 'idle') {
      const idleRssSamplesKb = [{ elapsedSeconds: 0, rssKb: readAppRssKb() }];
      for (let sample = 1; sample <= 7; sample += 1) {
        await sleep(10_000);
        idleRssSamplesKb.push({ elapsedSeconds: sample * 10, rssKb: readAppRssKb() });
      }
      console.log(`[SPRINT_PERF_IDLE_RSS_KB] ${JSON.stringify(idleRssSamplesKb)}`);
      return;
    }

    const configuredMoveLimit = Number(process.env.CHESSTICIZE_PERF_MOVE_LIMIT ?? FIXED_USER_MOVES.length);
    const measuredSteps = FIXED_USER_MOVES.slice(0, configuredMoveLimit);
    const latencies = [];
    const rssSamplesKb = [{ move: 0, rssKb: readAppRssKb() }];
    for (const [index, step] of measuredSteps.entries()) {
      console.log(`[SPRINT_PERF_MOVE] ${index + 1}/${measuredSteps.length} ${step.puzzleId} ${step.move}`);
      try {
        latencies.push(await measureBoardFeedbackLatency(step.move, step.flipped));
      } catch (error) {
        const progress = await element(by.id('session-progress')).getAttributes();
        const side = await element(by.id('session-side-to-move')).getAttributes();
        const screenshot = await device.takeScreenshot(`sprint-perf-failure-${index + 1}-${step.move}`);
        console.log(`[SPRINT_PERF_FAILURE] progress=${JSON.stringify(progress)} side=${JSON.stringify(side)} screenshot=${screenshot}`);
        throw error;
      }
      await sleep(1200);
      await waitFor(element(by.id('move-feedback-overlay'))).not.toExist().withTimeout(10000);
      if ((index + 1) % 5 === 0 || index + 1 === measuredSteps.length) {
        rssSamplesKb.push({ move: index + 1, rssKb: readAppRssKb() });
      }
    }

    const early = latencies.slice(0, 5);
    const late = latencies.slice(-5);
    const earlyMedian = median(early);
    const lateMedian = median(late);
    const result = {
      early,
      earlyMedian,
      late,
      lateMedian,
      ratio: lateMedian / earlyMedian
    };
    console.log(`[SPRINT_PERF] ${JSON.stringify(result)}`);
    console.log(`[SPRINT_PERF_RSS_KB] ${JSON.stringify(rssSamplesKb)}`);

    const allowedLateMedian = earlyMedian * 1.5 + 250;
    if (lateMedian > allowedLateMedian) {
      throw new Error(`Late-sprint feedback median ${lateMedian}ms exceeded allowed ${allowedLateMedian}ms from early ${earlyMedian}ms`);
    }
    const measuredRssKb = rssSamplesKb.map((sample) => sample.rssKb).filter(Number.isFinite);
    if (measuredRssKb.length > 1) {
      const initialRssKb = measuredRssKb[0];
      const peakRssGrowthKb = Math.max(...measuredRssKb) - initialRssKb;
      // The release-tag regression peaked above 500 MB. Keep enough headroom
      // for Debug/Skia cache and GC scheduling noise while preserving a clear
      // separation from the fixed full-sprint peak (roughly 225-305 MB).
      const allowedPeakRssGrowthKb = 400 * 1024;
      if (peakRssGrowthKb > allowedPeakRssGrowthKb) {
        throw new Error(`Sprint interaction peak RSS grew ${peakRssGrowthKb} KB, exceeding the ${allowedPeakRssGrowthKb} KB budget`);
      }
    }
  });
});

async function measureBoardFeedbackLatency(move, flipped) {
  const board = element(by.id('session-board'));
  const boardFrame = await frameFor(board);
  const startedAt = Date.now();
  await board.tapAtPoint(boardPoint(boardFrame, move.slice(0, 2), flipped));
  await sleep(250);
  await board.tapAtPoint(boardPoint(boardFrame, move.slice(2, 4), flipped));
  await waitFor(element(by.id('move-feedback-overlay'))).toExist().withTimeout(10000);
  return Date.now() - startedAt;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function readAppRssKb() {
  const simulatorUdid = process.env.CHESSTICIZE_PERF_SIMULATOR_UDID;
  if (!simulatorUdid) {
    return null;
  }
  const rows = execFileSync('/bin/ps', ['-axo', 'pid=,rss=,command='], { encoding: 'utf8' }).split('\n');
  const row = rows.find((candidate) => candidate.includes(`/CoreSimulator/Devices/${simulatorUdid}/`) && candidate.includes('/Chessticize.app/Chessticize'));
  if (!row) {
    throw new Error(`Could not find Chessticize process for simulator ${simulatorUdid}`);
  }
  const match = row.trim().match(/^(\d+)\s+(\d+)\s+/);
  if (!match) {
    throw new Error(`Could not parse Chessticize RSS from ${row}`);
  }
  return Number(match[2]);
}
