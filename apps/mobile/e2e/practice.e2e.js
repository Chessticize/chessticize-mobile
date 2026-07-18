const fs = require('fs');
const zlib = require('zlib');
const {
  elementText,
  sleep,
  frameFor,
  launchWithDisabledSynchronization,
  openStandardHistoryTrend,
  playBoardMove,
  startPracticeMode,
  selectTestPuzzleSource,
  waitForVisibleInPracticeScroll,
  waitForElementAccessibilityLabelContaining,
  waitForElementTextContaining,
  waitForRunningStockfishDepth,
  failStandardSprint
} = require('./helpers');

// The visual assertion measures absolute painted arrow area. Pin the public
// service's packaged-core selection to two long candidate vectors so random
// move geometry cannot turn that rendering check into a pixel-count lottery.
const PRACTICE_RENDER_PUZZLE_SELECTION_SEED = 'practice-arrow-render-v1:4';

describe('Practice POC', () => {
  beforeEach(async () => {
    // These smoke tests use explicit waitFor checks and screenshot assertions.
    // React Native, Skia, and native engine startup can keep Detox synchronization
    // busy after the first visible frame, so launch args disable synchronization
    // before Detox waits on app readiness.
    await device.setOrientation('portrait');
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: true,
      launchArgs: {
        chessticizePuzzleSelectionSeed: PRACTICE_RENDER_PUZZLE_SELECTION_SEED
      }
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
    // The default 5/30 Arrow Duel config and pinned seed select packaged puzzle
    // 03wH4 through PracticeService's rating fallback. Candidate order is
    // session-seeded, so wait for both long vectors without assuming order.
    await waitForElementTextContaining('arrow-duel-candidate-overlay', 'c3e4', 10000);
    await waitForElementTextContaining('arrow-duel-candidate-overlay', 'h4f6', 10000);

    const boardFrame = await frameFor(element(by.id('session-board')));
    const screenshotPath = await device.takeScreenshot('arrow-duel-neutral-arrows');
    expectBoardScreenshotContainsNeutralArrows(screenshotPath, boardFrame);

  });

  it('shows Arrow Duel feedback after a wrong candidate move', async () => {
    await selectTestPuzzleSource('familiar15');
    await startPracticeMode('arrow-duel');
    await waitForVisibleInPracticeScroll('session-board');
    // 00Kbj is the first Arrow-Duel-eligible familiar15 puzzle. Assert the
    // fixture contract before playing its known wrong candidate.
    await waitForElementTextContaining('arrow-duel-candidate-overlay', 'h1h2', 10000);
    await waitForElementTextContaining('arrow-duel-candidate-overlay', 'h3h4', 10000);

    await playBoardMove('session-board', 'h3h4');

    await waitFor(element(by.label('Mistakes 1 of 3')).atIndex(0)).toExist().withTimeout(10000);
    await waitFor(element(by.id('move-feedback-overlay'))).toExist().withTimeout(10000);
    await waitFor(element(by.id('session-progress'))).toHaveText('0 / 10').withTimeout(10000);
  });

  it('accepts the fixed alternate mate-in-one puzzle', async () => {
    await selectTestPuzzleSource('familiar15');
    await startPracticeMode('standard');
    await waitForVisibleInPracticeScroll('session-board');

    await playBoardMove('session-board', 'c2b1');

    await waitFor(element(by.id('session-progress'))).toHaveText('1 / 15').withTimeout(10000);

  });

  it('persists Unclear, places its History actions responsively, and manages Review Schedule there', async () => {
    await selectTestPuzzleSource('familiar15');
    await startPracticeMode('standard');
    await waitForVisibleInPracticeScroll('session-board');

    await playBoardMove('session-board', 'c2b1');
    await waitFor(element(by.id('sprint-unclear-prompt'))).toBeVisible().withTimeout(10000);
    await element(by.id('sprint-unclear-toggle')).tap();
    await waitFor(element(by.text('Marked as unclear')))
      .toBeVisible()
      .withTimeout(10000);

    // Let the normal feedback snapshot advance to the next board. The prompt
    // remains bound to the completed attempt rather than the newly shown puzzle.
    await waitForElementTextContaining('sprint-unclear-question', 'previous puzzle', 10000);
    await element(by.id('session-abandon')).tap();
    await waitFor(element(by.id('session-abandon-confirmation'))).toBeVisible().withTimeout(5000);
    await element(by.id('session-abandon-confirm')).tap();
    await waitFor(element(by.text('Sprint failed'))).toBeVisible().withTimeout(10000);
    await expect(element(by.text('Marked as unclear'))).toBeVisible();

    // Recreate the process so History reads the marker from SQLite rather than
    // component state from the sprint that created it.
    await device.terminateApp();
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: false
    });
    await openStandardHistoryTrend();
    await waitForElementAccessibilityLabelContaining(
      'history-filter-unclear',
      'Unclear attempts only',
      10000
    );
    await element(by.id('history-filter-unclear')).tap();
    await waitFor(element(by.text('Correct')).atIndex(0)).toExist().withTimeout(10000);
    const resultAttributes = await element(by.text('Correct')).atIndex(0).getAttributes();
    const resultIdentifier = (Array.isArray(resultAttributes) ? resultAttributes[0] : resultAttributes).identifier;
    if (typeof resultIdentifier !== 'string' || !resultIdentifier.endsWith('-result')) {
      throw new Error(`Could not resolve unclear History row from ${String(resultIdentifier)}`);
    }
    await element(by.id(resultIdentifier.replace(/-result$/, ''))).tap();
    await waitForVisibleInPracticeScroll('review-schedule-add');
    await waitForVisibleInPracticeScroll('history-attempt-unclear');
    await expect(element(by.id('history-attempt-detail'))).not.toExist();
    await expect(element(by.id('bookmark-glyph'))).not.toExist();

    await device.setOrientation('landscape');
    await waitFor(element(by.id('review-context-actions-rail'))).toBeVisible().withTimeout(10000);
    await expect(element(by.id('review-schedule-control'))).toBeVisible();
    await expect(element(by.id('history-attempt-unclear'))).toBeVisible();
    const boardFrame = await frameFor(element(by.id('review-board')));
    const actionRailFrame = await frameFor(element(by.id('review-context-actions-rail')));
    expect(actionRailFrame.x).toBeGreaterThanOrEqual(boardFrame.x + boardFrame.width);
    const responsiveScreenshot = await device.takeScreenshot('history-review-actions-landscape');
    expect(fs.existsSync(responsiveScreenshot)).toBe(true);

    await element(by.id('review-schedule-add')).tap();
    await waitFor(element(by.id('review-schedule-state'))).toHaveText('Due tomorrow').withTimeout(10000);
    await waitFor(element(by.id('history-attempt-unclear'))).not.toExist().withTimeout(10000);

    await element(by.id('review-schedule-remove')).tap();
    await waitFor(element(by.id('review-schedule-removal-confirmation'))).toBeVisible().withTimeout(10000);
    await sleep(500);
    await element(by.id('review-schedule-removal-confirm')).tap();
    await waitFor(element(by.id('review-schedule-state')))
      .toHaveText('Not scheduled for Review')
      .withTimeout(10000);

    // Enrollment atomically cleared the marker, and removal does not restore it.
    await device.setOrientation('portrait');
    await device.terminateApp();
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: false
    });
    await openStandardHistoryTrend();
    await waitForElementAccessibilityLabelContaining(
      'history-filter-unclear',
      'Unclear attempts only',
      10000
    );
    await element(by.id('history-filter-unclear')).tap();
    await waitFor(element(by.id('history-empty-state'))).toExist().withTimeout(10000);
  });

  it('opens last sprint mistake review with navigation and analysis arrows', async () => {
    await failStandardSprint();
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

    // Preserve the active native engine across an ordinary interruption and
    // confirm that analysis remains usable when the application returns.
    await device.sendToHome();
    await sleep(500);
    await launchWithDisabledSynchronization({
      newInstance: false,
      delete: false
    });
    await waitFor(element(by.id('review-close-analysis'))).toBeVisible().withTimeout(10000);
    await waitForElementTextContaining('review-analysis-engine-status', 'SF 18 NNUE', 45000);
    await waitForElementTextContaining('review-analysis-line-0', 'Top move', 90000);
    await waitForElementTextContaining('review-analysis-line-0', 'Qa4#', 90000);

    // Observe a full-depth search in progress on a different review position,
    // then close it so cancellation is sent while the native engine is active.
    await element(by.id('review-close-analysis')).tap();
    await waitFor(element(by.id('review-analysis-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('review-next')).tap();
    await waitFor(element(by.text('2 / 3 · Standard'))).toBeVisible().withTimeout(30000);
    await element(by.id('review-analysis-button')).tap();
    await waitFor(element(by.id('review-close-analysis'))).toBeVisible().withTimeout(10000);
    await waitForRunningStockfishDepth(
      'review-analysis-engine-status',
      8,
      90000,
      { comparison: 'above' }
    );
    await element(by.id('review-close-analysis')).tap();
    await waitFor(element(by.id('review-analysis-button'))).toBeVisible().withTimeout(10000);

    // Start a third, position-specific analysis. Seeing its own best move proves
    // that output from the cancelled search did not leak into the replacement.
    await element(by.id('review-next')).tap();
    await waitFor(element(by.text('3 / 3 · Standard'))).toBeVisible().withTimeout(30000);
    await element(by.id('review-analysis-button')).tap();
    await waitFor(element(by.id('review-close-analysis'))).toBeVisible().withTimeout(10000);
    await waitForElementTextContaining('review-analysis-engine-status', 'SF 18 NNUE', 45000);
    await waitForElementTextContaining('review-analysis-line-0', 'Kg3', 90000);
    const replacementLine = await elementText('review-analysis-line-0');
    if (replacementLine.includes('Qxe6')) {
      throw new Error(`Cancelled analysis leaked into the replacement position: ${replacementLine}`);
    }

    const screenshotPath = await device.takeScreenshot('review-analysis-arrows');
    expectScreenshotContainsGreenAnalysisArrow(screenshotPath);

    // Kill the process with a real native runner active, relaunch against the
    // saved attempt, and start analysis again through public History UI.
    // This proves a fresh native runner can prewarm after process recreation.
    await device.terminateApp();
    await launchWithDisabledSynchronization({
      newInstance: true,
      delete: false
    });
    await openStandardHistoryTrend();
    await waitFor(element(by.text('Wrong move')).atIndex(0)).toExist().withTimeout(10000);
    const resultAttributes = await element(by.text('Wrong move')).atIndex(0).getAttributes();
    const resultIdentifier = (Array.isArray(resultAttributes) ? resultAttributes[0] : resultAttributes).identifier;
    if (typeof resultIdentifier !== 'string' || !resultIdentifier.endsWith('-result')) {
      throw new Error(`Could not resolve persisted history attempt row from ${String(resultIdentifier)}`);
    }
    await element(by.id(resultIdentifier.replace(/-result$/, ''))).tap();
    await waitFor(element(by.id('review-session'))).toExist().withTimeout(10000);
    await waitForVisibleInPracticeScroll('review-analysis-button');
    await element(by.id('review-analysis-button')).tap();
    await waitFor(element(by.id('review-close-analysis'))).toBeVisible().withTimeout(10000);
    await waitForElementTextContaining('review-analysis-engine-status', 'SF 18 NNUE', 45000);
    await waitForElementTextContaining('review-analysis-line-0', 'Top move', 90000);
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

      // PNG scanline reconstruction intentionally clamps the decoded value to one byte.
      // eslint-disable-next-line no-bitwise
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
