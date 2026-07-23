const fs = require('node:fs');
const path = require('node:path');
const {
  accessibilityLabelFromAttributes,
  androidBoardTapPoint,
  boardPoint,
  parseAndroidDisplayDensity,
  parseAndroidDisplaySize,
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
