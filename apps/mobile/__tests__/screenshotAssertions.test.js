const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const {
  countOccupiedBoardSquares,
  expectBoardScreenshotContainsPieces,
  waitForBoardScreenshotContainsPieces,
} = require('../e2e/screenshotAssertions');
const {
  createAdaptiveScreenshotArchiver,
} = require('../e2e/adaptiveScreenshotEvidence');

let temporaryDirectory;

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'chessticize-board-readiness-'));
});

afterEach(() => {
  fs.rmSync(temporaryDirectory, {force: true, recursive: true});
});

describe('screenshot assertions', () => {
  it('detects a low-material board from square-local contrast', () => {
    const png = syntheticBoard();
    paintPiece(png, 6, 2, [20, 25, 32, 255]);
    paintPiece(png, 7, 0, [245, 245, 245, 255]);
    paintPiece(png, 7, 2, [20, 25, 32, 255]);

    expect(countOccupiedBoardSquares(png, fullBoardFrame())).toBe(3);
  });

  it('does not mistake an empty checkerboard for rendered pieces', () => {
    expect(countOccupiedBoardSquares(syntheticBoard(), fullBoardFrame())).toBe(0);
  });

  it('waits for a rotated board screenshot to contain rendered pieces', async () => {
    const emptyScreenshot = writeSyntheticBoard('empty-after-rotation.png');
    const renderedScreenshot = writeSyntheticBoard('rendered-after-rotation.png', [
      [6, 2, [20, 25, 32, 255]],
      [7, 0, [245, 245, 245, 255]],
    ]);
    const screenshots = [emptyScreenshot, renderedScreenshot];
    const captureScreenshot = jest.fn(async () => screenshots.shift());
    let clock = 0;
    const delay = jest.fn(async (milliseconds) => {
      clock += milliseconds;
    });

    await expect(waitForBoardScreenshotContainsPieces({
      boardFrame: fullBoardFrame(),
      captureScreenshot,
      screenFrame: fullBoardFrame(),
      screenshotLabel: 'android-phone-landscape-standard-sprint',
    }, {
      delay,
      now: () => clock,
      pollIntervalMs: 25,
      timeoutMs: 100,
    })).resolves.toBe(renderedScreenshot);

    expect(captureScreenshot).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(25);
  });

  it('fails closed when a rotated board remains empty through the render deadline', async () => {
    const emptyScreenshot = writeSyntheticBoard('persistently-empty.png');
    let clock = 0;
    const delay = async (milliseconds) => {
      clock += milliseconds;
    };
    const captureScreenshot = jest.fn(async () => emptyScreenshot);

    await expect(waitForBoardScreenshotContainsPieces({
      boardFrame: fullBoardFrame(),
      captureScreenshot,
      screenFrame: fullBoardFrame(),
      screenshotLabel: 'android-phone-landscape-standard-sprint',
    }, {
      delay,
      now: () => clock,
      pollIntervalMs: 25,
      timeoutMs: 50,
    })).rejects.toThrow(
      'Timed out waiting for rendered chess pieces after 50ms; '
      + 'latest=Expected rendered chess pieces, found only 0 occupied board squares; '
      + `screenshot=${emptyScreenshot}`
    );

    expect(captureScreenshot).toHaveBeenCalledTimes(2);
  });

  it('archives each retry under a durable label when the final rendered frame crosses the deadline', async () => {
    const emptyScreenshot = writeSyntheticBoard('boundary-empty.png');
    const renderedScreenshot = writeSyntheticBoard('boundary-rendered.png', [
      [6, 2, [20, 25, 32, 255]],
      [7, 0, [245, 245, 245, 255]],
    ]);
    const screenshots = [emptyScreenshot, renderedScreenshot];
    const captureScreenshot = jest.fn(async () => screenshots.shift());
    const archiveScreenshot = createAdaptiveScreenshotArchiver(
      path.join(temporaryDirectory, 'adaptive-profile', 'orientation.txt')
    );
    let clock = 0;
    let inspections = 0;
    const inspectScreenshot = jest.fn((...args) => {
      inspections += 1;
      expectBoardScreenshotContainsPieces(...args);
      if (inspections === 2) {
        clock = 51;
      }
    });
    const delay = async (milliseconds) => {
      clock += milliseconds;
    };
    const screenshotLabel = 'android-phone-landscape-standard-sprint';

    await expect(waitForBoardScreenshotContainsPieces({
      archiveScreenshot,
      boardFrame: fullBoardFrame(),
      captureScreenshot,
      screenFrame: fullBoardFrame(),
      screenshotLabel,
    }, {
      delay,
      inspectScreenshot,
      now: () => clock,
      pollIntervalMs: 25,
      timeoutMs: 50,
    })).rejects.toThrow(
      'Timed out waiting for rendered chess pieces after 50ms; '
      + 'latest=Expected rendered chess pieces, found only 0 occupied board squares; '
      + `screenshot=${emptyScreenshot}`
    );

    expect(captureScreenshot.mock.calls).toEqual([
      [screenshotLabel],
      [`${screenshotLabel}-attempt-2`],
    ]);
    const attemptDirectory = path.join(
      temporaryDirectory,
      'adaptive-profile',
      'screenshot-attempts'
    );
    expect(fs.readFileSync(path.join(attemptDirectory, `${screenshotLabel}.png`)))
      .toEqual(fs.readFileSync(emptyScreenshot));
    expect(fs.readFileSync(path.join(attemptDirectory, `${screenshotLabel}-attempt-2.png`)))
      .toEqual(fs.readFileSync(renderedScreenshot));
  });

  it('propagates a real archive rejection unchanged after one capture without inspection or retry', async () => {
    const renderedScreenshot = writeSyntheticBoard('archive-rejection.png', [
      [6, 2, [20, 25, 32, 255]],
      [7, 0, [245, 245, 245, 255]],
    ]);
    const screenshotLabel = 'android-phone-landscape-standard-sprint';
    const realArchiveScreenshot = createAdaptiveScreenshotArchiver(
      path.join(temporaryDirectory, 'collision-profile', 'orientation.txt')
    );
    realArchiveScreenshot(renderedScreenshot, screenshotLabel);
    let archiveError;
    let captureCount = 0;
    let inspectionCount = 0;
    let delayCount = 0;

    const archiveScreenshot = (...args) => {
      try {
        return realArchiveScreenshot(...args);
      } catch (error) {
        archiveError = error;
        throw error;
      }
    };

    let rejectedError;
    try {
      await waitForBoardScreenshotContainsPieces({
        archiveScreenshot,
        boardFrame: fullBoardFrame(),
        captureScreenshot: async () => {
          captureCount += 1;
          return renderedScreenshot;
        },
        screenFrame: fullBoardFrame(),
        screenshotLabel,
      }, {
        delay: async () => {
          delayCount += 1;
        },
        inspectScreenshot: () => {
          inspectionCount += 1;
        },
      });
    } catch (error) {
      rejectedError = error;
    }

    expect(archiveError).toMatchObject({code: 'EEXIST'});
    expect(rejectedError).toBe(archiveError);
    expect(captureCount).toBe(1);
    expect(inspectionCount).toBe(0);
    expect(delayCount).toBe(0);
  });

  it('rejects a rendered screenshot whose capture completes after the hard deadline', async () => {
    const renderedScreenshot = writeSyntheticBoard('late-capture.png', [
      [6, 2, [20, 25, 32, 255]],
      [7, 0, [245, 245, 245, 255]],
    ]);
    let clock = 0;
    const captureScreenshot = jest.fn(async () => {
      clock = 5001;
      return renderedScreenshot;
    });

    await expect(waitForBoardScreenshotContainsPieces({
      boardFrame: fullBoardFrame(),
      captureScreenshot,
      screenFrame: fullBoardFrame(),
      screenshotLabel: 'late-capture',
    }, {
      now: () => clock,
    })).rejects.toThrow(
      'Timed out waiting for rendered chess pieces after 5000ms; '
      + `latest=Screenshot capture completed after the deadline; screenshot=${renderedScreenshot}`
    );

    expect(captureScreenshot).toHaveBeenCalledTimes(1);
  });

  it('rejects a rendered screenshot whose inspection completes after the hard deadline', async () => {
    const renderedScreenshot = writeSyntheticBoard('late-inspection.png', [
      [6, 2, [20, 25, 32, 255]],
      [7, 0, [245, 245, 245, 255]],
    ]);
    let clock = 0;
    const inspectScreenshot = jest.fn(async (...args) => {
      clock = 5001;
      expectBoardScreenshotContainsPieces(...args);
    });

    await expect(waitForBoardScreenshotContainsPieces({
      boardFrame: fullBoardFrame(),
      captureScreenshot: async () => renderedScreenshot,
      screenFrame: fullBoardFrame(),
      screenshotLabel: 'late-inspection',
    }, {
      inspectScreenshot,
      now: () => clock,
    })).rejects.toThrow(
      'Timed out waiting for rendered chess pieces after 5000ms; '
      + `latest=Screenshot inspection completed after the deadline; screenshot=${renderedScreenshot}`
    );

    expect(inspectScreenshot).toHaveBeenCalledTimes(1);
  });

  it('pins the 250ms poll and 5000ms deadline defaults with an injected clock', async () => {
    const emptyScreenshot = writeSyntheticBoard('default-timing-empty.png');
    let clock = 0;
    const delay = jest.fn(async (milliseconds) => {
      clock += milliseconds;
    });
    const captureScreenshot = jest.fn(async () => emptyScreenshot);

    await expect(waitForBoardScreenshotContainsPieces({
      boardFrame: fullBoardFrame(),
      captureScreenshot,
      screenFrame: fullBoardFrame(),
      screenshotLabel: 'default-timing',
    }, {
      delay,
      now: () => clock,
    })).rejects.toThrow('Timed out waiting for rendered chess pieces after 5000ms');

    expect(delay).toHaveBeenCalledTimes(20);
    expect(delay.mock.calls.every(([milliseconds]) => milliseconds === 250)).toBe(true);
    expect(captureScreenshot).toHaveBeenCalledTimes(20);
  });

  it('propagates a screenshot capture rejection unchanged without retrying', async () => {
    const captureError = new Error('native screenshot capture failed');
    const captureScreenshot = jest.fn().mockRejectedValue(captureError);
    const delay = jest.fn();

    await expect(waitForBoardScreenshotContainsPieces({
      boardFrame: fullBoardFrame(),
      captureScreenshot,
      screenFrame: fullBoardFrame(),
      screenshotLabel: 'capture-failure',
    }, {delay})).rejects.toBe(captureError);

    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it('hard-times out a pending capture and safely observes its late rejection', async () => {
    const lateCaptureError = new Error('capture rejected after timeout');
    let rejectCapture;
    const capturePromise = new Promise((resolve, reject) => {
      rejectCapture = reject;
    });
    const captureScreenshot = jest.fn(() => capturePromise);
    let fireDeadline;
    const timeoutHandle = Symbol('deadline');
    const scheduleTimeout = jest.fn((callback) => {
      fireDeadline = callback;
      return timeoutHandle;
    });
    const cancelTimeout = jest.fn();

    const waiting = waitForBoardScreenshotContainsPieces({
      boardFrame: fullBoardFrame(),
      captureScreenshot,
      screenFrame: fullBoardFrame(),
      screenshotLabel: 'pending-capture',
    }, {
      cancelTimeout,
      scheduleTimeout,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(scheduleTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
    fireDeadline();

    await expect(waiting).rejects.toThrow(
      'Timed out waiting for rendered chess pieces after 5000ms; '
      + 'latest=Screenshot capture did not complete before the deadline; screenshot=<pending>'
    );
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    expect(cancelTimeout).not.toHaveBeenCalled();

    rejectCapture(lateCaptureError);
    await Promise.resolve();
    await Promise.resolve();
  });

  it('clears every hard-deadline timer when capture and inspection finish early', async () => {
    const renderedScreenshot = writeSyntheticBoard('early-rendered.png', [
      [6, 2, [20, 25, 32, 255]],
      [7, 0, [245, 245, 245, 255]],
    ]);
    const handles = [];
    const scheduleTimeout = jest.fn((callback, milliseconds) => {
      const handle = {callback, milliseconds};
      handles.push(handle);
      return handle;
    });
    const cancelTimeout = jest.fn();

    await expect(waitForBoardScreenshotContainsPieces({
      boardFrame: fullBoardFrame(),
      captureScreenshot: async () => renderedScreenshot,
      screenFrame: fullBoardFrame(),
      screenshotLabel: 'early-rendered',
    }, {
      cancelTimeout,
      scheduleTimeout,
    })).resolves.toBe(renderedScreenshot);

    expect(scheduleTimeout).toHaveBeenCalledTimes(2);
    expect(cancelTimeout.mock.calls).toEqual(handles.map((handle) => [handle]));
  });

  it('does not retry malformed screenshots through the real inspector', async () => {
    const malformedScreenshot = path.join(temporaryDirectory, 'malformed.png');
    fs.writeFileSync(malformedScreenshot, 'not a png');
    const captureScreenshot = jest.fn(async () => malformedScreenshot);
    const delay = jest.fn();

    await expect(waitForBoardScreenshotContainsPieces({
      boardFrame: fullBoardFrame(),
      captureScreenshot,
      screenFrame: fullBoardFrame(),
      screenshotLabel: 'malformed',
    }, {delay})).rejects.toThrow('Screenshot is not a PNG');

    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it('propagates unrelated inspector errors with their original identity', async () => {
    const renderedScreenshot = writeSyntheticBoard('inspector-error.png', [
      [6, 2, [20, 25, 32, 255]],
      [7, 0, [245, 245, 245, 255]],
    ]);
    const inspectionError = new Error('unexpected inspector failure');
    const inspectScreenshot = jest.fn(() => {
      throw inspectionError;
    });
    const delay = jest.fn();

    await expect(waitForBoardScreenshotContainsPieces({
      boardFrame: fullBoardFrame(),
      captureScreenshot: async () => renderedScreenshot,
      screenFrame: fullBoardFrame(),
      screenshotLabel: 'inspector-failure',
    }, {
      delay,
      inspectScreenshot,
    })).rejects.toBe(inspectionError);

    expect(inspectScreenshot).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });
});

function writeSyntheticBoard(filename, pieces = []) {
  const png = syntheticBoard();
  for (const [row, column, color] of pieces) {
    paintPiece(png, row, column, color);
  }
  const screenshotPath = path.join(temporaryDirectory, filename);
  fs.writeFileSync(screenshotPath, encodeRgbaPng(png));
  return screenshotPath;
}

function encodeRgbaPng(png) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(png.width, 0);
  header.writeUInt32BE(png.height, 4);
  header[8] = 8;
  header[9] = 6;

  const stride = png.width * 4;
  const scanlines = Buffer.alloc((stride + 1) * png.height);
  for (let row = 0; row < png.height; row += 1) {
    const targetOffset = row * (stride + 1);
    scanlines[targetOffset] = 0;
    png.data.copy(scanlines, targetOffset + 1, row * stride, (row + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return chunk;
}

function crc32(buffer) {
  /* eslint-disable no-bitwise -- CRC-32 is defined in terms of bitwise operations. */
  let checksum = 0xffffffff;
  for (const byte of buffer) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = (checksum >>> 1) ^ (0xedb88320 & -(checksum & 1));
    }
  }
  const result = (checksum ^ 0xffffffff) >>> 0;
  /* eslint-enable no-bitwise */
  return result;
}

function syntheticBoard() {
  const width = 800;
  const height = 800;
  const data = Buffer.alloc(width * height * 4);
  const colors = [
    [230, 232, 235, 255],
    [123, 135, 148, 255]
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const row = Math.floor(y / 100);
      const column = Math.floor(x / 100);
      writePixel(data, width, x, y, colors[(row + column) % 2]);
    }
  }
  return { data, height, width };
}

function paintPiece(png, row, column, color) {
  const originX = column * 100;
  const originY = row * 100;
  for (let y = originY + 20; y < originY + 80; y += 1) {
    for (let x = originX + 25; x < originX + 75; x += 1) {
      writePixel(png.data, png.width, x, y, color);
    }
  }
}

function writePixel(data, width, x, y, color) {
  const offset = (y * width + x) * 4;
  for (let channel = 0; channel < 4; channel += 1) {
    data[offset + channel] = color[channel];
  }
}

function fullBoardFrame() {
  return { height: 800, width: 800, x: 0, y: 0 };
}
