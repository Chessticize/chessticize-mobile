import assert from "node:assert/strict";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright-core";
import { launchBrowser, serve } from "./labBrowser.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const siteRoot = join(repoRoot, "site");
const routes = [
  "/index.html",
  "/support/index.html",
  "/accessibility/index.html",
  "/android/index.template.html",
];

type Colors = { color: string; background: string };

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const channels = color
      .match(/\d+(?:\.\d+)?/g)
      ?.slice(0, 3)
      .map(Number);
    assert.ok(channels, `Expected an rgb color, received ${color}`);
    assert.equal(channels.length, 3, `Expected three rgb channels, received ${color}`);
    const [red, green, blue] = channels
      .map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

async function colorsFor(page: Page): Promise<Colors> {
  return page.locator(".skip-link").evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.color, background: style.backgroundColor };
  });
}

test("landing notice action and focused skip links have readable rendered contrast", async () => {
  const server = await serve(siteRoot);
  let browser: Browser | undefined;
  try {
    browser = await launchBrowser();
    for (const route of routes) {
      for (const colorScheme of ["light", "dark"] as const) {
        const page = await browser.newPage();
        await page.emulateMedia({ colorScheme });
        await page.goto(`${server.url}${route}`, { waitUntil: "networkidle" });
        await page.locator(".skip-link").focus();
        const colors = await colorsFor(page);
        assert.ok(
          contrastRatio(colors.color, colors.background) >= 4.5,
          `${route} ${colorScheme} focused skip link must meet 4.5:1 contrast`
        );
        await page.close();
      }
    }

    const page = await browser.newPage();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
    const colors = await page
      .locator(".notice .button-primary")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { color: style.color, background: style.backgroundColor };
      });
    assert.ok(
      contrastRatio(colors.color, colors.background) >= 4.5,
      "dark notice action must meet 4.5:1 contrast"
    );
    await page.close();
  } finally {
    await browser?.close();
    server.close();
  }
});
