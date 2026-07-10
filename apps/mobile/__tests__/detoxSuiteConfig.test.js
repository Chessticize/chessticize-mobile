const {
  ACTIVE_E2E_TEST_MATCH_BY_SUITE,
  ACTIVE_E2E_TEST_MATCH,
  STORE_ASSETS_TEST_MATCH,
  ADAPTIVE_LAYOUT_TEST_MATCH,
  resolveDetoxTestMatch,
  resolveDetoxMaxWorkers
} = require('../e2e/suiteConfig');

describe('Detox suite configuration', () => {
  it('runs every active E2E spec by default without loading opt-in capture specs', () => {
    expect(resolveDetoxTestMatch({})).toEqual(ACTIVE_E2E_TEST_MATCH);
    expect(ACTIVE_E2E_TEST_MATCH).toEqual([
      '<rootDir>/e2e/practice.e2e.js',
      '<rootDir>/e2e/flows.e2e.js'
    ]);
  });

  it('partitions every active spec exactly once across the two CI suites', () => {
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'all' }))
      .toEqual(ACTIVE_E2E_TEST_MATCH);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'practice' }))
      .toEqual(ACTIVE_E2E_TEST_MATCH_BY_SUITE.practice);
    expect(resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'flows' }))
      .toEqual(ACTIVE_E2E_TEST_MATCH_BY_SUITE.flows);

    const partitionedSpecs = Object.values(ACTIVE_E2E_TEST_MATCH_BY_SUITE).flat();
    expect(partitionedSpecs).toEqual(ACTIVE_E2E_TEST_MATCH);
    expect(new Set(partitionedSpecs).size).toBe(ACTIVE_E2E_TEST_MATCH.length);
  });

  it('rejects unknown or mixed active suite selections', () => {
    expect(() => resolveDetoxTestMatch({ DETOX_ACTIVE_SUITE: 'unknown' }))
      .toThrow('Unknown DETOX_ACTIVE_SUITE "unknown".');
    expect(() => resolveDetoxTestMatch({
      DETOX_ACTIVE_SUITE: 'practice',
      CHESSTICIZE_CAPTURE_STORE_ASSETS: '1'
    })).toThrow('Active E2E and screenshot capture suites must run separately.');
  });

  it('keeps the App Store screenshot spec available through its opt-in command', () => {
    expect(resolveDetoxTestMatch({ CHESSTICIZE_CAPTURE_STORE_ASSETS: '1' }))
      .toEqual(STORE_ASSETS_TEST_MATCH);
  });

  it('keeps the adaptive layout screenshot spec available through its opt-in command', () => {
    expect(resolveDetoxTestMatch({ CHESSTICIZE_CAPTURE_ADAPTIVE_LAYOUT: '1' }))
      .toEqual(ADAPTIVE_LAYOUT_TEST_MATCH);
  });

  it('rejects mixing the two screenshot capture suites in one invocation', () => {
    expect(() => resolveDetoxTestMatch({
      CHESSTICIZE_CAPTURE_STORE_ASSETS: '1',
      CHESSTICIZE_CAPTURE_ADAPTIVE_LAYOUT: '1'
    })).toThrow('Active E2E and screenshot capture suites must run separately.');
  });

  it('uses one reliable worker by default and accepts an explicit experiment count', () => {
    expect(resolveDetoxMaxWorkers({})).toBe(1);
    expect(resolveDetoxMaxWorkers({ DETOX_MAX_WORKERS: '2' })).toBe(2);
    expect(() => resolveDetoxMaxWorkers({ DETOX_MAX_WORKERS: '0' }))
      .toThrow('DETOX_MAX_WORKERS must be a positive integer');
  });
});
