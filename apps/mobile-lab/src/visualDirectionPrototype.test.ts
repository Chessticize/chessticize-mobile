import assert from "node:assert/strict";
import test from "node:test";
import {
  GROUPED_NATIVE,
  MIN_TARGET,
  SPACING_SCALE,
  contrastChecks
} from "./visualDirection/directions.ts";
import { LUCIDE_ICONS } from "./visualDirection/lucideIcons.ts";

for (const appearance of ["light", "dark"] as const) {
  test(`Grouped Native ${appearance} keeps text roles at WCAG AA`, () => {
    const failures = contrastChecks(GROUPED_NATIVE.colors[appearance])
      .filter((check) => check.ratio < 4.5)
      .map((check) => `${check.pair}: ${check.ratio.toFixed(2)}`);
    assert.deepEqual(failures, []);
  });
}

test("Grouped Native matches the values recorded in MOBILE_UI_DESIGN.md", () => {
  assert.deepEqual(GROUPED_NATIVE.radius, { control: 12, card: 20, sheet: 34, badge: 999 });
  assert.deepEqual(GROUPED_NATIVE.spacing, { screen: 16, section: 32, group: 8, row: 12, inline: 8 });
  assert.equal(GROUPED_NATIVE.rowMinHeight, 52);
  assert.deepEqual(
    Object.fromEntries(Object.entries(GROUPED_NATIVE.type).map(([role, style]) => [role, [style.size, style.lineHeight, style.weight]])),
    {
      largeTitle: [34, 41, "700"],
      title: [22, 28, "700"],
      headline: [17, 22, "600"],
      body: [17, 22, "400"],
      subheadline: [15, 20, "400"],
      footnote: [13, 18, "400"],
      caption: [12, 16, "400"],
      numeralXL: [34, 41, "600"],
      numeralL: [22, 28, "600"]
    }
  );
});

test("Grouped Native stays on the 4-pt grid with 44-pt targets", () => {
  for (const value of Object.values(GROUPED_NATIVE.spacing)) {
    assert.ok((SPACING_SCALE as readonly number[]).includes(value), `spacing ${value}`);
  }
  assert.ok(GROUPED_NATIVE.rowMinHeight >= MIN_TARGET);
});

test("the Lab icon sample uses only simple SVG primitives", () => {
  for (const [name, nodes] of Object.entries(LUCIDE_ICONS)) {
    assert.ok(nodes.length > 0, name);
    for (const [tag] of nodes) {
      assert.ok(["path", "circle", "rect", "line", "polyline"].includes(tag), `${name} uses ${tag}`);
    }
  }
});
