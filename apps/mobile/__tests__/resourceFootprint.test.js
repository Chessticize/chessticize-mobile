const {
  parseFootprintOutput,
  sampleProcessFootprint,
} = require('../e2e/resourceFootprint');

const REALISTIC_FOOTPRINT_OUTPUT = `
Process:         ChessticizeMobile [43102]
Path:            /tmp/ChessticizeMobile.app/ChessticizeMobile
Physical footprint:         533.1 MB
Physical footprint (peak):  612.4 MB

  Dirty      Clean  Reclaimable    Regions    Category
    ---        ---          ---        ---    ---
  163 MB       0 B          0 B        921    MALLOC
 5120 KB      64 KB          0 B         82    CG raster data
  365 MB    22.5 MB        128 KB       2034    TOTAL
`;

describe('iOS process footprint sampling', () => {
  it('parses the real category-table shape and separates CG raster dirty memory', () => {
    expect(parseFootprintOutput(REALISTIC_FOOTPRINT_OUTPUT)).toEqual({
      totalDirtyKb: 365 * 1024,
      cgRasterDirtyKb: 5120,
      nonCgDirtyKb: 365 * 1024 - 5120,
      categories: [
        {
          category: 'MALLOC',
          dirtyKb: 163 * 1024,
          cleanKb: 0,
          reclaimableKb: 0,
          regions: 921,
        },
        {
          category: 'CG raster data',
          dirtyKb: 5120,
          cleanKb: 64,
          reclaimableKb: 0,
          regions: 82,
        },
      ],
    });
  });

  it('treats an absent CG raster data category as zero', () => {
    const output = `
  Dirty      Clean  Reclaimable    Regions    Category
    ---        ---          ---        ---    ---
    4 MB       0 B          0 B          3    MALLOC
    6 MB       0 B          0 B          3    TOTAL
`;

    expect(parseFootprintOutput(output)).toMatchObject({
      totalDirtyKb: 6 * 1024,
      cgRasterDirtyKb: 0,
      nonCgDirtyKb: 6 * 1024,
    });
  });

  it.each([
    [
      'missing',
      `
  Dirty      Clean  Reclaimable    Regions    Category
    4 MB       0 B          0 B          3    MALLOC
`,
    ],
    [
      'malformed',
      `
  Dirty      Clean  Reclaimable    Regions    Category
    4 MB       0 B          0 B          3    MALLOC
   nope       0 B          0 B          3    TOTAL
`,
    ],
  ])('fails closed when the TOTAL row is %s', (_case, output) => {
    expect(() => parseFootprintOutput(output)).toThrow(/TOTAL/);
  });

  it('fails closed when a present CG raster data row is malformed', () => {
    const output = `
  Dirty      Clean  Reclaimable    Regions    Category
   nope       0 B          0 B          4    CG raster data
    8 MB       0 B          0 B          7    TOTAL
`;

    expect(() => parseFootprintOutput(output)).toThrow(/CG raster data row/);
  });

  it('converts B, KB, MB, and GB values and treats dashes as zero', () => {
    const output = `
  Dirty      Clean  Reclaimable    Regions    Category
    ---        ---          ---        ---    ---
  512 B       2 KB       1.5 MB          1    byte category
 1.5 MB    0.25 GB          0 B      1,234    CG raster data
    2 GB       1 MB          ---      2,048    TOTAL
`;

    expect(parseFootprintOutput(output)).toEqual({
      totalDirtyKb: 2 * 1024 * 1024,
      cgRasterDirtyKb: 1.5 * 1024,
      nonCgDirtyKb: 2 * 1024 * 1024 - 1.5 * 1024,
      categories: [
        {
          category: 'byte category',
          dirtyKb: 0.5,
          cleanKb: 2,
          reclaimableKb: 1.5 * 1024,
          regions: 1,
        },
        {
          category: 'CG raster data',
          dirtyKb: 1.5 * 1024,
          cleanKb: 0.25 * 1024 * 1024,
          reclaimableKb: 0,
          regions: 1234,
        },
      ],
    });
  });

  it('runs footprint against the requested PID before parsing its output', () => {
    const calls = [];
    const execFileSync = (command, args, options) => {
      calls.push({command, args, options});
      return REALISTIC_FOOTPRINT_OUTPUT;
    };

    expect(sampleProcessFootprint(43102, {execFileSync})).toMatchObject({
      totalDirtyKb: 365 * 1024,
      cgRasterDirtyKb: 5120,
    });
    expect(calls).toEqual([
      {
        command: '/usr/bin/footprint',
        args: ['-p', '43102'],
        options: {
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
        },
      },
    ]);
  });
});
