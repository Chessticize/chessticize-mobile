const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const {
  launchWithDisabledSynchronization,
  openTab,
  playBoardMove,
  sleep,
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
const runCount = 4;
const puzzlesPerRun = 5;
const expectedPuzzleCount = runCount * puzzlesPerRun;

captureHistoryProgress('History Progress Release parity', () => {
  it('matches the approved dual-metric balanced presentation in the real app', async () => {
    const puzzleIDs = new Set();
    for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
      await launchReleaseCapture({
        deleteData: runIndex === 0,
        seed: `history-progress-release-${runIndex + 1}`,
        targetCorrect: puzzlesPerRun
      });
      if (runIndex === 0) {
        await dismissFirstUseRules();
      }
      await startPracticeMode('standard');

      for (let puzzleIndex = 0; puzzleIndex < puzzlesPerRun; puzzleIndex += 1) {
        const fixture = await resolveDisplayedStandardFixture();
        console.log(
          `[history-progress-fixture] ${JSON.stringify(fixture)}`
        );
        puzzleIDs.add(fixture.puzzleID);
        for (const turn of fixture.turns) {
          await waitForBoardLabel(turn.readyBoardLabel);
          await playBoardMove('session-board', turn.correctMove, fixture.flipped);
        }
        if (puzzleIndex < puzzlesPerRun - 1) {
          await waitFor(element(by.id('session-progress')))
            .toHaveText(`${puzzleIndex + 1} / ${puzzlesPerRun}`)
            .withTimeout(15000);
          await waitForPuzzleIDChange(fixture.puzzleID);
          continue;
        }

        await waitFor(element(by.text('Sprint complete')))
          .toBeVisible()
          .withTimeout(30000);
      }
    }

    if (puzzleIDs.size !== expectedPuzzleCount) {
      throw new Error(
        `Expected ${expectedPuzzleCount} distinct release puzzles, received ${puzzleIDs.size}`
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
    await element(by.id('practice-main-scroll')).scrollTo('bottom');
    await expect(element(by.id('history-balanced-check'))).toBeVisible();
    await device.takeScreenshot('history-progress-balanced-check-release');
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
  const correctMoves = moves.filter((_, index) => index % 2 === 1);
  const initialSideToMove = initialFen?.trim().split(/\s+/)[1];
  if (
    correctMoves.length === 0
    || moves.some(
      (move) => !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)
    )
    || (initialSideToMove !== 'w' && initialSideToMove !== 'b')
  ) {
    throw new Error(`Invalid Standard fixture metadata for ${puzzleID}`);
  }
  const userSideLabel = initialSideToMove === 'w' ? 'Black' : 'White';
  const turns = correctMoves.map((correctMove, index) => {
    const precedingAutoMove = moves[index * 2];
    return {
      correctMove,
      readyBoardLabel: `Chess board. ${userSideLabel} to move. Last move ${precedingAutoMove.slice(0, 2)} to ${precedingAutoMove.slice(2, 4)}`
    };
  });
  return {
    flipped: initialSideToMove === 'w',
    puzzleID,
    turns
  };
}

async function waitForBoardLabel(expectedLabel, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let actualLabel = '';
  while (Date.now() < deadline) {
    actualLabel = textFromAttributes(
      await element(by.id('session-board')).getAttributes()
    );
    if (actualLabel === expectedLabel) {
      return;
    }
    await sleep(100);
  }
  throw new Error(
    `Expected session board label "${expectedLabel}", received "${actualLabel}"`
  );
}

async function waitForPuzzleIDChange(previousPuzzleID, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let currentPuzzleID = previousPuzzleID;
  while (Date.now() < deadline) {
    currentPuzzleID = textFromAttributes(
      await element(by.id('session-current-puzzle-id')).getAttributes()
    );
    if (currentPuzzleID && currentPuzzleID !== previousPuzzleID) {
      return;
    }
    await sleep(100);
  }
  throw new Error(
    `Expected puzzle ID to change from "${previousPuzzleID}", received "${currentPuzzleID}"`
  );
}
