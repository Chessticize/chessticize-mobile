const fs = require('fs');
const zlib = require('zlib');
const {
  sleep,
  frameFor,
  playBoardMove,
  startPracticeMode,
  selectTestPuzzleSource,
  waitForVisibleInPracticeScroll,
  waitForElementTextContaining,
  boardPoint
} = require('./helpers');

describe('Practice POC', () => {
  beforeEach(async () => {
    // These smoke tests use explicit waitFor checks and screenshot assertions.
    // React Native, Skia, and native engine startup can keep Detox synchronization
    // busy after the first visible frame, so launch args disable synchronization
    // before Detox waits on app readiness.
    await device.launchApp({
      newInstance: true,
      delete: true,
      launchArgs: { detoxEnableSynchronization: '0' }
    });
  });

  it('renders the standard sprint board', async () => {
    await startPracticeMode('standard');
    await waitForVisibleInPracticeScroll('session-board');

    const boardFrame = await frameFor(element(by.id('session-board')));
    const screenshotPath = await device.takeScreenshot('standard-board');
    expectBoardScreenshotContainsPieces(screenshotPath, boardFrame);

  });

  it('renders Arrow Duel candidate arrows on the board', async () => {
    await startPracticeMode('arrow-duel');
    await waitForVisibleInPracticeScroll('session-board');

    const boardFrame = await frameFor(element(by.id('session-board')));
    const screenshotPath = await device.takeScreenshot('arrow-duel-neutral-arrows');
    expectBoardScreenshotContainsNeutralArrows(screenshotPath, boardFrame);

  });

  it('accepts the fixed alternate mate-in-one puzzle', async () => {
    await selectTestPuzzleSource('familiar15');
    await startPracticeMode('standard');
    await waitForVisibleInPracticeScroll('session-board');

    const boardFrame = await frameFor(element(by.id('session-board')));
    const c2 = boardPoint(boardFrame, 'c2');
    const b1 = boardPoint(boardFrame, 'b1');

    await element(by.id('session-board')).tapAtPoint(c2);
    await sleep(300);
    await element(by.id('session-board')).tapAtPoint(b1);

    await waitFor(element(by.id('session-progress'))).toHaveText('1 / 15').withTimeout(10000);

  });

  it('opens last sprint mistake review with navigation and analysis arrows', async () => {
    await selectTestPuzzleSource('familiar15');
    await startPracticeMode('standard');
    await waitForVisibleInPracticeScroll('session-board');

    await playBoardMove('session-board', 'c2b3');
    await sleep(1100);
    await playBoardMove('session-board', 'c4b5');
    await sleep(1100);
    await playBoardMove('session-board', 'g6g5', true);

    await waitFor(element(by.text('Sprint failed'))).toBeVisible().withTimeout(10000);
    await waitFor(element(by.id('review-mistakes-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('review-mistakes-button')).tap();

    await waitFor(element(by.text('1 / 3 · Standard'))).toBeVisible().withTimeout(30000);
    await expect(element(by.id('review-next'))).toBeVisible();
    await element(by.id('review-next')).tap();
    await waitFor(element(by.text('2 / 3 · Standard'))).toBeVisible().withTimeout(30000);
    await element(by.id('review-previous')).tap();
    await waitFor(element(by.text('1 / 3 · Standard'))).toBeVisible().withTimeout(30000);

    await element(by.id('review-analysis-button')).tap();
    await waitFor(element(by.id('review-analysis-back'))).toBeVisible().withTimeout(5000);
    await waitFor(element(by.id('review-analysis-forward'))).toBeVisible().withTimeout(5000);
    await waitFor(element(by.id('review-analysis-reset'))).toBeVisible().withTimeout(5000);
    await waitFor(element(by.id('review-analysis-flip'))).toBeVisible().withTimeout(5000);
    await waitForElementTextContaining('review-analysis-engine-status', 'SF 18 NNUE', 45000);
    await waitForElementTextContaining('review-analysis-line-0', 'Top move', 90000);

    const screenshotPath = await device.takeScreenshot('review-analysis-arrows');
    expectScreenshotContainsGreenAnalysisArrow(screenshotPath);
  });
});

function expectBoardScreenshotContainsPieces(screenshotPath, boardFrame) {
  const png = readRgbaPng(screenshotPath);
  const boardPixels = pixelFrameForBoard(png, boardFrame);
  let pieceLikePixels = 0;

  for (let y = boardPixels.y; y < boardPixels.y + boardPixels.height; y += 2) {
    for (let x = boardPixels.x; x < boardPixels.x + boardPixels.width; x += 2) {
      const offset = (y * png.width + x) * 4;
      const r = png.data[offset];
      const g = png.data[offset + 1];
      const b = png.data[offset + 2];
      const a = png.data[offset + 3];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      if (a > 128 && (luma < 80 || luma > 245)) {
        pieceLikePixels += 1;
      }
    }
  }

  if (pieceLikePixels <= 1000) {
    throw new Error(`Expected rendered chess pieces, found only ${pieceLikePixels} piece-like pixels`);
  }
}

function expectBoardScreenshotContainsNeutralArrows(screenshotPath, boardFrame) {
  const png = readRgbaPng(screenshotPath);
  const boardPixels = pixelFrameForBoard(png, boardFrame);
  let arrowLikePixels = 0;

  for (let y = boardPixels.y; y < boardPixels.y + boardPixels.height; y += 1) {
    for (let x = boardPixels.x; x < boardPixels.x + boardPixels.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      const r = png.data[offset];
      const g = png.data[offset + 1];
      const b = png.data[offset + 2];
      const a = png.data[offset + 3];

      if (
        a > 240 &&
        r >= 40 && r <= 130 &&
        g >= 80 && g <= 170 &&
        b >= 190 && b <= 245 &&
        b > g + 35 &&
        b > r + 70
      ) {
        arrowLikePixels += 1;
      }
    }
  }

  if (arrowLikePixels <= 5000) {
    throw new Error(`Expected rendered Arrow Duel arrows, found only ${arrowLikePixels} arrow-like pixels`);
  }
}

function pixelFrameForBoard(png, boardFrame) {
  const screenWidthPoints = boardFrame.x * 2 + boardFrame.width;
  const scale = png.width / screenWidthPoints;
  return {
    x: Math.max(0, Math.floor(boardFrame.x * scale)),
    y: Math.max(0, Math.floor(boardFrame.y * scale)),
    width: Math.min(png.width, Math.ceil(boardFrame.width * scale)),
    height: Math.min(png.height, Math.ceil(boardFrame.height * scale))
  };
}

function expectScreenshotContainsGreenAnalysisArrow(screenshotPath) {
  const png = readRgbaPng(screenshotPath);
  let arrowLikePixels = 0;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      const r = png.data[offset];
      const g = png.data[offset + 1];
      const b = png.data[offset + 2];
      const a = png.data[offset + 3];

      if (
        a > 220 &&
        r >= 10 && r <= 70 &&
        g >= 120 && g <= 190 &&
        b >= 55 && b <= 120 &&
        g > r + 70 &&
        g > b + 35
      ) {
        arrowLikePixels += 1;
      }
    }
  }

  if (arrowLikePixels <= 500) {
    throw new Error(`Expected rendered green analysis arrow, found only ${arrowLikePixels} green arrow-like pixels`);
  }
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
