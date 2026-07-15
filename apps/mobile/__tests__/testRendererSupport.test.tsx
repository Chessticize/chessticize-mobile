import type TestRenderer from "react-test-renderer";
import {
  expectNoRenderedTextHasNonPositiveFontSize,
  flattenTestStyle
} from "../test-support/testRendererSupport";

function rendererWithTextStyles(...styles: unknown[]): TestRenderer.ReactTestRenderer {
  return {
    root: {
      findAll: () => styles.map((style) => ({
        props: { style },
        type: "Text"
      }))
    }
  } as unknown as TestRenderer.ReactTestRenderer;
}

describe("shared renderer test support", () => {
  it("flattens nested style arrays in React Native override order", () => {
    expect(flattenTestStyle([
      { color: "red", fontSize: 12 },
      false,
      [{ color: "blue" }, { fontWeight: "700" }]
    ])).toEqual({
      color: "blue",
      fontSize: 12,
      fontWeight: "700"
    });
  });

  it("accepts positive and nonnumeric rendered Text font sizes", () => {
    expect(() => expectNoRenderedTextHasNonPositiveFontSize(rendererWithTextStyles(
      [{ fontSize: 12 }, { fontSize: 14 }],
      { fontSize: "body" },
      undefined
    ))).not.toThrow();
  });

  it("rejects a rendered Text style whose flattened font size is non-positive", () => {
    expect(() => expectNoRenderedTextHasNonPositiveFontSize(rendererWithTextStyles(
      [{ fontSize: 12 }, [{ fontSize: 0 }]]
    ))).toThrow();
  });
});
