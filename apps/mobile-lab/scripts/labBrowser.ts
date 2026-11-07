import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { scenarioRegistry } from "../src/scenarioRegistry.ts";

// Headless loader shared by the visual-regression tool and the render smoke: serves a built
// storybook-static, launches Chromium and waits for one story to finish rendering.

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

export function serve(root: string): Promise<{ url: string; close: () => void }> {
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

// Prefer Playwright's own Chromium; fall back to the installed Google Chrome. Visual baseline
// and comparison must run on the same browser build.
export async function launchBrowser(): Promise<Browser> {
  const bundledBrowser = existsSync(chromium.executablePath());
  if (!bundledBrowser) {
    console.log("Playwright Chromium is not installed; using Google Chrome. "
      + "Install it with `pnpm exec playwright-core install chromium-headless-shell`.");
  }
  return chromium.launch(bundledBrowser ? {} : { channel: "chrome" });
}

export function readIndexedStoryIds(staticDir: string): Set<string> {
  const indexPath = join(staticDir, "index.json");
  if (!existsSync(indexPath)) throw new Error(`No Storybook build at ${staticDir}.`);
  return new Set(
    Object.keys(
      (JSON.parse(readFileSync(indexPath, "utf8")) as { entries: Record<string, unknown> }).entries
    )
  );
}

export function registryStoryIds(): string[] {
  return Object.values(scenarioRegistry).map((scenario) => scenario.storyId);
}

export function storyUrl(
  baseUrl: string,
  storyId: string,
  viewport: string,
  theme: "light" | "dark" = "light"
): string {
  return `${baseUrl}/iframe.html?id=${storyId}&viewMode=story&globals=viewport.value:${viewport}`
    + (theme === "dark" ? ";theme:dark" : "");
}

// Resolves once the story has rendered; throws when Storybook reports a render failure.
export async function waitForStoryRender(page: Page, timeout = 30_000): Promise<void> {
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
    { timeout }
  );
}
