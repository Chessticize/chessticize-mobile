import assert from "node:assert/strict";
import test from "node:test";
import { buildPracticeAdaptiveLayout } from "../../mobile/src/components/adaptivePracticeLayout.ts";
import {
  LAB_DEVICE_VIEWPORTS,
  labSafeAreaMetricsForViewport
} from "./labDeviceFrame.ts";

test("the maintained phone viewports match the iPhone 17 Release simulator", () => {
  assert.deepEqual(LAB_DEVICE_VIEWPORTS.phonePortrait, {
    width: 402,
    height: 874,
    insets: { top: 62, right: 0, bottom: 34, left: 0 }
  });
  assert.deepEqual(LAB_DEVICE_VIEWPORTS.phoneLandscape, {
    width: 874,
    height: 402,
    insets: { top: 0, right: 62, bottom: 21, left: 62 }
  });
});

test("the safe-area provider receives the matching frame for each maintained phone orientation", () => {
  assert.deepEqual(labSafeAreaMetricsForViewport(402, 874), {
    frame: { x: 0, y: 0, width: 402, height: 874 },
    insets: { top: 62, right: 0, bottom: 34, left: 0 }
  });
  assert.deepEqual(labSafeAreaMetricsForViewport(874, 402), {
    frame: { x: 0, y: 0, width: 874, height: 402 },
    insets: { top: 0, right: 62, bottom: 21, left: 62 }
  });
});

test("the calibrated landscape frame produces the Release board and control-rail geometry", () => {
  const viewport = LAB_DEVICE_VIEWPORTS.phoneLandscape;
  const layout = buildPracticeAdaptiveLayout({
    fontScale: 1,
    height: viewport.height,
    insets: viewport.insets,
    width: viewport.width
  });

  assert.equal(layout.className, "compactLandscape");
  assert.equal(layout.boardSize, 349);
  assert.equal(layout.sessionRailWidth, 255);
  assert.equal(layout.sessionRailGap, 90);
});

test("non-device desktop viewports do not invent phone Safe Area insets", () => {
  assert.deepEqual(labSafeAreaMetricsForViewport(1180, 820), {
    frame: { x: 0, y: 0, width: 1180, height: 820 },
    insets: { top: 0, right: 0, bottom: 0, left: 0 }
  });
});
