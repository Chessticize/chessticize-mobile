const fs = require('node:fs');
const path = require('node:path');
const {
  FAMILIAR_15_PUZZLES,
  familiar15ArrowDuelStartingPosition,
  familiar15StartingPosition,
  familiar15UserMoves,
} = require('../e2e/familiar15Fixture');
const {
  configureMobilePracticePuzzleSource,
  createMobilePracticeService,
} = require('../src/platform/mobilePractice');

describe('Familiar 15 shared E2E fixture', () => {
  it('matches the exact product puzzle order and solution records', () => {
    const sprint = createMobilePracticeService('familiar15').startSprint({
      durationSeconds: 300,
      maxMistakes: 3,
      mode: 'standard',
      perPuzzleSeconds: 30,
      targetCorrect: 15,
    }, '2026-07-19T00:00:00.000Z');

    expect(sprint.puzzles.map(({id}) => id))
      .toEqual(FAMILIAR_15_PUZZLES.map(({id}) => id));
    expect(sprint.puzzles.map(({initialFen, solutionMoves}) => ({initialFen, solutionMoves})))
      .toEqual(FAMILIAR_15_PUZZLES.map(({initialFen, solutionMoves}) => ({
        initialFen,
        solutionMoves,
      })));
  });

  it('derives Standard and Arrow Duel orientation from their actual starting positions', () => {
    for (const puzzle of FAMILIAR_15_PUZZLES) {
      expect(familiar15UserMoves(puzzle))
        .toEqual(
          puzzle.id === FAMILIAR_15_PUZZLES[0].id
            ? ['c2b1']
            : puzzle.solutionMoves.filter((_, moveIndex) => moveIndex % 2 === 1)
        );
      expect(familiar15StartingPosition(puzzle).turn())
        .toBe(puzzle.initialFen.split(' ')[1] === 'w' ? 'b' : 'w');
      const arrowDuelPosition = familiar15ArrowDuelStartingPosition(puzzle);
      expect(arrowDuelPosition.turn()).toBe(puzzle.initialFen.split(' ')[1]);
    }
  });

  it('runs the Qf7 stalemate alternate as the first fixed Arrow Duel puzzle', () => {
    const service = createMobilePracticeService('familiar15');
    configureMobilePracticePuzzleSource(service, 'familiar15', 'arrow_duel');

    const sprint = service.startSprint({
      durationSeconds: 300,
      maxMistakes: 3,
      mode: 'arrow_duel',
      opponentReply: {enabled: true, seconds: 10},
      perPuzzleSeconds: 30,
      targetCorrect: 1,
    }, '2026-07-19T00:00:00.000Z');

    expect(sprint.currentPuzzle.puzzle.id).toBe('test-arrow-duel-stalemate-alternate');
    expect(sprint.currentPuzzle.candidates.sort()).toEqual(['g6f7', 'g6g7']);

    const solved = service.submitMove('g6g7', '2026-07-19T00:00:01.000Z');
    expect(solved.feedback.puzzleSolved).toBe(true);
    expect(solved.feedback.autoPlayedMoves).toEqual([]);
    expect(solved.state.status).toBe('won');
  });

  it('documents the one accepted alternate mate and derives the promotion-free prefix', () => {
    expect(familiar15UserMoves(FAMILIAR_15_PUZZLES[0])).toEqual(['c2b1']);

    const promotionPuzzle = FAMILIAR_15_PUZZLES.at(-1);
    const fullUserLine = familiar15UserMoves(promotionPuzzle);
    expect(fullUserLine).toEqual(
      promotionPuzzle.solutionMoves.filter((_, moveIndex) => moveIndex % 2 === 1)
    );
    expect(familiar15UserMoves(promotionPuzzle, { stopBeforePromotion: true }))
      .toEqual(fullUserLine.slice(0, 5));
    expect(familiar15UserMoves(promotionPuzzle, { stopBeforePromotion: true }))
      .toEqual(expect.not.arrayContaining([expect.stringMatching(/^[a-h][1-8][a-h][18][qrbn]$/)]));

    const performanceSteps = FAMILIAR_15_PUZZLES.flatMap((puzzle) => (
      familiar15UserMoves(puzzle, { stopBeforePromotion: true })
        .map((move) => `${puzzle.id}:${move}`)
    ));
    expect(performanceSteps).toHaveLength(36);
    expect(performanceSteps[0]).toBe('test-dual-mate-in-one:c2b1');
    expect(performanceSteps.at(-1)).toBe('04Phf:e6e7');
  });

  it('keeps product and E2E consumers free of parallel identity and move tables', () => {
    const orientationSource = read('../e2e/android-board-orientation.e2e.js');
    const resourceSoakSource = read('../e2e/resource-soak.e2e.js');
    const productSource = read('../src/platform/mobilePractice.ts');

    for (const source of [orientationSource, resourceSoakSource]) {
      expect(source).toContain("require('./familiar15Fixture')");
      expect(source).not.toContain('const USER_MOVES_BY_PUZZLE');
      expect(source).not.toContain('const PUZZLE_ORDER');
      expect(source).not.toContain('const FLIPPED_PUZZLE_IDS');
      expect(source).not.toContain('session-side-to-move');
    }
    expect(orientationSource).toContain("by.id('practice-prompt')");
    expect(orientationSource).toContain("'For black.' : 'For white.'");
    expect(resourceSoakSource).toContain("by.id('practice-prompt-side-glyph')");
    expect(productSource).toContain('familiar-15-e2e.manifest.json');
    expect(productSource).not.toContain('const FAMILIAR_PUZZLE_IDS');
  });
});

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}
