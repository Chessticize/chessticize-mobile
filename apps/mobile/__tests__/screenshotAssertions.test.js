const { countOccupiedBoardSquares } = require('../e2e/screenshotAssertions');

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
