const { execFileSync: nodeExecFileSync } = require('node:child_process');

const FOOTPRINT_PATH = '/usr/bin/footprint';
const FOOTPRINT_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const SIZE_PATTERN = String.raw`(?:---|[\d,.]+(?:\.\d+)?\s*(?:B|KB|MB|GB))`;
const REGIONS_PATTERN = String.raw`(?:---|[\d,]+)`;
const CATEGORY_ROW_PATTERN = new RegExp(
  String.raw`^\s*(${SIZE_PATTERN})\s+(${SIZE_PATTERN})\s+`
    + String.raw`(${SIZE_PATTERN})\s+(${REGIONS_PATTERN})\s+(.+?)\s*$`,
  'i'
);

function sampleProcessFootprint(pid, options = {}) {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`footprint PID must be a positive integer; received ${pid}`);
  }

  const execFileSync = options.execFileSync ?? nodeExecFileSync;
  const output = execFileSync(
    FOOTPRINT_PATH,
    ['-p', String(pid)],
    {
      encoding: 'utf8',
      maxBuffer: FOOTPRINT_MAX_BUFFER_BYTES,
    }
  );
  return parseFootprintOutput(String(output ?? ''));
}

function parseFootprintOutput(text) {
  const lines = String(text).split(/\r?\n/);
  const headerIndex = lines.findIndex(isCategoryTableHeader);
  if (headerIndex < 0) {
    throw new Error('footprint output did not contain the category table header');
  }

  const categories = [];
  let totalDirtyKb;
  let cgRasterDirtyKb = 0;
  let sawCgRasterData = false;

  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) {
      continue;
    }

    const match = CATEGORY_ROW_PATTERN.exec(line);
    if (!match) {
      if (line.includes('CG raster data')) {
        throw new Error(`Unable to parse footprint CG raster data row: ${line.trim()}`);
      }
      if (looksLikeCategory(line, 'TOTAL')) {
        throw new Error(`Unable to parse footprint TOTAL row: ${line.trim()}`);
      }
      continue;
    }

    const [, dirty, clean, reclaimable, regions, category] = match;
    if (category === '---') {
      continue;
    }

    const parsed = {
      category,
      dirtyKb: parseSizeKb(dirty, category, 'Dirty'),
      cleanKb: parseSizeKb(clean, category, 'Clean'),
      reclaimableKb: parseSizeKb(reclaimable, category, 'Reclaimable'),
      regions: parseRegions(regions, category),
    };

    if (category === 'TOTAL') {
      totalDirtyKb = parsed.dirtyKb;
      break;
    }

    categories.push(parsed);
    if (category === 'CG raster data') {
      sawCgRasterData = true;
      cgRasterDirtyKb += parsed.dirtyKb;
    }
  }

  if (totalDirtyKb === undefined) {
    throw new Error('footprint output did not contain a parseable TOTAL row');
  }
  if (sawCgRasterData && !Number.isFinite(cgRasterDirtyKb)) {
    throw new Error('footprint CG raster data dirty size was not finite');
  }

  const nonCgDirtyKb = totalDirtyKb - cgRasterDirtyKb;
  if (nonCgDirtyKb < 0) {
    throw new Error(
      `footprint CG raster data dirty size ${cgRasterDirtyKb} KB exceeded `
      + `TOTAL dirty size ${totalDirtyKb} KB`
    );
  }

  return {
    totalDirtyKb,
    cgRasterDirtyKb,
    nonCgDirtyKb,
    categories,
  };
}

function isCategoryTableHeader(line) {
  return /^\s*Dirty\s+Clean\s+Reclaimable\s+Regions\s+Category\s*$/.test(line);
}

function looksLikeCategory(line, category) {
  return line.trim().endsWith(category);
}

function parseSizeKb(value, category, column) {
  if (value === '---') {
    return 0;
  }

  const match = /^([\d,.]+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i.exec(value);
  if (!match) {
    throw new Error(`Unable to parse ${column} size for footprint category ${category}: ${value}`);
  }

  const amount = Number(match[1].replaceAll(',', ''));
  const multipliers = {
    B: 1 / 1024,
    KB: 1,
    MB: 1024,
    GB: 1024 * 1024,
  };
  const sizeKb = amount * multipliers[match[2].toUpperCase()];
  if (!Number.isFinite(sizeKb)) {
    throw new Error(`${column} size for footprint category ${category} was not finite`);
  }
  return sizeKb;
}

function parseRegions(value, category) {
  if (value === '---') {
    return 0;
  }

  const regions = Number(value.replaceAll(',', ''));
  if (!Number.isSafeInteger(regions) || regions < 0) {
    throw new Error(`Unable to parse Regions for footprint category ${category}: ${value}`);
  }
  return regions;
}

module.exports = {
  parseFootprintOutput,
  sampleProcessFootprint,
};
