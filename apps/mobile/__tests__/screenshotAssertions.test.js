const {
  BoardScreenshotPiecesError,
  countOccupiedBoardSquares,
  waitForBoardScreenshotContainsPieces,
} = require('../e2e/screenshotAssertions');

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
    const screenshots = ['empty-after-rotation.png', 'rendered-after-rotation.png'];
    const captureScreenshot = jest.fn(async () => screenshots.shift());
    const inspectScreenshot = jest.fn((screenshotPath) => {
      const png = syntheticBoard();
      if (screenshotPath === 'rendered-after-rotation.png') {
        paintPiece(png, 6, 2, [20, 25, 32, 255]);
        paintPiece(png, 7, 0, [245, 245, 245, 255]);
      }
      const occupiedSquares = countOccupiedBoardSquares(png, fullBoardFrame());
      if (occupiedSquares < 2) {
        throw new BoardScreenshotPiecesError(occupiedSquares);
      }
    });
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
      inspectScreenshot,
      now: () => clock,
      pollIntervalMs: 25,
      timeoutMs: 100,
    })).resolves.toBe('rendered-after-rotation.png');

    expect(captureScreenshot).toHaveBeenCalledTimes(2);
    expect(inspectScreenshot).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(25);
  });

  it('fails closed when a rotated board remains empty through the render deadline', async () => {
    let clock = 0;
    const delay = async (milliseconds) => {
      clock += milliseconds;
    };
    const captureScreenshot = jest.fn(async () => `empty-at-${clock}.png`);
    const inspectScreenshot = jest.fn(() => {
      const occupiedSquares = countOccupiedBoardSquares(syntheticBoard(), fullBoardFrame());
      throw new BoardScreenshotPiecesError(occupiedSquares);
    });

    await expect(waitForBoardScreenshotContainsPieces({
      boardFrame: fullBoardFrame(),
      captureScreenshot,
      screenFrame: fullBoardFrame(),
      screenshotLabel: 'android-phone-landscape-standard-sprint',
    }, {
      delay,
      inspectScreenshot,
      now: () => clock,
      pollIntervalMs: 25,
      timeoutMs: 50,
    })).rejects.toThrow(
      'Timed out waiting for rendered chess pieces after 50ms; '
      + 'latest=Expected rendered chess pieces, found only 0 occupied board squares; '
      + 'screenshot=empty-at-50.png'
    );

    expect(captureScreenshot).toHaveBeenCalledTimes(3);
    expect(inspectScreenshot).toHaveBeenCalledTimes(3);
  });

  it('does not retry screenshot inspection failures unrelated to render readiness', async () => {
    const captureScreenshot = jest.fn(async () => 'malformed.png');
    const inspectScreenshot = jest.fn(() => {
      throw new Error('Screenshot is not a PNG');
    });

    await expect(waitForBoardScreenshotContainsPieces({
      boardFrame: fullBoardFrame(),
      captureScreenshot,
      screenFrame: fullBoardFrame(),
      screenshotLabel: 'android-phone-landscape-standard-sprint',
    }, {
      inspectScreenshot,
    })).rejects.toThrow('Screenshot is not a PNG');

    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    expect(inspectScreenshot).toHaveBeenCalledTimes(1);
  });
});

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
