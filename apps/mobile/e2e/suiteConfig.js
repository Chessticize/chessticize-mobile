const ACTIVE_E2E_TEST_MATCH = [
  '<rootDir>/e2e/practice.e2e.js',
  '<rootDir>/e2e/flows.e2e.js'
];

const STORE_ASSETS_TEST_MATCH = ['<rootDir>/e2e/store-assets.e2e.js'];
const ADAPTIVE_LAYOUT_TEST_MATCH = ['<rootDir>/e2e/adaptive-layout.e2e.js'];
// The practice suite waits on the real Stockfish bridge. Two concurrent iOS
// simulators can make that analysis exceed the E2E timeout, so parallelism is
// an explicit DETOX_MAX_WORKERS experiment rather than the default.
const DEFAULT_DETOX_MAX_WORKERS = 1;

function resolveDetoxTestMatch(environment = process.env) {
  const captureStoreAssets = environment.CHESSTICIZE_CAPTURE_STORE_ASSETS === '1';
  const captureAdaptiveLayout = environment.CHESSTICIZE_CAPTURE_ADAPTIVE_LAYOUT === '1';

  if (captureStoreAssets && captureAdaptiveLayout) {
    throw new Error('Store asset and adaptive layout capture suites must run separately.');
  }

  if (captureStoreAssets) {
    return STORE_ASSETS_TEST_MATCH;
  }

  if (captureAdaptiveLayout) {
    return ADAPTIVE_LAYOUT_TEST_MATCH;
  }

  return ACTIVE_E2E_TEST_MATCH;
}

function resolveDetoxMaxWorkers(environment = process.env) {
  const configuredWorkers = environment.DETOX_MAX_WORKERS;
  if (configuredWorkers === undefined || configuredWorkers === '') {
    return DEFAULT_DETOX_MAX_WORKERS;
  }

  const workerCount = Number(configuredWorkers);
  if (!Number.isInteger(workerCount) || workerCount < 1) {
    throw new Error(`DETOX_MAX_WORKERS must be a positive integer, received "${configuredWorkers}".`);
  }

  return workerCount;
}

module.exports = {
  ACTIVE_E2E_TEST_MATCH,
  STORE_ASSETS_TEST_MATCH,
  ADAPTIVE_LAYOUT_TEST_MATCH,
  DEFAULT_DETOX_MAX_WORKERS,
  resolveDetoxTestMatch,
  resolveDetoxMaxWorkers
};
