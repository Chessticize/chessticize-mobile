import React from "react";
import { StyleSheet, Text } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import { Section } from "../src/components/ui/Section";

describe("Section rows", () => {
  it("draws exactly one full-bleed hairline between rows", () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Section rows testID="section">
          <Text>One</Text>
          <Text>Two</Text>
          <Text>Three</Text>
        </Section>
      );
    });

    const separators = renderer!.root.findAll((node) => {
      if (typeof node.type !== "string") {
        return false;
      }
      const style = StyleSheet.flatten(node.props.style) ?? {};
      return style.height === StyleSheet.hairlineWidth;
    });

    expect(separators).toHaveLength(2);
    for (const separator of separators) {
      const style = StyleSheet.flatten(separator.props.style);
      expect(style.marginLeft ?? 0).toBe(0);
      expect(style.marginRight ?? 0).toBe(0);
    }
  });
});
