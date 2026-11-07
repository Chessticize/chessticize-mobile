import { fileURLToPath } from "node:url";
import type { Browser } from "playwright-core";
import {
  launchBrowser,
  readIndexedStoryIds,
  registryStoryIds,
  serve,
  storyUrl,
  waitForStoryRender
} from "./labBrowser.ts";

// Headless render smoke: loads every registered product-clone scenario once from the built
// storybook-static and fails, naming the scenario, when it throws while rendering or when its
// `play` assertions fail. Pixel comparison lives in visual-regression.ts and is not a CI gate.
// Usage: render-smoke [--concurrency N] [--only <story-id substring>] [--static-dir dir]

const staticDir = fileURLToPath(new URL("../storybook-static", import.meta.url));
const VIEWPORT = { width: 402, height: 874 };
const SETTLE_MS = 300;

// Scenarios whose play assertions are known to be stale and are being rewritten elsewhere.
// They are reported as warnings instead of failures. Remove an entry when its work lands.
const KNOWN_STALE_PLAY: Record<string, string> = {};

// Console noise that is not a render failure: a missing favicon or other static asset.
const BENIGN_CONSOLE_ERROR = /Failed to load resource/;

const options = parseArguments(process.argv.slice(2));
const started = Date.now();

const indexed = readIndexedStoryIds(options.staticDir);
const registered = registryStoryIds().filter((storyId) =>
  options.only === undefined || storyId.includes(options.only)
);
const failures = new Map<string, string[]>();
const playFailures = new Map<string, string>();
const fail = (storyId: string, reason: string): void => {
  const line = reason.replace(/^page\.waitForFunction: (Error: )?/, "").split("\n")[0]!;
  const known = failures.get(storyId) ?? [];
  if (!known.includes(line)) failures.set(storyId, [...known, line]);
};

const storyIds = registered.filter((storyId) => {
  if (indexed.has(storyId)) return true;
  fail(storyId, "not in the Storybook index (missing or renamed story export)");
  return false;
});

const server = await serve(options.staticDir);
const browser = await launchBrowser();
try {
  let next = 0;
  await Promise.all(Array.from({ length: options.concurrency }, async () => {
    while (next < storyIds.length) {
      const storyId = storyIds[next++]!;
      const result = await renderOnce(browser, server.url, storyId);
      for (const reason of result.problems) fail(storyId, reason);
      if (result.playFailure !== undefined) playFailures.set(storyId, result.playFailure);
    }
  }));
} finally {
  await browser.close();
  server.close();
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
for (const storyId of Object.keys(KNOWN_STALE_PLAY)) {
  if (registered.includes(storyId) && indexed.has(storyId) && !playFailures.has(storyId)) {
    console.warn(`Note: ${storyId} now passes its play function; remove it from KNOWN_STALE_PLAY.`);
  }
}
const knownStale = [...playFailures].filter(([storyId]) => storyId in KNOWN_STALE_PLAY);
for (const [storyId, message] of playFailures) {
  if (!(storyId in KNOWN_STALE_PLAY)) fail(storyId, `play function failed: ${message}`);
}
if (knownStale.length > 0) {
  console.warn(`\nWarning: ${knownStale.length} scenario(s) have a known-stale play function (not gated):`);
  for (const [storyId, message] of knownStale.sort(([a], [b]) => a.localeCompare(b))) {
    console.warn(`  ${storyId} (${KNOWN_STALE_PLAY[storyId]}): ${message.split("\n")[0]}`);
  }
}
if (failures.size > 0) {
  console.error(`\nRender smoke FAILED: ${failures.size} of ${registered.length} scenario(s) failed.`);
  for (const [storyId, reasons] of [...failures].sort(([a], [b]) => a.localeCompare(b))) {
    console.error(`  ${storyId}`);
    for (const reason of reasons) console.error(`    ${reason}`);
  }
  console.error(`(${seconds}s)`);
  process.exit(1);
}
console.log(`Render smoke passed: ${registered.length} scenarios rendered and passed their play functions (${seconds}s).`);

async function renderOnce(
  browser: Browser,
  baseUrl: string,
  storyId: string
): Promise<{ problems: string[]; playFailure?: string }> {
  const problems: string[] = [];
  const consoleErrors: string[] = [];
  let playFailure: string | undefined;
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: VIEWPORT });
  try {
    const page = await context.newPage();
    page.on("pageerror", (error) => problems.push(`uncaught page error: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error" && !BENIGN_CONSOLE_ERROR.test(message.text())) {
        consoleErrors.push(message.text());
      }
    });
    // Storybook reports render exceptions and play-function failures as separate channel events.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __smokeEvents: { name: string; message: string }[];
        __STORYBOOK_ADDONS_CHANNEL__?: { on(event: string, listener: (payload: unknown) => void): void };
      };
      w.__smokeEvents = [];
      const timer = setInterval(() => {
        const channel = w.__STORYBOOK_ADDONS_CHANNEL__;
        if (channel === undefined) return;
        clearInterval(timer);
        for (const name of ["storyThrewException", "storyErrored", "storyMissing", "playFunctionThrewException"]) {
          channel.on(name, (payload) => {
            const message = (payload as { message?: string } | null)?.message ?? String(payload);
            w.__smokeEvents.push({ name, message });
          });
        }
      }, 1);
    });
    await page.goto(storyUrl(baseUrl, storyId, "phonePortrait"), { waitUntil: "load" });
    await waitForStoryRender(page);
    // Errors raised by effects just after the first render still count.
    await page.waitForTimeout(SETTLE_MS);
    if (await page.evaluate(() => document.body.classList.contains("sb-show-errordisplay"))) {
      const message = await page.evaluate(() =>
        document.querySelector(".sb-errordisplay_main, #error-message")?.textContent?.trim() ?? ""
      );
      problems.push(`Storybook error overlay${message ? `: ${message}` : ""}`);
    }
    const events = await page.evaluate(() =>
      (window as unknown as { __smokeEvents: { name: string; message: string }[] }).__smokeEvents
    );
    for (const { name, message } of events) {
      if (name === "playFunctionThrewException") playFailure = message;
      else problems.push(`${name}: ${message}`);
    }
  } catch (error) {
    problems.push((error as Error).message);
  } finally {
    await context.close();
  }
  for (const text of consoleErrors) {
    // Storybook also logs a play-function failure to the console; it is reported above.
    const isPlayFailure = playFailure !== undefined && playFailure.split("\n")[0] !== ""
      && text.includes(playFailure.split("\n")[0]!);
    if (!isPlayFailure) problems.push(`console.error: ${text}`);
  }
  return { problems, ...(playFailure === undefined ? {} : { playFailure }) };
}

function parseArguments(argv: string[]) {
  const parsed = {
    concurrency: 4,
    only: undefined as string | undefined,
    staticDir
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = (): string => {
      const next = argv[++index];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      return next;
    };
    switch (flag) {
      case "--concurrency": parsed.concurrency = Number(value()); break;
      case "--only": parsed.only = value(); break;
      case "--static-dir": parsed.staticDir = value(); break;
      default: throw new Error(`Unknown option ${flag}`);
    }
  }
  return parsed;
}
