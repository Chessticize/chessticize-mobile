const {
  boardTapTargets,
  launchWithDisabledSynchronization,
  playBoardMove,
  selectTestPuzzleSource,
  sleep,
  startPracticeMode,
  waitForElementAccessibilityLabelContaining,
  waitForVisibleInPracticeScroll,
} = require('./helpers');

const PROMOTION_PUZZLE_ID = '04Phf';
const STEPS_BEFORE_PROMOTION = [
  { move: 'd4f5', reply: 'g3 to g2' },
  { move: 'f5d6', reply: 'g2 to h3' },
  { move: 'e4e5', reply: 'h3 to g2' },
  { move: 'e5e6', reply: 'h4 to h3' },
  { move: 'e6e7', reply: 'h3 to h2' },
];
const PROMOTION_MOVE = 'e7e8q';
const FINAL_MOVE = 'e8e2';
// Detox's Android tap action itself takes roughly 400 ms on the headless
// SwiftShader emulator, so this is an end-to-end guard against the user-visible
// one-second-plus stall rather than a JS-render microbenchmark.
const PROMOTION_PICKER_READY_BUDGET_MS = 900;
const IOS_MODAL_DISMISSAL_BUDGET_MS = 3000;

async function tapAfterIosModalDismissal(board, point) {
  const startedAt = Date.now();

  while (true) {
    try {
      await board.tapAtPoint(point);
      console.log(
        `[promotion-modal-dismissal] waitMs=${Date.now() - startedAt}`
      );
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const elapsedMs = Date.now() - startedAt;
      const systemTransitionBlockedTap = device.getPlatform() === 'ios'
        && message.includes('UITransitionView')
        && message.includes('not hittable');

      if (!systemTransitionBlockedTap || elapsedMs >= IOS_MODAL_DISMISSAL_BUDGET_MS) {
        throw error;
      }
      await sleep(100);
    }
  }
}

describe(`Promotion responsiveness (${PROMOTION_PUZZLE_ID})`, () => {
  beforeAll(async () => {
    await launchWithDisabledSynchronization({
      delete: true,
      newInstance: true,
      launchArgs: {
        chessticizePuzzleSelectionId: PROMOTION_PUZZLE_ID,
        chessticizePuzzleSelectionSeed: 'promotion-responsiveness-v1',
        chessticizeStandardTargetCorrect: '1',
      },
    });
  });

  it('opens the white promotion picker promptly and continues after selection', async () => {
    await waitFor(element(by.id('practice-home'))).toExist().withTimeout(180000);
    await selectTestPuzzleSource('familiar15');
    await startPracticeMode('standard');
    await waitForVisibleInPracticeScroll('session-board');

    for (const { move, reply } of STEPS_BEFORE_PROMOTION) {
      await playBoardMove('session-board', move);
      await waitForElementAccessibilityLabelContaining(
        'session-board',
        `Last move ${reply}`,
        10000,
        50
      );
    }
    await waitFor(element(by.id('board-input-blocker'))).not.toExist().withTimeout(10000);

    const { board, from, to } = await boardTapTargets(
      'session-board',
      PROMOTION_MOVE
    );
    await board.tapAtPoint(from);
    await sleep(250);

    const pickerStartedAt = Date.now();
    await board.tapAtPoint(to);
    const queenChoice = element(by.id('promotion-choice-q'));
    // On iOS, a native Modal can exist in the hierarchy before its retained
    // fade transition is visibly ready for interaction. Measure and tap the
    // user-visible control, not that intermediate native mounting state.
    await waitFor(queenChoice).toBeVisible().withTimeout(10000);
    for (const [piece, pieceName] of [
      ['q', 'queen'],
      ['r', 'rook'],
      ['b', 'bishop'],
      ['n', 'knight'],
    ]) {
      await expect(element(by.id(`promotion-choice-${piece}`)))
        .toHaveLabel(`Promote to ${pieceName}`);
    }
    const pickerReadyMs = Date.now() - pickerStartedAt;
    console.log(
      `[promotion-performance] platform=${device.getPlatform()} pickerReadyMs=${pickerReadyMs}`
    );
    if (pickerReadyMs > PROMOTION_PICKER_READY_BUDGET_MS) {
      throw new Error(
        `Promotion picker took ${pickerReadyMs} ms; budget is ${PROMOTION_PICKER_READY_BUDGET_MS} ms.`
      );
    }

    // Synchronization is disabled so the timing measurement includes the app's
    // real work. Let iOS finish the retained native Modal transition before
    // Detox sends its synthetic tap; taps injected during that system-owned
    // transition are discarded even though the button is already visible.
    if (device.getPlatform() === 'ios') {
      await sleep(750);
    }
    await queenChoice.tap();
    await waitFor(queenChoice).not.toExist().withTimeout(10000);
    await waitForElementAccessibilityLabelContaining(
      'session-board',
      'Last move h2 to h1',
      10000,
      50
    );
    // The picker can disappear from the hierarchy before UIKit removes its
    // transition view. Retry only the unconsumed first tap while that exact
    // system overlay owns the hit point; all other failures remain immediate.
    const finalMoveTargets = await boardTapTargets('session-board', FINAL_MOVE);
    await tapAfterIosModalDismissal(finalMoveTargets.board, finalMoveTargets.from);
    await sleep(250);
    await finalMoveTargets.board.tapAtPoint(finalMoveTargets.to);
    await waitFor(element(by.text('Sprint complete'))).toBeVisible().withTimeout(30000);
  });
});
