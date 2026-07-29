const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const {
  launchWithDisabledSynchronization,
  openTab,
  playBoardMove,
  startPracticeMode,
  textFromAttributes
} = require('./helpers');

const puzzlePackPath = resolve(
  __dirname,
  '../../../fixtures/puzzles/bundled-core-pack.sqlite'
);
const captureHistoryProgress =
  process.env.CHESSTICIZE_CAPTURE_HISTORY_PROGRESS === '1'
    ? describe
    : describe.skip;
const runSeeds = Array.from(
  { length: 10 },
  (_, index) => `history-progress-release-${index + 1}`
);

captureHistoryProgress('History Progress Release parity', () => {
  it('matches the approved dual-metric balanced presentation in the real app', async () => {
    await launchReleaseCapture({
      deleteData: true,
      seed: runSeeds[0],
      targetCorrect: runSeeds.length
    });
    await dismissFirstUseRules();
    await startPracticeMode('standard');

    const puzzleIDs = new Set();
    for (const index of runSeeds.keys()) {
      const fixture = await resolveDisplayedStandardFixture();
      puzzleIDs.add(fixture.puzzleID);
      await playBoardMove('session-board', fixture.correctMove, fixture.flipped);
      if (index === runSeeds.length - 1) {
        await waitFor(element(by.text('Sprint complete')))
          .toBeVisible()
          .withTimeout(30000);
      } else {
        await waitFor(element(by.id('session-progress')))
          .toHaveText(`${index + 1} / ${runSeeds.length}`)
          .withTimeout(15000);
      }
    }

    if (puzzleIDs.size !== runSeeds.length) {
      throw new Error(
        `Expected ${runSeeds.length} distinct release puzzles, received ${puzzleIDs.size}`
      );
    }

    await element(by.id('back-practice-button')).tap();
    await openTab('history-tab', 'history-filter-toggle');
    await waitFor(element(by.id('history-progress-button')))
      .toExist()
      .withTimeout(30000);
    await element(by.id('history-progress-button')).tap();
    await waitFor(element(by.id('history-progress-screen')))
      .toExist()
      .withTimeout(30000);
    await element(by.id('practice-main-scroll')).scrollTo('top');

    await expect(element(by.id('history-progress-early-estimate'))).toExist();
    await expect(element(by.id('history-balanced-check'))).toExist();
    await expect(element(by.id('history-progress-metric-solve_rate'))).toExist();
    await expect(element(by.id('history-progress-metric-completed_speed'))).toExist();
    await expect(element(by.text('Accuracy'))).toExist();
    await expect(element(by.text('Solve time'))).toExist();
    await expect(element(by.text(/\d+%/)).atIndex(0)).toExist();
    await expect(element(by.text(/\d+\.\d{2}×/)).atIndex(0)).toExist();

    await device.takeScreenshot('history-progress-balanced-dual-metric-release');
  });
});

async function launchReleaseCapture({ deleteData, seed, targetCorrect }) {
  await launchWithDisabledSynchronization({
    delete: deleteData,
    launchArgs: {
      chessticizePuzzleSelectionSeed: seed,
      chessticizeStandardTargetCorrect: String(targetCorrect),
      chessticizeStoreAssetCapture: '1'
    },
    newInstance: true
  });
  await device.setOrientation('portrait');
}

async function dismissFirstUseRules() {
  await waitFor(element(by.id('practice-sprint-rules-guide')))
    .toExist()
    .withTimeout(180000);
  await element(by.id('practice-sprint-rules-dismiss')).tap();
  await waitFor(element(by.id('practice-run-standard')))
    .toExist()
    .withTimeout(10000);
}

async function resolveDisplayedStandardFixture() {
  await waitFor(element(by.id('session-current-puzzle-id')))
    .toExist()
    .withTimeout(10000);
  const puzzleID = textFromAttributes(
    await element(by.id('session-current-puzzle-id')).getAttributes()
  );
  const escapedID = puzzleID.replaceAll("'", "''");
  const query = [
    "SELECT initial_fen || char(9) || solution_moves",
    "FROM puzzles",
    `WHERE id = '${escapedID}';`
  ].join(' ');
  const rows = execFileSync('/usr/bin/sqlite3', [puzzlePackPath, query], {
    encoding: 'utf8'
  })
    .trim()
    .split('\n')
    .filter(Boolean);
  if (rows.length !== 1) {
    throw new Error(`Expected bundled puzzle ${puzzleID}, found ${rows.length}`);
  }
  const [initialFen, solutionMoves] = rows[0].split('\t');
  const moves = solutionMoves?.trim().split(/\s+/) ?? [];
  const correctMove = moves[1];
  const initialSideToMove = initialFen?.trim().split(/\s+/)[1];
  if (
    !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(correctMove ?? '')
    || (initialSideToMove !== 'w' && initialSideToMove !== 'b')
  ) {
    throw new Error(`Invalid Standard fixture metadata for ${puzzleID}`);
  }
  return {
    correctMove,
    flipped: initialSideToMove === 'w',
    puzzleID
  };
}
