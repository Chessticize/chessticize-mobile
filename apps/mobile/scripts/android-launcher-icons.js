const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const DENSITIES = [
  { name: 'mdpi', scale: 1 },
  { name: 'hdpi', scale: 1.5 },
  { name: 'xhdpi', scale: 2 },
  { name: 'xxhdpi', scale: 3 },
  { name: 'xxxhdpi', scale: 4 },
];
const LEGACY_DP = 48;
const ADAPTIVE_LAYER_DP = 108;
const ADAPTIVE_VIEWPORT_DP = 72;
const ADAPTIVE_MARGIN_DP = 18;
const LOGO_SAFE_ZONE_DP = 66;

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Expected a PNG file');
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    throw new Error(`Unsupported PNG format: depth=${bitDepth}, color=${colorType}, interlace=${interlace}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const filtered = zlib.inflateSync(Buffer.concat(idat));
  const scanlines = Buffer.alloc(stride * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[inputOffset];
    inputOffset += 1;
    const rowOffset = y * stride;
    const previousOffset = rowOffset - stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[inputOffset + x];
      const left = x >= channels ? scanlines[rowOffset + x - channels] : 0;
      const above = y > 0 ? scanlines[previousOffset + x] : 0;
      const upperLeft = y > 0 && x >= channels
        ? scanlines[previousOffset + x - channels]
        : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + above;
      else if (filter === 3) value = raw + Math.floor((left + above) / 2);
      else if (filter === 4) value = raw + paethPredictor(left, above, upperLeft);
      else throw new Error(`Unsupported PNG filter ${filter}`);
      scanlines[rowOffset + x] = value & 0xff;
    }
    inputOffset += stride;
  }
  const pixels = Buffer.alloc(width * height * 4);
  for (let sourceOffset = 0, targetOffset = 0; sourceOffset < scanlines.length; sourceOffset += channels) {
    pixels[targetOffset] = scanlines[sourceOffset];
    pixels[targetOffset + 1] = scanlines[sourceOffset + 1];
    pixels[targetOffset + 2] = scanlines[sourceOffset + 2];
    pixels[targetOffset + 3] = channels === 4 ? scanlines[sourceOffset + 3] : 255;
    targetOffset += 4;
  }
  return { width, height, pixels };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return chunk;
}

function encodePng(image) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = image.width * 4;
  const scanlines = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    image.pixels.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function resizeBox(source, width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let targetY = 0; targetY < height; targetY += 1) {
    const sourceY0 = targetY * source.height / height;
    const sourceY1 = (targetY + 1) * source.height / height;
    for (let targetX = 0; targetX < width; targetX += 1) {
      const sourceX0 = targetX * source.width / width;
      const sourceX1 = (targetX + 1) * source.width / width;
      const totals = [0, 0, 0, 0];
      let totalWeight = 0;
      for (let sourceY = Math.floor(sourceY0); sourceY < Math.ceil(sourceY1); sourceY += 1) {
        const yWeight = Math.min(sourceY1, sourceY + 1) - Math.max(sourceY0, sourceY);
        for (let sourceX = Math.floor(sourceX0); sourceX < Math.ceil(sourceX1); sourceX += 1) {
          const xWeight = Math.min(sourceX1, sourceX + 1) - Math.max(sourceX0, sourceX);
          const weight = xWeight * yWeight;
          const sourceOffset = (sourceY * source.width + sourceX) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            totals[channel] += source.pixels[sourceOffset + channel] * weight;
          }
          totalWeight += weight;
        }
      }
      const targetOffset = (targetY * width + targetX) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[targetOffset + channel] = Math.round(totals[channel] / totalWeight);
      }
    }
  }
  return { width, height, pixels };
}

function renderAdaptiveLayer(source, scale) {
  const viewport = Math.round(ADAPTIVE_VIEWPORT_DP * scale);
  const margin = Math.round(ADAPTIVE_MARGIN_DP * scale);
  const layer = Math.round(ADAPTIVE_LAYER_DP * scale);
  const artwork = resizeBox(source, viewport, viewport);
  const pixels = Buffer.alloc(layer * layer * 4);
  for (let y = 0; y < layer; y += 1) {
    const artworkY = Math.max(0, Math.min(viewport - 1, y - margin));
    for (let x = 0; x < layer; x += 1) {
      const artworkX = Math.max(0, Math.min(viewport - 1, x - margin));
      const sourceOffset = (artworkY * viewport + artworkX) * 4;
      const targetOffset = (y * layer + x) * 4;
      artwork.pixels.copy(pixels, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return { width: layer, height: layer, pixels };
}

function isBrandBlue(red, green, blue) {
  return blue >= 170 && blue >= red + 60 && blue >= green + 20;
}

function brandMarkSafeZone(source) {
  let maximumDistanceDp = 0;
  let count = 0;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = (y * source.width + x) * 4;
      if (!isBrandBlue(source.pixels[offset], source.pixels[offset + 1], source.pixels[offset + 2])) continue;
      const mappedX = ADAPTIVE_MARGIN_DP + (x + 0.5) * ADAPTIVE_VIEWPORT_DP / source.width;
      const mappedY = ADAPTIVE_MARGIN_DP + (y + 0.5) * ADAPTIVE_VIEWPORT_DP / source.height;
      maximumDistanceDp = Math.max(maximumDistanceDp, Math.hypot(mappedX - 54, mappedY - 54));
      count += 1;
    }
  }
  return { count, maximumDistanceDp };
}

function expectedLauncherResources(canonicalPng) {
  const source = decodePng(canonicalPng);
  const resources = new Map();
  for (const density of DENSITIES) {
    const legacySize = Math.round(LEGACY_DP * density.scale);
    resources.set(
      `mipmap-${density.name}/ic_launcher.png`,
      encodePng(resizeBox(source, legacySize, legacySize)),
    );
    resources.set(
      `mipmap-${density.name}/ic_launcher_foreground.png`,
      encodePng(renderAdaptiveLayer(source, density.scale)),
    );
  }
  return resources;
}

function imagesEqual(left, right) {
  return left.width === right.width
    && left.height === right.height
    && left.pixels.equals(right.pixels);
}

function launcherPaths(mobileRoot) {
  return {
    canonical: path.join(
      mobileRoot,
      'ios/ChessticizeMobile/Images.xcassets/AppIcon.appiconset/AppIcon-ios-marketing-1024.png',
    ),
    resources: path.join(mobileRoot, 'android/app/src/main/res'),
  };
}

function synchronizeLauncherIcons(mobileRoot, checkOnly = false) {
  const paths = launcherPaths(mobileRoot);
  const expected = expectedLauncherResources(fs.readFileSync(paths.canonical));
  const mismatches = [];
  for (const [relativePath, png] of expected) {
    const outputPath = path.join(paths.resources, relativePath);
    if (checkOnly) {
      if (!fs.existsSync(outputPath) || !imagesEqual(decodePng(fs.readFileSync(outputPath)), decodePng(png))) {
        mismatches.push(relativePath);
      }
    } else {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, png);
    }
  }
  if (mismatches.length > 0) throw new Error(`Android launcher resources are stale: ${mismatches.join(', ')}`);
}

if (require.main === module) {
  const mobileRoot = path.resolve(__dirname, '..');
  synchronizeLauncherIcons(mobileRoot, process.argv.includes('--check'));
}

module.exports = {
  ADAPTIVE_LAYER_DP,
  ADAPTIVE_MARGIN_DP,
  ADAPTIVE_VIEWPORT_DP,
  DENSITIES,
  LEGACY_DP,
  LOGO_SAFE_ZONE_DP,
  brandMarkSafeZone,
  decodePng,
  expectedLauncherResources,
  imagesEqual,
  synchronizeLauncherIcons,
};
