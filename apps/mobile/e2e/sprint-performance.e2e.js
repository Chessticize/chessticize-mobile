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

const USER_MOVES_BY_PUZZLE = {
  'test-dual-mate-in-one': ['c2b1'],
  '000hf': ['e2e6', 'e6f7'],
  '00Kbj': ['f4g3', 'a2a1', 'a1d1'],
  '00VoA': ['c2c6', 'c1c6'],
  '07KI8': ['d2c4', 'f2h2', 'g1h2'],
  '04wsf': ['b5c7', 'f4c7'],
  '08Hmx': ['e3e8', 'e8b8'],
  '0AqXs': ['b8f8'],
  '0DR07': ['h4g3', 'f8f2', 'g3f2'],
  '01gEg': ['d8d3', 'g3h1'],
  '00tgU': ['d5e7', 'g6h7'],
  '04QUG': ['c7d6', 'e8e1', 'g7c3', 'c3f6'],
  '063T7': ['d7h3', 'h3h2'],
  '00qk4': ['b4c2', 'd8d1'],
  '04Phf': ['d4f5', 'f5d6', 'e4e5', 'e5e6', 'e6e7']
};
const FLIPPED_PUZZLE_IDS = new Set(['00Kbj', '08Hmx', '0DR07', '01gEg', '04QUG', '063T7', '00qk4']);
const FIXED_USER_MOVES = [
  'test-dual-mate-in-one',
  '000hf',
  '00Kbj',
  '00VoA',
  '07KI8',
  '04wsf',
  '08Hmx',
  '0AqXs',
  '0DR07',
  '01gEg',
  '00tgU',
  '04QUG',
  '063T7',
  '00qk4',
  '04Phf'
].flatMap((puzzleId) => USER_MOVES_BY_PUZZLE[puzzleId].map((move) => ({
  flipped: FLIPPED_PUZZLE_IDS.has(puzzleId),
  move,
  puzzleId
})));

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
