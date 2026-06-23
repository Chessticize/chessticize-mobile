const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const repoRoot = path.resolve(__dirname, '../..');
const appNodeModules = path.resolve(__dirname, 'node_modules');
const config = {
  projectRoot: __dirname,
  watchFolders: [repoRoot],
  resolver: {
    extraNodeModules: {
      react: path.resolve(appNodeModules, 'react'),
      'react-native': path.resolve(appNodeModules, 'react-native'),
      'react-native-reanimated': path.resolve(appNodeModules, 'react-native-reanimated'),
      'react-native-worklets': path.resolve(appNodeModules, 'react-native-worklets'),
    },
    nodeModulesPaths: [
      appNodeModules,
      path.resolve(repoRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
