module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.env.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  moduleNameMapper: {
    '\\.(png)$': '<rootDir>/__mocks__/asset.js',
    '^react-native$': '<rootDir>/__mocks__/react-native.js',
    '^react-native-safe-area-context$': '<rootDir>/__mocks__/react-native-safe-area-context.js',
  },
  transformIgnorePatterns: [],
  testPathIgnorePatterns: ['/node_modules/', '/\\._'],
};
