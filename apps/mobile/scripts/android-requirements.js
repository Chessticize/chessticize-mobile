#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_PROPERTIES_PATH = path.resolve(__dirname, '../android/gradle.properties');
const DEFAULT_PACKAGE_PATH = path.resolve(__dirname, '../package.json');

function parseGradleProperties(contents) {
  const properties = {};
  for (const rawLine of String(contents).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator < 1) {
      continue;
    }
    properties[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return properties;
}

function requireProperty(properties, name) {
  const value = properties[name];
  if (!value) {
    throw new Error(`Missing Android requirement ${name}`);
  }
  return value;
}

function parseIntegerProperty(properties, name) {
  const value = requireProperty(properties, name);
  if (!/^\d+$/.test(value)) {
    throw new Error(`Android requirement ${name} must be an integer; received ${value}`);
  }
  return Number(value);
}

function loadNodeRequirement(packagePath = DEFAULT_PACKAGE_PATH) {
  const mobilePackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const range = mobilePackage.engines?.node;
  const match = String(range).match(/^>=\s*(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Mobile package Node engine must be a minimum semantic version; received ${range || 'none'}`);
  }
  return Object.freeze({
    range,
    minimum: Object.freeze({
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
    }),
  });
}

function loadAndroidRequirements(propertiesPath = DEFAULT_PROPERTIES_PATH) {
  const properties = parseGradleProperties(fs.readFileSync(propertiesPath, 'utf8'));
  const abis = requireProperty(properties, 'reactNativeArchitectures')
    .split(',')
    .map((abi) => abi.trim())
    .filter(Boolean);

  if (abis.length === 0) {
    throw new Error('Android requirement reactNativeArchitectures must contain at least one ABI');
  }

  return Object.freeze({
    javaMajor: 17,
    node: loadNodeRequirement(),
    minSdk: parseIntegerProperty(properties, 'chessticizeMinSdk'),
    compileSdk: parseIntegerProperty(properties, 'chessticizeCompileSdk'),
    targetSdk: parseIntegerProperty(properties, 'chessticizeTargetSdk'),
    buildTools: requireProperty(properties, 'chessticizeBuildTools'),
    ndk: requireProperty(properties, 'chessticizeNdk'),
    abis: Object.freeze(abis),
  });
}

function androidSdkPackages(requirements) {
  return [
    'platform-tools',
    'emulator',
    ...androidArtifactSdkPackages(requirements),
  ];
}

function androidArtifactSdkPackages(requirements) {
  return [
    `platforms;android-${requirements.compileSdk}`,
    `build-tools;${requirements.buildTools}`,
    `ndk;${requirements.ndk}`,
  ];
}

const ANDROID_REQUIREMENTS = loadAndroidRequirements();

module.exports = {
  ANDROID_REQUIREMENTS,
  DEFAULT_PACKAGE_PATH,
  DEFAULT_PROPERTIES_PATH,
  androidArtifactSdkPackages,
  androidSdkPackages,
  loadAndroidRequirements,
  loadNodeRequirement,
  parseGradleProperties,
};
