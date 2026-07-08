/* eslint-disable no-bitwise */
/* global Buffer */

const fs = require('fs');
const zlib = require('zlib');

function expectBoardScreenshotContainsPieces(screenshotPath, boardFrame, screenFrame) {
  const png = readRgbaPng(screenshotPath);
  const boardPixels = pixelFrameForElement(png, boardFrame, screenFrame);
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
  expectBoardScreenshotContainsPieces,
  expectFrameContained
};
