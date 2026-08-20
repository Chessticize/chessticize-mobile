const bundledCorePuzzles = require('../../../fixtures/puzzles/bundled-core-pack.json');
const {
  focusedRunBoardFlipped,
  focusedRunMoveSteps,
} = require('../e2e/mateIn2FocusedRunFixture');

describe('Mate in 2 Focused Run E2E fixture', () => {
  it('derives each user move and following auto reply from the tracked Core Pack line', () => {
    const puzzle = bundledCorePuzzles.find((candidate) => candidate.id === '0030b');

    expect(focusedRunMoveSteps(puzzle.id)).toEqual(
      puzzle.solutionMoves.flatMap((userMove, index, solutionMoves) => (
        index % 2 === 1
          ? [{ autoReply: solutionMoves[index + 1], userMove }]
          : []
      ))
    );
  });

  it('matches the production board perspective after the stored opponent entry move', () => {
    expect(focusedRunBoardFlipped('0030b')).toBe(false);
    expect(focusedRunBoardFlipped('0R8ni')).toBe(true);
  });

  it('fails closed when a runtime puzzle is absent from the tracked Core Pack', () => {
    expect(() => focusedRunMoveSteps('missing-focused-run-puzzle')).toThrow(
      'missing from the bundled Core Pack fixture'
    );
  });
});
