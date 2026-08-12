import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LabDeviceStatusBar } from "./LabDeviceStatusBar.tsx";

test("the Lab fills a portrait phone Safe Area with recognizable system chrome", () => {
  const html = renderToStaticMarkup(<LabDeviceStatusBar height={59} width={430} />);

  assert.match(html, /data-testid="lab-device-status-bar"/);
  assert.match(html, /style="height:59px"/);
  assert.match(html, /data-testid="lab-device-dynamic-island"/);
  assert.match(html, />9:41</);
});

test("landscape devices with no top inset do not invent a status bar", () => {
  assert.equal(renderToStaticMarkup(<LabDeviceStatusBar height={0} width={874} />), "");
});

test("tablet Safe Areas use compact chrome without a phone island", () => {
  const html = renderToStaticMarkup(<LabDeviceStatusBar height={24} width={820} />);

  assert.match(html, /lab-device-status-bar--compact/);
  assert.doesNotMatch(html, /lab-device-dynamic-island/);
});
