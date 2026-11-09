import assert from "node:assert/strict";
import test from "node:test";

import {
  contentVersion,
  fingerprintStylesheetLinks,
} from "./lib/site-asset-fingerprint.mjs";

test("contentVersion changes with stylesheet content", () => {
  assert.match(contentVersion("a {}"), /^[0-9a-f]{12}$/);
  assert.equal(contentVersion("a {}"), contentVersion("a {}"));
  assert.notEqual(contentVersion("a {}"), contentVersion("b {}"));
});

test("fingerprintStylesheetLinks versions every styles.css link", () => {
  const html = [
    '<link rel="stylesheet" href="./styles.css">',
    '<link rel="stylesheet" href="../styles.css">',
    '<link rel="stylesheet" href="/chessticize-mobile/styles.css">',
    '<link rel="icon" href="./assets/app-icon-192.png">',
    '<a href="./styles.css">raw</a>',
  ].join("\n");

  assert.equal(
    fingerprintStylesheetLinks(html, "abc123"),
    [
      '<link rel="stylesheet" href="./styles.css?v=abc123">',
      '<link rel="stylesheet" href="../styles.css?v=abc123">',
      '<link rel="stylesheet" href="/chessticize-mobile/styles.css?v=abc123">',
      '<link rel="icon" href="./assets/app-icon-192.png">',
      '<a href="./styles.css">raw</a>',
    ].join("\n"),
  );
});
