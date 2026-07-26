const fs = require('node:fs');
const path = require('node:path');
const {
  accessibilityLabelFromAttributes,
  androidBoardTapPoint,
  boardPoint,
  parseAndroidDisplayDensity,
  parseAndroidDisplaySize,
  playBoardMove,
} = require('../e2e/helpers');

describe('Detox Android board coordinates', () => {
  it('routes practice-spec board moves through the platform-aware helper', () => {
    const practiceSpec = fs.readFileSync(path.resolve(__dirname, '../e2e/practice.e2e.js'), 'utf8');

    expect(practiceSpec)
      .toContain("playBoardMove('session-board', FIRST_STANDARD_FEEDBACK_MOVES.accepted)");
    expect(practiceSpec).toContain('move: FIRST_STANDARD_FEEDBACK_MOVES.legalWrong');
    expect(practiceSpec).not.toContain("boardPoint(boardFrame, 'c2')");
    expect(practiceSpec).not.toContain("tapAtPoint(c2)");
  });

  it('reads the public accessibility label instead of merged child text', () => {
    expect(accessibilityLabelFromAttributes({
      label: 'Black to move',
      text: 'Black',
    })).toBe('Black to move');
    expect(accessibilityLabelFromAttributes([{ label: 'White to move' }]))
      .toBe('White to move');
  });

  it('completes a promotion move through the public promotion choice', async () => {
    const originalBy = global.by;
    const originalDevice = global.device;
    const originalElement = global.element;
    const originalWaitFor = global.waitFor;
    const promotionTap = jest.fn();
    const board = {
      getAttributes: jest.fn().mockResolvedValue({
        frame: { x: 0, y: 0, width: 800, height: 800 },
      }),
      tapAtPoint: jest.fn().mockResolvedValue(undefined),
    };

    global.by = { id: (testID) => testID };
    global.device = { getPlatform: () => 'ios' };
    global.element = (matcher) => {
      if (matcher === 'session-board') {
        return board;
      }
      if (matcher === 'promotion-choice-q') {
        return { tap: promotionTap };
      }
      return {};
    };
    global.waitFor = () => ({
      toExist: () => ({
        withTimeout: async () => undefined,
      }),
      not: {
        toExist: () => ({
          withTimeout: async () => undefined,
        }),
      },
    });

    try {
      await playBoardMove('session-board', 'e2e1q', true);
      expect(board.tapAtPoint).toHaveBeenCalledTimes(2);
      expect(promotionTap).toHaveBeenCalledTimes(1);
    } finally {
      if (originalBy === undefined) delete global.by;
      else global.by = originalBy;
      if (originalDevice === undefined) delete global.device;
      else global.device = originalDevice;
      if (originalElement === undefined) delete global.element;
      else global.element = originalElement;
      if (originalWaitFor === undefined) delete global.waitFor;
      else global.waitFor = originalWaitFor;
    }
  });

  it('converts Android pixel frame coordinates to element-local dp taps', () => {
    const pixelFrame = { width: 1008, height: 1008 };
    const pixelPoint = boardPoint(pixelFrame, 'a3', true);

    expect(pixelPoint).toEqual({ x: 945, y: 315 });
    expect(androidBoardTapPoint(pixelFrame, 'a3', true, {
      densityDpi: 420,
      heightPixels: 1920,
      widthPixels: 1080,
    })).toEqual({ point: { x: 360, y: 120 }, units: 'pixels' });
  });

  it('keeps current Android dp-valued frame coordinates unchanged', () => {
    expect(androidBoardTapPoint({ width: 384, height: 384 }, 'a3', true, {
      densityDpi: 420,
      heightPixels: 1920,
      widthPixels: 1080,
    })).toEqual({ point: { x: 360, y: 120 }, units: 'dp' });
  });

  it('fails closed when Android board frame units are ambiguous', () => {
    expect(() => androidBoardTapPoint({ width: 600, height: 600 }, 'a3', true, {
      densityDpi: 420,
      heightPixels: 1920,
      widthPixels: 1080,
    })).toThrow('Unable to classify Android board frame units');
  });

  it('prefers an Android override density and falls back to physical density', () => {
    expect(parseAndroidDisplayDensity('Physical density: 420\nOverride density: 440\n')).toBe(440);
    expect(parseAndroidDisplayDensity('Physical density: 420\n')).toBe(420);
    expect(parseAndroidDisplaySize('Physical size: 1080x1920\nOverride size: 1200x2000\n'))
      .toEqual({ widthPixels: 1200, heightPixels: 2000 });
    expect(parseAndroidDisplaySize('Physical size: 1080x1920\n'))
      .toEqual({ widthPixels: 1080, heightPixels: 1920 });
  });

  it('fails closed when Android does not report a valid display density', () => {
    expect(() => parseAndroidDisplayDensity('Override density: unknown\n'))
      .toThrow('Unable to resolve Android display density');
    expect(() => parseAndroidDisplaySize('Physical size: unknown\n'))
      .toThrow('Unable to resolve Android display size');
  });
});
