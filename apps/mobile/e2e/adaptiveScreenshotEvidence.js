const fs = require('node:fs');
const path = require('node:path');

const ADAPTIVE_ORIENTATION_EVIDENCE_ENV = 'CHESSTICIZE_ADAPTIVE_ORIENTATION_EVIDENCE';

function createAdaptiveScreenshotArchiver(
  orientationEvidencePath = process.env[ADAPTIVE_ORIENTATION_EVIDENCE_ENV]
) {
  if (orientationEvidencePath === undefined) {
    return () => undefined;
  }
  if (typeof orientationEvidencePath !== 'string' || orientationEvidencePath.trim() === '') {
    throw new TypeError(
      `${ADAPTIVE_ORIENTATION_EVIDENCE_ENV} must be a non-empty path when defined`
    );
  }

  const attemptDirectory = path.resolve(
    path.dirname(path.resolve(orientationEvidencePath)),
    'screenshot-attempts'
  );

  return function archiveAdaptiveScreenshot(screenshotPath, screenshotLabel) {
    if (typeof screenshotPath !== 'string' || screenshotPath.length === 0) {
      throw new TypeError('Adaptive screenshot source must be a non-empty path');
    }

    const safeLabel = sanitizeAdaptiveScreenshotLabel(screenshotLabel);
    const destinationPath = path.resolve(attemptDirectory, `${safeLabel}.png`);
    if (path.dirname(destinationPath) !== attemptDirectory) {
      throw new Error(
        `Adaptive screenshot destination escaped its evidence directory: ${destinationPath}`
      );
    }

    fs.mkdirSync(attemptDirectory, {recursive: true});
    fs.copyFileSync(screenshotPath, destinationPath, fs.constants.COPYFILE_EXCL);
    return destinationPath;
  };
}

function sanitizeAdaptiveScreenshotLabel(label) {
  if (typeof label !== 'string') {
    throw new TypeError('Adaptive screenshot label must be a string');
  }
  const safeLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (safeLabel.length === 0) {
    throw new TypeError('Adaptive screenshot label must contain a letter or number');
  }
  return safeLabel;
}

module.exports = {
  createAdaptiveScreenshotArchiver,
  sanitizeAdaptiveScreenshotLabel,
};
