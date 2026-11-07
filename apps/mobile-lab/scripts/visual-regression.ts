import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright-core";
import sharp from "sharp";
import { LAB_DEVICE_VIEWPORTS } from "../src/labDeviceFrame.ts";
import { scenarioRegistry } from "../src/scenarioRegistry.ts";

// Pixel-diffs every product-clone scenario between a baseline build and the
// current checkout. Usage and output are documented in apps/mobile-lab/README.md.

type ViewportKey = keyof typeof LAB_DEVICE_VIEWPORTS;
type Mode = "baseline" | "compare";

const labRoot = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = resolve(labRoot, "../..");
const defaultViewports: ViewportKey[] = ["phonePortrait", "phoneLandscape", "regularWidth"];
const mimeTypes: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".mjs": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const { mode, options } = parseArguments(process.argv.slice(2));
const outDir = resolve(options.out ?? join(repoRoot, "scratch", "visual-regression"));
// Regions that change between frames of one capture are ignored when diffing. The grid is
// coarse and grown by one cell so a ticking digit is covered whichever glyph it shows.
const CELL_SIZE = 16;

await main();

async function main(): Promise<void> {
  if (mode === "baseline") {
    await runBaseline();
  } else {
    await runCompare();
  }
}

async function runBaseline(): Promise<void> {
  await rm(join(outDir, "baseline"), { force: true, recursive: true });
  if (options.ref === undefined) {
    await capture(repoRoot, join(outDir, "baseline"));
    return;
  }

  const worktree = join(outDir, "baseline-worktree");
  await rm(worktree, { force: true, recursive: true });
  git(["worktree", "prune"]);
  git(["worktree", "add", "--detach", worktree, options.ref]);
  try {
    run("pnpm", ["install", "--frozen-lockfile"], worktree);
    await capture(worktree, join(outDir, "baseline"));
  } finally {
    git(["worktree", "remove", "--force", worktree]);
  }
}

async function runCompare(): Promise<void> {
  const baselineDir = join(outDir, "baseline");
  if (!existsSync(baselineDir)) {
    throw new Error(`No baseline at ${baselineDir}. Run the baseline command first.`);
  }
  await rm(join(outDir, "current"), { force: true, recursive: true });
  await rm(join(outDir, "diff"), { force: true, recursive: true });
  await capture(repoRoot, join(outDir, "current"));

  // A filtered run only compares what it captured.
  const inSelection = (file: string): boolean => {
    const [viewport, name] = file.split("/") as [ViewportKey, string];
    return options.viewports.includes(viewport)
      && (options.only === undefined || name.includes(options.only));
  };
  const baselineFiles = new Set((await listPngs(baselineDir)).filter(inSelection));
  const currentFiles = new Set(await listPngs(join(outDir, "current")));
  const shared = [...currentFiles].filter((file) => baselineFiles.has(file)).sort();
  const added = [...currentFiles].filter((file) => !baselineFiles.has(file)).sort();
  const removed = [...baselineFiles].filter((file) => !currentFiles.has(file)).sort();

  await mkdir(join(outDir, "diff"), { recursive: true });
  const changed: { file: string; pixels: number; note?: string }[] = [];
  let withIgnoredRegions = 0;
  const mostlyIgnored: string[] = [];
  for (const file of shared) {
    const result = await diffImages(
      join(baselineDir, file),
      join(outDir, "current", file),
      join(outDir, "diff", file)
    );
    if (result.ignoredRatio > 0) withIgnoredRegions += 1;
    if (result.ignoredRatio > 0.25) {
      mostlyIgnored.push(`${file.replace(/\.png$/, "")} (${Math.round(result.ignoredRatio * 100)}%)`);
    }
    if (result.pixels > options.maxDiffPixels) {
      changed.push({ file, pixels: result.pixels, ...(result.note ? { note: result.note } : {}) });
    }
  }

  const summary = {
    compared: shared.length,
    withIgnoredRegions,
    mostlyIgnored,
    changed: changed.length,
    added: added.length,
    removed: removed.length,
    changedScenarios: changed,
    addedScenarios: added,
    removedScenarios: removed
  };
  await writeFile(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

  console.log(`\nVisual regression: ${summary.compared} compared, ${summary.changed} changed, `
    + `${summary.added} added, ${summary.removed} removed `
    + `(${withIgnoredRegions} with ignored animated regions).`);
  for (const { file, pixels, note } of changed) {
    console.log(`  changed ${file.replace(/\.png$/, "")}: ${note ?? `${pixels} px`}`);
  }
  for (const file of added) console.log(`  added ${file.replace(/\.png$/, "")}`);
  for (const file of removed) console.log(`  removed ${file.replace(/\.png$/, "")}`);
  if (mostlyIgnored.length > 0) {
    console.log(`  mostly animated (over 25% of the screen ignored): ${mostlyIgnored.join(", ")}`);
  }
  console.log(`Diff images: ${join(outDir, "diff")}`);
  console.log(`Summary: ${join(outDir, "summary.json")}`);
  process.exitCode = summary.changed + summary.added + summary.removed > 0 ? 1 : 0;
}

// Builds the checkout's Storybook, serves it and screenshots every selected
// scenario and viewport into targetDir/<viewport>/<storyId>.png.
async function capture(checkoutRoot: string, targetDir: string): Promise<void> {
  const staticDir = join(checkoutRoot, "apps", "mobile-lab", "storybook-static");
  if (!options.skipBuild) {
    run("pnpm", ["--filter", "ChessticizeMobileLab", "build-storybook"], checkoutRoot);
  }
  if (!existsSync(join(staticDir, "index.json"))) {
    throw new Error(`No Storybook build at ${staticDir}.`);
  }

  const indexed = new Set(
    Object.keys(
      (JSON.parse(readFileSync(join(staticDir, "index.json"), "utf8")) as {
        entries: Record<string, unknown>;
      }).entries
    )
  );
  const storyIds = Object.values(scenarioRegistry)
    .map((scenario) => scenario.storyId)
    .filter((storyId) => indexed.has(storyId) && (options.only === undefined
      || storyId.includes(options.only)));
  const jobs = options.viewports.flatMap((viewport) =>
    storyIds.map((storyId) => ({ storyId, viewport }))
  );

  const server = await serve(staticDir);
  // Prefer Playwright's own Chromium; fall back to the installed Google Chrome. Baseline and
  // comparison must run on the same browser build.
  const bundledBrowser = existsSync(chromium.executablePath());
  if (!bundledBrowser) {
    console.log("Playwright Chromium is not installed; using Google Chrome. "
      + "Install it with `pnpm exec playwright-core install chromium-headless-shell`.");
  }
  const browser = await chromium.launch(bundledBrowser ? {} : { channel: "chrome" });
  try {
    await mkdir(targetDir, { recursive: true });
    let next = 0;
    let done = 0;
    const failures: string[] = [];
    await Promise.all(Array.from({ length: options.concurrency }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++]!;
        try {
          await screenshot(browser, server.url, job.storyId, job.viewport, targetDir);
        } catch (error) {
          failures.push(`${job.viewport}/${job.storyId}: ${(error as Error).message}`);
        }
        if (++done % 25 === 0 || done === jobs.length) {
          console.log(`Captured ${done}/${jobs.length}`);
        }
      }
    }));
    if (failures.length > 0) {
      throw new Error(`Capture failed for ${failures.length} scenario(s):\n${failures.join("\n")}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

async function screenshot(
  browser: Browser,
  baseUrl: string,
  storyId: string,
  viewport: ViewportKey,
  targetDir: string
): Promise<void> {
  // Load the scenario twice: cells that differ between frames or between loads (ticking
  // timers, spinners, layout races) are recorded so comparisons can ignore them.
  const frames: Buffer[] = [];
  for (let load = 0; load < 2; load += 1) {
    frames.push(...await sampleFrames(browser, baseUrl, storyId, viewport));
  }
  await mkdir(join(targetDir, viewport), { recursive: true });
  await writeFile(join(targetDir, viewport, `${storyId}.png`), frames[frames.length - 1]!);
  const dynamic = await dynamicCells(frames);
  if (dynamic.size > 0) {
    await writeFile(
      join(targetDir, viewport, `${storyId}.dynamic.json`),
      JSON.stringify([...dynamic])
    );
  }
}

async function sampleFrames(
  browser: Browser,
  baseUrl: string,
  storyId: string,
  viewport: ViewportKey
): Promise<Buffer[]> {
  const { width, height } = LAB_DEVICE_VIEWPORTS[viewport];
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    viewport: { width, height }
  });
  try {
    const page = await context.newPage();
    const url = `${baseUrl}/iframe.html?id=${storyId}&viewMode=story&globals=viewport.value:${viewport}`;
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(
      () => {
        const preview = (window as unknown as {
          __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } };
        }).__STORYBOOK_PREVIEW__;
        const phase = preview?.currentRender?.phase;
        const body = document.body.classList;
        if (body.contains("sb-show-errordisplay") || phase === "errored" || phase === "aborted") {
          throw new Error(`story failed to render (${phase})`);
        }
        return body.contains("sb-show-main") && (phase === "played" || phase === "completed"
          || phase === "finished");
      },
      undefined,
      { timeout: 30_000 }
    );
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(options.settleMs);
    const frames: Buffer[] = [];
    for (let index = 0; index < options.frames; index += 1) {
      if (index > 0) await page.waitForTimeout(options.frameIntervalMs);
      frames.push(await page.screenshot({ animations: "disabled", caret: "hide" }));
    }
    return frames;
  } finally {
    await context.close();
  }
}

// Indices (row * columns + column) of grid cells that differ between any frame and the last.
async function dynamicCells(frames: Buffer[]): Promise<Set<number>> {
  const dirty = new Set<number>();
  if (frames.every((frame) => frame.equals(frames[0]!))) return dirty;

  const decoded = await Promise.all(frames.map((frame) =>
    sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  ));
  const last = decoded[decoded.length - 1]!;
  const { width, height } = last.info;
  const columns = Math.ceil(width / CELL_SIZE);
  const rows = Math.ceil(height / CELL_SIZE);
  const changed = new Uint8Array(columns * rows);
  for (const frame of decoded.slice(0, -1)) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        if (frame.data.compare(last.data, offset, offset + 4, offset, offset + 4) !== 0) {
          changed[Math.floor(y / CELL_SIZE) * columns + Math.floor(x / CELL_SIZE)] = 1;
        }
      }
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (!changed[row * columns + column]) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const r = row + dy;
          const c = column + dx;
          if (r >= 0 && r < rows && c >= 0 && c < columns) dirty.add(r * columns + c);
        }
      }
    }
  }
  return dirty;
}

function readDynamicCells(pngPath: string): number[] {
  const path = pngPath.replace(/\.png$/, ".dynamic.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as number[] : [];
}

// Counts pixels whose RGBA differs outside the ignored cells and writes a diff image:
// unchanged pixels are faded, changed pixels are red. A size mismatch counts as fully
// changed.
async function diffImages(
  baselinePath: string,
  currentPath: string,
  diffPath: string
): Promise<{ pixels: number; ignoredRatio: number; note?: string }> {
  const ignored = new Set([...readDynamicCells(baselinePath), ...readDynamicCells(currentPath)]);
  const [baseline, current] = await Promise.all([decode(baselinePath), decode(currentPath)]);
  if (baseline.info.width !== current.info.width || baseline.info.height !== current.info.height) {
    await mkdir(join(diffPath, ".."), { recursive: true });
    await sharp(currentPath).toFile(diffPath);
    return {
      pixels: Number.MAX_SAFE_INTEGER,
      ignoredRatio: 0,
      note: `size ${baseline.info.width}x${baseline.info.height} -> ${current.info.width}x${current.info.height}`
    };
  }

  const { width } = current.info;
  const columns = Math.ceil(width / CELL_SIZE);
  const out = Buffer.from(current.data);
  let pixels = 0;
  for (let offset = 0; offset < current.data.length; offset += 4) {
    const pixel = offset / 4;
    const cell = Math.floor(pixel / width / CELL_SIZE) * columns
      + Math.floor((pixel % width) / CELL_SIZE);
    let same = ignored.has(cell);
    for (let channel = 0; channel < 4 && !same; channel += 1) {
      if (Math.abs(baseline.data[offset + channel]! - current.data[offset + channel]!)
        > options.channelTolerance) {
        break;
      }
      same = channel === 3;
    }
    if (same) {
      for (let channel = 0; channel < 3; channel += 1) {
        out[offset + channel] = 255 - Math.round((255 - out[offset + channel]!) * 0.25);
      }
    } else {
      pixels += 1;
      out[offset] = 255;
      out[offset + 1] = 0;
      out[offset + 2] = 0;
      out[offset + 3] = 255;
    }
  }
  if (pixels > options.maxDiffPixels) {
    await mkdir(join(diffPath, ".."), { recursive: true });
    await sharp(out, { raw: { channels: 4, height: current.info.height, width: current.info.width } })
      .png()
      .toFile(diffPath);
  }
  return { pixels, ignoredRatio: ignored.size / (columns * Math.ceil(current.info.height / CELL_SIZE)) };
}

async function decode(path: string) {
  return sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function listPngs(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const viewport of await readdir(dir)) {
    for (const file of await readdir(join(dir, viewport))) {
      if (file.endsWith(".png")) files.push(`${viewport}/${file}`);
    }
  }
  return files;
}

function serve(root: string): Promise<{ url: string; close: () => void }> {
  const server: Server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const file = normalize(join(root, pathname));
    if (!file.startsWith(root + sep) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": mimeTypes[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolveServer({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

function git(args: string[]): void {
  run("git", args, repoRoot);
}

function run(command: string, args: string[], cwd: string): void {
  // tsx injects its loader through NODE_OPTIONS, which breaks Storybook's own preset loading.
  const { NODE_OPTIONS: _nodeOptions, ...env } = process.env;
  execFileSync(command, args, { cwd, env, stdio: "inherit" });
}

function parseArguments(argv: string[]) {
  const [modeArgument, ...rest] = argv;
  if (modeArgument !== "baseline" && modeArgument !== "compare") {
    console.error(
      "Usage: visual-regression <baseline|compare> [--ref <git-ref>] [--viewports a,b] "
      + "[--only <substring>] [--skip-build] [--concurrency N] [--out dir]"
    );
    process.exit(2);
  }

  const parsed = {
    channelTolerance: 0,
    concurrency: 6,
    maxDiffPixels: 0,
    only: undefined as string | undefined,
    out: undefined as string | undefined,
    ref: undefined as string | undefined,
    settleMs: 500,
    frames: 4,
    frameIntervalMs: 400,
    skipBuild: false,
    viewports: defaultViewports
  };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = (): string => {
      const next = rest[++index];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      return next;
    };
    switch (flag) {
      case "--ref": parsed.ref = value(); break;
      case "--viewports": parsed.viewports = value().split(",") as ViewportKey[]; break;
      case "--only": parsed.only = value(); break;
      case "--out": parsed.out = value(); break;
      case "--concurrency": parsed.concurrency = Number(value()); break;
      case "--channel-tolerance": parsed.channelTolerance = Number(value()); break;
      case "--max-diff-pixels": parsed.maxDiffPixels = Number(value()); break;
      case "--skip-build": parsed.skipBuild = true; break;
      default: throw new Error(`Unknown option ${flag}`);
    }
  }
  for (const viewport of parsed.viewports) {
    if (!(viewport in LAB_DEVICE_VIEWPORTS)) {
      throw new Error(`Unknown viewport ${viewport}. Use: ${Object.keys(LAB_DEVICE_VIEWPORTS).join(", ")}`);
    }
  }
  return { mode: modeArgument as Mode, options: parsed };
}
