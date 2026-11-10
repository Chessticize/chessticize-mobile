// Opt-in native acceptance: keep store-dependent review UI out of ordinary E2E.
module.exports = {
  ...require('./jest.config'),
  testMatch: ['<rootDir>/e2e/app-review-request.e2e.js'],
  testTimeout: 300000,
};
