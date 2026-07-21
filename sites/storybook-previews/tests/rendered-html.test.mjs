import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const siteRoot = new URL("../", import.meta.url);

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(pathname, "https://previews.example"), {
      headers: { accept: "text/html", "x-forwarded-proto": "https" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the complete feedback design index", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Chessticize Feedback Design Lab<\/title>/i);
  assert.match(html, /Review the interaction before we wire the product/);
  assert.match(html, /Personalized training/);
  assert.match(html, /Truthful sprint outcomes/);
  assert.match(html, /Move response contract/);
  assert.match(html, /Feedback entry/);
  assert.match(html, /No product wiring has started/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/);
});

test("manifest pins every preview to an exact branch and commit", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("preview-manifest.json", siteRoot), "utf8"),
  );
  assert.equal(manifest.previews.length, 4);
  assert.equal(new Set(manifest.previews.map(({ id }) => id)).size, 4);

  for (const preview of manifest.previews) {
    assert.match(preview.id, /^[a-z][a-z0-9-]+$/);
    assert.match(preview.branch, /^codex\/storybook-[a-z0-9-]+$/);
    assert.match(preview.commit, /^[0-9a-f]{40}$/);
    assert.match(preview.storyPath, /^iframe\.html\?id=/);
    assert.ok(preview.issues.length > 0);
    assert.ok(preview.variants.length >= 2);
  }
});
