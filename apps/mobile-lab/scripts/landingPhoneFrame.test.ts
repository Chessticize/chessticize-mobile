import assert from "node:assert/strict";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { webkit } from "playwright-core";
import { launchBrowser, serve } from "./labBrowser.ts";

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../site");
const engine = process.env.CHESSTICIZE_LANDING_WEBKIT === "1" ? "WebKit" : "Chrome";

test(`${engine}: iPhone screens preserve a continuous bezel at all four corners`, async () => {
  const server = await serve(siteRoot);
  const browser = engine === "WebKit" ? await webkit.launch() : await launchBrowser();
  try {
    for (const width of [390, 768, 1440]) {
      const page = await browser.newPage({
        viewport: { width, height: 956 },
        deviceScaleFactor: 2,
      });
      await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
      // These light captures expose screen pixels painting over the black bezel.
      for (const phone of await page.locator(".phone-frame").filter({
        has: page.locator('img:not([src*="dark-arrow-duel"])'),
      }).all()) {
        await phone.scrollIntoViewIfNeeded();
        const geometry = await phone.evaluate((element) => {
          const style = getComputedStyle(element);
          const { width, height } = element.getBoundingClientRect();
          const [x = "0", y = x] = style.borderTopLeftRadius.split(" ");
          return {
            width, height,
            rx: parseFloat(x) * (x.endsWith("%") ? width / 100 : 1),
            ry: parseFloat(y) * (y.endsWith("%") ? height / 100 : 1),
            border: parseFloat(style.borderTopWidth),
          };
        });
        const { data, info } = await sharp(await phone.screenshot()).raw()
          .toBuffer({ resolveWithObject: true });
        // Sample the middle of the bezel on each 45-degree corner, away from
        // antialiasing. Screen pixels here mean the inner curve overlaps it.
        const x = geometry.rx - (geometry.rx - geometry.border / 2) * Math.SQRT1_2;
        const y = geometry.ry - (geometry.ry - geometry.border / 2) * Math.SQRT1_2;
        for (const [right, bottom] of [[false, false], [true, false], [false, true], [true, true]]) {
          const px = Math.round((right ? geometry.width - x : x) * info.width / geometry.width);
          const py = Math.round((bottom ? geometry.height - y : y) * info.height / geometry.height);
          // A locator crop can start on a fractional CSS pixel. Allow one
          // physical pixel of alignment error while requiring the dark stroke.
          let hasBezel = false;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const offset = ((py + dy) * info.width + px + dx) * info.channels;
              hasBezel ||= [...data.subarray(offset, offset + 3)].every(channel => channel < 35);
            }
          }
          assert.ok(hasBezel,
            `${width}px ${right ? "right" : "left"} ${bottom ? "bottom" : "top"} bezel must stay black`,
          );
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});
