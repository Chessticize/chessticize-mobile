const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createAdaptiveScreenshotArchiver,
  sanitizeAdaptiveScreenshotLabel,
} = require('../e2e/adaptiveScreenshotEvidence');

let temporaryDirectory;

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-adaptive-evidence-'));
});

afterEach(() => {
  fs.rmSync(temporaryDirectory, {force: true, recursive: true});
});

describe('adaptive screenshot evidence', () => {
  it('creates the durable attempt directory and copies exact bytes to deterministic unique names', () => {
    const orientationEvidencePath = path.join(temporaryDirectory, 'phone-profile', 'orientation.txt');
    const firstSource = writeSource('detox-first.png', Buffer.from([0, 1, 2, 3, 254, 255]));
    const secondSource = writeSource('detox-second.png', Buffer.from('second exact screenshot'));
    const archiveScreenshot = createAdaptiveScreenshotArchiver(orientationEvidencePath);

    const firstDestination = archiveScreenshot(
      firstSource,
      'Android Phone / LANDSCAPE standard sprint'
    );
    const secondDestination = archiveScreenshot(
      secondSource,
      'Android Phone / LANDSCAPE standard sprint attempt 2'
    );

    const attemptDirectory = path.join(temporaryDirectory, 'phone-profile', 'screenshot-attempts');
    expect(firstDestination).toBe(path.join(
      attemptDirectory,
      'android-phone-landscape-standard-sprint.png'
    ));
    expect(secondDestination).toBe(path.join(
      attemptDirectory,
      'android-phone-landscape-standard-sprint-attempt-2.png'
    ));
    expect(fs.readFileSync(firstDestination)).toEqual(fs.readFileSync(firstSource));
    expect(fs.readFileSync(secondDestination)).toEqual(fs.readFileSync(secondSource));
  });

  it('sanitizes traversal characters and keeps the destination inside the attempt directory', () => {
    const orientationEvidencePath = path.join(temporaryDirectory, 'profile', 'orientation.txt');
    const source = writeSource('source.png', Buffer.from('png bytes'));
    const archiveScreenshot = createAdaptiveScreenshotArchiver(orientationEvidencePath);

    const destination = archiveScreenshot(source, '../../Phone\\Landscape? attempt 2');
    const attemptDirectory = path.join(temporaryDirectory, 'profile', 'screenshot-attempts');

    expect(sanitizeAdaptiveScreenshotLabel('../../Phone\\Landscape? attempt 2'))
      .toBe('phone-landscape-attempt-2');
    expect(path.dirname(destination)).toBe(attemptDirectory);
    expect(destination).toBe(path.join(attemptDirectory, 'phone-landscape-attempt-2.png'));
  });

  it('fails closed instead of overwriting labels that sanitize to the same destination', () => {
    const orientationEvidencePath = path.join(temporaryDirectory, 'profile', 'orientation.txt');
    const firstSource = writeSource('first.png', Buffer.from('first'));
    const secondSource = writeSource('second.png', Buffer.from('second'));
    const archiveScreenshot = createAdaptiveScreenshotArchiver(orientationEvidencePath);
    const destination = archiveScreenshot(firstSource, 'Phone / Landscape');
    let collisionError;

    try {
      archiveScreenshot(secondSource, 'phone landscape');
    } catch (error) {
      collisionError = error;
    }

    expect(collisionError).toMatchObject({
      code: 'EEXIST',
      path: secondSource,
      dest: destination,
    });
    expect(fs.readFileSync(destination, 'utf8')).toBe('first');
  });

  it('is disabled only when the evidence environment path is absent', () => {
    const priorEvidencePath = process.env.CHESSTICIZE_ADAPTIVE_ORIENTATION_EVIDENCE;
    const source = writeSource('disabled.png', Buffer.from('disabled'));

    try {
      delete process.env.CHESSTICIZE_ADAPTIVE_ORIENTATION_EVIDENCE;
      const archiveScreenshot = createAdaptiveScreenshotArchiver();

      expect(archiveScreenshot(source, 'disabled-attempt')).toBeUndefined();
      expect(fs.readdirSync(temporaryDirectory).sort()).toEqual(['disabled.png']);
      expect(() => createAdaptiveScreenshotArchiver('')).toThrow(
        'CHESSTICIZE_ADAPTIVE_ORIENTATION_EVIDENCE must be a non-empty path when defined'
      );
    } finally {
      if (priorEvidencePath === undefined) {
        delete process.env.CHESSTICIZE_ADAPTIVE_ORIENTATION_EVIDENCE;
      } else {
        process.env.CHESSTICIZE_ADAPTIVE_ORIENTATION_EVIDENCE = priorEvidencePath;
      }
    }
  });

  it('propagates a missing source failure with native source and destination context', () => {
    const orientationEvidencePath = path.join(temporaryDirectory, 'profile', 'orientation.txt');
    const missingSource = path.join(temporaryDirectory, 'missing.png');
    const archiveScreenshot = createAdaptiveScreenshotArchiver(orientationEvidencePath);
    const expectedDestination = path.join(
      temporaryDirectory,
      'profile',
      'screenshot-attempts',
      'missing-source.png'
    );
    let sourceError;

    try {
      archiveScreenshot(missingSource, 'missing source');
    } catch (error) {
      sourceError = error;
    }

    expect(sourceError).toMatchObject({
      code: 'ENOENT',
      path: missingSource,
      dest: expectedDestination,
    });
    expect(fs.existsSync(expectedDestination)).toBe(false);
  });

  it('propagates destination creation failure with the attempted evidence path', () => {
    const blockedParent = path.join(temporaryDirectory, 'blocked-parent');
    fs.writeFileSync(blockedParent, 'not a directory');
    const source = writeSource('source.png', Buffer.from('png bytes'));
    const archiveScreenshot = createAdaptiveScreenshotArchiver(
      path.join(blockedParent, 'orientation.txt')
    );
    let destinationError;

    try {
      archiveScreenshot(source, 'destination failure');
    } catch (error) {
      destinationError = error;
    }

    expect(destinationError).toMatchObject({code: 'ENOTDIR'});
    expect(destinationError.path).toBe(path.join(blockedParent, 'screenshot-attempts'));
  });
});

function writeSource(filename, bytes) {
  const sourcePath = path.join(temporaryDirectory, filename);
  fs.writeFileSync(sourcePath, bytes);
  return sourcePath;
}
