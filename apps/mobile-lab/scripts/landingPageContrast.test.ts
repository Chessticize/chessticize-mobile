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
    assert.equal(
      channels.length,
      3,
      `Expected three rgb channels, received ${color}`
    );
    const [red, green, blue] = channels.map((channel) => {
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

test("landing visuals, anchors, and migration disclosure reflow in a real browser", async () => {
  const server = await serve(siteRoot);
  let browser: Browser | undefined;
  try {
    browser = await launchBrowser();
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 820, height: 1180 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 320, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        ),
        true,
        `${viewport.width}px landing page must not overflow horizontally`
      );
      const images = page.locator('img[src*="assets/screenshots/"]');
      for (let index = 0; index < (await images.count()); index += 1) {
        await images.nth(index).scrollIntoViewIfNeeded();
        await page.waitForFunction((currentIndex) => {
          const image = document.querySelectorAll(
            'img[src*="assets/screenshots/"]'
          )[currentIndex] as HTMLImageElement | undefined;
          return Boolean(
            image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0
          );
        }, index);
      }
      for (const href of ["#review", "#practice", "#privacy"]) {
        assert.equal(await page.locator(`a[href="${href}"]`).count(), 1);
      }
      await page.close();
    }

    const page = await browser.newPage({
      viewport: { width: 390, height: 620 },
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
    const notice = page.locator("details.notice");
    assert.equal(
      await notice.getAttribute("open"),
      null,
      "notice starts collapsed"
    );
    await page.locator("details.notice summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await notice.getAttribute("open"),
      "",
      "keyboard opens the notice"
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      ),
      true,
      "expanded notice must reflow without horizontal overflow"
    );
    assert.equal(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).scrollBehavior
      ),
      "auto",
      "reduced motion disables smooth scrolling"
    );
    await page.close();

    const textZoom = await browser.newPage({
      viewport: { width: 320, height: 844 },
    });
    await textZoom.goto(`${server.url}/index.html`, {
      waitUntil: "networkidle",
    });
    await textZoom.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    assert.equal(
      await textZoom.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      ),
      true,
      "320px page must reflow at 200% text size"
    );
    const brand = await textZoom.locator("header .brand").boundingBox();
    const source = await textZoom.locator("header .nav-source").boundingBox();
    assert.ok(brand && source);
    assert.ok(
      brand.x + brand.width <= source.x ||
        source.x + source.width <= brand.x ||
        brand.y + brand.height <= source.y ||
        source.y + source.height <= brand.y,
      "brand and Source must not overlap at 200% text size"
    );
    await textZoom.close();
  } finally {
    await browser?.close();
    server.close();
  }
});
