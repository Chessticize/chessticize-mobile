import type TestRenderer from "react-test-renderer";

export function flattenTestStyle(style: unknown): Record<string, unknown> {
  if (!style) {
    return {};
  }
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (merged, entry) => Object.assign(merged, flattenTestStyle(entry)),
      {}
    );
  }
  return typeof style === "object" ? { ...(style as Record<string, unknown>) } : {};
}

export function expectNoRenderedTextHasNonPositiveFontSize(
  renderer: TestRenderer.ReactTestRenderer
): void {
  for (const node of renderer.root.findAll((candidate) => String(candidate.type) === "Text")) {
    const fontSize = flattenTestStyle(node.props.style).fontSize;
    if (typeof fontSize === "number") {
      expect(fontSize).toBeGreaterThan(0);
    }
  }
}
