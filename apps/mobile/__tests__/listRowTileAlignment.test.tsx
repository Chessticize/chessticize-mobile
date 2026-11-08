import React from "react";
import { StyleSheet, Text } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import { ListRow } from "../src/components/ui/ListRow";

function renderRow(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer!;
}

// The host View that draws the tile: the row's first host child.
function tileStyle(renderer: TestRenderer.ReactTestRenderer, rowTestID: string) {
  const row = renderer.root.findAll((node) => typeof node.type === "string" && node.props.testID === rowTestID)[0];
  const nearestHostParent = (node: TestRenderer.ReactTestInstance): TestRenderer.ReactTestInstance | null => {
    let parent: TestRenderer.ReactTestInstance | null = node.parent;
    while (parent && typeof parent.type !== "string") {
      parent = parent.parent;
    }
    return parent;
  };
  const hostChildren = row.findAll((node) => typeof node.type === "string" && nearestHostParent(node) === row);
  return StyleSheet.flatten(hostChildren[0].props.style) ?? {};
}

function rowStyle(renderer: TestRenderer.ReactTestRenderer, rowTestID: string) {
  const row = renderer.root.findAll((node) => typeof node.type === "string" && node.props.testID === rowTestID)[0];
  const style = typeof row.props.style === "function" ? row.props.style({ pressed: false }) : row.props.style;
  return StyleSheet.flatten(style) ?? {};
}

describe("ListRow leading tile alignment", () => {
  it("sits level with the first line when the row has a subtitle", () => {
    const renderer = renderRow(
      <ListRow icon="survival" subtitle="See how far you can go." testID="row" title="Survival Challenge" onPress={() => undefined} />
    );
    expect(tileStyle(renderer, "row").alignSelf).toBe("flex-start");
    // Trailing content and the chevron stay centered on the row.
    expect(rowStyle(renderer, "row").alignItems).toBe("center");
  });

  it("stays centered in a single-line row", () => {
    const renderer = renderRow(
      <ListRow icon="survival" testID="row" title="Survival Challenge" trailing={<Text>Go</Text>} />
    );
    expect(tileStyle(renderer, "row").alignSelf).toBeUndefined();
    expect(rowStyle(renderer, "row").alignItems).toBe("center");
  });
});
