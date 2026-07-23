import React, { useState } from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  MoveFeedbackSettingsSection,
  type MoveFeedbackPreferences,
  type MoveFeedbackPreviewer
} from "../src/components/MoveFeedbackSettingsSection";

describe("MoveFeedbackSettingsSection", () => {
  it("keeps sound and haptics independently controllable and previews the current choices", async () => {
    const onPreview = jest.fn<ReturnType<MoveFeedbackPreviewer>, Parameters<MoveFeedbackPreviewer>>(
      async () => ({ haptics: "off", sound: "off" })
    );
    const renderer = renderHarness(onPreview);

    expect(find(renderer, "settings-move-sound-toggle").props.accessibilityState).toEqual({
      checked: true
    });
    expect(find(renderer, "settings-move-haptics-toggle").props.accessibilityState).toEqual({
      checked: true
    });

    press(renderer, "settings-move-sound-toggle");
    expect(find(renderer, "settings-move-sound-toggle").props.accessibilityState).toEqual({
      checked: false
    });
    expect(text(find(renderer, "settings-move-feedback-preview-status"))).toBe("Sound effects off");

    press(renderer, "settings-move-haptics-toggle");
    expect(find(renderer, "settings-move-haptics-toggle").props.accessibilityState).toEqual({
      checked: false
    });
    expect(text(find(renderer, "settings-move-feedback-preview-status"))).toBe("Haptic feedback off");

    await pressAsync(renderer, "settings-move-feedback-preview-move");

    expect(onPreview).toHaveBeenCalledWith("move", {
      hapticsEnabled: false,
      soundEnabled: false
    });
    expect(text(find(renderer, "settings-move-feedback-preview-status")))
      .toBe("Move preview: sound off; haptics off.");
  });

  it("explains the browser-only haptic fallback without claiming native parity", async () => {
    const onPreview = jest.fn<ReturnType<MoveFeedbackPreviewer>, Parameters<MoveFeedbackPreviewer>>(
      async () => ({ haptics: "visual-only", sound: "played" })
    );
    const renderer = renderHarness(onPreview);

    await pressAsync(renderer, "settings-move-feedback-preview-capture");

    expect(text(find(renderer, "settings-move-feedback-preview-status")))
      .toBe("Capture preview: browser sound requested; haptics require the native app.");
    expect(text(find(renderer, "settings-move-feedback-previews"))).toContain(
      "Web demo only"
    );
    expect(text(find(renderer, "settings-move-feedback-section"))).toContain(
      "Brief board sounds for moves and captures."
    );
    expect(text(find(renderer, "settings-move-feedback-section"))).toContain(
      "Light touch feedback for moves and captures."
    );
    expect(text(find(renderer, "settings-move-feedback-section"))).not.toContain(
      "puzzle results"
    );
    expect(text(find(renderer, "settings-move-feedback-section"))).not.toContain(
      "success, and mistakes"
    );
    expect(find(renderer, "settings-move-feedback-preview-move")).toBeTruthy();
    expect(find(renderer, "settings-move-feedback-preview-capture")).toBeTruthy();
    expect(() => find(renderer, "settings-move-feedback-preview-success")).toThrow();
    expect(() => find(renderer, "settings-move-feedback-preview-mistake")).toThrow();
    expect(() => find(renderer, "settings-move-feedback-device-note")).toThrow();
  });
});

function renderHarness(
  onPreview: MoveFeedbackPreviewer
): TestRenderer.ReactTestRenderer {
  function Harness(): React.JSX.Element {
    const [preferences, setPreferences] = useState<MoveFeedbackPreferences>({
      hapticsEnabled: true,
      soundEnabled: true
    });
    return (
      <MoveFeedbackSettingsSection
        preferences={preferences}
        onPreferencesChange={setPreferences}
        onPreview={onPreview}
      />
    );
  }

  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(<Harness />);
  });
  if (!renderer) {
    throw new Error("MoveFeedbackSettingsSection did not render");
  }
  return renderer;
}

function find(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string
): TestRenderer.ReactTestInstance {
  return renderer.root.findByProps({ testID });
}

function press(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string
): void {
  act(() => {
    find(renderer, testID).props.onPress();
  });
}

async function pressAsync(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string
): Promise<void> {
  await act(async () => {
    find(renderer, testID).props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function text(node: TestRenderer.ReactTestInstance | string): string {
  if (typeof node === "string") {
    return node;
  }
  return node.children.map((child) => text(child)).join("");
}
