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
        if (route.includes("android")) {
          const kicker = await page.locator(".button-kicker").boundingBox();
          const label = await page.locator(".button-kicker + strong").boundingBox();
          assert.ok(kicker && label);
          assert.ok(
            kicker.y + kicker.height <= label.y,
            `Android ${colorScheme} download label must stay below its kicker`
          );
        }
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
    const action = page.getByRole("link", {
      name: "Open the web app",
      exact: true,
    });
    assert.equal(
      await action.isVisible(),
      true,
      "web app button is visible while the update is collapsed"
    );
    const colors = await action
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
        await page.locator(".online-notice > p a").isVisible(),
        true,
        "online play must be reachable without opening the update"
      );
      assert.equal(
        await page.locator(".notice-body").isVisible(),
        false,
        "the full update starts collapsed"
      );
      assert.equal(
        await page
          .getByRole("link", { name: "Open the web app", exact: true })
          .isVisible(),
        true,
        "web app button must remain visible outside the disclosure"
      );
      if (viewport.width >= 1024) {
        const notice = await page.locator(".online-notice").boundingBox();
        const phones = await page.locator(".hero-phones").boundingBox();
        assert.ok(notice && phones);
        assert.ok(
          phones.y - (notice.y + notice.height) <= 72,
          "desktop hero must follow the notice without a large empty band"
        );
      }
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
      const phones = page.locator(".phone-frame");
      assert.equal(await phones.count(), 5, "all iPhone captures share the device frame");
      for (const phone of await phones.all()) {
        const hardware = await phone.evaluate((element) => {
          const island = getComputedStyle(element, "::before");
          const image = element.querySelector("img")!;
          return {
            content: island.content,
            color: island.backgroundColor,
            width: parseFloat(island.width) / image.clientWidth,
            bottom: (parseFloat(island.top) + parseFloat(island.height)) / image.clientHeight,
          };
        });
        assert.equal(hardware.content, '""');
        assert.equal(hardware.color, "rgb(0, 0, 0)");
        assert.ok(hardware.width > 0.27 && hardware.width < 0.30,
          "Dynamic Island scales with the screen width");
        assert.ok(hardware.bottom < 0.04,
          "Dynamic Island stays in the status-bar safe area");
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
