const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { config: detoxConfig } = require('detox/internals');
const {
  completeFirstUseSessionGuides,
  elementText,
  launchWithDisabledSynchronization,
  playBoardMove,
  sleep,
  waitForElementAccessibilityLabelContaining,
  waitForElementTextContaining,
  waitForVisibleInPracticeScroll,
} = require('./helpers');
const {
  decodeUciMoveHex,
  sideToMoveFromPositionMetadataHex,
} = require('./puzzlePackBinary');

const puzzlePackPath = resolve(__dirname, '../../../fixtures/puzzles/bundled-core-pack.sqlite');
// Seeded history exists only in Dev (Debug) builds; Release bundles drop it.
const describeDevBuild = detoxConfig.configurationName.endsWith('.debug')
  ? describe
  : describe.skip;

describeDevBuild('Seeded Tactical Profile history', () => {
  it('opens a ready Profile and plays the recommended Focused Run from real SQLite', async () => {
    await launchWithDisabledSynchronization({ newInstance: true, delete: true });
    await waitFor(element(by.id('practice-sprint-rules-guide'))).toExist().withTimeout(180000);
    await element(by.id('practice-sprint-rules-dismiss')).tap();

    await waitForVisibleInPracticeScroll('test-seed-tactical-history-slow-fork-speed');
    await element(by.id('test-seed-tactical-history-slow-fork-speed')).tap();
    await waitForElementTextContaining('test-seed-tactical-history-status', 'Profile ready', 120000);

    await waitForVisibleInPracticeScroll('training-focus-open-profile');
    await element(by.id('training-focus-open-profile')).tap();
    await waitFor(element(by.id('tactical-profile-screen'))).toExist().withTimeout(10000);
    await waitFor(element(by.id('tactical-profile-signal-line:fork'))).toExist().withTimeout(10000);
    await element(by.id('tactical-profile-preview-run')).tap();
    await waitFor(element(by.id('focused-run-preview'))).toExist().withTimeout(10000);
    await element(by.id('focused-run-start')).tap();
    await completeFirstUseSessionGuides();
    await waitFor(element(by.id('session-board'))).toExist().withTimeout(15000);
    await waitFor(element(by.id('session-progress'))).toHaveText('0 / 15').withTimeout(10000);
    await waitFor(element(by.text('Focused Run'))).toBeVisible().withTimeout(10000);

    // The first submitted attempt is the boundary that failed in #592.
    let puzzleId = await solveCurrentPackPuzzle();
    await waitFor(element(by.id('session-progress'))).toHaveText('1 / 15').withTimeout(10000);

    for (let completed = 2; completed <= 15; completed += 1) {
      puzzleId = await waitForNextPuzzle(puzzleId);
      await solveCurrentPackPuzzle();
      if (completed < 15) {
        await waitFor(element(by.id('session-progress')))
          .toHaveText(`${completed} / 15`)
          .withTimeout(10000);
      }
    }

    await waitFor(element(by.id('sprint-summary-panel'))).toExist().withTimeout(30000);
    await expect(element(by.text('Focused Run complete'))).toBeVisible();
    await expect(element(by.id('sprint-result-solved'))).toHaveText('15 / 15');
  });
});

async function solveCurrentPackPuzzle() {
  const puzzleId = await elementText('session-current-puzzle-id');
  const { flipped, solutionMoves } = packPuzzle(puzzleId);
  for (let index = 1; index < solutionMoves.length; index += 2) {
    const userMove = solutionMoves[index];
    const autoReply = solutionMoves[index + 1];
    if (!autoReply) {
      await playBoardMove('session-board', userMove, flipped);
      continue;
    }
    let lastMoveError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await playBoardMove('session-board', userMove, flipped);
      try {
        await waitForElementAccessibilityLabelContaining(
          'session-board',
          `Last move ${autoReply.slice(0, 2)} to ${autoReply.slice(2, 4)}`,
          5000,
          25
        );
        lastMoveError = undefined;
        break;
      } catch (error) {
        lastMoveError = error;
      }
    }
    if (lastMoveError) {
      throw lastMoveError;
    }
  }
  return puzzleId;
}

async function waitForNextPuzzle(previousPuzzleId, timeoutMs = 15000) {
  const startedAt = Date.now();
  let currentPuzzleId = previousPuzzleId;
  while (Date.now() - startedAt < timeoutMs) {
    currentPuzzleId = await elementText('session-current-puzzle-id');
    if (currentPuzzleId && currentPuzzleId !== previousPuzzleId) {
      return currentPuzzleId;
    }
    await sleep(200);
  }
  throw new Error(`Expected the Focused Run to advance from ${previousPuzzleId}`);
}

// Reads the stored solution of a pack-backed puzzle from the same Core Pack
// file bundled into the app, without trusting any app-exposed answer.
function packPuzzle(puzzleId) {
  if (!/^[A-Za-z0-9]+$/.test(puzzleId)) {
    throw new Error(`Unexpected puzzle ID ${puzzleId}`);
  }
  const query = [
    'SELECT hex(solution_moves) || char(9) || hex(substr(initial_fen, 9, 1))',
    'FROM puzzles, pack_format',
    `WHERE puzzles.id = '${puzzleId}'`,
    "AND pack_format.format_id = 'chessticize-core-pack'",
    "AND pack_format.move_codec = 'chessticize-uci16'",
    'AND pack_format.move_codec_version = 1',
    "AND pack_format.position_codec = 'chessticize-position'",
    'AND pack_format.position_codec_version = 1;',
  ].join(' ');
  const rows = execFileSync('/usr/bin/sqlite3', [puzzlePackPath, query], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
  if (rows.length !== 1) {
    throw new Error(`Expected Core Pack puzzle ${puzzleId}, found ${rows.length}`);
  }
  const [movesHex, metadataHex] = rows[0].split('\t');
  const solutionMoves = movesHex.match(/.{4}/g).map(decodeUciMoveHex);
  // The stored line starts with the opponent's move, so the user plays the
  // side that is not to move in the initial position.
  return {
    flipped: sideToMoveFromPositionMetadataHex(metadataHex) === 'w',
    solutionMoves,
  };
}
