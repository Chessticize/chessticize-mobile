/* eslint-disable no-bitwise */
/* global Buffer */

const fs = require('fs');
const zlib = require('zlib');

class BoardScreenshotPiecesError extends Error {
  constructor(occupiedSquares) {
    super(`Expected rendered chess pieces, found only ${occupiedSquares} occupied board squares`);
    this.name = 'BoardScreenshotPiecesError';
  }
}

function expectBoardScreenshotContainsPieces(screenshotPath, boardFrame, screenFrame) {
  const png = readRgbaPng(screenshotPath);
  const boardPixels = pixelFrameForElement(png, boardFrame, screenFrame);
  const occupiedSquares = countOccupiedBoardSquares(png, boardPixels);

  // Every valid chess position contains both kings. Detect occupied squares
  // relative to the two board colors so low-material puzzles remain valid at
  // any screenshot scale while an empty checkerboard still fails closed.
  if (occupiedSquares < 2) {
    throw new BoardScreenshotPiecesError(occupiedSquares);
  }
}

function expectBoardScreenshotMatchesOccupiedSquares(
  screenshotPath,
  boardFrame,
  expectedOccupiedSquares,
  flipped = false,
  screenFrame
) {
  const png = readRgbaPng(screenshotPath);
  const boardPixels = pixelFrameForElement(png, boardFrame, screenFrame);
  const actual = new Set(detectOccupiedBoardSquares(png, boardPixels, flipped));
  const expected = new Set(expectedOccupiedSquares);
  const missing = [...expected].filter((square) => !actual.has(square)).sort();
  const unexpected = [...actual].filter((square) => !expected.has(square)).sort();

  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Board piece positions differ; missing=${missing.join(',') || '<none>'}; `
      + `unexpected=${unexpected.join(',') || '<none>'}`
    );
  }
}

async function waitForBoardScreenshotContainsPieces({
  archiveScreenshot,
  boardFrame,
  captureScreenshot,
  screenFrame,
  screenshotLabel,
}, {
  delay = wait,
  inspectScreenshot = expectBoardScreenshotContainsPieces,
  now = Date.now,
  pollIntervalMs = 250,
  cancelTimeout = clearTimeout,
  scheduleTimeout = setTimeout,
  timeoutMs = 5000,
} = {}) {
  const deadline = now() + timeoutMs;
  let captureAttempt = 0;
  let latestReadinessFailure = null;

  while (true) {
    captureAttempt += 1;
    const attemptLabel = captureAttempt === 1
      ? screenshotLabel
      : `${screenshotLabel}-attempt-${captureAttempt}`;
    const captureOutcome = await settleBeforeDeadline(
      async () => {
        const screenshotPath = await captureScreenshot(attemptLabel);
        await archiveScreenshot?.(screenshotPath, attemptLabel);
        return screenshotPath;
      },
      {cancelTimeout, deadline, now, scheduleTimeout}
    );
    if (captureOutcome.status === 'timed-out') {
      const completedCapture = captureOutcome.completed;
      const captureDiagnostic = completedCapture?.status === 'fulfilled'
        ? readinessDiagnostic(
          'Screenshot capture completed after the deadline',
          completedCapture.value
        )
        : readinessDiagnostic('Screenshot capture did not complete before the deadline', '<pending>');
      throw boardScreenshotTimeoutError(
        timeoutMs,
        latestReadinessFailure ?? captureDiagnostic
      );
    }
    if (captureOutcome.status === 'rejected') {
      throw captureOutcome.error;
    }

    const screenshotPath = captureOutcome.value;
    // PNG inspection is synchronous CPU work, so a timer cannot preempt it.
    // Accept that one in-flight synchronous result when capture started and
    // finished before the deadline; asynchronous inspection remains bounded.
    const inspectionOutcome = await settleBeforeDeadline(
      () => inspectScreenshot(screenshotPath, boardFrame, screenFrame),
      {
        allowSynchronousCompletionAfterDeadline: true,
        cancelTimeout,
        deadline,
        now,
        scheduleTimeout,
      }
    );
    if (inspectionOutcome.status === 'timed-out') {
      const completedInspection = inspectionOutcome.completed;
      const inspectionDiagnostic = completedInspection?.status === 'rejected'
        && completedInspection.error instanceof BoardScreenshotPiecesError
        ? readinessDiagnostic(completedInspection.error.message, screenshotPath)
        : latestReadinessFailure ?? readinessDiagnostic(
          completedInspection?.status === 'fulfilled'
            ? 'Screenshot inspection completed after the deadline'
            : 'Screenshot inspection did not complete before the deadline',
          screenshotPath
        );
      throw boardScreenshotTimeoutError(
        timeoutMs,
        inspectionDiagnostic
      );
    }
    if (inspectionOutcome.status === 'fulfilled') {
      return screenshotPath;
    }

    const error = inspectionOutcome.error;
    if (!(error instanceof BoardScreenshotPiecesError)) {
      throw error;
    }

    latestReadinessFailure = readinessDiagnostic(error.message, screenshotPath);
    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      throw boardScreenshotTimeoutError(timeoutMs, latestReadinessFailure);
    }

    await delay(Math.min(pollIntervalMs, remainingMs));
  }
}

async function settleBeforeDeadline(operation, {
  allowSynchronousCompletionAfterDeadline = false,
  cancelTimeout,
  deadline,
  now,
  scheduleTimeout,
}) {
  const remainingMs = deadline - now();
  if (remainingMs <= 0) {
    return {status: 'timed-out'};
  }

  let timeoutHandle;
  const timeoutOutcome = new Promise((resolve) => {
    timeoutHandle = scheduleTimeout(
      () => resolve({status: 'timed-out'}),
      remainingMs
    );
  });

  let operationValue;
  let operationThen;
  try {
    operationValue = operation();
    operationThen = getCallableThen(operationValue);
  } catch (error) {
    const outcome = {status: 'rejected', error};
    cancelTimeout(timeoutHandle);
    if (!allowSynchronousCompletionAfterDeadline && now() >= deadline) {
      return {completed: outcome, status: 'timed-out'};
    }
    return outcome;
  }

  if (operationThen === null) {
    const outcome = {status: 'fulfilled', value: operationValue};
    cancelTimeout(timeoutHandle);
    if (!allowSynchronousCompletionAfterDeadline && now() >= deadline) {
      return {completed: outcome, status: 'timed-out'};
    }
    return outcome;
  }

  // Turn rejection into a settled value before racing so a rejection that
  // arrives after the deadline is still observed and cannot leak unhandled.
  const operationOutcome = assimilateThenable(operationValue, operationThen).then(
    (value) => ({status: 'fulfilled', value}),
    (error) => ({status: 'rejected', error})
  );
  const outcome = await Promise.race([operationOutcome, timeoutOutcome]);

  if (outcome.status !== 'timed-out') {
    cancelTimeout(timeoutHandle);
    if (now() >= deadline) {
      return {completed: outcome, status: 'timed-out'};
    }
  }

  return outcome;
}

function getCallableThen(value) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return null;
  }
  const then = value.then;
  return typeof then === 'function' ? then : null;
}

function assimilateThenable(value, then) {
  // Promise.resolve supplies asynchronous invocation, first-settlement-wins,
  // and thrown-error handling without rereading the original then getter.
  return Promise.resolve({
    then(resolve, reject) {
      Reflect.apply(then, value, [resolve, reject]);
    },
  });
}

function readinessDiagnostic(message, screenshotPath) {
  return {message, screenshotPath};
}

function boardScreenshotTimeoutError(timeoutMs, diagnostic) {
  return new Error(
    `Timed out waiting for rendered chess pieces after ${timeoutMs}ms; `
    + `latest=${diagnostic.message}; screenshot=${diagnostic.screenshotPath}`
  );
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function countOccupiedBoardSquares(png, boardPixels) {
  return detectOccupiedBoardSquares(png, boardPixels, false).length;
}

function detectOccupiedBoardSquares(png, boardPixels, flipped = false) {
  const squareWidth = boardPixels.width / 8;
  const squareHeight = boardPixels.height / 8;
  const backgroundSamples = [[], []];
  const cornerOffsets = [0.12, 0.88];

  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const parity = (row + column) % 2;
      for (const yOffset of cornerOffsets) {
        for (const xOffset of cornerOffsets) {
          backgroundSamples[parity].push(pixelAt(
            png,
            boardPixels.x + ((column + xOffset) * squareWidth),
            boardPixels.y + ((row + yOffset) * squareHeight)
          ));
        }
      }
    }
  }

  const backgrounds = backgroundSamples.map(medianColor);
  const sampleStep = Math.max(1, Math.floor(Math.min(squareWidth, squareHeight) / 32));
  const occupiedSquares = [];

  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const background = backgrounds[(row + column) % 2];
      // Board coordinates sit in the outer corners of each square. Inspect the
      // central region so those labels cannot satisfy the piece-readiness check.
      const left = Math.floor(boardPixels.x + ((column + 0.28) * squareWidth));
      const right = Math.ceil(boardPixels.x + ((column + 0.72) * squareWidth));
      const top = Math.floor(boardPixels.y + ((row + 0.28) * squareHeight));
      const bottom = Math.ceil(boardPixels.y + ((row + 0.72) * squareHeight));
      let contrastingPixels = 0;
      let sampledPixels = 0;

      for (let y = top; y < bottom; y += sampleStep) {
        for (let x = left; x < right; x += sampleStep) {
          const pixel = pixelAt(png, x, y);
          if (pixel[3] <= 128) {
            continue;
          }
          sampledPixels += 1;
          if (maximumChannelDistance(pixel, background) >= 32) {
            contrastingPixels += 1;
          }
        }
      }

      if (sampledPixels > 0 && contrastingPixels / sampledPixels >= 0.03) {
        occupiedSquares.push(logicalSquareAtScreenCell(row, column, flipped));
      }
    }
  }

  return occupiedSquares;
}

function logicalSquareAtScreenCell(row, column, flipped) {
  const logicalColumn = flipped ? 7 - column : column;
  const logicalRank = flipped ? row + 1 : 8 - row;
  return `${String.fromCharCode('a'.charCodeAt(0) + logicalColumn)}${logicalRank}`;
}

function pixelAt(png, x, y) {
  const clampedX = clamp(Math.floor(x), 0, png.width - 1);
  const clampedY = clamp(Math.floor(y), 0, png.height - 1);
  const offset = (clampedY * png.width + clampedX) * 4;
  return [
    png.data[offset],
    png.data[offset + 1],
    png.data[offset + 2],
    png.data[offset + 3]
  ];
}

function medianColor(samples) {
  return [0, 1, 2, 3].map((channel) => {
    const values = samples.map((sample) => sample[channel]).sort((left, right) => left - right);
    return values[Math.floor(values.length / 2)];
  });
}

function maximumChannelDistance(left, right) {
  return Math.max(
    Math.abs(left[0] - right[0]),
    Math.abs(left[1] - right[1]),
    Math.abs(left[2] - right[2])
  );
}

function expectFrameContained(childFrame, parentFrame, label) {
  const tolerance = 1;
  const childRight = childFrame.x + childFrame.width;
  const childBottom = childFrame.y + childFrame.height;
  const parentRight = parentFrame.x + parentFrame.width;
  const parentBottom = parentFrame.y + parentFrame.height;

  if (
    childFrame.x < parentFrame.x - tolerance ||
    childFrame.y < parentFrame.y - tolerance ||
    childRight > parentRight + tolerance ||
    childBottom > parentBottom + tolerance
  ) {
    throw new Error(
      `${label} frame is outside its container: ` +
      `child=${JSON.stringify(childFrame)}, parent=${JSON.stringify(parentFrame)}`
    );
  }
}

function pixelFrameForElement(png, elementFrame, screenFrame) {
  const referenceFrame = screenFrame ?? {
    x: 0,
    y: 0,
    width: elementFrame.x * 2 + elementFrame.width,
    height: elementFrame.y * 2 + elementFrame.height
  };
  const scaleX = png.width / referenceFrame.width;
  const scaleY = png.height / referenceFrame.height;

  return {
    x: clamp(Math.floor((elementFrame.x - referenceFrame.x) * scaleX), 0, png.width),
    y: clamp(Math.floor((elementFrame.y - referenceFrame.y) * scaleY), 0, png.height),
    width: clamp(Math.ceil(elementFrame.width * scaleX), 0, png.width),
    height: clamp(Math.ceil(elementFrame.height * scaleY), 0, png.height)
  };
}

function readRgbaPng(path) {
  const buffer = fs.readFileSync(path);
  assertPngSignature(buffer);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4;
  }

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  return {
    width,
    height,
    data: unfilterRgbaScanlines(inflated, width, height)
  };
}

function assertPngSignature(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('Screenshot is not a PNG');
  }
}

function unfilterRgbaScanlines(inflated, width, height) {
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const output = Buffer.alloc(height * stride);
  let sourceOffset = 0;

  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = row * stride;

    for (let col = 0; col < stride; col += 1) {
      const raw = inflated[sourceOffset + col];
      const left = col >= bytesPerPixel ? output[rowOffset + col - bytesPerPixel] : 0;
      const up = row > 0 ? output[rowOffset - stride + col] : 0;
      const upperLeft = row > 0 && col >= bytesPerPixel
        ? output[rowOffset - stride + col - bytesPerPixel]
        : 0;

      output[rowOffset + col] = (raw + unfilterByte(filter, left, up, upperLeft)) & 0xff;
    }

    sourceOffset += stride;
  }

  return output;
}

function unfilterByte(filter, left, up, upperLeft) {
  if (filter === 0) {
    return 0;
  }
  if (filter === 1) {
    return left;
  }
  if (filter === 2) {
    return up;
  }
  if (filter === 3) {
    return Math.floor((left + up) / 2);
  }
  if (filter === 4) {
    return paethPredictor(left, up, upperLeft);
  }
  throw new Error(`Unsupported PNG filter: ${filter}`);
}

function paethPredictor(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpperLeft = Math.abs(estimate - upperLeft);

  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpperLeft) {
    return left;
  }
  if (distanceUp <= distanceUpperLeft) {
    return up;
  }
  return upperLeft;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  BoardScreenshotPiecesError,
  countOccupiedBoardSquares,
  detectOccupiedBoardSquares,
  expectBoardScreenshotContainsPieces,
  expectBoardScreenshotMatchesOccupiedSquares,
  expectFrameContained,
  waitForBoardScreenshotContainsPieces,
};
