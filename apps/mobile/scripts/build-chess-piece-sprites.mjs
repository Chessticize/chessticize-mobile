#!/usr/bin/env node
/**
 * Generates 768x256 (6x2 grid, 128x128 cells) PNG sprite sheets for the
 * license-verified Lichess chess piece sets.
 *
 * Layout matches react-native-chessboard SkiaPiecesAtlas:
 *   Row 0 (y = 0):   wP, wN, wB, wR, wQ, wK
 *   Row 1 (y = 128): bP, bN, bB, bR, bQ, bK
 *
 * Usage:
 *   node apps/mobile/scripts/build-chess-piece-sprites.mjs
 *   node apps/mobile/scripts/build-chess-piece-sprites.mjs --svg-dir scratch/lila-svgs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const repoRoot = dirname(fileURLToPath(new URL("../../../package.json", import.meta.url)));

export const LILA_COMMIT = "47948db658a1678d14e97d41c1bcf82958e70ded";
const CELL_SIZE = 128;
const COLUMNS = 6;
const ROWS = 2;
const SHEET_WIDTH = CELL_SIZE * COLUMNS;
const SHEET_HEIGHT = CELL_SIZE * ROWS;

const PIECE_SETS = [
  { id: "cburnett", upstreamDir: "public/piece/cburnett" },
  { id: "merida", upstreamDir: "public/piece/merida" },
  { id: "chessnut", upstreamDir: "public/piece/chessnut" },
  { id: "spatial", upstreamDir: "public/piece/spatial" },
  { id: "fantasy", upstreamDir: "public/piece/fantasy" }
];

const PIECE_GRID = [
  ["wP", "wN", "wB", "wR", "wQ", "wK"],
  ["bP", "bN", "bB", "bR", "bQ", "bK"]
];

function parseArgs(argv) {
  const options = {
    svgDir: null,
    outDir: join(repoRoot, "apps/mobile/src/assets/pieces")
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--svg-dir") {
      options.svgDir = resolve(argv[++i]);
    } else if (argv[i] === "--out-dir") {
      options.outDir = resolve(argv[++i]);
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return options;
}

async function fetchSvgBuffer(set, pieceCode, svgDir) {
  if (svgDir) {
    const cachedPath = join(svgDir, set.id, `${pieceCode}.svg`);
    if (existsSync(cachedPath)) {
      return readFileSync(cachedPath);
    }
  }
  const url = `https://raw.githubusercontent.com/lichess-org/lila/${LILA_COMMIT}/${set.upstreamDir}/${pieceCode}.svg`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (svgDir) {
    const dir = join(svgDir, set.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${pieceCode}.svg`), buffer);
  }
  return buffer;
}

async function renderCell(svgBuffer) {
  // Measure intrinsic SVG size at 72 DPI, then choose a rasterization density
  // targeting ~512px supersampling before Lanczos3 downsampling to 128x128.
  // This keeps small viewBoxes (e.g., 45x45) crisp without exceeding pixel
  // limits on large point/mm SVGs (e.g., 700pt).
  const meta = await sharp(svgBuffer, { density: 72, limitInputPixels: false }).metadata();
  const baseMax = Math.max(meta.width ?? CELL_SIZE, meta.height ?? CELL_SIZE, 1);
  const density = Math.max(36, Math.min(768, Math.round((512 / baseMax) * 72)));
  return sharp(svgBuffer, { density, limitInputPixels: false })
    .resize(CELL_SIZE, CELL_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3
    })
    .png()
    .toBuffer();
}

async function buildPieceSetSprite(set, options) {
  const composites = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLUMNS; col += 1) {
      const pieceCode = PIECE_GRID[row][col];
      const svgBuffer = await fetchSvgBuffer(set, pieceCode, options.svgDir);
      const cellPng = await renderCell(svgBuffer);
      composites.push({
        input: cellPng,
        left: col * CELL_SIZE,
        top: row * CELL_SIZE
      });
    }
  }

  mkdirSync(options.outDir, { recursive: true });
  const outputPath = join(options.outDir, `${set.id}.png`);
  await sharp({
    create: {
      width: SHEET_WIDTH,
      height: SHEET_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png({ compressionLevel: 9, palette: false })
    .toFile(outputPath);

  console.log(`Generated ${outputPath}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  for (const set of PIECE_SETS) {
    await buildPieceSetSprite(set, options);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
